// boot.js :: tape, hex background, clock, boot sequence. runs last.
'use strict';

(function () {
  var esc = LX.esc, span = LX.span;
  LX.bootTime = new Date();
  LX.buildFS();
  LX.ui.updatePrompt();

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
  var BANNER = [
    '██╗  ██╗   ██╗███╗   ██╗███╗   ██╗██╗   ██╗██╗  ██╗',
    '██║  ╚██╗ ██╔╝████╗  ██║████╗  ██║██║   ██║╚██╗██╔╝',
    '██║   ╚████╔╝ ██╔██╗ ██║██╔██╗ ██║██║   ██║ ╚███╔╝ ',
    '██║    ╚██╔╝  ██║╚██╗██║██║╚██╗██║██║   ██║ ██╔██╗ ',
    '███████╗██║   ██║ ╚████║██║ ╚████║╚██████╔╝██╔╝ ██╗',
    '╚══════╝╚═╝   ╚═╝  ╚═══╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝'
  ].join('\n');


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
    out.html(t(0) + 'lynnux forensic workstation, kernel ' + esc(LX_CONFIG.machine.kernel));
    await wait(120);
    out.html(t(0.001337) + span('c-green', 'write-blocker: engaged') + ', all evidence mounted read-only');
    await wait(140);
    out.html(t(0.084211) + 'usb 2-1: new evidence device: ' + span('c-amber', 'SUSPECT_USB') + ' (360 KiB, FAT12)');
    await wait(120);
    var bar = out.html(t(0.120004) + 'imaging /dev/sdb -> usb.img  ');
    for (var p = 0; p <= 20; p++) {
      bar.innerHTML = t(0.120004) + 'imaging /dev/sdb -> usb.img  <span class="bar">' + '█'.repeat(p) + '<span class="rest">' + '░'.repeat(20 - p) + '</span></span> ' + (p * 5) + '%';
      await wait(28);
    }
    out.html(t(0.140117) + 'sha256 ' + esc((usb.sha256 || '').slice(0, 32)) + '... ' + span('c-green', 'verified ✓'));
    await wait(120);
    out.html(t(0.160522) + 'loaded ' + LX.cases.total() + ' cases into ~/cases');
    await wait(100);
    out.html(t(0.171000) + 'guest session for ' + span('c-amber', 'analyst') + ' opened');
    await wait(220);
    out.text('');
    out.pre(BANNER, 'banner');
    out.html('lynnux<span class="cur">_</span>', 'banner-sm');
    out.html(span('c-dim', '  ' + LX_CONFIG.tagline + '  ·  ' + LX_CONFIG.location));
    out.text('');
    out.html('welcome, analyst. this is ' + span('c-amber', LX_CONFIG.handle) + "'s forensic workstation.");
    out.text('');
    [['cases', 'real forensics challenges, solvable right here'], ['about', 'who runs this machine'], ['contact', 'links + how to reach me'], ['help', 'every command (there are a lot)']].forEach(function (r) {
      out.html('  ' + span('c-amber', '▸ ') + LX.cmdLink(r[0], LX.pad(r[0], 10), 'c-cyan') + span('c-dim', r[1]));
    });
    out.text('');
    out.html(span('c-dim', 'everything underlined on hover is clickable. tab completes. pipes work. the evidence is real.'));
    var n = LX.cases.solvedCount();
    if (n) out.html(span('c-dim', 'welcome back. ') + span('c-green', n + '/' + LX.cases.total() + ' cases closed') + span('c-dim', ' so far.'));
    out.text('');
    LX.store.set('visited', true);
    document.removeEventListener('keydown', skipper);
    document.removeEventListener('pointerdown', skipper);
    LX.running = null;
    LX.ui.busy(false);
    LX.ui.updatePrompt();
  }
  boot();
})();
