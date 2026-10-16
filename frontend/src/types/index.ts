export interface User {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface Sender {
  id: string;
  name: string;
  email: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  isDefault: boolean;
  hourlyLimit: number;
  active: boolean;
  currentUsage?: number;
  createdAt: string;
}

export interface EmailJob {
  id: string;
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RESCHEDULED' | 'CANCELLED';
  bullmqJobId?: string | null;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
  scheduledAt: string;
  sentAt?: string | null;
  messageId?: string | null;
  etherealUrl?: string | null;
  createdAt: string;
  sender?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface DashboardStats {
  scheduledEmails: number;
  sentEmails: number;
  failedEmails: number;
  activeSenders: number;
  rateLimitEvents: number;
  queue: {
    waiting: number;
    active: number;
    delayed: number;
    completed: number;
    failed: number;
  };
}

export interface SlackConnection {
  id: string;
  teamId: string;
  teamName?: string | null;
  channelId: string;
  channelName?: string | null;
  active: boolean;
  createdAt: string;
}

export interface SlackStatus {
  connected: boolean;
  connections: SlackConnection[];
  slackClientId: boolean;
}
