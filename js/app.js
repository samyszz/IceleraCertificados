/**
 * Camada de API do frontend.
 * Duas implementações com a MESMA interface:
 *   - Mock: simula backend + Autentique + webhook no navegador (demonstração).
 *   - Http: conversa com o backend real (backend/server.js).
 */
(function () {
  const CFG = window.ICELERA_CONFIG;
  const DB_KEY = "icelera.db.v1";
  const SESSION_KEY = "icelera.session.v1";
  const TOKEN_KEY = "icelera.token.v1";

  const PENDING = ["AGUARDANDO_QUESTIONARIO", "RASCUNHO", "AGUARDANDO_ASSINATURA", "ASSINATURA_EM_ANDAMENTO"];
  const SIGNED = ["ASSINADO", "EMITIDO"];
  const EDITABLE = ["AGUARDANDO_QUESTIONARIO", "RASCUNHO", "AGUARDANDO_ASSINATURA"];
  const PASSED = ["AGUARDANDO_ASSINATURA", "ASSINATURA_EM_ANDAMENTO", "ASSINADO", "EMITIDO"];
  const QD = window.ICELERA_QUIZ_DEFAULTS || { passPercent: 70, maxAttempts: 3, byEquipment: {} };

  class ApiError extends Error {
    constructor(message, code) { super(message); this.code = code || "ERROR"; }
  }

  const delay = (ms = 120) => new Promise(r => setTimeout(r, ms));
  const digits = s => String(s || "").replace(/\D/g, "");
  const nowIso = () => new Date().toISOString();
  const groupOf = s => (SIGNED.includes(s) ? "assinados" : "aguardando");
  const propertyKey = (name, doc) => [String(name || "").trim().toLowerCase(), digits(doc)].join("|");

  /* ------------------------------------------------------------------ */
  /* MOCK                                                               */
  /* ------------------------------------------------------------------ */
  function seed() {
    const users = [
      { id: "u1", name: "Guilherme Souza", email: "tecnico@icelera.com.br", role: "TECNICO", password: "demo123" },
      { id: "u2", name: "José Alison S. de Freitas", email: "coordenador@icelera.com.br", role: "COORDENADOR", password: "demo123" }
    ];
    const db = { users, properties: [], certificates: [], history: [], seq: 0, trainingSeq: 0 };
    const mk = (propertyName, propertyDoc, name, cpf, date, status, trnId, hours) => {
      db.seq++;
      const id = "CERT-" + String(db.seq).padStart(6, "0");
      const signed = SIGNED.includes(status);
      const c = {
        id, trainingId: trnId, propertyName, propertyDoc,
        equipment: "Apneia Care T3", traineeName: name, traineeCpf: cpf,
        date, format: "Online", hours: hours || "1 a 2 horas",
        trainingTitle: CFG.TRAINING_TITLE,
        technicianId: "u1", technicianName: "Guilherme Souza",
        status, autentiqueDocId: signed ? "mock-doc-" + id.toLowerCase() : null,
        signedAt: signed ? "2026-10-02T14:20:00.000Z" : null,
        issuedAt: signed ? "2026-10-02T14:20:05.000Z" : null,
        signedBy: signed ? "José Alison S. de Freitas" : null,
        pdfUrl: null, createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z"
      };
      db.certificates.push(c);
      db.history.push({ id: "h" + db.history.length, at: c.createdAt, certificateId: id, action: "ENVIADO_AO_COORDENADOR", by: "Guilherme Souza", detail: "Certificado enviado para assinatura" });
      if (signed) db.history.push({ id: "h" + db.history.length, at: c.issuedAt, certificateId: id, action: "EMITIDO", by: "José Alison S. de Freitas", detail: "Assinatura confirmada e certificado emitido" });
    };
    db.trainingSeq = 3;
    mk("Air Liquide Brasil Ltda.", "12.345.678/0001-90", "Francélce Martins", "059.590.409-21", "2026-09-30", "AGUARDANDO_ASSINATURA", "TRN-0001");
    mk("Air Liquide Brasil Ltda.", "12.345.678/0001-90", "João da Silva", "123.456.789-00", "2026-09-30", "AGUARDANDO_ASSINATURA", "TRN-0001");
    mk("Air Liquide Brasil Ltda.", "12.345.678/0001-90", "Maria Santos", "987.456.123-00", "2026-09-30", "AGUARDANDO_ASSINATURA", "TRN-0001");
    mk("Air Liquide Brasil Ltda.", "12.345.678/0001-90", "Carlos Eduardo Lima", "321.654.987-11", "2026-09-18", "EMITIDO", "TRN-0002");
    mk("Air Liquide Brasil Ltda.", "12.345.678/0001-90", "Aline Rocha", "741.852.963-22", "2026-09-18", "EMITIDO", "TRN-0002");
    for (const [n, c] of [["Paulo Henrique Alves", "111.222.333-44"], ["Renata Costa", "555.666.777-88"]])
      mk("Hospital São Lucas", "98.765.432/0001-10", n, c, "2026-10-05", "AGUARDANDO_ASSINATURA", "TRN-0003", "2 horas");
    mk("Hospital São Lucas", "98.765.432/0001-10", "Beatriz Nogueira", "222.333.444-55", "2026-09-22", "EMITIDO", "TRN-0004", "2 horas");
    for (const [n, c] of [["Fernanda Duarte", "888.999.000-11"], ["Rafael Mendes", "444.333.222-10"], ["Tiago Barros", "676.767.676-76"]])
      mk("Clínica Vida", "11.222.333/0001-44", n, c, "2026-10-08", "AGUARDANDO_ASSINATURA", "TRN-0005");
    db.trainingSeq = 5;
    return db;
  }

  const Mock = {
    _db() {
      let raw = localStorage.getItem(DB_KEY);
      if (!raw) { const db = seed(); localStorage.setItem(DB_KEY, JSON.stringify(db)); return db; }
      return JSON.parse(raw);
    },
    _save(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); },
    _user() {
      const id = sessionStorage.getItem(SESSION_KEY);
      const u = id && this._db().users.find(x => x.id === id);
      if (!u) throw new ApiError("Sessão expirada. Faça login novamente.", "UNAUTHENTICATED");
      return u;
    },
    _pub(u) { return { id: u.id, name: u.name, email: u.email, role: u.role }; },
    _role(role) {
      const u = this._user();
      if (u.role !== role) throw new ApiError("Você não tem permissão para esta ação.", "FORBIDDEN");
      return u;
    },
    _log(db, certificateId, action, by, detail) {
      db.history.unshift({ id: "h" + Date.now() + Math.random().toString(16).slice(2, 5), at: nowIso(), certificateId, action, by, detail });
    },

    async login(email, password) {
      await delay(300);
      const u = this._db().users.find(x => x.email.toLowerCase() === String(email).trim().toLowerCase() && x.password === password);
      if (!u) throw new ApiError("E-mail ou senha inválidos.", "INVALID_CREDENTIALS");
      sessionStorage.setItem(SESSION_KEY, u.id);
      return this._pub(u);
    },
    async logout() { sessionStorage.removeItem(SESSION_KEY); },
    async me() { return this._pub(this._user()); },
    async listEquipment() { return ["Apneia Care T3"]; },

    async stats() {
      await delay(80); this._user();
      const c = this._db().certificates;
      const pending = c.filter(x => PENDING.includes(x.status)).length;
      const signed = c.filter(x => SIGNED.includes(x.status)).length;
      return { pending, signed, total: c.length };
    },

    async listCertificates({ group } = {}) {
      await delay(100); this._user();
      let c = this._db().certificates.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      if (group) c = c.filter(x => groupOf(x.status) === group);
      return c;
    },
    async getCertificate(id) {
      await delay(60); this._user();
      const c = this._db().certificates.find(x => x.id === id);
      if (!c) throw new ApiError("Certificado não encontrado.", "NOT_FOUND");
      return c;
    },

    async submitTraining({ training, trainees }) {
      await delay(400);
      const user = this._role("TECNICO");
      const db = this._db();
      const propertyName = String(training.propertyName || "").trim();
      const propertyDoc = String(training.propertyDoc || "").trim();
      if (!propertyName || !propertyDoc || !training.equipment || !training.date || !training.format || !training.hours) throw new ApiError("Dados do treinamento incompletos.");
      if (!trainees.length) throw new ApiError("Adicione ao menos um treinado.");
      db.trainingSeq++;
      const trainingId = "TRN-" + String(db.trainingSeq).padStart(4, "0");
      const created = [], skipped = [];
      for (const t of trainees) {
        const key = [digits(t.cpf), propertyKey(propertyName, propertyDoc), training.equipment.trim().toLowerCase(), training.date].join("|");
        const dup = db.certificates.find(c => [digits(c.traineeCpf), propertyKey(c.propertyName, c.propertyDoc), c.equipment.toLowerCase(), c.date].join("|") === key);
        if (dup) { skipped.push({ name: t.name, existing: dup.id }); continue; }
        db.seq++;
        const id = "CERT-" + String(db.seq).padStart(6, "0");
        const c = {
          id, trainingId, propertyName, propertyDoc,
          equipment: training.equipment.trim(), traineeName: t.name.trim(), traineeCpf: t.cpf,
          date: training.date, format: training.format, hours: training.hours.trim(),
          trainingTitle: CFG.TRAINING_TITLE,
          technicianId: user.id, technicianName: user.name,
          instructorName: training.instructorName, propertyDocType: training.propertyDocType,
          status: "AGUARDANDO_QUESTIONARIO", quizAttempts: 0, quizPassedAt: null,
          autentiqueDocId: null, signedAt: null, issuedAt: null, signedBy: null, pdfUrl: null,
          createdAt: nowIso(), updatedAt: nowIso()
        };
        if (training.title) c.trainingTitle = training.title;
        db.certificates.push(c); created.push(c);
        this._log(db, id, "CRIADO", user.name, "Certificado criado. Aguardando o treinado responder o questionário");
      }
      this._save(db);
      return { trainingId, created, skipped };
    },

    async updateCertificate(id, patch) {
      await delay(200);
      const user = this._role("TECNICO");
      const db = this._db();
      const c = db.certificates.find(x => x.id === id);
      if (!c) throw new ApiError("Certificado não encontrado.", "NOT_FOUND");
      if (!EDITABLE.includes(c.status)) throw new ApiError("Este certificado já entrou no processo de assinatura e não pode mais ser alterado.", "LOCKED");
      for (const k of ["traineeName", "traineeCpf", "equipment", "date", "format", "hours"]) if (patch[k] !== undefined) c[k] = patch[k];
      c.updatedAt = nowIso();
      this._log(db, id, "EDITADO", user.name, "Dados do certificado alterados antes da assinatura");
      this._save(db);
      return c;
    },

    async startSigning(id) {
      await delay(500);
      const user = this._role("COORDENADOR");
      const db = this._db();
      const c = db.certificates.find(x => x.id === id);
      if (!c) throw new ApiError("Certificado não encontrado.", "NOT_FOUND");
      if (SIGNED.includes(c.status)) throw new ApiError("Este certificado já foi assinado.", "ALREADY_SIGNED");
      if (c.status === "AGUARDANDO_QUESTIONARIO") throw new ApiError("O treinado ainda não foi aprovado no questionário.");
      if (c.status !== "ASSINATURA_EM_ANDAMENTO") {
        c.status = "ASSINATURA_EM_ANDAMENTO";
        c.autentiqueDocId = c.autentiqueDocId || "mock-doc-" + Math.random().toString(16).slice(2, 10);
        c.updatedAt = nowIso();
        this._log(db, id, "ASSINATURA_INICIADA", user.name, "Documento enviado ao Autentique (simulação)");
        this._save(db);
      }
      return { mode: "mock", documentId: c.autentiqueDocId };
    },

    async mockCompleteSignature(id) {
      await delay(900);
      const user = this._role("COORDENADOR");
      const db = this._db();
      const c = db.certificates.find(x => x.id === id);
      if (!c || c.status !== "ASSINATURA_EM_ANDAMENTO") throw new ApiError("Assinatura não iniciada.");
      c.status = "ASSINADO"; c.signedAt = nowIso(); c.signedBy = user.name;
      this._log(db, id, "ASSINADO", user.name, "Assinatura confirmada pelo Autentique (webhook simulado)");
      c.status = "EMITIDO"; c.issuedAt = nowIso();
      this._log(db, id, "EMITIDO", "Sistema", "Certificado final emitido");
      this._save(db);
      return c;
    },

    async listHistory() { await delay(80); this._user(); return this._db().history.slice(0, 100); },
    async downloadPdf() { window.print(); },

    /* ---- Questionário (simulação local) ---- */
    _quiz(db, eq) {
      const saved = (db.quizzes || {})[eq];
      if (saved) return { ...saved, custom: true };
      return { equipment: eq, passPercent: QD.passPercent, maxAttempts: QD.maxAttempts, custom: false,
        questions: (QD.byEquipment[eq] || []).map((q, i) => ({ id: "q" + (i + 1), ...q })) };
    },
    _state(c, quiz) {
      if (c.quizPassedAt || PASSED.includes(c.status)) return "APROVADO";
      if (quiz.maxAttempts > 0 && (c.quizAttempts || 0) >= quiz.maxAttempts) return "BLOQUEADO";
      return "PENDENTE";
    },
    _link(token) {
      const db = this._db();
      const l = (db.quizLinks || []).find(x => x.token === token);
      if (!l) throw new ApiError("Link inválido ou desativado.", "NOT_FOUND");
      return { db, l };
    },
    _linkCert(token, id) {
      const { db, l } = this._link(token);
      const c = db.certificates.find(x => x.id === id && propertyKey(x.propertyName, x.propertyDoc) === l.propertyKey);
      if (!c) throw new ApiError("Treinado não encontrado neste link.", "NOT_FOUND");
      return { db, l, c, quiz: this._quiz(db, c.equipment) };
    },
    async getQuizLink({ propertyName, propertyDoc }) {
      await delay(150); this._user();
      const db = this._db(); db.quizLinks = db.quizLinks || [];
      const key = propertyKey(propertyName, propertyDoc);
      let l = db.quizLinks.find(x => x.propertyKey === key);
      if (!l) { l = { token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), propertyKey: key, propertyName, propertyDoc }; db.quizLinks.push(l); this._save(db); }
      return l;
    },
    async listQuizzes() { await delay(80); this._user(); const db = this._db(); return CFG.EQUIPMENTS.map(e => this._quiz(db, e)); },
    async saveQuiz(equipment, quiz) {
      await delay(200); const u = this._user();
      if (!quiz.questions.length) throw new ApiError("Cadastre ao menos uma pergunta.");
      const db = this._db(); db.quizzes = db.quizzes || {};
      db.quizzes[equipment] = { ...quiz, equipment, questions: quiz.questions.map((q, i) => ({ ...q, id: q.id || "q" + Date.now().toString(36) + i })), updatedAt: nowIso(), updatedBy: u.name };
      this._save(db); return { ...db.quizzes[equipment], custom: true };
    },
    async resetQuiz(id) {
      await delay(150); const u = this._role("TECNICO");
      const db = this._db(); const c = db.certificates.find(x => x.id === id);
      c.quizAttempts = 0; this._log(db, id, "TENTATIVAS_LIBERADAS", u.name, "Tentativas do questionário liberadas novamente"); this._save(db); return c;
    },
    async publicQuiz(token) {
      await delay(150);
      const { db, l } = this._link(token);
      const certs = db.certificates.filter(c => propertyKey(c.propertyName, c.propertyDoc) === l.propertyKey && (c.status === "AGUARDANDO_QUESTIONARIO" || c.quizPassedAt));
      return { propertyName: l.propertyName, trainees: certs.map(c => ({ id: c.id, name: c.traineeName, equipment: c.equipment, date: c.date, state: this._state(c, this._quiz(db, c.equipment)) })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) };
    },
    _pub2(c) { return { status: SIGNED.includes(c.status) ? "ASSINADO" : c.status, pdfReady: c.status === "EMITIDO" }; },
    async publicQuizFor(token, id) {
      await delay(120);
      const { c, quiz } = this._linkCert(token, id);
      const state = this._state(c, quiz);
      const base = { id: c.id, name: c.traineeName, equipment: c.equipment, state, attemptsUsed: c.quizAttempts || 0, maxAttempts: quiz.maxAttempts, passPercent: quiz.passPercent, ...this._pub2(c) };
      if (state !== "PENDENTE") return base;
      return { ...base, questions: quiz.questions.map(q => ({ id: q.id, text: q.text, options: q.options })) };
    },
    async submitQuiz(token, id, answers) {
      await delay(600);
      const { db, c, quiz } = this._linkCert(token, id);
      if (c.status !== "AGUARDANDO_QUESTIONARIO") throw new ApiError("Este questionário já foi respondido e aprovado.");
      if (this._state(c, quiz) === "BLOQUEADO") throw new ApiError("Você atingiu o limite de tentativas. Fale com o técnico que ministrou o treinamento.");
      if (quiz.questions.some(q => !Number.isInteger(answers[q.id]))) throw new ApiError("Responda todas as perguntas antes de enviar.");
      const correct = quiz.questions.filter(q => answers[q.id] === q.correct).length, total = quiz.questions.length;
      const percent = Math.round(correct / total * 100), passed = percent >= quiz.passPercent;
      c.quizAttempts = (c.quizAttempts || 0) + 1;
      this._log(db, c.id, passed ? "QUESTIONARIO_APROVADO" : "QUESTIONARIO_REPROVADO", c.traineeName, `Acertou ${correct} de ${total} (${percent}%) · tentativa ${c.quizAttempts}${quiz.maxAttempts ? " de " + quiz.maxAttempts : ""}`);
      if (passed) {
        const signer = (db.users.find(u => u.role === "COORDENADOR") || {}).name || "Coordenador";
        Object.assign(c, { quizPassedAt: nowIso(), status: "EMITIDO", autentiqueDocId: "mock-doc-" + c.id.toLowerCase(), signedAt: nowIso(), issuedAt: nowIso(), signedBy: signer });
        this._log(db, c.id, "ASSINATURA_AUTOMATICA", signer, "Assinado automaticamente via Autentique após aprovação no questionário (simulação)");
        this._log(db, c.id, "EMITIDO", "Sistema", "Certificado final emitido");
      }
      this._save(db);
      return { passed, correct, total, percent, passPercent: quiz.passPercent, attemptsUsed: c.quizAttempts, maxAttempts: quiz.maxAttempts, state: this._state(c, quiz), ...this._pub2(c) };
    },
    async publicStatus(token, id) { const { c } = this._linkCert(token, id); return this._pub2(c); },
    async publicCertificate(token, id) { return this._linkCert(token, id).c; },
    async publicPdf() { window.print(); },
    resetDemo() { localStorage.removeItem(DB_KEY); }
  };

  /* ------------------------------------------------------------------ */
  /* HTTP (backend real)                                                */
  /* ------------------------------------------------------------------ */
  async function req(path, { method = "GET", body, raw } = {}) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    let res;
    try {
      res = await fetch(CFG.API_BASE_URL + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new ApiError("Não foi possível conectar ao servidor.", "NETWORK");
    }
    if (raw && res.ok) return res;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || "Erro inesperado.", res.status === 401 ? "UNAUTHENTICATED" : res.status === 403 ? "FORBIDDEN" : "HTTP_" + res.status);
    return data;
  }

  const Http = {
    async login(email, password) {
      const d = await req("/auth/login", { method: "POST", body: { email, password } });
      sessionStorage.setItem(TOKEN_KEY, d.token);
      return d.user;
    },
    async logout() { sessionStorage.removeItem(TOKEN_KEY); },
    async me() { return (await req("/auth/me")).user; },
    listEquipment: () => req("/equipment"),
    stats: () => req("/stats"),
    listCertificates: ({ group } = {}) => req("/certificates" + (group ? "?group=" + group : "")),
    getCertificate: id => req("/certificates/" + id),
    submitTraining: payload => req("/trainings", { method: "POST", body: payload }),
    updateCertificate: (id, patch) => req("/certificates/" + id, { method: "PATCH", body: patch }),
    removeCertificate: id => req("/certificates/" + id, { method: "DELETE" }),
    updateProperty: body => req("/properties-bulk", { method: "PATCH", body }),
    removeProperty: body => req("/properties-bulk", { method: "DELETE", body }),
    startSigning: id => req("/certificates/" + id + "/sign", { method: "POST" }),
    listHistory: () => req("/history"),
    getQuizLink: body => req("/quiz-links", { method: "POST", body }),
    listQuizzes: () => req("/quizzes"),
    saveQuiz: (equipment, quiz) => req("/quizzes/" + encodeURIComponent(equipment), { method: "PUT", body: quiz }),
    resetQuiz: id => req("/certificates/" + id + "/reset-quiz", { method: "POST" }),
    publicQuiz: token => req("/public/quiz/" + encodeURIComponent(token)),
    publicQuizFor: (token, id) => req("/public/quiz/" + encodeURIComponent(token) + "/" + encodeURIComponent(id)),
    submitQuiz: (token, id, answers) => req("/public/quiz/" + encodeURIComponent(token) + "/" + encodeURIComponent(id), { method: "POST", body: { answers } }),
    publicStatus: (token, id) => req("/public/quiz/" + encodeURIComponent(token) + "/" + encodeURIComponent(id) + "/status"),
    async publicPdf(token, id) {
      const res = await req("/public/quiz/" + encodeURIComponent(token) + "/" + encodeURIComponent(id) + "/pdf", { raw: true });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "Certificado-" + id + ".pdf"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    async downloadPdf(id) {
      const res = await req("/certificates/" + id + "/pdf", { raw: true });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = id + ".pdf"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  };

  window.ApiError = ApiError;
  window.Api = CFG.API_MODE === "http" ? Http : Mock;
  window.Api.mode = CFG.API_MODE === "http" ? "http" : "mock";
  window.Api.PENDING = PENDING; window.Api.SIGNED = SIGNED; window.Api.EDITABLE = EDITABLE; window.Api.PASSED = PASSED;
})();
