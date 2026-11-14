import * as v from 'valibot'
import datos from '../../../data/energia.json'
import { EsquemaConfigEnergia, type ConfigEnergia } from './esquemas'

/** Energía (máximo, desmayo y costes por herramienta), validada al cargar el módulo. */
export const CONFIG_ENERGIA: ConfigEnergia = v.parse(EsquemaConfigEnergia, datos)
