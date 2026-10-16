#!/usr/bin/env python3
# Texto literal de uma página ou PDF, para citar fonte sem paráfrase.
#   trecho.py <url> termo [termo ...]   imprime cada ocorrência com o texto em volta (literal, só espaços normalizados)
#   trecho.py <url> --tudo [ini] [fim]  imprime o texto extraído (por padrão, os primeiros 12.000 caracteres)
#   trecho.py --conferir <url> "<trecho>"  diz se o trecho está na página (OK) ou não (FALTA)
# Cache em cache/ (mesma URL não é baixada de novo). Código HTTP na primeira linha.
import glob, hashlib, html, io, os, re, subprocess, sys, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import CACHE, TRAB  # noqa: E402
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141 Safari/537.36'


def texto(url):
    f = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest())
    if not os.path.exists(f + '.txt'):
        r = subprocess.run(['curl', '-sL', '--compressed', '-m', '60', '-A', UA, '-H', 'Accept-Language: pt-BR,pt;q=0.9',
                            '-o', f + '.raw', '-w', '%{http_code}', url], capture_output=True, text=True)
        cod = r.stdout.strip() or '000'
        raw = open(f + '.raw', 'rb').read() if os.path.exists(f + '.raw') else b''
        if raw[:4] == b'%PDF':
            try:
                sys.path[:0] = glob.glob(os.path.join(TRAB, 'venv', 'lib', 'python3*', 'site-packages'))
                import pypdf  # python3 -m venv .mundo-curadoria/venv && .mundo-curadoria/venv/bin/pip install pypdf
                leitor = pypdf.PdfReader(io.BytesIO(raw))
                t = '\n'.join(f'[p. {k + 1}] ' + (p.extract_text() or '') for k, p in enumerate(leitor.pages))
            except Exception as e:
                t = f'(PDF sem texto extraível: {e})'
        else:
            t = raw.decode('utf-8', 'ignore')
            if '<html' in t[:3000].lower() or '<body' in t.lower():
                t = re.sub(r'<(script|style|noscript|svg)\b.*?</\1>', ' ', t, flags=re.S | re.I)
                t = re.sub(r'<br\s*/?>|</p>|</h\d>|</li>|</div>|</tr>', '\n', t, flags=re.I)
                t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
        t = re.sub(r'[ \t\r\f\v ]+', ' ', t)
        t = re.sub(r'\n\s*\n+', '\n', t)
        open(f + '.txt', 'w').write(cod + '\n' + t)
    cod, t = open(f + '.txt').read().split('\n', 1)
    return cod, t


def norm(s):
    s = unicodedata.normalize('NFC', s)
    s = s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"').replace('–', '-').replace('—', '-')
    return re.sub(r'\s+', ' ', s).strip().lower()


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        print(__doc__ if __doc__ else open(__file__).read().split('import')[0]); sys.exit(1)
    if a[0] == '--conferir':
        cod, t = texto(a[1])
        achou = norm(a[2]) in norm(t)
        print(('OK    ' if achou else 'FALTA ') + cod + ' ' + a[1]); sys.exit(0 if achou else 2)
    url = a[0]
    cod, t = texto(url)
    print(f'HTTP {cod} · {len(t)} caracteres · {url}')
    if len(a) > 1 and a[1] == '--tudo':
        ini = int(a[2]) if len(a) > 2 else 0
        fim = int(a[3]) if len(a) > 3 else ini + 12000
        print(t[ini:fim]); sys.exit(0)
    plano = re.sub(r'\s+', ' ', t)
    for termo in a[1:]:
        achados = [m.start() for m in re.finditer(re.escape(termo), plano, flags=re.I)]
        print(f'\n== "{termo}": {len(achados)} ocorrência(s)')
        for p in achados[:6]:
            print('  …' + plano[max(0, p - 300):p + len(termo) + 300] + '…\n')
