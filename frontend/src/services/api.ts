import type { User, Sender, EmailJob, DashboardStats, SlackStatus } from '../types';

const API_BASE = '/api';

export const api = {
  // Authentication
  async getCurrentUser(): Promise<User | null> {
    try {
      const res = await fetch(`${API_BASE}/auth/me`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || null;
    } catch {
      return null;
    }
  },

  async getGoogleAuthUrl(): Promise<string> {
    const res = await fetch(`${API_BASE}/auth/google/url`);
    const data = await res.json();
    return data.url;
  },

  async devLogin(): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/dev-login`, { method: 'POST' });
    const data = await res.json();
    return data.user;
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  },

  // Senders
  async getSenders(): Promise<Sender[]> {
    const res = await fetch(`${API_BASE}/senders`);
    const data = await res.json();
    return data.senders || [];
  },

  async createEtherealSender(): Promise<Sender> {
    const res = await fetch(`${API_BASE}/senders/ethereal`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create Ethereal sender');
    return data.sender;
  },

  async createSender(senderData: Partial<Sender> & { pass: string }): Promise<Sender> {
    const res = await fetch(`${API_BASE}/senders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(senderData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create sender');
    return data.sender;
  },

  async testSender(senderId: string): Promise<string> {
    const res = await fetch(`${API_BASE}/senders/${senderId}/test`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'SMTP test failed');
    return data.message;
  },

  // Email Recipient Parsing
  async parseRecipientsFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/emails/parse`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to parse file');
    return data.data;
  },

  async parseRecipientsText(content: string) {
    const res = await fetch(`${API_BASE}/emails/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to parse emails');
    return data.data;
  },

  // Scheduling
  async scheduleCampaign(payload: {
    name?: string;
    subject: string;
    body: string;
    senderId: string;
    scheduledAt: string;
    minDelayMs: number;
    hourlyLimit: number;
    recipients: string[];
  }) {
    const res = await fetch(`${API_BASE}/emails/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to schedule campaign');
    return data;
  },

  // Emails Table Data
  async getScheduledEmails(page = 1, limit = 20, senderId?: string): Promise<{ jobs: EmailJob[]; total: number; totalPages: number }> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (senderId) params.append('senderId', senderId);
    const res = await fetch(`${API_BASE}/emails/scheduled?${params.toString()}`);
    const data = await res.json();
    return {
      jobs: data.jobs || [],
      total: data.pagination?.total || 0,
      totalPages: data.pagination?.totalPages || 1,
    };
  },

  async getSentEmails(page = 1, limit = 20, senderId?: string): Promise<{ jobs: EmailJob[]; total: number; totalPages: number }> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (senderId) params.append('senderId', senderId);
    const res = await fetch(`${API_BASE}/emails/sent?${params.toString()}`);
    const data = await res.json();
    return {
      jobs: data.jobs || [],
      total: data.pagination?.total || 0,
      totalPages: data.pagination?.totalPages || 1,
    };
  },

  // Search
  async searchEmails(query: string, status?: string, page = 1): Promise<{ hits: any[]; total: number; source: string }> {
    const params = new URLSearchParams({ q: query, page: String(page) });
    if (status) params.append('status', status);
    const res = await fetch(`${API_BASE}/emails/search?${params.toString()}`);
    const data = await res.json();
    return {
      hits: data.hits || [],
      total: data.total || 0,
      source: data.source || 'database',
    };
  },

  async cancelJob(jobId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/emails/${jobId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel email job');
  },

  async retryJob(jobId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/emails/${jobId}/retry`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to retry email job');
  },

  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    const data = await res.json();
    return data.stats;
  },

  // Slack
  async getSlackStatus(): Promise<SlackStatus> {
    const res = await fetch(`${API_BASE}/slack/status`);
    const data = await res.json();
    return data;
  },

  async getSlackInstallUrl(): Promise<string> {
    const res = await fetch(`${API_BASE}/slack/install`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Slack OAuth not configured');
    return data.url;
  },

  async disconnectSlack(): Promise<void> {
    await fetch(`${API_BASE}/slack/disconnect`, { method: 'POST' });
  },

  async testSlackNotification(): Promise<string> {
    const res = await fetch(`${API_BASE}/slack/test`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send test notification');
    return data.message;
  },
};
