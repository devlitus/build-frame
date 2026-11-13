import { render } from 'preact'
import { useState } from 'preact/hooks'
import {
  arrancaDirecto,
  crearJuego,
  depuracionActiva,
  iniciarPartida,
  partidaActual,
} from './game/juego'
import { t, tp } from './ui/textos'
import { Hud } from './ui/Hud'
import { Portada } from './ui/Portada'
import './estilos.css'

const juego = document.getElementById('juego')
const ui = document.getElementById('ui')
if (!juego || !ui) throw new Error('Faltan los contenedores #juego o #ui')

juego.setAttribute('role', 'application')
juego.setAttribute('aria-label', t('lienzoValle'))
juego.tabIndex = -1
crearJuego(juego, {
  cartelObra: (dias) => tp(dias === 1 ? 'cartelDia' : 'cartelDias', { n: dias }),
})

function App() {
  const [jugando, setJugando] = useState(arrancaDirecto())
  const partida = partidaActual()
  if (jugando && partida) return <Hud partida={partida} debug={depuracionActiva()} />
  return (
    <Portada
      version={__VERSION__}
      alJugar={() => {
        iniciarPartida()
        setJugando(true)
      }}
    />
  )
}

render(<App />, ui)
