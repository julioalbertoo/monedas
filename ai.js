import { CONFIG } from "./config.js";

const RESPONSE_FIELDS = [
  "issuer",
  "issuer_en",
  "denomination",
  "denomination_en",
  "year",
  "currency",
  "ruler",
  "commemorative",
  "composition_hint",
  "side_seen",
  "visible_text",
  "confidence",
];

const SYSTEM_PROMPT =
  "Eres un experto en numismática. Te doy una o dos fotos de una misma moneda (una cara o las dos). " +
  "Devuelve SOLO un JSON, sin texto alrededor, con estos campos exactos: " +
  "issuer, issuer_en, denomination, denomination_en, year, currency, ruler, commemorative, composition_hint, side_seen, visible_text, confidence. " +
  'issuer: país o entidad que emite la moneda, en castellano (p. ej. "España"); en los euros, el país de la cara nacional. ' +
  'issuer_en: el mismo emisor en inglés (p. ej. "Spain"). ' +
  'denomination: valor facial en castellano, con número y unidad (p. ej. "50 céntimos", "1 peseta", "2 euros"). ' +
  'denomination_en: el valor como lo escriben los catálogos en inglés (p. ej. "50 Euro Cent", "1 Peseta", "2 Euro", "1 Cent"). ' +
  "year: el año acuñado que se lee en la moneda, solo cifras. " +
  'currency: nombre de la moneda (p. ej. "euro", "peseta", "dólar"). ' +
  "ruler: rey, reina o gobernante que aparece o se nombra, si lo hay. " +
  "commemorative: qué conmemora, si es conmemorativa. " +
  'composition_hint: metal aparente (p. ej. "cobre", "latón", "bimetálica", "plata"). ' +
  'side_seen: "anverso", "reverso" o "ambas". ' +
  'visible_text: los textos legibles de la moneda, separados por " / ". ' +
  "Puedes deducir el país o el valor por el diseño aunque no estén escritos, pero no inventes el año. " +
  "Usa null en cualquier campo que no puedas deducir con certeza. " +
  "confidence es un número entre 0 y 1 que indica cuánto confías en tu lectura global.";

const MODEL_TIMEOUT_MS = 45000;

function userText(count) {
  return count > 1 ? "Las dos fotos son las dos caras de la misma moneda. Identifícala." : "Identifica esta moneda.";
}

// images: una o dos fotos (data URL). Gemma no admite instrucciones de sistema: a ese modelo se le dan dentro del mensaje.
function buildMessages(model, images) {
  const parts = images.map((url) => ({ type: "image_url", image_url: { url } }));
  if (model.startsWith("gemma")) {
    return [{ role: "user", content: [{ type: "text", text: `${SYSTEM_PROMPT}\n\n${userText(images.length)}` }, ...parts] }];
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: [{ type: "text", text: userText(images.length) }, ...parts] },
  ];
}

function extractJson(text) {
  const match = (text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// Con los campos principales basta: si a un modelo se le olvida alguno secundario, se pone a null
// en vez de descartar su respuesta y gastar otro modelo.
const REQUIRED_FIELDS = ["issuer", "denomination", "year", "confidence"];

function hasExpectedShape(data) {
  if (!data || !REQUIRED_FIELDS.every((field) => field in data)) return false;
  for (const field of RESPONSE_FIELDS) if (!(field in data)) data[field] = null;
  return true;
}

// Google devuelve el error a veces como objeto y a veces dentro de una lista.
function errorMessageFrom(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    const error = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
    return error?.message || bodyText;
  } catch {
    return bodyText;
  }
}

const INVALID_KEY_MESSAGE = "La llave de Google Gemini no es válida. Revisa que la copiaste entera.";

function describeError(status, bodyText) {
  const message = errorMessageFrom(bodyText);
  if (/api key/i.test(message) || status === 401) {
    return INVALID_KEY_MESSAGE;
  }
  if (/location/i.test(message)) {
    return "El plan gratuito de Gemini no está disponible desde tu país.";
  }
  if (status === 429) {
    return "se ha agotado su cupo gratuito por ahora";
  }
  if (status === 404) {
    return `El modelo no existe en Gemini: ${message.slice(0, 200)}`;
  }
  return `Gemini respondió con un error (código ${status}): ${message.slice(0, 200)}`;
}

async function postChat(aiKey, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(CONFIG.AI_PROVIDER.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function tryModel(model, aiKey, images) {
  let response;
  try {
    response = await postChat(
      aiKey,
      {
        model,
        messages: buildMessages(model, images),
        temperature: 0.1,
        // Margen amplio: los modelos Flash "piensan" antes de responder y eso también consume tokens.
        max_tokens: 4096,
      },
      MODEL_TIMEOUT_MS
    );
  } catch (err) {
    if (err && err.name === "AbortError") {
      return { ok: false, detail: `tiempo agotado (${MODEL_TIMEOUT_MS / 1000} s)` };
    }
    return { ok: false, detail: `error de red: ${err && err.message ? err.message : err}` };
  }

  const body = await response.text();
  if (!response.ok) {
    const detail = describeError(response.status, body);
    return {
      ok: false,
      detail,
      authError: detail === INVALID_KEY_MESSAGE,
      quotaError: response.status === 429,
      // 404: Google ha retirado ese modelo; se salta sin contar como fallo.
      notFound: response.status === 404,
      // 5xx: saturado o caído un momento; merece la pena reintentar.
      busy: response.status >= 500,
    };
  }

  let text;
  try {
    text = JSON.parse(body)?.choices?.[0]?.message?.content;
  } catch {
    return { ok: false, detail: `respuesta inesperada: ${body.slice(0, 200)}` };
  }
  const data = extractJson(text);
  if (!hasExpectedShape(data)) {
    return { ok: false, detail: `la IA no devolvió el JSON pedido: ${(text || "(vacío)").slice(0, 200)}` };
  }
  if (data.confidence !== null && data.confidence < 0.3) {
    return { ok: false, detail: `confianza baja (${data.confidence})`, data };
  }
  return { ok: true, data };
}

const BUSY_RETRIES = 2;

// images: lista con una o dos fotos (data URL) de la misma moneda.
export async function identify(images, aiKey, onAttempt) {
  const { primaryModel, fallbackModel } = CONFIG.AI_PROVIDER;
  const models = [primaryModel, fallbackModel, ...(await backupModels(aiKey))];
  const attempts = [];
  for (const [index, model] of models.entries()) {
    if (onAttempt) onAttempt(model, attempts.at(-1)?.detail, 0);
    let result = await tryModel(model, aiKey, images);
    if (result.authError) {
      // Con la llave mal, ningún modelo va a funcionar: no se gasta tiempo en el resto.
      return { ok: false, reason: INVALID_KEY_MESSAGE, authError: true, attempts: [...attempts, { model, detail: result.detail }] };
    }
    // Si Gemini está saturado (suele durar segundos), se espera un poco y se reintenta hasta 2 veces.
    // Solo con el modelo principal: con los de respaldo es más rápido pasar al siguiente.
    const retries = index === 0 ? BUSY_RETRIES : 0;
    for (let retry = 1; retry <= retries && result.busy; retry += 1) {
      if (onAttempt) onAttempt(model, attempts.at(-1)?.detail, retry);
      await new Promise((resolve) => setTimeout(resolve, retry * 4000));
      result = await tryModel(model, aiKey, images);
    }
    if (result.ok) {
      return { ok: true, data: result.data, modelUsed: model, attempts };
    }
    attempts.push({
      model,
      detail: result.detail,
      authError: Boolean(result.authError),
      quotaError: Boolean(result.quotaError),
      notFound: Boolean(result.notFound),
    });
  }
  const counted = attempts.filter((a) => !a.notFound);
  if (counted.length && counted.every((a) => a.quotaError)) {
    return {
      ok: false,
      reason:
        "Se ha agotado el cupo gratuito de Gemini por ahora. Inténtalo más tarde (el cupo se renueva cada día).",
      attempts,
    };
  }
  if (attempts.some((a) => a.quotaError)) {
    return {
      ok: false,
      reason:
        "Gemini está sin cupo gratuito o saturado ahora mismo. Espera unos minutos y pulsa «Reintentar».",
      attempts,
    };
  }
  return {
    ok: false,
    reason: "No se pudo identificar la moneda. Prueba con otra foto, de frente y con más luz, o añade la otra cara.",
    attempts,
  };
}

export async function testAiConnection(aiKey) {
  if (!aiKey) {
    return { ok: false, reason: "Falta la llave de Google Gemini." };
  }
  let response;
  try {
    response = await postChat(
      aiKey,
      {
        model: CONFIG.AI_PROVIDER.pingModel,
        messages: [{ role: "user", content: "Responde solo con la palabra: ok" }],
        max_tokens: 20,
      },
      20000
    );
  } catch {
    return { ok: false, reason: "No se pudo contactar con Google Gemini. Comprueba tu conexión a internet." };
  }
  const body = await response.text();
  if (!response.ok) {
    return { ok: false, reason: describeError(response.status, body) };
  }
  try {
    if (Array.isArray(JSON.parse(body).choices)) {
      return { ok: true, reason: "Conexión correcta: Gemini ha respondido." };
    }
  } catch {
    // cae al mensaje de abajo
  }
  return { ok: false, reason: `Respuesta inesperada de Gemini: ${body.slice(0, 120)}` };
}

// Lista de modelos: se pide a la conexión nativa de Gemini.
const NATIVE_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Google retira modelos cada pocos meses, así que los de respaldo se le preguntan a Google
// (con la llave del usuario) en vez de fijarlos en el código. La lista se pide una vez por visita.
const MAX_BACKUPS = 4;
let modelNamesPromise = null;

async function fetchModelNames(aiKey) {
  const names = new Set();
  let pageToken = "";
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await fetch(`${NATIVE_BASE}?${query}`, { headers: { "x-goog-api-key": aiKey } });
    if (!response.ok) throw new Error(`código ${response.status}`);
    const data = await response.json();
    for (const m of data.models || []) {
      if ((m.supportedGenerationMethods || []).includes("generateContent")) names.add(String(m.name).replace(/^models\//, ""));
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return names;
}

// Versión de un modelo ("gemini-3.8-flash" → 3.8) para probar antes los más nuevos.
const modelVersion = (name) => Number((/-(\d+(?:\.\d+)?)/.exec(name) || [])[1]) || 0;

// Modelos que entienden fotos y devuelven texto: Gemini Flash (normal o Lite) y Gemma grandes.
// Se dejan fuera las variantes de voz, imagen, vídeo, etc. y las versiones de prueba.
function isUsefulModel(name) {
  if (/^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(name)) return true;
  const gemma = /^gemma-\d+(?:\.\d+)?-(\d+)b-it$/.exec(name);
  return Boolean(gemma) && Number(gemma[1]) >= 12;
}

async function backupModels(aiKey) {
  const { primaryModel, fallbackModel, extraModels = [] } = CONFIG.AI_PROVIDER;
  if (!modelNamesPromise) {
    modelNamesPromise = fetchModelNames(aiKey).catch(() => {
      modelNamesPromise = null;
      return null;
    });
  }
  const names = await modelNamesPromise;
  // Si Google no da la lista, se usan los de la configuración tal cual.
  if (!names) return extraModels;
  const skip = new Set([primaryModel, fallbackModel]);
  const configured = extraModels.filter((m) => names.has(m) && !skip.has(m));
  const found = [...names]
    .filter((m) => isUsefulModel(m) && !skip.has(m) && !configured.includes(m))
    // Primero Gemini (del más nuevo al más viejo) y Gemma al final.
    .sort((a, b) => Number(a.startsWith("gemma")) - Number(b.startsWith("gemma")) || modelVersion(b) - modelVersion(a));
  return [...configured, ...found].slice(0, MAX_BACKUPS);
}
