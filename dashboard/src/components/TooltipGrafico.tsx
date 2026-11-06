import type { ReactNode } from 'react';
import { fmtNumeroCompacto, num } from '../lib/formato';

export type LinhaGrafico = Record<string, unknown>;

interface ItemTooltip {
  name?: string | number;
  value?: unknown;
  color?: string;
  fill?: string;
  dataKey?: unknown;
  payload?: unknown;
}

interface Props {
  /** injetado pelo Recharts */
  active?: boolean;
  payload?: ItemTooltip[];
  label?: unknown;
  /** formata o valor de cada série (recebe a chave da série e a linha completa) */
  formatarValor?: (valor: number | null, chave: string, linha: LinhaGrafico) => string;
  /** formata o título (rótulo do eixo X) */
  formatarTitulo?: (rotulo: unknown, linha: LinhaGrafico) => ReactNode;
  /** conteúdo extra abaixo das séries */
  extra?: (linha: LinhaGrafico) => ReactNode;
  /** oculta séries cujo valor é nulo */
  ocultarNulos?: boolean;
}

/** Tooltip padrão dos gráficos (formatação pt-BR, cor da série, título). */
export function TooltipGrafico({ active, payload, label, formatarValor, formatarTitulo, extra, ocultarNulos = true }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  const linha = (payload[0]?.payload ?? {}) as LinhaGrafico;
  const titulo = formatarTitulo ? formatarTitulo(label, linha) : label === undefined || label === null ? null : String(label);
  return (
    <div className="tooltip-grafico" role="presentation">
      {titulo !== null && titulo !== '' && <div className="tooltip-titulo">{titulo}</div>}
      <ul>
        {payload.map((item, i) => {
          const chave = typeof item.dataKey === 'string' || typeof item.dataKey === 'number' ? String(item.dataKey) : String(item.name ?? i);
          const valor = num(item.value);
          if (ocultarNulos && valor === null) return null;
          return (
            <li key={`${chave}-${i}`}>
              <span className="tooltip-cor" style={{ background: item.color ?? item.fill ?? '#999' }} aria-hidden="true" />
              <span className="tooltip-nome">{String(item.name ?? chave)}</span>
              <strong className="tooltip-valor num">{formatarValor ? formatarValor(valor, chave, linha) : fmtNumeroCompacto(valor, 2)}</strong>
            </li>
          );
        })}
      </ul>
      {extra && <div className="tooltip-extra">{extra(linha)}</div>}
    </div>
  );
}
