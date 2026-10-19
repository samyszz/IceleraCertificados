/** Telas do sistema. Cada view renderiza dentro do shell via App.page(). */
(function () {
  const { icon, esc, fmtDate, fmtDateTime, monthYear, maskCpf, cpfOk, firstName, badge, toast, modal, errMsg } = UI;
  const CFG = window.ICELERA_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const isSigned = c => Api.SIGNED.includes(c.status);

  /* ---------------------------------------------------------------- */
  /* Certificado (documento) — pré-visualização igual ao PDF           */
  /* ---------------------------------------------------------------- */
  function certDoc(c, { preview = false } = {}) {
    const signed = isSigned(c);
    const b = s => `<b style="color:#0b2f55">${esc(s)}</b>`;
    const title = esc(c.trainingTitle || CFG.TRAINING_TITLE);

    const doc = c.propertyDoc
      ? esc((c.propertyDocType || "CPF/CNPJ") + ": " + c.propertyDoc)
      : "documento não informado";

    const bullets = (CFG.SYLLABUS_BY_EQUIPMENT[c.equipment] || []).map(s =>
      `<div style="padding-left:1.66cqw;margin-top:.24cqw">•&nbsp;&nbsp;${esc(s)}</div>`
    ).join("");

    return `<div style="container-type:inline-size;width:100%;max-width:1100px;margin:0 auto">
      <article class="cert-pdf" id="print-area" style="position:relative;width:100%;aspect-ratio:841.89/595.28;background:#fff url('assets/fundo-certificado.png') center/100% 100% no-repeat;font-family:Helvetica,Arial,sans-serif;color:#1b2f45;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.12)">
        ${preview && !signed ? '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none"><span style="transform:rotate(-20deg);font-size:4.2cqw;font-weight:700;color:rgba(245,138,31,.18);text-align:center;line-height:1.3">PRÉ-VISUALIZAÇÃO<br>AGUARDANDO ASSINATURA</span></div>' : ""}

        <div style="position:absolute;left:7.36%;top:36.1%;width:85.27%;font-size:1.425cqw;line-height:1.575;text-align:left">
          Certificamos que o(a) Sr(a). ${b(c.traineeName)}, CPF: ${b(c.traineeCpf)}, participou e concluiu com êxito o ${title}, modelo ${b(c.equipment)}, de propriedade de ${b(String(c.propertyName).toUpperCase())} (${doc}), marca iCelera, com carga horária estimada de ${esc(c.hours)}, em formato ${esc(String(c.format).toLowerCase())}, no mês de ${b(monthYear(c.date))}.

          <div style="margin-top:1.66cqw;font-size:1.366cqw;line-height:1.156">
            O conteúdo programático incluiu os seguintes tópicos:
            <div style="margin-top:.5cqw">${bullets}</div>
            <div style="margin-top:1.2cqw">O treinamento foi ministrado pelo Sr. ${esc(c.instructorName || c.technicianName || "")}</div>
            <div style="margin-top:.24cqw">Emitimos este certificado em reconhecimento à participação e dedicação no referido treinamento.</div>
          </div>
        </div>
      </article>
    </div>`;
  }

  function downloadPdf(id) {
    if (Api.mode === "mock") {
      sessionStorage.setItem("icelera.autoprint", id);

      if (location.hash === "#/certificado/" + id) {
        sessionStorage.removeItem("icelera.autoprint");
        window.print();
      } else {
        location.hash = "#/certificado/" + id;
      }
    } else {
      Api.downloadPdf(id).catch(e => toast(errMsg(e), "error"));
    }
  }

  /* ---------------------------------------------------------------- */
  /* Login                                                            */
  /* ---------------------------------------------------------------- */
  function login() {
    document.getElementById("app").innerHTML = `
    <main class="login">
      <section class="login-form">
        <img class="login-logo" src="assets/logo-icelera.jpg" alt="iCelera">
        <h1>Bem-vindo(a)</h1>
        <p class="muted">Acesse o sistema de gestão de certificados iCelera.</p>

        <form id="login-form" novalidate>
          <label class="field">
            <span>E-mail</span>
            <input class="input" type="email" id="email" placeholder="voce@icelera.com.br" autocomplete="username" required>
          </label>

          <label class="field">
            <span>Senha</span>
            <input class="input" type="password" id="password" placeholder="••••••••" autocomplete="current-password" required>
          </label>

          <p class="form-error" id="login-error" hidden></p>
          <button class="btn primary lg block" id="login-btn" type="submit">Entrar</button>
        </form>

        ${Api.mode === "mock" ? `<div class="demo-note">${icon("shield")}<div><b>Modo demonstração</b><br>Técnico: <code>tecnico@icelera.com.br</code><br>Coordenador: <code>coordenador@icelera.com.br</code><br>Senha: <code>demo123</code></div></div>` : ""}

        <p class="legal">© ${new Date().getFullYear()} iCelera. Todos os direitos reservados.</p>
      </section>

      <section class="login-art" aria-hidden="true">
        <svg viewBox="0 0 400 360" class="art-svg">
          <rect x="95" y="40" width="190" height="250" rx="22" fill="#fff" opacity=".96"/>
          <rect x="95" y="40" width="190" height="250" rx="22" fill="none" stroke="#fff" stroke-opacity=".6"/>
          <rect x="120" y="72" width="70" height="10" rx="5" fill="#1aa7d6"/>
          <rect x="120" y="98" width="140" height="7" rx="3.5" fill="#cfe6f3"/>
          <rect x="120" y="116" width="120" height="7" rx="3.5" fill="#cfe6f3"/>
          <rect x="120" y="134" width="132" height="7" rx="3.5" fill="#cfe6f3"/>
          <path d="M122 205c14-22 22 10 34-6s14-14 26-2 16 4 30-8" fill="none" stroke="#0e5aa7" stroke-width="3" stroke-linecap="round"/>
          <circle cx="250" cy="248" r="34" fill="#1aa7d6"/>
          <circle cx="250" cy="248" r="26" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="3 4"/>
          <path d="M238 248l9 9 17-19" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M236 276l-8 34 22-12 22 12-8-34" fill="#f58a1f"/>
        </svg>
        <div class="art-wave"></div>
      </section>
    </main>`;

    $("#login-form").addEventListener("submit", async e => {
      e.preventDefault();

      const btn = $("#login-btn");
      const err = $("#login-error");

      err.hidden = true;

      const email = $("#email").value;
      const password = $("#password").value;

      if (!email || !password) {
        err.textContent = "Informe e-mail e senha.";
        err.hidden = false;
        return;
      }

      btn.disabled = true;
      btn.textContent = "Entrando…";

      try {
        App.user = await Api.login(email, password);
        location.hash = "#/dashboard";
      } catch (ex) {
        err.textContent = errMsg(ex);
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = "Entrar";
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Dashboard                                                        */
  /* ---------------------------------------------------------------- */
  const listHeader = cols =>
    `<div class="row head">${cols.map(c => `<span>${c}</span>`).join("")}</div>`;

  async function dashboard() {
    const u = App.user;
    const tec = u.role === "TECNICO";

    const [st, certs] = await Promise.all([
      Api.stats(),
      Api.listCertificates()
    ]);

    const recent = certs.slice(0, 6);

    App.page("#/dashboard", `
      <section class="hero card">
        <div>
          <p class="eyebrow">${tec ? "Painel do Técnico" : "Painel do Coordenador"}</p>
          <h1>Olá, ${esc(firstName(u.name))}</h1>
          <p class="muted">${tec ? "Crie o certificado → adicione os treinados → revise → envie." : "Receba → revise → assine → o certificado é emitido."}</p>
        </div>

        ${tec
          ? `<a class="btn orange lg" href="#/novo">${icon("plus")} Novo Certificado</a>`
          : `<a class="btn primary lg" href="#/certificados/aguardando">${icon("pen")} Assinar certificados</a>`
        }
      </section>

      <h2 class="section-title">Certificados</h2>

      <section class="stats">
        <a class="stat card pending" href="#/certificados/aguardando">
          <span class="stat-ic">${icon("clock")}</span>
          <div>
            <p>${tec ? "Aguardando assinatura" : "Aguardando minha assinatura"}</p>
            <strong>${st.pending}</strong>
          </div>
        </a>

        <a class="stat card signed" href="#/certificados/assinados">
          <span class="stat-ic">${icon("award")}</span>
          <div>
            <p>Assinados</p>
            <strong>${st.signed}</strong>
          </div>
        </a>

        <a class="stat card total" href="#/certificados/todos">
          <span class="stat-ic">${icon("file")}</span>
          <div>
            <p>Total</p>
            <strong>${st.total}</strong>
          </div>
        </a>
      </section>

      <h2 class="section-title">Certificados recentes</h2>

      <section class="card list">
        ${listHeader(["Propriedade", "Treinado", "Equipamento", "Data", "Status"])}

        ${recent.length
          ? recent.map(c => `
            <a class="row link" href="#/certificado/${c.id}">
              <span data-l="Propriedade"><b>${esc(c.propertyName)}</b></span>
              <span data-l="Treinado">${esc(c.traineeName)}</span>
              <span data-l="Equipamento">${esc(c.equipment)}</span>
              <span data-l="Data">${fmtDate(c.date)}</span>
              <span data-l="Status">${badge(c.status)}</span>
            </a>
          `).join("")
          : `<div class="empty">Nenhum certificado ainda.</div>`
        }
      </section>
    `);
  }

  /* ---------------------------------------------------------------- */
  /* Wizard — Novo certificado                                        */
  /* ---------------------------------------------------------------- */
  const WKEY = "icelera.wizard.v1";

  const today = () => new Date().toLocaleDateString("en-CA");

  const newWiz = () => ({
    step: 1,
    training: {
      propertyName: "",
      propertyDoc: "",
      propertyDocType: "CNPJ",
      equipment: "",
      instructorName: "",
      date: today(),
      format: "Online",
      hours: "1 a 2 horas"
    },
    trainees: [],
    editing: null
  });

  const loadWiz = () => {
    try {
      return JSON.parse(sessionStorage.getItem(WKEY)) || newWiz();
    } catch {
      return newWiz();
    }
  };

  const saveWiz = w => sessionStorage.setItem(WKEY, JSON.stringify(w));

  async function wizard() {
    let wiz = loadWiz();

    App.page("#/novo", `
      <div class="page-head">
        <h1>Novo Certificado</h1>
        <p class="muted">Preencha os dados do treinamento realizado.</p>
      </div>
      <div id="wiz"></div>
    `);

    const host = $("#wiz");

    const stepper = () => {
      const steps = ["Treinamento", "Treinados", "Revisão"];

      return `<ol class="stepper">${steps.map((s, i) => {
        const n = i + 1;
        const cls = wiz.step === n ? "active" : wiz.step > n ? "done" : "";

        return `
          <li class="${cls}">
            <span class="dot">${wiz.step > n ? icon("check") : n}</span>
            <span class="lbl">${s}</span>
          </li>
        `;
      }).join("")}</ol>`;
    };

    function draw() {
      saveWiz(wiz);

      host.innerHTML = `
        <div class="card wiz-card">
          ${stepper()}
          <div class="wiz-body">${[step1, step2, step3][wiz.step - 1]()}</div>
        </div>
      `;

      [bind1, bind2, bind3][wiz.step - 1]();

      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    /* Etapa 1 */
    function step1() {
      const t = wiz.training;

      return `
        <h2>Informações do treinamento</h2>

        <label class="field">
          <span>Nome da Instituição/Propriedade</span>
          <input class="input" id="t-prop-name" placeholder="Ex.: Clínica Vida" value="${esc(t.propertyName || "")}">
        </label>

        <fieldset class="field">
          <legend>Tipo de documento da propriedade</legend>
          <div class="pills">
            ${["CPF", "CNPJ"].map(d => `
              <label class="pill">
                <input type="radio" name="t-doctype" value="${d}" ${(t.propertyDocType || "CNPJ") === d ? "checked" : ""}>
                <span>${d}</span>
              </label>
            `).join("")}
          </div>
        </fieldset>

        <label class="field">
          <span id="t-doc-label">${(t.propertyDocType || "CNPJ")} da Propriedade</span>
          <input
            class="input"
            id="t-prop-doc"
            inputmode="numeric"
            placeholder="${(t.propertyDocType || "CNPJ") === "CPF" ? "000.000.000-00" : "00.000.000/0001-00"}"
            value="${esc(t.propertyDoc || "")}"
          >
        </label>

        <label class="field">
          <span>Modelo do equipamento</span>
          <select class="input" id="t-equip">
            <option value="">Selecione…</option>
            ${CFG.EQUIPMENTS.map(e => `
              <option ${t.equipment === e ? "selected" : ""}>${esc(e)}</option>
            `).join("")}
          </select>
        </label>

        <label class="field">
          <span>Quem ministrou o treinamento</span>
          <select class="input" id="t-instructor">
            <option value="">Selecione…</option>
            ${CFG.INSTRUCTORS.map(n => `
              <option ${t.instructorName === n ? "selected" : ""}>${esc(n)}</option>
            `).join("")}
          </select>
        </label>

        <fieldset class="field">
          <legend>Módulos do Treinamento (Título do Certificado)</legend>

          <div style="display:flex;gap:1.5rem;margin-top:.5rem">
            <label class="pill" style="cursor:pointer">
              <input type="checkbox" name="t-modules" value="Polissonografia" ${(t.modules || []).includes("Polissonografia") ? "checked" : ""}>
              <span>Polissonografia</span>
            </label>

            <label class="pill" style="cursor:pointer">
              <input type="checkbox" name="t-modules" value="Eletroencefalograma" ${(t.modules || []).includes("Eletroencefalograma") ? "checked" : ""}>
              <span>Eletroencefalograma</span>
            </label>
          </div>
        </fieldset>

        <label class="field">
          <span>Data do treinamento</span>
          <input class="input" type="date" id="t-date" value="${esc(t.date)}">
        </label>

        <label class="field">
          <span>Carga horária</span>
          <input class="input" id="t-hours" placeholder="Ex.: 1 a 2 horas" value="${esc(t.hours)}">
        </label>

        <fieldset class="field">
          <legend>Formato</legend>
          <div class="pills">
            ${["Online", "Presencial"].map(f => `
              <label class="pill">
                <input type="radio" name="t-format" value="${f}" ${t.format === f ? "checked" : ""}>
                <span>${f}</span>
              </label>
            `).join("")}
          </div>
        </fieldset>

        <p class="form-error" id="w-err" hidden></p>

        <div class="wiz-actions">
          <span></span>
          <button class="btn primary lg" id="w-next">Continuar</button>
        </div>
      `;
    }

    function bind1() {
      const maskDoc = (v, type) => {
        const d = String(v).replace(/\D/g, "");

        if (type === "CPF") {
          return d.slice(0, 11)
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        }

        return d.slice(0, 14)
          .replace(/^(\d{2})(\d)/, "$1.$2")
          .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
          .replace(/\.(\d{3})(\d)/, ".$1/$2")
          .replace(/(\d{4})(\d)/, "$1-$2");
      };

      const curType = () =>
        ($("input[name=t-doctype]:checked") || {}).value || "CNPJ";

      const docEl = $("#t-prop-doc");

      const refreshDoc = () => {
        const ty = curType();

        $("#t-doc-label").textContent = ty + " da Propriedade";

        docEl.placeholder = ty === "CPF"
          ? "000.000.000-00"
          : "00.000.000/0001-00";

        docEl.value = maskDoc(docEl.value, ty);
      };

      docEl.oninput = refreshDoc;

      $$("input[name=t-doctype]").forEach(r => {
        r.onchange = refreshDoc;
      });

      $("#w-next").onclick = () => {
        const checkedModules = Array.from(
          document.querySelectorAll('input[name="t-modules"]:checked')
        ).map(el => el.value);

        if (checkedModules.length === 0) {
          const e = $("#w-err");
          e.textContent = "Selecione pelo menos um módulo (Polissonografia e/ou Eletroencefalograma).";
          e.hidden = false;
          return;
        }

        let modText = "";

        if (checkedModules.length === 1) {
          modText = checkedModules[0];
        } else {
          const copy = checkedModules.slice();
          const ultimo = copy.pop();
          modText = copy.join(", ") + " e " + ultimo;
        }

        const trainingTitle =
          "Treinamento de Utilização do Software de " + modText;

        const t = {
          propertyName: $("#t-prop-name").value.trim(),
          propertyDoc: $("#t-prop-doc").value.trim(),
          propertyDocType: curType(),
          instructorName: $("#t-instructor").value,
          equipment: $("#t-equip").value,
          date: $("#t-date").value,
          hours: $("#t-hours").value.trim(),
          format: ($("input[name=t-format]:checked") || {}).value || "",
          modules: checkedModules,
          title: trainingTitle
        };

        wiz.training = t;

        const need = t.propertyDocType === "CPF" ? 11 : 14;

        const miss =
          !t.propertyName
            ? "o nome da instituição/propriedade"
            : t.propertyDoc.replace(/\D/g, "").length !== need
              ? "um " + t.propertyDocType + " válido da propriedade"
              : !t.equipment
                ? "o modelo do equipamento"
                : !t.instructorName
                  ? "quem ministrou o treinamento"
                  : !t.date
                    ? "a data do treinamento"
                    : !t.hours
                      ? "a carga horária"
                      : !t.format
                        ? "o formato"
                        : "";

        if (miss) {
          const e = $("#w-err");
          e.textContent = "Informe " + miss + " para continuar.";
          e.hidden = false;
          return;
        }

        wiz.step = 2;
        draw();
      };
    }

    /* Etapa 2 */
    function step2() {
      const ed = wiz.editing !== null
        ? wiz.trainees[wiz.editing]
        : null;

      return `
        <h2>Treinados</h2>

        <p class="muted">
          O treinamento é cadastrado uma única vez. Adicione quantas pessoas participaram — cada uma terá o seu certificado.
        </p>

        <div class="add-row">
          <label class="field">
            <span>Nome completo</span>
            <input class="input" id="n-name" placeholder="Ex.: Francélce Martins" value="${esc(ed ? ed.name : "")}">
          </label>

          <label class="field">
            <span>CPF</span>
            <input class="input" id="n-cpf" inputmode="numeric" placeholder="000.000.000-00" value="${esc(ed ? ed.cpf : "")}">
          </label>

          <button class="btn ${ed ? "primary" : "outline"}" id="n-add">
            ${ed ? icon("check") + " Salvar alteração" : icon("plus") + " Adicionar treinado"}
          </button>

          ${ed ? `<button class="btn ghost" id="n-cancel">Cancelar</button>` : ""}
        </div>

        <p class="form-error" id="w-err" hidden></p>

        <details class="bulk">
          <summary>Adicionar vários de uma vez (colar lista)</summary>

          <p class="muted small">
            Uma pessoa por linha, no formato
            <code>Nome Completo; 000.000.000-00</code>.
            Ideal para turmas grandes.
          </p>

          <textarea class="input" id="n-bulk" rows="5" placeholder="João da Silva; 123.456.789-00&#10;Maria Santos; 987.456.123-00"></textarea>

          <button class="btn outline sm" id="n-bulk-btn">Importar lista</button>
        </details>

        <div class="added-head">
          <h3>Treinados adicionados</h3>
          <span class="count">${wiz.trainees.length}</span>
        </div>

        <ul class="trainees">
          ${wiz.trainees.length
            ? wiz.trainees.map((t, i) => `
              <li class="${wiz.editing === i ? "editing" : ""}">
                <span class="avatar sm">${UI.initials(t.name)}</span>
                <div class="who">
                  <b>${esc(t.name)}</b>
                  <span>${esc(t.cpf)}</span>
                </div>
                <button class="icon-btn" data-edit="${i}" title="Editar">${icon("edit")}</button>
                <button class="icon-btn danger" data-del="${i}" title="Remover">${icon("trash")}</button>
              </li>
            `).join("")
            : `<li class="empty-li">Nenhum treinado adicionado ainda.</li>`
          }
        </ul>

        <div class="wiz-actions">
          <button class="btn ghost" id="w-back">Voltar</button>
          <button class="btn primary lg" id="w-next">Continuar</button>
        </div>
      `;
    }

    function bind2() {
      const err = m => {
        const e = $("#w-err");
        e.textContent = m;
        e.hidden = !m;
      };

      const cpfEl = $("#n-cpf");

      cpfEl.oninput = () => {
        cpfEl.value = maskCpf(cpfEl.value);
      };

      const dupCpf = (cpf, ignore) =>
        wiz.trainees.some((t, i) =>
          i !== ignore &&
          t.cpf.replace(/\D/g, "") === cpf.replace(/\D/g, "")
        );

      $("#n-add").onclick = () => {
        const name = $("#n-name").value.trim().replace(/\s+/g, " ");
        const cpf = cpfEl.value;

        if (name.length < 3) {
          return err("Informe o nome completo do treinado.");
        }

        if (!cpfOk(cpf)) {
          return err("Informe um CPF válido com 11 dígitos.");
        }

        if (dupCpf(cpf, wiz.editing)) {
          return err("Este CPF já foi adicionado neste treinamento.");
        }

        if (wiz.editing !== null) {
          wiz.trainees[wiz.editing] = { name, cpf };
          wiz.editing = null;
        } else {
          wiz.trainees.push({ name, cpf });
        }

        draw();

        setTimeout(() => {
          if ($("#n-name")) $("#n-name").focus();
        }, 50);
      };

      $("#n-name").onkeydown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          cpfEl.focus();
        }
      };

      cpfEl.onkeydown = e => {
        if (e.key === "Enter") {
          e.preventDefault();
          $("#n-add").click();
        }
      };

      const c = $("#n-cancel");

      if (c) {
        c.onclick = () => {
          wiz.editing = null;
          draw();
        };
      }

      $$("[data-edit]").forEach(b => {
        b.onclick = () => {
          wiz.editing = +b.dataset.edit;
          draw();
        };
      });

      $$("[data-del]").forEach(b => {
        b.onclick = () => {
          wiz.trainees.splice(+b.dataset.del, 1);
          wiz.editing = null;
          draw();
        };
      });

      $("#n-bulk-btn").onclick = () => {
        let ok = 0;
        let bad = 0;

        $("#n-bulk").value
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean)
          .forEach(line => {
            const m = line.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);

            const name = line
              .replace(m ? m[0] : "", "")
              .replace(/[;,\t]+/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            const cpf = m ? maskCpf(m[0]) : "";

            if (name.length < 3 || !cpfOk(cpf) || dupCpf(cpf, null)) {
              bad++;
              return;
            }

            wiz.trainees.push({ name, cpf });
            ok++;
          });

        draw();

        toast(
          `${ok} treinado(s) importado(s)${bad ? ` · ${bad} linha(s) ignorada(s) (inválidas ou duplicadas)` : ""}.`,
          bad && !ok ? "error" : "info"
        );
      };

      $("#w-back").onclick = () => {
        wiz.step = 1;
        wiz.editing = null;
        draw();
      };

      $("#w-next").onclick = () => {
        if (!wiz.trainees.length) {
          return err("Adicione ao menos um treinado para continuar.");
        }

        wiz.editing = null;
        wiz.step = 3;
        draw();
      };
    }

    /* Etapa 3 */
    function step3() {
      const t = wiz.training;

      return `
        <h2>Revisão dos dados</h2>

        <p class="muted">
          Confira as informações antes de enviar ao Coordenador. Você ainda pode editar tudo.
        </p>

        <div class="review">
          <section class="review-card">
            <header>
              <h3>Treinamento</h3>
              <button class="link-btn" data-go="1">${icon("edit")} Editar</button>
            </header>

            <dl>
              <dt>Propriedade</dt>
              <dd>${esc(t.propertyName)}</dd>

              <dt>${esc(t.propertyDocType || "Documento")}</dt>
              <dd>${esc(t.propertyDoc)}</dd>

              <dt>Equipamento</dt>
              <dd>${esc(t.equipment)}</dd>

              <dt>Ministrante</dt>
              <dd>${esc(t.instructorName)}</dd>

              <dt>Data</dt>
              <dd>${fmtDate(t.date)}</dd>

              <dt>Formato</dt>
              <dd>${esc(t.format)}</dd>

              <dt>Carga horária</dt>
              <dd>${esc(t.hours)}</dd>
            </dl>
          </section>

          <section class="review-card">
            <header>
              <h3>Treinados <span class="count">${wiz.trainees.length}</span></h3>
              <button class="link-btn" data-go="2">${icon("edit")} Editar</button>
            </header>

            <ul class="mini-list">
              ${wiz.trainees.map(x => `
                <li>
                  <b>${esc(x.name)}</b>
                  <span>${esc(x.cpf)}</span>
                </li>
              `).join("")}
            </ul>
          </section>
        </div>

        <div class="notice">
          ${icon("send")}
          <span>
            Serão criados <b>${wiz.trainees.length} certificado(s)</b>, um para cada treinado, com status <b>Aguardando assinatura</b>. O PDF só é emitido depois que o Coordenador assinar.
          </span>
        </div>

        <p class="form-error" id="w-err" hidden></p>

        <div class="wiz-actions">
          <button class="btn ghost" id="w-back">Voltar</button>
          <button class="btn primary lg" id="w-send">${icon("send")} Enviar ao Coordenador</button>
        </div>
      `;
    }

    function bind3() {
      $$("[data-go]").forEach(b => {
        b.onclick = () => {
          wiz.step = +b.dataset.go;
          draw();
        };
      });

      $("#w-back").onclick = () => {
        wiz.step = 2;
        draw();
      };

      $("#w-send").onclick = async () => {
        const btn = $("#w-send");

        btn.disabled = true;
        btn.innerHTML = "Enviando…";

        try {
          const res = await Api.submitTraining({
            training: wiz.training,
            trainees: wiz.trainees
          });

          sessionStorage.setItem(
            "icelera.lastsubmit",
            JSON.stringify({
              created: res.created.length,
              skipped: res.skipped,
              first: res.created[0] ? res.created[0].traineeName : ""
            })
          );

          sessionStorage.removeItem(WKEY);
          location.hash = "#/enviado";
        } catch (e) {
          const er = $("#w-err");

          er.textContent = errMsg(e);
          er.hidden = false;

          btn.disabled = false;
          btn.innerHTML = icon("send") + " Enviar ao Coordenador";
        }
      };
    }

    draw();
  }

  /* ---------------------------------------------------------------- */
  /* Confirmação de envio                                              */
  /* ---------------------------------------------------------------- */
  function sent() {
    let r = {};

    try {
      r = JSON.parse(sessionStorage.getItem("icelera.lastsubmit")) || {};
    } catch { }

    const n = r.created || 0;
    const skipped = r.skipped || [];

    App.page("#/novo", `
      <section class="card success-card">
        <div class="success-ic plane">${icon("send")}</div>

        <h1>${n ? "Certificados enviados com sucesso!" : "Nenhum certificado novo"}</h1>

        <p class="muted">
          ${n
            ? (n === 1
              ? `O certificado de <b>${esc(r.first)}</b> foi enviado ao Coordenador para assinatura.`
              : `<b>${n} certificados</b> foram enviados ao Coordenador para assinatura.`)
            : "Todos os treinados informados já possuem certificado para este treinamento."
          }
        </p>

        ${skipped.length
          ? `<div class="notice warn">${icon("alert")}<span>${skipped.length} treinado(s) já tinham certificado e não foram duplicados: ${skipped.map(s => esc(s.name)).join(", ")}.</span></div>`
          : ""
        }

        <div class="btn-row">
          <a class="btn primary lg" href="#/certificados/aguardando">Ir para Gestão de Certificados</a>
          <a class="btn outline lg" href="#/novo">Novo certificado</a>
        </div>
      </section>
    `);
  }

  /* ---------------------------------------------------------------- */
  /* Gestão de certificados (Técnico e Coordenador)                    */
  /* ---------------------------------------------------------------- */
  async function management(tab) {
    const tec = App.user.role === "TECNICO";

    const all = await Api.listCertificates({
      group: tab === "todos" ? undefined : tab
    });

    const tabs = [
      ["aguardando", tec ? "Aguardando assinatura" : "Aguardando minha assinatura"],
      ["assinados", "Assinados"],
      ["todos", "Todos"]
    ];

    const props = [
      ...new Set(all.map(c => c.propertyName))
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));

    let filter = "";
    let openSet = null;

    App.page("#/certificados/" + tab, `
      <div class="page-head">
        <h1>Gestão de Certificados</h1>
        <p class="muted">Acompanhe os certificados e o status das assinaturas.</p>
      </div>

      <nav class="tabs">
        ${tabs.map(([k, l]) => `
          <a class="${k === tab ? "active" : ""}" href="#/certificados/${k}">${l}</a>
        `).join("")}
      </nav>

      <div class="toolbar">
        <label class="field inline">
          <span>Filtrar por propriedade</span>
          <select class="input" id="f-prop">
            <option value="">Todas</option>
            ${props.map(p => `<option>${esc(p)}</option>`).join("")}
          </select>
        </label>

        <span class="muted small" id="f-count"></span>
      </div>

      <div id="mg-list"></div>
    `);

    const actions = c => {
      let a = `<a class="btn ghost sm" href="#/certificado/${c.id}">${icon("eye")} Visualizar</a>`;

      if (isSigned(c)) {
        a += `<button class="btn primary sm" data-pdf="${c.id}">${icon("download")} Baixar PDF</button>`;
      } else if (!tec) {
        a += `<a class="btn primary sm" href="#/assinar/${c.id}">${icon("pen")} Assinar certificado</a>`;
      } else if (Api.EDITABLE.includes(c.status)) {
        a += `
          <button class="btn outline sm" data-edit="${c.id}">${icon("edit")} Editar</button>
          <button class="btn ghost sm" data-del="${c.id}">${icon("trash")} Remover</button>
        `;
      }

      return a;
    };

    function draw() {
      const list = all.filter(c => !filter || c.propertyName === filter);
      const groups = new Map();

      list.forEach(c => {
        if (!groups.has(c.propertyName)) groups.set(c.propertyName, []);
        groups.get(c.propertyName).push(c);
      });

      const names = [...groups.keys()].sort(
        (a, b) => a.localeCompare(b, "pt-BR")
      );

      if (!openSet) openSet = new Set(names.slice(0, 1));

      $("#f-count").textContent =
        `${list.length} certificado(s) em ${names.length} propriedade(s)`;

      $("#mg-list").innerHTML = names.length
        ? names.map(n => {
          const items = groups.get(n);
          const open = openSet.has(n);

          return `
            <section class="acc card ${open ? "open" : ""}">
              <div style="display:flex;align-items:center">
                <button class="acc-head" style="flex:1" data-toggle="${esc(n)}" aria-expanded="${open}">
                  <span class="chev">${icon("down")}</span>
                  <span class="acc-ic">${icon("building")}</span>
                  <b>${esc(n.toUpperCase())}</b>
                  <span class="count">${items.length}</span>
                </button>

                ${tec
                  ? `<button class="icon-btn" data-pedit="${esc(n)}" title="Editar propriedade">${icon("edit")}</button>
                     <button class="icon-btn danger" data-pdel="${esc(n)}" title="Remover propriedade">${icon("trash")}</button>`
                  : ""
                }
              </div>

              <div class="acc-body">
                ${listHeader(["Treinado", "Equipamento", "Data", "Status", ""])}

                ${items.map(c => `
                  <div class="row">
                    <span data-l="Treinado">
                      <b>${esc(c.traineeName)}</b>
                      <small>${esc(c.traineeCpf)} · ${esc(c.id)}</small>
                    </span>

                    <span data-l="Equipamento">${esc(c.equipment)}</span>
                    <span data-l="Data">${fmtDate(c.date)}</span>
                    <span data-l="Status">${badge(c.status)}</span>
                    <span class="actions">${actions(c)}</span>
                  </div>
                `).join("")}
              </div>
            </section>
          `;
        }).join("")
        : `<div class="card empty">${icon("file")}<p>Nenhum certificado encontrado nesta visão.</p></div>`;
    }

    $("#f-prop").onchange = e => {
      filter = e.target.value;
      draw();
    };

    $("#mg-list").addEventListener("click", e => {
      const t = e.target.closest("[data-toggle]");

      if (t) {
        const n = t.dataset.toggle;
        openSet.has(n) ? openSet.delete(n) : openSet.add(n);
        return draw();
      }

      const p = e.target.closest("[data-pdf]");

      if (p) return downloadPdf(p.dataset.pdf);

      const del = e.target.closest("[data-del]");

      if (del) {
        const c = all.find(x => x.id === del.dataset.del);

        return modal({
          title: "Remover certificado",
          confirmText: "Remover",
          body: `<p>Remover o certificado <b>${esc(c.id)}</b> de <b>${esc(c.traineeName)}</b>? Esta ação não pode ser desfeita.</p>`,
          onConfirm: async () => {
            await Api.removeCertificate(c.id);
            toast("Certificado removido.");
            management(tab);
          }
        });
      }

      const pe = e.target.closest("[data-pedit]");

      if (pe) {
        const sample = all.find(x => x.propertyName === pe.dataset.pedit);

        return modal({
          title: "Editar propriedade",
          body: `
            <label class="field">
              <span>Nome</span>
              <input class="input" id="p-name" value="${esc(sample.propertyName)}">
            </label>

            <label class="field">
              <span>CPF/CNPJ</span>
              <input class="input" id="p-doc" value="${esc(sample.propertyDoc)}">
            </label>

            <p class="muted small">
              Altera todos os certificados desta propriedade que ainda estão aguardando assinatura.
            </p>
          `,
          onConfirm: async () => {
            await Api.updateProperty({
              oldName: sample.propertyName,
              oldDoc: sample.propertyDoc,
              name: $("#p-name").value,
              doc: $("#p-doc").value
            });

            toast("Propriedade atualizada.");
            management(tab);
          }
        });
      }

      const pd = e.target.closest("[data-pdel]");

      if (pd) {
        const sample = all.find(x => x.propertyName === pd.dataset.pdel);
        const n = all.filter(x => x.propertyName === sample.propertyName).length;

        return modal({
          title: "Remover propriedade",
          confirmText: "Remover tudo",
          body: `<p>Remover a propriedade <b>${esc(sample.propertyName)}</b> e seus <b>${n}</b> certificado(s)? Esta ação não pode ser desfeita.</p>`,
          onConfirm: async () => {
            await Api.removeProperty({
              name: sample.propertyName,
              doc: sample.propertyDoc
            });

            toast("Propriedade removida.");
            management(tab);
          }
        });
      }

      const ed = e.target.closest("[data-edit]");

      if (ed) {
        editCertificate(
          all.find(c => c.id === ed.dataset.edit),
          () => management(tab)
        );
      }
    });

    draw();
  }

  /* ---------------------------------------------------------------- */
  /* Editar certificado                                                */
  /* ---------------------------------------------------------------- */
  function editCertificate(c, done) {
    const m = modal({
      title: "Editar certificado " + c.id,

      body: `
        <div class="grid2">
          <label class="field">
            <span>Nome completo</span>
            <input class="input" id="e-name" value="${esc(c.traineeName)}">
          </label>

          <label class="field">
            <span>CPF</span>
            <input class="input" id="e-cpf" value="${esc(c.traineeCpf)}">
          </label>

          <label class="field">
            <span>Equipamento</span>
            <select class="input" id="e-equip">
              ${CFG.EQUIPMENTS.map(e => `
                <option ${c.equipment === e ? "selected" : ""}>${esc(e)}</option>
              `).join("")}
            </select>
          </label>

          <label class="field">
            <span>Ministrante</span>
            <select class="input" id="e-instructor">
              ${CFG.INSTRUCTORS.map(n => `
                <option ${(c.instructorName || "") === n ? "selected" : ""}>${esc(n)}</option>
              `).join("")}
            </select>
          </label>

          <label class="field">
            <span>Data</span>
            <input class="input" type="date" id="e-date" value="${esc(c.date)}">
          </label>

          <label class="field">
            <span>Carga horária</span>
            <input class="input" id="e-hours" value="${esc(c.hours)}">
          </label>

          <label class="field">
            <span>Formato</span>
            <select class="input" id="e-format">
              ${["Online", "Presencial"].map(f => `
                <option ${c.format === f ? "selected" : ""}>${f}</option>
              `).join("")}
            </select>
          </label>
        </div>
      `,

      onConfirm: async () => {
        const patch = {
          traineeName: $("#e-name").value.trim(),
          traineeCpf: $("#e-cpf").value,
          equipment: $("#e-equip").value,
          instructorName: $("#e-instructor").value,
          date: $("#e-date").value,
          hours: $("#e-hours").value.trim(),
          format: $("#e-format").value
        };

        if (
          patch.traineeName.length < 3 ||
          !cpfOk(patch.traineeCpf) ||
          !patch.equipment ||
          !patch.instructorName ||
          !patch.date ||
          !patch.hours
        ) {
          throw new Error(
            "Verifique os campos: nome, CPF, equipamento, ministrante, data e carga horária são obrigatórios."
          );
        }

        await Api.updateCertificate(c.id, patch);

        toast("Certificado atualizado.");
        done();
      }
    });

    const cpf = $("#e-cpf", m);

    cpf.oninput = () => {
      cpf.value = maskCpf(cpf.value);
    };
  }

  /* ---------------------------------------------------------------- */
  /* Visualizar certificado                                            */
  /* ---------------------------------------------------------------- */
  async function certificate(id) {
    const c = await Api.getCertificate(id);
    const tec = App.user.role === "TECNICO";

    const back = isSigned(c)
      ? "#/certificados/assinados"
      : "#/certificados/aguardando";

    App.page(back, `
      <div class="page-head split">
        <div>
          <a class="back" href="${back}">${icon("back")} Voltar</a>
          <h1>Certificado</h1>
          <p class="muted">${esc(c.id)} · ${esc(c.traineeName)}</p>
        </div>

        <div class="btn-row">
          ${badge(c.status)}
          ${isSigned(c)
            ? `<button class="btn primary" id="pdf">${icon("download")} Baixar PDF</button>`
            : (!tec
              ? `<a class="btn primary" href="#/assinar/${c.id}">${icon("pen")} Assinar certificado</a>`
              : "")
          }
        </div>
      </div>

      <div class="cert-stage">${certDoc(c, { preview: true })}</div>
    `);

    const b = $("#pdf");

    if (b) b.onclick = () => downloadPdf(c.id);

    if (sessionStorage.getItem("icelera.autoprint") === id) {
      sessionStorage.removeItem("icelera.autoprint");
      setTimeout(() => window.print(), 400);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Assinar certificado (Coordenador) — Autentique                    */
  /* ---------------------------------------------------------------- */
  async function sign(id) {
    const c = await Api.getCertificate(id);
    const u = App.user;

    if (isSigned(c)) {
      location.hash = "#/emitido/" + id;
      return;
    }

    App.page("#/certificados/aguardando", `
      <div class="page-head">
        <a class="back" href="#/certificados/aguardando">${icon("back")} Voltar</a>
        <h1>Assinar Certificado</h1>
        <p class="muted">Revise os dados e conclua a assinatura digital.</p>
      </div>

      <div class="sign-grid">
        <section class="card pad">
          <h3>Resumo do Certificado</h3>

          <dl class="dl">
            <dt>Propriedade</dt>
            <dd>${esc(c.propertyName)}</dd>

            <dt>${esc(c.propertyDocType || "Documento")}</dt>
            <dd>${esc(c.propertyDoc || "Não informado")}</dd>

            <dt>Modelo do equipamento</dt>
            <dd>${esc(c.equipment)}</dd>

            <dt>Ministrante</dt>
            <dd>${esc(c.instructorName || c.technicianName || "")}</dd>

            <dt>Treinado</dt>
            <dd>${esc(c.traineeName)}</dd>

            <dt>CPF</dt>
            <dd>${esc(c.traineeCpf)}</dd>

            <dt>Data</dt>
            <dd>${fmtDate(c.date)}</dd>

            <dt>Formato</dt>
            <dd>${esc(c.format)}</dd>

            <dt>Carga horária</dt>
            <dd>${esc(c.hours)}</dd>
          </dl>

          <a class="link-btn" href="#/certificado/${c.id}">
            ${icon("eye")} Ver documento completo
          </a>
        </section>

        <section class="card pad">
          <h3>Assinatura Digital</h3>

          <p class="muted">
            O certificado será assinado digitalmente através do <b>Autentique</b>,
            em nome de <b>${esc(u.name)}</b>. A assinatura é feita por você,
            com a sua identidade — o sistema não assina em seu nome.
          </p>

          <div class="sign-area" id="sign-area">
            <div class="sign-idle">
              ${icon("shield")}
              <span>A área de assinatura do Autentique será exibida aqui.</span>
            </div>
          </div>

          <div class="btn-row end">
            <button class="btn primary lg" id="sign-btn">
              ${icon("pen")} Assinar e emitir certificado
            </button>
          </div>
        </section>
      </div>
    `);

    const area = $("#sign-area");
    const btn = $("#sign-btn");

    let timer = null;

    App.onLeave(() => clearInterval(timer));

    const waitForSignature = () => {
      timer = setInterval(async () => {
        try {
          const cur = await Api.getCertificate(id);

          if (isSigned(cur)) {
            clearInterval(timer);
            toast("Assinatura confirmada.");
            location.hash = "#/emitido/" + id;
          }
        } catch {
          /* tenta novamente no próximo ciclo */
        }
      }, 3000);
    };

    const show = s => {
      if (s.mode === "mock") {
        area.innerHTML = `
          <div class="mock-sign">
            <span class="tag">Simulação do Autentique</span>

            <p>
              Documento <b>${esc(s.documentId)}</b> criado.
              Em produção, esta área exibe o ambiente de assinatura do Autentique.
            </p>

            <button class="btn primary" id="mock-confirm">
              ${icon("pen")} Assinar
            </button>

            <p class="muted small">
              Ao assinar, o Autentique envia um webhook ao backend,
              que atualiza o status para Assinado e depois Emitido.
            </p>
          </div>
        `;

        $("#mock-confirm").onclick = async e => {
          e.target.disabled = true;
          e.target.textContent = "Assinando…";

          try {
            await Api.mockCompleteSignature(id);
            location.hash = "#/emitido/" + id;
          } catch (ex) {
            toast(errMsg(ex), "error");
            e.target.disabled = false;
            e.target.textContent = "Assinar";
          }
        };
      } else {
        area.innerHTML = `
          <iframe
            class="sign-frame"
            src="${esc(s.signUrl)}"
            title="Assinatura Autentique"
            referrerpolicy="strict-origin-when-cross-origin"
            allow="camera; microphone; clipboard-write"
          ></iframe>

          <p class="muted small">
            Se a área acima não carregar,
            <a href="${esc(s.signUrl)}" target="_blank" rel="noopener">
              abra a assinatura em uma nova janela ${icon("external")}
            </a>.
            Esta página atualiza sozinha quando a assinatura for confirmada.
          </p>

          <div class="waiting">
            <span class="spinner"></span>
            Aguardando confirmação do Autentique…
          </div>
        `;

        waitForSignature();
      }
    };

    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Preparando documento…";

      try {
        const s = await Api.startSigning(id);
        btn.hidden = true;
        show(s);
      } catch (e) {
        toast(errMsg(e), "error");
        btn.disabled = false;
        btn.innerHTML = icon("pen") + " Assinar e emitir certificado";
      }
    };

    if (c.status === "ASSINATURA_EM_ANDAMENTO") {
      btn.innerHTML = icon("pen") + " Continuar assinatura";
    }
  }

  /* ---------------------------------------------------------------- */
  /* Certificado emitido                                               */
  /* ---------------------------------------------------------------- */
  async function issued(id) {
    const c = await Api.getCertificate(id);

    if (!isSigned(c)) {
      location.hash = App.user.role === "COORDENADOR"
        ? "#/assinar/" + id
        : "#/certificado/" + id;

      return;
    }

    App.page("#/certificados/assinados", `
      <section class="card success-card">
        <div class="success-ic ok">${icon("check")}</div>

        <h1>Certificado assinado com sucesso!</h1>

        <p class="muted">
          O certificado foi assinado digitalmente e emitido com sucesso.
        </p>

        <dl class="dl center">
          <dt>ID do certificado</dt>
          <dd>${esc(c.id)}</dd>

          <dt>Treinado</dt>
          <dd>${esc(c.traineeName)}</dd>

          <dt>Data de emissão</dt>
          <dd>${fmtDateTime(c.issuedAt)}</dd>

          <dt>Data da assinatura</dt>
          <dd>${fmtDateTime(c.signedAt)}</dd>

          <dt>Assinado por</dt>
          <dd>${esc(c.signedBy)}</dd>

          <dt>Documento Autentique</dt>
          <dd><code>${esc(c.autentiqueDocId)}</code></dd>
        </dl>

        <div class="btn-row">
          <a class="btn primary lg" href="#/certificado/${c.id}">
            ${icon("eye")} Visualizar certificado
          </a>

          <button class="btn outline lg" id="pdf">
            ${icon("download")} Baixar PDF
          </button>

          <a class="btn ghost lg" href="#/certificados/aguardando">
            Voltar para certificados
          </a>
        </div>
      </section>
    `);

    $("#pdf").onclick = () => downloadPdf(c.id);
  }

  /* ---------------------------------------------------------------- */
  /* Histórico e Configurações                                         */
  /* ---------------------------------------------------------------- */
  const ACTION = {
    ENVIADO_AO_COORDENADOR: ["send", "Enviado ao Coordenador"],
    EDITADO: ["edit", "Dados editados"],
    ASSINATURA_INICIADA: ["pen", "Assinatura iniciada"],
    ASSINADO: ["check", "Assinado"],
    EMITIDO: ["award", "Certificado emitido"],
    REMOVIDO: ["trash", "Removido"]
  };

  async function history() {
    const h = await Api.listHistory();

    App.page("#/historico", `
      <div class="page-head">
        <h1>Histórico</h1>
        <p class="muted">Registro das alterações importantes em cada certificado.</p>
      </div>

      <section class="card timeline">
        ${h.length
          ? h.map(e => {
            const [ic, label] = ACTION[e.action] || ["file", e.action];

            return `
              <div class="tl-item">
                <span class="tl-ic">${icon(ic)}</span>

                <div>
                  <b>${label}</b>
                  <a href="#/certificado/${esc(e.certificateId)}">${esc(e.certificateId)}</a>
                  <p class="muted small">${esc(e.detail || "")}</p>
                </div>

                <time>
                  ${fmtDateTime(e.at)}
                  <br>
                  <span>${esc(e.by)}</span>
                </time>
              </div>
            `;
          }).join("")
          : `<div class="empty">Sem eventos registrados.</div>`
        }
      </section>
    `);
  }

  function settings() {
    const u = App.user;

    App.page("#/configuracoes", `
      <div class="page-head">
        <h1>Configurações</h1>
        <p class="muted">Dados da sua conta e da integração.</p>
      </div>

      <div class="sign-grid">
        <section class="card pad">
          <h3>Minha conta</h3>

          <div class="profile">
            <span class="avatar lg">${UI.initials(u.name)}</span>

            <div>
              <b>${esc(u.name)}</b>
              <p class="muted">${esc(u.email)}</p>
              <span class="badge role">${u.role === "TECNICO" ? "Técnico" : "Coordenador"}</span>
            </div>
          </div>
        </section>

        <section class="card pad">
          <h3>Preferências</h3>

          <label class="field inline">
            <span>Modo Escuro</span>
            <input type="checkbox" id="dark-mode-toggle" ${localStorage.getItem("dark") === "1" ? "checked" : ""}>
          </label>
        </section>

        <section class="card pad">
          <h3>Integração</h3>

          <dl class="dl">
            <dt>Modo</dt>
            <dd>${Api.mode === "mock" ? "Demonstração (dados locais)" : "Backend conectado"}</dd>

            <dt>Assinatura</dt>
            <dd>Autentique — configurada no backend</dd>

            <dt>Credenciais</dt>
            <dd>Somente no servidor (variáveis de ambiente)</dd>
          </dl>

          ${Api.mode === "mock"
            ? `<button class="btn outline sm" id="reset">Restaurar dados de demonstração</button>`
            : ""
          }
        </section>
      </div>
    `);

    const toggle = $("#dark-mode-toggle");

    if (toggle) {
      toggle.onchange = e => {
        document.body.classList.toggle("dark", e.target.checked);
        localStorage.setItem("dark", e.target.checked ? "1" : "0");
      };
    }

    const r = $("#reset");

    if (r) {
      r.onclick = () => {
        Api.resetDemo();
        toast("Dados de demonstração restaurados.");
      };
    }
  }

  window.Views = {
    login,
    dashboard,
    wizard,
    sent,
    management,
    certificate,
    sign,
    issued,
    history,
    settings
  };
})();