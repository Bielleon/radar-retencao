"""
03_exportar_artefatos.py — exportação dos artefatos de consumo.

(a) ``dashboard/public/demo/<chave>.json`` para todas as chaves lógicas da
    seção 6 da especificação, reproduzindo em pandas a lógica das views de
    ``supabase/migrations/0002_views_rr.sql`` (kpis, risco_loja,
    risco_segmento, colaboradores_risco, motivos_saida); as demais chaves são
    as próprias tabelas. Números como number, booleanos como boolean, datas
    "YYYY-MM-DD", nulos como null, jsonb como objeto. Médias arredondadas podem diferir
    em 0,0001 das views, porque Python arredonda float e o Postgres arredonda numeric.
(b) ``supabase/seed/*.sql``: ``00_limpar.sql`` (DELETE na ordem inversa das
    chaves estrangeiras) e arquivos numerados com ``INSERT INTO public.rr_<tabela>
    (colunas) VALUES (...),(...);`` com no máximo 400 linhas por arquivo.

Antes de escrever, apaga os JSONs e os seeds anteriores.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rr_comum import (  # noqa: E402
    DIR_DEMO, DIR_SEED, TABELAS_ORDEM, TIPOS_TABELAS, configurar_saida_utf8, dias, ler_csv_tabela, literal_sql,
    registros_json,
)

LINHAS_POR_ARQUIVO = 400
CHAVES_TABELAS = ["turnover_mensal", "curva_sobrevivencia", "fatores_globais", "efeito_fator", "metricas_modelo",
                  "avaliacao_vies", "parametros_custo", "recomendacoes", "modelos"]
NIVEIS_ALTOS = ("Alto", "Critico")


def registrar(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def carregar_tabelas() -> dict[str, pd.DataFrame]:
    """Lê todas as tabelas processadas com os tipos do contrato."""
    return {nome: ler_csv_tabela(nome) for nome in TABELAS_ORDEM}


def arred(v, casas: int = 4):
    """round(x::numeric, casas) com nulo preservado (como no SQL)."""
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return round(float(v), casas)


# ---------------------------------------------------------------------------
# Views reproduzidas em pandas
# ---------------------------------------------------------------------------
def view_colaboradores_risco(t: dict) -> list[dict]:
    """rr_vw_colaboradores_risco: predições x colaboradores ativos x lojas."""
    c = t["colaboradores"][t["colaboradores"]["status"] == "Ativo"]
    df = t["predicoes"].merge(c, on="colaborador_id", suffixes=("", "_c")).merge(t["lojas"], on="loja_id")
    colunas = ["colaborador_id", "loja_id", "bandeira", "regiao", "uf", "cidade", "tipo_loja", "cargo", "tipo_contrato",
               "faixa_salarial", "turno", "canal_contratacao", "data_admissao", "dias_de_casa", "risco_90d", "risco_180d",
               "nivel_risco", "fatores_top", "acao_recomendada", "onboarding_concluido", "avaliacao_experiencia_30d",
               "distancia_casa_trabalho_km", "faltas_30d", "atrasos_30d", "horas_treinamento_30d", "admitido_periodo_pico",
               "gestor_tempo_cargo_meses", "turnover_loja_12m"]
    tipos = {**TIPOS_TABELAS["colaboradores"], **TIPOS_TABELAS["lojas"], **TIPOS_TABELAS["predicoes"]}
    df = df.sort_values(["risco_90d", "colaborador_id"], ascending=[False, True])
    saida = []
    for linha in df[colunas].itertuples(index=False, name=None):
        saida.append({col: _json(v, tipos[col]) for col, v in zip(colunas, linha)})
    return saida


def _json(v, tipo):
    from rr_comum import valor_json
    return valor_json(v, tipo)


def view_risco_loja(t: dict) -> list[dict]:
    """rr_vw_risco_loja: headcount, ativos em janela e risco médio por loja."""
    lojas, colab, pred = t["lojas"], t["colaboradores"], t["predicoes"]
    ativos = colab[colab["status"] == "Ativo"]
    pa = pred.merge(ativos[["colaborador_id", "loja_id"]], on="colaborador_id")
    hc = ativos.groupby("loja_id").size()
    saida = []
    for l in lojas.sort_values("loja_id").itertuples(index=False):
        p = pa[pa["loja_id"] == l.loja_id]
        n_jan = int(len(p))
        n_alto = int(p["nivel_risco"].isin(NIVEIS_ALTOS).sum())
        saida.append({
            "loja_id": l.loja_id, "bandeira": l.bandeira, "tipo_loja": l.tipo_loja, "regiao": l.regiao, "uf": l.uf,
            "cidade": l.cidade, "porte": l.porte, "turnover_vol_12m": arred(l.turnover_vol_12m),
            "headcount_ativo": int(hc.get(l.loja_id, 0)), "ativos_em_janela": n_jan,
            "risco_medio_90d": arred(p["risco_90d"].mean()) if n_jan else None,
            "risco_medio_180d": arred(p["risco_180d"].mean()) if n_jan else None,
            "n_alto_risco": n_alto, "pct_alto_risco": arred(n_alto / n_jan) if n_jan else None,
        })
    return saida


def view_risco_segmento(t: dict, colab_risco: list[dict]) -> list[dict]:
    """rr_vw_risco_segmento: agregação da view de colaboradores em risco por dimensão."""
    base = pd.DataFrame(colab_risco)
    saida = []
    for dim in ["cargo", "regiao", "tipo_contrato", "bandeira", "faixa_salarial", "turno", "canal_contratacao"]:
        sub = base[base[dim].notna()]
        for cat, g in sub.groupby(dim, sort=True):
            n = int(len(g))
            n_alto = int(g["nivel_risco"].isin(NIVEIS_ALTOS).sum())
            saida.append({"dimensao": dim, "categoria": str(cat), "n": n, "risco_medio_90d": arred(g["risco_90d"].mean()),
                          "risco_medio_180d": arred(g["risco_180d"].mean()), "n_alto_risco": n_alto, "pct_alto_risco": arred(n_alto / n)})
    return saida


def view_kpis(t: dict) -> list[dict]:
    """rr_vw_kpis: indicadores executivos (array com um objeto)."""
    colab, pred, custo = t["colaboradores"], t["predicoes"], t["parametros_custo"]
    ref = pred["data_referencia"].max()
    chaves = ["recrutamento_selecao", "treinamento_integracao", "encargos_rescisorios", "produtividade_perdida", "vacancia_cobertura"]
    custo_por = float(custo[custo["chave"].isin(chaves)]["valor"].sum())
    ativos = colab[colab["status"] == "Ativo"]
    n_jan = int(len(pred))
    n_alto = int(pred["nivel_risco"].isin(NIVEIS_ALTOS).sum())
    vol = colab["tipo_desligamento"] == "Voluntario"
    inv = colab["tipo_desligamento"] == "Involuntario"
    c90 = colab["data_admissao"] <= ref - dias(90)
    c180 = colab["data_admissao"] <= ref - dias(180)
    ult12 = colab["data_desligamento"] > ref - dias(365)
    coorte_90, coorte_180 = int(c90.sum()), int(c180.sum())
    saidas_90 = int((c90 & vol & (colab["dias_de_casa"] <= 90)).sum())
    saidas_180 = int((c180 & vol & (colab["dias_de_casa"] <= 180)).sum())
    deslig_vol_12m = int((vol & ult12).sum())
    deslig_prec_12m = int((vol & ult12 & (colab["dias_de_casa"] <= 180)).sum())
    return [{
        "data_referencia": ref.strftime("%Y-%m-%d"),
        "headcount_ativo": int(len(ativos)),
        "novos_sem_checkpoint": int((ativos["dias_de_casa"] < 30).sum()),
        "ativos_ate_180d": int(ativos["dias_de_casa"].between(30, 180).sum()),
        "ativos_em_janela": n_jan, "n_alto_risco": n_alto, "n_critico": int((pred["nivel_risco"] == "Critico").sum()),
        "pct_alto_risco": arred(n_alto / n_jan) if n_jan else None,
        "risco_medio_90d": arred(pred["risco_90d"].mean()), "risco_medio_180d": arred(pred["risco_180d"].mean()),
        "taxa_saida_vol_90d": arred(saidas_90 / coorte_90) if coorte_90 else None,
        "taxa_saida_vol_180d": arred(saidas_180 / coorte_180) if coorte_180 else None,
        "deslig_vol_12m": deslig_vol_12m, "deslig_vol_precoces_12m": deslig_prec_12m, "deslig_invol_12m": int((inv & ult12).sum()),
        "custo_por_desligamento": custo_por, "custo_estimado_12m": round(deslig_prec_12m * custo_por, 2),
    }]


def view_motivos_saida(t: dict) -> list[dict]:
    """rr_vw_motivos_saida: motivos declarados de saída voluntária nos últimos 12 meses."""
    colab, pred = t["colaboradores"], t["predicoes"]
    ref = pred["data_referencia"].max()
    m = (colab["tipo_desligamento"] == "Voluntario") & (colab["data_desligamento"] > ref - dias(365)) & colab["motivo_desligamento"].notna()
    sub = colab[m]
    saida = []
    for motivo, g in sub.groupby("motivo_desligamento"):
        saida.append({"motivo": motivo, "n": int(len(g)), "n_ate_90d": int((g["dias_de_casa"] <= 90).sum()),
                      "n_ate_180d": int((g["dias_de_casa"] <= 180).sum())})
    return sorted(saida, key=lambda r: (-r["n"], r["motivo"]))


# ---------------------------------------------------------------------------
# Exportações
# ---------------------------------------------------------------------------
def limpar_demo() -> None:
    DIR_DEMO.mkdir(parents=True, exist_ok=True)
    for arq in DIR_DEMO.iterdir():
        if arq.suffix == ".json":
            arq.unlink()
            registrar(f"removido {arq.name}")


def exportar_demo(t: dict) -> dict[str, int]:
    """Grava a cópia JSON dos resultados e devolve a contagem de objetos por chave."""
    limpar_demo()
    colab_risco = view_colaboradores_risco(t)
    conjuntos = {
        "kpis": view_kpis(t), "turnover_mensal": registros_json(t["turnover_mensal"], "turnover_mensal"),
        "curva_sobrevivencia": registros_json(t["curva_sobrevivencia"], "curva_sobrevivencia"),
        "motivos_saida": view_motivos_saida(t), "risco_loja": view_risco_loja(t),
        "risco_segmento": view_risco_segmento(t, colab_risco), "colaboradores_risco": colab_risco,
    }
    for nome in CHAVES_TABELAS:
        conjuntos[nome] = registros_json(t[nome], nome)
    contagens = {}
    for chave, dados in conjuntos.items():
        caminho = DIR_DEMO / f"{chave}.json"
        caminho.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        json.loads(caminho.read_text(encoding="utf-8"))  # garante JSON válido
        contagens[chave] = len(dados)
    return contagens


def gerar_seeds(t: dict) -> list[Path]:
    """Gera supabase/seed/00_limpar.sql e os INSERTs numerados (<= 400 linhas por arquivo)."""
    DIR_SEED.mkdir(parents=True, exist_ok=True)
    for arq in DIR_SEED.glob("*.sql"):
        arq.unlink()
    gerados = []
    limpar = ["-- Radar de Retencao: limpeza das tabelas rr_ na ordem inversa das chaves estrangeiras (gerado pelo pipeline)"]
    limpar += [f"delete from public.rr_{nome};" for nome in reversed(TABELAS_ORDEM)]
    caminho = DIR_SEED / "00_limpar.sql"
    caminho.write_text("\n".join(limpar) + "\n", encoding="utf-8")
    gerados.append(caminho)
    for i, nome in enumerate(TABELAS_ORDEM, start=1):
        df = t[nome]
        tipos = TIPOS_TABELAS[nome]
        colunas = list(tipos)
        partes = [df.iloc[k:k + LINHAS_POR_ARQUIVO] for k in range(0, len(df), LINHAS_POR_ARQUIVO)] or [df]
        for p, parte in enumerate(partes, start=1):
            sufixo = f"_{p:03d}" if len(partes) > 1 else ""
            caminho = DIR_SEED / f"{i:02d}_{nome}{sufixo}.sql"
            linhas = [f"-- rr_{nome}: {len(parte)} linhas (parte {p}/{len(partes)}), gerado pelo pipeline",
                      f"insert into public.rr_{nome} ({', '.join(colunas)}) values"]
            valores = []
            for linha in parte[colunas].itertuples(index=False, name=None):
                valores.append("(" + ", ".join(literal_sql(v, tipos[c]) for c, v in zip(colunas, linha)) + ")")
            linhas.append(",\n".join(valores) + ";")
            caminho.write_text("\n".join(linhas) + "\n", encoding="utf-8")
            gerados.append(caminho)
    return gerados


def main() -> int:
    configurar_saida_utf8()
    t0 = time.time()
    t = carregar_tabelas()
    contagens = exportar_demo(t)
    for chave, n in contagens.items():
        registrar(f"demo/{chave}.json: {n} objetos")
    arquivos = gerar_seeds(t)
    registrar(f"{len(arquivos)} arquivos de seed gravados em {DIR_SEED}")
    registrar(f"Concluído em {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
