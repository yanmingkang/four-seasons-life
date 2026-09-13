import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPixelatedPass} from 'three/addons/postprocessing/RenderPixelatedPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {createCinematicScene3D,resolveCinematicTheme} from './cinematic-scenes-3d.js';
import {createReferenceDiorama} from './reference-diorama.js';

// Fit only visible geometry. Hidden original room shells and static-batch
// anchors should never shrink the authored scene inside its preview frame.
function visibleBounds(scene){
  scene.updateMatrixWorld(true);const bounds=new THREE.Box3();
  scene.traverseVisible(object=>{
    if(!object.isMesh||!object.geometry)return;
    if(object.isInstancedMesh){object.computeBoundingBox();if(object.boundingBox)bounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));}
    else{object.geometry.computeBoundingBox();bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));}
  });
  return bounds;
}

export function createPixelSceneCamera(scene){
  const bounds=visibleBounds(scene),target=bounds.getCenter(new THREE.Vector3());
  const camera=new THREE.OrthographicCamera(-10,10,7,-7,.1,120);
  camera.position.copy(target).addScaledVector(new THREE.Vector3(1,.86,1.16).normalize(),35);camera.lookAt(target);camera.updateMatrixWorld(true);
  const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  let horizontal=0,vertical=0;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const offset=new THREE.Vector3(x,y,z).sub(target);horizontal=Math.max(horizontal,Math.abs(offset.dot(right)));vertical=Math.max(vertical,Math.abs(offset.dot(up)));
  }
  camera.userData.pixelFrame={horizontal,vertical};return {camera,target};
}

// Lazy, short-lived real 3D vignette. It never moves the board or settles a turn.
export function mountScenePreview(host,event,{view='scene',captureFrame=null}={}){
  let renderer,room,camera,controls,composer,pixelPass,outputPass,observer,frame,disposed=false,time=0,last=0,renderedFrames=0;
  for(const key of ['triangles','drawCalls','camera','cameraProjection','zoom','renderer','renderStyle','renderedFrames','populationApplied','addedPeople'])delete host.dataset[key];
  const cleanup=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer?.disconnect();controls?.dispose();pixelPass?.dispose();outputPass?.dispose();composer?.dispose();room?.dispose();renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();};
  try{
    room=view==='scene'?createCinematicScene3D({theme:resolveCinematicTheme(event),cell:event.number,seed:event.number,cameraMotion:false}):createReferenceDiorama({cell:event.number,season:event.season,character:view==='character'});
    const framing=view==='scene'?createPixelSceneCamera(room.scene):{camera:room.camera,target:room.target};camera=framing.camera;
    renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.info.autoReset=false;
    // Beauty and geometry edges are sampled on the same pixel grid. Rotation
    // reveals real depth; the pixel-art appearance is never an image overlay.
    composer=new EffectComposer(renderer);pixelPass=new RenderPixelatedPass(2,room.scene,camera,{normalEdgeStrength:.14,depthEdgeStrength:.4});
    // Keep the paper/sky background clean: the stock normal-edge pass also
    // brightens background pixels beside a silhouette, creating a white halo.
    pixelPass.pixelatedMaterial.fragmentShader=pixelPass.pixelatedMaterial.fragmentShader.replace('gl_FragColor = texel * Strength;','gl_FragColor = texel * (depth < 0.99999 ? Strength : 1.0);');
    outputPass=new OutputPass();composer.addPass(pixelPass);composer.addPass(outputPass);
    host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label',`${event.location||event.title}的3D场景`);
    Object.assign(host.dataset,{view,cell:String(event.number),renderer:'webgl',renderStyle:'outlined-pixel-3d',cameraProjection:camera.isOrthographicCamera?'orthographic':'perspective',populationApplied:String(room.scene.userData.populationApplied===true),addedPeople:String(room.scene.userData.addedPeople??0)});
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minPolarAngle=.2;controls.maxPolarAngle=Math.PI*.48;
    controls.target.copy(framing.target??new THREE.Vector3(0,1.5,0));
    const distance=camera.position.distanceTo(controls.target);controls.minDistance=distance*.5;controls.maxDistance=distance*1.8;controls.minZoom=.65;controls.maxZoom=2.1;controls.update();
    const reportCamera=()=>{host.dataset.camera=camera.position.toArray().map(v=>v.toFixed(3)).join(',');host.dataset.zoom=camera.zoom.toFixed(3);};controls.addEventListener('change',reportCamera);reportCamera();
    const size=()=>{
      if(disposed)return;const w=host.clientWidth||640,h=host.clientHeight||360,aspect=w/h;renderer.setSize(w,h,false);composer.setSize(w,h);pixelPass.setPixelSize(h<260?1:2);
      if(camera.isOrthographicCamera){const fit=camera.userData.pixelFrame,halfHeight=Math.max(fit.vertical,fit.horizontal/aspect)*1.075;camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;}
      else camera.aspect=aspect;camera.updateProjectionMatrix();
    };
    observer=new ResizeObserver(size);observer.observe(host);size();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    function draw(now){
      if(disposed)return;const dialog=host.closest('dialog'),visible=!document.hidden&&(!dialog||dialog.open)&&host.getClientRects().length>0;
      if(visible){if(last)time+=Math.min((now-last)/1000,.05);room.update(captureFrame?1.5:reduced?1.5:time%12.5);controls.update();renderer.info.reset();composer.render();host.dataset.triangles=String(renderer.info.render.triangles);host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.renderedFrames=String(++renderedFrames);if(captureFrame&&renderedFrames===2)captureFrame(renderer.domElement);}
      last=visible?now:0;frame=requestAnimationFrame(draw);
    }
    frame=requestAnimationFrame(draw);return cleanup;
  }catch{cleanup();host.dataset.renderer='fallback';host.textContent='场景预览暂不可用，旅程仍可继续。';return ()=>{};}
}
