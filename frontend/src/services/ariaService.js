const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const TOOL_STATUS = {
  // Read tools
  get_leads:             "Querying leads...",
  get_prospects:         "Scanning prospects...",
  get_deals:             "Analyzing deals...",
  get_tasks:             "Checking tasks...",
  get_activities:        "Reviewing activities...",
  get_meetings:          "Checking meetings...",
  get_pipeline_summary:  "Computing pipeline...",
  get_analytics_summary: "Running analytics...",
  search_crm:            "Searching CRM...",
  get_ai_recommendations:"Generating recommendations...",
  get_release_notes:     "Loading release notes...",
  get_team_performance:  "Analyzing team performance...",
  // Write tools
  create_lead:           "Creating lead...",
  update_lead:           "Updating lead...",
  assign_lead:           "Assigning lead...",
  update_lead_stage:     "Updating stage...",
  create_activity:       "Logging activity...",
  schedule_follow_up:    "Scheduling follow-up...",
  schedule_meeting:      "Scheduling meeting...",
  create_task:           "Creating task...",
  create_deal:           "Creating deal...",
  update_deal:           "Updating deal...",
  draft_email:           "Composing email...",
};

export async function streamARIA({ message, pageContext, getToken, onStatus, onToken, onDone, onError, onEmailDraft, signal }) {
  try {
    const token = await getToken();

    const res = await fetch(`${API_URL}/api/ai/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ message, pageContext: pageContext || null }),
      signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Server error ${res.status}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";
    let fullText  = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") { onDone?.(fullText); return; }

        try {
          const parsed = JSON.parse(raw);
          if (parsed.type === "tool") {
            onStatus?.(TOOL_STATUS[parsed.name] || "Working...");
          } else if (parsed.type === "token") {
            fullText += parsed.content;
            onToken?.(parsed.content, fullText);
          } else if (parsed.type === "email_draft") {
            onEmailDraft?.(parsed.data);
          } else if (parsed.type === "error") {
            throw new Error(parsed.message);
          }
        } catch (e) {
          if (e.message && !e.message.includes("JSON") && !e.message.includes("Unexpected")) throw e;
        }
      }
    }

    onDone?.(fullText);
  } catch (err) {
    if (err.name === "AbortError") return;
    onError?.(err);
  }
}

export async function clearARIAHistory(getToken) {
  try {
    const token = await getToken();
    await fetch(`${API_URL}/api/ai/clear-history`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
  } catch { /* non-critical */ }
}

export async function executeAction(action_type, data, getToken) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/api/ai/execute-action`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ action_type, data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `Action failed (${res.status})`);
  return json;
}
