import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { db as supabase } from "../lib/db";
import { Activity, X, Zap, Users, TrendingUp, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

function useSystemActivity() {
  return useQuery({
    queryKey: ["system-pulse"],
    queryFn: async () => {
      const now = new Date();
      const oneDayAgo = new Date(now - 86400000).toISOString();
      const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
      const threeDaysAgo = new Date(now - 3 * 86400000).toISOString();

      const [newLeads, staleDeals, overdueTasks, recentWins] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", oneDayAgo),
        supabase.from("deals").select("id", { count: "exact", head: true })
          .lt("updated_at", sevenDaysAgo).not("stage", "in", '("won","lost")'),
        supabase.from("tasks").select("id", { count: "exact", head: true })
          .lt("due_date", now.toISOString().split("T")[0]).not("status", "in", '("done","cancelled")'),
        supabase.from("deals").select("id", { count: "exact", head: true })
          .eq("stage", "won").gte("closed_at", threeDaysAgo),
      ]);

      return {
        newLeads:    newLeads.count    || 0,
        staleDeals:  staleDeals.count  || 0,
        overdueTasks: overdueTasks.count || 0,
        recentWins:  recentWins.count  || 0,
      };
    },
    refetchInterval: 120000,
    staleTime: 60000,
  });
}

export default function SystemPulse() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef();
  const { data: activity = {} } = useSystemActivity();

  const { newLeads = 0, staleDeals = 0, overdueTasks = 0, recentWins = 0 } = activity;
  const alertCount = staleDeals + overdueTasks;
  const isHealthy  = alertCount === 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const items = [
    {
      icon: Users,
      label: "New leads today",
      value: newLeads,
      color: "#6366F1",
      status: newLeads > 0 ? "active" : "idle",
    },
    {
      icon: TrendingUp,
      label: "Recent wins",
      value: recentWins,
      color: "#10B981",
      status: recentWins > 0 ? "active" : "idle",
    },
    {
      icon: AlertTriangle,
      label: "Stale deals",
      value: staleDeals,
      color: staleDeals > 0 ? "#F59E0B" : "#6B7280",
      status: staleDeals > 0 ? "warn" : "idle",
    },
    {
      icon: Clock,
      label: "Overdue tasks",
      value: overdueTasks,
      color: overdueTasks > 0 ? "#EF4444" : "#6B7280",
      status: overdueTasks > 0 ? "error" : "idle",
    },
  ];

  return (
    <div className="system-pulse" ref={panelRef}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.94 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 12px)",
              right: 0,
              width: 280,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(99,102,241,0.12)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(99,102,241,0.06)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Zap size={14} style={{ color: "#6366F1" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>System Pulse</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                  background: isHealthy ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                  color: isHealthy ? "#10B981" : "#F59E0B",
                }}>
                  {isHealthy ? "Healthy" : `${alertCount} alerts`}
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Activity items */}
            <div style={{ padding: "8px 0" }}>
              {items.map(({ icon: Icon, label, value, color, status }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 16px",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: `${color}18`,
                  }}>
                    <Icon size={14} style={{ color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 500 }}>{label}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 800, color,
                      minWidth: 20, textAlign: "right",
                    }}>{value}</span>
                    {status === "active" && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }} />
                    )}
                    {status === "warn" && value > 0 && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B", boxShadow: "0 0 6px #F59E0B" }} />
                    )}
                    {status === "error" && value > 0 && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444", boxShadow: "0 0 6px #EF4444" }} />
                    )}
                    {status === "idle" && (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--border)" }} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{
              padding: "8px 16px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(0,0,0,0.04)",
            }}>
              <CheckCircle2 size={10} style={{ color: "#10B981" }} />
              <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Auto-refreshes every 2 min</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orb trigger button */}
      <motion.button
        className="pulse-orb"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.9 }}
        title="System Pulse"
        style={{
          position: "relative",
          background: open ? "rgba(99,102,241,0.25)" : undefined,
        }}
      >
        <Activity size={18} strokeWidth={2} />
        {alertCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: "absolute",
              top: -4, right: -4,
              width: 16, height: 16,
              borderRadius: "50%",
              background: "#EF4444",
              fontSize: 9, fontWeight: 800, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid var(--bg)",
            }}
          >
            {alertCount > 9 ? "9+" : alertCount}
          </motion.span>
        )}
      </motion.button>
    </div>
  );
}
