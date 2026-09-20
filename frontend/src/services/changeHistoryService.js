import { db as supabase } from "../lib/db";

// Field label lookup — human-readable names for the History tab
const FIELD_LABELS = {
  contact_name:      "Point of Contact Changed",
  poc_changed:       "Point of Contact Changed",
  company_name:      "Company Name",
  designation:       "Designation",
  email:             "Email",
  phone:             "Phone",
  stage:             "Stage",
  pipeline_stage:    "Pipeline Stage",
  temperature:       "Temperature",
  priority:          "Priority",
  source:            "Lead Source",
  assigned_to:       "Assigned To",
  follow_up_date:    "Meeting Date",
  budget:            "Budget",
  remarks:           "Remarks",
  value:             "Deal Value",
  close_date:        "Close Date",
  form_unlocked:     "Form Unlocked",
  contact_unlocked:  "Form Unlocked",
  contact_added:     "Contact Added",
  contact_deleted:   "Contact Removed",
};

export const changeHistoryService = {
  // Call this after a successful update — pass old and new records, and which userId changed it
  async logDiff({ entityType, entityId, oldRecord, newRecord, userId, trackedFields }) {
    const changes = [];
    for (const field of trackedFields) {
      const oldVal = oldRecord?.[field];
      const newVal = newRecord?.[field];
      const oldStr = oldVal == null ? "" : String(oldVal);
      const newStr = newVal == null ? "" : String(newVal);
      if (!oldStr) continue; // skip null/empty → value (creation noise)
      if (oldStr !== newStr) {
        changes.push({
          entity_type: entityType,
          entity_id:   entityId,
          field_name:  field,
          field_label: FIELD_LABELS[field] || field,
          old_value:   oldStr || null,
          new_value:   newStr || null,
          changed_by:  userId || null,
        });
      }
    }
    if (!changes.length) return;
    const { error } = await supabase.from("change_history").insert(changes);
    if (error) console.warn("change_history insert failed:", error.message);
  },

  async logContactUnlock({ entityType, entityId, adminName, userId }) {
    const { error } = await supabase.from("change_history").insert({
      entity_type: entityType,
      entity_id:   entityId,
      field_name:  "form_unlocked",
      field_label: "Form Unlocked",
      old_value:   "Locked",
      new_value:   `Form Unlocked by ${adminName || "Admin"}`,
      changed_by:  userId || null,
    });
    if (error) console.warn("form_unlock history insert failed:", error.message);
  },

  async logPocChange({ entityType, entityId, oldName, newName, userId }) {
    if (!oldName && !newName) return;
    const { error } = await supabase.from("change_history").insert({
      entity_type: entityType,
      entity_id:   entityId,
      field_name:  "poc_changed",
      field_label: "Point of Contact Changed",
      old_value:   oldName || null,
      new_value:   newName || null,
      changed_by:  userId || null,
    });
    if (error) console.warn("poc change_history insert failed:", error.message);
  },

  async logCreation({ entityType, entityId, label, details, userId }) {
    const { error } = await supabase.from("change_history").insert({
      entity_type: entityType,
      entity_id:   entityId,
      field_name:  "created",
      field_label: label || "Record Created",
      old_value:   null,
      new_value:   details || "Created",
      changed_by:  userId || null,
    });
    if (error) console.warn("logCreation history insert failed:", error.message);
  },

  async logConversion({ entityId, dealId, fromStage, toStage, userId }) {
    const labels = {
      "pipeline→lead":    "Converted to Lead",
      "lead→deal":        "Converted to Deal",
      "deal→lead":        "Reverted to Lead",
      "deal→pipeline":    "Reverted to Pipeline",
      "lead→pipeline":    "Moved to Pipeline",
    };
    const key   = `${fromStage}→${toStage}`;
    const label = labels[key] || `Converted: ${fromStage} → ${toStage}`;

    const rows = [{
      entity_type: "lead",
      entity_id:   entityId,
      field_name:  "conversion",
      field_label: label,
      old_value:   fromStage,
      new_value:   toStage,
      changed_by:  userId || null,
    }];

    // Also log on the deal record so conversion shows in Deal history
    if (toStage === "deal" && dealId) {
      rows.push({
        entity_type: "deal",
        entity_id:   dealId,
        field_name:  "conversion",
        field_label: "Deal Created from Lead",
        old_value:   fromStage,
        new_value:   toStage,
        changed_by:  userId || null,
      });
    }

    const { error } = await supabase.from("change_history").insert(rows);
    if (error) console.warn("conversion history insert failed:", error.message);
  },

  async logMeetingEvent({ entityType, entityId, meetingTitle, eventType, details, userId }) {
    const labels = {
      scheduled:   "Meeting Scheduled",
      updated:     "Meeting Updated",
      rescheduled: "Meeting Rescheduled",
      cancelled:   "Meeting Cancelled",
      completed:   "Meeting Completed",
      deleted:     "Meeting Deleted",
    };
    const { error } = await supabase.from("change_history").insert({
      entity_type: entityType,
      entity_id:   entityId,
      field_name:  `meeting_${eventType}`,
      field_label: labels[eventType] || `Meeting ${eventType}`,
      old_value:   null,
      new_value:   details || meetingTitle || "Meeting",
      changed_by:  userId || null,
    });
    if (error) console.warn("logMeetingEvent history insert failed:", error.message);
  },

  async getForEntity(entityType, entityId) {
    // Try with FK join first for inline profile data
    let { data, error } = await supabase
      .from("change_history")
      .select("*, changed_by_profile:profiles!change_history_changed_by_fkey(full_name, avatar_url)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (error) {
      // FK constraint name not found — fetch plain, then manually enrich with profiles
      const plain = await supabase
        .from("change_history")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (plain.error) {
        console.warn("change_history fetch failed:", plain.error.message);
        return [];
      }
      data = plain.data || [];

      const userIds = [...new Set(data.filter((r) => r.changed_by).map((r) => r.changed_by))];
      if (userIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id,full_name,avatar_url").in("id", userIds);
        const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
        data = data.map((r) => ({ ...r, changed_by_profile: r.changed_by ? (profileMap[r.changed_by] || null) : null }));
      }
    }

    return data || [];
  },
};

// Tracked fields per entity type
export const LEAD_TRACKED_FIELDS     = [
  "contact_name", "company_name", "designation", "email", "phone",
  "stage", "temperature", "priority", "source",
  "assigned_to", "follow_up_date", "budget", "remarks",
];
export const DEAL_TRACKED_FIELDS     = [
  "contact_name", "stage", "value", "close_date", "company_name",
  "temperature", "assigned_to", "remarks", "designation",
];
export const PIPELINE_TRACKED_FIELDS = ["contact_name", "pipeline_stage", "assigned_to", "company_name"];
