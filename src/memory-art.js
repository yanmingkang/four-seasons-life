// Editorial illustrations are separate from the photographs of visited cells.
// A theme visualizes a method; it never establishes another event or outcome.
const art=(key,title,caption)=>Object.freeze({key,src:`/art/ending-v1/${key}.png`,title,caption,
  alt:`${title} · 游戏同风格 3D 主题插画，非本局场景留影`});

export const MEMORY_ART=Object.freeze({
  cover:art('cover','四季回忆','回忆意象'),
  accompany:art('accompany','给陪伴留个位置','方法插画'),
  communicate:art('communicate','把话慢慢说清','方法插画'),
  grow:art('grow','让经验长出新芽','方法插画'),
  rest:art('rest','给自己一点留白','方法插画')
});

const SOURCE_THEMES=Object.freeze({
  care_coordination:'accompany',care_budget:'accompany',distance_shared:'accompany',
  distance_agreement:'accompany',listening:'accompany',household:'accompany',
  family_conversation:'accompany',friends:'accompany',
  records:'communicate',teamwork:'communicate',structure:'communicate',
  impromptu:'communicate',incident:'communicate',offer_questions:'communicate',
  salary_evidence:'communicate',freelance_scope:'communicate',pilot_cooperation:'communicate',
  microbreak:'rest',offscreen:'rest',leave_boundary:'rest',
  first_city:'grow',skills:'grow',moving_zones:'grow',mentor_guidance:'grow',
  trial_review:'grow',results_review:'grow',portfolio_structure:'grow',clients:'grow',
  savings_diary:'grow',transition:'grow',housing_budget:'grow',handover_checklist:'grow',shop_location:'grow'
});
const REST_CELLS=new Set(['cell-05','cell-07','cell-12','cell-14','cell-21','cell-24','cell-32','cell-35','cell-38','cell-39']);

export function methodMemoryArt(method,moment=null){
  // Only the method already selected from an actual record supplies its theme.
  // A missing source gets a neutral illustration, not an invented recommendation.
  const sourceId=method?.moment?.eventId?method.source?.id:null;
  if(sourceId&&Object.hasOwn(SOURCE_THEMES,sourceId))return MEMORY_ART[SOURCE_THEMES[sourceId]];
  const actualMoment=method?.moment||moment;
  return REST_CELLS.has(actualMoment?.eventId)?MEMORY_ART.rest:MEMORY_ART.grow;
}
