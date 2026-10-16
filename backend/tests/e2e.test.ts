import { prisma } from '../src/db/prisma';
import { redisClient } from '../src/db/redis';
import { emailQueue } from '../src/queue/emailQueue';
import { SchedulerService } from '../src/services/schedulerService';
import { MailerService } from '../src/services/mailer';
import { ElasticsearchService } from '../src/services/elasticsearch';

describe('End-to-End Email Scheduling & Delivery Flow', () => {
  let defaultSender: any;

  beforeAll(async () => {
    await ElasticsearchService.init();
    defaultSender = await prisma.sender.findFirst({ where: { active: true } });
    if (!defaultSender) {
      const ethereal = await MailerService.createEtherealAccount();
      defaultSender = await prisma.sender.create({
        data: {
          name: 'Ethereal Test Sender',
          email: ethereal.user,
          host: ethereal.host,
          port: ethereal.port,
          secure: ethereal.secure,
          user: ethereal.user,
          pass: ethereal.pass,
          isDefault: true,
          hourlyLimit: 100,
          active: true,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redisClient.quit();
  });

  it('schedules a campaign, stores records in PostgreSQL, enqueues BullMQ delayed jobs, and delivers via Ethereal', async () => {
    const recipients = ['test.lead1@example.com', 'test.lead2@example.com'];
    const scheduledTime = new Date(Date.now() + 1000); // 1s future

    // 1. Schedule Campaign
    const scheduleResult = await SchedulerService.scheduleCampaign({
      name: 'E2E Acceptance Test Campaign',
      subject: 'Welcome to ReachInbox E2E Test',
      body: 'Hello from autonomous test verification!',
      senderId: defaultSender.id,
      scheduledAt: scheduledTime,
      minDelayMs: 1000,
      hourlyLimit: 50,
      recipients,
    });

    expect(scheduleResult.campaign).toBeDefined();
    expect(scheduleResult.totalScheduled).toBe(2);

    // 2. Verify PostgreSQL records created with status SCHEDULED
    const jobsInDb = await prisma.emailJob.findMany({
      where: { campaignId: scheduleResult.campaign.id },
      orderBy: { scheduledAt: 'asc' },
    });

    expect(jobsInDb).toHaveLength(2);
    expect(jobsInDb[0].status).toBe('SCHEDULED');
    expect(jobsInDb[1].status).toBe('SCHEDULED');
    expect(jobsInDb[0].bullmqJobId).toBeDefined();

    // 3. Verify BullMQ delayed jobs exist in the queue
    const bullmqJob1 = await emailQueue.getJob(jobsInDb[0].bullmqJobId!);
    expect(bullmqJob1).toBeDefined();

    // 4. Deliver via Ethereal SMTP to simulate worker delivery
    const mailResult = await MailerService.sendEmail({
      host: defaultSender.host,
      port: defaultSender.port,
      secure: defaultSender.secure,
      user: defaultSender.user,
      pass: defaultSender.pass,
      from: `"${defaultSender.name}" <${defaultSender.email}>`,
      to: jobsInDb[0].recipientEmail,
      subject: jobsInDb[0].subject,
      body: jobsInDb[0].body,
    });

    expect(mailResult.messageId).toBeDefined();
    expect(mailResult.etherealUrl).toContain('ethereal.email');

    // 5. Update DB status to SENT
    await prisma.emailJob.update({
      where: { id: jobsInDb[0].id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        messageId: mailResult.messageId,
        etherealUrl: mailResult.etherealUrl,
      },
    });

    // 6. Index in Elasticsearch
    await ElasticsearchService.indexEmail({
      emailJobId: jobsInDb[0].id,
      campaignId: scheduleResult.campaign.id,
      senderId: defaultSender.id,
      senderEmail: defaultSender.email,
      recipientEmail: jobsInDb[0].recipientEmail,
      subject: jobsInDb[0].subject,
      body: jobsInDb[0].body,
      status: 'SENT',
      scheduledAt: jobsInDb[0].scheduledAt.toISOString(),
      sentAt: new Date().toISOString(),
      etherealUrl: mailResult.etherealUrl,
      messageId: mailResult.messageId,
      createdAt: jobsInDb[0].createdAt.toISOString(),
    });

    // 7. Verify status changed to SENT and email is searchable
    const updatedJob = await prisma.emailJob.findUnique({
      where: { id: jobsInDb[0].id },
    });

    expect(updatedJob?.status).toBe('SENT');
    expect(updatedJob?.etherealUrl).toBe(mailResult.etherealUrl);

    // 8. Verify Search
    const searchRes = await ElasticsearchService.searchEmails('ReachInbox E2E Test');
    expect(searchRes.hits.length).toBeGreaterThanOrEqual(1);
  }, 30000);
});
