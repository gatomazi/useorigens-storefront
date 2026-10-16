#!/usr/bin/env python3
# Monta perfis da curadoria: base do IBGE (.mundo-curadoria/base/<id>.json) + rascunho da pesquisa (.mundo-curadoria/lote/<id>.json).
#   montar.py --checar <id>   monta só esta cidade num arquivo de teste, roda o validador do repositório e confere cada evidência
#   montar.py --juntar        acrescenta ao data/mundo/perfis-cidades.json todas as cidades com status "pronto" e evidências OK
#   montar.py --atualizar <id> ...  como --juntar, mas substitui a versão já juntada (o rascunho mudou depois)
import datetime, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import BASE, LOTE, PERFIS as ARQ, REPO, TESTE  # noqa: E402
from trecho import texto, norm  # noqa: E402

HOJE = datetime.date.today().isoformat()
COMPARTILHADAS = ['ibge-localidades-api', 'ibge-censo-2022-4714', 'ibge-localidades-2022']


def montar(i):
    base = json.load(open(f'{BASE}/{i}.json'))
    r = json.load(open(f'{LOTE}/{i}.json'))
    atual = json.load(open(ARQ))
    fontes = {k: atual['fontes'][k] for k in COMPARTILHADAS}
    fontes.update(base['fonteBiblioteca'])
    fontes.update(r.get('fontes', {}))
    ct = dict(r['conteudo'])
    if not ct.get('gentilico') and base.get('gentilico'):
        ct['gentilico'] = {'oficial': base['gentilico'], 'variantes': [], 'fontes': list(base['fonteBiblioteca'])}
    obs = 'Texto escrito a partir das fontes listadas; falta revisão editorial da Use Origens.'
    if r.get('observacao'): obs += ' ' + r['observacao'].strip()
    cidade = {
        'identidade': {'id': i, 'ibge': i, 'nome': base['nome'], 'uf': base['uf'], 'regiaoLoja': base['regiaoLoja']},
        'cobertura': 'completo',
        'conteudo': ct,
        'geografia': base['geografia'],
        'visual': r['visual'],
        'revisao': {'status': 'curadoria inicial', 'em': HOJE, 'observacao': obs},
    }
    return cidade, fontes, r


def conferir(r, fontes):
    res = []
    for e in r.get('evidencias', []):
        f = fontes.get(e.get('fonte'))
        if not f:
            res.append(('SEM-FONTE', e)); continue
        if e.get('verificacao') == 'manual':
            res.append(('MANUAL', e)); continue
        cod, t = texto(f['url'])
        res.append(('OK' if norm(e.get('trecho', '')) in norm(t) and e.get('trecho', '').strip() else 'FALTA', e))
    return res


def citadas(cidade):
    s = set()
    def anda(x):
        if isinstance(x, dict):
            for k, v in x.items():
                if k in ('fontes', 'fontesResumo') and isinstance(v, list): s.update(v)
                else: anda(v)
        elif isinstance(x, list):
            for v in x: anda(v)
    anda(cidade)
    return s


def checar(i):
    cidade, fontes, r = montar(i)
    usadas = citadas(cidade)
    arq = f'{TESTE}/{i}.json'
    json.dump({'v': 1, 'fontes': {k: v for k, v in fontes.items() if k in usadas or k in r.get('fontes', {})}, 'cidades': {i: cidade}},
              open(arq, 'w'), ensure_ascii=False, indent=1)
    v = subprocess.run(['npm', 'run', '-s', 'mundo:validar', '--', '--arquivo', arq], cwd=REPO, capture_output=True, text=True)
    linhas = [l for l in v.stdout.splitlines() if 'FAIL' in l or 'WARN' in l]
    print(f'VALIDADOR: {"OK" if v.returncode == 0 else "FALHOU"} ({len([l for l in linhas if "FAIL" in l])} FAIL, {len([l for l in linhas if "WARN" in l])} WARN)')
    for l in linhas: print('  ' + l.strip())
    if v.returncode not in (0, 1): print(v.stderr[-1500:])
    res = conferir(r, fontes)
    ok = sum(1 for s, _ in res if s == 'OK')
    print(f'EVIDÊNCIAS: {ok}/{len(res)} encontradas literalmente na fonte')
    for s, e in res:
        if s != 'OK': print(f'  {s:9} [{e.get("fonte")}] {e.get("onde", "")}: "{(e.get("trecho") or "")[:110]}"')
    sem = [k for k in usadas if k not in fontes]
    if sem: print('FONTES CITADAS E NÃO DECLARADAS:', ', '.join(sem))
    return v.returncode == 0 and all(s in ('OK', 'MANUAL') for s, _ in res)


def juntar(ids, substituir=False):
    d = json.load(open(ARQ))
    novos = []
    for i in ids:
        cidade, fontes, r = montar(i)
        if i in d['cidades'] and not substituir: print('já existe', i); continue
        for k, f in fontes.items():
            if k in d['fontes'] and d['fontes'][k] != f and k not in COMPARTILHADAS and not substituir:
                raise SystemExit(f'fonte {k} colide com outra diferente ({i})')
        usadas = citadas(cidade)
        for k in usadas:
            if substituir and k not in COMPARTILHADAS: d['fontes'][k] = fontes[k]
            else: d['fontes'].setdefault(k, fontes[k])
        d['cidades'][i] = cidade
        novos.append(i)
    d['atualizadoEm'] = HOJE
    with open(ARQ, 'w') as f:
        json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
    print(len(novos), 'perfis juntados (novos ou atualizados):', ' '.join(novos))


if __name__ == '__main__':
    if sys.argv[1] == '--checar':
        sys.exit(0 if checar(sys.argv[2]) else 1)
    if sys.argv[1] == '--juntar':
        juntar(sys.argv[2:])
    if sys.argv[1] == '--atualizar':
        juntar(sys.argv[2:], substituir=True)
