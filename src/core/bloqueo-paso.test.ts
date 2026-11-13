import { describe, expect, it } from 'vitest'
import {
  aplicarComando,
  colocacionValida,
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

const motivo = (
  e: EstadoJuego,
  tipo: string,
  x: number,
  y: number,
  op: Parameters<typeof colocacionValida>[4] = {},
) => {
  const r = colocacionValida(e, tipo, x, y, op)
  return r.valida ? 'valida' : r.motivo
}
const caja = (e: EstadoJuego, x: number, y: number) =>
  ok(e, { tipo: 'Construir', tipoEdificio: 'caja-envio', x, y })
const ap = (e: EstadoJuego) => ({ x: Math.floor(e.aparicion.x), y: Math.floor(e.aparicion.y) })
const aparte = (e: EstadoJuego): EstadoJuego => {
  const { x, y } = ap(e)
  return { ...e, personaje: { ...e.personaje, x: x + 3.5, y: y + 3.5 } }
}

/** Agua sin vado, obstáculo, edificio o fuera del valle. */
function cerrada(e: EstadoJuego, x: number, y: number): boolean {
  const lado = ladoValle(e.valle)
  if (x < 0 || y < 0 || x >= lado || y >= lado) return true
  return (
    aguaBloqueada(e.valle, e.cauce)[y * lado + x] === 1 ||
    e.obstaculos.some((o) => o.x === x && o.y === y) ||
    e.edificios.some((b) => b.x === x && b.y === y)
  )
}

/** Esquina del valle libre con sus dos vecinas libres, lejos de la aparición. */
function esquina(e: EstadoJuego): { x: number; y: number; dx: number; dy: number } {
  const lado = ladoValle(e.valle)
  const a = ap(e)
  for (const [x, y, dx, dy] of [
    [0, 0, 1, 1],
    [lado - 1, 0, -1, 1],
    [0, lado - 1, 1, -1],
    [lado - 1, lado - 1, -1, -1],
  ] as const) {
    if (
      !cerrada(e, x, y) &&
      !cerrada(e, x + dx, y) &&
      !cerrada(e, x, y + dy) &&
      !cerrada(e, x + 4 * dx, y + 4 * dy) &&
      Math.abs(x - a.x) + Math.abs(y - a.y) > 8
    ) {
      return { x, y, dx, dy }
    }
  }
  throw new Error('sin esquina libre')
}

describe('bloquea-paso', () => {
  it('cuatro cajas alrededor de la aparición: la última la encierra y se rechaza', () => {
    let e = aparte(abierto())
    const { x, y } = ap(e)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
    ] as const) {
      expect(motivo(e, 'caja-envio', x + dx, y + dy)).toBe('valida')
      e = caja(e, x + dx, y + dy)
    }
    expect(motivo(e, 'caja-envio', x, y - 1)).toBe('bloquea-paso')
    const r = cmd(e, { tipo: 'Construir', tipoEdificio: 'caja-envio', x, y: y - 1 })
    expect(r).toMatchObject({ ok: false, error: 'bloquea-paso' })
    expect(r.estado).toBe(e)
  })

  it('encerrar al personaje (lejos de la aparición) también se rechaza', () => {
    let e = abierto()
    const a = ap(e)
    const px = a.x + 6
    const py = a.y
    e = { ...e, personaje: { ...e.personaje, x: px + 0.5, y: py + 0.5 } }
    e = caja(e, px - 1, py)
    e = caja(e, px + 1, py)
    e = caja(e, px, py - 1)
    expect(motivo(e, 'caja-envio', px, py + 1)).toBe('bloquea-paso')
  })

  it('una bolsa cerrada junto a un árbol se rechaza; una casilla que no cierra nada vale', () => {
    const e0 = abierto()
    const { x, y, dx, dy } = esquina(e0)
    // Un árbol tapa una salida de la esquina; la otra no se puede tapar.
    const e = { ...e0, obstaculos: [{ x: x + dx, y, tipo: 'arbol' as const, variante: 0 }] }
    expect(motivo(e, 'caja-envio', x, y + dy)).toBe('bloquea-paso')
    expect(motivo(e, 'caja-envio', x + dx * 3, y + dy * 3)).toBe('valida')
    // Con una caja en lugar del árbol ocurre lo mismo.
    expect(motivo(caja(e0, x + dx, y), 'caja-envio', x, y + dy)).toBe('bloquea-paso')
  })

  it('una huella que ocupa la propia casilla de la bolsa no cuenta como perdida', () => {
    const e0 = abierto()
    const { x, y, dx, dy } = esquina(e0)
    const e = { ...e0, obstaculos: [{ x: x + dx, y, tipo: 'roca' as const, variante: 0 }] }
    expect(motivo(e, 'caja-envio', x, y)).toBe('valida')
    expect(motivo(e, 'caja-envio', x, y + dy)).toBe('bloquea-paso')
  })

  it('mover: ignorarId quita antes el edificio; deja de encerrar o pasaría a encerrar', () => {
    const e0 = abierto()
    const { x, y, dx, dy } = esquina(e0)
    const arbol = [{ x: x + dx, y, tipo: 'arbol' as const, variante: 0 }]
    const caja1 = (cx: number, cy: number) => ({
      id: 1,
      tipo: 'caja-envio' as const,
      x: cx,
      y: cy,
      obra: null,
    })
    const mover = { ignorarId: 1, ignorarCostes: true }
    // Estado a mano (el núcleo no deja llegar a él): la caja tapa la otra salida de la esquina.
    const encierra = {
      ...e0,
      obstaculos: arbol,
      edificios: [caja1(x, y + dy)],
      siguienteIdEdificio: 2,
    }
    // Sin la caja la esquina es alcanzable: moverla lejos vale.
    expect(motivo(encierra, 'caja-envio', x + dx * 4, y + dy * 4, mover)).toBe('valida')
    // Dejarla donde está (o en cualquier otro punto que tape la salida) sigue encerrando.
    expect(motivo(encierra, 'caja-envio', x, y + dy, mover)).toBe('bloquea-paso')
    // Una caja lejos que se movería a la salida pasaría a encerrar.
    const libre = {
      ...e0,
      obstaculos: arbol,
      edificios: [caja1(x + dx * 4, y + dy * 4)],
      siguienteIdEdificio: 2,
    }
    expect(motivo(libre, 'caja-envio', x, y + dy, mover)).toBe('bloquea-paso')
    // La caja vieja no estorba al mover sobre sí misma ni hace falta quitarla para otras.
    expect(motivo(libre, 'caja-envio', x + dx * 4, y + dy * 5, mover)).toBe('valida')
  })

  it('va antes de fondos-insuficientes y después de zona-incompatible', () => {
    let e = aparte(abierto())
    const { x, y } = ap(e)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
    ] as const) {
      e = caja(e, x + dx, y + dy)
    }
    expect(motivo({ ...e, dinero: 0 }, 'caja-envio', x, y - 1)).toBe('bloquea-paso')
    const sinZona = { ...e, zonas: '.'.repeat(e.zonas.length) }
    expect(motivo(sinZona, 'caja-envio', x, y - 1)).toBe('zona-incompatible')
  })

  it('es rápido: menos de 2 ms por llamada en el valle de 96x96 (cursor en movimiento)', () => {
    const e = abierto()
    const lado = ladoValle(e.valle)
    colocacionValida(e, 'caja-envio', 10, 10) // calienta cachés
    const n = 400
    const t0 = performance.now()
    for (let i = 0; i < n; i++) {
      colocacionValida(e, 'cobertizo', i % (lado - 4), (i * 7) % (lado - 3))
    }
    const ms = (performance.now() - t0) / n
    console.log(`colocacionValida: ${ms.toFixed(3)} ms por llamada`)
    // Margen amplio para que no sea frágil en CI; el objetivo es < 2 ms.
    expect(ms).toBeLessThan(10)
  })
})

describe('unico-ya-existe en segunda posición', () => {
  it('gana a fuera-del-valle y a zona-incompatible; tipo-desconocido sigue ganando', () => {
    let e = abierto()
    const a = ap(e)
    const lado = ladoValle(e.valle)
    const hx = a.x < lado / 2 ? a.x + 3 : a.x - 8
    const hy = a.y < lado / 2 ? a.y + 3 : a.y - 8
    e = ok(e, {
      tipo: 'PintarZona',
      x0: hx,
      y0: hy,
      x1: hx + 5,
      y1: hy + 5,
      zona: 'vivienda',
    })
    e = ok(e, { tipo: 'Construir', tipoEdificio: 'casa', x: hx, y: hy })
    expect(motivo(e, 'casa', -9, -9)).toBe('unico-ya-existe')
    expect(motivo(e, 'casa', a.x, hy)).toBe('unico-ya-existe')
    expect(motivo(e, 'palacio', -9, -9)).toBe('tipo-desconocido')
  })
})

describe('comandos con estados raros', () => {
  it('Construir valida los materiales como el dinero', () => {
    const e = abierto()
    const { x, y } = ap(e)
    for (const materiales of [
      { madera: 20.5, piedra: 0 },
      { madera: Infinity, piedra: 0 },
      { madera: 100, piedra: -1 },
      { madera: 100, piedra: NaN },
    ]) {
      const s = { ...e, materiales }
      const r = cmd(s, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: x + 3, y })
      expect(r).toMatchObject({ ok: false, error: 'estado-invalido' })
      expect(r.estado).toBe(s)
    }
  })

  it('MoverPersonaje sin `edificios` devuelve estado-invalido en vez de lanzar', () => {
    const e = { ...abierto(), modo: 'vida', edificios: undefined } as unknown as EstadoJuego
    const r = cmd(e, { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 100 })
    expect(r).toMatchObject({ ok: false, error: 'estado-invalido' })
  })
})
