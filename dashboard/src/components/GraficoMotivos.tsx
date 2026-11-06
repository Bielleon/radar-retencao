import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COR_GRADE, ESTILO_LEGENDA, ESTILO_TICK, SEQUENCIAL_AZUL } from '../lib/cores';
import { fmtInteiro, fmtPct, num } from '../lib/formato';
import { rotulo } from '../lib/rotulos';
import type { MotivoSaida } from '../lib/tipos';
import { TooltipGrafico } from './TooltipGrafico';

interface Props {
  dados: MotivoSaida[];
}

/** Barras horizontais dos motivos declarados de saída, empilhadas por tempo de casa. */
export function GraficoMotivos({ dados }: Props) {
  const linhas = useMemo(() => {
    const total = dados.reduce((s, m) => s + (num(m.n) ?? 0), 0);
    return [...dados]
      .map((m) => {
        const n = num(m.n) ?? 0;
        const ate90 = Math.min(n, num(m.n_ate_90d) ?? 0);
        const ate180 = Math.min(n, Math.max(ate90, num(m.n_ate_180d) ?? 0));
        return {
          motivo: rotulo(m.motivo),
          ate90,
          de91a180: ate180 - ate90,
          apos180: n - ate180,
          total: n,
          participacao: total > 0 ? n / total : null,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [dados]);

  const altura = Math.max(240, linhas.length * 34 + 70);

  return (
    <div className="grafico">
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={linhas} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={COR_GRADE} horizontal={false} />
          <XAxis type="number" tick={ESTILO_TICK} tickLine={false} axisLine={{ stroke: COR_GRADE }} allowDecimals={false} />
          <YAxis type="category" dataKey="motivo" width={168} tick={ESTILO_TICK} tickLine={false} axisLine={false} interval={0} />
          <Tooltip
            cursor={{ fill: 'rgba(31, 63, 143, 0.06)' }}
            content={
              <TooltipGrafico
                formatarValor={(v) => fmtInteiro(v)}
                extra={(linha) => (
                  <div>
                    Total: {fmtInteiro(linha.total)} ({fmtPct(linha.participacao)} dos desligamentos voluntários)
                  </div>
                )}
              />
            }
          />
          <Legend wrapperStyle={ESTILO_LEGENDA} iconSize={10} />
          <Bar dataKey="ate90" name="Até 90 dias de casa" stackId="tempo" fill={SEQUENCIAL_AZUL[5]} maxBarSize={22} />
          <Bar dataKey="de91a180" name="91 a 180 dias" stackId="tempo" fill={SEQUENCIAL_AZUL[3]} maxBarSize={22} />
          <Bar dataKey="apos180" name="Mais de 180 dias" stackId="tempo" fill={SEQUENCIAL_AZUL[1]} maxBarSize={22} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
