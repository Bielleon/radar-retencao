/**
 * Motor do simulador (what-if), calculado no navegador a partir de rr_modelos.card
 * exatamente como na seção 6 da especificação:
 *
 *   logit = intercepto
 *         + Σ coef · (x − média) / desvio        (termos num/bool; bool como 0/1)
 *         + Σ coefs[categoria]                   (termos cat; categoria ausente = 0)
 *   risco = 1 / (1 + e^(−logit))
 *
 * Variáveis com valor nulo (ex.: avaliação não realizada) usam a média (contribuição
 * zero) e, quando existir, o termo indicador <feature>_ausente recebe 1.
 */
import { rotuloFator } from './rotulos';
import type { Horizonte, InputCard, ModelCard, Nivel, Recomendacao, SimuladorHorizonte, Termo } from './tipos';
import { NIVEIS, nivelPorRisco } from './niveis';

export type ValorInput = number | string | boolean | null;
export type Valores = Record<string, ValorInput>;

export interface Contribuicao {
  /** nome técnico do termo (pode ser <feature>_ausente) */
  feature: string;
  /** feature de entrada correspondente (sem o sufixo _ausente) */
  featureBase: string;
  rotulo: string;
  valor: ValorInput;
  /** contribuição em relação ao colaborador médio (mesma leitura de fatores_top); não entra no logit */
  contribuicao: number;
}

export interface ResultadoHorizonte {
  logit: number;
  risco: number;
  /** contribuições ordenadas por |contribuição| decrescente */
  contribuicoes: Contribuicao[];
}

const SUFIXO_AUSENTE = '_ausente';

export function featureBase(feature: string): string {
  return feature.endsWith(SUFIXO_AUSENTE) ? feature.slice(0, -SUFIXO_AUSENTE.length) : feature;
}

const CHAVE_MES = 'mes_admissao';
const CHAVE_PICO = 'admitido_periodo_pico';
const MESES_PICO = new Set(['9', '10', '11', '12']);

/** O pico é função do mês de admissão (set a dez): mantém os dois campos coerentes. */
export function sincronizarPico(valores: Valores): Valores {
  if (!(CHAVE_MES in valores) || !(CHAVE_PICO in valores)) return valores;
  return { ...valores, [CHAVE_PICO]: MESES_PICO.has(String(valores[CHAVE_MES])) };
}

export function campoDerivado(feature: string): boolean {
  return feature === CHAVE_PICO;
}

/** Valores iniciais do formulário a partir de card.inputs (padrão ou um valor neutro). */
export function valoresPadrao(card: ModelCard): Valores {
  const valores: Valores = {};
  for (const input of card.inputs) {
    if (input.padrao !== undefined) {
      valores[input.feature] = input.padrao;
      continue;
    }
    if (input.tipo === 'bool') valores[input.feature] = false;
    else if (input.tipo === 'cat') valores[input.feature] = input.opcoes?.[0] ?? '';
    else valores[input.feature] = input.min ?? 0;
  }
  return sincronizarPico(valores);
}

/** Lista de features que possuem termo indicador <feature>_ausente em algum horizonte. */
export function featuresComIndicadorAusente(card: ModelCard): Set<string> {
  const conjunto = new Set<string>();
  for (const h of Object.values(card.simulador)) {
    if (!h) continue;
    for (const termo of h.termos) {
      if (termo.feature.endsWith(SUFIXO_AUSENTE)) conjunto.add(featureBase(termo.feature));
    }
  }
  return conjunto;
}

/** Um input pode ser marcado como "não informado" quando permite nulo ou possui termo _ausente. */
export function permiteNulo(input: InputCard, comIndicador: Set<string>): boolean {
  return input.permite_nulo === true || input.padrao === null || comIndicador.has(input.feature);
}

function rotuloDeFeature(feature: string, inputs: InputCard[]): string {
  const base = featureBase(feature);
  const input = inputs.find((i) => i.feature === feature) ?? inputs.find((i) => i.feature === base);
  if (feature.endsWith(SUFIXO_AUSENTE)) return `${input?.rotulo ?? rotuloFator(base)} (não informado)`;
  return input?.rotulo ?? rotuloFator(feature);
}

function valorNumerico(valor: ValorInput | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function contribuicaoTermo(termo: Termo, valores: Valores): number {
  if (termo.tipo === 'cat') {
    const v = valores[termo.feature];
    if (typeof v !== 'string') return 0;
    const coef = termo.coefs[v];
    return typeof coef === 'number' && Number.isFinite(coef) ? coef : 0;
  }
  let x: number;
  if (termo.feature.endsWith(SUFIXO_AUSENTE)) {
    // Indicador de ausência: 1 quando a variável base não foi informada.
    const base = valores[featureBase(termo.feature)];
    x = base === null || base === undefined || base === '' ? 1 : 0;
  } else {
    const v = valorNumerico(valores[termo.feature]);
    x = v === null ? termo.media : v; // nulo -> média (contribuição zero)
  }
  const desvio = termo.desvio !== 0 && Number.isFinite(termo.desvio) ? termo.desvio : 1;
  return termo.coef * ((x - termo.media) / desvio);
}

/** Calcula o risco de um horizonte para os valores informados. */
export function calcularHorizonte(sim: SimuladorHorizonte, valores: Valores, inputs: InputCard[]): ResultadoHorizonte {
  let logit = sim.intercepto;
  const contribuicoes: Contribuicao[] = [];
  for (const termo of sim.termos) {
    const c = contribuicaoTermo(termo, valores);
    logit += c;
    const base = featureBase(termo.feature);
    contribuicoes.push({
      feature: termo.feature,
      featureBase: base,
      rotulo: rotuloDeFeature(termo.feature, inputs),
      valor: termo.feature.endsWith(SUFIXO_AUSENTE) ? (valores[base] ?? null) === null : (valores[termo.feature] ?? null),
      contribuicao: c - (termo.referencia ?? 0),
    });
  }
  contribuicoes.sort((a, b) => Math.abs(b.contribuicao) - Math.abs(a.contribuicao));
  const risco = 1 / (1 + Math.exp(-logit));
  return { logit, risco, contribuicoes };
}

export interface ResultadoSimulacao {
  por_horizonte: Partial<Record<Horizonte, ResultadoHorizonte>>;
  nivel: Nivel;
}

/** Calcula os dois horizontes e o nível (sobre o risco de 90 dias, limiares do card). */
export function simular(card: ModelCard, valores: Valores): ResultadoSimulacao {
  const por_horizonte: Partial<Record<Horizonte, ResultadoHorizonte>> = {};
  for (const h of ['90d', '180d'] as Horizonte[]) {
    const sim = card.simulador[h];
    if (sim) por_horizonte[h] = calcularHorizonte(sim, valores, card.inputs);
  }
  const base = por_horizonte['90d'] ?? por_horizonte['180d'];
  const nivel = nivelPorRisco(base ? base.risco : 0, card.limiares_nivel);
  return { por_horizonte, nivel };
}

function numeroDe(valor: ValorInput | undefined): number | null {
  return valorNumerico(valor);
}

/**
 * Gatilhos do playbook (seção 7 da especificação), iguais a PLAYBOOK em pipeline/rr_comum.py.
 * Ao alterar uma regra, altere as duas pontas.
 */
const GATILHOS: Record<string, (v: Valores) => boolean> = {
  onboarding_concluido: (v) => v.onboarding_concluido === false,
  avaliacao_experiencia_30d: (v) => {
    const n = numeroDe(v.avaliacao_experiencia_30d);
    return n !== null && n <= 2.5;
  },
  distancia_casa_trabalho_km: (v) => (numeroDe(v.distancia_casa_trabalho_km) ?? 0) >= 20,
  faltas_30d: (v) => (numeroDe(v.faltas_30d) ?? 0) >= 2 || (numeroDe(v.atrasos_30d) ?? 0) >= 3,
  tipo_contrato: (v) => v.tipo_contrato === 'Temporario Sazonal',
  faixa_salarial: (v) => v.faixa_salarial === 'Ate 1.5 SM',
  gestor_tempo_cargo_meses: (v) => {
    const n = numeroDe(v.gestor_tempo_cargo_meses);
    return n !== null && n < 6;
  },
  turnover_loja_12m: (v) => (numeroDe(v.turnover_loja_12m) ?? 0) >= 0.45,
  horas_extras_media_semana: (v) => (numeroDe(v.horas_extras_media_semana) ?? 0) >= 6,
  turno: (v) => v.turno === 'Noite',
  canal_contratacao: (v) => v.canal_contratacao === 'Agencia',
};

/** Fator da regra do playbook: faltas e atrasos compartilham a mesma regra. */
function fatorDaRegra(base: string): string {
  return base === 'atrasos_30d' ? 'faltas_30d' : base;
}

/**
 * Ações sugeridas: regra do nível + regras cujo fator está entre as 3 maiores contribuições,
 * aponta aumento de risco (contribuição positiva) e cujo gatilho é verdadeiro no cenário.
 */
export function acoesSugeridas(recomendacoes: Recomendacao[], nivel: Nivel, resultado: ResultadoHorizonte | undefined, valores: Valores): Recomendacao[] {
  const regrasNivel = recomendacoes.filter((r) => r.fator === 'nivel' && r.nivel_minimo === nivel);
  const principais = (resultado?.contribuicoes ?? []).slice(0, 3).filter((c) => c.contribuicao > 0);
  const fatores = principais.map((c) => fatorDaRegra(c.featureBase));
  const regrasFator = recomendacoes.filter((r) => r.fator !== 'nivel' && fatores.includes(r.fator) && (GATILHOS[r.fator]?.(valores) ?? false));
  // Mantém a ordem dos fatores principais (maior contribuição primeiro).
  regrasFator.sort((a, b) => fatores.indexOf(a.fator) - fatores.indexOf(b.fator));
  return [...regrasNivel, ...regrasFator];
}

/** Ordena recomendações por nível (Crítico primeiro) — útil no playbook. */
export function ordenarPorNivel(recomendacoes: Recomendacao[]): Recomendacao[] {
  return [...recomendacoes].sort((a, b) => NIVEIS.indexOf(b.nivel_minimo ?? 'Baixo') - NIVEIS.indexOf(a.nivel_minimo ?? 'Baixo'));
}
