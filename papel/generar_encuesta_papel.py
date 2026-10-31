"""Arma la encuesta en papel, para usar en el lugar. Son 4 carillas A4, o sea 2 hojas impresas de los dos lados.

Uso
    python papel/generar_encuesta_papel.py [semilla]

Carilla 1  consentimiento y Parte A (una sola vez).
Carillas 2 a 4  Parte B de cada punto de escucha, con el comentario final en la última.
Imprimir en A4, doble faz, con el borde largo de encuadernación.

En la encuesta en línea el orden de los ocho atributos es distinto para cada persona. En papel el orden queda fijo en cada
carilla. Con otra semilla sale otro orden, para imprimir varias versiones y repartirlas entre los participantes.
Necesita Google Chrome o Edge.
"""
import os
import random
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
NAVEGADORES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
SEMILLA = int(sys.argv[1]) if len(sys.argv) > 1 else 1

ATRIBUTOS = ["agradable", "caótico", "estimulante", "sin actividad", "calmado", "desagradable", "con actividad", "monótono"]
PUNTOS = [("A", "Mesitas"), ("B", "Entrada Corrientes y Newbery"), ("C", "Calistenia")]


def cb(texto=""):
    return f'<span class="op"><i class="cb"></i>{texto}</span>'


def opciones(lista, clase=""):
    return f'<div class="ops {clase}">' + "".join(cb(t) for t in lista) + "</div>"


def pregunta(codigo, texto, cuerpo, ayuda=""):
    a = f' <span class="ayuda">{ayuda}</span>' if ayuda else ""
    return f'<div class="preg"><div class="q"><b>{codigo}</b> {texto}{a}</div>{cuerpo}</div>'


def rejilla(filas, columnas, ancho_col="14mm", cabecera_filas=""):
    """Tabla de casillas. columnas es la lista de rótulos y filas la lista de textos."""
    th = "".join(f'<th style="width:{ancho_col}">{c}</th>' for c in columnas)
    tr = "".join(f'<tr><td class="f">{f}</td>' + "".join('<td class="c"><i class="cb"></i></td>' for _ in columnas) + "</tr>" for f in filas)
    return f'<table class="g"><thead><tr><th class="f">{cabecera_filas}</th>{th}</tr></thead><tbody>{tr}</tbody></table>'


def cabecera(titulo, subtitulo="", pagina=1):
    s = f'<div class="sub">{subtitulo}</div>' if subtitulo else ""
    return f"""<div class="cab"><img src="../cartel/logo_untref_horizontal.png" alt="UNTREF">
      <div class="tit"><h1>{titulo}</h1>{s}</div><div class="num">Página {pagina} de 4</div></div>"""


def pagina1():
    datos = (
        pregunta("A2", "¿Cuál es tu edad?", '<div class="ops"><span class="raya" style="width:20mm"></span> años</div>')
        + pregunta("A3", "¿Cuál es tu género?", opciones(["Femenino", "Masculino", 'Otro, ¿cómo te autopercibís? <span class="raya" style="width:38mm"></span>']))
        + pregunta("A4", "¿Cuál es tu nivel de estudios?", opciones(["Primario incompleto", "Primario completo", "Secundario incompleto (o en curso)", "Secundario completo",
                                                                    "Terciario o universitario incompleto (o en curso)", "Terciario o universitario completo", "Posgrado/Maestría"]))
        + pregunta("A7", "¿Tenés formación o trabajás en acústica, ruido ambiental o planificación urbana?", opciones(["Sí", "No"]))
        + pregunta("A1", "¿Cuánto tardás en llegar a este parque desde donde vivís?", opciones(["Menos de 10 minutos caminando", "Entre 10 y 30 minutos", "Más de 30 minutos en transporte", "No vivo en la zona, solo estoy de paso por hoy"]))
        + pregunta("A8", "¿Con qué frecuencia visitás este parque?", opciones(["Casi nunca", "Ocasionalmente", "Fines de semana", "Varias veces por semana", "Todos los días"]))
        + pregunta("A10", "¿Cómo llegaste a participar de esta encuesta?", opciones(["Me invitaron a participar con cita previa", "Me encontraba en el parque y acepté participar"]))
        + pregunta("A11", "¿Hace cuánto vivís en CABA o en el Gran Buenos Aires?", opciones(["No vivo en CABA ni en el Gran Buenos Aires", "Menos de 1 año", "Entre 1 y 5 años", "Más de 5 años", "Toda mi vida"]))
    )
    audicion = (
        pregunta("A5", "¿Tenés algún problema de audición que conozcas?", opciones(["Sí, ¿cuál? <span class='raya' style='width:40mm'></span>", "No", "No sé"]))
        + pregunta("A5b", "¿En las últimas 24 horas escuchaste sonidos muy fuertes?", opciones(["Sí", "No", "No sé"]), "(por ejemplo, recitales, boliches, auriculares a todo volumen o maquinaria ruidosa)")
        + pregunta("A6", "¿Realizás de forma habitual actividades que considerás riesgosas para tu audición?", opciones(["Sí, ¿cuáles? <span class='raya' style='width:40mm'></span>", "No", "No sé"]))
    )
    who = (
        '<div class="ayuda">Estas cinco frases son de un cuestionario breve de la Organización Mundial de la Salud (OMS) sobre cómo te sentiste de ánimo durante las últimas dos semanas. No hay respuestas correctas ni incorrectas.</div>'
        + '<div class="q"><b>A9</b> Durante las últimas dos semanas… Calificá del 0 al 5, siendo cada puntuación: <b>0</b> = Nunca, <b>1</b> = De vez en cuando, <b>2</b> = Menos de la mitad del tiempo, <b>3</b> = Más de la mitad del tiempo, <b>4</b> = La mayor parte del tiempo, <b>5</b> = Todo el tiempo.</div>'
        + rejilla(["a) Me he sentido alegre y de buen humor.", "b) Me he sentido tranquilo/a y relajado/a.", "c) Me he sentido activo/a y enérgico/a.",
                   "d) Me he despertado sintiéndome fresco/a y descansado/a.", "e) Mi vida cotidiana ha estado llena de cosas que me interesan."],
                  ["0", "1", "2", "3", "4", "5"], "11mm")
    )
    return f"""<section class="pag">
  {cabecera("Evaluación del paisaje sonoro del Parque Los Andes", "Encuesta anónima, Universidad Nacional de Tres de Febrero", 1)}
  <div class="campo">
    <span>Fecha <span class="raya" style="width:24mm"></span></span>
    <span>Código de participante <span class="raya" style="width:26mm"></span></span>
    <span>Grupo <span class="raya" style="width:12mm"></span></span>
    <span>Recorrido <span class="raya" style="width:20mm"></span></span>
    <span>Hora de inicio <span class="raya" style="width:14mm"></span></span>
  </div>
  <div class="consent">
    <p>En esta encuesta vas a evaluar, a través de tu percepción, cómo es el paisaje sonoro de este parque urbano. Es parte de mi investigación para mi tesis de la carrera de Ingeniería de Sonido por la Universidad Nacional de Tres de Febrero (UNTREF).</p>
    <ul>
      <li>La encuesta es <b>anónima, voluntaria</b> y <b>todas las preguntas son opcionales</b>.</li>
      <li>Al inicio, por única vez, se te preguntarán <b>datos personales y de bienestar</b>. Es importante tu sinceridad, recordá que es anónima.</li>
      <li>Vas a recorrer <b>3 puntos de escucha</b> dentro del parque y en cada uno vas a escuchar durante <b>1 minuto</b> sin realizar nada más que la escucha. Luego vas a completar una parte de la encuesta. Esto se repetirá en cada punto.</li>
      <li>Es necesario que <b>permanezcas en silencio</b> una vez iniciado el paseo, hasta recorrer y evaluar los 3 puntos. Si precisás ayuda, podés hablar con uno de mis compañeros.</li>
    </ul>
    <div class="acepto">{cb("<b>Acepto participar.</b>")} <span class="ayuda">Duración aproximada, 15 minutos.</span></div>
  </div>
  <h2>Parte A. Datos personales</h2>{datos}
  <h2>Parte A. Audición</h2>{audicion}
  <h2>Parte A. Índice de Bienestar OMS</h2>{who}
</section>"""


def paginaB(n, orden, con_comentario):
    puntos = " ".join(cb(f"<b>{l}</b> {nombre}") for l, nombre in PUNTOS)
    b1 = rejilla(["Tránsito (por ejemplo autos, colectivos, trenes, aviones)", "Otros sonidos (por ejemplo sirenas, obras, industria, carga y descarga)",
                  "Sonidos de personas (por ejemplo conversaciones, risas, niños jugando, pasos)", "Sonidos naturales (por ejemplo pájaros, agua que corre, viento en la vegetación)"],
                 ["Nada", "Un poco", "Modera&shy;damente", "Mucho", "Domina completa&shy;mente"], "19mm")
    b2 = rejilla(orden, ["Muy en desacuerdo", "En desacuerdo", "Ni de acuerdo ni en desacuerdo", "De acuerdo", "Muy de acuerdo"], "19mm")
    simples = (
        pregunta("B3", "En general, ¿cómo calificarías el ambiente sonoro que te rodea ahora?", opciones(["Muy malo", "Malo", "Ni bueno ni malo", "Bueno", "Muy bueno"]))
        + pregunta("B4", "¿Qué tan acorde es el ambiente sonoro con lo que esperarías de este lugar?", opciones(["Nada", "Levemente", "Moderadamente", "Muy", "Perfectamente"]))
        + pregunta("B5", "¿Cuán alto o fuerte considerás que es el ambiente sonoro?", opciones(["Nada", "Un poco", "Moderadamente", "Muy", "Extremadamente"]), "Valorá el volumen, no la calidad.")
        + pregunta("B6", "¿Cada cuánto volverías a este lugar?", opciones(["Nunca", "Rara vez", "A veces", "A menudo", "Muy a menudo"]))
    )
    b7 = rejilla(["a) Encuentro este paisaje sonoro cautivador.", "b) Oír este paisaje sonoro me concede un descanso de mi rutina diaria.",
                  "c) Cuando oigo este paisaje sonoro me abstraigo de mis preocupaciones y miedos.", "d) Este paisaje sonoro es afín a mis inclinaciones, preferencias o intereses personales.",
                  "e) Todos los sonidos que estoy oyendo parecen pertenecer al mismo paisaje sonoro.", "f) Este paisaje sonoro suena muy espacioso."],
                 ["0", "1", "2", "3", "4", "5", "6"], "9mm")
    pie = ('<h2>Al terminar los tres puntos</h2><div class="q"><b>Pensando en todo el paseo, ¿qué sonido fue el que más te gustó y cuál el que menos? '
           '¿Qué sonido te gustaría que disminuyera o que se agregara? ¿Por qué?</b> <span class="ayuda">(Es opcional.)</span></div>'
           '<div class="lineas"><i></i><i></i><i></i></div><p class="gracias">¡Encuesta terminada! Muchas gracias por participar.</p>') if con_comentario else (
           '<div class="obs">Observaciones del encuestador (viento, ruido de manipulación, interrupciones)<div class="lineas"><i></i><i></i></div></div>')
    return f"""<section class="pag">
  {cabecera("Parte B. En este punto de escucha", f"Punto {n} de 3. Esta hoja se completa en cada punto", n + 1)}
  <div class="campo"><span>Código <span class="raya" style="width:26mm"></span></span><span>Punto {puntos}</span><span>Hora de inicio <span class="raya" style="width:14mm"></span></span></div>
  <p class="inst">Escuchá el ambiente sonoro durante un minuto, en silencio, sin hablar con los demás y sin caminar. Orientá la cabeza igual que el guía. Iniciá el temporizador cuando el guía lo indique.</p>
  <div class="q"><b>B1</b> ¿Hasta qué punto podés oír en este momento los siguientes cuatro tipos de sonido?</div>{b1}
  <div class="q sep"><b>B2</b> ¿Qué tan de acuerdo estás con que este paisaje sonoro es…?</div>{b2}
  <div class="sep"></div>{simples}
  <div class="q sep"><b>B7</b> Indicá tu grado de acuerdo con las siguientes afirmaciones sobre el paisaje sonoro que estás oyendo ahora. <span class="ayuda">0 = Nada, 1 = Muy poco, 2 = Un poco, 3 = Algo, 4 = Bastante, 5 = Mucho, 6 = Completamente</span></div>{b7}
  {pie}
</section>"""


CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; }
body { font-family: "Segoe UI", Arial, sans-serif; color: #111; font-size: 8.8pt; line-height: 1.22; }
.pag { width: 210mm; height: 297mm; padding: 9mm 12mm 8mm; overflow: hidden; page-break-after: always; break-after: page; }
.pag:last-child { page-break-after: auto; break-after: auto; }
.cab { display: flex; align-items: center; gap: 6mm; border-bottom: .5mm solid #111; padding-bottom: 2mm; }
.cab img { width: 44mm; }
.num { margin-left: auto; align-self: flex-start; font-size: 8.5pt; font-weight: 700; color: #333; white-space: nowrap; }
.tit h1 { font-size: 12.5pt; margin: 0; line-height: 1.15; }
.sub { font-size: 8pt; color: #444; }
h2 { font-size: 9.6pt; margin: 2.6mm 0 1mm; padding: .6mm 1.5mm; background: #e9eef3; border-left: 1.2mm solid #24639a; }
.campo { display: flex; flex-wrap: wrap; gap: 1mm 5mm; margin: 2mm 0; font-size: 8.4pt; align-items: center; }
.raya { display: inline-block; border-bottom: .25mm solid #111; height: 3.4mm; vertical-align: bottom; }
.cb { display: inline-block; width: 3.6mm; height: 3.6mm; border: .3mm solid #111; vertical-align: -.5mm; margin-right: 1mm; }
.op { display: inline-block; margin-right: 3.4mm; white-space: nowrap; }
.ops { margin-top: .6mm; line-height: 1.5; }
.ops .op { white-space: normal; }
.preg { margin: 1.3mm 0; break-inside: avoid; }
.q { margin: 1mm 0 .6mm; }
.q.sep { margin-top: 2.4mm; }
.sep { margin-top: 1.5mm; }
.ayuda { color: #555; font-size: 8pt; font-weight: normal; }
.consent { border: .3mm solid #777; padding: 1.6mm 2.4mm; margin: 1.6mm 0; }
.consent p { margin: 0 0 1mm; }
.consent ul { margin: 0; padding-left: 4.5mm; }
.consent li { margin: .4mm 0; }
.acepto { margin-top: 1.4mm; font-size: 9pt; }
table.g { width: 100%; border-collapse: collapse; margin-top: .6mm; }
table.g th { font-size: 7.4pt; line-height: 1.1; padding: .8mm .6mm; border-bottom: .3mm solid #111; text-align: center; vertical-align: bottom; }
table.g th.f { text-align: left; }
table.g td { border-bottom: .2mm solid #bbb; padding: .8mm .8mm; }
table.g td.f { font-size: 8.5pt; line-height: 1.12; }
table.g td.c { text-align: center; }
table.g td.c .cb { margin: 0; vertical-align: middle; }
.inst { font-style: italic; margin: 1.6mm 0; }
.lineas i { display: block; border-bottom: .25mm solid #888; height: 6.4mm; }
.obs { margin-top: 2.4mm; font-size: 7.6pt; color: #555; }
.gracias { text-align: center; font-weight: 700; margin: 2mm 0 0; }
"""


def main():
    ordenes = []
    for n in range(3):
        o = ATRIBUTOS[:]
        random.Random(SEMILLA * 100 + n).shuffle(o)
        ordenes.append(o)
    paginas = pagina1() + "".join(paginaB(n + 1, ordenes[n], n == 2) for n in range(3))
    html = f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Encuesta en papel</title><style>{CSS}</style></head><body>{paginas}</body></html>'
    ruta = os.path.join(AQUI, "encuesta_papel.html")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(html)
    navegador = next((n for n in NAVEGADORES if os.path.exists(n)), None)
    if not navegador:
        sys.exit("No se encontró Chrome ni Edge. Abrí encuesta_papel.html en un navegador e imprimilo como PDF.")
    pdf = os.path.join(AQUI, "encuesta_papel.pdf")
    subprocess.run([navegador, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + pdf, "file:///" + ruta.replace("\\", "/")],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    print("Listo.", pdf, "(semilla", SEMILLA, ")")


if __name__ == "__main__":
    main()
