import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { TIPOS_EDIFICIO, ZONAS, defEdificio, type Decoracion } from '../../src/core'
import {
  MARCO_EDIFICIO,
  claveEdificio,
  estadoDeEdificio,
  rutaTiraZona,
} from '../../src/game/valle/arte'
import { TAM_CASILLA } from '../../src/game/valle/estilo'
import {
  escalaDecoracion,
  ordenarDecoracion,
  rectDecoracion,
} from '../../src/game/valle/terrenoArte'
import { bordesDeCasilla, zonaDeCasilla } from '../../src/game/valle/tramosZonas'
import { CARACTER_ZONA, CARACTER_SIN_ZONA } from '../../src/core'

describe('estado visual de un edificio', () => {
  it('terminado sin obra', () => {
    expect(estadoDeEdificio(null, 10)).toBe('terminado')
  })

  it('una obra de varios días empieza en cimientos y sigue con el andamio', () => {
    const obra = { diaInicio: 5, diaFin: 8 }
    expect(estadoDeEdificio(obra, 5)).toBe('cimientos')
    expect(estadoDeEdificio(obra, 6)).toBe('obra')
    expect(estadoDeEdificio(obra, 7)).toBe('obra')
  })

  it('una obra de un día es siempre andamio', () => {
    expect(estadoDeEdificio({ diaInicio: 5, diaFin: 6 }, 5)).toBe('obra')
  })

  it('la caja no tiene cimientos: usa la obra', () => {
    expect(claveEdificio('caja-envio', 'cimientos')).toBe('caja-obra')
    expect(claveEdificio('casa', 'cimientos')).toBe('casa-cimientos')
    expect(claveEdificio('cobertizo', 'terminado')).toBe('cobertizo-terminado')
  })
})

describe('arte de los edificios', () => {
  it.each(TIPOS_EDIFICIO)('el marco de %s sobresale de su huella y la cubre entera', (tipo) => {
    const m = MARCO_EDIFICIO[tipo]
    const def = defEdificio(tipo)
    expect(def).toBeDefined()
    // El sprite empieza `izquierda`/`arriba` px antes de la huella y debe cubrir su ancho y su alto.
    expect(m.ancho).toBeGreaterThanOrEqual(m.izquierda + (def?.ancho ?? 0) * TAM_CASILLA)
    expect(m.alto).toBeGreaterThanOrEqual(m.arriba + (def?.alto ?? 0) * TAM_CASILLA)
  })

  it('todos los archivos de arte existen a @1x y @2x', () => {
    const archivos = [
      ...ZONAS.flatMap((z) => [rutaTiraZona(z, '@1x'), rutaTiraZona(z, '@2x')]),
      ...['casa', 'cobertizo'].flatMap((n) =>
        ['terminado', 'obra', 'cimientos'].flatMap((e) =>
          ['@1x', '@2x'].map((s) => `assets/edificios/${n}-${e}${s}.webp`),
        ),
      ),
    ]
    for (const a of archivos) expect(existsSync(`public/${a}`), a).toBe(true)
  })

  it.each(['1x', '2x'])('el atlas del protagonista @%s es coherente con su imagen', (e) => {
    const atlas = JSON.parse(
      readFileSync(`public/assets/protagonista/protagonista@${e}.json`, 'utf8'),
    ) as { frames: Record<string, { frame: { w: number; h: number } }> }
    const k = e === '2x' ? 2 : 1
    for (const f of Object.values(atlas.frames)) {
      expect(f.frame.w).toBe(48 * k)
      expect(f.frame.h).toBe(64 * k)
    }
  })
})

describe('decoración con arte', () => {
  const arbol = (x: number, y: number, variante = 0.5): Decoracion => ({
    tipo: 'arbol',
    x,
    y,
    variante,
  })

  it('el árbol se apoya en la base de su casilla, centrado, y sobresale hacia arriba', () => {
    const r = rectDecoracion(arbol(10, 20, 0.5))
    const k = escalaDecoracion(0.5)
    expect(r.y1).toBe(21 * TAM_CASILLA)
    expect((r.x0 + r.x1) / 2).toBe(10 * TAM_CASILLA + TAM_CASILLA / 2)
    expect(r.y1 - r.y0).toBeCloseTo(96 * k, 9)
    expect(r.x1 - r.x0).toBeCloseTo(64 * k, 9)
  })

  it('la variante cambia el tamaño dentro de un rango estrecho', () => {
    expect(escalaDecoracion(0)).toBeCloseTo(0.9)
    expect(escalaDecoracion(1)).toBeCloseTo(1.1)
    expect(escalaDecoracion(-5)).toBeCloseTo(0.9)
    expect(escalaDecoracion(9)).toBeCloseTo(1.1)
  })

  it('se ordena de atrás adelante (fila de la base y luego columna) sin mutar la lista', () => {
    const lista = [arbol(5, 9), arbol(3, 2), arbol(1, 9), arbol(7, 2)]
    expect(ordenarDecoracion(lista).map((d) => `${d.x},${d.y}`)).toEqual([
      '3,2',
      '7,2',
      '1,9',
      '5,9',
    ])
    expect(lista[0]?.x).toBe(5)
  })
})

describe('bordes de las zonas', () => {
  const lado = 4
  const C = CARACTER_ZONA
  const N = CARACTER_SIN_ZONA
  // Filas: cultivo cultivo . huerto / cultivo cultivo . . / . . . . / . . . .
  const zonas = [
    C.cultivo + C.cultivo + N + C.huerto,
    C.cultivo + C.cultivo + N + N,
    N + N + N + N,
    N + N + N + N,
  ].join('')

  it('zonaDeCasilla devuelve la zona o undefined (también fuera del valle)', () => {
    expect(zonaDeCasilla(zonas, lado, 0, 0)).toBe('cultivo')
    expect(zonaDeCasilla(zonas, lado, 3, 0)).toBe('huerto')
    expect(zonaDeCasilla(zonas, lado, 2, 0)).toBeUndefined()
    expect(zonaDeCasilla(zonas, lado, -1, 0)).toBeUndefined()
    expect(zonaDeCasilla(zonas, lado, 0, 4)).toBeUndefined()
  })

  it('el borde solo aparece en los lados cuya vecina no es de la misma zona', () => {
    expect(bordesDeCasilla(zonas, lado, 0, 0, 'cultivo')).toEqual({
      arriba: true,
      izquierda: true,
      derecha: false,
      abajo: false,
    })
    expect(bordesDeCasilla(zonas, lado, 1, 1, 'cultivo')).toEqual({
      arriba: false,
      izquierda: false,
      derecha: true,
      abajo: true,
    })
  })

  it('una casilla aislada tiene borde en los cuatro lados y una vecina de otra zona también cuenta', () => {
    expect(bordesDeCasilla(zonas, lado, 3, 0, 'huerto')).toEqual({
      arriba: true,
      derecha: true,
      abajo: true,
      izquierda: true,
    })
    // La casilla de cultivo (1, 0) linda con una sin zona por la derecha.
    expect(bordesDeCasilla(zonas, lado, 1, 0, 'cultivo').derecha).toBe(true)
  })
})
