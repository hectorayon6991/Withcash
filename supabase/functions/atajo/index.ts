// WithCash — endpoint para Atajos de iPhone.
// La autenticación usa la llave personal (?k=... o encabezado x-key) que se genera en la app;
// en la base de datos solo se guarda su hash SHA-256.
//
// GET  ?k=KEY&lista=cuentas|categorias|ingresos|fijos   -> una opción por línea (fijos = pagos e ingresos fijos)
// GET  ?k=KEY&resumen=avisos|mes                        -> texto (vacío si no hay avisos)
// POST ?k=KEY  {tipo, monto, nota, cuenta, categoria, fijo, destino, fecha}
//      tipo: gasto | ingreso | transferencia | fijo
// Fijos (fixed_payments.kind): pagos (servicio, tarjeta, suscripcion, deuda), ingreso (sueldo) y presupuesto
// (tope por periodo de una categoría). frequency: mensual (day) | quincenal (day, day2) | semanal (weekday 0–6).
// La ocurrencia pagada se guarda en movements.fixed_for: "YYYY-MM" (mensual) o "YYYY-MM-DD" (quincenal/semanal).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-key",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// "🍔 Comida" -> "comida"; "Débito" -> "debito"
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function parseAmount(v: unknown): number {
  let s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) {
    s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lc > -1) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/,/g, ".") : s.replace(/,/g, "");
  }
  return Math.round(parseFloat(s) * 100) / 100;
}

function todayIn(tz: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  }
}
const ymOf = (d: string) => d.slice(0, 7);
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function dueDate(ym: string, day: number) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
function addDays(d: string, n: number) {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const fmtDate = (d: string) => `${Number(d.slice(8))} ${MESES[Number(d.slice(5, 7)) - 1].slice(0, 3)}`;

type Fixed = {
  id: string; name: string; kind: string; amount: number; frequency?: string | null;
  day: number | null; day2: number | null; weekday: number | null; remind_days: number;
  category_id: string | null; account_id: string | null; created_at: string;
};
const freqOf = (f: Fixed) => f.frequency || "mensual";
const isBudget = (f: Fixed) => f.kind === "presupuesto";
const isIncome = (f: Fixed) => f.kind === "ingreso";
function occurrences(f: Fixed, ym: string) {
  const fr = freqOf(f);
  if (fr === "mensual") return [{ key: ym, due: dueDate(ym, f.day ?? 1) }];
  if (fr === "quincenal") {
    return [...new Set([dueDate(ym, f.day || 15), dueDate(ym, f.day2 || 31)])].sort().map((d) => ({ key: d, due: d }));
  }
  const out: { key: string; due: string }[] = [];
  const first = `${ym}-01`;
  for (let d = addDays(first, ((f.weekday ?? 1) - dow(first) + 7) % 7); d.startsWith(ym); d = addDays(d, 7)) out.push({ key: d, due: d });
  return out;
}
function budgetPeriod(f: Fixed, d: string) {
  const fr = freqOf(f), ym = ymOf(d);
  if (fr === "semanal") {
    const start = addDays(d, -((dow(d) - (f.weekday ?? 1) + 7) % 7));
    return { start, end: addDays(start, 6), label: "esta semana" };
  }
  if (fr === "quincenal") {
    return Number(d.slice(8)) <= 15
      ? { start: `${ym}-01`, end: `${ym}-15`, label: "esta quincena" }
      : { start: `${ym}-16`, end: dueDate(ym, 31), label: "esta quincena" };
  }
  return { start: `${ym}-01`, end: dueDate(ym, 31), label: "este mes" };
}

function findByName<T extends { name: string }>(rows: T[], q: unknown): T | undefined {
  const n = norm(q);
  if (!n) return undefined;
  return rows.find((r) => norm(r.name) === n) ?? rows.find((r) => norm(r.name).startsWith(n) || n.startsWith(norm(r.name)));
}

async function readParams(req: Request, url: URL) {
  const p: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (p[k.toLowerCase()] = v));
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") ?? "";
    try {
      if (ct.includes("application/json")) {
        const j = await req.json();
        for (const [k, v] of Object.entries(j ?? {})) p[k.toLowerCase()] = String(v ?? "");
      } else if (ct.includes("form")) {
        const f = await req.formData();
        f.forEach((v, k) => (p[k.toLowerCase()] = String(v)));
      }
    } catch { /* cuerpo vacío o inválido: usamos solo la URL */ }
  }
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const p = await readParams(req, url);
  const key = p.k || p.key || req.headers.get("x-key") || "";
  if (key.length < 20) return text("Falta la llave de WithCash (parámetro k).", 401);

  const { data: kr } = await db.from("api_keys").select("user_id").eq("key_hash", await sha256(key)).maybeSingle();
  if (!kr) return text("Llave inválida. Genera una nueva en WithCash → Ajustes → Atajos.", 401);
  const uid = kr.user_id as string;

  const [{ data: st }, { data: accounts }, { data: cats }, { data: fixed }] = await Promise.all([
    db.from("settings").select("*").eq("user_id", uid).maybeSingle(),
    db.from("accounts").select("id,name,icon").eq("user_id", uid).eq("archived", false).order("sort"),
    db.from("categories").select("id,name,icon,kind").eq("user_id", uid).eq("archived", false).order("sort"),
    db.from("fixed_payments").select("*").eq("user_id", uid).eq("active", true).order("day"),
  ]);
  const tz = st?.timezone || "America/Mexico_City";
  const currency = st?.currency || "MXN";
  const money = (n: number) => {
    try { return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(n); }
    catch { return "$" + n.toFixed(2); }
  };
  const today = todayIn(tz);
  const ym = ymOf(today);
  const acc = accounts ?? [], cat = cats ?? [];
  const allFixed = (fixed ?? []) as Fixed[];
  const fx = allFixed.filter((f) => !isBudget(f));          // pagos e ingresos fijos
  const budgets = allFixed.filter(isBudget);

  // Ocurrencias ya marcadas desde hace tres meses ("YYYY-MM" y "YYYY-MM-DD" se ordenan bien como texto)
  const { data: paidRows } = await db.from("movements").select("fixed_id,fixed_for")
    .eq("user_id", uid).not("fixed_id", "is", null).gte("fixed_for", addMonths(ym, -3));
  const paid = new Set((paidRows ?? []).map((r) => `${r.fixed_id}|${r.fixed_for}`));
  const isPaid = (f: Fixed, key: string) => paid.has(`${f.id}|${key}`);
  const localDate = (iso: string) => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso)); }
    catch { return String(iso).slice(0, 10); }
  };
  // Una ocurrencia cuenta si ya está pagada, o si no es anterior al mes de inicio del control (settings.start_month)
  // ni a la creación del fijo (en mensual sí cuenta el mes en que se creó). Igual que counts() en js/app.js.
  const startMonth: string | null = st?.start_month || null;
  const counts = (f: Fixed, o: { key: string; due: string }) => {
    if (isPaid(f, o.key)) return true;
    if (startMonth && o.due < `${startMonth}-01`) return false;
    const since = localDate(f.created_at);
    return o.due >= since || (freqOf(f) === "mensual" && o.key === since.slice(0, 7));
  };
  // Sin pagar de hace tres meses a dos adelante (nunca antes del inicio del control). Igual que pendingOcc() en js/app.js.
  const pendingOcc = (f: Fixed) =>
    [-3, -2, -1, 0, 1, 2].map((n) => addMonths(ym, n)).flatMap((m) => occurrences(f, m))
      .filter((o) => counts(f, o) && !isPaid(f, o.key));
  // La más antigua sin pagar de este mes en adelante
  const nextPending = (f: Fixed) => {
    const pend = pendingOcc(f);
    const o = pend.find((x) => x.due >= `${ym}-01`) ?? pend.at(-1) ?? occurrences(f, addMonths(ym, 3))[0];
    return { key: o.key, due: o.due, days: daysBetween(today, o.due) };
  };
  // Saldo que pasa de los meses anteriores (ingresos − gastos) desde el inicio del control. Igual que carryIn() en js/app.js.
  const carryIn = async () => {
    if (!startMonth || ym <= startMonth) return 0;
    const { data } = await db.from("movements").select("type,amount").eq("user_id", uid)
      .gte("date", `${startMonth}-01`).lt("date", `${ym}-01`);
    return (data ?? []).reduce((s, m) => s + (m.type === "ingreso" ? Number(m.amount) : m.type === "gasto" ? -Number(m.amount) : 0), 0);
  };
  const budgetText = (f: Fixed, spent: number) => {
    const p = budgetPeriod(f, today), left = Number(f.amount) - spent;
    return left >= 0 ? `${f.name}: quedan ${money(left)} ${p.label}` : `⚠️ ${f.name}: te pasaste ${money(-left)} ${p.label}`;
  };
  const spentIn = async (f: Fixed) => {
    const p = budgetPeriod(f, today);
    const { data } = await db.from("movements").select("amount").eq("user_id", uid).eq("type", "gasto")
      .eq("category_id", f.category_id).gte("date", p.start).lte("date", p.end);
    return (data ?? []).reduce((s, m) => s + Number(m.amount), 0);
  };

  // ---------- Listas para los menús del Atajo ----------
  if (p.lista) {
    const l = norm(p.lista);
    let lines: string[] = [];
    if (l.startsWith("cuenta")) lines = acc.map((a) => `${a.icon} ${a.name}`);
    else if (l.startsWith("ingreso")) lines = cat.filter((c) => c.kind === "ingreso").map((c) => `${c.icon} ${c.name}`);
    else if (l.startsWith("categor") || l.startsWith("gasto")) lines = cat.filter((c) => c.kind === "gasto").map((c) => `${c.icon} ${c.name}`);
    else if (l.startsWith("fijo")) {
      lines = fx.map((f) => ({ f, n: nextPending(f) }))
        .sort((a, b) => a.n.days - b.n.days)
        .map(({ f }) => f.name);
    } else return text("Lista desconocida. Usa: cuentas, categorias, ingresos o fijos.", 400);
    return text(lines.join("\n"));
  }

  // ---------- Resúmenes ----------
  if (p.resumen) {
    const r = norm(p.resumen);
    if (r.startsWith("aviso")) {
      const out: string[] = [];
      for (const f of fx) {
        const pend = pendingOcc(f);
        const amt = money(Number(f.amount));
        if (isIncome(f)) {
          // Ingresos: aviso el día que llega y si quedó alguno sin registrar
          for (const o of pend.filter((x) => x.due < today).slice(-3)) out.push(`💼 ${f.name} del ${fmtDate(o.due)}: ¿ya llegó? Regístralo (${amt})`);
          const n = pend.find((x) => x.due >= today);
          if (n && n.due === today) out.push(`💼 Hoy llega ${f.name} (${amt})`);
          continue;
        }
        // Pagos atrasados (hasta 3) y el siguiente si está dentro de los días de aviso
        for (const o of pend.filter((x) => x.due < today).slice(-3)) {
          const d = -daysBetween(today, o.due);
          out.push(`⚠️ ${f.name} ${freqOf(f) === "mensual" ? `de ${MESES[Number(o.key.slice(5, 7)) - 1]}` : `del ${fmtDate(o.due)}`}: venció hace ${d} día${d === 1 ? "" : "s"} (${amt})`);
        }
        const n = pend.find((x) => x.due >= today);
        if (!n) continue;
        const days = daysBetween(today, n.due);
        if (days > f.remind_days) continue;
        const when = days === 0 ? "vence HOY" : days === 1 ? "vence mañana" : `vence en ${days} días`;
        out.push(`${days === 0 ? "⚠️" : "🔔"} ${f.name} ${when} (${amt})`);
      }
      // Presupuestos excedidos o casi agotados (≥ 90 %)
      for (const f of budgets) {
        const spent = await spentIn(f);
        if (spent >= Number(f.amount) * 0.9 && Number(f.amount) > 0) out.push("🎯 " + budgetText(f, spent));
      }
      return text(out.join("\n"));
    }
    if (r.startsWith("mes")) {
      const { data: mv } = await db.from("movements").select("type,amount")
        .eq("user_id", uid).gte("date", `${ym}-01`).lte("date", dueDate(ym, 31));
      let inc = 0, exp = 0;
      for (const m of mv ?? []) {
        if (m.type === "ingreso") inc += Number(m.amount);
        if (m.type === "gasto") exp += Number(m.amount);
      }
      // Ocurrencias de este mes sin marcar
      const pendOf = (list: Fixed[]) => list.flatMap((f) => occurrences(f, ym).filter((o) => counts(f, o) && !isPaid(f, o.key)).map(() => Number(f.amount)));
      const pend = pendOf(fx.filter((f) => !isIncome(f))), pendInc = pendOf(fx.filter(isIncome));
      const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
      const carry = await carryIn();
      const late = fx.filter((f) => !isIncome(f)).flatMap((f) => pendingOcc(f).filter((o) => o.due < `${ym}-01`).map(() => Number(f.amount)));
      const lines = [
        `📊 ${MESES[Number(ym.slice(5)) - 1]}`,
        `Ingresos: ${money(inc)}`, `Gastos: ${money(exp)}`,
        ...(carry ? [`Viene de meses anteriores: ${money(carry)}`] : []),
        `Disponible: ${money(inc - exp + carry)}`,
        pend.length ? `Pagos fijos pendientes: ${pend.length} (${money(sum(pend))})` : "✅ Pagos fijos del mes al corriente",
      ];
      if (late.length) lines.push(`⏰ Atrasados de meses anteriores: ${late.length} (${money(sum(late))})`);
      if (pendInc.length) lines.push(`Ingresos fijos por recibir: ${money(sum(pendInc))}`);
      for (const f of budgets) lines.push("🎯 " + budgetText(f, await spentIn(f)));
      return text(lines.join("\n"));
    }
    return text("Resumen desconocido. Usa: avisos o mes.", 400);
  }

  // ---------- Registrar movimiento ----------
  if (req.method !== "POST") return text("Para registrar usa el método POST.", 405);

  let tipo = norm(p.tipo || "gasto");
  if (tipo.startsWith("transf")) tipo = "transferencia";
  else if (tipo.startsWith("ingres")) tipo = "ingreso";
  else if (tipo.startsWith("fij") || tipo.startsWith("recurr")) tipo = "fijo";
  else tipo = "gasto";

  const date = /^\d{4}-\d{2}-\d{2}$/.test(p.fecha ?? "") ? p.fecha : today;
  let amount = parseAmount(p.monto ?? p.cantidad ?? p.amount);
  const account = findByName(acc, p.cuenta);
  const row: Record<string, unknown> = {
    user_id: uid, date, source: "atajo",
    note: (p.nota ?? p.concepto ?? "").trim().slice(0, 120) || null,
    account_id: account?.id ?? null,
  };

  if (tipo === "fijo") {
    const f = findByName(fx, p.fijo ?? p.pago ?? p.nota);
    if (!f) return text(`No encontré el pago fijo "${p.fijo ?? ""}".`, 400);
    if (!(amount > 0)) amount = Number(f.amount);
    const n = nextPending(f);
    Object.assign(row, {
      type: isIncome(f) ? "ingreso" : "gasto", fixed_id: f.id, fixed_for: n.key,
      category_id: f.category_id, account_id: account?.id ?? f.account_id,
      note: row.note ?? f.name,
    });
  } else if (tipo === "transferencia") {
    const to = findByName(acc, p.destino ?? p.a);
    if (!account || !to) return text("Para transferir indica cuenta (origen) y destino.", 400);
    Object.assign(row, { type: "transferencia", to_account_id: to.id });
  } else {
    const kindCats = cat.filter((c) => c.kind === tipo);
    const c = findByName(kindCats, p.categoria ?? p.tipo_gasto) ?? findByName(kindCats, "Otros");
    Object.assign(row, { type: tipo, category_id: c?.id ?? null });
  }

  if (!(amount > 0)) return text("El monto no es válido.", 400);
  row.amount = amount;

  const { error } = await db.from("movements").insert(row);
  if (error) return text("No se pudo guardar: " + error.message, 500);

  // Respuesta para mostrar en la notificación del Atajo
  const { data: mv } = await db.from("movements").select("type,amount")
    .eq("user_id", uid).gte("date", `${ym}-01`).lte("date", dueDate(ym, 31));
  let inc = 0, exp = 0;
  for (const m of mv ?? []) {
    if (m.type === "ingreso") inc += Number(m.amount);
    if (m.type === "gasto") exp += Number(m.amount);
  }
  const catName = cat.find((c) => c.id === row.category_id)?.name;
  const accName = acc.find((a) => a.id === row.account_id)?.name;
  const label = row.fixed_id ? (row.type === "ingreso" ? "Ingreso fijo registrado" : "Pago registrado") : tipo === "ingreso" ? "Ingreso guardado" : tipo === "transferencia" ? "Transferencia guardada" : "Gasto guardado";
  const parts = [money(amount), row.note, catName, accName].filter(Boolean).join(" · ");
  // Si el gasto cae en una categoría con presupuesto, dice cuánto queda
  const extra: string[] = [];
  if (row.type === "gasto") {
    for (const f of budgets.filter((b) => b.category_id && b.category_id === row.category_id)) extra.push("🎯 " + budgetText(f, await spentIn(f)));
  }
  const carry = await carryIn();
  return text(`✅ ${label}: ${parts}\nEste mes: gastos ${money(exp)} · disponible ${money(inc - exp + carry)}` + (extra.length ? "\n" + extra.join("\n") : ""));
});
