import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  aoFechar: () => void;
  children: ReactNode;
}

/** Painel lateral (drawer) com sobreposição; fecha com Esc ou clique fora. */
export function Painel({ titulo, subtitulo, aoFechar, children }: Props) {
  const botaoFechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    botaoFechar.current?.focus();
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('keydown', aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aoFechar]);

  return (
    <>
      <div className="painel-fundo" onClick={aoFechar} aria-hidden="true" />
      <aside className="painel" role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : 'Detalhe'}>
        <header className="painel-cabecalho">
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p className="painel-subtitulo">{subtitulo}</p>}
          </div>
          <button ref={botaoFechar} type="button" className="botao botao-fantasma" onClick={aoFechar} aria-label="Fechar painel">
            ✕
          </button>
        </header>
        <div className="painel-conteudo">{children}</div>
      </aside>
    </>
  );
}
