# Caminhos e utilidades da rodada de curadoria do "Meu Pequeno Mundo" (scripts/mundo-curadoria). Tudo que é gerado fica em
# .mundo-curadoria/ na raiz do repositório (fora do git); o que entra no repositório é só data/mundo/perfis-cidades.json.
import os

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TRAB = os.path.join(REPO, '.mundo-curadoria')
BASE = os.path.join(TRAB, 'base')       # base/<id>.json e base/<id>-ibge.txt (gerados por base.py)
LOTE = os.path.join(TRAB, 'lote')       # lote/<id>.json: o rascunho de cada cidade (escrito pela pesquisa)
CACHE = os.path.join(TRAB, 'cache')     # páginas baixadas por trecho.py
TESTE = os.path.join(TRAB, 'teste')     # arquivos montados por montar.py --checar
PERFIS = os.path.join(REPO, 'data', 'mundo', 'perfis-cidades.json')
INDICE = os.path.join(REPO, 'prototipos', 'meu-pequeno-mundo', 'dados', 'indice.json')  # npm run mundo:dados
SEDES = os.path.join(REPO, 'data', 'mundo', 'sedes-municipais-ibge-2022.json')
# Pesquisadas e deixadas de fora por falta de fonte conferível (site só com JavaScript, certificado vencido); só voltam com fonte nova.
FORA = {'4212502': 'Penha (SC)', '4303103': 'Cachoeirinha (RS)', '4218509': 'Treze Tílias (SC)'}

for d in (BASE, LOTE, CACHE, TESTE):
    os.makedirs(d, exist_ok=True)
