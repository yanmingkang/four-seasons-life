import test from 'node:test';
import assert from 'node:assert/strict';
import {safeZhihuAuthorizationUrl,consumeZhihuAuthNotice,saveZhihuLoginDraft,restoreZhihuLoginDraft,ZHIHU_LOGIN_DRAFT_KEY} from '../src/zhihu-auth-ui.js';

const origin='https://zhihu-four-seasons.pages.dev';
const authorize=()=>new URL('https://openapi.zhihu.com/authorize?'+new URLSearchParams({app_id:'test-app',response_type:'code',redirect_uri:origin+'/api/auth/zhihu/callback',state:'a'.repeat(64)}));
test('login accepts only the official authorize target and same-site fixed callback',()=>{
  assert.equal(safeZhihuAuthorizationUrl(authorize().href,origin),authorize().href);
  for(const change of [url=>url.protocol='http:',url=>url.hostname='openapi.zhihu.com.evil.test',url=>url.port='8443',url=>url.username='x',url=>url.password='x',url=>url.pathname='/access_token',url=>url.hash='x',url=>url.searchParams.set('redirect_uri','https://evil.test/callback'),url=>url.searchParams.set('redirect_uri',origin+'/api/auth/zhihu/callback/'),url=>url.searchParams.set('response_type','token'),url=>url.searchParams.set('state','short'),url=>url.searchParams.delete('app_id'),url=>url.searchParams.append('state','b'.repeat(64)),url=>url.searchParams.set('return_to','https://evil.test')]){
    const url=authorize();change(url);assert.equal(safeZhihuAuthorizationUrl(url.href,origin),null,url.href);
  }
  for(const value of ['javascript:alert(1)','//openapi.zhihu.com/authorize',null,{},'x'.repeat(5000)])assert.equal(safeZhihuAuthorizationUrl(value,origin),null);
});
test('callback notice removes only auth and retains other parameters, hash and history state',()=>{
  let replaced;
  const history={state:{existing:1},replaceState(...args){replaced=args;}};
  assert.equal(consumeZhihuAuthNotice({href:origin+'/?auth=success&view=map#keep'},history),'success');
  assert.deepEqual(replaced,[{existing:1},'','/?view=map#keep']);
  assert.equal(consumeZhihuAuthNotice({href:origin+'/?auth=failed'},history),'failed');
  assert.equal(consumeZhihuAuthNotice({href:origin+'/?auth=success&auth=failed'},history),null);
  assert.equal(consumeZhihuAuthNotice({href:origin+'/?auth=<script>'},history),null);
});
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('only a bounded non-sensitive one-use setup draft is restored after callback',()=>{
  const storage=memory(),setup={name:'我自己起的名字',talent:'optimistic'},now=10000;
  assert.equal(saveZhihuLoginDraft(storage,setup,now),true);
  assert.deepEqual(JSON.parse(storage.getItem(ZHIHU_LOGIN_DRAFT_KEY)),{...setup,expires:610000});
  assert.equal(restoreZhihuLoginDraft(storage,{href:origin},now),null);
  assert.deepEqual(restoreZhihuLoginDraft(storage,{href:origin+'/?auth=success'},now),setup);
  assert.equal(storage.getItem(ZHIHU_LOGIN_DRAFT_KEY),null);
  assert.equal(restoreZhihuLoginDraft(storage,{href:origin+'/?auth=success'},now),null);
  saveZhihuLoginDraft(storage,setup,now);
  assert.deepEqual(restoreZhihuLoginDraft(storage,{href:origin+'/?auth=failed'},now),setup);
});
test('expired, oversized, corrupt or invalid drafts never replace player input',()=>{
  const storage=memory(),location={href:origin+'/?auth=success'},now=10000;
  for(const raw of ['broken','x'.repeat(513),JSON.stringify({name:'x',talent:'admin',expires:20000}),JSON.stringify({name:'x'.repeat(17),talent:'defense',expires:20000}),JSON.stringify({name:'x',talent:'defense',expires:9999}),JSON.stringify({name:'x',talent:'defense',expires:99999999})]){
    storage.setItem(ZHIHU_LOGIN_DRAFT_KEY,raw);assert.equal(restoreZhihuLoginDraft(storage,location,now),null);assert.equal(storage.getItem(ZHIHU_LOGIN_DRAFT_KEY),null);
  }
  assert.equal(saveZhihuLoginDraft(storage,{name:'x',talent:'invalid'},now),false);
  const denied={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  assert.equal(saveZhihuLoginDraft(denied,{name:'x',talent:'defense'},now),false);
  assert.equal(restoreZhihuLoginDraft(denied,location,now),null);
});
