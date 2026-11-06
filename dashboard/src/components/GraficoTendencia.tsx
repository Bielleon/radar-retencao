import { useMemo } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COR_GRADE, COR_PICO, COR_TEXTO, ESTILO_LEGENDA, ESTILO_TICK, SERIES } from '../lib/cores';
import { fmtInteiro, fmtMesAnoLongo, fmtMesAno, fmtPct, fmtPctEixo, num } from '../lib/formato';
import { rotulo } from '../lib/rotulos';
import type { TurnoverMensal } from '../lib/tipos';
import { TooltipGrafico } from './TooltipGrafico';

interface Props {
  dados: TurnoverMensal[];
}

interface LinhaMes extends TurnoverMensal {
  rotuloMes: string;
  taxa: number | null;
}

interface FaixaPico {
  inicio: string;
  fim: string;
  campanha: string;
}

/** A base sintética começa vazia em jan/2023: os primeiros meses têm taxa inflada pelo denominador pequeno. */
const MESES_EXIBIDOS = 24;
const COR_CAMPANHA: Record<string, string> = { 'Dia das Criancas': COR_PICO, Natal: SERIES[4] };

/** Gráfico composto mensal: barras (admissões, saídas voluntárias), linha (taxa de turnover voluntário) e faixas de pico. */
export function GraficoTendencia({ dados }: Props) {
  const linhas = useMemo<LinhaMes[]>(
    () =>
      [...dados]
        .sort((a, b) => a.mes.localeCompare(b.mes))
        .slice(-MESES_EXIBIDOS)
        .map((l) => ({ ...l, rotuloMes: fmtMesAno(l.mes), taxa: num(l.taxa_turnover_vol) })),
    [dados],
  );

  // Agrupa meses de pico consecutivos da mesma campanha em uma única faixa.
  const faixas = useMemo<FaixaPico[]>(() => {
    const resultado: FaixaPico[] = [];
    linhas.forEach((l, i) => {
      if (!l.periodo_pico) return;
      const anterior = i > 0 ? linhas[i - 1] : null;
      const ultima = resultado[resultado.length - 1];
      const campanha = l.campanha ?? 'Pico sazonal';
      if (ultima && anterior && anterior.periodo_pico && (anterior.campanha ?? 'Pico sazonal') === campanha && ultima.fim === anterior.rotuloMes) {
        ultima.fim = l.rotuloMes;
      } else {
        resultado.push({ inicio: l.rotuloMes, fim: l.rotuloMes, campanha });
      }
    });
    return resultado;
  }, [linhas]);

  return (
    <div className="grafico">
      <ResponsiveContainer width="100%" height={330}>
        <ComposedChart data={linhas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={COR_GRADE} vertical={false} />
          <XAxis dataKey="rotuloMes" tick={ESTILO_TICK} tickLine={false} axisLine={{ stroke: COR_GRADE }} interval="preserveStartEnd" minTickGap={18} />
          <YAxis yAxisId="pessoas" tick={ESTILO_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={38} />
          <YAxis
            yAxisId="taxa"
            orientation="right"
            tick={ESTILO_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtPctEixo}
            width={44}
            tickCount={5}
            domain={[0, (max: number) => Math.max(0.04, Math.ceil(max * 100 * 1.1) / 100)]}
          />
          {faixas.map((f) => (
            <ReferenceArea
              key={f.inicio}
              yAxisId="pessoas"
              x1={f.inicio}
              x2={f.fim}
              fill={COR_CAMPANHA[f.campanha] ?? COR_PICO}
              fillOpacity={0.16}
              stroke="none"
            />
          ))}
          <Tooltip
            cursor={{ fill: 'rgba(31, 63, 143, 0.06)' }}
            content={
              <TooltipGrafico
                formatarTitulo={(_r, linha) => fmtMesAnoLongo(String(linha.mes ?? ''))}
                formatarValor={(v, chave) => (chave === 'taxa' ? fmtPct(v) : fmtInteiro(v))}
                extra={(linha) => (
                  <>
                    <div>Saídas voluntárias precoces (≤ 180 dias): {fmtInteiro(linha.desligamentos_vol_precoces)}</div>
                    <div>Headcount médio: {fmtInteiro(linha.headcount_medio)}</div>
                    {linha.periodo_pico === true && <div className="tooltip-pico">Mês de pico: {rotulo(linha.campanha, 'campanha')}</div>}
                  </>
                )}
              />
            }
          />
          <Legend wrapperStyle={ESTILO_LEGENDA} iconSize={10} />
          <Bar yAxisId="pessoas" dataKey="admissoes" name="Admissões" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar yAxisId="pessoas" dataKey="desligamentos_voluntarios" name="Saídas voluntárias" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Line
            yAxisId="taxa"
            type="monotone"
            dataKey="taxa"
            name="Taxa de turnover voluntário (eixo direito)"
            stroke={COR_TEXTO}
            strokeWidth={2}
            dot={{ r: 2.5, fill: COR_TEXTO, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="grafico-legenda-extra">
        <span className="amostra-faixa" aria-hidden="true" /> Dia das Crianças (set-out){' '}
        <span className="amostra-faixa amostra-faixa-natal" aria-hidden="true" /> Natal (nov-dez). Eixo esquerdo: pessoas; eixo direito: saídas voluntárias ÷ headcount médio.
        Últimos {MESES_EXIBIDOS} meses: a base sintética começa vazia em jan/2023 e o headcount cresce durante toda a série, o que infla a taxa dos primeiros meses e
        reduz a taxa ao longo do tempo.
      </p>
    </div>
  );
}
