import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { conTierraLabrable } from '../../tests/unit/fixtures/labranza'
import {
  aplicarComando,
  arar,
  casillaDeCama,
  casillaBloqueada,
  CONFIG_ENERGIA,
  costeEnergia,
  crearEstadoInicial,
  defEdificio,
  EsquemaConfigEnergia,
  ENERGIA_MAXIMA,
  ENERGIA_TRAS_DESMAYO,
  HERRAMIENTAS,
  ladoValle,
  mapaTransitabilidad,
  comprobarDormir,
  comprobarUsarHerramienta,
  type Comando,
  type Edificio,
  type EstadoJuego,
} from './index'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 100_000 })
const LADO = ladoValle(base.valle)
const limpio: EstadoJuego = { ...base, obstaculos: [] }
const e0: EstadoJuego = conTierraLabrable(
  { ...limpio, personaje: { x: 50.5, y: 50.5, orientacion: 'sur' } },
  50,
  50,
)
const ejecutar = (e: EstadoJuego, c: Comando) => aplicarComando(e, c)
const usar = (e: EstadoJuego, x = 51, y = 50) => ejecutar(e, { tipo: 'UsarHerramienta', x, y })
/** e0 con la casilla (51, 50) ya arada: para que las semillas se puedan sembrar. */
const aradoE0: EstadoJuego = (() => {
  const r = arar(e0, 51, 50)
  if (!r.ok) throw new Error('no ara')
  return r.estado
})()
const con = (e: EstadoJuego, patch: Partial<EstadoJuego>): EstadoJuego => ({ ...e, ...patch })
const error = (r: ReturnType<typeof aplicarComando>) => (r.ok ? undefined : r.error)

function sitioCasa(e: EstadoJuego): { x: number; y: number } {
  const def = defEdificio('casa')
  if (!def) throw new Error('sin casa')
  const m = mapaTransitabilidad(e)
  for (let y = 2; y < LADO - def.alto - 2; y++)
    for (let x = 2; x < LADO - def.ancho - 2; x++) {
      let libre = true
      for (let j = y - 1; j <= y + def.alto + 1 && libre; j++)
        for (let i = x - 1; i <= x + def.ancho && libre; i++)
          if (casillaBloqueada(m, i, j)) libre = false
      if (libre) return { x, y }
    }
  throw new Error('sin sitio')
}
const S = sitioCasa(limpio)
const casa = (obra: Edificio['obra']): Edificio => ({ id: 1, tipo: 'casa', x: S.x, y: S.y, obra })
const conCasa = (e: EstadoJuego, terminada = true): EstadoJuego =>
  con(e, { edificios: [casa(terminada ? null : { diaInicio: 1, diaFin: 5 })] })
const puerta = { x: S.x + 2, y: S.y + 3 }
const en = (e: EstadoJuego, x: number, y: number): EstadoJuego =>
  con(e, { personaje: { x: x + 0.5, y: y + 0.5, orientacion: 'sur' } })
const aparicion = { x: Math.floor(base.aparicion.x), y: Math.floor(base.aparicion.y) }

describe('datos de energía', () => {
  it('el estado inicial empieza con la energía al máximo (100)', () => {
    expect(ENERGIA_MAXIMA).toBe(100)
    expect(base.energia).toBe(ENERGIA_MAXIMA)
  })
  it('costes de la propuesta: azada y regadera 2, hacha y pico 4, semillas y mano 0', () => {
    expect(HERRAMIENTAS.map(costeEnergia)).toEqual([2, 2, 0, 0, 4, 4])
  })
  it('el desmayo deja el 50 % redondeado hacia abajo', () => {
    expect(ENERGIA_TRAS_DESMAYO).toBe(50)
  })
  it('el esquema rechaza datos inválidos', () => {
    const ok = { ...CONFIG_ENERGIA }
    expect(v.safeParse(EsquemaConfigEnergia, ok).success).toBe(true)
    for (const mala of [
      { ...ok, maximo: 0 },
      { ...ok, maximo: 1.5 },
      { ...ok, desmayoFraccion: 1.5 },
      { ...ok, desmayoFraccion: -0.1 },
      { ...ok, costes: { ...ok.costes, azada: -1 } },
      { ...ok, costes: { ...ok.costes, azada: 101 } },
      { ...ok, costes: { azada: 2 } },
      { ...ok, extra: 1 },
    ]) {
      expect(v.safeParse(EsquemaConfigEnergia, mala).success).toBe(false)
    }
  })
})

describe('UsarHerramienta y energía', () => {
  it.each(HERRAMIENTAS)('un uso válido de %s gasta su coste (aunque el efecto esté vacío)', (h) => {
    const e = con(h === 'semillas' || h === 'regadera' ? aradoE0 : e0, {
      herramienta: h,
      semillaElegida: 'semilla-patata',
    })
    const r = usar(e)
    expect(r.ok).toBe(true)
    expect(r.estado.energia).toBe(ENERGIA_MAXIMA - costeEnergia(h))
  })
  it('sin energía suficiente se rechaza con sin-energia y el estado queda intacto', () => {
    const e = con(e0, { herramienta: 'hacha', energia: 3 })
    const r = usar(e)
    expect(error(r)).toBe('sin-energia')
    expect(r.estado).toBe(e)
    expect(comprobarUsarHerramienta(e, 51, 50)).toBe('sin-energia')
  })
  it('con justo el coste se puede y se queda en 0', () => {
    const r = usar(con(e0, { herramienta: 'hacha', energia: 4 }))
    expect(r.ok).toBe(true)
    expect(r.estado.energia).toBe(0)
  })
  it('con 0 de energía las herramientas gratuitas siguen funcionando', () => {
    for (const h of ['mano', 'semillas'] as const) {
      const r = usar(con(aradoE0, { herramienta: h, energia: 0, semillaElegida: 'semilla-patata' }))
      expect(r.ok).toBe(true)
      expect(r.estado.energia).toBe(0)
    }
  })
  it('un rechazo por otro motivo no gasta (y gana al de energía)', () => {
    const sin = con(e0, { herramienta: 'hacha', energia: 0 })
    expect(error(usar(sin, 80, 80))).toBe('fuera-de-alcance')
    expect(error(usar(con(sin, { modo: 'plano' })))).toBe('solo-en-vida')
    expect(error(usar(con(sin, { pausado: true })))).toBe('en-pausa')
    const lejos = con(e0, { herramienta: 'azada' })
    const r = usar(lejos, 80, 80)
    expect(r.estado).toBe(lejos)
    expect(r.estado.energia).toBe(ENERGIA_MAXIMA)
  })
  it('una energía fuera de rango en el estado se rechaza como estado-invalido', () => {
    for (const energia of [-1, 101, 1.5, NaN]) {
      expect(error(usar(con(e0, { energia })))).toBe('estado-invalido')
    }
  })
  it('moverse y cambiar de modo nunca se bloquean sin energía', () => {
    const e = con(e0, { energia: 0 })
    const m = ejecutar(e, { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 100 })
    expect(m.ok).toBe(true)
    expect(m.estado.personaje.x).toBeGreaterThan(e.personaje.x)
    expect(ejecutar(e, { tipo: 'CambiarModo', modo: 'plano' }).ok).toBe(true)
  })
})

describe('Dormir', () => {
  it('sin casa, junto a la aparición: día siguiente a las 06:00 con la energía al máximo', () => {
    const e = con(limpio, { energia: 7, minutoDelDia: 900 })
    const r = ejecutar(e, { tipo: 'Dormir' })
    expect(r.ok).toBe(true)
    expect(r.estado).toMatchObject({ dia: 2, minutoDelDia: 360, energia: ENERGIA_MAXIMA })
    expect(r.ok && r.eventos).toEqual([{ tipo: 'dormido' }])
  })
  it('a distancia 1 de la aparición vale; a 2 no', () => {
    const a = aparicion
    expect(ejecutar(en(limpio, a.x, a.y - 1), { tipo: 'Dormir' }).ok).toBe(true)
    expect(ejecutar(en(limpio, a.x + 1, a.y - 1), { tipo: 'Dormir' }).ok).toBe(true)
    const lejos = en(limpio, a.x, a.y - 2)
    const r = ejecutar(lejos, { tipo: 'Dormir' })
    expect(error(r)).toBe('lejos-de-la-cama')
    expect(r.estado).toBe(lejos)
  })
  it('con la casa terminada la cama es su puerta, no la aparición', () => {
    const c = conCasa(limpio)
    expect(casillaDeCama(c)).toEqual(puerta)
    const enAparicion = en(c, aparicion.x, aparicion.y)
    expect(error(ejecutar(enAparicion, { tipo: 'Dormir' }))).toBe('lejos-de-la-cama')
    expect(comprobarDormir(enAparicion)).toBe('lejos-de-la-cama')
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, -1],
      [0, 1],
    ] as const) {
      expect(comprobarDormir(en(c, puerta.x + dx, puerta.y + dy))).toBeUndefined()
    }
    expect(comprobarDormir(en(c, puerta.x + 2, puerta.y))).toBe('lejos-de-la-cama')
  })
  it('una casa en obra no cuenta: la cama sigue siendo la aparición', () => {
    expect(casillaDeCama(conCasa(limpio, false))).toEqual(aparicion)
  })
  it('al dormir despierta en la puerta de la casa y termina las obras que tocan', () => {
    const c = con(conCasa(en(limpio, puerta.x, puerta.y + 1)), { dia: 4, energia: 1 })
    const obra: Edificio = {
      id: 2,
      tipo: 'cobertizo',
      x: S.x + 8,
      y: S.y,
      obra: { diaInicio: 1, diaFin: 5 },
    }
    const e = con(c, { edificios: [...c.edificios, obra] })
    const r = ejecutar(e, { tipo: 'Dormir' })
    expect(r.ok).toBe(true)
    expect(r.estado.dia).toBe(5)
    expect(r.estado.edificios.find((b) => b.id === 2)?.obra).toBeNull()
    expect(r.estado.personaje).toMatchObject({ x: puerta.x + 0.5, y: puerta.y + 0.5 })
    expect(r.ok && r.eventos.map((x) => x.tipo)).toEqual(['dormido', 'obra-terminada'])
  })
  it('es el mismo cambio de día que el desmayo, salvo la energía', () => {
    const e = con(conCasa(en(limpio, puerta.x, puerta.y)), {
      minutoDelDia: 1560,
      dia: 3,
      energia: 9,
    })
    const desmayo = aplicarComando(e, { tipo: 'AvanzarTiempo', minutos: 1 })
    const dormir = ejecutar(e, { tipo: 'Dormir' })
    expect(desmayo.estado.energia).toBe(ENERGIA_TRAS_DESMAYO)
    expect(dormir.estado.energia).toBe(ENERGIA_MAXIMA)
    expect({ ...dormir.estado, energia: 0 }).toEqual({ ...desmayo.estado, energia: 0 })
  })
  it('solo en Modo Vida', () => {
    const e = con(limpio, { modo: 'plano' })
    const r = ejecutar(e, { tipo: 'Dormir' })
    expect(error(r)).toBe('solo-en-vida')
    expect(r.estado).toBe(e)
  })
  it('con la pausa del jugador se puede dormir', () => {
    expect(ejecutar(con(limpio, { pausado: true }), { tipo: 'Dormir' }).ok).toBe(true)
  })
  it('rechaza con limite-de-dia y con estado inválido, sin tocar el estado', () => {
    const tope = con(limpio, { dia: Number.MAX_SAFE_INTEGER })
    expect(error(ejecutar(tope, { tipo: 'Dormir' }))).toBe('limite-de-dia')
    const roto = con(limpio, { energia: -3 })
    expect(ejecutar(roto, { tipo: 'Dormir' }).estado).toBe(roto)
    expect(error(ejecutar(roto, { tipo: 'Dormir' }))).toBe('estado-invalido')
    const sinEdificios = con(limpio, { edificios: 'x' as never })
    expect(error(ejecutar(sinEdificios, { tipo: 'Dormir' }))).toBe('estado-invalido')
  })
})

describe('desmayo y energía', () => {
  it('a las 02:00 deja la energía en el 50 % del máximo, también si había más', () => {
    for (const energia of [0, 10, 100]) {
      const r = aplicarComando(con(limpio, { minutoDelDia: 1560, energia }), {
        tipo: 'AvanzarTiempo',
        minutos: 5,
      })
      expect(r.estado.energia).toBe(50)
      expect(r.ok && r.eventos[0]).toEqual({ tipo: 'desmayo' })
    }
  })
})
