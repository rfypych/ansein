/* Engine regression harness — pure-function tests, no DB, no network, no LLM.
 * Compiles the real engine sources with the project compiler, then asserts
 * documented invariants (each mirrors a production incident lesson).
 * Run: pnpm test:engines (or: node scripts/regression/run.cjs)
 */
const { execSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const OUT = path.join(ROOT, 'node_modules', '.cache', 'ansein-engines')

let pass = 0
let fail = 0
const failures = []
function eq(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
  } else {
    fail++
    failures.push(`${name}\n  expected: ${e}\n  actual:   ${a}`)
  }
}
function ok(name, cond) {
  if (cond) pass++
  else {
    fail++
    failures.push(`${name} (condition false)`)
  }
}

function rewriteAliasRequires(dir) {
  // tsc does not rewrite '@/*' path aliases — fix built requires to absolute
  // paths so the harness runs without extra dependencies.
  for (const ent of require('fs').readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      rewriteAliasRequires(p)
      continue
    }
    if (!p.endsWith('.js')) continue
    let t = require('fs').readFileSync(p, 'utf8')
    const before = t
    t = t.replace(/require\("@\/lib\/engines\/([A-Za-z0-9_-]+)"\)/g, (_, m) => `require(${JSON.stringify(path.join(OUT, 'engines', m))})`)
    t = t.replace(/require\("@\/lib\/([A-Za-z0-9_-]+)"\)/g, (_, m) => `require(${JSON.stringify(path.join(OUT, m))})`)
    if (t !== before) require('fs').writeFileSync(p, t)
  }
}

async function main() {
  execSync(`npx tsc -p ${path.join(__dirname, 'tsconfig.engines.json')}`, { cwd: ROOT, stdio: 'pipe' })
  rewriteAliasRequires(OUT)
  const ex = require(path.join(OUT, 'engines', 'extraction.js'))
  const an = require(path.join(OUT, 'engines', 'analysis.js'))
  const dc = require(path.join(OUT, 'engines', 'decay.js'))
  const fe = require(path.join(OUT, 'engines', 'free-enrichment.js'))

  // 0. abuse.ch CSV parsing incl. commas-inside-quotes (lesson: ThreatFox tags)
  const tfr = fe.parseCsvLine('"2026-09-17 02:48:17", "1921447", "evil.invalid", "domain", "payload_delivery", "js.clearfake", "None", "ClearFake", "", "100", "False", "None", "ClearFake,mac-0xdcf2,macos", "1", "anonymous"')
  eq('threatfox csv field count', tfr.length, 15)
  eq('threatfox csv value', tfr[2], 'evil.invalid')
  eq('threatfox csv tags kept whole', tfr[12], 'ClearFake,mac-0xdcf2,macos')
  const uhr = fe.parseCsvLine('"3917893","2026-09-17 02:46:12","http://85.12.237.201:49126/bin.sh","online","2026-09-17 02:46:12","malware_download","32-bit,arm,elf,Mozi","https://urlhaus.abuse.ch/url/3917893/","geenensp"')
  eq('urlhaus csv url', uhr[2], 'http://85.12.237.201:49126/bin.sh')
  eq('urlhaus csv tags kept whole', uhr[6], '32-bit,arm,elf,Mozi')

  // 1. defang (lesson: CTI reports obfuscate IOCs)
  eq('defang hxxp+[.]', ex.defang('hxxp://evil[.]com/x'), 'http://evil.com/x')
  eq('defang hxxps+dot+colon', ex.defang('hxxps://a[dot]b(dot)com[:\/\/]c'), 'https://a.b.com://c')

  // 2. regexExtract: finds IOCs, rejects file/code lookalikes (lesson: .dll/.bin domains)
  const hits = ex.regexExtract(
    'C2 185.220.101.5 and hxxp://cdn[.]invalid/payload.bin with ntdll.dll kernel32.dll stage2.bin ' +
    'hash 44d88612fea8a8f36de82e1278abb02f CVE-2024-3094 contact soc@example.invalid'
  )
  const byType = {}
  for (const h of hits) byType[h.entity_type] = (byType[h.entity_type] || 0) + 1
  eq('regex ip', byType.ioc_ip, 1)
  eq('regex url', byType.ioc_url, 1)
  eq('regex md5', byType.ioc_hash, 1)
  eq('regex cve', byType.vulnerability, 1)
  eq('regex domains (url host + email domain)', byType.ioc_domain, 2)
  ok('regex rejects ntdll.dll', !hits.some((h) => /dll$/i.test(h.value)))
  ok('regex rejects stage2.bin', !hits.some((h) => /stage2\.bin/i.test(h.value)))
  ok('regex no pure-hex wallet', !hits.some((h) => h.entity_type === 'ioc_wallet' && /^[a-f0-9]+$/i.test(h.value)))

  // 3. grounding (lesson: "gait metadata" paraphrase must not pass)
  const hay = ex.defang('volt typhoon used mimikatz. see T1059.001. contact x. mitigating controls apply.').toLowerCase()
  ok('ground verbatim', ex.isGroundedInText('Volt Typhoon', 'threat_actor', hay))
  ok('ground via T-code', ex.isGroundedInText('PowerShell execution (T1059.001) variant', 'technique', hay))
  ok('ungrounded paraphrase rejected', !ex.isGroundedInText('Network Proxy Detection via gait metadata', 'technique', hay))

  // 4. dense selection prefers named-tool prose over technique catalogs (lesson: AA24-038A)
  const catalog = 'Gather Victim Org Information T1591 Search Open Websites T1593 Network Service Scanning T1046 '.repeat(8)
  const prose = 'Volt Typhoon operators used Mimikatz to dump LSASS and Impacket for lateral movement. '.repeat(4)
  ok('narrative pick beats catalog', ex.scoreNarrative(prose) > ex.scoreNarrative(catalog))

  // 5. lenient array parse salvages truncated LLM output (lesson: wholesale chunk loss)
  const salvaged = ex.parseJsonArrayLenient('[{"entity_type":"tool","value":"Mimikatz"},{"entity_type":"tool","value":"Impa')
  eq('salvage keeps complete object', salvaged.length, 1)
  eq('salvage value', salvaged[0]?.value, 'Mimikatz')

  // 6. decay (lesson: intel rots; OpenCTI parity)
  const now = new Date()
  const freshIp = dc.decayEntity('ioc_ip', 0.95, now, now)
  eq('fresh ip', freshIp.freshness, 'fresh')
  const old = new Date(now.getTime() - 90 * 86400000)
  const staleIp = dc.decayEntity('ioc_ip', 0.95, old, now)
  eq('90d ip stale', staleIp.freshness, 'stale')
  ok('90d ip decayed below base', staleIp.decayed_confidence < 0.5)
  const actor = dc.decayEntity('threat_actor', 0.9, old, now)
  eq('actor never decays', actor.freshness, 'stable')
  eq('actor keeps confidence', actor.decayed_confidence, 0.9)
  const hash = dc.decayEntity('ioc_hash', 0.98, old, now)
  ok('hash outlives ip', hash.decayed_confidence > staleIp.decayed_confidence)

  // 7. severity breakdown: itemised, sums to total, enrichment capped (lesson: theater scoring)
  const bd = an.severityBreakdown(
    [
      { entity_type: 'threat_actor' },
      { entity_type: 'vulnerability' },
      { entity_type: 'ioc_ip' },
      { entity_type: 'ioc_ip' },
    ],
    [{ cisa_kev: { is_known_exploited: true } }, { cisa_kev: { is_known_exploited: true } }, { cisa_kev: { is_known_exploited: true } }]
  )
  const sum = bd.factors.reduce((s, f) => s + f.points, 0)
  eq('breakdown sums to total (capped)', bd.total, Math.min(100, Math.max(10, sum)))
  ok('KEV capped at 25 not 75', bd.total <= 35 + 20 + 20 + 6 + 25 + 15)
  ok('factors non-empty with labels', bd.factors.length > 0 && bd.factors.every((f) => f.label && f.points > 0))
  const emptyBd = an.severityBreakdown([], [])
  eq('empty case floors at 10', emptyBd.total, 10)

  console.log(`\nengines: ${pass} passed, ${fail} failed`)
  for (const f of failures) console.log('FAIL:', f)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e.message)
  process.exit(2)
})
