// Local e2e runner. Batches:
//   functional   projects escritorio + movil, parallel (the default)
//   performance  @rendimiento tests, one worker, alone (--rendimiento)
// Prints a summary and exits with the combined code (0 only if every batch that ran passes).
//   node scripts/e2e.mjs [playwright args...]    functional only
//   node scripts/e2e.mjs --rendimiento           performance only
//   node scripts/e2e.mjs --completo              functional and then, ALWAYS, performance
//   node scripts/e2e.mjs --capturas              only the @capturas tests (write PNGs to capturas/)
// Expects dist/ to be built (npm run e2e does it). Extra args are passed to both batches.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const capturas = args.includes('--capturas')
const rendimiento = args.includes('--rendimiento')
const completo = args.includes('--completo')
const extra = args.filter((a) => !['--capturas', '--rendimiento', '--completo'].includes(a))
mkdirSync('test-results', { recursive: true })

function run(name, projects, pwArgs, env = {}) {
  const report = resolve(`test-results/e2e-${name}.json`)
  const res = spawnSync(
    'npx',
    [
      'playwright',
      'test',
      ...projects.map((p) => `--project=${p}`),
      '--reporter=list,json',
      ...pwArgs,
      ...extra,
    ],
    {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: report },
    },
  )
  return { name, code: res.status ?? 1, stats: readStats(report) }
}

function readStats(file) {
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8')).stats
  } catch {
    return undefined
  }
}

const results = []
if (capturas) {
  results.push(
    run('capturas', ['escritorio', 'movil'], ['--grep=@capturas'], { E2E_CAPTURAS: '1' }),
  )
} else {
  if (!rendimiento) results.push(run('funcional', ['escritorio', 'movil'], []))
  // With --completo it always runs, even if the functional batch failed. Alone and with a single
  // worker: fps and real-time thresholds depend on nothing else loading the machine.
  if (rendimiento || completo) {
    results.push(
      run('rendimiento', ['rendimiento-escritorio', 'rendimiento-movil'], ['--workers=1']),
    )
  }
}

let exit = 0
console.log('\n=== e2e summary ===')
for (const { name, code, stats } of results) {
  const total = stats ? stats.expected + stats.unexpected + stats.flaky + stats.skipped : 0
  // An empty batch (a filter leaves nothing in it) is not a failure.
  const ok = code === 0 || (stats !== undefined && total === 0)
  if (!ok) exit = 1
  const line = stats
    ? `${stats.expected} passed, ${stats.unexpected} failed, ${stats.flaky} flaky, ${stats.skipped} skipped, ${(stats.duration / 1000).toFixed(1)} s`
    : 'no report'
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(12)} ${line}`)
}
process.exit(exit)
