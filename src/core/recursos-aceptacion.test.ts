import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  colocacionValida,
  CONFIG_EDIFICIOS,
  costeEnergia,
  crearEstadoInicial,
  ENERGIA_MAXIMA,
  type Comando,
  type EstadoJuego,
  type Obstaculo,
} from './index'

/*
 * Aceptación del hito M5 (criterio de M5-06): tras construir lo de M4, con hacha y pico se consigue
 * la madera (50) y la piedra (10) de un segundo cobertizo. Todo por comandos del núcleo; solo el
 * personaje se coloca junto a cada objetivo (andar no es lo que se prueba).
 */

const SEMILLAS = [1, 7, 42, 99, 2024, 31337]
/** Un día de trabajo es la energía máxima: con la reserva de días se acota el esfuerzo razonable. */
const DIAS_MAXIMOS = 3

function ok(e: EstadoJuego, c: Comando): EstadoJuego {
  const r = aplicarComando(e, c)
  if (!r.ok) throw new Error(`${c.tipo}: ${r.error}`)
  return r.estado
}

const casillasDe = (e: EstadoJuego, indice: number) => {
  const c = e.valle.casillasPorParcela
  const p = e.valle.parcelas[indice]
  if (!p) throw new Error('parcela')
  return { x0: p.columna * c, y0: p.fila * c, x1: p.columna * c + c - 1, y1: p.fila * c + c - 1 }
}

/** Parcelas compradas (en el orden de compra): una de bosque y, por el camino, una rocosa. */
function parcelasAComprar(e: EstadoJuego): number[] {
  const n = e.valle.parcelasPorLado
  const indices = e.valle.parcelas.map((_, i) => i)
  const bosque = indices.filter((i) => e.valle.parcelas[i]?.terreno === 'bosque')
  const rocosas = indices.filter((i) => e.valle.parcelas[i]?.terreno === 'rocoso')
  let mejor: number[] | undefined
  for (const b of bosque) {
    for (const r of rocosas) {
      const pb = e.valle.parcelas[b]
      const pr = e.valle.parcelas[r]
      if (!pb || !pr) continue
      // Camino en L entre las dos, parcela a parcela (adyacentes por lado).
      const camino = [b]
      let f = pb.fila
      let c = pb.columna
      while (c !== pr.columna) {
        c += Math.sign(pr.columna - c)
        camino.push(f * n + c)
      }
      while (f !== pr.fila) {
        f += Math.sign(pr.fila - f)
        camino.push(f * n + c)
      }
      if (!mejor || camino.length < mejor.length) mejor = camino
    }
  }
  if (!mejor) throw new Error('el valle no tiene bosque y rocoso')
  return mejor
}

/** Primera casilla donde cabe un cobertizo, dentro de las parcelas dadas. */
function sitioParaCobertizo(e: EstadoJuego, parcelas: readonly number[]) {
  for (const i of parcelas) {
    const r = casillasDe(e, i)
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (colocacionValida(e, 'cobertizo', x, y).valida) return { x, y }
      }
    }
  }
  throw new Error('sin sitio para un cobertizo')
}

/** Coloca al personaje en una casilla libre de obstáculos junto a (x, y). */
function juntoA(e: EstadoJuego, o: Obstaculo): EstadoJuego {
  const hay = (x: number, y: number) => e.obstaculos.some((b) => b.x === x && b.y === y)
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (!hay(o.x + dx, o.y + dy)) {
      return {
        ...e,
        personaje: { x: o.x + dx + 0.5, y: o.y + dy + 0.5, orientacion: 'sur' },
      }
    }
  }
  return { ...e, personaje: { x: o.x + 0.5, y: o.y + 0.5 + 1, orientacion: 'sur' } }
}

describe.each(SEMILLAS)('aceptación de M5-06 con la semilla %i', (semilla) => {
  it('con hacha y pico se consiguen 50 de madera y 10 de piedra para un segundo cobertizo', () => {
    let e = crearEstadoInicial({ semilla, dineroInicial: 1_000_000 })
    // Compra las parcelas hasta tener bosque y roca.
    const compradas = parcelasAComprar(e)
    for (const indice of compradas) e = ok(e, { tipo: 'ComprarParcela', indice })
    // Primer cobertizo de M4 (modo Plano, zona de almacén).
    e = ok(e, { tipo: 'CambiarModo', modo: 'plano' })
    for (const i of compradas) {
      const r = casillasDe(e, i)
      e = ok(e, { tipo: 'PintarZona', ...r, zona: 'almacen' })
    }
    const primero = sitioParaCobertizo(e, compradas)
    e = ok(e, { tipo: 'Construir', tipoEdificio: 'cobertizo', ...{ x: primero.x, y: primero.y } })
    // Lo que sobró se gastó en otras cosas: se parte de cero para medir solo lo que dan hacha y pico.
    e = { ...e, materiales: { madera: 0, piedra: 0 } }
    e = ok(e, { tipo: 'CambiarModo', modo: 'vida' })

    const coste = CONFIG_EDIFICIOS.edificios.cobertizo.coste
    const dentro = (o: Obstaculo) =>
      compradas.some((i) => {
        const r = casillasDe(e, i)
        return o.x >= r.x0 && o.x <= r.x1 && o.y >= r.y0 && o.y <= r.y1
      })
    const objetivos = e.obstaculos.filter(dentro)
    let energiaGastada = 0
    const golpear = (o: Obstaculo, h: 'hacha' | 'pico') => {
      e = ok(juntoA(e, o), { tipo: 'ElegirHerramienta', herramienta: h })
      for (let n = 0; n < 50 && e.obstaculos.some((b) => b.x === o.x && b.y === o.y); n++) {
        if (e.energia < costeEnergia(h)) e = { ...e, energia: ENERGIA_MAXIMA }
        const antes = e.energia
        e = ok(e, { tipo: 'UsarHerramienta', x: o.x, y: o.y })
        energiaGastada += antes - e.energia
      }
    }
    for (const o of objetivos.filter((b) => b.tipo === 'arbol')) {
      if (e.materiales.madera >= coste.madera) break
      golpear(o, 'hacha')
    }
    for (const o of objetivos.filter((b) => b.tipo === 'roca')) {
      if (e.materiales.piedra >= coste.piedra) break
      golpear(o, 'pico')
    }

    expect(e.materiales.madera).toBeGreaterThanOrEqual(coste.madera)
    expect(e.materiales.piedra).toBeGreaterThanOrEqual(coste.piedra)
    // Esfuerzo razonable: unos pocos días de energía.
    expect(energiaGastada).toBeLessThanOrEqual(DIAS_MAXIMOS * ENERGIA_MAXIMA)

    // Con eso se construye el segundo cobertizo y se pagan exactamente sus materiales.
    e = ok(e, { tipo: 'CambiarModo', modo: 'plano' })
    const segundo = sitioParaCobertizo(e, compradas)
    const antes = e.materiales
    e = ok(e, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: segundo.x, y: segundo.y })
    expect(e.edificios.filter((b) => b.tipo === 'cobertizo')).toHaveLength(2)
    expect(e.materiales.madera).toBe(antes.madera - coste.madera)
    expect(e.materiales.piedra).toBe(antes.piedra - coste.piedra)
  })
})
