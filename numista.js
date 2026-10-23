import { CONFIG } from "./config.js";

const { baseUrl, lang, webUrl } = CONFIG.NUMISTA;
const KEYS = CONFIG.STORAGE_KEYS;

// Numista no publica un límite por minuto, pero cuenta cada consulta (2.000 al mes gratis): se va despacio.
const MIN_GAP_MS = 400;
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHED_TYPES = 150;
// Monedas que se piden por búsqueda (una sola página: cada página es una consulta más).
const PAGE_SIZE = 50;

let lastRequestAt = 0;

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Memoria del navegador llena: se sigue sin guardar, solo se gasta algo más de cupo.
  }
}

// Numista explica el error en el cuerpo de la respuesta; si no se entiende, se usa el código.
function errorDetail(bodyText) {
  try {
    const data = JSON.parse(bodyText);
    return data.error_message || data.message || data.error || "";
  } catch {
    return "";
  }
}

function interpretStatus(status, bodyText) {
  if (status === 401 || status === 403) {
    return "La llave de Numista no es válida. Revisa que la copiaste entera.";
  }
  if (status === 429) {
    return "Numista dice que hay demasiadas consultas. Espera un minuto; si sigue, se ha agotado el cupo del mes (2.000 en el plan gratuito), que se renueva el día 1.";
  }
  if (status === 404) {
    return "Numista no tiene esa ficha.";
  }
  const detail = errorDetail(bodyText);
  return `Numista respondió con un error inesperado (código ${status})${detail ? `: ${detail.slice(0, 160)}` : "."}`;
}

async function numistaGet(path, params, key) {
  const wait = lastRequestAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();

  const query = new URLSearchParams({ lang, ...params });
  let response;
  try {
    response = await fetch(`${baseUrl}${path}?${query}`, { headers: { "Numista-API-Key": key } });
  } catch {
    // Sin respuesta: o no hay internet, o el navegador ha bloqueado la consulta (CORS).
    const error = new Error(
      navigator.onLine === false
        ? "No hay conexión a internet."
        : "No se pudo contactar con Numista. Comprueba tu conexión; si tienes internet, puede que Numista no deje consultarla desde esta web."
    );
    error.network = true;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(interpretStatus(response.status, await response.text().catch(() => "")));
    error.authError = response.status === 401 || response.status === 403;
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// ---------- Países y emisores ----------

// Lista de emisores de Numista ({ code, name }), en castellano y en inglés para casar mejor
// el nombre que da la IA. Se guarda 30 días: son 2 consultas al mes.
async function fetchIssuers(key) {
  const [es, en] = await Promise.all([
    numistaGet("/issuers", {}, key),
    numistaGet("/issuers", { lang: "en" }, key),
  ]);
  const byCode = new Map();
  for (const list of [es.issuers || [], en.issuers || []]) {
    for (const issuer of list) {
      if (!issuer.code) continue;
      const entry = byCode.get(issuer.code) || { code: issuer.code, names: [] };
      if (issuer.name && !entry.names.includes(issuer.name)) entry.names.push(issuer.name);
      byCode.set(issuer.code, entry);
    }
  }
  const issuers = [...byCode.values()];
  writeJson(KEYS.issuersCache, { at: Date.now(), issuers });
  return issuers;
}

async function getIssuers(key) {
  const cached = readJson(KEYS.issuersCache, null);
  if (cached && Array.isArray(cached.issuers) && cached.issuers.length && Date.now() - cached.at < CACHE_MS) {
    return cached.issuers;
  }
  return fetchIssuers(key);
}

// Texto comparable: sin tildes, en minúsculas y sin signos. "España" → "espana".
export function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Código de Numista del país que ha leído la IA ("España" → "espagne"). "" si no se encuentra.
// Primero un nombre idéntico; si no, uno que empiece igual ("Alemania" → "Alemania, República Federal").
export function matchIssuer(clues, issuers) {
  const wanted = [clues.issuer, clues.issuer_en].map(norm).filter(Boolean);
  if (!wanted.length) return "";
  const exact = issuers.find((i) => i.names.some((n) => wanted.includes(norm(n))));
  if (exact) return exact.code;
  const prefix = issuers.find((i) => i.names.some((n) => wanted.some((w) => w.length >= 4 && norm(n).startsWith(w))));
  return prefix ? prefix.code : "";
}

export async function testNumistaConnection(key) {
  if (!key) {
    return { ok: false, reason: "Falta la llave de Numista." };
  }
  try {
    const issuers = await fetchIssuers(key);
    return { ok: true, reason: `Conexión correcta: Numista conoce ${new Intl.NumberFormat("es-ES").format(issuers.length)} países y emisores.` };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ---------- Búsqueda ----------

export function typeUrl(id) {
  return `${webUrl}/catalogue/pieces${id}.html`;
}

// "1999–2008", "1999" o "" si no se sabe.
export function yearRange(min, max) {
  if (min && max && min !== max) return `${min}–${max}`;
  return String(min || max || "");
}

function fromType(t) {
  return {
    id: t.id,
    title: t.title || "",
    issuer: t.issuer?.name || "",
    issuerCode: t.issuer?.code || "",
    minYear: t.min_year ?? null,
    maxYear: t.max_year ?? null,
    years: yearRange(t.min_year, t.max_year),
    thumb: t.obverse_thumbnail || "",
    reverseThumb: t.reverse_thumbnail || "",
    url: typeUrl(t.id),
  };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// Año de 3 o 4 cifras, o null.
function clueYear(clues) {
  const match = /\b(\d{3,4})\b/.exec(String(clues.year || ""));
  return match ? match[1] : null;
}

// Pasos de más a menos preciso; se para en el primero que da resultados.
function buildSearchSteps(clues, issuerCode) {
  const year = clueYear(clues);
  // El valor en inglés (como titula Numista) y en castellano; uno solo si coinciden sin mirar mayúsculas.
  const denominations = [cleanText(clues.denomination_en), cleanText(clues.denomination)]
    .filter(Boolean)
    .filter((d, i, all) => all.findIndex((x) => x.toLowerCase() === d.toLowerCase()) === i);
  const country = cleanText(clues.issuer_en || clues.issuer);
  const steps = [];
  if (issuerCode) {
    if (year) for (const q of denominations) steps.push({ by: "exact", params: { q, issuer: issuerCode, year } });
    for (const q of denominations) steps.push({ by: "issuer", params: { q, issuer: issuerCode } });
    if (year) steps.push({ by: "issuer-year", params: { issuer: issuerCode, year } });
  }
  for (const d of denominations) {
    const q = [d, country].filter(Boolean).join(" ");
    if (year) steps.push({ by: "text-year", params: { q, year } });
    steps.push({ by: "text", params: { q } });
  }
  // Último recurso: lo que conmemora o el gobernante, con el país.
  const topic = cleanText(clues.commemorative || clues.ruler);
  if (topic) steps.push({ by: "text", params: { q: [topic, country].filter(Boolean).join(" ") } });
  // Sin repetir la misma consulta dos veces (p. ej. si el valor en castellano y en inglés coinciden).
  const seen = new Set();
  return steps.filter((step) => {
    const id = JSON.stringify(step.params);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function runSearchSteps(steps, key, onStep) {
  for (const step of steps) {
    if (onStep) onStep(step.by);
    const data = await numistaGet("/types", { category: "coin", count: String(PAGE_SIZE), ...step.params }, key);
    const types = data.types || [];
    if (types.length) {
      return { candidates: types.map(fromType), strategy: step.by, total: data.count || types.length };
    }
  }
  return { candidates: [], strategy: null, total: 0 };
}

// Devuelve { candidates, strategy, total, issuerCode }. issuerCode: el país de Numista que se ha reconocido ("" si ninguno).
export async function findCandidates(clues, key, onStep) {
  let issuerCode = "";
  if (clues.issuer || clues.issuer_en) {
    if (onStep) onStep("issuers");
    issuerCode = matchIssuer(clues, await getIssuers(key));
  }
  const result = await runSearchSteps(buildSearchSteps(clues, issuerCode), key, onStep);
  return { ...result, issuerCode };
}

export function searchByText(text, key, onStep) {
  return runSearchSteps([{ by: "manual", params: { q: cleanText(text) } }], key, onStep);
}

// ---------- Ficha ----------

const side = (s) =>
  s && {
    picture: s.picture || "",
    thumbnail: s.thumbnail || "",
    description: s.description || "",
    lettering: s.lettering || "",
    translation: s.lettering_translation || "",
  };

// Solo lo que enseña la ficha, para que quepan muchas en la memoria del móvil.
function trimType(t) {
  return {
    // Ficha completa (la provisional, hecha con el candidato, no lo lleva).
    full: true,
    id: t.id,
    title: t.title || "",
    url: t.url || typeUrl(t.id),
    issuer: t.issuer?.name || "",
    issuerCode: t.issuer?.code || "",
    minYear: t.min_year ?? null,
    maxYear: t.max_year ?? null,
    type: t.type || "",
    value: t.value?.text || "",
    currency: t.value?.currency?.full_name || t.value?.currency?.name || "",
    rulers: (t.ruler || []).map((r) => r.name).filter(Boolean),
    demonetized: Boolean(t.demonetization?.is_demonetized),
    demonetizedDate: t.demonetization?.demonetization_date || "",
    shape: t.shape || "",
    composition: t.composition?.text || "",
    technique: t.technique?.text || "",
    weight: t.weight ?? null,
    size: t.size ?? null,
    thickness: t.thickness ?? null,
    orientation: t.orientation || "",
    obverse: side(t.obverse) || null,
    reverse: side(t.reverse) || null,
    edge: t.edge ? { description: t.edge.description || "", lettering: t.edge.lettering || "" } : null,
    mints: (t.mints || []).map((m) => m.name).filter(Boolean),
    series: t.series || "",
    commemorated: t.commemorated_topic || "",
  };
}

// Ficha completa de una moneda. Se guarda en el móvil 30 días: volver a abrirla no gasta cupo.
export async function getType(id, key) {
  const cache = readJson(KEYS.typeCache, {});
  const hit = cache[id];
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = trimType(await numistaGet(`/types/${encodeURIComponent(id)}`, {}, key));
  cache[id] = { at: Date.now(), data };
  // Si hay demasiadas, se olvidan las más antiguas.
  const ids = Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at);
  for (const old of ids.slice(MAX_CACHED_TYPES)) delete cache[old];
  writeJson(KEYS.typeCache, cache);
  return data;
}
