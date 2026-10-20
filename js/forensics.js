// forensics.js :: file, strings, xxd, exiftool, binwalk, dd, unzip, hashes, encoders
// everything here works on the real evidence bytes, nothing is faked.
'use strict';

(function () {
  var def = LX.def, esc = LX.esc, span = LX.span;

  // ------------------------------------------------------------ byte helpers
  function at(b, o, sig) { for (var i = 0; i < sig.length; i++) if (b[o + i] !== sig[i]) return false; return true; }
  function str(b, o, n) { var s = ''; for (var i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]); return s; }
  function be16(b, o) { return (b[o] << 8) | b[o + 1]; }
  function be32(b, o) { return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
  function le16(b, o) { return b[o] | (b[o + 1] << 8); }
  function le32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + ((b[o + 3] << 24) >>> 0); }
  LX.bin = { at: at, str: str, be16: be16, be32: be32, le16: le16, le32: le32 };

  LX.inflateRaw = async function (bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  LX.inflate = async function (bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  var CRC_T = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  LX.crc32 = function (b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  // bytes from a file arg, or stdin as utf-8
  LX.readBytes = async function (ctx, path, cmd) {
    if (path !== undefined) { var f = LX.open(ctx, path, cmd); return f ? { bytes: await LX.fs.bytes(f.node), file: f } : null; }
    if (ctx.stdinBytes) return { bytes: ctx.stdinBytes, file: null };
    if (ctx.stdin !== null) return { bytes: new TextEncoder().encode(ctx.stdin), file: null };
    ctx.out.err(cmd + ': missing file operand');
    return null;
  };
  // text from: existing file arg, else the args as literal text, else stdin
  LX.readLoose = async function (ctx, args, cmd) {
    if (args.length === 1 && LX.fs.get(LX.fs.norm(args[0])) && LX.fs.get(LX.fs.norm(args[0])).t !== 'd') {
      var f = LX.open(ctx, args[0], cmd);
      return f ? bytesToText(await LX.fs.bytes(f.node)) : null;
    }
    if (args.length) return args.join(' ');
    if (ctx.stdin !== null) return ctx.stdin;
    ctx.out.err(cmd + ': give me text, a file, or pipe something in');
    return null;
  };

  // ------------------------------------------------------------ file(1)
  var PNG_CT = { 0: 'grayscale', 2: 'RGB', 3: 'colormap', 4: 'gray+alpha', 6: 'RGBA' };
  function jpegInfo(b) {
    var o = 2, parts = [], w = 0, h = 0;
    while (o + 4 < b.length && b[o] === 0xFF) {
      var m = b[o + 1], len = be16(b, o + 2);
      if (m === 0xE0 && str(b, o + 4, 4) === 'JFIF') parts.push('JFIF standard ' + b[o + 9] + '.' + String(b[o + 10]).padStart(2, '0'));
      if (m === 0xE1 && str(b, o + 4, 4) === 'Exif') parts.push('Exif standard: [TIFF image data, ' + (b[o + 10] === 0x49 ? 'little' : 'big') + '-endian]');
      if (m === 0xFE) parts.push('comment: "' + str(b, o + 4, len - 2) + '"');
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { h = be16(b, o + 5); w = be16(b, o + 7); parts.push((m === 0xC2 ? 'progressive' : 'baseline') + ', precision ' + b[o + 4] + ', ' + w + 'x' + h + ', components ' + b[o + 9]); break; }
      if (m === 0xDA) break;
      o += 2 + len;
    }
    return 'JPEG image data' + (parts.length ? ', ' + parts.join(', ') : '');
  }
  LX.magic = function (b) {
    if (!b.length) return 'empty';
    if (at(b, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'PNG image data, ' + be32(b, 16) + ' x ' + be32(b, 20) + ', ' + b[24] + '-bit/color ' + (PNG_CT[b[25]] || '?') + ', ' + (b[28] ? 'interlaced' : 'non-interlaced');
    if (at(b, 0, [0xFF, 0xD8, 0xFF])) return jpegInfo(b);
    if (str(b, 0, 4) === 'GIF8') return 'GIF image data, version ' + str(b, 3, 3) + ', ' + le16(b, 6) + ' x ' + le16(b, 8);
    if (str(b, 0, 5) === '%PDF-') return 'PDF document, version ' + str(b, 5, 3);
    if (at(b, 0, [0x50, 0x4B, 0x03, 0x04])) return 'Zip archive data, at least v' + (b[4] / 10).toFixed(1) + ' to extract, compression method=' + (b[8] === 8 ? 'deflate' : b[8] === 0 ? 'store' : b[8]);
    if (at(b, 0, [0x1F, 0x8B])) return 'gzip compressed data';
    if (str(b, 0, 4) === 'RIFF' && str(b, 8, 4) === 'WAVE') {
      var ch = le16(b, 22), sr = le32(b, 24), bits = le16(b, 34), fmt = le16(b, 20);
      return 'RIFF (little-endian) data, WAVE audio, ' + (fmt === 1 ? 'Microsoft PCM' : 'format ' + fmt) + ', ' + bits + ' bit, ' + (ch === 1 ? 'mono' : ch === 2 ? 'stereo' : ch + ' channels') + ' ' + sr + ' Hz';
    }
    if (at(b, 0, [0xD4, 0xC3, 0xB2, 0xA1])) return 'pcap capture file, microsecond ts (little-endian) - version ' + le16(b, 4) + '.' + le16(b, 6) + ' (' + (le32(b, 20) === 1 ? 'Ethernet' : 'linktype ' + le32(b, 20)) + ', capture length ' + le32(b, 16) + ')';
    if (at(b, 0, [0x0A, 0x0D, 0x0D, 0x0A])) return 'pcapng capture file';
    if (b[510] === 0x55 && b[511] === 0xAA && /FAT1[26]/.test(str(b, 54, 8))) {
      return 'DOS/MBR boot sector, code offset 0x' + LX.hex(b[1] + 2) + ', OEM-ID "' + str(b, 3, 8) + '", sectors/cluster ' + b[13] + ', root entries ' + le16(b, 17) +
        ', sectors ' + le16(b, 19) + ' (volumes <=32 MB), Media descriptor 0x' + LX.hex(b[21]) + ', sectors/FAT ' + le16(b, 22) + ', serial number 0x' + LX.hex(le32(b, 39), 8) +
        ', label: "' + str(b, 43, 11) + '", FAT (' + str(b, 54, 5).slice(3) + ' bit)';
    }
    if (at(b, 0, [0x7F, 0x45, 0x4C, 0x46])) return 'ELF ' + (b[4] === 2 ? '64' : '32') + '-bit ' + (b[5] === 1 ? 'LSB' : 'MSB') + ' executable';
    if (str(b, 0, 2) === 'MZ') return 'PE32 executable (MS-DOS header)';
    if (str(b, 0, 15) === 'SQLite format 3') return 'SQLite 3.x database';
    // text?
    var hi = false, ctrl = 0, n = Math.min(b.length, 65536);
    for (var i = 0; i < n; i++) { if (b[i] >= 128) hi = true; else if (b[i] < 32 && b[i] !== 9 && b[i] !== 10 && b[i] !== 13) ctrl++; }
    if (!ctrl) {
      if (hi) { try { new TextDecoder('utf-8', { fatal: true }).decode(b); return 'Unicode text, UTF-8 text'; } catch (e) { return 'ISO-8859 text'; } }
      return 'ASCII text';
    }
    return 'data';
  };
  def('file', { cat: 'forensics', help: 'what is this file, really? (magic bytes, not extensions)', usage: 'file <file...>' }, async function (ctx) {
    if (!ctx.args.length && ctx.stdin === null) return ctx.out.err('Usage: file <file...>');
    if (!ctx.args.length || ctx.args[0] === '-') {
      var sb = await LX.readBytes(ctx, undefined, 'file');
      return sb && ctx.out.text('/dev/stdin: ' + LX.magic(sb.bytes));
    }
    for (var i = 0; i < ctx.args.length; i++) {
      var p = ctx.args[i], n = LX.fs.get(LX.fs.norm(p));
      if (!n) { ctx.out.text(p + ": cannot open `" + p + "' (No such file or directory)"); continue; }
      if (n.t === 'd') { ctx.out.text(p + ': directory'); continue; }
      if (n.t === 'l') { ctx.out.text(p + ': symbolic link to ' + n.url); continue; }
      var f = LX.open(ctx, p, 'file');
      if (!f) continue;
      ctx.out.html(span('c-cyan', p + ': ') + esc(LX.magic(await LX.fs.bytes(f.node))));
    }
  });

  // ------------------------------------------------------------ strings
  def('strings', { cat: 'forensics', help: 'printable character runs in a file', usage: 'strings [-n min] [-t x|d] <file>' }, async function (ctx) {
    var o = LX.opts(ctx.args, { vals: 'nt', flags: 'a' }), min = LX.num(o.v.n, 4);
    var r = await LX.readBytes(ctx, o.rest[0], 'strings');
    if (!r) return;
    var b = r.bytes, out = [], start = -1, cap = ctx.piped ? 50000 : 400, total = 0;
    for (var i = 0; i <= b.length; i++) {
      var c = i < b.length ? b[i] : 0;
      var pr = (c >= 0x20 && c < 0x7F) || c === 9;
      if (pr) { if (start < 0) start = i; continue; }
      if (start >= 0 && i - start >= min) {
        total++;
        if (out.length < cap) out.push((o.v.t ? LX.pad(o.v.t === 'x' ? start.toString(16) : start, 7, true) + ' ' : '') + str(b, start, i - start));
      }
      start = -1;
    }
    ctx.out.text(out.join('\n'));
    if (total > cap) ctx.out.html(span('c-dim', '... ' + (total - cap) + ' more. pipe it: strings ' + (o.rest[0] || '') + ' | grep -i something'));
  });

  // ------------------------------------------------------------ xxd / hexdump
  function dump(ctx, b, off, len, cols, style) {
    var end = Math.min(b.length, off + len), lines = [], plain = ctx.piped;
    for (var o = off; o < end; o += cols) {
      var hex = '', asc = '', hexH = '', ascH = '';
      for (var i = 0; i < cols; i++) {
        var has = o + i < end, v = has ? b[o + i] : 0;
        var hx = has ? LX.hex(v) : '  ';
        var sep = style === 'C' ? ' ' + (i === 8 ? ' ' : '') : (i % 2 ? ' ' : '');
        if (style === 'C') hex += sep + hx; else hex += hx + sep;
        var ch = has ? (v >= 0x20 && v < 0x7F ? String.fromCharCode(v) : '.') : '';
        asc += ch;
        if (!plain) {
          var cls = !has ? '' : v === 0 ? 'c-faint' : v >= 0x20 && v < 0x7F ? 'c-green' : v === 0xFF ? 'c-blue' : 'c-amber';
          var cell = cls ? '<span class="' + cls + '">' + hx + '</span>' : hx;
          hexH += style === 'C' ? sep + cell : cell + sep;
          ascH += cls ? '<span class="' + cls + '">' + esc(ch) + '</span>' : esc(ch);
        }
      }
      if (style === 'C') {
        var ofs = LX.hex(o, 8);
        if (plain) lines.push(ofs + ' ' + hex + '  |' + asc + '|');
        else lines.push(span('c-dim', ofs) + ' ' + hexH + '  ' + span('c-dim', '|') + ascH + span('c-dim', '|'));
      } else {
        var ofs2 = LX.hex(o, 8) + ':';
        if (plain) lines.push(ofs2 + ' ' + hex + ' ' + asc);
        else lines.push(span('c-dim', ofs2) + ' ' + hexH + ' ' + ascH);
      }
    }
    if (plain) ctx.out.text(lines.join('\n')); else ctx.out.pre(lines.join('\n'));
  }
  def('xxd', { cat: 'forensics', help: 'hex dump. -r -p turns hex back into bytes', usage: 'xxd [-s off] [-l len] [-c cols] [-p] [-r -p] [file]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'prua', vals: 'slcg' });
    if (o.f.r) {
      var t = await LX.readLoose(ctx, o.rest, 'xxd');
      if (t === null) return;
      return LX.cmds.unhex.fn({ args: [], stdin: t, out: ctx.out, piped: ctx.piped });
    }
    var r = await LX.readBytes(ctx, o.rest[0], 'xxd');
    if (!r) return;
    var b = r.bytes, off = LX.num(o.v.s, 0);
    if (off < 0) off = Math.max(0, b.length + off);
    var auto = o.v.l === undefined && !ctx.piped, len = auto ? 512 : LX.num(o.v.l, b.length);
    if (o.f.p) {
      var hx = '', end = Math.min(b.length, off + len);
      for (var i = off; i < end; i++) { hx += LX.hex(b[i]); if ((i - off) % 30 === 29) hx += '\n'; }
      ctx.out.text(hx.replace(/\n$/, ''));
    } else dump(ctx, b, off, len, LX.num(o.v.c, 16), 'x');
    if (auto && b.length > off + len) ctx.out.html(span('c-dim', '... ' + (b.length - off - len) + ' more bytes. use -s <offset> -l <length>, or pipe into grep/head/tail'));
  });
  def('hexdump', { cat: 'forensics', help: 'canonical hex dump (use -C)', usage: 'hexdump -C [-s off] [-n len] [file]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'Cv', vals: 'sn' });
    var r = await LX.readBytes(ctx, o.rest[0], 'hexdump');
    if (!r) return;
    var auto = o.v.n === undefined && !ctx.piped, len = auto ? 512 : LX.num(o.v.n, r.bytes.length), off = LX.num(o.v.s, 0);
    dump(ctx, r.bytes, off, len, 16, 'C');
    if (auto && r.bytes.length > off + len) ctx.out.html(span('c-dim', '... ' + (r.bytes.length - off - len) + ' more bytes (-s / -n)'));
  });

  // ------------------------------------------------------------ exiftool
  var TAGS = {
    ifd0: { 0x010E: 'Image Description', 0x010F: 'Make', 0x0110: 'Camera Model Name', 0x0112: 'Orientation', 0x011A: 'X Resolution', 0x011B: 'Y Resolution', 0x0128: 'Resolution Unit', 0x0131: 'Software', 0x0132: 'Modify Date', 0x013B: 'Artist', 0x8298: 'Copyright', 0x9C9C: 'XP Comment', 0x9C9D: 'XP Author' },
    exif: { 0x829A: 'Exposure Time', 0x829D: 'F Number', 0x8827: 'ISO', 0x9000: 'Exif Version', 0x9003: 'Date/Time Original', 0x9004: 'Create Date', 0x9286: 'User Comment', 0x920A: 'Focal Length', 0xA002: 'Exif Image Width', 0xA003: 'Exif Image Height', 0xA430: 'Owner Name', 0xA431: 'Serial Number' },
    gps: { 0x0000: 'GPS Version ID', 0x0001: 'GPS Latitude Ref', 0x0002: 'GPS Latitude', 0x0003: 'GPS Longitude Ref', 0x0004: 'GPS Longitude', 0x0005: 'GPS Altitude Ref', 0x0006: 'GPS Altitude' }
  };
  var TSIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function parseTiff(b, base, out) {
    var le = b[base] === 0x49, u16 = function (o) { o += base; return le ? le16(b, o) : be16(b, o); }, u32 = function (o) { o += base; return le ? le32(b, o) : be32(b, o); };
    var gps = {};
    function ifd(o, table, depth) {
      if (depth > 3 || o + 2 > b.length - base) return;
      var n = u16(o);
      for (var i = 0; i < n; i++) {
        var e = o + 2 + i * 12, tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
        var size = (TSIZE[type] || 1) * cnt, vo = size <= 4 ? e + 8 : u32(e + 8), val;
        if (vo + size > b.length - base) continue;
        if (type === 2) val = str(b, base + vo, cnt).replace(/\0+$/, '');
        else if (type === 3) val = cnt === 1 ? u16(vo) : Array.from({ length: cnt }, function (_, k) { return u16(vo + k * 2); }).join(' ');
        else if (type === 4) val = u32(vo);
        else if (type === 5 || type === 10) val = Array.from({ length: cnt }, function (_, k) { var d = u32(vo + k * 8 + 4); return d ? u32(vo + k * 8) / d : 0; });
        else if (type === 1) val = Array.from({ length: cnt }, function (_, k) { return b[base + vo + k]; }).join(' ');
        else val = str(b, base + vo, Math.min(cnt, 4096));
        if (tag === 0x8769) { ifd(val, TAGS.exif, depth + 1); continue; }
        if (tag === 0x8825) { ifd(val, TAGS.gps, depth + 1); continue; }
        if (tag === 0x9286 && typeof val === 'string') val = val.slice(8).replace(/\0+$/, '');
        if (tag === 0x9000) val = String(val).replace(/^0/, '').replace(/^(\d+)(\d\d)$/, '$1.$2');
        if (tag === 0x0112) val = { 1: 'Horizontal (normal)', 3: 'Rotate 180', 6: 'Rotate 90 CW', 8: 'Rotate 270 CW' }[val] || val;
        if (table === TAGS.gps) gps[tag] = val;
        if (table === TAGS.gps && (tag === 2 || tag === 4) && Array.isArray(val)) val = Math.floor(val[0]) + ' deg ' + Math.floor(val[1]) + "' " + val[2].toFixed(2) + '"';
        else if (Array.isArray(val)) val = val.map(function (x) { return +x.toFixed(4); }).join(' ');
        if (tag === 1 || tag === 3) val = { N: 'North', S: 'South', E: 'East', W: 'West' }[val] || val;
        out.push([table[tag] || ('Tag 0x' + LX.hex(tag, 4)), String(val)]);
      }
    }
    if (u16(2) !== 42) return;
    ifd(u32(4), TAGS.ifd0, 0);
    if (Array.isArray(gps[2]) && Array.isArray(gps[4])) {
      var dms = function (a) { return a[0] + a[1] / 60 + a[2] / 3600; };
      var lat = dms(gps[2]) * (gps[1] === 'S' ? -1 : 1), lon = dms(gps[4]) * (gps[3] === 'W' ? -1 : 1);
      out.gps = [lat, lon];
    }
  }
  async function exif(b) {
    var out = [];
    if (at(b, 0, [0xFF, 0xD8])) {
      var o = 2;
      while (o + 4 < b.length && b[o] === 0xFF) {
        var m = b[o + 1], len = be16(b, o + 2);
        if (m === 0xE0 && str(b, o + 4, 4) === 'JFIF') out.push(['JFIF Version', b[o + 9] + '.' + String(b[o + 10]).padStart(2, '0')]);
        if (m === 0xE1 && str(b, o + 4, 6) === 'Exif\0\0') { out.push(['Exif Byte Order', b[o + 10] === 0x49 ? 'Little-endian (Intel, II)' : 'Big-endian (Motorola, MM)']); parseTiff(b, o + 10, out); }
        if (m === 0xFE) out.push(['Comment', str(b, o + 4, len - 2)]);
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          out.push(['Image Width', be16(b, o + 7)], ['Image Height', be16(b, o + 5)], ['Bits Per Sample', b[o + 4]], ['Color Components', b[o + 9]]);
        }
        if (m === 0xDA) break;
        o += 2 + len;
      }
      // first EOI after the scan starts. inside entropy coded data FF is always stuffed (FF 00),
      // so the first FF D9 really is the end of the image
      var eoi = -1;
      for (var j = o; j < b.length - 1; j++) if (b[j] === 0xFF && b[j + 1] === 0xD9) { eoi = j + 2; break; }
      if (eoi > 0 && eoi < b.length) out.push(['Warning', '[minor] Trailer data after JPEG EOI marker (' + (b.length - eoi) + ' bytes at offset 0x' + LX.hex(eoi, 4) + ')']);
      if (out.gps) out.push(['GPS Position', null]);
    } else if (at(b, 0, [0x89, 0x50, 0x4E, 0x47])) {
      var p = 8;
      while (p + 8 <= b.length) {
        var L = be32(b, p), type = str(b, p + 4, 4), d = p + 8;
        if (type === 'IHDR') out.push(['Image Width', be32(b, d)], ['Image Height', be32(b, d + 4)], ['Bit Depth', b[d + 8]], ['Color Type', PNG_CT[b[d + 9]] || b[d + 9]], ['Interlace', b[d + 12] ? 'Adam7' : 'Noninterlaced']);
        if (type === 'tEXt') { var t = str(b, d, L), z = t.indexOf('\0'); out.push([t.slice(0, z), t.slice(z + 1)]); }
        if (type === 'zTXt') {
          var t2 = str(b, d, L), z2 = t2.indexOf('\0');
          try { out.push([t2.slice(0, z2), new TextDecoder().decode(await LX.inflate(b.subarray(d + z2 + 2, d + L)))]); } catch (e) { out.push([t2.slice(0, z2), '(compressed)']); }
        }
        if (type === 'iTXt') { var t3 = new TextDecoder().decode(b.subarray(d, d + L)).split('\0'); out.push([t3[0], t3[t3.length - 1]]); }
        if (type === 'tIME') out.push(['Modify Date', be16(b, d) + ':' + b[d + 2] + ':' + b[d + 3] + ' ' + b[d + 4] + ':' + b[d + 5] + ':' + b[d + 6]]);
        if (type === 'IEND') { if (d + 4 < b.length) out.push(['Warning', '[minor] Trailer data after PNG IEND chunk']); break; }
        p = d + L + 4;
      }
    } else if (str(b, 0, 4) === 'RIFF' && str(b, 8, 4) === 'WAVE') {
      var sr = le32(b, 24), ch = le16(b, 22), bits = le16(b, 34), dataLen = le32(b, 40);
      out.push(['Encoding', le16(b, 20) === 1 ? 'Microsoft PCM' : le16(b, 20)], ['Num Channels', ch], ['Sample Rate', sr], ['Avg Bytes Per Sec', le32(b, 28)], ['Bits Per Sample', bits],
        ['Duration', (dataLen / (sr * ch * bits / 8)).toFixed(2) + ' s']);
    }
    return out;
  }
  def('exiftool', { cat: 'forensics', help: 'read metadata (exif, gps, png text chunks, wav info)', usage: 'exiftool <file>' }, async function (ctx) {
    var f = LX.open(ctx, ctx.args[0], 'exiftool');
    if (!f) return;
    var b = await LX.fs.bytes(f.node), mt = LX.magic(b);
    var type = /^JPEG/.test(mt) ? ['JPEG', 'image/jpeg'] : /^PNG/.test(mt) ? ['PNG', 'image/png'] : /WAVE/.test(mt) ? ['WAV', 'audio/x-wav'] : /^pcap/.test(mt) ? ['PCAP', 'application/vnd.tcpdump.pcap'] : /boot sector/.test(mt) ? ['FAT', 'application/octet-stream'] : /text/.test(mt) ? ['TXT', 'text/plain'] : ['', 'application/octet-stream'];
    var rows = [['ExifTool Version Number', '12.76 (' + LX_CONFIG.siteName + ' build)'], ['File Name', f.name], ['File Size', b.length < 1000 ? b.length + ' bytes' : b.length < 1e6 ? Math.round(b.length / 1000) + ' kB' : (b.length / 1e6).toFixed(1) + ' MB'], ['File Type', type[0] || 'Unknown'], ['MIME Type', type[1]]];
    var meta = await exif(b);
    var all = rows.concat(meta);
    all.forEach(function (r) {
      var k = LX.pad(r[0], 32);
      if (r[0] === 'GPS Position') {
        var g = meta.gps, dd = function (v, p, n) { var a = Math.abs(v); return Math.floor(a) + ' deg ' + Math.floor(a % 1 * 60) + "' " + ((a * 3600) % 60).toFixed(2) + '" ' + (v < 0 ? n : p); };
        var val = dd(g[0], 'N', 'S') + ', ' + dd(g[1], 'E', 'W');
        if (ctx.piped) ctx.out.text(k + ': ' + val);
        else ctx.out.html(esc(k) + ': ' + span('c-amber', val) + '  <a href="https://www.openstreetmap.org/?mlat=' + g[0].toFixed(6) + '&amp;mlon=' + g[1].toFixed(6) + '#map=17/' + g[0].toFixed(6) + '/' + g[1].toFixed(6) + '" target="_blank" rel="noopener noreferrer">map</a>');
        return;
      }
      if (ctx.piped) ctx.out.text(k + ': ' + r[1]);
      else ctx.out.html(span(r[0] === 'Warning' ? 'c-red' : 'c-dim', k) + ': ' + esc(r[1]));
    });
  });

  // ------------------------------------------------------------ zip parsing (shared by binwalk + unzip)
  function zipEntryAt(b, o) {
    if (!at(b, o, [0x50, 0x4B, 0x03, 0x04]) || o + 30 > b.length) return null;
    var flags = le16(b, o + 6), method = le16(b, o + 8), crc = le32(b, o + 14), csize = le32(b, o + 18), usize = le32(b, o + 22);
    var nlen = le16(b, o + 26), xlen = le16(b, o + 28), name = new TextDecoder().decode(b.subarray(o + 30, o + 30 + nlen));
    var dataOff = o + 30 + nlen + xlen;
    return { off: o, ver: b[o + 4], flags: flags, method: method, crc: crc, csize: csize, usize: usize, name: name, dataOff: dataOff, end: dataOff + csize, encrypted: !!(flags & 1) };
  }
  LX.zipEntries = function (b) {
    var out = [];
    for (var o = 0; o < b.length - 4; o++) {
      if (b[o] !== 0x50 || b[o + 1] !== 0x4B || b[o + 2] !== 3 || b[o + 3] !== 4) continue;
      var e = zipEntryAt(b, o);
      if (e && e.end <= b.length && e.name.length) { out.push(e); o = e.end - 1; }
    }
    return out;
  };
  LX.zipExtract = async function (b, e) {
    var raw = b.subarray(e.dataOff, e.end);
    if (e.encrypted) throw new Error(e.name + ': encrypted, password required');
    var data = e.method === 0 ? raw : e.method === 8 ? await LX.inflateRaw(raw) : null;
    if (!data) throw new Error(e.name + ': unsupported compression method ' + e.method);
    return { data: data, crcOk: LX.crc32(data) === e.crc };
  };

  // ------------------------------------------------------------ binwalk
  function sigScan(b) {
    var hits = [];
    for (var o = 0; o < b.length - 8; o++) {
      var c = b[o];
      if (c === 0xFF && b[o + 1] === 0xD8 && b[o + 2] === 0xFF && (b[o + 3] & 0xF0) === 0xE0 || c === 0xFF && b[o + 1] === 0xD8 && b[o + 2] === 0xFF && b[o + 3] === 0xDB) {
        hits.push([o, 'JPEG image data' + (str(b, o + 6, 4) === 'JFIF' ? ', JFIF standard ' + b[o + 11] + '.' + String(b[o + 12]).padStart(2, '0') : str(b, o + 6, 4) === 'Exif' ? ', EXIF standard' : '')]);
      } else if (c === 0x89 && at(b, o, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
        hits.push([o, 'PNG image, ' + be32(b, o + 16) + ' x ' + be32(b, o + 20) + ', ' + b[o + 24] + '-bit/color ' + (PNG_CT[b[o + 25]] || '?') + ', ' + (b[o + 28] ? 'interlaced' : 'non-interlaced')]);
      } else if (c === 0x50 && b[o + 1] === 0x4B && b[o + 2] === 3 && b[o + 3] === 4) {
        var e = zipEntryAt(b, o);
        if (e) hits.push([o, 'Zip archive data, ' + (e.encrypted ? 'encrypted ' : '') + 'at least v' + (e.ver / 10).toFixed(1) + ' to extract, compressed size: ' + e.csize + ', uncompressed size: ' + e.usize + ', name: ' + e.name]);
      } else if (c === 0x50 && b[o + 1] === 0x4B && b[o + 2] === 5 && b[o + 3] === 6) {
        hits.push([o, 'End of Zip archive, footer length: ' + (22 + le16(b, o + 20))]);
      } else if (c === 0x1F && b[o + 1] === 0x8B && b[o + 2] === 0x08) {
        hits.push([o, 'gzip compressed data, from Unix']);
      } else if (c === 0x25 && str(b, o, 5) === '%PDF-') {
        hits.push([o, 'PDF document, version: "' + str(b, o + 5, 3) + '"']);
      } else if (c === 0x7F && str(b, o + 1, 3) === 'ELF') {
        hits.push([o, 'ELF, ' + (b[o + 4] === 2 ? '64' : '32') + '-bit ' + (b[o + 5] === 1 ? 'LSB' : 'MSB') + ' executable']);
      } else if (c === 0x37 && at(b, o, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) {
        hits.push([o, '7-zip archive data, version ' + b[o + 6] + '.' + b[o + 7]]);
      } else if (c === 0x47 && str(b, o, 4) === 'GIF8') {
        hits.push([o, 'GIF image data, version "' + str(b, o, 6) + '"']);
      } else if (c === 0x52 && str(b, o, 4) === 'RIFF' && str(b, o + 8, 4) === 'WAVE') {
        hits.push([o, 'RIFF audio data (WAVE)']);
      } else if (c === 0x55 && o === 510 && b[o + 1] === 0xAA) {
        hits.push([0, 'DOS boot sector / FAT filesystem, OEM: "' + str(b, 3, 8) + '"']);
      }
    }
    return hits.sort(function (a, b2) { return a[0] - b2[0]; });
  }
  def('binwalk', { cat: 'forensics', help: 'find files hidden inside files. -e extracts them', usage: 'binwalk [-e] <file>' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'eM' });
    var f = LX.open(ctx, o.rest[0], 'binwalk');
    if (!f) return;
    var b = await LX.fs.bytes(f.node), hits = sigScan(b);
    ctx.out.text('');
    ctx.out.html(span('c-amber', LX.pad('DECIMAL', 14) + LX.pad('HEXADECIMAL', 18) + 'DESCRIPTION'));
    ctx.out.text('-'.repeat(80), 'c-faint');
    hits.forEach(function (h) { ctx.out.text(LX.pad(h[0], 14) + LX.pad('0x' + h[0].toString(16).toUpperCase(), 18) + h[1]); });
    ctx.out.text('');
    if (!o.f.e) {
      if (hits.length > 1 && !ctx.piped) ctx.out.html(span('c-dim', 'more than one thing in there. extract with ') + LX.cmdLink('binwalk -e ' + LX.quote(o.rest[0]), 'binwalk -e ' + o.rest[0], 'c-amber') + span('c-dim', ' or carve by hand with dd'));
      return;
    }
    var entries = LX.zipEntries(b);
    if (!entries.length) { ctx.out.text('nothing extractable (binwalk -e handles zip archives. for images, carve with dd skip= count=)', 'c-dim'); return; }
    var dirName = '_' + f.name + '.extracted', dirAbs = LX.fs.outDir() + '/' + dirName;
    if (LX.fs.outDir() !== LX.fs.cwd && !LX.fs.get(LX.fs.outDir())) LX.fs.put(LX.fs.outDir(), LX.D({}));
    LX.fs.put(dirAbs, LX.D({}));
    var zipStart = entries[0].off;
    LX.fs.put(dirAbs + '/' + zipStart.toString(16).toUpperCase() + '.zip', { t: 'b', data: b.slice(zipStart) });
    for (var i = 0; i < entries.length; i++) {
      try {
        var x = await LX.zipExtract(b, entries[i]);
        LX.fs.put(dirAbs + '/' + entries[i].name.replace(/\//g, '_'), { t: 'b', data: x.data });
      } catch (e) { ctx.out.err('binwalk: ' + e.message); }
    }
    var disp = LX.fs.display(dirAbs);
    if (LX.fs.outDir() !== LX.fs.cwd) ctx.out.text('write-blocker: ' + LX.fs.display(LX.fs.cwd) + ' is read-only, extracting to ~/work instead', 'c-dim');
    ctx.out.html(span('c-green', 'extracted ' + entries.length + ' file(s) to ') + LX.cmdLink('cd ' + LX.quote(disp) + ' && ls -l', disp + '/', 'c-cyan b'));
  });

  // ------------------------------------------------------------ dd
  def('dd', { cat: 'forensics', help: 'copy (carve) bytes. the original imaging tool', usage: 'dd if=<file> of=<out> [bs=1] [skip=N] [count=N]' }, async function (ctx) {
    var kv = {};
    ctx.args.forEach(function (a) { var m = /^(\w+)=(.*)$/.exec(a); if (m) kv[m[1]] = m[2]; });
    if (!kv['if']) return ctx.out.err('dd: missing if=<input file>. example: dd if=lake.jpg of=hidden.zip bs=1 skip=17701');
    var f = LX.open(ctx, kv['if'], 'dd');
    if (!f) return;
    var b = await LX.fs.bytes(f.node);
    var bs = LX.num((kv.bs || '512').replace(/[kK]$/, '000').replace(/[mM]$/, '000000'), 512), skip = LX.num(kv.skip, 0), count = kv.count !== undefined ? LX.num(kv.count) : Infinity;
    var start = Math.min(b.length, skip * bs), end = Math.min(b.length, count === Infinity ? b.length : start + count * bs);
    var data = b.slice(start, end), t = (Math.random() * 0.002 + 0.0003);
    if (kv.of) {
      var target = kv.of, abs = LX.fs.norm(target), dir = abs.slice(0, abs.lastIndexOf('/')) || '/';
      if (!LX.fs.writable(dir)) { abs = LX.save(ctx, abs.slice(abs.lastIndexOf('/') + 1), data); }
      else LX.fs.put(abs, { t: 'b', data: data });
    } else if (ctx.piped) { ctx.out.bytes(data); return; }
    else { ctx.out.err('dd: refusing to dump binary to your terminal. add of=<file>'); return; }
    var full = Math.floor(data.length / bs), part = data.length % bs ? 1 : 0;
    ctx.out.text(full + '+' + part + ' records in\n' + full + '+' + part + ' records out', 'c-dim');
    ctx.out.text(data.length + ' bytes (' + LX.fmtSize(data.length) + ') copied, ' + t.toFixed(5) + ' s, ' + LX.fmtSize(Math.round(data.length / t)) + '/s', 'c-dim');
    if (kv.of && data.length && !ctx.piped) ctx.out.html(span('c-dim', 'what did you carve? ') + LX.cmdLink('file ' + LX.quote(LX.fs.display(abs)), 'file ' + LX.fs.display(abs), 'c-amber'));
  });

  // ------------------------------------------------------------ unzip
  def('unzip', { cat: 'forensics', help: 'list / extract / print zip entries (works on polyglots too)', usage: 'unzip [-l] [-p] <file> [entry]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'lpoq', vals: 'd' });
    var f = LX.open(ctx, o.rest[0], 'unzip');
    if (!f) return;
    var b = await LX.fs.bytes(f.node), entries = LX.zipEntries(b);
    if (!entries.length) return ctx.out.err('unzip: cannot find zipfile directory in ' + o.rest[0] + '. is it really a zip? try binwalk');
    var want = o.rest.slice(1);
    if (want.length) entries = entries.filter(function (e) { return want.indexOf(e.name) >= 0; });
    if (!o.f.p) ctx.out.text('Archive:  ' + o.rest[0]);
    if (entries[0] && entries[0].off > 0 && !o.f.p) ctx.out.text('warning [' + o.rest[0] + ']:  ' + entries[0].off + ' extra bytes at beginning or within zipfile', 'c-amber');
    if (o.f.l) {
      ctx.out.text('  Length      Name\n---------  ----------------');
      var tot = 0;
      entries.forEach(function (e) { tot += e.usize; ctx.out.text(LX.pad(e.usize, 9, true) + '  ' + e.name); });
      ctx.out.text('---------  ----------------\n' + LX.pad(tot, 9, true) + '  ' + entries.length + ' files');
      return;
    }
    for (var i = 0; i < entries.length; i++) {
      var x;
      try { x = await LX.zipExtract(b, entries[i]); } catch (e) { ctx.out.err('unzip: ' + e.message); continue; }
      if (o.f.p) { ctx.out.bytes(x.data, 'unzip -p ' + o.rest[0] + ' ' + entries[i].name); continue; }
      var dest = o.v.d ? LX.fs.norm(o.v.d) : LX.fs.outDir();
      if (!LX.fs.get(dest)) LX.fs.put(dest, LX.D({}));
      var abs = LX.fs.writable(dest) ? LX.fs.put(dest + '/' + entries[i].name.replace(/\//g, '_'), { t: 'b', data: x.data }) : LX.save(ctx, entries[i].name.replace(/\//g, '_'), x.data);
      ctx.out.html('  inflating: ' + LX.cmdLink('cat ' + LX.quote(LX.fs.display(abs)), LX.fs.display(abs), 'c-cyan') + (x.crcOk ? '' : span('c-red', '  (bad CRC!)')));
    }
  });

  // ------------------------------------------------------------ hashes
  function md5(bytes) {
    var K = [], S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
    var len = bytes.length, nb = ((len + 8) >>> 6) + 1, w = new Uint32Array(nb * 16);
    for (i = 0; i < len; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
    w[len >> 2] |= 0x80 << ((len % 4) * 8);
    w[nb * 16 - 2] = (len * 8) >>> 0; w[nb * 16 - 1] = Math.floor(len / 536870912);
    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (var blk = 0; blk < nb * 16; blk += 16) {
      var A = a0, B = b0, C = c0, D = d0;
      for (i = 0; i < 64; i++) {
        var F, g, r = i >> 4;
        if (r === 0) { F = (B & C) | (~B & D); g = i; }
        else if (r === 1) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (r === 2) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + w[blk + g]) >>> 0;
        A = D; D = C; C = B;
        var s = S[r * 4 + (i % 4)];
        B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    return [a0, b0, c0, d0].map(function (x) { var h = ''; for (var k = 0; k < 4; k++) h += LX.hex((x >>> (k * 8)) & 0xFF); return h; }).join('');
  }
  LX.sha = async function (algo, bytes) {
    if (!window.crypto || !crypto.subtle) throw new Error('webcrypto needs https (or localhost)');
    var h = new Uint8Array(await crypto.subtle.digest(algo, bytes));
    return Array.from(h, function (x) { return LX.hex(x); }).join('');
  };
  function hashCmd(algo) {
    return async function (ctx) {
      var files = ctx.args.length ? ctx.args : [null];
      for (var i = 0; i < files.length; i++) {
        var bytes, label = '-', node = null;
        if (files[i] === null) { if (ctx.stdin === null) return ctx.out.err(ctx.name + ': missing file operand'); bytes = new TextEncoder().encode(ctx.stdin); }
        else { var f = LX.open(ctx, files[i], ctx.name); if (!f) continue; bytes = await LX.fs.bytes(f.node); label = files[i]; node = f.node; }
        var h = algo === 'MD5' ? md5(bytes) : await LX.sha(algo, bytes);
        var known = node && (algo === 'MD5' ? node.md5 : algo === 'SHA-256' ? node.sha256 : null);
        if (ctx.piped || !known) ctx.out.text(h + '  ' + label);
        else ctx.out.html(esc(h + '  ' + label) + (known === h ? span('c-green', '  ✓ matches evidence log') : span('c-red', '  ✗ DOES NOT MATCH evidence log')));
      }
    };
  }
  def('md5sum', { cat: 'forensics', help: 'md5 hash (chain of custody)', usage: 'md5sum <file>' }, hashCmd('MD5'));
  def('sha1sum', { cat: 'forensics', help: 'sha1 hash', usage: 'sha1sum <file>' }, hashCmd('SHA-1'));
  def('sha256sum', { cat: 'forensics', help: 'sha256 hash (chain of custody)', usage: 'sha256sum <file>' }, hashCmd('SHA-256'));
  def('crc32', { cat: 'forensics', help: 'crc32 checksum', usage: 'crc32 <file>' }, async function (ctx) {
    var r = await LX.readBytes(ctx, ctx.args[0], 'crc32');
    if (r) ctx.out.text(LX.hex(LX.crc32(r.bytes), 8));
  });

  // ------------------------------------------------------------ encoders
  function bytesToText(b) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
    catch (e) { return new TextDecoder('latin1').decode(b); }
  }
  LX.bytesToText = bytesToText;
  LX.looksText = function (b) {
    for (var i = 0; i < Math.min(b.length, 4096); i++) if (b[i] < 9 || (b[i] > 13 && b[i] < 32)) return false;
    return true;
  };
  def('base64', { cat: 'text', help: 'encode / decode (-d) base64', usage: 'base64 [-d] [file|text]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'diw' });
    var s = await LX.readLoose(ctx, o.rest, 'base64');
    if (s === null) return;
    if (o.f.d) {
      var clean = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      while (clean.length % 4) clean += '=';
      var bin;
      try { bin = atob(clean); } catch (e) { return ctx.out.err('base64: invalid input'); }
      ctx.out.bytes(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }), 'base64 -d');
    } else {
      var u = new TextEncoder().encode(s.replace(/\n$/, ''));
      ctx.out.text(btoa(Array.from(u, function (c) { return String.fromCharCode(c); }).join('')));
    }
  });
  def('base32', { cat: 'text', help: 'encode / decode (-d) base32', usage: 'base32 [-d] [file|text]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'd' }), A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    var s = await LX.readLoose(ctx, o.rest, 'base32');
    if (s === null) return;
    if (o.f.d) {
      var bits = '', out = [];
      s.toUpperCase().replace(/[^A-Z2-7]/g, '').split('').forEach(function (c) { bits += A.indexOf(c).toString(2).padStart(5, '0'); });
      for (var i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
      ctx.out.text(bytesToText(new Uint8Array(out)));
    } else {
      var u = new TextEncoder().encode(s.replace(/\n$/, '')), b2 = '';
      u.forEach(function (x) { b2 += x.toString(2).padStart(8, '0'); });
      var r = '';
      for (var j = 0; j < b2.length; j += 5) r += A[parseInt(b2.slice(j, j + 5).padEnd(5, '0'), 2)];
      while (r.length % 8) r += '=';
      ctx.out.text(r);
    }
  });
  def('unhex', { cat: 'text', help: 'hex string back to text (same as xxd -r -p)', usage: 'unhex [hex|file]' }, async function (ctx) {
    var s = await LX.readLoose(ctx, ctx.args || [], 'unhex');
    if (s === null) return;
    var h = s.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
    if (h.length % 2) h = h.slice(0, -1);
    var out = new Uint8Array(h.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    ctx.out.bytes(out, 'unhex');
  });
  def('unbin', { cat: 'text', help: 'binary string (01000001...) back to text', usage: 'unbin [bits|file]' }, async function (ctx) {
    var s = await LX.readLoose(ctx, ctx.args || [], 'unbin');
    if (s === null) return;
    var bits = s.replace(/[^01]/g, ''), out = new Uint8Array(Math.floor(bits.length / 8));
    for (var i = 0; i < out.length; i++) out[i] = parseInt(bits.substr(i * 8, 8), 2);
    ctx.out.bytes(out, 'unbin');
  });
  def('rot13', { cat: 'text', help: 'the most secure encryption', usage: 'rot13 [text|file]' }, async function (ctx) {
    var s = await LX.readLoose(ctx, ctx.args, 'rot13');
    if (s === null) return;
    ctx.out.text(s.replace(/\n$/, '').replace(/[a-zA-Z]/g, function (c) { var b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); }));
  });
})();
