// Contenido del cuestionario (Parte A una sola vez, Parte B en cada punto de escucha).
// Los códigos numéricos son los que quedan en la planilla.
window.Cuestionario = (function () {
  const ACUERDO = [
    { v: 5, t: "Muy de acuerdo" }, { v: 4, t: "De acuerdo" },
    { v: 3, t: "Ni de acuerdo ni en desacuerdo" },
    { v: 2, t: "En desacuerdo" }, { v: 1, t: "Muy en desacuerdo" }
  ];
  // Los ocho atributos de la norma ISO/TS 12913-2 en la versión del SATP (primera palabra), en el orden
  // de su ángulo teórico, de 0° a 315°. Ese es también el orden de las columnas en la planilla.
  const ATRIBUTOS = [
    { id: "agradable", t: "agradable" },          //   0°
    { id: "estimulante", t: "estimulante" },      //  45°
    { id: "con_actividad", t: "con actividad" },  //  90°
    { id: "caotico", t: "caótico" },              // 135°
    { id: "desagradable", t: "desagradable" },    // 180°
    { id: "monotono", t: "monótono" },            // 225°
    { id: "sin_actividad", t: "sin actividad" },  // 270°
    { id: "calmado", t: "calmado" }               // 315°
  ];
  const SI_NO = [{ v: "si", t: "Sí" }, { v: "no", t: "No" }];
  const SI_NO_NS = [{ v: "si", t: "Sí" }, { v: "no", t: "No" }, { v: "no_se", t: "No sé" }];

  const parteA = [
    { id: "pa1", titulo: "Parte A. Datos personales", preguntas: [
      { id: "A2_edad", tipo: "numero", texto: "¿Cuál es su edad?", min: 1, max: 110, unidad: "años" },
      { id: "A3_genero", tipo: "opcion", texto: "¿Cuál es su género?", enFila: true, opciones: [
        { v: "femenino", t: "Femenino" }, { v: "masculino", t: "Masculino" },
        { v: "otro", t: "Otro", escribir: "¿Cómo te autopercibís?" }] },
      { id: "A4_estudios", tipo: "opcion", texto: "¿Cuál es su nivel de estudios?", opciones: [
        { v: "primario_incompleto", t: "Primario incompleto" }, { v: "primario_completo", t: "Primario completo" },
        { v: "secundario_incompleto", t: "Secundario incompleto (o en curso)" }, { v: "secundario_completo", t: "Secundario completo" },
        { v: "terciario_universitario_incompleto", t: "Terciario o universitario incompleto (o en curso)" },
        { v: "terciario_universitario_completo", t: "Terciario o universitario completo" },
        { v: "posgrado", t: "Posgrado/Maestría" }] },
      { id: "A7_formacion_acustica", tipo: "opcion", texto: "¿Tiene formación o trabaja en acústica, ruido ambiental o planificación urbana?", enFila: true, opciones: SI_NO },
      { id: "A1_distancia", tipo: "opcion", texto: "¿Cuánto tardás en llegar a este parque desde donde vivís?", opciones: [
        { v: "menos_10", t: "Menos de 10 minutos caminando" }, { v: "10_30", t: "Entre 10 y 30 minutos" },
        { v: "mas_30_transporte", t: "Más de 30 minutos en transporte" },
        { v: "de_paso", t: "No vivo en la zona, solo estoy de paso por hoy" }] },
      { id: "A8_frecuencia_visita", tipo: "opcion", texto: "¿Con qué frecuencia visita este parque?", opciones: [
        { v: "casi_nunca", t: "Casi nunca" }, { v: "ocasional", t: "Ocasionalmente" }, { v: "fines_de_semana", t: "Fines de semana" },
        { v: "varias_por_semana", t: "Varias veces por semana" }, { v: "todos_los_dias", t: "Todos los días" }] }
    ] },
    { id: "pa2", titulo: "Parte A. Audición", preguntas: [
      { id: "A5_problema_audicion", tipo: "opcion", texto: "¿Tenés algún problema de audición que conozcas?", enFila: true, opciones: [
        { v: "si", t: "Sí", escribir: "¿Cuál?" }, { v: "no", t: "No" }, { v: "no_se", t: "No sé" }] },
      { id: "A5b_exposicion_24h", tipo: "opcion", texto: "¿En las últimas 24 horas escuchaste sonidos muy fuertes? (por ejemplo, recitales, boliches, auriculares a todo volumen o maquinaria ruidosa)", enFila: true, opciones: SI_NO_NS },
      { id: "A6_riesgo_auditivo", tipo: "opcion", texto: "¿Realiza de forma habitual actividades que usted considera riesgosas para su audición?", enFila: true, opciones: [
        { v: "si", t: "Sí", escribir: "¿Cuáles?" }, { v: "no", t: "No" }, { v: "no_se", t: "No sé" }] }
    ] },
    { id: "pa3", titulo: "Parte A. Índice de Bienestar OMS",
      intro: "Estas cinco frases son de un cuestionario breve de la Organización Mundial de la Salud (OMS) sobre cómo te sentiste de ánimo durante las últimas dos semanas. No hay respuestas correctas ni incorrectas.",
      preguntas: [
      { id: "A9_WHO5", tipo: "escala", texto: "Durante las últimas dos semanas…",
        opciones: [
          { v: 5, t: "Todo el tiempo" }, { v: 4, t: "La mayor parte del tiempo" },
          { v: 3, t: "Más de la mitad del tiempo" }, { v: 2, t: "Menos de la mitad del tiempo" },
          { v: 1, t: "De vez en cuando" }, { v: 0, t: "Nunca" }],
        filas: [
          { id: "a", t: "Me he sentido alegre y de buen humor." },
          { id: "b", t: "Me he sentido tranquilo/a y relajado/a." },
          { id: "c", t: "Me he sentido activo/a y enérgico/a." },
          { id: "d", t: "Me he despertado sintiéndome fresco/a y descansado/a." },
          { id: "e", t: "Mi vida cotidiana ha estado llena de cosas que me interesan." }] }
    ] }
  ];

  const parteB = [
    { id: "pb1", preguntas: [
      { id: "B1", tipo: "escala",
        texto: "¿Hasta qué punto puede oír en este momento los siguientes cuatro tipos de sonido?",
        opciones: [
          { v: 1, t: "Nada" }, { v: 2, t: "Un poco" }, { v: 3, t: "Moderadamente" },
          { v: 4, t: "Mucho" }, { v: 5, t: "Domina completamente" }],
        filas: [
          { id: "transito", t: "Tránsito (por ejemplo autos, colectivos, trenes, aviones)" },
          { id: "otros", t: "Otros sonidos (por ejemplo sirenas, obras, industria, carga y descarga)" },
          { id: "personas", t: "Sonidos de personas (por ejemplo conversaciones, risas, niños jugando, pasos)" },
          { id: "naturales", t: "Sonidos naturales (por ejemplo pájaros, agua que corre, viento en la vegetación)" }] }
    ] },
    { id: "pb2", preguntas: [
      { id: "B2", tipo: "atributos",
        texto: "¿Qué tan de acuerdo estás con que este paisaje sonoro es…?",
        opciones: ACUERDO, filas: ATRIBUTOS }
    ] },
    { id: "pb3", preguntas: [
      { id: "B3_global", tipo: "escala", texto: "En general, ¿cómo describiría el ambiente sonoro que lo rodea ahora?", opciones: [
        { v: 5, t: "Muy bueno" }, { v: 4, t: "Bueno" }, { v: 3, t: "Ni bueno ni malo" }, { v: 2, t: "Malo" }, { v: 1, t: "Muy malo" }] },
      { id: "B4_adecuacion", tipo: "escala", texto: "En general, ¿hasta qué punto es adecuado para este lugar el ambiente sonoro que lo rodea ahora?", opciones: [
        { v: 1, t: "Nada" }, { v: 2, t: "Levemente" }, { v: 3, t: "Moderadamente" }, { v: 4, t: "Muy" }, { v: 5, t: "Perfectamente" }] },
      { id: "B5_volumen", tipo: "escala", texto: "¿Cómo de alto (fuerte) diría que es el ambiente sonoro?", ayuda: "Valore el volumen, no la calidad.", opciones: [
        { v: 1, t: "Nada" }, { v: 2, t: "Un poco" }, { v: 3, t: "Moderadamente" }, { v: 4, t: "Muy" }, { v: 5, t: "Extremadamente" }] },
      { id: "B6_volver", tipo: "escala", texto: "¿Con qué frecuencia le gustaría volver a visitar este lugar?", opciones: [
        { v: 1, t: "Nunca" }, { v: 2, t: "Rara vez" }, { v: 3, t: "A veces" }, { v: 4, t: "A menudo" }, { v: 5, t: "Muy a menudo" }] }
    ] },
    { id: "pb4", preguntas: [
      { id: "B7", tipo: "escala",
        texto: "Indique su grado de acuerdo con que el paisaje sonoro que está oyendo ahora…",
        ayuda: "Un paisaje sonoro es el conjunto de sonidos que se perciben en un lugar determinado.",
        opciones: [   // palabras de la versión validada en castellano (Güngörmüş y otros, 2026, Tabla 1)
          { v: 0, t: "Nada" }, { v: 1, t: "Muy poco" }, { v: 2, t: "Un poco" }, { v: 3, t: "Algo" },
          { v: 4, t: "Bastante" }, { v: 5, t: "Mucho" }, { v: 6, t: "Completamente" }],
        filas: [
          { id: "a", t: "Encuentro este paisaje sonoro cautivador." },
          { id: "b", t: "Oír este paisaje sonoro me concede un descanso de mi rutina diaria." },
          { id: "c", t: "Cuando oigo este paisaje sonoro me abstraigo de mis preocupaciones y miedos." },
          { id: "d", t: "Este paisaje sonoro es afín a mis inclinaciones, preferencias o intereses personales." },
          { id: "e", t: "Todos los sonidos que estoy oyendo parecen pertenecer al mismo paisaje sonoro." },   // ítem 16 de la PRSS en castellano, en lugar del 18
          { id: "f", t: "Este paisaje sonoro suena muy espacioso." }] }
    ] }
  ];

  // Claves de las respuestas en el orden de las preguntas (A1, A2, ... B1, B2, ...). Sirve para que las
  // columnas de la planilla salgan siempre en el mismo orden, sin importar cómo contestó cada persona.
  const claves = (pasos) => pasos.flatMap((p) => p.preguntas.flatMap((q) => (q.filas ? q.filas.map((f) => q.id + "_" + f.id) : [q.id])));

  return { ATRIBUTOS, parteA, parteB, claves };
})();
