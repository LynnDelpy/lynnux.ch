// gui.js :: the "not a terminal person?" panel. same content, no typing required.
'use strict';

(function () {
  var panel = LX.$('gui'), toggle = LX.$('gui-toggle');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function link(href, text) {
    var a = el('a', '', text);
    a.href = href;
    if (!/^mailto:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }

  var BEYOND = ['crypto', 'rev', 'web', 'misc'];
  var DIFF = { easy: 'b-easy', medium: 'b-medium', hard: 'b-hard' };

  function caseCard(c) {
    var solved = LX.cases.isSolved(c.id), secret = c.secret && !solved;
    var box = el('div', 'case' + (solved ? ' is-solved' : ''));
    var t = el('div', 't');
    t.appendChild(el('span', 'id', 'LX-' + c.id));
    t.appendChild(el('b', '', secret ? '[REDACTED]' : c.title));
    if (solved) t.appendChild(el('span', 'done', '✓ closed'));
    box.appendChild(t);
    var badges = el('div', 'badges');
    badges.appendChild(el('span', 'badge ' + (DIFF[c.diff] || 'b-secret'), c.diff));
    badges.appendChild(el('span', 'badge', c.cat));
    box.appendChild(badges);
    box.appendChild(el('p', '', c.brief.join(' ')));
    var files = LX_EVIDENCE.files[c.id] || [], row = el('div', 'row');
    files.forEach(function (f) {
      var a = link(f.path, '↓ ' + f.name);
      a.className = 'btn'; a.setAttribute('download', f.name); a.removeAttribute('target');
      row.appendChild(a);
    });
    var hb = el('button', 'btn', 'hint'); hb.type = 'button';
    row.appendChild(hb);
    box.appendChild(row);
    var msg = el('div', 'msg');
    if (!solved) {
      var form = el('div', 'row submit'), inp = el('input'), sb = el('button', 'btn go', 'submit');
      inp.placeholder = LX_CONFIG.flagPrefix + '{...}'; inp.setAttribute('aria-label', 'flag for case ' + c.id); inp.spellcheck = false; inp.autocomplete = 'off';
      inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('autocorrect', 'off');
      sb.type = 'button';
      async function go() {
        var v = inp.value.trim();
        if (!v || sb.disabled) return;
        // the hash is slow on purpose (up to a second or two on a phone), so say so
        sb.disabled = true; msg.className = 'msg c-dim'; msg.textContent = 'checking...';
        var id;
        try { id = await LX.cases.check(v); } finally { sb.disabled = false; msg.textContent = ''; }
        if (id) {
          LX.cases.markSolved(id);
          if (LX.isSudoer() && !LX.store.get('promoted', false)) {
            LX.promote(LX.term);
            setTimeout(function () { LX.ui.toast('PROMOTED: you are in sudoers now'); }, 2300);
          }
          LX.ui.toast('CASE LX-' + id + ' CLOSED');
        } else { msg.className = 'msg c-red'; msg.textContent = 'no match. (checked by hash, locally)'; }
      }
      sb.onclick = go;
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); e.stopPropagation(); });
      form.appendChild(inp); form.appendChild(sb);
      box.appendChild(form);
    }
    hb.onclick = function () { var h = LX.cases.nextHint(c.id); msg.className = 'msg c-amber'; msg.textContent = 'hint ' + h.n + '/' + h.of + ': ' + h.text; };
    box.appendChild(msg);
    return box;
  }

  LX.gui = {
    render: function () {
      var C = LX_CONFIG, n = LX.cases.solvedCount(), total = LX.cases.total(), y = panel.scrollTop;
      panel.textContent = '';
      var head = el('div', 'head'), who = el('div');
      who.appendChild(el('div', 'who', C.domain));
      who.appendChild(el('div', 'tag', C.tagline));
      var x = el('button', 'close', '✕ close'); x.type = 'button'; x.setAttribute('aria-label', 'close the plain view');
      x.onclick = function () { LX.gui.open(false); };
      head.appendChild(who); head.appendChild(x);
      panel.appendChild(head);

      var body = el('div', 'body');
      C.about.join('\n').split('\n\n').slice(0, 2).forEach(function (p) { body.appendChild(el('p', 'about', p.replace(/\n/g, ' '))); });
      var links = el('div', 'row links');
      Object.keys(C.links).forEach(function (k) { if (C.links[k]) { var a = link(C.links[k], k); a.className = 'btn'; links.appendChild(a); } });
      if (C.email) { var m = link('mailto:' + C.email, C.email); m.className = 'btn'; links.appendChild(m); }
      if (links.childNodes.length) body.appendChild(links);

      var prog = el('div', 'progress');
      prog.appendChild(el('div', 'label', 'cases closed  ' + n + '/' + total + (LX.isSudoer() ? '  ·  you are in sudoers' : '')));
      var bar = el('div', 'bar'), fill = el('div', 'fill');
      fill.style.width = Math.round(n / total * 100) + '%';
      bar.appendChild(fill); prog.appendChild(bar);
      body.appendChild(prog);
      body.appendChild(el('p', 'c-dim', 'download the files and use your own tools, or solve everything in the terminal, which has the tools built in. stuck? every case has two hints.'));

      [['forensics', function (c) { return BEYOND.indexOf(c.cat) < 0; }], ['beyond forensics', function (c) { return BEYOND.indexOf(c.cat) >= 0; }]].forEach(function (g) {
        var list = LX_CASES.filter(g[1]);
        if (!list.length) return;
        body.appendChild(el('h2', '', g[0] + '  ' + list.filter(function (c) { return LX.cases.isSolved(c.id); }).length + '/' + list.length));
        list.forEach(function (c) { body.appendChild(caseCard(c)); });
      });

      var foot = el('div', 'foot'), back = el('button', 'btn', 'back to the terminal');
      back.type = 'button'; back.onclick = function () { LX.gui.open(false); };
      foot.appendChild(el('p', 'c-dim', 'prefer typing? everything here works in the terminal too: type help, or click anything underlined.'));
      foot.appendChild(back);
      body.appendChild(foot);
      panel.appendChild(body);
      panel.scrollTop = y;
    },
    open: function (on) {
      panel.hidden = !on;
      toggle.hidden = on;
      toggle.setAttribute('aria-expanded', String(on));
      document.body.classList.toggle('gui-open', on);
      if (on) { this.render(); panel.scrollTop = 0; panel.querySelector('.close').focus({ preventScroll: true }); }
      else { toggle.focus({ preventScroll: true }); LX.ui.focus(); }
    }
  };
  LX.def('gui', { cat: 'start', help: 'the plain view: cases, downloads, links. no typing needed', usage: 'gui' }, function () { LX.gui.open(true); });
  LX.cmds.plain = LX.cmds.gui;
  toggle.addEventListener('click', function () { LX.gui.open(panel.hidden); });
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') LX.gui.open(false); });
  // once someone is clearly using the terminal, the button steps back a bit
  LX.ui.input.addEventListener('keydown', function quiet(e) {
    if (e.key === 'Enter') { toggle.classList.add('quiet'); LX.ui.input.removeEventListener('keydown', quiet); }
  });
})();
