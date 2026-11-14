import type Phaser from 'phaser'
import type { EventoJuego } from '../../core'
import { claveCasilla } from '../../core'
import type { CapaObjetos } from './capaObjetos'

/*
 * Efectos provisionales (hasta el arte final) de talar y picar: sacudida del árbol o la roca al
 * golpearlos, y caída del árbol o roca rota al quitarlos, con un poco de polvo. Solo consumen los
 * eventos del núcleo (`obstaculo-golpeado`, `obstaculo-quitado`); no tocan el estado. Con
 * `prefers-reduced-motion` no hay movimiento: un destello de color al golpear y un fundido al caer.
 * El equivalente accesible (texto en la región de avisos) lo da `src/ui/Aviso.tsx`.
 */

/** Casilla en px (coincide con la del terreno). */
const T = 32
const MS_SACUDIDA = 90
const MS_CAIDA = 380
const MS_POLVO = 420
const MS_DESTELLO = 140

/** ¿Pide el usuario menos movimiento? */
export function movimientoReducido(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Polvo: unas motas que suben y se desvanecen (nada con movimiento reducido). */
function polvo(escena: Phaser.Scene, x: number, y: number, n: number, color: number): void {
  for (let i = 0; i < n; i++) {
    const dx = (i - (n - 1) / 2) * 7
    const mota = escena.add.circle(x + dx, y - 4, 3, color, 0.8).setDepth(y + 1)
    escena.tweens.add({
      targets: mota,
      x: x + dx * 1.8,
      y: y - 16 - (i % 2) * 6,
      alpha: 0,
      duration: MS_POLVO,
      onComplete: () => mota.destroy(),
    })
  }
}

/**
 * Anima los eventos de talar y picar de un cambio de la partida. Debe llamarse ANTES de rehacer la
 * capa de objetos, porque la caída copia la imagen que se va a quitar.
 */
export function animarObstaculos(
  escena: Phaser.Scene,
  capa: CapaObjetos | undefined,
  eventos: readonly EventoJuego[],
  lado: number,
): void {
  if (!capa) return
  const reducido = movimientoReducido()
  for (const ev of eventos) {
    if (ev.tipo !== 'obstaculo-golpeado' && ev.tipo !== 'obstaculo-quitado') continue
    const img = capa.imagen(claveCasilla(lado, ev.x, ev.y))
    const bx = ev.x * T + T / 2
    const by = (ev.y + 1) * T
    const color = ev.obstaculo === 'roca' ? 0xb8b2a6 : 0xd9c9a3
    if (ev.tipo === 'obstaculo-golpeado') {
      if (!img) continue
      escena.tweens.killTweensOf(img)
      if (reducido) {
        img.setTint(0xffe9a8)
        escena.time.delayedCall(MS_DESTELLO, () => {
          if (img.active) img.clearTint()
        })
        continue
      }
      img.setAngle(0)
      escena.tweens.add({
        targets: img,
        angle: { from: -5, to: 5 },
        duration: MS_SACUDIDA,
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          if (img.active) img.setAngle(0)
        },
      })
      polvo(escena, bx, by, 2, color)
      continue
    }
    // Quitado: la imagen real desaparece al rehacer la capa; una copia hace la caída.
    if (!img) continue
    const copia = escena.add
      .image(img.x, img.y, img.texture.key, img.frame.name)
      .setOrigin(0.5, 1)
      .setScale(img.scaleX, img.scaleY)
      .setDepth(img.depth)
    if (reducido) {
      escena.tweens.add({
        targets: copia,
        alpha: 0,
        duration: MS_DESTELLO * 2,
        onComplete: () => copia.destroy(),
      })
      continue
    }
    const arbol = ev.obstaculo !== 'roca'
    escena.tweens.add({
      targets: copia,
      angle: arbol ? 80 : 0,
      scaleY: arbol ? copia.scaleY : copia.scaleY * 0.2,
      y: arbol ? copia.y + 4 : copia.y,
      alpha: 0,
      duration: MS_CAIDA,
      ease: 'Quad.easeIn',
      onComplete: () => copia.destroy(),
    })
    polvo(escena, bx, by, 4, color)
  }
}
