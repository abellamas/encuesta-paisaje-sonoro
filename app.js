// Pantallas de la encuesta. Todo lo que la persona responde se guarda en el celular al instante,
// de modo que si se cierra el navegador se retoma donde quedó.
(function () {
  "use strict";
  const C = window.CONFIG, L = window.Logica, Q = window.Cuestionario;
  const rng = L.crearRng();
  const alm = L.crearAlmacen();
  const cola = L.crearCola(alm, "cola_envios");
  const app = document.getElementById("app");
  const aviso = document.getElementById("aviso");

  // ---- estado guardado ----------------------------------------------------------------
  // persona: lo que se completa una sola vez (código, consentimiento, Parte A, puntos hechos).
  // borrador: el punto en curso (fase, paso, respuestas, orden de atributos).
  let persona = Object.assign({
    codigo: null, consintio: false, consentimiento_enviado: false,
    parteA: {}, parteA_ok: false, parteA_enviada: false, paso_A: 0, puntos_hechos: []
  }, alm.get("persona") || {});
  let borrador = alm.get("borrador");

  const guardar = () => { alm.set("persona", persona); if (borrador) alm.set("borrador", borrador); else alm.remove("borrador"); };
  const enProceso = () => persona.consintio && !persona.parteA_ok || !!borrador;

  window.addEventListener("beforeunload", (e) => {
    if (enProceso()) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---- utilidades de pantalla ---------------------------------------------------------
  function h(tag, attrs, ...hijos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of hijos.flat(Infinity)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  }
  let alSalir = null;          // limpieza de la pantalla que se deja (por ejemplo el cronómetro)
  let pantalla = "";           // consentimiento, parteA, hub, escucha, parteB o gracias
  function mostrar(...nodos) {
    if (alSalir) { alSalir(); alSalir = null; }
    actualizarBotonInicio();
    app.replaceChildren(...nodos.flat(Infinity).filter(Boolean));
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }
  // Pregunta de sí o no dentro de la página. Reemplaza a confirm(), que varios navegadores internos bloquean.
  function preguntar(opc) {
    return new Promise((resolve) => {
      const previo = document.activeElement;
      const cerrar = (v) => {
        document.removeEventListener("keydown", tecla);
        fondo.remove();
        if (previo && previo.focus) previo.focus();
        resolve(v);
      };
      const tecla = (e) => { if (e.key === "Escape") cerrar(false); };
      const bNo = h("button", { type: "button", id: "dlg-no", onclick: () => cerrar(false) }, opc.no || "No");
      const bSi = h("button", { type: "button", id: "dlg-si", class: opc.peligro ? "peligro" : "principal", onclick: () => cerrar(true) }, opc.si || "Sí");
      const fondo = h("div", { class: "modal-fondo" },
        h("div", { class: "modal", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "dlg-tit", "aria-describedby": "dlg-msg" },
          opc.titulo && h("h2", { id: "dlg-tit" }, opc.titulo),
          h("p", { id: "dlg-msg" }, opc.mensaje), h("div", { class: "acciones" }, bNo, bSi)));
      document.body.append(fondo);
      document.addEventListener("keydown", tecla);
      bNo.focus();
    });
  }
  let _uid = 0;
  const uid = () => "q" + (++_uid);

  function progreso(texto, i, n) {
    return h("div", { class: "progreso" }, h("small", null, texto),
      h("div", { class: "barra", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": n, "aria-valuenow": i },
        h("span", { style: "width:" + Math.round((i / n) * 100) + "%" })));
  }

  function radio(nombre, op, actual, alElegir) {
    const input = h("input", { type: "radio", name: nombre, value: String(op.v), "aria-label": op.aria || op.t });
    if (actual !== undefined && actual !== null && String(actual) === String(op.v)) { input.checked = true; input.dataset.sel = "1"; }
    input.addEventListener("click", () => {
      if (input.dataset.sel === "1") {     // tocar de nuevo la opción elegida la borra
        input.checked = false; input.dataset.sel = ""; alElegir(null); return;
      }
      document.querySelectorAll('input[type="radio"][name="' + nombre + '"]').forEach((r) => { r.dataset.sel = ""; });
      input.dataset.sel = "1";
      alElegir(op.v);
    });
    input.addEventListener("keydown", (e) => { if (e.key === " " && input.dataset.sel === "1") { e.preventDefault(); input.click(); } });
    return h("label", { class: "opcion" }, input, h("span", null, op.t));
  }

  // ---- botón "Ir al inicio" ------------------------------------------------------------
  const btnInicio = document.getElementById("btn-inicio");
  function actualizarBotonInicio() {
    document.body.dataset.pantalla = pantalla;
    document.body.dataset.parte = pantalla === "parteA" ? "A" : (pantalla === "escucha" || pantalla === "parteB") ? "B" : "";
    btnInicio.hidden = !(persona.consintio && pantalla !== "consentimiento");
  }
  btnInicio.addEventListener("click", () => reiniciar());

  async function reiniciar() {
    const ok = await preguntar({
      titulo: "¿Reiniciar la encuesta?",
      mensaje: "Se reiniciará la encuesta y volverá a la primera pantalla. Se borrarán las respuestas de este participante que todavía no envió. Lo que ya envió no se pierde.",
      si: "Sí, reiniciar", no: "No, seguir acá", peligro: true
    });
    if (!ok) return;
    persona = { codigo: null, consintio: false, consentimiento_enviado: false, parteA: {}, parteA_ok: false, parteA_enviada: false, paso_A: 0, puntos_hechos: [] };
    borrador = null; guardar(); pantallaConsentimiento();
  }

  // ---- aviso de envíos ----------------------------------------------------------------
  function actualizarAviso() {
    aviso.replaceChildren();
    if (!C.ENDPOINT) {
      aviso.hidden = false;
      aviso.append("Modo prueba. Las respuestas no se envían, sólo quedan en este celular.");
      return;
    }
    const n = cola.contar();
    aviso.hidden = n === 0;
    if (n) {
      aviso.append(n === 1 ? "Hay 1 respuesta guardada en este celular, pendiente de envío." : "Hay " + n + " respuestas guardadas en este celular, pendientes de envío.");
      aviso.append(h("button", { class: "enlace", onclick: () => reintentar(true) }, "Reintentar ahora"));
    }
  }
  async function reintentar() {
    if (!C.ENDPOINT || !cola.contar()) return actualizarAviso();
    await L.vaciarCola(cola, C, (u, o) => fetch(u, o));
    actualizarAviso();
    const est = document.getElementById("estado-envio");
    if (est) est.replaceChildren(textoEstadoEnvio());
  }
  function textoEstadoEnvio() {
    if (!C.ENDPOINT) return "Modo prueba, no se envía.";
    return cola.contar() ? "Guardado en este celular. Se enviará solo cuando haya señal." : "Enviado.";
  }
  setInterval(reintentar, 20000);
  window.addEventListener("online", reintentar);

  // ---- preguntas ----------------------------------------------------------------------
  function render(q, vals, cambio, ordenAtributos) {
    const clave = (sub) => q.id + "_" + sub;
    const set = (k, v) => { vals[k] = v; cambio(); };

    if (q.tipo === "opcion") {
      const name = uid();
      return h("fieldset", { class: "pregunta" }, h("legend", null, q.texto), q.ayuda && h("p", { class: "ayuda" }, q.ayuda),
        h("div", { class: "opciones" }, q.opciones.map((o) => radio(name, o, vals[q.id], (v) => set(q.id, v)))));
    }
    if (q.tipo === "numero") {
      const id = uid();
      const inp = h("input", { id, type: "number", inputmode: "numeric", min: q.min, max: q.max, value: vals[q.id] != null ? vals[q.id] : "" });
      inp.addEventListener("input", () => set(q.id, inp.value === "" ? null : Number(inp.value)));
      return h("div", { class: "pregunta" }, h("label", { for: id, style: "font-weight:600;display:block;margin-bottom:8px" }, q.texto),
        h("div", { class: "con-unidad" }, inp, q.unidad && h("span", null, q.unidad)));
    }
    if (q.tipo === "texto") {
      const id = uid();
      const ta = h("textarea", { id, maxlength: 1000, rows: 5 });
      ta.value = vals[q.id] || "";
      ta.addEventListener("input", () => set(q.id, ta.value));
      return h("div", { class: "pregunta" }, h("label", { for: id, style: "font-weight:600;display:block;margin-bottom:8px" }, q.texto), ta);
    }
    // Grillas, de a una fila por tarjeta. Las escalas numeradas van en horizontal; las demás, en lista.
    const horizontal = q.tipo === "atributos" || q.tipo === "escala7";
    const filas = q.tipo === "atributos" ? ordenAtributos.map((id) => q.filas.find((f) => f.id === id)) : q.filas;
    let opciones, extremos, leyenda;
    if (q.tipo === "escala7") {
      opciones = [0, 1, 2, 3, 4, 5, 6].map((v) => ({ v, t: String(v), aria: v === 0 ? "0, nada" : v === 6 ? "6, completamente" : String(v) }));
      extremos = q.extremos; leyenda = "0 = " + q.extremos[0] + ", 6 = " + q.extremos[1];
    } else if (q.tipo === "atributos") {
      const ord = q.opciones.slice().sort((a, b) => a.v - b.v);
      opciones = ord.map((o) => ({ v: o.v, t: String(o.v), aria: o.v + ", " + o.t }));
      extremos = [ord[0].t, ord[ord.length - 1].t];
      leyenda = ord.map((o) => o.v + " = " + o.t).join(". ") + ".";
    } else {
      opciones = q.opciones;
    }
    return h("fieldset", { class: "pregunta" }, h("legend", null, q.texto),
      leyenda && h("p", { class: "ayuda" }, leyenda),
      filas.map((f) => {
        const name = uid();
        const k = clave(f.id);
        const lista = h("div", { class: horizontal ? "escala n" + opciones.length : "opciones", style: horizontal ? "grid-template-columns:repeat(" + opciones.length + ",1fr)" : null },
          opciones.map((o) => radio(name, o, vals[k], (v) => set(k, v))));
        return h("fieldset", { class: "fila" }, h("legend", null, f.t), lista,
          extremos && h("div", { class: "extremos", "aria-hidden": "true" }, h("span", null, extremos[0]), h("span", null, extremos[1])));
      }));
  }

  function sinResponder(preguntas, vals) {
    let n = 0;
    for (const q of preguntas) {
      if (q.tipo === "texto") continue;
      if (q.filas) { for (const f of q.filas) if (vals[q.id + "_" + f.id] == null) n++; }
      else if (vals[q.id] == null || vals[q.id] === "") n++;
    }
    return n;
  }

  // Un paso con sus preguntas y los botones. avanzar() recibe true si hay que seguir.
  function pantallaPaso(cfg) {
    const { titulo, i, n, preguntas, vals, ordenAtributos, atras, siguiente, textoSiguiente } = cfg;
    let advertido = false;
    const msg = h("div", { "aria-live": "polite" });
    // Si ya se avisó y la persona termina de responder, el aviso desaparece solo.
    const cambio = () => {
      cfg.cambio();
      if (advertido && !sinResponder(preguntas, vals)) { msg.replaceChildren(); advertido = false; }
    };
    const cuerpo = preguntas.map((q) => render(q, vals, cambio, ordenAtributos));
    const btnSig = h("button", { class: "principal", onclick: () => {
      const faltan = sinResponder(preguntas, vals);
      if (faltan && !advertido) {
        advertido = true;
        msg.replaceChildren(h("p", { class: "mensaje aviso-suave" },
          (faltan === 1 ? "Queda 1 pregunta sin responder. " : "Quedan " + faltan + " preguntas sin responder. ") +
          "Puede continuar igual, todas son opcionales. Toque «" + textoSiguiente + "» otra vez para seguir."));
        return;
      }
      siguiente();
    } }, textoSiguiente);
    mostrar(h("h1", null, titulo), progreso("Paso " + (i + 1) + " de " + n, i + 1, n),
      h("p", { class: "suave" }, "Para borrar una respuesta, toque de nuevo la opción elegida."),
      h("div", { class: "tarjeta" }, cuerpo), msg,
      h("div", { class: "acciones" }, atras && h("button", { onclick: atras }, "Atrás"), btnSig));
  }

  // ---- flujo --------------------------------------------------------------------------
  function pantallaConsentimiento() {
    pantalla = "consentimiento";
    const intro = h("p", null, "Esta encuesta forma parte de una investigación de la Universidad Nacional de Tres de Febrero, de la carrera de Ingeniería de Sonido, sobre cómo las personas perciben los sonidos en los parques. Es ", h("strong", null, "anónima y voluntaria"), ", puede dejar de responder cuando quiera y ", h("strong", null, "todas las preguntas son opcionales"), ". Las respuestas se usarán sólo con fines de investigación y se guardarán sin su nombre.");
    const duracion = h("p", { class: "suave" }, "Duración aproximada, entre 15 y 20 minutos en total, repartidos en tres puntos del parque.");
    const chk = h("input", { type: "checkbox", id: "acepto" });
    const btn = h("button", { class: "principal", disabled: true, onclick: () => {
      persona.codigo = L.nuevoCodigo(rng);   // interno: une las respuestas de la misma persona, nadie lo ve
      persona.consintio = true;
      guardar();
      siguientePantalla();
    } }, "Comenzar");
    chk.addEventListener("change", () => { btn.disabled = !chk.checked; });
    mostrar(
      h("h1", null, "Paisaje sonoro en parques urbanos"),
      h("div", { class: "tarjeta" }, intro,
        h("label", { class: "consent", for: "acepto" }, chk, h("span", null, "Acepto participar.")),
        duracion),
      h("div", { class: "acciones" }, btn));
  }

  function pasoA(i) {
    pantalla = "parteA";
    persona.paso_A = i; guardar();
    const pasos = Q.parteA;
    pantallaPaso({
      titulo: "Parte A. Sobre usted", i, n: pasos.length, preguntas: pasos[i].preguntas, vals: persona.parteA,
      cambio: guardar,
      atras: i > 0 ? () => pasoA(i - 1) : null,
      textoSiguiente: i < pasos.length - 1 ? "Siguiente" : "Terminar esta parte",
      siguiente: () => { if (i < pasos.length - 1) pasoA(i + 1); else { persona.parteA_ok = true; guardar(); pantallaInicioPunto(); } }
    });
  }

  function pantallaInicioPunto() {
    pantalla = "hub";
    const hechos = persona.puntos_hechos;
    const sel = h("select", { id: "punto" },
      h("option", { value: "" }, "Elegir…"),
      C.PUNTOS.map((p) => h("option", { value: String(p.id) }, p.nombre + (hechos.includes(p.id) ? " (ya respondido)" : ""))));
    const err = h("div", { "aria-live": "polite" });
    const completos = C.PUNTOS.every((p) => hechos.includes(p.id));
    mostrar(
      h("h1", null, completos ? "¡Muchas gracias!" : "Punto de escucha"),
      h("div", { class: "tarjeta" },
        h("ul", { class: "puntos" }, C.PUNTOS.map((p) => h("li", null, h("span", null, p.nombre), hechos.includes(p.id) ? h("span", { class: "hecho" }, "Respondido") : h("span", { class: "suave" }, "Pendiente"))))),
      completos ? h("p", null, "Completó los tres puntos. Puede cerrar esta página.") : h("div", { class: "tarjeta" },
        h("label", { for: "punto", style: "font-weight:600;display:block;margin-bottom:8px" }, "¿En qué punto de escucha está ahora?"), sel),
      err,
      h("div", { class: "acciones" },
        completos ? null : h("button", { class: "principal", onclick: async () => {
          const id = Number(sel.value);
          if (!id) { err.replaceChildren(h("p", { class: "mensaje error" }, "Elija el punto de escucha en el que está.")); return; }
          if (hechos.includes(id) && !(await preguntar({ mensaje: "Ya respondió este punto. ¿Quiere responderlo de nuevo?", si: "Sí, de nuevo", no: "No" }))) return;
          borrador = { fase: "escucha", punto: id, paso: 0, resp: {}, orden: L.barajar(Q.ATRIBUTOS.map((a) => a.id), rng), inicio: null, escucha_hasta: null };
          guardar(); pantallaEscucha();
        } }, "Comenzar")));
  }

  function pantallaEscucha() {
    pantalla = "escucha";
    let intervalo = null, wake = null;
    const reloj = h("div", { class: "reloj", role: "timer", "aria-live": "off" }, formato(C.SEGUNDOS_ESCUCHA * 1000));
    const btn = h("button", { class: "principal" }, "Comenzar los tres minutos");
    const saltar = h("button", { class: "enlace", onclick: seguir }, "Pasar directo a las preguntas");
    function formato(ms) {
      const s = Math.max(0, Math.ceil(ms / 1000));
      return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    }
    function tic() {
      const resta = borrador.escucha_hasta - Date.now();
      reloj.textContent = formato(resta);
      if (resta <= 0) {
        clearInterval(intervalo);
        if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
        reloj.setAttribute("aria-live", "assertive");
        reloj.textContent = "Listo";
        btn.textContent = "Continuar con las preguntas";
        btn.disabled = false;
        btn.onclick = seguir;
      }
    }
    function seguir() {
      clearInterval(intervalo);
      if (wake) wake.release().catch(() => {});
      borrador.fase = "B"; borrador.paso = 0; borrador.inicio = new Date().toISOString(); guardar();
      pasoB(0);
    }
    function empezar() {
      borrador.escucha_hasta = Date.now() + C.SEGUNDOS_ESCUCHA * 1000; guardar();
      btn.disabled = true; btn.textContent = "Escuchando…";
      if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => { wake = w; }).catch(() => {});
      intervalo = setInterval(tic, 250); tic();
    }
    btn.onclick = empezar;
    mostrar(
      h("h1", null, C.PUNTOS.find((p) => p.id === borrador.punto).nombre),
      h("div", { class: "tarjeta" },
        h("p", null, "Escuche el ambiente sonoro durante tres minutos, en silencio y sin caminar, usando todos los sentidos. Después responda las preguntas, sin apurarse."),
        reloj),
      h("div", { class: "acciones" }, btn), h("p", null, saltar));
    alSalir = () => { clearInterval(intervalo); if (wake) wake.release().catch(() => {}); };
    if (borrador.escucha_hasta) { empezar_continuar(); }
    function empezar_continuar() {   // se recargó la página con la cuenta en marcha
      btn.disabled = true; btn.textContent = "Escuchando…";
      intervalo = setInterval(tic, 250); tic();
    }
  }

  function pasoB(i) {
    pantalla = "parteB";
    borrador.paso = i; guardar();
    const pasos = Q.parteB;
    const punto = C.PUNTOS.find((p) => p.id === borrador.punto);
    pantallaPaso({
      titulo: "Parte B. " + punto.nombre, i, n: pasos.length, preguntas: pasos[i].preguntas, vals: borrador.resp,
      ordenAtributos: borrador.orden, cambio: guardar,
      atras: i > 0 ? () => pasoB(i - 1) : null,
      textoSiguiente: i < pasos.length - 1 ? "Siguiente" : "Enviar respuestas",
      siguiente: () => { if (i < pasos.length - 1) pasoB(i + 1); else enviar(); }
    });
  }

  function enviar() {
    // Todas las claves, siempre en el orden de las preguntas, con vacío donde no se contestó.
    const completo = (claves, vals) => { const o = {}; for (const k of claves) o[k] = vals[k] == null ? null : vals[k]; return o; };
    const parteB = completo(Q.claves(Q.parteB), borrador.resp);
    const envio = L.construirEnvio({
      envio_id: L.nuevoEnvioId(rng), version: C.VERSION, codigo: persona.codigo, punto: borrador.punto,
      consentimiento: !persona.consentimiento_enviado,
      parteA: persona.parteA_enviada ? null : completo(Q.claves(Q.parteA), persona.parteA),
      inicio: borrador.inicio, fin: new Date().toISOString(), orden: borrador.orden, parteB
    });
    persona.consentimiento_enviado = true;
    persona.parteA_enviada = true;
    if (!persona.puntos_hechos.includes(borrador.punto)) persona.puntos_hechos.push(borrador.punto);
    const historial = alm.get("historial") || [];
    historial.push(envio); alm.set("historial", historial.slice(-60));
    cola.agregar(envio);
    const punto = borrador.punto;
    borrador = null; guardar();
    pantallaGracias(punto);
    reintentar();
  }

  function pantallaGracias(punto) {
    pantalla = "gracias";
    const faltan = C.PUNTOS.filter((p) => !persona.puntos_hechos.includes(p.id));
    mostrar(
      h("h1", null, "Respuestas registradas"),
      h("div", { class: "tarjeta" },
        h("p", null, "Gracias. Respondió el ", C.PUNTOS.find((p) => p.id === punto).nombre.toLowerCase(), "."),
        h("p", { id: "estado-envio", class: "mensaje ok", role: "status" }, textoEstadoEnvio())),
      h("div", { class: "acciones" }, h("button", { class: "principal", onclick: pantallaInicioPunto },
        faltan.length ? "Seguir con otro punto" : "Terminar")));
    actualizarAviso();
  }

  function siguientePantalla() {
    if (!persona.consintio) return pantallaConsentimiento();
    if (!persona.parteA_ok) return pasoA(persona.paso_A || 0);
    if (borrador && borrador.fase === "escucha") return pantallaEscucha();
    if (borrador && borrador.fase === "B") return pasoB(borrador.paso || 0);
    return pantallaInicioPunto();
  }

  actualizarAviso();
  siguientePantalla();
  reintentar();
})();
