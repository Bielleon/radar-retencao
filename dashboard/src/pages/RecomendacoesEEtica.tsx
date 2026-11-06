import { useEffect, useMemo, useState } from 'react';
import { ChipNivel } from '../components/Chips';
import { ComDados } from '../components/Estado';
import { Secao } from '../components/Secao';
import { fmtDias, fmtInteiro, fmtMoeda, fmtPct, num } from '../lib/formato';
import { NIVEIS } from '../lib/niveis';
import { rotuloFator } from '../lib/rotulos';
import type { Kpis, ParametroCusto, Recomendacao } from '../lib/tipos';
import { useDados } from '../lib/useDados';

function Playbook({ regras }: { regras: Recomendacao[] }) {
  const porNivel = useMemo(
    () => regras.filter((r) => r.fator === 'nivel').sort((a, b) => NIVEIS.indexOf(b.nivel_minimo ?? 'Baixo') - NIVEIS.indexOf(a.nivel_minimo ?? 'Baixo')),
    [regras],
  );
  const porFator = useMemo(() => regras.filter((r) => r.fator !== 'nivel').sort((a, b) => (num(a.id) ?? 0) - (num(b.id) ?? 0)), [regras]);

  return (
    <div className="playbook">
      <h3>Por nível de risco</h3>
      <p className="texto-apoio">A ação do nível é sempre aplicada; a ação recomendada de cada colaborador soma a ela a ação do fator principal.</p>
      <div className="tabela-rolagem">
        <table className="tabela tabela-playbook">
          <thead>
            <tr>
              <th scope="col">Nível</th>
              <th scope="col">Ação</th>
              <th scope="col">Responsável</th>
              <th scope="col" className="num">
                Prazo
              </th>
            </tr>
          </thead>
          <tbody>
            {porNivel.map((r) => (
              <tr key={r.id}>
                <td>
                  <ChipNivel nivel={r.nivel_minimo} />
                </td>
                <td>{r.acao}</td>
                <td>{r.responsavel ?? '—'}</td>
                <td className="num">{fmtDias(r.prazo_dias)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Por fator</h3>
      <p className="texto-apoio">Disparada quando o fator está entre os principais do colaborador (ou do cenário simulado), aumenta o risco e o gatilho é verdadeiro.</p>
      <div className="tabela-rolagem">
        <table className="tabela tabela-playbook">
          <thead>
            <tr>
              <th scope="col">Gatilho</th>
              <th scope="col">Ação</th>
              <th scope="col">Responsável</th>
              <th scope="col" className="num">
                Prazo
              </th>
              <th scope="col">Nível mínimo</th>
            </tr>
          </thead>
          <tbody>
            {porFator.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.rotulo_fator || rotuloFator(r.fator)}</strong>
                </td>
                <td>{r.acao}</td>
                <td>{r.responsavel ?? '—'}</td>
                <td className="num">{fmtDias(r.prazo_dias)}</td>
                <td>{r.nivel_minimo ? <ChipNivel nivel={r.nivel_minimo} /> : <span className="texto-apoio">qualquer</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const REDUCAO_PADRAO = 15;

function SimulacaoEconomia({ custos, kpis }: { custos: ParametroCusto[]; kpis: Kpis | null }) {
  const [valores, setValores] = useState<Record<string, number>>({});
  const [reducao, setReducao] = useState<number>(REDUCAO_PADRAO);

  useEffect(() => {
    setValores(Object.fromEntries(custos.map((c) => [c.chave, num(c.valor) ?? 0])));
  }, [custos]);

  const totalOriginal = custos.reduce((s, c) => s + (num(c.valor) ?? 0), 0);
  const total = custos.reduce((s, c) => s + (valores[c.chave] ?? num(c.valor) ?? 0), 0);
  const editado = custos.some((c) => (valores[c.chave] ?? num(c.valor) ?? 0) !== (num(c.valor) ?? 0));
  const precoces = num(kpis?.deslig_vol_precoces_12m);
  const fracao = reducao / 100;
  const evitadas = precoces === null ? null : precoces * fracao;
  const economia = precoces === null ? null : precoces * total * fracao;
  const custoAtual = precoces === null ? null : precoces * total;

  return (
    <div className="economia">
      <div className="economia-parametros">
        <h3>Parâmetros de custo por desligamento precoce</h3>
        <p className="texto-apoio">Valores ilustrativos (seção 8 da especificação), editáveis para simulação; a edição não altera o banco.</p>
        <div className="tabela-rolagem">
          <table className="tabela tabela-custos">
            <thead>
              <tr>
                <th scope="col">Componente</th>
                <th scope="col">Descrição</th>
                <th scope="col" className="num">
                  Valor (R$)
                </th>
              </tr>
            </thead>
            <tbody>
              {custos.map((c) => (
                <tr key={c.chave}>
                  <td>
                    <strong>{c.rotulo}</strong>
                    {c.fonte && <span className="texto-apoio"> · {c.fonte}</span>}
                  </td>
                  <td className="celula-descricao">{c.descricao ?? '—'}</td>
                  <td className="num">
                    <input
                      type="number"
                      className="entrada-numero entrada-moeda"
                      min={0}
                      step={50}
                      value={valores[c.chave] ?? num(c.valor) ?? 0}
                      onChange={(e) => {
                        const n = num(e.target.value);
                        setValores((v) => ({ ...v, [c.chave]: n === null ? 0 : Math.max(0, n) }));
                      }}
                      aria-label={`Valor de ${c.rotulo}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>
                  Total por desligamento precoce
                  {editado && <span className="texto-apoio"> (original: {fmtMoeda(totalOriginal)})</span>}
                </th>
                <td className="num">
                  <strong>{fmtMoeda(total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {editado && (
          <button
            type="button"
            className="botao botao-secundario"
            onClick={() => setValores(Object.fromEntries(custos.map((c) => [c.chave, num(c.valor) ?? 0])))}
          >
            Restaurar valores originais
          </button>
        )}
      </div>

      <div className="economia-simulacao">
        <h3>Economia anual com retenção</h3>
        <label className="campo campo-reducao" htmlFor="reducao">
          <span className="campo-rotulo">Redução esperada de saídas precoces (%)</span>
          <div className="campo-sim-controles">
            <input id="reducao" type="range" min={0} max={50} step={1} value={reducao} onChange={(e) => setReducao(Number(e.target.value))} />
            <input
              type="number"
              className="entrada-numero"
              min={0}
              max={50}
              step={1}
              value={reducao}
              onChange={(e) => {
                const n = num(e.target.value);
                if (n !== null) setReducao(Math.max(0, Math.min(50, n)));
              }}
              aria-label="Redução esperada (%)"
            />
          </div>
        </label>
        <dl className="lista-definicoes lista-economia">
          <div className="definicao">
            <dt>Saídas voluntárias precoces (12 meses)</dt>
            <dd className="num">{fmtInteiro(precoces)}</dd>
          </div>
          <div className="definicao">
            <dt>Custo atual estimado (12 meses)</dt>
            <dd className="num">{fmtMoeda(custoAtual)}</dd>
          </div>
          <div className="definicao">
            <dt>Saídas evitadas com redução de {fmtPct(fracao, 0)}</dt>
            <dd className="num">{evitadas === null ? '—' : fmtInteiro(Math.round(evitadas))}</dd>
          </div>
          <div className="definicao destaque-economia">
            <dt>Economia anual estimada</dt>
            <dd className="num">{fmtMoeda(economia)}</dd>
          </div>
        </dl>
        <p className="texto-apoio">
          Economia = saídas precoces (12 meses) × custo por desligamento × redução esperada. Premissa ilustrativa: inclui produtividade perdida na curva de
          aprendizado; não considera o custo das ações de retenção nem efeitos sobre clima e vendas. Cerca de 31% dessas saídas ocorrem até o dia 30, antes de existir
          score, e dependem de outras ações.
        </p>
      </div>
    </div>
  );
}

function Etica() {
  return (
    <div className="etica">
      <div className="aviso aviso-etica" role="note">
        O score <strong>nunca</strong> é usado para penalizar, demitir ou reduzir oportunidades; apoia conversas de acolhimento e ações de retenção
        conduzidas por pessoas.
      </div>
      <ul className="lista-principios">
        <li>
          <strong>Dados sintéticos no MVP.</strong> Esta etapa usa somente dados sintéticos; os dados de RH disponibilizados pela Ri Happy serão usados só para fins acadêmicos e não
          serão versionados. Na operação real: pseudonimização dos IDs, minimização de campos, base legal (legítimo interesse com teste
          de balanceamento), finalidade exclusiva de retenção e melhoria do ambiente, retenção limitada dos scores e acesso por perfil.
        </li>
        <li>
          <strong>Nenhum atributo protegido como preditor.</strong> Idade, gênero, raça e saúde não entram no modelo; a auditoria de viés por faixa etária e
          região é publicada no dashboard (aba Fatores e Modelo), com seus achados. Tipo de contrato (Jovem Aprendiz) e canal (Programa Jovem) estão ligados à idade e são
          tratados como proxies.
        </li>
        <li>
          <strong>Decisão humana.</strong> O modelo prioriza conversas; quem decide e age é o líder com o apoio de Gente &amp; Gestão. Nenhuma ação automática é
          tomada a partir do score, e ele não deve ser apresentado ao colaborador como "nota".
        </li>
        <li>
          <strong>Transparência.</strong> Fatores explicados em linguagem simples, metodologia, métricas e limitações declaradas; o colaborador pode pedir
          explicação sobre o tratamento dos seus dados.
        </li>
        <li>
          <strong>LGPD (Lei 13.709/2018), requisitos da operação real.</strong> Finalidade e adequação, necessidade (minimização), segurança (pseudonimização, acesso por
          perfil, credenciais fora do repositório e do site), prevenção e não discriminação, direitos do titular e retenção limitada (scores descartados após 180 dias de casa).
          Este protótipo é aberto, sem autenticação, porque só contém dados sintéticos.
        </li>
        <li>
          <strong>Governança sugerida.</strong> Comitê de people analytics (RH, Jurídico/DPO, Operações) aprova finalidade e variáveis; recalibração trimestral;
          revisão semestral da auditoria de viés; treinamento dos líderes para conduzir conversas de retenção a partir dos fatores.
        </li>
      </ul>
    </div>
  );
}

export function RecomendacoesEEtica() {
  const recomendacoes = useDados('recomendacoes');
  const custos = useDados('parametros_custo');
  const kpis = useDados('kpis');

  return (
    <>
      <Secao
        titulo="Playbook de retenção"
        descricao="Regras que transformam nível de risco e fatores em ações preventivas, com responsável e prazo (seção 7 da especificação)."
        id="playbook"
      >
        <ComDados estado={recomendacoes}>{(dados) => <Playbook regras={dados} />}</ComDados>
      </Secao>
      <Secao
        titulo="Custo do turnover precoce e economia com retenção"
        descricao="Parâmetros de custo por desligamento e simulação da economia anual ao reduzir as saídas precoces."
        id="custo-economia"
      >
        <ComDados estado={custos}>{(dados) => <SimulacaoEconomia custos={dados} kpis={kpis.dados?.[0] ?? null} />}</ComDados>
      </Secao>
      <Secao titulo="Ética, privacidade e LGPD" descricao="Princípios de uso responsável do Radar de Retenção (seção 9 da especificação)." id="etica">
        <Etica />
      </Secao>
    </>
  );
}
