/**
 * Emülatörde zamanlayıcı olmadığı için günlük özet ve haftalık raporu elle
 * çalıştırır. E-posta gitmez; mailLog'a "deneme" olarak düşer.
 *   (emülatör açıkken) node functions/deneme-ozet.mjs
 */
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.GCLOUD_PROJECT ||= 'demo-playbook';
process.env.MAIL_FROM ||= '1401 Campus <bildirim@1401coffee.com>';
process.env.APP_URL ||= 'https://playbook-1401.web.app';
const { gunlukOzetGonder, haftalikRaporGonder } = await import('./ozet.js');
await gunlukOzetGonder();
await haftalikRaporGonder();
console.log('Günlük özet ve haftalık rapor çalıştı (mailLog).');
process.exit(0);
