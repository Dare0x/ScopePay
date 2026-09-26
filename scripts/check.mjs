// Static checks on the built app: required files, wiring between HTML and JS, and syntax.
import fs from 'node:fs';
import path from 'node:path';
import {root} from './compile.mjs';

const read = name => fs.readFileSync(path.join(root, 'dist', name), 'utf8');
const html = read('index.html'), js = read('app.js'), css = read('app.css');
const config = JSON.parse(read('contract.json'));
const problems = [];
const need = (ok, message) => { if (!ok) problems.push(message); };

need(html.includes('<title>ScopePay') && html.includes('rel="icon"'), 'page title or icon missing');
need(fs.existsSync(path.join(root, 'dist', 'mark.svg')), 'mark.svg missing');
for (const id of [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])) {
  const used = js.includes(`'#${id}'`) || js.includes(`"#${id}"`) || js.includes(`getElementById('${id}')`) || ['deal', 'deals', 'record', 'introTitle', 'recordTitle', 'termsList', 'newDealForm'].includes(id);
  need(used, `#${id} is in the HTML but never used by app.js`);
}
for (const id of new Set([...js.matchAll(/\$\('#([A-Za-z]+)'\)/g)].map(m => m[1]))) need(html.includes(`id="${id}"`), `app.js uses #${id} but the HTML has no such element`);
for (const fn of ['claimAfterReviewWindow', 'reclaimAfterMissedDeadline', 'settleAfterArbiterWindow', 'resolveDispute', 'approveMilestone', 'submitMilestone', 'openDispute', 'cancelUnstarted', 'createDeal']) {
  need(js.includes(fn), `app.js never calls ${fn}`);
  need(config.abi.some(item => item.name === fn), `ABI has no ${fn}`);
}
need(!js.includes('location.reload()'), 'app.js forces page reloads');
need(config.tokens.map(t => t.symbol).join() === 'USDC,USDG', 'token list should be USDC and USDG');
need(css.includes('@media (max-width: 720px)'), 'phone layout rules missing');
try { new Function(js.replace(/^import .*$/gm, '')); } catch (error) { problems.push(`app.js syntax: ${error.message}`); }

if (problems.length) { console.error(problems.map(p => `✖ ${p}`).join('\n')); process.exit(1); }
console.log(`Checks passed: page wiring, ${config.abi.filter(i => i.type === 'function').length} contract functions, USDC + USDG, phone layout, syntax.`);
