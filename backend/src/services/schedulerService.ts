import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import { prisma } from '../db/prisma';
import { emailQueue, EmailJobData } from '../queue/emailQueue';

export interface CreateCampaignInput {
  name: string;
  subject: string;
  body: string;
  senderId: string;
  scheduledAt: Date;
  minDelayMs?: number;
  hourlyLimit?: number;
  recipients: string[];
  userId?: string | null;
}

export class SchedulerService {
  /**
   * Parse recipients from CSV or TXT file buffer or raw text string
   */
  static parseRecipients(fileContent: string): { validEmails: string[]; duplicateCount: number; invalidCount: number } {
    const rawLines: string[] = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Try parsing as CSV first
    try {
      const records = parse(fileContent, {
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      for (const row of records) {
        if (Array.isArray(row)) {
          for (const col of row) {
            if (col && typeof col === 'string') {
              rawLines.push(col.trim());
            }
          }
        }
      }
    } catch {
      // Fallback to line / comma / semicolon split
      const tokens = fileContent.split(/[\r\n,;]+/);
      for (const t of tokens) {
        if (t.trim()) rawLines.push(t.trim());
      }
    }

    const seen = new Set<string>();
    const validEmails: string[] = [];
    let duplicateCount = 0;
    let invalidCount = 0;

    for (const raw of rawLines) {
      const cleaned = raw.trim().toLowerCase().replace(/^["']|["']$/g, '');
      if (!cleaned || cleaned === 'email' || cleaned === 'emails' || cleaned === 'recipient') {
        // Skip header
        continue;
      }

      if (emailRegex.test(cleaned)) {
        if (seen.has(cleaned)) {
          duplicateCount++;
        } else {
          seen.add(cleaned);
          validEmails.push(cleaned);
        }
      } else {
        invalidCount++;
      }
    }

    return {
      validEmails,
      duplicateCount,
      invalidCount,
    };
  }

  /**
   * Schedules a new email campaign with delayed BullMQ jobs
   */
  static async scheduleCampaign(input: CreateCampaignInput) {
    const {
      name,
      subject,
      body,
      senderId,
      scheduledAt,
      minDelayMs = 2000,
      hourlyLimit = 100,
      recipients,
      userId,
    } = input;

    if (recipients.length === 0) {
      throw new Error('At least one valid recipient email is required');
    }

    const sender = await prisma.sender.findUnique({
      where: { id: senderId },
    });

    if (!sender) {
      throw new Error(`Sender with ID ${senderId} not found`);
    }

    // Create Campaign in PostgreSQL
    const campaign = await prisma.campaign.create({
      data: {
        name,
        subject,
        body,
        senderId,
        scheduledAt,
        minDelayMs,
        hourlyLimit,
        totalEmails: recipients.length,
        status: 'SCHEDULED',
        userId: userId || undefined,
      },
    });

    const now = Date.now();
    const baseTargetTime = scheduledAt.getTime();
    const initialDelay = Math.max(0, baseTargetTime - now);

    const emailJobsToCreate = recipients.map((recipientEmail, index) => {
      // Calculate target send time spacing each recipient by minDelayMs
      const targetSendTime = new Date(baseTargetTime + index * minDelayMs);
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`${campaign.id}:${recipientEmail}:${targetSendTime.getTime()}`)
        .digest('hex');

      return {
        campaignId: campaign.id,
        senderId,
        recipientEmail,
        subject,
        body,
        status: 'SCHEDULED',
        scheduledAt: targetSendTime,
        idempotencyKey,
      };
    });

    // Create email job records in batch
    await prisma.emailJob.createMany({
      data: emailJobsToCreate,
      skipDuplicates: true,
    });

    // Retrieve created records to obtain stable database IDs
    const createdJobs = await prisma.emailJob.findMany({
      where: { campaignId: campaign.id },
      orderBy: { scheduledAt: 'asc' },
    });

    // Enqueue delayed jobs into BullMQ
    for (let i = 0; i < createdJobs.length; i++) {
      const emailJob = createdJobs[i];
      const jobDelay = Math.max(0, emailJob.scheduledAt.getTime() - Date.now());
      const stableBullmqJobId = `job_${emailJob.id}`;

      const jobData: EmailJobData = {
        emailJobId: emailJob.id,
        campaignId: campaign.id,
        senderId,
        recipientEmail: emailJob.recipientEmail,
        subject: emailJob.subject,
        body: emailJob.body,
        scheduledAt: emailJob.scheduledAt.toISOString(),
        minDelayMs,
        hourlyLimit,
      };

      await emailQueue.add(stableBullmqJobId, jobData, {
        jobId: stableBullmqJobId,
        delay: jobDelay,
      });

      // Persist BullMQ Job ID to database record
      await prisma.emailJob.update({
        where: { id: emailJob.id },
        data: { bullmqJobId: stableBullmqJobId },
      });
    }

    return {
      campaign,
      totalScheduled: createdJobs.length,
    };
  }

  /**
   * Recovers any jobs from database that were scheduled/pending but are missing from BullMQ.
   * Safe to call on system restart or worker startup.
   */
  static async recoverUnscheduledJobs(): Promise<number> {
    try {
      const pendingJobs = await prisma.emailJob.findMany({
        where: {
          status: { in: ['SCHEDULED', 'RESCHEDULED', 'PROCESSING'] },
        },
        include: { campaign: true },
        take: 500,
      });

      let recoveredCount = 0;

      for (const job of pendingJobs) {
        const stableBullmqJobId = `job_${job.id}`;
        const existingBullmqJob = await emailQueue.getJob(stableBullmqJobId);

        if (!existingBullmqJob) {
          const delay = Math.max(0, job.scheduledAt.getTime() - Date.now());
          const jobData: EmailJobData = {
            emailJobId: job.id,
            campaignId: job.campaignId,
            senderId: job.senderId,
            recipientEmail: job.recipientEmail,
            subject: job.subject,
            body: job.body,
            scheduledAt: job.scheduledAt.toISOString(),
            minDelayMs: job.campaign?.minDelayMs || 2000,
            hourlyLimit: job.campaign?.hourlyLimit || 100,
          };

          await emailQueue.add(stableBullmqJobId, jobData, {
            jobId: stableBullmqJobId,
            delay,
          });

          await prisma.emailJob.update({
            where: { id: job.id },
            data: {
              status: 'SCHEDULED',
              bullmqJobId: stableBullmqJobId,
            },
          });

          recoveredCount++;
        }
      }

      if (recoveredCount > 0) {
        console.log(`[SchedulerRecovery] Recovered ${recoveredCount} orphaned or interrupted email jobs into BullMQ.`);
      }

      return recoveredCount;
    } catch (err: any) {
      console.error('[SchedulerRecovery] Error during job recovery:', err.message);
      return 0;
    }
  }
}
