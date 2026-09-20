import React, { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, AlertCircle, MailCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import AuthShell from "./AuthShell";

function scorePassword(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["", "#DC2626", "#D97706", "#CA8A04", "#16A34A"];

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirm: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const strength = useMemo(() => scorePassword(form.password), [form.password]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const { session } = await signUp({
        email: form.email,
        password: form.password,
        fullName: form.fullName.trim(),
      });
      // If email confirmation is disabled, Supabase returns a session immediately.
      if (session) navigate("/onboarding", { replace: true });
      else setSent(true);
    } catch (err) {
      setError(err?.message || "Could not create your account.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell>
        <div className="sc-form">
          <div className="sc-alert sc-alert--ok" style={{ marginBottom: 20 }}>
            <MailCheck size={15} style={{ flex: "none", marginTop: 1 }} />
            <span>Check <strong>{form.email}</strong> for a confirmation link, then sign in to set up your organization.</span>
          </div>
          <Link className="sc-btn sc-btn--primary" to="/login">Go to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="sc-form">
        <div className="sc-form__head">
          <h2 className="sc-form__title">Create your account</h2>
          <p className="sc-form__sub">
            Already have one? <Link to="/login">Sign in</Link>
          </p>
        </div>

        {error && (
          <div className="sc-alert sc-alert--error">
            <AlertCircle size={15} style={{ flex: "none", marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="sc-field">
            <label className="sc-field__label">Full name</label>
            <input className="sc-input" autoFocus placeholder="Jane Cooper" value={form.fullName} onChange={set("fullName")} required />
          </div>
          <div className="sc-field">
            <label className="sc-field__label">Work email</label>
            <input className="sc-input" type="email" autoComplete="email" placeholder="you@company.com" value={form.email} onChange={set("email")} required />
          </div>
          <div className="sc-field">
            <label className="sc-field__label">Password</label>
            <div className="sc-input-wrap">
              <input
                className="sc-input sc-input--has-btn"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={set("password")}
                required
              />
              <button type="button" className="sc-input-btn" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {form.password && (
              <div className="sc-strength">
                <div className="sc-strength__track">
                  {[1, 2, 3, 4].map((i) => (
                    <span key={i} className="sc-strength__seg" style={{ background: i <= strength ? STRENGTH_COLOR[strength] : undefined }} />
                  ))}
                </div>
                <span className="sc-strength__label" style={{ color: STRENGTH_COLOR[strength] }}>{STRENGTH_LABEL[strength]}</span>
              </div>
            )}
          </div>
          <div className="sc-field">
            <label className="sc-field__label">Confirm password</label>
            <input className="sc-input" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Re-enter password" value={form.confirm} onChange={set("confirm")} required />
          </div>

          <button className="sc-btn sc-btn--primary" type="submit" disabled={loading} style={{ marginTop: 6 }}>
            {loading ? "Creating account…" : "Continue"}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <p className="sc-form__sub" style={{ marginTop: 16, fontSize: 11.5, color: "var(--sc-ink-faint)" }}>
          You'll create your organization in the next step.
        </p>
      </div>
    </AuthShell>
  );
}
