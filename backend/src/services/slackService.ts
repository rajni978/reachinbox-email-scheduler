import { WebClient } from '@slack/web-api';
import { redisClient } from '../db/redis';
import { prisma } from '../db/prisma';
import { config } from '../config';

export class SlackService {
  /**
   * Exchanges authorization code for a Slack bot access token
   */
  static async exchangeCodeForToken(code: string) {
    if (!config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET) {
      throw new Error('Slack OAuth client credentials are not configured');
    }

    const client = new WebClient();
    const response = await client.oauth.v2.access({
      client_id: config.SLACK_CLIENT_ID,
      client_secret: config.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: config.SLACK_REDIRECT_URI,
    });

    if (!response.ok) {
      throw new Error(`Slack OAuth error: ${response.error || 'Failed to exchange token'}`);
    }

    return {
      teamId: response.team?.id || '',
      teamName: response.team?.name || '',
      channelId: (response.incoming_webhook as any)?.channel_id || response.authed_user?.id || '',
      channelName: (response.incoming_webhook as any)?.channel || '',
      accessToken: response.access_token || '',
      botUserId: response.bot_user_id || '',
    };
  }

  /**
   * Sends a rate limit notification to all connected Slack channels for the user/system.
   * Deduplicates per sender per hour so repeated retries do not spam Slack.
   */
  static async notifyRateLimitReached(params: {
    senderEmail: string;
    senderId: string;
    hourlyLimit: number;
    rescheduledTo: Date;
    recipientEmail?: string;
    userId?: string | null;
  }): Promise<boolean> {
    const { senderEmail, senderId, hourlyLimit, rescheduledTo, recipientEmail, userId } = params;

    // Deduplication key in Redis with 1 hour TTL
    const currentHour = Math.floor(Date.now() / (3600 * 1000));
    const dedupKey = `slack:dedup:${senderId}:${currentHour}`;

    const alreadySent = await redisClient.get(dedupKey);
    if (alreadySent) {
      console.log(`[SlackService] Notification for sender ${senderEmail} already sent this hour. Skipping deduplicated notification.`);
      return false;
    }

    // Find active Slack connections
    const connections = await prisma.slackConnection.findMany({
      where: {
        active: true,
        ...(userId ? { userId } : {}),
      },
    });

    if (connections.length === 0) {
      console.log(`[SlackService] No active Slack connections found to notify for sender ${senderEmail}`);
      return false;
    }

    let sentAny = false;

    for (const conn of connections) {
      try {
        const client = new WebClient(conn.accessToken);
        const channel = conn.channelId;

        await client.chat.postMessage({
          channel,
          text: `⚠️ Rate limit reached for sender ${senderEmail} (${hourlyLimit} emails/hour)`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '⚠️ Email Sender Rate Limit Exceeded',
                emoji: true,
              },
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Sender:*\n\`${senderEmail}\``,
                },
                {
                  type: 'mrkdwn',
                  text: `*Hourly Limit:*\n${hourlyLimit} emails/hr`,
                },
              ],
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Next Available Window:*\n<!date^${Math.floor(rescheduledTo.getTime() / 1000)}^{date_num} {time_secs}|${rescheduledTo.toISOString()}>`,
                },
                {
                  type: 'mrkdwn',
                  text: `*Status:*\nDelayed job safely rescheduled`,
                },
              ],
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: recipientEmail
                    ? `Pending delivery to \`${recipientEmail}\` has been placed in delayed queue.`
                    : 'Scheduled emails will resume automatically when window opens.',
                },
              ],
            },
          ],
        });

        sentAny = true;
        console.log(`[SlackService] Successfully sent rate limit alert to Slack channel ${channel}`);
      } catch (err: any) {
        console.error(`[SlackService] Error posting to Slack channel ${conn.channelId}:`, err.message);
      }
    }

    if (sentAny) {
      // Mark deduplication key in Redis with 1 hour expiry (3600s)
      await redisClient.set(dedupKey, '1', 'EX', 3600);
    }

    return sentAny;
  }
}
