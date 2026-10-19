/** Gera o PDF do certificado e envia ao Autentique para assinatura. */
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const cfg = require("../config");

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const monthYear = iso => { const [y, m] = iso.slice(0, 10).split("-"); return `${MONTHS[+m - 1]} de ${y}`; };

function buildCertificatePdf(c) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: { Title: "Certificado " + c.id, Author: "iCelera" }
    });
    const chunks = [];
    doc.on("data", d => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width, H = doc.page.height;
    const M = 62, CW = W - M * 2;

    // Fundo (logo, "CERTIFICADO", moldura, linha e nome do coordenador)
    const fundo = path.join(__dirname, "..", "..", "assets", "fundo-certificado.png");
    if (fs.existsSync(fundo)) doc.image(fundo, 0, 0, { width: W, height: H });

    const NORMAL = "#1b2f45", BOLD = "#0b2f55";
    const setFont = bold => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? BOLD : NORMAL);

    // Parágrafo principal (alinhado à esquerda: evita a sobreposição do pdfkit)
    const parts = [
      ["Certificamos que o(a) Sr(a). "], [c.traineeName, 1], [", CPF: "], [c.traineeCpf, 1],
      [", participou e concluiu com êxito o "], [c.trainingTitle || cfg.TRAINING_TITLE],
      [", modelo "], [c.equipment, 1], [", de propriedade de "], [String(c.propertyName).toUpperCase(), 1],
           [" ("], [(c.propertyDocType || "CPF/CNPJ") + ": "], [c.propertyDoc || "não informado"],
      ["), marca iCelera, com carga horária estimada de "], [c.hours],
      [", em formato "], [String(c.format).toLowerCase()],
      [", no mês de "], [monthYear(c.date), 1], ["."]
    ];

    doc.fontSize(12);
    parts.forEach(([t, bold], i) => {
      setFont(bold);
      const o = { width: CW, align: "left", lineGap: 5, continued: i < parts.length - 1 };
      if (i === 0) doc.text(t, M, 215, o); else doc.text(t, o);
    });

    // Conteúdo programático
    let y = doc.y + 14;
    setFont(false);
    doc.fontSize(11.5).text("O conteúdo programático incluiu os seguintes tópicos:", M, y, { width: CW });
    y = doc.y + 4;
        const syllabus = cfg.SYLLABUS_BY_EQUIPMENT[c.equipment] || [];
    syllabus.forEach(s => {
      doc.fontSize(11.5).text("•  " + s, M + 14, y, { width: CW - 14 });
      y = doc.y + 2;
    });

    // Responsável e fechamento
    y += 10;
           doc.fontSize(11.5).text("O treinamento foi ministrado pelo Sr. " + (c.instructorName || c.technicianName || ""), M, y, { width: CW });
    doc.text("Emitimos este certificado em reconhecimento à participação e dedicação no referido treinamento.", M, doc.y + 2, { width: CW });

    doc.end();
  });
}

module.exports = { buildCertificatePdf };