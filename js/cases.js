// cases.js :: the evidence locker. briefings, hints, flag submission, progress.
// flags are never in this file. submissions are sha256'd and compared to LX_EVIDENCE.hashes.
'use strict';

var LX_CASES = [
  {
    id: '001', title: 'postcard from bern', diff: 'easy', cat: 'metadata', tools: 'exiftool, base64',
    brief: [
      'suspect_47 posted this "harmless" postcard right before going dark.',
      'a photo remembers a lot more than what is in the frame: the camera,',
      'the time, sometimes even where it was taken.',
      'what else did they leave in there?'
    ],
    hints: [
      'photos carry metadata. run: exiftool postcard.jpg',
      'one field is not human readable. it ends in "==". that is a very recognizable encoding (base64 -d).'
    ]
  },
  {
    id: '002', title: 'nebula', diff: 'easy', cat: 'stego', tools: 'stegsolve, exiftool',
    brief: [
      'a "wallpaper" from the suspect\'s downloads folder. the png comment',
      'says the truth is in the details. your eyes see a nebula.',
      'the bits might disagree.'
    ],
    hints: [
      'every colour channel is 8 bits. the lowest bit is basically noise... usually. try: stegsolve nebula.png',
      'red lies to you on purpose. keep cycling through the planes, look at the other colours.'
    ]
  },
  {
    id: '003', title: 'lake', diff: 'medium', cat: 'carving', tools: 'binwalk, dd, unzip',
    brief: [
      'a vacation photo. nothing special about it, except that it is',
      'bigger than a jpeg of this size should be. a jpeg ends at FF D9.',
      'so what comes after that?'
    ],
    hints: [
      'binwalk lake.jpg shows what is embedded and at which offset. exiftool also warns about trailing data.',
      'binwalk -e lake.jpg extracts it. or by hand: dd if=lake.jpg of=x.zip bs=1 skip=<offset>, then unzip x.zip'
    ]
  },
  {
    id: '004', title: 'phoning home', diff: 'medium', cat: 'network', tools: 'tcpdump, grep, sort, cut, unhex',
    brief: [
      'the suspect\'s laptop phoned home. we captured ~16 seconds of traffic.',
      'nothing big left the network... or did it, a few bytes at a time?',
      'find out what was exfiltrated.'
    ],
    hints: [
      'start with tcpdump -r capture.pcap. who talks to whom? read the plain http traffic with -A, the beacon tells you a lot.',
      'dns queries can carry data. grep the weird zone, sort the chunks by their number, cut out the hex, glue it together, unhex.'
    ]
  },
  {
    id: '005', title: 'the wiped stick', diff: 'medium', cat: 'disk', tools: 'fsstat, fls, icat, view',
    brief: [
      'a usb stick, freshly "wiped" by the suspect. on FAT, deleting a file',
      'does not erase it. it just forgets the first letter of its name and',
      'marks the clusters as free. the data is still sitting there.'
    ],
    hints: [
      'fls usb.img lists the files. deleted ones get a * and a mangled first letter.',
      'icat usb.img <inode> > out.png pulls it back out by inode, deleted or not. then: view out.png'
    ]
  },
  {
    id: '006', title: 'transmission', diff: 'medium', cat: 'audio', tools: 'play, spectrogram',
    brief: [
      'an intercepted transmission. beeps and a low drone, nothing you',
      'could transcribe. but some messages are meant to be seen, not heard.'
    ],
    hints: [
      'plot frequency over time: spectrogram transmission.wav',
      'look up, not down. the interesting part is above 3 kHz.'
    ]
  },
  {
    id: '007', title: '[REDACTED]', diff: '???', cat: '???', tools: '???', secret: true,
    brief: [
      'something on this workstation is hiding in plain sight.',
      'no download, no evidence file in this folder.',
      'look closer at what you have already read.'
    ],
    hints: [
      'cat shows you characters. xxd shows you bytes. sometimes they disagree. also: read the old entries in ~/.zsh_history.',
      'about.txt is bigger than it looks. e2 80 8b and e2 80 8c are zero width characters. call them 0 and 1.'
    ]
  }
];

(function () {
  var def = LX.def, esc = LX.esc, span = LX.span;
  var solved = LX.store.get('solved', {}), hintsUsed = LX.store.get('hints', {});

  function byId(id) {
    id = String(id || '').replace(/^case-?/i, '').replace(/^lx-?/i, '');
    if (/^\d{1,3}$/.test(id)) id = id.padStart(3, '0');
    return LX_CASES.filter(function (c) { return c.id === id; })[0];
  }
  function box(t) {
    var w = 62;
    return '┌' + '─'.repeat(w) + '┐\n│ ' + LX.pad(t, w - 1) + '│\n└' + '─'.repeat(w) + '┘';
  }

  LX.cases = {
    total: function () { return LX_CASES.length; },
    solvedCount: function () { return Object.keys(solved).length; },
    isSolved: function (id) { return !!solved[id]; },
    byId: byId,
    briefing: function (c) {
      var files = LX_EVIDENCE.files[c.id] || [];
      var L = [box('CASE LX-' + c.id + ' :: ' + c.title), ''];
      L.push(' classification : ' + c.diff + ' / ' + c.cat);
      files.forEach(function (f) {
        L.push(' evidence       : ' + f.name + '  (' + f.size + ' bytes)');
        L.push(' sha256         : ' + f.sha256);
      });
      if (!files.length) L.push(' evidence       : none on file');
      L.push('');
      c.brief.forEach(function (b) { L.push(' ' + b); });
      L.push('');
      L.push(' might help     : ' + c.tools);
      L.push(' stuck?         : hint ' + c.id);
      L.push(' flag format    : lynnux{...}   then: submit lynnux{...}');
      return L.join('\n') + '\n';
    },
    // returns the case id for a correct flag, or null
    check: async function (flag) {
      var h = await LX.sha('SHA-256', new TextEncoder().encode(String(flag).trim().toLowerCase()));
      var ids = Object.keys(LX_EVIDENCE.hashes);
      for (var i = 0; i < ids.length; i++) if (LX_EVIDENCE.hashes[ids[i]] === h) return ids[i];
      return null;
    },
    markSolved: function (id) {
      var fresh = !solved[id];
      if (fresh) { solved[id] = new Date().toISOString(); LX.store.set('solved', solved); }
      LX.ui.updatePrompt();
      if (LX.gui) LX.gui.render();
      return fresh;
    },
    nextHint: function (id) {
      var c = byId(id), used = hintsUsed[c.id] || 0, n = Math.min(used + 1, c.hints.length);
      hintsUsed[c.id] = n; LX.store.set('hints', hintsUsed);
      return { n: n, of: c.hints.length, text: c.hints[n - 1] };
    },
    reset: function () { solved = {}; hintsUsed = {}; LX.store.set('solved', solved); LX.store.set('hints', hintsUsed); LX.ui.updatePrompt(); if (LX.gui) LX.gui.render(); }
  };

  function progressBar(n, t, w) {
    var f = Math.round(n / t * w);
    return '<span class="bar">' + '█'.repeat(f) + '<span class="rest">' + '░'.repeat(w - f) + '</span></span>';
  }

  def('cases', { cat: 'cases', help: 'the evidence locker: all cases + your progress' }, function (ctx) {
    var n = LX.cases.solvedCount(), t = LX.cases.total();
    ctx.out.html(span('c-amber b', 'EVIDENCE LOCKER') + span('c-dim', '   ~/cases   ') + span(n === t ? 'c-green' : 'c-amber', n + '/' + t + ' closed'));
    ctx.out.text('');
    LX_CASES.forEach(function (c) {
      var done = solved[c.id], mark = done ? span('c-green', ' ✓ ') : c.secret ? span('c-violet', ' ? ') : span('c-dim', ' · ');
      var title = c.secret && !done ? '[REDACTED]' : c.title;
      var row = LX.pad('case-' + c.id, 10) + '  ' + LX.pad(title, 22) + LX.pad(c.diff, 9) + c.cat;
      var hu = hintsUsed[c.id] ? span('c-faint', '  (' + hintsUsed[c.id] + ' hint' + (hintsUsed[c.id] > 1 ? 's' : '') + ')') : '';
      ctx.out.html(mark + LX.cmdLink('cd ~/cases/case-' + c.id + ' && cat BRIEFING.txt && ls -l', row, done ? 'c-green' : c.secret ? 'c-violet' : 'c-fg') + hu);
    });
    ctx.out.text('');
    ctx.out.html(' ' + progressBar(n, t, 28) + span('c-dim', '  ' + Math.round(n / t * 100) + '%'));
    if (!ctx.piped && n < t) ctx.out.html(span('c-dim', ' click a case to open its briefing. ') + span('c-dim', 'every evidence file can be ') + LX.cmdLink('help download', 'downloaded', 'c-cyan') + span('c-dim', ' for your own tools.'));
  });

  def('hint', { cat: 'cases', help: 'a nudge for a case (ask twice for a bigger one)', usage: 'hint <case> [1|2]' }, function (ctx) {
    var c = byId(ctx.args[0] || (/case-(\d+)/.exec(LX.fs.cwd) || [])[1]);
    if (!c) return ctx.out.err('hint: which case? e.g. hint 003 (or run it inside a case folder)');
    var used = hintsUsed[c.id] || 0, want = ctx.args[1] ? LX.num(ctx.args[1]) : Math.min(used + 1, c.hints.length);
    want = Math.max(1, Math.min(want, c.hints.length));
    if (want > used) { hintsUsed[c.id] = want; LX.store.set('hints', hintsUsed); }
    ctx.out.html(span('c-amber', 'hint ' + want + '/' + c.hints.length + ' for LX-' + c.id + ': ') + esc(c.hints[want - 1]));
    if (want < c.hints.length) ctx.out.text('(run it again for a bigger nudge)', 'c-dim');
  });

  def('submit', { cat: 'cases', help: 'submit a flag. checked by hash, it never leaves your browser', usage: 'submit lynnux{...}' }, async function (ctx) {
    var flag = ctx.args.join('');
    if (!flag && ctx.stdin) flag = ctx.stdin.trim();
    if (!flag) return ctx.out.err('submit: usage: submit lynnux{...}');
    if (!/^lynnux\{.+\}$/i.test(flag.trim())) {
      ctx.out.err('submit: flags look like lynnux{...}');
      return 1;
    }
    var id = await LX.cases.check(flag);
    if (!id) {
      ctx.out.html(span('c-red', 'no match in the evidence database.') + span('c-dim', ' (only a sha256 of your guess is compared, it never leaves the browser)'));
      return 1;
    }
    var c = byId(id), fresh = LX.cases.markSolved(id);
    if (!fresh) { ctx.out.html(span('c-green', 'correct, but LX-' + id + ' is already closed.') + span('c-dim', ' no double points for re-filing paperwork.')); return; }
    var st = document.createElement('div');
    st.className = 'stamp';
    st.textContent = 'CASE LX-' + id + ' CLOSED';
    ctx.out.el(st);
    ctx.out.html(span('c-green', 'evidence logged: ') + esc(c.title) + span('c-dim', '  ·  ' + new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'));
    var n = LX.cases.solvedCount(), t = LX.cases.total();
    ctx.out.html(' ' + progressBar(n, t, 28) + span('c-dim', '  ' + n + '/' + t));
    if (n === t) {
      ctx.out.text('');
      ctx.out.html(span('c-amber b glow', 'every case closed. that is a full investigation.'));
      var C = LX_CONFIG, how = C.email ? 'mail me at ' + C.email : C.links.github ? 'find me on ' + C.links.github : 'let me know';
      ctx.out.html(span('c-dim', 'if you enjoyed this, ' + how + '. i would love to hear which one took you the longest.'));
    } else if (id === '007') {
      ctx.out.html(span('c-violet', 'you found the one that was not on the list. nice eyes.'));
    }
  });

  def('reset-progress', { cat: 'cases', hidden: true, help: 'forget solved cases' }, function (ctx) {
    LX.cases.reset();
    ctx.out.text('progress wiped. (unlike a FAT file system, this one really is gone.)', 'c-dim');
  });
})();
