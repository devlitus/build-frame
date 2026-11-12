import { describe, expect, it, vi } from 'vitest'
import { crearEstadoInicial } from '../../src/core'
import {
  areaLibre,
  centroParaVer,
  esToqueDeSeleccion,
  parcelaEnPunto,
  puntoDeToque,
  rectParcela,
} from '../../src/game/picking'
import { CONFIG_CAMARA } from '../../src/game/camara/config'
import { Partida } from '../../src/game/partida'
import { Seleccion } from '../../src/game/seleccion'
import { estadoDeCompra, nombreParcela, textoPrecio } from '../../src/ui/parcelaTextos'
import { parcelaComprable } from '../../src/core'

/** M3-03 · Picking, toque frente a arrastre, selección y textos del panel. */

const G = { parcelasPorLado: 6, ladoParcelaPx: 512 }

describe('parcelaEnPunto (píxel del mundo a parcela)', () => {
  it('esquinas y centro del valle', () => {
    expect(parcelaEnPunto(G, 0, 0)).toBe(0)
    expect(parcelaEnPunto(G, 256, 256)).toBe(0)
    expect(parcelaEnPunto(G, 3071.9, 3071.9)).toBe(35)
    expect(parcelaEnPunto(G, 3071.9, 0)).toBe(5)
    expect(parcelaEnPunto(G, 0, 3071.9)).toBe(30)
  })

  it('el borde compartido pertenece a la siguiente parcela (intervalos semiabiertos)', () => {
    expect(parcelaEnPunto(G, 511.99, 0)).toBe(0)
    expect(parcelaEnPunto(G, 512, 0)).toBe(1)
    expect(parcelaEnPunto(G, 512, 512)).toBe(7)
    expect(parcelaEnPunto(G, 1024, 1536)).toBe(3 * 6 + 2)
  })

  it('fuera del valle o con valores inválidos no hay parcela', () => {
    expect(parcelaEnPunto(G, -0.01, 10)).toBeUndefined()
    expect(parcelaEnPunto(G, 10, -1)).toBeUndefined()
    expect(parcelaEnPunto(G, 3072, 10)).toBeUndefined()
    expect(parcelaEnPunto(G, 10, 3072)).toBeUndefined()
    expect(parcelaEnPunto(G, Number.NaN, 10)).toBeUndefined()
    expect(parcelaEnPunto(G, Infinity, 10)).toBeUndefined()
    expect(parcelaEnPunto({ ...G, ladoParcelaPx: 0 }, 1, 1)).toBeUndefined()
  })

  it('concuerda con el rectángulo de cada parcela', () => {
    for (let i = 0; i < 36; i++) {
      const r = rectParcela(G, i)
      expect(parcelaEnPunto(G, r.x, r.y)).toBe(i)
      expect(parcelaEnPunto(G, r.x + r.ancho / 2, r.y + r.alto / 2)).toBe(i)
      expect(parcelaEnPunto(G, r.x + r.ancho - 0.01, r.y + r.alto - 0.01)).toBe(i)
    }
  })
})

describe('esToqueDeSeleccion (toque corto frente a arrastre)', () => {
  const U = CONFIG_CAMARA.umbralSeleccionPx
  it('el umbral viene de la configuración, no de un número suelto', () => {
    expect(U).toBeGreaterThan(0)
    expect(esToqueDeSeleccion(0, 50, false)).toBe(true)
    expect(esToqueDeSeleccion(U, 50, false)).toBe(true)
    expect(esToqueDeSeleccion(U + 0.1, 50, false)).toBe(false)
  })

  it('un arrastre largo no es toque', () => {
    expect(esToqueDeSeleccion(120, 80, true)).toBe(false)
    expect(esToqueDeSeleccion(120, 80, false)).toBe(false)
  })

  it('en táctil un toque largo no selecciona; con ratón un clic largo sí', () => {
    expect(esToqueDeSeleccion(2, CONFIG_CAMARA.umbralSeleccionMs - 1, true)).toBe(true)
    expect(esToqueDeSeleccion(2, CONFIG_CAMARA.umbralSeleccionMs, true)).toBe(false)
    expect(esToqueDeSeleccion(2, 5000, false)).toBe(true)
  })

  it('un desplazamiento no numérico no cuenta como toque', () => {
    expect(esToqueDeSeleccion(Number.NaN, 10, false)).toBe(false)
  })
})

describe('Seleccion (estado de interfaz observable)', () => {
  it('selecciona, avisa y mantiene la misma parcela sin avisar de nuevo', () => {
    const s = new Seleccion()
    const f = vi.fn()
    s.suscribir(f)
    s.seleccionar(14)
    expect(s.indice).toBe(14)
    expect(f).toHaveBeenCalledTimes(1)
    s.seleccionar(14)
    expect(f).toHaveBeenCalledTimes(1)
    s.seleccionar(15)
    expect(s.indice).toBe(15)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('deseleccionar libera también la zona ocupada y no avisa si no había nada', () => {
    const s = new Seleccion()
    const f = vi.fn()
    s.suscribir(f)
    s.deseleccionar()
    expect(f).not.toHaveBeenCalled()
    s.seleccionar(3)
    s.fijarOcupado({ x: 1, y: 2, ancho: 3, alto: 4 })
    s.deseleccionar()
    expect(s.indice).toBeUndefined()
    expect(s.ocupado).toBeUndefined()
  })

  it('ignora índices inválidos y cancela la suscripción', () => {
    const s = new Seleccion()
    s.seleccionar(-1)
    s.seleccionar(1.5)
    s.seleccionar(Number.NaN)
    expect(s.indice).toBeUndefined()
    const f = vi.fn()
    const baja = s.suscribir(f)
    baja()
    s.seleccionar(2)
    expect(f).not.toHaveBeenCalled()
  })

  it('un suscriptor roto no impide avisar a los demás', () => {
    const s = new Seleccion()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const f = vi.fn()
    s.suscribir(() => {
      throw new Error('roto')
    })
    s.suscribir(f)
    s.seleccionar(1)
    expect(f).toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('Partida y selección', () => {
  const nueva = () => new Partida(crearEstadoInicial({ semilla: 1 }))

  it('volver a Vida suelta la selección; en Plano se mantiene', () => {
    const p = nueva()
    p.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    p.seleccion.seleccionar(7)
    p.emitir({ tipo: 'AvanzarTiempo', minutos: 1 })
    expect(p.seleccion.indice).toBe(7)
    p.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    expect(p.seleccion.indice).toBeUndefined()
  })

  it('reemplazar el estado (reinicio del valle) suelta la selección', () => {
    const p = nueva()
    p.seleccion.seleccionar(2)
    p.reemplazar(crearEstadoInicial({ semilla: 2 }))
    expect(p.seleccion.indice).toBeUndefined()
  })
})

describe('Área libre y cámara', () => {
  const pantalla = { ancho: 1280, alto: 720 }
  const arriba = CONFIG_CAMARA.reservaHudSuperiorPx
  const abajo = CONFIG_CAMARA.reservaHudInferiorPx

  it('sin panel solo se reservan las franjas del HUD', () => {
    expect(areaLibre(pantalla, undefined)).toEqual({
      x: 0,
      y: arriba,
      ancho: 1280,
      alto: 720 - arriba - abajo,
    })
  })

  it('una tarjeta a la derecha recorta el ancho; una hoja inferior, el alto', () => {
    const lado = areaLibre(pantalla, { x: 948, y: 72, ancho: 320, alto: 300 })
    expect(lado.x).toBe(0)
    expect(lado.ancho).toBe(948)
    const movil = { ancho: 412, alto: 915 }
    const hoja = areaLibre(movil, { x: 8, y: 600, ancho: 396, alto: 243 })
    expect(hoja.ancho).toBe(412)
    expect(hoja.y + hoja.alto).toBe(600)
  })

  const vista = { zoom: 1, cx: 1536, cy: 1536 }
  const libre = { x: 0, y: 72, ancho: 948, alto: 576 }

  it('no mueve la cámara si la parcela se ve entera', () => {
    const pequena = { x: 1400, y: 1400, ancho: 200, alto: 200 }
    expect(centroParaVer(vista, pantalla, libre, pequena)).toBeUndefined()
  })

  it('centra la parcela tapada por el panel en la zona libre', () => {
    const p = { x: 1536 + 200, y: 1400, ancho: 200, alto: 200 }
    const c = centroParaVer(vista, pantalla, libre, p)
    expect(c).toBeDefined()
    // Tras mover, el centro de la parcela cae en el centro de la zona libre.
    const nueva = { ...vista, cx: c?.x ?? 0, cy: c?.y ?? 0 }
    const sx = (p.x + 100 - nueva.cx) * nueva.zoom + pantalla.ancho / 2
    const sy = (p.y + 100 - nueva.cy) * nueva.zoom + pantalla.alto / 2
    expect(sx).toBeCloseTo(libre.x + libre.ancho / 2)
    expect(sy).toBeCloseTo(libre.y + libre.alto / 2)
  })

  it('una parcela mayor que la zona libre se deja si su centro ya está en ella', () => {
    const grande = { x: 1024, y: 1024, ancho: 1024, alto: 1024 }
    expect(centroParaVer(vista, pantalla, libre, grande)).toBeUndefined()
  })

  it('punto de toque: dentro de la parcela y de la zona libre', () => {
    const p = rectParcela(G, 14) // fila 2, columna 2
    const v = { zoom: 0.6, cx: 1536, cy: 1536 }
    const punto = puntoDeToque(v, pantalla, areaLibre(pantalla, undefined), p)
    expect(punto).toBeDefined()
    const mundo = {
      x: v.cx + ((punto?.x ?? 0) - pantalla.ancho / 2) / v.zoom,
      y: v.cy + ((punto?.y ?? 0) - pantalla.alto / 2) / v.zoom,
    }
    expect(parcelaEnPunto(G, mundo.x, mundo.y)).toBe(14)
    // Una parcela fuera de pantalla no tiene punto.
    expect(
      puntoDeToque(v, pantalla, areaLibre(pantalla, undefined), rectParcela(G, 0)),
    ).toBeUndefined()
  })
})

describe('Textos del panel', () => {
  it('nombre amable: columna en letra y fila desde 1', () => {
    expect(nombreParcela(0, 0)).toBe('A1')
    expect(nombreParcela(2, 1)).toBe('B3')
    expect(nombreParcela(5, 5)).toBe('F6')
    expect(nombreParcela(0, 26)).toBe('AA1')
  })

  it('precio con singular y plural', () => {
    expect(textoPrecio(1)).toBe('1 moneda')
    expect(textoPrecio(120)).toBe('120 monedas')
  })

  it('estado de compra según el motivo de parcelaComprable', () => {
    const base = crearEstadoInicial({ semilla: 5 })
    const rica = { ...base, dinero: 1e9 }
    const ok = estadoDeCompra(parcelaComprable(rica, 0), rica.dinero)
    expect(ok.texto).toBe('Se puede comprar')
    const pobre = { ...base, dinero: 0 }
    const fondos = estadoDeCompra(parcelaComprable(pobre, 0), 0)
    expect(fondos.texto).toMatch(/^No te llega el dinero \(te faltan \d+\)$/)
    const valle = {
      ...base.valle,
      parcelas: base.valle.parcelas.map((p, i) =>
        i === 0 ? { ...p, estado: 'propia' as const } : p,
      ),
    }
    const conPropia = { ...rica, valle }
    const lejana = estadoDeCompra(parcelaComprable(conPropia, 35), rica.dinero)
    expect(lejana.texto).toBe('Debe tocar una de tus parcelas')
    const propia = estadoDeCompra(parcelaComprable(conPropia, 0), rica.dinero)
    expect(propia.tono).toBe('propia')
  })
})
