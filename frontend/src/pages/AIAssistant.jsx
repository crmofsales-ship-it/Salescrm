import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Send, Trash2, Mic, MicOff, Volume2, VolumeX,
  Copy, Check, ThumbsUp, ThumbsDown, Square, Globe,
  FileText, Upload, Plus, Sparkles,
  Target, BarChart3, Calendar, Mail, Settings,
  Loader2, Download, TrendingUp, RefreshCw,
  ChevronRight, Image, Menu, PanelRightClose, PanelRightOpen,
  Star, BookOpen, Zap, HelpCircle, Newspaper,
  Bookmark, BookmarkCheck, MessageSquare, Activity,
  Lightbulb, PenTool, Search, X, AtSign,
} from "lucide-react";
import { streamARIA, clearARIAHistory, executeAction } from "../services/ariaService";
import { getAccessToken } from "../lib/session";
import toast from "react-hot-toast";

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "en-IN", label: "English",    flag: "🇬🇧", speech: "en-IN" },
  { code: "hi-IN", label: "Hindi",      flag: "🇮🇳", speech: "hi-IN" },
  { code: "hi-IN", label: "Hinglish",   flag: "🇮🇳", speech: "hi-IN" },
  { code: "ar-SA", label: "Arabic",     flag: "🇸🇦", speech: "ar-SA" },
  { code: "fr-FR", label: "French",     flag: "🇫🇷", speech: "fr-FR" },
  { code: "de-DE", label: "German",     flag: "🇩🇪", speech: "de-DE" },
  { code: "es-ES", label: "Spanish",    flag: "🇪🇸", speech: "es-ES" },
  { code: "pt-BR", label: "Portuguese", flag: "🇧🇷", speech: "pt-BR" },
  { code: "zh-CN", label: "Chinese",    flag: "🇨🇳", speech: "zh-CN" },
  { code: "ja-JP", label: "Japanese",   flag: "🇯🇵", speech: "ja-JP" },
];

const AI_MODES = [
  {
    key: "crm",
    label: "CRM Assistant",
    icon: Brain,
    color: "#6366F1",
    description: "Leads, deals, tasks, pipeline",
    modeHint: "You are in CRM Assistant mode. Help the user understand and manage their CRM data — leads, deals, tasks, pipeline and activities. Always use live CRM tools to answer data questions. For 'morning briefing' or 'what should I do today', call get_ai_recommendations + get_pipeline_summary together.",
    suggestions: [
      "Show me today's hot leads",
      "Summarize my pipeline status",
      "Which deals are at risk?",
      "List overdue tasks",
      "Who should I follow up with today?",
      "Give me my morning briefing",
    ],
  },
  {
    key: "sales",
    label: "Sales Copilot",
    icon: TrendingUp,
    color: "#10B981",
    description: "Emails, proposals, deal closing",
    modeHint: "You are in Sales Copilot mode. Help close deals, write compelling sales emails, generate proposals, suggest follow-up strategies, and coach the sales team. Write content tailored to the Indian B2B market.",
    suggestions: [
      "Write a cold email for a SaaS company",
      "Create a follow-up sequence for warm leads",
      "Generate a sales proposal template",
      "How do I handle price objections?",
      "Write a LinkedIn outreach message",
      "Create a discovery call script",
    ],
  },
  {
    key: "meeting",
    label: "Meeting Assistant",
    icon: Calendar,
    color: "#F59E0B",
    description: "Agendas, summaries, MOM, tasks",
    modeHint: "You are in Meeting Assistant mode. Create meeting agendas, write minutes of meetings (MOM), generate follow-up action items, prepare meeting briefs, and help schedule meetings professionally. Use get_meetings to check upcoming meetings.",
    suggestions: [
      "What meetings do I have today?",
      "Create a meeting agenda for a sales review",
      "Write MOM for a client meeting",
      "Generate follow-up tasks from a meeting",
      "Draft a meeting invite email",
      "Prepare me for my next meeting",
    ],
  },
  {
    key: "email",
    label: "Email Assistant",
    icon: Mail,
    color: "#3B82F6",
    description: "Cold, warm, follow-up, proposals",
    modeHint: "You are in Email Assistant mode. Write professional and persuasive emails — cold outreach, warm follow-ups, proposals, reminders, re-engagement campaigns, and win-back emails. Support rewrite, expand, shorten, translate, and tone adjustment.",
    suggestions: [
      "Write a cold outreach email",
      "Create a warm follow-up email",
      "Write a proposal email",
      "Improve the grammar of my email",
      "Translate this email to Hindi",
      "Make this email more professional",
    ],
  },
  {
    key: "analytics",
    label: "Analytics Assistant",
    icon: BarChart3,
    color: "#8B5CF6",
    description: "Reports, trends, forecasts, risks",
    modeHint: "You are in Analytics Assistant mode. Explain reports, analyze trends, create revenue forecasts, summarize dashboard data, identify risks, and provide data-driven insights. Use get_analytics_summary and get_pipeline_summary for data questions.",
    suggestions: [
      "What is our revenue trend this quarter?",
      "Show me conversion rates by lead source",
      "Which sales rep is top performing?",
      "What are our biggest pipeline risks?",
      "Compare this month vs last month",
      "Give me a full analytics report",
    ],
  },
  {
    key: "lead_ai",
    label: "Lead Qualification",
    icon: Target,
    color: "#EF4444",
    description: "Scoring, conversion prediction",
    modeHint: "You are in Lead Qualification AI mode. Score leads, explain what makes them strong or weak, predict conversion probability, suggest prioritization strategies, and recommend next best actions. Use get_leads and get_ai_recommendations.",
    suggestions: [
      "Score and rank my top 10 leads",
      "Which leads have the highest conversion chance?",
      "Why did this lead score low?",
      "What is the conversion probability for hot leads?",
      "Suggest next action for each hot lead",
      "Which cold leads should I revive?",
    ],
  },
  {
    key: "content_gen",
    label: "Content Generator",
    icon: PenTool,
    color: "#EC4899",
    description: "Blogs, posts, WhatsApp, SMS, scripts",
    modeHint: "You are in Content Generator mode. Create high-quality content: blogs, LinkedIn posts, WhatsApp messages, SMS, product descriptions, landing page copy, call scripts, and marketing content. Support rewrite, expand, shorten, translate, and tone changes.",
    suggestions: [
      "Write a LinkedIn post about our CRM",
      "Create a WhatsApp follow-up message",
      "Write a product description for B2B SaaS",
      "Create a blog outline on sales productivity",
      "Generate 5 SMS templates for lead follow-up",
      "Write a cold call script for IT companies",
    ],
  },
  {
    key: "recommendations",
    label: "AI Recommendations",
    icon: Lightbulb,
    color: "#F97316",
    description: "Best actions, risks, priorities",
    modeHint: "You are in AI Recommendations mode. Proactively surface the best next actions, risk alerts, lead priorities, deal health, customer health scores, and automation suggestions. Always call get_ai_recommendations + get_pipeline_summary to give fresh, data-driven advice.",
    suggestions: [
      "What should I focus on today?",
      "Which leads need immediate attention?",
      "What deals are at highest risk?",
      "Give me my top 5 action items",
      "Which activities should be automated?",
      "Alert me about any missed follow-ups",
    ],
  },
  {
    key: "workflow",
    label: "Workflow Assistant",
    icon: Settings,
    color: "#06B6D4",
    description: "CRM workflows, guides, automations",
    modeHint: "You are in Workflow Assistant mode. Explain CRM workflows, guide new users through processes, suggest automation opportunities, explain module relationships, and help with onboarding. Be a helpful, patient teacher.",
    suggestions: [
      "Explain the lead-to-deal workflow",
      "How do I set up follow-up reminders?",
      "Guide me through the pipeline module",
      "What automations can improve my workflow?",
      "How does the activity log work?",
      "Explain the difference between leads and deals",
    ],
  },
  {
    key: "help",
    label: "CRM Help Guide",
    icon: HelpCircle,
    color: "#14B8A6",
    description: "Module guides, how-to, FAQs",
    modeHint: "You are in CRM Help Guide mode. Explain every feature of Sales CRM in simple language. Guide users step-by-step through any module. Answer FAQs. Be patient, clear, and use numbered steps for processes.",
    suggestions: [
      "How do I import leads from Excel?",
      "How do I assign a lead to a team member?",
      "What is the DSR module?",
      "How do I generate a performance report?",
      "How do I set up email integration?",
      "Explain the Kanban pipeline view",
    ],
  },
  {
    key: "release_notes",
    label: "Release Notes",
    icon: Newspaper,
    color: "#A855F7",
    description: "What's new, updates, version history",
    modeHint: "You are in Release Notes mode. Tell users about the latest Sales CRM updates, new features, bug fixes, and upcoming features. Always call get_release_notes to get the actual version history. Be enthusiastic about new features.",
    suggestions: [
      "What's new in Sales CRM?",
      "Show me the latest release notes",
      "What features were added this month?",
      "What's the current version?",
      "Tell me about recent bug fixes",
      "What features are coming soon?",
    ],
  },
];

const THINKING_STATUSES = [
  "Reviewing CRM data...",
  "Analyzing your pipeline...",
  "Checking lead activity...",
  "Preparing insights...",
  "Generating response...",
  "Cross-referencing data...",
  "Identifying key points...",
  "Running AI analysis...",
  "Fetching live data...",
  "Almost ready...",
];

const DEFAULT_PROMPT_LIBRARY = [
  { id: "pl-1", title: "Morning Briefing",     text: "Give me my morning briefing — hot leads, overdue tasks, meetings today, and top action items.", category: "Daily" },
  { id: "pl-2", title: "Pipeline Summary",      text: "Summarize my entire pipeline — stages, values, risks, and recommended next steps.", category: "Pipeline" },
  { id: "pl-3", title: "Cold Email Template",   text: "Write a cold email for a B2B SaaS prospect. Company industry: [industry]. Pain point: [pain point]. CTA: book a demo.", category: "Email" },
  { id: "pl-4", title: "Follow-up Email",       text: "Write a warm follow-up email for a lead I spoke with last week. Keep it brief and end with a clear CTA.", category: "Email" },
  { id: "pl-5", title: "Hot Leads Today",       text: "Show me all hot leads with follow-ups due today or overdue.", category: "Leads" },
  { id: "pl-6", title: "Stale Deals Alert",     text: "Which deals haven't been updated in the last 7 days? What should I do about them?", category: "Deals" },
  { id: "pl-7", title: "Sales Proposal",        text: "Generate a professional sales proposal for [Company Name] — include executive summary, problem, solution, pricing, and next steps.", category: "Content" },
  { id: "pl-8", title: "LinkedIn Post",         text: "Write a LinkedIn post about improving B2B sales productivity using CRM. Professional tone, max 200 words.", category: "Content" },
  { id: "pl-9", title: "Team Performance",      text: "Show me team performance — who has the most leads, highest revenue, and most activities this month?", category: "Analytics" },
  { id: "pl-10", title: "Risk Analysis",        text: "Identify all risks in my current pipeline — deals at risk, overdue leads, missing follow-ups.", category: "Analytics" },
  { id: "pl-11", title: "WhatsApp Message",     text: "Write a WhatsApp follow-up message for a warm lead. Casual, friendly tone. Mention our product briefly.", category: "Content" },
  { id: "pl-12", title: "Meeting Prep",         text: "Prepare me for my next meeting — show upcoming meetings, relevant contacts, and suggested talking points.", category: "Meeting" },
];

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text) {
  if (!text) return null;
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={j} style={{ color: "var(--text)", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={j} style={{ fontSize: "0.87em", background: "rgba(99,102,241,0.12)", padding: "1px 6px", borderRadius: 4, color: "#818CF8", fontFamily: "monospace" }}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={j}>{part.slice(1, -1)}</em>;
    return <span key={j}>{part}</span>;
  });
}

function renderContent(text) {
  if (!text) return null;
  return text.split("\n").map((line, i, arr) => {
    if (line.match(/^###\s+(.+)/)) return <div key={i} style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginTop: 10, marginBottom: 3 }}>{renderInline(line.replace(/^###\s+/, ""))}</div>;
    if (line.match(/^##\s+(.+)/))  return <div key={i} style={{ fontWeight: 800, fontSize: 14, color: "var(--text)", marginTop: 12, marginBottom: 4 }}>{renderInline(line.replace(/^##\s+/, ""))}</div>;
    if (line.match(/^#\s+(.+)/))   return <div key={i} style={{ fontWeight: 800, fontSize: 15, color: "var(--text)", marginTop: 12, marginBottom: 4 }}>{renderInline(line.replace(/^#\s+/, ""))}</div>;
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) return (
      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <span style={{ color: "#818CF8", fontWeight: 700, fontSize: 12, minWidth: 18, flexShrink: 0, paddingTop: 1 }}>{numMatch[1]}.</span>
        <span>{renderInline(numMatch[2])}</span>
      </div>
    );
    const bulletMatch = line.match(/^[-•*]\s+(.+)/);
    if (bulletMatch) return (
      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <span style={{ color: "#818CF8", fontSize: 18, lineHeight: "1.1", flexShrink: 0 }}>·</span>
        <span>{renderInline(bulletMatch[1])}</span>
      </div>
    );
    if (line.match(/^---+$/)) return <div key={i} style={{ borderTop: "1px solid var(--border)", margin: "10px 0" }} />;
    if (line.trim() === "") return i < arr.length - 1 ? <div key={i} style={{ height: 6 }} /> : null;
    return <div key={i} style={{ marginBottom: 2 }}>{renderInline(line)}</div>;
  });
}

// ─── Brain Orb ────────────────────────────────────────────────────────────────

function BrainOrb({ state = "idle", size = 56 }) {
  const isThinking  = state === "thinking";
  const isListening = state === "listening";
  const isSpeaking  = state === "speaking";
  const isActive    = isThinking || isListening || isSpeaking;

  const orbColor = isListening
    ? "linear-gradient(135deg,#EF4444,#F97316)"
    : isSpeaking
    ? "linear-gradient(135deg,#6366F1,#8B5CF6)"
    : isThinking
    ? "linear-gradient(135deg,#4F46E5,#7C3AED)"
    : "linear-gradient(135deg,#1E293B,#334155)";

  const glowColor = isListening
    ? "rgba(239,68,68,0.55)"
    : "rgba(99,102,241,0.55)";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {isActive && [1, 2].map((i) => (
        <motion.div key={i}
          style={{ position: "absolute", inset: -(i * 10), borderRadius: "50%", border: `1px solid ${glowColor.replace("0.55", String(0.25 / i))}` }}
          animate={{ scale: [1, 1.18, 1], opacity: [0.7, 0.15, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.35 }}
        />
      ))}
      <motion.div
        style={{
          width: size, height: size, borderRadius: "50%",
          background: orbColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: isActive
            ? `0 0 28px ${glowColor}, 0 0 56px ${glowColor.replace("0.55", "0.2")}`
            : "0 0 18px rgba(99,102,241,0.22)",
          border: "1.5px solid rgba(99,102,241,0.28)",
          transition: "background 0.4s, box-shadow 0.4s",
        }}
        animate={isThinking ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={{ repeat: Infinity, duration: 1.2 }}
      >
        {isThinking ? (
          <div style={{ display: "flex", gap: 3 }}>
            {[0, 1, 2].map((i) => (
              <motion.div key={i}
                style={{ width: Math.max(4, size * 0.07), height: Math.max(4, size * 0.07), borderRadius: "50%", background: "rgba(255,255,255,0.9)" }}
                animate={{ y: [-3, 3, -3] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        ) : (
          <Brain size={size * 0.44} style={{ color: "#fff", opacity: 0.95 }} strokeWidth={1.5} />
        )}
      </motion.div>
    </div>
  );
}

// ─── Voice Bars ───────────────────────────────────────────────────────────────

function VoiceBars({ active }) {
  const heights = [14, 22, 18, 28, 16, 24, 12, 20, 26];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 32 }}>
      {heights.map((h, i) => (
        <motion.div key={i}
          style={{ width: 3, background: "#EF4444", borderRadius: 99 }}
          animate={active
            ? { height: [h * 0.4, h, h * 0.6, h * 1.1, h * 0.5] }
            : { height: 3 }}
          transition={{ duration: 0.5 + i * 0.05, repeat: Infinity, delay: i * 0.06 }}
        />
      ))}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine, onCopy, onLike, onDislike, onRegenerate, onSavePrompt, liked, disliked, copiedId, savedPrompts }) {
  const [hovered, setHovered] = useState(false);
  const isSaved = msg.role === "user" && savedPrompts?.some(p => p.text === msg.content);

  if (msg.type === "system") {
    return (
      <div style={{ textAlign: "center", padding: "4px 0" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface-2)", padding: "3px 12px", borderRadius: 99, border: "1px solid var(--border)" }}>
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 24, stiffness: 300 }}
      style={{ display: "flex", flexDirection: isMine ? "row-reverse" : "row", gap: 10, alignItems: "flex-start" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0, marginTop: 2,
        background: isMine
          ? "linear-gradient(135deg,#2563EB,#4F46E5)"
          : "linear-gradient(135deg,#6366F1,#8B5CF6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: isMine ? "0 2px 12px rgba(37,99,235,0.35)" : "0 2px 12px rgba(99,102,241,0.4)",
        flexShrink: 0,
      }}>
        {isMine
          ? <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{msg.senderInitial || "U"}</span>
          : <Sparkles size={14} style={{ color: "#fff" }} />}
      </div>

      {/* Content */}
      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 3, alignItems: isMine ? "flex-end" : "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: isMine ? "var(--text-2)" : "#A78BFA" }}>
            {isMine ? "You" : "Sales Assistant"}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {msg.ts ? format(new Date(msg.ts), "h:mm a") : ""}
          </span>
        </div>

        {msg.imageUrl && (
          <div style={{ marginBottom: 6, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
            <img src={msg.imageUrl} alt="attachment" style={{ maxWidth: 260, display: "block" }} />
          </div>
        )}

        {msg.fileName && !msg.imageUrl && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "6px 12px", borderRadius: 10,
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.2)", marginBottom: 4,
          }}>
            <FileText size={13} style={{ color: "#818CF8" }} />
            <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>{msg.fileName}</span>
          </div>
        )}

        {msg.content && (
          isMine ? (
            <div style={{
              padding: "10px 14px", borderRadius: "18px 4px 18px 18px",
              background: "linear-gradient(135deg,#6366F1,#4F46E5)",
              color: "#fff", fontSize: 13.5, lineHeight: 1.55,
              boxShadow: "0 4px 20px rgba(99,102,241,0.35)",
            }}>
              {msg.content}
            </div>
          ) : (
            <div style={{
              padding: "12px 16px", borderRadius: "4px 18px 18px 18px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              fontSize: 13.5, lineHeight: 1.6, color: "var(--text)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
              position: "relative",
            }}>
              {renderContent(msg.content || " ")}
              {msg.streaming && (
                <motion.span
                  style={{ display: "inline-block", width: 2, height: 16, background: "#818CF8", borderRadius: 2, marginLeft: 3, verticalAlign: "middle" }}
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              )}
            </div>
          )
        )}

        {/* Action bar */}
        <AnimatePresence>
          {hovered && !msg.streaming && msg.content && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              style={{ display: "flex", alignItems: "center", gap: 2, padding: "3px 6px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}
            >
              {isMine ? (
                // User message: save as prompt
                <button onClick={() => onSavePrompt?.(msg.content)} title={isSaved ? "Saved to library" : "Save to Prompt Library"}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 7, color: isSaved ? "#F59E0B" : "var(--text-muted)", display: "flex", alignItems: "center" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  {isSaved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                </button>
              ) : (
                // AI message: copy, like, dislike, regenerate
                <>
                  {[
                    { icon: copiedId === msg.id ? Check : Copy, title: "Copy", onClick: () => onCopy(msg.content, msg.id), active: copiedId === msg.id, color: copiedId === msg.id ? "#10B981" : null },
                    { icon: ThumbsUp,   title: "Helpful",    onClick: () => onLike(msg.id),    active: liked,    color: liked    ? "#10B981" : null },
                    { icon: ThumbsDown, title: "Not helpful",onClick: () => onDislike(msg.id), active: disliked, color: disliked ? "#EF4444" : null },
                    { icon: RefreshCw,  title: "Regenerate", onClick: onRegenerate, active: false },
                  ].map(({ icon: Icon, title, onClick, active, color }) => (
                    <button key={title} onClick={onClick} title={title}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 6px", borderRadius: 7, color: color || (active ? "var(--accent)" : "var(--text-muted)"), display: "flex", alignItems: "center", transition: "all 0.12s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                    >
                      <Icon size={12} />
                    </button>
                  ))}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ selectedLang, onSelectLang, onStart }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35 }}
      style={{
        position: "absolute", inset: 0, zIndex: 50,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "var(--bg)",
        backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%)",
        padding: "32px 24px",
        overflow: "auto",
      }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 18, stiffness: 200, delay: 0.1 }}
        style={{ marginBottom: 24 }}
      >
        <BrainOrb size={110} state="idle" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        style={{ textAlign: "center", marginBottom: 28 }}
      >
        <h1 style={{ margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: "-0.04em", color: "var(--text)", lineHeight: 1.1 }}>
          Sales CRM{" "}
          <span style={{ background: "linear-gradient(135deg,#6366F1,#8B5CF6,#A78BFA)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            AI
          </span>
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 16, color: "var(--text-muted)", fontWeight: 500 }}>
          Your Enterprise CRM Intelligence Platform
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14, flexWrap: "wrap" }}>
          {["11 AI Modes", "Voice Input", "Live CRM Data", "Prompt Library", "Content Generator"].map(f => (
            <span key={f} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818CF8", fontWeight: 600 }}>
              {f}
            </span>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
        style={{ width: "100%", maxWidth: 520 }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", textAlign: "center", marginBottom: 14 }}>
          Select your language
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {LANGUAGES.map((lang) => {
            const active = selectedLang.label === lang.label;
            return (
              <button key={lang.label} onClick={() => onSelectLang(lang)}
                style={{
                  padding: "8px 16px", borderRadius: 99,
                  border: `1.5px solid ${active ? "#6366F1" : "var(--border)"}`,
                  background: active ? "rgba(99,102,241,0.12)" : "var(--surface)",
                  color: active ? "#818CF8" : "var(--text-muted)",
                  fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.15s",
                  boxShadow: active ? "0 0 0 3px rgba(99,102,241,0.15)" : "none",
                }}
              >
                <span style={{ fontSize: 15 }}>{lang.flag}</span> {lang.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        onClick={onStart}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        style={{
          marginTop: 36, padding: "14px 40px",
          background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
          color: "#fff", border: "none", borderRadius: 14,
          fontSize: 15, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 8px 32px rgba(99,102,241,0.4), 0 0 0 1px rgba(99,102,241,0.2)",
          fontFamily: "inherit",
        }}
      >
        <Sparkles size={16} />
        Start Chatting with Sales Assistant
        <ChevronRight size={16} />
      </motion.button>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.65 }}
        style={{ marginTop: 20, fontSize: 11.5, color: "var(--text-muted)", textAlign: "center" }}
      >
        Powered by Sales Assistant · Enterprise CRM Intelligence · 11 AI Modes
      </motion.p>
    </motion.div>
  );
}

// ─── Right Panel (Suggestions | Prompt Library | AI Insights) ────────────────

function RightPanel({ mode, onAskAI, loading, savedPrompts, onDeletePrompt }) {
  const [activeTab, setActiveTab] = useState("suggestions");
  const ModeIcon = mode.icon;

  const PROMPT_CATEGORIES = ["All", "Daily", "Leads", "Deals", "Pipeline", "Email", "Content", "Analytics", "Meeting"];
  const [filterCat, setFilterCat] = useState("All");

  const filtered = activeTab === "library"
    ? DEFAULT_PROMPT_LIBRARY.filter(p => filterCat === "All" || p.category === filterCat)
    : [];

  const tabs = [
    { id: "suggestions", label: "Suggestions", icon: Sparkles },
    { id: "library",     label: "Library",     icon: BookOpen },
    { id: "saved",       label: "Saved",        icon: Star },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1, padding: "9px 4px", background: "none", border: "none",
                borderBottom: `2px solid ${isActive ? "#6366F1" : "transparent"}`,
                color: isActive ? "#818CF8" : "var(--text-muted)",
                fontSize: 11, fontWeight: isActive ? 700 : 500,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                transition: "all 0.13s", fontFamily: "inherit",
              }}
            >
              <Icon size={11} />{t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }} className="custom-scroll">

        {/* ── Suggestions ── */}
        {activeTab === "suggestions" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: `${mode.color}18`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${mode.color}30` }}>
                <ModeIcon size={12} style={{ color: mode.color }} />
              </div>
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text)" }}>{mode.label}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{mode.description}</div>
              </div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 8 }}>
              Quick prompts
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {mode.suggestions.map((s) => (
                <button key={s} onClick={() => onAskAI(s)} disabled={loading}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "8px 10px", borderRadius: 9,
                    background: "var(--surface)", border: "1px solid var(--border)",
                    color: "var(--text-2)", fontSize: 12, fontWeight: 500,
                    cursor: loading ? "not-allowed" : "pointer", textAlign: "left",
                    width: "100%", transition: "all 0.13s", opacity: loading ? 0.5 : 1,
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = mode.color + "50"; e.currentTarget.style.background = mode.color + "08"; e.currentTarget.style.color = "var(--text)"; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = "var(--text-2)"; }}
                >
                  <ChevronRight size={10} style={{ color: mode.color, flexShrink: 0 }} />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Prompt Library ── */}
        {activeTab === "library" && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Prompt Library</div>
            {/* Category filter */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              {PROMPT_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setFilterCat(cat)}
                  style={{
                    padding: "3px 8px", borderRadius: 99, fontSize: 10, fontWeight: filterCat===cat?700:500,
                    background: filterCat===cat?"rgba(99,102,241,0.15)":"var(--surface)",
                    border: `1px solid ${filterCat===cat?"rgba(99,102,241,0.4)":"var(--border)"}`,
                    color: filterCat===cat?"#818CF8":"var(--text-muted)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >{cat}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map(p => (
                <button key={p.id} onClick={() => onAskAI(p.text)} disabled={loading}
                  style={{
                    display: "block", textAlign: "left", padding: "9px 11px", borderRadius: 9,
                    background: "var(--surface)", border: "1px solid var(--border)",
                    cursor: loading?"not-allowed":"pointer", width: "100%",
                    transition: "all 0.13s", opacity: loading?0.5:1, fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)"; e.currentTarget.style.background = "rgba(99,102,241,0.04)"; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
                >
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>{p.title}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.text}</div>
                  <div style={{ marginTop: 5 }}>
                    <span style={{ fontSize: 9.5, padding: "2px 6px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#818CF8", fontWeight: 600 }}>{p.category}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Saved Prompts ── */}
        {activeTab === "saved" && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Saved Prompts</div>
            {savedPrompts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 12px", color: "var(--text-muted)" }}>
                <Star size={28} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3 }} />
                <div style={{ fontSize: 12 }}>No saved prompts yet</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Hover over your messages and click <Bookmark size={10} style={{verticalAlign:"middle"}}/> to save prompts</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {savedPrompts.map((p, idx) => (
                  <div key={idx} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 10px" }}>
                    <div style={{ fontSize: 11.5, color: "var(--text-2)", lineHeight: 1.45, marginBottom: 6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{p.text}</div>
                    <div style={{ display: "flex", gap: 5 }}>
                      <button onClick={() => onAskAI(p.text)} disabled={loading}
                        style={{ flex: 1, padding: "4px 0", borderRadius: 7, background: "rgba(99,102,241,0.1)", border: "none", color: "#818CF8", fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Use
                      </button>
                      <button onClick={() => onDeletePrompt?.(idx)}
                        style={{ padding: "4px 8px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "none", color: "#EF4444", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit" }}>
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIAssistant() {
  const { profile } = useAuth();

  // ── Persistent preferences ─────────────────────────────────────────────────
  const [selectedLang, setSelectedLang] = useState(() => {
    const saved = localStorage.getItem("salescrm-ai-lang");
    return LANGUAGES.find(l => l.label === saved) || LANGUAGES[0];
  });
  const [hasStarted, setHasStarted] = useState(false);
  const [currentMode, setCurrentMode] = useState(AI_MODES[0]);

  // ── Saved prompts (localStorage) ───────────────────────────────────────────
  const [savedPrompts, setSavedPrompts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("salescrm-ai-saved-prompts") || "[]"); }
    catch { return []; }
  });

  const savePrompt = useCallback((text) => {
    setSavedPrompts(prev => {
      if (prev.some(p => p.text === text)) {
        toast("Already in your saved prompts", { icon: "⭐" });
        return prev;
      }
      const updated = [{ text, savedAt: new Date().toISOString() }, ...prev].slice(0, 50);
      localStorage.setItem("salescrm-ai-saved-prompts", JSON.stringify(updated));
      toast.success("Saved to Prompt Library");
      return updated;
    });
  }, []);

  const deletePrompt = useCallback((idx) => {
    setSavedPrompts(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      localStorage.setItem("salescrm-ai-saved-prompts", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState("");
  const [loading, setLoading]             = useState(false);
  const [pendingEmailDraft, setPendingEmailDraft] = useState(null);
  const [emailSending, setEmailSending]   = useState(false);

  // ── AI state ───────────────────────────────────────────────────────────────
  const [aiState, setAiState]               = useState("idle");
  const [thinkingStatus, setThinkingStatus] = useState(THINKING_STATUSES[0]);

  // ── Voice state ────────────────────────────────────────────────────────────
  const [isVoiceOn, setIsVoiceOn] = useState(false);
  const [isMuted, setIsMuted]     = useState(true);
  const recognitionRef   = useRef(null);
  const transcriptRef    = useRef("");
  const silenceTimerRef  = useRef(null);
  const isListeningRef   = useRef(false);
  const isMutedRef       = useRef(true);
  const voicesRef        = useRef([]);
  const speakingRef      = useRef(false);

  // ── Message actions ────────────────────────────────────────────────────────
  const [likedMsgs, setLikedMsgs]       = useState(new Set());
  const [dislikedMsgs, setDislikedMsgs] = useState(new Set());
  const [copiedId, setCopiedId]          = useState(null);
  const [lastUserMsg, setLastUserMsg]    = useState("");

  // ── UI state ───────────────────────────────────────────────────────────────
  const [showLeft, setShowLeft]         = useState(true);
  const [showRight, setShowRight]       = useState(true);
  const [showLangPicker, setShowLangPicker] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const bottomRef      = useRef(null);
  const inputRef       = useRef(null);
  const fileInputRef   = useRef(null);
  const imageInputRef  = useRef(null);
  const synthRef       = useRef(window.speechSynthesis);
  const thinkingTimer  = useRef(null);
  const sendMsgRef     = useRef(null);
  const abortRef       = useRef(null);

  // ── Mode greeting ──────────────────────────────────────────────────────────
  const getModeGreeting = useCallback((mode, lang) => {
    const greetings = {
      crm:             `I'm your **CRM Assistant** — Sales Assistant. I have live access to your leads, deals, tasks, meetings, and pipeline. What would you like to explore today?`,
      sales:           `I'm your **Sales Copilot** — Sales Assistant. I write emails, craft proposals, coach on objections, and help you close deals faster. What do you need?`,
      meeting:         `I'm your **Meeting Assistant** — Sales Assistant. I create agendas, meeting summaries, MOM, and follow-up tasks. I can also check your upcoming meetings. How can I help?`,
      email:           `I'm your **Email Assistant** — Sales Assistant. I write cold emails, warm follow-ups, proposals, and more. I can also rewrite, shorten, translate, or improve any email. What email should I draft?`,
      analytics:       `I'm your **Analytics Assistant** — Sales Assistant. I analyze your CRM data, forecast trends, surface insights, and explain performance metrics. What would you like to understand?`,
      lead_ai:         `I'm your **Lead Qualification AI** — Sales Assistant. I score leads, predict conversion probability, and suggest the best next actions. Which leads should I analyze?`,
      content_gen:     `I'm your **Content Generator** — Sales Assistant. I create blogs, LinkedIn posts, WhatsApp messages, SMS templates, call scripts, landing pages, and more. What content should I generate?`,
      recommendations: `I'm your **AI Recommendations** engine — Sales Assistant. Let me analyze your CRM data and surface your top priorities, risks, and next best actions right now.`,
      workflow:        `I'm your **Workflow Assistant** — Sales Assistant. I explain CRM processes, guide new users, and suggest automations. Where do you need help?`,
      help:            `I'm your **CRM Help Guide** — Sales Assistant. I can explain every feature of Sales CRM in simple language and guide you step-by-step. What do you want to learn?`,
      release_notes:   `I'm your **Release Notes Assistant** — Sales Assistant. Ask me about the latest updates, new features, version history, or what's coming next in Sales CRM!`,
    };
    const base = greetings[mode.key] || "How can I help you today?";
    const langNote = lang.label !== "English" ? `\n\n*I'll respond in **${lang.label}** as selected.*` : "";
    return base + langNote;
  }, []);

  // ── Initialize greeting when chat starts / mode changes ───────────────────
  useEffect(() => {
    if (hasStarted) {
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: getModeGreeting(currentMode, selectedLang),
        ts: new Date(),
      }]);
    }
  }, [hasStarted, currentMode, selectedLang, getModeGreeting]);

  // ── Thinking status rotation ───────────────────────────────────────────────
  useEffect(() => {
    if (aiState === "thinking") {
      let idx = 0;
      thinkingTimer.current = setInterval(() => {
        idx = (idx + 1) % THINKING_STATUSES.length;
        setThinkingStatus(THINKING_STATUSES[idx]);
      }, 1800);
    } else {
      clearInterval(thinkingTimer.current);
    }
    return () => clearInterval(thinkingTimer.current);
  }, [aiState]);

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // ── Keep isMutedRef in sync ────────────────────────────────────────────────
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // ── Pre-load TTS voices ────────────────────────────────────────────────────
  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis?.getVoices() || [];
    };
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // ── Speech recognition init ────────────────────────────────────────────────
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    const rec = new SR();
    rec.continuous     = true;
    rec.interimResults = true;
    rec.lang           = selectedLang.speech;
    rec.maxAlternatives = 1;

    rec.onstart = () => console.log("[Voice] Recognition Started");

    rec.onresult = (e) => {
      let newFinal   = "";
      let newInterim = "";

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          newFinal += text + " ";
        } else {
          newInterim += text;
        }
      }

      if (newFinal) {
        transcriptRef.current = (transcriptRef.current + newFinal).trimStart();
      }

      setInput(transcriptRef.current + newInterim);

      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (!isListeningRef.current) return;
        const fullTranscript = transcriptRef.current.trim();
        if (!fullTranscript) return;

        isListeningRef.current = false;
        clearTimeout(silenceTimerRef.current);
        try { rec.stop(); } catch {}
        setAiState("idle");
        setIsVoiceOn(false);
        transcriptRef.current = "";

        sendMsgRef.current?.(fullTranscript);
      }, 3500);
    };

    rec.onend = () => {
      if (isListeningRef.current) {
        setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            try { recognitionRef.current.start(); } catch (err) {}
          }
        }, 100);
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed") {
        toast.error("Microphone access denied. Allow it in browser settings.");
        isListeningRef.current = false;
        clearTimeout(silenceTimerRef.current);
        transcriptRef.current = "";
        setAiState("idle");
        setIsVoiceOn(false);
      } else if (e.error === "no-speech" || e.error === "aborted") {
        // Normal — continue
      } else {
        toast.error("Voice recognition error: " + e.error);
        isListeningRef.current = false;
        clearTimeout(silenceTimerRef.current);
        transcriptRef.current = "";
        setAiState("idle");
        setIsVoiceOn(false);
      }
    };

    recognitionRef.current = rec;

    return () => {
      isListeningRef.current = false;
      clearTimeout(silenceTimerRef.current);
      try { rec.stop(); } catch {}
    };
  }, [selectedLang.speech]);

  // ── TTS ────────────────────────────────────────────────────────────────────
  const speakText = useCallback((text) => {
    if (isMutedRef.current) return;
    if (!synthRef.current) return;
    if (speakingRef.current) {
      synthRef.current.cancel();
    }
    synthRef.current.cancel();
    speakingRef.current = false;

    const cleanText = text
      .replace(/[*_`#<>]/g, "")
      .replace(/\n+/g, " ")
      .trim()
      .slice(0, 800);
    if (!cleanText) return;

    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang   = selectedLang.speech;
    utter.rate   = 0.95;
    utter.pitch  = 1.05;
    utter.volume = 1;

    const voices   = voicesRef.current.length ? voicesRef.current : (synthRef.current.getVoices() || []);
    const langCode = selectedLang.speech.split("-")[0];
    const pref = voices.find(v => v.lang === selectedLang.speech && !v.localService)
      || voices.find(v => v.lang === selectedLang.speech)
      || voices.find(v => v.lang.startsWith(langCode) && !v.localService)
      || voices.find(v => v.lang.startsWith(langCode));
    if (pref) utter.voice = pref;

    utter.onstart = () => { speakingRef.current = true; setAiState("speaking"); };
    utter.onend   = () => { speakingRef.current = false; setAiState("idle"); };
    utter.onerror = () => { speakingRef.current = false; setAiState("idle"); };

    synthRef.current.speak(utter);
  }, [selectedLang.speech]);

  const stopSpeaking = () => {
    synthRef.current?.cancel();
    speakingRef.current = false;
    setAiState("idle");
  };

  // ── Voice input ────────────────────────────────────────────────────────────
  const startVoice = () => {
    const rec = recognitionRef.current;
    if (!rec) { toast.error("Voice recognition is not supported. Use Chrome or Edge."); return; }
    if (isListeningRef.current) return;

    synthRef.current?.cancel();
    speakingRef.current = false;

    transcriptRef.current = "";
    setInput("");
    isListeningRef.current = true;
    setIsVoiceOn(true);
    setAiState("listening");

    rec.lang = selectedLang.speech;
    try {
      rec.start();
    } catch (err) {
      isListeningRef.current = false;
      setIsVoiceOn(false);
      setAiState("idle");
    }
  };

  const stopVoice = () => {
    isListeningRef.current = false;
    clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = null;
    transcriptRef.current = "";
    try { recognitionRef.current?.stop(); } catch {}
    setAiState("idle");
    setIsVoiceOn(false);
  };

  // ── Stop AI generation ────────────────────────────────────────────────────
  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
    setLoading(false);
    setAiState("idle");
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput("");
    setLastUserMsg(content);

    const userMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
      ts: new Date(),
      senderInitial: profile?.full_name?.[0]?.toUpperCase() || "U",
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setAiState("thinking");
    setThinkingStatus("Connecting to Sales Assistant...");

    const streamId = `a-${Date.now()}`;
    setMessages(prev => [...prev, { id: streamId, role: "assistant", content: "", ts: new Date(), streaming: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamARIA({
        message: content,
        pageContext: {
          module:   "Sales AI",
          mode:     currentMode.label,
          modeHint: currentMode.modeHint,
          language: selectedLang.label,
        },
        getToken:  () => getAccessToken(),
        signal:    controller.signal,
        onStatus:  (status) => setThinkingStatus(status),
        onToken:   (_, fullText) => {
          setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: fullText } : m));
        },
        onDone: (fullText) => {
          setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: fullText, streaming: false } : m));
          speakText(fullText);
        },
        onEmailDraft: (draft) => {
          setPendingEmailDraft(draft);
        },
        onError: (err) => {
          const msg = /rate.limit|429|quota/i.test(err?.message)
            ? "**Rate limit reached.** Please wait a moment and try again."
            : /401|unauthorized/i.test(err?.message)
            ? "**Session token expired.** Please try your message again — the session has been refreshed automatically."
            : `**Error:** ${err?.message || "Unknown error"}`;
          setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: msg, streaming: false } : m));
        },
      });
    } finally {
      setLoading(false);
      setAiState("idle");
      abortRef.current = null;
    }
  };

  useEffect(() => { sendMsgRef.current = sendMessage; });

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileUpload = async (file) => {
    if (!file) return;
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) { toast.error("Max file size is 10 MB"); return; }

    setMessages(prev => [...prev, {
      id: `file-${Date.now()}`,
      role: "user",
      content: "",
      fileName: file.name,
      ts: new Date(),
      senderInitial: profile?.full_name?.[0]?.toUpperCase() || "U",
    }]);

    try {
      const { aiDocumentService } = await import("../services/aiDocumentService").catch(() => ({ aiDocumentService: null }));
      if (aiDocumentService) {
        toast.loading(`Indexing "${file.name}"…`, { id: "file-toast" });
        await aiDocumentService.upload(file, () => {});
        toast.success(`"${file.name}" indexed — Sales Assistant can now answer questions from it`, { id: "file-toast" });
        setMessages(prev => [...prev, {
          id: `sys-${Date.now()}`,
          role: "system",
          type: "system",
          content: `"${file.name}" has been indexed into the knowledge base.`,
          ts: new Date(),
        }]);
      } else {
        // Fallback: tell AI about the file
        setTimeout(() => sendMessage(`I've uploaded a file: "${file.name}". Please acknowledge it and let me know how you can help analyze it.`), 200);
      }
    } catch (err) {
      toast.error(err?.message || "File upload failed", { id: "file-toast" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Image upload ───────────────────────────────────────────────────────────
  const handleImageUpload = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setMessages(prev => [...prev, {
      id: `img-${Date.now()}`,
      role: "user",
      content: "",
      imageUrl: url,
      fileName: file.name,
      ts: new Date(),
      senderInitial: profile?.full_name?.[0]?.toUpperCase() || "U",
    }]);
    setTimeout(() => sendMessage(`I've uploaded an image: "${file.name}". Please analyze it — describe what you see, extract any text (OCR), identify contacts, company names, or any useful CRM data.`), 200);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  // ── Copy / Like / Dislike ─────────────────────────────────────────────────
  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => toast.error("Could not copy"));
  };

  const handleLike    = (id) => setLikedMsgs(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const handleDislike = (id) => setDislikedMsgs(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Regenerate ────────────────────────────────────────────────────────────
  const handleRegenerate = () => {
    if (!lastUserMsg) return;
    setMessages(prev => {
      const last = [...prev].reverse().findIndex(m => m.role === "assistant");
      if (last === -1) return prev;
      return prev.slice(0, prev.length - 1 - last);
    });
    sendMessage(lastUserMsg);
  };

  // ── New Chat ───────────────────────────────────────────────────────────────
  const newChat = async () => {
    stopGeneration();
    stopSpeaking();
    await clearARIAHistory(() => getAccessToken());
    setMessages([{
      id: "welcome-new",
      role: "assistant",
      content: getModeGreeting(currentMode, selectedLang),
      ts: new Date(),
    }]);
    setLastUserMsg("");
    setLikedMsgs(new Set());
    setDislikedMsgs(new Set());
    inputRef.current?.focus();
  };

  // ── Switch Mode ───────────────────────────────────────────────────────────
  const switchMode = async (mode) => {
    if (mode.key === currentMode.key) return;
    stopGeneration();
    stopSpeaking();
    await clearARIAHistory(() => getAccessToken());
    setCurrentMode(mode);
    setLastUserMsg("");
  };

  // ── Export conversation ───────────────────────────────────────────────────
  const exportChat = () => {
    const text = messages
      .filter(m => m.content)
      .map(m => `[${m.role === "user" ? "You" : "Sales Assistant"}] ${m.content}`)
      .join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `salescrm-ai-${format(new Date(), "yyyy-MM-dd-HHmm")}.txt`;
    a.click();
  };

  // ── Language selection ────────────────────────────────────────────────────
  const selectLanguage = (lang) => {
    setSelectedLang(lang);
    localStorage.setItem("salescrm-ai-lang", lang.label);
    setShowLangPicker(false);
  };

  // ── Status display ────────────────────────────────────────────────────────
  const statusText = aiState === "listening" ? "Listening… speak now"
    : aiState === "thinking" ? thinkingStatus
    : aiState === "speaking" ? "Speaking response…"
    : "Ask anything about your CRM, leads, deals, or business";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg)", position: "relative" }}>

      {/* ── Welcome Screen ── */}
      <AnimatePresence>
        {!hasStarted && (
          <WelcomeScreen
            selectedLang={selectedLang}
            onSelectLang={(l) => { setSelectedLang(l); localStorage.setItem("salescrm-ai-lang", l.label); }}
            onStart={() => setHasStarted(true)}
          />
        )}
      </AnimatePresence>

      {/* ── Left Sidebar ── */}
      <AnimatePresence>
        {showLeft && (
          <motion.div
            initial={{ x: -270, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -270, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            style={{
              width: 240, flexShrink: 0,
              borderRight: "1px solid var(--border)",
              background: "var(--surface)",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Brand */}
            <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <BrainOrb size={34} state={aiState} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em" }}>Sales Assistant</div>
                  <div style={{ fontSize: 10.5, color: aiState === "idle" ? "#10B981" : "#A78BFA", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: aiState === "idle" ? "#10B981" : "#A78BFA", display: "inline-block" }} />
                    {aiState === "idle" ? "Online" : aiState === "thinking" ? "Thinking…" : aiState === "listening" ? "Listening…" : "Speaking…"}
                  </div>
                </div>
              </div>

              <button onClick={newChat}
                style={{
                  marginTop: 12, width: "100%",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  padding: "8px 12px", background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
                  border: "none", borderRadius: 10, color: "#fff",
                  fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
                }}
              >
                <Plus size={13} /> New Chat
              </button>
            </div>

            {/* Modes */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }} className="custom-scroll">
              <div style={{ padding: "6px 16px 4px", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
                AI Modes · {AI_MODES.length} Available
              </div>
              {AI_MODES.map((mode) => {
                const Icon  = mode.icon;
                const active = currentMode.key === mode.key;
                return (
                  <button key={mode.key} onClick={() => switchMode(mode)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 16px",
                      background: active ? `${mode.color}12` : "none",
                      border: "none", cursor: "pointer", textAlign: "left",
                      borderLeft: `3px solid ${active ? mode.color : "transparent"}`,
                      transition: "all 0.13s",
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--surface-2)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "none"; }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: active ? `${mode.color}20` : "var(--surface-2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1px solid ${active ? mode.color + "30" : "var(--border)"}`,
                    }}>
                      <Icon size={12} style={{ color: active ? mode.color : "var(--text-muted)" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "var(--text)" : "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {mode.label}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {mode.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer actions */}
            <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={exportChat} title="Export conversation"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, cursor: "pointer", fontSize: 11, color: "var(--text-muted)", fontFamily: "inherit" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                <Download size={11} /> Export
              </button>
              <button onClick={newChat} title="Clear chat"
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 0", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, cursor: "pointer", fontSize: 11, color: "var(--text-muted)", fontFamily: "inherit" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <Trash2 size={11} /> Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Chat Area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{
          padding: "10px 16px", borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          backgroundImage: "linear-gradient(135deg,rgba(99,102,241,0.04) 0%,transparent 60%)",
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <button onClick={() => setShowLeft(v => !v)} className="btn-ghost" style={{ padding: 6 }} title="Toggle sidebar">
            <Menu size={15} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <BrainOrb size={36} state={aiState} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Sales Assistant</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                  background: `${currentMode.color}15`,
                  color: currentMode.color,
                  border: `1px solid ${currentMode.color}30`,
                }}>
                  {currentMode.label}
                </span>
                <span style={{ fontSize: 10, color: aiState === "idle" ? "#10B981" : "#A78BFA", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                  {aiState === "idle" ? "Online" : thinkingStatus}
                </span>
              </div>
              <motion.div key={statusText}
                initial={{ opacity: 0.5 }} animate={{ opacity: 1 }}
                style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {statusText}
              </motion.div>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Language picker */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowLangPicker(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text-2)", fontFamily: "inherit" }}>
                <Globe size={12} />
                <span style={{ fontSize: 13 }}>{selectedLang.flag}</span>
                {selectedLang.label}
              </button>

              <AnimatePresence>
                {showLangPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 12, padding: 8, minWidth: 180,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
                      display: "flex", flexDirection: "column", gap: 2,
                    }}
                  >
                    {LANGUAGES.map((lang) => (
                      <button key={lang.label} onClick={() => selectLanguage(lang)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "7px 10px", borderRadius: 8, border: "none",
                          background: selectedLang.label === lang.label ? "rgba(99,102,241,0.1)" : "none",
                          cursor: "pointer", fontSize: 12.5, fontWeight: selectedLang.label === lang.label ? 700 : 500,
                          color: selectedLang.label === lang.label ? "var(--accent)" : "var(--text-2)",
                          fontFamily: "inherit", textAlign: "left",
                        }}
                        onMouseEnter={(e) => { if (selectedLang.label !== lang.label) e.currentTarget.style.background = "var(--surface-2)"; }}
                        onMouseLeave={(e) => { if (selectedLang.label !== lang.label) e.currentTarget.style.background = "none"; }}
                      >
                        <span style={{ fontSize: 16 }}>{lang.flag}</span>
                        {lang.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Voice output toggle */}
            <button onClick={() => { setIsMuted(v => !v); if (!isMuted) stopSpeaking(); }}
              title={isMuted ? "Enable voice output" : "Disable voice output"}
              style={{ padding: 6, background: isMuted ? "none" : "rgba(16,185,129,0.1)", border: "1px solid", borderColor: isMuted ? "transparent" : "rgba(16,185,129,0.3)", borderRadius: 8, cursor: "pointer", color: isMuted ? "var(--text-muted)" : "#10B981", display: "flex" }}
              className={isMuted ? "btn-ghost" : ""}>
              {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>

            {/* Right panel toggle */}
            <button onClick={() => setShowRight(v => !v)} title="Toggle right panel" className="btn-ghost" style={{ padding: 6 }}>
              {showRight ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          style={{ flex: 1, overflowY: "auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}
          className="custom-scroll"
          onClick={() => setShowLangPicker(false)}
        >
          {/* Empty state */}
          {messages.length === 0 && !loading && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
              <BrainOrb size={64} state="idle" />
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Hi, I'm Sales Assistant</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: 420 }}>
                  I can help you manage your CRM, understand data, generate emails,<br />
                  analyze leads, answer questions, and assist with daily work.
                </div>
              </div>
              {/* Quick action chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
                {["Morning briefing", "Hot leads today", "Write cold email", "Pipeline summary", "What's new?"].map(chip => (
                  <button key={chip} onClick={() => sendMessage(chip)}
                    style={{ padding: "6px 14px", borderRadius: 99, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-2)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.13s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#6366F1"; e.currentTarget.style.color = "#818CF8"; e.currentTarget.style.background = "rgba(99,102,241,0.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.background = "var(--surface)"; }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                isMine={msg.role === "user"}
                onCopy={handleCopy}
                onLike={handleLike}
                onDislike={handleDislike}
                onRegenerate={handleRegenerate}
                onSavePrompt={savePrompt}
                liked={likedMsgs.has(msg.id)}
                disliked={dislikedMsgs.has(msg.id)}
                copiedId={copiedId}
                savedPrompts={savedPrompts}
              />
            ))}
          </AnimatePresence>

          {/* Thinking indicator */}
          {loading && !messages.some(m => m.streaming && m.content) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 12px rgba(99,102,241,0.4)" }}>
                <Sparkles size={14} style={{ color: "#fff" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 2 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#A78BFA" }}>Sales Assistant</span>
                <div style={{
                  padding: "10px 14px", borderRadius: "4px 18px 18px 18px",
                  background: "var(--surface)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  {[0, 1, 2].map((i) => (
                    <motion.div key={i}
                      style={{ width: 7, height: 7, borderRadius: "50%", background: "#818CF8" }}
                      animate={{ y: [-3, 3, -3] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>{thinkingStatus}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Email Draft Confirmation Card ── */}
          <AnimatePresence>
            {pendingEmailDraft && (
              <motion.div
                key="email-draft"
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.22 }}
                style={{
                  margin: "8px 4px 4px",
                  background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))",
                  border: "1.5px solid rgba(99,102,241,0.35)",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                {/* Header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 14px 8px",
                  borderBottom: "1px solid rgba(99,102,241,0.2)",
                  background: "rgba(99,102,241,0.07)",
                }}>
                  <AtSign size={15} style={{ color: "#6366F1", flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#6366F1", flex: 1 }}>Email Draft — Review Before Sending</span>
                  <button
                    onClick={() => setPendingEmailDraft(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--text-muted)", lineHeight: 1 }}
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Meta row */}
                <div style={{ padding: "8px 14px 4px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>To: </span>
                    {pendingEmailDraft.to_name}
                    {pendingEmailDraft.to_email && <span style={{ color: "#6366F1" }}> &lt;{pendingEmailDraft.to_email}&gt;</span>}
                    {pendingEmailDraft.to_company && <span style={{ color: "var(--text-muted)" }}> · {pendingEmailDraft.to_company}</span>}
                  </div>
                </div>
                <div style={{ padding: "2px 14px 8px" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Subject: </span>
                  <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{pendingEmailDraft.subject}</span>
                </div>

                {/* Body preview */}
                <div style={{
                  margin: "0 14px 10px",
                  padding: "10px 12px",
                  background: "var(--bg)",
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: "var(--text)",
                  lineHeight: 1.65,
                  maxHeight: 160,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  border: "1px solid var(--border)",
                }}>
                  {pendingEmailDraft.body}
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, padding: "0 14px 12px", alignItems: "center" }}>
                  <button
                    disabled={emailSending || !pendingEmailDraft.to_email}
                    onClick={async () => {
                      if (!pendingEmailDraft.to_email) {
                        toast.error("No recipient email address. Ask the AI to find the contact's email first.");
                        return;
                      }
                      setEmailSending(true);
                      try {
                        const result = await executeAction("send_email", pendingEmailDraft, () => getAccessToken());
                        toast.success(result.message || "Email sent!");
                        setPendingEmailDraft(null);
                        setMessages(prev => [...prev, {
                          id: `sys-email-${Date.now()}`,
                          role: "system",
                          type: "system",
                          content: `✓ Email sent to **${pendingEmailDraft.to_name}** — Subject: "${pendingEmailDraft.subject}"`,
                          ts: new Date(),
                        }]);
                      } catch (err) {
                        toast.error(err.message || "Failed to send email.");
                      } finally {
                        setEmailSending(false);
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 16px",
                      background: emailSending ? "rgba(99,102,241,0.4)" : "linear-gradient(135deg,#6366F1,#8B5CF6)",
                      color: "#fff", border: "none", borderRadius: 8,
                      fontSize: 12.5, fontWeight: 700, cursor: emailSending ? "not-allowed" : "pointer",
                      opacity: (!pendingEmailDraft.to_email && !emailSending) ? 0.5 : 1,
                    }}
                  >
                    {emailSending ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={13} />}
                    {emailSending ? "Sending…" : "Send Email"}
                  </button>

                  <button
                    onClick={() => setPendingEmailDraft(null)}
                    style={{
                      padding: "7px 14px",
                      background: "transparent",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border)",
                      borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Discard
                  </button>

                  {!pendingEmailDraft.to_email && (
                    <span style={{ fontSize: 11.5, color: "#F59E0B", marginLeft: 4 }}>
                      ⚠ Ask the AI for the contact's email address to enable sending.
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />
        </div>

        {/* ── Input Bar ── */}
        <div style={{ padding: "10px 20px 14px", background: "var(--surface)", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          {/* Voice waveform */}
          <AnimatePresence>
            {isVoiceOn && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 10 }}
              >
                <VoiceBars active={aiState === "listening"} />
                <span style={{ fontSize: 12.5, color: "#EF4444", fontWeight: 600 }}>Listening… speak now</span>
                <VoiceBars active={aiState === "listening"} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input box */}
          <div style={{
            display: "flex", alignItems: "flex-end", gap: 8,
            background: "var(--bg)", borderRadius: 14,
            border: "1.5px solid var(--border)",
            padding: "8px 10px 8px 12px",
            transition: "border-color 0.15s",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
            onFocusCapture={(e) => (e.currentTarget.style.borderColor = "#6366F1")}
            onBlurCapture={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            {/* Mic */}
            <motion.button
              onClick={isVoiceOn && aiState === "listening" ? stopVoice : startVoice}
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
              title={isVoiceOn ? "Stop listening" : "Voice input (Hindi/English/Hinglish)"}
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: isVoiceOn && aiState === "listening" ? "rgba(239,68,68,0.12)" : "var(--surface-2)",
                border: `1px solid ${isVoiceOn && aiState === "listening" ? "rgba(239,68,68,0.4)" : "var(--border)"}`,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                color: isVoiceOn && aiState === "listening" ? "#EF4444" : "var(--text-muted)",
                transition: "all 0.15s",
              }}
            >
              {isVoiceOn && aiState === "listening" ? <MicOff size={15} /> : <Mic size={15} />}
            </motion.button>

            {/* File */}
            <button onClick={() => fileInputRef.current?.click()} title="Upload file (PDF, DOCX, XLSX, CSV)"
              style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#818CF8"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}>
              <Upload size={14} />
            </button>

            {/* Image */}
            <button onClick={() => imageInputRef.current?.click()} title="Upload image (visiting card, whiteboard, screenshot)"
              style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", transition: "all 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#818CF8"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}>
              <Image size={14} />
            </button>

            {/* Textarea */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 130) + "px";
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Ask Sales Assistant in ${selectedLang.label}…`}
              disabled={loading && !messages.some(m => m.streaming)}
              rows={1}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                resize: "none", fontFamily: "inherit", fontSize: 13.5,
                color: "var(--text)", lineHeight: 1.55, maxHeight: 130,
                overflowY: "auto", padding: "6px 2px",
              }}
            />

            {/* Send / Stop */}
            {loading ? (
              <motion.button onClick={stopGeneration} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} title="Stop generation"
                style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(239,68,68,0.1)", border: "1.5px solid rgba(239,68,68,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Square size={14} style={{ color: "#EF4444" }} />
              </motion.button>
            ) : (
              <motion.button onClick={() => sendMessage()} disabled={!input.trim()}
                whileHover={input.trim() ? { scale: 1.06 } : {}}
                whileTap={input.trim() ? { scale: 0.9 } : {}}
                style={{
                  width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                  background: input.trim() ? "linear-gradient(135deg,#6366F1,#8B5CF6)" : "var(--surface-2)",
                  border: `1.5px solid ${input.trim() ? "transparent" : "var(--border)"}`,
                  cursor: input.trim() ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: input.trim() ? "0 4px 14px rgba(99,102,241,0.35)" : "none",
                  transition: "all 0.2s",
                }}>
                <Send size={14} style={{ color: input.trim() ? "#fff" : "var(--text-muted)" }} />
              </motion.button>
            )}
          </div>

          {/* Input footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, padding: "0 2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Sparkles size={9} style={{ color: "var(--text-muted)" }} />
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                Powered by <strong style={{ color: "var(--accent)" }}>Sales Assistant</strong>
                {!isMuted && <span style={{ color: "#10B981" }}> · Voice ON</span>}
                {" · "}Actions require approval
              </span>
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Enter to send · Shift+Enter for new line</span>
          </div>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <AnimatePresence>
        {showRight && (
          <motion.div
            initial={{ x: 290, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 290, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            style={{
              width: 270, flexShrink: 0,
              borderLeft: "1px solid var(--border)",
              background: "var(--surface-2)",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ flex: 1, overflow: "hidden" }}>
              <RightPanel
                mode={currentMode}
                onAskAI={(p) => sendMessage(p)}
                loading={loading}
                savedPrompts={savedPrompts}
                onDeletePrompt={deletePrompt}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.xls,.csv,.pptx" style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />

      {/* Overlay to close lang picker */}
      {showLangPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setShowLangPicker(false)} />
      )}
    </div>
  );
}
