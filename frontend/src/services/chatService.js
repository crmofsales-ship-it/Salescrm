import { db as supabase } from "../lib/db";

export const chatService = {
  async ensurePublicChannels(userId) {
    const { data: joined } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", userId);

    const { data: publicChannels } = await supabase
      .from("chat_channels")
      .select("id")
      .eq("type", "channel")
      .eq("is_private", false);

    if (!publicChannels?.length) return;

    const joinedIds = new Set((joined || []).map((m) => m.channel_id));
    const toJoin = publicChannels.filter((c) => !joinedIds.has(c.id));
    if (toJoin.length > 0) {
      await supabase.from("channel_members").insert(
        toJoin.map((c) => ({ channel_id: c.id, user_id: userId }))
      );
    }
  },

  async getChannels(userId) {
    const { data, error } = await supabase
      .from("channel_members")
      .select("channel:chat_channels(*), last_read_at")
      .eq("user_id", userId);
    if (error) throw error;

    const channels = (data || [])
      .map((d) => ({ ...d.channel, last_read_at: d.last_read_at }))
      .filter(Boolean);

    // Batch-resolve DM other-user names (one query, not N+1)
    const dmIds = channels.filter((c) => c.type === "direct").map((c) => c.id);
    if (dmIds.length > 0) {
      const { data: members } = await supabase
        .from("channel_members")
        .select("channel_id, user:profiles(id, full_name, avatar_url, online_at)")
        .in("channel_id", dmIds)
        .neq("user_id", userId);

      const memberMap = {};
      (members || []).forEach((m) => { if (m.user) memberMap[m.channel_id] = m.user; });
      channels.forEach((ch) => {
        if (ch.type === "direct" && memberMap[ch.id]) {
          ch._dmUser = memberMap[ch.id];
          ch.displayName = memberMap[ch.id].full_name;
        }
      });
    }

    // Sort: channels first, then DMs, each alphabetically
    return channels.sort((a, b) => {
      if (a.type !== b.type) return a.type === "channel" ? -1 : 1;
      const na = (a.displayName || a.name || "").toLowerCase();
      const nb = (b.displayName || b.name || "").toLowerCase();
      return na.localeCompare(nb);
    });
  },

  async getOrCreateDM(userId1, userId2) {
    const { data: m1 } = await supabase
      .from("channel_members")
      .select("channel_id, channel:chat_channels(id,type,created_at)")
      .eq("user_id", userId1);

    const { data: m2 } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", userId2);

    const ids2 = new Set((m2 || []).map((m) => m.channel_id));
    // Find ALL shared direct channels, pick the most recently created one
    const shared = (m1 || [])
      .filter((m) => ids2.has(m.channel_id) && m.channel?.type === "direct")
      .sort((a, b) => new Date(b.channel?.created_at || 0) - new Date(a.channel?.created_at || 0));

    if (shared.length > 0) {
      const { data: ch } = await supabase.from("chat_channels").select("*").eq("id", shared[0].channel_id).single();
      if (ch) return ch;
    }

    const { data: newChannel, error } = await supabase
      .from("chat_channels")
      .insert({ type: "direct", name: `dm-${userId1.slice(0, 8)}-${userId2.slice(0, 8)}`, is_private: true })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("channel_members").insert([
      { channel_id: newChannel.id, user_id: userId1 },
      { channel_id: newChannel.id, user_id: userId2 },
    ]);
    return newChannel;
  },

  async joinChannel(channelId, userId) {
    const { error } = await supabase
      .from("channel_members")
      .upsert({ channel_id: channelId, user_id: userId });
    if (error) throw error;
  },

  async getMessages(channelId, limit = 60) {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*, sender:profiles!sender_id(id, full_name, avatar_url)")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).reverse();
  },

  async sendMessage(payload) {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert(payload)
      .select("*, sender:profiles!sender_id(id, full_name, avatar_url)")
      .single();
    if (error) throw error;
    return data;
  },

  async deleteMessage(id) {
    const { error } = await supabase
      .from("chat_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async addReaction(messageId, userId, emoji) {
    const { data: msg } = await supabase
      .from("chat_messages")
      .select("reactions")
      .eq("id", messageId)
      .single();

    const reactions = msg?.reactions || {};
    if (!reactions[emoji]) reactions[emoji] = [];
    if (reactions[emoji].includes(userId))
      reactions[emoji] = reactions[emoji].filter((id) => id !== userId);
    else reactions[emoji].push(userId);

    await supabase.from("chat_messages").update({ reactions }).eq("id", messageId);
  },

  async markChannelRead(channelId, userId) {
    await supabase
      .from("channel_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("user_id", userId);
  },

  async uploadFile(file, senderId) {
    const ext = file.name.split(".").pop();
    const path = `${senderId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("chat-files").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("chat-files").getPublicUrl(path);
    return { url: data.publicUrl, name: file.name, type: file.type };
  },

  subscribeToMessages(channelId, callback) {
    return supabase
      .channel(`messages:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` }, callback)
      .subscribe();
  },
};
