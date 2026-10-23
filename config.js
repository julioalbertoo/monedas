export const CONFIG = {
  // Proyecto de Supabase (compartido con Muscledex): inicio de sesión y funciones que guardan las llaves.
  // La clave publicable se puede enseñar: sin usuario y contraseña no da acceso a nada.
  SUPABASE: {
    url: "https://lmfdpetsqmmymbuwbziw.supabase.co",
    publishableKey: "sb_publishable_EjbC1Y2umbq66ZS-ohAu8g_-BlYQHOd",
  },
  AI_PROVIDER: {
    // Google Gemini (formato compatible con OpenAI), siempre a través de la función monedas-gemini.
    primaryModel: "gemini-flash-latest",
    fallbackModel: "gemini-flash-lite-latest",
    // Más respaldos si los dos de arriba fallan. Cada modelo tiene su propio cupo gratuito.
    // La app pregunta a Google qué modelos hay y añade los Flash y Gemma que encuentre;
    // estos van primero si existen, y se usan tal cual si Google no da la lista.
    extraModels: ["gemini-3.8-flash", "gemini-3.8-flash-lite"],
    pingModel: "gemini-flash-lite-latest",
  },
  NUMISTA: {
    baseUrl: "https://api.numista.com/v3",
    // Idioma de los títulos y descripciones que devuelve Numista.
    lang: "es",
    // Web pública de Numista, para los enlaces «Ver en Numista».
    webUrl: "https://es.numista.com",
  },
  STORAGE_KEYS: {
    // Datos de versiones anteriores (llaves de antes del usuario y contraseña, modo explorador): se borran del móvil al abrir la app.
    oldKeys: ["monedas_ai_key", "monedas_ai_verified", "monedas_numista_key", "monedas_numista_verified", "monedas_explore_mode"],
    history: "monedas_history",
    // Lista de países y emisores de Numista, 30 días.
    issuersCache: "monedas_issuers_cache",
    // Fichas completas de Numista, 30 días (cada consulta gasta cupo).
    typeCache: "monedas_type_cache",
    // Nombres de monedas traducidos al castellano por Gemini (Numista los da en inglés).
    titleCache: "monedas_title_es",
  },
  IMAGE: {
    maxDim: 1024,
    quality: 0.8,
  },
};
