'use strict';

const PDFDocument    = require('pdfkit');
const { supabase }  = require('../config/db');

// ── Palette ────────────────────────────────────────────────────────────────────
const C = {
  black:     '#0F172A',
  brand:     '#1B3A6B',
  accent:    '#3B82F6',
  success:   '#059669',
  warning:   '#D97706',
  orange:    '#EA580C',
  danger:    '#DC2626',
  purple:    '#7C3AED',
  gray:      '#64748B',
  lightGray: '#94A3B8',
  border:    '#CBD5E1',
  rowAlt:    '#F8FAFC',
  headBg:    '#F1F5F9',
  white:     '#FFFFFF',
};

// A4 portrait
const PW = 595.28, PH = 841.89, ML = 36, MR = 36;
const CW = PW - ML - MR;   // 523.28 usable width
const BOTTOM_MARGIN = 60;

// ── Tiny helpers ───────────────────────────────────────────────────────────────
const pad  = n => String(n).padStart(2, '0');
const trunc = (s, max) => s && s.length > max ? s.slice(0, max - 1) + '…' : (s || '—');

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
  } catch { return '—'; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      hour12: true, timeZone: 'Asia/Kolkata',
    });
  } catch { return '—'; }
}

function daysSince(d) {
  if (!d) return 999;
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
}

function staleBucket(days) {
  if (days >= 15) return { label: '15d+ CRITICAL',  color: C.danger  };
  if (days >= 10) return { label: '10-14d URGENT',  color: C.orange  };
  if (days >=  7) return { label: '7-9d WARNING',   color: C.warning };
  return                  { label: '5-6d REMINDER', color: C.purple  };
}

function rl(r) {
  return (r || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Data Fetching ──────────────────────────────────────────────────────────────
async function fetchDailyPlanningData(nowIst, dayStart, dayEnd) {
  const todayStr       = `${nowIst.getUTCFullYear()}-${pad(nowIst.getUTCMonth()+1)}-${pad(nowIst.getUTCDate())}`;
  const fiveDaysAgo    = new Date(Date.now() -  5 * 86400000).toISOString();
  const sevenDaysLater = new Date(Date.now() +  7 * 86400000).toISOString();

  const [
    profilesRes,
    pipelineRes,
    leadsRes,
    dealsRes,
    todayMeetingsRes,
    missedMeetingsRes,
    upcomingMeetingsRes,
    overdueActivRes,
    todayActivRes,
    todayLeadUpdRes,
    todayDealUpdRes,
  ] = await Promise.all([
    // All active field employees
    supabase.from('profiles')
      .select('id, full_name, email, role')
      .not('status', 'in', '("deleted","inactive")')
      .not('email', 'is', null)
      .in('role', ['sales_head','sales_manager','sales_employee','inside_sales','field_sales'])
      .order('full_name'),

    // Stale Pipeline (5+ days not updated, not terminal)
    supabase.from('leads')
      .select('id, company_name, contact_name, source, pipeline_stage, assigned_to, last_activity_at, updated_at, assigned_profile:profiles!leads_assigned_to_fkey(full_name)')
      .eq('stage', 'pipeline')
      .lt('updated_at', fiveDaysAgo)
      .order('updated_at', { ascending: true })
      .limit(300),

    // Stale Leads (5+ days, non-pipeline, non-terminal)
    supabase.from('leads')
      .select('id, company_name, contact_name, stage, temperature, assigned_to, last_activity_at, updated_at, assigned_profile:profiles!leads_assigned_to_fkey(full_name)')
      .neq('stage', 'pipeline')
      .not('stage', 'in', '("won","lost","converted")')
      .lt('updated_at', fiveDaysAgo)
      .order('updated_at', { ascending: true })
      .limit(300),

    // Stale Deals (5+ days, non-terminal)
    supabase.from('deals')
      .select('id, company_name, contact_name, stage, value, assigned_to, updated_at, assigned_profile:profiles!deals_assigned_to_fkey(full_name)')
      .not('stage', 'in', '("won","lost")')
      .lt('updated_at', fiveDaysAgo)
      .order('updated_at', { ascending: true })
      .limit(300),

    // Today's meetings
    supabase.from('meetings')
      .select('id, title, customer_name, start_time, end_time, status, meeting_type, created_by, assignee:profiles!meetings_created_by_fkey(full_name)')
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .order('start_time'),

    // Missed/overdue meetings (scheduled but before today)
    supabase.from('meetings')
      .select('id, title, customer_name, start_time, status, created_by, assignee:profiles!meetings_created_by_fkey(full_name)')
      .eq('status', 'scheduled')
      .lt('start_time', dayStart)
      .order('start_time', { ascending: false })
      .limit(50),

    // Upcoming meetings (next 7 days)
    supabase.from('meetings')
      .select('id, title, customer_name, start_time, meeting_type, created_by, assignee:profiles!meetings_created_by_fkey(full_name)')
      .eq('status', 'scheduled')
      .gt('start_time', dayEnd)
      .lte('start_time', sevenDaysLater)
      .order('start_time')
      .limit(50),

    // Overdue activities (due before today, not done)
    supabase.from('activities')
      .select('id, title, type, status, due_date, user_id, lead_id, deal_id, assignee:profiles!activities_created_by_fkey(full_name)')
      .neq('status', 'done')
      .lt('due_date', dayStart)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .limit(100),

    // Activities logged today (for employee action tracking) — use created_by (has FK to profiles)
    supabase.from('activities')
      .select('created_by, user_id')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .limit(1000),

    // Leads updated today
    supabase.from('leads')
      .select('assigned_to, created_by')
      .gte('updated_at', dayStart)
      .lte('updated_at', dayEnd)
      .limit(1000),

    // Deals updated today
    supabase.from('deals')
      .select('assigned_to, created_by')
      .gte('updated_at', dayStart)
      .lte('updated_at', dayEnd)
      .limit(1000),
  ]);

  const employees        = profilesRes.data        || [];
  const rawPipeline      = pipelineRes.data        || [];
  const rawLeads         = leadsRes.data           || [];
  const rawDeals         = dealsRes.data           || [];
  const todayMeetings    = todayMeetingsRes.data   || [];
  const missedMeetings   = missedMeetingsRes.data  || [];
  const upcomingMeetings = upcomingMeetingsRes.data|| [];
  const overdueActiv     = overdueActivRes.data    || [];
  const todayActivRows   = todayActivRes.data      || [];
  const todayLeadRows    = todayLeadUpdRes.data    || [];
  const todayDealRows    = todayDealUpdRes.data    || [];

  // Employee action tracking
  const activeToday = new Set();
  todayActivRows.forEach(a => { if (a.user_id)    activeToday.add(a.user_id);    if (a.created_by) activeToday.add(a.created_by); });
  todayLeadRows.forEach (l => { if (l.assigned_to) activeToday.add(l.assigned_to); if (l.created_by) activeToday.add(l.created_by); });
  todayDealRows.forEach (d => { if (d.assigned_to) activeToday.add(d.assigned_to); if (d.created_by) activeToday.add(d.created_by); });

  const employeeStatus = employees.map(emp => ({
    ...emp,
    activeToday:  activeToday.has(emp.id),
    todayActions: [
      ...todayActivRows.filter(a => a.user_id === emp.id || a.created_by === emp.id),
      ...todayLeadRows .filter(l => l.assigned_to === emp.id || l.created_by === emp.id),
      ...todayDealRows .filter(d => d.assigned_to === emp.id || d.created_by === emp.id),
    ].length,
  }));

  // Attach staleDays to stale records
  const withDays = (arr) => arr.map(r => ({ ...r, staleDays: daysSince(r.updated_at) })).filter(r => r.staleDays >= 5);

  const stalePipeline = withDays(rawPipeline);
  const staleLeads    = withDays(rawLeads);
  const staleDeals    = withDays(rawDeals);

  return {
    todayStr,
    employees,
    employeeStatus,
    stalePipeline,
    staleLeads,
    staleDeals,
    todayMeetings,
    missedMeetings,
    upcomingMeetings,
    overdueActiv,
    summary: {
      totalEmployees:     employees.length,
      activeToday:        employeeStatus.filter(e => e.activeToday).length,
      inactiveToday:      employeeStatus.filter(e => !e.activeToday).length,
      stalePipeline:      stalePipeline.length,
      staleLeads:         staleLeads.length,
      staleDeals:         staleDeals.length,
      todayMeetings:      todayMeetings.length,
      missedMeetings:     missedMeetings.length,
      upcomingMeetings:   upcomingMeetings.length,
      overdueActivities:  overdueActiv.length,
      criticalPipeline:   stalePipeline.filter(r => r.staleDays >= 15).length,
      criticalLeads:      staleLeads.filter(r   => r.staleDays >= 15).length,
      criticalDeals:      staleDeals.filter(r   => r.staleDays >= 15).length,
    },
  };
}

// ── PDF Generation ─────────────────────────────────────────────────────────────
function generateDailyPlanningPdf(data, reportDateLabel, generatedAt) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size:    'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
    });

    const bufs = [];
    doc.on('data',  b  => bufs.push(b));
    doc.on('end',   () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const genStr = new Date(generatedAt || Date.now()).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) + ' IST';

    let y = 0;

    // ── helpers ──────────────────────────────────────────────────────────────
    function newPageIfNeeded(neededH = 60) {
      if (y + neededH > PH - BOTTOM_MARGIN) {
        doc.addPage();
        drawPageFooter(doc.bufferedPageRange().count);
        y = 36;
      }
    }

    function drawPageFooter(pageNum) {
      const fp = PH - 30;
      doc.rect(0, fp - 4, PW, 34).fill('#F8FAFC');
      doc.rect(0, fp - 4, PW, 0.5).fill(C.border);
      doc.font('Helvetica').fontSize(8).fillColor(C.lightGray)
         .text('Sales CRM — Daily Planning Report', ML, fp + 2, { width: CW / 2 })
         .text(`Page ${pageNum} · Generated ${genStr}`, ML + CW / 2, fp + 2, { width: CW / 2, align: 'right' });
    }

    function sectionHeader(title, iconChar) {
      newPageIfNeeded(50);
      y += 16;
      doc.rect(ML, y, CW, 26).fill(C.brand);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.white)
         .text(`${iconChar}  ${title.toUpperCase()}`, ML + 12, y + 8, { width: CW - 24 });
      y += 34;
    }

    function smallLabel(txt, color) {
      return `<span style="color:${color}">${txt}</span>`;
    }

    function statBox(label, value, color, x, bw, by) {
      doc.rect(x, by, bw, 52).fillAndStroke(color + '12', C.border);
      doc.rect(x, by, bw, 3).fill(color);
      doc.font('Helvetica-Bold').fontSize(20).fillColor(color)
         .text(String(value), x, by + 10, { width: bw, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.gray)
         .text(label, x, by + 36, { width: bw, align: 'center' });
    }

    function tableHeader(cols) {
      newPageIfNeeded(28);
      doc.rect(ML, y, CW, 20).fill(C.headBg);
      doc.rect(ML, y, CW, 0.5).fill(C.border);
      let cx = ML;
      cols.forEach(col => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.gray)
           .text(col.label.toUpperCase(), cx + 4, y + 6, { width: col.w - 8, align: col.align || 'left' });
        cx += col.w;
      });
      y += 20;
    }

    function tableRow(cols, values, rowIdx) {
      const rowH = 18;
      newPageIfNeeded(rowH + 2);
      if (rowIdx % 2 === 1) doc.rect(ML, y, CW, rowH).fill(C.rowAlt);
      doc.rect(ML, y, CW, 0.5).fill(C.border + '80');
      let cx = ML;
      cols.forEach((col, i) => {
        const val = values[i];
        const color = col.color || C.black;
        doc.font(col.bold ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(7.5).fillColor(color)
           .text(trunc(String(val == null ? '—' : val), col.maxLen || 35), cx + 4, y + 5, { width: col.w - 8, align: col.align || 'left' });
        cx += col.w;
      });
      y += rowH;
    }

    // ── HEADER PAGE ──────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 100).fill(C.brand);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(C.white)
       .text('SALES CRM', ML, 22);
    doc.font('Helvetica').fontSize(10).fillColor('rgba(255,255,255,0.6)')
       .text('DAILY PLANNING & PENDING ACTION REPORT', ML, 54);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.white)
       .text(reportDateLabel, ML, 72, { width: CW });
    doc.font('Helvetica').fontSize(8.5).fillColor('rgba(255,255,255,0.5)')
       .text(`Generated at ${genStr}`, PW - MR - 200, 80, { width: 200, align: 'right' });
    doc.rect(0, 97, PW, 3).fill(C.accent);
    y = 114;

    drawPageFooter(1);

    // ── EXECUTIVE SUMMARY ─────────────────────────────────────────────────────
    sectionHeader('Executive Summary', '▪');

    const { summary } = data;
    const boxes = [
      { label: 'Total Employees',   value: summary.totalEmployees,    color: C.accent   },
      { label: 'Active Today',      value: summary.activeToday,       color: C.success  },
      { label: 'No Action Today',   value: summary.inactiveToday,     color: C.danger   },
      { label: 'Stale Pipeline',    value: summary.stalePipeline,     color: C.orange   },
      { label: 'Stale Leads',       value: summary.staleLeads,        color: C.warning  },
      { label: 'Stale Deals',       value: summary.staleDeals,        color: C.purple   },
      { label: "Today's Meetings",  value: summary.todayMeetings,     color: C.accent   },
      { label: 'Missed Meetings',   value: summary.missedMeetings,    color: C.danger   },
      { label: 'Overdue Activities',value: summary.overdueActivities, color: C.orange   },
    ];

    const bw = Math.floor(CW / 3) - 4;
    boxes.forEach((b, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      statBox(b.label, b.value, b.color, ML + col * (bw + 6), bw, y + row * 62);
    });
    y += Math.ceil(boxes.length / 3) * 62 + 16;

    // Critical items callout
    const critCount = summary.criticalPipeline + summary.criticalLeads + summary.criticalDeals;
    if (critCount > 0) {
      newPageIfNeeded(40);
      doc.rect(ML, y, CW, 32).fill('#FEF2F2').stroke(C.danger);
      doc.rect(ML, y, 4, 32).fill(C.danger);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.danger)
         .text(`⚠  CRITICAL: ${critCount} record(s) with 15+ days of inactivity require immediate management attention.`, ML + 12, y + 11, { width: CW - 20 });
      y += 40;
    }

    // ── EMPLOYEE ACTION STATUS ────────────────────────────────────────────────
    sectionHeader('Employee Action Status (Today)', '▸');

    const empCols = [
      { label: 'Employee Name', w: 160 },
      { label: 'Role',          w: 110 },
      { label: 'Status',        w: 100 },
      { label: 'Actions Today', w: 80, align: 'center' },
      { label: 'Note',          w: 73  },
    ];
    tableHeader(empCols);

    const empSorted = [...data.employeeStatus].sort((a, b) => Number(a.activeToday) - Number(b.activeToday));
    empSorted.forEach((emp, i) => {
      const status  = emp.activeToday ? 'Active' : 'No Action';
      const sColor  = emp.activeToday ? C.success : C.danger;
      const note    = emp.activeToday ? '' : 'Follow up required';
      const rowVals = [emp.full_name, rl(emp.role), status, emp.todayActions || '0', note];
      const cols    = empCols.map((c, ci) => ({
        ...c,
        color: ci === 2 ? sColor : (ci === 4 && !emp.activeToday ? C.danger : C.black),
        bold:  ci === 2,
      }));
      tableRow(cols, rowVals, i);
    });

    if (!data.employeeStatus.length) {
      newPageIfNeeded(20);
      doc.font('Helvetica').fontSize(9).fillColor(C.lightGray).text('No employee data available.', ML + 8, y + 4);
      y += 20;
    }

    // ── STALE PIPELINE ────────────────────────────────────────────────────────
    sectionHeader('Stale Pipeline Prospects (No Update 5+ Days)', '▸');

    if (data.stalePipeline.length === 0) {
      newPageIfNeeded(24); doc.font('Helvetica').fontSize(9).fillColor(C.success).text('✓  All Pipeline prospects are up to date.', ML + 8, y + 4); y += 24;
    } else {
      const pipeCols = [
        { label: 'Company',       w: 130 },
        { label: 'Contact',       w: 95  },
        { label: 'Stage',         w: 85  },
        { label: 'Assigned To',   w: 90  },
        { label: 'Last Updated',  w: 72  },
        { label: 'Stale Days',    w: 51, align: 'center' },
      ];
      tableHeader(pipeCols);
      data.stalePipeline.forEach((r, i) => {
        const bucket = staleBucket(r.staleDays);
        const cols   = pipeCols.map((c, ci) => ({ ...c, color: ci === 5 ? bucket.color : C.black, bold: ci === 5 }));
        tableRow(cols, [
          r.company_name, r.contact_name,
          rl(r.pipeline_stage || 'new_prospect'),
          r.assigned_profile?.full_name || '—',
          fmtDate(r.updated_at),
          `${r.staleDays}d (${bucket.label.split(' ')[0]})`,
        ], i);
      });
    }

    // ── STALE LEADS ───────────────────────────────────────────────────────────
    sectionHeader('Stale Leads (No Update 5+ Days)', '▸');

    if (data.staleLeads.length === 0) {
      newPageIfNeeded(24); doc.font('Helvetica').fontSize(9).fillColor(C.success).text('✓  All Leads are up to date.', ML + 8, y + 4); y += 24;
    } else {
      const leadCols = [
        { label: 'Company',      w: 130 },
        { label: 'Contact',      w: 95  },
        { label: 'Stage',        w: 68  },
        { label: 'Temperature',  w: 60  },
        { label: 'Assigned To',  w: 90  },
        { label: 'Last Updated', w: 72  },
        { label: 'Stale',        w: 28, align: 'center' },
      ];
      tableHeader(leadCols);
      data.staleLeads.forEach((r, i) => {
        const bucket = staleBucket(r.staleDays);
        const tColor = r.temperature === 'hot' ? C.danger : r.temperature === 'warm' ? C.warning : C.accent;
        const cols   = leadCols.map((c, ci) => ({
          ...c,
          color: ci === 3 ? tColor : ci === 6 ? bucket.color : C.black,
          bold:  ci === 6,
        }));
        tableRow(cols, [
          r.company_name, r.contact_name, rl(r.stage),
          rl(r.temperature || '—'),
          r.assigned_profile?.full_name || '—',
          fmtDate(r.updated_at),
          `${r.staleDays}d`,
        ], i);
      });
    }

    // ── STALE DEALS ───────────────────────────────────────────────────────────
    sectionHeader('Stale Deals (No Update 5+ Days)', '▸');

    if (data.staleDeals.length === 0) {
      newPageIfNeeded(24); doc.font('Helvetica').fontSize(9).fillColor(C.success).text('✓  All Deals are up to date.', ML + 8, y + 4); y += 24;
    } else {
      const dealCols = [
        { label: 'Company',      w: 140 },
        { label: 'Contact',      w: 90  },
        { label: 'Stage',        w: 90  },
        { label: 'Value',        w: 65, align: 'right' },
        { label: 'Assigned To',  w: 80  },
        { label: 'Last Updated', w: 72  },
        { label: 'Stale',        w: 28, align: 'center' },
      ];
      tableHeader(dealCols);
      data.staleDeals.forEach((r, i) => {
        const bucket = staleBucket(r.staleDays);
        const val    = r.value ? `₹${Number(r.value).toLocaleString('en-IN')}` : '—';
        const cols   = dealCols.map((c, ci) => ({
          ...c,
          color: ci === 6 ? bucket.color : C.black,
          bold:  ci === 6,
        }));
        tableRow(cols, [
          r.company_name, r.contact_name, rl(r.stage), val,
          r.assigned_profile?.full_name || '—',
          fmtDate(r.updated_at),
          `${r.staleDays}d`,
        ], i);
      });
    }

    // ── MEETING SUMMARY ───────────────────────────────────────────────────────
    sectionHeader("Today's Meetings", '▸');

    if (data.todayMeetings.length === 0) {
      newPageIfNeeded(24); doc.font('Helvetica').fontSize(9).fillColor(C.lightGray).text('No meetings scheduled for today.', ML + 8, y + 4); y += 24;
    } else {
      const meetCols = [
        { label: 'Time',          w: 70  },
        { label: 'Title',         w: 130 },
        { label: 'Client',        w: 110 },
        { label: 'Type',          w: 75  },
        { label: 'Employee',      w: 90  },
        { label: 'Status',        w: 48, align: 'center' },
      ];
      tableHeader(meetCols);
      const statusColor = s => s === 'completed' ? C.success : s === 'cancelled' ? C.danger : s === 'rescheduled' ? C.warning : C.accent;
      data.todayMeetings.forEach((m, i) => {
        const sc   = statusColor(m.status);
        const cols = meetCols.map((c, ci) => ({ ...c, color: ci === 5 ? sc : C.black, bold: ci === 5 }));
        tableRow(cols, [
          fmtDateTime(m.start_time), m.title,
          m.customer_name || '—', rl(m.meeting_type || '—'),
          m.assignee?.full_name || '—', rl(m.status || '—'),
        ], i);
      });
    }

    // ── MISSED MEETINGS ───────────────────────────────────────────────────────
    if (data.missedMeetings.length > 0) {
      sectionHeader(`Missed / Overdue Meetings (${data.missedMeetings.length})`, '⚠');
      const missCols = [
        { label: 'Scheduled Time',  w: 100 },
        { label: 'Title',           w: 140 },
        { label: 'Client',          w: 130 },
        { label: 'Employee',        w: 100 },
        { label: 'Days Overdue',    w: 53, align: 'center' },
      ];
      tableHeader(missCols);
      data.missedMeetings.forEach((m, i) => {
        const overdueDays = daysSince(m.start_time);
        const cols = missCols.map((c, ci) => ({ ...c, color: ci === 4 ? C.danger : C.black, bold: ci === 4 }));
        tableRow(cols, [
          fmtDateTime(m.start_time), m.title,
          m.customer_name || '—',
          m.assignee?.full_name || '—',
          `${overdueDays}d`,
        ], i);
      });
    }

    // ── UPCOMING MEETINGS ─────────────────────────────────────────────────────
    if (data.upcomingMeetings.length > 0) {
      sectionHeader(`Upcoming Meetings — Next 7 Days (${data.upcomingMeetings.length})`, '▸');
      const upCols = [
        { label: 'Date & Time',    w: 100 },
        { label: 'Title',          w: 140 },
        { label: 'Client',         w: 130 },
        { label: 'Type',           w: 80  },
        { label: 'Employee',       w: 73  },
      ];
      tableHeader(upCols);
      data.upcomingMeetings.forEach((m, i) => {
        tableRow(upCols, [
          fmtDateTime(m.start_time), m.title,
          m.customer_name || '—', rl(m.meeting_type || '—'),
          m.assignee?.full_name || '—',
        ], i);
      });
    }

    // ── OVERDUE ACTIVITIES ────────────────────────────────────────────────────
    if (data.overdueActiv.length > 0) {
      sectionHeader(`Overdue Activities & Follow-ups (${data.overdueActiv.length})`, '⚠');
      const actCols = [
        { label: 'Due Date',      w: 75  },
        { label: 'Title',         w: 155 },
        { label: 'Type',          w: 75  },
        { label: 'Status',        w: 75  },
        { label: 'Employee',      w: 90  },
        { label: 'Overdue Days',  w: 53, align: 'center' },
      ];
      tableHeader(actCols);
      data.overdueActiv.forEach((a, i) => {
        const od   = daysSince(a.due_date);
        const oc   = od >= 7 ? C.danger : od >= 3 ? C.orange : C.warning;
        const cols = actCols.map((c, ci) => ({ ...c, color: ci === 5 ? oc : C.black, bold: ci === 5 }));
        tableRow(cols, [
          fmtDate(a.due_date), a.title,
          rl(a.type || '—'), rl(a.status || '—'),
          a.assignee?.full_name || '—', `${od}d`,
        ], i);
      });
    }

    // ── MANAGEMENT SUMMARY ────────────────────────────────────────────────────
    sectionHeader('Management Summary', '▪');
    newPageIfNeeded(160);

    const summaryLines = [
      { label: 'Report Date',               value: reportDateLabel },
      { label: 'Generated At',              value: genStr },
      { label: 'Total Active Employees',    value: String(summary.totalEmployees) },
      { label: 'Employees Active Today',    value: String(summary.activeToday) },
      { label: 'Employees With No Action',  value: String(summary.inactiveToday) + (summary.inactiveToday > 0 ? ' ← Require Follow-up' : '') },
      { label: 'Stale Pipeline Records',    value: `${summary.stalePipeline} total (${summary.criticalPipeline} critical 15d+)` },
      { label: 'Stale Lead Records',        value: `${summary.staleLeads} total (${summary.criticalLeads} critical 15d+)` },
      { label: 'Stale Deal Records',        value: `${summary.staleDeals} total (${summary.criticalDeals} critical 15d+)` },
      { label: "Today's Meeting Count",     value: String(summary.todayMeetings) },
      { label: 'Missed/Overdue Meetings',   value: String(summary.missedMeetings) + (summary.missedMeetings > 0 ? ' ← Action Required' : '') },
      { label: 'Upcoming Meetings (7d)',    value: String(summary.upcomingMeetings) },
      { label: 'Overdue Activities',        value: String(summary.overdueActivities) + (summary.overdueActivities > 0 ? ' ← Follow-up Needed' : '') },
    ];

    const LW = 220, VW = CW - LW - 8;
    summaryLines.forEach((line, i) => {
      newPageIfNeeded(22);
      if (i % 2 === 0) doc.rect(ML, y, CW, 22).fill(C.rowAlt);
      doc.rect(ML, y, CW, 0.5).fill(C.border + '80');
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.gray)
         .text(line.label, ML + 8, y + 7, { width: LW });
      const isAlert = line.value.includes('←');
      doc.font('Helvetica').fontSize(8).fillColor(isAlert ? C.danger : C.black)
         .text(line.value, ML + LW + 8, y + 7, { width: VW });
      y += 22;
    });

    y += 16;
    newPageIfNeeded(40);
    doc.rect(ML, y, CW, 32).fill('#F0F9FF');
    doc.rect(ML, y, 4, 32).fill(C.accent);
    doc.font('Helvetica').fontSize(8).fillColor(C.gray)
       .text('This report is auto-generated by Sales CRM at 10:30 AM IST daily. Data reflects the state of the CRM as of report generation time.  All data is sourced from the live CRM database.', ML + 14, y + 9, { width: CW - 20 });
    y += 40;

    doc.end();
  });
}

// ── Email HTML ─────────────────────────────────────────────────────────────────
function buildDailyPlanningEmailHtml(data, reportDateLabel) {
  const { summary } = data;
  const BRAND = 'linear-gradient(135deg,#0B1120 0%,#1B3A6B 100%)';
  const stat = (label, value, color) => `
    <td style="padding:12px 16px;text-align:center;border-right:1px solid #E2E8F0;">
      <div style="font-size:26px;font-weight:800;color:${color};">${value}</div>
      <div style="font-size:11px;color:#64748B;font-weight:500;margin-top:2px;">${label}</div>
    </td>`;

  const inactiveNames = data.employeeStatus.filter(e => !e.activeToday).map(e => e.full_name).join(', ') || 'None';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Daily Planning Report</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:32px 0;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;margin:0 auto;">

  <tr><td style="background:${BRAND};border-radius:14px 14px 0 0;padding:28px 32px 24px;text-align:center;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.45);">SALES CRM</p>
    <h1 style="margin:0;font-size:20px;font-weight:800;color:#FFFFFF;">Daily Planning Report</h1>
    <p style="margin:6px 0 0;font-size:12px;color:rgba(255,255,255,0.55);">${reportDateLabel}</p>
  </td></tr>

  <tr><td style="background:#FFFFFF;padding:28px 32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <tr>
        ${stat('Total Employees', summary.totalEmployees, '#3B82F6')}
        ${stat('Active Today', summary.activeToday, '#059669')}
        ${stat('No Action Today', summary.inactiveToday, summary.inactiveToday > 0 ? '#DC2626' : '#059669')}
        <td></td>
      </tr>
      <tr style="border-top:1px solid #E2E8F0;">
        ${stat('Stale Pipeline', summary.stalePipeline, '#EA580C')}
        ${stat('Stale Leads', summary.staleLeads, '#D97706')}
        ${stat('Stale Deals', summary.staleDeals, '#7C3AED')}
        <td></td>
      </tr>
      <tr style="border-top:1px solid #E2E8F0;">
        ${stat("Today's Meetings", summary.todayMeetings, '#3B82F6')}
        ${stat('Missed Meetings', summary.missedMeetings, summary.missedMeetings > 0 ? '#DC2626' : '#059669')}
        ${stat('Overdue Activities', summary.overdueActivities, summary.overdueActivities > 0 ? '#EA580C' : '#059669')}
        <td></td>
      </tr>
    </table>

    ${summary.inactiveToday > 0 ? `
    <div style="margin-bottom:20px;padding:14px 16px;background:#FEF2F2;border:1px solid #FECACA;border-left:4px solid #DC2626;border-radius:8px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#991B1B;">⚠ Employees With No Action Today (${summary.inactiveToday})</p>
      <p style="margin:6px 0 0;font-size:12px;color:#7F1D1D;">${inactiveNames}</p>
    </div>` : `
    <div style="margin-bottom:20px;padding:12px 16px;background:#DCFCE7;border:1px solid #86EFAC;border-left:4px solid #16A34A;border-radius:8px;">
      <p style="margin:0;font-size:13px;font-weight:600;color:#14532D;">✓ All employees have logged activity today.</p>
    </div>`}

    ${summary.criticalPipeline + summary.criticalLeads + summary.criticalDeals > 0 ? `
    <div style="margin-bottom:20px;padding:14px 16px;background:#FFF7ED;border:1px solid #FED7AA;border-left:4px solid #EA580C;border-radius:8px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#9A3412;">⚠ Critical Records (15+ Days Inactive)</p>
      <p style="margin:6px 0 0;font-size:12px;color:#7C2D12;">Pipeline: ${summary.criticalPipeline} · Leads: ${summary.criticalLeads} · Deals: ${summary.criticalDeals}</p>
      <p style="margin:4px 0 0;font-size:11.5px;color:#7C2D12;">Immediate management attention required. See attached PDF for details.</p>
    </div>` : ''}

    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;">Stale Records Summary</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:20px;font-size:12.5px;">
      <tr style="background:#F8FAFC;font-weight:700;font-size:11px;color:#64748B;text-transform:uppercase;">
        <td style="padding:8px 12px;">Category</td>
        <td style="padding:8px 12px;text-align:center;">5–6d</td>
        <td style="padding:8px 12px;text-align:center;">7–9d</td>
        <td style="padding:8px 12px;text-align:center;">10–14d</td>
        <td style="padding:8px 12px;text-align:center;color:#DC2626;">15d+</td>
      </tr>
      ${['stalePipeline','staleLeads','staleDeals'].map((key, i) => {
        const label = ['Pipeline','Leads','Deals'][i];
        const arr   = data[key];
        return `<tr style="border-top:1px solid #F1F5F9;">
          <td style="padding:8px 12px;font-weight:600;color:#0F172A;">${label}</td>
          <td style="padding:8px 12px;text-align:center;">${arr.filter(r => r.staleDays >= 5 && r.staleDays < 7).length}</td>
          <td style="padding:8px 12px;text-align:center;color:#D97706;">${arr.filter(r => r.staleDays >= 7 && r.staleDays < 10).length}</td>
          <td style="padding:8px 12px;text-align:center;color:#EA580C;">${arr.filter(r => r.staleDays >= 10 && r.staleDays < 15).length}</td>
          <td style="padding:8px 12px;text-align:center;color:#DC2626;font-weight:700;">${arr.filter(r => r.staleDays >= 15).length}</td>
        </tr>`;
      }).join('')}
    </table>

    ${data.todayMeetings.length > 0 ? `
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;">Today's Meetings</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;margin-bottom:20px;font-size:12px;">
      <tr style="background:#F8FAFC;font-weight:700;font-size:11px;color:#64748B;text-transform:uppercase;">
        <td style="padding:7px 10px;">Time</td><td style="padding:7px 10px;">Title</td><td style="padding:7px 10px;">Client</td><td style="padding:7px 10px;">Employee</td><td style="padding:7px 10px;">Status</td>
      </tr>
      ${data.todayMeetings.slice(0, 10).map((m, i) => {
        const sc = m.status === 'completed' ? '#059669' : m.status === 'cancelled' ? '#DC2626' : '#3B82F6';
        return `<tr style="border-top:1px solid #F1F5F9;background:${i%2===1?'#F8FAFC':'#fff'};">
          <td style="padding:7px 10px;">${fmtDateTime(m.start_time)}</td>
          <td style="padding:7px 10px;">${trunc(m.title || '—', 30)}</td>
          <td style="padding:7px 10px;">${trunc(m.customer_name || '—', 25)}</td>
          <td style="padding:7px 10px;">${m.assignee?.full_name || '—'}</td>
          <td style="padding:7px 10px;font-weight:600;color:${sc};">${rl(m.status || '—')}</td>
        </tr>`;
      }).join('')}
      ${data.todayMeetings.length > 10 ? `<tr><td colspan="5" style="padding:6px 10px;font-size:11px;color:#94A3B8;">+${data.todayMeetings.length-10} more — see attached PDF</td></tr>` : ''}
    </table>` : ''}

    <p style="margin:16px 0 0;font-size:11.5px;color:#94A3B8;line-height:1.7;">The complete Daily Planning Report PDF is attached to this email. It includes full details of all stale records, employee action status, meeting summary, overdue activities, and management notes.</p>
  </td></tr>

  <tr><td style="background:#F8FAFC;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 14px 14px;padding:16px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94A3B8;">© ${new Date().getFullYear()} Sales CRM · Daily Planning Report · Auto-generated at 10:30 AM IST</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

module.exports = { fetchDailyPlanningData, generateDailyPlanningPdf, buildDailyPlanningEmailHtml };
