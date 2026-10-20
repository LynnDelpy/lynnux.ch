// netdisk.js :: tcpdump (pcap parser) and a tiny sleuth kit for FAT12/16 (fsstat, fls, icat)
'use strict';

(function () {
  var def = LX.def, esc = LX.esc, span = LX.span, B = LX.bin;

  // ------------------------------------------------------------ pcap
  function parsePcap(b) {
    var magic = B.le32(b, 0), le, nano = false;
    if (magic === 0xa1b2c3d4) le = true;
    else if (magic === 0xd4c3b2a1) le = false;
    else if (magic === 0xa1b23c4d) { le = true; nano = true; }
    else if (B.at(b, 0, [0x0A, 0x0D, 0x0D, 0x0A])) throw new Error('this is pcapng. download it and use wireshark/tshark, this tcpdump only reads classic pcap');
    else throw new Error('not a pcap file');
    var u32 = function (o) { return le ? B.le32(b, o) : B.be32(b, o); };
    var link = u32(20), o = 24, pkts = [];
    while (o + 16 <= b.length) {
      var ts = u32(o) + u32(o + 4) / (nano ? 1e9 : 1e6), incl = u32(o + 8), orig = u32(o + 12);
      if (o + 16 + incl > b.length) break;
      pkts.push({ ts: ts, data: b.subarray(o + 16, o + 16 + incl), orig: orig, link: link });
      o += 16 + incl;
    }
    return pkts;
  }
  function ipStr(b, o) { return b[o] + '.' + b[o + 1] + '.' + b[o + 2] + '.' + b[o + 3]; }
  function dnsName(b, o, base) {
    var parts = [], jumps = 0, end = -1;
    while (o < b.length && jumps < 20) {
      var l = b[o];
      if (l === 0) { o++; break; }
      if ((l & 0xC0) === 0xC0) { if (end < 0) end = o + 2; o = base + (((l & 0x3F) << 8) | b[o + 1]); jumps++; continue; }
      parts.push(B.str(b, o + 1, l)); o += 1 + l;
    }
    return { name: parts.join('.') + '.', next: end >= 0 ? end : o };
  }
  var QT = { 1: 'A', 2: 'NS', 5: 'CNAME', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 255: 'ANY' };
  function dnsSummary(b, o, len) {
    var id = B.be16(b, o), fl = B.be16(b, o + 2), qd = B.be16(b, o + 4), an = B.be16(b, o + 6), ns = B.be16(b, o + 8), ar = B.be16(b, o + 10);
    var p = o + 12, qs = [];
    for (var i = 0; i < qd; i++) { var q = dnsName(b, p, o); p = q.next; qs.push([q.name, QT[B.be16(b, p)] || B.be16(b, p)]); p += 4; }
    if (!(fl & 0x8000)) return id + (fl & 0x0100 ? '+' : '') + ' ' + qs.map(function (q) { return q[1] + '? ' + q[0]; }).join(' ') + ' (' + len + ')';
    var rcode = fl & 0xF, ans = [];
    for (i = 0; i < an && p < b.length; i++) {
      var n = dnsName(b, p, o); p = n.next;
      var t = B.be16(b, p), rdl = B.be16(b, p + 8), rd = p + 10;
      if (t === 1) ans.push('A ' + ipStr(b, rd));
      else if (t === 16) { var txt = [], k = rd; while (k < rd + rdl) { txt.push('"' + B.str(b, k + 1, b[k]) + '"'); k += 1 + b[k]; } ans.push('TXT ' + txt.join(' ')); }
      else if (t === 5) ans.push('CNAME ' + dnsName(b, rd, o).name);
      else ans.push(QT[t] || 'type' + t);
      p = rd + rdl;
    }
    return id + (rcode === 3 ? ' NXDomain' : rcode ? ' rcode' + rcode : '') + ' ' + an + '/' + ns + '/' + ar + (ans.length ? ' ' + ans.join(', ') : '') + ' (' + len + ')';
  }
  function tcpFlags(f) {
    var s = '';
    if (f & 0x02) s += 'S'; if (f & 0x01) s += 'F'; if (f & 0x04) s += 'R'; if (f & 0x08) s += 'P'; if (f & 0x20) s += 'U'; if (f & 0x10) s += '.';
    return s;
  }
  function decode(pk) {
    var b = pk.data, o = 0, r = { ts: pk.ts, len: pk.orig };
    if (pk.link === 1) { var et = B.be16(b, 12); o = 14; if (et === 0x8100) { et = B.be16(b, 16); o = 18; } if (et === 0x0806) { r.proto = 'ARP'; return r; } if (et !== 0x0800) { r.proto = 'ethertype 0x' + LX.hex(et, 4); return r; } }
    else if (pk.link !== 101) { r.proto = 'linktype ' + pk.link; return r; }
    if (b[o] >> 4 !== 4) { r.proto = 'IPv6 (not decoded)'; return r; }
    var ihl = (b[o] & 0xF) * 4, tot = B.be16(b, o + 2), proto = b[o + 9];
    r.src = ipStr(b, o + 12); r.dst = ipStr(b, o + 16);
    var l4 = o + ihl, end = Math.min(b.length, o + tot);
    if (proto === 17) {
      r.proto = 'udp'; r.sport = B.be16(b, l4); r.dport = B.be16(b, l4 + 2);
      r.payload = b.subarray(l4 + 8, end);
      if (r.sport === 53 || r.dport === 53) { try { r.info = dnsSummary(b, l4 + 8, end - l4 - 8); } catch (e) { r.info = 'DNS (malformed)'; } }
      else r.info = 'UDP, length ' + r.payload.length;
    } else if (proto === 6) {
      r.proto = 'tcp'; r.sport = B.be16(b, l4); r.dport = B.be16(b, l4 + 2);
      var seq = B.be32(b, l4 + 4), ack = B.be32(b, l4 + 8), doff = (b[l4 + 12] >> 4) * 4, fl = b[l4 + 13], win = B.be16(b, l4 + 14);
      r.payload = b.subarray(l4 + doff, end);
      r.info = 'Flags [' + tcpFlags(fl) + '], seq ' + seq + (r.payload.length ? ':' + (seq + r.payload.length) : '') + (fl & 0x10 ? ', ack ' + ack : '') + ', win ' + win + ', length ' + r.payload.length;
      if (r.payload.length && (r.sport === 80 || r.dport === 80)) r.info += ': HTTP: ' + B.str(r.payload, 0, 200).split('\r\n')[0];
    } else if (proto === 1) { r.proto = 'icmp'; r.info = 'ICMP type ' + b[l4] + ', length ' + (end - l4); r.payload = b.subarray(l4, end); }
    else { r.proto = 'ip-proto-' + proto; r.info = 'length ' + (end - l4); }
    return r;
  }
  // tiny bpf-ish filter: "udp", "tcp", "port 53", "host 1.2.3.4", "src/dst host x", joined by "and"
  function makeFilter(words) {
    var preds = [], i = 0;
    while (i < words.length) {
      var w = words[i++];
      if (w === 'and' || w === '&&') continue;
      var not = false;
      if (w === 'not' || w === '!') { not = true; w = words[i++]; }
      var p;
      if (w === 'udp' || w === 'tcp' || w === 'icmp') p = (function (pr) { return function (r) { return r.proto === pr; }; })(w);
      else if (w === 'port') p = (function (n) { return function (r) { return r.sport === n || r.dport === n; }; })(+words[i++]);
      else if (w === 'host') p = (function (h) { return function (r) { return r.src === h || r.dst === h; }; })(words[i++]);
      else if (w === 'src' || w === 'dst') {
        var kind = words[i++], val = words[i++], side = w;
        p = kind === 'port' ? function (r) { return (side === 'src' ? r.sport : r.dport) === +val; } : function (r) { return (side === 'src' ? r.src : r.dst) === val; };
      } else throw new Error("can't parse filter expression near '" + w + "' (supported: tcp udp icmp port N host IP src/dst host|port X, and, not)");
      preds.push(not ? (function (q) { return function (r) { return !q(r); }; })(p) : p);
    }
    return function (r) { return preds.every(function (q) { return q(r); }); };
  }
  function tstamp(t) {
    var d = new Date(t * 1000);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ':' + String(d.getUTCSeconds()).padStart(2, '0') + '.' + String(Math.floor((t % 1) * 1e6)).padStart(6, '0');
  }
  def('tcpdump', { cat: 'netdisk', help: 'read a packet capture (supports simple filters, -A payload, -X hex)', usage: 'tcpdump -r <pcap> [-c N] [-A|-X] [filter]   e.g. tcpdump -r capture.pcap port 53' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'nAXqtv', vals: 'rc' });
    if (!o.v.r) return ctx.out.err('tcpdump: this box has no network interfaces to sniff (it is a website). read a capture: tcpdump -r <file.pcap>');
    var f = LX.open(ctx, o.v.r, 'tcpdump');
    if (!f) return;
    var pkts, filt;
    try { pkts = parsePcap(await LX.fs.bytes(f.node)); filt = makeFilter(o.rest); } catch (e) { return ctx.out.err('tcpdump: ' + e.message); }
    var max = o.v.c ? LX.num(o.v.c) : Infinity, shown = 0;
    if (!ctx.piped) ctx.out.text('reading from file ' + o.v.r + ', link-type EN10MB (Ethernet), snapshot length 65535', 'c-dim');
    for (var i = 0; i < pkts.length && shown < max; i++) {
      var r = decode(pkts[i]);
      if (!filt(r)) continue;
      shown++;
      var head = (o.f.t ? '' : tstamp(r.ts) + ' ');
      var line = r.src ? 'IP ' + r.src + (r.sport !== undefined ? '.' + r.sport : '') + ' > ' + r.dst + (r.dport !== undefined ? '.' + r.dport : '') + ': ' + (r.info || '') : r.proto;
      if (ctx.piped || !r.src) ctx.out.text(head + line, ctx.piped ? '' : 'c-dim');
      else {
        var cls = r.proto === 'udp' ? 'c-cyan' : r.proto === 'tcp' ? 'c-blue' : 'c-dim';
        ctx.out.html(span('c-dim', head) + span(cls, 'IP ') + esc(line.slice(3)));
      }
      if ((o.f.A || o.f.X) && r.payload && r.payload.length) {
        if (o.f.A) ctx.out.text(Array.from(r.payload, function (c) { return c === 10 || (c >= 32 && c < 127) ? String.fromCharCode(c) : c === 13 ? '' : '.'; }).join(''), 'c-green');
        else {
          var lines = [];
          for (var k = 0; k < r.payload.length; k += 16) {
            var row = r.payload.subarray(k, k + 16), hx = '';
            for (var j = 0; j < 16; j++) hx += (j < row.length ? LX.hex(row[j]) : '  ') + (j % 2 ? ' ' : '');
            lines.push('\t0x' + LX.hex(k, 4) + ':  ' + hx + ' ' + Array.from(row, function (c) { return c >= 32 && c < 127 ? String.fromCharCode(c) : '.'; }).join(''));
          }
          ctx.out.text(lines.join('\n'), ctx.piped ? '' : 'c-dim');
        }
      }
    }
    if (!ctx.piped) ctx.out.text(shown + ' packet' + (shown === 1 ? '' : 's') + ' shown (' + pkts.length + ' in file)', 'c-dim');
  });
  def('tshark', { cat: 'netdisk', hidden: true }, function (ctx) { ctx.out.html(span('c-dim', 'no tshark here, but tcpdump works: ') + LX.cmdLink('help tcpdump', 'help tcpdump', 'c-amber') + span('c-dim', '. or download the pcap and open it in wireshark.')); });
  LX.cmds.wireshark = LX.cmds.tshark;

  // ------------------------------------------------------------ FAT (a pocket sleuth kit)
  function fatOpen(b) {
    if (b[510] !== 0x55 || b[511] !== 0xAA) throw new Error('no boot signature, not a FAT volume (or there is a partition table: try mmls)');
    var v = { b: b, bps: B.le16(b, 11), spc: b[13], res: B.le16(b, 14), nfats: b[16], rootEnt: B.le16(b, 17), tot: B.le16(b, 19) || B.le32(b, 32), media: b[21], spf: B.le16(b, 22) };
    if (!v.bps || !v.spc || !v.spf) throw new Error('this does not look like FAT12/16 (FAT32/exFAT/NTFS: download it and use the real sleuth kit)');
    v.rootSec = v.res + v.nfats * v.spf;
    v.rootSecs = Math.ceil(v.rootEnt * 32 / v.bps);
    v.dataSec = v.rootSec + v.rootSecs;
    v.clusters = Math.floor((v.tot - v.dataSec) / v.spc);
    v.type = v.clusters < 4085 ? 12 : 16;
    v.csize = v.bps * v.spc;
    v.label = B.str(b, 43, 11).trim(); v.serial = B.le32(b, 39); v.oem = B.str(b, 3, 8); v.fslabel = B.str(b, 54, 8);
    v.lastInum = (v.tot - v.rootSec) * (v.bps / 32) + 3; // same numbering as the sleuth kit
    return v;
  }
  function fatEntry(v, n) {
    var off = v.res * v.bps;
    if (v.type === 12) { var o = off + Math.floor(n * 1.5); return n & 1 ? (v.b[o] >> 4) | (v.b[o + 1] << 4) : v.b[o] | ((v.b[o + 1] & 0x0F) << 8); }
    return B.le16(v.b, off + n * 2);
  }
  function clusterOff(v, c) { return (v.dataSec + (c - 2) * v.spc) * v.bps; }
  function chain(v, start) {
    var out = [], c = start, eoc = v.type === 12 ? 0xFF8 : 0xFFF8;
    while (c >= 2 && c < eoc && out.length < v.clusters + 2) { out.push(c); c = fatEntry(v, c); if (!c) break; }
    return out;
  }
  function name83(b, o) {
    var base = B.str(b, o, 8).replace(/ +$/, ''), ext = B.str(b, o + 8, 3).replace(/ +$/, '');
    if (b[o] === 0xE5) base = '_' + base.slice(1);
    if (b[o] === 0x05) base = 'å' + base.slice(1);
    return base + (ext ? '.' + ext : '');
  }
  function fatDate(b, o) {
    var t = B.le16(b, o), d = B.le16(b, o + 2);
    if (!d) return '0000-00-00 00:00:00';
    var p2 = function (x) { return String(x).padStart(2, '0'); };
    return (1980 + (d >> 9)) + '-' + p2((d >> 5) & 15) + '-' + p2(d & 31) + ' ' + p2(t >> 11) + ':' + p2((t >> 5) & 63) + ':' + p2((t & 31) * 2);
  }
  // read the 32-byte entries of a directory region. inode = byte offset from root dir start / 32 + 3
  function readDir(v, regions) {
    var out = [];
    for (var r = 0; r < regions.length; r++) {
      for (var o = regions[r][0]; o < regions[r][1]; o += 32) {
        var b0 = v.b[o];
        if (b0 === 0) return out;
        var attr = v.b[o + 11];
        if (attr === 0x0F) continue; // long file name piece
        var nm = name83(v.b, o);
        if (nm === '.' || nm === '..') continue;
        out.push({
          inode: (o - v.rootSec * v.bps) / 32 + 3, off: o, name: nm, attr: attr, deleted: b0 === 0xE5,
          dir: !!(attr & 0x10), label: !!(attr & 0x08) && !(attr & 0x10), start: B.le16(v.b, o + 26), size: B.le32(v.b, o + 28),
          mtime: fatDate(v.b, o + 22)
        });
      }
    }
    return out;
  }
  function rootRegions(v) { return [[v.rootSec * v.bps, v.dataSec * v.bps]]; }
  function dirRegions(v, e) {
    var cl = e.deleted ? [e.start] : chain(v, e.start);
    return cl.map(function (c) { return [clusterOff(v, c), clusterOff(v, c) + v.csize]; });
  }
  function entryByInode(v, inode) {
    var o = v.rootSec * v.bps + (inode - 3) * 32;
    if (inode < 3 || o + 32 > v.b.length) return null;
    var nm = name83(v.b, o), attr = v.b[o + 11];
    return { inode: inode, name: nm, attr: attr, deleted: v.b[o] === 0xE5, dir: !!(attr & 0x10), start: B.le16(v.b, o + 26), size: B.le32(v.b, o + 28), empty: v.b[o] === 0 };
  }
  async function fatFromArg(ctx, path, cmd) {
    var f = LX.open(ctx, path, cmd);
    if (!f) return null;
    try { return { v: fatOpen(await LX.fs.bytes(f.node)), f: f }; } catch (e) { ctx.out.err(cmd + ': ' + e.message); return null; }
  }

  def('fsstat', { cat: 'netdisk', help: 'file system details of a disk image', usage: 'fsstat <image>' }, async function (ctx) {
    var r = await fatFromArg(ctx, ctx.args[0], 'fsstat');
    if (!r) return;
    var v = r.v, rootLabel = readDir(v, rootRegions(v)).filter(function (e) { return e.label && !e.deleted; })[0];
    ctx.out.text([
      'FILE SYSTEM INFORMATION', '--------------------------------------------', 'File System Type: FAT' + v.type, '',
      'OEM Name: ' + v.oem, 'Volume ID: 0x' + v.serial.toString(16), 'Volume Label (Boot Sector): ' + v.label,
      'Volume Label (Root Directory): ' + (rootLabel ? rootLabel.name.replace('.', '') : ''), 'File System Type Label: ' + v.fslabel, '',
      'File System Layout (in sectors)', 'Total Range: 0 - ' + (v.tot - 1), '* Reserved: 0 - ' + (v.res - 1), '** Boot Sector: 0',
      '* FAT 0: ' + v.res + ' - ' + (v.res + v.spf - 1), v.nfats > 1 ? '* FAT 1: ' + (v.res + v.spf) + ' - ' + (v.res + 2 * v.spf - 1) : '',
      '* Data Area: ' + v.rootSec + ' - ' + (v.tot - 1), '** Root Directory: ' + v.rootSec + ' - ' + (v.dataSec - 1),
      '** Cluster Area: ' + v.dataSec + ' - ' + (v.tot - 1), '', 'METADATA INFORMATION', '--------------------------------------------',
      'Range: 2 - ' + (v.lastInum + 3), 'Root Directory: 2', '', 'CONTENT INFORMATION', '--------------------------------------------',
      'Sector Size: ' + v.bps, 'Cluster Size: ' + v.csize, 'Total Cluster Range: 2 - ' + (v.clusters + 1)
    ].filter(function (l, i, a) { return l !== '' || a[i - 1] !== ''; }).join('\n'));
  });

  def('fls', { cat: 'netdisk', help: 'list files in a disk image, deleted ones too (*)', usage: 'fls [-r] [-d] [-l] <image> [dir-inode]' }, async function (ctx) {
    var o = LX.opts(ctx.args, { flags: 'rdlpu' });
    var r = await fatFromArg(ctx, o.rest[0], 'fls');
    if (!r) return;
    var v = r.v, startInode = o.rest[1] ? LX.num(o.rest[1]) : 2, regions;
    if (startInode === 2) regions = rootRegions(v);
    else { var de = entryByInode(v, startInode); if (!de || !de.dir) return ctx.out.err('fls: inode ' + startInode + ' is not a directory'); regions = dirRegions(v, de); }
    var any = false;
    (function walk(regs, depth, path) {
      readDir(v, regs).forEach(function (e) {
        var show = (!o.f.d || e.deleted) && (!o.f.u || !e.deleted);
        var t = e.dir ? 'd/d' : 'r/r';
        var nm = e.label ? e.name.replace('.', '') + ' (Volume Label Entry)' : (o.f.p ? path : '') + e.name;
        if (show) {
          any = true;
          var pre = '+'.repeat(depth) + (depth ? ' ' : '') + t + (e.deleted ? ' * ' : ' ') + e.inode + ':';
          var extra = o.f.l ? '\t' + e.mtime + '\t' + e.size : '';
          if (ctx.piped) ctx.out.text(pre + '\t' + nm + extra);
          else ctx.out.html(esc(LX.pad(pre, 16)) + (e.deleted ? span('c-red', nm) : e.dir ? span('c-cyan', nm) : esc(nm)) + span('c-dim', extra) +
            (!e.dir && !e.label ? ' ' + LX.cmdLink('icat ' + LX.quote(o.rest[0]) + ' ' + e.inode, '[icat]', 'c-faint') : ''));
        }
        if (e.dir && o.f.r && !e.deleted) walk(dirRegions(v, e), depth + 1, path + e.name + '/');
      });
    })(regions, 0, '');
    if (startInode === 2 && !o.f.d && !o.f.u) {
      // the sleuth kit adds these virtual entries after the last real inode
      var virt = ['$MBR'];
      for (var k = 1; k <= v.nfats; k++) virt.push('$FAT' + k);
      virt.push('$OrphanFiles');
      virt.forEach(function (n, i) {
        var pre = (n === '$OrphanFiles' ? 'V/V ' : 'v/v ') + (v.lastInum + i) + ':';
        ctx.out.text(ctx.piped ? pre + '\t' + n : LX.pad(pre, 16) + n, ctx.piped ? '' : 'c-dim');
      });
    }
    if (!any && o.f.d) ctx.out.text('(no deleted entries in this directory)', 'c-dim');
  });

  def('icat', { cat: 'netdisk', help: 'pull a file out of a disk image by inode (works on deleted files)', usage: 'icat <image> <inode>   e.g. icat usb.img 4 > out.txt' }, async function (ctx) {
    var r = await fatFromArg(ctx, ctx.args[0], 'icat');
    if (!r) return;
    if (ctx.args[1] === undefined) return ctx.out.err('icat: missing inode. get them from: fls ' + ctx.args[0]);
    var v = r.v, e = entryByInode(v, LX.num(ctx.args[1]));
    if (!e || e.empty) return ctx.out.err('icat: inode ' + ctx.args[1] + ' is not allocated to anything');
    if (e.dir) return ctx.out.err('icat: inode ' + e.inode + ' is a directory. try: fls ' + ctx.args[0] + ' ' + e.inode);
    if (e.attr & 0x08) return ctx.out.err('icat: that is the volume label, it has no content');
    var clusters;
    if (!e.deleted) clusters = chain(v, e.start);
    else {
      // deleted: the FAT chain is gone, so do what TSK does and assume the clusters were contiguous
      var n = Math.ceil(e.size / v.csize); clusters = [];
      for (var i = 0; i < n; i++) clusters.push(e.start + i);
    }
    var out = new Uint8Array(e.size), got = 0;
    for (i = 0; i < clusters.length && got < e.size; i++) {
      var off = clusterOff(v, clusters[i]), take = Math.min(v.csize, e.size - got);
      out.set(v.b.subarray(off, off + take), got); got += take;
    }
    if (ctx.piped) return ctx.out.bytes(out);
    var looksText = true;
    for (i = 0; i < Math.min(out.length, 2048); i++) if (out[i] < 9 || (out[i] > 13 && out[i] < 32)) { looksText = false; break; }
    if (looksText) return ctx.out.text(LX.bytesToText(out).replace(/\r/g, '').replace(/\n$/, ''));
    var ext = (e.name.split('.')[1] || 'bin').toLowerCase();
    var suggestion = 'recovered_' + e.inode + '.' + ext;
    ctx.out.html(span('c-dim', '[' + out.length + ' bytes: ' + LX.magic(out).split(',').slice(0, 2).join(',') + '] that is binary, write it to a file: ') +
      LX.cmdLink('icat ' + LX.quote(ctx.args[0]) + ' ' + e.inode + ' > ' + (LX.fs.writable(LX.fs.cwd) ? '' : '~/work/') + suggestion, 'icat ' + ctx.args[0] + ' ' + e.inode + ' > ' + (LX.fs.writable(LX.fs.cwd) ? '' : '~/work/') + suggestion, 'c-amber'));
  });

  def('mmls', { cat: 'netdisk', help: 'partition table of a disk image', usage: 'mmls <image>' }, async function (ctx) {
    var f = LX.open(ctx, ctx.args[0], 'mmls');
    if (!f) return;
    var b = await LX.fs.bytes(f.node);
    if (/FAT1[26]/.test(B.str(b, 54, 8))) return ctx.out.text('mmls: no partition table, this is a bare file system (the boot sector is a FAT one). go straight to fsstat / fls.', 'c-dim');
    ctx.out.err('mmls: cannot determine partition type');
  });
})();
