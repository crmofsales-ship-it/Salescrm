import { supabase } from "../supabaseClient";

function slugify(name) {
  return (
    name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) ||
    "org"
  ) + "-" + Math.random().toString(36).slice(2, 7);
}

export const orgService = {
  async myProfileId() {
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from("profiles").select("id").eq("user_id", u.user.id).single();
    return data.id;
  },

  // Creates the organization and makes the caller its owner.
  async createOrganization({ name, industry = null, website = null, timezone = null, currency = "USD" }) {
    const profileId = await this.myProfileId();
    const { data: org, error } = await supabase
      .from("organizations")
      .insert({ name: name.trim(), slug: slugify(name), created_by: profileId, industry, website, timezone, currency })
      .select()
      .single();
    if (error) throw error;

    const { error: memErr } = await supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: profileId,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
    });
    if (memErr) throw memErr;

    localStorage.setItem("salescrm_active_org", org.id);
    return org;
  },

  async uploadLogo(orgId, file) {
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${orgId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("org-logos").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("org-logos").getPublicUrl(path);
    await supabase.from("organizations").update({ logo_url: data.publicUrl }).eq("id", orgId);
    return data.publicUrl;
  },

  async updateOrganization(orgId, patch) {
    const { data, error } = await supabase.from("organizations").update(patch).eq("id", orgId).select().single();
    if (error) throw error;
    return data;
  },

  async completeOnboarding(orgId) {
    await supabase
      .from("organizations")
      .update({ settings: { onboarded: true, onboarded_at: new Date().toISOString() } })
      .eq("id", orgId);
  },
};
