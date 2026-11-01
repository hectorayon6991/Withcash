/* WithCash — control de gastos personales (PWA) */
(() => {
  "use strict";

  // ---------- Config / cliente ----------
  const CFG = window.WITHCASH_CONFIG || {};
  // Se lee antes de crear el cliente: Supabase limpia el #hash del enlace del correo al procesarlo.
  const AUTH_HASH = new URLSearchParams(location.hash.slice(1));
  let recovering = AUTH_HASH.get("type") === "recovery";
  // Ninguna petición se queda colgada: si la red no responde se corta y el cambio sigue en la cola para reintentar
  function fetchWithTimeout(url, opts = {}) {
    const c = new AbortController(), ms = /\/storage\//.test(String(url)) ? 120000 : 30000;
    const t = setTimeout(() => c.abort(), ms);
    if (opts.signal) { if (opts.signal.aborted) c.abort(); else opts.signal.addEventListener("abort", () => c.abort()); }
    return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
  }
  const sb = CFG.supabaseUrl && CFG.supabaseKey && window.supabase
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: fetchWithTimeout } })
    : null;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
  };

  const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const CURRENCIES = [["MXN","Peso mexicano"],["USD","Dólar"],["HNL","Lempira"],["GTQ","Quetzal"],["COP","Peso colombiano"],["PEN","Sol"],["CLP","Peso chileno"],["ARS","Peso argentino"],["EUR","Euro"]];
  const { ico, iconKey, PICKABLE } = window.WCIcons;
  const catIco = (c, fb = "box") => ico(iconKey(c?.icon, c?.name, fb));
  const accIco = (a, fb = "wallet") => ico(iconKey(a?.icon, a?.name, fb));
  const KIND_ICON = { tarjeta: "card", servicio: "bulb", suscripcion: "tv", deuda: "car", ingreso: "briefcase", presupuesto: "target", seguro: "lock", otro: "box" };
  const KIND_NAME = { tarjeta: "Tarjetas de crédito", servicio: "Servicios y colegio", suscripcion: "Suscripciones", deuda: "Deudas y préstamos",
    ingreso: "Ingresos fijos", presupuesto: "Presupuestos", seguro: "Seguros", otro: "Otros compromisos" };
  const KIND_LABEL = Object.fromEntries(Object.entries(KIND_NAME).map(([k, v]) => [k, `<span class="ttl">${ico(KIND_ICON[k])}${v}</span>`]));

  const DEFAULT_CATS = [
    ["food","Comida","gasto"],["cart","Súper","gasto"],["car","Transporte","gasto"],["fuel","Gasolina","gasto"],["home","Casa","gasto"],
    ["bulb","Servicios","gasto"],["card","Tarjetas","gasto"],["school","Educación","gasto"],["health","Salud","gasto"],["film","Entretenimiento","gasto"],
    ["shirt","Ropa","gasto"],["child","Hija","gasto"],["tv","Suscripciones","gasto"],["gift","Regalos","gasto"],["box","Otros","gasto"],
    ["briefcase","Sueldo","ingreso"],["cash","Extra","ingreso"],["tag","Ventas","ingreso"],["refund","Reembolso","ingreso"],["box","Otros ingresos","ingreso"],
  ];
  const DEFAULT_ACCS = [["cash","Efectivo","efectivo"],["bank","Débito","debito"],["card","Crédito","credito"]];
  const TEMPLATES = [
    { name: "Sueldo", kind: "ingreso", cat: "Sueldo", icon: "briefcase", frequency: "quincenal", day: 15, day2: 31 },
    { name: "Gasolina", kind: "presupuesto", cat: "Gasolina", icon: "fuel", frequency: "semanal", weekday: 1 },
    { name: "Súper", kind: "presupuesto", cat: "Súper", icon: "cart", frequency: "semanal", weekday: 1 },
    { name: "Tarjeta de crédito", kind: "tarjeta", cat: "Tarjetas", icon: "card" },
    { name: "Luz", kind: "servicio", cat: "Servicios", icon: "bulb" },
    { name: "Internet", kind: "servicio", cat: "Servicios", icon: "wifi" },
    { name: "Colegio", kind: "servicio", cat: "Educación", icon: "school" },
    { name: "Agua", kind: "servicio", cat: "Servicios", icon: "drop" },
    { name: "Teléfono", kind: "servicio", cat: "Servicios", icon: "phone" },
    { name: "Renta", kind: "servicio", cat: "Casa", icon: "home" },
    { name: "Netflix", kind: "suscripcion", cat: "Suscripciones", icon: "tv" },
    { name: "Spotify", kind: "suscripcion", cat: "Suscripciones", icon: "music" },
    { name: "iCloud", kind: "suscripcion", cat: "Suscripciones", icon: "phone" },
    { name: "Apple Music", kind: "suscripcion", cat: "Suscripciones", icon: "music" },
    { name: "YouTube Premium", kind: "suscripcion", cat: "Suscripciones", icon: "tv" },
    { name: "Amazon Prime", kind: "suscripcion", cat: "Suscripciones", icon: "box" },
    { name: "Disney+", kind: "suscripcion", cat: "Suscripciones", icon: "film" },
    { name: "ChatGPT", kind: "suscripcion", cat: "Suscripciones", icon: "star" },
    { name: "Gimnasio", kind: "suscripcion", cat: "Salud", icon: "dumbbell" },
    { name: "Préstamo auto", kind: "deuda", cat: "Transporte", icon: "car" },
  ];

  // ---------- Estado ----------
  const S = {
    user: null,
    settings: { currency: "MXN", budget: null, savings_goal: null, timezone: "America/Mexico_City" },
    accounts: [], categories: [], fixed: [], movements: [],
    overrides: [], goals: [], contribs: [], debts: [], debtPays: [], plans: [], dbv: 0,   // 0 = aún no se sabe qué versión tiene la base (no se envía nada hasta saberlo)
    tab: "inicio", ym: null, movFilter: "todos", period: "mes",
  };

  // ---------- Fechas ----------
  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const ymOf = (d) => d.slice(0, 7);
  const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const daysInMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
  const dueDate = (ym, day) => `${ym}-${pad(Math.min(day, daysInMonth(ym)))}`;
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  const monthName = (ym, short = false) => { const n = MESES[Number(ym.slice(5)) - 1]; return short ? n.slice(0, 3) : n; };
  const fmtDay = (d) => {
    const t = today();
    if (d === t) return "Hoy";
    if (daysBetween(d, t) === 1) return "Ayer";
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });
  };
  const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const dow = (d) => new Date(d + "T12:00:00Z").getUTCDay();
  const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const fmtShort = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });

  // ---------- Dinero ----------
  let _fmt = null, _fmtCur = null;
  // Privacidad: los montos de tu dinero (no deudas) se muestran como $••••••• hasta tocar el ojito.
  // Al abrir la app o volver a ella siempre se ocultan de nuevo.
  const pm = (n) => `<span class="priv"><span class="pv">${money(n)}</span><span class="pm" aria-label="Oculto">$•••••••</span></span>`;
  const eyeBtn = () => `<button type="button" class="eye" data-eye aria-label="Mostrar u ocultar montos"><span class="e-show">${ico("eye")}</span><span class="e-hide">${ico("eyeOff")}</span></button>`;
  const maskMoney = (on = true) => document.documentElement.classList.toggle("masked", on);
  maskMoney(true);
  document.addEventListener("visibilitychange", () => { if (document.hidden) maskMoney(true); });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-eye]")) { e.preventDefault(); e.stopPropagation(); maskMoney(!document.documentElement.classList.contains("masked")); } }, true);
  const money = (n, opts = {}) => {
    const cur = S.settings.currency || "MXN";
    if (!_fmt || _fmtCur !== cur) {
      _fmtCur = cur;
      try { _fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: cur }); }
      catch { _fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }); }
    }
    let s = _fmt.format(Math.abs(n) < 0.005 ? 0 : n);
    if (opts.short && Math.abs(n) >= 10000) s = s.replace(/\.\d+$/, "");
    return s;
  };
  const curSymbol = () => { try { return money(0).replace(/[\d.,\s]/g, "") || "$"; } catch { return "$"; } };
  const parseAmount = (v) => {
    let s = String(v ?? "").replace(/[^\d.,-]/g, "");
    if (!s) return NaN;
    const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (lc > -1) s = /,\d{1,2}$/.test(s) ? s.replace(/,/g, ".") : s.replace(/,/g, "");
    const n = Math.round(parseFloat(s) * 100) / 100;
    return Math.abs(n) >= 1e10 ? NaN : n;                // la base acepta hasta 9,999,999,999.99
  };

  // ---------- Lookups ----------
  const cat = (id) => S.categories.find((c) => c.id === id);
  const acc = (id) => S.accounts.find((a) => a.id === id);
  const activeCats = (kind) => S.categories.filter((c) => !c.archived && (!kind || c.kind === kind)).sort((a, b) => a.sort - b.sort);
  const activeAccs = () => S.accounts.filter((a) => !a.archived).sort((a, b) => a.sort - b.sort);
  const monthMovs = (ym) => S.movements.filter((m) => m.date.startsWith(ym));
  // ---------- Fijos: frecuencias ----------
  // kind: servicio | tarjeta | suscripcion | deuda (pagos) · ingreso (sueldo) · presupuesto (tope por periodo)
  // Cada ocurrencia se identifica con `key`, que se guarda en movements.fixed_for:
  //   mensual → "YYYY-MM" · quincenal / semanal → "YYYY-MM-DD"
  const freqOf = (f) => f.frequency || "mensual";
  const isIncome = (f) => f.kind === "ingreso";
  const isBudget = (f) => f.kind === "presupuesto";
  const isBill = (f) => !isIncome(f) && !isBudget(f);
  // Cálculos de dinero en centavos enteros (js/finance.js); se convierten a pesos solo al mostrar
  const C = WCFin.toC, P = WCFin.fromC;
  const round2 = (n) => Math.round(Number(n) * 100) / 100;
  const fmtTime = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); if ((S.settings.time_format || "24h") === "24h") return `${pad(h)}:${pad(m)}`; return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "a. m." : "p. m."}`; };
  const fmtDate = (d) => { if (!d) return ""; const [y, m, dd] = d.split("-"); const f = S.settings.date_format || "dd/mm/aaaa"; return f === "aaaa-mm-dd" ? d : f === "mm/dd/aaaa" ? `${m}/${dd}/${y}` : `${dd}/${m}/${y}`; };
  const sumP = (list, f = (x) => x) => P(list.reduce((s, x) => s + C(f(x)), 0));   // suma exacta en centavos
  const perMonth = (f) => P(WCFin.perMonthC(f));
  const paidFor = (f, key) => S.movements.find((m) => m.fixed_id === f.id && m.fixed_for === key);
  const overridesMap = () => Object.fromEntries((S.overrides || []).map((o) => [`${o.fixed_id}|${o.occ_key}`, o]));
  const occurrences = (f, ym) => WCFin.occurrences(f, ym, overridesMap());
  // Una ocurrencia cuenta si ya está pagada, o si no es anterior al mes de inicio del control (Ajustes)
  // ni a la creación del fijo (en mensual sí cuenta el mes en que se creó).
  function baseCounts(f, o) {
    if (paidFor(f, o.key)) return true;
    if (f.paused) return false;                                   // pausado: no genera pendientes
    const start = S.settings.start_month;
    if (start && o.due < `${start}-01`) return false;
    const since = f.created_at ? localDay(f.created_at) : "";
    return !since || o.due >= since || (freqOf(f) === "mensual" && o.key === since.slice(0, 7));
  }
  // Deudas a cuotas: solo cuentan tantas fechas sin pagar como cuotas falten (luego la deuda termina)
  const instLeft = (f) => f.installments - (f.installments_paid_before || 0) - S.movements.filter((m) => m.fixed_id === f.id).length;
  function counts(f, o) {
    if (!baseCounts(f, o)) return false;
    if (!WCFin.isInstDebt(f) || paidFor(f, o.key)) return true;
    const left = instLeft(f); if (left <= 0) return false;
    const since = f.created_at ? localDay(f.created_at).slice(0, 7) : ymOf(today());
    let from = S.settings.start_month && S.settings.start_month > since ? S.settings.start_month : since, before = 0;
    for (let m = from, i = 0; m <= ymOf(o.due) && i < 240; m = addMonths(m, 1), i++)
      for (const x of occurrences(f, m)) if (x.due < o.due && !paidFor(f, x.key) && baseCounts(f, x)) before++;
    return before < left;
  }
  const monthOcc = (f, ym) => occurrences(f, ym).filter((o) => counts(f, o)).map((o) => ({ ...o, mov: paidFor(f, o.key) }));
  const occLabel = (key) => key.length === 7 ? `correspondiente a ${monthName(key)}` : `del ${fmtShort(key)}`;
  function scheduleLabel(f) {
    const fr = freqOf(f);
    if (isBudget(f)) return fr === "semanal" ? `por semana (desde el ${WEEKDAYS[f.weekday]})` : fr === "quincenal" ? "por quincena" : fr === "anual" ? "por año" : fr === "personalizado" ? `del ${fmtShort(f.start_date)} al ${fmtShort(f.end_date)}` : "por mes";
    if (fr === "unico") return `una vez, ${fmtShort(f.start_date)}`;
    if (["bimestral", "trimestral", "semestral", "anual"].includes(fr)) return `${fr}, día ${f.day}`;
    if (fr === "semanal") return `cada ${WEEKDAYS[f.weekday]}`;
    if (fr === "quincenal") return `días ${f.day || 15} y ${(f.day2 || 31) >= 28 ? "último" : f.day2}`;
    return `día ${f.day}`;
  }
  // Presupuestos: periodo que contiene la fecha d y lo gastado en la categoría dentro de él
  const budgetPeriod = (f, d = today()) => WCFin.budgetPeriod(f, d);
  function budgetUse(f, d = today()) {
    const u = WCFin.budgetUse(f, S.movements, d);
    return { ...u, limit: P(u.limit), spent: P(u.spent), left: P(u.left) };
  }
  function budgetItem(f) {
    const u = budgetUse(f), c = cat(f.category_id), next = addDays(u.end, 1);
    const fr = freqOf(f);
    const period = fr === "semanal" ? "esta semana" : fr === "quincenal" ? "esta quincena" : "este mes";
    const reset = daysBetween(today(), next) <= 7 ? `el ${WEEKDAYS[dow(next)]}` : fmtShort(next);
    return `<li class="item tap" data-edit-fixed="${f.id}">
      <div class="ico">${catIco(c, "target")}</div>
      <div class="main">
        <div class="t">${esc(f.name)}</div>
        <div class="s"><b class="num">${money(u.spent)}</b> de ${money(u.limit)} ${period}</div>
        <div class="progress budget-bar ${u.pct > 1 ? "over" : u.pct >= 0.8 ? "warn" : ""}"><i style="width:${Math.min(100, u.pct * 100).toFixed(1)}%"></i></div>
        <div class="s">${u.left >= 0 ? `Quedan <b>${money(u.left)}</b>` : `<span class="badge bad">Te pasaste ${money(-u.left)}</span>`} · se reinicia ${reset}</div>
      </div>
    </li>`;
  }

  const debtsById = () => Object.fromEntries((S.debts || []).map((d) => [d.id, d]));
  // Totales de un periodo (en pesos, calculados en centavos). Las transferencias no cuentan.
  function totalsRange(from, to) {
    const t = WCFin.totalsC(S.movements, from, to, S.debtPays || [], debtsById());
    return { inc: P(t.inc), exp: P(t.exp), fixedExp: P(t.fixedExp), varExp: P(t.varExp), net: P(t.net) };
  }
  const totals = (ym) => totalsRange(`${ym}-01`, dueDate(ym, 31));
  // Saldo que pasa de los meses anteriores (ingresos − gastos), contando solo desde el inicio del control
  // (Ajustes → «Llevar el control desde»). Sin mes de inicio no se arrastra nada.
  function carryIn(ym) {
    const start = S.settings.start_month;
    if (!start || ym <= start) return { amount: 0, months: 0 };
    const amount = totalsRange(`${start}-01`, addDays(`${ym}-01`, -1)).net;
    let months = 0;
    for (let x = start; x < ym; x = addMonths(x, 1)) months++;
    return { amount, months };
  }
  // Saldo real = saldo inicial + movimientos confirmados (+ préstamos), reconstruido siempre desde cero
  const accountBalance = (a) => P(WCFin.accountBalanceC(a, S.movements, S.debts || [], S.debtPays || []));
  // Ocurrencias sin pagar (de hace tres meses a dos meses adelante; nunca antes del inicio del control), en orden
  function pendingOcc(f) {
    const ym = ymOf(today());
    return [-3, -2, -1, 0, 1, 2].map((n) => addMonths(ym, n)).flatMap((m) => occurrences(f, m))
      .filter((o) => counts(f, o) && !paidFor(f, o.key));
  }
  // Próxima ocurrencia pendiente: la más antigua sin pagar de este mes en adelante (puede estar vencida)
  function nextPending(f) {
    const t = today(), ym = ymOf(t);
    const o = pendingOcc(f).find((x) => x.due >= `${ym}-01`);
    return o ? { month: o.key, key: o.key, due: o.due, days: daysBetween(t, o.due) } : null;
  }
  function fixedStatus(f, ym) {
    const occ = monthOcc(f, ym);
    const multi = occ.length > 1 ? ` · ${occ.filter((o) => o.mov).length}/${occ.length}` : "";
    const done = isIncome(f) ? "Recibido" : "Pagado";
    if (!occ.length) return WCFin.isInstDebt(f) && instLeft(f) <= 0 ? { paid: false, none: true, settled: true, label: "Liquidada", cls: "good" } : { paid: false, none: true, label: "Sin fechas este mes", cls: "" };
    const pend = occ.find((o) => !o.mov);
    if (!pend) { const mov = occ[occ.length - 1].mov; return { paid: true, label: done + multi, cls: "good", mov, occ }; }
    const days = daysBetween(today(), pend.due), due = pend.due, key = pend.key;
    const base = { days, due, key, occ };
    const dateLbl = freqOf(f) === "mensual" ? `Día ${f.day}` : fmtShort(due);
    if (isIncome(f)) {
      if (days < 0) return { ...base, label: `¿Ya llegó? (${fmtShort(due)})` + multi, cls: "warn" };
      if (days === 0) return { ...base, label: "Llega hoy" + multi, cls: "good" };
      if (days === 1) return { ...base, label: "Llega mañana" + multi, cls: "" };
      return { ...base, label: dateLbl + multi, cls: "" };
    }
    if (days < 0) return { ...base, label: `Venció hace ${-days} d` + multi, cls: "bad" };
    if (days === 0) return { ...base, label: "Vence hoy" + multi, cls: "bad" };
    if (days === 1) return { ...base, label: "Vence mañana" + multi, cls: "warn" };
    if (days <= f.remind_days) return { ...base, label: `En ${days} días` + multi, cls: "warn" };
    return { ...base, label: dateLbl + multi, cls: "" };
  }
  function debtProgress(f) {
    if (f.kind !== "deuda" || !f.installments) return null;
    const paid = (f.installments_paid_before || 0) + S.movements.filter((m) => m.fixed_id === f.id).length;
    const n = Math.min(paid, f.installments);
    return { paid: n, total: f.installments, pct: n / f.installments, left: P((f.installments - n) * C(f.amount)) };
  }

  // ---------- Persistencia: Supabase + caché local (IndexedDB) + cola de sincronización ----------
  // Cada cambio entra a la cola como una ENTRADA con una o varias operaciones que se envían juntas
  // (lote atómico vía la función wc_apply de la base). Una entrada nunca se borra antes de que el servidor
  // la confirme; si el servidor la rechaza queda con estado «error» para reintentar o descartar a mano.
  const cacheKey = () => `wc_cache_${S.user?.id}`;
  const outboxKey = () => `wc_outbox_${S.user?.id}`;
  const TABLE_STATE = { accounts: "accounts", categories: "categories", fixed_payments: "fixed", movements: "movements",
    fixed_overrides: "overrides", savings_goals: "goals", savings_contributions: "contribs", debts: "debts", debt_payments: "debtPays", card_plans: "plans" };
  const NEW_TABLES = ["fixed_overrides", "savings_goals", "savings_contributions", "debts", "debt_payments"];
  // Columnas que solo existen con la base actualizada (versión 5)
  const NEW_COLS = {
    movements: ["time", "tags", "payment_method", "notes", "attachment_path", "updated_at"],
    accounts: ["institution", "currency", "opened_at", "color", "allow_negative", "updated_at"],
    categories: ["color", "updated_at"],
    fixed_payments: ["start_date", "end_date", "notes", "paused", "updated_at"],
    settings: ["app_name", "theme", "date_format", "time_format", "auto_lock_minutes", "notify", "currencies"],
  };
  const dbReady = () => S.dbv >= 5;
  const plansReady = () => S.dbv >= 6;
  // ¿La base ya tiene la tabla? (0005 → módulos; 0006 → compras a meses)
  const tableReady = (t) => (t === "card_plans" ? plansReady() : NEW_TABLES.includes(t) ? dbReady() : true);
  let OUTBOX = [];
  let cacheTimer = 0;
  function saveCache() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => WCStore.set(cacheKey(), {
      settings: S.settings, accounts: S.accounts, categories: S.categories, fixed: S.fixed, movements: S.movements,
      overrides: S.overrides, goals: S.goals, contribs: S.contribs, debts: S.debts, debtPays: S.debtPays, plans: S.plans, dbv: S.dbv,
    }), 150);
  }
  async function loadCache() {
    await WCStore.adopt(cacheKey()); await WCStore.adopt(outboxKey());
    const c = await WCStore.get(cacheKey(), null);
    let q = await WCStore.get(outboxKey(), []);
    const bk = ls.get(outboxBkKey(), null);                       // copia síncrona: siempre es la más reciente
    if (Array.isArray(bk)) q = bk;
    // Formato anterior (lista de operaciones sueltas) → entradas
    if (q.length && !q[0].ops) q = q.map((op) => ({ id: uuid(), ops: [op], status: "pending", at: Date.now() }));
    OUTBOX = q;
    if (!c) return false;
    Object.assign(S, { settings: { ...S.settings, ...c.settings }, accounts: c.accounts || [], categories: c.categories || [], fixed: c.fixed || [], movements: c.movements || [],
      overrides: c.overrides || [], goals: c.goals || [], contribs: c.contribs || [], debts: c.debts || [], debtPays: c.debtPays || [], plans: c.plans || [], dbv: c.dbv || 0 });
    // Lo que está en la cola se aplica encima de la caché (por si la app se cerró antes de guardarla)
    for (const e of OUTBOX) e.ops.forEach(applyLocal);
    return true;
  }
  // La cola se guarda dos veces: al instante en localStorage (síncrono, sobrevive aunque la app se cierre de golpe)
  // y en IndexedDB. Si la copia síncrona no cabe se borra, para que nunca quede una copia vieja.
  const outboxBkKey = () => `wc_q_bk_${S.user?.id}`;
  function persistOutbox() {
    if (!S.user) return;
    try { if (OUTBOX.length) localStorage.setItem(outboxBkKey(), JSON.stringify(OUTBOX)); else localStorage.removeItem(outboxBkKey()); }
    catch { try { localStorage.removeItem(outboxBkKey()); } catch { /* */ } }
    WCStore.set(outboxKey(), OUTBOX).then((ok) => { if (!ok && !ls.get(outboxBkKey(), null) && OUTBOX.length) toast("Tu teléfono no tiene espacio: libera espacio para no perder cambios sin enviar"); });
  }
  function applyLocal(op) {
    if (op.table === "settings") { S.settings = { ...S.settings, ...op.row }; return; }
    const key = TABLE_STATE[op.table]; if (!key) return;
    const arr = S[key];
    if (op.op === "delete") { S[key] = arr.filter((r) => r.id !== op.id); return; }
    for (const row of [].concat(op.row)) {
      if (op.op === "insert_ignore" && op.table === "movements" && arr.some((r) => r.fixed_id === row.fixed_id && r.fixed_for === row.fixed_for)) continue;
      const i = arr.findIndex((r) => r.id === row.id);
      if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push(row);
    }
    if (key === "movements") arr.sort((a, b) => (b.date + (b.time || "") + (b.created_at || "")).localeCompare(a.date + (a.time || "") + (a.created_at || "")));
  }
  // ---------- Reglas de la base: cada fila se ajusta ANTES de guardarse para que el servidor nunca la rechace ----------
  const DB_RULES = {
    text: { accounts: { name: 40 }, categories: { name: 40 }, fixed_payments: { name: 40 }, movements: { note: 120, notes: 1000 },
      savings_goals: { name: 60, description: 500 }, savings_contributions: { note: 200 }, debts: { name: 60, counterparty: 60, notes: 1000 },
      debt_payments: { note: 200 }, card_plans: { name: 60 } },
    num: { accounts: { initial_balance: [12, 2], credit_limit: [12, 2], apr: [6, 2] }, fixed_payments: { amount: [12, 2] },
      movements: { amount: [12, 2], orig_amount: [12, 2] }, settings: { budget: [12, 2], savings_goal: [12, 2], usd_rate: [10, 4] },
      savings_goals: { target: [14, 2] }, savings_contributions: { amount: [14, 2] }, debts: { principal: [14, 2], interest_rate: [6, 2] },
      debt_payments: { amount: [14, 2], interest: [14, 2] }, card_plans: { total: [14, 2] } },
    int: { accounts: { cut_day: [1, 31], due_day: [1, 31] }, fixed_payments: { day: [1, 31], day2: [1, 31], weekday: [0, 6], remind_days: [0, 15], installments: [1, 9999], installments_paid_before: [0, 9999] },
      card_plans: { installments: [1, 72] }, settings: { auto_lock_minutes: [0, 1440] } },
    // Columnas obligatorias con valor por defecto: si vienen vacías se omiten (la base pone su valor o conserva el actual)
    req: { accounts: ["icon", "kind", "allow_negative", "currency", "archived", "sort", "initial_balance"], categories: ["icon", "kind", "archived", "sort"],
      fixed_payments: ["frequency", "kind", "remind_days", "active", "auto", "paused", "installments_paid_before", "amount"], movements: ["source", "tags", "date"],
      settings: ["currency", "timezone", "theme", "date_format", "time_format", "auto_lock_minutes", "notify", "currencies"],
      savings_goals: ["icon", "status"], savings_contributions: ["date"], debts: ["kind", "status", "start_date"], debt_payments: ["interest", "date"], card_plans: ["status"] },
  };
  const clip = (v, n) => { const a = Array.from(String(v)); return a.length > n ? a.slice(0, n).join("") : String(v); };
  function cleanRow(table, row) {
    const r = { ...row };
    for (const [k, n] of Object.entries(DB_RULES.text[table] || {})) if (r[k] != null) { r[k] = clip(String(r[k]).trim(), n); if (!r[k] && k !== "name") r[k] = null; }
    for (const [k, [p, sc]] of Object.entries(DB_RULES.num[table] || {})) {
      if (!(k in r) || r[k] === null || r[k] === "") { if (r[k] === "") r[k] = null; continue; }
      const v = Number(r[k]);
      if (!Number.isFinite(v)) { r[k] = null; continue; }
      const f = 10 ** sc, q = Math.round(v * f) / f;
      if (Math.abs(q) >= 10 ** (p - sc)) throw new Error("Monto demasiado grande");
      r[k] = q;
    }
    for (const [k, [lo, hi]] of Object.entries(DB_RULES.int[table] || {})) {
      if (!(k in r) || r[k] === null || r[k] === "") { if (r[k] === "") r[k] = null; continue; }
      const v = Math.round(Number(r[k]));
      r[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
    }
    if (table === "movements" && "tags" in r) r.tags = Array.isArray(r.tags) ? r.tags.map(String).filter(Boolean).slice(0, 20) : [];
    for (const k of DB_RULES.req[table] || []) if (k in r && (r[k] === null || r[k] === undefined || Number.isNaN(r[k]))) delete r[k];
    return r;
  }
  // Acepta una operación o una lista (que se guardará de forma atómica). Devuelve false si no se pudo guardar.
  function mutate(opOrOps, opts = {}) {
    let ops = [].concat(opOrOps).flatMap((op) => (Array.isArray(op.row) ? op.row.map((r) => ({ ...op, row: r })) : [op]));
    const now = new Date().toISOString();
    const fix = (op) => (op.row ? { ...op, row: cleanRow(op.table, op.table === "settings" ? op.row : { ...op.row, updated_at: now }) } : op);
    if (opts.split) {                                              // registros independientes: se omiten solo los inválidos
      const before = ops.length;
      ops = ops.flatMap((op) => { try { return [fix(op)]; } catch { return []; } });
      if (ops.length < before) toast(`${before - ops.length} registro(s) del respaldo tenían montos inválidos y se omitieron`);
      if (!ops.length) return false;
    } else {
      try { ops = ops.map(fix); }
      catch (err) { toast(err.message === "Monto demasiado grande" ? "El monto es demasiado grande" : "No se pudo guardar: " + err.message); return false; }
    }
    ops.forEach(applyLocal);
    saveCache();
    OUTBOX.push({ id: uuid(), ops, status: "pending", at: Date.now(), ...(opts.split ? { split: true } : {}) });
    persistOutbox();
    updateOffline();
    flush();
    render();
    return true;
  }
  const isNetErr = (e) => !navigator.onLine || e?.name === "AbortError" || /fetch|network|load failed|timeout|abort|offline|connection/i.test(e?.message || "");
  const stripRow = (table, row) => { if (dbReady() || !row) return row; const r = { ...row }; for (const k of NEW_COLS[table] || []) delete r[k]; return r; };
  // Envío con la base anterior (sin wc_apply): una operación a la vez
  async function sendLegacy(ops) {
    for (const op of ops) {
      const row = stripRow(op.table, op.row);
      const res = op.op === "delete" ? await sb.from(op.table).delete().eq("id", op.id)
        : await sb.from(op.table).upsert(row, op.op === "insert_ignore" ? { onConflict: "fixed_id,fixed_for", ignoreDuplicates: true } : { onConflict: op.table === "settings" ? "user_id" : "id" });
      if (res.error) return res;
    }
    return {};
  }
  // ---------- Envío de la cola ----------
  // Cada falla se clasifica:
  //   red / tiempo agotado / servidor caído (5xx, 429) → se queda en la cola y se reintenta solo
  //   sesión vencida → se renueva la sesión y se reintenta; si no se puede, espera a que vuelvas a entrar
  //   dato rechazado → se intenta reparar automáticamente (pago ya registrado, cuenta/categoría borrada en
  //                     otro dispositivo, texto o número fuera de rango) y se reenvía; solo si no se puede reparar
  //                     queda como «error» (nunca se borra sola)
  let flushing = false, flushAgain = false, authNeeded = false;
  const CONFIRMED = [];                                          // lotes confirmados recientemente (ver loadRemote)
  // Llaves foráneas: columna que se puede vaciar si el registro relacionado ya no existe; null = el lote ya no tiene sentido
  const FK_FIX = {
    movements_category_id_fkey: ["movements", "category_id"], movements_account_id_fkey: ["movements", "account_id"],
    movements_to_account_id_fkey: ["movements", "to_account_id"], movements_fixed_id_fkey: ["movements", "fixed_id"],
    fixed_payments_category_id_fkey: ["fixed_payments", "category_id"], fixed_payments_account_id_fkey: ["fixed_payments", "account_id"],
    savings_goals_account_id_fkey: ["savings_goals", "account_id"], debts_account_id_fkey: ["debts", "account_id"],
    debt_payments_account_id_fkey: ["debt_payments", "account_id"], card_plans_movement_id_fkey: ["card_plans", "movement_id"],
    card_plans_account_id_fkey: ["card_plans", null], savings_contributions_goal_id_fkey: ["savings_contributions", null],
    debt_payments_debt_id_fkey: ["debt_payments", null], fixed_overrides_fixed_id_fkey: ["fixed_overrides", null],
  };
  function classify(res) {
    const e = res.error, st = res.status, code = e?.code || "";
    if (isNetErr(e) || !st) return "net";
    if (st === 401 || code === "PGRST301" || code === "PGRST303" || /jwt|not authenticated/i.test(e?.message || "")) return "auth";
    if (st >= 500 || st === 408 || st === 429 || ["57014", "40001", "40P01", "53300", "55P03"].includes(code)) return "net";
    return "data";
  }
  // Ids que todavía están por enviarse en otros lotes (un registro hijo espera a su registro padre)
  const pendingIds = (except) => new Set(OUTBOX.filter((x) => x !== except && x.status !== "error").flatMap((x) => x.ops.map((o) => o.row?.id || o.id)).filter(Boolean));
  // Intenta reparar un lote rechazado. Devuelve "retry" (reenviar ya), "wait" (esperar a otro lote) o null (no se pudo).
  function repair(e, err) {
    const msg = err?.message || "", code = err?.code || "";
    e.repairs = (e.repairs || 0) + 1;
    if (e.repairs > 6) return null;
    // El mismo pago fijo ya se registró (otro dispositivo, Atajo o automático): se conserva el que ya existe
    if (code === "23505" && /movements_fixed_once|fixed_id/.test(msg)) {
      let changed = false;
      e.ops = e.ops.map((o) => { if (o.table === "movements" && o.row?.fixed_id && (o.op || "upsert") === "upsert") { changed = true; return { ...o, op: "insert_ignore" }; } return o; });
      if (changed) { e.note = "Ese pago ya estaba registrado; se conservó el que ya existía"; lastRefresh = 0; return "retry"; }
    }
    if (code === "23505" && /fixed_overrides/.test(msg)) { e.ops = e.ops.filter((o) => o.table !== "fixed_overrides"); return e.ops.length ? "retry" : "drop"; }
    // Registro relacionado que no existe en el servidor
    if (code === "23503") {
      const fk = (msg.match(/constraint "([^"]+)"/) || [])[1], fix = FK_FIX[fk];
      if (fix) {
        const [table, col] = fix, waiting = pendingIds(e);
        const refCol = col || { card_plans: "account_id", savings_contributions: "goal_id", debt_payments: "debt_id", fixed_overrides: "fixed_id" }[table];
        // Si el registro relacionado aún va en otro lote, se espera a que ese llegue primero
        if (e.ops.some((o) => o.table === table && o.row && waiting.has(o.row[refCol]))) return "wait";
        if (col) { e.ops = e.ops.map((o) => (o.table === table && o.row && o.row[col] ? { ...o, row: { ...o.row, [col]: null } } : o)); e.note = "Se guardó sin un dato que ya no existe (se borró en otro dispositivo)"; return "retry"; }
        e.ops = e.ops.filter((o) => o.table !== table);
        return e.ops.length ? "retry" : "drop";
      }
    }
    // Texto o número fuera de rango, dato obligatorio vacío, formato inválido: se vuelve a ajustar a las reglas
    if (/^(22|23502|23514)/.test(code)) {
      try { e.ops = e.ops.map((o) => (o.row ? { ...o, row: cleanRow(o.table, o.row) } : o)); } catch { return null; }
      return e.repairs <= 2 ? "retry" : null;
    }
    return null;
  }
  async function sendEntry(e) {
    try {
      return dbReady()
        ? await sb.rpc("wc_apply", { ops: e.ops.map((o) => ({ table: o.table, op: o.op || "upsert", id: o.id, row: o.row })) })
        : await sendLegacy(e.ops);
    } catch (err) { return { error: err }; }
  }
  async function flush(retryErrors = false) {
    if (!sb || !S.user || !S.dbv) return;                        // sin saber la versión de la base no se envía (evita la ruta antigua)
    if (flushing) { flushAgain = true; return; }
    flushing = true;
    let notes = [];
    try {
      for (const e of OUTBOX.slice()) {
        if (!OUTBOX.includes(e)) continue;
        if (e.status === "error" && !retryErrors) continue;
        // Operaciones de módulos nuevos esperan a que la base esté actualizada (no se pierden)
        if (e.ops.some((o) => !tableReady(o.table))) { e.status = "waiting"; continue; }
        let res = await sendEntry(e), stop = false;
        for (let guard = 0; res.error && guard < 8; guard++) {
          const kind = classify(res);
          if (kind === "net") { stop = true; break; }                 // sin internet o servidor ocupado: se reintenta después
          if (kind === "auth") {
            const { error: rErr } = await sb.auth.refreshSession().catch((x) => ({ error: x }));
            if (rErr) { if (!isNetErr(rErr)) authNeeded = true; stop = true; break; }
            res = await sendEntry(e); continue;
          }
          const fix = repair(e, res.error);
          if (fix === "retry") { persistOutbox(); res = await sendEntry(e); continue; }
          if (fix === "drop") { res = {}; break; }
          if (fix === "wait") { e.status = "pending"; res = { waiting: true }; break; }
          // Lote de registros independientes (restaurar respaldo): se separa para que un registro malo no detenga a los demás
          if (e.split && e.ops.length > 1) {
            const i = OUTBOX.indexOf(e), parts = e.ops.map((o) => ({ id: uuid(), ops: [o], status: "pending", at: e.at }));
            OUTBOX.splice(i, 1, ...parts); flushAgain = true; res = { waiting: true }; break;
          }
          e.status = "error"; e.error = res.error.message || String(res.error); e.tries = (e.tries || 0) + 1;
          console.error(res.error);
          break;
        }
        if (stop) break;
        if (res.waiting || (res.error && e.status === "error")) continue;
        if (!res.error) {
          authNeeded = false;
          if (e.note) notes.push(e.note);
          OUTBOX = OUTBOX.filter((x) => x.id !== e.id);               // confirmado por el servidor → ya se puede quitar
          CONFIRMED.push({ at: Date.now(), ops: e.ops });
          while (CONFIRMED.length && Date.now() - CONFIRMED[0].at > 300000) CONFIRMED.shift();
        }
      }
    } finally {
      flushing = false;
      persistOutbox();
      updateOffline();
      if (notes.length) toast(notes[0]);
      if (flushAgain) { flushAgain = false; setTimeout(() => flush(), 50); }
      else if (OUTBOX.some((x) => x.status === "pending") && navigator.onLine) scheduleRetry();
      else retryDelay = 3000;
      retryTickets();
    }
  }
  // Reintentos automáticos con espera creciente (3 s → 2 min) mientras haya cambios pendientes
  let retryTimer = 0, retryDelay = 3000;
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => flush(), retryDelay);
    retryDelay = Math.min(120000, retryDelay * 2);
  }
  function syncState() {
    const err = OUTBOX.filter((e) => e.status === "error").length, wait = OUTBOX.filter((e) => e.status === "waiting").length;
    const pend = OUTBOX.length - err - wait;
    return { err, wait, pend, total: OUTBOX.length };
  }
  function updateOffline() {
    const st = S.user ? syncState() : { total: 0 };
    const bar = $("#offlineBar");
    bar.hidden = navigator.onLine && !st.total;
    bar.classList.toggle("err", !!st.err);
    bar.textContent = authNeeded && st.total ? `Tu sesión venció · ${st.total} cambio(s) guardados aquí se enviarán al volver a entrar`
      : !navigator.onLine ? `Sin conexión · ${st.total ? `${st.total} cambio(s) guardados en este dispositivo` : "los cambios se guardarán al reconectar"}`
      : st.err ? `${st.err} cambio(s) con error · toca para revisar`
      : st.pend ? `Sincronizando ${st.pend} cambio(s)…`
      : st.wait ? `${st.wait} cambio(s) esperan la actualización de la base de datos` : "";
    const dot = $("#syncDot");
    if (dot) { dot.className = "sync-dot " + (!navigator.onLine ? "off" : st.err ? "err" : st.total ? "pend" : "ok"); dot.title = st.err ? "Error de sincronización" : st.total ? "Pendiente" : "Sincronizado"; }
  }
  window.addEventListener("online", () => { retryDelay = 3000; refreshDelay = 4000; if (S.dbv) flush(true); else refresh(true); });
  // Red de seguridad: cada 30 s, si quedó algo pendiente, se intenta enviar
  setInterval(() => { if (S.user && navigator.onLine && OUTBOX.some((x) => x.status === "pending")) flush(); }, 30000);
  // Al salir de la app se intenta enviar lo pendiente (la cola ya está guardada de todos modos)
  document.addEventListener("visibilitychange", () => { if (document.hidden && S.user && OUTBOX.length) { persistOutbox(); flush(); } });
  window.addEventListener("offline", updateOffline);

  async function fetchAll(table, order) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select("*").order(order, { ascending: false }).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  async function loadRemote() {
    if (OUTBOX.length) await flush(true);
    const t0 = Date.now() - 2000;
    // ¿La base ya tiene los módulos nuevos?
    // Solo «la tabla no existe» cuenta como base anterior; una falla de red NO cambia la versión (se reintenta luego)
    const missing = (r) => r.error && (r.status === 404 || ["PGRST205", "42P01", "PGRST202"].includes(r.error.code));
    const probe = await sb.from("savings_goals").select("id").limit(1);
    if (probe.error && !missing(probe)) throw probe.error;
    let v = probe.error ? 4 : 5;
    if (v >= 5) { const p6 = await sb.from("card_plans").select("id").limit(1); if (p6.error && !missing(p6)) throw p6.error; if (!p6.error) v = 6; }
    S.dbv = v;
    const extra = (dbReady() ? NEW_TABLES : []).concat(plansReady() ? ["card_plans"] : []);
    const [st, accounts, categories, fixed, movements, ...rest] = await Promise.all([
      sb.from("settings").select("*").maybeSingle(),
      fetchAll("accounts", "created_at"), fetchAll("categories", "created_at"),
      fetchAll("fixed_payments", "created_at"), fetchAll("movements", "date"),
      ...extra.map((t) => fetchAll(t, "created_at")),
    ]);
    if (st.error) throw st.error;
    S.settings = { ...S.settings, ...(st.data || {}) };
    Object.assign(S, { accounts, categories, fixed, movements });
    extra.forEach((t, i) => (S[TABLE_STATE[t]] = rest[i]));
    applyLocal({ table: "movements", op: "upsert", row: [] }); // ordena
    // Cambios confirmados mientras se descargaba (pueden no venir en la descarga) y cambios aún no confirmados:
    // se vuelven a aplicar encima de lo descargado para que nunca «desaparezca» un registro de la pantalla
    for (const c of CONFIRMED) if (c.at >= t0) c.ops.forEach(applyLocal);
    for (const e of OUTBOX) e.ops.forEach(applyLocal);
    if (!S.accounts.length && !S.categories.length) await seedDefaults(!st.data);
    saveCache();
    applyTheme();
    autoPostRecurring();
    OUTBOX.forEach((e) => e.status === "waiting" && e.ops.every((o) => tableReady(o.table)) && (e.status = "pending"));
    if (OUTBOX.length) flush(true);
  }
  // Fijos con «Registrar automáticamente»: anota las fechas que ya llegaron y no están registradas.
  // La base de datos tiene un índice único (fixed_id, fixed_for), así que nunca se duplican.
  function autoPostRecurring() {
    const t = today(); let n = 0;
    for (const f of S.fixed.filter((x) => x.active && x.auto && !isBudget(x))) {
      const dp = debtProgress(f); let k = 0;
      for (const o of pendingOcc(f).filter((x) => x.due <= t)) {
        if (dp && dp.paid + k >= dp.total) break;
        k++;
        mutate({ table: "movements", op: "insert_ignore", row: {
          id: uuid(), user_id: S.user.id, type: isIncome(f) ? "ingreso" : "gasto", amount: Number(f.amount), date: o.due,
          note: f.name, category_id: f.category_id, account_id: f.account_id, to_account_id: null,
          fixed_id: f.id, fixed_for: o.key, source: "app", created_at: new Date().toISOString(),
        } });
        n++;
      }
    }
    if (n) toast(n === 1 ? "Se registró 1 movimiento automático" : `Se registraron ${n} movimientos automáticos`);
  }
  async function seedDefaults(withSettings = true) {
    const uid = S.user.id;
    const cats = DEFAULT_CATS.map(([icon, name, kind], i) => ({ id: uuid(), user_id: uid, icon, name, kind, sort: i, archived: false }));
    const accs = DEFAULT_ACCS.map(([icon, name, kind], i) => ({ id: uuid(), user_id: uid, icon, name, kind, sort: i, initial_balance: 0, archived: false }));
    if (withSettings) mutate({ table: "settings", op: "upsert", row: { user_id: uid, currency: "MXN", start_month: ymOf(today()), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Mexico_City" } });
    mutate({ table: "categories", op: "upsert", row: cats });
    mutate({ table: "accounts", op: "upsert", row: accs });
  }

  // ---------- UI helpers ----------
  let toastT;
  function toast(msg, action) {
    const t = $("#toast");
    t.innerHTML = esc(msg) + (action ? ` <button type="button">${esc(action.label)}</button>` : "");
    if (action) t.querySelector("button").onclick = () => { action.fn(); t.classList.remove("show"); };
    t.style.pointerEvents = action ? "auto" : "none";
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), action ? 5000 : 2600);
  }
  function openSheet(id) { const d = $(id); if (!d.open) d.showModal(); }
  function closeSheet(el) { (el.closest ? el.closest("dialog") : el).close(); }
  document.addEventListener("click", (e) => {
    if (e.target.matches("[data-close]")) closeSheet(e.target);
    if (e.target.tagName === "DIALOG") e.target.close(); // tocar fuera
  });
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iphone|ipad|android/i.test(navigator.userAgent)) {
      navigator.share({ files: [file], title: name }).catch(() => {});
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- Render ----------
  function render() {
    if (!S.user) return;
    const mod = MODULES.find((m) => m.tab === S.tab);
    $("#monthTitle").textContent = mod ? mod.name : `${monthName(S.ym)} ${S.ym.slice(0, 4)}`;
    $("#nextMonth").style.visibility = mod || S.ym >= addMonths(ymOf(today()), 1) ? "hidden" : "visible";
    $("#prevMonth").style.visibility = mod ? "hidden" : "visible";
    $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.tab));
    const act = $(".tabbar button.active"), bar = $(".tabbar");
    if (act && bar.scrollWidth > bar.clientWidth) { const l = act.offsetLeft - (bar.clientWidth - act.offsetWidth) / 2; bar.scrollTo({ left: Math.max(0, l), behavior: "smooth" }); }
    const v = $("#view");
    v.innerHTML = ({ inicio: viewInicio, movimientos: viewMovs, fijos: viewFijos, balance: viewBalance,
      cuentas: viewCuentas, tarjetas: viewTarjetas, presupuestos: viewPresupuestos, ahorros: viewAhorros, deudas: viewDeudas, suscripciones: viewSuscripciones })[S.tab]();
    updateBadge();
  }

  function movItem(m, withDate = false) {
    const c = cat(m.category_id), a = acc(m.account_id);
    const isT = m.type === "transferencia";
    const icon = isT ? "swap" : iconKey(c?.icon, c?.name, m.type === "ingreso" ? "cash" : "box");
    const title = m.note || (isT ? "Transferencia" : c?.name || "Sin categoría");
    const sub = isT ? `${a?.name || "?"} → ${acc(m.to_account_id)?.name || "?"}`
      : (withDate ? [fmtShort(m.date), m.note ? c?.name : a?.name] : [m.note ? c?.name : null, a?.name]).filter(Boolean).join(" · ");
    const viaAtajo = m.source === "atajo" ? `${sub ? " · " : ""}${ico("zap", "i-sm")} atajo` : "";
    const sign = m.type === "ingreso" ? "+" : m.type === "gasto" ? "−" : "";
    return `<li class="item tap" data-mov="${m.id}">
      ${tile(icon, isT ? "#a1a1a8" : m.type === "ingreso" && !c ? "#3ddc97" : colorFor(m.category_id))}
      <div class="main"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}${viaAtajo}</div></div>
      <div class="amt num ${m.type === "ingreso" ? "pos" : ""}">${sign}${money(Number(m.amount))}${m.currency === "USD" && m.orig_amount ? `<small class="orig">US$${Number(m.orig_amount).toFixed(2)}</small>` : ""}</div>
    </li>`;
  }

  function upcomingList(limitDays = 10) {
    const t = today(), ym = ymOf(t);
    const rows = [];
    for (const f of S.fixed.filter((x) => x.active && !isBudget(x))) {
      // atrasados (hasta 3, desde el mes anterior) + el siguiente
      const pend = pendingOcc(f);
      const past = pend.filter((o) => o.due < t).slice(-3), fut = pend.find((o) => o.due >= t);
      for (const o of [...past, fut].filter(Boolean)) rows.push({ f, month: o.key, due: o.due, days: daysBetween(t, o.due) });
    }
    rows.sort((a, b) => a.days - b.days);
    return { soon: rows.filter((r) => r.days <= Math.max(limitDays, r.f.remind_days)), next: rows.find((r) => r.days > limitDays) };
  }
  function upcomingItem(r) {
    const { f, days } = r;
    const c = cat(f.category_id);
    const inc = isIncome(f);
    const cls = inc ? (days <= 0 ? "good" : "") : days <= 0 ? "bad" : days <= f.remind_days ? "warn" : "";
    const when = inc
      ? (days < 0 ? "¿Ya llegó?" : days === 0 ? "Llega hoy" : days === 1 ? "Mañana" : `En ${days} días`)
      : days < 0 ? `Venció hace ${-days} día${days === -1 ? "" : "s"}` : days === 0 ? "Vence hoy" : days === 1 ? "Mañana" : `En ${days} días`;
    return `<li class="item">
      ${tile(iconKey(c?.icon, c?.name, inc ? "briefcase" : "calendar"), f.category_id ? colorFor(f.category_id) : "#b69cff")}
      <div class="main"><div class="t">${esc(f.name)} <span class="num amt-inline ${inc ? "pos" : ""}">${inc ? "+" : ""}${money(Number(f.amount))}</span></div><div class="s"><span class="badge ${cls}">${when}</span> ${fmtShort(r.due)}</div></div>
      <div class="actions"><button class="btn sm ${inc ? "" : "primary"}" data-pay="${f.id}" data-month="${r.month}">${inc ? "Recibir" : "Pagar"}</button></div>
    </li>`;
  }

  // ---------- Cuentas, crédito y patrimonio ----------
  const ACC_KIND = { efectivo: "Efectivo", debito: "Débito / banco", credito: "Tarjeta de crédito", ahorro: "Ahorro", inversion: "Inversión" };
  const isCredit = (a) => a?.kind === "credito";
  // Próxima fecha (hoy o después) de un día del mes
  const nextDay = (day) => { const t = today(), ym = ymOf(t); const d = dueDate(ym, day); return d >= t ? d : dueDate(addMonths(ym, 1), day); };
  function creditInfo(a) {
    const ci = WCFin.creditInfoC(a, WCFin.accountBalanceC(a, S.movements, S.debts || [], S.debtPays || []));
    const used = P(ci.used), limit = P(ci.limit);
    const due = a.due_day ? nextDay(a.due_day) : null, cut = a.cut_day ? nextDay(a.cut_day) : null;
    const interest = P(ci.interest);   // interés estimado si no se paga completo
    const yr = today().slice(0, 4);
    const paidInterest = S.movements.filter((m) => m.type === "gasto" && m.account_id === a.id && m.date.startsWith(yr) && /inter[eé]s/i.test(cat(m.category_id)?.name || m.note || ""))
      .reduce((s, m) => s + C(m.amount), 0) / 100;
    return { used, limit, avail: limit ? P(ci.avail) : null, pct: limit ? used / limit : 0, due, cut, dueDays: due ? daysBetween(today(), due) : null, interest, paidInterest };
  }
  function creditSummary() {
    const cards = activeAccs().filter(isCredit).map((a) => ({ a, ...creditInfo(a) }));
    const loans = S.fixed.filter((f) => f.active && f.kind === "deuda").map((f) => ({ f, d: debtProgress(f) })).filter((x) => x.d && x.d.left > 0);
    const limit = sumP(cards, (c) => c.limit), used = sumP(cards, (c) => c.used);
    const loansLeft = sumP(loans, (x) => x.d.left);
    return { cards, loans, limit, used, avail: limit - used, loansLeft, debt: used + loansLeft };
  }
  // Deuda total a una fecha: tarjetas (saldo usado a esa fecha) + préstamos registrados pendientes a esa fecha
  function debtAt(date) {
    let c = 0;
    for (const a of activeAccs().filter(isCredit)) c += Math.max(0, -WCFin.accountBalanceC(a, S.movements.filter((m) => m.date <= date), [], []));
    for (const d of (S.debts || []).filter((x) => x.direction === "debo" && x.start_date <= date && x.status !== "cancelada")) c += WCFin.debtBalanceC(d, (S.debtPays || []).filter((p) => p.date <= date));
    return P(c);
  }
  function netWorth() {
    const receivable = sumP((S.debts || []).filter((d) => d.direction === "me_deben" && d.status === "activa"), (d) => P(WCFin.debtBalanceC(d, S.debtPays || [])));
    const owed = sumP((S.debts || []).filter((d) => d.direction === "debo" && d.status === "activa"), (d) => P(WCFin.debtBalanceC(d, S.debtPays || [])));
    const assets = P(C(sumP(activeAccs().filter((a) => !isCredit(a)), accountBalance)) + C(receivable));
    const cs = creditSummary(), debts = P(C(cs.debt) + C(owed));
    return { assets, debts, net: P(C(assets) - C(debts)), receivable };
  }
  // Lo que falta pagar (comprometido) y cobrar este mes, incluidos atrasados
  // Compromisos del mes en curso:
  //   fixed     = pagos fijos sin pagar (los «pagos de tarjeta» de una tarjeta que ya existe como cuenta no se suman: su deuda va aparte)
  //   cardsDebt = todo lo que se debe hoy en tarjetas
  //   cardsPre  = la parte de esa deuda que NO está registrada como gasto (lo que ya se debía al dar de alta la tarjeta);
  //               las compras con tarjeta ya cuentan en Gastos, así que en el balance del mes solo se suma esta parte
  //   bills     = fixed + cardsPre (lo que se descuenta del balance del mes sin contar nada dos veces)
  function commitments(ym) {
    const z = { bills: 0, fixed: 0, cardsDebt: 0, cardsPre: 0, incomes: 0 };
    if (ym !== ymOf(today())) return z;
    const cards = activeAccs().filter(isCredit), cardNames = new Set(cards.map((a) => a.name.trim().toLowerCase()));
    let fixed = 0, incomes = 0;
    for (const f of S.fixed.filter((x) => x.active && !isBudget(x))) {
      if (f.kind === "tarjeta" && cardNames.has(f.name.trim().toLowerCase())) continue;
      const n = pendingOcc(f).filter((o) => o.due <= dueDate(ym, 31)).length;
      if (isIncome(f)) incomes += n * C(f.amount); else fixed += n * C(f.amount);
    }
    let debt = 0, pre = 0;
    for (const a of cards) {
      debt += Math.max(0, -WCFin.accountBalanceC(a, S.movements, S.debts || [], S.debtPays || []));
      pre += Math.max(0, -C(a.initial_balance));
    }
    // Lo que sigue a meses después del corte de este mes no se paga este mes
    let future = 0;
    for (const a of cards) {
      const cutDate = a.cut_day ? dueDate(ym, a.cut_day) : dueDate(ym, 31);
      future += WCFin.activePlans(S.plans, a.id).reduce((s2, p) => s2 + WCFin.planUnbilledC(p, cutDate), 0);
    }
    future = Math.min(future, debt);
    pre = Math.min(Math.max(0, pre - future), debt - future);
    return { fixed: P(fixed), cardsDebt: P(debt - future), cardsFuture: P(future), cardsPre: P(pre), bills: P(fixed + pre), incomes: P(incomes) };
  }
  const subsTotals = () => { const subs = S.fixed.filter((f) => f.active && f.kind === "suscripcion"); const mc = subs.reduce((s, f) => s + WCFin.perMonthC(f), 0); return { subs, month: P(mc), year: P(mc * 12) }; };

  // ---------- Alertas inteligentes ----------
  function buildAlerts(any = false) {
    const out = [], t = today(), ym = ymOf(t);
    if (!any && S.ym !== ym) return out;
    const day = Number(t.slice(8)), dim = daysInMonth(ym);
    // Pagos que vencen (hoy, mañana, atrasados)
    for (const r of upcomingList(3).soon) {
      if (isIncome(r.f)) { if (r.days <= 0) out.push({ go: `data-pay-actions="${r.f.id}"`, lvl: "info", icon: "briefcase", txt: `${r.days < 0 ? "¿Ya te llegó" : "Hoy llega"} <b>${esc(r.f.name)}</b>${r.days < 0 ? ` del ${fmtShort(r.due)}?` : ""} (${money(Number(r.f.amount))})` }); continue; }
      const when = r.days < 0 ? `venció hace ${-r.days} día${r.days === -1 ? "" : "s"}` : r.days === 0 ? "vence <b>hoy</b>" : r.days === 1 ? "vence <b>mañana</b>" : `vence en ${r.days} días`;
      out.push({ go: `data-pay-actions="${r.f.id}"`, lvl: r.days <= 0 ? "bad" : "warn", icon: "bell", txt: `Tu pago de <b>${esc(r.f.name)}</b> ${when} (${money(Number(r.f.amount))})` });
    }
    // Tarjetas: fecha límite cercana y uso alto
    for (const c of creditSummary().cards) {
      const stA = cardStatement(c.a);
      if (stA && stA.payBy && stA.statement > 0) {
        const dd = daysBetween(today(), stA.payBy);
        if (dd <= 5) out.push({ go: `data-card-go="${c.a.id}"`, lvl: dd <= 1 ? "bad" : "warn", icon: "card", txt: `Paga <b>${money(stA.statement)}</b> de ${esc(c.a.name)} ${dd < 0 ? `(venció hace ${-dd} día${dd === -1 ? "" : "s"})` : dd === 0 ? "hoy" : dd === 1 ? "mañana" : `en ${dd} días`} para no generar intereses` });
      } else if (!stA && c.used > 0 && c.dueDays != null && c.dueDays <= 5) out.push({ go: `data-card-go="${c.a.id}"`, lvl: c.dueDays <= 1 ? "bad" : "warn", icon: "card", txt: `Fecha límite de <b>${esc(c.a.name)}</b> ${c.dueDays === 0 ? "es hoy" : c.dueDays === 1 ? "es mañana" : `en ${c.dueDays} días`}: debes ${money(c.used)}` });
      if (c.limit && c.pct >= 0.8) out.push({ go: `data-card-go="${c.a.id}"`, lvl: c.pct >= 1 ? "bad" : "warn", icon: "card", txt: `Usas el <b>${Math.round(c.pct * 100)}%</b> del crédito de ${esc(c.a.name)}` });
    }
    // Presupuestos
    for (const f of S.fixed.filter((x) => x.active && isBudget(x))) {
      const u = budgetUse(f), lvl = WCFin.budgetLevel(u.pct), push = (a) => out.push({ go: `data-budget-go="${f.id}"`, ...a });
      if (lvl > 100) push({ lvl: "bad", icon: "target", txt: `Te pasaste <b>${money(-u.left)}</b> del presupuesto de ${esc(f.name)}` });
      else if (lvl === 100) push({ lvl: "bad", icon: "target", txt: `Llegaste al <b>100%</b> del presupuesto de ${esc(f.name)}` });
      else if (lvl >= 50) push({ lvl: lvl >= 90 ? "bad" : lvl >= 75 ? "warn" : "info", icon: "target", txt: `Ya utilizaste el <b>${Math.round(u.pct * 100)}%</b> de tu presupuesto de ${esc(f.name)}` });
    }
    // Categorías: este mes vs mismos días del mes pasado
    const prev = addMonths(ym, -1), cutPrev = dueDate(prev, day);
    const sumBy = (from, to) => catTotalsRange(from, to);
    const now = sumBy(`${ym}-01`, t), before = sumBy(`${prev}-01`, cutPrev);
    const small = S.settings.currency === "MXN" ? 500 : 30;
    const ups = Object.entries(now).map(([id, v]) => [id, v - (before[id] || 0), before[id] || 0]).filter(([, d, b]) => b > 0 && d >= small && d / b >= 0.2).sort((a, b) => b[1] - a[1]).slice(0, 2);
    for (const [id, d] of ups) out.push({ go: `data-catgo="${id}"`, lvl: "warn", icon: "trendUp", txt: `Has gastado <b>${money(d)}</b> más en ${esc(cat(id)?.name || "sin categoría")} que el mes pasado (mismos días)` });
    // Proyección de fin de mes
    if (day >= 3 && day < dim) {
      const tt = totals(ym), carry = carryIn(ym).amount, cm = commitments(ym);
      const varRate = tt.varExp / day, projected = carry + tt.net + cm.incomes - cm.bills - varRate * (dim - day);
      out.push({ go: `data-goto="balance"`, lvl: projected < 0 ? "bad" : "good", icon: projected < 0 ? "trendDown" : "trendUp", txt: `Si mantienes este ritmo, terminarás el mes con <b class="${projected < 0 ? "neg" : "pos"}">${money(projected)}</b> disponibles` });
    }
    return out;
  }
  const ALERT_COLOR = { bad: "#ff6b6b", warn: "#ffb36b", good: "#3ddc97", info: "#7aa2ff" };

  // ---------- Centro de notificaciones ----------
  // Junta las alertas del mes actual (pagos, ingresos, tarjetas, presupuestos, metas y cambios sin enviar).
  // Cada aviso tiene una llave; al abrir el centro se marcan como vistos y el número del ícono de la app se borra.
  const plain = (h) => String(h).replace(/<[^>]+>/g, "");
  function notifItems() {
    const items = buildAlerts(true).filter((a) => a.icon !== "trendUp" && a.icon !== "trendDown" || a.lvl === "bad");
    for (const g of (S.goals || []).filter((x) => x.status === "activa" && x.target_date)) {
      const d = daysBetween(today(), g.target_date);
      if (d >= 0 && d <= 7) items.push({ go: `data-goal="${g.id}"`, lvl: "info", icon: "piggy", txt: `Meta <b>${esc(g.name)}</b>: faltan ${d} día${d === 1 ? "" : "s"}` });
    }
    const st = S.user ? syncState() : { err: 0 };
    if (st.err) items.unshift({ go: "data-sync-open", lvl: "bad", icon: "alert", txt: `<b>${st.err} cambio(s)</b> no se pudieron enviar · toca para revisar` });
    return items.map((a) => ({ ...a, key: `${today()}|${plain(a.txt).replace(/\$[\d,.]+/g, "")}` }));
  }
  const seenKey = () => `wc_seen_${S.user?.id}`;
  const unseen = (items = notifItems()) => { const seen = ls.get(seenKey(), {}); return items.filter((a) => !seen[a.key]); };
  function markSeen(items) {
    const seen = ls.get(seenKey(), {}), keep = {};
    for (const a of items) keep[a.key] = 1;                         // solo se guardan las de hoy que siguen activas
    for (const k of Object.keys(seen)) if (k.startsWith(today())) keep[k] = 1;
    ls.set(seenKey(), keep);
  }
  function paintBell() {
    const b = $("#notifBadge"); if (!b || !S.user) return;
    const n = unseen().length;
    b.textContent = n > 9 ? "9+" : String(n); b.hidden = !n;
  }
  function openNotifCenter() {
    const items = notifItems(), fresh = new Set(unseen(items).map((a) => a.key));
    openDyn(`<h2>Notificaciones</h2>
      ${items.length ? `<ul class="alerts notif-list">${items.map((a) => `<li class="${a.go ? "tap" : ""} ${fresh.has(a.key) ? "new" : ""}" ${a.go || ""}>${tile(a.icon, ALERT_COLOR[a.lvl], "sm")}<span>${a.txt}</span>${a.go ? ico("chevR", "i-sm a-go") : ""}</li>`).join("")}</ul>`
        : `<div class="empty"><div class="e">${ico("bell")}</div>No tienes notificaciones. Aquí aparecerán tus pagos por vencer, ingresos por recibir, tarjetas y presupuestos.</div>`}
      <div class="sheet-actions"><button type="button" class="btn ghost" data-close>Cerrar</button></div>`, (root) => {
      root.addEventListener("click", (e) => {
        const t = e.target.closest("li.tap"); if (!t) return;
        closeDyn();
        if (t.hasAttribute("data-sync-open")) { openSettings(); setTimeout(() => $("#syncBox")?.scrollIntoView({ block: "center" }), 250); return; }
        setTimeout(() => viewAction(t), 60);
      });
    });
    markSeen(items); paintBell(); updateBadge();
  }

  // ---------- Colores por categoría (cada gasto con su color) ----------
  const PALETTE = ["#5eead4", "#7aa2ff", "#f0a6ea", "#ffb36b", "#b69cff", "#67d4ff", "#ffd36b", "#ff8fa3", "#9be37a", "#ff9d6b"];
  const colorFor = (id) => { let h = 0; for (const ch of String(id || "-")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  const tile = (key, color, extra = "") => `<div class="tile${extra ? " " + extra : ""}" style="--c:${color}">${ico(key)}</div>`;
  const pill = (txt, color, key = "clock") => `<span class="pill" style="--c:${color}">${ico(key, "i-sm")}${txt}</span>`;
  // Anillo de progreso con ícono al centro
  function ring(pct, color, key) {
    const r = 26, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
    return `<div class="ring" style="--c:${color}"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="trk"/>
      <circle cx="32" cy="32" r="${r}" class="val" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/></svg>${ico(key)}</div>`;
  }
  // Línea de saldo del mes (como la de "Net worth")
  function sparkline(ym, carry) {
    const isCur = ym === ymOf(today()), last = isCur ? Number(today().slice(8)) : daysInMonth(ym);
    const byDay = new Array(last + 1).fill(0);
    for (const m of monthMovs(ym)) {
      const d = Number(m.date.slice(8)); if (d > last) continue;
      byDay[d] += m.type === "ingreso" ? Number(m.amount) : m.type === "gasto" ? -Number(m.amount) : 0;
    }
    const run = []; let acc = carry;
    for (let d = 1; d <= last; d++) { acc += byDay[d]; run.push(acc); }
    const N = Math.min(7, run.length), pts = [];
    for (let i = 0; i < N; i++) pts.push(run[Math.round(i * (run.length - 1) / Math.max(1, N - 1))]);
    if (pts.length < 2) pts.unshift(carry);
    const W = 128, H = 46, P = 5, mn = Math.min(...pts), mx = Math.max(...pts), span = mx - mn || 1;
    const xy = pts.map((v, i) => [P + i * (W - 2 * P) / (pts.length - 1), H - P - (v - mn) / span * (H - 2 * P)]);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}"/>
      ${xy.map(([x, y], i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" class="${i === xy.length - 1 ? "end" : ""}"/>`).join("")}</svg>`;
  }

  function viewInicio() {
    const ym = S.ym, t = totals(ym);
    const budget = Number(S.settings.budget) || 0;
    const cur = ymOf(today()), isCur = ym === cur;
    const carry = carryIn(ym), avail = t.net + carry.amount;
    const fromLbl = carry.months === 1 ? monthName(addMonths(ym, -1)) : "meses anteriores";
    const left = daysInMonth(ym) - Number(today().slice(8));
    const status = isCur ? `${left} día${left === 1 ? "" : "s"} restantes` : ym < cur ? "Mes cerrado" : "Próximo";

    // 1) Disponible — tono verde agua
    let html = `<section class="card tone" style="--t:#5eead4">
      <div class="c-head"><span class="c-title">Balance del mes ${eyeBtn()}</span>${pill(status, "#5eead4")}</div>
      <div class="net">
        <div><div class="big num ${avail < 0 ? "neg" : ""}">${pm(avail)}</div>
          <div class="delta-line ${t.net < 0 ? "neg" : "pos"}">${ico(t.net < 0 ? "arrowDown" : "arrowUp", "i-sm")} ${pm(Math.abs(t.net))}${carry.amount > 0 && t.net ? ` (${(t.net / carry.amount * 100).toFixed(1)}%)` : ""} <span class="muted">en ${monthName(ym)}</span></div></div>
        ${sparkline(ym, carry.amount)}
      </div>
      ${carry.months ? `<p class="hint">${carry.amount >= 0 ? "Incluye" : "Se restan"} <b class="num">${pm(Math.abs(carry.amount))}</b> ${carry.amount >= 0 ? "que te sobraron" : "que quedaron en contra"} de ${fromLbl}</p>` : ""}
      <div class="split2">
        <div><span class="k">Ingresos</span><b class="num pos">${pm(t.inc)}</b></div>
        <div><span class="k">Gastos</span><b class="num">${money(t.exp)}</b></div>
      </div>`;
    // Saldo real: lo comprometido para pagos del mes y lo que queda libre
    const cm = commitments(ym);
    if (cm.bills || cm.incomes || cm.cardsDebt) html += `<div class="split2 thin">
        <div><span class="k">Comprometido en pagos</span><b class="num neg">${money(cm.bills)}</b>${cm.cardsDebt ? `<small class="cm-sub">Pagos fijos ${money(cm.fixed)} · Tarjetas ${money(cm.cardsPre)}</small>` : ""}</div>
        <div><span class="k">Libre después de pagos</span><b class="num ${avail - cm.bills < 0 ? "neg" : ""}">${pm(avail - cm.bills)}</b></div>
      </div>${cm.cardsDebt > cm.cardsPre ? `<p class="hint" style="margin:8px 0 0">${ico("card", "i-sm")} En tarjetas debes ${money(cm.cardsDebt)} en total; ${money(P(C(cm.cardsDebt) - C(cm.cardsPre)))} ya está en tus gastos del mes.</p>` : ""}${cm.incomes ? `<p class="hint" style="margin:8px 0 0">${ico("briefcase", "i-sm")} Por recibir este mes: <b class="num pos">${pm(cm.incomes)}</b></p>` : ""}`;
    if (budget > 0) {
      const pct = t.exp / budget;
      html += `<div class="bar-soft ${pct > 1 ? "over" : ""}"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></div>
        <div class="foot"><span>${ico("target", "i-sm")} Presupuesto: ${money(budget)}</span><span>${Math.round(pct * 100)}%</span></div>`;
    }
    if (!t.inc && isCur) html += S.fixed.some((f) => f.active && isIncome(f))
      ? `<p class="hint" style="margin:12px 0 0">${ico("bulb", "i-sm")} Cuando te llegue tu sueldo, tócale <b>Recibir</b> para contarlo.</p>`
      : `<p class="hint" style="margin:12px 0 0">${ico("bulb", "i-sm")} Registra tu sueldo con <b>+ → Ingreso</b>, o agrégalo en <b>Fijos</b> como ingreso fijo.</p>`;
    html += `</section>`;

    // Indicadores principales (periodo elegido)
    const pr = periodRange(), tr = totalsRange(pr.from, pr.to), mp = moneyPicture(), nwI = netWorth();
    const ind = (k, v, cls = "", sub = "") => `<div class="ind"><span>${k}</span><b class="num ${cls}">${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    html = periodChips() + html + `<section class="card"><div class="c-head"><span class="c-title">Resumen ${eyeBtn()}</span>${pill(pr.label, "#a1a1a8", "calendar")}</div>
      <div class="ind-grid">
        ${ind("Disponible real", pm(mp.available), mp.available < 0 ? "neg" : "pos", "saldo − reservado − compromisos")}
        ${ind("Saldo en cuentas", pm(mp.liquid))}
        ${ind("Ingresos", pm(tr.inc), "pos")}
        ${ind("Gastos", money(tr.exp))}
        ${ind("Comprometido", money(mp.commitments), mp.commitments ? "neg" : "", mp.cardsDebt ? "pagos del mes + tarjetas" : "pagos por hacer este mes")}
        ${ind("Pagos pendientes", String(mp.pendingCount), mp.pendingCount ? "warn-t" : "")}
        ${ind("Deuda total", money(nwI.debts), nwI.debts ? "neg" : "")}
        ${ind("Ahorro acumulado", pm(mp.reserved), "pos")}
      </div></section>`;

    // Alertas inteligentes
    const alerts = buildAlerts();
    if (alerts.length) html += `<section class="card tone" style="--t:#ffb36b"><div class="c-head"><span class="c-title">Alertas</span>${pill(String(alerts.length), "#ffb36b", "bell")}</div>
      <ul class="alerts">${alerts.map((a) => `<li class="${a.go ? "tap" : ""}" ${a.go || ""}>${tile(a.icon, ALERT_COLOR[a.lvl], "sm")}<span>${a.txt}</span>${a.go ? ico("chevR", "i-sm a-go") : ""}</li>`).join("")}</ul></section>`;

    // 2) Cuentas
    const accs = activeAccs();
    if (accs.length) {
      html += `<div class="acc-scroll">${accs.map((a) => {
        const b = accountBalance(a), c = colorFor(a.id);
        return `<div class="acc-card">${tile(iconKey(a.icon, a.name, "wallet"), c, "sm")}<div><div class="n">${esc(a.name)}</div><div class="v num ${b < 0 ? "neg" : ""}">${isCredit(a) ? money(b) : pm(b)}</div></div></div>`;
      }).join("")}</div>`;
    }

    // Crédito y deudas
    const cs = creditSummary(), pendCards = pendingCardPayments();
    if (cs.cards.length || cs.loans.length || pendCards.length) {
      html += `<section class="card tone" style="--t:#ff8fa3">
        <div class="c-head"><span class="c-title">Tarjetas y deudas</span><button class="chev" data-goto="tarjetas" aria-label="Ver tarjetas">${ico("chevR")}</button></div>
        ${cs.cards.length ? `<div class="hint" style="margin:0 0 6px">Total de tus tarjetas</div>${triple(cs.limit, cs.used, cs.limit ? cs.avail : null)}` : ""}
        ${cs.loansLeft ? `<p class="hint" style="margin:10px 0 0">Préstamos pendientes: <b class="num neg">${money(cs.loansLeft)}</b> · deuda total <b class="num neg">${money(cs.debt)}</b></p>` : ""}
        ${cs.limit ? `<div class="bar-soft ${cs.used / cs.limit >= 0.8 ? "over" : ""}"><i style="width:${Math.min(100, cs.used / cs.limit * 100).toFixed(1)}%"></i></div>
          <div class="foot"><span>Utilizado ${money(cs.used)}</span><span>${Math.round(cs.used / cs.limit * 100)}%</span></div>` : ""}
        <div class="cc-list" style="margin-top:12px">${cs.cards.map(cardBlock).join("")}</div>
        ${pendCards.length ? `<button class="btn primary block" style="margin-top:12px" data-cards-from-pays>${ico("card")} Crear mis ${pendCards.length} tarjetas (${pendCards.map((f) => esc(f.name)).join(", ")})</button>` : ""}
        <ul class="list">${cs.loans.map((x) => `<li class="item tap" data-edit-fixed="${x.f.id}">
          ${tile(iconKey(cat(x.f.category_id)?.icon, x.f.name, "car"), colorFor(x.f.id))}
          <div class="main"><div class="t">${esc(x.f.name)} <span class="amt-inline">${money(x.d.left)}</span></div><div class="s">${x.d.paid}/${x.d.total} cuotas pagadas</div></div>
        </li>`).join("")}</ul>
      </section>`;
    }

    // 3) Flujo de efectivo — tono azul (6 meses: ingresos vs gastos)
    const endYm = S.period === "mes" ? ym : ymOf(pr.to);
    const months = Array.from({ length: 6 }, (_, i) => addMonths(endYm, i - 5));
    const flows = months.map((m) => totals(m));
    const mxf = Math.max(1, ...flows.map((f) => Math.max(f.inc, f.exp)));
    html += `<section class="card tone" style="--t:#7aa2ff">
      <div class="c-head"><span class="c-title">Flujo de efectivo</span><button class="chev" data-goto="balance" aria-label="Ver balance">${ico("chevR")}</button></div>
      <div class="flow">${months.map((m, i) => `<div class="fcol ${m === ym ? "cur" : ""}">
        <div class="fbars"><i class="in" style="height:${(flows[i].inc / mxf * 100).toFixed(1)}%"></i><i class="out" style="height:${(flows[i].exp / mxf * 100).toFixed(1)}%"></i></div>
        <span>${monthName(m, true)}</span></div>`).join("")}</div>
      <div class="legend2"><span><i class="in"></i>Ingresos</span><span><i class="out"></i>Gastos</span></div>
    </section>`;

    // 4) Presupuestos — anillos (rojo pasado, ámbar casi, verde bien)
    const budgets = S.fixed.filter((f) => f.active && isBudget(f));
    if (budgets.length && isCur) {
      html += `<section class="card tone" style="--t:#ffb36b">
        <div class="c-head"><span class="c-title">Presupuestos</span><button class="chev" data-goto="fijos" aria-label="Ver fijos">${ico("chevR")}</button></div>
        <div class="rings">${budgets.map((f) => {
          const u = budgetUse(f), c = cat(f.category_id);
          const col = u.pct > 1 ? "#ff6b6b" : u.pct >= 0.8 ? "#ffb36b" : "#3ddc97";
          return `<div class="rcell tap" data-edit-fixed="${f.id}">${ring(u.pct > 1 ? 1 : 1 - u.pct, col, iconKey(c?.icon, c?.name, "target"))}
            <b class="num">${money(Math.abs(u.left))}</b><span>${u.left < 0 ? "excedido" : "disponible"}</span><em>${esc(f.name)}</em></div>`;
        }).join("")}</div>
      </section>`;
    }

    // 5) ¿En qué gastas? — un círculo de color por categoría
    const ct = Object.entries(catTotalsRange(pr.from, pr.to)).sort((a, b) => b[1] - a[1]);
    const ctTotal = sumP(ct, (x) => x[1]);
    if (ct.length) {
      html += `<section class="card tone" style="--t:#f0a6ea">
        <div class="c-head"><span class="c-title">¿En qué gastas?</span><button class="chev" data-goto="balance" aria-label="Ver balance">${ico("chevR")}</button></div>
        <div class="rings">${ct.map(([id, v]) => {
          const c = cat(id) || { icon: "box", name: "Sin categoría" }, col = colorFor(id);
          return `<div class="rcell tap" data-catgo="${id}">${ring(v / ctTotal, col, iconKey(c.icon, c.name))}
            <b class="num">${money(v)}</b><span>${Math.round(v / ctTotal * 100)}%</span><em>${esc(c.name)}</em></div>`;
        }).join("")}</div>
      </section>`;
    }

    // 6) Próximos pagos — tono ámbar con píldoras de días
    const up = upcomingList(10);
    html += `<section class="card tone" style="--t:#b69cff"><div class="c-head"><span class="c-title">Próximos pagos</span><button class="link" data-goto="fijos">Ver todos</button></div>`;
    if (!S.fixed.some((f) => f.active && !isBudget(f))) {
      html += `<div class="empty"><div class="e">${ico("calendar")}</div>Agrega tus pagos fijos (tarjetas, luz, colegio…) o tu sueldo para recordarlos.<br><br><button class="btn primary" data-new-fixed>Agregar fijo</button></div>`;
    } else if (!up.soon.length) {
      html += `<div class="empty"><div class="e ok">${ico("checkCircle")}</div>Todo al corriente.${up.next ? `<br><span class="hint">Siguiente: <b>${esc(up.next.f.name)}</b> ${fmtDay(up.next.due)} (${money(Number(up.next.f.amount))})</span>` : ""}</div>`;
    } else {
      html += `<ul class="list">${up.soon.map(upcomingItem).join("")}</ul>`;
    }
    html += `</section>`;

    // 7) Últimos movimientos
    const recent = monthMovs(ym).slice(0, 6);
    html += `<section class="card"><div class="c-head"><span class="c-title">Últimos movimientos</span><button class="link" data-goto="movimientos">Ver todos ${ico("chevR", "i-sm")}</button></div>`;
    html += recent.length ? `<ul class="list">${recent.map((m) => movItem(m, true)).join("")}</ul>`
      : `<div class="empty"><div class="e">${ico("receipt")}</div>Aún no hay movimientos este mes.<br>Toca <b>+</b> para agregar tu primer gasto.</div>`;
    html += `</section>`;
    return html;
  }

  function viewMovs() {
    // Rango: el mes elegido, o todo el historial / fechas propias con los filtros
    const fromF = S.mf_from || "", toF = S.mf_to || "";
    const allHist = !!S.mf_all || fromF || toF;
    let base = allHist ? S.movements.filter((m) => (!fromF || m.date >= fromF) && (!toF || m.date <= toF)) : monthMovs(S.ym);
    if (S.movAcc) base = base.filter((m) => m.account_id === S.movAcc || m.to_account_id === S.movAcc);
    const q = (S.mf_q || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const mn = parseAmount(S.mf_min || ""), mx = parseAmount(S.mf_max || "");
    if (q) base = base.filter((m) => [m.note, m.notes, (m.tags || []).join(" "), cat(m.category_id)?.name, acc(m.account_id)?.name, String(m.amount)].some((x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)));
    if (mn > 0) base = base.filter((m) => Number(m.amount) >= mn);
    if (mx > 0) base = base.filter((m) => Number(m.amount) <= mx);
    const all = base;
    const f = S.movFilter;
    const usedCats = [...new Set(all.map((m) => m.category_id).filter(Boolean))].map(cat).filter(Boolean);
    const list = all.filter((m) => f === "todos" ? true : f === "gasto" || f === "ingreso" || f === "transferencia" ? m.type === f : m.category_id === f);
    const chip = (k, label) => `<button class="chip ${f === k ? "active" : ""}" data-filter="${k}">${label}</button>`;
    const fa = acc(S.movAcc);
    let html = `<div class="mov-tools">
      <input class="inp" data-mfilter="q" value="${esc(S.mf_q || "")}" placeholder="Buscar en movimientos…">
      <details class="more-fields" ${allHist || mn > 0 || mx > 0 || S.movAcc ? "open" : ""}><summary>${ico("filter", "i-sm")} Filtros</summary>
        <div class="row2"><label class="field"><span>Desde</span><input type="date" data-mfilter="from" value="${fromF}"></label><label class="field"><span>Hasta</span><input type="date" data-mfilter="to" value="${toF}"></label></div>
        <div class="row2"><label class="field"><span>Importe mínimo</span><input data-mfilter="min" inputmode="decimal" value="${esc(S.mf_min || "")}"></label><label class="field"><span>Importe máximo</span><input data-mfilter="max" inputmode="decimal" value="${esc(S.mf_max || "")}"></label></div>
        <div class="row2"><label class="field"><span>Cuenta</span><select data-mfilter="acc">${accOptions(S.movAcc)}</select></label>
          <label class="field"><span>Periodo</span><select data-mfilter="all"><option value="">Mes de arriba</option><option value="1" ${S.mf_all ? "selected" : ""}>Todo el historial</option></select></label></div>
        <button type="button" class="btn sm ghost" data-mreset>Quitar filtros</button>
      </details></div>
      ${fa ? `<p class="hint">Cuenta: <b>${esc(fa.name)}</b> <button class="link" data-clear-acc>quitar</button></p>` : ""}
      <div class="filters">${chip("todos", "Todos")}${chip("gasto", "Gastos")}${chip("ingreso", "Ingresos")}${all.some((m) => m.type === "transferencia") ? chip("transferencia", "Transferencias") : ""}${usedCats.map((c) => chip(c.id, `${catIco(c)}${esc(c.name)}`)).join("")}</div>`;
    if (!list.length) return html + `<div class="card empty"><div class="e">${ico("receipt")}</div>Sin movimientos.</div>`;
    const sum = sumP(list, (m) => (m.type === "ingreso" ? m.amount : m.type === "gasto" ? -m.amount : 0));
    html += `<p class="hint">${list.length} movimiento(s) · total <b class="num">${money(sum)}</b>${allHist ? " · " + (fromF || toF ? `${fromF ? fmtShort(fromF) : "inicio"} – ${toF ? fmtShort(toF) : "hoy"}` : "todo el historial") : ""}</p><section class="card">`;
    const byDay = {};
    for (const m of list.slice(0, 500)) (byDay[m.date] ||= []).push(m);
    for (const d of Object.keys(byDay).sort().reverse()) {
      const dayExp = sumP(byDay[d].filter((m) => m.type === "gasto"), (m) => m.amount);
      html += `<div class="day-group"><span>${fmtDay(d)}</span><span class="num">${dayExp ? "−" + money(dayExp) : ""}</span></div><ul class="list">${byDay[d].map((m) => movItem(m)).join("")}</ul>`;
    }
    if (list.length > 500) html += `<p class="hint center">Se muestran los 500 más recientes. Usa los filtros para acotar.</p>`;
    return html + `</section>`;
  }

  function viewFijos() {
    const ym = S.ym;
    const list = S.fixed.filter((f) => f.active && !isBudget(f));
    if (!list.length) {
      return `<section class="card"><div class="empty"><div class="e">${ico("calendar")}</div><b>Tus fijos</b><br>Pagos (tarjetas, luz, colegio, suscripciones, deudas), ingresos fijos (sueldo por semana, quincena o mes) y presupuestos (ej. gasolina $850 cada semana).<br><br><button class="btn primary" data-new-fixed>Agregar fijo</button></div></section>`;
    }
    // Suma de las ocurrencias del mes (lo pagado cuenta con su monto real)
    const sumOcc = (items) => {
      let total = 0, done = 0;
      for (const f of items) for (const o of monthOcc(f, ym)) {
        const v = o.mov ? C(o.mov.amount) : C(f.amount);
        total += v; if (o.mov) done += v;
      }
      return { total: P(total), done: P(done) };
    };
    const firstDue = (f) => monthOcc(f, ym)[0]?.due || "9999";
    const item = (f) => {
      const s = fixedStatus(f, ym), c = cat(f.category_id), dp = debtProgress(f), inc = isIncome(f);
      const amt = s.paid ? Number(s.mov.amount) : Number(f.amount);
      const action = s.none ? "" : s.paid ? `<button class="btn sm" data-mov-open="${s.mov.id}" aria-label="Ver pago">${ico("check")}</button>`
        : `<button class="btn sm ${inc ? "" : "primary"}" data-pay="${f.id}" data-month="${s.key}">${inc ? "Recibir" : "Pagar"}</button>`;
      return `<li class="item">
        <div class="ico tap${inc ? " inc" : ""}" data-pay-actions="${f.id}">${catIco(c, inc ? "briefcase" : "calendar")}</div>
        <div class="main tap" data-pay-actions="${f.id}">
          <div class="t">${esc(f.name)}</div>
          <div class="s"><span class="badge ${s.cls}">${s.label}</span> · <span class="${inc ? "pos" : ""}">${money(amt)}</span>${freqOf(f) !== "mensual" ? ` · ${scheduleLabel(f)}` : ""}</div>
          ${dp ? `<div class="s">${dp.paid}/${dp.total} cuotas · faltan ${money(dp.left)}</div><div class="progress debt-bar"><i style="width:${(dp.pct * 100).toFixed(1)}%"></i></div>` : ""}
        </div>
        <div class="actions">${action}</div>
      </li>`;
    };
    let html = "";
    // Pagos e ingresos de meses anteriores que quedaron sin marcar (solo desde el inicio del control)
    if (ym === ymOf(today())) {
      const late = list.filter((f) => !isBudget(f))
        .flatMap((f) => pendingOcc(f).filter((o) => o.due < `${ym}-01`).map((o) => ({ f, month: o.key, due: o.due, days: daysBetween(today(), o.due) })))
        .sort((a, b) => a.due.localeCompare(b.due));
      if (late.length) {
        const owe = sumP(late.filter((r) => !isIncome(r.f)), (r) => r.f.amount);
        html += `<section class="card"><h2><span class="ttl">${ico("clock")}De meses anteriores</span>${owe ? ` <span class="hint num neg">${money(owe)} por pagar</span>` : ""}</h2><ul class="list">${late.map(upcomingItem).join("")}</ul></section>`;
      }
    }
    const bills = list.filter(isBill);
    if (bills.length) {
      const { total, done } = sumOcc(bills);
      html += `<section class="card hero">
        <div class="label">Pagos fijos de ${monthName(ym)}</div>
        <div class="big num">${money(total)}</div>
        <div class="stats" style="grid-template-columns:1fr 1fr">
          <div class="stat"><div class="k">Pagado</div><div class="v num pos">${money(done)}</div></div>
          <div class="stat"><div class="k">Pendiente</div><div class="v num">${money(total - done)}</div></div>
        </div>
        <div class="progress"><i style="width:${total ? (done / total * 100).toFixed(1) : 0}%"></i></div>
      </section>`;
    }
    const incomes = list.filter(isIncome).sort((a, b) => firstDue(a).localeCompare(firstDue(b)));
    if (incomes.length) {
      const { total, done } = sumOcc(incomes);
      html += `<section class="card"><h2>${KIND_LABEL.ingreso} <span class="hint num">${money(done)} de ${money(total)}</span></h2><ul class="list">${incomes.map(item).join("")}</ul></section>`;
    }
    for (const kind of ["tarjeta", "servicio", "seguro", "suscripcion", "deuda", "otro"]) {
      const items = list.filter((f) => f.kind === kind).sort((a, b) => firstDue(a).localeCompare(firstDue(b)));
      if (!items.length) continue;
      const extra = kind === "suscripcion" ? (() => { const st = subsTotals(); return ` <span class="hint num">${money(st.month)}/mes · ${money(st.year)}/año</span>`; })() : "";
      html += `<section class="card"><h2>${KIND_LABEL[kind]}${extra}</h2><ul class="list">${items.map(item).join("")}</ul></section>`;
    }
    html += `<button class="btn block" data-new-fixed>${ico("plus")} Agregar pago</button>`;
    return html;
  }

  function viewBalance() {
    const ym = S.ym, prevYm = addMonths(ym, -1);
    const t = totals(ym), tp = totals(prevYm);
    const rate = t.inc > 0 ? t.net / t.inc : null;
    const pct = (a, b) => (b ? Math.round((a - b) / Math.abs(b) * 100) : null);
    const dTag = (a, b, goodUp) => { const d = pct(a, b); if (d == null || d === 0) return ""; const good = goodUp ? d > 0 : d < 0;
      return `<span class="dchip ${good ? "pos" : "neg"}">${ico(d > 0 ? "arrowUp" : "arrowDown", "i-sm")}${Math.abs(d)}%</span>`; };

    // Resumen del mes
    let html = `<section class="card tone" style="--t:#3ddc97">
      <div class="c-head"><span class="c-title">${t.net >= 0 ? "Ahorro" : "Déficit"} de ${monthName(ym)}</span>${pill(rate == null ? "Sin ingresos" : `${Math.round(rate * 100)}% ahorrado`, t.net >= 0 ? "#3ddc97" : "#ff6b6b", "piggy")}</div>
      <div class="net"><div class="big num ${t.net < 0 ? "neg" : ""}">${money(t.net)}</div></div>
      <div class="split2"><div><span class="k">Ingresos ${dTag(t.inc, tp.inc, true)}</span><b class="num pos">${money(t.inc)}</b></div>
        <div><span class="k">Gastos ${dTag(t.exp, tp.exp, false)}</span><b class="num">${money(t.exp)}</b></div></div>`;
    if (t.exp > 0) {
      const fp = t.fixedExp / t.exp;
      html += `<div class="split" role="img" aria-label="Fijos ${Math.round(fp * 100)}%, variables ${Math.round((1 - fp) * 100)}%">
        ${t.fixedExp ? `<i class="fx" style="width:${fp * 100}%"></i>` : ""}${t.varExp ? `<i class="vr" style="width:${(1 - fp) * 100}%"></i>` : ""}</div>
        <div class="legend"><span class="l-fx">Fijos ${money(t.fixedExp)}</span><span class="l-vr">Variables ${money(t.varExp)}</span></div>`;
    }
    html += `<p class="hint" style="margin:10px 0 0">Flechas: comparado con ${monthName(prevYm)}.</p></section>`;

    // Indicadores del periodo elegido
    const pr = periodRange(), tr = totalsRange(pr.from, pr.to);
    const days = Math.max(1, daysBetween(pr.from, pr.to < today() ? pr.to : today()) + 1);
    const catsR = Object.entries(catTotalsRange(pr.from, pr.to)).sort((a, b) => b[1] - a[1]);
    const topC = catsR[0], capacity = tr.inc > 0 ? tr.net / tr.inc : null;
    const ind = (k, v, cls = "", sub = "") => `<div class="ind"><span>${k}</span><b class="num ${cls}">${v}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
    html = periodChips() + `<section class="card"><div class="c-head"><span class="c-title">Indicadores</span>${pill(pr.label, "#a1a1a8", "calendar")}</div>
      <div class="ind-grid">
        ${ind("Total de ingresos", money(tr.inc), "pos")}${ind("Total de gastos", money(tr.exp))}
        ${ind("Diferencia", money(tr.net), tr.net < 0 ? "neg" : "pos")}${ind("Promedio diario de gastos", money(P(Math.round(C(tr.exp) / days))), "", `${days} días`)}
        ${ind("Mayor consumo", topC ? esc(cat(topC[0])?.name || "Sin categoría") : "—", "", topC ? money(topC[1]) : "")}
        ${ind("Variación mensual (gastos)", tp.exp ? `${Math.round((t.exp - tp.exp) / tp.exp * 100)}%` : "—", t.exp > tp.exp ? "neg" : "pos", `${monthName(ym, true)} vs ${monthName(prevYm, true)}`)}
        ${ind("Capacidad de ahorro", capacity == null ? "—" : `${Math.round(capacity * 100)}%`, capacity != null && capacity < 0 ? "neg" : "pos", "de tus ingresos")}
        ${ind("Ahorro acumulado", money(reservedTotal()), "pos", "en metas")}
      </div></section>` + html;

    // Gastos por cuenta (periodo)
    const byAcc = {};
    for (const m of S.movements) if (m.type === "gasto" && m.date >= pr.from && m.date <= pr.to) byAcc[m.account_id || "-"] = (byAcc[m.account_id || "-"] || 0) + C(m.amount);
    const accRows = Object.entries(byAcc).sort((a, b) => b[1] - a[1]);
    if (accRows.length) {
      const mxA = accRows[0][1];
      html += `<section class="card tone" style="--t:#ffd36b"><div class="c-head"><span class="c-title">Gastos por cuenta</span></div><div class="bars">${accRows.map(([id, v]) => {
        const a = acc(id) || { name: "Sin cuenta" };
        return `<div class="bar-row"><div class="top"><span class="n">${esc(a.name)}</span><b class="num">${money(P(v))}</b></div><div class="bar-track"><i style="width:${(v / mxA * 100).toFixed(1)}%;background:${a.id ? a.color || colorFor(a.id) : "#a1a1a8"}"></i></div></div>`;
      }).join("")}</div></section>`;
    }

    // Patrimonio neto
    const nw = netWorth(), accs = activeAccs();
    html += `<section class="card tone" style="--t:#7aa2ff">
      <div class="c-head"><span class="c-title">Patrimonio neto</span>${pill("hoy", "#7aa2ff", "clock")}</div>
      <div class="big num ${nw.net < 0 ? "neg" : ""}" style="font-size:32px;font-weight:700;letter-spacing:-1px">${money(nw.net)}</div>
      <div class="split2"><div><span class="k">Tengo (cuentas)</span><b class="num pos">${money(nw.assets)}</b></div><div><span class="k">Debo (crédito y préstamos)</span><b class="num neg">${money(nw.debts)}</b></div></div>
      <ul class="list" style="margin-top:8px">${accs.map((a) => { const b = accountBalance(a);
        return `<li class="item tap" data-credit="${a.id}">${tile(iconKey(a.icon, a.name, "wallet"), colorFor(a.id), "sm")}<div class="main"><div class="t">${esc(a.name)}</div><div class="s">${ACC_KIND[a.kind] || ""}</div></div><div class="amt num ${b < 0 ? "neg" : ""}">${money(b)}</div></li>`; }).join("")}</ul>
    </section>`;

    // Ingresos contra gastos (12 meses)
    const m12 = Array.from({ length: 12 }, (_, i) => addMonths(ym, i - 11)), f12 = m12.map((m) => totals(m));
    const mx = Math.max(1, ...f12.map((f) => Math.max(f.inc, f.exp)));
    html += `<section class="card tone" style="--t:#67d4ff">
      <div class="c-head"><span class="c-title">Ingresos contra gastos</span>${pill("12 meses", "#67d4ff", "chart")}</div>
      <div class="flow f12">${m12.map((m, i) => `<div class="fcol ${m === ym ? "cur" : ""}" title="${monthName(m)}: +${money(f12[i].inc)} / −${money(f12[i].exp)}">
        <div class="fbars"><i class="in" style="height:${(f12[i].inc / mx * 100).toFixed(1)}%"></i><i class="out" style="height:${(f12[i].exp / mx * 100).toFixed(1)}%"></i></div>
        <span>${monthName(m, true).slice(0, 1)}</span></div>`).join("")}</div>
      <div class="legend2"><span><i class="in"></i>Ingresos</span><span><i class="out"></i>Gastos</span></div>
    </section>`;

    // Comparación mensual y anual
    const yr = ym.slice(0, 4), ly = String(Number(yr) - 1);
    const ysum = (y, upTo) => { const a = { inc: 0, exp: 0 }; for (let i = 1; i <= upTo; i++) { const x = totals(`${y}-${pad(i)}`); a.inc += x.inc; a.exp += x.exp; } return a; };
    const upTo = Number(ym.slice(5)), Y = ysum(yr, upTo), L = ysum(ly, upTo);
    const row = (lbl, a, b, goodUp) => `<tr><td>${lbl}</td><td class="num">${money(b)}</td><td class="num"><b>${money(a)}</b></td><td>${dTag(a, b, goodUp)}</td></tr>`;
    html += `<section class="card tone" style="--t:#b69cff">
      <div class="c-head"><span class="c-title">Comparación mensual</span></div>
      <table class="cmp"><thead><tr><th></th><th>${monthName(prevYm, true)}</th><th>${monthName(ym, true)}</th><th></th></tr></thead>
        <tbody>${row("Ingresos", t.inc, tp.inc, true)}${row("Gastos", t.exp, tp.exp, false)}${row("Neto", t.net, tp.net, true)}</tbody></table>
      <div class="c-head" style="margin-top:18px"><span class="c-title">Comparación anual</span>${pill(`ene–${monthName(ym, true)}`, "#b69cff", "calendar")}</div>
      <table class="cmp"><thead><tr><th></th><th>${ly}</th><th>${yr}</th><th></th></tr></thead>
        <tbody>${row("Ingresos", Y.inc, L.inc, true)}${row("Gastos", Y.exp, L.exp, false)}${row("Neto", Y.inc - Y.exp, L.inc - L.exp, true)}</tbody></table>
    </section>`;

    // Gastos por categoría (color de cada categoría)
    const byCat = catTotals(ym), byCatPrev = catTotals(prevYm);
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    html += `<section class="card tone" style="--t:#f0a6ea"><div class="c-head"><span class="c-title">Gastos por categoría</span></div>`;
    if (!rows.length) html += `<div class="empty">Sin gastos este mes.</div>`;
    else {
      const max = rows[0][1];
      html += `<div class="bars">${rows.map(([id, v]) => {
        const c = cat(id) || { icon: "box", name: "Sin categoría" }, col = colorFor(id);
        return `<div class="bar-row tap" data-catgo="${id}"><div class="top"><span class="n">${esc(c.name)} · ${Math.round(v / t.exp * 100)}%</span><b class="num">${money(v)}${dTag(v, byCatPrev[id] || 0, false)}</b></div>
          <div class="bar-track"><i style="width:${(v / max * 100).toFixed(1)}%;background:${col}"></i></div></div>`;
      }).join("")}</div>`;
    }
    html += `</section>`;

    // Suscripciones
    const st = subsTotals();
    if (st.subs.length) html += `<section class="card tone" style="--t:#ff8fa3">
      <div class="c-head"><span class="c-title">Suscripciones</span>${pill(`${st.subs.length}`, "#ff8fa3", "tv")}</div>
      <div class="split2" style="margin-top:0;padding-top:0;border:0"><div><span class="k">Al mes</span><b class="num">${money(st.month)}</b></div><div><span class="k">Al año</span><b class="num">${money(st.year)}</b></div></div>
      <ul class="list" style="margin-top:8px">${st.subs.map((f) => `<li class="item tap" data-edit-fixed="${f.id}">${tile(iconKey(cat(f.category_id)?.icon, f.name, "tv"), colorFor(f.id), "sm")}<div class="main"><div class="t">${esc(f.name)}</div><div class="s">${scheduleLabel(f)}</div></div><div class="amt num">${money(perMonth(f))}<small class="orig">${money(perMonth(f) * 12)}/año</small></div></li>`).join("")}</ul>
    </section>`;

    // Consejos
    const tips = buildTips(ym, t, tp);
    if (tips.length) html += `<section class="card"><div class="c-head"><span class="c-title">Cómo ahorrar más</span></div><ul class="tips">${tips.map(([e2, s2]) => `<li><span class="e">${ico(e2)}</span><span>${s2}</span></li>`).join("")}</ul></section>`;

    // Evolución de deudas (saldo al cierre de cada mes: tarjetas + préstamos)
    const evo = Array.from({ length: 6 }, (_, i) => addMonths(ymOf(today()), i - 5)).map((m) => [m, debtAt(dueDate(m, 31) > today() ? today() : dueDate(m, 31))]);
    const mxD = Math.max(1, ...evo.map((x) => x[1]));
    if (evo.some((x) => x[1] > 0)) html += `<section class="card tone" style="--t:#ff8fa3"><div class="c-head"><span class="c-title">Evolución de deudas</span></div>
      <div class="trend">${evo.map(([m, v]) => `<div class="col ${m === ymOf(today()) ? "cur" : ""}"><span class="val num">${v ? money(v, { short: true }).replace(/\.\d+$/, "") : ""}</span><div class="b" style="height:${(v / mxD * 100).toFixed(1)}%;background:#ff8fa3"></div><span class="m">${monthName(m, true)}</span></div>`).join("")}</div></section>`;

    // Exportar (respeta el periodo elegido)
    html += `<section class="card"><div class="c-head"><span class="c-title">Exportar reportes</span>${pill(pr.label, "#a1a1a8", "calendar")}</div>
      <div class="row3"><button class="btn" data-export="xlsx">${ico("file")} Excel</button><button class="btn" data-export="pdf">${ico("receipt")} PDF</button><button class="btn" data-export="csv">${ico("download")} CSV</button></div></section>`;
    return html;
  }

  const catTotalsRange = (from, to) => Object.fromEntries(Object.entries(WCFin.byCategoryC(S.movements, from, to)).map(([k, v]) => [k, P(v)]));
  const catTotals = (ym) => catTotalsRange(`${ym}-01`, dueDate(ym, 31));
  function buildTips(ym, t, tp) {
    const tips = [];
    const goal = Number(S.settings.savings_goal) || 0;
    const budget = Number(S.settings.budget) || 0;
    const isCur = ym === ymOf(today());
    if (!t.inc && !t.exp) return [["receipt", "Registra tus ingresos y gastos de este mes para ver tu balance y consejos."]];
    if (!t.inc) tips.push(["briefcase", "Registra tus ingresos (sueldo, extras) para saber cuánto puedes ahorrar."]);
    else if (t.net < 0) tips.push(["alert", `Gastaste <b>${money(-t.net)}</b> más de lo que ingresó este mes.`]);
    else {
      const r = t.net / t.inc;
      if (r >= 0.2) tips.push(["star", `¡Bien! Ahorras el <b>${Math.round(r * 100)}%</b> de tus ingresos.`]);
      else tips.push(["target", `Ahorras el ${Math.round(r * 100)}%. La meta recomendada es 20%: <b>${money(t.inc * 0.2)}</b> al mes.`]);
    }
    if (goal > 0 && t.inc > 0) {
      const ok = t.net >= goal;
      tips.push([ok ? "checkCircle" : "piggy", ok ? `Cumpliste tu meta de ahorro de ${money(goal)}.` : `Para tu meta de ahorro (${money(goal)}) te faltan <b>${money(goal - Math.max(0, t.net))}</b>.`]);
    }
    if (isCur) {
      const day = Number(today().slice(8)), dim = daysInMonth(ym);
      if (day >= 5 && day < dim && t.varExp > 0) {
        const pendFixed = S.fixed.filter((f) => f.active && isBill(f))
          .reduce((s, f) => s + P(monthOcc(f, ym).filter((o) => !o.mov).length * C(f.amount)), 0);
        const proj = t.varExp / day * dim + t.fixedExp + pendFixed;
        tips.push(["trendUp", `A este ritmo terminarías el mes con gastos de ~<b>${money(proj)}</b>${budget ? (proj > budget ? `, ${money(proj - budget)} arriba de tu presupuesto` : ", dentro de tu presupuesto") : ""}.`]);
      }
    }
    // mayor gasto variable
    const vc = {};
    for (const m of monthMovs(ym)) if (m.type === "gasto" && !m.fixed_id) vc[m.category_id || "-"] = (vc[m.category_id || "-"] || 0) + Number(m.amount);
    const top = Object.entries(vc).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) {
      const c = cat(top[0]) || { icon: "box", name: "Sin categoría" };
      tips.push([iconKey(c.icon, c.name), `<b>${esc(c.name)}</b> es tu mayor gasto variable (${money(top[1])}). Bajarlo 15% = <b>${money(top[1] * 0.15)}</b> al mes, ${money(top[1] * 0.15 * 12)} al año.`]);
    }
    // categorías que subieron
    const cur = catTotals(ym), prev = catTotals(addMonths(ym, -1));
    const ups = Object.entries(cur).filter(([id, v]) => prev[id] > 0 && v - prev[id] > Math.max(prev[id] * 0.25, 1)).sort((a, b) => (b[1] - prev[b[0]]) - (a[1] - prev[a[0]])).slice(0, 2);
    for (const [id, v] of ups) {
      const c = cat(id) || { icon: "box", name: "Sin categoría" };
      tips.push(["arrowUp", `${esc(c.name)} subió ${Math.round((v - prev[id]) / prev[id] * 100)}% vs ${monthName(addMonths(ym, -1))} (+${money(v - prev[id])}).`]);
    }
    // gastos hormiga
    const small = S.settings.currency === "MXN" ? 150 : 10;
    const ants = monthMovs(ym).filter((m) => m.type === "gasto" && !m.fixed_id && Number(m.amount) <= small);
    if (ants.length >= 8) tips.push(["coins", `Hiciste ${ants.length} gastos pequeños (≤ ${money(small)}) que suman <b>${money(sumP(ants, (m) => m.amount))}</b>. Son los "gastos hormiga".`]);
    // fijos vs ingreso
    const fixedMonthly = sumP(S.fixed.filter((f) => f.active && isBill(f)), perMonth);
    if (t.inc > 0 && fixedMonthly / t.inc > 0.5) tips.push(["pin", `Tus pagos fijos son el ${Math.round(fixedMonthly / t.inc * 100)}% de tus ingresos (lo ideal es ≤ 50%).`]);
    const subs = S.fixed.filter((f) => f.active && f.kind === "suscripcion");
    const subsMonthly = sumP(subs, perMonth);
    if (subs.length >= 2) tips.push(["tv", `Pagas ${subs.length} suscripciones: ${money(subsMonthly)} al mes (${money(subsMonthly * 12)} al año). ¿Usas todas?`]);
    if (isCur) for (const f of S.fixed.filter((x) => x.active && isBudget(x))) {
      const u = budgetUse(f);
      if (u.left < 0) tips.push(["target", `Te pasaste <b>${money(-u.left)}</b> del presupuesto de ${esc(f.name)} (${money(u.limit)} ${scheduleLabel(f)}).`]);
    }
    if (tp.exp > 0 && t.exp > 0 && !isCur) {
      const d = (t.exp - tp.exp) / tp.exp;
      if (Math.abs(d) >= 0.05) tips.push([d > 0 ? "trendUp" : "trendDown", `Gastaste ${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "más" : "menos"} que en ${monthName(addMonths(ym, -1))}.`]);
    }
    return tips;
  }

  // ---------- Hoja: movimiento ----------
  let entry = null; // {id?, type, category_id, fixed_id, fixed_for}
  function openEntry(opts = {}) {
    const m = opts.id ? S.movements.find((x) => x.id === opts.id) : null;
    entry = m ? { ...m } : {
      type: opts.type || "gasto", category_id: opts.category_id || null,
      account_id: opts.account_id || ls.get("wc_last_acc", null), to_account_id: opts.to_account_id || null, fixed_id: opts.fixed_id || null, fixed_for: opts.fixed_for || null,
      amount: opts.amount || "", note: opts.note || "", date: today(),
    };
    entry.currency = m?.currency === "USD" ? "USD" : "base";
    const plan0 = m && (S.plans || []).find((p) => p.movement_id === m.id);
    entry.plan = plan0 || null; entry.msi = plan0 ? plan0.installments : 1;
    $("#entryAmount").value = entry.currency === "USD" && m?.orig_amount ? String(Number(m.orig_amount)) : entry.amount ? String(Number(entry.amount)) : "";
    syncCurrency();
    $("#entryNote").value = entry.note || "";
    $("#entryDate").value = entry.date;
    const now = new Date();
    $("#entryTime").value = m ? (m.time || "").slice(0, 5) : `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    $("#entryMethod").value = m?.payment_method || "";
    $("#entryTags").value = (m?.tags || []).join(", ");
    $("#entryNotes").value = m?.notes || "";
    entry.ticketFile = null;
    $("#ticketLbl").textContent = "Foto del ticket";
    $("#ticketView").hidden = !m?.attachment_path;
    $("#entryMore").open = !!(m && (m.payment_method || (m.tags || []).length || m.notes || m.attachment_path));
    $("#entryDelete").hidden = !m;
    $(".amount-wrap .cur").textContent = curSymbol();
    const hint = $("#entryFixedHint");
    const f = entry.fixed_id && S.fixed.find((x) => x.id === entry.fixed_id);
    hint.hidden = !f;
    if (f) hint.innerHTML = `${isIncome(f) ? ico("briefcase", "i-sm") + " Ingreso fijo" : ico("calendar", "i-sm") + " Pago"} de <b>${esc(f.name)}</b> ${occLabel(entry.fixed_for)}.` +
      (f.kind === "tarjeta" ? `<br>Si tus compras ya las registras con la cuenta Crédito, usa <b>Transferir</b> (Débito → Crédito) para no contarlas doble.` : "");
    setEntryType(entry.type);
    fitAmount();
    openSheet("#entrySheet");
    if (!m) setTimeout(() => $("#entryAmount").focus(), 60);
  }
  function setEntryType(type) {
    entry.type = type;
    $$("#entryType button").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
    const isT = type === "transferencia";
    $("#catChips").hidden = isT;
    $("#toAccWrap").hidden = !isT;
    $("#accLabel").textContent = isT ? "Desde la cuenta" : type === "ingreso" ? "¿A qué cuenta entra?" : "¿Con qué pagaste?";
    if (!isT) {
      const cats = activeCats(type);
      if (!cats.some((c) => c.id === entry.category_id)) entry.category_id = null;
      $("#catChips").innerHTML = cats.map((c) => `<button type="button" class="chip ${c.id === entry.category_id ? "active" : ""}" data-cat="${c.id}">${catIco(c)}${esc(c.name)}</button>`).join("");
    }
    const opts = activeAccs().map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
    $("#entryAccount").innerHTML = `<option value="">— Sin especificar —</option>` + opts;
    $("#entryAccount").value = entry.account_id && acc(entry.account_id) ? entry.account_id : "";
    renderPayChips();
    $("#entryToAccount").innerHTML = opts;
    if (entry.to_account_id) $("#entryToAccount").value = entry.to_account_id;
  }
  // Foto del ticket: se sube al almacenamiento privado (carpeta del usuario) y se guarda la ruta en el movimiento
  $("#entryTicket").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (needDb()) { e.target.value = ""; return; }
    if (f.size > 5 * 1024 * 1024) { toast("La foto debe pesar menos de 5 MB"); e.target.value = ""; return; }
    entry.ticketFile = f; $("#ticketLbl").textContent = "Ticket listo ✓";
  });
  // Fotos de tickets: si no se pueden subir (sin conexión) se guardan en el dispositivo y se suben después
  const ticketsKey = () => `wc_tickets_${S.user?.id}`;
  async function uploadTicket(row, file) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${S.user.id}/${row.id}-${Date.now()}.${ext}`;
    const ok = await sendTicket({ movId: row.id, path, file, type: file.type });
    if (ok === true) toast("Ticket guardado");
    else if (ok === "queued") {
      const q = await WCStore.get(ticketsKey(), []);
      q.push({ movId: row.id, path, file, type: file.type });
      const saved = await WCStore.set(ticketsKey(), q);
      toast(saved ? "Sin conexión: el ticket se subirá solo cuando vuelva el internet" : "No se pudo guardar la foto del ticket en el dispositivo");
    }
  }
  async function sendTicket(t) {
    if (!sb) return "queued";
    let error;
    try { ({ error } = await sb.storage.from("tickets").upload(t.path, t.file, { contentType: t.type, upsert: true })); } catch (x) { error = x; }
    if (error) { if (isNetErr(error) || /5\d\d|timeout/i.test(String(error.statusCode || error.message))) return "queued"; toast("No se pudo subir el ticket: " + error.message); return false; }
    const m = S.movements.find((x) => x.id === t.movId);            // la versión actual del movimiento (por si se editó)
    if (m) mutate({ table: "movements", op: "upsert", row: { ...m, attachment_path: t.path } });
    return true;
  }
  let ticketsBusy = false;
  async function retryTickets() {
    if (ticketsBusy || !S.user || !navigator.onLine) return;
    ticketsBusy = true;
    try {
      const q = await WCStore.get(ticketsKey(), []);
      if (!q.length) return;
      const left = [];
      for (const t of q) { if (!(t.file instanceof Blob)) continue; const r = await sendTicket(t); if (r === "queued") left.push(t); }
      await WCStore.set(ticketsKey(), left);
      if (left.length < q.length) toast("Ticket guardado");
    } finally { ticketsBusy = false; }
  }
  $("#ticketView").addEventListener("click", async () => {
    const m = S.movements.find((x) => x.id === entry?.id); if (!m?.attachment_path) return;
    const { data, error } = await sb.storage.from("tickets").createSignedUrl(m.attachment_path, 300);
    if (error) { toast("No se pudo abrir el ticket"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  });
  // Moneda del movimiento: la principal o dólares (se convierte con el tipo de cambio de Ajustes)
  const baseCur = () => S.settings.currency || "MXN";
  const usdRate = () => Number(S.settings.usd_rate) || 0;
  function syncCurrency() {
    const show = baseCur() !== "USD";
    $("#entryCur").hidden = !show;
    $("#entryCur [data-cur=base]").textContent = baseCur();
    $$("#entryCur button").forEach((b) => b.classList.toggle("active", b.dataset.cur === entry.currency));
    $(".amount-wrap .cur").textContent = entry.currency === "USD" ? "US$" : curSymbol();
    const v = parseAmount($("#entryAmount").value), conv = $("#entryConv");
    conv.hidden = entry.currency !== "USD";
    if (entry.currency === "USD") conv.textContent = usdRate() ? `= ${money(v > 0 ? v * usdRate() : 0)} (1 USD = ${usdRate()} ${baseCur()})` : "Configura el tipo de cambio en Ajustes → Moneda";
  }
  $("#entryCur").addEventListener("click", (e) => { const b = e.target.closest("[data-cur]"); if (!b) return; entry.currency = b.dataset.cur; syncCurrency(); fitAmount(); });
  $("#entryAmount").addEventListener("input", () => entry.currency === "USD" && syncCurrency());
  // «¿Con qué pagaste?»: cuentas y tarjetas como botones (las tarjetas muestran su disponible).
  // Elegir una tarjeta registra el gasto en ella: sube su deuda y baja su disponible automáticamente.
  function renderPayChips() {
    const type = entry.type, isT = type === "transferencia";
    $("#payPick").hidden = isT;
    $("#accWrap").hidden = !isT;                     // en transferencias se usan los selectores de origen/destino
    $("#payLabel").textContent = type === "ingreso" ? "¿A qué cuenta entra?" : "¿Con qué pagaste?";
    const list = activeAccs().filter((a) => type !== "ingreso" || !isCredit(a));
    $("#payChips").innerHTML = list.map((a) => {
      const ci = isCredit(a) ? creditInfo(a) : null;
      return `<button type="button" class="pay-chip ${a.id === $("#entryAccount").value ? "active" : ""} ${ci ? "card" : ""}" data-pay-acc="${a.id}" style="--c:${a.color || colorFor(a.id)}">
        ${ico(iconKey(a.icon, a.name, ci ? "card" : "wallet"))}<span><b>${esc(a.name)}</b>${ci ? `<small>${ci.limit ? `Disponible ${money(ci.avail)}` : "Tarjeta de crédito"}</small>` : ""}</span></button>`;
    }).join("");
    paintCutHint();
  }
  // Aviso de corte: a qué estado de cuenta entra la compra y cuándo se paga; y si supera el disponible
  // «¿A meses?»: solo para gastos con tarjeta de crédito. Crea un plan ligado a la compra en el mismo lote.
  const MSI = [1, 3, 6, 9, 12, 18, 24];
  function paintMsi() {
    const a = acc($("#entryAccount").value), box = $("#msiPick");
    const show = !!a && isCredit(a) && entry.type === "gasto" && (plansReady() || entry.msi > 1);
    box.hidden = !show; if (!show) return;
    const opts = MSI.includes(entry.msi) ? MSI : [...MSI, entry.msi].sort((x, y) => x - y);
    $("#msiChips").innerHTML = opts.map((n) => `<button type="button" class="chip ${n === entry.msi ? "active" : ""}" data-msi="${n}">${n === 1 ? "De contado" : n + " meses"}</button>`).join("");
    const amt = parseAmount($("#entryAmount").value) * (entry.currency === "USD" ? (usdRate() || 1) : 1), hint = $("#msiHint");
    if (entry.msi > 1 && amt > 0) {
      const inst = WCFin.planInstallmentsC({ total: amt, installments: entry.msi });
      hint.innerHTML = `<b>${entry.msi} pagos de ${money(P(inst[0]))}</b>${inst[0] !== inst[inst.length - 1] ? ` (el último de ${money(P(inst[inst.length - 1]))})` : ""}. La deuda total sube ${money(amt)}, pero en cada corte solo pagas la mensualidad.`;
      hint.hidden = false;
    } else hint.hidden = true;
  }
  $("#msiChips").addEventListener("click", (e) => { const b = e.target.closest("[data-msi]"); if (!b) return; entry.msi = +b.dataset.msi; paintMsi(); });
  function paintCutHint() {
    paintMsi();
    const a = acc($("#entryAccount").value), h = $("#cardCutHint");
    if (!a || !isCredit(a) || entry.type !== "gasto") { h.hidden = true; return; }
    const d = $("#entryDate").value || today(), ci = creditInfo(a);
    const amtC = C(parseAmount($("#entryAmount").value) || 0) * (entry.currency === "USD" ? (usdRate() || 1) : 1);
    const prevC = entry.id && S.movements.find((x) => x.id === entry.id)?.account_id === a.id ? C(S.movements.find((x) => x.id === entry.id).amount) : 0;
    let msg = "";
    if (a.cut_day) {
      const cut = WCFin.cutFor(a.cut_day, d), pay = a.due_day ? WCFin.payByFor(cut, a.due_day) : null;
      msg = `${ico("calendar", "i-sm")} Entra al corte del <b>${fmtShort(cut)}</b>${pay ? ` · la pagas antes del <b>${fmtShort(pay)}</b>` : ""}`;
    } else msg = `${ico("alert", "i-sm")} Agrega el <b>día de corte</b> de ${esc(a.name)} para saber en qué mes la pagas`;
    if (ci.limit && amtC - prevC > C(ci.avail)) msg += `<br>${ico("alert", "i-sm")} Supera tu disponible (${money(ci.avail)})`;
    h.innerHTML = msg; h.hidden = false;
  }
  $("#payChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pay-acc]"); if (!b) return;
    const same = $("#entryAccount").value === b.dataset.payAcc;
    $("#entryAccount").value = same ? "" : b.dataset.payAcc;     // tocar de nuevo la quita
    entry.account_id = $("#entryAccount").value || null;
    renderPayChips();
  });
  $("#entryAccount").addEventListener("change", renderPayChips);
  $("#entryDate").addEventListener("change", paintCutHint);
  $("#entryAmount").addEventListener("input", paintCutHint);
  const fitAmount = () => { const i = $("#entryAmount"); i.style.width = Math.max(1, i.value.length || 1) + 0.6 + "ch"; };
  $("#entryAmount").addEventListener("input", fitAmount);
  $("#entryType").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setEntryType(b.dataset.type); });
  $("#catChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    entry.category_id = b.dataset.cat;
    $$("#catChips .chip").forEach((x) => x.classList.toggle("active", x === b));
  });
  $("#entryForm").addEventListener("submit", (e) => {
    e.preventDefault();
    let amount = parseAmount($("#entryAmount").value);
    if (!(amount > 0)) { toast("Escribe un monto válido"); $("#entryAmount").focus(); return; }
    let currency = null, orig_amount = null;
    if (entry.currency === "USD") {
      if (!usdRate()) { toast("Primero pon el tipo de cambio en Ajustes"); return; }
      currency = "USD"; orig_amount = amount; amount = Math.round(amount * usdRate() * 100) / 100;
    }
    const type = entry.type;
    const account_id = $("#entryAccount").value || null;
    let category_id = entry.category_id;
    if (type !== "transferencia" && !category_id) {
      category_id = activeCats(type).find((c) => /^otros/i.test(c.name))?.id || null;
    }
    const to_account_id = type === "transferencia" ? $("#entryToAccount").value : null;
    if (type === "transferencia" && (!account_id || account_id === to_account_id)) { toast("Elige dos cuentas distintas"); return; }
    const row = {
      id: entry.id || uuid(), user_id: S.user.id, type, amount,
      date: $("#entryDate").value || today(), note: $("#entryNote").value.trim() || null,
      category_id: type === "transferencia" ? null : category_id, account_id, to_account_id,
      fixed_id: entry.fixed_id || null, fixed_for: entry.fixed_for || null, currency, orig_amount,
      source: entry.source || "app", created_at: entry.created_at || new Date().toISOString(),
    };
    // Detalles opcionales
    row.time = $("#entryTime").value || null;
    row.payment_method = $("#entryMethod").value || (() => { const k = acc(account_id)?.kind; return !k || type === "transferencia" ? (type === "transferencia" ? "transferencia" : null) : k === "credito" ? "credito" : k === "efectivo" ? "efectivo" : "debito"; })();
    row.tags = $("#entryTags").value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
    row.notes = $("#entryNotes").value.trim() || null;
    row.attachment_path = entry.attachment_path || null;
    // Cuentas que no permiten saldo negativo
    const src = acc(account_id);
    if (src && src.allow_negative === false && (type === "gasto" || type === "transferencia")) {
      const prev = entry.id ? S.movements.find((x) => x.id === entry.id) : null;
      const back = prev && prev.account_id === account_id && prev.type !== "ingreso" ? C(prev.amount) : 0;
      if (C(accountBalance(src)) + back - C(amount) < 0) { toast(`${src.name} no permite saldo negativo (saldo ${money(accountBalance(src))})`); return; }
    }
    if (account_id) ls.set("wc_last_acc", account_id);
    const isNew = !entry.id;
    // Compra a meses: el plan viaja en el mismo lote que el movimiento
    const ops = [{ table: "movements", op: "upsert", row }];
    const wantPlan = type === "gasto" && src && isCredit(src) && entry.msi > 1;
    if (wantPlan && !plansReady()) { toast("Para compras a meses aplica la actualización 0006 de la base de datos"); return; }
    let planRow = null;
    if (wantPlan) {
      planRow = { id: entry.plan?.id || uuid(), user_id: S.user.id, account_id: src.id, movement_id: row.id, name: (row.note || cat(category_id)?.name || "Compra a meses").slice(0, 60),
        total: amount, installments: entry.msi, first_month: entry.plan && entry.plan.account_id === src.id && entry.plan.installments === entry.msi && entry.plan.first_month ? entry.plan.first_month : nextBillMonth(src, row.date),
        status: "activo", created_at: entry.plan?.created_at || new Date().toISOString() };
      ops.push({ table: "card_plans", op: "upsert", row: planRow });
    } else if (entry.plan) ops.push({ table: "card_plans", op: "delete", id: entry.plan.id });
    if (!mutate(ops)) return;                                      // no se guardó: la hoja sigue abierta para corregir
    if (entry.ticketFile) uploadTicket(row, entry.ticketFile);
    closeSheet($("#entrySheet"));
    const what = `${type === "ingreso" ? "Ingreso" : type === "transferencia" ? "Transferencia" : "Gasto"} de ${money(amount)}${planRow ? ` a ${planRow.installments} meses (${money(P(WCFin.planInstallmentsC(planRow)[0]))}/mes)` : ""} guardado`;
    if (isNew) toast(what, {
      label: "Deshacer", fn: () => mutate([...(planRow ? [{ table: "card_plans", op: "delete", id: planRow.id }] : []), { table: "movements", op: "delete", id: row.id }]),
    });
  });
  $("#entryDelete").addEventListener("click", () => {
    if (!entry?.id || !confirm("¿Eliminar este movimiento?")) return;
    const old = S.movements.find((m) => m.id === entry.id), oldPlan = (S.plans || []).find((p) => p.movement_id === entry.id);
    mutate([...(oldPlan ? [{ table: "card_plans", op: "delete", id: oldPlan.id }] : []), { table: "movements", op: "delete", id: entry.id }]);
    closeSheet($("#entrySheet"));
    toast("Movimiento eliminado", { label: "Deshacer", fn: () => mutate([{ table: "movements", op: "upsert", row: old }, ...(oldPlan ? [{ table: "card_plans", op: "upsert", row: oldPlan }] : [])]) });
  });

  // ---------- Hoja: pago fijo ----------
  let fixedEditing = null;
  function openFixed(id, preset = {}) {
    const f = id ? S.fixed.find((x) => x.id === id) : null;
    fixedEditing = f;
    const k0 = f?.kind || preset.kind;
    $("#fixedTitle").textContent = f ? (isBudget(f) ? "Editar presupuesto" : "Editar pago") : k0 === "presupuesto" ? "Nuevo presupuesto" : k0 === "suscripcion" ? "Nueva suscripción" : "Nuevo pago";
    $("#fixedTemplates").hidden = !!f;
    $("#fixedTemplates").innerHTML = TEMPLATES.map((t, i) => `<button type="button" class="chip" data-tpl="${i}">${ico(t.icon)}${t.name}</button>`).join("");
    $("#fixedName").value = f?.name || "";
    $("#fixedAmount").value = f ? String(Number(f.amount)) : "";
    $("#fixedKind").value = f?.kind || preset.kind || "servicio";
    $("#fixedFreq").value = f ? freqOf(f) : preset.frequency || "mensual";
    $("#fixedStart").value = f?.start_date || "";
    $("#fixedEnd").value = f?.end_date || "";
    $("#fixedNotes").value = f?.notes || "";
    $("#fixedPaused").checked = !!f?.paused;
    $("#fixedDay").value = f?.day || "";
    $("#fixedDay2").value = f?.day2 || "";
    $("#fixedWeekday").value = String(f?.weekday ?? 1);
    $("#fixedRemind").value = String(f?.remind_days ?? 3);
    $("#fixedAuto").checked = !!f?.auto;
    $("#fixedInstallments").value = f?.installments || "";
    $("#fixedPaidBefore").value = f?.installments_paid_before || "";
    $("#fixedAcc").innerHTML = `<option value="">—</option>` + activeAccs().map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
    $("#fixedAcc").value = f?.account_id || "";
    $("#fixedDelete").hidden = !f;
    syncFixedForm(f?.category_id || "");
    openSheet("#fixedSheet");
  }
  // Muestra/oculta campos según el tipo y la frecuencia
  function syncFixedForm(keepCat) {
    const kind = $("#fixedKind").value, fr = $("#fixedFreq").value;
    const inc = kind === "ingreso", bud = kind === "presupuesto";
    const catKind = inc ? "ingreso" : "gasto";
    const prevCat = keepCat ?? $("#fixedCat").value;
    $("#fixedCat").innerHTML = `<option value="">${bud ? "Elige la categoría…" : "—"}</option>` + activeCats(catKind).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    $("#fixedCat").value = activeCats(catKind).some((c) => c.id === prevCat) ? prevCat : "";
    $("#debtFields").hidden = kind !== "deuda";
    $("#fixedRemindWrap").hidden = bud;
    $("#fixedAutoWrap").hidden = bud;
    $("#fixedAccWrap").hidden = bud;
    $("#fixedAccLabel").textContent = inc ? "Entra a" : "Se paga con";
    $("#fixedAmountLabel").textContent = bud ? "Tope por periodo" : inc ? "Monto (aprox.)" : "Monto aprox.";
    const hint = $("#fixedKindHint");
    hint.hidden = !(inc || bud);
    hint.textContent = bud ? "Se suman los gastos de la categoría elegida en cada periodo y te muestra cuánto te queda. No es un pago: no aparece como vencido."
      : inc ? "Te aparece el día que te llega para registrarlo con un toque (botón Recibir)." : "";
    // Frecuencias disponibles según el tipo
    $$("#fixedFreq option").forEach((o) => { o.hidden = bud ? ["bimestral", "trimestral", "semestral", "unico"].includes(o.value) : o.value === "personalizado"; });
    if ($("#fixedFreq option:checked")?.hidden) { $("#fixedFreq").value = "mensual"; return syncFixedForm(keepCat); }
    $("#fixedPausedWrap").hidden = bud;
    // Fechas: «Único» y cada N meses usan la primera fecha; «Personalizado» usa un rango; todos aceptan fecha final
    const multi = ["bimestral", "trimestral", "semestral", "anual"].includes(fr) && !bud, once = fr === "unico", range = fr === "personalizado";
    $("#fixedDates").hidden = bud && !range;
    $("#fixedStart").closest("label").hidden = !(multi || once || range);
    $("#fixedStartLbl").textContent = once ? "Fecha" : range ? "Desde" : "Primera fecha";
    $("#fixedEndWrap").hidden = once || (kind === "deuda" && parseInt($("#fixedInstallments").value, 10) > 0);   // a cuotas: termina sola
    $("#fixedEndLbl").textContent = range ? "Hasta" : "Termina (opcional)";
    // Cuándo
    const weekly = fr === "semanal", biweekly = fr === "quincenal";
    $("#fixedWeekdayWrap").hidden = !weekly;
    $("#fixedWeekdayLabel").textContent = bud ? "La semana empieza el" : inc ? "Llega cada" : "Se paga cada";
    $("#fixedDayWrap").hidden = weekly || bud || multi || once || range;           // presupuesto quincenal/mensual: periodos 1–15 / 16–fin o el mes completo
    $("#fixedDay2Wrap").hidden = !biweekly || bud;
    $("#fixedDayLabel").textContent = biweekly ? "1er día" : inc ? "Día que llega" : "Día de pago";
    $("#fixedDayHint").hidden = !biweekly || bud;
    $("#fixedWhen").hidden = (bud && !weekly) || multi || once || range;
    if (biweekly && !bud) { if (!$("#fixedDay").value) $("#fixedDay").value = 15; if (!$("#fixedDay2").value) $("#fixedDay2").value = 31; }
  }
  $("#fixedKind").addEventListener("change", () => {
    // Valores sugeridos al cambiar a ingreso / presupuesto
    const k = $("#fixedKind").value;
    if (!fixedEditing && k === "presupuesto" && $("#fixedFreq").value === "mensual") $("#fixedFreq").value = "semanal";
    syncFixedForm();
  });
  $("#fixedFreq").addEventListener("change", () => syncFixedForm());
  $("#fixedInstallments").addEventListener("input", () => syncFixedForm());
  $("#fixedTemplates").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tpl]"); if (!b) return;
    const t = TEMPLATES[b.dataset.tpl];
    $("#fixedName").value = t.name;
    $("#fixedKind").value = t.kind;
    $("#fixedFreq").value = t.frequency || "mensual";
    if (t.weekday != null) $("#fixedWeekday").value = String(t.weekday);
    $("#fixedDay").value = t.day || "";
    $("#fixedDay2").value = t.day2 || "";
    const c = activeCats(t.kind === "ingreso" ? "ingreso" : "gasto").find((x) => x.name === t.cat);
    syncFixedForm(c?.id || "");
    if (t.kind === "tarjeta") { const a = activeAccs().find((x) => /d[eé]bito/i.test(x.name)); if (a) $("#fixedAcc").value = a.id; }
    $$("#fixedTemplates .chip").forEach((x) => x.classList.toggle("active", x === b));
    $("#fixedAmount").focus();
  });
  $("#fixedForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const kind = $("#fixedKind").value, frequency = $("#fixedFreq").value;
    const bud = kind === "presupuesto";
    const amount = parseAmount($("#fixedAmount").value);
    if (isNaN(amount) || amount < 0 || (bud && !(amount > 0))) { toast(bud ? "Escribe el tope del presupuesto" : "Monto inválido"); return; }
    if (!dbReady() && !["mensual", "quincenal", "semanal"].includes(frequency)) { needDb(); return; }
    let day = null, day2 = null, weekday = null, start_date = $("#fixedStart").value || null, end_date = $("#fixedEnd").value || null;
    const multi = ["bimestral", "trimestral", "semestral", "anual"].includes(frequency);
    if (frequency === "semanal") weekday = parseInt($("#fixedWeekday").value, 10);
    else if (frequency === "personalizado") { if (!start_date || !end_date || end_date < start_date) { toast("Indica el rango de fechas del presupuesto"); return; } }
    else if (bud && frequency === "anual") { day = 1; start_date = `${today().slice(0, 4)}-01-01`; }
    else if (bud) day = 1;
    else if (frequency === "unico") { if (!start_date) { toast("Indica la fecha del pago"); return; } end_date = null; }
    else if (multi) { if (!start_date) { toast("Indica la primera fecha"); return; } day = Number(start_date.slice(8)); }
    else {
      day = parseInt($("#fixedDay").value, 10);
      if (!(day >= 1 && day <= 31)) { toast("El día debe ser de 1 a 31"); $("#fixedDay").focus(); return; }
      if (frequency === "quincenal") {
        day2 = parseInt($("#fixedDay2").value, 10) || 31;
        if (!(day2 >= 1 && day2 <= 31) || day2 === day) { toast("Los dos días de la quincena deben ser distintos (1 a 31)"); return; }
        if (day2 < day) [day, day2] = [day2, day];
      }
    }
    const category_id = $("#fixedCat").value || null;
    if (bud && !category_id) { toast("Elige la categoría que vas a controlar"); $("#fixedCat").focus(); return; }
    const row = {
      id: fixedEditing?.id || uuid(), user_id: S.user.id, name: $("#fixedName").value.trim(), kind, amount,
      frequency, day, day2, weekday, start_date: frequency === "semanal" || ["mensual", "quincenal"].includes(frequency) ? null : start_date,
      end_date: kind === "deuda" && parseInt($("#fixedInstallments").value, 10) > 0 ? null : end_date && start_date && end_date < start_date ? null : end_date, notes: $("#fixedNotes").value.trim() || null, paused: bud ? false : $("#fixedPaused").checked,
      category_id, account_id: bud ? null : $("#fixedAcc").value || null,
      remind_days: bud ? 0 : parseInt($("#fixedRemind").value, 10),
      installments: kind === "deuda" ? parseInt($("#fixedInstallments").value, 10) || null : null,
      installments_paid_before: kind === "deuda" ? parseInt($("#fixedPaidBefore").value, 10) || 0 : 0,
      auto: bud ? false : $("#fixedAuto").checked,
      active: true, created_at: fixedEditing?.created_at || new Date().toISOString(),
    };
    if (!row.name) { toast("Escribe un nombre"); return; }
    if (!mutate({ table: "fixed_payments", op: "upsert", row })) return;
    if (row.auto) autoPostRecurring();
    closeSheet($("#fixedSheet"));
    toast(fixedEditing ? "Guardado" : `${row.name} agregado · ${bud ? money(amount) + " " : ""}${scheduleLabel(row)}`);
  });
  $("#fixedDelete").addEventListener("click", () => {
    if (!fixedEditing || !confirm(`¿Eliminar "${fixedEditing.name}"? Los pagos ya registrados se conservan.`)) return;
    mutate({ table: "fixed_payments", op: "upsert", row: { ...fixedEditing, active: false } });
    closeSheet($("#fixedSheet"));
  });
  function payFixed(id, month) {
    const f = S.fixed.find((x) => x.id === id); if (!f) return;
    openEntry({ type: isIncome(f) ? "ingreso" : "gasto", amount: Number(f.amount), category_id: f.category_id, account_id: f.account_id, note: f.name, fixed_id: f.id, fixed_for: month });
  }

  // ---------- Hoja: cuenta / categoría ----------
  let itemEditing = null; // {table, row}
  let itemIconKey = "box", itemColor = "";
  $("#itemColors").addEventListener("click", (e) => { const b = e.target.closest("[data-color]"); if (!b) return; itemColor = b.dataset.color; $$("#itemColors button").forEach((x) => x.classList.toggle("active", x === b)); });
  // Campos según el tipo de cuenta (en crédito: límite, corte, pago, tasa y acciones)
  function syncItemKind() {
    const { table, row } = itemEditing, isAcc = table === "accounts";
    const credit = isAcc && $("#itemAccKind").value === "credito";
    $("#creditFields").hidden = !credit;
    $("#itemBalanceWrap").hidden = !isAcc || credit;      // en tarjetas se usa «¿Cuánto debes hoy?»
    const bal = row ? accountBalance(row) : 0;
    if (credit) {
      const used = row && isCredit(row) ? creditInfo(row).used : 0;
      if (!$("#itemDebt").dataset.touched) $("#itemDebt").value = row && used ? String(used) : "";
      paintCreditLive();
    } else {
      $("#itemBalanceWrap span").textContent = row ? `Saldo inicial (saldo actual: ${money(bal)})` : "Saldo inicial (lo que tiene hoy)";
      $("#itemBalance").value = row ? String(Number(row.initial_balance || 0)) : "";
    }
    $("#creditActions").hidden = !row || !credit;
    $("#creditBox").hidden = !row || !credit;
    if (row && credit) {
      const c = creditInfo(row);
      $("#creditBox").innerHTML = `<div><span>Saldo utilizado</span><b class="num neg">${money(c.used)}</b></div>
        <div><span>Crédito disponible</span><b class="num pos">${c.avail == null ? "—" : money(c.avail)}</b></div>
        <div><span>Interés estimado / mes</span><b class="num">${c.interest ? money(c.interest) : "—"}</b></div>
        <div><span>Intereses pagados ${today().slice(0, 4)}</span><b class="num">${money(c.paidInterest)}</b></div>`;
    }
  }
  // Disponible = crédito − lo que debes (se recalcula al escribir)
  function paintCreditLive() {
    const lim = C(parseAmount($("#itemLimit").value) || 0), debt = C(parseAmount($("#itemDebt").value) || 0);
    $("#creditLive").innerHTML = lim ? `<span>Disponible</span><b class="num ${lim - debt < 0 ? "neg" : "pos"}">${money(P(lim - debt))}</b><small>${Math.round(debt / lim * 100)}% utilizado</small>`
      : `<span>Disponible</span><b class="num">—</b><small>Escribe el crédito de la tarjeta</small>`;
  }
  ["#itemLimit", "#itemDebt"].forEach((id) => $(id).addEventListener("input", (e) => { e.target.dataset.touched = "1"; paintCreditLive(); }));
  $("#itemAccKind").addEventListener("change", () => {
    if (!itemEditing.row) itemIconKey = { efectivo: "cash", debito: "bank", credito: "card", ahorro: "piggy", inversion: "trendUp" }[$("#itemAccKind").value] || itemIconKey;
    renderIconGrid(); syncItemKind();
  });
  // Pago a la tarjeta = transferencia desde otra cuenta (no cuenta como gasto)
  $("#creditPay").addEventListener("click", () => {
    const a = itemEditing.row; if (!a) return;
    const from = activeAccs().find((x) => x.kind === "debito" && x.id !== a.id) || activeAccs().find((x) => !isCredit(x));
    closeSheet($("#itemSheet")); closeSheet($("#settingsSheet"));
    openEntry({ type: "transferencia", amount: creditInfo(a).used || "", account_id: from?.id || null, to_account_id: a.id, note: `Pago ${a.name}` });
  });
  // Intereses = gasto en la tarjeta con categoría «Intereses» (se crea si no existe)
  $("#creditInterest").addEventListener("click", () => {
    const a = itemEditing.row; if (!a) return;
    let c = activeCats("gasto").find((x) => /inter[eé]s/i.test(x.name));
    if (!c) { c = { id: uuid(), user_id: S.user.id, icon: "trendUp", name: "Intereses", kind: "gasto", sort: S.categories.length + 1, archived: false }; mutate({ table: "categories", op: "upsert", row: c }); }
    closeSheet($("#itemSheet")); closeSheet($("#settingsSheet"));
    openEntry({ type: "gasto", amount: Math.round(creditInfo(a).interest * 100) / 100 || "", category_id: c.id, account_id: a.id, note: `Intereses ${a.name}` });
  });
  function renderIconGrid() {
    $("#itemIcons").innerHTML = PICKABLE.map((k) => `<button type="button" data-icon="${k}" class="${k === itemIconKey ? "active" : ""}" aria-label="${k}">${ico(k)}</button>`).join("");
  }
  $("#itemIcons").addEventListener("click", (e) => {
    const b = e.target.closest("[data-icon]"); if (!b) return;
    itemIconKey = b.dataset.icon;
    $$("#itemIcons button").forEach((x) => x.classList.toggle("active", x === b));
  });
  function openItem(table, row, kind, accKind) {
    itemEditing = { table, row };
    delete $("#itemDebt").dataset.touched; delete $("#itemLimit").dataset.touched;
    const isAcc = table === "accounts";
    $("#itemTitle").textContent = (row ? "Editar " : "Nueva ") + (isAcc ? "cuenta" : "categoría");
    itemIconKey = iconKey(row?.icon, row?.name, isAcc ? "wallet" : "box");
    renderIconGrid();
    $("#itemName").value = row?.name || "";
    $("#itemBalanceWrap").hidden = !isAcc;
    $("#itemKindWrap").hidden = isAcc || !!row;
    $("#itemKind").value = row?.kind || kind || "gasto";
    $("#itemAccKindWrap").hidden = !isAcc;
    $("#itemAccKind").value = row?.kind || accKind || "debito";
    if (!row && accKind === "credito") itemIconKey = "card";
    $("#itemLimit").value = row?.credit_limit ? String(Number(row.credit_limit)) : "";
    $("#itemApr").value = row?.apr ? String(Number(row.apr)) : "";
    $("#itemCut").value = row?.cut_day || "";
    $("#itemDue").value = row?.due_day || "";
    $("#accExtra").hidden = !isAcc;
    if (isAcc) {
      $("#itemInstitution").value = row?.institution || "";
      $("#itemCurrency").innerHTML = CURRENCIES.map(([c]) => `<option value="${c}">${c}</option>`).join("");
      $("#itemCurrency").value = row?.currency || S.settings.currency || "MXN";
      $("#itemOpened").value = row?.opened_at || "";
      $("#itemStatus").value = row?.archived ? "archivada" : "activa";
      $("#itemNegative").checked = row ? row.allow_negative !== false : true;
      itemColor = row?.color || "";
      $("#itemColors").innerHTML = [""].concat(PALETTE).map((c) => `<button type="button" data-color="${c}" class="${c === itemColor ? "active" : ""}" style="--c:${c || "transparent"}" aria-label="${c || "Automático"}">${c ? "" : "A"}</button>`).join("");
    }
    syncItemKind();
    $("#itemDelete").hidden = !row;
    openSheet("#itemSheet");
  }
  $("#itemForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const { table, row } = itemEditing;
    const isAcc = table === "accounts";
    const list = isAcc ? S.accounts : S.categories;
    const r = {
      id: row?.id || uuid(), user_id: S.user.id, icon: itemIconKey, name: $("#itemName").value.trim(),
      sort: row?.sort ?? list.length + 1, archived: false,
    };
    if (!r.name) return;
    if (isAcc) {
      r.kind = $("#itemAccKind").value;
      if (!dbReady() && ["banco", "otra"].includes(r.kind)) { needDb(); return; }
      const credit = r.kind === "credito", ib = parseAmount($("#itemBalance").value) || 0;
      if (credit) {
        // Se captura lo que se debe HOY: el saldo inicial se ajusta para que saldo actual = −deuda (sin tocar el historial)
        const debtC = C(Math.abs(parseAmount($("#itemDebt").value) || 0));
        const movC = row ? WCFin.accountBalanceC({ ...row, initial_balance: 0 }, S.movements, S.debts || [], S.debtPays || []) : 0;
        r.initial_balance = P(-debtC - movC);
      } else r.initial_balance = ib;
      const num = (sel, min, max) => { const v = parseInt($(sel).value, 10); return credit && v >= min && v <= max ? v : null; };
      r.credit_limit = credit ? parseAmount($("#itemLimit").value) || null : null;
      r.apr = credit ? parseAmount($("#itemApr").value) || null : null;
      r.cut_day = num("#itemCut", 1, 31); r.due_day = num("#itemDue", 1, 31);
      r.institution = $("#itemInstitution").value.trim() || null;
      r.currency = $("#itemCurrency").value || "MXN";
      r.opened_at = $("#itemOpened").value || null;
      r.color = itemColor || null;
      r.allow_negative = credit ? true : $("#itemNegative").checked;
      r.archived = $("#itemStatus").value === "archivada";
    }
    else r.kind = row?.kind || $("#itemKind").value;
    if (!mutate({ table, op: "upsert", row: r })) return;
    closeSheet($("#itemSheet"));
    renderSettingsLists();
  });
  $("#itemDelete").addEventListener("click", () => {
    const { table, row } = itemEditing;
    if (!row || !confirm(`¿Eliminar "${row.name}"? Los movimientos anteriores se conservan.`)) return;
    mutate({ table, op: "upsert", row: { ...row, archived: true } });
    closeSheet($("#itemSheet"));
    renderSettingsLists();
  });

  // ---------- Ajustes ----------
  $("#setTheme").addEventListener("click", (e) => {
    const b = e.target.closest("[data-theme]"); if (!b) return;
    S.settings.theme = b.dataset.theme; applyTheme();
    $$("#setTheme button").forEach((x) => x.classList.toggle("active", x === b));
  });
  $("#notifyPrefs").addEventListener("click", (e) => { const b = e.target.closest("[data-np]"); if (b) b.classList.toggle("active"); });
  $("#notifyEnable").addEventListener("click", async () => {
    if (!("Notification" in window)) return;
    const r = await Notification.requestPermission();
    toast(r === "granted" ? "Notificaciones activadas" : "No se dieron permisos");
    if (r === "granted") { ls.del(`wc_notified_${today()}`); notifyDue(); }
    openSettings();
  });
  function renderSettingsLists() {
    $("#accountsList").innerHTML = activeAccs().map((a) => `<li class="item tap" data-acc="${a.id}"><div class="ico">${accIco(a)}</div><div class="main"><div class="t">${esc(a.name)}</div></div><div class="amt num">${money(accountBalance(a))}</div></li>`).join("");
    $("#categoriesList").innerHTML = ["gasto", "ingreso"].map((k) => activeCats(k).map((c) => `<button type="button" class="chip" data-catedit="${c.id}">${catIco(c)}${esc(c.name)}${k === "ingreso" ? ` ${ico("arrowDown", "i-sm")}` : ""}</button>`).join("")).join("");
  }
  function openSettings() {
    $("#userEmail").textContent = S.user?.email ? `Sesión: ${S.user.email}` : "";
    $("#setCurrency").innerHTML = CURRENCIES.map(([c, n]) => `<option value="${c}">${c} — ${n}</option>`).join("");
    $("#setCurrency").value = S.settings.currency || "MXN";
    $("#setBudget").value = S.settings.budget ? String(Number(S.settings.budget)) : "";
    $("#setGoal").value = S.settings.savings_goal ? String(Number(S.settings.savings_goal)) : "";
    $("#setRate").value = S.settings.usd_rate ? String(Number(S.settings.usd_rate)) : "";
    const syncRate = () => { const c = $("#setCurrency").value; $("#setRateWrap").hidden = c === "USD"; $("#setRateLbl").textContent = `1 USD = ? ${c}`; };
    $("#setCurrency").onchange = syncRate; syncRate();
    syncLockSettings();
    const st = S.settings;
    $$("#setTheme button").forEach((b) => b.classList.toggle("active", b.dataset.theme === (st.theme || "oscuro")));
    if ($("#setUserName")) $("#setUserName").value = userName();
    $("#setDateFmt").value = st.date_format || "dd/mm/aaaa";
    $("#setTimeFmt").value = st.time_format || "24h";
    $("#setAutoLock").value = String(st.auto_lock_minutes ?? 1);
    const NP = [["pagos", "Próximos pagos"], ["vencidos", "Vencidos"], ["presupuestos", "Presupuestos"], ["tarjetas", "Tarjetas"], ["ahorros", "Metas"]];
    const np = st.notify || {};
    $("#notifyPrefs").innerHTML = NP.map(([k, l]) => `<button type="button" class="chip ${np[k] !== false ? "active" : ""}" data-np="${k}">${l}</button>`).join("");
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    $("#notifyEnable").hidden = perm === "granted" || perm === "unsupported";
    $("#notifyHint").textContent = perm === "unsupported" ? "Este navegador no admite notificaciones. En iPhone instala la app en la pantalla de inicio (iOS 16.4 o posterior) o usa la automatización de Atajos."
      : perm === "denied" ? "Las notificaciones están bloqueadas para esta app en los ajustes del dispositivo."
      : "Recordatorios en este dispositivo al abrir la app (pagos, vencidos, presupuestos, tarjetas y metas). Para avisos con la app cerrada usa la automatización de Atajos.";
    renderSyncBox();
    // Meses: 12 hacia atrás y 2 hacia adelante (más el guardado si queda fuera)
    const cur = ymOf(today()), sm = S.settings.start_month || "";
    const months = Array.from({ length: 15 }, (_, i) => addMonths(cur, 2 - i));
    if (sm && !months.includes(sm)) months.push(sm);
    $("#setStartMonth").innerHTML = `<option value="">Desde que agregué cada fijo</option>` +
      months.sort().reverse().map((m) => `<option value="${m}">${monthName(m).replace(/^./, (c) => c.toUpperCase())} ${m.slice(0, 4)}</option>`).join("");
    $("#setStartMonth").value = sm;
    renderSettingsLists();
    openSheet("#settingsSheet");
  }
  $("#accountsList").addEventListener("click", (e) => { const li = e.target.closest("[data-acc]"); if (li) openItem("accounts", acc(li.dataset.acc)); });
  $("#categoriesList").addEventListener("click", (e) => { const b = e.target.closest("[data-catedit]"); if (b) openItem("categories", cat(b.dataset.catedit)); });
  $("#addAccount").addEventListener("click", () => openItem("accounts", null));
  $("#addCategory").addEventListener("click", () => openItem("categories", null));
  // Nombre del usuario: se guarda en su perfil de Supabase (user_metadata) y en el dispositivo para usarlo sin conexión
  function userName() { return S.user?.user_metadata?.full_name || ls.get(`wc_name_${S.user?.id}`, "") || ""; }
  async function saveUserName(name) {
    if (name === userName()) return;
    ls.set(`wc_name_${S.user.id}`, name);
    S.user = { ...S.user, user_metadata: { ...(S.user.user_metadata || {}), full_name: name } };
    try { await sb.auth.updateUser({ data: { full_name: name } }); } catch { /* se queda en el dispositivo; se reintenta al guardar de nuevo */ }
  }
  $("#settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if ($("#setUserName")) saveUserName($("#setUserName").value.trim().slice(0, 40));
    const b = parseAmount($("#setBudget").value), g = parseAmount($("#setGoal").value);
    mutate({ table: "settings", op: "upsert", row: {
      user_id: S.user.id, currency: $("#setCurrency").value, start_month: $("#setStartMonth").value || null,
      usd_rate: parseAmount($("#setRate").value) > 0 ? parseAmount($("#setRate").value) : null,
      theme: S.settings.theme || "oscuro",
      date_format: $("#setDateFmt").value, time_format: $("#setTimeFmt").value,
      auto_lock_minutes: parseInt($("#setAutoLock").value, 10),
      notify: Object.fromEntries($$("#notifyPrefs [data-np]").map((b) => [b.dataset.np, b.classList.contains("active")])),
      budget: b > 0 ? b : null, savings_goal: g > 0 ? g : null, updated_at: new Date().toISOString(),
    } });
    closeSheet($("#settingsSheet"));
    toast("Ajustes guardados");
  });
  $("#logout").addEventListener("click", async () => {
    if (!confirm("¿Cerrar sesión en este dispositivo?")) return;
    // Los cambios sin enviar NO se borran: se quedan guardados y se envían cuando vuelvas a entrar con esta cuenta
    if (OUTBOX.length) { try { await flush(true); } catch { /* */ } }
    if (OUTBOX.length && !confirm(`Hay ${OUTBOX.length} cambio(s) que aún no se envían (sin conexión). Se quedan guardados en este dispositivo y se enviarán cuando vuelvas a entrar con tu cuenta. ¿Cerrar sesión?`)) return;
    await WCStore.del(cacheKey());
    try { await sb.auth.signOut({ scope: "local" }); } catch { /* sin conexión: la sesión local se borra igual */ }
    location.reload();
  });
  $("#exportCsv").addEventListener("click", () => {
    const rows = [["Fecha", "Hora", "Tipo", "Monto", "Moneda original", "Monto original", "Categoría", "Cuenta", "Cuenta destino", "Descripción", "Método", "Etiquetas", "Notas", "Pago fijo"]];
    const pr = periodRange();
    for (const m of S.movements.filter((x) => x.date >= pr.from && x.date <= pr.to).slice().reverse()) {
      rows.push([m.date, (m.time || "").slice(0, 5), m.type, P(C(m.amount)).toFixed(2), m.currency || S.settings.currency || "MXN", m.orig_amount ? P(C(m.orig_amount)).toFixed(2) : P(C(m.amount)).toFixed(2),
        cat(m.category_id)?.name || "", acc(m.account_id)?.name || "", acc(m.to_account_id)?.name || "", m.note || "", m.payment_method || "", (m.tags || []).join(" "), m.notes || "", S.fixed.find((f) => f.id === m.fixed_id)?.name || ""]);
    }
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    download(`withcash-${pr.from}_${pr.to}.csv`, csv, "text/csv");
  });
  $("#exportJson").addEventListener("click", () => {
    download(`withcash-respaldo-${today()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), settings: S.settings, accounts: S.accounts, categories: S.categories, fixed_payments: S.fixed, movements: S.movements }, null, 2), "application/json");
  });
  // Restaurar respaldo (.json): vuelve a subir cuentas, categorías, fijos y movimientos a tu cuenta
  $("#importJson").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    let d; try { d = JSON.parse(await file.text()); } catch { toast("El archivo no es un respaldo válido"); return; }
    const sets = [["accounts", d.accounts], ["categories", d.categories], ["fixed_payments", d.fixed_payments], ["movements", d.movements]].filter(([, v]) => Array.isArray(v) && v.length);
    if (!sets.length) { toast("El respaldo está vacío"); return; }
    const total = sets.reduce((s2, [, v]) => s2 + v.length, 0);
    if (!confirm(`¿Restaurar ${total} registros de este respaldo? Se agregan o actualizan; no se borra nada.`)) return;
    for (const [table, rows] of sets) {
      const clean = rows.map((r) => ({ ...r, user_id: S.user.id }));
      for (let i = 0; i < clean.length; i += 300) mutate({ table, op: "upsert", row: clean.slice(i, i + 300) }, { split: true });
    }
    if (d.settings) mutate({ table: "settings", op: "upsert", row: { ...d.settings, user_id: S.user.id } });
    toast(`Respaldo restaurado: ${total} registros`);
  });

  // Excel (.xlsx) sin librerías: hojas Movimientos, Resumen mensual, Categorías y Cuentas
  function xlsxBlob(sheets) {
    const enc = new TextEncoder(), xe = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const col = (i) => { let s2 = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s2 = String.fromCharCode(65 + (i - 1) % 26) + s2; return s2; };
    const sheetXml = (rows) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = col(ci) + (ri + 1);
      return typeof v === "number" && isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ""}><is><t>${xe(v)}</t></is></c>`;
    }).join("")}</row>`).join("")}</sheetData></worksheet>`;
    const files = {
      "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
      "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${xe(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`,
    };
    sheets.forEach((sh, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sh.rows)));
    // ZIP sin compresión
    const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const parts = [], central = []; let off = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const [name, txt] of Object.entries(files)) {
      const nb = enc.encode(name), db = enc.encode(txt), crc = crc32(db);
      const head = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(db.length), ...u32(db.length), ...u16(nb.length), ...u16(0)];
      parts.push(new Uint8Array(head), nb, db);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(db.length), ...u32(db.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
      off += head.length + nb.length + db.length;
    }
    const cdSize = central.reduce((s2, b) => s2 + b.length, 0), n = Object.keys(files).length;
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(n), ...u16(n), ...u32(cdSize), ...u32(off), ...u16(0)]);
    return new Blob([...parts, ...central, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  function monthsWithData() {
    const set = new Set(S.movements.map((m) => m.date.slice(0, 7))); set.add(ymOf(today()));
    return [...set].sort();
  }
  $("#exportXlsx").addEventListener("click", () => {
    const prX = periodRange();
    const movs = S.movements.filter((m) => m.date >= prX.from && m.date <= prX.to).sort((a, b) => a.date.localeCompare(b.date));
    const TYPE = { gasto: "Gasto", ingreso: "Ingreso", transferencia: "Transferencia" };
    const sheets = [
      { name: "Movimientos", rows: [["Fecha", "Hora", "Tipo", "Monto", "Moneda original", "Monto original", "Categoría", "Cuenta", "Cuenta destino", "Descripción", "Método", "Etiquetas", "Notas", "Fijo"],
        ...movs.map((m) => [m.date, (m.time || "").slice(0, 5), TYPE[m.type] || m.type, P(C(m.amount)), m.currency || baseCur(), m.orig_amount ? P(C(m.orig_amount)) : P(C(m.amount)),
          cat(m.category_id)?.name || "", acc(m.account_id)?.name || "", acc(m.to_account_id)?.name || "", m.note || "", m.payment_method || "", (m.tags || []).join(" "), m.notes || "", S.fixed.find((f) => f.id === m.fixed_id)?.name || ""])] },
      ...(dbReady() ? [{ name: "Deudas", rows: [["Nombre", "Tipo", "Inicial", "Pendiente", "Vencimiento", "Estado"], ...(S.debts || []).map((d) => [d.name, d.direction === "debo" ? "Debo" : "Me deben", P(C(d.principal)), P(WCFin.debtBalanceC(d, S.debtPays || [])), d.due_date || "", d.status])] },
        { name: "Ahorros", rows: [["Meta", "Objetivo", "Ahorrado", "Fecha objetivo", "Estado"], ...(S.goals || []).map((g) => [g.name, P(C(g.target)), P(WCFin.goalSavedC(g, S.contribs || [])), g.target_date || "", g.status])] }] : []),
      { name: "Resumen mensual", rows: [["Mes", "Ingresos", "Gastos", "Neto", "% ahorro"], ...monthsWithData().map((m) => { const t = totals(m); return [m, t.inc, t.exp, t.net, t.inc ? Math.round(t.net / t.inc * 1000) / 10 : 0]; })] },
      { name: `Categorías ${S.ym}`, rows: [["Categoría", "Gasto", "% del total"], ...Object.entries(catTotals(S.ym)).sort((a, b) => b[1] - a[1]).map(([id, v]) => [cat(id)?.name || "Sin categoría", v, Math.round(v / (totals(S.ym).exp || 1) * 1000) / 10])] },
      { name: "Cuentas", rows: [["Cuenta", "Tipo", "Saldo", "Límite", "Disponible"], ...activeAccs().map((a) => { const c = isCredit(a) ? creditInfo(a) : null; return [a.name, ACC_KIND[a.kind] || "", accountBalance(a), c?.limit || "", c?.avail ?? ""]; })] },
    ];
    const blob = xlsxBlob(sheets), name = `withcash-${prX.from}_${prX.to}.xlsx`;
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iphone|ipad|android/i.test(navigator.userAgent)) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  // PDF: reporte imprimible (en iPhone: Compartir → Guardar en Archivos como PDF)
  $("#exportPdf").addEventListener("click", () => {
    const ym = S.ym, t = totals(ym), nw = netWorth(), cs = creditSummary(), st = subsTotals();
    const yr = ym.slice(0, 4), yt = (y) => monthsWithData().filter((m) => m.startsWith(y)).reduce((a, m) => { const x = totals(m); a.inc += x.inc; a.exp += x.exp; return a; }, { inc: 0, exp: 0 });
    const ty = yt(yr), ly = yt(String(Number(yr) - 1));
    const tr = (cells) => `<tr>${cells.map((c, i) => `<td${i ? ' class="r"' : ""}>${c}</td>`).join("")}</tr>`;
    $("#printArea").innerHTML = `<h1>WithCash · Reporte de ${monthName(ym)} ${yr}</h1><p>Generado el ${fmtShort(today())}</p>
      <h2>Resumen del mes</h2><table>${tr(["Ingresos", money(t.inc)])}${tr(["Gastos", money(t.exp)])}${tr(["Neto", money(t.net)])}${tr(["Saldo de meses anteriores", money(carryIn(ym).amount)])}</table>
      <h2>Patrimonio neto</h2><table>${tr(["Activos (cuentas)", money(nw.assets)])}${tr(["Deudas (tarjetas y préstamos)", money(nw.debts)])}${tr(["<b>Patrimonio neto</b>", `<b>${money(nw.net)}</b>`])}</table>
      ${cs.cards.length ? `<h2>Tarjetas de crédito</h2><table>${tr(["Tarjeta", "Utilizado", "Límite", "Disponible"])}${cs.cards.map((c) => tr([esc(c.a.name), money(c.used), money(c.limit), c.avail == null ? "—" : money(c.avail)])).join("")}</table>` : ""}
      <h2>Gastos por categoría</h2><table>${Object.entries(catTotals(ym)).sort((a, b) => b[1] - a[1]).map(([id, v]) => tr([esc(cat(id)?.name || "Sin categoría"), money(v), Math.round(v / (t.exp || 1) * 100) + "%"])).join("") || tr(["Sin gastos", ""])}</table>
      <h2>Comparación mensual (últimos 6 meses)</h2><table>${tr(["Mes", "Ingresos", "Gastos", "Neto"])}${[5, 4, 3, 2, 1, 0].map((i) => addMonths(ym, -i)).map((m) => { const x = totals(m); return tr([`${monthName(m)} ${m.slice(0, 4)}`, money(x.inc), money(x.exp), money(x.net)]); }).join("")}</table>
      <h2>Comparación anual</h2><table>${tr(["Año", "Ingresos", "Gastos", "Neto"])}${tr([String(Number(yr) - 1), money(ly.inc), money(ly.exp), money(ly.inc - ly.exp)])}${tr([yr, money(ty.inc), money(ty.exp), money(ty.inc - ty.exp)])}</table>
      ${st.subs.length ? `<h2>Suscripciones</h2><table>${st.subs.map((f) => tr([esc(f.name), money(perMonth(f)) + "/mes"])).join("")}${tr(["<b>Total</b>", `<b>${money(st.month)}/mes · ${money(st.year)}/año</b>`])}</table>` : ""}`;
    closeSheet($("#settingsSheet"));
    setTimeout(() => window.print(), 150);
  });

  $("#exportIcs").addEventListener("click", () => {
    const fx = S.fixed.filter((f) => f.active && !isBudget(f) && nextPending(f));
    if (!fx.length) { toast("Primero agrega pagos fijos"); return; }
    const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const md = (d) => (d >= 28 ? "-1" : String(d)); // 28 o más → último día del mes (aprox.)
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const icsEsc = (s) => String(s).replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WithCash//ES", "CALSCALE:GREGORIAN", "X-WR-CALNAME:WithCash pagos"];
    for (const f of fx) {
      const n = nextPending(f);
      const start = n.due.replace(/-/g, "");
      const fr = freqOf(f), inc = isIncome(f);
      const rule = fr === "semanal" ? `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[f.weekday]}`
        : fr === "quincenal" ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${md(f.day || 15)},${md(f.day2 || 31)}`
        : f.day > 28
          ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: f.day - 27 }, (_, i) => 28 + i).join(",")};BYSETPOS=-1`
          : `RRULE:FREQ=MONTHLY;BYMONTHDAY=${f.day}`;
      const trig = f.remind_days > 0 && !inc ? `-PT${f.remind_days * 24 - 9}H` : "PT9H";
      const verb = inc ? "Cobrar" : "Pagar";
      lines.push("BEGIN:VEVENT", `UID:withcash-${f.id}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, rule,
        `SUMMARY:${icsEsc(verb + " " + f.name + " (" + money(Number(f.amount)) + ")")}`,
        `DESCRIPTION:${icsEsc("Recordatorio de WithCash")}`,
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc(verb + " " + f.name)}`, `TRIGGER:${trig}`, "END:VALARM",
        ...(inc ? [] : ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc("Hoy vence " + f.name)}`, "TRIGGER:PT9H", "END:VALARM"]),
        "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    download("withcash-pagos.ics", lines.join("\r\n"), "text/calendar");
  });

  // ---------- Atajos de iPhone ----------
  async function sha256(s) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  const keyStore = () => `wc_key_${S.user.id}`;
  async function generateKey() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const key = "wc_" + [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
    const { error } = await sb.from("api_keys").upsert({ user_id: S.user.id, key_hash: await sha256(key), created_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { toast("No se pudo generar la llave: " + error.message); return; }
    ls.set(keyStore(), key);
    renderShortcuts();
    toast("Llave creada");
  }
  function renderShortcuts() {
    const key = ls.get(keyStore(), null);
    const base = `${CFG.supabaseUrl}/functions/v1/atajo?k=${key || "TU_LLAVE"}`;
    const copy = (label, val) => `<div class="codebox"><code>${esc(val)}</code><button type="button" class="btn sm" data-copy="${esc(val)}">Copiar</button></div>${label ? `<p class="hint">${label}</p>` : ""}`;
    let h = `<p class="hint">Así registras un gasto en 5 segundos desde el <b>Centro de Control</b>, la <b>pantalla de bloqueo</b> o tocando dos veces la parte trasera del iPhone — sin abrir la app.</p>`;
    if (!key) {
      h += `<h3>1. Crea tu llave personal</h3><p class="hint">Es como una contraseña solo para tus Atajos. No la compartas.</p>
        <button type="button" class="btn primary block" id="genKey">Generar mi llave</button>`;
      $("#shortcutsBody").innerHTML = h;
      $("#genKey").onclick = generateKey;
      return;
    }
    h += `<h3>1. Tu dirección personal</h3>${copy("Copia esta dirección: la vas a pegar en los Atajos. Contiene tu llave, no la compartas.", base)}
      <div class="stack"><button type="button" class="btn" id="testKey">Probar conexión</button></div>

      <h3>2. Atajo «Registrar gasto»</h3>
      <p class="hint">Abre la app <b>Atajos</b> → <b>+</b> → nómbralo “Registrar gasto” y agrega estas acciones en orden (búscalas por su nombre):</p>
      <ol>
        <li><span class="act">Solicitar entrada</span> → tipo <b>Número</b>, pregunta: <i>¿Cuánto gastaste?</i></li>
        <li><span class="act">Solicitar entrada</span> → tipo <b>Texto</b>, pregunta: <i>¿En qué lo gastaste?</i></li>
        <li><span class="act">Obtener contenido de URL</span> → pega: ${copy("", base + "&lista=cuentas")}</li>
        <li><span class="act">Dividir texto</span> → por <b>Nuevas líneas</b>.</li>
        <li><span class="act">Elegir de la lista</span> → mensaje: <i>¿Desde qué cuenta?</i></li>
        <li><span class="act">Obtener contenido de URL</span> → pega: ${copy("", base + "&lista=categorias")}</li>
        <li><span class="act">Dividir texto</span> → por <b>Nuevas líneas</b>.</li>
        <li><span class="act">Elegir de la lista</span> → mensaje: <i>Tipo de gasto</i></li>
        <li><span class="act">Obtener contenido de URL</span> → pega tu dirección del paso 1. Toca <b>Mostrar más</b>: Método <b>POST</b>, Cuerpo <b>JSON</b> y agrega estos campos (tipo Texto):
          <div class="kv">
            <div><b>tipo</b><span>gasto</span></div>
            <div><b>monto</b><span>Entrada solicitada (1)</span></div>
            <div><b>nota</b><span>Entrada solicitada (2)</span></div>
            <div><b>cuenta</b><span>Elemento elegido (1)</span></div>
            <div><b>categoria</b><span>Elemento elegido (2)</span></div>
          </div>
          <span class="hint">Para elegir la variable, mantén presionado el campo y toca “Seleccionar variable”.</span></li>
        <li><span class="act">Mostrar notificación</span> → con <b>Contenido de la URL</b>. Te confirmará: “Gasto guardado…”.</li>
      </ol>

      <h3>3. Atajo «Registrar ingreso»</h3>
      <p class="hint">Duplica el atajo anterior (mantén presionado → Duplicar), renómbralo y cambia:</p>
      <ol>
        <li>Las preguntas a <i>¿Cuánto recibiste?</i> y <i>¿De qué es?</i></li>
        <li>La dirección de categorías por: ${copy("", base + "&lista=ingresos")}</li>
        <li>En el JSON, <b>tipo</b> = <b>ingreso</b>.</li>
      </ol>

      <h3>4. Atajo «Pagar fijo» (opcional)</h3>
      <p class="hint">Para marcar como pagada una tarjeta, la luz, el colegio, Netflix… o como recibido tu sueldo.</p>
      <ol>
        <li><span class="act">Obtener contenido de URL</span> → ${copy("", base + "&lista=fijos")}</li>
        <li><span class="act">Dividir texto</span> (Nuevas líneas) → <span class="act">Elegir de la lista</span>: <i>¿Qué pago estás realizando?</i></li>
        <li><span class="act">Solicitar entrada</span> (Número): <i>¿Cuánto pagaste?</i> — si lo dejas vacío usa el monto habitual.</li>
        <li><span class="act">Obtener contenido de URL</span> → tu dirección, POST, JSON: <b>tipo</b> = fijo, <b>fijo</b> = Elemento elegido, <b>monto</b> = Entrada solicitada.</li>
        <li><span class="act">Mostrar notificación</span> → Contenido de la URL.</li>
      </ol>

      <h3>5. Ponlos en el Centro de Control</h3>
      <ol>
        <li>Desliza hacia abajo desde la esquina superior derecha → mantén presionado un espacio vacío → <b>Agregar un control</b>.</li>
        <li>Busca <b>Atajos</b> → elige “Registrar gasto”. Repite con “Registrar ingreso”.</li>
        <li>También puedes ponerlo en <b>Ajustes → Accesibilidad → Tocar → Tocar atrás → Doble toque</b>, o en el <b>Botón de Acción</b>.</li>
      </ol>

      <h3>6. Avisos de pagos cada mañana</h3>
      <p class="hint">Para que el iPhone te avise de tarjetas, luz, colegio, etc. antes de que venzan:</p>
      <ol>
        <li>En Atajos → pestaña <b>Automatización</b> → <b>+</b> → <b>Hora del día</b> → 9:00, Diariamente → <b>Ejecutar inmediatamente</b>.</li>
        <li><span class="act">Obtener contenido de URL</span> → ${copy("", base + "&resumen=avisos")}</li>
        <li><span class="act">Si</span> “Contenido de la URL” <b>tiene algún valor</b> → <span class="act">Mostrar notificación</span> con Contenido de la URL.</li>
      </ol>
      <p class="hint">Extra: ${copy("", base + "&resumen=mes")} te da el resumen del mes (puedes pedírselo a Siri con un atajo “¿Cómo voy este mes?”).</p>

      <h3>Seguridad</h3>
      <p class="hint">Si pierdes el celular o compartiste la dirección por error, genera una llave nueva: la anterior deja de funcionar y tendrás que actualizar la dirección en tus atajos.</p>
      <button type="button" class="btn block danger" id="regenKey">Generar llave nueva</button>`;
    $("#shortcutsBody").innerHTML = h;
    $("#regenKey").onclick = () => { if (confirm("La llave actual dejará de funcionar. ¿Continuar?")) generateKey(); };
    $("#testKey").onclick = async () => {
      try {
        const r = await fetch(base + "&resumen=mes");
        const t = await r.text();
        toast(r.ok ? "Conexión correcta" : t);
      } catch { toast("No hay conexión con el servidor"); }
    };
  }
  $("#openShortcuts").addEventListener("click", () => { renderShortcuts(); openSheet("#shortcutsSheet"); });
  $("#shortcutsBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copiado"; setTimeout(() => (b.textContent = "Copiar"), 1500); }
    catch { prompt("Copia el texto:", b.dataset.copy); }
  });

  // =====================================================================
  // ---------- Módulos: tema, ventana genérica, menú Más, periodos ----------
  // =====================================================================
  function applyTheme() {
    const t = S.settings.theme || "oscuro";
    const dark = t === "oscuro" || (t === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? "#000000" : "#ffffff";
    document.title = S.settings.app_name || "WithCash";
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);

  // Ventana genérica para formularios y detalles de los módulos
  let dynClose = null;
  function openDyn(html, bind) {
    // Contenedor nuevo cada vez: así no se acumulan los controladores de clic de ventanas anteriores
    const body = document.createElement("div");
    body.className = "dyn"; body.id = "dynBody";
    body.innerHTML = html;
    $("#dynBody").replaceWith(body);
    openSheet("#dynSheet");
    bind && bind(body);
  }
  const closeDyn = () => { if ($("#dynSheet").open) $("#dynSheet").close(); };
  $("#dynSheet").addEventListener("close", () => { dynClose && dynClose(); dynClose = null; });
  const field = (label, inner, cls = "") => `<label class="field ${cls}"><span>${label}</span>${inner}</label>`;
  const val = (root, sel) => root.querySelector(sel)?.value?.trim() ?? "";
  const accOptions = (sel, allowEmpty = true, filter = () => true) => (allowEmpty ? `<option value="">—</option>` : "") +
    activeAccs().filter(filter).map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${esc(a.name)}</option>`).join("");
  const needDb = () => { if (dbReady()) return false; toast("Esta función estará disponible cuando se aplique la actualización de la base de datos"); return true; };

  // Secciones secundarias (en el menú inferior)
  const MODULES = [
    { tab: "tarjetas", name: "Tarjetas", icon: "card", color: "#ff8fa3" },
    { tab: "cuentas", name: "Cuentas", icon: "wallet", color: "#7aa2ff" },
    { tab: "presupuestos", name: "Presupuestos", icon: "target", color: "#ffb36b" },
    { tab: "ahorros", name: "Ahorros", icon: "piggy", color: "#3ddc97" },
    { tab: "deudas", name: "Deudas", icon: "handshake", color: "#ff8fa3" },
    { tab: "suscripciones", name: "Suscripciones", icon: "tv", color: "#b69cff" },
    { tab: "buscar", name: "Buscar", icon: "search", color: "#67d4ff" },
    { tab: "config", name: "Configuración", icon: "sliders", color: "#a1a1a8" },
  ];
  // Periodos para Inicio y Reportes
  const PERIODS = [["mes", "Este mes"], ["prev", "Mes anterior"], ["3m", "3 meses"], ["6m", "6 meses"], ["anio", "Este año"], ["custom", "Personalizado"]];
  function periodRange() {
    const ym = S.ym, t = today();
    switch (S.period) {
      case "prev": { const p = addMonths(ymOf(t), -1); return { from: `${p}-01`, to: dueDate(p, 31), label: `${monthName(p)} ${p.slice(0, 4)}` }; }
      case "3m": return { from: `${addMonths(ymOf(t), -2)}-01`, to: t, label: "Últimos 3 meses" };
      case "6m": return { from: `${addMonths(ymOf(t), -5)}-01`, to: t, label: "Últimos 6 meses" };
      case "anio": return { from: `${t.slice(0, 4)}-01-01`, to: t, label: `Año ${t.slice(0, 4)}` };
      case "custom": return { from: S.periodFrom || `${ym}-01`, to: S.periodTo || t, label: `${fmtShort(S.periodFrom || `${ym}-01`)} – ${fmtShort(S.periodTo || t)}` };
      default: return { from: `${ym}-01`, to: dueDate(ym, 31), label: `${monthName(ym)} ${ym.slice(0, 4)}` };
    }
  }
  const periodChips = () => `<div class="filters period">${PERIODS.map(([k, l]) => `<button class="chip ${S.period === k ? "active" : ""}" data-period="${k}">${l}</button>`).join("")}</div>
    ${S.period === "custom" ? `<div class="row2 custom-range"><input type="date" id="pFrom" value="${S.periodFrom || `${S.ym}-01`}"><input type="date" id="pTo" value="${S.periodTo || today()}"></div>` : ""}`;

  // ---------- Dinero disponible real ----------
  function reservedTotal() { return P((S.goals || []).filter((g) => g.status === "activa").reduce((s, g) => s + Math.max(0, WCFin.goalSavedC(g, S.contribs || [])), 0)); }
  function moneyPicture() {
    const liquid = sumP(activeAccs().filter((a) => !isCredit(a) && a.kind !== "inversion"), accountBalance);
    const reserved = reservedTotal(), cm = commitments(ymOf(today()));
    const committedC = C(cm.fixed) + C(cm.cardsDebt);
    const r = WCFin.availability({ liquidC: C(liquid), reservedC: C(reserved), commitmentsC: committedC });
    const pendingCount = S.fixed.filter((f) => f.active && isBill(f)).reduce((n, f) => n + pendingOcc(f).filter((o) => o.due <= dueDate(ymOf(today()), 31)).length, 0);
    return { liquid, reserved, commitments: P(committedC), cardsDebt: cm.cardsDebt, incomes: cm.incomes, available: P(r.available), pendingCount };
  }

  // ---------- Cuentas ----------
  const ACC_GROUPS = [["efectivo", "Efectivo"], ["banco", "Cuentas bancarias"], ["debito", "Débito"], ["ahorro", "Ahorro"], ["inversion", "Inversión"], ["credito", "Tarjetas de crédito"], ["otra", "Personalizadas"]];
  function viewCuentas() {
    const accs = activeAccs(), nw = netWorth(), mp = moneyPicture();
    let html = `<section class="card tone" style="--t:#7aa2ff"><div class="c-head"><span class="c-title">Saldo total ${eyeBtn()}</span>${pill(`${accs.length} cuentas`, "#7aa2ff", "wallet")}</div>
      <div class="big num" style="font-size:32px;font-weight:700">${pm(mp.liquid)}</div>
      <div class="split3"><div><span class="k">Reservado</span><b class="num">${pm(mp.reserved)}</b></div><div><span class="k">Deuda</span><b class="num neg">${money(nw.debts)}</b></div><div><span class="k">Patrimonio</span><b class="num ${nw.net < 0 ? "neg" : ""}">${pm(nw.net)}</b></div></div></section>`;
    for (const [k, label] of ACC_GROUPS) {
      const list = accs.filter((a) => (a.kind || "debito") === k);
      if (!list.length) continue;
      html += `<section class="card"><div class="c-head"><span class="c-title">${label}</span><span class="hint num">${k === "credito" ? money(sumP(list, accountBalance)) : pm(sumP(list, accountBalance))}</span></div><ul class="list">${list.map((a) => {
        const b = accountBalance(a), ci = isCredit(a) ? creditInfo(a) : null;
        return `<li class="item tap" data-acc-detail="${a.id}">${tile(iconKey(a.icon, a.name, "wallet"), a.color || colorFor(a.id))}
          <div class="main"><div class="t">${esc(a.name)}</div><div class="s">${[a.institution, a.currency && a.currency !== (S.settings.currency || "MXN") ? a.currency : null, ci && ci.limit ? `Disponible ${money(ci.avail)}` : null].filter(Boolean).map(esc).join(" · ") || ACC_KIND[a.kind] || ""}</div></div>
          <div class="amt num ${b < 0 ? "neg" : ""}">${ci ? money(b) : pm(b)}</div></li>`;
      }).join("")}</ul></section>`;
    }
    const archived = S.accounts.filter((a) => a.archived);
    if (archived.length) html += `<p class="hint center">${archived.length} cuenta(s) archivada(s) · se conservan con su historial</p>`;
    html += `<button class="btn block" data-new-acc>${ico("plus")} Agregar cuenta</button>`;
    return html;
  }
  function accountDetail(id) {
    const a = acc(id); if (!a) return;
    const b = accountBalance(a), ci = isCredit(a) ? creditInfo(a) : null;
    const hist = S.movements.filter((m) => m.account_id === id || m.to_account_id === id).slice(0, 60);
    const purchases = ci ? hist.filter((m) => m.type === "gasto" && m.account_id === id) : [];
    const payments = ci ? hist.filter((m) => m.type === "transferencia" && m.to_account_id === id) : [];
    const row = (m) => { const out = m.type === "gasto" || (m.type === "transferencia" && m.account_id === id); const c = cat(m.category_id);
      return `<li class="item tap" data-dyn-mov="${m.id}"><div class="main"><div class="t">${esc(m.note || (m.type === "transferencia" ? "Transferencia" : c?.name || "Movimiento"))}</div><div class="s">${fmtShort(m.date)}${m.time ? " " + fmtTime(m.time) : ""}${c ? " · " + esc(c.name) : ""}</div></div><div class="amt num ${out ? "" : "pos"}">${out ? "−" : "+"}${money(Number(m.amount))}</div></li>`; };
    openDyn(`<div class="c-head"><h2 style="margin:0">${esc(a.name)}</h2>${pill(ACC_KIND[a.kind] || "Cuenta", a.color || colorFor(a.id), "wallet")}</div>
      <div class="big num ${b < 0 ? "neg" : ""}" style="font-size:30px;font-weight:700;margin:8px 0">${money(b)}</div>
      ${ci ? `<div class="credit-box"><div><span>Utilizado</span><b class="num neg">${money(ci.used)}</b></div><div><span>Disponible</span><b class="num pos">${ci.avail == null ? "—" : money(ci.avail)}</b></div>
        <div><span>Corte</span><b>${ci.cut ? fmtShort(ci.cut) : "—"}</b></div><div><span>Fecha límite</span><b>${ci.due ? fmtShort(ci.due) : "—"}</b></div>
        <div><span>Interés estimado/mes</span><b class="num">${ci.interest ? money(ci.interest) : "—"}</b></div><div><span>Intereses ${today().slice(0, 4)}</span><b class="num">${money(ci.paidInterest)}</b></div></div>` : ""}
      <div class="row2 actions-row">
        <button type="button" class="btn" data-a="edit">${ico("edit")} Editar</button>
        <button type="button" class="btn" data-a="move">${ico("swap")} Transferir</button>
        ${ci ? `<button type="button" class="btn primary" data-a="pay">Pagar</button>` : ""}
      </div>
      ${ci ? `<h3>Compras (${purchases.length})</h3><ul class="list">${purchases.slice(0, 15).map(row).join("") || `<li class="hint">Sin compras.</li>`}</ul>
        <h3>Pagos (${payments.length})</h3><ul class="list">${payments.slice(0, 15).map(row).join("") || `<li class="hint">Sin pagos.</li>`}</ul>`
        : `<h3>Historial</h3><ul class="list">${hist.slice(0, 30).map(row).join("") || `<li class="hint">Sin movimientos.</li>`}</ul>`}
      <div class="sheet-actions"><button type="button" class="btn" data-a="all">Ver todos los movimientos</button><button type="button" class="btn ghost" data-close>Cerrar</button></div>`, (root) => {
      root.addEventListener("click", (e) => {
        const m = e.target.closest("[data-dyn-mov]"); if (m) { closeDyn(); openEntry({ id: m.dataset.dynMov }); return; }
        const x = e.target.closest("[data-a]"); if (!x) return;
        const act = x.dataset.a; closeDyn();
        if (act === "edit") openItem("accounts", a);
        else if (act === "move") openEntry({ type: "transferencia", account_id: a.id });
        else if (act === "pay") { const from = activeAccs().find((y) => !isCredit(y) && y.id !== a.id); openEntry({ type: "transferencia", amount: ci.used || "", account_id: from?.id, to_account_id: a.id, note: `Pago ${a.name}` }); }
        else if (act === "all") { S.movAcc = a.id; S.movFilter = "todos"; goTab("movimientos"); }
      });
    });
  }

  // ---------- Tarjetas de crédito: crédito, lo que debo y disponible ----------
  // Sin «.00» para que las cantidades quepan completas en pantallas angostas
  const m0 = (v) => money(v).replace(/\.00$/, "");
  const triple = (lim, debt, avail) => `<div class="triple">
      <div><span>Crédito</span><b class="num">${lim ? m0(lim) : "—"}</b></div>
      <div><span>Debo</span><b class="num ${debt > 0 ? "neg" : ""}">${m0(debt)}</b></div>
      <div><span>Disponible</span><b class="num ${avail == null ? "" : avail < 0 ? "neg" : "pos"}">${avail == null ? "—" : m0(avail)}</b></div></div>`;
  const cardStatement = (a) => { const st = WCFin.statementC(a, S.movements, S.debts || [], S.debtPays || [], today(), S.plans || []); return st && { ...st, statement: P(st.statement), next: P(st.next), total: P(st.total) }; };
  function cardBlock(c) {
    const pct = c.limit ? Math.min(1, c.used / c.limit) : 0, col = c.a.color || colorFor(c.a.id), st = cardStatement(c.a);
    return `<div class="cc tap" data-credit="${c.a.id}">
      <div class="cc-head">${tile(iconKey(c.a.icon, c.a.name, "card"), col, "sm")}<b>${esc(c.a.name)}</b>
        ${st && st.payBy ? (st.statement > 0
            ? (() => { const dd = daysBetween(today(), st.payBy); return `<span class="badge ${dd <= 1 ? "bad" : dd <= 5 ? "warn" : ""}">Pagar ${money(st.statement)} antes del ${fmtShort(st.payBy)}</span>`; })()
            : `<span class="badge good">Al corriente</span>`)
          : c.due ? `<span class="badge ${c.used > 0 && c.dueDays <= 1 ? "bad" : c.used > 0 && c.dueDays <= 5 ? "warn" : ""}">Pagar antes del ${fmtShort(c.due)}</span>` : `<span class="badge">Sin fecha de pago</span>`}</div>
      ${triple(c.limit, c.used, c.limit ? c.avail : null)}
      ${c.limit ? `<div class="bar-soft ${pct >= 0.8 ? "over" : ""}" style="--t:${col};margin-top:10px"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>` : `<p class="hint" style="margin:8px 0 0">Toca para agregar el crédito de esta tarjeta</p>`}
      ${planList(c.a)}
      ${st ? `<div class="stmt">
          <div><span>Corte del ${fmtShort(st.lastCut)}</span><b class="num ${st.statement ? "neg" : ""}">${st.statement ? money(st.statement) : "Pagado"}</b><small>${st.statement && st.payBy ? `pagar antes del ${fmtShort(st.payBy)}` : "sin saldo al corte"}</small></div>
          <div><span>Siguiente corte (${fmtShort(st.nextCut)})</span><b class="num">${money(st.next)}</b><small>${st.nextPayBy ? `se paga el ${fmtShort(st.nextPayBy)}` : "compras después del corte"}${st.later ? ` · ${money(P(st.later))} en meses siguientes` : ""}</small></div>
        </div>` : `<p class="hint warn-t" style="margin:8px 0 0">${ico("alert", "i-sm")} Falta el día de corte: tócala para agregarlo</p>`}
    </div>`;
  }
  // ---------- Compras y deudas a meses ----------
  // Mes del corte en que se cobraría hoy una mensualidad nueva (el próximo corte)
  const nextBillMonth = (a, d = today()) => ymOf(a.cut_day ? WCFin.cutFor(a.cut_day, d) : d);
  function planInfo(p) {
    const inst = WCFin.planInstallmentsC(p), a = acc(p.account_id);
    const cutRef = a?.cut_day ? WCFin.lastCutOn(a.cut_day, today()) : today();
    const billed = WCFin.planBilledCount(p, cutRef), left = inst.slice(billed).reduce((s2, v) => s2 + v, 0);
    return { inst, billed, left: P(left), monthly: P(inst[Math.min(billed, inst.length - 1)]), current: Math.min(p.installments, billed + 1), done: billed >= p.installments };
  }
  function planList(a) {
    if (!plansReady()) return "";
    const plans = WCFin.activePlans(S.plans, a.id);
    return `<div class="plans">${plans.map((p) => { const i = planInfo(p);
      return `<button type="button" class="plan" data-plan="${p.id}"><span><b>${esc(p.name)}</b><small>${i.done ? "Pagado por completo" : `Pago ${i.current} de ${p.installments} · ${money(i.monthly)}/mes`}</small></span><span class="num">${i.done ? "" : `Faltan ${money(i.left)}`}</span></button>`; }).join("")}
      <button type="button" class="btn sm ghost plan-add" data-plan-new="${a.id}">${ico("plus")} Deuda o compra a meses</button></div>`;
  }
  function planForm(accountId, id) {
    if (!plansReady()) { toast("Para usar compras a meses aplica la actualización 0006 de la base de datos"); return; }
    const p = (S.plans || []).find((x) => x.id === id), a = acc(p?.account_id || accountId); if (!a) return;
    const nb = nextBillMonth(a), info = p ? planInfo(p) : null;
    const monthOpts = [-1, 0, 1, 2].map((k) => addMonths(nb, k)).map((m) => `<option value="${m}">${monthName(m)} ${m.slice(0, 4)}</option>`).join("");
    openDyn(`<h2>${p ? "Editar plan a meses" : "Deuda o compra a meses"}</h2><p class="hint">Tarjeta <b>${esc(a.name)}</b>. Lo que debes sigue contando completo; en cada corte solo se cobra la mensualidad.</p>
      ${field("Descripción", `<input id="plName" maxlength="60" value="${esc(p?.name || "")}" placeholder="Ej. Compra Mercado Libre">`)}
      <div class="row2">${field("Total", `<input id="plTotal" inputmode="decimal" value="${p ? Number(p.total) : ""}" placeholder="0">`)}${field("Número de pagos", `<input id="plN" type="number" inputmode="numeric" min="1" max="72" value="${p?.installments || 3}">`, "narrow")}</div>
      <div class="row2">${field("Pagos ya hechos", `<input id="plPaid" type="number" inputmode="numeric" min="0" value="${p ? Math.max(0, WCFin.planBilledCount(p, a.cut_day ? WCFin.lastCutOn(a.cut_day, today()) : addMonths(today(), -1) + "-28")) : 0}">`)}${field("El siguiente pago se cobra en", `<select id="plNext">${monthOpts}</select>`)}</div>
      <div class="credit-live" id="plLive"></div><p class="hint warn-t" id="plWarn" hidden></p>
      <div class="sheet-actions">${p ? `<button type="button" class="btn ghost danger" data-a="del">Eliminar</button>` : ""}<button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-a="save">Guardar</button></div>`, (root) => {
      const nextSel = root.querySelector("#plNext");
      if (p) { const want = addMonths(p.first_month, Math.max(0, parseInt(root.querySelector("#plPaid").value, 10) || 0)); if ([...nextSel.options].some((o) => o.value === want)) nextSel.value = want; }
      else nextSel.value = nb;
      const paint = () => {
        const t = parseAmount(val(root, "#plTotal")) || 0, n = parseInt(val(root, "#plN"), 10) || 0, done = parseInt(val(root, "#plPaid"), 10) || 0;
        if (!(t > 0) || !(n >= 1)) { root.querySelector("#plLive").innerHTML = ""; return; }
        const inst = WCFin.planInstallmentsC({ total: t, installments: n }), left = inst.slice(Math.min(done, n)).reduce((s2, v) => s2 + v, 0);
        root.querySelector("#plLive").innerHTML = `<span>${n} pagos de</span><b class="num">${money(P(inst[0]))}</b><small>${done ? `faltan ${money(P(left))}` : inst[0] !== inst[n - 1] ? `último ${money(P(inst[n - 1]))}` : ""}</small>`;
        const debtC = C(creditInfo(a).used), w = root.querySelector("#plWarn");
        w.hidden = !(left > debtC && !p?.movement_id);
        if (!w.hidden) w.innerHTML = `${ico("alert", "i-sm")} Lo que falta (${money(P(left))}) es más de lo que debes en ${esc(a.name)} (${money(P(debtC))}). Si es una deuda que ya tenías, súmala en «¿Cuánto debes hoy?» de la tarjeta.`;
      };
      root.addEventListener("input", paint); paint();
      root.addEventListener("click", (e) => {
        const x = e.target.closest("[data-a]"); if (!x) return;
        if (x.dataset.a === "del") { if (!confirm(`¿Eliminar el plan "${p.name}"? La deuda de la tarjeta no cambia.`)) return; mutate({ table: "card_plans", op: "delete", id: p.id }); closeDyn(); return; }
        const name = val(root, "#plName") || "Compra a meses", total = parseAmount(val(root, "#plTotal")), n = parseInt(val(root, "#plN"), 10), done = parseInt(val(root, "#plPaid"), 10) || 0;
        if (!(total > 0) || !(n >= 1 && n <= 72) || done < 0 || done >= n) { toast("Revisa el total, el número de pagos y los pagos hechos"); return; }
        const first_month = addMonths(nextSel.value, -done);
        mutate({ table: "card_plans", op: "upsert", row: { id: p?.id || uuid(), user_id: S.user.id, account_id: a.id, movement_id: p?.movement_id || null, name: name.slice(0, 60),
          total: round2(total), installments: n, first_month, status: "activo", created_at: p?.created_at || new Date().toISOString() } });
        closeDyn(); toast(p ? "Plan actualizado" : `${n} pagos de ${money(P(WCFin.planInstallmentsC({ total, installments: n })[0]))}`);
      });
    });
  }

  // Pagos de tarjeta registrados como «Pagos» que todavía no son una tarjeta (por nombre)
  const pendingCardPayments = () => {
    const names = new Set(activeAccs().filter(isCredit).map((a) => a.name.trim().toLowerCase()));
    return S.fixed.filter((f) => f.active && f.kind === "tarjeta" && !names.has(f.name.trim().toLowerCase()));
  };
  function viewTarjetas() {
    const cs = creditSummary(), cards = cs.cards;
    const debtC = cards.reduce((s, c) => s + C(c.used), 0), limC = cards.reduce((s, c) => s + C(c.limit), 0);
    const pend = pendingCardPayments();
    let html = `<section class="card tone" style="--t:#ff8fa3"><div class="c-head"><span class="c-title">Todas mis tarjetas</span>${pill(`${cards.length} tarjeta${cards.length === 1 ? "" : "s"}`, "#ff8fa3", "card")}</div>
      ${triple(P(limC), P(debtC), limC ? P(limC - debtC) : null)}
      ${limC ? `<div class="bar-soft ${debtC / limC >= 0.8 ? "over" : ""}" style="margin-top:12px"><i style="width:${Math.min(100, debtC / limC * 100).toFixed(1)}%"></i></div>
        <div class="foot"><span>Utilizado</span><span>${Math.round(debtC / limC * 100)}%</span></div>` : ""}
    </section>`;
    if (pend.length) html += `<section class="card"><div class="c-head"><span class="c-title">Tus pagos de tarjeta</span></div>
      <p class="hint" style="margin:0 0 10px">Tienes ${pend.length} tarjeta(s) registradas solo como pago mensual (${pend.map((f) => esc(f.name)).join(", ")}). Conviértelas en tarjetas para ver su crédito y lo disponible.</p>
      <button class="btn primary block" data-cards-from-pays>${ico("card")} Crear mis tarjetas</button></section>`;
    if (cards.length) html += `<section class="card"><div class="cc-list">${cards.map(cardBlock).join("")}</div></section>`;
    else if (!pend.length) html += `<section class="card"><div class="empty"><div class="e">${ico("card")}</div>Agrega tus tarjetas de crédito para ver cuánto debes y cuánto tienes disponible.</div></section>`;
    html += `<button class="btn block" data-new-card>${ico("plus")} Agregar tarjeta</button>`;
    return html;
  }
  // Crear varias tarjetas a partir de los pagos de tarjeta: solo se escribe el crédito y lo que se debe
  function cardsFromPayments() {
    const pend = pendingCardPayments(); if (!pend.length) return;
    openDyn(`<h2>Crear mis tarjetas</h2><p class="hint">Escribe el crédito (límite) y cuánto debes hoy en cada una. El disponible se calcula solo. Puedes dejar en blanco las que no sepas.</p>
      ${pend.map((f) => `<div class="cc-new" data-fid="${f.id}"><b>${esc(f.name)}</b><span class="hint">Pago el día ${f.day}</span>
        <div class="row2"><label class="field"><span>Crédito</span><input class="inp" data-k="lim" inputmode="decimal" placeholder="0"></label><label class="field"><span>Debo</span><input class="inp" data-k="debt" inputmode="decimal" placeholder="0"></label></div>
        <div class="row2"><label class="field"><span>Día de corte</span><input class="inp" data-k="cut" type="number" inputmode="numeric" min="1" max="31" placeholder="Ej. 3"></label><label class="field"><span>Día límite de pago</span><input class="inp" data-k="due" type="number" inputmode="numeric" min="1" max="31" value="${f.day || ""}"></label></div>
        <div class="credit-live" data-live></div></div>`).join("")}
      <div class="sheet-actions"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-a="save">Crear tarjetas</button></div>`, (root) => {
      const paint = (box) => { const l = C(parseAmount(box.querySelector('[data-k="lim"]').value) || 0), d = C(parseAmount(box.querySelector('[data-k="debt"]').value) || 0);
        box.querySelector("[data-live]").innerHTML = l ? `<span>Disponible</span><b class="num ${l - d < 0 ? "neg" : "pos"}">${money(P(l - d))}</b>` : ""; };
      root.addEventListener("input", (e) => { const box = e.target.closest(".cc-new"); if (box) paint(box); });
      root.addEventListener("click", (e) => {
        if (!e.target.closest('[data-a="save"]')) return;
        const base = S.accounts.length;
        const ops = [...root.querySelectorAll(".cc-new")].map((box, i) => {
          const f = S.fixed.find((x) => x.id === box.dataset.fid);
          const lim = parseAmount(box.querySelector('[data-k="lim"]').value) || 0, debt = Math.abs(parseAmount(box.querySelector('[data-k="debt"]').value) || 0);
          const day = (k) => { const v = parseInt(box.querySelector(`[data-k="${k}"]`).value, 10); return v >= 1 && v <= 31 ? v : null; };
          return { table: "accounts", op: "upsert", row: { id: uuid(), user_id: S.user.id, name: f.name.slice(0, 40), icon: "card", kind: "credito", initial_balance: round2(-debt),
            credit_limit: lim > 0 ? round2(lim) : null, due_day: day("due") || f.day || null, cut_day: day("cut"), apr: null, sort: base + i + 1, archived: false, created_at: new Date().toISOString() } };
        });
        mutate(ops); closeDyn(); toast(`${ops.length} tarjeta(s) creadas`);
      });
    });
  }

  // ---------- Pagos: acciones sobre un compromiso ----------
  function paymentActions(id) {
    const f = S.fixed.find((x) => x.id === id); if (!f) return;
    const n = nextPending(f), hist = S.movements.filter((m) => m.fixed_id === f.id).slice(0, 24), inc = isIncome(f);
    const st = f.paused ? ["Pausado", "#a1a1a8"] : !f.active ? ["Cancelado", "#a1a1a8"] : !n ? ["Al corriente", "#3ddc97"]
      : n.days < 0 ? ["Vencido", "#ff6b6b"] : n.days <= (f.remind_days || 3) ? ["Pendiente", "#ffb36b"] : ["Programado", "#7aa2ff"];
    openDyn(`<div class="c-head"><h2 style="margin:0">${esc(f.name)}</h2>${pill(st[0], st[1], "clock")}</div>
      <p class="hint">${money(Number(f.amount))} · ${scheduleLabel(f)}${f.notes ? ` · ${esc(f.notes)}` : ""}</p>
      ${n ? `<div class="next-box"><span>Próxima fecha</span><b>${fmtDay(n.due)}</b><small>${n.days < 0 ? `venció hace ${-n.days} día(s)` : n.days === 0 ? "hoy" : `en ${n.days} día(s)`}</small></div>` : ""}
      <div class="stack">
        ${n && !f.paused ? `<button type="button" class="btn primary" data-a="pay">${ico("check")} ${inc ? "Marcar como recibido" : "Marcar como pagado"}</button>` : ""}
        ${n && dbReady() && !f.paused ? `<div class="row2"><input type="date" id="reDate" value="${n.due}" class="inp"><button type="button" class="btn" data-a="move">Reprogramar</button></div>
          <button type="button" class="btn" data-a="skip">Saltar esta fecha</button>` : ""}
        <div class="row2"><button type="button" class="btn" data-a="edit">${ico("edit")} Editar</button>
          <button type="button" class="btn" data-a="pause">${ico(f.paused ? "play" : "pause")} ${f.paused ? "Reanudar" : "Pausar"}</button></div>
        <button type="button" class="btn ghost danger" data-a="cancel">${ico("x")} Cancelar este ${f.kind === "suscripcion" ? "servicio" : "pago"}</button>
      </div>
      <h3>Historial (${hist.length})</h3>
      <ul class="list">${hist.map((m) => `<li class="item tap" data-dyn-mov="${m.id}"><div class="main"><div class="t">${occLabel(m.fixed_for || m.date.slice(0, 7))}</div><div class="s">${inc ? "Recibido" : "Pagado"} el ${fmtShort(m.date)}</div></div><div class="amt num">${money(Number(m.amount))}</div></li>`).join("") || `<li class="hint">Aún no hay registros.</li>`}</ul>
      <div class="sheet-actions"><button type="button" class="btn ghost" data-close>Cerrar</button></div>`, (root) => {
      root.addEventListener("click", (e) => {
        const m = e.target.closest("[data-dyn-mov]"); if (m) { closeDyn(); openEntry({ id: m.dataset.dynMov }); return; }
        const x = e.target.closest("[data-a]"); if (!x) return;
        const act = x.dataset.a;
        if (act === "pay") { closeDyn(); payFixed(f.id, n.key); }
        else if (act === "move") {
          const d = val(root, "#reDate"); if (!d) return;
          mutate({ table: "fixed_overrides", op: "upsert", row: { id: overrideId(f.id, n.key), user_id: S.user.id, fixed_id: f.id, occ_key: n.key, action: "move", new_date: d, created_at: new Date().toISOString() } });
          closeDyn(); toast(`Reprogramado al ${fmtShort(d)}`);
        } else if (act === "skip") {
          if (!confirm(`¿Saltar la fecha del ${fmtShort(n.due)}? No se registrará ni aparecerá como pendiente.`)) return;
          mutate({ table: "fixed_overrides", op: "upsert", row: { id: overrideId(f.id, n.key), user_id: S.user.id, fixed_id: f.id, occ_key: n.key, action: "skip", new_date: null, created_at: new Date().toISOString() } });
          closeDyn(); toast("Fecha saltada");
        } else if (act === "edit") { closeDyn(); openFixed(f.id); }
        else if (act === "pause") { mutate({ table: "fixed_payments", op: "upsert", row: { ...stripLocal(f), paused: !f.paused } }); closeDyn(); toast(f.paused ? "Reanudado" : "Pausado"); }
        else if (act === "cancel") {
          if (!confirm(`¿Cancelar "${f.name}"? Su historial de pagos se conserva.`)) return;
          mutate({ table: "fixed_payments", op: "upsert", row: { ...stripLocal(f), active: false } }); closeDyn(); toast("Cancelado");
        }
      });
    });
  }
  // Un solo ajuste por fecha: el id se reutiliza si ya existía
  const overrideId = (fid, key) => (S.overrides || []).find((o) => o.fixed_id === fid && o.occ_key === key)?.id || uuid();
  const stripLocal = (r) => { const x = { ...r }; delete x.updated_at; return x; };

  // ---------- Presupuestos ----------
  function viewPresupuestos() {
    const list = S.fixed.filter((f) => f.active && isBudget(f));
    let html = `<section class="card tone" style="--t:#ffb36b"><div class="c-head"><span class="c-title">Presupuestos</span>${pill(`${list.length} activos`, "#ffb36b", "target")}</div>
      <p class="hint" style="margin:0">Se actualizan solos con tus gastos de cada categoría. Avisan al 50, 75, 90 y 100 %.</p></section>`;
    if (!list.length) html += `<section class="card"><div class="empty"><div class="e">${ico("target")}</div>Crea un presupuesto semanal, mensual, anual o por rango para una categoría.</div></section>`;
    else html += `<section class="card"><ul class="list">${list.map((f) => {
      const u = budgetUse(f), lvl = WCFin.budgetLevel(u.pct), col = lvl > 100 ? "#ff6b6b" : lvl >= 90 ? "#ff6b6b" : lvl >= 75 ? "#ffb36b" : lvl >= 50 ? "#ffd36b" : "#3ddc97";
      const c = cat(f.category_id);
      return `<li class="item tap" data-edit-fixed="${f.id}">${tile(iconKey(c?.icon, c?.name, "target"), c ? colorFor(c.id) : "#ffb36b")}
        <div class="main"><div class="t">${esc(f.name)} <span class="amt-inline">${Math.round(u.pct * 100)}%</span></div>
          <div class="s"><b class="num">${money(u.spent)}</b> de ${money(u.limit)} · ${esc(budgetPeriodLabel(f, u))}</div>
          <div class="bar-soft" style="--t:${col};margin-top:6px"><i style="width:${Math.min(100, u.pct * 100).toFixed(1)}%"></i></div>
          <div class="s">${u.left >= 0 ? `Restante <b>${money(u.left)}</b>` : `<span class="badge bad">Excedido ${money(-u.left)}</span>`}</div></div></li>`;
    }).join("")}</ul></section>`;
    html += `<button class="btn block" data-new-budget>${ico("plus")} Nuevo presupuesto</button>`;
    return html;
  }
  function budgetPeriodLabel(f, u) {
    const fr = freqOf(f);
    if (fr === "personalizado") return `${fmtShort(u.start)} – ${fmtShort(u.end)}`;
    return { semanal: "esta semana", quincenal: "esta quincena", anual: `año ${u.start.slice(0, 4)}` }[fr] || "este mes";
  }

  // ---------- Ahorros ----------
  function viewAhorros() {
    if (!dbReady()) return dbPending("Ahorros");
    const goals = (S.goals || []).filter((g) => g.status !== "archivada");
    const total = reservedTotal();
    let html = `<section class="card tone" style="--t:#3ddc97"><div class="c-head"><span class="c-title">Ahorro acumulado</span>${pill(`${goals.length} metas`, "#3ddc97", "piggy")}</div>
      <div class="big num" style="font-size:32px;font-weight:700">${money(total)}</div>
      <p class="hint" style="margin:6px 0 0">Es dinero reservado dentro de tus cuentas: se descuenta del disponible, no se suma dos veces al patrimonio.</p></section>`;
    for (const g of goals) {
      const p = WCFin.goalPlan(g, S.contribs || [], today()), col = g.color || colorFor(g.id);
      const days = g.target_date ? daysBetween(today(), g.target_date) : null;
      html += `<section class="card tone goal" style="--t:${col}" data-goal="${g.id}">
        <div class="c-head">${tile(g.icon || "piggy", col)}<div class="goal-t"><b>${esc(g.name)}</b><span>${g.target_date ? fmtShort(g.target_date) : "Sin fecha"}</span></div>${days != null ? pill(`${days} días`, col, "clock") : ""}</div>
        <div class="split2"><div><span class="k">Ahorrado</span><b class="num">${money(P(p.saved))}</b></div><div><span class="k">Restante</span><b class="num">${money(P(p.left))}</b></div></div>
        <div class="bar-soft" style="--t:${col}"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div>
        <div class="foot"><span>${ico("trendUp", "i-sm")} Meta: ${money(P(p.target))}</span><span>${Math.round(p.pct * 100)}%</span></div>
        ${p.perMonth ? `<p class="hint" style="margin:8px 0 0">Necesitas aportar ${money(P(p.perMonth))} al mes (${money(P(p.perWeek))} por semana).${p.eta ? ` A tu ritmo actual llegarías el ${fmtShort(p.eta)}.` : ""}</p>` : p.left <= 0 ? `<p class="hint pos" style="margin:8px 0 0">¡Meta alcanzada!</p>` : ""}
      </section>`;
    }
    html += `<button class="btn block" data-new-goal>${ico("plus")} Nueva meta de ahorro</button>`;
    return html;
  }
  function goalForm(id) {
    if (needDb()) return;
    const g = (S.goals || []).find((x) => x.id === id);
    openDyn(`<h2>${g ? "Editar meta" : "Nueva meta de ahorro"}</h2>
      ${field("Nombre", `<input id="gName" maxlength="60" required value="${esc(g?.name || "")}" placeholder="Ej. Fondo de emergencia">`)}
      <div class="row2">${field("Cantidad objetivo", `<input id="gTarget" inputmode="decimal" value="${g ? Number(g.target) : ""}" placeholder="0">`)}${field("Fecha objetivo", `<input id="gDate" type="date" value="${g?.target_date || ""}">`, "narrow")}</div>
      ${field("Cuenta donde guardas el dinero", `<select id="gAcc">${accOptions(g?.account_id, true, (a) => !isCredit(a))}</select>`)}
      ${field("Descripción", `<input id="gDesc" maxlength="500" value="${esc(g?.description || "")}" placeholder="Opcional">`)}
      <div class="field"><span>Ícono</span><div class="icon-grid" id="gIcons">${["piggy", "car", "home", "star", "gift", "school", "health", "lock", "target"].map((k) => `<button type="button" data-icon="${k}" class="${(g?.icon || "piggy") === k ? "active" : ""}">${ico(k)}</button>`).join("")}</div></div>
      ${!g ? field("Ya tengo ahorrado (opcional)", `<input id="gInitial" inputmode="decimal" placeholder="0">`) : ""}
      <div class="sheet-actions">${g ? `<button type="button" class="btn ghost danger" data-a="del">Eliminar</button>` : ""}<button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-a="save">Guardar</button></div>`, (root) => {
      let icon = g?.icon || "piggy";
      root.querySelector("#gIcons").addEventListener("click", (e) => { const b = e.target.closest("[data-icon]"); if (!b) return; icon = b.dataset.icon; root.querySelectorAll("#gIcons button").forEach((x) => x.classList.toggle("active", x === b)); });
      root.addEventListener("click", (e) => {
        const x = e.target.closest("[data-a]"); if (!x) return;
        if (x.dataset.a === "del") {
          if (!confirm(`¿Eliminar la meta "${g.name}" y sus aportaciones? El dinero sigue en tu cuenta.`)) return;
          mutate({ table: "savings_goals", op: "delete", id: g.id }); closeDyn(); return;
        }
        const name = val(root, "#gName"), target = parseAmount(val(root, "#gTarget"));
        if (!name || !(target > 0)) { toast("Escribe el nombre y la cantidad objetivo"); return; }
        const row = { id: g?.id || uuid(), user_id: S.user.id, name, target: round2(target), target_date: val(root, "#gDate") || null, account_id: val(root, "#gAcc") || null,
          description: val(root, "#gDesc") || null, icon, status: g?.status || "activa", created_at: g?.created_at || new Date().toISOString() };
        const ops = [{ table: "savings_goals", op: "upsert", row }];
        const init = parseAmount(val(root, "#gInitial"));
        if (!g && init > 0) ops.push({ table: "savings_contributions", op: "upsert", row: { id: uuid(), user_id: S.user.id, goal_id: row.id, amount: round2(init), date: today(), note: "Saldo inicial", created_at: new Date().toISOString() } });
        mutate(ops); closeDyn(); toast(g ? "Meta actualizada" : "Meta creada");
      });
    });
  }
  function goalDetail(id) {
    const g = (S.goals || []).find((x) => x.id === id); if (!g) return;
    const p = WCFin.goalPlan(g, S.contribs || [], today()), hist = (S.contribs || []).filter((c) => c.goal_id === id).sort((a, b) => b.date.localeCompare(a.date));
    openDyn(`<div class="c-head"><h2 style="margin:0">${esc(g.name)}</h2>${pill(`${Math.round(p.pct * 100)}%`, g.color || colorFor(g.id), "target")}</div>
      <div class="split2"><div><span class="k">Ahorrado</span><b class="num">${money(P(p.saved))}</b></div><div><span class="k">Restante</span><b class="num">${money(P(p.left))}</b></div></div>
      <h3>Aportación o retiro</h3>
      <div class="seg" id="cKind"><button type="button" data-k="in" class="active">Aportar</button><button type="button" data-k="out">Retirar</button></div>
      <div class="row2" style="margin-top:10px">${field("Cantidad", `<input id="cAmt" inputmode="decimal" placeholder="0">`)}${field("Fecha", `<input id="cDate" type="date" value="${today()}">`, "narrow")}</div>
      ${field("Nota", `<input id="cNote" maxlength="200" placeholder="Opcional">`)}
      <button type="button" class="btn primary block" data-a="add">Guardar</button>
      <h3>Historial</h3><ul class="list">${hist.map((c) => `<li class="item"><div class="main"><div class="t">${Number(c.amount) > 0 ? "Aportación" : "Retiro"}${c.note ? " · " + esc(c.note) : ""}</div><div class="s">${fmtShort(c.date)}</div></div><div class="amt num ${Number(c.amount) > 0 ? "pos" : "neg"}">${Number(c.amount) > 0 ? "+" : "−"}${money(Math.abs(Number(c.amount)))}</div><button type="button" class="btn sm ghost" data-del-c="${c.id}" aria-label="Eliminar">${ico("x")}</button></li>`).join("") || `<li class="hint">Sin movimientos.</li>`}</ul>
      <div class="sheet-actions"><button type="button" class="btn" data-a="edit">${ico("edit")} Editar meta</button>${p.left <= 0 && g.status === "activa" ? `<button type="button" class="btn" data-a="done">Marcar completada</button>` : ""}<button type="button" class="btn ghost" data-close>Cerrar</button></div>`, (root) => {
      let kind = "in";
      root.querySelector("#cKind").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; kind = b.dataset.k; root.querySelectorAll("#cKind button").forEach((x) => x.classList.toggle("active", x === b)); });
      root.addEventListener("click", (e) => {
        const d = e.target.closest("[data-del-c]");
        if (d) { if (confirm("¿Eliminar este registro?")) { mutate({ table: "savings_contributions", op: "delete", id: d.dataset.delC }); closeDyn(); goalDetail(id); } return; }
        const x = e.target.closest("[data-a]"); if (!x) return;
        if (x.dataset.a === "edit") { closeDyn(); goalForm(id); return; }
        if (x.dataset.a === "done") { mutate({ table: "savings_goals", op: "upsert", row: { ...stripLocal(g), status: "completada" } }); closeDyn(); return; }
        const amt = parseAmount(val(root, "#cAmt"));
        if (!(amt > 0)) { toast("Escribe una cantidad"); return; }
        if (kind === "out" && C(amt) > p.saved) { toast("No puedes retirar más de lo ahorrado"); return; }
        mutate({ table: "savings_contributions", op: "upsert", row: { id: uuid(), user_id: S.user.id, goal_id: id, amount: round2(kind === "out" ? -amt : amt), date: val(root, "#cDate") || today(), note: val(root, "#cNote") || null, created_at: new Date().toISOString() } });
        closeDyn(); toast(kind === "out" ? "Retiro registrado" : "Aportación registrada"); goalDetail(id);
      });
    });
  }

  // ---------- Deudas y préstamos ----------
  const debtBal = (d) => P(WCFin.debtBalanceC(d, S.debtPays || []));
  function viewDeudas() {
    const cs = creditSummary();
    const debts = (S.debts || []).filter((d) => d.status !== "cancelada");
    const debo = debts.filter((d) => d.direction === "debo"), meDeben = debts.filter((d) => d.direction === "me_deben");
    const totalDebo = P(C(cs.debt) + debo.reduce((s, d) => s + C(debtBal(d)), 0)), totalMe = sumP(meDeben, debtBal);
    let html = `<section class="card tone" style="--t:#ff8fa3"><div class="c-head"><span class="c-title">Deudas</span>${pill("hoy", "#ff8fa3", "clock")}</div>
      <div class="split2" style="margin-top:0;padding-top:0;border:0"><div><span class="k">Lo que debo</span><b class="num neg">${money(totalDebo)}</b></div><div><span class="k">Lo que me deben</span><b class="num pos">${money(totalMe)}</b></div></div></section>`;
    if (!dbReady()) html += `<section class="card"><p class="hint" style="margin:0">El registro de préstamos (debo / me deben) se activa con la actualización de la base de datos. Mientras tanto se muestran tus tarjetas y préstamos en cuotas.</p></section>`;
    const debtRow = (d) => { const b = debtBal(d), pct = Number(d.principal) ? 1 - b / Number(d.principal) : 1, col = d.direction === "debo" ? "#ff8fa3" : "#3ddc97";
      return `<li class="item tap" data-debt="${d.id}">${tile(d.direction === "debo" ? "handshake" : "cash", col)}<div class="main"><div class="t">${esc(d.name)}${d.counterparty ? ` <span class="amt-inline">${esc(d.counterparty)}</span>` : ""}</div>
        <div class="s">${d.status === "pagada" ? `<span class="badge good">Pagada</span>` : d.due_date ? `Vence ${fmtShort(d.due_date)}` : "Sin vencimiento"} · ${Math.round(pct * 100)}% pagado</div>
        <div class="bar-soft" style="--t:${col};margin-top:6px"><i style="width:${(pct * 100).toFixed(1)}%"></i></div></div><div class="amt num">${money(b)}</div></li>`; };
    html += `<section class="card"><div class="c-head"><span class="c-title">Lo que debo</span></div><ul class="list">
      ${cs.cards.map((c) => `<li class="item tap" data-acc-detail="${c.a.id}">${tile(iconKey(c.a.icon, c.a.name, "card"), c.a.color || colorFor(c.a.id))}<div class="main"><div class="t">${esc(c.a.name)}</div><div class="s">Tarjeta${c.due ? ` · pagar antes del ${fmtShort(c.due)}` : ""}</div></div><div class="amt num">${money(c.used)}</div></li>`).join("")}
      ${cs.loans.map((x) => `<li class="item tap" data-pay-actions="${x.f.id}">${tile("car", colorFor(x.f.id))}<div class="main"><div class="t">${esc(x.f.name)}</div><div class="s">${x.d.paid}/${x.d.total} cuotas</div></div><div class="amt num">${money(x.d.left)}</div></li>`).join("")}
      ${debo.map(debtRow).join("")}</ul>${!cs.cards.length && !cs.loans.length && !debo.length ? `<p class="hint">Sin deudas registradas.</p>` : ""}</section>`;
    html += `<section class="card"><div class="c-head"><span class="c-title">Lo que me deben</span></div><ul class="list">${meDeben.map(debtRow).join("") || `<li class="hint">Nadie te debe dinero.</li>`}</ul></section>`;
    if (dbReady()) html += `<div class="row2"><button class="btn" data-new-debt="debo">${ico("plus")} Debo</button><button class="btn" data-new-debt="me_deben">${ico("plus")} Me deben</button></div>`;
    return html;
  }
  function debtForm(id, direction) {
    if (needDb()) return;
    const d = (S.debts || []).find((x) => x.id === id), dir = d?.direction || direction || "debo";
    openDyn(`<h2>${d ? "Editar" : dir === "debo" ? "Nueva deuda (yo debo)" : "Préstamo a terceros (me deben)"}</h2>
      ${field("Nombre", `<input id="dName" maxlength="60" value="${esc(d?.name || "")}" placeholder="${dir === "debo" ? "Ej. Préstamo personal" : "Ej. Préstamo a Juan"}">`)}
      <div class="row2">${field(dir === "debo" ? "Acreedor" : "Persona", `<input id="dWho" maxlength="60" value="${esc(d?.counterparty || "")}" placeholder="Opcional">`)}
        ${field("Tipo", `<select id="dKind">${[["prestamo", "Préstamo"], ["credito", "Crédito"], ["particular", "Particular"], ["otro", "Otro"]].map(([k, l]) => `<option value="${k}" ${d?.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select>`, "narrow")}</div>
      <div class="row2">${field("Importe inicial", `<input id="dAmt" inputmode="decimal" value="${d ? Number(d.principal) : ""}" placeholder="0">`)}${field("Interés anual %", `<input id="dRate" inputmode="decimal" value="${d?.interest_rate ?? ""}" placeholder="Opcional">`, "narrow")}</div>
      <div class="row2">${field("Fecha inicial", `<input id="dStart" type="date" value="${d?.start_date || today()}">`)}${field("Vencimiento", `<input id="dDue" type="date" value="${d?.due_date || ""}">`)}</div>
      ${field(dir === "debo" ? "¿En qué cuenta entró el dinero? (opcional)" : "¿De qué cuenta salió? (opcional)", `<select id="dAcc">${accOptions(d?.account_id)}</select>`)}
      <p class="hint">Si eliges una cuenta, su saldo se ajusta. Déjalo vacío para registrar una deuda que ya existía.</p>
      ${field("Notas", `<input id="dNotes" maxlength="1000" value="${esc(d?.notes || "")}" placeholder="Opcional">`)}
      <div class="sheet-actions">${d ? `<button type="button" class="btn ghost danger" data-a="del">Eliminar</button>` : ""}<button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-a="save">Guardar</button></div>`, (root) => {
      root.addEventListener("click", (e) => {
        const x = e.target.closest("[data-a]"); if (!x) return;
        if (x.dataset.a === "del") { if (!confirm(`¿Eliminar "${d.name}" y sus abonos?`)) return; mutate({ table: "debts", op: "delete", id: d.id }); closeDyn(); return; }
        const name = val(root, "#dName"), amt = parseAmount(val(root, "#dAmt"));
        if (!name || !(amt > 0)) { toast("Escribe el nombre y el importe"); return; }
        const rate = parseAmount(val(root, "#dRate"));
        mutate({ table: "debts", op: "upsert", row: { id: d?.id || uuid(), user_id: S.user.id, name, direction: dir, kind: val(root, "#dKind"), counterparty: val(root, "#dWho") || null,
          principal: round2(amt), start_date: val(root, "#dStart") || today(), due_date: val(root, "#dDue") || null, interest_rate: rate >= 0 ? rate : null,
          account_id: val(root, "#dAcc") || null, notes: val(root, "#dNotes") || null, status: d?.status || "activa", created_at: d?.created_at || new Date().toISOString() } });
        closeDyn(); toast(d ? "Actualizado" : "Registrado");
      });
    });
  }
  function debtDetail(id) {
    const d = (S.debts || []).find((x) => x.id === id); if (!d) return;
    const b = debtBal(d), pays = (S.debtPays || []).filter((p) => p.debt_id === id).sort((x, y) => y.date.localeCompare(x.date));
    const paidInt = sumP(pays, (p) => p.interest), debo = d.direction === "debo";
    openDyn(`<div class="c-head"><h2 style="margin:0">${esc(d.name)}</h2>${pill(debo ? "Yo debo" : "Me deben", debo ? "#ff8fa3" : "#3ddc97", "handshake")}</div>
      <div class="split3"><div><span class="k">Inicial</span><b class="num">${money(Number(d.principal))}</b></div><div><span class="k">Pendiente</span><b class="num ${debo ? "neg" : "pos"}">${money(b)}</b></div><div><span class="k">Intereses</span><b class="num">${money(paidInt)}</b></div></div>
      ${d.status === "activa" ? `<h3>${debo ? "Registrar pago / abono" : "Registrar abono recibido"}</h3>
        <div class="row2">${field("Importe", `<input id="pAmt" inputmode="decimal" placeholder="0">`)}${field("De eso, intereses", `<input id="pInt" inputmode="decimal" placeholder="0">`, "narrow")}</div>
        <div class="row2">${field("Fecha", `<input id="pDate" type="date" value="${today()}">`)}${field(debo ? "Pagado desde" : "Recibido en", `<select id="pAcc">${accOptions(d.account_id)}</select>`)}</div>
        <button type="button" class="btn primary block" data-a="pay">Guardar abono</button>` : ""}
      <h3>Historial</h3><ul class="list">${pays.map((p) => `<li class="item"><div class="main"><div class="t">${money(Number(p.amount))}${Number(p.interest) ? ` <span class="amt-inline">(${money(Number(p.interest))} interés)</span>` : ""}</div><div class="s">${fmtShort(p.date)}${p.account_id ? " · " + esc(acc(p.account_id)?.name || "") : ""}</div></div><button type="button" class="btn sm ghost" data-del-p="${p.id}" aria-label="Eliminar">${ico("x")}</button></li>`).join("") || `<li class="hint">Sin abonos.</li>`}</ul>
      <div class="sheet-actions"><button type="button" class="btn" data-a="edit">${ico("edit")} Editar</button>${d.status === "activa" ? `<button type="button" class="btn" data-a="close">Marcar ${debo ? "pagada" : "cobrada"}</button>` : ""}<button type="button" class="btn ghost" data-close>Cerrar</button></div>`, (root) => {
      root.addEventListener("click", (e) => {
        const del = e.target.closest("[data-del-p]");
        if (del) { if (confirm("¿Eliminar este abono?")) { mutate({ table: "debt_payments", op: "delete", id: del.dataset.delP }); closeDyn(); debtDetail(id); } return; }
        const x = e.target.closest("[data-a]"); if (!x) return;
        if (x.dataset.a === "edit") { closeDyn(); debtForm(id); return; }
        if (x.dataset.a === "close") { mutate({ table: "debts", op: "upsert", row: { ...stripLocal(d), status: "pagada" } }); closeDyn(); return; }
        const amt = parseAmount(val(root, "#pAmt")), intr = parseAmount(val(root, "#pInt")) || 0;
        if (!(amt > 0) || intr < 0 || intr > amt) { toast("Revisa el importe y los intereses"); return; }
        if (C(amt) - C(intr) > C(b)) { toast(`El abono a capital supera lo pendiente (${money(b)})`); return; }
        const row = { id: uuid(), user_id: S.user.id, debt_id: id, amount: round2(amt), interest: round2(intr), date: val(root, "#pDate") || today(), account_id: val(root, "#pAcc") || null, created_at: new Date().toISOString() };
        const ops = [{ table: "debt_payments", op: "upsert", row }];
        if (C(b) - (C(amt) - C(intr)) <= 0) ops.push({ table: "debts", op: "upsert", row: { ...stripLocal(d), status: "pagada" } });   // se liquida en el mismo lote
        mutate(ops); closeDyn(); toast("Abono registrado"); debtDetail(id);
      });
    });
  }

  // ---------- Suscripciones ----------
  function viewSuscripciones() {
    const all = S.fixed.filter((f) => f.kind === "suscripcion");
    const active = all.filter((f) => f.active && !f.paused), paused = all.filter((f) => f.active && f.paused), cancelled = all.filter((f) => !f.active);
    const mc = active.reduce((s, f) => s + WCFin.perMonthC(f), 0);
    const row = (f) => { const n = nextPending(f);
      return `<li class="item tap" data-pay-actions="${f.id}">${tile(iconKey(cat(f.category_id)?.icon, f.name, "tv"), colorFor(f.id))}<div class="main"><div class="t">${esc(f.name)}</div>
        <div class="s">${f.paused ? `<span class="badge">Pausada</span>` : !f.active ? `<span class="badge">Cancelada</span>` : n ? `Cobro ${fmtShort(n.due)}` : scheduleLabel(f)}${f.account_id ? " · " + esc(acc(f.account_id)?.name || "") : ""}</div></div>
        <div class="amt num">${money(perMonth(f))}<small class="orig">${money(perMonth(f) * 12)}/año</small></div></li>`; };
    let html = `<section class="card tone" style="--t:#b69cff"><div class="c-head"><span class="c-title">Suscripciones</span>${pill(`${active.length} activas`, "#b69cff", "tv")}</div>
      <div class="split2" style="margin-top:0;padding-top:0;border:0"><div><span class="k">Gasto mensual</span><b class="num">${money(P(mc))}</b></div><div><span class="k">Gasto anual estimado</span><b class="num">${money(P(mc * 12))}</b></div></div></section>`;
    html += `<section class="card"><ul class="list">${active.map(row).join("") || `<li class="hint">Sin suscripciones activas.</li>`}</ul></section>`;
    if (paused.length) html += `<section class="card"><div class="c-head"><span class="c-title">En pausa</span></div><ul class="list">${paused.map(row).join("")}</ul></section>`;
    if (cancelled.length) html += `<section class="card"><div class="c-head"><span class="c-title">Canceladas</span></div><ul class="list">${cancelled.map(row).join("")}</ul></section>`;
    html += `<button class="btn block" data-new-sub>${ico("plus")} Agregar suscripción</button>`;
    return html;
  }

  const dbPending = (name) => `<section class="card"><div class="empty"><div class="e">${ico("sync")}</div><b>${name}</b><br>Este módulo se activa en cuanto se aplique la actualización de la base de datos (migración 0005).</div></section>`;

  // ---------- Búsqueda global ----------
  function openSearch() {
    openDyn(`<h2>Buscar</h2>
      <input id="qText" class="inp search-inp" placeholder="Texto, importe, etiqueta…" autocomplete="off">
      <div class="filters" id="qType">${[["all", "Todo"], ["mov", "Movimientos"], ["acc", "Cuentas"], ["pay", "Pagos"], ["cat", "Categorías"], ["debt", "Deudas"], ["sub", "Suscripciones"]].map(([k, l], i) => `<button type="button" class="chip ${i ? "" : "active"}" data-k="${k}">${l}</button>`).join("")}</div>
      <div class="row2"><input type="date" id="qFrom" class="inp" title="Desde"><input type="date" id="qTo" class="inp" title="Hasta"></div>
      <div class="row2"><input id="qMin" class="inp" inputmode="decimal" placeholder="Importe mín."><input id="qMax" class="inp" inputmode="decimal" placeholder="Importe máx."></div>
      <ul class="list" id="qRes"></ul>`, (root) => {
      let type = "all";
      const norm = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const run = () => {
        const q = norm(val(root, "#qText")), from = val(root, "#qFrom"), to = val(root, "#qTo");
        const mn = parseAmount(val(root, "#qMin")), mx = parseAmount(val(root, "#qMax"));
        const amtOk = (v) => (!(mn > 0) || Number(v) >= mn) && (!(mx > 0) || Number(v) <= mx);
        const has = (...xs) => !q || xs.some((x) => norm(x).includes(q));
        const out = [];
        if (type === "all" || type === "mov") for (const m of S.movements) {
          if (out.length > 80) break;
          if (from && m.date < from) continue; if (to && m.date > to) continue; if (!amtOk(m.amount)) continue;
          const c = cat(m.category_id), a = acc(m.account_id);
          if (!has(m.note, m.notes, (m.tags || []).join(" "), c?.name, a?.name, String(m.amount))) continue;
          out.push(`<li class="item tap" data-r="mov" data-id="${m.id}">${tile(m.type === "transferencia" ? "swap" : iconKey(c?.icon, c?.name), m.type === "transferencia" ? "#a1a1a8" : colorFor(m.category_id))}<div class="main"><div class="t">${esc(m.note || c?.name || "Movimiento")}</div><div class="s">${fmtShort(m.date)} · ${esc(a?.name || "")}${(m.tags || []).length ? " · #" + m.tags.map(esc).join(" #") : ""}</div></div><div class="amt num ${m.type === "ingreso" ? "pos" : ""}">${m.type === "ingreso" ? "+" : m.type === "gasto" ? "−" : ""}${money(Number(m.amount))}</div></li>`);
        }
        if (type === "all" || type === "acc") for (const a of S.accounts) if (has(a.name, a.institution)) out.push(`<li class="item tap" data-r="acc" data-id="${a.id}">${tile(iconKey(a.icon, a.name, "wallet"), a.color || colorFor(a.id), "sm")}<div class="main"><div class="t">${esc(a.name)}</div><div class="s">Cuenta${a.archived ? " archivada" : ""}</div></div><div class="amt num">${money(accountBalance(a))}</div></li>`);
        if (type === "all" || type === "pay" || type === "sub") for (const f of S.fixed) {
          if (isBudget(f) || (type === "sub" && f.kind !== "suscripcion") || (type === "pay" && f.kind === "suscripcion")) continue;
          if (has(f.name, f.notes) && amtOk(f.amount)) out.push(`<li class="item tap" data-r="pay" data-id="${f.id}">${tile(f.kind === "suscripcion" ? "tv" : "calendar", colorFor(f.id), "sm")}<div class="main"><div class="t">${esc(f.name)}</div><div class="s">${f.kind === "suscripcion" ? "Suscripción" : "Pago"} · ${scheduleLabel(f)}${f.active ? "" : " · cancelado"}</div></div><div class="amt num">${money(Number(f.amount))}</div></li>`);
        }
        if (type === "all" || type === "cat") for (const c of S.categories) if (q && has(c.name)) out.push(`<li class="item tap" data-r="cat" data-id="${c.id}">${tile(iconKey(c.icon, c.name), colorFor(c.id), "sm")}<div class="main"><div class="t">${esc(c.name)}</div><div class="s">Categoría de ${c.kind}</div></div></li>`);
        if (type === "all" || type === "debt") for (const d of S.debts || []) if (has(d.name, d.counterparty, d.notes)) out.push(`<li class="item tap" data-r="debt" data-id="${d.id}">${tile("handshake", "#ff8fa3", "sm")}<div class="main"><div class="t">${esc(d.name)}</div><div class="s">${d.direction === "debo" ? "Debo" : "Me deben"}</div></div><div class="amt num">${money(debtBal(d))}</div></li>`);
        root.querySelector("#qRes").innerHTML = out.join("") || `<li class="hint center">Sin resultados.</li>`;
      };
      root.querySelector("#qType").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; type = b.dataset.k; root.querySelectorAll("#qType .chip").forEach((x) => x.classList.toggle("active", x === b)); run(); });
      root.querySelectorAll("input").forEach((i) => i.addEventListener("input", run));
      root.querySelector("#qRes").addEventListener("click", (e) => {
        const r = e.target.closest("[data-r]"); if (!r) return;
        const id = r.dataset.id; closeDyn();
        ({ mov: () => openEntry({ id }), acc: () => accountDetail(id), pay: () => paymentActions(id), cat: () => { S.movFilter = id; goTab("movimientos"); }, debt: () => debtDetail(id) })[r.dataset.r]();
      });
      run(); setTimeout(() => root.querySelector("#qText").focus(), 80);
    });
  }

  // ---------- Estado de la sincronización ----------
  function renderSyncBox() {
    const st = syncState();
    $("#syncBox").innerHTML = `<div class="sync-line"><span class="sync-dot ${!navigator.onLine ? "off" : st.err ? "err" : st.total ? "pend" : "ok"}"></span>
      ${!navigator.onLine ? "Sin conexión" : st.err ? `${st.err} con error` : st.total ? `${st.total} pendiente(s)` : "Todo sincronizado"}${dbReady() ? "" : " · base de datos por actualizar"}</div>
      ${OUTBOX.filter((e) => e.status === "error").map((e) => `<div class="sync-err"><b>${e.ops.map((o) => o.table).join(", ")}</b><small>${esc(e.error || "")}</small>
        <div class="row2"><button type="button" class="btn sm" data-retry="${e.id}">Reintentar</button><button type="button" class="btn sm ghost danger" data-discard="${e.id}">Descartar</button></div></div>`).join("")}
      <button type="button" class="btn block" id="syncNow">${ico("sync")} Sincronizar ahora</button>`;
  }
  $("#syncBox").addEventListener("click", async (e) => {
    if (e.target.closest("#syncNow")) { await flush(true); await refresh(true); renderSyncBox(); toast(syncState().total ? "Quedan cambios pendientes" : "Sincronizado"); return; }
    const r = e.target.closest("[data-retry]"); if (r) { const x = OUTBOX.find((y) => y.id === r.dataset.retry); if (x) x.status = "pending"; await flush(); renderSyncBox(); return; }
    const d = e.target.closest("[data-discard]");
    if (d && confirm("¿Descartar este cambio? No se guardará en la nube.")) { OUTBOX = OUTBOX.filter((y) => y.id !== d.dataset.discard); persistOutbox(); updateOffline(); renderSyncBox(); await refresh(true); }
  });
  $("#offlineBar").addEventListener("click", () => { openSettings(); setTimeout(() => $("#syncBox").scrollIntoView({ block: "center" }), 250); });

  // ---------- Notificaciones locales ----------
  // Avisos con la app abierta (o al abrirla). En iPhone, los avisos con la app cerrada requieren la automatización de Atajos.
  async function notifyDue() {
    if (!("Notification" in window) || Notification.permission !== "granted" || !S.user) return;
    const key = `wc_notified_${today()}`; if (ls.get(key, false)) return;
    const prefs = S.settings.notify || {}, lines = [];
    for (const a of buildAlerts()) {
      if (a.icon === "bell" && prefs.pagos === false) continue;
      if (a.icon === "target" && prefs.presupuestos === false) continue;
      if (a.icon === "card" && prefs.tarjetas === false) continue;
      lines.push(a.txt.replace(/<[^>]+>/g, ""));
    }
    for (const g of (S.goals || []).filter((x) => x.status === "activa" && x.target_date)) {
      const d = daysBetween(today(), g.target_date); if (prefs.ahorros !== false && d >= 0 && d <= 7) lines.push(`Meta "${g.name}": faltan ${d} días`);
    }
    if (!lines.length) return;
    ls.set(key, true);
    const reg = await navigator.serviceWorker?.getRegistration?.();
    const opts = { body: lines.slice(0, 4).join("\n"), icon: "icons/icon-192.png", tag: "withcash-diario" };
    try { reg ? reg.showNotification(S.settings.app_name || "WithCash", opts) : new Notification(S.settings.app_name || "WithCash", opts); } catch { /* no disponible */ }
  }

  // ---------- Privacidad: PIN y Face ID (bloqueo en este dispositivo) ----------
  // El PIN se guarda solo como hash en este dispositivo. Face ID usa una llave de acceso (WebAuthn) del propio iPhone.
  const LOCK_KEY = "wc_lock";
  const lockCfg = () => ls.get(LOCK_KEY, {});
  const saveLock = (c) => ls.set(LOCK_KEY, c);
  const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = (s2) => Uint8Array.from(atob(s2.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const pinHash = async (pin, salt) => sha256(`${salt}:${pin}`);
  let pinBuf = "", pinMode = "unlock", pinFirst = "", lockedAt = 0;
  const bioAvailable = async () => !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false));

  function showLock(mode = "unlock") {
    pinMode = mode; pinBuf = ""; pinFirst = "";
    $("#lockMsg").textContent = mode === "set" ? "Crea un PIN de 4 dígitos" : "Ingresa tu PIN";
    $("#lockBioBtn").style.visibility = mode === "unlock" && lockCfg().credId ? "visible" : "hidden";
    $("#lockForgot").hidden = mode !== "unlock";
    paintDots(); $("#lockScreen").hidden = false;
    if (mode === "unlock" && lockCfg().credId) setTimeout(bioUnlock, 250);
  }
  const hideLock = () => { $("#lockScreen").hidden = true; pinBuf = ""; };
  const paintDots = (err) => { $$("#pinDots i").forEach((d, i) => d.classList.toggle("on", i < pinBuf.length)); $("#pinDots").classList.toggle("err", !!err); };
  async function onPinComplete() {
    const c = lockCfg();
    if (pinMode === "unlock") {
      if (await pinHash(pinBuf, c.salt) === c.hash) { hideLock(); return; }
      pinBuf = ""; paintDots(true); $("#lockMsg").textContent = "PIN incorrecto"; if (navigator.vibrate) navigator.vibrate([30, 40, 30]); return;
    }
    if (!pinFirst) { pinFirst = pinBuf; pinBuf = ""; paintDots(); $("#lockMsg").textContent = "Confírmalo"; return; }
    if (pinFirst !== pinBuf) { pinFirst = ""; pinBuf = ""; paintDots(true); $("#lockMsg").textContent = "No coinciden. Crea tu PIN otra vez"; return; }
    const salt = b64u(crypto.getRandomValues(new Uint8Array(12)));
    saveLock({ ...c, on: true, salt, hash: await pinHash(pinBuf, salt) });
    hideLock(); toast("PIN activado"); syncLockSettings();
  }
  $("#keypad").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    const k = b.dataset.k;
    if (k === "del") pinBuf = pinBuf.slice(0, -1);
    else if (k === "bio") { bioUnlock(); return; }
    else if (pinBuf.length < 4) pinBuf += k;
    paintDots();
    if (pinBuf.length === 4) setTimeout(onPinComplete, 120);
  });
  $("#lockForgot").addEventListener("click", async () => {
    if (!confirm("Para quitar el PIN se cerrará tu sesión. Después entras con tu correo y contraseña.")) return;
    // La cola de cambios sin enviar NO se borra: se envía cuando vuelvas a entrar con la misma cuenta
    try { await flush(); } catch { /* sin conexión: se queda en la cola */ }
    ls.del(LOCK_KEY); await WCStore.del(cacheKey());
    try { await sb.auth.signOut({ scope: "local" }); } catch { /* */ } location.reload();
  });
  async function bioRegister() {
    try {
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "WithCash", id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: S.user.email || "withcash", displayName: S.user.email || "WithCash" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" }, timeout: 60000,
      } });
      saveLock({ ...lockCfg(), credId: b64u(cred.rawId) }); toast("Face ID activado"); return true;
    } catch { toast("No se pudo activar Face ID"); return false; }
  }
  async function bioUnlock() {
    const c = lockCfg(); if (!c.credId) return;
    try {
      await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: unb64u(c.credId) }], userVerification: "required", timeout: 60000 } });
      hideLock();
    } catch { /* cancelado: queda el PIN */ }
  }
  async function syncLockSettings() {
    const c = lockCfg();
    $("#lockPinOn").checked = !!c.on; $("#lockChange").hidden = !c.on;
    $("#lockBioWrap").hidden = !c.on || !(await bioAvailable());
    $("#lockBioOn").checked = !!c.credId;
  }
  $("#lockPinOn").addEventListener("change", (e) => {
    if (e.target.checked) { closeSheet($("#settingsSheet")); showLock("set"); }
    else { if (!confirm("¿Quitar el bloqueo con PIN?")) { e.target.checked = true; return; } saveLock({}); syncLockSettings(); toast("Bloqueo desactivado"); }
  });
  $("#lockChange").addEventListener("click", () => { closeSheet($("#settingsSheet")); showLock("set"); });
  $("#lockBioOn").addEventListener("change", async (e) => {
    if (e.target.checked) { if (!(await bioRegister())) e.target.checked = false; }
    else { const c = lockCfg(); delete c.credId; saveLock(c); }
  });
  const lockIfNeeded = () => { if (S.user && lockCfg().on && $("#lockScreen").hidden) showLock("unlock"); };
  const lockMs = () => { const m = Number(S.settings.auto_lock_minutes ?? 1); return m > 0 ? m * 60000 : Infinity; };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) lockedAt = Date.now();
    else if (lockedAt && Date.now() - lockedAt > lockMs()) lockIfNeeded();
  });
  // Bloqueo por inactividad con la app abierta
  let lastActivity = Date.now();
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));
  setInterval(() => { if (!document.hidden && Date.now() - lastActivity > lockMs()) { lastActivity = Date.now(); lockIfNeeded(); } }, 15000);

  // ---------- Eventos globales ----------
  // Navegación entre secciones con historial (para el gesto de regresar)
  const tabHistory = [];
  function goTab(tab, remember = true) {
    if (tab === S.tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (remember) { tabHistory.push(S.tab); if (tabHistory.length > 20) tabHistory.shift(); }
    S.tab = tab; render(); window.scrollTo(0, 0);
  }
  // Regresar: cierra la hoja abierta; si no hay, vuelve a la sección anterior (o a Inicio)
  function goBack() {
    const open = $$("dialog[open]");
    if (open.length) { open[open.length - 1].close(); return true; }
    if (tabHistory.length) { goTab(tabHistory.pop(), false); return true; }
    if (S.tab !== "inicio") { goTab("inicio", false); return true; }
    return false;
  }
  $(".tabbar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    if (b.dataset.tab === "config") openSettings();
    else if (b.dataset.tab === "buscar") openSearch();
    else goTab(b.dataset.tab);
  });
  // El menú se retrae (más compacto) al bajar y se expande al subir
  (() => {
    let lastY = scrollY, ticking = false;
    addEventListener("scroll", () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = scrollY, d = y - lastY;
        if (Math.abs(d) > 6) { document.body.classList.toggle("dock-mini", d > 0 && y > 80); lastY = y; }
        ticking = false;
      });
    }, { passive: true });
  })();

  // Gesto: deslizar desde el borde izquierdo hacia la derecha = regresar
  (() => {
    const hint = $("#backHint"), EDGE = 28, TRIGGER = 80;
    let sx = 0, sy = 0, dx = 0, active = false, decided = false;
    const paint = () => {
      const p = Math.min(dx, 120);
      hint.style.transform = `translateX(${p * 0.75 - 60}px) scale(${0.6 + Math.min(p / TRIGGER, 1) * 0.4})`;
      hint.style.opacity = String(Math.min(p / 40, 1));
      hint.classList.toggle("ready", dx >= TRIGGER);
    };
    const reset = () => {
      active = false; dx = 0;
      hint.style.transition = "transform .2s ease, opacity .2s ease"; paint();
      setTimeout(() => (hint.style.transition = ""), 220);
    };
    document.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1 || !S.user) return;
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      sx = t.clientX; sy = t.clientY; dx = 0; active = true; decided = false;
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!active) return;
      const t = e.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
      if (!decided && (Math.abs(mx) > 10 || Math.abs(my) > 10)) {
        decided = true;
        if (Math.abs(my) > Math.abs(mx) || mx < 0) { active = false; return; }   // era desplazamiento vertical
      }
      dx = Math.max(0, mx); paint();
    }, { passive: true });
    document.addEventListener("touchend", () => {
      if (!active) return;
      const go = dx >= TRIGGER;
      reset();
      if (go) { if (navigator.vibrate) navigator.vibrate(8); goBack(); }
    });
    document.addEventListener("touchcancel", () => active && reset());
  })();

  // Sin zoom: pellizco ni doble toque
  ["gesturestart", "gesturechange", "gestureend"].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // (el doble toque ya no hace zoom gracias a touch-action en el CSS)
  const VIEW_ACTIONS = "[data-mov],[data-mov-open],[data-pay],[data-goto],[data-new-fixed],[data-edit-fixed],[data-filter],[data-catgo],[data-credit],[data-export],[data-acc-detail],[data-new-acc],[data-pay-actions],[data-new-budget],[data-new-goal],[data-goal],[data-new-debt],[data-debt],[data-new-sub],[data-period],[data-movacc],[data-clear-acc],[data-new-card],[data-cards-from-pays],[data-plan],[data-plan-new],[data-card-go],[data-budget-go]";
  $("#view").addEventListener("click", (e) => { const t = e.target.closest(VIEW_ACTIONS); if (t) viewAction(t); });
  function viewAction(t) {
    if (t.dataset.pay) payFixed(t.dataset.pay, t.dataset.month);
    else if (t.dataset.movOpen) openEntry({ id: t.dataset.movOpen });
    else if (t.dataset.mov) openEntry({ id: t.dataset.mov });
    else if (t.dataset.goto) goTab(t.dataset.goto);
    else if (t.dataset.export) $({ pdf: "#exportPdf", xlsx: "#exportXlsx", csv: "#exportCsv" }[t.dataset.export]).click();
    else if (t.dataset.accDetail) accountDetail(t.dataset.accDetail);
    else if (t.hasAttribute("data-new-acc")) openItem("accounts", null);
    else if (t.hasAttribute("data-new-card")) openItem("accounts", null, null, "credito");
    else if (t.dataset.cardGo || t.dataset.budgetGo) {         // desde una alerta: abre la sección y resalta el elemento
      const id = t.dataset.cardGo || t.dataset.budgetGo, sel = t.dataset.cardGo ? `[data-credit="${id}"]` : `[data-edit-fixed="${id}"]`;
      goTab(t.dataset.cardGo ? "tarjetas" : "presupuestos");
      setTimeout(() => { const el = $(`#view ${sel}`); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600); } }, 80);
    }
    else if (t.dataset.plan) planForm(null, t.dataset.plan);
    else if (t.dataset.planNew) planForm(t.dataset.planNew);
    else if (t.hasAttribute("data-cards-from-pays")) cardsFromPayments();
    else if (t.dataset.payActions) paymentActions(t.dataset.payActions);
    else if (t.hasAttribute("data-new-budget")) openFixed(null, { kind: "presupuesto", frequency: "mensual" });
    else if (t.hasAttribute("data-new-sub")) openFixed(null, { kind: "suscripcion" });
    else if (t.hasAttribute("data-new-goal")) goalForm();
    else if (t.dataset.goal) goalDetail(t.dataset.goal);
    else if (t.dataset.newDebt) debtForm(null, t.dataset.newDebt);
    else if (t.dataset.debt) debtDetail(t.dataset.debt);
    else if (t.hasAttribute("data-clear-acc")) { S.movAcc = null; render(); }
    else if (t.dataset.period) { S.period = t.dataset.period; render(); }
    else if (t.hasAttribute("data-credit")) { const a = acc(t.dataset.credit); if (a) openItem("accounts", a); else openSettings(); }
    else if (t.dataset.catgo) { S.movFilter = t.dataset.catgo === "-" ? "todos" : t.dataset.catgo; goTab("movimientos"); }
    else if (t.hasAttribute("data-new-fixed")) openFixed();
    else if (t.dataset.editFixed) openFixed(t.dataset.editFixed);
    else if (t.dataset.filter) { S.movFilter = t.dataset.filter; render(); }
  }
  $("#fab").addEventListener("click", () => openEntry());
  $("#prevMonth").addEventListener("click", () => { S.ym = addMonths(S.ym, -1); S.movFilter = "todos"; render(); });
  $("#nextMonth").addEventListener("click", () => { S.ym = addMonths(S.ym, 1); S.movFilter = "todos"; render(); });
  $("#monthTitle").addEventListener("click", () => { S.ym = ymOf(today()); render(); });
  $("#openSettings").addEventListener("click", openSettings);
  $("#openSearch")?.addEventListener("click", openSearch);
  $("#openNotif").addEventListener("click", openNotifCenter);
  // Búsqueda dentro de Movimientos: se aplica al escribir (sin perder el foco)
  let mqTimer = 0;
  $("#view").addEventListener("input", (e) => {
    if (e.target.dataset.mfilter !== "q") return;
    clearTimeout(mqTimer);
    mqTimer = setTimeout(() => { S.mf_q = e.target.value; const pos = e.target.selectionStart; render(); const i = $('[data-mfilter="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 250);
  });
  $("#view").addEventListener("click", (e) => { if (e.target.closest("[data-mreset]")) { ["q", "from", "to", "min", "max", "all"].forEach((k) => delete S["mf_" + k]); S.movAcc = null; render(); } });
  $("#view").addEventListener("change", (e) => {
    if (e.target.id === "pFrom" || e.target.id === "pTo") { S.periodFrom = $("#pFrom").value; S.periodTo = $("#pTo").value; render(); }
    if (e.target.dataset.mfilter && e.target.dataset.mfilter !== "q") {
      const k = e.target.dataset.mfilter;
      if (k === "acc") S.movAcc = e.target.value || null; else S["mf_" + k] = e.target.value;
      render();
    }
  });
  window.addEventListener("online", () => { flush().then(refresh); updateOffline(); });
  window.addEventListener("offline", updateOffline);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.user) refresh(); });

  function updateBadge() {
    paintBell();
    if (!("setAppBadge" in navigator)) return;
    const n = S.user ? unseen().length : 0;                         // avisos sin ver del centro de notificaciones
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }

  let lastRefresh = 0;
  let refreshTimer = 0, refreshDelay = 4000;
  async function refresh(force) {
    if (!sb || !S.user) return;
    if (!force && Date.now() - lastRefresh < 15000) return;
    lastRefresh = Date.now();
    try { await loadRemote(); render(); notifyDue(); refreshDelay = 4000; }
    catch (e) {
      if (!isNetErr(e)) console.error(e);
      // Sin conexión al abrir: se vuelve a intentar sola (4 s → 1 min) para descargar y enviar lo pendiente
      clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refresh(true), refreshDelay); refreshDelay = Math.min(60000, refreshDelay * 2);
    }
    updateOffline();
  }

  // ---------- Acceso ----------
  let signup = false;
  $("#authToggle").addEventListener("click", () => {
    signup = !signup;
    $("#authSubmit").textContent = signup ? "Crear cuenta" : "Entrar";
    $("#authToggle").textContent = signup ? "Ya tengo cuenta" : "¿Primera vez? Crear cuenta";
    $("#authPass").autocomplete = signup ? "new-password" : "current-password";
    $("#authMsg").textContent = "";
  });
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail").value.trim(), password = $("#authPass").value;
    const msg = $("#authMsg");
    $("#authSubmit").disabled = true; msg.textContent = "…";
    try {
      const redirect = location.origin + location.pathname;
      const { data, error } = signup
        ? await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
        : await sb.auth.signInWithPassword({ email, password });
      if (error) {
        msg.textContent = /invalid login/i.test(error.message) ? "Correo o contraseña incorrectos."
          : /not confirmed/i.test(error.message) ? "Confirma tu correo: revisa tu bandeja de entrada." : error.message;
      } else if (signup && !data.session) {
        msg.textContent = "Te enviamos un correo para confirmar tu cuenta. Después vuelve aquí y entra.";
      }
    } finally { $("#authSubmit").disabled = false; }
  });
  $("#authForgot").addEventListener("click", async () => {
    const email = $("#authEmail").value.trim(), msg = $("#authMsg");
    if (!$("#authEmail").checkValidity() || !email) { msg.textContent = "Escribe tu correo arriba y vuelve a tocar aquí."; $("#authEmail").focus(); return; }
    $("#authForgot").disabled = true; msg.textContent = "…";
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      msg.textContent = error
        ? (/rate|seconds/i.test(error.message) ? "Espera un momento antes de pedir otro correo." : error.message)
        : "Si el correo está registrado, te llegará un enlace para poner una nueva contraseña.";
    } finally { $("#authForgot").disabled = false; }
  });
  function showNewPassword() {
    recovering = true;
    S.user = null;
    $("#appShell").hidden = true;
    $("#authScreen").hidden = false;
    $("#authForm").hidden = true;
    $("#newPassForm").hidden = false;
    $("#newPass").focus();
  }
  $("#newPassForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#newPassMsg");
    $("#newPassSubmit").disabled = true; msg.textContent = "…";
    try {
      const { data, error } = await sb.auth.updateUser({ password: $("#newPass").value });
      if (error) {
        msg.textContent = /different from the old/i.test(error.message) ? "Debe ser distinta a la anterior."
          : /session/i.test(error.message) ? "El enlace expiró. Vuelve a pedir el correo." : error.message;
        return;
      }
      recovering = false;
      $("#newPassForm").hidden = true;
      $("#authForm").hidden = false;
      history.replaceState(null, "", location.pathname);
      toast("Contraseña actualizada");
      startApp(data.user);
    } finally { $("#newPassSubmit").disabled = false; }
  });

  async function startApp(user) {
    S.user = user;
    lockIfNeeded();
    S.ym = S.ym || ymOf(today());
    $("#authScreen").hidden = true;
    $("#appShell").hidden = false;
    const hadCache = await loadCache();
    applyTheme();
    if (hadCache) { render(); hideSplash(); }
    else $("#view").innerHTML = `<div class="empty"><div class="spinner"></div>Cargando…</div>`;
    await refresh(true);
    render(); hideSplash();
    // Accesos directos: ?nuevo=gasto | ingreso
    const p = new URLSearchParams(location.search);
    if (p.get("nuevo")) { openEntry({ type: p.get("nuevo") === "ingreso" ? "ingreso" : "gasto" }); history.replaceState(null, "", location.pathname); }
  }
  function showAuth(message) {
    S.user = null; hideSplash();
    $("#appShell").hidden = true;
    $("#authScreen").hidden = false;
    if (message) $("#authMsg").textContent = message;
  }

  // Quita la pantalla de arranque con un desvanecido (una sola vez)
  // Se muestra al menos 1.5 s desde que se abre la app (como una app nativa)
  let splashGone = false;
  function hideSplash() {
    if (splashGone) return; splashGone = true;
    const wait = Math.max(0, 1500 - performance.now());
    setTimeout(() => { const sp = $("#splash"); if (!sp) return; sp.classList.add("out"); setTimeout(() => sp.remove(), 500); }, wait);
  }
  setTimeout(hideSplash, 5000);                                   // por si algo tarda: nunca se queda atorada
  async function init() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    if (!sb) { showAuth("Falta configurar Supabase en js/config.js"); $("#authSubmit").disabled = true; return; }
    const { data } = await sb.auth.getSession();
    const linkErr = AUTH_HASH.get("error_description");
    if (data.session && recovering) showNewPassword();
    else if (data.session) startApp(data.session.user);
    else showAuth(linkErr ? "El enlace del correo no es válido o ya expiró. Pide uno nuevo." : "");
    if (linkErr) history.replaceState(null, "", location.pathname);
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY") { showNewPassword(); return; }
      if (ev === "SIGNED_IN" && session && !S.user && !recovering) startApp(session.user);
      if (ev === "SIGNED_OUT") showAuth();
    });
  }
  init();
})();
