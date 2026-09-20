import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Sun, Moon, Coffee } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const MESSAGES = [
  "Ready to close more deals today?",
  "Your pipeline is waiting. Let's make it happen.",
  "Make today count. Every lead matters.",
  "Focus, execute, win. Let's get it done.",
  "New day, new opportunities ahead.",
];

export default function WelcomePopup() {
  const { profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [msg] = useState(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);

  useEffect(() => {
    if (!profile?.id) return;
    const key = `salescrm_welcomed_${profile.id}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      const t1 = setTimeout(() => setVisible(true), 600);
      const t2 = setTimeout(() => setVisible(false), 5800);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [profile?.id]);

  const firstName = profile?.full_name?.split(" ")[0] || "there";
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";
  const hour = new Date().getHours();
  const timeLabel = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const TimeIcon = hour < 12 ? Coffee : hour < 17 ? Sun : Moon;
  const timeColor = hour < 12 ? "#F59E0B" : hour < 17 ? "#3B82F6" : "#8B5CF6";

  const ROLE_NAMES = { owner: "Super Admin", sales_head: "Sales Head", sales_manager: "Sales Manager", employee: "Sales Employee", inside_sales: "Inside Sales" };
  const roleLabel = ROLE_NAMES[profile?.role] || profile?.role?.replace(/_/g, " ") || "Member";

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="welcome-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setVisible(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 9998,
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          />

          {/* Centering shell */}
          <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <motion.div
              key="welcome-popup"
              initial={{ opacity: 0, scale: 0.82, y: 28 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: -20 }}
              transition={{ type: "spring", damping: 22, stiffness: 270, mass: 0.85 }}
              style={{
                pointerEvents: "all",
                width: 440,
                maxWidth: "calc(100vw - 32px)",
                background: "linear-gradient(150deg, #080c1c 0%, #0c1228 55%, #080c18 100%)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 24,
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.04), " +
                  "0 40px 80px rgba(0,0,0,0.75), " +
                  "0 0 0 100vmax rgba(0,0,0,0.0), " +
                  "0 0 80px rgba(37,99,235,0.1)",
                overflow: "hidden",
              }}
            >
              {/* Top shimmer line */}
              <div style={{
                position: "absolute", top: 0, left: "10%", right: "10%", height: 1,
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
              }} />

              {/* Ambient glows */}
              <div style={{
                position: "absolute", top: -80, right: -80, width: 240, height: 240,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />
              <div style={{
                position: "absolute", bottom: -60, left: -40, width: 200, height: 200,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(79,70,229,0.14) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />

              <div style={{ padding: "36px 36px 28px", position: "relative" }}>
                {/* Close */}
                <button
                  onClick={() => setVisible(false)}
                  style={{
                    position: "absolute", top: 16, right: 16,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10, width: 32, height: 32,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "rgba(255,255,255,0.4)",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.4)";
                  }}
                >
                  <X size={14} />
                </button>

                {/* Avatar */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
                  <motion.div
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.18, type: "spring", stiffness: 320, damping: 18 }}
                    style={{
                      width: 76, height: 76, borderRadius: "50%",
                      background: profile?.avatar_url
                        ? "transparent"
                        : "linear-gradient(135deg, #2563EB, #4F46E5)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 26, fontWeight: 800, color: "white",
                      boxShadow: "0 0 0 3px rgba(37,99,235,0.25), 0 10px 36px rgba(37,99,235,0.45)",
                      marginBottom: 22, overflow: "hidden", position: "relative",
                    }}
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : initials}
                    {/* Online dot */}
                    <div style={{
                      position: "absolute", bottom: 3, right: 3,
                      width: 14, height: 14, borderRadius: "50%",
                      background: "#10B981",
                      border: "2.5px solid #080c1c",
                    }} />
                  </motion.div>

                  {/* Time pill */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 14px", borderRadius: 99,
                      background: `${timeColor}14`,
                      border: `1px solid ${timeColor}28`,
                      marginBottom: 14,
                    }}
                  >
                    <TimeIcon size={12} style={{ color: timeColor }} strokeWidth={2} />
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, color: timeColor,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                    }}>
                      {timeLabel}
                    </span>
                  </motion.div>

                  {/* Greeting */}
                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.32 }}
                    style={{
                      fontSize: 27, fontWeight: 800, color: "#EEF2FF",
                      letterSpacing: "-0.04em", lineHeight: 1.1,
                      margin: "0 0 10px", textAlign: "center",
                    }}
                  >
                    Welcome back, {firstName} 👋
                  </motion.h2>

                  {/* Subtitle */}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    style={{
                      fontSize: 14, color: "rgba(170,190,255,0.55)",
                      lineHeight: 1.6, margin: 0, textAlign: "center", maxWidth: 300,
                    }}
                  >
                    {msg}
                  </motion.p>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 20 }} />

                {/* Workspace card */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.44 }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "13px 16px", borderRadius: 14,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    marginBottom: 20,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: "rgba(37,99,235,0.15)",
                      border: "1px solid rgba(37,99,235,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Sparkles size={15} style={{ color: "#60A5FA" }} strokeWidth={1.7} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(210,225,255,0.9)" }}>
                        Sales CRM
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(140,160,210,0.45)", marginTop: 1 }}>
                        Workspace · {profile?.email || ""}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    padding: "4px 12px", borderRadius: 99,
                    background: "rgba(37,99,235,0.15)",
                    border: "1px solid rgba(37,99,235,0.22)",
                    fontSize: 11.5, fontWeight: 700,
                    color: "#93C5FD", textTransform: "capitalize",
                    letterSpacing: "0.03em",
                  }}>
                    {roleLabel}
                  </div>
                </motion.div>

                {/* Progress bar */}
                <div style={{ height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden" }}>
                  <motion.div
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: 5.2, ease: "linear" }}
                    style={{
                      height: "100%",
                      background: "linear-gradient(90deg, #2563EB, #38BDF8, #4F46E5)",
                      borderRadius: 99,
                    }}
                  />
                </div>
                <div style={{
                  marginTop: 8, textAlign: "center",
                  fontSize: 11, color: "rgba(100,120,170,0.4)",
                }}>
                  Closes automatically
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
