import React from 'react';

/**
 * Demo ortamının giriş ekranlarında görünen bilgi kutusu.
 *
 * Yalnızca .env.demo ile derlenen sürümde çıkar (VITE_DEMO), canlı sürümde
 * kod bile çalışmaz. Amaç: deneyen kişinin kimseye şifre sormadan içeri
 * girebilmesi. Şifre bilerek buraya yazılmaz — adres herkese açık olduğu
 * için şifre ekipten sözlü alınır.
 */
export const DEMO = import.meta.env.VITE_DEMO === 'true';

const Box: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="w-full max-w-[360px] rounded-xl border border-caution-line bg-caution-bg px-4 py-3.5 flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-caution">Demo</span>
      <span className="text-[12px] text-fg-3">örnek veri · canlı sistemden ayrı</span>
    </div>
    {children}
  </div>
);

/** Kahve Operasyonu giriş ekranı için. */
export const DemoStaffNotice: React.FC = () => {
  if (!DEMO) return null;
  const email = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
  return (
    <Box>
      <p className="text-[13px] leading-relaxed text-fg-2">
        Bu, denemek için kurulmuş ayrı bir kopyadır. Buradaki şubeler, baristalar ve sınav
        sonuçları örnektir; ne yaparsan yap canlı sisteme hiçbir etkisi olmaz.
      </p>
      {email && (
        <p className="text-[13px] leading-relaxed text-fg-2">
          Kullanıcı adı: <b className="text-crema">{email}</b> — şifreyi Kahve Operasyonu’ndan al.
        </p>
      )}
      <p className="text-[12px] text-fg-3 leading-relaxed">
        Gerçek personel adı, şube verisi ya da başka bir yerde kullandığın şifreyi buraya girme.
      </p>
    </Box>
  );
};

/** Mağaza telefonu eşleştirme ekranı için. */
export const DemoPairNotice: React.FC = () => {
  if (!DEMO) return null;
  const code = import.meta.env.VITE_DEMO_PAIRING as string | undefined;
  if (!code) return null;
  return (
    <Box>
      <p className="text-[13px] leading-relaxed text-fg-2">
        Telefonu denemek için eşleştirme kodu: <b className="text-crema tnum tracking-[0.2em]">{code}</b>
      </p>
      <p className="text-[12px] text-fg-3 leading-relaxed">
        Kodu girdikten sonra Moda Cadde’nin baristaları listelenir; her birinin PIN’i panelde yazılıdır.
      </p>
    </Box>
  );
};
