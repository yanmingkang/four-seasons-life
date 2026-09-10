// Kept separate so import errors are recoverable under strict script-src self.
function complete(){
  if(window.__fourSeasonsBoot)return window.__fourSeasonsBoot.complete();
  const start=document.getElementById('start-full');
  if(!start||typeof start.onclick!=='function')return fail();
  document.getElementById('app').inert=false;
  document.getElementById('app').removeAttribute('aria-busy');
  document.getElementById('boot-screen').hidden=true;
}
function fail(){
  if(window.__fourSeasonsBoot)return window.__fourSeasonsBoot.fail();
  document.getElementById('boot-title').textContent='小镇暂时没有打开';
  document.getElementById('boot-detail').textContent='程序未完整加载，请检查网络或试玩服务后重新加载。';
  document.getElementById('boot-screen').dataset.state='error';
}
import('./main.js').then(complete).catch(fail);
