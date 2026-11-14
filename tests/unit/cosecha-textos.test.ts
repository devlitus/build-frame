import { describe, expect, it } from 'vitest'
import { CULTIVOS, CONFIG_CULTIVOS } from '../../src/core'
import textos from '../../src/ui/textos/es.json'

describe('textos de cosechar', () => {
  it('el rechazo por inventario lleno y el aviso de cosecha tienen texto', () => {
    expect(textos['errorHerramienta_inventario-lleno']).toBeTruthy()
    expect(textos.avisoCosecha).toContain('{producto}')
  })

  it('el botón contextual y el producto de cada cultivo tienen texto', () => {
    expect(textos.accionBotonCosechar).toBe('Cosechar')
    for (const c of CULTIVOS) {
      const clave = `objeto_${CONFIG_CULTIVOS.cultivos[c].cosecha.producto}` as keyof typeof textos
      expect(textos[clave], clave).toBeTruthy()
    }
  })
})
