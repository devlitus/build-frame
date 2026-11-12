/* eslint-disable @typescript-eslint/no-non-null-assertion -- índices con noUncheckedIndexedAccess */
import { describe, expect, it } from 'vitest'
import {
  buscarCamino,
  casillaBloqueada,
  crearEstadoInicial,
  mapaTransitabilidad,
} from '../../src/core'

const estado = crearEstadoInicial({ semilla: 42, dineroInicial: 0 })
const mapa = mapaTransitabilidad(estado)

/** Una casilla transitable determinista a partir de un desplazamiento. */
function libre(desplazamiento: number): { x: number; y: number } {
  const total = mapa.lado * mapa.lado
  for (let i = 0; i < total; i++) {
    const c = (i + desplazamiento * 97) % total
    if (mapa.bloqueada[c] === 0)
      return { x: (c % mapa.lado) + 0.5, y: Math.floor(c / mapa.lado) + 0.5 }
  }
  throw new Error('sin casillas libres')
}

describe('buscarCamino', () => {
  it('un destino en la misma casilla da un solo punto, su centro', () => {
    const p = estado.personaje
    const r = buscarCamino(estado, p, p)
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 })
  })

  it('llega a un destino transitable lejano con pasos contiguos y casillas libres', () => {
    const a = estado.personaje
    const b = libre(50)
    const r = buscarCamino(estado, a, b)
    expect(r.length).toBeGreaterThan(1)
    expect(r[r.length - 1]).toEqual({ x: Math.floor(b.x) + 0.5, y: Math.floor(b.y) + 0.5 })
    for (let i = 0; i < r.length; i++) {
      const q = r[i]!
      expect(casillaBloqueada(mapa, Math.floor(q.x), Math.floor(q.y))).toBe(false)
      if (i === 0) continue
      const dx = Math.abs(q.x - r[i - 1]!.x)
      const dy = Math.abs(q.y - r[i - 1]!.y)
      expect(Math.max(dx, dy)).toBe(1)
      if (dx === 1 && dy === 1) {
        // Sin cortar esquinas.
        const ox = Math.floor(r[i - 1]!.x)
        const oy = Math.floor(r[i - 1]!.y)
        const sx = Math.floor(q.x) - ox
        const sy = Math.floor(q.y) - oy
        expect(casillaBloqueada(mapa, ox + sx, oy)).toBe(false)
        expect(casillaBloqueada(mapa, ox, oy + sy)).toBe(false)
      }
    }
  })

  it('si el destino está bloqueado va a la casilla libre más cercana', () => {
    const lado = mapa.lado
    const bloq = mapa.bloqueada.findIndex((v) => v === 1)
    const x = bloq % lado
    const y = Math.floor(bloq / lado)
    const r = buscarCamino(estado, estado.personaje, { x: x + 0.5, y: y + 0.5 })
    const fin = r[r.length - 1]!
    const d = Math.hypot(fin.x - (x + 0.5), fin.y - (y + 0.5))
    // Ninguna casilla libre está más cerca que la elegida.
    for (let c = 0; c < lado * lado; c++) {
      if (mapa.bloqueada[c] === 1) continue
      const dc = Math.hypot((c % lado) - x, Math.floor(c / lado) - y)
      expect(dc).toBeGreaterThanOrEqual(d - 1e-9)
    }
  })

  it('un destino fuera del valle se recorta al borde transitable más cercano', () => {
    const r = buscarCamino(estado, estado.personaje, { x: -50, y: -50 })
    const fin = r[r.length - 1]!
    expect(casillaBloqueada(mapa, Math.floor(fin.x), Math.floor(fin.y))).toBe(false)
  })

  it('cruza el río por un vado', () => {
    const lado = mapa.lado
    const v = estado.cauce.vados[0]!
    const vx = v % lado
    const vy = Math.floor(v / lado)
    const r = buscarCamino(estado, estado.personaje, { x: vx + 0.5, y: vy + 0.5 })
    expect(r.length).toBeGreaterThan(0)
    expect(r[r.length - 1]).toEqual({ x: vx + 0.5, y: vy + 0.5 })
  })

  it('es determinista', () => {
    const b = libre(7)
    expect(buscarCamino(estado, estado.personaje, b)).toEqual(
      buscarCamino(estado, estado.personaje, b),
    )
  })

  it('coordenadas no finitas dan un camino vacío', () => {
    expect(buscarCamino(estado, estado.personaje, { x: NaN, y: 0 })).toEqual([])
  })

  it('con toques descentrados elige la casilla libre de centro más cercano (fuerza bruta)', () => {
    const lado = mapa.lado
    const libres: number[] = []
    for (let c = 0; c < lado * lado; c++) if (mapa.bloqueada[c] === 0) libres.push(c)
    const desv = [0.01, 0.1, 0.5, 0.9, 0.99]
    let n = 0
    for (let c = 0; c < lado * lado; c += 11) {
      if (mapa.bloqueada[c] === 0) continue
      for (const dx of desv) {
        for (const dy of [0.1, 0.9]) {
          const x = (c % lado) + dx
          const y = Math.floor(c / lado) + dy
          const r = buscarCamino(estado, estado.personaje, { x, y })
          const fin = r[r.length - 1]!
          const d = Math.hypot(fin.x - x, fin.y - y)
          const mejor = Math.min(
            ...libres.map((l) => Math.hypot((l % lado) + 0.5 - x, Math.floor(l / lado) + 0.5 - y)),
          )
          expect(d).toBeLessThanOrEqual(mejor + 1e-9)
          n++
        }
      }
    }
    expect(n).toBeGreaterThan(100)
  })

  it('un destino libre encerrado entre obstáculos da un camino que acaba junto a él', () => {
    const p = libre(30)
    const cx = Math.floor(p.x)
    const cy = Math.floor(p.y)
    const muros = []
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        muros.push({ x: cx + dx, y: cy + dy, tipo: 'roca' as const, variante: 0 })
      }
    const cerrado = { ...estado, obstaculos: [...estado.obstaculos, ...muros] }
    const r = buscarCamino(cerrado, estado.personaje, p)
    expect(r.length).toBeGreaterThan(0)
    const m = mapaTransitabilidad(cerrado)
    const fin = r[r.length - 1]!
    expect(casillaBloqueada(m, Math.floor(fin.x), Math.floor(fin.y))).toBe(false)
    expect(Math.hypot(fin.x - p.x, fin.y - p.y)).toBeLessThan(4)
  })
})
