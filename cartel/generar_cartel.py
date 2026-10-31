"""Arma el cartel con el QR de la encuesta, en A4 y listo para imprimir.

Uso
    python cartel/generar_cartel.py [dirección]

Sin argumentos usa la dirección de la encuesta de campo. Necesita `pip install segno` y Google Chrome o Edge.
Deja en esta carpeta el cartel (`cartel_encuesta.pdf`), el QR (`qr_encuesta.svg` y `.png`) y la página que lo genera.
"""
import os
import subprocess
import sys

import segno

URL = sys.argv[1] if len(sys.argv) > 1 else "https://abellamas.github.io/encuesta-paisaje-sonoro/"
AQUI = os.path.dirname(os.path.abspath(__file__))
NAVEGADORES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

qr = segno.make(URL, error="m")   # corrección de errores media, para que se lea aunque la hoja se ensucie
qr.save(os.path.join(AQUI, "qr_encuesta.svg"), scale=10, border=2, dark="#000000", light="#ffffff")
qr.save(os.path.join(AQUI, "qr_encuesta.png"), scale=40, border=2, dark="#000000", light="#ffffff")

pagina = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Cartel de la encuesta</title>
<style>
  @page {{ size: A4; margin: 0; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; background: #fff; }}
  body {{ width: 210mm; height: 297mm; padding: 16mm 14mm; display: flex; flex-direction: column; align-items: center;
         font-family: Bahnschrift, "Segoe UI", Arial, sans-serif; color: #111; text-align: center; }}
  .logo {{ width: 150mm; }}
  h1 {{ font-size: 25pt; line-height: 1.2; font-weight: 700; margin: 8mm 0 0; letter-spacing: .01em; }}
  .qr {{ margin: 12mm 0 0; width: 100mm; height: 100mm; }}
  .escanea {{ font-size: 15pt; margin: 6mm 0 0; color: #333; }}
  .enlace {{ font-size: 17pt; font-weight: 700; margin: 5mm 0 0; word-break: break-all; }}
</style></head>
<body>
  <img class="logo" src="logo_untref.png" alt="UNTREF, Universidad Nacional de Tres de Febrero">
  <h1>Investigación sobre Ruido Urbano<br>y el Paisaje Sonoro</h1>
  <img class="qr" src="qr_encuesta.svg" alt="Código QR de la encuesta">
  <p class="escanea">Escaneá el código para responder la encuesta</p>
  <p class="enlace">{URL}</p>
</body></html>
"""
ruta_html = os.path.join(AQUI, "cartel_encuesta.html")
with open(ruta_html, "w", encoding="utf-8") as f:
    f.write(pagina)

navegador = next((n for n in NAVEGADORES if os.path.exists(n)), None)
if not navegador:
    sys.exit("No se encontró Chrome ni Edge. Abrí cartel_encuesta.html en un navegador e imprimilo como PDF.")
pdf = os.path.join(AQUI, "cartel_encuesta.pdf")
subprocess.run([navegador, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + pdf,
                "file:///" + ruta_html.replace("\\", "/")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
print("Listo.", pdf)
