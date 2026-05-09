const STORE_KEY = "pretium_hogar_v1";
const AUTH_TOKEN_KEY = "pretium_hogar_token";
const AUTH_USER_KEY = "pretium_hogar_user";
const REMOTE_API_BASE = "https://pretiumarg.online/pretium-hogar/api";
const API_BASE = location.protocol === "file:" ? REMOTE_API_BASE : "api";
const API_STATE_URL = `${API_BASE}/state.php`;
const API_BACKUP_URL = `${API_BASE}/backup.php`;
const API_ADMIN_USERS_URL = `${API_BASE}/admin/users.php`;
const API_LOGIN_URL = `${API_BASE}/auth/login.php`;
const API_LOGOUT_URL = `${API_BASE}/auth/logout.php`;
const syncStatus = { text: "Sin configurar", type: "muted" };
let remoteReady = false;
let remoteSaveTimer = null;

const DEFAULT_CATEGORIES = {
  hogar: ["Alimentos", "Limpieza", "Farmacia", "Mascotas", "Ropa", "Ferreteria", "Salud", "Transporte", "Mantenimiento", "Ocio", "Deudas", "Regalos", "Varios"],
  servicio: ["Luz", "Gas", "Agua", "Internet", "Telefono", "Municipal", "Rentas", "Alquiler", "Expensas", "Seguro", "Suscripcion"],
  escuela: ["Cuota", "Matricula", "Utiles", "Uniforme", "Comedor", "Transporte escolar", "Excursion", "Actividad"]
};

const DEFAULT_SERVICES = [
  "Luz", "Gas", "Agua", "Internet", "Telefono", "Municipal", "Rentas",
  "Alquiler", "Expensas", "Seguro", "Suscripcion"
];

const state = loadState();
let currentView = "inicio";
let selectedMonth = monthKey(new Date());

function initialState() {
  return {
    settings: {
      homeName: "Mi hogar",
      currency: "$",
      theme: "light",
      budgetEnabled: false,
      monthlyBudget: 0,
      categoryBudgets: {}
    },
    categories: structuredClone(DEFAULT_CATEGORIES),
    expenses: [],
    recurring: [],
    children: []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    return {
      ...initialState(),
      ...parsed,
      settings: { ...initialState().settings, ...(parsed.settings || {}) },
      categories: normalizeCategories(parsed.categories),
      expenses: normalizeExpenses(parsed.expenses),
      recurring: normalizeRecurring(parsed.recurring, parsed.expenses),
      children: Array.isArray(parsed.children) ? parsed.children : []
    };
  } catch {
    return initialState();
  }
}

function normalizeCategories(categories) {
  if (!categories) return structuredClone(DEFAULT_CATEGORIES);
  if (Array.isArray(categories)) {
    return {
      ...structuredClone(DEFAULT_CATEGORIES),
      hogar: [...new Set([...DEFAULT_CATEGORIES.hogar, ...categories.filter(cat => cat && cat !== "Otros")])]
    };
  }
  return {
    hogar: [...new Set([...(categories.hogar || []), ...(categories.compra || []), ...(categories.otro || [])])].length
      ? [...new Set([...(categories.hogar || []), ...(categories.compra || []), ...(categories.otro || [])])]
      : DEFAULT_CATEGORIES.hogar,
    servicio: categories.servicio?.length ? categories.servicio : DEFAULT_CATEGORIES.servicio,
    escuela: categories.escuela?.length ? categories.escuela : DEFAULT_CATEGORIES.escuela
  };
}

function normalizeExpenses(expenses) {
  if (!Array.isArray(expenses)) return [];
  return expenses.map(item => ({
    ...item,
    type: ["general", "compra", "otro"].includes(item.type) ? "hogar" : (item.type || "hogar")
  }));
}

function normalizeRecurring(recurring, expenses) {
  if (Array.isArray(recurring)) {
    return recurring.map(item => ({
      ...item,
      type: ["general", "compra", "otro"].includes(item.type) ? "hogar" : (item.type || "hogar"),
      active: item.active !== false
    }));
  }
  return normalizeExpenses(expenses)
    .filter(item => item.recurring)
    .map(item => ({
      id: item.recurrenceId || uid(),
      description: item.description,
      category: item.category,
      type: item.type,
      amount: item.amount,
      dueDay: dayFromISO(item.dueDate || item.date),
      paymentMethod: item.paymentMethod || "",
      notes: item.notes || "",
      active: true,
      startMonth: monthKey(item.date || todayISO())
    }));
}

function splitLines(value) {
  return String(value || "").split("\n").map(item => item.trim()).filter(Boolean);
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  scheduleRemoteSave();
}

function saveStateLocalOnly() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
  } catch {
    return null;
  }
}

function isLoggedIn() {
  return Boolean(getAuthToken() && getAuthUser());
}

function isLocalPreview() {
  return ["localhost", "127.0.0.1"].includes(location.hostname);
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${getAuthToken()}`
  };
}

function setSyncStatus(text, type = "muted") {
  syncStatus.text = text;
  syncStatus.type = type;
  const el = document.getElementById("sync-status");
  if (el) {
    el.textContent = text;
    el.className = `badge ${type}`;
  }
}

function scheduleRemoteSave() {
  if (!remoteReady || !isLoggedIn()) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(() => saveRemoteState(), 700);
}

async function loadRemoteState({ force = false } = {}) {
  if (!isLoggedIn()) {
    remoteReady = false;
    setSyncStatus("Sin iniciar sesion");
    return;
  }
  setSyncStatus("Sincronizando...");
  try {
    const response = await fetch(API_STATE_URL, {
      headers: authHeaders(),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    remoteReady = true;
    if (data.state && typeof data.state === "object") {
      localStorage.setItem(STORE_KEY, JSON.stringify(data.state));
      Object.assign(state, loadState());
      setSyncStatus(`Servidor actualizado ${data.updated_at || ""}`.trim(), "ok");
      render();
      return;
    }
    if (force) await saveRemoteState(true);
    else {
      setSyncStatus("Servidor listo, sin datos", "ok");
      scheduleRemoteSave();
    }
  } catch {
    remoteReady = true;
    setSyncStatus("Sin conexion al servidor", "danger");
  }
}

async function saveRemoteState(showToast = false) {
  if (!isLoggedIn()) return;
  setSyncStatus("Guardando...");
  try {
    const response = await fetch(API_STATE_URL, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ state })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setSyncStatus(`Guardado ${data.updated_at || ""}`.trim(), "ok");
    if (showToast) toast("Datos guardados en servidor");
  } catch {
    setSyncStatus("No se pudo guardar en servidor", "danger");
    if (showToast) toast("No se pudo guardar en servidor");
  }
}

async function downloadServerBackup() {
  if (!isLoggedIn()) {
    toast("Inicia sesion para descargar backup");
    return;
  }
  try {
    const response = await fetch(API_BACKUP_URL, { headers: authHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo descargar backup");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pretium-hogar-backup-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    toast("No se pudo descargar backup del servidor");
  }
}

async function restoreBackup(imported) {
  localStorage.setItem(STORE_KEY, JSON.stringify(imported));
  Object.assign(state, loadState());
  if (isLoggedIn()) await saveRemoteState(true);
  toast("Datos importados");
  render();
}

async function adminUsersRequest(payload = null) {
  const options = { headers: authHeaders(), cache: "no-store" };
  if (payload) {
    options.method = "POST";
    options.headers = authHeaders({ "Content-Type": "application/json" });
    options.body = JSON.stringify(payload);
  }
  const response = await fetch(API_ADMIN_USERS_URL, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operacion");
  return data;
}

async function loadAdminUsers() {
  const target = document.getElementById("admin-users-list");
  if (!target) return;
  target.innerHTML = `<div class="empty">Cargando usuarios...</div>`;
  try {
    const data = await adminUsersRequest();
    target.innerHTML = renderAdminUsers(data.users || []);
  } catch (err) {
    target.innerHTML = `<div class="empty">${escapeHtml(err.message || "No se pudieron cargar usuarios")}</div>`;
  }
}

function renderAdminUsers(users) {
  if (!users.length) return `<div class="empty">Todavia no hay usuarios.</div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Ultimo ingreso</th><th></th></tr></thead>
    <tbody>${users.map(user => `
      <tr>
        <td><strong>${escapeHtml(user.display_name || user.username)}</strong><br><span class="muted">${escapeHtml(user.username)}</span></td>
        <td>${user.is_admin ? "Admin" : "Usuario"}</td>
        <td><span class="badge ${user.enabled ? "ok" : "danger"}">${user.enabled ? "Activo" : "Deshabilitado"}</span></td>
        <td>${escapeHtml(user.last_login || "Nunca")}</td>
        <td class="actions">
          <button class="btn" data-admin-password="${user.id}">Clave</button>
          <button class="btn ${user.enabled ? "danger" : ""}" data-admin-toggle="${user.id}" data-enabled="${user.enabled ? "0" : "1"}">${user.enabled ? "Deshabilitar" : "Activar"}</button>
        </td>
      </tr>
    `).join("")}</tbody>
  </table></div>`;
}

async function login(username, password) {
  const response = await fetch(API_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("El servidor PHP/MySQL no esta disponible para iniciar sesion");
  }
  if (!response.ok) throw new Error(data.error || "No se pudo iniciar sesion");
  localStorage.setItem(AUTH_TOKEN_KEY, data.token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
  remoteReady = true;
  setSyncStatus("Sesion iniciada", "ok");
  await loadRemoteState({ force: true });
}

async function logout() {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch(API_LOGOUT_URL, { method: "POST", headers: authHeaders() });
    } catch {
      // Si no hay conexion, limpiamos la sesion local igual.
    }
  }
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  remoteReady = false;
  setSyncStatus("Sin iniciar sesion");
}

function ensureRecurringForMonth(month = selectedMonth) {
  let created = 0;
  state.recurring
    .filter(item => item.active !== false && (!item.startMonth || item.startMonth <= month))
    .forEach(template => {
      const exists = state.expenses.some(expense => expense.recurrenceId === template.id && monthKey(expense.date || expense.dueDate) === month);
      if (exists) return;
      const dueDate = dateFromMonthDay(month, template.dueDay);
      state.expenses.push({
        id: uid(),
        date: dueDate,
        category: template.category,
        description: template.description,
        amount: Number(template.amount || 0),
        type: template.type,
        status: "pendiente",
        dueDate,
        paymentMethod: template.paymentMethod || "",
        recurring: true,
        recurrenceId: template.id,
        generated: true,
        notes: template.notes || ""
      });
      created += 1;
    });
  if (created) saveState();
  return created;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function money(value) {
  const n = Number(value || 0);
  return `${state.settings.currency || "$"} ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function asNumber(value) {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthOffset(key, offset) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + offset, 1));
}

function dateFromMonthDay(month, day) {
  const [year, rawMonth] = month.split("-").map(Number);
  const lastDay = new Date(year, rawMonth, 0).getDate();
  const safeDay = Math.min(Math.max(Number(day || 1), 1), lastDay);
  return `${year}-${String(rawMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function dayFromISO(iso) {
  if (!iso) return 1;
  const day = Number(String(iso).split("-")[2]);
  return Number.isFinite(day) && day > 0 ? day : 1;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

function byMonth(items, key = selectedMonth) {
  return items.filter(item => monthKey(item.date || item.dueDate || todayISO()) === key);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
}

function setTheme(theme) {
  state.settings.theme = theme;
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById("theme-btn");
  const icon = btn?.querySelector(".theme-toggle-icon");
  if (btn) {
    btn.title = theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
    btn.setAttribute("aria-label", btn.title);
    btn.classList.toggle("is-dark", theme === "dark");
  }
  if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
  saveState();
}

function toast(text) {
  const wrap = document.getElementById("toast-wrap");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function openModal(title, bodyHtml) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal").hidden = false;
}

function closeModal() {
  document.getElementById("modal").hidden = true;
  document.getElementById("modal-body").innerHTML = "";
}

function showLogin() {
  const overlay = document.getElementById("login-overlay");
  if (overlay) overlay.hidden = false;
  const demo = document.getElementById("demo-login-btn");
  if (demo) demo.hidden = !isLocalPreview();
  document.body.classList.add("login-open");
}

function hideLogin() {
  const overlay = document.getElementById("login-overlay");
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("login-open");
}

function totals(items) {
  return items.reduce((acc, item) => {
    const amount = Number(item.amount || 0);
    acc.total += amount;
    if (item.status === "pagado") acc.paid += amount;
    else acc.pending += amount;
    return acc;
  }, { total: 0, paid: 0, pending: 0 });
}

function monthExpenses() {
  return byMonth(state.expenses);
}

function categoryTotals(items = monthExpenses()) {
  const map = new Map();
  items.forEach(item => map.set(item.category, (map.get(item.category) || 0) + Number(item.amount || 0)));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function upcoming(items = state.expenses) {
  const today = todayISO();
  return items
    .filter(item => item.status !== "pagado" && item.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map(item => ({ ...item, overdue: item.dueDate < today }));
}

function render() {
  ensureRecurringForMonth(selectedMonth);
  renderMonthSelect();
  document.documentElement.dataset.theme = state.settings.theme;
  document.getElementById("page-title").textContent = viewTitle(currentView);
  document.getElementById("page-subtitle").textContent = viewSubtitle(currentView);
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  document.getElementById(`view-${currentView}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === currentView));

  const renderers = {
    inicio: renderHome,
    hogar: renderHomeExpenses,
    servicios: renderServices,
    escuela: renderSchool,
    vencimientos: renderDueDates,
    reportes: renderReports,
    config: renderConfig
  };
  renderers[currentView]();
}

function viewTitle(view) {
  return {
    inicio: "Inicio",
    hogar: "Gastos del hogar",
    servicios: "Servicios",
    escuela: "Escuela",
    vencimientos: "Vencimientos",
    reportes: "Reportes",
    config: "Configuracion"
  }[view];
}

function viewSubtitle(view) {
  return {
    inicio: "Resumen mensual del hogar",
    hogar: "Gastos variables y consumos cotidianos",
    servicios: "Impuestos, facturas y pagos recurrentes",
    escuela: "Gastos escolares por hijo",
    vencimientos: "Pendientes, vencidos y proximos pagos",
    reportes: "Lectura clara de los consumos",
    config: "Preferencias y datos"
  }[view];
}

function renderMonthSelect() {
  const select = document.getElementById("month-select");
  const current = monthKey(new Date());
  const months = new Set([selectedMonth, current, monthOffset(current, 1), monthOffset(current, 2)]);
  state.expenses.forEach(item => months.add(monthKey(item.date || item.dueDate || todayISO())));
  const sorted = [...months].sort().reverse();
  select.innerHTML = sorted.map(key => `<option value="${key}" ${key === selectedMonth ? "selected" : ""}>${monthLabel(key)}</option>`).join("");
}

function renderHome() {
  const items = monthExpenses();
  const t = totals(items);
  const cats = categoryTotals(items);
  const due = upcoming().slice(0, 5);
  const dueThisMonth = upcoming().filter(x => monthKey(x.dueDate) === selectedMonth).length;
  const budgetOn = state.settings.budgetEnabled;
  const budget = Number(state.settings.monthlyBudget || 0);
  const budgetLeft = budget - t.total;
  const top = cats[0];

  document.getElementById("view-inicio").innerHTML = `
    <section class="home-hero">
      <div>
        <p class="home-kicker">PRETIUM HOGAR</p>
        <h2>${escapeHtml(state.settings.homeName || "Mi hogar")}</h2>
        <p>${monthLabel(selectedMonth)} ordenado por consumos, servicios, escuela y vencimientos.</p>
      </div>
      <div class="home-hero-side">
        <span>Estado del mes</span>
        <strong>${dueThisMonth ? `${dueThisMonth} vencimientos` : "Sin vencimientos"}</strong>
        <small>${t.pending ? `${money(t.pending)} pendiente` : "Pagos al dia"}</small>
      </div>
    </section>
    <div class="grid cols-4">
      <div class="panel stat featured"><span>Total del mes</span><strong>${money(t.total)}</strong><small>${items.length} registros</small></div>
      <div class="panel stat"><span>Pagado</span><strong>${money(t.paid)}</strong><small>${percent(t.paid, t.total)} del total</small></div>
      <div class="panel stat"><span>Pendiente</span><strong>${money(t.pending)}</strong><small>${dueThisMonth} vencimientos</small></div>
      <div class="panel stat"><span>${budgetOn ? "Presupuesto restante" : "Mayor categoria"}</span><strong>${budgetOn ? money(budgetLeft) : escapeHtml(top?.[0] || "-")}</strong><small>${budgetOn ? budgetStatus(budgetLeft) : money(top?.[1] || 0)}</small></div>
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="panel">
        <div class="panel-head"><div><h2 class="panel-title">Categorias del mes</h2><p class="panel-sub">${monthLabel(selectedMonth)}</p></div></div>
        <div class="panel-body">${renderCategoryBars(cats)}</div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2 class="panel-title">Proximos vencimientos</h2><p class="panel-sub">Pagos pendientes</p></div></div>
        <div class="panel-body">${renderDueList(due)}</div>
      </div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head">
        <div><h2 class="panel-title">Ultimos movimientos</h2><p class="panel-sub">Registros recientes</p></div>
      </div>
      <div class="panel-body">${renderExpenseTable(items.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8), false)}</div>
    </div>
  `;
}

function percent(value, total) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function budgetStatus(value) {
  if (value >= 0) return "Disponible";
  return "Excedido";
}

function renderCategoryBars(cats) {
  if (!cats.length) return `<div class="empty"><strong>Sin consumos cargados</strong>Cuando registres movimientos, aca vas a ver el peso de cada categoria.</div>`;
  const max = Math.max(...cats.map(([, total]) => total), 1);
  return `<div class="list">${cats.map(([cat, total]) => `
    <div>
      <div class="row-item">
        <div><strong>${escapeHtml(cat)}</strong><span>${percent(total, cats.reduce((a, [, v]) => a + v, 0))}</span></div>
        <strong>${money(total)}</strong>
      </div>
      <div class="bar" aria-hidden="true"><span style="--w:${Math.max(4, Math.round((total / max) * 100))}%"></span></div>
    </div>
  `).join("")}</div>`;
}

function renderDueList(items) {
  if (!items.length) return `<div class="empty"><strong>Agenda sin pendientes</strong>No hay pagos vencidos ni proximos para mostrar.</div>`;
  return `<div class="list">${items.map(item => `
    <div class="row-item">
      <div>
        <strong>${escapeHtml(item.description)}</strong>
        <span>${escapeHtml(item.category)} · vence ${formatDate(item.dueDate)}</span>
      </div>
      <div>
        <strong>${money(item.amount)}</strong>
        <span class="badge ${item.overdue ? "danger" : "warn"}">${item.overdue ? "Vencido" : "Pendiente"}</span>
      </div>
    </div>
  `).join("")}</div>`;
}

function formatDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function expenseFormHtml(prefill = {}) {
  const type = prefill.type || "hogar";
  const lockType = Boolean(prefill.lockType);
  return `
    <form id="expense-form" class="form-grid">
      <label class="label">Fecha<input class="field" type="date" name="date" value="${prefill.date || todayISO()}" required></label>
      ${lockType ? `<input type="hidden" name="type" value="${escapeHtml(type)}">` : `<label class="label">Tipo<select class="field" name="type">${typeOptions(type)}</select></label>`}
      <label class="label">Categoria<select class="field" name="category">${categoryOptions(type, prefill.category)}</select></label>
      <label class="label">Monto<input class="field" type="number" name="amount" min="0" step="0.01" value="${prefill.amount || ""}" required></label>
      <label class="label wide">Descripcion<input class="field" name="description" value="${escapeHtml(prefill.description || "")}" placeholder="Ej: Luz, supermercado, cuota escolar" required></label>
      <label class="label">Estado<select class="field" name="status">${statusOptions(prefill.status || "pagado")}</select></label>
      <label class="label">Vencimiento<input class="field" type="date" name="dueDate" value="${prefill.dueDate || ""}"></label>
      <label class="label">Medio de pago<input class="field" name="paymentMethod" value="${escapeHtml(prefill.paymentMethod || "")}" placeholder="Efectivo, debito, transferencia"></label>
      <label class="label">Recurrente<select class="field" name="recurring"><option value="no">No</option><option value="si" ${prefill.recurring ? "selected" : ""}>Si</option></select></label>
      <label class="label full">Notas<textarea class="field" name="notes">${escapeHtml(prefill.notes || "")}</textarea></label>
      <div class="full btn-row">
        <button class="btn primary" type="submit">Guardar</button>
        <button class="btn" type="reset">Limpiar</button>
      </div>
    </form>
  `;
}

function categoryOptions(type, selected) {
  const list = state.categories[type] || state.categories.hogar || [];
  const options = list
    .map(cat => `<option value="${escapeHtml(cat)}" ${cat === selected ? "selected" : ""}>${escapeHtml(cat)}</option>`)
    .join("");
  return `${options}<option value="__add_category__">+ Agregar categoria...</option>`;
}

function typeOptions(selected) {
  const options = {
    hogar: "Gasto del hogar",
    servicio: "Servicio",
    escuela: "Escuela"
  };
  return Object.entries(options).map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function statusOptions(selected) {
  return ["pagado", "pendiente"].map(value => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function renderExpenseTable(items, allowActions) {
  if (!items.length) return `<div class="empty"><strong>No hay registros</strong>Los movimientos que cargues para este mes van a aparecer aca.</div>`;
  const rows = items
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .map(item => `
      <tr>
        <td data-label="Fecha">${formatDate(item.date)}</td>
        <td data-label="Detalle"><strong>${escapeHtml(item.description)}</strong><br><span class="muted">${escapeHtml(item.paymentMethod || "")}</span></td>
        <td data-label="Categoria">${escapeHtml(item.category)}</td>
        <td data-label="Tipo"><span class="badge">${labelType(item.type)}</span></td>
        <td data-label="Monto">${money(item.amount)}</td>
        <td data-label="Estado"><span class="badge ${item.status === "pagado" ? "ok" : "warn"}">${item.status}</span></td>
        <td data-label="Vence">${item.dueDate ? formatDate(item.dueDate) : "-"}</td>
        ${allowActions ? `<td class="actions" data-label="Acciones"><button class="btn" data-edit="${item.id}">Editar</button> <button class="btn" data-paid="${item.id}">Pagar</button> <button class="btn danger" data-del="${item.id}">Borrar</button></td>` : ""}
      </tr>
    `).join("");
  return `<div class="table-wrap"><table>
    <thead><tr><th>Fecha</th><th>Detalle</th><th>Categoria</th><th>Tipo</th><th>Monto</th><th>Estado</th><th>Vence</th>${allowActions ? "<th></th>" : ""}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function editExpenseFormHtml(item) {
  return `
    <form id="edit-expense-form" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(item.id)}">
      <label class="label">Fecha<input class="field" type="date" name="date" value="${escapeHtml(item.date || todayISO())}" required></label>
      <label class="label">Tipo<select class="field" name="type">${typeOptions(item.type || "hogar")}</select></label>
      <label class="label">Categoria<select class="field" name="category">${categoryOptions(item.type || "hogar", item.category)}</select></label>
      <label class="label">Monto<input class="field" type="number" name="amount" min="0" step="0.01" value="${escapeHtml(item.amount)}" required></label>
      <label class="label wide">Descripcion<input class="field" name="description" value="${escapeHtml(item.description)}" required></label>
      <label class="label">Estado<select class="field" name="status">${statusOptions(item.status || "pagado")}</select></label>
      <label class="label">Vencimiento<input class="field" type="date" name="dueDate" value="${escapeHtml(item.dueDate || "")}"></label>
      <label class="label">Medio de pago<input class="field" name="paymentMethod" value="${escapeHtml(item.paymentMethod || "")}"></label>
      ${item.recurrenceId ? `
        <label class="label full switch-line">
          <span><strong>Actualizar recurrente</strong><span>Aplicar descripcion, categoria, monto, vencimiento y medio de pago a los proximos meses.</span></span>
          <input type="checkbox" name="updateRecurring">
        </label>
      ` : ""}
      <label class="label full">Notas<textarea class="field" name="notes">${escapeHtml(item.notes || "")}</textarea></label>
      <div class="full btn-row">
        <button class="btn primary" type="submit">Guardar cambios</button>
        <button class="btn" type="button" data-modal-close>Cancelar</button>
      </div>
    </form>
  `;
}

function labelType(type) {
  return { hogar: "Hogar", servicio: "Servicio", escuela: "Escuela" }[type] || "Hogar";
}

function renderHomeExpenses() {
  const items = monthExpenses().filter(item => item.type === "hogar");
  const top = categoryTotals(items)[0];
  document.getElementById("view-hogar").innerHTML = `
    <div class="grid cols-3">
      <div class="panel stat"><span>Gastos del hogar</span><strong>${money(totals(items).total)}</strong><small>${items.length} registros</small></div>
      <div class="panel stat"><span>Promedio</span><strong>${money(items.length ? totals(items).total / items.length : 0)}</strong><small>por registro</small></div>
      <div class="panel stat"><span>Mayor categoria</span><strong>${escapeHtml(top?.[0] || "-")}</strong><small>${money(top?.[1] || 0)}</small></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2 class="panel-title">Registrar gasto del hogar</h2><p class="panel-sub">Alimentos, limpieza, salud, transporte, mantenimiento, ocio o varios</p></div></div>
      <div class="panel-body">${expenseFormHtml({ type: "hogar", category: state.categories.hogar[0], lockType: true })}</div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2 class="panel-title">Historial de gastos del hogar</h2><p class="panel-sub">${monthLabel(selectedMonth)}</p></div></div>
      <div class="panel-body">${renderExpenseTable(items, true)}</div>
    </div>
  `;
}

function renderServices() {
  const items = monthExpenses().filter(item => item.type === "servicio");
  const activeRecurring = state.recurring.filter(item => item.active !== false);
  document.getElementById("view-servicios").innerHTML = `
    <div class="grid cols-3">
      <div class="panel stat"><span>Servicios del mes</span><strong>${money(totals(items).total)}</strong><small>${items.length} registros</small></div>
      <div class="panel stat"><span>Recurrentes activos</span><strong>${activeRecurring.length}</strong><small>se generan por mes</small></div>
      <div class="panel stat"><span>Pendiente</span><strong>${money(totals(items).pending)}</strong><small>por pagar</small></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2 class="panel-title">Nuevo servicio o impuesto</h2><p class="panel-sub">Luz, gas, agua, internet, alquiler, expensas e impuestos</p></div></div>
      <div class="panel-body">
        <div class="btn-row" style="margin-bottom:12px">${DEFAULT_SERVICES.map(name => `<button class="btn" data-service="${name}">${name}</button>`).join("")}</div>
        ${expenseFormHtml({ type: "servicio", category: state.categories.servicio[0], status: "pendiente", lockType: true })}
      </div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2 class="panel-title">Recurrentes</h2><p class="panel-sub">Suscripciones, alquiler, internet y pagos mensuales</p></div></div>
      <div class="panel-body">${renderRecurringList()}</div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2 class="panel-title">Servicios del mes</h2><p class="panel-sub">${monthLabel(selectedMonth)}</p></div></div>
      <div class="panel-body">${renderExpenseTable(items, true)}</div>
    </div>
  `;
}

function renderRecurringList() {
  if (!state.recurring.length) return `<div class="empty"><strong>Sin pagos recurrentes</strong>Marcá "Recurrente: Si" al cargar un servicio o suscripcion.</div>`;
  return `<div class="table-wrap"><table>
    <thead><tr><th>Detalle</th><th>Categoria</th><th>Monto</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
    <tbody>${state.recurring.map(item => `
      <tr>
        <td data-label="Detalle"><strong>${escapeHtml(item.description)}</strong><br><span class="muted">${escapeHtml(labelType(item.type))}</span></td>
        <td data-label="Categoria">${escapeHtml(item.category)}</td>
        <td data-label="Monto">${money(item.amount)}</td>
        <td data-label="Vence">dia ${item.dueDay || 1}</td>
        <td data-label="Estado"><span class="badge ${item.active === false ? "danger" : "ok"}">${item.active === false ? "Pausado" : "Activo"}</span></td>
        <td class="actions" data-label="Acciones"><button class="btn" data-recurring-generate="${item.id}">Generar mes</button> <button class="btn" data-recurring-toggle="${item.id}">${item.active === false ? "Activar" : "Pausar"}</button></td>
      </tr>
    `).join("")}</tbody>
  </table></div>`;
}

function renderSchool() {
  const schoolItems = monthExpenses().filter(item => item.type === "escuela");
  document.getElementById("view-escuela").innerHTML = `
    <div class="grid cols-2">
      <div class="panel">
        <div class="panel-head"><div><h2 class="panel-title">Hijos</h2><p class="panel-sub">Datos escolares</p></div></div>
        <div class="panel-body">
          <form id="child-form" class="form-grid">
            <label class="label">Nombre<input class="field" name="name" required></label>
            <label class="label">Escuela<input class="field" name="school"></label>
            <label class="label">Curso<input class="field" name="grade"></label>
            <div class="full"><button class="btn primary">Agregar hijo</button></div>
          </form>
          <div style="margin-top:14px">${renderChildren()}</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2 class="panel-title">Gasto escolar</h2><p class="panel-sub">Cuotas, utiles, uniforme, comedor y actividades</p></div></div>
        <div class="panel-body">${schoolExpenseForm()}</div>
      </div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2 class="panel-title">Gastos escolares del mes</h2><p class="panel-sub">${money(totals(schoolItems).total)} en ${schoolItems.length} registros</p></div></div>
      <div class="panel-body">${renderExpenseTable(schoolItems, true)}</div>
    </div>
  `;
}

function renderChildren() {
  if (!state.children.length) return `<div class="empty"><strong>Sin hijos cargados</strong>Cuando agregues hijos, podras separar los gastos escolares por cada uno.</div>`;
  return `<div class="list">${state.children.map(child => `
    <div class="row-item">
      <div><strong>${escapeHtml(child.name)}</strong><span>${escapeHtml(child.school || "Sin escuela")} · ${escapeHtml(child.grade || "Sin curso")}</span></div>
      <button class="btn danger" data-del-child="${child.id}">Borrar</button>
    </div>
  `).join("")}</div>`;
}

function schoolExpenseForm() {
  const childOptions = state.children.map(child => `<option value="${escapeHtml(child.name)}">${escapeHtml(child.name)}</option>`).join("");
  return `
    <form id="school-expense-form" class="form-grid">
      <label class="label">Fecha<input class="field" type="date" name="date" value="${todayISO()}" required></label>
      <label class="label">Hijo<select class="field" name="child"><option value="">Gasto General</option>${childOptions}</select></label>
      <label class="label">Monto<input class="field" type="number" name="amount" min="0" step="0.01" required></label>
      <label class="label wide">Concepto<input class="field" name="description" placeholder="Cuota, uniforme, utiles, excursion" required></label>
      <label class="label">Estado<select class="field" name="status">${statusOptions("pagado")}</select></label>
      <label class="label">Vencimiento<input class="field" type="date" name="dueDate"></label>
      <div class="full"><button class="btn primary">Guardar gasto escolar</button></div>
    </form>
  `;
}

function renderDueDates() {
  const items = upcoming();
  const overdue = items.filter(item => item.overdue);
  document.getElementById("view-vencimientos").innerHTML = `
    <div class="grid cols-3">
      <div class="panel stat"><span>Pendientes</span><strong>${money(totals(items).pending)}</strong><small>${items.length} pagos</small></div>
      <div class="panel stat"><span>Vencidos</span><strong>${overdue.length}</strong><small>${money(totals(overdue).pending)}</small></div>
      <div class="panel stat"><span>Proximo</span><strong>${items[0] ? formatDate(items[0].dueDate) : "-"}</strong><small>${escapeHtml(items[0]?.description || "Sin pagos")}</small></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2 class="panel-title">Agenda de pagos</h2><p class="panel-sub">Pendientes ordenados por fecha</p></div></div>
      <div class="panel-body">${renderExpenseTable(items, true)}</div>
    </div>
  `;
}

function renderReports() {
  const current = monthExpenses();
  const previousKey = previousMonth(selectedMonth);
  const previous = byMonth(state.expenses, previousKey);
  const currentTotal = totals(current).total;
  const previousTotal = totals(previous).total;
  const diff = currentTotal - previousTotal;
  const fixed = current.filter(item => item.recurring || item.type === "servicio");
  const variable = current.filter(item => !fixed.includes(item));

  document.getElementById("view-reportes").innerHTML = `
    <div class="grid cols-4">
      <div class="panel stat"><span>Mes actual</span><strong>${money(currentTotal)}</strong><small>${monthLabel(selectedMonth)}</small></div>
      <div class="panel stat"><span>Mes anterior</span><strong>${money(previousTotal)}</strong><small>${monthLabel(previousKey)}</small></div>
      <div class="panel stat"><span>Diferencia</span><strong>${money(diff)}</strong><small>${diff >= 0 ? "Aumento" : "Baja"}</small></div>
      <div class="panel stat"><span>Fijos vs variables</span><strong>${percent(totals(fixed).total, currentTotal)}</strong><small>${money(totals(variable).total)} variables</small></div>
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="panel"><div class="panel-head"><div><h2 class="panel-title">Por categoria</h2><p class="panel-sub">${monthLabel(selectedMonth)}</p></div></div><div class="panel-body">${renderCategoryBars(categoryTotals(current))}</div></div>
      <div class="panel"><div class="panel-head"><div><h2 class="panel-title">Por tipo</h2><p class="panel-sub">Hogar, servicios y escuela</p></div></div><div class="panel-body">${renderCategoryBars(typeTotals(current))}</div></div>
    </div>
  `;
}

function previousMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 2, 1));
}

function typeTotals(items) {
  const labels = { hogar: "Gastos del hogar", servicio: "Servicios", escuela: "Escuela" };
  const map = new Map();
  items.forEach(item => map.set(labels[item.type] || "Gastos del hogar", (map.get(labels[item.type] || "Gastos del hogar") || 0) + Number(item.amount || 0)));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function renderConfig() {
  const user = getAuthUser();
  document.getElementById("view-config").innerHTML = `
    <div class="grid cols-2">
      <div class="panel">
        <div class="panel-head"><div><h2 class="panel-title">Datos del hogar</h2><p class="panel-sub">Preferencias generales</p></div></div>
        <div class="panel-body">
          <form id="settings-form" class="form-grid">
            <label class="label wide">Nombre del hogar<input class="field" name="homeName" value="${escapeHtml(state.settings.homeName)}"></label>
            <label class="label">Moneda<input class="field" name="currency" value="${escapeHtml(state.settings.currency)}"></label>
            <label class="label full">Categorias de gastos del hogar<textarea class="field" name="cat_hogar">${escapeHtml(state.categories.hogar.join("\n"))}</textarea></label>
            <label class="label full">Categorias de servicios<textarea class="field" name="cat_servicio">${escapeHtml(state.categories.servicio.join("\n"))}</textarea></label>
            <label class="label full">Categorias de escuela<textarea class="field" name="cat_escuela">${escapeHtml(state.categories.escuela.join("\n"))}</textarea></label>
            <div class="full"><button class="btn primary">Guardar configuracion</button></div>
          </form>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2 class="panel-title">Presupuesto opcional</h2><p class="panel-sub">La app funciona aunque este apagado</p></div></div>
        <div class="panel-body">
          <form id="budget-form" class="grid">
            <div class="switch-line">
              <div><strong>Control de presupuesto</strong><br><span class="muted">Comparar gastos contra limites mensuales</span></div>
              <input type="checkbox" name="budgetEnabled" ${state.settings.budgetEnabled ? "checked" : ""}>
            </div>
            <label class="label">Presupuesto mensual general<input class="field" type="number" name="monthlyBudget" value="${state.settings.monthlyBudget || ""}" min="0" step="0.01"></label>
            <div class="btn-row"><button class="btn primary">Guardar presupuesto</button></div>
          </form>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2 class="panel-title">Datos</h2><p class="panel-sub">Respaldo local y servidor</p></div></div>
      <div class="panel-body">
        <div class="row-item" style="margin-bottom:14px">
          <div>
            <strong>${user ? escapeHtml(user.display_name || user.username) : "Sin iniciar sesion"}</strong>
            <span id="sync-status" class="badge ${syncStatus.type}">${escapeHtml(syncStatus.text)}</span>
          </div>
          <div class="btn-row">
            <button class="btn" type="button" id="sync-now-btn" ${user ? "" : "disabled"}>Subir datos</button>
            <button class="btn" type="button" id="sync-pull-btn" ${user ? "" : "disabled"}>Traer datos</button>
            <button class="btn danger" type="button" id="logout-btn" ${user ? "" : "disabled"}>Salir</button>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn" id="export-btn">Exportar JSON</button>
          <button class="btn" id="server-backup-btn" ${user ? "" : "disabled"}>Backup servidor</button>
          <label class="btn">Importar JSON<input id="import-input" type="file" accept="application/json" hidden></label>
          <button class="btn danger" id="clear-btn">Borrar datos</button>
        </div>
      </div>
    </div>
    ${user?.is_admin ? `
      <div class="panel" style="margin-top:14px">
        <div class="panel-head"><div><h2 class="panel-title">Usuarios</h2><p class="panel-sub">Cuentas con acceso a PRETIUM HOGAR</p></div></div>
        <div class="panel-body">
          <form id="admin-user-form" class="form-grid">
            <label class="label">Usuario<input class="field" name="username" autocomplete="off" required></label>
            <label class="label">Nombre<input class="field" name="display_name" autocomplete="off"></label>
            <label class="label">Contraseña<input class="field" type="password" name="password" autocomplete="new-password" required></label>
            <label class="switch-line full">
              <span><strong>Administrador</strong><br><span class="muted">Puede crear y administrar usuarios</span></span>
              <input type="checkbox" name="is_admin">
            </label>
            <div class="full"><button class="btn primary">Crear usuario</button></div>
          </form>
          <div id="admin-users-list" style="margin-top:14px"></div>
        </div>
      </div>
    ` : ""}
  `;
  if (user?.is_admin) setTimeout(loadAdminUsers, 0);
}

function addExpenseFromForm(form, extra = {}) {
  const fd = new FormData(form);
  const selectedCategory = fd.get("category") || "Sin categoria";
  const isRecurring = fd.get("recurring") === "si" || Boolean(extra.recurring);
  const recurrenceId = isRecurring ? uid() : "";
  const expense = {
    id: uid(),
    date: fd.get("date") || todayISO(),
    category: selectedCategory,
    description: String(fd.get("description") || "").trim(),
    amount: asNumber(fd.get("amount")),
    type: fd.get("type") || extra.type || "hogar",
    status: fd.get("status") || "pagado",
    dueDate: fd.get("dueDate") || "",
    paymentMethod: fd.get("paymentMethod") || "",
    recurring: isRecurring,
    recurrenceId,
    notes: fd.get("notes") || "",
    child: extra.child || ""
  };
  if (!expense.description || expense.amount <= 0) {
    toast("Completa descripcion y monto");
    return false;
  }
  if (isRecurring) {
    state.recurring.push({
      id: recurrenceId,
      description: expense.description,
      category: expense.category,
      type: expense.type,
      amount: expense.amount,
      dueDay: dayFromISO(expense.dueDate || expense.date),
      paymentMethod: expense.paymentMethod,
      notes: expense.notes,
      active: true,
      startMonth: monthKey(expense.date)
    });
  }
  state.expenses.push(expense);
  selectedMonth = monthKey(expense.date);
  saveState();
  toast("Gasto guardado");
  render();
  return true;
}

function updateExpenseFromForm(form) {
  const fd = new FormData(form);
  const id = fd.get("id");
  const item = state.expenses.find(expense => expense.id === id);
  if (!item) return;
  item.date = fd.get("date") || todayISO();
  item.type = fd.get("type") || "hogar";
  item.category = fd.get("category") || "Sin categoria";
  item.description = String(fd.get("description") || "").trim();
  item.amount = asNumber(fd.get("amount"));
  item.status = fd.get("status") || "pagado";
  item.dueDate = fd.get("dueDate") || "";
  item.paymentMethod = fd.get("paymentMethod") || "";
  item.notes = fd.get("notes") || "";
  if (!item.description || item.amount <= 0) {
    toast("Completa descripcion y monto");
    return;
  }
  if (item.recurrenceId && fd.get("updateRecurring")) {
    const recurring = state.recurring.find(template => template.id === item.recurrenceId);
    if (recurring) {
      recurring.description = item.description;
      recurring.type = item.type;
      recurring.category = item.category;
      recurring.amount = item.amount;
      recurring.dueDay = dayFromISO(item.dueDate || item.date);
      recurring.paymentMethod = item.paymentMethod;
      recurring.notes = item.notes;
      recurring.active = true;
    }
  }
  selectedMonth = monthKey(item.date);
  saveState();
  closeModal();
  toast("Movimiento actualizado");
  render();
}

function generateRecurringForCurrentMonth(id) {
  const template = state.recurring.find(item => item.id === id);
  if (!template) return;
  const exists = state.expenses.some(expense => expense.recurrenceId === template.id && monthKey(expense.date || expense.dueDate) === selectedMonth);
  if (exists) {
    toast("Ese recurrente ya existe en este mes");
    return;
  }
  const dueDate = dateFromMonthDay(selectedMonth, template.dueDay);
  state.expenses.push({
    id: uid(),
    date: dueDate,
    category: template.category,
    description: template.description,
    amount: Number(template.amount || 0),
    type: template.type,
    status: "pendiente",
    dueDate,
    paymentMethod: template.paymentMethod || "",
    recurring: true,
    recurrenceId: template.id,
    generated: true,
    notes: template.notes || ""
  });
  saveState();
  toast("Recurrente generado para el mes");
  render();
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pretium-hogar-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("click", event => {
  const nav = event.target.closest("[data-view]");
  if (nav) {
    currentView = nav.dataset.view;
    document.body.classList.remove("menu-open");
    render();
    return;
  }
  const go = event.target.closest("[data-go]");
  if (go) {
    currentView = go.dataset.go;
    render();
    return;
  }
  const del = event.target.closest("[data-del]");
  if (del) {
    const item = state.expenses.find(expense => expense.id === del.dataset.del);
    if (item?.recurrenceId && confirm("¿Tambien queres pausar este recurrente para los proximos meses?")) {
      const recurring = state.recurring.find(template => template.id === item.recurrenceId);
      if (recurring) recurring.active = false;
    }
    state.expenses = state.expenses.filter(expense => expense.id !== del.dataset.del);
    saveState();
    toast("Registro borrado");
    render();
    return;
  }
  const edit = event.target.closest("[data-edit]");
  if (edit) {
    const item = state.expenses.find(expense => expense.id === edit.dataset.edit);
    if (item) openModal("Editar movimiento", editExpenseFormHtml(item));
    return;
  }
  const paid = event.target.closest("[data-paid]");
  if (paid) {
    const item = state.expenses.find(x => x.id === paid.dataset.paid);
    if (item) item.status = "pagado";
    saveState();
    render();
    return;
  }
  const service = event.target.closest("[data-service]");
  if (service) {
    const input = document.querySelector("[name='description']");
    if (input) input.value = service.dataset.service;
    return;
  }
  const delChild = event.target.closest("[data-del-child]");
  if (delChild) {
    state.children = state.children.filter(child => child.id !== delChild.dataset.delChild);
    saveState();
    render();
    return;
  }
  const recurringToggle = event.target.closest("[data-recurring-toggle]");
  if (recurringToggle) {
    const item = state.recurring.find(template => template.id === recurringToggle.dataset.recurringToggle);
    if (item) item.active = item.active === false;
    saveState();
    render();
    return;
  }
  const recurringGenerate = event.target.closest("[data-recurring-generate]");
  if (recurringGenerate) {
    generateRecurringForCurrentMonth(recurringGenerate.dataset.recurringGenerate);
    return;
  }
  if (event.target.closest("[data-modal-close]") || event.target.id === "modal-close") {
    closeModal();
    return;
  }
  if (event.target.id === "menu-btn") document.body.classList.toggle("menu-open");
  if (event.target.id === "theme-btn") setTheme(state.settings.theme === "dark" ? "light" : "dark");
  if (event.target.id === "export-btn") downloadJson();
  if (event.target.id === "server-backup-btn") downloadServerBackup();
  if (event.target.id === "sync-now-btn") saveRemoteState(true);
  if (event.target.id === "sync-pull-btn" && confirm("Esto reemplaza los datos locales con lo guardado en el servidor.")) loadRemoteState();
  if (event.target.id === "logout-btn") {
    logout().then(() => {
      toast("Sesion cerrada");
      showLogin();
      render();
    });
  }
  if (event.target.id === "demo-login-btn") {
    localStorage.setItem(AUTH_TOKEN_KEY, "demo-local");
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify({
      id: 0,
      username: "demo",
      display_name: "Demo local",
      is_admin: true
    }));
    remoteReady = false;
    setSyncStatus("Demo local");
    hideLogin();
    toast("Entraste en demo local");
    render();
    return;
  }
  const adminToggle = event.target.closest("[data-admin-toggle]");
  if (adminToggle) {
    adminUsersRequest({
      action: "toggle",
      id: adminToggle.dataset.adminToggle,
      enabled: adminToggle.dataset.enabled === "1"
    }).then(() => {
      toast("Usuario actualizado");
      loadAdminUsers();
    }).catch(err => toast(err.message || "No se pudo actualizar usuario"));
    return;
  }
  const adminPassword = event.target.closest("[data-admin-password]");
  if (adminPassword) {
    const password = prompt("Nueva contraseña:");
    if (!password) return;
    adminUsersRequest({
      action: "password",
      id: adminPassword.dataset.adminPassword,
      password
    }).then(() => {
      toast("Contraseña actualizada");
    }).catch(err => toast(err.message || "No se pudo actualizar contraseña"));
    return;
  }
  if (event.target.id === "clear-btn" && confirm("Esto borra los datos locales de PRETIUM HOGAR.")) {
    localStorage.removeItem(STORE_KEY);
    Object.assign(state, initialState());
    render();
  }
});

document.addEventListener("submit", event => {
  if (event.target.id === "login-form") {
    event.preventDefault();
    const error = document.getElementById("login-error");
    const button = document.getElementById("login-submit");
    const fd = new FormData(event.target);
    if (error) error.hidden = true;
    if (button) button.disabled = true;
    login(fd.get("username"), fd.get("password"))
      .then(() => {
        hideLogin();
        toast("Sesion iniciada");
        render();
      })
      .catch(err => {
        if (error) {
          error.textContent = err.message || "No se pudo iniciar sesion";
          error.hidden = false;
        }
      })
      .finally(() => {
        if (button) button.disabled = false;
      });
    return;
  }
  if (event.target.id === "expense-form") {
    event.preventDefault();
    addExpenseFromForm(event.target);
  }
  if (event.target.id === "edit-expense-form") {
    event.preventDefault();
    updateExpenseFromForm(event.target);
  }
  if (event.target.id === "child-form") {
    event.preventDefault();
    const fd = new FormData(event.target);
    const name = String(fd.get("name") || "").trim();
    if (!name) return;
    state.children.push({ id: uid(), name, school: fd.get("school") || "", grade: fd.get("grade") || "" });
    saveState();
    toast("Hijo agregado");
    render();
  }
  if (event.target.id === "school-expense-form") {
    event.preventDefault();
    const fd = new FormData(event.target);
    const child = fd.get("child") || "";
    const desc = `${fd.get("description")}${child ? ` - ${child}` : ""}`;
    const wrapper = document.createElement("form");
    wrapper.innerHTML = `
      <input name="date" value="${escapeHtml(fd.get("date"))}">
      <input name="category" value="${escapeHtml(state.categories.escuela[0] || "Cuota")}">
      <input name="description" value="${escapeHtml(desc)}">
      <input name="amount" value="${escapeHtml(fd.get("amount"))}">
      <input name="type" value="escuela">
      <input name="status" value="${escapeHtml(fd.get("status"))}">
      <input name="dueDate" value="${escapeHtml(fd.get("dueDate"))}">
    `;
    addExpenseFromForm(wrapper, { type: "escuela", child });
  }
  if (event.target.id === "settings-form") {
    event.preventDefault();
    const fd = new FormData(event.target);
    state.settings.homeName = String(fd.get("homeName") || "Mi hogar").trim();
    state.settings.currency = String(fd.get("currency") || "$").trim();
    state.categories = normalizeCategories({
      hogar: splitLines(fd.get("cat_hogar")),
      servicio: splitLines(fd.get("cat_servicio")),
      escuela: splitLines(fd.get("cat_escuela"))
    });
    saveState();
    toast("Configuracion guardada");
    render();
  }
  if (event.target.id === "budget-form") {
    event.preventDefault();
    const fd = new FormData(event.target);
    state.settings.budgetEnabled = Boolean(fd.get("budgetEnabled"));
    state.settings.monthlyBudget = asNumber(fd.get("monthlyBudget"));
    saveState();
    toast("Presupuesto actualizado");
    render();
  }
  if (event.target.id === "admin-user-form") {
    event.preventDefault();
    const fd = new FormData(event.target);
    adminUsersRequest({
      action: "create",
      username: fd.get("username"),
      display_name: fd.get("display_name"),
      password: fd.get("password"),
      is_admin: Boolean(fd.get("is_admin"))
    }).then(() => {
      event.target.reset();
      toast("Usuario creado");
      loadAdminUsers();
    }).catch(err => toast(err.message || "No se pudo crear usuario"));
  }
});

document.addEventListener("change", event => {
  if (event.target.name === "type") {
    const form = event.target.closest("form");
    const category = form?.querySelector("[name='category']");
    if (category) category.innerHTML = categoryOptions(event.target.value, "");
  }
  if (event.target.name === "category" && event.target.value === "__add_category__") {
    const form = event.target.closest("form");
    const type = form?.querySelector("[name='type']")?.value || "hogar";
    const name = prompt("Nombre de la nueva categoria:");
    const clean = String(name || "").trim();
    if (!clean) {
      event.target.value = state.categories[type]?.[0] || "Sin categoria";
      return;
    }
    if (!state.categories[type]) state.categories[type] = [];
    if (!state.categories[type].includes(clean)) {
      state.categories[type].push(clean);
      saveState();
    }
    const option = document.createElement("option");
    option.value = clean;
    option.textContent = clean;
    event.target.insertBefore(option, event.target.querySelector("[value='__add_category__']"));
    event.target.value = clean;
    toast("Categoria agregada");
  }
  if (event.target.id === "month-select") {
    selectedMonth = event.target.value;
    render();
  }
  if (event.target.id === "import-input") {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then(text => {
      const imported = JSON.parse(text);
      restoreBackup(imported);
    }).catch(() => toast("No se pudo importar"));
  }
});

setTheme(state.settings.theme);
render();
if (isLoggedIn()) {
  hideLogin();
  loadRemoteState();
} else {
  showLogin();
  setSyncStatus("Sin iniciar sesion");
}
