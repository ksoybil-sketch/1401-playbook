import React from 'react';

/**
 * Demo ortamının giriş ekranlarında görünen bilgi kutusu.
 *
 * Yalnızca .env.demo ile derlenen sürümde çıkar (VITE_DEMO); gösterilen
 * bilgiler de yalnızca o ortam dosyasında olduğu için canlı paketin içine
 * hiç girmez.
 *
 * Buradaki hesaplar ve PIN'ler bilerek açık yazılıyor: demo kimseye şifre
 * sormadan denenebilsin diye. Bu yüzden demo ortamına gerçek veri girilmez.
 */
export const DEMO = import.meta.env.VITE_DEMO === 'true';

type Login = { email: string; password: string };

/** "a@x:1234|b@y:5678" → [{email, password}] */
function parseLogins(raw: string | undefined): Login[] {
  if (!raw) return [];
  return raw.split('|').map((pair) => {
    const i = pair.lastIndexOf(':');
    return { email: pair.slice(0, i).trim(), password: pair.slice(i + 1).trim() };
  }).filter((l) => l.email && l.password);
}

const Box: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="w-full max-w-[360px] rounded-xl border border-caution-line bg-caution-bg px-4 py-3.5 flex flex-col gap-2.5">
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-caution">Demo</span>
      <span className="text-[12px] text-fg-3">örnek veri · canlı sistemden ayrı</span>
    </div>
    {children}
  </div>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="text-[12px] text-fg-3 truncate">{label}</span>
    <span className="text-[13px] font-semibold text-crema tnum shrink-0">{value}</span>
  </div>
);

/** Kahve Operasyonu giriş ekranı için. */
export const DemoStaffNotice: React.FC = () => {
  if (!DEMO) return null;
  const hidden = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
  const logins = parseLogins(import.meta.env.VITE_DEMO_LOGINS as string | undefined);
  return (
    <Box>
      <p className="text-[13px] leading-relaxed text-fg-2">
        Bu, denemek için kurulmuş ayrı bir kopyadır. Buradaki şubeler, baristalar ve sınav
        sonuçları örnektir; ne yaparsan yap canlı sisteme hiçbir etkisi olmaz.
      </p>
      {(logins.length > 0 || hidden) && (
        <div className="flex flex-col gap-1.5 border-t border-caution-line pt-2.5">
          <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-fg-3">Yönetici girişleri</span>
          {logins.map((l) => <Row key={l.email} label={l.email} value={l.password} />)}
          {hidden && <Row label={hidden} value="şifre ekipten" />}
        </div>
      )}
      <p className="text-[12px] text-fg-3 leading-relaxed">
        Hepsi tam yetkilidir. Gerçek personel adı ya da şube verisi girme.
      </p>
    </Box>
  );
};

/** Mağaza telefonu eşleştirme ekranı için. */
export const DemoPairNotice: React.FC = () => {
  if (!DEMO) return null;
  const code = import.meta.env.VITE_DEMO_PAIRING as string | undefined;
  const pin = import.meta.env.VITE_DEMO_PIN as string | undefined;
  if (!code) return null;
  return (
    <Box>
      <div className="flex flex-col gap-1.5">
        <Row label="Eşleştirme kodu" value={code} />
        {pin && <Row label="Tüm baristaların PIN’i" value={pin} />}
      </div>
      <p className="text-[12px] text-fg-3 leading-relaxed">
        Kodu girince Moda Cadde’nin baristaları listelenir; birine dokunup PIN’i gir.
      </p>
    </Box>
  );
};

/** Barista seçim ekranında PIN'i hatırlatır. */
export const DemoPinHint: React.FC = () => {
  const pin = import.meta.env.VITE_DEMO_PIN as string | undefined;
  if (!DEMO || !pin) return null;
  return (
    <p className="text-[12px] text-caution bg-caution-bg border border-caution-line rounded-lg px-3 py-2">
      Demo · herkesin PIN’i <b className="tnum tracking-[0.15em]">{pin}</b>
    </p>
  );
};
