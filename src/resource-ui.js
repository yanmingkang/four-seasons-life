const shapes = {
  coin: '<circle cx="12" cy="12" r="9" fill="#f4bc42" stroke="#a76b24" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="#ffe391"/><path d="M12 7v10m-3-7h5m-5 4h5" stroke="#9e651f" stroke-width="1.8"/>',
  heart: '<path d="M12 21 3 12C-3 5 6-1 12 5c6-6 15 0 9 7Z" fill="#ed798b" stroke="#a34763" stroke-width="1.6"/><path d="M4 8q0-3 3-3" fill="none" stroke="#ffd2d2" stroke-width="2"/>',
  broken: '<path d="M11 4C4-2-3 6 3 12l7 7 1-6-3-3 4-3Z" fill="#e67c91" stroke="#a34763"/><path d="m15 5-3 4 3 3-2 9 8-9c6-7-2-13-6-7Z" fill="#ef9ea7" stroke="#a34763"/>',
  star: '<path d="m12 2 3 6.6 7.3.8-5.4 5 1.5 7.2-6.4-3.7-6.4 3.7 1.5-7.2-5.4-5 7.3-.8Z" fill="#9fc489" stroke="#4f754a" stroke-width="1.5"/><path d="m12 6 1.2 3" stroke="#e9f5d4" stroke-width="2"/>',
};
export const resourceIcon = (name, cls='') => `<svg class="resource-art ${cls}" viewBox="0 0 24 24" aria-hidden="true">${shapes[name]||shapes.star}</svg>`;
export function resourceEffects(record) {
  const layer=document.querySelector('#resource-effects');if(!layer)return;
  layer.replaceChildren();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  [['coin','moneyDelta'],['heart','moodDelta'],['star','expDelta']].forEach(([kind,key],column)=>{
    const delta=record[key]||0;if(!delta)return;
    const group=document.createElement('div');group.className=`resource-burst burst-${kind} ${delta<0?'loss':'gain'}`;
    group.style.setProperty('--column',column);group.setAttribute('aria-hidden','true');
    for(let i=0;i<5;i++){
      const particle=document.createElement('span');particle.className='resource-particle';particle.style.setProperty('--i',i);
      particle.innerHTML=resourceIcon(kind==='heart'&&delta<0?'broken':kind);group.append(particle);
    }
    const label=document.createElement('b');label.textContent=`${delta>0?'+':''}${delta.toLocaleString('zh-CN')}`;group.append(label);layer.append(group);
    const cleanup=e=>{if(e.target===group){group.removeEventListener('animationend',cleanup);group.remove();}};
    group.addEventListener('animationend',cleanup);
  });
}
export function summaryChart(state){
  const values=[Math.min(1,state.money/800000),Math.min(1,state.mood/(state.moodMax||100)),Math.min(1,state.exp/150)];
  const vertices=[[150,34],[48,212],[252,212]];
  const pts=values.map((v,i)=>`${150+(vertices[i][0]-150)*v},${150+(vertices[i][1]-150)*v}`).join(' ');
  return `<figure class="life-chart"><svg viewBox="0 0 300 258" role="img" aria-label="本局资金、情绪与专业值比例图，不是人格测评"><path d="M150 34 48 212 252 212Z M150 73 82 191 218 191Z M150 111 116 171 184 171Z M150 34V150L48 212M150 150 252 212" fill="none" stroke="#cdd8bd"/><polygon points="${pts}" fill="#93b67c88" stroke="#497753" stroke-width="2"/><text x="150" y="19" text-anchor="middle">储备金</text><text x="45" y="239" text-anchor="middle">情绪余量</text><text x="254" y="239" text-anchor="middle">专业底气</text></svg><figcaption>本局资源快照 · 仅作游戏复盘<br>绘图刻度：80 万元 / 情绪上限 / 150 点；超出按满格绘制。</figcaption></figure>`;
}
