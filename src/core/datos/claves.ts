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
