import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { emailQueue } from '../queue/emailQueue';
import { authenticate } from '../middleware/auth';

const router = Router();

// Overall dashboard statistics
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const [
      scheduledCount,
      sentCount,
      failedCount,
      sendersCount,
      rateLimitCount,
    ] = await Promise.all([
      prisma.emailJob.count({
        where: { status: { in: ['SCHEDULED', 'RESCHEDULED', 'PROCESSING'] } },
      }),
      prisma.emailJob.count({ where: { status: 'SENT' } }),
      prisma.emailJob.count({ where: { status: 'FAILED' } }),
      prisma.sender.count({ where: { active: true } }),
      prisma.rateLimitEvent.count(),
    ]);

    // BullMQ queue job counts
    let queueStats = {
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
    };

    try {
      const counts = await emailQueue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'completed',
        'failed'
      );
      queueStats = {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        delayed: counts.delayed || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
      };
    } catch (qErr) {
      console.warn('[Dashboard] Error reading BullMQ job counts:', qErr);
    }

    return res.json({
      success: true,
      stats: {
        scheduledEmails: scheduledCount,
        sentEmails: sentCount,
        failedEmails: failedCount,
        activeSenders: sendersCount,
        rateLimitEvents: rateLimitCount,
        queue: queueStats,
      },
    });
  } catch (error: any) {
    console.error('[Dashboard] Error fetching stats:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Recent rate limit events
router.get('/rate-limits', authenticate, async (req: Request, res: Response) => {
  try {
    const events = await prisma.rateLimitEvent.findMany({
      include: {
        sender: { select: { id: true, name: true, email: true, hourlyLimit: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json({ success: true, events });
  } catch (error: any) {
    console.error('[Dashboard] Error fetching rate limit events:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
