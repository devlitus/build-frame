import { render } from 'preact'
import { crearJuego } from './game/juego'
import { Portada } from './ui/Portada'
import './estilos.css'

const juego = document.getElementById('juego')
const ui = document.getElementById('ui')
if (!juego || !ui) throw new Error('Faltan los contenedores #juego o #ui')

crearJuego(juego)
render(<Portada version={__VERSION__} />, ui)
