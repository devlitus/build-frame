/* eslint-disable @typescript-eslint/no-non-null-assertion -- valores conocidos en tests */
/**
 * Rompedor · M5-02 Energía y dormir (núcleo). Ver docs/informes/M5-02-rompedor.md.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  aplicarComando,
  casillaBloqueada,
  casillaDeCama,
  comprobarDormir,
  crearEstadoInicial,
  defEdificio,
  ENERGIA_MAXIMA,
  ladoValle,
  mapaTransitabilidad,
  puertaDe,
  type Comando,
  type Edificio,
  type EstadoJuego,
} from '../../src/core'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 100_000 })
const LADO = ladoValle(base.valle)
const limpio: EstadoJuego = { ...base, obstaculos: [] }
const con = (e: EstadoJuego, p: Partial<EstadoJuego>): EstadoJuego => ({ ...e, ...p })
const en = (e: EstadoJuego, x: number, y: number): EstadoJuego =>
  con(e, { personaje: { x: x + 0.5, y: y + 0.5, orientacion: 'sur' } })

function sitioCasa(e: EstadoJuego): { x: number; y: number } {
  const def = defEdificio('casa')!
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
const casa = (id: number, obra: Edificio['obra'], x = S.x, y = S.y): Edificio => ({
  id,
  tipo: 'casa',
  x,
  y,
  obra,
})
const conCasa = (e: EstadoJuego): EstadoJuego => con(e, { edificios: [casa(1, null)] })
const puerta = puertaDe(defEdificio('casa')!, S.x, S.y)

describe('Dormir: la cama y el despertar', () => {
  it('con la puerta tapada por otro edificio, desde cualquier casilla libre junto a la puerta se puede dormir', () => {
    const caja: Edificio = { id: 2, tipo: 'caja-envio', x: puerta.x, y: puerta.y, obra: null }
    const e = con(limpio, { edificios: [casa(1, null), caja] })
    const m = mapaTransitabilidad(e)
    const vecinas = [-1, 0, 1]
      .flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: puerta.x + dx, y: puerta.y + dy })))
      .filter((c) => !casillaBloqueada(m, c.x, c.y))
    const rechazadas = vecinas.filter(
      (c) => comprobarDormir(en(e, c.x, c.y)) === 'lejos-de-la-cama',
    )
    expect({ cama: casillaDeCama(e), rechazadas, libres: vecinas.length }).toMatchObject({
      rechazadas: [],
    })
  })

  it('tras mover la casa, la cama es la puerta nueva y la vieja ya no vale', () => {
    const e = conCasa(en(limpio, puerta.x, puerta.y))
    expect(comprobarDormir(e)).toBeUndefined()
    const movido = con(e, { edificios: [casa(1, null, S.x + 6, S.y)] })
    expect(casillaDeCama(movido)).toEqual({ x: puerta.x + 6, y: puerta.y })
    expect(comprobarDormir(movido)).toBe('lejos-de-la-cama')
  })

  it('con dos casas terminadas vale la de menor id; con la de menor id en obra, la otra', () => {
    const a = casa(5, null, S.x, S.y)
    const b = casa(2, null, S.x + 6, S.y)
    const dos = con(limpio, { edificios: [a, b] })
    expect(casillaDeCama(dos)).toEqual({ x: puerta.x + 6, y: puerta.y })
    const unaEnObra = con(limpio, {
      edificios: [casa(1, { diaInicio: 1, diaFin: 9 }, S.x + 6, S.y), a],
    })
    expect(casillaDeCama(unaEnObra)).toEqual(puerta)
  })

  it('el borde del alcance es exacto en las 8 direcciones y a 2 se rechaza', () => {
    const e = conCasa(limpio)
    for (let dx = -3; dx <= 3; dx++)
      for (let dy = -3; dy <= 3; dy++) {
        const ee = en(e, puerta.x + dx, puerta.y + dy)
        const cerca = Math.max(Math.abs(dx), Math.abs(dy)) <= 1
        expect(comprobarDormir(ee) === undefined).toBe(cerca)
      }
  })

  it('el alcance cuenta por casilla (floor), no por distancia', () => {
    const e = conCasa(limpio)
    const justo = con(e, {
      personaje: { x: puerta.x + 1.999, y: puerta.y + 0.001, orientacion: 'sur' },
    })
    expect(comprobarDormir(justo)).toBeUndefined()
    const fuera = con(e, { personaje: { x: puerta.x + 2.0, y: puerta.y, orientacion: 'sur' } })
    expect(comprobarDormir(fuera)).toBe('lejos-de-la-cama')
  })
})

describe('Dormir: tiempo y rechazos', () => {
  it('a cualquier hora (06:00, 01:59, 02:00) pasa de día y deja las 06:00', () => {
    for (const minutoDelDia of [360, 361, 1559, 1560, 1000]) {
      const e = con(limpio, { minutoDelDia, dia: 3 })
      const r = aplicarComando(e, { tipo: 'Dormir' })
      expect(r.ok).toBe(true)
      expect(r.estado.dia).toBe(4)
      expect(r.estado.minutoDelDia).toBe(360)
    }
  })

  it('dormir n veces seguidas avanza exactamente n días, sin tocar dinero ni materiales', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (n) => {
        let e = limpio
        for (let i = 0; i < n; i++) {
          const r = aplicarComando(e, { tipo: 'Dormir' })
          expect(r.ok).toBe(true)
          e = r.estado
        }
        expect(e.dia).toBe(limpio.dia + n)
        expect(e.dinero).toBe(limpio.dinero)
        expect(e.materiales).toEqual(limpio.materiales)
        expect(e.energia).toBe(ENERGIA_MAXIMA)
      }),
    )
  })

  it('dormir y desmayarse avanzan las obras exactamente igual (propiedad)', () => {
    const obras = fc.array(
      fc.record({ x: fc.integer({ min: 0, max: 5 }), fin: fc.integer({ min: 0, max: 8 }) }),
      { maxLength: 5 },
    )
    fc.assert(
      fc.property(
        obras,
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: ENERGIA_MAXIMA }),
        fc.boolean(),
        (os, dia, energia, hayCasa) => {
          const edificios: Edificio[] = os.map((o, i) => ({
            id: i + 10,
            tipo: 'cobertizo',
            x: S.x + 8 + o.x * 4,
            y: S.y + 6,
            obra: { diaInicio: 1, diaFin: o.fin },
          }))
          if (hayCasa) edificios.push(casa(1, null))
          const e = con(hayCasa ? en(limpio, puerta.x, puerta.y) : limpio, {
            edificios,
            dia,
            energia,
            minutoDelDia: 1559,
          })
          const d = aplicarComando(e, { tipo: 'Dormir' })
          const f = aplicarComando(e, { tipo: 'AvanzarTiempo', minutos: 2 })
          expect(d.ok && f.ok).toBe(true)
          expect({ ...d.estado, energia: 0 }).toEqual({ ...f.estado, energia: 0 })
          expect(d.ok && f.ok && d.eventos.slice(1)).toEqual(f.ok ? f.eventos.slice(1) : [])
        },
      ),
    )
  })

  it('una obra con diaFin = dia + 2 sigue en obra tras dormir una vez y termina tras la segunda', () => {
    const e = con(limpio, {
      dia: 3,
      edificios: [
        { id: 3, tipo: 'cobertizo', x: S.x + 8, y: S.y, obra: { diaInicio: 1, diaFin: 5 } },
      ],
    })
    const a = aplicarComando(e, { tipo: 'Dormir' }).estado
    expect(a.edificios[0]!.obra).not.toBeNull()
    const b = aplicarComando(a, { tipo: 'Dormir' }).estado
    expect(b.edificios[0]!.obra).toBeNull()
  })

  it('Dormir con campos extra no cambia nada raro y no muta el estado', () => {
    const e = conCasa(en(limpio, puerta.x, puerta.y))
    const antes = JSON.stringify(e)
    const r = aplicarComando(e, { tipo: 'Dormir', extra: 1 } as unknown as Comando)
    expect(r.ok).toBe(true)
    expect(JSON.stringify(e)).toBe(antes)
    expect(aplicarComando(e, { tipo: 'Dormir' })).toEqual(aplicarComando(e, { tipo: 'Dormir' }))
  })

  it('energías inválidas rechazan Dormir con el mismo objeto', () => {
    for (const energia of [NaN, Infinity, -1, 101, 50.5, '50', null, undefined, -0.1, 2 ** 53]) {
      const e = con(limpio, { energia: energia as never })
      const r = aplicarComando(e, { tipo: 'Dormir' })
      expect(r.ok).toBe(false)
      expect(r.estado).toBe(e)
    }
  })

  it('un estado con energía inválida se cura con el desmayo (no queda atascado)', () => {
    const e = con(limpio, { energia: NaN, minutoDelDia: 1559 })
    const r = aplicarComando(e, { tipo: 'AvanzarTiempo', minutos: 5 })
    expect(r.estado.energia).toBe(50)
  })
})

describe('energía y herramientas', () => {
  const apunta = (e: EstadoJuego) => ({
    tipo: 'UsarHerramienta' as const,
    x: Math.floor(e.personaje.x),
    y: Math.floor(e.personaje.y),
  })
  it('coste exacto vale (queda 0) y coste − 1 no; con 0, semillas y mano sí', () => {
    const base2 = con(limpio, { semillaElegida: 'semilla-patata', inventario: [] })
    for (const [h, c] of [
      ['azada', 2],
      ['regadera', 2],
      ['hacha', 4],
      ['pico', 4],
    ] as const) {
      const ok = aplicarComando(con(base2, { herramienta: h, energia: c }), apunta(base2))
      expect(ok.ok).toBe(true)
      expect(ok.estado.energia).toBe(0)
      const no = con(base2, { herramienta: h, energia: c - 1 })
      const r = aplicarComando(no, apunta(base2))
      expect(r.ok ? 'ok' : r.error).toBe('sin-energia')
      expect(r.estado).toBe(no)
    }
    const mano = aplicarComando(con(base2, { herramienta: 'mano', energia: 0 }), apunta(base2))
    expect(mano.ok).toBe(true)
    expect(mano.estado.energia).toBe(0)
  })

  it('con energía 0 un rechazo anterior gana a sin-energia', () => {
    const e = con(limpio, { herramienta: 'hacha', energia: 0 })
    const x = Math.floor(e.personaje.x)
    const y = Math.floor(e.personaje.y)
    const err = (s: EstadoJuego, cx = x, cy = y) => {
      const r = aplicarComando(s, { tipo: 'UsarHerramienta', x: cx, y: cy })
      return r.ok ? 'ok' : r.error
    }
    expect(err(e, x + 5, y)).toBe('fuera-de-alcance')
    expect(err(con(e, { modo: 'plano' }))).toBe('solo-en-vida')
    expect(err(con(e, { pausado: true }))).toBe('en-pausa')
    expect(err(e, -1, 0)).toBe('fuera-del-valle')
    expect(err(e)).toBe('sin-energia')
  })

  it('gastar sin parar nunca baja de 0 ni se pierde la cuenta (propiedad)', () => {
    const coste: Record<string, number> = { azada: 2, regadera: 2, hacha: 4, pico: 4, mano: 0 }
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('azada', 'regadera', 'hacha', 'pico', 'mano'), { maxLength: 120 }),
        (hs) => {
          let e = limpio
          let esperado = ENERGIA_MAXIMA
          for (const h of hs) {
            e = aplicarComando(e, { tipo: 'ElegirHerramienta', herramienta: h as never }).estado
            const r = aplicarComando(e, apunta(e))
            if (esperado >= coste[h]!) esperado -= coste[h]!
            else expect(r.ok).toBe(false)
            e = r.estado
            expect(e.energia).toBe(esperado)
          }
        },
      ),
    )
  })
})
