// Pruebas unitarias del motor financiero. Ejecutar:  node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../js/finance.js");

const A = (id, initial = 0, extra = {}) => ({ id, initial_balance: initial, ...extra });
const M = (type, amount, date, x = {}) => ({ id: Math.random().toString(36).slice(2), type, amount, date, ...x });

test("centavos: sin errores de punto flotante", () => {
  assert.equal(F.toC("0.1") + F.toC("0.2"), 30);
  assert.equal(F.sumC([0.1, 0.2, 0.3]), 60);
  assert.equal(F.sumC(Array(1000).fill("19.99")), 1999000);
  assert.equal(F.toC("1,234.56".replace(/,/g, "")), 123456);
  assert.equal(F.mulC(F.toC(10), 18.5), 18500);           // US$10 a 18.5 = $185.00
});

test("1-2. ingreso y gasto actualizan saldo y totales", () => {
  const acc = A("deb", 1000);
  const mv = [M("ingreso", 5000, "2026-11-01", { account_id: "deb" }), M("gasto", 1250.5, "2026-11-02", { account_id: "deb" })];
  assert.equal(F.accountBalanceC(acc, mv), F.toC(1000 + 5000 - 1250.5));
  const t = F.totalsC(mv, "2026-11-01", "2026-11-30");
  assert.deepEqual([t.inc, t.exp, t.net], [500000, 125050, 374950]);
});

test("3-4. editar y eliminar un movimiento recalculan todo", () => {
  const acc = A("ef", 0);
  let mv = [M("gasto", 100, "2026-11-05", { id: "x", account_id: "ef" })];
  mv = mv.map((m) => (m.id === "x" ? { ...m, amount: 150 } : m));
  assert.equal(F.accountBalanceC(acc, mv), -15000);
  mv = mv.filter((m) => m.id !== "x");
  assert.equal(F.accountBalanceC(acc, mv), 0);
});

test("5-6. transferencia mueve dinero y NO cuenta como ingreso ni gasto", () => {
  const ef = A("ef", 2000), deb = A("deb", 0);
  const mv = [M("transferencia", 500, "2026-11-03", { account_id: "ef", to_account_id: "deb" })];
  assert.equal(F.accountBalanceC(ef, mv), 150000);
  assert.equal(F.accountBalanceC(deb, mv), 50000);
  const t = F.totalsC(mv, "2026-11-01", "2026-11-30");
  assert.equal(t.inc, 0); assert.equal(t.exp, 0);
});

test("7-9. compra con tarjeta = gasto + deuda; pagarla no duplica el gasto", () => {
  const nu = A("nu", 0, { kind: "credito", credit_limit: 20000, apr: 60 }), deb = A("deb", 10000);
  const mv = [
    M("gasto", 3000, "2026-11-04", { account_id: "nu" }),                                  // compra con tarjeta
    M("transferencia", 3000, "2026-11-20", { account_id: "deb", to_account_id: "nu" }),   // pago de la tarjeta
  ];
  const before = F.creditInfoC(nu, F.accountBalanceC(nu, mv.slice(0, 1)));
  assert.equal(before.used, 300000); assert.equal(before.avail, 1700000);
  assert.equal(before.interest, 15000);                                                   // 3000 × 60% / 12 = 150
  const after = F.creditInfoC(nu, F.accountBalanceC(nu, mv));
  assert.equal(after.used, 0);
  assert.equal(F.accountBalanceC(deb, mv), 700000);
  assert.equal(F.totalsC(mv, "2026-11-01", "2026-11-30").exp, 300000);                   // un solo gasto
});

test("10-11. pagos recurrentes: una ocurrencia por fecha, sin duplicados", () => {
  const men = { id: "f1", frequency: "mensual", day: 31 };
  assert.deepEqual(F.occurrences(men, "2026-02"), [{ key: "2026-02", due: "2026-02-28", moved: false }]);
  const q = { id: "f2", frequency: "quincenal", day: 15, day2: 31 };
  assert.deepEqual(F.occurrences(q, "2026-11").map((o) => o.due), ["2026-11-15", "2026-11-30"]);
  const s = { id: "f3", frequency: "semanal", weekday: 1 };
  assert.equal(F.occurrences(s, "2026-11").length, 5);                                   // lunes de nov 2026
  const tri = { id: "f4", frequency: "trimestral", day: 10, start_date: "2026-01-10" };
  assert.deepEqual(["2026-01", "2026-02", "2026-03", "2026-04"].map((m) => F.occurrences(tri, m).length), [1, 0, 0, 1]);
  const anu = { id: "f5", frequency: "anual", day: 1, start_date: "2026-03-01" };
  assert.equal(F.occurrences(anu, "2027-03").length, 1);
  assert.equal(F.occurrences(anu, "2027-04").length, 0);
  const uni = { id: "f6", frequency: "unico", start_date: "2026-12-24" };
  assert.equal(F.occurrences(uni, "2026-12")[0].key, "2026-12-24");
  // claves únicas → el índice (fixed_id, fixed_for) impide duplicados
  const keys = q.frequency && F.occurrences(q, "2026-11").map((o) => o.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("reprogramar y saltar ocurrencias; fecha final", () => {
  const f = { id: "f1", frequency: "mensual", day: 5, end_date: "2026-12-31" };
  const ov = { "f1|2026-11": { action: "move", new_date: "2026-11-09" }, "f1|2026-12": { action: "skip" } };
  assert.deepEqual(F.occurrences(f, "2026-11", ov), [{ key: "2026-11", due: "2026-11-09", moved: true }]);
  assert.deepEqual(F.occurrences(f, "2026-12", ov), []);
  assert.deepEqual(F.occurrences(f, "2027-01", ov), []);
});

test("12. presupuesto superado y umbrales de alerta", () => {
  const b = { frequency: "semanal", weekday: 1, amount: 850, category_id: "gas" };
  const mv = [M("gasto", 600, "2026-11-10", { category_id: "gas" }), M("gasto", 300, "2026-11-12", { category_id: "gas" }), M("gasto", 999, "2026-11-08", { category_id: "gas" })];
  const u = F.budgetUse(b, mv, "2026-11-13");
  assert.equal(u.start, "2026-11-09"); assert.equal(u.spent, 90000); assert.equal(u.left, -5000);
  assert.equal(F.budgetLevel(u.pct), 101);
  assert.deepEqual([0.49, 0.5, 0.8, 0.95, 1, 1.2].map(F.budgetLevel), [0, 50, 75, 90, 100, 101]);
  const anual = F.budgetPeriod({ frequency: "anual" }, "2026-07-01");
  assert.deepEqual(anual, { start: "2026-01-01", end: "2026-12-31" });
});

test("13. aportación y retiro de ahorro", () => {
  const g = { id: "g", target: 10000, target_date: "2027-11-01" };
  const c = [{ goal_id: "g", amount: 2500, date: "2026-10-01" }, { goal_id: "g", amount: -500, date: "2026-10-15" }];
  const p = F.goalPlan(g, c, "2026-11-01");
  assert.equal(p.saved, 200000); assert.equal(p.left, 800000); assert.equal(p.pct, 0.2);
  assert.ok(p.perMonth > 60000 && p.perMonth < 70000);                                   // ~8000 / 12 meses
});

test("14. abono de deuda: capital e intereses; debo vs me deben", () => {
  const debo = { id: "d1", direction: "debo", principal: 10000, account_id: "deb" };
  const meDeben = { id: "d2", direction: "me_deben", principal: 3000, account_id: "deb" };
  const pays = [{ debt_id: "d1", amount: 1200, interest: 200, account_id: "deb", date: "2026-11-10" }, { debt_id: "d2", amount: 1000, interest: 0, account_id: "deb", date: "2026-11-11" }];
  assert.equal(F.debtBalanceC(debo, pays), 900000);
  assert.equal(F.debtBalanceC(meDeben, pays), 200000);
  // saldo: +10000 (recibí préstamo) −3000 (presté) −1200 (abono) +1000 (me pagaron)
  assert.equal(F.accountBalanceC(A("deb", 0), [], [debo, meDeben], pays), F.toC(10000 - 3000 - 1200 + 1000));
  // solo los intereses de lo que debo cuentan como gasto
  const t = F.totalsC([], "2026-11-01", "2026-11-30", pays, { d1: debo, d2: meDeben });
  assert.equal(t.exp, 20000); assert.equal(t.inc, 0);
});

test("disponible real: saldo − reservado − compromisos (sin contar dos veces lo pagado)", () => {
  const r = F.availability({ liquidC: 2000000, reservedC: 500000, commitmentsC: 350000 });
  assert.equal(r.available, 1150000);
});

test("equivalente mensual de suscripciones", () => {
  assert.equal(F.perMonthC({ amount: 299, frequency: "mensual" }), 29900);
  assert.equal(F.perMonthC({ amount: 1200, frequency: "anual" }), 10000);
  assert.equal(F.perMonthC({ amount: 100, frequency: "semanal" }), 43333);
});

test("cortes de tarjeta: a qué corte entra una compra y cuándo se paga", () => {
  // Corte el día 10, pago el día 30
  assert.equal(F.cutFor(10, "2026-11-05"), "2026-11-10");     // antes del corte → este mes
  assert.equal(F.cutFor(10, "2026-11-10"), "2026-11-10");     // el mismo día del corte → este mes
  assert.equal(F.cutFor(10, "2026-11-11"), "2026-12-10");     // después del corte → siguiente mes
  assert.equal(F.payByFor("2026-11-10", 30), "2026-11-30");
  assert.equal(F.payByFor("2026-11-25", 5), "2026-12-05");    // pago día 5 → mes siguiente al corte
  assert.equal(F.cutFor(31, "2026-02-15"), "2026-02-28");     // corte 31 en febrero
  assert.equal(F.lastCutOn(10, "2026-11-09"), "2026-10-10");
});

test("estado de cuenta: lo del corte vs lo que pasa al siguiente", () => {
  const card = { id: "k", initial_balance: 0, cut_day: 10, due_day: 30 };
  const mv = [
    M("gasto", 1000, "2026-11-08", { account_id: "k" }),     // entra al corte del 10 nov
    M("gasto", 400, "2026-11-12", { account_id: "k" }),      // entra al corte del 10 dic
    M("transferencia", 300, "2026-11-15", { account_id: "deb", to_account_id: "k" }),   // abono después del corte
  ];
  const st = F.statementC(card, mv, [], [], "2026-11-20");
  assert.equal(st.lastCut, "2026-11-10"); assert.equal(st.payBy, "2026-11-30");
  assert.equal(st.statement, 70000);    // 1000 − 300 pagados
  assert.equal(st.next, 40000);         // la compra del 12 va al siguiente corte
  assert.equal(st.total, 110000);
  assert.equal(st.nextCut, "2026-12-10"); assert.equal(st.nextPayBy, "2026-12-30");
  assert.equal(F.statementC({ id: "x", initial_balance: 0 }, mv, [], [], "2026-11-20"), null);   // sin día de corte
});

test("compras a meses: mensualidades exactas y cobro por corte", () => {
  const plan = { id: "p", account_id: "ml", total: 1160, installments: 3, first_month: "2026-11", status: "activo" };
  assert.deepEqual(F.planInstallmentsC(plan), [38667, 38667, 38666]);                 // suma exacta 1160.00
  assert.equal(F.planInstallmentsC(plan).reduce((a, b) => a + b, 0), 116000);
  assert.equal(F.planBilledCount(plan, "2026-10-10"), 0);
  assert.equal(F.planBilledCount(plan, "2026-11-10"), 1);
  assert.equal(F.planBilledCount(plan, "2027-03-10"), 3);
  assert.equal(F.planUnbilledC(plan, "2026-11-10"), 77333);
  // Tarjeta con 1160 de deuda previa a 3 meses + una compra normal de 200 antes del corte
  const card = { id: "ml", initial_balance: -1160, cut_day: 10, due_day: 30 };
  const mv = [M("gasto", 200, "2026-11-05", { account_id: "ml" })];
  const st = F.statementC(card, mv, [], [], "2026-11-20", [plan]);
  assert.equal(st.total, 136000);              // la deuda completa sigue contando
  assert.equal(st.statement, 58667);           // 386.67 de la mensualidad + 200 de la compra normal
  assert.equal(st.next, 38667);                // el siguiente corte solo cobra la 2.ª mensualidad
  assert.equal(st.later, 38666);               // la 3.ª queda para cortes posteriores
  // Al mes siguiente, después de pagar el corte de noviembre, se cobra la 2.ª mensualidad
  mv.push(M("transferencia", 586.67, "2026-11-25", { account_id: "deb", to_account_id: "ml" }));
  const st2 = F.statementC(card, mv, [], [], "2026-12-15", [plan]);
  assert.equal(st2.statement, 38667);
  assert.equal(st2.total, 77333);
});
