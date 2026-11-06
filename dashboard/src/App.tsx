import { useEffect, type ReactElement } from 'react';
import { Cabecalho } from './components/Cabecalho';
import { Navegacao } from './components/Navegacao';
import { Rodape } from './components/Rodape';
import { infoRota, useRota } from './lib/rota';
import { useDados } from './lib/useDados';
import { Colaboradores } from './pages/Colaboradores';
import { FatoresEModelo } from './pages/FatoresEModelo';
import { MapaDeRisco } from './pages/MapaDeRisco';
import { RecomendacoesEEtica } from './pages/RecomendacoesEEtica';
import { Simulador } from './pages/Simulador';
import { VisaoGeral } from './pages/VisaoGeral';

function paginaDaRota(rota: string): ReactElement {
  switch (rota) {
    case 'mapa-de-risco':
      return <MapaDeRisco />;
    case 'colaboradores':
      return <Colaboradores />;
    case 'fatores-e-modelo':
      return <FatoresEModelo />;
    case 'simulador':
      return <Simulador />;
    case 'recomendacoes-e-etica':
      return <RecomendacoesEEtica />;
    default:
      return <VisaoGeral />;
  }
}

export default function App() {
  const rota = useRota();
  const kpis = useDados('kpis');
  const dataReferencia = kpis.dados?.[0]?.data_referencia ?? null;
  const info = infoRota(rota);

  useEffect(() => {
    document.title = `${info.rotulo} · Radar de Retenção`;
    window.scrollTo({ top: 0 });
  }, [info]);

  return (
    <div className="aplicacao">
      <Cabecalho dataReferencia={dataReferencia} />
      <Navegacao rotaAtual={rota} />
      <main className="conteudo" id="conteudo">
        <div className="pagina-cabecalho">
          <h2 className="pagina-titulo">{info.rotulo}</h2>
          <p className="pagina-descricao">{info.descricao}</p>
        </div>
        {paginaDaRota(rota)}
      </main>
      <Rodape />
    </div>
  );
}
