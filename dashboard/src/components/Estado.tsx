import type { ReactNode } from 'react';
import type { EstadoDados } from '../lib/useDados';

export function Carregando({ texto = 'Carregando dados…' }: { texto?: string }) {
  return (
    <div className="estado estado-carregando" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

export function Erro({ mensagem, titulo = 'Não foi possível carregar os dados' }: { mensagem: string; titulo?: string }) {
  return (
    <div className="estado estado-erro" role="alert">
      <strong>{titulo}</strong>
      <p>{mensagem}</p>
      <p className="estado-dica">
        Verifique a configuração do Supabase (.env) ou a cópia JSON dos resultados em <code>public/demo/</code> e recarregue a página.
      </p>
    </div>
  );
}

export function Vazio({ texto = 'Nenhum registro encontrado.' }: { texto?: string }) {
  return (
    <div className="estado estado-vazio" role="status">
      {texto}
    </div>
  );
}

interface PropsComDados<T> {
  estado: EstadoDados<T>;
  /** texto exibido quando o conjunto está vazio */
  textoVazio?: string;
  children: (dados: T[]) => ReactNode;
}

/** Renderiza carregando/erro/vazio ou entrega os dados ao filho (render prop). */
export function ComDados<T>({ estado, textoVazio, children }: PropsComDados<T>) {
  if (estado.carregando) return <Carregando />;
  if (estado.erro) return <Erro mensagem={estado.erro} />;
  if (!estado.dados || estado.dados.length === 0) return <Vazio texto={textoVazio} />;
  return <>{children(estado.dados)}</>;
}
