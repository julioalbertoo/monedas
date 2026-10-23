// Intermediario de Google Gemini para Monedas: la llave vive aquí (secreto GEMINI_KEY), nunca en el móvil.
import { CORS, json, checkUser, wrap } from "../_shared/common.ts";

const CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

async function modelNames(key: string): Promise<Response> {
  const names: string[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await fetch(`${MODELS_URL}?${query}`, { headers: { "x-goog-api-key": key } });
    if (!response.ok) return wrap(response);
    const data = await response.json();
    for (const m of data.models || []) {
      if ((m.supportedGenerationMethods || []).includes("generateContent")) {
        names.push(String(m.name).replace(/^models\//, ""));
      }
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return json({ status: 200, body: JSON.stringify({ names }) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const denied = await checkUser(req);
  if (denied) return denied;

  const key = Deno.env.get("GEMINI_KEY");
  if (!key) return json({ error: "missing_key" }, 500);

  let payload: { action?: string; body?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  if (payload.action === "models") return modelNames(key);

  if (payload.action === "chat" && payload.body) {
    // Solo modelos de Google que lean fotos (Gemini o Gemma).
    const model = String(payload.body.model || "");
    if (!/^(gemini|gemma)-[\w.-]+$/.test(model)) return json({ error: "bad_model" }, 400);
    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload.body),
    });
    return wrap(response);
  }

  return json({ error: "bad_request" }, 400);
});
