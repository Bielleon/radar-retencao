import { useEffect, useState, useSyncExternalStore } from 'react';
import { assinarFonte, carregar, obterEstadoFonte, type EstadoFonte } from './data';
import { mensagemErro } from './formato';
import type { Chave, Conjuntos } from './tipos';

export interface EstadoDados<T> {
  dados: T[] | null;
  carregando: boolean;
  erro: string | null;
}

/** Carrega um conjunto de dados (com cache) e expõe carregando/erro para a interface. */
export function useDados<K extends Chave>(chave: K): EstadoDados<Conjuntos[K]> {
  const [estado, setEstado] = useState<EstadoDados<Conjuntos[K]>>({ dados: null, carregando: true, erro: null });

  useEffect(() => {
    let ativo = true;
    setEstado((anterior) => (anterior.carregando ? anterior : { dados: null, carregando: true, erro: null }));
    carregar(chave)
      .then((dados) => {
        if (ativo) setEstado({ dados, carregando: false, erro: null });
      })
      .catch((erro: unknown) => {
        if (ativo) setEstado({ dados: null, carregando: false, erro: mensagemErro(erro) });
      });
    return () => {
      ativo = false;
    };
  }, [chave]);

  return estado;
}

/** Fonte efetiva dos dados e avisos (para o selo do cabeçalho). */
export function useFonte(): EstadoFonte {
  return useSyncExternalStore(assinarFonte, obterEstadoFonte, obterEstadoFonte);
}
