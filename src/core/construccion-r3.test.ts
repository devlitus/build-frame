import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  colocacionValida,
  CONFIG_EDIFICIOS,
  crearEstadoInicial,
  ladoValle,
  type Comando,
  type EstadoJuego,
} from './index'
import { aguaBloqueada } from './mapa'

const cmd = (e: EstadoJuego, c: Comando) => aplicarComando(e, c)
function ok(e: EstadoJuego, c: Comando): EstadoJuego {
  const r = cmd(e, c)
  if (!r.ok) throw new Error(`${c.tipo}: ${r.error}`)
  return r.estado
}

/** Valle entero propio, en zona de almacén, sin obstáculos, en Modo Plano y con fondos de sobra. */
function abierto(semilla = 42): EstadoJuego {
  const b = crearEstadoInicial({
    semilla,
    dineroInicial: 1_000_000,
    materialesIniciales: { madera: 100_000, piedra: 100_000 },
  })
  const lado = ladoValle(b.valle)
  const e: EstadoJuego = {
    ...b,
    obstaculos: [],
    modo: 'plano',
    valle: { ...b.valle, parcelas: b.valle.parcelas.map((p) => ({ ...p, estado: 'propia' })) },
  }
  return ok(e, { tipo: 'PintarZona', x0: 0, y0: 0, x1: lado - 1, y1: lado - 1, zona: 'almacen' })
}
const ap = (e: EstadoJuego) => ({ x: Math.floor(e.aparicion.x), y: Math.floor(e.aparicion.y) })
const motivo = (
  e: EstadoJuego,
  t: string,
  x: number,
  y: number,
  op: Parameters<typeof colocacionValida>[4] = {},
) => {
  const r = colocacionValida(e, t, x, y, op)
  return r.valida ? 'valida' : r.motivo
}

describe('edificios con elementos que no son objetos', () => {
  it.each([[null], [1], ['casa'], [undefined]])('%j no hace lanzar a ningún comando', (raro) => {
    const e = { ...abierto(), edificios: [raro] } as unknown as EstadoJuego
    const { x, y } = ap(e)
    const comandos: Comando[] = [
      { tipo: 'Construir', tipoEdificio: 'caja-envio', x: x + 3, y },
      { tipo: 'PintarZona', x0: 0, y0: 0, x1: 3, y1: 3, zona: 'vivienda' },
      { tipo: 'BorrarZona', x0: 0, y0: 0, x1: 3, y1: 3 },
      { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 100 },
    ]
    for (const c of comandos) {
      const s = c.tipo === 'MoverPersonaje' ? { ...e, modo: 'vida' as const } : e
      expect(() => cmd(s, c)).not.toThrow()
      const r = cmd(s, c)
      expect(r).toMatchObject({ ok: false, error: 'estado-invalido' })
      expect(r.estado).toBe(s)
    }
  })
})

describe('pagado y redondeo del reembolso', () => {
  it('cada edificio guarda lo realmente pagado, copiado del catálogo', () => {
    let e = abierto()
    const { x, y } = ap(e)
    e = ok(e, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: x + 3, y })
    e = ok(e, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: x + 8, y })
    const [cob, caja] = e.edificios
    expect(cob?.pagado).toEqual(CONFIG_EDIFICIOS.edificios.cobertizo.coste)
    expect(caja?.pagado).toEqual({ dinero: 50, madera: 20, piedra: 0 })
    expect(cob?.pagado).not.toBe(CONFIG_EDIFICIOS.edificios.cobertizo.coste)
  })

  it('la casa guarda un pagado a cero', () => {
    let e = abierto()
    const { x, y } = ap(e)
    e = ok(e, { tipo: 'PintarZona', x0: x + 3, y0: y - 8, x1: x + 8, y1: y - 4, zona: 'vivienda' })
    e = ok(e, { tipo: 'Construir', tipoEdificio: 'casa', x: x + 3, y: y - 8 })
    expect(e.edificios[0]?.pagado).toEqual({ dinero: 0, madera: 0, piedra: 0 })
  })
})

describe('bloquea-paso con vados', () => {
  /** Alcanzables 4-conexas desde la aparición con el cauce dado (BFS propio). */
  function alcance(e: EstadoJuego, vados: readonly number[]): Set<number> {
    const lado = ladoValle(e.valle)
    const agua = aguaBloqueada(e.valle, { ...e.cauce, vados })
    const cerrada = (k: number) =>
      agua[k] === 1 ||
      e.obstaculos.some((o) => o.y * lado + o.x === k) ||
      e.edificios.some((b) => b.y * lado + b.x === k)
    const { x, y } = ap(e)
    const visto = new Set([y * lado + x])
    const pila = [y * lado + x]
    while (pila.length > 0) {
      const k = pila.pop() as number
      const kx = k % lado
      for (const n of [k - lado, kx > 0 ? k - 1 : -1, kx < lado - 1 ? k + 1 : -1, k + lado]) {
        if (n < 0 || n >= lado * lado || visto.has(n) || cerrada(n)) continue
        visto.add(n)
        pila.push(n)
      }
    }
    return visto
  }

  it('la otra orilla solo se alcanza por un vado: cerrar el último acceso bloquea el paso', () => {
    const base = abierto()
    const lado = ladoValle(base.valle)
    // Un solo cruce (el primer grupo de vados) para que el río parta el valle.
    const vado = base.cauce.vados.slice(0, 8)
    const e0: EstadoJuego = { ...base, cauce: { ...base.cauce, vados: vado } }
    const sin = alcance(e0, [])
    const con = alcance(e0, vado)
    const otraOrilla = [...con].filter((k) => !sin.has(k))
    expect(otraOrilla.length).toBeGreaterThan(0)
    // Casillas de tierra de este lado pegadas al vado.
    const accesos = new Set<number>()
    for (const k of vado) {
      const kx = k % lado
      for (const n of [k - lado, kx > 0 ? k - 1 : -1, kx < lado - 1 ? k + 1 : -1, k + lado]) {
        if (n >= 0 && n < lado * lado && sin.has(n)) accesos.add(n)
      }
    }
    const lista = [...accesos]
    expect(lista.length).toBeGreaterThan(0)
    let e = e0
    for (const [i, k] of lista.entries()) {
      const cx = k % lado
      const cy = (k - cx) / lado
      if (i < lista.length - 1) {
        expect(motivo(e, 'caja-envio', cx, cy)).toBe('valida')
        e = ok(e, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: cx, y: cy })
      } else {
        // Última entrada al vado: tapar la otra orilla (que cuenta como alcanzable) la aísla.
        expect(motivo(e, 'caja-envio', cx, cy)).toBe('bloquea-paso')
      }
    }
  })
})

describe('caché de la base de alcance', () => {
  it('alternar estados, listas de edificios e ignorarId da lo mismo que sin caché', () => {
    const a = (() => {
      let e = abierto()
      const { x, y } = ap(e)
      e = { ...e, personaje: { ...e.personaje, x: x + 3.5, y: y + 3.5 } }
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
      ] as const) {
        e = ok(e, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: x + dx, y: y + dy })
      }
      return e
    })()
    const b = (() => {
      let e = abierto()
      const { x, y } = ap(e)
      e = { ...e, personaje: { ...e.personaje, x: x + 3.5, y: y + 3.5 } }
      e = ok(e, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: x + 1, y })
      return e
    })()
    const { x, y } = ap(a)
    const consultas: [string, number, number, number | undefined][] = [
      ['caja-envio', x, y - 1, undefined],
      ['caja-envio', x, y - 1, 1],
      ['caja-envio', x, y - 1, 2],
      ['caja-envio', x - 1, y - 1, 3],
      ['caja-envio', x + 1, y, 1],
      ['cobertizo', x + 6, y, undefined],
      ['caja-envio', x, y + 1, 3],
    ]
    const hacer = (e: EstadoJuego, [t, cx, cy, id]: (typeof consultas)[number]) =>
      colocacionValida(
        e,
        t,
        cx,
        cy,
        id === undefined ? { ignorarCostes: true } : { ignorarId: id, ignorarCostes: true },
      )
    // `structuredClone` da referencias nuevas en todo: siempre falla la caché.
    const sinCache = (e: EstadoJuego, q: (typeof consultas)[number]) => hacer(structuredClone(e), q)
    const vistos = new Set<string>()
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      for (const e of vuelta % 2 === 0 ? [a, b] : [b, a]) {
        for (const q of consultas) {
          const r = hacer(e, q)
          expect(r).toEqual(sinCache(e, q))
          vistos.add(JSON.stringify(r))
        }
      }
    }
    // Las consultas distinguen casos: hay válidas y bloqueos.
    expect(vistos.has(JSON.stringify({ valida: false, motivo: 'bloquea-paso' }))).toBe(true)
    expect(vistos.has(JSON.stringify({ valida: true }))).toBe(true)
  })
})
