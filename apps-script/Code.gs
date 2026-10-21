// Recibe las respuestas de la página y las escribe en la planilla.
// Hojas que crea solas, con las columnas que van apareciendo:
//   respuestas        una fila por punto y participante (Parte B)
//   participantes     una fila por participante (Parte A)
//   consentimientos   una fila por aceptación, SIN el código, para que no se puedan unir
//
// Si cambia el TOKEN hay que cambiarlo igual en config.js.
const TOKEN = "1e93ae6057cfcaab024e1237";

const HOJA_RESPUESTAS = "respuestas";
const HOJA_PARTICIPANTES = "participantes";
const HOJA_CONSENTIMIENTOS = "consentimientos";

function doGet() {
  return salida({ ok: true, estado: "activo" });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const d = JSON.parse(e.postData.contents);
    if (d.token !== TOKEN) return salida({ ok: false, error: "token" });
    if (!d.envio_id || !d.codigo) return salida({ ok: false, error: "faltan_datos" });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaR = hoja(ss, HOJA_RESPUESTAS);

    // Si ya llegó este envío (un reintento), no se escribe de nuevo.
    if (existe(hojaR, "envio_id", d.envio_id)) return salida({ ok: true, duplicado: true });

    const ahora = new Date();
    if (d.consentimiento) {
      agregarFila(hoja(ss, HOJA_CONSENTIMIENTOS), { recibido: ahora, version: d.version, punto: d.punto });
    }
    if (d.parteA && !existe(hoja(ss, HOJA_PARTICIPANTES), "codigo", d.codigo)) {
      agregarFila(hoja(ss, HOJA_PARTICIPANTES), Object.assign({ recibido: ahora, codigo: d.codigo, version: d.version }, d.parteA));
    }
    // La fila de respuestas va al final: es la que marca el envío como hecho.
    agregarFila(hojaR, Object.assign({ recibido: ahora, envio_id: d.envio_id, codigo: d.codigo, punto: d.punto, version: d.version }, d.parteB));
    return salida({ ok: true });
  } catch (err) {
    return salida({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) { /* ya liberado */ }
  }
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function hoja(ss, nombre) {
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

// Agrega una fila poniendo cada dato bajo su encabezado; si falta una columna, la crea.
function agregarFila(sh, obj) {
  let cols = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  const nuevas = Object.keys(obj).filter(function (k) { return cols.indexOf(k) < 0; });
  if (nuevas.length) {
    sh.getRange(1, cols.length + 1, 1, nuevas.length).setValues([nuevas]);
    cols = cols.concat(nuevas);
  }
  sh.appendRow(cols.map(function (c) { return obj[c] === undefined || obj[c] === null ? "" : obj[c]; }));
}

function existe(sh, columna, valor) {
  const ultimaCol = sh.getLastColumn();
  const ultimaFila = sh.getLastRow();
  if (ultimaCol === 0 || ultimaFila < 2) return false;
  const idx = sh.getRange(1, 1, 1, ultimaCol).getValues()[0].indexOf(columna);
  if (idx < 0) return false;
  const datos = sh.getRange(2, idx + 1, ultimaFila - 1, 1).getValues();
  for (let i = 0; i < datos.length; i++) if (String(datos[i][0]) === String(valor)) return true;
  return false;
}
