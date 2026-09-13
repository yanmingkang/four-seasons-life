import test from 'node:test';
import assert from 'node:assert/strict';
import {sharePreviewMarkup} from '../src/share-preview.js';

const props={title:'四季回忆',url:'blob:https://game.example/preview',alt:'本局留影',caption:'二维码只分享题目，不是外网试玩地址。',filename:'知乎四时-四季回忆.png',downloadLabel:'下载四季分享卡',backLabel:'返回回忆册'};

test('share opens in readable detail mode with independent viewport and footer',()=>{
  const html=sharePreviewMarkup(props);
  assert.match(html,/data-zoom="detail"/);
  assert.match(html,/data-share-zoom aria-pressed="true" aria-controls="share-scroll"/);
  assert.match(html,/class="share-viewport" id="share-scroll" tabindex="0" role="region"/);
  assert.match(html,/<\/button>\s*<\/div>\s*<footer class="share-footer">/);
  assert.match(html,/download="知乎四时-四季回忆.png"/);
  assert.match(html,/id="back-to-report"/);
  assert.match(html,/不是外网试玩地址/);
});

test('image toggle and toolbar are keyboard reachable and named',()=>{
  const html=sharePreviewMarkup(props);
  assert.match(html,/<button type="button" class="share-zoom"/);
  assert.match(html,/<button type="button" class="share-image-button" data-share-image aria-pressed="true" aria-label="切换为整张预览">/);
  assert.match(html,/alt="本局留影" draggable="false"/);
});

test('share presentation escapes labels and attributes, retaining supplied bitmap link',()=>{
  const html=sharePreviewMarkup({...props,title:'<script>bad</script>',alt:'" onerror="bad',filename:'"bad.png',caption:'<img src=x>'});
  assert.doesNotMatch(html,/<script>|onerror="bad|<img src=x>/);
  assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html,/alt="&quot; onerror=&quot;bad"/);
  assert.equal((html.match(/blob:https:\/\/game.example\/preview/g)||[]).length,2);
});
