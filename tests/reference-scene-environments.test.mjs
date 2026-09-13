import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCinematicScene3D,resolveCinematicTheme} from '../src/cinematic-scenes-3d.js';
import {REFERENCE_SCENE_ENVIRONMENTS} from '../src/reference-scene-environments-3d.js';

test('all forty references produce distinct volumetric spaces with native texture patterns and no image planes',()=>{
  const names=new Set();
  for(let cell=1;cell<=40;cell++){
    const room=createCinematicScene3D({cell,theme:resolveCinematicTheme(cell)});
    try{
      names.add(room.scene.userData.referenceEnvironment);
      assert.equal(room.scene.userData.referenceEnvironment,REFERENCE_SCENE_ENVIRONMENTS[cell].name);
      const environment=room.scene.getObjectByName(`reference-space-${REFERENCE_SCENE_ENVIRONMENTS[cell].name}`);
      assert.ok(environment,`cell ${cell} needs its reference environment`);
      assert.deepEqual(environment.userData.openSides,['front','right']);
      let meshes=0;
      environment.traverse(object=>{
        if(!object.isMesh)return;meshes++;
        assert.ok(object.geometry.isBufferGeometry);
        assert.notEqual(object.geometry.type,'PlaneGeometry');
        for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.map){assert.equal(material.map.isDataTexture,true);assert.match(material.map.name,/^original-pixel-/);}
      });
      assert.ok(meshes>=110,`cell ${cell} should contain a full spatial reconstruction`);
      for(const time of [0,1.5,4])room.update(time);
      assert.ok(room.camera.position.toArray().every(Number.isFinite));
    }finally{room.dispose();}
  }
  assert.equal(names.size,40);
});

test('outdoor and transport references have their recognizable full-size structures',()=>{
  const evidence={7:'balcony-front-handrail',8:'full-size-stair-step',10:'blue-high-speed-train',12:'metro-blue-canopy',19:'observation-deck-handrail',20:'three-dimensional-airliner',24:'rooftop-water-tank',29:'creative-lane-entry-lintel',32:'parking-yellow-hazard-stripe',33:'radiology-spine',38:'full-size-open-air-hot-spring',39:'park-pavilion-timber-post',40:'palace-open-hemisphere'};
  for(const [id,marker] of Object.entries(evidence)){
    const cell=Number(id),room=createCinematicScene3D({cell,theme:resolveCinematicTheme(cell)});
    try{
      assert.ok(room.scene.getObjectByName(marker),`cell ${cell}: ${marker}`);
      assert.equal(room.scene.getObjectByName('back-wall').visible,false);
      if(REFERENCE_SCENE_ENVIRONMENTS[cell].space==='outdoor')assert.equal(room.scene.getObjectByName('reference-back-wall'),undefined);
      if([10,20].includes(cell))assert.equal(room.scene.getObjectByName('reference-back-wall').visible,false);
    }finally{room.dispose();}
  }
});

test('free orbit retains camera position and orientation while story actors animate',()=>{
  const room=createCinematicScene3D({cell:6,theme:'presentation',cameraMotion:false});
  try{
    assert.ok(room.target.isVector3);
    room.camera.position.set(-9,8,13);room.camera.lookAt(1,1,-1);room.camera.updateMatrixWorld();
    const before=room.camera.matrixWorld.clone(),head=room.actors[0].userData.rig.head.rotation.clone();
    room.update(2.4);room.camera.updateMatrixWorld();
    assert.ok(room.camera.matrixWorld.equals(before));
    assert.notEqual(room.actors[0].userData.rig.head.rotation.y,head.y);
    room.update(3,{cameraMotion:true});assert.ok(!room.camera.position.equals(new THREE.Vector3(-9,8,13)));
    const resumed=room.camera.position.clone();room.update(3.7,{cameraMotion:false});assert.ok(room.camera.position.equals(resumed));
  }finally{room.dispose();}
});

test('care and shared rooftop use Liu Kanyu geometry and dispose all scene materials',()=>{
  for(const cell of [18,24,27]){
    const room=createCinematicScene3D({cell,theme:resolveCinematicTheme(cell)}),materials=new Set();
    room.scene.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
    if(cell!==27){
      assert.equal(room.actors.length,2);
      const partner=room.actors[1];assert.ok(partner.getObjectByName('large-black-nose'));assert.ok(partner.getObjectByName('liu-kanyu-long-brown-hair'));
      if(cell===18){const nose=new THREE.Vector3(),head=new THREE.Vector3();partner.getObjectByName('large-black-nose').getWorldPosition(nose);partner.userData.rig.head.getWorldPosition(head);assert.ok(nose.y>head.y,'patient face points upward');}
    }
    const disposed=new Set();for(const material of materials)material.addEventListener('dispose',()=>disposed.add(material));
    room.dispose();assert.equal(disposed.size,materials.size);room.dispose();
  }
});

test('scene surface dimensions stay stable across cache reuse and all local GPU resources dispose once',()=>{
  const room=createCinematicScene3D({cell:18,theme:'care'}),geometries=new Set(),textures=new Set(),instances=new Set();
  try{
    room.scene.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      if(object.isInstancedMesh)instances.add(object);
      for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[])for(const map of [material.map,material.bumpMap,material.roughnessMap])if(map)textures.add(map);
    });
    const tiles=[];room.scene.traverse(o=>{if(o.name==='individual-floor-tile')tiles.push(o);});
    assert.ok(tiles.length>1);assert.equal(tiles[0].geometry,tiles[1].geometry,'same size and pattern share one UV geometry');
    const uv=tiles[0].geometry.attributes.uv;
    assert.ok(Math.max(...Array.from(uv.array))<.5,'world-scale UVs must be applied only once');
    assert.ok(instances.size>0,'repeated immutable dressing should be instanced');
    const sunlight=room.scene.children.find(o=>o.isDirectionalLight&&o.castShadow);
    sunlight.shadow.map=new THREE.WebGLRenderTarget(4,4);sunlight.shadow.mapPass=new THREE.WebGLRenderTarget(4,4);
    const resources=new Set([...geometries,...textures,...instances,sunlight.shadow.map,sunlight.shadow.mapPass]),counts=new Map();
    for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
    room.dispose();room.dispose();
    for(const resource of resources)assert.equal(counts.get(resource),1,`${resource.type||resource.name} must release exactly once`);
  }finally{room.dispose();}
});

test('each disposable room owns shadow materials so shader uniforms cannot revive a previous rooms textures',()=>{
  const rooms=[18,25].map(cell=>createCinematicScene3D({cell,theme:resolveCinematicTheme(cell)})),owned=[];
  try{
    for(const room of rooms){
      const depths=new Set(),distances=new Set();
      room.scene.traverse(object=>{if(object.isMesh){assert.ok(object.customDepthMaterial?.isMeshDepthMaterial);assert.ok(object.customDistanceMaterial?.isMeshDistanceMaterial);depths.add(object.customDepthMaterial);distances.add(object.customDistanceMaterial);}});
      assert.equal(depths.size,1);assert.equal(distances.size,1);owned.push([...depths,...distances]);
    }
    assert.notEqual(owned[0][0],owned[1][0]);assert.notEqual(owned[0][1],owned[1][1]);
    const counts=new Map();for(const material of owned.flat())material.addEventListener('dispose',()=>counts.set(material,(counts.get(material)||0)+1));
    for(const room of rooms){room.dispose();room.dispose();}
    for(const material of owned.flat())assert.equal(counts.get(material),1);
  }finally{for(const room of rooms)room.dispose();}
});
