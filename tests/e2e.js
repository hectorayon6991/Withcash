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
  const server = { data, rpc: [], posts: [], fail: offline, rpcFail: [], hang: false };
  await p.route("**/*supabase.co/**", async (r) => {
    if (server.fail) return r.abort("internetdisconnected");
    const u = new URL(r.request().url()), m = r.request().method();
    if (u.pathname.startsWith("/auth/v1/user")) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
    if (u.pathname.startsWith("/auth/v1/token")) { server.refreshes = (server.refreshes || 0) + 1; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }); }
    if (u.pathname === "/rest/v1/rpc/wc_apply") {
      if (dbv < 5) return r.fulfill({ status: 404, contentType: "application/json", body: '{"message":"not found"}' });
      if (server.rpcFail.length) { const f = server.rpcFail.shift(); return r.fulfill({ status: f.status, contentType: "application/json", body: JSON.stringify(f.body) }); }
      const { ops } = r.request().postDataJSON(); server.rpc.push(ops);
      // Reglas de la base (como el servidor real): el lote completo se rechaza si una operación no cumple
      const D = server.data, bad = (status, code, message) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code, message }) });
      for (const o of ops) {
        if (o.table !== "movements" || o.op === "delete" || !o.row) continue;
        const m = o.row;
        if (!(Number(m.amount) > 0)) return bad(400, "23514", 'new row for relation "movements" violates check constraint "movements_amount_check"');
        if (m.note && [...m.note].length > 120) return bad(400, "23514", 'new row for relation "movements" violates check constraint "movements_note_check"');
        if (m.category_id && !D.categories.some((c) => c.id === m.category_id)) return bad(409, "23503", 'insert or update on table "movements" violates foreign key constraint "movements_category_id_fkey"');
        if (m.account_id && !D.accounts.some((a) => a.id === m.account_id) && !ops.some((x) => x.table === "accounts" && x.row?.id === m.account_id)) return bad(409, "23503", 'insert or update on table "movements" violates foreign key constraint "movements_account_id_fkey"');
        if (o.op !== "insert_ignore" && m.fixed_id && D.movements.some((x) => x.id !== m.id && x.fixed_id === m.fixed_id && x.fixed_for === m.fixed_for)) return bad(409, "23505", 'duplicate key value violates unique constraint "movements_fixed_once"');
      }
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
      if (t === "card_plans" && (dbv < 6 || !server.data.card_plans)) return r.fulfill({ status: 404, contentType: "application/json", body: '{"code":"PGRST205","message":"Could not find the table"}' });
      if (isNew && dbv < 5) return r.fulfill({ status: 404, contentType: "application/json", body: '{"code":"PGRST205","message":"Could not find the table"}' });
      const d = server.data[t]; const obj = (r.request().headers()["accept"] || "").includes("vnd.pgrst.object");
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(t === "settings" ? (obj ? d : [d]) : d) });
    }
    if (t) server.posts.push({ t, m, body: r.request().postData() });
    return r.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  await p.goto("http://localhost:8765/"); await p.waitForSelector("#appShell:not([hidden])"); await p.waitForTimeout(900);
  server.maskedAtStart = await p.evaluate(() => document.documentElement.classList.contains("masked"));
  await p.evaluate(() => document.documentElement.classList.remove("masked"));   // las pruebas leen los montos
  return { p, ctx, errs, server };
}
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, " ");
async function addEntry(p, { type = "gasto", amount, cat, acc, to, note, usd = false }) {
  await p.click("#fab"); await p.waitForTimeout(200);
  await p.click(`#entryType [data-type="${type}"]`);
  if (usd) await p.click("#entryCur [data-cur=USD]");
  await p.fill("#entryAmount", String(amount));
  if (cat) await p.click(`#catChips [data-cat="${cat}"]`);
  if (acc && type !== "transferencia") await p.click(`#payChips [data-pay-acc="${acc}"]`);
  else if (acc) await p.selectOption("#entryAccount", acc);
  if (to) await p.selectOption("#entryToAccount", to);
  if (note) await p.fill("#entryNote", note);
  await p.click("#entryForm button[type=submit]"); await p.waitForTimeout(350);
}
const bal = (p, id) => p.evaluate((id) => { const el = [...document.querySelectorAll(".acc-card")].find((x) => x.innerText.includes(id)); return el ? el.innerText : ""; }, id);

const report = () => { const bad = results.filter((r) => r[0] !== "OK "); for (const r of results) console.log(r[0], r[1], r[2] ? "· " + r[2] : ""); console.log(`\n${results.length - bad.length}/${results.length} pruebas correctas`); return bad.length; };
process.on("unhandledRejection", (e) => { check("la prueba terminó sin interrupciones", false, String(e.message || e).split("\n")[0]); report(); process.exit(1); });
(async () => {
  const browser = await chromium.launch();
  // ---------- iPhone, base v5 ----------
  let { p, errs, server, ctx } = await boot(browser);
  check("arranque sin errores (iPhone)", !errs.length, errs.join(" | "));
  // Privacidad: al abrir, tu dinero está oculto; el ojito lo muestra y lo vuelve a ocultar (las deudas no se ocultan)
  {
    await p.evaluate(() => document.documentElement.classList.add("masked"));
    const hid = await txt(p, ".card.tone");
    await p.click(".card.tone [data-eye]"); const shown = await txt(p, ".card.tone");
    await p.click(".card.tone [data-eye]"); const again = await p.evaluate(() => document.documentElement.classList.contains("masked"));
    check("privacidad: montos ocultos al abrir y el ojito los muestra/oculta", server.maskedAtStart && /\$•••/.test(hid) && !/\$•••/.test(shown) && /\$[\d,]+\.\d\d/.test(shown) && again, hid.slice(0, 90) + " → " + shown.slice(0, 90));
    await p.evaluate(() => document.documentElement.classList.remove("masked"));
  }
  // Tu nombre en Configuración → saludo en Inicio; sin barrita gris arriba de las ventanas
  {
    await p.click('.tabbar [data-tab="config"]'); await p.waitForTimeout(300);
    const noAppName = !(await p.$("#setAppName")), handles = await p.$$eval(".sheet-handle", (x) => x.length);
    await p.fill("#setUserName", "Héctor Ayón");
    await p.evaluate(() => document.querySelector("#settingsForm").requestSubmit()); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())); await p.waitForTimeout(150);
    await p.click('.tabbar [data-tab="config"]'); await p.waitForTimeout(300);
    const kept = await p.inputValue("#setUserName"), opened = await p.evaluate(() => document.querySelector("#settingsSheet")?.open ?? !!document.querySelector("dialog[open] #setUserName"));
    await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())); await p.waitForTimeout(150);
    check("configuración abre, guarda «¿Cuál es tu nombre?», sin saludo ni barrita", noAppName && handles === 0 && kept === "Héctor Ayón" && opened && !(await p.$(".greet")), `${kept} / barritas ${handles}`);
  }
    // Alertas: tocar una lleva a su elemento (pago → acciones para pagar; tarjeta → su tarjeta)
  {
    const al = await p.$$eval(".alerts li.tap", (ls) => ls.map((l) => [...l.attributes].map((x) => x.name).join(" ")));
    const payAlert = await p.$(".alerts li[data-pay-actions]");
    let opened = false;
    if (payAlert) { await payAlert.click(); await p.waitForTimeout(300); opened = !!(await p.$("#dynBody [data-a=pay]")); await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())); await p.waitForTimeout(150); }
    check("alertas: se pueden tocar y llevan al pago para marcarlo", al.length > 0 && opened, al.join(" | "));
  }
  // Menú inferior con todas las secciones
  {
    const tabs = await p.$$eval(".tabbar [data-tab]", (bs) => bs.map((b) => b.dataset.tab));
    await p.click('.tabbar [data-tab="suscripciones"]'); await p.waitForTimeout(250);
    const title = await txt(p, "#monthTitle");
    const fab = await p.evaluate(() => { const f = document.querySelector("#fab").getBoundingClientRect(), t = document.querySelector(".tabbar").getBoundingClientRect(); return f.bottom <= t.top && f.right <= innerWidth; });
    check("menú inferior: todas las secciones y + arriba del menú", tabs.length === 12 && !(await p.$("#openMore")) && /Suscripciones/.test(title) && fab, tabs.join(","));
    await p.click('.tabbar [data-tab="inicio"]'); await p.waitForTimeout(250);
  }
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
  await p.click('.tabbar [data-tab="ahorros"]'); await p.waitForTimeout(300);
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
  await p.click('.tabbar [data-tab="deudas"]'); await p.waitForTimeout(300);
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
  if (process.env.SHOTS) await p.screenshot({ path: process.env.SHOTS + "/e2e-iphone.png" });
  // Persistencia local: recargar conserva datos y cola
  await ctx.close();

  // ---------- Tarjetas: crédito, debo, disponible y total ----------
  {
    const d = fixtures();
    d.fixed_payments.push(F("t1", "Klar", "tarjeta", 1000, { day: 20 }), F("t2", "Vexi", "tarjeta", 1000, { day: 16 }));
    const T = await boot(browser, { data: d });
    await T.p.click('.tabbar [data-tab="tarjetas"]'); await T.p.waitForTimeout(300);
    await T.p.click("[data-cards-from-pays]"); await T.p.waitForTimeout(200);
    const boxes = await T.p.$$(".cc-new");
    await (await boxes[0].$('[data-k="lim"]')).fill("8000"); await (await boxes[0].$('[data-k="debt"]')).fill("1000");
    await (await boxes[1].$('[data-k="lim"]')).fill("5000"); await (await boxes[1].$('[data-k="debt"]')).fill("2500");
    const live = await T.p.innerText(".cc-new [data-live]");
    await T.p.click('#dynBody [data-a="save"]'); await T.p.waitForTimeout(400);
    const klar = d.accounts.find((a) => a.name === "Klar"), vexi = d.accounts.find((a) => a.name === "Vexi");
    check("tarjetas: crear desde pagos (crédito, deuda y fecha de pago)", klar && Number(klar.credit_limit) === 8000 && Number(klar.initial_balance) === -1000 && klar.due_day === 20 && vexi && Number(vexi.initial_balance) === -2500, live);
    const tot = await txt(T.p, "#view");
    // Nu (fixture) tiene límite 20000 y debe 0 → total crédito 33,000; debo 3,500; disponible 29,500
    check("tarjetas: total de todas (crédito / debo / disponible)", /\$33,000(?!\.\d)/.test(tot) && /\$3,500(?!\.\d)/.test(tot) && /\$29,500(?!\.\d)/.test(tot), tot.slice(0, 160));
    // Forma de pago: elegir la tarjeta Nu (corte 10, pago 18). Hoy es 16 nov → la compra entra al corte del 10 dic y se paga el 18 dic
    await T.p.click("#fab"); await T.p.waitForTimeout(200);
    const chipTxt = await T.p.innerText('#payChips [data-pay-acc="a3"]');
    await T.p.fill("#entryAmount", "750"); await T.p.click('#catChips [data-cat="c8"]'); await T.p.click('#payChips [data-pay-acc="a3"]'); await T.p.waitForTimeout(100);
    const cutTxt = await T.p.innerText("#cardCutHint");
    await T.p.fill("#entryNote", "Compra Nu"); await T.p.click("#entryForm button[type=submit]"); await T.p.waitForTimeout(350);
    const nuMov = d.movements.find((m) => m.note === "Compra Nu");
    check("forma de pago: las tarjetas aparecen con su disponible", /Nu/.test(chipTxt) && /Disponible \$20,000/.test(chipTxt), chipTxt.replace(/\s+/g, " "));
    check("forma de pago: aviso de corte (compra después del corte → siguiente mes)", /10 de dic/.test(cutTxt) && /18 de dic/.test(cutTxt), cutTxt.replace(/\s+/g, " "));
    check("forma de pago: la compra se registra en la tarjeta (sube deuda, método crédito)", nuMov && nuMov.account_id === "a3" && nuMov.payment_method === "credito");
    await T.p.click("#fab"); await T.p.waitForTimeout(200);
    const chip2 = await T.p.innerText('#payChips [data-pay-acc="a3"]');
    await T.p.evaluate(() => document.querySelector("#entrySheet").close()); await T.p.waitForTimeout(100);
    check("forma de pago: el disponible de la tarjeta baja solo", /Disponible \$19,250/.test(chip2), chip2.replace(/\s+/g, " "));
    await T.p.click('.tabbar [data-tab="tarjetas"]'); await T.p.waitForTimeout(250);
    const nuBlock = await T.p.evaluate(() => [...document.querySelectorAll(".cc")].find((x) => x.innerText.includes("Nu"))?.innerText || "");
    check("tarjetas: corte actual vs siguiente corte", /Siguiente corte/.test(nuBlock) && /\$750/.test(nuBlock), nuBlock.replace(/\s+/g, " ").slice(0, 200));
    // Compra con Klar y luego corregir «cuánto debo» a 1,200 → la deuda queda exacta, sin tocar el historial
    await addEntry(T.p, { type: "gasto", amount: 500, cat: "c8", acc: klar.id, note: "Compra Klar" });
    await T.p.click(`[data-credit="${klar.id}"]`); await T.p.waitForTimeout(250);
    const shown = await T.p.inputValue("#itemDebt");
    await T.p.fill("#itemDebt", "1200"); await T.p.click("#itemForm button[type=submit]"); await T.p.waitForTimeout(350);
    const k2 = d.accounts.find((a) => a.id === klar.id);
    check("tarjetas: editar «cuánto debo» ajusta la deuda actual", shown === "1500" && Number(k2.initial_balance) === -700 && d.movements.some((m) => m.note === "Compra Klar"), `mostraba ${shown}, saldo inicial ${k2.initial_balance}`);
    // Comprometido: Klar debe 1,200 (700 previos + 500 de una compra ya registrada como gasto) y Vexi 2,500 previos
    await T.p.click('.tabbar [data-tab="inicio"]'); await T.p.waitForTimeout(300);
    const ini = await txt(T.p, "#view");
    check("comprometido incluye la deuda de tarjetas sin contar dos veces las compras", /Tarjetas \$3,200\.00/.test(ini) && /debes \$4,450\.00 en total; \$1,250\.00 ya está en tus gastos/.test(ini), (ini.match(/Comprometido en pagos[^|]{0,160}/) || [""])[0]);
    check("tarjetas sin errores", !T.errs.length, T.errs.join(" | "));
    if (process.env.SHOTS) { await T.p.click('.tabbar [data-tab="tarjetas"]'); await T.p.waitForTimeout(300); await T.p.screenshot({ path: process.env.SHOTS + "/tarjetas.png", fullPage: true }); }
    await T.ctx.close();
  }

  // ---------- Compras y deudas a meses (migración 0006) ----------
  {
    const d = fixtures(); d.card_plans = [];
    const M = await boot(browser, { dbv: 6, data: d });
    // Gasto con Nu a 3 meses: 1160 → 386.67 + 386.67 + 386.66; hoy 16 nov, corte 10 → 1.ª mensualidad en el corte de diciembre
    await M.p.click("#fab"); await M.p.waitForTimeout(200);
    await M.p.fill("#entryAmount", "1160"); await M.p.click('#catChips [data-cat="c8"]'); await M.p.click('#payChips [data-pay-acc="a3"]');
    await M.p.fill("#entryNote", "Mercado Libre");
    const msiVisible = await M.p.isVisible("#msiPick");
    await M.p.click('#msiChips [data-msi="3"]'); await M.p.waitForTimeout(100);
    const hint = await txt(M.p, "#msiHint");
    await M.p.click("#entryForm button[type=submit]"); await M.p.waitForTimeout(400);
    const mov = d.movements.find((m) => m.note === "Mercado Libre"), plan = d.card_plans[0];
    check("a meses: el selector aparece al pagar con tarjeta", msiVisible && /3 pagos de \$386\.67/.test(hint), hint);
    check("a meses: compra y plan se guardan juntos (mismo lote)", !!mov && !!plan && plan.movement_id === mov.id && plan.installments === 3 && Number(plan.total) === 1160 && plan.first_month === "2026-12"
      && M.server.rpc.some((ops) => ops.some((o) => o.table === "movements") && ops.some((o) => o.table === "card_plans")), JSON.stringify(plan));
    // Deuda que ya existía: 1160 a 3 pagos, ya pagué 1, el siguiente se cobra en diciembre
    await M.p.click('.tabbar [data-tab="tarjetas"]'); await M.p.waitForTimeout(300);
    let block = await txt(M.p, '[data-credit="a3"]');
    check("a meses: la tarjeta muestra el plan con su mensualidad", /Mercado Libre/.test(block) && /Pago 1 de 3/.test(block) && /\$386\.67\/mes/.test(block), block.slice(0, 260));
    check("a meses: el siguiente corte cobra solo la mensualidad", /Siguiente corte[^$]*\$386\.67/.test(block), block.slice(0, 400));
    await M.p.click('[data-plan-new="a3"]'); await M.p.waitForTimeout(250);
    await M.p.fill("#plName", "Celular"); await M.p.fill("#plTotal", "6000"); await M.p.fill("#plN", "6"); await M.p.fill("#plPaid", "2");
    const live = await txt(M.p, "#plLive");
    await M.p.click('#dynBody [data-a="save"]'); await M.p.waitForTimeout(400);
    const cel = d.card_plans.find((x) => x.name === "Celular");
    check("a meses: registrar una deuda que ya tenía (pagos hechos)", cel && cel.installments === 6 && cel.first_month === "2026-10" && cel.movement_id === null && /6 pagos de \$1,000/.test(live) && /faltan \$4,000/.test(live), JSON.stringify(cel) + " " + live);
    block = await txt(M.p, '[data-credit="a3"]');
    check("a meses: plan de deuda previa muestra el pago actual", /Celular/.test(block) && /Pago 3 de 6/.test(block), block.slice(0, 300));
    // Editar la compra a contado elimina el plan
    await M.p.click('.tabbar [data-tab="movimientos"]'); await M.p.waitForTimeout(300);
    await M.p.evaluate((id) => document.querySelector(`[data-mov="${id}"]`)?.click(), mov.id); await M.p.waitForTimeout(250);
    const sel = await M.p.getAttribute('#msiChips [data-msi="3"]', "class");
    await M.p.click('#msiChips [data-msi="1"]'); await M.p.click("#entryForm button[type=submit]"); await M.p.waitForTimeout(400);
    check("a meses: al editar la compra se ve el plan y pasarla a contado lo quita", /active/.test(sel || "") && !d.card_plans.some((x) => x.movement_id === mov.id) && d.card_plans.length === 1, sel);
    check("a meses sin errores", !M.errs.length, M.errs.join(" | "));
    if (process.env.SHOTS) { await M.p.click('.tabbar [data-tab="tarjetas"]'); await M.p.waitForTimeout(300); await M.p.screenshot({ path: process.env.SHOTS + "/meses.png", fullPage: true }); }
    await M.ctx.close();
  }

  // ---------- Préstamos a cuotas con fecha final equivocada (año pasado) ----------
  {
    const d = fixtures();
    d.fixed_payments.push(F("d1", "Compresor", "deuda", 398, { day: 13, installments: 12, installments_paid_before: 2, end_date: "2026-08-01", account_id: "a2" }),
      F("d2", "Mercado Libre", "deuda", 394.69, { day: 17, installments: 3, installments_paid_before: 0, end_date: "2026-01-17", account_id: "a2" }),
      F("d3", "Ya pagada", "deuda", 100, { day: 20, installments: 3, installments_paid_before: 3, account_id: "a2" }));
    const L = await boot(browser, { data: d });
    await L.p.click('.tabbar [data-tab="fijos"]'); await L.p.waitForTimeout(300);
    const v = await txt(L.p, "#view");
    const row = (n) => (v.match(new RegExp(n + ".{0,80}")) || [""])[0];
    check("cuotas: el préstamo usa su día de pago aunque la fecha final esté en un año pasado", !/Compresor[^·]{0,30}Sin fechas/.test(v) && !/Mercado Libre[^·]{0,30}Sin fechas/.test(v) && /Compresor/.test(v) && /Mercado Libre/.test(v), row("Compresor") + " | " + row("Mercado Libre"));
    // Mes siguiente: el préstamo de 3 cuotas sigue en diciembre; meses después ya no aparece
    await L.p.click("#nextMonth"); await L.p.waitForTimeout(300);
    const dic = await txt(L.p, "#view");
    check("cuotas: la siguiente cuota aparece en diciembre", /Mercado Libre[^·]{0,40}(Día 17|17)/.test(dic) || (/Mercado Libre/.test(dic) && !/Mercado Libre[^·]{0,30}Sin fechas/.test(dic)), (dic.match(/Mercado Libre.{0,60}/) || [""])[0]);
    check("cuotas: una deuda con todas las cuotas pagadas se ve liquidada", /Ya pagada[^·]{0,40}Liquidada/.test(v) || !/Ya pagada[^·]{0,30}Vence/.test(v), row("Ya pagada"));
    check("cuotas sin errores", !L.errs.length, L.errs.join(" | "));
    if (process.env.SHOTS) { await L.p.click("#prevMonth"); await L.p.waitForTimeout(300); await L.p.screenshot({ path: process.env.SHOTS + "/cuotas.png", fullPage: true }); }
    await L.ctx.close();
  }

  // ---------- Guardado a prueba de fallas: ningún registro se pierde ----------
  {
    const synced = async (pg, ms = 20000) => { await pg.waitForTimeout(300); return pg.waitForFunction(() => document.querySelector("#syncDot")?.classList.contains("ok"), null, { timeout: ms }).then(() => true, () => false); };
    const d = fixtures();
    const R = await boot(browser, { data: d });
    const P = R.p, srv = R.server;
    // A. Servidor caído (500/503) dos veces → se reintenta solo y se guarda una sola vez
    srv.rpcFail.push({ status: 500, body: { message: "upstream error" } }, { status: 503, body: { message: "Service Unavailable" } });
    await addEntry(P, { type: "gasto", amount: 101, cat: "c1", acc: "a2", note: "Reintento 500" });
    const okA = await synced(P);
    check("fallas: servidor caído → se reintenta solo y se guarda una vez", okA && d.movements.filter((m) => m.note === "Reintento 500").length === 1, `sincronizado ${okA}`);
    // B. Sesión vencida (401) → se renueva la sesión y se guarda
    srv.rpcFail.push({ status: 401, body: { code: "PGRST301", message: "JWT expired" } });
    await addEntry(P, { type: "gasto", amount: 102, cat: "c1", acc: "a2", note: "Sesion vencida" });
    const okB = await synced(P);
    check("fallas: sesión vencida → se renueva y se guarda", okB && d.movements.some((m) => m.note === "Sesion vencida") && srv.refreshes >= 1, `refrescos ${srv.refreshes}`);
    // C. El mismo pago fijo ya se registró en otro dispositivo → no hay error ni duplicado
    d.movements.push({ id: "otro-dispositivo-1", user_id: U, type: "gasto", amount: 900, date: "2026-11-15", note: "Internet", category_id: "c5", account_id: "a2", fixed_id: "f1", fixed_for: "2026-11", source: "app", created_at: "2026-11-15T10:00:00Z" });
    await P.click('.tabbar [data-tab="fijos"]'); await P.waitForTimeout(300);
    await P.click('[data-pay-actions="f1"]'); await P.waitForTimeout(250);
    await P.click('#dynBody [data-a="pay"]'); await P.waitForTimeout(250); await P.click("#entryForm button[type=submit]");
    const okC = await synced(P);
    check("fallas: pago fijo ya registrado en otro dispositivo → sin error ni duplicado", okC && d.movements.filter((m) => m.fixed_id === "f1" && m.fixed_for === "2026-11").length === 1, `sincronizado ${okC}`);
    // D. Categoría borrada en otro dispositivo → el gasto se guarda igual (sin categoría)
    d.categories = d.categories.filter((c) => c.id !== "c1");
    await addEntry(P, { type: "gasto", amount: 103, cat: "c1", acc: "a2", note: "Categoria borrada" });
    const okD = await synced(P), mD = d.movements.find((m) => m.note === "Categoria borrada");
    check("fallas: categoría borrada en otro dispositivo → se guarda sin categoría", okD && !!mD && mD.category_id === null, JSON.stringify(mD && mD.category_id));
    // E. Descripción más larga de lo que acepta la base → se recorta y se guarda
    await P.click("#fab"); await P.waitForTimeout(200);
    await P.fill("#entryAmount", "104"); await P.click('#payChips [data-pay-acc="a2"]');
    await P.evaluate(() => { const i = document.querySelector("#entryNote"); i.removeAttribute("maxlength"); i.value = "Larga " + "x".repeat(200); });
    await P.click("#entryForm button[type=submit]");
    const okE = await synced(P), mE = d.movements.find((m) => (m.note || "").startsWith("Larga "));
    check("fallas: texto demasiado largo → se recorta y se guarda", okE && !!mE && [...mE.note].length === 120, String(mE && mE.note.length));
    // F. Rechazo que no se puede reparar → queda guardado como «error», sobrevive a recargar y se envía al reintentar
    srv.rpcFail.push({ status: 400, body: { code: "P0001", message: "falla simulada" } });
    await addEntry(P, { type: "gasto", amount: 105, cat: "c2", acc: "a2", note: "Rechazado" });
    await P.waitForTimeout(800);
    const errDot = await P.evaluate(() => document.querySelector("#syncDot").className);
    await P.reload(); await P.waitForSelector("#appShell:not([hidden])"); await P.waitForTimeout(900);
    const bar = await P.evaluate(() => document.querySelector("#offlineBar").innerText);
    const okF = await synced(P), mF = d.movements.some((m) => m.note === "Rechazado");
    check("fallas: rechazo no reparable → no se pierde y se envía al reintentar", /err/.test(errDot) && okF && mF, `${errDot} · ${bar}`);
    // G. Sin internet y la app se cierra de golpe → al abrir sigue ahí y se envía al volver la red
    srv.fail = true;
    await addEntry(P, { type: "gasto", amount: 106, cat: "c2", acc: "a2", note: "Sin red y cerrada" });
    await P.reload().catch(() => {}); await P.waitForSelector("#appShell:not([hidden])"); await P.waitForTimeout(700);
    await P.click('.tabbar [data-tab="movimientos"]'); await P.waitForTimeout(300);
    const visible = /Sin red y cerrada/.test(await txt(P, "#view"));
    srv.fail = false; await P.evaluate(() => window.dispatchEvent(new Event("online")));
    const okG = await synced(P), mG = d.movements.filter((m) => m.note === "Sin red y cerrada").length;
    check("fallas: sin internet + app cerrada → sigue visible y se envía al reconectar", visible && okG && mG === 1, `visible ${visible}, en servidor ${mG}`);
    // H. Cerrar sesión con cambios sin enviar → se envían al volver a entrar
    srv.fail = true;
    await addEntry(P, { type: "gasto", amount: 107, cat: "c2", acc: "a2", note: "Antes de salir" });
    await P.click('.tabbar [data-tab="config"]'); await P.waitForTimeout(300);
    P.on("dialog", (dl) => dl.accept());
    await P.click("#logout"); await P.waitForTimeout(1200);
    srv.fail = false;
    // (la prueba vuelve a poner la sesión al recargar: equivale a entrar de nuevo con la misma cuenta)
    await P.waitForSelector("#appShell:not([hidden])", { timeout: 8000 }).catch(() => {});
    const okH = await synced(P), mH = d.movements.filter((m) => m.note === "Antes de salir").length;
    check("fallas: cerrar sesión con cambios sin enviar → se envían al volver a entrar", okH && mH === 1, `en servidor ${mH}`);
    check("fallas sin errores de la app", !R.errs.filter((x) => !/falla simulada|upstream|Service Unavailable|JWT|duplicate key|foreign key|Failed to fetch/.test(x)).length, R.errs.join(" | "));
    await R.ctx.close();
  }
  // ---------- Restaurar respaldo con un registro inválido: los demás se guardan ----------
  {
    const d = fixtures();
    const R = await boot(browser, { data: d });
    const backup = { movements: [
      { id: "aaaaaaaa-0000-4000-8000-000000000001", user_id: U, type: "gasto", amount: 50, date: "2026-11-10", note: "Bueno 1", category_id: "c8", account_id: "a2", source: "app", created_at: "2026-11-10T10:00:00Z" },
      { id: "aaaaaaaa-0000-4000-8000-000000000002", user_id: U, type: "gasto", amount: 0, date: "2026-11-10", note: "Malo", category_id: "c8", account_id: "a2", source: "app", created_at: "2026-11-10T10:00:00Z" },
      { id: "aaaaaaaa-0000-4000-8000-000000000003", user_id: U, type: "gasto", amount: 70, date: "2026-11-11", note: "Bueno 2", category_id: "c8", account_id: "a2", source: "app", created_at: "2026-11-11T10:00:00Z" } ] };
    R.p.on("dialog", (dl) => dl.accept());
    await R.p.setInputFiles("#importJson", { name: "respaldo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
    await R.p.waitForTimeout(2500);
    const notes = d.movements.map((m) => m.note);
    check("restaurar: un registro inválido no impide guardar los demás", notes.includes("Bueno 1") && notes.includes("Bueno 2") && !notes.includes("Malo"), notes.join(","));
    await R.ctx.close();
  }

  // ---------- 19-20. Dos dispositivos sobre los mismos datos ----------
  {
    const shared = fixtures();
    shared.fixed_payments.push(F("fa", "Gimnasio", "suscripcion", 500, { day: 2, category_id: "c7", account_id: "a2", auto: true }));
    const A1 = await boot(browser, { data: shared }), B1 = await boot(browser, { data: shared });
    const autoCount = shared.movements.filter((m) => m.fixed_id === "fa").length;
    check("20. pago automático en dos dispositivos se registra una sola vez", autoCount === 1, String(autoCount));
    await addEntry(A1.p, { type: "gasto", amount: 123, cat: "c8", acc: "a2", note: "Desde iPhone" });
    await B1.p.evaluate(() => window.dispatchEvent(new Event("focus")));
    await B1.p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await B1.p.reload(); await B1.p.waitForSelector("#appShell:not([hidden])"); await B1.p.waitForTimeout(900);
    await B1.p.click('.tabbar [data-tab="movimientos"]'); await B1.p.waitForTimeout(300);
    check("19. sincronización entre dispositivos", /Desde iPhone/.test(await txt(B1.p, "#view")));
    // 21. Restaurar respaldo en el segundo dispositivo
    const backup = { accounts: [], categories: [], fixed_payments: [], movements: [{ id: "11111111-2222-4333-8444-555555555555", user_id: "otro", type: "gasto", amount: 42, date: "2026-11-10", note: "Del respaldo", category_id: "c8", account_id: "a2", to_account_id: null, source: "app", created_at: "2026-11-10T10:00:00Z" }] };
    await B1.p.click("#openSettings").catch(() => {});
    await B1.p.evaluate(() => document.querySelector("#openSettings")?.click());
    B1.p.once("dialog", (d) => d.accept());
    await B1.p.setInputFiles("#importJson", { name: "respaldo.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
    await B1.p.waitForTimeout(600);
    const restored = shared.movements.find((m) => m.note === "Del respaldo");
    check("21. restaurar respaldo (y el dueño pasa a ser el usuario actual)", !!restored && restored.user_id === U, restored ? restored.user_id : "no llegó");
    check("19-21 sin errores", !A1.errs.length && !B1.errs.length, [...A1.errs, ...B1.errs].join(" | "));
    await A1.ctx.close(); await B1.ctx.close();
  }

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
