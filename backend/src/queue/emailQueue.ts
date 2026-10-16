import { Queue, QueueOptions } from 'bullmq';
import { redisClient } from '../db/redis';

export const EMAIL_QUEUE_NAME = 'email-queue';

export interface EmailJobData {
  emailJobId: string;
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  minDelayMs: number;
  hourlyLimit: number;
  rescheduleCount?: number;
}

const queueOptions: QueueOptions = {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 1000,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 2000,
      age: 7 * 24 * 3600, // 7 days
    },
  },
};

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, queueOptions);

emailQueue.on('error', (err) => {
  console.error('[EmailQueue] BullMQ Queue Error:', err.message);
});
