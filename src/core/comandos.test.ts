import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  aplicarComandos,
  crearEstadoInicial,
  CONFIG_TIEMPO,
  EsquemaConfigTiempo,
  fechaDe,
  horaDe,
  tiempoDetenido,
  minutosDeJuegoPorMs,
  VERSION_FORMATO,
  type EstadoJuego,
} from './index'

const inicial = crearEstadoInicial({ semilla: 42, dineroInicial: 1000 })
const conTiempo = (dia: number, minutoDelDia: number): EstadoJuego => ({
  ...inicial,
  dia,
  minutoDelDia,
})
const avanzar = (e: EstadoJuego, minutos: number) =>
  aplicarComando(e, { tipo: 'AvanzarTiempo', minutos })

describe('estado inicial del reloj', () => {
  it('empieza el día 1 a las 06:00, sin pausa y a velocidad 1', () => {
    expect(VERSION_FORMATO).toBe(8)
    expect(inicial).toMatchObject({
      dia: 1,
      minutoDelDia: 360,
      pausado: false,
      velocidad: 1,
      modo: 'vida',
    })
    expect(horaDe(inicial)).toEqual({ horas: 6, minutos: 0 })
  })
})

describe('AvanzarTiempo', () => {
  it('suma los minutos al reloj', () => {
    const r = avanzar(inicial, 30)
    expect(r.ok).toBe(true)
    expect(r.estado.minutoDelDia).toBe(390)
    expect(r.estado.dia).toBe(1)
  })

  it('1200 min desde las 06:00 del día 1 ⇒ 02:00 del día 1, sin desmayo', () => {
    const r = avanzar(inicial, 1200)
    expect(r).toMatchObject({ ok: true, eventos: [] })
    expect(r.estado.dia).toBe(1)
    expect(r.estado.minutoDelDia).toBe(1560)
    expect(horaDe(r.estado)).toEqual({ horas: 2, minutos: 0 })
  })

  it('al superar las 02:00 pasa al día siguiente a las 06:00 e indica desmayo', () => {
    const r = avanzar(conTiempo(1, 1560), 1)
    expect(r).toMatchObject({ ok: true, eventos: [{ tipo: 'desmayo' }] })
    expect(r.estado).toMatchObject({ dia: 2, minutoDelDia: 360 })
  })

  it('un avance enorme solo cruza un día (el sobrante se descarta)', () => {
    const r = avanzar(inicial, 1_000_000)
    expect(r).toMatchObject({ ok: true, eventos: [{ tipo: 'desmayo' }] })
    expect(r.estado).toMatchObject({ dia: 2, minutoDelDia: 360 })
  })

  it('avanzar 0 no cambia nada', () => {
    const r = avanzar(inicial, 0)
    expect(r).toEqual({ ok: true, estado: inicial, eventos: [] })
  })

  it.each([-1, 1.5, Number.NaN, Infinity])('rechaza %s sin cambiar el estado', (minutos) => {
    expect(avanzar(inicial, minutos)).toEqual({
      ok: false,
      estado: inicial,
      error: 'parametro-invalido',
    })
  })

  it('no muta el estado de entrada', () => {
    const copia = structuredClone(inicial)
    avanzar(inicial, 10)
    expect(inicial).toEqual(copia)
  })
})

describe('pausa y velocidad', () => {
  it('Pausar y Reanudar cambian `pausado`', () => {
    const p = aplicarComando(inicial, { tipo: 'Pausar' })
    expect(p.estado.pausado).toBe(true)
    expect(aplicarComando(p.estado, { tipo: 'Reanudar' }).estado.pausado).toBe(false)
  })

  it('en pausa, AvanzarTiempo es ok pero no cambia nada (ni siquiera cruzando las 02:00)', () => {
    const pausado = aplicarComandos(conTiempo(3, 1500), [{ tipo: 'Pausar' }])
    for (const minutos of [0, 30, 10_000]) {
      expect(avanzar(pausado, minutos)).toEqual({ ok: true, estado: pausado, eventos: [] })
    }
  })

  it.each([1, 2, 3])('CambiarVelocidad(%i) es válido', (velocidad) => {
    const r = aplicarComando(inicial, { tipo: 'CambiarVelocidad', velocidad })
    expect(r.ok).toBe(true)
    expect(r.estado.velocidad).toBe(velocidad)
  })

  it.each([0, 4, -1, 1.5, Number.NaN])('CambiarVelocidad(%s) es inválido', (velocidad) => {
    expect(aplicarComando(inicial, { tipo: 'CambiarVelocidad', velocidad })).toEqual({
      ok: false,
      estado: inicial,
      error: 'parametro-invalido',
    })
  })
})

describe('casos adicionales de pausa y cruce', () => {
  it('Pausar sobre un estado ya pausado y Reanudar sin pausa no cambian nada', () => {
    const p = aplicarComando(inicial, { tipo: 'Pausar' }).estado
    expect(aplicarComando(p, { tipo: 'Pausar' }).estado).toEqual(p)
    expect(aplicarComando(inicial, { tipo: 'Reanudar' }).estado).toEqual(inicial)
  })

  it('cruce justo: 1500 + 61 desmaya y 1500 + 60 no', () => {
    expect(avanzar(conTiempo(1, 1500), 60)).toMatchObject({ ok: true, eventos: [] })
    const r = avanzar(conTiempo(1, 1500), 61)
    expect(r).toMatchObject({ ok: true, eventos: [{ tipo: 'desmayo' }] })
    expect(r.estado).toMatchObject({ dia: 2, minutoDelDia: 360 })
  })

  it('comando desconocido y día máximo seguro se rechazan sin cambiar el estado', () => {
    expect(aplicarComando(inicial, { tipo: 'X' } as never)).toMatchObject({ ok: false })
    const tope = conTiempo(Number.MAX_SAFE_INTEGER, 1560)
    expect(avanzar(tope, 1)).toEqual({ ok: false, estado: tope, error: 'limite-de-dia' })
  })
})

describe('calendario derivado de `dia`', () => {
  it('día 1 ⇒ año 1, primavera, día 1', () => {
    expect(fechaDe({ dia: 1 })).toEqual({ año: 1, estacion: 'primavera', diaDeEstacion: 1 })
  })

  it('día 21 sigue en la 1.ª estación; día 22 empieza la 2.ª', () => {
    expect(fechaDe({ dia: 21 })).toEqual({ año: 1, estacion: 'primavera', diaDeEstacion: 21 })
    expect(fechaDe({ dia: 22 })).toEqual({ año: 1, estacion: 'verano', diaDeEstacion: 1 })
  })

  it('día 84 es el último del año 1 (invierno); día 85 empieza el año 2', () => {
    expect(fechaDe({ dia: 84 })).toEqual({ año: 1, estacion: 'invierno', diaDeEstacion: 21 })
    expect(fechaDe({ dia: 85 })).toEqual({ año: 2, estacion: 'primavera', diaDeEstacion: 1 })
  })
})

describe('horaDe', () => {
  it.each([
    [360, 6, 0],
    [725, 12, 5],
    [1440, 0, 0],
    [1560, 2, 0],
  ])('minuto %i ⇒ %i:%i', (minutoDelDia, horas, minutos) => {
    expect(horaDe({ minutoDelDia })).toEqual({ horas, minutos })
  })
})

describe('minutosDeJuegoPorMs', () => {
  it('un día de juego dura minutosRealesPorDia reales a velocidad 1', () => {
    const msDia = CONFIG_TIEMPO.minutosRealesPorDia * 60_000
    expect(minutosDeJuegoPorMs(msDia, 1)).toBeCloseTo(
      CONFIG_TIEMPO.horaFin - CONFIG_TIEMPO.horaInicio,
    )
    expect(minutosDeJuegoPorMs(msDia, 1)).toBeCloseTo(1200)
  })

  it('escala linealmente con la velocidad y es fraccionario', () => {
    expect(minutosDeJuegoPorMs(1000, 3)).toBeCloseTo(3 * minutosDeJuegoPorMs(1000, 1))
    expect(Number.isInteger(minutosDeJuegoPorMs(1, 1))).toBe(false)
    expect(minutosDeJuegoPorMs(0, 2)).toBe(0)
  })
})

describe('esquema de data/tiempo.json', () => {
  const valido = { ...CONFIG_TIEMPO }
  const ok = (o: unknown) => v.safeParse(EsquemaConfigTiempo, o).success

  it('acepta los datos reales', () => {
    expect(ok(valido)).toBe(true)
    expect(CONFIG_TIEMPO).toMatchObject({ horaInicio: 360, horaFin: 1560, diasPorEstacion: 21 })
    expect(CONFIG_TIEMPO.estaciones).toHaveLength(4)
  })

  it.each([
    ['horaFin <= horaInicio', { horaFin: 360 }],
    ['jornada de más de 24 h', { horaFin: 2000 }],
    ['sin estaciones', { estaciones: [] }],
    ['estaciones repetidas', { estaciones: ['a', 'a'] }],
    ['diasPorEstacion 0', { diasPorEstacion: 0 }],
    ['minutosRealesPorDia 0', { minutosRealesPorDia: 0 }],
    ['sin velocidad 1', { velocidades: [2, 3] }],
    ['velocidades repetidas', { velocidades: [1, 1] }],
    ['clave desconocida', { extra: 1 }],
  ])('rechaza %s', (_n, cambio) => {
    expect(ok({ ...valido, ...cambio })).toBe(false)
  })
})

describe('CambiarModo (M2-05)', () => {
  const cambiar = (e: EstadoJuego, modo: 'vida' | 'plano' | 'x') =>
    aplicarComando(e, { tipo: 'CambiarModo', modo: modo as 'vida' })
  const plano = cambiar(inicial, 'plano').estado

  it('empieza en Vida y cambia a Plano y de vuelta sin tocar `pausado`', () => {
    expect(inicial.modo).toBe('vida')
    expect(plano.modo).toBe('plano')
    expect(plano.pausado).toBe(false)
    expect(cambiar(plano, 'vida').estado).toEqual(inicial)
  })

  it('el mismo modo devuelve el mismo objeto de estado', () => {
    expect(cambiar(inicial, 'vida')).toEqual({ ok: true, estado: inicial, eventos: [] })
    expect(cambiar(inicial, 'vida').estado).toBe(inicial)
  })

  it('un modo inválido se rechaza sin cambiar el estado', () => {
    expect(cambiar(inicial, 'x')).toEqual({
      ok: false,
      estado: inicial,
      error: 'parametro-invalido',
    })
  })

  it('en Plano el reloj no avanza (ni cruzando las 02:00) y MoverPersonaje no cambia el estado', () => {
    const e = cambiar(conTiempo(3, 1500), 'plano').estado
    for (const minutos of [0, 30, 10_000]) expect(avanzar(e, minutos).estado).toBe(e)
    const mover = aplicarComando(e, { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 100 })
    expect(mover).toEqual({ ok: true, estado: e, eventos: [] })
    expect(mover.estado).toBe(e)
  })

  it('volver a Vida conserva la pausa que eligió el jugador', () => {
    const pausado = aplicarComandos(inicial, [
      { tipo: 'Pausar' },
      { tipo: 'CambiarModo', modo: 'plano' },
      { tipo: 'CambiarModo', modo: 'vida' },
    ])
    expect(pausado.pausado).toBe(true)
    expect(avanzar(pausado, 10).estado).toBe(pausado)
    const sinPausa = aplicarComandos(inicial, [
      { tipo: 'CambiarModo', modo: 'plano' },
      { tipo: 'CambiarModo', modo: 'vida' },
    ])
    expect(avanzar(sinPausa, 10).estado.minutoDelDia).toBe(CONFIG_TIEMPO.horaInicio + 10)
  })

  it('tiempoDetenido: pausa o Plano', () => {
    expect(tiempoDetenido(inicial)).toBe(false)
    expect(tiempoDetenido(plano)).toBe(true)
    expect(tiempoDetenido({ pausado: true, modo: 'vida' })).toBe(true)
    expect(tiempoDetenido({ pausado: true, modo: 'plano' })).toBe(true)
  })
})
