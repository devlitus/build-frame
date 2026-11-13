import { describe, expect, it, vi } from 'vitest'
import { crearEstadoInicial } from '../../src/core'
import { Partida } from '../../src/game/partida'
import {
  Pincel,
  casillaEnCentroDeVista,
  casillaEnPunto,
  casillaMasCercana,
  casillaVecina,
  rectanguloDeEsquinas,
} from '../../src/game/pincel'
import { firmaVentana, tramosPorZona } from '../../src/game/valle/tramosZonas'

const LADO = 96
const T = 32

describe('rectángulo a partir de dos esquinas', () => {
  it('ordena las esquinas en cualquier dirección', () => {
    const r = { x0: 2, y0: 3, x1: 7, y1: 9 }
    expect(rectanguloDeEsquinas({ x: 2, y: 3 }, { x: 7, y: 9 })).toEqual(r)
    expect(rectanguloDeEsquinas({ x: 7, y: 9 }, { x: 2, y: 3 })).toEqual(r)
    expect(rectanguloDeEsquinas({ x: 7, y: 3 }, { x: 2, y: 9 })).toEqual(r)
    expect(rectanguloDeEsquinas({ x: 2, y: 9 }, { x: 7, y: 3 })).toEqual(r)
  })

  it('una sola casilla es un rectángulo de 1x1', () => {
    expect(rectanguloDeEsquinas({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({
      x0: 4,
      y0: 4,
      x1: 4,
      y1: 4,
    })
  })
})

describe('casillas a partir de un punto del mundo', () => {
  it('casillaEnPunto: semiabierta y undefined fuera del valle', () => {
    expect(casillaEnPunto(LADO, T, 0, 0)).toEqual({ x: 0, y: 0 })
    expect(casillaEnPunto(LADO, T, 31.9, 32)).toEqual({ x: 0, y: 1 })
    expect(casillaEnPunto(LADO, T, -0.1, 5)).toBeUndefined()
    expect(casillaEnPunto(LADO, T, LADO * T, 5)).toBeUndefined()
    expect(casillaEnPunto(LADO, T, Number.NaN, 5)).toBeUndefined()
  })

  it('casillaMasCercana: acota al valle para no perder el arrastre', () => {
    expect(casillaMasCercana(LADO, T, -500, 99999)).toEqual({ x: 0, y: LADO - 1 })
    expect(casillaMasCercana(LADO, T, 100, 100)).toEqual({ x: 3, y: 3 })
    expect(casillaMasCercana(LADO, T, Number.POSITIVE_INFINITY, 0)).toBeUndefined()
  })

  it('casillaEnCentroDeVista', () => {
    expect(casillaEnCentroDeVista(LADO, T, { cx: 48 * T + 3, cy: 10 * T })).toEqual({
      x: 48,
      y: 10,
    })
    expect(casillaEnCentroDeVista(LADO, T, { cx: -10, cy: 1e9 })).toEqual({ x: 0, y: LADO - 1 })
  })

  it('casillaVecina no sale del valle', () => {
    expect(casillaVecina(LADO, { x: 0, y: 0 }, 'izquierda')).toEqual({ x: 0, y: 0 })
    expect(casillaVecina(LADO, { x: 0, y: 0 }, 'arriba')).toEqual({ x: 0, y: 0 })
    expect(casillaVecina(LADO, { x: LADO - 1, y: 5 }, 'derecha')).toEqual({ x: LADO - 1, y: 5 })
    expect(casillaVecina(LADO, { x: 5, y: 5 }, 'abajo')).toEqual({ x: 5, y: 6 })
  })
})

describe('estado del pincel', () => {
  const nuevo = (herramienta: Parameters<Pincel['elegir']>[0] = 'cultivo') => {
    const p = new Pincel()
    p.abrir()
    p.elegir(herramienta)
    return p
  }

  it('empieza cerrado y sin herramienta; solo está activo con barra abierta y herramienta', () => {
    const p = new Pincel()
    expect(p.abierto).toBe(false)
    expect(p.activo).toBe(false)
    p.elegir('huerto') // con la barra cerrada no hace nada
    expect(p.herramienta).toBeUndefined()
    p.abrir()
    expect(p.abierto).toBe(true)
    expect(p.activo).toBe(false)
    p.elegir('huerto')
    expect(p.activo).toBe(true)
    p.elegir('borrar')
    expect(p.herramienta).toBe('borrar')
    p.elegir(undefined)
    expect(p.activo).toBe(false)
  })

  it('«Listo» (cerrar) lo suelta todo', () => {
    const p = nuevo('almacen')
    p.empezarArrastre({ x: 1, y: 1 })
    p.pulsarMarca({ x: 5, y: 5 })
    p.cerrar()
    expect(p.abierto).toBe(false)
    expect(p.herramienta).toBeUndefined()
    expect(p.arrastrando).toBe(false)
    expect(p.cursor).toBeUndefined()
    expect(p.rectanguloPrevio).toBeUndefined()
  })

  it('avisa a los suscriptores solo cuando algo cambia', () => {
    const p = new Pincel()
    const f = vi.fn()
    const baja = p.suscribir(f)
    p.abrir()
    p.abrir()
    expect(f).toHaveBeenCalledTimes(1)
    p.elegir('cultivo')
    p.elegir('cultivo')
    expect(f).toHaveBeenCalledTimes(2)
    baja()
    p.cerrar()
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('arrastre: la vista previa sigue al puntero y al soltar entrega el rectángulo ordenado', () => {
    const p = nuevo('vivienda')
    p.empezarArrastre({ x: 10, y: 10 })
    expect(p.rectanguloPrevio).toEqual({ x0: 10, y0: 10, x1: 10, y1: 10 })
    p.moverArrastre({ x: 7, y: 14 })
    expect(p.rectanguloPrevio).toEqual({ x0: 7, y0: 10, x1: 10, y1: 14 })
    expect(p.terminarArrastre()).toEqual({ x0: 7, y0: 10, x1: 10, y1: 14 })
    expect(p.arrastrando).toBe(false)
    expect(p.terminarArrastre()).toBeUndefined()
  })

  it('arrastre cancelado (segundo dedo) no entrega nada', () => {
    const p = nuevo()
    p.empezarArrastre({ x: 1, y: 1 })
    p.cancelarArrastre()
    expect(p.terminarArrastre()).toBeUndefined()
  })

  it('sin herramienta no se puede arrastrar', () => {
    const p = new Pincel()
    p.abrir()
    p.empezarArrastre({ x: 1, y: 1 })
    expect(p.arrastrando).toBe(false)
  })

  it('teclado: Enter coloca el cursor, marca la esquina y aplica', () => {
    const p = nuevo()
    expect(p.pulsarMarca({ x: 20, y: 20 })).toBeUndefined()
    expect(p.cursor).toEqual({ x: 20, y: 20 })
    expect(p.rectanguloPrevio).toEqual({ x0: 20, y0: 20, x1: 20, y1: 20 })
    expect(p.pulsarMarca({ x: 0, y: 0 })).toBeUndefined() // marca la primera esquina
    expect(p.ancla).toEqual({ x: 20, y: 20 })
    expect(p.moverCursor(LADO, 'izquierda')).toBe(true)
    expect(p.moverCursor(LADO, 'arriba')).toBe(true)
    expect(p.moverCursor(LADO, 'arriba')).toBe(true)
    expect(p.rectanguloPrevio).toEqual({ x0: 19, y0: 18, x1: 20, y1: 20 })
    expect(p.pulsarMarca({ x: 0, y: 0 })).toEqual({ x0: 19, y0: 18, x1: 20, y1: 20 })
    expect(p.ancla).toBeUndefined()
    expect(p.cursor).toEqual({ x: 19, y: 18 })
  })

  it('teclado: sin cursor las flechas no son del pincel; el cursor no sale del valle', () => {
    const p = nuevo()
    expect(p.moverCursor(LADO, 'derecha')).toBe(false)
    p.pulsarMarca({ x: 0, y: 0 })
    expect(p.moverCursor(LADO, 'izquierda')).toBe(true)
    expect(p.cursor).toEqual({ x: 0, y: 0 })
  })

  it('teclado: Esc suelta primero la esquina y luego el cursor', () => {
    const p = nuevo()
    p.pulsarMarca({ x: 5, y: 5 })
    p.pulsarMarca({ x: 5, y: 5 })
    expect(p.cancelarTeclado()).toBe(true)
    expect(p.ancla).toBeUndefined()
    expect(p.cursor).toBeDefined()
    expect(p.cancelarTeclado()).toBe(true)
    expect(p.cursor).toBeUndefined()
    expect(p.cancelarTeclado()).toBe(false)
  })

  it('cambiar de herramienta descarta la esquina marcada pero conserva el cursor', () => {
    const p = nuevo()
    p.pulsarMarca({ x: 5, y: 5 })
    p.pulsarMarca({ x: 5, y: 5 })
    p.elegir('borrar')
    expect(p.ancla).toBeUndefined()
    expect(p.cursor).toEqual({ x: 5, y: 5 })
  })
})

describe('el pincel en la partida', () => {
  it('al volver al Modo Vida la barra se cierra', () => {
    const partida = new Partida(crearEstadoInicial({ semilla: 1 }))
    partida.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    partida.pincel.abrir()
    partida.pincel.elegir('cultivo')
    partida.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    expect(partida.pincel.abierto).toBe(false)
    expect(partida.pincel.herramienta).toBeUndefined()
  })

  it('los avisos de interfaz llegan a los suscriptores y dejan de llegar al darse de baja', () => {
    const partida = new Partida(crearEstadoInicial({ semilla: 1 }))
    const f = vi.fn()
    const baja = partida.suscribirAvisos(f)
    partida.avisarInterfaz('zona-sin-casillas')
    baja()
    partida.avisarInterfaz('zona-sin-casillas')
    expect(f).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledWith('zona-sin-casillas')
  })

  it('pintar un rectángulo sin parcelas propias lo rechaza el núcleo con sin-casillas-validas', () => {
    const partida = new Partida(crearEstadoInicial({ semilla: 1 }))
    const r = partida.emitir({ tipo: 'PintarZona', x0: 0, y0: 0, x1: 3, y1: 3, zona: 'cultivo' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('sin-casillas-validas')
  })
})

describe('tramos de zona para el dibujo', () => {
  const lado = 6
  const celdas = (...filas: string[]) => filas.join('')

  it('agrupa casillas contiguas de la misma zona por filas', () => {
    const z = celdas('..cc.h', 'cc..hh', '......', '.vvvv.', '......', 'a....a')
    const t = tramosPorZona(z, lado, { x0: 0, y0: 0, x1: 5, y1: 5 })
    expect(t.cultivo).toEqual([
      { y: 0, x0: 2, x1: 3 },
      { y: 1, x0: 0, x1: 1 },
    ])
    expect(t.huerto).toEqual([
      { y: 0, x0: 5, x1: 5 },
      { y: 1, x0: 4, x1: 5 },
    ])
    expect(t.vivienda).toEqual([{ y: 3, x0: 1, x1: 4 }])
    expect(t.almacen).toEqual([
      { y: 5, x0: 0, x1: 0 },
      { y: 5, x0: 5, x1: 5 },
    ])
  })

  it('una zona distinta corta el tramo y la ventana recorta', () => {
    const z = celdas('ccvvcc', '......', '......', '......', '......', '......')
    const t = tramosPorZona(z, lado, { x0: 1, y0: 0, x1: 4, y1: 0 })
    expect(t.cultivo).toEqual([
      { y: 0, x0: 1, x1: 1 },
      { y: 0, x0: 4, x1: 4 },
    ])
    expect(t.vivienda).toEqual([{ y: 0, x0: 2, x1: 3 }])
  })

  it('la firma de una ventana solo cambia si cambia lo que contiene', () => {
    const base = celdas('......', '......', '......', '......', '......', '......')
    const v = { x0: 0, y0: 0, x1: 2, y1: 2 }
    const pintado = base.slice(0, 3 * lado + 3) + 'c' + base.slice(3 * lado + 4) // fuera de la ventana
    expect(firmaVentana(pintado, lado, v)).toBe(firmaVentana(base, lado, v))
    const dentro = 'c' + base.slice(1)
    expect(firmaVentana(dentro, lado, v)).not.toBe(firmaVentana(base, lado, v))
  })
})
