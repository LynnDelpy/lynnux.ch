// fun.js :: fastfetch, fortune, the magic bytes quiz, enhance, small gags
'use strict';

(function () {
  var def = LX.def, esc = LX.esc, span = LX.span;

  // ------------------------------------------------------------ about / contact
  def('about', { cat: 'start', help: 'who runs this machine' }, function (ctx) { return LX.cmds.cat.fn(Object.assign({}, ctx, { args: ['~/about.txt'] })); });
  def('contact', { cat: 'start', help: 'links + how to reach me' }, function (ctx) {
    var C = LX_CONFIG, any = false;
    Object.keys(C.links).forEach(function (k) {
      if (!C.links[k]) return;
      any = true;
      ctx.out.html('  ' + LX.pad(k, 10) + '<a href="' + esc(C.links[k]) + '" target="_blank" rel="noopener noreferrer">' + esc(C.links[k].replace(/^https?:\/\//, '')) + '</a>');
    });
    if (C.email) { any = true; ctx.out.html('  ' + LX.pad('email', 10) + '<a href="mailto:' + esc(C.email) + '">' + esc(C.email) + '</a>'); }
    if (C.discord) { any = true; ctx.out.html('  ' + LX.pad('discord', 10) + LX.cmdLink('open ~/links/discord', C.discord + ' (click to copy)', 'c-cyan')); }
    if (C.teams && C.teams.length) ctx.out.html('  ' + LX.pad('teams', 10) + esc(C.teams.join(', ')));
    if (!any) ctx.out.text('no links configured yet.', 'c-dim');
  });

  // ------------------------------------------------------------ fastfetch
  // the arch logos fastfetch ships with (big + small)
  var ARCH = [
    '                  -`',
    '                 .o+`',
    '                `ooo/',
    '               `+oooo:',
    '              `+oooooo:',
    '              -+oooooo+:',
    '            `/:-:++oooo+:',
    '           `/++++/+++++++:',
    '          `/++++++++++++++:',
    '         `/+++ooooooooooooo/`',
    '        ./ooosssso++osssssso+`',
    '       .oossssso-````/ossssss+`',
    '      -osssssso.      :ssssssso.',
    '     :osssssss/        osssso+++.',
    '    /ossssssss/        +ssssooo/-',
    '  `/ossssso+/:-        -:/+osssso+-',
    ' `+sso+:-`                 `.-/+oso:',
    '`++:.                           `-/+/',
    '.`                                 `/'
  ];
  var ARCH_SMALL = [
    '      /\\',
    '     /  \\',
    '    /\\   \\',
    '   /      \\',
    '  /   ,,   \\',
    ' /   |  |  -\\',
    "/_-''    ''-_\\"
  ];
  function bar(pct) {
    var f = Math.round(Math.min(100, pct) / 10), cls = pct < 50 ? 'c-green' : pct < 80 ? 'c-amber' : 'c-red';
    return '[' + span(cls, '■'.repeat(f)) + span('c-faint', '■'.repeat(10 - f)) + '] ' + span(cls, Math.round(pct) + '%');
  }
  // what any website can see about you. computed here, shown to you, sent nowhere
  function visitorTrace() {
    var ua = navigator.userAgent || '';
    var br = /Firefox\//.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
    var os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'something';
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* fine */ }
    return [br + ' on ' + os + (tz ? ' · ' + tz : '') + (navigator.hardwareConcurrency ? ' · ' + navigator.hardwareConcurrency + ' threads' : ''),
      os === 'Windows' ? ' (we can work on that)' : os === 'Linux' ? ' (respect)' : ''];
  }
  def('fastfetch', { cat: 'fun', help: 'system info, plus some very honest stats' }, function (ctx) {
    var C = LX_CONFIG, M = C.machine;
    var mins = Math.floor((Date.now() - LX.bootTime) / 60000) + 9;
    var up = 420 + ' days, ' + (6 + Math.floor(mins / 60)) + ' hours, ' + (mins % 60) + ' mins';
    var h = new Date().getHours() + new Date().getMinutes() / 60;
    var coffee = Math.max(0.2, Math.min(4.2, (h - 6) * 0.3));
    var evBytes = 0, evFiles = 0;
    Object.keys(LX_EVIDENCE.files).forEach(function (k) { LX_EVIDENCE.files[k].forEach(function (f) { evBytes += f.size; evFiles++; }); });
    var n = LX.cases.solvedCount(), t = LX.cases.total(), you = visitorTrace();
    // [key, plain value, optional html value]
    var rows = [
      ['OS', M.os], ['Host', M.host || C.domain + ' (forensic workstation)'], ['Kernel', 'Linux ' + M.kernel], ['Uptime', up],
      ['Packages', '1337 (pacman), 42 (aur), 0 (snap, never)'], ['Shell', M.shell],
      M.wm ? ['WM', M.wm] : null, M.terminal ? ['Terminal', M.terminal] : null,
      ['CPU', M.cpu], ['GPU', M.gpu],
      ['Memory', M.mem + ' / ' + M.mem + ' 100% (214 tabs)', M.mem + ' / ' + M.mem + ' ' + bar(100) + span('c-dim', ' 214 tabs')],
      ['Swap', '100%, not great, not terrible', '8.00 GiB ' + bar(100) + span('c-dim', ' not great, not terrible')],
      ['Disk (/)', '476.94 GiB 99% btrfs, mostly disk images', '476.94 GiB ' + bar(99) + span('c-dim', ' btrfs, mostly disk images')],
      ['Battery', '4% [Discharging] (claims 9h left. it lies.)'],
      'forensics',
      ['Evidence', t + ' cases · ' + LX.fmtSize(evBytes) + ' in ' + evFiles + ' files · 0 bytes modified'],
      ['Hashrate', '13.37 GH/s sha256 (on paper)'],
      ['Carved', '31,337 files (4,096 were cat pictures)'],
      ['Deleted', 'still not gone (100% of the time)'],
      ['Coffee', coffee.toFixed(1) + ' / 3.0 L' + (coffee > 3 ? ' (send help)' : ''), coffee.toFixed(1) + ' / 3.0 L ' + bar(coffee / 3 * 100) + (coffee > 3 ? span('c-red', ' send help') : '')],
      ['Sleep', '3h 41m (ctf weekend)'],
      ['Flags (you)', n + ' / ' + t, n + ' / ' + t + ' ' + bar(n / t * 100)],
      ['Trace (you)', you[0] + you[1], esc(you[0]) + span('c-dim', you[1])]
    ].filter(Boolean);
    if (ctx.piped) { // like the real one: no logo, no colours when piped
      ctx.out.text(LX.USER + '@lynnux');
      rows.forEach(function (r) { if (Array.isArray(r)) ctx.out.text(r[0] + ': ' + r[1]); });
      return;
    }
    // on phones only the essentials are shown (css hides .ff-x), the rest is for bigger screens
    var EXTRA = { Host: 1, Shell: 1, WM: 1, Terminal: 1, GPU: 1, Swap: 1, 'Disk (/)': 1, Battery: 1, Hashrate: 1, Carved: 1, Deleted: 1, Sleep: 1, 'Trace (you)': 1 };
    var info = [[span('c-arch b', LX.USER) + '@' + span('c-arch b', 'lynnux')], [span('c-faint', '─'.repeat(14))]];
    rows.forEach(function (r) {
      if (r === 'forensics') info.push([span('c-faint', '─── ') + span('c-amber', 'forensics') + span('c-faint', ' ' + '─'.repeat(20))]);
      else info.push([span('c-arch b', r[0]) + ': ' + (r[2] || esc(r[1])), EXTRA[r[0]] ? 'ff-x' : '']);
    });
    info.push(['&nbsp;', 'ff-x']);
    info.push([['c-faint', 'c-red', 'c-green', 'c-amber', 'c-blue', 'c-violet', 'c-cyan', 'c-fg'].map(function (c) { return '<span class="' + c + '">███</span>'; }).join(''), 'ff-x']);
    var wrap = document.createElement('div'); wrap.className = 'ff';
    var lg = document.createElement('div'); lg.className = 'ff-logo lg'; lg.textContent = ARCH.join('\n');
    var sm = document.createElement('div'); sm.className = 'ff-logo sm'; sm.textContent = ARCH_SMALL.join('\n');
    var box = document.createElement('div'); box.className = 'ff-info';
    box.innerHTML = info.map(function (l) { return '<div' + (l[1] ? ' class="' + l[1] + '"' : '') + '>' + l[0] + '</div>'; }).join('');
    wrap.appendChild(lg); wrap.appendChild(sm); wrap.appendChild(box);
    ctx.out.el(wrap);
  });
  def('neofetch', { cat: 'fun', hidden: true }, function (ctx) {
    ctx.out.html(span('c-dim', 'neofetch: upstream archived it in 2024. this is an arch box, we use ') + span('c-arch', 'fastfetch') + span('c-dim', ' now.'));
    return LX.cmds.fastfetch.fn(ctx);
  });

  // ------------------------------------------------------------ fortune
  var FORTUNES = {
    wisdom: [
      'every contact leaves a trace. (locard\'s exchange principle, still undefeated)',
      'rm does not delete. it just stops pointing.',
      'the file extension is a suggestion. the magic bytes are the truth.',
      'hash first, ask questions later.',
      'never work on the original. never. ever.',
      'unallocated space is where the good stories live.',
      'metadata: the part of the photo people forget to crop.',
      'timestamps lie. but they tend to lie consistently.',
      'volatile first. ram will not wait for you.',
      'chain of custody or it did not happen.',
      'your shell history is a confession you wrote yourself.',
      'dns: the protocol everyone lets through the firewall. attackers noticed.',
      '`file` says "data". that is forensics for "good luck".',
      'slack space: free real estate.',
      'absence of evidence is not evidence of absence. but it is a reason to check the logs again.',
      'the attacker only has to be lucky once. the log only has to be kept once.'
    ],
    tips: [
      'exiftool -a -u -g1 <file> shows every tag, including unknown ones, grouped by source.',
      'binwalk -e extracts embedded archives into _<file>.extracted/. look in there first.',
      'foremost / photorec carve files by header + footer when the file system is gone.',
      'zsteg for png/bmp lsb stego. steghide for jpeg with a password. stegseek to brute force that password.',
      'fls -r -d image.dd lists only deleted files, recursively. icat brings them back by inode.',
      'sox file.wav -n spectrogram gives you a spectrogram png without opening audacity.',
      'pngcheck -v finds broken chunks, bad crcs and junk after IEND.',
      'strings -el finds utf-16le strings. windows loves those.',
      'tshark -r cap.pcap -Y dns -T fields -e dns.qry.name: every dns query, one per line.',
      'xxd -s 0x400 -l 64 file: jump to an offset instead of scrolling through megabytes.',
      'volatility3: windows.pslist, then windows.cmdline, then windows.netscan. then coffee.',
      'plaso / log2timeline builds a super timeline out of everything. then you drown in it, productively.',
      'always sha256sum the evidence before and after. if it changed, you changed it.',
      'a jpeg ends at FF D9. anything after that is someone else\'s story.'
    ],
    lynn: [
      'forensics is reading a story backwards, from the mess to the cause.',
      'the best challenge makes you feel dumb, then smart, then dumb again.',
      'arch: install it once, configure it forever.',
      'if you are reading the fortunes, you are definitely the kind of person who would like ~/cases.',
      'a good hint teaches a technique. a bad hint just gives the answer.'
    ]
  };
  def('fortune', { cat: 'fun', help: 'wisdom, tips (real ones), lynn', usage: 'fortune [wisdom|tips|lynn]' }, function (ctx) {
    var k = (ctx.args[0] || '').replace(/^-/, '');
    var pool = FORTUNES[k] || (k ? null : [].concat(FORTUNES.wisdom, FORTUNES.tips, FORTUNES.lynn));
    if (!pool) return ctx.out.err('fortune: no such database. try: ' + Object.keys(FORTUNES).join(', '));
    ctx.out.html(span(k === 'tips' ? 'c-cyan' : 'c-amber', pool[Math.floor(Math.random() * pool.length)]));
  });

  // ------------------------------------------------------------ magic bytes quiz
  var MAGIC = [
    ['PNG image', '89504e470d0a1a0a0000000d49484452'], ['JPEG image', 'ffd8ffe000104a46494600010101'],
    ['GIF image', '474946383961f401c800f70000'], ['PDF document', '255044462d312e370a25e2e3cfd30a'],
    ['ZIP archive', '504b0304140000000800a17b'], ['gzip', '1f8b0800000000000003ed'],
    ['ELF binary', '7f454c4602010100000000000000'], ['Windows PE (MZ)', '4d5a90000300000004000000ffff'],
    ['7-zip archive', '377abcaf271c0004a3b2'], ['RAR archive', '526172211a0701003392b5e5'],
    ['SQLite database', '53514c69746520666f726d61742033'], ['pcap capture', 'd4c3b2a1020004000000000000000000'],
    ['pcapng capture', '0a0d0d0a7c0000004d3c2b1a'], ['WAV audio', '52494646a4af050057415645666d7420'],
    ['Ogg container', '4f67675300020000000000000000'], ['MP3 with ID3 tag', '494433040000000f7654'],
    ['BMP image', '424d36ec5e000000000036000000'], ['TIFF (little endian)', '49492a00080000000e00'],
    ['Java class file', 'cafebabe00000041002e0a'], ['Mach-O 64-bit', 'cffaedfe0700000103000000'],
    ['WebAssembly', '0061736d01000000010e'], ['LUKS encrypted volume', '4c554b53babe0002000000000000'],
    ['Windows event log (EVTX)', '456c6646696c65000000000000'], ['Windows registry hive', '726567660a0b00000a0b0000'],
    ['Windows shortcut (LNK)', '4c0000000114020000000000c0000000'], ['Win10 prefetch (compressed)', '4d414d04b4b20000'],
    ['bzip2', '425a683931415926535912'], ['xz', 'fd377a585a000004e6d6b446'],
    ['OLE2 (old office / msg)', 'd0cf11e0a1b11ae10000000000'], ['Outlook PST', '2142444e7e29b3a5534d']
  ];

  function hexRow(h) {
    var b = h.match(/../g).slice(0, 16);
    return b.join(' ') + '   ' + b.map(function (x) { var c = parseInt(x, 16); return c >= 32 && c < 127 ? String.fromCharCode(c) : '.'; }).join('');
  }
  function ask(ctx, n, onClick) {
    return new Promise(function (res, rej) {
      function done(v, err) { LX.keys.splice(LX.keys.indexOf(h), 1); ctx.signal.removeEventListener('abort', ab); err ? rej(err) : res(v); }
      function ab() { done(null, new DOMException('aborted', 'AbortError')); }
      function h(e) {
        if (e.key === 'Escape' || e.key === 'q' || (e.ctrlKey && e.key === 'c')) { ab(); return true; }
        var k = parseInt(e.key, 10);
        if (k >= 1 && k <= n) { done(k - 1); return true; }
        return true;
      }
      LX.keys.push(h);
      ctx.signal.addEventListener('abort', ab, { once: true });
      onClick(function (i) { if (LX.keys.indexOf(h) >= 0) done(i); });
    });
  }
  def('magic', { cat: 'fun', help: 'quiz: name the file type from its first bytes', usage: 'magic [rounds]' }, async function (ctx) {
    if (ctx.piped) return ctx.out.err('magic: this one is interactive');
    var rounds = Math.min(20, Math.max(3, LX.num(ctx.args[0], 8))), score = 0, streak = 0, best = LX.store.get('magicBest', 0);
    var pool = MAGIC.slice().sort(function () { return Math.random() - 0.5; });
    ctx.out.html(span('c-amber b', 'MAGIC BYTES') + span('c-dim', '  name the file type from its header. keys 1-4 or click. esc quits.'));
    for (var r = 0; r < rounds; r++) {
      var q = pool[r % pool.length], opts = [q];
      while (opts.length < 4) { var o = MAGIC[Math.floor(Math.random() * MAGIC.length)]; if (opts.indexOf(o) < 0) opts.push(o); }
      opts.sort(function () { return Math.random() - 0.5; });
      ctx.out.text('');
      ctx.out.html(span('c-dim', 'round ' + (r + 1) + '/' + rounds + '   ') + span('c-dim', '00000000: ') + span('c-green', hexRow(q[1])));
      var row = document.createElement('div'), btns = [];
      opts.forEach(function (op, i) {
        var s = document.createElement('span');
        s.className = 'c-cyan'; s.setAttribute('role', 'button'); s.tabIndex = 0; s.dataset.opt = i;
        s.textContent = '[' + (i + 1) + '] ' + op[0];
        row.appendChild(s); row.appendChild(document.createTextNode('   '));
        btns.push(s);
      });
      ctx.out.el(row);
      var pick;
      try {
        pick = await ask(ctx, 4, function (cb) { btns.forEach(function (b, i) { b.addEventListener('click', function () { cb(i); }); }); });
      } catch (e) {
        ctx.out.text('quit. score ' + score + '/' + r, 'c-dim');
        return;
      }
      var right = opts[pick] === q;
      btns.forEach(function (b, i) { b.className = opts[i] === q ? 'c-green b' : i === pick ? 'c-red' : 'c-faint'; });
      if (right) { score++; streak++; ctx.out.html(span('c-green', '✓ correct') + (streak > 2 ? span('c-amber', '  streak x' + streak) : '')); }
      else { streak = 0; ctx.out.html(span('c-red', '✗ that was ') + span('c-fg', q[0])); }
    }
    ctx.out.text('');
    if (score > best) { best = score; LX.store.set('magicBest', best); }
    var verdict = score === rounds ? 'flawless. you are a walking `file` command.' : score >= rounds * 0.7 ? 'solid. you have stared at hex dumps before.' : score >= rounds * 0.4 ? 'not bad. xxd more, sleep less.' : 'it gets easier. try reading the ascii column on the right.';
    ctx.out.html(span('c-amber b', 'score ' + score + '/' + rounds) + span('c-dim', '  (best ' + best + ')  ') + esc(verdict));
  });

  // ------------------------------------------------------------ enhance
  def('enhance', { cat: 'fun', help: 'the classic crime tv move' }, async function (ctx) {
    // a 4x4 "suspect photo". every zoom just makes the same 16 pixels bigger
    var px = [[3, 3, 1, 0], [3, 2, 1, 0], [2, 2, 3, 3], [0, 1, 3, 3]], cls = ['c-faint', 'c-dim', 'c-amber', 'c-fg'];
    var words = ['enhance.', 'enhance!', 'ENHANCE!!!'];
    for (var z = 0; z < 3; z++) {
      ctx.out.html(span('c-amber', '> ' + words[z]));
      await ctx.sleep(400);
      var sc = 1 << z, rows = [];
      px.forEach(function (row) {
        var line = row.map(function (v) { return '<span class="' + cls[v] + '">' + '█'.repeat(sc * 2) + '</span>'; }).join('');
        for (var k = 0; k < sc; k++) rows.push(line);
      });
      ctx.out.pre(rows.join('\n'), 'px');
      await ctx.sleep(500);
    }
    ctx.out.html(span('c-red', 'analysis: still 16 pixels. they were 16 pixels before.'));
    ctx.out.html(span('c-dim', 'forensics cannot invent data that is not there. it is very good at finding data that is hidden though: ') + LX.cmdLink('cases', 'cases', 'c-amber'));
  });

  // ------------------------------------------------------------ gags
  function gag(name, msg) { def(name, { cat: 'fun', hidden: true }, function (ctx) { ctx.out.html(msg); }); }
  gag('volatility', span('c-dim', 'volatility: no memory image on this box. they are usually 8+ GB, your browser would not thank me. maybe in a future case ;)'));
  LX.cmds.vol = LX.cmds.volatility; LX.cmds['vol.py'] = LX.cmds.volatility;
  gag('autopsy', span('c-dim', 'autopsy: no bodies here, only bits. ') + LX.cmdLink('fls ~/cases/case-005/usb.img', 'fls', 'c-cyan') + span('c-dim', ' is the cli version of what it does anyway.'));
  gag('ghidra', span('c-dim', 'wrong department. this is forensics. reversing is two doors down.'));
  LX.cmds.ida = LX.cmds.ghidra;
  gag('hashcat', span('c-dim', 'hashcat: no gpu detected. it is a website. (the flags are hashed with sha256 of long random strings anyway, good luck)'));
  LX.cmds.john = LX.cmds.hashcat;
  gag('vim', span('c-dim', 'vim: the evidence is read-only, and so is this shell. ') + span('c-amber', ':q') + span('c-dim', ' already.'));
  LX.cmds.nano = LX.cmds.vim; LX.cmds.vi = LX.cmds.vim; LX.cmds.emacs = LX.cmds.vim;
  gag('coffee', span('c-amber', '☕ brewing...') + span('c-dim', ' evidence suggests you have had enough.'));
  gag('pacman', span('c-dim', 'error: you cannot perform this operation unless you are root. (but nice, a fellow arch person)'));
  LX.cmds.paru = LX.cmds.pacman; LX.cmds.yay = LX.cmds.pacman;
  gag('btw', span('c-arch', 'i use arch, btw.'));
})();
