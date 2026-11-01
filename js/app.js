/* WithCash — control de gastos personales (PWA) */
(() => {
  "use strict";

  // ---------- Config / cliente ----------
  const CFG = window.WITHCASH_CONFIG || {};
  // Se lee antes de crear el cliente: Supabase limpia el #hash del enlace del correo al procesarlo.
  const AUTH_HASH = new URLSearchParams(location.hash.slice(1));
  let recovering = AUTH_HASH.get("type") === "recovery";
  const sb = CFG.supabaseUrl && CFG.supabaseKey && window.supabase
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } })
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
  const KIND_LABEL = { tarjeta: "💳 Tarjetas de crédito", servicio: "💡 Servicios y colegio", suscripcion: "📺 Suscripciones", deuda: "🚗 Deudas y préstamos" };

  const DEFAULT_CATS = [
    ["🍔","Comida","gasto"],["🛒","Súper","gasto"],["🚗","Transporte","gasto"],["⛽","Gasolina","gasto"],["🏠","Casa","gasto"],
    ["💡","Servicios","gasto"],["💳","Tarjetas","gasto"],["🎓","Educación","gasto"],["💊","Salud","gasto"],["🎬","Entretenimiento","gasto"],
    ["👕","Ropa","gasto"],["👧","Hija","gasto"],["📺","Suscripciones","gasto"],["🎁","Regalos","gasto"],["📦","Otros","gasto"],
    ["💼","Sueldo","ingreso"],["💵","Extra","ingreso"],["🏷️","Ventas","ingreso"],["↩️","Reembolso","ingreso"],["📦","Otros ingresos","ingreso"],
  ];
  const DEFAULT_ACCS = [["💵","Efectivo"],["🏦","Débito"],["💳","Crédito"]];
  const TEMPLATES = [
    { name: "Tarjeta de crédito", kind: "tarjeta", cat: "Tarjetas", icon: "💳" },
    { name: "Luz", kind: "servicio", cat: "Servicios", icon: "💡" },
    { name: "Internet", kind: "servicio", cat: "Servicios", icon: "🌐" },
    { name: "Colegio", kind: "servicio", cat: "Educación", icon: "🎓" },
    { name: "Agua", kind: "servicio", cat: "Servicios", icon: "🚰" },
    { name: "Teléfono", kind: "servicio", cat: "Servicios", icon: "📱" },
    { name: "Renta", kind: "servicio", cat: "Casa", icon: "🏠" },
    { name: "Netflix", kind: "suscripcion", cat: "Suscripciones", icon: "📺" },
    { name: "Spotify", kind: "suscripcion", cat: "Suscripciones", icon: "🎵" },
    { name: "Gimnasio", kind: "suscripcion", cat: "Salud", icon: "🏋️" },
    { name: "Préstamo auto", kind: "deuda", cat: "Transporte", icon: "🚗" },
  ];

  // ---------- Estado ----------
  const S = {
    user: null,
    settings: { currency: "MXN", budget: null, savings_goal: null, timezone: "America/Mexico_City" },
    accounts: [], categories: [], fixed: [], movements: [],
    tab: "inicio", ym: null, movFilter: "todos",
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

  // ---------- Dinero ----------
  let _fmt = null, _fmtCur = null;
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
    return Math.round(parseFloat(s) * 100) / 100;
  };

  // ---------- Lookups ----------
  const cat = (id) => S.categories.find((c) => c.id === id);
  const acc = (id) => S.accounts.find((a) => a.id === id);
  const activeCats = (kind) => S.categories.filter((c) => !c.archived && (!kind || c.kind === kind)).sort((a, b) => a.sort - b.sort);
  const activeAccs = () => S.accounts.filter((a) => !a.archived).sort((a, b) => a.sort - b.sort);
  const monthMovs = (ym) => S.movements.filter((m) => m.date.startsWith(ym));
  const paidFor = (f, ym) => S.movements.find((m) => m.fixed_id === f.id && m.fixed_for === ym);

  function totals(ym) {
    let inc = 0, exp = 0, fixedExp = 0;
    for (const m of monthMovs(ym)) {
      const a = Number(m.amount);
      if (m.type === "ingreso") inc += a;
      else if (m.type === "gasto") { exp += a; if (m.fixed_id) fixedExp += a; }
    }
    return { inc, exp, fixedExp, varExp: exp - fixedExp, net: inc - exp };
  }
  function accountBalance(a) {
    let b = Number(a.initial_balance) || 0;
    for (const m of S.movements) {
      const v = Number(m.amount);
      if (m.type === "ingreso" && m.account_id === a.id) b += v;
      else if (m.type === "gasto" && m.account_id === a.id) b -= v;
      else if (m.type === "transferencia") {
        if (m.account_id === a.id) b -= v;
        if (m.to_account_id === a.id) b += v;
      }
    }
    return b;
  }
  // Próxima ocurrencia pendiente desde hoy
  function nextPending(f) {
    const ym = ymOf(today());
    const m = paidFor(f, ym) ? addMonths(ym, 1) : ym;
    const due = dueDate(m, f.day);
    return { month: m, due, days: daysBetween(today(), due) };
  }
  function fixedStatus(f, ym) {
    const p = paidFor(f, ym);
    const due = dueDate(ym, f.day);
    const days = daysBetween(today(), due);
    if (p) return { paid: true, label: "Pagado", cls: "good", days, due, mov: p };
    if (days < 0) return { label: `Venció hace ${-days} d`, cls: "bad", days, due };
    if (days === 0) return { label: "Vence hoy", cls: "bad", days, due };
    if (days === 1) return { label: "Vence mañana", cls: "warn", days, due };
    if (days <= f.remind_days) return { label: `En ${days} días`, cls: "warn", days, due };
    return { label: `Día ${f.day}`, cls: "", days, due };
  }
  function debtProgress(f) {
    if (f.kind !== "deuda" || !f.installments) return null;
    const paid = (f.installments_paid_before || 0) + S.movements.filter((m) => m.fixed_id === f.id).length;
    const n = Math.min(paid, f.installments);
    return { paid: n, total: f.installments, pct: n / f.installments, left: (f.installments - n) * Number(f.amount) };
  }

  // ---------- Persistencia (Supabase + caché local + cola sin conexión) ----------
  const cacheKey = () => `wc_cache_${S.user?.id}`;
  const outboxKey = () => `wc_outbox_${S.user?.id}`;
  const TABLE_STATE = { accounts: "accounts", categories: "categories", fixed_payments: "fixed", movements: "movements" };

  function saveCache() {
    ls.set(cacheKey(), { settings: S.settings, accounts: S.accounts, categories: S.categories, fixed: S.fixed, movements: S.movements });
  }
  function loadCache() {
    const c = ls.get(cacheKey(), null);
    if (!c) return false;
    Object.assign(S, { settings: { ...S.settings, ...c.settings }, accounts: c.accounts || [], categories: c.categories || [], fixed: c.fixed || [], movements: c.movements || [] });
    return true;
  }
  function applyLocal(op) {
    if (op.table === "settings") { S.settings = { ...S.settings, ...op.row }; return; }
    const key = TABLE_STATE[op.table];
    const arr = S[key];
    if (op.op === "delete") { S[key] = arr.filter((r) => r.id !== op.id); return; }
    for (const row of [].concat(op.row)) {
      const i = arr.findIndex((r) => r.id === row.id);
      if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push(row);
    }
    if (key === "movements") arr.sort((a, b) => (b.date + (b.created_at || "")).localeCompare(a.date + (a.created_at || "")));
  }
  function mutate(op) {
    applyLocal(op);
    saveCache();
    const q = ls.get(outboxKey(), []);
    q.push(op);
    ls.set(outboxKey(), q);
    flush();
    render();
  }
  const isNetErr = (e) => !navigator.onLine || /fetch|network|load failed|timeout/i.test(e?.message || "");
  let flushing = false;
  async function flush() {
    if (flushing || !sb || !S.user) return;
    flushing = true;
    try {
      // Se relee la cola en cada vuelta: mientras se envía una operación pueden llegar otras
      // (p. ej. seedDefaults hace tres seguidas) y no deben perderse al guardar la cola.
      for (let q = ls.get(outboxKey(), []); q.length; q = ls.get(outboxKey(), [])) {
        const op = q[0];
        let res;
        try {
          res = op.op === "delete"
            ? await sb.from(op.table).delete().eq("id", op.id)
            : await sb.from(op.table).upsert(op.row, { onConflict: op.table === "settings" ? "user_id" : "id" });
        } catch (e) { res = { error: e }; }
        if (res.error) {
          if (isNetErr(res.error)) break;
          console.error(res.error);
          toast("No se pudo guardar: " + res.error.message);
        }
        ls.set(outboxKey(), ls.get(outboxKey(), []).slice(1));
      }
    } finally {
      flushing = false;
      updateOffline();
    }
  }
  function updateOffline() {
    const pending = S.user ? ls.get(outboxKey(), []).length : 0;
    $("#offlineBar").hidden = navigator.onLine && !pending;
    $("#offlineBar").textContent = navigator.onLine ? `Sincronizando ${pending} cambio(s)…` : "Sin conexión · los cambios se guardarán al reconectar";
  }

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
    if (ls.get(outboxKey(), []).length) await flush();
    const [st, accounts, categories, fixed, movements] = await Promise.all([
      sb.from("settings").select("*").maybeSingle(),
      fetchAll("accounts", "created_at"),
      fetchAll("categories", "created_at"),
      fetchAll("fixed_payments", "created_at"),
      fetchAll("movements", "date"),
    ]);
    if (st.error) throw st.error;
    S.settings = { ...S.settings, ...(st.data || {}) };
    Object.assign(S, { accounts, categories, fixed, movements });
    applyLocal({ table: "movements", op: "upsert", row: [] }); // ordena
    // Si hay cambios sin enviar, re-aplícalos encima de lo descargado
    for (const op of ls.get(outboxKey(), [])) applyLocal(op);
    if (!S.accounts.length && !S.categories.length) await seedDefaults(!st.data);
    saveCache();
  }
  async function seedDefaults(withSettings = true) {
    const uid = S.user.id;
    const cats = DEFAULT_CATS.map(([icon, name, kind], i) => ({ id: uuid(), user_id: uid, icon, name, kind, sort: i, archived: false }));
    const accs = DEFAULT_ACCS.map(([icon, name], i) => ({ id: uuid(), user_id: uid, icon, name, sort: i, initial_balance: 0, archived: false }));
    if (withSettings) mutate({ table: "settings", op: "upsert", row: { user_id: uid, currency: "MXN", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Mexico_City" } });
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
    $("#monthTitle").textContent = `${monthName(S.ym)} ${S.ym.slice(0, 4)}`;
    $("#nextMonth").style.visibility = S.ym >= addMonths(ymOf(today()), 1) ? "hidden" : "visible";
    $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.tab));
    const v = $("#view");
    v.innerHTML = ({ inicio: viewInicio, movimientos: viewMovs, fijos: viewFijos, balance: viewBalance })[S.tab]();
    updateBadge();
  }

  function movItem(m) {
    const c = cat(m.category_id), a = acc(m.account_id);
    const isT = m.type === "transferencia";
    const icon = isT ? "🔁" : c?.icon || (m.type === "ingreso" ? "💵" : "📦");
    const title = m.note || (isT ? "Transferencia" : c?.name || "Sin categoría");
    const sub = isT ? `${a?.name || "?"} → ${acc(m.to_account_id)?.name || "?"}`
      : [m.note ? c?.name : null, a?.name, m.source === "atajo" ? "⚡ atajo" : null].filter(Boolean).join(" · ");
    const sign = m.type === "ingreso" ? "+" : m.type === "gasto" ? "−" : "";
    return `<li class="item tap" data-mov="${m.id}">
      <div class="ico">${esc(icon)}</div>
      <div class="main"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div>
      <div class="amt num ${m.type === "ingreso" ? "pos" : ""}">${sign}${money(Number(m.amount))}</div>
    </li>`;
  }

  function upcomingList(limitDays = 10) {
    const t = today(), ym = ymOf(t);
    const rows = [];
    for (const f of S.fixed.filter((x) => x.active)) {
      // pendiente del mes anterior
      const prev = addMonths(ym, -1);
      if (!paidFor(f, prev) && f.created_at && f.created_at.slice(0, 10) < dueDate(prev, f.day)) {
        rows.push({ f, month: prev, due: dueDate(prev, f.day), days: daysBetween(t, dueDate(prev, f.day)) });
      }
      const n = nextPending(f);
      rows.push({ f, ...n });
    }
    rows.sort((a, b) => a.days - b.days);
    return { soon: rows.filter((r) => r.days <= Math.max(limitDays, r.f.remind_days)), next: rows.find((r) => r.days > limitDays) };
  }
  function upcomingItem(r) {
    const { f, days } = r;
    const c = cat(f.category_id);
    const cls = days <= 0 ? "bad" : days <= f.remind_days ? "warn" : "";
    const when = days < 0 ? `Venció hace ${-days} día${days === -1 ? "" : "s"}` : days === 0 ? "Vence hoy" : days === 1 ? "Mañana" : `En ${days} días`;
    return `<li class="item">
      <div class="ico">${esc(c?.icon || "📅")}</div>
      <div class="main"><div class="t">${esc(f.name)}</div><div class="s"><span class="badge ${cls}">${when}</span> · ${fmtDay(r.due)}</div></div>
      <div class="actions"><button class="btn sm primary" data-pay="${f.id}" data-month="${r.month}">Pagar</button></div>
    </li>`;
  }

  function viewInicio() {
    const ym = S.ym, t = totals(ym);
    const budget = Number(S.settings.budget) || 0;
    const isCur = ym === ymOf(today());
    const accs = activeAccs();
    let html = `<section class="card hero">
      <div class="label">Disponible en ${monthName(ym)}</div>
      <div class="big num ${t.net < 0 ? "neg" : ""}">${money(t.net)}</div>
      <div class="stats">
        <div class="stat"><div class="k">Ingresos</div><div class="v num pos">${money(t.inc, { short: true })}</div></div>
        <div class="stat"><div class="k">Gastos</div><div class="v num">${money(t.exp, { short: true })}</div></div>
        <div class="stat"><div class="k">Fijos pagados</div><div class="v num">${money(t.fixedExp, { short: true })}</div></div>
      </div>`;
    if (budget > 0) {
      const pct = t.exp / budget;
      html += `<div class="progress ${pct > 1 ? "over" : ""}"><i style="width:${Math.min(100, pct * 100).toFixed(1)}%"></i></div>
        <div class="progress-label"><span>Presupuesto ${Math.round(pct * 100)}%</span><span>${pct > 1 ? "Excedido por " + money(t.exp - budget) : "Quedan " + money(budget - t.exp)}</span></div>`;
    }
    if (!t.inc && isCur) html += `<p class="hint" style="margin:10px 0 0">💡 Registra tu sueldo con <b>+ → Ingreso</b> para ver cuánto te queda.</p>`;
    html += `</section>`;

    if (accs.length) {
      html += `<div class="acc-scroll">${accs.map((a) => {
        const b = accountBalance(a);
        return `<div class="acc-card"><div class="n">${esc(a.icon)} ${esc(a.name)}</div><div class="v num ${b < 0 ? "neg" : ""}">${money(b)}</div></div>`;
      }).join("")}</div>`;
    }

    const up = upcomingList(10);
    html += `<section class="card"><h2>Próximos pagos <button class="link" data-goto="fijos">Ver todos</button></h2>`;
    if (!S.fixed.length) {
      html += `<div class="empty"><div class="e">📅</div>Agrega tus pagos fijos (tarjetas, luz, internet, colegio…) para recordarlos.<br><br><button class="btn primary" data-new-fixed>Agregar pago fijo</button></div>`;
    } else if (!up.soon.length) {
      html += `<div class="empty">✅ Todo al corriente.${up.next ? `<br><span class="hint">Siguiente: <b>${esc(up.next.f.name)}</b> ${fmtDay(up.next.due)} (${money(Number(up.next.f.amount))})</span>` : ""}</div>`;
    } else {
      html += `<ul class="list">${up.soon.map(upcomingItem).join("")}</ul>`;
    }
    html += `</section>`;

    const recent = monthMovs(ym).slice(0, 6);
    html += `<section class="card"><h2>Últimos movimientos <button class="link" data-goto="movimientos">Ver todos</button></h2>`;
    html += recent.length ? `<ul class="list">${recent.map(movItem).join("")}</ul>`
      : `<div class="empty"><div class="e">🧾</div>Aún no hay movimientos este mes.<br>Toca <b>+</b> para agregar tu primer gasto.</div>`;
    html += `</section>`;
    return html;
  }

  function viewMovs() {
    const all = monthMovs(S.ym);
    const f = S.movFilter;
    const usedCats = [...new Set(all.map((m) => m.category_id).filter(Boolean))].map(cat).filter(Boolean);
    const list = all.filter((m) => f === "todos" ? true : f === "gasto" || f === "ingreso" || f === "transferencia" ? m.type === f : m.category_id === f);
    const chip = (k, label) => `<button class="chip ${f === k ? "active" : ""}" data-filter="${k}">${label}</button>`;
    let html = `<div class="filters">${chip("todos", "Todos")}${chip("gasto", "Gastos")}${chip("ingreso", "Ingresos")}${all.some((m) => m.type === "transferencia") ? chip("transferencia", "Transferencias") : ""}${usedCats.map((c) => chip(c.id, `${esc(c.icon)} ${esc(c.name)}`)).join("")}</div>`;
    if (!list.length) return html + `<div class="card empty"><div class="e">🧾</div>Sin movimientos.</div>`;
    const sum = list.reduce((s, m) => s + (m.type === "ingreso" ? Number(m.amount) : m.type === "gasto" ? -Number(m.amount) : 0), 0);
    html += `<p class="hint">${list.length} movimiento(s) · total <b class="num">${money(sum)}</b></p><section class="card">`;
    const byDay = {};
    for (const m of list) (byDay[m.date] ||= []).push(m);
    for (const d of Object.keys(byDay).sort().reverse()) {
      const dayExp = byDay[d].filter((m) => m.type === "gasto").reduce((s, m) => s + Number(m.amount), 0);
      html += `<div class="day-group"><span>${fmtDay(d)}</span><span class="num">${dayExp ? "−" + money(dayExp) : ""}</span></div><ul class="list">${byDay[d].map(movItem).join("")}</ul>`;
    }
    return html + `</section>`;
  }

  function viewFijos() {
    const ym = S.ym;
    const list = S.fixed.filter((f) => f.active);
    if (!list.length) {
      return `<section class="card"><div class="empty"><div class="e">📅</div><b>Tus pagos fijos</b><br>Tarjetas, luz, internet, colegio, suscripciones y deudas. Te mostramos cuándo vence cada uno y si ya lo pagaste.<br><br><button class="btn primary" data-new-fixed>Agregar pago fijo</button></div></section>`;
    }
    let total = 0, paid = 0;
    for (const f of list) { const s = fixedStatus(f, ym); total += s.paid ? Number(s.mov.amount) : Number(f.amount); if (s.paid) paid += Number(s.mov.amount); }
    let html = `<section class="card hero">
      <div class="label">Pagos fijos de ${monthName(ym)}</div>
      <div class="big num">${money(total)}</div>
      <div class="stats" style="grid-template-columns:1fr 1fr">
        <div class="stat"><div class="k">Pagado</div><div class="v num pos">${money(paid)}</div></div>
        <div class="stat"><div class="k">Pendiente</div><div class="v num">${money(total - paid)}</div></div>
      </div>
      <div class="progress"><i style="width:${total ? (paid / total * 100).toFixed(1) : 0}%"></i></div>
    </section>`;
    for (const kind of ["tarjeta", "servicio", "suscripcion", "deuda"]) {
      const items = list.filter((f) => f.kind === kind).sort((a, b) => a.day - b.day);
      if (!items.length) continue;
      html += `<section class="card"><h2>${KIND_LABEL[kind]}</h2><ul class="list">`;
      for (const f of items) {
        const s = fixedStatus(f, ym), c = cat(f.category_id), dp = debtProgress(f);
        html += `<li class="item">
          <div class="ico tap" data-edit-fixed="${f.id}">${esc(c?.icon || "📅")}</div>
          <div class="main tap" data-edit-fixed="${f.id}">
            <div class="t">${esc(f.name)}</div>
            <div class="s"><span class="badge ${s.cls}">${s.label}</span> · ${money(s.paid ? Number(s.mov.amount) : Number(f.amount))}</div>
            ${dp ? `<div class="s">${dp.paid}/${dp.total} cuotas · faltan ${money(dp.left)}</div><div class="progress debt-bar"><i style="width:${(dp.pct * 100).toFixed(1)}%"></i></div>` : ""}
          </div>
          <div class="actions">${s.paid ? `<button class="btn sm" data-mov-open="${s.mov.id}">✓</button>` : `<button class="btn sm primary" data-pay="${f.id}" data-month="${ym}">Pagar</button>`}</div>
        </li>`;
      }
      html += `</ul></section>`;
    }
    html += `<button class="btn block" data-new-fixed>+ Agregar pago fijo</button>`;
    return html;
  }

  function viewBalance() {
    const ym = S.ym, prevYm = addMonths(ym, -1);
    const t = totals(ym), tp = totals(prevYm);
    const rate = t.inc > 0 ? t.net / t.inc : null;
    let html = `<section class="card hero">
      <div class="label">${t.net >= 0 ? "Ahorro" : "Déficit"} de ${monthName(ym)}</div>
      <div class="big num ${t.net < 0 ? "neg" : "pos"}">${money(t.net)}</div>
      <div class="stats">
        <div class="stat"><div class="k">Ingresos</div><div class="v num">${money(t.inc, { short: true })}</div></div>
        <div class="stat"><div class="k">Gastos</div><div class="v num">${money(t.exp, { short: true })}</div></div>
        <div class="stat"><div class="k">% ahorrado</div><div class="v num">${rate == null ? "—" : Math.round(rate * 100) + "%"}</div></div>
      </div>`;
    if (t.exp > 0) {
      const fp = t.fixedExp / t.exp;
      html += `<div class="split" role="img" aria-label="Fijos ${Math.round(fp * 100)}%, variables ${Math.round((1 - fp) * 100)}%">
        ${t.fixedExp ? `<i class="fx" style="width:${fp * 100}%"></i>` : ""}${t.varExp ? `<i class="vr" style="width:${(1 - fp) * 100}%"></i>` : ""}</div>
        <div class="legend"><span class="l-fx">Fijos ${money(t.fixedExp)}</span><span class="l-vr">Variables ${money(t.varExp)}</span></div>`;
    }
    html += `</section>`;

    // Consejos
    const tips = buildTips(ym, t, tp);
    if (tips.length) html += `<section class="card"><h2>Cómo ahorrar más</h2><ul class="tips">${tips.map(([e, s]) => `<li><span class="e">${e}</span><span>${s}</span></li>`).join("")}</ul></section>`;

    // Por categoría
    const byCat = catTotals(ym), byCatPrev = catTotals(prevYm);
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    html += `<section class="card"><h2>Gastos por categoría</h2>`;
    if (!rows.length) html += `<div class="empty">Sin gastos este mes.</div>`;
    else {
      const max = rows[0][1];
      html += `<div class="bars">${rows.map(([id, v]) => {
        const c = cat(id) || { icon: "📦", name: "Sin categoría" };
        const p = byCatPrev[id] || 0;
        const d = p ? (v - p) / p : null;
        const delta = d == null ? "" : Math.abs(d) < 0.05 ? "" : `<span class="delta ${d > 0 ? "up" : "down"}" title="vs ${monthName(prevYm)}">${d > 0 ? "▲" : "▼"} ${Math.round(Math.abs(d) * 100)}%</span>`;
        return `<div class="bar-row"><div class="top"><span class="n">${esc(c.icon)} ${esc(c.name)} · ${Math.round(v / t.exp * 100)}%</span><b class="num">${money(v)}${delta}</b></div>
          <div class="bar-track"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div></div>`;
      }).join("")}</div><p class="hint" style="margin-top:10px">▲▼ comparado con ${monthName(prevYm)}.</p>`;
    }
    html += `</section>`;

    // Tendencia 6 meses
    const months = [5, 4, 3, 2, 1, 0].map((i) => addMonths(ym, -i));
    const vals = months.map((m) => totals(m).exp);
    const mx = Math.max(...vals, 1);
    html += `<section class="card"><h2>Gastos últimos 6 meses</h2><div class="trend">${months.map((m, i) => `
      <div class="col ${m === ym ? "cur" : ""}" title="${monthName(m)}: ${money(vals[i])}">
        <span class="val num">${vals[i] ? money(vals[i], { short: true }).replace(/\.\d+$/, "") : ""}</span>
        <div class="b" style="height:${(vals[i] / mx * 100).toFixed(1)}%"></div>
        <span class="m">${monthName(m, true)}</span></div>`).join("")}</div></section>`;

    // Por cuenta
    const byAcc = {};
    for (const m of monthMovs(ym)) if (m.type === "gasto") byAcc[m.account_id || "-"] = (byAcc[m.account_id || "-"] || 0) + Number(m.amount);
    const accRows = Object.entries(byAcc).sort((a, b) => b[1] - a[1]);
    if (accRows.length) {
      html += `<section class="card"><h2>¿Con qué pagaste?</h2><ul class="list">${accRows.map(([id, v]) => {
        const a = acc(id) || { icon: "❔", name: "Sin cuenta" };
        return `<li class="item"><div class="ico">${esc(a.icon)}</div><div class="main"><div class="t">${esc(a.name)}</div></div><div class="amt num">${money(v)}</div></li>`;
      }).join("")}</ul></section>`;
    }
    return html;
  }
  function catTotals(ym) {
    const o = {};
    for (const m of monthMovs(ym)) if (m.type === "gasto") o[m.category_id || "-"] = (o[m.category_id || "-"] || 0) + Number(m.amount);
    return o;
  }
  function buildTips(ym, t, tp) {
    const tips = [];
    const goal = Number(S.settings.savings_goal) || 0;
    const budget = Number(S.settings.budget) || 0;
    const isCur = ym === ymOf(today());
    if (!t.inc && !t.exp) return [["🧾", "Registra tus ingresos y gastos de este mes para ver tu balance y consejos."]];
    if (!t.inc) tips.push(["💼", "Registra tus ingresos (sueldo, extras) para saber cuánto puedes ahorrar."]);
    else if (t.net < 0) tips.push(["🚨", `Gastaste <b>${money(-t.net)}</b> más de lo que ingresó este mes.`]);
    else {
      const r = t.net / t.inc;
      if (r >= 0.2) tips.push(["🎉", `¡Bien! Ahorras el <b>${Math.round(r * 100)}%</b> de tus ingresos.`]);
      else tips.push(["🎯", `Ahorras el ${Math.round(r * 100)}%. La meta recomendada es 20%: <b>${money(t.inc * 0.2)}</b> al mes.`]);
    }
    if (goal > 0 && t.inc > 0) {
      const ok = t.net >= goal;
      tips.push([ok ? "✅" : "🐷", ok ? `Cumpliste tu meta de ahorro de ${money(goal)}.` : `Para tu meta de ahorro (${money(goal)}) te faltan <b>${money(goal - Math.max(0, t.net))}</b>.`]);
    }
    if (isCur) {
      const day = Number(today().slice(8)), dim = daysInMonth(ym);
      if (day >= 5 && day < dim && t.varExp > 0) {
        const pendFixed = S.fixed.filter((f) => f.active && !paidFor(f, ym)).reduce((s, f) => s + Number(f.amount), 0);
        const proj = t.varExp / day * dim + t.fixedExp + pendFixed;
        tips.push(["📈", `A este ritmo terminarías el mes con gastos de ~<b>${money(proj)}</b>${budget ? (proj > budget ? `, ${money(proj - budget)} arriba de tu presupuesto` : ", dentro de tu presupuesto") : ""}.`]);
      }
    }
    // mayor gasto variable
    const vc = {};
    for (const m of monthMovs(ym)) if (m.type === "gasto" && !m.fixed_id) vc[m.category_id || "-"] = (vc[m.category_id || "-"] || 0) + Number(m.amount);
    const top = Object.entries(vc).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) {
      const c = cat(top[0]) || { icon: "📦", name: "Sin categoría" };
      tips.push([c.icon, `<b>${esc(c.name)}</b> es tu mayor gasto variable (${money(top[1])}). Bajarlo 15% = <b>${money(top[1] * 0.15)}</b> al mes, ${money(top[1] * 0.15 * 12)} al año.`]);
    }
    // categorías que subieron
    const cur = catTotals(ym), prev = catTotals(addMonths(ym, -1));
    const ups = Object.entries(cur).filter(([id, v]) => prev[id] > 0 && v - prev[id] > Math.max(prev[id] * 0.25, 1)).sort((a, b) => (b[1] - prev[b[0]]) - (a[1] - prev[a[0]])).slice(0, 2);
    for (const [id, v] of ups) {
      const c = cat(id) || { icon: "📦", name: "Sin categoría" };
      tips.push(["⬆️", `${esc(c.icon)} ${esc(c.name)} subió ${Math.round((v - prev[id]) / prev[id] * 100)}% vs ${monthName(addMonths(ym, -1))} (+${money(v - prev[id])}).`]);
    }
    // gastos hormiga
    const small = S.settings.currency === "MXN" ? 150 : 10;
    const ants = monthMovs(ym).filter((m) => m.type === "gasto" && !m.fixed_id && Number(m.amount) <= small);
    if (ants.length >= 8) tips.push(["🐜", `Hiciste ${ants.length} gastos pequeños (≤ ${money(small)}) que suman <b>${money(ants.reduce((s, m) => s + Number(m.amount), 0))}</b>. Son los "gastos hormiga".`]);
    // fijos vs ingreso
    const fixedMonthly = S.fixed.filter((f) => f.active).reduce((s, f) => s + Number(f.amount), 0);
    if (t.inc > 0 && fixedMonthly / t.inc > 0.5) tips.push(["📌", `Tus pagos fijos son el ${Math.round(fixedMonthly / t.inc * 100)}% de tus ingresos (lo ideal es ≤ 50%).`]);
    const subs = S.fixed.filter((f) => f.active && f.kind === "suscripcion");
    if (subs.length >= 2) tips.push(["📺", `Pagas ${subs.length} suscripciones: ${money(subs.reduce((s, f) => s + Number(f.amount), 0))} al mes (${money(subs.reduce((s, f) => s + Number(f.amount), 0) * 12)} al año). ¿Usas todas?`]);
    if (tp.exp > 0 && t.exp > 0 && !isCur) {
      const d = (t.exp - tp.exp) / tp.exp;
      if (Math.abs(d) >= 0.05) tips.push([d > 0 ? "🔺" : "🔻", `Gastaste ${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "más" : "menos"} que en ${monthName(addMonths(ym, -1))}.`]);
    }
    return tips;
  }

  // ---------- Hoja: movimiento ----------
  let entry = null; // {id?, type, category_id, fixed_id, fixed_for}
  function openEntry(opts = {}) {
    const m = opts.id ? S.movements.find((x) => x.id === opts.id) : null;
    entry = m ? { ...m } : {
      type: opts.type || "gasto", category_id: opts.category_id || null,
      account_id: opts.account_id || ls.get("wc_last_acc", null), fixed_id: opts.fixed_id || null, fixed_for: opts.fixed_for || null,
      amount: opts.amount || "", note: opts.note || "", date: today(),
    };
    $("#entryAmount").value = entry.amount ? String(Number(entry.amount)) : "";
    $("#entryNote").value = entry.note || "";
    $("#entryDate").value = entry.date;
    $("#entryDelete").hidden = !m;
    $(".amount-wrap .cur").textContent = curSymbol();
    const hint = $("#entryFixedHint");
    const f = entry.fixed_id && S.fixed.find((x) => x.id === entry.fixed_id);
    hint.hidden = !f;
    if (f) hint.innerHTML = `📅 Pago de <b>${esc(f.name)}</b> correspondiente a ${monthName(entry.fixed_for)}.` +
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
      $("#catChips").innerHTML = cats.map((c) => `<button type="button" class="chip ${c.id === entry.category_id ? "active" : ""}" data-cat="${c.id}">${esc(c.icon)} ${esc(c.name)}</button>`).join("");
    }
    const opts = activeAccs().map((a) => `<option value="${a.id}">${esc(a.icon)} ${esc(a.name)}</option>`).join("");
    $("#entryAccount").innerHTML = `<option value="">— Sin especificar —</option>` + opts;
    $("#entryAccount").value = entry.account_id && acc(entry.account_id) ? entry.account_id : "";
    $("#entryToAccount").innerHTML = opts;
    if (entry.to_account_id) $("#entryToAccount").value = entry.to_account_id;
  }
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
    const amount = parseAmount($("#entryAmount").value);
    if (!(amount > 0)) { toast("Escribe un monto válido"); $("#entryAmount").focus(); return; }
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
      fixed_id: entry.fixed_id || null, fixed_for: entry.fixed_for || null,
      source: entry.source || "app", created_at: entry.created_at || new Date().toISOString(),
    };
    if (account_id) ls.set("wc_last_acc", account_id);
    const isNew = !entry.id;
    mutate({ table: "movements", op: "upsert", row });
    closeSheet($("#entrySheet"));
    if (isNew) toast(`${type === "ingreso" ? "Ingreso" : type === "transferencia" ? "Transferencia" : "Gasto"} de ${money(amount)} guardado`, {
      label: "Deshacer", fn: () => mutate({ table: "movements", op: "delete", id: row.id }),
    });
  });
  $("#entryDelete").addEventListener("click", () => {
    if (!entry?.id || !confirm("¿Eliminar este movimiento?")) return;
    const old = S.movements.find((m) => m.id === entry.id);
    mutate({ table: "movements", op: "delete", id: entry.id });
    closeSheet($("#entrySheet"));
    toast("Movimiento eliminado", { label: "Deshacer", fn: () => mutate({ table: "movements", op: "upsert", row: old }) });
  });

  // ---------- Hoja: pago fijo ----------
  let fixedEditing = null;
  function openFixed(id) {
    const f = id ? S.fixed.find((x) => x.id === id) : null;
    fixedEditing = f;
    $("#fixedTitle").textContent = f ? "Editar pago fijo" : "Nuevo pago fijo";
    $("#fixedTemplates").hidden = !!f;
    $("#fixedTemplates").innerHTML = TEMPLATES.map((t, i) => `<button type="button" class="chip" data-tpl="${i}">${t.icon} ${t.name}</button>`).join("");
    $("#fixedName").value = f?.name || "";
    $("#fixedAmount").value = f ? String(Number(f.amount)) : "";
    $("#fixedDay").value = f?.day || "";
    $("#fixedKind").value = f?.kind || "servicio";
    $("#fixedRemind").value = String(f?.remind_days ?? 3);
    $("#fixedInstallments").value = f?.installments || "";
    $("#fixedPaidBefore").value = f?.installments_paid_before || "";
    $("#fixedCat").innerHTML = `<option value="">—</option>` + activeCats("gasto").map((c) => `<option value="${c.id}">${esc(c.icon)} ${esc(c.name)}</option>`).join("");
    $("#fixedCat").value = f?.category_id || "";
    $("#fixedAcc").innerHTML = `<option value="">—</option>` + activeAccs().map((a) => `<option value="${a.id}">${esc(a.icon)} ${esc(a.name)}</option>`).join("");
    $("#fixedAcc").value = f?.account_id || "";
    $("#fixedDelete").hidden = !f;
    $("#debtFields").hidden = $("#fixedKind").value !== "deuda";
    openSheet("#fixedSheet");
  }
  $("#fixedKind").addEventListener("change", () => { $("#debtFields").hidden = $("#fixedKind").value !== "deuda"; });
  $("#fixedTemplates").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tpl]"); if (!b) return;
    const t = TEMPLATES[b.dataset.tpl];
    $("#fixedName").value = t.name;
    $("#fixedKind").value = t.kind;
    const c = activeCats("gasto").find((x) => x.name === t.cat);
    if (c) $("#fixedCat").value = c.id;
    if (t.kind === "tarjeta") { const a = activeAccs().find((x) => /d[eé]bito/i.test(x.name)); if (a) $("#fixedAcc").value = a.id; }
    $("#debtFields").hidden = t.kind !== "deuda";
    $$("#fixedTemplates .chip").forEach((x) => x.classList.toggle("active", x === b));
    $("#fixedAmount").focus();
  });
  $("#fixedForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = parseAmount($("#fixedAmount").value);
    const day = parseInt($("#fixedDay").value, 10);
    if (!(amount >= 0) || isNaN(amount)) { toast("Monto inválido"); return; }
    if (!(day >= 1 && day <= 31)) { toast("El día debe ser de 1 a 31"); return; }
    const kind = $("#fixedKind").value;
    const row = {
      id: fixedEditing?.id || uuid(), user_id: S.user.id, name: $("#fixedName").value.trim(), kind, amount, day,
      category_id: $("#fixedCat").value || null, account_id: $("#fixedAcc").value || null,
      remind_days: parseInt($("#fixedRemind").value, 10),
      installments: kind === "deuda" ? parseInt($("#fixedInstallments").value, 10) || null : null,
      installments_paid_before: kind === "deuda" ? parseInt($("#fixedPaidBefore").value, 10) || 0 : 0,
      active: true, created_at: fixedEditing?.created_at || new Date().toISOString(),
    };
    if (!row.name) { toast("Escribe un nombre"); return; }
    mutate({ table: "fixed_payments", op: "upsert", row });
    closeSheet($("#fixedSheet"));
    toast(fixedEditing ? "Pago fijo actualizado" : `${row.name} agregado · día ${day}`);
  });
  $("#fixedDelete").addEventListener("click", () => {
    if (!fixedEditing || !confirm(`¿Eliminar "${fixedEditing.name}"? Los pagos ya registrados se conservan.`)) return;
    mutate({ table: "fixed_payments", op: "upsert", row: { ...fixedEditing, active: false } });
    closeSheet($("#fixedSheet"));
  });
  function payFixed(id, month) {
    const f = S.fixed.find((x) => x.id === id); if (!f) return;
    openEntry({ type: "gasto", amount: Number(f.amount), category_id: f.category_id, account_id: f.account_id, note: f.name, fixed_id: f.id, fixed_for: month });
  }

  // ---------- Hoja: cuenta / categoría ----------
  let itemEditing = null; // {table, row}
  function openItem(table, row, kind) {
    itemEditing = { table, row };
    const isAcc = table === "accounts";
    $("#itemTitle").textContent = (row ? "Editar " : "Nueva ") + (isAcc ? "cuenta" : "categoría");
    $("#itemIcon").value = row?.icon || (isAcc ? "💳" : "📦");
    $("#itemName").value = row?.name || "";
    $("#itemBalanceWrap").hidden = !isAcc;
    $("#itemKindWrap").hidden = isAcc || !!row;
    $("#itemKind").value = row?.kind || kind || "gasto";
    $("#itemBalance").value = row ? String(Number(row.initial_balance || 0)) : "";
    if (isAcc && row) $("#itemBalanceWrap span").textContent = `Saldo inicial (saldo actual: ${money(accountBalance(row))})`;
    else $("#itemBalanceWrap span").textContent = "Saldo inicial (lo que tiene hoy)";
    $("#itemDelete").hidden = !row;
    openSheet("#itemSheet");
  }
  $("#itemForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const { table, row } = itemEditing;
    const isAcc = table === "accounts";
    const list = isAcc ? S.accounts : S.categories;
    const r = {
      id: row?.id || uuid(), user_id: S.user.id, icon: $("#itemIcon").value.trim() || "📦", name: $("#itemName").value.trim(),
      sort: row?.sort ?? list.length + 1, archived: false,
    };
    if (!r.name) return;
    if (isAcc) r.initial_balance = parseAmount($("#itemBalance").value) || 0;
    else r.kind = row?.kind || $("#itemKind").value;
    mutate({ table, op: "upsert", row: r });
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
  function renderSettingsLists() {
    $("#accountsList").innerHTML = activeAccs().map((a) => `<li class="item tap" data-acc="${a.id}"><div class="ico">${esc(a.icon)}</div><div class="main"><div class="t">${esc(a.name)}</div></div><div class="amt num">${money(accountBalance(a))}</div></li>`).join("");
    $("#categoriesList").innerHTML = ["gasto", "ingreso"].map((k) => activeCats(k).map((c) => `<button type="button" class="chip" data-catedit="${c.id}">${esc(c.icon)} ${esc(c.name)}${k === "ingreso" ? " ↗" : ""}</button>`).join("")).join("");
  }
  function openSettings() {
    $("#userEmail").textContent = S.user?.email ? `Sesión: ${S.user.email}` : "";
    $("#setCurrency").innerHTML = CURRENCIES.map(([c, n]) => `<option value="${c}">${c} — ${n}</option>`).join("");
    $("#setCurrency").value = S.settings.currency || "MXN";
    $("#setBudget").value = S.settings.budget ? String(Number(S.settings.budget)) : "";
    $("#setGoal").value = S.settings.savings_goal ? String(Number(S.settings.savings_goal)) : "";
    renderSettingsLists();
    openSheet("#settingsSheet");
  }
  $("#accountsList").addEventListener("click", (e) => { const li = e.target.closest("[data-acc]"); if (li) openItem("accounts", acc(li.dataset.acc)); });
  $("#categoriesList").addEventListener("click", (e) => { const b = e.target.closest("[data-catedit]"); if (b) openItem("categories", cat(b.dataset.catedit)); });
  $("#addAccount").addEventListener("click", () => openItem("accounts", null));
  $("#addCategory").addEventListener("click", () => openItem("categories", null));
  $("#settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const b = parseAmount($("#setBudget").value), g = parseAmount($("#setGoal").value);
    mutate({ table: "settings", op: "upsert", row: {
      user_id: S.user.id, currency: $("#setCurrency").value,
      budget: b > 0 ? b : null, savings_goal: g > 0 ? g : null, updated_at: new Date().toISOString(),
    } });
    closeSheet($("#settingsSheet"));
    toast("Ajustes guardados");
  });
  $("#logout").addEventListener("click", async () => {
    if (!confirm("¿Cerrar sesión en este dispositivo?")) return;
    ls.del(cacheKey()); ls.del(outboxKey());
    await sb.auth.signOut();
    location.reload();
  });
  $("#exportCsv").addEventListener("click", () => {
    const rows = [["Fecha", "Tipo", "Monto", "Categoría", "Cuenta", "Cuenta destino", "Nota", "Pago fijo"]];
    for (const m of monthMovs(S.ym).slice().reverse()) {
      rows.push([m.date, m.type, Number(m.amount).toFixed(2), cat(m.category_id)?.name || "", acc(m.account_id)?.name || "", acc(m.to_account_id)?.name || "", m.note || "", S.fixed.find((f) => f.id === m.fixed_id)?.name || ""]);
    }
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    download(`withcash-${S.ym}.csv`, csv, "text/csv");
  });
  $("#exportJson").addEventListener("click", () => {
    download(`withcash-respaldo-${today()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), settings: S.settings, accounts: S.accounts, categories: S.categories, fixed_payments: S.fixed, movements: S.movements }, null, 2), "application/json");
  });
  $("#exportIcs").addEventListener("click", () => {
    const fx = S.fixed.filter((f) => f.active);
    if (!fx.length) { toast("Primero agrega pagos fijos"); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const icsEsc = (s) => String(s).replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WithCash//ES", "CALSCALE:GREGORIAN", "X-WR-CALNAME:WithCash pagos"];
    for (const f of fx) {
      const n = nextPending(f);
      const start = n.due.replace(/-/g, "");
      const rule = f.day > 28
        ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${Array.from({ length: f.day - 27 }, (_, i) => 28 + i).join(",")};BYSETPOS=-1`
        : `RRULE:FREQ=MONTHLY;BYMONTHDAY=${f.day}`;
      const trig = f.remind_days > 0 ? `-PT${f.remind_days * 24 - 9}H` : "PT9H";
      lines.push("BEGIN:VEVENT", `UID:withcash-${f.id}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, rule,
        `SUMMARY:${icsEsc("💳 Pagar " + f.name + " (" + money(Number(f.amount)) + ")")}`,
        `DESCRIPTION:${icsEsc("Recordatorio de WithCash")}`,
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc("Pagar " + f.name)}`, `TRIGGER:${trig}`, "END:VALARM",
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEsc("Hoy vence " + f.name)}`, "TRIGGER:PT9H", "END:VALARM",
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
        <li><span class="act">Mostrar notificación</span> → con <b>Contenido de la URL</b>. Te confirmará: “✅ Gasto guardado…”.</li>
      </ol>

      <h3>3. Atajo «Registrar ingreso»</h3>
      <p class="hint">Duplica el atajo anterior (mantén presionado → Duplicar), renómbralo y cambia:</p>
      <ol>
        <li>Las preguntas a <i>¿Cuánto recibiste?</i> y <i>¿De qué es?</i></li>
        <li>La dirección de categorías por: ${copy("", base + "&lista=ingresos")}</li>
        <li>En el JSON, <b>tipo</b> = <b>ingreso</b>.</li>
      </ol>

      <h3>4. Atajo «Pagar fijo» (opcional)</h3>
      <p class="hint">Para marcar como pagada una tarjeta, la luz, el colegio, Netflix…</p>
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

      <h3>6. Avisos de pagos cada mañana 🔔</h3>
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
        toast(r.ok ? "✅ Conexión correcta" : t);
      } catch { toast("No hay conexión con el servidor"); }
    };
  }
  $("#openShortcuts").addEventListener("click", () => { renderShortcuts(); openSheet("#shortcutsSheet"); });
  $("#shortcutsBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "✓"; setTimeout(() => (b.textContent = "Copiar"), 1500); }
    catch { prompt("Copia el texto:", b.dataset.copy); }
  });

  // ---------- Eventos globales ----------
  $(".tabbar").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    S.tab = b.dataset.tab; render(); window.scrollTo(0, 0);
  });
  $("#view").addEventListener("click", (e) => {
    const t = e.target.closest("[data-mov],[data-mov-open],[data-pay],[data-goto],[data-new-fixed],[data-edit-fixed],[data-filter]");
    if (!t) return;
    if (t.dataset.pay) payFixed(t.dataset.pay, t.dataset.month);
    else if (t.dataset.movOpen) openEntry({ id: t.dataset.movOpen });
    else if (t.dataset.mov) openEntry({ id: t.dataset.mov });
    else if (t.dataset.goto) { S.tab = t.dataset.goto; render(); window.scrollTo(0, 0); }
    else if (t.hasAttribute("data-new-fixed")) openFixed();
    else if (t.dataset.editFixed) openFixed(t.dataset.editFixed);
    else if (t.dataset.filter) { S.movFilter = t.dataset.filter; render(); }
  });
  $("#fab").addEventListener("click", () => openEntry());
  $("#prevMonth").addEventListener("click", () => { S.ym = addMonths(S.ym, -1); S.movFilter = "todos"; render(); });
  $("#nextMonth").addEventListener("click", () => { S.ym = addMonths(S.ym, 1); S.movFilter = "todos"; render(); });
  $("#monthTitle").addEventListener("click", () => { S.ym = ymOf(today()); render(); });
  $("#openSettings").addEventListener("click", openSettings);
  window.addEventListener("online", () => { flush().then(refresh); updateOffline(); });
  window.addEventListener("offline", updateOffline);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.user) refresh(); });

  function updateBadge() {
    if (!("setAppBadge" in navigator)) return;
    const n = upcomingList(0).soon.filter((r) => r.days <= r.f.remind_days).length;
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }

  let lastRefresh = 0;
  async function refresh(force) {
    if (!sb || !S.user) return;
    if (!force && Date.now() - lastRefresh < 15000) return;
    lastRefresh = Date.now();
    try { await loadRemote(); render(); }
    catch (e) { if (!isNetErr(e)) console.error(e); }
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
        msg.textContent = "📩 Te enviamos un correo para confirmar tu cuenta. Después vuelve aquí y entra.";
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
        : "📩 Si el correo está registrado, te llegará un enlace para poner una nueva contraseña.";
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
    S.ym = S.ym || ymOf(today());
    $("#authScreen").hidden = true;
    $("#appShell").hidden = false;
    const hadCache = loadCache();
    if (hadCache) render();
    else $("#view").innerHTML = `<div class="empty"><div class="e">⏳</div>Cargando…</div>`;
    await refresh(true);
    render();
    // Accesos directos: ?nuevo=gasto | ingreso
    const p = new URLSearchParams(location.search);
    if (p.get("nuevo")) { openEntry({ type: p.get("nuevo") === "ingreso" ? "ingreso" : "gasto" }); history.replaceState(null, "", location.pathname); }
  }
  function showAuth(message) {
    S.user = null;
    $("#appShell").hidden = true;
    $("#authScreen").hidden = false;
    if (message) $("#authMsg").textContent = message;
  }

  async function init() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    if (!sb) { showAuth("⚠️ Falta configurar Supabase en js/config.js"); $("#authSubmit").disabled = true; return; }
    const { data } = await sb.auth.getSession();
    const linkErr = AUTH_HASH.get("error_description");
    if (data.session && recovering) showNewPassword();
    else if (data.session) startApp(data.session.user);
    else showAuth(linkErr ? "⚠️ El enlace del correo no es válido o ya expiró. Pide uno nuevo." : "");
    if (linkErr) history.replaceState(null, "", location.pathname);
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY") { showNewPassword(); return; }
      if (ev === "SIGNED_IN" && session && !S.user && !recovering) startApp(session.user);
      if (ev === "SIGNED_OUT") showAuth();
    });
  }
  init();
})();
