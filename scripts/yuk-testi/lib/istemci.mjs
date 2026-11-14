/** Uygulama modüllerini istemci başına ayrı kopya olarak yükleyen yardımcı (bkz. yukleyici.mjs). */
export async function client(tag) {
  const fb = await import(`./istemci-firebase.mjs?c=${tag}`);
  const fs = await import(`./sayac.mjs?c=${tag}`);
  const auth = await import('firebase/auth');
  const m = (p) => import(`../../../src/${p}?c=${tag}`);
  const c = { tag, fb, fs, auth, m, db: fb.db };
  c.exam = await m('api/exam.ts');
  c.backend = (await m('api/backend.ts')).backend;
  c.signIn = (email, password) => auth.signInWithEmailAndPassword(fb.auth, email, password);
  c.uid = () => fb.auth.currentUser?.uid;
  /** Oturumu panel/barista olarak işaretle (signedName, authorName oturumdan okur). */
  c.asStaff = async (s) => {
    const se = await m('store/session.ts');
    se.useSession.setState({ session: { kind: 'staff', uid: s.uid, name: s.name, email: s.email, role: s.role } });
    return se;
  };
  return c;
}

/** İzin sonucu: 'ok' | 'red' | 'hata:<kod>' */
export async function dene(p) {
  try { await p; return 'ok'; } catch (e) { return e?.code === 'permission-denied' || /permission/i.test(e?.message || '') ? 'red' : `hata:${e?.code || ''}:${String(e?.message || e).slice(0, 120)}`; }
}
