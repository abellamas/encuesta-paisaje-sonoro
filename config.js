// Configuración de la encuesta. Es lo único que hay que tocar para publicarla.
window.CONFIG = {
  // URL de la aplicación web de Apps Script (ver README, paso 3).
  // Mientras esté vacía la página funciona en modo prueba, sin enviar nada.
  ENDPOINT: "https://script.google.com/macros/s/AKfycby__MrJSWXE_TXDbBmV1jQhckpe2d54U-1rfoVbcEsFJ2IZwUJQNJJC8QGUo8QPwRc4/exec",
  // Debe coincidir con TOKEN en apps-script/Code.gs. No es secreto (la página es pública),
  // sólo evita envíos que no vengan de esta página.
  TOKEN: "1e93ae6057cfcaab024e1237",
  VERSION: "2026-10-v2",
  SEGUNDOS_ESCUCHA: 60,
  // Opciones del desplegable de la Parte B. Se puede cambiar el nombre, por ejemplo
  // "Punto 1, entrada principal". El id es lo que queda en la planilla.
  PUNTOS: [
    // foto y audio sólo se usan en el modo piloto (agregar ?piloto=1 a la dirección)
    { id: 1, nombre: "Calistenia", foto: "piloto/fotos/calistenia.jpg", audio: "piloto/audio/calistenia.mp3" },
    { id: 2, nombre: "Entrada Corrientes y Newbery", foto: "piloto/fotos/newbery.jpg", audio: "piloto/audio/newbery.mp3" },
    { id: 3, nombre: "Mesitas", foto: "piloto/fotos/mesitas.jpg", audio: "piloto/audio/mesitas.mp3" }
  ]
};
