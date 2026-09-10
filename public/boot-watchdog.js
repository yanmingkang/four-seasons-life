// Same-origin classic script; HTML keeps a functional refresh link if this download fails.
(function () {
      var screen = document.getElementById('boot-screen');
      var app = document.getElementById('app');
      var title = document.getElementById('boot-title');
      var detail = document.getElementById('boot-detail');
      var retry = document.getElementById('boot-retry');
      var finished = false;
      var retrying = false;
      var wasOffline = navigator.onLine === false;
      function show(state, heading, message) {
        if (finished) return;
        screen.dataset.state = state;
        title.textContent = heading;
        detail.textContent = message;
        retry.hidden = false;
      }
      function fail() {
        show('error', '小镇暂时没有打开', navigator.onLine === false
          ? '网络似乎断开了。连接恢复后，请点“重新加载”。'
          : '游戏程序没有完整加载。请检查网络或试玩服务，然后手动重试。');
      }
      function offline() {
        wasOffline = true;
        show(screen.dataset.state === 'error' ? 'error' : 'slow', '正在等待网络恢复', '连接恢复后，可以点“重新加载”。页面不会自行刷新。');
      }
      function online() {
        if (!finished && wasOffline) detail.textContent = screen.dataset.state === 'error'
          ? '网络已恢复，请点“重新加载”再试一次。'
          : '网络已恢复，可以继续等待，或手动重新加载。';
      }
      function scriptError(event) {
        // Capture failed module entry downloads, including the built Vite entry.
        // Image, audio, font and later gameplay errors must not trigger boot UI.
        if (event.target && event.target.tagName === 'SCRIPT' && event.target.type === 'module') fail();
      }
      var slowTimer = setTimeout(function () {
        if (screen.dataset.state === 'error') return;
        show('slow', '小镇还在路上', navigator.onLine === false
          ? '网络似乎断开了。连接恢复后，请点“重新加载”。'
          : '这次加载比平时慢。可以继续等待，也可以手动重试。');
      }, 6000);
      function complete() {
        if (finished) return;
        // Main's import must finish, not just create a partially wired screen.
        var start = document.getElementById('start-full');
        if (!start || typeof start.onclick !== 'function') { fail(); return; }
        finished = true;
        clearTimeout(slowTimer);
        window.removeEventListener('error', scriptError, true);
        window.removeEventListener('offline', offline);
        window.removeEventListener('online', online);
        app.inert = false;
        app.removeAttribute('aria-busy');
        screen.dataset.state = 'ready';
        screen.hidden = true;
      }
      retry.addEventListener('click', function (event) {
        event.preventDefault();
        if (finished || retrying) return;
        retrying = true;
        retry.disabled = true;
        detail.textContent = '正在重新打开，请稍等。';
        window.location.reload();
      });
      window.addEventListener('error', scriptError, true);
      window.addEventListener('offline', offline);
      window.addEventListener('online', online);
      window.__fourSeasonsBoot = Object.freeze({ complete: complete, fail: fail });
      if (wasOffline) offline();
      if (!('noModule' in document.createElement('script'))) show('error', '请使用较新的浏览器', '请用新版 Chrome、Edge 或 Safari 打开游戏。');
    }());
