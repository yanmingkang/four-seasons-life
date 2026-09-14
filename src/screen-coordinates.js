// DOM pointer positions and bounding rectangles use rendered screen pixels.
// Canvas cameras/layout use client dimensions, which are unchanged by a CSS
// transform. Keep the conversion local to input/layout rather than the game.
const finite=value=>Number.isFinite(value);
const localRatio=(logical,screen)=>finite(logical)&&logical>0&&finite(screen)&&screen>0?logical/screen:1;

export function screenRectToLocal(rect,containerRect,width,height){
  const xScale=localRatio(width,containerRect.width),yScale=localRatio(height,containerRect.height);
  return {x:(rect.x-containerRect.x)*xScale,y:(rect.y-containerRect.y)*yScale,width:rect.width*xScale,height:rect.height*yScale};
}

export function canvasInputScale(element){
  const rect=element?.getBoundingClientRect?.();
  if(!rect)return {x:1,y:1};
  return {x:localRatio(element.clientWidth,rect.width),y:localRatio(element.clientHeight,rect.height)};
}

// OrbitControls divides physical pointer deltas by clientHeight. Its native
// pinch ratio and wheel zoom are already scale independent; only rotation
// needs compensation. Capture runs before OrbitControls' target listeners and
// remeasures during a gesture without any per-frame layout reads.
export function bindScaledOrbitInput(controls,element=controls?.domElement){
  if(!controls||!element?.addEventListener)return ()=>{};
  const original=controls.rotateSpeed;let written=original,disposed=false;
  const sync=()=>{
    const ratio=canvasInputScale(element).y;
    // Ignore subpixel clientHeight rounding for an ordinary unscaled canvas.
    written=original*(Math.abs(ratio-1)<.001?1:ratio);
    controls.rotateSpeed=written;
  };
  for(const type of ['pointerdown','pointermove'])element.addEventListener(type,sync,{capture:true,passive:true});
  return ()=>{
    if(disposed)return;disposed=true;
    for(const type of ['pointerdown','pointermove'])element.removeEventListener(type,sync,true);
    if(controls.rotateSpeed===written)controls.rotateSpeed=original;
  };
}
