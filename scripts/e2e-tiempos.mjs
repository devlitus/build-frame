// Playwright timing report.
//   node scripts/e2e-tiempos.mjs <report.json>        analyses an existing JSON report
//   node scripts/e2e-tiempos.mjs --run [pw args...]   runs playwright (JSON reporter) and analyses it
// Output: wall time, per-project totals, median/p95, slowest 30 per project, % per spec file,
// skipped tests, failures and the probe results (annotation `probe`) if any.
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
let reportPath = resolve('test-results/e2e-report.json')
let exitCode = 0

if (args[0] === '--run') {
  mkdirSync(dirname(reportPath), { recursive: true })
  const res = spawnSync('npx', ['playwright', 'test', '--reporter=json,line', ...args.slice(1)], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath },
  })
  exitCode = res.status ?? 1
} else if (args[0]) {
  reportPath = resolve(args[0])
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'))

/** @type {{file:string,title:string,project:string,ms:number,status:string,probe?:string}[]} */
const rows = []
const skipped = []
const failed = []
function walk(suite) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const ms = t.results.reduce((a, r) => a + r.duration, 0)
      const row = {
        file: spec.file,
        title: spec.title,
        project: t.projectName,
        ms,
        status: t.status,
      }
      const probe = [...t.annotations, ...t.results.flatMap((r) => r.annotations ?? [])].find(
        (a) => a.type === 'probe',
      )
      if (probe) row.probe = probe.description
      if (t.status === 'skipped') skipped.push(row)
      else {
        rows.push(row)
        if (t.status === 'unexpected' || t.status === 'flaky') failed.push(row)
      }
    }
  }
  for (const s of suite.suites ?? []) walk(s)
}
for (const s of report.suites) walk(s)

const sec = (ms) => (ms / 1000).toFixed(1).padStart(7) + ' s'
const pct = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
const total = rows.reduce((a, r) => a + r.ms, 0)
const stats = report.stats ?? {}

console.log('\n=== Playwright timing report ===')
console.log(`Report: ${reportPath}`)
console.log(`Start: ${stats.startTime}`)
console.log(`Real wall time (start to end): ${(stats.duration / 1000).toFixed(1)} s`)
console.log(
  `Tests: ${rows.length} run, ${skipped.length} skipped, ${failed.length} failed or flaky ` +
    `(expected ${stats.expected}, unexpected ${stats.unexpected}, flaky ${stats.flaky})`,
)
console.log(`Sum of test durations: ${(total / 1000).toFixed(1)} s`)

const projects = [...new Set(rows.map((r) => r.project))].sort()
for (const p of projects) {
  const rs = rows.filter((r) => r.project === p)
  const sorted = rs.map((r) => r.ms).sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  console.log(
    `\n--- Project ${p}: ${rs.length} tests, sum ${(sum / 1000).toFixed(1)} s (${((100 * sum) / total).toFixed(1)}% of total)`,
  )
  console.log(
    `    median ${sec(pct(sorted, 50))}   p95 ${sec(pct(sorted, 95))}   max ${sec(sorted.at(-1) ?? 0)}`,
  )
  console.log('    Slowest 30:')
  for (const r of [...rs].sort((a, b) => b.ms - a.ms).slice(0, 30)) {
    console.log(`    ${sec(r.ms)}  ${r.file}  ${r.title}`)
  }
  const byFile = new Map()
  for (const r of rs) byFile.set(r.file, (byFile.get(r.file) ?? 0) + r.ms)
  console.log('    Per spec file (sum, % of project):')
  for (const [f, ms] of [...byFile].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${sec(ms)}  ${((100 * ms) / sum).toFixed(1).padStart(5)}%  ${f}`)
  }
}

if (skipped.length) {
  console.log(`\n--- Skipped (${skipped.length})`)
  const byFile = new Map()
  for (const r of skipped)
    byFile.set(`${r.project} ${r.file}`, (byFile.get(`${r.project} ${r.file}`) ?? 0) + 1)
  for (const [k, n] of [...byFile].sort()) console.log(`    ${String(n).padStart(3)}  ${k}`)
}
if (failed.length) {
  console.log(`\n--- Failed or flaky (${failed.length})`)
  for (const r of failed) console.log(`    [${r.status}] ${r.project}  ${r.file}  ${r.title}`)
}
const probes = rows.filter((r) => r.probe)
if (probes.length) {
  console.log('\n--- Probe results')
  for (const r of probes) console.log(`    ${r.probe}`)
}
process.exit(exitCode)
