import { currentUser, signIn, signOut } from "./auth.js";
import { CONFIG } from "./config.js";
import { testAiConnection, identify } from "./ai.js";
import { testNumistaConnection, findCandidates, searchByText, getType, yearRange, typeUrl } from "./numista.js";
import { prepareImage } from "./imaging.js";
import { rankCandidates } from "./scoring.js";
import { getHistory, addToHistory, removeFromHistory, clearHistory, isInHistory } from "./history.js";

const SEARCH_STEP_LABELS = {
  issuers: "Reconociendo el país en Numista",
  exact: "Buscando en Numista por país, valor y año",
  issuer: "Buscando en Numista por país y valor",
  "issuer-year": "Buscando en Numista por país y año",
  "text-year": "Buscando en Numista por texto y año",
  text: "Buscando en Numista por texto libre",
  manual: "Buscando en Numista",
};

const RESULT_LABELS = {
  exact: "por país, valor y año",
  issuer: "por país y valor",
  "issuer-year": "por país y año",
  "text-year": "por texto y año",
  text: "por texto libre",
  manual: "con lo que has escrito",
};

const VIEWS = ["login", "settings", "capture", "results", "detail", "collection"];
// Pestaña que se marca en la barra inferior para cada pantalla.
const TAB_FOR_VIEW = { capture: "capture", results: "capture", collection: "collection", settings: "settings" };

// ---------- Botón «atrás» del navegador ----------
// La app es una sola página: para que «atrás» (o deslizar desde el borde en el iPhone) haga lo mismo que
// «← Volver», cada pantalla de detalle (candidatos, ficha) deja una marca en el historial.
const SUB_VIEWS = ["results", "detail"];
let navDepth = 0;
let skipPop = false;

function pushNav() {
  navDepth += 1;
  history.pushState({ monedas: navDepth }, "");
}

// «← Volver» de la app: pasa por el historial para que el navegador no se descuadre.
function navBack() {
  if (navDepth > 0) history.back();
  else goBack();
}

// Lo que hace «Volver» en la pantalla que se ve ahora.
function goBack() {
  const view = activeView();
  if (view === "detail") detailBack();
  else if (view === "results") resultsBack();
}

window.addEventListener("popstate", (event) => {
  const depth = (event.state && event.state.monedas) || 0;
  if (skipPop) {
    skipPop = false;
    navDepth = depth;
    return;
  }
  const back = depth < navDepth;
  navDepth = depth;
  if (back) goBack();
});

function showView(name) {
  // Al irse a una pestaña principal se borran las marcas: «atrás» ya no tiene a qué volver dentro de la app.
  if (!SUB_VIEWS.includes(name) && navDepth > 0) {
    skipPop = true;
    history.go(-navDepth);
    navDepth = 0;
  }
  if (name === "collection") renderCollection();
  for (const view of VIEWS) {
    document.getElementById(`view-${view}`).classList.toggle("active", view === name);
  }
  // Sin sesión no hay barra: antes de nada hay que entrar.
  document.body.classList.toggle("no-tabbar", name === "login");
  for (const tab of document.querySelectorAll("#tabbar button")) {
    tab.classList.toggle("active", tab.dataset.view === tabFor(name));
  }
}

// Pestaña de la barra inferior que se marca: la ficha, en la pestaña desde la que se abrió.
function tabFor(name) {
  if (name === "detail") return TAB_FOR_VIEW[detailReturnView];
  return TAB_FOR_VIEW[name];
}

function activeView() {
  return VIEWS.find((view) => document.getElementById(`view-${view}`).classList.contains("active"));
}

// Vuelve a donde estaba la pantalla al irse de ella.
function restoreScroll(y) {
  requestAnimationFrame(() => window.scrollTo(0, y || 0));
}

// Muestra un error en `statusEl`; si es un problema de sesión, añade un botón para volver a entrar.
function showError(statusEl, message, authError = false) {
  statusEl.textContent = `❌ ${message} `;
  if (authError) {
    const button = el("button", "inline-link", "Volver a entrar");
    button.type = "button";
    button.addEventListener("click", logout);
    statusEl.append(button);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function img(className, src, alt = "") {
  const node = el("img", className);
  node.src = src;
  node.alt = alt;
  node.loading = "lazy";
  return node;
}

// Foto de Numista. Numista no siempre deja que otras webs enseñen sus fotos (aunque abiertas sueltas sí se ven),
// así que cada foto se prueba de varias formas hasta que una carga: directa (sin decir desde qué web viene),
// a través de dos intermediarios de imágenes que solo reciben el enlace público de la foto (wsrv.nl e i0.wp.com,
// el de WordPress) y otra vez por wsrv con otra dirección, por si se quedó con un fallo pasajero. Después se pasa
// a la siguiente foto de la lista (p. ej. la miniatura). Si ninguna carga, lo dice.
// (No se usa el emoji 🪙: en el iPhone parece la foto de una moneda de verdad.)
const PHOTO_ROUTES = [
  { name: "directa", url: (src) => src },
  { name: "wsrv", url: (src) => `https://wsrv.nl/?w=800&url=${encodeURIComponent(src)}` },
  { name: "wp.com", url: (src) => `https://i0.wp.com/${src.replace(/^https?:\/\//, "")}?ssl=1&w=800` },
  { name: "wsrv 2", url: (src) => `https://wsrv.nl/?w=800&q=85&url=${encodeURIComponent(src)}` },
];

function noPhoto(className, text = "Sin foto") {
  return el("span", `${className} coin-empty`, text);
}

// failedText: lo que se lee en el círculo si hay foto pero no carga. tried: se añade qué formas se probaron
// (solo en la ficha, donde cabe), para saber por dónde falla.
function coinImg(className, sources, alt = "", failedText = "Foto no disponible", tried = false) {
  const attempts = [];
  for (const src of new Set(sources.filter(Boolean))) {
    for (const route of PHOTO_ROUTES) attempts.push({ name: route.name, url: route.url(src) });
  }
  if (!attempts.length) return noPhoto(className);
  const node = el("img", className);
  node.alt = alt;
  node.loading = "lazy";
  node.referrerPolicy = "no-referrer";
  let attempt = 0;
  node.addEventListener("error", () => {
    attempt += 1;
    if (attempt < attempts.length) {
      node.src = attempts[attempt].url;
      return;
    }
    const empty = noPhoto(className, failedText);
    if (tried) empty.append(el("small", "coin-tried", [...new Set(attempts.map((a) => a.name))].join(" · ")));
    node.replaceWith(empty);
  });
  node.src = attempts[0].url;
  return node;
}

// ---------- Sesión y ajustes ----------

async function showSignedIn(user) {
  document.getElementById("settings-user").textContent = `👤 Has entrado como ${user.email}`;
  showView("capture");
}

async function logout() {
  await signOut();
  document.getElementById("login-password").value = "";
  document.getElementById("login-status").textContent = "";
  showView("login");
}

function initLogin() {
  const form = document.getElementById("login-form");
  const status = document.getElementById("login-status");
  const submit = document.getElementById("login-submit");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    if (!email.trim() || !password) {
      status.textContent = "Escribe tu email y tu contraseña.";
      return;
    }
    submit.disabled = true;
    status.textContent = "Entrando...";
    const result = await signIn(email, password).catch(() => ({ ok: false, reason: "No se pudo conectar. Comprueba tu conexión a internet." }));
    submit.disabled = false;
    if (!result.ok) {
      status.textContent = `❌ ${result.reason}`;
      return;
    }
    status.textContent = "";
    document.getElementById("login-password").value = "";
    showSignedIn(result.user);
  });
}

// En el iPhone, al abrir el teclado la barra de abajo se sube con él y tapa la caja en la que
// escribes. Mientras hay una caja de texto activa, la barra se esconde.
function isTextField(target) {
  return target instanceof HTMLInputElement && !["button", "checkbox", "radio", "file"].includes(target.type);
}

function initTypingMode() {
  document.addEventListener("focusin", (event) => {
    if (isTextField(event.target)) document.body.classList.add("typing");
  });
  document.addEventListener("focusout", (event) => {
    if (!isTextField(event.target)) return;
    // Si el foco salta directamente a otra caja, la barra sigue escondida.
    setTimeout(() => {
      if (!isTextField(document.activeElement)) document.body.classList.remove("typing");
    }, 0);
  });
}

function initTabbar() {
  document.getElementById("tabbar").addEventListener("click", (event) => {
    const tab = event.target.closest("button");
    if (tab) {
      showView(tab.dataset.view);
      window.scrollTo(0, 0);
    }
  });
}

function initSettings() {
  document.getElementById("settings-logout").addEventListener("click", logout);

  document.getElementById("settings-test-ai").addEventListener("click", async () => {
    const result = document.getElementById("settings-test-ai-status");
    result.textContent = "Probando...";
    const { ok, reason, authError } = await testAiConnection();
    if (ok) result.textContent = `✅ ${reason}`;
    else showError(result, reason, authError);
  });

  document.getElementById("settings-test-numista").addEventListener("click", async () => {
    const result = document.getElementById("settings-test-numista-status");
    result.textContent = "Probando...";
    const { ok, reason, authError } = await testNumistaConnection();
    if (ok) result.textContent = `✅ ${reason}`;
    else showError(result, reason, authError);
  });
}

// ---------- Candidatos ----------

// Anverso y reverso en pequeño (o «Sin foto» si Numista no tiene).
function coinThumbs(className, front, back) {
  const box = el("div", className);
  const pictures = [front, back].filter(Boolean);
  if (!pictures.length) box.append(noPhoto("coin-thumb"));
  for (const src of pictures) box.append(coinImg("coin-thumb", [src]));
  return box;
}

function renderCard(candidate, index, owned) {
  const best = index === 0;
  const have = owned.has(String(candidate.id));
  const card = el("article", ["card", best && "card--best", have && "card--owned"].filter(Boolean).join(" "));
  if (best) card.append(el("span", "card-badge", "★ Mejor coincidencia"));
  card.append(coinThumbs("card-coins", candidate.thumb, candidate.reverseThumb));

  const body = el("div", "card-body");
  body.append(el("h3", null, candidate.title));
  if (have) body.append(el("p", "card-owned", "🪙 Ya la tienes"));
  body.append(el("p", null, [candidate.issuer || "País ?", candidate.years || "Años ?"].join(" · ")));
  if (candidate.matches && candidate.matches.length) {
    body.append(el("p", "card-matches", candidate.matches.map((m) => `✓ ${m}`).join("  ")));
  }
  // Solo el mejor candidato lleva el botón lila: es la acción más probable.
  const select = el("button", best ? "card-select" : "card-select secondary", exploreMode ? "🧭 Explorar esta" : "✓ Es esta");
  select.type = "button";
  select.addEventListener("click", () => openDetail(candidate));
  body.append(select);

  const link = el("a", null, "Ver en Numista ↗");
  link.href = candidate.url;
  link.target = "_blank";
  link.rel = "noopener";
  body.append(link);

  card.append(body);
  return card;
}

let lastClues = {};
let lastIssuerCode = "";

const RESULTS_FIRST = 5;
const RESULTS_STEP = 10;

// ranked: candidatos ordenados de mejor a peor. Se enseñan 5 al principio y luego de 10 en 10 con «Ver 10 más».
function renderResults(ranked, total, strategy, clues) {
  lastClues = clues;
  const how = RESULT_LABELS[strategy] || "";
  const summary = document.getElementById("results-summary");
  const list = document.getElementById("results-list");
  const more = document.getElementById("results-more");
  // Monedas que ya están en «Mis monedas», para marcarlas con «Ya la tienes».
  const owned = new Set(getHistory().map((item) => String(item.type_id)));
  // Numista da una sola página: si hay más, se dice de cuántas se ha elegido.
  const found = total > ranked.length ? `${total} monedas encontradas ${how}. De las ${ranked.length} primeras,` : `${ranked.length} monedas encontradas ${how}.`;
  let shown = 0;
  function showMore() {
    const next = ranked.slice(shown, shown + (shown ? RESULTS_STEP : RESULTS_FIRST));
    list.append(...next.map((candidate, i) => renderCard(candidate, shown + i, owned)));
    shown += next.length;
    summary.textContent = `${found} ${total > ranked.length ? "las" : "Las"} ${shown} que mejor encajan:`;
    const left = ranked.length - shown;
    more.hidden = left <= 0;
    more.textContent =
      left > RESULTS_STEP ? `Ver ${RESULTS_STEP} más (quedan ${left})` : left === 1 ? "Ver la que queda" : `Ver las ${left} que quedan`;
  }
  list.replaceChildren();
  more.onclick = showMore;
  showMore();
  document.getElementById("results-add-side").hidden = !canAddSide();
  document.getElementById("results-clues-json").textContent = JSON.stringify(clues, null, 2);
  if (activeView() !== "results") pushNav();
  showView("results");
  window.scrollTo(0, 0);
}

function resetManualSearch(clues) {
  document.getElementById("results-manual").hidden = true;
  document.getElementById("results-manual-input").value = [clues.issuer, clues.denomination, clues.year].filter(Boolean).join(" ");
  document.getElementById("results-manual-status").textContent = "";
}

// ---------- Ficha ----------

const number = (n, digits = 2) => Number(n).toLocaleString("es-ES", { maximumFractionDigits: digits });

// Numista da la orientación con estas palabras; las que no están se enseñan tal cual.
const ORIENTATIONS = { coin: "Moneda (⇅)", medal: "Medalla (⇈)", variable: "Variable" };

// "2009-12-31" → "31/12/2009"; si no se entiende, tal cual.
function shortDate(value) {
  const [, y, m, d] = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "") || [];
  if (!y) return value || "";
  if (m === "00") return y;
  return d === "00" ? `${m}/${y}` : `${d}/${m}/${y}`;
}

// Apartado plegable de la ficha: empieza cerrado y se abre al tocar el título.
function foldable(title, ...content) {
  const box = el("details", "detail-fold");
  box.append(el("summary", null, title), ...content);
  return box;
}

function factList(rows) {
  const list = el("dl", "detail-facts");
  for (const [term, value] of rows) {
    if (value) list.append(el("dt", null, term), el("dd", null, String(value)));
  }
  return list;
}

// Una cara de la moneda (anverso, reverso): descripción y leyenda.
function sideFold(title, side) {
  if (!side || !(side.description || side.lettering)) return null;
  const nodes = [];
  if (side.description) nodes.push(el("p", "detail-notes", side.description));
  if (side.lettering) {
    nodes.push(el("p", "detail-sub", "Leyenda"), el("p", "detail-notes detail-lettering", side.lettering));
  }
  if (side.translation) nodes.push(el("p", "detail-sub", "Traducción"), el("p", "detail-notes", side.translation));
  return foldable(title, ...nodes);
}

// Foto grande de una cara; al tocarla se abre entera. sources: la foto grande y, de reserva, la miniatura.
function sidePicture(sources, caption) {
  const figure = el("figure", "detail-side");
  const urls = sources.filter(Boolean);
  if (urls.length) {
    const link = el("a");
    link.href = urls[0];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(coinImg("detail-side-img", urls, caption, "No carga: toca para verla", true));
    figure.append(link);
  } else {
    figure.append(noPhoto("detail-side-img"));
  }
  figure.append(el("figcaption", null, caption));
  return figure;
}

// coin: ficha (completa o provisional, con lo que ya se sabe del candidato). photos: las fotos del usuario, si las hay.
function renderDetail(coin, photos = []) {
  const nodes = [];
  const sides = el("div", "detail-sides");
  sides.append(
    sidePicture([coin.obverse?.picture, coin.obverse?.thumbnail, coin.thumb], "Anverso"),
    sidePicture([coin.reverse?.picture, coin.reverse?.thumbnail, coin.reverseThumb], "Reverso")
  );
  nodes.push(sides);
  nodes.push(el("h2", null, coin.title));
  const years = coin.years || yearRange(coin.minYear, coin.maxYear);
  nodes.push(el("p", "detail-meta", [coin.issuer || "País ?", years || "Años ?"].join(" · ")));

  const chips = el("div", "detail-chips");
  if (coin.value) chips.append(el("span", "detail-chip detail-chip--main", coin.value));
  // En la etiqueta, el metal en corto ("Bimetálica: centro de níquel…" → "Bimetálica"); entero va en la lista.
  const metal = (coin.composition || "").split(":")[0].trim();
  if (metal && metal.length <= 30) chips.append(el("span", "detail-chip", metal));
  if (coin.commemorated) chips.append(el("span", "detail-chip detail-chip--soft", "Conmemorativa"));
  if (coin.demonetized) chips.append(el("span", "detail-chip detail-chip--rose", "Fuera de circulación"));
  if (chips.children.length) nodes.push(chips);

  if (coin.full) {
    nodes.push(
      factList([
        ["Valor", [coin.value, coin.currency].filter(Boolean).join(" · ")],
        ["Emisor", coin.issuer],
        ["Años", years],
        [coin.rulers.length > 1 ? "Gobernantes" : "Gobernante", coin.rulers.join(", ")],
        ["Tipo", coin.type],
        ["Conmemora", coin.commemorated],
        ["Serie", coin.series],
        ["Metal", coin.composition],
        ["Peso", coin.weight ? `${number(coin.weight)} g` : ""],
        ["Diámetro", coin.size ? `${number(coin.size)} mm` : ""],
        ["Grosor", coin.thickness ? `${number(coin.thickness)} mm` : ""],
        ["Forma", coin.shape],
        ["Técnica", coin.technique],
        ["Orientación", ORIENTATIONS[coin.orientation] || coin.orientation],
        ["Canto", coin.edge?.description],
        ["Cecas", coin.mints.join(", ")],
        ["Retirada", coin.demonetized ? shortDate(coin.demonetizedDate) || "Sí" : ""],
      ])
    );
    for (const fold of [sideFold("🪙 Anverso", coin.obverse), sideFold("🪙 Reverso", coin.reverse)]) {
      if (fold) nodes.push(fold);
    }
    if (coin.edge && coin.edge.lettering) {
      nodes.push(foldable("〰️ Canto", el("p", "detail-notes detail-lettering", coin.edge.lettering)));
    }
  }
  if (photos.length) {
    const box = el("div", "detail-photos");
    for (const photo of photos) box.append(img("detail-photo", photo, "Tu foto"));
    nodes.push(foldable(photos.length > 1 ? "📷 Tus fotos" : "📷 Tu foto", box));
  }
  const link = el("a", "btn btn-soft detail-numista", "Ver en Numista ↗");
  link.href = coin.url;
  link.target = "_blank";
  link.rel = "noopener";
  nodes.push(link);
  document.getElementById("detail-content").replaceChildren(...nodes);
}

let detailRequest = 0;
let detailReturnView = "results";
let detailScroll = 0;

const BACK_LABELS = {
  results: "← Volver a los candidatos",
  collection: "← Volver a mis monedas",
};

// returnView: pantalla a la que lleva "Volver". Desde «Mis monedas» la moneda ya está guardada: no se vuelve a guardar.
async function openDetail(candidate, { returnView = "results" } = {}) {
  const fromHistory = returnView !== "results";
  if (activeView() !== "detail") {
    detailScroll = window.scrollY;
    pushNav();
  }
  detailReturnView = returnView;
  document.getElementById("detail-back").textContent = BACK_LABELS[returnView];
  const savedNote = document.getElementById("detail-saved");
  savedNote.textContent = "";
  // Las fotos del usuario solo se enseñan si vienen de identificar (no se guardan en el móvil).
  const photos = fromHistory ? [] : capturedPhotos();

  // Mientras llega la ficha completa se enseña lo que ya sabemos del candidato.
  renderDetail(candidate, photos);
  showView("detail");
  window.scrollTo(0, 0);

  const request = ++detailRequest;
  let coin = null;
  try {
    coin = await getType(candidate.id);
    if (request === detailRequest) renderDetail(coin, photos);
  } catch (err) {
    if (request === detailRequest) {
      const note = el("p", "status");
      showError(note, `No se pudo cargar la ficha completa: ${err.message}`, err.authError);
      document.getElementById("detail-content").append(note);
    }
  }

  if (fromHistory) return;
  const alreadyOwned = isInHistory(candidate.id);
  if (exploreMode) {
    savedNote.textContent = alreadyOwned
      ? "🧭 Modo explorador · 🪙 Ya la tienes en tu colección"
      : "🧭 Modo explorador: no se ha guardado en tu colección";
    return;
  }
  // Si la ficha no llegó, se guarda con los datos del candidato para no perder la confirmación.
  try {
    addToHistory({
      type_id: candidate.id,
      title: coin ? coin.title : candidate.title,
      issuer: coin ? coin.issuer : candidate.issuer,
      years: coin ? yearRange(coin.minYear, coin.maxYear) : candidate.years,
      value: coin ? coin.value : "",
      thumb: (coin && coin.obverse?.thumbnail) || candidate.thumb || "",
      reverseThumb: (coin && coin.reverse?.thumbnail) || candidate.reverseThumb || "",
    });
    if (request === detailRequest) savedNote.textContent = alreadyOwned ? "🪙 Ya estaba en tu colección" : "✓ Guardada en «Mis monedas»";
  } catch {
    if (request === detailRequest) savedNote.textContent = "❌ No se pudo guardar (¿memoria del navegador llena?).";
  }
}

function detailBack() {
  showView(detailReturnView);
  restoreScroll(detailScroll);
}

function initDetail() {
  document.getElementById("detail-back").addEventListener("click", navBack);
}

// ---------- Mis monedas ----------

function historyItemToCandidate(item) {
  return {
    id: item.type_id,
    title: item.title,
    issuer: item.issuer || "",
    years: item.years || "",
    value: item.value || "",
    thumb: item.thumb || "",
    reverseThumb: item.reverseThumb || "",
    url: typeUrl(item.type_id),
  };
}

function renderHistoryItem(item) {
  const wrapper = el("div", "history-item");

  const open = el("button", "history-open");
  open.type = "button";
  open.append(coinImg("history-cover", [item.thumb, item.reverseThumb]));
  open.append(el("span", "history-title", item.title));
  const meta = [item.issuer, item.years].filter(Boolean).join(" · ");
  if (meta) open.append(el("span", "history-meta", meta));
  open.addEventListener("click", () => openDetail(historyItemToCandidate(item), { returnView: "collection" }));

  const remove = el("button", "history-remove", "✕");
  remove.type = "button";
  remove.setAttribute("aria-label", `Borrar ${item.title} de tus monedas`);
  remove.addEventListener("click", () => {
    if (!window.confirm(`¿Borrar «${item.title}» de tus monedas? No se puede deshacer.`)) return;
    removeFromHistory(item.type_id);
    renderCollection();
  });

  wrapper.append(open, remove);
  return wrapper;
}

function renderCollection() {
  const items = getHistory();
  const empty = items.length === 0;
  document.getElementById("collection-empty").hidden = !empty;
  document.getElementById("history-clear").hidden = empty;
  document.getElementById("collection-count").textContent = empty
    ? ""
    : items.length === 1
      ? "1 moneda"
      : `${items.length} monedas`;
  document.getElementById("history-grid").replaceChildren(...items.map(renderHistoryItem));
}

function initHistory() {
  document.getElementById("collection-start").addEventListener("click", () => showView("capture"));
  document.getElementById("history-clear").addEventListener("click", () => {
    if (window.confirm("¿Borrar todas tus monedas guardadas? No se puede deshacer.")) {
      clearHistory();
      renderCollection();
    }
  });
}

// ---------- Resultados ----------

let resultsBack = () => showView("capture");

function initResults(resetCapture) {
  const manual = document.getElementById("results-manual");
  const input = document.getElementById("results-manual-input");
  const status = document.getElementById("results-manual-status");
  const searchButton = document.getElementById("results-manual-search");

  resultsBack = () => {
    resetCapture();
    showView("capture");
  };
  document.getElementById("results-back").addEventListener("click", navBack);

  document.getElementById("results-none").addEventListener("click", () => {
    manual.hidden = false;
    input.focus();
  });

  async function runManualSearch() {
    const text = input.value.trim();
    if (!text) return;
    searchButton.disabled = true;
    status.textContent = "Buscando en Numista...";
    try {
      const { candidates, strategy, total } = await searchByText(text);
      if (candidates.length === 0) {
        status.textContent = `❌ No hay resultados para "${text}". Prueba con menos palabras, o con el valor en inglés (p. ej. «Peseta 1980»).`;
      } else {
        status.textContent = "";
        renderResults(rankCandidates(candidates, lastClues, lastIssuerCode), total, strategy, lastClues);
      }
    } catch (err) {
      showError(status, err.message, err.authError);
    } finally {
      searchButton.disabled = false;
    }
  }

  searchButton.addEventListener("click", runManualSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runManualSearch();
  });
}

// ---------- Modo explorador ----------
// Tema oscuro y lo que se identifica no se guarda en «Mis monedas».
// El tema ya lo pone un script en index.html antes de pintar; aquí se sincroniza el interruptor.
const EXPLORE_KEY = CONFIG.STORAGE_KEYS.exploreMode;
let exploreMode = false;

function setExploreMode(on) {
  exploreMode = on;
  if (on) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  // Color de la franja de la hora en Safari: el mismo que el fondo de la cabecera.
  document.querySelector('meta[name="theme-color"]').content = on ? "#17141f" : "#fbf6f1";
  document.getElementById("explore-toggle").checked = on;
  document.getElementById("identify-title").textContent = on ? "¿Qué moneda exploras?" : "¿Qué moneda tienes?";
  try {
    if (on) localStorage.setItem(EXPLORE_KEY, "1");
    else localStorage.removeItem(EXPLORE_KEY);
  } catch {
    // Sin memoria del navegador el modo dura hasta cerrar la app.
  }
}

function initExploreMode() {
  let saved = false;
  try {
    saved = localStorage.getItem(EXPLORE_KEY) === "1";
  } catch {}
  setExploreMode(saved);
  document.getElementById("explore-toggle").addEventListener("change", (event) => setExploreMode(event.target.checked));
}

// ---------- Identificar ----------

// Fotos preparadas de la moneda que se está identificando: una o dos caras.
let photos = [];
// Ya se ha intentado identificar la foto actual (para ofrecer «Añadir la otra cara»).
let identified = false;

function capturedPhotos() {
  return [...photos];
}

function canAddSide() {
  return photos.length === 1 && identified;
}

function initCapture() {
  const view = document.getElementById("view-capture");
  const cameraInput = document.getElementById("capture-camera-input");
  const galleryInput = document.getElementById("capture-gallery-input");
  const sideInput = document.getElementById("capture-side-input");
  const previewWrap = document.getElementById("capture-preview-wrap");
  const preview = document.getElementById("capture-preview");
  const retryButton = document.getElementById("capture-identify");
  const addSideButton = document.getElementById("capture-add-side");
  const cameraLabel = document.getElementById("capture-camera-label");
  const status = document.getElementById("capture-status");
  const rawJson = document.getElementById("capture-raw-json");

  // Cada foto nueva invalida lo que estuviera en marcha con la anterior.
  let identifyRun = 0;

  function setBusy(busy) {
    previewWrap.classList.toggle("busy", busy);
    status.classList.toggle("loading", busy);
    addSideButton.hidden = busy || !canAddSide();
  }

  function showPhotos() {
    preview.replaceChildren(...photos.map((photo, i) => img("preview-photo", photo, i ? "Otra cara" : "Tu foto")));
    previewWrap.hidden = photos.length === 0;
  }

  // addSide: la foto es la otra cara de la moneda que ya está en pantalla.
  async function handleFile(file, { addSide = false } = {}) {
    if (!file) {
      status.textContent = "No se ha recibido ninguna foto (¿se canceló la cámara?).";
      return;
    }
    const run = ++identifyRun;
    if (activeView() !== "capture") showView("capture");
    retryButton.hidden = true;
    rawJson.hidden = true;
    identified = false;
    setBusy(true);
    status.textContent = "Preparando la foto...";
    try {
      const image = await prepareImage(file);
      if (run !== identifyRun) return;
      photos = addSide && photos.length ? [photos[0], image] : [image];
      showPhotos();
      view.classList.add("has-photo");
      cameraLabel.textContent = "📷 Hacer foto de otra moneda";
      window.scrollTo(0, 0);
    } catch (err) {
      if (run !== identifyRun) return;
      setBusy(false);
      status.textContent = `❌ No se pudo preparar la imagen: ${err && err.message ? err.message : err}`;
      return;
    }
    // Se identifica nada más subir la foto: el usuario no tiene que pulsar nada más.
    await runIdentify(run);
  }

  for (const input of [cameraInput, galleryInput, sideInput]) {
    input.addEventListener("change", (event) => {
      handleFile(event.target.files[0], { addSide: input === sideInput });
      event.target.value = "";
    });
  }

  async function runIdentify(run) {
    if (!photos.length) return;
    rawJson.hidden = true;
    retryButton.hidden = true;
    identified = false;
    setBusy(true);

    const what = photos.length > 1 ? "las dos caras" : "la foto";
    let currentModel = "";
    let fallbackNote = "";
    let startedAt = Date.now();
    const renderProgress = () => {
      if (run !== identifyRun) return;
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      status.textContent = `${fallbackNote}Leyendo ${what}${currentModel ? ` con ${currentModel}` : ""}... ${seconds} s`;
    };
    const ticker = setInterval(renderProgress, 1000);

    const result = await identify(photos, (model, previousFailure, retry) => {
      currentModel = model;
      fallbackNote = retry
        ? `Gemini está saturado. Reintento ${retry} de 2. `
        : previousFailure
          ? `El modelo anterior no respondió (${previousFailure}). Pruebo con otro de respaldo. `
          : "";
      startedAt = Date.now();
      renderProgress();
    });

    clearInterval(ticker);
    if (run !== identifyRun) return;
    identified = true;

    if (!result.ok) {
      setBusy(false);
      retryButton.hidden = false;
      showError(status, result.reason, result.authError);
      rawJson.textContent = `Diagnóstico:\n${result.attempts.map((a) => `• ${a.model}: ${a.detail}`).join("\n")}`;
      rawJson.hidden = false;
      return;
    }

    await searchAndShow(result.data, run);
    if (run === identifyRun) setBusy(false);
  }

  retryButton.addEventListener("click", () => runIdentify(++identifyRun));
  // Al volver a esta pantalla, tocar la foto la busca de nuevo (salvo si ya se está buscando).
  const searchAgain = () => {
    if (!previewWrap.classList.contains("busy")) runIdentify(++identifyRun);
  };
  previewWrap.addEventListener("click", searchAgain);
  previewWrap.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      searchAgain();
    }
  });

  async function searchAndShow(clues, run) {
    status.classList.add("loading");
    try {
      const { candidates, strategy, total, issuerCode } = await findCandidates(clues, (step) => {
        if (run === identifyRun) status.textContent = `${SEARCH_STEP_LABELS[step] || "Buscando en Numista"}...`;
      });
      if (run !== identifyRun) return;
      status.classList.remove("loading");
      lastIssuerCode = issuerCode;
      if (candidates.length === 0) {
        const tip = photos.length === 1 ? " Prueba a añadir la otra cara," : " Prueba";
        status.textContent = `❌ No encontré esta moneda en Numista.${tip} con otra foto más de frente o búscala escribiendo.`;
        rawJson.textContent = `Pistas usadas:\n${JSON.stringify(clues, null, 2)}`;
        rawJson.hidden = false;
        lastClues = clues;
        resetManualSearch(clues);
        showManualFromCapture();
      } else {
        status.textContent = "";
        resetManualSearch(clues);
        renderResults(rankCandidates(candidates, clues, issuerCode), total, strategy, clues);
      }
    } catch (err) {
      if (run !== identifyRun) return;
      status.classList.remove("loading");
      showError(status, err.message, err.authError);
    }
  }

  // Sin resultados: botón para buscar escribiendo, que lleva a la pantalla de candidatos con la caja abierta.
  function showManualFromCapture() {
    const button = el("button", "inline-link", "Buscar escribiendo");
    button.type = "button";
    button.addEventListener("click", () => {
      document.getElementById("results-list").replaceChildren();
      document.getElementById("results-summary").textContent = "Escribe lo que se lee en la moneda.";
      document.getElementById("results-more").hidden = true;
      document.getElementById("results-add-side").hidden = true;
      document.getElementById("results-clues-json").textContent = JSON.stringify(lastClues, null, 2);
      document.getElementById("results-manual").hidden = false;
      pushNav();
      showView("results");
      document.getElementById("results-manual-input").focus();
    });
    status.append(" ", button);
  }

  function resetCapture() {
    identifyRun++;
    photos = [];
    identified = false;
    cameraInput.value = "";
    galleryInput.value = "";
    sideInput.value = "";
    setBusy(false);
    showPhotos();
    view.classList.remove("has-photo");
    cameraLabel.textContent = "📷 Hacer foto";
    retryButton.hidden = true;
    status.textContent = "";
    rawJson.hidden = true;
  }

  return resetCapture;
}

initTabbar();
initTypingMode();
initLogin();
initSettings();
initExploreMode();
const resetCapture = initCapture();
initResults(resetCapture);
initDetail();
initHistory();
// Las llaves de antes ya no hacen falta: se borran del móvil.
for (const key of CONFIG.STORAGE_KEYS.oldKeys) localStorage.removeItem(key);
currentUser()
  .then((user) => (user ? showSignedIn(user) : showView("login")))
  .catch(() => showView("login"));
