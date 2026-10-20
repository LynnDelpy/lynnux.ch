#!/usr/bin/env python3
"""
build_evidence.py - generates every challenge artifact (flag prefix from site.env)

    python3 tools/build_evidence.py            # build with flags from flags.json
    python3 tools/build_evidence.py --new      # roll fresh flags (new random suffixes)

Plaintext flags live ONLY in flags.json (gitignored) and inside the evidence
files themselves. The website gets nothing but sha256 hashes via
js/evidence.gen.js, so reading the JS does not leak a single flag.

needs: python3, pillow, numpy
"""
import hashlib, io, json, math, os, random, secrets, struct, sys, zipfile, zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVID = os.path.join(ROOT, 'evidence')
FLAGS_PATH = os.path.join(ROOT, 'flags.json')
GEN_JS = os.path.join(ROOT, 'js', 'evidence.gen.js')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from siteenv import load as load_env  # noqa: E402

# the flag prefix comes from site.env (FLAG_PREFIX), so a fork gets its own flags
FLAG_PREFIX = load_env().get('FLAG_PREFIX', '').strip() or 'flag'

# flag bodies. a random 4 hex suffix gets appended so nobody can guess them.
# visual flags (002, 005, 006) avoid 0/o and 1/l lookalikes on purpose.
FLAG_BODIES = {
    '001': '3x1f_n3v3r_f0rg3ts_%s',
    '002': 'bit_planes_tell_tales_%s',
    '003': 'c4rv3d_r1ght_0ut_0f_th3_jp3g_%s',
    '004': 'dns_tunn3ls_l34v3_crumbs_%s',
    '005': 'deleted_is_not_gone_%s',
    '006': 'look_at_the_sound_%s',
    '007': 'z3r0_w1dth_but_n0t_z3r0_1nf0_%s',
}
HEX_SAFE = '23456789abcdef'  # no 0/1, so visual flags stay readable


def load_flags(new=False):
    flags = {}
    if os.path.exists(FLAGS_PATH) and not new:
        with open(FLAGS_PATH) as f:
            flags = json.load(f)
    changed = False
    for k, body in FLAG_BODIES.items():
        # missing, or made with another FLAG_PREFIX: roll a fresh one
        if k not in flags or not flags[k].startswith(FLAG_PREFIX + '{'):
            if k in flags:
                print('[*] flag %s used another prefix, rolling a new %s{...} one' % (k, FLAG_PREFIX))
            flags[k] = FLAG_PREFIX + '{' + body % ''.join(secrets.choice(HEX_SAFE) for _ in range(4)) + '}'
            changed = True
    if changed:
        with open(FLAGS_PATH, 'w') as f:
            json.dump(flags, f, indent=2)
        print('[*] wrote', FLAGS_PATH, '(keep it safe, never commit it)')
    return flags


def font(size, bold=True):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf' if bold else
              '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
              '/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf',  # arch path
              '/usr/share/fonts/TTF/DejaVuSansMono.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def text_mask(text, size, pad=10):
    """render text into a boolean numpy mask, tightly cropped + padding"""
    f = font(size)
    l, t, r, b = f.getbbox(text)
    im = Image.new('L', (r - l + pad * 2, b - t + pad * 2), 0)
    ImageDraw.Draw(im).text((pad - l, pad - t), text, font=f, fill=255)
    return np.array(im) > 127


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)
    print('[+] %-40s %8d bytes' % (os.path.relpath(path, ROOT), len(data)))


# ---------------------------------------------------------------- scenery
def fbm(w, h, rng, octaves=5):
    """cheap fractal value noise, 0..1"""
    out = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gw, gh = 2 + (4 << o), 2 + (3 << o)
        grid = rng.random((gh, gw))
        im = Image.fromarray((grid * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += np.asarray(im, dtype=float) / 255 * amp
        tot += amp
        amp *= 0.5
    return out / tot


def mountains(w, h, seed, sky_top, sky_bot, ridge_cols, sun=None):
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, h)[:, None]
    img = np.zeros((h, w, 3))
    for c in range(3):
        img[:, :, c] = sky_top[c] * (1 - y) + sky_bot[c] * y
    if sun:
        sx, sy, sr = sun
        yy, xx = np.mgrid[0:h, 0:w]
        d = np.sqrt((xx - sx) ** 2 + (yy - sy) ** 2)
        glow = np.clip(1 - d / (sr * 4), 0, 1) ** 2
        img += glow[:, :, None] * np.array([255, 170, 90]) * 0.6
        img[d < sr] = [255, 220, 160]
    # stars on the darker part of the sky
    for _ in range(140):
        sx, sy = rng.integers(0, w), rng.integers(0, int(h * 0.45))
        img[sy, sx] = np.clip(img[sy, sx] + rng.integers(60, 200), 0, 255)
    xs = np.arange(w)
    for i, col in enumerate(ridge_cols):
        base = h * (0.42 + 0.13 * i)
        ridge = np.zeros(w)
        for k in range(1, 7):
            ridge += np.sin(xs / w * math.pi * (k * 1.7 + i) + rng.random() * 6) * (h * 0.09 / k)
        ridge += rng.normal(0, 1.2, w).cumsum() * 0.6
        ridge = base - ridge
        for x in range(w):
            top = int(max(0, min(h, ridge[x])))
            shade = np.linspace(1.0, 0.75, h - top)[:, None] if h - top > 0 else 0
            img[top:, x] = np.array(col) * shade
    tex = fbm(w, h, rng, 6)
    img = img * (0.88 + tex[:, :, None] * 0.24)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


# ---------------------------------------------------------------- 001 exif
def tiff_ifd(entries, start, next_ifd=0):
    """serialize one little-endian IFD. entries = [(tag, type, count, raw_bytes)]"""
    entries = sorted(entries)
    size = 2 + 12 * len(entries) + 4
    head, data = struct.pack('<H', len(entries)), b''
    for tag, typ, count, val in entries:
        if len(val) <= 4:
            head += struct.pack('<HHI', tag, typ, count) + val.ljust(4, b'\0')
        else:
            head += struct.pack('<HHII', tag, typ, count, start + size + len(data))
            data += val + (b'\0' if len(val) % 2 else b'')
    return head + struct.pack('<I', next_ifd) + data


def asc(tag, s):
    b = s.encode() + b'\0'
    return (tag, 2, len(b), b)


def rat(tag, *pairs):
    return (tag, 5, len(pairs), b''.join(struct.pack('<II', a, b) for a, b in pairs))


def build_exif(flag):
    b64 = __import__('base64').b64encode(flag.encode()).decode()
    ifd0 = [asc(0x010E, 'postcard from bern. 1. august fireworks, wish you were here'),
            asc(0x010F, 'Lynnux Optics'),
            asc(0x0110, 'CaseCam 9000'),
            asc(0x0131, 'GIMP 2.10.38'),
            asc(0x0132, '2025:08:01 21:47:13'),
            asc(0x013B, 'suspect_47'),
            asc(0x8298, '(c) suspect_47. definitely nothing hidden in here'),
            (0x0112, 3, 1, struct.pack('<H', 1))]
    exif = [asc(0x9003, '2025:08:01 21:47:13'),
            (0x9000, 7, 4, b'0232'),
            (0x9286, 7, 8 + len(b64), b'ASCII\0\0\0' + b64.encode())]  # UserComment
    gps = [(0x0000, 1, 4, bytes([2, 3, 0, 0])),
           asc(0x0001, 'N'), rat(0x0002, (46, 1), (56, 1), (4794, 100)),   # Bundeshaus, Bern
           asc(0x0003, 'E'), rat(0x0004, (7, 1), (26, 1), (3864, 100))]
    ptr = lambda tag, off: (tag, 4, 1, struct.pack('<I', off))
    # pass 1 measures, pass 2 patches the sub-IFD pointers
    l0 = len(tiff_ifd(ifd0 + [ptr(0x8769, 0), ptr(0x8825, 0)], 8))
    exif_off = 8 + l0
    eb = tiff_ifd(exif, exif_off)
    gps_off = exif_off + len(eb)
    gb = tiff_ifd(gps, gps_off)
    i0 = tiff_ifd(ifd0 + [ptr(0x8769, exif_off), ptr(0x8825, gps_off)], 8)
    tiff = b'II*\0' + struct.pack('<I', 8) + i0 + eb + gb
    return b'Exif\0\0' + tiff


def insert_app1(jpeg, payload):
    seg = b'\xff\xe1' + struct.pack('>H', len(payload) + 2) + payload
    # put it right after the JFIF APP0 if there is one, else right after SOI
    pos = 2
    if jpeg[2:4] == b'\xff\xe0':
        pos = 4 + struct.unpack('>H', jpeg[4:6])[0]
    return jpeg[:pos] + seg + jpeg[pos:]


def case_001(flag):
    im = mountains(800, 500, 47, (12, 14, 40), (210, 110, 70),
                   [(70, 60, 90), (45, 40, 60), (22, 22, 30)], sun=(560, 300, 26))
    d = ImageDraw.Draw(im)
    rng = random.Random(1)
    for _ in range(5):  # fireworks
        cx, cy = rng.randint(80, 720), rng.randint(40, 180)
        col = rng.choice([(255, 80, 80), (255, 210, 90), (250, 250, 250)])
        for a in range(0, 360, 15):
            r = rng.randint(18, 34)
            d.line([cx, cy, cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))], fill=col)
    bio = io.BytesIO()
    im.save(bio, 'JPEG', quality=86, comment=b'saved for web')
    write(os.path.join(EVID, 'case-001', 'postcard.jpg'), insert_app1(bio.getvalue(), build_exif(flag)))


# ---------------------------------------------------------------- 002 bitplanes
def case_002(flag):
    w, h = 640, 400
    rng = np.random.default_rng(2)
    n1, n2, n3 = fbm(w, h, rng, 7), fbm(w, h, rng, 7), fbm(w, h, rng, 4)
    img = np.zeros((h, w, 3))
    img[:, :, 0] = 20 + 160 * n1 ** 2 + 60 * n3
    img[:, :, 1] = 10 + 70 * n2 * n1
    img[:, :, 2] = 40 + 200 * n2 ** 1.5
    for _ in range(400):
        y, x = rng.integers(0, h), rng.integers(0, w)
        img[y, x] = 255
    img = np.clip(img, 0, 255).astype(np.uint8)

    def stamp(plane_bit_channel, text, size, y0):
        m = text_mask(text, size)
        mh, mw = m.shape
        x0 = (w - mw) // 2
        ch = img[y0:y0 + mh, x0:x0 + mw, plane_bit_channel]
        img[y0:y0 + mh, x0:x0 + mw, plane_bit_channel] = (ch & 0xFE) | m.astype(np.uint8)

    # clear the LSB of red + blue first so the hidden plane is clean
    img[:, :, 0] &= 0xFE
    img[:, :, 2] &= 0xFE
    stamp(0, 'nope. not this one :)', 34, 60)            # red 0: decoy
    stamp(0, 'try another colour', 24, 120)
    stamp(2, flag, 22, 170)                               # blue 0: the flag
    stamp(2, '~ evidence tag LX-002 ~', 18, 220)
    meta = PngInfo()
    meta.add_text('Title', 'nebula_final_FINAL(2).png')
    meta.add_text('Comment', 'the truth is in the details, and the details are in the bits')
    bio = io.BytesIO()
    Image.fromarray(img).save(bio, 'PNG', pnginfo=meta, optimize=True)
    write(os.path.join(EVID, 'case-002', 'nebula.png'), bio.getvalue())


# ---------------------------------------------------------------- 003 carving
def case_003(flag):
    im = mountains(720, 480, 303, (60, 110, 170), (190, 210, 220),
                   [(90, 100, 110), (60, 80, 70), (35, 60, 45)], sun=(140, 90, 20))
    arr = np.asarray(im).copy()
    arr[400:, :] = (arr[400:, :] * np.array([0.45, 0.6, 0.85])).astype(np.uint8)  # a lake
    bio = io.BytesIO()
    Image.fromarray(arr).save(bio, 'JPEG', quality=84)
    jpg = bio.getvalue()
    zbio = io.BytesIO()
    zbio.write(jpg)
    with zipfile.ZipFile(zbio, 'a', zipfile.ZIP_DEFLATED) as z:
        info = lambda n: zipfile.ZipInfo(n, date_time=(2025, 7, 30, 23, 12, 4))
        z.writestr(info('itinerary.txt'),
                   'day 1  zurich hb, 07:32 to bern\n'
                   'day 2  "sightseeing" (do NOT bring the laptop)\n'
                   'day 3  drop-off at the usual spot, aare bank, 3rd bench\n'
                   'day 4  delete everything. EVERYTHING.\n', zipfile.ZIP_DEFLATED)
        z.writestr(info('flag.txt'),
                   'if you are reading this, you carved me out of a jpeg.\n'
                   'nice work. here is your evidence tag:\n\n'
                   '    ' + flag + '\n\n'
                   'tip: real photos end at FF D9. anything after that is a story.\n',
                   zipfile.ZIP_DEFLATED)
    data = zbio.getvalue()
    assert flag.encode() not in data, 'flag leaked in plaintext, deflate did not kick in?'
    write(os.path.join(EVID, 'case-003', 'lake.jpg'), data)


# ---------------------------------------------------------------- 004 dns exfil
def csum(b):
    if len(b) % 2:
        b += b'\0'
    s = sum(struct.unpack('!%dH' % (len(b) // 2), b))
    while s >> 16:
        s = (s & 0xFFFF) + (s >> 16)
    return ~s & 0xFFFF


def ip4(s):
    return bytes(int(x) for x in s.split('.'))


class Pcap:
    def __init__(self):
        self.pkts = []
        self.ipid = 0x1a2b

    def eth_ip(self, t, src, dst, proto, payload, smac, dmac):
        self.ipid = (self.ipid + 1) & 0xFFFF
        hdr = struct.pack('!BBHHHBBH4s4s', 0x45, 0, 20 + len(payload), self.ipid, 0x4000, 64, proto, 0,
                          ip4(src), ip4(dst))
        hdr = hdr[:10] + struct.pack('!H', csum(hdr)) + hdr[12:]
        self.pkts.append((t, dmac + smac + b'\x08\x00' + hdr + payload))

    def udp(self, t, src, sport, dst, dport, data, smac, dmac):
        u = struct.pack('!HHHH', sport, dport, 8 + len(data), 0) + data
        pseudo = ip4(src) + ip4(dst) + struct.pack('!BBH', 0, 17, len(u))
        c = csum(pseudo + u) or 0xFFFF
        u = u[:6] + struct.pack('!H', c) + u[8:]
        self.eth_ip(t, src, dst, 17, u, smac, dmac)

    def tcp(self, t, src, sport, dst, dport, seq, ack, flags, data, smac, dmac):
        h = struct.pack('!HHIIBBHHH', sport, dport, seq, ack, 5 << 4, flags, 64240, 0, 0)
        pseudo = ip4(src) + ip4(dst) + struct.pack('!BBH', 0, 6, len(h) + len(data))
        c = csum(pseudo + h + data)
        h = h[:16] + struct.pack('!H', c) + h[18:]
        self.eth_ip(t, src, dst, 6, h + data, smac, dmac)

    def bytes(self):
        out = struct.pack('<IHHiIII', 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1)
        for t, p in sorted(self.pkts, key=lambda x: x[0]):
            out += struct.pack('<IIII', int(t), int((t % 1) * 1e6), len(p), len(p)) + p
        return out


def qname(n):
    return b''.join(bytes([len(p)]) + p.encode() for p in n.rstrip('.').split('.')) + b'\0'


def dns_query(qid, name, qtype):
    return struct.pack('!HHHHHH', qid, 0x0100, 1, 0, 0, 0) + qname(name) + struct.pack('!HH', qtype, 1)


def dns_answer(qid, name, qtype, rdata_list, rcode=0):
    hdr = struct.pack('!HHHHHH', qid, 0x8180 | rcode, 1, len(rdata_list), 0, 0)
    q = qname(name) + struct.pack('!HH', qtype, 1)
    ans = b''
    for rd in rdata_list:
        ans += b'\xc0\x0c' + struct.pack('!HHIH', qtype, 1, 300, len(rd)) + rd
    return hdr + q + ans


def case_004(flag):
    rng = random.Random(404)
    me, dns, gw_mac, my_mac = '192.168.1.37', '9.9.9.9', bytes.fromhex('a0b1c2d3e4f5'), bytes.fromhex('3c7c3f4a1137')
    p = Pcap()
    t0 = 1754084833.0  # 2025-08-01
    t = t0

    def lookup(name, ips, qtype=1):
        nonlocal t
        qid, sport = rng.randint(1, 65535), rng.randint(40000, 60000)
        p.udp(t, me, sport, dns, 53, dns_query(qid, name, qtype), my_mac, gw_mac)
        rd = [ip4(i) for i in ips] if qtype == 1 else ips
        p.udp(t + rng.uniform(0.008, 0.03), dns, 53, me, sport, dns_answer(qid, name, qtype, rd), gw_mac, my_mac)
        t += rng.uniform(0.05, 0.9)

    def handshake(dst, dport):
        nonlocal t
        sp, isn, risn = rng.randint(40000, 60000), rng.randint(0, 2**32 - 1), rng.randint(0, 2**32 - 1)
        p.tcp(t, me, sp, dst, dport, isn, 0, 0x02, b'', my_mac, gw_mac)
        p.tcp(t + 0.02, dst, dport, me, sp, risn, isn + 1, 0x12, b'', gw_mac, my_mac)
        p.tcp(t + 0.021, me, sp, dst, dport, isn + 1, risn + 1, 0x10, b'', my_mac, gw_mac)
        t += rng.uniform(0.1, 0.6)
        return sp, isn + 1, risn + 1

    def http(dst, host, path, body):
        nonlocal t
        sp, s, a = handshake(dst, 80)
        req = ('GET %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: curl/8.9.1\r\nAccept: */*\r\n\r\n' % (path, host)).encode()
        p.tcp(t, me, sp, dst, 80, s, a, 0x18, req, my_mac, gw_mac)
        resp = ('HTTP/1.1 200 OK\r\nServer: nginx\r\nContent-Type: text/plain\r\nContent-Length: %d\r\n\r\n%s'
                % (len(body), body)).encode()
        p.tcp(t + 0.04, dst, 80, me, sp, a, s + len(req), 0x18, resp, gw_mac, my_mac)
        p.tcp(t + 0.041, me, sp, dst, 80, s + len(req), a + len(resp), 0x11, b'', my_mac, gw_mac)
        t += rng.uniform(0.3, 1.2)

    normal = [('archlinux.org', ['203.0.113.10']), ('geo.mirror.pkgbuild.com', ['203.0.113.44']),
              ('github.com', ['203.0.113.3']), ('ctftime.org', ['198.51.100.71']),
              ('en.wikipedia.org', ['198.51.100.12']), ('discord.com', ['203.0.113.92', '203.0.113.93']),
              ('fonts.gstatic.com', ['198.51.100.140']), ('api.github.com', ['203.0.113.5']),
              ('www.srf.ch', ['192.0.2.81']), ('sbb.ch', ['192.0.2.30'])]
    for n, ips in normal[:4]:
        lookup(n, ips)
        handshake(ips[0], 443)
    lookup('neverssl.com', ['192.0.2.55'])
    http('192.0.2.55', 'neverssl.com', '/', 'This website is for when you try to open Facebook, Google or Amazon on a captive portal Wi-Fi.\n')
    lookup('update.telemetry-cdn.example', ['198.51.100.23'])
    http('198.51.100.23', 'update.telemetry-cdn.example', '/beacon?id=lx47&v=2',
         'OK id=lx47\ntask=exfil file=creds.txt via=dns enc=hex chunk=12 zone=s.telemetry-cdn.example\n')
    # the exfil itself, chunks shuffled in with normal browsing
    secret = ('creds.txt|db_admin:Sommer2025!|vpn:lx47/hunter2|' + flag + '|EOF').encode().hex()
    chunks = [secret[i:i + 24] for i in range(0, len(secret), 24)]
    order = list(range(len(chunks)))
    rng.shuffle(order)
    noise = normal[4:] * 2
    for k, idx in enumerate(order):
        name = '%02d.%s.s.telemetry-cdn.example' % (idx, chunks[idx])
        lookup(name, [b'\x02ok'], qtype=16)
        if k < len(noise) and rng.random() < 0.8:
            lookup(*noise[k])
    lookup('%02d.%s.s.telemetry-cdn.example' % (len(chunks), 'ff' * 4), [b'\x04done'], qtype=16)
    for n, ips in normal[6:]:
        lookup(n, ips)
    data = p.bytes()
    assert flag.encode() not in data
    write(os.path.join(EVID, 'case-004', 'capture.pcap'), data)


# ---------------------------------------------------------------- 005 fat12 deleted file
def fat_dt(y, mo, d, h, mi, s):
    return struct.pack('<HH', (h << 11) | (mi << 5) | (s // 2), ((y - 1980) << 9) | (mo << 5) | d)


def dirent(name83, attr, cluster, size, dt=(2025, 7, 29, 18, 3, 22), deleted=False):
    """one 32 byte FAT directory entry. deleting a file on FAT only flips byte 0 to 0xE5"""
    n = name83.encode()
    if deleted:
        n = b'\xe5' + n[1:]
    tm, dd = struct.unpack('<HH', fat_dt(*dt))
    # name attr nt ctenth ctime cdate adate clus_hi wtime wdate clus_lo size
    return struct.pack('<11sBBBHHHHHHHI', n, attr, 0, 0, tm, dd, dd, 0, tm, dd, cluster, size)


def n83(name):
    base, _, ext = name.upper().partition('.')
    return base.ljust(8)[:8] + ext.ljust(3)[:3]


def case_005(flag):
    BPS, SPC, RES, NFATS, ROOTENT, TOTAL, SPF = 512, 1, 1, 2, 224, 720, 3
    root_sec = RES + NFATS * SPF
    data_sec = root_sec + ROOTENT * 32 // BPS
    img = bytearray(TOTAL * BPS)
    boot = bytearray(512)
    boot[0:3] = b'\xeb\x3c\x90'
    boot[3:11] = b'mkfs.fat'
    struct.pack_into('<HBHBHHBHHHII', boot, 11, BPS, SPC, RES, NFATS, ROOTENT, TOTAL, 0xF8, SPF, 18, 2, 0, 0)
    struct.pack_into('<BBBI11s8s', boot, 36, 0x80, 0, 0x29, 0x4C580005, b'SUSPECT_USB', b'FAT12   ')
    boot[510:512] = b'\x55\xaa'
    img[0:512] = boot
    fat = [0] * ((SPF * BPS * 2) // 3)
    fat[0], fat[1] = 0xFF8, 0xFFF
    nxt = [2]

    def alloc(data):
        n = max(1, -(-len(data) // BPS))
        first = nxt[0]
        for i in range(n):
            c = first + i
            fat[c] = c + 1 if i < n - 1 else 0xFFF
            off = (data_sec + c - 2) * BPS
            chunk = data[i * BPS:(i + 1) * BPS]
            img[off:off + len(chunk)] = chunk
        nxt[0] += n
        return first, n

    def free(first, n):
        for i in range(n):
            fat[first + i] = 0

    files = {
        'README.TXT': b'property of suspect_47.\r\nif found please return. and please do not look inside.\r\n',
        'TODO.TXT': b'- buy milk (oat)\r\n- move the stuff off the laptop\r\n- wipe this stick\r\n- ACTUALLY wipe it this time, rm is not enough??\r\n',
        'GROCERY.TXT': b'oat milk\r\nrosti\r\ngruyere\r\nmate, lots\r\n',
    }
    rng = np.random.default_rng(5)
    # the flag image that gets "deleted"
    m = text_mask(flag, 20, pad=16)
    pic = np.zeros(m.shape + (3,), np.uint8)
    pic[:] = (18, 18, 22)
    pic[m] = (255, 196, 0)
    pic = np.vstack([np.full((22, m.shape[1], 3), (255, 196, 0), np.uint8), pic])
    pim = Image.fromarray(pic)
    ImageDraw.Draw(pim).text((8, 4), 'EVIDENCE // LX-005 // DO NOT DELETE', font=font(13), fill=(18, 18, 22))
    bio = io.BytesIO()
    pim.save(bio, 'PNG', optimize=True)
    evidence_png = bio.getvalue()
    decoy = b'nice try. passwords are not stored on usb sticks.\r\nthe good stuff was a picture anyway.\r\n'
    plan = b'step 1: get in\r\nstep 2: get the creds\r\nstep 3: get out\r\nstep 4: delete EVIDENCE.PNG before anyone sees it\r\n'

    root = []
    root.append(struct.pack('<11sB', b'SUSPECT_USB', 0x08) + b'\0' * 10 + fat_dt(2025, 7, 29, 17, 59, 0) + b'\0' * 6)
    for name, data in files.items():
        c, _ = alloc(data)
        root.append(dirent(n83(name), 0x20, c, len(data)))
    c_pw, n_pw = alloc(decoy)
    root.append(dirent(n83('PASSWD.TXT'), 0x20, c_pw, len(decoy), deleted=True))
    free(c_pw, n_pw)
    # subdirectory DOCS with PLAN.TXT
    c_docs, _ = alloc(b'\0' * BPS)
    c_plan, _ = alloc(plan)
    sub = dirent('.          ', 0x10, c_docs, 0) + dirent('..         ', 0x10, 0, 0) + dirent(n83('PLAN.TXT'), 0x20, c_plan, len(plan))
    off = (data_sec + c_docs - 2) * BPS
    img[off:off + len(sub)] = sub
    root.append(dirent('DOCS       ', 0x10, c_docs, 0))
    c_ev, n_ev = alloc(evidence_png)
    root.append(dirent(n83('EVIDENCE.PNG'), 0x20, c_ev, len(evidence_png), dt=(2025, 7, 31, 23, 58, 41), deleted=True))
    free(c_ev, n_ev)
    rootb = b''.join(root)
    img[root_sec * BPS:root_sec * BPS + len(rootb)] = rootb
    # pack FAT12
    fb = bytearray(SPF * BPS)
    for i in range(0, len(fat) - 1, 2):
        a, b = fat[i], fat[i + 1]
        j = i * 3 // 2
        fb[j], fb[j + 1], fb[j + 2] = a & 0xFF, ((a >> 8) & 0x0F) | ((b & 0x0F) << 4), (b >> 4) & 0xFF
    for k in range(NFATS):
        s = (RES + k * SPF) * BPS
        img[s:s + len(fb)] = fb
    write(os.path.join(EVID, 'case-005', 'usb.img'), bytes(img))


# ---------------------------------------------------------------- 006 spectrogram
def case_006(flag):
    sr = 22050
    m = text_mask(flag, 30, pad=4)[::-1]   # row 0 = lowest frequency
    rows, cols = m.shape
    col_dur = 0.011
    lead = 1.2
    dur = lead * 2 + cols * col_dur
    n = int(sr * dur)
    t = np.arange(n) / sr
    fmin, fmax = 3000.0, 9000.0
    freqs = fmin + (fmax - fmin) * np.arange(rows) / (rows - 1)
    ci = np.floor((t - lead) / col_dur).astype(int)
    valid = (ci >= 0) & (ci < cols)
    sig = np.zeros(n)
    for r in range(rows):
        env = np.zeros(n)
        env[valid] = m[r, ci[valid]]
        # smooth the envelope a little so it does not click
        k = np.ones(48) / 48
        env = np.convolve(env, k, 'same')
        sig += env * np.sin(2 * math.pi * freqs[r] * t)
    sig /= max(1e-9, np.abs(sig).max())
    rng = np.random.default_rng(6)
    drone = 0.35 * np.sin(2 * math.pi * 110 * t) * (0.6 + 0.4 * np.sin(2 * math.pi * 0.25 * t)) \
        + 0.2 * np.sin(2 * math.pi * 164.8 * t) + 0.12 * np.sin(2 * math.pi * 55 * t)
    beeps = np.zeros(n)
    for s in np.arange(0.2, dur - 0.2, 0.8):
        a, b = int(s * sr), int((s + 0.06) * sr)
        beeps[a:b] = 0.25 * np.sin(2 * math.pi * 1200 * t[a:b])
    out = 0.35 * sig + drone * 0.5 + beeps + rng.normal(0, 0.02, n)
    out = out / np.abs(out).max() * 0.85
    pcm = (out * 32767).astype('<i2').tobytes()
    hdr = b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVE' + b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 1, sr, sr * 2, 2, 16) \
        + b'data' + struct.pack('<I', len(pcm))
    write(os.path.join(EVID, 'case-006', 'transmission.wav'), hdr + pcm)


# ---------------------------------------------------------------- 007 zero width
def zero_width(flag):
    bits = ''.join('{:08b}'.format(b) for b in flag.encode())
    return ''.join('​' if c == '0' else '‌' for c in bits)


# ---------------------------------------------------------------- manifest
def main():
    flags = load_flags(new='--new' in sys.argv)
    case_001(flags['001'])
    case_002(flags['002'])
    case_003(flags['003'])
    case_004(flags['004'])
    case_005(flags['005'])
    case_006(flags['006'])

    files = {}
    for case in sorted(os.listdir(EVID)):
        for fn in sorted(os.listdir(os.path.join(EVID, case))):
            data = open(os.path.join(EVID, case, fn), 'rb').read()
            files.setdefault(case.split('-')[1], []).append({
                'name': fn, 'path': 'evidence/%s/%s' % (case, fn), 'size': len(data),
                'md5': hashlib.md5(data).hexdigest(), 'sha256': hashlib.sha256(data).hexdigest()})
    manifest = {
        'hashes': {k: hashlib.sha256(v.strip().lower().encode()).hexdigest() for k, v in sorted(flags.items())},
        'files': files,
        'zw': zero_width(flags['007']),
    }
    os.makedirs(os.path.dirname(GEN_JS), exist_ok=True)
    with open(GEN_JS, 'w', encoding='utf-8') as f:
        f.write('// generated by tools/build_evidence.py, do not edit by hand.\n'
                '// flag hashes only: sha256(lowercase(flag)). the flags live inside the evidence.\n')
        f.write('var LX_EVIDENCE=' + json.dumps(manifest, indent=1, ensure_ascii=True) + ';\n')
    print('[+] js/evidence.gen.js')


if __name__ == '__main__':
    main()
