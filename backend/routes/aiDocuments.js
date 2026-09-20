const express = require("express");
const router = express.Router();
const multer = require("multer");
const { authenticate } = require("../middleware/auth");
const { withOrg } = require("../middleware/orgContext");

router.use(authenticate, withOrg);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|doc|docx|txt|md|xlsx|xls)$/i;
    if (allowed.test(file.originalname)) return cb(null, true);
    cb(new Error("Unsupported file type. Allowed: PDF, DOC, DOCX, TXT, MD, XLSX"));
  },
});

async function extractText(buffer, originalname) {
  const ext = originalname.split(".").pop().toLowerCase();
  if (ext === "pdf") {
    const pdfParse = require("pdf-parse");
    return (await pdfParse(buffer)).text || "";
  }
  if (ext === "docx" || ext === "doc") {
    const mammoth = require("mammoth");
    return (await mammoth.extractRawText({ buffer })).value || "";
  }
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = require("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames.map((n) => `Sheet: ${n}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[n])}`).join("\n\n");
  }
  return buffer.toString("utf8");
}

function chunkText(text, chunkSize = 800, overlap = 100) {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const para of paragraphs) {
    if (current.length + para.length + 2 <= chunkSize) {
      current += (current.length > 0 ? "\n\n" : "") + para;
    } else if (current.length > 0) {
      chunks.push(current.trim());
      current = current.slice(-overlap) + "\n\n" + para;
    } else {
      const sentences = para.match(/[^.!?]+[.!?]+\s*/g) || [para];
      for (const s of sentences) {
        if (current.length + s.length > chunkSize && current.length > 0) {
          chunks.push(current.trim());
          current = current.slice(-overlap) + s;
        } else current += s;
      }
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 30);
}

// POST /api/ai/documents/upload
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file provided" });
  const { originalname, buffer, mimetype, size } = req.file;
  const userId = req.profile.id;
  const ext = originalname.split(".").pop().toLowerCase();

  const { data: doc, error: docErr } = await req.db
    .from("ai_documents")
    .insert({ name: originalname, file_type: ext, size_bytes: size, uploaded_by: userId, status: "processing", organization_id: req.organizationId })
    .select().single();
  if (docErr) return res.status(500).json({ error: docErr.message });

  try {
    const filePath = `${req.organizationId}/ai-docs/${doc.id}.${ext}`;
    await req.db.storage.from("ai-documents").upload(filePath, buffer, { contentType: mimetype, upsert: true });

    const rawText = await extractText(buffer, originalname);
    if (!rawText || rawText.trim().length < 20) throw new Error("No readable text found in this document");
    const chunks = chunkText(rawText);
    if (chunks.length === 0) throw new Error("Document is empty after text extraction");

    for (let i = 0; i < chunks.length; i += 50) {
      const batch = chunks.slice(i, i + 50).map((content, j) => ({ document_id: doc.id, content, chunk_index: i + j }));
      const { error: chunkErr } = await req.db.from("ai_document_chunks").insert(batch);
      if (chunkErr) throw new Error(chunkErr.message);
    }

    await req.db.from("ai_documents")
      .update({ status: "ready", chunk_count: chunks.length, updated_at: new Date().toISOString() })
      .eq("id", doc.id);
    res.json({ id: doc.id, name: originalname, status: "ready", chunk_count: chunks.length });
  } catch (err) {
    console.error("Document processing error:", err.message);
    await req.db.from("ai_documents")
      .update({ status: "error", error_message: err.message, updated_at: new Date().toISOString() })
      .eq("id", doc.id);
    res.status(500).json({ error: `Processing failed: ${err.message}` });
  }
});

// GET /api/ai/documents
router.get("/", async (req, res) => {
  const { data, error } = await req.db
    .from("ai_documents")
    .select("id, name, file_type, size_bytes, status, chunk_count, error_message, created_at, uploaded_by")
    .order("created_at", { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ documents: data || [] });
});

// DELETE /api/ai/documents/:id
router.delete("/:id", async (req, res) => {
  const { error } = await req.db.from("ai_documents").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
