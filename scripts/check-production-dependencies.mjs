import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

const forbidden = /^(?:\*|latest|git\+|github:|https?:|file:|link:|workspace:)/i;
const rootLock = lock?.packages?.['']?.dependencies ?? {};
const failures = [];

for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
  if (typeof spec !== 'string' || forbidden.test(spec.trim())) {
    failures.push(`${name}: unsafe production dependency spec ${JSON.stringify(spec)}`);
    continue;
  }
  if (rootLock[name] !== spec) {
    failures.push(`${name}: package.json and package-lock root spec mismatch (${spec} != ${rootLock[name] ?? 'missing'})`);
  }
  const locked = lock?.packages?.[`node_modules/${name}`];
  if (!locked?.version) failures.push(`${name}: lockfile version missing`);
  if (!locked?.resolved) failures.push(`${name}: lockfile resolved URL missing`);
  if (!locked?.integrity) failures.push(`${name}: lockfile integrity missing`);
}

if (failures.length) {
  console.error('Production dependency policy: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Production dependency policy: PASS (${Object.keys(pkg.dependencies ?? {}).length} top-level production dependencies)`);
