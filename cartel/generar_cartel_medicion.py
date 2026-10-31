"""Arma el cartel de medición en curso, en A4 horizontal, para dejar junto al equipo.

Uso
    python cartel/generar_cartel_medicion.py

Necesita Google Chrome o Edge. Deja `cartel_medicion.pdf` en esta carpeta.
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

pagina = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Cartel de medición</title>
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; background: #fff; }}
  body {{ width: 297mm; height: 210mm; padding: 14mm 18mm; display: flex; flex-direction: column; align-items: center;
         justify-content: space-between; font-family: Bahnschrift, "Segoe UI", Arial, sans-serif; color: #111; text-align: center; }}
  .logo {{ width: 175mm; }}
  .aviso {{ font-size: 74pt; line-height: 1; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; margin: 0; }}
  h1 {{ font-size: 36pt; line-height: 1.12; font-weight: 700; margin: 0; text-wrap: balance; }}
  p {{ font-size: 27pt; line-height: 1.28; margin: 0; max-width: 250mm; color: #222; text-wrap: balance; }}
</style></head>
<body>
  <img class="logo" src="logo_untref_horizontal.png" alt="UNTREF, Universidad Nacional de Tres de Febrero">
  <div class="aviso">{AVISO}</div>
  <h1>{TITULO}</h1>
  <p>{TEXTO}</p>
</body></html>
"""
ruta_html = os.path.join(AQUI, "cartel_medicion.html")
with open(ruta_html, "w", encoding="utf-8") as f:
    f.write(pagina)

navegador = next((n for n in NAVEGADORES if os.path.exists(n)), None)
if not navegador:
    sys.exit("No se encontró Chrome ni Edge. Abrí cartel_medicion.html en un navegador e imprimilo como PDF.")
pdf = os.path.join(AQUI, "cartel_medicion.pdf")
subprocess.run([navegador, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + pdf,
                "file:///" + ruta_html.replace("\\", "/")], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
print("Listo.", pdf)
