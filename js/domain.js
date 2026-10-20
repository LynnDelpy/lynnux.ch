// domain.js :: runs right after config.js, on every page (404.html too).
// pick the domain the visitor actually typed: lynnux.li stays lynnux.li, www.lynnux.ch
// and other subdomains count as their base domain, anything else gets the first one.
// then fill {domain} placeholders from site.env
'use strict';

(function (C) {
  var h = String(location.hostname || '').toLowerCase().replace(/\.$/, '');
  C.domain = C.domains.filter(function (d) { return h === d || h.slice(-(d.length + 1)) === '.' + d; })[0] || C.domains[0];
  C.host = C.domain;
  (function fill(o) {
    Object.keys(o).forEach(function (k) {
      if (typeof o[k] === 'string') o[k] = o[k].replace(/\{domain\}/g, C.domain);
      else if (o[k] && typeof o[k] === 'object') fill(o[k]);
    });
  })(C);
  // static bits of html that just show the host (the 404 prompt). build.py prefills them
  // with the first domain, so without js they still say something sensible
  Array.prototype.forEach.call(document.querySelectorAll('[data-host]'), function (el) { el.textContent = C.domain; });
})(LX_CONFIG);
