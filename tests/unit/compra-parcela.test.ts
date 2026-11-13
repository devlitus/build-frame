import { describe, expect, it } from 'vitest'
import { crearEstadoInicial, parcelaComprable, type EstadoJuego } from '../../src/core'
import { Partida } from '../../src/game/partida'
import { conPropiasDeDepuracion } from '../../src/game/valle/debug'
import {
  clasificarParcelas,
  crearClasificador,
  estadoVisualDe,
} from '../../src/game/valle/estadoVisual'
import { ESTILO_PLANO } from '../../src/game/valle/estilo'
import { rayasDiagonales, segmentosDiscontinuos } from '../../src/game/valle/trazos'
import { leerParametros } from '../../src/game/parametros'
import { intentarCompra } from '../../src/ui/compra'
import { formatearDinero } from '../../src/ui/formatoDinero'
import { textoErrorCompra, textoPrecio } from '../../src/ui/parcelaTextos'

/** M3-04 · Estado visual de parcelas, dinero formateado, memoización y compra desde la interfaz. */

const base = (dinero = 1100): EstadoJuego => ({
  ...crearEstadoInicial({ semilla: 42 }),
  dinero,
})

describe('formatearDinero', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1.000'],
    [1100, '1.100'],
    [12345, '12.345'],
    [1234567, '1.234.567'],
    [-1500, '-1.500'],
  ])('%i se escribe %s', (n, texto) => {
    expect(formatearDinero(n)).toBe(texto)
  })

  it('un valor no finito no rompe la interfaz', () => {
    expect(formatearDinero(Number.NaN)).toBe('—')
  })

  it('los precios del panel usan el mismo formato', () => {
    expect(textoPrecio(1014)).toBe('1.014 monedas')
    expect(textoPrecio(1)).toBe('1 moneda')
  })
})

describe('estado visual de las parcelas', () => {
  it('coincide con parcelaComprable en todas las parcelas, con y sin propias, con distinto dinero', () => {
    for (const dinero of [0, 300, 700, 1100, 5000]) {
      for (const propias of [[], [14], [14, 15], [0, 35]]) {
        const e = conPropiasDeDepuracion(base(dinero), propias)
        const v = clasificarParcelas(e)
        expect(v).toHaveLength(36)
        v.forEach((estado, i) => {
          if (e.valle.parcelas[i]?.estado === 'propia') expect(estado).toBe('propia')
          else expect(estado).toBe(parcelaComprable(e, i).comprable ? 'comprable' : 'no-comprable')
        })
      }
    }
  })

  it('sin fondos nada es comprable; con dinero de sobra y propias solo las adyacentes', () => {
    expect(clasificarParcelas(base(0)).every((v) => v === 'no-comprable')).toBe(true)
    const e = conPropiasDeDepuracion(base(1_000_000), [14])
    const v = clasificarParcelas(e)
    const comprables = v.flatMap((x, i) => (x === 'comprable' ? [i] : []))
    expect(comprables).toEqual([8, 13, 15, 20])
    expect(v[14]).toBe('propia')
    expect(v[0]).toBe('no-comprable')
  })

  it('un índice fuera de rango no es comprable', () => {
    expect(estadoVisualDe(base(), 99)).toBe('no-comprable')
  })

  it('los tres estados tienen estilos distintos más allá del color', () => {
    const { propia, comprable, 'no-comprable': no } = ESTILO_PLANO
    expect(comprable.discontinuo).toBeDefined()
    expect(comprable.moneda).toBeDefined()
    expect(propia.discontinuo).toBeUndefined()
    expect(no.rayado).toBeDefined()
    expect(propia.rayado).toBeUndefined()
    expect(new Set([propia.borde, comprable.borde, no.borde]).size).toBe(3)
    expect(propia.alfaTinte).not.toBe(no.alfaTinte)
  })
})

describe('clasificador con memoria', () => {
  it('no recalcula mientras valle, dinero y comprasHechas no cambian, aunque cambie el tiempo', () => {
    const clasificar = crearClasificador()
    const e = base()
    const a = clasificar(e)
    expect(clasificar.calculos).toBe(1)
    for (let m = 1; m <= 50; m++) {
      const otro: EstadoJuego = { ...e, minutoDelDia: e.minutoDelDia + m }
      expect(clasificar(otro)).toBe(a)
    }
    expect(clasificar.calculos).toBe(1)
  })

  it('recalcula al cambiar el dinero, las compras o el valle', () => {
    const clasificar = crearClasificador()
    const e = base()
    clasificar(e)
    clasificar({ ...e, dinero: e.dinero - 1 })
    expect(clasificar.calculos).toBe(2)
    clasificar({ ...e, dinero: e.dinero - 1, comprasHechas: 1 })
    expect(clasificar.calculos).toBe(3)
    clasificar({ ...e, dinero: e.dinero - 1, comprasHechas: 1, valle: { ...e.valle } })
    expect(clasificar.calculos).toBe(4)
  })

  it('el resultado memorizado es el correcto tras comprar', () => {
    const partida = new Partida(base())
    const clasificar = crearClasificador()
    const antes = clasificar(partida.estado)
    const i = antes.indexOf('comprable')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(partida.emitir({ tipo: 'ComprarParcela', indice: i }).ok).toBe(true)
    const despues = clasificar(partida.estado)
    expect(despues[i]).toBe('propia')
    expect(despues).toEqual(clasificarParcelas(partida.estado))
  })
})

describe('trazos', () => {
  it('el borde discontinuo cabe en el rectángulo y deja huecos', () => {
    const seg = segmentosDiscontinuos(10, 20, 400, 300, 40, 20)
    expect(seg.length).toBeGreaterThan(8)
    for (const [x1, y1, x2, y2] of seg) {
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ] as const) {
        expect(x).toBeGreaterThanOrEqual(10 - 1e-9)
        expect(x).toBeLessThanOrEqual(410 + 1e-9)
        expect(y).toBeGreaterThanOrEqual(20 - 1e-9)
        expect(y).toBeLessThanOrEqual(320 + 1e-9)
      }
    }
    const trazado = seg.reduce((a, [x1, y1, x2, y2]) => a + Math.hypot(x2 - x1, y2 - y1), 0)
    expect(trazado).toBeLessThan(2 * (400 + 300))
    expect(trazado).toBeGreaterThan(0.5 * 2 * (400 + 300))
  })

  it('las rayas diagonales quedan dentro del cuadrado', () => {
    const rayas = rayasDiagonales(100, 200, 512, 64)
    expect(rayas.length).toBeGreaterThan(10)
    for (const [x1, y1, x2, y2] of rayas)
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ] as const) {
        expect(x).toBeGreaterThanOrEqual(100)
        expect(x).toBeLessThanOrEqual(612)
        expect(y).toBeGreaterThanOrEqual(200)
        expect(y).toBeLessThanOrEqual(712)
      }
  })
})

describe('intentarCompra (lo que hace «Comprar» en el panel)', () => {
  it('compra: baja el dinero el precio exacto y avisa con el evento', () => {
    const partida = new Partida(base())
    const i = clasificarParcelas(partida.estado).indexOf('comprable')
    const precio = parcelaComprable(partida.estado, i)
    expect(precio.comprable).toBe(true)
    const vistos: string[] = []
    partida.suscribir((c) => vistos.push(...c.eventos.map((e) => e.tipo)))
    expect(intentarCompra(partida, i)).toEqual({ ok: true })
    expect(partida.estado.dinero).toBe(1100 - (precio.comprable ? precio.precio : 0))
    expect(vistos).toContain('parcela-comprada')
  })

  it('si el núcleo la rechaza (carrera) devuelve el motivo y no cambia el estado', () => {
    const partida = new Partida(base(0))
    const antes = partida.estado
    const r = intentarCompra(partida, 3)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.texto).toBe(textoErrorCompra('fondos-insuficientes'))
    expect(partida.estado).toBe(antes)
    const r2 = intentarCompra(new Partida(conPropiasDeDepuracion(base(), [3])), 3)
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.texto).toContain('ya es tuya')
  })

  it('un error desconocido tiene texto genérico', () => {
    expect(textoErrorCompra('comando-desconocido')).toBe('No se pudo comprar la parcela')
  })
})

describe('?debug&dinero=N', () => {
  it('solo con debug y si es un entero no negativo', () => {
    expect(leerParametros('?debug&dinero=250').dinero).toBe(250)
    expect(leerParametros('?debug&dinero=0').dinero).toBe(0)
    expect(leerParametros('?dinero=250').dinero).toBeUndefined()
    expect(leerParametros('?debug&dinero=-5').dinero).toBeUndefined()
    expect(leerParametros('?debug&dinero=abc').dinero).toBeUndefined()
  })
})
