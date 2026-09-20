import { useState, useCallback } from "react";

const STORAGE_KEY_BASE = "ccrm_tbl_v2";

function getKey(userId) {
  return userId ? `ccrm_tbl_${userId}_v2` : STORAGE_KEY_BASE;
}

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); }
  catch { return {}; }
}
function persist(key, d) { localStorage.setItem(key, JSON.stringify(d)); }

export function useTablePreferences(tableKey, allColumns, userId) {
  const [, bump] = useState(0);
  const storeKey = getKey(userId);

  const slot = () => { const a = load(storeKey); return a[tableKey] || { hiddenCols: [], templates: [] }; };
  const setSlot = (fn) => {
    const a = load(storeKey);
    const cur = a[tableKey] || { hiddenCols: [], templates: [] };
    a[tableKey] = typeof fn === "function" ? fn(cur) : { ...cur, ...fn };
    persist(storeKey, a);
    bump(n => n + 1);
  };

  const s = slot();
  const hiddenSet = new Set(s.hiddenCols || []);
  const templates = s.templates || [];
  const visibleColumns = allColumns.filter(c => c.required || !hiddenSet.has(c.key));
  const isVisible = (key) => !hiddenSet.has(key);

  const toggleColumn = useCallback((key) => {
    setSlot(p => { const h = new Set(p.hiddenCols || []); h.has(key) ? h.delete(key) : h.add(key); return { ...p, hiddenCols: [...h] }; });
  }, [tableKey, storeKey]); // eslint-disable-line

  const resetColumns = useCallback(() => setSlot(p => ({ ...p, hiddenCols: [] })), [tableKey, storeKey]); // eslint-disable-line

  const saveTemplate = useCallback((name, filters = {}, sort = "") => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    setSlot(p => ({
      ...p,
      templates: [...(p.templates || []), { id, name, hiddenCols: p.hiddenCols || [], filters, sort, createdAt: new Date().toISOString() }],
    }));
  }, [tableKey, storeKey]); // eslint-disable-line

  const applyTemplate = useCallback((tpl) => {
    setSlot(p => ({ ...p, hiddenCols: tpl.hiddenCols || [] }));
    return { filters: tpl.filters || {}, sort: tpl.sort || "" };
  }, [tableKey, storeKey]); // eslint-disable-line

  const deleteTemplate = useCallback((id) => {
    setSlot(p => ({ ...p, templates: (p.templates || []).filter(t => t.id !== id) }));
  }, [tableKey, storeKey]); // eslint-disable-line

  return { visibleColumns, allColumns, hiddenSet, isVisible, toggleColumn, resetColumns, templates, saveTemplate, applyTemplate, deleteTemplate };
}
