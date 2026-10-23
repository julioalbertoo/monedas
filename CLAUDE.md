# monedas

Gemela de `vinilos` (mismo estilo y misma forma de trabajar): foto de una moneda → Gemini la lee → búsqueda en Numista → ficha.

## Versionado (obligatorio en cada push)

- La versión vive solo en `index.html`: en la cabecera (`.app-version`) y como `?v=` en `styles.css`, `app.js` y el import map. Al publicar, sustituye la versión en **todas** sus apariciones de ese archivo.
- El `?v=` evita que Safari (caché de 10 min de GitHub Pages) siga usando JS/CSS antiguos. Todo módulo `.js` nuevo debe añadirse al import map.
- Sube la versión en **cada** push a `main`, para que el usuario compruebe en el móvil qué versión está probando.
- Desde `1.0.0` (MVP terminado), formato semver: `1.0.<n>` para arreglos y `1.<m>.0` para funciones nuevas.

## Numista

- Plan gratuito: 2.000 consultas al mes. Cada búsqueda y cada ficha gasta una; las fichas y la lista de países se guardan en el móvil 30 días para ahorrar cupo. No añadas consultas sin necesidad.
- La búsqueda por imagen de Numista es de pago: la foto la lee Gemini y luego se busca por texto.
- Numista sí deja que la web consulte su API directamente (CORS), pero no siempre deja enseñar sus fotos dentro de otra web. `coinImg` en `app.js` prueba varias rutas por foto (directa sin Referer, wsrv.nl, i0.wp.com, wsrv otra vez y luego la miniatura): no las quites, con ellas cargan todas.
