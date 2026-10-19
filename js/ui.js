/** Helpers de interface: ícones, formatação, toasts, modais. */
(function () {
  const P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    pen: '<path d="M3 17l6-6 4 4-6 6H3z"/><path d="M13 7l2-2 4 4-2 2"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>'
  };
  const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ""}</svg>`;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = iso => { if (!iso) return "—"; const [y, m, d] = String(iso).slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
  const fmtDateTime = iso => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const monthYear = iso => { const [y, m] = String(iso).slice(0, 10).split("-"); return `${MONTHS[+m - 1]} de ${y}`; };
  const maskCpf = v => {
    const d = String(v).replace(/\D/g, "").slice(0, 11);
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };
  const cpfOk = v => { const d = String(v).replace(/\D/g, ""); return d.length === 11 && !/^(\d)\1+$/.test(d); };
  const firstName = n => String(n || "").split(" ")[0];
  const initials = n => String(n || "?").split(" ").filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();

  // Estados internos → rótulos simples na interface (sem expor complexidade técnica).
  const statusInfo = s => (Api.SIGNED.includes(s)
    ? { label: "Assinado", cls: "signed" }
    : { label: "Aguardando assinatura", cls: "pending" });
  const badge = s => { const i = statusInfo(s); return `<span class="badge ${i.cls}"><i></i>${i.label}</span>`; };

  function toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.innerHTML = `${icon(type === "error" ? "alert" : "check")}<span>${esc(msg)}</span>`;
    document.getElementById("toasts").appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 4200);
  }

  function modal({ title, body, confirmText = "Salvar", cancelText = "Cancelar", onConfirm }) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal card" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Fechar">${icon("x")}</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot"><button class="btn ghost" data-close>${cancelText}</button><button class="btn primary" data-ok>${confirmText}</button></div>
    </div></div>`;
    const close = () => { root.innerHTML = ""; };
    root.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
    root.querySelector(".modal-backdrop").addEventListener("mousedown", e => { if (e.target.classList.contains("modal-backdrop")) close(); });
    root.querySelector("[data-ok]").onclick = async () => {
      const btn = root.querySelector("[data-ok]");
      btn.disabled = true;
      try { const keep = await onConfirm(root.querySelector(".modal")); if (keep !== false) close(); }
      catch (e) { toast(e.message, "error"); btn.disabled = false; }
    };
    return root.querySelector(".modal");
  }

  const errMsg = e => (e && e.message) || "Erro inesperado.";
  window.UI = { icon, esc, fmtDate, fmtDateTime, monthYear, maskCpf, cpfOk, firstName, initials, statusInfo, badge, toast, modal, errMsg };
})();
