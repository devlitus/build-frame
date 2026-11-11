# 0001 — Persistencia de datos y guardado de partidas

**Estado:** aceptada
**Fecha:** 2026-11-11
**Relacionado:** [GDD §10](../../GDD.md#10-técnica-resumen) · [ROADMAP M7 y M14–M16](../../ROADMAP.md) · [PROCESO](../PROCESO.md)

## Contexto

El juego es web (PC y móvil), de un jugador en el MVP y con funciones online entre amigos en la Fase 3. Hay que decidir:

1. Dónde vive el contenido del juego (cultivos, edificios, precios).
2. Dónde y cómo se guarda la partida de cada jugador.
3. Cómo pasar a la nube y a lo social sin reescribir el juego.
4. Qué hacer con las trampas, dado que todo lo que se guarda en el navegador se puede editar con las herramientas de desarrollo.

## Decisión

### 1. Tres tipos de datos, tres soluciones

| Tipo | Ubicación | Formato |
|---|---|---|
| **Contenido del juego** | `data/` en el repositorio | JSON validado con un esquema en build y en tests |
| **Partida** | IndexedDB (Fase 1–2) → nube (Fase 3) | Documento JSON versionado (instantánea completa del estado) |
| **Datos compartidos** | Base de datos en la nube (Fase 3) | Tablas relacionales |

### 2. Partida como documento versionado
- La partida es **una instantánea JSON** del estado del núcleo (`core/`), no tablas normalizadas.
- Cada partida lleva `versionFormato`. Al cargar se aplican **migraciones en cadena** (`v1 → v2 → … → actual`), cada una como función pura y con tests.
- Tamaño estimado: menos de 1 MB (36 parcelas × 256 casillas, con codificación compacta).
- Se guarda **automáticamente al dormir** y bajo demanda.
- Se mantienen **3 copias de seguridad rotativas** por ranura.
- **Exportar e importar** la partida a un archivo (`.raices`, JSON comprimido) para mover partidas entre dispositivos antes de tener la nube.
- **Suma de comprobación** del contenido para detectar corrupción accidental (guardado interrumpido, disco lleno) y ofrecer restaurar una copia.

### 3. Una sola interfaz de almacenamiento
```ts
interface AlmacenPartidas {
  listar(): Promise<ResumenPartida[]>
  cargar(id: string): Promise<PartidaSerializada>
  guardar(id: string, partida: PartidaSerializada): Promise<void>
  borrar(id: string): Promise<void>
}
```
- Implementaciones: `AlmacenIndexedDB` (M7) y `AlmacenNube` (M14).
- El resto del juego nunca sabe dónde se guarda.
- Librería: `idb` (envoltorio mínimo de IndexedDB). Dexie se descarta por innecesaria para un documento por ranura.

### 4. Nube (Fase 3): Supabase
- PostgreSQL gestionado + autenticación + tiempo real + permisos por fila (RLS). El plan gratuito basta para un grupo de amigos.
- Esquema inicial orientativo: `perfiles`, `amistades`, `partidas` (con `estado_json`), `regalos`, `pedidos`, `mercado`.
- El cooperativo en tiempo real (M16) usaría además un servidor de juego (p. ej. Colyseus) que aplique los **comandos** del núcleo. Se decidirá en un ADR propio.

### 5. Trampas: postura por fases

**Hecho asumido:** todo dato en el navegador (IndexedDB, localStorage, memoria del juego) **se puede leer y modificar** con las herramientas de desarrollo, con extensiones o editando el archivo exportado. Ninguna técnica en el cliente lo impide; solo lo dificulta.

| Fase | Riesgo | Postura |
|---|---|---|
| **Un jugador (Fase 1–2)** | Solo se perjudica a sí mismo | **No se protege.** Es su partida. La suma de comprobación sirve para detectar corrupción, no como antitrampas (su clave estaría en el cliente) |
| **Nube (M14)** | La partida en la nube podría estar manipulada | Se acepta. Los datos de un jugador no afectan a otros |
| **Social (M15)** | Meter objetos o dinero inventados en el mercado, regalos o pedidos | **El servidor es la autoridad de lo compartido:** valida cada transacción con reglas en la base de datos (funciones y RLS), límites diarios y precios dentro de rangos. Lo que entra en lo compartido nunca se fía del cliente |
| **Cooperativo (M16)** | Desincronizar o manipular la granja compartida | **Servidor autoritativo:** el cliente envía comandos y el servidor los valida y aplica con el mismo núcleo determinista |

**Opción futura** (solo si hiciera falta): *validación por repetición*. Como el núcleo es determinista y funciona con comandos, el servidor podría reproducir el registro de comandos de una partida y comprobar que el estado resultante coincide. Se descarta por ahora por coste y complejidad.

## Alternativas consideradas

| Alternativa | Motivo del descarte |
|---|---|
| `localStorage` | Límite de ~5 MB, síncrono (bloquea el hilo), solo texto |
| Backend desde el día 1 | Coste, mantenimiento y sin conexión no se juega; no aporta nada al MVP |
| Partida en tablas normalizadas | Complica las migraciones y el guardado sin beneficio en un juego de un jugador |
| Firebase | Válido, pero NoSQL dificulta las consultas sociales (amigos, mercado) y es más dependiente del proveedor que PostgreSQL |
| Cifrar u ofuscar la partida | La clave viaja en el cliente: falsa seguridad y peor depuración |

## Consecuencias

- **+** MVP sin servidor, gratis, que funciona sin conexión en PC y móvil.
- **+** Pasar a la nube consiste en añadir una implementación de `AlmacenPartidas`.
- **+** La arquitectura por comandos deja abiertos la validación en servidor y el cooperativo.
- **−** Las migraciones del formato son críticas: cada cambio del estado obliga a escribir una migración y sus tests (el Rompedor usa Opus en este sistema, ver PROCESO).
- **−** Sin nube, las partidas se pierden si el jugador borra los datos del navegador. Se mitiga con exportar e importar y con un aviso en el menú.
- **−** En Fase 1–2 cualquiera puede hacerse trampas a sí mismo. Se acepta.
