// The exported bitmap stays unchanged. Only its in-dialog presentation changes.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function sharePreviewMarkup({title,url,alt,caption,filename,downloadLabel,backLabel}){
  return `<section class="share-view" data-zoom="detail" aria-labelledby="share-heading">
    <header class="share-header"><h2 id="share-heading" tabindex="-1">${esc(title)}</h2><button type="button" class="share-zoom" data-share-zoom aria-pressed="true" aria-controls="share-scroll">整张预览</button></header>
    <div class="share-viewport" id="share-scroll" tabindex="0" role="region" aria-label="分享长图，可滚动阅读">
      <button type="button" class="share-image-button" data-share-image aria-pressed="true" aria-label="切换为整张预览"><img class="share-preview" src="${esc(url)}" alt="${esc(alt)}" draggable="false"/></button>
    </div>
    <footer class="share-footer"><p class="share-caption">${esc(caption)}</p><div class="share-actions"><a class="primary" href="${esc(url)}" download="${esc(filename)}">${esc(downloadLabel)}</a><button type="button" id="back-to-report" class="secondary">${esc(backLabel)}</button></div></footer>
  </section>`;
}

export function mountSharePreview(host,options){
  host.innerHTML=sharePreviewMarkup(options);
  const view=host.querySelector('.share-view'),viewport=host.querySelector('.share-viewport');
  const zoom=host.querySelector('[data-share-zoom]'),picture=host.querySelector('[data-share-image]');
  const img=host.querySelector('.share-preview'),back=host.querySelector('#back-to-report');
  const dialog=host.closest('dialog');
  let detail=true,lastScrollTop=0;
  const dimensions=()=>{if(img.naturalWidth&&img.naturalHeight)view.style.setProperty('--share-ratio',`${img.naturalWidth} / ${img.naturalHeight}`);};
  const toggle=()=>{
    if(detail)lastScrollTop=viewport.scrollTop;
    detail=!detail;view.dataset.zoom=detail?'detail':'fit';
    zoom.setAttribute('aria-pressed',String(detail));picture.setAttribute('aria-pressed',String(detail));
    zoom.textContent=detail?'整张预览':'放大细看';
    picture.setAttribute('aria-label',detail?'切换为整张预览':'放大阅读分享图');
    viewport.setAttribute('aria-label',detail?'分享长图，可滚动阅读':'整张分享图预览');
    viewport.scrollTop=detail?lastScrollTop:0;viewport.scrollLeft=0;
  };
  // Moving focus to the fixed toggle avoids an offscreen image button after a
  // keyboard-initiated resize. Pointer users retain their reading position.
  const togglePicture=event=>{toggle();if(event.detail===0)zoom.focus({preventScroll:true});};
  zoom.addEventListener('click',toggle);picture.addEventListener('click',togglePicture);
  back.addEventListener('click',options.onBack);img.addEventListener('load',dimensions);dimensions();
  dialog?.setAttribute('aria-labelledby','share-heading');
  host.querySelector('#share-heading').focus({preventScroll:true});
  return ()=>{
    zoom.removeEventListener('click',toggle);picture.removeEventListener('click',togglePicture);
    back.removeEventListener('click',options.onBack);img.removeEventListener('load',dimensions);
    if(dialog?.getAttribute('aria-labelledby')==='share-heading')dialog.removeAttribute('aria-labelledby');
  };
}
