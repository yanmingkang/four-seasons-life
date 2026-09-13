// Cutouts are a design album only. Selecting a card focuses a real 3D building;
// the game never substitutes a billboard for its volumetric landmark geometry.
export const TOWN_LANDMARKS = Object.freeze([
  {id:'library',title:'小镇图书馆',detail:'红瓦、书窗与花箱',cell:0},
  {id:'stadium',title:'向阳体育馆',detail:'环形屋顶与开敞球场',cell:1},
  {id:'village',title:'烟火城中村',detail:'屋顶水箱与晾衣阳台',cell:2},
  {id:'bookstall',title:'转角咖啡书摊',detail:'条纹棚下，歇一歇',cell:3},
]);
export function townGalleryMarkup(){
  return `<span class="tiny-label">小镇地标 · 3D 田园</span><h2>这一次，走进画里。</h2><p class="muted">选一座，转动镜头看看。</p><div class="town-gallery">${TOWN_LANDMARKS.map(item=>`<button type="button" class="town-card" data-landmark="${item.id}"><span class="town-art town-art-${item.cell}" role="img" aria-label="${item.title}设计图"></span><strong>${item.title}</strong><small>${item.detail}</small><span class="town-card-action">看 3D 建筑 ↗</span></button>`).join('')}</div><details class="town-fineprint"><summary>关于这组地标</summary><p>图册为去底设计图；场景为对应的立体模型，可旋转、缩放。不会移动角色或改动存档。</p></details>`;
}
