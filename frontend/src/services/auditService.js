import { db as supabase } from "../lib/db";

export async function logExport(userId, resource, recordCount = 0, extra = {}) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "export",
      resource,
      details: { record_count: recordCount, ...extra },
    });
  } catch {
    // Non-critical — never block an export because of a logging failure
  }
}
