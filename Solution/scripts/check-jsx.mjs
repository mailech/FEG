/**
 * Parse every source file the way Metro will:  node Solution/scripts/check-jsx.mjs
 *
 * Exists because counting tags by hand is not a syntax check. A JSX file can be
 * balanced on one element and unbalanced on another, and the failure only shows
 * up as a Metro TransformError in the browser — by which point the dev server
 * has cached it and the app is a red screen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const APP = join(dirname(fileURLToPath(import.meta.url)), '../app');
// @babel/parser lives in the app's node_modules, not this folder's.
const { parse } = createRequire(join(APP, 'package.json'))('@babel/parser');
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.expo' || e === 'public') continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(e)) files.push(p);
  }
})(APP);

let bad = 0;
for (const f of files) {
  try {
    parse(readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    bad++;
    console.error(`FAIL ${f.replace(APP, 'app')}\n     ${e.message.split('\n')[0]}`);
  }
}
console.log(bad ? `\n${bad} file(s) will not compile.` : `${files.length} files parse clean.`);
process.exit(bad ? 1 : 0);
