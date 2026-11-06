import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { BarraRisco } from '../components/BarraRisco';
import { CampoBusca, CampoSelecao, type Opcao } from '../components/Campos';
import { ChipFator, ChipNivel, classeDirecao, setaDirecao, valorFator } from '../components/Chips';
import { ComDados, Vazio } from '../components/Estado';
import { Paginacao } from '../components/Paginacao';
import { Painel } from '../components/Painel';
import { Secao } from '../components/Secao';
import { comparadorTexto, fmtData, fmtDias, fmtInteiro, fmtNumeroCompacto, fmtPct, num } from '../lib/formato';
import { NIVEIS, coresNivel, indiceNivel, riscoVigente } from '../lib/niveis';
import { rotulo } from '../lib/rotulos';
import type { ColaboradorRisco, FatorTop } from '../lib/tipos';
import { useDados } from '../lib/useDados';

const POR_PAGINA = 25;

type ChaveOrdem = 'risco_vigente' | 'risco_90d' | 'risco_180d' | 'dias_de_casa' | 'colaborador_id' | 'loja_id' | 'cargo' | 'nivel_risco';
type Direcao = 'asc' | 'desc';

interface Filtros {
  nivel: string;
  regiao: string;
  loja: string;
  cargo: string;
  contrato: string;
  busca: string;
}

const FILTROS_INICIAIS: Filtros = { nivel: '', regiao: '', loja: '', cargo: '', contrato: '', busca: '' };

const AVISO_ETICO = 'Este score apoia conversas de acolhimento e retenção. Não deve ser usado para punir ou desligar colaboradores.';

function opcoesDe(valores: Iterable<string | null | undefined>): Opcao[] {
  const unicos = [...new Set([...valores].filter((v): v is string => typeof v === 'string' && v !== ''))];
  unicos.sort((a, b) => comparadorTexto.compare(rotulo(a), rotulo(b)));
  return unicos.map((v) => ({ valor: v, rotulo: rotulo(v) }));
}

function fatoresDe(c: ColaboradorRisco): FatorTop[] {
  const lista: unknown = c.fatores_top;
  if (Array.isArray(lista)) return (lista as FatorTop[]).filter((f) => f && typeof f === 'object');
  if (typeof lista === 'string') {
    try {
      const json: unknown = JSON.parse(lista);
      return Array.isArray(json) ? (json as FatorTop[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function vigente(c: ColaboradorRisco): number | null {
  return riscoVigente(num(c.risco_90d), num(c.risco_180d), num(c.dias_de_casa));
}

function comparar(a: ColaboradorRisco, b: ColaboradorRisco, chave: ChaveOrdem, direcao: Direcao): number {
  const sinal = direcao === 'asc' ? 1 : -1;
  if (chave === 'nivel_risco') {
    const d = indiceNivel(a.nivel_risco) - indiceNivel(b.nivel_risco);
    return d !== 0 ? sinal * d : (vigente(b) ?? 0) - (vigente(a) ?? 0);
  }
  if (chave === 'risco_vigente') {
    return sinal * ((vigente(a) ?? -1) - (vigente(b) ?? -1));
  }
  if (chave === 'colaborador_id' || chave === 'loja_id' || chave === 'cargo') {
    return sinal * comparadorTexto.compare(String(a[chave] ?? ''), String(b[chave] ?? ''));
  }
  const na = num(a[chave]);
  const nb = num(b[chave]);
  if (na === null && nb === null) return 0;
  if (na === null) return 1;
  if (nb === null) return -1;
  return sinal * (na - nb);
}

interface Coluna {
  chave?: ChaveOrdem;
  rotulo: string;
  numerica?: boolean;
  dica?: string;
}

const COLUNAS: Coluna[] = [
  { chave: 'colaborador_id', rotulo: 'ID' },
  { chave: 'nivel_risco', rotulo: 'Nível', dica: 'Calculado sobre o risco vigente' },
  { chave: 'risco_vigente', rotulo: 'Risco vigente', dica: 'Até o dia 90, risco de 90 dias; depois dele, risco residual até o dia 180, condicional a ter chegado ao dia 90' },
  { chave: 'dias_de_casa', rotulo: 'Dias de casa', numerica: true },
  { chave: 'risco_90d', rotulo: 'Risco 90d (dia 30)', numerica: true, dica: 'Estimado no dia 30: probabilidade de saída voluntária até o dia 90. Para quem passou do dia 90, o horizonte já venceu.' },
  { chave: 'risco_180d', rotulo: 'Risco 180d (dia 30)', numerica: true, dica: 'Estimado no dia 30: probabilidade de saída voluntária até o dia 180' },
  { chave: 'loja_id', rotulo: 'Loja' },
  { chave: 'cargo', rotulo: 'Cargo' },
  { rotulo: 'Contrato' },
  { rotulo: 'Principais fatores', dica: '↑ aumenta o risco · ↓ reduz o risco' },
  { rotulo: 'Ação recomendada' },
];

function Definicao({ termo, children }: { termo: string; children: ReactNode }) {
  return (
    <div className="definicao">
      <dt>{termo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DetalheColaborador({ c }: { c: ColaboradorRisco }) {
  const fatores = fatoresDe(c);
  const recomendacoes = useDados('recomendacoes');
  const acoes = (c.acao_recomendada ?? 'Acompanhamento padrão de integração').split(' | ');
  const horizonteVencido = (num(c.dias_de_casa) ?? 0) > 90;
  return (
    <div className="detalhe-colaborador">
      <div className="aviso aviso-etica" role="note">
        {AVISO_ETICO}
      </div>

      <section className="detalhe-bloco">
        <h3>Risco previsto no checkpoint de 30 dias</h3>
        <div className="detalhe-riscos">
          <div>
            <span className="detalhe-rotulo">Risco 90 dias{horizonteVencido && ' (horizonte vencido)'}</span>
            <BarraRisco valor={num(c.risco_90d)} />
          </div>
          <div>
            <span className="detalhe-rotulo">Risco 180 dias</span>
            <BarraRisco valor={num(c.risco_180d)} />
          </div>
          <div>
            <span className="detalhe-rotulo">Risco vigente</span>
            <BarraRisco valor={vigente(c)} nivel={c.nivel_risco} />
          </div>
          <div>
            <span className="detalhe-rotulo">Nível (sobre o risco vigente)</span>
            <ChipNivel nivel={c.nivel_risco} tamanho="grande" />
          </div>
        </div>
        {horizonteVencido && (
          <p className="texto-apoio">
            Esta pessoa já passou do dia 90. O risco vigente é o residual até o dia 180, condicional a ter chegado ao dia 90; os fatores vêm do modelo de 180 dias.
          </p>
        )}
      </section>

      <section className="detalhe-bloco">
        <h3>Fatores explicativos</h3>
        {fatores.length === 0 ? (
          <p className="texto-apoio">Sem fatores registrados para este colaborador.</p>
        ) : (
          <ol className="lista-fatores">
            {fatores.map((f, i) => {
              const classe = classeDirecao(f.direcao, f.contribuicao);
              return (
                <li key={`${f.fator}-${i}`} className={classe}>
                  <span className="fator-seta" aria-hidden="true">
                    {setaDirecao(f.direcao, f.contribuicao)}
                  </span>
                  <div className="fator-corpo">
                    <strong>{f.rotulo}</strong>
                    <span className="fator-valor">
                      valor: {valorFator(f.valor)} · {rotulo(f.direcao, 'direção não informada')} · contribuição{' '}
                      {fmtNumeroCompacto(f.contribuicao, 3)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <p className="texto-apoio">A contribuição, em log-odds e em relação ao colaborador médio, é mostrada para ordenar e indicar a direção do efeito.</p>
      </section>

      <section className="detalhe-bloco">
        <h3>Ação recomendada</h3>
        <ul className="lista-acoes">
          {acoes.map((acao) => {
            const regra = recomendacoes.dados?.find((r) => r.acao === acao);
            return (
              <li key={acao}>
                <div className="acao-texto">{acao}</div>
                {regra && (
                  <div className="acao-meta">
                    {regra.responsavel ?? 'Responsável não informado'}
                    {num(regra.prazo_dias) !== null && ` · prazo ${fmtDias(regra.prazo_dias)}`}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="detalhe-bloco">
        <h3>Identificação e vínculo</h3>
        <dl className="lista-definicoes">
          <Definicao termo="ID pseudonimizado">{c.colaborador_id}</Definicao>
          <Definicao termo="Loja">
            {c.loja_id} · {rotulo(c.cidade)}/{c.uf}
          </Definicao>
          <Definicao termo="Bandeira / tipo de loja">
            {rotulo(c.bandeira)} · {rotulo(c.tipo_loja)}
          </Definicao>
          <Definicao termo="Região">{rotulo(c.regiao)}</Definicao>
          <Definicao termo="Cargo">{rotulo(c.cargo)}</Definicao>
          <Definicao termo="Tipo de contrato">{rotulo(c.tipo_contrato)}</Definicao>
          <Definicao termo="Faixa salarial">{rotulo(c.faixa_salarial)}</Definicao>
          <Definicao termo="Turno">{rotulo(c.turno)}</Definicao>
          <Definicao termo="Canal de contratação">{rotulo(c.canal_contratacao)}</Definicao>
          <Definicao termo="Data de admissão">{fmtData(c.data_admissao)}</Definicao>
          <Definicao termo="Dias de casa">{fmtDias(c.dias_de_casa)}</Definicao>
          <Definicao termo="Admitido em período de pico">{rotulo(c.admitido_periodo_pico)}</Definicao>
        </dl>
      </section>

      <section className="detalhe-bloco">
        <h3>Sinais dos primeiros 30 dias</h3>
        <dl className="lista-definicoes">
          <Definicao termo="Integração concluída">{rotulo(c.onboarding_concluido)}</Definicao>
          <Definicao termo="Horas de treinamento">{fmtNumeroCompacto(c.horas_treinamento_30d, 1)}</Definicao>
          <Definicao termo="Avaliação de experiência">
            {num(c.avaliacao_experiencia_30d) === null ? 'Não avaliado' : `${fmtNumeroCompacto(c.avaliacao_experiencia_30d, 1)} / 5`}
          </Definicao>
          <Definicao termo="Faltas">{fmtInteiro(c.faltas_30d)}</Definicao>
          <Definicao termo="Atrasos">{fmtInteiro(c.atrasos_30d)}</Definicao>
          <Definicao termo="Distância casa-trabalho">
            {num(c.distancia_casa_trabalho_km) === null ? '—' : `${fmtNumeroCompacto(c.distancia_casa_trabalho_km, 1)} km`}
          </Definicao>
        </dl>
      </section>

      <section className="detalhe-bloco">
        <h3>Contexto da loja e da liderança</h3>
        <dl className="lista-definicoes">
          <Definicao termo="Tempo do gestor no cargo">
            {num(c.gestor_tempo_cargo_meses) === null ? '—' : `${fmtInteiro(c.gestor_tempo_cargo_meses)} meses`}
          </Definicao>
          <Definicao termo="Indicador de turnover da loja na admissão (proxy sintético; difere do turnover realizado do Mapa de Risco)">{fmtPct(c.turnover_loja_12m)}</Definicao>
        </dl>
      </section>
    </div>
  );
}

function ListaColaboradores({ dados }: { dados: ColaboradorRisco[] }) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [ordem, setOrdem] = useState<{ chave: ChaveOrdem; direcao: Direcao }>({ chave: 'risco_vigente', direcao: 'desc' });
  const [pagina, setPagina] = useState(1);
  const [selecionado, setSelecionado] = useState<ColaboradorRisco | null>(null);

  const opcoes = useMemo(() => {
    const lojas = new Map<string, string>();
    for (const d of dados) if (!lojas.has(d.loja_id)) lojas.set(d.loja_id, `${d.loja_id} · ${rotulo(d.cidade)}/${d.uf}`);
    return {
      nivel: NIVEIS.map((n) => ({ valor: n, rotulo: rotulo(n) })),
      regiao: opcoesDe(dados.map((d) => d.regiao)),
      loja: [...lojas.entries()].sort((a, b) => comparadorTexto.compare(a[0], b[0])).map(([valor, texto]) => ({ valor, rotulo: texto })),
      cargo: opcoesDe(dados.map((d) => d.cargo)),
      contrato: opcoesDe(dados.map((d) => d.tipo_contrato)),
    };
  }, [dados]);

  const filtrados = useMemo(() => {
    const busca = filtros.busca.trim().toLowerCase();
    const lista = dados.filter(
      (d) =>
        (filtros.nivel === '' || d.nivel_risco === filtros.nivel) &&
        (filtros.regiao === '' || d.regiao === filtros.regiao) &&
        (filtros.loja === '' || d.loja_id === filtros.loja) &&
        (filtros.cargo === '' || d.cargo === filtros.cargo) &&
        (filtros.contrato === '' || d.tipo_contrato === filtros.contrato) &&
        (busca === '' || String(d.colaborador_id).toLowerCase().includes(busca)),
    );
    lista.sort((a, b) => comparar(a, b, ordem.chave, ordem.direcao));
    return lista;
  }, [dados, filtros, ordem]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { Baixo: 0, Medio: 0, Alto: 0, Critico: 0 };
    for (const d of filtrados) c[d.nivel_risco] = (c[d.nivel_risco] ?? 0) + 1;
    return c;
  }, [filtrados]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  function atualizarFiltro<K extends keyof Filtros>(chave: K, valor: Filtros[K]): void {
    setFiltros((f) => ({ ...f, [chave]: valor }));
    setPagina(1);
  }

  function alternarOrdem(chave: ChaveOrdem): void {
    setOrdem((atual) => {
      if (atual.chave === chave) return { chave, direcao: atual.direcao === 'desc' ? 'asc' : 'desc' };
      const textual = chave === 'colaborador_id' || chave === 'loja_id' || chave === 'cargo';
      return { chave, direcao: textual ? 'asc' : 'desc' };
    });
    setPagina(1);
  }

  const fechar = useCallback(() => setSelecionado(null), []);
  const haFiltro = Object.values(filtros).some((v) => v !== '');

  return (
    <>
      <div className="filtros">
        <CampoSelecao rotulo="Nível" valor={filtros.nivel} opcoes={opcoes.nivel} todos="Todos" aoMudar={(v) => atualizarFiltro('nivel', v)} />
        <CampoSelecao rotulo="Região" valor={filtros.regiao} opcoes={opcoes.regiao} todos="Todas" aoMudar={(v) => atualizarFiltro('regiao', v)} />
        <CampoSelecao rotulo="Loja" valor={filtros.loja} opcoes={opcoes.loja} todos="Todas" aoMudar={(v) => atualizarFiltro('loja', v)} largura={190} />
        <CampoSelecao rotulo="Cargo" valor={filtros.cargo} opcoes={opcoes.cargo} todos="Todos" aoMudar={(v) => atualizarFiltro('cargo', v)} />
        <CampoSelecao rotulo="Contrato" valor={filtros.contrato} opcoes={opcoes.contrato} todos="Todos" aoMudar={(v) => atualizarFiltro('contrato', v)} />
        <CampoBusca rotulo="Busca por ID" valor={filtros.busca} placeholder="ex.: C006070" aoMudar={(v) => atualizarFiltro('busca', v)} />
        {haFiltro && (
          <button
            type="button"
            className="botao botao-secundario"
            onClick={() => {
              setFiltros(FILTROS_INICIAIS);
              setPagina(1);
            }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      <p className="resumo-filtro">
        <strong>{fmtInteiro(filtrados.length)}</strong> {filtrados.length === 1 ? 'colaborador' : 'colaboradores'} em janela de risco ·{' '}
        {NIVEIS.slice()
          .reverse()
          .map((n) => (
            <span key={n} className="contagem-nivel" style={{ color: coresNivel(n).texto }}>
              <span className="chip-ponto" style={{ background: coresNivel(n).cor }} aria-hidden="true" /> {rotulo(n)} {fmtInteiro(contagem[n] ?? 0)}
            </span>
          ))}
      </p>

      {filtrados.length === 0 ? (
        <Vazio texto="Nenhum colaborador para os filtros selecionados." />
      ) : (
        <>
          <div className="tabela-rolagem">
            <table className="tabela tabela-colaboradores">
              <thead>
                <tr>
                  {COLUNAS.map((c) => {
                    const ativa = c.chave !== undefined && ordem.chave === c.chave;
                    return (
                      <th
                        key={c.rotulo}
                        scope="col"
                        className={`${c.chave ? 'ordenavel' : ''}${c.numerica ? ' num' : ''}${ativa ? ' ativa' : ''}`}
                        aria-sort={c.chave ? (ativa ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                        title={c.dica}
                      >
                        {c.chave ? (
                          <button type="button" onClick={() => alternarOrdem(c.chave as ChaveOrdem)}>
                            {c.rotulo}
                            <span className="indicador-ordem" aria-hidden="true">
                              {ativa ? (ordem.direcao === 'asc' ? '▲' : '▼') : '↕'}
                            </span>
                          </button>
                        ) : (
                          c.rotulo
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => {
                  const fatores = fatoresDe(c).slice(0, 3);
                  return (
                    <tr key={c.colaborador_id} className="linha-clicavel" onClick={() => setSelecionado(c)}>
                      <td>
                        <button type="button" className="botao-link" onClick={() => setSelecionado(c)} aria-label={`Abrir detalhe de ${c.colaborador_id}`}>
                          {c.colaborador_id}
                        </button>
                      </td>
                      <td>
                        <ChipNivel nivel={c.nivel_risco} />
                      </td>
                      <td>
                        <BarraRisco valor={vigente(c)} nivel={c.nivel_risco} />
                      </td>
                      <td className="num">{fmtInteiro(c.dias_de_casa)}</td>
                      <td className="num">
                        {fmtPct(c.risco_90d)}
                        {(num(c.dias_de_casa) ?? 0) > 90 && <span className="horizonte-vencido">vencido</span>}
                      </td>
                      <td className="num">{fmtPct(c.risco_180d)}</td>
                      <td>
                        {c.loja_id}
                        <span className="texto-apoio"> · {rotulo(c.cidade)}/{c.uf}</span>
                      </td>
                      <td>{rotulo(c.cargo)}</td>
                      <td>{rotulo(c.tipo_contrato)}</td>
                      <td>
                        <div className="chips-fatores">
                          {fatores.length === 0 ? (
                            <span className="texto-apoio">—</span>
                          ) : (
                            fatores.map((f, i) => <ChipFator key={`${f.fator}-${i}`} fator={f} />)
                          )}
                        </div>
                      </td>
                      <td className="celula-acao" title={c.acao_recomendada ?? undefined}>
                        {c.acao_recomendada ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Paginacao pagina={paginaAtual} totalPaginas={totalPaginas} total={filtrados.length} porPagina={POR_PAGINA} aoMudar={setPagina} />
        </>
      )}

      {selecionado && (
        <Painel
          titulo={`Colaborador ${selecionado.colaborador_id}`}
          subtitulo={`${rotulo(selecionado.cargo)} · ${rotulo(selecionado.tipo_contrato)} · loja ${selecionado.loja_id} (${rotulo(selecionado.cidade)}/${selecionado.uf}) · ${fmtDias(selecionado.dias_de_casa)} de casa`}
          aoFechar={fechar}
        >
          <DetalheColaborador c={selecionado} />
        </Painel>
      )}
    </>
  );
}

export function Colaboradores() {
  const estado = useDados('colaboradores_risco');
  return (
    <Secao
      titulo="Lista priorizada"
      descricao="Colaboradores ativos entre 30 e 180 dias de casa, ordenados pelo risco vigente: até o dia 90, o risco de 90 dias; depois dele, o risco residual até o dia 180. Clique em uma linha para ver o detalhe."
      id="lista-colaboradores"
    >
      <ComDados estado={estado} textoVazio="Nenhum colaborador em janela de risco na data de referência.">
        {(dados) => <ListaColaboradores dados={dados} />}
      </ComDados>
    </Secao>
  );
}
