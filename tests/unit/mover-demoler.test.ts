/* eslint-disable @typescript-eslint/no-non-null-assertion -- catálogo conocido en tests */
import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  crearEstadoInicial,
  defEdificio,
  type EstadoJuego,
  type EventoJuego,
} from '../../src/core'
import { calcularSilueta, centroDeSilueta, sePuedeColocar } from '../../src/game/construir'
import { Partida } from '../../src/game/partida'
import { textoColocacion, textoReembolso } from '../../src/ui/construirTextos'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 5000 })

/** Parcela propia con vivienda y almacén pintados, en Plano, sin obstáculos. */
function escenario(): EstadoJuego {
  let e: EstadoJuego = { ...base, obstaculos: [], modo: 'plano' }
  const C = e.valle.casillasPorParcela
  const N = e.valle.parcelasPorLado
  const i = e.valle.parcelas.findIndex(
    (_, k) =>
      !e.valle.rio.includes(k) &&
      k !== Math.floor(e.aparicion.y / C) * N + Math.floor(e.aparicion.x / C),
  )
  const px = (i % N) * C
  const py = Math.floor(i / N) * C
  const pasos = [
    { tipo: 'ComprarParcela', indice: i },
    { tipo: 'PintarZona', x0: px, y0: py, x1: px + C - 1, y1: py + C / 2 - 1, zona: 'vivienda' },
    { tipo: 'PintarZona', x0: px, y0: py + C / 2, x1: px + C - 1, y1: py + C - 1, zona: 'almacen' },
  ] as const
  for (const c of pasos) {
    const r = aplicarComando(e, c)
    if (!r.ok) throw new Error(r.error)
    e = r.estado
  }
  return e
}

/** Partida con una caja de envío terminada en `(x, y)` (id 1) y otra obra de caja en `(x + 4, y)` (id 2). */
function conCajas(): { partida: Partida; x: number; y: number } {
  const e = escenario()
  const C = e.valle.casillasPorParcela
  const N = e.valle.parcelasPorLado
  const i = e.valle.parcelas.findIndex((p) => p.estado === 'propia')
  const x = (i % N) * C + 3
  const y = Math.floor(i / N) * C + 3
  const partida = new Partida(e)
  for (const dx of [0, 4]) {
    const r = partida.emitir({ tipo: 'Construir', tipoEdificio: 'caja-envio', x: x + dx, y })
    if (!r.ok) throw new Error(r.error)
  }
  // La primera caja se da por terminada (la obra de la segunda sigue en curso).
  const s = partida.estado
  partida.reemplazar({
    ...s,
    modo: 'plano',
    edificios: s.edificios.map((b) => (b.id === 1 ? { ...b, obra: null } : b)),
  })
  return { partida, x, y }
}

describe('silueta de mover', () => {
  it('ignora la huella del propio edificio y usa el motivo del núcleo si no cabe', () => {
    const { partida, x, y } = conCajas()
    const e = partida.estado
    const caja = defEdificio('caja-envio')!
    // Sobre sí misma es válida con `origen`, y ocupada si se construyera otra.
    expect(calcularSilueta(e, 'caja-envio', centroDeSilueta(caja, { x, y }), 1)?.resultado).toEqual(
      {
        valida: true,
      },
    )
    expect(calcularSilueta(e, 'caja-envio', centroDeSilueta(caja, { x, y }))?.resultado).toEqual({
      valida: false,
      motivo: 'ocupada',
    })
    // Sobre otra obra sí choca.
    expect(
      calcularSilueta(e, 'caja-envio', centroDeSilueta(caja, { x: x + 4, y }), 1)?.resultado,
    ).toEqual({ valida: false, motivo: 'ocupada' })
  })
  it('no cobra: con 0 de dinero y materiales la silueta de mover sigue verde', () => {
    const { partida, x, y } = conCajas()
    const pobre = { ...partida.estado, dinero: 0, materiales: { madera: 0, piedra: 0 } }
    const caja = defEdificio('caja-envio')!
    const s = calcularSilueta(pobre, 'caja-envio', centroDeSilueta(caja, { x, y: y + 2 }), 1)
    expect(s?.resultado.valida).toBe(true)
  })
})

describe('silueta de mover en su mismo sitio', () => {
  it('es válida para el núcleo pero no se puede colocar, y moverAqui no hace nada', () => {
    const { partida, x, y } = conCajas()
    const caja = defEdificio('caja-envio')!
    const s = calcularSilueta(partida.estado, 'caja-envio', centroDeSilueta(caja, { x, y }), 1)!
    expect(s.resultado.valida).toBe(true)
    expect(s.mismoSitio).toBe(true)
    expect(sePuedeColocar(s)).toBe(false)
    const otra = calcularSilueta(
      partida.estado,
      'caja-envio',
      centroDeSilueta(caja, { x, y: y + 2 }),
      1,
    )!
    expect(otra.mismoSitio).toBe(false)
    expect(sePuedeColocar(otra)).toBe(true)
    expect(partida.iniciarMover(1)).toBe(true)
    expect(partida.moverAqui()).toBeUndefined()
    expect(partida.construccion.origen).toBe(1)
  })
})

describe('Partida: selección de edificio', () => {
  it('seleccionar un edificio suelta la parcela, el pincel y el modo Construir (y al revés)', () => {
    const { partida } = conCajas()
    partida.seleccion.seleccionar(3)
    partida.edificioSeleccionado.seleccionar(1)
    expect(partida.seleccion.indice).toBeUndefined()
    expect(partida.edificioSeleccionado.id).toBe(1)
    partida.pincel.abrir()
    expect(partida.edificioSeleccionado.id).toBeUndefined()
    partida.edificioSeleccionado.seleccionar(1)
    expect(partida.pincel.abierto).toBe(false)
    partida.construccion.abrir()
    expect(partida.edificioSeleccionado.id).toBeUndefined()
    partida.edificioSeleccionado.seleccionar(1)
    expect(partida.construccion.abierto).toBe(false)
    partida.seleccion.seleccionar(2)
    expect(partida.edificioSeleccionado.id).toBeUndefined()
  })
  it('volver a Vida suelta la selección; un edificio que desaparece también', () => {
    const { partida } = conCajas()
    partida.edificioSeleccionado.seleccionar(1)
    partida.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    expect(partida.edificioSeleccionado.id).toBeUndefined()
    partida.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    partida.edificioSeleccionado.seleccionar(2)
    partida.emitir({ tipo: 'CancelarObra', id: 2 })
    expect(partida.edificioSeleccionado.id).toBeUndefined()
  })
  it('la confirmación se cancela una vez y deseleccionar la borra', () => {
    const { partida } = conCajas()
    const s = partida.edificioSeleccionado
    s.pedirConfirmacion('demoler', 'puntero') // sin selección: nada
    expect(s.confirmando).toBeUndefined()
    s.seleccionar(1)
    s.pedirConfirmacion('demoler', 'teclado')
    expect(s.confirmando).toEqual({ accion: 'demoler', origen: 'teclado' })
    expect(s.cancelarConfirmacion()).toBe(true)
    expect(s.cancelarConfirmacion()).toBe(false)
    s.pedirConfirmacion('demoler', 'puntero')
    s.deseleccionar()
    expect(s.confirmando).toBeUndefined()
  })
})

describe('Partida: mover', () => {
  it('iniciarMover abre el modo con la silueta donde está el edificio; una obra no se mueve', () => {
    const { partida, x, y } = conCajas()
    expect(partida.iniciarMover(2)).toBe(false)
    expect(partida.construccion.abierto).toBe(false)
    expect(partida.iniciarMover(1)).toBe(true)
    expect(partida.construccion.origen).toBe(1)
    expect(partida.construccion.tipo).toBe('caja-envio')
    const s = partida.silueta()!
    expect([s.x, s.y]).toEqual([x, y])
    expect(s.resultado.valida).toBe(true)
    // No se puede cambiar de edificio en modo mover.
    partida.construccion.elegir(undefined)
    expect(partida.construccion.tipo).toBe('caja-envio')
  })
  it('moverAqui mueve (gratis), avisa con el evento y sale del modo', () => {
    const { partida, x, y } = conCajas()
    const antes = partida.estado
    const eventos: EventoJuego[] = []
    partida.suscribir((c) => eventos.push(...c.eventos))
    partida.iniciarMover(1)
    partida.construccion.colocar({ x, y: y + 2 })
    const r = partida.moverAqui()
    expect(r?.ok).toBe(true)
    expect(partida.construccion.abierto).toBe(false)
    expect(partida.construccion.origen).toBeUndefined()
    const caja = partida.estado.edificios.find((b) => b.id === 1)!
    expect([caja.x, caja.y]).toEqual([x, y + 2])
    expect(partida.estado.dinero).toBe(antes.dinero)
    expect(partida.estado.materiales).toEqual(antes.materiales)
    expect(eventos).toEqual([
      { tipo: 'edificio-movido', id: 1, tipoEdificio: 'caja-envio', x, y: y + 2 },
    ])
  })
  it('moverAqui con la silueta en rojo no mueve y avisa; el modo sigue abierto', () => {
    const { partida, x, y } = conCajas()
    const avisos: unknown[] = []
    partida.suscribirAvisos((a) => avisos.push(a))
    partida.iniciarMover(1)
    partida.construccion.colocar({ x: x + 4, y }) // sobre la obra
    expect(partida.silueta()!.resultado.valida).toBe(false)
    const antes = partida.estado
    const r = partida.moverAqui()
    expect(r?.ok).toBe(false)
    expect(partida.estado).toBe(antes)
    expect(partida.construccion.abierto).toBe(true)
    expect(avisos).toEqual([
      { tipo: 'edificio-rechazado', accion: 'mover', error: 'ocupada', edificio: 'caja-envio' },
    ])
  })
  it('cerrar el modo cancela el movimiento sin tocar nada', () => {
    const { partida } = conCajas()
    const antes = partida.estado
    partida.iniciarMover(1)
    partida.construccion.cerrar()
    expect(partida.construccion.origen).toBeUndefined()
    expect(partida.estado).toBe(antes)
  })
})

describe('Partida: demoler y cancelar obra', () => {
  it('demoler con confirmación devuelve el reembolso exacto y suelta la selección', () => {
    const { partida } = conCajas()
    const antes = partida.estado
    partida.edificioSeleccionado.seleccionar(1)
    partida.edificioSeleccionado.pedirConfirmacion('demoler', 'teclado')
    const r = partida.quitarSeleccionado()
    expect(r?.ok && r.eventos).toEqual([
      {
        tipo: 'edificio-demolido',
        id: 1,
        tipoEdificio: 'caja-envio',
        reembolso: { dinero: 25, madera: 10, piedra: 0 },
      },
    ])
    expect(partida.estado.dinero).toBe(antes.dinero + 25)
    expect(partida.estado.materiales.madera).toBe(antes.materiales.madera + 10)
    expect(partida.edificioSeleccionado.id).toBeUndefined()
    expect(partida.estado.edificios.map((b) => b.id)).toEqual([2])
  })
  it('cancelar la obra devuelve el 100 %', () => {
    const { partida } = conCajas()
    const antes = partida.estado
    partida.edificioSeleccionado.seleccionar(2)
    partida.edificioSeleccionado.pedirConfirmacion('cancelar', 'puntero')
    const r = partida.quitarSeleccionado()
    expect(r?.ok).toBe(true)
    expect(partida.estado.dinero).toBe(antes.dinero + 50)
    expect(partida.estado.materiales.madera).toBe(antes.materiales.madera + 20)
  })
  it('sin confirmación abierta no se quita nada', () => {
    const { partida } = conCajas()
    partida.edificioSeleccionado.seleccionar(1)
    expect(partida.quitarSeleccionado()).toBeUndefined()
    expect(partida.estado.edificios).toHaveLength(2)
  })
  it('si el núcleo rechaza (demoler una obra), avisa y cierra la confirmación', () => {
    const { partida } = conCajas()
    const avisos: unknown[] = []
    partida.suscribirAvisos((a) => avisos.push(a))
    partida.edificioSeleccionado.seleccionar(2)
    partida.edificioSeleccionado.pedirConfirmacion('demoler', 'puntero')
    const r = partida.quitarSeleccionado()
    expect(r?.ok).toBe(false)
    expect(partida.edificioSeleccionado.confirmando).toBeUndefined()
    expect(avisos).toEqual([
      { tipo: 'edificio-rechazado', accion: 'demoler', error: 'en-obra', edificio: 'caja-envio' },
    ])
  })
})

describe('textos', () => {
  it('el reembolso se dice con palabras y «nada» si no hay nada', () => {
    expect(textoReembolso({ dinero: 25, madera: 10, piedra: 0 })).toBe('25 monedas y 10 de madera')
    expect(textoReembolso({ dinero: 0, madera: 0, piedra: 0 })).toBe('nada')
  })
  it('hay texto para cada error nuevo de mover y demoler', () => {
    const e = crearEstadoInicial({ semilla: 1 })
    for (const m of [
      'edificio-inexistente',
      'en-obra',
      'no-es-obra',
      'no-demolible',
      'limite-de-recursos',
    ] as const) {
      expect(textoColocacion(m, 'casa', e)).not.toBe('No se puede construir ahí')
    }
  })
})
