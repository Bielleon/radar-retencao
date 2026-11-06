import { fmtPct } from '../lib/formato';
import { CORES_NIVEL, LIMIARES_PADRAO, coresNivel, nivelPorRisco } from '../lib/niveis';
import { rotulo } from '../lib/rotulos';
import type { LimiaresNivel } from '../lib/tipos';

interface Props {
  rotuloMedidor: string;
  valor: number | null;
  limiares?: Partial<LimiaresNivel> | null;
  /** quando true, o nível ao lado do valor é omitido (ex.: horizonte 180d não define o nível) */
  mostrarNivel?: boolean;
}

/** Medidor horizontal com as faixas dos níveis e um marcador na posição do risco. */
export function Medidor({ rotuloMedidor, valor, limiares, mostrarNivel = true }: Props) {
  const l: LimiaresNivel = { ...LIMIARES_PADRAO, ...(limiares ?? {}) };
  const v = valor === null ? null : Math.max(0, Math.min(1, valor));
  const nivel = v === null ? null : nivelPorRisco(v, l);
  const cores = coresNivel(nivel);
  const faixas = [
    { nivel: 'Baixo' as const, de: 0, ate: l.Medio },
    { nivel: 'Medio' as const, de: l.Medio, ate: l.Alto },
    { nivel: 'Alto' as const, de: l.Alto, ate: l.Critico },
    { nivel: 'Critico' as const, de: l.Critico, ate: 1 },
  ];
  return (
    <div className="medidor">
      <div className="medidor-topo">
        <span className="medidor-rotulo">{rotuloMedidor}</span>
        <span className="medidor-valor num" style={{ color: v === null ? undefined : cores.texto }}>
          {v === null ? 'não disponível' : fmtPct(v)}
          {mostrarNivel && nivel && <span className="medidor-nivel"> · {rotulo(nivel)}</span>}
        </span>
      </div>
      <div className="medidor-trilha" role="img" aria-label={`${rotuloMedidor}: ${v === null ? 'não disponível' : fmtPct(v)}`}>
        {faixas.map((f) => (
          <span
            key={f.nivel}
            className="medidor-faixa"
            style={{ left: `${f.de * 100}%`, width: `${Math.max(0, f.ate - f.de) * 100}%`, background: CORES_NIVEL[f.nivel].cor }}
            title={`${rotulo(f.nivel)}: ${fmtPct(f.de, 0)} a ${fmtPct(f.ate, 0)}`}
          />
        ))}
        {v !== null && <span className="medidor-marcador" style={{ left: `${v * 100}%` }} aria-hidden="true" />}
      </div>
      <div className="medidor-escala" aria-hidden="true">
        <span>0%</span>
        <span style={{ left: `${l.Medio * 100}%` }}>{fmtPct(l.Medio, 0)}</span>
        <span style={{ left: `${l.Alto * 100}%` }}>{fmtPct(l.Alto, 0)}</span>
        <span style={{ left: `${l.Critico * 100}%` }}>{fmtPct(l.Critico, 0)}</span>
        <span className="medidor-fim">100%</span>
      </div>
    </div>
  );
}
