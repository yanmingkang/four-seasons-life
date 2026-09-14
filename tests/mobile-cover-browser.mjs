// Landscape cover acceptance: real Chrome/WebGL, ephemeral Vite and isolated
// storage. Every API request is synthetic; these are not physical-phone tests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {newGame,land,choose,advance,snapshot,restore} from '../src/engine.js';
import {completeMemoryFixture} from './memory-fixtures.mjs';
import {JOURNEY_STORAGE_KEY} from '../src/journey-storage.js';
import {claimLegacy,LEGACY_KEY} from '../src/life-legacy.js';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=fileURLToPath(new URL('../test-results/mobile-cover/',import.meta.url));
const viewports=[[667,280],[812,280],[844,300],[844,390],[915,412],[1280,800]];
const talents=['defense','ambitious','optimistic'];
const effects=[
  '开局带【留痕备忘录】，首次甩锅抵挡事件本身的消耗。',
  '提前使用会消耗这次保护；累积疲惫仍需休息。',
  '事件专业收益 +20%，负面事件情绪消耗 +10%。',
  '更快成长，也更容易感到疲惫。',
  '每跨入一个新季节，自动恢复 15 点情绪。',
  '随当次事件结算，不超过情绪上限。',
];
const titleNames=['稳健防守型','锐意进取型','乐天知命型'];
const accountName='手机封面验收的知乎账户用户名特别长不能挤掉心态选择';
const nickname='旅人昵称需要在弹窗关闭后保持不变'.slice(0,16);
const labelFor=value=>`.talent-picker label:has(input[value="${value}"])`;
const coreSelectors=[...talents.map(labelFor),'#character-name','#start-full'];
const report={passed:false,phase:'prepare',startedAt:new Date().toISOString(),cases:[],screenshots:[],errors:[],apiIntercepted:[],externalBlocked:[],realApiCalls:0,
  method:{server:'Ephemeral local Vite; actual WebGL renderer',browser:'Chrome desktop and touch landscape viewports; not a physical iPhone or WeChat run',
    network:'All /api/ requests intercepted; auth/status mocked with exact local callback; all external HTTP requests blocked',
    fixtures:'Engine-replay-valid ongoing save and separately claimed completed-memory legacy',
    visibility:'All three cards, nickname and start button checked together before any pointer, focus, check or scrolling operation; full ancestor intersection plus nine hit-test points',
    selection:'Coordinate clicks cannot invoke Playwright automatic scrolling; all welcome ancestor scroll offsets compared after each choice',
    persistence:'Nickname, talent, inheritance toggle and raw journey/legacy storage compared before and after details-dialog closure',
    resize:'Two same-context mobile sequences, anonymous and authenticated with legal saves: 844x300 -> 667x280 -> 844x390 -> portrait 390x844 -> 844x390 -> 667x280 -> 844x300; scale/layout sampled at 300ms and 1300ms'}};
let vite,browser,page,base;

function fixture(){
  const entries=new Map();
  const storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};
  assert.equal(claimLegacy(completeMemoryFixture(),storage).claimed,true,'Legacy is claimed by a legal completed engine fixture');
  let state=newGame('full',{enriched:true,name:'验收前已经保存的旅人',talent:'defense'});
  state=advance(choose(land(state,1),0));
  const game=snapshot(state);assert.ok(restore(game),'Ongoing fixture is replay-valid');
  return {legacyRaw:entries.get(LEGACY_KEY),journeyRaw:JSON.stringify({game,seconds:123,practiceInvitation:{version:1,seen:true,resolved:true,kind:'fallback'}},null,2)};
}
const savedFixture=fixture();

async function capture(name){const path=`${out}/${name}.png`;await page.screenshot({path});report.screenshots.push(path);}
async function settle(){
  await page.evaluate(async()=>{
    await document.fonts.ready;
    const panel=document.querySelector('#story-panel');
    await Promise.all((panel?.getAnimations({subtree:true})||[]).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
}

async function geometry(selectors,stage,row){
  const result=await page.evaluate(selectors=>{
    const vv=visualViewport,style=getComputedStyle(document.documentElement);
    const safe=side=>parseFloat(style.getPropertyValue('--game-safe-'+side))||0;
    const viewport={left:(vv?.offsetLeft||0)+safe('left'),top:(vv?.offsetTop||0)+safe('top'),
      right:(vv?.offsetLeft||0)+(vv?.width||innerWidth)-safe('right'),bottom:(vv?.offsetTop||0)+(vv?.height||innerHeight)-safe('bottom')};
    const summary=node=>node?node.tagName.toLowerCase()+(node.id?'#'+node.id:'')+(typeof node.className==='string'&&node.className?'.'+node.className.trim().split(/\s+/).join('.'):''):null;
    return selectors.map(selector=>{
      const node=document.querySelector(selector);if(!node)return {selector,missing:true};
      const rect=node.getBoundingClientRect(),css=getComputedStyle(node),intersection={...viewport},clips=[];
      let rendered=Boolean(node.getClientRects().length)&&css.visibility!=='hidden'&&css.display!=='none'&&Number(css.opacity)>0;
      for(let ancestor=node.parentElement;ancestor;ancestor=ancestor.parentElement){
        const acss=getComputedStyle(ancestor),ar=ancestor.getBoundingClientRect();
        rendered=rendered&&acss.visibility!=='hidden'&&acss.display!=='none'&&Number(acss.opacity)>0;
        // display:contents has no principal box, so inherited overflow styles
        // cannot clip its children at a synthetic zero-size rectangle.
        const hasBox=acss.display!=='contents';
        const clipX=hasBox&&/^(auto|scroll|hidden|clip)$/.test(acss.overflowX),clipY=hasBox&&/^(auto|scroll|hidden|clip)$/.test(acss.overflowY);
        if(clipX||clipY){
          const bounds={left:ar.left+ancestor.clientLeft,top:ar.top+ancestor.clientTop,
            right:ar.left+ancestor.clientLeft+ancestor.clientWidth,bottom:ar.top+ancestor.clientTop+ancestor.clientHeight};
          if(clipX){intersection.left=Math.max(intersection.left,bounds.left);intersection.right=Math.min(intersection.right,bounds.right);}
          if(clipY){intersection.top=Math.max(intersection.top,bounds.top);intersection.bottom=Math.min(intersection.bottom,bounds.bottom);}
          clips.push({ancestor:summary(ancestor),clipX,clipY,bounds});
        }
      }
      const within=rect.width>0&&rect.height>0&&rect.left>=viewport.left-.5&&rect.top>=viewport.top-.5&&rect.right<=viewport.right+.5&&rect.bottom<=viewport.bottom+.5;
      const fullyIntersecting=rect.left>=intersection.left-.5&&rect.top>=intersection.top-.5&&rect.right<=intersection.right+.5&&rect.bottom<=intersection.bottom+.5;
      const radius=Math.max(...['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].map(key=>parseFloat(css[key])||0));
      // Slightly inset corners avoid sampling transparent rounded-border pixels.
      // The full unrounded box is still independently checked against all clips.
      const insetX=Math.min(rect.width/4,Math.max(2,radius/2+1)),insetY=Math.min(rect.height/4,Math.max(2,radius/2+1));
      const points=[];
      for(const [yName,y]of [['top',rect.top+insetY],['middle',rect.top+rect.height/2],['bottom',rect.bottom-insetY]]){
        for(const [xName,x]of [['left',rect.left+insetX],['center',rect.left+rect.width/2],['right',rect.right-insetX]]){
          const hit=document.elementFromPoint(x,y);points.push({position:`${yName}-${xName}`,x,y,hit:summary(hit),uncovered:hit===node||node.contains(hit)});
        }
      }
      const intersectionArea=Math.max(0,Math.min(rect.right,intersection.right)-Math.max(rect.left,intersection.left))*Math.max(0,Math.min(rect.bottom,intersection.bottom)-Math.max(rect.top,intersection.top));
      return {selector,rect:rect.toJSON(),viewport,intersection,intersectionRatio:rect.width&&rect.height?intersectionArea/(rect.width*rect.height):0,rendered,within,fullyIntersecting,clips,points};
    });
  },selectors);
  row.geometry.push({stage,controls:result});
  for(const item of result){
    assert.equal(item.missing,undefined,`${row.id} ${stage}: ${item.selector} exists`);
    assert.ok(item.rendered,`${row.id} ${stage}: ${item.selector} is rendered`);
    assert.ok(item.within,`${row.id} ${stage}: ${item.selector} fits the visible viewport`);
    assert.ok(item.fullyIntersecting,`${row.id} ${stage}: ${item.selector} is not cropped by an ancestor (${JSON.stringify(item.rect)} in ${JSON.stringify(item.intersection)})`);
    assert.ok(item.points.every(point=>point.uncovered),`${row.id} ${stage}: ${item.selector} has no center/edge/corner obstruction (${JSON.stringify(item.points.filter(point=>!point.uncovered))})`);
  }
  return result;
}

async function scrollOffsets(){
  return page.evaluate(()=>{
    const nodes=new Set([document.documentElement,document.body]);
    for(const selector of ['#character-name','.talent-picker','#start-full']){
      for(let node=document.querySelector(selector)?.parentElement;node;node=node.parentElement)nodes.add(node);
    }
    return [...nodes].map(node=>({node:node.id?'#'+node.id:node.tagName.toLowerCase()+'.'+String(node.className).trim().split(/\s+/).join('.'),top:node.scrollTop,left:node.scrollLeft}));
  });
}
async function formState(){
  return page.evaluate(({journeyKey,legacyKey})=>({
    name:document.querySelector('#character-name').value,talent:document.querySelector('input[name="talent"]:checked')?.value,
    inheritance:document.querySelector('#inherit-next')?.checked??null,
    journeyRaw:localStorage.getItem(journeyKey),legacyRaw:localStorage.getItem(legacyKey),
  }),{journeyKey:JOURNEY_STORAGE_KEY,legacyKey:LEGACY_KEY});
}
async function clickPoint(selector){
  const point=await page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
  await page.mouse.click(point.x,point.y);
}

async function openCover({width,height,authenticated,legacy,mobile,id}){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(({journeyKey,legacyKey,journeyRaw,legacyRaw})=>{
    localStorage.setItem('four-seasons-auto-depart','off');localStorage.setItem('four-seasons-music','off');
    if(journeyRaw!==null)localStorage.setItem(journeyKey,journeyRaw);
    if(legacyRaw!==null)localStorage.setItem(legacyKey,legacyRaw);
  },{journeyKey:JOURNEY_STORAGE_KEY,legacyKey:LEGACY_KEY,journeyRaw:legacy?savedFixture.journeyRaw:null,legacyRaw:legacy?savedFixture.legacyRaw:null});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base&&!['blob:','data:'].includes(url.protocol)){report.externalBlocked.push({id,url:url.href});return route.abort();}
    if(url.pathname.startsWith('/api/')){
      report.apiIntercepted.push({id,path:url.pathname,method:route.request().method()});
      if(url.pathname==='/api/auth/status')return route.fulfill({json:{enabled:true,authenticated,provider:'zhihu',callbackUrl:base+'/api/auth/zhihu/callback',...(authenticated?{profile:{name:accountName}}:{})}});
      return route.fulfill({status:503,json:{error:'isolated_mobile_cover_no_live_api'}});
    }
    return route.continue();
  });
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.errors.push({id,message:error.message}));
  const authResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/status');
  await page.goto(base);await authResponse;
  await page.locator('#scene[data-assets="ready"][data-renderer="webgl"]').waitFor();
  await page.locator('.experience[data-stage="welcome"] #start-full').waitFor();
  if(authenticated)await page.locator('.welcome-account-slot .zhihu-account-name').waitFor({state:'attached'});
  await settle();
  return context;
}

async function runCase(width,height,authenticated,legacy){
  const mobile=height<=650,id=`${width}x${height}-${authenticated?'signed-in-long-name':'anonymous'}-${legacy?'legacy-save':'fresh'}`;
  const row={id,kind:'fresh',width,height,authenticated,legacy,mobile,passed:false,geometry:[],selections:[]};report.cases.push(row);report.phase=id+'-load';
  const context=await openCover({width,height,authenticated,legacy,mobile,id});

  // This is intentionally the first UI inspection, before any operation that
  // could bring an offscreen control into view or hide an original clipping bug.
  report.phase=id+'-initial-unscrolled';
  assert.equal(await page.locator('.talent-picker label').count(),3);
  const first=await geometry(coreSelectors,'initial-unscrolled',row);
  row.initialScroll=await scrollOffsets();
  assert.ok(row.initialScroll.every(item=>item.top===0&&item.left===0),'Initial welcome ancestors have never scrolled');
  assert.equal(await page.locator('.welcome-actions button').count(),1,'There is one primary journey action');
  const initial=await formState();
  assert.equal(initial.journeyRaw,legacy?savedFixture.journeyRaw:null,'Loading preserves original journey bytes');
  assert.equal(initial.legacyRaw,legacy?savedFixture.legacyRaw:null,'Loading preserves original legacy bytes');
  assert.equal(await page.locator('#inherit-next').count(),legacy?1:0,'Legal legacy fixture mounts inheritance');
  if(authenticated)assert.equal(await page.locator('.welcome-account-slot .zhihu-account-name').innerText(),'知乎 · '+accountName);
  else assert.equal(await page.locator('.welcome-account-slot').isVisible(),false);
  if(mobile){
    const cards=first.slice(0,3).map(item=>item.rect);
    assert.ok(Math.max(...cards.map(card=>card.top))-Math.min(...cards.map(card=>card.top))<=1,'All three mobile cards occupy one visible row');
    assert.ok(cards[0].right<=cards[1].left+1&&cards[1].right<=cards[2].left+1,'Mobile cards do not overlap each other');
    assert.equal(await page.locator('.talent-brief:visible').count(),3,'All three mobile cards show their concise explanation');
    await geometry(['#talent-details'],'initial-details-entry',row);
  }else{
    assert.equal(await page.locator('#talent-details').isVisible(),false,'Desktop hides the mobile details entry');
    assert.equal(await page.locator('.talent-brief:visible').count(),0,'Desktop hides the additional mobile-only brief text');
    assert.equal(await page.locator('.talent-effect:visible').count(),3,'Desktop keeps all full effects visible');
    assert.equal(await page.locator('.talent-note:visible').count(),3,'Desktop keeps all notes visible');
    const text=await page.locator('.talent-picker').innerText();for(const effect of effects)assert.ok(text.includes(effect),`Desktop retains full rule: ${effect}`);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
  await capture(id+'-initial');

  await page.locator('#character-name').fill(nickname);
  const baselineScroll=await scrollOffsets();
  for(const talent of talents){
    report.phase=id+'-select-'+talent;
    await clickPoint(labelFor(talent));await settle();
    assert.equal(await page.locator('input[name="talent"]:checked').inputValue(),talent,`Coordinate click selects ${talent}`);
    const afterScroll=await scrollOffsets();assert.deepEqual(afterScroll,baselineScroll,`Selecting ${talent} does not move any welcome ancestor`);
    await geometry(coreSelectors,'selected-'+talent,row);
    row.selections.push({talent,scrollUnchanged:true});
  }
  if(legacy){
    // A user-modified inheritance setting must survive the information dialog.
    await page.locator('#inherit-next').uncheck();
    await geometry(coreSelectors,'inheritance-disabled',row);
  }

  if(mobile){
    report.phase=id+'-details';
    const before=await formState(),beforeScroll=await scrollOffsets();
    await clickPoint('#talent-details');await page.locator('#dialog.talent-info-dialog[open]').waitFor();await settle();
    await geometry(['#dialog','#dialog-close'],'details-open',row);
    const text=await page.locator('#dialog-content').innerText();
    for(const title of titleNames)assert.ok(text.includes(title),`Details includes ${title}`);
    for(const effect of effects)assert.ok(text.includes(effect),`Details includes complete rule: ${effect}`);
    assert.deepEqual(await formState(),before,'Opening details leaves form and both save records untouched');
    row.detailsText=text;await capture(id+'-details');
    await clickPoint('#dialog-close');await page.locator('#dialog[open]').waitFor({state:'hidden'});await settle();
    assert.deepEqual(await formState(),before,'Closing details keeps nickname, talent, inheritance and original save bytes');
    assert.deepEqual(await scrollOffsets(),beforeScroll,'Closing details restores the unchanged welcome scroll offsets');
    await geometry(coreSelectors,'details-closed',row);row.detailsPreservedState=true;
    // The same dialog must remain reusable, with normal Escape dismissal.
    await clickPoint('#talent-details');await page.locator('#dialog.talent-info-dialog[open]').waitFor();
    await page.keyboard.press('Escape');await page.locator('#dialog[open]').waitFor({state:'hidden'});await settle();
    assert.deepEqual(await formState(),before,'Escape dismissal also preserves form and saves');
    assert.deepEqual(await scrollOffsets(),beforeScroll,'Escape dismissal leaves welcome scroll unchanged');
    await geometry(coreSelectors,'details-escape-closed',row);row.escapePreservedState=true;
  }
  const after=await formState();assert.equal(after.name,nickname);assert.equal(after.talent,'optimistic');
  assert.equal(after.journeyRaw,initial.journeyRaw);assert.equal(after.legacyRaw,initial.legacyRaw);
  await capture(id+'-configured');
  row.passed=true;await context.close();page=null;console.log(`Mobile cover ${id}: passed`);
}

async function assertViewport(width,height,stage,row){
  const metrics=await page.evaluate(()=>{
    const root=document.documentElement,vv=visualViewport,experience=document.querySelector('.experience').getBoundingClientRect(),style=getComputedStyle(root);
    return {inner:{width:innerWidth,height:innerHeight},root:{width:root.clientWidth,height:root.clientHeight,scrollWidth:root.scrollWidth,scrollHeight:root.scrollHeight},
      visual:{width:vv.width,height:vv.height,scale:vv.scale,left:vv.offsetLeft,top:vv.offsetTop},experience:experience.toJSON(),
      css:Object.fromEntries(['width','height','top','left'].map(key=>[key,style.getPropertyValue('--game-viewport-'+key)]))};
  });
  row.viewportSamples.push({stage,expected:{width,height},...metrics});
  const message=`${row.id} ${stage}: ${JSON.stringify(metrics)}`;
  assert.ok(Math.abs(metrics.visual.scale-1)<=.001,'Browser must not shrink or magnify the resized cover: '+message);
  for(const source of ['inner','root','visual','experience']){
    assert.ok(Math.abs(metrics[source].width-width)<=.5,`${source} width must match the requested layout: ${message}`);
    assert.ok(Math.abs(metrics[source].height-height)<=.5,`${source} height must match the requested layout: ${message}`);
  }
  assert.ok(Math.abs(metrics.experience.left)<=.5&&Math.abs(metrics.experience.top)<=.5,'Experience remains aligned to the layout origin: '+message);
  assert.ok(Math.abs(metrics.visual.left)<=.5&&Math.abs(metrics.visual.top)<=.5,'Resize does not pan the visual viewport: '+message);
  assert.ok(metrics.root.scrollWidth<=width+1,'Resize does not leave horizontal layout overflow: '+message);
}

async function runResizeCase(authenticated){
  const id=`same-context-resize-${authenticated?'signed-in-long-name':'anonymous'}-legacy-save`;
  const row={id,kind:'resize',authenticated,legacy:true,mobile:true,passed:false,geometry:[],viewportSamples:[],steps:[]};
  report.cases.push(row);report.phase=id+'-load';
  const context=await openCover({width:844,height:300,authenticated,legacy:true,mobile:true,id});
  await geometry(coreSelectors,'initial-unscrolled',row);
  await assertViewport(844,300,'initial-layout',row);
  await page.locator('#character-name').fill(nickname);
  await clickPoint(labelFor('ambitious'));
  await page.locator('#inherit-next').uncheck();
  const before=await formState(),originalScroll=await scrollOffsets();
  assert.equal(before.name,nickname);assert.equal(before.talent,'ambitious');assert.equal(before.inheritance,false);
  assert.equal(before.journeyRaw,savedFixture.journeyRaw);assert.equal(before.legacyRaw,savedFixture.legacyRaw);
  assert.ok(originalScroll.every(item=>item.top===0&&item.left===0),'Configured resize baseline is unscrolled');
  const sequence=[[844,300],[667,280],[844,390],[390,844],[844,390],[667,280],[844,300]];
  for(const [index,[width,height]]of sequence.entries()){
    const stage=`step-${index}-${width}x${height}`,portrait=height>width;
    report.phase=id+'-'+stage;
    await page.setViewportSize({width,height});
    // Check the exact same document at two stable times. Creating another
    // context or reloading would hide the previously reproduced width feedback.
    await page.waitForTimeout(300);await settle();
    await assertViewport(width,height,stage+'-300ms',row);
    await page.waitForTimeout(1000);await settle();
    await assertViewport(width,height,stage+'-1300ms',row);
    assert.deepEqual(await formState(),before,'Resize preserves nickname, selected mindset, inheritance and save bytes');
    assert.deepEqual(await scrollOffsets(),originalScroll,'Resize does not scroll any welcome ancestor');
    if(portrait){
      await page.locator('#orientation-gate').waitFor();
      await geometry(['#orientation-gate'],'portrait-gate',row);
      assert.equal(await page.locator('#overlay-shell').evaluate(node=>node.inert),true,'Portrait gate blocks interaction with the underlying form');
    }else{
      await page.locator('#orientation-gate').waitFor({state:'hidden'});
      await geometry(coreSelectors,stage+'-before-input',row);
      assert.equal(await page.locator('#overlay-shell').evaluate(node=>node.inert),false,'Returning to landscape restores form interaction');
      for(const talent of talents){
        await clickPoint(labelFor(talent));
        assert.equal(await page.locator('input[name="talent"]:checked').inputValue(),talent);
        assert.deepEqual(await scrollOffsets(),originalScroll,`Selecting ${talent} after resize cannot move the form`);
      }
      await clickPoint(labelFor(before.talent));
      assert.deepEqual(await formState(),before,'Selection exercise restores the original mindset and preserves nickname and save bytes');
      assert.deepEqual(await scrollOffsets(),originalScroll,'Selection exercise ends with all original scroll offsets');
      await geometry(coreSelectors,stage+'-after-input',row);
    }
    await capture(id+'-'+stage);row.steps.push({width,height,portrait,statePreserved:true,scrollUnchanged:true});
  }
  row.passed=true;await context.close();page=null;console.log(`Mobile cover ${id}: passed`);
}

try{
  await fs.mkdir(out,{recursive:true});
  vite=await createServer({root,server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();base=vite.resolvedUrls.local[0].replace(/\/$/,'');
  report.base=base;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist']});
  for(const [width,height]of viewports)for(const authenticated of [false,true])for(const legacy of [false,true])await runCase(width,height,authenticated,legacy);
  for(const authenticated of [false,true])await runResizeCase(authenticated);
  assert.deepEqual(report.errors,[],'No browser runtime errors');assert.equal(report.realApiCalls,0);
  assert.equal(report.cases.filter(row=>row.kind==='fresh').length,24);assert.equal(report.cases.filter(row=>row.kind==='resize').length,2);
  assert.equal(report.cases.length,26);assert.ok(report.cases.every(row=>row.passed));report.passed=true;report.phase='complete';
}catch(error){
  report.failure={phase:report.phase,message:error.message,stack:error.stack};
  if(page&&!page.isClosed()){await capture('failure').catch(()=>{});report.failureUI=await page.evaluate(()=>({stage:document.querySelector('.experience')?.dataset.stage,text:document.body.innerText.slice(-8000)})).catch(()=>null);}
  throw error;
}finally{
  report.finishedAt=new Date().toISOString();await fs.mkdir(out,{recursive:true});await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
  await browser?.close();await vite?.close();
}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,screenshots:out,realApiCalls:report.realApiCalls}));
