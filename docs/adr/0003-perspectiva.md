# 0003 — Perspectiva 2D cenital 3/4 y control híbrido

**Estado:** aceptada
**Fecha:** 2026-11-11
**Relacionado:** [GDD §4](../../GDD.md#4-perspectiva-y-control)

## Contexto
La perspectiva condiciona el arte, el *picking* de casillas, el orden de dibujo y la jugabilidad en pantallas táctiles pequeñas.

## Decisión
- **2D cenital con perspectiva 3/4** sobre cuadrícula ortogonal. Casilla base de 32×32 px (provisional).
- Orden de dibujo por coordenada Y (`depth = y`) para los objetos altos (edificios, árboles, personaje).
- **Control híbrido:** Modo Vida (personaje) y Modo Plano (gestión, con pausa automática).
- Diseño *mobile-first*, recomendado en horizontal; nada depende de *hover*.

## Alternativas consideradas
| Alternativa | Motivo del descarte |
|---|---|
| Isométrica | *Picking* y orden de profundidad complejos; más difícil de producir con ComfyUI; se reevaluará si el arte lo pide |
| Solo personaje | Construir a gran escala se vuelve tedioso |
| Solo gestión | Se pierde la parte de "vida" y el vínculo con el mundo |

## Consecuencias
- **+** Conversión pantalla → casilla trivial; arte más fácil de mantener coherente.
- **−** Dos esquemas de control que probar en PC y móvil en cada hito.
