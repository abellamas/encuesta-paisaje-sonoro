"""Prepara los datos de la encuesta para abrirlos en JASP.

Uso
    python analisis/exportar_para_jasp.py participantes.csv respuestas.csv [comentarios.csv]
           [--version 2026-10-v5] [--salida carpeta]

Los CSV se bajan de la planilla, una hoja por vez (Archivo, Descargar, Valores separados por comas).
Genera dos archivos en la carpeta de salida (por defecto, la de los CSV).
    jasp_largo.csv   una fila por persona y por punto de escucha. Sirve para modelos mixtos y gráficos.
    jasp_ancho.csv   una fila por persona, con las respuestas de cada punto en columnas separadas
                     (B2_agradable_p1, B2_agradable_p2, ...). Sirve para ANOVA de medidas repetidas.
En los dos, los datos de la Parte A (edad, género, bienestar) se unen por el código anónimo de cada persona.

Reglas
    Si una persona respondió dos veces el mismo punto, se queda con la última (por orden en el archivo).
    Con --version se descartan las filas de otras versiones del formulario, por ejemplo las de prueba.
"""
import argparse
import csv
import os
import sys

DESCARTAR = {"envio_id", "version"}   # columnas que no sirven para analizar


def leer(ruta):
    with open(ruta, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def filtrar(filas, version):
    return [r for r in filas if not version or r.get("version") == version]


def sin(r, quitar):
    return {k: v for k, v in r.items() if k not in quitar}


def exportar(participantes, respuestas, comentarios=None, version=None):
    """Devuelve (largo, ancho, resumen) como listas de dicts."""
    participantes, respuestas = filtrar(participantes, version), filtrar(respuestas, version)

    personas = {}
    for p in participantes:
        personas.setdefault(p["codigo"], sin(p, DESCARTAR | {"recibido", "codigo"}))

    ultimos, repetidos = {}, 0     # (codigo, punto) -> fila; la última respuesta pisa a la anterior
    for r in respuestas:
        clave = (r["codigo"], r["punto"])
        repetidos += clave in ultimos
        ultimos[clave] = sin(r, DESCARTAR | {"recibido"})

    columnas_a = list(next(iter(personas.values())).keys()) if personas else []
    largo = []
    for (codigo, punto), r in ultimos.items():
        fila = {"codigo": codigo, "punto": punto}
        fila.update({c: personas.get(codigo, {}).get(c, "") for c in columnas_a})
        fila.update({k: v for k, v in r.items() if k not in ("codigo", "punto")})
        largo.append(fila)
    largo.sort(key=lambda f: (f["codigo"], int(f["punto"])))

    puntos = sorted({f["punto"] for f in largo}, key=int)
    columnas_b = [k for k in (largo[0] if largo else {}) if k not in ("codigo", "punto", *columnas_a)]
    coment = {c["codigo"]: c.get("comentario", "") for c in filtrar(comentarios or [], version)}
    ancho = []
    for codigo in sorted({f["codigo"] for f in largo}):
        fila = {"codigo": codigo}
        fila.update({c: personas.get(codigo, {}).get(c, "") for c in columnas_a})
        for pt in puntos:
            r = ultimos.get((codigo, pt), {})
            fila.update({f"{c}_p{pt}": r.get(c, "") for c in columnas_b})
        if comentarios is not None:
            fila["comentario"] = coment.get(codigo, "")
        ancho.append(fila)

    por_persona = {}
    for codigo, pt in ultimos:
        por_persona.setdefault(codigo, set()).add(pt)
    resumen = {
        "personas": len(ancho), "filas_largo": len(largo), "puntos": puntos, "respuestas_repetidas": repetidos,
        "sin_todos_los_puntos": sum(1 for c in por_persona if len(por_persona[c]) < len(puntos)),
        "sin_parte_A": sum(1 for f in ancho if f["codigo"] not in personas),
    }
    return largo, ancho, resumen


def escribir(ruta, filas):
    columnas = list(filas[0].keys()) if filas else []
    with open(ruta, "w", newline="", encoding="utf-8-sig") as f:   # con BOM para que los acentos se lean bien
        w = csv.DictWriter(f, fieldnames=columnas)
        w.writeheader()
        w.writerows(filas)


def main():
    ap = argparse.ArgumentParser(description="Prepara los datos de la encuesta para JASP.")
    ap.add_argument("participantes")
    ap.add_argument("respuestas")
    ap.add_argument("comentarios", nargs="?")
    ap.add_argument("--version", help="se queda solo con las filas de esa versión del formulario")
    ap.add_argument("--salida", help="carpeta de salida (por defecto, la de participantes.csv)")
    a = ap.parse_args()

    salida = a.salida or os.path.dirname(os.path.abspath(a.participantes))
    os.makedirs(salida, exist_ok=True)
    largo, ancho, res = exportar(leer(a.participantes), leer(a.respuestas),
                                 leer(a.comentarios) if a.comentarios else None, a.version)
    escribir(os.path.join(salida, "jasp_largo.csv"), largo)
    escribir(os.path.join(salida, "jasp_ancho.csv"), ancho)
    print(f"Personas {res['personas']}, filas en el archivo largo {res['filas_largo']}, puntos {res['puntos']}.")
    if res["respuestas_repetidas"]:
        print(f"Aviso. {res['respuestas_repetidas']} respuestas repetidas del mismo punto, se usó la última.")
    if res["sin_todos_los_puntos"]:
        print(f"Aviso. {res['sin_todos_los_puntos']} personas no tienen respuestas de todos los puntos.")
    if res["sin_parte_A"]:
        print(f"Aviso. {res['sin_parte_A']} personas con respuestas de la Parte B pero sin Parte A.")
    print("Archivos en", salida)


if __name__ == "__main__":
    sys.exit(main())
