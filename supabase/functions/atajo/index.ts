// WithCash — endpoint para Atajos de iPhone.
// La autenticación usa la llave personal (?k=... o encabezado x-key) que se genera en la app;
// en la base de datos solo se guarda su hash SHA-256.
//
// GET  ?k=KEY&lista=cuentas|categorias|ingresos|fijos   -> una opción por línea
// GET  ?k=KEY&resumen=avisos|mes                        -> texto (vacío si no hay avisos)
// POST ?k=KEY  {tipo, monto, nota, cuenta, categoria, fijo, destino, fecha}
//      tipo: gasto | ingreso | transferencia | fijo
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
  const acc = accounts ?? [], cat = cats ?? [], fx = fixed ?? [];

  // Pagos fijos ya marcados este mes y el siguiente
  const { data: paidRows } = await db.from("movements").select("fixed_id,fixed_for")
    .eq("user_id", uid).not("fixed_id", "is", null).in("fixed_for", [addMonths(ym, -1), ym, addMonths(ym, 1)]);
  const paid = new Set((paidRows ?? []).map((r) => `${r.fixed_id}|${r.fixed_for}`));
  const nextPending = (f: { id: string; day: number }) => {
    const m = paid.has(`${f.id}|${ym}`) ? addMonths(ym, 1) : ym;
    const due = dueDate(m, f.day);
    return { month: m, due, days: daysBetween(today, due) };
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
        const n = nextPending(f);
        // también avisa si quedó sin pagar el mes anterior
        const prev = addMonths(ym, -1);
        const prevDue = dueDate(prev, f.day);
        if (!paid.has(`${f.id}|${prev}`) && Date.parse(f.created_at) < Date.parse(prevDue + "T00:00:00Z")) {
          out.push(`⚠️ ${f.name}: quedó pendiente de ${MESES[Number(prev.slice(5)) - 1]} (${money(Number(f.amount))})`);
        }
        if (n.days > f.remind_days) continue;
        const when = n.days < 0 ? `venció hace ${-n.days} día${n.days === -1 ? "" : "s"}`
          : n.days === 0 ? "vence HOY" : n.days === 1 ? "vence mañana" : `vence en ${n.days} días`;
        out.push(`${n.days <= 0 ? "⚠️" : "🔔"} ${f.name} ${when} (${money(Number(f.amount))})`);
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
      const pend = fx.filter((f) => !paid.has(`${f.id}|${ym}`));
      const pendAmt = pend.reduce((s, f) => s + Number(f.amount), 0);
      return text(
        `📊 ${MESES[Number(ym.slice(5)) - 1]}\n` +
        `Ingresos: ${money(inc)}\nGastos: ${money(exp)}\nDisponible: ${money(inc - exp)}\n` +
        (pend.length ? `Pagos fijos pendientes: ${pend.length} (${money(pendAmt)})` : "✅ Pagos fijos del mes al corriente"),
      );
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
      type: "gasto", fixed_id: f.id, fixed_for: n.month,
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
  const label = row.fixed_id ? "Pago registrado" : tipo === "ingreso" ? "Ingreso guardado" : tipo === "transferencia" ? "Transferencia guardada" : "Gasto guardado";
  const parts = [money(amount), row.note, catName, accName].filter(Boolean).join(" · ");
  return text(`✅ ${label}: ${parts}\nEste mes: gastos ${money(exp)} · disponible ${money(inc - exp)}`);
});
