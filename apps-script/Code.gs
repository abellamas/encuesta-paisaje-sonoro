// Recibe las respuestas de la página y las escribe en la planilla.
// Hojas que crea solas, con las columnas que van apareciendo:
//   respuestas        una fila por punto y participante (Parte B)
//   participantes     una fila por participante (Parte A)
//   comentarios       el comentario final de cada participante, una sola vez al terminar el paseo
//   consentimientos   una fila por aceptación, con el código anónimo para poder comprobar que cada
//                     participante aceptó (no tiene ningún dato que identifique a la persona)
//
// Si cambia el TOKEN hay que cambiarlo igual en config.js.
//
// Panel de administración (admin.html). Usa una clave propia, que NO está en el repositorio. Se define en
// Configuración del proyecto, Propiedades del script, con el nombre ADMIN_CLAVE. El número de grupo
// que se le asigna a quien acepta se guarda en la propiedad GRUPO_ACTUAL y se cambia desde el panel.
// El recorrido de cada grupo (el orden de los tres puntos) se guarda en RECORRIDOS, como {"1":[3,2,1], ...}.
const TOKEN = "1e93ae6057cfcaab024e1237";

const HOJA_RESPUESTAS = "respuestas";
const HOJA_PARTICIPANTES = "participantes";
const HOJA_CONSENTIMIENTOS = "consentimientos";
const HOJA_COMENTARIOS = "comentarios";

function doGet(e) {
  if (e && e.parameter && e.parameter.accion === "grupo") {
    const g = props().getProperty("GRUPO_ACTUAL");
    return salida({ ok: true, grupo: g ? Number(g) : null, recorrido: g ? (recorridos()[g] || null) : null });
  }
  if (e && e.parameter && e.parameter.accion === "recorrido") {
    return salida({ ok: true, recorrido: recorridos()[e.parameter.grupo] || null });
  }
  return salida({ ok: true, estado: "activo" });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return salida({ ok: false, error: String(err) }); }
  if (d.accion) return admin(d);   // el panel usa su propia clave y no ocupa el candado de los envíos
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    if (d.token !== TOKEN) return salida({ ok: false, error: "token" });
    if (!d.envio_id || !d.codigo) return salida({ ok: false, error: "faltan_datos" });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (d.tipo === "comentario") {
      const hojaC = hoja(ss, HOJA_COMENTARIOS);
      if (existe(hojaC, "envio_id", d.envio_id)) return salida({ ok: true, duplicado: true });
      agregarFila(hojaC, { recibido: new Date(), envio_id: d.envio_id, codigo: d.codigo, version: d.version, comentario: d.comentario });
      return salida({ ok: true });
    }
    const hojaR = hoja(ss, HOJA_RESPUESTAS);

    // Si ya llegó este envío (un reintento), no se escribe de nuevo.
    if (existe(hojaR, "envio_id", d.envio_id)) return salida({ ok: true, duplicado: true });

    const ahora = new Date();
    if (d.consentimiento) {
      agregarFila(hoja(ss, HOJA_CONSENTIMIENTOS), { recibido: ahora, codigo: d.codigo, version: d.version, punto: d.punto });
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

function props() {
  return PropertiesService.getScriptProperties();
}

function recorridos() {
  try { return JSON.parse(props().getProperty("RECORRIDOS") || "{}"); } catch (e) { return {}; }
}

// ---- panel de administración ---------------------------------------------------------------------
function admin(d) {
  const clave = props().getProperty("ADMIN_CLAVE");
  if (!clave || d.clave !== clave) {
    Utilities.sleep(2000);   // frena a quien pruebe claves una tras otra
    return salida({ ok: false, error: "clave" });
  }
  if (d.accion === "fijar_grupo") {
    const n = Math.round(Number(d.grupo));
    if (!(n >= 1 && n <= 99)) return salida({ ok: false, error: "grupo" });
    props().setProperty("GRUPO_ACTUAL", String(n));
    return salida({ ok: true, grupo: n });
  }
  if (d.accion === "fijar_recorrido") {
    const n = Math.round(Number(d.grupo)), r = d.recorrido;
    const valido = Array.isArray(r) && r.length === 3 && r.every(function (x, i) { return x >= 1 && x <= 3 && r.indexOf(x) === i; });
    if (!(n >= 1 && n <= 99) || (r !== null && !valido)) return salida({ ok: false, error: "recorrido" });
    const todos = recorridos();
    if (r === null) delete todos[n]; else todos[n] = r;
    props().setProperty("RECORRIDOS", JSON.stringify(todos));
    return salida({ ok: true, grupo: n, recorrido: r });
  }
  if (d.accion === "panel") return salida(Object.assign({ ok: true }, panel(d.version)));
  return salida({ ok: false, error: "accion" });
}

function leerHoja(nombre) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  return v.slice(1).map(function (f) {
    const o = {};
    v[0].forEach(function (c, i) { o[c] = f[i]; });
    return o;
  });
}

function aMs(v) {
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return isNaN(t) ? null : t;
}

// Junta en un grupo a quienes empezaron el mismo punto con menos de 3 minutos de diferencia.
function gruposPorHora(respuestas, codigos) {
  const padre = {};
  codigos.forEach(function (c) { padre[c] = c; });
  const raiz = function (c) { while (padre[c] !== c) { padre[c] = padre[padre[c]]; c = padre[c]; } return c; };
  const porPunto = {};
  respuestas.forEach(function (r) {
    const t = aMs(r.inicio);
    if (padre[r.codigo] === undefined || t === null) return;
    (porPunto[r.punto] = porPunto[r.punto] || []).push({ c: r.codigo, t: t });
  });
  Object.keys(porPunto).forEach(function (p) {
    const l = porPunto[p].sort(function (a, b) { return a.t - b.t; });
    for (let i = 1; i < l.length; i++) if (l[i].t - l[i - 1].t <= 180000) padre[raiz(l[i].c)] = raiz(l[i - 1].c);
  });
  const grupos = {};
  codigos.forEach(function (c) { (grupos[raiz(c)] = grupos[raiz(c)] || []).push(c); });
  return Object.keys(grupos).map(function (k) { return grupos[k]; });
}

// Promedio de los valores que son números mayores que cero, con la cantidad de datos usados.
function promedio(valores) {
  const v = valores.map(Number).filter(function (x) { return isFinite(x) && x > 0; });
  return { segundos: v.length ? Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length) : null, n: v.length };
}

// Los ocho valores de cada respuesta completa, para dibujar el mapa de agrado y actividad en el panel.
function atributosDe(respuestas, personas) {
  const grupoDe = {};
  personas.forEach(function (p) { if (p.grupo !== "" && p.grupo != null) grupoDe[p.codigo] = Number(p.grupo); });
  const filas = [];
  respuestas.forEach(function (r) {
    const v = ATRIBUTOS_ID.map(function (a) { return r["B2_" + a] === "" || r["B2_" + a] == null ? NaN : Number(r["B2_" + a]); });
    if (v.every(function (x) { return x >= 1 && x <= 5; })) filas.push({ codigo: r.codigo, punto: Number(r.punto), grupo: grupoDe[r.codigo] || null, valores: v });
  });
  return filas;
}

function tiemposPromedio(personas, respuestas, puntosDe) {
  const ultimaPorPunto = {};   // código -> punto -> segundos de la Parte B (la última respuesta de ese punto)
  respuestas.forEach(function (r) {
    (ultimaPorPunto[r.codigo] = ultimaPorPunto[r.codigo] || {})[r.punto] = Number(r.t_B_total_s);
  });
  const porPunto = {};
  [1, 2, 3].forEach(function (p) {
    porPunto[p] = promedio(respuestas.filter(function (r) { return Number(r.punto) === p; }).map(function (r) { return r.t_B_total_s; }));
  });
  const completo = [];   // Parte A más los tres puntos, de quienes hicieron los tres
  personas.forEach(function (p) {
    const u = ultimaPorPunto[p.codigo] || {};
    if ([1, 2, 3].every(function (n) { return u[n] > 0; }) && Number(p.t_A_total_s) > 0) completo.push(Number(p.t_A_total_s) + u[1] + u[2] + u[3]);
  });
  return {
    parte_a: promedio(personas.map(function (p) { return p.t_A_total_s; })),
    parte_b: promedio(respuestas.map(function (r) { return r.t_B_total_s; })),
    por_punto: porPunto,
    recorrido_completo: promedio(completo)
  };
}

// Los ocho atributos en el orden de la planilla (el mismo de ATRIBUTOS en cuestionario.js).
const ATRIBUTOS_ID = ["agradable", "estimulante", "con_actividad", "caotico", "desagradable", "monotono", "sin_actividad", "calmado"];

function panel(version) {
  const coincide = function (r) { return !version || String(r.version) === String(version); };
  const personas = leerHoja(HOJA_PARTICIPANTES).filter(coincide);
  const respuestas = leerHoja(HOJA_RESPUESTAS).filter(coincide).filter(function (r) { return r.punto !== "" && r.punto != null; });
  const comentarios = leerHoja(HOJA_COMENTARIOS).filter(coincide);

  const puntosDe = {};   // código -> puntos que respondió
  respuestas.forEach(function (r) {
    const l = puntosDe[r.codigo] = puntosDe[r.codigo] || [];
    if (l.indexOf(Number(r.punto)) < 0) l.push(Number(r.punto));
  });
  const porPunto = {};
  Object.keys(puntosDe).forEach(function (c) { puntosDe[c].forEach(function (p) { porPunto[p] = (porPunto[p] || 0) + 1; }); });

  const origen = { invitado: 0, en_el_lugar: 0, sin_dato: 0 };
  personas.forEach(function (p) { origen[p.A10_origen === "invitado" || p.A10_origen === "en_el_lugar" ? p.A10_origen : "sin_dato"]++; });

  // grupos con el número que se asignó al aceptar, y los demás reconstruidos por la hora de inicio
  const asignados = {}, sinNumero = [];
  personas.forEach(function (p) {
    const n = Number(p.grupo);
    if (p.grupo !== "" && p.grupo != null && n > 0) (asignados[n] = asignados[n] || []).push(p.codigo);
    else sinNumero.push(p.codigo);
  });
  // orden real en que cada persona hizo los puntos, por la hora de inicio de cada uno
  const ordenDe = {};
  respuestas.slice().sort(function (a, b) { return (aMs(a.inicio) || 0) - (aMs(b.inicio) || 0); }).forEach(function (r) {
    const l = ordenDe[r.codigo] = ordenDe[r.codigo] || [];
    if (l.indexOf(Number(r.punto)) < 0) l.push(Number(r.punto));
  });
  const fichaDe = function (ruta) {
    return function (c) {
      const orden = ordenDe[c] || [];
      return { codigo: c, puntos: (puntosDe[c] || []).sort(), orden: orden,
               desvio: !!ruta && orden.some(function (p, i) { return p !== ruta[i]; }) };
    };
  };
  const rutas = recorridos();
  const grupos = Object.keys(asignados).sort(function (a, b) { return a - b; }).map(function (n) {
    const ruta = rutas[n] || null;
    return { numero: Number(n), nombre: "Grupo " + n, tipo: "asignado", recorrido: ruta, personas: asignados[n].map(fichaDe(ruta)) };
  });
  gruposPorHora(respuestas, sinNumero).forEach(function (l, i) {
    grupos.push({ nombre: "Sin número " + (i + 1), tipo: "por hora", recorrido: null, personas: l.map(fichaDe(null)) });
  });

  const recientes = respuestas.slice(-15).reverse().map(function (r) {
    return { codigo: r.codigo, punto: Number(r.punto), recibido: r.recibido, duracion_s: r.duracion_s };
  });
  const g = props().getProperty("GRUPO_ACTUAL");
  return {
    grupo_actual: g ? Number(g) : null,
    resumen: {
      personas: personas.length,
      completaron_todo: Object.keys(puntosDe).filter(function (c) { return puntosDe[c].length >= 3; }).length,
      respuestas: respuestas.length,
      comentarios: comentarios.length,
      origen: origen
    },
    por_punto: porPunto, grupos: grupos, recorridos: rutas, recientes: recientes,
    atributos: atributosDe(respuestas, personas),
    tiempos: tiemposPromedio(personas, respuestas, puntosDe)
  };
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
  sh.appendRow(cols.map(function (c) { return obj[c] === undefined || obj[c] === null ? "" : seguro(obj[c]); }));
}

// Un texto que empieza con = + - o @ se podría tomar como fórmula. Con el apóstrofe queda como texto.
function seguro(v) {
  return typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

// Borra las hojas de la planilla. Se corre a mano, una sola vez, para sacar los datos de prueba
// antes del trabajo de campo. Las hojas se vuelven a crear solas con la primera respuesta.
function limpiarPruebas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [HOJA_RESPUESTAS, HOJA_PARTICIPANTES, HOJA_CONSENTIMIENTOS, HOJA_COMENTARIOS].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh) ss.deleteSheet(sh);
  });
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
