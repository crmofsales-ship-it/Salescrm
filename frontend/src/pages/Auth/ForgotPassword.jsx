import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Send, MailCheck, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import AuthShell from "./AuthShell";

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setDone(true); // always show success to avoid account enumeration
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="sc-form">
        <div className="sc-form__head">
          <h2 className="sc-form__title">Reset your password</h2>
          <p className="sc-form__sub">We'll email you a secure link to choose a new one.</p>
        </div>

        {done ? (
          <>
            <div className="sc-alert sc-alert--ok">
              <MailCheck size={15} style={{ flex: "none", marginTop: 1 }} />
              <span>If an account exists for <strong>{email}</strong>, a reset link is on its way.</span>
            </div>
            <Link className="sc-btn sc-btn--ghost" to="/login"><ArrowLeft size={15} /> Back to sign in</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="sc-alert sc-alert--error">
                <AlertCircle size={15} style={{ flex: "none", marginTop: 1 }} /><span>{error}</span>
              </div>
            )}
            <div className="sc-field">
              <label className="sc-field__label">Work email</label>
              <input className="sc-input" type="email" autoFocus placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button className="sc-btn sc-btn--primary" type="submit" disabled={loading || !email.trim()}>
              {loading ? "Sending…" : "Send reset link"}
              {!loading && <Send size={15} />}
            </button>
            <button type="button" className="sc-btn sc-btn--ghost" style={{ marginTop: 10 }} onClick={() => navigate("/login")}>
              <ArrowLeft size={15} /> Back to sign in
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
