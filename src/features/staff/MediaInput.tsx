import React, { useState } from 'react';
import { compressImage } from '../../lib/media';
import { Icon } from '../../ui/Icon';
import { Spinner, toast } from '../../ui/kit';
import * as t from '../../ui/tokens';

/**
 * Görsel/video alanı. Hem ders blokları hem bülten kullanır.
 *
 * Spark planında Storage olmadığı için görseller küçültülüp data URL olarak
 * belgenin içine gömülür (bkz. src/lib/media.ts). Video yüklenemez, yalnızca
 * dış bağlantı verilebilir.
 */
export const MediaInput: React.FC<{
  url: string;
  kind: 'image' | 'video';
  onChange: (url: string) => void;
  placeholder?: string;
}> = ({ url, kind, onChange, placeholder }) => {
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      onChange(await compressImage(file));
    } catch (e) {
      toast((e as Error).message, 'negative');
    }
    setBusy(false);
  };

  if (kind === 'video') {
    return (
      <input
        className={t.input}
        value={url}
        onChange={(e) => onChange(e.target.value)}
        placeholder="YouTube bağlantısı (dosya yüklenemez)"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {url && (
        <div className="relative self-start">
          <img src={url} alt="" className="max-h-48 rounded-lg border border-line" />
          <button
            onClick={() => onChange('')}
            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/60 backdrop-blur text-crema flex items-center justify-center hover:bg-black/80"
            aria-label="Görseli kaldır"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          className={t.input}
          value={url.startsWith('data:') ? '' : url}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'Görsel bağlantısı ya da dosya yükle'}
        />
        <label className={`${t.btn} ${t.btnSecondary} ${t.btnLg} cursor-pointer`} title="Dosyadan yükle">
          {busy ? <Spinner size={14} /> : <Icon name="upload" size={15} />}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
};
