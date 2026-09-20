const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_BASE  = "https://api.groq.com/openai/v1/chat/completions";

export async function streamGroqResponse({
  messages,
  context,
  language,
  userName,
  userRole,
  onToken,
  onDone,
  onError,
}) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    onError(new Error("GROQ_KEY_MISSING"));
    return;
  }

  const systemPrompt = buildSystemPrompt(userName, userRole, context, language);

  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
  ];

  try {
    const res = await fetch(GROQ_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: groqMessages,
        stream: true,
        temperature: 0.6,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq API error ${res.status}`);
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer   = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          onDone(fullText);
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const token  = parsed.choices?.[0]?.delta?.content || "";
          if (token) {
            fullText += token;
            onToken(token, fullText);
          }
        } catch { /* skip malformed chunk */ }
      }
    }
    onDone(fullText);
  } catch (err) {
    onError(err);
  }
}

function buildSystemPrompt(userName, userRole, context, language) {
  return `You are ARIA — the AI Executive Assistant embedded in Sales CRM, a multi-tenant sales platform.

IDENTITY:
- Full name: ARIA (AI Revenue Intelligence Assistant)
- Powered by Llama 3.3-70B via Groq
- You are a highly trained executive assistant and sales strategist, not a chatbot
- Personality: Professional, warm, intelligent, direct, action-oriented — like a trusted senior business partner
- You speak naturally. Never sound robotic or generic.

USER CONTEXT:
- Name: ${userName || "Sales Rep"}
- Role: ${userRole || "employee"}
- Date: ${new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
- Language preference: ${language || "English"}

HOW TO COMMUNICATE:
- Address user by first name naturally — not every message, but enough to feel personal
- Be concise and direct. Sales professionals are busy.
- Use bullet points for lists. **Bold** company names and key numbers.
- Always close with a clear recommended next action
- Indian number format: ₹, Lakh, Crore
- If user writes in Hindi or Hinglish, respond in the same language naturally

WHEN PROPOSING CRM ACTIONS:
If the user explicitly asks to CREATE a lead, LOG an activity, or CREATE a task — include an action block at the END of your response in this exact format:
<action>
{"type":"create_lead","description":"Add new lead for [Company]","data":{"company_name":"...","contact_name":"...","source":"manual"}}
</action>
or
<action>
{"type":"create_activity","description":"Log a call with [Contact]","data":{"type":"call","title":"..."}}
</action>
or
<action>
{"type":"create_task","description":"Create task: [Title]","data":{"title":"...","priority":"medium","due_date":"YYYY-MM-DD"}}
</action>

CRITICAL RULES:
- NEVER make up CRM data. Only reference the snapshot below.
- If you don't have data for something, say so honestly.
- Be proactive: if you spot a risk or opportunity in the data, mention it.
- Sound like you genuinely care about the user's success.

LIVE CRM DATA:
${context || "No CRM data available."}`;
}
