import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { db as supabase } from "../lib/db";
import {
  Search, LayoutDashboard, UserPlus, BriefcaseBusiness, Building2,
  CalendarCheck, CalendarDays, PhoneCall, MessageSquare, BarChart3,
  Users, Brain, Settings2, ArrowRight, Command, X, Zap, TrendingUp,
  Flame, Clock, Globe, Mic, Sparkles, PieChart,
} from "lucide-react";

// ─── Nav items with new icon mapping ─────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Dashboard",    path: "/dashboard",   icon: LayoutDashboard,   category: "Navigate", hint: "Command center" },
  { label: "Leads",        path: "/leads",        icon: UserPlus,          category: "Navigate", hint: "Smart lead management" },
  { label: "Deals",        path: "/deals",        icon: BriefcaseBusiness, category: "Navigate", hint: "Revenue pipeline" },
  { label: "Customers",    path: "/customers",    icon: Building2,         category: "Navigate", hint: "Account workspace" },
  { label: "Tasks",        path: "/tasks",        icon: CalendarCheck,     category: "Navigate", hint: "Productivity center" },
  { label: "Meetings",     path: "/meetings",     icon: CalendarDays,      category: "Navigate", hint: "Schedule & calls" },
  { label: "Activities",   path: "/activities",   icon: PhoneCall,         category: "Navigate", hint: "Activity feed" },
  { label: "Chat",         path: "/chat",         icon: MessageSquare,     category: "Navigate", hint: "Team collaboration" },
  { label: "Reports",      path: "/reports",      icon: BarChart3,         category: "Navigate", hint: "Analytics & insights" },
  { label: "Analytics",    path: "/analytics",    icon: PieChart,          category: "Navigate", hint: "Performance metrics" },
  { label: "Team",         path: "/team",         icon: Users,             category: "Navigate", hint: "Team management" },
  { label: "AI Sidekick",  path: "/ai-assistant", icon: Brain,             category: "Navigate", hint: "AI-powered assistant", highlight: true },
  { label: "Settings",     path: "/settings",     icon: Settings2,         category: "Navigate", hint: "Preferences" },
];

// ─── AI intent patterns (Hinglish + English) ─────────────────────────────────
const AI_INTENTS = [
  { patterns: ["hot lead", "hot leads", "hot", "urgent lead"],         path: "/leads",       icon: Flame,         label: "Show Hot Leads",          badge: "AI" },
  { patterns: ["deal", "pipeline", "revenue", "close"],                path: "/deals",       icon: BriefcaseBusiness, label: "View Deal Pipeline",  badge: "AI" },
  { patterns: ["follow up", "follow-up", "aaj", "today", "reminder"], path: "/tasks",       icon: Clock,         label: "Today's Follow-ups",       badge: "AI" },
  { patterns: ["forecast", "revenue", "sales", "month"],               path: "/reports",     icon: TrendingUp,    label: "Revenue Forecast",         badge: "AI" },
  { patterns: ["team", "performance", "who", "best"],                  path: "/team",        icon: Users,         label: "Team Performance",         badge: "AI" },
  { patterns: ["stale", "risk", "inactive", "old deal"],               path: "/deals",       icon: Zap,           label: "Deals at Risk",             badge: "AI" },
  { patterns: ["pipeline", "summary", "batao", "status"],              path: "/ai-assistant", icon: Brain,        label: "Pipeline Summary via AI",   badge: "AI", highlight: true },
  { patterns: ["crm", "ai", "assistant", "help", "sidekick"],          path: "/ai-assistant", icon: Sparkles,     label: "Open AI Sidekick",          badge: "AI", highlight: true },
];

// ─── Example queries shown in empty state ────────────────────────────────────
const EXAMPLES = [
  { text: "Pipeline summary batao",        icon: "🇮🇳", path: "/ai-assistant" },
  { text: "Show hot leads from Mumbai",    icon: "🔥", path: "/leads" },
  { text: "Deals closing this week",       icon: "📊", path: "/deals" },
  { text: "Revenue kitna increase hua?",   icon: "🇮🇳", path: "/ai-assistant" },
  { text: "Tasks overdue",                 icon: "⏰", path: "/tasks" },
  { text: "Open AI Sidekick",              icon: "🤖", path: "/ai-assistant" },
];

function useDebounce(value, delay) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

export default function CommandPalette({ open, onClose }) {
  const navigate    = useNavigate();
  const inputRef    = useRef();
  const listRef     = useRef();
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const debouncedQuery            = useDebounce(query, 180);

  useEffect(() => {
    if (open) {
      setQuery(""); setResults([]); setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // AI intent detector
  function detectIntent(q) {
    const lower = q.toLowerCase();
    return AI_INTENTS.filter((intent) => intent.patterns.some((p) => lower.includes(p)));
  }

  useEffect(() => {
    if (!open) return;
    const q = debouncedQuery.trim();

    if (!q) {
      setResults(NAV_ITEMS.slice(0, 8).map((n) => ({ ...n, type: "nav" })));
      return;
    }

    const lower = q.toLowerCase();
    const navMatches   = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(lower) || (n.hint || "").toLowerCase().includes(lower)).map((n) => ({ ...n, type: "nav" }));
    const intentMatches = detectIntent(q).map((i) => ({ ...i, type: "intent", category: "AI Actions" }));

    setResults([...intentMatches, ...navMatches]);
    setActiveIdx(0);
    setLoading(true);

    Promise.all([
      supabase.from("leads").select("id, company_name, contact_name, stage, temperature")
        .or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%`).limit(5),
      supabase.from("deals").select("id, company_name, title, stage, value")
        .or(`company_name.ilike.%${q}%,title.ilike.%${q}%`).limit(5),
      supabase.from("customers").select("id, company_name, status")
        .ilike("company_name", `%${q}%`).limit(4),
    ]).then(([lr, dr, cr]) => {
      setResults([
        ...intentMatches,
        ...navMatches,
        ...(lr.data || []).map((l) => ({
          type: "lead", category: "Leads",
          label: l.company_name || "Lead", sub: l.contact_name,
          badge: l.temperature, path: "/leads",
          icon: UserPlus, id: l.id,
          badgeColor: l.temperature === "hot" ? "#EF4444" : l.temperature === "warm" ? "#F97316" : "#3B82F6",
        })),
        ...(dr.data || []).map((d) => ({
          type: "deal", category: "Deals",
          label: d.company_name || d.title || "Deal", sub: d.stage,
          badge: d.value ? `₹${(Number(d.value)/1000).toFixed(0)}K` : null,
          path: "/deals", icon: BriefcaseBusiness, id: d.id,
        })),
        ...(cr.data || []).map((c) => ({
          type: "customer", category: "Customers",
          label: c.company_name || "Customer", sub: c.status || "account",
          path: "/customers", icon: Building2, id: c.id,
        })),
      ]);
      setActiveIdx(0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [debouncedQuery, open]);

  const handleSelect = useCallback((item) => {
    navigate(item.path);
    onClose();
  }, [navigate, onClose]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "ArrowDown")  { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && results[activeIdx]) { e.preventDefault(); handleSelect(results[activeIdx]); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, results, activeIdx, handleSelect, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelectorAll("[data-cmd-item]")[activeIdx];
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const grouped = results.reduce((acc, item) => {
    const cat = item.category || "Navigate";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  let globalIdx = 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: "12vh",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -18 }}
            transition={{ type: "spring", damping: 28, stiffness: 400 }}
            style={{
              width: "100%", maxWidth: 600,
              background: "var(--surface)",
              border: "1px solid var(--border-2)",
              borderRadius: 18,
              boxShadow: "0 40px 100px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.1), 0 0 40px rgba(99,102,241,0.06)",
              overflow: "hidden",
            }}
          >
            {/* AI banner */}
            <div className="cmd-ai-banner">
              <Brain size={12} style={{ color: "#A78BFA" }} />
              <span style={{ color: "#A78BFA", fontWeight: 600, fontSize: 11 }}>AI-Powered Search</span>
              <span style={{ marginLeft: 6 }}>· Supports English, Hindi & Hinglish</span>
              <Globe size={10} style={{ marginLeft: 4 }} />
            </div>

            {/* Input */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
              <Search size={17} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                placeholder='Search or type command... e.g. "Pipeline summary batao" or "Hot leads"'
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14.5, color: "var(--text)", fontFamily: "inherit" }}
              />
              {loading && (
                <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "#A78BFA", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              )}
              {query && (
                <button onClick={() => { setQuery(""); setActiveIdx(0); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", padding: 2 }}>
                  <X size={14} />
                </button>
              )}
              <kbd style={{ fontSize: 10.5, color: "var(--text-muted)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px", fontFamily: "monospace", flexShrink: 0 }}>Esc</kbd>
            </div>

            {/* Empty state with examples */}
            {!query && (
              <div style={{ padding: "10px 16px 6px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 8 }}>Quick Examples</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex.text}
                      onClick={() => setQuery(ex.text)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "4px 10px", borderRadius: 7, cursor: "pointer",
                        background: "var(--surface-2)", border: "1px solid var(--border)",
                        fontSize: 11.5, color: "var(--text-2)", fontFamily: "inherit",
                        transition: "all 0.12s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)"; }}
                    >
                      <span>{ex.icon}</span>{ex.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            <div ref={listRef} style={{ maxHeight: 380, overflowY: "auto" }} className="custom-scroll">
              {results.length === 0 && !loading && query ? (
                <div className="empty-state-ai" style={{ padding: "28px 16px" }}>
                  <div className="ai-orb" style={{ width: 44, height: 44, marginBottom: 10 }}>
                    <Brain size={20} style={{ color: "#A78BFA" }} />
                  </div>
                  <p style={{ fontSize: 13, marginBottom: 10 }}>No results for <strong>"{query}"</strong></p>
                  <button
                    className="ai-suggestion"
                    onClick={() => { navigate("/ai-assistant"); onClose(); }}
                  >
                    <Sparkles size={12} /> Ask AI Sidekick about this
                  </button>
                </div>
              ) : (
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category}>
                    <div className="cmd-category-label">{category}</div>
                    {items.map((item) => {
                      const idx     = globalIdx++;
                      const isActive = idx === activeIdx;
                      const Icon    = item.icon;
                      return (
                        <div
                          key={item.id || item.path + item.label}
                          data-cmd-item
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`cmd-result-item${isActive ? " active" : ""}`}
                          style={{
                            background: isActive
                              ? item.highlight ? "rgba(99,102,241,0.15)" : "var(--surface-2)"
                              : "transparent",
                          }}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: item.highlight
                              ? (isActive ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.12)")
                              : (isActive ? "var(--accent-light)" : "var(--surface-2)"),
                            border: `1px solid ${item.highlight ? "rgba(99,102,241,0.25)" : "var(--border)"}`,
                            transition: "all 0.1s",
                          }}>
                            <Icon size={15} strokeWidth={1.8} style={{ color: isActive ? (item.highlight ? "#A78BFA" : "var(--accent)") : (item.highlight ? "#A78BFA" : "var(--text-muted)") }} />
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="truncate-1" style={{ fontSize: 13.5, fontWeight: 500, color: isActive ? (item.highlight ? "#C4B5FD" : "var(--text)") : (item.highlight ? "#A78BFA" : "var(--text)") }}>
                              {item.label}
                            </div>
                            {(item.sub || item.hint) && (
                              <div className="truncate-1 cmd-result-meta" style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                                {item.sub || item.hint}
                              </div>
                            )}
                          </div>

                          {item.badge && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                              background: item.badge === "AI"
                                ? "rgba(99,102,241,0.15)"
                                : item.badgeColor ? `${item.badgeColor}18` : "var(--surface-2)",
                              color: item.badge === "AI" ? "#A78BFA" : (item.badgeColor || "var(--text-muted)"),
                              border: `1px solid ${item.badge === "AI" ? "rgba(99,102,241,0.2)" : "var(--border)"}`,
                              textTransform: "capitalize", flexShrink: 0,
                            }}>
                              {item.badge}
                            </span>
                          )}

                          <ArrowRight size={12} style={{ color: isActive ? (item.highlight ? "#A78BFA" : "var(--accent)") : "transparent", flexShrink: 0, transition: "color 0.1s" }} />
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: "var(--text-muted)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <kbd style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>↑↓</kbd>
                navigate
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <kbd style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>↵</kbd>
                open
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Command size={9} />
                <kbd style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>K</kbd>
                toggle
              </span>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                <Brain size={10} style={{ color: "#A78BFA" }} /> AI-powered
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
