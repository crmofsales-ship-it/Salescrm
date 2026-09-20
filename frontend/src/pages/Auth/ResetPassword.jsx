import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "../../supabaseClient";
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
const LABEL = ["", "Weak", "Fair", "Good", "Strong"];
const COLOR = ["", "#DC2626", "#D97706", "#CA8A04", "#16A34A"];

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);       // recovery session established
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const strength = useMemo(() => scorePassword(password), [password]);

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash and fires PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 1800);
    } catch (err) {
      setError(err?.message || "This reset link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="sc-form">
        <div className="sc-form__head">
          <h2 className="sc-form__title">Choose a new password</h2>
          <p className="sc-form__sub">For your account security, pick something you haven't used before.</p>
        </div>

        {done ? (
          <div className="sc-alert sc-alert--ok">
            <CheckCircle2 size={15} style={{ flex: "none", marginTop: 1 }} />
            <span>Password updated. Redirecting to sign in…</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="sc-alert sc-alert--error">
                <AlertCircle size={15} style={{ flex: "none", marginTop: 1 }} /><span>{error}</span>
              </div>
            )}
            {!ready && (
              <div className="sc-alert sc-alert--error">
                <AlertCircle size={15} style={{ flex: "none", marginTop: 1 }} />
                <span>Open this page from the reset link in your email.</span>
              </div>
            )}
            <div className="sc-field">
              <label className="sc-field__label">New password</label>
              <div className="sc-input-wrap">
                <input className="sc-input sc-input--has-btn" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" className="sc-input-btn" onClick={() => setShow((v) => !v)} tabIndex={-1}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {password && (
                <div className="sc-strength">
                  <div className="sc-strength__track">
                    {[1, 2, 3, 4].map((i) => (
                      <span key={i} className="sc-strength__seg" style={{ background: i <= strength ? COLOR[strength] : undefined }} />
                    ))}
                  </div>
                  <span className="sc-strength__label" style={{ color: COLOR[strength] }}>{LABEL[strength]}</span>
                </div>
              )}
            </div>
            <div className="sc-field">
              <label className="sc-field__label">Confirm password</label>
              <input className="sc-input" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <button className="sc-btn sc-btn--primary" type="submit" disabled={loading || !ready}>
              {loading ? "Updating…" : "Update password"}
              {!loading && <KeyRound size={15} />}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
