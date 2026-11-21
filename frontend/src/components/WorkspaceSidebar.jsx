import { useState, useMemo } from 'react';
import {
  Calendar,
  Ticket,
  RefreshCw,
  FileText,
  Upload,
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  Clock,
  Tag,
  Copy,
  Check,
} from 'lucide-react';

const POLICY_GUIDES = [
  {
    id: 'wfh',
    title: 'Work-From-Home (WFH) Policy',
    category: 'HR Policy',
    sourceFile: 'hr_leave_and_wfh_policy.txt',
    section: 'Section 4: Work-From-Home (WFH) Policy',
    summary:
      'Hybrid employees may work remotely up to 2 days/week with manager approval and core-hour availability (10:00 AM – 4:00 PM).',
  },
  {
    id: 'leave',
    title: 'Annual, Sick & Casual Leave Rules',
    category: 'HR Policy',
    sourceFile: 'hr_leave_and_wfh_policy.txt',
    section: 'Section 1–3: Leave Entitlements',
    summary:
      'Track remaining balance in real time via chat or My Status. Planned leave requires advance team coverage and manager sign-off.',
  },
  {
    id: 'reimb',
    title: 'Hardware, Software & Expense Reimbursement',
    category: 'Finance & IT',
    sourceFile: 'reimbursement_and_it_policy.txt',
    section: 'Section 2–3: Reimbursement & Support',
    summary:
      'Submit itemized receipts/invoices within policy windows for approved hardware, software tools, and work-related expenses.',
  },
  {
    id: 'vpn',
    title: 'IT Security, VPN & Device Support',
    category: 'IT Support',
    sourceFile: 'reimbursement_and_it_policy.txt',
    section: 'Section 1–2: IT Security Policy',
    summary:
      'Use approved networks and report VPN, SSO, or workstation issues immediately by creating an IT support ticket.',
  },
];

const TICKET_STATUS_FILTERS = ['All', 'Open', 'In Progress', 'Resolved'];

export default function WorkspaceSidebar({
  isOpen,
  onCloseMobile,
  isAdmin,
  leaveBalance,
  visibleTickets = [],
  allTickets = [],
  activeTab,
  setActiveTab,
  kbDocs,
  auditLogs = [],
  loadingDash,
  uploadingDoc,
  onRefresh,
  onTicketStatusChange,
  onFileUpload,
  fileInputRef,
  selectedTicketId,
  onSelectTicket,
}) {
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState('All');
  const [copiedId, setCopiedId] = useState(null);

  const [policySearch, setPolicySearch] = useState('');
  const [policyCategory, setPolicyCategory] = useState('All');
  const [expandedPolicyId, setExpandedPolicyId] = useState(null);

  const ticketsToShow = isAdmin ? allTickets : visibleTickets;

  const filteredTickets = useMemo(() => {
    const q = ticketSearch.trim().toLowerCase();
    return ticketsToShow.filter((t) => {
      const status = String(t.status || '').toLowerCase();
      const matchesStatus =
        ticketStatusFilter === 'All' || status === ticketStatusFilter.toLowerCase();

      const matchesQuery =
        !q ||
        String(t.ticket_id || '').toLowerCase().includes(q) ||
        String(t.issue_category || '').toLowerCase().includes(q) ||
        String(t.description || '').toLowerCase().includes(q) ||
        String(t.priority || '').toLowerCase().includes(q) ||
        String(t.employee_id || '').toLowerCase().includes(q);

      return matchesStatus && matchesQuery;
    });
  }, [ticketsToShow, ticketSearch, ticketStatusFilter]);

  const selectedTicket = useMemo(
    () => ticketsToShow.find((t) => t.ticket_id === selectedTicketId) || null,
    [ticketsToShow, selectedTicketId]
  );

  const filteredPolicies = useMemo(() => {
    return POLICY_GUIDES.filter((p) => {
      const matchesCat = policyCategory === 'All' || p.category === policyCategory;
      const q = policySearch.trim().toLowerCase();
      const matchesQuery =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.summary.toLowerCase().includes(q) ||
        p.sourceFile.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [policySearch, policyCategory]);

  const handleCopyTicket = async (e, ticketId) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(ticketId);
      setCopiedId(ticketId);
      setTimeout(() => setCopiedId((prev) => (prev === ticketId ? null : prev)), 1500);
    } catch {
      // Clipboard unavailable in restricted browser context
    }
  };

  if (!isOpen) return null;

  const totalEntitlement =
    Number(leaveBalance?.annual_leave || 0) +
    Number(leaveBalance?.sick_leave || 0) +
    Number(leaveBalance?.casual_leave || 0);
  const usedDays = Number(leaveBalance?.used_leave || 0);

  const computedRemaining =
    leaveBalance?.total_remaining ??
    leaveBalance?.remaining_total_leave ??
    (leaveBalance ? Math.max(totalEntitlement - usedDays, 0) : 0);

  const hasActiveTicketFilters =
    Boolean(ticketSearch.trim()) || ticketStatusFilter !== 'All';

  return (
    <>
      <div
        onClick={onCloseMobile}
        className="fixed inset-0 z-30 bg-slate-950/75 backdrop-blur-[2px] md:hidden"
      />

      <aside className="fixed inset-y-0 right-0 z-40 w-[88vw] max-w-sm md:static md:w-[34%] md:min-w-[310px] md:max-w-[420px] border-l border-slate-800/90 bg-[#080d1d]/95 backdrop-blur flex flex-col shrink-0 transition-all duration-200 overflow-x-hidden">
        {/* Panel Header */}
        <div className="h-12 px-4 border-b border-slate-800/90 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`h-7 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isAdmin ? 'Admin Desk' : 'My Status'}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kb')}
              className={`h-7 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
                activeTab === 'kb'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Policies
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className={`h-7 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Audit
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loadingDash}
              className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 inline-flex items-center justify-center transition active:scale-95 cursor-pointer"
              title="Refresh panel data"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingDash ? 'animate-spin text-indigo-400' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 inline-flex items-center justify-center md:hidden cursor-pointer"
              title="Close panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-5">
          {activeTab === 'overview' && (
            <>
              {selectedTicket && (
                <div className="rounded-xl bg-indigo-950/30 border border-indigo-500/35 p-4 space-y-2 animate-msg-enter">
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-indigo-300">
                        {selectedTicket.ticket_id}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyTicket(e, selectedTicket.ticket_id)}
                        className="w-6 h-6 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white inline-flex items-center justify-center transition cursor-pointer"
                        title={`Copy ${selectedTicket.ticket_id}`}
                      >
                        {copiedId === selectedTicket.ticket_id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectTicket(null)}
                      className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <div className="text-xs font-medium text-slate-100">
                    {selectedTicket.issue_category}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed break-words">
                    {selectedTicket.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Tag className="w-3 h-3 text-indigo-400" />
                      {selectedTicket.priority} • {selectedTicket.status}
                    </span>
                    {selectedTicket.created_at && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {new Date(selectedTicket.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Persistent Leave Balance Section */}
              {leaveBalance && (
                <div className="rounded-xl bg-[#0b1124] border border-slate-800/90 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      Leave Balance
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                      {computedRemaining} days left
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-[#070b18] border border-slate-800/80 rounded-lg p-2">
                      <div className="text-sm font-bold text-slate-100">
                        {leaveBalance.annual_leave}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Annual</div>
                    </div>
                    <div className="bg-[#070b18] border border-slate-800/80 rounded-lg p-2">
                      <div className="text-sm font-bold text-slate-100">
                        {leaveBalance.sick_leave}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Sick</div>
                    </div>
                    <div className="bg-[#070b18] border border-slate-800/80 rounded-lg p-2">
                      <div className="text-sm font-bold text-slate-100">
                        {leaveBalance.casual_leave}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Casual</div>
                    </div>
                    <div className="bg-[#070b18] border border-slate-800/80 rounded-lg p-2">
                      <div className="text-sm font-bold text-amber-300">
                        {leaveBalance.used_leave}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Used</div>
                    </div>
                  </div>
                </div>
              )}

              {/* IT Tickets Section with Search & Status Filter */}
              {ticketsToShow.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5 text-emerald-400" />
                      {isAdmin ? 'Company IT Tickets' : 'My IT Tickets'}
                    </h2>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-300">
                      {filteredTickets.length === ticketsToShow.length
                        ? ticketsToShow.length
                        : `${filteredTickets.length} / ${ticketsToShow.length}`}
                    </span>
                  </div>

                  {/* Ticket Search & Status Pills */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={ticketSearch}
                        onChange={(e) => setTicketSearch(e.target.value)}
                        placeholder="Search ticket ID, category, or issue..."
                        className="w-full h-8 pl-8 pr-7 rounded-xl bg-[#070b18] border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      />
                      {ticketSearch && (
                        <button
                          type="button"
                          onClick={() => setTicketSearch('')}
                          className="text-slate-500 hover:text-slate-300 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                          title="Clear ticket search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {TICKET_STATUS_FILTERS.map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setTicketStatusFilter(status)}
                          className={`h-6 px-2.5 rounded-md text-[10px] font-medium transition cursor-pointer ${
                            ticketStatusFilter === status
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredTickets.length === 0 ? (
                    <div className="rounded-xl bg-[#0b1124] border border-slate-800/80 p-3.5 text-center space-y-2">
                      <p className="text-xs text-slate-400">
                        No tickets match your current search or filter.
                      </p>
                      {hasActiveTicketFilters && (
                        <button
                          type="button"
                          onClick={() => {
                            setTicketSearch('');
                            setTicketStatusFilter('All');
                          }}
                          className="text-[11px] font-medium text-indigo-300 hover:text-white cursor-pointer"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredTickets.map((t) => {
                        const isSelected = t.ticket_id === selectedTicketId;
                        return (
                          <div
                            key={t.ticket_id}
                            onClick={() => onSelectTicket(isSelected ? null : t.ticket_id)}
                            className={`rounded-xl p-4 space-y-1.5 border transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-950/35 border-indigo-500/50'
                                : 'bg-[#0b1124] border-slate-800/90 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="inline-flex items-center gap-1.5 min-w-0">
                                <span className="font-mono text-xs font-semibold text-indigo-300 truncate">
                                  {t.ticket_id}
                                  {isAdmin && (
                                    <span className="text-slate-500 font-normal">
                                      {' '}
                                      • {t.employee_id}
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyTicket(e, t.ticket_id)}
                                  className="w-6 h-6 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white inline-flex items-center justify-center transition cursor-pointer shrink-0"
                                  title={`Copy ${t.ticket_id}`}
                                >
                                  {copiedId === t.ticket_id ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                                    t.priority === 'High'
                                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                                      : 'bg-slate-800 text-slate-300 border border-slate-700/70'
                                  }`}
                                >
                                  {t.priority}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
                                    t.status === 'Resolved' || t.status === 'Closed'
                                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                      : 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                                  }`}
                                >
                                  {t.status}
                                </span>
                              </div>
                            </div>

                            <div className="text-xs font-medium text-slate-100">
                              {t.issue_category}
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed break-words">
                              {t.description}
                            </p>

                            {isAdmin && t.status !== 'Resolved' && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="pt-2 flex gap-1.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => onTicketStatusChange(t.ticket_id, 'In Progress')}
                                  className="h-7 px-2.5 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                                >
                                  In Progress
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onTicketStatusChange(t.ticket_id, 'Resolved')}
                                  className="h-7 px-2.5 rounded-lg text-[11px] bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 transition cursor-pointer"
                                >
                                  Mark Resolved
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'kb' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Policies ({kbDocs?.total_chunks ?? 0} chunks)
                </h2>
                {isAdmin && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.pdf,.docx"
                      onChange={onFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingDoc}
                      className="h-7 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3 h-3" />
                      {uploadingDoc ? 'Indexing...' : 'Upload'}
                    </button>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={policySearch}
                    onChange={(e) => setPolicySearch(e.target.value)}
                    placeholder="Search policies or documents..."
                    className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#070b18] border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {['All', 'HR Policy', 'Finance & IT', 'IT Support'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPolicyCategory(cat)}
                      className={`h-6 px-2.5 rounded-md text-[10px] font-medium transition cursor-pointer ${
                        policyCategory === cat
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {filteredPolicies.length === 0 ? (
                  <div className="rounded-xl bg-[#0b1124] border border-slate-800/80 p-4 text-center text-xs text-slate-400">
                    No matching policies found.
                  </div>
                ) : (
                  filteredPolicies.map((pol) => {
                    const open = expandedPolicyId === pol.id;
                    return (
                      <div
                        key={pol.id}
                        className="rounded-xl bg-[#0b1124] border border-slate-800/90 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedPolicyId(open ? null : pol.id)}
                          className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-900/60 transition cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-100 truncate">
                              {pol.title}
                            </div>
                            <div className="text-[10px] text-indigo-300/80">{pol.category}</div>
                          </div>
                          {open ? (
                            <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </button>
                        {open && (
                          <div className="px-3.5 pb-3 pt-1.5 border-t border-slate-800/70 space-y-1.5 text-xs text-slate-300">
                            <p className="leading-relaxed">{pol.summary}</p>
                            <div className="text-[10px] font-mono text-slate-400 break-all">
                              {pol.sourceFile} • {pol.section}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {(kbDocs?.documents || []).length > 0 && (
                <div className="pt-1 space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Indexed Policy Files
                  </div>
                  {kbDocs.documents.map((doc, idx) => (
                    <div
                      key={idx}
                      className="bg-[#070b18] border border-slate-800/80 rounded-xl px-3.5 py-2 flex items-center justify-between"
                    >
                      <span className="text-xs font-mono text-slate-200 truncate pr-2">
                        {doc.filename}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 shrink-0">
                        {doc.chunks} chunks
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && isAdmin && (
            <div className="space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Security & RBAC Audit Trail
              </h2>

              <div className="space-y-2">
                {auditLogs.length === 0 ? (
                  <div className="rounded-xl bg-[#0b1124] border border-slate-800/80 p-4 text-center text-xs text-slate-400">
                    No audit log entries recorded yet.
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-[#0b1124] border border-slate-800/90 rounded-xl p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-slate-300 truncate">
                          {log.event_type} ({log.actor_id || 'anon'})
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-medium shrink-0 ${
                            log.outcome === 'blocked' || log.outcome === 'denied'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800/70'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800/70'
                          }`}
                        >
                          {log.outcome}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{log.details}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}