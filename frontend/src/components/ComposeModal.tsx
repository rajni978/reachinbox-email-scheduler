import React, { useState, useEffect, useRef } from 'react';
import type { Sender } from '../types';
import { api } from '../services/api';
import { X, Upload, Check, AlertCircle, Sparkles, Clock, ShieldCheck, Mail } from 'lucide-react';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduled: () => void;
  senders: Sender[];
  onRefreshSenders: () => Promise<void>;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  onScheduled,
  senders,
  onRefreshSenders,
}) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedSenderId, setSelectedSenderId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [minDelaySec, setMinDelaySec] = useState('2');
  const [hourlyLimit, setHourlyLimit] = useState('100');

  // Recipients input mode
  const [recipientText, setRecipientText] = useState('');
  const [validRecipients, setValidRecipients] = useState<string[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [invalidCount, setInvalidCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [creatingSender, setCreatingSender] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Default scheduled time to 2 minutes in future
      const d = new Date(Date.now() + 2 * 60 * 1000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      setScheduledAt(d.toISOString().slice(0, 16));

      if (senders.length > 0 && !selectedSenderId) {
        const defaultSender = senders.find((s) => s.isDefault) || senders[0];
        setSelectedSenderId(defaultSender.id);
      }
    }
  }, [isOpen, senders]);

  if (!isOpen) return null;

  const handleParseText = async (text: string) => {
    setRecipientText(text);
    if (!text.trim()) {
      setValidRecipients([]);
      setDuplicateCount(0);
      setInvalidCount(0);
      return;
    }

    try {
      const data = await api.parseRecipientsText(text);
      setValidRecipients(data.recipients);
      setDuplicateCount(data.duplicateCount);
      setInvalidCount(data.invalidCount);
    } catch (err: any) {
      console.error('Parse error:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const data = await api.parseRecipientsFile(file);
      setValidRecipients(data.recipients);
      setDuplicateCount(data.duplicateCount);
      setInvalidCount(data.invalidCount);
      setRecipientText(data.recipients.join(', '));
    } catch (err: any) {
      setError(`Failed to parse file: ${err.message}`);
    }
  };

  const handleCreateEtherealSender = async () => {
    try {
      setCreatingSender(true);
      setError(null);
      const newSender = await api.createEtherealSender();
      await onRefreshSenders();
      setSelectedSenderId(newSender.id);
      setSuccessMsg(`Created fresh Ethereal test sender: ${newSender.email}`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(`Error creating Ethereal sender: ${err.message}`);
    } finally {
      setCreatingSender(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (validRecipients.length === 0) {
      setError('Please provide at least one valid recipient email');
      return;
    }

    if (!selectedSenderId) {
      setError('Please select an active email sender');
      return;
    }

    if (!subject.trim()) {
      setError('Email subject is required');
      return;
    }

    if (!body.trim()) {
      setError('Email body is required');
      return;
    }

    try {
      setLoading(true);
      const minDelayMs = Math.max(500, parseInt(minDelaySec, 10) * 1000);
      const limit = Math.max(1, parseInt(hourlyLimit, 10));

      await api.scheduleCampaign({
        name: `Campaign: ${subject.slice(0, 30)}`,
        subject,
        body,
        senderId: selectedSenderId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        minDelayMs,
        hourlyLimit: limit,
        recipients: validRecipients,
      });

      onScheduled();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to schedule campaign');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Compose New Scheduled Campaign</h2>
              <p className="text-xs text-slate-500">Configure BullMQ delayed delivery with rate limiting safeguards</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Sender Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">From (Email Sender)</label>
              <button
                type="button"
                onClick={handleCreateEtherealSender}
                disabled={creatingSender}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1 hover:underline"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{creatingSender ? 'Generating...' : '+ New Ethereal Sender'}</span>
              </button>
            </div>
            <select
              value={selectedSenderId}
              onChange={(e) => setSelectedSenderId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email}) — Hourly Limit: {s.hourlyLimit}/hr
                </option>
              ))}
            </select>
          </div>

          {/* Recipients Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">Recipients (CSV, TXT, or pasted text)</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-slate-600 hover:text-slate-900 font-medium inline-flex items-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload CSV / TXT</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
            <textarea
              rows={3}
              placeholder="Paste comma or newline separated emails, e.g.: user1@test.com, user2@test.com..."
              value={recipientText}
              onChange={(e) => handleParseText(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-mono text-xs"
            />
            {/* Validation badge */}
            <div className="flex items-center gap-2 mt-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                <Check className="w-3 h-3" />
                {validRecipients.length} Valid Recipient{validRecipients.length === 1 ? '' : 's'}
              </span>
              {duplicateCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                  {duplicateCount} Duplicates Removed
                </span>
              )}
              {invalidCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                  {invalidCount} Invalid Skipped
                </span>
              )}
            </div>
          </div>

          {/* Subject Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Subject</label>
            <input
              type="text"
              placeholder="e.g. Welcome to ReachInbox!"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Body Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Body</label>
            <textarea
              rows={5}
              placeholder="Write your email body here (HTML & plain text supported)..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Schedule Configuration Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Start Date & Time</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Min Delay (Seconds)</span>
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={minDelaySec}
                onChange={(e) => setMinDelaySec(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
                <span>Hourly Limit (Emails/hr)</span>
              </label>
              <input
                type="number"
                min="1"
                max="5000"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || validRecipients.length === 0}
              className="px-5 py-2.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md shadow-brand-600/30 transition-all flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Scheduling into BullMQ...</span>
                </>
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5" />
                  <span>Schedule {validRecipients.length} Email{validRecipients.length === 1 ? '' : 's'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
