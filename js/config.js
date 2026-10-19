// config.js :: everything personal lives here. edit this file, not the others.
// any link set to null is hidden everywhere (terminal + plain view).

var LX_CONFIG = {
  host: 'lucia',        // the machine name, shown in the prompt
  domain: 'lynnux.ch',
  tagline: 'digital forensics · ctf · linux',
  location: 'switzerland',

  links: {
    github:   'https://github.com/LynnDelpy',
    ctftime:  null, // TODO 'https://ctftime.org/user/XXXXX'
    mastodon: null, // TODO 'https://infosec.exchange/@you'
    twitter:  null,
    linkedin: null,
    blog:     null  // TODO writeups site, if you have one
  },
  email: null,    // TODO e.g. 'hi@lynnux.ch' once the domain + mail are set up
  discord: null,  // TODO your discord username, gets copied to clipboard
  teams: [],      // TODO ctf teams, e.g. ['team-one', 'team-two']

  // shown by `cat about.txt` and in the plain view. one string per line.
  about: [
    'hi :)',
    '',
    'i do digital forensics, mostly in ctfs: disk images, memory dumps,',
    'packet captures, and files that pretend to be other files.',
    'based in switzerland. i use arch, btw.',
    '',
    'this site is a forensic workstation. ~/cases has real challenges:',
    'real files you can solve right here in the browser, or download',
    'and throw at your own tools. everything you need is on this machine.'
  ],

  // `fastfetch` / `hyfetch`. this machine is... aspirational. null = line hidden
  // (keep values under ~55 chars or the line wraps next to the logo)
  machine: {
    os: 'Arch Linux x86_64',
    kernel: '6.17.2-arch1-1',
    host: 'a 42U rack in the living room',
    display: '3x 5120x2160 @ 240 Hz (one is just for htop)',
    cpu: 'AMD Ryzen Threadripper PRO 9995WX (192) @ 5.40 GHz',
    gpu: '4x NVIDIA RTX PRO 6000 Blackwell (96 GB each)',
    mem: '1.00 TiB',
    swap: '2.00 TiB',
    disk: '64.0 TiB',
    power: '2.4 kW at idle (the lights flicker)',
    temp: '31°C (LN2, plus a swiss basement)',
    shell: 'zsh 5.9',
    de: 'KDE Plasma 6.5',            // TODO match `plasmashell --version`
    wm: 'KWin (Wayland)',
    theme: 'started as Breeze, long ago [Qt]',
    terminal: null  // TODO e.g. 'konsole 25.08'
  },

  // writeups shown in ~/writeups. [{title, url}]
  writeups: []
};
