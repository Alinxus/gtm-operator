"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Send, Loader2, Bot, User, CheckCircle2, XCircle, PanelRightOpen, PanelRightClose, Trash2 } from "lucide-react";
import { postJson } from "@/lib/client-api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  data?: unknown;
  error?: boolean;
}

interface ApprovalRow {
  touch: {
    id: string;
    touchType: string;
    title: string;
    body: string;
    status: string;
  };
  account?: { name: string } | null;
}

const SUGGESTIONS = [
  "What should I focus on today?",
  "Email john@acme.ai — John Smith, Acme AI, founder building an AI assistant",
  "Approve and send all pending emails",
  "Find YC W25 AI agent companies",
  "Draft a thread about our benchmark",
];

function formatBody(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <span key={i}>
        {parts.map((p, j) => {
          if (p.startsWith("**") && p.endsWith("**"))
            return <strong key={j}>{p.slice(2, -2)}</strong>;
          if (p.startsWith("`") && p.endsWith("`"))
            return (
              <code key={j} style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.85em", background: "var(--surface)", padding: "0 3px", borderRadius: 3 }}>
                {p.slice(1, -1)}
              </code>
            );
          return p;
        })}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
}

export default function ChatPage() {
  const params = useParams();
  const workspaceId = (params?.workspaceId ?? "") as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore chat history from localStorage
  useEffect(() => {
    if (!workspaceId) return;
    try {
      const stored = localStorage.getItem(`chat-history-${workspaceId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {
      // ignore
    }
    // Hide side panel by default on narrow screens
    if (window.innerWidth < 768) setShowPanel(false);
  }, [workspaceId]);

  // Persist chat history to localStorage whenever messages change
  useEffect(() => {
    if (!workspaceId || messages.length === 0) return;
    try {
      localStorage.setItem(`chat-history-${workspaceId}`, JSON.stringify(messages.slice(-60)));
    } catch {
      // ignore
    }
  }, [messages, workspaceId]);

  // Load approvals for side panel
  useEffect(() => {
    setApprovalsLoading(true);
    fetch(
      `${process.env.NEXT_PUBLIC_OPERATOR_API_BASE_URL ?? "http://localhost:4000"}/v2/workspaces/${encodeURIComponent(workspaceId)}/approvals`,
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then((d: { approvals?: ApprovalRow[] }) => setApprovals(d.approvals ?? []))
      .catch(() => setApprovals([]))
      .finally(() => setApprovalsLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const res = await postJson(`/v2/workspaces/${encodeURIComponent(workspaceId)}/chat`, {
        message: text.trim(),
        history,
      }) as { text: string; intent: string; data?: unknown };

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: res.text, intent: res.intent, data: res.data },
      ]);

      // Refresh approvals after actions that change the queue
      if (["hunt_prospects", "send_touch", "add_prospect", "approve_and_send", "approve_all_emails"].includes(res.intent)) {
        fetch(
          `${process.env.NEXT_PUBLIC_OPERATOR_API_BASE_URL ?? "http://localhost:4000"}/v2/workspaces/${encodeURIComponent(workspaceId)}/approvals`,
          { cache: "no-store" },
        )
          .then((r) => r.json())
          .then((d: { approvals?: ApprovalRow[] }) => setApprovals(d.approvals ?? []))
          .catch(() => {});
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: `Error: ${(err as Error).message}`, error: true },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function rejectTouch(touchId: string) {
    try {
      await postJson(`/v2/touches/${encodeURIComponent(touchId)}/reject`, { reviewer: "operator" });
      setApprovals((prev) => prev.filter((a) => a.touch.id !== touchId));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function clearHistory() {
    setMessages([]);
    try {
      localStorage.removeItem(`chat-history-${workspaceId}`);
    } catch {
      // ignore
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const pendingCount = approvals.filter((a) => a.touch.status !== "approved" && a.touch.status !== "sent").length;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 52px)", overflow: "hidden" }}>
      {/* ── Chat panel ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Chat header */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bot size={15} color="var(--faint)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--body)" }}>GTM Operator</span>
            {messages.length > 0 && (
              <span style={{ fontSize: 11, color: "var(--faint)" }}>{messages.length} messages</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                title="Clear chat history"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", display: "flex", alignItems: "center", padding: 4, borderRadius: 4 }}
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={() => setShowPanel((v) => !v)}
              title={showPanel ? "Hide queue" : "Show queue"}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 4, fontSize: 11 }}
            >
              {showPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              <span style={{ display: "none" }} className="chat-panel-label">
                {showPanel ? "Hide" : `Queue${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
              </span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          {messages.length === 0 && (
            <div style={{ margin: "auto", textAlign: "center", maxWidth: 480 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Bot size={20} color="var(--faint)" />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>GTM Operator</p>
              <p style={{ fontSize: 13, color: "var(--body)", marginBottom: 24, lineHeight: 1.6 }}>
                Tell me what to do. I can find prospects, draft content, show your queue, and send approved touches.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      fontSize: 12,
                      padding: "6px 12px",
                      borderRadius: 20,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--body)",
                      cursor: "pointer",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: msg.role === "user" ? "var(--ink)" : "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {msg.role === "user" ? (
                  <User size={13} color="white" />
                ) : (
                  <Bot size={13} color={msg.error ? "#e53e3e" : "var(--faint)"} />
                )}
              </div>

              <div style={{ maxWidth: "72%", minWidth: 0 }}>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: msg.role === "user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                    background: msg.role === "user" ? "var(--ink)" : "var(--surface)",
                    color: msg.role === "user" ? "#fff" : msg.error ? "#e53e3e" : "var(--ink)",
                    fontSize: 13,
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {formatBody(msg.content)}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={13} color="var(--faint)" style={{ animation: "spin 1s linear infinite" }} />
              </div>
              <div style={{ padding: "10px 14px", borderRadius: "4px 12px 12px 12px", background: "var(--surface)", fontSize: 13, color: "var(--faint)" }}>
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ borderTop: "1px solid var(--border)", padding: "14px 20px", background: "var(--bg)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)", padding: "10px 14px" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Tell me what to do… (Enter to send, Shift+Enter for newline)"
              rows={1}
              style={{
                flex: 1,
                resize: "none",
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                color: "var(--ink)",
                fontFamily: "inherit",
                lineHeight: 1.5,
                maxHeight: 120,
                overflow: "auto",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "none",
                background: input.trim() && !loading ? "var(--ink)" : "var(--border)",
                color: input.trim() && !loading ? "#fff" : "var(--faint)",
                cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Approvals side panel ── */}
      {showPanel && (
        <div
          style={{
            width: 300,
            flexShrink: 0,
            borderLeft: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "var(--bg)",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)", fontFamily: "var(--font-jetbrains, monospace)" }}>
              Queue
            </p>
            <span style={{ fontSize: 11, background: "var(--surface)", padding: "1px 7px", borderRadius: 10, color: "var(--body)" }}>
              {pendingCount}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {approvalsLoading ? (
              <div style={{ padding: 16, textAlign: "center" }}>
                <Loader2 size={16} color="var(--faint)" style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : approvals.length === 0 ? (
              <div style={{ padding: "24px 12px", textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "var(--faint)" }}>Nothing pending</p>
                <p style={{ fontSize: 11, color: "var(--faint)", marginTop: 4 }}>Ask me to find prospects to fill the queue</p>
              </div>
            ) : (
              approvals.map((row) => (
                <div
                  key={row.touch.id}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    marginBottom: 6,
                    background: row.touch.status === "approved" ? "#f0fdf4" : "white",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--faint)", textTransform: "uppercase" }}>
                      {row.touch.touchType}
                    </span>
                    {row.touch.status === "approved" && (
                      <span style={{ fontSize: 10, color: "#22c55e", display: "flex", alignItems: "center", gap: 2 }}>
                        <CheckCircle2 size={10} /> approved
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 2, lineHeight: 1.4 }}>
                    {row.account?.name ?? "Unknown account"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--body)", lineHeight: 1.45, marginBottom: 8 }}>
                    {(row.touch.title || row.touch.body).slice(0, 90)}
                    {(row.touch.title || row.touch.body).length > 90 ? "…" : ""}
                  </p>
                  {row.touch.status !== "sent" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {row.touch.status !== "approved" ? (
                        <button
                          onClick={() => send(`approve and send touch ${row.touch.id}`)}
                          style={{
                            flex: 1, fontSize: 11, padding: "4px 0", borderRadius: 6,
                            border: "none", background: "var(--ink)", color: "white", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                          }}
                        >
                          <Send size={11} /> Approve & Send
                        </button>
                      ) : (
                        <button
                          onClick={() => send(`send touch ${row.touch.id}`)}
                          style={{
                            flex: 1, fontSize: 11, padding: "4px 0", borderRadius: 6,
                            border: "none", background: "var(--ink)", color: "white", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                          }}
                        >
                          <Send size={11} /> Send now
                        </button>
                      )}
                      <button
                        onClick={() => rejectTouch(row.touch.id)}
                        style={{
                          fontSize: 11, padding: "4px 8px", borderRadius: 6,
                          border: "1px solid var(--border)", background: "transparent", color: "var(--body)", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <XCircle size={11} />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Quick actions */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "10px 10px" }}>
            <p style={{ fontSize: 10, color: "var(--faint)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--font-jetbrains, monospace)", marginBottom: 8 }}>
              Quick actions
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                ["Send all pending emails", "Approve and send all pending emails"],
                ["Find YC companies", "Find YC W25 AI agent companies"],
                ["Hunt GitHub", "Search GitHub for teams building AI agents"],
                ["Draft X thread", "Draft a Twitter thread about our benchmark"],
              ].map(([label, cmd]) => (
                <button
                  key={label}
                  onClick={() => send(cmd)}
                  style={{
                    textAlign: "left", fontSize: 12, padding: "6px 10px", borderRadius: 6,
                    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--body)",
                    cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
