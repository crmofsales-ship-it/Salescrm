import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  Brain, Send, X, Maximize2, Trash2, Check, Loader2,
  Users, Activity, CheckCircle2, Sparkles, Zap,
  Clock, TrendingUp, Target, BarChart3, FileText,
} from "lucide-react";
import { db as supabase } from "../../lib/db";
import { getAccessToken } from "../../lib/session";
import { streamARIA } from "../../services/ariaService";
import { useARIA } from "../../context/ARIAContext";
import { format } from "date-fns";

const VALID_LEAD_SOURCES = [
  "website","linkedin","referral","cold_call","email_campaign",
  "event","partner","social_media","ads","walk_in","other",
  "call","email","social","exhibition",
];
const VALID_LEAD_TEMPS = ["hot","warm","cold"];

// ── Page context map ──────────────────────────────────────────────────────────
const PAGE_CTX = {
  "/dashboard":   { module: "Dashboard",   page: "Dashboard Overview",      prompts: ["What needs my attention today?", "Pipeline summary", "Hot leads this week", "Urgent alerts"] },
  "/pipeline":    { module: "Pipeline",    page: "Pipeline Management",     prompts: ["Show prospects by stage", "Which prospects need follow-up?", "Create a new prospect", "Stale prospects"] },
  "/leads":       { module: "Leads",       page: "Leads Management",        prompts: ["Today's follow-ups", "Hot leads list", "Create a lead", "Leads needing action"] },
  "/deals":       { module: "Deals",       page: "Deal Pipeline",           prompts: ["Show stale deals", "Pipeline value", "Deals at risk", "Won revenue this month"] },
  "/activities":  { module: "Activities",  page: "Activities",              prompts: ["Log a call", "Recent activities", "Create a follow-up", "Activity summary"] },
  "/tasks":       { module: "Tasks",       page: "Task Center",             prompts: ["Overdue tasks", "Create a task", "Today's tasks", "Pending tasks"] },
  "/meetings":    { module: "Meetings",    page: "Meetings",                prompts: ["Today's meetings", "Upcoming calls", "Schedule a meeting"] },
  "/dsr":         { module: "DSR",         page: "Daily Sales Report",      prompts: ["Today's DSR summary", "Team performance today", "DSR by employee"] },
  "/reports":     { module: "Reports",     page: "Analytics & Reports",     prompts: ["Revenue forecast", "Pipeline analytics", "Performance by team"] },
  "/targets":     { module: "Targets",     page: "Targets & KPIs",          prompts: ["Team target progress", "Who's behind on targets?", "KPI summary"] },
  "/analytics":   { module: "Analytics",   page: "Analytics",               prompts: ["Revenue trends", "Conversion rates", "Top performers"] },
  "/customers":   { module: "Customers",   page: "Customer Hub",            prompts: ["Show accounts", "Recent interactions", "Add customer"] },
  "/team":        { module: "Team",        page: "Team Management",         prompts: ["Team overview", "Performance summary", "Assign leads"] },
  "/settings":    { module: "Settings",    page: "Settings",                prompts: ["Help with settings"] },
  "/security-logs":{ module: "Security",  page: "Security Logs",           prompts: ["Recent security events", "Login activity"] },
};

const ROLE_LABELS = {
  owner: "Super Admin", sales_head: "Sales Head", sales_manager: "Sales Manager",
  employee: "Sales Employee", inside_sales: "Inside Sales",
};

// ── Parse <action> blocks ─────────────────────────────────────────────────────
function parseAction(text) {
  const match = text.match(/<action>([\s\S]*?)<\/action>/);
  if (!match) return { cleanText: text, action: null };
  try {
    return { cleanText: text.replace(/<action>[\s\S]*?<\/action>/g, "").trim(), action: JSON.parse(match[1].trim()) };
  } catch { return { cleanText: text, action: null }; }
}

// ── Mini message renderer (bold support) ─────────────────────────────────────
function MsgText({ content }) {
  return (
    <>
      {(content || " ").split("\n").map((line, i, arr) => (
        <span key={i}>
          {line.split(/(\*\*.*?\*\*)/g).map((p, j) =>
            p.startsWith("**") && p.endsWith("**")
              ? <strong key={j} style={{ color: "var(--text)", fontWeight: 700 }}>{p.slice(2, -2)}</strong>
              : <span key={j}>{p}</span>
          )}
          {i < arr.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

// ── Action approval card ──────────────────────────────────────────────────────
const ACTION_META = {
  create_lead:     { icon: Users,         label: "Add Lead",        color: "#3B82F6" },
  create_task:     { icon: CheckCircle2,  label: "Create Task",     color: "#10B981" },
  create_activity: { icon: Activity,      label: "Log Activity",    color: "#8B5CF6" },
  assign_lead:     { icon: Users,         label: "Assign Lead",     color: "#F59E0B" },
};

function ActionCard({ action, onApprove, onDismiss, loading }) {
  const meta = ACTION_META[action.type] || { icon: Sparkles, label: "Execute Action", color: "#6366F1" };
  const Icon = meta.icon;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: "var(--surface)", border: `1.5px solid ${meta.color}35`, borderRadius: 12, overflow: "hidden", boxShadow: `0 4px 16px rgba(0,0,0,0.1)`, marginTop: 4 }}>
      <div style={{ padding: "9px 13px", background: `${meta.color}0C`, borderBottom: `1px solid ${meta.color}22`, display: "flex", alignItems: "center", gap: 7 }}>
        <div style={{ width: 24, height: 24, borderRadius: 7, background: `${meta.color}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={11} style={{ color: meta.color }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>Proposed · {meta.label}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Approve to execute</div>
        </div>
      </div>
      <div style={{ padding: "8px 13px" }}>
        <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 6 }}>{action.description}</div>
        {action.data && (
          <div style={{ background: "var(--surface-2)", borderRadius: 7, padding: "6px 10px" }}>
            {Object.entries(action.data).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 6, marginBottom: 2, fontSize: 10.5 }}>
                <span style={{ color: "var(--text-muted)", minWidth: 80, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}:</span>
                <span style={{ color: "var(--text)", fontWeight: 500 }}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: "8px 13px", borderTop: "1px solid var(--border)", display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onDismiss} disabled={loading}
          style={{ fontSize: 11, height: 28, padding: "0 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
          <X size={10} /> Cancel
        </button>
        <button onClick={onApprove} disabled={loading}
          style={{ fontSize: 11, height: 28, padding: "0 12px", background: meta.color, color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
          {loading ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={10} />}
          {loading ? "Executing..." : "Approve & Run"}
        </button>
      </div>
    </motion.div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function ARIAPanel() {
  const { isOpen, closePanel } = useARIA();
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // All hooks must be declared before any conditional return
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [aiState, setAiState]   = useState("idle");
  const [pendingAction, setPendingAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState("");

  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);
  const welcomedRef  = useRef(false);
  const prevPageRef  = useRef(location.pathname);

  // Derived values (not hooks — safe to compute anywhere)
  const pageInfo  = PAGE_CTX[location.pathname] || { module: "CRM", page: "Sales CRM", prompts: ["Pipeline summary", "Hot leads", "Overdue tasks"] };
  const roleLabel = ROLE_LABELS[profile?.role] || "Employee";
  const firstName = profile?.full_name?.split(" ")[0] || "there";

  // Add welcome message when panel first opens
  useEffect(() => {
    if (isOpen && !welcomedRef.current) {
      welcomedRef.current = true;
      const pi = PAGE_CTX[location.pathname] || { module: "CRM", page: "Sales CRM", prompts: [] };
      const fn = profile?.full_name?.split(" ")[0] || "there";
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: `Hi ${fn}! I'm **Sales Assistant**, your CRM Intelligence Agent.\n\nI can see you're on the **${pi.module}** page. I can help you:\n• Search, filter, and view ${pi.module.toLowerCase()} records\n• Create leads, tasks, and activities\n• Get insights and recommendations\n• Execute multi-step workflows\n\nWhat would you like to do?`,
        ts: new Date(),
      }]);
    }
  }, [isOpen]);

  // Notify when page changes while panel is open
  useEffect(() => {
    if (prevPageRef.current !== location.pathname && isOpen && messages.length > 0) {
      prevPageRef.current = location.pathname;
      const newCtx = PAGE_CTX[location.pathname];
      if (newCtx) {
        setMessages((prev) => [...prev, {
          id: Date.now() + "ctx",
          role: "assistant",
          content: `📍 You've navigated to **${newCtx.module}**. I'm now aware of your current context. What would you like to do here?`,
          ts: new Date(),
        }]);
      }
    } else {
      prevPageRef.current = location.pathname;
    }
  }, [location.pathname]);

  useEffect(() => {
    if (isOpen) { setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50); }
  }, [messages, loading, isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 300);
  }, [isOpen]);

  const executeAction = async (action) => {
    setActionLoading(true);
    try {
      if (action.type === "create_lead") {
        const { error } = await supabase.from("leads").insert({
          company_name: action.data.company_name || "New Lead",
          contact_name: action.data.contact_name || null,
          phone:        action.data.phone || null,
          email:        action.data.email || null,
          source:       VALID_LEAD_SOURCES.includes(action.data.source) ? action.data.source : "other",
          temperature:  VALID_LEAD_TEMPS.includes(action.data.temperature) ? action.data.temperature : "warm",
          stage:        "new",
          assigned_to:  profile?.id,
          is_locked:    false,
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["leads"] });
        qc.invalidateQueries({ queryKey: ["pipeline"] });
        qc.invalidateQueries({ queryKey: ["ai-insights"] });
      } else if (action.type === "create_task") {
        const { error } = await supabase.from("tasks").insert({
          title:       action.data.title || "AI-generated task",
          priority:    action.data.priority || "medium",
          due_date:    action.data.due_date || null,
          status:      "todo",
          assigned_to: profile?.id,
          created_by:  profile?.id,
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["sidebar-task-count"] });
      } else if (action.type === "create_activity") {
        const { error } = await supabase.from("activities").insert({
          type:       action.data.type || "call",
          title:      action.data.title || "Activity",
          note:       action.data.note || null,
          lead_id:    action.data.lead_id || null,
          deal_id:    action.data.deal_id || null,
          status:     "done",
          created_by: profile?.id,
          user_id:    profile?.id,
        });
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["activities"] });
      } else if (action.type === "assign_lead") {
        // Find assignee by name
        const { data: teamMembers } = await supabase
          .from("profiles")
          .select("id, full_name")
          .ilike("full_name", `%${action.data.assignee_name}%`)
          .limit(1);
        const assigneeId = teamMembers?.[0]?.id || profile?.id;
        const { error } = await supabase
          .from("leads")
          .update({ assigned_to: assigneeId })
          .eq("id", action.data.lead_id);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["leads"] });
      }
      setMessages((prev) => [...prev, {
        id: Date.now() + "ok",
        role: "assistant",
        content: `✅ Done! ${action.description || "Action completed successfully."}`,
        ts: new Date(),
      }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: Date.now() + "err",
        role: "assistant",
        content: `❌ Couldn't complete: ${err.message}`,
        ts: new Date(),
      }]);
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  };

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput("");
    setPendingAction(null);

    const userMsg = { id: Date.now() + "u", role: "user", content, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setAiState("thinking");
    setThinkingStatus("Connecting to Sales Assistant...");

    const streamId = Date.now() + "a";
    setMessages((prev) => [...prev, { id: streamId, role: "assistant", content: "", ts: new Date(), streaming: true }]);

    const pageContext = {
      module: pageInfo.module,
      page:   pageInfo.page,
      path:   location.pathname,
    };

    try {
      await streamARIA({
        message: content,
        pageContext,
        getToken: () => getAccessToken(),
        onStatus: (status) => setThinkingStatus(status),
        onToken: (_, fullText) => {
          const { cleanText } = parseAction(fullText);
          setMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, content: cleanText } : m));
        },
        onDone: (fullText) => {
          const { cleanText, action } = parseAction(fullText);
          setMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, content: cleanText, streaming: false } : m));
          if (action) setPendingAction(action);
        },
        onError: (err) => {
          const msg = err?.message || "Unknown error";
          const fallback = /rate.limit|429/i.test(msg)
            ? "**Rate limit reached.** Please wait a moment and retry."
            : /AI service error/i.test(msg)
              ? `**${msg}**`
              : /401|unauthorized/i.test(msg)
                ? "**Session token expired.** Please try your message again — the session has been refreshed automatically."
                : `**Error:** ${msg}`;
          setMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, content: fallback, streaming: false } : m));
        },
      });
    } finally {
      setLoading(false);
      setAiState("idle");
      setThinkingStatus("");
    }
  }, [input, loading, location.pathname, pageInfo]);

  const clearChat = () => {
    welcomedRef.current = false;
    setPendingAction(null);
    setMessages([{
      id: "welcome-new",
      role: "assistant",
      content: `Hi ${firstName}! Chat cleared. I'm still on the **${pageInfo.module}** page with you. How can I help?`,
      ts: new Date(),
    }]);
  };

  const PROMPT_ICONS = [Zap, Clock, TrendingUp, Target, BarChart3, FileText, Activity, Users];

  // Guard AFTER all hooks — this is the correct place per React rules
  if (location.pathname === "/ai-assistant") return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop (subtle) */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closePanel}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 199, backdropFilter: "blur(1px)" }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: 460, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 460, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, width: 440,
              background: "var(--surface)", borderLeft: "1px solid var(--border)",
              zIndex: 200, display: "flex", flexDirection: "column",
              boxShadow: "-8px 0 40px rgba(0,0,0,0.18)",
            }}
          >
            {/* ── Context Bar ── */}
            <div style={{ padding: "7px 14px", background: "linear-gradient(135deg,rgba(79,70,229,0.08),rgba(124,58,237,0.05))", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Context</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "#A78BFA", background: "rgba(167,139,250,0.12)", padding: "2px 8px", borderRadius: 99, border: "1px solid rgba(167,139,250,0.25)" }}>
                  {pageInfo.module}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>·</span>
                <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{pageInfo.page}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>·</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-2)" }}>{roleLabel}</span>
              </div>
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                <button onClick={() => { closePanel(); navigate("/ai-assistant"); }} title="Open full screen"
                  style={{ width: 26, height: 26, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
                  <Maximize2 size={12} />
                </button>
                <button onClick={clearChat} title="Clear chat"
                  style={{ width: 26, height: 26, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
                  <Trash2 size={12} />
                </button>
                <button onClick={closePanel} title="Close panel"
                  style={{ width: 26, height: 26, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6 }}>
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* ── Header ── */}
            <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, background: "var(--surface)" }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: aiState === "thinking" ? "linear-gradient(135deg,#4F46E5,#7C3AED)" : "linear-gradient(135deg,#1E293B,#334155)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: aiState === "thinking" ? "0 0 20px rgba(124,58,237,0.4)" : "0 0 10px rgba(99,102,241,0.2)", transition: "all 0.3s" }}>
                {aiState === "thinking"
                  ? <div style={{ display: "flex", gap: 2 }}>{[0,1,2].map((i) => <div key={i} className="ai-thinking-dot" style={{ animationDelay: `${i*0.15}s`, width: 5, height: 5 }} />)}</div>
                  : <Brain size={16} style={{ color: "#fff", opacity: 0.9 }} strokeWidth={1.5} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em" }}>Sales Assistant</span>
                  <span style={{ fontSize: 10, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981", animation: "pulse 2s ease-in-out infinite", display: "inline-block" }} />
                    AI Agent · Online
                  </span>
                </div>
                <div style={{ fontSize: 11, color: aiState === "thinking" ? "#A78BFA" : "var(--text-muted)", marginTop: 1, transition: "color 0.2s" }}>
                  {aiState === "thinking" ? (thinkingStatus || "Thinking...") : `Ask me anything about ${pageInfo.module}`}
                </div>
              </div>
            </div>

            {/* ── Quick prompts ── */}
            <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--border)", display: "flex", gap: 5, overflowX: "auto", flexShrink: 0, background: "var(--surface-2)" }} className="custom-scroll">
              {pageInfo.prompts.slice(0, 5).map((p, i) => {
                const Icon = PROMPT_ICONS[i % PROMPT_ICONS.length];
                return (
                  <button key={p} onClick={() => sendMessage(p)} disabled={loading}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 20, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)", fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", flexShrink: 0, transition: "all 0.14s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)"; }}>
                    <Icon size={9} style={{ color: "var(--accent)", flexShrink: 0 }} />
                    {p}
                  </button>
                );
              })}
            </div>

            {/* ── Messages ── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 12 }} className="custom-scroll">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div key={msg.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", damping: 24, stiffness: 300 }}
                    style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: msg.role === "assistant" ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "linear-gradient(135deg,#2563EB,#4F46E5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {msg.role === "assistant"
                        ? <Brain size={11} style={{ color: "#fff" }} />
                        : <span style={{ fontSize: 9, fontWeight: 700, color: "#fff" }}>{profile?.full_name?.[0] || "U"}</span>}
                    </div>
                    <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 1, alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                      {msg.role === "assistant" ? (
                        <div style={{ fontSize: 12.5, lineHeight: 1.6, padding: "9px 13px", background: "var(--surface-2)", borderRadius: "14px 14px 14px 4px", border: "1px solid var(--border)", color: "var(--text-2)", maxWidth: "100%" }}>
                          <MsgText content={msg.content} />
                          {msg.streaming && (
                            <span style={{ display: "inline-block", width: 7, height: 13, background: "var(--accent)", borderRadius: 2, marginLeft: 2, animation: "typing-dot 0.8s steps(1) infinite", verticalAlign: "middle" }} />
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12.5, padding: "9px 13px", background: "linear-gradient(135deg,#4F46E5,#6366F1)", color: "#fff", borderRadius: "14px 14px 4px 14px", maxWidth: "100%" }}>
                          {msg.content}
                        </div>
                      )}
                      <div style={{ fontSize: 9.5, color: "var(--text-muted)", padding: "0 3px" }}>{format(new Date(msg.ts), "h:mm a")}</div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Typing indicator */}
              {loading && !messages.some((m) => m.streaming && m.content) && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Brain size={11} style={{ color: "#fff" }} />
                  </div>
                  <div className="typing-indicator">
                    <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                  </div>
                </motion.div>
              )}

              {/* Action approval */}
              {pendingAction && (
                <div style={{ paddingLeft: 32 }}>
                  <ActionCard
                    action={pendingAction}
                    onApprove={() => executeAction(pendingAction)}
                    onDismiss={() => setPendingAction(null)}
                    loading={actionLoading}
                  />
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
            <div style={{ padding: "10px 14px 12px", borderTop: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder={`Ask about ${pageInfo.module}... or any CRM task`}
                    className="crm-input"
                    style={{ resize: "none", height: 40, maxHeight: 100, lineHeight: 1.5, paddingTop: 10, paddingRight: 12, fontSize: 13 }}
                    rows={1}
                    disabled={loading}
                  />
                </div>
                <motion.button
                  className="btn-primary"
                  style={{ height: 40, padding: "0 14px", gap: 5, flexShrink: 0, fontSize: 13 }}
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.92 }}>
                  <Send size={13} />
                </motion.button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  Sales Assistant · {pageInfo.module} context · Enter to send · Actions require approval
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
