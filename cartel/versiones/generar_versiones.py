"""Genera, una al lado de la otra, las versiones del cartel de medición que se fueron probando (30/10/2026).

Uso
    python cartel/versiones/generar_versiones.py

Necesita Google Chrome o Edge. Cada versión queda como un PDF A4 horizontal en esta carpeta.
"""
import os
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
NAVEGADORES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
AVISO = "Rogamos discreción"
TITULO = "Investigación sobre el paisaje sonoro en curso"
TEXTO = ("Disculpe, en este momento no podemos responder consultas. "
         "Puede continuar con su actividad de forma normal y acercarse luego a participar si lo desea.")

# nombre del archivo, ancho del logo (mm), con aviso, tamaño del título (pt), tamaño de la bajada (pt),
# interlineado de la bajada, ancho máximo de la bajada (mm), líneas parejas
VERSIONES = [
    ("cartel_medicion_v1_original", 150, False, 46, 26, 1.30, 245, False),
    ("cartel_medicion_v2_bajada_grande", 150, False, 46, 34, 1.25, 262, False),
    ("cartel_medicion_v3_logo_grande", 215, False, 46, 34, 1.25, 262, False),
    ("cartel_medicion_v4_rogamos_discrecion", 175, True, 36, 27, 1.28, 250, False),
    ("cartel_medicion_v5_rogamos_discrecion_parejo", 175, True, 36, 27, 1.28, 250, True),
]


def pagina(logo, aviso, titulo_pt, texto_pt, interlineado, ancho, parejo):
    balance = "text-wrap: balance;" if parejo else ""
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Cartel de medición</title>
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; background: #fff; }}
  body {{ width: 297mm; height: 210mm; padding: 14mm 18mm; display: flex; flex-direction: column; align-items: center;
         justify-content: space-between; font-family: Bahnschrift, "Segoe UI", Arial, sans-serif; color: #111; text-align: center; }}
  .logo {{ width: {logo}mm; }}
  .aviso {{ font-size: 74pt; line-height: 1; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; margin: 0; }}
  h1 {{ font-size: {titulo_pt}pt; line-height: 1.12; font-weight: 700; margin: 0; {balance} }}
  p {{ font-size: {texto_pt}pt; line-height: {interlineado}; margin: 0; max-width: {ancho}mm; color: #222; {balance} }}
</style></head>
<body>
  <img class="logo" src="../logo_untref_horizontal.png" alt="UNTREF, Universidad Nacional de Tres de Febrero">
  {'<div class="aviso">' + AVISO + '</div>' if aviso else ''}
  <h1>{TITULO}</h1>
  <p>{TEXTO}</p>
</body></html>
"""


navegador = next((n for n in NAVEGADORES if os.path.exists(n)), None)
if not navegador:
    sys.exit("No se encontró Chrome ni Edge.")
for nombre, logo, aviso, titulo_pt, texto_pt, inter, ancho, parejo in VERSIONES:
    html = os.path.join(AQUI, nombre + ".html")
    with open(html, "w", encoding="utf-8") as f:
        f.write(pagina(logo, aviso, titulo_pt, texto_pt, inter, ancho, parejo))
    subprocess.run([navegador, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    "--print-to-pdf=" + os.path.join(AQUI, nombre + ".pdf"), "file:///" + html.replace("\\", "/")],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
    os.remove(html)
    print("Listo.", nombre + ".pdf")
