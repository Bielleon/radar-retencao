"""
rr_comum.py — utilitários compartilhados pelo pipeline do Radar de Retenção.

Centraliza o que os scripts 01 a 04, o notebook e os validadores precisam em
comum: caminhos do repositório, data de referência, dicionário de rótulos
legíveis, listas de variáveis preditoras, playbook de recomendações, parâmetros
de custo, tipos das colunas de cada tabela ``rr_*`` (para ler/escrever CSV, JSON
e SQL de forma consistente) e pequenas funções de formatação.

Convenção: valores categóricos dos dados são ASCII sem acento (ex.: "Critico");
acentos aparecem apenas em rótulos legíveis (campo ``rotulo``) e na documentação.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Caminhos e constantes gerais
# ---------------------------------------------------------------------------
RAIZ = Path(__file__).resolve().parents[1]
DIR_RAW = RAIZ / "data" / "raw"
DIR_PROCESSED = RAIZ / "data" / "processed"
DIR_MODELOS = RAIZ / "pipeline" / "modelos"
DIR_IMG = RAIZ / "docs" / "img"
DIR_DEMO = RAIZ / "dashboard" / "public" / "demo"
DIR_SEED = RAIZ / "supabase" / "seed"

DATA_REFERENCIA = pd.Timestamp("2026-10-31")   # data de corte da base
DATA_INICIO = pd.Timestamp("2023-01-01")       # primeira admissão da base
SEMENTE = 42
VERSAO_MODELO = "v1.0"
HORIZONTES = {"90d": 90, "180d": 180}
DIA_CHECKPOINT = 30                            # dia de casa em que o risco é calculado
LIMIARES_NIVEL = {"Medio": 0.15, "Alto": 0.30, "Critico": 0.45}
NIVEIS = ["Baixo", "Medio", "Alto", "Critico"]

# Paleta das figuras (referência validada do skill de visualização)
CORES_SERIE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
CORES_NIVEL = {"Baixo": "#0ca30c", "Medio": "#fab219", "Alto": "#ec835a", "Critico": "#d03b3b"}
COR_TEXTO = "#0b0b0b"
COR_TEXTO_SEC = "#52514e"
COR_GRADE = "#e6e5e1"
COR_SUPERFICIE = "#fcfcfb"
RAMPA_AZUL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]


def dias(n: int) -> pd.Timedelta:
    """Timedelta de ``n`` dias (evita o aviso de unidade genérica do numpy >= 2.5)."""
    return pd.Timedelta(int(n), unit="D")


def configurar_saida_utf8() -> None:
    """Garante que acentos sejam impressos corretamente no console do Windows."""
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass


# ---------------------------------------------------------------------------
# Variáveis preditoras (contrato: seção 3 da especificação)
# ---------------------------------------------------------------------------
FEATURES_CAT = [
    "cargo", "tipo_contrato", "faixa_salarial", "escolaridade", "turno",
    "canal_contratacao", "mes_admissao", "bandeira", "tipo_loja", "regiao", "porte",
]
FEATURES_BOOL = ["experiencia_previa_varejo", "admitido_periodo_pico", "onboarding_concluido"]
FEATURES_NUM = [
    "carga_horaria_semanal", "experiencia_previa_varejo", "distancia_casa_trabalho_km",
    "admitido_periodo_pico", "onboarding_concluido", "horas_treinamento_30d",
    "avaliacao_experiencia_30d", "avaliacao_experiencia_30d_ausente", "faltas_30d",
    "atrasos_30d", "horas_extras_media_semana", "gestor_tempo_cargo_meses", "turnover_loja_12m",
]
FEATURES = FEATURES_CAT + FEATURES_NUM
# Atributos protegidos / excluídos do modelo (usados só na auditoria de viés)
VARIAVEIS_EXCLUIDAS = ["faixa_etaria", "loja_id"]

ROTULOS = {
    "cargo": "Cargo",
    "tipo_contrato": "Tipo de contrato",
    "faixa_salarial": "Faixa salarial",
    "escolaridade": "Escolaridade",
    "turno": "Turno",
    "carga_horaria_semanal": "Carga horária semanal",
    "canal_contratacao": "Canal de contratação",
    "experiencia_previa_varejo": "Experiência prévia em varejo",
    "distancia_casa_trabalho_km": "Distância casa-trabalho",
    "admitido_periodo_pico": "Admissão em período de pico",
    "mes_admissao": "Mês de admissão",
    "bandeira": "Bandeira",
    "tipo_loja": "Tipo de loja",
    "regiao": "Região",
    "porte": "Porte da loja",
    "onboarding_concluido": "Integração concluída até o dia 30",
    "horas_treinamento_30d": "Horas de treinamento (30 dias)",
    "avaliacao_experiencia_30d": "Avaliação de experiência (30 dias)",
    "avaliacao_experiencia_30d_ausente": "Avaliação de experiência não realizada",
    "faltas_30d": "Faltas (30 dias)",
    "atrasos_30d": "Atrasos (30 dias)",
    "horas_extras_media_semana": "Horas extras médias por semana",
    "gestor_tempo_cargo_meses": "Tempo do gestor no cargo",
    "turnover_loja_12m": "Indicador de turnover da loja (proxy sintético)",
    "faixa_etaria": "Faixa etária",
    "loja_id": "Loja",
}

MESES_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril", 5: "Maio", 6: "Junho",
    7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
}

MODELOS_NOMES = {
    "regressao_logistica": "Regressão logística",
    "random_forest": "Random forest",
    "gradient_boosting": "Gradient boosting (HistGB)",
    "xgboost": "XGBoost",
}

# ---------------------------------------------------------------------------
# Playbook de recomendações (seção 7) — as regras por fator usam um gatilho
# avaliado sobre o registro do colaborador; as regras por nível usam o nível.
# ---------------------------------------------------------------------------
PLAYBOOK = [
    {"id": 1, "fator": "onboarding_concluido", "rotulo_fator": "Integração não concluída", "nivel_minimo": "Baixo",
     "acao": "Concluir trilha de integração com acompanhamento do líder", "responsavel": "Líder de loja", "prazo_dias": 7,
     "gatilho": lambda r: r.get("onboarding_concluido") is False},
    {"id": 2, "fator": "avaliacao_experiencia_30d", "rotulo_fator": "Avaliação de experiência ≤ 2,5", "nivel_minimo": "Baixo",
     "acao": "Conversa de feedback estruturada (1:1) e plano de desenvolvimento de 30 dias", "responsavel": "Líder + BP RH", "prazo_dias": 7,
     "gatilho": lambda r: _num(r.get("avaliacao_experiencia_30d")) is not None and _num(r.get("avaliacao_experiencia_30d")) <= 2.5},
    {"id": 3, "fator": "distancia_casa_trabalho_km", "rotulo_fator": "Distância casa-trabalho ≥ 20 km", "nivel_minimo": "Baixo",
     "acao": "Avaliar transferência para loja mais próxima, ajuste de escala e apoio de transporte", "responsavel": "BP RH", "prazo_dias": 15,
     "gatilho": lambda r: (_num(r.get("distancia_casa_trabalho_km")) or 0) >= 20},
    {"id": 4, "fator": "faltas_30d", "rotulo_fator": "Faltas ≥ 2 ou atrasos ≥ 3", "nivel_minimo": "Baixo",
     "acao": "Conversa de acolhimento para entender causas (saúde, transporte, estudos) e ajustar escala", "responsavel": "Líder de loja", "prazo_dias": 5,
     "gatilho": lambda r: (_num(r.get("faltas_30d")) or 0) >= 2 or (_num(r.get("atrasos_30d")) or 0) >= 3},
    {"id": 5, "fator": "tipo_contrato", "rotulo_fator": "Contrato temporário sazonal", "nivel_minimo": "Baixo",
     "acao": "Comunicar critérios de efetivação pós-campanha e trilha de carreira", "responsavel": "BP RH", "prazo_dias": 10,
     "gatilho": lambda r: r.get("tipo_contrato") == "Temporario Sazonal"},
    {"id": 6, "fator": "faixa_salarial", "rotulo_fator": "Faixa salarial até 1,5 SM", "nivel_minimo": "Baixo",
     "acao": "Revisar variável/comissão e benefícios; reconhecimento não financeiro", "responsavel": "Gente & Gestão", "prazo_dias": 30,
     "gatilho": lambda r: r.get("faixa_salarial") == "Ate 1.5 SM"},
    {"id": 7, "fator": "gestor_tempo_cargo_meses", "rotulo_fator": "Gestor com menos de 6 meses no cargo", "nivel_minimo": "Baixo",
     "acao": "Mentoria para o líder recém-promovido com apoio do gerente regional", "responsavel": "Gerente regional", "prazo_dias": 15,
     "gatilho": lambda r: _num(r.get("gestor_tempo_cargo_meses")) is not None and _num(r.get("gestor_tempo_cargo_meses")) < 6},
    {"id": 8, "fator": "turnover_loja_12m", "rotulo_fator": "Indicador de turnover da loja alto (≥ 45%)", "nivel_minimo": "Baixo",
     "acao": "Diagnóstico de clima da loja e plano de ação", "responsavel": "Gerente regional + RH", "prazo_dias": 30,
     "gatilho": lambda r: (_num(r.get("turnover_loja_12m")) or 0) >= 0.45},
    {"id": 9, "fator": "horas_extras_media_semana", "rotulo_fator": "Horas extras ≥ 6 h/semana", "nivel_minimo": "Baixo",
     "acao": "Revisar escala e dimensionamento da equipe nos picos", "responsavel": "Operações", "prazo_dias": 15,
     "gatilho": lambda r: (_num(r.get("horas_extras_media_semana")) or 0) >= 6},
    {"id": 10, "fator": "turno", "rotulo_fator": "Turno da noite", "nivel_minimo": "Baixo",
     "acao": "Avaliar preferência de turno e rodízio", "responsavel": "Líder de loja", "prazo_dias": 15,
     "gatilho": lambda r: r.get("turno") == "Noite"},
    {"id": 11, "fator": "canal_contratacao", "rotulo_fator": "Contratação via agência", "nivel_minimo": "Baixo",
     "acao": "Reforçar alinhamento de expectativas na seleção (prévia realista da função)", "responsavel": "Recrutamento", "prazo_dias": 30,
     "gatilho": lambda r: r.get("canal_contratacao") == "Agencia"},
    {"id": 12, "fator": "nivel", "rotulo_fator": "Nível Crítico", "nivel_minimo": "Critico",
     "acao": "Conversa de retenção líder + RH em 48h", "responsavel": "Líder + BP RH", "prazo_dias": 2, "gatilho": None},
    {"id": 13, "fator": "nivel", "rotulo_fator": "Nível Alto", "nivel_minimo": "Alto",
     "acao": "Plano de retenção individual em 7 dias", "responsavel": "Líder de loja", "prazo_dias": 7, "gatilho": None},
    {"id": 14, "fator": "nivel", "rotulo_fator": "Nível Médio", "nivel_minimo": "Medio",
     "acao": "Acompanhamento quinzenal na integração", "responsavel": "Líder de loja", "prazo_dias": 15, "gatilho": None},
    {"id": 15, "fator": "nivel", "rotulo_fator": "Nível Baixo", "nivel_minimo": "Baixo",
     "acao": "Acompanhamento padrão de integração", "responsavel": "Líder de loja", "prazo_dias": 30, "gatilho": None},
]

# Parâmetros de custo do turnover precoce (seção 8)
PARAMETROS_CUSTO = [
    {"chave": "recrutamento_selecao", "rotulo": "Recrutamento e seleção", "valor": 900.0,
     "descricao": "Divulgação da vaga, triagem, entrevistas e exames admissionais de uma nova contratação."},
    {"chave": "treinamento_integracao", "rotulo": "Treinamento e integração", "valor": 1400.0,
     "descricao": "Horas de treinador, material da trilha de integração e tempo do líder na primeira semana."},
    {"chave": "encargos_rescisorios", "rotulo": "Encargos e processo de desligamento", "valor": 1100.0,
     "descricao": "Verbas rescisórias proporcionais, exame demissional e processamento administrativo."},
    {"chave": "produtividade_perdida", "rotulo": "Produtividade perdida na curva de aprendizado", "valor": 2200.0,
     "descricao": "Diferença de produtividade entre um novato e um colaborador experiente durante os primeiros meses."},
    {"chave": "vacancia_cobertura", "rotulo": "Cobertura da vaga", "valor": 900.0,
     "descricao": "Horas extras da equipe e perda de vendas enquanto a posição fica desfalcada."},
]
FONTE_CUSTO = "premissa ilustrativa do MVP"

# ---------------------------------------------------------------------------
# Tipos das colunas de cada tabela rr_ (mesma ordem do schema SQL)
# tipos: text | int | num | bool | date | json | ts
# ---------------------------------------------------------------------------
TIPOS_TABELAS: dict[str, dict[str, str]] = {
    "lojas": {
        "loja_id": "text", "bandeira": "text", "tipo_loja": "text", "regiao": "text", "uf": "text",
        "cidade": "text", "porte": "text", "headcount_alvo": "int", "turnover_vol_12m": "num",
    },
    "colaboradores": {
        "colaborador_id": "text", "loja_id": "text", "cargo": "text", "tipo_contrato": "text",
        "faixa_etaria": "text", "faixa_salarial": "text", "escolaridade": "text", "turno": "text",
        "carga_horaria_semanal": "int", "canal_contratacao": "text", "experiencia_previa_varejo": "bool",
        "distancia_casa_trabalho_km": "num", "admitido_periodo_pico": "bool", "mes_admissao": "int",
        "data_admissao": "date", "data_desligamento": "date", "tipo_desligamento": "text",
        "motivo_desligamento": "text", "onboarding_concluido": "bool", "horas_treinamento_30d": "num",
        "avaliacao_experiencia_30d": "num", "faltas_30d": "int", "atrasos_30d": "int",
        "horas_extras_media_semana": "num", "gestor_tempo_cargo_meses": "int", "turnover_loja_12m": "num",
        "dias_de_casa": "int", "status": "text",
    },
    "predicoes": {
        "colaborador_id": "text", "data_referencia": "date", "dias_de_casa": "int", "risco_90d": "num",
        "risco_180d": "num", "nivel_risco": "text", "fatores_top": "json", "acao_recomendada": "text",
        "modelo_versao": "text",
    },
    "fatores_globais": {
        "horizonte": "text", "fator": "text", "rotulo": "text", "importancia": "num", "direcao": "text", "posicao": "int",
    },
    "metricas_modelo": {
        "horizonte": "text", "modelo": "text", "metrica": "text", "valor": "num", "selecionado": "bool",
    },
    "curva_sobrevivencia": {
        "segmento_tipo": "text", "segmento_valor": "text", "dia": "int", "prob_permanencia": "num", "n_risco": "int",
    },
    "turnover_mensal": {
        "mes": "date", "admissoes": "int", "desligamentos_voluntarios": "int", "desligamentos_involuntarios": "int",
        "desligamentos_vol_precoces": "int", "headcount_medio": "num", "taxa_turnover_vol": "num",
        "taxa_turnover_total": "num", "periodo_pico": "bool", "campanha": "text",
    },
    "avaliacao_vies": {
        "horizonte": "text", "grupo_tipo": "text", "grupo_valor": "text", "n": "int", "taxa_real": "num",
        "risco_medio_previsto": "num", "auc": "num", "taxa_alto_risco": "num",
    },
    "efeito_fator": {
        "horizonte": "text", "fator": "text", "rotulo_fator": "text", "categoria": "text", "ordem": "int",
        "n": "int", "taxa_real": "num", "risco_medio": "num",
    },
    "parametros_custo": {"chave": "text", "rotulo": "text", "valor": "num", "descricao": "text", "fonte": "text"},
    "recomendacoes": {
        "id": "int", "fator": "text", "rotulo_fator": "text", "nivel_minimo": "text", "acao": "text",
        "responsavel": "text", "prazo_dias": "int",
    },
    "modelos": {"versao": "text", "treinado_em": "ts", "descricao": "text", "card": "json"},
}
# Ordem de carga respeitando as chaves estrangeiras (lojas -> colaboradores -> predicoes)
TABELAS_ORDEM = [
    "lojas", "colaboradores", "predicoes", "fatores_globais", "metricas_modelo", "curva_sobrevivencia",
    "turnover_mensal", "avaliacao_vies", "efeito_fator", "parametros_custo", "recomendacoes", "modelos",
]
CHAVES_PRIMARIAS = {
    "lojas": ["loja_id"], "colaboradores": ["colaborador_id"], "predicoes": ["colaborador_id"],
    "fatores_globais": ["horizonte", "fator"], "metricas_modelo": ["horizonte", "modelo", "metrica"],
    "curva_sobrevivencia": ["segmento_tipo", "segmento_valor", "dia"], "turnover_mensal": ["mes"],
    "avaliacao_vies": ["horizonte", "grupo_tipo", "grupo_valor"], "efeito_fator": ["horizonte", "fator", "categoria"],
    "parametros_custo": ["chave"], "recomendacoes": ["id"], "modelos": ["versao"],
}
COLUNAS_LOJAS = list(TIPOS_TABELAS["lojas"])
COLUNAS_COLABORADORES = list(TIPOS_TABELAS["colaboradores"])


# ---------------------------------------------------------------------------
# Leitura e escrita de CSV com tipos consistentes
# ---------------------------------------------------------------------------
def _num(v):
    """Converte para float quando possível; nulos viram None."""
    if v is None:
        return None
    try:
        if isinstance(v, float) and np.isnan(v):
            return None
        if v is pd.NA or v is pd.NaT:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def ler_csv_tabela(nome: str, caminho: Path | None = None) -> pd.DataFrame:
    """Lê o CSV de uma tabela rr_ aplicando os tipos declarados em TIPOS_TABELAS.

    Booleanos chegam como "true"/"false" (vazio = nulo), datas como YYYY-MM-DD,
    jsonb como texto JSON (mantido como string; use json.loads quando precisar).
    """
    tipos = TIPOS_TABELAS[nome]
    caminho = caminho or (DIR_PROCESSED / f"{nome}.csv")
    df = pd.read_csv(caminho, dtype=str, keep_default_na=False, encoding="utf-8")
    faltantes = [c for c in tipos if c not in df.columns]
    if faltantes:
        raise ValueError(f"{caminho.name}: colunas ausentes {faltantes}")
    df = df[list(tipos)]
    for col, tipo in tipos.items():
        s = df[col].replace({"": None})
        if tipo == "int":
            df[col] = pd.to_numeric(s, errors="raise").astype("Int64")
        elif tipo == "num":
            df[col] = pd.to_numeric(s, errors="raise").astype(float)
        elif tipo == "bool":
            df[col] = s.map({"true": True, "false": False, None: None}).astype(object)
        elif tipo == "date":
            df[col] = pd.to_datetime(s, format="%Y-%m-%d", errors="raise")
        else:  # text, json, ts
            df[col] = s.astype(object).where(s.notna(), None)
    return df


def formatar_para_csv(df: pd.DataFrame, nome: str) -> pd.DataFrame:
    """Devolve uma cópia com os valores formatados para o CSV do contrato.

    Datas "YYYY-MM-DD", booleanos "true"/"false", nulos vazios, jsonb como string.
    """
    tipos = TIPOS_TABELAS[nome]
    saida = pd.DataFrame(index=df.index)
    for col, tipo in tipos.items():
        s = df[col]
        if tipo == "bool":
            saida[col] = s.map(lambda v: "" if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NA
                               else ("true" if bool(v) else "false"))
        elif tipo == "date":
            saida[col] = pd.to_datetime(s).dt.strftime("%Y-%m-%d").fillna("")
        elif tipo == "int":
            saida[col] = s.map(lambda v: "" if v is None or pd.isna(v) else str(int(v)))
        elif tipo == "num":
            saida[col] = s.map(lambda v: "" if v is None or pd.isna(v) else repr(float(v)))
        else:
            saida[col] = s.map(lambda v: "" if v is None or (isinstance(v, float) and np.isnan(v)) else str(v))
    return saida


def escrever_csv_tabela(df: pd.DataFrame, nome: str, caminho: Path | None = None) -> Path:
    """Grava o CSV de uma tabela rr_ em data/processed (ou no caminho informado)."""
    caminho = caminho or (DIR_PROCESSED / f"{nome}.csv")
    caminho.parent.mkdir(parents=True, exist_ok=True)
    formatar_para_csv(df, nome).to_csv(caminho, index=False, encoding="utf-8", lineterminator="\n")
    return caminho


# ---------------------------------------------------------------------------
# Níveis de risco, rótulos e formatação de valores de fatores
# ---------------------------------------------------------------------------
def nivel_risco(p: float) -> str:
    """Classifica um risco de janela de 90 dias nos quatro níveis do contrato."""
    if p >= LIMIARES_NIVEL["Critico"]:
        return "Critico"
    if p >= LIMIARES_NIVEL["Alto"]:
        return "Alto"
    if p >= LIMIARES_NIVEL["Medio"]:
        return "Medio"
    return "Baixo"


def risco_vigente(risco_90d: float, risco_180d: float, dias_de_casa: int) -> float:
    """Risco que ainda pode se realizar para o colaborador na data de referência.

    Até o dia 90 vale o risco de 90 dias. Depois do dia 90 esse horizonte já venceu sem
    o evento, então vale o risco residual até o dia 180, condicional a ter chegado ao dia 90:
    (risco_180d - risco_90d) / (1 - risco_90d), limitado a zero porque os dois modelos são
    ajustados separadamente.
    """
    if dias_de_casa <= 90:
        return float(risco_90d)
    if risco_90d >= 1:
        return 0.0
    return max(0.0, (float(risco_180d) - float(risco_90d)) / (1.0 - float(risco_90d)))


def rotulo_fator(fator: str, valor=None) -> str:
    """Rótulo legível do fator; para booleanos o rótulo descreve a situação observada."""
    if fator == "onboarding_concluido" and valor is not None:
        return "Integração concluída" if bool(valor) else "Integração não concluída"
    if fator == "experiencia_previa_varejo" and valor is not None:
        return "Com experiência prévia em varejo" if bool(valor) else "Sem experiência prévia em varejo"
    if fator == "admitido_periodo_pico" and valor is not None:
        return "Admitido em período de pico" if bool(valor) else "Admitido fora do período de pico"
    return ROTULOS.get(fator, fator)


def formatar_valor_fator(fator: str, valor) -> str:
    """Formata o valor de uma variável para exibição (ex.: "27 km", "4.5 / 5")."""
    nulo = valor is None or (isinstance(valor, float) and np.isnan(valor)) or valor is pd.NA
    if fator == "avaliacao_experiencia_30d":
        return "Não avaliado" if nulo else f"{float(valor):.1f}".replace(".", ",") + " / 5"
    if fator == "avaliacao_experiencia_30d_ausente":
        return "Sim" if (not nulo and float(valor) >= 0.5) else "Não"
    if nulo:
        return "Não informado"
    if fator in FEATURES_BOOL:
        return "Sim" if bool(valor) else "Não"
    if fator == "distancia_casa_trabalho_km":
        return f"{float(valor):.0f} km"
    if fator == "faltas_30d":
        n = int(valor)
        return f"{n} falta" if n == 1 else f"{n} faltas"
    if fator == "atrasos_30d":
        n = int(valor)
        return f"{n} atraso" if n == 1 else f"{n} atrasos"
    if fator == "horas_extras_media_semana":
        return f"{float(valor):.1f}".replace(".", ",") + " h/semana"
    if fator == "horas_treinamento_30d":
        return f"{float(valor):.0f} h"
    if fator == "gestor_tempo_cargo_meses":
        n = int(valor)
        return f"{n} mês" if n == 1 else f"{n} meses"
    if fator == "turnover_loja_12m":
        return f"{100 * float(valor):.0f}%"
    if fator == "carga_horaria_semanal":
        return f"{int(valor)} h/semana"
    if fator == "mes_admissao":
        return MESES_PT.get(int(valor), str(valor))
    return str(valor)


def regra_playbook_para_fator(fator: str, registro: dict) -> dict | None:
    """Devolve a regra do playbook disparada pelo fator principal, se existir."""
    for regra in PLAYBOOK:
        if regra["fator"] == fator and regra["gatilho"] is not None and regra["gatilho"](registro):
            return regra
    # faltas e atrasos compartilham a mesma regra (id 4)
    if fator == "atrasos_30d":
        regra = PLAYBOOK[3]
        if regra["gatilho"](registro):
            return regra
    return None


def acao_do_nivel(nivel: str) -> str:
    """Ação do playbook associada ao nível de risco."""
    for regra in PLAYBOOK:
        if regra["fator"] == "nivel" and regra["nivel_minimo"] == nivel:
            return regra["acao"]
    raise KeyError(nivel)


def montar_acao_recomendada(nivel: str, fatores_top: list[dict], registro: dict) -> str:
    """Ação do nível + ' | ' + ação do fator principal (quando ele dispara uma regra)."""
    acao = acao_do_nivel(nivel)
    if fatores_top:
        principal = fatores_top[0]["fator"]
        regra = regra_playbook_para_fator(principal, registro)
        if regra is not None:
            acao = f"{acao} | {regra['acao']}"
    return acao


def tabela_recomendacoes() -> pd.DataFrame:
    """Playbook no formato da tabela rr_recomendacoes."""
    linhas = [{k: r[k] for k in ("id", "fator", "rotulo_fator", "nivel_minimo", "acao", "responsavel", "prazo_dias")}
              for r in PLAYBOOK]
    return pd.DataFrame(linhas)


def tabela_parametros_custo() -> pd.DataFrame:
    """Parâmetros de custo no formato da tabela rr_parametros_custo."""
    df = pd.DataFrame(PARAMETROS_CUSTO)
    df["fonte"] = FONTE_CUSTO
    return df[["chave", "rotulo", "valor", "descricao", "fonte"]]


def _nulo(v) -> bool:
    """True para None, NaN, NA ou NaT."""
    if v is None or v is pd.NA or v is pd.NaT:
        return True
    return isinstance(v, float) and np.isnan(v)


def valor_json(v, tipo: str):
    """Converte um valor de célula para o tipo JSON do contrato (number/boolean/string/null/objeto)."""
    if _nulo(v):
        return None
    if tipo == "int":
        return int(v)
    if tipo == "num":
        return float(v)
    if tipo == "bool":
        return bool(v)
    if tipo == "date":
        return pd.Timestamp(v).strftime("%Y-%m-%d")
    if tipo == "json":
        return json.loads(v) if isinstance(v, str) else json_seguro(v)
    return str(v)


def registros_json(df: pd.DataFrame, nome: str) -> list[dict]:
    """DataFrame de uma tabela rr_ -> lista de dicionários prontos para JSON/PostgREST."""
    tipos = TIPOS_TABELAS[nome]
    colunas = list(tipos)
    return [{c: valor_json(v, tipos[c]) for c, v in zip(colunas, linha)} for linha in df[colunas].itertuples(index=False, name=None)]


def literal_sql(v, tipo: str) -> str:
    """Literal SQL (PostgreSQL) de um valor de célula conforme o tipo da coluna."""
    if _nulo(v):
        return "NULL"
    if tipo == "int":
        return str(int(v))
    if tipo == "num":
        return repr(float(v))
    if tipo == "bool":
        return "true" if bool(v) else "false"
    if tipo == "date":
        return f"'{pd.Timestamp(v).strftime('%Y-%m-%d')}'"
    if tipo == "json":
        texto = v if isinstance(v, str) else despejar_json(v)
        return "'" + texto.replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def json_seguro(obj):
    """Converte tipos numpy/pandas em tipos nativos para serialização JSON."""
    if isinstance(obj, dict):
        return {str(k): json_seguro(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_seguro(v) for v in obj]
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        v = float(obj)
        return None if np.isnan(v) else v
    if isinstance(obj, float) and np.isnan(obj):
        return None
    if isinstance(obj, (pd.Timestamp,)):
        return obj.strftime("%Y-%m-%d")
    if obj is pd.NA or obj is pd.NaT:
        return None
    return obj


def despejar_json(obj) -> str:
    """Serializa em JSON compacto (UTF-8, sem escapes de acentos)."""
    return json.dumps(json_seguro(obj), ensure_ascii=False, separators=(",", ":"))
