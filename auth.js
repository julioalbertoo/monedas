import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { CONFIG } from "./config.js";

const { url, publishableKey } = CONFIG.SUPABASE;

// Sesión de Supabase: se guarda en el móvil y se renueva sola mientras se usa la app.
const supabase = createClient(url, publishableKey);

export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) return { ok: false, reason: "El email o la contraseña no son correctos." };
    if (/email not confirmed/i.test(error.message)) return { ok: false, reason: "Falta confirmar el email." };
    return { ok: false, reason: `No se pudo entrar: ${error.message}` };
  }
  return { ok: true, user: data.user };
}

export async function signOut() {
  await supabase.auth.signOut();
}

const AUTH_MESSAGES = {
  no_session: "Tu sesión ha caducado. Vuelve a entrar.",
  not_allowed: "Esta cuenta no tiene permiso para usar Monedas.",
  missing_key: "Falta configurar la llave en el servidor. Avisa a quien gestiona la app.",
};

// Llama a una función de Supabase (el intermediario que guarda las llaves de Gemini y Numista).
// Devuelve { status, body }: la respuesta de Gemini o Numista tal cual llega al servidor.
// Si falla la sesión o el propio servidor, lanza un error (con authError si hay que volver a entrar).
export async function callFunction(name, payload, signal) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    const error = new Error(AUTH_MESSAGES.no_session);
    error.authError = true;
    throw error;
  }
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // cae abajo
  }
  if (response.ok && parsed && typeof parsed.status === "number") return parsed;
  const code = parsed?.error;
  const error = new Error(AUTH_MESSAGES[code] || `El servidor de Monedas respondió con un error (código ${response.status}).`);
  error.authError = code === "no_session" || code === "not_allowed";
  error.server = true;
  throw error;
}
