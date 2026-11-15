// Ölçüm çıktılarını özetler: node ozet.mjs > out/ozet.txt
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { OUT } from './lib.mjs';
const files = readdirSync(OUT).filter((f) => /^olcum-.*\.json$/.test(f));
const agg = { hscroll: [], offscreen: [], covered: [], small: new Map(), cut: new Map(), errs: new Map(), contrast: new Map(), login: [], access: [] };
for (const f of files) {
  for (const r of JSON.parse(readFileSync(join(OUT, f), 'utf8'))) {
    const where = `${r.role} ${r.size} ${r.theme} ${r.route}`;
    if (r.route === 'LOGIN') { agg.login.push(where + ' ' + r.error); continue; }
    if (r.finalRoute && r.finalRoute !== r.route) agg.access.push(`${r.role} ${r.route} → ${r.finalRoute}`);
    if (r.hscroll) agg.hscroll.push(`${where} +${r.hscroll}px  ${(r.wide || []).slice(0, 3).join(' | ')}`);
    for (const o of r.offscreen || []) agg.offscreen.push(`${where}: ${o}`);
    for (const c of r.covered || []) agg.covered.push(`${where}: ${c}`);
    for (const s of r.small || []) { const k = s.replace(/"[^"]*"/, (m) => m.slice(0, 30)); const v = agg.small.get(k) || new Set(); v.add(`${r.role}:${r.size}:${r.route}`); agg.small.set(k, v); }
    for (const c of r.cut || []) { const k = c.replace(/\d+\/\d+px/, '').slice(0, 90); const v = agg.cut.get(k) || new Set(); v.add(`${r.role}:${r.size}:${r.route}`); agg.cut.set(k, v); }
    for (const e of r.errs || []) { const k = `${e.t}: ${e.msg.slice(0, 160)}`; const v = agg.errs.get(k) || new Set(); v.add(`${r.role}:${r.size}:${r.route}`); agg.errs.set(k, v); }
    for (const c of r.contrast || []) { const k = `${r.theme} ${c.color} ${c.ratio}<${c.need} ${c.cls.slice(0, 50)}`; const v = agg.contrast.get(k) || { n: new Set(), ex: c.txt }; v.n.add(`${r.role}:${r.route}`); agg.contrast.set(k, v); }
  }
}
const uniq = (a) => [...new Set(a)];
console.log('== GİRİŞ HATASI'); agg.login.forEach((x) => console.log(x));
console.log('\n== ERİŞİM (yönlendirilen)'); uniq(agg.access).forEach((x) => console.log(x));
console.log('\n== YATAY KAYDIRMA'); agg.hscroll.forEach((x) => console.log(x));
console.log('\n== EKRAN DIŞI ÖĞE'); uniq(agg.offscreen).slice(0, 200).forEach((x) => console.log(x));
console.log('\n== ÖRTÜLEN ÖĞE'); uniq(agg.covered).slice(0, 300).forEach((x) => console.log(x));
console.log('\n== HATALAR'); [...agg.errs].forEach(([k, v]) => console.log(`${k}  [${v.size}] ${[...v].slice(0, 4).join(', ')}`));
console.log('\n== KÜÇÜK DOKUNMA ALANI (öğe → sayfa sayısı)'); [...agg.small].sort((a, b) => b[1].size - a[1].size).slice(0, 120).forEach(([k, v]) => console.log(`${v.size}\t${k}\t${[...v].slice(0, 2).join(', ')}`));
console.log('\n== KESİLEN METİN'); [...agg.cut].sort((a, b) => b[1].size - a[1].size).slice(0, 150).forEach(([k, v]) => console.log(`${v.size}\t${k}\t${[...v].slice(0, 2).join(', ')}`));
console.log('\n== KARŞITLIK'); [...agg.contrast].sort((a, b) => b[1].n.size - a[1].n.size).slice(0, 80).forEach(([k, v]) => console.log(`${v.n.size}\t${k}\t"${v.ex}"\t${[...v.n].slice(0, 2).join(', ')}`));
