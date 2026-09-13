// Interior scenes are optional. Keep their furniture/animation code out of the
// first-load chunk, and never mount after a dialog has already been closed.
export function mountScenePreview(host,event,options){
  let stopped=false,cleanup,visibility;
  host.replaceChildren();for(const key of ['triangles','drawCalls','camera','renderer','renderedFrames','populationApplied','addedPeople'])delete host.dataset[key];
  host.dataset.renderer='loading';
  const note=document.createElement('span');note.className='scene-preview-label';note.textContent='场景正在打开…';host.append(note);
  import('./scene-preview.js').then(module=>{
    if(stopped||!host.isConnected)return;
    const dialog=host.closest('dialog');
    const mount=()=>{if(stopped||!host.isConnected||dialog&&!dialog.open)return;visibility?.disconnect();host.replaceChildren();cleanup=module.mountScenePreview(host,event,options);};
    if(dialog&&!dialog.open){visibility=new MutationObserver(mount);visibility.observe(dialog,{attributes:true,attributeFilter:['open']});}else mount();
  }).catch(()=>{if(!stopped&&host.isConnected){host.dataset.renderer='fallback';host.textContent='场景暂时未载入，旅程仍可继续。';}});
  return ()=>{if(stopped)return;stopped=true;visibility?.disconnect();cleanup?.();host.replaceChildren();};
}
