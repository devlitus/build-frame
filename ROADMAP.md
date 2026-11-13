# ROADMAP

> **Versión:** 0.2 · 2026-11-11 (despliegue en Vercel a partir de M7)
> Referencia de diseño: [GDD.md](GDD.md)

## Principios

- **Incremental:** cada hito termina en algo **jugable** (desplegado a partir de M7).
- **Vertical:** mejor un sistema pequeño completo (lógica + render + UI + tests) que muchos a medias.
- **Primero los *placeholders*:** el arte final nunca bloquea un hito.
- **Definición de "hecho" (DoD)**, válida para todos los hitos:
  1. Los criterios de aceptación del hito se cumplen.
  2. La lógica del núcleo tiene tests en verde y la CI pasa (lint, tipos, tests y build).
  3. Se juega en navegador de escritorio **y** en móvil.
  4. Hasta M6: se juega con `npm run preview` en local (PC y móvil por la red local). Desde M7: está desplegado en la URL de pruebas (Vercel).
  5. GDD/ROADMAP/ADRs están actualizados si algo cambió.

## Visión general

```
Fase 1 · MVP             M0 → M7   → v0.1 "Primera cosecha" (amigos)
Fase 2 · Profundidad     M8 → M13  → v0.2 … v0.5
Fase 3 · Online          M14 → M16 → v0.6 … v1.0
Transversal              Arte, audio, rendimiento, accesibilidad
```

---

## Fase 1 · MVP

### M0 — Cimientos
**Objetivo:** el proyecto existe, se construye y se testea solo.
- Repositorio Git, estructura de carpetas (`core/`, `game/`, `ui/`, `data/`, `save/`).
- Vite + TypeScript estricto + Phaser 3 + Preact.
- ESLint, Prettier, Vitest y Playwright configurados.
- CI en GitHub Actions: lint → formato → tipos → tests → build → e2e (el despliegue llega en M7).
- Manifiesto PWA básico.
- ADRs iniciales: motor, perspectiva, arquitectura del núcleo por comandos.

**Aceptación:** la CI pasa en verde en GitHub y la pantalla con el título del juego se ve en PC y móvil (`npm run preview`).

### M1 — El valle
**Objetivo:** ver y recorrer el terreno.
- Mapa del valle en cuadrícula con *tiles placeholder*.
- División en parcelas visible (bordes y estado: en venta o propia).
- Cámara con zoom y desplazamiento: rueda y arrastre en PC, pellizco y arrastre en móvil.
- Límites de cámara.

**Aceptación:** se recorre todo el valle con fluidez (60 fps en escritorio, ≥30 fps en un móvil medio).

### M2 — Personaje y tiempo
**Objetivo:** el mundo vive y el jugador está en él.
- Personaje con movimiento por teclado, *joystick* virtual y tocar para moverse.
- Colisiones básicas.
- Reloj de juego, ciclo día/noche, pausa y x1/x2/x3.
- Cambio entre Modo Vida y Modo Plano (pausa automática en el Modo Plano).
- HUD mínimo: hora y fecha.

**Aceptación:** pasa un día completo, el personaje se mueve en PC y móvil y los modos cambian sin errores.

### M3 — Parcelas
**Objetivo:** la primera decisión económica.
- Dinero inicial (ahorros).
- Atributos de parcela (fertilidad, agua, terreno) visibles al seleccionarla.
- Fórmula de precio: atributos + subida progresiva.
- Compra con la regla de adyacencia.
- Panel de detalle y confirmación.

**Aceptación:** se compra la primera parcela libremente y las siguientes solo si son adyacentes; el dinero baja correctamente; tests del núcleo cubren precios y reglas.

### M4 — Zonas y construcción
**Objetivo:** organizar la granja.
- Pintar zonas (Cultivo, Huerto, Vivienda, Almacén) sobre casillas propias.
- Catálogo de edificios iniciales (casa, cobertizo, caja de envío).
- Colocar con validación (zona, espacio, coste en dinero y materiales) y vista previa válida/inválida.
- Construcción que dura días de juego.
- Mover y demoler.
- **Arte en paralelo** (hilo de arte, solo recursos): casa, cobertizo y caja de envío, terminados y en obra, y texturas de las zonas, en estilo B. Se conectan al juego en M5-00.

**Aceptación:** se diseña una pequeña granja con zonas y 3 edificios; las reglas de colocación tienen tests.

### M5 — Cultivos, recolección y herramientas
**Objetivo:** producir alimentos y materiales.
- **M5-00 Integración del arte** (primera historia): protagonista animado en 4 direcciones, *tiles* de terreno, árbol, roca y edificios de M4 en lugar de los *placeholders*; nitidez en pantallas con DPR alto (#11).
- **Arte en paralelo:** cultivos por fases, tierra arada y regada, iconos de herramientas y animaciones de uso.
- Herramientas: azada, regadera, semillas, mano (cosechar), **hacha y pico**.
- Energía del personaje.
- 4–5 cultivos de una estación con fases de crecimiento.
- Riego, crecimiento diario y marchitarse tras 3 días sin agua.
- **Árboles y rocas** en las parcelas según su terreno; talar y picar da **madera y piedra**; replantar árboles.
- Inventario básico con **capacidad limitada** y ampliable con el cobertizo.

**Historias aprobadas** (2026-11-13; *milestone* M5): M5-00 Integración del arte (#53) · M5-01 Inventario y herramienta activa (#54) · M5-02 Energía y dormir (#55) · M5-03 Arar y plantar (#56) · M5-04 Riego, crecimiento y marchitarse (#57) · M5-05 Cosechar (#58) · M5-06 Talar, picar y replantar (#59). Decisiones de la PO: madera y piedra siguen en `materiales` y no ocupan ranuras; lote de semillas de regalo (sin tienda hasta M6) con 5 cultivos de primavera en `data/cultivos.json`; regadera sin capacidad en M5.

**Aceptación:** se completa el ciclo arar → plantar → regar → cosechar en varios días; se obtiene la madera y la piedra necesarias para construir un cobertizo; el crecimiento y la recolección tienen tests.

### M6 — Mercado → **el bucle está completo**
**Objetivo:** cerrar el bucle económico.
- Tienda del pueblo: comprar semillas, comprar madera y piedra (caras, como red de seguridad) y vender productos.
- Caja de envío (cobro al día siguiente).
- Precios con calidad y saturación simple.
- Resumen al dormir (ingresos del día).
- **Arte en paralelo, integrado en el hito:** la tienda y la entrada del pueblo, e iconos de productos y materiales.

**Aceptación:** una partida desde cero permite ganar dinero y comprar una segunda parcela en ~30–45 min de juego.

### M7 — Guardado y pulido → **release v0.1 "Primera cosecha"**
**Objetivo:** que un amigo pueda jugarlo de verdad.
- Guardado automático al dormir y carga al entrar (IndexedDB), con versionado del formato y migraciones ([ADR 0001](docs/adr/0001-persistencia.md)).
- 3 copias de seguridad rotativas, detección de corrupción y exportar e importar la partida a un archivo.
- Menú principal: nueva partida y continuar.
- Primeros objetivos del diario como tutorial.
- Audio básico (música y efectos clave).
- Pase final de arte del MVP: menú, interfaz y lo que aún sea *placeholder*.
- Despliegue en **Vercel** (URL estable desde `main` y vistas previas por PR).
- Formulario o canal para recoger *feedback*.

**Aceptación:** 3+ amigos juegan una sesión completa en PC o móvil sin ayuda y se recoge su *feedback*.

---

## Fase 2 · Profundidad

| Hito | Contenido | Release |
|---|---|---|
| **M8 — Estaciones y clima** | 4 estaciones, cultivos por estación, lluvia y tormenta | v0.2 |
| **M9 — Animales** | Zona de ganado, corrales, 3 animales, productos, afinidad | v0.2 |
| **M10 — Mejoras, procesado y automatización** | Árbol de mejoras, niveles de herramientas, aspersores, invernadero; fibra y arcilla; aserradero, horno y telar (tablones, ladrillos, cuerda); cantera; materiales escasos en la tienda | v0.3 |
| **M11 — Bienestar** | Sistema de bienestar, decoración y su efecto en la energía | v0.3 |
| **M12 — Pueblo y vecinos** | 6–8 vecinos, diálogos, amistad, encargos, proyectos del pueblo, planos del carpintero, leñador y cantero contratables | v0.4 |
| **M13 — Eventos, ruinas y colección** | Ferias por estación, eventos aleatorios, ruinas de la antigua granja (materiales escasos e historia), diario completo y colección | v0.5 |

El orden puede cambiar según el *feedback* de los amigos tras cada release.

---

## Fase 3 · Online

| Hito | Contenido | Release |
|---|---|---|
| **M14 — Cuenta y nube** | Inicio de sesión sencillo y partida en la nube (continuar en otro dispositivo) | v0.6 |
| **M15 — Social asíncrono** | Visitar granjas de amigos, regalos, tablón de pedidos y mercado compartido | v0.7 |
| **M16 — Cooperativo en tiempo real** *(experimental)* | Granja compartida con 2–4 jugadores | v1.0 (si funciona) |

Antes de M14 se escribe un ADR que compare las opciones de backend (coste, privacidad, mantenimiento).

---

## Transversal (en paralelo a los hitos)

| Área | Cuándo | Contenido |
|---|---|---|
| **Prototipo de arte** | M2–M3 ✅ | Estilo B (tinta sepia + acuarela) aprobado; biblia en `docs/arte/BIBLIA.md` |
| **Producción de arte** | Desde M4 | Cada hito lista su **arte en paralelo**: un hilo de arte produce los recursos (sin tocar `src/`) mientras se programa el hito, y se conectan al juego en una historia del propio hito o del siguiente. El hilo de arte se lanza en cuanto empieza el hito que lo necesita |
| **Audio** | M7 en adelante | Música por estación y efectos |
| **Rendimiento móvil** | Cada hito | Presupuesto de fps y memoria, prueba en un dispositivo real |
| **Accesibilidad** | Cada hito con interfaz | Tamaño de texto, contraste, controles táctiles |
| **Balance** | Desde M6 | Hojas de cálculo o simulaciones del núcleo para ajustar precios y tiempos |

---

## Proceso de trabajo

Ver [docs/PROCESO.md](docs/PROCESO.md): ramas por hito, ciclo de cada historia, roles de los agentes y reglas de calidad.
