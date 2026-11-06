/** Utilitários de formatação pt-BR (Intl). Todos aceitam valores nulos/indefinidos. */

const LOCALIDADE = 'pt-BR';
export const VAZIO = '—';

const fmtInteiroIntl = new Intl.NumberFormat(LOCALIDADE, { maximumFractionDigits: 0 });
const fmtMoedaIntl = new Intl.NumberFormat(LOCALIDADE, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtMoedaCentavosIntl = new Intl.NumberFormat(LOCALIDADE, {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtDataIntl = new Intl.DateTimeFormat(LOCALIDADE, { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDataLongaIntl = new Intl.DateTimeFormat(LOCALIDADE, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtMesAnoIntl = new Intl.DateTimeFormat(LOCALIDADE, { month: 'short', year: '2-digit' });
const fmtMesAnoLongoIntl = new Intl.DateTimeFormat(LOCALIDADE, { month: 'long', year: 'numeric' });
const cacheDecimais = new Map<string, Intl.NumberFormat>();

/** Converte qualquer valor (number, string numérica, boolean) em number; devolve null quando não numérico. */
export function num(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string') {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  return null;
}

function formatadorDecimal(minimo: number, maximo: number): Intl.NumberFormat {
  const chave = `${minimo}-${maximo}`;
  let f = cacheDecimais.get(chave);
  if (!f) {
    f = new Intl.NumberFormat(LOCALIDADE, { minimumFractionDigits: minimo, maximumFractionDigits: maximo });
    cacheDecimais.set(chave, f);
  }
  return f;
}

/** 1234 -> "1.234" */
export function fmtInteiro(valor: unknown, vazio = VAZIO): string {
  const n = num(valor);
  return n === null ? vazio : fmtInteiroIntl.format(Math.round(n));
}

/** 12.345 -> "12,3" (casas decimais fixas) */
export function fmtNumero(valor: unknown, casas = 1, vazio = VAZIO): string {
  const n = num(valor);
  return n === null ? vazio : formatadorDecimal(casas, casas).format(n);
}

/** 12.3456 -> "12,35" (até N casas, sem zeros à direita) */
export function fmtNumeroCompacto(valor: unknown, maxCasas = 2, vazio = VAZIO): string {
  const n = num(valor);
  return n === null ? vazio : formatadorDecimal(0, maxCasas).format(n);
}

/** Fração 0.153 -> "15,3%" */
export function fmtPct(valor: unknown, casas = 1, vazio = VAZIO): string {
  const n = num(valor);
  return n === null ? vazio : `${formatadorDecimal(casas, casas).format(n * 100)}%`;
}

/** Rótulo de eixo em %: sem casas quando o valor é inteiro, uma casa quando não é (7,5%). */
export function fmtPctEixo(valor: number): string {
  const p = Math.round(valor * 1000) / 10;
  return `${formatadorDecimal(Number.isInteger(p) ? 0 : 1, 1).format(p)}%`;
}

/** Converte texto digitado em número, aceitando vírgula ou ponto como separador decimal. */
export function lerDecimal(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '' || !/^-?\d*\.?\d*$/.test(limpo) || limpo === '.' || limpo === '-') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** 6500 -> "R$ 6.500" (sem centavos) */
export function fmtMoeda(valor: unknown, vazio = VAZIO): string {
  const n = num(valor);
  return n === null ? vazio : fmtMoedaIntl.format(n);
}

/** 6500 -> "R$ 6.500,00" */
export function fmtMoedaCentavos(valor: unknown, vazio = VAZIO): string {
  const n = num(valor);
  return n === null ? vazio : fmtMoedaCentavosIntl.format(n);
}

/** Interpreta 'YYYY-MM-DD' (ou ISO completo) como data local, sem deslocamento de fuso. */
export function parseData(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** '2026-10-31' -> '31/10/2026' */
export function fmtData(iso: string | null | undefined, vazio = VAZIO): string {
  const d = parseData(iso);
  return d ? fmtDataIntl.format(d) : vazio;
}

/** '2026-10-31' -> '31 de outubro de 2026' */
export function fmtDataLonga(iso: string | null | undefined, vazio = VAZIO): string {
  const d = parseData(iso);
  return d ? fmtDataLongaIntl.format(d) : vazio;
}

/** '2026-10-01' -> 'out/26' (sem o ponto abreviador) */
export function fmtMesAno(iso: string | null | undefined, vazio = VAZIO): string {
  const d = parseData(iso);
  return d ? fmtMesAnoIntl.format(d).replace('.', '') : vazio;
}

/** '2026-10-01' -> 'outubro de 2026' */
export function fmtMesAnoLongo(iso: string | null | undefined, vazio = VAZIO): string {
  const d = parseData(iso);
  return d ? fmtMesAnoLongoIntl.format(d) : vazio;
}

/** 42 -> "42 dias"; 1 -> "1 dia" */
export function fmtDias(valor: unknown, vazio = VAZIO): string {
  const n = num(valor);
  if (n === null) return vazio;
  const inteiro = Math.round(n);
  return `${fmtInteiro(inteiro)} ${inteiro === 1 ? 'dia' : 'dias'}`;
}

/** Extrai uma mensagem legível de um erro desconhecido. */
export function mensagemErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === 'string') return erro;
  try {
    return JSON.stringify(erro);
  } catch {
    return 'Erro desconhecido';
  }
}

/** Comparador de strings em pt-BR (ignora acentos/caixa; números em ordem natural). */
export const comparadorTexto = new Intl.Collator(LOCALIDADE, { sensitivity: 'base', numeric: true });
