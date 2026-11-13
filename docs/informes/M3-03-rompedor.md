# M3-03 · Informe del rompedor

Tests nuevos:
- `tests/e2e/seleccion-rompedor.spec.ts` (e2e en escritorio y móvil; 3 de los 9 tests fallan a propósito en uno o en los dos proyectos).
- `tests/unit/seleccion-rompedor.test.ts` (3 tests de propiedades sobre `picking.ts`; pasan).

`npm run check`: lint, formato, tipos y los 494 tests unitarios pasan. Los e2e no forman parte del check, y los fallos de abajo son de e2e.

## Fallos

- S2 · **La parcela seleccionada queda tapada por el panel (o por el HUD) cuando está en una esquina o un borde.** La cámara no puede centrarla porque `limitarVista` la clampa al valle, y la guía no cuenta con eso.
  - Escritorio: la parcela 5 (F1, arriba a la derecha) se ve un 16 %, tapada por el panel.
  - Móvil horizontal: las parcelas 30 a 35 (fila inferior) se ven entre un 23 % y un 28 %. La 35 (F6) casi no se ve: solo asoma una franja bajo el panel y el botón «Plano».
  - Esto incumple el criterio «el panel no tapa la parcela seleccionada».
  - Test: «cada parcela seleccionada queda al menos medio visible, sin panel ni HUD encima» (falla en escritorio y en móvil). Capturas: `semilla-42-debug-modo-plano-seleccion-35--movil-horizontal.png` y `...-seleccion-0--movil-vertical.png`.
  - Arreglo posible: añadir un margen (padding) en el valle o permitir que la cámara se salga del valle mientras haya panel abierto.
- S2 · **Rotar el móvil con el panel abierto deja la parcela tapada.** La parcela 14 pasa de verse bien en vertical a verse un 9 % al girar a horizontal (839×412). Hay que volver a guiar la cámara al cambiar el tamaño de pantalla. Test: «rotar con el panel abierto deja la parcela visible» (móvil).
- S3 · **La reserva fija de 72 px del HUD superior no cuenta con el HUD de dos filas.** En móvil vertical con `?debug` la segunda fila (pausa, x1, x2, x3) tapa el borde superior de la parcela.
  - Captura: `semilla-42-debug-modo-plano-seleccion-14--movil-vertical.png`. Es lo mismo que dudaba el implementador.
  - En `...propias-14-15-seleccion-15--movil-vertical.png` el HUD tapa el borde superior de la parcela (el borde, no el contenido).
  - En `...seleccion-0--movil-vertical.png` el HUD tapa buena parte de la parcela, aunque esa es una esquina y entra en el fallo de arriba.
  - En móvil horizontal, el reloj tapa una esquina de la parcela 14 (`...seleccion-14--movil-horizontal.png`).
- S3 · **`?debug&propias=` solo cambia el dibujo; el estado y el panel no se enteran.** Con `?propias=14,15&seleccion=15`, la parcela 15 se dibuja como propia pero `parcelaInfo(15).estado` es `en-venta` y el panel dice «Se puede comprar» con precio, no «Tuya». Es una inconsistencia entre lo que se ve y lo que se informa, y deja sin gancho de depuración el caso «Tuya» (y el de no adyacente) para las capturas y los e2e. Hay que aplicar las propias al estado del núcleo (o avisar de que son solo visuales). Test: «con ?propias=14,15 la parcela 15 figura como propia y el panel dice «Tuya»» (falla en los dos proyectos).

## Resiste
- **Picking** (fast-check, 2000 casos por propiedad): el punto de toque de cualquier parcela, con cualquier zoom (0,2 a 4), cualquier desplazamiento y cualquier pantalla, cae en esa misma parcela. Con `centroParaVer`, una parcela que cabe queda siempre tocable. Los bordes son semiabiertos (640 es de la siguiente; 639,999… es de la anterior; 3840 y -1e-12 quedan fuera).
- **Táctil, con CDP real:**
  - un toque largo de 500 ms quieto no selecciona;
  - un pellizco que termina levantando un dedo y luego el otro no selecciona;
  - el toque corto siguiente a un pellizco sí selecciona (no queda atascado en «anulado»).
- **Esc** con el foco en un botón del HUD deselecciona.
- **Panel reactivo:** al comprar con el comando `ComprarParcela` otra parcela, el precio mostrado sube a la vez que `parcelaInfo`; al comprar la propia, pasa a «Tuya».
- **Fugas:** al reabrir el valle 5 veces con una parcela seleccionada, `objetosValle` y `graficosValle` quedan como al principio, no hay errores de consola, y el Esc y la selección siguen funcionando.
- **Accesibilidad:** el botón «Cerrar» mide al menos 44 px y el panel tiene `role=region` con `aria-labelledby`. Visualmente el texto es legible y no depende solo del color (icono, puntos y texto).

## Observaciones (sin test)
- Los símbolos son emoji, y su aspecto depende del sistema. En el Chromium de pruebas se ven bien; el de fertilidad (●○○) es texto. El nombre «C3» (letra y número) se lee bien en las capturas, aunque convendría explicarlo en alguna ayuda.
- Tras llegar a un borde, la guía puede quedar con un objetivo inalcanzable (el centro está clampado): sigue activa, sin efecto visible, hasta el siguiente gesto. Es inocuo, pero conviene limpiarla cuando la distancia deja de reducirse.
- Con `Seleccion.deseleccionar()` en un estado ya deseleccionado, `ocupado` no se limpia; hoy no se puede dar porque el panel lo libera al desmontarse.
- Rendimiento: las capturas con la selección muestran de 37 a 53 fps con la máquina cargada por otras sesiones. No se hornea el valle al seleccionar (solo se redibuja un `Graphics`). No medido con rigor.
- La captura de `propias=14;seleccion=20` agotó el tiempo de `page.goto` por la carga de la máquina; no se repitió.

## Capturas revisadas
Ruta base: `/?semilla=42&debug&modo=plano&seleccion=N` (escritorio, móvil horizontal y móvil vertical), para N = 14, 0, 35, y `propias=14,15` con N = 15. Sin `?debug` no se pudo capturar con la selección porque no hay gancho que la abra; se cubre con los e2e del implementador.

Las tres más representativas:
1. `capturas/semilla-42-debug-modo-plano-seleccion-14--movil-vertical.png`: panel como hoja inferior, legible, con el botón de 44 px; el HUD de dos filas toca el borde de la parcela (S3).
2. `capturas/semilla-42-debug-modo-plano-seleccion-35--movil-horizontal.png`: la parcela F6 casi tapada por el panel y el botón «Plano» (S2).
3. `capturas/semilla-42-debug-modo-plano-seleccion-14--escritorio.png`: el caso bueno, con la parcela centrada, resaltada con doble contorno y el panel a la derecha sin tapar nada.
