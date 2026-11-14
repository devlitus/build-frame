import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  aplicarComando,
  buscarCamino,
  casillaBloqueada,
  casillaConEdificio,
  colocacionValida,
  CONFIG_EDIFICIOS,
  CONFIG_PERSONAJE,
  crearEstadoInicial,
  EsquemaConfigEdificios,
  ladoValle,
  mapaTransitabilidad,
  MOTIVOS_COLOCACION,
  moverPersonaje,
  VERSION_FORMATO,
  zonaEn,
  type Comando,
  type EstadoJuego,
  type MotivoColocacion,
  type Personaje,
  type TipoEdificio,
} from './index'
import { casillasRio } from './rio'

const base = crearEstadoInicial({ semilla: 42, dineroInicial: 100_000 })
const C = base.valle.casillasPorParcela
const N = base.valle.parcelasPorLado
const LADO = ladoValle(base.valle)
const aguaSet = new Set(casillasRio(base.valle, base.cauce.ancho).map((k) => k.y * LADO + k.x))

const ok = (e: EstadoJuego, c: Comando): EstadoJuego => {
  const r = aplicarComando(e, c)
  if (!r.ok) throw new Error(`${c.tipo}: ${r.error}`)
  return r.estado
}

/** Parcela sin río que no contiene la aparición. */
const iParcela = base.valle.parcelas.findIndex(
  (_, i) =>
    !base.valle.rio.includes(i) &&
    i !== Math.floor(base.aparicion.y / C) * N + Math.floor(base.aparicion.x / C),
)
const px = (iParcela % N) * C
const py = Math.floor(iParcela / N) * C

/**
 * Parcela propia, sin árboles ni rocas, en Modo Plano; mitad izquierda vivienda y mitad
 * derecha almacén (columna `px + C/2` en adelante).
 */
function escenario(extra: Partial<EstadoJuego> = {}): EstadoJuego {
  let e: EstadoJuego = ok(base, { tipo: 'ComprarParcela', indice: iParcela })
  e = { ...e, obstaculos: [], modo: 'plano', ...extra }
  e = ok(e, {
    tipo: 'PintarZona',
    x0: px,
    y0: py,
    x1: px + C / 2 - 1,
    y1: py + C - 1,
    zona: 'vivienda',
  })
  e = ok(e, {
    tipo: 'PintarZona',
    x0: px + C / 2,
    y0: py,
    x1: px + C - 1,
    y1: py + C - 1,
    zona: 'almacen',
  })
  return e
}
const lim = escenario()
const construir = (e: EstadoJuego, tipoEdificio: TipoEdificio, x: number, y: number) =>
  aplicarComando(e, { tipo: 'Construir', tipoEdificio, x, y })
const motivo = (e: EstadoJuego, t: unknown, x: number, y: number) => {
  const r = colocacionValida(e, t, x, y)
  return r.valida ? 'valida' : r.motivo
}
// Esquinas válidas en `lim`: vivienda a la izquierda, almacén a la derecha.
const VIV = { x: px + 1, y: py + 1 }
const ALM = { x: px + C / 2 + 1, y: py + 1 }

describe('catálogo de edificios (data/edificios.json)', () => {
  it('valores de la PO (D1-D3)', () => {
    const { edificios: ed, materialesIniciales, reembolsoDemolicion } = CONFIG_EDIFICIOS
    expect(materialesIniciales).toEqual({ madera: 80, piedra: 20 })
    expect(reembolsoDemolicion).toBe(0.5)
    expect(CONFIG_EDIFICIOS.redondeoReembolso).toBe('abajo')
    expect(ed.casa).toMatchObject({
      ancho: 4,
      alto: 3,
      zonas: ['vivienda'],
      coste: { dinero: 0, madera: 0, piedra: 0 },
      dias: 3,
      unico: true,
      demolible: false,
    })
    expect(ed['caja-envio']).toMatchObject({
      ancho: 1,
      alto: 1,
      coste: { dinero: 50, madera: 20, piedra: 0 },
      dias: 1,
      unico: false,
      demolible: true,
    })
    expect(ed['caja-envio'].zonas).toEqual(['vivienda', 'almacen'])
    expect(ed.cobertizo).toMatchObject({
      ancho: 3,
      alto: 2,
      zonas: ['almacen'],
      coste: { dinero: 300, madera: 50, piedra: 10 },
      dias: 2,
    })
  })

  type Def = Record<string, unknown> & { coste: Record<string, unknown> }
  interface Mutable {
    materialesIniciales: Record<string, unknown>
    reembolsoDemolicion: unknown
    redondeoReembolso: unknown
    edificios: Record<TipoEdificio | 'torre', Def>
  }
  const valido = (o: unknown) => v.safeParse(EsquemaConfigEdificios, o).success
  const clon = () => structuredClone(CONFIG_EDIFICIOS) as unknown as Mutable
  it('acepta los datos reales', () => expect(valido(CONFIG_EDIFICIOS)).toBe(true))
  it.each<[string, (o: Mutable) => void]>([
    ['huella 0', (o) => (o.edificios.casa.ancho = 0)],
    ['huella decimal', (o) => (o.edificios.casa.alto = 2.5)],
    ['huella string', (o) => (o.edificios.casa.alto = '3')],
    ['zona desconocida', (o) => (o.edificios.casa.zonas = ['castillo'])],
    ['sin zonas', (o) => (o.edificios.casa.zonas = [])],
    ['zonas repetidas', (o) => (o.edificios.casa.zonas = ['vivienda', 'vivienda'])],
    ['coste negativo', (o) => (o.edificios.cobertizo.coste.dinero = -1)],
    ['coste decimal', (o) => (o.edificios.cobertizo.coste.madera = 0.5)],
    ['falta un material', (o) => delete o.edificios.cobertizo.coste.piedra],
    ['días 0', (o) => (o.edificios.cobertizo.dias = 0)],
    ['días decimal', (o) => (o.edificios.cobertizo.dias = 1.5)],
    ['unico no booleano', (o) => (o.edificios.casa.unico = 'si')],
    ['demolible ausente', (o) => delete o.edificios.casa.demolible],
    ['falta un tipo', (o) => Reflect.deleteProperty(o.edificios, 'cobertizo')],
    ['tipo extra', (o) => (o.edificios.torre = o.edificios.casa)],
    ['campo extra', (o) => (o.edificios.casa.altura = 3)],
    ['lote negativo', (o) => (o.materialesIniciales.madera = -1)],
    ['lote decimal', (o) => (o.materialesIniciales.piedra = 1.5)],
    ['reembolso > 1', (o) => (o.reembolsoDemolicion = 1.5)],
    ['reembolso negativo', (o) => (o.reembolsoDemolicion = -0.1)],
    ['redondeo desconocido', (o) => (o.redondeoReembolso = 'arriba')],
    ['redondeo ausente', (o) => delete o.redondeoReembolso],
  ])('rechaza datos mal formados: %s', (_n, mut) => {
    const o = clon()
    mut(o)
    expect(valido(o)).toBe(false)
  })
})

describe('estado de M4-02', () => {
  it('formato v9 con materiales, edificios e id siguiente', () => {
    expect(VERSION_FORMATO).toBe(9)
    expect(base.versionFormato).toBe(9)
    expect(base.materiales).toEqual({ madera: 80, piedra: 20 })
    expect(base.edificios).toEqual([])
    expect(base.siguienteIdEdificio).toBe(1)
  })
  it('materialesIniciales a medida y validación', () => {
    const e = crearEstadoInicial({ semilla: 1, materialesIniciales: { madera: 5, piedra: 0 } })
    expect(e.materiales).toEqual({ madera: 5, piedra: 0 })
    expect(() =>
      crearEstadoInicial({ semilla: 1, materialesIniciales: { madera: -1, piedra: 0 } }),
    ).toThrow(RangeError)
  })
})

describe('colocacionValida: casos válidos y motivos', () => {
  it('válida en terreno limpio, propio y con la zona adecuada', () => {
    expect(colocacionValida(lim, 'caja-envio', VIV.x, VIV.y)).toEqual({ valida: true })
    expect(colocacionValida(lim, 'casa', VIV.x, VIV.y)).toEqual({ valida: true })
    expect(colocacionValida(lim, 'cobertizo', ALM.x, ALM.y)).toEqual({ valida: true })
    expect(colocacionValida(lim, 'caja-envio', ALM.x, ALM.y)).toEqual({ valida: true })
  })

  it('tipo-desconocido (incluidos nombres heredados del prototipo)', () => {
    for (const t of ['castillo', 'constructor', '__proto__', 'toString', '', 3, null, undefined]) {
      expect(motivo(lim, t, VIV.x, VIV.y)).toBe('tipo-desconocido')
    }
  })

  it('fuera-del-valle: huella parcialmente fuera o coordenadas no enteras', () => {
    expect(motivo(lim, 'casa', -1, 0)).toBe('fuera-del-valle')
    expect(motivo(lim, 'casa', 0, -1)).toBe('fuera-del-valle')
    expect(motivo(lim, 'casa', LADO - 3, 0)).toBe('fuera-del-valle')
    expect(motivo(lim, 'casa', 0, LADO - 2)).toBe('fuera-del-valle')
    expect(motivo(lim, 'caja-envio', LADO, 0)).toBe('fuera-del-valle')
    for (const n of [NaN, Infinity, 1.5, Number.MAX_VALUE]) {
      expect(motivo(lim, 'caja-envio', n, 0)).toBe('fuera-del-valle')
      expect(motivo(lim, 'caja-envio', 0, n)).toBe('fuera-del-valle')
    }
  })

  it('no-propia: toda la huella debe estar en parcelas propias (una casilla de otra basta)', () => {
    // Parcela vecina (a la derecha o, en el borde del valle, a la izquierda).
    const derecha = px + C < LADO
    const vecina = derecha ? px + C : px - 1
    expect(motivo(lim, 'caja-envio', vecina, py + 3)).toBe('no-propia')
    // Casa a caballo entre la parcela propia y la vecina.
    expect(motivo(lim, 'casa', derecha ? px + C - 2 : px - 2, py + 2)).toBe('no-propia')
    expect(motivo(base, 'caja-envio', px, py)).toBe('no-propia')
  })

  it('agua: río y vados', () => {
    const k = [...aguaSet][0] as number
    const e = ok(base, {
      tipo: 'ComprarParcela',
      indice: Math.floor(Math.floor(k / LADO) / C) * N + Math.floor((k % LADO) / C),
    })
    expect(motivo(e, 'caja-envio', k % LADO, Math.floor(k / LADO))).toBe('agua')
    for (const vado of base.cauce.vados) {
      expect(motivo(e, 'caja-envio', vado % LADO, Math.floor(vado / LADO))).not.toBe('valida')
    }
  })

  it('obstaculo: árbol o roca en cualquier casilla de la huella', () => {
    const e = {
      ...lim,
      obstaculos: [{ x: VIV.x + 3, y: VIV.y + 2, tipo: 'roca' as const, variante: 0 }],
    }
    expect(motivo(e, 'casa', VIV.x, VIV.y)).toBe('obstaculo')
    expect(motivo(e, 'casa', VIV.x, VIV.y + 1)).toBe('obstaculo')
    expect(motivo(e, 'casa', VIV.x, VIV.y + 3)).toBe('valida')
  })

  it('ocupada: otro edificio u obra, también solapes parciales', () => {
    const e = ok(lim, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: ALM.x, y: ALM.y })
    const casos: Array<[number, number, string]> = [
      [0, 0, 'ocupada'],
      [2, 1, 'ocupada'],
      [-1, -1, 'valida'],
      [3, 1, 'valida'],
      [1, 2, 'valida'],
    ]
    for (const [dx, dy, esperado] of casos) {
      expect(motivo(e, 'caja-envio', ALM.x + dx, ALM.y + dy)).toBe(esperado)
    }
    // Una casa solapada solo por una esquina también choca.
    expect(motivo(e, 'cobertizo', ALM.x + 2, ALM.y + 1)).toBe('ocupada')
    // Pegado (adyacente) sí se puede.
    expect(motivo(e, 'caja-envio', ALM.x + 3, ALM.y)).toBe('valida')
  })

  it('aparicion: no se construye en la casilla de aparición', () => {
    const e = {
      ...lim,
      aparicion: { x: VIV.x + 2.5, y: VIV.y + 0.5 },
      personaje: { ...lim.personaje, x: px + 1, y: py + C - 2 },
    }
    expect(motivo(e, 'caja-envio', VIV.x + 2, VIV.y)).toBe('aparicion')
    expect(motivo(e, 'casa', VIV.x, VIV.y)).toBe('aparicion')
    expect(motivo(e, 'casa', VIV.x + 3, VIV.y)).toBe('valida')
  })

  it('personaje: la huella toca la caja de colisión, no solo su casilla central', () => {
    const m = CONFIG_PERSONAJE.tamanoCaja / 2
    // Personaje en el centro de la casilla (VIV.x+5, VIV.y).
    const pj = (x: number, y: number): EstadoJuego => ({
      ...lim,
      personaje: { ...lim.personaje, x, y },
    })
    const cx = VIV.x + 5
    expect(motivo(pj(cx + 0.5, VIV.y + 0.5), 'caja-envio', cx, VIV.y)).toBe('personaje')
    // Con el borde de la caja cruzando a la casilla vecina también choca.
    expect(motivo(pj(cx + 1 - m + 0.01, VIV.y + 0.5), 'caja-envio', cx, VIV.y)).toBe('personaje')
    expect(motivo(pj(cx + 1 + m - 0.01, VIV.y + 0.5), 'caja-envio', cx, VIV.y)).toBe('personaje')
    expect(motivo(pj(cx + 0.5, VIV.y - m + 0.01), 'caja-envio', cx, VIV.y)).toBe('personaje')
    // Otra fila bien lejos: libre.
    expect(motivo(pj(cx + 0.5, VIV.y + 0.5), 'caja-envio', cx, VIV.y + 3)).toBe('valida')
    // Dos casillas más allá: libre.
    expect(motivo(pj(cx + 2.5, VIV.y + 0.5), 'caja-envio', cx, VIV.y)).toBe('valida')
    // Tocando justo el borde (pegado, sin solape) no cuenta.
    expect(motivo(pj(cx + 1 + m, VIV.y + 0.5), 'caja-envio', cx, VIV.y)).toBe('valida')
  })

  it('zona-incompatible: sin zona, zona equivocada o mezcla', () => {
    const sinZona = ok(lim, { tipo: 'BorrarZona', x0: VIV.x, y0: VIV.y, x1: VIV.x, y1: VIV.y })
    expect(zonaEn(sinZona, VIV.x, VIV.y)).toBeUndefined()
    expect(motivo(sinZona, 'caja-envio', VIV.x, VIV.y)).toBe('zona-incompatible')
    // Una sola casilla sin zona dentro de la huella basta.
    expect(motivo(sinZona, 'casa', VIV.x - 1, VIV.y - 1)).toBe('zona-incompatible')
    // Cobertizo (almacén) sobre vivienda; casa (vivienda) sobre almacén.
    expect(motivo(lim, 'cobertizo', VIV.x, VIV.y)).toBe('zona-incompatible')
    expect(motivo(lim, 'casa', ALM.x, ALM.y)).toBe('zona-incompatible')
    // Huella a caballo entre vivienda y almacén: ninguna zona única la admite.
    expect(motivo(lim, 'cobertizo', px + C / 2 - 1, py + 1)).toBe('zona-incompatible')
    // Cultivo y huerto no admiten edificios.
    const cult = ok(lim, {
      tipo: 'PintarZona',
      x0: VIV.x,
      y0: VIV.y,
      x1: VIV.x,
      y1: VIV.y,
      zona: 'cultivo',
    })
    expect(motivo(cult, 'caja-envio', VIV.x, VIV.y)).toBe('zona-incompatible')
  })

  it('unico-ya-existe: la casa es única, también mientras está en obra', () => {
    const e = ok(lim, { tipo: 'Construir', tipoEdificio: 'casa', x: VIV.x, y: VIV.y })
    expect(motivo(e, 'casa', VIV.x, VIV.y + 4)).toBe('unico-ya-existe')
    // Terminada también cuenta.
    const t = { ...e, edificios: e.edificios.map((b) => ({ ...b, obra: null })) }
    expect(motivo(t, 'casa', VIV.x, VIV.y + 4)).toBe('unico-ya-existe')
    // Los no únicos se pueden repetir.
    const c = ok(lim, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: VIV.x, y: VIV.y })
    expect(motivo(c, 'caja-envio', VIV.x + 1, VIV.y)).toBe('valida')
  })

  it('fondos-insuficientes y materiales-insuficientes, con el límite exacto', () => {
    expect(motivo({ ...lim, dinero: 49 }, 'caja-envio', VIV.x, VIV.y)).toBe('fondos-insuficientes')
    expect(motivo({ ...lim, dinero: 50 }, 'caja-envio', VIV.x, VIV.y)).toBe('valida')
    const m = (madera: number, piedra: number) => ({ ...lim, materiales: { madera, piedra } })
    expect(motivo(m(19, 99), 'caja-envio', VIV.x, VIV.y)).toBe('materiales-insuficientes')
    expect(motivo(m(20, 0), 'caja-envio', VIV.x, VIV.y)).toBe('valida')
    expect(motivo(m(99, 9), 'cobertizo', ALM.x, ALM.y)).toBe('materiales-insuficientes')
    expect(motivo(m(49, 10), 'cobertizo', ALM.x, ALM.y)).toBe('materiales-insuficientes')
    expect(motivo(m(50, 10), 'cobertizo', ALM.x, ALM.y)).toBe('valida')
    // Los fondos van antes que los materiales.
    expect(motivo({ ...m(0, 0), dinero: 0 }, 'cobertizo', ALM.x, ALM.y)).toBe(
      'fondos-insuficientes',
    )
    // La casa es gratis: vale con cero de todo.
    expect(motivo({ ...m(0, 0), dinero: 0 }, 'casa', VIV.x, VIV.y)).toBe('valida')
  })

  it('el orden de los motivos es el documentado', () => {
    expect(MOTIVOS_COLOCACION).toEqual([
      'tipo-desconocido',
      'unico-ya-existe',
      'fuera-del-valle',
      'no-propia',
      'agua',
      'obstaculo',
      'ocupada',
      'aparicion',
      'personaje',
      'zona-incompatible',
      'bloquea-paso',
      'fondos-insuficientes',
      'materiales-insuficientes',
    ])
  })

  it('con varios fallos a la vez gana el primero de la lista', () => {
    // Todo mal a la vez: tipo desconocido gana a todo.
    expect(motivo(lim, 'x', -5, -5)).toBe('tipo-desconocido')
    // Fuera del valle gana a no-propia.
    expect(motivo(lim, 'caja-envio', -5, -5)).toBe('fuera-del-valle')
    // no-propia gana a ocupada/zona/fondos (parcela ajena sin dinero ni zona).
    expect(motivo({ ...base, dinero: 0 }, 'caja-envio', px, py)).toBe('no-propia')
    // obstaculo gana a zona-incompatible, fondos y materiales.
    const o = {
      ...lim,
      dinero: 0,
      materiales: { madera: 0, piedra: 0 },
      obstaculos: [{ x: px + 2, y: py + 2, tipo: 'arbol' as const, variante: 0 }],
    }
    expect(motivo(o, 'cobertizo', px + 2, py + 2)).toBe('obstaculo')
    // ocupada gana a zona-incompatible, único y costes.
    const c = ok(lim, { tipo: 'Construir', tipoEdificio: 'casa', x: VIV.x, y: VIV.y })
    expect(motivo({ ...c, dinero: 0 }, 'caja-envio', VIV.x + 1, VIV.y)).toBe('ocupada')
    expect(motivo({ ...c, dinero: 0 }, 'cobertizo', VIV.x + 1, VIV.y)).toBe('ocupada')
    // zona-incompatible gana a costes.
    expect(motivo({ ...c, dinero: 0 }, 'cobertizo', VIV.x, VIV.y + 4)).toBe('zona-incompatible')
    // único gana a todo lo demás salvo el tipo desconocido (ocupada, zona, costes).
    expect(motivo({ ...c, dinero: 0 }, 'casa', ALM.x, ALM.y)).toBe('unico-ya-existe')
    expect(motivo({ ...c, dinero: 0 }, 'casa', VIV.x + 1, VIV.y)).toBe('unico-ya-existe')
    expect(motivo({ ...c, dinero: 0 }, 'casa', -5, -5)).toBe('unico-ya-existe')
    expect(motivo({ ...c, dinero: 0 }, 'casa', VIV.x, VIV.y + 4)).toBe('unico-ya-existe')
    // Todas son alcanzables y distintas.
    const vistos = new Set<MotivoColocacion>()
    for (const m of MOTIVOS_COLOCACION) vistos.add(m)
    expect(vistos.size).toBe(13)
  })

  it('aparicion gana a personaje, personaje a zona-incompatible', () => {
    const e = {
      ...lim,
      aparicion: { x: VIV.x + 0.5, y: VIV.y + 0.5 },
      personaje: { ...lim.personaje, x: VIV.x + 0.5, y: VIV.y + 0.5 },
    }
    expect(motivo(e, 'cobertizo', VIV.x, VIV.y)).toBe('aparicion')
    const p = { ...lim, personaje: { ...lim.personaje, x: VIV.x + 0.5, y: VIV.y + 0.5 } }
    expect(motivo(p, 'cobertizo', VIV.x, VIV.y)).toBe('personaje')
  })

  it('ignorarId permite colocar sobre sí mismo y no cuenta para único', () => {
    const e = ok(lim, { tipo: 'Construir', tipoEdificio: 'casa', x: VIV.x, y: VIV.y })
    const id = (e.edificios[0] as { id: number }).id
    expect(colocacionValida(e, 'casa', VIV.x, VIV.y)).toMatchObject({
      valida: false,
      motivo: 'unico-ya-existe',
    })
    expect(colocacionValida(e, 'casa', VIV.x, VIV.y, { ignorarId: id })).toEqual({ valida: true })
    expect(colocacionValida(e, 'casa', VIV.x + 1, VIV.y + 1, { ignorarId: id })).toEqual({
      valida: true,
    })
    // Un id distinto sigue chocando.
    expect(colocacionValida(e, 'casa', VIV.x, VIV.y, { ignorarId: id + 1 })).toMatchObject({
      valida: false,
    })
  })

  it('ignorarCostes no comprueba dinero ni materiales, pero sí lo demás', () => {
    const pobre = { ...lim, dinero: 0, materiales: { madera: 0, piedra: 0 } }
    expect(motivo(pobre, 'cobertizo', ALM.x, ALM.y)).toBe('fondos-insuficientes')
    expect(colocacionValida(pobre, 'cobertizo', ALM.x, ALM.y, { ignorarCostes: true })).toEqual({
      valida: true,
    })
    expect(
      colocacionValida(pobre, 'cobertizo', VIV.x, VIV.y, { ignorarCostes: true }),
    ).toMatchObject({
      motivo: 'zona-incompatible',
    })
  })

  it('es pura: no cambia el estado', () => {
    const antes = JSON.stringify(lim)
    colocacionValida(lim, 'casa', VIV.x, VIV.y)
    expect(JSON.stringify(lim)).toBe(antes)
  })
})

describe('comando Construir', () => {
  it('cobra, crea la obra y emite obra-iniciada', () => {
    const r = construir({ ...lim, dia: 5 }, 'cobertizo', ALM.x, ALM.y)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.estado.dinero).toBe(lim.dinero - 300)
    expect(r.estado.materiales).toEqual({ madera: 80 - 50, piedra: 20 - 10 })
    expect(r.estado.edificios).toEqual([
      {
        id: 1,
        tipo: 'cobertizo',
        x: ALM.x,
        y: ALM.y,
        obra: { diaInicio: 5, diaFin: 7 },
        pagado: { dinero: 300, madera: 50, piedra: 10 },
      },
    ])
    expect(r.estado.siguienteIdEdificio).toBe(2)
    expect(r.eventos).toEqual([
      { tipo: 'obra-iniciada', id: 1, tipoEdificio: 'cobertizo', x: ALM.x, y: ALM.y },
    ])
    expect(lim.edificios).toEqual([])
    expect(lim.materiales).toEqual({ madera: 80, piedra: 20 })
  })

  it('la casa es gratis y dura 3 días', () => {
    const r = construir(lim, 'casa', VIV.x, VIV.y)
    if (!r.ok) throw new Error(r.error)
    expect(r.estado.dinero).toBe(lim.dinero)
    expect(r.estado.materiales).toEqual(lim.materiales)
    expect(r.estado.edificios[0]?.obra).toEqual({ diaInicio: 1, diaFin: 4 })
  })

  it('los ids crecen y no se reutilizan', () => {
    const a = ok(lim, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: VIV.x, y: VIV.y })
    const b = ok(a, { tipo: 'Construir', tipoEdificio: 'caja-envio', x: VIV.x + 1, y: VIV.y })
    expect(b.edificios.map((e) => e.id)).toEqual([1, 2])
    expect(b.siguienteIdEdificio).toBe(3)
  })

  it('rechazo: ok:false, motivo como error y el mismo objeto estado', () => {
    const casos: Array<[EstadoJuego, TipoEdificio, number, number, string]> = [
      [lim, 'cobertizo', VIV.x, VIV.y, 'zona-incompatible'],
      [lim, 'caja-envio', -1, 0, 'fuera-del-valle'],
      [{ ...lim, dinero: 10 }, 'caja-envio', VIV.x, VIV.y, 'fondos-insuficientes'],
      [
        { ...lim, materiales: { madera: 0, piedra: 0 } },
        'caja-envio',
        VIV.x,
        VIV.y,
        'materiales-insuficientes',
      ],
      [lim, 'castillo' as TipoEdificio, VIV.x, VIV.y, 'tipo-desconocido'],
    ]
    for (const [e, t, x, y, error] of casos) {
      const r = construir(e, t, x, y)
      expect(r).toMatchObject({ ok: false, error })
      expect(r.estado).toBe(e)
    }
  })

  it('solo en Modo Plano', () => {
    const vida = { ...lim, modo: 'vida' as const }
    const r = construir(vida, 'caja-envio', VIV.x, VIV.y)
    expect(r).toMatchObject({ ok: false, error: 'solo-en-plano' })
    expect(r.estado).toBe(vida)
    // Pausado en Plano sí vale (el Plano ya detiene el tiempo).
    expect(construir({ ...lim, pausado: true }, 'caja-envio', VIV.x, VIV.y).ok).toBe(true)
  })

  it('parámetros basura: parametro-invalido, nunca lanza', () => {
    const basura = [NaN, Infinity, -Infinity, 1.5, '3', null, undefined, {}, [], true, 2 ** 60]
    for (const b of basura) {
      for (const c of [
        { tipo: 'Construir', tipoEdificio: 'caja-envio', x: b, y: 0 },
        { tipo: 'Construir', tipoEdificio: 'caja-envio', x: 0, y: b },
        { tipo: 'Construir', tipoEdificio: b, x: 0, y: 0 },
      ] as unknown as Comando[]) {
        const r = aplicarComando(lim, c)
        expect(r.ok).toBe(false)
        expect(r.estado).toBe(lim)
        // Una cadena rara como tipo es un tipo desconocido; el resto, parámetro inválido.
        const tipoCadena =
          typeof c.tipo === 'string' &&
          (c as { tipoEdificio?: unknown }).tipoEdificio === b &&
          typeof b === 'string'
        expect(r).toMatchObject({ error: tipoCadena ? 'tipo-desconocido' : 'parametro-invalido' })
      }
    }
    expect(() => aplicarComando(lim, { tipo: 'Construir' } as unknown as Comando)).not.toThrow()
    expect(aplicarComando(lim, { tipo: 'Construir' } as unknown as Comando)).toMatchObject({
      error: 'parametro-invalido',
    })
  })

  it('estado corrupto: estado-invalido sin lanzar', () => {
    const malos = [
      { ...lim, edificios: undefined },
      { ...lim, materiales: undefined },
      { ...lim, zonas: undefined },
      { ...lim, siguienteIdEdificio: NaN },
    ] as unknown as EstadoJuego[]
    for (const e of malos) {
      const r = construir(e, 'caja-envio', VIV.x, VIV.y)
      expect(r).toMatchObject({ ok: false, error: 'estado-invalido' })
      expect(r.estado).toBe(e)
    }
  })

  it('no cambia nada salvo dinero, materiales, edificios e id', () => {
    const r = ok(lim, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: ALM.x, y: ALM.y })
    expect({ ...r, dinero: 0, materiales: 0, edificios: 0, siguienteIdEdificio: 0 }).toEqual({
      ...lim,
      dinero: 0,
      materiales: 0,
      edificios: 0,
      siguienteIdEdificio: 0,
    })
    expect(r.valle).toBe(lim.valle)
    expect(r.zonas).toBe(lim.zonas)
  })

  it('es determinista y sobrevive a JSON ida y vuelta', () => {
    const a = ok(lim, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: ALM.x, y: ALM.y })
    const b = ok(lim, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: ALM.x, y: ALM.y })
    expect(a).toEqual(b)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })
})

describe('edificios y obras bloquean el paso', () => {
  const e = ok(lim, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: ALM.x, y: ALM.y })

  it('mapaTransitabilidad bloquea la huella y la caché distingue listas de edificios', () => {
    const antes = mapaTransitabilidad(lim)
    expect(casillaBloqueada(antes, ALM.x, ALM.y)).toBe(false)
    const despues = mapaTransitabilidad(e)
    expect(despues).not.toBe(antes)
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 3; x++) expect(casillaBloqueada(despues, ALM.x + x, ALM.y + y)).toBe(true)
    expect(casillaBloqueada(despues, ALM.x + 3, ALM.y)).toBe(false)
    expect(casillaBloqueada(despues, ALM.x, ALM.y + 2)).toBe(false)
    // La caché sigue funcionando para la misma lista, y el mapa viejo no se ha contaminado.
    expect(mapaTransitabilidad(e)).toBe(despues)
    expect(mapaTransitabilidad(lim)).toBe(antes)
    expect(casillaBloqueada(mapaTransitabilidad(lim), ALM.x, ALM.y)).toBe(false)
    // Una obra terminada (lista nueva) sigue bloqueando.
    const t = { ...e, edificios: e.edificios.map((b) => ({ ...b, obra: null })) }
    expect(casillaBloqueada(mapaTransitabilidad(t), ALM.x, ALM.y)).toBe(true)
  })

  it('moverPersonaje no atraviesa un edificio', () => {
    const y = ALM.y + 0.5
    const inicio: Personaje = { x: ALM.x - 2.5, y, orientacion: 'este' }
    const a = moverPersonaje(e, inicio, 1, 0, 250, { ...CONFIG_PERSONAJE, maxMsPorComando: 250 })
    let p = inicio
    for (let i = 0; i < 40; i++) p = moverPersonaje(e, p, 1, 0, 250)
    expect(a.x).toBeGreaterThan(inicio.x)
    expect(p.x + CONFIG_PERSONAJE.tamanoCaja / 2).toBeLessThanOrEqual(ALM.x)
    // Y sin el edificio sí cruza esa casilla.
    let q = inicio
    for (let i = 0; i < 40; i++) q = moverPersonaje(lim, q, 1, 0, 250)
    expect(q.x).toBeGreaterThan(ALM.x + 3)
  })

  it('buscarCamino rodea los edificios y nunca pisa su huella', () => {
    const desde = { x: ALM.x - 1.5, y: ALM.y + 0.5 }
    const hasta = { x: ALM.x + 4.5, y: ALM.y + 0.5 }
    const ruta = buscarCamino(e, desde, hasta)
    expect(ruta.length).toBeGreaterThan(5)
    for (const p of ruta) {
      const cx = Math.floor(p.x)
      const cy = Math.floor(p.y)
      const dentro = cx >= ALM.x && cx < ALM.x + 3 && cy >= ALM.y && cy < ALM.y + 2
      expect(dentro).toBe(false)
    }
    const fin = ruta.at(-1) as { x: number; y: number }
    expect(Math.floor(fin.x)).toBe(ALM.x + 4)
    // Destino dentro del edificio: acaba en una casilla libre.
    const alDentro = buscarCamino(e, desde, { x: ALM.x + 1.5, y: ALM.y + 0.5 })
    const f = alDentro.at(-1) as { x: number; y: number }
    expect(casillaBloqueada(mapaTransitabilidad(e), Math.floor(f.x), Math.floor(f.y))).toBe(false)
  })
})

describe('zonas y edificios (gancho casillaConEdificio)', () => {
  const e = ok(lim, { tipo: 'Construir', tipoEdificio: 'cobertizo', x: ALM.x, y: ALM.y })

  it('casillaConEdificio refleja la huella y tolera coordenadas raras', () => {
    expect(casillaConEdificio(e, ALM.x, ALM.y)).toBe(true)
    expect(casillaConEdificio(e, ALM.x + 2, ALM.y + 1)).toBe(true)
    expect(casillaConEdificio(e, ALM.x + 3, ALM.y)).toBe(false)
    expect(casillaConEdificio(e, ALM.x, ALM.y + 2)).toBe(false)
    expect(casillaConEdificio(lim, ALM.x, ALM.y)).toBe(false)
    for (const n of [-1, LADO, 0.5, NaN]) expect(casillaConEdificio(e, n, 0)).toBe(false)
  })

  it('PintarZona no cambia casillas bajo una obra y sí las de alrededor', () => {
    const r = aplicarComando(e, {
      tipo: 'PintarZona',
      x0: ALM.x - 1,
      y0: ALM.y - 1,
      x1: ALM.x + 3,
      y1: ALM.y + 2,
      zona: 'cultivo',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (let y = ALM.y; y < ALM.y + 2; y++)
      for (let x = ALM.x; x < ALM.x + 3; x++) expect(zonaEn(r.estado, x, y)).toBe('almacen')
    expect(zonaEn(r.estado, ALM.x - 1, ALM.y - 1)).toBe('cultivo')
    expect(zonaEn(r.estado, ALM.x + 3, ALM.y)).toBe('cultivo')
    // 5×4 = 20 casillas del rectángulo menos 6 de la huella.
    expect(r.eventos).toEqual([{ tipo: 'zonas-cambiadas', casillas: 14 }])
  })

  it('pintar solo bajo la obra se rechaza: sin-casillas-validas, mismo estado', () => {
    const r = aplicarComando(e, {
      tipo: 'PintarZona',
      x0: ALM.x,
      y0: ALM.y,
      x1: ALM.x + 2,
      y1: ALM.y + 1,
      zona: 'cultivo',
    })
    expect(r).toMatchObject({ ok: false, error: 'sin-casillas-validas' })
    expect(r.estado).toBe(e)
  })

  it('BorrarZona no borra bajo un edificio terminado y sí el resto', () => {
    const t = { ...e, edificios: e.edificios.map((b) => ({ ...b, obra: null })) }
    const r = aplicarComando(t, {
      tipo: 'BorrarZona',
      x0: ALM.x - 1,
      y0: ALM.y,
      x1: ALM.x + 3,
      y1: ALM.y,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(zonaEn(r.estado, ALM.x, ALM.y)).toBe('almacen')
    expect(zonaEn(r.estado, ALM.x + 2, ALM.y)).toBe('almacen')
    expect(zonaEn(r.estado, ALM.x - 1, ALM.y)).toBeUndefined()
    expect(zonaEn(r.estado, ALM.x + 3, ALM.y)).toBeUndefined()
    const solo = aplicarComando(t, {
      tipo: 'BorrarZona',
      x0: ALM.x,
      y0: ALM.y,
      x1: ALM.x + 2,
      y1: ALM.y + 1,
    })
    expect(solo).toMatchObject({ ok: false, error: 'sin-casillas-validas' })
  })

  it('zonas corrupta o edificios ausentes: estado-invalido', () => {
    for (const malo of [
      { ...lim, zonas: '.'.repeat(10) },
      { ...lim, edificios: undefined } as unknown as EstadoJuego,
    ]) {
      const r = aplicarComando(malo, {
        tipo: 'PintarZona',
        x0: 0,
        y0: 0,
        x1: 3,
        y1: 3,
        zona: 'cultivo',
      })
      expect(r).toMatchObject({ ok: false, error: 'estado-invalido' })
      expect(r.estado).toBe(malo)
    }
  })
})
