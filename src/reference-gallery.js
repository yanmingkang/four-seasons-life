import {EVENTS,SEASONS} from './events.js';
import {getCellArt} from './reference-art-manifest.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seasonIcons=['✿','☀','❧','❄'];

// No original raster URL is attached to an img until the player asks for it.
export function referenceTownMarkup(season=0){
  return `<span class="tiny-label">四季小镇 · 立体漫游</span><h2>走进路上的每一处。</h2><div class="reference-season-tabs" role="group" aria-label="选择季节">${SEASONS.map((s,i)=>`<button class="${season===i?'is-active':''}" data-town-season="${i}" aria-pressed="${season===i}">${seasonIcons[i]} ${s.name}<small>${s.title}</small></button>`).join('')}</div><div class="reference-place-grid">${EVENTS.filter(e=>e.season===season).map(e=>`<button data-visit-cell="${e.number}" class="reference-place"><span class="reference-place-number">${String(e.number).padStart(2,'0')}</span><strong>${escape(e.location)}</strong><span class="reference-place-arrow" aria-hidden="true">↗</span></button>`).join('')}</div><div class="reference-gallery-footer"><button class="secondary" id="view-character-reference">刘看山形象</button></div>`;
}

export function referenceIdsForCell(cell){
  const art=getCellArt(cell);
  return art?[...new Set([...(art.interior||[]),...(art.exterior||[]),...(art.shared||[])])]:[];
}

export function sceneReferenceMarkup(ids){
  // The scene viewer is the finished artwork.  Reference rasters belong in
  // the source browser and must not be rendered underneath every scene card;
  // keeping this hook (returning an empty string) preserves callers and old
  // saved pages while removing the misleading “original comparison” panel.
  return '';
}

export function mountReferenceImages(host,ids){
  // Kept as a compatibility hook for older callers. Current scene cards do
  // not create a reference image host, so mounting is intentionally a no-op.
  return ()=>{};
}
