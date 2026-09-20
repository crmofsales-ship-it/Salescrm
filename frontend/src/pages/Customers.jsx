import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { customersService } from "../services/customersService";
import toast from "react-hot-toast";
import { Plus, Search, Pencil, Trash2, X, Building2, Download, Upload, User, Mail, Phone, Link2, ChevronDown, ChevronUp, UserPlus } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseJSON = (str) => { try { return str ? JSON.parse(str) : {}; } catch { return {}; } };
const toJSON = (obj) => JSON.stringify(obj);
const uid = () => Math.random().toString(36).slice(2, 9);

function migrateNotes(extra) {
  // Migrate old CTO/CEO/CFO structure to contacts array
  if (extra.contacts) return extra;
  const contacts = [];
  if (extra.cto?.name) contacts.push({ id: uid(), role: "CTO / IT Head", name: extra.cto.name, designation: extra.cto.designation || "", email: extra.cto.email || "", phone: "", linkedin: "" });
  if (extra.ceo?.name) contacts.push({ id: uid(), role: "CIO / CEO", name: extra.ceo.name, designation: extra.ceo.designation || "", email: extra.ceo.email || "", phone: "", linkedin: extra.ceo.linkedin || "" });
  if (extra.cfo?.name) contacts.push({ id: uid(), role: "CFO", name: extra.cfo.name, designation: extra.cfo.designation || "", email: extra.cfo.email || "", phone: "", linkedin: extra.cfo.linkedin || "" });
  return { ...extra, contacts };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
function csvRow(vals) { return vals.map((v) => `"${(v || "").toString().replace(/"/g, '""')}"`).join(","); }

function exportCustomersCSV(rows) {
  const hdrs = ["Industry", "Company Name", "Headquarters", "Turnover", "Contact Role", "Contact Name", "Designation", "Email", "Phone", "LinkedIn"];
  const lines = [csvRow(hdrs)];
  rows.forEach((c) => {
    const x = migrateNotes(parseJSON(c.notes));
    const contacts = x.contacts || [];
    if (contacts.length === 0) {
      lines.push(csvRow([c.industry, c.company_name, c.city, x.turnover, "", "", "", "", "", ""]));
    } else {
      contacts.forEach((ct, i) => {
        lines.push(csvRow([i === 0 ? c.industry : "", i === 0 ? c.company_name : "", i === 0 ? c.city : "", i === 0 ? x.turnover : "", ct.role, ct.name, ct.designation, ct.email, ct.phone, ct.linkedin]));
      });
    }
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const el = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "database.csv" });
  el.click(); URL.revokeObjectURL(el.href);
}

function parseCSVText(text) {
  const parseLine = (line) => {
    const res = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (line[i] === ',' && !inQ) { res.push(cur.trim()); cur = ""; }
      else cur += line[i];
    }
    res.push(cur.trim()); return res;
  };
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((l) => { const v = parseLine(l); return Object.fromEntries(headers.map((h, i) => [h, v[i] || ""])); });
}

function csvRowsToPayload(rows, userId) {
  // Group by company name
  const map = new Map();
  rows.forEach((r) => {
    const key = r["Company Name"];
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { industry: r["Industry"], company_name: key, city: r["Headquarters"], turnover: r["Turnover"], contacts: [] });
    }
    if (r["Contact Name"]) {
      map.get(key).contacts.push({ id: uid(), role: r["Contact Role"] || "", name: r["Contact Name"], designation: r["Designation"] || "", email: r["Email"] || "", phone: r["Phone"] || "", linkedin: r["LinkedIn"] || "" });
    }
  });
  return [...map.values()].map(({ turnover, contacts, ...company }) => ({
    ...company, notes: toJSON({ turnover, contacts }), created_by: userId,
  }));
}

const INDUSTRIES = ["Technology", "BFSI", "Healthcare", "Manufacturing", "Retail", "Education", "Real Estate", "Telecom", "Other"];
const CONTACT_ROLES = ["CTO / IT Head", "CEO", "CFO", "CIO", "COO", "VP Sales", "Head of Finance", "Decision Maker", "Technical Lead", "Other"];

// ─── Contact Row in form ──────────────────────────────────────────────────────
function ContactEditor({ contact, index, onChange, onRemove }) {
  const [open, setOpen] = useState(true);
  const fld = (key, val) => onChange(index, key, val);

  const ROLE_COLORS = { "CTO / IT Head": "#3B82F6", CEO: "#8B5CF6", CFO: "#10B981", CIO: "#F59E0B", COO: "#EC4899", default: "#6B7280" };
  const rc = ROLE_COLORS[contact.role] || ROLE_COLORS.default;

  return (
    <div style={{ border: `1.5px solid ${rc}30`, borderRadius: 12, overflow: "hidden" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ padding: "10px 14px", background: `${rc}08`, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${rc}18`, border: `1.5px solid ${rc}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <User size={12} style={{ color: rc }} strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{contact.name || `Contact ${index + 1}`}</div>
            {contact.role && <div style={{ fontSize: 11, color: rc, fontWeight: 600 }}>{contact.role}</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {open ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(index); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: "2px 4px" }}>
            <X size={14} />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 14px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="crm-label">Role / Title</label>
                <select className="crm-input" value={contact.role} onChange={(e) => fld("role", e.target.value)} style={{ height: 36 }}>
                  <option value="">Select role</option>
                  {CONTACT_ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="crm-label">Full Name *</label>
                <input className="crm-input" value={contact.name} onChange={(e) => fld("name", e.target.value)} placeholder="John Doe" style={{ height: 36 }} />
              </div>
              <div>
                <label className="crm-label">Designation</label>
                <input className="crm-input" value={contact.designation} onChange={(e) => fld("designation", e.target.value)} placeholder="Chief Technology Officer" style={{ height: 36 }} />
              </div>
              <div>
                <label className="crm-label">Email</label>
                <input className="crm-input" type="email" value={contact.email} onChange={(e) => fld("email", e.target.value)} placeholder="john@company.com" style={{ height: 36 }} />
              </div>
              <div>
                <label className="crm-label">Phone</label>
                <input className="crm-input" type="tel" value={contact.phone} onChange={(e) => fld("phone", e.target.value)} placeholder="+91 98765 43210" style={{ height: 36 }} />
              </div>
              <div>
                <label className="crm-label">LinkedIn URL</label>
                <input className="crm-input" value={contact.linkedin} onChange={(e) => fld("linkedin", e.target.value)} placeholder="https://linkedin.com/in/..." style={{ height: 36 }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Customer Modal ───────────────────────────────────────────────────────────
function CustomerModal({ customer, onClose, onSave }) {
  const extra = migrateNotes(parseJSON(customer?.notes));
  const [contacts, setContacts] = useState(extra.contacts?.length ? extra.contacts : []);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      industry: customer?.industry || "",
      company_name: customer?.company_name || "",
      headquarters: customer?.city || "",
      turnover: extra.turnover || "",
      website: extra.website || "",
      description: extra.description || "",
    },
  });

  const addContact = () => {
    setContacts((prev) => [...prev, { id: uid(), role: "", name: "", designation: "", email: "", phone: "", linkedin: "" }]);
  };

  const removeContact = (i) => setContacts((prev) => prev.filter((_, idx) => idx !== i));

  const updateContact = (i, key, val) => {
    setContacts((prev) => prev.map((c, idx) => idx === i ? { ...c, [key]: val } : c));
  };

  const onSubmit = async (fd) => {
    const validContacts = contacts.filter((c) => c.name.trim());
    await onSave({
      industry: fd.industry,
      company_name: fd.company_name,
      city: fd.headquarters,
      notes: toJSON({ turnover: fd.turnover, website: fd.website, description: fd.description, contacts: validContacts }),
    });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 680, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{customer ? "Edit Entry" : "Add to Database"}</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Company Info */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Building2 size={12} /> Company Information
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label className="crm-label">Industry</label>
                <select className="crm-input" {...register("industry")}>
                  <option value="">Select industry</option>
                  {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="crm-label">Company Name *</label>
                <input className="crm-input" {...register("company_name", { required: "Required" })} placeholder="Acme Pvt Ltd" />
                {errors.company_name && <span style={{ color: "var(--red)", fontSize: 11 }}>{errors.company_name.message}</span>}
              </div>
              <div>
                <label className="crm-label">Headquarters</label>
                <input className="crm-input" {...register("headquarters")} placeholder="Mumbai, India" />
              </div>
              <div>
                <label className="crm-label">Annual Turnover</label>
                <input className="crm-input" {...register("turnover")} placeholder="₹500 Cr" />
              </div>
              <div>
                <label className="crm-label">Website</label>
                <input className="crm-input" {...register("website")} placeholder="https://company.com" />
              </div>
              <div>
                <label className="crm-label">Description</label>
                <input className="crm-input" {...register("description")} placeholder="Brief about the company" />
              </div>
            </div>
          </div>

          {/* Contacts Section */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><User size={12} /> Key Contacts ({contacts.length})</div>
              <button type="button" onClick={addContact} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "1.5px dashed var(--border)", background: "transparent", color: "var(--accent)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                <UserPlus size={12} strokeWidth={2} /> Add Contact
              </button>
            </div>

            {contacts.length === 0 ? (
              <div
                onClick={addContact}
                style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer", transition: "all 0.15s" }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
              >
                <UserPlus size={22} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>Add contacts / decision makers</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>CEO, CTO, CFO, or any key person at this company</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {contacts.map((c, i) => (
                  <ContactEditor key={c.id} contact={c} index={i} onChange={updateContact} onRemove={removeContact} />
                ))}
                <button type="button" onClick={addContact} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 10, border: "1.5px dashed var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  <UserPlus size={13} strokeWidth={2} /> Add Another Contact
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : customer ? "Save Changes" : "Add Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Contact Pills for table ──────────────────────────────────────────────────
function ContactPills({ contacts }) {
  if (!contacts?.length) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const shown = contacts.slice(0, 2);
  const rest = contacts.length - 2;
  const ROLE_COLORS = { "CTO / IT Head": "#3B82F6", CEO: "#8B5CF6", CFO: "#10B981", CIO: "#F59E0B", COO: "#EC4899" };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {shown.map((c) => {
        const rc = ROLE_COLORS[c.role] || "#6B7280";
        return (
          <div key={c.id || c.name} style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 99, background: `${rc}12`, border: `1px solid ${rc}28`, color: rc, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <User size={9} strokeWidth={2.5} />
            {c.name}{c.role ? ` · ${c.role}` : ""}
          </div>
        );
      })}
      {rest > 0 && <span style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "3px 6px", borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border)" }}>+{rest} more</span>}
    </div>
  );
}

// ─── Expanded Row Detail ──────────────────────────────────────────────────────
function ExpandedContacts({ contacts }) {
  const ROLE_COLORS = { "CTO / IT Head": "#3B82F6", CEO: "#8B5CF6", CFO: "#10B981", CIO: "#F59E0B", COO: "#EC4899" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, padding: "16px 24px 16px 60px" }}>
      {contacts.map((c) => {
        const rc = ROLE_COLORS[c.role] || "#6B7280";
        return (
          <div key={c.id || c.name} style={{ borderRadius: 12, border: `1.5px solid ${rc}25`, background: `${rc}06`, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${rc}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <User size={13} style={{ color: rc }} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: rc, fontWeight: 600 }}>{c.role || c.designation}</div>
              </div>
            </div>
            {c.designation && c.designation !== c.role && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 4 }}>{c.designation}</div>}
            {c.email && (
              <a href={`mailto:${c.email}`} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--accent)", textDecoration: "none", marginBottom: 3 }}>
                <Mail size={10} strokeWidth={2} />{c.email}
              </a>
            )}
            {c.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-muted)" }}>
                <Phone size={10} strokeWidth={2} />{c.phone}
              </div>
            )}
            {c.linkedin && (
              <a href={c.linkedin} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#0A66C2", textDecoration: "none", marginTop: 3 }}>
                <Link2 size={10} strokeWidth={2} />LinkedIn Profile
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Customers() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [search, setSearch] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const fileRef = useRef();

  const { data: customersData, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => customersService.getAll({}),
  });

  const createMut = useMutation({
    mutationFn: customersService.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.success("Entry added"); setShowForm(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => customersService.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.success("Updated"); setEditCustomer(null); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: customersService.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.success("Deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = async (data) => {
    const payload = { ...data, created_by: profile?.id };
    if (editCustomer) await updateMut.mutateAsync({ id: editCustomer.id, ...payload });
    else await createMut.mutateAsync(payload);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    const rows = parseCSVText(text);
    const payloads = csvRowsToPayload(rows, profile?.id);
    let ok = 0, fail = 0;
    for (const p of payloads) {
      try { await createMut.mutateAsync(p); ok++; }
      catch { fail++; }
    }
    toast.success(`Imported ${ok} companies${fail ? `, ${fail} failed` : ""}`);
    e.target.value = "";
  };

  let customers = customersData?.data || [];
  if (filterIndustry) customers = customers.filter((c) => c.industry === filterIndustry);
  if (search) customers = customers.filter((c) => {
    const q = search.toLowerCase();
    const x = migrateNotes(parseJSON(c.notes));
    return (
      c.company_name?.toLowerCase().includes(q) ||
      c.industry?.toLowerCase().includes(q) ||
      (x.contacts || []).some((ct) => ct.name?.toLowerCase().includes(q) || ct.email?.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 280 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="crm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, contact..." style={{ paddingLeft: 32, height: 36 }} />
        </div>
        <select className="crm-input" value={filterIndustry} onChange={(e) => setFilterIndustry(e.target.value)} style={{ width: "auto", height: 36 }}>
          <option value="">All Industries</option>
          {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{customers.length} records</span>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleImport} />
        <button className="btn-secondary" onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6 }}><Upload size={14} /> Import CSV</button>
        <button className="btn-secondary" onClick={() => exportCustomersCSV(customers)} style={{ display: "flex", alignItems: "center", gap: 6 }} disabled={customers.length === 0}><Download size={14} /> Export CSV</button>
        <button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Add Entry</button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Loading...</div>
        ) : customers.length === 0 ? (
          <div className="empty-state">
            <Building2 size={40} />
            <h3>No records yet</h3>
            <p>Add your first database entry to get started</p>
          </div>
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }} />
                    <th>INDUSTRY</th>
                    <th>COMPANY NAME</th>
                    <th>HEADQUARTERS</th>
                    <th>TURNOVER</th>
                    <th>KEY CONTACTS</th>
                    <th style={{ textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const extra = migrateNotes(parseJSON(c.notes));
                    const contacts = extra.contacts || [];
                    const isExpanded = expandedId === c.id;
                    return (
                      <>
                        <tr key={c.id} style={{ cursor: contacts.length > 0 ? "pointer" : "default" }} onClick={() => contacts.length > 0 && setExpandedId(isExpanded ? null : c.id)}>
                          <td style={{ paddingRight: 0 }}>
                            {contacts.length > 0 && (
                              <div style={{ width: 20, height: 20, borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {isExpanded ? <ChevronUp size={11} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={11} style={{ color: "var(--text-muted)" }} />}
                              </div>
                            )}
                          </td>
                          <td>
                            {c.industry ? (
                              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "var(--accent-light)", color: "var(--accent)" }}>{c.industry}</span>
                            ) : "—"}
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{c.company_name}</div>
                            {extra.website && <a href={extra.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 11.5, color: "var(--accent)", textDecoration: "none" }}>{extra.website.replace(/^https?:\/\//, "")}</a>}
                          </td>
                          <td style={{ color: "var(--text-2)", fontSize: 13 }}>{c.city || "—"}</td>
                          <td style={{ color: "var(--text-2)", fontSize: 13 }}>{extra.turnover || "—"}</td>
                          <td><ContactPills contacts={contacts} /></td>
                          <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                              <motion.button className="btn-ghost" style={{ padding: "4px 8px" }} onClick={() => setEditCustomer(c)} whileHover={{ scale: 1.15, color: "#3B82F6" }} whileTap={{ scale: 0.85 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}><Pencil size={14} strokeWidth={1.75} /></motion.button>
                              <motion.button className="btn-ghost" style={{ padding: "4px 8px", color: "var(--red)" }} onClick={() => { if (window.confirm("Delete this entry?")) deleteMut.mutate(c.id); }} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.85 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}><Trash2 size={14} strokeWidth={1.75} /></motion.button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && contacts.length > 0 && (
                          <tr key={`${c.id}-exp`}>
                            <td colSpan={7} style={{ padding: 0, background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
                              <ExpandedContacts contacts={contacts} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {(showForm || editCustomer) && (
        <CustomerModal
          customer={editCustomer}
          onClose={() => { setShowForm(false); setEditCustomer(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
