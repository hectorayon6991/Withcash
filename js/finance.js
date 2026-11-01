/* WithCash — motor financiero.
   Todas las sumas se hacen en CENTAVOS ENTEROS (nunca con punto flotante) y se convierten a pesos solo al mostrar.
   Funciona en el navegador (window.WCFin) y en Node para las pruebas (module.exports). Sin dependencias. */
(function (root) {
  "use strict";

  // ---------- Dinero ----------
  // "123.45" | 123.45 | null → 12345 (centavos enteros)
  const toC = (v) => {
    if (v == null || v === "") return 0;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };
  const fromC = (c) => c / 100;
  const sumC = (list, f = (x) => x) => list.reduce((s, x) => s + toC(f(x)), 0);
  // Multiplicar un importe por un tipo de cambio o tasa sin acumular errores: se redondea una sola vez al final
  const mulC = (c, factor) => Math.round(c * Number(factor || 0));

  // ---------- Fechas (cadenas YYYY-MM-DD, sin zona horaria) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymOf = (d) => d.slice(0, 7);
  const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; };
  const daysInMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  const dueDate = (ym, day) => `${ym}-${pad(Math.min(day || 1, daysInMonth(ym)))}`;
  const dow = (d) => new Date(d + "T12:00:00Z").getUTCDay();
  const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  const monthsBetween = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };

  // ---------- Recurrencias ----------
  // Frecuencias: unico, semanal, quincenal, mensual, bimestral, trimestral, semestral, anual (personalizado = presupuesto por rango)
  const STEP = { bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
  const PER_MONTH = { semanal: 52 / 12, quincenal: 2, mensual: 1, bimestral: 1 / 2, trimestral: 1 / 3, semestral: 1 / 6, anual: 1 / 12, unico: 0, personalizado: 0 };
  const freqOf = (f) => f.frequency || "mensual";
  const perMonthC = (f) => Math.round(toC(f.amount) * (PER_MONTH[freqOf(f)] ?? 1));

  // Fechas en que toca un pago dentro de un mes (antes de aplicar reprogramaciones).
  // key = identificador estable de la ocurrencia (se guarda en movements.fixed_for):
  //   mensual y cada N meses → "YYYY-MM" · quincenal, semanal y único → "YYYY-MM-DD"
  function baseOccurrences(f, ym) {
    const fr = freqOf(f);
    if (fr === "mensual") return [{ key: ym, due: dueDate(ym, f.day) }];
    if (fr === "quincenal") return [...new Set([dueDate(ym, f.day || 15), dueDate(ym, f.day2 || 31)])].sort().map((d) => ({ key: d, due: d }));
    if (fr === "semanal") {
      const out = [];
      for (let d = addDays(`${ym}-01`, ((f.weekday ?? 1) - dow(`${ym}-01`) + 7) % 7); d.startsWith(ym); d = addDays(d, 7)) out.push({ key: d, due: d });
      return out;
    }
    if (fr === "unico") return f.start_date && ymOf(f.start_date) === ym ? [{ key: f.start_date, due: f.start_date }] : [];
    if (STEP[fr]) {
      if (!f.start_date) return [];
      const diff = monthsBetween(ymOf(f.start_date), ym);
      return diff >= 0 && diff % STEP[fr] === 0 ? [{ key: ym, due: dueDate(ym, f.day || Number(f.start_date.slice(8))) }] : [];
    }
    return [];
  }
  // Aplica reprogramaciones (move) y saltos (skip) y respeta la fecha final del pago.
  // overrides: { "<fixed_id>|<key>": { action: "skip"|"move", new_date } }
  function occurrences(f, ym, overrides = {}) {
    return baseOccurrences(f, ym).flatMap((o) => {
      const ov = overrides[`${f.id}|${o.key}`];
      if (ov?.action === "skip") return [];
      const due = ov?.action === "move" && ov.new_date ? ov.new_date : o.due;
      return [{ key: o.key, due, moved: ov?.action === "move" }];
    }).filter((o) => !f.end_date || o.due <= f.end_date);
  }

  // ---------- Saldos ----------
  // Saldo de una cuenta = saldo inicial + ingresos − gastos ± transferencias ± movimientos de deudas.
  // Las transferencias nunca cuentan como ingreso o gasto: solo mueven dinero entre cuentas.
  function accountBalanceC(a, movements, debts = [], debtPayments = []) {
    let c = toC(a.initial_balance);
    for (const m of movements) {
      const v = toC(m.amount);
      if (m.type === "ingreso" && m.account_id === a.id) c += v;
      else if (m.type === "gasto" && m.account_id === a.id) c -= v;
      else if (m.type === "transferencia") { if (m.account_id === a.id) c -= v; if (m.to_account_id === a.id) c += v; }
    }
    // Préstamos: «debo» = recibí el dinero (entra) y lo pago con abonos (sale); «me deben» = lo presté (sale) y me lo devuelven (entra)
    const dirOf = {};
    for (const d of debts) {
      dirOf[d.id] = d.direction;
      if (d.account_id === a.id && d.status !== "cancelada") c += d.direction === "debo" ? toC(d.principal) : -toC(d.principal);
    }
    for (const p of debtPayments) {
      if (p.account_id !== a.id || !dirOf[p.debt_id]) continue;
      c += dirOf[p.debt_id] === "debo" ? -toC(p.amount) : toC(p.amount);
    }
    return c;
  }
  // Totales de un periodo [from, to] (incluye ambos extremos). Las transferencias no cuentan.
  function totalsC(movements, from, to, debtPayments = [], debtsById = {}) {
    let inc = 0, exp = 0, fixedExp = 0;
    for (const m of movements) {
      if (m.date < from || m.date > to) continue;
      const v = toC(m.amount);
      if (m.type === "ingreso") inc += v;
      else if (m.type === "gasto") { exp += v; if (m.fixed_id) fixedExp += v; }
    }
    // Los intereses pagados de préstamos que debo sí son gasto (el capital no: es pago de deuda)
    for (const p of debtPayments) if (p.date >= from && p.date <= to && debtsById[p.debt_id]?.direction === "debo") exp += toC(p.interest);
    return { inc, exp, fixedExp, varExp: exp - fixedExp, net: inc - exp };
  }
  function byCategoryC(movements, from, to) {
    const o = {};
    for (const m of movements) if (m.type === "gasto" && m.date >= from && m.date <= to) o[m.category_id || "-"] = (o[m.category_id || "-"] || 0) + toC(m.amount);
    return o;
  }

  // ---------- Deudas y ahorros ----------
  // Saldo pendiente = importe inicial − (abonos − intereses)
  function debtBalanceC(d, payments) {
    const paid = payments.filter((p) => p.debt_id === d.id).reduce((s, p) => s + toC(p.amount) - toC(p.interest), 0);
    return Math.max(0, toC(d.principal) - paid);
  }
  const goalSavedC = (g, contributions) => contributions.filter((c) => c.goal_id === g.id).reduce((s, c) => s + toC(c.amount), 0);
  // Aportación necesaria por mes para llegar a la meta en la fecha objetivo
  function goalPlan(g, contributions, today) {
    const saved = goalSavedC(g, contributions), target = toC(g.target), left = Math.max(0, target - saved);
    const pct = target ? Math.min(1, saved / target) : 0;
    let perMonth = null, perWeek = null;
    if (g.target_date && left > 0) {
      const days = Math.max(1, daysBetween(today, g.target_date));
      perWeek = Math.ceil(left / Math.max(1, days / 7));
      perMonth = Math.ceil(left / Math.max(1, days / 30.4375));
    }
    // Fecha estimada con el ritmo de las aportaciones de los últimos 90 días
    const since = addDays(today, -90);
    const recent = contributions.filter((c) => c.goal_id === g.id && c.date >= since).reduce((s, c) => s + toC(c.amount), 0);
    const eta = left > 0 && recent > 0 ? addDays(today, Math.ceil(left / (recent / 90))) : null;
    return { saved, target, left, pct, perMonth, perWeek, eta };
  }

  // ---------- Presupuestos ----------
  function budgetPeriod(f, d) {
    const fr = freqOf(f), ym = ymOf(d);
    if (fr === "semanal") { const start = addDays(d, -((dow(d) - (f.weekday ?? 1) + 7) % 7)); return { start, end: addDays(start, 6) }; }
    if (fr === "quincenal") return Number(d.slice(8)) <= 15 ? { start: `${ym}-01`, end: `${ym}-15` } : { start: `${ym}-16`, end: dueDate(ym, 31) };
    if (fr === "anual") return { start: `${d.slice(0, 4)}-01-01`, end: `${d.slice(0, 4)}-12-31` };
    if (fr === "personalizado") return { start: f.start_date || d, end: f.end_date || f.start_date || d };
    return { start: `${ym}-01`, end: dueDate(ym, 31) };
  }
  function budgetUse(f, movements, d) {
    const p = budgetPeriod(f, d), limit = toC(f.amount);
    const spent = movements.filter((m) => m.type === "gasto" && m.category_id === f.category_id && m.date >= p.start && m.date <= p.end).reduce((s, m) => s + toC(m.amount), 0);
    return { ...p, limit, spent, left: limit - spent, pct: limit > 0 ? spent / limit : 0 };
  }
  // Umbral de alerta alcanzado: 50, 75, 90, 100 o más de 100 (101)
  const budgetLevel = (pct) => (pct > 1 ? 101 : pct >= 1 ? 100 : pct >= 0.9 ? 90 : pct >= 0.75 ? 75 : pct >= 0.5 ? 50 : 0);

  // ---------- Tarjetas de crédito ----------
  function creditInfoC(a, balanceC) {
    const used = Math.max(0, -balanceC), limit = toC(a.credit_limit);
    return { used, limit, avail: limit ? limit - used : null, pct: limit ? used / limit : 0, interest: a.apr ? Math.round(used * Number(a.apr) / 100 / 12) : 0 };
  }

  // ---------- Cortes de tarjeta ----------
  // Fecha de corte en la que entra una compra hecha el día d (si d es después del corte del mes, entra al del mes siguiente)
  const cutFor = (cutDay, d) => { const c = dueDate(ymOf(d), cutDay); return d <= c ? c : dueDate(addMonths(ymOf(d), 1), cutDay); };
  // Último corte ocurrido hasta el día d (incluido)
  const lastCutOn = (cutDay, d) => { const c = dueDate(ymOf(d), cutDay); return c <= d ? c : dueDate(addMonths(ymOf(d), -1), cutDay); };
  // Fecha límite de pago de un corte: el primer «día de pago» posterior al corte
  const payByFor = (cutDate, dueDay) => { const c = dueDate(ymOf(cutDate), dueDay); return c > cutDate ? c : dueDate(addMonths(ymOf(cutDate), 1), dueDay); };
  // ---------- Compras / deudas a meses ----------
  // Mensualidades en centavos: el residuo se reparte en las primeras para que la suma sea exacta (1160/3 → 386.67, 386.67, 386.66)
  function planInstallmentsC(plan) {
    const t = toC(plan.total), n = Math.max(1, plan.installments | 0), base = Math.floor(t / n), r = t - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < r ? 1 : 0));
  }
  // Mensualidades ya cobradas en cortes hasta la fecha de corte dada (incluido)
  const planBilledCount = (plan, cutDate) => Math.max(0, Math.min(plan.installments, monthsBetween(plan.first_month, ymOf(cutDate)) + 1));
  const planUnbilledC = (plan, cutDate) => planInstallmentsC(plan).slice(planBilledCount(plan, cutDate)).reduce((s, v) => s + v, 0);
  const activePlans = (plans, accountId) => (plans || []).filter((p) => p.account_id === accountId && p.status === "activo");

  // Estado de cuenta: lo que quedó al último corte (menos lo ya pagado después) se paga en la próxima fecha límite;
  // las compras posteriores al corte pasan al siguiente estado de cuenta.
  function statementC(a, movements, debts = [], debtPayments = [], today, plans = []) {
    if (!a.cut_day) return null;
    const lastCut = lastCutOn(a.cut_day, today), nextCut = dueDate(addMonths(ymOf(lastCut), 1), a.cut_day);
    const atCut = Math.max(0, -accountBalanceC(a, movements.filter((m) => m.date <= lastCut), debts.filter((d) => d.start_date <= lastCut), debtPayments.filter((p) => p.date <= lastCut)));
    const paidAfter = movements.filter((m) => m.type === "transferencia" && m.to_account_id === a.id && m.date > lastCut).reduce((s, m) => s + toC(m.amount), 0);
    const total = Math.max(0, -accountBalanceC(a, movements, debts, debtPayments));
    // Lo que sigue a meses sin cobrarse todavía no se paga en este corte (la deuda completa sí cuenta)
    const unbilled = activePlans(plans, a.id).reduce((s, p) => s + planUnbilledC(p, lastCut), 0);
    const statement = Math.max(0, Math.min(total, atCut - unbilled - paidAfter));
    // Siguiente corte: lo demás menos las mensualidades que se cobran en cortes posteriores
    const later = activePlans(plans, a.id).reduce((s, p) => s + planUnbilledC(p, nextCut), 0);
    const next = Math.max(0, total - statement - later);
    return { lastCut, nextCut, payBy: a.due_day ? payByFor(lastCut, a.due_day) : null, nextPayBy: a.due_day ? payByFor(nextCut, a.due_day) : null, statement, next, later: Math.max(0, total - statement - next), total };
  }

  // ---------- Dinero disponible ----------
  // Saldo total (cuentas que no son crédito) − dinero reservado en metas − compromisos pendientes = disponible real.
  // Los compromisos solo incluyen ocurrencias NO pagadas: lo ya pagado está descontado del saldo y no se cuenta dos veces.
  function availability({ liquidC, reservedC, commitmentsC }) {
    return { liquid: liquidC, reserved: reservedC, commitments: commitmentsC, available: liquidC - reservedC - commitmentsC };
  }

  const api = { toC, fromC, sumC, mulC, pad, ymOf, addMonths, daysInMonth, dueDate, dow, addDays, daysBetween, monthsBetween,
    PER_MONTH, freqOf, perMonthC, baseOccurrences, occurrences, accountBalanceC, totalsC, byCategoryC,
    debtBalanceC, goalSavedC, goalPlan, budgetPeriod, budgetUse, budgetLevel, creditInfoC, availability,
    cutFor, lastCutOn, payByFor, statementC, planInstallmentsC, planBilledCount, planUnbilledC, activePlans };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WCFin = api;
})(typeof self !== "undefined" ? self : this);
