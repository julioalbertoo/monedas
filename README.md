# 🪙 Monedas

Una web para el móvil que identifica una moneda con una foto y te enseña su ficha en [Numista](https://es.numista.com), el gran catálogo de monedas.
Le haces una foto a una cara, una IA lee lo que ve (país, valor, año, leyendas…) y la web busca en Numista las monedas que mejor encajan. Tú eliges la tuya y queda guardada en «Mis monedas».

Es la hermana de [Vinilos](https://github.com/julioalbertoo/vinilos): mismo diseño y misma forma de funcionar.

Web publicada: **https://julioalbertoo.github.io/monedas/**

---

## Cómo se usa

En la pestaña **📷 Identificar**:

| Paso | Qué pasa |
|---|---|
| **📷 Hacer foto** o **🖼️ Elegir de la galería** | Foto de una cara, de frente y con buena luz. Se identifica sola nada más subirla. |
| **➕ Añadir la otra cara** | Si no sale la tuya (por ejemplo, el año está en la otra cara), añade una foto de la otra cara y se vuelve a buscar con las dos. |
| **Ninguna es la mía** (en los resultados) | Escribe lo que se lee en la moneda: país, valor y año. |

En cada candidato verás el anverso y el reverso, y qué pistas coinciden (✓ año, ✓ país, ✓ valor…). Si ya la tienes en **🪙 Mis monedas**, sale marcada con **Ya la tienes**. Pulsa **✓ Es esta**: se abre su ficha (valor, metal, peso, diámetro, cecas, leyendas de cada cara…) con un enlace a Numista, y se guarda en **🪙 Mis monedas**.

**🧭 Modo explorador**: identifica monedas sin guardarlas en tu colección (con el tema oscuro).

**Truco:** la cara con el valor suele ser común a muchos países (por ejemplo, en los euros). La otra cara trae el país y muchas veces el año.

---

## Antes de empezar: usuario y contraseña

Para usar la web solo hace falta **entrar con tu email y contraseña**. Las llaves de Google Gemini (que "lee" la foto) y de Numista (el catálogo) están guardadas en el servidor (Supabase) y nunca llegan al móvil.

Es como un portero: tú le enseñas tu carné (usuario y contraseña) y él, que tiene las llaves, te trae lo que pides.

> Numista da **2.000 consultas al mes** en el plan gratuito, para todos los usuarios juntos. Cada identificación gasta entre 1 y 3; cada ficha nueva, 1. Las fichas ya vistas y la lista de países se guardan en el móvil 30 días y no gastan cupo.

### Para quien gestiona la app (Supabase, proyecto Muscledex)

- **Llaves:** son los secretos `GEMINI_KEY` y `NUMISTA_KEY` de las Edge Functions (Supabase → Edge Functions → Secrets).
- **Funciones:** `monedas-gemini` y `monedas-numista` (código en `supabase/functions`). Comprueban la sesión y que el usuario esté en la tabla `monedas_usuarios` antes de usar las llaves.
- **Dar acceso a alguien:**
  1. Crea el usuario en Supabase → Authentication → Users → **Add user** (email y contraseña, con «Auto Confirm User»).
  2. Añádelo a la lista de Monedas en el SQL Editor:
     `insert into monedas_usuarios (user_id) select id from auth.users where email = 'su@email.com';`
- **Quitar el acceso:** `delete from monedas_usuarios where user_id = (select id from auth.users where email = 'su@email.com');`

---

## Usarla en el móvil

1. Abre la web en **Safari** (iPhone) o **Chrome** (Android).
2. Recomendado: **añádela a la pantalla de inicio** (Compartir → Añadir a pantalla de inicio).
3. Ábrela desde el nuevo icono y entra una vez con tu usuario: la app de la pantalla de inicio guarda sus datos aparte de Safari.

Debajo del título verás la versión (por ejemplo `v1.0.0`). Sirve para comprobar que tienes la última.

---

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| "Tu sesión ha caducado" | Pulsa **Volver a entrar** y escribe tu email y contraseña. |
| "Esta cuenta no tiene permiso para usar Monedas" | Falta añadir a ese usuario a la tabla `monedas_usuarios` (ver arriba). |
| "La llave … guardada en el servidor no es válida" / "Falta configurar la llave en el servidor" | Revisa los secretos `GEMINI_KEY` y `NUMISTA_KEY` en Supabase. |
| "Se ha agotado el cupo gratuito de Gemini" | Espera un rato: el cupo se renueva. |
| "Numista dice que hay demasiadas consultas" | Espera un minuto. Si sigue, se ha gastado el cupo del mes; se renueva el día 1. |
| "No se pudo contactar con Numista" | Comprueba la conexión a internet y vuelve a probar. |
| Una foto dice "No carga: toca para verla" | La foto está en Numista pero no se pudo enseñar dentro de la web. Tócala para verla en Numista. |
| "No encontré esta moneda en Numista" | Añade la otra cara, haz la foto más de frente o busca escribiendo. |
| No ves cambios recientes | Comprueba la versión bajo el título y recarga la página. |

---

## Publicar tu propia copia (GitHub Pages)

1. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
2. Elige la rama `main` y la carpeta `/ (root)`. Pulsa **Save**.
3. En un minuto tendrás la web en `https://TU-USUARIO.github.io/monedas/`.

No hace falta servidor ni instalar nada: son archivos HTML, CSS y JavaScript.

---

## Cómo está hecha

Web estática (HTML + CSS + JavaScript sin frameworks). El inicio de sesión es de Supabase, y Google Gemini y Numista se consultan a través de dos funciones de Supabase que guardan las llaves. Buena parte del código viene de Vinilos.

| Archivo | Qué hace |
|---|---|
| `index.html` | Todas las pantallas. También guarda el número de versión. |
| `styles.css` | Estilos, pensados primero para el móvil (los de Vinilos, con una moneda en vez de un disco). |
| `app.js` | El "director de orquesta": navegación y flujo foto → IA → Numista → «Mis monedas». También enseña las fotos de Numista: como Numista no siempre deja que otras webs las enseñen, si la foto no carga directa se pide a través de [wsrv.nl](https://wsrv.nl) o de [i0.wp.com](https://developer.wordpress.com/docs/photon/) (el servicio de imágenes de WordPress), que solo reciben el enlace público de la foto. |
| `config.js` | Único sitio con direcciones, modelos de IA y nombres de lo que se guarda. |
| `ai.js` | La IA: `identify(fotos)` devuelve las pistas de la moneda (país, valor, año…) a partir de una o dos fotos. Si un modelo de Gemini falla, prueba otros. |
| `numista.js` | Búsquedas en Numista (país + valor + año → país + valor → texto libre), lista de países y ficha de cada moneda. Guarda en el móvil lo que no cambia, para ahorrar cupo. |
| `scoring.js` | Puntúa cada candidato según las pistas que coinciden. |
| `imaging.js` | Reduce la foto (lado largo ~1024 px) antes de enviarla a la IA. |
| `auth.js` | Inicio y cierre de sesión (Supabase) y llamadas a las funciones `monedas-gemini` y `monedas-numista`. |
| `supabase/functions/` | Las dos funciones del servidor: comprueban el usuario y llaman a Gemini y Numista con las llaves guardadas allí. |
| `history.js` | «Mis monedas» (en el navegador). |

**Versiones:** cada publicación sube el número de versión en `index.html`, que también se añade a las direcciones de los archivos (`app.js?v=1.0.0`). Así el móvil descarga siempre la versión nueva.

### Próximamente

- Copia en la nube de «Mis monedas» (como en Vinilos).
