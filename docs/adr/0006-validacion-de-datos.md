# 0006 — Validación de datos con valibot

**Estado:** propuesta
**Fecha:** 2026-11-11
**Relacionado:** [ADR 0001](0001-persistencia.md) · [ADR 0004](0004-nucleo-determinista.md)

## Contexto
El contenido y el balance viven en `data/*.json` (ADR 0001). Un JSON mal formado (clave que falta, peso negativo) rompería el núcleo de forma silenciosa. Queremos validarlo con esquemas tipados, en los tests y en el build, y derivar los tipos de TypeScript del esquema para no duplicarlos.

## Decisión
- Usar **valibot** para definir los esquemas en `src/core/datos/esquemas.ts`; los tipos se infieren con `InferOutput`.
- `src/core/datos/*.ts` importa cada JSON y lo valida con `v.parse` al cargar el módulo, de modo que el núcleo nunca ve datos sin validar.
- Un plugin de Vite (`buildStart`) valida los JSON con el mismo esquema y aborta el build si fallan.
- Los tests comprueban que los datos reales son válidos y que ejemplos inválidos se rechazan.

## Alternativas consideradas
| Alternativa | Motivo del descarte |
|---|---|
| zod | Funciona bien, pero pesa bastante más en el bundle y se sacude peor (*tree-shaking*); valibot ofrece la misma ergonomía con API modular |
| JSON Schema + ajv | Esquema separado del código, con tipos TypeScript a mantener a mano o con un generador extra; ajv genera código en ejecución (problemas con CSP) |
| Validación manual | Mucho código repetitivo, mensajes de error pobres y fácil de dejar incompleta |

## Consecuencias
- **+** Una sola fuente de verdad para forma y tipos; errores claros con ruta al campo inválido.
- **+** Bundle pequeño; el núcleo sigue siendo puro (la validación es determinista y sin efectos).
- **−** Nueva dependencia en tiempo de ejecución.
- **−** Cada JSON nuevo exige su esquema y su test de rechazo.
