const admin = require("firebase-admin");

try {
  if (!admin.apps.length) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
    
    // Limpeza rigorosa para remover qualquer aspa acidental salva no Vercel
    privateKey = privateKey.trim();
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
      privateKey = privateKey.slice(1, -1);
    }

    // Normaliza quebras de linha (\n literal para real)
    privateKey = privateKey.replace(/\\n/g, "\n");

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: (process.env.FIREBASE_PROJECT_ID || "").trim(),
        clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || "").trim(),
        privateKey: privateKey,
      }),
    });
  }
} catch (error) {
  console.error("❌ ERRO FATAL AO INICIALIZAR O FIREBASE ADMIN:", error.message);
  throw error;
}

const db = admin.firestore();

module.exports = { db };
