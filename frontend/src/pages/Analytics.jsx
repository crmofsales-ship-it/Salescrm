import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsService } from "../services/analyticsService";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import DSRPanel from "../components/DSRPanel";
import { db as supabase } from "../lib/db";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, FunnelChart, Funnel, LabelList
} from "recharts";
import { format } from "date-fns";
import { TrendingUp, IndianRupee, Users, Target, Award, CheckSquare } from "lucide-react";

const COLORS = ["#1B76D3", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#3B82F6"];

const CustomTooltip = ({ active, payload, label, formatCompact }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0F172A", borderRadius: 8, padding: "8px 12px", color: "white", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color || "#94A3B8" }}>
          {p.name}: {typeof p.value === "number" && (p.name?.toLowerCase().includes("revenue") || p.name?.toLowerCase().includes("value")) ? (formatCompact ? formatCompact(p.value) : p.value.toLocaleString()) : p.value}
        </div>
      ))}
    </div>
  );
};

function SectionCard({ title, children, span = 1 }) {
  return (
    <div className="card" style={{ padding: 20, gridColumn: `span ${span}` }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", margin: "0 0 16px" }}>{title}</h3>
      {children}
    </div>
  );
}

function TargetTracker({ progress }) {
  const goals = [
    { label: "Monthly", key: "month" },
    { label: "Quarterly", key: "quarter" },
    { label: "Yearly", key: "year" },
  ];
  const metrics = [
    { label: "Lead volume", value: progress?.leads, goal: { month: 20, quarter: 60, year: 240 }, color: "#3B82F6" },
    { label: "Qualified meetings", value: progress?.meetings, goal: { month: 6, quarter: 18, year: 72 }, color: "#10B981" },
  ];
  if (!progress) {
    return <div style={{ minHeight: 120, display: "grid", gap: 12 }}><div className="skeleton" style={{ height: 90, borderRadius: 14 }} /></div>;
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {metrics.map((metric) => (
        <div key={metric.label} style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0F172A" }}>{metric.label}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>Targets for month, quarter and year</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: metric.color }}>{metric.value?.month || 0}/{metric.goal.month}</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {goals.map((period) => {
              const current = metric.value?.[period.key] || 0;
              const goal = metric.goal[period.key];
              const percent = Math.min(100, Math.round((current / Math.max(goal, 1)) * 100));
              return (
                <div key={period.key} style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569" }}>
                    <span>{period.label}</span>
                    <span>{current}/{goal}</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: "#E2E8F0" }}>
                    <div style={{ width: `${percent}%`, height: "100%", borderRadius: 999, background: metric.color, transition: "width 0.3s" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const { formatCompact, symbol } = useCurrency();
  const { profile, isFieldUser } = useAuth();
  const qc = useQueryClient();
  const { data: stats } = useQuery({ queryKey: ["dashboard-stats"], queryFn: analyticsService.getDashboardStats });
  const { data: revenueData } = useQuery({ queryKey: ["monthly-revenue", 12], queryFn: () => analyticsService.getMonthlyRevenue(12) });
  const { data: leadsStage } = useQuery({ queryKey: ["leads-by-stage"], queryFn: analyticsService.getLeadsByStage });
  const { data: leadsSource } = useQuery({ queryKey: ["leads-by-source"], queryFn: analyticsService.getLeadsBySource });
  const { data: monthlyLeads } = useQuery({ queryKey: ["monthly-leads", 12], queryFn: () => analyticsService.getMonthlyLeads(12) });
  const { data: dealsByStage } = useQuery({ queryKey: ["deals-by-stage"], queryFn: analyticsService.getDealsByStage });
  const canViewTeamPerf = !isFieldUser;

  // Keep "Revenue Over Time" and "Deals Pipeline" always in sync with the live deals table —
  // both must refresh together on any create/update/delete/stage-change.
  useEffect(() => {
    const ch = supabase
      .channel("analytics-deals-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => {
        qc.invalidateQueries({ queryKey: ["monthly-revenue", 12] });
        qc.invalidateQueries({ queryKey: ["deals-by-stage"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  const { data: teamPerf } = useQuery({ queryKey: ["team-performance"], queryFn: analyticsService.getTeamPerformance, enabled: canViewTeamPerf });
  const { data: targetProgress } = useQuery({ queryKey: ["target-progress"], queryFn: analyticsService.getTargetProgress });

  const fmtRevenue = revenueData?.map((r) => ({
    month: r.month ? format(new Date(r.month + "-01"), "MMM yy") : r.month,
    revenue: r.revenue,
  })) || [];

  const fmtLeads = monthlyLeads?.map((r) => ({
    month: r.month ? format(new Date(r.month + "-01"), "MMM yy") : r.month,
    leads: r.leads,
    won: r.won,
  })) || [];

  const kpis = [
    { label: "Total Revenue", value: formatCompact(stats?.revenue || 0), icon: IndianRupee, color: "#10B981", change: "+12%" },
    { label: "Total Leads", value: stats?.totalLeads || 0, icon: Target, color: "#1B76D3", change: "+8%" },
    { label: "Active Deals", value: stats?.activeDeals || 0, icon: TrendingUp, color: "#F59E0B", change: "+5%" },
    { label: "Conversion Rate", value: `${stats?.conversionRate || 0}%`, icon: Award, color: "#8B5CF6", change: "+2%" },
    { label: "Active Customers", value: stats?.activeCustomers || 0, icon: Users, color: "#3B82F6", change: "+3%" },
    { label: "Pending Tasks", value: stats?.pendingTasks || 0, icon: CheckSquare, color: "#EF4444", change: "" },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1600 }}>
      {/* DSR — My Daily Sales Report */}
      {profile?.id && (
        <DSRPanel userId={profile.id} />
      )}

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className="stat-card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${kpi.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <kpi.icon size={16} style={{ color: kpi.color }} />
              </div>
              {kpi.change && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#10B981", background: "#D1FAE5", padding: "2px 6px", borderRadius: 20 }}>
                  {kpi.change}
                </span>
              )}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 10 }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Revenue Trend */}
        <SectionCard title="Revenue Over Time (12 months)">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={fmtRevenue}>
              <defs>
                <linearGradient id="revGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1B76D3" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1B76D3" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip formatCompact={formatCompact} />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#1B76D3" strokeWidth={2.5} fill="url(#revGrad2)" dot={false} activeDot={{ r: 5, fill: "#1B76D3" }} />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Deals by Stage */}
        <SectionCard title="Deals Pipeline">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(dealsByStage || []).map((stage, i) => (
              <div key={stage.stage}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{stage.stage}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11.5, color: "#94A3B8" }}>{stage.count}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{formatCompact(stage.value || 0)}</span>
                  </div>
                </div>
                <div style={{ height: 5, background: "#F1F5F9", borderRadius: 3 }}>
                  <div style={{ height: "100%", background: COLORS[i % COLORS.length], borderRadius: 3, width: `${Math.min((stage.count / Math.max(...(dealsByStage || []).map((d) => d.count), 1)) * 100, 100)}%`, transition: "width 0.5s" }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Lead Generation */}
        <SectionCard title="Lead Generation Trend">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={fmtLeads}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="leads" name="Leads" fill="#1B76D3" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="won" name="Won" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Leads by Stage */}
        <SectionCard title="Lead Stage Distribution">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={leadsStage?.filter((d) => d.count > 0) || []} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="stage" paddingAngle={3}>
                {(leadsStage || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
              <Legend formatter={(v) => <span style={{ fontSize: 10.5, color: "#64748B" }}>{v}</span>} iconSize={7} />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* Leads by Source */}
        <SectionCard title="Leads by Source">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={leadsSource || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis dataKey="source" type="category" tick={{ fontSize: 10.5, fill: "#475569" }} axisLine={false} tickLine={false} width={72} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Leads" fill="#8B5CF6" radius={[0, 3, 3, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }}>
        <SectionCard title="Target Tracker">
          <TargetTracker progress={targetProgress} />
        </SectionCard>
      </div>

      {/* Team Performance Table — hidden for field users unless granted access */}
      {!canViewTeamPerf ? null : <SectionCard title="Team Performance">
        <div style={{ overflowX: "auto" }}>
          <table className="crm-table">
            <thead>
              <tr>
                <th>TEAM MEMBER</th>
                <th>ROLE</th>
                <th>LEADS</th>
                <th>DEALS</th>
                <th>WON DEALS</th>
                <th>REVENUE CLOSED</th>
                <th>TASKS DONE</th>
                <th>WIN RATE</th>
              </tr>
            </thead>
            <tbody>
              {(teamPerf || []).filter((m) => m.leads > 0 || m.deals > 0).map((member) => (
                <tr key={member.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt={member.name} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EBF4FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#1B76D3" }}>
                          {member.name?.[0]}
                        </div>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{member.name}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "#64748B", textTransform: "capitalize" }}>{member.role?.replace("_", " ")}</td>
                  <td style={{ fontSize: 13, fontWeight: 600 }}>{member.leads}</td>
                  <td style={{ fontSize: 13 }}>{member.deals}</td>
                  <td>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#10B981" }}>{member.wonDeals}</span>
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 600, color: "#10B981" }}>
                    {member.revenue > 0 ? formatCompact(member.revenue) : "—"}
                  </td>
                  <td style={{ fontSize: 12.5 }}>
                    {member.completedTasks}/{member.tasks}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 3, maxWidth: 60 }}>
                        <div style={{ height: "100%", background: "#10B981", borderRadius: 3, width: `${member.deals > 0 ? Math.round((member.wonDeals / member.deals) * 100) : 0}%` }} />
                      </div>
                      <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>
                        {member.deals > 0 ? Math.round((member.wonDeals / member.deals) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {!(teamPerf || []).filter((m) => m.leads > 0 || m.deals > 0).length && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "#94A3B8" }}>No performance data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>}
    </div>
  );
}
