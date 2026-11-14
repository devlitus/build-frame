import * as v from 'valibot'
import {
  AGUAS,
  AGUAS_SIN_RIO,
  CATEGORIAS_OBJETO,
  FERTILIDADES,
  HERRAMIENTAS,
  LADOS,
  MATERIALES,
  OBJETOS,
  TERRENOS,
  TIPOS_EDIFICIO,
  ZONAS,
} from './claves.ts'

/** Tope de 64: 64×64 parcelas de 64×64 casillas ya son ~16 M casillas; más es inabarcable. */
const LIMITE_TAMANO = 64
const entero = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(LIMITE_TAMANO))
const peso = v.pipe(v.number(), v.finite(), v.minValue(0))

/** Pesos por clave: todos ≥ 0 y con suma > 0. */
function pesos<const K extends string>(claves: readonly K[]) {
  const forma = Object.fromEntries(claves.map((k) => [k, peso])) as Record<K, typeof peso>
  return v.pipe(
    v.strictObject(forma),
    v.check(
      (o) => Object.values<number>(o).reduce((a, b) => a + b, 0) > 0,
      'La suma de pesos debe ser > 0',
    ),
  )
}

const probabilidad = v.pipe(v.number(), v.minValue(0), v.maxValue(1))
const densidad = v.pipe(
  v.strictObject({ arbol: probabilidad, roca: probabilidad }),
  v.check((d) => d.arbol + d.roca <= 1, 'arbol + roca no puede superar 1'),
)

export const EsquemaConfigValle = v.strictObject({
  parcelasPorLado: entero,
  casillasPorParcela: entero,
  pesosTerreno: pesos(TERRENOS),
  pesosFertilidad: v.strictObject({
    prado: pesos(FERTILIDADES),
    bosque: pesos(FERTILIDADES),
    rocoso: pesos(FERTILIDADES),
  }),
  pesosAguaSinRio: pesos(AGUAS_SIN_RIO),
  probabilidadDesvioRio: probabilidad,
  /** Ancho del cauce del río, en casillas. */
  anchoRio: entero,
  /** Probabilidad por casilla de llevar un árbol o una roca, según el terreno. */
  densidadDecoracion: v.strictObject({ prado: densidad, bosque: densidad, rocoso: densidad }),
  /** Vados del río: cuántos (entre `min` y `max`) y cuántas casillas de grosor a lo largo del cauce. */
  vados: v.pipe(
    v.strictObject({ min: entero, max: entero, grosor: entero }),
    v.check((c) => c.max >= c.min, 'vados.max debe ser >= vados.min'),
  ),
})

export type ConfigValle = v.InferOutput<typeof EsquemaConfigValle>

const MINUTOS_POR_DIA = 1440
const VELOCIDAD_MAXIMA = 10
const enteroPositivo = v.pipe(v.number(), v.integer(), v.minValue(1))

export const EsquemaConfigTiempo = v.pipe(
  v.strictObject({
    /** Minutos desde 00:00 a los que empieza la jornada (06:00 = 360). */
    horaInicio: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MINUTOS_POR_DIA - 1)),
    /** Minutos desde 00:00 a los que acaba la jornada; puede pasar de 1440 (02:00 = 1560). */
    horaFin: enteroPositivo,
    diasPorEstacion: enteroPositivo,
    estaciones: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
    minutosRealesPorDia: v.pipe(v.number(), v.finite(), v.minValue(1)),
    velocidades: v.pipe(
      v.array(v.pipe(enteroPositivo, v.maxValue(VELOCIDAD_MAXIMA))),
      v.minLength(1),
    ),
  }),
  v.check((c) => c.horaFin > c.horaInicio, 'horaFin debe ser mayor que horaInicio'),
  v.check((c) => c.horaFin - c.horaInicio <= MINUTOS_POR_DIA, 'La jornada no dura más de 24 h'),
  v.check((c) => new Set(c.estaciones).size === c.estaciones.length, 'Estaciones repetidas'),
  v.check((c) => new Set(c.velocidades).size === c.velocidades.length, 'Velocidades repetidas'),
  v.check((c) => c.velocidades.includes(1), 'La velocidad 1 debe existir'),
)

export type ConfigTiempo = v.InferOutput<typeof EsquemaConfigTiempo>

export const EsquemaConfigPersonaje = v.strictObject({
  /** Velocidad al andar en recto, en casillas por segundo. */
  velocidadCasillasPorSegundo: v.pipe(v.number(), v.finite(), v.minValue(0.1), v.maxValue(30)),
  /** Lado de la caja de colisión (cuadrada), en casillas; < 1 para caber por pasillos de una casilla. */
  tamanoCaja: v.pipe(v.number(), v.minValue(0.1), v.maxValue(0.95)),
  /** Lado del valle donde está el pueblo: allí aparece el personaje (la entrada del valle). */
  ladoPueblo: v.picklist(LADOS),
  /** Casillas hacia dentro del valle, desde el borde del pueblo, a las que aparece el personaje. */
  margenAparicion: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(16)),
  /** Tope de ms que procesa un solo comando `MoverPersonaje` (evita efecto túnel y bucles largos). */
  maxMsPorComando: v.pipe(v.number(), v.finite(), v.minValue(1), v.maxValue(1000)),
})

export type ConfigPersonaje = v.InferOutput<typeof EsquemaConfigPersonaje>

/** Factor multiplicador estrictamente positivo. */
const factorPositivo = v.pipe(
  v.number(),
  v.finite(),
  v.check((n) => n > 0 && n <= 1000, 'El factor debe estar en (0, 1000]'),
)

function factores<const K extends string>(claves: readonly K[]) {
  const forma = Object.fromEntries(claves.map((k) => [k, factorPositivo])) as Record<
    K,
    typeof factorPositivo
  >
  return v.strictObject(forma)
}

/** Cantidad entera ≥ 0 por clave (dinero, materiales). */
const cantidad = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
function cantidades<const K extends string>(claves: readonly K[]) {
  const forma = Object.fromEntries(claves.map((k) => [k, cantidad])) as Record<K, typeof cantidad>
  return v.strictObject(forma)
}

export const EsquemaConfigEconomia = v.strictObject({
  /** Ahorros con los que empieza una partida nueva. */
  dineroInicial: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  /** Precio de una parcela de referencia (todos los factores a 1) antes de subidas. */
  precioBase: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(1_000_000)),
  factorTerreno: factores(TERRENOS),
  factorFertilidad: factores(FERTILIDADES),
  factorAgua: factores(AGUAS),
  /** Subida fraccionaria del precio por cada compra hecha (0.25 = +25 %). */
  subidaPorCompra: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(10)),
})

export type ConfigEconomia = v.InferOutput<typeof EsquemaConfigEconomia>

const diasDeObra = v.pipe(v.number(), v.safeInteger(), v.minValue(1))

export const EsquemaEdificio = v.strictObject({
  /** Huella en casillas (ancho × alto), sin rotación. */
  ancho: entero,
  alto: entero,
  /** Zonas sobre las que se puede colocar: todas las casillas de la huella deben tener una de ellas. */
  zonas: v.pipe(
    v.array(v.picklist(ZONAS)),
    v.minLength(1),
    v.check((z) => new Set(z).size === z.length, 'Zonas repetidas'),
  ),
  /** Coste: dinero y materiales, enteros ≥ 0. */
  coste: v.strictObject({ dinero: cantidad, madera: cantidad, piedra: cantidad }),
  /** Días de obra (≥ 1). */
  dias: diasDeObra,
  /** Solo puede haber uno en la partida (la casa). */
  unico: v.boolean(),
  /** ¿Se puede demoler? (la casa no). */
  demolible: v.boolean(),
})

export type DefEdificio = v.InferOutput<typeof EsquemaEdificio>

export const EsquemaConfigEdificios = v.strictObject({
  /** Lote de materiales de bienvenida con el que empieza una partida nueva (GDD §6.4). */
  materialesIniciales: cantidades(MATERIALES),
  /** Fracción del coste que se devuelve al demoler un edificio (0.5 = la mitad); la usa M4-06. */
  reembolsoDemolicion: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
  /**
   * Cómo se redondea cada cantidad reembolsada (sobre lo realmente pagado, `Edificio.pagado`):
   * `abajo` = al entero inferior. Un solo valor por ahora; lo usan M4-06 (cancelar y demoler).
   */
  redondeoReembolso: v.picklist(['abajo']),
  /** Catálogo: exactamente un registro por cada tipo de `TIPOS_EDIFICIO`. */
  edificios: v.strictObject(
    Object.fromEntries(TIPOS_EDIFICIO.map((t) => [t, EsquemaEdificio])) as Record<
      (typeof TIPOS_EDIFICIO)[number],
      typeof EsquemaEdificio
    >,
  ),
})

export type ConfigEdificios = v.InferOutput<typeof EsquemaConfigEdificios>

const ranurasEnteras = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(1000))
const idObjeto = v.picklist(OBJETOS)

export const EsquemaObjeto = v.strictObject({
  categoria: v.picklist(CATEGORIAS_OBJETO),
  /** Cantidad máxima de una ranura (≥ 1). */
  pilaMaxima: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(9999)),
})

export type DefObjeto = v.InferOutput<typeof EsquemaObjeto>

export const EsquemaConfigInventario = v.pipe(
  v.strictObject({
    /** Ranuras del inventario sin ningún edificio (≥ 1). */
    capacidadBase: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(1000)),
    /** Ranuras que suma cada edificio **terminado** de cada tipo (una obra o un demolido no suman). */
    ranurasPorEdificio: v.strictObject(
      Object.fromEntries(TIPOS_EDIFICIO.map((t) => [t, ranurasEnteras])) as Record<
        (typeof TIPOS_EDIFICIO)[number],
        typeof ranurasEnteras
      >,
    ),
    /** Herramienta activa al empezar una partida. */
    herramientaInicial: v.picklist(HERRAMIENTAS),
    /** Regalo de bienvenida (sin tienda hasta M6): objetos con los que empieza el inventario. */
    loteInicial: v.array(
      v.strictObject({
        objeto: idObjeto,
        cantidad: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
      }),
    ),
    /** Catálogo: exactamente un registro por cada objeto de `OBJETOS`. */
    objetos: v.strictObject(
      Object.fromEntries(OBJETOS.map((o) => [o, EsquemaObjeto])) as Record<
        (typeof OBJETOS)[number],
        typeof EsquemaObjeto
      >,
    ),
  }),
  v.check(
    (c) => new Set(c.loteInicial.map((l) => l.objeto)).size === c.loteInicial.length,
    'Objetos repetidos en el lote inicial',
  ),
  v.check((c) => {
    // El lote cabe en el inventario base, con las pilas completas y a lo sumo una incompleta por objeto.
    const ranuras = c.loteInicial.reduce(
      (n, l) => n + Math.ceil(l.cantidad / c.objetos[l.objeto].pilaMaxima),
      0,
    )
    return ranuras <= c.capacidadBase
  }, 'El lote inicial no cabe en la capacidad base'),
)

export type ConfigInventario = v.InferOutput<typeof EsquemaConfigInventario>
