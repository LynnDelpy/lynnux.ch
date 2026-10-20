# lynnux.ch

a forensic workstation in your browser. it's my portfolio, but also a place to
actually *do* forensics: `~/cases` has real challenges with real evidence files,
and the terminal has real tools to solve them.

inspired by [lumiingenii.ch](https://lumiingenii.ch), go play their snake.

## what's in here

- **a login popup**: visitors pick a name (or skip as guest) and become
  `name@lynnux.ch` or `name@lynnux.li`, whichever domain they typed. the name
  only lives in their browser. `logout` to switch.
- **a terminal** (zsh flavoured: syntax highlighting, autosuggestions) with pipes, `;` `&&` `||`, `>` `>>` (binary safe), globs, `$VARS`,
  tab completion and history. click anything underlined.
- **in-browser forensics tools** that work on the actual bytes:
  `file` `strings` `xxd` `hexdump` `exiftool` `binwalk -e` `foremost` `dd` `unzip`
  `stat` `entropy` `xor` `pngcheck` `cmp` `md5sum` `sha256sum` `stegsolve`
  `spectrogram` `tcpdump` `fsstat` `fls` `icat`
- **130+ commands** in total: text tools (`sed`, `awk`, `jq`, `diff`, `calc`, ...),
  system tools that back up the absurd specs (`htop`, `nvidia-smi`, `lscpu`, `free`,
  `last`, `dmesg`, ...), and every network tool tells you the box is air-gapped.
- **man pages for everything**: a real pager (`man grep`, `q` quits), apropos /
  whatis / tldr, concept pages (`man 7 forensics`, `man hier`, `man lynnux`) and
  FORENSICS NOTES on the forensics tools. pages live in `js/man.js`.
- **easter eggs.** not telling. `man hier` is a decent place to start digging.
- **7 cases**: metadata, bit-plane stego, file carving, dns exfil, deleted file
  recovery on FAT12, audio spectrogram, plus one that isn't on the list.
- **a write-blocker**: `~/cases` is read-only. tools that produce files drop them
  into `~/work`, like you would in a real investigation.
- **a plain view** ("not a terminal person?") with links, downloads and flag
  submission for people who don't want to type.
- **no third parties.** no google fonts, no analytics, no cdn. strict CSP.

## how flags stay secret

the plaintext flags only exist in two places:

1. inside the evidence files (that's the point)
2. `flags.json`, which is **gitignored**. back it up somewhere safe.

the site only ships a hash of each flag in `js/evidence.gen.js`, and
`submit` compares hashes locally. your guess never leaves the browser.

the threat model assumes **everything in this repo is public**, including
`tools/build_evidence.py` with the flag templates (`bit_planes_tell_tales_...`).
so the templates are no secret. two things are:

- **10 random characters** per flag (from 14 symbols, no 0/1 so image flags
  stay readable): about 2.9 * 10^11 possibilities each
- a **slow hash**: PBKDF2-HMAC-SHA256, 600,000 rounds, random salt. one submit
  costs about 0.3 s in a browser, which is nothing for a player and a lot for
  a brute forcer

together that is roughly 4 months per flag on one high-end GPU, versus solving
the case in 20 minutes. (the first version had 4 random characters and plain
sha256: all 7 flags fell in 0.17 s from the public files. those flags are
retired, and the generator replaces flags that weak by itself.)

## run it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

it has to be served over http(s), not opened as a file: webcrypto and `fetch`
need that.

## make it yours

everything personal lives in **`site.env`**, one commented file: site name,
domains, owner, flag prefix, links, about text, the hyfetch flag and the
(stupid) fastfetch stats. it's plain `KEY=value`, every key is explained in
the file itself, and an empty value hides that thing on the site.

```sh
$EDITOR site.env
python3 tools/build.py            # site.env -> js/config.js, page titles, meta tags, CNAME, deploy/
python3 tools/build.py --check    # only check that everything is in sync (exit 1 if not)
```

`build.py` is plain python 3, no pip installs. it validates everything before
writing anything (domains, a unix username for `OWNER`, http(s) only links, a
known hyfetch preset, ...) and warns about typo'd keys, so a broken `site.env`
fails loudly instead of shipping a broken site.

**`site.env` is public.** it gets committed and deployed, like every other
file in here. no secrets, no tokens, ever.

### forking it for your own site

1. fork the repo
2. edit `site.env` (at least `SITE_NAME`, `DOMAINS`, `OWNER`, `FLAG_PREFIX`,
   the links and `ABOUT`)
3. `python3 tools/build.py`
4. `python3 tools/build_evidence.py --new` (see below). this rolls **your own
   flags** with your `FLAG_PREFIX`. without it the evidence still has mine,
   and you don't know them
5. commit (`flags.json` stays local, it's gitignored) and deploy

### more than one domain

list them all in `DOMAINS`, comma separated. the site looks at the hostname
the visitor typed and uses the matching one: prompt, caution tape, page title,
`hostname`, `ping`, the man pages and the 404 page all follow it.

| visitor typed      | site calls itself |
|--------------------|-------------------|
| `lynnux.ch`        | `lynnux.ch`       |
| `lynnux.li`        | `lynnux.li`       |
| `www.lynnux.li`    | `lynnux.li` (subdomains count as their base domain) |
| anything else      | the first one in `DOMAINS` (localhost, `*.pages.dev` previews) |

`{domain}` inside any value in `site.env` gets the same treatment, so
`EMAIL=hi@{domain}` shows `hi@lynnux.li` to people on `.li`.

heads up: browsers keep storage **per origin**. solved cases and the login name
on `lynnux.ch` are not visible on `lynnux.li` (or on `www.` vs no `www.`). that
is the browser's security model, not a bug. redirecting `www` to the bare
domain keeps it to one origin per domain.

## (re)building the evidence

```sh
pip install pillow numpy
python3 tools/build_evidence.py          # rebuild with the flags in flags.json
python3 tools/build_evidence.py --new    # roll new random flags
```

this regenerates `evidence/*` and `js/evidence.gen.js`. if `flags.json` doesn't
exist it creates one, and any flag in it that is weaker than the current rules
(old short suffix, other `FLAG_PREFIX`) gets replaced. same flags in, same bytes
out, so a rebuild only shows up in git when something really changed.

## adding a case

1. add a `case_008(flag)` function to `tools/build_evidence.py` that writes
   into `evidence/case-008/`, add the flag body to `FLAG_BODIES` (the prefix
   comes from `site.env`), call it in `main()`.
2. run the builder.
3. add an entry to `LX_CASES` in `js/cases.js` (title, briefing, hints).

that's it, the folder, briefing, downloads and plain view all build themselves.

## deploying

**serve `dist/`, not the repo root.** `python3 tools/build.py --dist` copies only
what visitors need into `dist/` (an allowlist: html, css, js, fonts, evidence).
nothing in the repo is secret, but there is no reason to serve build tools, and
anything you add later stays out unless you add it to `PUBLIC` in
`tools/build.py`. a smaller surface is a smaller surface.

### your own server (caddy or nginx)

the build also writes ready configs into `deploy/`, made from `DOMAINS` and
`WEBROOT` in `site.env` and the security headers in `_headers`:

- `deploy/Caddyfile` **(recommended)**. caddy gets and renews the https
  certificates for every domain by itself, redirects http to https, and
  redirects `www.` to the bare domain.
- `deploy/nginx.conf` if nginx already runs on the box. https comes from
  `certbot --nginx` (the exact command is in the file).

both send the full security headers (CSP, HSTS, no framing, no referrer),
serve the 404 page with a real 404 status, and were tested end to end.

setup, once (the paths assume the default `WEBROOT=/srv/lynnux/dist`):

1. DNS: an `A` record (and `AAAA` if the server has working IPv6) for
   `lynnux.ch`, `www.lynnux.ch`, `lynnux.li` and `www.lynnux.li`, pointing at
   the server. no wildcard needed. ports 80 and 443 open
2. the repo is private, so give the server a **read-only deploy key** for this
   one repo (github: repo settings > deploy keys, leave "allow write" off)
3. `git clone git@github.com:LynnDelpy/lynnux.ch.git /srv/lynnux`
4. `cd /srv/lynnux && python3 tools/build.py --dist`
5. caddy: add `import /srv/lynnux/deploy/Caddyfile` to `/etc/caddy/Caddyfile`,
   then `systemctl reload caddy`. nginx: follow the comment at the top of
   `deploy/nginx.conf`

updating, every time:

```sh
cd /srv/lynnux && git pull --ff-only && python3 tools/build.py --dist
```

`--dist` builds next to the live folder and swaps it in, so visitors never see
a half copied site. reload caddy/nginx only when `DOMAINS`, `WEBROOT` or
`_headers` changed.

**never** run `tools/build_evidence.py` on the server or put `flags.json`
there. the server doesn't need either.

### static hosts (cloudflare pages, netlify)

build command `python3 tools/build.py --dist`, output directory `dist`, then
add every domain as a custom domain. they read `_headers` directly.

### github pages (not recommended)

it allows only **one** custom domain (`CNAME=` in `site.env`), so `.li` could
only redirect to `.ch`. "deploy from branch" also serves the whole repo instead
of `dist/`, and `_headers` is ignored.

### ci

`.github/workflows/check.yml` runs `python3 tools/build.py --check` on every
push and pull request. if someone edits `site.env` and forgets the build, it
goes red instead of silently deploying old values.

## layout

```
site.env              <- your stuff. edit this, then run tools/build.py
index.html            the page
404.html              the not-found page
css/style.css         all styling
js/config.js          generated from site.env, don't edit
deploy/               generated caddy + nginx configs for your own server
js/domain.js          picks the domain the visitor is on, fills {domain}
js/core.js            shell engine: fs, tokenizer, pipes, redirects
js/fsdata.js          what's on the virtual disk
js/commands.js        ls, cd, cat, grep, cut, tr, sort, ...
js/forensics.js       file, strings, xxd, exiftool, binwalk, dd, unzip, hashes
js/viewers.js         view, stegsolve, spectrogram, play
js/netdisk.js         tcpdump, fsstat, fls, icat
js/cases.js           case briefings, hints, submit
js/fun.js             fastfetch, hyfetch, fortune, magic, enhance
js/extra.js           text/forensics/system extras, easter eggs
js/man.js             pager, man, apropos, whatis, tldr + all manual pages
js/gui.js             the plain view panel
js/boot.js            boot sequence
js/evidence.gen.js    generated: flag hashes + evidence file hashes
evidence/             generated challenge files
tools/build.py        site.env -> config.js, html, deploy/, and dist/ with --dist
tools/siteenv.py      the site.env parser (shared by both builders)
tools/build_evidence.py
```

## licenses

- code: yours to choose (add a `LICENSE` file)
- JetBrains Mono: SIL Open Font License, see `assets/fonts/OFL.txt`
