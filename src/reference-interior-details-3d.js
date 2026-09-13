import * as THREE from 'three';

// These details are physical objects at the same scale as the room. They leave
// the story props untouched: a contract stays unsigned and a phone unanswered.
export function addReferenceInteriorDetails({root,environment:g,cell,spec,box,cyl,ball,rod,mesh,group}){
  if(spec.space!=='interior')return;
  const detail=group(g,'reference-interior-craft');
  const B=(name,size,color,p,r,extra)=>box(detail,name,size,color,p,r,extra);
  const C=(name,a,b,h,color,p,r,extra)=>cyl(detail,name,a,b,h,color,p,r,extra);
  const R=(name,a,b,r,color)=>rod(detail,name,a,b,r,color);
  const wood=[22,23,25,26,27,28,34,35].includes(cell)?'#805336':'#a28863';
  const clinical=[18,33].includes(cell),utility=[8,15,32].includes(cell);
  const metal=clinical?'#638995':'#596b68';

  function point(name,p,color,power,distance=5){const light=new THREE.PointLight(color,power,distance,2);light.name=name;light.position.set(...p);detail.add(light);}
  function frame(name,x,y,z,w,h,color=wood){
    B(`${name}-recess`,[w+.16,h+.16,.10],'#514c42',[x,y,z]);
    for(const sign of [-1,1]){B(`${name}-wood-stile`,[.095,h+.15,.13],color,[x+sign*w/2,y,z+.08]);B(`${name}-wood-rail`,[w+.12,.085,.13],color,[x,y+sign*h/2,z+.08]);}
  }
  function bottle(parent,name,x,y,z,color='#93b7a6',scale=1){
    const a=group(parent,name,[x,y,z]);a.scale.setScalar(scale);
    cyl(a,'bottle-glazed-body',.12,.13,.38,color,[0,.19,0]);cyl(a,'bottle-neck',.055,.085,.085,color,[0,.423,0]);
    cyl(a,'bottle-pump-collar',.065,.065,.055,'#e3dcc4',[0,.482,0]);box(a,'bottle-pump-nozzle',[.17,.035,.045],'#e3dcc4',[.045,.517,0]);
    box(a,'bottle-paper-label',[.18,.14,.023],'#e6dec7',[0,.205,.117]);return a;
  }
  function mug(x,y,z,color='#e4d3b1'){
    C('mug-saucer',.2,.2,.024,color,[x,y,z]);C('mug-ceramic-wall',.14,.12,.25,color,[x,y+.14,z]);C('mug-dark-tea',.112,.112,.008,'#6d4e36',[x,y+.27,z]);
    mesh(detail,'mug-loop-handle',new THREE.TorusGeometry(.095,.023,6,14),color,[x+.145,y+.155,z]);
  }
  function pleatedCurtain(parent,name,width,height,p,color,yaw=0){
    const folds=Math.max(4,Math.round(width/.16)),shape=new THREE.Shape(),points=[];
    for(let i=0;i<=folds*4;i++){const x=-width/2+i*width/(folds*4);points.push([x,Math.cos(i*Math.PI/2)*.065]);}
    shape.moveTo(points[0][0],points[0][1]);for(const [x,y] of points.slice(1))shape.lineTo(x,y);
    for(const [x,y] of [...points].reverse())shape.lineTo(x,y+.022);shape.closePath();
    const panel=group(parent,name,p,yaw);
    mesh(panel,'continuous-pleated-curtain',new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1}),color,[0,height/2,0],[Math.PI/2,0,0],{pattern:'plaster',roughness:.98});
    rod(panel,'curtain-bottom-stitched-hem',[-width/2,-height/2+.1,.07],[width/2,-height/2+.1,.07],.014,color);
    for(let i=0;i<=folds;i++)mesh(panel,'curtain-hanging-ring',new THREE.TorusGeometry(.057,.013,5,10),metal,[-width/2+i*width/folds,height/2+.085,0],[0,Math.PI/2,0]);
    return panel;
  }
  function shelf(x,y,z,w=1.6){
    B('wall-mounted-wood-shelf',[w,.11,.52],wood,[x,y,z]);for(const sign of [-1,1]){R('shelf-triangular-bracket',[x+sign*w*.35,y-.43,z-.2],[x+sign*w*.35,y-.08,z+.16],.025,metal);B('shelf-wall-fixing',[.065,.42,.065],metal,[x+sign*w*.35,y-.24,z-.2]);}
  }
  function pendant(x,z,width=1.8,y=4.28){
    for(const dx of [-width*.33,width*.33])R('pendant-suspension-cable',[x+dx,4.67,z],[x+dx,y+.07,z],.014,metal);
    B('pendant-metal-housing',[width,.13,.29],metal,[x,y,z]);B('pendant-opal-diffuser',[width-.12,.026,.24],'#f4e6bd',[x,y-.08,z],null,{emissive:'#ffe3a5',emissiveIntensity:.6});
  }

  // A darker lower wall, raised trim and an edge cornice make depth legible
  // without adding a ceiling that would obstruct the orbit camera.
  const lower=clinical?'#a3c4c3':utility?cell===15?'#66827b':'#8c9999':cell===31?'#586b80':cell===11?'#796952':'#b7ab8c';
  if(![23,25,26].includes(cell))B('lower-wall-wainscot',[11.78,1.13,.035],lower,[0,.7,-4.319]);
  B('left-wall-wainscot',[.035,1.13,7.08],lower,[-5.877,.7,-.9]);
  for(const [name,y,h] of [['dado-rail',1.32,.075],['cornice-shadow-line',4.51,.055],['cornice-crown',4.62,.13]]){
    if(name!=='dado-rail'||![23,25,26].includes(cell))B(name,[11.85,h,.13],utility?'#a5a58b':wood,[0,y,-4.255]);B(`${name}-left`,[.13,h,7.14],utility?'#a5a58b':wood,[-5.81,y,-.9]);
  }
  B('left-skirting-trim',[.12,.16,7.05],wood,[-5.81,.09,-.9]);
  if(!utility&&!clinical)for(let z=-3.3;z<2.2;z+=1.2){B('left-panel-frame-upright',[.05,.89,.04],wood,[-5.846,.74,z]);}
  if(clinical){
    B('hospital-wall-protection-rail',[11.5,.17,.16],'#729c9e',[0,1.22,-4.21]);
    B('hospital-skirt-hygiene-cove',[11.82,.24,.15],'#86aaa9',[0,.13,-4.22]);
  }

  const windows=[];g.traverse(o=>{if(o.name==='dimensional-window-glass')windows.push(o);});
  for(const glass of windows){
    const {width:w,height:h}=glass.geometry.parameters,{x,y,z}=glass.position;
    // Deep side jambs, gasket and sill lips cast shadows onto the glazing.
    for(const sign of [-1,1]){
      B('window-deep-jamb',[.14,h+.22,.24],wood,[x+sign*(w/2+.07),y,z+.04]);
      B('window-upper-lower-frame',[w+.3,.11,.24],wood,[x,y+sign*h/2,z+.04]);
      B('window-glazing-gasket',[.023,h,.045],'#3d514f',[x+sign*(w/2-.09),y,z+.105]);
    }
    B('window-sill-rounded-lip',[w+.36,.075,.13],'#c5ab83',[x,y-h/2-.10,z+.25]);
    B('window-mid-crossbar',[w,.065,.08],wood,[x,y+.22,z+.12]);
    for(const dx of [-.085,.085]){B('window-lock-base',[.045,.17,.035],metal,[x+dx,y-.25,z+.15]);R('window-opening-handle',[x+dx,y-.25,z+.2],[x+dx,y-.1,z+.2],.02,metal);}
    if([18,25,26,27,28,35].includes(cell)){
      R('curtain-pole',[x-w/2-.23,y+h/2+.18,z+.28],[x+w/2+.23,y+h/2+.18,z+.28],.026,metal);
      for(const sign of [-1,1])pleatedCurtain(detail,'gathered-window-curtain',.48,h+.11,[x+sign*(w/2-.12),y-.035,z+.25],clinical?'#b7d0cb':cell===25?'#ba864f':'#b29b76');
    }
  }

  if([1,9,25,26,27,28,34,35].includes(cell)){
    const books=[];g.traverse(o=>{if(o.name==='individual-book')books.push(o);});
    for(const [i,book] of books.entries()){
      if(!book.visible)continue;
      const {width,depth}=book.geometry.parameters,height=book.geometry.parameters.height*book.scale.y,p=book.position;
      if(i%3!==0){B('book-spine-title-label',[width*.73,.095,.014],i%2?'#dbc69b':'#d7d6b4',[p.x,p.y+height*.1,p.z+depth/2+.009]);}
      if(i%4===0)for(const dy of [-height*.33,height*.33])B('book-spine-gilt-rule',[width*.92,.017,.014],'#cfb47a',[p.x,p.y+dy,p.z+depth/2+.01]);
    }
  }

  if([4,6,9,13].includes(cell)){
    for(const x of cell===13?[-2,2.15]:cell===6?[.2,2.5]:[-3.65,-1.5]){
      const y=cell===4||cell===9?1.42:1.56,z=cell===13?-.45:cell===6?.12:-1.65;
      mug(x+.38,y,z+.38);B('meeting-felt-desk-pad',[.95,.02,.71],'#61756c',[x,y-.008,z]);
      R('resting-meeting-pencil',[x-.42,y+.035,z-.18],[x-.42,y+.035,z+.24],.018,'#ceb380');
      B('closed-meeting-notebook',[.6,.065,.58],'#8c9e88',[x,y+.04,z]);B('notebook-page-block',[.55,.031,.54],'#e2d6b8',[x+.01,y+.076,z]);
    }
    B('meeting-service-credenza',[2.4,.98,.72],wood,[-4.5,.49,-2.93]);B('credenza-stone-top',[2.5,.09,.8],'#c5b79b',[-4.5,1.02,-2.93]);
    for(const x of [-5.06,-3.94]){B('credenza-inset-door',[1.07,.78,.045],'#947650',[x,.5,-2.55]);R('credenza-brass-handle',[x+.35,.4,-2.49],[x+.35,.64,-2.49],.018,'#c1b084');}
    bottle(detail,'meeting-water-carafe',-4.8,1.07,-2.9,'#a4c3ba',1.3);mug(-4.1,1.075,-2.85);
    if(cell===4||cell===9)pendant(-2.5,-1.6,2.65);
  }
  if(cell===6||cell===13){
    const lights=[];g.traverse(o=>{if(o.name==='suspended-meeting-light')lights.push(o);});for(const light of lights)for(const dx of [-.65,.65])R('meeting-light-actual-suspension',[light.position.x+dx,4.68,light.position.z],[light.position.x+dx,4.52,light.position.z],.013,metal);
    if(cell===6){B('presentation-projector-body',[.69,.2,.62],'#8e9690',[.5,4.25,-.3]);R('projector-ceiling-mount',[.5,4.7,-.3],[.5,4.32,-.3],.045,metal);C('projector-lens',.082,.082,.09,'#748f94',[.5,4.24,-.65],[Math.PI/2,0,0]);}
    if(cell===13){shelf(3.5,1.2,-3.95,2.2);for(let i=0;i<5;i++)B('review-project-binder',[.2,.66,.39],i%2?'#8b9b86':'#b2a380',[2.77+i*.25,1.585,-3.94]);}
  }
  if(cell===11){
    B('server-cable-tray',[5.2,.1,.39],'#394d54',[2,4.03,-3.51]);for(let i=0;i<8;i++)R('rack-patch-cable',[.05+i*.59,3.87,-3.5],[.05+i*.59,3.55,-2.88],.019,i%2?'#9b8555':'#5e8b8d');
    B('server-floor-cable-cover',[.26,.045,3.6],'#52696b',[.0,.052,-1.38]);pendant(-2.6,-1.2,2.3);
    shelf(-4.7,1.01,-3.93,1.55);for(let i=0;i<4;i++)B('incident-runbook',[.25,.54,.39],i%2?'#858f77':'#b2996e',[-5.2+i*.3,1.34,-3.92]);
    B('desktop-mouse-mat',[.54,.025,.63],'#394f58',[2.09,1.558,.88]);ball(detail,'computer-mouse',[.105,.055,.16],'#718c8d',[2.08,1.63,.9]);
    for(let row=0;row<3;row++)for(let col=0;col<8;col++)B('diagnostic-keyboard-key',[.085,.016,.065],'#bac2b7',[.7+col*.13,1.62,.68+row*.13]);
  }
  if(cell===15){
    // A narrow shower bay, exposed fittings and asymmetric storage follow the
    // rental-bathroom reference, while preserving the toothpaste/water cue.
    const oldTiles=[];root.traverse(o=>{if(o.name==='ceramic-wall-tile')oldTiles.push(o);});for(const tile of oldTiles)tile.visible=false;
    for(let row=0;row<6;row++)for(let col=0;col<11;col++)B('aged-ceramic-wall-tile',[1.04,.68,.03],(col+row*3)%7===0?'#b3b095':'#c9c6a6',[-5.25+col*1.05,.45+row*.69,-4.265]);
    const oldCurtain=g.getObjectByName('hospital-privacy-curtain');if(oldCurtain)oldCurtain.visible=false;
    R('shower-curtain-rail',[-3.65,4,-3.7],[-3.65,4,-1.78],.032,metal);pleatedCurtain(detail,'rental-shower-curtain',1.52,3.03,[-3.65,2.32,-2.78],'#688b91',Math.PI/2);
    B('shower-tray',[1.53,.12,1.9],'#9bafa2',[-4.55,.06,-2.84]);B('shower-step',[1.64,.15,.13],'#b4b79a',[-4.54,.12,-1.84]);
    B('shower-floor-drain',[.2,.024,.2],'#556d68',[-4.6,.135,-2.37]);for(let i=0;i<4;i++)B('drain-slot',[.14,.006,.012],'#293f40',[-4.6,.151,-2.425+i*.035]);
    B('bathroom-vent-frame',[.85,.75,.11],'#737e6c',[3.3,3.8,-4.19]);for(let i=0;i<6;i++)B('vent-louver',[.71,.05,.065],'#374e4e',[3.3,3.52+i*.1,-4.1],[.2,0,0]);
    for(const x of [.45,1.87]){B('vanity-raised-door-frame',[1.34,1.31,.057],'#668d7e',[x,.79,-2.18]);B('vanity-recessed-door-panel',[1.15,1.06,.027],'#90ad97',[x,.79,-2.143]);R('vanity-drawer-handle',[x+.35,.94,-2.07],[x+.35,1.19,-2.07],.023,'#b6bda3');}
    shelf(4.51,1.04,-3.7,1.5);shelf(4.51,2.86,-3.7,1.5);bottle(detail,'shampoo-on-shelf',4.2,2.92,-3.64,'#96b7ac');bottle(detail,'soap-on-shelf',4.8,2.92,-3.64,'#b28074',.84);
    C('toothbrush-cup',.15,.13,.26,'#bea982',[2.35,1.85,-3.04]);for(let i=0;i<3;i++){R('toothbrush-handle',[2.28+i*.065,1.92,-3.03],[2.24+i*.075,2.31,-3.01],.018,['#618e76','#a36758','#dad2b5'][i]);B('toothbrush-bristles',[.055,.09,.027],'#e7e1c8',[2.24+i*.075,2.33,-2.995]);}
    for(let i=0;i<5;i++)B('towel-hanging-fold',[.045,.79,.08],i%2?'#c8a368':'#dab980',[3.67+i*.15,1.77,-3.52]);
    const basket=root.getObjectByName('laundry-basket');if(basket)basket.visible=false;
    B('laundry-basket-bottom',[.96,.065,.87],'#937e57',[3.9,.07,-1.74]);
    for(const sign of [-1,1]){
      for(let i=0;i<7;i++)B('basket-vertical-wicker',[.048,.66,.038],'#b19d70',[3.51+i*.13,.4,-1.74+sign*.42]);
      for(let i=0;i<6;i++)B('basket-side-wicker',[.038,.66,.048],'#b19d70',[3.9+sign*.46,.4,-2.1+i*.14]);
      for(const y of [.16,.37,.59,.75]){B('basket-horizontal-wicker',[.99,.035,.05],'#9b885e',[3.9,y,-1.74+sign*.42]);B('basket-side-woven-band',[.055,.035,.88],'#9b885e',[3.9+sign*.46,y,-1.74]);}
    }
    B('laundry-folded-linen',[.67,.12,.53],'#bfc5ab',[3.9,.26,-1.74]);
    // Small chipped glaze patches sit near wet corners rather than repeating
    // across every tile. This is a worn rental room, not a uniform new clinic.
    for(let i=0;i<14;i++){const x=-4.98+(i%5)*.27,y=.42+Math.floor(i/5)*.68;B('bathroom-chipped-glaze',[.06+(i%3)*.032,.025+(i%4)*.023,.008],'#9eab91',[x,y,-4.244]);}
    for(const x of [-.5,.05]){ball(detail,'bathroom-slipper-sole',[.21,.052,.38],'#ae9a70',[x,.085,-.65]);ball(detail,'bathroom-slipper-strap',[.2,.10,.17],'#c1ad81',[x,.16,-.76]);}
    point('bathroom-mirror-warm-light',[1.1,4.0,-3.52],'#ffd9a1',13,6);
  }
  if(cell===18){
    const old=g.getObjectByName('hospital-privacy-curtain');if(old)old.visible=false;
    R('hospital-curved-curtain-track',[4.35,4.32,-4.08],[4.35,4.32,-1.4],.037,'#96aba8');pleatedCurtain(detail,'hospital-privacy-fabric',2.45,3.35,[4.35,2.51,-2.85],'#8bafb2',Math.PI/2);
    for(const z of [-2.62,.85]){
      B('hospital-bed-moulded-endboard',[2.36,.67,.13],'#719da6',[1.5,1.18,z]);B('bed-endboard-inset',[2.03,.42,.045],'#c0d4cb',[1.5,1.21,z+.087]);B('bed-endboard-carry-handle',[.58,.11,.025],'#658b94',[1.5,1.35,z+.117]);
    }
    for(const x of [.37,2.63]){R('bed-safety-rail',[x,1.38,-2.22],[x,1.38,.18],.038,'#96b4b0');for(const z of [-2.2,-1.4,-.6,.15])R('bed-rail-upright',[x,.79,z],[x,1.38,z],.027,'#96b4b0');}
    // Quilting stays on the blanket's upper face, away from the patient's head.
    for(let i=0;i<5;i++)B('blanket-quilt-seam',[2.01,.014,.021],'#7aa4ae',[1.5,1.264,-1.06+i*.38]);
    const cart=group(detail,'medical-supply-trolley',[4.53,0,.27]);
    for(const y of [.34,1.39]){box(cart,'trolley-tray',[1.25,.08,.86],'#a6bfc0',[0,y,0]);for(const z of [-.41,.41])box(cart,'trolley-tray-rim',[1.25,.10,.045],'#6f999d',[0,y+.08,z]);}
    for(const x of [-.54,.54])for(const z of [-.34,.34]){rod(cart,'trolley-upright',[x,.12,z],[x,1.61,z],.031,'#658f95');cyl(cart,'trolley-caster',.09,.09,.067,'#425f6a',[x,.1,z],[0,0,Math.PI/2]);}
    bottle(cart,'trolley-disinfectant',-.34,1.44,-.05,'#659e9b');bottle(cart,'trolley-saline',.28,1.44,-.11,'#a8c9ce',.85);
    box(cart,'sterile-dressing-box',[.55,.22,.46],'#e2e8d2',[.22,.5,0]);box(cart,'sealed-medical-container',[.44,.42,.34],'#c8b475',[-.33,.59,.02]);
    B('hospital-headwall-service',[2.6,.3,.15],'#e6e7d1',[1.6,2.67,-4.13]);for(const x of [.65,1.15,1.65])C('headwall-outlet',.061,.061,.035,x===1.15?'#ba936a':'#77a6a6',[x,2.67,-4.02],[Math.PI/2,0,0]);
    pendant(.5,-1.55,2.8);point('bedside-soft-lamp',[1.3,3.8,-2.2],'#dae9db',8,6);
  }
  if(cell===22){
    // Cloth has a turned edge and separate place settings, not a featureless disc.
    for(let i=0;i<24;i++){const a=i*Math.PI/12;R('banquet-cloth-fold',[.7+Math.sin(a)*1.91,1.45,-.1+Math.cos(a)*1.91],[.7+Math.sin(a)*2.02,1.25,-.1+Math.cos(a)*2.02],.021,'#cfc1a0');}
    C('banquet-glass-lazy-susan',.92,.92,.045,'#c8d3bc',[.7,1.662,-.1],null,{roughness:.24,metalness:.12});C('banquet-center-vase',.19,.14,.37,'#ba9b69',[.7,1.87,-.1]);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5,x=.7+Math.sin(a)*1.54,z=-.1+Math.cos(a)*1.54;B('folded-banquet-napkin',[.24,.045,.31],'#bd956e',[x,1.706,z],[0,-a,0]);R('banquet-chopstick',[x-.32,1.68,z-.15],[x-.32,1.68,z+.22],.012,'#8b6b45');R('banquet-chopstick',[x-.28,1.68,z-.15],[x-.28,1.68,z+.22],.012,'#8b6b45');}
    for(const x of [-4.7,4.7])for(let i=0;i<12;i++){const a=i*Math.PI/6;R('column-fine-fluting',[x+Math.sin(a)*.285,.22,-3.68+Math.cos(a)*.285],[x+Math.sin(a)*.285,4.2,-3.68+Math.cos(a)*.285],.017,'#cfb280');}
    point('banquet-chandelier-light',[.7,3.8,-.6],'#ffd49b',16,7);
  }
  if([25,34].includes(cell)){
    const x=cell===25?-2.7:-3,y=cell===25?1.37:1.36,z=cell===25?-1.65:-1.8;
    B('desk-drawer-pedestal',[.92,1.13,1.44],wood,[x+1.04,.575,z]);for(let i=0;i<3;i++){B('study-drawer-front',[.81,.32,.055],'#9a7049',[x+1.04,.23+i*.34,z+.75]);B('study-drawer-pull',[.27,.055,.06],'#c8b58a',[x+1.04,.25+i*.34,z+.8]);}
    C('articulated-lamp-foot',.23,.23,.045,'#5e765a',[x-.94,y+.04,z-.27]);R('reading-lamp-lower-arm',[x-.94,y+.05,z-.27],[x-.66,y+.76,z-.4],.035,'#647752');R('reading-lamp-upper-arm',[x-.66,y+.76,z-.4],[x-1.12,y+1.13,z-.29],.035,'#647752');
    for(const [dx,dy,dz] of [[-.94,.12,-.27],[-.66,.76,-.4],[-1.12,1.13,-.29]])C('desk-lamp-pivot',.065,.065,.07,'#b7ad76',[x+dx,y+dy,z+dz],[Math.PI/2,0,0]);
    C('reading-lamp-shade',.12,.31,.27,'#657b4e',[x-1.12,y+1.06,z-.29]);C('reading-lamp-diffuser',.285,.285,.018,'#f2e1a9',[x-1.12,y+.916,z-.29],null,{emissive:'#ffdd90',emissiveIntensity:.65});
    mug(x+.17,y+.01,z+.48);C('study-pencil-pot',.13,.11,.25,'#927551',[x+1.3,y+.15,z-.36]);for(let i=0;i<4;i++)R('study-pencil',[x+1.24+i*.045,y+.23,z-.36],[x+1.21+i*.055,y+.63-i*.03,z-.36],.013,i%2?'#727f58':'#b07e46');
    frame('study-pinned-noticeboard',-5.26,3.78,-4.2,.75,1.01);B('study-cork-board',[.65,.91,.025],'#ad8352',[-5.26,3.78,-4.11]);for(let i=0;i<3;i++){B('study-pinned-note',[.19,.26,.019],i%2?'#c7d4bd':'#e6d4a8',[-5.44+(i%2)*.31,3.54+Math.floor(i/2)*.35,-4.082],[0,0,(i-1)*.08]);C('notice-pin',.017,.017,.014,'#936b4b',[-5.44+(i%2)*.31,3.65+Math.floor(i/2)*.35,-4.063],[Math.PI/2,0,0]);}
    point('study-reading-lamp-pool',[x-1.12,y+.82,z-.29],'#ffd69a',11,4.3);
    if(cell===25){
      for(let i=0;i<6;i++)B('study-partly-raised-wood-blind',[3.2,.09,.08],'#88613f',[-3.68,3.37+i*.13,-4.005],[.28,0,0]);
      const tree=g.getObjectByName('landscape-tree');if(tree){
        for(const part of tree.children)if(part.name==='tree-leaf-volume')part.visible=false;
        const leafGeometry=new THREE.IcosahedronGeometry(.21,0);
        for(let i=0;i<42;i++){
          const a=i*2.399,r=.33+(i%5)*.13,y=2.15+Math.floor(i/9)*.23;
          const leaf=mesh(tree,'study-autumn-leaf-cluster',leafGeometry,['#d49b36','#bf7730','#b1ad4d','#ddb451'][i%4],[Math.sin(a)*r,y,Math.cos(a)*r]);leaf.scale.setScalar(.9+(i%3)*.12);leaf.scale.y*=.55;
        }
      }
    }
  }
  if(cell===27||cell===28){
    for(const x of cell===27?[-3.6,3.8]:[-3.75,3.72]){
      const z=cell===27?.4:-1.05;
      B('lounge-upholstery-inset',[.96,.035,.84],'#b08760',[x,.89,z]);for(const dx of [-.46,.46])R('lounge-leather-piping',[x+dx,.925,z-.36],[x+dx,.925,z+.37],.018,'#725033');
      B('lounge-tailored-cushion',[.63,.44,.16],'#c5ae81',[x,1.29,z-.26],[0,0,x<0?-.12:.12]);
    }
    if(cell===27){B('offer-leather-writing-pad',[1.52,.016,1.35],'#766d50',[-.2,1.525,-.16]);}
    C('lounge-floor-lamp-base',.31,.31,.07,'#756548',[-5.1,.04,.35]);R('lounge-floor-lamp-stem',[-5.1,.08,.35],[-5.1,2.75,.35],.035,'#b8a374');C('lounge-linen-lampshade',.32,.48,.63,'#d3bb90',[-5.1,2.7,.35]);
    point('lounge-lamp-pool',[-5.1,2.37,.35],'#ffd79e',12,5);
  }
  if(cell===31){
    pendant(.8,-.1,2.4);B('hr-desk-blotter',[1.1,.014,1.12],'#657a78',[-.75,1.542,.3]);
    for(const x of [3.42,4.5]){B('archive-label-holder',[.5,.16,.036],'#859691',[x,2.48,-3.075]);B('archive-blank-label',[.43,.11,.016],'#e1ddc5',[x,2.48,-3.05]);}
    B('hr-calendar-stand',[.72,.06,.51],'#827b63',[2.18,1.58,-.83]);B('hr-desk-calendar',[.67,.48,.04],'#dfd9be',[2.18,1.82,-.82],[-.12,0,0]);for(let i=0;i<12;i++)B('calendar-day-square',[.058,.049,.012],i===6?'#aa9470':'#929f92',[1.97+(i%4)*.14,1.67+Math.floor(i/4)*.1,-.765]);
    B('open-box-folded-top-flap',[1.35,.045,.49],'#bda27c',[3.63,1.11,1.9],[.45,0,0]);
  }
  if(cell===33){
    for(const x of [-4.8,-3.55,-2.3])B('waiting-chair-base-joining-bar',[1.29,.07,.11],'#6b9399',[x,.53,-1.72]);
    B('clinic-leaflet-holder',[.88,.76,.16],'#78a1a5',[-1.05,2.08,-4.11]);for(let i=0;i<3;i++)B('folded-health-leaflet',[.2,.42,.042],i%2?'#d9d8bc':'#b6cfc7',[-1.34+i*.28,2.23,-3.99]);
    bottle(detail,'clinic-hand-sanitizer',4.68,1.46,-2.68,'#93b4a2',1.1);pendant(-1.4,-.1,2.3);
  }
  if(cell===35){
    B('sofa-draped-wool-throw',[.8,.08,1.1],'#91a18d',[-2.85,.842,-2.48]);for(let i=0;i<6;i++)R('blanket-fringe',[-3.17+i*.12,.82,-1.93],[-3.17+i*.12,.68,-1.88],.011,'#bab98f');
    for(let i=0;i<3;i++)B('home-sofa-seat-seam',[.025,.016,1.01],'#8e785c',[-2.1+i*1.33,.8,-2.52]);point('home-reading-glow',[3,2.5,-2.85],'#ffd7a1',12,5);
  }
  if(cell===5){
    for(let i=0;i<4;i++){const x=-4.08+i*1.38;B('pantry-recessed-door',[1.24,1.01,.04],'#9aa687',[x,.68,-2.315]);R('pantry-brushed-handle',[x+.43,.79,-2.24],[x+.43,1.02,-2.24],.02,'#c4c7ad');}
    for(const x of [-1.45,-.93])mug(x,1.395,-2.65);shelf(-2,3.0,-4.02,4.8);for(let i=0;i<4;i++)C('pantry-storage-jar',.17,.17,.44,i%2?'#c4bb91':'#8eae9d',[-3.45+i*.64,3.28,-3.96]);
    pendant(-2,-2.6,2.2);
  }
  detail.userData.referenceCraftRevision=2;
  // Only the immutable dressing is instanced. Original named parts remain as
  // hidden inspection anchors; story actors and their update clock are outside
  // this subtree, so their independently animated materials stay independent.
  root.updateMatrixWorld(true);
  const inverse=detail.matrixWorld.clone().invert(),batches=new Map();
  detail.traverse(part=>{
    if(!part.isMesh||!part.visible||part.material.transparent||Array.isArray(part.material))return;
    const key=`${part.geometry.uuid}:${part.material.uuid}`;
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(part);
  });
  for(const parts of batches.values()){
    if(parts.length<4)continue;
    const first=parts[0],batch=new THREE.InstancedMesh(first.geometry,first.material,parts.length);
    batch.name=`instanced-interior-${first.name}`;batch.castShadow=true;batch.receiveShadow=true;
    for(const [i,part] of parts.entries()){batch.setMatrixAt(i,new THREE.Matrix4().multiplyMatrices(inverse,part.matrixWorld));part.visible=false;}
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();batch.userData.referenceStaticInstances=parts.map(part=>part.name);detail.add(batch);
  }
}
