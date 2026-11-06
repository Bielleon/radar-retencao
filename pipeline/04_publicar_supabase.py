"""
04_publicar_supabase.py — publica ``data/processed/*.csv`` no Supabase.

Lê ``SUPABASE_URL`` e ``SUPABASE_SERVICE_ROLE_KEY`` do ambiente ou de um arquivo
``.env`` na raiz do repositório (nunca há chaves no código). Faz *upsert* em
lotes de 500 linhas na ordem das chaves estrangeiras, convertendo booleanos,
datas e jsonb para os tipos aceitos pelo PostgREST.

Opções:
* ``--limpar``: apaga as tabelas (ordem inversa das FKs) antes de carregar;
* ``--dry-run``: só valida as conversões e mostra as contagens, sem conectar.

Uso: ``python pipeline/04_publicar_supabase.py [--limpar] [--dry-run]``
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rr_comum import (  # noqa: E402
    CHAVES_PRIMARIAS, RAIZ, TABELAS_ORDEM, TIPOS_TABELAS, configurar_saida_utf8, ler_csv_tabela, registros_json,
)

TAMANHO_LOTE = 500


def carregar_env(caminho: Path = RAIZ / ".env") -> None:
    """Carrega KEY=VALUE de um .env simples para os.environ (sem sobrescrever o ambiente)."""
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        chave, valor = chave.strip(), valor.strip().strip('"').strip("'")
        os.environ.setdefault(chave, valor)


def preparar_tabelas() -> dict[str, list[dict]]:
    """Lê e converte todas as tabelas para registros JSON (valida tipos no processo)."""
    tabelas = {}
    for nome in TABELAS_ORDEM:
        df = ler_csv_tabela(nome)
        registros = registros_json(df, nome)
        for pk in CHAVES_PRIMARIAS[nome]:
            if any(r[pk] is None for r in registros):
                raise ValueError(f"rr_{nome}: chave primária {pk} com valor nulo")
        tabelas[nome] = registros
    return tabelas


def filtro_apagar_tudo(consulta, nome: str):
    """PostgREST exige um filtro no DELETE; usa a primeira coluna da chave primária."""
    pk = CHAVES_PRIMARIAS[nome][0]
    tipo = TIPOS_TABELAS[nome][pk]
    if tipo == "int":
        return consulta.gte(pk, -1)
    if tipo == "date":
        return consulta.gte(pk, "1900-01-01")
    return consulta.neq(pk, "__nenhum__")


def publicar(tabelas: dict[str, list[dict]], limpar: bool) -> None:
    from supabase import create_client

    url, chave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not chave:
        raise SystemExit("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente ou no .env da raiz.")
    cliente = create_client(url, chave)
    if limpar:
        for nome in reversed(TABELAS_ORDEM):
            filtro_apagar_tudo(cliente.table(f"rr_{nome}").delete(), nome).execute()
            print(f"rr_{nome}: tabela limpa")
    for nome in TABELAS_ORDEM:
        registros = tabelas[nome]
        conflito = ",".join(CHAVES_PRIMARIAS[nome])
        t0 = time.time()
        for k in range(0, len(registros), TAMANHO_LOTE):
            lote = registros[k:k + TAMANHO_LOTE]
            cliente.table(f"rr_{nome}").upsert(lote, on_conflict=conflito).execute()
        print(f"rr_{nome}: {len(registros)} linhas publicadas em {time.time() - t0:.1f}s")


def main() -> int:
    configurar_saida_utf8()
    parser = argparse.ArgumentParser(description="Publica as tabelas rr_ no Supabase.")
    parser.add_argument("--limpar", action="store_true", help="apaga as tabelas antes de carregar")
    parser.add_argument("--dry-run", action="store_true", help="só valida e mostra contagens, sem conectar")
    args = parser.parse_args()
    carregar_env()
    tabelas = preparar_tabelas()
    total = 0
    for nome in TABELAS_ORDEM:
        n = len(tabelas[nome])
        total += n
        lotes = (n + TAMANHO_LOTE - 1) // TAMANHO_LOTE
        print(f"rr_{nome}: {n} linhas, {lotes} lote(s), chave {CHAVES_PRIMARIAS[nome]}")
    print(f"Total: {total} linhas em {len(TABELAS_ORDEM)} tabelas.")
    if args.dry_run:
        exemplo = tabelas["predicoes"][0] if tabelas["predicoes"] else {}
        print(f"Exemplo de registro convertido (rr_predicoes): {str(exemplo)[:300]}...")
        print("Dry-run: nada foi enviado ao Supabase.")
        return 0
    publicar(tabelas, args.limpar)
    return 0


if __name__ == "__main__":
    sys.exit(main())
