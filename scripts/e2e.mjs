// Full local e2e run: the functional batch (projects escritorio + movil, parallel) and then, ALWAYS,
// the performance batch (@rendimiento, one worker, alone). Prints a summary of both and exits with
// the combined code (0 only if both pass).
//   node scripts/e2e.mjs [playwright args...]    both batches
//   node scripts/e2e.mjs --capturas              only the @capturas tests (write PNGs to capturas/)
// Expects dist/ to be built (npm run e2e does it). Extra args are passed to both batches.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const capturas = args.includes('--capturas')
const extra = args.filter((a) => a !== '--capturas')
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
  results.push(run('funcional', ['escritorio', 'movil'], []))
  // Always runs, even if the functional batch failed. Alone and with a single worker: fps and
  // real-time thresholds depend on nothing else loading the machine.
  results.push(run('rendimiento', ['rendimiento-escritorio', 'rendimiento-movil'], ['--workers=1']))
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
