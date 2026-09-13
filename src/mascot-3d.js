import * as THREE from 'three';

// A dimensional interpretation of Liu Kanshan's white pear silhouette, pointed
// ears, generous black nose, slender arms and boots. Every part is real geometry.
export function createLiuKanshan(){
  const actor=new THREE.Group();actor.name='liu-kanshan-3d';
  const ivory=new THREE.MeshStandardMaterial({color:'#fffdf4',roughness:.82});
  const ink=new THREE.MeshStandardMaterial({color:'#171c1b',roughness:.76});
  const eyeInk=new THREE.MeshBasicMaterial({color:'#101515'});
  const sphere=new THREE.SphereGeometry(1,24,16),materials=[ivory,ink,eyeInk];
  const geometries=new Set([sphere]);
  function mesh(parent,name,geometry,mat,position,scale=[1,1,1]){
    const part=new THREE.Mesh(geometry,mat);part.name=name;part.position.set(...position);part.scale.set(...scale);part.castShadow=true;part.receiveShadow=true;parent.add(part);geometries.add(geometry);return part;
  }
  const oval=(parent,name,mat,position,scale)=>mesh(parent,name,sphere,mat,position,scale);
  const torso=new THREE.Group();torso.name='breathing-torso';torso.position.y=.43;actor.add(torso);
  const profile=[[0,0],[.27,.025],[.43,.13],[.52,.37],[.53,.59],[.48,.86],[.38,1.1],[.3,1.22],[0,1.26]].map(([x,y])=>new THREE.Vector2(x,y));
  const belly=mesh(torso,'pear-body',new THREE.LatheGeometry(profile,28),ivory,[0,0,0],[1,1,.88]);
  const head=new THREE.Group();head.name='looking-head';head.position.set(0,1.19,.015);torso.add(head);
  oval(head,'head',ivory,[0,.21,.015],[.49,.5,.43]);
  oval(head,'white-muzzle',ivory,[0,.08,.39],[.37,.3,.47]);
  const nose=oval(head,'large-black-nose',ink,[0,.14,.79],[.34,.235,.235]);
  // Small round eyes stay on the white face, well clear of the nose.
  const eyes=[];
  for(const sign of [-1,1]){
    eyes.push(oval(head,`eye-${sign}`,eyeInk,[sign*.3,.33,.343],[.037,.055,.027]));
    const earShape=new THREE.Shape();earShape.moveTo(-.15,0);earShape.quadraticCurveTo(-.115,.27,-.035,.5);earShape.quadraticCurveTo(.01,.555,.06,.475);earShape.lineTo(.17,0);earShape.closePath();
    const ear=mesh(head,`pointed-ear-${sign}`,new THREE.ExtrudeGeometry(earShape,{depth:.16,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.025,bevelThickness:.025}),ivory,[sign*.295,.55,-.075]);ear.rotation.z=-sign*.17;
  }
  const mouthCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.115,-.065,.764),new THREE.Vector3(0,-.097,.81),new THREE.Vector3(.115,-.065,.764)]);
  mesh(head,'small-smile',new THREE.TubeGeometry(mouthCurve,12,.012,5,false),ink,[0,0,0]);
  const arms=[],legs=[];
  for(const sign of [-1,1]){
    const shoulder=new THREE.Group();shoulder.name=`arm-joint-${sign}`;shoulder.position.set(sign*.49,.88,0);torso.add(shoulder);
    oval(shoulder,`black-arm-${sign}`,ink,[0,-.235,.025],[.075,.29,.078]);
    oval(shoulder,`black-paw-${sign}`,ink,[0,-.51,.035],[.09,.12,.093]);
    arms.push({joint:shoulder,sign});if(sign===1)actor.userData.throwArm=shoulder;
    const hip=new THREE.Group();hip.name=`leg-joint-${sign}`;hip.position.set(sign*.21,.43,0);actor.add(hip);
    oval(hip,`black-leg-${sign}`,ink,[0,-.145,0],[.063,.2,.071]);
    oval(hip,`black-boot-${sign}`,ink,[0,-.35,.075],[.112,.08,.171]);legs.push({joint:hip,sign});
  }
  const tail=oval(torso,'round-white-tail',ivory,[.33,.32,-.405],[.245,.245,.245]);
  actor.scale.setScalar(1.13);
  actor.userData.rig={torso,head,belly,nose,eyes,arms,legs,tail};
  actor.userData.dispose=()=>{for(const geometry of geometries)geometry.dispose();for(const mat of materials)mat.dispose();};
  resetLiuKanshan(actor);return actor;
}

export function resetLiuKanshan(actor){
  const rig=actor.userData.rig;if(!rig)return;
  rig.torso.scale.set(1,1,1);rig.torso.rotation.set(0,0,0);rig.head.rotation.set(0,0,0);
  for(const {joint,sign} of rig.arms)joint.rotation.set(0,0,sign*.08);
  for(const {joint} of rig.legs)joint.rotation.set(0,0,0);
  for(const eye of rig.eyes)eye.scale.y=.055;
  rig.tail.position.x=.33;actor.rotation.x=actor.rotation.z=0;
}

// Call with an accumulated, pausable clock. The hips/root never move during idle
// breathing or greetings, so boots remain planted on their exact landing point.
export function animateLiuKanshan(actor,time,{walking=false,stepPhase=0}={}){
  const rig=actor.userData.rig;if(!rig||actor.userData.diceThrowing)return;
  const seconds=Math.max(0,time)*.001;
  resetLiuKanshan(actor);
  if(walking){
    for(const {joint,sign} of rig.legs)joint.rotation.x=Math.sin(stepPhase)*.46*sign;
    for(const {joint,sign} of rig.arms)joint.rotation.x=-Math.sin(stepPhase)*.32*sign;
    rig.torso.rotation.z=Math.sin(stepPhase)*.015;return;
  }
  const breath=Math.sin(seconds*2.05);
  rig.torso.scale.set(1-breath*.008,1+breath*.018,1+breath*.009);
  rig.torso.rotation.z=Math.sin(seconds*.91)*.012;
  rig.head.rotation.y=Math.sin(seconds*.7)*.16;
  rig.head.rotation.x=Math.sin(seconds*.93)*.025;
  const blinkAge=(seconds+.85)%4.6;
  const blink=blinkAge<.18?Math.sin(blinkAge/.18*Math.PI):0;
  for(const eye of rig.eyes)eye.scale.y=.055*(1-blink*.93);
  const greetingAge=seconds%12.5;
  const greeting=greetingAge>1.6&&greetingAge<4.5?Math.sin((greetingAge-1.6)/2.9*Math.PI):0;
  for(const {joint,sign} of rig.arms){
    joint.rotation.x=Math.sin(seconds*1.9+sign)*.07;
    joint.rotation.z=sign*(.08+(.5+.5*Math.sin(seconds*1.35))*.045);
    if(sign===1){joint.rotation.z+=greeting*(1.95+Math.sin(seconds*10)*.17);joint.rotation.x-=greeting*.24;}
  }
  rig.tail.position.x=.33+Math.sin(seconds*2.2)*.025;
}
