export const GUIDE_TEXT = {
  intro: {
    title: "Bienvenido 👋",
    body:
      "Esta web identifica tus monedas a partir de una foto y te enseña su ficha en Numista, el gran catálogo de monedas.\n\n" +
      "Para eso hacen falta dos llaves, como el carné de socio de dos bibliotecas: una para la IA que \"lee\" la foto (Google Gemini) y otra para buscar la moneda en el catálogo (Numista). Cada llave es tuya; la usamos en tu nombre y se queda guardada en este navegador.",
    nextLabel: "Empezar →",
  },
  ai: {
    title: "🔑 Llave de Google Gemini",
    steps: [
      "Abre Google AI Studio (botón de abajo) e inicia sesión con tu cuenta de Google.",
      "Si te lo pide, acepta las condiciones de uso.",
      'Pulsa "Create API key" (Crear clave de API). Si te pregunta por un proyecto, acepta el que te propone.',
      "Copia la clave que aparece. Empieza por AIza. Es gratis y no pide tarjeta. Si ya usas Vinilos, sirve la misma.",
    ],
    linkLabel: "Abrir Google AI Studio",
    linkUrl: "https://aistudio.google.com/apikey",
    pasteLabel: "Pega aquí tu llave de Google Gemini",
    placeholder: "AIza...",
    formatHint: "Las llaves de Google Gemini empiezan por AIza. Revisa que la copiaste entera.",
    saveLabel: "Guardar y continuar",
  },
  numista: {
    title: "🔑 Llave de Numista",
    steps: [
      "Abre la página de la API de Numista (botón de abajo).",
      "Entra con tu cuenta de Numista o créate una (es gratis).",
      "Pide tu llave (API key): si te pregunta para qué es, pon algo como «Monedas, uso personal».",
      "Copia la llave. El plan gratuito da 2.000 consultas al mes, de sobra para uso personal.",
    ],
    linkLabel: "Abrir la página de la API de Numista",
    linkUrl: "https://es.numista.com/api/index.php",
    pasteLabel: "Pega aquí tu llave de Numista",
    placeholder: "Tu llave de la API de Numista",
    saveLabel: "Guardar y terminar",
  },
  privacyNotice: "🔒 Tus llaves se guardan solo en este navegador. No las compartas ni hagas capturas de esta pantalla.",
  reopenLinkLabel: "¿Cómo consigo mis llaves?",
};

export function isValidAiKeyFormat(value) {
  return /^AIza/.test((value || "").trim());
}
