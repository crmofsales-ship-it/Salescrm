import { useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { db as supabase } from "../lib/db";
import {
  Phone, Video, RefreshCw, Mail, FileText, CheckCircle2,
  Briefcase, TrendingUp, ExternalLink, Zap, Calendar, Users,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

const CORE_TYPES = {
  follow_up_call:  { label: "FU Call",   icon: RefreshCw, color: "#F59E0B" },
  follow_up_email: { label: "FU Email",  icon: RefreshCw, color: "#06B6D4" },
  call:            { label: "Call",      icon: Phone,     color: "#3B82F6" },
  email:           { label: "Email",     icon: Mail,      color: "#EC4899" },
  note:            { label: "Note",      icon: FileText,  color: "#10B981" },
  meeting_person:  { label: "In-Person", icon: Users,     color: "#8B5CF6" },
  meeting_virtual: { label: "Virtual",   icon: Video,     color: "#6366F1" },
};

function resolveType(t) {
  if (!t) return "note";
  const s = t.toLowerCase().replace(/[-\s]/g, "_");
  if (s === "follow_up_call" || s === "follow_up") return "follow_up_call";
  if (s === "follow_up_email") return "follow_up_email";
  if (s === "meeting_person" || s === "in_person" || s === "visit") return "meeting_person";
  if (s === "meeting_virtual" || s === "virtual_meeting" || s === "meeting") return "meeting_virtual";
  if (["call","phone_call","cold_call","demo","introductory","verification","other"].includes(s)) return "call";
  if (s === "email") return "email";
  return "note";
}

function calcScore({ actCount, tasksCompleted, dealsUpdated }) {
  let s = Math.min(actCount * 8, 50);
  s += Math.min(tasksCompleted * 7, 25);
  s += Math.min(dealsUpdated * 10, 25);
  return Math.min(100, Math.round(s));
}

export default function DSRPanel({ userId }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd   = endOfDay(new Date()).toISOString();

  // Today's activities — filter by created_by OR user_id (legacy)
  const { data: todayActs = [] } = useQuery({
    queryKey: ["dsr-today-acts", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("activities")
        .select("id, type, created_at, status")
        .or(`created_by.eq.${userId},user_id.eq.${userId}`)
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd)
        .neq("type", "email_contact");
      return data || [];
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  // Tasks completed today
  const { data: tasksCompleted = 0 } = useQuery({
    queryKey: ["dsr-tasks-done", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", userId)
        .eq("status", "done")
        .gte("updated_at", todayStart);
      return count || 0;
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  // Activities marked done today (from activities table)
  const { data: actsDoneToday = 0 } = useQuery({
    queryKey: ["dsr-acts-done", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .or(`created_by.eq.${userId},user_id.eq.${userId}`)
        .eq("status", "done")
        .gte("updated_at", todayStart);
      return count || 0;
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  // Deals/leads moved today (change_history)
  const { data: dealsUpdated = 0 } = useQuery({
    queryKey: ["dsr-deals-moved", userId],
    queryFn: async () => {
      const { count } = await supabase
        .from("change_history")
        .select("id", { count: "exact", head: true })
        .eq("changed_by", userId)
        .eq("field_name", "stage")
        .gte("created_at", todayStart);
      return count || 0;
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  // Weekly trend (last 7 days)
  const { data: weeklyActs = [] } = useQuery({
    queryKey: ["dsr-weekly", userId],
    queryFn: async () => {
      const from = subDays(new Date(), 6).toISOString();
      const { data } = await supabase
        .from("activities")
        .select("created_at")
        .or(`created_by.eq.${userId},user_id.eq.${userId}`)
        .gte("created_at", from)
        .neq("type", "email_contact");
      return data || [];
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  // Real-time: invalidate all DSR queries when activities change
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`dsr-realtime-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, () => {
        qc.invalidateQueries({ queryKey: ["dsr-today-acts", userId] });
        qc.invalidateQueries({ queryKey: ["dsr-weekly", userId] });
        qc.invalidateQueries({ queryKey: ["dsr-acts-done", userId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["dsr-tasks-done", userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  const typeCounts = useMemo(() => {
    const map = {};
    todayActs.forEach((a) => { const k = resolveType(a.type); map[k] = (map[k] || 0) + 1; });
    return map;
  }, [todayActs]);

  const totalActs   = todayActs.length;
  const totalDone   = tasksCompleted + actsDoneToday;
  const score       = calcScore({ actCount: totalActs, tasksCompleted: totalDone, dealsUpdated });
  const scoreColor  = score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444";
  const scoreLabel  = score >= 70 ? "Great day!" : score >= 40 ? "On track" : "Just starting";

  // Weekly chart
  const chartData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d      = subDays(new Date(), 6 - i);
      const dayStr = d.toISOString().slice(0, 10);
      const count  = weeklyActs.filter((a) => a.created_at?.slice(0, 10) === dayStr).length;
      return { day: format(d, "EEE"), count, isToday: i === 6 };
    });
  }, [weeklyActs]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4,0,0.2,1] }}
      className="card"
      style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}
    >
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "linear-gradient(90deg, rgba(99,102,241,0.06) 0%, transparent 60%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(99,102,241,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Zap size={15} style={{ color: "#6366F1" }} strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.015em" }}>
              DSR — {format(new Date(), "EEEE, MMM d")}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>Daily Sales Report & Analytics</div>
          </div>
        </div>
        <button
          onClick={() => navigate("/dsr")}
          className="btn-secondary"
          style={{ height: 30, fontSize: 11.5, display: "flex", alignItems: "center", gap: 5 }}
        >
          View Full DSR <ExternalLink size={11} />
        </button>
      </div>

      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

          {/* Left: Productivity Score */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "12px 10px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ position: "relative", width: 72, height: 72 }}>
              <svg width={72} height={72} style={{ position: "absolute", inset: 0 }}>
                <circle cx={36} cy={36} r={30} fill="none" stroke="var(--border)" strokeWidth={5} />
                <circle
                  cx={36} cy={36} r={30}
                  fill="none" stroke={scoreColor} strokeWidth={5}
                  strokeDasharray={`${(score / 100) * 188.5} 188.5`}
                  strokeLinecap="round"
                  transform="rotate(-90 36 36)"
                  style={{ transition: "stroke-dasharray 1s ease", filter: `drop-shadow(0 0 6px ${scoreColor}70)` }}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: scoreColor, lineHeight: 1, letterSpacing: "-0.04em" }}>{score}</span>
                <span style={{ fontSize: 8, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>/ 100</span>
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: scoreColor }}>{scoreLabel}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>Productivity score</div>
            </div>
          </div>

          {/* Middle: Activity breakdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Today's Activities</div>
            {Object.entries(CORE_TYPES).map(([key, cfg]) => {
              const count = typeCounts[key] || 0;
              const Icon  = cfg.icon;
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: `${cfg.color}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={11} style={{ color: cfg.color }} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, height: 5, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: count ? `${Math.min(100, count * 20)}%` : "0%", background: cfg.color, borderRadius: 99, transition: "width 0.7s ease" }} />
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: count ? "var(--text)" : "var(--text-muted)", minWidth: 16, textAlign: "right" }}>{count}</span>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)", minWidth: 60 }}>{cfg.label}</span>
                </div>
              );
            })}
            <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--border)", display: "flex", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle2 size={12} style={{ color: "#10B981" }} />
                <span style={{ fontSize: 11, color: "var(--text-2)" }}><b style={{ color: "var(--text)" }}>{totalDone}</b> tasks done</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Briefcase size={12} style={{ color: "#8B5CF6" }} />
                <span style={{ fontSize: 11, color: "var(--text-2)" }}><b style={{ color: "var(--text)" }}>{dealsUpdated}</b> deals moved</span>
              </div>
            </div>
          </div>

          {/* Right: Weekly trend */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>7-Day Trend</div>
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={chartData} barCategoryGap="22%" margin={{ top: 4, right: 0, left: -32, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  content={({ active, payload }) => active && payload?.length ? (
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 11 }}>
                      <span style={{ fontWeight: 700 }}>{payload[0].payload.day}:</span> {payload[0].value} activities
                    </div>
                  ) : null}
                />
                <Bar dataKey="count" radius={[3,3,0,0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.isToday ? "#6366F1" : "var(--border)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <TrendingUp size={11} style={{ color: "#10B981" }} />
                <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                  Total: <b style={{ color: "var(--text)" }}>{totalActs}</b> today
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Calendar size={11} style={{ color: "#6366F1" }} />
                <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                  Week: <b style={{ color: "var(--text)" }}>{weeklyActs.length}</b>
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </motion.div>
  );
}
