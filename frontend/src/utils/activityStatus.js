// Single source of truth for deriving an activity's display status, shared between
// Activities.jsx and Dashboard.jsx so both pages agree on what counts as "overdue".
export const AUTO_COMPLETED_TYPES = new Set(["note", "email_sent", "stage_change", "deal_created", "email_contact"]);

// Statuses that close an activity (it leaves openEvents)
export const CLOSED_STATUSES = new Set(["done", "completed", "cancelled"]);

// Derives the display status for a single activity — single source of truth.
export function deriveStatus(activity) {
  if (AUTO_COMPLETED_TYPES.has(activity.type)) return "completed";
  const s = activity.status || "";
  // Explicitly set terminal/manual statuses
  if (s === "done" || s === "completed")  return "completed";
  if (s === "cancelled")                  return "cancelled";
  if (s === "no_response")                return "no_response";
  if (s === "follow_up_required")         return "follow_up_required";
  if (s === "rescheduled")                return "rescheduled";
  // Auto-compute from due_date for everything else (todo/in_progress/scheduled/empty)
  if (activity.due_date) {
    const due = new Date(activity.due_date);
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    if (due >= todayStart && due <= todayEnd) return "due_today";
    if (due < now) return "overdue";
  }
  return "scheduled";
}
