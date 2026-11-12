# M2-05 Rompedor: modos Vida y Plano

Tests: `tests/e2e/modos-rompedor.spec.ts` (escritorio y móvil), `tests/prop/modos-rompedor.test.ts`.

## Fallos (tests que fallan)
- **S2** Girar o redimensionar en Modo Vida deja al personaje fuera de la pantalla. `ControlCamara.alRedimensionar` conserva el centro y `seguir()` solo persigue si el objetivo se mueve, así que con el personaje quieto (más aún junto al borde del valle, como en la aparición) no se recoloca. Medido: 50 px fuera en escritorio y 150 px en móvil (412x915 a 360x640). Test: `redimensionar y girar en Vida y en Plano...` (falla en escritorio y móvil). Arreglo: al redimensionar en Vida, activar `persiguiendo`.
- **S3** Ctrl+M y Alt+M (y Meta+M) cambian de modo: `keydown-M` no mira los modificadores. Test: `Ctrl+M, Alt+M y Meta+M no cambian de modo` (falla). Cmd+M minimiza en Mac y a la vez cambiaría de modo.

## Hallazgos sin test que falle
- S3 (valoración de `tests/e2e/personaje.spec.ts`): la aserción de M2-03 "la cámara se acerca al personaje" se sustituyó por "el personaje no sale de la pantalla", mucho más débil (casi siempre cierta). Está justificado, porque la cámara ya empieza centrada, pero conviene una aserción más fuerte: distancia cámara-personaje < N px tras detenerse.
- S3 accesibilidad: el botón es a la vez `aria-pressed` y cambia de `aria-label`; un lector dice "Modo de juego: Plano. Cambiar al Modo Vida, pulsado", doble semántica. Mejor un solo patrón. El nombre sí contiene el texto visible (WCAG 2.5.3), el contraste cumple AA (test) y existe `:focus-visible`.
- S3 diseño: tras `?modo=plano` + pasar a Vida, `reiniciarValle` (solo debug) vuelve a Plano porque `modoInicial` se conserva. Irrelevante hoy.
- S3 visual: en Vida (`semilla-42--*`) el personaje aparece pegado al borde inferior del lienzo (círculo de unos 14 px casi tocando el borde), sin margen. En móvil vertical queda donde puede tapar la barra de gestos. El botón (48 px, abajo a la derecha) no lo tapa, pero conviene un margen de seguridad. Botón legible y sin solapes en las tres vistas. En Plano de escritorio (captura propia) el botón marrón con texto crema se lee bien.
- S3 herramienta: `npm run capturas -- "/?semilla=42&modo=plano"` produce la portada en las tres vistas, pero la misma URL cargada con Playwright va al valle en Plano. No es un fallo de la app: el script de capturas (o cómo npm pasa el `&` en Windows) parece perder el segundo parámetro. Ya se vio algo parecido en M2-03. Para verificar Plano visualmente hay que usar un script propio.
- Zona segura: `#ui` ya tiene `padding: env(safe-area-inset-*)`, y el botón va a 12 px dentro de él, así que respeta notch y barra inferior (no verificable con el emulador de Playwright).

## Atacado y resiste
- Cambio de modo con tecla de movimiento mantenida (d/s/a/w): `soltar()` evita que siga andando al volver a Vida.
- Cambio de modo a mitad de arrastre de ratón (Plano a Vida): sin salto de cámara, acaba sobre el personaje. Y a mitad de pellizco táctil (CDP).
- M con foco en el botón: una sola vez. Enter con auto-repetición y Espacio: un solo cambio. M mantenida: una sola vez (`repeat`).
- Toque en el botón en móvil: no mueve ni hace zoom de la cámara y cambia una sola vez. Arrastre iniciado sobre el botón y soltado fuera: no cambia de modo.
- Propiedades fast-check (200 casos): `pausado` solo lo cambian Pausar/Reanudar, volver a Vida lo deja como lo dejó el jugador, en Plano `AvanzarTiempo` y `Mover` devuelven el mismo estado, modos inválidos (`__proto__`, `toString`, null...) se rechazan.
- Reiniciar la escena 3 veces en Plano: botón y estado coherentes, cámara correcta (sin errores de consola).
- Aparición: 10 semillas (incluida 0 y 4294967295) en 3 tamaños de escritorio y uno móvil, personaje siempre dentro de la vista al empezar.
- Teclado en Plano: zoom `+`/`-` mantenido varios segundos y desplazamiento en 4 direcciones con zoom alto no sacan la cámara del valle ni dan errores.
- Cambios de modo rápidos: sin errores de consola.
- M1: `git diff` de `tests/e2e/` confirma que en los e2e de M1 solo cambiaron las URL (`&modo=plano`), ninguna aserción.

## Notas
Los e2e usan `expect.poll` y esperas amplias; con 8 workers pasaron todos salvo los dos fallos buscados. Un intento mío inicial fue flaky (esperar 200 ms al reencuadre de Vida tras la rueda) y se corrigió con espera de 1,5 s; en Vida la cámara reencuadra suavemente tras el zoom.
