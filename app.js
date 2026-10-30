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
  // Modo piloto (?piloto=1). Muestra la foto y pasa la grabación de cada punto una sola vez. Las respuestas
  // se guardan con la versión "piloto" y un código que empieza con PILOTO, para no mezclarlas con las reales.
  const piloto = /[?&]piloto(=|&|$)/.test(location.search);
  const VERSION = piloto ? "piloto" : C.VERSION;
  const nombreDe = (id) => (C.PUNTOS.find((p) => p.id === id) || {}).nombre;
  const letraDe = (id) => (C.PUNTOS.find((p) => p.id === id) || {}).letra;   // A, B o C, como se nombra cada punto en el panel
  if (piloto) document.body.insertBefore(h("div", { class: "banda-piloto" }, "Modo piloto. Tus respuestas se guardan como prueba."), aviso);

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

  // ---- tiempos por paso, en segundos ----------------------------------------------------
  // seg: tiempo en pantalla. pausa: tiempo con la página cerrada o en segundo plano. rec: recargas.
  // Todo vive dentro de persona.t (Parte A) y borrador.t (Parte B), así sobrevive a una recarga.
  const dos = (n) => String(n).padStart(2, "0");
  const hora = () => { const d = new Date(); return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate()) + " " + dos(d.getHours()) + ":" + dos(d.getMinutes()) + ":" + dos(d.getSeconds()); };
  const nuevoT = () => ({ seg: {}, pausa: {}, rec: {}, vivo: null, actual: null, inicio_hora: hora() });
  const asegurarT = (o) => { if (!o.t) o.t = nuevoT(); return o.t; };
  const entero = (x) => Math.round(x || 0);
  const suma = (o) => Object.values(o || {}).reduce((s, x) => s + x, 0);
  let medidor = null;
  function sumar() {
    if (!medidor) return;
    const ahora = Date.now(), dt = (ahora - medidor.ultimo) / 1000, t = medidor.t, k = medidor.clave;
    const dest = medidor.vis ? t.seg : t.pausa;
    dest[k] = (dest[k] || 0) + dt;
    medidor.ultimo = ahora; medidor.vis = !document.hidden; t.vivo = ahora;
    guardar();
  }
  function parar() {
    if (!medidor) return;
    sumar(); clearInterval(medidor.int); medidor.t.actual = null; medidor = null; guardar();
  }
  function medir(t, clave) {
    parar();
    t.actual = clave; t.vivo = Date.now();
    medidor = { t, clave, ultimo: Date.now(), vis: !document.hidden, int: setInterval(sumar, 2000) };
  }
  document.addEventListener("visibilitychange", sumar);
  window.addEventListener("pagehide", sumar);
  // Si la página se recargó o se cerró a mitad de un paso, el tiempo cerrado se anota aparte como pausa.
  function recuperarPausas() {
    for (const t of [persona.t, borrador && borrador.t]) {
      if (!t || !t.actual || !t.vivo) continue;
      const k = t.actual;
      t.pausa[k] = (t.pausa[k] || 0) + (Date.now() - t.vivo) / 1000;
      t.rec[k] = (t.rec[k] || 0) + 1;
      t.vivo = Date.now();
    }
    guardar();
  }
  function camposTiempoA() {
    const t = asegurarT(persona), o = { t_A_inicio: t.inicio_hora, t_A_fin: t.fin_hora || hora() };
    for (const p of Q.parteA) { o["t_A_" + p.id + "_s"] = entero(t.seg[p.id]); o["t_A_" + p.id + "_pausa_s"] = entero(t.pausa[p.id]); }
    o.t_A_total_s = entero(suma(t.seg)); o.t_A_pausa_s = entero(suma(t.pausa)); o.t_A_recargas = suma(t.rec);
    return o;
  }
  function camposTiempoB() {
    const t = asegurarT(borrador), o = { t_B_inicio: t.inicio_hora, t_B_fin: hora() };
    for (const k of ["escucha"].concat(Q.parteB.map((p) => p.id))) { o["t_B_" + k + "_s"] = entero(t.seg[k]); o["t_B_" + k + "_pausa_s"] = entero(t.pausa[k]); }
    o.t_B_total_s = entero(suma(t.seg)); o.t_B_pausa_s = entero(suma(t.pausa)); o.t_B_recargas = suma(t.rec);
    o.t_sesion_s = persona.t && persona.t.sesion_inicio ? entero((Date.now() - persona.t.sesion_inicio) / 1000) : "";
    return o;
  }

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
  let marcandoFaltas = false;   // mientras es true, lo que falta responder se ve en naranja y se limpia al responder
  function marcarFaltas() {
    const unidades = [...document.querySelectorAll("#app .fila, #app .pregunta")].filter((el) => !el.querySelector(".fila"));
    for (const el of unidades) {
      const radios = el.querySelector('input[type="radio"]'), num = el.querySelector('input[type="number"]');
      if (!radios && !num) continue;   // las de texto libre son opcionales de verdad
      const falta = radios ? !el.querySelector('input[type="radio"]:checked') : num.value === "";
      el.classList.toggle("falta", falta);
    }
    for (const caja of document.querySelectorAll("#app .otro-caja")) {
      caja.classList.toggle("falta", !caja.hidden && !caja.querySelector("input").value.trim());
    }
  }
  ["change", "input", "click"].forEach((ev) => app.addEventListener(ev, () => { if (marcandoFaltas) setTimeout(marcarFaltas, 0); }));

  function mostrar(...nodos) {
    marcandoFaltas = false;
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
      const tecla = (e) => { if (e.key === "Escape") cerrar(!!opc.escapeSi); };
      const bNo = h("button", { type: "button", id: "dlg-no", onclick: () => cerrar(false) }, opc.no || "No");
      const bSi = h("button", { type: "button", id: "dlg-si", class: opc.peligro ? "peligro" : "principal", onclick: () => cerrar(true) }, opc.si || "Sí");
      const fondo = h("div", { class: "modal-fondo" },
        h("div", { class: opc.suave ? "modal suave" : "modal", role: "alertdialog", "aria-modal": "true", "aria-labelledby": "dlg-tit", "aria-describedby": "dlg-msg" },
          opc.titulo && h("h2", { id: "dlg-tit" }, opc.titulo),
          h("p", { id: "dlg-msg" }, opc.mensaje), h("div", { class: "acciones" }, bNo, bSi)));
      document.body.append(fondo);
      document.addEventListener("keydown", tecla);
      (opc.focoSi ? bSi : bNo).focus();
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
      mensaje: "Se reiniciará la encuesta y volverá a la primera pantalla. Se borrarán las respuestas de este participante que todavía no enviaste. Lo que ya enviaste no se pierde.",
      si: "Sí, reiniciar", no: "No, seguir acá", peligro: true
    });
    if (!ok) return;
    parar();
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
      const conTexto = q.opciones.find((o) => o.escribir);
      const idOtro = uid();
      const otro = conTexto && h("input", { id: idOtro, type: "text", maxlength: 100, class: "otro", placeholder: "Escribilo acá" });
      const caja = otro && h("div", { class: "otro-caja" }, h("label", { for: idOtro }, conTexto.escribir), otro);
      if (otro) {
        otro.value = vals[q.id + "_otro"] || "";
        caja.hidden = vals[q.id] !== conTexto.v;
        otro.addEventListener("input", () => set(q.id + "_otro", otro.value));
      }
      const elegir = (v) => {
        set(q.id, v);
        if (otro) { caja.hidden = v !== conTexto.v; if (caja.hidden) { otro.value = ""; delete vals[q.id + "_otro"]; cambio(); } }
      };
      return h("fieldset", { class: "pregunta" }, h("legend", null, q.texto), q.ayuda && h("p", { class: "ayuda" }, q.ayuda),
        h("div", { class: q.enFila ? "opciones en-fila" : "opciones", style: q.enFila ? "grid-template-columns:repeat(" + q.opciones.length + ",1fr)" : null },
          q.opciones.map((o) => radio(name, o, vals[q.id], elegir))), caja);
    }
    if (q.tipo === "numero") {
      const id = uid();
      const inp = h("input", { id, type: "number", inputmode: "numeric", min: q.min, max: q.max, value: vals[q.id] != null ? vals[q.id] : "" });
      const err = h("p", { class: "mensaje error", role: "alert", hidden: true });
      inp.addEventListener("input", () => {
        const raw = inp.value, num = Number(raw);
        // solo números enteros dentro del rango; type=number deja pasar letras como la "e" o signos
        const mal = inp.validity.badInput || (raw !== "" && (!/^\d+$/.test(raw) || num < q.min || num > q.max));
        inp.setAttribute("aria-invalid", mal ? "true" : "false");
        err.hidden = !mal;
        err.textContent = mal ? "Escribí solo números enteros, entre " + q.min + " y " + q.max + "." : "";
        set(q.id, raw === "" || mal ? null : num);
      });
      return h("div", { class: "pregunta" }, h("label", { for: id, style: "font-weight:600;display:block;margin-bottom:8px" }, q.texto),
        h("div", { class: "con-unidad" }, inp, q.unidad && h("span", null, q.unidad)), err);
    }
    if (q.tipo === "texto") {
      const id = uid();
      const ta = h("textarea", { id, maxlength: 1000, rows: 5 });
      ta.value = vals[q.id] || "";
      ta.addEventListener("input", () => set(q.id, ta.value));
      return h("div", { class: "pregunta" }, h("label", { for: id, style: "font-weight:600;display:block;margin-bottom:8px" }, q.texto), ta);
    }
    // Grillas, de a una fila por tarjeta. Las escalas numeradas van en horizontal; las demás, en lista.
    const horizontal = q.tipo === "atributos" || q.tipo === "escala7" || q.tipo === "escala";
    const filas = q.tipo === "atributos" ? ordenAtributos.map((id) => q.filas.find((f) => f.id === id)) : (q.filas || [{ id: null, t: "" }]);   // sin filas, una sola fila con la clave de la pregunta
    let opciones, extremos, leyenda, leyendaLista, conTexto = false;
    // Si las palabras son cortas (caben en dos renglones bajo cada círculo) van debajo del círculo; si no, en una lista arriba.
    const caben = (ord) => ord.every((o) => o.t.length <= 22 && Math.max(...o.t.split(" ").map((w) => w.length)) <= 14);
    const puntos = (ord, forzar) => {
      conTexto = forzar || (!q.lista && caben(ord));   // q.lista fuerza la lista arriba
      opciones = ord.map((o) => ({ v: o.v, t: conTexto ? o.t.replace("ni en", "ni\u00A0en").replace("Completamente", "Comple\u00ADta\u00ADmente").replace(/(\S{4,})mente/g, "$1\u00ADmente") : String(o.v), aria: o.v + ", " + o.t }));   // guion suave antes de "mente" para cortar bien en celulares angostos
      if (!conTexto) {
        extremos = [ord[0].t, ord[ord.length - 1].t];
        leyendaLista = h("ul", { class: "leyenda" }, q.leyendaTitulo && h("li", { class: "leyenda-titulo" }, q.leyendaTitulo), ord.map((o) => h("li", null, h("strong", null, o.v), " = " + o.t)));
      }
    };
    if (q.tipo === "escala") {   // valores de menor a mayor, con todas las palabras en una leyenda
      puntos(q.opciones.slice().sort((x, y) => x.v - y.v));
    } else if (q.tipo === "escala7") {
      opciones = [0, 1, 2, 3, 4, 5, 6].map((v) => ({ v, t: String(v), aria: v === 0 ? "0, nada" : v === 6 ? "6, completamente" : String(v) }));
      extremos = q.extremos; leyenda = "0 = " + q.extremos[0] + ", 6 = " + q.extremos[1];
    } else if (q.tipo === "atributos") {
      puntos(q.opciones.slice().sort((x, y) => x.v - y.v), true);   // las ocho escalas llevan siempre las palabras debajo, en una fila más ancha
    } else {
      opciones = q.opciones;
    }
    return h("fieldset", { class: "pregunta" }, h("legend", null, q.texto), q.ayuda && h("p", { class: "ayuda" }, q.ayuda),
      leyenda && h("p", { class: "ayuda" }, leyenda), leyendaLista,
      filas.map((f) => {
        const name = uid();
        const k = f.id == null ? q.id : clave(f.id);
        const lista = h("div", { class: horizontal ? "escala n" + opciones.length + (q.tipo === "escala" || q.tipo === "atributos" || q.tipo === "escala7" ? " puntos" : "") + (conTexto ? " con-texto" : "") + (conTexto && q.tipo === "atributos" ? " ancha" : "") : "opciones", style: horizontal ? "grid-template-columns:repeat(" + opciones.length + ",minmax(0,1fr))" : null },
          opciones.map((o) => radio(name, o, vals[k], (v) => set(k, v))));
        return h("fieldset", { class: "fila" }, f.t && h("legend", null, f.t), lista,
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

  // Cuántas veces quedó en blanco el campo "¿Cuál?" de una opción que lo pide.
  function otrosVacios(preguntas, vals) {
    let n = 0;
    for (const q of preguntas) {
      const o = q.opciones && q.opciones.find((x) => x.escribir);
      if (o && vals[q.id] === o.v && !String(vals[q.id + "_otro"] || "").trim()) n++;
    }
    return n;
  }

  // Un paso con sus preguntas y los botones. avanzar() recibe true si hay que seguir.
  function pantallaPaso(cfg) {
    const { titulo, intro, i, n, preguntas, vals, ordenAtributos, atras, siguiente, textoSiguiente } = cfg;
    const cambio = cfg.cambio;
    const cuerpo = preguntas.map((q) => render(q, vals, cambio, ordenAtributos));
    const btnSig = h("button", { class: "principal", onclick: async () => {
      const malo = document.querySelector('#app input[aria-invalid="true"]');
      if (malo) { malo.focus(); return; }   // un número mal escrito frena el avance hasta corregirlo
      const faltan = sinResponder(preguntas, vals), vacios = otrosVacios(preguntas, vals);
      if (faltan || vacios) {
        const partes = [];
        if (faltan) partes.push(faltan === 1 ? "Queda 1 pregunta sin responder." : "Quedan " + faltan + " preguntas sin responder.");
        if (vacios) partes.push("Falta escribir el detalle.");
        const completar = await preguntar({
          titulo: "Falta responder algo", suave: true, focoSi: true, escapeSi: true,
          mensaje: partes.join(" ") + " Podés seguir igual.",
          si: "Completar lo que falta", no: "Seguir igual"
        });
        if (completar) {
          marcandoFaltas = true; marcarFaltas();
          const primera = document.querySelector("#app .falta");
          if (primera) primera.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }
      siguiente();
    } }, textoSiguiente);
    mostrar(h("h1", null, titulo), intro && h("p", { class: "intro-paso" }, intro), progreso("Paso " + (i + 1) + " de " + n, i + 1, n),
      h("p", { class: "suave" }, "Para borrar una respuesta, tocá de nuevo la opción elegida."),
      h("div", { class: "tarjeta" }, cuerpo),
      h("div", { class: "acciones" }, atras && h("button", { onclick: atras }, "Atrás"), btnSig));
  }

  // ---- flujo --------------------------------------------------------------------------
  // Pide el número de grupo que fijó el guía en el panel. Si no hay señal queda vacío y la encuesta sigue igual.
  async function pedirGrupo() {
    if (!C.ENDPOINT) return;
    try {
      const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(C.ENDPOINT + "?accion=grupo", { signal: ctrl.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j && j.ok && j.grupo) { persona.grupo = j.grupo; persona.recorrido = Array.isArray(j.recorrido) ? j.recorrido : null; guardar(); }
    } catch (e) { /* sin señal, sigue sin número de grupo */ }
  }

  // Si el guía cambió el recorrido del grupo en el panel, la lista de puntos se actualiza sola.
  async function actualizarRecorrido() {
    if (!C.ENDPOINT || !persona.grupo) return;
    try {
      const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(C.ENDPOINT + "?accion=recorrido&grupo=" + persona.grupo, { signal: ctrl.signal });
      clearTimeout(t);
      const j = await r.json();
      const nuevo = j && j.ok && Array.isArray(j.recorrido) ? j.recorrido : null;
      if (JSON.stringify(nuevo) !== JSON.stringify(persona.recorrido || null)) {
        persona.recorrido = nuevo; guardar();
        if (pantalla === "hub") pantallaInicioPunto();
      }
    } catch (e) { /* sin señal, queda lo que había */ }
  }

  function pantallaConsentimiento() {
    pantalla = "consentimiento";
    parar();
    const intro = h("p", null, "Esta encuesta es parte de mi investigación para mi Tesis de la carrera de Ingeniería de Sonido por la Universidad Nacional de Tres de Febrero (UNTREF).");
    const items = h("ul", { class: "lista" },
      h("li", null, "La encuesta es ", h("strong", null, "anónima, voluntaria"), " y ", h("strong", null, "todas las preguntas son opcionales"), "."),
      h("li", null, "Al inicio, por única vez, se te preguntarán ", h("strong", null, "datos personales y de bienestar"), ". Es importante tu sinceridad, recordá que es anónima."),
      h("li", null, "Vas a recorrer ", h("strong", null, "3 puntos de escucha"), " dentro del parque y en cada uno vas a escuchar durante ", h("strong", null, "1 minuto"), " sin realizar nada más que la escucha. Luego vas a proceder a completar una parte de la encuesta. Esto se repetirá en cada punto que transitemos."),
      h("li", null, "Es necesario que ", h("strong", null, "permanezcas en silencio"), " una vez iniciado el paseo, hasta recorrer y evaluar los 3 puntos. Si precisás ayuda, podés hablar con uno de mis compañeros."));
    const duracion = h("p", { class: "suave" }, "Duración aproximada, 15 minutos.");
    const chk = h("input", { type: "checkbox", id: "acepto" });
    const btn = h("button", { class: "principal", disabled: true, onclick: () => {
      persona.codigo = (piloto ? "PILOTO-" : "") + L.nuevoCodigo(rng);   // interno: une las respuestas de la misma persona, nadie lo ve
      persona.consintio = true;
      persona.t = nuevoT(); persona.t.sesion_inicio = Date.now();
      guardar();
      pedirGrupo();
      siguientePantalla();
    } }, "Comenzar");
    chk.addEventListener("change", () => { btn.disabled = !chk.checked; });
    mostrar(
      h("h1", null, "Evaluación del paisaje sonoro del Parque Los Andes"),
      h("div", { class: "tarjeta" }, h("p", null, "En esta encuesta vas a evaluar, a través de tu percepción, cómo es el paisaje sonoro de este parque urbano."), intro, items,
        h("label", { class: "consent", for: "acepto" }, chk, h("span", null, "Acepto participar.")),
        duracion),
      h("div", { class: "acciones" }, btn));
  }

  function pasoA(i) {
    pantalla = "parteA";
    i = Math.max(0, Math.min(i, Q.parteA.length - 1));
    persona.paso_A = i; guardar();
    medir(asegurarT(persona), Q.parteA[i].id);
    const pasos = Q.parteA;
    pantallaPaso({
      titulo: pasos[i].titulo,
      intro: pasos[i].intro, i, n: pasos.length, preguntas: pasos[i].preguntas, vals: persona.parteA,
      cambio: guardar,
      atras: i > 0 ? () => pasoA(i - 1) : null,
      textoSiguiente: i < pasos.length - 1 ? "Siguiente" : "Terminar esta parte",
      siguiente: () => { if (i < pasos.length - 1) pasoA(i + 1); else { parar(); persona.t.fin_hora = hora(); persona.parteA_ok = true; guardar(); pantallaInicioPunto(); } }
    });
  }

  function pantallaInicioPunto() {
    pantalla = "hub";
    parar();
    const hechos = persona.puntos_hechos;
    const sel = h("select", { id: "punto" },
      h("option", { value: "" }, "Elegir…"),
      C.PUNTOS.map((p) => h("option", { value: String(p.id) }, p.nombre + (hechos.includes(p.id) ? " (ya respondido)" : ""))));
    const err = h("div", { "aria-live": "polite" });
    const completos = C.PUNTOS.every((p) => hechos.includes(p.id));
    const sigue = persona.recorrido ? persona.recorrido.find((id) => !hechos.includes(id)) : null;   // el próximo punto del recorrido de su grupo
    actualizarRecorrido();
    const final = completos && !persona.comentario_enviado;   // la pregunta abierta se hace una sola vez, al terminar el paseo
    const ta = h("textarea", { id: "comentario", maxlength: 1000, rows: 5 });
    ta.value = persona.comentario_borrador || "";
    ta.addEventListener("input", () => { persona.comentario_borrador = ta.value; guardar(); });
    const enviarComentario = () => {
      const texto = ta.value.trim();
      if (texto) cola.agregar({ envio_id: L.nuevoEnvioId(rng), tipo: "comentario", version: VERSION, codigo: persona.codigo, comentario: texto });
      persona.comentario_enviado = true; persona.comentario_borrador = ""; guardar();
      reintentar(); pantallaInicioPunto();
    };
    mostrar(
      h("h1", null, completos ? "¡Muchas gracias!" : "Test de evaluación sonora"),
      persona.grupo ? h("p", { class: "suave" }, "Grupo " + persona.grupo) : null,
      h("div", { class: "tarjeta" },
        h("ul", { class: "puntos" }, C.PUNTOS.map((p) => h("li", null, h("span", null, p.nombre), hechos.includes(p.id) ? h("span", { class: "hecho" }, "Respondido") : h("span", { class: "suave" }, "Pendiente"))))),
      completos ? (final
        ? h("div", { class: "tarjeta" }, h("label", { for: "comentario", style: "font-weight:700;display:block;margin-bottom:8px" },
            "Pensando en todo el paseo, ¿qué sonido fue el que más te gustó y cuál el que menos? ¿Qué sonido te gustaría que disminuyera o que se agregara? ¿Por qué?"),
            h("p", { class: "suave" }, "Es opcional. Si no querés escribir nada, tocá el botón igual."), ta)
        : h("p", null, "Completaste los tres puntos. Podés cerrar esta página.")) : sigue
        ? h("div", { class: "tarjeta" }, h("p", { class: "suave" }, "Según el recorrido de tu grupo, ahora te toca"), h("h2", null, nombreDe(sigue)))
        : h("div", { class: "tarjeta" },
            h("label", { for: "punto", style: "font-weight:600;display:block;margin-bottom:8px" }, "¿En qué punto de escucha estás ahora?"), sel),
      err,
      h("div", { class: "acciones" },
        completos ? (final ? h("button", { class: "principal", onclick: enviarComentario }, "Enviar y terminar") : null) : h("button", { class: "principal", onclick: async () => {
          const id = sigue || Number(sel.value);   // con recorrido asignado no se elige el lugar
          if (!id) { err.replaceChildren(h("p", { class: "mensaje error" }, "Elegí el punto de escucha en el que estás.")); return; }
          if (hechos.includes(id) && !(await preguntar({ mensaje: "Ya respondiste este punto. ¿Querés responderlo de nuevo?", si: "Sí, de nuevo", no: "No" }))) return;
          borrador = { fase: "escucha", punto: id, paso: 0, resp: {}, orden: L.barajar(Q.ATRIBUTOS.map((a) => a.id), rng), inicio: null, escucha_hasta: null, t: nuevoT() };
          guardar(); pantallaEscucha();
        } }, "Comenzar")));
  }

  function pantallaEscucha() {
    pantalla = "escucha";
    medir(asegurarT(borrador), "escucha");
    let intervalo = null, wake = null, pase = null;
    const reloj = h("div", { class: "reloj", role: "timer", "aria-live": "off" }, formato(C.SEGUNDOS_ESCUCHA * 1000));
    const btn = h("button", { class: "principal" }, "Comenzar el minuto de escucha");
    const lugar = C.PUNTOS.find((p) => p.id === borrador.punto);
    const au = piloto && lugar.audio ? new Audio(lugar.audio) : null;   // sin controles, para que no se pueda repetir
    if (au) au.preload = "auto";
    const sonar = () => {
      if (!au || borrador.audio_hecho) return;   // se oye una sola vez, aunque se recargue la página
      borrador.audio_hecho = true; guardar();
      au.play().catch(() => {});
    };
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
        if (au) au.pause();
        btn.textContent = "Pasando a las preguntas…";
        pase = setTimeout(seguir, 2000);   // pasa solo a la encuesta
      }
    }
    function seguir() {
      clearInterval(intervalo); clearTimeout(pase);
      if (wake) wake.release().catch(() => {});
      borrador.fase = "B"; borrador.paso = 0; borrador.inicio = new Date().toISOString(); guardar();
      pasoB(0);
    }
    function empezar() {
      borrador.escucha_hasta = Date.now() + C.SEGUNDOS_ESCUCHA * 1000; guardar();
      btn.disabled = true; btn.textContent = "Escuchando…";
      sonar();
      if (navigator.wakeLock) navigator.wakeLock.request("screen").then((w) => { wake = w; }).catch(() => {});
      intervalo = setInterval(tic, 250); tic();
    }
    btn.onclick = empezar;
    mostrar(
      h("h1", null, C.PUNTOS.find((p) => p.id === borrador.punto).nombre),
      h("div", { class: "tarjeta" },
        piloto
          ? h("ul", { class: "lista" },
              h("li", null, "Usá auriculares y buscá un lugar tranquilo."),
              h("li", null, "Mirá la foto, imaginá que estás en ese lugar y escuchá la grabación durante un minuto, en silencio."),
              h("li", null, "La grabación se escucha una sola vez. Apretá el botón cuando estés listo."))
          : h("ul", { class: "lista" },
              h("li", null, "Escuchá el ambiente sonoro durante un minuto, en silencio, sin hablar con los demás y sin caminar."),
              h("li", null, "Orientá la cabeza igual que el guía."),
              h("li", null, "Iniciá el temporizador cuando el guía lo indique.")),
        reloj,
        piloto && lugar.foto ? h("img", { class: "foto-lugar", src: lugar.foto, alt: "Foto de " + lugar.nombre }) : null),
      h("div", { class: "acciones" }, btn));
    alSalir = () => { clearInterval(intervalo); clearTimeout(pase); if (au) au.pause(); if (wake) wake.release().catch(() => {}); };
    if (borrador.escucha_hasta) { empezar_continuar(); }
    function empezar_continuar() {   // se recargó la página con la cuenta en marcha
      btn.disabled = true; btn.textContent = "Escuchando…";
      intervalo = setInterval(tic, 250); tic();
    }
  }

  function pasoB(i) {
    pantalla = "parteB";
    i = Math.max(0, Math.min(i, Q.parteB.length - 1));   // un avance guardado con otra versión puede apuntar a un paso que ya no existe
    borrador.paso = i; guardar();
    medir(asegurarT(borrador), Q.parteB[i].id);
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
    parar();
    // Todas las claves, siempre en el orden de las preguntas, con vacío donde no se contestó.
    const completo = (claves, vals) => { const o = {}; for (const k of claves) o[k] = vals[k] == null ? null : vals[k]; return o; };
    const parteB = Object.assign({ orden_en_recorrido: persona.puntos_hechos.length + 1 }, completo(Q.claves(Q.parteB), borrador.resp), camposTiempoB());   // 1, 2 o 3 según el lugar que ocupa el punto en el recorrido de la persona
    const envio = L.construirEnvio({
      envio_id: L.nuevoEnvioId(rng), version: VERSION, codigo: persona.codigo, punto: borrador.punto,
      consentimiento: !persona.consentimiento_enviado,
      parteA: persona.parteA_enviada ? null : Object.assign({ grupo: persona.grupo || null, recorrido: persona.recorrido ? persona.recorrido.map(letraDe).join("") : null }, completo(Q.claves(Q.parteA), persona.parteA), camposTiempoA()),
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
        h("p", null, "Gracias. Respondiste «", C.PUNTOS.find((p) => p.id === punto).nombre, "»."),
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

  recuperarPausas();
  actualizarAviso();
  siguientePantalla();
  reintentar();
})();
