// extra.js :: more tools (text, forensics, system) and a few easter eggs
'use strict';

(function () {
  var def = LX.def, esc = LX.esc, span = LX.span, B = LX.bin;

  function lines(s) { return s.replace(/\n$/, '').split('\n'); }
  function readText(ctx, path, cmd) { return LX.readInput(ctx, path, cmd); }
  function tsFull(d) {
    var p2 = function (x) { return String(x).padStart(2, '0'); }, off = -d.getTimezoneOffset();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) +
      '.000000000 ' + (off >= 0 ? '+' : '-') + p2(Math.floor(Math.abs(off) / 60)) + p2(Math.abs(off) % 60);
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ============================================================ text tools
  def('printf', { cat: 'text', help: 'formatted output (%s %d %x %c %%)', usage: 'printf FORMAT [args...]' }, function (ctx) {
    if (!ctx.args.length) return ctx.out.err('printf: usage: printf format [arguments]');
    var fmt = ctx.args[0], args = ctx.args.slice(1), ai = 0;
    var s = fmt.replace(/%(-?)(0?)(\d*)([sdixXoc%])/g, function (m, left, zero, w, t) {
      if (t === '%') return '%';
      var a = args[ai++]; if (a === undefined) a = t === 's' || t === 'c' ? '' : '0';
      var v;
      if (t === 's') v = a; else if (t === 'c') v = a[0] || '';
      else {
        var n = /^0x/i.test(a) ? parseInt(a, 16) : parseInt(a, 10); if (isNaN(n)) n = 0;
        v = t === 'x' ? n.toString(16) : t === 'X' ? n.toString(16).toUpperCase() : t === 'o' ? n.toString(8) : String(n);
      }
      w = +w || 0;
      return left ? v.padEnd(w) : v.padStart(w, zero && t !== 's' ? '0' : ' ');
    }).replace(/\\x([0-9a-fA-F]{2})|\\n|\\t|\\\\/g, function (m, h) { return h ? String.fromCharCode(parseInt(h, 16)) : m === '\\n' ? '\n' : m === '\\t' ? '\t' : '\\'; });
    ctx.out.text(s.replace(/\n$/, ''));
  });
  def('seq', { cat: 'text', help: 'print a sequence of numbers', usage: 'seq [first [step]] last' }, function (ctx) {
    var a = ctx.args.map(Number);
    if (!a.length || a.some(isNaN)) return ctx.out.err('seq: usage: seq [first [step]] last');
    var first = a.length > 1 ? a[0] : 1, step = a.length > 2 ? a[1] : 1, last = a[a.length - 1], out = [];
    if (!step) return ctx.out.err('seq: step cannot be 0');
    for (var x = first; step > 0 ? x <= last : x >= last; x += step) { out.push(+x.toFixed(10)); if (out.length > 100000) break; }
    ctx.out.text(out.join('\n'));
  });
  def('tac', { cat: 'text', help: 'cat, backwards (last line first)', usage: 'tac [file]' }, async function (ctx) {
    var s = await readText(ctx, ctx.args[0], 'tac'); if (s === null) return;
    ctx.out.text(lines(s).reverse().join('\n'));
  });
  def('nl', { cat: 'text', help: 'number lines', usage: 'nl [file]' }, async function (ctx) {
    var s = await readText(ctx, ctx.args[0], 'nl'); if (s === null) return;
    var k = 0;
    ctx.out.text(lines(s).map(function (l) { return l.trim() ? LX.pad(++k, 6, true) + '\t' + l : ''; }).join('\n'));
  });
  def('tee', { cat: 'text', help: 'copy stdin to a file and to stdout', usage: 'cmd | tee [-a] file' }, function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'a' });
    if (ctx.stdin === null) return ctx.out.err('tee: reads from stdin. pipe something in.');
    var s = ctx.stdin;
    o.rest.forEach(function (f) {
      try {
        var ex = LX.fs.get(LX.fs.norm(f));
        if (o.f.a && ex && ex.t === 'f' && LX.fs.writable(LX.fs.norm(f + '/..'))) ex.text += s;
        else LX.fs.put(f, LX.F(s));
      } catch (e) { ctx.out.err('tee: ' + e.message); }
    });
    ctx.out.text(s.replace(/\n$/, ''));
  });
  def('fold', { cat: 'text', help: 'wrap long lines', usage: 'fold [-w width] [file]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { vals: 'w' }), w = LX.num(o.v.w, 80);
    var s = await readText(ctx, o.rest[0], 'fold'); if (s === null) return;
    ctx.out.text(lines(s).map(function (l) { var r = []; for (var i = 0; i < l.length || i === 0; i += w) r.push(l.slice(i, i + w)); return r.join('\n'); }).join('\n'));
  });
  def('basename', { cat: 'text', help: 'strip the directory from a path', usage: 'basename path [suffix]' }, function (ctx) {
    if (!ctx.args[0]) return ctx.out.err('basename: missing operand');
    var b = ctx.args[0].replace(/\/+$/, '').split('/').pop() || '/';
    if (ctx.args[1] && b.slice(-ctx.args[1].length) === ctx.args[1] && b !== ctx.args[1]) b = b.slice(0, -ctx.args[1].length);
    ctx.out.text(b);
  });
  def('dirname', { cat: 'text', help: 'strip the last part of a path', usage: 'dirname path' }, function (ctx) {
    if (!ctx.args[0]) return ctx.out.err('dirname: missing operand');
    var p = ctx.args[0].replace(/\/+$/, ''), i = p.lastIndexOf('/');
    ctx.out.text(i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i));
  });
  def('realpath', { cat: 'nav', help: 'the absolute path of something', usage: 'realpath path' }, function (ctx) {
    (ctx.args.length ? ctx.args : ['.']).forEach(function (p) {
      var abs = LX.fs.norm(p);
      if (!LX.fs.get(abs)) ctx.out.err('realpath: ' + p + ': No such file or directory'); else ctx.out.text(abs);
    });
  });

  // ---- sed: s///, /re/d, -n /re/p, Np, Nd. patterns are JS regexes (think sed -E)
  def('sed', { cat: 'text', help: 'stream editor: s/find/replace/g and friends', usage: "sed [-n] 's/re/repl/g' [file]" }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'nEr', vals: 'e' }), script = o.v.e || o.rest.shift();
    if (!script) return ctx.out.err('sed: usage: sed [-n] script [file]');
    var s = await readText(ctx, o.rest[0], 'sed'); if (s === null) return;
    var m, act;
    try {
      if ((m = /^s(.)(.*?)\1(.*?)\1([gip0-9]*)$/.exec(script))) {
        var re = new RegExp(m[2], (m[4].indexOf('g') >= 0 ? 'g' : '') + (m[4].indexOf('i') >= 0 ? 'i' : ''));
        var rep = m[3].replace(/\$/g, '$$$$').replace(/\\(\d)/g, '$$$1').replace(/(^|[^\\])&/g, '$1$$&').replace(/\\&/g, '&').replace(/\\n/g, '\n');
        act = function (l) { var r = l.replace(re, rep); return m[4].indexOf('p') >= 0 && r !== l ? [r, r] : [r]; };
      } else if ((m = /^\/(.*)\/([dp])$/.exec(script))) {
        var r2 = new RegExp(m[1]);
        act = function (l) { return r2.test(l) ? (m[2] === 'd' ? [] : [l, l]) : [l]; };
      } else if ((m = /^(\d+)([dpq])$/.exec(script))) {
        var n = +m[1];
        act = function (l, i) { return i + 1 === n ? (m[2] === 'd' ? [] : m[2] === 'q' ? [l, null] : [l, l]) : [l]; };
      } else return ctx.out.err("sed: this sed knows s/re/repl/flags, /re/d, /re/p, Nd, Np, Nq. got: " + script);
    } catch (e) { return ctx.out.err('sed: ' + e.message); }
    var out = [], ls = lines(s);
    for (var i = 0; i < ls.length; i++) {
      var r = act(ls[i], i);
      if (r[1] === null) { if (!o.f.n) out.push(r[0]); break; }
      if (o.f.n) { if (r.length === 2) out.push(r[1]); }
      else r.forEach(function (x) { out.push(x); });
    }
    ctx.out.text(out.join('\n'));
  });

  // ---- awk: [-F sep] '[/re/] {print $1, $3}' with $0 $N $NF NF NR and "strings"
  def('awk', { cat: 'text', help: 'print columns: awk \'{print $2}\'', usage: "awk [-F sep] '[/re/] {print $1, $NF}' [file]" }, async function (ctx) {
    var o = LX.opts(ctx.args, { vals: 'F' }), prog = (o.rest.shift() || '').trim();
    var m = /^(?:\/(.*?)\/)?\s*(?:\{\s*print\s*(.*?)\s*;?\s*\})?$/.exec(prog);
    if (!prog || !m) return ctx.out.err("awk: this awk understands '[/regex/] {print ...}'. got: " + prog);
    var s = await readText(ctx, o.rest[0], 'awk'); if (s === null) return;
    var pat = m[1] ? new RegExp(m[1]) : null, items = m[2] === undefined || m[2] === '' ? ['$0'] : m[2].match(/("[^"]*"|[^,])+/g).map(function (x) { return x.trim(); });
    var sep = o.v.F === undefined ? null : o.v.F === 't' || o.v.F === '\\t' ? '\t' : o.v.F, out = [];
    lines(s).forEach(function (l, i) {
      if (pat && !pat.test(l)) return;
      var f = sep === null ? l.trim().split(/\s+/).filter(Boolean) : l.split(sep);
      var val = function (atom) {
        var mm;
        if (atom === '$0') return l;
        if ((mm = /^\$(\d+)$/.exec(atom))) return f[+mm[1] - 1] || '';
        if (atom === '$NF') return f[f.length - 1] || '';
        if (atom === 'NF') return String(f.length);
        if (atom === 'NR') return String(i + 1);
        if ((mm = /^"(.*)"$/.exec(atom))) return mm[1].replace(/\\t/g, '\t');
        return atom;
      };
      out.push(items.map(function (it) { return (it.match(/"[^"]*"|\S+/g) || []).map(val).join(''); }).join(' '));
    });
    ctx.out.text(out.join('\n'));
  });

  // ---- jq: . .a .a.b .a[0] .[] keys length, -r raw, -c compact
  def('jq', { cat: 'text', help: 'poke at json', usage: 'jq [-r] [-c] [.path] [file]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'rcM' }), path = o.rest[0] && /^[.k l]/.test(o.rest[0]) && !LX.fs.get(LX.fs.norm(o.rest[0])) ? o.rest.shift() : '.';
    var s = await readText(ctx, o.rest[0], 'jq'); if (s === null) return;
    var data;
    try { data = JSON.parse(s); } catch (e) { return ctx.out.err('jq: error: cannot parse input: ' + e.message); }
    var vals = [data];
    if (path === 'keys') vals = [Object.keys(data)];
    else if (path === 'length') vals = [Array.isArray(data) || typeof data === 'string' ? data.length : Object.keys(data || {}).length];
    else {
      var toks = path.match(/\.\w+|\[\d+\]|\[\]|\./g) || [];
      if (toks.join('') !== path) return ctx.out.err('jq: error: this jq knows paths like .a.b[0] .[] keys length. got: ' + path);
      toks.forEach(function (t) {
        var next = [];
        vals.forEach(function (v) {
          if (t === '.') next.push(v);
          else if (t === '[]') { if (v && typeof v === 'object') (Array.isArray(v) ? v : Object.values(v)).forEach(function (x) { next.push(x); }); }
          else if (t[0] === '[') next.push(Array.isArray(v) ? v[+t.slice(1, -1)] : null);
          else next.push(v && typeof v === 'object' ? v[t.slice(1)] : null);
        });
        vals = next;
      });
    }
    vals.forEach(function (v) {
      if (v === undefined) v = null;
      if (o.f.r && typeof v === 'string') return ctx.out.text(v);
      var j = JSON.stringify(v, null, o.f.c ? 0 : 2);
      if (ctx.piped || o.f.M) return ctx.out.text(j);
      ctx.out.pre(esc(j).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+\.?\d*(?:e[+-]?\d+)?)/g, function (m, str, colon, lit, num) {
        if (str) return colon ? span('c-blue', LX.strip(str)) + colon : span('c-green', LX.strip(str));
        if (lit) return span('c-violet', lit);
        return span('c-amber', num);
      }));
    });
  });

  // ---- diff (LCS) and cmp (first differing byte)
  def('diff', { cat: 'text', help: 'compare two files line by line', usage: 'diff file1 file2' }, async function (ctx) {
    var a = LX.open(ctx, ctx.args[0], 'diff'), b = a && LX.open(ctx, ctx.args[1], 'diff');
    if (!a || !b) return 2;
    var A = lines(await LX.fs.text(a.node)), Bl = lines(await LX.fs.text(b.node));
    if (A.length * Bl.length > 4e6) return ctx.out.err('diff: files too big for this diff. try cmp');
    var n = A.length, m = Bl.length, L = [];
    for (var i = 0; i <= n; i++) { L.push(new Uint32Array(m + 1)); }
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i][j] = A[i] === Bl[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var out = [], same = true;
    i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === Bl[j]) { i++; j++; continue; }
      same = false;
      if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { out.push(['+', Bl[j], j + 1]); j++; }
      else { out.push(['-', A[i], i + 1]); i++; }
    }
    if (same) return 0;
    ctx.out.text('--- ' + ctx.args[0] + '\n+++ ' + ctx.args[1], ctx.piped ? '' : 'c-dim');
    out.forEach(function (d) { if (ctx.piped) ctx.out.text(d[0] + d[1]); else ctx.out.html(span(d[0] === '+' ? 'c-green' : 'c-red', d[0] + d[1])); });
    return 1;
  });
  def('cmp', { cat: 'forensics', help: 'find the first byte where two files differ', usage: 'cmp file1 file2' }, async function (ctx) {
    var a = LX.open(ctx, ctx.args[0], 'cmp'), b = a && LX.open(ctx, ctx.args[1], 'cmp');
    if (!a || !b) return 2;
    var x = await LX.fs.bytes(a.node), y = await LX.fs.bytes(b.node), line = 1;
    for (var i = 0; i < Math.min(x.length, y.length); i++) {
      if (x[i] !== y[i]) { ctx.out.text(ctx.args[0] + ' ' + ctx.args[1] + ' differ: byte ' + (i + 1) + ', line ' + line); return 1; }
      if (x[i] === 10) line++;
    }
    if (x.length !== y.length) { ctx.out.text('cmp: EOF on ' + (x.length < y.length ? ctx.args[0] : ctx.args[1]) + ' after byte ' + Math.min(x.length, y.length)); return 1; }
    return 0;
  });

  // ---- calc / bc: a small, safe expression parser (no eval, the CSP would not allow it anyway)
  function calc(src) {
    var s = src.replace(/\s+/g, ''), i = 0;
    function num() {
      var m = /^(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d*\.?\d+(?:e[+-]?\d+)?)/i.exec(s.slice(i));
      if (!m) {
        var f = /^(sqrt|abs|log2|log10|ln|floor|ceil|round)\(/.exec(s.slice(i));
        if (f) { i += f[0].length; var v = expr(); if (s[i++] !== ')') throw new Error('missing )'); return { sqrt: Math.sqrt, abs: Math.abs, log2: Math.log2, log10: Math.log10, ln: Math.log, floor: Math.floor, ceil: Math.ceil, round: Math.round }[f[1]](v); }
        var c = /^(pi|e)(?![a-z])/i.exec(s.slice(i));
        if (c) { i += c[0].length; return c[1].toLowerCase() === 'pi' ? Math.PI : Math.E; }
        throw new Error('syntax error at "' + (s.slice(i) || 'end') + '"');
      }
      i += m[0].length;
      var t = m[0].toLowerCase();
      return t.indexOf('0x') === 0 ? parseInt(t, 16) : t.indexOf('0b') === 0 ? parseInt(t.slice(2), 2) : t.indexOf('0o') === 0 ? parseInt(t.slice(2), 8) : parseFloat(t);
    }
    function atom() {
      if (s[i] === '(') { i++; var v = expr(); if (s[i++] !== ')') throw new Error('missing )'); return v; }
      if (s[i] === '-') { i++; return -atom(); }
      if (s[i] === '+') { i++; return atom(); }
      return num();
    }
    function power() { var b = atom(); if (s[i] === '^' || s.substr(i, 2) === '**') { i += s[i] === '^' ? 1 : 2; return Math.pow(b, power()); } return b; }
    function term() {
      var v = power();
      while (s[i] === '*' && s[i + 1] !== '*' || s[i] === '/' || s[i] === '%') { var op = s[i++], r = power(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; }
      return v;
    }
    function expr() { var v = term(); while (s[i] === '+' || s[i] === '-') { var op = s[i++], r = term(); v = op === '+' ? v + r : v - r; } return v; }
    var r = expr();
    if (i < s.length) throw new Error('syntax error at "' + s.slice(i) + '"');
    return r;
  }
  function calcOut(ctx, src, plain) {
    var v;
    try { v = calc(src); } catch (e) { ctx.out.err('calc: ' + e.message); return; }
    var str = Number.isInteger(v) ? String(v) : String(+v.toFixed(10));
    if (Number.isInteger(v) && Math.abs(v) < 2 ** 53 && !ctx.piped && !plain) ctx.out.html(span('c-amber', str) + span('c-dim', '   0x' + (v < 0 ? '-' : '') + Math.abs(v).toString(16) + '   0b' + Math.abs(v).toString(2)));
    else ctx.out.text(str);
  }
  def('calc', { cat: 'text', help: 'calculator. hex/bin in, hex/bin out', usage: 'calc <expression>   e.g. calc 0x4525 + 512' }, function (ctx) {
    var src = ctx.args.join(' ') || (ctx.stdin || '').trim();
    if (!src) return ctx.out.err('calc: give me an expression, e.g. calc 2^10 or calc 0x45e0 - 0x4525');
    calcOut(ctx, src);
  });
  def('bc', { cat: 'text', help: 'calculator that reads stdin', usage: 'echo 2+2 | bc' }, function (ctx) {
    var src = ctx.stdin !== null ? ctx.stdin : ctx.args.join(' ');
    if (!src.trim()) return ctx.out.err('bc: pipe an expression in, e.g. echo 2^64 | bc');
    lines(src).filter(function (l) { return l.trim(); }).forEach(function (l) { calcOut(ctx, l, true); });
  });
  def('factor', { cat: 'text', help: 'prime factors of a number', usage: 'factor N' }, function (ctx) {
    (ctx.args.length ? ctx.args : lines(ctx.stdin || '')).forEach(function (a) {
      var n = Number(a);
      if (!Number.isSafeInteger(n) || n < 1) return ctx.out.err("factor: '" + a + "' is not a valid positive integer");
      var f = [], x = n;
      for (var p = 2; p * p <= x; p++) while (x % p === 0) { f.push(p); x /= p; }
      if (x > 1) f.push(x);
      ctx.out.text(n + ': ' + f.join(' ') + (n === 1337 ? '   (leet, and prime-ish: 7 x 191)' : ''));
    });
  });

  // ---- cp / mv
  async function copyNode(n) {
    if (n.t === 'f') return LX.F(n.text);
    if (n.t === 'b') return { t: 'b', data: (await LX.fs.bytes(n)).slice() };
    if (n.t === 'l') return { t: 'l', url: n.url };
    var d = LX.D({});
    for (var k in n.c) d.c[k] = await copyNode(n.c[k]);
    return d;
  }
  async function cpmv(ctx, move) {
    var o = LX.opts(ctx.args, { flags: 'rRvf' }), name = move ? 'mv' : 'cp';
    if (o.rest.length < 2) return ctx.out.err(name + ': missing destination file operand');
    var dst = o.rest.pop(), dstAbs = LX.fs.norm(dst), dstNode = LX.fs.get(dstAbs);
    if (o.rest.length > 1 && (!dstNode || dstNode.t !== 'd')) return ctx.out.err(name + ": target '" + dst + "' is not a directory");
    for (var i = 0; i < o.rest.length; i++) {
      var src = o.rest[i], abs = LX.fs.norm(src), n = LX.fs.get(abs);
      if (!n) { ctx.out.err(name + ": cannot stat '" + src + "': No such file or directory"); continue; }
      if (n.t === 'd' && !move && !(o.f.r || o.f.R)) { ctx.out.err("cp: -r not specified; omitting directory '" + src + "'"); continue; }
      var base = abs.slice(abs.lastIndexOf('/') + 1), to = dstNode && dstNode.t === 'd' ? dstAbs + '/' + base : dstAbs;
      var srcDir = abs.slice(0, abs.lastIndexOf('/')) || '/';
      if (move && !LX.fs.writable(srcDir)) { ctx.out.err("mv: cannot move '" + src + "': write-blocker says the evidence stays where it is. (cp works)"); continue; }
      try {
        LX.fs.put(to, move ? n : await copyNode(n));
        if (move) delete LX.fs.get(srcDir).c[base];
        if (o.f.v) ctx.out.text("'" + src + "' -> '" + LX.fs.display(to) + "'");
      } catch (e) { ctx.out.err(name + ': ' + e.message); }
    }
  }
  def('cp', { cat: 'nav', help: 'copy files (evidence -> ~/work is fine, the other way is not)', usage: 'cp [-r] src... dest' }, function (ctx) { return cpmv(ctx, false); });
  def('mv', { cat: 'nav', help: 'move / rename files', usage: 'mv src... dest' }, function (ctx) { return cpmv(ctx, true); });

  // ============================================================ forensics tools
  def('stat', { cat: 'forensics', help: 'size, inode and MAC(B) timestamps', usage: 'stat <file...>' }, function (ctx) {
    if (!ctx.args.length) return ctx.out.err('stat: missing operand');
    ctx.args.forEach(function (p) {
      var abs = LX.fs.norm(p), n = LX.fs.get(abs);
      if (!n) return ctx.out.err("stat: cannot statx '" + p + "': No such file or directory");
      var size = n.t === 'd' ? 4096 : n.t === 'l' ? n.url.length : LX.fs.size(n);
      var ro = n.ro || !LX.fs.writable(abs.slice(0, abs.lastIndexOf('/')) || '/');
      var evidence = abs.indexOf(LX.HOME + '/cases') === 0 || !!n.src;
      var mode = n.t === 'd' ? (ro ? '0555/dr-xr-xr-x' : '0755/drwxr-xr-x') : n.t === 'l' ? '0777/lrwxrwxrwx' : ro ? '0444/-r--r--r--' : '0644/-rw-r--r--';
      var who = evidence ? '( 1000/' + LX.pad(LX_CONFIG.owner, 8, true) + ')   Gid: ( 4747/evidence)' : abs.indexOf('/home') === 0 ? '( 1001/' + LX.pad(LX.USER, 8, true) + ')   Gid: ( 1001/' + LX.pad(LX.USER, 8, true) + ')' : '(    0/    root)   Gid: (    0/    root)';
      var m = n.mtime || LX.bootTime, a = evidence ? m : new Date();
      var t = n.t === 'd' ? 'directory' : n.t === 'l' ? 'symbolic link' : size ? 'regular file' : 'regular empty file';
      var txt = '  File: ' + p + (n.t === 'l' ? ' -> ' + n.url : '') + '\n' +
        '  Size: ' + LX.pad(size, 10) + ' Blocks: ' + LX.pad(Math.ceil(size / 512) * (size ? 1 : 0), 10) + ' IO Block: 4096   ' + t + '\n' +
        'Device: 259,2\tInode: ' + LX.pad(1048576 + hashStr(abs) % 9000000, 11) + ' Links: 1\n' +
        'Access: (' + mode + ')  Uid: ' + who + '\n' +
        'Access: ' + tsFull(a) + '\n' + 'Modify: ' + tsFull(m) + '\n' + 'Change: ' + tsFull(m) + '\n' + ' Birth: ' + tsFull(m);
      ctx.out.text(txt);
      if (evidence && !ctx.piped) ctx.out.text('(access time did not change when you read it: mounted read-only. the write-blocker keeps your fingerprints off.)', 'c-dim');
    });
  });

  // carve files out of anything by header + footer, like foremost / scalpel
  var CARVERS = [
    ['jpg', [0xFF, 0xD8, 0xFF], function (b, o) { for (var i = o + 2; i < b.length - 1; i++) if (b[i] === 0xFF && b[i + 1] === 0xD9) return i + 2; return -1; }],
    ['png', [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], function (b, o) { for (var i = o + 8; i <= b.length - 8; i++) if (b[i] === 0x49 && b[i + 1] === 0x45 && b[i + 2] === 0x4E && b[i + 3] === 0x44) return i + 8; return -1; }],
    ['gif', [0x47, 0x49, 0x46, 0x38], function (b, o) { for (var i = o + 6; i < b.length - 1; i++) if (b[i] === 0x00 && b[i + 1] === 0x3B) return i + 2; return -1; }],
    ['pdf', [0x25, 0x50, 0x44, 0x46, 0x2D], function (b, o) { var s = B.str(b, o, Math.min(b.length - o, 5e6)), k = s.lastIndexOf('%%EOF'); return k < 0 ? -1 : o + k + 5; }],
    ['zip', [0x50, 0x4B, 0x03, 0x04], function (b, o) { for (var i = o; i <= b.length - 22; i++) if (b[i] === 0x50 && b[i + 1] === 0x4B && b[i + 2] === 5 && b[i + 3] === 6) return i + 22 + B.le16(b, i + 20); return -1; }],
    ['wav', [0x52, 0x49, 0x46, 0x46], function (b, o) { return B.str(b, o + 8, 4) === 'WAVE' ? Math.min(b.length, o + 8 + B.le32(b, o + 4)) : -1; }]
  ];
  def('foremost', { cat: 'forensics', help: 'carve files out of anything by header/footer (file system not needed)', usage: 'foremost [-t types] [-o outdir] <file>' }, async function (ctx) {
    var o = LX.opts(ctx.args, { vals: 'tio', flags: 'vq' }), path = o.v.i || o.rest[0];
    var f = LX.open(ctx, path, 'foremost');
    if (!f) return;
    var b = await LX.fs.bytes(f.node), want = o.v.t ? o.v.t.split(',') : null, found = [];
    for (var off = 0; off < b.length - 8; off++) {
      for (var c = 0; c < CARVERS.length; c++) {
        var cv = CARVERS[c];
        if (want && want.indexOf(cv[0]) < 0 && want.indexOf('all') < 0) continue;
        if (!B.at(b, off, cv[1])) continue;
        var end = cv[2](b, off);
        if (end > off && end <= b.length) { found.push([cv[0], off, end]); off = end - 1; break; }
      }
    }
    var outDir = o.v.o ? LX.fs.norm(o.v.o) : LX.HOME + '/work/output';
    try {
      if (!LX.fs.get(LX.HOME + '/work')) LX.fs.put(LX.HOME + '/work', LX.D({}));
      LX.fs.put(outDir, LX.D({}));
    } catch (e) { return ctx.out.err('foremost: ' + e.message); }
    var counts = {}, audit = ['Foremost version 1.5.7 (lynnux build)', 'Audit File', '', 'Invocation: foremost ' + ctx.args.join(' '), 'Output directory: ' + LX.fs.display(outDir), 'Input file: ' + path, '', 'Num\t Name (bs=512)\t       Size\t File Offset'];
    found.forEach(function (x, i) {
      var name = String(Math.floor(x[1] / 512)).padStart(8, '0') + '.' + x[0];
      if (!LX.fs.get(outDir + '/' + x[0])) LX.fs.put(outDir + '/' + x[0], LX.D({}));
      LX.fs.put(outDir + '/' + x[0] + '/' + name, { t: 'b', data: b.slice(x[1], x[2]) });
      counts[x[0]] = (counts[x[0]] || 0) + 1;
      audit.push(i + ':\t' + name + '\t' + LX.pad(LX.fmtSize(x[2] - x[1]), 10, true) + '\t ' + x[1]);
    });
    audit.push('', 'Finish: ' + new Date().toString(), '', found.length + ' FILES EXTRACTED');
    Object.keys(counts).forEach(function (k) { audit.push(k + ':= ' + counts[k]); });
    LX.fs.put(outDir + '/audit.txt', LX.F(audit.join('\n') + '\n'));
    ctx.out.text('Processing: ' + path + '\n|' + '*'.repeat(Math.max(1, Math.min(40, Math.round(b.length / 16384)))) + '|');
    ctx.out.html(span(found.length ? 'c-green' : 'c-dim', found.length + ' FILES EXTRACTED') + (found.length ? span('c-dim', '  ' + Object.keys(counts).map(function (k) { return k + ':= ' + counts[k]; }).join('  ')) : ''));
    if (found.length && !ctx.piped) ctx.out.html(span('c-dim', 'results in ') + LX.cmdLink('tree ' + LX.fs.display(outDir), LX.fs.display(outDir), 'c-cyan') + span('c-dim', ', log in audit.txt'));
  });

  // shannon entropy + a sparkline across the file, like binwalk -E
  def('entropy', { cat: 'forensics', help: 'how random is it? spots compressed / encrypted regions', usage: 'entropy [-n buckets] <file>' }, async function (ctx) {
    var o = LX.opts(ctx.args, { vals: 'n' });
    var r = await LX.readBytes(ctx, o.rest[0], 'entropy');
    if (!r) return;
    var b = r.bytes;
    function H(from, to) {
      var c = new Uint32Array(256), n = to - from;
      for (var i = from; i < to; i++) c[b[i]]++;
      var h = 0;
      for (var k = 0; k < 256; k++) if (c[k]) { var p = c[k] / n; h -= p * Math.log2(p); }
      return h;
    }
    if (!b.length) return ctx.out.err('entropy: empty input');
    var total = H(0, b.length);
    ctx.out.text('Entropy = ' + total.toFixed(6) + ' bits per byte.');
    ctx.out.text('Optimum compression would reduce the size of this ' + b.length + ' byte file by ' + Math.max(0, Math.round((8 - total) / 8 * 100)) + ' percent.');
    var verdict = total > 7.9 ? 'looks compressed or encrypted' : total > 7 ? 'dense, probably compressed data mixed with structure' : total > 4.5 ? 'structured data or text-ish' : total > 1 ? 'mostly empty or very repetitive' : 'basically empty';
    ctx.out.html(span('c-dim', 'verdict: ') + span(total > 7.5 ? 'c-red' : total > 4.5 ? 'c-amber' : 'c-green', verdict));
    var nb = Math.max(8, Math.min(120, LX.num(o.v.n, 64))), step = Math.max(1, Math.ceil(b.length / nb)), bars = '▁▂▃▄▅▆▇█', spark = '', html = '';
    for (var s = 0; s < b.length; s += step) {
      var h = H(s, Math.min(b.length, s + step)), ch = bars[Math.min(7, Math.floor(h))];
      spark += ch; html += span(h > 7.5 ? 'c-red' : h > 4.5 ? 'c-amber' : h > 1 ? 'c-green' : 'c-faint', ch);
    }
    if (ctx.piped) ctx.out.text(spark);
    else { ctx.out.pre(html); ctx.out.text('0' + ' '.repeat(Math.max(1, spark.length - 1 - String(b.length).length)) + b.length + '   (one bar = ' + step + ' bytes)', 'c-dim'); }
  });
  LX.cmds.ent = LX.cmds.entropy;

  def('xor', { cat: 'forensics', help: 'xor bytes with a key (hex or text)', usage: 'xor <key> [file]   e.g. xor 0x42 secret.bin, xor -s key file' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 's' }), k = o.rest.shift();
    if (k === undefined) return ctx.out.err('xor: usage: xor <key> [file]');
    var key;
    if (!o.f.s && /^(0x)?[0-9a-f]+$/i.test(k) && (k.replace(/^0x/i, '').length % 2 === 0 || /^0x/i.test(k))) {
      var hx = k.replace(/^0x/i, ''); if (hx.length % 2) hx = '0' + hx;
      key = new Uint8Array(hx.match(/../g).map(function (x) { return parseInt(x, 16); }));
    } else key = new TextEncoder().encode(k);
    var r = await LX.readBytes(ctx, o.rest[0], 'xor');
    if (!r) return;
    var out = new Uint8Array(r.bytes.length);
    for (var i = 0; i < out.length; i++) out[i] = r.bytes[i] ^ key[i % key.length];
    ctx.out.bytes(out, 'xor ' + k + ' ' + (o.rest[0] || ''));
  });

  def('pngcheck', { cat: 'forensics', help: 'walk png chunks, check every crc, spot trailing data', usage: 'pngcheck [-v] <file.png>' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'vq' }), f = LX.open(ctx, o.rest[0], 'pngcheck');
    if (!f) return;
    var b = await LX.fs.bytes(f.node);
    if (!B.at(b, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) { ctx.out.html(span('c-red', o.rest[0] + '  this is neither a PNG image nor a MNG stream')); return 1; }
    var p = 8, n = 0, bad = 0, idat = 0, info = '';
    if (o.f.v) ctx.out.text('File: ' + o.rest[0] + ' (' + b.length + ' bytes)');
    while (p + 12 <= b.length) {
      var len = B.be32(b, p), type = B.str(b, p + 4, 4);
      if (p + 12 + len > b.length) { ctx.out.html(span('c-red', '  chunk ' + type + ' at offset 0x' + LX.hex(p, 5) + ' runs past the end of the file (truncated?)')); bad++; break; }
      var crc = B.be32(b, p + 8 + len), calc = LX.crc32(b.subarray(p + 4, p + 8 + len)), okc = crc === calc;
      n++; if (type === 'IDAT') idat += len;
      if (type === 'IHDR') info = B.be32(b, p + 8) + 'x' + B.be32(b, p + 12) + ' image, ' + b[p + 16] + '-bit ' + ({ 0: 'grayscale', 2: 'RGB', 3: 'palette', 4: 'gray+alpha', 6: 'RGB+alpha' }[b[p + 17]] || '?');
      if (o.f.v) {
        var extra = type === 'tEXt' ? ', keyword: ' + B.str(b, p + 8, len).split('\0')[0] : '';
        ctx.out.html('  chunk ' + span('c-cyan', type) + ' at offset 0x' + LX.hex(p, 5) + ', length ' + len + esc(extra) + (okc ? '' : span('c-red', '  CRC error (computed ' + LX.hex(calc, 8) + ', expected ' + LX.hex(crc, 8) + ')')));
      } else if (!okc) ctx.out.html(span('c-red', '  CRC error in chunk ' + type + ' (computed ' + LX.hex(calc, 8) + ', expected ' + LX.hex(crc, 8) + ')'));
      if (!okc) bad++;
      p += 12 + len;
      if (type === 'IEND') break;
    }
    if (p < b.length) { ctx.out.html(span('c-red', '  additional data after IEND chunk (' + (b.length - p) + ' bytes at offset 0x' + LX.hex(p, 5) + ')')); bad++; }
    var w = B.be32(b, 16), h = B.be32(b, 20), raw = w * h * ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[b[25]] || 3) * b[24] / 8;
    if (bad) ctx.out.html(span('c-red', 'ERRORS DETECTED in ' + o.rest[0]));
    else ctx.out.html(span('c-green', 'OK: ') + esc(o.rest[0] + ' (' + info + ', ' + (raw ? (100 - idat / raw * 100).toFixed(1) : '?') + '% compression, ' + n + ' chunks)'));
    return bad ? 2 : 0;
  });

  // ============================================================ system
  function table(ctx, rows) {
    var w = [];
    rows.forEach(function (r) { r.forEach(function (c, i) { w[i] = Math.max(w[i] || 0, String(c).length); }); });
    ctx.out.text(rows.map(function (r, ri) { return r.map(function (c, i) { return i === 0 ? LX.pad(c, w[i]) : LX.pad(c, w[i], true); }).join('  '); }).join('\n'));
  }
  def('free', { cat: 'system', help: 'memory usage (it is all tabs)', usage: 'free [-h]' }, function (ctx) {
    table(ctx, [['', 'total', 'used', 'free', 'shared', 'buff/cache', 'available'], ['Mem:', '1.0Ti', '1013Gi', '2.1Gi', '1.2Gi', '8.7Gi', '10Gi'], ['Swap:', '2.0Ti', '0B', '2.0Ti']]);
  });
  def('df', { cat: 'system', help: 'disk space', usage: 'df [-h]' }, function (ctx) {
    table(ctx, [['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'], ['zroot/ROOT', '64T', '62T', '2.6T', '96%', '/'], ['tmpfs', '504G', '1.3M', '504G', '1%', '/tmp'],
      ['zroot/evidence', '64T', '61T', '2.6T', '96%', '/srv/evidence'], ['/dev/sdb', '360K', '6.0K', '354K', '2%', '/mnt/suspect_usb (ro)']]);
  });
  def('du', { cat: 'system', help: 'how big is this directory', usage: 'du [-sh] [dir]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'shac' }), p = o.rest[0] || '.', abs = LX.fs.norm(p), n = LX.fs.get(abs);
    if (!n) return ctx.out.err("du: cannot access '" + p + "': No such file or directory");
    var out = [];
    (function walk(nd, path) {
      if (nd.t !== 'd') return nd.t === 'l' ? 0 : LX.fs.size(nd);
      var tot = 4096;
      Object.keys(nd.c).sort().forEach(function (k) { tot += walk(nd.c[k], path + '/' + k); });
      if (!o.f.s || path === p) out.push([tot, path]);
      return tot;
    })(n, p.replace(/\/$/, ''));
    ctx.out.text(out.map(function (x) { return LX.pad(o.f.h ? LX.fmtSize(x[0]) : Math.ceil(x[0] / 1024), 7) + '\t' + x[1]; }).join('\n'));
  });
  def('lscpu', { cat: 'system', help: 'cpu details (192 threads of them)' }, function (ctx) {
    ctx.out.text(['Architecture:             x86_64', '  CPU op-mode(s):         32-bit, 64-bit', '  Address sizes:          52 bits physical, 57 bits virtual', 'CPU(s):                   192',
      '  On-line CPU(s) list:    0-191', 'Vendor ID:                AuthenticAMD', '  Model name:             ' + LX_CONFIG.machine.cpu.replace(/ \(\d+\).*/, '') + ' 96-Cores',
      '    Thread(s) per core:   2', '    Core(s) per socket:   96', '    Socket(s):            1', '    CPU max MHz:          5400.0000', '    BogoMIPS:             10800.00',
      'Virtualization:           AMD-V', 'Caches (sum of all):', '  L1d:                    4.5 MiB (96 instances)', '  L2:                     96 MiB (96 instances)', '  L3:                     384 MiB (12 instances)',
      'NUMA node(s):             1', 'Vulnerabilities:          none that a write-blocker cannot fix'].join('\n'));
  });
  def('lsblk', { cat: 'system', help: 'block devices', usage: 'lsblk' }, function (ctx) {
    ctx.out.text(['NAME        MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS', 'sdb           8:16   1   360K  1 disk /mnt/suspect_usb', 'nvme0n1     259:0    0    16T  0 disk', '└─nvme0n1p1 259:1    0    16T  0 part zroot',
      'nvme1n1     259:2    0    16T  0 disk', '└─nvme1n1p1 259:3    0    16T  0 part zroot', 'nvme2n1     259:4    0    16T  0 disk', '└─nvme2n1p1 259:5    0    16T  0 part zroot',
      'nvme3n1     259:6    0    16T  0 disk', '└─nvme3n1p1 259:7    0    16T  0 part zroot'].join('\n'));
    if (!ctx.piped) ctx.out.html(span('c-dim', 'sdb is the suspect stick, RO=1 thanks to the write-blocker. it is also at ') + LX.cmdLink('fls /dev/sdb', '/dev/sdb', 'c-cyan'));
  });
  def('lsusb', { cat: 'system', help: 'usb devices', usage: 'lsusb' }, function (ctx) {
    ctx.out.text(['Bus 004 Device 002: ID 1337:b10c forensic write-blocker bridge (read-only)', 'Bus 004 Device 003: ID 058f:6387 Generic Flash Disk [SUSPECT_USB]', 'Bus 003 Device 002: ID 046d:c548 wireless receiver (keyboard, mouse)',
      'Bus 001 Device 001: ID 1d6b:0002 Linux Foundation 2.0 root hub', 'Bus 002 Device 001: ID 1d6b:0003 Linux Foundation 3.0 root hub'].join('\n'));
  });
  def('nvidia-smi', { cat: 'system', help: 'gpu status (4 of them, all busy)', usage: 'nvidia-smi' }, function (ctx) {
    var L = ['+-----------------------------------------------------------------------------------------+', '| NVIDIA-SMI 580.95       Driver Version: 580.95         CUDA Version: 13.0               |',
      '|-----------------------------------------+------------------------+----------------------+', '| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |',
      '| Fan  Temp   Perf          Pwr:Usage/Cap |           Memory-Usage | GPU-Util  Compute M. |', '|=========================================+========================+======================|'];
    for (var g = 0; g < 4; g++) {
      L.push('|   ' + g + '  NVIDIA RTX PRO 6000 Blac...    On  |   0000:' + LX.hex(0x21 + g * 0x20) + ':00.0 Off |                  Off |');
      L.push('| 30%   ' + (61 + g * 2) + 'C    P2            598W /  600W |  93112MiB /  97887MiB |    100%      Default |');
      L.push('+-----------------------------------------+------------------------+----------------------+');
    }
    L.push('', '+-----------------------------------------------------------------------------------------+', '| Processes:                                                                              |',
      '|  GPU   PID   Type   Process name                                              GPU Memory |', '|=========================================================================================|');
    for (g = 0; g < 4; g++) L.push('|    ' + g + '  ' + (1337 + g) + '      C   hashcat -m 0 -a 3 -d ' + (g + 1) + ' evidence.hash ?a?a?a?a?a?a?a?a    92800MiB |');
    L.push('+-----------------------------------------------------------------------------------------+');
    ctx.out.pre(esc(L.join('\n')));
  });
  var PROCS = function () {
    return [
      [1, 'root', '0.0', '0.0', '/sbin/init'], [612, 'root', '0.0', '0.0', '/usr/lib/systemd/systemd-journald'], [790, 'root', '0.0', '0.0', '/usr/bin/zed -F'],
      [1337, LX_CONFIG.owner, '2400', '9.0', 'hashcat -m 0 -a 3 -d 1 evidence.hash ?a?a?a?a?a?a?a?a'], [1338, LX_CONFIG.owner, '2400', '9.0', 'hashcat -m 0 -a 3 -d 2 evidence.hash'],
      [1339, LX_CONFIG.owner, '2400', '9.0', 'hashcat -m 0 -a 3 -d 3 evidence.hash'], [1340, LX_CONFIG.owner, '2400', '9.0', 'hashcat -m 0 -a 3 -d 4 evidence.hash'],
      [2001, LX_CONFIG.owner, '3.1', '0.2', '/usr/bin/kwin_wayland --wayland-fd 7'], [2044, LX_CONFIG.owner, '1.4', '0.1', '/usr/bin/plasmashell --no-respawn'],
      [2210, LX_CONFIG.owner, '61.0', '41.3', '/usr/lib/firefox/firefox (214 tabs)'], [2600, LX_CONFIG.owner, '0.3', '0.0', '/usr/bin/konsole'],
      [3101, LX_CONFIG.owner, '0.0', '0.0', 'zsh'], [4242, 'root', '0.0', '0.0', '[kworker/u384:2-write_blocker]'],
      [6001, LX.USER, '0.0', '0.0', '-zsh'], [6066, LX.USER, '0.0', '0.0', 'ps aux']
    ];
  };
  def('ps', { cat: 'system', help: 'running processes', usage: 'ps [aux]' }, function (ctx) {
    var rows = [['USER', 'PID', '%CPU', '%MEM', 'COMMAND']].concat(PROCS().map(function (p) { return [p[1], p[0], p[2], p[3], p[4]]; }));
    var w = [8, 6, 6, 5];
    ctx.out.text(rows.map(function (r) { return LX.pad(r[0], w[0]) + LX.pad(r[1], w[1], true) + LX.pad(r[2], w[2], true) + LX.pad(r[3], w[3], true) + ' ' + r[4]; }).join('\n'));
  });
  def('kill', { cat: 'system', help: 'end a process (good luck)', usage: 'kill [-9] <pid>' }, function (ctx) {
    var pid = ctx.args.filter(function (a) { return a[0] !== '-'; })[0];
    if (!pid) return ctx.out.err('kill: usage: kill [-s sigspec | -n signum | -sigspec] pid');
    if (pid === '1') return ctx.out.err('kill: (1) - Operation not permitted. nobody kills init.');
    if (/^13(37|38|39|40)$/.test(pid)) return ctx.out.html(span('c-red', 'kill: (' + pid + ') - Operation not permitted') + span('c-dim', '  (that hashcat belongs to ' + LX_CONFIG.owner + '. it is 61% through the keyspace, leave it.)'));
    if (pid === '2210') return ctx.out.html(span('c-dim', 'firefox caught the signal and asked if you really want to close 214 tabs. you do not.'));
    if (pid === '6001') { ctx.out.text('you killed your own shell. respect. (it came back, this is a website)', 'c-dim'); return; }
    ctx.out.err('kill: (' + pid + ') - No such process');
  });

  // htop: 192 cpu meters, all busy
  function htop(ctx) {
    var iv, box;
    function frame() {
      var cells = '', load = 0;
      for (var c = 0; c < 192; c++) {
        var v = c % 48 < 4 ? 100 : 85 + Math.random() * 15; load += v;
        cells += span(v > 97 ? 'c-red' : v > 90 ? 'c-amber' : 'c-green', '▇') + (c % 48 === 47 ? '\n  ' : '');
      }
      var cpu = load / 192, up = Math.floor((Date.now() - LX.bootTime) / 1000) + 22149;
      var hh = String(Math.floor(up / 3600) % 24).padStart(2, '0'), mm = String(Math.floor(up / 60) % 60).padStart(2, '0'), ss = String(up % 60).padStart(2, '0');
      var meter = function (lbl, pct, txt) { var f = Math.round(pct / 100 * 40); return span('c-cyan', lbl) + '[' + span(pct > 90 ? 'c-red' : 'c-green', '|'.repeat(f)) + ' '.repeat(40 - f) + span('c-dim', LX.pad(txt, 12, true)) + ']'; };
      var procs = PROCS().slice(3, 12).map(function (p) {
        return LX.pad(p[0], 7, true) + ' ' + LX.pad(p[1], 9) + LX.pad(p[2], 6, true) + LX.pad(p[3], 6, true) + '  ' + esc(p[4]);
      }).join('\n');
      box.innerHTML = meter('  CPU', cpu, cpu.toFixed(1) + '%') + '   Tasks: ' + span('c-amber', '412') + ', 1337 thr; ' + span('c-green', '192') + ' running\n' +
        meter('  Mem', 99, '1013G/1.00T') + '   Load average: ' + span('c-amber', (191 + Math.random()).toFixed(2)) + ' 192.01 191.99\n' +
        meter('  Swp', 0, '0K/2.00T') + '   Uptime: 420 days, ' + hh + ':' + mm + ':' + ss + '\n\n  ' + span('c-dim', '192 threads') + '\n  ' + cells + '\n' +
        span('hl', '    PID USER       CPU%  MEM%  Command                                                ') + '\n' + procs;
    }
    return LX.ui.overlay({
      title: 'htop', help: 'q / esc quits · one of the three screens is just for this',
      build: function (body) { body.classList.add('top-mode'); box = document.createElement('pre'); box.className = 'htop'; body.appendChild(box); frame(); iv = setInterval(frame, 700); },
      onClose: function () { clearInterval(iv); LX.$('ov-body').classList.remove('top-mode'); }
    }, ctx.signal);
  }
  def('htop', { cat: 'system', help: 'live process viewer, 192 cpu meters', usage: 'htop' }, function (ctx) { if (ctx.piped) return ctx.out.err('htop: needs a terminal'); return htop(ctx); });
  LX.cmds.top = LX.cmds.htop; LX.cmds.btop = LX.cmds.htop;

  // who / w / last (last reads the logins this browser has seen, like wtmp)
  function fmtDay(d) { var D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return D[d.getDay()] + ' ' + LX.MON[d.getMonth()] + ' ' + String(d.getDate()).padStart(2) + ' ' + d.toTimeString().slice(0, 5); }
  def('who', { cat: 'system', help: 'who is logged in', usage: 'who' }, function (ctx) {
    var me = (LX.store.get('wtmp', []).slice(-1)[0] || {}).t || Date.now();
    ctx.out.text(LX.pad(LX_CONFIG.owner, 9) + 'tty7         2025-08-01 08:10 (:0)\n' + LX.pad(LX.USER, 9) + 'tty1         ' + new Date(me).toISOString().slice(0, 16).replace('T', ' '));
  });
  def('w', { cat: 'system', help: 'who is logged in and what they are doing', usage: 'w' }, function (ctx) {
    ctx.out.text(' ' + new Date().toTimeString().slice(0, 8) + ' up 420 days,  6:09,  2 users,  load average: 191.94, 192.01, 191.99\n' +
      'USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT\n' +
      LX.pad(LX_CONFIG.owner, 9) + 'tty7     :0               01Aug25 444days 99:59  99:59 hashcat -m 0 -a 3 evidence.hash\n' +
      LX.pad(LX.USER, 9) + 'tty1     -                ' + new Date().toTimeString().slice(0, 5) + '    0.00s  0.01s  0.00s w');
  });
  def('last', { cat: 'system', help: 'login history (wtmp). yours is in there too', usage: 'last' }, function (ctx) {
    var w = LX.store.get('wtmp', []).slice().reverse(), out = [];
    w.forEach(function (e, i) {
      var s = new Date(e.t), end = e.end ? new Date(e.end) : null, dur = end ? Math.round((e.end - e.t) / 60000) : 0;
      out.push(LX.pad(e.u, 9) + 'tty1         ' + fmtDay(s) + (i === 0 && !e.end ? '   still logged in' : end ? ' - ' + end.toTimeString().slice(0, 5) + '  (' + String(Math.floor(dur / 60)).padStart(2, '0') + ':' + String(dur % 60).padStart(2, '0') + ')' : '   gone - no logout'));
    });
    out.push(LX.pad(LX_CONFIG.owner, 9) + 'tty7  :0     Fri Aug  1 08:10   still logged in   (444 days, it is fine)');
    out.push('reboot   system boot  ' + LX_CONFIG.machine.kernel + ' Fri Aug  1 08:09   still running');
    out.push('', 'wtmp begins Fri Aug  1 08:09:01 2025');
    ctx.out.text(out.join('\n'));
  });
  def('dmesg', { cat: 'system', help: 'kernel ring buffer', usage: 'dmesg' }, function (ctx) {
    var L = ['[    0.000000] Linux version ' + LX_CONFIG.machine.kernel + ' (linux@archlinux) (gcc (GCC) 15.2.1) #1 SMP PREEMPT_DYNAMIC',
      '[    0.000000] Command line: BOOT_IMAGE=/vmlinuz-linux root=zroot/ROOT rw quiet mitigations=auto',
      '[    0.081337] smpboot: Allowing 192 CPUs, 0 hotplug CPUs', '[    0.412000] Memory: 1056964608K/1073741824K available',
      '[    1.200140] nvme nvme0: 192/0/0 default/read/poll queues', '[    2.913370] nvidia: loading out-of-tree module taints kernel. (4 times)',
      '[   12.004211] usb 4-1: new SuperSpeed USB device number 2 using xhci_hcd', '[   12.004902] usb 4-1: Product: forensic write-blocker bridge',
      '[   12.084211] usb 4-1.1: new high-speed USB device number 3', '[   12.091337] sd 6:0:0:0: [sdb] 720 512-byte logical blocks: (369 kB/360 KiB)',
      '[   12.091400] sd 6:0:0:0: [sdb] Write Protect is on', '[   12.093000] sdb: sdb1 (FAT12, label SUSPECT_USB)',
      '[   12.093113] write_blocker: /dev/sdb is read-only. evidence integrity first.',
      '[38361600.000000] hashcat[1337]: still going. do not reboot.'];
    ctx.out.text(L.join('\n'));
  });
  def('journalctl', { cat: 'system', help: 'system log (auth + more)', usage: 'journalctl' }, function (ctx) {
    ctx.out.text(LX.authlog.join('\n'));
    if (ctx.args.indexOf('-f') >= 0 && !ctx.piped) ctx.out.text('(-f would follow forever. the log is quiet, nobody else is on this box. except ' + LX_CONFIG.owner + '.)', 'c-dim');
  });
  def('ip', { cat: 'system', help: 'network interfaces (spoiler: none)', usage: 'ip a' }, function (ctx) {
    ctx.out.text(['1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN', '    inet 127.0.0.1/8 scope host lo', '2: enp5s0: <NO-CARRIER,BROADCAST,MULTICAST> mtu 1500 state DOWN',
      '    link/ether 00:00:00:00:00:00 (cable unplugged on purpose)', '3: wlan0: <BROADCAST,MULTICAST> state DOWN (rfkill: hard blocked)'].join('\n'));
    if (!ctx.piped) ctx.out.text('forensic workstations are air-gapped. evidence goes in, nothing comes out.', 'c-dim');
  });
  LX.cmds.ifconfig = LX.cmds.ip;
  def('ping', { cat: 'system', help: 'ping. only localhost answers', usage: 'ping <host>' }, async function (ctx) {
    var h = ctx.args.filter(function (a) { return a[0] !== '-'; })[0] || '';
    if (!h) return ctx.out.err('ping: usage error: Destination address required');
    if (!/^(localhost|127(\.\d+){3}|::1|lynnux(\.ch)?)$/.test(h)) { ctx.out.err('ping: connect: Network is unreachable'); ctx.out.text('(air-gapped. that is the point of a forensic workstation.)', 'c-dim'); return 2; }
    ctx.out.text('PING ' + h + ' (127.0.0.1) 56(84) bytes of data.');
    for (var i = 1; i <= 4; i++) { await ctx.sleep(380); ctx.out.text('64 bytes from 127.0.0.1: icmp_seq=' + i + ' ttl=64 time=0.0' + (31 + i * 7 % 40) + ' ms'); }
    ctx.out.text('\n--- ' + h + ' ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss, time 3004ms');
  });
  ['curl', 'wget', 'ssh', 'scp', 'nc', 'ncat', 'telnet', 'dig', 'nslookup', 'host', 'traceroute', 'nmap', 'whois', 'ftp', 'rsync'].forEach(function (n) {
    def(n, { cat: 'system', hidden: true }, function (ctx) {
      ctx.out.err(n + ': network is unreachable');
      ctx.out.text('(this is a forensic workstation. it is air-gapped. evidence goes in, nothing goes out.)', 'c-dim');
      return 2;
    });
  });
  def('tty', { cat: 'system', help: 'which terminal am i on' }, function (ctx) { ctx.out.text('/dev/tty1'); });
  def('groups', { cat: 'system', help: 'your groups' }, function (ctx) { ctx.out.text(LX.USER + ' evidence-ro'); });
  def('locale', { cat: 'system', help: 'language settings' }, function (ctx) {
    ctx.out.text('LANG=en_US.UTF-8\nLC_TIME=de_CH.UTF-8\nLC_NUMERIC=de_CH.UTF-8\nLC_MONETARY=de_CH.UTF-8\nLC_PAPER=de_CH.UTF-8\nLC_ALL=');
  });
  def('cal', { cat: 'system', help: 'a calendar', usage: 'cal' }, function (ctx) {
    var d = new Date(), y = d.getFullYear(), m = d.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var title = names[m] + ' ' + y, rows = [' '.repeat(Math.floor((20 - title.length) / 2)) + title, 'Mo Tu We Th Fr Sa Su'], line = '   '.repeat(first);
    for (var i = 1; i <= days; i++) {
      var cell = String(i).padStart(2);
      line += (ctx.piped || i !== d.getDate() ? esc(cell) : '<span class="hl">' + cell + '</span>') + ' ';
      if ((first + i) % 7 === 0) { rows.push(line.replace(/ $/, '')); line = ''; }
    }
    if (line) rows.push(line.replace(/ $/, ''));
    if (ctx.piped) ctx.out.text(rows.join('\n')); else ctx.out.pre(rows.map(function (r, k) { return k < 2 ? span(k ? 'c-dim' : 'c-amber', r) : r; }).join('\n'));
  });
  def('true', { cat: 'system', help: 'do nothing, successfully' }, function () { return 0; });
  def('false', { cat: 'system', help: 'do nothing, unsuccessfully' }, function () { return 1; });
  def('sleep', { cat: 'system', help: 'wait N seconds (max 10, ctrl+c works)', usage: 'sleep N' }, async function (ctx) {
    var n = parseFloat(ctx.args[0]);
    if (isNaN(n)) return ctx.out.err('sleep: missing operand');
    await ctx.sleep(Math.min(10, Math.max(0, n)) * 1000);
  });
  def('yes', { cat: 'system', help: 'say yes. a lot.', usage: 'yes [text]' }, async function (ctx) {
    var t = ctx.args.join(' ') || 'y';
    if (ctx.piped) { ctx.out.text(Array(1000).fill(t).join('\n')); return; }
    for (var i = 0; i < 40; i++) { ctx.out.text(t); if (i % 8 === 7) await ctx.sleep(30); }
    ctx.out.text("(yes would go on forever. stopped it for you. you're welcome.)", 'c-dim');
  });
  def('reset', { cat: 'system', hidden: true }, function () { LX.ui.out.textContent = ''; });

  // ============================================================ easter eggs
  def('xyzzy', { cat: 'fun', hidden: true }, function (ctx) { ctx.out.text('Nothing happens.'); });
  def('42', { cat: 'fun', hidden: true }, function (ctx) { ctx.out.text('yes. but what was the question?', 'c-amber'); });
  ['hello', 'hi', 'hey', 'hallo', 'grüezi', 'hoi', 'sali'].forEach(function (n) {
    def(n, { cat: 'fun', hidden: true }, function (ctx) { ctx.out.html('hi ' + span('c-amber', LX.USER) + ' :)' + span('c-dim', '  (try ') + LX.cmdLink('cases', 'cases', 'c-cyan') + span('c-dim', ' if you are bored)')); });
  });
  def(LX_CONFIG.owner, { cat: 'fun', hidden: true }, function (ctx) {
    ctx.out.html(span('c-amber', LX_CONFIG.owner) + ' owns this machine, but is not home right now. probably at a ctf.');
    ctx.out.html(span('c-dim', 'the hashcat jobs are theirs. please do not kill them. (', true) + LX.cmdLink('ps aux', 'ps aux', 'c-cyan') + span('c-dim', ')'));
  });
  [':q', ':wq', ':x', ':q!', 'ZZ'].forEach(function (n) {
    def(n, { cat: 'fun', hidden: true }, function (ctx) { ctx.out.text('you are not in vim. but respect for the reflex.', 'c-dim'); });
  });
  def('make', { cat: 'fun', hidden: true }, function (ctx) {
    var t = ctx.args.join(' ');
    if (t === 'me a sandwich') return ctx.out.text('What? Make it yourself.');
    if (t === 'love') return ctx.out.text("make: *** No rule to make target 'love'.  Stop.");
    ctx.out.err(t ? "make: *** No rule to make target '" + ctx.args[0] + "'.  Stop." : 'make: *** No targets specified and no makefile found.  Stop.');
    return 2;
  });
  function uwu(s) {
    var faces = [' uwu', ' owo', ' >w<', ' ^w^', ' :3'], k = 0;
    return s.replace(/[rl]/g, 'w').replace(/[RL]/g, 'W').replace(/n([aeiou])/g, 'ny$1').replace(/([.!?])(\s|$)/g, function (m, p, sp) { return p + faces[k++ % faces.length] + sp; });
  }
  def('uwu', { cat: 'fun', hidden: true, usage: 'uwu <text>' }, async function (ctx) {
    var s = ctx.args.length ? ctx.args.join(' ') : ctx.stdin;
    if (s === null) return ctx.out.text(uwu('please give me some text. the evidence is waiting.'));
    ctx.out.text(uwu(s.replace(/\n$/, '')));
  });
  LX.cmds.owo = LX.cmds.uwu;
  def('fsck', { cat: 'fun', hidden: true }, function (ctx) {
    ctx.out.text('fsck from util-linux 2.41\nfsck.fat 4.2: /dev/sdb is clean. 6 files, 5/699 clusters\n(the evidence is fine. you, however, should drink some water. or mate.)');
  });
  ['shred', 'wipe', 'srm'].forEach(function (n) {
    def(n, { cat: 'fun', hidden: true }, function (ctx) {
      ctx.out.err(n + ': write-blocker engaged, nothing gets shredded here.');
      ctx.out.text('(also: on SSDs, wear leveling makes shred mostly theatre. full disk encryption + throwing away the key is the real wipe.)', 'c-dim');
      return 1;
    });
  });
  def('info', { cat: 'fun', hidden: true }, function (ctx) { ctx.out.html(span('c-dim', 'info: this is not GNU emacs. try ') + LX.cmdLink('man ' + (ctx.args[0] || 'man'), 'man ' + (ctx.args[0] || 'man'), 'c-cyan')); });
  def('pride', { cat: 'fun', help: 'every flag hyfetch knows' }, function (ctx) {
    var P = LX.PRIDE || {};
    Object.keys(P).forEach(function (name) {
      var row = document.createElement('div');
      P[name].forEach(function (c) { var s = document.createElement('span'); s.textContent = '████'; s.style.color = LX.liftColor ? LX.liftColor(c) : c; row.appendChild(s); });
      var l = document.createElement('span'); l.className = 'c-dim'; l.textContent = '  ' + name; row.appendChild(l);
      if (ctx.piped) ctx.out.text(name); else ctx.out.el(row);
    });
    if (!ctx.piped) ctx.out.html(span('c-dim', 'try one: ') + LX.cmdLink('hyfetch -p trans', 'hyfetch -p <flag>', 'c-cyan'));
  });

  // the konami code paints the caution tape in the lesbian flag
  (function () {
    var seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'], pos = 0;
    document.addEventListener('keydown', function (e) {
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = k === seq[pos] ? pos + 1 : k === seq[0] ? 1 : 0;
      if (pos === seq.length) {
        pos = 0;
        var on = LX.$('tape').classList.toggle('pride');
        LX.ui.toast(on ? '↑↑↓↓←→←→BA · pride mode on' : 'pride mode off (but never really off)');
      }
    }, true);
  })();

  // echo c > /proc/sysrq-trigger: a kernel panic. for three seconds.
  LX.sysrq = function (data) {
    if ((data || '').trim() !== 'c') return false;
    var up = ((Date.now() - LX.bootTime) / 1000 + 4242).toFixed(6), L = [
      'sysrq: Trigger a crash', 'Kernel panic - not syncing: sysrq triggered crash',
      'CPU: 137 UID: 1001 PID: 6001 Comm: zsh Tainted: P           O       ' + LX_CONFIG.machine.kernel + ' #1',
      'Hardware name: ' + (LX_CONFIG.machine.host || 'lynnux'), 'Call Trace:', ' <TASK>', ' dump_stack_lvl+0x5d/0x80', ' panic+0x118/0x2f0', ' sysrq_handle_crash+0x1a/0x20',
      ' __handle_sysrq.cold+0x4c/0x118', ' write_sysrq_trigger+0x5f/0x80', ' proc_reg_write+0x5a/0xa0', ' vfs_write+0xf5/0x430', ' ksys_write+0x6f/0xf0',
      ' do_syscall_64+0x82/0x190', ' entry_SYSCALL_64_after_hwframe+0x76/0x7e', ' </TASK>', 'Kernel Offset: 0x1337000 from 0xffffffff81000000',
      '---[ end Kernel panic - not syncing: sysrq triggered crash ]---'];
    var d = document.createElement('div');
    d.className = 'panic';
    d.textContent = L.map(function (l) { return '[' + LX.pad(up, 12, true) + '] ' + l; }).join('\n');
    document.body.appendChild(d);
    LX.keys.push(function () { return true; });
    setTimeout(function () {
      d.remove(); LX.keys.pop();
      LX.term.html(span('c-amber', 'just kidding.') + span('c-dim', ' /proc is read-only here. but knowing the sysrq trick? respect.'));
      LX.ui.scroll();
    }, 3200);
    return true;
  };
})();
