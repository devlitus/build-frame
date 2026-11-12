# data/

Contenido del juego (cultivos, edificios, precios) en JSON validado con esquema (ADR 0001).
Los números de balance viven aquí, nunca en el código.

- `valle.json`: tamaño del valle (parcelas y casillas) y pesos de terreno, fertilidad, agua y desvío del río; se valida con valibot (ADR 0006).
- `tiempo.json`: reloj y calendario (minutos desde 00:00 de inicio y fin de jornada, días por estación, claves de estaciones, minutos reales por día a velocidad 1 y velocidades permitidas); se valida con valibot. Los nombres visibles de las estaciones irán en `es.json`.
- `personaje.json`: velocidad (casillas/s), lado de la caja de colisión, lado del valle donde está el pueblo (aparición) y tope de ms por comando de movimiento; se valida con valibot.
- `valle.json` también recoge el ancho del río, la densidad de árboles y rocas por terreno y los vados (cantidad y grosor).
