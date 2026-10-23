import { norm } from "./numista.js";

// Palabras con peso de un texto ("Juan Carlos I" → ["juan", "carlos"]).
function words(value) {
  return String(value || "")
    .split(/[\s,.;:()/-]+/)
    .map(norm)
    .filter((w) => w.length >= 4);
}

function looselyEqual(a, b) {
  const x = norm(a);
  const y = norm(b);
  return Boolean(x && y) && (x === y || x.includes(y) || y.includes(x));
}

// Palabras comparables de un texto, en orden ("50 Euro Cent" → ["50", "euro", "cent"]).
function tokens(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// ¿Aparece el valor seguido en el título? "1 Euro" no vale para "1 Euro Cent": detrás no puede ir «cent…».
function hasDenomination(title, denomination) {
  const t = tokens(title);
  const d = tokens(denomination);
  if (!d.length) return false;
  for (let i = 0; i + d.length <= t.length; i += 1) {
    if (d.every((w, j) => t[i + j] === w) && !/^cent/.test(t[i + d.length] || "")) return true;
  }
  return false;
}

// Primer número de un texto ("50 céntimos" → 50, "½ Dollar" → null).
function leadingNumber(value) {
  const match = /(\d+(?:[.,]\d+)?)/.exec(String(value || ""));
  return match ? Number(match[1].replace(",", ".")) : null;
}

function scoreCandidate(candidate, clues, issuerCode) {
  let score = 0;
  const matches = [];
  const title = norm(candidate.title);

  const year = Number.parseInt(clues.year, 10);
  const min = Number(candidate.minYear) || null;
  const max = Number(candidate.maxYear) || min;
  if (year && min) {
    if (year >= min && year <= max) {
      score += 3;
      matches.push("año");
    } else if (Math.min(Math.abs(year - min), Math.abs(year - max)) <= 2) {
      score += 1;
      matches.push("año aproximado");
    }
  }

  if ((issuerCode && candidate.issuerCode === issuerCode) || looselyEqual(clues.issuer, candidate.issuer) || looselyEqual(clues.issuer_en, candidate.issuer)) {
    score += 3;
    matches.push("país");
  }

  if ([clues.denomination_en, clues.denomination].some((d) => hasDenomination(candidate.title, d))) {
    score += 3;
    matches.push("valor");
  } else {
    const number = leadingNumber(clues.denomination_en || clues.denomination);
    if (number !== null && leadingNumber(candidate.title) === number) {
      score += 1;
      matches.push("cifra del valor");
    }
  }

  const ruler = words(clues.ruler);
  if (ruler.length && ruler.every((w) => title.includes(w))) {
    score += 1;
    matches.push("gobernante");
  }

  const topic = words(clues.commemorative);
  if (topic.length && topic.some((w) => title.includes(w))) {
    score += 1;
    matches.push("tema");
  }

  return { ...candidate, score, matches };
}

// A igual puntuación se respeta el orden de Numista (sort es estable).
export function rankCandidates(candidates, clues, issuerCode = "") {
  return candidates.map((c) => scoreCandidate(c, clues || {}, issuerCode)).sort((a, b) => b.score - a.score);
}
