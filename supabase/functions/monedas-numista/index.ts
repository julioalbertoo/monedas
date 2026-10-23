// Intermediario de la API de Numista para Monedas: la llave vive aquí (secreto NUMISTA_KEY), nunca en el móvil.
import { CORS, json, checkUser, wrap, getKey } from "../_shared/common.ts";

const BASE_URL = "https://api.numista.com/v3";
// Solo lo que usa la app: lista de países, búsqueda y ficha.
const ALLOWED_PATH = /^\/(issuers|types|types\/\d+)$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const denied = await checkUser(req);
  if (denied) return denied;

  const key = await getKey("numista");
  if (!key) return json({ error: "missing_key" }, 500);

  let payload: { path?: string; params?: Record<string, string> };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const path = String(payload.path || "");
  if (!ALLOWED_PATH.test(path)) return json({ error: "bad_path" }, 400);

  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(payload.params || {})) query.set(name, String(value));
  const response = await fetch(`${BASE_URL}${path}?${query}`, { headers: { "Numista-API-Key": key } });
  return wrap(response);
});
