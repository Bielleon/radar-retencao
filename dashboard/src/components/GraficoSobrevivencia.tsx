import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COR_EIXO, COR_GRADE, COR_TEXTO, COR_TEXTO_2, ESTILO_LEGENDA, ESTILO_TICK, corCategoria } from '../lib/cores';
import { fmtPct, num } from '../lib/formato';
import { rotulo } from '../lib/rotulos';
import type { CurvaSobrevivencia } from '../lib/tipos';
import { TooltipGrafico } from './TooltipGrafico';

interface Props {
  dados: CurvaSobrevivencia[];
}

const CHAVE_GERAL = '__geral__';
const DIA_MAXIMO = 365;
const TICKS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 365];

interface Serie {
  chave: string;
  nome: string;
  cor: string;
  pontos: { dia: number; prob: number }[];
}

/** Curva de sobrevivência Kaplan-Meier (geral e por tipo de contrato), 0 a 365 dias, com referências em 90 e 180. */
export function GraficoSobrevivencia({ dados }: Props) {
  const { linhas, series, minimo } = useMemo(() => {
    const mapa = new Map<string, Serie>();
    const geral = dados.filter((d) => d.segmento_tipo === 'geral');
    if (geral.length > 0) mapa.set(CHAVE_GERAL, { chave: CHAVE_GERAL, nome: 'Geral', cor: COR_TEXTO, pontos: [] });
    let indice = 0;
    for (const d of dados) {
      const ehGeral = d.segmento_tipo === 'geral';
      if (!ehGeral && d.segmento_tipo !== 'tipo_contrato') continue;
      const chave = ehGeral ? CHAVE_GERAL : d.segmento_valor;
      let serie = mapa.get(chave);
      if (!serie) {
        serie = { chave, nome: rotulo(d.segmento_valor), cor: corCategoria(d.segmento_valor, indice), pontos: [] };
        indice += 1;
        mapa.set(chave, serie);
      }
      const prob = num(d.prob_permanencia);
      const dia = num(d.dia);
      if (prob !== null && dia !== null && dia >= 0 && dia <= DIA_MAXIMO) serie.pontos.push({ dia, prob });
    }
    const lista = [...mapa.values()];
    for (const s of lista) s.pontos.sort((a, b) => a.dia - b.dia);

    // Grade unificada de dias (a curva KM é uma função escada: o valor vigente é o último ponto <= dia).
    const dias = new Set<number>([0, DIA_MAXIMO]);
    for (const s of lista) for (const p of s.pontos) dias.add(p.dia);
    const grade = [...dias].sort((a, b) => a - b);
    const cursores = lista.map(() => 0);
    let min = 1;
    const linhasGrade = grade.map((dia) => {
      const linha: Record<string, number | null> = { dia };
      lista.forEach((s, i) => {
        let valor: number | null = null;
        while (cursores[i] < s.pontos.length && s.pontos[cursores[i]].dia <= dia) {
          valor = s.pontos[cursores[i]].prob;
          cursores[i] += 1;
        }
        if (valor === null) {
          // Mantém o último valor conhecido (função escada); antes do primeiro ponto, 100%.
          const anterior = cursores[i] > 0 ? s.pontos[cursores[i] - 1].prob : 1;
          valor = anterior;
        }
        linha[s.chave] = valor;
        if (valor < min) min = valor;
      });
      return linha;
    });
    return { linhas: linhasGrade, series: lista, minimo: min };
  }, [dados]);

  const dominioInferior = Math.max(0, Math.floor((minimo - 0.04) * 10) / 10);
  const nomes = new Map(series.map((s) => [s.chave, s.nome]));

  return (
    <div className="grafico">
      <ResponsiveContainer width="100%" height={330}>
        <LineChart data={linhas} margin={{ top: 22, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={COR_GRADE} vertical={false} />
          <XAxis
            dataKey="dia"
            type="number"
            domain={[0, DIA_MAXIMO]}
            ticks={TICKS}
            tick={ESTILO_TICK}
            tickLine={false}
            axisLine={{ stroke: COR_GRADE }}
            label={{ value: 'Dias de casa', position: 'insideBottomRight', offset: -2, fontSize: 11, fill: COR_TEXTO_2 }}
          />
          <YAxis
            domain={[dominioInferior, 1]}
            tickFormatter={(v: number) => fmtPct(v, 0)}
            tick={ESTILO_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <ReferenceLine x={90} stroke={COR_EIXO} strokeDasharray="4 3" label={{ value: '90 dias', position: 'top', fontSize: 11, fill: COR_TEXTO_2 }} />
          <ReferenceLine x={180} stroke={COR_EIXO} strokeDasharray="4 3" label={{ value: '180 dias', position: 'top', fontSize: 11, fill: COR_TEXTO_2 }} />
          <Tooltip
            content={
              <TooltipGrafico
                formatarTitulo={(r) => `Dia ${String(r ?? '')} — probabilidade de permanência`}
                formatarValor={(v, chave) => (nomes.has(chave) ? fmtPct(v) : String(v ?? ''))}
              />
            }
          />
          <Legend wrapperStyle={ESTILO_LEGENDA} iconSize={10} />
          {series.map((s) => (
            <Line
              key={s.chave}
              type="stepAfter"
              dataKey={s.chave}
              name={s.nome}
              stroke={s.cor}
              strokeWidth={s.chave === CHAVE_GERAL ? 2.6 : 1.8}
              strokeDasharray={s.chave === CHAVE_GERAL ? undefined : undefined}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="grafico-legenda-extra">
        Evento = desligamento voluntário; saídas involuntárias e ativos são censurados. A linha "Geral" agrega todos os contratos.
      </p>
    </div>
  );
}
