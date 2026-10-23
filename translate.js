// Numista da los nombres de las monedas solo en inglés («2 Escudos - Ferdinand VII (Laureate head)»),
// aunque se le pida en castellano. Gemini los traduce de una vez y cada traducción se guarda en el móvil:
// un nombre ya traducido sale al momento y no vuelve a gastar nada. No gasta cupo de Numista.
import { CONFIG } from "./config.js";
import { callFunction } from "./auth.js";

const KEY = CONFIG.STORAGE_KEYS.titleCache;
const MAX_ITEMS = 2000;

const PROMPT =
  "Traduce al castellano estos textos del catálogo de monedas Numista. " +
  "Traduce los nombres de reyes y personas como se dicen en castellano (Ferdinand VII → Fernando VII, Charles III → Carlos III, " +
  "Isabella II → Isabel II, Philip V → Felipe V) y las descripciones (Laureate head → cabeza laureada, 1st type → 1.er tipo, " +
  "Standard circulation coin → moneda de curso normal). Deja igual los números, los años, las cifras y los nombres propios de " +
  "las monedas (Escudo, Real, Peseta, Euro); traduce los que tienen nombre en castellano (Dollar → Dólar, Penny → Penique). " +
  "Si un texto ya está en castellano, déjalo igual. " +
  'Responde solo con JSON: {"t": [...]}, con las traducciones en el mismo orden y el mismo número de elementos.';

function readCache() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  const keys = Object.keys(cache);
  // Si hay demasiadas, se olvidan las primeras que se guardaron.
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ITEMS))) delete cache[old];
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Memoria llena: se traduce otra vez la próxima vez, no pasa nada.
  }
}

// Traducción ya guardada, o el texto tal cual.
export function cachedSpanish(text) {
  return readCache()[text] || text;
}

async function askGemini(model, texts) {
  const { status, body } = await callFunction("monedas-gemini", {
    action: "chat",
    body: {
      model,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: JSON.stringify(texts) },
      ],
      temperature: 0,
      max_tokens: 4096,
    },
  });
  if (status !== 200) throw new Error(`código ${status}`);
  const content = JSON.parse(body)?.choices?.[0]?.message?.content || "";
  const match = content.match(/\{[\s\S]*\}/);
  const list = match && JSON.parse(match[0]).t;
  if (!Array.isArray(list) || list.length !== texts.length) throw new Error("respuesta sin la forma pedida");
  return list.map((t, i) => (typeof t === "string" && t.trim() ? t.trim() : texts[i]));
}

// Devuelve un Map texto → traducción. Si Gemini falla, se quedan en inglés.
let pending = Promise.resolve();
export function toSpanish(texts) {
  // De una en una: si llegan dos listas a la vez, la segunda aprovecha lo que ha traducido la primera.
  const run = pending.then(async () => {
    const cache = readCache();
    const missing = [...new Set(texts.filter((t) => t && !(t in cache)))];
    if (missing.length) {
      const { pingModel, primaryModel } = CONFIG.AI_PROVIDER;
      for (const model of [pingModel, primaryModel]) {
        try {
          const done = await askGemini(model, missing);
          missing.forEach((t, i) => (cache[t] = done[i]));
          writeCache(cache);
          break;
        } catch {
          // Se prueba con el otro modelo; si también falla, se queda en inglés.
        }
      }
    }
    return new Map(texts.map((t) => [t, cache[t] || t]));
  });
  pending = run.catch(() => {});
  return run;
}

// Traduce en la página los elementos marcados con data-tr (el texto original en inglés).
export async function translateMarked(root) {
  const nodes = [...root.querySelectorAll("[data-tr]")];
  const texts = nodes.map((n) => n.dataset.tr);
  if (!texts.length) return;
  // Primero lo que ya está guardado, sin esperar.
  for (const node of nodes) node.textContent = cachedSpanish(node.dataset.tr);
  const done = await toSpanish(texts);
  for (const node of nodes) if (node.isConnected) node.textContent = done.get(node.dataset.tr) || node.dataset.tr;
}
