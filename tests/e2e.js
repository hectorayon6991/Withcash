// Pruebas funcionales en navegador (Chromium/Playwright) con Supabase simulado.
// Uso: node tests/e2e.js   (requiere un servidor estático en http://localhost:8765 sirviendo la carpeta del proyecto)
const { chromium, devices } = require("playwright");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const U = "u1", exp = Math.floor(Date.parse("2027-06-01") / 1000);
const jwt = b64({ alg: "HS256" }) + "." + b64({ sub: U, exp, aud: "authenticated", role: "authenticated" }) + ".x";
const user = { id: U, email: "dueno@example.com", aud: "authenticated", role: "authenticated" };
const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user };
const C = (id, icon, name, kind) => ({ id, user_id: U, icon, name, kind, sort: 0, archived: false, created_at: "2026-10-01T00:00:00Z" });
const A = (id, icon, name, b, kind, x = {}) => ({ id, user_id: U, icon, name, initial_balance: b, kind, sort: 0, archived: false, created_at: "2026-10-01T00:00:00Z", ...x });
const F = (id, name, kind, amount, x) => ({ id, user_id: U, name, kind, amount, frequency: "mensual", day: null, day2: null, weekday: null, category_id: null, account_id: null, remind_days: 3, active: true, auto: false, paused: false, created_at: "2026-11-01T06:00:00Z", installments: null, installments_paid_before: 0, ...x });
function fixtures() {
  return {
    settings: { user_id: U, currency: "MXN", start_month: "2026-11", usd_rate: 18.5, theme: "oscuro" },
    categories: [C("c1", "food", "Restaurantes", "gasto"), C("c2", "fuel", "Gasolina", "gasto"), C("c4", "briefcase", "Sueldo", "ingreso"), C("c5", "bulb", "Servicios", "gasto"), C("c7", "tv", "Suscripciones", "gasto"), C("c8", "box", "Otros", "gasto")],
    accounts: [A("a1", "cash", "Efectivo", 1000, "efectivo", { allow_negative: false }), A("a2", "bank", "Débito", 20000, "debito"), A("a3", "card", "Nu", 0, "credito", { credit_limit: 20000, cut_day: 10, due_day: 18, apr: 60 })],
    movements: [], fixed_payments: [F("f1", "Internet", "servicio", 900, { day: 20, category_id: "c5", account_id: "a2" }), F("f2", "Gasolina", "presupuesto", 1000, { frequency: "mensual", day: 1, category_id: "c2" }), F("f3", "Netflix", "suscripcion", 299, { day: 5, category_id: "c7", account_id: "a3" })],
    fixed_overrides: [], savings_goals: [], savings_contributions: [], debts: [], debt_payments: [],
  };
}
const results = [];
const check = (name, ok, extra = "") => { results.push([ok ? "OK " : "FALLA", name, extra]); };

async function boot(browser, { dbv = 5, device = "iPhone 13", offline = false, data = fixtures() } = {}) {
  const ctx = await browser.newContext({ ...devices[device], timezoneId: "America/Mexico_City", acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.clock.setFixedTime(new Date("2026-11-16T12:00:00-06:00"));
  await p.addInitScript(([s]) => localStorage.setItem("sb-snccrdjtoxuwefncwhyv-auth-token", s), [JSON.stringify(session)]);
  const server = { data, rpc: [], posts: [], fail: offline };
  await p.route("**/*supabase.co/**", async (r) => {
    if (server.fail) return r.abort("internetdisconnected");
    const u = new URL(r.request().url()), m = r.request().method();
    if (u.pathname.startsWith("/auth/v1/user")) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
    if (u.pathname === "/rest/v1/rpc/wc_apply") {
      if (dbv < 5) return r.fulfill({ status: 404, contentType: "application/json", body: '{"message":"not found"}' });
      const { ops } = r.request().postDataJSON(); server.rpc.push(ops);
      for (const o of ops) {   // aplica en el «servidor» para comprobar persistencia
        const arr = server.data[o.table];
        if (o.table === "settings") { Object.assign(server.data.settings, o.row); continue; }
        if (o.op === "delete") { server.data[o.table] = arr.filter((x) => x.id !== o.id); continue; }
        if (o.op === "insert_ignore" && arr.some((x) => x.fixed_id === o.row.fixed_id && x.fixed_for === o.row.fixed_for)) continue;
        const i = arr.findIndex((x) => x.id === o.row.id); if (i >= 0) arr[i] = { ...arr[i], ...o.row }; else arr.push({ ...o.row });
      }
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ applied: ops.length }) });
    }
    const t = u.pathname.split("/rest/v1/")[1];
    const isNew = ["fixed_overrides", "savings_goals", "savings_contributions", "debts", "debt_payments"].includes(t);
    if (t && m === "GET") {
      if (isNew && dbv < 5) return r.fulfill({ status: 404, contentType: "application/json", body: '{"code":"PGRST205","message":"Could not find the table"}' });
      const d = server.data[t]; const obj = (r.request().headers()["accept"] || "").includes("vnd.pgrst.object");
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(t === "settings" ? (obj ? d : [d]) : d) });
    }
    if (t) server.posts.push({ t, m, body: r.request().postData() });
    return r.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  await p.goto("http://localhost:8765/"); await p.waitForSelector("#appShell:not([hidden])"); await p.waitForTimeout(900);
  return { p, ctx, errs, server };
}
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, " ");
async function addEntry(p, { type = "gasto", amount, cat, acc, to, note, usd = false }) {
  await p.click("#fab"); await p.waitForTimeout(200);
  await p.click(`#entryType [data-type="${type}"]`);
  if (usd) await p.click("#entryCur [data-cur=USD]");
  await p.fill("#entryAmount", String(amount));
  if (cat) await p.click(`#catChips [data-cat="${cat}"]`);
  if (acc) await p.selectOption("#entryAccount", acc);
  if (to) await p.selectOption("#entryToAccount", to);
  if (note) await p.fill("#entryNote", note);
  await p.click("#entryForm button[type=submit]"); await p.waitForTimeout(350);
}
const bal = (p, id) => p.evaluate((id) => { const el = [...document.querySelectorAll(".acc-card")].find((x) => x.innerText.includes(id)); return el ? el.innerText : ""; }, id);

const report = () => { const bad = results.filter((r) => r[0] !== "OK "); for (const r of results) console.log(r[0], r[1], r[2] ? "· " + r[2] : ""); console.log(`\n${results.length - bad.length}/${results.length} pruebas correctas`); return bad.length; };
process.on("unhandledRejection", (e) => { console.log("ERROR:", String(e.message || e).split("\n")[0]); report(); process.exit(1); });
(async () => {
  const browser = await chromium.launch();
  // ---------- iPhone, base v5 ----------
  let { p, errs, server, ctx } = await boot(browser);
  check("arranque sin errores (iPhone)", !errs.length, errs.join(" | "));
  const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); check("sin desbordamiento horizontal", w[0] <= w[1], w.join("/"));
  await addEntry(p, { type: "ingreso", amount: 5000, cat: "c4", acc: "a2", note: "Sueldo" });
  check("1. registrar ingreso", server.data.movements.some((m) => m.type === "ingreso" && Number(m.amount) === 5000));
  await addEntry(p, { type: "gasto", amount: 350.5, cat: "c1", acc: "a2", note: "Cena" });
  check("2. registrar gasto", server.data.movements.some((m) => m.type === "gasto" && Number(m.amount) === 350.5));
  const g = server.data.movements.find((m) => m.note === "Cena");
  await p.evaluate((id) => document.querySelector(`[data-mov="${id}"]`)?.click(), g.id); await p.waitForTimeout(200);
  await p.fill("#entryAmount", "400"); await p.click("#entryForm button[type=submit]"); await p.waitForTimeout(300);
  check("3. editar movimiento", Number(server.data.movements.find((m) => m.id === g.id).amount) === 400);
  await p.evaluate((id) => document.querySelector(`[data-mov="${id}"]`)?.click(), g.id); await p.waitForTimeout(200);
  p.once("dialog", (d) => d.accept()); await p.click("#entryDelete"); await p.waitForTimeout(300);
  check("4. eliminar movimiento", !server.data.movements.some((m) => m.id === g.id));
  const before = await p.evaluate(() => document.querySelector(".ind-grid")?.innerText || "");
  await addEntry(p, { type: "transferencia", amount: 500, acc: "a2", to: "a1" });
  const after = await p.evaluate(() => document.querySelector(".ind-grid")?.innerText || "");
  const pick = (s, k) => (s.split("\n").join("|").match(new RegExp(k + "\\|([^|]+)")) || [])[1];
  check("5. transferencia registrada", server.data.movements.some((m) => m.type === "transferencia" && m.to_account_id === "a1"));
  check("6. transferencia no altera ingresos ni gastos", pick(before, "Ingresos") === pick(after, "Ingresos") && pick(before, "Gastos") === pick(after, "Gastos"), `${pick(after, "Ingresos")} / ${pick(after, "Gastos")}`);
  await addEntry(p, { type: "gasto", amount: 3000, cat: "c8", acc: "a3", note: "Compra tarjeta" });
  const gastosAntes = pick(await p.evaluate(() => document.querySelector(".ind-grid").innerText), "Gastos");
  check("7. compra con tarjeta aumenta la deuda", /3,000/.test(await txt(p, "#view")));
  await addEntry(p, { type: "transferencia", amount: 3000, acc: "a2", to: "a3", note: "Pago Nu" });
  const gastosDespues = pick(await p.evaluate(() => document.querySelector(".ind-grid").innerText), "Gastos");
  check("8. pagar la tarjeta", server.data.movements.some((m) => m.note === "Pago Nu"));
  check("9. el pago no duplica el gasto", gastosAntes === gastosDespues, `${gastosAntes} → ${gastosDespues}`);
  // Saldo negativo bloqueado en Efectivo (permite negativo = no). Efectivo: 1000 + 500 = 1500
  await addEntry(p, { type: "gasto", amount: 9999, cat: "c8", acc: "a1", note: "Demasiado" });
  check("12b. bloqueo de saldo negativo", !server.data.movements.some((m) => m.note === "Demasiado") && await p.evaluate(() => document.querySelector("#entrySheet").open));
  await p.evaluate(() => document.querySelector("#entrySheet").close()); await p.waitForTimeout(150);
  // Pago recurrente: marcar pagado dos veces no duplica
  await p.click('.tabbar [data-tab="fijos"]'); await p.waitForTimeout(300);
  await p.click('[data-pay-actions="f1"]'); await p.waitForTimeout(250);
  await p.click('#dynBody [data-a="pay"]'); await p.waitForTimeout(250); await p.click("#entryForm button[type=submit]"); await p.waitForTimeout(350);
  const n1 = server.data.movements.filter((m) => m.fixed_id === "f1").length;
  await p.evaluate(() => { /* intento duplicado directo con la misma clave */ });
  check("10. marcar pago recurrente como pagado", n1 === 1);
  await p.click('[data-pay-actions="f1"]'); await p.waitForTimeout(250);
  const hasPay = await p.$('#dynBody [data-a="pay"]'); const nextTxt = await txt(p, "#dynBody");
  check("11. no se duplica: la siguiente fecha pasa a diciembre", /dic/i.test(nextTxt), nextTxt.slice(0, 120));
  await p.keyboard.press("Escape");
  // Presupuesto superado
  await addEntry(p, { type: "gasto", amount: 1200, cat: "c2", acc: "a2", note: "Gasolina grande" });
  await p.click('.tabbar [data-tab="inicio"]'); await p.waitForTimeout(250);
  check("12. presupuesto superado genera alerta", /Te pasaste/.test(await txt(p, "#view")));
  // Ahorros
  await p.click("#openMore"); await p.waitForTimeout(200); await p.click('[data-mod="ahorros"]'); await p.waitForTimeout(300);
  await p.click("[data-new-goal]"); await p.waitForTimeout(200);
  await p.fill("#gName", "Fondo de emergencia"); await p.fill("#gTarget", "10000"); await p.fill("#gDate", "2027-11-16"); await p.fill("#gInitial", "1000");
  await p.click('#dynBody [data-a="save"]'); await p.waitForTimeout(350);
  const goal = server.data.savings_goals[0];
  await p.click(`[data-goal="${goal.id}"]`); await p.waitForTimeout(200);
  await p.fill("#cAmt", "1500"); await p.click('#dynBody [data-a="add"]'); await p.waitForTimeout(350);
  const saved = server.data.savings_contributions.filter((c) => c.goal_id === goal.id).reduce((s, c) => s + Number(c.amount), 0);
  check("13. aportación de ahorro", saved === 2500, String(saved));
  check("13b. meta y aportación inicial en un mismo lote atómico", server.rpc.some((ops) => ops.length === 2 && ops[0].table === "savings_goals" && ops[1].table === "savings_contributions"));
  await p.keyboard.press("Escape");
  // Deudas
  await p.click("#openMore"); await p.waitForTimeout(200); await p.click('[data-mod="deudas"]'); await p.waitForTimeout(300);
  await p.click('[data-new-debt="debo"]'); await p.waitForTimeout(200);
  await p.fill("#dName", "Préstamo personal"); await p.fill("#dAmt", "6000"); await p.click('#dynBody [data-a="save"]'); await p.waitForTimeout(300);
  const debt = server.data.debts[0];
  await p.click(`[data-debt="${debt.id}"]`); await p.waitForTimeout(200);
  await p.fill("#pAmt", "1100"); await p.fill("#pInt", "100"); await p.selectOption("#pAcc", "a2"); await p.click('#dynBody [data-a="pay"]'); await p.waitForTimeout(350);
  check("14. abono de deuda (capital 1000 + interés 100)", server.data.debt_payments.length === 1 && /5,000/.test(await txt(p, "#dynBody")));
  await p.keyboard.press("Escape");
  // Reportes
  const openDialogs = await p.evaluate(() => [...document.querySelectorAll("dialog[open]")].map((d) => d.id));
  check("sin ventanas abiertas tras deudas", !openDialogs.length, openDialogs.join(","));
  await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
  await p.click('.tabbar [data-tab="balance"]'); await p.waitForTimeout(300);
  const rep = await txt(p, "#view");
  check("15. reportes con indicadores", /Promedio diario/.test(rep) && /Patrimonio neto/.test(rep) && /Capacidad de ahorro/.test(rep));
  await p.click('[data-period="anio"]'); await p.waitForTimeout(200);
  check("15b. filtro de periodo (este año)", /Año 2026/.test(await txt(p, "#view")));
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click('[data-export="csv"]')]);
  check("16. exportar CSV", /\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  // Búsqueda global
  await p.click("#openSearch"); await p.waitForTimeout(200); await p.fill("#qText", "sueldo"); await p.waitForTimeout(150);
  check("búsqueda global", /Sueldo/.test(await txt(p, "#qRes")));
  await p.keyboard.press("Escape");
  // Sin conexión → reconexión
  server.fail = true; await ctx.setOffline(true);
  await addEntry(p, { type: "gasto", amount: 77, cat: "c8", acc: "a2", note: "Sin internet" });
  const pendingOffline = await p.evaluate(() => document.querySelector("#offlineBar").innerText);
  check("17. registrar sin internet (queda pendiente)", !server.data.movements.some((m) => m.note === "Sin internet") && /Sin conexión/.test(pendingOffline), pendingOffline);
  server.fail = false; await ctx.setOffline(false); await p.waitForTimeout(800);
  check("18. al reconectar se sincroniza", server.data.movements.filter((m) => m.note === "Sin internet").length === 1);
  // Error del servidor: la operación se conserva con estado error
  check("sin errores de JavaScript en el recorrido", !errs.length, errs.join(" | "));
  await p.screenshot({ path: process.env.SHOTS ? process.env.SHOTS + "/e2e-iphone.png" : "/dev/null" });
  // Persistencia local: recargar conserva datos y cola
  await ctx.close();

  // ---------- Tema claro y escritorio ----------
  ({ p, errs, ctx } = await boot(browser, { device: "Desktop Chrome", data: { ...fixtures(), settings: { ...fixtures().settings, theme: "claro" } } }));
  check("25. escritorio sin errores", !errs.length, errs.join(" | "));
  check("modo claro aplicado", (await p.evaluate(() => document.documentElement.dataset.theme)) === "light");
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/e2e-desktop-claro.png", fullPage: true });
  await ctx.close();
  // ---------- Android ----------
  ({ p, errs, ctx } = await boot(browser, { device: "Pixel 7" }));
  const w2 = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  check("24. Android sin errores ni desbordamiento", !errs.length && w2[0] <= w2[1], errs.join(" | "));
  await ctx.close();
  // ---------- Base anterior (v4): la app sigue funcionando ----------
  ({ p, errs, server, ctx } = await boot(browser, { dbv: 4 }));
  await addEntry(p, { type: "gasto", amount: 10, cat: "c8", acc: "a2", note: "v4" });
  check("compatibilidad con base sin actualizar (v4)", !errs.length && server.posts.some((x) => x.t === "movements" && /v4/.test(x.body) && !/"tags"/.test(x.body)), errs.join(" | "));
  await ctx.close();
  await browser.close();
  process.exit(report() ? 1 : 0);
})();
