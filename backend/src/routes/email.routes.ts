import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../db/prisma';
import { emailQueue } from '../queue/emailQueue';
import { SchedulerService } from '../services/schedulerService';
import { ElasticsearchService } from '../services/elasticsearch';
import { authenticate } from '../middleware/auth';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

// Parse recipients from CSV or TXT file upload or raw text
router.post('/parse', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  try {
    let rawContent = '';

    if (req.file) {
      rawContent = req.file.buffer.toString('utf-8');
    } else if (req.body.content) {
      rawContent = String(req.body.content);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Please upload a CSV or TXT file or provide raw text content',
      });
    }

    const { validEmails, duplicateCount, invalidCount } = SchedulerService.parseRecipients(rawContent);

    return res.json({
      success: true,
      data: {
        recipients: validEmails,
        totalValid: validEmails.length,
        duplicateCount,
        invalidCount,
      },
    });
  } catch (error: any) {
    console.error('[Emails] Error parsing recipients:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Schedule a new email campaign
router.post('/schedule', authenticate, async (req: Request, res: Response) => {
  const {
    name,
    subject,
    body,
    senderId,
    scheduledAt,
    minDelayMs,
    hourlyLimit,
    recipients,
  } = req.body;

  if (!subject || !body || !senderId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Subject, body, senderId, and at least one recipient are required',
    });
  }

  try {
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : new Date();

    const result = await SchedulerService.scheduleCampaign({
      name: name || `Campaign ${new Date().toLocaleDateString()}`,
      subject,
      body,
      senderId,
      scheduledAt: scheduledDate,
      minDelayMs: minDelayMs ? parseInt(minDelayMs, 10) : 2000,
      hourlyLimit: hourlyLimit ? parseInt(hourlyLimit, 10) : 100,
      recipients,
      userId: req.user?.id || null,
    });

    return res.status(201).json({
      success: true,
      campaign: result.campaign,
      totalScheduled: result.totalScheduled,
      message: `Successfully scheduled ${result.totalScheduled} email(s)`,
    });
  } catch (error: any) {
    console.error('[Emails] Error scheduling campaign:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get scheduled emails
router.get('/scheduled', authenticate, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 20);
    const senderId = req.query.senderId as string;

    const where: any = {
      status: { in: ['SCHEDULED', 'RESCHEDULED', 'PROCESSING'] },
      ...(senderId ? { senderId } : {}),
    };

    const [total, jobs] = await Promise.all([
      prisma.emailJob.count({ where }),
      prisma.emailJob.findMany({
        where,
        include: { sender: { select: { id: true, name: true, email: true } }, campaign: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    return res.json({
      success: true,
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[Emails] Error fetching scheduled emails:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Get sent emails
router.get('/sent', authenticate, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 20);
    const senderId = req.query.senderId as string;

    const where: any = {
      status: 'SENT',
      ...(senderId ? { senderId } : {}),
    };

    const [total, jobs] = await Promise.all([
      prisma.emailJob.count({ where }),
      prisma.emailJob.findMany({
        where,
        include: { sender: { select: { id: true, name: true, email: true } }, campaign: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { sentAt: 'desc' },
      }),
    ]);

    return res.json({
      success: true,
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('[Emails] Error fetching sent emails:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Search emails using Elasticsearch with PostgreSQL fallback
router.get('/search', authenticate, async (req: Request, res: Response) => {
  try {
    const queryStr = (req.query.q as string) || '';
    const status = req.query.status as string;
    const senderId = req.query.senderId as string;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 20);

    const result = await ElasticsearchService.searchEmails(
      queryStr,
      { status, senderId },
      page,
      limit
    );

    return res.json({
      success: true,
      hits: result.hits,
      total: result.total,
      source: result.source,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('[Emails] Search error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel scheduled email job
router.post('/:id/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const job = await prisma.emailJob.findUnique({
      where: { id: req.params.id },
    });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Email job not found' });
    }

    if (job.status === 'SENT') {
      return res.status(400).json({ success: false, error: 'Cannot cancel an email that is already sent' });
    }

    // Remove from BullMQ if present
    if (job.bullmqJobId) {
      try {
        const bullmqJob = await emailQueue.getJob(job.bullmqJobId);
        if (bullmqJob) {
          await bullmqJob.remove();
        }
      } catch (err: any) {
        console.warn(`[Emails] Failed to remove BullMQ job: ${err.message}`);
      }
    }

    await prisma.emailJob.update({
      where: { id: job.id },
      data: { status: 'CANCELLED' },
    });

    return res.json({ success: true, message: 'Email job cancelled successfully' });
  } catch (error: any) {
    console.error('[Emails] Error cancelling job:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Retry a failed email job
router.post('/:id/retry', authenticate, async (req: Request, res: Response) => {
  try {
    const job = await prisma.emailJob.findUnique({
      where: { id: req.params.id },
      include: { campaign: true },
    });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Email job not found' });
    }

    const nextBullmqId = `retry_${job.id}_${Date.now()}`;
    await emailQueue.add(
      nextBullmqId,
      {
        emailJobId: job.id,
        campaignId: job.campaignId,
        senderId: job.senderId,
        recipientEmail: job.recipientEmail,
        subject: job.subject,
        body: job.body,
        scheduledAt: new Date().toISOString(),
        minDelayMs: job.campaign?.minDelayMs || 2000,
        hourlyLimit: job.campaign?.hourlyLimit || 100,
      },
      {
        jobId: nextBullmqId,
        delay: 0,
      }
    );

    await prisma.emailJob.update({
      where: { id: job.id },
      data: {
        status: 'SCHEDULED',
        scheduledAt: new Date(),
        bullmqJobId: nextBullmqId,
        lastError: null,
      },
    });

    return res.json({ success: true, message: 'Email queued for immediate retry' });
  } catch (error: any) {
    console.error('[Emails] Error retrying job:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
