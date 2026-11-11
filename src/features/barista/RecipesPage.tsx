import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../../store/session';
import { useContent } from '../../store/content';
import { buildIndex, searchLessons, RECIPE_TRACK_ID, type LessonHit } from '../../lib/search';
import { LessonBlocks } from '../academy/LessonBlocks';
import { Icon } from '../../ui/Icon';
import { Page, PageTitle, Empty } from '../../ui/kit';
import { HUE } from '../../ui/palette';
import * as t from '../../ui/tokens';
import type { Lesson } from '../../../shared/types';

/**
 * Reçeteler — servis sırasında kullanılan ekran.
 *
 * Reçete ders değildir: barista bir içeceği misafirin isteğini hatırlamak
 * ya da ölçüye bakmak için açar. Bu yüzden reçete kendi sayfasında açılır
 * (/recete/:id) — ders akışı, ilerleme çubuğu, "tamamladım" düğmesi yok,
 * eğitim ilerlemesine de dokunmaz. Aynı içerik Akademi'de eğitim dersi
 * olarak ayrıca durur; sınava hazırlanan barista oradan çalışır.
 */

/** Dersin ilk görseli (menü fotoğrafı) — listede küçük resim olarak. */
const photoOf = (l: Lesson) => {
  const b = l.blocks?.find((x) => x.type === 'image');
  return b && b.type === 'image' ? b.url : null;
};

const RecipeRow: React.FC<{ hit: LessonHit }> = ({ hit }) => {
  const pic = photoOf(hit.lesson);
  return (
    <Link to={hit.isRecipe ? `/recete/${hit.lesson.id}` : `/ders/${hit.lesson.id}`} className={t.listRow}>
      {pic ? (
        <img src={pic} alt="" loading="lazy" className="w-11 h-11 rounded-xl object-cover shrink-0 bg-panel-3" />
      ) : (
        <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${hit.isRecipe ? HUE.amber.chip : 'bg-panel-3 text-fg-2'}`}>
          <Icon name={hit.isRecipe ? 'coffee' : 'book'} size={18} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium truncate">{hit.lesson.title}</div>
        <div className="text-[12px] text-fg-3 truncate">
          {hit.matchedIngredient ? `İçinde: ${hit.matchedIngredient}` : hit.module.title}
        </div>
      </div>
      <Icon name="chevronRight" size={16} className={t.rowChevron} />
    </Link>
  );
};

export const RecipesPage: React.FC = () => {
  const { tracks, modules, lessons } = useContent();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [cat, setCat] = useState<string>('hepsi');
  const inputRef = useRef<HTMLInputElement>(null);

  // Ana ekrandaki arama kutusuna dokunulduğunda buraya odaklanarak gelinir.
  useEffect(() => {
    if (params.get('focus') === '1') {
      inputRef.current?.focus();
      const next = new URLSearchParams(params);
      next.delete('focus');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const index = useMemo(() => buildIndex(tracks, modules, lessons), [tracks, modules, lessons]);
  const results = useMemo(() => searchLessons(index, q), [index, q]);
  const searching = q.trim().length >= 2;

  const recipeModules = useMemo(
    () => modules.filter((m) => m.published && m.trackId === RECIPE_TRACK_ID),
    [modules]
  );
  const browse = useMemo(() => {
    const all = index.filter((i) => i.isRecipe);
    const picked = cat === 'hepsi' ? all : all.filter((i) => i.module.id === cat);
    // Ders `order` alanı modül içinde 1'den başlıyor; sıralamayı yalnızca ona
    // bırakınca kategoriler iç içe geçiyor. Menüdeki sırayı koruyoruz:
    // önce modül, sonra modül içindeki ders sırası.
    return [...picked].sort((a, b) => a.module.order - b.module.order || a.lesson.order - b.lesson.order);
  }, [index, cat]);

  const recipeHits = results.filter((r) => r.isRecipe);
  const otherHits = results.filter((r) => !r.isRecipe);

  return (
    <Page>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${HUE.amber.chip}`}><Icon name="coffee" size={19} /></span>
          <div>
            <h1 className={t.screenTitle}>Reçeteler</h1>
            <div className="text-[12px] text-fg-3">Ölçü, bardak ve hazırlanış — servis sırasında hızlıca bak.</div>
          </div>
        </div>

        <div className="relative">
          <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3 pointer-events-none" />
          <input
            ref={inputRef}
            id="recipe-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`${t.input} pl-10 pr-10`}
            placeholder="İçecek ya da malzeme ara"
            autoComplete="off"
            enterKeyHint="search"
          />
          {q && (
            <button
              onClick={() => { setQ(''); inputRef.current?.focus(); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-fg-3 hover:text-crema"
              aria-label="Aramayı temizle"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      {searching ? (
        results.length === 0 ? (
          <Empty icon="search" text={`"${q}" için sonuç yok. İçecek adının bir parçasını ya da malzeme adını dene.`} />
        ) : (
          <div className="flex flex-col gap-5">
            {recipeHits.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className={t.sectionLabel}>Reçeteler · {recipeHits.length}</span>
                <div className={t.listGroup}>
                  {recipeHits.map((h) => <RecipeRow key={h.lesson.id} hit={h} />)}
                </div>
              </div>
            )}
            {otherHits.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className={t.sectionLabel}>Akademi dersleri · {otherHits.length}</span>
                <div className={t.listGroup}>
                  {otherHits.map((h) => <RecipeRow key={h.lesson.id} hit={h} />)}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <div className={t.scrollX}>
            <button onClick={() => setCat('hepsi')} className={`${t.chip} ${cat === 'hepsi' ? t.chipOn : t.chipOff}`}>
              Hepsi
            </button>
            {recipeModules.map((m) => (
              <button key={m.id} onClick={() => setCat(m.id)} className={`${t.chip} ${cat === m.id ? t.chipOn : t.chipOff}`}>
                {m.title}
              </button>
            ))}
          </div>

          {browse.length === 0 ? (
            <Empty icon="coffee" text="Bu kategoride yayında reçete yok." />
          ) : (
            <div className={t.listGroup}>
              {browse.map((h) => <RecipeRow key={h.lesson.id} hit={h} />)}
            </div>
          )}
        </div>
      )}
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Tek reçete                                                          */
/* ------------------------------------------------------------------ */

export const RecipeDetailPage: React.FC = () => {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { modules, lessons } = useContent();
  const recipe = lessons.find((l) => l.id === lessonId);
  const [zoom, setZoom] = useState(false);
  const signedInBarista = useSession((x) => x.session.kind === 'barista');
  if (!recipe) return <Page><PageTitle title="Reçete bulunamadı" back="/receteler" /></Page>;
  const mod = modules.find((m) => m.id === recipe.moduleId);
  // Serviste önce ölçüye bakılır: fotoğraf başlığın yanında küçük durur,
  // dokununca büyür; bardak şeması ve ölçüler hemen görünür.
  const pic = photoOf(recipe);
  const blocks = (recipe.blocks || []).filter((b) => b.type !== 'image' || b.url !== pic);

  return (
    <Page>
      <div className="flex items-center gap-3">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/receteler'))} className={t.iconBtn} aria-label="Geri">
          <Icon name="chevronLeft" size={16} />
        </button>
        <span className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${HUE.amber.text}`}>{mod?.title || 'Reçete'}</span>
      </div>
      <div className="flex items-center gap-4 -mt-1">
        <h1 className="text-[26px] font-bold leading-tight flex-1">{recipe.title}</h1>
        {pic && (
          <button onClick={() => setZoom(true)} className="shrink-0" aria-label="Fotoğrafı büyüt">
            <img src={pic} alt="" className="w-24 h-24 rounded-2xl object-cover border border-line bg-panel-3" />
          </button>
        )}
      </div>

      <LessonBlocks blocks={blocks} />

      {zoom && pic && (
        <button onClick={() => setZoom(false)} className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-5" aria-label="Kapat">
          <img src={pic} alt={recipe.title} className="max-w-full max-h-full rounded-2xl" />
        </button>
      )}

      {/* Reçete eğitim ilerlemesine sayılmaz; sınav Akademi'de. Mağaza
          telefonunda PIN'siz bakılıyorsa Akademi yok — bağlantı gizli. */}
      {mod && signedInBarista && (
        <Link to={`/modul/${mod.id}`} className={`${t.cardInteractive} p-3.5 flex items-center gap-3 mt-2`}>
          <span className={t.iconChip('neutral')}><Icon name="cap" size={16} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium">Akademi'de çalış</div>
            <div className="text-[12px] text-fg-3 truncate">{mod.title} dersleri ve sınavı</div>
          </div>
          <Icon name="chevronRight" size={16} className={t.rowChevron} />
        </Link>
      )}
    </Page>
  );
};

/* ------------------------------------------------------------------ */
/* Mağaza telefonu: PIN'siz reçete                                     */
/* ------------------------------------------------------------------ */

/**
 * Giriş ekranından PIN girmeden açılan reçete bölümü. Servis sırasında
 * yalnızca bir ölçüye bakmak için kimse PIN girmekle vakit kaybetmesin.
 * Bu ekranda ders, sınav, ilerleme ya da kişisel bilgi yok; mağaza
 * oturumu (telefonun kendisi) zaten içerik okuyabiliyor.
 */
export const StoreRecipesLayout: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-40 bg-espresso/85 backdrop-blur-xl border-b border-line pt-[env(safe-area-inset-top)]">
        <div className="h-14 flex items-center gap-3 px-4 max-w-[560px] mx-auto">
          <img src="/icons/logo.svg" alt="" className="w-7 h-7 opacity-90" />
          <div className="flex-1 leading-tight">
            <div className="text-[14px] font-semibold">Reçeteler</div>
            <div className="text-[11px] text-fg-3">Giriş yapmadan bakıyorsun</div>
          </div>
          <button onClick={() => navigate('/')} className={`${t.btn} ${t.btnSecondary} ${t.btnSm}`}>
            <Icon name="user" size={14} /> Giriş
          </button>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
    </div>
  );
};
