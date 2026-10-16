import { Worker, Job } from 'bullmq';
import { config } from './config';
import { prisma, connectPrisma } from './db/prisma';
import { redisClient } from './db/redis';
import { EMAIL_QUEUE_NAME, emailQueue, EmailJobData } from './queue/emailQueue';
import { RateLimiterService } from './services/rateLimiter';
import { MailerService } from './services/mailer';
import { SlackService } from './services/slackService';
import { ElasticsearchService } from './services/elasticsearch';
import { SchedulerService } from './services/schedulerService';

console.log(`[Worker] Starting ReachInbox Email Worker with concurrency=${config.WORKER_CONCURRENCY}...`);

export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const { emailJobId, senderId, recipientEmail, subject, body, minDelayMs, hourlyLimit } = job.data;

    console.log(`[Worker] Processing Job ${job.id} for EmailJob ${emailJobId} -> ${recipientEmail}`);

    // 1. Fetch EmailJob record from database
    const emailJob = await prisma.emailJob.findUnique({
      where: { id: emailJobId },
      include: {
        sender: true,
        campaign: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!emailJob) {
      console.warn(`[Worker] EmailJob ${emailJobId} not found in database. Skipping.`);
      return { skipped: true, reason: 'NOT_FOUND' };
    }

    // Idempotency check: if already sent, do not send again
    if (emailJob.status === 'SENT') {
      console.log(`[Worker] EmailJob ${emailJobId} is already marked as SENT. Skipping duplicate execution.`);
      return { skipped: true, reason: 'ALREADY_SENT' };
    }

    const sender = emailJob.sender;
    if (!sender || !sender.active) {
      const errorMsg = `Sender ${senderId} is not active or does not exist`;
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { status: 'FAILED', lastError: errorMsg },
      });
      throw new Error(errorMsg);
    }

    // 2. Check atomic rate limit and minimum send delay
    const effectiveHourlyLimit = hourlyLimit || sender.hourlyLimit || config.MAX_EMAILS_PER_HOUR_PER_SENDER;
    const effectiveMinDelayMs = minDelayMs || config.MIN_DELAY_BETWEEN_EMAILS_MS;

    const rateResult = await RateLimiterService.checkAndReserve(
      sender.id,
      effectiveHourlyLimit,
      effectiveMinDelayMs,
      emailJob.id
    );

    if (!rateResult.allowed) {
      const delayMs = rateResult.rescheduleDelayMs;
      const rescheduledTo = new Date(Date.now() + delayMs);

      console.warn(
        `[Worker] Sender ${sender.email} reached hourly limit or minimum spacing. Usage: ${rateResult.currentUsage}/${rateResult.limit}. Rescheduling in ${Math.round(delayMs / 1000)}s to ${rescheduledTo.toISOString()}`
      );

      // Record rate limit event
      await prisma.rateLimitEvent.create({
        data: {
          senderId: sender.id,
          campaignId: emailJob.campaignId,
          emailJobId: emailJob.id,
          eventType: 'HOURLY_LIMIT_REACHED',
          details: `Sender ${sender.email} reached rate limit (${rateResult.currentUsage}/${rateResult.limit}). Rescheduled by ${delayMs}ms`,
          rescheduledTo,
        },
      });

      // Update database status
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'RESCHEDULED',
          scheduledAt: rescheduledTo,
          attempts: { increment: 1 },
        },
      });

      // Reschedule BullMQ delayed job
      const nextBullmqId = `resched_${emailJob.id}_${Date.now()}`;
      await emailQueue.add(
        nextBullmqId,
        {
          ...job.data,
          rescheduleCount: (job.data.rescheduleCount || 0) + 1,
        },
        {
          jobId: nextBullmqId,
          delay: delayMs,
        }
      );

      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: { bullmqJobId: nextBullmqId },
      });

      // Notify connected Slack channels with deduplication
      await SlackService.notifyRateLimitReached({
        senderEmail: sender.email,
        senderId: sender.id,
        hourlyLimit: effectiveHourlyLimit,
        rescheduledTo,
        recipientEmail,
        userId: emailJob.campaign?.userId,
      });

      return {
        rescheduled: true,
        rescheduledTo: rescheduledTo.toISOString(),
        delayMs,
      };
    }

    // 3. Mark job as PROCESSING
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
      },
    });

    try {
      // 4. Deliver email via Nodemailer SMTP (Ethereal)
      const mailResult = await MailerService.sendEmail({
        host: sender.host,
        port: sender.port,
        secure: sender.secure,
        user: sender.user,
        pass: sender.pass,
        from: `"${sender.name}" <${sender.email}>`,
        to: recipientEmail,
        subject,
        body,
      });

      const now = new Date();

      // 5. Update EmailJob as SENT in PostgreSQL
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SENT',
          sentAt: now,
          messageId: mailResult.messageId,
          etherealUrl: mailResult.etherealUrl,
          lastError: null,
        },
      });

      // Update campaign metrics
      await prisma.campaign.update({
        where: { id: emailJob.campaignId },
        data: {
          sentCount: { increment: 1 },
        },
      });

      // 6. Index email in Elasticsearch
      await ElasticsearchService.indexEmail({
        emailJobId: emailJob.id,
        campaignId: emailJob.campaignId,
        senderId: sender.id,
        senderEmail: sender.email,
        recipientEmail,
        subject,
        body,
        status: 'SENT',
        scheduledAt: emailJob.scheduledAt.toISOString(),
        sentAt: now.toISOString(),
        etherealUrl: mailResult.etherealUrl,
        messageId: mailResult.messageId,
        createdAt: emailJob.createdAt.toISOString(),
      });

      console.log(`[Worker] Delivered EmailJob ${emailJobId} to ${recipientEmail}. Preview URL: ${mailResult.etherealUrl}`);

      return {
        success: true,
        messageId: mailResult.messageId,
        etherealUrl: mailResult.etherealUrl,
      };
    } catch (deliveryError: any) {
      console.error(`[Worker] Delivery error for EmailJob ${emailJobId}:`, deliveryError.message);

      // Release reservation since delivery failed before acceptance
      await RateLimiterService.releaseReservation(sender.id, rateResult.reservationId);

      const isFinalAttempt = (job.attemptsMade || 0) + 1 >= (job.opts.attempts || 3);

      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: isFinalAttempt ? 'FAILED' : 'SCHEDULED',
          lastError: deliveryError.message,
        },
      });

      if (isFinalAttempt) {
        await prisma.campaign.update({
          where: { id: emailJob.campaignId },
          data: {
            failedCount: { increment: 1 },
          },
        });
      }

      throw deliveryError;
    }
  },
  {
    connection: redisClient,
    concurrency: config.WORKER_CONCURRENCY,
    lockDuration: 30000,
  }
);

emailWorker.on('completed', (job: Job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

emailWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
});

// Startup bootstrap
async function startWorker() {
  await connectPrisma();
  await ElasticsearchService.init();

  // Restart recovery: Re-enqueue any orphaned scheduled jobs
  await SchedulerService.recoverUnscheduledJobs();

  console.log('[Worker] Worker initialized and listening for jobs.');
}

startWorker().catch((err) => {
  console.error('[Worker] Fatal startup error:', err);
  process.exit(1);
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`[Worker] Received ${signal}. Closing BullMQ worker...`);
  await emailWorker.close();
  await redisClient.quit();
  await prisma.$disconnect();
  console.log('[Worker] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
