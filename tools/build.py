#!/usr/bin/env python3
"""
build.py - turns site.env into the files the site reads.

    python3 tools/build.py           # write js/config.js, update index.html / 404.html, CNAME
    python3 tools/build.py --check   # only check that everything is up to date (for CI)
    python3 tools/build.py --dist    # build, then copy only the public site into dist/ (deploy that)

writes:
    js/config.js                 the LX_CONFIG object the site reads at runtime
    index.html, 404.html         page title + description (only those tags)
    CNAME                        when CNAME= is set (github pages), removed otherwise
    deploy/Caddyfile             web server config for your own server (DOMAINS, WEBROOT, _headers)
    deploy/nginx.conf            the same for nginx
    dist/                        with --dist: the files a visitor may see, nothing else

no dependencies, plain python 3. safe to run as a cloudflare pages build command.
it never touches the evidence or the flags: that is tools/build_evidence.py.
"""
import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from siteenv import ROOT, EnvError, load  # noqa: E402

PRESETS = ['lesbian', 'rainbow', 'transgender', 'nonbinary', 'bisexual', 'pansexual', 'asexual', 'aromantic',
           'agender', 'genderfluid', 'gay-men', 'trans', 'enby', 'bi', 'pan', 'ace', 'aro', 'gay', 'mlm', 'wlw', 'pride']
MACHINE_KEYS = ['OS', 'KERNEL', 'HOST', 'DISPLAY', 'CPU', 'GPU', 'MEM', 'SWAP', 'DISK', 'POWER', 'TEMP', 'SHELL', 'DE', 'WM', 'THEME', 'TERMINAL']
KNOWN = {'SITE_NAME', 'DOMAINS', 'DESCRIPTION', 'TAGLINE', 'LOCATION', 'OWNER', 'FLAG_PREFIX', 'CNAME', 'EMAIL', 'DISCORD', 'TEAMS', 'ABOUT', 'HYFETCH_PRESET', 'WEBROOT'}
HOST_RE = re.compile(r'^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')
USER_RE = re.compile(r'^[a-z_][a-z0-9_-]{0,23}$')
# what gets deployed. an allowlist on purpose: tools/ has the flag templates, and with
# them plus the hashes in js/evidence.gen.js every flag brute-forces in under a second
PUBLIC = ['index.html', '404.html', 'favicon.svg', '_headers', 'CNAME', 'css', 'js', 'assets', 'evidence']


def fail(msg):
    sys.exit('site.env: ' + msg)


def nn(v):
    """empty string -> None, so the site hides it"""
    v = (v or '').strip()
    return v or None


def url_ok(u):
    return bool(re.match(r'^https?://[^\s"<>]+$', u))


def build_config(env):
    warnings = []
    for k in env:
        if k not in KNOWN and not re.match(r'^(LINK|MACHINE|WRITEUP)_[A-Z0-9_]+$', k):
            warnings.append('unknown key %s (typo?), ignored' % k)

    site = env.get('SITE_NAME', '').strip()
    if not re.match(r'^[a-z0-9][a-z0-9._-]{0,31}$', site):
        fail('SITE_NAME must be 1-32 chars of a-z 0-9 . _ -, got %r' % site)
    domains = [d.strip().lower() for d in env.get('DOMAINS', '').split(',') if d.strip()]
    if not domains:
        fail('DOMAINS needs at least one domain, e.g. DOMAINS=example.ch')
    for d in domains:
        if not HOST_RE.match(d):
            fail('DOMAINS: %r is not a valid domain' % d)
    owner = env.get('OWNER', '').strip()
    if not USER_RE.match(owner) or owner in ('root', 'guest'):
        fail('OWNER must be a unix username (a-z 0-9 _ -, starts with a letter) and not root/guest, got %r' % owner)
    prefix = env.get('FLAG_PREFIX', '').strip()
    if not re.match(r'^[a-z0-9_]{1,20}$', prefix):
        fail('FLAG_PREFIX must be 1-20 chars of a-z 0-9 _, got %r' % prefix)
    preset = env.get('HYFETCH_PRESET', 'lesbian').strip() or 'lesbian'
    if preset not in PRESETS:
        fail('HYFETCH_PRESET must be one of: ' + ', '.join(PRESETS))

    links = {}
    for k in [k for k in env if k.startswith('LINK_')]:  # keep the order of site.env
        name, u = k[5:].lower(), nn(env[k])
        if u and not url_ok(u):
            fail('%s must be an http(s) url, got %r' % (k, u))
        links[name] = u
    email = nn(env.get('EMAIL'))
    if email and not re.match(r'^[^\s@<>"]+@[^\s@<>"]+$', email):
        fail('EMAIL does not look like an email address: %r' % email)

    writeups = []
    for k in sorted((k for k in env if k.startswith('WRITEUP_')), key=lambda k: int(re.sub(r'\D', '', k) or 0)):
        v = nn(env[k])
        if not v:
            continue
        if '|' not in v:
            fail('%s must look like "title | https://url"' % k)
        title, u = [x.strip() for x in v.split('|', 1)]
        if not url_ok(u):
            fail('%s: %r is not an http(s) url' % (k, u))
        writeups.append({'title': title, 'url': u})

    machine = {}
    for k in MACHINE_KEYS:
        machine[k.lower()] = nn(env.get('MACHINE_' + k))
    for k in env:
        if k.startswith('MACHINE_') and k[8:] not in MACHINE_KEYS:
            warnings.append('%s is not shown anywhere (known: %s)' % (k, ', '.join('MACHINE_' + m for m in MACHINE_KEYS)))
    for k in ('os', 'kernel', 'cpu', 'gpu', 'mem', 'swap', 'disk', 'shell'):
        if not machine[k]:
            fail('MACHINE_%s is needed by fastfetch' % k.upper())
    for k, v in machine.items():
        if v and len(v) > 55:
            warnings.append('MACHINE_%s is %d chars, it will wrap next to the logo (keep it under ~55)' % (k.upper(), len(v)))

    about = (env.get('ABOUT') or '').strip('\n').split('\n')
    cfg = {
        'siteName': site,
        'domains': domains,
        'description': nn(env.get('DESCRIPTION')) or '',
        'tagline': nn(env.get('TAGLINE')) or '',
        'location': nn(env.get('LOCATION')) or '',
        'owner': owner,
        'flagPrefix': prefix,
        'hyfetchPreset': preset,
        'links': links,
        'email': email,
        'discord': nn(env.get('DISCORD')),
        'teams': [t.strip() for t in (env.get('TEAMS') or '').split(',') if t.strip()],
        'about': about,
        'machine': machine,
        'writeups': writeups,
    }
    return cfg, warnings


def config_js(cfg):
    return ('// GENERATED by tools/build.py from site.env. do not edit this file:\n'
            '// edit site.env, then run: python3 tools/build.py\n'
            '// domain + host are filled in at runtime from the address the visitor used.\n'
            'var LX_CONFIG = ' + json.dumps(cfg, indent=2, ensure_ascii=True) + ';\n')


def esc_attr(s):
    return s.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;').replace('>', '&gt;')


def patch_html(html, cfg, page404=False):
    title = ('404 · ' if page404 else '') + cfg['siteName']
    html = re.sub(r'<title>[^<]*</title>', '<title>' + esc_attr(title) + '</title>', html, count=1)
    if page404:
        html = re.sub(r'(<span class="h" id="host404"[^>]*>)[^<]*(</span>)', lambda m: m.group(1) + cfg['domains'][0] + m.group(2), html, count=1)
    else:
        html = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + esc_attr(cfg['description']) + m.group(2), html, count=1)
        html = re.sub(r'(<meta property="og:title" content=")[^"]*(")', lambda m: m.group(1) + esc_attr(cfg['siteName']) + m.group(2), html, count=1)
        html = re.sub(r'(<meta property="og:description" content=")[^"]*(")', lambda m: m.group(1) + esc_attr(cfg['description']) + m.group(2), html, count=1)
        # static fallbacks, the script replaces them with the visitor's domain
        html = re.sub(r'(<span class="st-badge">)[^<]*(</span>)', lambda m: m.group(1) + cfg['domains'][0] + m.group(2), html, count=1)
        html = re.sub(r'(<span class="c-amber" id="login-host">)[^<]*(</span>)', lambda m: m.group(1) + cfg['domains'][0] + m.group(2), html, count=1)
    return html


def read_headers():
    """_headers (the netlify / cloudflare pages format) -> global headers, [(path, name, value)]"""
    glob, extra, path = [], [], None
    for n, line in enumerate(open(os.path.join(ROOT, '_headers'), encoding='utf-8').read().split('\n'), 1):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if not line[0].isspace():
            path = line.strip()
            if not re.match(r'^/[A-Za-z0-9._/-]*\*?$', path):
                sys.exit('_headers line %d: paths look like /dir/* or /file.ext, got %r' % (n, path))
            continue
        name, sep, value = (x.strip() for x in line.partition(':'))
        # these values end up inside the caddy and nginx configs, so nothing that could escape a quoted string
        if path is None or not sep or not re.match(r'^[A-Za-z0-9-]+$', name) or not value or re.search(r'["\\${}\x00-\x1f]', value):
            sys.exit('_headers line %d: expected "  Name: value" under a path (no quotes, backslashes, $ or braces)' % n)
        (glob.append((name, value)) if path == '/*' else extra.append((path, name, value)))
    clash = {x[1].lower() for x in extra} & {g[0].lower() for g in glob}
    if clash:
        sys.exit('_headers: %s is set for /* and for a path too, the server configs do not support that' % ', '.join(sorted(clash)))
    return glob, extra


def server_configs(env, cfg):
    site, domains = cfg['siteName'], cfg['domains']
    root = (env.get('WEBROOT') or '').strip() or '/srv/%s/dist' % site
    if not re.match(r'^/[A-Za-z0-9._/-]+$', root) or '..' in root.split('/'):
        fail('WEBROOT must be an absolute path of a-z A-Z 0-9 . _ - /, got %r' % root)
    glob, extra = read_headers()
    var = re.sub(r'[^a-z0-9_]', '_', site)
    names = ' '.join(d + ' www.' + d for d in domains)
    head = ('# GENERATED by tools/build.py from site.env (DOMAINS, WEBROOT) and _headers.\n'
            '# do not edit this file: edit those, then run python3 tools/build.py\n#\n')

    caddy = head + (
        '# use it from the main caddy config (/etc/caddy/Caddyfile), one line:\n'
        '#     import %s/deploy/Caddyfile\n'
        '# then: systemctl reload caddy\n'
        '# caddy gets and renews the https certificates for every name below by itself.\n'
        '# needs: DNS A (and AAAA) records for %s pointing here, ports 80 and 443 open.\n\n'
    ) % (os.path.dirname(root), ', '.join(names.split()))
    caddy += '(%s_headers) {\n\theader {\n' % var
    caddy += ''.join('\t\t%s "%s"\n' % h for h in glob) + '\t\t-Server\n\t}\n}\n\n'
    caddy += '%s {\n\troot * %s\n\tencode zstd gzip\n\timport %s_headers\n' % (', '.join(domains), root, var)
    for i, (p, name, value) in enumerate(extra):
        caddy += '\t@%s_p%d path %s\n\theader @%s_p%d %s "%s"\n' % (var, i, p, var, i, name, value)
    caddy += ('\tfile_server\n'
              '\t# anything missing gets the 404 page (with a real 404 status)\n'
              '\thandle_errors {\n\t\timport %s_headers\n\t\trewrite * /404.html\n\t\tfile_server\n\t}\n}\n') % var
    for d in domains:
        caddy += '\nwww.%s {\n\tredir https://%s{uri} permanent\n}\n' % (d, d)

    nginx = head + (
        '# 1. COPY it (do not symlink: certbot edits it) to /etc/nginx/sites-available/%s.conf\n'
        '#    and link that into sites-enabled. no sites-* dirs? /etc/nginx/conf.d/%s.conf\n'
        '# 2. nginx -t && systemctl reload nginx\n'
        '# 3. https: certbot --nginx %s\n'
        '#    certbot adds the certificate lines and the http -> https redirect itself.\n'
        '# server has IPv6 switched off (nginx -t: "Address family not supported")? delete the [::] lines.\n\n'
    ) % (site, site, ' '.join('-d ' + n for n in names.split()))
    hvars = {}
    for p, name, value in extra:
        hvars.setdefault(name, []).append((p, value))
    for name, rules in hvars.items():
        nginx += 'map $uri $%s_%s {\n' % (var, name.lower().replace('-', '_'))
        for p, value in rules:
            rx = '^' + re.escape(p[:-1]) if p.endswith('*') else '^' + re.escape(p) + '$'
            nginx += '    "~%s" "%s";\n' % (rx, value)
        nginx += '    default "";\n}\n\n'
    for d in domains:
        nginx += ('server {\n    listen 80;\n    listen [::]:80;\n    server_name www.%s;\n'
                  '    return 301 $scheme://%s$request_uri;\n}\n\n') % (d, d)
    nginx += ('server {\n    listen 80;\n    listen [::]:80;\n    server_name %s;\n'
              '    root %s;\n    index index.html;\n    charset utf-8;\n    server_tokens off;\n'
              '    gzip on;\n    gzip_types text/css application/javascript image/svg+xml;\n\n') % (' '.join(domains), root)
    nginx += ''.join('    add_header %s "%s" always;\n' % h for h in glob)
    # an empty value means nginx leaves the header out, so these only show up on their paths
    nginx += ''.join('    add_header %s $%s_%s always;\n' % (name, var, name.lower().replace('-', '_')) for name in hvars)
    nginx += ('\n    error_page 404 /404.html;\n    location / {\n        try_files $uri $uri/ =404;\n    }\n}\n')
    return {os.path.join(ROOT, 'deploy', 'Caddyfile'): caddy, os.path.join(ROOT, 'deploy', 'nginx.conf'): nginx}


def dist():
    # build next to it, then swap, so a live server never sees a half copied site
    out, new, old = (os.path.join(ROOT, x) for x in ('dist', 'dist.new', 'dist.old'))
    for d in (new, old):
        if os.path.isdir(d):
            shutil.rmtree(d)
    os.mkdir(new)
    for name in PUBLIC:
        src = os.path.join(ROOT, name)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(new, name))
        elif os.path.exists(src):
            shutil.copy2(src, new)
    if os.path.isdir(out):
        os.rename(out, old)
    os.rename(new, out)
    if os.path.isdir(old):
        shutil.rmtree(old)
    n = sum(len(files) for _, _, files in os.walk(out))
    print('dist/: %d files from %s' % (n, ', '.join(x for x in PUBLIC if os.path.exists(os.path.join(ROOT, x)))))


def main():
    check = '--check' in sys.argv
    try:
        env = load()
    except EnvError as e:
        sys.exit(str(e))
    cfg, warnings = build_config(env)
    for w in warnings:
        print('warning: ' + w)

    outputs = {os.path.join(ROOT, 'js', 'config.js'): config_js(cfg)}
    outputs.update(server_configs(env, cfg))
    for name, is404 in (('index.html', False), ('404.html', True)):
        p = os.path.join(ROOT, name)
        outputs[p] = patch_html(open(p, encoding='utf-8').read(), cfg, is404)
    cname = nn(env.get('CNAME'))
    if cname and cname not in cfg['domains']:
        fail('CNAME %r is not one of DOMAINS' % cname)
    cname_path = os.path.join(ROOT, 'CNAME')

    stale = []
    for p, content in outputs.items():
        cur = open(p, encoding='utf-8').read() if os.path.exists(p) else None
        if cur != content:
            stale.append(os.path.relpath(p, ROOT))
            if not check:
                os.makedirs(os.path.dirname(p), exist_ok=True)
                with open(p, 'w', encoding='utf-8') as f:
                    f.write(content)
    has_cname = os.path.exists(cname_path)
    want_cname = cname + '\n' if cname else None
    if (open(cname_path).read() if has_cname else None) != want_cname:
        stale.append('CNAME')
        if not check:
            if want_cname:
                open(cname_path, 'w').write(want_cname)
            elif has_cname:
                os.remove(cname_path)

    if check:
        if stale:
            sys.exit('out of date, run python3 tools/build.py: ' + ', '.join(stale))
        print('site.env and the generated files are in sync')
        return
    print('built from site.env: %s on %s, owner %s, flags %s{...}, hyfetch %s' % (
        cfg['siteName'], ', '.join(cfg['domains']), cfg['owner'], cfg['flagPrefix'], cfg['hyfetchPreset']))
    print('updated: ' + (', '.join(stale) if stale else 'nothing, already up to date'))
    if '--dist' in sys.argv:
        dist()


if __name__ == '__main__':
    main()
