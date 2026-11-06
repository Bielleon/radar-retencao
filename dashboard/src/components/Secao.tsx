import type { ReactNode } from 'react';

interface Props {
  titulo: string;
  descricao?: ReactNode;
  /** controles exibidos à direita do título (seletores, filtros) */
  acoes?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Bloco de conteúdo com título, descrição e área de ações. */
export function Secao({ titulo, descricao, acoes, id, className, children }: Props) {
  return (
    <section className={`secao${className ? ` ${className}` : ''}`} id={id} aria-labelledby={id ? `${id}-titulo` : undefined}>
      <header className="secao-cabecalho">
        <div>
          <h2 id={id ? `${id}-titulo` : undefined}>{titulo}</h2>
          {descricao && <p className="secao-descricao">{descricao}</p>}
        </div>
        {acoes && <div className="secao-acoes">{acoes}</div>}
      </header>
      <div className="secao-conteudo">{children}</div>
    </section>
  );
}
