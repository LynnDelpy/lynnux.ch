// viewers.js :: view, stegsolve (bit planes), spectrogram, play
'use strict';

(function () {
  var def = LX.def, esc = LX.esc, span = LX.span;

  function mimeOf(b) {
    var m = LX.magic(b);
    return /^PNG/.test(m) ? 'image/png' : /^JPEG/.test(m) ? 'image/jpeg' : /^GIF/.test(m) ? 'image/gif' : /WAVE/.test(m) ? 'audio/wav' : null;
  }
  function blobUrl(b, mime) { return URL.createObjectURL(new Blob([b], { type: mime })); }
  async function loadPixels(b, mime) {
    var bmp = await createImageBitmap(new Blob([b], { type: mime }));
    var c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  }
  function canvasToBytes(cv) {
    return new Promise(function (res) { cv.toBlob(function (bl) { bl.arrayBuffer().then(function (ab) { res(new Uint8Array(ab)); }); }, 'image/png'); });
  }

  // ------------------------------------------------------------ view
  def('view', { cat: 'media', help: 'show an image right here in the terminal', usage: 'view <image>' }, async function (ctx) {
    var f = LX.open(ctx, ctx.args[0], 'view');
    if (!f) return;
    var b = await LX.fs.bytes(f.node), mime = mimeOf(b);
    if (!mime || mime.indexOf('image') !== 0) {
      ctx.out.err('view: ' + f.name + ' is not an image (' + LX.magic(b).split(',')[0] + ')');
      if (mime === 'audio/wav') ctx.out.html(span('c-dim', 'it is audio. try ') + LX.cmdLink('play ' + LX.quote(ctx.args[0]), 'play') + span('c-dim', ' or ') + LX.cmdLink('spectrogram ' + LX.quote(ctx.args[0]), 'spectrogram'));
      return;
    }
    if (ctx.piped) return ctx.out.text('[image ' + f.name + ']');
    var fig = document.createElement('figure'); fig.className = 'media';
    var img = document.createElement('img');
    img.alt = f.name;
    img.src = f.node.src && !f.node.data ? f.node.src : blobUrl(b, mime);
    var cap = document.createElement('figcaption');
    img.onload = function () { cap.textContent = f.name + '  ·  ' + img.naturalWidth + 'x' + img.naturalHeight + '  ·  ' + LX.fmtSize(b.length); LX.ui.scroll(); };
    fig.appendChild(img); fig.appendChild(cap);
    ctx.out.el(fig);
    await new Promise(function (r) { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); });
  });
  LX.cmds.display = LX.cmds.view; LX.cmds.feh = LX.cmds.view;

  // ------------------------------------------------------------ stegsolve
  def('stegsolve', { cat: 'media', help: 'flip through colour bit planes of an image (arrows, s saves)', usage: 'stegsolve <image>' }, async function (ctx) {
    var f = LX.open(ctx, ctx.args[0], 'stegsolve');
    if (!f) return;
    var b = await LX.fs.bytes(f.node), mime = mimeOf(b);
    if (!mime || mime.indexOf('image') !== 0) return ctx.out.err('stegsolve: not an image');
    var px = await loadPixels(b, mime), W = px.width, H = px.height, src = px.data;
    var hasAlpha = false;
    for (var i = 3; i < src.length; i += 4) if (src[i] !== 255) { hasAlpha = true; break; }
    var modes = [{ n: 'Normal image' }, { n: 'Colour inversion (XOR)', inv: true }];
    ['Red', 'Green', 'Blue'].concat(hasAlpha ? ['Alpha'] : []).forEach(function (ch, ci) {
      for (var bit = 7; bit >= 0; bit--) modes.push({ n: ch + ' plane ' + bit, ch: ci, bit: bit });
    });
    modes.push({ n: 'Gray bits', gray: true });
    var idx = 0, cv, g, label, saved = 0;
    function render() {
      var m = modes[idx], out = g.createImageData(W, H), d = out.data;
      for (var p = 0; p < src.length; p += 4) {
        if (m.ch !== undefined) { var v = (src[p + m.ch] >> m.bit) & 1 ? 255 : 0; d[p] = d[p + 1] = d[p + 2] = v; }
        else if (m.inv) { d[p] = 255 - src[p]; d[p + 1] = 255 - src[p + 1]; d[p + 2] = 255 - src[p + 2]; }
        else if (m.gray) { var gr = src[p] === src[p + 1] && src[p + 1] === src[p + 2] ? 255 : 0; d[p] = d[p + 1] = d[p + 2] = gr; }
        else { d[p] = src[p]; d[p + 1] = src[p + 1]; d[p + 2] = src[p + 2]; }
        d[p + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      label.textContent = '< ' + m.n + ' >   (' + (idx + 1) + '/' + modes.length + ')';
    }
    function step(k) { idx = (idx + k + modes.length) % modes.length; render(); }
    async function save() {
      var name = f.name.replace(/\.\w+$/, '') + '_' + modes[idx].n.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.png';
      LX.save(ctx, name, await canvasToBytes(cv), true);
      saved++;
      LX.ui.toast('saved ' + name + ' to ' + LX.fs.display(LX.fs.outDir()));
      lastSaved = name;
    }
    var lastSaved = null;
    await LX.ui.overlay({
      title: 'stegsolve :: ' + f.name,
      help: '← → (or a/d) switch plane · s save frame · esc close',
      build: function (body) {
        label = document.createElement('div'); label.className = 'ov-label';
        cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        g = cv.getContext('2d');
        var ctl = document.createElement('div'); ctl.className = 'ov-ctrl';
        [['◀ prev', function () { step(-1); }], ['next ▶', function () { step(1); }], ['save', save]].forEach(function (x) {
          var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = x[0]; bt.onclick = x[1]; ctl.appendChild(bt);
        });
        body.appendChild(label); body.appendChild(cv); body.appendChild(ctl);
        render();
      },
      onKey: function (e) {
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'l') { step(1); return true; }
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'h') { step(-1); return true; }
        if (e.key === 's') { save(); return true; }
        return false;
      }
    }, ctx.signal);
    ctx.out.text('stegsolve: closed ' + f.name + ', last view: ' + modes[idx].n, 'c-dim');
    if (saved) ctx.out.html(span('c-dim', saved + ' frame(s) saved. ') + LX.cmdLink('view ' + LX.quote(LX.fs.display(LX.fs.outDir() + '/' + lastSaved)), 'view the last one', 'c-amber'));
  });

  // ------------------------------------------------------------ wav + fft
  LX.parseWav = function (b) {
    var B = LX.bin;
    if (B.str(b, 0, 4) !== 'RIFF' || B.str(b, 8, 4) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
    var o = 12, fmt = null, data = null;
    while (o + 8 <= b.length) {
      var id = B.str(b, o, 4), len = B.le32(b, o + 4);
      if (id === 'fmt ') fmt = { tag: B.le16(b, o + 8), ch: B.le16(b, o + 10), sr: B.le32(b, o + 12), bits: B.le16(b, o + 22) };
      if (id === 'data') data = { off: o + 8, len: Math.min(len, b.length - o - 8) };
      o += 8 + len + (len & 1);
    }
    if (!fmt || !data) throw new Error('missing fmt or data chunk');
    if (fmt.tag !== 1 || (fmt.bits !== 16 && fmt.bits !== 8)) throw new Error('only 8/16-bit PCM is supported here. download it and use sox or audacity');
    var bps = fmt.bits / 8, frames = Math.floor(data.len / (bps * fmt.ch)), s = new Float32Array(frames);
    var dv = new DataView(b.buffer, b.byteOffset + data.off, data.len);
    for (var i = 0; i < frames; i++) {
      var acc = 0;
      for (var c = 0; c < fmt.ch; c++) {
        var p = (i * fmt.ch + c) * bps;
        acc += bps === 2 ? dv.getInt16(p, true) / 32768 : (dv.getUint8(p) - 128) / 128;
      }
      s[i] = acc / fmt.ch;
    }
    return { sr: fmt.sr, ch: fmt.ch, bits: fmt.bits, samples: s };
  };
  function fft(re, im) {
    var n = re.length, j = 0, t;
    for (var i = 1; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (var k = 0; k < n; k += len) {
        var cr = 1, ci = 0;
        for (var m = 0; m < len / 2; m++) {
          var a = k + m, b = a + len / 2;
          var xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  // dark -> violet -> red -> amber -> white
  var STOPS = [[0, 11, 12, 14], [0.3, 70, 20, 110], [0.55, 200, 40, 70], [0.78, 255, 176, 0], [1, 255, 250, 225]];
  function ramp(x) {
    x = Math.max(0, Math.min(1, x));
    for (var i = 1; i < STOPS.length; i++) if (x <= STOPS[i][0]) {
      var a = STOPS[i - 1], b = STOPS[i], t = (x - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
    return [255, 255, 255];
  }

  def('spectrogram', { cat: 'media', help: 'see sound: frequency over time', usage: 'spectrogram <wav>' }, async function (ctx) {
    var f = LX.open(ctx, ctx.args[0], 'spectrogram');
    if (!f) return;
    var wav;
    try { wav = LX.parseWav(await LX.fs.bytes(f.node)); } catch (e) { return ctx.out.err('spectrogram: ' + e.message); }
    var N = wav.sr > 32000 ? 1024 : 512, s = wav.samples;
    var hop = Math.max(N / 8, Math.ceil((s.length - N) / 1800));
    var frames = Math.max(1, Math.floor((s.length - N) / hop)), bins = N / 2;
    var win = new Float32Array(N);
    for (var i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    var mags = new Float32Array(frames * bins), max = 1e-12, re = new Float64Array(N), im = new Float64Array(N);
    for (var fr = 0; fr < frames; fr++) {
      for (i = 0; i < N; i++) { re[i] = s[fr * hop + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (var k = 0; k < bins; k++) { var m = re[k] * re[k] + im[k] * im[k]; mags[fr * bins + k] = m; if (m > max) max = m; }
    }
    var img = new ImageData(frames, bins), D = img.data, floor = -80;
    for (fr = 0; fr < frames; fr++) for (k = 0; k < bins; k++) {
      var db = 10 * Math.log10(mags[fr * bins + k] / max + 1e-12);
      var c = ramp((db - floor) / -floor), p = ((bins - 1 - k) * frames + fr) * 4;
      D[p] = c[0]; D[p + 1] = c[1]; D[p + 2] = c[2]; D[p + 3] = 255;
    }
    var raw = document.createElement('canvas'); raw.width = frames; raw.height = bins;
    raw.getContext('2d').putImageData(img, 0, 0);
    // final plot with axes
    var PW = Math.min(1400, Math.max(700, frames)), PH = 420, L = 56, Bm = 30, T = 10, R = 12;
    var cv = document.createElement('canvas'); cv.width = L + PW + R; cv.height = T + PH + Bm;
    var g = cv.getContext('2d');
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(raw, L, T, PW, PH);
    g.strokeStyle = '#3a3f48'; g.strokeRect(L - 0.5, T - 0.5, PW + 1, PH + 1);
    g.fillStyle = '#9aa1ab'; g.font = '12px JBM, monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
    var nyq = wav.sr / 2, dur = s.length / wav.sr;
    for (var kh = 0; kh <= nyq / 1000; kh += nyq > 12000 ? 2 : 1) {
      var y = T + PH - (kh * 1000 / nyq) * PH;
      g.fillText(kh + 'k', L - 8, y); g.fillRect(L - 4, Math.round(y), 4, 1);
    }
    g.textAlign = 'center'; g.textBaseline = 'top';
    var step = dur > 20 ? 5 : dur > 8 ? 1 : 0.5;
    for (var ts = 0; ts <= dur; ts += step) { var x = L + ts / dur * PW; g.fillText(ts + 's', x, T + PH + 8); g.fillRect(Math.round(x), T + PH, 1, 4); }
    g.save(); g.translate(14, T + PH / 2); g.rotate(-Math.PI / 2); g.fillText('Hz', 0, -6); g.restore();

    var savedName = null;
    await LX.ui.overlay({
      title: 'spectrogram :: ' + f.name,
      help: wav.sr + ' Hz · ' + wav.bits + '-bit · ' + (wav.ch === 1 ? 'mono' : wav.ch + 'ch') + ' · ' + dur.toFixed(2) + 's · s saves · esc closes',
      build: function (body) {
        body.appendChild(cv);
        var ctl = document.createElement('div'); ctl.className = 'ov-ctrl';
        var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = 'save png'; bt.onclick = function () { doSave(); };
        ctl.appendChild(bt); body.appendChild(ctl);
      },
      onKey: function (e) { if (e.key === 's') { doSave(); return true; } return false; }
    }, ctx.signal);
    async function doSave() {
      savedName = f.name.replace(/\.\w+$/, '') + '_spectrogram.png';
      LX.save(ctx, savedName, await canvasToBytes(cv), true);
      LX.ui.toast('saved ' + savedName + ' to ' + LX.fs.display(LX.fs.outDir()));
    }
    ctx.out.text('spectrogram: ' + frames + ' frames, ' + N + '-point fft, hann window', 'c-dim');
    if (savedName) ctx.out.html(span('c-dim', 'saved: ') + LX.cmdLink('view ' + LX.quote(LX.fs.display(LX.fs.outDir() + '/' + savedName)), savedName, 'c-amber'));
  });

  def('play', { cat: 'media', help: 'listen to an audio file', usage: 'play <wav>' }, async function (ctx) {
    var f = LX.open(ctx, ctx.args[0], 'play');
    if (!f) return;
    var b = await LX.fs.bytes(f.node);
    if (mimeOf(b) !== 'audio/wav') return ctx.out.err('play: only wav files');
    var a = document.createElement('audio');
    a.controls = true; a.preload = 'auto';
    a.src = f.node.src && !f.node.data ? f.node.src : blobUrl(b, 'audio/wav');
    ctx.out.el(a);
    a.play().catch(function () { /* autoplay blocked, controls are there */ });
    ctx.out.html(span('c-dim', 'sounds like noise? some messages are meant to be seen. ') + LX.cmdLink('spectrogram ' + LX.quote(ctx.args[0]), 'spectrogram ' + ctx.args[0], 'c-amber'));
  });
})();
