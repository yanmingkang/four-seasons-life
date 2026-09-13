import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCinematicScene3D,resolveCinematicTheme,CELL_SCENE_PROPS} from '../src/cinematic-scenes-3d.js';
import {REFERENCE_SCENE_LIFE,addReferenceScenePopulation} from '../src/reference-scene-population.js';
import {batchReferenceSceneEnvironment} from '../src/reference-scene-batch.js';

const create=cell=>createCinematicScene3D({cell,theme:resolveCinematicTheme(cell),cameraMotion:false});
const collect=(root,predicate)=>{const objects=[];root.traverse(object=>{if(predicate(object))objects.push(object);});return objects;};
const box=object=>new THREE.Box3().setFromObject(object);
const visible=object=>{for(let current=object;current;current=current.parent)if(!current.visible)return false;return true;};
const overlapsXZ=(a,b)=>Math.min(a.max.x,b.max.x)-Math.max(a.min.x,b.min.x)>.035&&Math.min(a.max.z,b.max.z)-Math.max(a.min.z,b.min.z)>.035;

test('all 40 playable scenes apply their planned population while quiet rooms keep only daily-life objects',()=>{
  assert.equal(Object.keys(REFERENCE_SCENE_LIFE).length,40);
  let totalPeople=0,quietRooms=0;
  for(let cell=1;cell<=40;cell++){
    const room=create(cell);
    try{
      const population=room.scene.getObjectByName('scene-daily-life'),people=collect(population,o=>o.userData.populationParticipant),plan=REFERENCE_SCENE_LIFE[cell];
      assert.equal(room.scene.userData.populationApplied,true,`cell ${cell}`);
      assert.equal(room.scene.userData.plannedPeople,plan.people);
      assert.equal(room.scene.userData.addedPeople,people.length);
      assert.equal(people.length,plan.people,`cell ${cell}: participant groups match the scene plan`);
      assert.ok(room.scene.userData.populationMeshes>0);
      assert.equal(population.parent.name,`reference-space-${room.environment.name}`);
      assert.equal(addReferenceScenePopulation({environment:population.parent,cell}),population,'repeat integration is idempotent');
      assert.ok(visible(room.actors[0]),`cell ${cell}: Liu Kanshan remains visible`);
      if(!plan.people)quietRooms++;
      totalPeople+=people.length;
      const bounds=box(population);
      assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite));
      assert.ok(bounds.min.x>=-6&&bounds.max.x<=6&&bounds.min.z>=-4.4&&bounds.max.z<=4.5,`cell ${cell}: daily life stays on its 12 × 9 floor`);
      assert.ok(bounds.min.y>=-.02&&bounds.max.y<=4.72,`cell ${cell}: no buried or unbounded population geometry`);
      for(const object of collect(population,o=>o.isMesh)){
        assert.ok(object.geometry.attributes.position.array.every(Number.isFinite),`cell ${cell}: ${object.name}`);
        assert.ok(object.matrixWorld.elements.every(Number.isFinite));
      }
      if([18,24,35].includes(cell))assert.equal(room.actors.length,2,`cell ${cell}: authored Liu Kanyu is preserved`);
    }finally{room.dispose();}
  }
  assert.equal(totalPeople,57);assert.equal(quietRooms,16);
});

test('new participants do not occupy existing story people or each other, and seated hips meet their actual support height',()=>{
  for(let cell=1;cell<=40;cell++){
    const room=create(cell);
    try{
      const population=room.scene.getObjectByName('scene-daily-life'),people=collect(population,o=>o.userData.populationParticipant);
      const originalPeople=collect(room.scene,o=>o.name==='supporting-person'&&visible(o));
      const newBodies=people.map(p=>box(p.getObjectByName('tailored-jacket')));
      for(let i=0;i<people.length;i++){
        for(let j=i+1;j<people.length;j++)assert.ok(!overlapsXZ(newBodies[i],newBodies[j]),`cell ${cell}: added people ${i}/${j} collide`);
        for(const original of originalPeople)assert.ok(!overlapsXZ(newBodies[i],box(original.getObjectByName('jacket'))),`cell ${cell}: added participant overlaps an animated colleague`);
        const person=people[i];
        if(person.userData.seated){
          const thigh=box(person.getObjectByName('seated-trouser-thigh'));
          assert.ok(Math.abs(thigh.min.y-person.userData.seatTop)<1e-5,`cell ${cell}: hips must rest on the chosen chair/bench`);
        }
      }
    }finally{room.dispose();}
  }
});

// Compare actual rendered positions, normals and UVs. Float32 baking adds small
// rounding error, so match vertices within tolerance rather than rounding both
// sides to a grid (which can split equal values on a grid boundary).
function visibleGeometry(root){
  const rows=[],p=new THREE.Vector3(),n=new THREE.Vector3(),normal=new THREE.Matrix3();root.updateWorldMatrix(true,true);
  root.traverseVisible(object=>{
    if(!object.isMesh||!object.userData.populationPart)return;
    const geometry=object.geometry;normal.getNormalMatrix(object.matrixWorld);
    for(let i=0;i<(geometry.index?.count??geometry.attributes.position.count);i++){
      const j=geometry.index?geometry.index.getX(i):i;
      p.fromBufferAttribute(geometry.attributes.position,j).applyMatrix4(object.matrixWorld);
      n.fromBufferAttribute(geometry.attributes.normal,j).applyMatrix3(normal).normalize();
      rows.push([object.material.uuid,...p.toArray(),...n.toArray(),geometry.attributes.uv.getX(j),geometry.attributes.uv.getY(j)]);
    }
  });return rows;
}
function assertSameGeometry(actual,expected){
  assert.equal(actual.length,expected.length,'every rendered vertex must survive batching');
  const buckets=new Map(),key=(material,x,y,z)=>`${material}:${x}:${y}:${z}`;
  for(const row of expected){const [x,y,z]=row.slice(1,4).map(v=>Math.floor(v*100)),id=key(row[0],x,y,z);if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(row);}
  for(const row of actual){
    const [x,y,z]=row.slice(1,4).map(v=>Math.floor(v*100));let matched=false;
    search:for(const dx of [0,-1,1])for(const dy of [0,-1,1])for(const dz of [0,-1,1]){
      const bucket=buckets.get(key(row[0],x+dx,y+dy,z+dz));if(!bucket?.length)continue;
      const index=bucket.findIndex(candidate=>row.slice(1).every((value,i)=>Math.abs(value-candidate[i+1])<1e-5));
      if(index!==-1){bucket.splice(index,1);matched=true;break search;}
    }
    assert.ok(matched,`batched vertex changed its position/normal/UV: ${row.join(',')}`);
  }
}

test('population geometry survives static batching with transformed parents, while the original actors remain animated',()=>{
  const room=create(4),population=room.scene.getObjectByName('scene-daily-life'),environment=population.parent;
  try{
    batchReferenceSceneEnvironment(environment).dispose();
    const participants=collect(population,o=>o.userData.populationParticipant);
    assert.equal(participants.length,7);
    // Isolate the new subtree so material sharing with other room furniture
    // cannot make unrelated triangles part of this exact comparison.
    population.position.set(.1,.2,-.3);population.rotation.y=.17;population.scale.set(1.03,.98,.96);
    const before=visibleGeometry(population),batch=batchReferenceSceneEnvironment(population);
    batch.group.traverse(o=>{if(o.isMesh)o.userData.populationPart=true;});
    assertSameGeometry(visibleGeometry(population),before);
    assert.ok(batch.stats.savedDrawCalls>300);
    const actor=room.actors[0],beforeHead=actor.userData.rig.head.rotation.y;room.update(2.4);
    assert.notEqual(actor.userData.rig.head.rotation.y,beforeHead);assert.ok(visible(actor));
    batch.dispose();assertSameGeometry(visibleGeometry(population),before);
  }finally{room.dispose();}
});

test('meeting and planning documents stay on their supporting tables, helpers belong to the population, and palace letters clear the dais',()=>{
  const meeting=create(4),palace=create(40),planning=create(28);
  try{
    const population=meeting.scene.getObjectByName('scene-daily-life'),table=meeting.scene.getObjectByName('full-length-meeting-table'),tableBounds=box(table.getObjectByName('wood-tabletop')),top=tableBounds.max.y;
    assert.equal(table.parent,population);
    const notebook=meeting.scene.getObjectByName(CELL_SCENE_PROPS[4][0]).getObjectByName('notebook-cover');
    const calendar=meeting.scene.getObjectByName(CELL_SCENE_PROPS[4][1]).getObjectByName('unwritten-sheet');
    assert.ok(visible(notebook));assert.ok(visible(calendar));
    assert.ok(box(notebook).min.y>=top-.001&&box(notebook).min.y<top+.03);
    assert.ok(box(calendar).min.y>=top-.001&&box(calendar).min.y<top+.03);
    const oldDeskObjects=collect(meeting.scene,o=>/^(mug-|meeting-felt-desk-pad|resting-meeting-pencil|closed-meeting-notebook|notebook-page-block)/.test(o.name)&&o.position.z> -2);
    assert.ok(oldDeskObjects.length>0);
    for(const object of oldDeskObjects){const bounds=box(object);assert.ok(bounds.min.x>=tableBounds.min.x&&bounds.max.x<=tableBounds.max.x&&bounds.min.z>=tableBounds.min.z&&bounds.max.z<=tableBounds.max.z,`${object.name} must stay within the meeting tabletop`);}
    for(const object of collect(population,o=>['table','upholstered-chair','daily-open-document'].includes(o.name))){
      let parent=object.parent;while(parent&&parent!==population)parent=parent.parent;
      assert.equal(parent,population,'helper-created furniture must not remain attached to the room root');
    }
    const daisTop=box(palace.scene.getObjectByName('star-palace-ceremonial-dais')).max.y;
    for(const envelope of collect(palace.scene,o=>o.name==='memory-envelope'))assert.ok(box(envelope).min.y>daisTop);
    const sideTable=planning.scene.getObjectByName('planning-document-side-table'),sideTop=box(sideTable.getObjectByName('wood-tabletop')),document=box(planning.scene.getObjectByName('daily-open-document'));
    assert.equal(sideTable.parent.name,'scene-daily-life');
    assert.ok(document.min.x>=sideTop.min.x&&document.max.x<=sideTop.max.x&&document.min.z>=sideTop.min.z&&document.max.z<=sideTop.max.z,'planning document must fit on its side table');
    assert.ok(document.min.y>=sideTop.max.y&&document.min.y-sideTop.max.y<.01,'planning paper must rest just above the table, without floating or sinking');
  }finally{meeting.dispose();palace.dispose();planning.dispose();}
});

test('all population GPU resources release exactly once without invalidating a second live scene',()=>{
  const room=create(4),other=create(4),resources=new Set(),counts=new Map();
  room.scene.traverse(object=>{
    if(object.geometry)resources.add(object.geometry);
    if(object.isInstancedMesh)resources.add(object);
    for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]){
      resources.add(material);for(const key of ['map','bumpMap','roughnessMap'])if(material[key])resources.add(material[key]);
    }
  });
  for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
  try{
    room.dispose();room.dispose();
    for(const resource of resources)assert.equal(counts.get(resource),1,`${resource.name||resource.type} must be released once`);
    assert.equal(other.scene.userData.addedPeople,7);other.update(2);
    assert.ok(other.scene.getObjectByName('scene-daily-life').children.length>0);
  }finally{room.dispose();other.dispose();}
});
