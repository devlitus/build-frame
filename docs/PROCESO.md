# PROCESO — Cómo construimos el juego

> **Versión:** 0.5 · 2026-11-12 (e2e: tanda de humo en la CI, tanda completa en local)
> Relacionado: [GDD](../GDD.md) · [ROADMAP](../ROADMAP.md)

Este documento define **cómo** trabajamos: ramas, ciclo de cada tarea, roles (humano y agentes), reglas de calidad y releases. Si el proceso no funciona, se cambia aquí primero.

---

## 1. Roles

### Humano: **Product Owner** (tú)
- Dueño de la visión: aprueba cambios en el GDD y en las prioridades del ROADMAP.
- Aprueba la **integración de cada hito en `main`** (release). Es lo único que integra con su visto bueno: las PR menores las decide el Orquestador (ver §2).
- Juega cada hito y da *feedback*; decide en los empates de diseño.
- Lleva el pipeline de arte (ComfyUI, Blender) con ayuda de los agentes.

### Agentes

| Agente | Modelo | Responsabilidad | Puede | No puede |
|---|---|---|---|---|
| **Orquestador** | **Opus** | Planifica el hito, divide en historias, asigna trabajo, integra resultados, mantiene la coherencia con el GDD y los ADRs, informa al humano | Leer todo, crear ramas, abrir y integrar PRs en la rama del hito, editar docs, integrar en `main` PRs menores con la CI en verde | Integrar un **hito** en `main` sin aprobación humana; cambiar el GDD sin aprobación |
| **Implementador** | **Sonnet** | Escribe el código de una historia y sus tests unitarios | Editar `src/`, `tests/`, `data/` dentro de su rama | Borrar, saltar ni debilitar tests del Rompedor; tocar otras historias |
| **Rompedor** | **Sonnet** (por defecto) · **Opus** para sistemas críticos | Busca fallos: casos límite, tests de propiedades, partidas simuladas, pruebas de interfaz en móvil | Escribir en `tests/` e informes; ejecutar el juego | Modificar `src/` (no arregla, solo demuestra el fallo) |
| **Revisor** | **Opus** | Revisa arquitectura, legibilidad, rendimiento y cumplimiento del GDD | Comentar, aprobar o pedir cambios | Escribir funcionalidades |
| **Asistente** | **Haiku** | Tareas mecánicas: changelog, sincronizar docs, ordenar fichas de assets | Editar docs y metadatos | Tocar código de juego |

**Sistemas críticos** (el Rompedor usa Opus): economía y precios, guardado y migraciones, reglas de construcción y parcelas, y todo lo online.

### Por qué esta combinación
- **Opus de orquestador:** mantiene el orden, decide y detecta incoherencias entre historias. Su contexto se reserva para decisiones; no lee código línea a línea si no hace falta.
- **Sonnet para implementar:** con historias bien acotadas (criterios de aceptación claros) rinde muy bien y es más barato y rápido.
- **Revisor y Rompedor separados del Implementador:** quien escribe el código no es quien lo valida. El Rompedor tiene incentivos opuestos: su éxito es encontrar fallos.
- **Opus en la revisión y en los sistemas críticos:** encontrar fallos sutiles (estado inconsistente, errores de redondeo, carreras al guardar) exige más razonamiento que escribir el código.

### Nota técnica (Claude Code)
- Los subagentes se definen en `.claude/agents/*.md`, con `model:` y las herramientas permitidas en su cabecera.
- El Rompedor y el Revisor trabajan sobre la rama de la historia ya implementada.

### Hilos (sesiones) y worktrees
**Un hilo = un hito = un worktree.** Funciona como las ramas de Git:

| Hilo | Qué hace | Dónde trabaja |
|---|---|---|
| **Principal** (Opus) | Orquesta el proyecto: planifica cada hito, propone las historias al humano, lanza el hilo del hito y resume sus avisos. Hace solo cambios pequeños de documentación | El checkout principal (`main`) |
| **De hito** (Opus) | Orquestador del hito: crea `hito/MX-…`, el *milestone* y los issues, y ejecuta el ciclo de cada historia con los subagentes. Abre la PR hacia `main` sin integrarla | Su propio worktree, creado al lanzar la sesión |
| **De tarea suelta** | Mantenimiento fuera del juego (p. ej. reparar un modelo de ComfyUI) | Sin worktree, o con uno propio si toca el repositorio |

- El hilo principal lanza el de hito con un brief completo (historias aprobadas, criterios y este documento), porque el hilo nuevo no ve la conversación del principal.
- **Protección de worktrees:** la app solo deja a una sesión, y a sus subagentes, editar archivos dentro de **su propio** worktree. Crear otro a mano con `git worktree add` para un subagente no funciona: sus ediciones se rechazan.
- **Historias en secuencia** (por defecto): se trabajan una tras otra en el worktree del hito, cada una en su rama `feat/MX-…`.
- **Historias en paralelo** (cuando no se pisan):
  1. Preferido: lanzar el subagente Implementador con `isolation: "worktree"` en la herramienta `Agent`, que le da un worktree gestionado por la app.
  2. Alternativa: lanzar cada historia como un hilo aparte desde el hilo del hito, cada una con su worktree.
- **Si el hilo principal se queda sin contexto**, se resume solo y sigue recibiendo los avisos de los hilos que lanzó. Un hilo principal **nuevo** no recibe esos avisos: debe localizar los hilos activos (lista de sesiones vinculadas o búsqueda) antes de continuar.

---

## 2. Ramas y versiones

```
main                              ← estable, desplegada, solo releases aprobadas
 └─ hito/M3-parcelas              ← rama del hito, integración continua
     ├─ feat/M3-precio-parcela    ← una rama por historia
     ├─ feat/M3-panel-compra
     └─ fix/M3-adyacencia-esquinas
```

| Rama | Se crea desde | Se integra en | Quién integra |
|---|---|---|---|
| `main` | — | — | Humano (aprobación de release) |
| `hito/MX-nombre` | `main` | `main` | Orquestador, tras la aprobación del humano |
| `feat/MX-nombre` | `hito/MX-…` | `hito/MX-…` | Orquestador, tras la revisión y la CI en verde |
| `fix/MX-nombre` | `hito/MX-…` | `hito/MX-…` | Orquestador |
| `hotfix/nombre` | `main` | `main` y la rama de hito activa | Orquestador, con aviso al humano |
| `docs/…`, `fix/…` (fuera de un hito) | `main` | `main` | Orquestador, sin aprobación (CI en verde) |
| `arte/nombre` | `hito/MX-…` | `hito/MX-…` | Orquestador |

- **Un hito activo a la vez** (como máximo, un segundo en preparación).
- `main` está protegida: solo se integra por PR y con la CI en verde.
- **Quién decide cada integración en `main`:**
  - **Hito** (`hito/MX-…` → `main`): el humano, tras la demo o prueba manual del hito.
  - **PR menores** (documentación, proceso, herramientas, scripts, `hotfix/`): el Orquestador, sin preguntar, con la CI en verde. Las integra con *squash*, borra la rama e informa en una línea.
- **Versiones** con SemVer: `v0.1.0` = MVP. Cada hito integrado en `main` lleva su etiqueta (`v0.1.0-m3`, etc.).
- Al integrar una rama de historia en la del hito se hace *squash*: un commit por historia.

### Commits
[Conventional Commits](https://www.conventionalcommits.org/), con el tipo en inglés y la descripción en español:
```
feat(parcelas): precio según atributos y número de compras
fix(guardado): no perder el inventario al migrar de v1 a v2
test(economia): propiedad "el dinero nunca es negativo"
docs(gdd): añadir sección de recursos
```

---

## 3. Ciclo de un hito

```
1. Planificación    Orquestador lee el ROADMAP → propone historias → humano aprueba
2. Rama             crea hito/MX-nombre desde main
3. Historias        ciclo de la sección 4, varias en paralelo si no se pisan
4. Estabilización   Rompedor hace una pasada global del hito; se corrigen los fallos
5. Demo             humano juega el hito (PC y móvil): en local hasta M6, en la URL de pruebas desde M7
6. Release          humano aprueba → PR hito → main → etiqueta → despliegue
7. Retrospectiva    qué funcionó y qué no; se ajusta este documento
```

---

## 4. Ciclo de una historia

```
  Orquestador ──► Implementador ──► Rompedor ──┬──► (¿hay fallos?) ──sí──► Implementador corrige ─┐
  (historia +     (código + tests  (ataca y     │                                                  │
   criterios)      en worktree)     deja tests  │◄─────────────────────────────────────────────────┘
                                    que fallan) │
                                                └──no──► Revisor ──► CI verde ──► Orquestador integra en hito/
```

1. **Orquestador** redacta la historia (plantilla abajo) y la asigna.
2. **Implementador** crea `feat/…` en un worktree, implementa y escribe sus tests. Termina cuando sus tests y la CI local pasan.
3. **Rompedor** ataca: escribe tests que **demuestran** cada fallo encontrado y un informe breve. Si no encuentra nada, lo deja documentado.
4. **Implementador** corrige hasta que todos los tests (los suyos y los del Rompedor) pasen. **Durante un hito activo, los tests del Rompedor no se pueden borrar, saltar ni debilitar**; si uno es incorrecto, lo decide el Orquestador.
   - **Regresión tras el hito.** Los tests del Rompedor de un hito integrado en `main` se reorganizan según la pirámide de §5 en una historia `test(…)`, autorizada por el Orquestador, hecha por el **Rompedor** (Opus en sistemas críticos) y verificada por el **Revisor**, con **tabla de equivalencias**: cada aserción va a (a) un test que se queda, (b) core/prop/unit, (c) la regla de interfaz, (d) `npm run capturas`, o (e) se descarta por duplicada o por medir solo la herramienta de depuración, con su motivo. Los `[S1]`/`[S2]`/`[S3]` nunca se borran: si el fallo era lógico van a core; si era de interfaz, a e2e.
5. **Revisor** revisa el diff completo y aprueba o pide cambios.
6. **Orquestador** abre o integra la PR en la rama del hito cuando la CI está en verde.

**Límite de iteraciones:** si tras 3 rondas implementador ↔ rompedor sigue habiendo fallos, el Orquestador para y replantea la historia (puede que esté mal definida).

### Plantilla de historia
```markdown
## [MX-NN] Título corto

**Como** jugador **quiero** … **para** …

### Criterios de aceptación
- [ ] Dado … cuando … entonces …
- [ ] …

### Notas de diseño
Referencia al GDD (sección), valores iniciales, casos límite conocidos.

### Fuera de alcance
…

### Sistema crítico: sí/no  (si es sí, el Rompedor usa Opus)
```

Las historias se gestionan como **GitHub Issues**, con el *milestone* del hito y etiquetas (`historia`, `bug`, `arte`, `critico`, `deuda`).

---

## 5. Calidad

### Pirámide de tests
| Nivel | Herramienta | Qué cubre | Quién |
|---|---|---|---|
| Unitarios | Vitest | Reglas del núcleo (`core/`): precios, crecimiento, colocación | Implementador |
| Propiedades | Vitest + fast-check | Invariantes: el dinero nunca es negativo, no hay dos edificios en la misma casilla, guardar y cargar devuelve el mismo estado | Rompedor |
| Simulación | Scripts sobre `core/` | Partidas automáticas de N días con acciones aleatorias; detecta bloqueos y desequilibrios | Rompedor |
| Extremo a extremo | Playwright (escritorio y móvil emulado) | Solo lo que necesita navegador: humo, **un** recorrido por flujo crítico, entrada real (toque, teclado, ratón → efecto), regresiones `[S]` de interfaz y robustez de render (una por tipo) | Rompedor |
| Regla de interfaz | Playwright (`interface-rule.spec.ts`) | La interfaz no tapa el juego: cobertura máxima del lienzo, foco libre alrededor del personaje y de lo elegido, controles alcanzables; en 1280×720, 412×915, 915×412 y 640×320 | Rompedor |
| Visual | `npm run capturas` (4 viewports por escenas, con cobertura) | Que se **vea** bien: nada cortado, solapado, ilegible ni descolocado; contraste; botones alcanzables con el dedo | Rompedor |
| Manual | El humano | Diversión, sensaciones, móvil real | Humano |

### Reglas de arquitectura (las vigila el Revisor)
- `core/` **no importa** Phaser, el DOM ni el navegador. Es lógica pura y determinista.
- Todo cambio de estado del juego ocurre mediante **comandos** (`ComprarParcela`, `Talar`…).
- El contenido (cultivos, edificios, costes) vive en `data/` como JSON validado con un esquema.
- Los números mágicos de balance van en datos, no en el código.

### CI (GitHub Actions), en cada PR
`lint` → `typecheck` → `test` (unitarios + propiedades) → `build` → `e2e` de humo (en las PR y en `main`) → despliegue de la vista previa (desde M7, en Vercel).

**e2e en dos tandas.** El runner de GitHub no tiene GPU y va a 12–17 fps, así que los tests que dependen de fps, tiempo real o recorridos largos fallan allí sin que haya un fallo real.
- **CI: tanda de humo** (`npm run e2e:humo`, tests con la etiqueta `@humo` en `tests/e2e/humo.spec.ts`). Corta y estable, en escritorio y móvil emulado: arrancar, moverse con el teclado, ir con un clic o toque a un destino cercano, cambiar de modo y pasar un día acelerado. Se amplía cuando un hito añade un flujo básico nuevo, con márgenes de tiempo amplios.
- **Local: tanda completa** (`npm run e2e`), **obligatoria antes de abrir la PR de cada hito**. El resultado (pasan, se omiten y fallos esperados) se anota en la descripción de la PR. Incluye los tests de tiempo real y rendimiento, que corren al final y solos (ver `playwright.config.ts`).
- **No va a e2e:** aritmética y reglas del juego (van a core/prop/unit); textos; combinatoria de viewports o DPR (la cubre la regla de interfaz o los unit); estrés de N clics; tests que solo hacen capturas (van a `npm run capturas`); fps (tanda de rendimiento).
- **Presupuesto (en implantación en el hito E2E-velocidad):** `npm run e2e` (build + tanda funcional) **≤ 5 min**, nunca más de 10; **≤ 60 tests funcionales** declarados; mediana ≤ 8 s y máximo 40 s por test. `npm run e2e:rendimiento`: ≤ 6 tests, ≤ 2 min, 1 worker; en local solo falla si se rompe el suelo de un test. **Presupuesto cerrado:** una historia añade 0 tests e2e por defecto y hasta 2 si trae un flujo crítico o un gesto táctil nuevo; si se pasa de 60, sale otro. Las excepciones las aprueba el Orquestador.
- **Antes de la PR de un hito:** `npm run e2e:completo` (funcional + rendimiento), capturas por escenas a la PO y demo en móvil real.
- **Esperas:** siempre con los helpers de `tests/e2e/apoyo/` y condiciones (estado vía `__raices`, cámara quieta, N fotogramas); `waitForTimeout` prohibido fuera de `apoyo/`.
- **Un solo e2e a la vez por máquina:** no lanzar tandas en dos worktrees a la vez (falsean tiempos y fps).
- **Etiquetas Playwright (`{ tag }`):** `@rendimiento` (fps o tiempo real con umbral; proyectos `rendimiento-escritorio` y `rendimiento-movil`, un worker, tanda aparte y solos), `@medida` (solo anota; fuera por defecto, `E2E_MEDIDA=1`), `@capturas` (solo escribe PNG; `npm run e2e:capturas`), `@humo` (CI). `@movil` y `@lento` quedan reservadas. `npm run e2e` = build + solo la tanda funcional; `npm run e2e:rendimiento` = solo `@rendimiento` (el objetivo se anota con `target()` de `apoyo/rendimiento.ts`, anotación `target-missed`, y no hace fallar; solo falla el suelo, un `expect` al 60 % del objetivo); `npm run e2e:completo` = ambas (funcional y después siempre rendimiento), con resumen y código combinado.

### Verificación visual
Los tests e2e comprueban que los elementos **existen**, no que se **vean** bien. Por eso, en toda historia que cambie lo que se ve:

1. El **Rompedor** ejecuta `npm run capturas` (unos 2 min; construye antes), abre `capturas/index.html` y **mira** cada captura en los cuatro viewports de la regla de interfaz (1280×720 escritorio; 412×915, 915×412 y 640×320 como móvil real con `hasTouch`/`isMobile`). Escenas: portada; Vida (aparición, esquina del valle, inventario, aviso, noche); Plano (sin panel, parcela, confirmación de compra); zonas con pincel; construir (catálogo, silueta, confirmación); edificio elegido; mover. Cada PNG es `capturas/<viewport>/<escena>.png` y el índice muestra el % de cobertura, el foco y los controles fuera de regla de cada uno. Opciones: `-- --overlay` pinta encima las cajas opacas medidas, el % y el cuadrado de foco (verde libre, rojo tapado); `-- --scene=plano,move` y `-- --viewport=412x915` filtran (separados por comas). El código está en `scripts/screenshots.ts` y reutiliza los helpers de `tests/e2e/apoyo/`. Se revisa en las capturas:
   - texto legible y sin solapes; nada cortado ni fuera de pantalla;
   - en móvil: botones de al menos 44 px y nada que dependa de *hover*;
   - coherencia con el GDD y con el estilo de arte (acuarela) cuando ya haya arte final.
   Cada problema es un fallo con severidad (normalmente S3; S2 si impide jugar) y queda en su informe con el nombre de la captura.
2. El **Orquestador** del hito comprueba las capturas finales y se las **envía al humano** junto con la PR del hito, para que vea el resultado antes de probarlo.
3. El **humano** da el visto bueno final en su móvil real (demo del hito).

Las capturas viven en `capturas/`, que no se versiona. Los tests de regresión visual automáticos (`toHaveScreenshot`) se añadirán cuando haya arte final en pantallas estables; con *placeholders* que cambian a menudo darían más ruido que ayuda.

### Definición de "hecho"
La del [ROADMAP](../ROADMAP.md#principios). Para la CI de un hito cuentan la CI en verde (con la tanda de humo) **y** la tanda e2e completa en local, con su resultado anotado en la PR del hito.

---

## 6. Bugs

| Severidad | Definición | Acción |
|---|---|---|
| **S1 – Bloqueante** | Pérdida de partida, cuelgue, no se puede avanzar | Se para todo; `hotfix/` si está en `main` |
| **S2 – Grave** | Una mecánica no funciona o se puede explotar (dinero infinito) | Se corrige antes de cerrar el hito |
| **S3 – Menor** | Visual, texto, incomodidad | Al backlog |

Todo bug corregido deja un **test de regresión**.

---

## 7. Decisiones (ADRs)

Las decisiones técnicas o de diseño difíciles de revertir se registran en `docs/adr/NNNN-titulo.md`:
```
# NNNN — Título
Estado: propuesta | aceptada | sustituida por NNNN
Contexto · Decisión · Alternativas consideradas · Consecuencias
```
El Orquestador las propone y el humano acepta las que afectan al diseño.

---

## 8. Arte (ComfyUI y Blender)

- Los recursos fuente viven en `assets-src/` (`.blend`, workflows de ComfyUI) y los finales optimizados, en `public/assets/`.
- Cada recurso tiene una **ficha** (`assets-src/fichas/<recurso>.md`) con *prompt*, semilla, modelo/LoRA o archivo `.blend`, y fecha, para poder regenerarlo.
- Los agentes pueden lanzar generaciones en ComfyUI, pero **el humano elige** la versión final.
- Hasta que exista el arte final se usan *placeholders*; el arte nunca bloquea un hito.

---

## 9. Releases para amigos

- A partir del MVP (M7), cada release en `main` se publica en la URL estable de Vercel y cada PR tiene su URL de vista previa.
- Notas de la versión (generadas por el Asistente): novedades, problemas conocidos y qué probar.
- Canal de *feedback* sencillo (formulario o grupo); el Orquestador lo resume en issues etiquetados como `feedback`.

---

## 10. Cuándo se escala al humano

El Orquestador **para y pregunta** cuando:
- Una historia obliga a cambiar el GDD o un ADR aceptado.
- Hay que elegir entre dos opciones de diseño con impacto en la jugabilidad.
- Se va a integrar un **hito** en `main`, borrar ramas con trabajo sin integrar o hacer algo irreversible.
- Una historia supera el límite de iteraciones.
- Aparece un coste nuevo (servicio de pago, dependencia con licencia restrictiva).
