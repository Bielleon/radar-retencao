/**
 * Rótulos em português do Brasil (com acentos) para os valores que chegam do
 * banco/JSON sem acento ("Critico", "Medio", "Temporario Sazonal" etc.).
 * Toda a interface deve passar os valores por rotulo() antes de exibi-los.
 */

const ROTULOS: Record<string, string> = {
  // Níveis de risco
  Baixo: 'Baixo',
  Medio: 'Médio',
  Alto: 'Alto',
  Critico: 'Crítico',

  // Tipo de contrato
  'CLT Efetivo': 'CLT Efetivo',
  'Temporario Sazonal': 'Temporário Sazonal',
  'Jovem Aprendiz': 'Jovem Aprendiz',
  Intermitente: 'Intermitente',

  // Cargos
  Vendedor: 'Vendedor',
  'Operador de Caixa': 'Operador de Caixa',
  Estoquista: 'Estoquista',
  'Lider de Loja': 'Líder de Loja',
  'Gerente de Loja': 'Gerente de Loja',

  // Bandeiras e tipo de loja
  'Ri Happy': 'Ri Happy',
  PBKids: 'PBKids',
  Divertudo: 'Divertudo',
  Newtoys: 'Newtoys',
  Shopping: 'Shopping',
  Rua: 'Rua',
  Outlet: 'Outlet',

  // Regiões e porte
  Sudeste: 'Sudeste',
  Sul: 'Sul',
  Nordeste: 'Nordeste',
  Norte: 'Norte',
  'Centro-Oeste': 'Centro-Oeste',
  Pequena: 'Pequena',
  Media: 'Média',
  Grande: 'Grande',

  // Faixa salarial
  'Ate 1.5 SM': 'Até 1,5 SM',
  '1.5 a 2 SM': '1,5 a 2 SM',
  '2 a 3 SM': '2 a 3 SM',
  '3 a 5 SM': '3 a 5 SM',
  'Acima de 5 SM': 'Acima de 5 SM',

  // Escolaridade
  Fundamental: 'Fundamental',
  'Superior Incompleto': 'Superior incompleto',
  'Superior Completo': 'Superior completo',

  // Turno
  Manha: 'Manhã',
  Tarde: 'Tarde',
  Noite: 'Noite',
  Integral: 'Integral',

  // Canal de contratação
  Indicacao: 'Indicação',
  'Site/Portal': 'Site/Portal',
  Agencia: 'Agência',
  'Programa Jovem': 'Programa Jovem',
  Recontratacao: 'Recontratação',

  // Tipo de desligamento e status
  Voluntario: 'Voluntário',
  Involuntario: 'Involuntário',
  Ativo: 'Ativo',
  Desligado: 'Desligado',

  // Campanhas / picos
  'Dia das Criancas': 'Dia das Crianças',
  Natal: 'Natal',
  'Volta as Aulas': 'Volta às Aulas',
  'Black Friday': 'Black Friday',

  // Direção dos fatores
  aumenta: 'aumenta o risco',
  reduz: 'reduz o risco',
  misto: 'efeito misto',

  // Horizontes
  '90d': '90 dias',
  '180d': '180 dias',

  // Modelos
  regressao_logistica: 'Regressão logística',
  random_forest: 'Random forest',
  gradient_boosting: 'Gradient boosting',
  hist_gradient_boosting: 'Gradient boosting',
  xgboost: 'XGBoost',

  // Tipos de segmento / grupo / dimensão
  geral: 'Geral',
  faixa_etaria: 'Faixa etária',
  escolaridade: 'Escolaridade',
  regiao: 'Região',
  cargo: 'Cargo',
  tipo_contrato: 'Tipo de contrato',
  bandeira: 'Bandeira',
  faixa_salarial: 'Faixa salarial',
  turno: 'Turno',
  canal_contratacao: 'Canal de contratação',
  tipo_loja: 'Tipo de loja',
  porte: 'Porte da loja',
  admitido_periodo_pico: 'Admitido em período de pico',

  // Valores genéricos
  Sim: 'Sim',
  Nao: 'Não',
  'Nao avaliado': 'Não avaliado',
  'Nao avaliada': 'Não avaliada',
  'Nao informado': 'Não informado',
  Outros: 'Outros',
  Outro: 'Outro',

  // Motivos declarados de saída (valores usuais do pipeline)
  'Outra oportunidade': 'Outra oportunidade de trabalho',
  'Outra oportunidade de trabalho': 'Outra oportunidade de trabalho',
  'Distancia e transporte': 'Distância e transporte',
  'Distancia/transporte': 'Distância/transporte',
  Distancia: 'Distância',
  'Salario e beneficios': 'Salário e benefícios',
  'Salario/beneficios': 'Salário/benefícios',
  Salario: 'Salário',
  'Horario e escala': 'Horário e escala',
  'Horario/escala': 'Horário/escala',
  Horario: 'Horário',
  'Relacao com a lideranca': 'Relação com a liderança',
  'Lideranca/clima': 'Liderança/clima',
  Lideranca: 'Liderança',
  Estudos: 'Estudos',
  'Motivos pessoais e familiares': 'Motivos pessoais e familiares',
  'Motivos pessoais': 'Motivos pessoais',
  'Questoes familiares': 'Questões familiares',
  Saude: 'Saúde',
  'Nao se adaptou a funcao': 'Não se adaptou à função',
  'Nao adaptacao': 'Não adaptação',
  'Nao adaptacao a funcao': 'Não adaptação à função',
  'Mudanca de cidade': 'Mudança de cidade',
  Mudanca: 'Mudança',
  'Nao declarado': 'Não declarado',
  'Fim de contrato': 'Fim de contrato',
  'Falta de adaptacao': 'Falta de adaptação',
  'Relacao com lideranca': 'Relação com liderança',
  'Saude/familia': 'Saúde/família',
  'Distancia/deslocamento': 'Distância/deslocamento',

  // Cidades (os dados são ASCII sem acento)
  Anapolis: 'Anápolis',
  Brasilia: 'Brasília',
  Cuiaba: 'Cuiabá',
  Goiania: 'Goiânia',
  'Jaboatao dos Guararapes': 'Jaboatão dos Guararapes',
  'Joao Pessoa': 'João Pessoa',
  Macapa: 'Macapá',
  Maceio: 'Maceió',
  Niteroi: 'Niterói',
  'Nova Iguacu': 'Nova Iguaçu',
  'Ribeirao Preto': 'Ribeirão Preto',
  'Santo Andre': 'Santo André',
  'Sao Jose dos Campos': 'São José dos Campos',
  'Sao Paulo': 'São Paulo',
  Vitoria: 'Vitória',
};

/** Rótulos legíveis para os nomes técnicos das variáveis preditoras (fatores). */
const ROTULOS_FATOR: Record<string, string> = {
  cargo: 'Cargo',
  tipo_contrato: 'Tipo de contrato',
  faixa_salarial: 'Faixa salarial',
  escolaridade: 'Escolaridade',
  turno: 'Turno',
  carga_horaria_semanal: 'Carga horária semanal',
  canal_contratacao: 'Canal de contratação',
  experiencia_previa_varejo: 'Experiência prévia em varejo',
  distancia_casa_trabalho_km: 'Distância casa-trabalho (km)',
  admitido_periodo_pico: 'Admitido em período de pico',
  mes_admissao: 'Mês de admissão',
  bandeira: 'Bandeira',
  tipo_loja: 'Tipo de loja',
  regiao: 'Região',
  porte: 'Porte da loja',
  onboarding_concluido: 'Integração concluída até o dia 30',
  horas_treinamento_30d: 'Horas de treinamento (30 dias)',
  avaliacao_experiencia_30d: 'Avaliação de experiência (30 dias)',
  avaliacao_experiencia_30d_ausente: 'Avaliação de experiência não realizada',
  faltas_30d: 'Faltas (30 dias)',
  atrasos_30d: 'Atrasos (30 dias)',
  horas_extras_media_semana: 'Horas extras médias por semana',
  gestor_tempo_cargo_meses: 'Tempo do gestor no cargo (meses)',
  turnover_loja_12m: 'Indicador de turnover da loja (proxy sintético)',
  faixa_etaria: 'Faixa etária',
  nivel: 'Nível de risco',
  nivel_risco: 'Nível de risco',
};

/** Rótulo e explicação curta de cada métrica de avaliação dos modelos. */
export interface InfoMetrica {
  rotulo: string;
  explicacao: string;
  /** true quando valores maiores são melhores */
  maiorMelhor: boolean;
}

export const METRICAS: Record<string, InfoMetrica> = {
  auc_roc: {
    rotulo: 'AUC-ROC',
    explicacao:
      'Probabilidade de o modelo atribuir risco maior a quem saiu do que a quem ficou (0,5 = acaso; 1,0 = perfeito). É o critério de seleção.',
    maiorMelhor: true,
  },
  auc_pr: {
    rotulo: 'AUC-PR',
    explicacao: 'Área sob a curva precisão × recall; mais informativa quando a saída é o evento raro.',
    maiorMelhor: true,
  },
  brier: {
    rotulo: 'Brier',
    explicacao: 'Erro quadrático médio das probabilidades previstas; quanto menor, melhor calibrado o modelo.',
    maiorMelhor: false,
  },
  recall_top20: {
    rotulo: 'Recall no top 20%',
    explicacao: 'Parcela de todas as saídas voluntárias capturada ao priorizar os 20% de maior risco.',
    maiorMelhor: true,
  },
  precisao_top20: {
    rotulo: 'Precisão no top 20%',
    explicacao: 'Parcela dos 20% de maior risco que de fato saiu voluntariamente no horizonte.',
    maiorMelhor: true,
  },
  f1: { rotulo: 'F1', explicacao: 'Média harmônica entre precisão e recall no limiar que maximiza o F1 em cada modelo.', maiorMelhor: true },
  acuracia: {
    rotulo: 'Acurácia',
    explicacao: 'Proporção de acertos no ponto de corte padrão (pouco informativa com classes desbalanceadas).',
    maiorMelhor: true,
  },
  log_loss: { rotulo: 'Log-loss', explicacao: 'Penaliza probabilidades confiantes e erradas; quanto menor, melhor.', maiorMelhor: false },
  ks: { rotulo: 'KS', explicacao: 'Máxima separação entre as distribuições de risco de quem saiu e de quem ficou.', maiorMelhor: true },
  auc_cv_media: { rotulo: 'AUC-ROC (VC)', explicacao: 'AUC-ROC média nos 5 folds estratificados da validação cruzada no treino.', maiorMelhor: true },
  auc_cv_desvio: { rotulo: 'Desvio AUC (VC)', explicacao: 'Desvio-padrão da AUC-ROC entre os folds; quanto menor, mais estável.', maiorMelhor: false },
  ece: { rotulo: 'Calibração (ECE)', explicacao: 'Diferença média entre risco previsto e taxa observada por decil; quanto menor, melhor.', maiorMelhor: false },
};

/** Ordem preferencial de exibição das métricas. */
export const ORDEM_METRICAS = [
  'auc_roc',
  'auc_pr',
  'brier',
  'recall_top20',
  'precisao_top20',
  'f1',
  'ks',
  'ece',
  'log_loss',
  'acuracia',
  'auc_cv_media',
  'auc_cv_desvio',
];

/** Exportadas pelo pipeline, mas sem "melhor valor": não entram na comparação entre modelos. */
export const METRICAS_FORA_DA_TABELA = ['limiar_f1', 'taxa_base'];

/** Dimensões disponíveis na view rr_vw_risco_segmento. */
export const DIMENSOES_SEGMENTO: { valor: string; rotulo: string }[] = [
  { valor: 'cargo', rotulo: 'Cargo' },
  { valor: 'regiao', rotulo: 'Região' },
  { valor: 'tipo_contrato', rotulo: 'Tipo de contrato' },
  { valor: 'bandeira', rotulo: 'Bandeira' },
  { valor: 'faixa_salarial', rotulo: 'Faixa salarial' },
  { valor: 'turno', rotulo: 'Turno' },
  { valor: 'canal_contratacao', rotulo: 'Canal de contratação' },
];

export const NOMES_MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Converte um valor do banco em rótulo acentuado. Booleanos viram "Sim"/"Não";
 * nulos viram o texto padrão; strings desconhecidas são devolvidas como estão.
 */
export function rotulo(valor: unknown, padrao = '—'): string {
  if (valor === null || valor === undefined || valor === '') return padrao;
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (typeof valor === 'number') return String(valor);
  const texto = String(valor);
  return ROTULOS[texto] ?? ROTULOS_FATOR[texto] ?? texto;
}

/** Rótulo legível de um nome técnico de variável (fator). */
export function rotuloFator(fator: string | null | undefined, padrao = '—'): string {
  if (!fator) return padrao;
  const direto = ROTULOS_FATOR[fator];
  if (direto) return direto;
  if (fator.endsWith('_ausente')) {
    const base = fator.slice(0, -'_ausente'.length);
    return `${ROTULOS_FATOR[base] ?? base} (não informado)`;
  }
  // Fallback: troca underscores por espaços e capitaliza a primeira letra.
  const texto = fator.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Rótulo de uma métrica (ou o próprio nome técnico quando desconhecida). */
export function rotuloMetrica(metrica: string): string {
  return METRICAS[metrica]?.rotulo ?? rotuloFator(metrica);
}

/** Rótulo de um modelo. */
export function rotuloModelo(modelo: string | null | undefined): string {
  return rotulo(modelo);
}

/** Rótulo de um horizonte (90d -> "90 dias"). */
export function rotuloHorizonte(horizonte: string): string {
  return rotulo(horizonte);
}
