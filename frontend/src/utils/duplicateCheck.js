const normalize = (v) => (v || "").trim().toLowerCase();
const normalizePhone = (v) => (v || "").replace(/\D/g, "").slice(-10); // last 10 digits

function parseNotes(record, key) {
  const val = record[key];
  if (!val) return {};
  if (typeof val === "object" && !Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return {}; }
}

function extractFields(record, notesKey, phoneKey) {
  const notes = parseNotes(record, notesKey);
  return {
    company:  normalize(record.company_name || record.title || ""),
    contact:  normalize(record.contact_name || ""),
    email:    normalize(notes.email || ""),
    phone:    normalizePhone(notes[phoneKey] || ""),
    linkedin: normalize(notes.linkedin || ""),
    website:  normalize(notes.website || ""),
  };
}

function computeScore(newF, existF) {
  let score = 0;
  const reasons = [];

  if (newF.company && existF.company) {
    if (newF.company === existF.company) {
      score += 50; reasons.push("Company name matches");
    } else if (newF.company.includes(existF.company) || existF.company.includes(newF.company)) {
      score += 25; reasons.push("Company name is similar");
    }
  }

  if (newF.email && existF.email && newF.email === existF.email) {
    score += 40; reasons.push("Email matches");
  }

  if (newF.phone.length >= 7 && newF.phone === existF.phone) {
    score += 40; reasons.push("Phone number matches");
  }

  if (newF.contact && existF.contact && newF.contact === existF.contact) {
    score += 15; reasons.push("Contact name matches");
  }

  if (newF.website && existF.website && newF.website === existF.website) {
    score += 10; reasons.push("Website matches");
  }

  return { score, reasons };
}

function runDetection(newFields, existingRecords, notesKey, phoneKey) {
  if (!newFields.company && !newFields.email && !newFields.phone) {
    return { exact: [], partial: [] };
  }

  const exact = [], partial = [];
  for (const rec of existingRecords) {
    const existF = extractFields(rec, notesKey, phoneKey);
    const { score, reasons } = computeScore(newFields, existF);
    if (score >= 60) exact.push({ record: rec, score, reasons });
    else if (score >= 25) partial.push({ record: rec, score, reasons });
  }

  const sort = (arr) => arr.sort((a, b) => b.score - a.score).slice(0, 5);
  return { exact: sort(exact), partial: sort(partial) };
}

/**
 * Score-based detection for partial/similar matches (used for warnings).
 * Returns { exact, partial } arrays.
 */
export function detectDuplicates(newRecord, existingRecords, { notesKey = "other_notes", phoneKey = "phone" } = {}) {
  const newFields = extractFields(newRecord, notesKey, phoneKey);
  return runDetection(newFields, existingRecords, notesKey, phoneKey);
}

/**
 * Score-based detection for flat/CSV objects (used for warnings in CSV import).
 */
export function detectDuplicatesFlat(flat, existingRecords, { notesKey = "other_notes", phoneKey = "phone" } = {}) {
  const newFields = {
    company:  normalize(flat.company_name || flat.title || ""),
    contact:  normalize(flat.contact_name || ""),
    email:    normalize(flat.email || ""),
    phone:    normalizePhone(flat[phoneKey] || flat.phone || ""),
    linkedin: normalize(flat.linkedin || ""),
    website:  normalize(flat.website || ""),
  };
  return runDetection(newFields, existingRecords, notesKey, phoneKey);
}

/**
 * STRICT exact duplicate detection.
 *
 * A record is an exact duplicate when:
 *   1. Company name matches exactly (required)
 *   2. No provided field (contact, email, phone, linkedin, website) differs between the two records
 *      — "differs" means BOTH records have a non-empty value AND those values do not match
 *   3. At least one contact identifier (email OR phone) matches
 *
 * This means:
 *   - Same company + different contact → ALLOW
 *   - Same company + same contact + different email → ALLOW
 *   - Same company + same contact + different phone → ALLOW
 *   - Same company + same contact + same email + same phone + different linkedin → ALLOW
 *   - Same company + same contact + same email + same phone → BLOCK
 *
 * Returns array of { record, reasons } for exact matches.
 */
export function detectExactDuplicates(newRecord, existingRecords, { notesKey = "other_notes", phoneKey = "phone" } = {}) {
  const nf = extractFields(newRecord, notesKey, phoneKey);

  // Need a company name and at least one contact method
  if (!nf.company) return [];
  if (!nf.email && !nf.phone) return [];

  const results = [];

  for (const rec of existingRecords) {
    const ef = extractFields(rec, notesKey, phoneKey);
    if (!ef.company || ef.company !== nf.company) continue;

    // Any provided field that differs → NOT an exact duplicate
    if (nf.contact  && ef.contact  && nf.contact  !== ef.contact)  continue;
    if (nf.email    && ef.email    && nf.email    !== ef.email)    continue;
    if (nf.phone    && ef.phone    && nf.phone    !== ef.phone)    continue;
    if (nf.linkedin && ef.linkedin && nf.linkedin !== ef.linkedin) continue;
    if (nf.website  && ef.website  && nf.website  !== ef.website)  continue;

    // At least one contact identifier must match
    const emailMatch = nf.email && ef.email && nf.email === ef.email;
    const phoneMatch = nf.phone && ef.phone && nf.phone === ef.phone;
    if (!emailMatch && !phoneMatch) continue;

    const reasons = ["Company name matches"];
    if (emailMatch) reasons.push("Email matches");
    if (phoneMatch) reasons.push("Phone matches");
    if (nf.contact && ef.contact && nf.contact === ef.contact) reasons.push("Contact name matches");

    results.push({ record: rec, reasons });
  }

  return results;
}

/**
 * Flat version of detectExactDuplicates (for CSV import rows).
 */
export function detectExactDuplicatesFlat(flat, existingRecords, { notesKey = "other_notes", phoneKey = "phone" } = {}) {
  const newRecord = {
    company_name: flat.company_name || flat.title || "",
    contact_name: flat.contact_name || "",
    [notesKey]: { email: flat.email || "", [phoneKey]: flat[phoneKey] || flat.phone || "", linkedin: flat.linkedin || "", website: flat.website || "" },
  };
  return detectExactDuplicates(newRecord, existingRecords, { notesKey, phoneKey });
}
