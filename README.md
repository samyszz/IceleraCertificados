# iCelera · Gestão e Emissão de Certificados

Frontend em HTML/CSS/JS puro + backend de referência (Node/Express) + fluxo n8n opcional.

```
Frontend → Backend → Banco / PDF / Autentique
Autentique → Webhook → (n8n opcional) → Backend → EMITIDO
```

## Rodar agora (modo demonstração, sem backend)

Abra `index.html` pelo navegador (ou `npx serve .`). Os dados ficam no navegador.

- Técnico: `tecnico@icelera.com.br` / `demo123`
- Coordenador: `coordenador@icelera.com.br` / `demo123`

O perfil vem da conta (sem tela de seleção). No modo demo, o botão "Assinar" simula o Autentique + webhook.

## Rodar com o backend real

```bash
cd backend
npm install
cp .env.example .env      # preencha (veja abaixo)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # use como JWT_SECRET
npm start
```

Depois, em `js/config.js`, troque `API_MODE: "mock"` por `"http"`. Nenhuma tela muda.
Acesse `http://localhost:3000` (o backend também serve o frontend).

## O que VOCÊ precisa configurar (nada foi inventado)

Tudo em `backend/.env` (nunca no frontend):

| Variável | Onde obter |
|---|---|
| `JWT_SECRET` | gere aleatório (comando acima) |
| `AUTENTIQUE_API_TOKEN` | painel Autentique → Chaves de API |
| `AUTENTIQUE_WEBHOOK_SECRET` | ao cadastrar o endpoint de webhook no painel |
| `AUTENTIQUE_SANDBOX` | `true` para testes; `false` só em produção |
| `INTERNAL_WEBHOOK_TOKEN` | gere aleatório; mesmo valor na credencial do n8n |
| `SEED_*` | usuários iniciais. O e-mail do Coordenador deve ser o mesmo que assina no Autentique |

## Como a assinatura funciona (Autentique)

1. Coordenador clica em **Assinar e emitir certificado**.
2. Backend gera o PDF **uma única vez**, cria o documento no Autentique (`createDocument`) tendo o Coordenador como signatário (`SIGN`) e pede o link exclusivo (`createLinkToSignature`).
3. O link abre num **iframe** dentro do sistema (com opção de abrir em nova janela, caso o Autentique bloqueie o embed).
4. Quem assina é o próprio Coordenador. O sistema nunca assina em nome dele.
5. O Autentique envia o webhook. O backend **consulta o documento no Autentique** (não confia só no payload), grava `ASSINADO`, baixa o PDF assinado e grava `EMITIDO`.
6. Fallback: a tela de assinatura consulta o status a cada 3 s, e o backend reconcilia com o Autentique se o webhook atrasar.

Webhook direto: `POST /api/webhooks/autentique`. Via n8n: `POST /api/internal/signature-events` (header `X-Internal-Token`).

## n8n (opcional)

Importe `n8n/icelera-autentique-webhook.json`. Ele só recebe o webhook, identifica o `documentId` e encaminha ao backend. Não cria documento, não assina, não altera status. O fluxo antigo que você enviou foi **substituído**, porque ele criava documento com e-mail fixo e marcava "signed" sem confirmação.

## Estados

`RASCUNHO → AGUARDANDO_ASSINATURA → ASSINATURA_EM_ANDAMENTO → ASSINADO → EMITIDO`
Na interface aparecem só: **Aguardando assinatura** e **Assinado**.

## Regras de negócio (onde estão)

| Regra | Implementação |
|---|---|
| 1, 2 | `POST /api/trainings`: 1 treinamento, 1 certificado por treinado |
| 4, 5 | middleware `role()`: só Coordenador assina |
| 6 | sem duplicar CPF+propriedade+equipamento+data; 1 documento Autentique por certificado |
| 8 | `PATCH` bloqueado (409) após `ASSINATURA_EM_ANDAMENTO` |
| 9, 10 | `EMITIDO` só após confirmar no Autentique e salvar o PDF assinado |
| 11 | tabela `history` e tela Histórico |
| 12 | tokens só no `.env`; frontend nunca vê credenciais |

## Estrutura

```
index.html  css/  js/ (config, api, ui, views, app)  assets/logo.svg
backend/    server.js  lib/(autentique, pdf, store)  .env.example
n8n/        icelera-autentique-webhook.json
```

## Pendências conhecidas

- `assets/logo.svg` é um logotipo provisório; substitua pelo oficial (e `backend/assets/logo.png` para o PDF).
- O conteúdo programático em `js/config.js` e `backend/config.js` é de exemplo; coloque o oficial.
- O backend usa arquivo JSON como banco; troque por PostgreSQL/MySQL em produção.
- Confirme no schema atual do Autentique (Altair) os nomes de campos e o algoritmo da assinatura do webhook. Isso não foi testado contra a API real, pois não há token.
- O iframe do Autentique pode ser bloqueado por política do próprio Autentique. Valide em sandbox.
- No modo demo, "Baixar PDF" usa a impressão do navegador ("Salvar como PDF").
