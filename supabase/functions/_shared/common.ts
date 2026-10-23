import { createClient } from "npm:@supabase/supabase-js@2.117.2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Comprueba que quien llama ha iniciado sesión y está en la lista de Monedas.
// Devuelve null si puede pasar, o la respuesta de error que hay que enviar.
export async function checkUser(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "no_session" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !data.user) return json({ error: "no_session" }, 401);
  const { data: row } = await supabase
    .from("monedas_usuarios")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!row) return json({ error: "not_allowed" }, 403);
  return null;
}

// La respuesta del servicio de fuera va dentro de un sobre { status, body } con código 200,
// para que la app distinga un fallo de Gemini o Numista de un fallo de sesión.
export async function wrap(response: Response): Promise<Response> {
  return json({ status: response.status, body: await response.text() });
}

// Llave de Gemini o Numista: primero el secreto de las funciones (GEMINI_KEY / NUMISTA_KEY);
// si no está, la guardada cifrada en Vault (monedas_gemini_key / monedas_numista_key).
const keyCache = new Map<string, string>();
export async function getKey(name: "gemini" | "numista"): Promise<string> {
  const fromEnv = Deno.env.get(`${name.toUpperCase()}_KEY`);
  if (fromEnv) return fromEnv;
  if (keyCache.has(name)) return keyCache.get(name)!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data } = await admin.rpc("monedas_llave", { nombre: name });
  const key = typeof data === "string" ? data : "";
  if (key) keyCache.set(name, key);
  return key;
}
