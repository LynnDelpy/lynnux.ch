// commands.js :: navigation, text tools, system stuff
'use strict';

(function () {
  var def = LX.def, esc = LX.esc, span = LX.span;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function lsDate(d) {
    d = d || LX.bootTime;
    return MON[d.getMonth()] + ' ' + String(d.getDate()).padStart(2) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function kindClass(n) { return n.t === 'd' ? 'c-cyan b' : n.t === 'l' ? 'c-blue' : n.t === 'b' ? 'c-amber' : 'c-fg'; }
  function clickFor(n, path) {
    var q = LX.quote(path);
    if (n.t === 'd') return 'cd ' + q + ' && ls';
    if (n.t === 'l') return 'open ' + q;
    if (n.t === 'b') return (n.data && LX.looksText(n.data) ? 'cat ' : 'file ') + q;
    return 'cat ' + q;
  }
  LX.lsName = function (n, name, path) {
    var label = name + (n.t === 'd' ? '/' : n.t === 'l' ? '@' : '');
    return LX.cmdLink(clickFor(n, path), label, kindClass(n));
  };

  // ------------------------------------------------------------ help
  var CAT_ORDER = [
    ['start', 'start here'], ['nav', 'navigate'], ['text', 'text + pipes'], ['forensics', 'forensics'],
    ['media', 'stego + media'], ['netdisk', 'network + disk'], ['cases', 'cases'], ['system', 'system'], ['fun', 'fun']
  ];
  def('help', { cat: 'start', help: 'this list. `help <cmd>` for details', usage: 'help [command]' }, function (ctx) {
    if (ctx.args[0]) return LX.cmds.man.fn(ctx);
    ctx.out.html(span('c-amber b', LX.HOST) + span('c-dim', ' :: forensic workstation, guest shell'));
    CAT_ORDER.forEach(function (c) {
      var names = Object.keys(LX.cmds).filter(function (k) { return LX.cmds[k].cat === c[0] && !LX.cmds[k].hidden; }).sort();
      if (!names.length) return;
      ctx.out.text('');
      ctx.out.html(span('c-amber', '-- ' + c[1] + ' --'));
      if (c[0] === 'start' || c[0] === 'cases') {
        names.forEach(function (k) { ctx.out.html('  ' + LX.cmdLink(k, LX.pad(k, 13), 'c-cyan') + span('c-dim', LX.cmds[k].help)); });
      } else {
        ctx.out.html('  ' + names.map(function (k) { return LX.cmdLink('help ' + k, k, 'c-cyan'); }).join('  '));
      }
    });
    ctx.out.text('');
    ctx.out.html(span('c-dim', 'pipes, ; && ||, > >>, globs and tab completion all work. try: ') + LX.cmdLink('fortune | rev', 'fortune | rev'));
    ctx.out.html(span('c-dim', 'click anything that is underlined on hover. ctrl+c cancels, ctrl+l clears.'));
  });
  def('man', { cat: 'start', help: 'manual for a command', usage: 'man <command>' }, function (ctx) {
    var n = ctx.args[0];
    if (!n) { ctx.out.err('what manual page do you want?'); return; }
    var c = LX.cmds[n] || (LX.aliases[n] && { usage: n, help: 'alias for `' + LX.aliases[n] + '`' });
    if (!c) { ctx.out.err('No manual entry for ' + n); return; }
    ctx.out.html(span('c-amber b', n) + span('c-dim', '  ' + (c.cat ? c.cat : 'alias')));
    ctx.out.html('  ' + span('c-dim', 'usage: ') + esc(c.usage));
    ctx.out.html('  ' + esc(c.help));
  });

  // ------------------------------------------------------------ navigate
  def('ls', { cat: 'nav', help: 'list a directory', usage: 'ls [-lah] [path...]' }, function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'lahR1' }), paths = o.rest.length ? o.rest : ['.'];
    paths.forEach(function (p, pi) {
      var abs = LX.fs.norm(p), n = LX.fs.get(abs);
      if (!n) { ctx.out.err("ls: cannot access '" + p + "': No such file or directory"); return; }
      var entries;
      if (n.t !== 'd') entries = [[p, n, p]];
      else {
        if (paths.length > 1) { if (pi) ctx.out.text(''); ctx.out.text(p + ':'); }
        var base = p === '.' ? '' : p.replace(/\/$/, '') + '/';
        entries = Object.keys(n.c).sort().filter(function (k) { return o.f.a || k[0] !== '.'; })
          .map(function (k) { return [k, n.c[k], base + k]; });
        if (o.f.a) entries.unshift(['.', n, base + '.'], ['..', LX.fs.get(LX.fs.norm(abs + '/..')), base + '..']);
      }
      if (o.f.l) {
        if (n.t === 'd') ctx.out.text('total ' + entries.length);
        entries.forEach(function (e) {
          var nd = e[1], ro = nd.ro || !LX.fs.writable(abs);
          var perm = (nd.t === 'd' ? 'd' : nd.t === 'l' ? 'l' : '-') + (nd.t === 'l' ? 'rwxrwxrwx' : ro ? (nd.t === 'd' ? 'r-xr-xr-x' : 'r--r--r--') : (nd.t === 'd' ? 'rwxr-xr-x' : 'rw-r--r--'));
          var owner = nd.src || abs.indexOf(LX.HOME + '/cases') === 0 ? LX.pad(LX_CONFIG.owner, 8) + ' evidence' : abs.indexOf('/home') === 0 ? LX.pad(LX.USER, 8) + ' ' + LX.pad(LX.USER, 8) : 'root     root    ';
          var sz = nd.t === 'd' ? 4096 : nd.t === 'l' ? nd.url.length : LX.fs.size(nd);
          var line = perm + ' 1 ' + owner + ' ' + LX.pad(o.f.h ? LX.fmtSize(sz) : sz, 7, true) + ' ' + lsDate(nd.mtime) + ' ';
          var name = LX.lsName(nd, e[0], e[2]);
          ctx.out.html(esc(line) + name + (nd.t === 'l' ? span('c-dim', ' -> ' + (nd.label || nd.url)) : ''));
        });
      } else if (entries.length) {
        ctx.out.html(entries.map(function (e) { return LX.lsName(e[1], e[0], e[2]); }).join('  '));
      }
    });
  });
  def('cd', { cat: 'nav', help: 'change directory', usage: 'cd [dir]' }, function (ctx) {
    var p = ctx.args[0] || '~';
    if (p === '-') p = LX.oldpwd || LX.fs.cwd;
    var abs = LX.fs.norm(p), n = LX.fs.get(abs);
    if (!n) return ctx.out.err('cd: no such file or directory: ' + p);
    if (n.t !== 'd') return ctx.out.err('cd: not a directory: ' + p);
    LX.oldpwd = LX.fs.cwd;
    LX.fs.cwd = abs;
  });
  def('pwd', { cat: 'nav', help: 'print working directory' }, function (ctx) { ctx.out.text(LX.fs.cwd); });
  def('tree', { cat: 'nav', help: 'show a directory tree', usage: 'tree [-a] [dir]' }, function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'a' }), p = o.rest[0] || '.', abs = LX.fs.norm(p), n = LX.fs.get(abs);
    if (!n || n.t !== 'd') return ctx.out.err('tree: ' + p + ' [error opening dir]');
    var nd = 0, nf = 0;
    ctx.out.html(span('c-cyan b', p));
    (function walk(node, prefix, path) {
      var keys = Object.keys(node.c).sort().filter(function (k) { return o.f.a || k[0] !== '.'; });
      keys.forEach(function (k, i) {
        var last = i === keys.length - 1, ch = node.c[k];
        ctx.out.pre(esc(prefix + (last ? '└── ' : '├── ')) + LX.lsName(ch, k, path + '/' + k));
        if (ch.t === 'd') { nd++; walk(ch, prefix + (last ? '    ' : '│   '), path + '/' + k); } else nf++;
      });
    })(n, '', p === '.' ? '.' : p.replace(/\/$/, ''));
    ctx.out.text('\n' + nd + ' directories, ' + nf + ' files');
  });
  def('find', { cat: 'nav', help: 'search for files', usage: 'find [dir] [-name pat] [-type f|d]' }, function (ctx) {
    var a = ctx.args.slice(), start = a[0] && a[0][0] !== '-' ? a.shift() : '.', name = null, type = null;
    for (var i = 0; i < a.length; i++) {
      if (a[i] === '-name' || a[i] === '-iname') name = new RegExp('^' + (a[++i] || '*').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', a[i - 1] === '-iname' ? 'i' : '');
      else if (a[i] === '-type') type = a[++i];
      else return ctx.out.err("find: unknown predicate '" + a[i] + "'");
    }
    var root = LX.fs.get(LX.fs.norm(start));
    if (!root) return ctx.out.err("find: '" + start + "': No such file or directory");
    (function walk(n, path, nm) {
      var ok = (!name || name.test(nm)) && (!type || (type === 'd') === (n.t === 'd'));
      if (ok) ctx.out.html(LX.lsName(n, path, path).replace(/[\/@](<\/span>)$/, '$1'));
      if (n.t === 'd') Object.keys(n.c).sort().forEach(function (k) { walk(n.c[k], path.replace(/\/$/, '') + '/' + k, k); });
    })(root, start, start.split('/').pop());
  });
  def('open', { cat: 'nav', help: 'open a link (or file)', usage: 'open <link|file>' }, function (ctx) {
    var p = ctx.args[0];
    if (!p) return ctx.out.err('open: missing operand');
    var n = LX.fs.get(LX.fs.norm(p));
    if (!n) return ctx.out.err('open: ' + p + ': not found');
    if (n.t === 'd') return LX.cmds.cd.fn(ctx);
    if (n.t === 'l') {
      if (n.copy) {
        try { navigator.clipboard.writeText(n.copy); LX.ui.toast('copied: ' + n.copy); } catch (e) { /* no clipboard, still print */ }
        return ctx.out.html(span('c-amber', n.copy) + span('c-dim', '  (copied to clipboard)'));
      }
      if (n.url.indexOf('mailto:') === 0) { window.location.href = n.url; return ctx.out.text('opening your mail client...', 'c-dim'); }
      var w = window.open(n.url, '_blank', 'noopener,noreferrer');
      return ctx.out.html(span('c-dim', w ? 'opened ' : 'popup blocked, here: ') + '<a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer">' + esc(n.url) + '</a>');
    }
    if (n.t === 'b') return LX.cmds.view ? LX.cmds.view.fn(ctx) : LX.cmds.file.fn(ctx);
    return LX.cmds.cat.fn(ctx);
  });
  def('download', { cat: 'nav', help: 'download a file to your real machine', usage: 'download <file>' }, async function (ctx) {
    var f = LX.open(ctx, ctx.args[0], 'download');
    if (!f) return;
    var a = document.createElement('a'), url;
    if (f.node.src && !f.node.data) url = f.node.src;
    else url = URL.createObjectURL(new Blob([await LX.fs.bytes(f.node)], { type: 'application/octet-stream' }));
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    if (url.indexOf('blob:') === 0) setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    ctx.out.html(span('c-green', 'saved ') + esc(f.name) + span('c-dim', ' (' + LX.fmtSize(LX.fs.size(f.node)) + ')' + (f.node.sha256 ? '  sha256 ' + f.node.sha256.slice(0, 16) + '...' : '')));
  });

  // ------------------------------------------------------------ file ops
  def('mkdir', { cat: 'nav', help: 'make a directory', usage: 'mkdir <dir>' }, function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'p' });
    if (!o.rest.length) return ctx.out.err('mkdir: missing operand');
    o.rest.forEach(function (p) {
      if (LX.fs.get(LX.fs.norm(p))) { if (!o.f.p) ctx.out.err("mkdir: cannot create directory '" + p + "': File exists"); return; }
      try { LX.fs.put(p, LX.D({})); } catch (e) { ctx.out.err('mkdir: ' + e.message); }
    });
  });
  def('touch', { cat: 'nav', help: 'create an empty file', usage: 'touch <file>' }, function (ctx) {
    if (!ctx.args.length) return ctx.out.err('touch: missing file operand');
    ctx.args.forEach(function (p) {
      var n = LX.fs.get(LX.fs.norm(p));
      if (n) { if (!LX.fs.writable(LX.fs.norm(p + '/..'))) ctx.out.err('touch: write-blocker: cannot touch evidence. not even the timestamps.'); else n.mtime = new Date(); return; }
      try { LX.fs.put(p, LX.F('')); } catch (e) { ctx.out.err('touch: ' + e.message); }
    });
  });
  def('rm', { cat: 'nav', help: 'remove files', usage: 'rm [-rf] <path...>' }, function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'rfRiv' });
    if (!o.rest.length) return ctx.out.err('rm: missing operand');
    o.rest.forEach(function (p) {
      var abs = LX.fs.norm(p);
      if (abs === '/' || abs === '/home' || abs === LX.HOME) {
        ctx.out.html(span('c-red', 'rm: write-blocker engaged.') + span('c-dim', ' the evidence survives. it always does.'));
        return;
      }
      var n = LX.fs.get(abs), dir = abs.slice(0, abs.lastIndexOf('/')) || '/';
      if (!n) { if (!o.f.f) ctx.out.err("rm: cannot remove '" + p + "': No such file or directory"); return; }
      if (!LX.fs.writable(dir)) { ctx.out.err("rm: cannot remove '" + p + "': write-blocker says no (read-only evidence)"); return; }
      if (n.t === 'd' && !(o.f.r || o.f.R)) { ctx.out.err("rm: cannot remove '" + p + "': Is a directory"); return; }
      delete LX.fs.get(dir).c[abs.slice(abs.lastIndexOf('/') + 1)];
      if (o.f.v) ctx.out.text("removed '" + p + "'");
    });
    if (o.rest.some(function (p) { return /\.(png|jpg|txt|img)$/i.test(p); }) && !ctx.piped)
      ctx.out.text('(on a real FAT disk that would only flip one byte. see case-005.)', 'c-dim');
  });

  // ------------------------------------------------------------ text + pipes
  function catV(str, showEnds, showTabs) {
    var bytes = new TextEncoder().encode(str), out = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (b === 10) { out += (showEnds ? '$' : '') + '\n'; continue; }
      if (b === 9 && !showTabs) { out += '\t'; continue; }
      if (b >= 128) { out += 'M-'; b -= 128; }
      if (b < 32) out += '^' + String.fromCharCode(b + 64);
      else if (b === 127) out += '^?';
      else out += String.fromCharCode(b);
    }
    return out;
  }
  def('cat', { cat: 'text', help: 'print files (-A shows the invisible stuff)', usage: 'cat [-nAvE] [file...]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'nAvET' });
    var srcs = o.rest.length ? o.rest : [null];
    for (var i = 0; i < srcs.length; i++) {
      var s;
      if (srcs[i] === null) {
        if (ctx.stdin === null) return ctx.out.err('cat: missing file operand. try: cat about.txt');
        s = ctx.stdin;
      } else {
        var f = LX.open(ctx, srcs[i], 'cat');
        if (!f) continue;
        if (f.node.t === 'b') {
          var b = await LX.fs.bytes(f.node), isText = LX.looksText(b);
          if (!isText && !ctx.piped) {
            ctx.out.html(span('c-dim', 'cat: ' + srcs[i] + ' is binary. try ') + LX.cmdLink('file ' + LX.quote(srcs[i]), 'file') +
              span('c-dim', ', ') + LX.cmdLink('xxd ' + LX.quote(srcs[i]) + ' | head', 'xxd') + span('c-dim', ' or ') + LX.cmdLink('strings ' + LX.quote(srcs[i]), 'strings'));
            continue;
          }
          s = isText ? LX.bytesToText(b) : Array.from(b.subarray(0, 200000), function (c) { return String.fromCharCode(c); }).join('');
        } else s = await LX.fs.text(f.node);
      }
      if (o.f.A || o.f.v || o.f.E || o.f.T) s = catV(s, o.f.A || o.f.E, o.f.A || o.f.T);
      if (o.f.n) { var k = 0; s = s.replace(/\n$/, '').split('\n').map(function (l) { return LX.pad(++k, 6, true) + '  ' + l; }).join('\n') + '\n'; }
      ctx.out.text(s.replace(/\n$/, ''));
    }
  });
  def('echo', { cat: 'text', help: 'print text', usage: 'echo [-n] [-e] text' }, function (ctx) {
    var a = ctx.args.slice(), e = false;
    while (a[0] === '-n' || a[0] === '-e') { if (a.shift() === '-e') e = true; }
    var s = a.join(' ');
    if (e) s = s.replace(/\\x([0-9a-fA-F]{2})|\\n|\\t|\\\\/g, function (m, h) { return h ? String.fromCharCode(parseInt(h, 16)) : m === '\\n' ? '\n' : m === '\\t' ? '\t' : '\\'; });
    ctx.out.text(s);
  });
  def('grep', { cat: 'text', help: 'search for a pattern (regex)', usage: 'grep [-ivnocaFr] [-e pattern]... pattern [file...]' }, async function (ctx) {
    // -e can repeat, so pull those out before the normal option parsing
    var args = [], pats = [];
    for (var ai = 0; ai < ctx.args.length; ai++) {
      if (ctx.args[ai] === '-e' && ai + 1 < ctx.args.length) pats.push(ctx.args[++ai]);
      else args.push(ctx.args[ai]);
    }
    var o = LX.opts(args, { flags: 'ivnocaFrEhH', vals: 'm' });
    if (!pats.length) pats = o.rest.splice(0, 1);
    if (!pats.length) return ctx.out.err('usage: grep [-ivnocaFr] [-e pattern]... pattern [file...]');
    var files = o.rest, re;
    try { re = new RegExp(pats.map(function (pat) { return o.f.F ? pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '(?:' + pat + ')'; }).join('|'), 'g' + (o.f.i ? 'i' : '')); }
    catch (e) { return ctx.out.err('grep: bad regex: ' + e.message); }
    var hit = false, max = o.v.m ? LX.num(o.v.m) : Infinity;
    if (o.f.r && !files.length) files = ['.'];
    var targets = [];
    files.forEach(function (p) {
      var abs = LX.fs.norm(p), n = LX.fs.get(abs);
      if (!n) { ctx.out.err('grep: ' + p + ': No such file or directory'); return; }
      if (n.t === 'd') {
        if (!o.f.r) { ctx.out.err('grep: ' + p + ': Is a directory'); return; }
        (function walk(nd, path) {
          Object.keys(nd.c).sort().forEach(function (k) { var c = nd.c[k], pp = path + '/' + k; if (c.t === 'd') walk(c, pp); else if (c.t !== 'l') targets.push([pp.replace(/^\.\//, ''), c]); });
        })(n, p.replace(/\/$/, ''));
      } else targets.push([p, n]);
    });
    var multi = (targets.length > 1 || o.f.r) && !o.f.h || o.f.H;
    async function scan(label, text, isBin) {
      var lines = text.replace(/\n$/, '').split('\n'), count = 0;
      for (var i = 0; i < lines.length && count < max; i++) {
        re.lastIndex = 0;
        var m = re.test(lines[i]);
        if (m === !!o.f.v) continue;
        count++; hit = true;
        if (isBin && !o.f.a) { if (!o.f.c) ctx.out.text('grep: ' + label + ': binary file matches'); break; }
        if (o.f.c) continue;
        var pre = (multi ? label + ':' : '') + (o.f.n ? (i + 1) + ':' : '');
        if (o.f.o && !o.f.v) {
          re.lastIndex = 0; var mm;
          while ((mm = re.exec(lines[i])) !== null) { if (!mm[0]) { re.lastIndex++; continue; } ctx.out.html(span('c-violet', pre) + span('c-red b', mm[0])); }
        } else if (ctx.piped || o.f.v) ctx.out.text(pre + lines[i]);
        else {
          var parts = [], last = 0, mx;
          re.lastIndex = 0;
          while ((mx = re.exec(lines[i])) !== null) {
            if (!mx[0]) { re.lastIndex++; continue; }
            parts.push(esc(lines[i].slice(last, mx.index)), span('c-red b', mx[0]));
            last = mx.index + mx[0].length;
          }
          parts.push(esc(lines[i].slice(last)));
          ctx.out.html(span('c-violet', pre) + parts.join(''));
        }
      }
      if (o.f.c) ctx.out.text((multi ? label + ':' : '') + count);
    }
    if (!targets.length && !files.length) {
      if (ctx.stdin === null) return ctx.out.err('grep: no input. pipe something in or give a file');
      await scan('(stdin)', ctx.stdin, false);
    }
    for (var t = 0; t < targets.length; t++) {
      var n = targets[t][1];
      if (n.t === 'b') { var b = await LX.fs.bytes(n); await scan(targets[t][0], Array.from(b, function (c) { return String.fromCharCode(c); }).join(''), true); }
      else await scan(targets[t][0], await LX.fs.text(n), false);
    }
    return hit ? 0 : 1;
  });
  function headTail(isHead) {
    return async function (ctx) {
      var a = ctx.args.map(function (x) { return /^-\d+$/.test(x) ? '-n' + x.slice(1) : x; });
      var o = LX.opts(a, { vals: 'nc' }), n = LX.num(o.v.n, 10);
      var s = await LX.readInput(ctx, o.rest[0], ctx.name);
      if (s === null) return;
      var lines = s.replace(/\n$/, '').split('\n');
      ctx.out.text((isHead ? lines.slice(0, n) : lines.slice(-n)).join('\n'));
    };
  }
  def('head', { cat: 'text', help: 'first lines', usage: 'head [-n N] [file]' }, headTail(true));
  def('tail', { cat: 'text', help: 'last lines', usage: 'tail [-n N] [file]' }, headTail(false));
  def('wc', { cat: 'text', help: 'count lines, words, bytes', usage: 'wc [-lwc] [file]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'lwcm' });
    var s = await LX.readInput(ctx, o.rest[0], 'wc');
    if (s === null) return;
    var l = (s.match(/\n/g) || []).length, w = s.split(/\s+/).filter(Boolean).length, c = new TextEncoder().encode(s).length, m = Array.from(s).length;
    var parts = [];
    if (o.f.l) parts.push(l); if (o.f.w) parts.push(w); if (o.f.c) parts.push(c); if (o.f.m) parts.push(m);
    if (!parts.length) parts = [l, w, c];
    ctx.out.text(parts.map(function (x) { return LX.pad(x, 7, true); }).join(' ') + (o.rest[0] ? ' ' + o.rest[0] : ''));
  });
  def('sort', { cat: 'text', help: 'sort lines', usage: 'sort [-rnu] [file]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'rnuf' });
    var s = await LX.readInput(ctx, o.rest[0], 'sort');
    if (s === null) return;
    var lines = s.replace(/\n$/, '').split('\n');
    lines.sort(o.f.n ? function (a, b) { return parseFloat(a) - parseFloat(b) || (a < b ? -1 : a > b ? 1 : 0); }
      : function (a, b) { if (o.f.f) { a = a.toLowerCase(); b = b.toLowerCase(); } return a < b ? -1 : a > b ? 1 : 0; });
    if (o.f.r) lines.reverse();
    if (o.f.u) lines = lines.filter(function (x, i) { return i === 0 || x !== lines[i - 1]; });
    ctx.out.text(lines.join('\n'));
  });
  def('uniq', { cat: 'text', help: 'drop repeated lines', usage: 'uniq [-c] [file]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'cd' });
    var s = await LX.readInput(ctx, o.rest[0], 'uniq');
    if (s === null) return;
    var out = [], prev = null, cnt = 0;
    s.replace(/\n$/, '').split('\n').concat([null]).forEach(function (l) {
      if (l === prev) { cnt++; return; }
      if (prev !== null && (!o.f.d || cnt > 1)) out.push(o.f.c ? LX.pad(cnt, 7, true) + ' ' + prev : prev);
      prev = l; cnt = 1;
    });
    ctx.out.text(out.join('\n'));
  });
  function parseList(spec) {
    return spec.split(',').map(function (r) {
      var m = /^(\d*)(-?)(\d*)$/.exec(r);
      if (!m) throw new Error('invalid field list');
      var a = m[1] ? +m[1] : 1, b = m[2] ? (m[3] ? +m[3] : Infinity) : a;
      return [a, b];
    });
  }
  def('cut', { cat: 'text', help: 'cut out fields or characters', usage: 'cut -d DELIM -f LIST | -c LIST [file]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { vals: 'dfc' });
    if (!o.v.f && !o.v.c) return ctx.out.err('cut: you must specify a list of fields (-f) or characters (-c)');
    var s = await LX.readInput(ctx, o.rest[0], 'cut');
    if (s === null) return;
    var list = parseList(o.v.f || o.v.c), d = o.v.d === undefined ? '\t' : o.v.d;
    function pick(arr) { return arr.filter(function (x, i) { return list.some(function (r) { return i + 1 >= r[0] && i + 1 <= r[1]; }); }); }
    ctx.out.text(s.replace(/\n$/, '').split('\n').map(function (l) {
      if (o.v.c) return pick(Array.from(l)).join('');
      return l.indexOf(d) < 0 ? l : pick(l.split(d)).join(d);
    }).join('\n'));
  });
  function trSet(s) {
    s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\')
      .replace(/\[:(alpha|digit|upper|lower|space|alnum|xdigit):\]/g, function (m, c) {
        return { alpha: 'a-zA-Z', digit: '0-9', upper: 'A-Z', lower: 'a-z', space: ' \t\n', alnum: 'a-zA-Z0-9', xdigit: '0-9a-fA-F' }[c];
      });
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (s[i + 1] === '-' && i + 2 < s.length) { for (var c = s.charCodeAt(i); c <= s.charCodeAt(i + 2); c++) out += String.fromCharCode(c); i += 2; }
      else out += s[i];
    }
    return out;
  }
  def('tr', { cat: 'text', help: 'translate or delete characters', usage: "tr [-d] SET1 [SET2]   e.g. tr -d '\\n', tr a-z A-Z" }, function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'ds' });
    if (ctx.stdin === null) return ctx.out.err('tr: reads from stdin. pipe something in.');
    if (!o.rest.length) return ctx.out.err('tr: missing operand');
    var a = trSet(o.rest[0]), b = o.rest[1] !== undefined ? trSet(o.rest[1]) : '', s = ctx.stdin;
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var k = a.indexOf(s[i]);
      if (k < 0) out += s[i];
      else if (!o.f.d) out += b[Math.min(k, b.length - 1)] || '';
    }
    if (o.f.s && b) out = out.replace(new RegExp('([' + b.replace(/[\]\\^-]/g, '\\$&') + '])\\1+', 'g'), '$1');
    // keep a trailing newline only if there still is one, so `tr -d '\n' | unhex` works
    if (out.slice(-1) === '\n') out = out.slice(0, -1);
    ctx.out.text(out);
  });
  def('rev', { cat: 'text', help: 'reverse each line', usage: 'rev [file]' }, async function (ctx) {
    var s = ctx.args.length && !LX.fs.get(LX.fs.norm(ctx.args[0])) ? ctx.args.join(' ') : await LX.readInput(ctx, ctx.args[0], 'rev');
    if (s === null) return;
    ctx.out.text(s.replace(/\n$/, '').split('\n').map(function (l) { return Array.from(l).reverse().join(''); }).join('\n'));
  });

  // ------------------------------------------------------------ system
  def('clear', { cat: 'system', help: 'clear the screen (ctrl+l)' }, function () { LX.ui.out.textContent = ''; });
  def('history', { cat: 'system', help: 'your shell history. it is evidence too. -i adds timestamps', usage: 'history [-i] [-c]' }, function (ctx) {
    if (ctx.args[0] === '-c') { LX.hist.length = 0; LX.histTimes.length = 0; LX.histIdx = 0; return; }
    var stamps = ctx.args[0] === '-i' || ctx.args[0] === '-E' || ctx.args[0] === '-f';
    LX.hist.forEach(function (h, i) {
      var t = stamps ? new Date(LX.histTimes[i]).toISOString().replace('T', ' ').slice(0, 16) + '  ' : '';
      if (ctx.piped) ctx.out.text(LX.pad(i + 1, 5, true) + '  ' + t + h);
      else ctx.out.html(span('c-dim', LX.pad(i + 1, 5, true) + '  ' + t) + LX.highlight(h));
    });
  });
  def('bash', { cat: 'system', hidden: true }, function (ctx) {
    ctx.out.html(span('c-dim', 'you are already home. this is ') + span('c-green', 'zsh') + span('c-dim', '. bash is for scripts and nostalgia.'));
  });
  LX.cmds.sh = LX.cmds.bash;
  def('chsh', { cat: 'system', hidden: true }, function (ctx) {
    ctx.out.html(span('c-dim', 'chsh: the shell is zsh. that is not up for debate. (also, guests cannot change shells)'));
  });
  def('fish', { cat: 'system', hidden: true }, function (ctx) {
    ctx.out.html(span('c-dim', 'zsh: command not found: fish ') + span('c-faint', '(the autosuggestions here were stolen from it anyway)'));
  });
  def('whoami', { cat: 'system', help: 'who are you' }, function (ctx) { ctx.out.text(LX.USER); });
  def('id', { cat: 'system', help: 'user identity' }, function (ctx) { ctx.out.text('uid=1001(' + LX.USER + ') gid=1001(' + LX.USER + ') groups=1001(' + LX.USER + '),4747(evidence-ro)'); });
  def('hostname', { cat: 'system', help: 'machine name' }, function (ctx) { ctx.out.text(LX.HOST); });
  def('uname', { cat: 'system', help: 'kernel info', usage: 'uname [-a]' }, function (ctx) {
    ctx.out.text(ctx.args[0] === '-a' ? 'Linux ' + LX.HOST + ' ' + LX_CONFIG.machine.kernel + ' #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux' : 'Linux');
  });
  def('date', { cat: 'system', help: 'current date' }, function (ctx) { ctx.out.text(new Date().toString()); });
  def('uptime', { cat: 'system', help: 'how long this session has been running' }, function (ctx) {
    var s = Math.floor((Date.now() - LX.bootTime) / 1000);
    ctx.out.text(' ' + new Date().toTimeString().slice(0, 8) + ' up ' + Math.floor(s / 60) + ' min, 1 user (you), load average: 0.47, 0.13, 0.04');
  });
  def('env', { cat: 'system', help: 'environment variables' }, function (ctx) {
    ctx.out.text(['HOME=' + LX.HOME, 'USER=' + LX.USER, 'SHELL=/usr/bin/zsh', 'ZSH_VERSION=5.9', 'PWD=' + LX.fs.cwd, 'HOSTNAME=' + LX.HOST, 'WRITE_BLOCKER=on', 'EDITOR=vim', 'TERM=xterm-256color'].join('\n'));
  });
  def('alias', { cat: 'system', help: 'list or set aliases', usage: "alias [name='command']" }, function (ctx) {
    if (!ctx.args.length) { Object.keys(LX.aliases).sort().forEach(function (k) { ctx.out.text('alias ' + k + "='" + LX.aliases[k] + "'"); }); return; }
    var m = /^([\w.\-]+)=(.*)$/.exec(ctx.args.join(' '));
    if (!m) return ctx.out.err('alias: usage: alias name=command');
    LX.aliases[m[1]] = m[2];
  });
  def('which', { cat: 'system', help: 'locate a command', usage: 'which <cmd>' }, function (ctx) {
    ctx.args.forEach(function (c) {
      if (LX.aliases[c]) ctx.out.text(c + ': aliased to ' + LX.aliases[c]);
      else if (LX.cmds[c]) ctx.out.text('/usr/bin/' + c);
      else ctx.out.err(c + ' not found');
    });
  });
  def('logout', { cat: 'system', help: 'log out, then log back in under another name', usage: 'logout' }, function (ctx) {
    LX.authlog.push(LX.logTime() + ' ' + LX.HOST + ' login[812]: pam_unix(login:session): session closed for user ' + LX.USER);
    LX.store.set('user', null);
    ctx.out.text('logout', 'c-dim');
    LX.afterRun = function () { LX.ui.out.textContent = ''; LX.startSession(false); };
  });
  LX.cmds.exit = LX.cmds.logout; LX.cmds.login = LX.cmds.logout;
  def('sudo', { cat: 'system', help: 'you know what this does', hidden: true }, function (ctx) {
    var cmd = ctx.args.join(' ');
    LX.authlog.push(LX.logTime() + ' ' + LX.HOST + ' sudo:  ' + LX.USER + ' : user NOT in sudoers ; TTY=pts/1 ; PWD=' + LX.fs.cwd + ' ; USER=root ; COMMAND=' + (cmd || '/bin/sh'));
    ctx.out.html(span('c-red', LX.USER + ' is not in the sudoers file. this incident will be reported.'));
    ctx.out.html(span('c-dim', '(it actually was. see ') + LX.cmdLink('tail -n 3 /var/log/auth.log', '/var/log/auth.log', 'c-amber') + span('c-dim', ')'));
  });
  LX.cmds.su = LX.cmds.sudo; LX.cmds.doas = LX.cmds.sudo;
  def('chmod', { cat: 'system', hidden: true }, function (ctx) { ctx.out.err('chmod: changing permissions of evidence is how you lose a court case.'); });
})();
