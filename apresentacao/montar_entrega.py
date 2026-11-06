# -*- coding: utf-8 -*-
"""
Monta o pacote de entrega da Sprint 1 (arquivo ZIP) em AttFIAP/outputs.

Conteúdo do ZIP:
  EC_Sprint_1_2TSCOR_ideacaoarquitetura_RadarRetencao_GabrielLeon.pptx  (entrega obrigatória)
  componentes.txt, links.txt, LEIA-ME.txt
  radar-retencao/  (código-fonte, dados sintéticos, notebooks, SQL, dashboard e documentação,
                    sem node_modules, builds, .git e segredos)

Uso: python apresentacao/montar_entrega.py
"""
import os
import sys
import zipfile
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]          # .../radar-retencao
PASTA_SAIDA = RAIZ.parent / "outputs"               # .../AttFIAP/outputs
NOME = "EC_Sprint_1_2TSCOR_ideacaoarquitetura_RadarRetencao_GabrielLeon"
PPTX = RAIZ / "apresentacao" / f"{NOME}.pptx"
ZIP = PASTA_SAIDA / f"{NOME}.zip"

DIRS_EXCLUIDOS = {"node_modules", "dist", ".git", "__pycache__", ".ipynb_checkpoints", ".vite"}
EXTENSOES_EXCLUIDAS = {".pyc", ".log"}
ENV_PERMITIDO = ".env.example"

LEIA_ME = f"""ENTERPRISE CHALLENGE RI HAPPY x FIAP - TURMA 2TSCOR
Sprint 1 - Ideacao e arquitetura da solucao
Projeto: Radar de Retencao (analise preditiva de turnover no varejo)
Integrante: Gabriel Alves Leon Rodriguez - RM566648
Data de geracao do pacote: {date.today().strftime('%d/%m/%Y')}

CONTEUDO
1. {NOME}.pptx
   Apresentacao executiva da Sprint 1 (identificacao, contextualizacao, recorte, usuarios,
   proposta, funcionalidades, beneficios, etica/LGPD, arquitetura, fluxo dos dados,
   tecnologias e prototipos). Entrega obrigatoria da sprint.
2. componentes.txt  - turma, projeto e integrante.
3. links.txt        - links do projeto (dashboard, repositorio) e observacoes.
4. radar-retencao/  - prototipo funcional construido na Sprint 1 (adiantamento da Sprint 2):
   - README.md: objetivo, estrutura, tecnologias, execucao, dependencias, artefatos e limitacoes
   - pipeline/: geracao da base sintetica, treino dos modelos, explicabilidade,
     analises complementares e publicacao no Supabase
   - notebooks/: analise exploratoria e modelagem (executado, com saidas)
   - data/: base sintetica e resultados processados (nenhum dado real da Ri Happy)
   - supabase/: migracoes (tabelas rr_* e views rr_vw_*) e scripts de carga
   - dashboard/: aplicacao web (Vite + React + TypeScript) com seis paginas
   - docs/: especificacao, arquitetura, etica/LGPD, referencias de mercado e imagens
   - apresentacao/: gerador do PPTX e capturador de telas

Link publico do dashboard: https://bielleon.github.io/radar-retencao/ . Ele le uma copia JSON dos resultados do
pipeline (dashboard/public/demo) e nao publica credenciais de banco. A leitura pelo Supabase e opcional, na execucao
local, com um arquivo .env proprio (ver README, secao 4.4).

Para executar o dashboard localmente sem banco: cd radar-retencao/dashboard, npm install, npm run dev.
Para reproduzir o pipeline: cd radar-retencao, pip install -r requirements.txt, python pipeline/executar_pipeline.py.
"""


def arquivo_excluido(nome: str) -> bool:
    """Exclui todo arquivo de ambiente, que pode ter credenciais, exceto o modelo .env.example."""
    if nome.startswith(".env") and nome != ENV_PERMITIDO:
        return True
    return Path(nome).suffix in EXTENSOES_EXCLUIDAS


def arquivos_do_repo():
    for pasta, subpastas, arquivos in os.walk(RAIZ):
        subpastas[:] = [d for d in subpastas if d not in DIRS_EXCLUIDOS]
        for nome in arquivos:
            caminho = Path(pasta) / nome
            # o PPTX já vai na raiz do ZIP; não duplicar dentro de radar-retencao/apresentacao
            if arquivo_excluido(nome) or caminho == PPTX:
                continue
            yield caminho, Path("radar-retencao") / caminho.relative_to(RAIZ)


def main():
    if not PPTX.exists():
        print(f"ERRO: apresentação não encontrada em {PPTX}. Rode 'npm run gerar' em apresentacao/.")
        sys.exit(1)
    PASTA_SAIDA.mkdir(parents=True, exist_ok=True)
    if ZIP.exists():
        ZIP.unlink()
    total = 0
    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(PPTX, f"{NOME}.pptx")
        z.write(RAIZ / "componentes.txt", "componentes.txt")
        z.write(RAIZ / "links.txt", "links.txt")
        z.writestr("LEIA-ME.txt", LEIA_ME)
        for origem, destino in arquivos_do_repo():
            z.write(origem, str(destino).replace("\\", "/"))
            total += 1
    # verificação
    with zipfile.ZipFile(ZIP) as z:
        corrompido = z.testzip()
        nomes = z.namelist()
    if corrompido:
        print(f"ERRO: entrada corrompida no ZIP: {corrompido}")
        sys.exit(1)
    proibidos = [n for n in nomes if Path(n).name.startswith(".env") and Path(n).name != ENV_PERMITIDO]
    if proibidos:
        print(f"ERRO: arquivos de ambiente no ZIP: {proibidos}")
        sys.exit(1)
    tamanho_mb = ZIP.stat().st_size / 1024 / 1024
    print(f"ZIP gerado: {ZIP}")
    print(f"  {len(nomes)} entradas ({total} arquivos do repositório), {tamanho_mb:.1f} MB")
    raiz_zip = sorted({n.split('/')[0] for n in nomes})
    print("  raiz do ZIP:", ", ".join(raiz_zip))


if __name__ == "__main__":
    main()
