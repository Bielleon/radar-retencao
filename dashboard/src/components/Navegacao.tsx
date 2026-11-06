import { useEffect, useRef } from 'react';
import { ROTAS } from '../lib/rota';

interface Props {
  rotaAtual: string;
}

export function Navegacao({ rotaAtual }: Props) {
  const ativaRef = useRef<HTMLAnchorElement | null>(null);

  // Em telas estreitas a barra rola na horizontal: mantém a aba ativa à vista.
  useEffect(() => {
    ativaRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [rotaAtual]);

  return (
    <nav className="navegacao" aria-label="Seções do dashboard">
      <ul>
        {ROTAS.map((rota) => {
          const ativa = rota.id === rotaAtual;
          return (
            <li key={rota.id}>
              <a ref={ativa ? ativaRef : undefined} href={`#/${rota.id}`} className={ativa ? 'ativa' : undefined} aria-current={ativa ? 'page' : undefined} title={rota.descricao}>
                {rota.rotulo}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
