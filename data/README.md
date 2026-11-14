# data/

Contenido del juego (cultivos, edificios, precios) en JSON validado con esquema (ADR 0001).
Los números de balance viven aquí, nunca en el código.

- `valle.json`: tamaño del valle (parcelas y casillas) y pesos de terreno, fertilidad, agua y desvío del río; se valida con valibot (ADR 0006).
- `tiempo.json`: reloj y calendario (minutos desde 00:00 de inicio y fin de jornada, días por estación, claves de estaciones, minutos reales por día a velocidad 1 y velocidades permitidas); se valida con valibot. Los nombres visibles de las estaciones irán en `es.json`.
- `personaje.json`: velocidad (casillas/s), lado de la caja de colisión, lado del valle donde está el pueblo (aparición) y tope de ms por comando de movimiento; se valida con valibot.
- `valle.json` también recoge el ancho del río, la densidad de árboles y rocas por terreno y los vados (cantidad y grosor).
- `economia.json`: ahorros iniciales (`dineroInicial`), precio base de una parcela, factores multiplicadores por terreno, fertilidad y agua, y subida porcentual del precio por cada parcela ya comprada (`subidaPorCompra`); se valida con valibot (GDD §6.2).
- `edificios.json`: lote de materiales de bienvenida (`materialesIniciales`), fracción que se reembolsa al demoler (`reembolsoDemolicion`), su redondeo (`redondeoReembolso`, hoy solo `abajo`) y catálogo `edificios` por tipo (`casa`, `caja-envio`, `cobertizo`): huella (`ancho`×`alto`), zonas compatibles, coste (dinero, madera, piedra), días de obra, `unico` y `demolible`; se valida con valibot (GDD §6.3–6.5).
- `inventario.json`: capacidad base del inventario (`capacidadBase`), ranuras que suma cada edificio terminado (`ranurasPorEdificio`; hoy solo el cobertizo), herramienta inicial, lote de regalo (`loteInicial`) y catálogo `objetos` (semilla y producto de cada cultivo, plantón) con su categoría y pila máxima; se valida con valibot (GDD §6.11 y §8). Madera y piedra no son objetos: van en `materiales`.
- `energia.json`: energía máxima (`maximo`), fracción del máximo con la que se despierta tras un desmayo (`desmayoFraccion`, se redondea hacia abajo) y coste por golpe de cada herramienta (`costes`); se valida con valibot (GDD §6.8).
