const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function photo(moment,{small=false}={}){
  if(!moment)return '<div class="memory-empty-photo">故事从下一步开始</div>';
  return `<figure class="memory-photo ${small?'is-small':''}"><img src="${esc(moment.image)}" alt="${esc(moment.location)} · 游戏 3D 场景静帧" decoding="async"/><span class="memory-photo-fallback" hidden>${esc(moment.location)}<small>画面暂未载入，回忆仍在这里。</small></span><figcaption><span>${String(moment.number).padStart(2,'0')} / ${esc(moment.location)}</span><span>场景留影</span></figcaption></figure>`;
}
function illustration(artwork){
  return `<figure class="memory-photo memory-illustration" data-memory-art="${esc(artwork.key)}"><img src="${esc(artwork.src)}" alt="${esc(artwork.alt)}" decoding="async"/><span class="memory-photo-fallback" hidden>${esc(artwork.title)}<small>插画暂未载入，文字仍可阅读。</small></span><figcaption><span>${esc(artwork.title)}</span><span>${esc(artwork.caption)}</span></figcaption></figure>`;
}
const selection=moment=>`<p class="memory-choice"><span>那时，你选择</span>${esc(moment.choice)}</p>`;
function titleReceipt(album){
  const commemorations=Array.isArray(album.commemorations)?album.commemorations:[];
  const titles=[album.journeyTitle,...commemorations].filter(title=>title?.reason);
  if(!titles.length)return '';
  return `${commemorations.length?`<div class="memory-commemorations" aria-label="本局达成的特殊纪念">${commemorations.map(title=>`<span class="memory-commemoration">${esc(title.name)}</span>`).join('')}</div>`:''}<details class="memory-evidence memory-title-evidence"><summary>${commemorations.length?'称号与纪念的来处':'这个称号的来处'}</summary>${titles.map(title=>`<section class="memory-title-proof"><p class="memory-proof-name">${esc(title.name)}</p><p>${esc(title.reason)}</p>${title.moments?.length?`<ul>${title.moments.map(moment=>`<li>「${esc(moment.title)}」：${esc(moment.choice)}</li>`).join('')}</ul>`:''}</section>`).join('')}</details>`;
}
function coverPrint(moment){
  if(!moment)return '';
  return `<div class="memory-cover-print" data-memory-cover-event="${esc(moment.eventId)}">${photo(moment,{small:true})}<p><span>称号留影 · 本局亲历</span>「${esc(moment.title)}」</p></div>`;
}
function pageMarkup(album,page){
  const moment=page.moment;
  if(page.kind==='cover')return `<div class="memory-copy"><p class="memory-kicker">${album.complete?'四季成章':`故事停在${esc(album.endSeason)}季`} / ${album.mode}</p><h2 id="memory-heading">这一程，<br>属于你的<br><em>四季回忆。</em></h2><p class="memory-title-stamp">${esc(album.title)}</p><p class="memory-soft">${esc(album.titleReason||album.subtitle)}</p>${titleReceipt(album)}<p class="memory-count"><b>${album.count}</b> 段亲历，写进这本回忆。</p></div><div class="memory-visual">${illustration(page.artwork)}${coverPrint(album.coverMoment||null)}</div>`;
  if(page.kind==='season')return `<div class="memory-copy"><p class="memory-kicker">${page.season.en} / ${page.season.count} 段亲历</p><h2 id="memory-heading" class="memory-season-title"><span>${page.season.name}</span>${page.season.stage}</h2><h3>${esc(moment.title)}</h3>${selection(moment)}<p class="memory-result">${esc(moment.result)}</p></div><div class="memory-visual">${photo(moment)}</div>`;
  if(page.kind==='choice')return `<div class="memory-copy"><p class="memory-kicker">ONE CHOICE / 回看一次取舍</p><h2 id="memory-heading">如果再到<br>这一刻。</h2><h3>${esc(moment.title)}</h3>${selection(moment)}<p class="memory-result">${esc(moment.result)}</p><p class="memory-soft">今天回看，你还会这样选吗？</p></div><div class="memory-visual">${photo(moment)}</div>`;
  if(page.kind==='method'){
    const method=album.method;
    return `<div class="memory-copy"><p class="memory-kicker">TAKE IT WITH YOU / 留给现实的一小步</p><h2 id="memory-heading">带走的，<br>不只是一局。</h2>${method?`<p class="memory-method-when">下次，${esc(method.when)}时</p><p class="memory-method">${esc(method.text)}</p><a class="memory-source" href="${esc(method.source.url)}" target="_blank" rel="noopener noreferrer">知乎 · ${esc(method.source.author)} ↗</a><details class="memory-evidence"><summary>这条方法的来处</summary><p>${esc(method.source.title)}</p><p>${esc(method.attribution)} · ${esc(method.source.evidence)}</p><p>${esc(method.boundary)}</p>${method.source.scope?`<p>${esc(method.source.scope)}</p>`:''}</details>`:`<p class="memory-method">把「${esc(moment?.title||'这一程')}」里还没想清楚的问题，留给下一次尝试。</p><p class="memory-soft">本局没有可对应的来源记录，不补写答主建议。</p>`}</div><div class="memory-visual">${illustration(page.artwork)}<p class="memory-photo-note">从你实际经历的「${esc(moment?.title||'这一程')}」出发。</p></div>`;
  }
  return `<div class="memory-copy"><p class="memory-kicker">KEEP THIS JOURNEY / 故事留在这里</p><h2 id="memory-heading">走过的路，<br>有了回声。</h2><p class="memory-soft">${album.complete?'这一程已经成章。':'未走到的季节，留给下一次。'}<br>选择没有标准答案，回忆有你的版本。</p><div class="memory-end-actions"><button class="primary" id="share-card" ${album.count?'':'disabled'}>生成四季分享卡 ↗</button><button class="secondary" id="download-note">下载完整手记</button><button class="secondary" id="report-restart">再走一程</button></div><p class="memory-privacy">分享卡不包含姓名或练习对话。</p></div><div class="memory-filmstrip">${album.seasons.map(season=>`<div class="memory-season-print ${season.moment?'':'is-unwritten'}" style="--print-tint:${season.tint}"><span>${season.name} <small>${season.moment?esc(season.moment.location):'尚未写下'}</small></span>${season.moment?photo(season.moment,{small:true}):'<p>这一页留白。</p>'}</div>`).join('')}</div>`;
}

export function mountMemoryAlbum(host,album,{onDetails,onShare,onDownload,onRestart,onPractice,practiceInvitation=false,onPage=()=>{},index=0,inheritance=''}={}){
  let current=Math.max(0,Math.min(index,album.pages.length-1));
  function show(next){
    const restoreFocus=host.contains(document.activeElement);
    current=next;const page=album.pages[current],season=page.season||album.seasons[page.moment?.season??0];
    host.innerHTML=`<section class="memory-album" data-memory-kind="${page.kind}" data-memory-page="${current}" style="--memory-accent:${season.color};--memory-tint:${season.tint}"><header class="memory-topline"><span>知乎四时 <i>/</i> 我的回忆册</span><button data-memory-details>详细手记 ↗</button></header><article class="memory-page memory-${page.kind}" aria-labelledby="memory-heading">${pageMarkup(album,page)}</article>${page.kind==='share'?`<div class="memory-inheritance">${inheritance}</div>`:''}<footer class="memory-navigation"><button data-memory-step="-1" aria-label="上一页" ${current===0?'disabled':''}>←</button><nav aria-label="回忆章节">${album.pages.map((p,i)=>`<button data-memory-go="${i}" aria-label="第 ${i+1} 页：${p.label}" ${i===current?'aria-current="step"':''}>${p.label}</button>`).join('')}</nav><span class="memory-page-count" aria-live="polite">${String(current+1).padStart(2,'0')} / ${String(album.pages.length).padStart(2,'0')}</span><button data-memory-step="1" aria-label="下一页" ${current===album.pages.length-1?'disabled':''}>→</button></footer><p class="memory-footnote">本局实际选择 · 场景留影与主题插画 · 虚构体验，不预测真实人生</p></section>`;
    // UI-only: independent rehearsal is not an actual memory or shared image.
    if(practiceInvitation){
      const actions=document.createElement('div');actions.className='memory-top-actions';
      actions.innerHTML='<button type="button" data-memory-practice title="独立沟通练习，不计入本局经历" aria-label="试着说一句：独立沟通小练习，不计入本局经历">试着说一句 ↗</button>';
      const details=host.querySelector('[data-memory-details]');details.before(actions);actions.append(details);
    }
    host.querySelectorAll('.memory-photo img').forEach(img=>{img.onerror=()=>{img.hidden=true;img.nextElementSibling.hidden=false;};});
    const heading=host.querySelector('#memory-heading');heading.tabIndex=-1;
    if(restoreFocus)heading.focus({preventScroll:true});
    onPage(current);host.closest('dialog')?.scrollTo({top:0});
  }
  const move=step=>show(Math.max(0,Math.min(current+step,album.pages.length-1)));
  const click=event=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    if(target.dataset.memoryStep)move(Number(target.dataset.memoryStep));
    else if(target.dataset.memoryGo!==undefined)show(Number(target.dataset.memoryGo));
    else if(target.hasAttribute('data-memory-details'))onDetails?.();
    else if(target.hasAttribute('data-memory-practice'))onPractice?.();
    else if(target.id==='share-card')onShare?.();
    else if(target.id==='download-note')onDownload?.();
    else if(target.id==='report-restart')onRestart?.();
  };
  const key=event=>{
    if(!host.closest('dialog')?.open||event.target.closest('input,textarea,select,details,[contenteditable]'))return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
  };
  const toggle=event=>{
    const details=event.target;if(!details.matches?.('.memory-title-evidence'))return;
    const copy=details.closest('.memory-copy');if(!copy)return;
    if(details.open){
      const overflow=details.getBoundingClientRect().bottom-copy.getBoundingClientRect().bottom;
      if(overflow>0)copy.scrollTop+=overflow+8;
    }else {copy.scrollTop=0;details.scrollTop=0;}
  };
  host.addEventListener('click',click);host.addEventListener('keydown',key);host.addEventListener('toggle',toggle,true);show(current);
  return ()=>{host.removeEventListener('click',click);host.removeEventListener('keydown',key);host.removeEventListener('toggle',toggle,true);};
}
