# Informe del Rompedor · M1-02 Dibujar el valle

## Fallos

| # | Sev. | Fallo | Prueba |
|---|------|-------|--------|
| 1 | S3 | `?semilla=4294967296` (2^32) se reduce con `>>> 0` a la semilla 0: URLs distintas abren el mismo valle sin aviso (`src/game/parametros.ts`). | `tests/unit/valle-rompedor-m102.test.ts` «[S3] semilla >= 2^32…» (falla) |
| 2 | S3 | Los árboles triangulares (variante >= 0.5) sobresalen hasta 3 px por arriba de su casilla (vértice en `cy - r - 4`, r hasta 15 con casilla de 16 px de medio lado). En la fila superior del valle quedan fuera del mundo; sobre el río, pisan su borde. Afecta a ~1500 árboles en 6 semillas. | `tests/unit/valle-rompedor-m102.test.ts` «[S3] ninguna forma de la decoración se sale de su casilla» (falla) |
| 3 | S3 | Visual (`semilla-42--movil-vertical`, `semilla-42-debug-propias-0-1-6--movil-vertical`): al encuadrar el valle entero en móvil vertical el zoom es ~0.3, el borde de propia (5 px) queda en ~1.5 px y árboles y rocas son puntos de 2-3 px; la distinción propia/en venta se apoya sobre todo en el tinte. En escritorio se ve bien. Aceptable como vista provisional hasta M1-03 (zoom). | captura |
| 4 | S3 | Entorno, no del código: `scripts/capturas.mjs` lanza su servidor con `stdio: 'ignore'` y `--strictPort`; si el puerto 4175 ya lo ocupa un servidor viejo (de otro worktree), el fallo pasa desapercibido y se capturan páginas de otra versión (vi capturas de `v0.0.0+c495fc7` con la portada tintada en lugar del valle). Además `npm run capturas -- /` en Git Bash convierte `/` en una ruta de Windows (`MSYS_NO_PATHCONV=1`). | manual |

## Visual (capturas con build de esta rama, `v0.0.0+e4a783d`)
- Portada: botón «Nueva partida» de 140+ px de alto lógico en móvil, texto legible; sin solapes. Test e2e de >= 44 px pasa en ambos proyectos.
- Valle (escritorio, 42 y 7): casillas, 6x6 parcelas con borde, terrenos distinguibles, río continuo (semillas 42 y 7, tanto vertical como horizontal con giros), sin decoración sobre el río. Con `propias=0,1,6` se ven 3 parcelas amarillas con borde amarillo (solo 0, 1 y 6 son propias; correcto). El móvil horizontal y vertical encuadran centrado sin cortes.
- No se pudo capturar `semilla-7` en móvil (timeout de navegación del script en esa pasada); sí el de escritorio.

## Atacado y resiste
- URL: `semilla` = abc, vacía, negativa, decimal, `1e3`, enorme no segura (se ignoran y abre portada), repetida (gana la primera), 0 y 4294967295 (abren valle); `propias` con basura, fuera de rango, duplicados y sin `debug`: sin errores, `marcarPropias` no muta el original. Propiedad con `fast-check`: `leerParametros` nunca lanza y devuelve uint32.
- Doble clic (escritorio) y doble `click` (móvil) en «Nueva partida»: una escena `valle` activa, sin errores de página ni de consola.
- Dos cargas con «Nueva partida» dan semillas distintas (crypto en la capa de juego).
- Girar/redimensionar en el valle (412x915, 915x412, 100x100, 1x1, 1280x720): sin errores.
- 300 semillas aleatorias: casillas de río dentro del mapa y solo en parcelas de agua `rio`; decoración nunca sobre el río ni fuera del mapa; variante en [0,1).
- `src/core` sin `crypto`, `window`, `document`, `Date`, `Math.random` (test estático).
- Errores de consola/página: ninguno en escritorio ni móvil (28 tests e2e nuevos pasan).
