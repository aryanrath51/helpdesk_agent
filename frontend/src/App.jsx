import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  ShieldAlert,
  LogOut,
  Bot,
  User,
  Sparkles,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Ticket,
  FileText,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import StructuredReply from './components/StructuredReply';
import WorkspaceSidebar from './components/WorkspaceSidebar';

const WELCOME_QUICK_ACTIONS = [
  {
    label: 'Check Leave Balance',
    prompt: 'What is my remaining leave balance?',
    icon: Calendar,
  },
  {
    label: 'Create IT Ticket',
    prompt: 'Create a high-priority IT ticket because my VPN client fails to connect.',
    icon: Ticket,
  },
  {
    label: 'Search HR Policies',
    prompt: 'What does the Work-From-Home (WFH) policy say?',
    icon: FileText,
  },
  {
    label: 'Check Reimbursements',
    prompt: 'What is the expense reimbursement limit for hardware/software?',
    icon: Receipt,
  },
];

function formatMessageTime(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getContextualPrompts(messages, isAdmin) {
  if (!messages.length) return [];
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const tools = lastAssistant?.tools_used || [];

  if (tools.includes('get_leave_balance_tool')) {
    return [
      'What does the WFH policy say?',
      'What is the annual leave carry-over rule?',
      'Create a low-priority IT ticket for an HR portal question.',
    ];
  }
  if (tools.includes('create_it_ticket_tool') || tools.includes('get_ticket_status_tool')) {
    return [
      'Check the status of my latest IT ticket.',
      'What is the hardware/software reimbursement policy?',
      'What is my remaining leave balance?',
    ];
  }
  if (tools.includes('search_hr_it_policies')) {
    return [
      'What is my remaining leave balance?',
      'Create a high-priority IT ticket because my VPN client fails to connect.',
      isAdmin ? 'Show recent audit log activity.' : 'What is the reimbursement claim deadline?',
    ];
  }
  return [
    'What is my remaining leave balance?',
    'Create a high-priority IT ticket because my VPN client fails to connect.',
    'What is the expense reimbursement limit for hardware/software?',
  ];
}

export default function App() {
  const [employeeId, setEmployeeId] = useState('E101');
  const [token, setToken] = useState(() => localStorage.getItem('hd_token') || '');
  const [userProfile, setUserProfile] = useState(() => {
    const saved = localStorage.getItem('hd_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const [toast, setToast] = useState(null);

  // Progressive session-scoped context panel state (hidden on fresh tab, persists on refresh)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLeave, setShowLeave] = useState(
    () => sessionStorage.getItem('hd_show_leave') === 'true'
  );
  const [sessionTicketIds, setSessionTicketIds] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('hd_session_tickets') || '[]');
    } catch {
      return [];
    }
  });
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'kb' | 'audit'
  const [dashboard, setDashboard] = useState(null);
  const [kbDocs, setKbDocs] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingDash, setLoadingDash] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const hasScrolledOnUpdateRef = useRef(false);

  const hasSidebarContent = showLeave || sessionTicketIds.length > 0;
  const showWelcomeScreen = messages.length === 0 && !sending;

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  // Reset initial scroll position on mount / empty conversation; smooth-scroll on new messages
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (messages.length === 0 && !sending) {
      container.scrollTop = 0;
      hasScrolledOnUpdateRef.current = false;
      return;
    }

    const frame = requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: hasScrolledOnUpdateRef.current ? 'smooth' : 'auto',
      });
      hasScrolledOnUpdateRef.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [messages, sending]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 120)}px`;
  }, [input]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setBannerError('');
    setSelectedTicketId(null);
    hasScrolledOnUpdateRef.current = false;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    showToast('Started a new conversation');
  }, [showToast]);

  const handleLogout = useCallback(() => {
    setToken('');
    setUserProfile(null);
    setDashboard(null);
    setMessages([]);
    setShowLeave(false);
    setSessionTicketIds([]);
    setSelectedTicketId(null);
    setBannerError('');
    hasScrolledOnUpdateRef.current = false;
    localStorage.removeItem('hd_token');
    localStorage.removeItem('hd_user');
    sessionStorage.removeItem('hd_interacted');
    sessionStorage.removeItem('hd_show_leave');
    sessionStorage.removeItem('hd_session_tickets');
  }, []);

  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    setLoadingDash(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const dashRes = await fetch('/api/dashboard', { headers });
      if (dashRes.status === 401) {
        handleLogout();
        return;
      }
      if (dashRes.ok) {
        const dashJson = await dashRes.json();
        setDashboard(dashJson);

        const docsRes = await fetch('/api/documents', { headers });
        if (docsRes.ok) setKbDocs(await docsRes.json());

        if (dashJson.is_admin) {
          const logsRes = await fetch('/api/audit-logs?limit=25', { headers });
          if (logsRes.ok) setAuditLogs(await logsRes.json());
        }
      }
    } catch {
      setBannerError('Unable to sync workspace data with the server.');
    } finally {
      setLoadingDash(false);
    }
  }, [token, handleLogout]);

  useEffect(() => {
    if (token && hasSidebarContent) {
      fetchDashboardData();
    }
  }, [token, hasSidebarContent, fetchDashboardData]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!employeeId.trim()) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Authentication failed');
      setToken(data.access_token);
      setUserProfile(data);
      localStorage.setItem('hd_token', data.access_token);
      localStorage.setItem('hd_user', JSON.stringify(data));
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const sendMessage = async (textToSend) => {
    const query = (textToSend ?? input).trim();
    if (!query || sending) return;

    const sentAt = Date.now();
    setBannerError('');
    setMessages((prev) => [...prev, { role: 'user', content: query, timestamp: sentAt }]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: query }),
      });

      if (res.status === 401) {
        handleLogout();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Server error');

      const tools = data.tools_used || [];
      const replyText = data.reply || '';

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: replyText,
          citations: data.citations || [],
          tools_used: tools,
          blocked: Boolean(data.blocked),
          timestamp: Date.now(),
        },
      ]);

      let shouldFetch = false;

      if (tools.includes('get_leave_balance_tool')) {
        setShowLeave(true);
        sessionStorage.setItem('hd_show_leave', 'true');
        shouldFetch = true;
      }

      if (
        tools.includes('create_it_ticket_tool') ||
        tools.includes('get_ticket_status_tool')
      ) {
        const matchedIds = replyText.match(/TKT-\d+/gi) || [];
        if (matchedIds.length > 0) {
          const normalized = matchedIds.map((id) => id.toUpperCase());
          setSessionTicketIds((prev) => {
            const updated = Array.from(new Set([...normalized, ...prev]));
            sessionStorage.setItem('hd_session_tickets', JSON.stringify(updated));
            return updated;
          });
          shouldFetch = true;
        }
      }

      if (shouldFetch) {
        fetchDashboardData();
      }
    } catch (err) {
      setBannerError(err.message || 'Failed to send message.');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Request failed: ${err.message}`,
          citations: [],
          tools_used: [],
          blocked: false,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTicketStatusChange = async (ticketId, newStatus) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showToast(`${ticketId} marked as ${newStatus}`);
        fetchDashboardData();
      }
    } catch {
      showToast('Could not update ticket status', 'error');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        showToast(`Indexed ${file.name}`);
        await fetchDashboardData();
      } else {
        const errData = await res.json().catch(() => ({}));
        showToast(errData.detail || 'Policy upload failed', 'error');
      }
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  if (!token) {
    return (
      <div className="min-h-dvh w-full max-w-full bg-[#060913] text-slate-100 flex items-center justify-center p-4 overflow-x-hidden overflow-y-auto">
        <div className="w-full max-w-md bg-[#0b1021] border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight text-white truncate">
                Enterprise Helpdesk Agent
              </h1>
              <p className="text-xs text-slate-400">
                Sign in with your employee ID to continue
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-400 mb-1.5">
                Employee ID
              </label>
              <input
                type="text"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="e.g., E101"
                className="w-full h-11 px-3.5 rounded-xl bg-[#060913] border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="break-words">{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition active:scale-[0.99] cursor-pointer"
            >
              {authLoading ? 'Signing in...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isAdmin = Boolean(dashboard?.is_admin);
  const lb = showLeave ? dashboard?.leave_balance : null;
  const allTickets = dashboard?.tickets || [];
  const visibleTickets =
    sessionTicketIds.length > 0
      ? allTickets.filter((t) => sessionTicketIds.includes(t.ticket_id))
      : [];

  const displayName = userProfile?.name || userProfile?.employee_id || employeeId;
  const firstName = String(displayName).split(' ')[0];
  const initials = String(displayName)
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const contextualPrompts = !showWelcomeScreen
    ? getContextualPrompts(messages, isAdmin)
    : [];

  return (
    <div className="h-dvh w-full max-w-full bg-[#060913] text-slate-100 flex flex-col overflow-x-hidden overflow-y-hidden">
      {/* Toast Feedback */}
      {toast && (
        <div
          className={`fixed bottom-24 right-4 sm:right-5 z-50 max-w-[calc(100vw-2rem)] px-3.5 py-2.5 rounded-xl border text-xs font-medium shadow-lg flex items-center gap-2 animate-msg-enter ${
            toast.type === 'error'
              ? 'bg-rose-950/95 border-rose-700/70 text-rose-200'
              : 'bg-[#0d142b]/95 border-indigo-500/40 text-slate-100'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="truncate">{toast.message}</span>
        </div>
      )}

      {/* Fixed Top Navigation */}
      <header className="h-14 border-b border-slate-800/90 bg-[#080d1c]/95 backdrop-blur px-3 sm:px-6 flex items-center justify-between gap-2 shrink-0 overflow-x-hidden">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/25 to-violet-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <h1 className="font-semibold text-sm sm:text-base tracking-tight text-white truncate">
            Enterprise Helpdesk Agent
          </h1>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2.5 pr-1">
            <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-[11px] font-semibold text-indigo-200 flex items-center justify-center shrink-0">
              {initials || 'EMP'}
            </div>
            <div className="text-right leading-tight">
              <div className="text-xs font-medium text-slate-100">{displayName}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                {userProfile?.employee_id || employeeId} • {userProfile?.role || 'Employee'}
              </div>
            </div>
          </div>

          {!showWelcomeScreen && (
            <button
              type="button"
              onClick={handleClearChat}
              disabled={sending}
              className="h-8 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              title="Start a new chat"
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">New Chat</span>
            </button>
          )}

          {hasSidebarContent && (
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="h-8 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
              title="Toggle employee panel"
            >
              {sidebarOpen ? (
                <>
                  <PanelRightClose className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden md:inline">Hide Panel</span>
                </>
              ) : (
                <>
                  <PanelRightOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden md:inline">Show Panel</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="h-8 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs inline-flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
        {/* Central Chat Column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {bannerError && (
            <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-3 shrink-0">
              <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-3.5 py-2 text-xs text-rose-200 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="truncate">{bannerError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setBannerError('')}
                  className="text-rose-300 hover:text-white text-[11px] shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Dedicated Scrollable Messages / Welcome Area */}
          <main
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-6"
          >
            <div className="w-full max-w-5xl mx-auto min-h-full flex flex-col">
              {showWelcomeScreen ? (
                <div className="flex-1 flex items-center justify-center py-4">
                  <div className="w-full max-w-2xl rounded-2xl bg-[#0b1021] border border-slate-800/90 p-5 sm:p-7 space-y-5 animate-msg-enter">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white">
                          Welcome{firstName ? `, ${firstName}` : ''}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                          Your AI workspace for checking leave balances, opening IT support tickets, and looking up HR and reimbursement policies.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {WELCOME_QUICK_ACTIONS.map((action) => {
                        const IconComponent = action.icon;
                        return (
                          <button
                            key={action.label}
                            type="button"
                            onClick={() => sendMessage(action.prompt)}
                            className="group rounded-xl bg-[#070b18] hover:bg-slate-900/90 border border-slate-800/90 hover:border-indigo-500/45 px-3.5 py-3 text-left flex items-center gap-2.5 transition active:scale-[0.99] cursor-pointer min-w-0"
                          >
                            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 group-hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-300 flex items-center justify-center shrink-0 transition">
                              <IconComponent className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-medium text-slate-200 group-hover:text-white transition truncate">
                              {action.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {messages.map((msg, idx) => {
                    const timeLabel = formatMessageTime(msg.timestamp);
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-2.5 sm:gap-3 min-w-0 animate-msg-enter ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        {msg.role === 'assistant' && (
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              msg.blocked
                                ? 'bg-rose-950/80 border border-rose-700/70 text-rose-300'
                                : 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300'
                            }`}
                          >
                            {msg.blocked ? (
                              <ShieldAlert className="w-4 h-4" />
                            ) : (
                              <Bot className="w-4 h-4" />
                            )}
                          </div>
                        )}

                        <div
                          className={`flex flex-col min-w-0 max-w-[86%] sm:max-w-[82%] ${
                            msg.role === 'user' ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div
                            className={`w-fit max-w-full min-w-0 rounded-2xl px-4 py-3.5 text-sm leading-relaxed break-words ${
                              msg.role === 'user'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : msg.blocked
                                ? 'bg-rose-950/35 border border-rose-800/70 text-rose-100'
                                : 'bg-[#0b1021] border border-slate-800/90 text-slate-100'
                            }`}
                          >
                            {msg.blocked && (
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-300 mb-2">
                                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                                Guardrail Blocked Request
                              </div>
                            )}

                            {msg.role === 'assistant' ? (
                              <StructuredReply
                                content={msg.content}
                                toolsUsed={msg.tools_used || []}
                                citations={msg.citations || []}
                                blocked={Boolean(msg.blocked)}
                                onSelectTicket={(tid) => {
                                  setSelectedTicketId(tid);
                                  setActiveTab('overview');
                                  setSidebarOpen(true);
                                }}
                                onToast={showToast}
                              />
                            ) : (
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            )}
                          </div>

                          {timeLabel && (
                            <span className="mt-1 px-1 text-[10px] font-mono text-slate-500 select-none">
                              {timeLabel}
                            </span>
                          )}
                        </div>

                        {msg.role === 'user' && (
                          <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5 text-slate-300">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {sending && (
                    <div className="flex items-center gap-3 text-slate-400 text-xs sm:text-sm animate-msg-enter">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                      <div className="inline-flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-[#0b1021] border border-slate-800/80">
                        <span>Thinking</span>
                        <span className="animate-pulse">...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>

          {/* Fixed Bottom Composer */}
          <footer className="border-t border-slate-800/90 bg-[#080d1c]/95 backdrop-blur px-4 sm:px-6 py-3.5 shrink-0 overflow-x-hidden">
            <div className="w-full max-w-5xl mx-auto space-y-2.5">
              {!showWelcomeScreen && contextualPrompts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {contextualPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={sending}
                      onClick={() => sendMessage(prompt)}
                      className="inline-flex items-center gap-1.5 min-h-7 max-w-full px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white text-[11px] border border-slate-800 hover:border-indigo-500/40 transition active:scale-[0.98] cursor-pointer disabled:opacity-50 text-left"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="truncate sm:whitespace-normal">{prompt}</span>
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="flex items-end gap-2 sm:gap-2.5 min-w-0"
              >
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Ask about leave balance, policies, or create an IT ticket..."
                  className="flex-1 min-w-0 min-h-[44px] resize-none px-3.5 py-2.5 rounded-xl bg-[#060913] border border-slate-800 text-sm leading-snug text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="h-[44px] px-3.5 sm:px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 text-white font-medium text-sm inline-flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </footer>
        </div>

        {/* Right Employee / Admin Context Panel (Collapsible Mobile Drawer) */}
        <WorkspaceSidebar
          isOpen={sidebarOpen && hasSidebarContent}
          onCloseMobile={() => setSidebarOpen(false)}
          isAdmin={isAdmin}
          leaveBalance={lb}
          visibleTickets={visibleTickets}
          allTickets={allTickets}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          kbDocs={kbDocs}
          auditLogs={auditLogs}
          loadingDash={loadingDash}
          uploadingDoc={uploadingDoc}
          onRefresh={fetchDashboardData}
          onTicketStatusChange={handleTicketStatusChange}
          onFileUpload={handleFileUpload}
          fileInputRef={fileInputRef}
          selectedTicketId={selectedTicketId}
          onSelectTicket={setSelectedTicketId}
        />
      </div>
    </div>
  );
}