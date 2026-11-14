/* eslint-disable @typescript-eslint/no-non-null-assertion -- catálogo conocido en tests */
import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
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
import { ColocadorEdificio } from '../../src/game/colocador'
import { fakeCameraScene, fakePointer } from './fixtures/fake-scene'
import { textoColocacion, textoCoste, textoResto } from '../../src/ui/construirTextos'

vi.mock('phaser', () => ({
  default: { Core: { Events: { BLUR: 'blur', HIDDEN: 'hidden' } } },
}))

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
    expect(avisos).toEqual([
      { tipo: 'construir-rechazado', error: 'fondos-insuficientes', edificio: 'caja-envio' },
    ])
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

// E2E-16 · Rompedor: the building silhouette gestures (`ColocadorEdificio`, src/game/colocador.ts)
// and the confirmation state, with a fake scene. Replaces the logic of construir.spec «la silueta
// sigue al cursor o al dedo…», construir-rompedor «doble clic en el valle con la silueta válida:
// abre la confirmación y no construye», «doble clic o doble toque en «Construir aquí» no
// construye», «segundo dedo a mitad de arrastre: la silueta vuelve a donde estaba…», «Esc a
// destiempo…» and m5-00-rompedor «construir: tocar una casilla coloca la silueta en esa casilla» (DPR).
describe('ColocadorEdificio and the confirmation (fake scene)', () => {
  function montar(dpr = 1) {
    const f = fakeCameraScene(412, 915, dpr)
    const k = 1 / f.scale.zoom
    f.main.setZoom(k)
    f.main.setScroll(40 * 32 - f.scale.width / 2, 40 * 32 - f.scale.height / 2)
    const construccion = new Construccion()
    const clics = { n: 0 }
    new ColocadorEdificio(f.scene as never, construccion, LADO, 32, () => {
      clics.n++
      construccion.pedirConfirmacion('puntero')
    })
    construccion.abrir()
    construccion.elegir('caja-envio')
    return { f, construccion, clics }
  }

  it.each([1, 1.25, 2, 2.625, 3])(
    'DPR %f: tapping a tile puts the silhouette on that tile and a finger never confirms',
    (dpr) => {
      const { f, construccion, clics } = montar(dpr)
      const pt = f.tileCentre(43, 38)
      const p = fakePointer(1, pt.x, pt.y, true)
      f.down(p)
      f.up(p)
      expect(construccion.centro).toEqual({ x: 43, y: 38 })
      expect(clics.n).toBe(0)
      expect(construccion.confirmando).toBeUndefined()
    },
  )

  it('mouse: the silhouette follows the cursor without pressing; a click asks for confirmation', () => {
    const { f, construccion, clics } = montar()
    const p = fakePointer(0, 0, 0, false)
    const a = f.tileCentre(41, 41)
    f.move(p, a.x, a.y)
    expect(construccion.centro).toEqual({ x: 41, y: 41 })
    f.down(p)
    f.up(p)
    expect(clics.n).toBe(1)
    expect(construccion.confirmando).toBe('puntero')
  })

  it('double click on the valley with a valid silhouette: opens the confirmation once, the 2nd click does nothing', () => {
    const { f, construccion, clics } = montar()
    const a = f.tileCentre(41, 41)
    const p = fakePointer(0, a.x, a.y, false)
    f.move(p, a.x, a.y)
    f.down(p)
    f.up(p)
    const b = f.tileCentre(45, 45)
    f.move(p, b.x, b.y)
    f.down(p)
    f.up(p)
    expect(clics.n).toBe(1)
    // With the confirmation open the silhouette does not move and nothing is built.
    expect(construccion.centro).toEqual({ x: 41, y: 41 })
    expect(construccion.confirmando).toBe('puntero')
  })

  it('a second finger mid-drag puts the silhouette back where it was and confirms nothing', () => {
    const { f, construccion, clics } = montar()
    construccion.colocar({ x: 40, y: 40 })
    const a = f.tileCentre(42, 42)
    const p1 = fakePointer(1, a.x, a.y, true)
    f.down(p1)
    const b = f.tileCentre(46, 44)
    f.move(p1, b.x, b.y)
    expect(construccion.centro).toEqual({ x: 46, y: 44 })
    const p2 = fakePointer(2, 300, 300, true)
    f.down(p2)
    expect(construccion.centro).toEqual({ x: 40, y: 40 })
    f.move(p1, a.x + 50, a.y + 50)
    f.up(p1)
    f.up(p2)
    expect(construccion.centro).toEqual({ x: 40, y: 40 })
    expect(clics.n).toBe(0)
    // After both fingers are up, one finger places again.
    const c = fakePointer(3, a.x, a.y, true)
    f.down(c)
    f.up(c)
    expect(construccion.centro).toEqual({ x: 42, y: 42 })
  })

  it('right click, a cancelled touch and a mouse drag released outside never confirm by themselves', () => {
    const { f, construccion, clics } = montar()
    const a = f.tileCentre(41, 41)
    const der = fakePointer(0, a.x, a.y, false, 2)
    f.down(der)
    f.up(der)
    const dedo = fakePointer(1, a.x, a.y, true)
    f.down(dedo)
    f.up(dedo, true)
    expect(clics.n).toBe(0)
    expect(construccion.confirmando).toBeUndefined()
  })

  it('Esc out of turn: cancelling twice, closing, then cancelling again leaves nothing half done', () => {
    const { construccion } = montar()
    construccion.colocar({ x: 41, y: 41 })
    construccion.pedirConfirmacion('teclado')
    expect(construccion.cancelarConfirmacion()).toBe(true)
    expect(construccion.cancelarConfirmacion()).toBe(false)
    expect(construccion.activo).toBe(true)
    construccion.cerrar()
    expect(construccion.cancelarConfirmacion()).toBe(false)
    expect([
      construccion.abierto,
      construccion.tipo,
      construccion.centro,
      construccion.confirmando,
    ]).toEqual([false, undefined, undefined, undefined])
  })

  it('«Construir aquí» twice (double tap) builds once and goes back to the catalogue', () => {
    const { estado, x, y } = escenario()
    const partida = new Partida(estado)
    partida.construccion.abrir()
    partida.construccion.elegir('caja-envio')
    partida.construccion.colocar({ x, y })
    partida.construccion.pedirConfirmacion('puntero')
    expect(partida.construirAqui()?.ok).toBe(true)
    expect(partida.construirAqui()).toBeUndefined()
    expect(partida.estado.edificios).toHaveLength(1)
    expect(partida.construccion.tipo).toBeUndefined()
    expect(partida.construccion.abierto).toBe(true)
  })
})

// E2E-16 · Rompedor: m4-global-rompedor «exclusión mutua: parcela, pincel, construir y edificio
// nunca están abiertos a la vez» and «Vida con cada panel abierto (…): se cierra todo y no se aplica
// nada», at the `Partida` level plus the two rules the scene adds (`EscenaValle.alCambiarHerramienta`),
// which are modelled here and stay checked in e2e (F10).
describe('panels are mutually exclusive (Partida)', () => {
  type Paso = 'parcela' | 'pincel' | 'construir' | 'edificio' | 'vida'
  it('any sequence of openings leaves at most the allowed pairs open; Life closes everything and applies nothing', () => {
    const { estado, x, y } = escenario()
    const r = aplicarComando(estado, { tipo: 'Construir', tipoEdificio: 'caja-envio', x, y })
    if (!r.ok) throw new Error(r.error)
    const base = r.estado
    const id = base.edificios[0]!.id
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<Paso>('parcela', 'pincel', 'construir', 'edificio', 'vida'), {
          maxLength: 30,
        }),
        (pasos) => {
          const partida = new Partida(base)
          // The scene's share (EscenaValle.alCambiarHerramienta): opening the brush or Construir
          // deselects the parcel, and the parcel picker is off while either is open.
          const escena = () => {
            if (partida.pincel.abierto || partida.construccion.abierto)
              partida.seleccion.deseleccionar()
          }
          partida.pincel.suscribir(escena)
          partida.construccion.suscribir(escena)
          for (const p of pasos) {
            if (p === 'vida') {
              const antes = partida.estado
              partida.emitir({ tipo: 'CambiarModo', modo: 'vida' })
              expect(partida.seleccion.indice).toBeUndefined()
              expect(partida.pincel.abierto).toBe(false)
              expect(partida.construccion.abierto).toBe(false)
              expect(partida.edificioSeleccionado.id).toBeUndefined()
              // Nothing was applied: only the mode changed.
              expect({ ...partida.estado, modo: antes.modo }).toEqual(antes)
              partida.emitir({ tipo: 'CambiarModo', modo: 'plano' })
              continue
            }
            const seElige =
              p !== 'parcela' || (!partida.pincel.abierto && !partida.construccion.abierto)
            if (p === 'parcela' && seElige) partida.seleccion.seleccionar(14)
            if (p === 'pincel') partida.pincel.abrir()
            if (p === 'construir') partida.construccion.abrir()
            if (p === 'edificio') partida.edificioSeleccionado.seleccionar(id)
            const abiertos = {
              parcela: partida.seleccion.indice !== undefined,
              pincel: partida.pincel.abierto,
              construir: partida.construccion.abierto,
              edificio: partida.edificioSeleccionado.id !== undefined,
            }
            const n = Object.values(abiertos).filter(Boolean).length
            expect(n, `${pasos.join(' > ')}: ${JSON.stringify(abiertos)}`).toBeLessThanOrEqual(1)
            // The last thing opened is the one that stays (a parcel cannot be picked while the brush
            // or Construir is open; the inventory is Life-only: unit/inventario-partida).
            if (seElige) expect(abiertos[p]).toBe(true)
          }
          expect(partida.estado.dinero).toBe(base.dinero)
          expect(partida.estado.edificios).toEqual(base.edificios)
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('ColocadorEdificio: scene shutdown', () => {
  it('removes its pointer, blur and hidden listeners (restarting the valley leaves no duplicate gesture)', () => {
    const f = fakeCameraScene(412, 915)
    new ColocadorEdificio(f.scene as never, new Construccion(), LADO, 32, () => undefined)
    f.scene.events.emit('shutdown')
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointerupoutside'])
      expect(f.input.cuenta(ev), ev).toBe(0)
    expect(f.game.events.cuenta('blur')).toBe(0)
    expect(f.game.events.cuenta('hidden')).toBe(0)
  })
})
