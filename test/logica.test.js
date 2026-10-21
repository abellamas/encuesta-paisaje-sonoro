// Ejecutar con:  node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logica.js");

const rng = L.crearRng();

test("barajar devuelve una permutación y no toca el original", () => {
  const orig = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const m = L.barajar(orig, rng);
  assert.deepEqual(orig, ["a", "b", "c", "d", "e", "f", "g", "h"]);
  assert.deepEqual(m.slice().sort(), orig.slice().sort());
});

test("barajar reparte parejo cada atributo entre las ocho posiciones", () => {
  const n = 16000, k = 8;
  const cuenta = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let r = 0; r < n; r++) L.barajar([0, 1, 2, 3, 4, 5, 6, 7], rng).forEach((v, pos) => cuenta[v][pos]++);
  const esperado = n / k;                      // 2000
  for (const fila of cuenta) for (const c of fila) assert.ok(Math.abs(c - esperado) < 0.12 * esperado, "posición muy desbalanceada: " + c);
});

test("códigos de 6 caracteres, válidos y casi nunca repetidos", () => {
  const vistos = new Set();
  for (let i = 0; i < 5000; i++) {
    const c = L.nuevoCodigo(rng);
    assert.ok(L.codigoValido(c), c);
    vistos.add(c);
  }
  assert.ok(vistos.size > 4990);
  assert.equal(L.codigoValido("ABC"), false);
  assert.equal(L.codigoValido("ABCDE0"), false);   // el 0 no se usa
});

function almacenFalso() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, removeItem: (k) => { delete m[k]; } };
}

test("la cola guarda, no duplica y quita", () => {
  const cola = L.crearCola(L.crearAlmacen(almacenFalso()), "c");
  cola.agregar({ envio_id: "x1" }); cola.agregar({ envio_id: "x1" }); cola.agregar({ envio_id: "x2" });
  assert.equal(cola.contar(), 2);
  cola.quitar("x1");
  assert.deepEqual(cola.todos().map((e) => e.envio_id), ["x2"]);
});

test("sin localStorage el almacén sigue andando en memoria", () => {
  const roto = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() {} };
  const a = L.crearAlmacen(roto);
  a.set("k", { v: 1 });
  assert.deepEqual(a.get("k"), { v: 1 });
  assert.equal(a.persistente, false);
});

test("reintentos: si falla se conserva, si vuelve la señal se envía y no se duplica", async () => {
  const cola = L.crearCola(L.crearAlmacen(almacenFalso()), "c");
  cola.agregar({ envio_id: "a" }); cola.agregar({ envio_id: "b" });
  const cfg = { ENDPOINT: "https://ejemplo", TOKEN: "t" };
  const recibidos = [];
  let sinSenal = true;
  const fetchFalso = async (url, op) => {
    if (sinSenal) throw new Error("sin señal");
    const cuerpo = JSON.parse(op.body);
    assert.equal(cuerpo.token, "t");
    recibidos.push(cuerpo.envio_id);
    return { json: async () => ({ ok: true }) };
  };
  let r = await L.vaciarCola(cola, cfg, fetchFalso);
  assert.equal(r.enviados, 0); assert.equal(r.pendientes, 2);
  sinSenal = false;
  r = await L.vaciarCola(cola, cfg, fetchFalso);
  assert.equal(r.enviados, 2); assert.equal(r.pendientes, 0);
  assert.deepEqual(recibidos, ["a", "b"]);
});

test("si el servidor responde error, el envío queda en la cola", async () => {
  const cola = L.crearCola(L.crearAlmacen(almacenFalso()), "c");
  cola.agregar({ envio_id: "a" });
  const r = await L.vaciarCola(cola, { ENDPOINT: "https://e", TOKEN: "t" }, async () => ({ json: async () => ({ ok: false, error: "token" }) }));
  assert.equal(r.pendientes, 1);
});

test("sin ENDPOINT (modo prueba) no se envía nada", async () => {
  const cola = L.crearCola(L.crearAlmacen(almacenFalso()), "c");
  cola.agregar({ envio_id: "a" });
  let llamado = false;
  const r = await L.vaciarCola(cola, { ENDPOINT: "", TOKEN: "t" }, async () => { llamado = true; });
  assert.equal(llamado, false); assert.equal(r.pendientes, 1);
});

test("construirEnvio guarda el orden de los atributos y la duración", () => {
  const e = L.construirEnvio({
    envio_id: "E1", version: "v", codigo: "ABC234", punto: 2, consentimiento: true, parteA: { A2_edad: 30 },
    inicio: "2026-10-24T18:00:00.000Z", fin: "2026-10-24T18:07:30.000Z",
    orden: ["calm", "pleasant", "chaotic"], parteB: { B2_pleasant: 4 }
  });
  assert.equal(e.parteB.orden_B2, "calm-pleasant-chaotic");
  assert.equal(e.parteB.duracion_s, 450);
  assert.equal(e.parteB.B2_pleasant, 4);
  assert.equal(e.parteA.A2_edad, 30);
  assert.equal(e.consentimiento, true);
});
