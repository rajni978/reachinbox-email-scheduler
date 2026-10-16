import React from 'react';
import type { EmailJob } from '../types';
import { Clock, RefreshCw, XCircle, AlertCircle, Calendar } from 'lucide-react';

interface ScheduledEmailsTableProps {
  jobs: EmailJob[];
  loading: boolean;
  onCancelJob: (id: string) => Promise<void>;
  onRetryJob: (id: string) => Promise<void>;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
}

export const ScheduledEmailsTable: React.FC<ScheduledEmailsTableProps> = ({
  jobs,
  loading,
  onCancelJob,
  onRetryJob,
  page,
  totalPages,
  onPageChange,
}) => {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden p-8 text-center">
        <div className="inline-block w-8 h-8 border-3 border-brand-500/20 border-t-brand-600 rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium text-slate-500">Loading scheduled emails...</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <Calendar className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">No scheduled emails in queue</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
          Compose a new email campaign or upload a CSV file to schedule delayed jobs into BullMQ.
        </p>
      </div>
    );
  }

  const formatScheduledTime = (dateStr: string) => {
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
              <th className="py-3.5 px-4">Scheduled For</th>
              <th className="py-3.5 px-4">Sender</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-normal">
            {jobs.map((job) => {
              const isRescheduled = job.status === 'RESCHEDULED';
              const isProcessing = job.status === 'PROCESSING';

              return (
                <tr key={job.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-900">{job.recipientEmail}</td>
                  <td className="py-3 px-4 text-slate-700 max-w-xs truncate" title={job.subject}>
                    {job.subject}
                  </td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatScheduledTime(job.scheduledAt)}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-500 max-w-[150px] truncate" title={job.sender?.email}>
                    {job.sender?.email || 'Default'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {isProcessing ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                        Processing
                      </span>
                    ) : isRescheduled ? (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                        title="Hourly limit was reached; rescheduled to next available window"
                      >
                        <AlertCircle className="w-3 h-3 text-amber-600" />
                        Rescheduled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Clock className="w-3 h-3 text-indigo-600" />
                        Scheduled
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onRetryJob(job.id)}
                        className="p-1 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-md transition-colors"
                        title="Force Retry / Trigger Now"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onCancelJob(job.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                        title="Cancel Job"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
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
