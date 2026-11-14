# Plan: recortar la suite e2e (hito E2E-velocidad)

**Aprobado por la PO el 2026-11-14** (sustituye al plan de «optimizar»). Rama del hito: `hito/E2E-velocidad`. Cada historia es una PR contra esa rama; el Orquestador la integra con la CI en verde. La PR final a `main` la aprueba la PO. El refactor del HUD (`fix/hud-barra-unica`) va **dentro** del hito, validado por la regla de interfaz.

## Por qué
Los e2e no detectaron que el HUD entorpece jugar y cuestan demasiado (línea base #74: 464 tests por proyecto, ~958 ejecuciones, 28 min con 8 workers, 51 fallos inestables). La mayoría de fallos reales salieron de core/prop. Se recorta: e2e solo para lo que necesita navegador, una regla medible de interfaz, la lógica al núcleo y el juicio de experiencia a la PO (capturas y móvil real).

## Decisiones previas
- **PR #77 (etiquetas, `scripts/e2e.mjs`):** se aprovecha con dos ajustes: `npm run e2e` = build + solo funcional; `npm run e2e:rendimiento` y `npm run e2e:completo` (las dos tandas, obligatoria antes de la PR del hito). En rendimiento: objetivo con `expect.soft` (se anota) y suelo con `expect` (p. ej. 60 % del objetivo, falla). El `TODO(E2E-07)` de `m1-global` sobra (se borra).
- **GPU (E2E-03): descartada.** Se cierra y se descarta el cambio de `playwright.config.ts`.
- **Helpers de #76: obligatorios.** Se amplían con `apoyo/interfaz.ts` (regla), `apoyo/toque.ts` (`tap`, `drag`, `pinch`, `twoFingers`, uniendo las copias de `camara`, `tactil`, `modos`, `m3`, `m5-00`) y `openValley({ at: {x, y} })`. `waitForTimeout` pasa a `error` en lint al borrar los specs viejos. `support-smoke.spec.ts` se borra.
- Tests nuevos en inglés (regla de la PO). Los `[S]` conservan su etiqueta y el título original en un comentario.

## Inventario (tests por proyecto) y decisión
| Spec | Tests | Decisión | Destino de lo único |
|---|---|---|---|
| humo | 12 | Reducir a S1–S4 | resto a F1–F8 con `@humo` |
| portada | 3 | Borrar | S1 |
| valle | 2 | Borrar | S1, B5 |
| valle-rompedor | 14 | Borrar | unit `parametros`; B5; B4; R2–R4 |
| sonda | 1 | Mantener `@medida` | fuera de la tanda |
| support-smoke | 1 | Borrar | helpers en toda la suite |
| camara | 8 | Borrar | T8, T4/T6, unit `camara` |
| camara-rompedor | 13 | Core + T4/T8 | `prop/camara-rompedor`; T8; T4; B4 |
| personaje | 4 | Borrar | S2, B6, P4, unit `parametros` |
| personaje-render-rompedor | 6 | Borrar | G2, B1, B6, unit `entrada`, P4 |
| rendimiento | 5 | A P1/P5 | B1, unit `parametros` |
| rendimiento-rompedor | 4 | Borrar | B3, B2, unit `parametros` |
| tiempo-hud | 14 | Borrar | S1, F7, F11, B6, R1–R4, unit `textos-reloj` |
| hud-rompedor | 5 | Borrar | R*, B1, G2 |
| modos | 13 | Borrar | S3, F11, T10, G2, R*, `prop/modos-rompedor` |
| modos-rompedor | 18 | Borrar | G2, B6, T10, A1, T9, T8/T5, B1, B4, unit, R* |
| tactil | 12 | Reducir | S2(m), T2, T5, F12 |
| tactil-rompedor | 22 | Reducir | T2, T3, T5, T9, F12, `prop/tactil-rompedor`, unit `camino` |
| seleccion-parcela | 11 | Reducir a F13 | R*, B5 |
| seleccion-rompedor | 9 | Borrar | R*, unit `cursor-parcela`, F1, F13, R5, T5, B1 |
| compra-parcela | 11 | Reducir a F1 | core economía/parcelas, unit `compra-parcela`, B1 |
| compra-rompedor | 29 | Borrar | G1, G2, unit `compra-rompedor` + aserción en F1, R*, R5, B1 |
| construir | 8 | Reducir a F3 | F9, F10, R3/R4 |
| construir-rompedor | 16 | Borrar | `[S3]`→G1, G2, F3; `[S2]/[S3]`→R3/R4 literal; unit `construir`; core `obras`; P2; B1; B2; capturas |
| mover-demoler | 14 | Reducir a F4 | `prop/mover-demoler`, F9, F10 |
| mover-demoler-rompedor | 17 | Borrar | `[S3]`×3→G1; `[S3]`×2→F4; `[S3]`→R1–R4; B1 + unit `capa-objetos`; B2; capturas |
| pincel-zonas | 12 | Reducir a F2 | F9, unit |
| pincel-rompedor | 14 | Borrar | F2, T5, core `zonas`, unit `pincel-zonas`, G2, R*, B1, P2, B2, capturas |
| cosechar | 1 | Mantener (F5) | migrar a helpers |
| energia | 6 | Reducir a F7 | — |
| energia-rompedor | 14 | Borrar | G2, core `energia`, F7, R*, A1 |
| inventario | 12 | Reducir a F8/F6 | core `herramientas`, unit `casilla-enfrente` |
| inventario-rompedor | 13 | Borrar | G2/B6, core, unit `casilla-enfrente` + T7, T2, R*, R5 |
| inventario-rompedor-r2 | 30 | Borrar | R* + prop `vida-camara-hud`, G2, A1, R2, unit `arte-m5-00` |
| m1-global-rompedor | 15 | Borrar | prop `camara`, S1/B5, B3, B1, T7 + unit `resolucion`, P1 |
| m2-global-rompedor | 11 | Borrar | F7/F11, T9, R5, G2/B1, A1, P3 |
| m3-global-rompedor | 9 | Borrar | F1 + `prop/m3-global`, F10, T9, F9, R5, P2 |
| m4-global-rompedor | 13 | Borrar | F3/F4 + `prop/m4-global`, unit «despiertas en casa», core, F10, R2, F9, B1, B2, P2, capturas |
| m5-00-rompedor | 38 | Borrar | `[S2]`×2+`[S3]`→G5; unit `resolucion` + `prop/tactil-posiciones`; T7; B3; B1/B2 + unit `capa-objetos`; F3 + unit `arte` |
| m5-00-final-rompedor | 5 | Borrar | T7 + unit, `[S3]`→S1, `[S3]` grises→unit, capturas |

Los 21 `[S]` se conservan (≈15 en e2e, 2 en unit). Cada PR de recorte trae su tabla de equivalencias.

## Suite final: 43 tests, ~62 ejecuciones funcionales
(d) escritorio, (m) móvil, (dm) ambos.
- **smoke.spec.ts `@humo`:** S1 `boot` (dm), S2 `move` (dm), S3 `mode-switch` (dm), S4 `accelerated-day` (dm).
- **flows-\*.spec.ts:** F1 `buy-parcel`, F2 `paint-zones`, F3 `build`, F4 `move-demolish`, F5 `crop-cycle`, F6 `chop-mine` (nuevo), F7 `energy-sleep`, F8 `inventory`, F10 `panels-exclusive`, F11 `time-controls`, F12 `walk-routes`, F13 `select-parcel` (dm); F9 `plano-keyboard-only` (d). F1–F5 y F8 llevan `@humo`.
- **touch.spec.ts / pointer.spec.ts:** T2 `joystick`, T3 `tap-thresholds`, T4 `pinch`, T5 `multitouch-cancel`, T6 `plano-one-finger-pan`, T9 `buttons-vs-canvas` (m); T7 `touch-lands-on-tile` (dm); T8 `mouse-camera`, T10 `plano-keyboard-camera` (d).
- **interface-rule.spec.ts:** R1 1280×720, R2 412×915, R3 915×412, R4 640×320, R5 `rotate-with-panels`. El viewport 320×568 se añade solo a la comprobación de «controles alcanzables».
- **regressions.spec.ts:** G1 `double-press` (dm), G2 `key-repeat-modifiers` (d), G5 `depth-canopy` (d).
- **robustness.spec.ts:** B1 `no-leaks`, B2 `webgl-context-loss`, B3 `seams`, B5 `url-params`, B6 `focus` (d); B4 `resize-rotate`, B7 `start-screen` (dm).
- **a11y.spec.ts:** A1 (d).
- **performance.spec.ts `@rendimiento` (1 worker, tanda aparte):** P1 fps Plano arrastre/zoom (dm), P2 fps granja llena (d), P3 fps noche con HUD (m), P4 reloj en tiempo real (d), P5 horneado y capa acotada (d, aserción dura).

El detalle de qué verifica cada test está en el informe del plan (PR de E2E-13). Estimación: `npm run e2e` ≈ 4 min 30 s con ~6 workers; `e2e:rendimiento` ≈ 1 min 30 s.

## Regla de interfaz
Umbrales **provisionales**; la PO los fija con la tabla medida en E2E-14:
- **Cobertura** (unión de cajas opacas del HUD / lienzo): sin paneles ≤ 15 %; con un panel abierto ≤ 35 %.
- **Foco en Vida:** cuadrado de radio 3 casillas (7×7) alrededor del personaje sin nada encima, y la casilla del personaje entera en el lienzo; en la aparición y en las 4 esquinas del valle.
- **Foco en Plano:** silueta y edificio elegido 100 % visibles; parcela elegida ≥ 50 %; cursor del pincel sin tapar.
- **Controles alcanzables:** ≥ 44×44, dentro del viewport, sin solaparse (> 1 px) y sin texto recortado.
- **Medición** (`apoyo/interfaz.ts`, un `evaluate`): lienzo ∩ viewport; cajas visibles de `.hud` (sin `.solo-lector` ni joystick) que sean opacas (fondo α ≥ 0,2, imagen, borde, BUTTON/IMG/SVG/INPUT o texto propio); unión exacta por compresión de coordenadas. Ganchos nuevos: `__raices.rectCasilla(cx, cy)` (rect CSS sin tener en cuenta el HUD), `?en=x,y`, `?contador=0`. Contexto móvil real (`hasTouch`, `pointer: coarse`). `expect.soft` con el % en el mensaje.
- **Estimación en `main`:** 640×320 Vida ≈ 33 % (falla); 412×915 y 915×412 ≈ 16–19 % (falla); 1280×720 ≈ 8 % (pasa); con paneles 42–60 % (falla). Lo que falle en `main` entra como `test.fail()` con su %; el refactor del HUD debe ponerlo en verde.

## Núcleo (core/prop/unit) nuevo o ampliado
Nuevos: `unit/aviso-desmayo` (`[S3]` despiertas en casa), `unit/paleta-zonas` (`[S3]` grises), `unit/entrada`, `prop/vida-camara-hud`, `prop/simulacion-m5` (partidas de N días: cultivo, talar, picar, energía, dormir, comprar, construir; dinero ≥ 0, energía en rango, inventario ≤ capacidad, determinismo). Ampliar: `prop/camara-rompedor`, `prop/tactil-posiciones-rompedor` (DPR 1/1,25/2/2,625/3), `prop/tactil-rompedor` (umbrales, 3 dedos, `touchcancel`), `unit/resolucion`, `unit/compra-rompedor` (carreras), `unit/construir`, `unit/pincel-zonas`, `unit/camino`, unit de parámetros. Verificar antes si ya existe.

## Historias (en orden)
| # | ID | Qué | Quién | Depende de |
|---|---|---|---|---|
| 1 | E2E-13 | Este plan, PROCESO §4–§5 y `rompedor.md` | Orquestador | — |
| 2 | E2E-02b | Integrar #77 con sus dos ajustes; cerrar E2E-03 | Implementador, Revisor | — |
| 3 | E2E-19 | `performance.spec.ts` (P1–P5) y quitar los demás `@rendimiento`/`@medida` (con tabla; la sonda se queda) | Implementador | 2 |
| 4 | E2E-14 | Regla de interfaz: ganchos, `apoyo/interfaz.ts`, R1–R5; la PR trae la tabla de % medida en `main` | Implementador; Rompedor ataca la medición con mutantes; Revisor | 2 |
| 5 | E2E-15 | `npm run capturas` por escenas (4 viewports; Vida, inventario, aviso, Plano con cada panel; capa opcional con % y foco) | Implementador | 4 |
| 6 | E2E-16 | Núcleo nuevo/ampliado (tabla de equivalencias previa al borrado) | Rompedor (Opus en economía, construcción y parcelas), Revisor | — (paralelo a 4) |
| 7 | HUD-01 | Refactor `fix/hud-barra-unica` (commit WIP `97a68e0`) rebasado sobre el hito; debe quitar los `test.fail` de la regla, o la PO acepta lo que quede como `deuda` | Implementador, Revisor | 4 |
| 8 | E2E-17a | Smoke + flujos de Vida (S*, F5–F8, F11, F12); borra `humo`, `portada`, `valle`, `personaje`, `tiempo-hud`, `hud-rompedor`, `energia*`, `inventario*`, `cosechar`, `m2` | Rompedor, Revisor | 6, 7 |
| 9 | E2E-17b | Flujos del Plano (F1–F4, F9, F10, F13); borra `compra*`, `seleccion*`, `construir*`, `mover-demoler*`, `pincel*`, `m3`, `m4` | Rompedor (Opus), Revisor | 6, 7 |
| 10 | E2E-17c | Táctil, regresiones, robustez, A1; borra `camara*`, `tactil*`, `modos*`, `valle-rompedor`, `m1`, `m5-00*`, `personaje-render`, `rendimiento-rompedor`, `support-smoke` | Rompedor (Opus en G1), Revisor | 6, 7 |
| 11 | E2E-20 | `scripts/e2e-presupuesto.mjs` en `check` (≤ 60 funcionales, ≤ 6 rendimiento); `waitForTimeout` como error; barrido de 4/6/8 workers con `--repeat-each=3`; `retries: 0` | Implementador | 8–10 |
| 12 | E2E-21 | Aceptación, mutantes, capturas a la PO y demo en móvil real | Rompedor (Opus), PO | todas |

## Riesgos
- Pérdida de cobertura al borrar: primero el núcleo, tabla de equivalencias, Revisor y mutantes.
- Umbrales mal calibrados: los fija la PO con la tabla de E2E-14.
- Lo que se dibuja en el lienzo (Phaser) no entra en la medición del DOM; se acepta.
- Selectores: los specs nuevos usan roles y `aria`, no clases, para sobrevivir al refactor.
- CI: `@humo` pasa de 12 a ~9 tests; vigilar su tiempo.

## Aceptación del hito
1. `npm run e2e` desde cero ≤ 5:00 (máximo 10) en la máquina de 16 hilos, sin otra tanda; 3 ejecuciones seguidas con `retries: 0` sin fallos ni inestables.
2. 40–60 tests funcionales; ≤ 6 de rendimiento y `e2e:rendimiento` ≤ 2 min; ningún spec de solo capturas; `e2e-presupuesto` en verde en `check`.
3. Regla de interfaz en los 4 viewports y todos los estados; la PR de E2E-14 demuestra que fallaba en `main`; tras HUD-01 pasa, o lo que quede es `test.fail` con issue `deuda` aceptado por la PO.
4. Tabla de equivalencias por cada spec borrado, con los 21 `[S]` localizados; `npm run check` y `@humo` de la CI en verde.
5. Ocho mutantes detectados: en core, el desmayo no lleva a casa, no se cobra la parcela, el pincel no borra, la cosecha no suma; en e2e, el toque cae una casilla desplazado, umbral del joystick a 12 px, la cámara se sale del valle, la barra o el inventario tapan más.
6. La PO recibe las capturas por escenas, ve la demo en móvil real y aprueba.
