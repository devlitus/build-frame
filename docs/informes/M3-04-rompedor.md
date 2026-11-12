# M3-04 · Informe del rompedor

Tests nuevos:
- `tests/e2e/compra-rompedor.spec.ts`: 29 tests, que dan 58 ejecuciones entre escritorio y móvil. Fallan 9 a propósito; el resto pasa o se omite por proyecto.
- `tests/unit/compra-rompedor.test.ts`: 7 tests, con propiedades fast-check y partidas simuladas. Falla 1 a propósito.

`npm run check`: lint, formato y tipos pasan. Los tests dan 526 en verde y 1 en rojo, el de `formatearDinero` con 1e21. El build no llega a ejecutarse porque falla ese test.

Además se pasaron `compra-parcela`, `seleccion-parcela`, `seleccion-rompedor` y `humo` en escritorio y móvil: 71 pasan y 5 se omiten. Los fallos de M3-03 en `seleccion-rompedor` ya no se dan.

## Fallos

- S2 · **Un doble toque (o doble clic) en «Comprar por N» compra sin confirmar en el móvil vertical.**
  - La hoja inferior crece hacia arriba, así que el botón «Comprar» de la confirmación aparece justo bajo el dedo, en la mitad derecha del antiguo «Comprar por N».
  - El segundo toque confirma sin que se haya podido leer la pregunta.
  - Se probó un doble clic en el 25, 50, 75 y 90 % del ancho del botón: compran el 75 y el 90 %. Con dos `touchscreen.tap` separados 120 ms también compra.
  - En escritorio y en móvil horizontal el panel crece hacia abajo y no pasa.
  - Tests:
    - «doble clic en «Comprar por N» (x=0.75) no compra sin confirmar»;
    - «… (x=0.9) …»;
    - «dos toques rápidos en «Comprar por N» no compran sin confirmar» (móvil).
  - Captura: `capturas/rompedor-confirmacion--movil-vertical.png` (se ve «Comprar» donde estaba la mitad derecha del botón).
  - Arreglo posible: no aceptar la confirmación durante unos 300-400 ms tras abrirla, o poner «Cancelar» a la derecha y «Comprar» a la izquierda.
- S3 · **Un doble clic en «Comprar» (confirmar) selecciona otra parcela en escritorio.**
  - Al comprar, el panel encoge (desaparecen la confirmación y el botón), así que el segundo clic cae en el lienzo y selecciona la parcela que hay debajo (16 en vez de 14).
  - El panel de la parcela recién comprada se cierra y el jugador pierde el «Ya es tuya».
  - El dinero se cobra una sola vez.
  - Test: «doble clic en «Comprar» (confirmar) compra una vez y no cambia la selección» (escritorio).
- S3 · **Esc con la confirmación abierta y el foco en el lienzo cierra el panel entero.**
  - Es la duda que dejó el implementador.
  - Con el foco dentro del panel, el primer Esc cancela y el segundo cierra, pero con el foco en el lienzo (tras arrastrar la cámara o hacer clic en el mapa) el manejador de Phaser deselecciona directamente.
  - No se pierde dinero ni se compra nada, solo es incoherente: por eso S3.
  - Test: «con la confirmación abierta y el foco en el lienzo, Esc cancela antes de cerrar» (escritorio).
- S3 · **En el móvil horizontal bajo, «Comprar por N» queda por debajo del borde del panel y solo se ve desplazando el panel.**
  - Con `?debug` (HUD de dos filas, `max-height: calc(100% - 172px)`) pasa en 740×360, 667×375 y 640×320.
  - Sin `?debug` pasa solo en 640×320. En 740×360 y 667×375 sí cabe, y en 915×412 cabe siempre.
  - En 740×360 el atributo «Precio» se parte en dos líneas («Precio / 1.380 monedas»), lo que roba la altura que falta.
  - Tests: «740x360 con ?debug: …», «667x375 con ?debug: …», «640x320 con ?debug: …» y «640x320: …» (móvil).
  - Captura: `capturas/rompedor-panel--movil-horizontal-740x360.png`, con el botón cortado por la mitad.
- S3 · **`formatearDinero` da «1e+21» con enteros de 22 cifras o más.**
  - `String(n)` pasa a notación científica.
  - Por comandos no se llega, porque el núcleo exige enteros seguros. Sí se llegaría con un estado corrupto, y el contrato de la función dice «entero con punto de millar».
  - Test unitario: «enteros enormes (fuera de los seguros) siguen saliendo con puntos, sin notación científica».

### Visuales (sin test, por captura)
- S3 · **La etiqueta de estado «✓ Se puede comprar» tiene el mismo relleno oscuro y la misma forma que el botón «Comprar por N», justo debajo.**
  - Son dos barras iguales seguidas, y la primera parece un botón que no hace nada al tocarlo. Es la segunda duda del implementador; confirmo que confunde.
  - Capturas: `semilla-42-debug-modo-plano-propias-14-15-seleccion-16-dinero-5000--movil-vertical.png` y `rompedor-confirmacion--movil-vertical.png`.
  - Arreglo posible: dar a la etiqueta un fondo claro con borde, como el tono «no».
- S3 · **La moneda de «se vende» va en la esquina superior izquierda de cada parcela, que es justo donde está el HUD (reloj y dinero) en las tres vistas.**
  - En las parcelas de la fila superior o de la columna izquierda, la moneda queda medio tapada.
  - Capturas: `semilla-42-debug-modo-plano--escritorio.png` (moneda bajo el reloj), `semilla-42-debug-modo-plano--movil-vertical.png` (la segunda fila del HUD pisa una moneda) y `…seleccion-16-dinero-5000--movil-horizontal.png` (la moneda de E3 asoma bajo el dinero).
  - Como el rayado y el borde discontinuo siguen viéndose, el estado se distingue igualmente.
- S3 (observación) · En la parcela seleccionada, el resalte de doble trazo sustituye al borde discontinuo de «comprable». Solo queda la moneda como pista sin color de que se puede comprar, y si el HUD la tapa (ver arriba) no queda ninguna. El panel lo dice en texto, así que no bloquea.

## Resiste
- **Partidas simuladas sobre el núcleo** (fast-check, 300 casos): secuencias de hasta 40 pasos con compras de índices -2..40, tiempo, y cambios sueltos de `comprasHechas` o de `dinero` vía `reemplazar`. En todos los casos:
  - `intentarCompra` es ok ⇔ `parcelaComprable` es comprable;
  - si la compra se rechaza, el estado no cambia (misma referencia);
  - el dinero es igual al inicial menos lo gastado (más los ajustes) y nunca es negativo;
  - el clasificador con memoria devuelve siempre lo mismo que `clasificarParcelas`, también cuando solo cambia `comprasHechas`.
- **Comprar sin parar hasta quedarse sin dinero**, con 0, 299, 1.100, 5.000 y 1e9 monedas: termina en un máximo de 36 compras y al final nada es comprable. Con 1e9 compra las 36.
- **Partida simulada por la interfaz** (escritorio y móvil): con 1.100 monedas se compra con clics reales hasta que no queda nada comprable. Tras cada compra:
  - el HUD (`.dinero-cifra` y `data-dinero`), `__raices.dinero()` y `parcelaInfo(*).dinero` coinciden;
  - el estado visual de las 36 parcelas coincide con `parcelaComprable`;
  - la pregunta dice «Te quedarán M» con el resto exacto;
  - el aviso dice «comprada por N»;
  - no hay errores de consola.
- **Botón desactivado** (`aria-disabled`): no abre la confirmación ni gasta con clic forzado, Enter, Espacio ni toque. Sigue siendo enfocable y tiene `aria-describedby` hacia el motivo.
- **Enter mantenido** en «Comprar por N» no compra: la segunda pulsación cae en «Cancelar», que tiene el foco.
- **Carrera entre la confirmación y el estado:** se compra otra parcela no adyacente y se pulsa «Comprar» en la misma tarea, antes de que Preact repinte.
  - Sale `role=alert` con «debe tocar una de tus parcelas», visible.
  - El dinero solo baja la compra buena.
  - El foco vuelve a «Comprar por N», que queda desactivado.
- **Si el precio sube con la confirmación abierta**, la pregunta se actualiza («por N… Te quedarán M») y se cobra el precio nuevo, que es el que se ve.
- **Repintado** (`repintadosParcelas`): no cambia en 800 ms de Vida con el reloj en marcha, ni en Plano quieto, ni al mover la cámara con las flechas. Al cambiar de modo sube exactamente en 1, y al comprar también (ya lo probaba el implementador).
- **Rotar con la confirmación abierta** (vertical, horizontal y vuelta): la confirmación sigue abierta, «Cancelar» y «Comprar» quedan dentro de la ventana, sin nada encima y con 44 px o más, y se puede comprar después.
- **HUD de dinero** con 0, 999, 1.000, 1.000.000 y 999.999.999, en escritorio y móvil: la cifra sale con puntos, no se recorta y no pisa el reloj, los controles de tiempo, el botón de modo ni el contador de fps.
  - En la captura con 1.234.567 en móvil vertical cabe holgado.
  - `formatearDinero` vale con cualquier entero seguro (2000 casos): grupos de 3, y quitando los puntos se recupera el número. `-0` y `-0,4` dan «0».
- **El aviso de compra** no pisa el dinero, el reloj ni el panel. Va a la izquierda, bajo el HUD: `rompedor-tras-compra--escritorio.png`.
- **Textos:** todos los motivos de rechazo tienen texto, y «te faltan N» es exactamente precio − dinero, con punto de millar.

## Observaciones (sin test o con test que pasa)
- Si se confirma dos veces en la misma tarea (dos `click()` sintéticos seguidos), se cobra una sola vez, pero luego aparece «No se pudo comprar: la parcela ya es tuya» bajo una compra buena. Con entrada real no se da, porque Preact repinta en una microtarea entre eventos. Lo mismo pasa con «cambiar a Vida y confirmar en la misma tarea»: la compra se hace sin panel, pero el dinero cuadra. Hay tests que lo documentan y pasan.
- `repintarParcelas` compara valle, dinero y modo, pero no `comprasHechas`, aunque el clasificador sí lo tiene en su memo. Hoy no se nota, porque toda compra cambia el valle. Si en el futuro algo cambiara solo `comprasHechas` (cargar o depurar), el dibujo quedaría viejo.
- fps: las capturas muestran entre 31 y 47 fps en Plano con el rayado de 36 parcelas, con la máquina cargada por otras sesiones, y lo mismo en Vida. No se aprecia caída por el rayado. No medido con rigor.
- `npm run capturas` agotó dos veces el `page.goto` de 30 s por la carga de la máquina. Las rutas que faltaban se repitieron con `node scripts/capturas.mjs` sobre el mismo build. Las capturas con la confirmación abierta (`rompedor-*`) se hicieron con un script de Playwright aparte, porque `capturas` no hace clics.

## Capturas revisadas
Rutas, todas en escritorio, móvil horizontal y móvil vertical:
- `/?semilla=42&debug&modo=plano` (sin selección);
- `…&propias=14,15&seleccion=16`, con y sin `&dinero=5000`;
- `/?semilla=42&debug` (Vida);
- `…&propias=14,15&seleccion=0` (no comprable seleccionada);
- `…&propias=14,15&dinero=1234567`;
- `/?semilla=42&modo=plano` (sin debug; faltó la vista vertical por el tiempo de espera).

Más `rompedor-confirmacion--*`, `rompedor-tras-compra--*` y `rompedor-panel--movil-horizontal-740x360.png`.

Los tres estados se distinguen sin color:
- propia: borde dorado continuo y grueso;
- comprable: borde crema discontinuo y moneda;
- no comprable: velo oscuro y rayado diagonal.

Las tres más representativas para la PO:
1. `capturas/rompedor-confirmacion--movil-vertical.png`: la confirmación en la hoja inferior. Se lee bien, pero «Comprar» cae donde estaba «Comprar por N» (S2), y «Se puede comprar» parece un botón (S3).
2. `capturas/rompedor-tras-compra--escritorio.png`: el caso bueno tras comprar. El HUD baja a 3.620, el aviso «¡Parcela E3 comprada por 1.380 monedas!», «Ya es tuya» en el panel y las nuevas vecinas comprables con borde discontinuo y moneda.
3. `capturas/rompedor-panel--movil-horizontal-740x360.png`: con `?debug` en un móvil horizontal bajo, el botón «Comprar por N» cortado por el borde del panel (S3).
