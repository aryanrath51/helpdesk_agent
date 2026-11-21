import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Wrench,
  BookOpen,
  Copy,
  Check,
  Calendar,
  Ticket,
  Receipt,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
} from 'lucide-react';

function extractLeaveSummary(text, fallbackLeaveBalance) {
  const totalMatch =
    text.match(/remaining leave balance is\s*\*\*(\d+)\s*days?\*\*/i) ||
    text.match(/Total Remaining Leave:\s*\*{0,2}(\d+)\s*days?/i) ||
    text.match(/'remaining_total_leave'\s*:\s*(\d+)/i);
  const annualMatch =
    text.match(/Annual Leave:\s*\*{0,2}(\d+)\s*days?/i) ||
    text.match(/(\d+)\s*annual/i) ||
    text.match(/'annual_leave'\s*:\s*(\d+)/i);
  const sickMatch =
    text.match(/Sick Leave:\s*\*{0,2}(\d+)\s*days?/i) ||
    text.match(/(\d+)\s*sick/i) ||
    text.match(/'sick_leave'\s*:\s*(\d+)/i);
  const casualMatch =
    text.match(/Casual Leave:\s*\*{0,2}(\d+)\s*days?/i) ||
    text.match(/(\d+)\s*casual/i) ||
    text.match(/'casual_leave'\s*:\s*(\d+)/i);
  const usedMatch =
    text.match(/Used Leave:\s*\*{0,2}(\d+)\s*days?/i) ||
    text.match(/(\d+)\s*days?\s*already used/i) ||
    text.match(/'used_leave'\s*:\s*(\d+)/i);

  const hasTextMatch = Boolean(totalMatch || annualMatch || sickMatch || casualMatch || usedMatch);
  if (!hasTextMatch && !fallbackLeaveBalance) return null;

  const annual = annualMatch
    ? Number(annualMatch[1])
    : fallbackLeaveBalance?.annual_leave ?? null;
  const sick = sickMatch
    ? Number(sickMatch[1])
    : fallbackLeaveBalance?.sick_leave ?? null;
  const casual = casualMatch
    ? Number(casualMatch[1])
    : fallbackLeaveBalance?.casual_leave ?? null;
  const used = usedMatch
    ? Number(usedMatch[1])
    : fallbackLeaveBalance?.used_leave ?? null;
  const total = totalMatch
    ? Number(totalMatch[1])
    : fallbackLeaveBalance?.total_remaining ??
      (annual !== null && sick !== null && casual !== null ? annual + sick + casual : null);

  return { total, annual, sick, casual, used };
}

function stripDuplicateLeaveLines(text) {
  return text
    .replace(/^Here is your current leave balance:\s*\n?/i, '')
    .replace(
      /^(Annual Leave|Sick Leave|Casual Leave|Used Leave|Total Remaining Leave):\s*\*{0,2}\d+\s*days?\*{0,2}\s*\n?/gim,
      ''
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTicketConfirmation(text) {
  const idMatch = text.match(/\b(TKT-\d+)\b/i);
  if (!idMatch) return null;
  const categoryMatch = text.match(/Issue Category:\s*\*{0,2}([^\n*]+)\*{0,2}/i);
  const priorityMatch = text.match(/Priority:\s*\*{0,2}([^\n*]+)\*{0,2}/i);
  const statusMatch = text.match(/Status:\s*\*{0,2}([^\n*]+)\*{0,2}/i);
  if (!categoryMatch && !priorityMatch && !statusMatch) return null;
  return {
    ticketId: idMatch[1].toUpperCase(),
    category: categoryMatch ? categoryMatch[1].trim() : 'IT Support',
    priority: priorityMatch ? priorityMatch[1].trim() : 'Medium',
    status: statusMatch ? statusMatch[1].trim() : 'Open',
  };
}

function extractReimbursementInfo(text) {
  if (!/reimburs/i.test(text)) return null;
  const amountMatches = [...text.matchAll(/(\$[\d,]+(?:\.\d{2})?|₹[\d,]+(?:\.\d{2})?)/g)].map(
    (m) => m[1]
  );
  return {
    amounts: Array.from(new Set(amountMatches)).slice(0, 3),
  };
}

function CodeBlock({ className, children, onToast }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const rawCode = String(children ?? '').replace(/\n$/, '');
  const langMatch = /language-(\w+)/.exec(className || '');
  const language = langMatch ? langMatch[1] : 'code';

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopiedCode(true);
      onToast?.('Code block copied to clipboard');
      setTimeout(() => setCopiedCode(false), 1600);
    } catch {
      onToast?.('Unable to copy code block', 'error');
    }
  };

  return (
    <div className="my-2.5 rounded-xl bg-[#060913] border border-slate-800/90 overflow-hidden not-prose">
      <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Copy code"
        >
          {copiedCode ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed text-slate-200">
        <code>{rawCode}</code>
      </pre>
    </div>
  );
}

export default function StructuredReply({
  content,
  toolsUsed = [],
  citations = [],
  blocked = false,
  leaveBalance = null,
  onSelectTicket,
  onToast,
}) {
  const [copied, setCopied] = useState(false);
  const [copiedTicketId, setCopiedTicketId] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  const isLeaveResponse = !blocked && toolsUsed.includes('get_leave_balance_tool');
  const leaveData = isLeaveResponse ? extractLeaveSummary(content, leaveBalance) : null;
  const displayContent = leaveData ? stripDuplicateLeaveLines(content) : content;

  const ticketData =
    !blocked &&
    (toolsUsed.includes('create_it_ticket_tool') || toolsUsed.includes('get_ticket_status_tool'))
      ? extractTicketConfirmation(content)
      : null;

  const reimbData =
    !blocked &&
    toolsUsed.includes('search_hr_it_policies') &&
    !leaveData &&
    !ticketData
      ? extractReimbursementInfo(content)
      : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onToast?.('Response copied to clipboard');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      onToast?.('Unable to copy response', 'error');
    }
  };

  const handleCopyTicketId = async (ticketId) => {
    try {
      await navigator.clipboard.writeText(ticketId);
      setCopiedTicketId(true);
      onToast?.(`Copied ${ticketId}`);
      setTimeout(() => setCopiedTicketId(false), 1600);
    } catch {
      onToast?.('Unable to copy ticket ID', 'error');
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Structured Leave Balance Summary Card */}
      {leaveData && (
        <div className="rounded-xl bg-[#090f22] border border-indigo-500/25 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
              <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              Leave Balance Summary
            </span>
            {leaveData.total !== null && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                {leaveData.total} days remaining
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {leaveData.annual !== null && (
              <div className="rounded-lg bg-[#0d142b] border border-slate-800/90 p-2.5">
                <div className="text-sm font-bold text-slate-100">{leaveData.annual}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
                  Annual
                </div>
              </div>
            )}
            {leaveData.sick !== null && (
              <div className="rounded-lg bg-[#0d142b] border border-slate-800/90 p-2.5">
                <div className="text-sm font-bold text-slate-100">{leaveData.sick}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
                  Sick
                </div>
              </div>
            )}
            {leaveData.casual !== null && (
              <div className="rounded-lg bg-[#0d142b] border border-slate-800/90 p-2.5">
                <div className="text-sm font-bold text-slate-100">{leaveData.casual}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
                  Casual
                </div>
              </div>
            )}
            {leaveData.used !== null && (
              <div className="rounded-lg bg-[#0d142b] border border-slate-800/90 p-2.5">
                <div className="text-sm font-bold text-amber-300">{leaveData.used}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">
                  Used
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Structured IT Ticket Confirmation Header */}
      {ticketData && (
        <div className="rounded-xl bg-[#090f22] border border-emerald-500/25 p-4 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 shrink-0">
              <Ticket className="w-3.5 h-3.5 text-emerald-400" />
              Ticket
            </span>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              {ticketData.ticketId}
            </span>
            <button
              type="button"
              onClick={() => handleCopyTicketId(ticketData.ticketId)}
              className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/70 transition cursor-pointer shrink-0"
              title={`Copy ${ticketData.ticketId}`}
            >
              {copiedTicketId ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
            <span className="text-xs text-slate-300 truncate">{ticketData.category}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase ${
                ticketData.priority.toLowerCase() === 'high'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/70'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {ticketData.priority}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase bg-amber-950/70 text-amber-300 border border-amber-800/70">
              {ticketData.status}
            </span>
            {onSelectTicket && (
              <button
                type="button"
                onClick={() => onSelectTicket(ticketData.ticketId)}
                className="ml-1 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium text-indigo-300 hover:text-white hover:bg-indigo-500/20 transition cursor-pointer"
                title="View ticket in panel"
              >
                <span>Track</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Structured Reimbursement Highlight Strip */}
      {reimbData && reimbData.amounts.length > 0 && (
        <div className="rounded-xl bg-[#090f22] border border-violet-500/25 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300">
            <Receipt className="w-3.5 h-3.5 text-violet-400" />
            Reimbursement Limits
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {reimbData.amounts.map((amt, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md text-xs font-semibold font-mono bg-violet-500/15 text-violet-200 border border-violet-500/30"
              >
                {amt}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Markdown Content */}
      {displayContent && (
        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-slate-100 prose-headings:font-semibold prose-p:text-slate-200 prose-p:leading-relaxed prose-li:text-slate-200 prose-strong:text-white prose-code:text-indigo-300 prose-code:bg-indigo-950/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-table:border-collapse prose-th:border prose-th:border-slate-700/80 prose-th:bg-slate-900/90 prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:border-slate-800 prose-td:px-3 prose-td:py-1.5">
          <ReactMarkdown
            components={{
              code({ inline, className, children, ...props }) {
                if (!inline && className) {
                  return (
                    <CodeBlock className={className} onToast={onToast}>
                      {children}
                    </CodeBlock>
                  );
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {displayContent}
          </ReactMarkdown>
        </div>
      )}

      {/* Tools, Expandable Sources & Copy Action */}
      {(toolsUsed.length > 0 || citations.length > 0 || !blocked) && (
        <div className="pt-2.5 border-t border-slate-800/80 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              {toolsUsed.map((tool, i) => (
                <span
                  key={`tool-${i}`}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-mono bg-emerald-950/55 border border-emerald-700/50 text-emerald-300"
                >
                  <Wrench className="w-2.5 h-2.5 text-emerald-400" />
                  {tool}
                </span>
              ))}

              {citations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSourcesExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-1 h-6 px-2.5 rounded-md text-[11px] font-medium bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 transition cursor-pointer"
                >
                  <BookOpen className="w-3 h-3 text-indigo-400" />
                  <span>
                    {citations.length} {citations.length === 1 ? 'Source' : 'Sources'}
                  </span>
                  {sourcesExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>

            {!blocked && (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 border border-transparent hover:border-slate-700/70 transition active:scale-95 cursor-pointer shrink-0"
                title="Copy response"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-300">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            )}
          </div>

          {sourcesExpanded && citations.length > 0 && (
            <div className="rounded-xl bg-[#070c1a] border border-slate-800/90 p-3 space-y-1.5 animate-msg-enter">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <ShieldCheck className="w-3 h-3 text-indigo-400" />
                Policy Sources
              </div>
              <div className="flex flex-col gap-1.5">
                {citations.map((cit, i) => {
                  const parts = String(cit).split('(');
                  const docName = parts[0]?.trim() || cit;
                  const section = parts[1] ? `(${parts.slice(1).join('(')}` : '';
                  return (
                    <div
                      key={i}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-slate-900/80 border border-slate-800/70 px-3 py-1.5 text-xs"
                    >
                      <span className="font-mono text-[11px] text-indigo-200 break-all">
                        {docName}
                      </span>
                      {section && <span className="text-[11px] text-slate-400">{section}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}