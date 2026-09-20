'use strict';
const PDFDocument = require("pdfkit");

const C = {
  navy:      "#0F2044",
  primary:   "#1E3A5F",
  accent:    "#3B82F6",
  success:   "#059669",
  danger:    "#DC2626",
  warning:   "#D97706",
  purple:    "#7C3AED",
  text:      "#1E293B",
  muted:     "#64748B",
  light:     "#94A3B8",
  border:    "#E2E8F0",
  bg:        "#F8FAFC",
  white:     "#FFFFFF",
};

const PW = 595.28;
const PH = 841.89;
const ML = 36;
const MR = 36;
const CW = PW - ML - MR;   // 523.28

function rl(r) {
  if (r === "owner")          return "Super Admin";
  if (r === "sales_head")     return "Sales Head";
  if (r === "sales_manager")  return "Sales Manager";
  if (r === "inside_sales")   return "Inside Sales";
  if (r === "sales_employee") return "Sales Executive";
  return (r || "Staff").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
}

function fmtTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:true,timeZone:"Asia/Kolkata"}); }
  catch { return "—"; }
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Kolkata"}); }
  catch { return "—"; }
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:true,timeZone:"Asia/Kolkata"}); }
  catch { return "—"; }
}
function fmtCurrency(val) {
  const n = Number(val)||0;
  if (!n) return "—";
  if (n>=10000000) return "Rs."+(n/10000000).toFixed(1)+"Cr";
  if (n>=100000)   return "Rs."+(n/100000).toFixed(1)+"L";
  if (n>=1000)     return "Rs."+(n/1000).toFixed(0)+"K";
  return "Rs."+n;
}
function fmtType(t) {
  if (!t) return "—";
  return t.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
}
function safe(v, max=40) { return String(v??'—').slice(0,max); }

async function generateNewDsrPdf({
  recipientName, recipientRole, dateLabel, generatedAt,
  scopeProfiles, scopeTotals, statsMap, meetings, profileMap,
}) {
  return new Promise((resolve, reject) => {
    const doc  = new PDFDocument({ size:"A4", margin:0, bufferPages:true });
    const bufs = [];
    doc.on("data", d => bufs.push(d));
    doc.on("end",  () => resolve(Buffer.concat(bufs)));
    doc.on("error", reject);

    let pageCount = 0;

    // ── helpers ──────────────────────────────────────────────────────────────
    function newPage(skipHeader) {
      if (pageCount > 0) doc.addPage({ size:"A4", margin:0 });
      pageCount++;
      if (!skipHeader) {
        // top nav bar
        doc.rect(0,0,PW,36).fill(C.navy);
        doc.fontSize(7).font("Helvetica").fillColor(C.light)
          .text("Sales CRM  ·  Daily Sales Report  ·  "+dateLabel, ML,12,{width:CW-60,lineBreak:false});
        doc.fontSize(7).fillColor(C.muted)
          .text("Page "+pageCount, 0,12,{width:PW-ML,align:"right",lineBreak:false});
        // bottom footer
        doc.rect(0,PH-26,PW,26).fill(C.bg);
        doc.moveTo(0,PH-26).lineTo(PW,PH-26).lineWidth(0.5).strokeColor(C.border).stroke();
        doc.fontSize(7).font("Helvetica").fillColor(C.light)
          .text("Generated: "+fmtDateTime(generatedAt)+" IST  ·  Confidential — Internal Use Only",ML,PH-17,{width:CW,align:"center",lineBreak:false});
      }
      return 44; // starting y after header
    }

    function sectionTitle(title, y) {
      doc.rect(ML,y,CW,18).fill(C.bg);
      doc.moveTo(ML,y).lineTo(ML+3,y).lineTo(ML+3,y+18).lineTo(ML,y+18).fill(C.accent);
      doc.fontSize(9).font("Helvetica-Bold").fillColor(C.primary)
        .text(title.toUpperCase(), ML+10, y+5, {width:CW-10, lineBreak:false});
      doc.moveTo(ML,y+18).lineTo(ML+CW,y+18).lineWidth(0.4).strokeColor(C.border).stroke();
      return y + 26;
    }

    // Draw a table. cols: [{label,width,align}]  rows: [[cell,...]]
    function drawTable(cols, rows, y, rowH=16) {
      const totalW = cols.reduce((s,c)=>s+c.width,0);

      // header
      doc.rect(ML, y, totalW, rowH+4).fill(C.primary);
      let x = ML;
      cols.forEach(col => {
        doc.fontSize(6.5).font("Helvetica-Bold").fillColor(C.bg)
          .text(col.label.toUpperCase(), x+4, y+5, {width:col.width-8, align:col.align||"left", lineBreak:false, ellipsis:true});
        x += col.width;
      });
      y += rowH+4;

      rows.forEach((row, ri) => {
        if (y > PH - 60) {
          newPage();
          y = 44;
          // re-draw header
          doc.rect(ML,y,totalW,rowH+4).fill(C.primary);
          let hx = ML;
          cols.forEach(col => {
            doc.fontSize(6.5).font("Helvetica-Bold").fillColor(C.bg)
              .text(col.label.toUpperCase(), hx+4,y+5,{width:col.width-8,align:col.align||"left",lineBreak:false,ellipsis:true});
            hx += col.width;
          });
          y += rowH+4;
        }

        const bg = ri%2===0 ? C.white : C.bg;
        doc.rect(ML,y,totalW,rowH).fill(bg);
        doc.rect(ML,y,totalW,rowH).lineWidth(0.3).strokeColor(C.border).stroke();

        let cx = ML;
        cols.forEach((col, ci) => {
          const cell = row[ci];
          const val  = typeof cell === "object" && cell !== null ? cell.v : cell;
          const clr  = (typeof cell === "object" && cell !== null ? cell.c : null) || C.text;
          doc.fontSize(7.5).font("Helvetica").fillColor(clr)
            .text(safe(val,55), cx+4, y+(rowH-7.5)/2, {width:col.width-8, align:col.align||"left", lineBreak:false, ellipsis:true});
          cx += col.width;
        });
        y += rowH;
      });
      return y + 6;
    }

    function statGrid(items, y, cols=4, boxH=46) {
      const boxW = CW / cols;
      items.forEach((item,i) => {
        const row = Math.floor(i/cols);
        const col = i%cols;
        const bx  = ML + col*boxW;
        const by  = y + row*(boxH+4);
        doc.rect(bx+2,by,boxW-4,boxH).fill(C.bg);
        doc.rect(bx+2,by,3,boxH).fill(item.color||C.accent);
        doc.moveTo(bx+2,by).lineTo(bx+boxW-2,by).lineWidth(0.3).strokeColor(C.border).stroke();
        doc.moveTo(bx+2,by+boxH).lineTo(bx+boxW-2,by+boxH).lineWidth(0.3).strokeColor(C.border).stroke();
        doc.fontSize(7).font("Helvetica").fillColor(C.muted)
          .text(item.label, bx+10,by+8,{width:boxW-16,lineBreak:false,ellipsis:true});
        doc.fontSize(18).font("Helvetica-Bold").fillColor(item.color||C.primary)
          .text(String(item.value), bx+10,by+18,{width:boxW-16,lineBreak:false});
      });
      const totalRows = Math.ceil(items.length/cols);
      return y + totalRows*(boxH+4) + 8;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  COVER PAGE
    // ════════════════════════════════════════════════════════════════════════
    newPage(true);
    doc.rect(0,0,PW,PH).fill(C.navy);
    doc.rect(0,0,PW,5).fill(C.accent);
    doc.rect(0,PH-5,PW,5).fill(C.accent);

    // Company
    doc.fontSize(9).font("Helvetica-Bold").fillColor(C.muted)
      .text("Sales CRM", 0,80,{width:PW,align:"center",characterSpacing:4,lineBreak:false});
    doc.moveTo(PW/2-50,100).lineTo(PW/2+50,100).lineWidth(1).strokeColor(C.accent).stroke();

    // Title
    doc.fontSize(38).font("Helvetica-Bold").fillColor(C.white)
      .text("Daily Sales", 0,118,{width:PW,align:"center",lineBreak:false});
    doc.fontSize(38).font("Helvetica-Bold").fillColor(C.accent)
      .text("Report",0,162,{width:PW,align:"center",lineBreak:false});

    // Date badge
    doc.roundedRect(PW/2-130,218,260,40,8).fill("#1A3560");
    doc.fontSize(13).font("Helvetica-Bold").fillColor(C.white)
      .text(dateLabel,0,230,{width:PW,align:"center",lineBreak:false});

    // Recipient
    doc.roundedRect(ML,285,CW,90,8).fill("#162D4A");
    doc.fontSize(9).font("Helvetica").fillColor(C.muted)
      .text("PREPARED FOR",0,300,{width:PW,align:"center",lineBreak:false});
    doc.fontSize(20).font("Helvetica-Bold").fillColor(C.white)
      .text(recipientName,0,316,{width:PW,align:"center",lineBreak:false});
    doc.fontSize(11).font("Helvetica").fillColor(C.accent)
      .text(rl(recipientRole),0,344,{width:PW,align:"center",lineBreak:false});

    // Cover stats
    const coverStats = [
      {label:"Employees",      value:scopeProfiles.length,              color:C.accent},
      {label:"Activities Done",value:scopeTotals.activitiesCompleted||0,color:C.success},
      {label:"Deals Won",      value:scopeTotals.dealsWon||0,           color:C.success},
      {label:"Leads Created",  value:(scopeTotals.leadsCreated||0)+(scopeTotals.prospectsAdded||0),color:C.purple},
    ];
    const csW = CW/4;
    coverStats.forEach((s,i)=>{
      const cx = ML+i*csW;
      doc.roundedRect(cx+4,406,csW-8,72,6).fill("#1A3560");
      doc.fontSize(28).font("Helvetica-Bold").fillColor(s.color)
        .text(String(s.value),cx+4,420,{width:csW-8,align:"center",lineBreak:false});
      doc.fontSize(8).font("Helvetica").fillColor(C.muted)
        .text(s.label,cx+4,454,{width:csW-8,align:"center",lineBreak:false});
    });

    doc.fontSize(8.5).font("Helvetica").fillColor(C.muted)
      .text("Generated automatically on "+fmtDateTime(generatedAt)+" IST",0,510,{width:PW,align:"center",lineBreak:false});
    doc.fontSize(7.5).fillColor("#334155")
      .text("CONFIDENTIAL — FOR INTERNAL USE ONLY",0,527,{width:PW,align:"center",characterSpacing:1.5,lineBreak:false});

    // ════════════════════════════════════════════════════════════════════════
    //  PAGE 2: EXECUTIVE DASHBOARD
    // ════════════════════════════════════════════════════════════════════════
    let y = newPage();

    // Section title
    doc.fontSize(14).font("Helvetica-Bold").fillColor(C.primary)
      .text("Executive Dashboard",ML,y,{lineBreak:false});
    doc.moveTo(ML,y+18).lineTo(ML+CW,y+18).lineWidth(1).strokeColor(C.border).stroke();
    y += 26;

    // Org stats grid
    const orgStats = [
      {label:"Total Employees",      value:scopeProfiles.length,                                            color:C.accent},
      {label:"Activities Completed", value:scopeTotals.activitiesCompleted||0,                             color:C.success},
      {label:"Calls Made",           value:scopeTotals.callsMade||0,                                       color:"#0891B2"},
      {label:"Emails Sent",          value:scopeTotals.emailsSent||0,                                      color:C.purple},
      {label:"Meetings Today",       value:scopeTotals.meetingsScheduled||0,                               color:C.warning},
      {label:"Prospects Added",      value:scopeTotals.prospectsAdded||0,                                  color:C.accent},
      {label:"Leads Created",        value:scopeTotals.leadsCreated||0,                                    color:C.primary},
      {label:"New Leads (from Pipeline)", value:scopeTotals.newLeadsFromPipeline||0,                       color:C.purple},
      {label:"Leads Converted",      value:scopeTotals.leadsConverted||0,                                  color:C.success},
      {label:"Deals Won",            value:scopeTotals.dealsWon||0,                                        color:C.success},
      {label:"Revenue Closed",       value:fmtCurrency(scopeTotals.revenue),                               color:C.success},
      {label:"Pending Activities",   value:scopeTotals.activitiesPending||0,                               color:C.warning},
      {label:"Overdue Activities",   value:scopeTotals.activitiesOverdue||0,                               color:scopeTotals.activitiesOverdue>0?C.danger:C.muted},
    ];
    y = statGrid(orgStats, y, 4, 44);
    y += 4;

    // Employee performance table
    y = sectionTitle("Employee Performance Overview", y);
    const perfCols = [
      {label:"Employee",   width:78, align:"left"},
      {label:"Role",       width:52, align:"left"},
      {label:"Prospects",  width:40, align:"center"},
      {label:"Leads",      width:34, align:"center"},
      {label:"Pipeline",   width:34, align:"center"},
      {label:"Converted",  width:40, align:"center"},
      {label:"Deals",      width:34, align:"center"},
      {label:"Won",        width:28, align:"center"},
      {label:"Calls",      width:28, align:"center"},
      {label:"Emails",     width:32, align:"center"},
      {label:"Meetings",   width:38, align:"center"},
      {label:"Done",       width:28, align:"center"},
      {label:"Pending",    width:32, align:"center"},
      {label:"Overdue",    width:25, align:"center"},
    ]; // 78+52+40+34+34+40+34+28+28+32+38+28+32+25 = 523 ✓ ("Pipeline" = New Leads from Pipeline conversions)

    const perfRows = scopeProfiles.map(p => {
      const s = statsMap[p.id]||{};
      return [
        safe(p.full_name||p.email,30),
        safe(rl(p.role),18),
        s.prospectsAdded||0,
        s.leadsCreated||0,
        s.newLeadsFromPipeline||0,
        s.leadsConverted||0,
        s.dealsCreated||0,
        {v:s.dealsWon||0,          c:s.dealsWon>0?C.success:C.text},
        s.callsMade||0,
        s.emailsSent||0,
        s.meetingsScheduled||0,
        s.activitiesCompleted||0,
        s.activitiesPending||0,
        {v:s.activitiesOverdue||0, c:s.activitiesOverdue>0?C.danger:C.text},
      ];
    });
    y = drawTable(perfCols, perfRows, y);

    // ════════════════════════════════════════════════════════════════════════
    //  PAGE 3: MEETINGS
    // ════════════════════════════════════════════════════════════════════════
    if (meetings && meetings.length > 0) {
      y = newPage();
      y = sectionTitle("Today's Meetings", y);

      const mtgCols = [
        {label:"Time",     width:52,  align:"left"},
        {label:"Customer", width:95,  align:"left"},
        {label:"Company",  width:95,  align:"left"},
        {label:"Employee", width:88,  align:"left"},
        {label:"Type",     width:66,  align:"left"},
        {label:"Status",   width:60,  align:"center"},
        {label:"Purpose",  width:67,  align:"left"},
      ]; // 52+95+95+88+66+60+67 = 523 ✓

      const mtgRows = meetings.map(m => {
        const emp = profileMap[m.created_by];
        return [
          fmtTime(m.start_time),
          safe(m.customer_name||m.contact_name||"—",22),
          safe(m.company_name||"—",22),
          safe(emp?(emp.full_name||emp.email):"—",22),
          safe(fmtType(m.meeting_type)||"Meeting",18),
          {v:safe(m.status||"Scheduled",12), c:m.status==="completed"?C.success:m.status==="cancelled"?C.danger:C.warning},
          safe(m.purpose||"—",22),
        ];
      });
      y = drawTable(mtgCols, mtgRows, y);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  PER-EMPLOYEE PAGES
    // ════════════════════════════════════════════════════════════════════════
    for (const profile of scopeProfiles) {
      const s       = statsMap[profile.id] || {};
      const manager = profile.manager_id ? profileMap[profile.manager_id] : null;

      y = newPage();

      // Employee header bar
      doc.rect(ML, y, CW, 56).fill(C.primary);
      doc.rect(ML, y, 4, 56).fill(C.accent);
      doc.fontSize(14).font("Helvetica-Bold").fillColor(C.white)
        .text(safe(profile.full_name||profile.email,35), ML+12, y+10, {width:CW-180, lineBreak:false});
      doc.fontSize(8.5).font("Helvetica").fillColor(C.accent)
        .text(rl(profile.role), ML+12, y+30, {width:CW-180, lineBreak:false});
      if (profile.email) {
        doc.fontSize(7.5).fillColor("#64748B")
          .text(profile.email, ML+12, y+42, {width:CW-180, lineBreak:false, ellipsis:true});
      }
      if (manager) {
        doc.fontSize(7.5).fillColor("#94A3B8")
          .text("Reports to: "+(manager.full_name||manager.email), PW-MR-180, y+12, {width:176, align:"right", lineBreak:false, ellipsis:true});
      }
      if (s.lastActivityAt) {
        doc.fontSize(7.5).fillColor("#475569")
          .text("Last Active: "+fmtTime(s.lastActivityAt)+" IST", PW-MR-180, y+28, {width:176, align:"right", lineBreak:false});
      }
      y += 64;

      // Performance stats (4 cols × 4 rows)
      const empStats = [
        {label:"Prospects Added",      value:s.prospectsAdded||0,       color:C.accent},
        {label:"Leads Created",        value:s.leadsCreated||0,         color:C.primary},
        {label:"New Leads (Pipeline)", value:s.newLeadsFromPipeline||0, color:C.purple},
        {label:"Leads Converted",      value:s.leadsConverted||0,       color:C.success},
        {label:"Deals Created",        value:s.dealsCreated||0,         color:C.accent},
        {label:"Deals Won",            value:s.dealsWon||0,             color:C.success},
        {label:"Deals Lost",           value:s.dealsLost||0,            color:C.danger},
        {label:"Calls Made",           value:s.callsMade||0,            color:"#0891B2"},
        {label:"Emails Sent",          value:s.emailsSent||0,           color:C.purple},
        {label:"Meetings Scheduled",   value:s.meetingsScheduled||0,    color:C.warning},
        {label:"Meetings Completed",   value:s.meetingsCompleted||0,    color:C.success},
        {label:"Tasks Completed",      value:s.tasksCompleted||0,       color:C.success},
        {label:"Notes Added",          value:s.notesAdded||0,           color:C.muted},
        {label:"Activities Done",      value:s.activitiesCompleted||0,  color:C.success},
        {label:"Pending Activities",   value:s.activitiesPending||0,    color:C.warning},
        {label:"Overdue Activities",   value:s.activitiesOverdue||0,    color:s.activitiesOverdue>0?C.danger:C.muted},
        {label:"Follow-ups Pending",   value:s.followUpsPending||0,     color:C.warning},
      ];
      y = statGrid(empStats, y, 4, 40);

      // ACTIVITY TIMELINE
      if (s.activityTimeline && s.activityTimeline.length > 0) {
        if (y > PH-120) { y = newPage(); }
        y = sectionTitle("Activity Timeline", y);
        const actCols = [
          {label:"Time",        width:52,  align:"left"},
          {label:"Type",        width:88,  align:"left"},
          {label:"Company",     width:100, align:"left"},
          {label:"Status",      width:56,  align:"center"},
          {label:"Description", width:149, align:"left"},
          {label:"Outcome",     width:78,  align:"left"},
        ]; // 52+88+100+56+149+78 = 523 ✓
        const actRows = s.activityTimeline.map(a => [
          fmtTime(a.time),
          safe(fmtType(a.type),20),
          safe(a.companyName,24),
          {v:safe(a.status,12), c:["done","completed"].includes(a.status)?C.success:C.muted},
          safe(a.description,50),
          safe(a.outcome,22),
        ]);
        y = drawTable(actCols, actRows, y);
      }

      // TODAY'S LEADS
      if (s.todayLeads && s.todayLeads.length > 0) {
        if (y > PH-120) { y = newPage(); }
        y = sectionTitle("Today's Leads & Prospects", y);
        const ldCols = [
          {label:"Company",   width:120, align:"left"},
          {label:"Contact",   width:106, align:"left"},
          {label:"Source",    width:78,  align:"left"},
          {label:"Stage",     width:80,  align:"left"},
          {label:"Time",      width:74,  align:"center"},
          {label:"Converted", width:65,  align:"center"},
        ]; // 120+106+78+80+74+65 = 523 ✓
        const ldRows = s.todayLeads.map(l => [
          safe(l.companyName,28),
          safe(l.contactName,26),
          safe(l.source,18),
          safe(fmtType(l.stage),18),
          fmtTime(l.createdAt),
          {v:l.isConverted?"Yes":"No", c:l.isConverted?C.success:C.muted},
        ]);
        y = drawTable(ldCols, ldRows, y);
      }

      // TODAY'S DEALS
      if (s.todayDeals && s.todayDeals.length > 0) {
        if (y > PH-120) { y = newPage(); }
        y = sectionTitle("Today's Deals", y);
        const dlCols = [
          {label:"Deal Name",  width:116, align:"left"},
          {label:"Company",    width:110, align:"left"},
          {label:"Value",      width:68,  align:"right"},
          {label:"Stage",      width:80,  align:"left"},
          {label:"Status",     width:60,  align:"center"},
          {label:"Close Date", width:89,  align:"center"},
        ]; // 116+110+68+80+60+89 = 523 ✓
        const dlRows = s.todayDeals.map(d => [
          safe(d.name,28),
          safe(d.companyName,26),
          {v:fmtCurrency(d.value), c:C.success},
          safe(fmtType(d.stage),18),
          {v:safe(d.status||"Active",10), c:d.status==="won"?C.success:d.status==="lost"?C.danger:C.muted},
          d.expectedClose?fmtDate(d.expectedClose):"—",
        ]);
        y = drawTable(dlCols, dlRows, y);
      }

      // FOLLOW-UPS
      if (s.todayFollowUps && s.todayFollowUps.length > 0) {
        if (y > PH-100) { y = newPage(); }
        y = sectionTitle("Follow-ups", y);
        const fuCols = [
          {label:"Company", width:150, align:"left"},
          {label:"Contact", width:128, align:"left"},
          {label:"Type",    width:100, align:"left"},
          {label:"Due",     width:84,  align:"center"},
          {label:"Status",  width:61,  align:"center"},
        ]; // 150+128+100+84+61 = 523 ✓
        const fuRows = s.todayFollowUps.map(f => [
          safe(f.companyName,34),
          safe(f.contactName,30),
          safe(fmtType(f.type),22),
          f.dueDate?fmtDate(f.dueDate):"—",
          {v:"Pending", c:C.warning},
        ]);
        y = drawTable(fuCols, fuRows, y);
      }

      // NOTES
      if (s.todayNotes && s.todayNotes.length > 0) {
        if (y > PH-100) { y = newPage(); }
        y = sectionTitle("Notes Added Today", y);
        const ntCols = [
          {label:"Time",    width:56,  align:"left"},
          {label:"Company", width:110, align:"left"},
          {label:"Contact", width:100, align:"left"},
          {label:"Note",    width:257, align:"left"},
        ]; // 56+110+100+257 = 523 ✓
        const ntRows = s.todayNotes.map(n => [
          fmtTime(n.time),
          safe(n.companyName,26),
          safe(n.contactName,24),
          safe(n.description,80),
        ]);
        y = drawTable(ntCols, ntRows, y);
      }

      // PENDING ACTIVITIES
      if (s.pendingActivities && s.pendingActivities.length > 0) {
        if (y > PH-100) { y = newPage(); }
        y = sectionTitle("Pending Activities", y);
        const paCols = [
          {label:"Company",     width:138, align:"left"},
          {label:"Contact",     width:110, align:"left"},
          {label:"Type",        width:94,  align:"left"},
          {label:"Due Date",    width:86,  align:"center"},
          {label:"Description", width:95,  align:"left"},
        ]; // 138+110+94+86+95 = 523 ✓
        const paRows = s.pendingActivities.map(a => [
          safe(a.companyName,32),
          safe(a.contactName,26),
          safe(fmtType(a.type),22),
          a.dueDate?fmtDate(a.dueDate):"—",
          safe(a.description,28),
        ]);
        y = drawTable(paCols, paRows, y);
      }

      // OVERDUE ACTIVITIES
      if (s.overdueActivities && s.overdueActivities.length > 0) {
        if (y > PH-100) { y = newPage(); }
        y = sectionTitle("Overdue Activities", y);
        const oCols = [
          {label:"Company",     width:118, align:"left"},
          {label:"Contact",     width:100, align:"left"},
          {label:"Type",        width:88,  align:"left"},
          {label:"Due Date",    width:80,  align:"center"},
          {label:"Days Overdue",width:72,  align:"center"},
          {label:"Description", width:65,  align:"left"},
        ]; // 118+100+88+80+72+65 = 523 ✓
        const oRows = s.overdueActivities.map(a => [
          safe(a.companyName,28),
          safe(a.contactName,24),
          safe(fmtType(a.type),22),
          a.dueDate?fmtDate(a.dueDate):"—",
          {v:a.daysOverdue>0?a.daysOverdue+"d":"—", c:a.daysOverdue>3?C.danger:C.warning},
          safe(a.description,20),
        ]);
        y = drawTable(oCols, oRows, y);
      }
    }

    doc.end();
  });
}

module.exports = { generateNewDsrPdf };
