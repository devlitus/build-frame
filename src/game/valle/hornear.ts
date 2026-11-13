import type Phaser from 'phaser'
import { rejillaTrozos, type Trozo } from './trozos'

/**
 * Vuelca el terreno y la decoración a `RenderTexture` por trozos de tamaño fijo: en WebGL
 * un `Graphics` vivo se reprocesa en cada fotograma, una textura no. Para cada trozo,
 * `pintar` estampa lo que cae en su región entre `beginDraw` y `endDraw`. Los trozos van en
 * posiciones enteras y se tocan sin hueco.
 */
export function hornearCapaBase(
  escena: Phaser.Scene,
  mundoPx: number,
  pintar: (rt: Phaser.GameObjects.RenderTexture, trozo: Trozo) => void,
): Phaser.GameObjects.RenderTexture[] {
  return rejillaTrozos(mundoPx).map((t) => {
    const rt = escena.add.renderTexture(t.x, t.y, t.ancho, t.alto).setOrigin(0, 0).setDepth(0)
    rt.beginDraw()
    pintar(rt, t)
    rt.endDraw()
    return rt
  })
}
