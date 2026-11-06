import { fmtPct } from '../lib/formato';
import { coresNivel, nivelPorRisco } from '../lib/niveis';
import type { LimiaresNivel } from '../lib/tipos';

interface Props {
  valor: number | null | undefined;
  /** nível já calculado (quando omitido, deriva do valor pelos limiares) */
  nivel?: string | null;
  limiares?: Partial<LimiaresNivel> | null;
  /** valor máximo da escala (padrão 1 = 100%) */
  maximo?: number;
  casas?: number;
}

/** Barra horizontal de risco com a cor do nível e o percentual ao lado. */
export function BarraRisco({ valor, nivel, limiares, maximo = 1, casas = 1 }: Props) {
  const v = typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
  const nivelEfetivo = nivel ?? (v !== null ? nivelPorRisco(v, limiares) : null);
  const cores = coresNivel(nivelEfetivo);
  const largura = v === null ? 0 : Math.max(0, Math.min(100, (v / maximo) * 100));
  return (
    <span className="barra-risco" title={v === null ? 'Sem predição' : `Risco ${fmtPct(v, casas)}`}>
      <span className="barra-risco-trilha" aria-hidden="true">
        <span className="barra-risco-preenchimento" style={{ width: `${largura}%`, background: cores.cor }} />
      </span>
      <span className="barra-risco-texto num">{fmtPct(v, casas)}</span>
    </span>
  );
}
