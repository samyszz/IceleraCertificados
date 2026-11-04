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
const QUIZ_DEFAULTS = require("../js/quiz-defaults");

const { PORT = 3000, JWT_SECRET, FRONTEND_ORIGIN, AUTENTIQUE_WEBHOOK_SECRET, INTERNAL_WEBHOOK_TOKEN } = process.env;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("❌ Defina JWT_SECRET (mínimo 32 caracteres) em backend/.env");
  process.exit(1);
}

/* Estados internos */
const PENDING = ["AGUARDANDO_QUESTIONARIO", "RASCUNHO", "AGUARDANDO_ASSINATURA", "ASSINATURA_EM_ANDAMENTO"];
const SIGNED = ["ASSINADO", "EMITIDO"];
const EDITABLE = ["AGUARDANDO_QUESTIONARIO", "RASCUNHO", "AGUARDANDO_ASSINATURA"];

/* Quem assina automaticamente (Alison). Aceita os dois nomes de variável. */
// Remove espaços e aspas que às vezes vêm junto quando o valor é colado na Vercel.
const cleanEnv = v => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
const signerEmailCfg = () => cleanEnv(process.env.AUTENTIQUE_SIGNER_EMAIL || process.env.SIGNER_EMAIL).toLowerCase();
const signerNameCfg = () => cleanEnv(process.env.AUTENTIQUE_SIGNER_NAME || process.env.SIGNER_NAME);

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
      let coord = null;
      if (c.signerUserId && c.signerUserId !== "auto") {
        const userSnap = await db.collection('users').doc(c.signerUserId).get();
        coord = userSnap.exists ? userSnap.data() : null;
      } else if (signerNameCfg()) coord = { name: signerNameCfg() };

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
        dedupKey, status: "AGUARDANDO_QUESTIONARIO",
        quizAttempts: 0, quizLastPercent: null, quizBestPercent: null, quizPassedAt: null,
        autentiqueDocId: null, autentiqueSignerId: null, signerUserId: null, signedAt: null, issuedAt: null, signedBy: null, pdfUrl: null,
        createdAt: now(), updatedAt: now()
      };
      
      await db.collection('certificates').doc(id).set(c);
      created.push(c);
      await log(id, "CRIADO", req.user.name, "Certificado criado. Aguardando o treinado responder o questionário");
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

/**
 * Se o documento já criado no Autentique tem OUTRO signatário (ex.: e-mail trocado na Vercel
 * depois que o documento foi criado), descarta esse documento para que um novo seja criado
 * com o signatário certo. Documento já assinado nunca é descartado.
 */
async function discardDocIfWrongSigner(c, signerEmail) {
  if (!c.autentiqueDocId || !signerEmail) return c;
  let doc;
  try { doc = await autentique.getDocument(c.autentiqueDocId); } catch (e) { console.warn("[signer-check] " + e.message); return c; }
  const sigs = (doc && doc.signatures) || [];
  const sig = sigs.find(x => x.public_id === c.autentiqueSignerId) || sigs[0];
  if (!sig || sig.signed || String(sig.email || "").toLowerCase() === signerEmail) return c;
  const upd = { autentiqueDocId: null, autentiqueSignerId: null, signerUserId: null, status: "AGUARDANDO_ASSINATURA", autoIssueError: null, updatedAt: now() };
  await db.collection('certificates').doc(c.id).update(upd);
  await log(c.id, "DOCUMENTO_REFEITO", "Sistema", `Documento ${c.autentiqueDocId} tinha o signatário ${sig.email}; será criado outro para ${signerEmail}`);
  return { ...c, ...upd };
}

const signingLock = new Set();
app.post("/api/certificates/:id/sign", auth, role("COORDENADOR"), async (req, res, next) => {
  const certRef = db.collection('certificates').doc(req.params.id);
  const snap = await certRef.get();
  
  if (!snap.exists) return res.status(404).json({ error: "Certificado não encontrado." });
  let c = snap.data();
  
  if (SIGNED.includes(c.status)) return res.status(409).json({ error: "Este certificado já foi assinado." });
  if (c.status === "AGUARDANDO_QUESTIONARIO") return res.status(409).json({ error: "O treinado ainda não foi aprovado no questionário." });
  if (c.signerUserId && c.signerUserId !== "auto" && c.signerUserId !== req.user.id) return res.status(403).json({ error: "Aguardando outro Coordenador." });
  if (signingLock.has(c.id)) return res.status(409).json({ error: "Assinatura em preparação. Tente novamente." });
  
  signingLock.add(c.id);
  try {
    c = await discardDocIfWrongSigner(c, signerEmailCfg() || req.user.email.trim().toLowerCase());
    if (!c.autentiqueDocId) { 
      const pdfBuffer = await buildCertificatePdf(c, { signerName: req.user.name });
      
const signerEmail = signerEmailCfg() || req.user.email.trim().toLowerCase();

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
    const snap = await db.collection('certificates').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: "Certificado não encontrado." });
    await sendCertificatePdf(snap.data(), res);
  } catch (e) { next(e); }
});

async function sendCertificatePdf(c, res) {
    const ref = db.collection('certificates').doc(c.id);
    let snap;

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
}

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
    const links = await db.collection('quizLinks').where('propertyKey', '==', propertyKey(oldName, oldDoc)).get();
    for (const l of links.docs) await l.ref.update({ propertyName: newName, propertyDoc: newDoc, propertyKey: propertyKey(newName, newDoc) });
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

/* ================================================================== */
/* Questionário de aprovação + emissão automática                     */
/* ================================================================== */
/*
 * Fluxo:
 *  1. Técnico cadastra o treinamento → certificados nascem em AGUARDANDO_QUESTIONARIO.
 *  2. Técnico gera 1 link público por instituição (quizLinks/{token}).
 *  3. O treinado abre o link, escolhe o próprio nome e responde o questionário
 *     do equipamento dele. A correção é feita AQUI (o navegador nunca recebe o gabarito).
 *  4. Aprovado → AGUARDANDO_ASSINATURA → autoIssue(): cria o documento no Autentique
 *     com o Alison como signatário e chama signDocument (token da conta dele).
 *  5. Se a emissão automática falhar, o certificado fica aguardando assinatura e o
 *     Coordenador pode assinar pelo fluxo manual de sempre.
 */
const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const PASSED_STATES = ["AGUARDANDO_ASSINATURA", "ASSINATURA_EM_ANDAMENTO", "ASSINADO", "EMITIDO"];

function defaultQuiz(equipment) {
  const qs = (QUIZ_DEFAULTS.byEquipment[equipment] || []).map((q, i) => ({ id: "q" + (i + 1), ...q }));
  return { equipment, passPercent: QUIZ_DEFAULTS.passPercent, maxAttempts: QUIZ_DEFAULTS.maxAttempts, questions: qs, custom: false, updatedAt: null, updatedBy: null };
}

async function getQuiz(equipment) {
  const snap = await db.collection('quizzes').doc(slug(equipment)).get();
  return snap.exists ? { ...defaultQuiz(equipment), ...snap.data(), custom: true } : defaultQuiz(equipment);
}

/** Em que ponto do questionário o treinado está. */
function quizState(c, quiz) {
  if (c.quizPassedAt || PASSED_STATES.includes(c.status)) return "APROVADO";
  if (quiz.maxAttempts > 0 && (c.quizAttempts || 0) >= quiz.maxAttempts) return "BLOQUEADO";
  return "PENDENTE";
}

/* ---- Emissão automática ---- */
const issueLock = new Set();
async function autoIssue(certId) {
  if (issueLock.has(certId)) return;
  issueLock.add(certId);
  const ref = db.collection('certificates').doc(certId);
  try {
    let c = (await ref.get()).data();
    if (!c || SIGNED.includes(c.status)) return;

    // Documento já existe (nova tentativa): confere o signatário e vê se já foi assinado.
    if (c.autentiqueDocId) c = await discardDocIfWrongSigner(c, signerEmailCfg());
    if (c.autentiqueDocId) {
      const r = await syncFromAutentique(c.autentiqueDocId);
      if (r.signed) return;
    } else {
      const signerEmail = signerEmailCfg();
      if (!signerEmail) throw Object.assign(new Error("AUTENTIQUE_SIGNER_EMAIL não configurado."), { code: "NOT_CONFIGURED" });

      const pdfBuffer = await buildCertificatePdf(c);
      const d = await autentique.createDocument({
        name: `Certificado iCelera - ${c.traineeName} (${c.id})`,
        pdf: pdfBuffer, filename: c.id + ".pdf", signerEmail
      });
      const sig = (d.signatures || []).find(s => String(s.email).toLowerCase() === signerEmail) || (d.signatures || [])[0];
      if (!sig) throw new Error("Autentique não retornou o signatário.");

      c = { ...c, autentiqueDocId: d.id, autentiqueSignerId: sig.public_id, signerUserId: "auto", status: "ASSINATURA_EM_ANDAMENTO", autoIssueError: null, updatedAt: now() };
      await ref.update(c);
      await log(c.id, "ASSINATURA_INICIADA", "Sistema", "Documento criado no Autentique (" + d.id + ") para assinatura automática");
    }

    await autentique.signDocument(c.autentiqueDocId);
    if (c.autoIssueError) await ref.update({ autoIssueError: null, updatedAt: now() });
    await log(c.id, "ASSINATURA_AUTOMATICA", signerNameCfg() || "Sistema", "Assinado automaticamente via Autentique após aprovação no questionário");
    lastSync.set(c.id, Date.now());
    // O PDF assinado pode levar alguns segundos para ficar pronto; se não ficar agora,
    // a consulta de status (tela do treinado / do sistema) termina a emissão depois.
    try { await syncFromAutentique(c.autentiqueDocId); } catch (e) { console.warn("[auto-issue sync] " + e.message); }
  } catch (e) {
    console.error("[auto-issue] " + certId + ": " + e.message);
    await ref.update({ autoIssueError: e.message, updatedAt: now() }).catch(() => { });
    await log(certId, "EMISSAO_AUTOMATICA_FALHOU", "Sistema", "Falha na emissão automática (" + e.message + "). O Coordenador pode assinar manualmente.");
  } finally {
    issueLock.delete(certId);
  }
}

/* ---- Rate limit simples para as rotas públicas ---- */
const pubHits = new Map();
function publicLimit(req, res, next) {
  const ip = req.ip, t = Date.now(), r = pubHits.get(ip) || { n: 0, t };
  if (t - r.t > 60000) { r.n = 0; r.t = t; }
  r.n++; pubHits.set(ip, r);
  if (r.n > 120) return res.status(429).json({ error: "Muitas requisições. Aguarde um minuto." });
  next();
}

async function linkFromReq(req, res) {
  const token = String(req.params.token || "");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) { res.status(404).json({ error: "Link inválido." }); return null; }
  const snap = await db.collection('quizLinks').doc(token).get();
  if (!snap.exists || snap.data().disabled) { res.status(404).json({ error: "Link inválido ou desativado." }); return null; }
  return snap.data();
}

const belongs = (c, link) => propertyKey(c.propertyName, c.propertyDoc) === link.propertyKey;

async function certFromLink(req, res, link) {
  const snap = await db.collection('certificates').doc(String(req.params.certId || "")).get();
  if (!snap.exists || !belongs(snap.data(), link)) { res.status(404).json({ error: "Treinado não encontrado neste link." }); return null; }
  return snap.data();
}

// Assim que o Autentique confirma a assinatura o PDF já pode ser baixado
// (sendCertificatePdf busca direto no Autentique se o Cloudinary ainda não tiver a cópia).
const publicStatus = c => ({
  status: SIGNED.includes(c.status) ? "ASSINADO" : c.status,
  pdfReady: SIGNED.includes(c.status),
  issueFailed: !SIGNED.includes(c.status) && !!c.autoIssueError
});

/** Aprovado mas ainda não assinado: tenta (de novo) emitir e assinar, no máximo a cada 15 s. */
const lastRetry = new Map();
async function advanceIssue(c) {
  if (SIGNED.includes(c.status) || !c.quizPassedAt) return c;
  if (String(c.autoIssueError || "").includes("não configurado")) return c; // sem config, não adianta repetir
  if (Date.now() - (lastRetry.get(c.id) || 0) < 15000) return c;
  lastRetry.set(c.id, Date.now());
  await autoIssue(c.id);
  return (await db.collection('certificates').doc(c.id).get()).data();
}

/* ---- Rotas públicas (sem login) ---- */
app.get("/api/public/quiz/:token", publicLimit, async (req, res, next) => {
  try {
    const link = await linkFromReq(req, res); if (!link) return;
    const snap = await db.collection('certificates').where('propertyName', '==', link.propertyName).get();
    const certs = snap.docs.map(d => d.data()).filter(c => belongs(c, link) && (c.status === "AGUARDANDO_QUESTIONARIO" || c.quizPassedAt));
    const quizzes = {};
    for (const eq of new Set(certs.map(c => c.equipment))) quizzes[eq] = await getQuiz(eq);
    res.json({
      propertyName: link.propertyName,
      // Só o nome e o equipamento: CPF e demais dados não saem do sistema.
      trainees: certs
        .map(c => ({ id: c.id, name: c.traineeName, equipment: c.equipment, date: c.date, state: quizState(c, quizzes[c.equipment]) }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.equipment.localeCompare(b.equipment))
    });
  } catch (e) { next(e); }
});

app.get("/api/public/quiz/:token/:certId", publicLimit, async (req, res, next) => {
  try {
    const link = await linkFromReq(req, res); if (!link) return;
    const c = await certFromLink(req, res, link); if (!c) return;
    const quiz = await getQuiz(c.equipment);
    const state = quizState(c, quiz);
    const base = { id: c.id, name: c.traineeName, equipment: c.equipment, state, attemptsUsed: c.quizAttempts || 0, maxAttempts: quiz.maxAttempts, passPercent: quiz.passPercent, ...publicStatus(c) };
    if (state !== "PENDENTE") return res.json(base);
    if (!quiz.questions.length) return res.status(409).json({ error: "O questionário deste equipamento ainda não foi cadastrado. Fale com o técnico." });
    // Gabarito NUNCA vai para o navegador.
    res.json({ ...base, questions: quiz.questions.map(q => ({ id: q.id, text: q.text, options: q.options })) });
  } catch (e) { next(e); }
});

app.post("/api/public/quiz/:token/:certId", publicLimit, async (req, res, next) => {
  try {
    const link = await linkFromReq(req, res); if (!link) return;
    const c0 = await certFromLink(req, res, link); if (!c0) return;
    const quiz = await getQuiz(c0.equipment);
    const answers = (req.body && req.body.answers) || {};

    if (!quiz.questions.length) return res.status(409).json({ error: "Questionário não cadastrado." });
    if (quiz.questions.some(q => !Number.isInteger(answers[q.id]) || answers[q.id] < 0 || answers[q.id] >= q.options.length))
      return res.status(400).json({ error: "Responda todas as perguntas antes de enviar." });

    const correct = quiz.questions.filter(q => answers[q.id] === q.correct).length;
    const total = quiz.questions.length;
    const percent = Math.round((correct / total) * 100);
    const passed = percent >= quiz.passPercent;

    // Transação: evita duas aprovações / tentativas extras com cliques simultâneos.
    const ref = db.collection('certificates').doc(c0.id);
    const out = await db.runTransaction(async t => {
      const c = (await t.get(ref)).data();
      if (!c || c.status !== "AGUARDANDO_QUESTIONARIO") return { error: "Este questionário já foi respondido e aprovado.", code: 409 };
      if (quizState(c, quiz) === "BLOQUEADO") return { error: "Você atingiu o limite de tentativas. Fale com o técnico que ministrou o treinamento.", code: 409 };
      const attempts = (c.quizAttempts || 0) + 1;
      const upd = {
        quizAttempts: attempts, quizLastPercent: percent,
        quizBestPercent: Math.max(c.quizBestPercent || 0, percent), updatedAt: now()
      };
      if (passed) Object.assign(upd, { status: "AGUARDANDO_ASSINATURA", quizPassedAt: now() });
      t.update(ref, upd);
      return { attempts };
    });
    if (out.error) return res.status(out.code).json({ error: out.error });

    await db.collection('quizAttempts').add({
      id: crypto.randomUUID(), at: now(), certificateId: c0.id, equipment: c0.equipment,
      answers, correct, total, percent, passed, ip: req.ip
    });
    await log(c0.id, passed ? "QUESTIONARIO_APROVADO" : "QUESTIONARIO_REPROVADO", c0.traineeName,
      `Acertou ${correct} de ${total} (${percent}%) · tentativa ${out.attempts}${quiz.maxAttempts ? " de " + quiz.maxAttempts : ""}`);

    if (passed) { lastRetry.set(c0.id, Date.now()); await autoIssue(c0.id); }

    const c = (await ref.get()).data();
    res.json({
      passed, correct, total, percent, passPercent: quiz.passPercent,
      attemptsUsed: out.attempts, maxAttempts: quiz.maxAttempts,
      state: quizState(c, quiz), ...publicStatus(c)
    });
  } catch (e) { next(e); }
});

/** Consulta de status (a tela do treinado chama em intervalo até o PDF ficar pronto). */
app.get("/api/public/quiz/:token/:certId/status", publicLimit, async (req, res, next) => {
  try {
    const link = await linkFromReq(req, res); if (!link) return;
    let c = await certFromLink(req, res, link); if (!c) return;
    if (c.autentiqueDocId && !SIGNED.includes(c.status) && Date.now() - (lastSync.get(c.id) || 0) > 4000) {
      lastSync.set(c.id, Date.now());
      try { await syncFromAutentique(c.autentiqueDocId); } catch (e) { console.warn("[public sync] " + e.message); }
      c = (await db.collection('certificates').doc(c.id).get()).data();
    }
    // Se a assinatura automática falhou ou não chegou a rodar, tenta de novo.
    c = await advanceIssue(c);
    res.json(publicStatus(c));
  } catch (e) { next(e); }
});

app.get("/api/public/quiz/:token/:certId/pdf", publicLimit, async (req, res, next) => {
  try {
    const link = await linkFromReq(req, res); if (!link) return;
    const c = await certFromLink(req, res, link); if (!c) return;
    await sendCertificatePdf(c, res);
  } catch (e) { next(e); }
});

/* ---- Rotas internas (com login) ---- */

/** Gera (ou devolve o já existente) link do questionário de uma instituição. */
app.post("/api/quiz-links", auth, async (req, res, next) => {
  try {
    const name = String((req.body || {}).propertyName || "").trim();
    const doc = String((req.body || {}).propertyDoc || "").trim();
    if (!name) return res.status(400).json({ error: "Informe a instituição." });
    const key = propertyKey(name, doc);
    const found = await db.collection('quizLinks').where('propertyKey', '==', key).limit(1).get();
    if (!found.empty) return res.json(found.docs[0].data());
    const link = { token: crypto.randomBytes(18).toString("base64url"), propertyKey: key, propertyName: name, propertyDoc: doc, createdAt: now(), createdBy: req.user.name, disabled: false };
    await db.collection('quizLinks').doc(link.token).set(link);
    res.status(201).json(link);
  } catch (e) { next(e); }
});

app.get("/api/quizzes", auth, async (req, res, next) => {
  try { res.json(await Promise.all(cfg.EQUIPMENTS.map(getQuiz))); } catch (e) { next(e); }
});

app.put("/api/quizzes/:equipment", auth, async (req, res, next) => {
  try {
    const equipment = String(req.params.equipment);
    if (!cfg.EQUIPMENTS.includes(equipment)) return res.status(400).json({ error: "Equipamento inválido." });
    const b = req.body || {};
    const passPercent = Number(b.passPercent), maxAttempts = Number(b.maxAttempts);
    if (!Number.isInteger(passPercent) || passPercent < 1 || passPercent > 100) return res.status(400).json({ error: "Nota mínima deve ser de 1 a 100%." });
    if (!Number.isInteger(maxAttempts) || maxAttempts < 0 || maxAttempts > 20) return res.status(400).json({ error: "Tentativas deve ser de 0 (ilimitado) a 20." });
    if (!Array.isArray(b.questions) || !b.questions.length || b.questions.length > 50) return res.status(400).json({ error: "Cadastre de 1 a 50 perguntas." });

    const used = new Set();
    const questions = [];
    for (const [i, q] of b.questions.entries()) {
      const text = String(q.text || "").trim();
      const options = Array.isArray(q.options) ? q.options.map(o => String(o || "").trim()) : [];
      const n = i + 1;
      if (text.length < 3) return res.status(400).json({ error: `Pergunta ${n}: escreva o enunciado.` });
      if (options.length < 2 || options.length > 6 || options.some(o => !o)) return res.status(400).json({ error: `Pergunta ${n}: use de 2 a 6 alternativas, todas preenchidas.` });
      if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= options.length) return res.status(400).json({ error: `Pergunta ${n}: marque a alternativa correta.` });
      let id = /^q[\w-]{1,40}$/.test(q.id || "") && !used.has(q.id) ? q.id : "q" + crypto.randomBytes(4).toString("hex");
      used.add(id);
      questions.push({ id, text, options, correct: q.correct });
    }
    const quiz = { equipment, passPercent, maxAttempts, questions, updatedAt: now(), updatedBy: req.user.name };
    await db.collection('quizzes').doc(slug(equipment)).set(quiz);
    res.json({ ...quiz, custom: true });
  } catch (e) { next(e); }
});

/** Libera novas tentativas para quem esgotou o limite. */
app.post("/api/certificates/:id/reset-quiz", auth, role("TECNICO"), async (req, res, next) => {
  try {
    const ref = db.collection('certificates').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Certificado não encontrado." });
    const c = snap.data();
    if (c.status !== "AGUARDANDO_QUESTIONARIO") return res.status(409).json({ error: "Este treinado não está aguardando o questionário." });
    await ref.update({ quizAttempts: 0, updatedAt: now() });
    await log(c.id, "TENTATIVAS_LIBERADAS", req.user.name, "Tentativas do questionário liberadas novamente");
    res.json({ ...c, quizAttempts: 0 });
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
  if (err.code === "AUTENTIQUE_ERROR") return res.status(502).json({ error: "Falha ao comunicar com o Autentique: " + err.message.replace(/^Autentique:\s*/, "") });
  res.status(500).json({ error: "Erro interno do servidor." });
});

app.listen(PORT, () => console.log(`✅ iCelera backend em http://localhost:${PORT}  (sandbox Autentique: ${process.env.AUTENTIQUE_SANDBOX !== "false"})`));
module.exports = app;
