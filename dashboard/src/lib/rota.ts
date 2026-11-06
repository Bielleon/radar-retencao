import { useEffect, useState } from 'react';

export interface Rota {
  id: string;
  rotulo: string;
  descricao: string;
}

/** Abas do dashboard (navegação por hash: #/<id>). A primeira é a padrão. */
export const ROTAS: Rota[] = [
  { id: 'visao-geral', rotulo: 'Visão Geral', descricao: 'KPIs, tendência mensal, sobrevivência e motivos de saída' },
  { id: 'mapa-de-risco', rotulo: 'Mapa de Risco', descricao: 'Lojas e segmentos que exigem atenção' },
  { id: 'colaboradores', rotulo: 'Colaboradores em Risco', descricao: 'Lista priorizada com fatores e ações' },
  { id: 'fatores-e-modelo', rotulo: 'Fatores e Modelo', descricao: 'Importância, efeitos, métricas e auditoria de viés' },
  { id: 'simulador', rotulo: 'Simulador', descricao: 'Cenários what-if com o modelo interpretável' },
  { id: 'recomendacoes-e-etica', rotulo: 'Recomendações e Ética', descricao: 'Playbook, custo do turnover e LGPD' },
];

export const ROTA_PADRAO = ROTAS[0].id;

/** Lê a rota atual do hash (#/visao-geral -> 'visao-geral'); desconhecida -> padrão. */
export function rotaAtual(): string {
  const bruto = window.location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
  return ROTAS.some((r) => r.id === bruto) ? bruto : ROTA_PADRAO;
}

/** Hook: rota atual, atualizada a cada hashchange. */
export function useRota(): string {
  const [rota, setRota] = useState<string>(rotaAtual);
  useEffect(() => {
    const aoMudar = (): void => setRota(rotaAtual());
    window.addEventListener('hashchange', aoMudar);
    // Normaliza um hash vazio/inválido para a aba padrão sem gerar histórico extra.
    if (window.location.hash === '' || window.location.hash === '#' || window.location.hash === '#/') {
      window.history.replaceState(null, '', `#/${ROTA_PADRAO}`);
    }
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);
  return rota;
}

export function infoRota(id: string): Rota {
  return ROTAS.find((r) => r.id === id) ?? ROTAS[0];
}
