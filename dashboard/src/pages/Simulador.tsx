import { useId, useMemo, useState } from 'react';
import { Segmentado } from '../components/Campos';
import { ChipNivel } from '../components/Chips';
import { Carregando, Erro } from '../components/Estado';
import { Medidor } from '../components/Medidor';
import { Secao } from '../components/Secao';
import { fmtData, fmtDias, fmtNumero, fmtNumeroCompacto, fmtPct, lerDecimal, num } from '../lib/formato';
import { rotulo, rotuloModelo } from '../lib/rotulos';
import { acoesSugeridas, campoDerivado, featuresComIndicadorAusente, permiteNulo, simular, sincronizarPico, valoresPadrao, type Contribuicao, type ValorInput, type Valores } from '../lib/simulador';
import type { Horizonte, InputCard, ModelCard, Modelo, Recomendacao } from '../lib/tipos';
import { useDados } from '../lib/useDados';

const OPCOES_HORIZONTE: { valor: Horizonte; rotulo: string }[] = [
  { valor: '90d', rotulo: '90 dias' },
  { valor: '180d', rotulo: '180 dias' },
];

interface PropsCampo {
  input: InputCard;
  valor: ValorInput;
  podeSerNulo: boolean;
  aoMudar: (valor: ValorInput) => void;
}

function CampoNumerico({ input, valor, podeSerNulo, aoMudar }: PropsCampo) {
  const id = useId();
  const nulo = valor === null || valor === undefined || valor === '';
  const min = input.min ?? 0;
  const max = input.max ?? Math.max(min + 1, 100);
  const passo = input.passo ?? 1;
  const atual = nulo ? min : (num(valor) ?? min);
  // Último valor numérico conhecido, para restaurar ao desmarcar "não informado".
  const padraoNumerico = num(input.padrao) ?? (min + max) / 2;
  // Texto em edição: o limite só é aplicado ao sair do campo ou com Enter, para aceitar valores
  // digitados aos poucos. Enquanto isso, o modelo só recebe números válidos dentro da faixa.
  const [texto, setTexto] = useState<string | null>(null);
  const lido = texto === null ? null : lerDecimal(texto);
  const foraDaFaixa = texto !== null && texto.trim() !== '' && (lido === null || lido < min || lido > max);
  const confirmar = () => {
    if (lido !== null) aoMudar(Math.max(min, Math.min(max, lido)));
    setTexto(null);
  };
  return (
    <div className={`campo-sim${nulo ? ' campo-sim-nulo' : ''}`}>
      <label htmlFor={id} className="campo-rotulo">
        {input.rotulo}
        {input.descricao && <span className="campo-ajuda" title={input.descricao}> ⓘ</span>}
      </label>
      <div className="campo-sim-controles">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={passo}
          value={atual}
          disabled={nulo}
          onChange={(e) => aoMudar(Number(e.target.value))}
          aria-valuetext={nulo ? 'não informado' : fmtNumeroCompacto(atual, 2)}
        />
        <input
          type="text"
          inputMode="decimal"
          className="entrada-numero"
          value={texto ?? (nulo ? '' : fmtNumeroCompacto(atual, 2))}
          disabled={nulo}
          aria-invalid={foraDaFaixa}
          title={`Valor entre ${fmtNumeroCompacto(min, 2)} e ${fmtNumeroCompacto(max, 2)}`}
          onChange={(e) => {
            setTexto(e.target.value);
            const n = lerDecimal(e.target.value);
            if (n !== null && n >= min && n <= max) aoMudar(n);
          }}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmar();
          }}
          aria-label={`${input.rotulo} (valor entre ${fmtNumeroCompacto(min, 2)} e ${fmtNumeroCompacto(max, 2)})`}
        />
      </div>
      {podeSerNulo && (
        <label className="caixa">
          <input type="checkbox" checked={nulo} onChange={(e) => aoMudar(e.target.checked ? null : padraoNumerico)} /> Não informado / não avaliado
        </label>
      )}
    </div>
  );
}

function CampoCategorico({ input, valor, aoMudar }: PropsCampo) {
  const id = useId();
  const opcoes = input.opcoes ?? [];
  return (
    <div className="campo-sim">
      <label htmlFor={id} className="campo-rotulo">
        {input.rotulo}
        {input.descricao && <span className="campo-ajuda" title={input.descricao}> ⓘ</span>}
      </label>
      <select id={id} value={typeof valor === 'string' ? valor : ''} onChange={(e) => aoMudar(e.target.value)}>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {rotulo(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

function CampoBooleano({ input, valor, aoMudar }: PropsCampo) {
  const id = useId();
  const marcado = valor === true || valor === 1 || valor === 'true';
  const derivado = campoDerivado(input.feature);
  return (
    <div className="campo-sim campo-sim-bool">
      <label htmlFor={id} className="alternador">
        <input id={id} type="checkbox" role="switch" checked={marcado} aria-checked={marcado} disabled={derivado} onChange={(e) => aoMudar(e.target.checked)} />
        <span className="alternador-trilha" aria-hidden="true">
          <span className="alternador-botao" />
        </span>
        <span className="alternador-texto">
          {input.rotulo}
          {input.descricao && <span className="campo-ajuda" title={input.descricao}> ⓘ</span>}
          <span className="alternador-estado"> · {marcado ? 'Sim' : 'Não'}{derivado && ' (definido pelo mês de admissão)'}</span>
        </span>
      </label>
    </div>
  );
}

function ListaContribuicoes({ contribuicoes }: { contribuicoes: Contribuicao[] }) {
  const principais = contribuicoes.slice(0, 3);
  if (principais.length === 0) return <p className="texto-apoio">Sem termos para este horizonte.</p>;
  const maximo = Math.max(...principais.map((c) => Math.abs(c.contribuicao)), 1e-9);
  return (
    <ol className="lista-contribuicoes">
      {principais.map((c) => {
        const aumenta = c.contribuicao >= 0;
        const valorTexto =
          c.valor === null || c.valor === undefined || c.valor === ''
            ? 'não informado'
            : typeof c.valor === 'boolean'
              ? c.valor
                ? 'Sim'
                : 'Não'
              : typeof c.valor === 'number'
                ? fmtNumeroCompacto(c.valor, 2)
                : rotulo(c.valor);
        return (
          <li key={c.feature} className={aumenta ? 'direcao-aumenta' : 'direcao-reduz'}>
            <div className="contribuicao-topo">
              <span className="fator-seta" aria-hidden="true">
                {aumenta ? '↑' : '↓'}
              </span>
              <strong>{c.rotulo}</strong>
              <span className="contribuicao-valor num">
                {aumenta ? '+' : '−'}
                {fmtNumero(Math.abs(c.contribuicao), 2)}
              </span>
            </div>
            <div className="contribuicao-detalhe">
              valor: {valorTexto} · {aumenta ? 'aumenta' : 'reduz'} o risco
            </div>
            <span className="contribuicao-barra" aria-hidden="true">
              <span style={{ width: `${(Math.abs(c.contribuicao) / maximo) * 100}%` }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function FormularioSimulador({ modelo, card, recomendacoes }: { modelo: Modelo; card: ModelCard; recomendacoes: Recomendacao[] }) {
  const comIndicador = useMemo(() => featuresComIndicadorAusente(card), [card]);
  const [valores, setValores] = useState<Valores>(() => valoresPadrao(card));
  const [horizonteDetalhe, setHorizonteDetalhe] = useState<Horizonte>('90d');

  const resultado = useMemo(() => simular(card, valores), [card, valores]);
  const detalhe = resultado.por_horizonte[horizonteDetalhe] ?? resultado.por_horizonte['90d'] ?? resultado.por_horizonte['180d'];
  const acoes = useMemo(() => acoesSugeridas(recomendacoes, resultado.nivel, detalhe, valores), [recomendacoes, resultado.nivel, detalhe, valores]);

  const oficial = card.simulador_e_modelo_oficial ?? {};
  const substitutos = (['90d', '180d'] as Horizonte[]).filter((h) => card.simulador[h] && oficial[h] === false);

  function definir(feature: string, valor: ValorInput): void {
    setValores((v) => sincronizarPico({ ...v, [feature]: valor }));
  }

  return (
    <div className="simulador">
      <Secao
        titulo="Atributos do colaborador"
        descricao="Ajuste os valores para simular cenários. Os campos correspondem às variáveis do checkpoint de 30 dias."
        id="form-simulador"
        acoes={
          <button type="button" className="botao botao-secundario" onClick={() => setValores(valoresPadrao(card))}>
            Restaurar padrões
          </button>
        }
      >
        <div className="grade-campos">
          {card.inputs.map((input) => {
            const props: PropsCampo = {
              input,
              valor: valores[input.feature] ?? null,
              podeSerNulo: permiteNulo(input, comIndicador),
              aoMudar: (v) => definir(input.feature, v),
            };
            if (input.tipo === 'cat') return <CampoCategorico key={input.feature} {...props} />;
            if (input.tipo === 'bool') return <CampoBooleano key={input.feature} {...props} />;
            return <CampoNumerico key={input.feature} {...props} />;
          })}
        </div>
      </Secao>

      <div className="resultado-simulador">
        <Secao titulo="Resultado" descricao="Recalculado a cada alteração, no navegador, com os coeficientes exportados no model card." id="resultado-simulador">
          {substitutos.length > 0 && (
            <div className="aviso" role="note">
              <strong>Modelo substituto interpretável.</strong> Para {substitutos.map((h) => rotulo(h)).join(' e ')}, o modelo oficial é{' '}
              {substitutos.map((h) => rotuloModelo(card.modelo_selecionado[h] ?? 'não informado')).join(' / ')}; o simulador usa a regressão logística
              exportada, portanto os valores são aproximações do score oficial.
            </div>
          )}
          <div className="medidores">
            <Medidor rotuloMedidor="Risco de saída voluntária até 90 dias" valor={resultado.por_horizonte['90d']?.risco ?? null} limiares={card.limiares_nivel} />
            <Medidor
              rotuloMedidor="Risco de saída voluntária até 180 dias"
              valor={resultado.por_horizonte['180d']?.risco ?? null}
              limiares={card.limiares_nivel}
              mostrarNivel={false}
            />
          </div>
          <div className="nivel-simulado">
            <span>Nível de risco no dia 30 (sobre o risco de 90 dias):</span>
            <ChipNivel nivel={resultado.nivel} tamanho="grande" />
          </div>

          <div className="bloco-resultado">
            <div className="bloco-resultado-cabecalho">
              <h3>Maiores contribuições</h3>
              <Segmentado rotulo="Horizonte das contribuições" valor={horizonteDetalhe} opcoes={OPCOES_HORIZONTE} aoMudar={setHorizonteDetalhe} />
            </div>
            <p className="texto-apoio">Contribuição em log-odds em relação ao colaborador médio, na mesma escala da lista de colaboradores; sinal positivo aumenta o risco.</p>
            <ListaContribuicoes contribuicoes={detalhe?.contribuicoes ?? []} />
          </div>

          <div className="bloco-resultado">
            <h3>Ações sugeridas</h3>
            {acoes.length === 0 ? (
              <p className="texto-apoio">Nenhuma regra do playbook se aplica a este cenário.</p>
            ) : (
              <ul className="lista-acoes">
                {acoes.map((a) => (
                  <li key={a.id}>
                    <div className="acao-gatilho">
                      {a.fator === 'nivel' ? (
                        <>
                          Nível <ChipNivel nivel={a.nivel_minimo} />
                        </>
                      ) : (
                        <span className="chip chip-gatilho">{a.rotulo_fator || rotulo(a.fator)}</span>
                      )}
                    </div>
                    <div className="acao-texto">{a.acao}</div>
                    <div className="acao-meta">
                      {a.responsavel ?? 'Responsável não informado'}
                      {num(a.prazo_dias) !== null && ` · prazo ${fmtDias(a.prazo_dias)}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="texto-apoio modelo-info">
            Model card {card.versao || modelo.versao}
            {card.data_referencia && ` · referência ${fmtData(card.data_referencia)}`} · modelos oficiais: 90 dias ={' '}
            {rotuloModelo(card.modelo_selecionado['90d'] ?? 'não informado')}, 180 dias = {rotuloModelo(card.modelo_selecionado['180d'] ?? 'não informado')} ·
            limiares: Médio ≥ {fmtPct(card.limiares_nivel?.Medio ?? 0.15, 0)}, Alto ≥ {fmtPct(card.limiares_nivel?.Alto ?? 0.3, 0)}, Crítico ≥{' '}
            {fmtPct(card.limiares_nivel?.Critico ?? 0.45, 0)}.
          </p>
        </Secao>
      </div>
    </div>
  );
}

export function Simulador() {
  const modelos = useDados('modelos');
  const recomendacoes = useDados('recomendacoes');

  if (modelos.carregando || recomendacoes.carregando) return <Carregando texto="Carregando o model card…" />;
  if (modelos.erro) return <Erro mensagem={modelos.erro} />;
  const modelo = modelos.dados?.[0];
  const card = modelo?.card;
  if (!modelo || !card || !Array.isArray(card.inputs) || typeof card.simulador !== 'object' || card.simulador === null) {
    return <Erro titulo="Model card indisponível" mensagem="A tabela rr_modelos não possui um card com inputs e coeficientes do simulador." />;
  }
  return <FormularioSimulador modelo={modelo} card={card} recomendacoes={recomendacoes.dados ?? []} />;
}
