import {createServer} from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {renderLogin} from '../server/share-login.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('../test-results/',import.meta.url);await fs.mkdir(out,{recursive:true});
const submissions=[];
const unsafe='</p><img src=x onerror="window.__shareXss=1"> & 这不是可执行内容';
// UI-only fixture: no real gateway, access code, authentication cookie or game API.
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(req.method==='POST'&&url.pathname==='/__share/login'){
    let body='';for await(const chunk of req)body+=chunk;
    submissions.push({type:req.headers['content-type'],origin:req.headers.origin,body});
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="zh-CN"><title>UI测试提交</title><h1>测试提交已收到</h1></html>');return;
  }
  if(req.method==='GET'&&url.pathname==='/__share/login'){
    const error=url.searchParams.get('error');
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(renderLogin({error:error==='xss'?unsafe:error?'口令不匹配，请向分享者确认本次试玩口令。':''}));return;
  }
  res.writeHead(404);res.end();
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[],requests=[];
try{
  for(const [name,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    await page.goto(`${origin}/__share/login`,{waitUntil:'networkidle'});
    assert.equal(await page.locator('script,link[src],link[href]').count(),0);
    assert.equal(await page.locator('input[name="code"]').getAttribute('type'),'password');
    assert.equal(await page.locator('input[name="code"]').getAttribute('autocomplete'),'new-password');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const box=await page.locator('main').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=viewport.width);
    await page.screenshot({path:fileURLToPath(new URL(`share-login-${name}.png`,out)),fullPage:true});
    assert.equal(await page.locator('input[name="code"]').evaluate(input=>input.validity.valueMissing),true);
    await page.locator('input[name="code"]').fill('ui-test-invitation-only');
    await Promise.all([page.waitForURL(`${origin}/__share/login`),page.locator('button[type="submit"]').click()]);
    await page.getByRole('heading',{name:'测试提交已收到'}).waitFor();
    assert.equal(new URLSearchParams(submissions.at(-1).body).get('code'),'ui-test-invitation-only');
    assert.match(submissions.at(-1).type,/application\/x-www-form-urlencoded/);
    assert.equal(submissions.at(-1).origin,origin);
    await context.close();console.log(`PASS ${name}: standalone layout, no overflow, password semantics, ordinary form submission`);
  }
  const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/__share/login?error=invalid`);
  assert.equal(await page.locator('#share-code').getAttribute('aria-invalid'),'true');
  assert.equal(await page.locator('#login-error').getAttribute('aria-live'),'polite');
  await page.screenshot({path:fileURLToPath(new URL('share-login-error.png',out)),fullPage:true});
  await page.goto(`${origin}/__share/login?error=xss`);
  assert.equal(await page.locator('#login-error').textContent(),unsafe);
  assert.equal(await page.locator('img').count(),0);
  assert.equal(await page.evaluate(()=>window.__shareXss),undefined);
  assert.equal(await page.locator('#share-code').inputValue(),'');
  assert.ok(requests.every(url=>url.startsWith(origin)));
  assert.deepEqual(errors,[]);
  console.log('PASS escaped errors, aria-live, no reflected code, no external requests or scripts');
  console.log('Share login UI checks passed. No real gateway or model API used.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
