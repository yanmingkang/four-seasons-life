const escapeHtml=value=>String(value).replace(/[&<>"']/g,character=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[character]));

/** Standalone invitation page. Authentication, cookies and CSRF belong to the gateway. */
export function renderLogin({error=''}={}) {
  const message=error?escapeHtml(error):'';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="referrer" content="same-origin">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#edf0e4">
  <title>朋友试玩 · 四时人生</title>
  <style>
    :root{color-scheme:light;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;color:#284c3b;background:#edf0e4;line-height:1.7;font-synthesis:none}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%}body{min-height:100dvh;background:radial-gradient(ellipse at 18% 15%,#d6e4cf 0,transparent 47%),radial-gradient(ellipse at 85% 85%,#e8e3c8 0,transparent 42%),#edf0e4;display:grid;place-items:center;padding:36px 20px;overflow-x:hidden}
    body:before,body:after{content:'';position:fixed;pointer-events:none;z-index:-1;border:1px solid #b8c8a544;border-radius:50%;width:620px;height:620px;left:-330px;top:5%;transform:rotate(-22deg)}body:after{left:auto;top:auto;right:-380px;bottom:-240px;width:780px;height:780px;border-color:#c8bd9040}
    a,button,input{-webkit-tap-highlight-color:transparent}button,input{font:inherit}button:focus-visible,input:focus-visible{outline:3px solid #bb974e;outline-offset:4px}
    .invite{width:min(460px,100%);position:relative;background:#fffcf4;border:1px solid #fffef7;border-radius:27px;padding:30px 38px 25px;box-shadow:0 20px 70px #38503d18,0 3px 15px #60734b08}.invite:before{content:'';position:absolute;height:3px;left:36px;right:36px;top:0;background:linear-gradient(90deg,#9baa81,#7e9b75,#c6b87a);border-radius:4px}
    .brand{display:flex;align-items:center;gap:11px}.brand-mark{width:42px;height:45px;border-radius:13px 13px 13px 3px;display:grid;place-items:center;background:#315f48;color:#fff9dc;font:30px Georgia,"SimSun",serif}.brand-name{font-family:"SimSun",serif;font-size:23px;letter-spacing:4px;line-height:1.3;color:#305b43}.brand-name small{display:block;margin-top:5px;font:8px/1.5 system-ui,sans-serif;letter-spacing:1.8px;color:#8b936e}.badge{margin-left:auto;padding:3px 8px;border:1px solid #e2e5d4;border-radius:5px;font-size:10px;letter-spacing:.4px;color:#929368;white-space:nowrap}
    .letter-mark{display:grid;place-items:center;width:60px;height:60px;margin:34px 0 17px;border-radius:50%;background:#edf1e1;border:1px solid #dfe6cd;color:#8a9e6e}.letter-mark svg{width:27px;height:27px;display:block}
    .eyebrow{font-size:9px;letter-spacing:2.1px;color:#a08f5e;margin:0 0 9px}h1{font-family:"SimSun",serif;font-size:29px;font-weight:500;line-height:1.55;letter-spacing:1.2px;margin:0 0 13px;color:#31583f}.intro{font-size:13px;line-height:1.9;color:#738267;margin:0 0 25px}
    label{display:block;color:#435f42;font-size:12px;margin-bottom:9px}.field{position:relative}input{display:block;width:100%;min-height:52px;padding:13px 15px;border:1px solid #cfdcc0;border-radius:11px;background:#fffef9;color:#284a32;letter-spacing:1px;font-size:16px;line-height:1.5;box-shadow:inset 0 2px 3px #75815d05}input::placeholder{font-size:13px;letter-spacing:0;color:#9aab88}input:hover{border-color:#a9bd91}input:focus{border-color:#859f6c;background:#fffef9}input[aria-invalid="true"]{border-color:#bf8d76;background:#fffaf4}.field-hint{font-size:11px;line-height:1.8;color:#8c9a7a;margin:9px 1px 0}.field-hint strong{font-weight:500;color:#697d58}
    .error{padding:11px 13px;margin:14px 0 0;border:1px solid #ebd6c5;border-radius:9px;background:#fbf0e6;color:#9b513b;font-size:12px;line-height:1.85;overflow-wrap:anywhere}.error:empty{display:none}
    .submit{margin-top:21px;width:100%;display:flex;align-items:center;justify-content:center;gap:12px;min-height:50px;padding:12px 15px;background:#2c5a41;border:1px solid #2c5a41;border-radius:11px;color:#fff9df;font-size:14px;cursor:pointer;letter-spacing:.6px;box-shadow:0 5px 15px #3a634520;transition:background .18s,transform .18s}.submit:hover{background:#214d34;transform:translateY(-1px)}.submit:active{transform:none}.submit svg{width:17px;height:17px}
    .visit-note{border-top:1px solid #e7eadb;padding-top:18px;margin-top:24px;display:grid;gap:10px}.note-row{display:flex;align-items:flex-start;gap:10px;font-size:11px;color:#849375;line-height:1.85}.note-row svg{width:15px;height:15px;flex-shrink:0;margin-top:2px;color:#9aa983}.note-row p{margin:0}.note-row strong{font-weight:500;color:#617a53}
    footer{text-align:center;color:#9da489;font-size:9px;line-height:1.8;letter-spacing:.8px;margin-top:21px}.quiet-path{position:absolute;right:37px;top:140px;display:flex;gap:6px;align-items:center;color:#a3aa8b}.quiet-path i{width:6px;height:6px;border:1px solid #bec7a7;border-radius:50%}.quiet-path i:nth-child(2){background:#cfd6b6}.quiet-path:before,.quiet-path:after{content:'';width:12px;height:1px;background:#d9dfc8}
    @media(max-width:480px){body{padding:22px 15px;align-items:center}.invite{padding:26px 27px 22px;border-radius:23px}.invite:before{left:28px;right:28px}.brand-mark{width:38px;height:41px;font-size:27px}.brand-name{font-size:21px;letter-spacing:3px}.brand-name small{font-size:7px;letter-spacing:1.5px}.badge{font-size:9px;padding:3px 6px}.letter-mark{width:53px;height:53px;margin-top:29px;margin-bottom:16px}h1{font-size:27px;letter-spacing:.8px}.intro{font-size:12px;margin-bottom:22px}.quiet-path{right:28px;top:130px}.visit-note{padding-top:16px;margin-top:22px}.note-row{font-size:10px;gap:9px}.field-hint{font-size:10px}.submit{margin-top:19px}footer{font-size:8px;margin-top:19px}}
    @media(max-height:720px){body{padding-top:20px;padding-bottom:20px}.letter-mark{margin-top:23px}.visit-note{margin-top:20px}.invite{padding-top:25px;padding-bottom:21px}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
  </style>
</head>
<body>
  <main class="invite" aria-labelledby="invite-title">
    <div class="brand"><span class="brand-mark" aria-hidden="true">四</span><span class="brand-name">四时人生<small>A LITTLE JOURNEY OF LIFE</small></span><span class="badge">朋友试玩</span></div>
    <div class="letter-mark" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M23 5C13 3 5 8 5 15a7 7 0 0 0 7 7c7 0 12-8 11-17Z"/><path d="m6 24 12-13m-8 9v-6m3 3h6"/></svg></div>
    <div class="quiet-path" aria-hidden="true"><i></i><i></i><i></i></div>
    <p class="eyebrow">A SMALL INVITATION FOR YOU</p>
    <h1 id="invite-title">朋友，欢迎来走一程。</h1>
    <p class="intro">这是四时人生的私人试玩入口。<br>输入分享者给你的访问口令，和刘看山一起出发。</p>
    <form method="post" action="/__share/login" autocomplete="off">
      <label for="share-code">访问口令</label>
      <div class="field"><input id="share-code" name="code" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" required maxlength="256" placeholder="输入本次试玩口令" aria-describedby="code-hint${message?' login-error':''}"${message?' aria-invalid="true"':''}></div>
      <p id="code-hint" class="field-hint">口令请向分享者索取。<strong>这里不是知乎登录，请勿输入知乎密码。</strong></p>
      <p id="login-error" class="error" role="alert" aria-live="polite">${message}</p>
      <button class="submit" type="submit">进入四季，开始试玩<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg></button>
    </form>
    <div class="visit-note">
      <div class="note-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v13H4zM8 21h8m-4-3v3"/></svg><p>试玩记录保存在<strong>你自己的当前浏览器</strong>，换设备或清除浏览器数据后可能无法继续。</p></div>
      <div class="note-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg><p>首次进入需加载 3D 素材，请稍候。试玩期间，<strong>分享者的电脑需要保持开机和联网</strong>。</p></div>
    </div>
    <footer>一颗骰子，四季人生。把选择，留给自己。</footer>
  </main>
</body>
</html>`;
}
