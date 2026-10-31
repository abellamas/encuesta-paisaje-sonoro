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

const recibidos = [], altas = [];   // las altas son el aviso de que alguien aceptó, con su código y su grupo
let falla = false;       // simula que no hay señal
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg" };

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method === "GET") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(url.searchParams.get("accion") === "recorrido" ? { ok: true, recorrido: url.searchParams.get("grupo") === "1" ? [3, 2, 1] : null } : { ok: true, grupo: 2, recorrido: null })); }   // el grupo que fijó el guía
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      if (falla) { res.writeHead(503); return res.end("sin servicio"); }
      const d = JSON.parse(cuerpo);
      if (d.tipo === "alta") { altas.push(d); res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ ok: true })); }
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
  if (f.startsWith("/config.js")) datos = Buffer.from(datos.toString().replace(/ENDPOINT: "[^"]*"/, 'ENDPOINT: "/api"').replace("SEGUNDOS_ESCUCHA: 60", "SEGUNDOS_ESCUCHA: 3"));
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
  const recorrer = async (pasos, ultimo, capturas) => {
    for (let i = 0; i < pasos; i++) {
      if (capturas) await captura(capturas + (i + 1));
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
  assert.equal(await js("getComputedStyle(document.querySelector('h1')).color"), "rgb(36, 99, 154)", "la Parte A va en azul");
  assert.equal(await js("document.body.dataset.parte"), "A");
  await elegir("¿Cuánto tardás", "Menos de 10 minutos caminando");
  // tocar de nuevo la opción elegida la borra, de la pantalla y de lo guardado
  await elegir("¿Cuánto tardás", "Menos de 10 minutos caminando");
  assert.equal(await js("document.querySelectorAll('#app input[type=radio]:checked').length"), 0, "debe quedar sin elegir");
  assert.equal(await js("JSON.parse(localStorage.getItem('persona')).parteA.A1_distancia"), null, "también se borra lo guardado");
  await elegir("¿Cuánto tardás", "Entre 10 y 30 minutos");
  assert.equal(await js("JSON.parse(localStorage.getItem('persona')).parteA.A1_distancia"), "10_30");
  await elegir("¿Cuánto tardás", "Entre 10 y 30 minutos");
  await elegir("¿Cuánto tardás", "Menos de 10 minutos caminando");
  assert.equal(await js("JSON.parse(localStorage.getItem('persona')).parteA.A1_distancia"), "menos_10");
  await js(`(()=>{const i=document.querySelector('input[type=number]'); i.value='35'; i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await elegir("¿Cuál es tu género", "Femenino");
  await boton("Siguiente");
  assert.ok((await js("document.querySelector('.modal').innerText")).includes("sin responder"), "debe avisar de lo que falta");
  await boton("Completar lo que falta");   // cierra el cuadro y se queda en el mismo paso
  await recorrer(3, "Terminar esta parte", "03-parteA-");

  // 3. elegir el punto en el desplegable
  await dormir(200);
  await captura("05-elegir-punto");
  await boton("Comenzar");
  assert.ok((await texto()).includes("Elegí el punto"));
  await elegirPunto(2);
  await boton("Comenzar");
  await dormir(200);
  await captura("06-escucha");
  assert.equal(await js("document.body.dataset.parte"), "B", "la escucha ya es de la Parte B");
  await boton("Comenzar el minuto de escucha");
  await dormir(3700);
  assert.ok((await texto()).includes("Listo"));
  await dormir(2300);   // pasa solo a las preguntas
  assert.equal(await js("document.body.dataset.parte"), "B");

  // 4. Parte B, con un cierre del navegador a mitad de camino
  await dormir(200);
  await captura("07-B1");
  assert.equal(await js("getComputedStyle(document.querySelector('h1')).color"), "rgb(31, 122, 77)", "la Parte B va en verde");
  assert.equal(await js("document.body.dataset.parte"), "B");
  await js(`(()=>{const f=[...document.querySelectorAll('fieldset.fila')].find(f=>f.innerText.startsWith('Sonidos naturales')); f.querySelectorAll('label.opcion')[3].querySelector('input').click();})()`);
  await completar(); await boton("Siguiente");
  const orden1 = await js("JSON.parse(localStorage.getItem('borrador')).orden.join('-')");
  await dormir(100);
  await captura("08-B2-atributos");
  await js(`(()=>{const f=[...document.querySelectorAll('fieldset.fila')].find(f=>f.querySelector('legend').innerText==='agradable'); f.querySelectorAll('label.opcion')[4].querySelector('input').click();})()`);
  // ---- se cierra el navegador acá (recarga) ----
  await cargar();
  assert.ok((await texto()).includes("Paso 2 de 4"), "debe volver al paso donde estaba");
  assert.equal(await js(`[...document.querySelectorAll('fieldset.fila')].find(f=>f.querySelector('legend').innerText==='agradable').querySelector('input:checked').nextSibling.textContent`), "Muy de acuerdo");
  assert.equal(await js("JSON.parse(localStorage.getItem('borrador')).orden.join('-')"), orden1, "el orden de los atributos no debe cambiar al recargar");
  await completar(); await boton("Siguiente");
  await captura("09-B3-B6");
  await elegir("En general, ¿cómo calificarías", "Bueno");
  await completar(); await boton("Siguiente");
  await js(`(()=>{const f=document.querySelectorAll('fieldset.fila')[0]; f.querySelectorAll('label.opcion')[5].querySelector('input').click();})()`);
  await completar();
  await captura("10-B7");

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
  assert.equal(e.parteA.A1_distancia, "menos_10");
  assert.equal(e.parteB.orden_B2, orden1);
  assert.equal(e.parteB.B2_agradable, 5);
  assert.equal(e.parteB.B1_naturales, 4);
  assert.equal(e.parteB.B3_global, 4);
  assert.equal(e.parteB.B7_a, 5);

  // 6. segundo punto: la Parte A no se vuelve a pedir y el consentimiento no se repite
  await boton("Seguir con otro punto");
  await dormir(200);
  assert.ok((await texto()).includes("Respondido"), "debe marcar el punto hecho");
  await elegirPunto(3);
  await boton("Comenzar"); await boton("Comenzar el minuto de escucha");
  await dormir(5700);   // termina la cuenta y pasa sola a las preguntas
  await recorrer(4, "Enviar respuestas");
  await dormir(1000);
  assert.equal(recibidos.length, 2);
  assert.equal(recibidos[1].consentimiento, false);
  assert.equal(recibidos[1].parteA, null);
  assert.equal(recibidos[1].codigo, e.codigo);
  assert.notEqual(recibidos[1].envio_id, e.envio_id);

  // 7. con todo contestado, ninguna respuesta puede faltar en lo que llega a la planilla
  const Q = (() => { const w = {}; new Function("window", fs.readFileSync(path.join(RAIZ, "cuestionario.js"), "utf8"))(w); return w.Cuestionario; })();
  const claves = Q.claves;   // incluye las columnas "_otro", que llegan siempre aunque estén vacías
  const faltanA = claves(Q.parteA).filter((k) => !k.endsWith("_otro") && (e.parteA[k] == null || e.parteA[k] === ""));
  assert.deepEqual(faltanA, [], "Parte A: faltan respuestas " + faltanA);
  for (const r of recibidos) {
    const faltanB = claves(Q.parteB).filter((k) => !k.endsWith("_otro") && (r.parteB[k] == null || r.parteB[k] === ""));
    assert.deepEqual(faltanB, [], "Parte B del punto " + r.punto + ": faltan respuestas " + faltanB);
    assert.equal(r.parteB.orden_B2.split("-").length, 8);
    assert.ok(r.parteB.duracion_s !== "" && r.parteB.inicio && r.parteB.fin);
  }
  // las columnas llegan siempre completas y en orden ascendente, no en el orden en que se contestó
  assert.deepEqual(Object.keys(e.parteA).filter((k) => !k.startsWith("t_") && k !== "grupo" && k !== "recorrido"), claves(Q.parteA), "Parte A fuera de orden");
  assert.equal(e.parteB.orden_en_recorrido, 1, "primer punto del recorrido");
  assert.equal(recibidos[1].parteB.orden_en_recorrido, 2, "segundo punto del recorrido");
  assert.ok(altas.some((a) => a.codigo === e.codigo && a.grupo === 2 && !("A2_edad" in a)), "al aceptar se avisa el código y el grupo, sin respuestas");
  assert.equal(e.parteA.grupo, 2, "el número de grupo viene del panel y se guarda con la Parte A");
  assert.ok(["A3_genero_otro", "A5_problema_audicion_otro", "A6_riesgo_auditivo_otro"].every((k) => k in e.parteA), "las columnas _otro llegan siempre");
  assert.ok(Object.keys(e.parteA).some((k) => k === "t_A_total_s") && e.parteA.t_A_total_s >= 0, "faltan los tiempos de la Parte A");
  for (const r of recibidos) {
    assert.deepEqual(Object.keys(r.parteB).filter((k) => !k.startsWith("t_") && k !== "orden_en_recorrido"), ["inicio", "fin", "duracion_s", "orden_B2", ...claves(Q.parteB)], "Parte B fuera de orden");
    assert.ok("t_B_total_s" in r.parteB && "t_sesion_s" in r.parteB, "faltan los tiempos de la Parte B");
    assert.ok(r.parteB.orden_B2.split("-").every((x) => Q.ATRIBUTOS.some((a) => a.id === x)), "orden_B2 debe usar los nombres en español");
  }
  assert.deepEqual(Q.ATRIBUTOS.map((a) => a.id).map((id) => "B2_" + id), claves(Q.parteB).filter((k) => k.startsWith("B2_")));
  console.log("Preguntas verificadas por punto:", claves(Q.parteB).length, "de la Parte B y", claves(Q.parteA).length, "de la Parte A");

  // 8. Reiniciar: advierte, deja cancelar, y borra lo no enviado (pero no lo ya enviado)
  assert.equal(await js("document.getElementById('btn-inicio').hidden"), false, "debe verse una vez aceptado el consentimiento");
  assert.equal(await js("document.getElementById('btn-inicio').innerText"), "Reiniciar");
  const antes = await texto();
  await clic("#btn-inicio"); await dormir(100);
  const aviso = await js("document.querySelector('.modal').innerText");
  assert.ok(aviso.includes("Se reiniciará la encuesta") && aviso.includes("Lo que ya enviaste no se pierde"), "debe advertir qué pasa");
  assert.equal(await js("getComputedStyle(document.getElementById('dlg-si')).backgroundColor"), "rgb(164, 38, 44)", "el botón de confirmar es rojo");
  await clic("#dlg-no");
  assert.equal(await texto(), antes, "si cancela se queda donde estaba");
  assert.equal(await js("!!document.querySelector('.modal')"), false);
  await clic("#btn-inicio"); await clic("#dlg-si"); await dormir(200);
  assert.ok((await texto()).includes("Acepto participar"), "vuelve a la primera pantalla");
  assert.equal(await js("document.getElementById('btn-inicio').hidden"), true, "no se muestra en la primera pantalla");
  assert.equal(await js("JSON.parse(localStorage.getItem('persona')).codigo"), null, "queda como participante nuevo");
  assert.equal(await js("JSON.parse(localStorage.getItem('cola_envios')||'[]').length"), 0);
  assert.ok((await js("document.querySelector('.cabecera img').getBoundingClientRect().height")) > 80, "el logo es grande en la primera pantalla");
  await captura("14-reiniciar");
  // y a mitad de la Parte A
  await clic("#acepto"); await clic("button.principal"); await dormir(200);
  assert.ok((await js("document.querySelector('.cabecera img').getBoundingClientRect().height")) < 60, "el logo vuelve a su tamaño normal");
  await elegir("¿Cuánto tardás", "Menos de 10 minutos caminando");
  await clic("#btn-inicio"); await clic("#dlg-si"); await dormir(200);
  assert.ok((await texto()).includes("Acepto participar"));
  assert.deepEqual(await js("JSON.parse(localStorage.getItem('persona')).parteA"), {}, "se borra la Parte A no enviada");
  assert.equal(recibidos.length, 2, "reiniciar no envía nada");

  // 9. al terminar los tres puntos aparece la pregunta abierta, una sola vez
  await js(`localStorage.setItem('persona', JSON.stringify({codigo:'ABC234',consintio:true,consentimiento_enviado:true,parteA:{},parteA_ok:true,parteA_enviada:true,paso_A:2,puntos_hechos:[1,2,3]})); localStorage.removeItem('borrador'); localStorage.removeItem('cola_envios');`);
  await cargar();
  assert.ok((await texto()).includes("Pensando en todo el paseo"), "debe aparecer la pregunta final");
  await captura("15-comentario-final");
  await js(`(()=>{const t=document.getElementById('comentario'); t.value='Pájaros; me molestó el colectivo'; t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await boton("Enviar y terminar");
  await dormir(1000);
  assert.equal(recibidos.length, 3);
  assert.equal(recibidos[2].tipo, "comentario");
  assert.equal(recibidos[2].comentario, "Pájaros; me molestó el colectivo");
  assert.equal(recibidos[2].codigo, "ABC234");
  assert.ok(!(await texto()).includes("Pensando en todo el paseo"), "la pregunta no se repite");
  assert.ok((await texto()).includes("Podés cerrar esta página"));

  // 10. modo piloto. Código con PILOTO, versión "piloto", foto debajo y la grabación una sola vez
  await js("localStorage.clear()");
  await cdp("Page.navigate", { url: "http://127.0.0.1:" + puerto + "/?piloto=1" }); await dormir(700);
  assert.ok(await js("!!document.querySelector('.banda-piloto')"), "debe avisar que es el piloto");
  await clic("#acepto"); await clic("button.principal"); await dormir(200);
  await recorrer(3, "Terminar esta parte");
  await elegirPunto(3);
  await boton("Comenzar"); await dormir(200);
  assert.ok((await js("document.querySelector('img.foto-lugar').getAttribute('src')")).includes("piloto/fotos/mesitas.jpg"), "foto del punto elegido");
  await captura("16-piloto-escucha");
  assert.ok(String(await js("JSON.parse(localStorage.getItem('persona')).codigo")).startsWith("PILOTO-"), "el código empieza con PILOTO");
  await boton("Comenzar el minuto de escucha"); await dormir(300);
  assert.equal(await js("JSON.parse(localStorage.getItem('borrador')).audio_hecho"), true, "la grabación se marca como ya reproducida");
  await dormir(5700);
  await recorrer(4, "Enviar respuestas"); await dormir(1000);
  const p = recibidos[recibidos.length - 1];
  assert.equal(p.version, "piloto");
  assert.ok(p.codigo.startsWith("PILOTO-"));

  // 11. un avance guardado por una versión anterior (con más pasos) no rompe la página
  await js(`localStorage.setItem('borrador', JSON.stringify({fase:'B', punto:1, paso:4, resp:{}, orden:${JSON.stringify(Q.ATRIBUTOS.map((a) => a.id))}, inicio:null, escucha_hasta:null}))`);
  await cargar();
  assert.ok((await texto()).includes("Paso 4 de 4"), "debe caer en el último paso que existe");

  // 12. el recorrido del grupo. El hub muestra el punto que toca y no deja elegir otro
  await cdp("Page.navigate", { url: "http://127.0.0.1:" + puerto + "/estilos.css" }); await dormir(400);   // sin la encuesta abierta, que seguiría guardando
  await js(`localStorage.removeItem('borrador'); localStorage.setItem('persona', JSON.stringify({codigo:'ABC234',consintio:true,consentimiento_enviado:true,parteA:{},parteA_ok:true,parteA_enviada:true,paso_A:2,puntos_hechos:[3],grupo:1,recorrido:[3,2,1]}))`);
  await cargar();
  assert.ok((await texto()).includes("ahora te toca"), "dice qué punto toca");
  assert.ok((await texto()).includes("Entrada Corrientes y Newbery"), "el segundo punto del recorrido 3, 2, 1");
  assert.equal(await js("!!document.getElementById('punto')"), false, "no hay lista para elegir el lugar");
  await boton("Comenzar"); await dormir(200);
  assert.equal(await js("JSON.parse(localStorage.getItem('borrador')).punto"), 2, "empieza el punto que toca");
  // si el guía quita el recorrido en el panel, vuelve la lista para elegir
  await cdp("Page.navigate", { url: "http://127.0.0.1:" + puerto + "/estilos.css" }); await dormir(400);
  await js(`localStorage.removeItem('borrador'); localStorage.setItem('persona', JSON.stringify({codigo:'ABC234',consintio:true,consentimiento_enviado:true,parteA:{},parteA_ok:true,parteA_enviada:true,paso_A:2,puntos_hechos:[3],grupo:5,recorrido:[3,2,1]}))`);
  await cargar(); await dormir(600);
  assert.equal(await js("!!document.getElementById('punto')"), true, "el panel quitó el recorrido y se vuelve a elegir a mano");

  assert.deepEqual(errores, [], "errores de JavaScript en la página");
  console.log("OK. Capturas en", CAPTURAS);
  chrome.kill(); servidor.close(); process.exit(0);
}

main().catch((e) => { console.error("FALLÓ:", e.message); process.exit(1); });
