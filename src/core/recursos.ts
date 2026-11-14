import { CONFIG_PERSONAJE } from './datos/personaje'
import { CONFIG_RECURSOS } from './datos/recursos'
import type { Obstaculo } from './decoracion'
import type { EstadoJuego } from './estado'
import type { EfectoHerramienta, EventoHerramienta, ResultadoEfecto } from './herramientas'
import {
  anadirObjeto,
  capacidadInventario,
  cantidadDe,
  inventarioValido,
  quitarObjeto,
} from './inventario'
import { casillaBloqueada, ladoValle, mapaTransitabilidad } from './mapa'
import { claveCasilla } from './rio'
import { siguienteAleatorio } from './rng'
import type { Terreno } from './valle'
import { casillaConEdificio, zonaEn } from './zonas'

/*
 * Talar, picar y replantar (M5-06). Los obstáculos del estado (`estado.obstaculos`) son los árboles,
 * rocas y plantones del valle; cada golpe de hacha o pico suma uno a su `golpes` y, al llegar a los
 * que pide su terreno (`data/recursos.json`), se quita y da su botín. Todo en funciones puras.
 */

/** Parcela que contiene la casilla global (x, y), o `undefined` si cae fuera del valle. */
function parcelaDeCasilla(estado: Pick<EstadoJuego, 'valle'>, x: number, y: number) {
  const { valle } = estado
  const c = valle.casillasPorParcela
  if (x < 0 || y < 0 || x >= c * valle.parcelasPorLado || y >= c * valle.parcelasPorLado) {
    return undefined
  }
  return valle.parcelas[Math.floor(y / c) * valle.parcelasPorLado + Math.floor(x / c)]
}

/** Terreno de la parcela que contiene la casilla global (x, y), o `undefined` si cae fuera. */
export function terrenoDeCasilla(
  estado: Pick<EstadoJuego, 'valle'>,
  x: number,
  y: number,
): Terreno | undefined {
  return parcelaDeCasilla(estado, x, y)?.terreno
}

/** ¿Es la casilla (x, y) de una parcela comprada? */
export function casillaPropia(estado: Pick<EstadoJuego, 'valle'>, x: number, y: number): boolean {
  return parcelaDeCasilla(estado, x, y)?.estado === 'propia'
}

/** Golpes que cuesta quitar el obstáculo en su terreno (plantón: uno). */
export function golpesNecesarios(o: Pick<Obstaculo, 'tipo'>, terreno: Terreno): number {
  if (o.tipo === 'arbol') return CONFIG_RECURSOS.arbol.golpes[terreno]
  if (o.tipo === 'roca') return CONFIG_RECURSOS.roca.golpes[terreno]
  return 1
}

/** Obstáculo de la casilla, si lo hay. */
export function obstaculoEn(
  estado: Pick<EstadoJuego, 'obstaculos'>,
  x: number,
  y: number,
): Obstaculo | undefined {
  return estado.obstaculos.find((o) => o.x === x && o.y === y)
}

/** ¿Golpearía la herramienta activa (hacha o pico) un obstáculo de la casilla (x, y)? */
export function golpearia(
  estado: Pick<EstadoJuego, 'obstaculos' | 'herramienta'>,
  x: number,
  y: number,
): boolean {
  const o = obstaculoEn(estado, x, y)
  if (!o) return false
  return estado.herramienta === 'hacha'
    ? o.tipo === 'arbol' || o.tipo === 'planton'
    : estado.herramienta === 'pico' && o.tipo === 'roca'
}

const invalido: ResultadoEfecto = { ok: false, error: 'estado-invalido' }

/** Talar o picar algo que no es tuyo se rechaza; el golpe al aire en parcela ajena se acepta. */
function comprobarGolpe(estado: EstadoJuego, x: number, y: number): 'no-propia' | undefined {
  return golpearia(estado, x, y) && !casillaPropia(estado, x, y) ? 'no-propia' : undefined
}

function golpear(tipo: 'arbol' | 'roca'): EfectoHerramienta {
  const aplicar = (estado: EstadoJuego, x: number, y: number): ResultadoEfecto => {
    const o = obstaculoEn(estado, x, y)
    // Un golpe al aire se acepta y gasta energía (sin efecto); el hacha también arranca un plantón.
    const vale = o && (o.tipo === tipo || (tipo === 'arbol' && o.tipo === 'planton'))
    if (!o || !vale) return { ok: true, estado, eventos: [] }
    const terreno = terrenoDeCasilla(estado, x, y)
    if (!terreno) return invalido
    const dados = (Number.isSafeInteger(o.golpes) ? (o.golpes as number) : 0) + 1
    const restantes = golpesNecesarios(o, terreno) - dados
    if (restantes > 0) {
      const eventos: EventoHerramienta[] = [
        { tipo: 'obstaculo-golpeado', obstaculo: o.tipo, x, y, restantes },
      ]
      return {
        ok: true,
        estado: {
          ...estado,
          obstaculos: estado.obstaculos.map((b) => (b === o ? { ...o, golpes: dados } : b)),
        },
        eventos,
      }
    }
    // Último golpe: se quita y da su botín.
    const madera = o.tipo === 'arbol' ? CONFIG_RECURSOS.arbol.madera[terreno] : 0
    const piedra = o.tipo === 'roca' ? CONFIG_RECURSOS.roca.piedra[terreno] : 0
    if (
      !Number.isSafeInteger(estado.materiales.madera + madera) ||
      !Number.isSafeInteger(estado.materiales.piedra + piedra)
    ) {
      return invalido // un desbordamiento solo puede venir de un estado corrupto
    }
    let inventario = estado.inventario
    let rng = estado.rng
    let plantones = 0
    let perdido = false
    if (o.tipo === 'arbol' && CONFIG_RECURSOS.arbol.plantones > 0) {
      const sorteo = siguienteAleatorio(rng)
      rng = sorteo.estadoRng
      if (sorteo.valor < CONFIG_RECURSOS.arbol.probabilidadPlanton) {
        // Si no caben, el plantón se pierde (y se avisa): nunca se rechaza talar por la mochila llena.
        const nuevo = inventarioValido(inventario)
          ? anadirObjeto(
              inventario,
              'planton',
              CONFIG_RECURSOS.arbol.plantones,
              capacidadInventario(estado.edificios),
            )
          : undefined
        if (nuevo) {
          inventario = nuevo
          plantones = CONFIG_RECURSOS.arbol.plantones
        } else perdido = true
      }
    }
    const eventos: EventoHerramienta[] = [
      { tipo: 'obstaculo-quitado', obstaculo: o.tipo, x, y, madera, piedra, plantones },
    ]
    if (perdido) eventos.push({ tipo: 'planton-perdido', x, y })
    return {
      ok: true,
      estado: {
        ...estado,
        rng,
        obstaculos: estado.obstaculos.filter((b) => b !== o),
        materiales: {
          madera: estado.materiales.madera + madera,
          piedra: estado.materiales.piedra + piedra,
        },
        inventario,
      },
      eventos,
    }
  }
  return { comprobar: comprobarGolpe, aplicar }
}

/** Efecto del hacha: golpea el árbol (o plantón) de la casilla. */
export const efectoHacha: EfectoHerramienta = golpear('arbol')
/** Efecto del pico: golpea la roca de la casilla. */
export const efectoPico: EfectoHerramienta = golpear('roca')

/** ¿Toca la caja de colisión del personaje la casilla (x, y)? */
function personajeEnCasilla(p: EstadoJuego['personaje'], x: number, y: number): boolean {
  const m = CONFIG_PERSONAJE.tamanoCaja / 2
  return (
    Math.floor(p.x - m) <= x &&
    Math.ceil(p.x + m) - 1 >= x &&
    Math.floor(p.y - m) <= y &&
    Math.ceil(p.y + m) - 1 >= y
  )
}

const VECINAS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
]

/**
 * ¿Cerraría el paso un árbol en (x, y)? Los plantones cuentan ya como árboles (en cuanto crezcan
 * bloquearán) y el de (x, y), si lo hay, se ignora. Mismo criterio que el valle y M4: la casilla
 * pasa a estar bloqueada y ninguna otra queda aislada. Barato en el caso común: si las 8 vecinas
 * están libres no hace falta recorrer el valle.
 */
function cierraElPaso(estado: EstadoJuego, x: number, y: number): boolean {
  const hayPlantones = estado.obstaculos.some((o) => o.tipo === 'planton')
  const propio = obstaculoEn(estado, x, y)
  const base: readonly Obstaculo[] =
    hayPlantones || propio
      ? estado.obstaculos
          .filter((o) => o !== propio)
          .map((o) => (o.tipo === 'planton' ? { ...o, tipo: 'arbol' as const } : o))
      : estado.obstaculos
  const antes = mapaTransitabilidad({ ...estado, obstaculos: base })
  if (VECINAS.every(([dx, dy]) => !casillaBloqueada(antes, x + dx, y + dy))) return false
  const despues = mapaTransitabilidad({
    ...estado,
    obstaculos: [...base, { tipo: 'arbol', x, y, variante: 0 }],
  })
  let a = 0
  let d = 0
  for (let i = 0; i < antes.bloqueada.length; i++) {
    a += antes.bloqueada[i] ?? 0
    d += despues.bloqueada[i] ?? 0
  }
  return d > a + 1
}

/**
 * ¿Se puede plantar un plantón en (x, y)? Casilla de una parcela propia que no sea de cultivo ni
 * huerto, libre (sin río, edificio u obra, obstáculo, aparición ni el personaje encima) y que no
 * cierre el paso (ni deje casillas aisladas).
 */
export function puedePlantarPlanton(estado: EstadoJuego, x: number, y: number): boolean {
  const lado = ladoValle(estado.valle)
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false
  if (x < 0 || y < 0 || x >= lado || y >= lado) return false
  if (!casillaPropia(estado, x, y)) return false
  const zona = zonaEn(estado, x, y)
  if (zona === 'cultivo' || zona === 'huerto') return false
  if (personajeEnCasilla(estado.personaje, x, y)) return false
  if (Math.floor(estado.aparicion.x) === x && Math.floor(estado.aparicion.y) === y) return false
  if (obstaculoEn(estado, x, y)) return false
  if (casillaBloqueada(mapaTransitabilidad(estado), x, y)) return false
  return !cierraElPaso(estado, x, y)
}

/** Variante estable de la casilla (sin consumir el RNG del estado). */
function varianteDe(estado: EstadoJuego, x: number, y: number): number {
  const k = claveCasilla(ladoValle(estado.valle), x, y)
  return (Math.imul(k + 1, 0x9e3779b1) >>> 0) / 0x100000000
}

/**
 * Efecto de la **mano** con un plantón en el inventario: lo planta en la casilla si se puede
 * (`puedePlantarPlanton`); si no, no hace nada. La mano encadena (herramientas.ts): cosechar
 * tiene prioridad (M5-05) y este efecto solo se intenta si no hay nada que cosechar.
 * No gasta energía (coste de la mano en `data/energia.json`).
 */
const plantarPlanton = (estado: EstadoJuego, x: number, y: number): ResultadoEfecto => {
  const nada: ResultadoEfecto = { ok: true, estado, eventos: [] }
  if (!inventarioValido(estado.inventario) || cantidadDe(estado.inventario, 'planton') < 1) {
    return nada
  }
  if (!puedePlantarPlanton(estado, x, y)) return nada
  const inventario = quitarObjeto(estado.inventario, 'planton', 1)
  if (!inventario) return nada
  const nuevo: Obstaculo = {
    tipo: 'planton',
    x,
    y,
    variante: varianteDe(estado, x, y),
    diaPlantado: estado.dia,
  }
  return {
    ok: true,
    estado: { ...estado, inventario, obstaculos: [...estado.obstaculos, nuevo] },
    eventos: [{ tipo: 'planton-plantado', x, y }],
  }
}

export const efectoPlantarPlanton: EfectoHerramienta = {
  // Plantar fuera de lo propio lo ignora el propio efecto (no rechaza).
  comprobar: () => undefined,
  aplicar: plantarPlanton,
}

/**
 * Hace crecer los plantones: los que llevan `diasCrecimiento` días o más plantados pasan a ser
 * árboles, salvo si su casilla está ocupada (el personaje encima, un edificio) o si el árbol
 * cerraría el paso: entonces esperan un día más. Pura; sin plantones listos devuelve el mismo
 * estado. Se llama en el cambio de día (con el personaje ya recolocado).
 */
export function crecerPlantones(estado: EstadoJuego): EstadoJuego {
  const maduro = (o: Obstaculo): boolean =>
    o.tipo === 'planton' &&
    Number.isSafeInteger(o.diaPlantado) &&
    estado.dia - (o.diaPlantado as number) >= CONFIG_RECURSOS.planton.diasCrecimiento
  if (!estado.obstaculos.some(maduro)) return estado
  let actual = estado
  for (const o of estado.obstaculos) {
    if (!maduro(o)) continue
    if (personajeEnCasilla(actual.personaje, o.x, o.y)) continue
    if (casillaConEdificio(actual, o.x, o.y)) continue
    if (cierraElPaso(actual, o.x, o.y)) continue
    actual = {
      ...actual,
      obstaculos: actual.obstaculos.map((b) =>
        b === o ? { tipo: 'arbol' as const, x: o.x, y: o.y, variante: o.variante } : b,
      ),
    }
  }
  return actual
}
