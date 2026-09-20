import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { Navigate } from "react-router-dom";
import { db as supabase } from "../lib/db";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
  ComposedChart, Line,
} from "recharts";
import { format, subDays, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import {
  TrendingUp, TrendingDown, IndianRupee, Briefcase,
  Flame, Users, Target, Printer, Filter, Calendar,
  SlidersHorizontal, BarChart2, Layers, Network,
  Thermometer, Activity, LineChart, Award, UserMinus,
  FolderOpen, BarChart3, GitMerge, Users2,
  // freshly-needed unique icons
  Database, BadgeCheck, ArrowDownRight, ListTodo,
  Share2, Megaphone, UsersRound,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const SAP_SERVICES = [
  "SAP Implementation", "SAP Migration ECC→S/4HANA", "SAP Version Upgrade",
  "SAP Resource Augmentation", "Other Project Services",
];

const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };

const STAGE_COLORS = {
  new: "#6B7280", contacted: "#3B82F6", qualified: "#8B5CF6",
  proposal: "#F59E0B", won: "#10B981", lost: "#EF4444",
};
const SOURCE_COLORS = ["#1B76D3", "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4"];
const LEAD_SOURCES = ["Website", "Facebook", "Instagram", "LinkedIn", "Referral", "Cold Call", "Event", "Other"];
const LEAD_STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"];

const DATE_PRESETS = [
  { label: "Last 30 days",  days: 30 },
  { label: "Last 90 days",  days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last 12 months",days: 365 },
  { label: "All time",      days: 0 },
];

// ─── Raw data fetch ───────────────────────────────────────────────────────────
async function fetchAll() {
  const [leadsRes, dealsRes, profilesRes, activitiesRes] = await Promise.all([
    supabase.from("leads").select("id, stage, source, temperature, priority, created_at, assigned_to, budget, other_notes"),
    supabase.from("deals").select("id, stage, value, created_at, assigned_to, closed_at"),
    supabase.from("profiles").select("id, full_name, role, status").eq("status", "active"),
    supabase.from("activities").select("id, type, user_id, created_at, metadata"),
  ]);
  return {
    leads: leadsRes.data || [],
    deals: dealsRes.data || [],
    profiles: profilesRes.data || [],
    activities: activitiesRes.data || [],
  };
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function CrmTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface)", borderRadius: 8, padding: "8px 12px", border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,0.12)", fontSize: 12 }}>
      {label && <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color || "var(--text-2)", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color, change, variant }) {
  return (
    <div className={`card-metric${variant ? ` ${variant}` : ""}`} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={19} style={{ color }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", lineHeight: 1.1 }}>{value}</div>
          {change && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.12)", padding: "2px 7px", borderRadius: 20 }}>{change}</span>
          )}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-2)", marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function ChartCard({ title, children, style, icon: Icon, iconColor }) {
  return (
    <div className="card-glass" style={{ padding: "18px 20px", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
        {Icon && <Icon size={14} style={{ color: iconColor || "var(--accent)" }} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reports() {
  const { isSalesHead } = useAuth();
  const { formatCompact, symbol } = useCurrency();
  if (!isSalesHead) return <Navigate to="/dashboard" replace />;

  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterService, setFilterService] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterDays, setFilterDays] = useState(180);
  const [showFilters, setShowFilters] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePdf = () => {
    setPdfLoading(true);
    const prevTitle = document.title;
    const dateStr   = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }).replace(/ /g, "-");
    document.title  = `SalesCRM-Report-${dateStr}`;
    setTimeout(() => {
      try {
        window.print();
      } catch {
        // print dialog closed or failed — silently ignore
      } finally {
        document.title = prevTitle;
        setPdfLoading(false);
      }
    }, 120);
  };

  const { data: raw, isLoading } = useQuery({
    queryKey: ["reports-raw"],
    queryFn: fetchAll,
    staleTime: 1000 * 60 * 5,
  });

  // Apply filters
  const filtered = useMemo(() => {
    if (!raw) return { leads: [], deals: [], activities: [] };
    const since = filterDays > 0 ? subDays(new Date(), filterDays) : new Date("2000-01-01");

    let leads = raw.leads.filter((l) => new Date(l.created_at) >= since);
    let deals = raw.deals.filter((d) => new Date(d.created_at) >= since);
    let activities = raw.activities.filter((a) => new Date(a.created_at) >= since);

    if (filterEmployee) {
      leads = leads.filter((l) => l.assigned_to === filterEmployee);
      deals = deals.filter((d) => d.assigned_to === filterEmployee);
      activities = activities.filter((a) => a.user_id === filterEmployee);
    }
    if (filterSource) leads = leads.filter((l) => l.source === filterSource);
    if (filterStage) leads = leads.filter((l) => l.stage === filterStage);
    if (filterService) {
      leads = leads.filter((l) => {
        const svcs = parseJSON(l.other_notes).services || [];
        return filterService === "Cumulative"
          ? svcs.length > 1
          : svcs.includes(filterService);
      });
      activities = activities.filter((a) => {
        const svc = a.metadata?.service;
        return filterService === "Cumulative" ? svc === "Cumulative" : svc === filterService;
      });
    }
    if (filterCountry) leads = leads.filter((l) => parseJSON(l.other_notes).country === filterCountry);

    return { leads, deals, activities };
  }, [raw, filterEmployee, filterSource, filterStage, filterService, filterCountry, filterDays]);

  const computed = useMemo(() => {
    const { leads, deals, activities } = filtered;
    const profiles = raw?.profiles || [];

    // KPIs
    const totalLeads = leads.length;
    const wonLeads = leads.filter((l) => l.stage === "won").length;
    const lostLeads = leads.filter((l) => l.stage === "lost").length;
    const convRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : 0;
    const hotLeads = leads.filter((l) => l.temperature === "hot").length;
    const totalRevenue = leads.filter((l) => l.stage === "won").reduce((s, l) => s + (Number(l.budget) || 0), 0);
    const openDeals = deals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage)).length;

    // Monthly trend (6 months)
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i);
      return { label: format(d, "MMM"), start: startOfMonth(d).toISOString(), end: endOfMonth(d).toISOString() };
    });
    const monthlyLeads = months.map((m) => ({
      month: m.label,
      total: leads.filter((l) => l.created_at >= m.start && l.created_at <= m.end).length,
      won: leads.filter((l) => l.created_at >= m.start && l.created_at <= m.end && l.stage === "won").length,
    }));

    // Stage funnel
    const stageCount = Object.fromEntries(LEAD_STAGES.map((s) => [s, 0]));
    leads.forEach((l) => { if (stageCount[l.stage] !== undefined) stageCount[l.stage]++; });
    const stageFunnel = Object.entries(stageCount).map(([stage, value]) => ({
      name: stage.charAt(0).toUpperCase() + stage.slice(1), value, fill: STAGE_COLORS[stage],
    }));

    // Source breakdown
    const sourceMap = {};
    leads.forEach((l) => { const s = l.source || "Other"; sourceMap[s] = (sourceMap[s] || 0) + 1; });
    const sourceData = Object.entries(sourceMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Temperature breakdown
    const tempMap = { hot: 0, warm: 0, cold: 0 };
    leads.forEach((l) => { if (tempMap[l.temperature] !== undefined) tempMap[l.temperature]++; });
    const tempData = [
      { name: "Hot 🔥", value: tempMap.hot, fill: "#EF4444" },
      { name: "Warm 🌡️", value: tempMap.warm, fill: "#F59E0B" },
      { name: "Cold ❄️", value: tempMap.cold, fill: "#3B82F6" },
    ].filter((t) => t.value > 0);

    // Activity breakdown
    const actMap = {};
    activities.forEach((a) => { actMap[a.type] = (actMap[a.type] || 0) + 1; });
    const actData = Object.entries(actMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    // Team performance
    const teamPerf = profiles.map((p) => {
      const myLeads = leads.filter((l) => l.assigned_to === p.id);
      const myDeals = deals.filter((d) => d.assigned_to === p.id);
      const myActivities = activities.filter((a) => a.user_id === p.id);
      const wonLeadsCount = myLeads.filter((l) => l.stage === "won").length;
      const revenue = myLeads.filter((l) => l.stage === "won").reduce((s, l) => s + (Number(l.budget) || 0), 0);
      return {
        name: p.full_name, id: p.id, role: p.role?.replace(/_/g, " "),
        leads: myLeads.length,
        contacted: myLeads.filter((l) => l.stage !== "new").length,
        won: wonLeadsCount,
        activities: myActivities.length,
        revenue,
        convRate: myLeads.length > 0 ? Math.round((wonLeadsCount / myLeads.length) * 100) : 0,
      };
    }).filter((p) => p.leads + p.activities > 0).sort((a, b) => b.won - a.won);

    // Revenue forecast (extrapolate last 3 months trend)
    const last3 = monthlyLeads.slice(-3);
    const avgWonPerMonth = last3.length ? last3.reduce((a, m) => a + m.won, 0) / last3.length : 0;
    const forecastLeads = Math.round(avgWonPerMonth * 1.1);

    // Monthly deal revenue (won deals grouped by close month)
    const monthlyDealRevenue = months.map((m) => {
      const wonRev = deals
        .filter((d) => d.stage === "won" && d.closed_at && d.closed_at >= m.start && d.closed_at <= m.end)
        .reduce((s, d) => s + (Number(d.value) || 0), 0);
      return { month: m.label, actual: +(wonRev / 100000).toFixed(1) };
    });
    // Append 3-month forecast based on last 3 months average deal revenue
    const avgMonthlyRev = (() => {
      const recent = monthlyDealRevenue.filter((m) => m.actual > 0).slice(-3);
      return recent.length ? recent.reduce((s, m) => s + m.actual, 0) / recent.length : 0;
    })();
    const forecastData = [
      ...monthlyDealRevenue,
      { month: "Fcast+1", forecast: +(avgMonthlyRev * 1.05).toFixed(1) },
      { month: "Fcast+2", forecast: +(avgMonthlyRev * 1.10).toFixed(1) },
      { month: "Fcast+3", forecast: +(avgMonthlyRev * 1.15).toFixed(1) },
    ];

    // Funnel conversion rates (stage-to-stage)
    const stageOrder = ["new","contacted","qualified","proposal","won"];
    const funnelConversions = stageOrder.slice(0, -1).map((s, i) => {
      const fromCount = leads.filter((l) => LEAD_STAGES.indexOf(l.stage) >= LEAD_STAGES.indexOf(s)).length;
      const toStage = stageOrder[i + 1];
      const toCount = leads.filter((l) => LEAD_STAGES.indexOf(l.stage) >= LEAD_STAGES.indexOf(toStage)).length;
      const rate = fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0;
      return {
        from: s.charAt(0).toUpperCase() + s.slice(1),
        to: toStage.charAt(0).toUpperCase() + toStage.slice(1),
        rate, fromCount, toCount,
        color: STAGE_COLORS[toStage] || "#6B7280",
      };
    });

    // Best source
    const bestSource = sourceData[0] || null;

    // Top performer
    const topPerformer = teamPerf[0] || null;

    // AI insights
    const aiInsights = [];
    if (hotLeads > 0) aiInsights.push(`${hotLeads} hot lead${hotLeads > 1 ? "s" : ""} need immediate attention.`);
    if (bestSource) aiInsights.push(`${bestSource.name} is your #1 lead source with ${bestSource.value} leads.`);
    if (topPerformer) aiInsights.push(`${topPerformer.name} leads the team with ${topPerformer.won} won deals.`);
    if (avgWonPerMonth > 0) aiInsights.push(`Forecast: ~${forecastLeads} won leads next month based on current trend.`);

    return { totalLeads, wonLeads, lostLeads, convRate, hotLeads, totalRevenue, openDeals, monthlyLeads, stageFunnel, sourceData, tempData, actData, teamPerf, forecastLeads, forecastData, funnelConversions, aiInsights };
  }, [filtered, raw]);

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Building analytics...</span>
    </div>
  );

  const activeFilters = [filterEmployee, filterSource, filterStage, filterService, filterCountry].filter(Boolean).length;
  const uniqueCountries = [...new Set((raw?.leads || []).map((l) => parseJSON(l.other_notes).country).filter(Boolean))].sort();
  const dateLabel = DATE_PRESETS.find((d) => d.days === filterDays)?.label || "Custom";

  return (
    <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <BarChart3 size={20} style={{ color: "var(--accent)" }} />
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--text)" }}>Reports & Analytics</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>
            {dateLabel} · {computed.totalLeads} leads · {computed.teamPerf.length} team members
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Date preset chips */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => setFilterDays(p.days)}
                style={{
                  padding: "4px 11px", borderRadius: 20, border: `1.5px solid ${filterDays === p.days ? "var(--accent)" : "var(--border)"}`,
                  background: filterDays === p.days ? "var(--accent-light)" : "transparent",
                  color: filterDays === p.days ? "var(--accent)" : "var(--text-muted)",
                  fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            className={`btn-secondary no-print${showFilters ? " active" : ""}`}
            onClick={() => setShowFilters((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 7, position: "relative" }}
          >
            <SlidersHorizontal size={14} /> Filters
            {activeFilters > 0 && (
              <span style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "var(--accent)", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{activeFilters}</span>
            )}
          </button>
          <button
            className="btn-secondary no-print"
            onClick={handlePdf}
            disabled={pdfLoading}
            title="Download as PDF — use 'Save as PDF' in the print dialog"
            style={{ display: "flex", alignItems: "center", gap: 7, opacity: pdfLoading ? 0.6 : 1, cursor: pdfLoading ? "not-allowed" : "pointer" }}
          >
            {pdfLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Printer size={14} />}
            {pdfLoading ? "Preparing…" : "Save PDF"}
          </button>
        </div>
      </div>

      {/* ── Filters Panel ── */}
      {showFilters && (
        <div style={{ marginBottom: 20, padding: "16px 20px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--surface-2)", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }} className="no-print">
          {/* Date range */}
          <div>
            <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 5 }}><Calendar size={11} /> Date Range</label>
            <select className="crm-input" value={filterDays} onChange={(e) => setFilterDays(Number(e.target.value))} style={{ height: 36, width: "auto" }}>
              {DATE_PRESETS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
            </select>
          </div>
          {/* Employee */}
          <div>
            <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 5 }}><Users size={11} /> Employee</label>
            <select className="crm-input" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} style={{ height: 36, width: "auto" }}>
              <option value="">All employees</option>
              {(raw?.profiles || []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          {/* Source */}
          <div>
            <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 5 }}><Filter size={11} /> Source</label>
            <select className="crm-input" value={filterSource} onChange={(e) => setFilterSource(e.target.value)} style={{ height: 36, width: "auto" }}>
              <option value="">All sources</option>
              {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          {/* Stage */}
          <div>
            <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 5 }}><Target size={11} /> Lead Stage</label>
            <select className="crm-input" value={filterStage} onChange={(e) => setFilterStage(e.target.value)} style={{ height: 36, width: "auto" }}>
              <option value="">All stages</option>
              {LEAD_STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          {/* Service */}
          <div>
            <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 5 }}><Layers size={11} /> SAP Service</label>
            <select className="crm-input" value={filterService} onChange={(e) => setFilterService(e.target.value)} style={{ height: 36, width: "auto" }}>
              <option value="">All services</option>
              {SAP_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="Cumulative">Cumulative</option>
            </select>
          </div>
          {/* Country */}
          {uniqueCountries.length > 0 && (
            <div>
              <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 5 }}><Filter size={11} /> Country</label>
              <select className="crm-input" value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} style={{ height: 36, width: "auto" }}>
                <option value="">All countries</option>
                {uniqueCountries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {activeFilters > 0 && (
            <button className="btn-secondary" onClick={() => { setFilterEmployee(""); setFilterSource(""); setFilterStage(""); setFilterService(""); setFilterCountry(""); setFilterDays(180); }} style={{ height: 36 }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── KPI Row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14, marginBottom: 24 }}>
        <KpiCard icon={Database}      label="Total Leads"  value={computed.totalLeads}  color="#1B76D3" variant="blue" />
        <KpiCard icon={BadgeCheck}    label="Won Leads"    value={computed.wonLeads}    sub={`${computed.convRate}% conversion`} color="#10B981" variant="green" />
        <KpiCard icon={TrendingDown}  label="Lost Leads"   value={computed.lostLeads}   color="#EF4444" variant="red" />
        <KpiCard icon={IndianRupee}   label="Won Revenue"  value={computed.totalRevenue > 0 ? formatCompact(computed.totalRevenue) : `${symbol}0`} color="#F59E0B" variant="amber" />
        <KpiCard icon={ListTodo}      label="Open Deals"   value={computed.openDeals}   color="#3B82F6" variant="blue" />
        <KpiCard icon={Flame}         label="Hot Leads"    value={computed.hotLeads}    color="#F97316" variant="red" />
      </div>

      {/* ── Charts Row 1: Monthly + Source ── */}
      <div className="reports-chart-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        <ChartCard title="Monthly Leads — Total vs Won (6 months)" icon={BarChart2} iconColor="#3B82F6">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={computed.monthlyLeads} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CrmTooltip />} />
              <Legend formatter={(v) => <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>{v}</span>} iconSize={8} />
              <Bar dataKey="total" fill="#C7D2FE" name="Total" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="won" fill="#1B76D3" name="Won" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Leads by Source" icon={Share2} iconColor="#8B5CF6">
          {computed.sourceData.length === 0 ? (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>No data for selected filters</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", height: 220 }}>
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Pie data={computed.sourceData} cx="50%" cy="50%" outerRadius={85} dataKey="value" paddingAngle={2}>
                    {computed.sourceData.map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CrmTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                {computed.sourceData.map((s, i) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: SOURCE_COLORS[i % SOURCE_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: "var(--text-2)", flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text)" }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Charts Row 2: Stage funnel + Temperature + Activities ── */}
      <div className="reports-chart-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 18, marginBottom: 18 }}>
        {/* Stage funnel */}
        <ChartCard title="Lead Stage Distribution" icon={Filter} iconColor="#6366F1">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {computed.stageFunnel.map((s) => {
              const pct = computed.totalLeads > 0 ? ((s.value / computed.totalLeads) * 100).toFixed(1) : 0;
              return (
                <div key={s.name} style={{ flex: "1 1 90px", padding: "12px 14px", borderRadius: 10, background: `${s.fill}10`, border: `1px solid ${s.fill}30`, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.fill }}>{s.value}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", marginTop: 2 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </ChartCard>

        {/* Temperature */}
        <ChartCard title="Lead Temperature" icon={Thermometer} iconColor="#EF4444">
          {computed.tempData.length === 0 ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>No data</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              {computed.tempData.map((t) => (
                <div key={t.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, color: "var(--text-2)", fontWeight: 600 }}>{t.name}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: t.fill }}>{t.value}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--surface-3)", borderRadius: 3 }}>
                    <div style={{ height: "100%", background: t.fill, borderRadius: 3, width: `${computed.totalLeads > 0 ? (t.value / computed.totalLeads) * 100 : 0}%`, transition: "width 0.4s" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        {/* Activity breakdown */}
        <ChartCard title="Activity Breakdown" icon={ListTodo} iconColor="#8B5CF6">
          {computed.actData.length === 0 ? (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>No activities</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              {computed.actData.map((a, i) => {
                const max = Math.max(...computed.actData.map((x) => x.value));
                return (
                  <div key={a.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>{a.name}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }}>{a.value}</span>
                    </div>
                    <div style={{ height: 5, background: "var(--surface-3)", borderRadius: 3 }}>
                      <div style={{ height: "100%", background: SOURCE_COLORS[i % SOURCE_COLORS.length], borderRadius: 3, width: `${max > 0 ? (a.value / max) * 100 : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Revenue Forecast + Funnel Conversion ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, marginBottom: 18 }}>
        {/* Revenue Forecast chart */}
        <ChartCard title={`Revenue Forecast — Won + 3-Month Projection (${symbol})`} icon={LineChart} iconColor="#10B981">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={computed.forecastData} barGap={4}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10.5, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10.5, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} unit="L" />
              <Tooltip content={<CrmTooltip />} formatter={(v) => formatCompact(v * 100000)} />
              <Bar dataKey="actual" fill="#10B981" name="Won Revenue" radius={[4,4,0,0]} maxBarSize={26} opacity={0.85} />
              <Line dataKey="forecast" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: "#F59E0B" }} name="Forecast" connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 10, padding: "0 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-muted)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#10B981", display: "inline-block" }} /> Won Revenue
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-muted)" }}>
              <span style={{ width: 18, height: 2, background: "#F59E0B", display: "inline-block", borderRadius: 2 }} /> Projected (trend + 5% growth)
            </div>
          </div>
        </ChartCard>

        {/* Funnel Conversion Rates */}
        <ChartCard title="Funnel Conversion Rates" icon={Megaphone} iconColor="#F59E0B">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
            {computed.funnelConversions.map((f) => (
              <div key={f.from}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                    <span style={{ color: "var(--text-muted)" }}>{f.from}</span>
                    <span style={{ color: "var(--text-muted)", margin: "0 5px" }}>→</span>
                    <span style={{ fontWeight: 600, color: f.color }}>{f.to}</span>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{f.toCount}/{f.fromCount}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: f.rate >= 50 ? "#10B981" : f.rate >= 25 ? "#F59E0B" : "#EF4444" }}>
                      {f.rate}%
                    </span>
                  </div>
                </div>
                <div style={{ height: 5, background: "var(--surface-3)", borderRadius: 3 }}>
                  <div style={{ height: "100%", width: `${f.rate}%`, background: f.rate >= 50 ? "#10B981" : f.rate >= 25 ? "#F59E0B" : "#EF4444", borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
              </div>
            ))}
            {computed.funnelConversions.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "20px 0" }}>Not enough data</div>
            )}
          </div>
        </ChartCard>
      </div>

      {/* ── Team Performance ── */}
      {computed.teamPerf.length > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: 14, border: "1px solid var(--border)", overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <UsersRound size={15} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>Team Performance</span>
            {filterEmployee && <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface-2)", padding: "2px 8px", borderRadius: 99, border: "1px solid var(--border)" }}>Filtered</span>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>TEAM MEMBER</th>
                  <th>LEADS</th>
                  <th>CONTACTED</th>
                  <th>WON</th>
                  <th>CONV. RATE</th>
                  <th>ACTIVITIES</th>
                  <th>REVENUE</th>
                </tr>
              </thead>
              <tbody>
                {computed.teamPerf.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "var(--accent)", flexShrink: 0 }}>
                          {p.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{p.name}</div>
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)", textTransform: "capitalize" }}>{p.role}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--accent)" }}>{p.leads}</td>
                    <td>{p.contacted}</td>
                    <td style={{ fontWeight: 600, color: "#10B981" }}>{p.won}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: "var(--surface-3)", borderRadius: 3, maxWidth: 60 }}>
                          <div style={{ width: `${p.convRate}%`, height: "100%", background: "#1B76D3", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>{p.convRate}%</span>
                      </div>
                    </td>
                    <td>{p.activities}</td>
                    <td style={{ fontWeight: 600, color: "#10B981" }}>{p.revenue > 0 ? formatCompact(p.revenue) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
