import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CampoSelecao, type Opcao } from '../components/Campos';
import { ComDados, Vazio } from '../components/Estado';
import { Secao } from '../components/Secao';
import { TooltipGrafico } from '../components/TooltipGrafico';
import { COR_GRADE, ESTILO_LEGENDA, ESTILO_TICK, SERIES } from '../lib/cores';
import { comparadorTexto, fmtInteiro, fmtPct, fmtPctEixo, num } from '../lib/formato';
import { corHeatmap } from '../lib/niveis';
import { DIMENSOES_SEGMENTO, rotulo } from '../lib/rotulos';
import type { RiscoLoja, RiscoSegmento } from '../lib/tipos';
import { useDados } from '../lib/useDados';

type ChaveOrdem =
  | 'loja_id'
  | 'cidade'
  | 'bandeira'
  | 'headcount_ativo'
  | 'ativos_em_janela'
  | 'risco_medio_90d'
  | 'pct_alto_risco'
  | 'turnover_vol_12m';

type Direcao = 'asc' | 'desc';

interface Coluna {
  chave: ChaveOrdem;
  rotulo: string;
  numerica: boolean;
  dica?: string;
}

const COLUNAS: Coluna[] = [
  { chave: 'loja_id', rotulo: 'Loja', numerica: false },
  { chave: 'cidade', rotulo: 'Cidade/UF', numerica: false },
  { chave: 'bandeira', rotulo: 'Bandeira', numerica: false },
  { chave: 'headcount_ativo', rotulo: 'Headcount ativo', numerica: true, dica: 'Colaboradores ativos na loja' },
  { chave: 'ativos_em_janela', rotulo: 'Em janela', numerica: true, dica: 'Ativos com 30 a 180 dias de casa (escorados)' },
  { chave: 'risco_medio_90d', rotulo: 'Risco médio 90d', numerica: true, dica: 'Média do risco de saída voluntária até 90 dias, estimado no dia 30' },
  { chave: 'pct_alto_risco', rotulo: '% alto/crítico', numerica: true, dica: 'Proporção dos escorados em nível Alto ou Crítico, sobre o risco vigente' },
  { chave: 'turnover_vol_12m', rotulo: 'Turnover 12m', numerica: true, dica: 'Turnover voluntário realizado da loja nos 12 meses anteriores à referência (difere do indicador usado no modelo, que é um proxy sintético)' },
];

interface Filtros {
  regiao: string;
  bandeira: string;
  tipo_loja: string;
}

/** Abaixo disso, o percentual da loja é instável e ela não conta como "exige atenção". */
const AMOSTRA_MINIMA = 5;

function opcoesDe(valores: Iterable<string | null | undefined>): Opcao[] {
  const unicos = [...new Set([...valores].filter((v): v is string => typeof v === 'string' && v !== ''))];
  unicos.sort((a, b) => comparadorTexto.compare(rotulo(a), rotulo(b)));
  return unicos.map((v) => ({ valor: v, rotulo: rotulo(v) }));
}

function comparar(a: RiscoLoja, b: RiscoLoja, chave: ChaveOrdem, direcao: Direcao): number {
  const sinal = direcao === 'asc' ? 1 : -1;
  if (chave === 'cidade') return sinal * comparadorTexto.compare(`${a.cidade}/${a.uf}`, `${b.cidade}/${b.uf}`);
  if (chave === 'loja_id' || chave === 'bandeira') return sinal * comparadorTexto.compare(String(a[chave] ?? ''), String(b[chave] ?? ''));
  const na = num(a[chave]);
  const nb = num(b[chave]);
  if (na === null && nb === null) return 0;
  if (na === null) return 1; // nulos sempre por último
  if (nb === null) return -1;
  return sinal * (na - nb);
}

function TabelaLojas({ lojas }: { lojas: RiscoLoja[] }) {
  const [filtros, setFiltros] = useState<Filtros>({ regiao: '', bandeira: '', tipo_loja: '' });
  const [ordem, setOrdem] = useState<{ chave: ChaveOrdem; direcao: Direcao }>({ chave: 'pct_alto_risco', direcao: 'desc' });

  const opcoes = useMemo(
    () => ({
      regiao: opcoesDe(lojas.map((l) => l.regiao)),
      bandeira: opcoesDe(lojas.map((l) => l.bandeira)),
      tipo_loja: opcoesDe(lojas.map((l) => l.tipo_loja)),
    }),
    [lojas],
  );

  const linhas = useMemo(() => {
    const filtradas = lojas.filter(
      (l) =>
        (filtros.regiao === '' || l.regiao === filtros.regiao) &&
        (filtros.bandeira === '' || l.bandeira === filtros.bandeira) &&
        (filtros.tipo_loja === '' || l.tipo_loja === filtros.tipo_loja),
    );
    return [...filtradas].sort((a, b) => comparar(a, b, ordem.chave, ordem.direcao));
  }, [lojas, filtros, ordem]);

  const resumo = useMemo(() => {
    const atencao = linhas.filter((l) => (num(l.pct_alto_risco) ?? 0) >= 0.3 && (num(l.ativos_em_janela) ?? 0) >= AMOSTRA_MINIMA).length;
    const janela = linhas.reduce((s, l) => s + (num(l.ativos_em_janela) ?? 0), 0);
    const alto = linhas.reduce((s, l) => s + (num(l.n_alto_risco) ?? 0), 0);
    return { atencao, janela, alto };
  }, [linhas]);

  function alternarOrdem(chave: ChaveOrdem): void {
    setOrdem((atual) => {
      if (atual.chave === chave) return { chave, direcao: atual.direcao === 'desc' ? 'asc' : 'desc' };
      const coluna = COLUNAS.find((c) => c.chave === chave);
      return { chave, direcao: coluna?.numerica ? 'desc' : 'asc' };
    });
  }

  return (
    <>
      <div className="filtros">
        <CampoSelecao rotulo="Região" valor={filtros.regiao} opcoes={opcoes.regiao} todos="Todas" aoMudar={(v) => setFiltros((f) => ({ ...f, regiao: v }))} />
        <CampoSelecao rotulo="Bandeira" valor={filtros.bandeira} opcoes={opcoes.bandeira} todos="Todas" aoMudar={(v) => setFiltros((f) => ({ ...f, bandeira: v }))} />
        <CampoSelecao
          rotulo="Tipo de loja"
          valor={filtros.tipo_loja}
          opcoes={opcoes.tipo_loja}
          todos="Todos"
          aoMudar={(v) => setFiltros((f) => ({ ...f, tipo_loja: v }))}
        />
        {(filtros.regiao || filtros.bandeira || filtros.tipo_loja) && (
          <button type="button" className="botao botao-secundario" onClick={() => setFiltros({ regiao: '', bandeira: '', tipo_loja: '' })}>
            Limpar filtros
          </button>
        )}
      </div>
      <p className="resumo-filtro">
        <strong>{fmtInteiro(linhas.length)}</strong> {linhas.length === 1 ? 'loja' : 'lojas'} · <strong>{fmtInteiro(resumo.janela)}</strong> colaboradores em janela de
        risco · <strong>{fmtInteiro(resumo.alto)}</strong> em risco alto/crítico · <strong>{fmtInteiro(resumo.atencao)}</strong>{' '}
        {resumo.atencao === 1 ? 'loja exige' : 'lojas exigem'} atenção (≥ 30% em risco alto/crítico, com ao menos {AMOSTRA_MINIMA} em janela)
      </p>
      {linhas.length === 0 ? (
        <Vazio texto="Nenhuma loja para os filtros selecionados." />
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela tabela-lojas">
            <thead>
              <tr>
                {COLUNAS.map((c) => {
                  const ativa = ordem.chave === c.chave;
                  return (
                    <th
                      key={c.chave}
                      scope="col"
                      className={`ordenavel${c.numerica ? ' num' : ''}${ativa ? ' ativa' : ''}`}
                      aria-sort={ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}
                      title={c.dica}
                    >
                      <button type="button" onClick={() => alternarOrdem(c.chave)}>
                        {c.rotulo}
                        <span className="indicador-ordem" aria-hidden="true">
                          {ativa ? (ordem.direcao === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const pct = num(l.pct_alto_risco);
                const cores = corHeatmap(pct);
                const amostraPequena = (num(l.ativos_em_janela) ?? 0) < AMOSTRA_MINIMA;
                return (
                  <tr key={l.loja_id}>
                    <td>
                      <strong>{l.loja_id}</strong>
                      <span className="texto-apoio"> · {rotulo(l.tipo_loja)} · porte {rotulo(l.porte).toLowerCase()}</span>
                    </td>
                    <td>
                      {rotulo(l.cidade)}/{l.uf}
                      <span className="texto-apoio"> · {rotulo(l.regiao)}</span>
                    </td>
                    <td>{rotulo(l.bandeira)}</td>
                    <td className="num">{fmtInteiro(l.headcount_ativo)}</td>
                    <td className="num">{fmtInteiro(l.ativos_em_janela)}</td>
                    <td className="num">{fmtPct(l.risco_medio_90d)}</td>
                    <td
                      className={`num celula-heatmap${amostraPequena ? ' celula-amostra-pequena' : ''}`}
                      style={amostraPequena ? undefined : { background: cores.fundo, color: cores.texto }}
                      title={pct === null ? 'Sem colaboradores escorados' : `${fmtInteiro(l.n_alto_risco)} de ${fmtInteiro(l.ativos_em_janela)} em risco alto/crítico`}
                    >
                      {fmtPct(pct)}
                      {pct !== null && (
                        <span className="celula-contagem">
                          {fmtInteiro(l.n_alto_risco)} de {fmtInteiro(l.ativos_em_janela)}
                        </span>
                      )}
                    </td>
                    <td className="num">{fmtPct(l.turnover_vol_12m)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="legenda-heatmap">
        <span className="amostra-heatmap" aria-hidden="true" /> Escala de cor da coluna "% alto/crítico": de 0% (claro) a 60% ou mais (escuro). Lojas com menos de {AMOSTRA_MINIMA} pessoas em janela ficam sem cor: o percentual é instável.
      </p>
    </>
  );
}

function GraficoSegmento({ dados, dimensao }: { dados: RiscoSegmento[]; dimensao: string }) {
  const linhas = useMemo(
    () =>
      dados
        .filter((d) => d.dimensao === dimensao)
        .map((d) => ({
          categoria: rotulo(d.categoria),
          n: num(d.n) ?? 0,
          risco: num(d.risco_medio_90d),
          risco180: num(d.risco_medio_180d),
          pctAlto: num(d.pct_alto_risco),
          nAlto: num(d.n_alto_risco) ?? 0,
        }))
        .sort((a, b) => (b.risco ?? -1) - (a.risco ?? -1)),
    [dados, dimensao],
  );

  if (linhas.length === 0) return <Vazio texto="Sem dados para esta dimensão." />;
  const altura = Math.max(200, linhas.length * 46 + 64);

  return (
    <>
      <div className="grafico">
        <ResponsiveContainer width="100%" height={altura}>
          <BarChart data={linhas} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 0 }} barCategoryGap="26%" barGap={2}>
            <CartesianGrid stroke={COR_GRADE} horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={fmtPctEixo}
              tick={ESTILO_TICK}
              tickLine={false}
              axisLine={{ stroke: COR_GRADE }}
              domain={[0, (max: number) => Math.min(1, Math.max(0.1, Math.ceil(max * 10) / 10))]}
            />
            <YAxis type="category" dataKey="categoria" width={140} tick={ESTILO_TICK} tickLine={false} axisLine={false} interval={0} />
            <Tooltip
              cursor={{ fill: 'rgba(31, 63, 143, 0.06)' }}
              content={
                <TooltipGrafico
                  formatarValor={(v) => fmtPct(v)}
                  extra={(l) => (
                    <div>
                      {fmtInteiro(l.n)} em janela de risco · {fmtInteiro(l.nAlto)} em risco alto/crítico · risco médio 180d {fmtPct(l.risco180)}
                    </div>
                  )}
                />
              }
            />
            <Legend wrapperStyle={ESTILO_LEGENDA} iconSize={10} />
            <Bar dataKey="risco" name="Risco médio 90d" fill={SERIES[0]} maxBarSize={16} radius={[0, 4, 4, 0]} />
            <Bar dataKey="pctAlto" name="% em risco alto/crítico" fill={SERIES[1]} maxBarSize={16} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="detalhes-tabela">
        <summary>Ver os números em tabela</summary>
        <div className="tabela-rolagem">
          <table className="tabela tabela-compacta">
            <thead>
              <tr>
                <th scope="col">Categoria</th>
                <th scope="col" className="num">
                  Em janela
                </th>
                <th scope="col" className="num">
                  Risco médio 90d
                </th>
                <th scope="col" className="num">
                  Risco médio 180d
                </th>
                <th scope="col" className="num">
                  Alto/crítico
                </th>
                <th scope="col" className="num">
                  % alto/crítico
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.categoria}>
                  <td>{l.categoria}</td>
                  <td className="num">{fmtInteiro(l.n)}</td>
                  <td className="num">{fmtPct(l.risco)}</td>
                  <td className="num">{fmtPct(l.risco180)}</td>
                  <td className="num">{fmtInteiro(l.nAlto)}</td>
                  <td className="num">{fmtPct(l.pctAlto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function MapaDeRisco() {
  const lojas = useDados('risco_loja');
  const segmentos = useDados('risco_segmento');
  const [dimensao, setDimensao] = useState<string>('cargo');

  const opcoesDimensao = useMemo(() => {
    const presentes = new Set((segmentos.dados ?? []).map((d) => d.dimensao));
    const conhecidas = DIMENSOES_SEGMENTO.filter((d) => presentes.size === 0 || presentes.has(d.valor));
    const extras = [...presentes].filter((p) => !DIMENSOES_SEGMENTO.some((d) => d.valor === p)).map((p) => ({ valor: p, rotulo: rotulo(p) }));
    return [...conhecidas, ...extras];
  }, [segmentos.dados]);

  return (
    <>
      <Secao
        titulo="Risco por loja"
        descricao="Onde agir preventivamente: clique no cabeçalho para ordenar; a coluna % alto/crítico funciona como mapa de calor."
        id="lojas"
      >
        <ComDados estado={lojas}>{(dados) => <TabelaLojas lojas={dados} />}</ComDados>
      </Secao>
      <Secao
        titulo="Risco por segmento"
        descricao="Risco médio de 90 dias (estimado no dia 30) e proporção em risco alto/crítico (sobre o risco vigente) por categoria da dimensão escolhida."
        id="segmentos"
        acoes={<CampoSelecao rotulo="Dimensão" valor={dimensao} opcoes={opcoesDimensao} aoMudar={setDimensao} />}
      >
        <ComDados estado={segmentos}>{(dados) => <GraficoSegmento dados={dados} dimensao={dimensao} />}</ComDados>
      </Secao>
    </>
  );
}
