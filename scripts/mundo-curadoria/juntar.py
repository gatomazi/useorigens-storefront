# Junta ao data/mundo/perfis-cidades.json todo rascunho "pronto" que passa no --checar e ainda não está em perfis-cidades.json.
#   python3 scripts/mundo-curadoria/juntar.py   (depois: npm run mundo:validar && npm run mundo:cobertura)
import json, os, subprocess, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from comum import FORA, LOTE, TESTE  # noqa: E402
ok, pend = [], []
for f in sorted(os.listdir(LOTE)):
    i = f[:-5]
    if not f.endswith('.json') or i in FORA: continue
    r = json.load(open(f'{LOTE}/{f}'))
    v = subprocess.run([sys.executable, f'{AQUI}/montar.py', '--checar', i], capture_output=True, text=True)
    open(f'{TESTE}/{i}.log', 'w').write(v.stdout + v.stderr)
    (ok if v.returncode == 0 and r.get('status') == 'pronto' else pend).append(i)
print('pendentes:', pend)
if ok: subprocess.run([sys.executable, f'{AQUI}/montar.py', '--atualizar', *ok])  # novos entram; os já juntados pegam a última versão
