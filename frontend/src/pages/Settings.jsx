import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { teamService } from "../services/teamService";
import { supabase } from "../supabaseClient";
import { getAccessToken } from "../lib/session";
import toast from "react-hot-toast";
import { User, Lock, Bell, Camera, DollarSign, Palette, Sun, Moon, Monitor, Eye, EyeOff, Check, XCircle, Smile, Mail, Link2, Loader2, Trash2, RefreshCw, Video, Calendar, Shield, ExternalLink, AlertCircle } from "lucide-react";

const API = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(/^﻿/, "");

const PW_RULES = [
  { id: "len",     label: "Minimum 8 characters",                          test: (p) => p.length >= 8 },
  { id: "upper",   label: "At least 1 uppercase letter (A–Z)",             test: (p) => /[A-Z]/.test(p) },
  { id: "lower",   label: "At least 1 lowercase letter (a–z)",             test: (p) => /[a-z]/.test(p) },
  { id: "digit",   label: "At least 1 number (0–9)",                       test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "At least 1 special character (@, #, $, etc.)",  test: (p) => /[^A-Za-z0-9]/.test(p) },
];
function isStrongPassword(pw) { return PW_RULES.every((r) => r.test(pw)); }
import { useCurrency, CURRENCIES } from "../context/CurrencyContext";

const TABS = [
  { key: "profile",         label: "Profile",         icon: User        },
  { key: "password",        label: "Password",        icon: Lock        },
  { key: "email",           label: "Email & Calendar", icon: Mail        },
  { key: "personalization", label: "Personalization", icon: Smile       },
  { key: "notifications",   label: "Notifications",   icon: Bell        },
  { key: "currency",        label: "Currency",        icon: DollarSign  },
  { key: "appearance",      label: "Appearance",      icon: Palette     },
];

// ─── Greeting helpers (shared with Dashboard) ─────────────────────────────────
const ROLE_LABELS_SETTINGS = {
  owner:         "Owner",
  admin:         "Admin",
  sales_manager: "Sales Manager",
  sales_rep:     "Sales Rep",
};

const GREETING_EMOJIS = ["👋", "☀️", "🌙", "🚀", "💼", "🔥", "⚡", "🎯"];

function getTimeGreetingSettings() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "Good Morning";
  if (h >= 12 && h < 17) return "Good Afternoon";
  if (h >= 17 && h < 21) return "Good Evening";
  return "Good Night";
}

function PersonalizationTab({ profile }) {
  const storageKey = `salescrm_greeting_prefs_${profile?.id}`;
  const saved = (() => { try { const r = localStorage.getItem(storageKey); return r ? JSON.parse(r) : null; } catch { return null; } })();

  const [customEnabled, setCustomEnabled] = useState(saved?.customEnabled || false);
  const [message,       setMessage]       = useState(saved?.message || "");
  const [emoji,         setEmoji]         = useState(saved?.emoji || "👋");
  const [saved_,        setSaved]         = useState(false);

  const firstName  = profile?.full_name?.split(" ")[0] || "there";
  const roleLabel  = ROLE_LABELS_SETTINGS[profile?.role] || profile?.role || "";
  const timeGreet  = getTimeGreetingSettings();
  const previewText = customEnabled && message.trim()
    ? message.trim()
    : `${timeGreet}, ${firstName} (${roleLabel}) ${emoji}`;

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify({ customEnabled, message, emoji }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Personalization</h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-muted)" }}>Customize your dashboard greeting.</p>

      {/* Live Preview */}
      <div style={{ marginBottom: 20, padding: "14px 18px", borderRadius: 12, background: "var(--accent-light)", border: "1.5px solid var(--accent)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>{emoji}</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Preview</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{previewText}</div>
        </div>
      </div>

      {/* Emoji picker */}
      <div style={{ marginBottom: 20 }}>
        <label className="crm-label">Greeting Emoji</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {GREETING_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              style={{
                width: 38, height: 38, borderRadius: 10, fontSize: 20, cursor: "pointer",
                border: `2px solid ${emoji === e ? "var(--accent)" : "var(--border)"}`,
                background: emoji === e ? "var(--accent-light)" : "var(--surface-2)",
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Custom message toggle */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>Custom Welcome Message</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Replace the default greeting with your own message</div>
        </div>
        <button
          onClick={() => setCustomEnabled((v) => !v)}
          style={{
            width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
            background: customEnabled ? "var(--accent)" : "var(--border)",
            position: "relative", transition: "background 0.2s", flexShrink: 0,
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: customEnabled ? 21 : 3,
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            transition: "left 0.2s", display: "block",
          }} />
        </button>
      </div>

      {customEnabled && (
        <div style={{ marginBottom: 20 }}>
          <label className="crm-label">Your Custom Message</label>
          <input
            className="crm-input"
            style={{ marginTop: 4 }}
            placeholder={`e.g. Let's crush targets today 🚀`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={80}
          />
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, textAlign: "right" }}>{message.length}/80</div>
        </div>
      )}

      <button
        className="btn-primary"
        onClick={save}
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        {saved_ ? <><Check size={14} /> Saved!</> : "Save Preferences"}
      </button>

      <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        Preferences are saved locally on this device.
      </p>
    </div>
  );
}

function ProfileTab({ profile, onUpdate }) {
  const { register, handleSubmit, formState: { isSubmitting, isDirty } } = useForm({
    defaultValues: {
      full_name:  profile?.full_name  || "",
      phone:      profile?.phone      || "",
      department: profile?.department || "",
      bio:        profile?.bio        || "",
    },
  });

  const [uploading, setUploading] = useState(false);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `avatars/${profile.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from("crm-files").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("crm-files").getPublicUrl(path);
      await teamService.updateProfile(profile.id, { avatar_url: urlData.publicUrl });
      onUpdate();
      toast.success("Avatar updated");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data) => {
    try {
      await teamService.updateProfile(profile?.id, data);
      onUpdate();
      toast.success("Profile updated");
    } catch {
      toast.error("Update failed");
    }
  };

  const initials = profile?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U";

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 28 }}>
        <div style={{ position: "relative" }}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={initials} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #2563EB, #4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "white" }}>
              {initials}
            </div>
          )}
          <label style={{ position: "absolute", bottom: 0, right: 0, background: "var(--accent)", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "2px solid var(--surface)" }}>
            <Camera size={12} style={{ color: "white" }} />
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarUpload} disabled={uploading} />
          </label>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{profile?.full_name}</div>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>{profile?.email}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, textTransform: "capitalize" }}>
            {profile?.role?.replace("_", " ")}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="crm-label">Full Name</label>
          <input className="crm-input" {...register("full_name")} placeholder="Your full name" />
        </div>
        <div>
          <label className="crm-label">Phone</label>
          <input className="crm-input" {...register("phone")} placeholder="+1 234 567 8900" />
        </div>
        <div>
          <label className="crm-label">Department</label>
          <input className="crm-input" {...register("department")} placeholder="Sales" />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="crm-label">Bio</label>
          <textarea className="crm-input" {...register("bio")} rows={3} placeholder="A short bio about yourself..." style={{ resize: "vertical" }} />
        </div>
        <div>
          <label className="crm-label">Email</label>
          <input className="crm-input" value={profile?.email || ""} disabled style={{ background: "var(--surface-2)", color: "var(--text-muted)" }} />
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Email cannot be changed here</span>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <button type="submit" className="btn-primary" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function PasswordTab() {
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm();
  const newPw = watch("newPassword") || "";
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const onSubmit = async ({ currentPassword, newPassword }) => {
    if (!isStrongPassword(newPassword)) {
      toast.error("Password does not meet security requirements.");
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Not authenticated");
      // Re-authenticate by verifying the current password.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (reauthErr) throw new Error("Current password is incorrect");
      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updErr) throw updErr;
      reset();
      toast.success("Password changed successfully");
    } catch (err) {
      toast.error(err.message || "Could not change password");
    }
  };

  const passedCount = PW_RULES.filter((r) => r.test(newPw)).length;
  const strengthColors = ["", "#ef4444", "#f59e0b", "#eab308", "#22c55e"];
  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div style={{ maxWidth: 420, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label className="crm-label">Current Password</label>
          <div style={{ position: "relative" }}>
            <input
              className="crm-input"
              type={showCurrent ? "text" : "password"}
              style={{ paddingRight: 36 }}
              {...register("currentPassword", { required: "Required" })}
            />
            <button type="button" onClick={() => setShowCurrent((v) => !v)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0 }}>
              {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {errors.currentPassword && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.currentPassword.message}</span>}
        </div>

        <div>
          <label className="crm-label">New Password</label>
          <div style={{ position: "relative" }}>
            <input
              className="crm-input"
              type={showNew ? "text" : "password"}
              style={{ paddingRight: 36 }}
              {...register("newPassword", { required: "Required" })}
            />
            <button type="button" onClick={() => setShowNew((v) => !v)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0 }}>
              {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {errors.newPassword && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.newPassword.message}</span>}
          {newPw && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <div style={{ display: "flex", gap: 4, flex: 1 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= passedCount ? strengthColors[passedCount] : "var(--border)", transition: "background 0.2s" }} />
                  ))}
                </div>
                <span style={{ fontSize: 11.5, color: strengthColors[passedCount], fontWeight: 600, minWidth: 36 }}>{strengthLabels[passedCount]}</span>
              </div>
              <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
                {PW_RULES.map((rule) => {
                  const ok = rule.test(newPw);
                  return (
                    <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12, color: ok ? "#16a34a" : "var(--muted)", transition: "color 0.15s" }}>
                      {ok ? <Check size={11} /> : <XCircle size={11} />}
                      {rule.label}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div>
          <label className="crm-label">Confirm New Password</label>
          <div style={{ position: "relative" }}>
            <input
              className="crm-input"
              type={showConfirm ? "text" : "password"}
              style={{ paddingRight: 36 }}
              {...register("confirmPassword", {
                required: "Required",
                validate: (v) => v === newPw || "Passwords don't match",
              })}
            />
            <button type="button" onClick={() => setShowConfirm((v) => !v)}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0 }}>
              {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {errors.confirmPassword && <span style={{ color: "var(--red)", fontSize: 11.5 }}>{errors.confirmPassword.message}</span>}
        </div>

        <button type="submit" className="btn-primary" disabled={isSubmitting} style={{ width: "fit-content" }}>
          {isSubmitting ? "Changing..." : "Change Password"}
        </button>
      </div>
    </form>
  );
}

function NotificationsTab({ profile, onUpdate }) {
  const prefs = profile?.data?.notification_prefs || {};
  const [settings, setSettings] = useState({
    lead_assigned:    true,
    task_due:         true,
    deal_updated:     true,
    mention:          true,
    meeting_reminder: true,
    team_update:      false,
    ...prefs,
  });
  const [saving, setSaving] = useState(false);

  const toggle = (key) => setSettings((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = async () => {
    setSaving(true);
    try {
      await teamService.updateProfile(profile?.id, { notification_prefs: settings });
      toast.success("Preferences saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const items = [
    { key: "lead_assigned",    label: "Lead Assignments",  desc: "When a lead is assigned to you"     },
    { key: "task_due",         label: "Task Reminders",    desc: "When a task is due soon"            },
    { key: "deal_updated",     label: "Deal Updates",      desc: "When a deal you own is updated"    },
    { key: "mention",          label: "Mentions",          desc: "When someone mentions you in chat" },
    { key: "meeting_reminder", label: "Meeting Reminders", desc: "Before your meetings start"        },
    { key: "team_update",      label: "Team Updates",      desc: "General team announcements"        },
  ];

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 520 }}>
        {items.map((item) => (
          <div
            key={item.key}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}
          >
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{item.label}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{item.desc}</div>
            </div>
            <button
              onClick={() => toggle(item.key)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: settings[item.key] ? "var(--accent)" : "var(--border)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  left: settings[item.key] ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "white",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={save} disabled={saving} style={{ marginTop: 20 }}>
        {saving ? "Saving..." : "Save Preferences"}
      </button>
    </div>
  );
}

function CurrencyTab() {
  const { currencyCode, changeCurrency, formatCompact } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(currencyCode);

  const handleSave = async () => {
    setSaving(true);
    await changeCurrency(selected);
    toast.success("Currency updated");
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 0, marginBottom: 20, lineHeight: 1.6 }}>
        Choose the currency displayed across Deals, Reports, Dashboard, and Targets.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {CURRENCIES.map((c) => {
          const active = selected === c.code;
          return (
            <button
              key={c.code}
              onClick={() => setSelected(c.code)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "13px 16px", borderRadius: 10, textAlign: "left",
                background: active ? "var(--accent-light)" : "var(--surface-2)",
                border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 22 }}>{c.flag}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: active ? "var(--accent)" : "var(--text)" }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                  {c.code} · {c.symbol} · e.g. {c.symbol}1,00,000
                </div>
              </div>
              <span style={{ fontSize: 16, fontWeight: 800, color: active ? "var(--accent)" : "var(--text-muted)", minWidth: 32, textAlign: "right" }}>
                {c.symbol}
              </span>
              {active && (
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <button
        className="btn-primary"
        onClick={handleSave}
        disabled={saving || selected === currencyCode}
        style={{ marginTop: 20 }}
      >
        {saving ? "Saving..." : "Save Currency"}
      </button>
    </div>
  );
}

function SecurityTab({ profile }) {
  const sessions = [
    { device: "Windows Chrome", location: "Current Session", time: "Active now", current: true },
  ];

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "var(--text)" }}>Active Sessions</h3>
        {sessions.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{s.device}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.location} · {s.time}</div>
            </div>
            {s.current && <span style={{ fontSize: 11, background: "var(--green-light)", color: "var(--green)", padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>Current</span>}
          </div>
        ))}
      </div>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: "var(--text)" }}>Account Info</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "User ID",         value: profile?.user_id?.slice(0, 8) + "…" },
            { label: "Account Status",  value: profile?.status },
            { label: "Role",            value: profile?.role?.replace("_", " ") },
          ].map((info) => (
            <div key={info.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, background: "var(--surface-2)" }}>
              <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{info.label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", textTransform: "capitalize" }}>{info.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  const options = [
    {
      key: "light",
      icon: Sun,
      label: "Light",
      desc: "Clean white interface, great for bright environments",
      preview: { bg: "#F0F4FF", surface: "#FFFFFF", text: "#0C1330", accent: "#2563EB", border: "#E2E8F4" },
    },
    {
      key: "dark",
      icon: Moon,
      label: "Dark",
      desc: "Easy on the eyes, ideal for low-light work",
      preview: { bg: "#0B0F14", surface: "#1F2937", text: "#F9FAFB", accent: "#3B82F6", border: "rgba(255,255,255,0.08)" },
    },
    {
      key: "system",
      icon: Monitor,
      label: "System",
      desc: "Automatically matches your device's system preference",
      preview: null,
    },
  ];

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Appearance</h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-muted)" }}>Choose how Sales CRM looks for you.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {options.map(({ key, icon: Icon, label, desc, preview }) => {
          const active = theme === key;
          return (
            <button
              key={key}
              onClick={() => setTheme(key)}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "16px 18px",
                background: active ? "var(--accent-light)" : "var(--surface-2)",
                border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 12, cursor: "pointer", textAlign: "left",
                fontFamily: "inherit", transition: "all 0.15s",
              }}
            >
              {/* Mini preview or icon */}
              {preview ? (
                <div style={{ width: 52, height: 38, borderRadius: 8, background: preview.bg, border: `1px solid ${preview.border}`, flexShrink: 0, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: preview.surface, borderBottom: `1px solid ${preview.border}` }} />
                  <div style={{ position: "absolute", top: 13, left: 6, width: 14, height: 22, background: preview.surface, borderRadius: 3, border: `1px solid ${preview.border}` }} />
                  <div style={{ position: "absolute", top: 13, left: 24, right: 5, height: 8, background: preview.surface, borderRadius: 3, border: `1px solid ${preview.border}` }} />
                  <div style={{ position: "absolute", top: 24, left: 24, right: 5, height: 4, background: preview.accent, borderRadius: 3, opacity: 0.6 }} />
                </div>
              ) : (
                <div style={{ width: 52, height: 38, borderRadius: 8, flexShrink: 0, overflow: "hidden", position: "relative", border: "1px solid var(--border)" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #0B0F14 50%, #F0F4FF 50%)" }} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Monitor size={16} style={{ color: "#fff", filter: "drop-shadow(0 0 2px rgba(0,0,0,0.4))" }} />
                  </div>
                </div>
              )}

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                  <Icon size={14} style={{ color: active ? "var(--accent)" : "var(--text-muted)" }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: active ? "var(--accent)" : "var(--text)" }}>{label}</span>
                  {active && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "var(--accent)", color: "#fff", borderRadius: 99, padding: "1px 7px", letterSpacing: "0.04em" }}>
                      ACTIVE
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.4 }}>{desc}</div>
              </div>

              {/* Radio dot */}
              <div style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${active ? "var(--accent)" : "var(--border-2)"}`,
                background: active ? "var(--accent)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
              </div>
            </button>
          );
        })}
      </div>

      <p style={{ margin: "20px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
        Your theme preference is saved locally and applied instantly across all pages.
      </p>
    </div>
  );
}

// ─── Email & Calendar Integrations Tab ───────────────────────────────────────
function EmailTab({ profile }) {
  // ── OAuth integration status (Google Meet / Microsoft Teams) ──────────────
  const [oauthStatus,       setOauthStatus]       = useState({ google_meet: null, microsoft_teams: null });
  const [oauthConnecting,   setOauthConnecting]   = useState({ google: false, microsoft: false });
  const [oauthDisconnecting,setOauthDisconnecting]= useState({ google: false, microsoft: false });

  const apiFetch = useCallback(async (path, opts = {}) => {
    const token = await getAccessToken();
    return fetch(`${API}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
  }, []);

  const fetchOauthStatus = useCallback(async () => {
    try {
      const r = await apiFetch("/api/oauth/status");
      if (r.ok) setOauthStatus(await r.json());
    } catch { /* non-fatal */ }
  }, [apiFetch]);

  useEffect(() => { fetchOauthStatus(); }, [fetchOauthStatus]);

  const handleConnectGoogle = async () => {
    setOauthConnecting((s) => ({ ...s, google: true }));
    try {
      const r = await apiFetch("/api/oauth/google/authorize");
      const data = await r.json();
      if (data.url) window.location.href = data.url;
      else toast.error(data.error || "Failed to start Google authorization");
    } catch { toast.error("Could not connect to Google"); }
    finally { setOauthConnecting((s) => ({ ...s, google: false })); }
  };

  const handleDisconnectGoogle = async () => {
    setOauthDisconnecting((s) => ({ ...s, google: true }));
    try {
      await apiFetch("/api/oauth/google/revoke", { method: "POST" });
      setOauthStatus((s) => ({ ...s, google_meet: null }));
      toast.success("Google account disconnected");
    } catch { toast.error("Failed to disconnect Google account"); }
    finally { setOauthDisconnecting((s) => ({ ...s, google: false })); }
  };

  const handleConnectMicrosoft = async () => {
    setOauthConnecting((s) => ({ ...s, microsoft: true }));
    try {
      const r = await apiFetch("/api/oauth/microsoft/authorize");
      const data = await r.json();
      if (data.url) window.location.href = data.url;
      else toast.error(data.error || "Failed to start Microsoft authorization");
    } catch { toast.error("Could not connect to Microsoft"); }
    finally { setOauthConnecting((s) => ({ ...s, microsoft: false })); }
  };

  const handleDisconnectMicrosoft = async () => {
    setOauthDisconnecting((s) => ({ ...s, microsoft: true }));
    try {
      await apiFetch("/api/oauth/microsoft/revoke", { method: "POST" });
      setOauthStatus((s) => ({ ...s, microsoft_teams: null }));
      toast.success("Microsoft account disconnected");
    } catch { toast.error("Failed to disconnect Microsoft account"); }
    finally { setOauthDisconnecting((s) => ({ ...s, microsoft: false })); }
  };

  // ── Meeting email (App Password) state ────────────────────────────────────
  const [appPassword, setAppPassword] = useState("");
  const [showPw, setShowPw]           = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saved,  setSaved]            = useState(false);

  const handleSave = async () => {
    if (!appPassword.trim()) { toast.error("Enter your Gmail App Password"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ mail_app_password: appPassword.trim() })
      .eq("id", profile.id);
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    setSaved(true);
    setAppPassword("");
    setTimeout(() => setSaved(false), 3000);
    toast.success("Email password saved — meeting invites will now send from your account");
  };

  const googleConnected    = !!oauthStatus.google_meet?.connected;
  const microsoftConnected = !!oauthStatus.microsoft_teams?.connected;

  return (
    <div style={{ maxWidth: 560 }}>

      {/* ── Section 0: Calendar & Video Integrations ───────────────────── */}
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>Email &amp; Calendar Integrations</h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, fontWeight: 500, color: "var(--text-muted)", lineHeight: 1.6 }}>
        Connect your business accounts once to enable email sync, meeting scheduling, calendar integration, and automatic meeting link generation.
      </p>

      {/* Google Workspace card */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 16, padding: 28, marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          {/* Google Logo */}
          <div style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "#FAFAFA" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Google Workspace</span>
              {googleConnected
                ? <span style={{ fontSize: 12, fontWeight: 600, color: "#16A34A", background: "#DCFCE7", padding: "3px 10px", borderRadius: 100, border: "1px solid #BBF7D0" }}>Connected</span>
                : <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B", background: "#F1F5F9", padding: "3px 10px", borderRadius: 100, border: "1px solid #E2E8F0" }}>Not Connected</span>}
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--text-muted)", lineHeight: 1.65 }}>
              Connect your Google account to enable:
            </p>
            <ul style={{ margin: "0 0 14px", padding: "0 0 0 18px", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
              <li>Gmail Sync — auto-track sent emails</li>
              <li>Google Calendar Sync</li>
              <li>Automatic Google Meet link generation</li>
            </ul>
            {googleConnected && oauthStatus.google_meet?.email && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <Mail size={12} />
                <span>{oauthStatus.google_meet.email}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {googleConnected ? (
                <>
                  <button
                    onClick={handleConnectGoogle}
                    disabled={oauthConnecting.google}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, background: "#EFF6FF", border: "1px solid #BFDBFE", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#2563EB", fontFamily: "inherit" }}
                  >
                    {oauthConnecting.google ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={13} />}
                    Reconnect
                  </button>
                  <button
                    onClick={handleDisconnectGoogle}
                    disabled={oauthDisconnecting.google}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--text-muted)", fontFamily: "inherit" }}
                  >
                    {oauthDisconnecting.google ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={13} />}
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  disabled={oauthConnecting.google}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 9, background: "#2563EB", border: "none", cursor: oauthConnecting.google ? "wait" : "pointer", fontSize: 13, fontWeight: 600, color: "#FFFFFF", fontFamily: "inherit" }}
                >
                  {oauthConnecting.google ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Link2 size={13} />}
                  {oauthConnecting.google ? "Redirecting…" : "Connect Google"}
                </button>
              )}
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Only <strong>sent</strong> emails are fetched for auto-sync. Your email content is never stored — only subject, recipient, date, and thread ID.
            </p>
            <div style={{ marginTop: 8, padding: "9px 13px", borderRadius: 8, background: "#FEF3C7", border: "1px solid #FDE68A", fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
              Connect the Google account your organization sends sales email from. Only <strong>sent</strong> messages are synced.
            </div>
          </div>
        </div>
      </div>

      {/* Microsoft 365 card */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 16, padding: 28, marginBottom: 28, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          {/* Microsoft Logo */}
          <div style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: "#FAFAFA" }}>
            <svg width="22" height="22" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
              <rect x="12" y="1" width="10" height="10" fill="#7FBA00"/>
              <rect x="1" y="12" width="10" height="10" fill="#00A4EF"/>
              <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>Microsoft 365</span>
              {microsoftConnected
                ? <span style={{ fontSize: 12, fontWeight: 600, color: "#16A34A", background: "#DCFCE7", padding: "3px 10px", borderRadius: 100, border: "1px solid #BBF7D0" }}>Connected</span>
                : <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B", background: "#F1F5F9", padding: "3px 10px", borderRadius: 100, border: "1px solid #E2E8F0" }}>Not Connected</span>}
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--text-muted)", lineHeight: 1.65 }}>
              Connect your Microsoft account to enable:
            </p>
            <ul style={{ margin: "0 0 14px", padding: "0 0 0 18px", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
              <li>Outlook Email Sync</li>
              <li>Outlook Calendar Sync</li>
              <li>Automatic Microsoft Teams meeting link generation</li>
            </ul>
            {microsoftConnected && oauthStatus.microsoft_teams?.email && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <Mail size={12} />
                <span>{oauthStatus.microsoft_teams.email}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {microsoftConnected ? (
                <>
                  <button
                    onClick={handleConnectMicrosoft}
                    disabled={oauthConnecting.microsoft}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, background: "#EFF6FF", border: "1px solid #BFDBFE", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#2563EB", fontFamily: "inherit" }}
                  >
                    {oauthConnecting.microsoft ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={13} />}
                    Reconnect
                  </button>
                  <button
                    onClick={handleDisconnectMicrosoft}
                    disabled={oauthDisconnecting.microsoft}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, background: "var(--surface-2)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--text-muted)", fontFamily: "inherit" }}
                  >
                    {oauthDisconnecting.microsoft ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={13} />}
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnectMicrosoft}
                  disabled={oauthConnecting.microsoft}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 9, background: "#5B21B6", border: "none", cursor: oauthConnecting.microsoft ? "wait" : "pointer", fontSize: 13, fontWeight: 600, color: "#FFFFFF", fontFamily: "inherit" }}
                >
                  {oauthConnecting.microsoft ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Link2 size={13} />}
                  {oauthConnecting.microsoft ? "Redirecting…" : "Connect Microsoft"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border)", margin: "4px 0 28px" }} />

      {/* ── Section 1: Meeting Email Password ─────────────────────────── */}
      <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Meeting Email Settings</h3>
      <p style={{ margin: "0 0 24px", fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
        When you schedule a meeting, the invite email is sent <strong>from your own CRM email</strong> ({profile?.email}). Enter your Gmail App Password below to enable this.
      </p>

      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderLeft: "4px solid #3B82F6", borderRadius: 8, padding: "12px 16px", marginBottom: 24, fontSize: 13, color: "#1E40AF", lineHeight: 1.65 }}>
        <strong>How to get your App Password:</strong><br />
        1. Go to <strong>myaccount.google.com</strong> → Security → 2-Step Verification<br />
        2. Scroll to <strong>App passwords</strong> → Create → name it "Sales CRM"<br />
        3. Copy the 16-character code and paste it below.
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="crm-label">Your CRM Email</label>
        <input className="crm-input" value={profile?.email || ""} disabled style={{ background: "var(--surface-2)", color: "var(--text-muted)" }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label className="crm-label">Gmail App Password <span style={{ color: "#EF4444" }}>*</span></label>
        <div style={{ position: "relative" }}>
          <input
            className="crm-input"
            type={showPw ? "text" : "password"}
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="xxxx xxxx xxxx xxxx"
            style={{ paddingRight: 40, fontFamily: "monospace", letterSpacing: "0.12em" }}
          />
          <button type="button" onClick={() => setShowPw((v) => !v)}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}>
            {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)" }}>Stored securely. Used only for sending meeting invites from your account.</p>
      </div>

      <button
        className="btn-primary"
        onClick={handleSave}
        disabled={saving || !appPassword.trim()}
        style={{ display: "flex", alignItems: "center", gap: 6 }}
      >
        {saving ? "Saving…" : saved ? <><Check size={14} /> Saved!</> : "Save Email Password"}
      </button>
    </div>
  );
}

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");

  // Handle OAuth redirects back to /settings
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("email_sync_connected")) {
      setActiveTab("email");
      toast.success("Gmail account connected — email sync is now active");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.has("email_sync_error")) {
      setActiveTab("email");
      const reason = params.get("email_sync_error");
      toast.error("Failed to connect Gmail account. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.has("google_meet_connected")) {
      setActiveTab("email");
      toast.success("Google account connected — Meet links will auto-generate");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.has("google_meet_error")) {
      setActiveTab("email");
      toast.error("Failed to connect Google account. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.has("teams_connected")) {
      setActiveTab("email");
      toast.success("Microsoft account connected — Teams links will auto-generate");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.has("teams_error")) {
      setActiveTab("email");
      toast.error("Failed to connect Microsoft account. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px", color: "var(--text)" }}>Settings</h1>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>Manage your account preferences</p>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Tab Nav */}
        <div style={{ width: 180, flexShrink: 0 }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                borderRadius: 8,
                background: activeTab === tab.key ? "var(--accent-light)" : "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? "var(--accent)" : "var(--text-2)",
                fontFamily: "inherit",
                textAlign: "left",
                marginBottom: 2,
                transition: "all 0.15s",
              }}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="card" style={{ flex: 1, padding: 24, minWidth: 0 }}>
          {activeTab === "profile"         && <ProfileTab         profile={profile} onUpdate={refreshProfile} />}
          {activeTab === "password"        && <PasswordTab />}
          {activeTab === "email"           && <EmailTab           profile={profile} />}
          {activeTab === "personalization" && <PersonalizationTab profile={profile} />}
          {activeTab === "notifications"   && <NotificationsTab   profile={profile} onUpdate={refreshProfile} />}
          {activeTab === "currency"        && <CurrencyTab />}
          {activeTab === "appearance"      && <AppearanceTab />}
        </div>
      </div>
    </div>
  );
}
