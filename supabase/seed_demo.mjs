/**
 * Optional demo seed for a FRESH Sales CRM database.
 *
 *   node supabase/seed_demo.mjs
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from backend/.env.
 * Creates two independent demo organizations with neutral, invented data so you
 * can click through the product and verify tenant isolation. Uses NO real names,
 * companies, or email accounts. Safe to delete these orgs afterwards.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, "backend/.env"), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const s = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ORGS = [
  {
    name: "Acme Technologies", slug: "acme-demo", owner: { email: "owner@acme.example", name: "Jordan Rivera" },
    leads: [
      { company_name: "Nova Systems", contact_name: "Priya Menon", email: "priya@nova.example", stage: "qualified", temperature: "hot", budget: 120000, source: "referral" },
      { company_name: "Vertex Solutions", contact_name: "Chris Bauer", email: "chris@vertex.example", stage: "contacted", temperature: "warm", budget: 45000, source: "website" },
      { company_name: "Bright Retail Co", contact_name: "Dana Fischer", email: "dana@bright.example", stage: "new", temperature: "cold", budget: 8000, source: "exhibition" },
    ],
    deals: [
      { title: "Nova Systems — platform rollout", company_name: "Nova Systems", value: 120000, stage: "negotiation" },
      { title: "Vertex — pilot", company_name: "Vertex Solutions", value: 30000, stage: "proposal_sent" },
    ],
  },
  {
    name: "Meridian Group", slug: "meridian-demo", owner: { email: "owner@meridian.example", name: "Sam Okafor" },
    leads: [
      { company_name: "Harbor Logistics", contact_name: "Lena Park", email: "lena@harbor.example", stage: "proposal", temperature: "hot", budget: 90000, source: "call" },
      { company_name: "Quill Media", contact_name: "Tom Alvarez", email: "tom@quill.example", stage: "new", temperature: "warm", budget: 15000, source: "social" },
    ],
    deals: [
      { title: "Harbor Logistics — annual contract", company_name: "Harbor Logistics", value: 90000, stage: "contacted" },
    ],
  },
];

async function findOrCreateUser(email, name) {
  const { data: list } = await s.auth.admin.listUsers();
  let u = list?.users?.find((x) => x.email?.toLowerCase() === email);
  if (!u) {
    const { data, error } = await s.auth.admin.createUser({ email, email_confirm: true, password: "demo-Passw0rd!", user_metadata: { full_name: name } });
    if (error) throw error;
    u = data.user;
  }
  return u;
}

for (const o of ORGS) {
  const user = await findOrCreateUser(o.owner.email, o.owner.name);
  // handle_new_user trigger creates the profile; fetch it
  const { data: prof } = await s.from("profiles").select("id").eq("user_id", user.id).single();

  let { data: org } = await s.from("organizations").select("id").eq("slug", o.slug).maybeSingle();
  if (!org) {
    ({ data: org } = await s.from("organizations")
      .insert({ name: o.name, slug: o.slug, created_by: prof.id, plan: "pro", settings: { onboarded: true } })
      .select("id").single());
  }
  await s.from("organization_members").upsert(
    { organization_id: org.id, user_id: prof.id, role: "owner", status: "active", joined_at: new Date().toISOString() },
    { onConflict: "organization_id,user_id" });

  for (const l of o.leads) {
    await s.from("leads").insert({ ...l, organization_id: org.id, created_by: prof.id, assigned_to: prof.id });
  }
  for (const d of o.deals) {
    await s.from("deals").insert({ ...d, organization_id: org.id, created_by: prof.id, assigned_to: prof.id });
  }
  console.log(`seeded ${o.name}  ·  login: ${o.owner.email} / demo-Passw0rd!`);
}
console.log("done — two isolated demo organizations created.");
