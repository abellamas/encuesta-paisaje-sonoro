# Encuesta de paisaje sonoro en parques urbanos

Página web del cuestionario del plan de investigación (UNTREF, 2026). Se abre en el celular con un
código QR, se responde en línea y cada respuesta cae como una fila en una planilla de Google.

- **Parte A** se completa una sola vez por persona.
- **Parte B** se repite en cada punto de escucha. El punto se elige en un desplegable.
- El **orden de los ocho atributos** (pregunta B2) es aleatorio para cada persona y cada punto, y se guarda
  en la columna `orden_B2`.
- Todo lo que la persona responde se guarda al instante en el celular. Si se cierra el navegador, al volver a
  abrir la página retoma donde quedó, con el mismo orden de atributos.
- Si se corta la señal, las respuestas quedan en el celular y se envían solas cuando vuelve. Un reintento no
  duplica filas.
- El consentimiento se guarda en una hoja aparte, con el código anónimo del participante y sin ningún dato que lo identifique.

La página publicada está en <https://abellamas.github.io/encuesta-paisaje-sonoro/>.

## Cómo dejarla funcionando (una sola vez)

La página funciona sola en **modo prueba** (no envía nada). Para que guarde las respuestas hay que crear la
planilla y conectarla.

1. **Crear la planilla.** En Google Drive, nueva hoja de cálculo de Google, con el nombre que quieras.
2. **Pegar el script.** En la planilla, *Extensiones > Apps Script*. Borrar lo que haya y pegar el contenido de
   `apps-script/Code.gs` tal cual (ya trae la clave `TOKEN`, que es la misma de `config.js`). Guardar.
3. **Publicarlo.** *Implementar > Nueva implementación > Aplicación web*. En *Ejecutar como* poner **Yo**, y en
   *Quién tiene acceso* poner **Cualquier persona**. Autorizar los permisos que pida. Copiar la **URL** que
   termina en `/exec`.
4. **Conectar la página.** En `config.js` pegar esa URL en `ENDPOINT`. Subir el
   cambio a GitHub (`git commit` y `git push`). En un minuto la página publicada lo toma.
5. **Probar.** Abrir la página en el celular, responder una vez y mirar que aparezcan filas en las hojas
   `respuestas`, `participantes` y `consentimientos`. Después borrar esas filas de prueba.
6. **Código QR.** Generar uno solo con la dirección de la página. Es el mismo para los tres puntos.

Si cambia el script, hay que volver a *Implementar > Administrar implementaciones* y crear una versión nueva.

## Si se cambia algún archivo

GitHub Pages deja que el celular guarde los archivos hasta diez minutos. Para que todos bajen la versión nueva,
cambiar el número que sigue a `?v=` en las líneas de `index.html` (por ejemplo de `20261021i` a `20261022a`)
antes de subir el cambio.

## Antes de salir al campo

- Probarla en el parque con dos o tres teléfonos distintos (Android e iPhone) y con poca señal.
- Cambiar los nombres de los puntos en `config.js` (`PUNTOS`) si querés que digan algo más que "Punto 1".
- En `config.js`, `SEGUNDOS_ESCUCHA` es la duración de la escucha (60 = un minuto).
- Cada celular guarda solo una copia de lo enviado en el almacenamiento del navegador (`historial`), sin que la persona tenga que hacer nada. No se muestra en pantalla.

## Qué columnas quedan en la planilla

| Hoja | Una fila por | Contenido |
|---|---|---|
| `respuestas` | punto y participante | `codigo`, `punto`, `orden_B2`, `duracion_s`, B1 a B8 |
| `participantes` | participante | `codigo`, A1 a A8 y el WHO-5 (`A9_WHO5_a` a `e`) |
| `consentimientos` | aceptación | `codigo`, fecha y versión del texto |

Las columnas salen siempre en el orden de las preguntas (A1 a A9 y B1 a B8), con los ocho atributos de B2 en el
orden de su ángulo teórico, de 0° a 315° (`B2_agradable`, `B2_estimulante`, `B2_con_actividad`, `B2_caotico`,
`B2_desagradable`, `B2_monotono`, `B2_sin_actividad`, `B2_calmado`). En `orden_B2` queda, con los mismos nombres,
el orden en que cada persona vio los atributos. Si se cambian las preguntas, conviene borrar las pestañas de la
planilla antes de empezar, para que se creen de nuevo con las columnas en orden.

Codificación de las escalas: acuerdo de 1 (muy en desacuerdo) a 5 (muy de acuerdo), WHO-5 de 0 (nunca) a 5
(todo el tiempo), restauratividad (`B7_a` a `f`) de 0 a 6.

## Pruebas

```
node --test test/logica.test.js test/apps-script.test.js
node test/e2e.js        # abre Chrome con tamaño de celular y recorre toda la encuesta
```

La segunda necesita Chrome o Edge instalado y deja capturas de pantalla en `test/capturas/`.
