import React from 'react';
import type { DashboardStats } from '../types';
import { Clock, CheckCircle2, AlertCircle, Users, ShieldAlert } from 'lucide-react';

interface StatsOverviewProps {
  stats: DashboardStats | null;
  loading: boolean;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse p-4" />
        ))}
      </div>
    );
  }

  const items = [
    {
      label: 'Scheduled Emails',
      value: stats.scheduledEmails,
      subtext: `${stats.queue?.delayed || 0} queued in BullMQ`,
      icon: Clock,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50 border-indigo-100',
    },
    {
      label: 'Sent Emails',
      value: stats.sentEmails,
      subtext: 'Delivered via SMTP',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 border-emerald-100',
    },
    {
      label: 'Failed Sends',
      value: stats.failedEmails,
      subtext: 'Safe backoff retry',
      icon: AlertCircle,
      color: 'text-rose-600',
      bg: 'bg-rose-50 border-rose-100',
    },
    {
      label: 'Active Senders',
      value: stats.activeSenders,
      subtext: 'Multi-sender SMTP',
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50 border-blue-100',
    },
    {
      label: 'Rate-Limit Events',
      value: stats.rateLimitEvents,
      subtext: 'Rescheduled + Slack',
      icon: ShieldAlert,
      color: 'text-amber-600',
      bg: 'bg-amber-50 border-amber-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {items.map((item, idx) => {
        const Icon = item.icon;
        return (
          <div
            key={idx}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow transition-shadow flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{item.label}</span>
              <div className={`p-1.5 rounded-lg border ${item.bg}`}>
                <Icon className={`w-4 h-4 ${item.color}`} />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-900">{item.value}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{item.subtext}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
