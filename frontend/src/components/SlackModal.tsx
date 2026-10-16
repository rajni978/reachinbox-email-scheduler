import { useState } from 'react';
import type { SlackStatus } from '../types';
import { api } from '../services/api';
import { X, MessageSquare, CheckCircle, AlertCircle, Bell, ExternalLink } from 'lucide-react';

interface SlackModalProps {
  isOpen: boolean;
  onClose: () => void;
  slackStatus: SlackStatus | null;
  onRefreshStatus: () => Promise<void>;
}

export const SlackModal: React.FC<SlackModalProps> = ({
  isOpen,
  onClose,
  slackStatus,
  onRefreshStatus,
}) => {
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnectSlack = async () => {
    try {
      setError(null);
      const url = await api.getSlackInstallUrl();
      window.location.href = url;
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Slack OAuth flow');
    }
  };

  const handleTestAlert = async () => {
    try {
      setLoading(true);
      setError(null);
      setTestResult(null);
      const msg = await api.testSlackNotification();
      setTestResult(msg);
      await onRefreshStatus();
    } catch (err: any) {
      setError(err.message || 'Error triggering Slack test alert');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setLoading(true);
      await api.disconnectSlack();
      await onRefreshStatus();
      setTestResult('Slack disconnected successfully');
    } catch (err: any) {
      setError(err.message || 'Error disconnecting Slack');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Slack Notifications Integration</h2>
              <p className="text-xs text-slate-500">Real-time alerts when hourly rate limits are reached</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {testResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{testResult}</span>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">Integration Status</span>
              {slackStatus?.connected ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Not Connected
                </span>
              )}
            </div>

            {slackStatus?.connected && slackStatus.connections.length > 0 ? (
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                {slackStatus.connections.map((c) => (
                  <div key={c.id} className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-800">Team:</span> {c.teamName || c.teamId}
                    </div>
                    {c.channelName && (
                      <div>
                        <span className="font-semibold text-slate-800">Channel:</span> #{c.channelName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-2">
                Connect your workspace Slack channel to receive deduplicated alerts whenever an email sender hits its hourly quota limit.
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            {slackStatus?.connected ? (
              <>
                <button
                  type="button"
                  onClick={handleTestAlert}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>{loading ? 'Sending...' : 'Send Test Rate-Limit Alert'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="px-4 py-2.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnectSlack}
                disabled={loading}
                className="w-full px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span>Connect with Slack OAuth</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 ml-1" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
