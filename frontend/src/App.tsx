import { useState, useEffect, useCallback } from 'react';
import type { User, Sender, EmailJob, DashboardStats, SlackStatus } from './types';
import { api } from './services/api';
import { Navbar } from './components/Navbar';
import { StatsOverview } from './components/StatsOverview';
import { ScheduledEmailsTable } from './components/ScheduledEmailsTable';
import { SentEmailsTable } from './components/SentEmailsTable';
import { ComposeModal } from './components/ComposeModal';
import { SlackModal } from './components/SlackModal';
import {
  Calendar,
  CheckCircle2,
  Users,
  Search,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Check,
  AlertCircle
} from 'lucide-react';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
  const [senders, setSenders] = useState<Sender[]>([]);

  // Active Tab: 'scheduled' | 'sent' | 'senders'
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent' | 'senders'>('scheduled');

  // Emails data
  const [scheduledJobs, setScheduledJobs] = useState<EmailJob[]>([]);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [scheduledPages, setScheduledPages] = useState(1);
  const [scheduledPage, setScheduledPage] = useState(1);

  const [sentJobs, setSentJobs] = useState<EmailJob[]>([]);
  const [sentTotal, setSentTotal] = useState(0);
  const [sentPages, setSentPages] = useState(1);
  const [sentPage, setSentPage] = useState(1);

  // Search state (Elasticsearch)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchSource, setSearchSource] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Loading & Modals
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [loadingSent, setLoadingSent] = useState(false);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSlackOpen, setIsSlackOpen] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Initial Data Fetching
  const fetchUserData = useCallback(async () => {
    const currentUser = await api.getCurrentUser();
    setUser(currentUser);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err: any) {
      console.warn('Stats fetch notice:', err.message);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchSlack = useCallback(async () => {
    try {
      const data = await api.getSlackStatus();
      setSlackStatus(data);
    } catch (err: any) {
      console.warn('Slack status fetch notice:', err.message);
    }
  }, []);

  const fetchSenders = useCallback(async () => {
    try {
      const list = await api.getSenders();
      setSenders(list);
    } catch (err: any) {
      console.warn('Senders fetch error:', err.message);
    }
  }, []);

  const fetchScheduled = useCallback(async (page = 1) => {
    try {
      setLoadingScheduled(true);
      const data = await api.getScheduledEmails(page, 15);
      setScheduledJobs(data.jobs);
      setScheduledTotal(data.total);
      setScheduledPages(data.totalPages);
      setScheduledPage(page);
    } catch (err: any) {
      console.error('Scheduled jobs error:', err);
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  const fetchSent = useCallback(async (page = 1) => {
    try {
      setLoadingSent(true);
      const data = await api.getSentEmails(page, 15);
      setSentJobs(data.jobs);
      setSentTotal(data.total);
      setSentPages(data.totalPages);
      setSentPage(page);
    } catch (err: any) {
      console.error('Sent jobs error:', err);
    } finally {
      setLoadingSent(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchStats(),
      fetchScheduled(scheduledPage),
      fetchSent(sentPage),
      fetchSenders(),
      fetchSlack(),
    ]);
  }, [fetchStats, fetchScheduled, fetchSent, fetchSenders, fetchSlack, scheduledPage, sentPage]);

  useEffect(() => {
    fetchUserData();
    refreshAll();

    // Auto-refresh every 8s so delayed jobs moving to Sent appear automatically
    const interval = setInterval(() => {
      fetchStats();
      if (activeTab === 'scheduled') fetchScheduled(scheduledPage);
      if (activeTab === 'sent') fetchSent(sentPage);
    }, 8000);

    return () => clearInterval(interval);
  }, [fetchUserData, refreshAll, activeTab, scheduledPage, sentPage, fetchScheduled, fetchSent, fetchStats]);

  // Handle Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchSource(null);
      return;
    }

    try {
      setIsSearching(true);
      const res = await api.searchEmails(searchQuery);
      setSearchResults(res.hits);
      setSearchSource(res.source);
    } catch (err: any) {
      showNotification('error', `Search failed: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchSource(null);
  };

  // Actions
  const handleCancelJob = async (id: string) => {
    try {
      await api.cancelJob(id);
      showNotification('success', 'Email job successfully cancelled');
      fetchScheduled(scheduledPage);
      fetchStats();
    } catch (err: any) {
      showNotification('error', err.message || 'Error cancelling job');
    }
  };

  const handleRetryJob = async (id: string) => {
    try {
      await api.retryJob(id);
      showNotification('success', 'Email queued for immediate retry');
      fetchScheduled(scheduledPage);
      fetchStats();
    } catch (err: any) {
      showNotification('error', err.message || 'Error retrying job');
    }
  };

  const handleTestSender = async (senderId: string) => {
    try {
      const msg = await api.testSender(senderId);
      showNotification('success', msg);
    } catch (err: any) {
      showNotification('error', err.message || 'SMTP test failed');
    }
  };

  const handleCreateEthereal = async () => {
    try {
      const sender = await api.createEtherealSender();
      await fetchSenders();
      showNotification('success', `Created Ethereal test sender: ${sender.email}`);
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to create Ethereal sender');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    showNotification('success', 'Logged out successfully');
  };

  const handleDevLogin = async () => {
    const devUser = await api.devLogin();
    setUser(devUser);
    showNotification('success', `Signed in as ${devUser.name}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-bottom-5 duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {notification.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        user={user}
        slackStatus={slackStatus}
        onOpenCompose={() => setIsComposeOpen(true)}
        onOpenSlackModal={() => setIsSlackOpen(true)}
        onLogout={handleLogout}
        onDevLogin={handleDevLogin}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Metric Cards */}
        <StatsOverview stats={stats} loading={loadingStats} />

        {/* Search & Action Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Elasticsearch Search Form */}
          <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search emails by recipient, subject, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-24 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-12 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg"
            >
              {isSearching ? '...' : 'Search'}
            </button>
          </form>

          {/* Refresh Action */}
          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
              title="Refresh all metrics and queues"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Results Display */}
        {searchResults && (
          <div className="bg-white rounded-2xl border border-brand-200 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <span>Search Results ({searchResults.length})</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                  Engine: {searchSource || 'Elasticsearch'}
                </span>
              </div>
              <button
                onClick={handleClearSearch}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                Close Search
              </button>
            </div>
            {searchResults.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No emails matched "{searchQuery}"
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {searchResults.map((item: any, idx: number) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">{item.recipientEmail}</div>
                      <div className="text-slate-500">{item.subject}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {item.status}
                      </span>
                      {item.etherealUrl && (
                        <a
                          href={item.etherealUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-brand-600 hover:underline"
                        >
                          View Ethereal
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Controls */}
        <div className="border-b border-slate-200">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('scheduled')}
              className={`py-3 px-1 border-b-2 font-bold text-xs flex items-center gap-2 transition-colors ${
                activeTab === 'scheduled'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Scheduled Emails</span>
              <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                {scheduledTotal}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('sent')}
              className={`py-3 px-1 border-b-2 font-bold text-xs flex items-center gap-2 transition-colors ${
                activeTab === 'sent'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Sent Emails</span>
              <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {sentTotal}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('senders')}
              className={`py-3 px-1 border-b-2 font-bold text-xs flex items-center gap-2 transition-colors ${
                activeTab === 'senders'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Senders & SMTP</span>
              <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {senders.length}
              </span>
            </button>
          </nav>
        </div>

        {/* Tab Views */}
        {activeTab === 'scheduled' && (
          <ScheduledEmailsTable
            jobs={scheduledJobs}
            loading={loadingScheduled}
            onCancelJob={handleCancelJob}
            onRetryJob={handleRetryJob}
            page={scheduledPage}
            totalPages={scheduledPages}
            onPageChange={(p) => fetchScheduled(p)}
          />
        )}

        {activeTab === 'sent' && (
          <SentEmailsTable
            jobs={sentJobs}
            loading={loadingSent}
            page={sentPage}
            totalPages={sentPages}
            onPageChange={(p) => fetchSent(p)}
          />
        )}

        {activeTab === 'senders' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Configured Multi-Sender SMTP Accounts</h3>
                <p className="text-xs text-slate-500">Each sender enforces independent hourly rate limits and delay spacing</p>
              </div>
              <button
                onClick={handleCreateEthereal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+ Create Ethereal Test Sender</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {senders.map((s) => (
                <div key={s.id} className="py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">{s.name}</span>
                      {s.isDefault && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-brand-100 text-brand-800 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{s.email}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Host: {s.host}:{s.port} | Hourly Quota: {s.currentUsage || 0}/{s.hourlyLimit} emails
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTestSender(s.id)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Verify SMTP
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Compose Email Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onScheduled={() => {
          showNotification('success', 'Email campaign scheduled into BullMQ delayed queue!');
          setActiveTab('scheduled');
          fetchScheduled(1);
          fetchStats();
        }}
        senders={senders}
        onRefreshSenders={fetchSenders}
      />

      {/* Slack Integration Modal */}
      <SlackModal
        isOpen={isSlackOpen}
        onClose={() => setIsSlackOpen(false)}
        slackStatus={slackStatus}
        onRefreshStatus={fetchSlack}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-brand-600" />
            <span>ReachInbox Full-Stack Scheduler — BullMQ + Redis + PostgreSQL + Elasticsearch</span>
          </div>
          <div className="text-slate-400">
            Node.js {import.meta.env.MODE || 'development'} | Concurrency: 5
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
