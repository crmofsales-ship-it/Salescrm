import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Columns, ChevronDown, Check, BookmarkPlus, BookOpen, Trash2, RotateCcw, X, Save } from "lucide-react";

function Popover({ children, onClose, triggerRef }) {
  const ref = useRef();
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !triggerRef?.current?.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose, triggerRef]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: 0.12 }}
      style={{
        position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 400,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07)",
        minWidth: 210,
      }}
    >
      {children}
    </motion.div>
  );
}

export function ColumnToggle({ allColumns, hiddenSet, onToggle, onReset }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef();
  const optional = allColumns.filter(c => !c.required);
  const hiddenCount = optional.filter(c => hiddenSet.has(c.key)).length;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="btn-secondary"
        style={{
          height: 34, padding: "0 12px", fontSize: 12.5, gap: 5,
          display: "flex", alignItems: "center",
          ...(hiddenCount > 0 ? { color: "var(--accent)", borderColor: "rgba(37,99,235,0.35)", background: "rgba(37,99,235,0.06)" } : {}),
        }}
      >
        <Columns size={13} />
        Columns
        {hiddenCount > 0 && (
          <span style={{ background: "var(--accent)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 99, padding: "0px 5px", lineHeight: "16px", minWidth: 16, textAlign: "center" }}>
            {hiddenCount}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <Popover triggerRef={btnRef} onClose={() => setOpen(false)}>
            <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Visible Columns</span>
              {hiddenCount > 0 && (
                <button onClick={onReset} style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 3, padding: 0 }}>
                  <RotateCcw size={10} /> Reset
                </button>
              )}
            </div>
            <div style={{ padding: "6px 0", maxHeight: 300, overflowY: "auto" }}>
              {optional.map(col => {
                const vis = !hiddenSet.has(col.key);
                return (
                  <button
                    key={col.key}
                    onClick={() => onToggle(col.key)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 14px", background: "transparent", border: "none", cursor: "pointer", color: vis ? "var(--text)" : "var(--text-muted)", fontSize: 13, textAlign: "left", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${vis ? "var(--accent)" : "var(--border)"}`, background: vis ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.12s" }}>
                      {vis && <Check size={10} color="#fff" strokeWidth={3} />}
                    </span>
                    {col.label}
                  </button>
                );
              })}
            </div>
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TemplateMenu({ templates, onSave, onApply, onDelete, currentFilters = {}, currentSort = "", canCreate = true }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const btnRef = useRef();

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim(), currentFilters, currentSort);
    setName("");
    setSaving(false);
    // Show brief confirmation in button
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="btn-secondary"
        style={{ height: 34, padding: "0 12px", fontSize: 12.5, gap: 5, display: "flex", alignItems: "center" }}
      >
        <BookOpen size={13} />
        Templates
        {templates.length > 0 && (
          <span style={{ background: "var(--surface-3, var(--surface-2))", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 10, fontWeight: 700, borderRadius: 99, padding: "0px 5px", lineHeight: "16px" }}>
            {templates.length}
          </span>
        )}
        <ChevronDown size={11} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      <AnimatePresence>
        {open && (
          <Popover triggerRef={btnRef} onClose={() => { setOpen(false); setSaving(false); setName(""); }}>
            {canCreate && (
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                {saving ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      autoFocus
                      className="crm-input"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setSaving(false); }}
                      placeholder="Template name..."
                      style={{ flex: 1, height: 30, fontSize: 12, padding: "0 10px" }}
                    />
                    <button onClick={handleSave} disabled={!name.trim()} className="btn-primary" style={{ height: 30, padding: "0 10px", fontSize: 12, display: "flex", alignItems: "center" }}>
                      <Save size={11} />
                    </button>
                    <button onClick={() => { setSaving(false); setName(""); }} className="btn-ghost" style={{ height: 30, padding: "0 8px", display: "flex", alignItems: "center" }}>
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSaving(true)}
                    style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "5px 0", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--accent)" }}
                  >
                    <BookmarkPlus size={13} /> Save current view
                  </button>
                )}
              </div>
            )}
            {templates.length === 0 ? (
              <div style={{ padding: "16px 14px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                No saved templates yet
              </div>
            ) : (
              <div style={{ padding: "6px 0", maxHeight: 260, overflowY: "auto" }}>
                {templates.map(t => (
                  <div
                    key={t.id}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 14px", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <button
                      onClick={() => { onApply(t); setOpen(false); }}
                      style={{ flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--text-2)", padding: "3px 0" }}
                    >
                      {t.name}
                    </button>
                    {canCreate && (
                      <button
                        onClick={() => onDelete(t.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 3, display: "flex", flexShrink: 0 }}
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}
