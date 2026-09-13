// Scene-specific people and traces of daily life. Quiet rooms deliberately
// remain quiet; a waiting coat, open book or second cup can tell their story.
export const REFERENCE_SCENE_LIFE=Object.freeze(Object.fromEntries([
  [1,'独自整理毕业论文',0,'书车、翻开的论文和阅读灯'],[2,'校招咨询与等待',4,'招聘人员、等待学生和资料篮'],
  [3,'搬家后的巷口',1,'邻居、搬家工具和自行车'],[4,'围桌讨论',7,'长木会议桌、坐姿同事、投影图表和吊灯'],
  [5,'茶水间同事闲聊',2,'杯架、便签和同事'],[6,'客户提案进行中',2,'坐姿听众和资料'],
  [7,'夜间独处阳台',0,'洗衣篮、拖鞋和小灯'],[8,'楼道偶遇',2,'站立同事和通知栏'],
  [9,'总监桌前交谈',1,'坐姿总监与档案'],[10,'高铁检票候车',3,'旅客和行李'],
  [11,'团队处理故障',1,'工程师与夜间咖啡'],[12,'深夜地铁口',1,'夜归旅客和路边餐车'],
  [13,'跨部门评审',3,'围桌参与者和资料'],[14,'巷口早餐摊',2,'摊主、食客和碗筷'],
  [15,'共用卫生间',0,'毛巾、洗漱收纳和水迹'],[16,'午后整理思路',0,'桌边帆布包和收起的外套'],
  [17,'项目交付礼堂',4,'观众席与资料册'],[18,'陪伴留观',0,'病床边保温壶和折叠外套'],
  [19,'独自看城市',0,'座椅边热饮和手提袋'],[20,'机场出发候机',3,'候机旅客和拉杆箱'],
  [21,'庭院生日聚餐',3,'围桌朋友和餐具'],[22,'校友宴席',2,'坐姿宾客与餐具'],
  [23,'家庭茶叙',2,'家人、茶杯与点心盘'],[24,'两个人的天台',0,'两只杯子与一条毯子'],
  [25,'书房独自复盘',0,'书签、眼镜和桌面灯具'],[26,'创作者交流沙龙',3,'听众、分享者和书籍'],
  [27,'猎头会谈',0,'会谈资料和一壶茶'],[28,'家庭预算会谈',1,'坐姿参与者和账本'],
  [29,'文创园讨论合作',2,'伙伴与随身作品袋'],[30,'房屋交易办事',3,'窗口工作人员和等候者'],
  [31,'人事交接谈话',0,'收纳纸箱、签字笔和档案'],[32,'车中片刻停留',0,'车位工具箱和保温杯'],
  [33,'医院等候',2,'等候者、值班护士和随身衣物'],[34,'独立咨询接待',1,'客户与桌面资料'],
  [35,'自家客厅陪伴',0,'水果盘、织物和日常书册'],[36,'公共服务窗口',2,'窗口人员、等候者和资料篮'],
  [37,'踏勘老街空店',0,'卷尺、手套与旧店工具'],[38,'安静山中温泉',0,'木盆、毛巾和拖鞋'],
  [39,'公园慢慢休息',0,'长椅边围巾与暖杯'],[40,'回看四季旅程',0,'四季纪念物与展开的记录'],
].map(([cell,scene,people,details])=>[cell,Object.freeze({scene,people,details})])));

export function addReferenceScenePopulation({root,environment,cell,box,cyl,rod,group,chair,desk,document,actor}){
  cell=Number(cell);const plan=REFERENCE_SCENE_LIFE[cell];if(!environment||!plan)return null;
  const existing=environment.getObjectByName('scene-daily-life');if(existing)return existing;
  const g=group(environment,'scene-daily-life');g.userData.population=plan;
  const B=(n,s,c,p,r,e)=>box(g,n,s,c,p,r,e),C=(n,a,b,h,c,p,r,e)=>cyl(g,n,a,b,h,c,p,r,e);
  const R=(n,a,b,r,c)=>rod(g,n,a,b,r,c);let people=0;
  const cloth=['#3e536b','#657a83','#8a7261','#556b61','#82796c'];
  function mug(x,y,z,color='#e4dac0'){
    C('daily-ceramic-cup',.115,.105,.23,color,[x,y+.115,z]);C('daily-coffee-surface',.093,.093,.014,'#66513b',[x,y+.237,z]);
    R('cup-handle-top',[x+.1,y+.19,z],[x+.18,y+.16,z],.018,color);R('cup-handle-side',[x+.18,y+.16,z],[x+.17,y+.065,z],.018,color);R('cup-handle-bottom',[x+.17,y+.065,z],[x+.09,y+.05,z],.018,color);
  }
  function papers(x,y,z,rotate=0){const p=document([x,y,z],rotate);g.add(p);p.name='daily-open-document';p.scale.set(.72,1,.68);return p;}
  function bag(x,z,color='#927658'){
    B('canvas-work-bag',[.55,.69,.31],color,[x,.36,z],null,{pattern:'fabric'});B('bag-front-pocket',[.39,.32,.04],'#b09572',[x,.32,z+.18]);
    for(const dx of [-.18,.18])R('bag-handle',[x+dx,.71,z],[x+dx,.94,z],.027,'#6c6758');R('bag-handle-grip',[x-.18,.94,z],[x+.18,.94,z],.03,'#6c6758');
  }
  function laptop(x,y,z,yaw=0){const l=group(g,'meeting-laptop',[x,y,z],yaw);
    box(l,'laptop-metal-keyboard',[.72,.045,.53],'#697781');box(l,'laptop-screen-frame',[.72,.46,.035],'#334555',[0,.25,-.24],[-.15,0,0]);box(l,'laptop-lit-screen',[.63,.365,.019],'#b9d1d2',[0,.254,-.211],[-.15,0,0]);
    for(let row=0;row<3;row++)for(let col=0;col<8;col++)box(l,'laptop-key',[.056,.007,.054],'#a9b5b1',[-.258+col*.072,.028,-.12+row*.079]);
    for(let i=0;i<3;i++)box(l,'laptop-screen-detail',[.4-i*.065,.017,.01],'#6a9ea9',[-.055,.36-i*.079,-.177]);
  }
  function person(x,z,yaw=0,{seated=false,color=cloth[people%cloth.length],skin='#cfa27e',y=0,scale=1,seat=true,seatTop=1.07*scale,tableHeight=null,tie=true}={}){
    const p=group(g,seated?'seated-scene-participant':'standing-scene-participant',[x,y,z],yaw);p.scale.setScalar(scale);people++;
    // The seat height is measured in room units, independently of body scale.
    // This keeps adults on benches and smaller chairs without floating hips.
    p.userData={populationParticipant:true,seated,seatTop:seated?seatTop:null};
    const hips=seated?seatTop/scale+.15:.85,shoulder=seated?hips+.49:1.53,head=shoulder+.44;
    box(p,'tailored-jacket',[.68,.67,.35],color,[0,hips+.3,0]);box(p,'jacket-shoulder-line',[.79,.16,.36],color,[0,shoulder-.055,0]);
    box(p,'shirt-front',[.19,.43,.027],'#e5e0ca',[0,shoulder-.24,.191]);
    for(const sign of [-1,1]){box(p,'folded-shirt-collar',[.16,.11,.03],'#f0ebd8',[sign*.075,shoulder-.016,.202],[0,0,sign*.45]);box(p,'jacket-lapel',[.11,.34,.038],color,[sign*.165,shoulder-.18,.213],[0,0,-sign*.22]);}
    if(tie){box(p,'tie-knot',[.08,.09,.037],'#614d46',[0,shoulder-.08,.222]);box(p,'fabric-tie',[.07,.26,.04],'#765445',[0,shoulder-.25,.224],[0,0,.06]);}
    cyl(p,'visible-neck',.12,.13,.17,skin,[0,head-.28,0]);box(p,'soft-cubic-face',[.44,.44,.39],skin,[0,head,.012]);box(p,'hair-crown',[.47,.13,.43],'#463b36',[0,head+.235,-.018]);box(p,'hair-back',[.48,.37,.09],'#493d35',[0,head+.065,-.191]);
    for(let i=0;i<4;i++)box(p,'layered-hair-lock',[.115,.12+(i%2)*.06,.13],'#514035',[-.173+i*.115,head+.17-(i%2)*.015,.16],[0,0,.12]);
    for(const sign of [-1,1]){box(p,'ear',[.053,.11,.10],skin,[sign*.237,head-.015,.006]);box(p,'eye',[.025,.033,.013],'#333b3e',[sign*.112,head+.027,.216]);box(p,'eyebrow',[.07,.018,.018],'#55443a',[sign*.112,head+.092,.221]);}
    box(p,'small-nose',[.065,.082,.061],skin,[0,head-.034,.228]);box(p,'neutral-mouth',[.073,.014,.018],'#8d6853',[0,head-.115,.223]);
    for(const sign of [-1,1]){
      if(seated){box(p,'seated-trouser-thigh',[.23,.22,.59],'#354350',[sign*.18,hips-.04,.245]);rod(p,'seated-trouser-shin',[sign*.18,hips-.10,.51],[sign*.18,.12,.54],.104,'#354350');box(p,'leather-shoe',[.25,.12,.38],'#303c43',[sign*.18,.095,.65]);
        const handY=tableHeight===null?hips+.14:tableHeight/scale+.055,reach=tableHeight===null?.52:.82;
        rod(p,'jacket-upper-arm',[sign*.37,shoulder-.12,.02],[sign*.46,hips+.23,.30],.112,color);rod(p,'resting-sleeve',[sign*.46,hips+.23,.30],[sign*.34,handY,reach-.13],.09,color);box(p,'shirt-cuff',[.17,.12,.15],'#e2dfcd',[sign*.34,handY,reach-.12]);box(p,tableHeight===null?'hand-resting-on-lap':'hand-on-table',[.17,.09,.24],skin,[sign*.31,handY,reach]);
      }else{rod(p,'standing-trouser',[sign*.18,.73,0],[sign*.18,.12,0],.109,'#354350');box(p,'leather-shoe',[.25,.13,.4],'#303c43',[sign*.18,.09,.11]);rod(p,'jacket-sleeve',[sign*.36,shoulder-.11,0],[sign*.39,.92,.05],.105,color);box(p,'resting-hand',[.15,.2,.13],skin,[sign*.39,.82,.055]);}
    }
    // chair/document/desk initially attach to root. Adopt them immediately so
    // parent transforms, static batching and room disposal own every new part.
    if(seated&&seat){const s=chair([0,0,0],0,'#536577');p.add(s);s.scale.set(1.05,seatTop/(scale*1.07),1);}
    return p;
  }
  function pendant(x,z,width=2.6,y=4.0){for(const dx of [-width*.37,width*.37])R('meeting-pendant-cable',[x+dx,4.68,z],[x+dx,y,z],.017,'#424b51');B('meeting-pendant-dark-housing',[width,.16,.33],'#485059',[x,y,z]);B('meeting-pendant-ivory-diffuser',[width-.16,.035,.28],'#f4e2aa',[x,y-.098,z],null,{emissive:'#ffdeb0',emissiveIntensity:.35});}
  function sideTable(x,z){const t=desk([x,0,z],[1.05,.88,.72],'#9e744d');g.add(t);mug(x-.18,.99,z);papers(x+.19,1.0,z,.1);}

  // An unoccupied room still contains tangible daily life. These traces are
  // placed in the side/back layers, away from the protagonist and story props.
  if(plan.people===0){
    if([7,15,18,24,35,38,39].includes(cell)){
      const x=cell===18?-3.85:cell===24?2.85:cell===38?3.9:cell===39?3.65:4.45,z=cell===38?1.72:cell===15?-.1:1.4;
      const t=desk([x,0,z],[.78,.58,.66],'#98714b');g.add(t);mug(x,.68,z-.12);
      B('folded-soft-cloth',[.59,.09,.4],'#c4b48e',[x,.72,z+.15],null,{pattern:'fabric'});for(let i=0;i<4;i++)B('cloth-woven-stripe',[.026,.006,.36],i%2?'#a49274':'#7f9688',[x-.21+i*.14,.771,z+.15]);
      for(const dx of [-.22,.22])B('waiting-slipper',[.18,.075,.41],'#87918a',[x+dx,.054,z+.68]);
    }else if([1,16,19,25,27,31,32,37,40].includes(cell)){
      const x=[25,27,40].includes(cell)?4.6:cell===32?-4.5:4.25,z=cell===40?1.7:cell===31?1.5:2.0;
      bag(x,z);B('folded-jacket-cushion',[.59,.09,.42],'#8b9b93',[x-.03,.75,z],null,{pattern:'fabric'});
      if([1,25,27].includes(cell)){sideTable(x-1.1,z-.85);}
      if(cell===37){R('measuring-tape-extended',[2.65,.047,1.05],[4.2,.047,1.05],.017,'#d1b469');B('old-shop-toolbox',[.88,.37,.44],'#688276',[3.3,.19,2.23]);}
      if(cell===40)for(let i=0;i<4;i++){B('memory-envelope',[.56,.038,.72],['#c1a58d','#9eae91','#c0a063','#a8bec0'][i],[1.5+i*.55,.195,2.20],[0,.12*i,0]);}
    }
  }
  switch(cell){
    case 2:
      for(const x of [-3,0,3]){person(x,-1.7,Math.PI,{scale:.92,tie:true});papers(x,1.21,-2.65);}
      person(3.55,-.15,-.3,{color:'#9b8167',tie:false});bag(4.2,-.1);break;
    case 3:person(-3.6,-1.4,.4,{color:'#7d8b70',tie:false,scale:.88});bag(4.7,1.4);break;
    case 4:{
      // Expand the authored desk and reuse its chair. The notebook and date
      // card retain their original geometry on the new tabletop.
      const table=root.children.find(o=>o.visible&&o.name==='table');
      if(table){table.position.set(0,0,-.45);table.scale.set(7.55/3.7,1.42/1.3,2.72/1.85);table.name='full-length-meeting-table';g.add(table);}
      else{const replacement=desk([0,0,-.45],[7.55,1.42,2.72],'#895a3b');g.add(replacement);replacement.name='full-length-meeting-table';}
      const originalChair=root.children.find(o=>o.visible&&o.name==='upholstered-chair');
      if(originalChair){originalChair.position.set(-2.6,0,-2.6);originalChair.rotation.y=0;g.add(originalChair);}
      environment.traverse(o=>{if(/^(laptop-|screen-chart-stroke)/.test(o.name)){o.position.x+=.1;o.position.y+=.12;o.position.z+=.4;}
        if(/^(mug-|meeting-felt-desk-pad|resting-meeting-pencil|closed-meeting-notebook|notebook-page-block)/.test(o.name)&&o.position.z> -2){if(o.position.x< -2.3)o.position.x+=.55;o.position.y+=.12;o.position.z+=.6;}});
      const vignette=root.getObjectByName('event-4-specific-props');
      if(vignette){vignette.position.set(0,0,-.45);vignette.scale.setScalar(1);for(const [i,o]of vignette.children.entries()){o.position.set(i?1.2:-.3,i?.595:.245,i?.1:-.15);o.traverse(part=>{if(['prop-desktop','prop-table-leg'].includes(part.name))part.visible=false;});}}
      for(const [i,[x,z,yaw]]of [[-2.6,-2.6,0],[-.6,-2.6,0],[1.4,-2.6,0],[-2.65,1.7,Math.PI],[-.55,1.7,Math.PI],[1.55,1.7,Math.PI]].entries()){person(x,z,yaw,{seated:true,seat:i!==0||!originalChair,tableHeight:1.513});const inward=z<0?1:-1;if(i!==0)laptop(x,1.535,z+inward*1.30,yaw);mug(x+.48,1.525,z+inward*1.24);papers(x-.43,1.53,z+inward*1.24,.08);}
      const presenter=person(4.55,-1.6,-.48,{color:'#415570'});presenter.name='meeting-presenter';
      const screen=group(g,'meeting-presentation-chart',[2.4,3.12,-4.10]);box(screen,'dark-projection-frame',[4.4,2.62,.16],'#364553');box(screen,'projection-ivory-board',[4.19,2.40,.031],'#e8ead7',[0,0,.11]);
      for(let i=0;i<5;i++){const h=.24+i*.19;box(screen,'meeting-chart-bar',[.35,h,.039],['#82a4bc','#6894b0','#5b83a3','#c0a762','#d0ba78'][i],[-1.42+i*.63,-.63+h/2,.145]);}
      for(let i=0;i<4;i++)box(screen,'meeting-slide-heading',[2.83-(i%2)*.53,.055,.028],'#9daeb9',[-.25,.99-i*.17,.149]);
      for(const x of [-2.1,1.4])pendant(x,-.3,2.7,4.12);
      actor.position.set(3.8,0,2.55);actor.rotation.y=-1.0;
      break;}
    case 5:person(-2.5,-1.1,.15,{color:'#748479',tie:false});person(.0,-1.6,-.5,{color:'#a38d73',tie:false});mug(-1.3,1.39,-2.5);mug(-.65,1.39,-2.5);break;
    case 6:person(3.1,1.45,Math.PI,{seated:true,seat:false,tableHeight:1.505});person(-.4,-1.6,0,{seated:true,seat:false,tableHeight:1.505,color:'#7d695b'});break;
    case 8:person(-4.65,-2.45,.35,{color:'#607589'});person(-2.2,-2.8,-.5,{color:'#8b7b6a'});break;
    case 9:person(-2.6,-3,0,{seated:true,seat:false,tableHeight:1.385});papers(-1.2,1.42,-1.7);mug(-4,1.42,-1.4);pendant(-2.4,-1.55,2.6,4.0);break;
    case 10:person(2.5,-.78,0,{seated:true,seat:false,seatTop:.725,scale:.74,tie:false});person(-3.25,1.7,Math.PI,{color:'#7a8d80',tie:false,scale:.91});person(4.25,1.0,-.4,{color:'#997c6b',tie:false,scale:.9});bag(4.9,1.65);break;
    case 11:person(-3.2,-2.5,0,{seated:true,color:'#5a7479',scale:.94});mug(-4.1,1.56,-1.4);break;
    case 12:person(3.85,-.3,-.3,{color:'#648292',tie:false,scale:.9});bag(4.45,-.2);break;
    case 13:person(-3.35,-.35,Math.PI/2,{seated:true,seat:false,tableHeight:1.535});person(-3.35,1,Math.PI/2,{seated:true,seat:false,tableHeight:1.535});person(3.5,1,-Math.PI/2,{seated:true,seat:false,tableHeight:1.535,color:'#8d7865'});break;
    case 14:person(-.9,-1.4,.25,{color:'#9a9a76',tie:false});person(2.9,1.1,Math.PI,{seated:true,seat:false,scale:.7,color:'#667d74',tie:false});break;
    case 17:for(const chair of root.children.filter(o=>o.visible&&o.name==='upholstered-chair'))chair.rotation.y=Math.PI;
      for(const [x,z]of [[-4,1.6],[-2.8,3],[2.8,1.6],[4,3]])person(x,z,Math.PI,{seated:true,seat:false,seatTop:1.07,scale:.9});break;
    case 20:person(-3.7,.62,0,{seated:true,seat:false,seatTop:.79,scale:.8,tie:false});person(4.7,-.35,.3,{color:'#778f85',tie:false});person(4.9,2.3,-.1,{color:'#a58d77',tie:false,scale:.8});bag(4.25,2.6);break;
    case 21:for(const x of [-4.4,0,4.4]){person(x,-2.68,0,{seated:true,scale:.76,tie:false});mug(x+.3,1.01,-1.5);}break;
    case 22:person(3.45,-.3,-Math.PI/2,{seated:true,color:'#7c6a55'});person(-1.2,-2.3,.6,{seated:true,color:'#49616b'});break;
    case 23:environment.getObjectByName('full-size-park-bench').rotation.y=0;
      person(-3.2,-2.87,0,{seated:true,seat:false,seatTop:.79,scale:.75,tie:false,color:'#8b8871'});person(-1.8,-2.87,0,{seated:true,seat:false,seatTop:.79,scale:.75,tie:false,color:'#826f61'});break;
    case 26:person(-4.25,-1.05,Math.PI/2,{seated:true,seat:false,seatTop:1.07,scale:.81,tie:false});person(4.55,-1.05,-Math.PI/2,{seated:true,seat:false,seatTop:1.07,scale:.81,tie:false});person(.35,-3.6,.18,{color:'#9c8569',tie:false});break;
    case 28:{person(-3.7,-.85,Math.PI/2,{seated:true,seat:false,seatTop:.755,color:'#758783',scale:.91});
      const table=desk([-2.4,0,-.4],[1.05,1.36,1.05],'#9e744d');g.add(table);table.name='planning-document-side-table';papers(-2.4,1.46,-.4);break;}
    case 29:person(3.05,-.15,-.6,{color:'#9b876c',tie:false});person(2.8,1.45,.3,{color:'#687b79',tie:false});bag(3.9,1.65);break;
    case 30:person(-1.4,-3.78,0,{seated:true,scale:.88,color:'#6a8394'});person(4,-3.78,0,{seated:true,scale:.88,color:'#5d7d91'});person(-4.8,1.2,0,{seated:true,seat:false,seatTop:1.07,scale:.9,color:'#8b8978',tie:false});break;
    case 33:person(-4.8,-1.55,0,{seated:true,seat:false,seatTop:1.07,scale:.9,color:'#8b8b75',tie:false});person(2.6,-3.93,0,{color:'#dae4d9',tie:false,scale:.95});break;
    case 34:person(-4.3,-.25,Math.PI,{seated:true,scale:.9,color:'#647b79',tie:false});papers(-1.8,1.35,-1.55);break;
    case 36:person(0,-3.85,0,{seated:true,scale:.9,color:'#687f8b'});person(-4.5,.8,0,{seated:true,seat:false,seatTop:1.07,scale:.9,color:'#8f8470',tie:false});break;
  }
  let meshCount=0;g.traverse(object=>{if(object.isMesh){object.userData.populationPart=true;meshCount++;}});
  Object.assign(g.userData,{populationApplied:true,addedPeople:people,meshCount});return g;
}
