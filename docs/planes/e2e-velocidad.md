# Plan: suite e2e completa en ≤ 10 min (hito E2E-velocidad)

Aprobado por la PO el 2026-11-14. Rama del hito: `hito/E2E-velocidad`. Cada historia es una PR `test(e2e): …` contra esa rama; el Orquestador la integra con la CI en verde. La PR final a `main` la aprueba la PO.

## Diagnóstico
- 38 specs, 14.104 líneas; 21 `*-rompedor*` (~9.200 líneas). ~958 ejecuciones (escritorio + móvil Pixel 7).
- El tiempo está sobre todo en: arranque con WebGL por software, móvil duplicado, recorridos largos o con muchos contextos, 425 `expect.poll` con intervalos por defecto (hasta 1 s tarde) y la imposibilidad de subir workers sin hundir los fps.
- 353 `waitForTimeout` (~200 s por proyecto): poco tiempo (3–4 %) pero son la causa principal de los fallos inestables.
- `playwright.config.ts`: puerto fijo 4173 con `reuseExistingServer` (reutiliza builds viejos de otros worktrees); los proyectos `*-solo` dependen de los funcionales (si uno falla, el rendimiento no corre); la tanda `SOLO` se elige por regex de títulos.
- ~11 tests de fps corren hoy en paralelo con todo; 8 tests solo hacen capturas; ~25 tests crean sus propios contextos (uno crea 12).

## Presupuesto objetivo (máquina de 16 hilos, nada más corriendo)
| Bloque | Presupuesto |
|---|---|
| Build (una vez) | ≤ 45 s |
| Preview | ≤ 5 s |
| Funcional (escritorio ~330 + móvil ~130) en paralelo | ≤ 6 min 30 s |
| Rendimiento (~12 tests, workers 1, al final y solo) | ≤ 1 min 30 s |
| Margen | ≤ 1 min 40 s |

Por test: mediana ≤ 5 s, p95 ≤ 15 s, máximo 30 s; como mucho 8 `@lento` de ≤ 60 s.

## Palancas
- **P1 Servidor y build:** puerto por worktree (`4200 + hash(cwd) % 700`, `PUERTO_E2E` manda), `reuseExistingServer: false`, `--strictPort`, el webServer solo hace `preview`; `globalSetup` que falla si `dist/` falta o es más viejo que `src/`, `data/` o `index.html`. Scripts: `e2e` (build + `scripts/e2e.mjs`), `e2e:rapido` (sin build), `e2e:humo` (build + `@humo`; la CI no cambia).
- **P2 Tandas por etiquetas:** `@rendimiento`, `@medida` (no corre por defecto), `@capturas` (fuera de `npm run e2e`), `@movil`, `@lento`. Proyectos `escritorio`, `movil` (`@movil|@humo`), `rendimiento-escritorio`, `rendimiento-movil` (workers 1, sin dependencias). `scripts/e2e.mjs` lanza la funcional y después, siempre, la de rendimiento, y resume ambas. ≤ 12 `@rendimiento` por proyecto.
- **P3 GPU (spike, ≤ 1 día):** `--enable-gpu --use-angle=d3d11 --ignore-gpu-blocklist` solo en local, desactivable con `E2E_GPU=0`. Se queda si el renderer no es SwiftShader, el arranque baja ≥ 30 % y `@humo` + 3 specs pasan con `--repeat-each=3 --workers=8`.
- **P4 Móvil donde aporta:** `@movil` si usa toque, comprueba disposición dependiente del viewport, ramifica por `isMobile`, o es `@humo`. Nunca en tests con contextos propios. `scripts/e2e-auditar.mjs` lo vigila en `check`.
- **P5 Helpers y esperas de condición:** `tests/e2e/apoyo/` con fixture común: `abrirValle` (con recogida de errores de consola), `esperarListo`, `esperarFotogramas`, `camaraQuieta`, `centrar`, `emitir`, `irA` en un único `evaluate`, `sondear` (intervalos 30/60/100/200), `sinCambios` (esperas negativas por fotogramas), `mantener` (pulsaciones con duración de diseño). Ganchos nuevos con `?debug`: `__raices.fotograma()`, `__raices.listo()`, `?aviso=<ms>` o `cerrarAviso()`. Lint `no-restricted-properties` sobre `page.waitForTimeout` fuera de `apoyo/` (cada uso: `// espera-real: <motivo>`). Objetivo ≤ 70 esperas fijas.
- **P6 Estado preparado:** URL (`propias`, `dinero`, `hora`, …) + `emitir` en los recorridos largos que no prueban el recorrido; un recorrido completo por la interfaz y por hito queda como `@lento`. Reutilizar contexto con `setViewportSize` cuando el DPR coincide.
- **P7 Consolidar el rompedor M1–M5** (PROCESO §4): clases A único (se queda), B duplica (se fusiona con todas sus aserciones), C lógica pura (a `tests/prop`/`tests/unit` + un caso e2e de HUD), D rendimiento/medida, E captura. Los `[S1]`/`[S2]`/`[S3]` nunca se borran. Tabla de equivalencias en cada PR.
- **P8 Workers:** barrido 4/6/8/10 con `--repeat-each=2`; el máximo con 0 inestables y fps ≥ 30. `retries: 0` en local.

## Historias (en orden)
| # | ID | Quién | Depende de |
|---|---|---|---|
| 1 | E2E-12a Regla de proceso (PROCESO §4 y §5) | Orquestador | — (hecha) |
| 2 | E2E-00 Medición: `scripts/e2e-tiempos.mjs`, `npm run e2e:medir`, sonda `@medida` de arranque/renderer/fps con 1/4/8/12 workers; línea base en la PR | Implementador | — |
| 3 | E2E-01 Servidor y build (P1) | Implementador | — |
| 4 | E2E-02 Tandas por etiquetas (P2); etiquetas de `inventario*`, `energia*`, `m1-global`, `hud-rompedor` aplazadas hasta que entre `fix/hud-barra-unica` | Implementador + Rompedor | E2E-01 |
| 5 | E2E-03 Spike de GPU (P3) | Implementador | E2E-00 |
| 6 | E2E-04 Apoyo común y ganchos (P5, sin migrar specs) | Implementador | — |
| 7 | E2E-05 Migración lote A: `camara*`, `modos*`, `personaje*`, `tactil*`, `valle*`, `portada`, `tiempo-hud`, `rendimiento*`, `seleccion*`, `compra*` | Rompedor | E2E-04 |
| 8 | E2E-06 Migración lote B: `construir*`, `mover-demoler*`, `pincel*`, `cosechar`, `m2`, `m3`, `m4`, `m5-00*` (una PR por fichero global) | Rompedor (Opus en construir/compra) | E2E-04 |
| 9 | E2E-07 Migración lote C: `inventario*`, `energia*`, `m1-global`, `hud-rompedor` | Rompedor | `fix/hud-barra-unica` en `main` |
| 10 | E2E-08 Móvil selectivo (P4) + auditor | Rompedor + Implementador | E2E-05..07 |
| 11 | E2E-09 Consolidación del rompedor M1–M5 (P7) | Rompedor (Opus en críticos) + Revisor | E2E-05..07 |
| 12 | E2E-10 Workers y estabilidad (P8) | Implementador | todo |
| 13 | E2E-11 Aceptación | Rompedor | todo |

Cada historia de migración trae su medida antes/después (`e2e:medir` sobre los ficheros tocados) y pasa `--repeat-each=3 --workers=8`.

## Aceptación (E2E-11)
1. `npm run e2e` desde cero (sin servidor previo ni `dist/`) ≤ 10:00 de reloj, sin otro e2e en marcha.
2. 3 ejecuciones seguidas con `retries: 0`: 0 fallos y 0 inestables.
3. Presupuesto por test cumplido.
4. Cobertura: tablas de equivalencias, auditor en verde y 6 mutantes que la suite sigue detectando (el desmayo no lleva a casa; no se cobra la parcela; el toque cae una casilla desplazado; el pincel no borra; umbral de joystick a 12 px; la cámara se sale del valle).

## Riesgos
- `fix/hud-barra-unica` tocará specs de inventario, energía y m1: el lote C espera a que entre.
- Varias tandas a la vez en la máquina invalidan cualquier medida.
- Con GPU, los tests «solo con GPU» empiezan a comprobar y pueden destapar fallos reales.
- Cambiar «tras N ms está en X» por «llega a X» puede ocultar regresiones de velocidad: las que miden velocidad se quedan en `@rendimiento` con su umbral intacto.

## Idioma
Regla de la PO: todo el repositorio en inglés salvo el README. El código nuevo de este hito (scripts, `tests/e2e/apoyo/`, ganchos) se escribe en inglés; los specs existentes y la documentación se migran en la historia de migración a inglés.
