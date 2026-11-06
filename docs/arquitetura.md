# Arquitetura da solução — Radar de Retenção

## Visão geral

A solução é uma plataforma de *people analytics* em lote, organizada em quatro camadas:

```
┌──────────────────┐   ┌─────────────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐
│ 1. FONTES        │   │ 2. PREPARAÇÃO + MODELO  │   │ 3. ARMAZENAMENTO     │   │ 4. CONSUMO               │
│ Base de RH       │──▶│ Python (pandas,         │──▶│ Supabase (Postgres)  │──▶│ Dashboard web            │
│ (admissões,      │   │ scikit-learn, XGBoost,  │   │ tabelas rr_* + views │   │ (Vite + React + Recharts)│
│ desligamentos,   │   │ SHAP, lifelines)        │   │ rr_vw_* com RLS      │   │ Gente & Gestão, líderes, │
│ integração)      │   │ notebooks + scripts     │   │ cópia JSON (público) │   │ operações                │
└──────────────────┘   └─────────────────────────┘   └──────────────────────┘   └──────────────────────────┘
        │                        │                              │                            ▲
        │                        └──── artefatos: CSV, JSON, SQL de seed, modelos .joblib ───┘ (cópia JSON do link público)
```

No MVP a fonte é uma **base sintética** gerada pelo próprio pipeline com a mesma estrutura
que uma extração de sistemas de RH (admissões, desligamentos com tipo e motivo, cargo,
loja, contrato, integração, assiduidade). Na operação real, a etapa 1 passa a ser uma
extração periódica (mensal ou semanal) do sistema de RH, pseudonimizada antes de sair do
ambiente de origem.

**Link público e banco.** O link público (https://bielleon.github.io/radar-retencao/) lê uma cópia JSON
dos resultados, em `dashboard/public/demo`, e não publica credenciais de banco. O banco Supabase (tabelas
`rr_*` e views `rr_vw_*`) é opcional: o dashboard o lê na execução local, quando configurado por um `.env`
próprio, nunca versionado.

## Componentes implementados no MVP

| Camada | Componente | Tecnologia | Função |
|---|---|---|---|
| Fontes | `pipeline/01_gerar_dados_sinteticos.py` | Python, numpy | Gera a base sintética (lojas e colaboradores) com sazonalidade de varejo e mecanismo realista de desligamento |
| Preparação | `pipeline/02_preparar_e_treinar.py` | pandas, scikit-learn | Constrói alvos (90/180 dias), variáveis do checkpoint de 30 dias, divisão temporal, validação cruzada |
| Modelo | idem | scikit-learn, XGBoost | Compara regressão logística, random forest, gradient boosting e XGBoost; seleciona por AUC com regra de parcimônia |
| Explicabilidade | idem | Contribuições lineares; SHAP (TreeExplainer) para árvores | Importância global (média \|contribuição\|) e 3 fatores por colaborador com direção. Como os dois modelos selecionados são regressões logísticas, a execução atual usa `coef x (x - média)`, equivalente ao SHAP linear |
| Análises complementares | idem | lifelines, pandas | Curva de sobrevivência Kaplan-Meier, tendência mensal com picos, custo do turnover, auditoria de viés |
| Exportação | `pipeline/03_exportar_artefatos.py` | pandas | Cópia JSON dos resultados (mesma lógica das views SQL) e scripts SQL de carga |
| Publicação (opcional) | `pipeline/04_publicar_supabase.py` | supabase-py | Carga das tabelas no Supabase via chave de serviço (variáveis de ambiente) |
| Armazenamento | `supabase/migrations/*.sql` | Supabase (Postgres 17, PostgREST, RLS) | Tabelas `rr_*` com RLS e leitura pública nessas tabelas, views `rr_vw_*`; a política não alcança outras tabelas de um mesmo projeto |
| Consumo | `dashboard/` | Vite, React 18, TypeScript, Recharts, supabase-js | Seis páginas: visão geral, mapa de risco, colaboradores em risco, fatores e modelo, simulador, recomendações e ética |
| Hospedagem | `.github/workflows/deploy-pages.yml` | GitHub Pages | Publicação automática do dashboard com a cópia JSON, sem credenciais de banco (exige Settings > Pages > Source = GitHub Actions) |

## Fluxo dos dados (ponta a ponta)

1. **Entrada** — a base de RH (no MVP, `data/raw/*.csv`) traz um registro por colaborador
   com atributos de admissão, sinais dos primeiros 30 dias e, para desligados, a data,
   o tipo (voluntário/involuntário) e o motivo declarado.
2. **Preparação** — o pipeline define o **checkpoint de 30 dias**: somente informações
   disponíveis até esse ponto viram variáveis. Os alvos são "saída voluntária até o dia
   90" e "até o dia 180". Colaboradores sem janela completa ficam fora do treino.
3. **Treino e avaliação** — divisão temporal (treino até 2025, teste em 2026) e validação
   cruzada; métricas AUC-ROC, AUC-PR, Brier, recall e precisão no top 20%, calibração. O teste
   não tem admissões de pico; uma validação retroativa em 2025 cobre esse regime.
4. **Explicabilidade** — contribuições no estilo SHAP geram a importância global e os três
   fatores de cada pessoa; um playbook converte fator + nível de risco em ação recomendada.
5. **Publicação** — os resultados (predições, fatores, métricas, curvas, tendência,
   custo, playbook) são gravados em `data/processed/`, copiados em JSON para `dashboard/public/demo`
   e carregados no Supabase por `pipeline/04_publicar_supabase.py`.
6. **Consumo** — o dashboard apresenta KPIs, mapa de risco por loja/segmento, lista priorizada
   de colaboradores, fatores, simulador *what-if* e recomendações. Quando configurado por `.env`
   local, ele lê as views do Supabase via PostgREST. O link público usa a cópia JSON dos mesmos
   resultados, sem publicar credenciais do banco.

## Decisões de arquitetura

* **Lote, não tempo real.** O risco muda devagar (dias/semanas); uma recarga mensal ou
  semanal atende a Gente & Gestão e simplifica governança.
* **Supabase como camada de serviço.** Postgres gerenciado, API REST automática
  (PostgREST), RLS nas tabelas `rr_*` e chave pública para o front-end. Independe de
  provedor de nuvem: o mesmo SQL roda em qualquer Postgres.
* **Prefixo `rr_`.** Permite coexistir com outros objetos em um projeto compartilhado.
  Nesse caso, a política das migrações só cobre as tabelas `rr_*`; por isso o link público não
  usa banco, e a evolução natural é um projeto Supabase dedicado.
* **Dashboard estático.** Sem servidor de aplicação: build do Vite publicado em CDN
  (GitHub Pages ou similar). O cálculo do simulador roda no navegador a partir dos
  coeficientes exportados.
* **Dois caminhos de dados com a mesma lógica.** Views SQL e cópia JSON produzem os mesmos
  conjuntos (médias arredondadas podem diferir em 0,0001), o que permite publicar o dashboard
  e avaliá-lo sem credenciais.

## Evolução prevista (não implementada no MVP)

* Integração direta com o sistema de RH (extração agendada e pseudonimização na origem).
* Rescoring periódico (recalcular o risco a cada 30 dias de casa, não apenas no checkpoint).
* Alertas automáticos por e-mail/Teams para líderes quando um colaborador entra em nível Alto/Crítico.
* Registro das ações de retenção realizadas e medição do efeito (ciclo fechado).
* Autenticação por perfil (RH, gerente regional, gerente de loja) com RLS por loja.
* Monitoramento de deriva do modelo e re-treinamento automatizado.
* Modelo de sobrevivência (Cox / gradient boosting de sobrevivência) para risco em horizonte contínuo.
