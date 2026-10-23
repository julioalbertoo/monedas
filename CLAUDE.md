# monedas

Gemela de `vinilos` (mismo estilo y misma forma de trabajar): foto de una moneda → Gemini la lee → búsqueda en Numista → ficha.

## Versionado (obligatorio en cada push)

- La versión vive solo en `index.html`: en la cabecera (`.app-version`) y como `?v=` en `styles.css`, `app.js` y el import map. Al publicar, sustituye la versión en **todas** sus apariciones de ese archivo.
- El `?v=` evita que Safari (caché de 10 min de GitHub Pages) siga usando JS/CSS antiguos. Todo módulo `.js` nuevo debe añadirse al import map.
- Sube la versión en **cada** push a `main`, para que el usuario compruebe en el móvil qué versión está probando.
- Desde `1.0.0` (MVP terminado), formato semver: `1.0.<n>` para arreglos y `1.<m>.0` para funciones nuevas.

## Supabase (usuario y contraseña)

- Proyecto `muscledex` (`lmfdpetsqmmymbuwbziw`), compartido con otra app: todo lo de Monedas lleva el prefijo `monedas`.
- Las llaves de Gemini y Numista están cifradas en Vault (`monedas_gemini_key`, `monedas_numista_key`) y las funciones las leen con la función SQL `monedas_llave` (solo `service_role`). Si existen los secretos `GEMINI_KEY` / `NUMISTA_KEY`, tienen prioridad. Nunca van al navegador.
- `monedas-gemini` y `monedas-numista` (código en `supabase/functions`, desplegadas con `verify_jwt: false` porque comprueban ellas la sesión) solo dejan pasar a usuarios de la tabla `monedas_usuarios`. Devuelven la respuesta de fuera dentro de `{ status, body }`.
- Si cambias una función, vuelve a desplegarla (y el `_shared/common.ts` con ella).

## Numista

- Plan gratuito: 2.000 consultas al mes. Cada búsqueda y cada ficha gasta una; las fichas y la lista de países se guardan en el móvil 30 días para ahorrar cupo. No añadas consultas sin necesidad.
- La búsqueda por imagen de Numista es de pago: la foto la lee Gemini y luego se busca por texto.
- La API se consulta a través de `monedas-numista`. Las fotos sí se cargan directamente, pero Numista no siempre deja enseñarlas dentro de otra web. `coinImg` en `app.js` prueba varias rutas por foto (directa sin Referer, wsrv.nl, i0.wp.com, wsrv otra vez y luego la miniatura): no las quites, con ellas cargan todas.
