import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Segmentado } from '../components/Campos';
import { ComDados, Vazio } from '../components/Estado';
import { Secao } from '../components/Secao';
import { TooltipGrafico } from '../components/TooltipGrafico';
import { COR_GRADE, COR_NEUTRA, ESTILO_TICK, SERIES } from '../lib/cores';
import { comparadorTexto, fmtInteiro, fmtNumero, fmtPct, fmtPctEixo, num } from '../lib/formato';
import { METRICAS, METRICAS_FORA_DA_TABELA, ORDEM_METRICAS, rotulo, rotuloFator, rotuloMetrica, rotuloModelo } from '../lib/rotulos';
import type { AvaliacaoVies, EfeitoFator, FatorGlobal, Horizonte, MetricaModelo } from '../lib/tipos';
import { useDados } from '../lib/useDados';

const OPCOES_HORIZONTE: { valor: Horizonte; rotulo: string }[] = [
  { valor: '90d', rotulo: '90 dias' },
  { valor: '180d', rotulo: '180 dias' },
];

const COR_DIRECAO: Record<string, string> = { aumenta: SERIES[1], reduz: SERIES[0], misto: COR_NEUTRA };

function GraficoImportancia({ dados, horizonte }: { dados: FatorGlobal[]; horizonte: Horizonte }) {
  const linhas = useMemo(() => {
    const lista = dados
      .filter((d) => d.horizonte === horizonte)
      .map((d) => ({ ...d, importancia: num(d.importancia) ?? 0 }))
      .sort((a, b) => {
        const pa = num(a.posicao);
        const pb = num(b.posicao);
        if (pa !== null && pb !== null && pa !== pb) return pa - pb;
        return b.importancia - a.importancia;
      });
    const maximo = lista.reduce((m, d) => Math.max(m, d.importancia), 0);
    return lista.map((d) => ({ ...d, proporcao: maximo > 0 ? d.importancia / maximo : 0 }));
  }, [dados, horizonte]);

  if (linhas.length === 0) return <Vazio texto="Sem fatores para este horizonte." />;

  return (
    <div className="importancia">
      <div className="legenda-direcao" aria-label="Legenda das cores">
        <span>
          <span className="amostra" style={{ background: COR_DIRECAO.aumenta }} aria-hidden="true" /> aumenta o risco
        </span>
        <span>
          <span className="amostra" style={{ background: COR_DIRECAO.reduz }} aria-hidden="true" /> reduz o risco
        </span>
        <span>
          <span className="amostra" style={{ background: COR_DIRECAO.misto }} aria-hidden="true" /> efeito misto / não informado
        </span>
      </div>
      <ol className="lista-importancia">
        {linhas.map((d, i) => {
          const cor = COR_DIRECAO[d.direcao ?? 'misto'] ?? COR_NEUTRA;
          return (
            <li key={d.fator} title={`${d.rotulo || rotuloFator(d.fator)}: importância ${fmtNumero(d.importancia, 4)} (${rotulo(d.direcao, 'direção não informada')})`}>
              <span className="importancia-posicao num">{i + 1}</span>
              <span className="importancia-rotulo">{d.rotulo || rotuloFator(d.fator)}</span>
              <span className="importancia-barra" aria-hidden="true">
                <span className="importancia-preenchimento" style={{ width: `${Math.max(1.5, d.proporcao * 100)}%`, background: cor }} />
              </span>
              <span className="importancia-valor num">{fmtNumero(d.importancia, 3)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface GrupoEfeito {
  fator: string;
  rotulo: string;
  linhas: { categoria: string; n: number; taxa: number | null; risco: number | null }[];
}

function GradeEfeitos({ dados, horizonte, ordemFatores }: { dados: EfeitoFator[]; horizonte: Horizonte; ordemFatores: Map<string, number> }) {
  const grupos = useMemo<GrupoEfeito[]>(() => {
    const mapa = new Map<string, GrupoEfeito>();
    for (const d of dados) {
      if (d.horizonte !== horizonte) continue;
      let g = mapa.get(d.fator);
      if (!g) {
        g = { fator: d.fator, rotulo: d.rotulo_fator || rotuloFator(d.fator), linhas: [] };
        mapa.set(d.fator, g);
      }
      g.linhas.push({ categoria: d.categoria, n: num(d.n) ?? 0, taxa: num(d.taxa_real), risco: num(d.risco_medio) });
    }
    const ordenados = [...mapa.values()];
    for (const g of ordenados) {
      const ordemCategoria = new Map<string, number>();
      for (const d of dados) if (d.fator === g.fator && d.horizonte === horizonte && num(d.ordem) !== null) ordemCategoria.set(d.categoria, num(d.ordem) as number);
      g.linhas.sort((a, b) => {
        const oa = ordemCategoria.get(a.categoria);
        const ob = ordemCategoria.get(b.categoria);
        if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob;
        if (oa !== undefined && ob === undefined) return -1;
        if (oa === undefined && ob !== undefined) return 1;
        return comparadorTexto.compare(a.categoria, b.categoria);
      });
    }
    ordenados.sort((a, b) => (ordemFatores.get(a.fator) ?? 999) - (ordemFatores.get(b.fator) ?? 999) || comparadorTexto.compare(a.rotulo, b.rotulo));
    return ordenados;
  }, [dados, horizonte, ordemFatores]);

  if (grupos.length === 0) return <Vazio texto="Sem efeitos por categoria para este horizonte." />;

  return (
    <div className="grade-efeitos">
      {grupos.map((g) => {
        const linhas = g.linhas.map((l) => ({ ...l, rotuloCategoria: rotulo(l.categoria) }));
        const altura = Math.max(150, linhas.length * 30 + 56);
        return (
          <article key={g.fator} className="cartao-efeito">
            <h3>{g.rotulo}</h3>
            <ResponsiveContainer width="100%" height={altura}>
              <BarChart data={linhas} layout="vertical" margin={{ top: 2, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={1}>
                <CartesianGrid stroke={COR_GRADE} horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={fmtPctEixo}
                  tick={{ fontSize: 10, fill: ESTILO_TICK.fill }}
                  tickLine={false}
                  axisLine={{ stroke: COR_GRADE }}
                  domain={[0, (max: number) => Math.min(1, Math.max(0.1, Math.ceil(max * 10) / 10))]}
                />
                <YAxis type="category" dataKey="rotuloCategoria" width={104} tick={{ fontSize: 10, fill: ESTILO_TICK.fill }} tickLine={false} axisLine={false} interval={0} />
                <Tooltip
                  cursor={{ fill: 'rgba(31, 63, 143, 0.06)' }}
                  content={<TooltipGrafico formatarValor={(v) => fmtPct(v)} extra={(l) => <div>{fmtInteiro(l.n)} colaboradores na categoria</div>} />}
                />
                <Bar dataKey="taxa" name="Taxa real de saída" fill={SERIES[2]} maxBarSize={10} radius={[0, 3, 3, 0]} />
                <Bar dataKey="risco" name="Risco médio previsto" fill={SERIES[0]} maxBarSize={10} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </article>
        );
      })}
      <div className="legenda-direcao legenda-efeitos" aria-label="Legenda das séries">
        <span>
          <span className="amostra" style={{ background: SERIES[2] }} aria-hidden="true" /> taxa real de saída voluntária
        </span>
        <span>
          <span className="amostra" style={{ background: SERIES[0] }} aria-hidden="true" /> risco médio previsto
        </span>
      </div>
    </div>
  );
}

function TabelaMetricas({ dados, horizonte }: { dados: MetricaModelo[]; horizonte: Horizonte }) {
  const { modelos, metricas, valores, selecionado, taxaBase } = useMemo(() => {
    const doHorizonte = dados.filter((d) => d.horizonte === horizonte);
    const modelosSet = [...new Set(doHorizonte.map((d) => d.modelo))];
    const metricasSet = [...new Set(doHorizonte.map((d) => d.metrica))].filter((m) => !METRICAS_FORA_DA_TABELA.includes(m)).sort((a, b) => {
      const ia = ORDEM_METRICAS.indexOf(a);
      const ib = ORDEM_METRICAS.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || comparadorTexto.compare(a, b);
    });
    const mapa = new Map<string, number>();
    for (const d of doHorizonte) mapa.set(`${d.modelo}|${d.metrica}`, num(d.valor) ?? Number.NaN);
    const sel = doHorizonte.find((d) => d.selecionado)?.modelo ?? null;
    // Modelo selecionado primeiro; depois pela ordem canônica.
    const ordemModelos = ['regressao_logistica', 'random_forest', 'gradient_boosting', 'hist_gradient_boosting', 'xgboost'];
    modelosSet.sort((a, b) => {
      if (a === sel) return -1;
      if (b === sel) return 1;
      return (ordemModelos.indexOf(a) === -1 ? 999 : ordemModelos.indexOf(a)) - (ordemModelos.indexOf(b) === -1 ? 999 : ordemModelos.indexOf(b));
    });
    const taxaBase = num(doHorizonte.find((d) => d.metrica === 'taxa_base')?.valor);
    return { modelos: modelosSet, metricas: metricasSet, valores: mapa, selecionado: sel, taxaBase };
  }, [dados, horizonte]);

  if (modelos.length === 0) return <Vazio texto="Sem métricas para este horizonte." />;

  // Melhor valor por métrica (para destacar em negrito).
  const melhores = new Map<string, string>();
  for (const m of metricas) {
    const maiorMelhor = METRICAS[m]?.maiorMelhor ?? true;
    let melhorModelo: string | null = null;
    let melhorValor = Number.NaN;
    for (const mod of modelos) {
      const v = valores.get(`${mod}|${m}`);
      if (v === undefined || Number.isNaN(v)) continue;
      if (melhorModelo === null || (maiorMelhor ? v > melhorValor : v < melhorValor)) {
        melhorModelo = mod;
        melhorValor = v;
      }
    }
    if (melhorModelo) melhores.set(m, melhorModelo);
  }

  return (
    <>
      <p className="resumo-filtro">
        Modelo selecionado para {rotulo(horizonte)}: <strong>{selecionado ? rotuloModelo(selecionado) : 'não informado'}</strong>. Regra: maior AUC-ROC no teste
        temporal; a regressão logística é preferida quando fica a menos de 0,01 de AUC do melhor modelo (parcimônia e interpretabilidade). Em
        negrito, o melhor valor de cada métrica. Taxa de saída no teste: {fmtPct(taxaBase)}. O teste temporal não tem admissões de pico (ver Limitações).
      </p>
      <div className="tabela-rolagem">
        <table className="tabela tabela-metricas">
          <thead>
            <tr>
              <th scope="col">Modelo</th>
              {metricas.map((m) => (
                <th key={m} scope="col" className="num" title={METRICAS[m]?.explicacao}>
                  {rotuloMetrica(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modelos.map((mod) => (
              <tr key={mod} className={mod === selecionado ? 'linha-selecionada' : undefined}>
                <td>
                  {rotuloModelo(mod)}
                  {mod === selecionado && <span className="chip chip-selecionado">selecionado</span>}
                </td>
                {metricas.map((m) => {
                  const v = valores.get(`${mod}|${m}`);
                  const texto = v === undefined || Number.isNaN(v) ? '—' : fmtNumero(v, 3);
                  return (
                    <td key={m} className={`num${melhores.get(m) === mod ? ' melhor' : ''}`}>
                      {texto}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="lista-metricas">
        {metricas.map((m) => (
          <div key={m} className="definicao">
            <dt>{rotuloMetrica(m)}</dt>
            <dd>{METRICAS[m]?.explicacao ?? 'Métrica adicional exportada pelo pipeline.'}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function TabelaVies({ dados, horizonte }: { dados: AvaliacaoVies[]; horizonte: Horizonte }) {
  const grupos = useMemo(() => {
    const mapa = new Map<string, AvaliacaoVies[]>();
    for (const d of dados) {
      if (d.horizonte !== horizonte) continue;
      const lista = mapa.get(d.grupo_tipo) ?? [];
      lista.push(d);
      mapa.set(d.grupo_tipo, lista);
    }
    const ordem = ['faixa_etaria', 'regiao', 'escolaridade'];
    return [...mapa.entries()]
      .sort((a, b) => (ordem.indexOf(a[0]) === -1 ? 999 : ordem.indexOf(a[0])) - (ordem.indexOf(b[0]) === -1 ? 999 : ordem.indexOf(b[0])))
      .map(([tipo, linhas]) => ({ tipo, linhas: [...linhas].sort((a, b) => comparadorTexto.compare(a.grupo_valor, b.grupo_valor)) }));
  }, [dados, horizonte]);

  if (grupos.length === 0) return <Vazio texto="Sem auditoria de viés para este horizonte." />;

  return (
    <>
      <div className="tabela-rolagem">
        <table className="tabela tabela-vies">
          <thead>
            <tr>
              <th scope="col">Grupo</th>
              <th scope="col" className="num">
                n
              </th>
              <th scope="col" className="num" title="Proporção observada de saída voluntária no horizonte">
                Taxa real
              </th>
              <th scope="col" className="num" title="Média do risco previsto pelo modelo no grupo">
                Risco médio previsto
              </th>
              <th scope="col" className="num" title="Diferença entre risco previsto e taxa real (calibração)">
                Diferença
              </th>
              <th scope="col" className="num" title="Capacidade de discriminação dentro do grupo">
                AUC
              </th>
              <th scope="col" className="num" title="Proporção do grupo com risco ≥ 30% no horizonte">
                % alto risco
              </th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <GrupoVies key={g.tipo} tipo={g.tipo} linhas={g.linhas} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="nota-leitura">
        <strong>Como ler:</strong> a faixa etária não é usada como variável do modelo — ela entra apenas aqui, para verificar se o modelo trata os grupos de
        forma equivalente. Diferenças grandes entre taxa real e risco médio previsto (coluna "Diferença") indicam descalibração para o grupo; AUC
        muito menor em um grupo indica que o modelo discrimina pior nele; "% alto risco" muito acima da taxa real sugere excesso de alertas para
        o grupo. Qualquer desses sinais exige revisão com Gente & Gestão antes do uso.
        <br />
        <strong>O que esta auditoria encontrou:</strong> a faixa 55+ fica superestimada (90 dias: 13,0% previsto contra 8,1% real; 180 dias: 21,0% contra 15,3%), com excesso
        de alertas, e a faixa 18-24 fica subestimada nos dois horizontes. Tipo de contrato (Jovem Aprendiz) e canal (Programa Jovem) estão ligados à idade e funcionam como
        proxies. Ação: revisar com Gente & Gestão e avaliar recalibração por grupo na Sprint 2.
      </div>
    </>
  );
}

function GrupoVies({ tipo, linhas }: { tipo: string; linhas: AvaliacaoVies[] }) {
  return (
    <>
      <tr className="linha-grupo">
        <th scope="rowgroup" colSpan={7}>
          {rotulo(tipo)}
        </th>
      </tr>
      {linhas.map((l) => {
        const taxa = num(l.taxa_real);
        const previsto = num(l.risco_medio_previsto);
        const diferenca = taxa !== null && previsto !== null ? previsto - taxa : null;
        const alerta = diferenca !== null && Math.abs(diferenca) >= 0.05;
        const pontos = diferenca === null ? 0 : Math.round(diferenca * 1000) / 10;
        return (
          <tr key={l.grupo_valor}>
            <td>{rotulo(l.grupo_valor)}</td>
            <td className="num">{fmtInteiro(l.n)}</td>
            <td className="num">{fmtPct(taxa)}</td>
            <td className="num">{fmtPct(previsto)}</td>
            <td className={`num${alerta ? ' valor-alerta' : ''}`} title={alerta ? 'Diferença de 5 p.p. ou mais: revisar calibração para o grupo' : undefined}>
              {diferenca === null ? '—' : `${pontos > 0 ? '+' : ''}${fmtNumero(pontos === 0 ? 0 : pontos, 1)} p.p.`}
            </td>
            <td className="num">{fmtNumero(l.auc, 3)}</td>
            <td className="num">{fmtPct(l.taxa_alto_risco)}</td>
          </tr>
        );
      })}
    </>
  );
}

function Limitacoes() {
  return (
    <ul className="lista-limitacoes">
      <li>
        <strong>Dados sintéticos.</strong> O MVP usa uma base gerada com distribuições plausíveis para o varejo brasileiro; nenhum dado real da Ri Happy foi
        utilizado. Os resultados demonstram o método, não a realidade da empresa.
      </li>
      <li>
        <strong>Score no checkpoint de 30 dias.</strong> O risco é calculado uma única vez, no fim da integração, com os sinais disponíveis até então. Mudanças
        posteriores (novas faltas, troca de gestor) só entram em um rescoring, previsto na evolução.
      </li>
      <li>
        <strong>Horizonte de 90 dias vencido.</strong> Quem já passou do dia 90 não pode mais realizar o evento "saída até o dia 90". Para essas pessoas, o nível usa o risco
        residual até o dia 180, condicional a ter chegado ao dia 90, e os fatores vêm do modelo de 180 dias. O risco não é reestimado com dados posteriores ao dia 30.
      </li>
      <li>
        <strong>Teste temporal sem picos.</strong> O teste (admissões de 2026 com janela completa) só tem admissões de janeiro a agosto, sem nenhum pico. Uma validação
        retroativa (treino até 2024, teste em 2025) dá AUC de 0,819 nas admissões de pico e 0,827 fora delas, em 90 dias.
      </li>
      <li>
        <strong>Indicador de turnover da loja é proxy.</strong> A variável do modelo é uma base latente da loja com ruído individual, não o turnover realizado mostrado no
        Mapa de Risco; por isso os dois valores diferem.
      </li>
      <li>
        <strong>Calibração.</strong> Em 90 dias, as faixas Médio e Alto ficam superestimadas no teste; os limiares são faixas de priorização, não probabilidades exatas.
      </li>
      <li>
        <strong>Saída involuntária como rótulo 0.</strong> Desligamentos involuntários e fins de contrato temporário antes do horizonte são tratados como "não
        saiu voluntariamente" (risco competitivo), o que pode subestimar a propensão de alguns perfis.
      </li>
      <li>
        <strong>Necessidade de recalibração com dados reais.</strong> Coeficientes, limiares de nível, importâncias e auditoria de viés devem ser recalculados
        e validados com a base real, com revisão periódica (deriva do modelo) antes de qualquer uso operacional.
      </li>
      <li>
        <strong>Correlação, não causa.</strong> Os fatores explicam a predição; a ação de retenção deve ser confirmada na conversa com o colaborador.
      </li>
    </ul>
  );
}

export function FatoresEModelo() {
  const [horizonte, setHorizonte] = useState<Horizonte>('90d');
  const fatores = useDados('fatores_globais');
  const efeitos = useDados('efeito_fator');
  const metricas = useDados('metricas_modelo');
  const vies = useDados('avaliacao_vies');

  const ordemFatores = useMemo(() => {
    const mapa = new Map<string, number>();
    (fatores.dados ?? [])
      .filter((f) => f.horizonte === horizonte)
      .forEach((f, i) => mapa.set(f.fator, num(f.posicao) ?? i + 1));
    return mapa;
  }, [fatores.dados, horizonte]);

  const seletor = <Segmentado rotulo="Horizonte de previsão" valor={horizonte} opcoes={OPCOES_HORIZONTE} aoMudar={setHorizonte} />;

  return (
    <>
      <div className="barra-horizonte">
        <span>Horizonte de previsão</span>
        {seletor}
      </div>
      <Secao
        titulo="Importância global dos fatores"
        descricao="Média do valor absoluto da contribuição por variável, no estilo SHAP (linear na regressão logística): quanto maior, mais o fator pesa nas predições. A cor indica a direção predominante."
        id="importancia"
      >
        <ComDados estado={fatores}>{(dados) => <GraficoImportancia dados={dados} horizonte={horizonte} />}</ComDados>
      </Secao>
      <Secao
        titulo="Efeito por categoria"
        descricao="Para cada fator, a taxa real de saída voluntária e o risco médio previsto por categoria. Barras próximas indicam boa calibração."
        id="efeitos"
      >
        <ComDados estado={efeitos}>{(dados) => <GradeEfeitos dados={dados} horizonte={horizonte} ordemFatores={ordemFatores} />}</ComDados>
      </Secao>
      <Secao
        titulo="Métricas dos modelos comparados"
        descricao="Regressão logística, random forest, gradient boosting e XGBoost avaliados no teste temporal (admissões de 2026 com janela completa)."
        id="metricas"
      >
        <ComDados estado={metricas}>{(dados) => <TabelaMetricas dados={dados} horizonte={horizonte} />}</ComDados>
      </Secao>
      <Secao
        titulo="Auditoria de viés"
        descricao="Comparação do comportamento do modelo entre grupos (faixa etária, região, escolaridade). Atributos protegidos não são preditores."
        id="vies"
      >
        <ComDados estado={vies}>{(dados) => <TabelaVies dados={dados} horizonte={horizonte} />}</ComDados>
      </Secao>
      <Secao titulo="Limitações" descricao="O que este MVP não captura e o que precisa ser revisto antes do uso com dados reais." id="limitacoes">
        <Limitacoes />
      </Secao>
    </>
  );
}
