import { db as supabase } from "../lib/db";

// ─── Sequence helpers ─────────────────────────────────────────────────────────

// Parse a stored code like "MEET-007" → 7, "MEET-000" → 0, null → 0
function parseCode(code) {
  if (!code || typeof code !== "string") return 0;
  const n = parseInt(code.replace(/^MEET-/i, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function formatCode(n) {
  return `MEET-${String(n).padStart(3, "0")}`;
}

// Returns the next available MEET-XXX by querying the current maximum stored code.
// Queries only the meeting_code column ordered descending so we always get the
// highest used sequence number regardless of deletions — deleted IDs are never reused.
async function generateNextCode() {
  const { data, error } = await supabase
    .from("meetings")
    .select("meeting_code")
    .not("meeting_code", "is", null)
    .order("meeting_code", { ascending: false })
    .limit(1);

  if (error) throw error;
  const last = parseCode(data?.[0]?.meeting_code);
  return formatCode(last + 1);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const meetingsService = {
  async getAll({ status = "" } = {}) {
    let query = supabase
      .from("meetings")
      .select(`
        *,
        created_by_profile:profiles!meetings_created_by_fkey(id, full_name, avatar_url),
        attendees:meeting_attendees(user:profiles(id, full_name, avatar_url)),
        linked_lead:leads!lead_id(lead_code)
      `, { count: "exact" })
      .order("start_time", { ascending: true });

    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) {
      // Fall back without lead join if FK relationship isn't recognised
      let q2 = supabase
        .from("meetings")
        .select(`
          *,
          created_by_profile:profiles!meetings_created_by_fkey(id, full_name, avatar_url),
          attendees:meeting_attendees(user:profiles(id, full_name, avatar_url))
        `, { count: "exact" })
        .order("start_time", { ascending: true });
      if (status) q2 = q2.eq("status", status);
      const { data: d2, error: e2, count: c2 } = await q2;
      if (e2) throw e2;
      return { data: d2 || [], count: c2 || 0 };
    }
    return { data: data || [], count: count || 0 };
  },

  async getUpcoming(limit = 5) {
    const { data, error } = await supabase
      .from("meetings")
      .select(`*, created_by_profile:profiles!meetings_created_by_fkey(id, full_name, avatar_url)`)
      .eq("status", "scheduled")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async create(payload, attendeeIds = []) {
    // ── Step 1: generate a unique sequential meeting_code ──────────────────
    let meetingCode = null;
    let codeGenError = null;

    try {
      meetingCode = await generateNextCode();
    } catch (e) {
      codeGenError = e;
    }

    // ── Step 2: insert meeting, with automatic retry on duplicate code ──────
    let meeting = null;
    let insertError = null;
    const MAX_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const insertPayload = meetingCode
        ? { ...payload, meeting_code: meetingCode }
        : payload;

      const { data, error } = await supabase
        .from("meetings")
        .insert(insertPayload)
        .select()
        .single();

      if (!error) {
        meeting = data;
        break;
      }

      insertError = error;

      // 23505 = unique_violation: another insert raced us → regenerate and retry
      if (error.code === "23505" && attempt < MAX_ATTEMPTS - 1) {
        try { meetingCode = await generateNextCode(); } catch { /* keep going */ }
        continue;
      }

      // 42703 = undefined_column (a column in payload doesn't exist in DB yet)
      // PGRST204 = PostgREST "column not found" variant
      if (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        (error.message || "").includes("meeting_code") ||
        (error.details || "").includes("meeting_code")
      ) {
        // Retry without columns that may not exist yet (meeting_code, priority, location_place_id)
        const { meeting_code: _mc, priority: _p, location_place_id: _lpid, ...basePayload } = insertPayload;
        const { data: d2, error: e2 } = await supabase
          .from("meetings")
          .insert(basePayload)
          .select()
          .single();
        if (e2) throw e2;
        meeting = d2;
        insertError = null;
        break;
      }

      // Any other error — surface it
      throw error;
    }

    if (!meeting) throw insertError || new Error("Failed to create meeting");

    // ── Step 3: add attendees ──────────────────────────────────────────────
    if (attendeeIds.length > 0) {
      await supabase.from("meeting_attendees").insert(
        attendeeIds.map((uid) => ({ meeting_id: meeting.id, user_id: uid }))
      );
    }

    return meeting;
  },

  async update(id, payload, attendeeIds) {
    let { data, error } = await supabase
      .from("meetings")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    // If a column doesn't exist yet, retry without it
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      const { priority: _p, meeting_code: _mc, ...basePayload } = payload;
      const res2 = await supabase
        .from("meetings")
        .update({ ...basePayload, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      data  = res2.data;
      error = res2.error;
    }
    if (error) throw error;

    if (Array.isArray(attendeeIds)) {
      await supabase.from("meeting_attendees").delete().eq("meeting_id", id);
      if (attendeeIds.length > 0) {
        await supabase.from("meeting_attendees").insert(
          attendeeIds.map((uid) => ({ meeting_id: id, user_id: uid }))
        );
      }
    }
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) throw error;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("meetings")
      .select(`
        *,
        created_by_profile:profiles!meetings_created_by_fkey(id, full_name, avatar_url),
        attendees:meeting_attendees(user:profiles(id, full_name, avatar_url))
      `)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
};
