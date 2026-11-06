import type { LimiaresNivel, Nivel } from './tipos';

/** Ordem crescente de severidade. */
export const NIVEIS: Nivel[] = ['Baixo', 'Medio', 'Alto', 'Critico'];

/** Limiares padrão (seção 3 da especificação), aplicados sobre o risco vigente. */
export const LIMIARES_PADRAO: LimiaresNivel = { Medio: 0.15, Alto: 0.3, Critico: 0.45 };

export interface CoresNivel {
  /** cor forte (barras, marcadores) */
  cor: string;
  /** fundo claro (chips) */
  fundo: string;
  /** texto escuro sobre o fundo claro */
  texto: string;
}

/** Baixo verde, Médio amarelo, Alto laranja, Crítico vermelho (consistente em toda a interface). */
export const CORES_NIVEL: Record<Nivel, CoresNivel> = {
  Baixo: { cor: '#1f9d55', fundo: '#e3f5ea', texto: '#146c3a' },
  Medio: { cor: '#e6b400', fundo: '#fff4c2', texto: '#7a5c00' },
  Alto: { cor: '#ef7d2d', fundo: '#ffe8d6', texto: '#9a4a0f' },
  Critico: { cor: '#d9393b', fundo: '#fde1e1', texto: '#8f1d1f' },
};

const CORES_DESCONHECIDO: CoresNivel = { cor: '#8a93a6', fundo: '#eef0f4', texto: '#4f5668' };

export function ehNivel(valor: unknown): valor is Nivel {
  return typeof valor === 'string' && (NIVEIS as string[]).includes(valor);
}

/**
 * Risco que ainda pode se realizar (igual a rr_comum.risco_vigente): até o dia 90, o risco de 90 dias;
 * depois dele, o risco residual até o dia 180, condicional a ter chegado ao dia 90.
 */
export function riscoVigente(risco90: number | null, risco180: number | null, diasDeCasa: number | null): number | null {
  if (risco90 === null) return null;
  if (diasDeCasa === null || diasDeCasa <= 90) return risco90;
  if (risco180 === null || risco90 >= 1) return null;
  return Math.max(0, (risco180 - risco90) / (1 - risco90));
}

/** Classifica um risco (fração 0-1) em nível usando os limiares do model card (ou os padrão). */
export function nivelPorRisco(risco: number, limiares?: Partial<LimiaresNivel> | null): Nivel {
  const l: LimiaresNivel = { ...LIMIARES_PADRAO, ...(limiares ?? {}) };
  if (risco >= l.Critico) return 'Critico';
  if (risco >= l.Alto) return 'Alto';
  if (risco >= l.Medio) return 'Medio';
  return 'Baixo';
}

/** Índice de severidade (0 = Baixo ... 3 = Crítico) para ordenação; -1 quando desconhecido. */
export function indiceNivel(nivel: string | null | undefined): number {
  return NIVEIS.indexOf(nivel as Nivel);
}

export function coresNivel(nivel: string | null | undefined): CoresNivel {
  return ehNivel(nivel) ? CORES_NIVEL[nivel] : CORES_DESCONHECIDO;
}

function hexParaRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function misturar(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexParaRgb(a);
  const [r2, g2, b2] = hexParaRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Cor de célula tipo "heatmap" para a proporção em risco alto/crítico (0-1):
 * rampa sequencial de um único matiz (vermelho), do claro ao escuro.
 * O teto da escala é 60% (acima disso a cor satura).
 */
export function corHeatmap(pct: number | null | undefined, teto = 0.6): { fundo: string; texto: string } {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return { fundo: 'transparent', texto: 'inherit' };
  const t = Math.max(0, Math.min(1, pct / teto));
  return { fundo: misturar('#fff3f0', '#b3231f', t), texto: t > 0.55 ? '#ffffff' : '#3a1111' };
}
