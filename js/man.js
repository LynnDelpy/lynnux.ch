// man.js :: the pager (less/more), man, apropos, whatis, tldr, and the manual pages themselves
'use strict';

(function () {
  var def = LX.def, esc = LX.esc, span = LX.span;

  // ------------------------------------------------------------ the pages
  // d: one line summary, syn: synopsis, desc: paragraphs (\n\n), opts: [[flag, text]],
  // ex: [[command, what it does]], notes: forensics notes, see: other pages. s: section (default 1)
  var M = LX.MAN = {
    // ---- section 7: concepts
    intro: { s: 7, d: 'what this machine is and how to use it',
      desc: LX_CONFIG.domain + ' is a forensic workstation that runs in your browser. it is a portfolio, a playground and a set of real forensics challenges at the same time.\n\n' +
        'everything lives in a virtual file system. ~/cases holds the evidence: real files, generated for these challenges. the tools (`exiftool`, `binwalk`, `tcpdump`, `fls`, ...) work on the actual bytes, so what you learn here works on a real machine too.\n\n' +
        'the evidence is write-blocked: ~/cases is read-only, and tools that produce files write them to ~/work instead. that is how real investigations work: never touch the original.\n\n' +
        'flags look like `' + LX_CONFIG.flagPrefix + '{...}`. `submit` checks them by hash, so the flags are not in the source code. they only exist inside the evidence.',
      ex: [['cases', 'list the cases and your progress'], ['cat ~/cases/case-001/BRIEFING.txt', 'read a case file'], ['help', 'every command, grouped'], ['apropos carve', 'find commands by keyword']],
      see: ['forensics', 'hier', 'cases', 'zsh'] },
    forensics: { s: 7, d: 'a tiny primer on digital forensics',
      desc: 'digital forensics is reading a story backwards: from the mess to the cause. a few rules make the story hold up later.\n\n' +
        'CHAIN OF CUSTODY. write down who had the evidence, when, and what they did with it. hash it (`sha256sum`) when you get it, hash it again when you are done. if the hash changed, you changed it.\n\n' +
        'NEVER WORK ON THE ORIGINAL. image the drive with a write-blocker attached (`dd`, or better tools like dc3dd / ewfacquire), then work on the copy. here, ~/cases is the original and ~/work is your copy.\n\n' +
        'ORDER OF VOLATILITY (RFC 3227). collect what disappears first, first: registers and cache, RAM, network state, running processes, then disk, then logs and backups. pulling the plug loses the RAM.\n\n' +
        'FILE SYSTEM VS CARVING. a file system knows names, times and where data lives (`fls`, `icat`). when it is damaged or the file was deleted, carving finds files by their magic bytes alone (`foremost`, `binwalk`), but loses names and times.\n\n' +
        'METADATA. files carry more than their content: EXIF in photos (`exiftool`), MAC times in the file system (`stat`), timestamps in shell history (~/.zsh_history), logs (/var/log/auth.log).\n\n' +
        'HIDDEN DATA. steganography hides data inside other data: bit planes (`stegsolve`), spectrograms (`spectrogram`), trailing bytes (`binwalk`), zero width characters (`xxd`). high `entropy` is a hint something is compressed or encrypted.',
      see: ['intro', 'stat', 'foremost', 'fls', 'entropy'] },
    hier: { s: 7, d: 'the layout of this file system',
      desc: '/home/<you>                 your home. writable.\n~/cases                     the evidence locker. read-only (write-blocked).\n~/work                      scratch space. tools write here when the cwd is read-only.\n~/.zsh_history              your shell history, with timestamps.\n~/.zshrc                    shell config. it ends with `hyfetch`.\n~/.config                   hyfetch and fastfetch configs.\n~/.local/share/Trash        things someone deleted. (forensics people look here.)\n/dev                        null, zero, urandom, and sdb: the suspect usb stick.\n/etc                        hostname, passwd, os-release, motd, shells.\n/proc                       cpuinfo, meminfo, version, uptime.\n/var/log/auth.log           logins, failed logins, sudo attempts. yours too.\n/usr/bin                    every command on this machine.\n/lost+found                 what fsck found. take a look.',
      see: ['intro', 'ls', 'tree'] },
    zsh: { d: 'the z shell, as configured on this machine',
      syn: 'zsh',
      desc: 'the shell here behaves like a configured zsh: pipes, `;` `&&` `||`, redirects (`>` `>>`, binary safe), globs (`*`, `?` in any path segment), `$VARS` and quoting.\n\n' +
        'zsh-syntax-highlighting colours the command line while you type: green means the command exists, red means it does not, strings are amber and existing paths are underlined.\n\n' +
        'zsh-autosuggestions shows the newest matching command from your history in grey. press → or End to accept it.\n\n' +
        'history is saved to ~/.zsh_history in EXTENDED_HISTORY format (`: <epoch>:<duration>;<command>`). HIST_IGNORE_SPACE is set: start a command with a space and it never gets saved.',
      opts: [['$?', 'exit status of the last pipeline'], ['$HOME $USER $PWD $SHELL', 'the usual'], ['ctrl+c', 'cancel the running command'], ['ctrl+l', 'clear the screen'], ['ctrl+u', 'clear the line'], ['tab', 'complete commands and paths']],
      ex: [['grep -c sudo ~/.zsh_history', 'count your own sudo attempts'], ['cmd; echo $?', 'see how cmd exited'], [' echo secret', 'leading space: stays out of history']],
      see: ['history', 'alias', 'intro'] },

    // ---- start here
    help: { d: 'list commands, or summarize one', syn: 'help [command]', desc: 'without arguments, prints every command grouped by what it is for. with a command, prints its summary and synopsis.', see: ['man', 'apropos', 'tldr'] },
    man: { d: 'an interface to the manual pages', syn: ['man [section] page', 'man -k keyword'],
      desc: 'shows the manual page for a command or a topic in a pager. inside the pager: `q` quits, `j`/`k` or the arrows scroll, `space`/`b` page down/up, `g`/`G` jump to top/bottom. links under SEE ALSO are clickable.\n\nsection 1 is commands, section 7 is concepts. when piped, man prints plain text.',
      opts: [['-k keyword', 'search page names and summaries (same as apropos)']],
      ex: [['man grep', 'the grep manual'], ['man 7 forensics', 'a short forensics primer'], ['man -k hash', 'everything about hashes'], ['man tcpdump | grep -A2 EXAMPLES', 'grep a manual']],
      see: ['apropos', 'whatis', 'tldr', 'less'] },
    apropos: { d: 'search the manual page names and descriptions', syn: 'apropos keyword', ex: [['apropos carve', 'which tools carve files?']], see: ['man', 'whatis'] },
    whatis: { d: 'one line descriptions of commands', syn: 'whatis command...', ex: [['whatis fls icat', 'what are these?']], see: ['man', 'apropos'] },
    tldr: { d: 'just the examples, please', syn: 'tldr command', desc: 'prints only the EXAMPLES section of a manual page.', ex: [['tldr binwalk', 'how do i use binwalk again']], see: ['man'] },

    // ---- navigation + files
    ls: { d: 'list directory contents', syn: 'ls [-lahR] [path...]', desc: 'lists files. directories are cyan, evidence files amber, links blue. everything in the listing is clickable.',
      opts: [['-l', 'long format: permissions, owner, size, date'], ['-a', 'show hidden files (dotfiles)'], ['-h', 'human readable sizes with -l']],
      ex: [['ls -la ~', 'everything in your home, hidden files too'], ['ls ~/cases/*/*.png', 'globs work in any path segment']], see: ['tree', 'find', 'stat'] },
    cd: { d: 'change the working directory', syn: 'cd [dir | - | ~]', desc: 'without an argument goes home. `cd -` goes back to the previous directory.', see: ['pwd', 'ls'] },
    tree: { d: 'list contents of directories in a tree', syn: 'tree [-a] [dir]', ex: [['tree ~/cases', 'the whole evidence locker']], see: ['ls', 'find'] },
    find: { d: 'search for files in a directory tree', syn: 'find [dir] [-name pattern] [-iname pattern] [-type f|d]',
      ex: [['find ~ -name "*.png"', 'every png in your home'], ['find / -type d -name "*found*"', 'hmm, what is that?']], see: ['ls', 'grep'] },
    open: { d: 'open a link (or file)', syn: 'open name', desc: 'opens links in a new tab, copies discord handles, views images, cats text.', see: ['contact', 'view'] },
    download: { d: 'save a file to your real computer', syn: 'download file',
      desc: 'every evidence file can be downloaded and analysed with your own tools: exiftool, binwalk, wireshark, the sleuth kit, audacity. files you carved in ~/work can be downloaded too.',
      ex: [['download ~/cases/case-004/capture.pcap', 'open it in wireshark'], ['download ~/work/output/png/00000027.png', 'grab something you carved']],
      notes: 'compare the sha256 of the download with the one in BRIEFING.txt. matching hashes mean the evidence did not change on the way.', see: ['sha256sum', 'cases'] },
    cp: { d: 'copy files and directories', syn: 'cp [-rv] source... dest', desc: 'copying evidence into ~/work is allowed (and good practice). copying into ~/cases is not: write-blocker.', ex: [['cp ~/cases/case-003/lake.jpg ~/work/', 'work on a copy']], see: ['mv', 'rm'] },
    mv: { d: 'move or rename files', syn: 'mv source... dest', desc: 'evidence cannot be moved out of ~/cases. copy it instead.', see: ['cp'] },
    rm: { d: 'remove files or directories', syn: 'rm [-rf] path...', desc: 'works in your home and ~/work. the write-blocker protects everything else.',
      notes: 'on a real FAT or ext file system rm does not erase data. it marks the space as free. until something overwrites it, tools like `icat` and `foremost` get it back. see case-005.', see: ['fls', 'icat', 'foremost'] },

    // ---- text
    cat: { d: 'print files', syn: 'cat [-nAvET] [file...]', desc: 'prints text files. binary files get a hint instead of garbage.',
      opts: [['-n', 'number lines'], ['-A', 'show everything: non-printing bytes as M-/^ notation, line ends as $'], ['-v', 'show non-printing bytes'], ['-E', 'show line ends']],
      ex: [['cat -A ~/about.txt | head -n 1', 'see what cat normally hides']], notes: '`cat -A` shows invisible bytes. zero width characters (U+200B/U+200C) show up as `M-bM-^@M-^K` and `M-bM-^@M-^L`.', see: ['less', 'xxd', 'strings'] },
    less: { d: 'view text one screen at a time', syn: ['less file', 'command | less'], desc: 'opens a pager. `q` quits, `j`/`k` scroll, `space`/`b` page, `g`/`G` top/bottom.', ex: [['tcpdump -r capture.pcap | less', 'scroll through packets']], see: ['more', 'man', 'cat'] },
    echo: { d: 'print text', syn: 'echo [-n] [-e] text', opts: [['-e', 'interpret \\n \\t \\xHH']], see: ['printf'] },
    printf: { d: 'formatted output', syn: 'printf format [args...]', desc: 'supports %s %d %x %X %o %c %% with widths and zero padding, and \\n \\t \\xHH escapes.', ex: [['printf "%08x\\n" 17701', 'offset as zero padded hex']], see: ['echo'] },
    grep: { d: 'print lines that match a pattern', syn: ['grep [-ivnocaFrhH] [-m N] [-A N] [-B N] [-C N] pattern [file...]', 'grep -e pattern -e pattern [file...]'],
      desc: 'patterns are regular expressions (JavaScript flavour, similar to grep -E). reads stdin when no file is given. binary files report "binary file matches" unless -a.',
      opts: [['-i', 'ignore case'], ['-v', 'invert: lines that do not match'], ['-n', 'line numbers'], ['-o', 'print only the matching part'], ['-c', 'count matching lines'], ['-r', 'recurse into directories'], ['-a', 'treat binary as text'], ['-F', 'fixed string, no regex'], ['-e pat', 'add a pattern (repeatable)'], ['-m N', 'stop after N matches'], ['-A N / -B N / -C N', 'N lines of context after / before / around each match']],
      ex: [['grep -i telemetry capture.txt', 'case-insensitive search'], ["tcpdump -r capture.pcap | grep -o '[0-9a-f]{16,}'", 'pull long hex runs out of packet summaries'], ['grep -r flag ~', 'search everything (it will not be that easy)']],
      see: ['strings', 'sed', 'awk'] },
    head: { d: 'first lines of input', syn: 'head [-n N] [file]', see: ['tail'] },
    tail: { d: 'last lines of input', syn: 'tail [-n N] [file]', ex: [['tail -n 3 /var/log/auth.log', 'latest auth events']], see: ['head'] },
    wc: { d: 'count lines, words and bytes', syn: 'wc [-lwcm] [file]', notes: '`wc -c` counts bytes, `wc -m` characters. when they disagree on a text file, it contains multibyte characters. sometimes invisible ones.', see: ['cat', 'xxd'] },
    sort: { d: 'sort lines', syn: 'sort [-rnuf] [file]', opts: [['-n', 'numeric'], ['-r', 'reverse'], ['-u', 'unique'], ['-f', 'ignore case']], see: ['uniq'] },
    uniq: { d: 'collapse repeated lines', syn: 'uniq [-cd] [file]', opts: [['-c', 'prefix lines with counts'], ['-d', 'only print duplicates']], ex: [['cut -d" " -f3 log | sort | uniq -c | sort -rn', 'top talkers']], see: ['sort'] },
    cut: { d: 'cut out fields or characters', syn: ['cut -d DELIM -f LIST [file]', 'cut -c LIST [file]'], desc: 'LIST is like 1,3 or 2-4 or 3-.', ex: [['cut -d: -f1 /etc/passwd', 'all user names']], see: ['awk', 'tr'] },
    tr: { d: 'translate or delete characters', syn: 'tr [-ds] set1 [set2]', desc: 'sets support ranges like a-z and classes like [:upper:].', ex: [["tr -d '\\n'", 'join lines'], ['tr a-z A-Z', 'shout']], see: ['sed', 'cut'] },
    sed: { d: 'stream editor', syn: ["sed [-n] 's/regex/replacement/[gip]' [file]", "sed '/regex/d'", "sed -n '/regex/p'", "sed 'Nd' | 'Np' | 'Nq'"],
      desc: 'a small sed. regexes are JavaScript flavour (think sed -E). in the replacement, & is the match and \\1 a group.', ex: [["sed 's/arch/ARCH/g' ~/about.txt", 'replace'], ["sed -n '2p' file", 'print line 2']], see: ['awk', 'tr', 'grep'] },
    awk: { d: 'pattern scanning, mostly for printing columns', syn: "awk [-F sep] '[/regex/] {print $1, $NF}' [file]",
      desc: 'a small awk. knows {print ...} with $0, $1..$N, $NF, NF, NR and "strings", optionally guarded by /regex/.', ex: [["awk '{print $3}'", 'third column'], ["awk -F: '{print $1, $7}' /etc/passwd", 'users and shells']], see: ['cut', 'sed'] },
    jq: { d: 'command line json processor', syn: 'jq [-rc] [.path] [file]', desc: 'a small jq: ., .a.b, .a[0], .[], keys, length.', opts: [['-r', 'raw strings, no quotes'], ['-c', 'compact']], ex: [['jq .preset ~/.config/hyfetch.json', 'which flag does hyfetch use?']], see: ['hyfetch'] },
    diff: { d: 'compare files line by line', syn: 'diff file1 file2', desc: 'prints removed lines with - and added lines with +. exit status 1 when they differ.', see: ['cmp'] },
    tac: { d: 'print lines in reverse order', syn: 'tac [file]', see: ['rev', 'cat'] },
    nl: { d: 'number lines', syn: 'nl [file]', see: ['cat'] },
    tee: { d: 'copy stdin to a file and to stdout', syn: 'command | tee [-a] file', ex: [['strings lake.jpg | tee ~/work/strings.txt | wc -l', 'save and count']] },
    fold: { d: 'wrap long lines', syn: 'fold [-w width] [file]' },
    seq: { d: 'print a sequence of numbers', syn: 'seq [first [step]] last', ex: [['seq 0 512 4096', 'sector offsets']] },
    rev: { d: 'reverse each line', syn: 'rev [text | file]' },
    base64: { d: 'base64 encode or decode', syn: 'base64 [-d] [text | file]', desc: 'accepts a file, literal text, or stdin. decoding also accepts the url-safe alphabet.',
      ex: [['base64 -d bHlubnV4', 'decode text'], ['exiftool postcard.jpg | grep Comment | cut -d: -f2 | base64 -d', 'decode a metadata field']],
      notes: 'base64 strings are easy to spot: A-Z a-z 0-9 + /, length divisible by 4, often ending in = or ==.', see: ['base32', 'unhex'] },
    base32: { d: 'base32 encode or decode', syn: 'base32 [-d] [text | file]', notes: 'dns tunneling tools like to use base32: it is case-insensitive and fits in hostnames.', see: ['base64'] },
    unhex: { d: 'hex string to bytes (xxd -r -p)', syn: 'unhex [hex | file]', desc: 'ignores whitespace and anything that is not hex, so you can pipe messy output straight in.', ex: [['echo 6c796e6e7578 | unhex', 'decode hex']], see: ['xxd', 'unbin'] },
    unbin: { d: 'binary string (01000001...) to bytes', syn: 'unbin [bits | file]', desc: 'ignores everything that is not 0 or 1.', ex: [['echo 01101000 01101001 | unbin', 'hi']], see: ['unhex'] },
    rot13: { d: 'the most secure encryption', syn: 'rot13 [text | file]' },
    calc: { d: 'calculator with hex and binary', syn: 'calc expression', desc: 'understands + - * / % ^ **, parentheses, 0x hex, 0b binary, 0o octal, pi, e, sqrt() abs() log2() floor() ceil() round(). integers are also shown in hex and binary.', ex: [['calc 0x45e0 - 0x4525', 'distance between two offsets'], ['calc 17701 / 512', 'which sector is that?']], see: ['bc', 'factor'] },
    bc: { d: 'calculator that reads stdin', syn: 'echo expression | bc', see: ['calc'] },
    factor: { d: 'prime factors', syn: 'factor N', see: ['calc'] },

    // ---- forensics
    file: { d: 'determine file type from magic bytes', syn: ['file file...', 'command | file -'],
      desc: 'looks at the content, not the extension: PNG, JPEG (with EXIF/JFIF details), ZIP, gzip, PDF, pcap, WAV, FAT boot sectors, ELF, text encodings.',
      ex: [['file ~/cases/*/*', 'what is all this?'], ['file ~/about.txt', 'text, but which kind?']],
      notes: 'extensions lie, magic bytes rarely do. "Unicode text, UTF-8" on a file that looks like plain ascii means there are non-ascii bytes in it. maybe invisible ones.', see: ['xxd', 'magic', 'binwalk'] },
    strings: { d: 'print printable character runs', syn: 'strings [-n min] [-t x|d] file', opts: [['-n N', 'minimum run length (default 4)'], ['-t x', 'print offsets in hex (d for decimal)']],
      ex: [['strings -n 8 lake.jpg', 'longer strings only'], ['strings -t x lake.jpg | grep PK', 'where are the zip headers?']],
      notes: 'strings is the duct tape of forensics, but compressed data (zip, png) hides its content from it. if strings finds file names but not their content, something is compressed.', see: ['grep', 'xxd', 'binwalk'] },
    xxd: { d: 'make a hex dump, or reverse one', syn: ['xxd [-s offset] [-l len] [-c cols] [-p] [file]', 'xxd -r -p [hex]'],
      opts: [['-s N', 'start at offset (decimal or 0x hex, negative counts from the end)'], ['-l N', 'only dump N bytes'], ['-c N', 'bytes per line'], ['-p', 'plain hex, no offsets'], ['-r -p', 'reverse: hex back to bytes']],
      ex: [['xxd -s 0x4525 -l 64 lake.jpg', 'look at a specific offset'], ['xxd -s -32 file', 'the last 32 bytes'], ['head -n 1 ~/about.txt | xxd', 'the bytes behind a line of text']],
      notes: 'colours: grey = 00, green = printable, amber = everything else, blue = ff. long runs of 00 are slack or padding, long runs of amber are compressed or encrypted data.', see: ['hexdump', 'strings', 'unhex'] },
    hexdump: { d: 'canonical hex + ascii dump', syn: 'hexdump -C [-s offset] [-n len] [file]', see: ['xxd'] },
    exiftool: { d: 'read metadata from files', syn: 'exiftool file',
      desc: 'reads JPEG (JFIF, EXIF incl. GPS, comments), PNG (IHDR, tEXt/zTXt/iTXt, trailing data) and WAV metadata. GPS coordinates get a map link.',
      ex: [['exiftool postcard.jpg', 'everything'], ['exiftool postcard.jpg | grep -i gps', 'where was it taken?']],
      notes: 'photos leak: camera model, software, timestamps, GPS, author, comments. social media strips most of it, messengers often do not. a "Warning: trailer data after EOI" line means something is appended to the image.', see: ['file', 'binwalk', 'stat'] },
    binwalk: { d: 'find (and extract) files embedded in other files', syn: 'binwalk [-e] file',
      desc: 'scans every offset for known signatures: JPEG, PNG, GIF, ZIP (with names and sizes), gzip, PDF, ELF, 7z, WAV. -e extracts zip archives into _<file>.extracted/.',
      opts: [['-e', 'extract what it can (zip) into _<file>.extracted']],
      ex: [['binwalk lake.jpg', 'what is inside?'], ['binwalk -e lake.jpg', 'pull it out']],
      notes: 'binwalk reports offsets in decimal and hex. feed them to `dd skip=` or `xxd -s` to look closer. false positives happen: a random "LZMA" hit in the middle of image data usually means nothing.', see: ['foremost', 'dd', 'unzip', 'entropy'] },
    foremost: { d: 'carve files by their headers and footers', syn: 'foremost [-t jpg,png,zip,gif,pdf,wav] [-o outdir] file',
      desc: 'ignores the file system completely and scans raw bytes for known headers, then carves until the matching footer. output goes to ~/work/output/<type>/ with an audit.txt, like the real foremost. file names are the sector (512 byte block) where the file started.',
      opts: [['-t types', 'only carve these types (comma separated)'], ['-o dir', 'output directory (default ~/work/output)']],
      ex: [['foremost ~/cases/case-005/usb.img', 'carve a whole disk image'], ['foremost -t png usb.img && tree ~/work/output', 'only pngs']],
      notes: 'carving works when the file system is damaged or the entry is gone, but you lose file names and timestamps, and fragmented files come out broken. use fls/icat when the file system is intact, carve when it is not.', see: ['binwalk', 'icat', 'dd'] },
    dd: { d: 'copy and convert bytes, the original imaging tool', syn: 'dd if=input of=output [bs=N] [skip=N] [count=N]',
      desc: 'copies count blocks of bs bytes from input to output, after skipping skip blocks. with bs=1, skip and count are plain byte offsets.',
      ex: [['dd if=lake.jpg of=hidden.zip bs=1 skip=17701', 'carve from an offset to the end'], ['dd if=usb.img of=boot.bin bs=512 count=1', 'the boot sector']],
      notes: 'dd has no safety net: swap if= and of= on a real disk and the evidence is gone. that is why real imaging happens behind a hardware write-blocker.', see: ['binwalk', 'foremost', 'xxd'] },
    unzip: { d: 'list, test and extract zip archives', syn: 'unzip [-l] [-p] [-d dir] file [entry...]', desc: 'finds local file headers anywhere in the file, so it also works on polyglots (a zip glued to a jpeg) and reports the extra bytes in front.',
      opts: [['-l', 'list entries'], ['-p', 'print entries to stdout'], ['-d dir', 'extract into dir']], ex: [['unzip -l lake.jpg', 'a jpeg that is also a zip'], ['unzip -p lake.jpg flag.txt', 'print one entry']], see: ['binwalk', 'dd'] },
    stat: { d: 'file status: size, inode, MAC(B) times', syn: 'stat file...',
      desc: 'prints size, blocks, inode, permissions, owner and the four timestamps: Access, Modify, Change and Birth.',
      notes: 'MAC(B) times build timelines: Modify = content changed, Access = read, Change = metadata changed, Birth = created. reading a file normally updates atime, which is why evidence gets mounted read-only (or noatime): looking at it should not change it.', see: ['ls', 'fls', 'forensics'] },
    entropy: { d: 'shannon entropy of a file, with a graph', syn: 'entropy [-n buckets] file',
      desc: 'prints bits of entropy per byte (0 = all the same, 8 = random) and a sparkline across the file, like binwalk -E. bars are green for structured, amber for dense and red for compressed or encrypted.',
      ex: [['entropy ~/cases/case-005/usb.img', 'where is the data on the stick?'], ['entropy lake.jpg', 'jpeg vs appended zip']],
      notes: 'text sits around 4 to 5 bits/byte, executables around 5 to 6, compressed and encrypted data near 8. a high entropy island in a low entropy file is worth a closer look.', see: ['binwalk', 'xxd'] },
    xor: { d: 'xor data with a key', syn: ['xor key [file]', 'xor -s key [file]'], desc: 'key is hex (0x41, 4142) or, with -s or when it is not hex, a text string. the key repeats over the data.',
      ex: [['xor 0x20 file', 'single byte xor'], ['echo hello | xor -s key | xxd', 'xor with a word']],
      notes: 'single byte xor is the classic malware string obfuscation. xor with the plaintext gives back the key, and runs of 00 in the input leak the key directly.', see: ['xxd', 'entropy'] },
    pngcheck: { d: 'validate png chunks and crcs', syn: 'pngcheck [-v] file.png', desc: 'walks every chunk, recomputes every CRC, and reports data after IEND.', opts: [['-v', 'list every chunk']],
      ex: [['pngcheck -v nebula.png', 'chunk by chunk']], notes: 'a CRC error usually means someone edited the bytes by hand (often the width/height in IHDR to hide part of an image). data after IEND is a classic hiding spot.', see: ['exiftool', 'binwalk', 'stegsolve'] },
    cmp: { d: 'compare two files byte by byte', syn: 'cmp file1 file2', desc: 'prints the first differing byte and line. silent and exit 0 when identical.', ex: [['cmp ~/work/x.zip ~/work/_lake.jpg.extracted/4525.zip', 'did both carvings give the same bytes?']], see: ['diff', 'sha256sum'] },
    md5sum: { d: 'md5 hash', syn: 'md5sum file...', desc: 'for evidence files the result is compared with the evidence log.', notes: 'md5 is broken for collision resistance, but still everywhere in forensic tooling. use sha256 for anything that matters, keep md5 for compatibility.', see: ['sha256sum'] },
    sha1sum: { d: 'sha1 hash', syn: 'sha1sum file...', see: ['sha256sum'] },
    sha256sum: { d: 'sha256 hash (chain of custody)', syn: 'sha256sum file...', desc: 'for evidence files the hash is checked against the evidence log in BRIEFING.txt.',
      ex: [['sha256sum ~/cases/*/*.img', 'verify the disk image'], ['sha256sum /dev/sdb', 'same bytes as usb.img?']], notes: 'hash before, hash after. if they differ, someone (you?) changed the evidence.', see: ['md5sum', 'forensics'] },
    crc32: { d: 'crc32 checksum', syn: 'crc32 file', notes: 'zip and png store crc32s of their content. a mismatch points to corruption or tampering.', see: ['pngcheck'] },

    // ---- media
    view: { d: 'show an image in the terminal', syn: 'view image', ex: [['view ~/work/rec.png', 'look at what you recovered']], see: ['stegsolve', 'exiftool'] },
    stegsolve: { d: 'flip through colour bit planes', syn: 'stegsolve image',
      desc: 'shows the image, its inversion, every bit plane of every colour channel (and alpha) and gray bits. ← → switch, s saves the current view to ~/work.',
      notes: 'the lowest bit planes of a real photo look like noise. clean shapes or text in a low plane means someone wrote there. sequential LSB data (zsteg, steghide) does not show up as a picture, try entropy or a script for that.', see: ['view', 'pngcheck', 'entropy'] },
    spectrogram: { d: 'plot frequency over time', syn: 'spectrogram file.wav', desc: 'reads 8/16 bit PCM wav, runs an FFT with a hann window and shows the spectrogram. s saves it as png.',
      notes: 'sstv images, morse, dtmf tones and text drawn into the spectrum all become visible here. audacity and sonic visualiser do the same offline.', see: ['play', 'exiftool'] },
    play: { d: 'listen to a wav file', syn: 'play file.wav', see: ['spectrogram'] },

    // ---- network + disk
    tcpdump: { d: 'read packet captures', syn: 'tcpdump -r file.pcap [-c N] [-A | -X] [-t] [filter]',
      desc: 'decodes ethernet, ipv4, tcp, udp and dns (queries and answers), plus http request lines. filters: tcp, udp, icmp, port N, host IP, src/dst host|port X, joined with and / not.',
      opts: [['-r file', 'read a pcap file (this box has no live interfaces)'], ['-c N', 'stop after N packets'], ['-A', 'print payloads as ascii'], ['-X', 'print payloads as hex + ascii'], ['-t', 'no timestamps']],
      ex: [['tcpdump -r capture.pcap port 53', 'only dns'], ['tcpdump -r capture.pcap -A port 80', 'read the http'], ['tcpdump -r capture.pcap | grep "TXT?"', 'odd dns queries']],
      notes: 'dns is the protocol everyone lets through the firewall, so attackers tunnel data through it: long random-looking subdomains, lots of TXT queries, one weird zone. sequence numbers in the labels tell you the order.', see: ['strings', 'grep', 'unhex'] },
    fsstat: { d: 'file system details of an image', syn: 'fsstat image', desc: 'layout of a FAT12/16 image: boot sector, FATs, root directory, data area, cluster size, labels.', see: ['fls', 'icat', 'mmls'] },
    fls: { d: 'list files in an image, deleted ones too', syn: 'fls [-r] [-d] [-u] [-l] [-p] image [dir-inode]',
      desc: 'lists directory entries of a FAT12/16 image with their inode numbers, the same numbers the sleuth kit uses. deleted entries get a * and their first letter replaced by _.',
      opts: [['-r', 'recurse into directories'], ['-d', 'deleted entries only'], ['-u', 'undeleted entries only'], ['-l', 'long: times and sizes'], ['-p', 'full paths']],
      ex: [['fls -r usb.img', 'everything'], ['fls -d usb.img', 'only what someone tried to delete']],
      notes: 'deleting a file on FAT only overwrites the first byte of its name with 0xE5 and frees its clusters in the FAT. the data stays until something overwrites it.', see: ['icat', 'fsstat', 'foremost'] },
    icat: { d: 'extract a file from an image by inode', syn: 'icat image inode [> outfile]',
      desc: 'reads the content of a file by its inode number, following the FAT chain. for deleted files (chain gone) it assumes the clusters were contiguous, like the sleuth kit. binary output needs a redirect.',
      ex: [['icat usb.img 4', 'print a text file'], ['icat usb.img 9 > ~/work/r.png && view ~/work/r.png', 'recover a deleted image']], see: ['fls', 'view', 'foremost'] },
    mmls: { d: 'partition layout of a disk image', syn: 'mmls image', see: ['fsstat'] },

    // ---- cases
    cases: { d: 'the evidence locker: every case and your progress', syn: 'cases', desc: 'lists the cases. click one to open its briefing. progress is stored in your browser.', see: ['hint', 'submit', 'intro'] },
    hint: { d: 'a nudge for a case', syn: 'hint [case] [1|2]', desc: 'each case has two hints, from gentle to blunt. run it twice for the second. inside a case folder the case number is optional.', see: ['cases'] },
    submit: { d: 'submit a flag', syn: 'submit ' + LX_CONFIG.flagPrefix + '{...}', desc: 'flags are checked locally: your guess goes through PBKDF2 (' + LX_EVIDENCE.kdf.iterations.toLocaleString('en') + ' rounds of SHA-256) and the result is compared to the hashes in the source. your guess never leaves the browser. the source is public, so every flag carries 10 random characters, which makes guessing them a matter of months per flag on a big GPU. solving the case is faster.', see: ['cases'] },

    // ---- system
    history: { d: 'your shell history', syn: 'history [-i] [-c]', opts: [['-i', 'with timestamps'], ['-c', 'clear the session history']], notes: 'shell history is evidence. it is also in ~/.zsh_history, with unix timestamps.', see: ['zsh', 'last'] },
    alias: { d: 'list or define aliases', syn: "alias [name='command']", see: ['zsh'] },
    logout: { d: 'log out and pick another name', syn: 'logout', desc: 'ends the session (logged in /var/log/auth.log and wtmp) and opens the login popup again. also `exit`.', see: ['last', 'who'] },
    last: { d: 'login history', syn: 'last', desc: 'reads the logins this browser has seen, like wtmp on a real box.', notes: 'wtmp (logins), btmp (failed logins) and lastlog are classic first stops in linux incident response.', see: ['who', 'journalctl'] },
    who: { d: 'who is logged in', syn: 'who', see: ['w', 'last'] },
    w: { d: 'who is logged in and what they are doing', syn: 'w', see: ['who', 'ps'] },
    ps: { d: 'process list', syn: 'ps [aux]', see: ['htop', 'kill'] },
    htop: { d: 'interactive process viewer', syn: 'htop', desc: 'cpu meters for all 192 threads, memory, swap, load and the busiest processes. q quits. also `top`.', see: ['ps', 'free', 'nvidia-smi'] },
    kill: { d: 'send a signal to a process', syn: 'kill [-9] pid', see: ['ps'] },
    free: { d: 'memory usage', syn: 'free [-h]', see: ['htop'] },
    df: { d: 'disk space per file system', syn: 'df [-h]', see: ['du', 'lsblk'] },
    du: { d: 'disk usage of files and directories', syn: 'du [-sh] [dir]', see: ['df'] },
    lscpu: { d: 'cpu information', syn: 'lscpu', see: ['htop'] },
    lsblk: { d: 'list block devices', syn: 'lsblk', notes: 'RO=1 means the kernel sees the device as read-only. with a hardware write-blocker in between, even root cannot change that.', see: ['lsusb', 'fsstat'] },
    lsusb: { d: 'list usb devices', syn: 'lsusb', see: ['lsblk', 'dmesg'] },
    'nvidia-smi': { d: 'gpu status', syn: 'nvidia-smi', see: ['htop'] },
    dmesg: { d: 'kernel messages', syn: 'dmesg', notes: 'dmesg shows when usb devices were attached and whether they came up write-protected. it is the first place to check that an evidence drive really is read-only.', see: ['lsusb', 'journalctl'] },
    journalctl: { d: 'system journal', syn: 'journalctl [-f]', see: ['dmesg', 'last'] },
    ip: { d: 'network interfaces', syn: 'ip a', desc: 'only loopback is up. the workstation is air-gapped on purpose. also `ifconfig`.', see: ['ping'] },
    ping: { d: 'send icmp echo requests', syn: 'ping host', desc: 'only localhost answers. everything else: network unreachable.', see: ['ip'] },
    cal: { d: 'calendar', syn: 'cal' },
    sleep: { d: 'wait', syn: 'sleep seconds' },
    yes: { d: 'print a string forever (or until stopped)', syn: 'yes [text]' },

    // ---- fun
    hyfetch: { d: 'system info with pride flags', syn: ['hyfetch [-p preset]', 'hyfetch --help'],
      desc: 'hyfetch colours the distro logo with a pride flag and uses fastfetch underneath. the default preset is in ~/.config/hyfetch.json.',
      opts: [['-p preset', 'lesbian, rainbow, transgender, nonbinary, bisexual, pansexual, asexual, aromantic, agender, genderfluid, gay-men (short: trans, enby, bi, pan, ace, aro, gay)']],
      ex: [['hyfetch -p trans', 'trans flag'], ['pride', 'see all of them']], see: ['fastfetch', 'pride'] },
    fastfetch: { d: 'system info, plus some very honest stats', syn: 'fastfetch', desc: 'when piped it drops the logo and colours, like the real one.', ex: [['fastfetch | grep -i -e cpu -e memory', 'just the brag lines']], see: ['hyfetch'] },
    fortune: { d: 'a random saying', syn: 'fortune [wisdom | tips | me]', desc: 'tips are real, useful forensics tips.' },
    magic: { d: 'quiz: name the file type from its first bytes', syn: 'magic [rounds]', desc: 'shows a file header in hex and ascii, you pick the type with 1-4. LNK, EVTX, registry hives, LUKS and friends included.', see: ['file', 'xxd'] },
    enhance: { d: 'the crime tv move', syn: 'enhance' },
    pride: { d: 'every flag hyfetch knows', syn: 'pride', see: ['hyfetch'] }
  };
  M.more = M.less; M.top = M.htop; M.ifconfig = M.ip; M.exit = M.logout; M.ent = M.entropy; M[LX_CONFIG.siteName] = M.intro;

  // ------------------------------------------------------------ rendering
  function pageFor(name) {
    if (M[name]) return M[name];
    var c = LX.cmds[name];
    if (!c || c.hidden) return null;
    return { d: c.help || name, syn: c.usage || name, generated: true };
  }
  function inline(t) { return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>'); }
  function asArr(x) { return x ? (Array.isArray(x) ? x : [x]) : []; }
  function title(name, p) { return name.toUpperCase() + '(' + (p.s || 1) + ')'; }

  function renderHTML(name, p) {
    var t = title(name, p), h = '<div class="man">';
    h += '<div class="man-hf"><span>' + esc(t) + '</span><span>' + esc(LX_CONFIG.siteName) + ' manual</span><span>' + esc(t) + '</span></div>';
    var sec = function (head, body) { h += '<h3>' + head + '</h3><div class="man-b">' + body + '</div>'; };
    sec('NAME', '<b>' + esc(name) + '</b> - ' + inline(p.d));
    if (p.syn) sec('SYNOPSIS', asArr(p.syn).map(function (s) { var i = s.indexOf(' '); return '<div><b>' + esc(i < 0 ? s : s.slice(0, i)) + '</b>' + esc(i < 0 ? '' : s.slice(i)) + '</div>'; }).join(''));
    if (p.desc) sec('DESCRIPTION', p.desc.split('\n\n').map(function (para) { return '<p class="' + (/\n/.test(para) ? 'pre' : '') + '">' + inline(para) + '</p>'; }).join(''));
    else if (p.generated) sec('DESCRIPTION', '<p>' + inline(p.d) + '.</p><p class="c-dim">a short page for a simple command.</p>');
    if (p.opts) h += '<h3>OPTIONS</h3><dl class="man-opts">' + p.opts.map(function (o) { return '<dt>' + esc(o[0]) + '</dt><dd>' + inline(o[1]) + '</dd>'; }).join('') + '</dl>';
    if (p.ex) sec('EXAMPLES', p.ex.map(function (e) { return '<div class="man-ex"><code data-run="' + esc(e[0]) + '">' + esc(e[0]) + '</code><div>' + inline(e[1]) + '</div></div>'; }).join(''));
    if (p.notes) sec('FORENSICS NOTES', '<p>' + inline(p.notes) + '</p>');
    if (p.see) sec('SEE ALSO', p.see.map(function (s) { var sp = pageFor(s); return '<span class="man-see" data-man="' + esc(s) + '">' + esc(s) + '(' + ((sp && sp.s) || 1) + ')</span>'; }).join(', '));
    h += '<div class="man-hf"><span>' + esc(LX_CONFIG.domain) + '</span><span>' + new Date().getFullYear() + '</span><span>' + esc(t) + '</span></div></div>';
    return h;
  }
  // plain text, for `man x | grep ...`
  function wrap(text, indent, width) {
    var out = [], pad = ' '.repeat(indent);
    text.split('\n').forEach(function (line) {
      var words = line.split(' '), cur = '';
      words.forEach(function (w) { if ((cur + ' ' + w).trim().length > width - indent && cur) { out.push(pad + cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
      out.push(pad + cur);
    });
    return out.join('\n');
  }
  function renderText(name, p) {
    var t = title(name, p), L = [t + ' '.repeat(Math.max(1, 30 - t.length)) + LX_CONFIG.siteName + ' manual' + ' '.repeat(Math.max(1, 30 - t.length)) + t, ''];
    var sec = function (head, body) { L.push(head, body, ''); };
    var plain = function (s) { return s.replace(/`/g, ''); };
    sec('NAME', '       ' + name + ' - ' + plain(p.d));
    if (p.syn) sec('SYNOPSIS', asArr(p.syn).map(function (s) { return '       ' + s; }).join('\n'));
    if (p.desc) sec('DESCRIPTION', p.desc.split('\n\n').map(function (para) { return /\n/.test(para) ? para.split('\n').map(function (l) { return '       ' + plain(l); }).join('\n') : wrap(plain(para), 7, 78); }).join('\n\n'));
    if (p.opts) sec('OPTIONS', p.opts.map(function (o) { return '       ' + o[0] + '\n' + wrap(plain(o[1]), 14, 78); }).join('\n'));
    if (p.ex) sec('EXAMPLES', p.ex.map(function (e) { return '       ' + e[0] + '\n' + wrap(plain(e[1]), 11, 78); }).join('\n'));
    if (p.notes) sec('FORENSICS NOTES', wrap(plain(p.notes), 7, 78));
    if (p.see) sec('SEE ALSO', '       ' + p.see.map(function (s) { var sp = pageFor(s); return s + '(' + ((sp && sp.s) || 1) + ')'; }).join(', '));
    L.push(LX_CONFIG.domain + ' '.repeat(28) + new Date().getFullYear() + ' '.repeat(28) + t);
    return L.join('\n');
  }

  // ------------------------------------------------------------ the pager
  // content: { html } or { text }. returns when closed
  LX.pager = function (ctx, o) {
    var box, status, cur = o;
    function paint() {
      if (cur.html) box.innerHTML = cur.html; else { box.innerHTML = ''; var pre = document.createElement('pre'); pre.className = 'pager-text'; pre.textContent = cur.text; box.appendChild(pre); }
      box.scrollTop = 0; LX.$('ov-title').textContent = cur.title; upd();
    }
    function upd() {
      var max = box.scrollHeight - box.clientHeight, pct = max <= 0 ? 100 : Math.round(box.scrollTop / max * 100);
      status.textContent = ' ' + cur.label + (pct >= 100 ? ' (END)' : ' ' + pct + '%') + '  (press q to quit)';
    }
    return LX.ui.overlay({
      title: o.title, help: 'q quit · j/k ↑/↓ scroll · space/b page · g/G top/end',
      build: function (body) {
        body.classList.add('pager-mode');
        box = document.createElement('div'); box.className = 'pager'; box.tabIndex = -1;
        status = document.createElement('div'); status.className = 'pager-status';
        body.appendChild(box); body.appendChild(status);
        box.addEventListener('scroll', upd);
        box.addEventListener('click', function (e) {
          var see = e.target.closest('[data-man]');
          if (see) { var n = see.getAttribute('data-man'), p = pageFor(n); if (p) { cur = { title: 'man ' + n, label: 'Manual page ' + n + '(' + (p.s || 1) + ')', html: renderHTML(n, p) }; paint(); } }
        });
        paint();
      },
      onKey: function (e) {
        var line = 22, page = box.clientHeight - 44;
        var k = e.key;
        if (k === 'j' || k === 'ArrowDown' || k === 'Enter') box.scrollTop += line;
        else if (k === 'k' || k === 'ArrowUp') box.scrollTop -= line;
        else if (k === ' ' || k === 'PageDown' || k === 'f' || k === 'd') box.scrollTop += page;
        else if (k === 'b' || k === 'PageUp' || k === 'u') box.scrollTop -= page;
        else if (k === 'g' || k === 'Home') box.scrollTop = 0;
        else if (k === 'G' || k === 'End') box.scrollTop = box.scrollHeight;
        else return false;
        return true;
      },
      onClose: function () { LX.$('ov-body').classList.remove('pager-mode'); }
    }, ctx.signal);
  };

  // ------------------------------------------------------------ commands
  function lookup(args) {
    var a = args.slice(), section = null;
    if (/^\d$/.test(a[0])) section = +a.shift();
    var name = a[0];
    if (!name) return { err: 'What manual page do you want?\nFor example, try \'man man\'.' };
    var alias = LX.aliases[name];
    var p = pageFor(name);
    if (!p && alias) { name = alias.split(' ')[0]; p = pageFor(name); }
    if (!p || (section && (p.s || 1) !== section)) {
      var near = Object.keys(M).concat(Object.keys(LX.cmds).filter(function (k) { return !LX.cmds[k].hidden; })).filter(function (k) { return LX.lev(k, a[0]) <= 1; });
      return { err: 'No manual entry for ' + a[0] + (section ? ' in section ' + section : ''), near: near.slice(0, 3) };
    }
    return { name: name, p: p, alias: alias && a[0] };
  }
  def('man', { cat: 'start', help: 'the manual. every command has a page', usage: 'man [section] page | man -k keyword' }, function (ctx) {
    if (ctx.args[0] === '-k') return LX.cmds.apropos.fn({ args: ctx.args.slice(1), out: ctx.out, piped: ctx.piped });
    var r = lookup(ctx.args);
    if (r.err) {
      ctx.out.err(r.err);
      if (r.near && r.near.length) ctx.out.html(span('c-dim', 'did you mean: ') + r.near.map(function (n) { return LX.cmdLink('man ' + n, n, 'c-cyan'); }).join(', '));
      return 16;
    }
    if (r.alias && !ctx.piped) ctx.out.text(r.alias + ' is an alias for ' + LX.aliases[r.alias], 'c-dim');
    if (ctx.piped) return ctx.out.text(renderText(r.name, r.p));
    return LX.pager(ctx, { title: 'man ' + r.name, label: 'Manual page ' + r.name + '(' + (r.p.s || 1) + ')', html: renderHTML(r.name, r.p) });
  });
  function allPages() {
    var dup = ['more', 'top', 'ifconfig', 'exit', 'ent', LX_CONFIG.siteName];
    var names = Object.keys(M).filter(function (k) { return dup.indexOf(k) < 0; });
    Object.keys(LX.cmds).forEach(function (k) { if (!LX.cmds[k].hidden && names.indexOf(k) < 0) names.push(k); });
    return names.sort();
  }
  def('apropos', { cat: 'start', help: 'search the manual by keyword', usage: 'apropos keyword' }, function (ctx) {
    var kw = (ctx.args.join(' ') || '').toLowerCase();
    if (!kw) return ctx.out.err('apropos what?');
    var hits = allPages().filter(function (n) { var p = pageFor(n); return p && (n.toLowerCase().indexOf(kw) >= 0 || (p.d + ' ' + (p.desc || '') + ' ' + (p.notes || '')).toLowerCase().indexOf(kw) >= 0); });
    if (!hits.length) { ctx.out.text(kw + ': nothing appropriate.'); return 16; }
    hits.forEach(function (n) {
      var p = pageFor(n), left = LX.pad(n + ' (' + (p.s || 1) + ')', 22);
      if (ctx.piped) ctx.out.text(left + ' - ' + p.d.replace(/`/g, ''));
      else ctx.out.html(LX.cmdLink('man ' + n, left, 'c-cyan') + span('c-dim', ' - ') + inline(p.d));
    });
  });
  def('whatis', { cat: 'start', help: 'one line description of a command', usage: 'whatis command...' }, function (ctx) {
    if (!ctx.args.length) return ctx.out.err('whatis what?');
    ctx.args.forEach(function (n) {
      var p = pageFor(n);
      if (!p) return ctx.out.err(n + ': nothing appropriate.');
      ctx.out.text(LX.pad(n + ' (' + (p.s || 1) + ')', 22) + ' - ' + p.d.replace(/`/g, ''));
    });
  });
  def('tldr', { cat: 'start', help: 'just the examples', usage: 'tldr command' }, function (ctx) {
    var n = ctx.args[0], p = n && pageFor(n);
    if (!p) return ctx.out.err(n ? 'tldr: no page for ' + n : 'tldr: which command?');
    ctx.out.html(span('c-amber b', n) + span('c-dim', '  ' + p.d.replace(/`/g, '')));
    if (!p.ex) { ctx.out.html(span('c-dim', 'no examples yet. the full page: ') + LX.cmdLink('man ' + n, 'man ' + n, 'c-cyan')); return; }
    p.ex.forEach(function (e) {
      if (ctx.piped) { ctx.out.text('- ' + e[1].replace(/`/g, '') + ':\n    ' + e[0]); return; }
      ctx.out.html(span('c-dim', '- ') + inline(e[1]) + ':');
      ctx.out.html('    ' + LX.cmdLink(e[0], e[0], 'c-cyan'));
    });
  });
  def('less', { cat: 'text', help: 'page through text (q quits)', usage: 'less file | cmd | less' }, async function (ctx) {
    var name = ctx.args[0], s;
    if (name !== undefined) { var f = LX.open(ctx, name, ctx.name); if (!f) return; s = await LX.fs.text(f.node); }
    else if (ctx.stdin !== null) s = ctx.stdin;
    else return ctx.out.err('Missing filename ("less --help" for help)');
    if (ctx.piped) return ctx.out.text(s.replace(/\n$/, ''));
    return LX.pager(ctx, { title: ctx.name + ' ' + (name || '(stdin)'), label: name || '(stdin)', text: s.replace(/\n$/, '') });
  });
  LX.cmds.more = LX.cmds.less;

  // running an example from inside the pager closes it and runs the command
  document.addEventListener('click', function (e) {
    var ex = e.target.closest('.man [data-run]');
    if (!ex) return;
    var cmd = ex.getAttribute('data-run');
    LX.$('ov-close').click();
    setTimeout(function () { LX.ui.input.value = cmd; LX.ui.renderInput(); LX.ui.focus(); }, 60);
  });

  // help <cmd> gets a short summary instead of the full pager
  var oldHelp = LX.cmds.help.fn;
  LX.cmds.help.fn = function (ctx) {
    if (!ctx.args[0]) return oldHelp(ctx);
    var n = ctx.args[0], p = pageFor(n);
    if (!p) { ctx.out.err('help: no help topics match `' + n + "'. try apropos " + n); return 1; }
    ctx.out.html(span('c-amber b', n) + span('c-dim', ' - ') + inline(p.d));
    asArr(p.syn).forEach(function (s) { ctx.out.html('  ' + span('c-dim', 'usage: ') + esc(s)); });
    ctx.out.html('  ' + LX.cmdLink('man ' + n, 'man ' + n, 'c-cyan') + span('c-dim', ' for the full page' + (p.ex ? ', ' : '')) + (p.ex ? LX.cmdLink('tldr ' + n, 'tldr ' + n, 'c-cyan') + span('c-dim', ' for examples') : ''));
  };
})();
