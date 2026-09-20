import { db as supabase } from "../lib/db";

export const tasksService = {
  async getAll({ status = "", priority = "", assignedTo = "", search = "" } = {}) {
    let query = supabase
      .from("tasks")
      .select(`
        *,
        assigned_profile:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url),
        created_by_profile:profiles!tasks_created_by_fkey(id, full_name)
      `, { count: "exact" })
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (priority) query = query.eq("priority", priority);
    if (assignedTo) query = query.eq("assigned_to", assignedTo);
    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  },

  async getById(id) {
    const { data, error } = await supabase
      .from("tasks")
      .select(`
        *,
        assigned_profile:profiles!tasks_assigned_to_fkey(id, full_name, avatar_url),
        comments:task_comments(
          *,
          author:profiles!task_comments_author_id_fkey(id, full_name, avatar_url)
        )
      `)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(payload) {
    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase
      .from("tasks")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw error;
  },

  async updateStatus(id, status) {
    return this.update(id, { status });
  },

  async addComment(taskId, authorId, content) {
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: taskId, author_id: authorId, content })
      .select(`*, author:profiles!task_comments_author_id_fkey(id, full_name, avatar_url)`)
      .single();
    if (error) throw error;
    return data;
  },

  async getStats(userId) {
    const { data, error } = await supabase
      .from("tasks")
      .select("status, priority, due_date")
      .eq("assigned_to", userId);
    if (error) throw error;
    const now = new Date();
    return {
      total: data?.length || 0,
      todo: data?.filter((t) => t.status === "todo").length || 0,
      inProgress: data?.filter((t) => t.status === "in_progress").length || 0,
      done: data?.filter((t) => t.status === "done").length || 0,
      overdue: data?.filter((t) => t.due_date && new Date(t.due_date) < now && t.status !== "done").length || 0,
    };
  },
};
