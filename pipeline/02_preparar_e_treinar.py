"""
02_preparar_e_treinar.py — preparação, treino, avaliação e explicabilidade.

Segue a seção 3 da especificação do MVP (contrato de modelagem):

* checkpoint de score no **dia 30** de casa; alvos ``y90`` e ``y180`` (saída
  voluntária até 90/180 dias); população de treino com janela completa e sem
  quem saiu antes do dia 30;
* variáveis preditoras da especificação (``faixa_etaria`` e ``loja_id`` ficam
  fora do modelo; ``faixa_etaria`` é usada só na auditoria de viés);
* divisão temporal (treino = admissões até 2025-12-31; teste = admissões de 2026
  com janela completa) + validação cruzada estratificada (5 folds) no treino;
* quatro modelos: regressão logística, random forest, gradient boosting
  (HistGradientBoosting) e XGBoost; métricas AUC-ROC, AUC-PR, Brier, recall e
  precisão no top 20%, F1 e calibração por decil;
* regra de seleção: maior AUC-ROC no teste temporal, com preferência pela
  regressão logística quando ela fica a menos de 0,01 do melhor;
* explicabilidade SHAP (TreeExplainer para árvores; coeficientes/LinearExplainer
  para a regressão logística) com fallback para permutation_importance;
* análises complementares: Kaplan-Meier, tendência mensal, custo do turnover,
  auditoria de viés, efeito por categoria e o card do simulador (regressão
  logística em escala padronizada), validado por recálculo em Python puro.

Saídas: ``data/processed/<tabela>.csv`` para todas as tabelas ``rr_``,
``pipeline/modelos/*`` (modelos .joblib, model_card.json, calibração, relatório)
e figuras em ``docs/img``.
"""
from __future__ import annotations

import json
import math
import sys
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from lifelines import KaplanMeierFitter  # noqa: E402
from sklearn.base import clone  # noqa: E402
from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier  # noqa: E402
from sklearn.impute import SimpleImputer  # noqa: E402
from sklearn.inspection import permutation_importance  # noqa: E402
from sklearn.linear_model import LogisticRegression  # noqa: E402
from sklearn.metrics import (average_precision_score, brier_score_loss, precision_recall_curve,  # noqa: E402
                             roc_auc_score, roc_curve)
from sklearn.model_selection import StratifiedKFold, cross_val_predict, cross_val_score  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder, StandardScaler  # noqa: E402
from xgboost import XGBClassifier  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rr_comum import (  # noqa: E402
    COLUNAS_COLABORADORES, COLUNAS_LOJAS, COR_GRADE, COR_SUPERFICIE, COR_TEXTO, COR_TEXTO_SEC, CORES_NIVEL,
    CORES_SERIE, DATA_INICIO, DATA_REFERENCIA, DIA_CHECKPOINT, DIR_IMG, DIR_MODELOS, DIR_PROCESSED, DIR_RAW,
    FEATURES, FEATURES_BOOL, FEATURES_CAT, FEATURES_NUM, HORIZONTES, LIMIARES_NIVEL, MESES_PT, MODELOS_NOMES,
    NIVEIS, RAMPA_AZUL, ROTULOS, SEMENTE, VERSAO_MODELO, configurar_saida_utf8, despejar_json, dias,
    escrever_csv_tabela, formatar_valor_fator, ler_csv_tabela, montar_acao_recomendada, nivel_risco,
    risco_vigente, rotulo_fator, tabela_parametros_custo, tabela_recomendacoes,
)

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)
DATA_CORTE_TREINO = pd.Timestamp("2025-12-31")
DATA_CORTE_RETROATIVO = pd.Timestamp("2024-12-31")   # validação retroativa: treino até 2024, teste em 2025
ORDEM_MODELOS = ["regressao_logistica", "random_forest", "gradient_boosting", "xgboost"]
N_FOLDS = 5
AMOSTRA_SHAP_GLOBAL = 1500      # linhas usadas para a importância global (média |SHAP|)

# Faixas legíveis para rr_efeito_fator (variáveis numéricas discretizadas)
FAIXAS_EFEITO = {
    "distancia_casa_trabalho_km": ([0, 5, 10, 20, 30, np.inf], ["0-5 km", "5-10 km", "10-20 km", "20-30 km", "30+ km"]),
    "avaliacao_experiencia_30d": ([0.99, 2.0, 3.0, 4.0, 5.01], ["1,0-2,0", "2,1-3,0", "3,1-4,0", "4,1-5,0"]),
    "faltas_30d": ([-0.5, 0.5, 1.5, 2.5, np.inf], ["0", "1", "2", "3+"]),
    "gestor_tempo_cargo_meses": ([-0.5, 5.5, 11.5, 23.5, np.inf], ["0-5 meses", "6-11 meses", "12-23 meses", "24+ meses"]),
}
FATORES_EFEITO = ["tipo_contrato", "cargo", "distancia_casa_trabalho_km", "onboarding_concluido",
                  "avaliacao_experiencia_30d", "faltas_30d", "turno", "canal_contratacao", "faixa_salarial",
                  "gestor_tempo_cargo_meses"]
ORDEM_CATEGORIAS = {
    "tipo_contrato": ["CLT Efetivo", "Temporario Sazonal", "Jovem Aprendiz", "Intermitente"],
    "cargo": ["Vendedor", "Operador de Caixa", "Estoquista", "Lider de Loja", "Gerente de Loja"],
    "turno": ["Manha", "Tarde", "Noite", "Integral"],
    "canal_contratacao": ["Indicacao", "Site/Portal", "Agencia", "Programa Jovem", "Recontratacao"],
    "faixa_salarial": ["Ate 1.5 SM", "1.5 a 2 SM", "2 a 3 SM", "3 a 5 SM", "Acima de 5 SM"],
    "faixa_etaria": ["18-24", "25-34", "35-44", "45-54", "55+"],
    "escolaridade": ["Fundamental", "Medio", "Superior Incompleto", "Superior Completo"],
    "regiao": ["Sudeste", "Sul", "Nordeste", "Norte", "Centro-Oeste"],
}


def registrar(msg: str) -> None:
    """Log simples com carimbo de tempo."""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------------------
# 1) Carga e construção da base analítica
# ---------------------------------------------------------------------------
def carregar_base(dir_raw: Path = DIR_RAW) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Lê lojas e colaboradores de data/raw com os tipos do contrato."""
    lojas = ler_csv_tabela("lojas", dir_raw / "lojas.csv")
    colab = ler_csv_tabela("colaboradores", dir_raw / "colaboradores.csv")
    return lojas, colab


def montar_base_analitica(colab: pd.DataFrame, lojas: pd.DataFrame) -> pd.DataFrame:
    """Junta atributos da loja, cria alvos, janelas de observação e o indicador de ausência."""
    base = colab.merge(lojas[["loja_id", "bandeira", "tipo_loja", "regiao", "porte"]], on="loja_id", how="left")
    voluntario = base["tipo_desligamento"] == "Voluntario"
    for nome, h in HORIZONTES.items():
        base[f"y{h}"] = (voluntario & (base["dias_de_casa"] <= h)).astype(int)
        base[f"janela_{h}"] = base["data_admissao"] <= DATA_REFERENCIA - dias(h)
    base["passou_checkpoint"] = base["dias_de_casa"] >= DIA_CHECKPOINT
    base["avaliacao_experiencia_30d_ausente"] = base["avaliacao_experiencia_30d"].isna().astype(int)
    base["ano_admissao"] = base["data_admissao"].dt.year
    return base


def populacao_treino(base: pd.DataFrame, h: int) -> pd.DataFrame:
    """Admitidos com janela completa para o horizonte e que passaram do dia 30."""
    return base[base[f"janela_{h}"] & base["passou_checkpoint"]].copy()


def populacao_escorada(base: pd.DataFrame) -> pd.DataFrame:
    """Ativos com 30 <= dias_de_casa <= 180 (população do dashboard)."""
    m = (base["status"] == "Ativo") & (base["dias_de_casa"] >= DIA_CHECKPOINT) & (base["dias_de_casa"] <= 180)
    return base[m].copy()


def preparar_X(df: pd.DataFrame) -> pd.DataFrame:
    """Matriz de variáveis preditoras na ordem FEATURES (categóricas como texto, numéricas como float)."""
    X = pd.DataFrame(index=df.index)
    for col in FEATURES_CAT:
        X[col] = df[col].astype(str)
    for col in FEATURES_NUM:
        if col in FEATURES_BOOL:
            X[col] = df[col].map(lambda v: np.nan if v is None or (isinstance(v, float) and np.isnan(v)) else float(bool(v))).astype(float)
        else:
            X[col] = pd.to_numeric(df[col], errors="coerce").astype(float)
    return X[FEATURES]


# ---------------------------------------------------------------------------
# 2) Modelos
# ---------------------------------------------------------------------------
def construir_preprocessador(padronizar: bool) -> ColumnTransformer:
    """Imputação pela média (+ padronização para a RL) e one-hot para categóricas."""
    etapas_num = [("imputar", SimpleImputer(strategy="mean"))]
    if padronizar:
        etapas_num.append(("escalar", StandardScaler()))
    return ColumnTransformer([
        ("num", Pipeline(etapas_num), FEATURES_NUM),
        ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), FEATURES_CAT),
    ])


def construir_modelos() -> dict[str, Pipeline]:
    """Os quatro modelos comparados, cada um como Pipeline(pré-processamento + estimador)."""
    return {
        "regressao_logistica": Pipeline([
            ("pre", construir_preprocessador(padronizar=True)),
            ("modelo", LogisticRegression(C=0.5, max_iter=5000, random_state=SEMENTE)),
        ]),
        "random_forest": Pipeline([
            ("pre", construir_preprocessador(padronizar=False)),
            ("modelo", RandomForestClassifier(n_estimators=300, min_samples_leaf=10, max_depth=12,
                                              max_features="sqrt", n_jobs=-1, random_state=SEMENTE)),
        ]),
        "gradient_boosting": Pipeline([
            ("pre", construir_preprocessador(padronizar=False)),
            ("modelo", HistGradientBoostingClassifier(learning_rate=0.05, max_iter=300, max_leaf_nodes=15,
                                                      min_samples_leaf=30, l2_regularization=1.0,
                                                      random_state=SEMENTE)),
        ]),
        "xgboost": Pipeline([
            ("pre", construir_preprocessador(padronizar=False)),
            ("modelo", XGBClassifier(n_estimators=400, learning_rate=0.04, max_depth=4, subsample=0.8,
                                     colsample_bytree=0.8, min_child_weight=5, reg_lambda=1.0,
                                     tree_method="hist", eval_metric="logloss", n_jobs=4, random_state=SEMENTE)),
        ]),
    }


def dividir_temporal(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Treino = admissões até 2025-12-31; teste = admissões de 2026 (com janela completa)."""
    treino = (df["data_admissao"] <= DATA_CORTE_TREINO).to_numpy()
    return treino, ~treino


def avaliar(y: np.ndarray, p: np.ndarray) -> dict[str, float]:
    """Métricas do contrato para um vetor de probabilidades."""
    y = np.asarray(y).astype(int)
    p = np.asarray(p).astype(float)
    k = max(1, int(math.ceil(0.2 * len(p))))
    ordem = np.argsort(-p, kind="stable")
    top = np.zeros(len(p), dtype=bool)
    top[ordem[:k]] = True
    positivos = max(int(y.sum()), 1)
    precisao, recall, limiares = precision_recall_curve(y, p)
    f1 = 2 * precisao * recall / np.clip(precisao + recall, 1e-12, None)
    f1 = f1[:-1]  # o último ponto não tem limiar
    i_melhor = int(np.argmax(f1)) if len(f1) else 0
    return {
        "auc_roc": float(roc_auc_score(y, p)),
        "auc_pr": float(average_precision_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "recall_top20": float(y[top].sum() / positivos),
        "precisao_top20": float(y[top].mean()),
        "f1": float(f1[i_melhor]) if len(f1) else 0.0,
        "limiar_f1": float(limiares[i_melhor]) if len(limiares) else 0.5,
        "taxa_base": float(y.mean()),
    }


def treinar_e_avaliar(pop: pd.DataFrame, h: int) -> dict:
    """Treina os quatro modelos no treino temporal, avalia no teste e faz CV no treino."""
    X = preparar_X(pop)
    y = pop[f"y{h}"].to_numpy()
    m_treino, m_teste = dividir_temporal(pop)
    X_tr, y_tr, X_te, y_te = X[m_treino], y[m_treino], X[m_teste], y[m_teste]
    registrar(f"[{h}d] treino={len(X_tr)} (taxa {y_tr.mean():.3f}) | teste={len(X_te)} (taxa {y_te.mean():.3f})")
    cv = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEMENTE)
    resultados = {}
    for nome, pipeline in construir_modelos().items():
        t0 = time.time()
        aucs = cross_val_score(clone(pipeline), X_tr, y_tr, cv=cv, scoring="roc_auc")
        pipeline.fit(X_tr, y_tr)
        p_te = pipeline.predict_proba(X_te)[:, 1]
        metricas = avaliar(y_te, p_te)
        metricas["auc_cv_media"] = float(aucs.mean())
        metricas["auc_cv_desvio"] = float(aucs.std())
        resultados[nome] = {"pipeline": pipeline, "metricas": metricas, "p_teste": p_te}
        registrar(f"[{h}d] {nome}: AUC teste {metricas['auc_roc']:.3f} | AUC-PR {metricas['auc_pr']:.3f} "
                  f"| CV {aucs.mean():.3f}±{aucs.std():.3f} | {time.time() - t0:.1f}s")
    return {"resultados": resultados, "X": X, "y": y, "m_treino": m_treino, "m_teste": m_teste}


def selecionar_modelo(resultados: dict) -> str:
    """Maior AUC-ROC no teste; a RL vence se ficar a menos de 0,01 do melhor."""
    aucs = {nome: r["metricas"]["auc_roc"] for nome, r in resultados.items()}
    melhor = max(aucs, key=aucs.get)
    if aucs["regressao_logistica"] >= aucs[melhor] - 0.01:
        return "regressao_logistica"
    return melhor


def validacao_retroativa(base: pd.DataFrame) -> pd.DataFrame:
    """Regressão logística treinada até 2024 e testada nas admissões de 2025, que incluem picos.

    O teste temporal oficial (admissões de 2026 com janela completa) não contém nenhuma admissão
    de pico; esta validação mede o desempenho nesse regime. Não altera os modelos publicados.
    """
    linhas = []
    for horizonte, h in HORIZONTES.items():
        pop = populacao_treino(base, h)
        X, y = preparar_X(pop), pop[f"y{h}"].to_numpy()
        m_tr = (pop["data_admissao"] <= DATA_CORTE_RETROATIVO).to_numpy()
        m_te = ((pop["data_admissao"] > DATA_CORTE_RETROATIVO) & (pop["data_admissao"] <= DATA_CORTE_TREINO)).to_numpy()
        modelo = construir_modelos()["regressao_logistica"].fit(X[m_tr], y[m_tr])
        p = modelo.predict_proba(X[m_te])[:, 1]
        y_te = y[m_te]
        pico = pop.loc[m_te, "admitido_periodo_pico"].astype(bool).to_numpy()
        temporario = (pop.loc[m_te, "tipo_contrato"] == "Temporario Sazonal").to_numpy()
        for recorte, m in [("Geral", np.ones(len(y_te), dtype=bool)), ("Admissões de pico", pico),
                           ("Admissões fora do pico", ~pico), ("Temporários sazonais", temporario)]:
            linhas.append({"horizonte": horizonte, "recorte": recorte, "n": int(m.sum()), "taxa_real": round(float(y_te[m].mean()), 4),
                           "risco_medio_previsto": round(float(p[m].mean()), 4), "auc_roc": round(float(roc_auc_score(y_te[m], p[m])), 4)})
    return pd.DataFrame(linhas)


def calibracao_por_nivel(y: np.ndarray, p: np.ndarray) -> pd.DataFrame:
    """Risco médio previsto x taxa real por nível de risco (limiares do contrato)."""
    df = pd.DataFrame({"y": np.asarray(y), "p": np.asarray(p)})
    df["nivel"] = df["p"].map(nivel_risco)
    tab = df.groupby("nivel").agg(n=("y", "size"), risco_medio_previsto=("p", "mean"), taxa_real=("y", "mean")).reindex(NIVEIS).dropna().reset_index()
    tab["n"] = tab["n"].astype(int)
    return tab.round(4)


def calibracao_por_decil(y: np.ndarray, p: np.ndarray) -> pd.DataFrame:
    """Tabela de calibração: risco médio previsto x taxa real por decil de risco."""
    df = pd.DataFrame({"y": np.asarray(y), "p": np.asarray(p)})
    df["decil"] = pd.qcut(df["p"].rank(method="first"), 10, labels=False) + 1
    tab = df.groupby("decil").agg(n=("y", "size"), risco_medio_previsto=("p", "mean"), taxa_real=("y", "mean"),
                                  limite_inf=("p", "min"), limite_sup=("p", "max")).reset_index()
    return tab.round(4)


# ---------------------------------------------------------------------------
# 3) Explicabilidade
# ---------------------------------------------------------------------------
def mapa_colunas_transformadas(pre: ColumnTransformer) -> list[str]:
    """Para cada coluna da matriz transformada, a variável original correspondente."""
    origem = []
    for nome, transformador, colunas in pre.transformers_:
        if nome == "num":
            origem.extend(list(colunas))
        elif nome == "cat":
            for col, cats in zip(colunas, transformador.categories_):
                origem.extend([col] * len(cats))
    return origem


def _matriz_classe_positiva(valores) -> np.ndarray:
    """Normaliza a saída do SHAP para uma matriz (n x p) da classe positiva."""
    if isinstance(valores, list):
        return np.asarray(valores[1] if len(valores) > 1 else valores[0])
    arr = np.asarray(valores)
    if arr.ndim == 3:
        return arr[:, :, 1] if arr.shape[2] > 1 else arr[:, :, 0]
    return arr


def contribuicoes_por_variavel(pipeline: Pipeline, nome_modelo: str, X: pd.DataFrame, X_fundo: pd.DataFrame | None = None):
    """Contribuições por variável original (SHAP agregado sobre as colunas one-hot).

    * random_forest / gradient_boosting / xgboost: ``shap.TreeExplainer``;
    * regressao_logistica: contribuições lineares ``coef x (x_padronizado - média)``
      (equivalentes ao LinearExplainer com perturbação interventiva).
    Devolve (matriz n x len(FEATURES), método, escala).
    """
    pre = pipeline.named_steps["pre"]
    modelo = pipeline.named_steps["modelo"]
    Xt = np.asarray(pre.transform(X), dtype=float)
    origem = mapa_colunas_transformadas(pre)
    if nome_modelo == "regressao_logistica":
        fundo = Xt if X_fundo is None else np.asarray(pre.transform(X_fundo), dtype=float)
        contrib = (Xt - fundo.mean(axis=0)) * modelo.coef_[0]
        metodo, escala = "coeficientes da regressão logística (equivalente ao LinearExplainer)", "log-odds"
    else:
        import shap
        explicador = shap.TreeExplainer(modelo)
        contrib = _matriz_classe_positiva(explicador.shap_values(Xt, check_additivity=False))
        metodo = "shap.TreeExplainer"
        escala = "probabilidade" if nome_modelo == "random_forest" else "log-odds"
    agregado = pd.DataFrame(contrib, columns=range(contrib.shape[1]), index=X.index)
    agregado = agregado.T.groupby(np.array(origem)).sum().T
    agregado = agregado.reindex(columns=FEATURES, fill_value=0.0)
    return agregado, metodo, escala


def explicar_com_fallback(pipeline: Pipeline, nome_modelo: str, X: pd.DataFrame, X_fundo: pd.DataFrame,
                          rl_pipeline: Pipeline, y_fundo: np.ndarray, log: list[str]):
    """SHAP do modelo selecionado; se falhar, permutation_importance (global) + contribuições da RL (individual)."""
    try:
        contrib, metodo, escala = contribuicoes_por_variavel(pipeline, nome_modelo, X, X_fundo)
        contrib_fundo, _, _ = contribuicoes_por_variavel(pipeline, nome_modelo, X_fundo, X_fundo)
        return {"individual": contrib, "global": contrib_fundo, "metodo": metodo, "escala": escala, "fallback": False}
    except Exception as exc:  # noqa: BLE001 — qualquer falha do SHAP ativa o fallback documentado
        msg = f"SHAP falhou para {nome_modelo} ({type(exc).__name__}: {exc}); usando permutation_importance + contribuições da RL."
        registrar("AVISO: " + msg)
        log.append(msg)
        perm = permutation_importance(pipeline, X_fundo, y_fundo, scoring="roc_auc", n_repeats=5, random_state=SEMENTE, n_jobs=1)
        importancia = pd.DataFrame([perm.importances_mean], columns=FEATURES)
        contrib_rl, _, _ = contribuicoes_por_variavel(rl_pipeline, "regressao_logistica", X, X_fundo)
        return {"individual": contrib_rl, "global": importancia, "metodo": "permutation_importance (global) + coeficientes da RL (individual)",
                "escala": "queda de AUC (global) / log-odds (individual)", "fallback": True}


def direcao_do_fator(fator: str, valores: pd.Series, contrib: pd.Series) -> str:
    """Direção do efeito: correlação entre o valor da variável e a contribuição (numéricas)."""
    if fator in FEATURES_CAT:
        return "misto"
    x = pd.to_numeric(valores, errors="coerce")
    if x.nunique(dropna=True) < 2 or contrib.std() == 0:
        return "misto"
    r = np.corrcoef(x.fillna(x.mean()), contrib)[0, 1]
    if np.isnan(r):
        return "misto"
    return "aumenta" if r > 0.1 else ("reduz" if r < -0.1 else "misto")


def fatores_globais(contrib_global: pd.DataFrame, X_fundo: pd.DataFrame, horizonte: str, fallback: bool) -> pd.DataFrame:
    """Top 15 variáveis por média |SHAP| (ou importância por permutação no fallback)."""
    if fallback:
        importancia = contrib_global.iloc[0].clip(lower=0)
    else:
        importancia = contrib_global.abs().mean()
    linhas = []
    for fator, imp in importancia.sort_values(ascending=False).head(15).items():
        direcao = "misto" if fallback else direcao_do_fator(fator, X_fundo[fator], contrib_global[fator])
        linhas.append({"horizonte": horizonte, "fator": fator, "rotulo": ROTULOS[fator], "importancia": round(float(imp), 5), "direcao": direcao})
    df = pd.DataFrame(linhas)
    df["posicao"] = range(1, len(df) + 1)
    return df


def fatores_top_individuais(contrib_linha: pd.Series, registro: pd.Series) -> list[dict]:
    """Os 3 fatores de maior |contribuição| no formato JSON da seção 6."""
    top = contrib_linha.abs().sort_values(ascending=False).head(3).index
    saida = []
    for fator in top:
        valor = registro.get(fator)
        if fator == "avaliacao_experiencia_30d_ausente":
            valor = registro.get("avaliacao_experiencia_30d_ausente", 0)
        contrib = float(contrib_linha[fator])
        saida.append({
            "fator": fator,
            "rotulo": rotulo_fator(fator, valor if fator in FEATURES_BOOL else None),
            "valor": formatar_valor_fator(fator, valor),
            "contribuicao": round(contrib, 4),
            "direcao": "aumenta" if contrib > 0 else "reduz",
        })
    return saida


# ---------------------------------------------------------------------------
# 4) Análises complementares
# ---------------------------------------------------------------------------
def curvas_sobrevivencia(colab: pd.DataFrame, lojas: pd.DataFrame) -> pd.DataFrame:
    """Kaplan-Meier (evento = saída voluntária; censura = ativo ou saída involuntária), dias 0..365 de 5 em 5."""
    df = colab.merge(lojas[["loja_id", "regiao"]], on="loja_id", how="left")
    df["evento"] = (df["tipo_desligamento"] == "Voluntario").astype(int)
    df["pico"] = df["admitido_periodo_pico"].map({True: "Sim", False: "Nao"})
    tempos = np.arange(0, 366, 5)
    segmentos = [("geral", None), ("tipo_contrato", "tipo_contrato"), ("cargo", "cargo"), ("regiao", "regiao"),
                 ("admitido_periodo_pico", "pico")]
    linhas = []
    for seg_tipo, col in segmentos:
        grupos = [("geral", df)] if col is None else [(str(v), g) for v, g in df.groupby(col)]
        for valor, g in grupos:
            kmf = KaplanMeierFitter()
            kmf.fit(g["dias_de_casa"].astype(float), g["evento"])
            prob = kmf.survival_function_at_times(tempos).to_numpy()
            T = g["dias_de_casa"].to_numpy()
            for dia, p in zip(tempos, prob):
                linhas.append({"segmento_tipo": seg_tipo, "segmento_valor": valor, "dia": int(dia),
                               "prob_permanencia": round(float(p), 4), "n_risco": int((T >= dia).sum())})
    return pd.DataFrame(linhas)


def turnover_mensal(colab: pd.DataFrame) -> pd.DataFrame:
    """Admissões, desligamentos, headcount médio e taxas por mês (2023-01 a 2026-10)."""
    grade = pd.date_range(DATA_INICIO, DATA_REFERENCIA, freq="D")
    adm = colab["data_admissao"].value_counts().reindex(grade, fill_value=0).to_numpy()
    saidas = colab["data_desligamento"].dropna().value_counts().reindex(grade, fill_value=0).to_numpy()
    # ativo no dia d: admitido até d e sem desligamento até d (o dia do desligamento já não conta)
    ativos = np.cumsum(adm) - np.cumsum(saidas)
    diario = pd.DataFrame({"dia": grade, "ativos": ativos})
    diario["mes"] = diario["dia"].dt.to_period("M")
    headcount = diario.groupby("mes")["ativos"].mean()
    meses = pd.period_range(DATA_INICIO, DATA_REFERENCIA, freq="M")
    desl = colab.dropna(subset=["data_desligamento"]).copy()
    desl["mes"] = desl["data_desligamento"].dt.to_period("M")
    vol = desl[desl["tipo_desligamento"] == "Voluntario"]
    linhas = []
    for per in meses:
        n_vol = int((vol["mes"] == per).sum())
        n_inv = int(((desl["mes"] == per) & (desl["tipo_desligamento"] == "Involuntario")).sum())
        n_prec = int(((vol["mes"] == per) & (vol["dias_de_casa"] <= 180)).sum())
        hc = float(headcount.get(per, 0.0))
        linhas.append({
            "mes": per.to_timestamp(), "admissoes": int((colab["data_admissao"].dt.to_period("M") == per).sum()),
            "desligamentos_voluntarios": n_vol, "desligamentos_involuntarios": n_inv, "desligamentos_vol_precoces": n_prec,
            "headcount_medio": round(hc, 1),
            "taxa_turnover_vol": round(n_vol / hc, 4) if hc > 0 else None,
            "taxa_turnover_total": round((n_vol + n_inv) / hc, 4) if hc > 0 else None,
            "periodo_pico": per.month in (9, 10, 11, 12),
            "campanha": "Dia das Criancas" if per.month in (9, 10) else ("Natal" if per.month in (11, 12) else None),
        })
    return pd.DataFrame(linhas)


def categorizar_fator(fator: str, serie: pd.Series) -> pd.Series:
    """Categoria legível de um fator (faixas para numéricos; valores para categóricos)."""
    if fator == "onboarding_concluido":
        return serie.map(lambda v: "Sim" if bool(v) else "Nao")
    if fator == "avaliacao_experiencia_30d":
        cortes, rotulos = FAIXAS_EFEITO[fator]
        cat = pd.cut(pd.to_numeric(serie, errors="coerce"), bins=cortes, labels=rotulos).astype(object)
        return cat.where(serie.notna(), "Nao avaliado")
    if fator in FAIXAS_EFEITO:
        cortes, rotulos = FAIXAS_EFEITO[fator]
        return pd.cut(pd.to_numeric(serie, errors="coerce"), bins=cortes, labels=rotulos).astype(object)
    return serie.astype(str)


def ordem_categorias(fator: str) -> list[str]:
    if fator == "onboarding_concluido":
        return ["Sim", "Nao"]
    if fator == "avaliacao_experiencia_30d":
        return ["Nao avaliado"] + FAIXAS_EFEITO[fator][1]
    if fator in FAIXAS_EFEITO:
        return FAIXAS_EFEITO[fator][1]
    return ORDEM_CATEGORIAS[fator]


def efeito_fator(pop: pd.DataFrame, p_oof: np.ndarray, horizonte: str, h: int) -> pd.DataFrame:
    """Taxa real e risco médio (previsão fora da amostra) por categoria de 10 fatores."""
    linhas = []
    y = pop[f"y{h}"].to_numpy()
    for fator in FATORES_EFEITO:
        cats = categorizar_fator(fator, pop[fator])
        for ordem, categoria in enumerate(ordem_categorias(fator), start=1):
            m = (cats == categoria).to_numpy()
            if m.sum() == 0:
                continue
            linhas.append({"horizonte": horizonte, "fator": fator, "rotulo_fator": ROTULOS[fator], "categoria": categoria,
                           "ordem": ordem, "n": int(m.sum()), "taxa_real": round(float(y[m].mean()), 4),
                           "risco_medio": round(float(p_oof[m].mean()), 4)})
    return pd.DataFrame(linhas)


def avaliacao_vies(pop: pd.DataFrame, p_oof: np.ndarray, horizonte: str, h: int) -> pd.DataFrame:
    """Métricas por grupo (faixa etária, região, escolaridade) com previsões fora da amostra."""
    linhas = []
    y = pop[f"y{h}"].to_numpy()
    alto = p_oof >= LIMIARES_NIVEL["Alto"]
    for grupo_tipo in ["faixa_etaria", "regiao", "escolaridade"]:
        for valor in ordem_categorias(grupo_tipo):
            m = (pop[grupo_tipo] == valor).to_numpy()
            if m.sum() == 0:
                continue
            auc = None
            if m.sum() >= 30 and len(np.unique(y[m])) == 2:
                auc = round(float(roc_auc_score(y[m], p_oof[m])), 4)
            linhas.append({"horizonte": horizonte, "grupo_tipo": grupo_tipo, "grupo_valor": valor, "n": int(m.sum()),
                           "taxa_real": round(float(y[m].mean()), 4), "risco_medio_previsto": round(float(p_oof[m].mean()), 4),
                           "auc": auc, "taxa_alto_risco": round(float(alto[m].mean()), 4)})
    return pd.DataFrame(linhas)


# ---------------------------------------------------------------------------
# 5) Card do simulador (regressão logística em escala padronizada)
# ---------------------------------------------------------------------------
LIMITES_INPUT = {
    "carga_horaria_semanal": (20, 44, 1), "distancia_casa_trabalho_km": (0, 60, 1), "horas_treinamento_30d": (0, 40, 1),
    "avaliacao_experiencia_30d": (1, 5, 0.1), "faltas_30d": (0, 10, 1), "atrasos_30d": (0, 12, 1),
    "horas_extras_media_semana": (0, 15, 0.5), "gestor_tempo_cargo_meses": (0, 120, 1), "turnover_loja_12m": (0, 1, 0.01),
}


def _arredondar_ao_passo(v: float, passo: float) -> float:
    r = round(round(v / passo) * passo, 2)
    return int(r) if float(passo).is_integer() else r


def montar_inputs_card(pop: pd.DataFrame) -> list[dict]:
    """Descrição de cada variável preditora para o formulário do simulador."""
    inputs = []
    for feature in FEATURES:
        rotulo = ROTULOS[feature]
        if feature == "avaliacao_experiencia_30d_ausente":
            continue  # derivado no navegador quando a avaliação é nula
        if feature in FEATURES_BOOL:
            padrao = bool(pop[feature].astype(float).round().mode().iloc[0])
            if feature == "admitido_periodo_pico":
                # o pico é função do mês de admissão: o padrão precisa ser coerente com o mês padrão
                padrao = int(pop["mes_admissao"].astype(str).mode().iloc[0]) in (9, 10, 11, 12)
            inputs.append({"feature": feature, "rotulo": rotulo, "tipo": "bool", "padrao": padrao})
        elif feature in FEATURES_CAT:
            opcoes = ordem_categorias(feature) if feature in ORDEM_CATEGORIAS else sorted(pop[feature].astype(str).unique(),
                                                                                           key=lambda v: (int(v) if v.isdigit() else 0, v))
            if feature == "mes_admissao":
                opcoes = [str(m) for m in range(1, 13)]
            if feature == "bandeira":
                opcoes = ["Ri Happy", "PBKids", "Divertudo", "Newtoys"]
            if feature == "tipo_loja":
                opcoes = ["Shopping", "Rua", "Outlet"]
            if feature == "porte":
                opcoes = ["Pequena", "Media", "Grande"]
            padrao = str(pop[feature].astype(str).mode().iloc[0])
            inputs.append({"feature": feature, "rotulo": rotulo, "tipo": "cat", "opcoes": opcoes, "padrao": padrao})
        else:
            lo, hi, passo = LIMITES_INPUT[feature]
            mediana = float(pd.to_numeric(pop[feature], errors="coerce").median())
            item = {"feature": feature, "rotulo": rotulo, "tipo": "num", "min": lo, "max": hi, "passo": passo,
                    "padrao": _arredondar_ao_passo(mediana, passo)}
            if feature == "avaliacao_experiencia_30d":
                item["permite_nulo"] = True
                item["termo_ausente"] = "avaliacao_experiencia_30d_ausente"
            if feature == "turnover_loja_12m":
                item["descricao"] = "Proxy sintético: base latente da loja com ruído individual; não é o turnover realizado do Mapa de Risco."
            inputs.append(item)
    return inputs


def termos_simulador(rl: Pipeline, X_fundo: pd.DataFrame) -> dict:
    """Intercepto e termos (num padronizados / cat one-hot) da regressão logística ajustada.

    ``referencia`` é a contribuição média do termo na amostra de fundo: o navegador a subtrai
    apenas na exibição dos fatores, para que o ranking seja o mesmo de ``fatores_top``; o logit
    continua usando a contribuição sem esse ajuste.
    """
    pre = rl.named_steps["pre"]
    modelo = rl.named_steps["modelo"]
    coef = modelo.coef_[0]
    medias_fundo = np.asarray(pre.transform(X_fundo), dtype=float).mean(axis=0)
    escalar = pre.named_transformers_["num"].named_steps["escalar"]
    ohe = pre.named_transformers_["cat"]
    termos = []
    pos = 0
    for j, feature in enumerate(FEATURES_NUM):
        termos.append({"feature": feature, "tipo": "num", "media": float(escalar.mean_[j]), "desvio": float(escalar.scale_[j]),
                       "coef": float(coef[pos]), "referencia": float(coef[pos] * medias_fundo[pos])})
        pos += 1
    for feature, cats in zip(FEATURES_CAT, ohe.categories_):
        coefs = {str(c): float(coef[pos + i]) for i, c in enumerate(cats)}
        referencia = float(sum(coef[pos + i] * medias_fundo[pos + i] for i in range(len(cats))))
        pos += len(cats)
        termos.append({"feature": feature, "tipo": "cat", "coefs": coefs, "referencia": referencia})
    return {"intercepto": float(modelo.intercept_[0]), "termos": termos}


def calcular_risco_card(card: dict, registro: dict, horizonte: str) -> float:
    """Recalcula o risco em Python puro a partir do card (mesma fórmula do navegador)."""
    sim = card["simulador"][horizonte]
    logit = sim["intercepto"]
    for termo in sim["termos"]:
        f = termo["feature"]
        if termo["tipo"] == "num":
            x = registro.get(f)
            if x is None or (isinstance(x, float) and math.isnan(x)):
                x = termo["media"]
            x = float(x) if not isinstance(x, bool) else (1.0 if x else 0.0)
            logit += termo["coef"] * (x - termo["media"]) / termo["desvio"]
        else:
            logit += termo["coefs"].get(str(registro.get(f)), 0.0)
    return 1.0 / (1.0 + math.exp(-logit))


def registro_para_card(linha: pd.Series) -> dict:
    """Converte uma linha de X em dicionário (nulos como None; booleanos como bool)."""
    reg = {}
    for f in FEATURES:
        v = linha[f]
        if f in FEATURES_CAT:
            reg[f] = str(v)
        elif isinstance(v, float) and np.isnan(v):
            reg[f] = None
        elif f in FEATURES_BOOL:
            reg[f] = bool(v)
        else:
            reg[f] = float(v)
    reg["avaliacao_experiencia_30d_ausente"] = 1.0 if reg["avaliacao_experiencia_30d"] is None else 0.0
    return reg


def validar_card(card: dict, rls: dict[str, Pipeline], X: pd.DataFrame, n: int = 30) -> float:
    """Compara o cálculo em Python puro com predict_proba da RL em ``n`` colaboradores."""
    rng = np.random.default_rng(SEMENTE)
    com_nulo = X.index[X["avaliacao_experiencia_30d"].isna()]
    sem_nulo = X.index[X["avaliacao_experiencia_30d"].notna()]
    idx = list(rng.choice(sem_nulo, size=min(n - 5, len(sem_nulo)), replace=False)) + list(rng.choice(com_nulo, size=min(5, len(com_nulo)), replace=False))
    amostra = X.loc[idx]
    pior = 0.0
    for horizonte, rl in rls.items():
        p_modelo = rl.predict_proba(amostra)[:, 1]
        for (_, linha), p in zip(amostra.iterrows(), p_modelo):
            p_card = calcular_risco_card(card, registro_para_card(linha), horizonte)
            pior = max(pior, abs(p_card - float(p)))
    if pior >= 1e-6:
        raise RuntimeError(f"Validação do card falhou: diferença máxima {pior:.2e} >= 1e-6")
    registrar(f"Card validado em {len(amostra)} colaboradores x {len(rls)} horizontes: diferença máxima {pior:.2e}")
    return pior


# ---------------------------------------------------------------------------
# 6) Figuras (matplotlib, títulos em português, dpi 150)
# ---------------------------------------------------------------------------
def _estilo_eixos(ax, titulo: str, xlabel: str, ylabel: str) -> None:
    ax.set_title(titulo, color=COR_TEXTO, fontsize=12, loc="left", pad=12)
    ax.set_xlabel(xlabel, color=COR_TEXTO_SEC)
    ax.set_ylabel(ylabel, color=COR_TEXTO_SEC)
    ax.set_facecolor(COR_SUPERFICIE)
    ax.grid(True, color=COR_GRADE, linewidth=0.8)
    ax.set_axisbelow(True)
    for lado in ("top", "right"):
        ax.spines[lado].set_visible(False)
    for lado in ("left", "bottom"):
        ax.spines[lado].set_color(COR_GRADE)
    ax.tick_params(colors=COR_TEXTO_SEC)


def _salvar(fig, nome: str) -> Path:
    DIR_IMG.mkdir(parents=True, exist_ok=True)
    caminho = DIR_IMG / nome
    fig.patch.set_facecolor(COR_SUPERFICIE)
    fig.tight_layout()
    fig.savefig(caminho, dpi=150)
    plt.close(fig)
    return caminho


def figura_roc(treino: dict, horizonte: str) -> Path:
    fig, ax = plt.subplots(figsize=(7, 5.5))
    y_te = treino["y"][treino["m_teste"]]
    for i, nome in enumerate(ORDEM_MODELOS):
        r = treino["resultados"][nome]
        fpr, tpr, _ = roc_curve(y_te, r["p_teste"])
        ax.plot(fpr, tpr, color=CORES_SERIE[i], linewidth=2, label=f"{MODELOS_NOMES[nome]} (AUC {r['metricas']['auc_roc']:.3f})")
    ax.plot([0, 1], [0, 1], color=COR_TEXTO_SEC, linewidth=1, linestyle="--", label="Aleatório")
    _estilo_eixos(ax, f"Curva ROC no teste temporal — horizonte de {horizonte}", "Taxa de falsos positivos", "Taxa de verdadeiros positivos")
    ax.legend(frameon=False, fontsize=9, loc="lower right")
    return _salvar(fig, f"curva_roc_{horizonte}.png")


def figura_importancia(fg: pd.DataFrame, horizonte: str, metodo: str) -> Path:
    fig, ax = plt.subplots(figsize=(8, 6))
    df = fg.sort_values("importancia")
    ax.barh(df["rotulo"], df["importancia"], color=CORES_SERIE[0], height=0.6)
    for i, (v, d) in enumerate(zip(df["importancia"], df["direcao"])):
        ax.text(v, i, f" {v:.3f} ({d})", va="center", fontsize=8, color=COR_TEXTO_SEC)
    _estilo_eixos(ax, f"Importância global dos fatores — horizonte de {horizonte}", f"Média |contribuição| ({metodo.split(' (')[0]})", "")
    ax.set_xlim(0, df["importancia"].max() * 1.35)
    return _salvar(fig, f"importancia_fatores_{horizonte}.png")


def figura_sobrevivencia(curva: pd.DataFrame) -> Path:
    fig, ax = plt.subplots(figsize=(8, 5.5))
    geral = curva[curva["segmento_tipo"] == "geral"]
    ax.plot(geral["dia"], geral["prob_permanencia"], color=COR_TEXTO, linewidth=2.2, label="Geral")
    contratos = curva[curva["segmento_tipo"] == "tipo_contrato"]
    for i, (valor, g) in enumerate(contratos.groupby("segmento_valor")):
        ax.plot(g["dia"], g["prob_permanencia"], color=CORES_SERIE[i], linewidth=1.8, label=valor)
    for d in (90, 180):
        ax.axvline(d, color=COR_GRADE, linewidth=1.2)
        ax.text(d, 0.985, f" {d} dias", fontsize=8, color=COR_TEXTO_SEC, va="top")
    _estilo_eixos(ax, "Curva de permanência (Kaplan-Meier) — evento = saída voluntária", "Dias de casa", "Probabilidade de permanência")
    ax.set_ylim(0.4, 1.0)
    ax.legend(frameon=False, fontsize=9, loc="lower left", title="Tipo de contrato", title_fontsize=9)
    return _salvar(fig, "curva_sobrevivencia.png")


def figura_turnover_mensal(tm: pd.DataFrame) -> Path:
    fig, ax = plt.subplots(figsize=(11, 5))
    x = np.arange(len(tm))
    pico = tm["periodo_pico"].to_numpy()
    ax.bar(x, tm["admissoes"], color=CORES_SERIE[0], width=0.7, label="Admissões")
    ax.plot(x, tm["desligamentos_voluntarios"], color=CORES_SERIE[1], linewidth=2, label="Desligamentos voluntários")
    ax.plot(x, tm["desligamentos_involuntarios"], color=CORES_SERIE[2], linewidth=1.6, label="Desligamentos involuntários")
    em_pico = False
    for i, p in enumerate(pico):
        if p and not em_pico:
            inicio = i
            em_pico = True
        if em_pico and (not p or i == len(pico) - 1):
            fim = i if (p and i == len(pico) - 1) else i - 1
            ax.axvspan(inicio - 0.5, fim + 0.5, color=CORES_SERIE[3], alpha=0.12, linewidth=0)
            em_pico = False
    rotulos = [d.strftime("%Y-%m") if d.month in (1, 7) else "" for d in tm["mes"]]
    ax.set_xticks(x)
    ax.set_xticklabels(rotulos, rotation=0, fontsize=8)
    _estilo_eixos(ax, "Tendência mensal: admissões e desligamentos (2023-01 a 2026-10)",
                  "Mês (faixas sombreadas = picos sazonais: Dia das Crianças, set-out; Natal, nov-dez)", "Pessoas")
    ax.legend(frameon=False, fontsize=9, loc="upper left")
    return _salvar(fig, "tendencia_turnover_mensal.png")


def figura_calibracao(tab: pd.DataFrame, horizonte: str, nome_modelo: str) -> Path:
    fig, ax = plt.subplots(figsize=(6.5, 5.5))
    ax.plot([0, tab["risco_medio_previsto"].max() * 1.05], [0, tab["risco_medio_previsto"].max() * 1.05], color=COR_TEXTO_SEC, linestyle="--", linewidth=1, label="Calibração perfeita")
    ax.plot(tab["risco_medio_previsto"], tab["taxa_real"], color=CORES_SERIE[0], marker="o", markersize=7, linewidth=2, label=MODELOS_NOMES[nome_modelo])
    for _, r in tab.iterrows():
        ax.text(r["risco_medio_previsto"], r["taxa_real"] + 0.012, f"D{int(r['decil'])}", fontsize=7, color=COR_TEXTO_SEC, ha="center")
    _estilo_eixos(ax, f"Calibração por decil no teste temporal — {horizonte}", "Risco médio previsto", "Taxa real de saída voluntária")
    ax.legend(frameon=False, fontsize=9, loc="upper left")
    return _salvar(fig, f"calibracao_{horizonte}.png")


def figura_efeito_distancia_onboarding(pop: pd.DataFrame) -> Path:
    cortes, rotulos = FAIXAS_EFEITO["distancia_casa_trabalho_km"]
    df = pop.copy()
    df["faixa"] = pd.cut(df["distancia_casa_trabalho_km"].astype(float), bins=cortes, labels=rotulos)
    df["onb"] = df["onboarding_concluido"].map(lambda v: "Integração concluída" if bool(v) else "Integração não concluída")
    tab = df.groupby(["faixa", "onb"], observed=True)["y90"].agg(["mean", "size"]).reset_index()
    fig, ax = plt.subplots(figsize=(8, 5))
    x = np.arange(len(rotulos))
    largura = 0.38
    for i, (onb, cor) in enumerate([("Integração concluída", CORES_SERIE[0]), ("Integração não concluída", CORES_SERIE[1])]):
        sub = tab[tab["onb"] == onb].set_index("faixa").reindex(rotulos)
        ax.bar(x + (i - 0.5) * largura, sub["mean"].fillna(0), width=largura - 0.03, color=cor, label=onb)
        for xi, (v, n) in zip(x + (i - 0.5) * largura, zip(sub["mean"], sub["size"])):
            if not np.isnan(v):
                ax.text(xi, v + 0.008, f"{100 * v:.0f}%\n(n={int(n)})", ha="center", fontsize=7, color=COR_TEXTO_SEC)
    ax.set_xticks(x)
    ax.set_xticklabels(rotulos)
    _estilo_eixos(ax, "Saída voluntária até 90 dias por distância casa-trabalho e integração", "Distância casa-trabalho", "Taxa real de saída voluntária (90 dias)")
    ax.legend(frameon=False, fontsize=9)
    return _salvar(fig, "efeito_distancia_onboarding.png")


# ---------------------------------------------------------------------------
# 7) Relatório
# ---------------------------------------------------------------------------
def _tabela_md(df: pd.DataFrame, fmt: dict | None = None) -> str:
    fmt = fmt or {}
    cols = list(df.columns)
    linhas = ["| " + " | ".join(str(c) for c in cols) + " |", "|" + "---|" * len(cols)]
    for _, r in df.iterrows():
        celulas = []
        for c in cols:
            v = r[c]
            if c in fmt and v is not None and not (isinstance(v, float) and np.isnan(v)):
                celulas.append(fmt[c].format(v))
            else:
                celulas.append("" if v is None or (isinstance(v, float) and np.isnan(v)) else str(v))
        linhas.append("| " + " | ".join(celulas) + " |")
    return "\n".join(linhas)


def escrever_relatorio(contexto: dict) -> Path:
    """Gera pipeline/modelos/relatorio_treino.md."""
    c = contexto
    partes = [f"# Relatório de treino — Radar de Retenção {VERSAO_MODELO}", "",
              f"Gerado em {c['treinado_em']} | data de referência {DATA_REFERENCIA.date()} | semente {SEMENTE}.", "",
              "## Base e populações", "",
              f"* Colaboradores na base: {c['n_base']} (ativos {c['n_ativos']}; desligados {c['n_base'] - c['n_ativos']}).",
              f"* População escorada (ativos com 30 a 180 dias de casa): {c['n_escorados']}.", ""]
    for horizonte, info in c["horizontes"].items():
        partes += [f"* {horizonte}: treino {info['n_treino']} (taxa {info['taxa_treino']:.3f}) | teste temporal {info['n_teste']} (taxa {info['taxa_teste']:.3f})."]
        partes += [f"  Teste {horizonte}: admissões de {info['teste_inicio']} a {info['teste_fim']}; {info['teste_pico']} admissões de pico e {info['teste_temporarios']} temporários."]
    partes += ["", "Divisão temporal: treino = admissões até 2025-12-31; teste = admissões de 2026 com janela completa. ",
               "Validação cruzada estratificada (5 folds) no treino. Quem saiu antes do dia 30 (por qualquer motivo) não entra no treino; ",
               "saídas involuntárias e fins de contrato antes do horizonte recebem rótulo 0 (limitação: risco competitivo).", ""]
    partes += ["## Métricas por modelo e horizonte (teste temporal)", ""]
    met = c["metricas"].copy()
    met["modelo"] = met["modelo"].map(MODELOS_NOMES)
    tab = met.pivot_table(index=["horizonte", "modelo"], columns="metrica", values="valor").reset_index()
    cols = ["horizonte", "modelo", "auc_roc", "auc_pr", "brier", "recall_top20", "precisao_top20", "f1", "limiar_f1", "taxa_base", "auc_cv_media", "auc_cv_desvio"]
    partes += [_tabela_md(tab[cols], {k: "{:.4f}" for k in cols[2:]}), ""]
    partes += ["## Modelo selecionado", ""]
    for horizonte, info in c["horizontes"].items():
        partes += [f"* **{horizonte}**: {MODELOS_NOMES[info['selecionado']]} — AUC-ROC {info['auc_sel']:.4f} no teste temporal "
                   f"(regra: maior AUC; a regressão logística vence se ficar a menos de 0,01 do melhor). "
                   f"Explicabilidade: {info['metodo_explicacao']} (escala: {info['escala_explicacao']})."]
    partes += ["", "O modelo publicado de cada horizonte é re-treinado com os mesmos hiperparâmetros em treino + teste (todas as admissões com janela completa) ",
               "antes de escorar os ativos; as métricas acima referem-se ao ajuste apenas no treino, avaliado no teste temporal.", ""]
    partes += ["## Fatores mais importantes (média |contribuição|)", ""]
    for horizonte, info in c["horizontes"].items():
        partes += [f"### {horizonte}", "", _tabela_md(info["fatores_globais"][["posicao", "rotulo", "importancia", "direcao"]], {"importancia": "{:.4f}"}), ""]
    partes += ["## Calibração por decil (modelo selecionado, teste temporal)", ""]
    for horizonte, info in c["horizontes"].items():
        partes += [f"### {horizonte}", "", _tabela_md(info["calibracao"], {k: "{:.4f}" for k in ["risco_medio_previsto", "taxa_real", "limite_inf", "limite_sup"]}), ""]
    partes += ["## Calibração por nível (modelo selecionado, teste temporal)", "",
               "Os extremos ficam calibrados. Em 90 dias, as faixas Médio e Alto ficam superestimadas no teste, que não tem admissões de pico; ",
               "os limiares de nível são faixas de priorização e não devem ser lidos como probabilidades exatas.", ""]
    for horizonte, info in c["horizontes"].items():
        partes += [f"### {horizonte}", "", _tabela_md(info["calibracao_nivel"], {k: "{:.4f}" for k in ["risco_medio_previsto", "taxa_real"]}), ""]
    partes += ["## Validação retroativa com picos (treino até 2024, teste nas admissões de 2025)", "",
               "O teste temporal oficial não contém admissões de pico. Esta validação usa a regressão logística e mede o regime de pico; ",
               "não altera os modelos publicados.", "", _tabela_md(c["retroativa"], {k: "{:.4f}" for k in ["taxa_real", "risco_medio_previsto", "auc_roc"]}), ""]
    partes += ["## Distribuição dos níveis de risco (população escorada)", "",
               "O nível usa o risco vigente: risco de 90 dias até o dia 90; depois dele, risco residual até o dia 180, condicional a ter chegado ao dia 90. ",
               f"{c['n_horizonte_vencido']} dos {c['n_escorados']} escorados já passaram do dia 90.", "", _tabela_md(c["niveis"]), ""]
    partes += ["## Auditoria de viés", "",
               "Métricas por grupo calculadas com previsões fora da amostra (validação cruzada 5 folds) sobre treino + teste, ",
               "porque o teste temporal de 180 dias é pequeno para estimar AUC por subgrupo (grupos com menos de 30 pessoas ou sem ",
               "os dois rótulos ficam sem AUC). `faixa_etaria` **não** é usada como preditor. `taxa_alto_risco` = proporção com risco >= 0,30.", ""]
    for horizonte, info in c["horizontes"].items():
        partes += [f"### {horizonte}", "", _tabela_md(info["vies"][["grupo_tipo", "grupo_valor", "n", "taxa_real", "risco_medio_previsto", "auc", "taxa_alto_risco"]],
                                                         {k: "{:.4f}" for k in ["taxa_real", "risco_medio_previsto", "auc", "taxa_alto_risco"]}), ""]
    partes += ["### Conclusão da auditoria", ""]
    for horizonte, info in c["horizontes"].items():
        v = info["vies"].set_index(["grupo_tipo", "grupo_valor"])
        for grupo in ["55+", "18-24"]:
            r = v.loc[("faixa_etaria", grupo)]
            partes += [f"* {horizonte}, faixa {grupo}: previsto {100 * r['risco_medio_previsto']:.1f}% contra real {100 * r['taxa_real']:.1f}% "
                       f"({100 * (r['risco_medio_previsto'] - r['taxa_real']):+.1f} p.p.); alto risco em {100 * r['taxa_alto_risco']:.1f}% do grupo."]
    partes += ["* Leitura: a faixa 55+ recebe risco acima do observado, com excesso de alertas, e a faixa 18-24 recebe risco abaixo do observado, com casos perdidos.",
               "* `tipo_contrato` (Jovem Aprendiz) e `canal_contratacao` (Programa Jovem) estão ligados à idade e funcionam como proxies, embora a faixa etária não entre no modelo.",
               "* Ação: revisar com Gente & Gestão antes de qualquer uso e avaliar recalibração por grupo na Sprint 2.", ""]
    partes += ["## Validação do card do simulador", "",
               f"Risco recalculado em Python puro a partir do JSON do card para 30 colaboradores (incluindo avaliação ausente) e comparado ",
               f"com `predict_proba` da regressão logística nos dois horizontes: diferença máxima {c['dif_card']:.2e} (< 1e-6).", ""]
    if c["avisos"]:
        partes += ["## Avisos do processamento", ""] + [f"* {a}" for a in c["avisos"]] + [""]
    partes += ["## Limitações", "",
               "* Dados sintéticos: as relações foram geradas por um mecanismo plausível, mas não medem a realidade da Ri Happy.",
               "* Risco competitivo: saídas involuntárias e fim de contrato antes do horizonte são tratados como rótulo 0.",
               "* O score é calculado uma única vez, no dia 30; sinais posteriores não são incorporados (rescoring é evolução prevista).",
               "* O teste temporal de 180 dias cobre poucos meses de 2026 (até 4 de maio); as métricas desse horizonte têm maior incerteza.",
               "* O teste temporal não contém admissões de pico, embora o treino tenha mais da metade delas; a validação retroativa acima cobre esse regime.",
               "* `turnover_loja_12m` é um proxy sintético (base latente da loja + ruído individual), não o turnover realizado da loja.",
               "* A base começa vazia em 2023-01-01; o headcount cresce ao longo da série e infla a taxa mensal de turnover dos primeiros meses.",
               "* Ativos que já passaram do dia 90 estão no treino do modelo de 90 dias com rótulo 0; por isso o nível deles usa o risco residual até o dia 180.",
               "* A loja entra apenas por atributos agregados (bandeira, tipo, região, porte, turnover); efeitos específicos de loja não são capturados.",
               "* Correlação não é causa: os fatores apoiam conversas de retenção e nunca decisões punitivas (ver docs/etica-lgpd.md).", ""]
    caminho = DIR_MODELOS / "relatorio_treino.md"
    caminho.write_text("\n".join(partes), encoding="utf-8")
    return caminho


# ---------------------------------------------------------------------------
# 8) Orquestração
# ---------------------------------------------------------------------------
def main() -> int:
    configurar_saida_utf8()
    t_inicio = time.time()
    DIR_PROCESSED.mkdir(parents=True, exist_ok=True)
    DIR_MODELOS.mkdir(parents=True, exist_ok=True)
    avisos: list[str] = []

    lojas, colab = carregar_base()
    base = montar_base_analitica(colab, lojas)
    escorados = populacao_escorada(base)
    registrar(f"Base: {len(colab)} colaboradores, {len(lojas)} lojas | escorados (ativos 30-180 dias): {len(escorados)}")
    X_esc = preparar_X(escorados)

    metricas_linhas = []
    contexto = {"horizontes": {}, "avisos": avisos}
    modelos_finais, rls_finais, p_escorados, selecionados = {}, {}, {}, {}
    fg_total, ef_total, vies_total = [], [], []
    explicacoes, fundos = {}, {}

    for horizonte, h in HORIZONTES.items():
        pop = populacao_treino(base, h)
        treino = treinar_e_avaliar(pop, h)
        res = treino["resultados"]
        selecionado = selecionar_modelo(res)
        selecionados[horizonte] = selecionado
        registrar(f"[{horizonte}] modelo selecionado: {selecionado}")
        for nome, r in res.items():
            for metrica, valor in r["metricas"].items():
                metricas_linhas.append({"horizonte": horizonte, "modelo": nome, "metrica": metrica, "valor": round(float(valor), 5),
                                        "selecionado": nome == selecionado})
        y_te = treino["y"][treino["m_teste"]]
        calib = calibracao_por_decil(y_te, res[selecionado]["p_teste"])
        calib.to_csv(DIR_MODELOS / f"calibracao_{horizonte}.csv", index=False, encoding="utf-8")
        figura_roc(treino, horizonte)
        if horizonte == "90d":
            figura_calibracao(calib, horizonte, selecionado)

        # modelo final (treino + teste) e previsões fora da amostra para as análises descritivas
        X_all, y_all = treino["X"], treino["y"]
        cv = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=SEMENTE)
        p_oof = cross_val_predict(clone(res[selecionado]["pipeline"]), X_all, y_all, cv=cv, method="predict_proba")[:, 1]
        registrar(f"[{horizonte}] AUC fora da amostra (CV em treino+teste) do modelo selecionado: {roc_auc_score(y_all, p_oof):.3f}")
        final = clone(res[selecionado]["pipeline"]).fit(X_all, y_all)
        rl_final = final if selecionado == "regressao_logistica" else clone(res["regressao_logistica"]["pipeline"]).fit(X_all, y_all)
        modelos_finais[horizonte], rls_finais[horizonte] = final, rl_final
        joblib.dump(final, DIR_MODELOS / f"modelo_{horizonte}.joblib")
        p_escorados[horizonte] = final.predict_proba(X_esc)[:, 1]

        # explicabilidade (global na amostra de fundo; individual nos escorados)
        rng = np.random.default_rng(SEMENTE)
        idx_fundo = rng.choice(len(X_all), size=min(AMOSTRA_SHAP_GLOBAL, len(X_all)), replace=False)
        X_fundo = X_all.iloc[idx_fundo]
        fundos[horizonte] = X_fundo
        t0 = time.time()
        expl = explicar_com_fallback(final, selecionado, X_esc, X_fundo, rl_final, y_all[idx_fundo], avisos)
        registrar(f"[{horizonte}] explicabilidade via {expl['metodo']} em {time.time() - t0:.1f}s")
        explicacoes[horizonte] = expl
        fg = fatores_globais(expl["global"], X_fundo, horizonte, expl["fallback"])
        fg_total.append(fg)
        figura_importancia(fg, horizonte, expl["metodo"])
        ef_total.append(efeito_fator(pop, p_oof, horizonte, h))
        vies_total.append(avaliacao_vies(pop, p_oof, horizonte, h))

        contexto["horizontes"][horizonte] = {
            "n_treino": int(treino["m_treino"].sum()), "taxa_treino": float(y_all[treino["m_treino"]].mean()),
            "n_teste": int(treino["m_teste"].sum()), "taxa_teste": float(y_te.mean()),
            "selecionado": selecionado, "auc_sel": res[selecionado]["metricas"]["auc_roc"],
            "metodo_explicacao": expl["metodo"], "escala_explicacao": expl["escala"],
            "fatores_globais": fg, "calibracao": calib, "vies": vies_total[-1], "pop": pop,
            "calibracao_nivel": calibracao_por_nivel(y_te, res[selecionado]["p_teste"]),
            "teste_inicio": str(pop.loc[treino["m_teste"], "data_admissao"].min().date()),
            "teste_fim": str(pop.loc[treino["m_teste"], "data_admissao"].max().date()),
            "teste_pico": int(pop.loc[treino["m_teste"], "admitido_periodo_pico"].astype(bool).sum()),
            "teste_temporarios": int((pop.loc[treino["m_teste"], "tipo_contrato"] == "Temporario Sazonal").sum()),
        }

    # ---- predições individuais ------------------------------------------------
    pred_linhas = []
    for i, (idx, linha) in enumerate(escorados.iterrows()):
        p90 = round(float(p_escorados["90d"][i]), 4)
        p180 = round(float(p_escorados["180d"][i]), 4)
        dias_casa = int(linha["dias_de_casa"])
        # nível e fatores seguem o horizonte que ainda pode se realizar (ver rr_comum.risco_vigente)
        nivel = nivel_risco(round(risco_vigente(p90, p180, dias_casa), 4))
        contrib_ind = explicacoes["90d" if dias_casa <= 90 else "180d"]["individual"]
        registro = {k: (None if (isinstance(v, float) and np.isnan(v)) else v) for k, v in linha.to_dict().items()}
        fatores = fatores_top_individuais(contrib_ind.loc[idx], linha)
        pred_linhas.append({
            "colaborador_id": linha["colaborador_id"], "data_referencia": DATA_REFERENCIA, "dias_de_casa": dias_casa,
            "risco_90d": p90, "risco_180d": p180, "nivel_risco": nivel, "fatores_top": despejar_json(fatores),
            "acao_recomendada": montar_acao_recomendada(nivel, fatores, registro), "modelo_versao": VERSAO_MODELO,
        })
    predicoes = pd.DataFrame(pred_linhas)
    niveis = predicoes["nivel_risco"].value_counts().reindex(NIVEIS, fill_value=0)
    contexto["niveis"] = pd.DataFrame({"nivel": niveis.index, "n": niveis.values, "pct": (100 * niveis.values / len(predicoes)).round(1)})
    registrar(f"Predições: {len(predicoes)} | níveis: {niveis.to_dict()}")

    # ---- card do simulador -------------------------------------------------------
    pop90 = contexto["horizontes"]["90d"]["pop"]
    treinado_em = datetime.now(timezone.utc).isoformat(timespec="seconds")
    card = {
        "versao": VERSAO_MODELO,
        "data_referencia": DATA_REFERENCIA.strftime("%Y-%m-%d"),
        "modelo_selecionado": {hz: selecionados[hz] for hz in HORIZONTES},
        "simulador_e_modelo_oficial": {hz: selecionados[hz] == "regressao_logistica" for hz in HORIZONTES},
        "limiares_nivel": LIMIARES_NIVEL,
        "inputs": montar_inputs_card(pop90),
        "simulador": {hz: termos_simulador(rls_finais[hz], fundos[hz]) for hz in HORIZONTES},
        "metricas_teste_temporal": {},
        "explicabilidade": {hz: {"metodo": explicacoes[hz]["metodo"], "escala": explicacoes[hz]["escala"], "fallback": explicacoes[hz]["fallback"]} for hz in HORIZONTES},
        "treinado_em": treinado_em,
    }
    for hz in HORIZONTES:
        sel = selecionados[hz]
        card["metricas_teste_temporal"][hz] = {m: round(float(v), 4) for m, v in
                                               [(r["metrica"], r["valor"]) for r in metricas_linhas if r["horizonte"] == hz and r["modelo"] == sel]}
    dif = validar_card(card, rls_finais, X_esc)
    contexto["dif_card"] = dif
    (DIR_MODELOS / "model_card.json").write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")

    # ---- análises complementares --------------------------------------------------
    curva = curvas_sobrevivencia(colab, lojas)
    tm = turnover_mensal(colab)
    figura_sobrevivencia(curva)
    figura_turnover_mensal(tm)
    figura_efeito_distancia_onboarding(pop90)

    # ---- tabelas processadas --------------------------------------------------------
    metricas = pd.DataFrame(metricas_linhas)
    contexto["metricas"] = metricas
    modelos = pd.DataFrame([{
        "versao": VERSAO_MODELO, "treinado_em": treinado_em,
        "descricao": ("Radar de Retenção — risco de desligamento voluntário em 90 e 180 dias (checkpoint no dia 30). "
                      f"Selecionados: 90d={MODELOS_NOMES[selecionados['90d']]}, 180d={MODELOS_NOMES[selecionados['180d']]}. "
                      "Simulador = regressão logística em escala padronizada."),
        "card": json.dumps(card, ensure_ascii=False, separators=(",", ":")),
    }])
    saidas = {
        "lojas": lojas[COLUNAS_LOJAS], "colaboradores": colab[COLUNAS_COLABORADORES], "predicoes": predicoes,
        "fatores_globais": pd.concat(fg_total, ignore_index=True), "metricas_modelo": metricas,
        "curva_sobrevivencia": curva, "turnover_mensal": tm, "avaliacao_vies": pd.concat(vies_total, ignore_index=True),
        "efeito_fator": pd.concat(ef_total, ignore_index=True), "parametros_custo": tabela_parametros_custo(),
        "recomendacoes": tabela_recomendacoes(), "modelos": modelos,
    }
    for nome, df in saidas.items():
        escrever_csv_tabela(df, nome)
        registrar(f"data/processed/{nome}.csv: {len(df)} linhas")

    retroativa = validacao_retroativa(base)
    retroativa.to_csv(DIR_MODELOS / "validacao_retroativa.csv", index=False, encoding="utf-8")
    registrar("Validação retroativa (treino até 2024, teste em 2025):\n" + retroativa.to_string(index=False))
    contexto.update({"treinado_em": treinado_em, "n_base": len(colab), "n_ativos": int((colab["status"] == "Ativo").sum()),
                     "n_escorados": len(escorados), "retroativa": retroativa,
                     "n_horizonte_vencido": int((predicoes["dias_de_casa"] > 90).sum())})
    escrever_relatorio(contexto)
    registrar(f"Concluído em {time.time() - t_inicio:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
