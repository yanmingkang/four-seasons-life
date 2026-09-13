import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
for(const mode of ['default','d3d11']){
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl',...(mode==='d3d11'?['--use-angle=d3d11']:[])]});
  try{
    const page=await browser.newPage();
    await page.route('**/*',route=>route.abort());
    const info=await page.evaluate(()=>{
      const gl=document.createElement('canvas').getContext('webgl2');
      if(!gl)return {webgl2:false};
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {webgl2:true,vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
    });
    console.log(JSON.stringify({mode,...info}));
  }finally{await browser.close();}
}
