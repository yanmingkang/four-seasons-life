// Only canonical game moves leave the browser. No credential is sent to this client.
const MODEL = 'zhida-fast-1p5';
const MAX_ENTRIES = 32;
const completed = new Map();
const pending = new Map();

export function narrationKey(kind, game) {
  // Feedback and the finished report describe the same settled choices.
  const extension=game.extension?{...game.extension,actions:game.phase==='finished' && game.extension.actions?.at(-1)?.[0]==='a'?game.extension.actions.slice(0,-1):game.extension.actions}:undefined;
  return JSON.stringify({kind, version:game.version, mode:game.mode, name:game.name, talent:game.talent, moves:game.moves,...(extension?{extension}:{})});
}

export function peekNarration(kind, game) {
  return completed.get(narrationKey(kind,game)) || null;
}

export function narrationLabel(result) {
  if(result.mode === 'live') return '知乎官方模型 · 本次生成';
  if(result.mode === 'cache') return '知乎官方模型 · 已生成内容';
  return '备用回顾 · 预设内容';
}

export function requestNarration(kind, game, fallbackText) {
  const key=narrationKey(kind,game);
  if(completed.has(key)) {
    const previous=completed.get(key);
    return Promise.resolve({...previous,mode:previous.mode==='live'?'cache':previous.mode});
  }
  if(pending.has(key)) return pending.get(key).promise;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),kind==='summary'?50000:25000);
  const item={controller,promise:null};
  item.promise=(async()=>{
    let result;
    try {
      const response=await fetch('/api/narrate',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({kind,game}),signal:controller.signal,
      });
      if(response.status===401&&typeof window!=='undefined')window.dispatchEvent(new Event('zhihu-session-required'));
      if(!response.ok) throw new Error('narration unavailable');
      const body=await response.json();
      if(!['live','cache','fallback'].includes(body?.mode)||typeof body.text!=='string'||!body.text.trim()||body.text.length>5000) throw new Error('invalid narration');
      if(body.mode!=='fallback'&&body.model!==MODEL) throw new Error('unknown narration model');
      result={mode:body.mode,text:body.text.trim(),model:body.mode==='fallback'?null:MODEL};
    } catch {
      result={mode:'fallback',text:fallbackText,model:null};
    } finally {
      clearTimeout(timeout);
    }
    // Resetting a journey invalidates in-flight results, including its cache entry.
    if(pending.get(key)===item) {
      pending.delete(key);
      completed.set(key,result);
      while(completed.size>MAX_ENTRIES) completed.delete(completed.keys().next().value);
    }
    return result;
  })();
  pending.set(key,item);
  return item.promise;
}

export function cancelPendingNarrations() {
  for(const item of pending.values()) item.controller.abort();
  pending.clear();
}
