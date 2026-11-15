import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { OUT } from './lib.mjs';
for (const f of readdirSync(OUT).filter((f) => /^tik-.*\.json$/.test(f) && (!process.argv[2] || f.includes(process.argv[2])))) {
  console.log('##', f);
  for (const x of JSON.parse(readFileSync(join(OUT, f), 'utf8'))) {
    if (x.t === 'hatalar') { if (x.errs.length) console.log('HATALAR', JSON.stringify(x.errs).slice(0, 1500)); continue; }
    if (x.t) { if (x.t !== 'atlandı' && x.t !== 'pasif') console.log(x.t, x.route, x.el || x.landed); continue; }
    if (!x.changed || x.clickErr) console.log('ÖLÜ?', x.route, x.el, x.clickErr || '', x.shot ? x.shot.split('/').pop() : '');
    if (x.exits) { const e = x.exits; const bad = !e.esc || !e.x || !e.outside; console.log(bad ? 'PENCERE!' : 'pencere', x.route, x.dialog, JSON.stringify(e)); }
    for (const i of x.inner || []) if (!i.changed || i.clickErr) console.log('  iç ÖLÜ?', x.dialog, i.el, i.clickErr || '', i.t || '', i.shot ? i.shot.split('/').pop() : '');
  }
}
