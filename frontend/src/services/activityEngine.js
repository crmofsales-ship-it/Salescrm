// Centralized CRM Activity Engine
// Fire-and-forget logger. Every failure is silently swallowed so that
// logging NEVER blocks, throws, or crashes the calling action.
import { db as supabase } from "../lib/db";

// relatedType override lets callers explicitly mark an activity as belonging to
// "pipeline", "lead", or "deal" so getContextRoute routes correctly.
async function log({ type, title, description, userId, leadId, dealId, relatedType, metadata = {} }) {
  if (!userId) return;
  try {
    const autoRelatedType = dealId ? "deal" : leadId ? "lead" : null;
    await supabase.from("activities").insert({
      type,
      title,
      description,
      status:       "done",
      user_id:      userId,
      created_by:   userId,
      lead_id:      leadId  || null,
      deal_id:      dealId  || null,
      related_type: relatedType || autoRelatedType,
      related_id:   dealId  || leadId || null,
      metadata,
    });
  } catch (_) {
    // intentionally silent
  }
}

export const ActivityEngine = {
  // ── Pipeline — always tagged related_type:"pipeline" so Open → /pipeline?entry=ID ──
  prospectCreated: ({ userId, leadId, company }) =>
    log({ type: "record_created", title: "Prospect Created",
          description: `${company || "New prospect"} added to pipeline`,
          userId, leadId, relatedType: "pipeline" }),

  prospectUpdated: ({ userId, leadId, company }) =>
    log({ type: "note", title: "Prospect Updated",
          description: `${company || "Prospect"} details updated`,
          userId, leadId, relatedType: "pipeline" }),

  prospectConverted: ({ userId, leadId, company }) =>
    log({ type: "lead_converted", title: "Converted to Lead",
          description: `${company || "Prospect"} converted to lead`,
          userId, leadId, relatedType: "pipeline" }),

  pipelineStageChanged: ({ userId, leadId, company, oldStage, newStage, userName }) =>
    log({ type: "stage_change", title: "Pipeline Stage Changed",
          description: `${company || "Prospect"}: stage changed from "${(oldStage || "—").replace(/_/g," ")}" to "${(newStage || "—").replace(/_/g," ")}" by ${userName || "user"}`,
          userId, leadId, relatedType: "pipeline", metadata: { oldStage, newStage } }),

  pipelineSourceChanged: ({ userId, leadId, company, oldSource, newSource, userName }) =>
    log({ type: "note", title: "Pipeline Source Changed",
          description: `${company || "Prospect"}: source changed from "${oldSource || "—"}" to "${newSource || "—"}" by ${userName || "user"}`,
          userId, leadId, relatedType: "pipeline", metadata: { oldSource, newSource } }),

  // ── Leads ──────────────────────────────────────────────────────────────────
  leadCreated: ({ userId, leadId, company }) =>
    log({ type: "record_created", title: "Lead Created",
          description: `${company || "New lead"} added`, userId, leadId }),

  leadUpdated: ({ userId, leadId, company }) =>
    log({ type: "note", title: "Lead Updated",
          description: `${company || "Lead"} details updated`, userId, leadId }),

  leadStageChanged: ({ userId, leadId, company, oldStage, newStage }) =>
    log({ type: "stage_change", title: "Lead Stage Changed",
          description: `${company || "Lead"}: ${(oldStage || "—").replace(/_/g," ")} → ${(newStage || "—").replace(/_/g," ")}`,
          userId, leadId, metadata: { oldStage, newStage } }),

  leadStatusChanged: ({ userId, leadId, company, oldStatus, newStatus, userName }) =>
    log({ type: "note", title: "Lead Status Changed",
          description: `${company || "Lead"}: status changed from "${oldStatus || "—"}" to "${newStatus || "—"}" by ${userName || "user"}`,
          userId, leadId, metadata: { oldStatus, newStatus } }),

  leadAssigned: ({ userId, leadId, company, assigneeName }) =>
    log({ type: "assignment", title: "Lead Assigned",
          description: `${company || "Lead"} assigned to ${assigneeName || "team member"}`,
          userId, leadId }),

  leadConverted: ({ userId, leadId, company }) =>
    log({ type: "lead_converted", title: "Lead Converted to Deal",
          description: `${company || "Lead"} converted to deal`, userId, leadId }),

  // ── Deals ──────────────────────────────────────────────────────────────────
  dealCreated: ({ userId, dealId, company }) =>
    log({ type: "record_created", title: "Deal Created",
          description: `${company || "New deal"} created`, userId, dealId }),

  dealUpdated: ({ userId, dealId, company }) =>
    log({ type: "note", title: "Deal Updated",
          description: `${company || "Deal"} details updated`, userId, dealId }),

  dealStageChanged: ({ userId, dealId, company, oldStage, newStage }) =>
    log({ type: "stage_change", title: "Deal Stage Changed",
          description: `${company || "Deal"}: ${(oldStage || "—").replace(/_/g," ")} → ${(newStage || "—").replace(/_/g," ")}`,
          userId, dealId, metadata: { oldStage, newStage } }),

  dealAssigned: ({ userId, dealId, company, assigneeName }) =>
    log({ type: "assignment", title: "Deal Assigned",
          description: `${company || "Deal"} assigned to ${assigneeName || "team member"}`,
          userId, dealId }),

  dealWon: ({ userId, dealId, company, value }) =>
    log({ type: "deal_won", title: "Deal Won",
          description: `${company || "Deal"} won${value ? ` — ₹${Number(value).toLocaleString("en-IN")}` : ""}`,
          userId, dealId, metadata: { value } }),

  dealLost: ({ userId, dealId, company, reason }) =>
    log({ type: "deal_lost", title: "Deal Lost",
          description: `${company || "Deal"} lost${reason ? ` — ${reason}` : ""}`,
          userId, dealId, metadata: { reason } }),
};
