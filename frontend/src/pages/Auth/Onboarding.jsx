import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, Upload, Check, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { orgService } from "../../services/orgService";
import "../../styles/auth.css";

const INDUSTRIES = ["SaaS / Software", "Manufacturing", "Real Estate", "Financial Services",
  "Healthcare", "Retail / E-commerce", "Agency / Consulting", "Education", "Other"];
const MAX_LOGO = 2 * 1024 * 1024;

export default function Onboarding() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [step, setStep] = useState(0); // 0 welcome, 1 org, 2 logo, 3 done
  const [org, setOrg] = useState(null);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pickLogo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(f.type)) return setError("Use a PNG, JPG, WebP or SVG image.");
    if (f.size > MAX_LOGO) return setError("Logo must be under 2 MB.");
    setError("");
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  };

  const createOrg = async () => {
    if (name.trim().length < 2) return setError("Enter your organization name.");
    setLoading(true); setError("");
    try {
      const created = await orgService.createOrganization({ name, industry: industry || null, website: website.trim() || null });
      setOrg(created);
      setStep(2);
    } catch (e) {
      setError(e?.message || "Could not create the organization.");
    } finally { setLoading(false); }
  };

  const saveLogoAndFinish = async (skip = false) => {
    setLoading(true); setError("");
    try {
      if (!skip && logoFile && org) await orgService.uploadLogo(org.id, logoFile);
      await orgService.completeOnboarding(org.id);
      await refreshProfile();
      setStep(3);
      setTimeout(() => { window.location.assign("/dashboard"); }, 1100);
    } catch (e) {
      setError(e?.message || "Could not save your logo.");
    } finally { setLoading(false); }
  };

  return (
    <div className="sc-onb">
      <div className="sc-onb__card">
        <div className="sc-steps">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`sc-steps__dot ${i <= step ? "sc-steps__dot--on" : ""}`} />
          ))}
        </div>

        {error && (
          <div className="sc-alert sc-alert--error" style={{ marginBottom: 18 }}>
            <AlertCircle size={15} style={{ flex: "none", marginTop: 1 }} /><span>{error}</span>
          </div>
        )}

        {step === 0 && (
          <>
            <h2 className="sc-form__title">Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋</h2>
            <p className="sc-form__sub" style={{ margin: "8px 0 24px" }}>
              Let's set up your organization. It takes about a minute — you can invite your team afterwards.
            </p>
            <button className="sc-btn sc-btn--primary" onClick={() => setStep(1)}>
              Get started <ArrowRight size={16} />
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="sc-form__title">Create your organization</h2>
            <p className="sc-form__sub" style={{ margin: "6px 0 20px" }}>You'll be the owner and can add teammates later.</p>
            <div className="sc-field">
              <label className="sc-field__label">Organization name</label>
              <input className="sc-input" autoFocus placeholder="Acme Technologies" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="sc-field">
              <label className="sc-field__label">Industry <span style={{ color: "var(--sc-ink-faint)" }}>(optional)</span></label>
              <select className="sc-input" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="">Select…</option>
                {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="sc-field">
              <label className="sc-field__label">Website <span style={{ color: "var(--sc-ink-faint)" }}>(optional)</span></label>
              <input className="sc-input" placeholder="https://acme.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <button className="sc-btn sc-btn--primary" onClick={createOrg} disabled={loading} style={{ marginTop: 6 }}>
              {loading ? "Creating…" : "Continue"} {!loading && <ArrowRight size={16} />}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="sc-form__title">Add your logo</h2>
            <p className="sc-form__sub" style={{ margin: "6px 0 20px" }}>Shown across your workspace. You can change it any time in settings.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
              <div className="sc-logo-drop" onClick={() => fileRef.current?.click()}>
                {logoPreview ? <img src={logoPreview} alt="logo preview" /> : <span><Building2 size={20} /><br />Upload</span>}
              </div>
              <div>
                <button className="sc-btn sc-btn--ghost" style={{ width: "auto", padding: "0 14px", height: 36 }} onClick={() => fileRef.current?.click()}>
                  <Upload size={15} /> Choose image
                </button>
                <p style={{ fontSize: 11.5, color: "var(--sc-ink-faint)", marginTop: 8 }}>PNG, JPG, WebP or SVG · max 2 MB</p>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={pickLogo} />
            </div>
            <button className="sc-btn sc-btn--primary" onClick={() => saveLogoAndFinish(false)} disabled={loading}>
              {loading ? "Saving…" : "Finish setup"} {!loading && <ArrowRight size={16} />}
            </button>
            <button className="sc-btn sc-btn--ghost" style={{ marginTop: 10 }} onClick={() => saveLogoAndFinish(true)} disabled={loading}>
              Skip for now
            </button>
          </>
        )}

        {step === 3 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--sc-accent-wash)", color: "var(--sc-accent)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
              <Check size={24} />
            </div>
            <h2 className="sc-form__title">You're all set</h2>
            <p className="sc-form__sub" style={{ marginTop: 8 }}>Taking you to your dashboard…</p>
          </div>
        )}
      </div>
    </div>
  );
}
