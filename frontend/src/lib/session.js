import { supabase } from "../supabaseClient";

// Returns a valid Supabase access token for the current session, or null.
// supabase-js refreshes the token internally; getSession() always returns a
// non-expired one when a session exists.
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

// Authenticated fetch helper for the backend API.
const API_BASE = (
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_BACKEND_URL ??
  "http://localhost:5000"
).replace(/^﻿/, "");

export async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const activeOrg = localStorage.getItem("salescrm_active_org");
  if (activeOrg) headers.set("X-Organization-Id", activeOrg);
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

export { API_BASE };
