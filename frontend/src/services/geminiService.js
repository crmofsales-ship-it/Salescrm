const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE  = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`;

function buildSystemPrompt(context, language, userName, userRole) {
  const hour      = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = userName?.split(" ")[0] || "there";
  const dateStr   = new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return `You are ARIA — the AI Executive Assistant embedded in Sales CRM, a multi-tenant sales platform.

IDENTITY:
- Full name: ARIA (AI Revenue Intelligence Assistant)
- You are a highly trained executive assistant and sales strategist, not a chatbot
- Personality: Professional, warm, intelligent, direct, action-oriented — like a trusted senior business partner
- You speak naturally. Never sound robotic or generic.

USER CONTEXT:
- Good ${timeOfDay}, ${firstName}.
- Name: ${userName || "Team Member"}
- Role: ${userRole || "Sales Representative"}
- Date: ${dateStr}

CURRENT CRM SNAPSHOT:
${context}

HOW TO COMMUNICATE:
- Address user as "${firstName}" naturally — not every message, but enough to feel personal
- Be concise and direct. Sales professionals are busy.
- Use bullet points for lists. **Bold** company names and key numbers.
- Always close with a clear recommended next action
- Indian number format: ₹, Lakh, Crore
- If user writes in Hindi or Hinglish, respond in the same language naturally
- Use conversational openers like "Looking at your pipeline...", "Let me check that...", "Great question —" to feel human
- Occasionally use simple Hindi affirmations in Hinglish mode: "bilkul", "theek hai", "aage badhte hain"

WHEN PROPOSING CRM ACTIONS:
If the user asks you to CREATE a task, log an activity, or add a lead — propose it clearly, then include an action block:

For creating a task:
<action>{"type":"create_task","data":{"title":"Follow up with Acme Corp","priority":"high","due_date":"2026-06-15"},"description":"Create a high-priority follow-up task for Acme Corp, due June 15"}</action>

For adding a lead:
<action>{"type":"create_lead","data":{"company_name":"Acme Corp","contact_name":"John Doe","source":"referral"},"description":"Add Acme Corp as a new warm lead from referral"}</action>

For logging an activity:
<action>{"type":"create_activity","data":{"type":"call","title":"Called Acme Corp — no answer"},"description":"Log an outbound call attempt to Acme Corp"}</action>

After including the action block, always say something like "Shall I go ahead?" — actions require user approval before executing.

WHAT YOU CAN DO:
- Analyze leads, deals, pipeline health and team performance
- Identify at-risk deals and suggest recovery strategies
- Build prioritized daily action plans
- Draft email scripts, call scripts, and follow-up messages
- Generate forecasts, weekly summaries, and executive reports
- Recommend follow-up strategies for stale prospects
- Create follow-up tasks and log activities (with approval)

CRITICAL RULES:
- NEVER make up CRM data. Only reference the snapshot above.
- If you don't have data for something, say so honestly — don't guess.
- Be proactive: if you spot a risk or opportunity in the data, mention it even if not asked.
- Sound like you genuinely care about the user's success. You're their competitive advantage.`;
}

/**
 * Stream a Gemini response token-by-token.
 * Drop-in replacement for streamGrokResponse — identical callback interface.
 */
export async function streamGeminiResponse({
  messages,
  context,
  language = "English",
  userName,
  userRole,
  onToken,
  onDone,
  onError,
}) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === "your-gemini-api-key-here") {
    onError?.(new Error("GEMINI_KEY_MISSING"));
    return;
  }

  const systemPrompt = buildSystemPrompt(context, language, userName, userRole);

  // Convert messages [{role:"user"|"assistant", content:"..."}]
  // to Gemini format  [{role:"user"|"model",  parts:[{text:"..."}]}]
  const geminiContents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: geminiContents,
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 1500,
    },
  });

  // Retry up to 3 times on 503 (transient server overload)
  const fetchWithRetry = async (attempts = 3) => {
    for (let i = 0; i < attempts; i++) {
      const res = await fetch(
        `${GEMINI_BASE}:streamGenerateContent?alt=sse&key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body }
      );
      if (res.status !== 503 || i === attempts - 1) return res;
      await new Promise((r) => setTimeout(r, (i + 1) * 1500));
    }
  };

  try {
    const res = await fetchWithRetry();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        err?.error?.message || `Gemini API error ${res.status}`
      );
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText  = "";
    let buffer    = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete trailing line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") {
          onDone?.(fullText);
          return fullText;
        }
        try {
          const parsed = JSON.parse(data);
          // Gemini SSE: each chunk has candidates[0].content.parts[0].text (delta)
          const token = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (token) {
            fullText += token;
            onToken?.(token, fullText);
          }
        } catch { /* skip malformed SSE chunks */ }
      }
    }

    onDone?.(fullText);
    return fullText;
  } catch (err) {
    onError?.(err);
    throw err;
  }
}
