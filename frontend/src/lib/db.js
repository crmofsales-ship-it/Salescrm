// Organization-aware Supabase client for tenant data.
//
// Behaves exactly like the raw client, except `.insert()` / `.upsert()` auto-stamp
// `organization_id` (the active org) on any row object that doesn't already set it.
// Postgres RLS still enforces isolation on reads/updates/deletes — this only
// spares every call site from repeating the org id on writes.
//
// Use `db` for CRM tables. Use the raw `supabase` (from ../supabaseClient) for
// auth and for `organizations` / `organization_members` themselves.
import { supabase } from "../supabaseClient";

export function getActiveOrgId() {
  try {
    return localStorage.getItem("salescrm_active_org") || null;
  } catch {
    return null;
  }
}

const stampRows = (rows) => {
  const orgId = getActiveOrgId();
  if (!orgId) return rows;
  const stamp = (r) =>
    r && typeof r === "object" && !Array.isArray(r) && r.organization_id == null
      ? { ...r, organization_id: orgId }
      : r;
  return Array.isArray(rows) ? rows.map(stamp) : stamp(rows);
};

function wrapTable(qb) {
  const origInsert = qb.insert.bind(qb);
  const origUpsert = qb.upsert.bind(qb);
  qb.insert = (rows, opts) => origInsert(stampRows(rows), opts);
  qb.upsert = (rows, opts) => origUpsert(stampRows(rows), opts);
  return qb;
}

export const db = new Proxy(supabase, {
  get(target, prop, receiver) {
    if (prop === "from") return (table) => wrapTable(target.from(table));
    const v = Reflect.get(target, prop, receiver);
    return typeof v === "function" ? v.bind(target) : v;
  },
});
