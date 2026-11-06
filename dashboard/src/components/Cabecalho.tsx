import { TEXTO_FONTE } from '../lib/data';
import { fmtData } from '../lib/formato';
import { useFonte } from '../lib/useDados';

interface Props {
  dataReferencia: string | null;
}

function LogoRadar() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="#1f3f8f" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.7" />
      <circle cx="16" cy="16" r="4.5" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.9" />
      <path d="M16 16 L26.5 7.5" stroke="#ffd54a" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.9" fill="#ffd54a" />
    </svg>
  );
}

export function Cabecalho({ dataReferencia }: Props) {
  const { fonte, avisos } = useFonte();
  const tituloAvisos = avisos.length > 0 ? avisos.join('\n') : fonte === 'demo' ? 'Cópia estática dos resultados do pipeline: o site não acessa banco de dados nem publica credenciais.' : undefined;
  return (
    <header className="cabecalho">
      <div className="cabecalho-interno">
        <div className="marca">
          <LogoRadar />
          <div>
            <h1>Radar de Retenção</h1>
            <p className="subtitulo">
              Previsão de desligamento voluntário nos primeiros 90 e 180 dias – colaboradores operacionais de loja
            </p>
          </div>
        </div>
        <div className="cabecalho-meta">
          <span className="selo selo-data" title="Data de referência das predições e dos indicadores">
            <span className="selo-rotulo">Referência</span> {dataReferencia ? fmtData(dataReferencia) : '—'}
          </span>
          <span className={`selo selo-fonte selo-fonte-${fonte}`} title={tituloAvisos}>
            {TEXTO_FONTE[fonte]}
            {avisos.length > 0 && (
              <span className="selo-aviso" aria-label="Há avisos sobre a fonte de dados">
                {' '}
                ⚠
              </span>
            )}
          </span>
        </div>
      </div>
      {avisos.length > 0 && (
        <p className="faixa-avisos" role="status">
          O Supabase não respondeu para {avisos.length} {avisos.length === 1 ? 'conjunto de dados' : 'conjuntos de dados'}; a tela usa a cópia JSON dos resultados.
        </p>
      )}
    </header>
  );
}
