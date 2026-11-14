/**
 * Rompedor · M5-00 ronda 2. `CapaObjetos.contarEn` (el «enVista» del gancho `objetosCapa`) debe contar
 * cada objeto una sola vez y coincidir con los que `actualizar` pone de verdad en la escena.
 */
import { describe, expect, it } from 'vitest'
import { CapaObjetos, type ObjetoProfundo } from '../../src/game/valle/capaObjetos'

function imagenFalsa() {
  const img = {
    texture: { key: '' },
    depth: 0,
    angle: 0,
    alpha: 1,
    tinte: false,
    visible: true,
    destruida: false,
    x: 0,
    y: 0,
    setAngle: (a: number) => {
      img.angle = a
      return img
    },
    setAlpha: (a: number) => {
      img.alpha = a
      return img
    },
    clearTint: () => {
      img.tinte = false
      return img
    },
    setVisible: (v: boolean) => {
      img.visible = v
      return img
    },
    data: new Map<string, unknown>(),
    setOrigin: () => img,
    setTexture: (k: string) => {
      img.texture.key = k
      return img
    },
    setPosition: (x: number, y: number) => {
      img.x = x
      img.y = y
      return img
    },
    setScale: () => img,
    setDepth: (d: number) => {
      img.depth = d
      return img
    },
    setData: (k: string, v: unknown) => {
      img.data.set(k, v)
      return img
    },
    destroy: () => {
      img.destruida = true
    },
  }
  return img
}
type Img = ReturnType<typeof imagenFalsa>
const escenaFalsa = { add: { image: () => imagenFalsa() } } as never
function escenaConLista() {
  const creadas: Img[] = []
  const escena = {
    tweens: { killTweensOf: () => undefined },
    add: {
      image: () => {
        const i = imagenFalsa()
        creadas.push(i)
        return i
      },
    },
  } as never
  return { escena, creadas }
}

function objeto(id: number, x: number, y: number): ObjetoProfundo {
  return {
    id,
    x,
    y,
    profundidad: y,
    textura: 'arbol',
    escala: 1,
    rect: { x0: x - 32, x1: x + 32, y0: y - 96, y1: y },
  }
}

describe('CapaObjetos: el recuento de lo visible', () => {
  it('con la vista más ancha que el valle (zoom mínimo), contarEn no cuenta dos veces los mismos objetos', () => {
    const mundo = 3072
    let sem = 3
    const rnd = () => {
      sem = (sem * 1103515245 + 12345) % 2147483648
      return sem / 2147483648
    }
    const objetos = Array.from({ length: 2000 }, (_, i) =>
      objeto(i, 16 + Math.floor(rnd() * 96) * 32, 32 + Math.floor(rnd() * 96) * 32),
    )
    const capa = new CapaObjetos(escenaFalsa, mundo)
    capa.reemplazar(objetos)
    const vista = { x0: -1200, y0: -1000, x1: mundo + 1200, y1: mundo + 1000 }
    capa.actualizar(vista)
    expect(capa.contarEn(vista)).toBe(capa.cantidad)
  })

  it('en cualquier vista, contarEn coincide con los objetos que actualizar crea', () => {
    const mundo = 3072
    let sem = 11
    const rnd = () => {
      sem = (sem * 1103515245 + 12345) % 2147483648
      return sem / 2147483648
    }
    const objetos = Array.from({ length: 2000 }, (_, i) =>
      objeto(i, 16 + Math.floor(rnd() * 96) * 32, 32 + Math.floor(rnd() * 96) * 32),
    )
    const dif: string[] = []
    for (let i = 0; i < 30; i++) {
      const capa = new CapaObjetos(escenaFalsa, mundo)
      capa.reemplazar(objetos)
      const x0 = -300 + rnd() * mundo
      const y0 = rnd() * mundo
      const vista = { x0, y0, x1: x0 + 400 + rnd() * 3000, y1: y0 + 400 + rnd() * 2000 }
      capa.actualizar(vista)
      if (capa.contarEn(vista) !== capa.cantidad)
        dif.push(
          `${JSON.stringify(vista)}: contarEn ${capa.contarEn(vista)} ≠ cantidad ${capa.cantidad}`,
        )
    }
    expect(dif).toEqual([])
  })
})

describe('CapaObjetos: reutilización tras animar, reemplazar parcial y ids', () => {
  const vistaTodo = { x0: 0, y0: 0, x1: 1024, y1: 1024 }

  it('una imagen animada (ángulo, alfa, tinte, invisible) que sale de la vista vuelve limpia al reutilizarse', () => {
    const { escena, creadas } = escenaConLista()
    const capa = new CapaObjetos(escena, 4096)
    capa.reemplazar([objeto(1, 100, 100), objeto(2, 3000, 3000)])
    capa.actualizar({ x0: 0, y0: 0, x1: 300, y1: 300 })
    const img = capa.imagen(1) as unknown as Img
    img.angle = 37
    img.alpha = 0.2
    img.tinte = true
    img.visible = false
    capa.actualizar({ x0: 2800, y0: 2800, x1: 3200, y1: 3200 })
    expect(capa.imagen(1)).toBeUndefined()
    const nueva = capa.imagen(2) as unknown as Img
    expect(nueva).toBe(img)
    expect([nueva.angle, nueva.alpha, nueva.tinte, nueva.visible, nueva.x, nueva.y]).toEqual([
      0,
      1,
      false,
      true,
      3000,
      3000,
    ])
    expect(creadas).toHaveLength(1)
  })

  it('reemplazar con cambios parciales conserva las imágenes (y su animación) de lo que no cambia', () => {
    const { escena, creadas } = escenaConLista()
    const capa = new CapaObjetos(escena, 4096)
    const a = objeto(1, 100, 100)
    const b = objeto(2, 200, 100)
    const c = objeto(3, 300, 100)
    capa.reemplazar([a, b, c])
    capa.actualizar(vistaTodo)
    const ia = capa.imagen(1) as unknown as Img
    const ib = capa.imagen(2) as unknown as Img
    ia.angle = 15
    ib.angle = 25
    // a igual, b cambia de textura, c desaparece, d nuevo
    capa.reemplazar([a, { ...b, textura: 'tocon' }, objeto(4, 400, 100)])
    capa.actualizar(vistaTodo)
    expect(capa.imagen(1)).toBe(ia)
    expect(ia.angle).toBe(15)
    expect((capa.imagen(2) as unknown as Img).texture.key).toBe('tocon')
    expect((capa.imagen(2) as unknown as Img).angle).toBe(0)
    expect(capa.imagen(3)).toBeUndefined()
    expect(capa.imagen(4)).toBeDefined()
    expect(capa.cantidad).toBe(3)
    // c se reutilizó para d: ni imágenes de más ni destruidas de menos
    expect(creadas.filter((i) => !i.destruida)).toHaveLength(3)
  })

  it('cambiar solo el rect (no x, y ni textura) de un objeto activo no deja la imagen sin objeto', () => {
    const { escena } = escenaConLista()
    const capa = new CapaObjetos(escena, 4096)
    const a = objeto(1, 100, 100)
    capa.reemplazar([a])
    capa.actualizar(vistaTodo)
    capa.reemplazar([{ ...a, rect: { x0: 0, x1: 5000, y0: 0, y1: 5000 } }])
    capa.actualizar(vistaTodo)
    expect(capa.cantidad).toBe(1)
    expect(capa.cantidad).toBeLessThanOrEqual(capa.contarEn(vistaTodo))
  })

  it('reemplazar con el conjunto vacío libera todas y luego se puede repoblar', () => {
    const { escena, creadas } = escenaConLista()
    const capa = new CapaObjetos(escena, 4096)
    capa.reemplazar([objeto(1, 100, 100), objeto(2, 200, 100)])
    capa.actualizar(vistaTodo)
    capa.reemplazar([])
    capa.actualizar(vistaTodo)
    expect(capa.cantidad).toBe(0)
    expect(creadas.every((i) => i.destruida)).toBe(true)
    capa.reemplazar([objeto(1, 100, 100)])
    capa.actualizar(vistaTodo)
    expect(capa.cantidad).toBe(1)
  })

  it('quitar un obstáculo del medio de la lista no mueve las imágenes de los demás (id por casilla)', async () => {
    const { objetosDeDecoracion } = await import('../../src/game/valle/terrenoArte')
    const { escena, creadas } = escenaConLista()
    const lado = 96
    const obs = [
      { tipo: 'arbol', x: 3, y: 4, variante: 0.2 },
      { tipo: 'roca', x: 10, y: 4, variante: 0.5 },
      { tipo: 'arbol', x: 7, y: 9, variante: 0.9 },
    ] as const
    const fake = { textures: { getFrame: () => ({ realWidth: 64 }) } }
    const capa = new CapaObjetos(escena, lado * 32)
    capa.reemplazar(objetosDeDecoracion(fake as never, obs, lado))
    capa.actualizar({ x0: 0, y0: 0, x1: 2000, y1: 2000 })
    const antes = obs.map((o) => capa.imagen(o.y * lado + o.x))
    expect(antes.every(Boolean)).toBe(true)
    capa.reemplazar(objetosDeDecoracion(fake as never, [obs[0], obs[2]], lado))
    capa.actualizar({ x0: 0, y0: 0, x1: 2000, y1: 2000 })
    expect(capa.imagen(obs[0].y * lado + obs[0].x)).toBe(antes[0])
    expect(capa.imagen(obs[2].y * lado + obs[2].x)).toBe(antes[2])
    expect(capa.imagen(obs[1].y * lado + obs[1].x)).toBeUndefined()
    expect(creadas.filter((i) => !i.destruida)).toHaveLength(2)
  })
})
