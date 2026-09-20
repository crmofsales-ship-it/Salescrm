import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DndContext, closestCenter, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { useAuth } from "../context/AuthContext";
import { tasksService } from "../services/tasksService";
import { teamService } from "../services/teamService";
import toast from "react-hot-toast";
import {
  format, isPast, isToday, isSameDay, startOfMonth, endOfMonth,
  eachDayOfInterval, addMonths, subMonths, getDay, isSameMonth,
} from "date-fns";
import {
  Plus, X, Edit2, Trash2, CheckSquare, Clock, AlertCircle,
  LayoutList, Columns, CalendarDays, ChevronLeft, ChevronRight,
  Users, CheckCheck, ExternalLink,
} from "lucide-react";
import SkeletonTable from "../components/SkeletonTable";
import { ColumnToggle, TemplateMenu } from "../components/TableControls";
import { useTablePreferences } from "../hooks/useTablePreferences";

const TASK_COLUMNS = [
  { key: "title",    label: "Task",        required: true },
  { key: "priority", label: "Priority" },
  { key: "status",   label: "Status" },
  { key: "assigned", label: "Assigned To" },
  { key: "due",      label: "Due Date" },
];

const STATUSES = [
  { key: "todo",        label: "To Do",       color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  { key: "in_progress", label: "In Progress", color: "#3B82F6", bg: "rgba(59,130,246,0.1)"  },
  { key: "done",        label: "Done",        color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
  { key: "cancelled",   label: "Cancelled",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
];

const PRIORITIES = [
  { key: "urgent", label: "Urgent", color: "#EF4444" },
  { key: "high",   label: "High",   color: "#F59E0B" },
  { key: "medium", label: "Medium", color: "#3B82F6" },
  { key: "low",    label: "Low",    color: "#94A3B8" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function PriorityDot({ priority }) {
  const p = PRIORITIES.find((x) => x.key === priority);
  return <div style={{ width: 7, height: 7, borderRadius: "50%", background: p?.color || "#94A3B8", flexShrink: 0, boxShadow: `0 0 6px ${p?.color || "#94A3B8"}80` }} />;
}

function StatusBadge({ status }) {
  const s = STATUSES.find((x) => x.key === status);
  if (!s) return null;
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
      border: `1px solid ${s.color}25`,
    }}>
      {s.label}
    </span>
  );
}

// ─── Task Form Modal ──────────────────────────────────────────────────────────
function TaskFormModal({ task, onClose, onSave, teamMembers }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: task || { status: "todo", priority: "medium" },
  });
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="modal-box"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        style={{ maxWidth: 520 }}
      >
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{task?.id ? "Edit Task" : "New Task"}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSave)} style={{ padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Task Title *</label>
              <input className="crm-input" {...register("title", { required: "Required" })} placeholder="What needs to be done?" />
              {errors.title && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.title.message}</span>}
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="crm-label">Description</label>
              <textarea className="crm-input" {...register("description")} rows={2} placeholder="More details..." style={{ resize: "vertical" }} />
            </div>
            <div>
              <label className="crm-label">Priority</label>
              <select className="crm-input" {...register("priority")}>
                {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Status</label>
              <select className="crm-input" {...register("status")}>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="crm-label">Due Date</label>
              <input className="crm-input" type="datetime-local" {...register("due_date")} />
            </div>
            {teamMembers?.length > 0 && (
              <div>
                <label className="crm-label">Assign To</label>
                <select className="crm-input" {...register("assigned_to")}>
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : task?.id ? "Save" : "Create Task"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function TaskCard({ task, onEdit, onDelete, onToggle, onOpen, isDragging }) {
  const overdue  = task.due_date && isPast(new Date(task.due_date)) && task.status !== "done";
  const dueToday = task.due_date && isToday(new Date(task.due_date)) && !overdue && task.status !== "done";
  const cardBorderColor = overdue ? "#EF4444" : dueToday ? "#F59E0B" : "transparent";
  const hasLink = task.lead_id || task.deal_id;
  return (
    <div className="kanban-card" style={{ opacity: isDragging ? 0.4 : 1, borderLeft: `3px solid ${cardBorderColor}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <button onClick={(e) => { e.stopPropagation(); onToggle(task); }} style={{ background: "none", border: "none", cursor: "pointer", color: task.status === "done" ? "var(--green)" : "var(--text-muted)", padding: 0, marginTop: 1, flexShrink: 0 }}>
          <CheckSquare size={15} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: task.status === "done" ? "var(--text-muted)" : "var(--text)", textDecoration: task.status === "done" ? "line-through" : "none" }}>
            {task.title}
          </div>
          {task.description && (
            <div className="truncate-2" style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{task.description}</div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <PriorityDot priority={task.priority} />
        <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600, textTransform: "capitalize" }}>{task.priority}</span>
        {task.due_date && (
          <span style={{ fontSize: 11, color: overdue ? "#EF4444" : dueToday ? "#F59E0B" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 2, fontWeight: (overdue || dueToday) ? 700 : 400 }}>
            {overdue && <AlertCircle size={9} />}
            <Clock size={9} /> {format(new Date(task.due_date), "MMM d")}{dueToday ? " · Today" : overdue ? " · Overdue" : ""}
          </span>
        )}
        {hasLink && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "1px 6px", borderRadius: 99 }}>
            {task.lead_id ? "Lead" : "Deal"}
          </span>
        )}
        {task.assigned_profile && (
          <div style={{ marginLeft: "auto", width: 22, height: 22, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "var(--accent)", border: "1px solid var(--border)" }}>
            {task.assigned_profile.full_name?.[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 6 }}>
        {hasLink && (
          <button onClick={(e) => { e.stopPropagation(); onOpen?.(task); }} className="icon-action-btn" title="Open linked record" style={{ color: "#6366F1" }}>
            <ExternalLink size={11} />
          </button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onEdit(task); }} className="icon-action-btn"><Edit2 size={11} /></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} className="icon-action-btn danger"><Trash2 size={11} /></button>
      </div>
    </div>
  );
}

function DraggableTask({ task, onEdit, onDelete, onToggle, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, data: { task } });
  const style = transform ? { transform: `translate(${transform.x}px,${transform.y}px)`, zIndex: isDragging ? 100 : "auto" } : {};
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TaskCard task={task} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} onOpen={onOpen} isDragging={isDragging} />
    </div>
  );
}

function DroppableCol({ status, tasks, onEdit, onDelete, onToggle, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.key });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: "1 1 220px", minWidth: 200,
        background: isOver ? status.bg : "var(--surface-2)",
        border: isOver ? `1.5px solid ${status.color}` : "1.5px solid var(--border)",
        borderRadius: 14, display: "flex", flexDirection: "column",
        transition: "border-color 0.15s, background 0.15s",
        maxHeight: "calc(100vh - 155px)",
      }}
    >
      <div style={{ padding: "11px 13px 9px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: status.color, boxShadow: `0 0 7px ${status.color}80` }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{status.label}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: status.bg, color: status.color }}>{tasks.length}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "7px 7px 10px", display: "flex", flexDirection: "column", gap: 6, minHeight: 60 }}>
        {tasks.map((t) => <DraggableTask key={t.id} task={t} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} onOpen={onOpen} />)}
        {tasks.length === 0 && <div style={{ border: "2px dashed var(--border)", borderRadius: 10, padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>Drop here</div>}
      </div>
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────
function CalendarView({ tasks, onEdit, onToggle }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad start so week begins on Monday
  const startPad = (getDay(monthStart) + 6) % 7;
  const padDays = Array.from({ length: startPad }, (_, i) => null);

  const tasksByDay = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      if (!t.due_date) return;
      const key = format(new Date(t.due_date), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
        <button className="icon-btn" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft size={16} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
          {format(currentMonth, "MMMM yyyy")}
        </div>
        <button className="icon-btn" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {WEEK_DAYS.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", padding: "6px 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {padDays.map((_, i) => <div key={`pad-${i}`} />)}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDay[key] || [];
            const today = isToday(day);
            return (
              <div
                key={key}
                style={{
                  minHeight: 80,
                  borderRadius: 10,
                  background: today ? "var(--accent-light)" : "var(--surface)",
                  border: today ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  padding: "6px 8px",
                  transition: "box-shadow 0.15s",
                  cursor: dayTasks.length ? "pointer" : "default",
                }}
              >
                <div style={{
                  fontSize: 12, fontWeight: today ? 800 : 600,
                  color: today ? "var(--accent)" : "var(--text-2)",
                  marginBottom: 4,
                }}>{format(day, "d")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {dayTasks.slice(0, 3).map((t) => {
                    const p = PRIORITIES.find((x) => x.key === t.priority);
                    const overdue = isPast(new Date(t.due_date)) && t.status !== "done";
                    return (
                      <div
                        key={t.id}
                        onClick={() => onEdit(t)}
                        style={{
                          fontSize: 10.5, fontWeight: 600, padding: "2px 6px", borderRadius: 5,
                          background: overdue ? "rgba(239,68,68,0.12)" : `${p?.color || "#94A3B8"}18`,
                          color: overdue ? "var(--red)" : (p?.color || "var(--text-muted)"),
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          cursor: "pointer",
                          textDecoration: t.status === "done" ? "line-through" : "none",
                        }}
                        title={t.title}
                      >
                        {t.title}
                      </div>
                    );
                  })}
                  {dayTasks.length > 3 && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, paddingLeft: 4 }}>
                      +{dayTasks.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Bulk Assign Bar ──────────────────────────────────────────────────────────
function BulkBar({ selected, teamMembers, onAssign, onMarkDone, onClear }) {
  const [assignTo, setAssignTo] = useState("");
  if (!selected.length) return null;
  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 14, padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "var(--shadow-xl)", zIndex: 500,
        backdropFilter: "blur(12px)",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
        {selected.length} selected
      </span>
      <div style={{ width: 1, height: 20, background: "var(--border)" }} />
      <select
        className="crm-input"
        value={assignTo}
        onChange={(e) => setAssignTo(e.target.value)}
        style={{ height: 34, width: 160, fontSize: 12.5 }}
      >
        <option value="">Assign to...</option>
        {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      </select>
      <button
        className="btn-secondary"
        onClick={() => { if (assignTo) { onAssign(assignTo); setAssignTo(""); } }}
        disabled={!assignTo}
        style={{ height: 34, padding: "0 14px", fontSize: 12.5 }}
      >
        <Users size={13} /> Assign
      </button>
      <button
        className="btn-secondary"
        onClick={onMarkDone}
        style={{ height: 34, padding: "0 14px", fontSize: 12.5 }}
      >
        <CheckCheck size={13} /> Mark Done
      </button>
      <button className="btn-ghost" onClick={onClear} style={{ height: 34, padding: "0 10px" }}>
        <X size={14} />
      </button>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Tasks() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState("kanban");
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [selected, setSelected] = useState([]);
  const [activeTab, setActiveTab] = useState("today");
  const reminderShown = useRef(false);

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["tasks", filterPriority, filterStatus],
    queryFn: () => tasksService.getAll({ priority: filterPriority, status: filterStatus }),
  });
  const { data: teamData } = useQuery({ queryKey: ["team-all"], queryFn: () => teamService.getAll() });

  const createMutation = useMutation({
    mutationFn: tasksService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Task created"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => tasksService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Updated"); setEditTask(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: tasksService.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (data) => {
    const payload = { ...data, created_by: profile?.id, assigned_to: data.assigned_to || null, due_date: data.due_date || null };
    if (editTask?.id) await updateMutation.mutateAsync({ id: editTask.id, ...payload });
    else await createMutation.mutateAsync(payload);
  };

  const handleOpenLinked = (task) => {
    if (task.lead_id) navigate(`/leads?highlight=${task.lead_id}`);
    else if (task.deal_id) navigate(`/deals?highlight=${task.deal_id}`);
  };

  const handleToggle = (task) => {
    updateMutation.mutate({ id: task.id, status: task.status === "done" ? "todo" : "done" });
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null); setActiveTask(null);
    if (!over) return;
    const newStatus = over.id;
    const task = tasks.find((t) => t.id === active.id);
    if (task && task.status !== newStatus && STATUSES.find((s) => s.key === newStatus)) {
      updateMutation.mutate({ id: active.id, status: newStatus });
    }
  };

  const handleBulkAssign = async (assignedTo) => {
    await Promise.all(selected.map((id) => updateMutation.mutateAsync({ id, assigned_to: assignedTo })));
    toast.success(`Assigned ${selected.length} tasks`);
    setSelected([]);
  };

  const handleBulkDone = async () => {
    await Promise.all(selected.map((id) => updateMutation.mutateAsync({ id, status: "done" })));
    toast.success(`Marked ${selected.length} tasks as done`);
    setSelected([]);
  };

  const toggleSelect = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const { hiddenSet, isVisible, toggleColumn, resetColumns, templates, saveTemplate, applyTemplate, deleteTemplate } = useTablePreferences("tasks", TASK_COLUMNS, profile?.id);

  const tasks = tasksData?.data || [];
  const teamMembers = teamData?.data || [];
  const todo = tasks.filter((t) => t.status === "todo").length;
  const inProg = tasks.filter((t) => t.status === "in_progress").length;
  const done = tasks.filter((t) => t.status === "done").length;

  const pendingTasks = tasks.filter((t) => !["done", "cancelled"].includes(t.status));
  const todayTasks = pendingTasks.filter((t) => t.due_date && isToday(new Date(t.due_date)));
  const upcomingTasks = pendingTasks.filter((t) => t.due_date && !isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)));
  const overdueTasks = pendingTasks.filter((t) => t.due_date && isPast(new Date(t.due_date)));
  const visibleTasks = activeTab === "today" ? todayTasks : activeTab === "upcoming" ? upcomingTasks : overdueTasks;
  const allVisibleSelected = visibleTasks.length > 0 && visibleTasks.every((task) => selected.includes(task.id));

  useEffect(() => {
    setSelected((current) => current.filter((id) => visibleTasks.some((task) => task.id === id)));
  }, [visibleTasks]);

  useEffect(() => {
    if (!reminderShown.current && overdueTasks.length > 0) {
      reminderShown.current = true;
      toast(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? "s" : ""} need your attention`, {
        icon: "⚠️",
        duration: 5000,
        style: { fontWeight: 600 },
      });
    }
  }, [overdueTasks.length]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Toolbar ── */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", flexWrap: "wrap" }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {[{ label: "Todo", value: todo, color: "#6B7280" }, { label: "In Progress", value: inProg, color: "#3B82F6" }, { label: "Done", value: done, color: "#10B981" }].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.label}:</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{s.value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { key: "today",    label: "Today",    count: todayTasks.length,   activeColor: "#F59E0B", activeBg: "rgba(245,158,11,0.1)",  activeBorder: "rgba(245,158,11,0.35)" },
            { key: "upcoming", label: "Upcoming", count: upcomingTasks.length,activeColor: "var(--accent)", activeBg: "var(--accent-light)", activeBorder: "var(--accent)" },
            { key: "overdue",  label: "Overdue",  count: overdueTasks.length, activeColor: "#EF4444", activeBg: "rgba(239,68,68,0.1)",   activeBorder: "rgba(239,68,68,0.35)" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                borderRadius: 999,
                padding: "8px 14px",
                border: activeTab === tab.key ? `1px solid ${tab.activeBorder}` : "1px solid var(--border)",
                background: activeTab === tab.key ? tab.activeBg : "var(--surface)",
                color: activeTab === tab.key ? tab.activeColor : "var(--text-2)",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: activeTab === tab.key ? 700 : 500,
                transition: "all 0.15s ease",
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />

        {/* Filters */}
        <select className="crm-input" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ width: "auto", height: 36, fontSize: 12.5 }}>
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {view === "list" && (
          <select className="crm-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: "auto", height: 36, fontSize: 12.5 }}>
            <option value="">All Status</option>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}

        {view === "list" && (
          <div style={{ display: "flex", gap: 6 }}>
            <ColumnToggle allColumns={TASK_COLUMNS} hiddenSet={hiddenSet} onToggle={toggleColumn} onReset={resetColumns} />
            <TemplateMenu
              templates={templates}
              onSave={saveTemplate}
              onApply={(tpl) => {
                applyTemplate(tpl);
                if (tpl.filters?.priority !== undefined) setFilterPriority(tpl.filters.priority);
                if (tpl.filters?.status   !== undefined) setFilterStatus(tpl.filters.status);
              }}
              onDelete={deleteTemplate}
              currentFilters={{ priority: filterPriority, status: filterStatus }}
            />
          </div>
        )}

        {/* View toggle */}
        <div style={{ display: "flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: 2, gap: 1 }}>
          {[
            { v: "list",    icon: LayoutList    },
            { v: "kanban",  icon: Columns       },
            { v: "calendar",icon: CalendarDays  },
          ].map(({ v, icon: Icon }) => (
            <button
              key={v}
              onClick={() => setView(v)}
              title={v.charAt(0).toUpperCase() + v.slice(1)}
              style={{
                background: view === v ? "var(--surface)" : "transparent",
                border: view === v ? "1px solid var(--border)" : "1px solid transparent",
                borderRadius: 6, padding: "5px 8px", cursor: "pointer",
                color: view === v ? "var(--text)" : "var(--text-muted)",
                transition: "all 0.14s",
              }}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>

      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {isLoading && view !== "list" ? (
          <div style={{ display: "flex", gap: 12, padding: 20 }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ flex: 1, height: 300, borderRadius: 14 }} />)}
          </div>
        ) : view === "kanban" ? (
          <DndContext
            collisionDetection={closestCenter}
            onDragStart={({ active }) => { setActiveId(active.id); setActiveTask(active.data.current?.task); }}
            onDragEnd={handleDragEnd}
          >
            <div style={{ display: "flex", gap: 12, padding: "14px 20px", overflowX: "auto", height: "100%", alignItems: "flex-start" }}>
              {STATUSES.map((status) => (
                <DroppableCol key={status.key} status={status} tasks={visibleTasks.filter((t) => t.status === status.key)} onEdit={setEditTask} onDelete={(id) => { if (confirm("Delete task?")) deleteMutation.mutate(id); }} onToggle={handleToggle} onOpen={handleOpenLinked} />
              ))}
            </div>
            <DragOverlay>
              {activeTask && <div style={{ transform: "rotate(2deg)", opacity: 0.9, width: 220 }}><TaskCard task={activeTask} onEdit={() => {}} onDelete={() => {}} onToggle={() => {}} onOpen={handleOpenLinked} /></div>}
            </DragOverlay>
          </DndContext>

        ) : view === "calendar" ? (
          <CalendarView tasks={visibleTasks} onEdit={setEditTask} onToggle={handleToggle} />

        ) : (
          /* ── LIST VIEW ── */
          <div style={{ padding: "14px 20px", overflowY: "auto", height: "100%" }}>
            {isLoading ? (
              <SkeletonTable cols={5} rows={8} hasCheckbox />
            ) : (
              <div className="card" style={{ overflow: "hidden" }}>
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40, paddingLeft: 16 }}>
                        <input type="checkbox" checked={allVisibleSelected} onChange={(e) => setSelected(e.target.checked ? visibleTasks.map((t) => t.id) : [])} style={{ cursor: "pointer" }} />
                      </th>
                      <th style={{ width: 36 }}></th>
                      <th>TASK</th>
                      {isVisible("priority") && <th>PRIORITY</th>}
                      {isVisible("status")   && <th>STATUS</th>}
                      {isVisible("assigned") && <th>ASSIGNED</th>}
                      {isVisible("due")      && <th>DUE DATE</th>}
                      <th style={{ textAlign: "right" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.length === 0 ? (
                      <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>No tasks found for this view</td></tr>
                    ) : visibleTasks.map((t) => {
                      const overdue = t.due_date && isPast(new Date(t.due_date)) && t.status !== "done";
                      const dueToday = t.due_date && isToday(new Date(t.due_date)) && !overdue && t.status !== "done";
                      const rowBg = selected.includes(t.id) ? "var(--accent-light)" : overdue ? "rgba(239,68,68,0.05)" : dueToday ? "rgba(245,158,11,0.05)" : "transparent";
                      return (
                        <tr key={t.id} style={{ background: rowBg, borderLeft: overdue ? "3px solid #EF444460" : dueToday ? "3px solid #F59E0B60" : "3px solid transparent" }}>
                          <td style={{ paddingLeft: 16 }}>
                            <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggleSelect(t.id)} style={{ cursor: "pointer" }} />
                          </td>
                          <td>
                            <button onClick={() => handleToggle(t)} style={{ background: "none", border: "none", cursor: "pointer", color: t.status === "done" ? "var(--green)" : "var(--text-muted)" }}>
                              <CheckSquare size={15} />
                            </button>
                          </td>
                          <td>
                            <div style={{ fontSize: 13, fontWeight: 600, color: t.status === "done" ? "var(--text-muted)" : "var(--text)", textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</div>
                            {t.description && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{t.description}</div>}
                          </td>
                          {isVisible("priority") && (
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <PriorityDot priority={t.priority} />
                                <span style={{ fontSize: 12, color: "var(--text-2)", textTransform: "capitalize" }}>{t.priority}</span>
                              </div>
                            </td>
                          )}
                          {isVisible("status")   && <td><StatusBadge status={t.status} /></td>}
                          {isVisible("assigned") && <td style={{ fontSize: 12.5, color: "var(--text-2)" }}>{t.assigned_profile?.full_name?.split(" ")[0] || "—"}</td>}
                          {isVisible("due")      && (
                            <td style={{ fontSize: 12, color: overdue ? "var(--red)" : "var(--text-muted)" }}>
                              {t.due_date ? (
                                <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                                  {overdue && <AlertCircle size={11} />}
                                  {format(new Date(t.due_date), "MMM d, h:mm a")}
                                </span>
                              ) : "—"}
                            </td>
                          )}
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                              {(t.lead_id || t.deal_id) && (
                                <motion.button className="btn-ghost" style={{ padding: "4px 8px", color: "#6366F1" }} onClick={() => handleOpenLinked(t)} title={`Open linked ${t.lead_id ? "lead" : "deal"}`} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><ExternalLink size={13} /></motion.button>
                              )}
                              <motion.button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setEditTask(t)} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><Edit2 size={13} /></motion.button>
                              <motion.button className="btn-ghost" style={{ padding: "4px 8px", color: "var(--red)" }} onClick={() => { if (confirm("Delete?")) deleteMutation.mutate(t.id); }} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }}><Trash2 size={13} /></motion.button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bulk Action Bar ── */}
      <AnimatePresence>
        {selected.length > 0 && (
          <BulkBar
            selected={selected}
            teamMembers={teamMembers}
            onAssign={handleBulkAssign}
            onMarkDone={handleBulkDone}
            onClear={() => setSelected([])}
          />
        )}
      </AnimatePresence>

      {/* ── Task Modal ── */}
      <AnimatePresence>
        {(showForm || editTask) && (
          <TaskFormModal
            task={editTask}
            onClose={() => { setShowForm(false); setEditTask(null); }}
            onSave={handleSave}
            teamMembers={teamMembers}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
