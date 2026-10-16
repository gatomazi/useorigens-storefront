# Base do IBGE para a curadoria: ordena as cidades do catálogo e baixa, para cada uma, regiões (Localidades), histórico,
# formação administrativa e gentílico (Biblioteca), população e área (Censo 2022, SIDRA 4714) e a sede (arquivo do repositório).
# Saída: .mundo-curadoria/base/<id>.json (dados prontos para o perfil) e base/<id>-ibge.txt (texto da Biblioteca para a pesquisa).
#   python3 scripts/mundo-curadoria/base.py [N]   prepara as N próximas cidades da fila (padrão 60) e grava .mundo-curadoria/fila.json
import datetime, gzip, json, os, re, sys, time, unicodedata, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comum import BASE, FORA, INDICE, PERFIS, SEDES, TRAB  # noqa: E402

HOJE = datetime.date.today().isoformat()

indice = json.load(open(INDICE))['lugares']  # rode antes: npm run mundo:dados
cat = {x['i']: x for x in indice if re.fullmatch(r'\d{7}', x['i'])}
perfis = json.load(open(PERFIS))['cidades']
sedes = json.load(open(SEDES))['sedes']
pop, area = {}, {}
SIDRA = os.path.join(TRAB, 'sidra.json')
if not os.path.exists(SIDRA):  # população e área do Censo 2022 de todos os municípios das UFs da loja, numa chamada
    with urllib.request.urlopen('https://apisidra.ibge.gov.br/values/t/4714/n6/in%20n3%2011,12,13,14,15,16,17,41,42,43,50,51,52,53/v/93,6318/p/2022', timeout=120) as r:
        open(SIDRA, 'wb').write(r.read())
for r in json.load(open(SIDRA))[1:]:
    (pop if r['D2C'] == '93' else area)[r['D1C']] = r['V']

CAPITAIS = ['4205407', '5103403', '5300108', '1200401', '1600303', '1100205', '1400100', '1721000']
TURISMO = [('Gramado', 'RS'), ('Canela', 'RS'), ('Bonito', 'MS'), ('Pirenópolis', 'GO'), ('Caldas Novas', 'GO'),
           ('Chapada dos Guimarães', 'MT'), ('Alto Paraíso de Goiás', 'GO'), ('Bombinhas', 'SC'), ('Penha', 'SC'), ('Urubici', 'SC'),
           ('Nova Petrópolis', 'RS'), ('Morretes', 'PR'), ('Lapa', 'PR'), ('Goiás', 'GO'), ('Corumbá', 'MS'),
           ('São Miguel das Missões', 'RS'), ('Laguna', 'SC'), ('São Francisco do Sul', 'SC'), ('Parintins', 'AM'),
           ('Cambará do Sul', 'RS'), ('Antônio Prado', 'RS'), ('Garibaldi', 'RS'), ('Pomerode', 'SC'), ('Treze Tílias', 'SC'),
           ('Torres', 'RS'), ('Soure', 'PA'), ('Mateiros', 'TO'), ('Porto Nacional', 'TO'), ('Poconé', 'MT'), ('Cáceres', 'MT'),
           ('Novo Airão', 'AM'), ('Presidente Figueiredo', 'AM'), ('Jardim', 'MS'), ('Nobres', 'MT'), ('Prudentópolis', 'PR'),
           ('Imbituba', 'SC'), ('Piçarras', 'SC'), ('São Joaquim', 'SC'), ('Tibagi', 'PR'), ('Paranaguá', 'PR')]
porNome = {(x['n'], x['u']): i for i, x in cat.items()}
turismo = [porNome[t] for t in TURISMO if t in porNome]
faltando = [t for t in TURISMO if t not in porNome]
if faltando: print('turismo fora do catálogo:', faltando, file=sys.stderr)

maiores = sorted((i for i in cat if i in pop), key=lambda i: -int(pop[i]))
fila, vistos = [], set(perfis) | set(FORA)
def pôr(i):
    if i not in vistos and i in cat: fila.append(i); vistos.add(i)
for i in CAPITAIS: pôr(i)
# depois das capitais, alterna: 3 maiores, 1 turística
mi, ti = iter(maiores), iter(turismo)
alvo = int(sys.argv[1]) if len(sys.argv) > 1 else 60
while len(fila) < alvo and (len(fila) < len(cat)):
    for _ in range(3):
        i = next(mi, None)
        while i is not None and i in vistos: i = next(mi, None)
        if i: pôr(i)
    i = next(ti, None)
    while i is not None and i in vistos: i = next(ti, None)
    if i: pôr(i)
json.dump(fila, open(os.path.join(TRAB, 'fila.json'), 'w'))
print(len(fila), 'cidades na fila; base em', BASE)

def get(url, tentativas=3):
    for k in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40) as r:
                b = r.read()
                if b[:2] == b'\x1f\x8b': b = gzip.decompress(b)
                return b.decode('utf-8', 'ignore')
        except Exception as e:
            if k == tentativas - 1: raise
            time.sleep(2)

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

for n, i in enumerate(fila):
    destino = f'{BASE}/{i}.json'
    if os.path.exists(destino): continue
    c = cat[i]
    loc = json.loads(get(f'https://servicodados.ibge.gov.br/api/v1/localidades/municipios/{i}'))
    bruto = get(f'https://servicodados.ibge.gov.br/api/v1/biblioteca?codmun={i}')
    bib = list(json.loads(re.sub(r'^\{(\d+):', r'{"\1":', bruto), strict=False).values())[0]
    fonteHist = re.split(r'\.?\s*Dispon[ií]vel em', bib.get('HISTORICO_FONTE') or '')[0].strip().rstrip('.')
    chave = f'ibge-biblioteca-{slug(c["n"])}-{c["u"].lower()}'
    lat, lon = sedes[i][0], sedes[i][1]
    base = {
        'id': i, 'nome': c['n'], 'uf': c['u'], 'regiaoLoja': c['r'], 'slug': c['s'],
        'fonteBiblioteca': {chave: {
            'titulo': f'Biblioteca IBGE — {c["n"]}: histórico, gentílico e formação administrativa',
            'publicador': f'IBGE (histórico com fonte em {fonteHist})' if fonteHist else 'IBGE',
            'url': f'https://servicodados.ibge.gov.br/api/v1/biblioteca?codmun={i}',
            'referencia': f'Registro de {bib.get("ANO")}' if bib.get('ANO') else 'Registro sem data',
            'consultadoEm': HOJE}},
        'gentilico': (bib.get('GENTILICO') or '').strip(),
        'geografia': {
            'sede': {'lat': lat, 'lon': lon, 'definicao': 'Sede municipal (IBGE, Localidades 2022)', 'fontes': ['ibge-localidades-2022']},
            'populacao': {'censo': {'valor': int(pop[i]), 'ano': 2022, 'fontes': ['ibge-censo-2022-4714']}, 'estimativa': None},
            'area': {'km2': float(area[i]), 'ano': 2022, 'fontes': ['ibge-censo-2022-4714']},
            'regioes': {
                'grandeRegiao': loc['microrregiao']['mesorregiao']['UF']['regiao']['nome'],
                'imediata': loc['regiao-imediata']['nome'],
                'intermediaria': loc['regiao-imediata']['regiao-intermediaria']['nome'],
                'mesorregiao': loc['microrregiao']['mesorregiao']['nome'],
                'microrregiao': loc['microrregiao']['nome'],
                'fontes': ['ibge-localidades-api']}},
    }
    json.dump(base, open(destino, 'w'), ensure_ascii=False, indent=1)
    with open(f'{BASE}/{i}-ibge.txt', 'w') as f:
        f.write(f'{c["n"]} ({c["u"]}) — IBGE {i} — Biblioteca IBGE, registro de {bib.get("ANO")}\n')
        f.write(f'URL: https://servicodados.ibge.gov.br/api/v1/biblioteca?codmun={i}\n\n')
        f.write(f'GENTÍLICO: {bib.get("GENTILICO")}\n\nFONTE DO HISTÓRICO: {bib.get("HISTORICO_FONTE")}\n\n')
        f.write(f'HISTÓRICO:\n{bib.get("HISTORICO")}\n\nFORMAÇÃO ADMINISTRATIVA:\n{bib.get("FORMACAO_ADMINISTRATIVA")}\n')
    print(n + 1, i, c['n'], c['u'], pop[i], flush=True)
    time.sleep(0.3)
