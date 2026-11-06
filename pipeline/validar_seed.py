"""
validar_seed.py — confere os arquivos de seed SQL gerados pelo pipeline.

Para cada arquivo em ``supabase/seed``:
* ``00_limpar.sql`` deve ter um DELETE por tabela conhecida;
* os demais devem conter exatamente um INSERT em uma tabela ``rr_`` conhecida,
  com o número de linhas (tuplas de VALUES) esperado — a soma das partes de
  cada tabela deve bater com o CSV de ``data/processed`` — e terminar com ``;``.

Uso: ``python pipeline/validar_seed.py`` (código de saída 1 em caso de erro).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rr_comum import DIR_PROCESSED, DIR_SEED, TABELAS_ORDEM, TIPOS_TABELAS, configurar_saida_utf8, ler_csv_tabela  # noqa: E402

RE_INSERT = re.compile(r"insert\s+into\s+public\.rr_(\w+)\s*\((.*?)\)\s*values", re.IGNORECASE | re.DOTALL)


def contar_tuplas(sql: str) -> int:
    """Conta as tuplas de nível 1 após VALUES, respeitando strings entre aspas simples."""
    inicio = RE_INSERT.search(sql)
    if not inicio:
        return 0
    corpo = sql[inicio.end():]
    profundidade, em_texto, tuplas = 0, False, 0
    i = 0
    while i < len(corpo):
        ch = corpo[i]
        if em_texto:
            if ch == "'":
                if i + 1 < len(corpo) and corpo[i + 1] == "'":
                    i += 1  # aspas escapadas
                else:
                    em_texto = False
        elif ch == "'":
            em_texto = True
        elif ch == "(":
            profundidade += 1
            if profundidade == 1:
                tuplas += 1
        elif ch == ")":
            profundidade -= 1
        i += 1
    return tuplas


def main() -> int:
    configurar_saida_utf8()
    erros: list[str] = []
    arquivos = sorted(DIR_SEED.glob("*.sql"))
    if not arquivos:
        print(f"Nenhum arquivo .sql em {DIR_SEED}")
        return 1
    esperado = {nome: len(ler_csv_tabela(nome)) for nome in TABELAS_ORDEM}
    contado = {nome: 0 for nome in TABELAS_ORDEM}
    for arq in arquivos:
        sql = arq.read_text(encoding="utf-8")
        if not sql.rstrip().endswith(";"):
            erros.append(f"{arq.name}: não termina com ';'")
        if arq.name == "00_limpar.sql":
            tabelas = re.findall(r"delete\s+from\s+public\.rr_(\w+)\s*;", sql, re.IGNORECASE)
            faltam = [t for t in TABELAS_ORDEM if t not in tabelas]
            if faltam:
                erros.append(f"{arq.name}: faltam DELETEs para {faltam}")
            if tabelas != list(reversed(TABELAS_ORDEM)):
                erros.append(f"{arq.name}: ordem dos DELETEs não é a inversa das chaves estrangeiras")
            print(f"{arq.name}: {len(tabelas)} DELETEs")
            continue
        inserts = RE_INSERT.findall(sql)
        if len(inserts) != 1:
            erros.append(f"{arq.name}: esperado 1 INSERT, encontrado {len(inserts)}")
            continue
        tabela, colunas = inserts[0]
        if tabela not in TIPOS_TABELAS:
            erros.append(f"{arq.name}: tabela desconhecida rr_{tabela}")
            continue
        cols = [c.strip() for c in colunas.split(",")]
        if cols != list(TIPOS_TABELAS[tabela]):
            erros.append(f"{arq.name}: colunas diferentes do schema de rr_{tabela}")
        n = contar_tuplas(sql)
        if n > 400:
            erros.append(f"{arq.name}: {n} linhas (máximo 400)")
        contado[tabela] += n
        print(f"{arq.name}: rr_{tabela}, {n} linhas")
    for nome in TABELAS_ORDEM:
        if contado[nome] != esperado[nome]:
            erros.append(f"rr_{nome}: {contado[nome]} linhas nos seeds, {esperado[nome]} no CSV")
    if erros:
        print("\nERROS:")
        for e in erros:
            print("  - " + e)
        return 1
    print(f"\nOK: {len(arquivos)} arquivos, {sum(contado.values())} linhas, contagens iguais aos CSVs de {DIR_PROCESSED.name}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
