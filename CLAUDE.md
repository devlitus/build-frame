# Raíces — guía para agentes

Juego web de granja y construcción (Phaser 3 + Preact + TypeScript). Lee primero:
[GDD](GDD.md) · [ROADMAP](ROADMAP.md) · [PROCESO](docs/PROCESO.md) · [ADRs](docs/adr/)

## Comandos
- `npm run dev` — servidor de desarrollo
- `npm run check` — lint, formato, tipos, tests y build (lo que exige la CI)
- `npm run e2e` — build + tanda funcional de Playwright (escritorio y móvil emulado), sin rendimiento
- `npm run e2e:rendimiento` — build + solo los `@rendimiento` (1 worker, solos); el objetivo se anota y solo falla el suelo
- `npm run e2e:completo` — funcional y después siempre rendimiento, con resumen y código combinado; obligatorio en local antes de la PR de un hito (resultado en la PR)
- `npm run e2e:humo` — solo la tanda `@humo`, la que corre la CI (PROCESO §5)
- `npm run e2e:rapido` — como `e2e` pero sin build (dist ya construido)
- `npm run e2e:medir` — mide tiempos por test (`scripts/e2e-tiempos.mjs`)
- `npm run e2e:capturas` — solo los `@capturas` (escriben PNG en `capturas/`)

## Estructura
- `src/core/` lógica pura y determinista por comandos (ADR 0004). Sin Phaser, DOM, `Math.random` ni `Date`.
- `src/game/` escenas Phaser · `src/ui/` interfaz Preact (textos en `src/ui/textos/`) · `src/save/` almacenamiento (ADR 0001)
- `data/` contenido y balance en JSON · `tests/prop` propiedades · `tests/e2e` Playwright

## Reglas
- Ramas y commits según PROCESO §2 (Conventional Commits, tipo en inglés, descripción en español).
- Nunca integrar en `main` sin aprobación del humano.
