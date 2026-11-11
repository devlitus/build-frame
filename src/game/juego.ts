import Phaser from 'phaser'
import { EscenaPortada } from './scenes/EscenaPortada'
import { EscenaValle, type DatosEscenaValle } from './scenes/EscenaValle'
import { leerParametros, semillaNueva } from './parametros'

let juego: Phaser.Game | undefined
let semillaActual: number | undefined

/** Datos de la partida según la URL (sin efectos); sin `?semilla` se genera una nueva con `crypto`. */
function datosPartida(): DatosEscenaValle {
  const p = leerParametros(window.location.search)
  return { semilla: p.semilla ?? semillaNueva(), propias: p.propias }
}

/** Con `?semilla=N` en la URL se salta la portada y se abre el valle directamente. */
export function arrancaDirecto(): boolean {
  return leerParametros(window.location.search).semilla !== undefined
}

export function crearJuego(padre: HTMLElement): Phaser.Game {
  const directo = arrancaDirecto()
  const g = new Phaser.Game({
    type: Phaser.AUTO,
    parent: padre,
    input: { activePointers: 2 }, // ratón + 2 dedos
    backgroundColor: '#3f5d3a',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  })
  juego = g
  g.scene.add('portada', EscenaPortada, !directo)
  if (directo) {
    const datos = datosPartida()
    semillaActual = datos.semilla
    g.scene.add('valle', EscenaValle, true, datos)
  } else g.scene.add('valle', EscenaValle, false)
  // Solo lectura, para los tests e2e.
  window.__raices = {
    escenaActiva: () => g.scene.getScenes(true)[0]?.scene.key,
    semilla: () => semillaActual,
    mundoPx: () => {
      const e = g.scene.getScene('valle')
      return e instanceof EscenaValle && e.estado ? e.mundoPx : undefined
    },
    camara: () => {
      const e = g.scene.getScene('valle')
      if (!(e instanceof EscenaValle) || !e.estado) return undefined
      const c = e.cameras.main
      return {
        zoom: c.zoom,
        scrollX: c.scrollX,
        scrollY: c.scrollY,
        ancho: c.width,
        alto: c.height,
      }
    },
  }
  return g
}

/** Arranca una partida nueva desde la portada: el valle sustituye a la portada. */
export function iniciarPartida(): void {
  if (!juego) throw new Error('El juego no está creado')
  const datos = datosPartida()
  semillaActual = datos.semilla
  juego.scene.stop('portada')
  juego.scene.start('valle', datos)
}
