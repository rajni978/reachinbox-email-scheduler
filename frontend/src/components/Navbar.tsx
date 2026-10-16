import type { User, SlackStatus } from '../types';
import { Mail, Plus, ExternalLink, MessageSquare, LogOut, CheckCircle, AlertTriangle } from 'lucide-react';

interface NavbarProps {
  user: User | null;
  slackStatus: SlackStatus | null;
  onOpenCompose: () => void;
  onOpenSlackModal: () => void;
  onLogout: () => void;
  onDevLogin: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  slackStatus,
  onOpenCompose,
  onOpenSlackModal,
  onLogout,
  onDevLogin,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">ReachInbox</h1>
            <p className="text-xs font-medium text-slate-500">Autonomous Email Scheduler</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {/* BullMQ Dashboard Link */}
          <a
            href="/admin/queues"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
            title="Open protected BullMQ Board queue dashboard"
          >
            <span>BullMQ Board</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
          </a>

          {/* Slack Integration Button */}
          <button
            onClick={onOpenSlackModal}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              slackStatus?.connected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>{slackStatus?.connected ? 'Slack Connected' : 'Connect Slack'}</span>
            {slackStatus?.connected ? (
              <CheckCircle className="w-3 h-3 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-500" />
            )}
          </button>

          {/* Compose Email Action */}
          <button
            onClick={onOpenCompose}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm shadow-brand-600/30 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Compose Email</span>
          </button>

          {/* User Profile */}
          {user ? (
            <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
              <img
                src={user.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=ReachInbox'}
                alt={user.name || 'User avatar'}
                className="w-8 h-8 rounded-full border border-slate-200 object-cover"
              />
              <div className="hidden md:block text-left">
                <div className="text-xs font-semibold text-slate-800 leading-tight">
                  {user.name || user.email.split('@')[0]}
                </div>
                <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{user.email}</div>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100 transition-colors"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onDevLogin}
              className="px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100"
            >
              Sign In Demo
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
