import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useContent } from '../../store/content';
import { useMyProgress } from './useBaristaData';
import { buildIndex, searchLessons, RECIPE_TRACK_ID, type LessonHit } from '../../lib/search';
import { Icon } from '../../ui/Icon';
import { Page, Empty } from '../../ui/kit';
import * as t from '../../ui/tokens';

/**
 * Reçeteler — servis sırasında kullanılan ekran.
 *
 * Akademi müfredatın yapısına göre düzenlidir (yol → modül → ders); bu
 * ekran ise tek bir işe hizmet eder: aradığın içeceği en hızlı biçimde
 * açmak. Arama ders adının yanında malzemeyi de kapsar.
 */

const LessonRow: React.FC<{ hit: LessonHit; done: boolean }> = ({ hit, done }) => (
  <Link to={`/ders/${hit.lesson.id}`} className={t.listRow}>
    <span className={t.iconChip(done ? 'positive' : 'neutral')}>
      <Icon name={done ? 'check' : 'coffee'} size={16} />
    </span>
    <div className="flex-1 min-w-0">
      <div className="text-[14px] font-medium truncate">{hit.lesson.title}</div>
      <div className="text-[12px] text-fg-3 truncate">
        {hit.matchedIngredient ? `İçinde: ${hit.matchedIngredient}` : hit.module.title}
      </div>
    </div>
    <Icon name="chevronRight" size={16} className={t.rowChevron} />
  </Link>
);

export const RecipesPage: React.FC = () => {
  const { tracks, modules, lessons } = useContent();
  const { progress } = useMyProgress();
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

  const isDone = (id: string) => !!progress.lessons?.[id];
  const recipeHits = results.filter((r) => r.isRecipe);
  const otherHits = results.filter((r) => !r.isRecipe);

  return (
    <Page>
      <div className="flex flex-col gap-3">
        <h1 className={t.screenTitle}>Reçeteler</h1>

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
                  {recipeHits.map((h) => <LessonRow key={h.lesson.id} hit={h} done={isDone(h.lesson.id)} />)}
                </div>
              </div>
            )}
            {otherHits.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className={t.sectionLabel}>Diğer dersler · {otherHits.length}</span>
                <div className={t.listGroup}>
                  {otherHits.map((h) => <LessonRow key={h.lesson.id} hit={h} done={isDone(h.lesson.id)} />)}
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
            <Empty icon="coffee" text="Bu kategoride yayında ders yok." />
          ) : (
            <div className={t.listGroup}>
              {browse.map((h) => <LessonRow key={h.lesson.id} hit={h} done={isDone(h.lesson.id)} />)}
            </div>
          )}
        </div>
      )}
    </Page>
  );
};
