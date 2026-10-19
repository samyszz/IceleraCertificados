/**
 * Cliente GraphQL do Autentique (API v2). Credenciais SOMENTE via variáveis de ambiente.
 *
 * Fluxo: createDocument (PDF + signatário Coordenador, action SIGN)
 *        → createLinkToSignature(public_id) → link exclusivo do signatário.
 * Este módulo NUNCA assina em nome de ninguém: a assinatura é feita pelo próprio
 * signatário no ambiente do Autentique.
 *
 * ⚠️ Valide os nomes de campos no schema atual (Altair/introspecção) antes de produção:
 *    https://docs.autentique.com.br/api
 */
const URL_ = () => process.env.AUTENTIQUE_API_URL || "https://api.autentique.com.br/v2/graphql";
const SANDBOX = () => String(process.env.AUTENTIQUE_SANDBOX || "true").toLowerCase() !== "false";

function headers() {
  const t = process.env.AUTENTIQUE_API_TOKEN;
  if (!t) throw Object.assign(new Error("AUTENTIQUE_API_TOKEN não configurado."), { code: "NOT_CONFIGURED" });
  return { Authorization: "Bearer " + t };
}

async function post(init) {
  const res = await fetch(URL_(), init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const msg = (json.errors && json.errors.map(e => e.message).join("; ")) || "HTTP " + res.status;
    throw Object.assign(new Error("Autentique: " + msg), { code: "AUTENTIQUE_ERROR" });
  }
  return json.data;
}

const gql = (query, variables) =>
  post({ method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });

/** Cria o documento (upload multipart conforme a spec "GraphQL multipart request"). */
async function createDocument({ name, pdf, filename, signerEmail }) {
  const query = `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
    createDocument(sandbox: ${SANDBOX()}, document: $document, signers: $signers, file: $file) {
      id name signatures { public_id name email }
    } }`;
  const form = new FormData();
  form.append("operations", JSON.stringify({
    query,
    variables: { document: { name }, signers: [{ email: signerEmail, action: "SIGN" }], file: null }
  }));
  form.append("map", JSON.stringify({ 0: ["variables.file"] }));
  form.append("0", new Blob([pdf], { type: "application/pdf" }), filename);
  const data = await post({ method: "POST", headers: headers(), body: form });
  return data.createDocument;
}

/** Link exclusivo do signatário (docs: createLinkToSignature → short_link). */
async function createSignatureLink(publicId) {
  const data = await gql(`mutation($id: UUID!) { createLinkToSignature(public_id: $id) { short_link } }`, { id: publicId });
  return data.createLinkToSignature.short_link;
}

/** Consulta o documento — fonte da verdade para confirmar a assinatura (não confiamos só no payload do webhook). */
async function getDocument(id) {
  const data = await gql(`query { document(id: ${JSON.stringify(id)}) {
    id name signatures { public_id name email signed { created_at } rejected { created_at } }
    files { original signed } } }`);
  return data.document;
}

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao baixar o PDF assinado (HTTP " + res.status + ").");
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { createDocument, createSignatureLink, getDocument, downloadFile };
