# Relatório de treino — Radar de Retenção v1.0

Gerado em 2026-11-06T10:51:22+00:00 | data de referência 2026-10-31 | semente 42.

## Base e populações

* Colaboradores na base: 7259 (ativos 3151; desligados 4108).
* População escorada (ativos com 30 a 180 dias de casa): 701.

* 90d: treino 5066 (taxa 0.163) | teste temporal 797 (taxa 0.100).
  Teste 90d: admissões de 2026-01-01 a 2026-08-02; 0 admissões de pico e 66 temporários.
* 180d: treino 5066 (taxa 0.260) | teste temporal 466 (taxa 0.217).
  Teste 180d: admissões de 2026-01-01 a 2026-05-04; 0 admissões de pico e 38 temporários.

Divisão temporal: treino = admissões até 2025-12-31; teste = admissões de 2026 com janela completa. 
Validação cruzada estratificada (5 folds) no treino. Quem saiu antes do dia 30 (por qualquer motivo) não entra no treino; 
saídas involuntárias e fins de contrato antes do horizonte recebem rótulo 0 (limitação: risco competitivo).

## Métricas por modelo e horizonte (teste temporal)

| horizonte | modelo | auc_roc | auc_pr | brier | recall_top20 | precisao_top20 | f1 | limiar_f1 | taxa_base | auc_cv_media | auc_cv_desvio |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 180d | Gradient boosting (HistGB) | 0.8127 | 0.6015 | 0.1287 | 0.4852 | 0.5213 | 0.5654 | 0.2931 | 0.2167 | 0.8038 | 0.0075 |
| 180d | Random forest | 0.8037 | 0.5669 | 0.1374 | 0.5050 | 0.5425 | 0.5589 | 0.2944 | 0.2167 | 0.8013 | 0.0095 |
| 180d | Regressão logística | 0.8237 | 0.6090 | 0.1246 | 0.5346 | 0.5745 | 0.5854 | 0.3431 | 0.2167 | 0.8180 | 0.0120 |
| 180d | XGBoost | 0.8218 | 0.6311 | 0.1244 | 0.5050 | 0.5425 | 0.5588 | 0.2203 | 0.2167 | 0.8095 | 0.0084 |
| 90d | Gradient boosting (HistGB) | 0.8083 | 0.4821 | 0.0717 | 0.5750 | 0.2875 | 0.4794 | 0.3464 | 0.1004 | 0.8016 | 0.0117 |
| 90d | Random forest | 0.7820 | 0.3765 | 0.0798 | 0.5750 | 0.2875 | 0.4132 | 0.2072 | 0.1004 | 0.8008 | 0.0157 |
| 90d | Regressão logística | 0.8046 | 0.4500 | 0.0739 | 0.5875 | 0.2938 | 0.4474 | 0.3223 | 0.1004 | 0.8227 | 0.0099 |
| 90d | XGBoost | 0.8026 | 0.4889 | 0.0717 | 0.5500 | 0.2750 | 0.4870 | 0.4545 | 0.1004 | 0.8049 | 0.0115 |

## Modelo selecionado

* **90d**: Regressão logística — AUC-ROC 0.8046 no teste temporal (regra: maior AUC; a regressão logística vence se ficar a menos de 0,01 do melhor). Explicabilidade: coeficientes da regressão logística (equivalente ao LinearExplainer) (escala: log-odds).
* **180d**: Regressão logística — AUC-ROC 0.8237 no teste temporal (regra: maior AUC; a regressão logística vence se ficar a menos de 0,01 do melhor). Explicabilidade: coeficientes da regressão logística (equivalente ao LinearExplainer) (escala: log-odds).

O modelo publicado de cada horizonte é re-treinado com os mesmos hiperparâmetros em treino + teste (todas as admissões com janela completa) 
antes de escorar os ativos; as métricas acima referem-se ao ajuste apenas no treino, avaliado no teste temporal.

## Fatores mais importantes (média |contribuição|)

### 90d

| posicao | rotulo | importancia | direcao |
|---|---|---|---|
| 1 | Indicador de turnover da loja (proxy sintético) | 0.5338 | aumenta |
| 2 | Avaliação de experiência (30 dias) | 0.4446 | reduz |
| 3 | Integração concluída até o dia 30 | 0.4172 | reduz |
| 4 | Distância casa-trabalho | 0.3312 | aumenta |
| 5 | Canal de contratação | 0.3173 | misto |
| 6 | Tipo de contrato | 0.3034 | misto |
| 7 | Faltas (30 dias) | 0.2738 | aumenta |
| 8 | Experiência prévia em varejo | 0.2466 | reduz |
| 9 | Cargo | 0.2396 | misto |
| 10 | Faixa salarial | 0.1976 | misto |
| 11 | Turno | 0.1676 | misto |
| 12 | Horas extras médias por semana | 0.1672 | aumenta |
| 13 | Avaliação de experiência não realizada | 0.1358 | aumenta |
| 14 | Mês de admissão | 0.1195 | misto |
| 15 | Atrasos (30 dias) | 0.1175 | aumenta |

### 180d

| posicao | rotulo | importancia | direcao |
|---|---|---|---|
| 1 | Indicador de turnover da loja (proxy sintético) | 0.5662 | aumenta |
| 2 | Integração concluída até o dia 30 | 0.4652 | reduz |
| 3 | Avaliação de experiência (30 dias) | 0.4384 | reduz |
| 4 | Cargo | 0.3300 | misto |
| 5 | Canal de contratação | 0.3180 | misto |
| 6 | Distância casa-trabalho | 0.3110 | aumenta |
| 7 | Faltas (30 dias) | 0.3044 | aumenta |
| 8 | Experiência prévia em varejo | 0.2427 | reduz |
| 9 | Horas extras médias por semana | 0.1898 | aumenta |
| 10 | Turno | 0.1897 | misto |
| 11 | Faixa salarial | 0.1853 | misto |
| 12 | Tipo de contrato | 0.1240 | misto |
| 13 | Avaliação de experiência não realizada | 0.1202 | aumenta |
| 14 | Atrasos (30 dias) | 0.1012 | aumenta |
| 15 | Tipo de loja | 0.0977 | misto |

## Calibração por decil (modelo selecionado, teste temporal)

### 90d

| decil | n | risco_medio_previsto | taxa_real | limite_inf | limite_sup |
|---|---|---|---|---|---|
| 1.0 | 80.0 | 0.0037 | 0.0000 | 0.0003 | 0.0076 |
| 2.0 | 80.0 | 0.0121 | 0.0250 | 0.0077 | 0.0158 |
| 3.0 | 79.0 | 0.0203 | 0.0380 | 0.0159 | 0.0263 |
| 4.0 | 80.0 | 0.0341 | 0.0375 | 0.0263 | 0.0427 |
| 5.0 | 80.0 | 0.0538 | 0.0250 | 0.0438 | 0.0658 |
| 6.0 | 79.0 | 0.0815 | 0.0886 | 0.0659 | 0.0934 |
| 7.0 | 80.0 | 0.1072 | 0.1125 | 0.0937 | 0.1245 |
| 8.0 | 79.0 | 0.1567 | 0.0886 | 0.1253 | 0.1942 |
| 9.0 | 80.0 | 0.2449 | 0.1625 | 0.1944 | 0.3061 |
| 10.0 | 80.0 | 0.4600 | 0.4250 | 0.3072 | 0.8224 |

### 180d

| decil | n | risco_medio_previsto | taxa_real | limite_inf | limite_sup |
|---|---|---|---|---|---|
| 1.0 | 47.0 | 0.0073 | 0.0000 | 0.0006 | 0.0135 |
| 2.0 | 47.0 | 0.0243 | 0.0426 | 0.0141 | 0.0351 |
| 3.0 | 46.0 | 0.0482 | 0.0870 | 0.0359 | 0.0597 |
| 4.0 | 47.0 | 0.0759 | 0.0851 | 0.0606 | 0.0953 |
| 5.0 | 46.0 | 0.1159 | 0.0652 | 0.0961 | 0.1384 |
| 6.0 | 47.0 | 0.1690 | 0.2128 | 0.1390 | 0.2026 |
| 7.0 | 46.0 | 0.2363 | 0.2826 | 0.2029 | 0.2660 |
| 8.0 | 47.0 | 0.3142 | 0.2340 | 0.2661 | 0.3689 |
| 9.0 | 46.0 | 0.4620 | 0.4783 | 0.3820 | 0.5450 |
| 10.0 | 47.0 | 0.6899 | 0.6809 | 0.5461 | 0.9557 |

## Calibração por nível (modelo selecionado, teste temporal)

Os extremos ficam calibrados. Em 90 dias, as faixas Médio e Alto ficam superestimadas no teste, que não tem admissões de pico; 
os limiares de nível são faixas de priorização e não devem ser lidos como probabilidades exatas.

### 90d

| nivel | n | risco_medio_previsto | taxa_real |
|---|---|---|---|
| Baixo | 593 | 0.0501 | 0.0506 |
| Medio | 119 | 0.2158 | 0.1345 |
| Alto | 49 | 0.3568 | 0.2653 |
| Critico | 36 | 0.5788 | 0.5833 |

### 180d

| nivel | n | risco_medio_previsto | taxa_real |
|---|---|---|---|
| Baixo | 244 | 0.0581 | 0.0574 |
| Medio | 100 | 0.2234 | 0.2600 |
| Alto | 49 | 0.3672 | 0.3061 |
| Critico | 73 | 0.6213 | 0.6301 |

## Validação retroativa com picos (treino até 2024, teste nas admissões de 2025)

O teste temporal oficial não contém admissões de pico. Esta validação usa a regressão logística e mede o regime de pico; 
não altera os modelos publicados.

| horizonte | recorte | n | taxa_real | risco_medio_previsto | auc_roc |
|---|---|---|---|---|---|
| 90d | Geral | 1757 | 0.1685 | 0.1593 | 0.8342 |
| 90d | Admissões de pico | 926 | 0.2214 | 0.1979 | 0.8191 |
| 90d | Admissões fora do pico | 831 | 0.1095 | 0.1162 | 0.8266 |
| 90d | Temporários sazonais | 529 | 0.2836 | 0.2421 | 0.8002 |
| 180d | Geral | 1757 | 0.2669 | 0.2502 | 0.8242 |
| 180d | Admissões de pico | 926 | 0.3186 | 0.2956 | 0.8099 |
| 180d | Admissões fora do pico | 831 | 0.2094 | 0.1997 | 0.8284 |
| 180d | Temporários sazonais | 529 | 0.3497 | 0.3299 | 0.8063 |

## Distribuição dos níveis de risco (população escorada)

O nível usa o risco vigente: risco de 90 dias até o dia 90; depois dele, risco residual até o dia 180, condicional a ter chegado ao dia 90. 
260 dos 701 escorados já passaram do dia 90.

| nivel | n | pct |
|---|---|---|
| Baixo | 498 | 71.0 |
| Medio | 111 | 15.8 |
| Alto | 58 | 8.3 |
| Critico | 34 | 4.9 |

## Auditoria de viés

Métricas por grupo calculadas com previsões fora da amostra (validação cruzada 5 folds) sobre treino + teste, 
porque o teste temporal de 180 dias é pequeno para estimar AUC por subgrupo (grupos com menos de 30 pessoas ou sem 
os dois rótulos ficam sem AUC). `faixa_etaria` **não** é usada como preditor. `taxa_alto_risco` = proporção com risco >= 0,30.

### 90d

| grupo_tipo | grupo_valor | n | taxa_real | risco_medio_previsto | auc | taxa_alto_risco |
|---|---|---|---|---|---|---|
| faixa_etaria | 18-24 | 2326 | 0.1879 | 0.1714 | 0.8132 | 0.1874 |
| faixa_etaria | 25-34 | 1825 | 0.1425 | 0.1492 | 0.8170 | 0.1693 |
| faixa_etaria | 35-44 | 1019 | 0.1217 | 0.1380 | 0.8732 | 0.1501 |
| faixa_etaria | 45-54 | 482 | 0.1452 | 0.1483 | 0.8130 | 0.1722 |
| faixa_etaria | 55+ | 211 | 0.0806 | 0.1295 | 0.7953 | 0.1469 |
| regiao | Sudeste | 2838 | 0.1579 | 0.1583 | 0.8313 | 0.1734 |
| regiao | Sul | 781 | 0.1741 | 0.1732 | 0.8156 | 0.2049 |
| regiao | Nordeste | 1229 | 0.1253 | 0.1273 | 0.8276 | 0.1408 |
| regiao | Norte | 419 | 0.1575 | 0.1570 | 0.8278 | 0.1599 |
| regiao | Centro-Oeste | 596 | 0.1745 | 0.1741 | 0.7936 | 0.2013 |
| escolaridade | Fundamental | 382 | 0.1283 | 0.1312 | 0.7933 | 0.1309 |
| escolaridade | Medio | 2843 | 0.1643 | 0.1651 | 0.8063 | 0.1942 |
| escolaridade | Superior Incompleto | 1979 | 0.1491 | 0.1488 | 0.8393 | 0.1501 |
| escolaridade | Superior Completo | 659 | 0.1472 | 0.1466 | 0.8768 | 0.1715 |

### 180d

| grupo_tipo | grupo_valor | n | taxa_real | risco_medio_previsto | auc | taxa_alto_risco |
|---|---|---|---|---|---|---|
| faixa_etaria | 18-24 | 2196 | 0.3119 | 0.2878 | 0.8168 | 0.3889 |
| faixa_etaria | 25-34 | 1734 | 0.2347 | 0.2427 | 0.8010 | 0.3155 |
| faixa_etaria | 35-44 | 951 | 0.1956 | 0.2285 | 0.8439 | 0.2934 |
| faixa_etaria | 45-54 | 455 | 0.2440 | 0.2403 | 0.8119 | 0.3121 |
| faixa_etaria | 55+ | 196 | 0.1531 | 0.2104 | 0.7755 | 0.2347 |
| regiao | Sudeste | 2683 | 0.2538 | 0.2540 | 0.8142 | 0.3336 |
| regiao | Sul | 738 | 0.2859 | 0.2853 | 0.8125 | 0.4024 |
| regiao | Nordeste | 1161 | 0.2171 | 0.2170 | 0.8275 | 0.2601 |
| regiao | Norte | 393 | 0.2850 | 0.2860 | 0.8150 | 0.3715 |
| regiao | Centro-Oeste | 557 | 0.2926 | 0.2952 | 0.8061 | 0.4093 |
| escolaridade | Fundamental | 362 | 0.2127 | 0.2154 | 0.8153 | 0.2514 |
| escolaridade | Medio | 2683 | 0.2657 | 0.2657 | 0.8020 | 0.3500 |
| escolaridade | Superior Incompleto | 1861 | 0.2606 | 0.2605 | 0.8203 | 0.3444 |
| escolaridade | Superior Completo | 626 | 0.2300 | 0.2317 | 0.8658 | 0.3147 |

### Conclusão da auditoria

* 90d, faixa 55+: previsto 13.0% contra real 8.1% (+4.9 p.p.); alto risco em 14.7% do grupo.
* 90d, faixa 18-24: previsto 17.1% contra real 18.8% (-1.7 p.p.); alto risco em 18.7% do grupo.
* 180d, faixa 55+: previsto 21.0% contra real 15.3% (+5.7 p.p.); alto risco em 23.5% do grupo.
* 180d, faixa 18-24: previsto 28.8% contra real 31.2% (-2.4 p.p.); alto risco em 38.9% do grupo.
* Leitura: a faixa 55+ recebe risco acima do observado, com excesso de alertas, e a faixa 18-24 recebe risco abaixo do observado, com casos perdidos.
* `tipo_contrato` (Jovem Aprendiz) e `canal_contratacao` (Programa Jovem) estão ligados à idade e funcionam como proxies, embora a faixa etária não entre no modelo.
* Ação: revisar com Gente & Gestão antes de qualquer uso e avaliar recalibração por grupo na Sprint 2.

## Validação do card do simulador

Risco recalculado em Python puro a partir do JSON do card para 30 colaboradores (incluindo avaliação ausente) e comparado 
com `predict_proba` da regressão logística nos dois horizontes: diferença máxima 2.78e-16 (< 1e-6).

## Limitações

* Dados sintéticos: as relações foram geradas por um mecanismo plausível, mas não medem a realidade da Ri Happy.
* Risco competitivo: saídas involuntárias e fim de contrato antes do horizonte são tratados como rótulo 0.
* O score é calculado uma única vez, no dia 30; sinais posteriores não são incorporados (rescoring é evolução prevista).
* O teste temporal de 180 dias cobre poucos meses de 2026 (até 4 de maio); as métricas desse horizonte têm maior incerteza.
* O teste temporal não contém admissões de pico, embora o treino tenha mais da metade delas; a validação retroativa acima cobre esse regime.
* `turnover_loja_12m` é um proxy sintético (base latente da loja + ruído individual), não o turnover realizado da loja.
* A base começa vazia em 2023-01-01; o headcount cresce ao longo da série e infla a taxa mensal de turnover dos primeiros meses.
* Ativos que já passaram do dia 90 estão no treino do modelo de 90 dias com rótulo 0; por isso o nível deles usa o risco residual até o dia 180.
* A loja entra apenas por atributos agregados (bandeira, tipo, região, porte, turnover); efeitos específicos de loja não são capturados.
* Correlação não é causa: os fatores apoiam conversas de retenção e nunca decisões punitivas (ver docs/etica-lgpd.md).
