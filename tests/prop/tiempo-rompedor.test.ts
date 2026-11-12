import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import * as v from 'valibot'
import {
  aplicarComando,
  aplicarComandos,
  crearEstadoInicial,
  CONFIG_TIEMPO,
  EsquemaConfigTiempo,
  fechaDe,
  horaDe,
  minutosDeJuegoPorMs,
  type Comando,
  type EstadoJuego,
} from '../../src/core'

const inicial = crearEstadoInicial({ semilla: 7, dineroInicial: 100 })
const con = (p: Partial<EstadoJuego>): EstadoJuego => ({ ...inicial, ...p })
const { horaInicio, horaFin } = CONFIG_TIEMPO

const cmd: fc.Arbitrary<Comando> = fc.oneof(
  fc.record({
    tipo: fc.constant('AvanzarTiempo' as const),
    minutos: fc.oneof(fc.integer({ min: 0, max: 3000 }), fc.constant(Number.MAX_SAFE_INTEGER)),
  }),
  fc.constant({ tipo: 'Pausar' as const }),
  fc.constant({ tipo: 'Reanudar' as const }),
  fc.record({
    tipo: fc.constant('CambiarVelocidad' as const),
    velocidad: fc.integer({ min: 0, max: 4 }),
  }),
)

describe('propiedades del reloj', () => {
  it('minutoDelDia siempre en [inicio, fin] y dia monótono (+1 como mucho por comando)', () => {
    fc.assert(
      fc.property(fc.array(cmd, { maxLength: 80 }), (cs) => {
        let e = inicial
        for (const c of cs) {
          const r = aplicarComando(e, c)
          expect(r.estado.minutoDelDia).toBeGreaterThanOrEqual(horaInicio)
          expect(r.estado.minutoDelDia).toBeLessThanOrEqual(horaFin)
          expect(r.estado.dia - e.dia).toBeGreaterThanOrEqual(0)
          expect(r.estado.dia - e.dia).toBeLessThanOrEqual(1)
          if (r.ok && r.eventos.some((x) => x.tipo === 'desmayo'))
            expect(r.estado.dia).toBe(e.dia + 1)
          expect(CONFIG_TIEMPO.velocidades).toContain(r.estado.velocidad)
          e = r.estado
        }
      }),
    )
  })

  it('determinista y no muta la entrada', () => {
    fc.assert(
      fc.property(fc.array(cmd, { maxLength: 40 }), (cs) => {
        const copia = structuredClone(inicial)
        const a = aplicarComandos(inicial, cs)
        expect(aplicarComandos(inicial, cs)).toEqual(a)
        expect(inicial).toEqual(copia)
      }),
    )
  })

  it('en pausa ningún AvanzarTiempo válido altera el estado', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), (m) => {
        const p = aplicarComando(inicial, { tipo: 'Pausar' }).estado
        expect(aplicarComando(p, { tipo: 'AvanzarTiempo', minutos: m }).estado).toBe(p)
      }),
    )
  })

  it('fechaDe y horaDe coherentes para cualquier día/minuto', () => {
    const dpe = CONFIG_TIEMPO.diasPorEstacion
    const n = CONFIG_TIEMPO.estaciones.length
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), (dia) => {
        const f = fechaDe({ dia })
        expect(f.diaDeEstacion).toBeGreaterThanOrEqual(1)
        expect(f.diaDeEstacion).toBeLessThanOrEqual(dpe)
        expect(CONFIG_TIEMPO.estaciones).toContain(f.estacion)
        const idx = CONFIG_TIEMPO.estaciones.indexOf(f.estacion)
        expect((f.año - 1) * dpe * n + idx * dpe + f.diaDeEstacion).toBe(dia)
      }),
    )
    fc.assert(
      fc.property(fc.integer({ min: horaInicio, max: horaFin }), (m) => {
        const h = horaDe({ minutoDelDia: m })
        expect(h.horas).toBeGreaterThanOrEqual(0)
        expect(h.horas).toBeLessThan(24)
        expect(h.minutos).toBeGreaterThanOrEqual(0)
        expect(h.minutos).toBeLessThan(60)
        expect((h.horas * 60 + h.minutos) % 1440).toBe(m % 1440)
      }),
    )
  })
})

describe('bordes y valores extremos', () => {
  it('avanzar -0 y MAX_SAFE_INTEGER no corrompen el reloj', () => {
    expect(aplicarComando(inicial, { tipo: 'AvanzarTiempo', minutos: -0 }).estado).toEqual(inicial)
    const r = aplicarComando(inicial, { tipo: 'AvanzarTiempo', minutos: Number.MAX_SAFE_INTEGER })
    expect(r).toMatchObject({ ok: true, eventos: [{ tipo: 'desmayo' }] })
    expect(r.estado).toMatchObject({ dia: 2, minutoDelDia: 360 })
  })

  it('rechaza minutos no numéricos (string, null, undefined, -Infinity)', () => {
    for (const minutos of ['5', null, undefined, -Infinity] as unknown[]) {
      const r = aplicarComando(inicial, { tipo: 'AvanzarTiempo', minutos: minutos as number })
      expect(r.ok).toBe(false)
      expect(r.estado).toBe(inicial)
    }
  })

  it('CambiarVelocidad rechaza "2", 2.0000001, -0, null y objetos; acepta 2.0', () => {
    for (const velocidad of ['2', 2.0000001, -0, null, undefined, {}, [2]] as unknown[]) {
      const r = aplicarComando(inicial, {
        tipo: 'CambiarVelocidad',
        velocidad: velocidad as number,
      })
      expect(r.ok).toBe(false)
    }
    expect(aplicarComando(inicial, { tipo: 'CambiarVelocidad', velocidad: 2.0 }).ok).toBe(true)
  })

  it('un comando desconocido no devuelve undefined (no revienta al leer .estado)', () => {
    const r = aplicarComando(inicial, { tipo: 'Inventado' } as unknown as Comando)
    expect(r).toBeDefined()
    expect(r.estado).toBe(inicial)
  })

  it('avanzar 0 sobre un estado fuera de rango no provoca desmayo espurio', () => {
    const r = aplicarComando(con({ minutoDelDia: horaFin + 5 }), {
      tipo: 'AvanzarTiempo',
      minutos: 0,
    })
    expect(r).toMatchObject({ ok: true, eventos: [] })
  })

  it('el día no se queda atascado al pasar de 2^53', () => {
    const r = aplicarComando(con({ dia: Number.MAX_SAFE_INTEGER, minutoDelDia: horaFin }), {
      tipo: 'AvanzarTiempo',
      minutos: 1,
    })
    expect(Number.isSafeInteger(r.estado.dia)).toBe(true)
  })

  it('fechaDe con día 0, negativo, NaN o fraccionario devuelve fecha finita y válida', () => {
    for (const dia of [0, -5, NaN, Infinity, 1.9]) {
      const f = fechaDe({ dia })
      expect(Number.isFinite(f.año)).toBe(true)
      expect(Number.isFinite(f.diaDeEstacion)).toBe(true)
      expect(f.estacion).not.toBe('')
    }
  })

  it('horaDe con minuto negativo no devuelve horas negativas', () => {
    const h = horaDe({ minutoDelDia: -1 })
    expect(h.horas).toBeGreaterThanOrEqual(0)
    expect(h.minutos).toBeGreaterThanOrEqual(0)
  })

  it('4×21 días: el día 85 vuelve a primavera año 2; día 168 es invierno del año 2', () => {
    expect(fechaDe({ dia: 85 })).toEqual({ año: 2, estacion: 'primavera', diaDeEstacion: 1 })
    expect(fechaDe({ dia: 168 })).toEqual({ año: 2, estacion: 'invierno', diaDeEstacion: 21 })
  })
})

describe('minutosDeJuegoPorMs', () => {
  it('ms negativos, NaN o velocidad inválida no producen minutos negativos/NaN', () => {
    expect(minutosDeJuegoPorMs(-1000, 1)).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(minutosDeJuegoPorMs(NaN, 1))).toBe(false)
    expect(minutosDeJuegoPorMs(1000, -3)).toBeGreaterThanOrEqual(0)
  })

  it('un día exacto de ms da 1200 sin error de coma flotante (floor no pierde un minuto)', () => {
    for (const vel of CONFIG_TIEMPO.velocidades) {
      const ms = (CONFIG_TIEMPO.minutosRealesPorDia * 60_000) / vel
      expect(Math.floor(minutosDeJuegoPorMs(ms, vel))).toBe(1200)
    }
  })

  it('acumulando a 60 fps un día dura lo esperado (no se pierde ni gana tiempo)', () => {
    for (const vel of CONFIG_TIEMPO.velocidades) {
      const dt = 1000 / 60
      let acc = 0
      let e = inicial
      let frames = 0
      let desmayos = 0
      while (e.dia < 4 && frames < 10_000_000) {
        acc += minutosDeJuegoPorMs(dt, vel)
        const n = Math.floor(acc)
        acc -= n
        const r = aplicarComando(e, { tipo: 'AvanzarTiempo', minutos: n })
        if (r.ok && r.eventos.some((x) => x.tipo === 'desmayo')) desmayos++
        e = r.estado
        frames++
      }
      const minReales = (frames * dt) / 60_000 / 3
      const esperado = CONFIG_TIEMPO.minutosRealesPorDia / vel
      expect(desmayos).toBe(3)
      expect(Math.abs(minReales - esperado) / esperado).toBeLessThan(0.01)
    }
  })

  it('trocear el tiempo no cambia el total de minutos (linealidad)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { maxLength: 50 }),
        (xs) => {
          const suma = xs.reduce((a, x) => a + minutosDeJuegoPorMs(x, 2), 0)
          const total = minutosDeJuegoPorMs(
            xs.reduce((a, x) => a + x, 0),
            2,
          )
          expect(Math.abs(suma - total)).toBeLessThan(1e-6)
        },
      ),
    )
  })
})

describe('esquema con datos hostiles', () => {
  const base = { ...CONFIG_TIEMPO }
  const ok = (o: unknown) => v.safeParse(EsquemaConfigTiempo, o).success
  it.each([
    ['horaInicio negativa', { horaInicio: -1 }],
    ['horaInicio 1440', { horaInicio: 1440 }],
    ['horaFin NaN', { horaFin: Number.NaN }],
    ['horaFin Infinity', { horaFin: Infinity }],
    ['diasPorEstacion fraccionario', { diasPorEstacion: 1.5 }],
    ['minutosRealesPorDia Infinity', { minutosRealesPorDia: Infinity }],
    ['minutosRealesPorDia NaN', { minutosRealesPorDia: Number.NaN }],
    ['velocidad 0', { velocidades: [1, 0] }],
    ['velocidad fraccionaria', { velocidades: [1, 1.5] }],
    ['estación vacía', { estaciones: [''] }],
    ['estaciones como string', { estaciones: 'primavera' }],
    ['velocidades con string', { velocidades: [1, '2'] }],
  ])('rechaza %s', (_n, c) => {
    expect(ok({ ...base, ...c })).toBe(false)
  })
})
