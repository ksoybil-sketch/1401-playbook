/**
 * Müfredatı uygulamanın içine gömülebilecek tek bir JSON dosyasına yazar.
 *
 *   npm run curriculum
 *
 * Panelde "Müfredatı güncelle" düğmesi bu dosyayı okur ve yöneticinin kendi
 * oturumuyla Firestore'a yazar — sezon güncellemelerinde betik ya da şifre
 * gerekmez. Reçete/soru dosyaları değiştiğinde bu komut yeniden koşturulur.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CURRICULUM, flattenCurriculum } from './content.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../src/generated');
const outFile = join(outDir, 'curriculum.json');

const data = flattenCurriculum(CURRICULUM);
const payload = {
  // Sürüm, panelde "hangi müfredat yüklü" bilgisini göstermek için.
  version: new Date().toISOString().slice(0, 10),
  season: '2026',
  ...data
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(payload), 'utf8');

const kb = (JSON.stringify(payload).length / 1024).toFixed(0);
console.log(`src/generated/curriculum.json yazıldı (${kb} KB)`);
console.log(`  ${data.tracks.length} eğitim yolu`);
console.log(`  ${data.modules.length} modül`);
console.log(`  ${data.lessons.length} ders`);
console.log(`  ${data.questions.length} soru`);
