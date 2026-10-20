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

the site only ships `sha256(lowercase(flag))` in `js/evidence.gen.js`, and
`submit` compares hashes locally. reading the js gives you nothing.

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
python3 tools/build.py            # site.env -> js/config.js, page titles, meta tags, CNAME
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
exist it creates one.

## adding a case

1. add a `case_008(flag)` function to `tools/build_evidence.py` that writes
   into `evidence/case-008/`, add the flag body to `FLAG_BODIES` (the prefix
   comes from `site.env`), call it in `main()`.
2. run the builder.
3. add an entry to `LX_CASES` in `js/cases.js` (title, briefing, hints).

that's it, the folder, briefing, downloads and plain view all build themselves.

## deploying

static files. the generated files are committed, so anything that serves a
folder works. but only one of the two options can serve **both** domains.

### cloudflare pages (recommended, and needed for .ch + .li)

1. workers & pages > create > pages > connect the repo
2. build command: `python3 tools/build.py`, output directory: `/`
   (the build image has python 3. this way an edit to `site.env` straight on
   github still deploys correctly, even if nobody ran the build locally)
3. custom domains > add `lynnux.ch`, `www.lynnux.ch`, `lynnux.li`, `www.lynnux.li`.
   pages wants each hostname added on its own, no wildcards. the domains need
   their DNS on cloudflare for the bare (apex) names to work
4. optional: a redirect rule `www.*` -> bare domain (see the storage note above)

it reads `_headers`, so you get the full security headers (CSP, no framing,
no referrer). works with private repos too.

**never** put `tools/build_evidence.py` in the build command. it needs
`flags.json`, which is private and not in the repo. without it, it would roll
random flags nobody knows and overwrite the evidence.

### github pages (one domain only)

settings > pages > deploy from branch, folder `/`. github pages allows exactly
**one** custom domain per site: set `CNAME=lynnux.ch` in `site.env` and run the
build, it writes the `CNAME` file. the other domain can only redirect there, so
`.li` visitors end up on `.ch`. `_headers` is ignored, the `<meta>` CSP still
applies.

### ci

`.github/workflows/check.yml` runs `python3 tools/build.py --check` on every
push and pull request. if someone edits `site.env` and forgets the build, it
goes red instead of silently deploying old values (on github pages).

## layout

```
site.env              <- your stuff. edit this, then run tools/build.py
index.html            the page
404.html              the not-found page
css/style.css         all styling
js/config.js          generated from site.env, don't edit
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
tools/build.py        site.env -> config.js + html
tools/siteenv.py      the site.env parser (shared by both builders)
tools/build_evidence.py
```

## licenses

- code: yours to choose (add a `LICENSE` file)
- JetBrains Mono: SIL Open Font License, see `assets/fonts/OFL.txt`
