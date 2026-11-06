import type { ReactNode } from 'react';

export type TomKpi = 'neutro' | 'positivo' | 'atencao' | 'critico' | 'destaque';

interface Props {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  /** texto explicativo exibido como tooltip (atributo title) */
  dica?: string;
  tom?: TomKpi;
}

/** Cartão de indicador executivo. */
export function CartaoKpi({ titulo, valor, detalhe, dica, tom = 'neutro' }: Props) {
  return (
    <article className={`kpi kpi-${tom}`} title={dica}>
      <h3 className="kpi-titulo">{titulo}</h3>
      <p className="kpi-valor">{valor}</p>
      {detalhe !== undefined && <p className="kpi-detalhe">{detalhe}</p>}
    </article>
  );
}
