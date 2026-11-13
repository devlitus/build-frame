/* eslint-disable @typescript-eslint/no-non-null-assertion -- catálogo conocido en tests */
import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  crearEstadoInicial,
  defEdificio,
  ladoValle,
  MOTIVOS_COLOCACION,
  type EstadoJuego,
} from '../../src/core'
import { Construccion, calcularSilueta, esquinaDeSilueta } from '../../src/game/construir'
import { Partida } from '../../src/game/partida'
import { textoColocacion, textoCoste, textoResto } from '../../src/ui/construirTextos'

const LADO = 96
const base = crearEstadoInicial({ semilla: 42 })

/** Parcela propia con vivienda pintada, en Plano, sin obstáculos ni agua cerca. */
function escenario(): { estado: EstadoJuego; x: number; y: number } {
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
  for (const c of [
    { tipo: 'ComprarParcela', indice: i } as const,
    {
      tipo: 'PintarZona',
      x0: px,
      y0: py,
      x1: px + C - 1,
      y1: py + C - 1,
      zona: 'vivienda',
    } as const,
  ]) {
    const r = aplicarComando(e, c)
    if (!r.ok) throw new Error(r.error)
    e = r.estado
  }
  return { estado: e, x: px + 2, y: py + 2 }
}

describe('esquinaDeSilueta', () => {
  it('centra la huella en la casilla (huellas impares y pares)', () => {
    expect(esquinaDeSilueta({ ancho: 1, alto: 1 }, { x: 10, y: 10 }, LADO)).toEqual({
      x: 10,
      y: 10,
    })
    expect(esquinaDeSilueta({ ancho: 3, alto: 2 }, { x: 10, y: 10 }, LADO)).toEqual({ x: 9, y: 10 })
    expect(esquinaDeSilueta({ ancho: 4, alto: 3 }, { x: 10, y: 10 }, LADO)).toEqual({ x: 9, y: 9 })
  })
  it('se queda dentro del valle en los cuatro bordes', () => {
    const casa = defEdificio('casa')!
    expect(esquinaDeSilueta(casa, { x: 0, y: 0 }, LADO)).toEqual({ x: 0, y: 0 })
    expect(esquinaDeSilueta(casa, { x: 95, y: 95 }, LADO)).toEqual({ x: 92, y: 93 })
  })
})

describe('calcularSilueta', () => {
  it('usa colocacionValida: válida en la vivienda y con motivo fuera de ella', () => {
    const { estado, x, y } = escenario()
    expect(calcularSilueta(estado, 'caja-envio', { x, y })?.resultado).toEqual({ valida: true })
    const mala = calcularSilueta(estado, 'caja-envio', { x: (x + 48) % 96, y: (y + 48) % 96 })
    expect(mala?.resultado.valida).toBe(false)
    const r = mala?.resultado
    if (r && !r.valida) expect(MOTIVOS_COLOCACION).toContain(r.motivo)
  })
  it('un tipo desconocido da undefined', () => {
    expect(calcularSilueta(base, 'torre' as never, { x: 1, y: 1 })).toBeUndefined()
  })
})

describe('Construccion (estado de interfaz)', () => {
  it('flujo: abrir, elegir, colocar, confirmar, volver al catálogo', () => {
    const c = new Construccion()
    c.elegir('casa')
    expect(c.tipo).toBeUndefined() // cerrado: no hace nada
    c.abrir()
    c.elegir('caja-envio')
    expect(c.activo).toBe(true)
    c.colocar({ x: 5, y: 5 })
    expect(c.centro).toEqual({ x: 5, y: 5 })
    expect(c.mover(LADO, 'derecha')).toBe(true)
    expect(c.centro).toEqual({ x: 6, y: 5 })
    c.pedirConfirmacion('teclado')
    expect(c.confirmando).toBe('teclado')
    expect(c.activo).toBe(false)
    c.colocar({ x: 1, y: 1 }) // confirmando: no se mueve
    expect(c.centro).toEqual({ x: 6, y: 5 })
    expect(c.cancelarConfirmacion()).toBe(true)
    expect(c.cancelarConfirmacion()).toBe(false)
    c.terminarColocacion()
    expect(c.abierto).toBe(true)
    expect(c.tipo).toBeUndefined()
    expect(c.centro).toBeUndefined()
  })
  it('las flechas no son suyas sin cursor y cerrar suelta todo', () => {
    const c = new Construccion()
    c.abrir()
    expect(c.mover(LADO, 'arriba')).toBe(false)
    c.elegir('casa')
    c.colocar({ x: 0, y: 0 })
    c.mover(LADO, 'arriba')
    expect(c.centro).toEqual({ x: 0, y: 0 })
    c.cerrar()
    expect([c.abierto, c.tipo, c.centro]).toEqual([false, undefined, undefined])
  })
  it('no confirma sin cursor', () => {
    const c = new Construccion()
    c.abrir()
    c.elegir('casa')
    c.pedirConfirmacion('puntero')
    expect(c.confirmando).toBeUndefined()
  })
})

describe('Partida y el modo Construir', () => {
  it('abrir el pincel cierra Construir y viceversa; abrir Construir suelta la parcela', () => {
    const p = new Partida({ ...base, modo: 'plano' })
    p.construccion.abrir()
    p.pincel.abrir()
    expect(p.construccion.abierto).toBe(false)
    p.seleccion.seleccionar(3)
    p.construccion.abrir()
    expect(p.pincel.abierto).toBe(false)
    expect(p.seleccion.indice).toBeUndefined()
  })
  it('volver al Modo Vida cierra Construir', () => {
    const p = new Partida({ ...base, modo: 'plano' })
    p.construccion.abrir()
    p.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    expect(p.construccion.abierto).toBe(false)
  })
  it('la silueta se memoiza y construirAqui paga, avisa por evento y vuelve al catálogo', () => {
    const { estado, x, y } = escenario()
    const p = new Partida(estado)
    p.construccion.abrir()
    p.construccion.elegir('caja-envio')
    p.construccion.colocar({ x, y })
    const s = p.silueta()
    expect(p.silueta()).toBe(s)
    expect(s?.resultado.valida).toBe(true)
    expect(p.construirAqui()).toBeUndefined() // sin confirmación pedida
    p.construccion.pedirConfirmacion('puntero')
    const eventos: string[] = []
    p.suscribir((c) => c.eventos.forEach((e) => eventos.push(e.tipo)))
    const r = p.construirAqui()
    expect(r?.ok).toBe(true)
    expect(eventos).toContain('obra-iniciada')
    expect(p.estado.dinero).toBe(estado.dinero - 50)
    expect(p.estado.materiales.madera).toBe(estado.materiales.madera - 20)
    expect(p.construccion.tipo).toBeUndefined()
    expect(p.construccion.abierto).toBe(true)
  })
  it('si el núcleo rechaza, avisa y cierra la confirmación', () => {
    const { estado, x, y } = escenario()
    const p = new Partida(estado)
    const avisos: unknown[] = []
    p.suscribirAvisos((a) => avisos.push(a))
    p.construccion.abrir()
    p.construccion.elegir('caja-envio')
    p.construccion.colocar({ x, y })
    p.construccion.pedirConfirmacion('puntero')
    p.reemplazar({ ...estado, dinero: 0 }) // cierra Construir: se reabre sin pasar por la silueta
    p.construccion.abrir()
    p.construccion.elegir('caja-envio')
    p.construccion.colocar({ x, y })
    p.construccion.pedirConfirmacion('puntero')
    const r = p.construirAqui()
    expect(r?.ok).toBe(false)
    expect(avisos).toEqual([{ tipo: 'construir-rechazado', error: 'fondos-insuficientes' }])
    expect(p.construccion.confirmando).toBeUndefined()
    expect(p.construccion.tipo).toBe('caja-envio')
  })
})

describe('textos de construcción', () => {
  it('hay texto propio para todos los motivos de colocación y para solo-en-plano', () => {
    const generico = textoColocacion('parametro-invalido', 'casa', base)
    for (const m of [...MOTIVOS_COLOCACION, 'solo-en-plano'] as const) {
      const txt = textoColocacion(m, 'cobertizo', base)
      expect(txt.length).toBeGreaterThan(5)
      expect(txt).not.toMatch(/\{/)
      expect(txt).not.toBe(generico)
    }
  })
  it('los motivos de pago y zona dicen cuánto falta y qué zona hace falta', () => {
    const pobre = { ...base, dinero: 100, materiales: { madera: 0, piedra: 0 } }
    expect(textoColocacion('fondos-insuficientes', 'cobertizo', pobre)).toContain('200')
    expect(textoColocacion('materiales-insuficientes', 'cobertizo', pobre)).toMatch(/50 de madera/)
    expect(textoColocacion('zona-incompatible', 'caja-envio', base)).toContain('Vivienda o Almacén')
  })
  it('coste y resto en palabras', () => {
    expect(textoCoste(defEdificio('casa')!.coste)).toBe('Gratis')
    expect(textoCoste(defEdificio('cobertizo')!.coste)).toBe(
      '300 monedas, 50 de madera y 10 de piedra',
    )
    expect(textoResto({ dinero: 0, madera: 0, piedra: 0 })).toBe(
      '0 monedas, 0 de madera y 0 de piedra',
    )
    expect(ladoValle(base.valle)).toBe(LADO)
  })
})
