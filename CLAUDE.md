# Raíces — guía para agentes

Juego web de granja y construcción (Phaser 3 + Preact + TypeScript). Lee primero:
[GDD](GDD.md) · [ROADMAP](ROADMAP.md) · [PROCESO](docs/PROCESO.md) · [ADRs](docs/adr/)

## Comandos
- `npm run dev` — servidor de desarrollo
- `npm run check` — lint, formato, tipos, tests y build (lo que exige la CI)
- `npm run e2e` — Playwright en escritorio y móvil emulado

## Estructura
- `src/core/` lógica pura y determinista por comandos (ADR 0004). Sin Phaser, DOM, `Math.random` ni `Date`.
- `src/game/` escenas Phaser · `src/ui/` interfaz Preact (textos en `src/ui/textos/`) · `src/save/` almacenamiento (ADR 0001)
- `data/` contenido y balance en JSON · `tests/prop` propiedades · `tests/e2e` Playwright

## Reglas
- Ramas y commits según PROCESO §2 (Conventional Commits, tipo en inglés, descripción en español).
- Nunca integrar en `main` sin aprobación del humano.
