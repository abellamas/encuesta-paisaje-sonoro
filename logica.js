// Lógica sin pantalla: azar, códigos, cola de envíos y reintentos. Se prueba con Node (test/).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Logica = factory();
})(this, function () {
  const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0, 1, I, L, O

  // Entero al azar en [0, n) sin sesgo, con el generador del navegador.
  function crearRng(cripto) {
    const c = cripto || (typeof crypto !== "undefined" ? crypto : require("crypto").webcrypto);
    return function (n) {
      const limite = Math.floor(0x100000000 / n) * n;
      const b = new Uint32Array(1);
      let x;
      do { c.getRandomValues(b); x = b[0]; } while (x >= limite);
      return x % n;
    };
  }

  // Fisher-Yates: devuelve una copia mezclada.
  function barajar(lista, rng) {
    const a = lista.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng(i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function nuevoCodigo(rng, largo) {
    let s = "";
    for (let i = 0; i < (largo || 6); i++) s += ALFABETO[rng(ALFABETO.length)];
    return s;
  }

  function codigoValido(c) {
    return typeof c === "string" && new RegExp("^[" + ALFABETO + "]{6}$").test(c.trim().toUpperCase());
  }

  // Id de envío al azar, sin relación con el código del participante.
  function nuevoEnvioId(rng) { return nuevoCodigo(rng, 12); }

  // localStorage puede no existir (modo privado): se cae a memoria sin romper nada.
  function crearAlmacen(ls) {
    let real = null;
    try {
      real = ls || (typeof localStorage !== "undefined" ? localStorage : null);
      if (real) { real.setItem("__t", "1"); real.removeItem("__t"); }
    } catch (e) { real = null; }
    const memoria = {};
    return {
      get(k) {
        try {
          const v = real ? real.getItem(k) : memoria[k];
          return v == null ? null : JSON.parse(v);
        } catch (e) { return null; }
      },
      set(k, v) {
        const s = JSON.stringify(v);
        try { if (real) real.setItem(k, s); else memoria[k] = s; } catch (e) { memoria[k] = s; }
      },
      remove(k) {
        try { if (real) real.removeItem(k); } catch (e) { /* nada */ }
        delete memoria[k];
      },
      persistente: !!real
    };
  }

  // Cola de envíos pendientes: lo que no se confirmó queda guardado en el celular.
  function crearCola(almacen, clave) {
    return {
      todos() { return almacen.get(clave) || []; },
      agregar(item) {
        const l = this.todos();
        if (!l.some((x) => x.envio_id === item.envio_id)) l.push(item);
        almacen.set(clave, l);
      },
      quitar(id) { almacen.set(clave, this.todos().filter((x) => x.envio_id !== id)); },
      contar() { return this.todos().length; }
    };
  }

  async function enviarUno(item, cfg, fetchFn, timeoutMs) {
    if (!cfg.ENDPOINT) return { ok: false, motivo: "sin_endpoint" };
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 20000) : null;
    try {
      // Sin cabecera Content-Type: el navegador manda text/plain, que no exige preflight.
      const r = await fetchFn(cfg.ENDPOINT, {
        method: "POST",
        body: JSON.stringify(Object.assign({ token: cfg.TOKEN }, item)),
        signal: ctrl ? ctrl.signal : undefined
      });
      const j = await r.json();
      return { ok: !!(j && j.ok), duplicado: !!(j && j.duplicado), error: j && j.error };
    } catch (e) {
      return { ok: false, motivo: String((e && e.message) || e) };
    } finally {
      if (t) clearTimeout(t);
    }
  }

  let enCurso = false;
  // Intenta enviar todo lo pendiente, en orden. Se detiene en el primer fallo.
  async function vaciarCola(cola, cfg, fetchFn) {
    if (enCurso) return { enviados: 0, pendientes: cola.contar(), ocupado: true };
    enCurso = true;
    let enviados = 0;
    try {
      for (const it of cola.todos()) {
        const r = await enviarUno(it, cfg, fetchFn);
        if (!r.ok) break;
        cola.quitar(it.envio_id);
        enviados++;
      }
    } finally { enCurso = false; }
    return { enviados, pendientes: cola.contar() };
  }

  // Arma el envío que va a la planilla. Todo lo que no se contestó queda vacío.
  function construirEnvio(d) {
    const parteB = Object.assign({
      inicio: d.inicio, fin: d.fin,
      duracion_s: d.inicio && d.fin ? Math.round((Date.parse(d.fin) - Date.parse(d.inicio)) / 1000) : "",
      orden_B2: d.orden.join("-")
    }, d.parteB);
    return {
      envio_id: d.envio_id,
      version: d.version,
      codigo: d.codigo,
      punto: d.punto,
      consentimiento: !!d.consentimiento,
      parteA: d.parteA || null,
      parteB
    };
  }

  // Ángulos de los ocho atributos en el orden de la planilla (agradable, estimulante, con actividad, caótico,
  // desagradable, monótono, sin actividad, calmado). Los teóricos son los de la ISO/TS 12913-2 y los otros los
  // ajustados para el SATP en castellano (Vida y otros, 2023; Aletta y otros, 2024).
  const ANGULOS = { iso: [0, 45, 90, 135, 180, 225, 270, 315], castellano: [0, 41, 103, 147, 174, 238, 279, 332] };

  // Agrado (P) y actividad (E) de una respuesta, de -1 a 1. Con los ángulos teóricos es la ecuación de la ISO/TS 12913-3,
  //   P = [(p - a) + cos45 (ca - ch) + cos45 (v - m)] / (4 + raíz de 32),
  // y con otros ángulos es la misma proyección, centrada en 3 y normalizada para que el máximo sea 1.
  function proyeccionISO(valores, angulos) {
    if (!Array.isArray(valores) || valores.length !== 8 || valores.some((x) => !(x >= 1 && x <= 5))) return null;
    const ang = (angulos || ANGULOS.iso).map((g) => (g * Math.PI) / 180);
    const suma = (f) => valores.reduce((s, x, i) => s + (x - 3) * f(ang[i]), 0);
    const norma = (f) => 2 * ang.reduce((s, a) => s + Math.abs(f(a)), 0);
    return { P: suma(Math.cos) / norma(Math.cos), E: suma(Math.sin) / norma(Math.sin) };
  }

  return { ALFABETO, ANGULOS, proyeccionISO, crearRng, barajar, nuevoCodigo, codigoValido, nuevoEnvioId,
           crearAlmacen, crearCola, enviarUno, vaciarCola, construirEnvio };
});
