# 0002 — Motor y stack técnico

**Estado:** aceptada
**Fecha:** 2026-11-11
**Relacionado:** [GDD §10](../../GDD.md#10-técnica-resumen)

## Contexto
Juego 2D web para escritorio y móvil, instalable como PWA, con mucha interfaz (paneles, tienda, diario) y una lógica que debe poder ejecutarse sin motor (tests, simulaciones y, en el futuro, servidor).

## Decisión
- **TypeScript estricto** (6.0; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Vite** para desarrollo y build, con rutas relativas (`base: './'`) para desplegar en cualquier subruta.
- **Phaser 3** (3.90) para el render 2D, la cámara, la entrada y el escalado. Se carga en un *chunk* aparte.
- **Preact** para la interfaz en DOM sobre el canvas (`#ui` encima de `#juego`).
- **Vitest + fast-check** para unitarios y propiedades; **Playwright** para extremo a extremo (escritorio y móvil emulado).
- **ESLint + Prettier**; la CI falla si el formato no es correcto.

## Alternativas consideradas
| Alternativa | Motivo del descarte |
|---|---|
| Phaser 4 | Más reciente, pero con menos ejemplos y plugins maduros; la migración se reevaluará tras el MVP |
| PixiJS | Solo render: habría que construir cámara, escenas y entrada a mano |
| Godot (export web) | Binarios pesados en móvil, peor integración con UI web y con un núcleo TS compartible con el servidor |
| UI dentro de Phaser | Texto, accesibilidad y formularios mucho más costosos que en DOM |
| React | Preact ofrece la misma API con una fracción del peso |

## Consecuencias
- **+** Interfaz accesible y rápida de iterar; render eficiente en móvil.
- **+** El núcleo TS puede ejecutarse en Node (tests, simulación, servidor futuro).
- **−** Dos mundos (Phaser y Preact) que deben comunicarse mediante el núcleo y eventos, nunca directamente entre ellos.
- **−** Phaser pesa ~320 kB gzip; aceptable, se vigila en cada hito (presupuesto de rendimiento).
