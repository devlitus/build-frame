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
import { PintorZonas } from '../../src/game/pintorZonas'
import { fakeCameraScene, fakePointer } from './fixtures/fake-scene'

vi.mock('phaser', () => ({
  default: { Core: { Events: { BLUR: 'blur', HIDDEN: 'hidden' } } },
}))

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

// E2E-16 · Rompedor: the zone brush gestures (`PintorZonas`, src/game/pintorZonas.ts) with a fake
// scene. Replaces the logic of pincel-rompedor «un segundo dedo a mitad de un pintado anula el
// gesto…», «un toque cancelado por el sistema no pinta», «cambiar de modo a mitad de un arrastre no
// pinta…», «cerrar la barra con un arrastre en curso no pinta y al reabrir no queda una vista previa
// fantasma», «arrastrar y soltar fuera de la pantalla pinta hasta el borde sin errores»; pincel-zonas
// «un toque o clic sin arrastrar pinta una casilla», «con dos dedos la cámara se mueve y no se
// pinta»; m5-00-rompedor «pincel: un arrastre de un dedo pinta exactamente las casillas bajo el
// dedo» (DPR 1, 1.25, 2, 2.625, 3).
describe('PintorZonas gestures (fake scene)', () => {
  function montar(dpr = 1) {
    const f = fakeCameraScene(412, 915, dpr)
    const k = 1 / f.scale.zoom
    f.main.setZoom(k)
    f.main.setScroll(40 * T - f.scale.width / 2, 40 * T - f.scale.height / 2)
    const pincel = new Pincel()
    const aplicados: unknown[] = []
    const pintor = new PintorZonas(f.scene as never, pincel, LADO, T, (r) => aplicados.push(r))
    pincel.abrir()
    pincel.elegir('cultivo')
    return { f, pincel, aplicados, pintor }
  }

  it.each([1, 1.25, 2, 2.625, 3])(
    'DPR %f: a one-finger drag paints exactly the tiles under the finger',
    (dpr) => {
      const { f, aplicados } = montar(dpr)
      const a = f.tileCentre(38, 37)
      const b = f.tileCentre(42, 41)
      const p = fakePointer(1, a.x, a.y, true)
      f.down(p)
      f.move(p, (a.x + b.x) / 2, (a.y + b.y) / 2)
      f.move(p, b.x, b.y)
      f.up(p)
      expect(aplicados).toEqual([{ x0: 38, y0: 37, x1: 42, y1: 41 }])
    },
  )

  it('a tap or click without dragging paints one tile', () => {
    const { f, aplicados } = montar()
    const a = f.tileCentre(40, 40)
    for (const tactil of [true, false]) {
      const p = fakePointer(tactil ? 1 : 0, a.x, a.y, tactil)
      f.down(p)
      f.up(p)
    }
    expect(aplicados).toEqual([
      { x0: 40, y0: 40, x1: 40, y1: 40 },
      { x0: 40, y0: 40, x1: 40, y1: 40 },
    ])
  })

  it('a second finger mid-paint cancels the gesture (nothing painted, no preview); then one finger paints again', () => {
    const { f, pincel, aplicados } = montar()
    const a = f.tileCentre(38, 38)
    const p1 = fakePointer(1, a.x, a.y, true)
    f.down(p1)
    f.move(p1, a.x + 64, a.y + 64)
    expect(pincel.arrastrando).toBe(true)
    const p2 = fakePointer(2, 300, 300, true)
    f.down(p2) // two fingers: the camera pans/zooms, the brush does not paint
    expect(pincel.arrastrando).toBe(false)
    f.move(p1, a.x + 100, a.y)
    f.up(p2)
    f.up(p1)
    expect(aplicados).toEqual([])
    const p3 = fakePointer(3, a.x, a.y, true)
    f.down(p3)
    f.up(p3)
    expect(aplicados).toEqual([{ x0: 38, y0: 38, x1: 38, y1: 38 }])
  })

  it('a touch cancelled by the system does not paint', () => {
    const { f, pincel, aplicados } = montar()
    const a = f.tileCentre(38, 38)
    const p = fakePointer(1, a.x, a.y, true)
    f.down(p)
    f.move(p, a.x + 64, a.y)
    f.up(p, true)
    expect(aplicados).toEqual([])
    expect(pincel.arrastrando).toBe(false)
  })

  it('switching mode (reset) or losing the focus mid-drag does not paint; the brush works afterwards', () => {
    const { f, pincel, aplicados, pintor } = montar()
    const a = f.tileCentre(38, 38)
    const p = fakePointer(0, a.x, a.y, false)
    f.down(p)
    f.move(p, a.x + 64, a.y)
    pintor.reiniciar() // what the scene does on a mode change
    f.up(p)
    f.down(p)
    f.move(p, a.x + 64, a.y)
    f.game.events.emit('blur')
    f.up(p)
    expect(aplicados).toEqual([])
    expect(pincel.arrastrando).toBe(false)
    f.down(p)
    f.up(p)
    expect(aplicados).toHaveLength(1)
  })

  it('closing the bar with a drag in progress paints nothing and leaves no ghost preview when reopened', () => {
    const { f, pincel, aplicados } = montar()
    const a = f.tileCentre(38, 38)
    const p = fakePointer(0, a.x, a.y, false)
    f.down(p)
    f.move(p, a.x + 64, a.y + 64)
    pincel.cerrar()
    f.move(p, a.x + 96, a.y + 96)
    f.up(p)
    expect(aplicados).toEqual([])
    pincel.abrir()
    pincel.elegir('huerto')
    expect(pincel.arrastrando).toBe(false)
  })

  it('dragging and releasing outside the screen paints up to the edge of the valley', () => {
    const { f, aplicados } = montar()
    const a = f.tileCentre(90, 90)
    // Far beyond the bottom-right corner of the valley.
    const p = fakePointer(0, a.x, a.y, false)
    f.down(p)
    f.move(p, a.x + 5000, a.y + 5000)
    f.up(p)
    expect(aplicados).toEqual([{ x0: 90, y0: 90, x1: 95, y1: 95 }])
  })

  it('right or middle button and an inactive brush (no tool) do not paint', () => {
    const { f, pincel, aplicados } = montar()
    const a = f.tileCentre(38, 38)
    for (const boton of [1, 2]) {
      const p = fakePointer(0, a.x, a.y, false, boton)
      f.down(p)
      f.up(p)
    }
    pincel.elegir(undefined)
    const t = fakePointer(1, a.x, a.y, true)
    f.down(t)
    f.up(t)
    expect(aplicados).toEqual([])
  })

  it('erasing and repainting through the game is free: money and materials never change', () => {
    // Original e2e: pincel-zonas.spec.ts «repintar con otra zona la sustituye y el borrador la quita
    // (gratis, sin tocar el dinero)».
    const e0 = crearEstadoInicial({ semilla: 42 })
    const partida = new Partida(e0)
    partida.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    const C = e0.valle.casillasPorParcela
    const N = e0.valle.parcelasPorLado
    const i = Math.floor(e0.aparicion.y / C) * N + Math.floor(e0.aparicion.x / C)
    partida.emitir({ tipo: 'ComprarParcela', indice: i })
    const dinero = partida.estado.dinero
    const materiales = partida.estado.materiales
    const x0 = (i % N) * C
    const y0 = Math.floor(i / N) * C
    for (const zona of ['cultivo', 'huerto', 'vivienda', 'almacen'] as const) {
      expect(partida.emitir({ tipo: 'PintarZona', x0, y0, x1: x0 + 3, y1: y0 + 3, zona }).ok).toBe(
        true,
      )
      expect(partida.estado.zonas[y0 * LADO + x0]).toBe(zona[0])
    }
    expect(partida.emitir({ tipo: 'BorrarZona', x0, y0, x1: x0 + 3, y1: y0 + 3 }).ok).toBe(true)
    expect(partida.estado.zonas[y0 * LADO + x0]).toBe('.')
    expect(partida.estado.dinero).toBe(dinero)
    expect(partida.estado.materiales).toEqual(materiales)
  })
})

describe('PintorZonas: scene shutdown', () => {
  it('removes its pointer, blur and hidden listeners (restarting the valley leaves no duplicate gesture)', () => {
    const f = fakeCameraScene(412, 915)
    new PintorZonas(f.scene as never, new Pincel(), LADO, T, () => undefined)
    f.scene.events.emit('shutdown')
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside'])
      expect(f.input.cuenta(ev), ev).toBe(0)
    expect(f.game.events.cuenta('blur')).toBe(0)
    expect(f.game.events.cuenta('hidden')).toBe(0)
  })
})
