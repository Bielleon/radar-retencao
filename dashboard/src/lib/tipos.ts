/**
 * Tipos do contrato de dados (seção 6 da especificação).
 * Cada interface reflete exatamente as colunas da view/tabela Supabase
 * correspondente (migrações 0001 e 0002). Os arquivos da cópia JSON
 * (public/demo/<chave>.json) usam as mesmas colunas.
 */

export type Nivel = 'Baixo' | 'Medio' | 'Alto' | 'Critico';
export type Horizonte = '90d' | '180d';
export type Direcao = 'aumenta' | 'reduz' | 'misto';

/** rr_vw_kpis (uma linha) */
export interface Kpis {
  data_referencia: string;
  headcount_ativo: number;
  novos_sem_checkpoint: number;
  ativos_ate_180d: number;
  ativos_em_janela: number;
  n_alto_risco: number;
  n_critico: number;
  pct_alto_risco: number | null;
  risco_medio_90d: number | null;
  risco_medio_180d: number | null;
  taxa_saida_vol_90d: number | null;
  taxa_saida_vol_180d: number | null;
  deslig_vol_12m: number;
  deslig_vol_precoces_12m: number;
  deslig_invol_12m: number;
  custo_por_desligamento: number;
  custo_estimado_12m: number;
}

/** rr_turnover_mensal */
export interface TurnoverMensal {
  mes: string;
  admissoes: number;
  desligamentos_voluntarios: number;
  desligamentos_involuntarios: number;
  desligamentos_vol_precoces: number;
  headcount_medio: number;
  taxa_turnover_vol: number | null;
  taxa_turnover_total: number | null;
  periodo_pico: boolean;
  campanha: string | null;
}

/** rr_curva_sobrevivencia */
export interface CurvaSobrevivencia {
  segmento_tipo: string;
  segmento_valor: string;
  dia: number;
  prob_permanencia: number;
  n_risco: number | null;
}

/** rr_vw_motivos_saida */
export interface MotivoSaida {
  motivo: string;
  n: number;
  n_ate_90d: number;
  n_ate_180d: number;
}

/** rr_vw_risco_loja */
export interface RiscoLoja {
  loja_id: string;
  bandeira: string;
  tipo_loja: string;
  regiao: string;
  uf: string;
  cidade: string;
  porte: string;
  turnover_vol_12m: number | null;
  headcount_ativo: number;
  ativos_em_janela: number;
  risco_medio_90d: number | null;
  risco_medio_180d: number | null;
  n_alto_risco: number;
  pct_alto_risco: number | null;
}

/** rr_vw_risco_segmento */
export interface RiscoSegmento {
  dimensao: string;
  categoria: string;
  n: number;
  risco_medio_90d: number | null;
  risco_medio_180d: number | null;
  n_alto_risco: number;
  pct_alto_risco: number | null;
}

/** Item de rr_predicoes.fatores_top (jsonb) */
export interface FatorTop {
  fator: string;
  rotulo: string;
  valor: string | number | boolean | null;
  contribuicao: number;
  direcao: Direcao;
}

/** rr_vw_colaboradores_risco */
export interface ColaboradorRisco {
  colaborador_id: string;
  loja_id: string;
  bandeira: string;
  regiao: string;
  uf: string;
  cidade: string;
  tipo_loja: string;
  cargo: string;
  tipo_contrato: string;
  faixa_salarial: string;
  turno: string | null;
  canal_contratacao: string | null;
  data_admissao: string;
  dias_de_casa: number;
  risco_90d: number;
  risco_180d: number;
  nivel_risco: Nivel;
  fatores_top: FatorTop[];
  acao_recomendada: string | null;
  onboarding_concluido: boolean | null;
  avaliacao_experiencia_30d: number | null;
  distancia_casa_trabalho_km: number | null;
  faltas_30d: number | null;
  atrasos_30d: number | null;
  horas_treinamento_30d: number | null;
  admitido_periodo_pico: boolean | null;
  gestor_tempo_cargo_meses: number | null;
  turnover_loja_12m: number | null;
}

/** rr_fatores_globais */
export interface FatorGlobal {
  horizonte: Horizonte;
  fator: string;
  rotulo: string;
  importancia: number;
  direcao: Direcao | null;
  posicao: number | null;
}

/** rr_efeito_fator */
export interface EfeitoFator {
  horizonte: Horizonte;
  fator: string;
  rotulo_fator: string | null;
  categoria: string;
  ordem: number | null;
  n: number;
  taxa_real: number | null;
  risco_medio: number | null;
}

/** rr_metricas_modelo */
export interface MetricaModelo {
  horizonte: Horizonte;
  modelo: string;
  metrica: string;
  valor: number;
  selecionado: boolean;
}

/** rr_avaliacao_vies */
export interface AvaliacaoVies {
  horizonte: Horizonte;
  grupo_tipo: string;
  grupo_valor: string;
  n: number;
  taxa_real: number | null;
  risco_medio_previsto: number | null;
  auc: number | null;
  taxa_alto_risco: number | null;
}

/** rr_parametros_custo */
export interface ParametroCusto {
  chave: string;
  rotulo: string;
  valor: number;
  descricao: string | null;
  fonte: string | null;
}

/** rr_recomendacoes */
export interface Recomendacao {
  id: number;
  fator: string;
  rotulo_fator: string | null;
  nivel_minimo: Nivel | null;
  acao: string;
  responsavel: string | null;
  prazo_dias: number | null;
}

// ---------------------------------------------------------------------
// rr_modelos.card (model card + coeficientes do simulador)
// ---------------------------------------------------------------------

export type TipoInput = 'num' | 'cat' | 'bool';

export interface InputCard {
  feature: string;
  rotulo: string;
  tipo: TipoInput;
  /** Opções de uma variável categórica (valores sem acento, como no banco). */
  opcoes?: string[];
  min?: number;
  max?: number;
  passo?: number;
  padrao?: number | string | boolean | null;
  /** Quando true, a variável pode ser marcada como "não informada" (valor nulo). */
  permite_nulo?: boolean;
  descricao?: string;
}

/** Termo numérico (variáveis num e bool, padronizadas): coef · (x − média) / desvio */
export interface TermoNumerico {
  feature: string;
  tipo: 'num' | 'bool';
  media: number;
  desvio: number;
  coef: number;
  /** Contribuição média do termo na amostra de fundo; subtraída só na exibição dos fatores. */
  referencia?: number;
}

/** Termo categórico: coefs[categoria] (categoria ausente = referência = 0) */
export interface TermoCategorico {
  feature: string;
  tipo: 'cat';
  coefs: Record<string, number>;
  /** Contribuição média do termo na amostra de fundo; subtraída só na exibição dos fatores. */
  referencia?: number;
}

export type Termo = TermoNumerico | TermoCategorico;

export interface SimuladorHorizonte {
  intercepto: number;
  termos: Termo[];
}

export interface LimiaresNivel {
  Medio: number;
  Alto: number;
  Critico: number;
}

export interface ModelCard {
  versao: string;
  data_referencia?: string;
  modelo_selecionado: Partial<Record<Horizonte, string>>;
  simulador_e_modelo_oficial: Partial<Record<Horizonte, boolean>>;
  limiares_nivel?: Partial<LimiaresNivel>;
  inputs: InputCard[];
  simulador: Partial<Record<Horizonte, SimuladorHorizonte>>;
  /** Campos adicionais do model card (métricas, observações etc.). */
  [extra: string]: unknown;
}

/** rr_modelos */
export interface Modelo {
  versao: string;
  treinado_em: string;
  descricao: string | null;
  card: ModelCard;
}

// ---------------------------------------------------------------------
// Mapa chave lógica -> tipo de linha (seção 6)
// ---------------------------------------------------------------------

export interface Conjuntos {
  kpis: Kpis;
  turnover_mensal: TurnoverMensal;
  curva_sobrevivencia: CurvaSobrevivencia;
  motivos_saida: MotivoSaida;
  risco_loja: RiscoLoja;
  risco_segmento: RiscoSegmento;
  colaboradores_risco: ColaboradorRisco;
  fatores_globais: FatorGlobal;
  efeito_fator: EfeitoFator;
  metricas_modelo: MetricaModelo;
  avaliacao_vies: AvaliacaoVies;
  parametros_custo: ParametroCusto;
  recomendacoes: Recomendacao;
  modelos: Modelo;
}

export type Chave = keyof Conjuntos;
