import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Regla de arquitectura (ADR 0004): el núcleo no depende del motor, la UI ni el navegador.
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'core/ no puede importar Phaser.' },
            { group: ['preact', 'preact/*'], message: 'core/ no puede importar la UI.' },
            { group: ['idb', 'idb/*'], message: 'core/ no puede depender del almacenamiento.' },
            {
              group: ['**/game/**', '**/ui/**', '**/save/**'],
              message: 'core/ no puede importar capas superiores.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Usa el RNG determinista del núcleo (core/rng.ts).',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message: 'El núcleo no lee la hora real; el tiempo es un dato del estado.',
        },
        'window',
        'document',
        'localStorage',
        'indexedDB',
      ],
    },
  },
  {
    // El puntero llega en píxeles CSS y se convierte con `mundoDePantalla` (resolucion.ts, issue #11).
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['worldX', 'worldY', 'positionToCamera', 'setInteractive'].map((property) => ({
          property,
          message: 'Usa mundoDePantalla (resolucion.ts); ver el aviso de la cabecera.',
        })),
      ],
    },
  },
  {
    // E2E: avoid fixed sleeps; wait for conditions with the helpers in tests/e2e/apoyo/.
    // "warn" while the legacy specs are migrated (E2E-05..07).
    files: ['tests/e2e/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'warn',
        {
          object: 'page',
          property: 'waitForTimeout',
          message:
            'Wait for a condition (poll, waitFrames, unchanged). A real wait goes in tests/e2e/apoyo/ with `// real-wait: <reason>`.',
        },
      ],
    },
  },
  {
    files: ['tests/e2e/apoyo/**/*.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  prettier,
)
