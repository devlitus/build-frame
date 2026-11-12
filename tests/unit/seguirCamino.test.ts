/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { describe, expect, it } from 'vitest'
import { aplicarComando, buscarCamino, crearEstadoInicial, CONFIG_PERSONAJE } from '../../src/core'
import { SeguidorCamino } from '../../src/game/seguirCamino'
import { CONFIG_TACTIL, intencionJoystick } from '../../src/game/joystick'

describe('SeguidorCamino', () => {
  it('lleva al personaje hasta el destino sin pasarse y luego se cancela', () => {
    let estado = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const s = new SeguidorCamino()
    const p = estado.personaje
    expect(s.fijar(estado, p, { x: p.x + 3, y: p.y })).toBe(true)
    const fin = s.destino!
    for (let i = 0; i < 600 && s.destino; i++) {
      const c = s.siguiente(estado.personaje, 16)
      if (c) estado = aplicarComando(estado, c).estado
    }
    expect(s.destino).toBeUndefined()
    expect(Math.hypot(estado.personaje.x - fin.x, estado.personaje.y - fin.y)).toBeLessThan(0.05)
  })

  it('ms nunca supera lo que falta para llegar', () => {
    const estado = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const s = new SeguidorCamino()
    const p = estado.personaje
    s.fijar(estado, p, { x: p.x + 2, y: p.y + 2 })
    const c = s.siguiente(p, 1000)
    if (c?.tipo !== 'MoverPersonaje') throw new Error('sin comando')
    // Con 1000 ms recorrería 4 casillas: solo avanza hasta el primer punto (a ≤ √2 casillas).
    const avance = (c.ms / 1000) * CONFIG_PERSONAJE.velocidadCasillasPorSegundo
    expect(avance).toBeGreaterThan(0)
    expect(avance).toBeLessThanOrEqual(Math.SQRT2 + 1e-9)
  })

  it('se cancela si el personaje no avanza (atasco)', () => {
    const estado = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const s = new SeguidorCamino()
    const p = estado.personaje
    s.fijar(estado, { x: p.x + 0.4, y: p.y }, { x: p.x + 5, y: p.y })
    // El personaje no se mueve nunca: no se aplica ningún comando.
    for (let i = 0; i < 30; i++) s.siguiente(p, 16)
    expect(s.destino).toBeUndefined()
  })

  it('cancelar() borra el destino', () => {
    const estado = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const s = new SeguidorCamino()
    s.fijar(estado, estado.personaje, { x: estado.personaje.x + 4, y: estado.personaje.y })
    s.cancelar()
    expect(s.destino).toBeUndefined()
    expect(s.siguiente(estado.personaje, 16)).toBeUndefined()
  })
})

describe('intencionJoystick', () => {
  const o = { x: 100, y: 100 }
  it('zona muerta: sin intención', () => {
    expect(intencionJoystick(o, { x: 101, y: 100 })).toEqual({ dx: 0, dy: 0 })
  })
  it('magnitud proporcional hasta el radio y limitada a 1', () => {
    const r = CONFIG_TACTIL.radioJoystickPx
    expect(intencionJoystick(o, { x: 100 + r / 2, y: 100 }).dx).toBeCloseTo(0.5)
    const lejos = intencionJoystick(o, { x: 100, y: 100 + r * 5 })
    expect(lejos.dy).toBeCloseTo(1)
    expect(lejos.dx).toBeCloseTo(0)
  })
  it('conserva la dirección en diagonal con módulo ≤ 1', () => {
    const i = intencionJoystick(o, { x: 600, y: 600 })
    expect(Math.hypot(i.dx, i.dy)).toBeCloseTo(1)
    expect(i.dx).toBeCloseTo(i.dy)
  })
})

describe('SeguidorCamino.comandos', () => {
  it('con deltas largos llega tan rápido como el teclado (sin perder el sobrante en cada casilla)', () => {
    let estado = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
    const s = new SeguidorCamino()
    const p = estado.personaje
    // Un destino con ruta larga (≥ 6 casillas), el primero que haya en este orden.
    const destino = [
      { x: p.x, y: p.y + 7 },
      { x: p.x + 7, y: p.y },
      { x: p.x, y: p.y - 7 },
      { x: p.x - 7, y: p.y },
    ].find((d) => buscarCamino(estado, p, d).length >= 7)
    if (!destino) throw new Error('sin ruta larga')
    s.fijar(estado, p, destino)
    const ruta = buscarCamino(estado, p, destino)
    let largo = 0
    let previo: { x: number; y: number } = p
    for (const q of ruta) {
      largo += Math.hypot(q.x - previo.x, q.y - previo.y)
      previo = q
    }
    let ms = 0
    let comandos = 0
    for (let i = 0; i < 400 && s.destino; i++) {
      for (const c of s.comandos(estado.personaje, 100)) {
        estado = aplicarComando(estado, c).estado
        comandos++
      }
      ms += 100
    }
    expect(s.destino).toBeUndefined()
    // Tiempo ideal (el teclado no pierde nada): longitud / velocidad; margen de dos fotogramas.
    const ideal = (largo / CONFIG_PERSONAJE.velocidadCasillasPorSegundo) * 1000
    expect(ms).toBeLessThanOrEqual(ideal + 200)
    expect(comandos).toBeGreaterThan(0)
  })
})
