import { useId } from 'react';

export interface Opcao {
  valor: string;
  rotulo: string;
}

interface PropsSelecao {
  rotulo: string;
  valor: string;
  opcoes: Opcao[];
  aoMudar: (valor: string) => void;
  /** texto da opção "todos" (quando omitido, não há opção vazia) */
  todos?: string;
  largura?: number;
}

/** Campo de seleção (select) com rótulo acessível. */
export function CampoSelecao({ rotulo, valor, opcoes, aoMudar, todos, largura }: PropsSelecao) {
  const id = useId();
  return (
    <label className="campo" htmlFor={id}>
      <span className="campo-rotulo">{rotulo}</span>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} style={largura ? { minWidth: largura } : undefined}>
        {todos !== undefined && <option value="">{todos}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}

interface PropsBusca {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder?: string;
}

/** Campo de busca textual. */
export function CampoBusca({ rotulo, valor, aoMudar, placeholder }: PropsBusca) {
  const id = useId();
  return (
    <label className="campo" htmlFor={id}>
      <span className="campo-rotulo">{rotulo}</span>
      <input id={id} type="search" value={valor} placeholder={placeholder} onChange={(e) => aoMudar(e.target.value)} autoComplete="off" />
    </label>
  );
}

interface PropsSegmentado<T extends string> {
  rotulo: string;
  valor: T;
  opcoes: { valor: T; rotulo: string }[];
  aoMudar: (valor: T) => void;
}

/** Controle segmentado (botões exclusivos), usado para horizonte 90d/180d. */
export function Segmentado<T extends string>({ rotulo, valor, opcoes, aoMudar }: PropsSegmentado<T>) {
  return (
    <div className="segmentado" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.valor} type="button" aria-pressed={o.valor === valor} onClick={() => aoMudar(o.valor)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
