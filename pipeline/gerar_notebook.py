"""
gerar_notebook.py — gera ``notebooks/01_eda_e_modelagem.ipynb`` com nbformat.

O notebook reutiliza as funções do pipeline (``rr_comum`` e
``02_preparar_e_treinar``, carregado por caminho) para garantir que a análise
exploratória, a modelagem, o SHAP, a calibração e a auditoria de viés
apresentados sejam os mesmos do pipeline. Depois de gerado, o notebook é
executado com:

    jupyter nbconvert --to notebook --execute --inplace notebooks/01_eda_e_modelagem.ipynb
"""
from __future__ import annotations

import sys
from pathlib import Path

import nbformat
from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook

RAIZ = Path(__file__).resolve().parents[1]
DESTINO = RAIZ / "notebooks" / "01_eda_e_modelagem.ipynb"

CELULAS: list[tuple[str, str]] = []


def md(texto: str) -> None:
    CELULAS.append(("markdown", texto.strip()))


def code(texto: str) -> None:
    CELULAS.append(("code", texto.strip()))


# ---------------------------------------------------------------------------
md("""
# Radar de Retenção — análise exploratória e modelagem

**Enterprise Challenge Ri Happy × FIAP** (turma 2TSCOR, Tecnologia em Data Science)
Gabriel Alves Leon Rodriguez (RM566648) — trabalho individual.

## 1. Contexto do desafio

A Ri Happy pediu uma solução para **prever o risco de desligamento voluntário de colaboradores
operacionais de loja nos primeiros 90 e 180 dias**, explicar os fatores associados e apoiar a área
de Gente & Gestão em ações preventivas de retenção.

Este notebook percorre, de forma reprodutível, o mesmo caminho do pipeline (`pipeline/01` a `03`):

1. carga e qualidade da base (sintética e pseudonimizada);
2. análise exploratória: onde e quando as saídas precoces acontecem;
3. construção das variáveis do checkpoint de 30 dias e dos alvos (90/180 dias);
4. treino e comparação de quatro modelos com divisão temporal + validação cruzada;
5. explicabilidade (SHAP), calibração e auditoria de viés;
6. conclusões, recomendações e limitações.

> Os dados são **sintéticos**: gerados por `pipeline/01_gerar_dados_sinteticos.py` com um mecanismo
> plausível de desligamento (riscos competitivos, sazonalidade e heterogeneidade não observada).
> Nenhum dado real da Ri Happy é usado.
""")

code("""
import importlib.util, json, sys, warnings
from pathlib import Path
import numpy as np, pandas as pd
import matplotlib.pyplot as plt
warnings.filterwarnings("ignore")

# raiz do repositório (o notebook roda a partir de notebooks/ ou da raiz)
RAIZ = next(p for p in [Path.cwd(), *Path.cwd().parents] if (p / "pipeline" / "rr_comum.py").exists())
sys.path.insert(0, str(RAIZ / "pipeline"))
import rr_comum as rc

def carregar_modulo(nome):
    spec = importlib.util.spec_from_file_location(nome, RAIZ / "pipeline" / f"{nome}.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo

t = carregar_modulo("02_preparar_e_treinar")   # funções de preparação, treino e explicabilidade
t.registrar = lambda msg: print(msg)
%matplotlib inline
plt.rcParams.update({"figure.dpi": 100, "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": rc.COR_GRADE, "axes.titlelocation": "left"})
CORES = rc.CORES_SERIE
pd.set_option("display.max_columns", 40, "display.width", 160)
print("Raiz do repositório:", RAIZ.name)
""")

md("""
## 2. Carga dos dados

Duas tabelas, com as mesmas colunas do banco (`rr_lojas` e `rr_colaboradores`).
""")

code("""
lojas, colab = t.carregar_base()
print(f"Lojas: {lojas.shape} | Colaboradores: {colab.shape}")
display(lojas.head())
display(colab.head())
""")

md("""
## 3. Qualidade dos dados

* **Nulos**: os sinais dos primeiros 30 dias (integração, treinamento, avaliação, faltas, atrasos, horas extras)
  só existem para quem atingiu o dia 30 — para os demais são nulos por construção (checkpoint não atingido).
  A avaliação de experiência ainda tem ~10% de ausência entre os avaliáveis (não realizada), tratada por
  imputação pela média + indicador de ausência.
* **Faixas**: verificamos os domínios numéricos (distância 0-60 km, avaliação 1-5, horas 0-40 etc.).
* **Duplicidades e consistência**: identificador único, datas coerentes, status coerente com o desligamento.
""")

code("""
nulos = colab.isna().mean().sort_values(ascending=False)
display(nulos[nulos > 0].rename("proporcao_nulos").to_frame().T.round(3))
sem_checkpoint = colab["dias_de_casa"] < 30
print(f"Sem checkpoint (dias_de_casa < 30): {sem_checkpoint.sum()} ({sem_checkpoint.mean():.1%}) — explica os nulos dos sinais de 30 dias")
print(f"Avaliação ausente entre quem passou do dia 30: {colab.loc[~sem_checkpoint, 'avaliacao_experiencia_30d'].isna().mean():.1%}")
display(colab[["distancia_casa_trabalho_km", "horas_treinamento_30d", "avaliacao_experiencia_30d", "faltas_30d", "atrasos_30d",
               "horas_extras_media_semana", "gestor_tempo_cargo_meses", "turnover_loja_12m", "dias_de_casa"]].astype(float).describe().round(2))
""")

code("""
checagens = {
    "colaborador_id único": colab["colaborador_id"].is_unique,
    "todas as lojas existem": colab["loja_id"].isin(lojas["loja_id"]).all(),
    "data_desligamento >= data_admissao": (colab["data_desligamento"].isna() | (colab["data_desligamento"] >= colab["data_admissao"])).all(),
    "status coerente com tipo_desligamento": ((colab["status"] == "Desligado") == colab["tipo_desligamento"].notna()).all(),
    "dias_de_casa = data fim - admissão": (((colab["data_desligamento"].fillna(rc.DATA_REFERENCIA) - colab["data_admissao"]).dt.days) == colab["dias_de_casa"].astype(int)).all(),
    "admissões dentro do período": colab["data_admissao"].between(rc.DATA_INICIO, rc.DATA_REFERENCIA).all(),
}
display(pd.Series(checagens, name="ok").to_frame())
assert all(checagens.values()), "há inconsistências na base"
""")

md("""
## 4. Análise exploratória

### 4.1 Base analítica e taxas de saída precoce

Juntamos os atributos da loja e criamos os alvos. As taxas abaixo são calculadas na **população com janela
completa** (admitidos até 90/180 dias antes da referência) que **passou do dia 30**.
""")

code("""
base = t.montar_base_analitica(colab, lojas)
pop90 = t.populacao_treino(base, 90)
pop180 = t.populacao_treino(base, 180)
print(f"População 90d: {len(pop90)} (taxa y90 = {pop90['y90'].mean():.3f}) | População 180d: {len(pop180)} (taxa y180 = {pop180['y180'].mean():.3f})")
print(f"Status geral: {colab['status'].value_counts().to_dict()} | tipo de desligamento: {colab['tipo_desligamento'].value_counts().to_dict()}")

def taxa_por(df, col, alvo="y90", ordem=None):
    g = df.groupby(col)[alvo].agg(["mean", "size"]).rename(columns={"mean": "taxa", "size": "n"})
    return g.reindex(ordem) if ordem else g.sort_values("taxa", ascending=False)

fig, axes = plt.subplots(2, 3, figsize=(16, 8))
dimensoes = [("cargo", t.ORDEM_CATEGORIAS["cargo"]), ("tipo_contrato", t.ORDEM_CATEGORIAS["tipo_contrato"]),
             ("regiao", t.ORDEM_CATEGORIAS["regiao"]), ("faixa_salarial", t.ORDEM_CATEGORIAS["faixa_salarial"]),
             ("canal_contratacao", t.ORDEM_CATEGORIAS["canal_contratacao"]), ("turno", t.ORDEM_CATEGORIAS["turno"])]
for ax, (col, ordem) in zip(axes.ravel(), dimensoes):
    g = taxa_por(pop90, col, ordem=ordem)
    ax.bar(g.index, g["taxa"], color=CORES[0])
    ax.set_title(f"Saída voluntária até 90 dias por {rc.ROTULOS[col].lower()}")
    ax.set_ylabel("taxa")
    ax.tick_params(axis="x", rotation=25)
    for i, (v, n) in enumerate(zip(g["taxa"], g["n"])):
        ax.text(i, v + 0.004, f"{v:.0%}\\n(n={n})", ha="center", fontsize=8, color=rc.COR_TEXTO_SEC)
plt.tight_layout(); plt.show()
""")

md("""
### 4.2 Distância, integração e avaliação de experiência

Três sinais operacionais com forte relação com a saída precoce: a distância casa-trabalho, a conclusão da
trilha de integração até o dia 30 e a avaliação de experiência.
""")

code("""
fig, axes = plt.subplots(1, 3, figsize=(16, 4.5))
for ax, col in zip(axes, ["distancia_casa_trabalho_km", "onboarding_concluido", "avaliacao_experiencia_30d"]):
    cats = t.categorizar_fator(col, pop90[col])
    ordem = t.ordem_categorias(col)
    g = pop90.assign(cat=cats).groupby("cat")["y90"].agg(["mean", "size"]).reindex(ordem).dropna()
    ax.bar(g.index.astype(str), g["mean"], color=CORES[0])
    ax.set_title(f"Saída até 90 dias por {rc.ROTULOS[col].lower()}")
    for i, (v, n) in enumerate(zip(g["mean"], g["size"])):
        ax.text(i, v + 0.004, f"{v:.0%}\\n(n={int(n)})", ha="center", fontsize=8, color=rc.COR_TEXTO_SEC)
    ax.tick_params(axis="x", rotation=20)
plt.tight_layout(); plt.show()
""")

md("""
### 4.3 Sazonalidade mensal

As admissões têm picos em **setembro/outubro (Dia das Crianças)** e **novembro/dezembro (Natal)**, com
predominância de contratos temporários sazonais. As saídas voluntárias seguem as admissões com defasagem
de 1 a 3 meses.
""")

code("""
tm = t.turnover_mensal(colab)
fig, ax = plt.subplots(figsize=(15, 4.5))
x = np.arange(len(tm))
ax.bar(x, tm["admissoes"], color=CORES[0], label="Admissões")
ax.plot(x, tm["desligamentos_voluntarios"], color=CORES[1], linewidth=2, label="Desligamentos voluntários")
ax.plot(x, tm["desligamentos_involuntarios"], color=CORES[2], linewidth=1.5, label="Desligamentos involuntários")
for i, p in enumerate(tm["periodo_pico"]):
    if p:
        ax.axvspan(i - 0.5, i + 0.5, color=CORES[3], alpha=0.12, linewidth=0)
ax.set_xticks(x); ax.set_xticklabels([d.strftime("%Y-%m") if d.month in (1, 7) else "" for d in tm["mes"]], fontsize=8)
ax.set_title("Admissões e desligamentos por mês (faixas sombreadas = picos sazonais)"); ax.legend(frameon=False)
plt.show()
temp = colab.assign(mes=colab["data_admissao"].dt.month).groupby("mes")["tipo_contrato"].apply(lambda s: (s == "Temporario Sazonal").mean())
display(temp.rename("proporcao_temporarios_por_mes_de_admissao").to_frame().T.round(2))
""")

md("""
### 4.4 Motivos declarados de saída voluntária

Motivos registrados na entrevista de desligamento (últimos 12 meses). "Falta de adaptação", "nova oportunidade"
e "horário/escala" lideram — coerente com o peso da integração e da escala entre os fatores de risco.
""")

code("""
ref = rc.DATA_REFERENCIA
m = (colab["tipo_desligamento"] == "Voluntario") & (colab["data_desligamento"] > ref - rc.dias(365))
motivos = colab[m].groupby("motivo_desligamento").agg(n=("colaborador_id", "size"), ate_180d=("dias_de_casa", lambda s: (s <= 180).sum())).sort_values("n")
fig, ax = plt.subplots(figsize=(8, 4.5))
ax.barh(motivos.index, motivos["n"], color=CORES[0], label="Total 12 meses")
ax.barh(motivos.index, motivos["ate_180d"], color=CORES[1], label="Com até 180 dias de casa")
ax.set_title("Motivos declarados de saída voluntária (últimos 12 meses)"); ax.legend(frameon=False)
plt.show()
""")

md("""
### 4.5 Curva de permanência (Kaplan-Meier)

Evento = saída voluntária; censura = ativo na referência ou saída involuntária/fim de contrato. A queda é
mais acentuada nos primeiros 90 dias, sobretudo entre temporários sazonais e intermitentes.
""")

code("""
curva = t.curvas_sobrevivencia(colab, lojas)
fig, axes = plt.subplots(1, 2, figsize=(15, 4.8))
for ax, seg in zip(axes, ["tipo_contrato", "cargo"]):
    geral = curva[curva["segmento_tipo"] == "geral"]
    ax.plot(geral["dia"], geral["prob_permanencia"], color=rc.COR_TEXTO, linewidth=2.2, label="Geral")
    for i, (valor, g) in enumerate(curva[curva["segmento_tipo"] == seg].groupby("segmento_valor")):
        ax.plot(g["dia"], g["prob_permanencia"], color=CORES[i], linewidth=1.6, label=valor)
    for d in (90, 180):
        ax.axvline(d, color=rc.COR_GRADE)
    ax.set_ylim(0.5, 1); ax.set_xlabel("dias de casa"); ax.set_ylabel("probabilidade de permanência")
    ax.set_title(f"Kaplan-Meier por {rc.ROTULOS[seg].lower()}"); ax.legend(frameon=False, fontsize=8)
plt.tight_layout(); plt.show()
""")

md("""
## 5. Construção das variáveis e dos alvos

* **Checkpoint**: dia 30 de casa. Só entram no modelo informações disponíveis até esse ponto.
* **Alvos**: `y90` = saída voluntária com `dias_de_casa <= 90`; `y180` idem com 180. Saídas involuntárias
  e fins de contrato antes do horizonte recebem rótulo 0 (limitação: risco competitivo).
* **População de treino**: janela completa (admissão <= referência − horizonte) e `dias_de_casa >= 30`.
* **Preditoras** (23): atributos de admissão, da loja (agregados) e sinais dos primeiros 30 dias, mais o
  indicador `avaliacao_experiencia_30d_ausente`. `faixa_etaria` e `loja_id` ficam **fora** do modelo.
* **Pré-processamento**: imputação pela média + padronização (regressão logística) e one-hot
  (`handle_unknown='ignore'`) para categóricas; árvores recebem one-hot sem padronização.
""")

code("""
X90 = t.preparar_X(pop90)
print("Variáveis preditoras:", len(rc.FEATURES))
print("Categóricas:", rc.FEATURES_CAT)
print("Numéricas/booleanas:", rc.FEATURES_NUM)
display(X90.head())
m_tr, m_te = t.dividir_temporal(pop90)
print(f"Divisão temporal 90d: treino {m_tr.sum()} (admissões até 2025-12-31, taxa {pop90['y90'][m_tr].mean():.3f}) | teste {m_te.sum()} (2026, taxa {pop90['y90'][m_te].mean():.3f})")
""")

md("""
## 6. Treino e comparação dos quatro modelos

Regressão logística (baseline interpretável), random forest, gradient boosting (HistGradientBoosting) e
XGBoost. Métricas no **teste temporal** (admissões de 2026) e AUC médio da **validação cruzada estratificada
(5 folds)** no treino. Regra de seleção: maior AUC-ROC; a regressão logística vence se ficar a menos de 0,01
do melhor modelo (parcimônia e interpretabilidade).
""")

code("""
treinos, selecionados = {}, {}
linhas = []
for hz, h in rc.HORIZONTES.items():
    pop = t.populacao_treino(base, h)
    treinos[hz] = t.treinar_e_avaliar(pop, h)
    selecionados[hz] = t.selecionar_modelo(treinos[hz]["resultados"])
    for nome, r in treinos[hz]["resultados"].items():
        linhas.append({"horizonte": hz, "modelo": rc.MODELOS_NOMES[nome], "selecionado": nome == selecionados[hz], **r["metricas"]})
metricas = pd.DataFrame(linhas).set_index(["horizonte", "modelo"])
display(metricas.round(4))
print("Selecionados:", selecionados)
""")

code("""
from sklearn.metrics import roc_curve
fig, axes = plt.subplots(1, 2, figsize=(13, 5))
for ax, (hz, tr) in zip(axes, treinos.items()):
    y_te = tr["y"][tr["m_teste"]]
    for i, nome in enumerate(t.ORDEM_MODELOS):
        r = tr["resultados"][nome]
        fpr, tpr, _ = roc_curve(y_te, r["p_teste"])
        ax.plot(fpr, tpr, color=CORES[i], linewidth=2, label=f"{rc.MODELOS_NOMES[nome]} (AUC {r['metricas']['auc_roc']:.3f})")
    ax.plot([0, 1], [0, 1], "--", color=rc.COR_TEXTO_SEC, linewidth=1)
    ax.set_title(f"Curva ROC no teste temporal — {hz}"); ax.set_xlabel("falsos positivos"); ax.set_ylabel("verdadeiros positivos")
    ax.legend(frameon=False, fontsize=8, loc="lower right")
plt.tight_layout(); plt.show()
""")

md("""
## 7. Explicabilidade (SHAP)

Importância global = média |contribuição| por variável (SHAP agregado sobre as colunas one-hot). Para a
regressão logística as contribuições são `coef × (x_padronizado − média)` (equivalentes ao LinearExplainer);
para os modelos de árvore usa-se `shap.TreeExplainer`. Abaixo, o modelo selecionado em cada horizonte e,
para comparação, o XGBoost no horizonte de 90 dias.
""")

code("""
rng = np.random.default_rng(rc.SEMENTE)
fig, axes = plt.subplots(1, 3, figsize=(18, 6))
paineis = [("90d", selecionados["90d"]), ("180d", selecionados["180d"]), ("90d", "xgboost")]
for ax, (hz, nome) in zip(axes, paineis):
    tr = treinos[hz]
    X_tr = tr["X"][tr["m_treino"]]
    amostra = X_tr.iloc[rng.choice(len(X_tr), size=min(1000, len(X_tr)), replace=False)]
    contrib, metodo, escala = t.contribuicoes_por_variavel(tr["resultados"][nome]["pipeline"], nome, amostra, X_tr)
    fg = t.fatores_globais(contrib, amostra, hz, False).sort_values("importancia")
    ax.barh(fg["rotulo"], fg["importancia"], color=CORES[0])
    for i, (v, d) in enumerate(zip(fg["importancia"], fg["direcao"])):
        ax.text(v, i, f" {d}", va="center", fontsize=8, color=rc.COR_TEXTO_SEC)
    ax.set_title(f"{hz} — {rc.MODELOS_NOMES[nome]} ({escala})", fontsize=10)
    ax.set_xlabel("média |contribuição|")
plt.tight_layout(); plt.show()
""")

md("""
### 7.1 Explicação individual

Para cada colaborador escorado, os três fatores de maior |contribuição| (com direção e valor) alimentam a
lista priorizada do dashboard e a ação recomendada do playbook. O exemplo carrega os modelos publicados
(`pipeline/modelos/modelo_90d.joblib` e `modelo_180d.joblib`), treinados em treino + teste, e aplica a regra
do risco vigente: até o dia 90 vale o risco de 90 dias; depois dele, o risco residual até o dia 180.
""")

code("""
escorados = t.populacao_escorada(base)
X_esc = t.preparar_X(escorados)
import joblib
publicados = {hz: joblib.load(rc.DIR_MODELOS / f"modelo_{hz}.joblib") for hz in rc.HORIZONTES}
contribs = {}
for hz, h in rc.HORIZONTES.items():
    X_all = treinos[hz]["X"]
    idx_fundo = np.random.default_rng(rc.SEMENTE).choice(len(X_all), size=min(t.AMOSTRA_SHAP_GLOBAL, len(X_all)), replace=False)
    contribs[hz], _, _ = t.contribuicoes_por_variavel(publicados[hz], selecionados[hz], X_esc, X_all.iloc[idx_fundo])
p90 = publicados["90d"].predict_proba(X_esc)[:, 1]
p180 = publicados["180d"].predict_proba(X_esc)[:, 1]
dias_casa = escorados["dias_de_casa"].astype(int).to_numpy()
vigente = np.array([rc.risco_vigente(round(a, 4), round(b, 4), d) for a, b, d in zip(p90, p180, dias_casa)])
print(f"Escorados: {len(escorados)} | já passaram do dia 90: {(dias_casa > 90).sum()}")
exemplos = np.argsort(-vigente)[:3]
for i in exemplos:
    linha = escorados.iloc[i]
    hz = "90d" if dias_casa[i] <= 90 else "180d"
    fatores = t.fatores_top_individuais(contribs[hz].iloc[i], linha)
    nivel = rc.nivel_risco(round(float(vigente[i]), 4))
    print(f"{linha['colaborador_id']} | {linha['cargo']} | {linha['tipo_contrato']} | {dias_casa[i]} dias | risco vigente {vigente[i]:.2f} ({nivel}) | risco 90d {p90[i]:.2f} | risco 180d {p180[i]:.2f}")
    for f in fatores:
        print(f"   - {f['rotulo']}: {f['valor']} ({f['direcao']}, {f['contribuicao']:+.2f})")
    print("   Ação:", rc.montar_acao_recomendada(nivel, fatores, linha.to_dict()))
""")

md("""
## 8. Calibração

Risco médio previsto × taxa real por decil no teste temporal (modelo selecionado). Em 90 dias o modelo fica
calibrado nos extremos, mas as faixas Médio (0,15 a 0,30) e Alto (0,30 a 0,45) ficam superestimadas nesse teste,
que não tem admissões de pico. Em 180 dias a calibração é melhor. Por isso os limiares de nível são faixas de
priorização, não probabilidades exatas.
""")

code("""
fig, axes = plt.subplots(1, 2, figsize=(12, 5))
for ax, (hz, tr) in zip(axes, treinos.items()):
    nome = selecionados[hz]
    y_te = tr["y"][tr["m_teste"]]
    tab = t.calibracao_por_decil(y_te, tr["resultados"][nome]["p_teste"])
    lim = max(tab["risco_medio_previsto"].max(), tab["taxa_real"].max()) * 1.05
    ax.plot([0, lim], [0, lim], "--", color=rc.COR_TEXTO_SEC, linewidth=1, label="calibração perfeita")
    ax.plot(tab["risco_medio_previsto"], tab["taxa_real"], marker="o", color=CORES[0], linewidth=2, label=rc.MODELOS_NOMES[nome])
    ax.set_title(f"Calibração por decil — {hz}"); ax.set_xlabel("risco médio previsto"); ax.set_ylabel("taxa real"); ax.legend(frameon=False)
    display(tab.assign(horizonte=hz))
    display(t.calibracao_por_nivel(y_te, tr["resultados"][nome]["p_teste"]).assign(horizonte=hz))
plt.tight_layout(); plt.show()
""")

md("""
### 8.1 Validação retroativa com picos

O teste temporal oficial (admissões de 2026 com janela completa) **não contém nenhuma admissão de pico**, enquanto
mais da metade do treino é de pico. Para medir esse regime, a regressão logística é treinada com admissões até 2024 e
testada nas admissões de 2025. Essa validação não altera os modelos publicados.
""")

code("""
for hz in rc.HORIZONTES:
    pop_h = t.populacao_treino(base, rc.HORIZONTES[hz])
    _, m = t.dividir_temporal(pop_h)
    print(f"Teste oficial {hz}: {m.sum()} admissões, {pop_h.loc[m, 'admitido_periodo_pico'].astype(bool).sum()} de pico, até {pop_h.loc[m, 'data_admissao'].max().date()}")
display(t.validacao_retroativa(base))
""")

md("""
## 9. Auditoria de viés

`faixa_etaria` não entra como preditor, mas o desempenho é auditado por faixa etária, região e
escolaridade, com previsões **fora da amostra** (validação cruzada em treino + teste). Buscamos taxa prevista
próxima da real e AUC semelhante entre grupos; `taxa_alto_risco` é a proporção com risco >= 0,30.
""")

code("""
from sklearn.base import clone
from sklearn.model_selection import StratifiedKFold, cross_val_predict
vies = []
for hz, h in rc.HORIZONTES.items():
    tr = treinos[hz]
    pop = t.populacao_treino(base, h)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=rc.SEMENTE)
    p_oof = cross_val_predict(clone(tr["resultados"][selecionados[hz]]["pipeline"]), tr["X"], tr["y"], cv=cv, method="predict_proba")[:, 1]
    vies.append(t.avaliacao_vies(pop, p_oof, hz, h))
vies = pd.concat(vies, ignore_index=True)
display(vies[vies["horizonte"] == "90d"].set_index(["grupo_tipo", "grupo_valor"]).drop(columns="horizonte"))
fx = vies[vies["grupo_tipo"] == "faixa_etaria"].assign(dif_pp=lambda d: 100 * (d["risco_medio_previsto"] - d["taxa_real"]))
display(fx[["horizonte", "grupo_valor", "n", "taxa_real", "risco_medio_previsto", "dif_pp", "taxa_alto_risco"]].round(3))
""")

md("""
**O que a auditoria encontrou.** A faixa **55+ fica superestimada** (90 dias: previsto 13,0% contra real 8,1%; 180 dias:
21,0% contra 15,3%, acima do alerta de 5 p.p. do dashboard), o que gera excesso de alertas para o grupo. A faixa
**18-24 fica subestimada** nos dois horizontes (90 dias: 17,1% contra 18,8%; 180 dias: 28,8% contra 31,2%), o que pode
deixar casos sem atenção. Embora a idade não entre no modelo, `tipo_contrato` (Jovem Aprendiz) e `canal_contratacao`
(Programa Jovem) estão ligados a ela e funcionam como proxies. **Ação:** revisar com Gente & Gestão antes de qualquer
uso e avaliar recalibração por grupo na Sprint 2.
""")

md("""
## 10. Conclusões

* Os quatro modelos atingem AUC-ROC entre ~0,78 e ~0,83 no teste temporal; a **regressão logística** fica a
  menos de 0,01 do melhor e é selecionada pela regra de parcimônia — o simulador do dashboard é, portanto, o
  próprio modelo oficial.
* Os fatores mais importantes são operacionais e **acionáveis**: turnover da loja, avaliação de experiência,
  integração concluída, distância casa-trabalho, canal de contratação (agência), contrato temporário e faltas
  nos primeiros 30 dias.
* A sazonalidade concentra admissões e saídas precoces nas campanhas de Dia das Crianças e Natal, quando a
  proporção de temporários é maior.
* A auditoria encontrou descalibração por idade (55+ superestimada e 18-24 subestimada), a ser revista com
  Gente & Gestão antes de qualquer uso.
* Os efeitos dos fatores foram parametrizados no gerador da base sintética: confirmam que o método recupera o
  mecanismo simulado, mas não são achados sobre a Ri Happy.

## 11. Recomendações (playbook)

| Gatilho | Ação | Responsável | Prazo |
|---|---|---|---|
| Integração não concluída | Concluir trilha de integração com acompanhamento do líder | Líder de loja | 7 dias |
| Avaliação de experiência <= 2,5 | Conversa de feedback estruturada (1:1) e plano de desenvolvimento de 30 dias | Líder + BP RH | 7 dias |
| Distância >= 20 km | Avaliar transferência, ajuste de escala e apoio de transporte | BP RH | 15 dias |
| Faltas >= 2 ou atrasos >= 3 | Conversa de acolhimento e ajuste de escala | Líder de loja | 5 dias |
| Temporário sazonal | Comunicar critérios de efetivação e trilha de carreira | BP RH | 10 dias |
| Indicador de turnover da loja >= 45% | Diagnóstico de clima da loja e plano de ação | Gerente regional + RH | 30 dias |
| Nível Crítico / Alto / Médio | Conversa de retenção em 48h / plano individual em 7 dias / acompanhamento quinzenal | Líder + RH | 2-15 dias |

A tabela completa está em `rr_recomendacoes`; a economia potencial usa `rr_parametros_custo`
(≈ R$ 6.500 por desligamento precoce, premissa ilustrativa).

## 12. Limitações e uso responsável

* **Dados sintéticos**: as relações refletem um mecanismo plausível, não a realidade da Ri Happy; os
  resultados devem ser reestimados com a base real (pseudonimizada) antes de qualquer decisão.
* **Risco competitivo**: saídas involuntárias e fim de contrato antes do horizonte recebem rótulo 0.
* **Score único no dia 30**: sinais posteriores não são incorporados (rescoring é evolução prevista).
* **Teste temporal curto** no horizonte de 180 dias (admissões de janeiro até 4 de maio de 2026).
* **Teste sem picos**: o teste temporal só tem admissões de janeiro a agosto; a seção 8.1 cobre os picos.
* **Horizonte vencido**: quem passou do dia 90 tem nível calculado pelo risco residual até o dia 180.
* **`turnover_loja_12m` é proxy sintético** (base latente da loja + ruído individual), não o turnover realizado.
* **Início da base**: a base começa vazia em 2023-01-01, o que infla a taxa mensal de turnover nos primeiros meses.
* **Ética e LGPD**: nenhum atributo protegido é preditor; o score apoia conversas de acolhimento e nunca
  decisões punitivas; fatores explicados em linguagem simples e limitações declaradas (ver `docs/etica-lgpd.md`).
""")


def main() -> int:
    nb = new_notebook()
    nb["metadata"] = {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python"},
    }
    nb["cells"] = [new_markdown_cell(txt) if tipo == "markdown" else new_code_cell(txt) for tipo, txt in CELULAS]
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    nbformat.write(nb, str(DESTINO))
    print(f"Notebook gerado: {DESTINO} ({len(nb['cells'])} células)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
