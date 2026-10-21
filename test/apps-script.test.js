// Prueba el script de la planilla con una planilla falsa, sin necesidad de Google.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function crearHoja() {
  const filas = [];                       // filas[0] = encabezados
  return {
    filas,
    getLastColumn: () => (filas.length ? filas[0].length : 0),
    getLastRow: () => filas.length,
    getRange(f, c, nf, nc) {
      return {
        getValues: () => { const o = []; for (let i = 0; i < nf; i++) o.push(filas[f - 1 + i].slice(c - 1, c - 1 + nc)); return o; },
        setValues: (v) => { if (!filas[f - 1]) filas[f - 1] = []; for (let j = 0; j < nc; j++) filas[f - 1][c - 1 + j] = v[0][j]; }
      };
    },
    appendRow: (r) => { if (!filas.length) filas.push([]); filas.push(r); }
  };
}

function cargar() {
  const hojas = {};
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => hojas[n] || null,
      insertSheet: (n) => (hojas[n] = crearHoja())
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
    JSON, Object, String, Date
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../apps-script/Code.gs"), "utf8"), ctx);
  const post = (d) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(d) } }).s);
  return { hojas, post };
}

const TOKEN = /const TOKEN = "([^"]+)"/.exec(fs.readFileSync(path.join(__dirname, "../apps-script/Code.gs"), "utf8"))[1];
const base = (extra) => Object.assign({
  token: TOKEN, envio_id: "E1", version: "v1", codigo: "ABC234", punto: 1,
  consentimiento: true, parteA: { A2_edad: 31 }, parteB: { orden_B2: "a-b", B2_pleasant: 4 }
}, extra);

test("escribe consentimiento, participante y respuestas en hojas separadas", () => {
  const { hojas, post } = cargar();
  assert.deepEqual(post(base()), { ok: true });
  const cons = hojas.consentimientos.filas;
  assert.ok(cons[0].includes("codigo") && cons[1][cons[0].indexOf("codigo")] === "ABC234", "el consentimiento lleva el código anónimo");
  assert.ok(!cons[0].includes("envio_id") && !cons[0].includes("A2_edad"), "pero ningún dato de las respuestas");
  assert.equal(hojas.participantes.filas[1][hojas.participantes.filas[0].indexOf("A2_edad")], 31);
  const r = hojas.respuestas.filas;
  assert.equal(r[1][r[0].indexOf("orden_B2")], "a-b");
});

test("un reintento del mismo envío no duplica nada", () => {
  const { hojas, post } = cargar();
  post(base());
  assert.deepEqual(post(base()), { ok: true, duplicado: true });
  assert.equal(hojas.respuestas.filas.length, 2);
  assert.equal(hojas.consentimientos.filas.length, 2);
});

test("el segundo punto de la misma persona agrega respuestas, no otro participante", () => {
  const { hojas, post } = cargar();
  post(base());
  post(base({ envio_id: "E2", punto: 2, consentimiento: false, parteA: null, parteB: { orden_B2: "b-a", B2_pleasant: 2, B8_abierta: "pájaros" } }));
  assert.equal(hojas.respuestas.filas.length, 3);
  assert.equal(hojas.participantes.filas.length, 2);
  const enc = hojas.respuestas.filas[0];
  assert.ok(enc.includes("B8_abierta"));                       // la columna nueva se agregó
  const viejo = hojas.respuestas.filas[1][enc.indexOf("B8_abierta")];   // la fila vieja queda vacía ahí
  assert.ok(viejo === "" || viejo === undefined);
});

test("rechaza un token incorrecto y envíos incompletos", () => {
  const { hojas, post } = cargar();
  assert.equal(post(base({ token: "otro" })).ok, false);
  assert.equal(post(base({ envio_id: "" })).ok, false);
  assert.equal(hojas.respuestas, undefined);
});

test("las columnas salen en el orden en que llegan las claves y las respuestas vacías no las mueven", () => {
  const { hojas, post } = cargar();
  const claves = ["B1_transito", "B2_agradable", "B2_estimulante", "B2_calmado", "B8_abierta"];
  const cuerpo = (valores) => Object.fromEntries(claves.map((k, i) => [k, valores[i]]));
  post(base({ parteB: Object.assign({ orden_B2: "calmado-agradable" }, cuerpo([2, 5, null, 1, null])) }));
  post(base({ envio_id: "E2", punto: 2, consentimiento: false, parteA: null, parteB: Object.assign({ orden_B2: "agradable-calmado" }, cuerpo([null, 3, 4, null, "ok"])) }));
  const enc = hojas.respuestas.filas[0];
  const esperado = ["recibido", "envio_id", "codigo", "punto", "version", "orden_B2", ...claves];
  assert.deepEqual(enc, esperado);
  const fila2 = hojas.respuestas.filas[2];
  assert.equal(fila2[enc.indexOf("B2_estimulante")], 4);
  assert.equal(hojas.respuestas.filas[1][enc.indexOf("B2_estimulante")], "");   // el vacío queda vacío, en su columna
});
