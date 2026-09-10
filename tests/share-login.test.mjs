import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderLogin} from '../server/share-login.mjs';

test('share invitation is a standalone password-form page, not account sign-in',()=>{
  const html=renderLogin();
  assert.match(html,/<html lang="zh-CN">/);
  assert.match(html,/method="post" action="\/__share\/login"/);
  assert.match(html,/name="code" type="password" autocomplete="new-password"/);
  assert.match(html,/这里不是知乎登录，请勿输入知乎密码/);
  assert.match(html,/你自己的当前浏览器/);
  assert.match(html,/分享者的电脑需要保持开机和联网/);
  assert.doesNotMatch(html,/<script\b|<link\b|@import|https?:\/\//i);
  assert.doesNotMatch(html,/name="code"[^>]*\bvalue=/);
});

test('login errors are escaped text and connected to the field accessibly',()=>{
  const html=renderLogin({error:'</p><img src=x onerror="alert(1)"> & \'secret\''});
  assert.match(html,/&lt;\/p&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;secret&#39;/);
  assert.doesNotMatch(html,/<img\b/);
  assert.match(html,/aria-invalid="true"/);
  assert.match(html,/aria-describedby="code-hint login-error"/);
  assert.match(html,/id="login-error"[^>]+aria-live="polite"/);
});

test('empty error page does not mark the code invalid',()=>{
  assert.doesNotMatch(renderLogin({error:''}),/<input\b[^>]*aria-invalid="true"/);
});
