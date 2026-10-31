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
  const hojas = {}, props = {};
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => hojas[n] || null,
      insertSheet: (n) => (hojas[n] = crearHoja())
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props[k] === undefined ? null : props[k]), setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: { sleep() {} },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
    JSON, Object, String, Date
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../apps-script/Code.gs"), "utf8"), ctx);
  const post = (d) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(d) } }).s);
  const get = (q) => JSON.parse(ctx.doGet({ parameter: q }).s);
  return { hojas, post, get, props };
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

test("un texto que empieza con = queda como texto y no como fórmula", () => {
  const { hojas, post } = cargar();
  post(base({ parteA: { A2_edad: 31, A3_genero_otro: "=1+1" } }));
  const f = hojas.participantes.filas;
  assert.equal(f[1][f[0].indexOf("A3_genero_otro")], "'=1+1");
  assert.equal(f[1][f[0].indexOf("A2_edad")], 31, "los números no se tocan");
});

test("el comentario final va a su propia hoja y un reintento no lo duplica", () => {
  const { hojas, post } = cargar();
  const c = { token: TOKEN, tipo: "comentario", envio_id: "C1", codigo: "ABC234", version: "v1", comentario: "Pájaros; me molestó el colectivo" };
  assert.equal(post(c).ok, true);
  assert.equal(post(c).duplicado, true);
  const f = hojas.comentarios.filas;
  assert.equal(f.length, 2, "encabezado y una sola fila");
  assert.equal(f[1][f[0].indexOf("comentario")], "Pájaros; me molestó el colectivo");
  assert.equal(hojas.respuestas, undefined, "no toca las otras hojas");
});

test("el panel exige la clave y no devuelve nada sin ella", () => {
  const { post, props } = cargar();
  assert.equal(post({ accion: "panel", clave: "x" }).error, "clave", "sin clave configurada nadie entra");
  props.ADMIN_CLAVE = "secreta";
  assert.equal(post({ accion: "panel", clave: "otra" }).error, "clave");
  assert.equal(post({ accion: "panel" }).error, "clave");
  assert.equal(post({ accion: "fijar_grupo", clave: "otra", grupo: 4 }).error, "clave");
  assert.equal(post({ accion: "panel", clave: "secreta" }).ok, true);
});

test("el grupo actual se fija desde el panel y la encuesta lo lee sin clave", () => {
  const { post, get, props } = cargar();
  props.ADMIN_CLAVE = "secreta";
  assert.equal(get({ accion: "grupo" }).grupo, null, "al principio no hay grupo");
  assert.equal(post({ accion: "fijar_grupo", clave: "secreta", grupo: 3 }).grupo, 3);
  assert.equal(get({ accion: "grupo" }).grupo, 3);
  assert.equal(post({ accion: "fijar_grupo", clave: "secreta", grupo: 0 }).error, "grupo");
  assert.equal(post({ accion: "fijar_grupo", clave: "secreta", grupo: "x" }).error, "grupo");
  assert.equal(get({}).estado, "activo");
});

test("el panel cuenta personas, arma los grupos y separa por versión", () => {
  const { post, props } = cargar();
  props.ADMIN_CLAVE = "secreta";
  const envio = (codigo, punto, hora, extra, version) => post(Object.assign(base({
    envio_id: codigo + "-" + punto, codigo, punto, version: version || "v2", consentimiento: punto === 1,
    parteA: punto === 1 ? Object.assign({ A2_edad: 30 }, extra) : null,
    parteB: { inicio: "2026-10-30T" + hora + ":00.000Z", duracion_s: 120 }
  })));
  envio("AAA111", 1, "15:00", { grupo: 1, A10_origen: "invitado" });
  envio("BBB222", 1, "15:01", { grupo: 1, A10_origen: "invitado" });
  envio("AAA111", 2, "15:06", {});
  envio("CCC333", 1, "16:00", { A10_origen: "en_el_lugar" });      // sin número, empieza solo
  envio("DDD444", 1, "16:02", {});                                   // sin número, junto con CCC333
  envio("EEE555", 1, "17:00", { grupo: 2 }, "piloto");
  const p = post({ accion: "panel", clave: "secreta" });
  assert.equal(p.resumen.personas, 5, "cuenta los que ya tienen la Parte A, sin la versión piloto en la otra consulta");
  const solo = post({ accion: "panel", clave: "secreta", version: "v2" });
  assert.equal(solo.resumen.personas, 4);
  assert.deepEqual(solo.resumen.origen, { invitado: 2, en_el_lugar: 1, sin_dato: 1 });
  assert.equal(solo.por_punto["1"], 4);
  assert.equal(solo.por_punto["2"], 1);
  const g1 = solo.grupos.find((g) => g.nombre === "Grupo 1");
  assert.deepEqual(g1.personas.map((x) => x.codigo).sort(), ["AAA111", "BBB222"]);
  assert.deepEqual(g1.personas.find((x) => x.codigo === "AAA111").puntos, [1, 2]);
  const auto = solo.grupos.filter((g) => g.tipo === "por hora");
  assert.equal(auto.length, 1, "CCC333 y DDD444 empezaron con 2 minutos de diferencia");
  assert.deepEqual(auto[0].personas.map((x) => x.codigo).sort(), ["CCC333", "DDD444"]);
  assert.equal(solo.recientes.length, 5);
  assert.ok(!JSON.stringify(p).includes("A2_edad"), "el panel no devuelve las respuestas");
});

test("el recorrido de cada grupo se fija desde el panel, la encuesta lo lee y el panel marca los desvíos", () => {
  const { post, get, props } = cargar();
  props.ADMIN_CLAVE = "secreta";
  assert.equal(post({ accion: "fijar_recorrido", clave: "otra", grupo: 1, recorrido: [3, 2, 1] }).error, "clave");
  assert.equal(post({ accion: "fijar_recorrido", clave: "secreta", grupo: 1, recorrido: [3, 3, 1] }).error, "recorrido", "no puede repetir puntos");
  assert.equal(post({ accion: "fijar_recorrido", clave: "secreta", grupo: 1, recorrido: [3, 2] }).error, "recorrido");
  assert.equal(post({ accion: "fijar_recorrido", clave: "secreta", grupo: 1, recorrido: [3, 2, 1] }).ok, true);
  assert.equal(post({ accion: "fijar_grupo", clave: "secreta", grupo: 1 }).ok, true);
  assert.deepEqual(get({ accion: "grupo" }).recorrido, [3, 2, 1]);
  post({ accion: "fijar_grupo", clave: "secreta", grupo: 2 });
  assert.equal(get({ accion: "grupo" }).recorrido, null, "el grupo 2 todavía no tiene recorrido");

  const envio = (codigo, punto, hora, extra) => post(base({
    envio_id: codigo + "-" + punto, codigo, punto, version: "v2", consentimiento: punto === 3 || codigo === "BBB222" && punto === 1,
    parteA: extra, parteB: { inicio: "2026-10-30T" + hora + ":00.000Z", duracion_s: 100 }
  }));
  envio("AAA111", 3, "15:00", { grupo: 1 });   // le tocaba Mesitas primero, bien
  envio("AAA111", 2, "15:06", null);           // y después Newbery, bien
  envio("BBB222", 1, "15:00", { grupo: 1 });   // empezó por Calistenia, se equivocó
  const p = post({ accion: "panel", clave: "secreta", version: "v2" });
  assert.deepEqual(p.recorridos, { "1": [3, 2, 1] });
  const g1 = p.grupos.find((x) => x.nombre === "Grupo 1");
  assert.deepEqual(g1.recorrido, [3, 2, 1]);
  const a = g1.personas.find((x) => x.codigo === "AAA111"), b = g1.personas.find((x) => x.codigo === "BBB222");
  assert.deepEqual(a.orden, [3, 2]);
  assert.equal(a.desvio, false, "va por el recorrido asignado, aunque no lo haya terminado");
  assert.equal(b.desvio, true);
  assert.equal(post({ accion: "fijar_recorrido", clave: "secreta", grupo: 1, recorrido: null }).ok, true);
  assert.equal(post({ accion: "panel", clave: "secreta" }).grupos.find((x) => x.nombre === "Grupo 1").recorrido, null, "se puede quitar");
});

test("el panel calcula el tiempo promedio de la Parte A, de cada punto y del recorrido completo", () => {
  const { post, props } = cargar();
  props.ADMIN_CLAVE = "secreta";
  const envio = (codigo, punto, tA, tB) => post(base({
    envio_id: codigo + "-" + punto, codigo, punto, version: "v2", consentimiento: punto === 1,
    parteA: punto === 1 ? { A2_edad: 30, t_A_total_s: tA } : null,
    parteB: { inicio: "2026-10-30T15:0" + punto + ":00.000Z", t_B_total_s: tB }
  }));
  envio("AAA111", 1, 100, 200); envio("AAA111", 2, 0, 220); envio("AAA111", 3, 0, 240);   // completó los tres, 100 + 200 + 220 + 240 = 760
  envio("BBB222", 1, 140, 180); envio("BBB222", 2, 0, 200);                                // le falta el tercer punto
  const p = post({ accion: "panel", clave: "secreta", version: "v2" });
  assert.deepEqual(p.tiempos.parte_a, { segundos: 120, n: 2 });
  assert.deepEqual(p.tiempos.por_punto["1"], { segundos: 190, n: 2 });
  assert.deepEqual(p.tiempos.por_punto["3"], { segundos: 240, n: 1 });
  assert.deepEqual(p.tiempos.parte_b, { segundos: 208, n: 5 });
  assert.deepEqual(p.tiempos.recorrido_completo, { segundos: 760, n: 1 }, "solo cuenta a quien hizo los tres puntos");
  assert.deepEqual(post({ accion: "panel", clave: "secreta", version: "otra" }).tiempos.parte_a, { segundos: null, n: 0 });
});

test("el panel devuelve los ocho atributos de las respuestas completas, con el grupo de cada persona", () => {
  const { post, props } = cargar();
  props.ADMIN_CLAVE = "secreta";
  const ocho = { B2_agradable: 5, B2_estimulante: 4, B2_con_actividad: 3, B2_caotico: 2, B2_desagradable: 1, B2_monotono: 2, B2_sin_actividad: 3, B2_calmado: 4 };
  post(base({ envio_id: "A-1", codigo: "AAA111", punto: 1, version: "v2", parteA: { grupo: 2 }, parteB: Object.assign({ inicio: "2026-10-30T15:00:00.000Z" }, ocho) }));
  post(base({ envio_id: "A-2", codigo: "AAA111", punto: 2, version: "v2", consentimiento: false, parteA: null, parteB: { inicio: "2026-10-30T15:10:00.000Z", B2_agradable: 5 } }));   // incompleta
  const p = post({ accion: "panel", clave: "secreta", version: "v2" });
  assert.equal(p.atributos.length, 1, "solo entra la respuesta con los ocho atributos");
  assert.deepEqual(p.atributos[0].valores, [5, 4, 3, 2, 1, 2, 3, 4]);
  assert.equal(p.atributos[0].grupo, 2);
  assert.equal(p.atributos[0].punto, 1);
});
