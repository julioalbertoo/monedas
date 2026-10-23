import { CONFIG } from "./config.js";

const KEYS = CONFIG.STORAGE_KEYS;

function clean(value) {
  return (value || "").trim().replace(/\s+/g, "");
}

export function getAiKey() {
  return localStorage.getItem(KEYS.aiKey) || "";
}

export function setAiKey(value) {
  const cleaned = clean(value);
  if (cleaned !== getAiKey()) {
    localStorage.setItem(KEYS.aiKey, cleaned);
    localStorage.removeItem(KEYS.aiVerified);
  }
  return cleaned;
}

export function clearAiKey() {
  localStorage.removeItem(KEYS.aiKey);
  localStorage.removeItem(KEYS.aiVerified);
}

export function markAiVerified(ok) {
  if (ok) localStorage.setItem(KEYS.aiVerified, "1");
  else localStorage.removeItem(KEYS.aiVerified);
}

export function getNumistaKey() {
  return localStorage.getItem(KEYS.numistaKey) || "";
}

export function setNumistaKey(value) {
  const cleaned = clean(value);
  if (cleaned !== getNumistaKey()) {
    localStorage.setItem(KEYS.numistaKey, cleaned);
    localStorage.removeItem(KEYS.numistaVerified);
  }
  return cleaned;
}

export function clearNumistaKey() {
  localStorage.removeItem(KEYS.numistaKey);
  localStorage.removeItem(KEYS.numistaVerified);
}

export function markNumistaVerified(ok) {
  if (ok) localStorage.setItem(KEYS.numistaVerified, "1");
  else localStorage.removeItem(KEYS.numistaVerified);
}

export function hasTokens() {
  return Boolean(getAiKey() && getNumistaKey());
}

export function areTokensVerified() {
  return (
    hasTokens() &&
    localStorage.getItem(KEYS.aiVerified) === "1" &&
    localStorage.getItem(KEYS.numistaVerified) === "1"
  );
}
