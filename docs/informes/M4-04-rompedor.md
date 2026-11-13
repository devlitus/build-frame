# M4-04 · Pincel de zonas · Informe del Rompedor

Rama `feat/M4-04-pincel-zonas`. Tests nuevos: `tests/e2e/pincel-rompedor.spec.ts` (escritorio y móvil, 2 workers).
Resultado: 16 tests en escritorio (14 ok, 2 fallan a propósito) y 2 de móvil ok.

## Fallos

| # | Sev. | Qué pasa | Prueba |
| --- | --- | --- | --- |
| 1 | S3 | Cerrar la barra con **Listo desde el teclado** (Tab hasta Listo y Enter) deja el foco en `<body>`. `BarraZonas` quiere devolverlo al lienzo en el cleanup del `useLayoutEffect`, pero cuando corre el botón ya se ha quitado del DOM y `el.contains(document.activeElement)` da false. Un usuario de teclado o de lector de pantalla pierde su sitio y tiene que tabular desde el principio. | `teclado: cerrar la barra con Listo (teclado) devuelve el foco al lienzo` |
| 2 | S3 | **Rendimiento**: pintar el valle entero en una sola pincelada es un tirón de 200 a 600 ms (medio ~350 ms en esta máquina con 2 workers). Un rectángulo de 8x8 tarda ~80 ms en 2 fotogramas. Se rehornean los 36 trozos con `Graphics` de líneas de patrón (`strokePath` por tramo). En un móvil flojo será peor. Depende de la máquina: umbral de 200 ms de media. | `pintar todo el valle repetidamente no hunde los fps` |

## Visual (capturas en `capturas/`, no versionadas; las genera el último test del spec)

Revisadas las nueve: `zonas-plano--*`, `zonas-barra--*`, `zonas-vida--*` en escritorio, móvil horizontal y móvil vertical.

- La barra se lee bien en las tres vistas y no tapa el cursor (el cursor sube por la guía de cámara). En móvil vertical ocupa dos filas, unos 100 px, y no tapa HUD ni «Plano». En móvil horizontal ocupa una fila y tapa ~65 px de los 412 de alto: aceptable.
- Los patrones se distinguen entre sí (surcos, puntos, diagonal, cuadrícula). Los botones miden 48 px.
- Vista previa y esquina marcada: visibles, con doble contorno.
- **S3 visual** (`zonas-plano--movil-vertical.png`, `zonas-plano--escritorio.png`): la diagonal azul de «Vivienda» y el río (azul claro plano) comparten tono; el patrón evita la confusión, pero en miniatura se parecen. No es bloqueante.
- Vida (`zonas-vida--*`): tono suave visible, no tapa el valle.

## Atacado sin encontrar nada (y por qué resiste)

- Segundo dedo a mitad de un pintado: `PintorZonas` pasa a `anulado`, no pinta al levantar ninguno de los dos dedos y se recupera con el siguiente gesto de un dedo (test de móvil).
- `touchcancel` a mitad de un arrastre: no pinta (`wasCanceled`) y no deja vista previa.
- Cambiar de modo a mitad de un arrastre: `Partida.emitir` cierra el pincel y el pintor se reinicia; al volver, se puede pintar sin errores.
- Cerrar la barra con un arrastre en curso: no pinta y no queda vista previa fantasma; un movimiento del ratón sin botón no arrastra.
- Soltar el ratón fuera de la pantalla: `pointerupoutside` y `casillaMasCercana` acotan sin errores de página.
- Rectángulo sobre parcela propia y ajena: solo se pintan las casillas propias (y el río queda sin pintar: por eso son 60 de 64, regla correcta del núcleo).
- Teclado: el cursor se queda clavado en 0,0 y en el borde opuesto. Se puede pintar la esquina 0,0. La repetición de Enter marca una sola vez. Enter, Espacio y flechas sin herramienta no hacen nada. Al bajar el cursor con flechas, la cámara lo mantiene sobre la barra con y sin panel de parcela previo (`ocupado` bien).
- 15 rondas de pintar y borrar con rectángulos que cruzan trozos: el número de texturas y de objetos vuelve exactamente al inicial tras borrar todo.
- Pérdida y recuperación del contexto WebGL con zonas pintadas: la captura posterior coincide con la anterior (diferencia en el nivel del ruido).
- Cámara con dos dedos: el desplazamiento y el zoom siguen funcionando con el pincel activo. Un test intermedio de «levantar un dedo y mover el otro» lo descarté: el rebote de la cámara tras soltar lo hacía depender del tiempo y no era un fallo.

## Notas

- Esc con la barra abierta y nada marcado solo deselecciona parcela: no cierra la barra. Es una decisión de diseño, no un fallo.
- `capturas/` no se versiona; los PNG se regeneran lanzando el spec.
