// boot.js :: tape, hex background, clock, boot sequence. runs last.
'use strict';

(function () {
  var esc = LX.esc, span = LX.span;
  LX.bootTime = new Date();
  document.querySelector('.st-badge').textContent = LX.HOST;

  // ---- caution tape. two identical halves so the loop is seamless
  var unit = ['EVIDENCE', 'DO NOT CROSS', LX_CONFIG.domain.toUpperCase(), 'FORENSIC WORKSTATION', 'WRITE-BLOCKER ON', 'CASE FILES INSIDE'];
  var track = LX.$('tape-track'), half = '';
  for (var i = 0; i < 4; i++) half += unit.map(function (u) { return '<span>' + esc(u) + '</span><b>✕</b>'; }).join('');
  track.innerHTML = half + half;

  // ---- hex dump background. there is a message in it, for the people who read backgrounds
  (function () {
    var bg = LX.$('hexbg'), lines = [], seed = 1337;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var secret = new TextEncoder().encode('you are reading the background hex? respect. now go read ~/about.txt with xxd. ');
    for (var l = 0; l < 90; l++) {
      var bytes = [];
      for (var k = 0; k < 16; k++) bytes.push(l >= 40 && l < 40 + Math.ceil(secret.length / 16) && secret[(l - 40) * 16 + k] !== undefined ? secret[(l - 40) * 16 + k] : Math.floor(rnd() * 256));
      var hex = '', asc = '';
      bytes.forEach(function (b, j) { hex += LX.hex(b) + (j % 2 ? ' ' : ''); asc += b >= 32 && b < 127 ? String.fromCharCode(b) : '.'; });
      lines.push(LX.hex(0x7e3000 + l * 16, 8) + ': ' + hex + ' ' + asc);
    }
    var row = lines.map(function (x) { return x + '      ' + x.split('').reverse().join(''); }).join('\n');
    var d = document.createElement('div'); d.className = 'hx'; d.textContent = row + '\n' + row;
    bg.appendChild(d);
  })();

  // ---- clock in the status bar
  function clock() { var d = new Date(); LX.$('st-clock').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  clock(); setInterval(clock, 10000);

  // ---- boot sequence
  var usb = (LX_EVIDENCE.files['005'] || [{}])[0];
  var skip = false, returning = LX.store.get('visited', false);
  function skipper() { skip = true; }
  document.addEventListener('keydown', skipper, { once: true });
  document.addEventListener('pointerdown', skipper, { once: true });
  function wait(ms) { return skip ? Promise.resolve() : new Promise(function (r) { setTimeout(r, returning ? ms / 3 : ms); }); }
  function t(s) { return span('c-dim ts', '[' + LX.pad(s.toFixed(6), 12, true) + '] '); }

  async function boot() {
    var out = LX.term;
    LX.running = { abort: skipper }; // ctrl+c during boot just skips it
    LX.ui.busy(true);
    out.html(t(0) + span('c-arch', 'Arch Linux') + ' ' + esc(LX_CONFIG.machine.kernel) + ' · ' + esc(LX.HOST) + ' forensic workstation');
    await wait(120);
    out.html(t(0.001337) + span('c-green', 'write-blocker: engaged') + ', all evidence mounted read-only');
    await wait(140);
    var bar = out.html(t(0.084211) + 'usb 2-1: ' + span('c-amber', 'SUSPECT_USB') + ' imaging -> usb.img  ');
    for (var p = 0; p <= 20; p++) {
      bar.innerHTML = t(0.084211) + 'usb 2-1: ' + span('c-amber', 'SUSPECT_USB') + ' imaging -> usb.img  <span class="bar">' + '█'.repeat(p) + '<span class="rest">' + '░'.repeat(20 - p) + '</span></span> ' + (p * 5) + '%';
      await wait(28);
    }
    out.html(t(0.140117) + 'sha256 ' + esc((usb.sha256 || '').slice(0, 32)) + '... ' + span('c-green', 'verified ✓'));
    await wait(120);
    out.html(t(0.160522) + 'loaded ' + LX.cases.total() + ' cases into ~/cases');
    await wait(220);
    document.removeEventListener('keydown', skipper);
    document.removeEventListener('pointerdown', skipper);
    LX.store.set('visited', true);
    await LX.startSession(true);
  }

  // the login popup. resolves with a valid name (or 'guest' when skipped)
  function askLogin() {
    var dlg = LX.$('login'), card = LX.$('login-card'), inp = LX.$('login-name'), err = LX.$('login-err'), prev = LX.$('login-preview');
    LX.$('login-host').textContent = LX.HOST;
    LX.$('login-sub').textContent = 'Arch Linux ' + LX_CONFIG.machine.kernel + ' (tty1)';
    inp.value = ''; err.textContent = '';
    function preview() {
      var n = inp.value.trim().toLowerCase();
      prev.innerHTML = n ? span('c-dim', 'you will be  ') + span('u', n) + span('at', '@') + span('h', LX.HOST) + ' ' + span('p', '~') + ' ' + span('c-green', '❯') : '';
      err.textContent = '';
    }
    preview();
    LX.loginOpen = true;
    dlg.hidden = false;
    setTimeout(function () { inp.focus(); }, 30);
    return new Promise(function (resolve) {
      function fail(msg) {
        err.textContent = msg;
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        inp.focus(); inp.select();
      }
      function done(name) {
        inp.removeEventListener('input', preview);
        inp.removeEventListener('keydown', onKey);
        dlg.hidden = true;
        LX.loginOpen = false;
        resolve(name);
      }
      function attempt() {
        var name = inp.value.trim().toLowerCase();
        if (!name) return fail('type a name first (or skip)');
        if (name === 'root') {
          LX.authlog.push(LX.logTime() + ' ' + LX.HOST + ' login[812]: FAILED LOGIN 1 FROM tty1 FOR root, root login refused');
          return fail('Login incorrect. root is disabled, and that attempt is now in /var/log/auth.log ;)');
        }
        if (!LX.NAME_RE.test(name)) return fail('Login incorrect. use a-z, 0-9, - and _, start with a letter');
        done(name);
      }
      function onKey(e) { if (e.key === 'Enter') { e.preventDefault(); attempt(); } }
      inp.addEventListener('input', preview);
      inp.addEventListener('keydown', onKey);
      LX.$('login-go').onclick = attempt;
      LX.$('login-skip').onclick = function () { done('guest'); };
    });
  }
  function lastLoginStamp(d) {
    var D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return D[d.getDay()] + ' ' + LX.MON[d.getMonth()] + ' ' + String(d.getDate()).padStart(2) + ' ' + d.toTimeString().slice(0, 8) + ' ' + d.getFullYear();
  }

  // log in (or reuse the remembered name), build the home dir, run hyfetch, say hi.
  // also used by `logout`, which calls it with remembered = false
  LX.startSession = async function (remembered) {
    var out = LX.term;
    var name = remembered ? LX.store.get('user', null) : null;
    if (name && !LX.NAME_RE.test(name)) name = null;
    LX.running = { abort: function () { } };
    LX.ui.busy(true);
    if (!name) name = await askLogin();
    out.text('');
    out.html(span('c-dim', LX.HOST + ' login: ') + esc(name) + (remembered && LX.store.get('user', null) === name ? span('c-dim', '  (remembered. `logout` to switch)') : ''));
    if (name !== LX.USER) { LX.hist.length = 0; LX.histTimes.length = 0; LX.histIdx = 0; }
    LX.USER = name;
    LX.HOME = '/home/' + name;
    var last = LX.store.get('lastLogin', null), now = new Date();
    LX.store.set('user', name);
    LX.store.set('lastLogin', lastLoginStamp(now));
    LX.authlog.push(LX.logTime(now) + ' ' + LX.HOST + ' login[812]: pam_unix(login:session): session opened for user ' + name + '(uid=1001) by LOGIN(uid=0)');
    out.text(last ? 'Last login: ' + last + ' on tty1' : 'first login. welcome.', 'c-dim');
    LX.status = 0;
    LX.buildFS();
    LX.ui.updatePrompt();
    out.text('');
    // ~/.zshrc ends with hyfetch, so every shell starts with pride
    LX.term.echo('hyfetch');
    LX.cmds.hyfetch.fn({ args: [], stdin: null, out: out, piped: false });
    out.text('');
    out.html('welcome, ' + span('c-amber', name) + '. this is ' + span('c-amber', LX.HOST) + ', a forensic workstation.' + span('c-dim', '  ' + LX_CONFIG.tagline + ' · ' + LX_CONFIG.location));
    out.text('');
    [['cases', 'real forensics challenges, solvable right here'], ['about', 'who runs this machine'], ['contact', 'links + how to reach me'], ['help', 'every command (there are a lot)']].forEach(function (r) {
      out.html('  ' + span('c-amber', '▸ ') + LX.cmdLink(r[0], LX.pad(r[0], 10), 'c-cyan') + span('c-dim', r[1]));
    });
    out.text('');
    out.html(span('c-dim', 'everything underlined on hover is clickable. tab completes. pipes work. the evidence is real.'));
    var n = LX.cases.solvedCount();
    if (n) out.html(span('c-dim', 'welcome back. ') + span('c-green', n + '/' + LX.cases.total() + ' cases closed') + span('c-dim', ' so far.'));
    out.text('');
    LX.running = null;
    LX.booted = true;
    LX.ui.busy(false);
    LX.ui.updatePrompt();
  };
  boot();
})();
