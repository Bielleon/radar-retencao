import { CartaoKpi } from '../components/CartaoKpi';
import { ComDados } from '../components/Estado';
import { GraficoMotivos } from '../components/GraficoMotivos';
import { GraficoSobrevivencia } from '../components/GraficoSobrevivencia';
import { GraficoTendencia } from '../components/GraficoTendencia';
import { Secao } from '../components/Secao';
import { fmtInteiro, fmtMoeda, fmtPct, num } from '../lib/formato';
import type { CurvaSobrevivencia, Kpis, ParametroCusto } from '../lib/tipos';
import { useDados } from '../lib/useDados';

function CartoesKpi({ kpis }: { kpis: Kpis }) {
  const pctAlto = num(kpis.pct_alto_risco);
  const nAlto = num(kpis.n_alto_risco) ?? 0;
  const precoces = num(kpis.deslig_vol_precoces_12m) ?? 0;
  const total = num(kpis.deslig_vol_12m) ?? 0;
  return (
    <div className="grade-kpi">
      <CartaoKpi
        titulo="Headcount ativo"
        valor={fmtInteiro(kpis.headcount_ativo)}
        detalhe="colaboradores operacionais de loja ativos na data de referência"
        dica="Total de colaboradores operacionais de loja com status Ativo."
      />
      <CartaoKpi
        titulo="Ativos em janela de risco"
        valor={fmtInteiro(kpis.ativos_em_janela)}
        detalhe="entre 30 e 180 dias de casa, com score calculado no checkpoint"
        dica="População escorada: ativos com 30 a 180 dias de casa."
      />
      <CartaoKpi
        titulo="Em risco alto ou crítico"
        valor={
          <>
            {fmtInteiro(nAlto)} <span className="kpi-secundario">({fmtPct(pctAlto)})</span>
          </>
        }
        detalhe={`${fmtInteiro(kpis.n_critico)} em nível crítico · ${fmtPct(pctAlto)} dos ativos em janela`}
        dica="Risco vigente ≥ 30% (Alto) ou ≥ 45% (Crítico). Até o dia 90 vale o risco de 90 dias; depois dele, o risco residual até o dia 180, condicional a ter chegado ao dia 90."
        tom={pctAlto !== null && pctAlto >= 0.3 ? 'critico' : nAlto > 0 ? 'atencao' : 'neutro'}
      />
      <CartaoKpi
        titulo="Saída voluntária até 90 dias"
        valor={fmtPct(kpis.taxa_saida_vol_90d)}
        detalhe="todos os admitidos com janela completa; inclui saídas antes do dia 30"
        dica="Admitidos até a referência − 90 dias que saíram voluntariamente com até 90 dias de casa. Inclui quem saiu antes do dia 30; entre quem passou do dia 30, população do modelo, a taxa é menor (15,5%)."
      />
      <CartaoKpi
        titulo="Saída voluntária até 180 dias"
        valor={fmtPct(kpis.taxa_saida_vol_180d)}
        detalhe="todos os admitidos com janela completa; inclui saídas antes do dia 30"
        dica="Admitidos até a referência − 180 dias que saíram voluntariamente com até 180 dias de casa. Inclui quem saiu antes do dia 30; entre quem passou do dia 30, população do modelo, a taxa é menor (25,7%)."
      />
      <CartaoKpi
        titulo="Desligamentos voluntários (12 meses)"
        valor={
          <>
            {fmtInteiro(total)} <span className="kpi-secundario">({fmtInteiro(precoces)} precoces)</span>
          </>
        }
        detalhe={`${fmtPct(total > 0 ? precoces / total : null)} com até 180 dias de casa · ${fmtInteiro(kpis.deslig_invol_12m)} involuntários`}
        dica="Saídas voluntárias nos 12 meses anteriores à referência; precoces = até 180 dias de casa."
      />
      <CartaoKpi
        titulo="Custo estimado (12 meses)"
        valor={fmtMoeda(kpis.custo_estimado_12m)}
        detalhe={`${fmtInteiro(precoces)} saídas precoces × ${fmtMoeda(kpis.custo_por_desligamento)} por desligamento`}
        dica="Premissa ilustrativa de custo por desligamento precoce (ver parâmetros de custo)."
        tom="destaque"
      />
      <CartaoKpi
        titulo="Novos aguardando checkpoint"
        valor={fmtInteiro(kpis.novos_sem_checkpoint)}
        detalhe="admitidos com menos de 30 dias; recebem score ao concluir a integração"
        dica="Ainda sem score: o checkpoint de predição é o dia 30 de casa."
      />
    </div>
  );
}

function CartaoCusto({ kpis, custos }: { kpis: Kpis | null; custos: ParametroCusto[] | null }) {
  const totalParametros = custos ? custos.reduce((s, c) => s + (num(c.valor) ?? 0), 0) : null;
  const custoUnitario = num(kpis?.custo_por_desligamento) ?? totalParametros;
  return (
    <div className="cartao-custo">
      <p className="cartao-custo-valor">
        {fmtMoeda(custoUnitario)} <span className="cartao-custo-unidade">por desligamento precoce</span>
      </p>
      <p className="cartao-custo-texto">
        Premissa ilustrativa (seção 8 da especificação), a validar com a Ri Happy. O custo estimado de 12 meses multiplica as saídas voluntárias
        precoces (até 180 dias de casa) por este valor.
      </p>
      {custos && custos.length > 0 && (
        <ul className="lista-custos">
          {[...custos]
            .sort((a, b) => (num(b.valor) ?? 0) - (num(a.valor) ?? 0))
            .map((c) => (
              <li key={c.chave} title={c.descricao ?? undefined}>
                <span>{c.rotulo}</span>
                <strong className="num">{fmtMoeda(c.valor)}</strong>
              </li>
            ))}
          <li className="lista-custos-total">
            <span>Total</span>
            <strong className="num">{fmtMoeda(totalParametros)}</strong>
          </li>
        </ul>
      )}
      <a className="link" href="#/recomendacoes-e-etica">
        Ajustar parâmetros e simular a economia com retenção →
      </a>
    </div>
  );
}

interface Referencia {
  id: number;
  texto: string;
  fonte: string;
  url: string | null;
}

const REFERENCIAS: Referencia[] = [
  {
    id: 1,
    texto: 'Rotatividade anual de 60,3% no varejo da capital paulista em 2025',
    fonte: 'Sindilojas-SP, base Novo Caged',
    url: 'https://sindilojas-sp.org.br/turnover-nas-empresas-do-varejo-paulistano-bate-recorde-em-2025/',
  },
  {
    id: 2,
    texto: 'No comércio, 29,3% dos desligamentos ocorrem com menos de 3 meses de casa e 43,0% com menos de 6 meses',
    fonte: 'DIEESE, RAIS 2014',
    url: 'https://www.dieese.org.br/livro/2016/rotatividade2016.pdf',
  },
  {
    id: 3,
    texto: '112,6 mil vagas temporárias projetadas para o Natal 2025, com efetivação estimada de 11%',
    fonte: 'CNC',
    url: 'https://portaldocomercio.org.br/acoes-institucionais/natal-2025-varejo-projeta-maior-volume-de-vendas-dos-ultimos-10-anos-2/',
  },
  {
    id: 4,
    texto: 'Custo de substituição estimado em 33% do salário anual',
    fonte: 'Work Institute, 2025 Retention Report',
    url: 'https://info.workinstitute.com/hubfs/2025%20Retention%20Report/2025%20Retention%20Report%20-%20Employee%20Retention%20Truths%20in%20Todays%20Workplace.pdf',
  },
];

/** Compara a projeção da CNC (fato 3) com a saída de temporários na base sintética, sem projetar números para o setor. */
function fraseCnc(curva: CurvaSobrevivencia[] | null): string | null {
  const ponto = curva?.find((c) => c.segmento_tipo === 'tipo_contrato' && c.segmento_valor === 'Temporario Sazonal' && num(c.dia) === 90);
  const permanencia = num(ponto?.prob_permanencia);
  if (permanencia === null) return null;
  return (
    `A CNC projeta 12,1 mil efetivações (11%) entre as 112,6 mil vagas temporárias do varejo nacional no Natal de 2025. Na base sintética deste protótipo, ` +
    `a saída voluntária de temporários até o dia 90 é estimada em ${fmtPct(1 - permanencia, 0)} (Kaplan-Meier). Os dois números não são comparáveis nem formam uma ` +
    `projeção para o setor; juntos, indicam por que reter quem já foi treinado para o pico merece atenção.`
  );
}

function fraseDieese(kpis: Kpis | null): string | null {
  const total = num(kpis?.deslig_vol_12m);
  const precoces = num(kpis?.deslig_vol_precoces_12m);
  if (total === null || precoces === null || total <= 0) return null;
  return (
    `Nesta base, ${fmtPct(precoces / total)} dos desligamentos voluntários dos últimos 12 meses ocorreram com até 180 dias de casa ` +
    `(DIEESE: 43,0% de todos os desligamentos do comércio em 2014 ocorreram com menos de 6 meses). Os universos são diferentes, voluntários em uma base sintética em crescimento contra o total de desligamentos, então a comparação é apenas de ordem de grandeza.`
  );
}

function fraseSindilojas(kpis: Kpis | null): string | null {
  const total = num(kpis?.deslig_vol_12m);
  const headcount = num(kpis?.headcount_ativo);
  if (total === null || headcount === null || headcount <= 0) return null;
  return (
    `A rotatividade voluntária anual aproximada desta base sintética é de ${fmtPct(total / headcount)} (saídas voluntárias em 12 meses ÷ headcount ativo). ` +
    `O varejo paulistano registrou 60,3% de rotatividade total em 2025, com outro universo e outra definição.`
  );
}

function Referencias({ kpis, curva }: { kpis: Kpis | null; curva: CurvaSobrevivencia[] | null }) {
  const frases = [fraseCnc(curva), fraseDieese(kpis), fraseSindilojas(kpis)].filter((f): f is string => f !== null);
  return (
    <div className="referencias">
      <ol className="lista-referencias">
        {REFERENCIAS.map((r) => (
          <li key={r.id}>
            <p className="referencia-texto">{r.texto}</p>
            <p className="referencia-fonte">
              {r.url ? (
                <a className="link" href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.fonte}
                </a>
              ) : (
                r.fonte
              )}
            </p>
          </li>
        ))}
      </ol>
      {frases.length > 0 && (
        <div className="leitura-radar">
          <h3>Leitura para o Radar</h3>
          {frases.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function VisaoGeral() {
  const kpis = useDados('kpis');
  const mensal = useDados('turnover_mensal');
  const curva = useDados('curva_sobrevivencia');
  const motivos = useDados('motivos_saida');
  const custos = useDados('parametros_custo');
  const kpisLinha = kpis.dados?.[0] ?? null;

  return (
    <>
      <Secao titulo="Indicadores executivos" descricao="Situação na data de referência e histórico dos últimos 12 meses." id="kpis">
        <ComDados estado={kpis} textoVazio="A view de KPIs não retornou linhas.">
          {(linhas) => <CartoesKpi kpis={linhas[0]} />}
        </ComDados>
      </Secao>

      <div className="grade-2">
        <Secao
          titulo="Tendência mensal"
          descricao="Admissões, saídas voluntárias e taxa de turnover voluntário por mês, com os picos sazonais destacados."
          id="tendencia"
        >
          <ComDados estado={mensal}>{(dados) => <GraficoTendencia dados={dados} />}</ComDados>
        </Secao>
        <Secao
          titulo="Curva de sobrevivência (Kaplan-Meier)"
          descricao="Probabilidade de permanência ao longo do primeiro ano, geral e por tipo de contrato."
          id="sobrevivencia"
        >
          <ComDados estado={curva}>{(dados) => <GraficoSobrevivencia dados={dados} />}</ComDados>
        </Secao>
      </div>

      <div className="grade-2">
        <Secao
          titulo="Motivos declarados de saída"
          descricao="Desligamentos voluntários dos últimos 12 meses, por motivo e tempo de casa."
          id="motivos"
        >
          <ComDados estado={motivos}>{(dados) => <GraficoMotivos dados={dados} />}</ComDados>
        </Secao>
        <Secao titulo="Premissa de custo por desligamento" descricao="Base do cálculo do custo estimado do turnover precoce." id="custo">
          <CartaoCusto kpis={kpisLinha} custos={custos.dados} />
        </Secao>
      </div>

      <Secao
        titulo="Referências de mercado"
        descricao="Fatos públicos que contextualizam o problema; a leitura abaixo compara os fatos com os indicadores desta base."
        id="referencias"
      >
        <Referencias kpis={kpisLinha} curva={curva.dados} />
      </Secao>
    </>
  );
}
