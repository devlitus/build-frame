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
import type { Terreno } from './valle'

/*
 * Talar, picar y replantar (M5-06). Los obstáculos del estado (`estado.obstaculos`) son los árboles,
 * rocas y plantones del valle; cada golpe de hacha o pico suma uno a su `golpes` y, al llegar a los
 * que pide su terreno (`data/recursos.json`), se quita y da su botín. Todo en funciones puras.
 */

/** Terreno de la parcela que contiene la casilla global (x, y), o `undefined` si cae fuera. */
export function terrenoDeCasilla(
  estado: Pick<EstadoJuego, 'valle'>,
  x: number,
  y: number,
): Terreno | undefined {
  const { valle } = estado
  const c = valle.casillasPorParcela
  const p = valle.parcelas[Math.floor(y / c) * valle.parcelasPorLado + Math.floor(x / c)]
  return p?.terreno
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

const rechazo = (error: 'limite-de-recursos' | 'estado-invalido'): ResultadoEfecto => ({
  ok: false,
  error,
})

function golpear(tipo: 'arbol' | 'roca'): EfectoHerramienta {
  return (estado, x, y) => {
    const o = obstaculoEn(estado, x, y)
    // Un golpe al aire se acepta y gasta energía (sin efecto); el hacha también arranca un plantón.
    const vale = o && (o.tipo === tipo || (tipo === 'arbol' && o.tipo === 'planton'))
    if (!o || !vale) return { ok: true, estado, eventos: [] }
    const terreno = terrenoDeCasilla(estado, x, y)
    if (!terreno) return rechazo('estado-invalido')
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
      return rechazo('limite-de-recursos')
    }
    let inventario = estado.inventario
    let plantones = 0
    if (o.tipo === 'arbol' && CONFIG_RECURSOS.arbol.plantones > 0 && inventarioValido(inventario)) {
      // Si no caben, el plantón se pierde: nunca se rechaza talar por tener la mochila llena.
      const nuevo = anadirObjeto(
        inventario,
        'planton',
        CONFIG_RECURSOS.arbol.plantones,
        capacidadInventario(estado.edificios),
      )
      if (nuevo) {
        inventario = nuevo
        plantones = CONFIG_RECURSOS.arbol.plantones
      }
    }
    return {
      ok: true,
      estado: {
        ...estado,
        obstaculos: estado.obstaculos.filter((b) => b !== o),
        materiales: {
          madera: estado.materiales.madera + madera,
          piedra: estado.materiales.piedra + piedra,
        },
        inventario,
      },
      eventos: [{ tipo: 'obstaculo-quitado', obstaculo: o.tipo, x, y, madera, piedra, plantones }],
    }
  }
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

/**
 * ¿Se puede plantar un plantón en (x, y)? Casilla de una parcela propia, libre (sin río, obstáculo ni
 * edificio), sin el personaje encima y que no deje casillas aisladas ni encierre nada (solo debe
 * quedar bloqueada la propia casilla).
 */
export function puedePlantarPlanton(estado: EstadoJuego, x: number, y: number): boolean {
  const lado = ladoValle(estado.valle)
  if (x < 0 || y < 0 || x >= lado || y >= lado) return false
  const c = estado.valle.casillasPorParcela
  const parcela =
    estado.valle.parcelas[Math.floor(y / c) * estado.valle.parcelasPorLado + Math.floor(x / c)]
  if (parcela?.estado !== 'propia') return false
  if (personajeEnCasilla(estado.personaje, x, y)) return false
  const antes = mapaTransitabilidad(estado)
  if (casillaBloqueada(antes, x, y)) return false
  const despues = mapaTransitabilidad({
    ...estado,
    obstaculos: [...estado.obstaculos, { tipo: 'planton', x, y, variante: 0 }],
  })
  let a = 0
  let d = 0
  for (let i = 0; i < antes.bloqueada.length; i++) {
    a += antes.bloqueada[i] ?? 0
    d += despues.bloqueada[i] ?? 0
  }
  return d === a + 1
}

/** Variante estable de la casilla (sin consumir el RNG del estado). */
function varianteDe(estado: EstadoJuego, x: number, y: number): number {
  const k = claveCasilla(ladoValle(estado.valle), x, y)
  return (Math.imul(k + 1, 0x9e3779b1) >>> 0) / 0x100000000
}

/**
 * Efecto de la **mano** con un plantón en el inventario: lo planta en la casilla si se puede
 * (`puedePlantarPlanton`); si no, no hace nada (la mano también sirve para cosechar, M5-05).
 * No gasta energía (coste de la mano en `data/energia.json`).
 */
export const efectoPlantarPlanton: EfectoHerramienta = (estado, x, y) => {
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

/**
 * Hace crecer los plantones: los que llevan `diasCrecimiento` días o más plantados pasan a ser
 * árboles. Pura; sin plantones listos devuelve el mismo estado. Se llama en el cambio de día.
 */
export function crecerPlantones(estado: EstadoJuego): EstadoJuego {
  const listo = (o: Obstaculo): boolean =>
    o.tipo === 'planton' &&
    Number.isSafeInteger(o.diaPlantado) &&
    estado.dia - (o.diaPlantado as number) >= CONFIG_RECURSOS.planton.diasCrecimiento
  if (!estado.obstaculos.some(listo)) return estado
  return {
    ...estado,
    obstaculos: estado.obstaculos.map((o) =>
      listo(o) ? { tipo: 'arbol' as const, x: o.x, y: o.y, variante: o.variante } : o,
    ),
  }
}
