# Dívida de performance: LCP simulado em cidade e PDP

Registrada no gate final do `/sul` V2. **Nenhuma mudança foi feita por causa disto**; não há causa concreta identificada.

## Medição (Lighthouse mobile, produção local, `docs/design/lighthouse/v2/`)

| Página | Slow 4G + CPU 4× (padrão) | Fast 4G + CPU 4× | LCP observado (sem simulação) |
|---|---:|---:|---:|
| `/sul` | 2,1 s | 2,2 s | 1,1 s |
| Estado | 2,3 s | não medido | 0,1 s |
| **Cidade** | **2,9 s** | 1,8 s | 1,4 s |
| **PDP** | **3,5 s** | 1,8 s | 2,3 s |

Meta do projeto: LCP < 2,5 s no p75. Cidade e PDP passam no Fast 4G e falham só no Slow 4G com CPU 4×, o perfil mais severo.

## O que se sabe

- CLS 0 em todas as medições.
- O elemento LCP em cidade e PDP é a foto principal do produto (~26 KB). A imagem é baixada cedo e rápido; o Lighthouse aponta ~2 s de "atraso de renderização" nessa simulação.
- `fetchPriority="high"` e `loading="eager"` já estão aplicados à foto principal.

## O que não se sabe

- Se o atraso de renderização vem de JavaScript, de fontes ou apenas do modelo de simulação. Não foi investigado.
- Como isso se comporta em CDN real e em aparelho real. A medição foi contra `localhost`.

## Quando agir

Só com causa concreta: medição em aparelho real ou em ambiente publicado que confirme o número, ou um trace que aponte o gargalo. Não fazer refatoração especulativa.
