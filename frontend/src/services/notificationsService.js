import { db as supabase } from "../lib/db";

export const notificationsService = {
  async getUnread(userId, limit = 30) {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async getAll(userId, { limit = 30 } = {}) {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    const { data, error } = await supabase
      .from("notifications")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async createSafe({ userId, type, title, body, link, entityType, entityId, priority = "normal" }) {
    // Deduplicate: skip if same entity+type already exists (unread) in last 24h
    if (entityId) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("entity_id", entityId)
        .eq("type", type)
        .gte("created_at", since)
        .limit(1);
      if (existing?.length) return null;
    }
    return this.create({ user_id: userId, type, title, body, link, entity_type: entityType, entity_id: entityId, priority });
  },

  async markRead(id) {
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
    if (error) throw error;
  },

  async markAllRead(userId) {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) throw error;
  },

  async dismiss(id) {
    const { error } = await supabase
      .from("notifications")
      .update({ dismissed: true, read: true })
      .eq("id", id);
    if (error) throw error;
  },

  async dismissAll(userId) {
    const { error } = await supabase
      .from("notifications")
      .update({ dismissed: true, read: true })
      .eq("user_id", userId);
    if (error) throw error;
  },

  async delete(id) {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) throw error;
  },

  async getUnreadCount(userId) {
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false)
      .eq("dismissed", false);
    return count || 0;
  },

  subscribeToUser(userId, callback) {
    return supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, callback)
      .subscribe();
  },
};
