'use strict';
const PDFDocument = require('pdfkit');

// ── Light-theme colour palette ────────────────────────────────────────────────
const C = {
  accent:   '#3B82F6',   // blue — primary accent
  green:    '#10B981',
  red:      '#EF4444',
  yellow:   '#F59E0B',
  purple:   '#6366F1',
  gray:     '#64748B',
  border:   '#E2E8F0',
  surface:  '#F8FAFC',   // page / card background
  surface2: '#F1F5F9',   // alternate row / section bg
  text:     '#1E293B',   // primary text
  text2:    '#475569',   // secondary text
  muted:    '#94A3B8',   // muted / labels
  white:    '#FFFFFF',
  // header bar (top of each page) — stays branded
  hdrBg:    '#1E3A5F',
  hdrText:  '#FFFFFF',
};

const PW = 595.28;
const PH = 841.89;
const ML = 36;
const MR = 36;
const CW = PW - ML - MR; // 523.28

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtCurrency(n) {
  if (!n) return '₹0';
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return '—'; }
}
function fmtDateTime(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return '—'; }
}
function fmtType(t) {
  if (!t) return '—';
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function statusColor(s) {
  const v = (s || '').toLowerCase();
  if (v === 'done' || v === 'completed') return C.green;
  if (v === 'overdue') return C.red;
  return C.yellow;
}
function roleColor(r) {
  if (r === 'owner')         return C.purple;
  if (r === 'sales_head')    return C.green;
  if (r === 'sales_manager') return C.yellow;
  return C.accent;
}

// ─────────────────────────────────────────────────────────────────────────────
async function generateFrontendDsrPdf({ dateLabel, generatedAt, scopeProfiles, statsMap, meetings }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let pageNum = 0;

    // ── Page chrome ─────────────────────────────────────────────────────────
    function addHeader(subtitle) {
      pageNum++;
      // White page background
      doc.rect(0, 0, PW, PH).fill(C.white);
      // Narrow branded top bar
      doc.rect(0, 0, PW, 32).fill(C.hdrBg);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.hdrText)
         .text('Sales CRM', ML, 11, { continued: true });
      doc.font('Helvetica').fillColor(C.muted)
         .text(`  |  ${subtitle || 'Daily Sales Report'}`);
      doc.font('Helvetica').fontSize(8).fillColor(C.muted)
         .text(`Page ${pageNum}`, PW - MR - 36, 12, { width: 36, align: 'right' });
    }

    function addFooter() {
      // Light footer strip
      doc.rect(0, PH - 24, PW, 24).fill(C.surface2);
      doc.rect(0, PH - 24, PW, 1).fill(C.border);
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
         .text('Sales CRM  ·  Confidential — Internal Use Only', ML, PH - 15, { width: CW * 0.55 });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
         .text(`Generated: ${generatedAt}`, ML + CW * 0.55, PH - 15, { width: CW * 0.45, align: 'right' });
    }

    function newPage(subtitle) {
      if (pageNum > 0) { addFooter(); doc.addPage(); }
      addHeader(subtitle);
      return 40;
    }

    // ── Layout helpers ───────────────────────────────────────────────────────
    function sectionTitle(title, y) {
      doc.rect(ML, y, CW, 22).fill(C.surface2);
      doc.rect(ML, y, 3, 22).fill(C.accent);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text).text(title, ML + 10, y + 7);
      return y + 26;
    }

    function drawTable(cols, rows, startY, subtitle, rowH = 15) {
      let y = startY;
      const drawTHead = () => {
        // Light blue-gray header instead of dark navy
        doc.rect(ML, y, CW, rowH + 2).fill(C.surface2);
        doc.rect(ML, y, CW, 1).fill(C.border);
        doc.rect(ML, y + rowH + 1, CW, 1).fill(C.border);
        let x = ML;
        cols.forEach(col => {
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.text2)
             .text(col.label, x + 4, y + 5, { width: col.width - 8, ellipsis: true });
          x += col.width;
        });
        y += rowH + 2;
      };
      drawTHead();
      rows.forEach((row, ri) => {
        if (y > PH - 50) {
          addFooter(); doc.addPage(); addHeader(subtitle); y = 40;
          drawTHead();
        }
        // Alternate row shading (very subtle)
        doc.rect(ML, y, CW, rowH).fill(ri % 2 === 0 ? C.white : C.surface);
        // Bottom border
        doc.rect(ML, y + rowH - 1, CW, 1).fill(C.border);
        let rx = ML;
        cols.forEach(col => {
          const cell = row[col.key];
          const val  = cell && typeof cell === 'object' ? cell.v : (cell ?? '—');
          const clr  = cell && typeof cell === 'object' ? (cell.c || C.text) : C.text;
          doc.font('Helvetica').fontSize(7.5).fillColor(clr)
             .text(String(val), rx + 4, y + 4, { width: col.width - 8, ellipsis: true });
          rx += col.width;
        });
        y += rowH;
      });
      // Outer border
      doc.rect(ML, startY, CW, y - startY).stroke(C.border).strokeColor(C.border);
      return y;
    }

    // 4-column KPI stat grid
    function statGrid(items, y, cols = 4) {
      const boxW = Math.floor(CW / cols);
      const boxH = 56;
      const gap  = 6;
      items.forEach((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bx  = ML + col * boxW;
        const by  = y + row * (boxH + gap);
        const w   = col === cols - 1 ? CW - col * boxW : boxW - 6;
        // Card: white bg, light border, left colour bar
        doc.rect(bx, by, w, boxH).fill(C.white).stroke(C.border).strokeColor(C.border);
        doc.rect(bx, by, 3, boxH).fill(item.color || C.accent);
        doc.font('Helvetica-Bold').fontSize(18).fillColor(item.color || C.accent)
           .text(String(item.value), bx + 9, by + 9, { width: w - 18 });
        doc.font('Helvetica').fontSize(7.5).fillColor(C.text2)
           .text(item.label, bx + 9, by + 35, { width: w - 18, ellipsis: true });
      });
      return y + Math.ceil(items.length / cols) * (boxH + gap) + 4;
    }

    // Compact 4-col × N-row mini grid for per-employee section
    function miniStatGrid(items, y) {
      const cols = 4;
      const boxW = Math.floor(CW / cols);
      const boxH = 44;
      const gap  = 5;
      items.forEach((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const bx  = ML + col * boxW;
        const by  = y + row * (boxH + gap);
        const w   = col === cols - 1 ? CW - col * boxW : boxW - 6;
        doc.rect(bx, by, w, boxH).fill(C.white).stroke(C.border).strokeColor(C.border);
        doc.rect(bx, by, 3, boxH).fill(item.color || C.accent);
        doc.font('Helvetica-Bold').fontSize(15).fillColor(item.color || C.accent)
           .text(String(item.value), bx + 8, by + 8, { width: w - 16 });
        doc.font('Helvetica').fontSize(7).fillColor(C.text2)
           .text(item.label, bx + 8, by + 29, { width: w - 16, ellipsis: true });
      });
      return y + Math.ceil(items.length / cols) * (boxH + gap) + 4;
    }

    // ── Aggregate totals ─────────────────────────────────────────────────────
    const totals = {
      activitiesCompleted: 0, activitiesPending: 0, activitiesOverdue: 0,
      callsMade: 0, emailsSent: 0, notesAdded: 0, meetingsScheduled: 0,
      leadsCreated: 0, leadsConverted: 0, prospectsAdded: 0, newLeadsFromPipeline: 0,
      dealsCreated: 0, dealsWon: 0, revenue: 0, tasksCompleted: 0,
      followUpsCompleted: 0, followUpsPending: 0,
    };
    scopeProfiles.forEach(p => {
      const s = statsMap[p.id];
      if (!s) return;
      Object.keys(totals).forEach(k => { totals[k] += s[k] || 0; });
    });
    const totalActs = totals.activitiesCompleted + totals.activitiesPending + totals.activitiesOverdue;

    // ─────────────────────────────────────────────────────────────────────────
    // COVER PAGE  (light)
    // ─────────────────────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, PH).fill(C.white);

    // Top accent bar
    doc.rect(0, 0, PW, 5).fill(C.accent);

    // Brand header area
    doc.rect(0, 5, PW, 100).fill(C.surface2);
    doc.rect(0, 104, PW, 1).fill(C.border);

    doc.font('Helvetica-Bold').fontSize(28).fillColor(C.text)
       .text('Sales CRM', ML, 28, { width: CW, align: 'center' });
    doc.font('Helvetica').fontSize(13).fillColor(C.text2)
       .text('Daily Sales Report', ML, 64, { width: CW, align: 'center' });

    // Date badge
    doc.rect(ML + 100, 118, CW - 200, 34).fill(C.surface2).stroke(C.border).strokeColor(C.border);
    doc.rect(ML + 100, 118, 3, 34).fill(C.accent);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.text)
       .text(dateLabel, ML + 100, 129, { width: CW - 206, align: 'center' });

    // 4 headline stats
    const cStats = [
      { label: 'Total Activities', value: totalActs,                   color: C.accent  },
      { label: 'Leads Created',    value: totals.leadsCreated,         color: C.green   },
      { label: 'Deals Won',        value: totals.dealsWon,             color: C.purple  },
      { label: 'Revenue',          value: fmtCurrency(totals.revenue), color: C.yellow  },
    ];
    const cBW = CW / 4;
    cStats.forEach((s, i) => {
      const bx = ML + i * cBW;
      const w  = i === cStats.length - 1 ? CW - i * cBW : cBW - 6;
      doc.rect(bx, 170, w, 72).fill(C.white).stroke(C.border).strokeColor(C.border);
      doc.rect(bx, 170, 3, 72).fill(s.color);
      doc.font('Helvetica-Bold').fontSize(22).fillColor(s.color)
         .text(String(s.value), bx + 9, 183, { width: w - 18, align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor(C.text2)
         .text(s.label, bx + 9, 215, { width: w - 18, align: 'center' });
    });

    // Employee roster
    const rosterY = 262;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text2)
       .text(`${scopeProfiles.length} Employee${scopeProfiles.length !== 1 ? 's' : ''}`, ML, rosterY);
    doc.rect(ML, rosterY + 14, CW, 1).fill(C.border);

    scopeProfiles.slice(0, 9).forEach((p, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const bx  = ML + col * (CW / 3);
      const by  = rosterY + 22 + row * 34;
      const w   = (CW / 3) - 8;
      doc.rect(bx, by, w, 28).fill(C.surface).stroke(C.border).strokeColor(C.border);
      doc.rect(bx, by, 3, 28).fill(roleColor(p.role));
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text)
         .text(p.full_name || p.email, bx + 10, by + 5, { width: w - 14, ellipsis: true });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.text2)
         .text(fmtType(p.role), bx + 10, by + 16, { width: w - 14, ellipsis: true });
    });
    if (scopeProfiles.length > 9) {
      const lastRow = Math.ceil(Math.min(scopeProfiles.length, 9) / 3);
      doc.font('Helvetica').fontSize(8).fillColor(C.muted)
         .text(`+ ${scopeProfiles.length - 9} more`, ML, rosterY + 22 + lastRow * 34 + 4);
    }

    // Bottom labels
    doc.font('Helvetica').fontSize(8).fillColor(C.muted)
       .text(`Generated: ${generatedAt}`, ML, PH - 50, { width: CW, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
       .text('CONFIDENTIAL — FOR INTERNAL USE ONLY', ML, PH - 36, { width: CW, align: 'center' });

    // Bottom accent bar
    doc.rect(0, PH - 5, PW, 5).fill(C.accent);
    addFooter();

    // ─────────────────────────────────────────────────────────────────────────
    // EXECUTIVE SUMMARY
    // ─────────────────────────────────────────────────────────────────────────
    let y = newPage('Executive Summary');

    y = sectionTitle('Key Performance Indicators', y);
    y += 8;

    const kpis = [
      { label: 'Total Activities',  value: totalActs,                  color: C.accent  },
      { label: 'Completed',         value: totals.activitiesCompleted,  color: C.green   },
      { label: 'Pending',           value: totals.activitiesPending,    color: C.yellow  },
      { label: 'Overdue',           value: totals.activitiesOverdue,    color: C.red     },
      { label: 'Meetings',          value: totals.meetingsScheduled,    color: C.purple  },
      { label: 'Calls Made',        value: totals.callsMade,            color: C.accent  },
      { label: 'Emails Sent',       value: totals.emailsSent,           color: C.gray    },
      { label: 'Notes Added',       value: totals.notesAdded,           color: C.gray    },
      { label: 'New Leads',         value: totals.leadsCreated,         color: C.green   },
      { label: 'New Leads (Pipeline)', value: totals.newLeadsFromPipeline, color: C.accent },
      { label: 'Deals Created',     value: totals.dealsCreated,         color: C.purple  },
      { label: 'Leads Converted',   value: totals.leadsConverted,       color: C.accent  },
      { label: 'Deals Won',         value: totals.dealsWon,             color: C.green   },
      { label: 'Revenue',           value: fmtCurrency(totals.revenue), color: C.yellow  },
      { label: 'Tasks Completed',   value: totals.tasksCompleted,       color: C.accent  },
      { label: 'Follow-ups Done',   value: totals.followUpsCompleted,   color: C.green   },
      { label: 'Prospects Added',   value: totals.prospectsAdded,       color: C.accent  },
    ];
    y = statGrid(kpis, y, 4);

    // Performance bars
    if (totalActs > 0 || totals.dealsCreated > 0) {
      y += 12;
      y = sectionTitle('Performance Metrics', y);
      y += 10;
      const bars = [
        { label: 'Activity Completion Rate', pct: totalActs > 0 ? Math.round((totals.activitiesCompleted / totalActs) * 100) : 0, color: C.green  },
        { label: 'Lead Conversion Rate',     pct: (totals.leadsCreated + totals.prospectsAdded) > 0 ? Math.round((totals.leadsConverted / (totals.leadsCreated + totals.prospectsAdded)) * 100) : 0, color: C.accent },
        { label: 'Deal Win Rate',            pct: totals.dealsCreated > 0 ? Math.round((totals.dealsWon / totals.dealsCreated) * 100) : 0, color: C.purple },
      ];
      bars.forEach(m => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text).text(m.label, ML, y, { continued: true });
        doc.font('Helvetica-Bold').fillColor(m.color).text(`  ${m.pct}%`, { align: 'right' });
        y += 14;
        doc.rect(ML, y, CW, 7).fill(C.surface2).stroke(C.border).strokeColor(C.border);
        if (m.pct > 0) doc.rect(ML, y, Math.round(CW * m.pct / 100), 7).fill(m.color);
        y += 13;
      });
    }

    // Team overview table (multi-employee)
    if (scopeProfiles.length > 1) {
      y += 12;
      y = sectionTitle('Team Performance Overview', y);
      y += 6;
      // Cols: 102+70+50+50+40+40+38+38+40+55 = 523
      const empCols = [
        { key: 'name',     label: 'Employee',   width: 102 },
        { key: 'role',     label: 'Role',       width: 70  },
        { key: 'acts',     label: 'Activities', width: 50  },
        { key: 'done',     label: 'Completed',  width: 50  },
        { key: 'calls',    label: 'Calls',      width: 40  },
        { key: 'emails',   label: 'Emails',     width: 40  },
        { key: 'leads',    label: 'Leads',      width: 38  },
        { key: 'pipeline', label: 'Pipeline',   width: 38  },
        { key: 'deals',    label: 'Deals',      width: 40  },
        { key: 'revenue',  label: 'Revenue',    width: 55  },
      ];
      const empRows = scopeProfiles.map(p => {
        const s = statsMap[p.id];
        return {
          name:     p.full_name || p.email,
          role:     fmtType(p.role),
          acts:     s ? (s.activityTimeline || []).length : 0,
          done:     s?.activitiesCompleted ?? 0,
          calls:    s?.callsMade ?? 0,
          emails:   s?.emailsSent ?? 0,
          leads:    s?.leadsCreated ?? 0,
          pipeline: s?.newLeadsFromPipeline ?? 0,
          deals:    s?.dealsCreated ?? 0,
          revenue:  fmtCurrency(s?.revenue ?? 0),
        };
      });
      y = drawTable(empCols, empRows, y, 'Executive Summary');
    }

    // Meetings (aggregate)
    if (meetings && meetings.length > 0) {
      if (y > PH - 120) { y = newPage('Meetings'); } else { y += 14; }
      y = sectionTitle(`Meetings (${meetings.length})`, y);
      y += 6;
      // Cols: 70+100+95+62+56+140 = 523
      const meetCols = [
        { key: 'time',     label: 'Date/Time', width: 70  },
        { key: 'customer', label: 'Customer',  width: 100 },
        { key: 'company',  label: 'Company',   width: 95  },
        { key: 'type',     label: 'Type',      width: 62  },
        { key: 'status',   label: 'Status',    width: 56  },
        { key: 'purpose',  label: 'Purpose',   width: 140 },
      ];
      const mStatusC = s => (s === 'completed' || s === 'done') ? C.green : s === 'cancelled' ? C.red : C.yellow;
      const meetRows = meetings.map(m => ({
        time:     fmtDateTime(m.start_time),
        customer: m.customer_name || m.contact_name || '—',
        company:  m.company_name || '—',
        type:     fmtType(m.meeting_type || '—'),
        status:   { v: fmtType(m.status || 'scheduled'), c: mStatusC(m.status) },
        purpose:  String(m.purpose || m.notes || m.title || '—').substring(0, 60),
      }));
      y = drawTable(meetCols, meetRows, y, 'Meetings');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PER-EMPLOYEE PAGES
    // ─────────────────────────────────────────────────────────────────────────
    scopeProfiles.forEach(p => {
      const s = statsMap[p.id];
      if (!s) return;
      const empLabel = p.full_name || p.email;
      const pActs    = (s.activityTimeline || []).length;

      // ── Employee header ──────────────────────────────────────────────────
      y = newPage(empLabel);

      // Light header card
      doc.rect(ML, y, CW, 52).fill(C.surface2).stroke(C.border).strokeColor(C.border);
      doc.rect(ML, y, 4, 52).fill(roleColor(p.role));

      // Avatar circle
      const av = (p.full_name || p.email || '?')[0].toUpperCase();
      doc.circle(ML + 32, y + 26, 17).fill(roleColor(p.role));
      doc.font('Helvetica-Bold').fontSize(14).fillColor(C.white).text(av, ML + 24, y + 18);

      // Name + role + email
      doc.font('Helvetica-Bold').fontSize(13).fillColor(C.text)
         .text(empLabel, ML + 58, y + 9, { width: CW - 170, ellipsis: true });
      doc.font('Helvetica').fontSize(9).fillColor(roleColor(p.role))
         .text(fmtType(p.role), ML + 58, y + 26, { width: CW - 170 });
      doc.font('Helvetica').fontSize(8).fillColor(C.text2)
         .text(p.email || '—', ML + 58, y + 38, { width: CW - 170 });

      if (s.lastActivityAt) {
        doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
           .text(`Last active: ${fmtDateTime(s.lastActivityAt)}`, PW - MR - 140, y + 28, { width: 136, align: 'right' });
      }
      y += 62;

      // ── 12-stat mini grid ────────────────────────────────────────────────
      const empKpis = [
        { label: 'Activities',    value: pActs,                  color: C.accent  },
        { label: 'Completed',     value: s.activitiesCompleted,  color: C.green   },
        { label: 'Pending',       value: s.activitiesPending,    color: C.yellow  },
        { label: 'Overdue',       value: s.activitiesOverdue,    color: C.red     },
        { label: 'Calls',         value: s.callsMade,            color: C.accent  },
        { label: 'Emails',        value: s.emailsSent,           color: C.gray    },
        { label: 'Leads',         value: s.leadsCreated,         color: C.green   },
        { label: 'New (Pipeline)',value: s.newLeadsFromPipeline, color: C.accent  },
        { label: 'Deals',         value: s.dealsCreated,         color: C.purple  },
        { label: 'Converted',     value: s.leadsConverted,       color: C.accent  },
        { label: 'Deals Won',     value: s.dealsWon,             color: C.green   },
        { label: 'Revenue',       value: fmtCurrency(s.revenue), color: C.yellow  },
        { label: 'Notes',         value: s.notesAdded,           color: C.gray    },
      ];
      y = miniStatGrid(empKpis, y);

      // ── Activity Timeline ────────────────────────────────────────────────
      const timeline = s.activityTimeline || [];
      if (timeline.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 12; }
        y = sectionTitle(`Activity Timeline (${timeline.length})`, y);
        y += 6;
        // Cols: 80+98+110+53+182 = 523
        const actCols = [
          { key: 'time',    label: 'Date/Time', width: 80  },
          { key: 'type',    label: 'Type',      width: 98  },
          { key: 'company', label: 'Company',   width: 110 },
          { key: 'status',  label: 'Status',    width: 53  },
          { key: 'notes',   label: 'Notes',     width: 182 },
        ];
        const actRows = timeline.map(a => ({
          time:    fmtDateTime(a.time),
          type:    fmtType(a.type),
          company: a.companyName !== '—' ? a.companyName : (a.contactName !== '—' ? a.contactName : '—'),
          status:  { v: fmtType(a.status || 'pending'), c: statusColor(a.status) },
          notes:   String(a.description || a.outcome || '—').substring(0, 80),
        }));
        y = drawTable(actCols, actRows, y, empLabel);
      }

      // ── Leads ────────────────────────────────────────────────────────────
      const leads = s.todayLeads || [];
      if (leads.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 12; }
        y = sectionTitle(`Leads (${leads.length})`, y);
        y += 6;
        // Cols: 140+115+90+88+90 = 523
        const leadCols = [
          { key: 'company', label: 'Company', width: 140 },
          { key: 'contact', label: 'Contact', width: 115 },
          { key: 'source',  label: 'Source',  width: 90  },
          { key: 'stage',   label: 'Stage',   width: 88  },
          { key: 'created', label: 'Created', width: 90  },
        ];
        const leadRows = leads.map(l => ({
          company: l.companyName || '—',
          contact: l.contactName || '—',
          source:  l.source || '—',
          stage:   { v: fmtType(l.stage || '—'), c: l.isConverted ? C.green : C.accent },
          created: fmtDate(l.createdAt),
        }));
        y = drawTable(leadCols, leadRows, y, empLabel);
      }

      // ── Deals ────────────────────────────────────────────────────────────
      const deals = s.todayDeals || [];
      if (deals.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 12; }
        y = sectionTitle(`Deals (${deals.length})`, y);
        y += 6;
        // Cols: 130+120+72+85+76+40 = 523
        const dealCols = [
          { key: 'name',    label: 'Deal Name',  width: 130 },
          { key: 'company', label: 'Company',    width: 120 },
          { key: 'value',   label: 'Value',      width: 72  },
          { key: 'stage',   label: 'Stage',      width: 85  },
          { key: 'close',   label: 'Close Date', width: 76  },
          { key: 'status',  label: 'Status',     width: 40  },
        ];
        const dStatusC = st => st === 'won' ? C.green : st === 'lost' ? C.red : C.accent;
        const dealRows = deals.map(d => ({
          name:    d.name || '—',
          company: d.companyName || '—',
          value:   fmtCurrency(d.value),
          stage:   fmtType(d.stage || '—'),
          close:   fmtDate(d.expectedClose),
          status:  { v: fmtType(d.status || 'active'), c: dStatusC(d.status) },
        }));
        y = drawTable(dealCols, dealRows, y, empLabel);
      }

      // ── Follow-ups ───────────────────────────────────────────────────────
      const followUps = s.todayFollowUps || [];
      if (followUps.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 12; }
        y = sectionTitle(`Pending Follow-ups (${followUps.length})`, y);
        y += 6;
        // Cols: 150+128+100+84+61 = 523
        const fuCols = [
          { key: 'company', label: 'Company',  width: 150 },
          { key: 'contact', label: 'Contact',  width: 128 },
          { key: 'type',    label: 'Type',     width: 100 },
          { key: 'due',     label: 'Due Date', width: 84  },
          { key: 'status',  label: 'Status',   width: 61  },
        ];
        const fuRows = followUps.map(f => ({
          company: f.companyName || '—',
          contact: f.contactName || '—',
          type:    fmtType(f.type),
          due:     fmtDate(f.dueDate),
          status:  { v: 'Pending', c: C.yellow },
        }));
        y = drawTable(fuCols, fuRows, y, empLabel);
      }

      // ── Overdue Activities ───────────────────────────────────────────────
      const overdue = s.overdueActivities || [];
      if (overdue.length > 0) {
        if (y > PH - 120) { y = newPage(empLabel); } else { y += 12; }
        y = sectionTitle(`Overdue Activities (${overdue.length})`, y);
        y += 6;
        // Cols: 105+135+115+90+78 = 523
        const overCols = [
          { key: 'type',    label: 'Type',      width: 105 },
          { key: 'company', label: 'Company',   width: 135 },
          { key: 'contact', label: 'Contact',   width: 115 },
          { key: 'due',     label: 'Due Date',  width: 90  },
          { key: 'days',    label: 'Days Late', width: 78  },
        ];
        const overRows = overdue.map(a => ({
          type:    fmtType(a.type),
          company: a.companyName || '—',
          contact: a.contactName || '—',
          due:     fmtDate(a.dueDate),
          days:    { v: a.daysOverdue > 0 ? `${a.daysOverdue}d` : '—', c: C.red },
        }));
        y = drawTable(overCols, overRows, y, empLabel);
      }
    });

    addFooter();
    doc.end();
  });
}

module.exports = { generateFrontendDsrPdf };
