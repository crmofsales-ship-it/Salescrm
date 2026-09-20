import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { chatService } from "../services/chatService";
import { teamService } from "../services/teamService";
import { db as supabase } from "../lib/db";
import toast from "react-hot-toast";
import { format, isToday, isYesterday } from "date-fns";
import {
  Send, Plus, Paperclip, X, Trash2, Search, Pin,
  Video, Phone, CalendarPlus, CheckSquare, MoreHorizontal,
  File, MessageSquare, UserPlus, ChevronDown, User, CheckCheck,
  Users, Hash,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtShort = (d) => {
  const date = new Date(d);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
};

const fmtFull = (d) => {
  const date = new Date(d);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return `Yesterday ${format(date, "h:mm a")}`;
  return format(date, "MMM d, h:mm a");
};

const isOnline = (onlineAt) => {
  if (!onlineAt) return false;
  return Date.now() - new Date(onlineAt).getTime() < 5 * 60 * 1000;
};

const cleanName = (ch) =>
  ch.displayName ||
  ch._dmUser?.full_name ||
  (ch.name && /^dm-[a-f0-9-]+$/i.test(ch.name) ? "Direct Message" : ch.name) ||
  "Chat";

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user, size = 32, showOnline = false }) {
  const initials =
    user?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {user?.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={initials}
          style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            width: size, height: size, borderRadius: "50%",
            background: "linear-gradient(135deg,#6366F1,#8B5CF6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: size * 0.36, fontWeight: 700, color: "#fff",
          }}
        >
          {initials}
        </div>
      )}
      {showOnline && (
        <div
          style={{
            position: "absolute", bottom: 1, right: 1,
            width: size * 0.28, height: size * 0.28,
            borderRadius: "50%",
            background: isOnline(user?.online_at) ? "#10B981" : "#9CA3AF",
            border: "2px solid var(--surface)",
          }}
        />
      )}
    </div>
  );
}

// ─── Date Separator ───────────────────────────────────────────────────────────

function DateSep({ date }) {
  const d = new Date(date);
  const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMMM d, yyyy");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 12px" }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, padding: "2px 10px", background: "var(--surface-2)", borderRadius: 99, border: "1px solid var(--border)" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, isMine, onDelete, onPin, onConvertTask }) {
  const [hovered, setHovered] = useState(false);

  if (msg.deleted_at) {
    return (
      <div style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: 12, paddingLeft: isMine ? 0 : 2 }}>
        Message deleted
      </div>
    );
  }

  const isImage = msg.type === "image";
  const isFile = msg.type === "file";

  return (
    <div
      style={{ display: "flex", flexDirection: isMine ? "row-reverse" : "row", gap: 8, alignItems: "flex-end", marginBottom: 2, position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ maxWidth: "65%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", gap: 2 }}>
        {msg.pinned && (
          <div style={{ fontSize: 10, color: "#F59E0B", display: "flex", alignItems: "center", gap: 3 }}>
            <Pin size={8} /> Pinned
          </div>
        )}

        {isImage ? (
          <div style={{ padding: 4, borderRadius: 14, background: isMine ? "var(--accent)" : "var(--surface-2)", border: "1px solid var(--border)" }}>
            <img src={msg.file_url} alt="img" style={{ maxWidth: 220, borderRadius: 10, display: "block" }} />
          </div>
        ) : isFile ? (
          <div className={isMine ? "chat-bubble-sent" : "chat-bubble-received"}>
            <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
              <File size={13} style={{ flexShrink: 0 }} />
              <span style={{ textDecoration: "underline", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {msg.file_name}
              </span>
            </a>
          </div>
        ) : (
          <div className={isMine ? "chat-bubble-sent" : "chat-bubble-received"} style={{ lineHeight: 1.55 }}>
            {msg.content}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 3px" }}>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{fmtFull(msg.created_at)}</span>
          {isMine && <CheckCheck size={11} style={{ color: "var(--text-muted)" }} />}
        </div>
      </div>

      {hovered && (
        <div style={{
          display: "flex", alignItems: "center", gap: 2,
          position: "absolute", top: 0,
          ...(isMine ? { left: 0, transform: "translateX(-108%)" } : { right: 0, transform: "translateX(108%)" }),
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "3px 4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)", zIndex: 10,
        }}>
          <HoverBtn icon={Pin} title="Pin" onClick={() => onPin(msg)} />
          <HoverBtn icon={CheckSquare} title="Convert to Task" onClick={() => onConvertTask(msg)} />
          {isMine && <HoverBtn icon={Trash2} title="Delete" onClick={() => onDelete(msg.id)} danger />}
        </div>
      )}
    </div>
  );
}

function HoverBtn({ icon: Icon, title, onClick, danger }) {
  return (
    <button title={title} onClick={onClick}
      style={{ background: "none", border: "none", cursor: "pointer", padding: "3px 5px", borderRadius: 5, color: danger ? "#EF4444" : "var(--text-muted)", display: "flex", alignItems: "center" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
      <Icon size={12} />
    </button>
  );
}

// ─── Pinned Banner ────────────────────────────────────────────────────────────

function PinnedBanner({ messages, onUnpin }) {
  const [open, setOpen] = useState(false);
  if (!messages.length) return null;
  return (
    <div style={{ background: "rgba(245,158,11,0.06)", borderBottom: "1px solid rgba(245,158,11,0.18)", padding: "7px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Pin size={11} style={{ color: "#F59E0B" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#92400E" }}>
            {messages.length} pinned message{messages.length > 1 ? "s" : ""}
          </span>
        </div>
        <ChevronDown size={12} style={{ color: "#F59E0B", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </div>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {messages.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(245,158,11,0.07)", borderRadius: 7, padding: "5px 10px" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.content}
              </span>
              <button onClick={() => onUnpin(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", paddingLeft: 8 }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Convert to Task Modal ────────────────────────────────────────────────────

function ConvertTaskModal({ message, currentUserId, onClose }) {
  const [title, setTitle] = useState(message?.content?.slice(0, 80) || "");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Enter a task title"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("tasks").insert({
        title: title.trim(), assigned_to: currentUserId, created_by: currentUserId,
        status: "todo", priority: "medium", due_date: dueDate || null,
      });
      if (error) throw error;
      toast.success("Task created!");
      onClose();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 380 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Convert to Task</h3>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="crm-label">Task Title</label>
            <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter task title..." autoFocus />
          </div>
          <div>
            <label className="crm-label">Due Date (optional)</label>
            <input className="crm-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Creating…" : "Create Task"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar sub-components ───────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{ padding: "10px 16px 4px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function ConvoItem({ channel, active, onClick, lastMsg, unread, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const dmUser = channel._dmUser;
  const name = cleanName(channel);
  const isGroup = channel.type !== "direct";

  const preview = lastMsg
    ? lastMsg.type === "file" || lastMsg.type === "image"
      ? `📎 ${lastMsg.file_name || "File"}`
      : lastMsg.content || ""
    : "No messages yet";

  const ts = lastMsg?.created_at ? fmtShort(lastMsg.created_at) : "";

  return (
    <div style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <button
        onClick={onClick}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "9px 16px",
          background: active ? "rgba(99,102,241,0.1)" : hovered ? "var(--surface-2)" : "none",
          border: "none", cursor: "pointer", textAlign: "left",
          borderLeft: `3px solid ${active ? "var(--accent)" : "transparent"}`,
          transition: "background 0.12s",
        }}
      >
        {dmUser ? (
          <Avatar user={dmUser} size={38} showOnline />
        ) : (
          <div style={{ width: 38, height: 38, borderRadius: 10, background: isGroup ? "rgba(16,185,129,0.12)" : "rgba(99,102,241,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {isGroup ? <Hash size={16} style={{ color: "#10B981" }} /> : <MessageSquare size={16} style={{ color: "#6366F1" }} />}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, paddingRight: hovered ? 20 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontSize: 13.5, fontWeight: unread ? 700 : 500, color: active ? "var(--accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
              {name}
            </span>
            {ts && !hovered && <span style={{ fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 }}>{ts}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: unread ? "var(--text-2)" : "var(--text-muted)", fontWeight: unread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "85%" }}>
              {preview}
            </span>
            {unread && !hovered && (
              <div style={{ minWidth: 8, height: 8, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
            )}
          </div>
        </div>
      </button>

      {/* Delete button on hover */}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove "${name}" from your conversations?`)) onDelete(channel.id); }}
          title="Remove conversation"
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 5, borderRadius: 6, display: "flex", alignItems: "center" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "#EF4444"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function TeamMemberItem({ member, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 16px", background: hovered ? "var(--surface-2)" : "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Avatar user={member} size={32} showOnline />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {member.full_name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{member.role || "Team"}</div>
      </div>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: isOnline(member.online_at) ? "#10B981" : "var(--border)", flexShrink: 0 }} />
    </button>
  );
}

function IconBtn({ icon: Icon, title, onClick, accent }) {
  return (
    <button title={title} onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 34, height: 34, borderRadius: 8,
        background: accent ? "rgba(99,102,241,0.1)" : "none",
        border: accent ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent",
        cursor: "pointer",
        color: accent ? "#6366F1" : "var(--text-muted)",
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { if (!accent) e.currentTarget.style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { if (!accent) e.currentTarget.style.background = "none"; }}>
      <Icon size={16} />
    </button>
  );
}

// ─── New Chat Modal ───────────────────────────────────────────────────────────

function NewChatModal({ teamMembers, currentUserId, onClose, onOpenDM, onCreateGroup }) {
  const [tab, setTab] = useState("dm");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = teamMembers.filter((m) =>
    m.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (m) => {
    setSelected((p) => p.find((x) => x.id === m.id) ? p.filter((x) => x.id !== m.id) : [...p, m]);
  };

  const handleCreate = async () => {
    if (tab === "dm") return;
    if (!selected.length) { toast.error("Select at least one member"); return; }
    if (!groupName.trim()) { toast.error("Enter a group name"); return; }
    setCreating(true);
    try {
      await onCreateGroup(groupName.trim(), selected);
      onClose();
    } catch (e) { toast.error(e.message); } finally { setCreating(false); }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 420, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>New Conversation</h3>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          {[
            { key: "dm", icon: User, label: "Direct Message" },
            { key: "group", icon: Users, label: "Group Chat" },
          ].map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => { setTab(key); setSelected([]); }}
              style={{ flex: 1, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === key ? 700 : 500, color: tab === key ? "var(--accent)" : "var(--text-muted)", borderBottom: `2px solid ${tab === key ? "var(--accent)" : "transparent"}`, marginBottom: -1 }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, flex: 1, overflow: "hidden" }}>
          {tab === "group" && (
            <input
              className="crm-input"
              placeholder="Group name (e.g. Sales Team)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          )}

          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input className="crm-input" style={{ paddingLeft: 30 }} placeholder="Search team members..." value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {filtered.map((m) => {
              const sel = selected.some((x) => x.id === m.id);
              return (
                <button key={m.id}
                  onClick={() => { if (tab === "dm") { onOpenDM(m); onClose(); } else toggleSelect(m); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", background: sel ? "rgba(99,102,241,0.08)" : "none", border: `1px solid ${sel ? "rgba(99,102,241,0.2)" : "transparent"}`, borderRadius: 9, cursor: "pointer", textAlign: "left", transition: "all 0.12s" }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "none"; }}>
                  <Avatar user={m} size={34} showOnline />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{m.full_name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{m.role || "Team"} · {isOnline(m.online_at) ? "Online" : "Offline"}</div>
                  </div>
                  {tab === "group" && sel && (
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <CheckCheck size={11} style={{ color: "#fff" }} />
                    </div>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No team members found</div>
            )}
          </div>

          {tab === "group" && (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4, borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={creating || !selected.length || !groupName.trim()}>
                {creating ? "Creating…" : `Create Group (${selected.length} selected)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Chat Component ──────────────────────────────────────────────────────

export default function Chat() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [taskMsg, setTaskMsg] = useState(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);

  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const subRef = useRef(null);

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: channels = [], refetch: refetchChannels } = useQuery({
    queryKey: ["chat-channels", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      await chatService.ensurePublicChannels(profile.id);
      return chatService.getChannels(profile.id);
    },
    enabled: !!profile?.id,
    refetchInterval: 30000,
  });

  const { data: teamRaw } = useQuery({
    queryKey: ["team-all"],
    queryFn: () => teamService.getAll(),
  });
  // Deduplicate team members by id in case the API returns duplicates
  const teamMembers = Array.from(
    new Map(
      (teamRaw?.data || teamRaw || [])
        .filter((m) => m.id !== profile?.id)
        .map((m) => [m.id, m])
    ).values()
  );

  const channelIds = channels.map((c) => c.id).join(",");
  const { data: lastMsgMap = {} } = useQuery({
    queryKey: ["chat-last-msgs", channelIds],
    queryFn: async () => {
      if (!channels.length) return {};
      const { data } = await supabase
        .from("chat_messages")
        .select("id, channel_id, content, type, file_name, created_at, sender_id, deleted_at")
        .in("channel_id", channels.map((c) => c.id))
        .order("created_at", { ascending: false })
        .limit(500);
      const map = {};
      (data || []).forEach((m) => {
        if (!map[m.channel_id] && !m.deleted_at) map[m.channel_id] = m;
      });
      return map;
    },
    enabled: channels.length > 0,
    refetchInterval: 15000,
  });

  // ── Sidebar helpers ───────────────────────────────────────────────────────

  // Deduplicate DMs by partner user ID — if the same user somehow has two DM channels,
  // keep the one with the most recent activity (prevents "Kanishka showing twice" issues)
  const dmsDeduped = new Map();
  [...channels.filter((c) => c.type === "direct" && (c._dmUser || c.displayName))]
    .sort((a, b) => {
      const ta = lastMsgMap[a.id]?.created_at || a.created_at || 0;
      const tb = lastMsgMap[b.id]?.created_at || b.created_at || 0;
      return new Date(tb) - new Date(ta);
    })
    .forEach((ch) => {
      const key = ch._dmUser?.id || ch.displayName;
      if (!dmsDeduped.has(key)) dmsDeduped.set(key, ch);
    });
  const dms = Array.from(dmsDeduped.values());
  const groupChannels = channels.filter((c) => c.type !== "direct");

  const hasUnread = (ch) => {
    const lm = lastMsgMap[ch.id];
    if (!lm || lm.sender_id === profile?.id) return false;
    if (!ch.last_read_at) return true;
    return new Date(lm.created_at) > new Date(ch.last_read_at);
  };

  const filterList = (list) => {
    let out = list;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((c) => cleanName(c).toLowerCase().includes(q));
    }
    if (tab === "unread") out = out.filter(hasUnread);
    return out;
  };

  const pinnedDMs = dms.filter((c) => c.starred);
  const recentDMs = dms
    .filter((c) => !c.starred)
    .sort((a, b) => {
      const ta = lastMsgMap[a.id]?.created_at || a.created_at || 0;
      const tb = lastMsgMap[b.id]?.created_at || b.created_at || 0;
      return new Date(tb) - new Date(ta);
    });

  const existingDMUserIds = new Set(dms.map((c) => c._dmUser?.id).filter(Boolean));
  const sortedTeam = [
    ...teamMembers.filter((m) => isOnline(m.online_at) && !existingDMUserIds.has(m.id)),
    ...teamMembers.filter((m) => !isOnline(m.online_at) && !existingDMUserIds.has(m.id)),
  ].filter((m) => !search || m.full_name.toLowerCase().includes(search.toLowerCase()));

  // ── Messages ──────────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (channelId) => {
    if (!channelId) return;
    setLoadingMsgs(true);
    try {
      const msgs = await chatService.getMessages(channelId, 80);
      setMessages(msgs);
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (!activeChannel) return;
    loadMessages(activeChannel.id);
    if (profile?.id) chatService.markChannelRead(activeChannel.id, profile.id);

    if (subRef.current) supabase.removeChannel(subRef.current);
    subRef.current = chatService.subscribeToMessages(activeChannel.id, (payload) => {
      if (payload.eventType === "INSERT" && payload.new?.sender_id !== profile?.id) {
        supabase
          .from("chat_messages")
          .select("*, sender:profiles!sender_id(id, full_name, avatar_url)")
          .eq("id", payload.new.id)
          .single()
          .then(({ data }) => { if (data) setMessages((p) => [...p, data]); });
      }
      if (payload.eventType === "UPDATE") {
        setMessages((p) => p.map((m) => m.id === payload.new.id ? { ...m, ...payload.new } : m));
      }
    });

    return () => { if (subRef.current) supabase.removeChannel(subRef.current); };
  }, [activeChannel?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  useEffect(() => {
    if (!profile?.id) return;
    const update = () => supabase.from("profiles").update({ online_at: new Date().toISOString() }).eq("id", profile.id);
    update();
    const i = setInterval(update, 120000);
    return () => clearInterval(i);
  }, [profile?.id]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeChannel) return;
    const optimistic = { id: `tmp-${Date.now()}`, channel_id: activeChannel.id, sender_id: profile.id, content: text, type: "text", created_at: new Date().toISOString(), sender: profile };
    setMessages((p) => [...p, optimistic]);
    setInput("");
    inputRef.current?.focus();
    try {
      const saved = await chatService.sendMessage({ channel_id: activeChannel.id, sender_id: profile.id, content: text, type: "text" });
      setMessages((p) => p.map((m) => m.id === optimistic.id ? saved : m));
      refetchChannels();
    } catch (e) {
      setMessages((p) => p.filter((m) => m.id !== optimistic.id));
      toast.error(e.message);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFile = async (file) => {
    if (!file || !activeChannel) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("Max file size is 50 MB"); return; }
    setUploading(true);
    try {
      const { url, name, type: mime } = await chatService.uploadFile(file, profile.id);
      const msgType = mime.startsWith("image/") ? "image" : "file";
      const saved = await chatService.sendMessage({ channel_id: activeChannel.id, sender_id: profile.id, content: name, type: msgType, file_url: url, file_name: name });
      setMessages((p) => [...p, saved]);
      refetchChannels();
    } catch (e) { toast.error(e.message); } finally { setUploading(false); }
  };

  const handlePin = async (msg) => {
    try {
      await supabase.from("chat_messages").update({ pinned: !msg.pinned }).eq("id", msg.id);
      setMessages((p) => p.map((m) => m.id === msg.id ? { ...m, pinned: !msg.pinned } : m));
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async (id) => {
    try {
      await chatService.deleteMessage(id);
      setMessages((p) => p.map((m) => m.id === id ? { ...m, deleted_at: new Date().toISOString() } : m));
    } catch (e) { toast.error(e.message); }
  };

  const openDM = async (member) => {
    try {
      const channel = await chatService.getOrCreateDM(profile.id, member.id);
      channel._dmUser = member;
      channel.displayName = member.full_name;
      setActiveChannel(channel);
      refetchChannels();
    } catch (e) { toast.error(e.message); }
  };

  const handleDeleteConvo = async (channelId) => {
    try {
      await supabase.from("channel_members").delete().eq("channel_id", channelId).eq("user_id", profile.id);
      if (activeChannel?.id === channelId) setActiveChannel(null);
      refetchChannels();
      toast.success("Conversation removed");
    } catch (e) { toast.error(e.message); }
  };

  const handleCreateGroup = async (name, members) => {
    const { data: newChannel, error } = await supabase
      .from("chat_channels")
      .insert({ type: "group", name, is_private: true })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("channel_members").insert([
      { channel_id: newChannel.id, user_id: profile.id },
      ...members.map((m) => ({ channel_id: newChannel.id, user_id: m.id })),
    ]);

    newChannel.displayName = name;
    setActiveChannel(newChannel);
    refetchChannels();
    toast.success(`Group "${name}" created`);
  };

  const handleJitsiCall = () => {
    if (!activeChannel) return;
    const room = `SalesCRM-${activeChannel.id.slice(0, 8).toUpperCase()}`;
    window.open(`https://meet.jit.si/${room}`, "_blank");
  };

  const handleScheduleMeeting = () => {
    const dmUser = activeChannel?._dmUser;
    navigate("/meetings", { state: { openForm: true, prefill: dmUser ? { internal_attendee: dmUser.id, title: `Meeting with ${dmUser.full_name}` } : {} } });
  };

  // ── Message grouping ──────────────────────────────────────────────────────

  const grouped = [];
  let lastDate = null, lastSender = null;
  messages.forEach((msg) => {
    const dateKey = new Date(msg.created_at).toDateString();
    if (dateKey !== lastDate) {
      grouped.push({ type: "date", date: msg.created_at, key: `d-${msg.created_at}` });
      lastDate = dateKey; lastSender = null;
    }
    grouped.push({ type: "msg", msg, showSender: !msg.deleted_at && msg.sender_id !== profile?.id && msg.sender_id !== lastSender });
    if (!msg.deleted_at) lastSender = msg.sender_id;
  });

  const pinnedMessages = messages.filter((m) => m.pinned && !m.deleted_at);
  const fileMessages = messages.filter((m) => (m.type === "file" || m.type === "image") && !m.deleted_at).slice(-5).reverse();
  const dmUser = activeChannel?._dmUser;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg)", overflow: "hidden" }}>

      {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════════════ */}
      <div style={{ width: 280, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "14px 16px 0", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em" }}>Chat</h2>
            <button onClick={() => setShowNewChat(true)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              <Plus size={13} /> New Chat
            </button>
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              className="crm-input"
              style={{ paddingLeft: 30, height: 34, fontSize: 12.5 }}
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0 }}>
            {["all", "unread", "groups"].map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "7px 0",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 12.5, fontWeight: tab === t ? 700 : 500,
                  color: tab === t ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                  transition: "all 0.15s", textTransform: "capitalize",
                }}>
                {t === "all" ? "All" : t === "unread" ? "Unread" : "Groups"}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>

          {tab === "groups" ? (
            filterList(groupChannels).length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No groups yet. Create one with <strong>+ New Chat</strong></div>
            ) : filterList(groupChannels).map((ch) => (
              <ConvoItem key={ch.id} channel={ch} active={activeChannel?.id === ch.id} onClick={() => setActiveChannel(ch)} lastMsg={lastMsgMap[ch.id]} unread={hasUnread(ch)} onDelete={handleDeleteConvo} />
            ))
          ) : (
            <>
              {/* PINNED */}
              {filterList(pinnedDMs).length > 0 && (
                <>
                  <SectionLabel>PINNED</SectionLabel>
                  {filterList(pinnedDMs).map((ch) => (
                    <ConvoItem key={ch.id} channel={ch} active={activeChannel?.id === ch.id} onClick={() => setActiveChannel(ch)} lastMsg={lastMsgMap[ch.id]} unread={hasUnread(ch)} onDelete={handleDeleteConvo} />
                  ))}
                </>
              )}

              {/* RECENT */}
              {filterList(recentDMs).length > 0 && (
                <>
                  <SectionLabel>RECENT</SectionLabel>
                  {filterList(recentDMs).map((ch) => (
                    <ConvoItem key={ch.id} channel={ch} active={activeChannel?.id === ch.id} onClick={() => setActiveChannel(ch)} lastMsg={lastMsgMap[ch.id]} unread={hasUnread(ch)} onDelete={handleDeleteConvo} />
                  ))}
                </>
              )}

              {/* TEAM MEMBERS (not yet chatted) */}
              {sortedTeam.length > 0 && (
                <>
                  <SectionLabel>TEAM MEMBERS</SectionLabel>
                  {sortedTeam.map((m) => (
                    <TeamMemberItem key={m.id} member={m} onClick={() => openDM(m)} />
                  ))}
                </>
              )}

              {filterList(recentDMs).length === 0 && filterList(pinnedDMs).length === 0 && sortedTeam.length === 0 && (
                <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  {tab === "unread" ? "No unread conversations" : "No conversations yet"}
                </div>
              )}
            </>
          )}
        </div>

        {/* Current user footer */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 9 }}>
          <Avatar user={profile} size={30} showOnline />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.full_name}</div>
            <div style={{ fontSize: 10.5, color: "#10B981", fontWeight: 600 }}>● Online</div>
          </div>
        </div>
      </div>

      {/* ══ MAIN CHAT AREA ════════════════════════════════════════════════════ */}
      {!activeChannel ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, background: "var(--surface-2)" }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(99,102,241,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MessageSquare size={34} style={{ color: "#6366F1", opacity: 0.5 }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Select a conversation</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Choose a team member from the sidebar to start chatting</div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Chat header */}
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "var(--surface)" }}>
            {dmUser ? (
              <>
                <Avatar user={dmUser} size={36} showOnline />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)" }}>{dmUser.full_name}</div>
                  <div style={{ fontSize: 11.5, color: isOnline(dmUser.online_at) ? "#10B981" : "var(--text-muted)", fontWeight: 600 }}>
                    ● {isOnline(dmUser.online_at) ? "Online" : "Offline"}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MessageSquare size={18} style={{ color: "#6366F1" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: "var(--text)" }}>{cleanName(activeChannel)}</div>
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              <IconBtn icon={Search} title="Search in chat" />
              <IconBtn icon={Video} title="Start video call" onClick={handleJitsiCall} accent />
              <IconBtn icon={Phone} title="Voice call" onClick={handleJitsiCall} />
              <IconBtn icon={UserPlus} title="Add participant" />
              <IconBtn icon={MoreHorizontal} title={showDetails ? "Hide details" : "Show details"} onClick={() => setShowDetails((v) => !v)} />
            </div>
          </div>

          {/* Pinned banner */}
          <PinnedBanner messages={pinnedMessages} onUnpin={(id) => handlePin(messages.find((m) => m.id === id))} />

          {/* Messages area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
            {loadingMsgs ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite" }} />
              </div>
            ) : grouped.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 10, color: "var(--text-muted)" }}>
                <MessageSquare size={32} style={{ opacity: 0.25 }} />
                <span style={{ fontSize: 13 }}>No messages yet — say hello!</span>
              </div>
            ) : (
              grouped.map((item) => {
                if (item.type === "date") return <DateSep key={item.key} date={item.date} />;
                const { msg, showSender } = item;
                const isMine = msg.sender_id === profile?.id;
                return (
                  <div key={msg.id} style={{ marginBottom: 4 }}>
                    {showSender && !isMine && (
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                        <Avatar user={msg.sender} size={22} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>{msg.sender?.full_name}</span>
                      </div>
                    )}
                    <div style={{ paddingLeft: isMine ? 0 : 29 }}>
                      <MessageBubble msg={msg} isMine={isMine} onDelete={handleDelete} onPin={handlePin} onConvertTask={setTaskMsg} />
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{ padding: "10px 16px 14px", borderTop: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
            <div
              style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "var(--bg)", borderRadius: 12, border: "1.5px solid var(--border)", padding: "8px 12px", transition: "border-color 0.15s" }}
              onFocusCapture={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", color: "var(--text-muted)", flexShrink: 0, display: "flex" }}>
                {uploading
                  ? <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
                  : <Paperclip size={16} />}
              </button>

              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", fontFamily: "inherit", fontSize: 13.5, color: "var(--text)", lineHeight: 1.5, maxHeight: 120, overflowY: "auto", padding: "2px 0" }}
              />

              <button onClick={handleSend} disabled={!input.trim()}
                style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: input.trim() ? "var(--accent)" : "var(--surface-2)", border: `1.5px solid ${input.trim() ? "var(--accent)" : "var(--border)"}`, cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                <Send size={14} style={{ color: input.trim() ? "#fff" : "var(--text-muted)" }} />
              </button>
            </div>
            <input ref={fileRef} type="file" style={{ display: "none" }}
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.mp4"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        </div>
      )}

      {/* ══ RIGHT DETAILS PANEL ═══════════════════════════════════════════════ */}
      {activeChannel && showDetails && (
        <div style={{ width: 290, flexShrink: 0, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)", overflow: "hidden" }}>

          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>Conversation Details</span>
            <button onClick={() => setShowDetails(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: 6, display: "flex" }}>
              <X size={15} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>

            {/* User profile card */}
            {dmUser && (
              <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)" }}>
                <Avatar user={dmUser} size={56} showOnline />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5, color: "var(--text)" }}>{dmUser.full_name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{dmUser.role || "Team Member"}</div>
                  <div style={{ fontSize: 11.5, color: isOnline(dmUser.online_at) ? "#10B981" : "var(--text-muted)", fontWeight: 600, marginTop: 4 }}>
                    ● {isOnline(dmUser.online_at) ? "Online" : "Offline"}
                  </div>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 12 }}>
                ACTIONS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                {[
                  { icon: User, label: "Profile", onClick: null },
                  { icon: Phone, label: "Call", onClick: handleJitsiCall },
                  { icon: Video, label: "Video Call", onClick: handleJitsiCall },
                  { icon: CalendarPlus, label: "Schedule\nMeeting", onClick: handleScheduleMeeting },
                ].map(({ icon: Icon, label, onClick }) => (
                  <button key={label} onClick={onClick}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", cursor: onClick ? "pointer" : "default", padding: "8px 4px", borderRadius: 10, color: "var(--text-muted)", transition: "all 0.15s" }}
                    onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--accent)"; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}>
                    <Icon size={18} />
                    <span style={{ fontSize: 9.5, fontWeight: 600, textAlign: "center", lineHeight: 1.3, whiteSpace: "pre-line" }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Shared files */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>FILES</div>
                {fileMessages.length > 0 && (
                  <button style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>See all</button>
                )}
              </div>
              {fileMessages.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "10px 0" }}>No files shared yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {fileMessages.map((m) => (
                    <a key={m.id} href={m.file_url} target="_blank" rel="noopener noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", background: "var(--surface-2)", borderRadius: 8, textDecoration: "none", border: "1px solid var(--border)", transition: "background 0.12s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.06)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <File size={13} style={{ color: "#6366F1" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.file_name || m.content}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{fmtShort(m.created_at)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Schedule meeting CTA */}
            <div style={{ padding: "14px 16px" }}>
              <button onClick={handleScheduleMeeting}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 14px", background: "rgba(99,102,241,0.06)", border: "1.5px dashed rgba(99,102,241,0.3)", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--accent)", transition: "all 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.12)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.06)")}>
                <CalendarPlus size={15} />
                Schedule a Meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Task modal */}
      {taskMsg && <ConvertTaskModal message={taskMsg} currentUserId={profile?.id} onClose={() => setTaskMsg(null)} />}

      {/* New Chat modal */}
      {showNewChat && (
        <NewChatModal
          teamMembers={teamMembers}
          currentUserId={profile?.id}
          onClose={() => setShowNewChat(false)}
          onOpenDM={openDM}
          onCreateGroup={handleCreateGroup}
        />
      )}
    </div>
  );
}
