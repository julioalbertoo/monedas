export const CONFIG = {
  AI_PROVIDER: {
    // Google Gemini mediante su entrada compatible con el formato de OpenAI; admite llamadas directas desde el navegador.
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
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
    aiKey: "monedas_ai_key",
    aiVerified: "monedas_ai_verified",
    numistaKey: "monedas_numista_key",
    numistaVerified: "monedas_numista_verified",
    history: "monedas_history",
    // "1" = modo explorador (tema oscuro; lo que se identifica no se guarda en «Mis monedas»).
    exploreMode: "monedas_explore_mode",
    // Lista de países y emisores de Numista, 30 días.
    issuersCache: "monedas_issuers_cache",
    // Fichas completas de Numista, 30 días (cada consulta gasta cupo).
    typeCache: "monedas_type_cache",
  },
  IMAGE: {
    maxDim: 1024,
    quality: 0.8,
  },
};
