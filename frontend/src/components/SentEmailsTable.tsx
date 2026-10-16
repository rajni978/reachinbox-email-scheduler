import React from 'react';
import type { EmailJob } from '../types';
import { CheckCircle2, ExternalLink, Inbox } from 'lucide-react';

interface SentEmailsTableProps {
  jobs: EmailJob[];
  loading: boolean;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
}

export const SentEmailsTable: React.FC<SentEmailsTableProps> = ({
  jobs,
  loading,
  page,
  totalPages,
  onPageChange,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden p-8 text-center">
        <div className="inline-block w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-500">Loading sent emails history...</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <Inbox className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">No sent emails yet</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
          When BullMQ delayed jobs reach their scheduled execution time, delivered emails with Ethereal preview links appear here.
        </p>
      </div>
    );
  }

  const formatSentTime = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3.5 px-4">Recipient</th>
              <th className="py-3.5 px-4">Subject</th>
              <th className="py-3.5 px-4">Delivered At</th>
              <th className="py-3.5 px-4">Sender</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Ethereal Preview</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-normal">
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-3 px-4 font-medium text-slate-900">{job.recipientEmail}</td>
                <td className="py-3 px-4 text-slate-700 max-w-xs truncate" title={job.subject}>
                  {job.subject}
                </td>
                <td className="py-3 px-4 text-slate-600 whitespace-nowrap font-mono text-[11px]">
                  {formatSentTime(job.sentAt)}
                </td>
                <td className="py-3 px-4 text-slate-500 max-w-[150px] truncate" title={job.sender?.email}>
                  {job.sender?.email || 'Default'}
                </td>
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Sent
                  </span>
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  {job.etherealUrl ? (
                    <a
                      href={job.etherealUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors shadow-2xs"
                    >
                      <span>View in Ethereal</span>
                      <ExternalLink className="w-3 h-3 text-brand-600" />
                    </a>
                  ) : (
                    <span className="text-slate-400 text-[11px] font-mono">
                      {job.messageId ? job.messageId.slice(0, 15) + '...' : 'Delivered'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between bg-slate-50/50 text-xs text-slate-500">
          <div>
            Page <span className="font-semibold text-slate-800">{page}</span> of{' '}
            <span className="font-semibold text-slate-800">{totalPages}</span>
          </div>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2.5 py-1 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-100"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2.5 py-1 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-100"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
