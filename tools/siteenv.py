"""
siteenv.py - reads site.env (dotenv style). no dependencies.

    KEY=value                 plain value, a ' #' starts a comment
    KEY="value # not comment" double quotes: \\n \\t \\" \\\\ escapes, may span lines
    KEY='literal'             single quotes: taken as is
    # comment
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(ROOT, 'site.env')
KEY_RE = re.compile(r'^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$')


class EnvError(Exception):
    pass


def _close_quote(s):
    """index of the first unescaped double quote, or -1"""
    i = 0
    while i < len(s):
        if s[i] == '\\':
            i += 2
            continue
        if s[i] == '"':
            return i
        i += 1
    return -1


def _unescape(s):
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t', '"': '"', '\\': '\\'}.get(m.group(1), '\\' + m.group(1)), s)


def load(path=ENV_PATH):
    if not os.path.exists(path):
        raise EnvError('%s not found' % path)
    lines = open(path, encoding='utf-8').read().split('\n')
    vals, i = {}, 0
    while i < len(lines):
        start = i + 1
        s = lines[i].strip()
        i += 1
        if not s or s.startswith('#'):
            continue
        m = KEY_RE.match(s)
        if not m:
            raise EnvError('site.env line %d: expected KEY=value, got: %s' % (start, s))
        key, rest = m.groups()
        if key in vals:
            raise EnvError('site.env line %d: %s is set twice' % (start, key))
        if rest.startswith('"'):
            buf = rest[1:]
            while True:
                end = _close_quote(buf)
                if end >= 0:
                    tail = buf[end + 1:].strip()
                    if tail and not tail.startswith('#'):
                        raise EnvError('site.env line %d: unexpected text after the closing quote of %s. is a closing " missing, or is there a " inside the text? (write it as \\")' % (start, key))
                    value = _unescape(buf[:end])
                    break
                if i >= len(lines):
                    raise EnvError('site.env line %d: %s has no closing "' % (start, key))
                buf += '\n' + lines[i]
                i += 1
        elif rest.startswith("'"):
            end = rest.find("'", 1)
            if end < 0:
                raise EnvError("site.env line %d: %s has no closing '" % (start, key))
            value = rest[1:end]
        else:
            value = re.split(r'\s+#', rest, maxsplit=1)[0].strip()
        vals[key] = value
    return vals
