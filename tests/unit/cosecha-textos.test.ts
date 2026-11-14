import { describe, expect, it } from 'vitest'
import textos from '../../src/ui/textos/es.json'

describe('textos de cosechar', () => {
  it('el rechazo por inventario lleno y el aviso de cosecha tienen texto', () => {
    expect(textos['errorHerramienta_inventario-lleno']).toBeTruthy()
    expect(textos.avisoCosecha).toContain('{producto}')
  })
})
