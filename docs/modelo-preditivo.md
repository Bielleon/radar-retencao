# Modelo preditivo — Radar de Retenção

Metodologia, resultados e limitações dos modelos de risco de desligamento voluntário. Os números vêm de
`data/processed/metricas_modelo.csv`, `dashboard/public/demo/avaliacao_vies.json` e
`pipeline/modelos/relatorio_treino.md`, gerados com semente fixa (42) e data de referência 31/10/2026.

> **Todos os resultados vêm de uma base sintética.** Os dados da Ri Happy entram na Sprint 2. Os efeitos dos fatores
> foram parametrizados no gerador: os números validam o método e não são achados sobre a Ri Happy.

## 1. Dados e população

* **Base:** 7.259 colaboradores operacionais de loja em 80 lojas, admitidos de 2023-01-01 a 2026-10-31
  (3.151 ativos e 4.108 desligados), gerados por `pipeline/01_gerar_dados_sinteticos.py`.
* **População de treino:** admitidos com janela completa para o horizonte (admissão até a data de referência menos 90
  ou 180 dias) e que chegaram ao dia 30. Quem saiu antes do dia 30, por qualquer motivo, fica fora.
* **População escorada:** 701 ativos com 30 a 180 dias de casa.

As taxas de saída têm duas definições, que não devem ser confundidas:

| Horizonte | Todos os admitidos com janela completa (KPI do dashboard) | Quem passou do dia 30 (população do modelo) |
|---|---|---|
| 90 dias | 22,4% (n = 6.424) | 15,5% (n = 5.863) |
| 180 dias | 31,8% (n = 6.072) | 25,7% (n = 5.532) |

## 2. Checkpoint de 30 dias

O score é calculado uma vez, no dia 30 de casa, ao fim da integração. Só entra no modelo o que está disponível até esse
ponto: dados de admissão e sinais dos primeiros 30 dias. Quem tem menos de 30 dias aparece como "aguardando checkpoint".

## 3. Alvos

* `y90`: desligamento voluntário com `dias_de_casa <= 90`.
* `y180`: desligamento voluntário com `dias_de_casa <= 180`.

Saídas involuntárias e fins de contrato antes do horizonte recebem rótulo 0 (limitação de risco competitivo).

## 4. Variáveis e exclusões éticas

**Preditoras (24 colunas):** cargo, tipo de contrato, faixa salarial, escolaridade, turno, canal de contratação, mês de
admissão, bandeira, tipo de loja, região, porte, carga horária semanal, experiência prévia em varejo, distância
casa-trabalho, admissão em pico, integração concluída, horas de treinamento, avaliação de experiência e indicador de
avaliação ausente, faltas, atrasos, horas extras, tempo do gestor no cargo e indicador de turnover da loja.

**Excluídas por ética:** `faixa_etaria` não é preditora e entra só na auditoria de viés. Gênero, raça e saúde não existem
na base. `loja_id` também fica de fora, por alta cardinalidade.

**Proxies a vigiar:** `tipo_contrato` (Jovem Aprendiz) e `canal_contratacao` (Programa Jovem) estão ligados à idade. Distância,
faixa salarial e escolaridade também podem funcionar como proxies; são mantidas porque têm ação de retenção associada.

**Indicador de turnover da loja:** `turnover_loja_12m` é um proxy sintético, com base latente da loja e ruído individual.
Dois colegas da mesma loja, admitidos na mesma data, podem ter valores diferentes, e ele difere do turnover realizado do
Mapa de Risco. Não há vazamento de saídas futuras, mas na base real a variável precisa ser calculada de fato.

## 5. Divisão temporal e validação cruzada

| Horizonte | Treino (admissões até 2025-12-31) | Teste temporal | Período do teste | Admissões de pico no teste |
|---|---|---|---|---|
| 90 dias | 5.066 (taxa 16,3%) | 797 (taxa 10,0%) | 01/01 a 02/08/2026 | 0 |
| 180 dias | 5.066 (taxa 26,0%) | 466 (taxa 21,7%) | 01/01 a 04/05/2026 | 0 |

A validação cruzada estratificada de 5 folds roda dentro do treino. **O teste temporal não tem nenhuma admissão de pico**, embora
mais da metade do treino seja de pico. Por isso há uma validação retroativa, com a regressão logística treinada até 2024 e testada
nas admissões de 2025, que não altera os modelos publicados:

| Horizonte | Recorte | n | Taxa real | Risco médio previsto | AUC-ROC |
|---|---|---|---|---|---|
| 90 dias | Geral | 1.757 | 16,9% | 15,9% | 0,834 |
| 90 dias | Admissões de pico | 926 | 22,1% | 19,8% | 0,819 |
| 90 dias | Fora do pico | 831 | 11,0% | 11,6% | 0,827 |
| 90 dias | Temporários sazonais | 529 | 28,4% | 24,2% | 0,800 |
| 180 dias | Geral | 1.757 | 26,7% | 25,0% | 0,824 |
| 180 dias | Admissões de pico | 926 | 31,9% | 29,6% | 0,810 |
| 180 dias | Fora do pico | 831 | 20,9% | 20,0% | 0,828 |
| 180 dias | Temporários sazonais | 529 | 35,0% | 33,0% | 0,806 |

## 6. Métricas por modelo e horizonte (teste temporal)

| Horizonte | Modelo | AUC-ROC | AUC-PR | Brier | Recall top 20% | Precisão top 20% | F1 (limiar ótimo) | AUC VC (média) | AUC VC (desvio) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 90 dias | **Regressão logística (selecionado)** | **0,805** | 0,450 | 0,074 | 0,588 | 0,294 | 0,447 | 0,823 | 0,010 |
| 90 dias | Random forest | 0,782 | 0,377 | 0,080 | 0,575 | 0,287 | 0,413 | 0,801 | 0,016 |
| 90 dias | Gradient boosting (HistGB) | 0,808 | 0,482 | 0,072 | 0,575 | 0,287 | 0,479 | 0,802 | 0,012 |
| 90 dias | XGBoost | 0,803 | 0,489 | 0,072 | 0,550 | 0,275 | 0,487 | 0,805 | 0,012 |
| 180 dias | **Regressão logística (selecionado)** | **0,824** | 0,609 | 0,125 | 0,535 | 0,574 | 0,585 | 0,818 | 0,012 |
| 180 dias | Random forest | 0,804 | 0,567 | 0,137 | 0,505 | 0,543 | 0,559 | 0,801 | 0,010 |
| 180 dias | Gradient boosting (HistGB) | 0,813 | 0,601 | 0,129 | 0,485 | 0,521 | 0,565 | 0,804 | 0,008 |
| 180 dias | XGBoost | 0,822 | 0,631 | 0,124 | 0,505 | 0,543 | 0,559 | 0,809 | 0,008 |

O F1 usa, em cada modelo, o limiar que o maximiza no próprio conjunto avaliado, por isso compara potencial, não um ponto de corte
operacional. Em 90 dias, os 20% de maior risco concentram 59% das saídas.

## 7. Regra de seleção e modelo escolhido

Vence o maior AUC-ROC no teste temporal, mas a regressão logística é preferida quando fica a menos de 0,01 do melhor modelo, por
parcimônia e interpretabilidade. **A regressão logística foi selecionada nos dois horizontes.** Em 90 dias, ela fica a 0,004 do gradient
boosting (0,808); em 180 dias, tem o maior AUC. O modelo publicado de cada horizonte é re-treinado com os mesmos hiperparâmetros em
treino + teste antes de escorar os ativos. Como a regressão logística é o modelo oficial, o simulador do dashboard é o próprio modelo.

## 8. Risco vigente e níveis

Os modelos estimam, no dia 30, a probabilidade de saída até o dia 90 e até o dia 180. Depois do dia 90, o evento "saída até o dia 90" não
pode mais ocorrer. Por isso o nível usa o **risco vigente**:

* até o dia 90: `risco_90d`;
* depois do dia 90: `(risco_180d - risco_90d) / (1 - risco_90d)`, o risco residual até o dia 180, condicional a ter chegado ao dia 90, limitado a zero.

Os limiares são Baixo < 0,15; Médio de 0,15 a 0,30; Alto de 0,30 a 0,45; e Crítico a partir de 0,45. Na data de referência, 260 dos 701
escorados já passaram do dia 90. A distribuição é Baixo 498, Médio 111, Alto 58 e Crítico 34. Para quem passou do dia 90, os fatores vêm
do modelo de 180 dias. O risco não é reestimado com dados posteriores ao dia 30.

## 9. Explicabilidade

Os dois modelos selecionados são regressões logísticas, então a execução atual não chama a biblioteca SHAP. As contribuições são
`coef x (x_padronizado - média)`, matematicamente equivalentes ao SHAP linear, em log-odds. Para modelos de árvore, o pipeline usa
`shap.TreeExplainer`, e `permutation_importance` como alternativa em caso de falha.

* **Global:** média do valor absoluto da contribuição por variável.
* **Individual:** três fatores de maior contribuição, com direção e valor, que alimentam a lista e a ação recomendada.

Fatores de maior peso em 90 dias: indicador de turnover da loja (0,534), avaliação de experiência (0,445), integração concluída (0,417),
distância casa-trabalho (0,331), canal de contratação (0,317) e tipo de contrato (0,303).

## 10. Calibração

| Nível no teste de 90 dias | n | Risco médio previsto | Taxa real |
|---|---:|---:|---:|
| Baixo | 593 | 5,0% | 5,1% |
| Médio | 119 | 21,6% | 13,4% |
| Alto | 49 | 35,7% | 26,5% |
| Crítico | 36 | 57,9% | 58,3% |

O modelo fica calibrado nos extremos, e as faixas Médio e Alto ficam superestimadas em 90 dias, em um teste sem picos e com amostras
pequenas. Em 180 dias a calibração é melhor (Baixo 5,8% contra 5,7%; Médio 22,3% contra 26,0%; Alto 36,7% contra 30,6%; Crítico 62,1%
contra 63,0%). Nenhum recalibrador é aplicado. Os limiares são faixas de priorização, não probabilidades exatas. As tabelas por decil
estão em `pipeline/modelos/relatorio_treino.md`.

## 11. Auditoria de viés

Métricas por grupo com previsões fora da amostra (validação cruzada de 5 folds em treino + teste). "% risco ≥ 30%" é a proporção do grupo
com risco a partir de 0,30 no horizonte.

| Horizonte | Faixa etária | n | Taxa real | Risco previsto | Diferença | AUC | % risco ≥ 30% |
|---|---|---:|---:|---:|---:|---:|---:|
| 90 dias | 18-24 | 2.326 | 18,8% | 17,1% | -1,7 p.p. | 0,813 | 18,7% |
| 90 dias | 25-34 | 1.825 | 14,2% | 14,9% | +0,7 p.p. | 0,817 | 16,9% |
| 90 dias | 35-44 | 1.019 | 12,2% | 13,8% | +1,6 p.p. | 0,873 | 15,0% |
| 90 dias | 45-54 | 482 | 14,5% | 14,8% | +0,3 p.p. | 0,813 | 17,2% |
| 90 dias | 55+ | 211 | 8,1% | 13,0% | +4,9 p.p. | 0,795 | 14,7% |
| 180 dias | 18-24 | 2.196 | 31,2% | 28,8% | -2,4 p.p. | 0,817 | 38,9% |
| 180 dias | 25-34 | 1.734 | 23,5% | 24,3% | +0,8 p.p. | 0,801 | 31,6% |
| 180 dias | 35-44 | 951 | 19,6% | 22,9% | +3,3 p.p. | 0,844 | 29,3% |
| 180 dias | 45-54 | 455 | 24,4% | 24,0% | -0,4 p.p. | 0,812 | 31,2% |
| 180 dias | 55+ | 196 | 15,3% | 21,0% | +5,7 p.p. | 0,776 | 23,5% |

**Conclusão.** A faixa 55+ fica superestimada nos dois horizontes e, em 180 dias, passa do alerta de 5 p.p. do dashboard; em 90 dias, 14,7% do
grupo tem risco alto, quase o dobro da taxa real, com excesso de alertas. A faixa 18-24 fica subestimada, com risco de casos perdidos. Por
região e escolaridade, as diferenças ficam abaixo de 1 p.p. A revisão com Gente & Gestão é necessária antes de qualquer uso, e a recalibração por
grupo será avaliada na Sprint 2.

## 12. Limitações

* **Base sintética:** os efeitos foram parametrizados no gerador; com a base real, tudo precisa ser re-treinado e recalibrado.
* **Teste temporal:** curto em 180 dias (até 4 de maio de 2026) e sem admissões de pico. IC95 bootstrap da AUC da regressão logística em 90 dias: 0,754 a 0,856 (1.000 reamostragens).
* **Risco competitivo:** saídas involuntárias e fim de contrato antes do horizonte recebem rótulo 0.
* **Score único no dia 30:** sinais posteriores não entram; o rescoring é evolução prevista.
* **População escorada e treino:** ativos que já passaram do dia 90 estão no treino do modelo de 90 dias com rótulo 0, o que reforça a necessidade do risco vigente.
* **Indicador de turnover da loja:** é proxy sintético, não reproduzível a partir das saídas da base.
* **Mês e pico:** `mes_admissao` e `admitido_periodo_pico` são colineares, e os coeficientes de mês não devem ser interpretados; o gerador não tem efeito de mês além do pico.
* **Temporários efetivados:** continuam marcados como "Temporário Sazonal" na base sintética.
* **Correlação não é causa:** os fatores orientam conversas de retenção e nunca decisões punitivas (ver [etica-lgpd.md](etica-lgpd.md)).
