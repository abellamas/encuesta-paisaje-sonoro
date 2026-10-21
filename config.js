// Configuración de la encuesta. Es lo único que hay que tocar para publicarla.
window.CONFIG = {
  // URL de la aplicación web de Apps Script (ver README, paso 3).
  // Mientras esté vacía la página funciona en modo prueba, sin enviar nada.
  ENDPOINT: "https://script.google.com/macros/s/AKfycby__MrJSWXE_TXDbBmV1jQhckpe2d54U-1rfoVbcEsFJ2IZwUJQNJJC8QGUo8QPwRc4/exec",
  // Debe coincidir con TOKEN en apps-script/Code.gs. No es secreto (la página es pública),
  // sólo evita envíos que no vengan de esta página.
  TOKEN: "1e93ae6057cfcaab024e1237",
  VERSION: "2026-10-v1",
  SEGUNDOS_ESCUCHA: 60,
  // Opciones del desplegable de la Parte B. Se puede cambiar el nombre, por ejemplo
  // "Punto 1, entrada principal". El id es lo que queda en la planilla.
  PUNTOS: [
    { id: 1, nombre: "Punto 1" },
    { id: 2, nombre: "Punto 2" },
    { id: 3, nombre: "Punto 3" }
  ]
};
