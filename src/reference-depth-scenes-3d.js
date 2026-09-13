import * as THREE from 'three';

// Reference-specific set dressing. These objects are all inside the static
// environment subtree, so the scene can batch them without freezing actors.
export function addReferenceDepthScenes({root,environment,cell,box,cyl,rod,mesh,group}){
  if(![8,10,14,16,23,25,26].includes(cell))return;
  const g=group(environment,'reference-depth-craft');
  const B=(name,size,color,p,r,extra)=>box(g,name,size,color,p,r,extra);
  const C=(name,a,b,h,color,p,r,extra)=>cyl(g,name,a,b,h,color,p,r,extra);
  const R=(name,a,b,r,color)=>rod(g,name,a,b,r,color);
  const leafGeometry=new THREE.IcosahedronGeometry(1,0);
  const roundGeometry=new THREE.SphereGeometry(1,12,8);
  const hide=name=>{const list=[];environment.traverse(o=>{if(o.name===name)list.push(o);});for(const o of list)o.visible=false;};
  function oval(name,size,color,p){const o=mesh(g,name,roundGeometry,color,p);o.scale.set(...size);return o;}
  function sprig(x,y,z,s=1,autumn=false,flowers=false){
    R('garden-branch',[x,y,z],[x+.06*s,y+.74*s,z],.025*s,'#675b3f');
    for(let i=0;i<12;i++){
      const a=i*2.399,px=x+Math.sin(a)*(.17+(i%3)*.05)*s,py=y+.22*s+(i%4)*.16*s,pz=z+Math.cos(a)*.28*s;
      const o=mesh(g,'layered-garden-leaf',leafGeometry,(autumn?['#ab7030','#d5a443','#a7a044']:['#4e713d','#739545','#a1b15a'])[i%3],[px,py,pz]);o.scale.set(.2*s,.1*s,.3*s);o.rotation.set(.2,a,.35);
      if(flowers&&i%4===0)oval('garden-small-flower',[.075*s,.06*s,.075*s],i%2?'#cfacbc':'#e9d59b',[px,py+.12*s,pz]);
    }
  }
  function planter(x,z,w=1.6,s=1,autumn=false){
    B('garden-wood-planter',[w,.5,.74],'#97704a',[x,.26*s,z],null,{pattern:'wood'});
    B('planter-dark-soil',[w-.12,.025,.6],'#55563a',[x,.52*s,z]);
    for(const dz of [-.38,.38]){B('planter-timber-rim',[w+.1,.09,.07],'#bf995f',[x,.55*s,z+dz]);for(let i=0;i<Math.floor(w/.23);i++)B('planter-raised-stave',[.16,.42,.025],'#ac8150',[x-w/2+.13+i*.23,.26*s,z+dz]);}
    for(let i=0;i<Math.floor(w/.52);i++)sprig(x-w/2+.3+i*.53,.55*s,z,.8,autumn,true);
  }
  function lantern(x,y,z){
    B('garden-lantern-foot',[.42,.12,.4],'#61726a',[x,y,z]);
    B('garden-lantern-opal',[.3,.42,.29],'#efd199',[x,y+.29,z],null,{emissive:'#ffd291',emissiveIntensity:.35});
    for(const dx of [-.17,.17])for(const dz of [-.17,.17])B('lantern-corner-bar',[.038,.47,.038],'#69684f',[x+dx,y+.3,z+dz]);
    C('garden-lantern-pitched-cap',0,.37,.21,'#687468',[x,y+.63,z],[0,Math.PI/4,0]);
  }
  function cup(x,y,z){C('tea-cup-saucer',.18,.18,.02,'#d6d4b5',[x,y,z]);C('tea-cup-porcelain',.12,.09,.15,'#e0dcc0',[x,y+.09,z]);C('tea-in-porcelain',.1,.1,.008,'#76633e',[x,y+.168,z]);}
  function table(x,z,r=.7){C('garden-round-wood-tabletop',r,r,.09,'#ad7f49',[x,1.04,z],null,{pattern:'wood'});R('round-table-central-leg',[x,.05,z],[x,1.0,z],.068,'#815d3a');for(let i=0;i<3;i++){const a=i*Math.PI*2/3;R('round-table-tripod',[x,.36,z],[x+Math.sin(a)*r*.75,.05,z+Math.cos(a)*r*.75],.05,'#815d3a');}}
  function stool(x,z,y=.6){B('timber-stool-seat',[.52,.08,.48],'#b7905e',[x,y,z]);for(const dx of [-.2,.2])for(const dz of [-.18,.18])B('stool-timber-leg',[.065,y,.065],'#926e44',[x+dx,y/2,z+dz]);}

  if(cell===8){
    // The reference is a worn stair landing: framed fire door, metal fittings,
    // stair nosings and a separate ash receptacle give the grey room a purpose.
    for(const x of [-4.73,-2.57])B('fire-door-steel-jamb',[.13,3.78,.22],'#546373',[x,1.89,-4.1]);
    B('fire-door-steel-header',[2.25,.13,.22],'#546373',[-3.65,3.79,-4.1]);
    B('fire-door-vision-recess',[.43,1.06,.05],'#414e60',[-3.1,2.73,-4.065]);B('fire-door-vision-glass',[.29,.9,.03],'#507182',[-3.1,2.73,-4.026]);
    B('fire-door-bottom-kickplate',[1.87,.44,.045],'#65727b',[-3.65,.27,-4.072]);
    for(const y of [.53,1.82,3.1])C('fire-door-hinge',.045,.045,.16,'#b1aea0',[-2.67,y,-4.04]);
    B('fire-door-safety-placard',[.6,.45,.065],'#af5b4c',[-5.13,2.57,-4.22]);for(let i=0;i<3;i++)B('placard-short-letter-line',[.39,.035,.015],'#e8dbb9',[-5.13,2.69-i*.11,-4.175]);
    for(let i=0;i<8;i++){const z=3.16-i*.6,y=.2*(i+1);B('stair-nosing-stone-edge',[4.09,.034,.1],'#cbc6b1',[2.05,y+.022,z]);for(const dz of [-.045,-.105])B('stair-anti-slip-strip',[3.96,.012,.022],'#687b7f',[2.05,y+.045,z+dz]);}
    B('stair-landing-wall-base',[4.1,.28,.14],'#74818a',[2.05,1.75,-4.24]);
    B('stairwell-metal-ash-receptacle',[.56,.91,.53],'#647482',[-1.01,.46,-3.17]);B('ash-receptacle-top',[.65,.07,.61],'#a6a79b',[-1.01,.96,-3.17]);C('ash-receptacle-well',.22,.22,.018,'#384951',[-1.01,1.01,-3.17]);
    for(const x of [-1.23,-.79])B('ash-receptacle-front-flute',[.036,.73,.025],'#819098',[x,.45,-2.891]);
    B('landing-bulletin-timber-frame',[1.26,.91,.11],'#8c7256',[-5.09,1.13,-4.16]);B('landing-posted-paper',[1.08,.74,.026],'#d2c9aa',[-5.09,1.13,-4.086]);
    for(let i=0;i<4;i++)B('posted-notice-line',[.71-(i%2)*.13,.032,.014],'#8d8d7b',[-5.11,1.35-i*.13,-4.065]);
    sprig(-5.2,.58,-3.29,.77);C('stairwell-plant-pot',.29,.22,.56,'#9c7652',[-5.2,.28,-3.29]);
  }
  if(cell===10){
    for(const x of [-5,0,5]){B('station-column-footplate',[.49,.08,.43],'#66858c',[x,.05,-1.1]);B('station-i-beam-web',[.09,.33,3.8],'#768b87',[x,4.35,-2.05]);for(const y of [4.17,4.53])B('station-i-beam-flange',[.38,.065,3.8],'#a3b6ad',[x,y,-2.05]);R('station-diagonal-brace',[x,3.55,-1.1],[x,4.3,-2.08],.04,'#719092');}
    B('station-canopy-longitudinal-beam',[10.5,.15,.19],'#839a91',[0,4.42,-3.78]);
    for(const x of [-3.3,2.4]){B('platform-suspended-light',[1.8,.1,.23],'#c4d7ce',[x,4.1,-2.1]);B('platform-light-diffuser',[1.67,.028,.18],'#e3eee0',[x,4.031,-2.1],null,{emissive:'#d9ecda',emissiveIntensity:.45});}
    for(let i=0;i<24;i++)for(const dz of [-.17,0,.17])C('platform-tactile-warning-dot',.038,.038,.012,'#c2a956',[-5.6+i*.48,.227,-1.83+dz]);
    B('train-lower-undercarriage',[10.5,.35,1.22],'#425863',[.25,.61,-3.05]);B('train-roof-ridge',[8.7,.06,.93],'#c1d4d4',[-.6,2.175,-3.05]);
    for(const x of [-3.53,.83,3.06]){B('train-door-outline',[.75,1.33,.065],'#7397a9',[x,1.39,-2.105]);B('train-door-white-inset',[.66,1.25,.031],'#d6e4df',[x,1.4,-2.063]);B('train-door-glass',[.38,.55,.025],'#345e76',[x,1.68,-2.039]);B('train-door-bottom-blue-band',[.67,.17,.028],'#497da0',[x,1.19,-2.034]);}
    oval('train-cockpit-windscreen',[.68,.33,.67],'#355f75',[5.55,1.74,-2.95]);
    for(let i=0;i<3;i++){const x=-4.3+i*.85;B('ticket-gate-steel-top',[.62,.08,1.38],'#c0cbc0',[x,1.25,.3]);B('ticket-gate-reader-screen',[.25,.06,.27],'#315f79',[x,1.32,.65],[-.28,0,0]);B('ticket-gate-blue-glass-flap',[.27,.73,.06],'#61a9b3',[x+.36,.71,.17],null,{transparent:true,opacity:.62,roughness:.25});B('ticket-gate-status-strip',[.04,.39,.023],'#8ad4a1',[x,1.0,1.01],null,{emissive:'#7ed89a',emissiveIntensity:.32});}
    for(const x of [-4.97,-1.91])B('station-departure-sign-post',[.13,3.7,.15],'#536c76',[x,1.85,-.8]);
    B('station-departure-board-frame',[3.44,.87,.18],'#48616d',[-3.45,3.3,-.8]);B('station-departure-black-display',[3.2,.67,.05],'#273c46',[-3.45,3.3,-.685]);
    for(let row=0;row<3;row++)for(let j=0;j<7;j++)B('departure-board-led-group',[.2+(j%2)*.08,.05,.015],row===0?'#dca16a':'#d6c274',[-4.72+j*.41,3.51-row*.2,-.65]);
    for(const x of [2.5,3.23,3.96]){B('station-waiting-seat',[.67,.09,.69],'#869fac',[x,.68,-.77]);B('station-waiting-seat-back',[.67,.61,.09],'#9eb1b6',[x,1.03,-1.07],[-.1,0,0]);}R('station-seat-joining-frame',[2.17,.48,-.79],[4.3,.48,-.79],.055,'#586e75');for(const x of [2.5,3.95])R('station-seat-foot',[x,0,-.79],[x,.64,-.79],.06,'#617981');
    planter(5.22,-.44,.95);planter(-5.35,1.47,.87);
  }
  if(cell===14){
    B('bun-shop-timber-countertop',[6.99,.12,1.28],'#be8d4a',[0,1.21,-2.64],null,{pattern:'wood'});
    for(let i=0;i<13;i++)B('bun-counter-raised-timber-panel',[.45,.87,.045],i%3?'#bd8a4d':'#ac783f',[-3.04+i*.505,.67,-2.07]);
    for(const x of [-3.34,3.34])B('shop-open-window-timber-post',[.18,2.32,.19],'#92643d',[x,2.36,-3.08]);
    B('shop-service-recess-shadow',[6.2,1.73,.1],'#514d38',[0,2.34,-3.11]);
    for(const y of [1.6,2.48])B('bun-shop-kitchen-shelf',[5.4,.09,.38],'#8e7048',[0,y,-2.98]);
    for(let i=0;i<8;i++){const x=-2.3+i*.65;C('kitchen-spice-jar',.13,.14,.31,i%3?'#aca47b':'#938e6b',[x,2.68,-2.94]);C('kitchen-jar-lid',.14,.14,.04,'#756444',[x,2.86,-2.94]);}
    C('bun-shop-iron-griddle',.78,.78,.12,'#3b4d49',[-.6,1.33,-2.42]);
    for(let i=0;i<12;i++){const a=i*2.399,r=.19+(i%3)*.2,x=-.6+Math.sin(a)*r,z=-2.42+Math.cos(a)*r;oval('griddle-golden-pan-fried-bun',[.14,.09,.13],i%2?'#dcba75':'#e6cd92',[x,1.465,z]);for(let j=0;j<2;j++)B('bun-chopped-scallion',[.018,.008,.04],'#668444',[x+.025*j,1.55,z+.023*j],[0,.8*j,0]);}
    for(let level=0;level<3;level++){C('bamboo-steamer-layer',.4,.4,.19,'#bc9252',[1.12,1.39+level*.2,-2.79]);for(const y of [1.32,1.46])C('bamboo-steamer-bound-rim',.422,.422,.035,'#dfb76e',[1.12,y+level*.2,-2.79]);}C('bamboo-steamer-lid',.425,.425,.065,'#d2aa65',[1.12,1.925,-2.79]);
    for(let i=0;i<6;i++)B('bamboo-lid-woven-strip',[.56,.013,.033],'#ab8249',[1.12,1.968,-3.04+i*.1]);
    B('shop-teal-fabric-awning',[7.6,.09,1.18],'#548e80',[0,3.33,-2.76],[.13,0,0]);
    for(let i=0;i<16;i++){const x=-3.55+i*.473;B('awning-stitched-seam',[.018,.014,1.17],'#88af91',[x,3.392,-2.76],[.13,0,0]);B('awning-scalloped-valance',[.44,.22,.055],i%2?'#558d7e':'#609883',[x,3.18,-2.163]);}
    for(const x of [-2.4,2.4]){R('bun-shop-pendant-wire',[x,3.2,-2.51],[x,2.92,-2.51],.018,'#5b6145');C('bun-shop-enamel-shade',.13,.28,.18,'#55735a',[x,2.85,-2.51]);}
    B('bun-shop-menu-timber-frame',[1.13,1.51,.11],'#b28a51',[-4.12,2.16,-3.08]);B('bun-shop-chalk-menu',[.97,1.35,.036],'#35594a',[-4.12,2.16,-3.004]);for(let i=0;i<6;i++){B('menu-dish-line',[.53,.029,.013],'#dcd5b0',[-4.23,2.68-i*.2,-2.976]);B('menu-price-line',[.13,.036,.013],'#dcd5b0',[-3.81,2.68-i*.2,-2.976]);}
    for(const x of [-3.8,-.3,3.2]){C('table-chopstick-tin',.11,.1,.22,'#a4aaa0',[x,.99,.2]);for(let i=0;i<4;i++)R('standing-shop-chopstick',[x-.045+i*.03,1.03,.2],[x-.06+i*.039,1.41,.2],.009,'#8c6943');cup(x+.45,.925,.35);}
    planter(-5.28,-2.32,.9);planter(5.12,-2.27,1.1);
  }
  if(cell===16){
    // A planted timber deck and a glass office edge match the reference's
    // sheltered work terrace, retaining the open middle for the story actor.
    hide('full-size-park-bench');
    for(let i=0;i<15;i++)B('terrace-deck-timber-board',[.39,.075,6.4],i%4?'#ae8759':'#bb9768',[-4.97+i*.4,.06,-.65]);
    B('terrace-office-plaster-pier',[.75,4.08,.65],'#c9c5ad',[3.77,2.05,-3.73]);
    for(const x of [1.26,4.98]){B('terrace-office-window',[2.0,3.67,.09],'#9bc6c0',[x,1.97,-3.68],null,{roughness:.25,metalness:.1});for(const dx of [-1,0,1])B('terrace-window-metal-mullion',[.07,3.79,.16],'#657f7b',[x+dx,1.96,-3.58]);B('terrace-window-crossbar',[2.0,.09,.16],'#657f7b',[x,2.64,-3.57]);}
    B('terrace-office-living-roof',[6.2,.28,1.08],'#b5b497',[2.85,4.13,-3.8]);
    for(let i=0;i<11;i++)sprig(.17+i*.53,4.22,-3.75,.65,false,true);
    for(let i=0;i<5;i++)sprig(3.42,3.75-i*.47,-3.32,.48);
    planter(3.8,-2.94,2.4);planter(-4.32,2.28,2.14);planter(3.89,2.18,2.4);
    for(const z of [-1.54,.55])planter(5.15,z,1.2);
    table(-1.72,-1.35,.91);cup(-1.3,1.1,-1.07);
    B('terrace-laptop-keyboard',[.68,.035,.47],'#697b76',[-2.17,1.12,-1.42]);B('terrace-laptop-screen',[.68,.43,.045],'#99b8b1',[-2.17,1.34,-1.61],[-.13,0,0]);
    for(const [x,z] of [[-2.9,-1.55],[-.6,-1.55],[-1.77,-2.58]]){stool(x,z,.58);B('terrace-chair-canvas-back',[.52,.64,.065],'#d8cbb0',[x,1.02,z-.21]);for(const dx of [-.25,.25])R('terrace-chair-folding-back',[x+dx,.56,z+.18],[x+dx,1.44,z-.24],.033,'#9a7347');}
    for(let i=0;i<8;i++){const a=i*Math.PI/4;R('parasol-stitched-rib',[-1.7,3.715,-1.35],[-1.7+Math.sin(a)*2.08,3.083,-1.35+Math.cos(a)*2.08],.016,'#b9aa82');}
    for(const x of [-4.9,4.99])lantern(x,.32,1.15);
  }

  if([23,25,26].includes(cell)){
    // True openings replace the opaque wall behind the old glass. The layered
    // garden/city sits metres behind the sill and shows parallax when orbiting.
    const holes=cell===23?[{x:-2.9,w:4.4,h:2.64,b:1.26},{x:2.52,w:3.5,h:2.64,b:1.26}]:cell===25?[{x:-3.68,w:3.3,h:3.2,b:.68}]:[{x:-.2,w:4.9,h:2.65,b:.68}];
    hide('reference-back-wall');hide('glazed-window-reveal');hide('lower-wall-wainscot');hide('dado-rail');
    if(cell===23){hide('tea-lattice-vertical');hide('tea-lattice-horizontal');}
    const wall=cell===23?'#ceb890':'#d2c6aa',ordered=[...holes].sort((a,b)=>a.x-b.x);let left=-6;
    for(const h of ordered){const l=h.x-h.w/2,r=h.x+h.w/2;if(l>left)B('window-opening-solid-wall-pier',[l-left,4.7,.2],wall,[(l+left)/2,2.33,-4.45]);B('window-opening-solid-wall-below',[h.w,h.b,.2],wall,[h.x,h.b/2,-4.45]);B('window-opening-solid-wall-above',[h.w,4.7-h.b-h.h,.2],wall,[h.x,(4.7+h.b+h.h)/2,-4.45]);left=r;
      B('window-depth-inner-sill',[h.w+.18,.13,.56],'#ad8a58',[h.x,h.b-.055,-4.43]);
      for(const sign of [-1,1])B('window-depth-jamb',[.095,h.h,.55],'#926d47',[h.x+sign*(h.w/2+.035),h.b+h.h/2,-4.44]);
      B('window-distant-sky',[h.w+.4,h.h+.6,.12],cell===25?'#a7c4bf':'#bbcbb2',[h.x,h.b+h.h/2,-6.65]);
      for(let i=0;i<5;i++){const x=h.x-h.w/2+.38+i*(h.w-.5)/5,height=.65+(i%3)*.26;B('window-far-town-building',[.47,height,.35],i%2?'#819ca0':'#98aaa0',[x,h.b+height/2,-6.11]);for(const dx of [-.1,.1])B('distant-town-window',[.075,.11,.025],'#d6ceb0',[x+dx,h.b+height*.65,-5.92]);}
      B('window-garden-ground',[h.w+.28,.16,2.3],'#7f8f61',[h.x,h.b-.23,-5.51]);
      for(let i=0;i<Math.floor(h.w/.65);i++)sprig(h.x-h.w/2+.35+i*.66,h.b-.14,-5.41,.95,cell!==23,cell===23);
      for(const sign of [-1,1]){const x=h.x+sign*h.w*.29;R('window-garden-tree-trunk',[x,h.b,-5.86],[x,h.b+h.h*.84,-5.86],.045,'#817048');for(let k=0;k<3;k++)sprig(x+sign*k*.17,h.b+.56+k*.53,-5.77,.87,cell!==23,cell===23);}
    }
    if(left<6)B('window-opening-solid-wall-pier',[6-left,4.7,.2],wall,[(6+left)/2,2.33,-4.45]);
    // The source material is scene-local and shared only by these windows;
    // keeping it in the scene's registry also preserves normal disposal.
    environment.traverse(o=>{if(o.name==='dimensional-window-glass'){o.material.opacity=.1;o.material.depthWrite=false;}});
  }
  if(cell===23){
    for(const x of [-5.23,-.57,.74,4.39])B('teahouse-window-timber-post',[.15,3.4,.23],'#825d36',[x,2.04,-4.13]);
    for(const [x,w] of [[-2.9,4.4],[2.52,3.5]]){B('tea-window-header-carved',[w+.18,.22,.2],'#987046',[x,4.02,-4.12]);B('tea-window-solid-timber-sill',[w+.23,.13,.38],'#9a7245',[x,1.24,-4.08]);for(let i=0;i<Math.floor(w/.4);i++){const px=x-w/2+.18+i*.4;B('tea-window-upper-lattice-upright',[.037,.72,.06],'#b18a57',[px,3.49,-4.04]);B('tea-window-lower-lattice-upright',[.038,.72,.06],'#b18a57',[px,1.69,-4.04]);}for(const y of [1.45,1.93,3.24,3.73])B('tea-window-geometric-horizontal',[w,.038,.06],'#b18a57',[x,y,-4.04]);}
    for(const x of [-4.8,4.8]){B('teahouse-post-carved-base',[.45,.35,.43],'#a58b62',[x,.18,-3.6]);B('teahouse-timber-post-capital',[.57,.17,.38],'#b48b51',[x,4.12,-3.6]);lantern(x,2.79,-3.25);}
    B('tea-service-wood-tray',[1.53,.055,.86],'#896737',[-2.45,1.09,-1.44]);for(let i=0;i<10;i++)B('tea-tray-drain-slat',[1.35,.014,.023],'#b08a52',[-2.45,1.126,-1.76+i*.069]);
    oval('family-teapot-belly',[.25,.2,.24],'#8d6947',[-2.75,1.35,-1.51]);C('family-teapot-lid',.16,.17,.045,'#a67e4b',[-2.75,1.55,-1.51]);oval('family-teapot-lid-knob',[.055,.048,.055],'#725937',[-2.75,1.595,-1.51]);R('family-teapot-spout',[-2.56,1.33,-1.51],[-2.35,1.49,-1.51],.054,'#977144');mesh(g,'family-teapot-loop-handle',new THREE.TorusGeometry(.17,.033,6,14),'#916c46',[-2.98,1.39,-1.51]);cup(-2.15,1.137,-1.67);cup(-2.13,1.137,-1.17);
    B('teahouse-service-cabinet',[1.51,1.1,.71],'#957044',[4.77,.56,-2.79]);for(const x of [4.4,5.13]){B('tea-cabinet-raised-panel',[.65,.84,.055],'#b18a52',[x,.57,-2.403]);B('tea-cabinet-brass-pull',[.06,.15,.05],'#c2aa72',[x,.66,-2.346]);}for(let i=0;i<3;i++)C('tea-ceramic-storage-canister',.16,.15,.4,['#aaa884','#668b72','#b8b394'][i],[4.27+i*.46,1.35,-2.83]);
    planter(4.63,1.28,1.56);planter(-4.81,-.33,1.03);
    for(const x of [-4.47,4.87])B('teahouse-thin-woven-runner',[.63,.025,2.5],'#b5a270',[x,.035,.3],null,{pattern:'plaster'});
  }
  if(cell===25||cell===26){
    const shelves=[];environment.traverse(o=>{if(o.name==='book-shelf')shelves.push(o);});
    for(const [i,shelf] of shelves.entries()){
      const w=shelf.geometry.parameters.width,p=shelf.position;
      B('bookcase-shelf-raised-lip',[w+.07,.057,.045],'#bf9359',[p.x,p.y+.035,p.z+.338]);
      if(i%5===4){B('bookcase-top-cornice',[w+.17,.13,.78],'#ad7d48',[p.x,p.y+.14,p.z]);continue;}
      if(i%3===0){B('bookcase-archival-box',[.44,.32,.38],i%2?'#77918a':'#b59667',[p.x+w/2-.33,p.y+.218,p.z+.01]);B('archival-box-label',[.18,.083,.013],'#d7caa4',[p.x+w/2-.33,p.y+.23,p.z+.209]);}
    }
    const books=[];environment.traverse(o=>{if(o.name==='individual-book')books.push(o);});
    for(const [i,b] of books.entries()){
      if(i%11===9||i%11===10){b.visible=false;continue;}
      b.position.z+=(i%4)*.027;b.scale.y=.84+(i%5)*.085;
      if(i%7===0)b.rotation.z=-.13;
    }
    if(cell===25){
      // The study reference includes a separate reading seat, framed prints,
      // layered foreground books and a bright autumn canopy beyond the desk.
      B('study-reading-sofa-base',[1.22,.48,2.45],'#947956',[-4.91,.37,.55]);
      B('study-reading-sofa-back',[.2,1.07,2.45],'#aa8d64',[-5.46,1.0,.55]);
      for(const z of [-.58,1.68])B('study-reading-sofa-arm',[1.23,.51,.19],'#ac9068',[-4.89,.82,z]);
      for(const z of [-.04,1.03])B('study-reading-seat-pad',[1.0,.16,.97],'#beab83',[-4.85,.69,z]);
      for(const z of [.03,1.0]){
        B('study-plaid-back-cushion',[.19,.72,.89],'#c1aa76',[-5.22,1.15,z],[0,0,-.15]);
        for(let i=0;i<4;i++){B('study-plaid-vertical-weave',[.021,.71,.079],i%2?'#708475':'#b78852',[-5.10,1.15,z-.31+i*.205]);B('study-plaid-horizontal-weave',[.025,.066,.89],i%2?'#9b7951':'#7b8a75',[-5.079,.9+i*.165,z]);}
      }
      for(const [z,y,w,h] of [[-1.77,3.03,1.29,1.69],[.54,3.1,1.4,1.42]]){
        const art=group(g,'study-framed-landscape-print',[-5.825,y,z],Math.PI/2);
        box(art,'print-timber-frame',[w+.18,h+.18,.1],'#89633e');box(art,'print-ivory-mount',[w,h,.027],'#d6c6a5',[0,0,.07]);box(art,'print-painted-sky',[w-.2,h-.3,.018],'#88aaa4',[0,0,.091]);
        for(let i=0;i<3;i++){
          const shape=new THREE.Shape();shape.moveTo(-.51+i*.17,-h*.31);shape.lineTo(-.16+i*.17,.31-i*.09);shape.lineTo(.19+i*.17,-h*.31);shape.closePath();
          mesh(art,'print-layered-mountain-relief',new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:false}),['#668491','#798f87','#9ba17a'][i],[0,-.05,.12+i*.017]);
        }
        for(let i=0;i<7;i++){const leaf=mesh(art,'print-autumn-branch-relief',leafGeometry,['#c79a43','#b57632','#d1b460'][i%3],[-.44+(i%3)*.34,-.42+Math.floor(i/3)*.21,.19]);leaf.scale.set(.17,.13,.013);}
      }
      B('study-foreground-low-cabinet',[2.15,.83,1.03],'#977047',[3.73,.43,1.53]);B('study-low-cabinet-timber-top',[2.29,.095,1.12],'#bd935d',[3.73,.9,1.53]);
      for(const x of [3.19,4.27]){B('study-low-cabinet-recessed-door',[.95,.65,.046],'#ab824d',[x,.45,2.071]);B('study-low-cabinet-brass-handle',[.19,.04,.04],'#c8ab70',[x,.62,2.116]);}
      for(let i=0;i<4;i++){const x=3.25+(i%2)*.055,z=1.57-i*.022;B('study-foreground-book-cover',[.91,.035,.67],['#9b7049','#657e74','#b2985d','#617b8b'][i],[x,.98+i*.139,z],[0,i*.08,0]);B('study-foreground-book-pages',[.85,.08,.61],'#cbbb8e',[x,1.039+i*.139,z],[0,i*.08,0]);B('study-foreground-book-upper-cover',[.91,.025,.67],['#9b7049','#657e74','#b2985d','#617b8b'][i],[x,1.091+i*.139,z],[0,i*.08,0]);}
      C('study-side-cabinet-plant-pot',.17,.13,.28,'#ae8d60',[4.32,1.095,1.3]);sprig(4.32,1.24,1.3,.49);
      const oldTree=environment.getObjectByName('landscape-tree');if(oldTree)oldTree.visible=false;
      for(const [x,y,z] of [[-4.3,1.3,-5.48],[-2.66,1.06,-5.71]]){
        R('autumn-window-tree-trunk',[x,.55,z],[x+.07,3.59,z],.07,'#82643e');
        for(let branch=0;branch<5;branch++){
          const bx=x+Math.sin(branch*2.4)*.63,by=y+.5+branch*.39,bz=z+Math.cos(branch*2.4)*.21;R('autumn-window-tree-bough',[x,by-.4,z],[bx,by,bz],.027,'#846940');
          for(let j=0;j<9;j++){const a=j*2.4,l=mesh(g,'bright-autumn-window-leaf',leafGeometry,['#c78126','#e1ad37','#d7b94b','#b5672b'][(j+branch)%4],[bx+Math.sin(a)*.39,by+(j%3)*.11,bz+Math.cos(a)*.26]);l.scale.set(.27,.11,.24);l.rotation.set(.2,a,.3);}
        }
      }
      B('study-woven-desk-rug',[4.75,.025,2.65],'#b6a880',[-2.65,.026,-1.68],null,{pattern:'plaster'});for(const sign of [-1,1])B('study-rug-border',[4.46,.013,.065],'#8f8466',[-2.65,.046,-1.68+sign*1.12]);
      B('study-low-window-bookcase',[1.68,.74,.64],'#9c7447',[-5.04,.38,-3.19]);for(let i=0;i<7;i++)B('window-seat-stored-book',[.13,.49,.34],['#8b9870','#b69b68','#657f81'][i%3],[-5.67+i*.19,.3,-2.984]);
      B('study-checkered-seat-blanket',[.68,.08,.69],'#b39b6f',[-4.96,.81,-3.19]);for(let i=0;i<4;i++)B('study-blanket-woven-stripe',[.08,.01,.68],i%2?'#8c9876':'#b47c50',[-5.21+i*.16,.856,-3.19]);
      C('study-bookshelf-clock-rim',.28,.28,.07,'#936f43',[1.05,4.35,-3.83],[Math.PI/2,0,0]);C('study-clock-ivory-face',.235,.235,.017,'#ded1ae',[1.05,4.35,-3.785],[Math.PI/2,0,0]);R('study-clock-hour-hand',[1.05,4.35,-3.763],[.96,4.42,-3.763],.012,'#5b634e');R('study-clock-minute-hand',[1.05,4.35,-3.761],[1.07,4.53,-3.761],.008,'#5b634e');
      for(let i=0;i<3;i++){const z=-1.1+i*.08;B('study-paper-edge',[.84,.015,.67],'#dacead',[-1.4,1.45+i*.13,z-.5]);}
    }else{
      B('salon-low-bookshelf-back',[2.37,1.11,.1],'#926f43',[3.67,.56,1.6]);for(const y of [.09,.62,1.15])B('salon-low-bookcase-shelf',[2.46,.08,.62],'#ad804b',[3.67,y,1.84]);for(const x of [2.48,4.87])B('salon-bookcase-end',[.09,1.19,.65],'#9d7342',[x,.6,1.85]);
      for(let i=0;i<11;i++)for(const y of [.37,.89])B('salon-display-book',[.13,.42,.38],['#8e9b79','#c29d69','#9d7756','#64847d'][i%4],[2.66+i*.197,y,1.87]);
      planter(3.74,2.74,2.48);table(.33,-2.52,.65);cup(.08,1.1,-2.54);cup(.57,1.1,-2.39);
      for(const x of [-3.4,3.7]){cup(x+.38,1.08,-.86);B('salon-table-open-volume',[.57,.04,.48],'#d9cfaa',[x-.28,1.09,-1.08],[0,-.1,0]);for(let j=0;j<3;j++)B('open-volume-printed-line',[.2,.005,.012],'#9e9e7b',[x-.33,1.116,-1.21+j*.065]);}
      B('salon-wall-linen-banner',[3.59,.56,.065],'#dbc89d',[-.15,4.18,-4.05]);for(const x of [-1.2,-.15,.9])B('salon-banner-stitched-mark',[.39,.026,.018],'#9d7a47',[x,4.18,-4.006]);
      for(const x of [-4.85,4.82])lantern(x,2.66,-3.47);
    }
  }
  g.userData.referenceCraftRevision=3;
}
