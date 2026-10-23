// Bandera (emoji) del país a partir del nombre que da Numista («España», «Estados Unidos»...).
// Se hace en el móvil, sin consultas: el navegador sabe el nombre de cada país en castellano e inglés.

// Códigos antiguos o que no son países (p. ej. DD, la RDA, que el navegador llama «Alemania»).
const RETIRED = new Set(["DD", "FX", "CS", "YU", "ZR", "TP", "BU", "SU", "NT", "AN", "EU", "UN", "EZ", "QO", "XK", "ZZ"]);

const CODES = (() => {
  const map = new Map();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const names = ["es", "en"].map((lang) => {
    try {
      return new Intl.DisplayNames([lang], { type: "region" });
    } catch {
      return null;
    }
  });
  for (const a of letters) {
    for (const b of letters) {
      const code = a + b;
      if (RETIRED.has(code)) continue;
      for (const display of names) {
        const name = display && display.of(code);
        // Si no conoce el código, devuelve el propio código.
        // El primero gana: «Francia» es FR, no FX (un código antiguo con otro nombre igual).
        if (name && name !== code && !map.has(norm(name))) map.set(norm(name), code);
      }
    }
  }
  // Nombres que Numista escribe distinto que el navegador.
  for (const [name, code] of Object.entries({
    "reino unido": "GB",
    "estados unidos": "US",
    "paises bajos": "NL",
    holanda: "NL",
    "republica checa": "CZ",
    rusia: "RU",
    "corea del sur": "KR",
    "vaticano": "VA",
    "ciudad del vaticano": "VA",
  })) {
    map.set(name, code);
  }
  return map;
})();

function norm(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "ES" → 🇪🇸
function emoji(code) {
  return [...code].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}

// Devuelve la bandera, o "" si el emisor no es un país de hoy (p. ej. «Imperio romano»).
export function flagFor(issuer) {
  const name = norm(issuer);
  if (!name) return "";
  // «Alemania - República Federal», «España (Franco)»: vale la parte de antes.
  const short = norm(String(issuer).split(/\s[-–]\s|\(|,/)[0]);
  const code = CODES.get(name) || CODES.get(short);
  return code ? emoji(code) : "";
}

// «🇪🇸 España», o el nombre solo si no hay bandera.
export function withFlag(issuer) {
  const flag = flagFor(issuer);
  return flag ? `${flag} ${issuer}` : issuer;
}
