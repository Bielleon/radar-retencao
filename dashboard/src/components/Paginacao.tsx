import { fmtInteiro } from '../lib/formato';

interface Props {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  aoMudar: (pagina: number) => void;
}

/** Controles de paginação (1-based). */
export function Paginacao({ pagina, totalPaginas, total, porPagina, aoMudar }: Props) {
  if (total === 0) return null;
  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(total, pagina * porPagina);
  return (
    <nav className="paginacao" aria-label="Paginação da tabela">
      <span className="paginacao-info">
        Mostrando {fmtInteiro(inicio)}–{fmtInteiro(fim)} de {fmtInteiro(total)}
      </span>
      <div className="paginacao-botoes">
        <button type="button" className="botao botao-secundario" onClick={() => aoMudar(1)} disabled={pagina <= 1} aria-label="Primeira página">
          «
        </button>
        <button type="button" className="botao botao-secundario" onClick={() => aoMudar(pagina - 1)} disabled={pagina <= 1}>
          Anterior
        </button>
        <span className="paginacao-pagina">
          Página {fmtInteiro(pagina)} de {fmtInteiro(totalPaginas)}
        </span>
        <button type="button" className="botao botao-secundario" onClick={() => aoMudar(pagina + 1)} disabled={pagina >= totalPaginas}>
          Próxima
        </button>
        <button
          type="button"
          className="botao botao-secundario"
          onClick={() => aoMudar(totalPaginas)}
          disabled={pagina >= totalPaginas}
          aria-label="Última página"
        >
          »
        </button>
      </div>
    </nav>
  );
}
