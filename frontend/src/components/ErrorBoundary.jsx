import { Component } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Caught render error:", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Reset when route changes so navigating away always recovers
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100%", minHeight: 360, padding: 40, textAlign: "center",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, background: "rgba(239,68,68,0.08)",
          border: "1.5px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center",
          justifyContent: "center", marginBottom: 20,
        }}>
          <AlertTriangle size={24} style={{ color: "#EF4444" }} strokeWidth={1.8} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)", marginBottom: 8, letterSpacing: "-0.02em" }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-muted)", maxWidth: 340, lineHeight: 1.6, marginBottom: 24 }}>
          This page ran into an unexpected error. Navigate to another page or reload to recover.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 20px",
              borderRadius: 10, background: "var(--accent)", color: "#fff",
              fontSize: 13.5, fontWeight: 700, border: "none", cursor: "pointer",
            }}
          >
            <RefreshCw size={14} strokeWidth={2} /> Retry
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 20px",
              borderRadius: 10, background: "var(--surface-2)", color: "var(--text-2)",
              fontSize: 13.5, fontWeight: 600, border: "1px solid var(--border)", cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
        {import.meta.env.DEV && this.state.error && (
          <pre style={{ marginTop: 24, maxWidth: 560, textAlign: "left", fontSize: 11, color: "#EF4444", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 14px", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {this.state.error.toString()}
          </pre>
        )}
      </div>
    );
  }
}
