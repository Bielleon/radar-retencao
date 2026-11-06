/**
 * Paleta dos gráficos (valores literais porque são usados em atributos SVG).
 * Categórica em ordem fixa (validada para daltonismo), sequencial de um matiz
 * e cores de apoio (texto, grade). As cores dos níveis de risco ficam em niveis.ts.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;

/** Rampa sequencial azul (claro -> escuro). */
export const SEQUENCIAL_AZUL = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'] as const;

export const COR_TEXTO = '#1b1f2a';
export const COR_TEXTO_2 = '#4f5668';
export const COR_TEXTO_3 = '#7b8294';
export const COR_GRADE = '#e4e7ee';
export const COR_EIXO = '#c6cbd6';
export const COR_NEUTRA = '#9aa3b5';
export const COR_PICO = '#eda100';

/** Cores fixas por valor de categoria (identidade estável entre gráficos). */
export const COR_CONTRATO: Record<string, string> = {
  'CLT Efetivo': SERIES[0],
  'Temporario Sazonal': SERIES[1],
  'Jovem Aprendiz': SERIES[2],
  Intermitente: SERIES[6],
};

/** Devolve uma cor categórica estável para um valor, com fallback pela posição. */
export function corCategoria(valor: string, indice: number, mapa: Record<string, string> = COR_CONTRATO): string {
  return mapa[valor] ?? SERIES[indice % SERIES.length];
}

export const ESTILO_TICK = { fontSize: 11, fill: COR_TEXTO_2 } as const;
export const ESTILO_LEGENDA = { fontSize: 12, color: COR_TEXTO_2 } as const;
