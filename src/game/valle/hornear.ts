import type Phaser from 'phaser'
import type { Region } from './dibujar'
import { rejillaTrozos } from './trozos'

/**
 * Vuelca el terreno y la decoración a `RenderTexture` por trozos de tamaño fijo: en WebGL
 * un `Graphics` vivo se reprocesa en cada fotograma, una textura no. Para cada trozo,
 * `dibujar` crea `Graphics` temporales solo con lo que cae en su región; aquí se vuelcan
 * y se destruyen. Los trozos van en posiciones enteras y se tocan sin hueco.
 */
export function hornearCapaBase(
  escena: Phaser.Scene,
  mundoPx: number,
  dibujar: (region: Region) => readonly Phaser.GameObjects.Graphics[],
): Phaser.GameObjects.RenderTexture[] {
  return rejillaTrozos(mundoPx).map((t) => {
    const rt = escena.add.renderTexture(t.x, t.y, t.ancho, t.alto).setOrigin(0, 0).setDepth(0)
    const temporales = dibujar(t)
    rt.beginDraw()
    for (const g of temporales) rt.batchDraw(g, -t.x, -t.y)
    rt.endDraw()
    for (const g of temporales) g.destroy()
    return rt
  })
}
