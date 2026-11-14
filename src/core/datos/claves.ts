/** Única fuente de las claves de los atributos de parcela: los tipos y el esquema derivan de aquí. */
export const TERRENOS = ['prado', 'bosque', 'rocoso'] as const
export const FERTILIDADES = ['baja', 'media', 'alta'] as const
export const AGUAS_SIN_RIO = ['pozo', 'seca'] as const
export const AGUAS = ['rio', ...AGUAS_SIN_RIO] as const
export const ESTADOS_PARCELA = ['en-venta', 'propia'] as const
/** Los cuatro lados del valle; también las orientaciones del personaje. */
export const LADOS = ['norte', 'sur', 'este', 'oeste'] as const
/** Zonas que el jugador pinta sobre sus parcelas (GDD §6.3). */
export const ZONAS = ['cultivo', 'huerto', 'vivienda', 'almacen'] as const
/** Tipos de edificio del catálogo (`data/edificios.json`); la clave de cada uno. */
export const TIPOS_EDIFICIO = ['casa', 'caja-envio', 'cobertizo'] as const
/** Materiales de construcción que guarda el estado (GDD §6.4). */
export const MATERIALES = ['madera', 'piedra'] as const
/**
 * Herramientas del Modo Vida (GDD §6.11), en el orden de las teclas 1 a 6 y de la barra táctil.
 * No ocupan ranuras del inventario.
 */
export const HERRAMIENTAS = ['azada', 'regadera', 'semillas', 'mano', 'hacha', 'pico'] as const
/** Estaciones del calendario (claves de `data/tiempo.json`); los cultivos declaran en cuáles crecen. */
export const ESTACIONES = ['primavera', 'verano', 'otono', 'invierno'] as const
/** Cultivos del juego; sus datos (crecimiento, precio...) están en `data/cultivos.json`. */
export const CULTIVOS = ['patata', 'zanahoria', 'lechuga', 'rabano', 'fresa'] as const
/**
 * Objetos que pueden ir en el inventario (catálogo en `data/inventario.json`): la semilla y el
 * producto de cada cultivo, y el plantón. Madera y piedra no son objetos: viven en `materiales`.
 */
export const OBJETOS = [
  ...CULTIVOS.map((c) => `semilla-${c}` as const),
  ...CULTIVOS,
  'planton',
] as const
/** Qué es un objeto: la semilla se planta, el producto se cosecha y el plantón se trasplanta. */
export const CATEGORIAS_OBJETO = ['semilla', 'producto', 'planton'] as const
