/**
 * Çekimden önce YEREL EMÜLATÖRÜ bilinen başlangıca döndürür: önceki
 * çekimlerin öneri, sınav denemesi ve test baristalarını siler, sonra
 * seed:emu ile örnek veriyi (talepler, müfredat, hesaplar) yeniden yazar.
 * Yalnızca 127.0.0.1:8080 emülatörüne bağlanır; canlı ya da demo projeye
 * dokunamaz.
 */
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-playbook/databases/(default)/documents';
const H = { Authorization: 'Bearer owner' };
async function list(col) {
  const out = []; let token = '';
  do {
    const r = await fetch(`${FS}/${col}?pageSize=300${token ? `&pageToken=${token}` : ''}`, { headers: H }).then((x) => x.json());
    out.push(...(r.documents || [])); token = r.nextPageToken || '';
  } while (token);
  return out;
}
for (const col of ['proposals', 'attempts', 'baristas', 'config', 'requests', 'assignments']) {
  let n = 0;
  for (const d of await list(col)) {
    const id = d.name.split('/').pop();
    if (col === 'baristas' && id.startsWith('demo-')) continue;
    if (col === 'config' && id !== 'badges') continue;
    // Seed'in kendi talep ve görevleri kalır; çekimde eklenenler gider.
    if ((col === 'requests' && id.startsWith('req-')) || (col === 'assignments' && id.startsWith('demo-'))) continue;
    await fetch(`${FS}/${col}/${id}`, { method: 'DELETE', headers: H });
    n++;
  }
  console.log(`${col}: ${n} silindi`);
}
// Önceki çekimde onaylanıp yayınlanan örnek terfi bülteni (öneri yeniden "yeni" görünsün).
await fetch(`${FS}/bulletins/demo-terfi-kasim`, { method: 'DELETE', headers: H });
// Rehber videosunda yeni barista (Deniz) davet koduyla PIN belirliyor; bu
// hesabın şifresini değiştiriyor. Seed var olan hesabın şifresine dokunmadığı
// için davet şifresine geri çekilir, kod bir sonraki çekimde yine çalışır.
{
  const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-playbook';
  const email = 'b-demo-yeni-1@hesap.playbook1401.app';
  const r = await fetch(`${AUTH}/accounts:lookup`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: [email] }) }).then((x) => x.json());
  const localId = r.users?.[0]?.localId;
  if (localId) await fetch(`${AUTH}/accounts:update`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId, password: 'davet-246810-1401' }) });
}
execSync('npm run -s seed:emu', { cwd: fileURLToPath(new URL('../../../', import.meta.url)), stdio: 'inherit', env: { ...process.env, PATH: `${process.env.HOME}/.local/node/bin:${process.env.PATH}` } });
