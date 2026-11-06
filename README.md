# Radar de Retenção

**Análise preditiva de turnover no varejo** — risco de desligamento voluntário de colaboradores
operacionais de loja nos primeiros **90 e 180 dias**, com explicabilidade e recomendações de
retenção para a área de Gente & Gestão.

Enterprise Challenge **Ri Happy × FIAP** · Turma **2TSCOR** (Tecnologia em Data Science)
Autor: **Gabriel Alves Leon Rodriguez — RM566648** (trabalho individual)

> Todos os dados deste repositório são **sintéticos, com identificadores fictícios**. Nenhum dado real da Ri Happy foi utilizado nesta etapa. Ver
> [docs/etica-lgpd.md](docs/etica-lgpd.md).

**Dashboard público:** https://bielleon.github.io/radar-retencao/ · **Repositório:** https://github.com/Bielleon/radar-retencao

O link público usa uma cópia JSON dos resultados do pipeline (`dashboard/public/demo`). Ele não acessa
banco de dados e não publica credenciais. O modo Supabase é opcional e se configura por `.env` local.

## 1. Objetivo da solução

A Ri Happy opera centenas de lojas com forte sazonalidade (Dia das Crianças e Natal) e alta
rotatividade nos primeiros meses de casa. O Radar de Retenção transforma a base de RH em:

1. **Risco individual** de saída voluntária até 90 e até 180 dias, calculado no checkpoint de
   30 dias de casa (fim da integração), classificado em Baixo, Médio, Alto e Crítico;
2. **Fatores explicados** (globais e por pessoa), em linguagem simples, com contribuições no estilo
   SHAP: lineares na regressão logística e TreeExplainer em modelos de árvore;
3. **Mapa de risco** por loja, região, bandeira, cargo, contrato, salário, turno e canal;
4. **Playbook de ações preventivas** por fator e nível, com responsável e prazo;
5. **Análises complementares**: curva de sobrevivência (Kaplan-Meier), tendência mensal com
   picos sazonais, custo do turnover precoce, motivos declarados de saída, auditoria de viés
   e comparação com referências públicas de mercado;
6. **Simulador what-if** para calibrar contratação, integração e escala.

## 2. Estrutura do repositório

```
radar-retencao/
├── README.md                      ← este arquivo
├── componentes.txt                ← turma, RM e integrante
├── links.txt                      ← links do dashboard, repositório e demais conteúdos externos
├── requirements.txt               ← dependências Python
├── docs/
│   ├── especificacao-mvp.md       ← recorte, decisões de modelagem, contrato de dados, playbook
│   ├── arquitetura.md             ← componentes, fluxo dos dados, decisões e evolução
│   ├── modelo-preditivo.md        ← metodologia, métricas, explicabilidade e limitações
│   ├── etica-lgpd.md              ← privacidade, LGPD, viés e uso responsável
│   ├── referencias.md             ← benchmarks públicos (rotatividade, custo, sazonalidade)
│   └── img/                       ← gráficos do modelo e recortes de tela do dashboard
├── data/
│   ├── raw/                       ← base sintética (lojas.csv, colaboradores.csv)
│   └── processed/                 ← um CSV por tabela do banco (predições, métricas, curvas...), inclusive
│                                     lojas e colaboradores, que repetem data/raw para a carga no banco
├── pipeline/
│   ├── 01_gerar_dados_sinteticos.py   ← gera a base de RH sintética com sazonalidade
│   ├── 02_preparar_e_treinar.py       ← variáveis, alvos, 4 modelos, explicabilidade, análises complementares
│   ├── 03_exportar_artefatos.py       ← cópia JSON dos resultados e scripts SQL de carga
│   ├── 04_publicar_supabase.py        ← carga no Supabase (chave de serviço via variáveis de ambiente)
│   ├── executar_pipeline.py           ← roda 01 → 02 → 03
│   ├── validar_seed.py                ← confere os scripts SQL gerados
│   ├── gerar_notebook.py              ← monta o notebook de EDA/modelagem
│   ├── rr_comum.py                    ← constantes, playbook, regra do risco vigente e tipos das tabelas
│   └── modelos/                       ← modelos treinados (.joblib), model card, relatório e calibração
├── notebooks/
│   └── 01_eda_e_modelagem.ipynb       ← análise exploratória e modelagem, executado com saídas
├── supabase/
│   ├── migrations/0001_schema_rr.sql  ← tabelas rr_* com RLS (leitura pública)
│   ├── migrations/0002_views_rr.sql   ← views rr_vw_* consumidas pelo dashboard
│   └── seed/                          ← INSERTs gerados pelo pipeline (carga alternativa via SQL)
├── dashboard/                         ← aplicação web (Vite + React + TypeScript + Recharts)
│   ├── src/                           ← páginas, componentes, camada de dados e simulador
│   ├── public/demo/                   ← cópia JSON dos resultados, lida pelo link público
│   ├── README.md                      ← instruções do dashboard
│   └── .env.example                   ← variáveis do modo Supabase opcional (só local)
├── apresentacao/
│   ├── EC_Sprint_1_...GabrielLeon.pptx ← apresentação da Sprint 1
│   ├── gerar_apresentacao.js          ← gera o PPTX a partir dos resultados do pipeline
│   ├── capturar_telas.js              ← captura recortes das telas do dashboard para docs/img
│   ├── montar_entrega.py              ← monta o pacote ZIP de entrega, sem arquivos .env
│   └── package.json                   ← dependências do gerador
└── .github/workflows/deploy-pages.yml ← publicação automática do dashboard no GitHub Pages
```

## 3. Tecnologias e ferramentas

| Etapa | Tecnologia | Função |
|---|---|---|
| Dados e preparação | Python 3.12, pandas, numpy | Base sintética, limpeza, variáveis e alvos |
| Modelagem | scikit-learn, XGBoost | Regressão logística, random forest, gradient boosting, XGBoost |
| Explicabilidade | Contribuições lineares; SHAP para árvores | Importância global e 3 fatores por colaborador |
| Análises complementares | lifelines, pandas | Curva de sobrevivência, tendência, custo, auditoria de viés |
| Exploração | Jupyter Notebook | EDA e modelagem documentadas com saídas |
| Armazenamento e API (opcional) | Supabase (Postgres 17, PostgREST, RLS) | Tabelas `rr_*` com RLS e views `rr_vw_*`, lidas na execução local |
| Dashboard | Vite, React 18, TypeScript, Recharts, supabase-js | Seis páginas interativas e simulador no navegador |
| Publicação | GitHub + GitHub Pages | Repositório e site público com a cópia JSON dos resultados |
| Apresentação | pptxgenjs, puppeteer-core | Geração do PPTX e captura de telas |

## 4. Configuração e execução

### 4.1 Dependências

* Python 3.12+ e `pip install -r requirements.txt`
* Node.js 20+ e npm (para o dashboard e a apresentação)
* Opcional: conta Supabase (gratuita) para publicar os resultados no banco

### 4.2 Pipeline de dados e modelo (reprodutível, ~2 a 5 minutos)

```bash
pip install -r requirements.txt
python pipeline/executar_pipeline.py
```

Gera `data/raw`, `data/processed`, `pipeline/modelos`, `dashboard/public/demo` e
`supabase/seed`. Para o notebook executado com saídas:

```bash
python pipeline/gerar_notebook.py
jupyter nbconvert --to notebook --execute --inplace notebooks/01_eda_e_modelagem.ipynb
```

### 4.3 Dashboard com a cópia JSON (sem banco, como no link público)

```bash
cd dashboard
npm install
npm run dev
```

Abra a URL indicada (padrão `http://localhost:5173`). O selo no cabeçalho mostra
"Fonte: cópia JSON dos resultados".

O link público é publicado por `.github/workflows/deploy-pages.yml` a cada push na branch `main`. Antes do
primeiro deploy, é preciso definir **Settings > Pages > Source = GitHub Actions**. O workflow não recebe
variáveis do Supabase, e elas não devem ser criadas no repositório.

### 4.4 Modo Supabase opcional (somente local)

As credenciais ficam só na sua máquina. Use um projeto próprio e dedicado: a política de leitura pública
das migrações cobre as tabelas `rr_*`, não outras tabelas que existam no mesmo projeto.

1. Crie um projeto no Supabase e execute, no SQL Editor, `supabase/migrations/0001_schema_rr.sql`
   e depois `supabase/migrations/0002_views_rr.sql`.
2. Publique os resultados (chave de serviço **somente** em variáveis de ambiente ou em um `.env`
   local, nunca no repositório):

   ```bash
   export SUPABASE_URL=https://<projeto>.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=<chave de serviço>
   python pipeline/04_publicar_supabase.py --limpar
   ```

   No Prompt de Comando do Windows, troque `export` por `set`.

   Alternativa sem Python: execute os arquivos de `supabase/seed/` em ordem no SQL Editor.
3. Copie `dashboard/.env.example` para `dashboard/.env` e preencha `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY` (chave pública/anon, projetada para uso no navegador). Rode
   `npm run dev`. O `.env` não é versionado nem entra no pacote de entrega.

### 4.5 Apresentação e capturas de tela

```bash
cd apresentacao
npm install
npm run gerar                       # gera o PPTX da Sprint 1 a partir dos resultados do pipeline
node capturar_telas.js http://localhost:4173/   # com o dashboard servido (npm run preview)
```

## 5. Principais códigos e artefatos

| Artefato | Descrição |
|---|---|
| `pipeline/01_gerar_dados_sinteticos.py` | Gera ~80 lojas e milhares de colaboradores com admissões sazonais, mecanismo de desligamento voluntário (hazard com efeitos plausíveis e heterogeneidade não observada) e involuntário, motivos declarados e censura na data de referência |
| `pipeline/02_preparar_e_treinar.py` | Define o checkpoint de 30 dias e os alvos de 90/180 dias; divisão temporal e validação cruzada; compara regressão logística, random forest, gradient boosting e XGBoost; seleciona por AUC com regra de parcimônia; contribuições no estilo SHAP; predições, risco vigente, fatores, ações; KM, tendência mensal, custo, auditoria de viés; validação retroativa com picos; model card para o simulador |
| `pipeline/03_exportar_artefatos.py` | Reproduz em pandas a lógica das views SQL e grava a cópia JSON dos resultados; gera os scripts SQL de carga em lotes |
| `pipeline/04_publicar_supabase.py` | Carga por upsert em lotes no Supabase, com `--dry-run` e `--limpar` |
| `pipeline/modelos/relatorio_treino.md` | Métricas por modelo e horizonte, modelo selecionado, calibração, viés e limitações |
| `notebooks/01_eda_e_modelagem.ipynb` | Narrativa completa: qualidade dos dados, EDA, sazonalidade, KM, modelagem, explicabilidade, calibração, auditoria de viés, conclusões |
| `docs/modelo-preditivo.md` | Metodologia, métricas por modelo, seleção, explicabilidade, calibração, auditoria de viés e limitações |
| `supabase/migrations/*.sql` | Esquema (12 tabelas com prefixo `rr_`, RLS com leitura pública nessas tabelas) e 5 views de consumo |
| `dashboard/src/lib/data.ts` | Camada de dados: Supabase (com paginação) ou JSON local, com cache e selo de fonte |
| `dashboard/src/pages/*.tsx` | Visão geral, mapa de risco, colaboradores em risco, fatores e modelo, simulador, recomendações e ética |
| `apresentacao/gerar_apresentacao.js` | Apresentação da Sprint 1 gerada com os números do pipeline e os recortes de tela do dashboard |

## 6. Resultados do protótipo (base sintética)

<!-- RESULTADOS:INICIO -->
Números da execução atual do pipeline (seed fixa; ver `pipeline/modelos/relatorio_treino.md`).

| Indicador | Valor |
|---|---|
| Lojas / colaboradores na base sintética | 80 / 7.259 |
| Headcount ativo na data de referência (31/10/2026) | 3.151 |
| Saída voluntária até 90 dias | 22,4% de todos os admitidos com janela completa (KPI do dashboard, inclui saídas antes do dia 30); 15,5% entre quem passou do dia 30 (população do modelo) |
| Saída voluntária até 180 dias | 31,8% de todos os admitidos com janela completa; 25,7% entre quem passou do dia 30 |
| Modelo selecionado (90 dias) e AUC-ROC no teste temporal | Regressão logística, AUC 0,805 (AUC-PR 0,450) |
| Modelo selecionado (180 dias) e AUC-ROC no teste temporal | Regressão logística, AUC 0,824 (AUC-PR 0,609) |
| Validação retroativa (treino até 2024, teste em 2025), 90 dias | AUC 0,834 geral; 0,819 em admissões de pico; 0,827 fora do pico |
| Colaboradores escorados (ativos entre 30 e 180 dias) | 701 (Baixo 498, Médio 111, Alto 58, Crítico 34), com nível sobre o risco vigente |
| Fatores mais importantes (90 dias) | indicador de turnover da loja (proxy sintético), avaliação de 30 dias, integração concluída, distância casa-trabalho, canal de contratação |
<!-- RESULTADOS:FIM -->

## 7. Ética, privacidade e LGPD

* Dados sintéticos no MVP; na operação real, pseudonimização na origem e minimização de campos.
* Nenhum atributo protegido (idade, gênero, raça, saúde) é usado como preditor; a faixa etária
  entra apenas na **auditoria de viés** publicada no dashboard. A auditoria encontrou a faixa 55+
  superestimada e a 18-24 subestimada, e `tipo_contrato` e `canal_contratacao` funcionam como proxies
  de idade. Isso deve ser revisto com Gente & Gestão antes de qualquer uso.
* O score apoia conversas de acolhimento e ações de retenção conduzidas por pessoas; **não**
  deve ser usado para punir, desligar ou reduzir oportunidades.
* Detalhes em [docs/etica-lgpd.md](docs/etica-lgpd.md).

## 8. Limitações conhecidas

* **Base sintética**: as taxas, os efeitos dos fatores e as métricas refletem o mecanismo
  simulado; com os dados reais da Ri Happy o modelo precisa ser re-treinado e recalibrado.
* **Link público sem banco**: o site lê a cópia JSON dos resultados; a leitura pelo Supabase só ocorre na
  execução local com `.env`.
* **Score no checkpoint de 30 dias**: o risco não é recalculado depois disso (rescoring
  periódico é evolução prevista); colaboradores com menos de 30 dias aparecem como "aguardando
  checkpoint".
* **Horizonte de 90 dias vencido**: 260 dos 701 escorados já passaram do dia 90. Para eles, o nível usa o
  risco residual até o dia 180, condicional a ter chegado ao dia 90.
* **Teste temporal sem picos**: o teste só tem admissões de janeiro a agosto de 2026, embora mais da metade
  do treino seja de pico. A validação retroativa em 2025 cobre esse regime.
* **`turnover_loja_12m` é proxy sintético**: base latente da loja com ruído individual, não o turnover
  realizado mostrado no Mapa de Risco. Por isso os dois valores diferem.
* **Série mensal**: a base começa vazia em jan/2023 e o headcount cresce durante toda a série, o que infla a
  taxa de turnover dos primeiros meses; o gráfico mostra os últimos 24 meses. O headcount simulado também supera
  o `headcount_alvo` das lojas.
* **Temporários efetivados** continuam com o contrato "Temporário Sazonal" na base sintética.
* **Calibração**: em 90 dias, as faixas Médio e Alto ficam superestimadas no teste; os limiares são faixas de
  priorização, não probabilidades exatas.
* **Risco competitivo**: saídas involuntárias e fim de contrato temporário antes do horizonte
  recebem rótulo 0 (não saiu voluntariamente); um modelo de sobrevivência com riscos competitivos
  é evolução prevista.
* **Parâmetros de custo** são premissas ilustrativas a validar com a empresa.
* **Benchmarks de mercado** vêm de fontes públicas regionais ou setoriais e servem como ordem
  de grandeza, não como comparação direta.
* **Sem autenticação** no dashboard, aceitável apenas porque os dados são sintéticos; perfis de acesso e
  RLS por loja são evolução prevista.

Detalhes em [docs/modelo-preditivo.md](docs/modelo-preditivo.md).

## 9. Links

Ver [links.txt](links.txt).
