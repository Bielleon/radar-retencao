import { fmtNumeroCompacto } from '../lib/formato';
import { coresNivel } from '../lib/niveis';
import { rotulo } from '../lib/rotulos';
import type { Direcao, FatorTop } from '../lib/tipos';

interface PropsNivel {
  nivel: string | null | undefined;
  tamanho?: 'normal' | 'grande';
}

/** Chip colorido do nível de risco (Baixo verde, Médio amarelo, Alto laranja, Crítico vermelho). */
export function ChipNivel({ nivel, tamanho = 'normal' }: PropsNivel) {
  const cores = coresNivel(nivel);
  return (
    <span
      className={`chip chip-nivel${tamanho === 'grande' ? ' chip-grande' : ''}`}
      style={{ background: cores.fundo, color: cores.texto, borderColor: cores.cor }}
    >
      <span className="chip-ponto" style={{ background: cores.cor }} aria-hidden="true" />
      {rotulo(nivel)}
    </span>
  );
}

export function setaDirecao(direcao: Direcao | null | undefined, contribuicao?: number): string {
  if (direcao === 'aumenta') return '↑';
  if (direcao === 'reduz') return '↓';
  if (direcao === 'misto') return '↕';
  if (typeof contribuicao === 'number') return contribuicao >= 0 ? '↑' : '↓';
  return '•';
}

export function classeDirecao(direcao: Direcao | null | undefined, contribuicao?: number): string {
  if (direcao === 'aumenta' || (direcao == null && typeof contribuicao === 'number' && contribuicao >= 0)) return 'direcao-aumenta';
  if (direcao === 'reduz' || (direcao == null && typeof contribuicao === 'number' && contribuicao < 0)) return 'direcao-reduz';
  return 'direcao-misto';
}

/** Formata o valor de um fator (string, número ou booleano) para exibição. */
export function valorFator(valor: FatorTop['valor']): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'number') return fmtNumeroCompacto(valor, 2);
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  return rotulo(valor);
}

interface PropsFator {
  fator: FatorTop;
  mostrarValor?: boolean;
}

/** Chip de um fator explicativo com seta para cima (aumenta o risco) ou para baixo (reduz). */
export function ChipFator({ fator, mostrarValor = false }: PropsFator) {
  const seta = setaDirecao(fator.direcao, fator.contribuicao);
  const classe = classeDirecao(fator.direcao, fator.contribuicao);
  const valor = valorFator(fator.valor);
  const titulo = `${fator.rotulo}: ${valor} — ${rotulo(fator.direcao, 'direção não informada')}`;
  return (
    <span className={`chip chip-fator ${classe}`} title={titulo}>
      <span className="chip-seta" aria-hidden="true">
        {seta}
      </span>
      <span className="chip-texto">
        {fator.rotulo}
        {mostrarValor && valor !== '—' && <span className="chip-valor"> · {valor}</span>}
      </span>
    </span>
  );
}
