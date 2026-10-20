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

  function caseCard(c) {
    var solved = LX.cases.isSolved(c.id), secret = c.secret && !solved;
    var box = el('div', 'case');
    var t = el('div', 't');
    t.appendChild(el('b', '', 'LX-' + c.id + '  ' + (secret ? '[REDACTED]' : c.title)));
    t.appendChild(el('span', solved ? 'solved' : 'c-dim', solved ? '✓ closed' : c.diff + ' · ' + c.cat));
    box.appendChild(t);
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
      var form = el('div', 'row'), inp = el('input'), sb = el('button', 'btn', 'submit');
      inp.placeholder = LX_CONFIG.flagPrefix + '{...}'; inp.setAttribute('aria-label', 'flag for case ' + c.id); inp.spellcheck = false; inp.autocomplete = 'off';
      sb.type = 'button';
      async function go() {
        var v = inp.value.trim();
        if (!v) return;
        var id = await LX.cases.check(v);
        if (id) {
          LX.cases.markSolved(id);
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
      var C = LX_CONFIG;
      panel.textContent = '';
      panel.appendChild(el('div', 'who', C.domain));
      panel.appendChild(el('div', 'tag', C.tagline));
      var about = C.about.join('\n').split('\n\n');
      about.slice(0, 2).forEach(function (p) { var e = el('p', 'c-dim', p.replace(/\n/g, ' ')); e.style.marginTop = '8px'; panel.appendChild(e); });

      var ul = el('ul'), anyLink = false;
      Object.keys(C.links).forEach(function (k) { if (C.links[k]) { anyLink = true; var li = el('li'); li.appendChild(link(C.links[k], k)); ul.appendChild(li); } });
      if (C.email) { anyLink = true; var li = el('li'); li.appendChild(link('mailto:' + C.email, C.email)); ul.appendChild(li); }
      if (anyLink) { panel.appendChild(el('h2', '', 'links')); panel.appendChild(ul); }

      panel.appendChild(el('h2', '', 'cases  ' + LX.cases.solvedCount() + '/' + LX.cases.total()));
      panel.appendChild(el('p', 'c-dim', 'real forensics challenges. download the evidence and use your own tools, or solve them in the terminal, which has the tools built in.'));
      LX_CASES.forEach(function (c) { panel.appendChild(caseCard(c)); });

      panel.appendChild(el('h2', '', 'the terminal'));
      panel.appendChild(el('p', 'c-dim', 'everything here works in the terminal too. type help, or just click things.'));
    },
    open: function (on) {
      panel.hidden = !on;
      toggle.setAttribute('aria-expanded', String(on));
      toggle.textContent = on ? 'close panel' : 'not a terminal person?';
      if (on) this.render(); else LX.ui.focus();
    }
  };
  toggle.addEventListener('click', function () { LX.gui.open(panel.hidden); });
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { LX.gui.open(false); toggle.focus(); } });
  // once someone is clearly using the terminal, the button steps back a bit
  LX.ui.input.addEventListener('keydown', function quiet(e) {
    if (e.key === 'Enter') { toggle.classList.add('quiet'); LX.ui.input.removeEventListener('keydown', quiet); }
  });
})();
