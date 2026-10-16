import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { config } from '../config';
import { SlackService } from '../services/slackService';
import { authenticate } from '../middleware/auth';

const router = Router();

// Check Slack integration status
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const connections = await prisma.slackConnection.findMany({
      where: {
        active: true,
        ...(userId ? { userId } : {}),
      },
      select: {
        id: true,
        teamId: true,
        teamName: true,
        channelId: true,
        channelName: true,
        active: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      connected: connections.length > 0,
      connections,
      slackClientId: config.SLACK_CLIENT_ID ? true : false,
    });
  } catch (error: any) {
    console.error('[Slack] Status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Generate Slack OAuth install URL
router.get('/install', authenticate, (req: Request, res: Response) => {
  if (!config.SLACK_CLIENT_ID) {
    return res.status(400).json({
      success: false,
      error: 'Slack Client ID is not configured in environment variables.',
    });
  }

  const scopes = [
    'chat:write',
    'chat:write.public',
    'channels:read',
    'incoming-webhook',
  ].join(',');

  const slackUrl = `https://slack.com/oauth/v2/authorize?client_id=${config.SLACK_CLIENT_ID}&scope=${encodeURIComponent(
    scopes
  )}&redirect_uri=${encodeURIComponent(config.SLACK_REDIRECT_URI)}&state=${req.user?.id || 'default'}`;

  return res.json({ success: true, url: slackUrl });
});

// Slack OAuth redirect callback
router.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;

  if (!code) {
    return res.redirect(`${config.FRONTEND_URL}?slack_error=missing_code`);
  }

  try {
    const tokenData = await SlackService.exchangeCodeForToken(code);

    let targetUserId = state;
    const userExists = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!userExists) {
      const devUser = await prisma.user.findFirst();
      targetUserId = devUser?.id || '';
    }

    if (!targetUserId) {
      return res.redirect(`${config.FRONTEND_URL}?slack_error=no_user_found`);
    }

    await prisma.slackConnection.upsert({
      where: {
        userId_teamId_channelId: {
          userId: targetUserId,
          teamId: tokenData.teamId,
          channelId: tokenData.channelId,
        },
      },
      update: {
        accessToken: tokenData.accessToken,
        teamName: tokenData.teamName,
        channelName: tokenData.channelName,
        botUserId: tokenData.botUserId,
        active: true,
      },
      create: {
        userId: targetUserId,
        teamId: tokenData.teamId,
        teamName: tokenData.teamName,
        channelId: tokenData.channelId,
        channelName: tokenData.channelName,
        accessToken: tokenData.accessToken,
        botUserId: tokenData.botUserId,
        active: true,
      },
    });

    console.log(`[Slack] Successfully connected team ${tokenData.teamName} for user ${targetUserId}`);
    return res.redirect(`${config.FRONTEND_URL}?slack_connected=true`);
  } catch (error: any) {
    console.error('[Slack] OAuth callback error:', error.message);
    return res.redirect(`${config.FRONTEND_URL}?slack_error=${encodeURIComponent(error.message)}`);
  }
});

// Disconnect Slack
router.post('/disconnect', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (userId) {
      await prisma.slackConnection.updateMany({
        where: { userId },
        data: { active: false },
      });
    }

    return res.json({ success: true, message: 'Slack disconnected successfully' });
  } catch (error: any) {
    console.error('[Slack] Disconnect error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger a test notification to verify Slack connection
router.post('/test', authenticate, async (req: Request, res: Response) => {
  try {
    const sender = await prisma.sender.findFirst();
    const sent = await SlackService.notifyRateLimitReached({
      senderEmail: sender?.email || 'sender@reachinbox.test',
      senderId: sender?.id || 'test_sender_id',
      hourlyLimit: sender?.hourlyLimit || 100,
      rescheduledTo: new Date(Date.now() + 3600000),
      recipientEmail: 'test-recipient@example.com',
      userId: req.user?.id,
    });

    return res.json({
      success: true,
      notified: sent,
      message: sent
        ? 'Test rate limit notification dispatched to connected Slack channels'
        : 'No active Slack connection found or notification was deduplicated',
    });
  } catch (error: any) {
    console.error('[Slack] Test notification error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
