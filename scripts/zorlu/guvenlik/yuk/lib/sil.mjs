// YALNIZCA yerel emülatör (demo-guvenlik): bütün koleksiyonları siler.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ projectId: 'demo-guvenlik' });
const db = getFirestore();
for (const c of await db.listCollections()) await db.recursiveDelete(c);
console.log('kalan koleksiyon', (await db.listCollections()).length);
process.exit(0);
