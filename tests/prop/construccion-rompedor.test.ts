/**
 * Rompedor · M4-02 Catálogo de edificios y reglas de colocación.
 * Ataques: oráculo independiente de `colocacionValida` (todos los motivos y su prioridad),
 * bordes del valle, parcelas propias/ajenas, río y vados, caja del personaje fraccionaria,
 * casa única, costes justos, parámetros basura, cachés (`mapaTransitabilidad`,
 * `casillaConEdificio`), movimiento contra edificios nuevos, `buscarCamino`, partidas largas
 * mezclando todos los comandos, esquema de datos, estados corruptos y balance.
 */
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import * as v from 'valibot'
import {
  aplicarComando,
  buscarCamino,
  CARACTER_ZONA,
  casillaBloqueada,
  casillaConEdificio,
  casillasOcupadas,
  casillasRio,
  colocacionValida,
  CONFIG_EDIFICIOS,
  CONFIG_PERSONAJE,
  crearEstadoInicial,
  EsquemaConfigEdificios,
  ladoValle,
  mapaTransitabilidad,
  MOTIVOS_COLOCACION,
  precioParcela,
  zonaEn,
  type Comando,
  type EstadoJuego,
  type MotivoColocacion,
  type TipoEdificio,
  type Zona,
} from '../../src/core'

const TIPOS: readonly TipoEdificio[] = ['casa', 'caja-envio', 'cobertizo']
const M = CONFIG_PERSONAJE.tamanoCaja / 2
const RICO = 1_000_000_000
const MUCHO = { madera: 1_000_000, piedra: 1_000_000 }

const cmd = (e: EstadoJuego, c: unknown) => aplicarComando(e, c as Comando)
function paso(e: EstadoJuego, c: unknown): EstadoJuego {
  const r = cmd(e, c)
  return r.ok ? r.estado : e
}
function pasoOk(e: EstadoJuego, c: unknown): EstadoJuego {
  const r = cmd(e, c)
  if (!r.ok) throw new Error(`comando rechazado: ${JSON.stringify(c)} -> ${r.error}`)
  return r.estado
}
const construir = (e: EstadoJuego, tipoEdificio: unknown, x: unknown, y: unknown) =>
  cmd(e, { tipo: 'Construir', tipoEdificio, x, y })
const pintar = (e: EstadoJuego, x0: number, y0: number, x1: number, y1: number, zona: Zona) =>
  paso(e, { tipo: 'PintarZona', x0, y0, x1, y1, zona })
const plano = (e: EstadoJuego) => paso(e, { tipo: 'CambiarModo', modo: 'plano' })
const vida = (e: EstadoJuego) => paso(e, { tipo: 'CambiarModo', modo: 'vida' })
const conPersonaje = (e: EstadoJuego, x: number, y: number): EstadoJuego => ({
  ...e,
  personaje: { ...e.personaje, x, y },
})

function comprarTodas(e: EstadoJuego): EstadoJuego {
  const n = e.valle.parcelas.length
  let est = e
  for (let vuelta = 0; vuelta < n; vuelta++) {
    let cambio = false
    for (let i = 0; i < n; i++) {
      const r = cmd(est, { tipo: 'ComprarParcela', indice: i })
      if (r.ok) {
        est = r.estado
        cambio = true
      }
    }
    if (!cambio) break
  }
  return est
}

/** Agua (río + vados) calculada aquí, sin la caché del núcleo. */
function aguaDe(e: EstadoJuego): Set<number> {
  const lado = ladoValle(e.valle)
  return new Set(casillasRio(e.valle, e.cauce.ancho).map((k) => k.y * lado + k.x))
}

/**
 * Real uniforme en [min, max] con valores «de borde» (múltiplos de 0,1 y ±m) mezclados:
 * `fc.double` se concentra en extremos y apenas genera posiciones intermedias.
 */
const real = (min: number, max: number) =>
  fc.oneof(
    fc.integer({ min: Math.round(min * 1e6), max: Math.round(max * 1e6) }).map((n) => n / 1e6),
    fc.integer({ min: Math.round(min * 10), max: Math.round(max * 10) }).map((n) => n / 10),
    fc
      .tuple(
        fc.integer({ min: Math.ceil(min), max: Math.floor(max) }),
        fc.constantFrom(-0.3, 0.3, 0.7, 1.3),
      )
      .map(([a, b]) => Math.min(max, Math.max(min, a + b))),
  )
const def = (t: TipoEdificio) => CONFIG_EDIFICIOS.edificios[t]

/**
 * Oráculo independiente: todos los motivos que se cumplen, en el orden documentado.
 * Escrito desde la documentación (GDD §6.3–6.5 y comentario de MOTIVOS_COLOCACION).
 */
function oraculo(e: EstadoJuego, tipo: unknown, x: number, y: number): MotivoColocacion[] {
  const out: MotivoColocacion[] = []
  if (typeof tipo !== 'string' || !(TIPOS as readonly string[]).includes(tipo)) {
    return ['tipo-desconocido']
  }
  const d = def(tipo as TipoEdificio)
  // Decisión del orquestador: `unico-ya-existe` va en segunda posición.
  if (d.unico && e.edificios.some((b) => b.tipo === tipo)) return ['unico-ya-existe']
  const lado = ladoValle(e.valle)
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x + d.ancho > lado ||
    y + d.alto > lado
  ) {
    return ['fuera-del-valle']
  }
  const c = e.valle.casillasPorParcela
  const agua = aguaDe(e)
  const obst = new Set(e.obstaculos.map((o) => o.y * lado + o.x))
  const ocup = new Set<number>()
  for (const b of e.edificios) {
    const db = def(b.tipo)
    for (let yy = b.y; yy < b.y + db.alto; yy++)
      for (let xx = b.x; xx < b.x + db.ancho; xx++) ocup.add(yy * lado + xx)
  }
  const casillas: { x: number; y: number; k: number }[] = []
  for (let yy = y; yy < y + d.alto; yy++)
    for (let xx = x; xx < x + d.ancho; xx++) casillas.push({ x: xx, y: yy, k: yy * lado + xx })
  const parcelaDe = (xx: number, yy: number) =>
    e.valle.parcelas[Math.floor(yy / c) * e.valle.parcelasPorLado + Math.floor(xx / c)]
  if (casillas.some((q) => parcelaDe(q.x, q.y)?.estado !== 'propia')) out.push('no-propia')
  if (casillas.some((q) => agua.has(q.k))) out.push('agua')
  if (casillas.some((q) => obst.has(q.k))) out.push('obstaculo')
  if (casillas.some((q) => ocup.has(q.k))) out.push('ocupada')
  const ax = Math.floor(e.aparicion.x)
  const ay = Math.floor(e.aparicion.y)
  if (casillas.some((q) => q.x === ax && q.y === ay)) out.push('aparicion')
  // Caja del personaje como intervalo semiabierto [px-m, px+m) contra [x, x+ancho).
  const { x: px, y: py } = e.personaje
  if (px - M < x + d.ancho && px + M > x && py - M < y + d.alto && py + M > y) {
    out.push('personaje')
  }
  const permitidos = d.zonas.map((z) => CARACTER_ZONA[z])
  if (casillas.some((q) => !permitidos.includes(e.zonas[q.k] ?? '?'))) {
    out.push('zona-incompatible')
  }
  // Ronda 2: bloquea-paso, con un BFS propio (4-conexo desde la aparición).
  const alcance = (extra: Set<number>): Set<number> => {
    const libre = (k: number) => !agua.has(k) && !obst.has(k) && !ocup.has(k) && !extra.has(k)
    const inicio = ay * lado + ax
    if (!libre(inicio)) return new Set<number>()
    const visto = new Set<number>([inicio])
    const pila = [inicio]
    while (pila.length > 0) {
      const k = pila.pop() as number
      const kx = k % lado
      const ky = (k - kx) / lado
      for (const [nx, ny] of [
        [kx + 1, ky],
        [kx - 1, ky],
        [kx, ky + 1],
        [kx, ky - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= lado || ny >= lado) continue
        const nk = ny * lado + nx
        if (!visto.has(nk) && libre(nk)) {
          visto.add(nk)
          pila.push(nk)
        }
      }
    }
    return visto
  }
  const huella = new Set(casillas.map((q) => q.k))
  const antes = alcance(new Set())
  const despues = alcance(huella)
  if ([...antes].some((k) => !huella.has(k) && !despues.has(k))) out.push('bloquea-paso')
  if (e.dinero < d.coste.dinero) out.push('fondos-insuficientes')
  if (e.materiales.madera < d.coste.madera || e.materiales.piedra < d.coste.piedra) {
    out.push('materiales-insuficientes')
  }
  return out
}

// ----------------------------------------------------------------------------------------
// Estados base
// ----------------------------------------------------------------------------------------
const SEMILLAS = [3, 7, 42]
/** Todas las parcelas propias, dinero y materiales de sobra, Modo Plano, sin zonas. */
const todas = SEMILLAS.map((s) =>
  plano(
    comprarTodas(
      crearEstadoInicial({ semilla: s, dineroInicial: RICO, materialesIniciales: MUCHO }),
    ),
  ),
)
/** Como `todas`, pero con solo 18 parcelas compradas (para que haya fronteras con ajenas). */
const parciales = SEMILLAS.map((s) => {
  let e = crearEstadoInicial({ semilla: s, dineroInicial: RICO, materialesIniciales: MUCHO })
  for (let vuelta = 0; vuelta < 36; vuelta++)
    for (let i = 0; i < e.valle.parcelas.length; i++) {
      if (e.valle.parcelas.filter((p) => p.estado === 'propia').length >= 18) break
      e = paso(e, { tipo: 'ComprarParcela', indice: (i * 7 + vuelta) % 36 })
    }
  return plano(e)
})
function parcial(i: number): EstadoJuego {
  const e = parciales[i]
  if (!e) throw new Error('sin estado')
  return e
}
function base(i: number): EstadoJuego {
  const e = todas[i]
  if (!e) throw new Error('sin estado')
  return e
}
const LADO = ladoValle(base(0).valle)
const C = base(0).valle.casillasPorParcela

/** Base sin obstáculos, toda pintada de `zona` y con el personaje lejos (esquina 0.5,0.5 si no es agua). */
function limpio(i: number, zona: Zona): EstadoJuego {
  let e: EstadoJuego = { ...base(i), obstaculos: [] }
  e = pintar(e, 0, 0, LADO - 1, LADO - 1, zona)
  return e
}

describe('oráculo: colocacionValida coincide con las reglas documentadas', () => {
  it('motivo = primer motivo del oráculo; válida si y solo si no hay ninguno (fast-check)', () => {
    let validas = 0
    const visto = new Set<string>()
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SEMILLAS.length - 1 }),
        fc.array(
          fc.record({
            x0: fc.integer({ min: 0, max: LADO - 1 }),
            y0: fc.integer({ min: 0, max: LADO - 1 }),
            w: fc.integer({ min: 0, max: 30 }),
            h: fc.integer({ min: 0, max: 30 }),
            zona: fc.constantFrom<Zona>('cultivo', 'huerto', 'vivienda', 'almacen'),
          }),
          { maxLength: 6 },
        ),
        fc.array(
          fc.record({
            t: fc.constantFrom(...TIPOS),
            x: fc.integer({ min: 0, max: LADO - 1 }),
            y: fc.integer({ min: 0, max: LADO - 1 }),
          }),
          { maxLength: 25 },
        ),
        fc.boolean(),
        fc.record({
          t: fc.oneof(
            fc.constantFrom<unknown>(...TIPOS),
            fc.constantFrom<unknown>('Casa', 'toString', '__proto__', 1),
          ),
          x: fc.integer({ min: -5, max: LADO + 5 }),
          y: fc.integer({ min: -5, max: LADO + 5 }),
          px: real(0, LADO),
          py: real(0, LADO),
          cerca: fc.boolean(),
          ancla: fc.constantFrom(0, 1, 2),
          ox: fc.integer({ min: -4, max: 1 }),
          oy: fc.integer({ min: -3, max: 1 }),
          parcial: fc.boolean(),
          dinero: fc.constantFrom(0, 49, 50, 299, 300, 350, RICO),
          madera: fc.constantFrom(0, 19, 20, 49, 50, 1000),
          piedra: fc.constantFrom(0, 9, 10, 1000),
        }),
        (i, zonas, obras, sinPintarParcelas, q0) => {
          let e = q0.parcial ? parcial(i) : base(i)
          for (const z of zonas) e = pintar(e, z.x0, z.y0, z.x0 + z.w, z.y0 + z.h, z.zona)
          // Muchas zonas compatibles alrededor para que haya obras de verdad.
          if (!sinPintarParcelas) e = pintar(e, 0, 0, LADO - 1, LADO - 1, 'almacen')
          for (const o of obras) {
            const pz = o.t === 'casa' ? 'vivienda' : 'almacen'
            const e2 = pintar(e, o.x, o.y, o.x + 3, o.y + 2, pz)
            const r = construir(e2, o.t, o.x, o.y)
            if (r.ok) e = r.estado
          }
          // Consulta anclada a la aparición o a una obra existente, o libre.
          const anclaObra = e.edificios[0]
          const q =
            q0.ancla === 1
              ? {
                  ...q0,
                  x: Math.floor(e.aparicion.x) + q0.ox,
                  y: Math.floor(e.aparicion.y) + q0.oy,
                }
              : q0.ancla === 2 && anclaObra
                ? { ...q0, x: anclaObra.x + q0.ox, y: anclaObra.y + q0.oy }
                : q0
          // Personaje en cualquier punto, o pegado a la huella consultada.
          const px = q.cerca ? q.x + (q.px % 6) - 1.5 : q.px
          const py = q.cerca ? q.y + (q.py % 5) - 1.5 : q.py
          e = {
            ...conPersonaje(e, px, py),
            dinero: q.dinero,
            materiales: { madera: q.madera, piedra: q.piedra },
          }
          const r = colocacionValida(e, q.t, q.x, q.y)
          const esperados = oraculo(e, q.t, q.x, q.y)
          if (esperados.length === 0) {
            expect(r).toEqual({ valida: true })
            validas++
          } else {
            expect(r).toEqual({ valida: false, motivo: esperados[0] })
            visto.add(esperados[0] as string)
          }
          // El comando dice lo mismo que la función.
          const rc = construir(e, q.t, q.x, q.y)
          if (typeof q.t !== 'string') expect(rc.ok).toBe(false)
          else if (r.valida) expect(rc.ok).toBe(true)
          else {
            expect(rc.ok).toBe(false)
            if (!rc.ok) {
              expect(rc.error).toBe(r.motivo)
              expect(rc.estado).toBe(e)
            }
          }
        },
      ),
      { numRuns: 1500 },
    )
    expect(validas).toBeGreaterThan(5)
    // Cubre casi todos los motivos (no todos son alcanzables con generadores al azar).
    expect(visto.size, [...visto].join(',')).toBeGreaterThanOrEqual(11)
  })

  it('MOTIVOS_COLOCACION contiene los diez motivos de la issue más tipo-desconocido y fuera-del-valle', () => {
    for (const m of [
      'no-propia',
      'zona-incompatible',
      'ocupada',
      'obstaculo',
      'agua',
      'personaje',
      'aparicion',
      'fondos-insuficientes',
      'materiales-insuficientes',
      'unico-ya-existe',
    ]) {
      expect(MOTIVOS_COLOCACION).toContain(m)
    }
  })
})

// ----------------------------------------------------------------------------------------
// Bordes, parcelas, río y vados
// ----------------------------------------------------------------------------------------
describe('huellas en bordes y fronteras', () => {
  it('bordes del valle: pegada al borde vale, una casilla más allá es fuera-del-valle', () => {
    for (let i = 0; i < SEMILLAS.length; i++) {
      const e = conPersonaje(limpio(i, 'almacen'), -10, -10)
      const agua = aguaDe(e)
      for (const t of ['caja-envio', 'cobertizo'] as const) {
        const d = def(t)
        const esquinas = [
          [0, 0],
          [LADO - d.ancho, 0],
          [0, LADO - d.alto],
          [LADO - d.ancho, LADO - d.alto],
        ] as const
        for (const [x, y] of esquinas) {
          const esperado = oraculo(e, t, x, y)
          const r = colocacionValida(e, t, x, y)
          expect(r.valida).toBe(esperado.length === 0)
          if (!r.valida) expect(['agua', 'aparicion']).toContain(r.motivo)
          void agua
        }
        for (const [x, y] of [
          [-1, 0],
          [0, -1],
          [LADO - d.ancho + 1, 0],
          [0, LADO - d.alto + 1],
          [LADO, LADO],
          [Number.MAX_SAFE_INTEGER, 0],
          [-Number.MAX_SAFE_INTEGER, 0],
        ] as const) {
          expect(colocacionValida(e, t, x, y)).toEqual({ valida: false, motivo: 'fuera-del-valle' })
        }
      }
    }
  })

  it('huella a caballo entre dos parcelas propias vale; entre propia y ajena da no-propia', () => {
    // Semilla 7, sin obstáculos: compramos solo dos parcelas contiguas de una fila sin río.
    const e0 = crearEstadoInicial({ semilla: 7, dineroInicial: RICO, materialesIniciales: MUCHO })
    const N = e0.valle.parcelasPorLado
    let par: [number, number] | undefined
    for (let f = 0; f < N && !par; f++)
      for (let col = 0; col + 1 < N && !par; col++) {
        const a = f * N + col
        if (!e0.valle.rio.includes(a) && !e0.valle.rio.includes(a + 1)) par = [a, a + 1]
      }
    if (!par) throw new Error('sin par de parcelas sin río')
    let e = pasoOk(e0, { tipo: 'ComprarParcela', indice: par[0] })
    e = pasoOk(e, { tipo: 'ComprarParcela', indice: par[1] })
    e = plano({ ...e, obstaculos: [] })
    e = pintar(e, 0, 0, LADO - 1, LADO - 1, 'almacen')
    e = conPersonaje(e, -10, -10)
    const fila = Math.floor(par[0] / N)
    const col = par[0] % N
    const y = fila * C + 4
    const frontera = (col + 1) * C // primera casilla de la segunda parcela
    // Cobertizo 3×2 que cruza la frontera entre las dos propias.
    expect(colocacionValida(e, 'cobertizo', frontera - 2, y)).toEqual({ valida: true })
    expect(construir(e, 'cobertizo', frontera - 1, y).ok).toBe(true)
    // Cruza la frontera izquierda de la primera (ajena o fuera del valle).
    const izq = col * C
    const r = colocacionValida(e, 'cobertizo', izq - 1, y)
    expect(r).toEqual({ valida: false, motivo: izq === 0 ? 'fuera-del-valle' : 'no-propia' })
    // Cruza la frontera derecha de la segunda.
    const der = (col + 2) * C
    if (der < LADO) {
      expect(colocacionValida(e, 'cobertizo', der - 2, y)).toEqual({
        valida: false,
        motivo: 'no-propia',
      })
      expect(colocacionValida(e, 'cobertizo', der - 3, y)).toEqual({ valida: true })
    }
    // Arriba/abajo con la fila vecina (ajena).
    const arriba = fila * C
    if (arriba > 0) {
      expect(colocacionValida(e, 'cobertizo', frontera, arriba - 1)).toEqual({
        valida: false,
        motivo: 'no-propia',
      })
      expect(colocacionValida(e, 'cobertizo', frontera, arriba)).toEqual({ valida: true })
    }
  })

  it('río: cada casilla de agua (vados incluidos) rechaza con agua; la orilla seca vale', () => {
    for (let i = 0; i < SEMILLAS.length; i++) {
      const e = conPersonaje(limpio(i, 'almacen'), -10, -10)
      const agua = aguaDe(e)
      // Los vados están dentro del agua.
      for (const k of e.cauce.vados) expect(agua.has(k)).toBe(true)
      let orillas = 0
      for (const k of agua) {
        const x = k % LADO
        const y = Math.floor(k / LADO)
        const r = colocacionValida(e, 'caja-envio', x, y)
        expect(r).toEqual({ valida: false, motivo: 'agua' })
        // Huella 3×2 que solo roza el agua por una esquina.
        if (x >= 3 && y >= 2) {
          const r2 = colocacionValida(e, 'cobertizo', x - 2, y - 1)
          expect(r2).toEqual({ valida: false, motivo: 'agua' })
        }
        // Orilla seca justo al lado.
        for (const [ox, oy] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ] as const) {
          if (ox < 0 || oy < 0 || ox >= LADO || oy >= LADO) continue
          if (agua.has(oy * LADO + ox)) continue
          const ap = Math.floor(e.aparicion.x) === ox && Math.floor(e.aparicion.y) === oy
          expect(colocacionValida(e, 'caja-envio', ox, oy).valida).toBe(!ap)
          orillas++
        }
      }
      expect(orillas).toBeGreaterThan(50)
    }
  })

  it('vado concreto: el comando Construir sobre un vado da agua y el estado queda igual', () => {
    const e = conPersonaje(limpio(0, 'almacen'), -10, -10)
    const k = e.cauce.vados[0]
    if (k === undefined) throw new Error('sin vados')
    const r = construir(e, 'caja-envio', k % LADO, Math.floor(k / LADO))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('agua')
    expect(r.estado).toBe(e)
  })
})

// ----------------------------------------------------------------------------------------
// Caja del personaje en el límite exacto
// ----------------------------------------------------------------------------------------
describe('caja del personaje en el límite de la huella', () => {
  const e0 = conPersonaje(limpio(1, 'almacen'), -10, -10)
  const agua = aguaDe(e0)
  // Una caja-envio libre lejos del agua y de la aparición.
  let X = -1
  let Y = -1
  for (let y = 10; y < LADO - 10 && X < 0; y++)
    for (let x = 10; x < LADO - 10 && X < 0; x++) {
      let ok = true
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) if (agua.has((y + dy) * LADO + x + dx)) ok = false
      if (
        Math.abs(Math.floor(e0.aparicion.x) - x) < 4 &&
        Math.abs(Math.floor(e0.aparicion.y) - y) < 4
      )
        ok = false
      if (ok) {
        X = x
        Y = y
      }
    }

  it('borde exacto: la caja que acaba justo en x0 no toca; un ulp más sí', () => {
    // Caja que termina exactamente en X (px + m === X) → no toca.
    const pxIzq = X - M
    const permitido = pxIzq + M <= X // con redondeo de coma flotante
    const r = colocacionValida(conPersonaje(e0, pxIzq, Y + 0.5), 'caja-envio', X, Y)
    expect(r.valida).toBe(permitido && !(pxIzq + M > X))
    // Caja que empieza exactamente en X+1 (px - m === X+1) → no toca.
    const pxDer = X + 1 + M
    const r2 = colocacionValida(conPersonaje(e0, pxDer, Y + 0.5), 'caja-envio', X, Y)
    expect(r2.valida).toBe(!(pxDer - M < X + 1))
    // Muy dentro del ulp por cada lado → toca.
    for (const [px, py] of [
      [X - M + 1e-9, Y + 0.5],
      [X + 1 + M - 1e-9, Y + 0.5],
      [X + 0.5, Y - M + 1e-9],
      [X + 0.5, Y + 1 + M - 1e-9],
      [X - M + 1e-9, Y - M + 1e-9], // esquina
    ] as const) {
      expect(colocacionValida(conPersonaje(e0, px, py), 'caja-envio', X, Y)).toEqual({
        valida: false,
        motivo: 'personaje',
      })
    }
    // Esquina exterior (diagonal) sin solaparse en un eje → no toca.
    expect(
      colocacionValida(conPersonaje(e0, X - M - 1e-9, Y - M - 1e-9), 'caja-envio', X, Y),
    ).toEqual({ valida: true })
  })

  it('propiedad: tras construir, el personaje nunca queda en una casilla de la huella ni puede entrar', () => {
    fc.assert(
      fc.property(
        real(-2.5, 3.5),
        real(-2.5, 3.5),
        fc.constantFrom('caja-envio' as const, 'cobertizo' as const),
        fc.constantFrom(-1, 0, 1),
        fc.constantFrom(-1, 0, 1),
        (ox, oy, t, dx, dy) => {
          const e = conPersonaje(e0, X + ox, Y + oy)
          const r = construir(e, t, X, Y)
          if (!r.ok) return
          const d = def(t)
          const toca = (px: number, py: number) =>
            px - M < X + d.ancho && px + M > X && py - M < Y + d.alto && py + M > Y
          expect(toca(r.estado.personaje.x, r.estado.personaje.y)).toBe(false)
          // Empujar contra el edificio recién hecho durante 3 s.
          let s = vida(r.estado)
          for (let k = 0; k < 12; k++) s = paso(s, { tipo: 'MoverPersonaje', dx, dy, ms: 250 })
          expect(toca(s.personaje.x, s.personaje.y)).toBe(false)
          expect(Number.isFinite(s.personaje.x) && Number.isFinite(s.personaje.y)).toBe(true)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('el personaje se desliza a lo largo de un edificio nuevo (no se queda pegado)', () => {
    // Cobertizo con el personaje al oeste; empuja en diagonal noreste: debe subir por la pared.
    const e = conPersonaje(e0, X - M - 0.01, Y + 1)
    const r = construir(e, 'cobertizo', X, Y)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    let s = vida(r.estado)
    const y0 = s.personaje.y
    s = paso(s, { tipo: 'MoverPersonaje', dx: 1, dy: -1, ms: 250 })
    expect(s.personaje.y).toBeLessThan(y0 - 0.5)
    expect(s.personaje.x).toBeLessThanOrEqual(X - M + 1e-9)
  })
})

// ----------------------------------------------------------------------------------------
// Casa única, costes justos
// ----------------------------------------------------------------------------------------
describe('casa única y costes', () => {
  it('casa única: tras la primera, veinte intentos en sitios válidos dan unico-ya-existe y nada cambia', () => {
    let e = conPersonaje(limpio(2, 'vivienda'), -10, -10)
    const dinero0 = e.dinero
    const libres: [number, number][] = []
    for (let y = 0; y + 3 <= LADO; y += 3)
      for (let x = 0; x + 4 <= LADO; x += 4)
        if (colocacionValida(e, 'casa', x, y).valida) libres.push([x, y])
    expect(libres.length).toBeGreaterThan(21)
    const [x0, y0] = libres[0] ?? [0, 0]
    // Intentos fallidos antes (agua/fuera) no gastan el «único».
    expect(construir(e, 'casa', -1, 0).ok).toBe(false)
    e = pasoOk(e, { tipo: 'Construir', tipoEdificio: 'casa', x: x0, y: y0 })
    for (const [x, y] of libres.slice(1, 21)) {
      const r = construir(e, 'casa', x, y)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toBe('unico-ya-existe')
      expect(r.estado).toBe(e)
    }
    expect(e.edificios.filter((b) => b.tipo === 'casa')).toHaveLength(1)
    expect(e.dinero).toBe(dinero0)
    expect(e.materiales).toEqual(MUCHO)
  })

  it('costes justos: con lo exacto se puede y queda a cero; con uno menos no', () => {
    const e = conPersonaje(limpio(1, 'almacen'), -10, -10)
    const sitio = (t: TipoEdificio) => {
      for (let y = 0; y < LADO; y++)
        for (let x = 0; x < LADO; x++)
          if (colocacionValida(e, t, x, y).valida) return [x, y] as const
      throw new Error('sin sitio')
    }
    for (const t of ['caja-envio', 'cobertizo'] as const) {
      const { dinero, madera, piedra } = def(t).coste
      const [x, y] = sitio(t)
      const justo = { ...e, dinero, materiales: { madera, piedra } }
      const r = construir(justo, t, x, y)
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.estado.dinero).toBe(0)
        expect(r.estado.materiales).toEqual({ madera: 0, piedra: 0 })
      }
      const casos: [EstadoJuego, MotivoColocacion][] = [
        [{ ...justo, dinero: dinero - 1 }, 'fondos-insuficientes'],
        [{ ...justo, materiales: { madera: madera - 1, piedra } }, 'materiales-insuficientes'],
        [
          { ...justo, dinero: dinero - 1, materiales: { madera: madera - 1, piedra } },
          'fondos-insuficientes',
        ],
      ]
      if (piedra > 0) {
        casos.push([
          { ...justo, materiales: { madera, piedra: piedra - 1 } },
          'materiales-insuficientes',
        ])
      }
      for (const [est, motivo] of casos) {
        const rr = construir(est, t, x, y)
        expect(rr.ok).toBe(false)
        if (!rr.ok) expect(rr.error).toBe(motivo)
        expect(rr.estado).toBe(est)
      }
    }
    // La casa es gratis: con 0 y 0 se puede.
    const ev = conPersonaje(limpio(1, 'vivienda'), -10, -10)
    let casa: readonly [number, number] | undefined
    for (let y = 0; y < LADO && !casa; y++)
      for (let x = 0; x < LADO && !casa; x++)
        if (colocacionValida(ev, 'casa', x, y).valida) casa = [x, y]
    if (!casa) throw new Error('sin sitio para la casa')
    const pobre = { ...ev, dinero: 0, materiales: { madera: 0, piedra: 0 } }
    expect(construir(pobre, 'casa', casa[0], casa[1]).ok).toBe(true)
  })

  it('con el dinero y materiales por defecto: caja y cobertizo caben en el lote de bienvenida', () => {
    const { madera, piedra } = CONFIG_EDIFICIOS.materialesIniciales
    const caja = def('caja-envio').coste
    const cob = def('cobertizo').coste
    expect(madera).toBeGreaterThanOrEqual(caja.madera + cob.madera)
    expect(piedra).toBeGreaterThanOrEqual(caja.piedra + cob.piedra)
  })
})

describe('opciones para mover (ignorarId, ignorarCostes)', () => {
  it('mover la casa una casilla sobre sí misma vale; sin ignorarId choca consigo; otro id no la libra', () => {
    let e = conPersonaje(limpio(0, 'vivienda'), -10, -10)
    let sitio: readonly [number, number] | undefined
    for (let y = 0; y < LADO && !sitio; y++)
      for (let x = 0; x < LADO && !sitio; x++)
        if (
          colocacionValida(e, 'casa', x, y).valida &&
          colocacionValida(e, 'casa', x + 1, y).valida
        )
          sitio = [x, y]
    if (!sitio) throw new Error('sin sitio')
    const [x, y] = sitio
    e = pasoOk(e, { tipo: 'Construir', tipoEdificio: 'casa', x, y })
    const id = e.edificios[0]?.id ?? -1
    expect(colocacionValida(e, 'casa', x + 1, y)).toEqual({ valida: false, motivo: 'ocupada' })
    expect(colocacionValida(e, 'casa', x + 1, y, { ignorarId: id })).toEqual({ valida: true })
    expect(colocacionValida(e, 'casa', x + 1, y, { ignorarId: id + 99 })).toEqual({
      valida: false,
      motivo: 'ocupada',
    })
    const pobre = { ...e, dinero: 0, materiales: { madera: 0, piedra: 0 } }
    // ignorarCostes: un cobertizo «movido» no exige dinero (zona aparte).
    const conAlmacen = pintar(pobre, 0, 0, LADO - 1, LADO - 1, 'almacen')
    let cob: readonly [number, number] | undefined
    for (let yy = 0; yy < LADO && !cob; yy++)
      for (let xx = 0; xx < LADO && !cob; xx++)
        if (colocacionValida(conAlmacen, 'cobertizo', xx, yy, { ignorarCostes: true }).valida)
          cob = [xx, yy]
    if (!cob) throw new Error('sin sitio')
    expect(colocacionValida(conAlmacen, 'cobertizo', cob[0], cob[1])).toEqual({
      valida: false,
      motivo: 'fondos-insuficientes',
    })
  })
})

// ----------------------------------------------------------------------------------------
// Parámetros basura
// ----------------------------------------------------------------------------------------
describe('parámetros basura', () => {
  const e = conPersonaje(limpio(0, 'almacen'), -10, -10)
  let sx = 0
  let sy = 0
  for (let y = 0; y < LADO; y++)
    for (let x = 0; x < LADO; x++)
      if (sx === 0 && colocacionValida(e, 'caja-envio', x, y).valida) {
        sx = x
        sy = y
      }

  it('tipos basura: nunca lanza, mismo estado y error parametro-invalido o tipo-desconocido', () => {
    const tipos: unknown[] = [
      'toString',
      '__proto__',
      'constructor',
      'hasOwnProperty',
      'valueOf',
      'Casa',
      'casa ',
      ' casa',
      'CAJA-ENVIO',
      '',
      'materialesIniciales',
      'edificios',
      NaN,
      -0,
      0,
      1,
      null,
      undefined,
      {},
      [],
      ['casa'],
      true,
      { toString: () => 'casa' },
      Object.create(null),
    ]
    for (const t of tipos) {
      let r: ReturnType<typeof construir> | undefined
      expect(() => (r = construir(e, t, sx, sy))).not.toThrow()
      expect(r?.ok).toBe(false)
      if (r && !r.ok) {
        expect(['parametro-invalido', 'tipo-desconocido']).toContain(r.error)
        expect(r.estado).toBe(e)
      }
      expect(() => colocacionValida(e, t, sx, sy)).not.toThrow()
      expect(colocacionValida(e, t, sx, sy)).toEqual({ valida: false, motivo: 'tipo-desconocido' })
    }
  })

  it('coordenadas basura: parametro-invalido sin lanzar; -0 se normaliza a 0', () => {
    const malas: unknown[] = [
      NaN,
      Infinity,
      -Infinity,
      1.5,
      2 ** 53,
      1e300,
      '3',
      null,
      undefined,
      {},
      [],
      [3],
      true,
      10n,
    ]
    for (const m of malas) {
      for (const [x, y] of [
        [m, sy],
        [sx, m],
      ]) {
        let r: ReturnType<typeof construir> | undefined
        expect(() => (r = construir(e, 'caja-envio', x, y))).not.toThrow()
        expect(r?.ok).toBe(false)
        if (r && !r.ok) {
          expect(r.error).toBe('parametro-invalido')
          expect(r.estado).toBe(e)
        }
        expect(() => colocacionValida(e, 'caja-envio', x as number, y as number)).not.toThrow()
      }
    }
    // -0 en un sitio válido en x = 0 (si existe).
    for (let y = 0; y < LADO; y++) {
      if (!colocacionValida(e, 'caja-envio', 0, y).valida) continue
      const r = construir(e, 'caja-envio', -0, y)
      expect(r.ok).toBe(true)
      if (r.ok) {
        const b = r.estado.edificios.at(-1)
        expect(Object.is(b?.x, 0)).toBe(true)
        const ev = r.eventos[0]
        expect(ev && 'x' in ev && Object.is(ev.x, 0)).toBe(true)
        expect(JSON.parse(JSON.stringify(r.estado))).toEqual(r.estado)
      }
      break
    }
  })

  it('Construir fuera de Plano: solo-en-plano, también con parámetros válidos', () => {
    const ev = vida(e)
    const r = construir(ev, 'caja-envio', sx, sy)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('solo-en-plano')
    expect(r.estado).toBe(ev)
  })
})

// ----------------------------------------------------------------------------------------
// Cachés
// ----------------------------------------------------------------------------------------
describe('cachés de transitabilidad y ocupación', () => {
  const e0 = conPersonaje(limpio(1, 'almacen'), -10, -10)
  let sx = -1
  let sy = -1
  for (let y = 0; y < LADO && sx < 0; y++)
    for (let x = 0; x < LADO && sx < 0; x++) {
      const m = mapaTransitabilidad(e0)
      if (colocacionValida(e0, 'cobertizo', x, y).valida && !casillaBloqueada(m, x, y)) {
        sx = x
        sy = y
      }
    }

  it('mismo cauce y obstáculos, edificios nuevos: el mapa nuevo bloquea y el viejo no cambia', () => {
    const m0 = mapaTransitabilidad(e0)
    expect(casillaBloqueada(m0, sx, sy)).toBe(false)
    expect(casillaConEdificio(e0, sx, sy)).toBe(false)
    const e1 = pasoOk(e0, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: sx, y: sy })
    expect(e1.cauce).toBe(e0.cauce)
    expect(e1.obstaculos).toBe(e0.obstaculos)
    const m1 = mapaTransitabilidad(e1)
    for (let y = sy; y < sy + 2; y++)
      for (let x = sx; x < sx + 3; x++) {
        expect(casillaBloqueada(m1, x, y)).toBe(true)
        expect(casillaConEdificio(e1, x, y)).toBe(true)
      }
    // El estado viejo sigue viendo su mundo (no hay contaminación de caché).
    const m0b = mapaTransitabilidad(e0)
    expect(casillaBloqueada(m0b, sx, sy)).toBe(false)
    expect(casillaConEdificio(e0, sx, sy)).toBe(false)
    expect(m0b.bloqueada).toEqual(m0.bloqueada)
    // Alternar muchas veces.
    for (let k = 0; k < 5; k++) {
      expect(casillaBloqueada(mapaTransitabilidad(e1), sx, sy)).toBe(true)
      expect(casillaBloqueada(mapaTransitabilidad(e0), sx, sy)).toBe(false)
    }
  })

  it('misma lista de edificios con otro valle u otra aparición: recalcula bien', () => {
    const e1 = pasoOk(e0, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: sx, y: sy })
    const otroValle = { ...e1, valle: { ...e1.valle } }
    expect(casillaBloqueada(mapaTransitabilidad(otroValle), sx, sy)).toBe(true)
    const otraAp = { ...e1, aparicion: { x: e1.aparicion.x, y: e1.aparicion.y } }
    expect(mapaTransitabilidad(otraAp).bloqueada).toEqual(mapaTransitabilidad(e1).bloqueada)
    // Lista copiada (otra referencia, mismo contenido) da el mismo mapa.
    const copia = { ...e1, edificios: [...e1.edificios] }
    expect(mapaTransitabilidad(copia).bloqueada).toEqual(mapaTransitabilidad(e1).bloqueada)
    // casillasOcupadas con otro lado no reutiliza la entrada.
    const a = casillasOcupadas(e1.edificios, LADO)
    const b = casillasOcupadas(e1.edificios, LADO + 7)
    expect(a.has(sy * LADO + sx)).toBe(true)
    expect(b.has(sy * (LADO + 7) + sx)).toBe(true)
    expect(b.has(sy * LADO + sx)).toBe(sy * LADO + sx === sy * (LADO + 7) + sx)
  })

  it('pintar alrededor de un edificio tras usar la caché no toca la huella', () => {
    const e1 = pasoOk(e0, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: sx, y: sy })
    void mapaTransitabilidad(e1)
    void casillaConEdificio(e1, sx, sy)
    const e2 = paso(e1, { tipo: 'BorrarZona', x0: 0, y0: 0, x1: LADO - 1, y1: LADO - 1 })
    const e3 = pintar(e2, 0, 0, LADO - 1, LADO - 1, 'cultivo')
    for (const s of [e2, e3]) {
      for (let y = sy; y < sy + 2; y++)
        for (let x = sx; x < sx + 3; x++) expect(zonaEn(s, x, y)).toBe('almacen')
    }
  })
})

// ----------------------------------------------------------------------------------------
// buscarCamino hacia edificios
// ----------------------------------------------------------------------------------------
describe('buscarCamino con edificios', () => {
  it('destino dentro de un edificio: el camino acaba fuera, junto a él, y nunca pisa una huella', () => {
    let e = conPersonaje(limpio(2, 'almacen'), -10, -10)
    const puestos: { x: number; y: number }[] = []
    for (let y = 2; y < LADO - 2 && puestos.length < 15; y += 7)
      for (let x = 2; x < LADO - 3 && puestos.length < 15; x += 9) {
        const r = construir(e, 'cobertizo', x, y)
        if (r.ok) {
          e = r.estado
          puestos.push({ x, y })
        }
      }
    expect(puestos.length).toBeGreaterThan(5)
    const ocup = casillasOcupadas(e.edificios, LADO)
    const mapa = mapaTransitabilidad(e)
    const desde = { x: e.aparicion.x, y: e.aparicion.y }
    for (const p of puestos) {
      const ruta = buscarCamino(e, desde, { x: p.x + 1.5, y: p.y + 1 })
      expect(ruta.length).toBeGreaterThan(0)
      for (const q of ruta) {
        expect(ocup.has(Math.floor(q.y) * LADO + Math.floor(q.x))).toBe(false)
        expect(casillaBloqueada(mapa, Math.floor(q.x), Math.floor(q.y))).toBe(false)
      }
      const fin = ruta.at(-1)
      if (!fin) continue
      // El final está pegado a la huella (a distancia de Chebyshev ≤ 1 de alguna casilla suya),
      // salvo que la huella no tenga vecinos alcanzables.
      const cx = Math.floor(fin.x)
      const cy = Math.floor(fin.y)
      let vecinosLibres = 0
      for (let y = p.y - 1; y <= p.y + 2; y++)
        for (let x = p.x - 1; x <= p.x + 3; x++) if (!casillaBloqueada(mapa, x, y)) vecinosLibres++
      if (vecinosLibres > 0) {
        const dxx = Math.max(p.x - cx, cx - (p.x + 2), 0)
        const dyy = Math.max(p.y - cy, cy - (p.y + 1), 0)
        expect(Math.max(dxx, dyy)).toBeLessThanOrEqual(1)
      }
    }
  })
})

// ----------------------------------------------------------------------------------------
// Partidas largas
// ----------------------------------------------------------------------------------------
function comprobar(e: EstadoJuego, e0: EstadoJuego, gastoParcelas: number): void {
  const lado = ladoValle(e.valle)
  const c = e.valle.casillasPorParcela
  const agua = aguaDe(e)
  const obst = new Set(e.obstaculos.map((o) => o.y * lado + o.x))
  const vistas = new Set<number>()
  let dinero = 0
  let madera = 0
  let piedra = 0
  const ax = Math.floor(e.aparicion.x)
  const ay = Math.floor(e.aparicion.y)
  for (const b of e.edificios) {
    const d = def(b.tipo)
    dinero += d.coste.dinero
    madera += d.coste.madera
    piedra += d.coste.piedra
    expect(b.obra).not.toBeNull()
    expect((b.obra?.diaFin ?? 0) - (b.obra?.diaInicio ?? 0)).toBe(d.dias)
    for (let y = b.y; y < b.y + d.alto; y++)
      for (let x = b.x; x < b.x + d.ancho; x++) {
        const k = y * lado + x
        expect(x >= 0 && y >= 0 && x < lado && y < lado).toBe(true)
        expect(vistas.has(k)).toBe(false)
        vistas.add(k)
        expect(agua.has(k)).toBe(false)
        expect(obst.has(k)).toBe(false)
        expect(
          e.valle.parcelas[Math.floor(y / c) * e.valle.parcelasPorLado + Math.floor(x / c)]?.estado,
        ).toBe('propia')
        expect(d.zonas).toContain(zonaEn(e, x, y))
        expect(x === ax && y === ay).toBe(false)
      }
    const { x: px, y: py } = e.personaje
    expect(px - M < b.x + d.ancho && px + M > b.x && py - M < b.y + d.alto && py + M > b.y).toBe(
      false,
    )
  }
  expect(e.edificios.filter((b) => b.tipo === 'casa').length).toBeLessThanOrEqual(1)
  for (const n of [e.dinero, e.materiales.madera, e.materiales.piedra]) {
    expect(Number.isSafeInteger(n) && n >= 0).toBe(true)
  }
  expect(e0.dinero - e.dinero).toBe(dinero + gastoParcelas)
  expect(e0.materiales.madera - e.materiales.madera).toBe(madera)
  expect(e0.materiales.piedra - e.materiales.piedra).toBe(piedra)
  expect(e.siguienteIdEdificio).toBe(e.edificios.length + 1)
}

function comandoLargo(lado: number, c: number): fc.Arbitrary<unknown[]> {
  // Coordenadas sesgadas a la zona de la aparición (parcelas 32-33 y vecinas) y a todo el valle.
  const coord = fc.oneof(
    fc.integer({ min: -3, max: lado + 3 }),
    fc.integer({ min: 2 * c - 2, max: 4 * c + 2 }),
    fc.integer({ min: 4 * c - 2, max: lado - 1 }),
  )
  const unico = (a: fc.Arbitrary<unknown>) => a.map((x) => [x])
  // Macro: pinta la huella (zona a veces incompatible), pasa a Plano y construye.
  const obra = fc
    .record({
      t: fc.constantFrom<unknown>('casa', 'caja-envio', 'cobertizo', 'caja-envio', 'toString'),
      x: fc.oneof(coord, fc.integer({ min: 2 * c - 3, max: 4 * c + 2 })),
      y: fc.oneof(coord, fc.integer({ min: 4 * c - 3, max: lado - 1 })),
      zona: fc.constantFrom('vivienda', 'almacen', 'almacen', 'cultivo'),
      pintar: fc.boolean(),
      plano: fc.boolean(),
    })
    .map(({ t, x, y, zona, pintar: p, plano: pl }) => [
      ...(p ? [{ tipo: 'PintarZona', x0: x, y0: y, x1: x + 3, y1: y + 2, zona }] : []),
      ...(pl ? [{ tipo: 'CambiarModo', modo: 'plano' }] : []),
      { tipo: 'Construir', tipoEdificio: t, x, y },
    ])
  return fc.oneof(
    { weight: 8, arbitrary: obra },
    {
      weight: 4,
      arbitrary: unico(
        fc.record({
          tipo: fc.constant('PintarZona'),
          x0: coord,
          y0: coord,
          x1: coord,
          y1: coord,
          zona: fc.constantFrom('vivienda', 'almacen', 'almacen', 'cultivo'),
        }),
      ),
    },
    {
      weight: 1,
      arbitrary: unico(
        fc.record({
          tipo: fc.constant('BorrarZona'),
          x0: coord,
          y0: coord,
          x1: coord,
          y1: coord,
        }),
      ),
    },
    {
      weight: 2,
      arbitrary: unico(
        fc.record({
          tipo: fc.constant('ComprarParcela'),
          indice: fc.oneof(fc.integer({ min: 0, max: 35 }), fc.constantFrom(32, 33, 26, 27, 31)),
        }),
      ),
    },
    {
      weight: 3,
      arbitrary: unico(
        fc.record({
          tipo: fc.constant('CambiarModo'),
          modo: fc.constantFrom('vida', 'plano'),
        }),
      ),
    },
    {
      weight: 5,
      arbitrary: unico(
        fc.record({
          tipo: fc.constant('MoverPersonaje'),
          dx: fc.oneof(fc.constantFrom(-1, 0, 1), fc.double({ min: -1, max: 1, noNaN: true })),
          dy: fc.oneof(fc.constantFrom(-1, 0, 1), fc.double({ min: -1, max: 1, noNaN: true })),
          ms: fc.integer({ min: 0, max: 400 }),
        }),
      ),
    },
    {
      weight: 1,
      arbitrary: unico(
        fc.record({
          tipo: fc.constant('AvanzarTiempo'),
          minutos: fc.constantFrom(1, 30, 600, 2000),
        }),
      ),
    },
  )
}

describe('partidas largas mezclando todos los comandos', () => {
  for (const [nombre, opciones] of [
    ['ahorros reales (1100, 80/20)', {}],
    ['rico', { dineroInicial: RICO, materialesIniciales: MUCHO }],
  ] as const) {
    it(`invariantes, rechazo = mismo objeto, determinismo y JSON (${nombre})`, () => {
      const iniciales = SEMILLAS.map((semilla) => crearEstadoInicial({ semilla, ...opciones }))
      let construidos = 0
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: SEMILLAS.length - 1 }),
          fc.boolean(),
          fc.array(comandoLargo(LADO, C), { minLength: 20, maxLength: 80 }).map((a) => a.flat()),
          (i, comprarAp, resto) => {
            const e0 = iniciales[i] as EstadoJuego
            // La mitad de las partidas empieza comprando la parcela de la aparición.
            const n = e0.valle.parcelasPorLado
            const ap = Math.floor(e0.aparicion.y / C) * n + Math.floor(e0.aparicion.x / C)
            const comandos = comprarAp ? [{ tipo: 'ComprarParcela', indice: ap }, ...resto] : resto
            let e = e0
            let gastoParcelas = 0
            for (const c of comandos) {
              const previo = JSON.stringify(e)
              const r = cmd(e, c)
              expect(JSON.stringify(e)).toBe(previo)
              if (!r.ok) expect(r.estado).toBe(e)
              if (r.ok) {
                for (const ev of r.eventos)
                  if (ev.tipo === 'parcela-comprada') gastoParcelas += ev.precio
                if ((c as { tipo: string }).tipo === 'Construir') construidos++
              }
              e = r.estado
              comprobar(e, e0, gastoParcelas)
            }
            // Determinismo y JSON ida y vuelta (y sigue aceptando comandos igual).
            const otra = comandos.reduce<EstadoJuego>((s, c) => cmd(s, c).estado, e0)
            expect(otra).toEqual(e)
            const json = JSON.parse(JSON.stringify(e)) as EstadoJuego
            expect(json).toEqual(e)
            const ult = comandos.at(-1)
            if (ult) expect(cmd(json, ult)).toEqual(cmd(e, ult))
          },
        ),
        { numRuns: 150 },
      )
      expect(construidos).toBeGreaterThan(10)
    })
  }
})

// ----------------------------------------------------------------------------------------
// Fallo conocido: aislar al personaje (se deja demostrado)
// ----------------------------------------------------------------------------------------
describe('[conocido] edificios que aíslan la aparición', () => {
  it('[conocido S1] cuatro cajas alrededor de la aparición la encierran y el personaje no puede salir', () => {
    let e = conPersonaje(limpio(0, 'almacen'), -10, -10)
    e = { ...e, personaje: { ...e.personaje, x: e.aparicion.x, y: e.aparicion.y } }
    const ax = Math.floor(e.aparicion.x)
    const ay = Math.floor(e.aparicion.y)
    for (const [x, y] of [
      [ax + 1, ay],
      [ax - 1, ay],
      [ax, ay + 1],
      [ax, ay - 1],
    ] as const) {
      const r = construir(e, 'caja-envio', x, y)
      if (r.ok) e = r.estado
    }
    // La aparición queda sin salida: la única casilla alcanzable es ella misma.
    const mapa = mapaTransitabilidad(e)
    let libres = 0
    for (let k = 0; k < mapa.bloqueada.length; k++) if (mapa.bloqueada[k] === 0) libres++
    let s = vida(e)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      for (let k = 0; k < 8; k++) s = paso(s, { tipo: 'MoverPersonaje', dx, dy, ms: 250 })
    const dist = Math.hypot(s.personaje.x - e.aparicion.x, s.personaje.y - e.aparicion.y)
    // Lo esperado: colocacionValida debería impedir encerrar la aparición.
    expect(libres).toBeGreaterThan(1)
    expect(dist).toBeGreaterThan(1)
  })
})

// ----------------------------------------------------------------------------------------
// Estados corruptos (guardado manipulado, M7)
// ----------------------------------------------------------------------------------------
describe('estados corruptos', () => {
  const e = conPersonaje(limpio(0, 'almacen'), -10, -10)
  let sx = 0
  let sy = 0
  for (let y = 0; y < LADO; y++)
    for (let x = 0; x < LADO; x++)
      if (sx === 0 && colocacionValida(e, 'caja-envio', x, y).valida) {
        sx = x
        sy = y
      }

  it('[S3] materiales no enteros o infinitos: Construir los acepta y deja materiales inválidos', () => {
    for (const materiales of [
      { madera: 20.5, piedra: 0 },
      { madera: Infinity, piedra: 0 },
      { madera: '100' as unknown as number, piedra: 0 },
    ]) {
      const est = { ...e, materiales }
      const r = construir(est, 'caja-envio', sx, sy)
      // Como con el dinero (que exige entero seguro), debería rechazarse.
      expect(r.ok).toBe(false)
    }
  })

  it('[S3] MoverPersonaje con un estado sin `edificios` no debe lanzar', () => {
    const sin = { ...vida(e), edificios: undefined } as unknown as EstadoJuego
    const s = conPersonaje(sin, sin.aparicion.x, sin.aparicion.y)
    expect(() => cmd(s, { tipo: 'MoverPersonaje', dx: 1, dy: 0, ms: 100 })).not.toThrow()
  })

  it('Construir con estados raros no lanza', () => {
    const raros: EstadoJuego[] = [
      { ...e, edificios: undefined } as unknown as EstadoJuego,
      { ...e, materiales: null } as unknown as EstadoJuego,
      { ...e, siguienteIdEdificio: NaN },
      { ...e, zonas: 'x' },
      { ...e, dinero: NaN },
      {
        ...e,
        edificios: [{ id: 1, tipo: 'palacio', x: 0, y: 0, obra: null }],
      } as unknown as EstadoJuego,
      { ...e, edificios: [{ id: 1, tipo: 'casa', x: NaN, y: 1e300, obra: null }] },
    ]
    for (const est of raros) {
      expect(() => construir(est, 'caja-envio', sx, sy)).not.toThrow()
      const r = construir(est, 'caja-envio', sx, sy)
      if (!r.ok) expect(r.estado).toBe(est)
    }
  })
})

// ----------------------------------------------------------------------------------------
// Esquema de datos
// ----------------------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any -- mutaciones libres del JSON */
describe('esquema de data/edificios.json', () => {
  const bueno = () => structuredClone(CONFIG_EDIFICIOS) as unknown as Record<string, any>
  const rechaza = (mut: (d: Record<string, any>) => void) => {
    const d = bueno()
    mut(d)
    return !v.safeParse(EsquemaConfigEdificios, d).success
  }
  it('acepta los datos reales', () => {
    expect(v.safeParse(EsquemaConfigEdificios, bueno()).success).toBe(true)
  })
  it.each([
    ['falta un tipo', (d) => delete d.edificios.casa],
    ['tipo de más', (d) => (d.edificios.granero = d.edificios.cobertizo)],
    ['ancho 0', (d) => (d.edificios.casa.ancho = 0)],
    ['ancho 1.5', (d) => (d.edificios.casa.ancho = 1.5)],
    ['ancho 65', (d) => (d.edificios.casa.ancho = 65)],
    ['alto negativo', (d) => (d.edificios.casa.alto = -1)],
    ['alto como cadena', (d) => (d.edificios.casa.alto = '3')],
    ['zonas vacías', (d) => (d.edificios.casa.zonas = [])],
    ['zona desconocida', (d) => (d.edificios.casa.zonas = ['ganado'])],
    ['zonas repetidas', (d) => (d.edificios.casa.zonas = ['vivienda', 'vivienda'])],
    ['zonas no es array', (d) => (d.edificios.casa.zonas = 'vivienda')],
    ['coste negativo', (d) => (d.edificios.cobertizo.coste.dinero = -1)],
    ['coste fraccionario', (d) => (d.edificios.cobertizo.coste.madera = 0.5)],
    ['coste con material desconocido', (d) => (d.edificios.cobertizo.coste.hierro = 1)],
    ['coste sin piedra', (d) => delete d.edificios.cobertizo.coste.piedra],
    ['días 0', (d) => (d.edificios.casa.dias = 0)],
    ['días 1.5', (d) => (d.edificios.casa.dias = 1.5)],
    ['días gigantes no seguros', (d) => (d.edificios.casa.dias = 2 ** 53)],
    ['unico no booleano', (d) => (d.edificios.casa.unico = 'si')],
    ['sin demolible', (d) => delete d.edificios.casa.demolible],
    ['clave extra en edificio', (d) => (d.edificios.casa.rotable = true)],
    ['reembolso negativo', (d) => (d.reembolsoDemolicion = -0.1)],
    ['reembolso > 1', (d) => (d.reembolsoDemolicion = 1.1)],
    ['reembolso cadena', (d) => (d.reembolsoDemolicion = '0.5')],
    ['materiales iniciales negativos', (d) => (d.materialesIniciales.madera = -1)],
    ['materiales iniciales fraccionarios', (d) => (d.materialesIniciales.piedra = 0.5)],
    ['materiales iniciales con extra', (d) => (d.materialesIniciales.oro = 1)],
    ['sin materiales iniciales', (d) => delete d.materialesIniciales],
    ['clave extra en raíz', (d) => (d.version = 1)],
    ['edificios null', (d) => (d.edificios = null)],
    [
      '__proto__ como tipo',
      (d) =>
        (d.edificios = JSON.parse(JSON.stringify(d.edificios).replace('"casa"', '"__proto__"'))),
    ],
  ] as [string, (d: Record<string, any>) => void][])('rechaza: %s', (_n, mut) => {
    expect(rechaza(mut)).toBe(true)
  })
})

/* eslint-enable @typescript-eslint/no-explicit-any */

// ----------------------------------------------------------------------------------------
// Balance: primera parcela con 1100 de ahorros y 80/20 de material
// ----------------------------------------------------------------------------------------
describe('balance (medición)', () => {
  it('con los ahorros iniciales, ¿caben y se pagan casa + caja + cobertizo en la primera parcela?', () => {
    const N = 200
    const coste = def('caja-envio').coste.dinero + def('cobertizo').coste.dinero
    let semillasConAlguna = 0
    let semillasConApar = 0
    let parcelasAsequibles = 0
    let parcelasAsequiblesConSitio = 0
    let parcelasTotales = 0
    const porTerreno: Record<string, { asequibles: number; conSitio: number; total: number }> = {}
    const sobrantes: number[] = []
    const preciosAp: number[] = []
    for (let s = 1; s <= N; s++) {
      const e0 = crearEstadoInicial({ semilla: 1000 + s })
      const n = e0.valle.parcelasPorLado
      const ap = Math.floor(e0.aparicion.y / C) * n + Math.floor(e0.aparicion.x / C)
      let alguna = false
      for (let i = 0; i < e0.valle.parcelas.length; i++) {
        const p = e0.valle.parcelas[i]
        if (!p) continue
        parcelasTotales++
        const t = (porTerreno[p.terreno] ??= { asequibles: 0, conSitio: 0, total: 0 })
        t.total++
        const precio = precioParcela(e0, i) ?? Infinity
        if (i === ap) preciosAp.push(precio)
        if (e0.dinero - precio < coste) continue
        parcelasAsequibles++
        t.asequibles++
        const r = cmd(e0, { tipo: 'ComprarParcela', indice: i })
        if (!r.ok) continue
        const e1 = plano(r.estado)
        const fin = colocarTres(e1, i)
        if (fin) {
          parcelasAsequiblesConSitio++
          t.conSitio++
          alguna = true
          sobrantes.push(fin.dinero)
          if (i === ap) semillasConApar++
        }
      }
      if (alguna) semillasConAlguna++
    }
    sobrantes.sort((a, b) => a - b)
    preciosAp.sort((a, b) => a - b)
    const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)} %`
    console.log(
      [
        `semillas: ${N}`,
        `semillas con al menos una parcela donde caben y se pagan los tres: ${pct(semillasConAlguna, N)}`,
        `semillas donde vale la parcela de la aparición: ${pct(semillasConApar, N)}`,
        `parcelas que dejan >= ${coste} tras comprar: ${pct(parcelasAsequibles, parcelasTotales)}`,
        `de esas, con sitio para los tres: ${pct(parcelasAsequiblesConSitio, parcelasAsequibles)}`,
        ...Object.entries(porTerreno).map(
          ([k, t]) =>
            `  ${k}: asequibles ${pct(t.asequibles, t.total)}, con sitio ${pct(t.conSitio, t.asequibles)}`,
        ),
        `dinero restante tras los tres: min ${sobrantes[0]}, mediana ${sobrantes[Math.floor(sobrantes.length / 2)]}, max ${sobrantes.at(-1)}`,
        `precio de la parcela de la aparición: min ${preciosAp[0]}, mediana ${preciosAp[Math.floor(preciosAp.length / 2)]}, max ${preciosAp.at(-1)}`,
      ].join('\n'),
    )
    expect(semillasConAlguna / N).toBeGreaterThan(0.5)
  })
})

/**
 * Busca sitio para casa, cobertizo y caja dentro de la parcela `i` (búsqueda pura en rejilla) y
 * lo confirma con comandos reales (pintar la huella y construir).
 */
function colocarTres(e: EstadoJuego, i: number): EstadoJuego | undefined {
  const n = e.valle.parcelasPorLado
  const x0 = (i % n) * C
  const y0 = Math.floor(i / n) * C
  const agua = aguaDe(e)
  const obst = new Set(e.obstaculos.map((o) => o.y * LADO + o.x))
  const ak = Math.floor(e.aparicion.y) * LADO + Math.floor(e.aparicion.x)
  const usada = new Set<number>()
  const libre = (k: number) => !agua.has(k) && !obst.has(k) && k !== ak && !usada.has(k)
  const cabe = (t: TipoEdificio, x: number, y: number) => {
    const d = def(t)
    for (let yy = y; yy < y + d.alto; yy++)
      for (let xx = x; xx < x + d.ancho; xx++) if (!libre(yy * LADO + xx)) return false
    return true
  }
  const marcar = (t: TipoEdificio, x: number, y: number, on: boolean) => {
    const d = def(t)
    for (let yy = y; yy < y + d.alto; yy++)
      for (let xx = x; xx < x + d.ancho; xx++) {
        if (on) usada.add(yy * LADO + xx)
        else usada.delete(yy * LADO + xx)
      }
  }
  const pos = (t: TipoEdificio) => {
    const d = def(t)
    const out: [number, number][] = []
    for (let y = y0; y + d.alto <= y0 + C; y++)
      for (let x = x0; x + d.ancho <= x0 + C; x++) out.push([x, y])
    return out
  }
  const orden: TipoEdificio[] = ['casa', 'cobertizo', 'caja-envio']
  const elegidos: [TipoEdificio, number, number][] = []
  const buscar = (j: number): boolean => {
    const t = orden[j]
    if (!t) return true
    for (const [x, y] of pos(t)) {
      if (!cabe(t, x, y)) continue
      marcar(t, x, y, true)
      elegidos.push([t, x, y])
      if (buscar(j + 1)) return true
      elegidos.pop()
      marcar(t, x, y, false)
    }
    return false
  }
  if (!buscar(0)) return undefined
  let s = e
  for (const [t, x, y] of elegidos) {
    const d = def(t)
    s = pintar(s, x, y, x + d.ancho - 1, y + d.alto - 1, t === 'casa' ? 'vivienda' : 'almacen')
    s = pasoOk(s, { tipo: 'Construir', tipoEdificio: t, x, y })
  }
  return s
}
