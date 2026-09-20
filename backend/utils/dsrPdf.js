'use strict';
const PDFDocument = require('pdfkit');

// ── B&W Palette ────────────────────────────────────────────────────────────────
const C = {
  black   : '#000000',
  text    : '#0F172A',
  gray    : '#475569',
  lightGray: '#94A3B8',
  border  : '#D1D5DB',
  rowAlt  : '#F8FAFC',
  headBg  : '#F1F5F9',
  white   : '#FFFFFF',
};

// A4 dimensions in points
const PW = 595.28, PH = 841.89, ML = 36, MR = 36;
const CW = PW - ML - MR; // 523.28

// Helpers
const fmt  = v  => String(v == null ? 0 : v);
const rl   = r  => (r || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const fmtR = v  => {
  const n = Number(v) || 0;
  if (!n) return 'Rs. 0';
  if (n >= 10000000) return `Rs. ${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `Rs. ${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `Rs. ${(n / 1000).toFixed(1)}K`;
  return `Rs. ${n}`;
};
const conv = (w, l) => (w + l) > 0 ? `${Math.round((w / (w + l)) * 100)}%` : '-';

// Table columns — widths must sum to CW (523)
const COLS = [
  { label: 'Name / Role', w: 147, align: 'left'   },
  { label: 'Leads',       w:  38, align: 'center' },
  { label: 'Calls',       w:  38, align: 'center' },
  { label: 'Emails',      w:  38, align: 'center' },
  { label: 'Meets',       w:  38, align: 'center' },
  { label: 'F/U',         w:  32, align: 'center' },
  { label: 'Tasks',       w:  32, align: 'center' },
  { label: 'Deals',       w:  32, align: 'center' },
  { label: 'Won',         w:  30, align: 'center' },
  { label: 'Lost',        w:  30, align: 'center' },
  { label: 'Conv%',       w:  36, align: 'center' },
  { label: 'Score',       w:  32, align: 'center' },
];

function generateDSRPdf({ staff, userStats, totals, reportDateLabel, reportType, generatedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
    });

    const bufs = [];
    doc.on('data',  b => bufs.push(b));
    doc.on('end',   () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const typeLabel = (reportType || 'Daily')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    const genStr = new Date(generatedAt || Date.now()).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) + ' IST';

    // ── HEADER ─────────────────────────────────────────────────────────────────
    doc.rect(0, 0, PW, 86).fill(C.white);
    doc.rect(0, 0, PW, 86).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.rect(0, 83, PW, 3).fill(C.black);

    doc.font('Helvetica-Bold').fontSize(22).fillColor(C.black)
       .text('SALES CRM', ML, 18);
    doc.font('Helvetica').fontSize(9).fillColor(C.lightGray)
       .text(typeLabel.toUpperCase() + ' SALES REPORT', ML, 46);

    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.text)
       .text(reportDateLabel, 0, 18, { width: PW - MR, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(C.lightGray)
       .text('Generated: ' + genStr, 0, 44, { width: PW - MR, align: 'right' });

    let y = 100;

    // ── SUMMARY STATS ROW 1 ────────────────────────────────────────────────────
    const GAP = 6;
    const BW  = (CW - GAP * 5) / 6;
    const BH  = 48;

    const row1 = [
      { l: 'Sales Staff',      v: fmt(totals.totalStaff)   },
      { l: 'Leads Today',      v: fmt(totals.leadsToday)   },
      { l: 'Total Activities', v: fmt(totals.activities)   },
      { l: 'Deals Created',    v: fmt(totals.dealsCreated) },
      { l: 'Deals Won',        v: fmt(totals.dealsWon)     },
      { l: 'Revenue Won',      v: fmtR(totals.revenueWon)  },
    ];

    row1.forEach((s, i) => {
      const x = ML + i * (BW + GAP);
      doc.rect(x, y, BW, BH).fill(C.white).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.rect(x, y, BW, 2).fill(C.black);
      const fs = s.v.length > 7 ? 11 : 17;
      doc.font('Helvetica-Bold').fontSize(fs).fillColor(C.text)
         .text(s.v, x, y + (fs < 14 ? 10 : 7), { width: BW, align: 'center' });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.lightGray)
         .text(s.l, x, y + 36, { width: BW, align: 'center' });
    });
    y += BH + GAP;

    // ── SUMMARY STATS ROW 2 ────────────────────────────────────────────────────
    const SBH = 34;
    const row2 = [
      { l: 'Calls',           v: fmt(totals.calls) },
      { l: 'Emails',          v: fmt(totals.emails) },
      { l: 'Meetings',        v: fmt(totals.meetings) },
      { l: 'Follow-ups',      v: fmt(totals.followUpsCompleted) },
      { l: 'Tasks Completed', v: fmt(totals.tasks) },
      { l: 'Conversion Rate', v: conv(totals.dealsWon, totals.dealsLost) },
    ];

    row2.forEach((s, i) => {
      const x = ML + i * (BW + GAP);
      doc.rect(x, y, BW, SBH).fill(C.rowAlt).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.font('Helvetica-Bold').fontSize(13).fillColor(C.text)
         .text(s.v, x, y + 4, { width: BW, align: 'center' });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.lightGray)
         .text(s.l, x, y + 21, { width: BW, align: 'center' });
    });
    y += SBH + 14;

    // ── TABLE TITLE ────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.text)
       .text('Team Performance — Individual Breakdown', ML, y);
    y += 14;

    const TH = 21;
    const TR = 20;

    const drawTHead = (atY) => {
      doc.rect(ML, atY, CW, TH).fill(C.black);
      let cx = ML;
      COLS.forEach(c => {
        doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white)
           .text(c.label, cx + 2, atY + 7, {
             width: c.w - 4,
             align: c.align === 'left' ? 'left' : 'center',
             lineBreak: false,
           });
        cx += c.w;
      });
    };

    drawTHead(y);
    y += TH;

    // ── DATA ROWS ─────────────────────────────────────────────────────────────
    (staff || []).forEach((s, ri) => {
      const u = userStats[s.id];
      if (!u) return;

      if (y + TR > PH - 44) {
        doc.addPage();
        y = 36;
        drawTHead(y);
        y += TH;
      }

      const bg = u.role === 'sales_head' ? '#F1F5F9' : (ri % 2 === 0 ? C.white : C.rowAlt);
      doc.rect(ML, y, CW, TR).fill(bg).strokeColor(C.border).lineWidth(0.3).stroke();

      let cx = ML;
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.text)
         .text(u.name, cx + 3, y + 3, { width: COLS[0].w - 6, lineBreak: false });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.lightGray)
         .text(rl(u.role), cx + 3, y + 12, { width: COLS[0].w - 6, lineBreak: false });
      cx += COLS[0].w;

      const vals = [
        fmt(u.leadsToday), fmt(u.calls), fmt(u.emails), fmt(u.meetings),
        fmt(u.followUpsCompleted), fmt(u.tasks), fmt(u.dealsCreated),
        fmt(u.dealsWon), fmt(u.dealsLost), conv(u.dealsWon, u.dealsLost), fmt(u.score),
      ];
      vals.forEach((v, vi) => {
        const col = COLS[vi + 1];
        doc.font('Helvetica').fontSize(8).fillColor(C.text)
           .text(v, cx + 2, y + 7, { width: col.w - 4, align: 'center', lineBreak: false });
        cx += col.w;
      });
      y += TR;
    });

    // ── TOTALS ROW ─────────────────────────────────────────────────────────────
    if (y + TR > PH - 44) { doc.addPage(); y = 36; }
    doc.rect(ML, y, CW, TR).fill(C.headBg).strokeColor(C.border).lineWidth(0.5).stroke();

    let cx = ML;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.text)
       .text('TEAM TOTAL', cx + 3, y + 7, { width: COLS[0].w - 6, lineBreak: false });
    cx += COLS[0].w;

    [
      fmt(totals.leadsToday), fmt(totals.calls), fmt(totals.emails), fmt(totals.meetings),
      fmt(totals.followUpsCompleted), fmt(totals.tasks), fmt(totals.dealsCreated),
      fmt(totals.dealsWon), fmt(totals.dealsLost),
      conv(totals.dealsWon, totals.dealsLost), '-',
    ].forEach((v, vi) => {
      const col = COLS[vi + 1];
      doc.font('Helvetica-Bold').fontSize(8).fillColor(C.text)
         .text(v, cx + 2, y + 7, { width: col.w - 4, align: 'center', lineBreak: false });
      cx += col.w;
    });
    y += TR + 12;

    // ── REVENUE BANNER ─────────────────────────────────────────────────────────
    if (y + 22 > PH - 44) { doc.addPage(); y = 36; }
    doc.rect(ML, y, CW, 22).fill(C.headBg).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text)
       .text(
         `Revenue Won: ${fmtR(totals.revenueWon)}`
         + `   |   Deals Won: ${fmt(totals.dealsWon)} of ${fmt(totals.dealsCreated)} Created`
         + `   |   Sales Heads: ${fmt(totals.salesHeads)}   Inside Sales: ${fmt(totals.insideSales)}`,
         ML + 6, y + 7,
         { width: CW - 12, lineBreak: false },
       );
    y += 22;

    // ── FOOTER ON EVERY PAGE ──────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const fy = PH - 24;
      doc.rect(0, fy, PW, 24).fill(C.headBg).strokeColor(C.border).lineWidth(0.3).stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor(C.lightGray)
         .text('Sales CRM', ML, fy + 8);
      doc.font('Helvetica').fontSize(7.5).fillColor(C.lightGray)
         .text(`Page ${i + 1} of ${range.count}`, 0, fy + 8, { width: PW, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor(C.lightGray)
         .text('Confidential — Internal Use Only', PW - MR - 160, fy + 8, { width: 160, align: 'right' });
    }

    doc.flushPages();
    doc.end();
  });
}

// ─── Per-employee clean B&W professional DSR PDF ─────────────────────────────
function generateActivityPdf({ employeeData, staff, reportDateLabel, reportType, generatedAt }) {
  return new Promise((resolve, reject) => {
    try {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, bufferPages: true, autoFirstPage: true });
    const bufs = [];
    doc.on('data', b => bufs.push(b));
    doc.on('end',  () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    // Layout
    const PW = 595.28, PH = 841.89;
    const ML = 40, MR = 40, CW = PW - ML - MR;
    const HDR_H = 70, FTR_H = 36, CS = HDR_H + 16;

    // B&W Colors
    const BLACK   = '#000000';
    const DARK    = '#0F172A';
    const MED_C   = '#475569';
    const LIGHT_C = '#94A3B8';
    const BG1     = '#F8FAFC';
    const BG2     = '#F1F5F9';
    const WHITE   = '#FFFFFF';
    const BORDER  = '#D1D5DB';

    // Helpers
    const fmtR = v => { const n=Number(v)||0; if(!n) return 'Rs. 0'; if(n>=10000000) return `Rs. ${(n/10000000).toFixed(1)}Cr`; if(n>=100000) return `Rs. ${(n/100000).toFixed(1)}L`; if(n>=1000) return `Rs. ${(n/1000).toFixed(1)}K`; return `Rs. ${n}`; };
    const rlbl = r => r==='owner'?'Super Admin':r==='sales_head'?'Sales Head':r==='inside_sales'?'Inside Sales':(r||'Staff').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const ts = d => d ? new Date(d).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}) : '-';
    const trunc = (s,n=38) => { const str=String(s||'-'); return str.length>n?str.slice(0,n)+'...':str; };
    const slbl = s => { const l=(s||'').toLowerCase(); if(['done','completed','complete'].includes(l)) return 'Done'; if(['pending','todo'].includes(l)) return 'Pending'; if(l.includes('progress')) return 'In Progress'; return s?s.charAt(0).toUpperCase()+s.slice(1):'-'; };
    const scol = s => { const l=(s||'').toLowerCase(); if(['done','completed','complete'].includes(l)) return DARK; return LIGHT_C; };
    const TYPE_LBL = {call:'Call',phone_call:'Call',outbound_call:'Outbound Call',inbound_call:'Inbound Call',follow_up:'Follow-up',follow_up_call:'F/U Call',follow_up_email:'F/U Email',email:'Email',email_sent:'Email',email_received:'Email',meeting:'Meeting',meeting_virtual:'Virtual Mtg',meeting_person:'In-Person Mtg',virtual_meeting:'Virtual Mtg',in_person:'In-Person Mtg',linkedin_connect:'LinkedIn',linkedin_message:'LinkedIn',linkedin_follow_up:'LinkedIn F/U',note:'Note',task:'Task',task_created:'Task',reminder:'Reminder',whatsapp:'WhatsApp',whatsapp_message:'WhatsApp',whatsapp_follow_up:'WhatsApp F/U',visit:'Client Visit',client_visit:'Client Visit'};
    const tlbl = t => TYPE_LBL[(t||'').toLowerCase().replace(/[-\s]/g,'_')] || (t||'Activity').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const genStr = new Date(generatedAt||Date.now()).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' IST';
    const rtLabel = (reportType||'Daily').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

    // Page state
    let y = CS;
    let currentEmpName = '';

    // ── Page header (B&W) ─────────────────────────────────────────────────
    const drawHeader = (empName) => {
      doc.rect(0,0,PW,HDR_H).fill(WHITE);
      doc.rect(0,0,PW,HDR_H).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.rect(0,HDR_H-3,PW,3).fill(BLACK);
      doc.font('Helvetica-Bold').fontSize(17).fillColor(BLACK).text('SALES CRM',ML,14,{lineBreak:false});
      doc.font('Helvetica').fontSize(8).fillColor(LIGHT_C).text('CRM',ML+79,18,{lineBreak:false});
      doc.font('Helvetica').fontSize(8.5).fillColor(MED_C).text(`${rtLabel} Sales Report`,ML,37,{lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(DARK).text(reportDateLabel,PW-MR-200,14,{width:200,align:'right',lineBreak:false});
      if (empName) doc.font('Helvetica').fontSize(8).fillColor(MED_C).text(empName,PW-MR-200,32,{width:200,align:'right',lineBreak:false});
      doc.font('Helvetica').fontSize(7).fillColor(LIGHT_C).text(`Generated: ${genStr}`,PW-MR-200,48,{width:200,align:'right',lineBreak:false});
    };
    drawHeader('');

    // ── Page break check ──────────────────────────────────────────────────
    const nb = (need) => {
      if (y + need > PH - FTR_H - 12) { doc.addPage(); drawHeader(currentEmpName); y = CS; }
    };

    // ── Section heading (B&W) ─────────────────────────────────────────────
    const sh = (title) => {
      nb(34);
      doc.rect(ML,y,4,22).fill(BLACK);
      doc.rect(ML+4,y,CW-4,22).fill(BG1).strokeColor(BORDER).lineWidth(0.4).stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(title.toUpperCase(),ML+14,y+7,{lineBreak:false});
      y += 28;
    };

    // ── KPI card grid (B&W) ───────────────────────────────────────────────
    const kpiGrid = (items, perRow=4) => {
      const gap=5, cardW=(CW-gap*(perRow-1))/perRow, cardH=56;
      let col=0, rowStart=y;
      items.forEach(item => {
        if (col===0) { nb(cardH+gap); rowStart=y; }
        const x = ML+col*(cardW+gap);
        doc.rect(x,rowStart,cardW,cardH).fill(WHITE).strokeColor(BORDER).lineWidth(0.5).stroke();
        doc.rect(x,rowStart,cardW,3).fill(BLACK);
        doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK).text(String(item.value??0),x+8,rowStart+9,{width:cardW-16,lineBreak:false});
        doc.font('Helvetica').fontSize(7).fillColor(MED_C).text(item.label,x+8,rowStart+34,{width:cardW-16,lineBreak:false});
        col++;
        if (col>=perRow) { col=0; y=rowStart+cardH+gap; }
      });
      if (col>0) y = rowStart+cardH+gap;
      y += 6;
    };

    // ── Table (B&W) ───────────────────────────────────────────────────────
    const tbl = (cols, rows, emptyMsg='No data available.') => {
      const totalW = cols.reduce((s,c)=>s+c.w,0);
      const xs=[]; let cx=ML; cols.forEach(c=>{xs.push(cx);cx+=c.w;});
      nb(22);
      doc.rect(ML,y,totalW,22).fill(BLACK);
      cols.forEach((c,i) => doc.font('Helvetica-Bold').fontSize(7.5).fillColor(WHITE).text(c.label,xs[i]+4,y+7,{width:c.w-6,lineBreak:false,align:c.align||'left'}));
      y += 22;
      if (!rows.length) {
        nb(28);
        doc.rect(ML,y,totalW,28).fill(BG1).strokeColor(BORDER).lineWidth(0.4).stroke();
        doc.font('Helvetica').fontSize(8.5).fillColor(LIGHT_C).text(emptyMsg,ML,y+9,{width:totalW,align:'center',lineBreak:false});
        y += 34; return;
      }
      rows.forEach((row,ri) => {
        nb(20);
        doc.rect(ML,y,totalW,20).fill(ri%2===0?WHITE:BG1).strokeColor(BORDER).lineWidth(0.3).stroke();
        cols.forEach((c,i) => {
          const raw = typeof c.key==='function' ? c.key(row,ri) : (row[c.key]??'-');
          const val = trunc(raw, c.max||40);
          const color = c.color ? c.color(row) : DARK;
          doc.font(c.bold?'Helvetica-Bold':'Helvetica').fontSize(7.5).fillColor(color).text(String(val),xs[i]+4,y+6,{width:c.w-6,lineBreak:false,align:c.align||'left'});
        });
        y += 20;
      });
      y += 8;
    };

    // ─── PER-EMPLOYEE LOOP ────────────────────────────────────────────────
    const effectiveStaff = (staff||[]).filter(s=>employeeData[s.id]);
    if (!effectiveStaff.length) {
      doc.font('Helvetica').fontSize(12).fillColor(LIGHT_C).text('No employee data available.',ML,CS+40,{width:CW,align:'center'});
      doc.flushPages(); doc.end(); return;
    }
    for (let empIdx=0; empIdx<effectiveStaff.length; empIdx++) {
      const s = effectiveStaff[empIdx];
      const { activities=[], newLeads=[], leadMap={}, stats={}, cat={} } = employeeData[s.id]||{};
      currentEmpName = s.full_name||s.email||'Employee';

      if (empIdx > 0) { doc.addPage(); y = CS; }
      drawHeader(currentEmpName);
      y = CS;

      // ── Employee identity card (B&W) ──────────────────────────────────
      nb(70);
      doc.rect(ML,y,CW,62).fill(BG2).strokeColor(BORDER).lineWidth(0.7).stroke();
      doc.rect(ML,y,4,62).fill(BLACK);
      doc.circle(ML+36,y+31,20).fill(BLACK);
      doc.font('Helvetica-Bold').fontSize(15).fillColor(WHITE).text(currentEmpName.charAt(0).toUpperCase(),ML+28,y+20,{lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(13).fillColor(DARK).text(currentEmpName,ML+66,y+8,{lineBreak:false});
      doc.font('Helvetica').fontSize(8.5).fillColor(MED_C).text(rlbl(s.role),ML+66,y+26,{lineBreak:false});
      doc.font('Helvetica').fontSize(8).fillColor(LIGHT_C).text(s.email||'',ML+66,y+42,{lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(22).fillColor(DARK).text(String(stats.total||0),PW-MR-130,y+6,{width:80,align:'right',lineBreak:false});
      doc.font('Helvetica').fontSize(7.5).fillColor(MED_C).text('Total Activities',PW-MR-130,y+32,{width:80,align:'right',lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(13).fillColor(MED_C).text(`${stats.efficiency||0}%`,PW-MR-44,y+6,{width:44,align:'right',lineBreak:false});
      doc.font('Helvetica').fontSize(7).fillColor(LIGHT_C).text('Score',PW-MR-44,y+26,{width:44,align:'right',lineBreak:false});
      y += 70;

      // ── 1. Executive Summary ─────────────────────────────────────────────
      sh('Executive Summary');
      kpiGrid([
        {label:'Total Activities',   value:stats.total||0          },
        {label:'Calls',              value:stats.calls||0          },
        {label:'Follow-ups',         value:stats.followUps||0      },
        {label:'Emails',             value:stats.emails||0         },
        {label:'LinkedIn',           value:stats.linkedin||0       },
        {label:'Meetings',           value:stats.meetings||0       },
        {label:'Tasks',              value:stats.tasks||0          },
        {label:'Notes',              value:stats.notes||0          },
        {label:'New Leads',          value:stats.newLeads||0       },
        {label:'Revenue Won',        value:fmtR(stats.revenue)     },
        {label:'Productivity Score', value:`${stats.efficiency||0}%`},
      ], 4);

      // ── 2. Daily Summary ─────────────────────────────────────────────────
      sh('Daily Summary');
      nb(60);
      const parts=[];
      if (stats.calls>0)     parts.push(`${stats.calls} call${stats.calls!==1?'s':''}`);
      if (stats.emails>0)    parts.push(`${stats.emails} email${stats.emails!==1?'s':''}`);
      if (stats.meetings>0)  parts.push(`${stats.meetings} meeting${stats.meetings!==1?'s':''}`);
      if (stats.followUps>0) parts.push(`${stats.followUps} follow-up${stats.followUps!==1?'s':''}`);
      if (stats.linkedin>0)  parts.push(`${stats.linkedin} LinkedIn interaction${stats.linkedin!==1?'s':''}`);
      if (stats.tasks>0)     parts.push(`${stats.tasks} task${stats.tasks!==1?'s':''}`);
      if (stats.notes>0)     parts.push(`${stats.notes} note${stats.notes!==1?'s':''}`);
      let summary = `${currentEmpName} completed ${stats.completed||0} of ${stats.total||0} activities (${stats.efficiency||0}% productivity) during the ${rtLabel.toLowerCase()} period: ${reportDateLabel}.`;
      if (parts.length) summary += ` Activities included ${parts.join(', ')}.`;
      if (stats.newLeads>0) summary += ` ${stats.newLeads} new lead${stats.newLeads!==1?'s':''} added.`;
      if (stats.dealsWon>0) summary += ` ${stats.dealsWon} deal${stats.dealsWon!==1?'s':''} won worth ${fmtR(stats.revenue)}.`;
      if (stats.pending>0) summary += ` ${stats.pending} activit${stats.pending!==1?'ies':'y'} remain pending.`;
      doc.font('Helvetica').fontSize(9.5).fillColor(DARK).text(summary, ML+8, y+4, {width:CW-16,lineBreak:true,lineGap:2});
      y = doc.y + 14;

      // ── 3. Activity Timeline ─────────────────────────────────────────────
      sh('Activity Timeline');
      const descW = CW - 52 - 100 - 140 - 72;
      tbl(
        [
          {label:'Time',           key:a=>ts(a.created_at),                                     w:52 },
          {label:'Activity Type',  key:a=>tlbl(a.type),                                         w:100},
          {label:'Lead / Company', key:a=>{ const l=leadMap[a.lead_id]; return l?(l.contact_name||l.company_name||'-'):'-'; }, w:140, max:28},
          {label:'Description',    key:a=>trunc(a.title||a.description||'',35),                 w:descW},
          {label:'Status',         key:a=>slbl(a.status), w:72, color:a=>scol(a.status), bold:true},
        ],
        activities,
        'No activities recorded for this period.'
      );

      // ── 4. Lead Summary ──────────────────────────────────────────────────
      sh('Lead Summary');
      const allLeads = [...new Map(
        (activities||[]).filter(a=>a.lead_id&&leadMap[a.lead_id]).map(a=>[a.lead_id,leadMap[a.lead_id]])
      ).values()];
      if (allLeads.length) {
        tbl(
          [
            {label:'Company', key:l=>l.company_name||'-',                                          w:140, max:26},
            {label:'Contact', key:l=>l.contact_name||'-',                                         w:120, max:22},
            {label:'Stage',   key:l=>(l.stage||'-').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()), w:100, max:18},
            {label:'Status',  key:l=>(l.status||'-').replace(/\b\w/g,c=>c.toUpperCase()),         w:90, max:16},
            {label:'Email',   key:l=>l.email||'-',                                                w:CW-140-120-100-90, max:24},
          ],
          allLeads
        );
      } else {
        nb(34);
        doc.rect(ML,y,CW,32).fill(BG1).strokeColor(BORDER).lineWidth(0.4).stroke();
        doc.font('Helvetica').fontSize(9).fillColor(LIGHT_C).text('No Leads Available',ML,y+11,{width:CW,align:'center',lineBreak:false});
        y += 40;
      }

      // ── 5. Communication Summary ─────────────────────────────────────────
      sh('Communication Summary');
      kpiGrid([
        {label:'Calls',      value:stats.calls||0   },
        {label:'Emails',     value:stats.emails||0  },
        {label:'LinkedIn',   value:stats.linkedin||0},
        {label:'Meetings',   value:stats.meetings||0},
        {label:'Follow-ups', value:stats.followUps||0},
        {label:'Notes',      value:stats.notes||0   },
        {label:'Tasks',      value:stats.tasks||0   },
        {label:'WhatsApp',   value:stats.whatsapp||0},
      ], 4);

      // ── 6. Performance Summary ───────────────────────────────────────────
      sh('Performance Summary');
      const fuRate = stats.total>0 ? Math.round(((stats.followUps||0)/stats.total)*100) : 0;
      kpiGrid([
        {label:'Completed Activities', value:stats.completed||0        },
        {label:'Pending Activities',   value:stats.pending||0          },
        {label:'Overdue',              value:stats.overdue||0          },
        {label:'Follow-up Rate',       value:`${fuRate}%`              },
        {label:'Conversion Rate',      value:`${stats.convRate||0}%`   },
        {label:'Productivity Score',   value:`${stats.efficiency||0}%` },
      ], 3);

      y += 8;
    }

    // ── Footer on every page ─────────────────────────────────────────────────
    doc.flushPages();
    const range = doc.bufferedPageRange();
    for (let i=0; i<range.count; i++) {
      doc.switchToPage(range.start+i);
      const fy = PH - FTR_H;
      doc.rect(0,fy,PW,FTR_H).fill(BG1).strokeColor(BORDER).lineWidth(0.3).stroke();
      doc.rect(0,fy,PW,1).fill(BLACK);
      doc.font('Helvetica').fontSize(7.5).fillColor(LIGHT_C).text('Generated by Sales CRM  |  Employee-Wise Daily Sales Report',ML,fy+8,{lineBreak:false});
      doc.font('Helvetica').fontSize(7).fillColor(LIGHT_C).text(`Generated: ${genStr}`,ML,fy+20,{lineBreak:false});
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(DARK).text(`Page ${i+1} of ${range.count}`,PW-MR-80,fy+11,{width:80,align:'right',lineBreak:false});
    }
    doc.end();
    } catch(err) { reject(err); }
  });
}

// ─── Enterprise multi-section DSR PDF ─────────────────────────────────────────
// Used by role-dsr-cron. Includes all 9 sections per master spec:
// Executive Summary / New Leads / Updated Leads / Activity Summary /
// Meetings / Calls / Emails / Pipeline & Deals / Employee Performance
function generateEnterpriseDSRPdf({ employeeData, staff, reportDateLabel, recipientRole, recipientName, generatedAt }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top:0,bottom:0,left:0,right:0 }, bufferPages: true, autoFirstPage: true });
      const bufs = [];
      doc.on('data', b => bufs.push(b));
      doc.on('end',  () => resolve(Buffer.concat(bufs)));
      doc.on('error', reject);

      const PW=595.28, PH=841.89, ML=36, MR=36, CW=PW-ML-MR;
      const HDR_H=72, FTR_H=28, CS=HDR_H+16;

      const NAVY='#1E3A5F', DARK='#0F172A', MED='#475569', LIGHT='#94A3B8';
      const BDR='#E2E8F0', BG1='#F8FAFC', BG2='#F1F5F9', WHITE='#FFFFFF';
      const GREEN='#059669', AMBER='#D97706', ERED='#DC2626';

      const pad  = n => String(n||0).padStart(2,'0');
      const ist  = ts => ts ? new Date(new Date(ts).getTime()+5.5*60*60*1000) : null;
      const fmtD = ts => { const d=ist(ts); return d?`${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}`:'—'; };
      const fmtT = ts => { const d=ist(ts); if(!d) return '—'; const h=d.getUTCHours(),m=d.getUTCMinutes(); return `${pad(h%12||12)}:${pad(m)} ${h<12?'AM':'PM'}`; };
      const fmtDT= ts => ts ? fmtD(ts)+' '+fmtT(ts) : '—';
      const tr   = (s,n=28) => { const x=String(s||'—'); return x.length>n?x.slice(0,n)+'…':x; };
      const rl   = r => r==='owner'?'Super Admin':r==='sales_head'?'Sales Head':r==='sales_manager'?'Sales Manager':r==='inside_sales'?'Inside Sales':r==='sales_employee'?'Sales Employee':(r||'Staff').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
      const sl   = s => { const l=(s||'').toLowerCase(); return l==='done'||l==='completed'||l==='complete'?'Done':l==='pending'||l==='todo'?'Pending':l.includes('progress')?'In Prog.':s?(s.charAt(0).toUpperCase()+s.slice(1)):'—'; };
      const isDone=s=>['done','completed','complete'].includes((s||'').toLowerCase());
      const TMAP = {call:'Call',phone_call:'Call',outbound_call:'Out. Call',inbound_call:'In. Call',follow_up:'Follow-up',follow_up_call:'F/U Call',follow_up_email:'F/U Email',email:'Email',email_sent:'Email',email_received:'Email',meeting:'Meeting',meeting_virtual:'Virtual Mtg',meeting_person:'In-Person',virtual_meeting:'Virtual Mtg',in_person:'In-Person',note:'Note',task:'Task',task_created:'Task',reminder:'Reminder',whatsapp:'WhatsApp',whatsapp_message:'WhatsApp',whatsapp_follow_up:'WhatsApp',visit:'Visit',client_visit:'Visit',linkedin_connect:'LinkedIn',linkedin_message:'LinkedIn',linkedin_follow_up:'LinkedIn'};
      const tl   = t => TMAP[(t||'').toLowerCase().replace(/[-\s]/g,'_')]||(t||'Activity').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
      const fmtR = v => { const n=Number(v)||0; if(!n) return '—'; if(n>=10000000) return `₹${(n/10000000).toFixed(1)}Cr`; if(n>=100000) return `₹${(n/100000).toFixed(1)}L`; if(n>=1000) return `₹${(n/1000).toFixed(1)}K`; return `₹${n}`; };
      const genStr = new Date(generatedAt||Date.now()).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+' IST';
      const CALL_T=new Set(['call','phone_call','outbound_call','inbound_call','follow_up_call']);
      const EMAIL_T=new Set(['email','email_sent','email_received','follow_up_email']);
      const MTG_T=new Set(['meeting','meeting_virtual','meeting_person','virtual_meeting','in_person']);
      const t2   = t=>(t||'').toLowerCase().replace(/[-\s]/g,'_');

      // ── Aggregate across scoped staff ─────────────────────────────────────────
      let tLeads=0,tActs=0,tMtg=0,tCalls=0,tEmails=0,tPend=0,tDone=0,tOver=0,tDeals=0;
      const allNew=[], allUpd=[], allActs=[], allDeals=[];
      for (const s of staff) {
        const ed = employeeData[s.id]; if (!ed) continue;
        const lm = ed.leadMap||{};
        const nm = s.full_name||s.email;
        tLeads+=ed.stats.newLeads||0; tActs+=ed.stats.total||0; tMtg+=ed.stats.meetings||0;
        tCalls+=ed.stats.calls||0; tEmails+=ed.stats.emails||0; tPend+=ed.stats.pending||0;
        tDone+=ed.stats.completed||0; tOver+=ed.stats.overdue||0; tDeals+=ed.stats.dealsCreated||0;
        (ed.newLeads||[]).forEach(l=>allNew.push({...l,_by:nm,lm}));
        (ed.updatedLeads||[]).forEach(l=>allUpd.push({...l,_by:nm,lm}));
        (ed.activities||[]).forEach(a=>allActs.push({...a,_emp:nm,lm}));
        (ed.deals||[]).forEach(d=>allDeals.push({...d,_emp:nm}));
      }
      const allMtg   = allActs.filter(a=>MTG_T.has(t2(a.type)));
      const allCalls = allActs.filter(a=>CALL_T.has(t2(a.type)));
      const allEmails= allActs.filter(a=>EMAIL_T.has(t2(a.type)));

      // ── Layout state ─────────────────────────────────────────────────────────
      let y = CS;

      // ── Draw page header ──────────────────────────────────────────────────────
      const drawHeader = () => {
        doc.rect(0,0,PW,HDR_H).fill(NAVY);
        doc.font('Helvetica-Bold').fontSize(19).fillColor(WHITE).text('SALES CRM',ML,13,{lineBreak:false});
        doc.font('Helvetica').fontSize(7).fillColor('#94A3B8').text('CRM',ML+88,18,{lineBreak:false});
        doc.font('Helvetica').fontSize(8).fillColor('#CBD5E1').text('DAILY SALES REPORT',ML,39,{lineBreak:false});
        doc.font('Helvetica-Bold').fontSize(10).fillColor(WHITE).text(reportDateLabel,PW-MR-220,13,{width:220,align:'right',lineBreak:false});
        if (recipientName) doc.font('Helvetica').fontSize(8).fillColor('#94A3B8').text(`${tr(recipientName,24)} · ${rl(recipientRole)}`,PW-MR-220,31,{width:220,align:'right',lineBreak:false});
        doc.font('Helvetica').fontSize(7).fillColor('#64748B').text(`Generated: ${genStr}`,PW-MR-220,49,{width:220,align:'right',lineBreak:false});
      };
      drawHeader();

      // ── Page-break check ──────────────────────────────────────────────────────
      const nb = need => {
        if (y+need > PH-FTR_H-14) { doc.addPage(); drawHeader(); y=CS; }
      };

      // ── Section title ─────────────────────────────────────────────────────────
      const sh = title => {
        nb(36);
        doc.rect(ML,y,4,22).fill(NAVY);
        doc.rect(ML+4,y,CW-4,22).fill(BG2).strokeColor(BDR).lineWidth(0.4).stroke();
        doc.font('Helvetica-Bold').fontSize(9).fillColor(DARK).text(title.toUpperCase(),ML+12,y+7,{lineBreak:false});
        y+=28;
      };

      // ── KPI card grid ─────────────────────────────────────────────────────────
      const kpiGrid = (items,perRow=5) => {
        const gap=5, cardW=(CW-gap*(perRow-1))/perRow, cardH=56;
        let col=0,rx=y;
        for (const item of items) {
          if(col===0){nb(cardH+gap);rx=y;}
          const x=ML+col*(cardW+gap);
          doc.rect(x,rx,cardW,cardH).fill(WHITE).strokeColor(BDR).lineWidth(0.5).stroke();
          doc.rect(x,rx,cardW,3).fill(NAVY);
          doc.font('Helvetica-Bold').fontSize(17).fillColor(DARK).text(String(item.value??0),x+7,rx+7,{width:cardW-14,lineBreak:false});
          doc.font('Helvetica').fontSize(6.5).fillColor(MED).text(item.label,x+7,rx+36,{width:cardW-14,lineBreak:false});
          col++; if(col>=perRow){col=0;y=rx+cardH+gap;}
        }
        if(col>0) y=rx+cardH+gap;
        y+=8;
      };

      // ── Table ─────────────────────────────────────────────────────────────────
      const RH=21;
      const tbl = (cols,rows,empty='No data for this period.') => {
        const totalW=cols.reduce((s,c)=>s+c.w,0);
        const xs=[]; let cx=ML; cols.forEach(c=>{xs.push(cx);cx+=c.w;});
        nb(RH+2);
        doc.rect(ML,y,totalW,RH).fill(DARK);
        cols.forEach((c,i)=>doc.font('Helvetica-Bold').fontSize(7).fillColor(WHITE).text(c.label,xs[i]+3,y+7,{width:c.w-6,lineBreak:false,align:c.align||'left'}));
        y+=RH;
        if(!rows.length){
          nb(RH); doc.rect(ML,y,totalW,RH).fill(BG1).strokeColor(BDR).lineWidth(0.3).stroke();
          doc.font('Helvetica').fontSize(8).fillColor(LIGHT).text(empty,ML,y+7,{width:totalW,align:'center',lineBreak:false});
          y+=RH+10; return;
        }
        rows.forEach((row,ri)=>{
          nb(RH);
          doc.rect(ML,y,totalW,RH).fill(ri%2?BG1:WHITE).strokeColor(BDR).lineWidth(0.3).stroke();
          row.forEach((cell,ci)=>{
            const col=cols[ci];
            const txt=String(cell?.text??cell??'—');
            const clr=cell?.color||DARK;
            doc.font(cell?.bold?'Helvetica-Bold':'Helvetica').fontSize(7.5).fillColor(clr)
              .text(txt,xs[ci]+3,y+7,{width:col.w-6,lineBreak:false,align:col.align||'left'});
          });
          y+=RH;
        });
        y+=10;
      };

      // ════════════════════════════════════════════════════════════════════════
      // 1. EXECUTIVE SUMMARY
      // ════════════════════════════════════════════════════════════════════════
      sh(`Executive Summary — ${staff.length} Team Member${staff.length!==1?'s':''}`);
      kpiGrid([
        {label:'New Leads Added',      value:tLeads},
        {label:'Total Activities',     value:tActs},
        {label:'Meetings',             value:tMtg},
        {label:'Calls',                value:tCalls},
        {label:'Emails',               value:tEmails},
        {label:'Completed Activities', value:tDone},
        {label:'Pending Activities',   value:tPend},
        {label:'Overdue Activities',   value:tOver},
        {label:'Deals This Period',    value:tDeals},
        {label:'Updated Leads',        value:allUpd.length},
      ], 5);

      // ════════════════════════════════════════════════════════════════════════
      // 2. NEW LEADS
      // ════════════════════════════════════════════════════════════════════════
      sh(`New Leads (${allNew.length})`);
      tbl(
        [{label:'#',w:24,align:'center'},{label:'Company',w:115},{label:'Contact Person',w:100},{label:'Source',w:70},{label:'Assigned To',w:110},{label:'Created',w:104,align:'right'}],
        allNew.map((l,i)=>[
          {text:String(i+1),color:LIGHT},
          {text:tr(l.company_name||l.contact_name||'—',19),bold:true},
          {text:tr(l.contact_name||'—',17)},
          {text:tr(l.source||'—',12),color:MED},
          {text:tr(l._by||'—',18),color:MED},
          {text:fmtDT(l.created_at),color:MED},
        ])
      );

      // ════════════════════════════════════════════════════════════════════════
      // 3. UPDATED LEADS
      // ════════════════════════════════════════════════════════════════════════
      sh(`Updated Leads (${allUpd.length})`);
      tbl(
        [{label:'Lead / Company',w:165},{label:'Current Stage',w:100},{label:'Updated By',w:120},{label:'Last Updated',w:138,align:'right'}],
        allUpd.map(l=>[
          {text:tr(l.company_name||l.contact_name||'—',27),bold:true},
          {text:tr(l.stage||'—',17),color:MED},
          {text:tr(l._by||'—',20),color:MED},
          {text:fmtDT(l.updated_at),color:MED},
        ])
      );

      // ════════════════════════════════════════════════════════════════════════
      // 4. ACTIVITY SUMMARY
      // ════════════════════════════════════════════════════════════════════════
      sh(`Activity Summary (${allActs.length})`);
      tbl(
        [{label:'Company',w:105},{label:'Employee',w:90},{label:'Type',w:68},{label:'Description',w:135},{label:'Date',w:60},{label:'Status',w:65,align:'center'}],
        allActs.map(a=>{
          const lead=a.lm?.[a.lead_id]; const co=lead?.company_name||lead?.contact_name||'—';
          return [
            {text:tr(co,17),bold:true},
            {text:tr(a._emp,15),color:MED},
            {text:tr(tl(a.type),12),color:NAVY},
            {text:tr(a.description||a.title||'—',23)},
            {text:fmtD(a.created_at),color:MED},
            {text:sl(a.status),color:isDone(a.status)?GREEN:MED},
          ];
        })
      );

      // ════════════════════════════════════════════════════════════════════════
      // 5. MEETINGS
      // ════════════════════════════════════════════════════════════════════════
      sh(`Meetings (${allMtg.length})`);
      tbl(
        [{label:'Company',w:105},{label:'Employee',w:95},{label:'Meeting Type',w:80},{label:'Date & Time',w:95},{label:'Outcome / Notes',w:148}],
        allMtg.map(a=>{
          const lead=a.lm?.[a.lead_id];
          return [
            {text:tr(lead?.company_name||lead?.contact_name||'—',17),bold:true},
            {text:tr(a._emp,16),color:MED},
            {text:tr(tl(a.type),14),color:NAVY},
            {text:fmtDT(a.created_at),color:MED},
            {text:tr(a.description||a.title||'—',25)},
          ];
        })
      );

      // ════════════════════════════════════════════════════════════════════════
      // 6. CALLS
      // ════════════════════════════════════════════════════════════════════════
      sh(`Calls (${allCalls.length})`);
      tbl(
        [{label:'Company',w:115},{label:'Employee',w:95},{label:'Call Summary',w:170},{label:'Follow-up',w:60,align:'center'},{label:'Time',w:83,align:'right'}],
        allCalls.map(a=>{
          const lead=a.lm?.[a.lead_id];
          const hasFU=!!(a.next_follow_up_date||a.metadata?.next_activity);
          return [
            {text:tr(lead?.company_name||lead?.contact_name||'—',19),bold:true},
            {text:tr(a._emp,16),color:MED},
            {text:tr(a.description||a.title||'—',29)},
            {text:hasFU?'Yes':'No',color:hasFU?GREEN:LIGHT},
            {text:fmtDT(a.created_at),color:MED},
          ];
        })
      );

      // ════════════════════════════════════════════════════════════════════════
      // 7. EMAILS
      // ════════════════════════════════════════════════════════════════════════
      sh(`Emails (${allEmails.length})`);
      tbl(
        [{label:'Company',w:115},{label:'Employee',w:95},{label:'Subject / Description',w:185},{label:'Status',w:60,align:'center'},{label:'Sent',w:68,align:'right'}],
        allEmails.map(a=>{
          const lead=a.lm?.[a.lead_id];
          return [
            {text:tr(lead?.company_name||lead?.contact_name||'—',19),bold:true},
            {text:tr(a._emp,16),color:MED},
            {text:tr(a.metadata?.subject||a.description||a.title||'—',31)},
            {text:sl(a.status),color:isDone(a.status)?GREEN:MED},
            {text:fmtT(a.created_at),color:MED},
          ];
        })
      );

      // ════════════════════════════════════════════════════════════════════════
      // 8. PIPELINE & DEALS
      // ════════════════════════════════════════════════════════════════════════
      sh(`Pipeline & Deals (${allDeals.length})`);
      tbl(
        [{label:'Deal / Company',w:150},{label:'Employee',w:105},{label:'Stage',w:90},{label:'Value',w:72,align:'right'},{label:'Status',w:60,align:'center'},{label:'Created',w:46,align:'center'}],
        allDeals.map(d=>{
          const isWon=(d.status||'').toLowerCase()==='won';
          const isLost=(d.status||'').toLowerCase()==='lost';
          return [
            {text:tr(d.name||'—',24),bold:true},
            {text:tr(d._emp||'—',17),color:MED},
            {text:tr(d.stage||'—',15),color:MED},
            {text:fmtR(d.value),color:isWon?GREEN:DARK},
            {text:isWon?'Won':isLost?'Lost':'Active',color:isWon?GREEN:isLost?ERED:MED},
            {text:fmtD(d.created_at),color:LIGHT},
          ];
        })
      );

      // ════════════════════════════════════════════════════════════════════════
      // 9. EMPLOYEE PERFORMANCE
      // ════════════════════════════════════════════════════════════════════════
      sh(`Employee Performance (${staff.length})`);
      tbl(
        [
          {label:'Employee',  w:115},
          {label:'Role',      w:80},
          {label:'Leads',     w:38,align:'center'},
          {label:'Activities',w:55,align:'center'},
          {label:'Calls',     w:38,align:'center'},
          {label:'Emails',    w:42,align:'center'},
          {label:'Meetings',  w:50,align:'center'},
          {label:'Done',      w:38,align:'center'},
          {label:'Pending',   w:47,align:'center'},
          {label:'Score',     w:20,align:'center'},
        ],
        staff.map(s=>{
          const st=employeeData[s.id]?.stats||{};
          const has=st.total>0;
          return [
            {text:tr(s.full_name||s.email,19),bold:true},
            {text:tr(rl(s.role),13),color:MED},
            {text:String(st.newLeads||0),color:has?DARK:LIGHT},
            {text:String(st.total||0),color:has?DARK:LIGHT},
            {text:String(st.calls||0),color:has?DARK:LIGHT},
            {text:String(st.emails||0),color:has?DARK:LIGHT},
            {text:String(st.meetings||0),color:has?DARK:LIGHT},
            {text:String(st.completed||0),color:has?GREEN:LIGHT},
            {text:String(st.pending||0),color:has&&st.pending>0?AMBER:LIGHT},
            {text:has?`${st.efficiency||0}%`:'—',color:has?NAVY:LIGHT},
          ];
        })
      );

      // ── Footers on every page ─────────────────────────────────────────────────
      const range=doc.bufferedPageRange();
      for(let i=0;i<range.count;i++){
        doc.switchToPage(range.start+i);
        const fy=PH-FTR_H;
        doc.rect(0,fy,PW,FTR_H).fill(BG2).strokeColor(BDR).lineWidth(0.3).stroke();
        doc.font('Helvetica').fontSize(7.5).fillColor(LIGHT)
          .text(`© ${new Date().getFullYear()} Sales CRM  ·  Daily Sales Report  ·  ${reportDateLabel}  ·  Do not reply`,ML,fy+8,{width:CW*0.72,lineBreak:false});
        doc.font('Helvetica').fontSize(7.5).fillColor(MED)
          .text(`Page ${i+1} of ${range.count}`,ML+CW*0.72,fy+8,{width:CW*0.28,align:'right',lineBreak:false});
      }
      doc.end();
    } catch(err){ reject(err); }
  });
}

module.exports = { generateDSRPdf, generateActivityPdf, generateEnterpriseDSRPdf };
