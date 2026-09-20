/**
 * CrmIcons — unique, brand-crafted SVG icon set for Sales CRM.
 *
 * All icons share:
 *  • 24×24 viewBox
 *  • stroke-based (no solid fills except deliberate accents)
 *  • 1.75 strokeWidth, round caps & joins
 *  • Distinct geometry — not copied from any icon library
 */

const BASE = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
// Asymmetric bento grid: small top-left + small bottom-left + tall right column
export function DashboardIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="18" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

// ── Pipeline ──────────────────────────────────────────────────────────────────
// Three pill-shaped stages connected by arrows — left to right flow
export function PipelineIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <rect x="1.5" y="9.5" width="5.5" height="5" rx="2.5" />
      <rect x="9.25" y="9.5" width="5.5" height="5" rx="2.5" />
      <rect x="17" y="9.5" width="5.5" height="5" rx="2.5" />
      {/* Arrow 1 */}
      <path d="M7 12h2.25" />
      <path d="M8 10.8L9.25 12L8 13.2" />
      {/* Arrow 2 */}
      <path d="M14.75 12H17" />
      <path d="M15.75 10.8L17 12L15.75 13.2" />
    </svg>
  );
}

// ── Leads ─────────────────────────────────────────────────────────────────────
// Person silhouette + plus sign → prospect acquisition
export function LeadsIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <circle cx="10" cy="8" r="4" />
      <path d="M2 21a8 8 0 0 1 12.4-6.67" />
      <line x1="18" y1="13" x2="18" y2="21" />
      <line x1="14" y1="17" x2="22" y2="17" />
    </svg>
  );
}

// ── Deals ─────────────────────────────────────────────────────────────────────
// Two stacked document cards with a checkmark — signed agreement
export function DealsIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <rect x="3" y="8" width="13" height="13" rx="2" />
      <rect x="8" y="3" width="13" height="13" rx="2" />
      <path d="M12 10l2 2 4-4" />
    </svg>
  );
}

// ── Targets ───────────────────────────────────────────────────────────────────
// Precision crosshair with concentric rings — goal accuracy
export function TargetsIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
      <line x1="12" y1="2" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="2" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22" y2="12" />
    </svg>
  );
}

// ── Meetings ──────────────────────────────────────────────────────────────────
// Modern calendar with three day dots — scheduling at a glance
export function MeetingsIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <path d="M8 14h.01M12 14h.01M16 14h.01" strokeWidth="2.5" />
    </svg>
  );
}

// ── Activities (Zap replacement) ───────────────────────────────────────────────
// Energy bolt with a small circle — immediate action
export function ActivitiesIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

// ── DSR ───────────────────────────────────────────────────────────────────────
// Document with text lines + mini upward trend — daily activity log
export function DSRIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="12" y2="15" />
      <path d="M13 18l2-2 2 2" />
    </svg>
  );
}

// ── Chat ──────────────────────────────────────────────────────────────────────
// Two overlapping speech bubbles — bidirectional business communication
export function ChatIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </svg>
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────
// Three ascending bars with a trend arc — premium analytics
export function ReportsIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <rect x="3" y="14" width="4" height="7" rx="1" />
      <rect x="10" y="9" width="4" height="12" rx="1" />
      <rect x="17" y="4" width="4" height="17" rx="1" />
      <path d="M5 14 Q8 8 12 9 Q15 9.5 19 4" strokeDasharray="2.5 1.5" />
    </svg>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────────
// Smooth trend line with data nodes — performance intelligence
export function AnalyticsIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <path d="M3 18 L7 12 L11 15 L15 8 L21 10" />
      <circle cx="7"  cy="12" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="11" cy="15" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8"  r="1.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Teams ─────────────────────────────────────────────────────────────────────
// Org-chart hierarchy: one node on top, two below — structure & authority
export function TeamsIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <circle cx="12" cy="4.5" r="2.5" />
      <circle cx="5.5" cy="18" r="2.5" />
      <circle cx="18.5" cy="18" r="2.5" />
      <line x1="12" y1="7" x2="5.5" y2="15.5" />
      <line x1="12" y1="7" x2="18.5" y2="15.5" />
      <line x1="5.5" y1="18" x2="18.5" y2="18" />
    </svg>
  );
}

// ── Security Logs ─────────────────────────────────────────────────────────────
// Shield with checkmark inside — verified protection
export function SecurityIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

// ── Settings (bonus) ──────────────────────────────────────────────────────────
// Dual horizontal sliders — configuration controls
export function SettingsSliderIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} {...BASE} stroke="currentColor" strokeWidth="1.75" style={style} className={className}>
      <line x1="3" y1="8"  x2="21" y2="8" />
      <line x1="3" y1="16" x2="21" y2="16" />
      <circle cx="9"  cy="8"  r="2.5" />
      <circle cx="15" cy="16" r="2.5" />
    </svg>
  );
}
