/**
 * iCelera - Backend (Refatorado para Firebase Firestore + Cloudinary + Vercel)
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");

const { db } = require("./lib/store"); // Conexão com Firebase
const { uploadPdfBuffer } = require("./lib/cloudinary"); // Conexão com Cloudinary
const autentique = require("./lib/autentique");
const { buildCertificatePdf } = require("./lib/pdf");
const cfg = require("./config");

const { PORT = 3000, JWT_SECRET, FRONTEND_ORIGIN, AUTENTIQUE_WEBHOOK_SECRET, INTERNAL_WEBHOOK_TOKEN } = process.env;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("❌ Defina JWT_SECRET (mínimo 32 caracteres) em backend/.env");
  process.exit(1);
}

/* Estados internos */
const PENDING = ["RASCUNHO", "AGUARDANDO_ASSINATURA", "ASSINATURA_EM_ANDAMENTO"];
const SIGNED = ["ASSINADO", "EMITIDO"];
const EDITABLE = ["RASCUNHO", "AGUARDANDO_ASSINATURA"];

const groupOf = s => (SIGNED.includes(s) ? "assinados" : "aguardando");
const digits = s => String(s || "").replace(/\D/g, "");
const propertyKey = (name, doc) => [String(name || "").trim().toLowerCase(), digits(doc)].join("|");
const now = () => new Date().toISOString();

/* ---------------- Utilitários do Banco (Firestore) ---------------- */
async function getNextId(type) {
  const ref = db.collection('system').doc('counters');
  return await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    let current = 0;
    if (doc.exists && doc.data()[type]) current = doc.data()[type];
    const next = current + 1;
    t.set(ref, { [type]: next }, { merge: true });
    return next;
  });
}

async function log(certificateId, action, by, detail) {
  await db.collection('history').add({
    id: crypto.randomUUID(),
    at: now(),
    certificateId,
    action,
    by,
    detail
  });
}

/* ---------------- Seed inicial ---------------- */
async function ensureSeed() {
  const usersSnap = await db.collection('users').limit(1).get();
  if (usersSnap.empty) {
    const e = process.env;
    if (!e.SEED_TECNICO_EMAIL || !e.SEED_COORDENADOR_EMAIL) return console.error("❌ Usuários Seed não configurados no .env");
    
    await db.collection('users').doc('u1').set({
      id: "u1", name: e.SEED_TECNICO_NAME || "Técnico", email: e.SEED_TECNICO_EMAIL.toLowerCase(), 
      role: "TECNICO", passwordHash: bcrypt.hashSync(e.SEED_TECNICO_PASSWORD, 10)
    });
    
    await db.collection('users').doc('u2').set({
      id: "u2", name: e.SEED_COORDENADOR_NAME || "Coordenador", email: e.SEED_COORDENADOR_EMAIL.toLowerCase(), 
      role: "COORDENADOR", passwordHash: bcrypt.hashSync(e.SEED_COORDENADOR_PASSWORD, 10)
    });
    console.log("✅ Usuários iniciais criados no Firebase.");
  }

  const propsSnap = await db.collection('properties').limit(1).get();
  if (propsSnap.empty) {
    await db.collection('properties').doc('p1').set({ id: "p1", name: "Air Liquide Brasil Ltda." });
    await db.collection('properties').doc('p2').set({ id: "p2", name: "Hospital São Lucas" });
    await db.collection('properties').doc('p3').set({ id: "p3", name: "Clínica Vida" });
  }
}
ensureSeed().catch(console.error);

/* ---------------- Sincronização Autentique ---------------- */
const syncLock = new Set();
const lastSync = new Map();

async function syncFromAutentique(documentId) {
  const snap = await db.collection('certificates').where('autentiqueDocId', '==', documentId).limit(1).get();
  if (snap.empty) return { found: false };
  
  const certRef = snap.docs[0].ref;
  const c = snap.docs[0].data();

  if (c.status === "EMITIDO" || syncLock.has(c.id)) return { found: true, status: c.status };
  syncLock.add(c.id);

  try {
    const doc = await autentique.getDocument(documentId);
    const sig = (doc.signatures || []).find(s => s.public_id === c.autentiqueSignerId) || (doc.signatures || [])[0];
    
    if (!sig || !sig.signed) return { found: true, status: c.status, signed: false };

    if (c.status !== "ASSINADO") {
      const userSnap = await db.collection('users').doc(c.signerUserId).get();
      const coord = userSnap.exists ? userSnap.data() : null;

      c.status = "ASSINADO"; 
      c.signedAt = sig.signed.created_at || now();
      c.signedBy = coord ? coord.name : (sig.name || sig.email); 
      c.updatedAt = now();
      
      await log(c.id, "ASSINADO", c.signedBy, "Assinatura confirmada pelo Autentique");
      await certRef.update(c);
    }

    const url = doc.files && doc.files.signed;
    if (url) {
      console.log(`⏳ Baixando PDF assinado do Autentique e enviando pro Cloudinary (${c.id})...`);
      const signedPdfBuffer = await autentique.downloadFile(url);
      
      const cloudinaryUrl = await uploadPdfBuffer(signedPdfBuffer, c.id + "_assinado");
      
      c.status = "EMITIDO"; 
      c.issuedAt = now(); 
      c.pdfUrl = cloudinaryUrl; 
      c.updatedAt = now();
      
      await log(c.id, "EMITIDO", "Sistema", "Certificado final emitido (PDF no Cloudinary)");
      await certRef.update(c);
      console.log(`✅ Certificado ${c.id} emitido com sucesso!`);
    }

    return { found: true, status: c.status, signed: true };
  } finally { 
    syncLock.delete(c.id); 
  }
}

/* ---------------- App Express ---------------- */
const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => { 
  res.setHeader("X-Content-Type-Options", "nosniff"); 
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin"); 
  next(); 
});

if (FRONTEND_ORIGIN) app.use(cors({ origin: FRONTEND_ORIGIN.split(",").map(s => s.trim()) }));

/* ---------------- Webhooks ---------------- */
app.post("/api/webhooks/autentique", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
  if (!AUTENTIQUE_WEBHOOK_SECRET) return res.status(503).json({ error: "Webhook Secret não configurado." });

  const given = String(req.headers["x-autentique-signature"] || "");
  const expected = crypto.createHmac("sha256", AUTENTIQUE_WEBHOOK_SECRET).update(req.body).digest("hex");
  
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Assinatura inválida." });

  res.json({ received: true });

  let payload = {}; 
  try { payload = JSON.parse(req.body.toString("utf8")); } catch { return; }
  
  const o = (payload.event && payload.event.data && payload.event.data.object) || (payload.data && payload.data.object) || payload.object || {};
  const docId = (o.document && (o.document.id || o.document)) || o.document_id || payload.documentId || o.id || null;

  if (docId) syncFromAutentique(docId).catch(e => console.error("[webhook] sync falhou:", e.message));
});

app.post("/api/internal/signature-events", express.json(), async (req, res, next) => {
  try {
    const t = String(req.headers["x-internal-token"] || "");
    if (!INTERNAL_WEBHOOK_TOKEN || t.length !== INTERNAL_WEBHOOK_TOKEN.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(INTERNAL_WEBHOOK_TOKEN))) 
      return res.status(401).json({ error: "Token interno inválido." });

    const { documentId } = req.body || {};
    if (!documentId) return res.status(400).json({ error: "documentId obrigatório." });
    res.json(await syncFromAutentique(documentId));
  } catch (e) { next(e); }
});

app.use(express.json({ limit: "1mb" }));

/* ---------------- Auth Middlewares ---------------- */
const attempts = new Map();

app.post("/api/auth/login", async (req, res) => {
  const ip = req.ip, rec = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - rec.t > 60000) { rec.n = 0; rec.t = Date.now(); }
  if (rec.n >= 8) return res.status(429).json({ error: "Muitas tentativas. Aguarde 1 minuto." });

  const { email, password } = req.body || {};
  const emailLower = String(email || "").trim().toLowerCase();

  const snap = await db.collection('users').where('email', '==', emailLower).limit(1).get();
  if (snap.empty) { rec.n++; attempts.set(ip, rec); return res.status(401).json({ error: "E-mail ou senha inválidos." }); }
  
  const u = snap.docs[0].data();
  if (!bcrypt.compareSync(String(password || ""), u.passwordHash)) { rec.n++; attempts.set(ip, rec); return res.status(401).json({ error: "E-mail ou senha inválidos." }); }

  const token = jwt.sign({ sub: u.id, role: u.role }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  try {
    const p = jwt.verify(h.startsWith("Bearer ") ? h.slice(7) : "", JWT_SECRET);
    db.collection('users').doc(p.sub).get().then(doc => {
      if (!doc.exists) return res.status(401).json({ error: "Sessão inválida." });
      req.user = doc.data();
      next();
    }).catch(() => res.status(500).json({ error: "Erro ao verificar usuário." }));
  } catch { res.status(401).json({ error: "Sessão inválida ou expirada." }); }
}

const role = r => (req, res, next) => (req.user.role === r ? next() : res.status(403).json({ error: "Sem permissão." }));

app.get("/api/auth/me", auth, (req, res) => res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role } }));

/* ---------------- Auxiliares ---------------- */
app.get("/api/properties", auth, async (req, res) => {
  const snap = await db.collection('properties').get();
  res.json(snap.docs.map(d => d.data()));
});

app.post("/api/properties", auth, async (req, res) => {
  const name = String((req.body || {}).name || "").trim();
  if (name.length < 2) return res.status(400).json({ error: "Nome inválido." });
  const id = "p" + Date.now().toString(36);
  const p = { id, name };
  await db.collection('properties').doc(id).set(p);
  res.status(201).json(p);
});

app.get("/api/equipment", auth, (req, res) => res.json(cfg.EQUIPMENTS));

app.get("/api/stats", auth, async (req, res) => {
  const snap = await db.collection('certificates').get();
  const certs = snap.docs.map(d => d.data());
  res.json({
    pending: certs.filter(x => PENDING.includes(x.status)).length,
    signed: certs.filter(x => SIGNED.includes(x.status)).length,
    total: certs.length
  });
});

app.get("/api/history", auth, async (req, res) => {
  const snap = await db.collection('history').orderBy('at', 'desc').limit(100).get();
  res.json(snap.docs.map(d => d.data()));
});

/* ---------------- Treinamentos e Certificados ---------------- */
app.post("/api/trainings", auth, role("TECNICO"), async (req, res, next) => {
  try {
    const { training = {}, trainees = [] } = req.body || {};
    const propertyName = String(training.propertyName || "").trim();
    const propertyDoc = String(training.propertyDoc || "").trim();
    const eq = String(training.equipment || "").trim(), hours = String(training.hours || "").trim();
    const customTitle = String(training.title || "").trim();
    
    // --- ALTERAÇÕES INÍCIO ---
    const propertyDocType = ["CPF", "CNPJ"].includes(training.propertyDocType) ? training.propertyDocType : null;
    const instructorName = String(training.instructorName || "").trim();
    
    if (!propertyName || !propertyDoc || !propertyDocType || !cfg.EQUIPMENTS.includes(eq) || !cfg.INSTRUCTORS.includes(instructorName) || !hours || !/^\d{4}-\d{2}-\d{2}$/.test(training.date || "") || !["Online", "Presencial"].includes(training.format)) 
      return res.status(400).json({ error: "Dados do treinamento incompletos ou inválidos." });
    
    if (digits(propertyDoc).length !== (propertyDocType === "CPF" ? 11 : 14))
      return res.status(400).json({ error: `${propertyDocType} da propriedade inválido.` });
    // --- ALTERAÇÕES FIM ---

    if (!Array.isArray(trainees) || !trainees.length || trainees.length > 500) 
      return res.status(400).json({ error: "Informe de 1 a 500 treinados." });
    
    for (const t of trainees) 
      if (String(t.name || "").trim().length < 3 || digits(t.cpf).length !== 11) 
        return res.status(400).json({ error: `Treinado inválido: ${t.name || "(sem nome)"}.` });

    const numTrainings = await getNextId('training');
    const trainingId = "TRN-" + String(numTrainings).padStart(4, "0");
    const created = [], skipped = [];
    
    for (const t of trainees) {
      const dedupKey = [digits(t.cpf), propertyKey(propertyName, propertyDoc), eq.toLowerCase(), training.date].join("|");
      const dupSnap = await db.collection('certificates').where('dedupKey', '==', dedupKey).limit(1).get();
      
      if (!dupSnap.empty) { 
        skipped.push({ name: t.name, existing: dupSnap.docs[0].data().id }); 
        continue; 
      }
      
      const numCert = await getNextId('cert');
      const id = "CERT-" + String(numCert).padStart(6, "0");
      
      // Objeto C alterado
      const c = {
        id, trainingId, propertyName, propertyDoc, propertyDocType, instructorName,
        equipment: eq, traineeName: t.name.trim(), traineeCpf: t.cpf, date: training.date, format: training.format, hours,
        trainingTitle: customTitle || cfg.TRAINING_TITLE, technicianId: req.user.id, technicianName: req.user.name,
        dedupKey, status: "AGUARDANDO_ASSINATURA",
        autentiqueDocId: null, autentiqueSignerId: null, signerUserId: null, signedAt: null, issuedAt: null, signedBy: null, pdfUrl: null,
        createdAt: now(), updatedAt: now()
      };
      
      await db.collection('certificates').doc(id).set(c);
      created.push(c);
      await log(id, "ENVIADO_AO_COORDENADOR", req.user.name, "Certificado criado e enviado para assinatura");
    }
    
    res.status(201).json({ trainingId, created, skipped });
  } catch(e) { next(e); }
});

app.get("/api/certificates", auth, async (req, res) => {
  const snap = await db.collection('certificates').get();
  let list = snap.docs.map(d => d.data()).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  if (req.query.group) list = list.filter(c => groupOf(c.status) === req.query.group);
  res.json(list);
});

app.get("/api/certificates/:id", auth, async (req, res, next) => {
  try {
    const snap = await db.collection('certificates').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Certificado não encontrado." });
    const c = snap.data();

    if (c.autentiqueDocId && ["ASSINATURA_EM_ANDAMENTO", "ASSINADO"].includes(c.status) && Date.now() - (lastSync.get(c.id) || 0) > 8000) {
      lastSync.set(c.id, Date.now());
      try { await syncFromAutentique(c.autentiqueDocId); } catch (e) { console.warn("[sync] " + c.id + ": " + e.message); }
    }

    const updatedSnap = await db.collection('certificates').doc(req.params.id).get();
    res.json(updatedSnap.data());
  } catch (e) { next(e); }
});

app.patch("/api/certificates/:id", auth, role("TECNICO"), async (req, res) => {
  const certRef = db.collection('certificates').doc(req.params.id);
  const snap = await certRef.get();
  if (!snap.exists) return res.status(404).json({ error: "Certificado não encontrado." });
  
  const c = snap.data();
  if (!EDITABLE.includes(c.status)) return res.status(409).json({ error: "Não pode mais ser alterado." });

  const p = req.body || {};
  if (p.traineeName !== undefined) { if (String(p.traineeName).trim().length < 3) return res.status(400).json({ error: "Nome inválido." }); c.traineeName = p.traineeName.trim(); }
  if (p.traineeCpf !== undefined) { if (digits(p.traineeCpf).length !== 11) return res.status(400).json({ error: "CPF inválido." }); c.traineeCpf = p.traineeCpf; }
  if (p.hours !== undefined) c.hours = String(p.hours).trim();
  if (p.date !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return res.status(400).json({ error: "Data inválida." }); c.date = p.date; }
  if (p.format !== undefined) { if (!["Online", "Presencial"].includes(p.format)) return res.status(400).json({ error: "Formato inválido." }); c.format = p.format; }
  
  // --- ALTERAÇÕES AQUI ---
  if (p.instructorName !== undefined) { 
    if (!cfg.INSTRUCTORS.includes(p.instructorName)) return res.status(400).json({ error: "Ministrante inválido." }); 
    c.instructorName = p.instructorName; 
  }
  
  if (p.equipment !== undefined) {
    const eq = String(p.equipment).trim();
    if (!cfg.EQUIPMENTS.includes(eq)) return res.status(400).json({ error: "Equipamento inválido." });
    c.equipment = eq;
  }
  // --- FIM DAS ALTERAÇÕES ---
  
  c.dedupKey = [digits(c.traineeCpf), propertyKey(c.propertyName, c.propertyDoc), c.equipment.toLowerCase(), c.date].join("|");
  c.updatedAt = now(); 
  
  await certRef.update(c);
  await log(c.id, "EDITADO", req.user.name, "Dados alterados antes da assinatura");
  res.json(c);
});

const signingLock = new Set();
app.post("/api/certificates/:id/sign", auth, role("COORDENADOR"), async (req, res, next) => {
  const certRef = db.collection('certificates').doc(req.params.id);
  const snap = await certRef.get();
  
  if (!snap.exists) return res.status(404).json({ error: "Certificado não encontrado." });
  const c = snap.data();
  
  if (SIGNED.includes(c.status)) return res.status(409).json({ error: "Este certificado já foi assinado." });
  if (c.signerUserId && c.signerUserId !== req.user.id) return res.status(403).json({ error: "Aguardando outro Coordenador." });
  if (signingLock.has(c.id)) return res.status(409).json({ error: "Assinatura em preparação. Tente novamente." });
  
  signingLock.add(c.id);
  try {
    if (!c.autentiqueDocId) { 
      const pdfBuffer = await buildCertificatePdf(c, { signerName: req.user.name });
      
const signerEmail = (process.env.AUTENTIQUE_SIGNER_EMAIL || req.user.email).trim().toLowerCase();

const d = await autentique.createDocument({ 
  name: `Certificado iCelera - ${c.traineeName} (${c.id})`, 
  pdf: pdfBuffer, 
  filename: c.id + ".pdf", 
  signerEmail
});

const sig = (d.signatures || []).find(s => String(s.email).toLowerCase() === signerEmail) || (d.signatures || [])[0];
      if (!sig) throw new Error("Autentique não retornou o signatário.");

      c.autentiqueDocId = d.id; 
      c.autentiqueSignerId = sig.public_id; 
      c.signerUserId = req.user.id;
      c.status = "ASSINATURA_EM_ANDAMENTO"; 
      c.updatedAt = now();
      
      await certRef.update(c);
      await log(c.id, "ASSINATURA_INICIADA", req.user.name, "Documento criado no Autentique (" + d.id + ")");
    }

    const signUrl = await autentique.createSignatureLink(c.autentiqueSignerId);
    res.json({ mode: "iframe", signUrl, documentId: c.autentiqueDocId });
  } catch (e) { next(e); } finally { signingLock.delete(c.id); }
});

app.get("/api/certificates/:id/pdf", auth, async (req, res, next) => {
  try {
    const ref = db.collection('certificates').doc(req.params.id);
    let snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Certificado não encontrado." });
    let c = snap.data();

    if (!SIGNED.includes(c.status)) return res.status(409).json({ error: "O certificado ainda não foi assinado." });

    // Tenta concluir a emissão se o PDF final ainda não foi salvo
    if (!c.pdfUrl && c.autentiqueDocId) {
      try { await syncFromAutentique(c.autentiqueDocId); } catch (e) { console.warn("[pdf-sync] " + e.message); }
      snap = await ref.get(); c = snap.data();
    }

    let buf = null;
    if (c.pdfUrl) {
      try { buf = await autentique.downloadFile(c.pdfUrl); } catch (e) { console.warn("[pdf-cloudinary] " + e.message); }
    }
    if (!buf && c.autentiqueDocId) {
      const d = await autentique.getDocument(c.autentiqueDocId);
      const url = d.files && d.files.signed;
      if (url) buf = await autentique.downloadFile(url);
    }
    if (!buf) return res.status(409).json({ error: "O PDF assinado ainda está sendo processado. Tente novamente em instantes." });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${c.id}.pdf"`);
    res.send(buf);
  } catch (e) { next(e); }
});

app.delete("/api/certificates/:id", auth, role("TECNICO"), async (req, res, next) => {
  try {
    const ref = db.collection('certificates').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Certificado não encontrado." });
    const c = snap.data();
    if (!EDITABLE.includes(c.status)) return res.status(409).json({ error: "Certificado em assinatura ou já assinado não pode ser removido." });
    await ref.delete();
    await log(c.id, "REMOVIDO", req.user.name, "Certificado removido antes da assinatura");
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.patch("/api/properties-bulk", auth, role("TECNICO"), async (req, res, next) => {
  try {
    const { oldName, oldDoc, name, doc } = req.body || {};
    const newName = String(name || "").trim(), newDoc = String(doc || "").trim();
    if (newName.length < 2 || !newDoc) return res.status(400).json({ error: "Nome e CPF/CNPJ são obrigatórios." });
    const snap = await db.collection('certificates').where('propertyName', '==', oldName).get();
    const list = snap.docs.filter(d => digits(d.data().propertyDoc) === digits(oldDoc));
    if (list.some(d => !EDITABLE.includes(d.data().status)))
      return res.status(409).json({ error: "Há certificados em assinatura ou assinados nesta propriedade. Só é possível editar quando todos estão aguardando." });
    for (const d of list) {
      const c = d.data();
      const dedupKey = [digits(c.traineeCpf), propertyKey(newName, newDoc), String(c.equipment).toLowerCase(), c.date].join("|");
      await d.ref.update({ propertyName: newName, propertyDoc: newDoc, dedupKey, updatedAt: now() });
      await log(c.id, "EDITADO", req.user.name, "Propriedade alterada");
    }
    res.json({ updated: list.length });
  } catch (e) { next(e); }
});

app.delete("/api/properties-bulk", auth, role("TECNICO"), async (req, res, next) => {
  try {
    const { name, doc } = req.body || {};
    const snap = await db.collection('certificates').where('propertyName', '==', name).get();
    const list = snap.docs.filter(d => digits(d.data().propertyDoc) === digits(doc));
    if (list.some(d => !EDITABLE.includes(d.data().status)))
      return res.status(409).json({ error: "Há certificados em assinatura ou assinados nesta propriedade. Não é possível remover." });
    for (const d of list) { await log(d.data().id, "REMOVIDO", req.user.name, "Removido junto com a propriedade"); await d.ref.delete(); }
    res.json({ removed: list.length });
  } catch (e) { next(e); }
});

/* ---------------- Frontend estático ---------------- */
const ROOT = path.join(__dirname, "..");
["css", "js", "assets"].forEach(d => app.use("/" + d, express.static(path.join(ROOT, d))));

app.get("/", (req, res) => {
  res.setHeader("Content-Security-Policy", "frame-src 'self' https://*.autentique.com.br https://assina.ae;");
  res.sendFile(path.join(ROOT, "index.html"));
});

app.use("/api", (req, res) => res.status(404).json({ error: "Rota não encontrada." }));

app.use((err, req, res, next) => {
  console.error("[erro]", err.message);
  if (err.code === "NOT_CONFIGURED") return res.status(503).json({ error: "Integração com Autentique não configurada." });
  if (err.code === "AUTENTIQUE_ERROR") return res.status(502).json({ error: "Falha ao comunicar com o Autentique." });
  res.status(500).json({ error: "Erro interno do servidor." });
});

app.listen(PORT, () => console.log(`✅ iCelera backend em http://localhost:${PORT}  (sandbox Autentique: ${process.env.AUTENTIQUE_SANDBOX !== "false"})`));
module.exports = app;