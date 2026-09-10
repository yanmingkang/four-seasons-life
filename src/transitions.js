export function eventTheme(kind='') {
  if(kind==='治愈')return {id:'rest',label:'给自己一点呼吸',mark:'叶',caption:'A MOMENT TO BREATHE'};
  if(kind==='机会'||kind==='成长')return {id:'opportunity',label:'新的可能，正在发生',mark:'光',caption:'A NEW POSSIBILITY'};
  if(kind==='抉择')return {id:'conflict',label:'生活，递来一道选择',mark:'择',caption:'A CHOICE THAT MATTERS'};
  if(kind==='相遇')return {id:'meeting',label:'在这里，遇见一点温度',mark:'遇',caption:'A LITTLE CONNECTION'};
  return {id:'work',label:'新的生活任务已送达',mark:'页',caption:'A PAGE OF YOUR JOURNEY'};
}

export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function arrivalTransition(container,kind,isCurrent=()=>true) {
  const theme=eventTheme(kind);
  container.dataset.theme=theme.id;
  container.querySelector('.arrival-mark').textContent=theme.mark;
  container.querySelector('.arrival-caption').textContent=theme.caption;
  container.querySelector('.arrival-title').textContent=theme.label;
  container.hidden=false;
  container.classList.remove('playing');
  void container.offsetWidth;
  container.classList.add('playing');
  await delay(matchMedia('(prefers-reduced-motion: reduce)').matches?360:760);
  if(isCurrent()){container.hidden=true;container.classList.remove('playing');}
  return theme;
}
