# lynnux.ch

a forensic workstation in your browser. it's my portfolio, but also a place to
actually *do* forensics: `~/cases` has real challenges with real evidence files,
and the terminal has real tools to solve them.

inspired by [lumiingenii.ch](https://lumiingenii.ch), go play their snake.

## what's in here

- **a login popup**: visitors pick a name (or skip as guest) and become
  `name@lynnux.ch`. the name only lives in their browser. `logout` to switch.
- **a terminal** (zsh flavoured: syntax highlighting, autosuggestions) with pipes, `;` `&&` `||`, `>` `>>` (binary safe), globs, `$VARS`,
  tab completion and history. click anything underlined.
- **in-browser forensics tools** that work on the actual bytes:
  `file` `strings` `xxd` `hexdump` `exiftool` `binwalk -e` `dd` `unzip`
  `md5sum` `sha256sum` `stegsolve` `spectrogram` `tcpdump` `fsstat` `fls` `icat`
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

everything personal is in **`js/config.js`**: links, email, about text,
fastfetch info, writeups. anything set to `null` is hidden.

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
   into `evidence/case-008/`, add a template to `FLAG_TEMPLATES`, call it in
   `main()`.
2. run the builder.
3. add an entry to `LX_CASES` in `js/cases.js` (title, briefing, hints).

that's it, the folder, briefing, downloads and plain view all build themselves.

## deploying

static files, no build step. two good options:

- **cloudflare pages** (recommended): connect the repo, no build command,
  output dir `/`. it reads `_headers`, so you get the full security headers.
  works with private repos too.
- **github pages**: settings > pages > deploy from branch `main`, folder `/`.
  `_headers` is ignored there but the `<meta>` CSP still applies.

### custom domain (once lynnux.ch is bought)

- github pages: settings > pages > custom domain `lynnux.ch` (this creates
  the `CNAME` file for you), then point the DNS at github.
- cloudflare pages: custom domains > add `lynnux.ch`.

## layout

```
index.html            the page
css/style.css         all styling
js/config.js          <- your stuff
js/core.js            shell engine: fs, tokenizer, pipes, redirects
js/fsdata.js          what's on the virtual disk
js/commands.js        ls, cd, cat, grep, cut, tr, sort, ...
js/forensics.js       file, strings, xxd, exiftool, binwalk, dd, unzip, hashes
js/viewers.js         view, stegsolve, spectrogram, play
js/netdisk.js         tcpdump, fsstat, fls, icat
js/cases.js           case briefings, hints, submit
js/fun.js             fastfetch, hyfetch, fortune, magic, enhance
js/gui.js             the plain view panel
js/boot.js            boot sequence
js/evidence.gen.js    generated: flag hashes + evidence file hashes
evidence/             generated challenge files
tools/build_evidence.py
```

## licenses

- code: yours to choose (add a `LICENSE` file)
- JetBrains Mono: SIL Open Font License, see `assets/fonts/OFL.txt`
