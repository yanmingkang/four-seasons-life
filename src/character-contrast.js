import * as THREE from 'three';

export const CONTACT_SHADOW_SIZE=Object.freeze([1.9,1.55]);
export const CONTACT_SHADOW_OFFSET=.003;

// A small, transparent contact patch, not a billboard, marker or luminous ring.
// Its individual vertices sit on the real road/station surfaces. It remains a
// world-space object so breathing, throwing and the walking bob cannot lift it.
export class CharacterContrast {
  constructor(scene,actor,{surfaceHeight,canvas=()=>document.createElement('canvas')}={}){
    this.scene=scene;this.actor=actor;this.surfaceHeight=surfaceHeight;this.enabled=true;this.disposed=false;
    const image=canvas();image.width=image.height=128;
    const ctx=image.getContext('2d'),gradient=ctx.createRadialGradient(64,64,0,64,64,62);
    gradient.addColorStop(0,'rgba(255,255,255,.88)');gradient.addColorStop(.25,'rgba(255,255,255,.64)');gradient.addColorStop(.62,'rgba(255,255,255,.20)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.clearRect(0,0,128,128);ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    this.texture=new THREE.CanvasTexture(image);this.texture.colorSpace=THREE.SRGBColorSpace;
    this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;
    this.geometry=new THREE.PlaneGeometry(...CONTACT_SHADOW_SIZE,12,10).rotateX(-Math.PI/2);
    this.localPositions=Float32Array.from(this.geometry.attributes.position.array);
    this.material=new THREE.MeshBasicMaterial({map:this.texture,color:'#30434a',transparent:true,opacity:.23,depthTest:true,depthWrite:false,
      polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,toneMapped:false});
    this.shadow=new THREE.Mesh(this.geometry,this.material);this.shadow.name='liukanshan-contact-shadow';this.shadow.frustumCulled=false;this.shadow.renderOrder=2;scene.add(this.shadow);
    // The existing white base colour is deliberately untouched. This only
    // shades grazing surfaces in winter, like a quiet cool contour/back side.
    // No emissive colour, extra light, geometry shell or screen-space outline.
    this.contour={value:0};this.bodyMaterial=actor.userData.rig?.belly?.material;
    if(this.bodyMaterial?.isMeshStandardMaterial){
      const mat=this.bodyMaterial,uniform=this.contour;
      this.originalCompile=mat.onBeforeCompile;this.originalCacheKey=mat.customProgramCacheKey;
      const compile=this.originalCompile,cache=this.originalCacheKey;
      mat.onBeforeCompile=function(shader,renderer){
        compile?.call(this,shader,renderer);shader.uniforms.uKanshanWinterContour=uniform;
        shader.fragmentShader='uniform float uKanshanWinterContour;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          float kanshanGrazing = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);
          outgoingLight *= mix(vec3(1.0), vec3(0.54, 0.65, 0.70), uKanshanWinterContour * kanshanGrazing);
          #include <opaque_fragment>`);
      };
      mat.customProgramCacheKey=function(){return `${cache?.call(this)||''}|liukanshan-winter-contour-v1`;};mat.needsUpdate=true;
    }
  }
  invalidate(){this.lastSurface=null;}
  update({winter=0,daylightBlend=0}={}){
    if(this.disposed)return;
    const weight=THREE.MathUtils.clamp(Number.isFinite(winter)?winter:0,0,1),sunset=THREE.MathUtils.clamp(Number.isFinite(daylightBlend)?daylightBlend:0,0,1);
    this.shadow.visible=this.enabled;this.contour.value=this.enabled?weight*THREE.MathUtils.lerp(.55,.42,sunset):0;
    this.material.opacity=THREE.MathUtils.lerp(.23,.32,weight)*(1-.08*sunset);
    if(!this.enabled)return;
    const {x,z}=this.actor.position,heading=this.actor.rotation.y,previous=this.lastSurface;
    if(previous&&Math.abs(previous.x-x)<.0005&&Math.abs(previous.z-z)<.0005&&Math.abs(previous.heading-heading)<.0001)return;
    this.lastSurface={x,z,heading};this.shadow.position.set(x,0,z);this.shadow.rotation.y=heading;
    const cos=Math.cos(heading),sin=Math.sin(heading),positions=this.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      const lx=this.localPositions[i*3],lz=this.localPositions[i*3+2],worldX=x+lx*cos+lz*sin,worldZ=z-lx*sin+lz*cos;
      positions.setY(i,this.surfaceHeight(worldX,worldZ)+CONTACT_SHADOW_OFFSET);
    }
    positions.needsUpdate=true;
    // The world calls this from scene.onBeforeRender, after Three's ordinary
    // scene matrix pass. Update our matrix now, not one moving frame later.
    this.shadow.updateMatrixWorld(true);
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.shadow.removeFromParent();this.geometry.dispose();this.material.dispose();this.texture.dispose();
    if(this.bodyMaterial?.isMeshStandardMaterial){this.bodyMaterial.onBeforeCompile=this.originalCompile;this.bodyMaterial.customProgramCacheKey=this.originalCacheKey;this.bodyMaterial.needsUpdate=true;}
    this.contour.value=0;
  }
}
