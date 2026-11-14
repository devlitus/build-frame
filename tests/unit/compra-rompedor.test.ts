import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { crearEstadoInicial, parcelaComprable, type EstadoJuego } from '../../src/core'
import { Partida } from '../../src/game/partida'
import { conPropiasDeDepuracion } from '../../src/game/valle/debug'
import { clasificarParcelas, crearClasificador } from '../../src/game/valle/estadoVisual'
import { MS_VENTANA_ANTIDOBLE, intentarCompra } from '../../src/ui/compra'
import { formatearDinero } from '../../src/ui/formatoDinero'
import { estadoDeCompra, textoErrorCompra, textoPrecio } from '../../src/ui/parcelaTextos'
import { tp } from '../../src/ui/textos'

/** M3-04 · Rompedor: partidas simuladas de compra, memo del clasificador y formato del dinero. */

const base = (dinero: number, semilla = 42): EstadoJuego => ({
  ...crearEstadoInicial({ semilla }),
  dinero,
})

describe('partidas simuladas de compra (rompedor M3-04)', () => {
  it('el dinero cuadra, nunca es negativo y el clasificador memorizado no se queda viejo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffff }),
        fc.integer({ min: 0, max: 20_000 }),
        fc.array(
          fc.oneof(
            fc.record({ t: fc.constant('comprar' as const), i: fc.integer({ min: -2, max: 40 }) }),
            fc.record({ t: fc.constant('tiempo' as const), m: fc.integer({ min: 1, max: 30 }) }),
            // Cambios que solo tocan `comprasHechas` o `dinero` (p. ej. cargar o depurar).
            fc.record({ t: fc.constant('compras' as const), d: fc.integer({ min: -1, max: 3 }) }),
            fc.record({
              t: fc.constant('dinero' as const),
              d: fc.integer({ min: -500, max: 500 }),
            }),
          ),
          { maxLength: 40 },
        ),
        (semilla, dinero0, pasos) => {
          const partida = new Partida(base(dinero0, semilla))
          const clasificar = crearClasificador()
          let gastado = 0
          let ajustes = 0
          for (const p of pasos) {
            const antes = partida.estado
            if (p.t === 'comprar') {
              const c = parcelaComprable(antes, p.i)
              const r = intentarCompra(partida, p.i)
              expect(r.ok).toBe(c.comprable)
              if (r.ok && c.comprable) gastado += c.precio
              else expect(partida.estado).toBe(antes)
            } else if (p.t === 'tiempo') {
              partida.emitir({ tipo: 'AvanzarTiempo', minutos: p.m })
            } else if (p.t === 'compras') {
              partida.reemplazar({
                ...antes,
                comprasHechas: Math.max(0, antes.comprasHechas + p.d),
              })
            } else {
              const d = Math.max(-antes.dinero, p.d)
              ajustes += d
              partida.reemplazar({ ...antes, dinero: antes.dinero + d })
            }
            const e = partida.estado
            expect(e.dinero).toBeGreaterThanOrEqual(0)
            expect(e.dinero).toBe(dinero0 - gastado + ajustes)
            expect(clasificar(e)).toEqual(clasificarParcelas(e))
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('comprar sin parar hasta quedarse sin dinero: termina, y al final nada es comprable', () => {
    for (const dinero0 of [0, 299, 1100, 5000, 1_000_000_000]) {
      const partida = new Partida(base(dinero0))
      let compras = 0
      for (;;) {
        const v = clasificarParcelas(partida.estado)
        const i = v.indexOf('comprable')
        if (i < 0) break
        expect(intentarCompra(partida, i).ok).toBe(true)
        compras++
        expect(compras).toBeLessThanOrEqual(36)
      }
      const fin = clasificarParcelas(partida.estado)
      expect(fin.includes('comprable')).toBe(false)
      // O se compró todo, o lo que queda es más caro que el dinero (o no es adyacente).
      for (let i = 0; i < 36; i++) {
        const c = parcelaComprable(partida.estado, i)
        expect(c.comprable).toBe(false)
      }
      expect(partida.estado.comprasHechas).toBe(compras)
    }
  })
})

describe('textos de compra (rompedor M3-04)', () => {
  it('«te faltan» es exactamente precio − dinero, con punto de millar', () => {
    const e = conPropiasDeDepuracion(base(3), [14])
    const c = parcelaComprable(e, 15)
    expect(c.comprable).toBe(false)
    if (c.comprable || c.precio === undefined) throw new Error('debía faltar dinero')
    expect(estadoDeCompra(c, 3).texto).toBe(
      `No te llega el dinero (te faltan ${formatearDinero(c.precio - 3)})`,
    )
  })

  it('todos los motivos de rechazo tienen un texto no vacío', () => {
    for (const m of [
      'parametro-invalido',
      'ya-propia',
      'no-adyacente',
      'fondos-insuficientes',
      'precio-invalido',
    ] as const)
      expect(textoErrorCompra(m).length).toBeGreaterThan(5)
  })
})

describe('formatearDinero (rompedor M3-04)', () => {
  it('cualquier entero seguro: quitar los puntos devuelve la cifra y los grupos son de 3', () => {
    fc.assert(
      fc.property(fc.maxSafeInteger(), (n) => {
        const s = formatearDinero(n)
        expect(s).toMatch(/^-?\d{1,3}(\.\d{3})*$/)
        expect(Number(s.replaceAll('.', ''))).toBe(n === 0 ? 0 : n)
      }),
      { numRuns: 2000 },
    )
  })

  it('-0 y decimales negativos pequeños no muestran «-0»', () => {
    expect(formatearDinero(-0)).toBe('0')
    expect(formatearDinero(-0.4)).toBe('0')
    expect(formatearDinero(999.99)).toBe('999')
  })

  // FALLA (S3): con números de 22 cifras o más `String(n)` da notación científica y el HUD
  // mostraría «1e+21». No se llega por comandos (el núcleo exige enteros seguros), pero sí con
  // un estado corrupto: el contrato dice «número entero formateado con punto de millar».
  it('enteros enormes (fuera de los seguros) siguen saliendo con puntos, sin notación científica', () => {
    expect(formatearDinero(1e21)).toBe('1.000.000.000.000.000.000.000')
    expect(formatearDinero(-1e21)).not.toContain('e')
  })
})

// E2E-16 · Rompedor: the purchase races of compra-rompedor.spec.ts («carreras», «doble
// pulsación», «botón desactivado», «partida simulada por la interfaz»), on `intentarCompra`
// (what «Comprar» does) and the texts the panel builds from `parcelaComprable`.
describe('purchase races (what the confirmation does when the state moves under it)', () => {
  const PARCELA = 14
  const precioDe = (e: EstadoJuego, i: number) => {
    const c = parcelaComprable(e, i)
    return c.comprable ? c.precio : (c.precio ?? NaN)
  }

  it('confirming twice in the same instant charges once; the second gets «ya es tuya»', () => {
    // Original e2e: «confirmar dos veces en el mismo instante cobra una sola vez»; «doble clic en
    // «Comprar» (confirmar) compra una vez y no cambia la selección».
    const partida = new Partida(base(5000))
    partida.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    partida.seleccion.seleccionar(PARCELA)
    const precio = precioDe(partida.estado, PARCELA)
    expect(intentarCompra(partida, PARCELA)).toEqual({ ok: true })
    const r2 = intentarCompra(partida, PARCELA)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.texto).toBe(textoErrorCompra('ya-propia'))
    expect(partida.estado.dinero).toBe(5000 - precio)
    expect(partida.estado.comprasHechas).toBe(1)
    expect(partida.seleccion.indice).toBe(PARCELA)
  })

  it('after a purchase, canvas clicks are blocked for the anti-double window (the 2nd click does not select another parcel)', () => {
    const partida = new Partida(base(5000))
    partida.seleccion.bloquearClics(MS_VENTANA_ANTIDOBLE, 1000)
    expect(partida.seleccion.clicsBloqueados(1000 + MS_VENTANA_ANTIDOBLE - 1)).toBe(true)
    expect(partida.seleccion.clicsBloqueados(1000 + MS_VENTANA_ANTIDOBLE)).toBe(false)
  })

  it('if the state changes just before confirming (another, non-adjacent parcel bought), it is refused with its reason and nothing else changes', () => {
    // Original e2e: «si el estado cambia justo antes de confirmar, sale un role=alert con el motivo y nada cambia».
    const partida = new Partida(base(5000))
    partida.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    const precio0 = precioDe(partida.estado, 0)
    expect(partida.emitir({ tipo: 'ComprarParcela', indice: 0 }).ok).toBe(true)
    const antes = partida.estado
    const r = intentarCompra(partida, PARCELA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.texto.toLowerCase()).toContain('debe tocar una de tus parcelas')
    expect(partida.estado).toBe(antes)
    expect(partida.estado.dinero).toBe(5000 - precio0)
    // The button is now disabled with the reason (aria-describedby text).
    const c = parcelaComprable(partida.estado, PARCELA)
    expect(c.comprable).toBe(false)
    expect(estadoDeCompra(c, partida.estado.dinero).texto).toContain('Debe tocar')
  })

  it('if the price goes up with the confirmation open, the question and the charge use the new price', () => {
    // Original e2e: «si el precio sube con la confirmación abierta, la pregunta y el cobro usan el nuevo».
    const partida = new Partida(conPropiasDeDepuracion(base(5000), [PARCELA]))
    partida.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    const viejo = precioDe(partida.estado, 15)
    expect(partida.emitir({ tipo: 'ComprarParcela', indice: 13 }).ok).toBe(true)
    const nuevo = precioDe(partida.estado, 15)
    expect(nuevo).toBeGreaterThan(viejo)
    const dinero = partida.estado.dinero
    // The confirmation text is rebuilt from the current state (PanelParcela: compraConfirmar).
    const pregunta = tp('compraConfirmar', {
      n: textoPrecio(nuevo),
      m: textoPrecio(dinero - nuevo),
    })
    expect(pregunta).toContain(`por ${formatearDinero(nuevo)} monedas`)
    expect(pregunta).toContain(`Te quedarán ${formatearDinero(dinero - nuevo)}`)
    expect(intentarCompra(partida, 15)).toEqual({ ok: true })
    expect(partida.estado.dinero).toBe(dinero - nuevo)
  })

  it('confirming in the same task as switching to Life: the money adds up (bought or not) and the selection is gone', () => {
    // Original e2e: «confirmar en la misma tarea que el cambio de modo deja el dinero cuadrado».
    const partida = new Partida(base(5000))
    partida.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    partida.seleccion.seleccionar(PARCELA)
    const precio = precioDe(partida.estado, PARCELA)
    partida.emitir({ tipo: 'CambiarModo', modo: 'vida' })
    expect(partida.seleccion.indice).toBeUndefined()
    const r = intentarCompra(partida, PARCELA)
    const propia = partida.estado.valle.parcelas[PARCELA]?.estado === 'propia'
    expect(r.ok).toBe(propia)
    expect(partida.estado.dinero).toBe(propia ? 5000 - precio : 5000)
  })

  it('a disabled «Comprar por N» (already yours, not adjacent, no money) never buys', () => {
    // Original e2e: «botón desactivado · no abre la confirmación con clic, Enter, Espacio ni toque»
    // (the panel does not call `intentarCompra` then; if it did, the core would refuse).
    const e = conPropiasDeDepuracion(base(5000), [PARCELA])
    for (const [i, dinero] of [
      [0, 5000],
      [PARCELA, 5000],
      [15, 1],
    ] as const) {
      const partida = new Partida({ ...e, dinero })
      expect(parcelaComprable(partida.estado, i).comprable).toBe(false)
      const antes = partida.estado
      expect(intentarCompra(partida, i).ok).toBe(false)
      expect(partida.estado).toBe(antes)
    }
  })

  it('buying with the panel until the money runs out: every price is the one announced and the HUD figure adds up', () => {
    // Original e2e: «comprar con clics hasta quedarse sin dinero: HUD, estado, panel y dibujo cuadran».
    const partida = new Partida(base(1100))
    partida.emitir({ tipo: 'CambiarModo', modo: 'plano' })
    let caja = 1100
    const avisos: number[] = []
    partida.suscribir(({ eventos }) => {
      for (const ev of eventos) if (ev.tipo === 'parcela-comprada') avisos.push(ev.precio)
    })
    for (;;) {
      const i = clasificarParcelas(partida.estado).indexOf('comprable')
      if (i < 0) break
      const precio = precioDe(partida.estado, i)
      expect(
        tp('compraConfirmar', { n: textoPrecio(precio), m: textoPrecio(caja - precio) }),
      ).toContain(`Te quedarán ${formatearDinero(caja - precio)}`)
      expect(intentarCompra(partida, i).ok).toBe(true)
      caja -= precio
      expect(partida.estado.dinero).toBe(caja)
      expect(formatearDinero(partida.estado.dinero)).toBe(formatearDinero(caja))
      expect(avisos.at(-1)).toBe(precio)
    }
    expect(avisos.length).toBeGreaterThan(0)
    expect(caja).toBeGreaterThanOrEqual(0)
  })
})
