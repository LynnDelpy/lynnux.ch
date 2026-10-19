// config.js :: everything personal lives here. edit this file, not the others.
// any link set to null is hidden everywhere (terminal + plain view).

var LX_CONFIG = {
  handle: 'lynn',
  host: 'lynnux',
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
    "hi, i'm lynn.",
    '',
    'i do digital forensics, mostly in ctfs: disk images, memory dumps,',
    'packet captures, and files that pretend to be other files.',
    'based in switzerland, running cachyos (arch based, so yes, btw).',
    '',
    'this site is a forensic workstation. ~/cases has real challenges:',
    'real files you can solve right here in the browser, or download',
    'and throw at your own tools. everything you need is on this machine.'
  ],

  // `neofetch`
  machine: {
    os: 'CachyOS x86_64',
    kernel: '6.17-cachyos',
    cpu: 'Intel i7-1165G7 (8) @ 4.7GHz',
    mem: '16 GiB',
    shell: 'zsh',
    de: null,      // TODO e.g. 'Hyprland'
    editor: null   // TODO
  },

  // writeups shown in ~/writeups. [{title, url}]
  writeups: []
};
