/** Shell da aplicação, roteador por hash e controle de sessão/perfil. */
(function () {
  const { icon, esc, initials, toast } = UI;
  const root = document.getElementById("app");
  const App = { user: null, cleanups: [] };
  window.App = App;

  App.onLeave = fn => App.cleanups.push(fn);

  function nav(role) {
    const tec = role === "TECNICO";
    const items = [{ href: "#/dashboard", label: "Dashboard", ic: "dashboard" }];
    if (tec) items.push({ href: "#/novo", label: "Novo Certificado", ic: "plus" });
    items.push({
      group: true, label: "Gestão de Certificados", ic: "folder", children: [
        { href: "#/certificados/aguardando", label: tec ? "Aguardando assinatura" : "Aguardando minha assinatura" },
        { href: "#/certificados/assinados", label: "Assinados" },
        { href: "#/certificados/todos", label: "Todos" }
      ]
    });
    items.push({ href: "#/historico", label: "Histórico", ic: "history" }, { href: "#/configuracoes", label: "Configurações", ic: "settings" });
    return items;
  }

  /** Renderiza o layout (menu lateral + topo) e coloca o conteúdo da tela. */
  App.page = function (active, html) {
    const u = App.user;
    const menu = nav(u.role).map(it => it.group
      ? `<div class="nav-group"><div class="nav-link group">${icon(it.ic)}<span>${it.label}</span></div>${it.children.map(c => `<a class="nav-link sub ${c.href === active ? "active" : ""}" href="${c.href}"><span class="tree"></span>${c.label}</a>`).join("")}</div>`
      : `<a class="nav-link ${it.href === active ? "active" : ""}" href="${it.href}">${icon(it.ic)}<span>${it.label}</span></a>`).join("");
    root.innerHTML = `<div class="shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="#/dashboard"><img src="assets/logo-icelera.jpg" alt="iCelera"></a>
        <nav>${menu}</nav>
        <button class="nav-link logout" id="logout">${icon("logout")}<span>Sair</span></button>
      </aside>
      <div class="scrim" id="scrim"></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" id="menu-btn" aria-label="Abrir menu">${icon("menu")}</button>
          <div class="spacer"></div>
          <div class="user-chip"><div class="who"><b>${esc(u.name)}</b><span>${u.role === "TECNICO" ? "Técnico" : "Coordenador"}</span></div><span class="avatar">${initials(u.name)}</span></div>
        </header>
        <main class="view" id="view">${html}</main>
      </div></div>`;
    const sb = document.getElementById("sidebar"), sc = document.getElementById("scrim");
    const toggle = open => { sb.classList.toggle("open", open); sc.classList.toggle("show", open); };
    document.getElementById("menu-btn").onclick = () => toggle(!sb.classList.contains("open"));
    sc.onclick = () => toggle(false);
    sb.querySelectorAll("a").forEach(a => a.addEventListener("click", () => toggle(false)));
    document.getElementById("logout").onclick = async () => { await Api.logout(); App.user = null; location.hash = "#/login"; };
    window.scrollTo(0, 0);
  };

  const routes = [
    { re: /^#\/login$/, view: "login", public: true },
    { re: /^#\/dashboard$/, view: "dashboard" },
    { re: /^#\/novo$/, view: "wizard", role: "TECNICO" },
    { re: /^#\/enviado$/, view: "sent", role: "TECNICO" },
    { re: /^#\/certificados\/(aguardando|assinados|todos)$/, view: "management" },
    { re: /^#\/certificado\/([\w-]+)$/, view: "certificate" },
    { re: /^#\/assinar\/([\w-]+)$/, view: "sign", role: "COORDENADOR" },
    { re: /^#\/emitido\/([\w-]+)$/, view: "issued" },
    { re: /^#\/historico$/, view: "history" },
    { re: /^#\/configuracoes$/, view: "settings" }
  ];

  async function route() {
    App.cleanups.splice(0).forEach(f => { try { f(); } catch { } });
    const h = location.hash || "#/dashboard";
    let hit = null;
    for (const r of routes) { const m = h.match(r.re); if (m) { hit = { r, args: m.slice(1) }; break; } }
    if (!hit) { location.hash = App.user ? "#/dashboard" : "#/login"; return; }
    const { r, args } = hit;
    if (!App.user && !r.public) { location.hash = "#/login"; return; }
    if (App.user && r.public) { location.hash = "#/dashboard"; return; }
    if (r.role && App.user.role !== r.role) { toast("Você não tem acesso a esta página.", "error"); location.hash = "#/dashboard"; return; }
    try { await Views[r.view](...args); }
    catch (e) {
      if (e.code === "UNAUTHENTICATED") { App.user = null; location.hash = "#/login"; return; }
      App.page("#/dashboard", `<div class="card empty">${icon("alert")}<p>${esc(e.message || "Não foi possível carregar esta página.")}</p><a class="btn primary" href="#/dashboard">Voltar ao início</a></div>`);
    }
  }

  async function boot() {
    document.body.classList.toggle("dark", localStorage.getItem("dark") === "1");
    try { App.user = await Api.me(); } catch { App.user = null; }
    window.addEventListener("hashchange", route);
    route();
  }
  boot();
})();
