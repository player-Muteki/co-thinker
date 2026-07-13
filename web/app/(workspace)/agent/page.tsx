"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot,
  Play,
  Eye,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  List,
  History,
  Terminal,
  AlertCircle,
} from "lucide-react";
import {
  runAgent,
  getAgentApprovals,
  approveAgentTool,
  rejectAgentTool,
  getAgentSessions,
  getAgentSession,
  type AgentEvent,
  type AgentApproval,
  type AgentSessionMeta,
} from "@/lib/api";

type Tab = "run" | "approvals" | "sessions";

export default function AgentPage() {
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<"default" | "plan" | "goal">("default");
  const [approvalMode, setApprovalMode] = useState<"ask" | "auto_safe_mutation">("ask");
  const [respond, setRespond] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("run");
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [sessions, setSessions] = useState<AgentSessionMeta[]>([]);
  const [sessionEvents, setSessionEvents] = useState<AgentEvent[] | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const loadApprovals = useCallback(() => {
    getAgentApprovals().then((d) => setApprovals(d.approvals)).catch(() => {});
  }, []);

  const loadSessions = useCallback(() => {
    getAgentSessions().then((d) => setSessions(d.sessions)).catch(() => {});
  }, []);

  useEffect(() => {
    loadApprovals();
    loadSessions();
  }, [loadApprovals, loadSessions]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const handleRun = () => {
    if (!goal.trim() || running) return;
    setRunning(true);
    setEvents([]);
    setSessionEvents(null);

    const { abort } = runAgent(goal.trim(), {
      mode,
      approval_mode: approvalMode,
      generate_response: respond,
      onEvent: (event) => {
        setEvents((prev) => [...prev, event]);
        if (event.type === "approval_required") {
          loadApprovals();
        }
      },
      onDone: () => {
        setRunning(false);
        loadSessions();
        loadApprovals();
      },
      onError: (error) => {
        setEvents((prev) => [...prev, { type: "error", session_id: "", error } as AgentEvent]);
        setRunning(false);
      },
    });
    abortRef.current = abort;
  };

  const handleStop = () => {
    abortRef.current?.();
    setRunning(false);
  };

  const handleApprove = async (id: string) => {
    try {
      const result = await approveAgentTool(id);
      if (result.events) {
        setEvents((prev) => [...prev, ...result.events]);
      }
      loadApprovals();
      loadSessions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectAgentTool(id);
      loadApprovals();
    } catch (e) {
      console.error(e);
    }
  };

  const viewSession = async (id: string) => {
    setActiveTab("sessions");
    try {
      const data = await getAgentSession(id);
      setSessionEvents(data.events);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col p-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Bot size={20} className="text-[var(--accent)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">知识库 Agent</h1>
        <span className="rounded bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]">
          Beta
        </span>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-[var(--surface-border)]">
        {[
          { id: "run" as Tab, label: "运行", icon: Play },
          { id: "approvals" as Tab, label: "审批", icon: List },
          { id: "sessions" as Tab, label: "历史", icon: History },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSessionEvents(null); }}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Main area */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          {/* Input area */}
          {activeTab === "run" && (
            <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="输入 Agent 目标，例如：检查知识库状态、重建索引、搜索关于 RAG 的内容..."
                rows={2}
                className="w-full resize-none rounded-md border border-[var(--surface-border)] bg-[var(--surface-bg)] p-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                  className="rounded border border-[var(--surface-border)] bg-[var(--surface-bg)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
                >
                  <option value="default">默认模式</option>
                  <option value="plan">计划模式（只读）</option>
                </select>
                <select
                  value={approvalMode}
                  onChange={(e) => setApprovalMode(e.target.value as typeof approvalMode)}
                  className="rounded border border-[var(--surface-border)] bg-[var(--surface-bg)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
                >
                  <option value="ask">手动审批</option>
                  <option value="auto_safe_mutation">自动执行低风险变更</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={respond}
                    onChange={(e) => setRespond(e.target.checked)}
                    className="rounded"
                  />
                  LLM 总结
                </label>
                <div className="ml-auto flex gap-2">
                  {running ? (
                    <button
                      onClick={handleStop}
                      className="flex items-center gap-1.5 rounded-md bg-[var(--danger)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      <Loader2 size={14} className="animate-spin" />
                      停止
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleRun}
                        disabled={!goal.trim()}
                        className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        <Play size={14} />
                        运行
                      </button>
                      <button
                        onClick={() => {
                          setMode("plan");
                          handleRun();
                        }}
                        disabled={!goal.trim()}
                        className="flex items-center gap-1.5 rounded-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-40"
                      >
                        <Eye size={14} />
                        计划
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Events output */}
          {events.length > 0 && (
            <div className="flex-1 overflow-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)]">
              <div className="border-b border-[var(--surface-border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
                事件流
              </div>
              <div className="space-y-1 p-2">
                {events.map((event, i) => (
                  <EventItem key={i} event={event} onApprove={handleApprove} onReject={handleReject} />
                ))}
                <div ref={eventsEndRef} />
              </div>
            </div>
          )}

          {/* Session detail */}
          {sessionEvents && (
            <div className="flex-1 overflow-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)]">
              <div className="border-b border-[var(--surface-border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]">
                会话详情
              </div>
              <div className="space-y-1 p-2">
                {sessionEvents.map((event, i) => (
                  <EventItem key={i} event={event} onApprove={handleApprove} onReject={handleReject} />
                ))}
              </div>
            </div>
          )}

          {/* Approvals list */}
          {activeTab === "approvals" && (
            <div className="flex-1 overflow-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] p-3">
              {approvals.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">暂无审批</div>
              ) : (
                <div className="space-y-2">
                  {approvals.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-md border border-[var(--surface-border)] p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)]">{a.tool_name}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                              a.status === "pending"
                                ? "bg-yellow-500/10 text-yellow-600"
                                : a.status === "approved"
                                  ? "bg-green-500/10 text-green-600"
                                  : a.status === "executed"
                                    ? "bg-blue-500/10 text-blue-600"
                                    : "bg-gray-500/10 text-gray-600"
                            }`}
                          >
                            {a.status === "pending" ? "待审批" : a.status === "approved" ? "已批准" : a.status === "executed" ? "已执行" : "已拒绝"}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--text-tertiary)]">{a.reason}</div>
                      </div>
                      {a.status === "pending" && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => handleApprove(a.id)}
                            className="flex items-center gap-1 rounded bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-500/20"
                          >
                            <Check size={12} />
                            批准
                          </button>
                          <button
                            onClick={() => handleReject(a.id)}
                            className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/20"
                          >
                            <X size={12} />
                            拒绝
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sessions list */}
          {activeTab === "sessions" && !sessionEvents && (
            <div className="flex-1 overflow-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] p-3">
              {sessions.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">暂无会话记录</div>
              ) : (
                <div className="space-y-1">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => viewSession(s.id)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      <Bot size={14} className="text-[var(--text-tertiary)]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-[var(--text-primary)]">{s.goal}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">
                          {s.mode} · {s.event_count} 个事件
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                        {new Date(s.created_at).toLocaleString("zh-CN")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EventItem({
  event,
  onApprove,
  onReject,
}: {
  event: AgentEvent;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const label = {
    message: event.message,
    tool_call_start: `调用工具: ${event.tool_name}`,
    tool_call_result: `工具结果: ${event.tool_name}`,
    approval_required: `需要审批: ${event.tool_name}`,
    plan_created: `计划已生成: ${event.plan_id}`,
    error: `错误: ${event.error}`,
    done: event.message,
  }[event.type] || event.type;

  const icon = {
    message: null,
    tool_call_start: <Terminal size={14} className="text-blue-500" />,
    tool_call_result: <ChevronRight size={14} className="text-green-500" />,
    approval_required: <AlertCircle size={14} className="text-yellow-500" />,
    plan_created: <Eye size={14} className="text-purple-500" />,
    error: <AlertCircle size={14} className="text-red-500" />,
    done: <Check size={14} className="text-green-500" />,
  }[event.type] || null;

  const showExpand = event.type === "tool_call_result" || event.type === "tool_call_start";

  return (
    <div
      className={`rounded-md px-3 py-2 text-sm ${
        event.type === "error"
          ? "bg-red-500/5"
          : event.type === "approval_required"
            ? "bg-yellow-500/5"
            : "hover:bg-[var(--surface-hover)]"
      }`}
    >
      <div className="flex items-start gap-2">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="text-[var(--text-primary)]">{label}</div>
          {event.type === "message" && event.message && (
            <div className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">
              {event.message}
            </div>
          )}
          {event.type === "tool_call_start" && event.arguments && Object.keys(event.arguments).length > 0 && (
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">
              {JSON.stringify(event.arguments)}
            </div>
          )}
          {showExpand && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1 flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? "收起" : "详情"}
            </button>
          )}
          {expanded && event.type === "tool_call_result" && event.body && (
            <pre className="mt-1 max-h-48 overflow-auto rounded bg-[var(--surface-bg)] p-2 text-xs text-[var(--text-secondary)]">
              {JSON.stringify(event.body, null, 2)}
            </pre>
          )}
          {event.type === "approval_required" && event.approval_id && !event.approval_id.startsWith("preview_") && (
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onApprove(event.approval_id!)}
                className="flex items-center gap-1 rounded bg-green-500/10 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-500/20"
              >
                <Check size={12} />
                批准
              </button>
              <button
                onClick={() => onReject(event.approval_id!)}
                className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/20"
              >
                <X size={12} />
                拒绝
              </button>
            </div>
          )}
        </div>
        <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
          {new Date(event.created_at).toLocaleTimeString("zh-CN")}
        </span>
      </div>
    </div>
  );
}
