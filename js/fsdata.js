// fsdata.js :: what's on the machine. built at boot from config + cases + generated evidence.
'use strict';

LX.authlog = (function (h, o) {
  return [
    'Jul 31 23:51:02 ' + h + ' sshd[3121]: Failed password for root from 203.0.113.66 port 51122 ssh2',
    'Jul 31 23:51:04 ' + h + ' sshd[3121]: Failed password for root from 203.0.113.66 port 51122 ssh2',
    'Jul 31 23:51:09 ' + h + ' sshd[3125]: Invalid user admin from 203.0.113.66 port 51130',
    'Jul 31 23:52:40 ' + h + ' sshd[3140]: Invalid user suspect_47 from 198.51.100.23 port 40022',
    'Aug  1 00:00:01 ' + h + ' CRON[3301]: pam_unix(cron:session): session opened for user root',
    'Aug  1 08:12:55 ' + h + ' sudo:     ' + o + ' : TTY=pts/0 ; PWD=/home/' + o + ' ; USER=root ; COMMAND=/usr/bin/dd if=/dev/sdb of=usb.img bs=4M status=progress',
    'Aug  1 08:13:02 ' + h + ' sudo:     ' + o + ' : TTY=pts/0 ; PWD=/home/' + o + ' ; USER=root ; COMMAND=/usr/bin/sha256sum usb.img'
  ];
})(LX.HOST, LX_CONFIG.owner);

LX.oldHistory = [
  'cd ~/cases && ls -la',
  'sha256sum case-005/usb.img',
  'exiftool case-001/postcard.jpg',
  'binwalk case-003/lake.jpg',
  'tcpdump -r case-004/capture.pcap | grep -i telemetry',
  'cd ~',
  'cat about.txt',
  'wc -c about.txt',
  '# why is about.txt so much bigger than what cat shows me',
  'xxd about.txt | head -20',
  '# note to self: setopt HIST_IGNORE_SPACE. start a command with a space and it never lands in here'
];

LX.buildFS = function () {
  var C = LX_CONFIG, D = LX.D, F = LX.F;
  var evDate = new Date(2025, 7, 1, 21, 47);

  // ~/links, only the ones that are set
  var links = {};
  var L = C.links || {};
  Object.keys(L).forEach(function (k) { if (L[k]) links[k] = { t: 'l', url: L[k] }; });
  if (C.email) links.email = { t: 'l', url: 'mailto:' + C.email, label: C.email };
  if (C.discord) links.discord = { t: 'l', url: 'discord: ' + C.discord, copy: C.discord };

  // ~/writeups
  var wu = {};
  (C.writeups || []).forEach(function (w, i) {
    wu[(w.title || 'writeup-' + i).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')] = { t: 'l', url: w.url };
  });
  wu.README = F((C.writeups || []).length
    ? 'writeups. `open <name>` to read one.\n'
    : 'nothing published here yet. the cases in ~/cases are the best preview of\nwhat kind of stuff i like to dig into.\n');

  // ~/cases
  var cases = { README: F(
    'evidence locker. every case-xxx folder has a BRIEFING.txt and the evidence.\n\n' +
    '  cases            overview + your progress\n' +
    '  cat BRIEFING.txt read the case file\n' +
    '  hint <case>      when you are stuck\n' +
    '  submit <flag>    flags look like ' + LX_CONFIG.flagPrefix + '{...}\n\n' +
    'the evidence is write-blocked (read-only). tools that produce files\n' +
    'drop them into ~/work instead. every file can be downloaded too:\n' +
    '  download <file>  then use your own tools (exiftool, binwalk, wireshark, ...)\n', { ro: true }) };
  LX_CASES.forEach(function (cs) {
    var dir = { 'BRIEFING.txt': F(LX.cases.briefing(cs), { ro: true, mtime: evDate }) };
    (LX_EVIDENCE.files[cs.id] || []).forEach(function (f) {
      dir[f.name] = { t: 'b', src: f.path, size: f.size, md5: f.md5, sha256: f.sha256, ro: true, mtime: evDate };
    });
    cases['case-' + cs.id] = D(dir, { ro: true });
  });

  // about.txt, with a little something extra after the first line ;)
  var about = C.about.slice();
  about[0] = about[0] + LX_EVIDENCE.zw;

  var home = D({
    'about.txt': F(about.join('\n') + '\n'),
    links: D(links),
    cases: D(cases, { ro: true }),
    writeups: D(wu),
    work: D({ 'README': F('scratch space. tools write their output here when the cwd is read-only.\n') }),
    // zsh EXTENDED_HISTORY format, ": <epoch>:<duration>;<command>". a timeline for free
    '.zsh_history': { t: 'f', get text() {
      var old = LX.oldHistory.map(function (c, i) { return ': ' + (1754035980 + i * 47) + ':0;' + c; });
      var now = LX.hist.map(function (c, i) { return ': ' + Math.floor(LX.histTimes[i] / 1000) + ':0;' + c; });
      return old.concat(now).join('\n') + '\n';
    } },
    '.zshrc': F([
      '# ~/.zshrc for guests on ' + LX.HOST,
      'HISTFILE=~/.zsh_history',
      'HISTSIZE=100000',
      'SAVEHIST=100000',
      'setopt EXTENDED_HISTORY INC_APPEND_HISTORY HIST_IGNORE_SPACE',
      '# yes, even guest history is evidence',
      '',
      'source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh',
      'source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh',
      '',
      "PROMPT='%F{214}%n%f@%F{214}%M%f %F{cyan}%~%f %(?.%F{green}.%F{red})❯%f '",
      '',
      "alias ll='ls -la'",
      "alias please='sudo'",
      '',
      '# every shell starts with pride',
      'hyfetch',
      ''
    ].join('\n')),
    '.local': D({ share: D({ Trash: D({
      files: D({ 'note_to_self.txt': F('if you are reading this, you went through the trash.\n' +
        "that is exactly what a forensic investigator does. you'd be good at this.\n\n" +
        'tip: on a real linux desktop, ~/.local/share/Trash/info/*.trashinfo\n' +
        'tells you where a file came from and when it was deleted.\n') }),
      info: D({ 'note_to_self.txt.trashinfo': F('[Trash Info]\nPath=' + LX.HOME + '/note_to_self.txt\nDeletionDate=2025-08-01T23:59:12\n') })
    }) }) }),
    '.config': D({
      'hyfetch.json': F(JSON.stringify({
        preset: C.hyfetchPreset, mode: 'rgb', light_dark: 'dark', lightness: 0.65,
        color_align: { mode: 'horizontal', custom_colors: [], fore_back: null },
        backend: 'fastfetch', args: null, distro: null, pride_month_shown: [], pride_month_disable: false
      }, null, 2) + '\n'),
      fastfetch: D({ 'config.jsonc': F('// fastfetch does the fetching, hyfetch does the colours\n{\n  "$schema": "https://github.com/fastfetch-cli/fastfetch/raw/dev/doc/json_schema.json",\n  "logo": { "type": "builtin", "source": "arch" },\n  "display": { "separator": ": ", "bar": { "char": { "elapsed": "■", "total": "■" }, "width": 10 } },\n  "modules": ["title", "separator", "os", "host", "kernel", "uptime", "packages", "shell", "de", "wm", "theme", "terminal", "cpu", "gpu", "memory", "swap", "disk", "battery", "colors"]\n}\n') })
    })
  });

  var cpu = C.machine.cpu || 'unknown';
  // /usr/bin: one tiny fake ELF per command. `strings /usr/bin/grep` shows its usage
  function usrBin() {
    var d = {}, hdr = [0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0x3e, 0, 1, 0, 0, 0];
    Object.keys(LX.cmds).sort().forEach(function (k) {
      var c = LX.cmds[k];
      if (c.hidden) return;
      var txt = new TextEncoder().encode('\0' + C.siteName + ' ' + k + '\0usage: ' + c.usage + '\0' + c.help + '\0GCC: (GNU) 15.2.1\0');
      var b = new Uint8Array(hdr.length + 40 + txt.length);
      b.set(hdr); b.set(txt, hdr.length + 40);
      d[k] = { t: 'b', data: b, ro: true };
    });
    return D(d);
  }
  LX.fs.root = D({
    home: D((function () { var h = {}; h[LX.USER] = home; return h; })()),
    tmp: D({}),
    'lost+found': D({ '#1337': F('fsck found this:\n\nyour motivation. it was in /lost+found the whole time.\n\n(go solve a case: `cases`)\n') }),
    usr: D({ bin: usrBin(), share: D({ man: D({ README: F('the manual pages live in js/man.js on the real web server. use `man <command>`.\n') }) }) }),
    dev: D({
      'null': F('', { devnull: true }),
      zero: { t: 'b', data: new Uint8Array(4096) },
      urandom: { t: 'b', get data() { return crypto.getRandomValues(new Uint8Array(4096)); } },
      // the suspect's usb stick from the boot log. same bytes as ~/cases/case-005/usb.img
      sdb: (function () {
        var f = (LX_EVIDENCE.files['005'] || [])[0];
        return f ? { t: 'b', src: f.path, size: f.size, md5: f.md5, sha256: f.sha256, ro: true } : F('');
      })()
    }),
    etc: D({
      hostname: F(LX.HOST + '\n'),
      shells: F('# Pathnames of valid login shells.\n/bin/sh\n/bin/bash\n/usr/bin/bash\n/bin/zsh\n/usr/bin/zsh\n'),
      motd: F('welcome to ' + LX.HOST + '. this is a forensic workstation.\nwrite-blocker is ON. evidence stays untouched. have fun.\n'),
      'os-release': F('NAME="Arch Linux"\nPRETTY_NAME="Arch Linux"\nID=arch\nBUILD_ID=rolling\nVARIANT="forensic workstation"\nANSI_COLOR="38;2;23;147;209"\nHOME_URL="https://archlinux.org/"\nLOGO=archlinux-logo\n'),
      passwd: F('root:x:0:0:root:/root:/bin/bash\n' + C.owner + ':x:1000:1000::/home/' + C.owner + ':/usr/bin/zsh\n' +
        (LX.USER !== C.owner ? LX.USER + ':x:1001:1001:visitor:' + LX.HOME + ':/usr/bin/zsh\n' : '') + 'suspect_47:x:4747:4747:do not trust:/nonexistent:/usr/sbin/nologin\n'),
      shadow: F('', { denied: true }),
      'hosts': F('127.0.0.1  localhost\n127.0.1.1  ' + LX.HOST + '\n# 198.51.100.23  update.telemetry-cdn.example   <- blocked after case LX-004\n')
    }),
    proc: D({
      cpuinfo: F('processor\t: 191\nmodel name\t: ' + cpu + '\ncpu cores\t: 96\nsiblings\t: 192\nflags\t\t: fpu sse4_2 avx2 avx512f aes sha_ni forensics write_blocker\nbogomips\t: 10800.00\n# (processors 0 to 190 omitted, they look the same)\n'),
      meminfo: F('MemTotal:       ' + C.machine.mem + '\nMemFree:        enough\nEvidenceCache:  plenty\n'),
      version: F('Linux version ' + C.machine.kernel + ' (' + LX.HOST + ') #1 SMP PREEMPT_DYNAMIC\n'),
      uptime: F(Math.floor(performance.now() / 1000) + '.00 0.00\n')
    }),
    var: D({ log: D({ 'auth.log': { t: 'f', get text() { return LX.authlog.join('\n') + '\n'; } } }) })
  });
  LX.fs.cwd = LX.HOME;
};
