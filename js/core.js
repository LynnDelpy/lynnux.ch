// core.js :: the terminal engine
// virtual fs, tokenizer (quotes, pipes, ; && ||, > >>, globs, $VARS),
// async commands, history, tab completion, overlays.
'use strict';

var LX = {
  cmds: Object.create(null),
  aliases: { ll: 'ls -la', la: 'ls -a', l: 'ls', '..': 'cd ..', cls: 'clear', please: 'sudo' },
  hist: [],
  histTimes: [],
  status: 0,
  keys: [],
  HOME: '/home/guest',
  USER: 'guest',
  HOST: LX_CONFIG.host
};

// ---------------------------------------------------------------- helpers
LX.esc = function (s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
LX.span = function (cls, text) { return '<span class="' + cls + '">' + LX.esc(text) + '</span>'; };
LX.cmdLink = function (cmd, label, cls) {
  return '<span tabindex="0" role="button" class="' + (cls || 'c-cyan') + '" data-cmd="' + LX.esc(cmd) + '">' + LX.esc(label) + '</span>';
};
LX.quote = function (s) { return /^[\w.\-\/~+@:%,=]+$/.test(s) ? s : "'" + s.replace(/'/g, "'\\''") + "'"; };
LX.fmtSize = function (n) {
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(1) + 'K';
  return (n / 1048576).toFixed(1) + 'M';
};
LX.MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
LX.logTime = function (d) {
  d = d || new Date();
  return LX.MON[d.getMonth()] + ' ' + String(d.getDate()).padStart(2) + ' ' + d.toTimeString().slice(0, 8);
};
// what a login name has to look like (lowercase unix username)
LX.NAME_RE = /^[a-z_][a-z0-9_-]{0,23}$/;
LX.pad = function (s, n, right) { s = String(s); return right ? s.padStart(n) : s.padEnd(n); };
LX.hex = function (n, w) { return n.toString(16).padStart(w || 2, '0'); };
LX.$ = function (id) { return document.getElementById(id); };
LX._parser = new DOMParser();
LX.strip = function (html) { return LX._parser.parseFromString('<body>' + html, 'text/html').body.textContent; };
LX.store = {
  get: function (k, d) { try { var v = localStorage.getItem('lynnux.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('lynnux.' + k, JSON.stringify(v)); } catch (e) { /* private mode, fine */ } }
};

// tiny getopt. spec = { flags: 'la', vals: 'nsl' } -> { f: {l:true}, v: {n:'8'}, rest: [] }
LX.opts = function (args, spec) {
  var f = {}, v = {}, rest = [], i = 0, flags = spec.flags || '', vals = spec.vals || '';
  for (; i < args.length; i++) {
    var a = args[i];
    if (a === '--') { rest = rest.concat(args.slice(i + 1)); break; }
    if (a.length > 1 && a[0] === '-' && !/^-\d/.test(a) || (a.length > 1 && a[0] === '-' && vals.indexOf(a[1]) >= 0)) {
      for (var j = 1; j < a.length; j++) {
        var ch = a[j];
        if (vals.indexOf(ch) >= 0) {
          if (j < a.length - 1) v[ch] = a.slice(j + 1); else v[ch] = args[++i];
          break;
        } else if (flags.indexOf(ch) >= 0) f[ch] = true;
        else throw new Error("invalid option -- '" + ch + "'");
      }
    } else rest.push(a);
  }
  return { f: f, v: v, rest: rest };
};
LX.num = function (s, def) {
  if (s === undefined || s === null || s === '') return def;
  var n = /^0x/i.test(s) ? parseInt(s, 16) : parseInt(s, 10);
  if (isNaN(n)) throw new Error("invalid number '" + s + "'");
  return n;
};

// ---------------------------------------------------------------- virtual fs
function mkDir(children, meta) {
  var c = Object.create(null);
  for (var k in children) c[k] = children[k];
  var d = { t: 'd', c: c };
  for (var m in meta) d[m] = meta[m];
  return d;
}
LX.D = mkDir;
LX.F = function (text, meta) { var n = { t: 'f', text: text }; for (var m in meta) n[m] = meta[m]; return n; };

LX.fs = {
  root: mkDir({}),
  cwd: LX.HOME,

  norm: function (p) {
    if (p === undefined || p === null || p === '') return this.cwd;
    if (p === '~' || p.indexOf('~/') === 0) p = LX.HOME + p.slice(1);
    else if (p[0] !== '/') p = this.cwd + '/' + p;
    var out = [];
    p.split('/').forEach(function (s) {
      if (!s || s === '.') return;
      if (s === '..') out.pop(); else out.push(s);
    });
    return '/' + out.join('/');
  },
  get: function (abs) {
    var n = this.root;
    if (abs === '/') return n;
    var parts = abs.slice(1).split('/');
    for (var i = 0; i < parts.length; i++) {
      if (!n || n.t !== 'd' || !(parts[i] in n.c)) return null;
      n = n.c[parts[i]];
    }
    return n;
  },
  display: function (abs) {
    if (abs === LX.HOME) return '~';
    if (abs.indexOf(LX.HOME + '/') === 0) return '~' + abs.slice(LX.HOME.length);
    return abs;
  },
  // the write-blocker: evidence and system dirs are read-only
  writable: function (abs) {
    var ro = ['/etc', '/proc', '/bin', '/usr', '/var', '/dev', LX.HOME + '/cases'];
    return !ro.some(function (p) { return abs === p || abs.indexOf(p + '/') === 0; }) && abs !== '/' && abs !== '/home';
  },
  // put a node somewhere. returns abs path or throws
  put: function (path, node) {
    var abs = this.norm(path), i = abs.lastIndexOf('/');
    var dirAbs = abs.slice(0, i) || '/', name = abs.slice(i + 1);
    var dir = this.get(dirAbs);
    if (!dir || dir.t !== 'd') throw new Error(this.display(dirAbs) + ': No such directory');
    if (!this.writable(dirAbs)) throw new Error('write-blocker: ' + this.display(dirAbs) + ' is read-only (evidence integrity first!)');
    if (!name) throw new Error('bad file name');
    node.mtime = node.mtime || new Date();
    dir.c[name] = node;
    return abs;
  },
  // where tools drop their output: cwd, unless the write-blocker says no -> ~/work
  outDir: function () { return this.writable(this.cwd) ? this.cwd : LX.HOME + '/work'; },
  bytes: function (n) {
    if (n.data) return Promise.resolve(n.data);
    if (n.t === 'f') return Promise.resolve(new TextEncoder().encode(n.text));
    if (n.src) {
      return fetch(n.src).then(function (r) {
        if (!r.ok) throw new Error('could not load evidence (' + r.status + ')');
        return r.arrayBuffer();
      }).then(function (b) { n.data = new Uint8Array(b); return n.data; });
    }
    return Promise.reject(new Error('not a regular file'));
  },
  text: function (n) {
    if (n.t === 'f') return Promise.resolve(n.text);
    if (n.t === 'l') return Promise.resolve(n.url + '\n');
    return this.bytes(n).then(function (b) { return new TextDecoder().decode(b); });
  },
  size: function (n) {
    if (n.t === 'f') return new TextEncoder().encode(n.text).length;
    if (n.data) return n.data.length;
    return n.size || 0;
  },
  isBinary: function (n) { return n.t === 'b'; }
};

// resolve a path argument for a command, printing the usual errors
LX.open = function (ctx, path, cmd) {
  if (path === undefined) { ctx.out.err(cmd + ': missing file operand'); return null; }
  var abs = LX.fs.norm(path), n = LX.fs.get(abs);
  if (!n) {
    ctx.out.err(cmd + ": cannot open '" + path + "': No such file or directory");
    if (/^(\.?\/)?flag(\.txt)?$/i.test(path)) ctx.out.text('(flags here are earned, not catted. try `cases`)', 'c-dim');
    return null;
  }
  if (n.t === 'd') { ctx.out.err(cmd + ': ' + path + ': Is a directory'); return null; }
  if (n.denied) { ctx.out.err(cmd + ': ' + path + ': Permission denied'); return null; }
  return { abs: abs, node: n, name: abs.slice(abs.lastIndexOf('/') + 1) };
};

// save tool output (carved files etc). respects the write-blocker
LX.save = function (ctx, name, data, quiet) {
  var dir = LX.fs.outDir();
  if (dir !== LX.fs.cwd && !LX.fs.get(dir)) LX.fs.put(dir, mkDir({}));
  var abs = LX.fs.put(dir + '/' + name, { t: 'b', data: data });
  if (dir !== LX.fs.cwd && !quiet && !ctx._wbNoted) {
    ctx._wbNoted = true;
    ctx.out.html(LX.span('c-dim', 'write-blocker: ' + LX.fs.display(LX.fs.cwd) + ' is read-only, writing to ') + LX.cmdLink('cd ~/work && ls -l', '~/work', 'c-amber'));
  }
  return abs;
};

// text input for filters: file arg, else stdin
LX.readInput = function (ctx, path, cmd) {
  if (path !== undefined) {
    var f = LX.open(ctx, path, cmd);
    return f ? LX.fs.text(f.node) : Promise.resolve(null);
  }
  if (ctx.stdin !== null) return Promise.resolve(ctx.stdin);
  ctx.out.err(cmd + ': missing file operand (or pipe something in)');
  return Promise.resolve(null);
};

// ---------------------------------------------------------------- output sinks
function TermOut() { this.failed = false; }
TermOut.prototype.line = function (html, cls) {
  var d = document.createElement('div');
  if (cls) d.className = cls;
  d.innerHTML = html;
  LX.ui.out.appendChild(d);
  LX.ui.trim();
  LX.ui.scroll();
  return d;
};
TermOut.prototype.text = function (s, cls) { return this.line(LX.esc(s), cls); };
TermOut.prototype.html = function (h, cls) { return this.line(h, cls); };
TermOut.prototype.pre = function (h, cls) { return this.line(h, 'pre' + (cls ? ' ' + cls : '')); };
TermOut.prototype.el = function (node) { var d = document.createElement('div'); d.appendChild(node); LX.ui.out.appendChild(d); LX.ui.scroll(); return d; };
TermOut.prototype.err = function (s) { this.failed = true; return this.line(LX.esc(s), 'c-red'); };
TermOut.prototype.capturing = false;
// binary output straight to a terminal: show it if it is text, otherwise tell people to redirect
TermOut.prototype.bytes = function (u8, hint) {
  var txt = LX.bytesToText(u8), ctrl = 0;
  for (var i = 0; i < Math.min(u8.length, 4096); i++) if (u8[i] < 9 || (u8[i] > 13 && u8[i] < 32)) ctrl++;
  if (!ctrl) return this.text(txt.replace(/\n$/, ''));
  this.line(LX.span('c-dim', '[' + u8.length + ' bytes of binary: ' + LX.magic(u8).split(',')[0] + '] redirect it to a file, e.g. ') + LX.span('c-amber', (hint || 'cmd') + ' > out.bin'));
};

// captures output for pipes and redirects. text and binary can mix: as soon as any binary
// arrives everything is kept as raw bytes, so `cat a.png notes.txt > b.png` stays intact
function CapOut(quietErr) { this.buf = []; this.chunks = []; this.binary = false; this.failed = false; this.quietErr = quietErr; }
CapOut.prototype.text = function (s) { s = String(s); this.buf.push(s); this.chunks.push(new TextEncoder().encode(s + '\n')); };
CapOut.prototype.html = function (h) { this.text(LX.strip(h)); };
CapOut.prototype.pre = CapOut.prototype.html;
CapOut.prototype.line = CapOut.prototype.html;
CapOut.prototype.el = function () { };
CapOut.prototype.bytes = function (u8) { this.binary = true; this.chunks.push(u8); };
CapOut.prototype.err = function (s) { this.failed = true; if (!this.quietErr) LX.term.err(s); };
CapOut.prototype.capturing = true;
CapOut.prototype.all = function () {
  var n = 0, i;
  for (i = 0; i < this.chunks.length; i++) n += this.chunks[i].length;
  var out = new Uint8Array(n), o = 0;
  for (i = 0; i < this.chunks.length; i++) { out.set(this.chunks[i], o); o += this.chunks[i].length; }
  return out;
};
Object.defineProperty(CapOut.prototype, 'binData', { get: function () { return this.binary ? this.all() : null; } });
CapOut.prototype.value = function () {
  if (this.binary) return new TextDecoder('latin1').decode(this.all());
  return this.buf.length ? this.buf.join('\n') + '\n' : '';
};

function QuietErr(inner) { this.inner = inner; this.failed = false; }
['text', 'html', 'pre', 'line', 'el', 'bytes'].forEach(function (k) { QuietErr.prototype[k] = function (a, b) { return this.inner[k](a, b); }; });
QuietErr.prototype.err = function () { this.failed = true; };

// ---------------------------------------------------------------- tokenizer
// returns a chain: [{ op: null|';'|'&&'|'||', pipe: [argv, ...], redir: {file, append}|null, quietErr }]
LX.parse = function (line) {
  var chain = [], pipe = [], argv = [], cur = null, glob = false;
  var redir = null, want = null, quietErr = false, op = null, i = 0;
  // variables are expanded later, right before their pipeline runs (so `cmd; echo $?` works)
  function vars(name) { return '\u0001' + name + '\u0002'; }
  function push() {
    if (cur === null) return;
    if (want === '2>') { quietErr = true; want = null; }
    else if (want) { redir = { file: cur, append: want === '>>' }; want = null; }
    else argv.push(glob ? { glob: cur } : cur);
    cur = null; glob = false;
  }
  function endSeg() { push(); if (argv.length) pipe.push(argv); argv = []; }
  function endPipe(next) {
    endSeg();
    if (want) throw new Error("parse error near `\\n'");
    if (pipe.length) chain.push({ op: op, pipe: pipe, redir: redir, quietErr: quietErr });
    else if (next) throw new Error('parse error near `' + next + "'");
    pipe = []; redir = null; quietErr = false; op = next;
  }
  while (i < line.length) {
    var ch = line[i], nx = line[i + 1];
    if (ch === "'") {
      var j = line.indexOf("'", i + 1);
      if (j < 0) throw new Error("unmatched '");
      cur = (cur || '') + line.slice(i + 1, j); i = j + 1; continue;
    }
    if (ch === '"') {
      var s = ''; i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && '"\\$'.indexOf(line[i + 1]) >= 0) { s += line[i + 1]; i += 2; }
        else if (line[i] === '$') { var m = /^\$(\w+|\?)/.exec(line.slice(i)); if (m) { s += vars(m[1]); i += m[0].length; } else s += line[i++]; }
        else s += line[i++];
      }
      if (i >= line.length) throw new Error('unmatched "');
      i++; cur = (cur || '') + s; continue;
    }
    if (ch === '\\' && i + 1 < line.length) { cur = (cur || '') + nx; i += 2; continue; }
    if (/\s/.test(ch)) { push(); i++; continue; }
    if (ch === '|' && nx === '|') { endPipe('||'); i += 2; continue; }
    if (ch === '|') { endSeg(); if (!pipe.length) throw new Error("parse error near `|'"); i++; continue; }
    if (ch === '&' && nx === '&') { endPipe('&&'); i += 2; continue; }
    if (ch === ';') { endPipe(';'); i++; continue; }
    if (ch === '2' && nx === '>' && cur === null) {
      i += 2;
      if (line[i] === '&' && line[i + 1] === '1') { i += 2; continue; }
      want = '2>'; continue;
    }
    if (ch === '>') { push(); if (nx === '>') { want = '>>'; i += 2; } else { want = '>'; i++; } continue; }
    if (ch === '$') { var mm = /^\$(\w+|\?)/.exec(line.slice(i)); if (mm) { cur = (cur || '') + vars(mm[1]); i += mm[0].length; continue; } }
    if (ch === '*' || ch === '?') glob = true;
    cur = (cur || '') + ch; i++;
  }
  endPipe(null);
  return chain;
};

// zsh-syntax-highlighting, more or less: commands green when they exist and red when they
// don't, strings amber, operators violet, existing paths underlined. never changes the text,
// so the coloured mirror lines up with the real input exactly
LX.highlight = function (v) {
  var out = '', i = 0, cmdPos = true, sp = LX.span, esc = LX.esc;
  while (i < v.length) {
    var ch = v[i], rest = v.slice(i);
    if (/\s/.test(ch)) { out += esc(ch); i++; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(v[i - 1]))) { out += sp('c-dim', rest); break; }
    var op = /^(\|\||&&|\||;|>>|>|2>&1|2>)/.exec(rest);
    if (op && (op[0][0] !== '2' || i === 0 || /\s/.test(v[i - 1]))) {
      out += sp('c-violet', op[0]); i += op[0].length;
      if (/^(\|\||&&|\||;)$/.test(op[0])) cmdPos = true;
      continue;
    }
    var j = i, plain = '', html = '', seg = '', quoted = false;
    while (j < v.length && !/[\s|;&>]/.test(v[j])) {
      if (v[j] === '"' || v[j] === "'") {
        var k = v.indexOf(v[j], j + 1);
        if (k < 0) k = v.length - 1;
        html += esc(seg) + sp('c-amber', v.slice(j, k + 1)); seg = '';
        plain += v.slice(j + 1, k); j = k + 1; quoted = true; continue;
      }
      if (v[j] === '\\' && j + 1 < v.length) { seg += v.slice(j, j + 2); plain += v[j + 1]; j += 2; continue; }
      seg += v[j]; plain += v[j]; j++;
    }
    if (j === i) { out += esc(ch); i++; continue; } // a lone & or similar
    var word = v.slice(i, j);
    if (cmdPos) { out += sp(LX.cmds[plain] || LX.aliases[plain] ? 'c-green' : 'c-red', word); cmdPos = false; }
    else if (!quoted && plain[0] !== '-' && plain.indexOf('$') < 0 && LX.fs.get(LX.fs.norm(plain))) out += sp('ul', word);
    else out += html + esc(seg);
    i = j;
  }
  return out;
};

// zsh-autosuggestions, history strategy: newest matching command wins
LX.suggest = function (v) {
  var pools = [LX.hist, LX.oldHistory || []];
  for (var p = 0; p < pools.length; p++) {
    for (var i = pools[p].length - 1; i >= 0; i--) {
      var h = pools[p][i];
      if (h.length > v.length && h.indexOf(v) === 0 && h[0] !== '#') return h;
    }
  }
  return '';
};

LX.expandVars = function (s) {
  return s.replace(/\u0001(\w+|\?)\u0002/g, function (m, name) {
    var env = { HOME: LX.HOME, USER: LX.USER, PWD: LX.fs.cwd, HOSTNAME: LX.HOST, SHELL: '/usr/bin/zsh', '0': 'zsh', ZSH_VERSION: '5.9', '?': String(LX.status), RANDOM: String(Math.floor(Math.random() * 32768)) };
    return name in env ? env[name] : '';
  });
};

// expand {glob:'*.png'} args against the virtual fs
// walks the pattern one path segment at a time, so ~/cases/*/*.png works.
// no match keeps the pattern as is, like bash does
LX.expandGlobs = function (argv) {
  var out = [];
  argv.forEach(function (a) {
    if (typeof a === 'string') { out.push(a); return; }
    var pat = a.glob, segs = pat.split('/'), level;
    // each entry: [what we print, absolute path]
    if (pat[0] === '/') { level = [['', '/']]; segs.shift(); }
    else if (segs[0] === '~') { level = [['~', LX.HOME]]; segs.shift(); }
    else level = [[null, LX.fs.cwd]];
    segs.forEach(function (seg) {
      var next = [];
      level.forEach(function (e) {
        var join = function (k) { return e[0] === null ? k : e[0] === '' ? '/' + k : e[0] + '/' + k; };
        if (!seg) { next.push([e[0] === null ? '' : e[0] + '/', e[1]]); return; }
        if (!/[*?]/.test(seg)) {
          var ab = LX.fs.norm(e[1] + '/' + seg);
          if (LX.fs.get(ab)) next.push([join(seg), ab]);
          return;
        }
        var dir = LX.fs.get(e[1]);
        if (!dir || dir.t !== 'd') return;
        var re = new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        Object.keys(dir.c).sort().forEach(function (k) {
          if (re.test(k) && (k[0] !== '.' || seg[0] === '.')) next.push([join(k), e[1] === '/' ? '/' + k : e[1] + '/' + k]);
        });
      });
      level = next;
    });
    if (level.length) level.forEach(function (e) { out.push(e[0]); }); else out.push(pat);
  });
  return out;
};

// ---------------------------------------------------------------- command registry
LX.def = function (name, meta, fn) {
  LX.cmds[name] = { name: name, fn: fn, help: meta.help || '', usage: meta.usage || name, cat: meta.cat || 'misc', hidden: !!meta.hidden };
};

// ---------------------------------------------------------------- executor
LX.running = null;

LX.run = async function (line, opts) {
  opts = opts || {};
  if (LX.loginOpen) return; // nobody is logged in yet
  line = line.replace(/\s+$/, '');
  if (!opts.silent) LX.term.echo(line);
  if (!line.trim()) return;
  // setopt HIST_IGNORE_SPACE: a leading space keeps a command out of the history
  if (!opts.noHist && line[0] !== ' ') { LX.hist.push(line); LX.histTimes.push(Date.now()); }
  LX.histIdx = LX.hist.length;
  if (line.trim()[0] === '#') return;
  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(line)) { // the classic fork bomb
    LX.term.html(LX.span('c-red', 'zsh: fork bomb defused.') + LX.span('c-dim', ' 192 threads is a lot, but not infinite. (ulimit -u said no, nicely)'));
    LX.status = 1; LX.ui.updatePrompt(); return;
  }
  var chain;
  try { chain = LX.parse(line); } catch (e) { LX.term.err('zsh: ' + e.message); LX.status = 1; LX.ui.updatePrompt(); return; }
  var ctl = new AbortController();
  LX.running = ctl;
  LX.ui.busy(true);
  try {
    for (var k = 0; k < chain.length; k++) {
      var c = chain[k];
      if (c.op === '&&' && LX.status !== 0) continue;
      if (c.op === '||' && LX.status === 0) continue;
      LX.status = await LX.runPipe(c, ctl.signal);
      if (ctl.signal.aborted) break;
    }
  } finally {
    LX.running = null;
    LX.ui.busy(false);
    LX.ui.updatePrompt();
    // commands like logout need the shell to be idle before they can take over
    if (LX.afterRun) { var after = LX.afterRun; LX.afterRun = null; after(); }
  }
};

LX.runPipe = async function (c, signal) {
  var stdin = null, stdinBytes = null, status = 0, out = null;
  for (var s = 0; s < c.pipe.length; s++) {
    var argv = LX.expandGlobs(c.pipe[s].map(function (a) { return typeof a === 'string' ? LX.expandVars(a) : { glob: LX.expandVars(a.glob) }; }));
    // aliases, one level deep
    if (LX.aliases[argv[0]]) {
      var al = LX.parse(LX.aliases[argv[0]])[0].pipe[0];
      argv = LX.expandGlobs(al.map(function (a) { return typeof a === 'string' ? LX.expandVars(a) : { glob: LX.expandVars(a.glob) }; })).concat(argv.slice(1));
    }
    var name = argv[0], last = s === c.pipe.length - 1;
    var capture = !last || !!c.redir;
    out = capture ? new CapOut(c.quietErr) : (c.quietErr ? new QuietErr(LX.term) : LX.term);
    var cmd = LX.cmds[name];
    if (!cmd) {
      LX.term.err('zsh: command not found: ' + name);
      var near = Object.keys(LX.cmds).filter(function (k) { return !LX.cmds[k].hidden && LX.lev(k, name) <= 1; });
      if (near.length && near.length < 4) LX.term.text('did you mean: ' + near.join(', ') + '?', 'c-dim');
      status = 127; stdin = ''; stdinBytes = null; out = null; continue;
    }
    var ctx = {
      name: name, args: argv.slice(1), argv: argv, stdin: stdin, stdinBytes: stdinBytes, out: out, signal: signal, piped: capture,
      sleep: function (ms) {
        return new Promise(function (res, rej) {
          if (signal.aborted) return rej(new DOMException('aborted', 'AbortError'));
          var t = setTimeout(res, ms);
          signal.addEventListener('abort', function () { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
        });
      }
    };
    if (out.failed !== undefined) out.failed = false;
    try {
      var r = await cmd.fn(ctx);
      status = typeof r === 'number' ? r : (out.failed ? 1 : 0);
    } catch (e) {
      if (e && e.name === 'AbortError') { LX.term.text('^C', 'c-dim'); return 130; }
      out.err(name + ': ' + (e && e.message ? e.message : e));
      status = 1;
    }
    stdin = capture ? out.value() : null;
    stdinBytes = capture && out.binData ? out.binData : null;
  }
  if (c.redir) {
    try {
      var abs = LX.fs.norm(LX.expandVars(c.redir.file)), ex = LX.fs.get(abs);
      if (abs === '/dev/null') return status;
      if (abs === '/proc/sysrq-trigger' && LX.sysrq && LX.sysrq(stdin)) return 0;
      if (ex && ex.t === 'd') throw new Error(c.redir.file + ': Is a directory');
      if (stdinBytes) LX.fs.put(abs, { t: 'b', data: stdinBytes });
      else if (c.redir.append && ex && ex.t === 'f') {
        if (!LX.fs.writable(abs.slice(0, abs.lastIndexOf('/')) || '/')) throw new Error('write-blocker: read-only');
        ex.text += stdin;
      } else LX.fs.put(abs, LX.F(stdin || ''));
    } catch (e) { LX.term.err('zsh: ' + e.message); return 1; }
  }
  return status;
};

LX.lev = function (a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  var d = [];
  for (var i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (var j = 0; j <= b.length; j++) d[0][j] = j;
  for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

// ---------------------------------------------------------------- ui
LX.ui = {
  out: LX.$('out'), input: LX.$('in'), hl: LX.$('in-hl'), pl: LX.$('pl'), ps1: LX.$('ps1'),
  suggestion: '',
  // PROMPT='%F{214}%n%f@%F{214}%M%f %F{cyan}%~%f %(?.%F{green}.%F{red})❯%f '
  promptHTML: function () {
    return '<span class="u">' + LX.esc(LX.USER) + '</span><span class="at">@</span><span class="h">' + LX.esc(LX.HOST) + '</span> ' +
      '<span class="p">' + LX.esc(LX.fs.display(LX.fs.cwd)) + '</span> <span class="' + (LX.status ? 'c-red' : 'c-green') + '">❯</span> ';
  },
  // repaint the highlighted mirror behind the input, plus the grey autosuggestion
  renderInput: function () {
    var ui = LX.ui, v = ui.input.value;
    ui.suggestion = v && ui.input.selectionStart === v.length ? LX.suggest(v) : '';
    ui.hl.innerHTML = LX.highlight(v) + (ui.suggestion ? LX.span('c-dim', ui.suggestion.slice(v.length)) : '');
    ui.hl.scrollLeft = ui.input.scrollLeft;
  },
  updatePrompt: function () {
    this.ps1.innerHTML = this.promptHTML();
    LX.$('st-cwd').textContent = LX.fs.display(LX.fs.cwd);
    if (LX.cases) LX.$('st-ev').textContent = 'evidence ' + LX.cases.solvedCount() + '/' + LX.cases.total();
  },
  scroll: function () { window.scrollTo(0, document.documentElement.scrollHeight); },
  trim: function () { while (this.out.childElementCount > 2500) this.out.firstElementChild.remove(); },
  busy: function (on) {
    this.pl.classList.toggle('busy', on);
    if (!on) { this.input.value = ''; this.renderInput(); this.focus(); this.scroll(); }
  },
  focus: function () {
    if (LX.keys.length || !LX.$('overlay').hidden || LX.loginOpen) return;
    var sel = window.getSelection && window.getSelection().toString();
    if (sel) return; // let people copy text
    var a = document.activeElement;
    if (a && a.closest && a.closest('#gui')) return;
    this.input.focus({ preventScroll: true });
  },
  toast: function (msg) {
    var t = LX.$('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(function () { t.classList.remove('show'); }, 2200);
  },
  // full screen overlay. resolves when closed (esc, q, button, ctrl+c)
  overlay: function (o, signal) {
    var ov = LX.$('overlay'), body = LX.$('ov-body');
    body.textContent = '';
    LX.$('ov-title').textContent = o.title || '';
    LX.$('ov-help').textContent = o.help || '';
    ov.hidden = false;
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    return new Promise(function (resolve) {
      var done = false;
      function close() {
        if (done) return; done = true;
        LX.keys.splice(LX.keys.indexOf(onKey), 1);
        ov.hidden = true; body.textContent = '';
        if (o.onClose) o.onClose();
        resolve();
      }
      function onKey(e) {
        if (e.key === 'Escape' || e.key === 'q' || (e.ctrlKey && e.key === 'c')) { close(); return true; }
        return o.onKey ? o.onKey(e) : false;
      }
      LX.keys.push(onKey);
      LX.$('ov-close').onclick = close;
      if (signal) signal.addEventListener('abort', close, { once: true });
      o.build(body, close);
    });
  }
};

// the default sink: straight into the terminal
LX.term = new TermOut();
LX.term.echo = function (line) { this.line(LX.ui.promptHTML() + LX.highlight(line)); };

// ---------------------------------------------------------------- input handling
LX.histIdx = 0;
LX.ui.input.addEventListener('keydown', function (e) {
  if (LX.keys.length || LX.running) return;
  var inp = LX.ui.input;
  var atEnd = inp.selectionStart === inp.value.length && inp.selectionEnd === inp.value.length;
  if (e.key === 'Enter') { e.preventDefault(); var v = inp.value; inp.value = ''; LX.ui.renderInput(); LX.run(v); return; }
  else if ((e.key === 'ArrowRight' || e.key === 'End') && atEnd && LX.ui.suggestion) { e.preventDefault(); inp.value = LX.ui.suggestion; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (LX.histIdx > 0) { inp.value = LX.hist[--LX.histIdx]; } }
  else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (LX.histIdx < LX.hist.length - 1) inp.value = LX.hist[++LX.histIdx];
    else { LX.histIdx = LX.hist.length; inp.value = ''; }
  }
  else if (e.key === 'Tab') { e.preventDefault(); LX.complete(); }
  else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); LX.ui.out.textContent = ''; }
  else if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && !inp.value.slice(inp.selectionStart, inp.selectionEnd)) {
    e.preventDefault(); LX.term.line(LX.ui.promptHTML() + LX.highlight(inp.value) + '<span class="c-dim">^C</span>'); inp.value = '';
  }
  else if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); inp.value = ''; }
  // history, completion, caret moves: repaint once the browser has applied the key
  requestAnimationFrame(LX.ui.renderInput);
});
LX.ui.input.addEventListener('input', LX.ui.renderInput);
LX.ui.input.addEventListener('scroll', function () { LX.ui.hl.scrollLeft = LX.ui.input.scrollLeft; });
LX.ui.input.addEventListener('click', LX.ui.renderInput);
LX.ui.input.addEventListener('blur', function () { LX.ui.hl.innerHTML = LX.highlight(LX.ui.input.value); });

document.addEventListener('keydown', function (e) {
  if (LX.keys.length) {
    if (LX.keys[LX.keys.length - 1](e)) e.preventDefault();
    return;
  }
  if (LX.running && e.ctrlKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); LX.running.abort(); return; }
  if (LX.running || LX.loginOpen) return;
  // typing anywhere goes to the prompt
  var a = document.activeElement;
  if (a !== LX.ui.input && !(a && a.closest && a.closest('#gui')) && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) LX.ui.focus();
});

// clickable things in the output
LX.ui.out.addEventListener('click', function (e) {
  var t = e.target.closest('[data-cmd]');
  if (!t || LX.running || LX.keys.length) return;
  LX.run(t.getAttribute('data-cmd'));
});
LX.ui.out.addEventListener('keydown', function (e) {
  var t = e.target.closest('[data-cmd]');
  if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (!LX.running) LX.run(t.getAttribute('data-cmd')); }
});
document.addEventListener('click', function (e) {
  if (e.target.closest('a,button,input,#gui,[data-cmd],audio,canvas,#overlay,#login')) return;
  LX.ui.focus();
});

// ---------------------------------------------------------------- tab completion
LX.complete = function () {
  var inp = LX.ui.input, v = inp.value;
  var word = /(\S*)$/.exec(v)[1], before = v.slice(0, v.length - word.length);
  var isCmd = !/\S/.test(before) || /(\||;|&&)\s*$/.test(before), cands = [];
  if (isCmd) {
    cands = Object.keys(LX.cmds).concat(Object.keys(LX.aliases))
      .filter(function (c) { return c.indexOf(word) === 0 && !(LX.cmds[c] && LX.cmds[c].hidden); })
      .sort().map(function (c) { return c + ' '; });
  } else {
    var sl = word.lastIndexOf('/'), dirPart = sl >= 0 ? word.slice(0, sl + 1) : '', base = word.slice(sl + 1);
    var dn = LX.fs.get(LX.fs.norm(dirPart || '.'));
    if (dn && dn.t === 'd') {
      cands = Object.keys(dn.c).filter(function (k) { return k.indexOf(base) === 0 && (base[0] === '.' || k[0] !== '.'); })
        .sort().map(function (k) { return dirPart + LX.quote(k) + (dn.c[k].t === 'd' ? '/' : ' '); });
    }
  }
  if (!cands.length) return;
  if (cands.length === 1) { inp.value = before + cands[0]; return; }
  var pre = cands.reduce(function (a, b) { var i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
  if (pre.length > word.length) { inp.value = before + pre; return; }
  LX.term.echo(v);
  LX.term.text(cands.map(function (c) { return c.trim().split('/').filter(Boolean).pop() || c.trim(); }).join('  '), 'c-dim');
};
