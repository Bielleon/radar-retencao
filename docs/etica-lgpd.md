# Ética, privacidade e uso responsável dos dados

O Radar de Retenção trata dados de pessoas. Este documento registra os cuidados
adotados no MVP e os princípios que devem reger a operação com dados reais da Ri Happy.

## 1. Finalidade e limites de uso

* **Finalidade única:** apoiar ações preventivas de retenção e a melhoria do ambiente
  de trabalho nos primeiros meses de casa.
* **O que o score não é:** não é avaliação de desempenho, não é critério de
  desligamento, promoção, remuneração ou alocação de turno, e não deve ser mostrado ao
  colaborador como "nota". O dashboard exibe esse aviso em cada detalhe individual.
* **Decisão humana:** o modelo prioriza conversas; quem decide e age é o líder com o
  apoio de Gente & Gestão. Nenhuma ação automática é tomada a partir do score.

## 2. LGPD (Lei 13.709/2018)

| Princípio | Como o projeto atende |
|---|---|
| Finalidade e adequação | Uso restrito à retenção; proibição explícita de uso punitivo |
| Necessidade (minimização) | Apenas variáveis com relação plausível com a adaptação ao trabalho; nenhum dado de saúde, religião, orientação sexual, raça, gênero ou vida privada |
| Transparência | Fatores explicados em linguagem simples; metodologia, métricas e limitações publicadas |
| Segurança | No protótipo: IDs fictícios, credenciais fora do repositório e fora do site público, RLS nas tabelas `rr_*`. Requisitos da operação real: pseudonimização na origem e autenticação por perfil, com RLS por loja |
| Prevenção e não discriminação | Atributos protegidos fora do modelo; auditoria de viés publicada |
| Base legal (operação real) | Legítimo interesse do empregador em reter equipes, com teste de balanceamento e registro de operações (ROPA); alternativa: execução de contrato de trabalho para dados de integração |
| Direitos do titular | O colaborador pode solicitar explicação sobre o tratamento; o processo de retenção deve ser comunicado na integração |
| Retenção (requisito da operação real, não implementado no protótipo) | Scores recalculados e descartados após 180 dias de casa; histórico agregado apenas para monitoramento do modelo |

## 3. Dados sintéticos no MVP

Nenhum dado real da Ri Happy foi utilizado. A base `data/raw/` é gerada por
`pipeline/01_gerar_dados_sinteticos.py` com distribuições plausíveis para o varejo
brasileiro. Os identificadores (`C000123`) não correspondem a pessoas. Isso permite
publicar código, banco e dashboard sem risco a titulares. Ao migrar para dados reais,
a geração sintética é substituída por uma extração pseudonimizada do sistema de RH, e
os resultados devem ser recalibrados.

A base de RH da Ri Happy entra na Sprint 2 e será usada apenas
para fins acadêmicos, de forma pseudonimizada, sem versionamento em repositório nem
publicação no dashboard aberto, que só é aceitável enquanto os dados forem sintéticos.

## 4. Viés e discriminação

* `faixa_etaria` **não é variável preditora**; é usada apenas para auditar se o modelo
  atribui risco sistematicamente diferente por idade. Gênero, raça e outros atributos
  sensíveis não existem na base.
* A tabela `rr_avaliacao_vies` (página "Fatores e Modelo") compara, por grupo, a taxa
  real de saída, o risco médio previsto, a AUC e a proporção classificada como risco
  alto. Diferenças grandes entre taxa real e risco previsto indicam descalibração e
  exigem revisão antes do uso.
* **Resultado da auditoria:** a faixa 55+ fica superestimada (90 dias: 13,0% previsto contra
  8,1% real; 180 dias: 21,0% contra 15,3%), com excesso de alertas, e a faixa 18-24 fica
  subestimada (90 dias: 17,1% contra 18,8%; 180 dias: 28,8% contra 31,2%), com risco de casos
  perdidos. A ação é revisar com Gente & Gestão e avaliar recalibração por grupo na Sprint 2.
* `tipo_contrato` (Jovem Aprendiz) e `canal_contratacao` (Programa Jovem) estão ligados à idade
  e funcionam como *proxies* dela, embora a faixa etária não entre no modelo; ambos estão entre
  os seis fatores de maior peso em 90 dias.
* Variáveis que podem funcionar como *proxies* (ex.: distância casa-trabalho, faixa
  salarial, escolaridade) são mantidas porque têm ação de retenção associada
  (transferência de loja, política salarial, trilha de desenvolvimento), e não
  para "selecionar" pessoas. Esse uso deve ser revisado periodicamente com Gente & Gestão.

## 5. Governança sugerida para a operação real

1. Comitê de people analytics (RH, Jurídico/DPO, Operações) aprova finalidade e variáveis.
2. Recalibração do modelo a cada ciclo (trimestral) e monitoramento de deriva.
3. Revisão semestral da auditoria de viés com registro de decisões.
4. Treinamento dos líderes sobre como conduzir conversas de retenção a partir dos fatores.
5. Canal para o colaborador questionar o tratamento de seus dados.
