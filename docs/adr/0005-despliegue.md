# 0005 — Despliegue en Vercel a partir del MVP

**Estado:** aceptada
**Fecha:** 2026-11-11
**Relacionado:** [GDD §10](../../GDD.md#10-técnica-resumen) · [ROADMAP M0 y M7](../../ROADMAP.md)

## Contexto
El repositorio es público en GitHub. El juego se publicará para amigos cuando el MVP esté listo; antes no aporta valor tener una URL pública de un juego a medias.

## Decisión
- **Hasta M6:** no hay despliegue. La CI (GitHub Actions) valida lint, formato, tipos, tests, build y e2e. Las demos se juegan en local con `npm run preview` (en móvil, por la red local).
- **En M7 (v0.1):** se conecta el repositorio a **Vercel**: producción desde `main` y una URL de vista previa por cada PR.
- El build es estático y usa rutas relativas, así que no hace falta configuración especial.

## Alternativas consideradas
| Alternativa | Motivo del descarte |
|---|---|
| GitHub Pages | Sin vistas previas por PR sin trabajo extra |
| Netlify | Equivalente; se prefiere Vercel |
| Desplegar desde M0 | URL pública de algo no jugable; se pospone sin coste |

## Consecuencias
- **+** Menos infraestructura que mantener durante el desarrollo.
- **−** Las demos de M1–M6 requieren ejecutar el proyecto en local.
