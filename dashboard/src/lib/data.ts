/**
 * Camada de dados do dashboard.
 *
 * carregar(chave) devolve as linhas de um conjunto lógico (seção 6 da especificação):
 *  - com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY definidas, lê a view/tabela no
 *    Supabase via supabase-js (select('*') paginado por .range em blocos de 1000);
 *  - caso contrário (ou em erro, tempo esgotado ou resposta vazia do Supabase), lê a
 *    cópia JSON dos resultados em <BASE_URL>demo/<chave>.json. O link público usa sempre
 *    esta cópia: o build publicado não recebe credenciais de banco.
 * As respostas ficam em cache em memória por chave. A fonte efetiva dos dados é
 * exposta para o selo do cabeçalho ("Fonte: Supabase" / "Fonte: cópia JSON dos resultados").
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mensagemErro } from './formato';
import type { Chave, Conjuntos } from './tipos';

export interface FontesConjunto {
  /** nome da view/tabela no Supabase */
  supabase: string;
  /** nome do arquivo em public/demo */
  demo: string;
}

/** Tabela de mapeamento chave lógica -> view/tabela Supabase -> arquivo demo. */
export const MAPA_FONTES: Record<Chave, FontesConjunto> = {
  kpis: { supabase: 'rr_vw_kpis', demo: 'kpis.json' },
  turnover_mensal: { supabase: 'rr_turnover_mensal', demo: 'turnover_mensal.json' },
  curva_sobrevivencia: { supabase: 'rr_curva_sobrevivencia', demo: 'curva_sobrevivencia.json' },
  motivos_saida: { supabase: 'rr_vw_motivos_saida', demo: 'motivos_saida.json' },
  risco_loja: { supabase: 'rr_vw_risco_loja', demo: 'risco_loja.json' },
  risco_segmento: { supabase: 'rr_vw_risco_segmento', demo: 'risco_segmento.json' },
  colaboradores_risco: { supabase: 'rr_vw_colaboradores_risco', demo: 'colaboradores_risco.json' },
  fatores_globais: { supabase: 'rr_fatores_globais', demo: 'fatores_globais.json' },
  efeito_fator: { supabase: 'rr_efeito_fator', demo: 'efeito_fator.json' },
  metricas_modelo: { supabase: 'rr_metricas_modelo', demo: 'metricas_modelo.json' },
  avaliacao_vies: { supabase: 'rr_avaliacao_vies', demo: 'avaliacao_vies.json' },
  parametros_custo: { supabase: 'rr_parametros_custo', demo: 'parametros_custo.json' },
  recomendacoes: { supabase: 'rr_recomendacoes', demo: 'recomendacoes.json' },
  modelos: { supabase: 'rr_modelos', demo: 'modelos.json' },
};

export type Fonte = 'supabase' | 'demo' | 'indefinida';

/** Texto do selo do cabeçalho para cada fonte. */
export const TEXTO_FONTE: Record<Fonte, string> = {
  supabase: 'Fonte: Supabase',
  demo: 'Fonte: cópia JSON dos resultados',
  indefinida: 'Fonte: carregando…',
};

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const CHAVE_SUPABASE = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

/** true quando as duas variáveis de ambiente do Supabase estão definidas. */
export const supabaseConfigurado = URL_SUPABASE !== '' && CHAVE_SUPABASE !== '';

const TAMANHO_BLOCO = 1000;
const TEMPO_LIMITE_MS = 5000;

/** Depois da primeira falha de rede, os demais conjuntos vão direto para a cópia JSON. */
let supabaseIndisponivel = false;

// ---------------------------------------------------------------------
// Estado observável: fonte efetiva e avisos
// ---------------------------------------------------------------------

export interface EstadoFonte {
  fonte: Fonte;
  avisos: readonly string[];
}

let fonteEfetiva: Fonte = 'indefinida';
let usouDemo = false;
const avisos: string[] = [];
const ouvintes = new Set<() => void>();
let estadoAtual: EstadoFonte = { fonte: fonteEfetiva, avisos: [] };

function notificar(): void {
  estadoAtual = { fonte: fonteEfetiva, avisos: [...avisos] };
  ouvintes.forEach((fn) => fn());
}

function registrarFonte(fonte: 'supabase' | 'demo'): void {
  if (fonte === 'demo') usouDemo = true;
  // Basta um conjunto vir da cópia JSON para o selo indicar essa fonte.
  const nova: Fonte = usouDemo ? 'demo' : 'supabase';
  if (nova !== fonteEfetiva) {
    fonteEfetiva = nova;
    notificar();
  }
}

function registrarAviso(mensagem: string): void {
  avisos.push(mensagem);
  console.warn(`[Radar de Retenção] ${mensagem}`);
  notificar();
}

/** Fonte efetiva dos dados já carregados. */
export function obterFonte(): Fonte {
  return fonteEfetiva;
}

/** Avisos registrados (ex.: falha do Supabase com queda para a cópia JSON). */
export function obterAvisos(): readonly string[] {
  return estadoAtual.avisos;
}

/** Instantâneo estável (mesma referência enquanto nada muda) para useSyncExternalStore. */
export function obterEstadoFonte(): EstadoFonte {
  return estadoAtual;
}

/** Assina mudanças de fonte/avisos; devolve a função de cancelamento. */
export function assinarFonte(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

// ---------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------

let cliente: SupabaseClient | null = null;

function obterCliente(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(URL_SUPABASE, CHAVE_SUPABASE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}

async function carregarSupabase<T>(nome: string): Promise<T[]> {
  const cli = obterCliente();
  const linhas: T[] = [];
  let inicio = 0;
  for (;;) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
    let resposta;
    try {
      resposta = await cli.from(nome).select('*').range(inicio, inicio + TAMANHO_BLOCO - 1).abortSignal(controle.signal);
    } finally {
      clearTimeout(relogio);
    }
    const { data, error, status } = resposta;
    if (error) {
      // status 0 ou resposta abortada: falha de rede ou tempo esgotado, não vale insistir nos outros conjuntos.
      if (!status) supabaseIndisponivel = true;
      throw new Error(`${nome}: ${error.message}`);
    }
    const bloco = (data ?? []) as T[];
    linhas.push(...bloco);
    if (bloco.length < TAMANHO_BLOCO) break;
    inicio += TAMANHO_BLOCO;
  }
  // Uma leitura vazia indica carga não feita ou bloqueio silencioso de RLS: todos os conjuntos têm linhas.
  if (linhas.length === 0) throw new Error(`${nome}: resposta vazia`);
  return linhas;
}

/** URL pública de um arquivo da cópia JSON (respeita o caminho base do Vite). */
export function urlDemo(arquivo: string): string {
  return `${import.meta.env.BASE_URL}demo/${arquivo}`;
}

async function carregarDemo<T>(arquivo: string): Promise<T[]> {
  const url = urlDemo(arquivo);
  const resposta = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resposta.ok) throw new Error(`Falha ao carregar ${url} (HTTP ${resposta.status})`);
  const json: unknown = await resposta.json();
  if (!Array.isArray(json)) throw new Error(`${arquivo}: esperado um array de objetos`);
  return json as T[];
}

const cache = new Map<Chave, Promise<unknown>>();

/**
 * Carrega um conjunto de dados pela chave lógica (com cache em memória).
 * Em erro do Supabase, cai para a cópia JSON e registra um aviso.
 */
export function carregar<K extends Chave>(chave: K): Promise<Conjuntos[K][]> {
  const existente = cache.get(chave);
  if (existente) return existente as Promise<Conjuntos[K][]>;

  const fontes = MAPA_FONTES[chave];
  const promessa = (async (): Promise<Conjuntos[K][]> => {
    if (supabaseConfigurado && !supabaseIndisponivel) {
      try {
        const dados = await carregarSupabase<Conjuntos[K]>(fontes.supabase);
        registrarFonte('supabase');
        return dados;
      } catch (erro) {
        registrarAviso(
          `Supabase indisponível para "${fontes.supabase}" (${mensagemErro(erro)}). Usando a cópia JSON dos resultados para este conjunto.`,
        );
      }
    }
    const dados = await carregarDemo<Conjuntos[K]>(fontes.demo);
    registrarFonte('demo');
    return dados;
  })();

  // Em falha, remove do cache para permitir nova tentativa (ex.: recarregar a aba).
  promessa.catch(() => {
    cache.delete(chave);
  });
  cache.set(chave, promessa);
  return promessa;
}

/** Limpa o cache (útil em testes). */
export function limparCache(): void {
  cache.clear();
}
