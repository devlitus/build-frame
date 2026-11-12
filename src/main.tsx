import { render } from 'preact'
import { useState } from 'preact/hooks'
import { arrancaDirecto, crearJuego, iniciarPartida, partidaActual } from './game/juego'
import { t } from './ui/textos'
import { Hud } from './ui/Hud'
import { Portada } from './ui/Portada'
import './estilos.css'

const juego = document.getElementById('juego')
const ui = document.getElementById('ui')
if (!juego || !ui) throw new Error('Faltan los contenedores #juego o #ui')

juego.setAttribute('role', 'application')
juego.setAttribute('aria-label', t('lienzoValle'))
juego.tabIndex = -1
crearJuego(juego)

function App() {
  const [jugando, setJugando] = useState(arrancaDirecto())
  const partida = partidaActual()
  if (jugando && partida) return <Hud partida={partida} />
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
