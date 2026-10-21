// Prueba de punta a punta en Chrome con tamaño de celular, sin librerías.
//   node test/e2e.js [carpeta-de-capturas]
// Levanta la página y una planilla falsa, contesta la encuesta, simula un corte de señal
// y un cierre del navegador a mitad de camino.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");

const RAIZ = path.join(__dirname, "..");
const CAPTURAS = process.argv[2] || path.join(__dirname, "capturas");
fs.mkdirSync(CAPTURAS, { recursive: true });
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
].find((p) => fs.existsSync(p));

const recibidos = [];
let falla = false;       // simula que no hay señal
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png" };

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      if (falla) { res.writeHead(503); return res.end("sin servicio"); }
      const d = JSON.parse(cuerpo);
      if (!recibidos.some((r) => r.envio_id === d.envio_id)) recibidos.push(d);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  let f = url.pathname === "/" ? "/index.html" : url.pathname;
  const ruta = path.join(RAIZ, f);
  if (!ruta.startsWith(RAIZ) || !fs.existsSync(ruta)) { res.writeHead(404); return res.end(); }
  let datos = fs.readFileSync(ruta);
  if (f.startsWith("/config.js")) datos = Buffer.from(datos.toString().replace(/ENDPOINT: "[^"]*"/, 'ENDPOINT: "/api"').replace("SEGUNDOS_ESCUCHA: 180", "SEGUNDOS_ESCUCHA: 3"));
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
  res.end(datos);
});

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const puerto = servidor.address().port;
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "chrome-e2e-"));
  const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9333", "--user-data-dir=" + dir, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
  let lista;
  for (let i = 0; i < 50 && !lista; i++) {
    try { lista = await (await fetch("http://127.0.0.1:9333/json/list")).json(); } catch (e) { await dormir(200); }
  }
  const pestaña = lista.find((t) => t.type === "page");
  const ws = new WebSocket(pestaña.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let n = 0; const espera = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && espera[d.id]) { espera[d.id](d); delete espera[d.id]; } };
  const cdp = (metodo, params) => new Promise((r) => { const id = ++n; espera[id] = r; ws.send(JSON.stringify({ id, method: metodo, params })); });
  const js = async (expr) => {
    const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error("JS: " + JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails));
    return r.result.result.value;
  };
  const captura = async (nombre) => {
    const r = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.writeFileSync(path.join(CAPTURAS, nombre + ".png"), Buffer.from(r.result.data, "base64"));
  };
  const cargar = async () => { await cdp("Page.navigate", { url: "http://127.0.0.1:" + puerto + "/" }); await dormir(700); };
  const clic = (sel) => js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) throw new Error("no está: "+${JSON.stringify(sel)}); e.click(); return true;})()`);
  const texto = () => js("document.getElementById('app').innerText");
  // elige la opción cuyo texto visible coincide, dentro de la pregunta cuyo texto empieza con 'pregunta'
  const elegir = (pregunta, opcion) => js(`(()=>{
    const fs=[...document.querySelectorAll('fieldset')].filter(f=>f.querySelector(':scope > legend') && f.querySelector(':scope > legend').innerText.startsWith(${JSON.stringify(pregunta)}));
    if(!fs.length) throw new Error("sin pregunta "+${JSON.stringify(pregunta)});
    const l=[...fs[0].querySelectorAll('label.opcion')].find(l=>l.innerText.trim()===${JSON.stringify(opcion)});
    if(!l) throw new Error("sin opción "+${JSON.stringify(opcion)}); l.querySelector('input').click(); return true;})()`);
  const boton = (t) => js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim().startsWith(${JSON.stringify(t)})); if(!b) throw new Error("sin botón "+${JSON.stringify(t)}); b.click(); return true;})()`);

  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true });
  await js("0");
  const errores = [];
  await cdp("Runtime.enable");
  ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") errores.push(JSON.stringify(d.params.exceptionDetails.exception || d.params.exceptionDetails)); });

  // Contesta todo lo que quede sin responder en la pantalla actual (radios, número, texto).
  const completar = () => js(`(()=>{
    const grupos={};
    document.querySelectorAll('#app input[type=radio]').forEach(r=>{(grupos[r.name]=grupos[r.name]||[]).push(r)});
    for(const g of Object.values(grupos)){ if(!g.some(r=>r.checked)) g[Math.min(1,g.length-1)].click(); }
    document.querySelectorAll('#app input[type=number]').forEach(i=>{ if(i.value===''){ i.value='40'; i.dispatchEvent(new Event('input',{bubbles:true})); }});
    document.querySelectorAll('#app textarea').forEach(t=>{ if(!t.value){ t.value='Respuesta de prueba'; t.dispatchEvent(new Event('input',{bubbles:true})); }});
    return true;})()`);
  const elegirPunto = (id) => js(`(()=>{const s=document.getElementById('punto'); s.value='${id}'; s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  // Recorre la Parte A completa (3 pasos) o la Parte B completa (5 pasos) contestando todo.
  const recorrer = async (pasos, ultimo) => {
    for (let i = 0; i < pasos; i++) {
      await completar();
      assert.ok(!(await texto()).includes("sin responder"), "no debería haber avisos si está todo contestado");
      await boton(i < pasos - 1 ? "Siguiente" : ultimo);
      await dormir(120);
    }
  };

  // 1. consentimiento
  await cargar();
  await captura("01-consentimiento");
  const inicio = await texto();
  assert.ok(inicio.includes("Universidad Nacional de Tres de Febrero") && inicio.includes("Ingeniería de Sonido"), "debe aclarar universidad y carrera");
  assert.ok(!inicio.toLowerCase().includes("código"), "no se pide ningún código");
  assert.equal(await js("document.querySelector('button.principal').disabled"), true, "no debe poder empezar sin aceptar");
  assert.equal(await js("document.getElementById('btn-inicio').hidden"), true);
  await clic("#acepto"); await clic("button.principal");

  // 2. Parte A: primero el aviso de preguntas sin responder, después todo contestado
  await dormir(200);
  await captura("02-parteA-1");
  await elegir("¿Vive a diez minutos", "Sí");
  await js(`(()=>{const i=document.querySelector('input[type=number]'); i.value='35'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await elegir("¿Cuál es su género", "Femenino");
  await boton("Siguiente");
  assert.ok((await texto()).includes("sin responder"), "debe avisar de lo que falta");
  await recorrer(3, "Terminar esta parte");

  // 3. elegir el punto en el desplegable
  await dormir(200);
  await captura("05-elegir-punto");
  await boton("Comenzar");
  assert.ok((await texto()).includes("Elija el punto"));
  await elegirPunto(2);
  await boton("Comenzar");
  await dormir(200);
  await captura("06-escucha");
  await boton("Comenzar los tres minutos");
  await dormir(3700);
  assert.ok((await texto()).includes("Listo"));
  await boton("Continuar con las preguntas");

  // 4. Parte B, con un cierre del navegador a mitad de camino
  await dormir(200);
  await captura("07-B1");
  await js(`(()=>{const f=[...document.querySelectorAll('fieldset.fila')].find(f=>f.innerText.startsWith('Sonidos naturales')); f.querySelectorAll('label.opcion')[3].querySelector('input').click();})()`);
  await completar(); await boton("Siguiente");
  const orden1 = await js("JSON.parse(localStorage.getItem('borrador')).orden.join('-')");
  await dormir(100);
  await captura("08-B2-atributos");
  await js(`(()=>{const f=[...document.querySelectorAll('fieldset.fila')].find(f=>f.querySelector('legend').innerText==='agradable'); f.querySelectorAll('label.opcion')[4].querySelector('input').click();})()`);
  // ---- se cierra el navegador acá (recarga) ----
  await cargar();
  assert.ok((await texto()).includes("Paso 2 de 5"), "debe volver al paso donde estaba");
  assert.equal(await js(`[...document.querySelectorAll('fieldset.fila')].find(f=>f.querySelector('legend').innerText==='agradable').querySelector('input:checked').nextSibling.textContent`), "5");
  assert.equal(await js("JSON.parse(localStorage.getItem('borrador')).orden.join('-')"), orden1, "el orden de los atributos no debe cambiar al recargar");
  await completar(); await boton("Siguiente");
  await captura("09-B3-B6");
  await elegir("En general, ¿cómo describiría", "Bueno");
  await completar(); await boton("Siguiente");
  await js(`(()=>{const f=document.querySelectorAll('fieldset.fila')[0]; f.querySelectorAll('label.opcion')[5].querySelector('input').click();})()`);
  await completar();
  await captura("10-B7");
  await boton("Siguiente");
  await js(`(()=>{const t=document.querySelector('textarea'); t.value='Pájaros; me molestó el colectivo'; t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await captura("11-B8");

  // 5. envío sin señal, después con señal
  falla = true;
  await boton("Enviar respuestas");
  await dormir(500);
  assert.equal(recibidos.length, 0);
  assert.ok((await texto()).includes("Guardado en este celular"), "debe avisar que quedó guardado");
  await captura("12-sin-senal");
  assert.equal(await js("JSON.parse(localStorage.getItem('cola_envios')).length"), 1);
  falla = false;
  await js("window.dispatchEvent(new Event('online'))");
  await dormir(1000);
  assert.equal(recibidos.length, 1, "el reintento debe enviarlo");
  assert.ok((await texto()).includes("Enviado"));
  await captura("13-enviado");

  const e = recibidos[0];
  assert.equal(e.punto, 2);
  assert.equal(e.consentimiento, true);
  assert.equal(e.parteA.A2_edad, 35);
  assert.equal(e.parteA.A1_vive_cerca, "si");
  assert.equal(e.parteB.orden_B2, orden1);
  assert.equal(e.parteB.B2_pleasant, 5);
  assert.equal(e.parteB.B1_naturales, 4);
  assert.equal(e.parteB.B3_global, 4);
  assert.equal(e.parteB.B7_a, 5);
  assert.equal(e.parteB.B8_abierta, "Pájaros; me molestó el colectivo");

  // 6. segundo punto: la Parte A no se vuelve a pedir y el consentimiento no se repite
  await boton("Seguir con otro punto");
  await dormir(200);
  assert.ok((await texto()).includes("Respondido"), "debe marcar el punto hecho");
  await elegirPunto(3);
  await boton("Comenzar"); await boton("Pasar directo");
  // botón "Ir al inicio": pregunta antes, y si se confirma vuelve a elegir el punto
  assert.equal(await js("document.getElementById('btn-inicio').hidden"), false, "debe verse durante la encuesta");
  await clic("#btn-inicio");
  await dormir(100);
  assert.ok(await js("!!document.querySelector('.modal')"), "debe aparecer la pregunta");
  assert.ok((await js("document.querySelector('.modal').innerText")).includes("Se perderán"), "debe avisar de lo que se pierde");
  await clic("#dlg-no");
  assert.ok((await texto()).includes("Paso 1 de 5"), "si no confirma, se queda donde estaba");
  assert.equal(await js("!!document.querySelector('.modal')"), false);
  await clic("#btn-inicio");
  await clic("#dlg-si");
  await dormir(200);
  assert.ok((await texto()).includes("Universidad Nacional de Tres de Febrero"), "confirmando vuelve a la primera pantalla");
  assert.ok((await texto()).includes("Ya aceptó participar"), "no vuelve a pedir el consentimiento a quien ya aceptó");
  assert.equal(await js("document.getElementById('btn-inicio').hidden"), true, "no se muestra en la primera pantalla");
  assert.equal(await js("localStorage.getItem('borrador')"), null, "se descarta el punto a medias");
  await captura("14-ir-al-inicio");
  await boton("Continuar mi encuesta");
  await dormir(200);
  assert.ok((await texto()).includes("¿En qué punto de escucha está ahora?"), "continuar lleva a elegir el punto");
  await elegirPunto(3);
  await boton("Comenzar"); await boton("Pasar directo");
  await recorrer(5, "Enviar respuestas");
  await dormir(1000);
  assert.equal(recibidos.length, 2);
  assert.equal(recibidos[1].consentimiento, false);
  assert.equal(recibidos[1].parteA, null);
  assert.equal(recibidos[1].codigo, e.codigo);
  assert.notEqual(recibidos[1].envio_id, e.envio_id);

  // 7. con todo contestado, ninguna respuesta puede faltar en lo que llega a la planilla
  const Q = (() => { const w = {}; new Function("window", fs.readFileSync(path.join(RAIZ, "cuestionario.js"), "utf8"))(w); return w.Cuestionario; })();
  const claves = (pasos) => pasos.flatMap((p) => p.preguntas.flatMap((q) => (q.filas ? q.filas.map((f) => q.id + "_" + f.id) : [q.id])));
  const faltanA = claves(Q.parteA).filter((k) => e.parteA[k] == null || e.parteA[k] === "");
  assert.deepEqual(faltanA, [], "Parte A: faltan respuestas " + faltanA);
  for (const r of recibidos) {
    const faltanB = claves(Q.parteB).filter((k) => r.parteB[k] == null || r.parteB[k] === "");
    assert.deepEqual(faltanB, [], "Parte B del punto " + r.punto + ": faltan respuestas " + faltanB);
    assert.equal(r.parteB.orden_B2.split("-").length, 8);
    assert.ok(r.parteB.duracion_s !== "" && r.parteB.inicio && r.parteB.fin);
  }
  console.log("Preguntas verificadas por punto:", claves(Q.parteB).length, "de la Parte B y", claves(Q.parteA).length, "de la Parte A");

  assert.deepEqual(errores, [], "errores de JavaScript en la página");
  console.log("OK. Capturas en", CAPTURAS);
  chrome.kill(); servidor.close(); process.exit(0);
}

main().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
