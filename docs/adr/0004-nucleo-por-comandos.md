# 0004 — Núcleo determinista dirigido por comandos

**Estado:** aceptada
**Fecha:** 2026-11-11
**Relacionado:** [GDD §7](../../GDD.md#7-online-y-multijugador-fases-posteriores) · [ADR 0001](0001-persistencia.md) · [PROCESO §5](../PROCESO.md#5-calidad)

## Contexto
Queremos tests rápidos, simulaciones de partidas, guardado fiable y, más adelante, validación en servidor y cooperativo. Todo ello exige que la lógica del juego sea independiente del motor y reproducible.

## Decisión
- `src/core/` contiene **toda** la lógica del juego como funciones puras sobre un `EstadoJuego` inmutable (datos serializables a JSON).
- Todo cambio de estado se expresa como un **comando** (unión discriminada `Comando`) y se aplica con `aplicarComando(estado, comando) → ResultadoComando`. Un comando inválido devuelve `ok: false` con un código de error y el estado intacto; nunca lanza excepciones por reglas de juego.
- **Aleatoriedad** solo mediante el RNG determinista del núcleo (`core/rng.ts`), cuyo estado vive dentro de `EstadoJuego`.
- **Tiempo:** el núcleo no lee el reloj real; el tiempo avanza con comandos (`AvanzarTiempo`). La capa de juego traduce los fotogramas en comandos.
- `EstadoJuego.versionFormato` identifica el formato para las migraciones (ADR 0001).
- **Capas:** `core` ← `save` ← `game` (Phaser) / `ui` (Preact). Las capas superiores leen el estado y emiten comandos; `core` no importa nada de ellas.

### Cómo se hace cumplir
- `tsconfig.core.json` compila `src/core` **sin** tipos del DOM ni de Node.
- ESLint en `src/core/**` prohíbe importar Phaser, Preact, `idb` y las capas superiores, y usar `Math.random`, `Date`, `window`, `document`, `localStorage` e `indexedDB`.
- Un test de propiedades comprueba que misma semilla + mismos comandos ⇒ mismo estado.

## Alternativas consideradas
| Alternativa | Motivo del descarte |
|---|---|
| Lógica dentro de las escenas de Phaser | No se puede testear ni ejecutar en servidor; acopla el juego al motor |
| Estado mutable con *setters* | Difícil de reproducir, guardar y sincronizar |
| ECS completo | Exceso de complejidad para un juego de gestión con pocas entidades activas |

## Consecuencias
- **+** Tests unitarios y de propiedades en milisegundos; simulaciones de miles de días.
- **+** Guardado = serializar el estado; repetición y validación en servidor posibles más adelante.
- **−** Copiar estado inmutable tiene coste; si el perfilado lo exige se usarán estructuras compactas (p. ej. arrays tipados para las casillas) sin romper la interfaz.
- **−** Algo más de ceremonia para cada acción nueva (definir comando, validación y tests).
