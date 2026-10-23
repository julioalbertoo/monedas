import { CONFIG } from "./config.js";

const KEY = CONFIG.STORAGE_KEYS.history;
const MAX_ITEMS = 500;

// Cada entrada: { type_id, title, issuer, years, value, thumb, reverseThumb, date }.
// type_id es el número de la moneda en Numista: con él se vuelve a abrir su ficha.
export function getHistory() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function save(items) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

// Si la moneda ya estaba, se actualiza y sube al principio en vez de duplicarse.
export function addToHistory(entry) {
  const items = getHistory().filter((item) => String(item.type_id) !== String(entry.type_id));
  items.unshift({ ...entry, date: new Date().toISOString() });
  save(items);
}

export function removeFromHistory(typeId) {
  save(getHistory().filter((item) => String(item.type_id) !== String(typeId)));
}

export function clearHistory() {
  localStorage.removeItem(KEY);
}

export function isInHistory(typeId) {
  return getHistory().some((item) => String(item.type_id) === String(typeId));
}
