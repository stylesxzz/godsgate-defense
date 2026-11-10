const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let activePage = "overview";
let adminEmail = "";
let paymentPoll = null;
let currentPaymentUri = "";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    showLogin();
    throw new Error(payload.error || "Sessão expirada.");
  }
  if (!response.ok) throw new Error(payload.error || `Falha HTTP ${response.status}`);
  return payload;
}

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add("hidden"), 3600);
}

function showLogin() {
  clearInterval(paymentPoll);
  $("#app").classList.add("hidden");
  $("#login-view").classList.remove("hidden");
  $("#payment-modal").classList.add("hidden");
}

function showApp(email) {
  adminEmail = email || adminEmail;
  $("#admin-email").textContent = adminEmail;
  $("#login-view").classList.add("hidden");
  $("#app").classList.remove("hidden");
  navigate("overview");
}

function statusBadge(status) {
  const labels = {
    active: "ATIVO", offline: "OFFLINE", renewal_due: "RENOVAÇÃO",
    pending: "PENDENTE", paid: "PAGO", expired: "EXPIRADO"
  };
  return `<span class="status status-${escapeHtml(status)}">${labels[status] || escapeHtml(status)}</span>`;
}

function dateLabel(value) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function agentRows(agents, limit = agents.length) {
  if (!agents.length) return '<div class="empty-state">Nenhum agente cadastrado até agora.</div>';
  return `<table class="data-table"><thead><tr><th>AGENTE</th><th>STATUS</th><th>ÚLTIMO SINAL</th><th>LICENÇA ATÉ</th><th>AÇÕES</th></tr></thead><tbody>${agents.slice(0, limit).map((agent) => `
    <tr>
      <td><span class="primary-cell">${escapeHtml(agent.name)}</span><span class="secondary-cell">${escapeHtml(agent.organization)} · ${escapeHtml(agent.hostname || "host não identificado")}</span></td>
      <td>${statusBadge(agent.status)}</td>
      <td>${dateLabel(agent.lastSeenAt)}<span class="secondary-cell">${escapeHtml(agent.lastIp || "IP ainda não reportado")}</span></td>
      <td>${dateLabel(agent.licenseExpiresAt)}</td>
      <td><div class="action-group"><button class="mini-btn" data-action="renew" data-id="${escapeHtml(agent.id)}">USDT $50</button><button class="mini-btn" data-action="enroll" data-id="${escapeHtml(agent.id)}">Instalar</button><button class="mini-btn danger" data-action="delete" data-id="${escapeHtml(agent.id)}">Excluir</button></div></td>
    </tr>`).join("")}</tbody></table>`;
}

function honeypotRows(events) {
  if (!events.length) return '<div class="empty-state">Nenhuma tentativa capturada no período.</div>';
  return `<table class="data-table"><thead><tr><th>DATA / HORA</th><th>IP DE ORIGEM</th><th>CAMINHO ISCA</th><th>MÉTODO</th><th>USER-AGENT</th></tr></thead><tbody>${events.map((event) => `
    <tr><td>${dateLabel(event.created_at)}</td><td class="mono">${escapeHtml(event.source_ip)}</td><td><span class="primary-cell red-text">${escapeHtml(event.request_path)}</span></td><td class="mono">${escapeHtml(event.method)}</td><td class="secondary-cell">${escapeHtml(event.user_agent || "não informado")}</td></tr>`).join("")}</tbody></table>`;
}

function paymentRows(payments) {
  if (!payments.length) return '<div class="empty-state">Nenhuma cobrança gerada ainda. Abra a aba Agentes e escolha “USDT $50” para criar uma renovação.</div>';
  return `<table class="data-table"><thead><tr><th>AGENTE</th><th>VALOR</th><th>STATUS</th><th>CRIADA EM</th><th>CONFIRMADA EM</th><th>TRANSAÇÃO</th></tr></thead><tbody>${payments.map((payment) => `
    <tr><td class="primary-cell">${escapeHtml(payment.agent_name)}</td><td class="mono">$ ${escapeHtml(payment.amount_usdt)} USDT</td><td>${statusBadge(payment.status)}</td><td>${dateLabel(payment.created_at)}</td><td>${dateLabel(payment.confirmed_at)}</td><td>${payment.signature ? `<a class="text-action" target="_blank" rel="noreferrer" href="https://solscan.io/tx/${encodeURIComponent(payment.signature)}">Solscan ↗</a>` : "—"}</td></tr>`).join("")}</tbody></table>`;
}

function activityRows(events) {
  if (!events.length) return '<div class="empty-state">Nenhuma rota-isca acionada.</div>';
  return events.map((event) => `<div class="activity-item"><span class="activity-icon">⌘</span><div><b>${escapeHtml(event.request_path)} <span class="muted">· ${escapeHtml(event.method)}</span></b><small>${escapeHtml(event.source_ip)} · ${dateLabel(event.created_at)}</small></div></div>`).join("");
}

async function loadOverview() {
  const data = await api("/api/admin/overview");
  const stats = data.stats;
  $("#stat-agents").textContent = stats.agents;
  $("#stat-active").textContent = stats.active;
  $("#stat-renewal").textContent = stats.renewalDue;
  $("#stat-honeypot").textContent = stats.honeypot24h;
  $("#nav-agent-count").textContent = stats.agents;
  $("#nav-honeypot-count").textContent = stats.honeypot24h;
  $("#overview-agents").innerHTML = agentRows(data.agents, 5);
  $("#overview-honeypot").innerHTML = activityRows(data.honeypot);
}

async function loadAgents() {
  const data = await api("/api/admin/agents");
  $("#agents-table").innerHTML = agentRows(data.agents);
  $("#agent-total").textContent = `${data.agents.length} REGISTROS`;
  $("#nav-agent-count").textContent = data.agents.length;
}

async function loadHoneypot() {
  const data = await api("/api/admin/honeypot?limit=200");
  $("#honeypot-table").innerHTML = honeypotRows(data.events);
  $("#nav-honeypot-count").textContent = data.events.length;
}

async function loadPayments() {
  const data = await api("/api/admin/payments");
  $("#payments-table").innerHTML = paymentRows(data.payments);
}

async function navigate(page) {
  activePage = page;
  clearInterval(paymentPoll);
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $$(".page").forEach((section) => section.classList.toggle("hidden", section.id !== `page-${page}`));
  const titles = { overview: "Visão geral", agents: "Agentes", honeypot: "Honeypot", payments: "Cobranças" };
  $("#page-title").textContent = titles[page] || "Console";
  try {
    if (page === "overview") await loadOverview();
    if (page === "agents") await loadAgents();
    if (page === "honeypot") await loadHoneypot();
    if (page === "payments") await loadPayments();
  } catch (error) {
    toast(error.message, true);
  }
}

function showEnrollment(data) {
  const panel = $("#enrollment-output");
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <b>INSCRIÇÃO DE USO ÚNICO · EXPIRA EM ${dateLabel(data.expiresAt)}</b>
    <p class="muted">Este link é válido por 1 hora e só pode ser utilizado uma vez. O token permanente será entregue apenas na primeira inscrição.</p>
    <code id="enroll-url">${escapeHtml(data.enrollmentUrl)}</code>
    <button class="mini-btn" data-copy="#enroll-url">Copiar URL de inscrição</button>
    <p class="secondary-cell">Linux / Debian / Ubuntu</p><code id="linux-command">${escapeHtml(data.linuxCommand)}</code>
    <button class="mini-btn" data-copy="#linux-command">Copiar comando Linux</button>
    <p class="secondary-cell">Windows PowerShell (executar como administrador)</p><code id="windows-command">${escapeHtml(data.windowsCommand)}</code>
    <button class="mini-btn" data-copy="#windows-command">Copiar comando Windows</button>`;
}

async function renewAgent(id) {
  const payment = await api(`/api/admin/agents/${encodeURIComponent(id)}/renewal`, { method: "POST" });
  currentPaymentUri = payment.solanaUrl;
  $("#payment-agent").textContent = `${payment.agentName} · cobrança expira em ${dateLabel(payment.expiresAt)}`;
  $("#payment-qr").src = payment.qrDataUrl;
  $("#payment-status").textContent = "Aguardando confirmação on-chain pela Helius…";
  $("#payment-modal").classList.remove("hidden");
  clearInterval(paymentPoll);
  const poll = async () => {
    try {
      const status = await api(`/api/admin/payments/${encodeURIComponent(payment.id)}`);
      if (status.status === "paid") {
        $("#payment-status").textContent = `Pagamento confirmado. Licença renovada até ${dateLabel(status.licenseExpiresAt)}.`;
        $("#payment-status").style.color = "var(--green)";
        clearInterval(paymentPoll);
        await loadAgents();
      } else if (status.status === "expired") {
        $("#payment-status").textContent = "QR expirado. Gere uma nova cobrança.";
        clearInterval(paymentPoll);
      } else if (status.verificationAvailable === false) {
        $("#payment-status").textContent = status.message || "Verificação Helius indisponível. Confira HELIUS_API_KEY.";
      }
    } catch (error) {
      $("#payment-status").textContent = error.message;
    }
  };
  await poll();
  paymentPoll = setInterval(poll, 7000);
}

async function createAgent(form) {
  const fields = new FormData(form);
  const data = await api("/api/admin/agents", {
    method: "POST",
    body: JSON.stringify({ name: fields.get("name"), organization: fields.get("organization") })
  });
  showEnrollment(data);
  form.reset();
  await loadAgents();
  toast("Agente cadastrado. Use o link de inscrição gerado.");
}

async function handleAgentAction(action, id) {
  if (action === "renew") return renewAgent(id);
  if (action === "enroll") {
    const data = await api(`/api/admin/agents/${encodeURIComponent(id)}/enrollment`, { method: "POST" });
    showEnrollment(data);
    $("#create-agent-card").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Novo código de instalação gerado.");
  }
  if (action === "delete") {
    if (!confirm("Excluir este agente? O token de acesso será revogado imediatamente. Esta ação não pode ser desfeita.")) return;
    await api(`/api/admin/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
    toast("Agente excluído e acesso revogado.");
    await loadAgents();
    if (activePage === "overview") await loadOverview();
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#login-error").classList.add("hidden");
  const form = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
    showApp(data.email);
  } catch (error) {
    $("#login-error").textContent = error.message;
    $("#login-error").classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
});

$("#logout-btn").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  showLogin();
});

$$(".nav-link").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
$$("[data-goto]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.goto)));
$("#refresh-btn").addEventListener("click", () => loadOverview().then(() => toast("Painel atualizado.")).catch((e) => toast(e.message, true)));
$("#refresh-honeypot").addEventListener("click", () => loadHoneypot().then(() => toast("Eventos atualizados.")).catch((e) => toast(e.message, true)));
$("#refresh-payments").addEventListener("click", () => loadPayments().then(() => toast("Cobranças atualizadas.")).catch((e) => toast(e.message, true)));
$("#show-create-agent").addEventListener("click", () => { $("#create-agent-card").classList.remove("hidden"); $("#enrollment-output").classList.add("hidden"); });
$("#close-create-agent").addEventListener("click", () => $("#create-agent-card").classList.add("hidden"));
$("#create-agent-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await createAgent(event.currentTarget); } catch (error) { toast(error.message, true); }
});

document.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    action.disabled = true;
    try { await handleAgentAction(action.dataset.action, action.dataset.id); }
    catch (error) { toast(error.message, true); }
    finally { action.disabled = false; }
  }
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    const element = $(copy.dataset.copy);
    if (element) {
      await navigator.clipboard.writeText(element.textContent);
      toast("Copiado para a área de transferência.");
    }
  }
});

$("#close-payment").addEventListener("click", () => { $("#payment-modal").classList.add("hidden"); clearInterval(paymentPoll); });
$("#payment-modal").addEventListener("click", (event) => {
  if (event.target.id === "payment-modal") { $("#payment-modal").classList.add("hidden"); clearInterval(paymentPoll); }
});
$("#copy-payment-uri").addEventListener("click", async () => {
  if (!currentPaymentUri) return;
  await navigator.clipboard.writeText(currentPaymentUri);
  toast("URI Solana Pay copiada.");
});

api("/api/auth/me").then((data) => showApp(data.username)).catch(() => showLogin());
setInterval(() => {
  if (!$("#app").classList.contains("hidden") && activePage === "overview") loadOverview().catch(() => {});
}, 20000);
