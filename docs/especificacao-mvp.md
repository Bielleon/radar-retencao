# Radar de Retenção — Especificação do MVP

Enterprise Challenge Ri Happy × FIAP (turma 2TSCOR, Tecnologia em Data Science).
Grupo: Gabriel Alves Leon Rodriguez (RM566648), trabalho individual.

## 1. Problema e recorte

**Desafio da Ri Happy:** prever o risco de desligamento **voluntário** de colaboradores
**operacionais de loja** nos primeiros **90 e 180 dias** de casa, explicar os fatores
associados e apoiar a área de Gente & Gestão em ações preventivas de retenção.

**Recorte priorizado pelo projeto:**
1. Desligamentos voluntários ocorridos nos primeiros meses (90/180 dias).
2. Identificação de colaboradores e perfis com maior risco, com os fatores explicados.
3. Lojas, regiões e cargos que exigem atenção (onde agir preventivamente).
4. Apoio à definição de ações preventivas (playbook de retenção) e estimativa do custo
   evitável do turnover precoce.

**Fora do escopo do MVP:** áreas corporativas e centros de distribuição; desligamentos
involuntários como alvo (entram apenas como contexto/censura); integração em tempo real
com o sistema de RH (o MVP usa cargas em lote).

## 2. Usuários e partes interessadas

| Usuário | Como usa |
|---|---|
| Gente & Gestão (BP de RH, retenção) | Lista priorizada de colaboradores em risco, fatores, playbook de ações, acompanhamento |
| Gerentes regionais e gerentes de loja | Mapa de risco da loja/região, alertas, conversas de retenção |
| Operações / planejamento de picos | Risco por campanha (Dia das Crianças, Natal), dimensionamento e contratação |
| Analytics / Tecnologia | Pipeline reprodutível, modelo documentado, monitoramento |
| Liderança executiva | KPIs de turnover, custo do turnover, tendência |

## 3. Decisões de modelagem (contrato)

* **Unidade de análise:** colaborador operacional de loja admitido no período histórico.
* **Checkpoint de score:** dia **30** de casa (fim da integração). Nesse ponto estão
  disponíveis os dados de admissão + sinais dos primeiros 30 dias (integração concluída,
  horas de treinamento, avaliação de experiência, faltas, atrasos, horas extras).
* **Alvos (dois modelos binários):**
  * `y90`  = desligamento voluntário com `dias_de_casa <= 90`
  * `y180` = desligamento voluntário com `dias_de_casa <= 180`
* **População de treino:** admitidos com janela completa observada (admissão <= data de
  referência − 90 / − 180 dias), excluindo quem saiu (por qualquer motivo) antes do dia 30.
* **Saída involuntária / fim de contrato temporário antes do horizonte:** rótulo 0 (não
  saiu voluntariamente). Registrado como limitação (risco competitivo).
* **População escorada (dashboard):** ativos com `30 <= dias_de_casa <= 180`.
  Ativos com `< 30` dias aparecem como "aguardando checkpoint".
* **Variáveis preditoras:** cargo, tipo_contrato, faixa_salarial, escolaridade, turno,
  carga_horaria_semanal, canal_contratacao, experiencia_previa_varejo,
  distancia_casa_trabalho_km, admitido_periodo_pico, mes_admissao, bandeira, tipo_loja,
  regiao, porte, onboarding_concluido, horas_treinamento_30d, avaliacao_experiencia_30d
  (+ indicador de ausente), faltas_30d, atrasos_30d, horas_extras_media_semana,
  gestor_tempo_cargo_meses, turnover_loja_12m.
* **Variáveis excluídas por ética:** `faixa_etaria` (e qualquer atributo protegido) **não**
  entra como preditor; é usada apenas na **auditoria de viés** (`rr_avaliacao_vies`).
  `loja_id` não entra (alta cardinalidade); a loja é representada por atributos agregados.
* **Modelos comparados:** regressão logística (baseline interpretável), random forest,
  gradient boosting (sklearn HistGradientBoosting) e XGBoost.
* **Validação:** divisão **temporal** (treino = admissões até 2025-12-31; teste = admissões
  de 2026 com janela completa) + validação cruzada estratificada (5 folds) no treino.
* **Métricas:** AUC-ROC, AUC-PR, Brier, recall e precisão no top 20% de maior risco,
  calibração por decil.
* **Regra de seleção:** maior AUC-ROC no teste temporal; se a regressão logística ficar a
  menos de 0,01 de AUC do melhor modelo, ela é escolhida (parcimônia e interpretabilidade).
* **Explicabilidade:** SHAP (TreeExplainer ou LinearExplainer conforme o modelo).
  Global = média |SHAP|; individual = 3 maiores contribuições com direção e valor.
* **Níveis de risco (sobre o risco vigente):** Baixo < 0,15; Médio 0,15–0,30; Alto 0,30–0,45;
  Crítico >= 0,45. Até o dia 90, o risco vigente é `risco_90d`. Depois do dia 90 esse horizonte
  já venceu sem o evento, então vale o risco residual até o dia 180, condicional a ter chegado ao
  dia 90: `(risco_180d - risco_90d) / (1 - risco_90d)`, limitado a zero. Para essas pessoas, os
  fatores vêm do modelo de 180 dias. No simulador, que representa o dia 30, o nível usa `risco_90d`.
* **Simulador (what-if):** usa a regressão logística exportada em `rr_modelos.card`
  (coeficientes + padronização). Quando a RL é o modelo selecionado, o simulador é o
  próprio modelo; caso contrário é um modelo substituto interpretável (informado na tela).
* **Análises complementares:** curva de sobrevivência Kaplan-Meier (evento = saída
  voluntária), tendência mensal com marcação dos picos sazonais, custo do turnover
  parametrizado, motivos declarados de saída, auditoria de viés.

## 4. Fluxo de dados

```
[Base de RH (sintética, CSV)] --> [01 geração/ingestão] --> data/raw/*.csv
      --> [02 preparação + treino + explicabilidade] --> pipeline/modelos/*, data/processed/*.csv
      --> [03 exportação de artefatos] --> dashboard/public/demo/*.json + supabase/seed/*.sql
      --> [04 publicação, opcional] --> Supabase (Postgres + PostgREST, RLS nas tabelas rr_*)
      --> [Dashboard web (Vite + React)] --> Gente & Gestão / lideranças
```

O dashboard lê as views do Supabase quando configurado por `.env` local. O link público lê a
cópia JSON (`dashboard/public/demo`), sem credenciais de banco.

## 5. Dashboard — páginas e conteúdo

Interface em português, somente leitura, responsiva. Fonte de dados: Supabase (views
`rr_vw_*` e tabelas `rr_*`) ou, sem configuração, arquivos `public/demo/*.json`.

1. **Visão Geral** — KPIs (`rr_vw_kpis`): headcount ativo, ativos em janela de risco,
   nº e % em risco alto/crítico, taxa histórica de saída voluntária até 90 e 180 dias,
   desligamentos voluntários 12m (total e precoces), custo estimado 12m. Gráfico de
   tendência mensal (`rr_turnover_mensal`) com admissões, saídas voluntárias e picos
   (Dia das Crianças, Natal). Curva de sobrevivência (`rr_curva_sobrevivencia`, geral e
   por tipo de contrato). Motivos declarados (`rr_vw_motivos_saida`).
2. **Mapa de Risco** — tabela/heat-table por loja (`rr_vw_risco_loja`) ordenável por
   % alto risco, com filtros de região/bandeira; barras por segmento
   (`rr_vw_risco_segmento`: cargo, região, contrato, bandeira, salário, turno, canal).
3. **Colaboradores em Risco** — lista priorizada (`rr_vw_colaboradores_risco`) com ID
   pseudonimizado, loja, cargo, contrato, dias de casa, risco 90d/180d, nível, 3 fatores
   e ação recomendada; filtros por nível, região, loja, cargo; painel de detalhe.
4. **Fatores e Modelo** — importância global (`rr_fatores_globais`), efeito por categoria
   (`rr_efeito_fator`), métricas comparativas dos modelos (`rr_metricas_modelo`),
   auditoria de viés (`rr_avaliacao_vies`), limitações.
5. **Simulador** — formulário com os atributos do colaborador → risco 90d/180d, nível,
   fatores e ações sugeridas (cálculo no navegador com `rr_modelos.card`).
6. **Recomendações e Ética** — playbook (`rr_recomendacoes`), parâmetros de custo
   (`rr_parametros_custo`) com simulação de economia por redução de saídas precoces,
   princípios de LGPD/ética e uso responsável.

## 6. Contrato de dados (nomes idênticos no Supabase e na cópia JSON)

| Chave lógica | Supabase | Arquivo demo |
|---|---|---|
| kpis | `rr_vw_kpis` | `/demo/kpis.json` (array com 1 objeto) |
| turnover_mensal | `rr_turnover_mensal` | `/demo/turnover_mensal.json` |
| curva_sobrevivencia | `rr_curva_sobrevivencia` | `/demo/curva_sobrevivencia.json` |
| motivos_saida | `rr_vw_motivos_saida` | `/demo/motivos_saida.json` |
| risco_loja | `rr_vw_risco_loja` | `/demo/risco_loja.json` |
| risco_segmento | `rr_vw_risco_segmento` | `/demo/risco_segmento.json` |
| colaboradores_risco | `rr_vw_colaboradores_risco` | `/demo/colaboradores_risco.json` |
| fatores_globais | `rr_fatores_globais` | `/demo/fatores_globais.json` |
| efeito_fator | `rr_efeito_fator` | `/demo/efeito_fator.json` |
| metricas_modelo | `rr_metricas_modelo` | `/demo/metricas_modelo.json` |
| avaliacao_vies | `rr_avaliacao_vies` | `/demo/avaliacao_vies.json` |
| parametros_custo | `rr_parametros_custo` | `/demo/parametros_custo.json` |
| recomendacoes | `rr_recomendacoes` | `/demo/recomendacoes.json` |
| modelos | `rr_modelos` | `/demo/modelos.json` |

Cada arquivo demo é um array de objetos com exatamente as colunas da view/tabela
correspondente (datas como `YYYY-MM-DD`, números como number, jsonb como objeto).

### Formato de `fatores_top` (jsonb / objeto)

```json
[
  {"fator": "onboarding_concluido", "rotulo": "Integração não concluída", "valor": "Não",
   "contribuicao": 0.21, "direcao": "aumenta"},
  {"fator": "distancia_casa_trabalho_km", "rotulo": "Distância casa-trabalho", "valor": "27 km",
   "contribuicao": 0.12, "direcao": "aumenta"},
  {"fator": "avaliacao_experiencia_30d", "rotulo": "Avaliação de experiência (30 dias)", "valor": "4,5 / 5",
   "contribuicao": -0.08, "direcao": "reduz"}
]
```

`contribuicao` está em log-odds na regressão logística (ou na escala do SHAP, em modelos de árvore);
o dashboard a usa para a direção e o ranking.

### Formato de `rr_modelos.card` (para o simulador)

```json
{
  "versao": "v1.0",
  "data_referencia": "2026-10-31",
  "modelo_selecionado": {"90d": "gradient_boosting", "180d": "gradient_boosting"},
  "simulador_e_modelo_oficial": {"90d": false, "180d": false},
  "limiares_nivel": {"Medio": 0.15, "Alto": 0.30, "Critico": 0.45},
  "inputs": [
    {"feature": "tipo_contrato", "rotulo": "Tipo de contrato", "tipo": "cat",
     "opcoes": ["CLT Efetivo", "Temporario Sazonal", "Jovem Aprendiz", "Intermitente"], "padrao": "CLT Efetivo"},
    {"feature": "distancia_casa_trabalho_km", "rotulo": "Distância casa-trabalho (km)", "tipo": "num",
     "min": 0, "max": 60, "passo": 1, "padrao": 10},
    {"feature": "onboarding_concluido", "rotulo": "Integração concluída até o dia 30", "tipo": "bool", "padrao": true}
  ],
  "simulador": {
    "90d":  {"intercepto": -1.9, "termos": [
              {"feature": "distancia_casa_trabalho_km", "tipo": "num", "media": 12.1, "desvio": 8.4, "coef": 0.31, "referencia": 0.0},
              {"feature": "onboarding_concluido", "tipo": "num", "media": 0.78, "desvio": 0.41, "coef": -0.44},
              {"feature": "tipo_contrato", "tipo": "cat", "coefs": {"CLT Efetivo": 0.0, "Temporario Sazonal": 0.62}}
            ]},
    "180d": {"intercepto": -1.2, "termos": []}
  }
}
```

Cálculo no navegador: `logit = intercepto + Σ coef·(x − media)/desvio (num/bool como 0/1)
+ Σ coefs[categoria] (cat)`; `risco = 1 / (1 + e^(−logit))`. Categorias ausentes em
`coefs` valem 0 (categoria de referência). Variáveis com valor nulo (ex.: avaliação não
realizada) usam a média (contribuição zero) e, quando existir, o termo indicador
`<feature>_ausente` = 1. O campo `referencia` é a contribuição média do termo na amostra de fundo: é
subtraído só na exibição dos fatores do simulador, para que o ranking seja o mesmo de `fatores_top`, e
não entra no logit.

## 7. Playbook de recomendações (regras)

| Gatilho (fator) | Ação | Responsável | Prazo |
|---|---|---|---|
| onboarding_concluido = Não | Concluir trilha de integração com acompanhamento do líder | Líder de loja | 7 dias |
| avaliacao_experiencia_30d <= 2.5 | Conversa de feedback estruturada (1:1) e plano de desenvolvimento de 30 dias | Líder + BP RH | 7 dias |
| distancia_casa_trabalho_km >= 20 | Avaliar transferência para loja mais próxima, ajuste de escala e apoio de transporte | BP RH | 15 dias |
| faltas_30d >= 2 ou atrasos_30d >= 3 | Conversa de acolhimento para entender causas (saúde, transporte, estudos) e ajustar escala | Líder de loja | 5 dias |
| tipo_contrato = Temporario Sazonal | Comunicar critérios de efetivação pós-campanha e trilha de carreira | BP RH | 10 dias |
| faixa_salarial = Ate 1.5 SM | Revisar variável/comissão e benefícios; reconhecimento não financeiro | Gente & Gestão | 30 dias |
| gestor_tempo_cargo_meses < 6 | Mentoria para o líder recém-promovido com apoio do gerente regional | Gerente regional | 15 dias |
| turnover_loja_12m alto (>= 0.45) | Diagnóstico de clima da loja e plano de ação | Gerente regional + RH | 30 dias |
| horas_extras_media_semana >= 6 | Revisar escala e dimensionamento da equipe nos picos | Operações | 15 dias |
| turno = Noite | Avaliar preferência de turno e rodízio | Líder de loja | 15 dias |
| canal_contratacao = Agencia | Reforçar alinhamento de expectativas na seleção (prévia realista da função) | Recrutamento | 30 dias |
| nível Crítico | Conversa de retenção líder + RH em 48h | Líder + BP RH | 2 dias |
| nível Alto | Plano de retenção individual em 7 dias | Líder de loja | 7 dias |
| nível Médio | Acompanhamento quinzenal na integração | Líder de loja | 15 dias |
| nível Baixo | Acompanhamento padrão de integração | Líder de loja | 30 dias |

A `acao_recomendada` de cada colaborador = ação do nível + ação do fator principal.

## 8. Parâmetros de custo do turnover precoce (valores ilustrativos, editáveis)

| Chave | Rótulo | Valor (R$) |
|---|---|---|
| recrutamento_selecao | Recrutamento e seleção | 900 |
| treinamento_integracao | Treinamento e integração (horas de treinador + material) | 1.400 |
| encargos_rescisorios | Encargos e processo de desligamento | 1.100 |
| produtividade_perdida | Produtividade perdida na curva de aprendizado | 2.200 |
| vacancia_cobertura | Cobertura da vaga (horas extras, loja desfalcada) | 900 |

Total ≈ R$ 6.500 por desligamento precoce (premissa a validar com a Ri Happy).

## 9. Ética, privacidade e LGPD (resumo)

* Dados sintéticos no MVP; na operação real: pseudonimização dos IDs, minimização de
  campos, base legal (legítimo interesse com teste de balanceamento), finalidade exclusiva
  de retenção/melhoria do ambiente, retenção limitada, acesso por perfil.
* Nenhum atributo protegido (idade, gênero, raça, saúde) como preditor; auditoria de
  viés por faixa etária e região publicada no dashboard.
* O score **nunca** é usado para penalizar, demitir ou reduzir oportunidades; apoia
  conversas de acolhimento e ações de retenção conduzidas por pessoas.
* Transparência: fatores explicados em linguagem simples; limitações declaradas.
