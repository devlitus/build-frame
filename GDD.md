# GDD — Documento de Diseño del Juego

> **Título provisional:** *Raíces*
> **Versión del documento:** 0.3 · 2026-11-11 (añadidos 6.5 Recursos y materiales y 10.1 Datos y guardado)
> **Estado:** borrador vivo. Se actualiza en cada hito.

---

## 1. Resumen

| | |
|---|---|
| **Género** | Simulación de granja + construcción y gestión, con toques de *life sim* |
| **Plataforma** | Web (navegador de escritorio y móvil), instalable como PWA |
| **Perspectiva** | 2D cenital con perspectiva 3/4 |
| **Ritmo** | Tiempo real con pausa y velocidades (x1, x2, x3) |
| **Público** | Amigos y círculo cercano (publicación privada); jugadores casuales y *cozy* |
| **Modo** | Un jugador; online y multijugador en fases posteriores |

**Pitch en una frase:** una persona agotada por la ciudad invierte sus ahorros en un valle lleno de parcelas a la venta y, decisión a decisión, convierte un terreno vacío en la granja (y la vida) que siempre quiso.

---

## 2. Pilares de diseño

Toda funcionalidad nueva debe reforzar al menos uno de estos pilares. Si no lo hace, se descarta o se aplaza.

1. **Tu granja, tu plano.** El jugador decide qué compra, dónde y para qué. No hay una distribución "correcta".
2. **Progreso visible.** Cada sesión de juego deja la granja visiblemente mejor que antes.
3. **De las manos a la gestión.** Se empieza haciendo todo a mano y se termina dirigiendo una explotación automatizada. El tipo de diversión evoluciona para no aburrir.
4. **Calma, no estrés.** El juego es la huida del estrés: sin castigos duros, sin game over. Las presiones existen (dinero, estaciones) pero son suaves.
5. **Pequeñas sorpresas.** Eventos, vecinos y descubrimientos rompen la rutina.

---

## 3. Lore y tono

**Protagonista:** una persona de ciudad (nombre y aspecto elegibles por el jugador) con un trabajo de oficina que la ha quemado. Un día decide romper con todo.

**Punto de partida:** con sus ahorros llega a **Valle Sereno** (nombre provisional), un pueblo rural envejecido y algo olvidado. El ayuntamiento vende las parcelas del valle para atraer gente nueva.

**Arco narrativo ligero:**
- **Llegada:** nadie te toma en serio, "otro de ciudad que durará un mes".
- **Arraigo:** los vecinos empiezan a confiar en ti, te piden favores y te enseñan cosas.
- **Renacer:** tu granja impulsa al pueblo. Reabren negocios, llegan visitantes y vuelve la feria.

**Tono:** cálido, humor amable, melancolía suave. Inspiración visual: acuarela o *painted pixel*, colores cálidos.

---

## 4. Perspectiva y control

### Decisión: modelo híbrido con dos modos

| Modo | Para qué | Control PC | Control móvil |
|---|---|---|---|
| **Modo Vida** (por defecto) | Moverse con el personaje, trabajar la tierra, hablar con vecinos, ir al pueblo | WASD/flechas + ratón para la acción, teclas rápidas para las herramientas | *Joystick* virtual o tocar el destino; botón de acción contextual |
| **Modo Plano** | Comprar parcelas, pintar zonas, colocar y mover edificios | Ratón: arrastrar, rueda para el zoom | Arrastrar con un dedo, pellizcar para el zoom, mantener pulsado para opciones |

**Por qué el híbrido:** solo con el personaje la construcción a gran escala se vuelve tediosa; solo con la gestión se pierde la parte de "vida" y el vínculo con el mundo. El híbrido da las dos sensaciones y encaja con el pilar 3: al principio pasas casi todo el tiempo en el Modo Vida y más adelante en el Modo Plano.

**Al entrar en el Modo Plano el tiempo se pausa** (opcional en ajustes), para que planificar nunca genere estrés.

### Decisión: 2D cenital 3/4

- Es la perspectiva más sencilla de producir y de leer en una pantalla de móvil.
- El *picking* (saber qué casilla se toca) es trivial y no hace falta ordenar la profundidad de forma compleja.
- Facilita generar arte coherente con ComfyUI.
- La isométrica se descarta para el MVP; se puede reevaluar si el arte lo pide.

---

## 5. Bucles de juego

### Bucle de minuto
Moverse → usar una herramienta (arar, plantar, regar, cosechar) → ver el resultado inmediato (animación, sonido, objeto recogido).

### Bucle de día (~15 min reales a x1)
Despertar → revisar la granja → trabajar (gastando energía) → ir al pueblo a vender o comprar → planificar mejoras → dormir. Al dormir se guarda la partida y se muestra el resumen del día.

### Bucle de estación (~21 días)
Elegir qué cultivar según la estación → ampliar parcelas o zonas → participar en el evento o feria de la estación → desbloquear mejoras.

### Bucle largo (meses o años de juego)
Comprar todo el valle → automatizar → completar los proyectos del pueblo → coleccionar (diario de la granja) → personalizar y decorar.

---

## 6. Sistemas

### 6.1 Tiempo
- Reloj de juego de 06:00 a 02:00; después el personaje se desmaya y despierta en casa (con una penalización suave: menos energía).
- Ciclo día/noche visual.
- Calendario: 4 estaciones × 21 días (valor ajustable).
- Velocidades x1/x2/x3 y pausa. En el Modo Plano la pausa es automática.
- Clima: soleado, nublado, lluvia (riega sola) y tormenta (rara; puede dañar cultivos sin proteger).

### 6.2 Terreno y parcelas
- El valle es una cuadrícula de **parcelas** (p. ej. 6×6), cada una de N×N casillas (p. ej. 16×16).
- **Cada parcela tiene atributos** que hacen interesante la elección:
  - **Fertilidad** (baja, media, alta): afecta al rendimiento de los cultivos.
  - **Agua** (río, pozo, seca): afecta al coste del riego.
  - **Terreno** (prado, bosque, rocoso): el bosque da madera pero hay que talarlo; el rocoso da piedra pero cuesta limpiarlo.
  - **Vistas o encanto**: bonificación al bienestar si construyes la casa allí.
- **Precio:** depende de los atributos y **sube con cada parcela comprada**, para que la expansión cueste más.
- **Regla de adyacencia:** solo se compran parcelas contiguas a las tuyas, salvo la primera.
- **Inicio:** con los ahorros alcanza para 1 o 2 parcelas y poco más. La primera decisión importa.

### 6.3 Zonas
El jugador "pinta" zonas sobre las casillas de sus parcelas. Cada zona habilita ciertos usos:

| Zona | Habilita | Desbloqueo |
|---|---|---|
| Cultivo | Arar y plantar cultivos de campo | Inicio |
| Huerto | Frutales y hortalizas de alto valor | Inicio |
| Vivienda | Casa, ampliaciones, decoración | Inicio |
| Almacén | Silos, cobertizos y más capacidad | Temprano |
| Ganado | Corrales, establos, pastos | Medio |
| Taller | Procesado: mermeladas, quesos, harina | Medio |
| Decoración / ocio | Jardines, bancos, estanques (bienestar) | Temprano |

Las zonas se pueden repintar (con un coste o tiempo de reconversión pequeño).

### 6.4 Construcción
- Los edificios ocupan casillas, deben estar en una zona compatible y tienen un coste de dinero y materiales (ver 6.5).
- Construir lleva **tiempo de juego** (p. ej. 1–3 días) y se ve una obra en curso.
- Los edificios se pueden **mejorar por niveles** (cobertizo → granero → granero grande).
- Se pueden mover (gratis) y demoler (con reembolso parcial).
- Las obras las levanta el **carpintero del pueblo**. Si el jugador ayuda (gastando energía), la obra se acorta.

### 6.5 Recursos y materiales

Construir y mejorar requiere **dinero + materiales**, y a veces un **plano**. Los materiales vienen sobre todo de **tus propias parcelas**, lo que da peso estratégico a sus atributos (6.2).

#### Tipos de recurso

| Nivel | Recurso | Origen | Herramienta o edificio |
|---|---|---|---|
| **Dinero** | Monedas | Ahorros iniciales, ventas, encargos, premios | — |
| **Básico** | Madera | Árboles (parcelas de bosque) | Hacha |
| **Básico** | Piedra | Rocas (parcelas rocosas); cantera más adelante | Pico |
| **Básico** | Fibra | Maleza y hierba alta (prados) | Hoz o a mano |
| **Básico** | Arcilla | Orillas del río (parcelas con río) | Pala |
| **Elaborado** | Tablones | Madera procesada | Aserradero (zona Taller) |
| **Elaborado** | Ladrillos | Arcilla cocida | Horno (zona Taller) |
| **Elaborado** | Cuerda | Fibra trenzada | Telar sencillo (zona Taller) |
| **Escaso** | Metal, cristal, piezas | Solo se compran (herrería, almacén) o se recuperan de las ruinas | — |
| **Llave** | Planos | Amistad con vecinos, proyectos del pueblo, diario | — |

#### Ruinas de la antigua granja
- Repartidas por el valle hay ruinas de una explotación abandonada hace décadas (lore: el valle tuvo vida y se vació).
- Al desmontarlas se obtienen materiales escasos (metal, piezas) y **fragmentos de historia** (cartas, fotos) que cuentan el pasado del pueblo.
- No se regeneran: son una inyección temprana y finita.

#### Elección de parcela = elección de recursos
- **Prado fértil:** buenas cosechas, fibra; casi sin madera ni piedra.
- **Bosque:** mucha madera; hay que talar y desbrozar antes de cultivar.
- **Rocoso:** barato, piedra abundante, baja fertilidad.
- **Con río:** arcilla y riego barato; suele ser más caro.

#### Ejemplo de costes (provisional, se equilibra en el balance)

| Edificio | Dinero | Materiales | Requisito |
|---|---|---|---|
| Caja de envío | 50 | 20 madera | — |
| Cobertizo | 500 | 50 madera | — |
| Aserradero | 1.200 | 80 madera, 30 piedra | Zona Taller |
| Granero | 2.500 | 40 tablones, 60 piedra, 10 metal | Plano del carpintero |
| Invernadero | 8.000 | 100 ladrillos, 50 cristal, 20 metal | Proyecto del pueblo |

#### Reglas de diseño
1. **Sin callejones sin salida:** todo material básico y elaborado se puede **comprar en el pueblo**, a un precio claramente superior al de producirlo uno mismo.
2. **Renovables:** los árboles se replantan (semillas de árbol, tardan días en crecer), las rocas reaparecen poco a poco en las zonas rocosas y la cantera produce de forma continua.
3. **Almacenamiento limitado:** los materiales ocupan capacidad y la zona Almacén (leñera, cobertizo, silo) la amplía.
4. **Automatización progresiva** (pilar 3): a mano → herramientas mejoradas (más rendimiento, menos energía) → leñador o cantero contratados → producción automática.
5. **Fuentes y sumideros:** cada recurso tiene usos que lo consumen (construir, mejorar, encargos, proyectos del pueblo) para que nunca sobre sin sentido.

### 6.6 Cultivos
- Ciclo: suelo → arado → sembrado → (riego diario) → crecimiento por fases → maduro → cosecha.
- Cada cultivo define: estaciones válidas, días de crecimiento, si rebrota, precio base y necesidad de agua.
- Calidad (normal, plata, oro), influida por la fertilidad, el riego y el abono.
- Un cultivo sin regar no muere el primer día: se detiene. Al tercero se marchita (pilar 4: calma).

### 6.7 Animales (post-MVP)
- Gallinas, vacas, ovejas, cerdos y abejas.
- Necesitan comida, refugio y cariño. Producen huevos, leche, lana, trufas o miel.
- La afinidad sube con el cuidado y mejora la calidad del producto.

### 6.8 Personaje: energía y bienestar
- **Energía:** cada acción manual la consume. Se recupera durmiendo y comiendo.
- **Bienestar** (mecánica distintiva, conectada al lore):
  - Sube con descansar a tiempo, decorar, socializar, comer bien y disfrutar de las vistas o de los eventos.
  - Baja con trasnochar, trabajar sin parar o tener la granja desordenada.
  - **Efecto:** el bienestar alto aumenta la energía máxima y desbloquea diálogos e ideas (recetas, mejoras). El bajo reduce la energía, pero nunca bloquea el juego.
  - Así se refuerza el mensaje del juego: no se trata de reproducir el estrés de la ciudad en el campo.

### 6.9 Economía y mercado
- **Moneda:** monedas (nombre por definir).
- **Mercado del pueblo:** compra de semillas y materiales y venta de productos.
- **Precios dinámicos suaves:** si vendes mucho de lo mismo, el precio baja temporalmente; la demanda varía por estación y eventos ("esta semana la panadería busca trigo").
- **Caja de envío:** vender desde la granja a precio base, cobrando al día siguiente (comodidad frente a precio).
- **Procesado:** transformar materias primas multiplica su valor.
- Hay que vigilar la inflación del juego: cada fuente de dinero necesita su sumidero (parcelas, mejoras, decoración).

### 6.10 Pueblo y vecinos (post-MVP)
- 8–12 vecinos con personalidad, horario y gustos.
- Amistad: hablar, regalar, cumplir encargos.
- **Proyectos del pueblo:** reparar el puente, reabrir la panadería, organizar la feria. Se financian con donaciones de productos o dinero y desbloquean zonas, tiendas y mejoras.

### 6.11 Progresión y mejoras
Árbol de mejoras por ramas:
- **Herramientas:** azada, regadera, hacha y pico con niveles (más área, menos energía).
- **Automatización:** aspersores, comederos automáticos, cosechadoras, contratar ayudantes.
- **Infraestructura:** caminos (velocidad de movimiento), pozos, invernadero (cultivar fuera de estación).
- **Conocimiento:** recetas y técnicas aprendidas de los vecinos.

### 6.12 Objetivos y colección
- **Diario de la granja:** hitos suaves que guían ("Cosecha tu primer tomate", "Compra tu 5ª parcela").
- **Colección:** registro de cultivos, productos y peces (si se añade la pesca) descubiertos.
- **Tutorial integrado:** los primeros objetivos del diario hacen de tutorial.

### 6.13 Eventos
- **Uno por estación:** feria de primavera, concurso de verano, cosecha de otoño, mercado de invierno.
- **Aleatorios:** un visitante con semillas raras, una tormenta, un animal perdido o un pedido especial.

---

## 7. Online y multijugador (fases posteriores)

Objetivo: jugar **con amigos**, sin competencia agresiva. Se plantea por fases de menor a mayor coste técnico:

| Fase | Funcionalidad | Complejidad |
|---|---|---|
| **A. Nube** | Cuenta sencilla y partida guardada en la nube (jugar en PC y móvil) | Baja |
| **B. Social asíncrono** | Visitar la granja de un amigo (solo ver), dejar regalos, tablón de pedidos entre amigos, mercado compartido | Media |
| **C. Cooperativo en tiempo real** | Dos o más jugadores en la misma granja simultáneamente | Alta (experimental) |

**Implicación técnica desde el día 1:** la lógica del juego se diseña como un **núcleo determinista dirigido por comandos** (`ComprarParcela`, `Plantar`, `Cosechar`…). No cuesta casi nada hacerlo así desde el inicio y deja abierta la puerta a sincronizar partidas y validar en servidor más adelante.

---

## 8. Interfaz y experiencia

- **HUD mínimo:** hora/fecha/clima, dinero, energía/bienestar y herramienta activa.
- **Paneles:** inventario, tienda, diario, mapa del valle y ajustes.
- **Diseño *mobile-first*:** botones grandes, nada depende de *hover* y la interfaz se adapta a vertical y horizontal (el juego se recomienda en horizontal).
- **Accesibilidad:** tamaño de texto ajustable, paletas aptas para el daltonismo en los indicadores y teclas reasignables.
- **Idiomas:** español primero; los textos se externalizan desde el inicio para poder traducir.

---

## 9. Arte y audio

### Estilo
- 2D cenital 3/4, estilo *painted* o *pixel art* suave (se decide en el hito de prototipo de arte).
- Casilla base: 32×32 px (provisional).

### Pipeline con ComfyUI y Blender
| Recurso | Herramienta | Notas |
|---|---|---|
| Conceptos, *moodboard*, paleta | ComfyUI | Fijar estilo, *prompt* base y semillas, y documentarlos |
| *Tiles* de terreno | ComfyUI + retoque | Necesitan ser repetibles (*seamless*) |
| Cultivos (fases de crecimiento) | ComfyUI | Misma composición y encuadre para cada fase |
| Edificios | **Blender → render** con cámara fija 3/4 | Garantiza ángulo e iluminación coherentes y facilita los niveles de mejora |
| Personajes y animaciones | Blender (render de *sprites* por frames) o ComfyUI + retoque | Es el recurso más difícil de mantener coherente |
| Iconos de interfaz | ComfyUI | Estilo plano y legible a tamaño pequeño |

**Regla:** todo recurso tiene una ficha (*prompt*, semilla, modelo/LoRA o archivo `.blend`) en el repositorio para poder regenerarlo.
**Hasta tener arte final** se usan *placeholders* (formas y colores) para no bloquear el desarrollo.

### Audio
- Música ambiental relajada por estación; efectos para cada herramienta y acción.
- Fuentes: librerías con licencia libre (CC0 / CC-BY) al principio.

---

## 10. Técnica (resumen)

| Capa | Elección |
|---|---|
| Lenguaje | TypeScript |
| Build | Vite |
| Motor 2D | Phaser 3 |
| UI | DOM sobre el canvas (Preact) |
| Lógica | Núcleo TS puro, determinista y dirigido por comandos, sin dependencias del motor |
| Tests | Vitest (unitarios y de propiedades), Playwright (de extremo a extremo) |
| Datos | Contenido en JSON validado con esquemas |
| Guardado | IndexedDB local → nube en la fase online |
| Online (futuro) | Por decidir (p. ej. Supabase para la nube y lo social; Colyseus para el tiempo real) |
| Despliegue | GitHub Pages o Netlify + GitHub Actions, como PWA |

Las decisiones técnicas relevantes se registran como ADRs en `docs/adr/`.

### 10.1 Datos y guardado
Detalle completo en [ADR 0001](docs/adr/0001-persistencia.md).

- **Contenido del juego** (cultivos, edificios, precios): JSON en `data/`, dentro del repositorio. No usa base de datos.
- **Partida:** un documento JSON versionado guardado en **IndexedDB** (la base de datos del navegador). No hay servidor en el MVP y se juega sin conexión.
  - Guardado automático al dormir, 3 copias de seguridad rotativas y aviso si se detecta corrupción.
  - **Exportar e importar** la partida a un archivo para moverla entre PC y móvil.
  - Migraciones automáticas cuando cambia el formato: **una actualización nunca debe romper una partida**.
- **Online (Fase 3):** Supabase (PostgreSQL) para cuentas, partidas en la nube y funciones sociales.
- **Trampas:** en un jugador no se protege (es tu partida y todo lo del navegador se puede editar). En lo **compartido** con amigos (mercado, regalos, cooperativo), el **servidor es la autoridad** y valida cada operación.

---

## 11. Fuera del alcance del MVP

Materiales elaborados y escasos (el MVP solo usa madera y piedra), ruinas, planos, animales, vecinos con amistad, proyectos del pueblo, estaciones completas (el MVP usa una sola), clima avanzado, procesado, multijugador, pesca, minería y personalización avanzada del personaje.

---

## 12. Preguntas abiertas

- Título definitivo del juego y nombre del pueblo.
- Estilo final: *pixel art* o *painted*.
- ¿Hay una "meta" final (p. ej. una valoración al cabo de 3 años) o el juego es infinito?
- ¿Se puede elegir el pasado del protagonista (con pequeñas bonificaciones)?
- ¿Pesca o minería como actividades secundarias?
- ¿Avanza el tiempo cuando el juego está cerrado? (Propuesta: no.)
