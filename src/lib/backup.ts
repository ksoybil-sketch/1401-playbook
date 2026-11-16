import { app, auth, USE_EMULATOR } from '../api/firebase';

/**
 * [Uygulama geliştiricisi] Panelden yedek: scripts/yedek.mjs ile aynı içerik
 * ve aynı biçim (Firestore REST belgeleri). İnen dosya
 * `npm run yedek -- --geri-yukle <dosya> --koleksiyon <ad>` ile geri yüklenebilir.
 * Yapay zekâ anahtarı (config/ai) alınmaz. Kayıt sayısı kadar okuma harcar.
 */
const COLLECTIONS = ['users', 'stores', 'baristas', 'progress', 'attempts', 'assignments', 'bulletins', 'requests',
  'proposals', 'boardQuestions', 'feedback', 'hatalar', 'mailLog', 'tracks', 'modules', 'lessons', 'questions'];
const CONFIG_DOCS = ['badges', 'permissions', 'notifications'];

type RestDoc = { name: string; fields?: Record<string, unknown> };

export async function downloadBackup(onStep?: (text: string) => void): Promise<{ total: number; file: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Oturum bulunamadı.');
  const token = await user.getIdToken();
  const projectId = app.options.projectId!;
  const base = USE_EMULATOR ? 'http://127.0.0.1:8080/v1' : 'https://firestore.googleapis.com/v1';
  const FS = `${base}/projects/${projectId}/databases/(default)/documents`;
  const H = { Authorization: `Bearer ${token}` };
  const get = async (url: string) => {
    const r = await fetch(url, { headers: H }).then((x) => x.json());
    if (r.error) throw new Error(r.error.message);
    return r;
  };

  const collections: Record<string, RestDoc[]> = {};
  let total = 0;
  for (const col of COLLECTIONS) {
    onStep?.(`${col} okunuyor…`);
    const docs: RestDoc[] = [];
    let page = '';
    do {
      const r = await get(`${FS}/${col}?pageSize=300${page ? `&pageToken=${page}` : ''}`);
      docs.push(...(r.documents || []));
      page = r.nextPageToken || '';
    } while (page);
    collections[col] = docs;
    total += docs.length;
  }
  collections.config = [];
  for (const id of CONFIG_DOCS) {
    try { collections.config.push(await get(`${FS}/config/${id}`)); total++; } catch { /* belge yok */ }
  }

  const backup = { project: projectId, takenAt: new Date().toISOString(), by: user.email, collections };
  const label = projectId === 'playbook-1401' ? 'canli' : projectId === 'playbook-demo-1401' ? 'demo' : projectId;
  const file = `${new Date().toISOString().slice(0, 10)}-${label}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { total, file };
}
