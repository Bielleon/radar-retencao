"""
01_gerar_dados_sinteticos.py — geração da base sintética do Radar de Retenção.

Produz ``data/raw/lojas.csv`` e ``data/raw/colaboradores.csv`` com exatamente as
colunas das tabelas ``rr_lojas`` e ``rr_colaboradores``.

Como a base é construída
------------------------
1. **Lojas** (80): bandeira, tipo, região/UF/cidade coerentes (capitais e cidades
   reais), porte e headcount alvo. Cada loja tem um *clima latente* (não
   observado) que alimenta o turnover da loja e, em menor grau, o risco individual.
2. **Admissões mensais** (2023-01 a 2026-10): reposição proporcional ao headcount
   e ao turnover da loja, com picos em set/out (Dia das Crianças) e nov/dez
   (Natal) de 2 a 3x o volume e predominância de contratos temporários sazonais.
3. **Atributos do colaborador**: cargo, contrato, faixa etária, salário coerente
   com o cargo, escolaridade, turno, carga horária, canal, experiência prévia,
   distância (lognormal), sinais dos primeiros 30 dias (integração, treinamento,
   avaliação de experiência, faltas, atrasos, horas extras), tempo do gestor e
   turnover da loja nos 12 meses anteriores à admissão.
4. **Mecanismo de desligamento** (riscos competitivos, simulação diária):
   * saída *voluntária*: hazard de base que sobe nas primeiras semanas, é máximo
     entre os dias 30 e 90 e decresce depois, multiplicado por
     ``exp(preditor linear + fragilidade)``; a fragilidade individual (gaussiana,
     não observada) limita o AUC alcançável a ~0,80-0,88;
   * saída *involuntária*: hazard separado (desempenho, com picos no fim dos
     períodos de experiência de 45 e 90 dias; redução de quadro) e fim de contrato
     dos temporários (~90-120 dias, 30% são efetivados) e dos aprendizes;
   * censura na data de referência (2026-10-31).
5. **Motivo declarado** da saída voluntária sorteado condicionado ao fator que
   mais pesou para a pessoa (distância, salário, horário, liderança, adaptação...).

O script imprime um resumo de calibração e falha (código 1) se alguma meta do
contrato não for atingida, para que o pipeline nunca siga com dados fora da
especificação.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rr_comum import (  # noqa: E402
    COLUNAS_COLABORADORES, COLUNAS_LOJAS, DATA_INICIO, DATA_REFERENCIA, DIR_RAW, SEMENTE,
    configurar_saida_utf8, dias, escrever_csv_tabela,
)

# ---------------------------------------------------------------------------
# Parâmetros de calibração (ajustados para as metas do contrato)
# ---------------------------------------------------------------------------
PARAMETROS = {
    "n_lojas": 80,
    "taxa_mensal_base": 0.0430,      # admissões/mês por pessoa do headcount alvo (loja média)
    "elasticidade_turnover": 1.2,    # lojas com mais turnover repõem mais
    # hazard diário de base da saída voluntária: c + a*exp(-t/tau)*(1-exp(-t/tau0))
    "hazard_vol_c": 0.00200,
    "hazard_vol_a": 0.00800,
    "hazard_vol_tau": 180.0,
    "hazard_vol_tau0": 40.0,
    # hazard diário de base da saída involuntária
    "hazard_inv_c": 0.00015,
    "hazard_inv_pico_45": 0.0040,    # fim do 1º período de experiência (dias 44-45)
    "hazard_inv_pico_90": 0.0050,    # fim do 2º período de experiência (dias 89-90)
    "sigma_fragilidade": 0.50,       # heterogeneidade não observada (log-hazard)
    "escala_efeitos": 1.20,          # multiplicador global dos coeficientes observáveis
    "limite_log_hazard": 6.0,        # corte de segurança do preditor total (praticamente inativo)
    "p_efetivacao_temporario": 0.30, # temporários efetivados ao fim do contrato
}
SAZONALIDADE = {1: 1.05, 2: 0.95, 3: 1.0, 4: 0.95, 5: 1.05, 6: 0.95, 7: 1.0, 8: 1.05,
                9: 3.0, 10: 2.5, 11: 2.4, 12: 1.8}   # picos: Dia das Crianças (9-10) e Natal (11-12)
CRESCIMENTO_ANUAL = {2023: 1.0, 2024: 1.06, 2025: 1.14, 2026: 1.28}  # expansão da rede
MESES_PICO = {9, 10, 11, 12}

# Coeficientes do preditor linear da saída voluntária (escala log-hazard)
COEF_VOL = {
    "tipo_contrato": {"CLT Efetivo": 0.0, "Temporario Sazonal": 0.60, "Jovem Aprendiz": -0.30, "Intermitente": 0.45},
    "cargo": {"Vendedor": 0.0, "Operador de Caixa": 0.0, "Estoquista": 0.10, "Lider de Loja": -0.60, "Gerente de Loja": -0.90},
    "faixa_salarial": {"Ate 1.5 SM": 0.45, "1.5 a 2 SM": 0.20, "2 a 3 SM": 0.0, "3 a 5 SM": -0.25, "Acima de 5 SM": -0.40},
    "turno": {"Manha": 0.0, "Tarde": 0.05, "Noite": 0.40, "Integral": 0.05},
    "canal_contratacao": {"Indicacao": -0.35, "Site/Portal": 0.0, "Agencia": 0.25, "Programa Jovem": 0.0, "Recontratacao": -0.20},
    "faixa_etaria": {"18-24": 0.15, "25-34": 0.0, "35-44": -0.05, "45-54": -0.10, "55+": -0.10},
    "escolaridade": {"Fundamental": -0.05, "Medio": 0.0, "Superior Incompleto": 0.05, "Superior Completo": 0.10},
    "tipo_loja": {"Shopping": 0.0, "Rua": -0.05, "Outlet": 0.10},
    "regiao": {"Sudeste": 0.05, "Sul": 0.0, "Nordeste": -0.10, "Norte": -0.05, "Centro-Oeste": 0.0},
    "porte": {"Pequena": 0.0, "Media": 0.0, "Grande": 0.05},
    "distancia_por_km": 0.040,             # por km acima de 9 km (saturando em 45 km)
    "distancia_x_noite_por_km": 0.025,     # interação não linear: distância pesa mais à noite
    "onboarding_nao_concluido": 0.95,      # efeito forte
    "avaliacao_por_ponto": -0.50,          # por ponto acima de 3,5
    "avaliacao_ausente": 0.25,
    "faltas_por_falta": 0.25,
    "faltas_3_ou_mais_extra": 0.45,        # interação não linear: 3+ faltas pesam mais
    "atrasos_por_atraso": 0.10,
    "horas_extras_por_hora": 0.06,         # por hora acima de 3 h/semana
    "gestor_menos_6_meses": 0.40,
    "turnover_loja_por_unidade": 1.8,      # por unidade acima de 0,40 (observado)
    "clima_loja_latente": 0.20,            # parcela não observada do clima da loja
    "admitido_pico": 0.25,
    "experiencia_previa": -0.40,
    "carga_20h": 0.15,
}

# ---------------------------------------------------------------------------
# Catálogos categóricos (valores ASCII sem acento, como no schema)
# ---------------------------------------------------------------------------
BANDEIRAS = (["Ri Happy", "PBKids", "Divertudo", "Newtoys"], [0.55, 0.25, 0.10, 0.10])
TIPOS_LOJA = (["Shopping", "Rua", "Outlet"], [0.65, 0.25, 0.10])
REGIOES = (["Sudeste", "Sul", "Nordeste", "Norte", "Centro-Oeste"], [0.45, 0.15, 0.20, 0.07, 0.13])
PORTES = (["Pequena", "Media", "Grande"], [0.35, 0.45, 0.20])
HEADCOUNT_POR_PORTE = {"Pequena": (12, 21), "Media": (21, 39), "Grande": (39, 61)}   # intervalos [a, b)
# (uf, cidade, peso) — capitais e cidades reais de cada região
CIDADES = {
    "Sudeste": [("SP", "Sao Paulo", 10), ("SP", "Campinas", 2), ("SP", "Guarulhos", 1), ("SP", "Santos", 1),
                ("SP", "Ribeirao Preto", 1), ("SP", "Sao Jose dos Campos", 1), ("SP", "Sorocaba", 1), ("SP", "Osasco", 1),
                ("SP", "Santo Andre", 1), ("SP", "Sao Bernardo do Campo", 1), ("RJ", "Rio de Janeiro", 5), ("RJ", "Niteroi", 1),
                ("RJ", "Duque de Caxias", 1), ("RJ", "Nova Iguacu", 1), ("MG", "Belo Horizonte", 3), ("MG", "Uberlandia", 1),
                ("MG", "Contagem", 1), ("MG", "Juiz de Fora", 1), ("ES", "Vitoria", 1), ("ES", "Vila Velha", 1)],
    "Sul": [("PR", "Curitiba", 3), ("PR", "Londrina", 1), ("PR", "Maringa", 1), ("SC", "Florianopolis", 2), ("SC", "Joinville", 1),
            ("SC", "Blumenau", 1), ("RS", "Porto Alegre", 3), ("RS", "Caxias do Sul", 1), ("RS", "Canoas", 1)],
    "Nordeste": [("BA", "Salvador", 3), ("BA", "Feira de Santana", 1), ("PE", "Recife", 3), ("PE", "Jaboatao dos Guararapes", 1),
                 ("CE", "Fortaleza", 3), ("MA", "Sao Luis", 1), ("RN", "Natal", 1), ("PB", "Joao Pessoa", 1), ("AL", "Maceio", 1),
                 ("SE", "Aracaju", 1), ("PI", "Teresina", 1)],
    "Norte": [("AM", "Manaus", 3), ("PA", "Belem", 2), ("PA", "Ananindeua", 1), ("TO", "Palmas", 1), ("RO", "Porto Velho", 1),
              ("AP", "Macapa", 1), ("RR", "Boa Vista", 1), ("AC", "Rio Branco", 1)],
    "Centro-Oeste": [("DF", "Brasilia", 4), ("GO", "Goiania", 3), ("GO", "Anapolis", 1), ("MT", "Cuiaba", 2), ("MS", "Campo Grande", 2)],
}

CONTRATOS = ["CLT Efetivo", "Temporario Sazonal", "Jovem Aprendiz", "Intermitente"]
P_CONTRATO_FORA_PICO = [0.74, 0.08, 0.11, 0.07]
P_CONTRATO_PICO = [0.38, 0.50, 0.05, 0.07]
CARGOS = ["Vendedor", "Operador de Caixa", "Estoquista", "Lider de Loja", "Gerente de Loja"]
P_CARGO_POR_CONTRATO = {
    "CLT Efetivo": [0.47, 0.19, 0.13, 0.14, 0.07],
    "Temporario Sazonal": [0.62, 0.20, 0.18, 0.0, 0.0],
    "Jovem Aprendiz": [0.55, 0.15, 0.30, 0.0, 0.0],
    "Intermitente": [0.60, 0.25, 0.15, 0.0, 0.0],
}
FAIXAS_ETARIAS = ["18-24", "25-34", "35-44", "45-54", "55+"]
P_IDADE_OPERACIONAL = [0.40, 0.32, 0.16, 0.08, 0.04]
P_IDADE_LIDERANCA = [0.05, 0.42, 0.33, 0.15, 0.05]
FAIXAS_SALARIAIS = ["Ate 1.5 SM", "1.5 a 2 SM", "2 a 3 SM", "3 a 5 SM", "Acima de 5 SM"]
P_SALARIO_POR_CARGO = {
    "Vendedor": [0.42, 0.42, 0.16, 0.0, 0.0],
    "Operador de Caixa": [0.48, 0.42, 0.10, 0.0, 0.0],
    "Estoquista": [0.52, 0.38, 0.10, 0.0, 0.0],
    "Lider de Loja": [0.0, 0.05, 0.45, 0.45, 0.05],
    "Gerente de Loja": [0.0, 0.0, 0.05, 0.50, 0.45],
}
ESCOLARIDADES = ["Fundamental", "Medio", "Superior Incompleto", "Superior Completo"]
P_ESCOLARIDADE = {
    "operacional": [0.08, 0.56, 0.26, 0.10],
    "Lider de Loja": [0.03, 0.45, 0.30, 0.22],
    "Gerente de Loja": [0.0, 0.22, 0.30, 0.48],
}
TURNOS = ["Manha", "Tarde", "Noite", "Integral"]
P_TURNO_POR_TIPO_LOJA = {"Shopping": [0.25, 0.35, 0.20, 0.20], "Rua": [0.40, 0.35, 0.05, 0.20], "Outlet": [0.30, 0.35, 0.15, 0.20]}
CARGAS = [20, 30, 36, 44]
P_CARGA_POR_CONTRATO = {
    "CLT Efetivo": [0.05, 0.10, 0.20, 0.65],
    "Temporario Sazonal": [0.0, 0.15, 0.25, 0.60],
    "Jovem Aprendiz": [0.60, 0.40, 0.0, 0.0],
    "Intermitente": [0.55, 0.45, 0.0, 0.0],
}
CANAIS = ["Indicacao", "Site/Portal", "Agencia", "Programa Jovem", "Recontratacao"]
P_CANAL_POR_CONTRATO = {
    "CLT Efetivo": [0.28, 0.42, 0.15, 0.05, 0.10],
    "Temporario Sazonal": [0.20, 0.35, 0.35, 0.0, 0.10],
    "Jovem Aprendiz": [0.05, 0.05, 0.0, 0.90, 0.0],
    "Intermitente": [0.30, 0.30, 0.25, 0.0, 0.15],
}
MOTIVOS_VOL = ["Distancia/deslocamento", "Salario/beneficios", "Nova oportunidade", "Horario/escala",
               "Relacao com lideranca", "Estudos", "Saude/familia", "Falta de adaptacao", "Outros"]
PESO_BASE_MOTIVO = np.array([0.6, 1.0, 1.6, 0.7, 0.5, 0.6, 0.6, 0.7, 0.6])

# Metas de calibração do contrato
METAS = {
    "n_colaboradores": (6000, 7500),
    "headcount_ativo": (2000, 3200),
    "ativos_janela_30_180": (600, 1400),
    "taxa_y90": (0.12, 0.20),
    "taxa_y180": (0.22, 0.35),
    "auc_oraculo_90d": (0.78, 0.90),
}


def sortear(rng: np.random.Generator, opcoes, pesos, n: int) -> np.ndarray:
    """Sorteia ``n`` valores de ``opcoes`` com probabilidades ``pesos`` (normalizadas)."""
    p = np.asarray(pesos, dtype=float)
    return rng.choice(np.asarray(opcoes), size=n, p=p / p.sum())


def alocar_exato(rng: np.random.Generator, opcoes, pesos, n: int) -> np.ndarray:
    """Aloca ``n`` itens nas opções em proporção quase exata aos pesos (maiores restos) e embaralha."""
    p = np.asarray(pesos, dtype=float) / np.sum(pesos)
    brutos = p * n
    contagens = np.floor(brutos).astype(int)
    sobra = n - contagens.sum()
    for i in np.argsort(-(brutos - contagens))[:sobra]:
        contagens[i] += 1
    saida = np.repeat(np.asarray(opcoes, dtype=object), contagens)
    rng.shuffle(saida)
    return saida


def sortear_por_grupo(rng, grupo: np.ndarray, opcoes, pesos_por_grupo: dict, n: int, dtype=object) -> np.ndarray:
    """Sorteio categórico condicionado ao valor de ``grupo`` (um vetor de rótulos)."""
    saida = np.empty(n, dtype=dtype)
    for g, p in pesos_por_grupo.items():
        m = grupo == g
        if m.any():
            saida[m] = sortear(rng, opcoes, p, int(m.sum()))
    return saida


def sigmoide(x):
    return 1.0 / (1.0 + np.exp(-x))


# ---------------------------------------------------------------------------
# 1) Lojas
# ---------------------------------------------------------------------------
def gerar_lojas(rng: np.random.Generator, prm: dict) -> pd.DataFrame:
    """Gera o cadastro de lojas com clima latente e turnover de base."""
    n = prm["n_lojas"]
    regiao = alocar_exato(rng, *REGIOES, n)
    bandeira = alocar_exato(rng, *BANDEIRAS, n)
    uf = np.empty(n, dtype=object)
    cidade = np.empty(n, dtype=object)
    for r, lista in CIDADES.items():
        m = regiao == r
        if m.any():
            idx = sortear(rng, np.arange(len(lista)), [c[2] for c in lista], int(m.sum()))
            uf[m] = [lista[i][0] for i in idx]
            cidade[m] = [lista[i][1] for i in idx]
    porte = sortear(rng, *PORTES, n)
    headcount = np.array([int(rng.integers(*HEADCOUNT_POR_PORTE[p])) for p in porte])
    tipo_loja = sortear(rng, *TIPOS_LOJA, n)
    # clima latente da loja (não observado): alimenta o turnover e o risco individual
    clima = rng.normal(0.0, 1.0, n)
    ajuste = np.where(tipo_loja == "Outlet", 0.05, 0.0) + np.where(porte == "Grande", 0.03, 0.0)
    turnover_base = np.clip(0.40 + 0.13 * clima + ajuste + rng.normal(0, 0.05, n), 0.12, 0.85)
    return pd.DataFrame({
        "loja_id": [f"L{i + 1:03d}" for i in range(n)],
        "bandeira": bandeira, "tipo_loja": tipo_loja, "regiao": regiao, "uf": uf, "cidade": cidade,
        "porte": porte, "headcount_alvo": headcount.astype(int),
        "clima_latente": clima, "turnover_base": turnover_base,
    })


def gerar_trocas_de_gestor(rng: np.random.Generator, lojas: pd.DataFrame) -> dict[str, np.ndarray]:
    """Para cada loja, as datas de início dos gestores (trocas a cada ~30 meses)."""
    trocas = {}
    for loja_id in lojas["loja_id"]:
        inicio = DATA_INICIO - pd.DateOffset(months=int(rng.integers(0, 72)))
        datas = [inicio]
        atual = inicio
        while True:
            atual = atual + pd.DateOffset(months=int(max(3, round(rng.exponential(30.0)))))
            if atual > DATA_REFERENCIA:
                break
            datas.append(atual)
        trocas[loja_id] = np.array(sorted(datas), dtype="datetime64[ns]")
    return trocas


# ---------------------------------------------------------------------------
# 2) Admissões mensais
# ---------------------------------------------------------------------------
def gerar_admissoes(rng: np.random.Generator, lojas: pd.DataFrame, prm: dict) -> pd.DataFrame:
    """Sorteia o número de admissões por loja e mês (Poisson) e as datas de admissão."""
    meses = pd.period_range(DATA_INICIO, DATA_REFERENCIA, freq="M")
    blocos = []
    for loja in lojas.itertuples(index=False):
        fator_loja = 1.0 + prm["elasticidade_turnover"] * (loja.turnover_base - 0.40)
        for per in meses:
            lam = (loja.headcount_alvo * prm["taxa_mensal_base"] * fator_loja
                   * SAZONALIDADE[per.month] * CRESCIMENTO_ANUAL[per.year])
            n = int(rng.poisson(lam))
            if n == 0:
                continue
            dias_mes = rng.integers(1, per.days_in_month + 1, size=n)
            datas = pd.to_datetime([f"{per.year}-{per.month:02d}-{d:02d}" for d in dias_mes])
            blocos.append(pd.DataFrame({"loja_id": loja.loja_id, "data_admissao": datas}))
    adm = pd.concat(blocos, ignore_index=True)
    adm = adm[adm["data_admissao"] <= DATA_REFERENCIA]
    adm = adm.sort_values(["data_admissao", "loja_id"], kind="stable").reset_index(drop=True)
    adm["colaborador_id"] = [f"C{i + 1:06d}" for i in range(len(adm))]
    return adm


# ---------------------------------------------------------------------------
# 3) Atributos dos colaboradores
# ---------------------------------------------------------------------------
def gerar_atributos(rng: np.random.Generator, adm: pd.DataFrame, lojas: pd.DataFrame, trocas: dict, prm: dict) -> pd.DataFrame:
    """Gera os atributos de admissão e os sinais dos primeiros 30 dias."""
    df = adm.merge(lojas, on="loja_id", how="left")
    n = len(df)
    mes = df["data_admissao"].dt.month.to_numpy()
    pico = np.isin(mes, list(MESES_PICO))
    df["mes_admissao"] = mes
    df["admitido_periodo_pico"] = pico

    # contrato (temporários predominam nos picos) e cargo condicionado ao contrato
    contrato = np.empty(n, dtype=object)
    contrato[~pico] = sortear(rng, CONTRATOS, P_CONTRATO_FORA_PICO, int((~pico).sum()))
    contrato[pico] = sortear(rng, CONTRATOS, P_CONTRATO_PICO, int(pico.sum()))
    cargo = sortear_por_grupo(rng, contrato, CARGOS, P_CARGO_POR_CONTRATO, n)
    lideranca = np.isin(cargo, ["Lider de Loja", "Gerente de Loja"])

    # faixa etária (aprendizes são sempre 18-24; liderança mais velha)
    idade = np.empty(n, dtype=object)
    idade[lideranca] = sortear(rng, FAIXAS_ETARIAS, P_IDADE_LIDERANCA, int(lideranca.sum()))
    idade[~lideranca] = sortear(rng, FAIXAS_ETARIAS, P_IDADE_OPERACIONAL, int((~lideranca).sum()))
    idade[contrato == "Jovem Aprendiz"] = "18-24"

    # faixa salarial coerente com o cargo e o contrato
    salario = sortear_por_grupo(rng, cargo, FAIXAS_SALARIAIS, P_SALARIO_POR_CARGO, n)
    salario[contrato == "Jovem Aprendiz"] = "Ate 1.5 SM"
    m_int = contrato == "Intermitente"
    salario[m_int] = sortear(rng, FAIXAS_SALARIAIS, [0.70, 0.30, 0.0, 0.0, 0.0], int(m_int.sum()))

    # escolaridade (liderança mais escolarizada; jovens com superior incompleto)
    grupo_esc = np.where(lideranca, cargo, "operacional")
    escolaridade = sortear_por_grupo(rng, grupo_esc, ESCOLARIDADES, P_ESCOLARIDADE, n)
    m_jovem = (idade == "18-24") & ~lideranca & (rng.random(n) < 0.25)
    escolaridade[m_jovem] = "Superior Incompleto"

    turno = sortear_por_grupo(rng, df["tipo_loja"].to_numpy(), TURNOS, P_TURNO_POR_TIPO_LOJA, n)
    carga = sortear_por_grupo(rng, contrato, CARGAS, P_CARGA_POR_CONTRATO, n, dtype=int)
    canal = sortear_por_grupo(rng, contrato, CANAIS, P_CANAL_POR_CONTRATO, n)

    # experiência prévia em varejo
    p_exp = np.full(n, 0.42)
    p_exp[cargo == "Lider de Loja"] = 0.90
    p_exp[cargo == "Gerente de Loja"] = 0.95
    p_exp[contrato == "Jovem Aprendiz"] = 0.08
    p_exp[(idade == "18-24") & ~lideranca & (contrato != "Jovem Aprendiz")] *= 0.6
    experiencia = rng.random(n) < p_exp
    experiencia[canal == "Recontratacao"] = True

    # distância casa-trabalho: lognormal com mediana ~9 km, máximo 60 km
    distancia = np.round(np.clip(rng.lognormal(np.log(9.0), 0.65, n), 0.5, 60.0), 1)

    # tempo do gestor direto no cargo na data da admissão (trocas de gestor por loja)
    gestor_meses = np.zeros(n, dtype=int)
    adm_np = df["data_admissao"].to_numpy()
    for loja_id, datas in trocas.items():
        m = (df["loja_id"] == loja_id).to_numpy()
        if not m.any():
            continue
        pos = np.searchsorted(datas, adm_np[m], side="right") - 1
        inicio = datas[np.clip(pos, 0, len(datas) - 1)]
        meses_tempo = (adm_np[m] - inicio) / np.timedelta64(1, "D") / 30.44
        gestor_meses[m] = np.clip(np.floor(meses_tempo), 0, 120).astype(int)

    # proxy sintético do turnover da loja: base latente fixa da loja + ruído individual.
    # Não é recalculado a partir das saídas da base (limitação declarada no README e em docs/modelo-preditivo.md).
    turnover_loja = np.round(np.clip(df["turnover_base"].to_numpy() + rng.normal(0, 0.035, n), 0.05, 0.90), 4)

    # fragilidade individual (não observada) — parte dela "vaza" para os sinais de 30 dias
    frag = rng.normal(0.0, prm["sigma_fragilidade"], n)
    clima = df["clima_latente"].to_numpy()
    gestor_novo = gestor_meses < 6

    # integração concluída até o dia 30 (~78%)
    logit_onb = (1.55 - 0.45 * pico - 0.50 * gestor_novo + 0.35 * clima - 0.30 * (contrato == "Temporario Sazonal")
                 + 0.20 * experiencia - 0.15 * (distancia > 20) - 0.45 * frag + 0.25 * lideranca)
    onboarding = rng.random(n) < sigmoide(logit_onb)

    # horas de treinamento nos 30 dias (0-40)
    horas_trein = np.where(onboarding, rng.gamma(4.0, 4.5, n), rng.gamma(2.0, 4.0, n))
    horas_trein = np.round(np.clip(horas_trein, 0, 40), 1)

    # avaliação de experiência (1,0-5,0; ~10% não avaliados)
    aval = (3.7 + 0.35 * onboarding - 0.20 * gestor_novo + 0.15 * clima + 0.15 * experiencia - 0.35 * frag
            + rng.normal(0, 0.55, n))
    aval = np.round(np.clip(aval, 1.0, 5.0), 1)
    p_sem_aval = sigmoide(-2.6 + 0.6 * pico + 0.5 * gestor_novo)
    aval_ausente = rng.random(n) < p_sem_aval
    aval = np.where(aval_ausente, np.nan, aval)

    # faltas e atrasos (Poisson) e horas extras (maiores nos picos)
    faltas = rng.poisson(0.55 * np.exp(0.25 * (idade == "18-24") + 0.35 * (distancia > 20) + 0.20 * (turno == "Noite") + 0.30 * frag))
    atrasos = rng.poisson(1.0 * np.exp(0.40 * (distancia > 15) + 0.30 * (turno == "Noite") + 0.15 * frag))
    faltas = np.clip(faltas, 0, 10)
    atrasos = np.clip(atrasos, 0, 12)
    media_he = np.where(pico, 5.0, 2.2) + np.where(df["tipo_loja"].to_numpy() == "Shopping", 0.8, 0.0)
    horas_extras = np.round(np.clip(rng.gamma(2.0, media_he / 2.0), 0, 15), 1)

    df["cargo"] = cargo
    df["tipo_contrato"] = contrato
    df["faixa_etaria"] = idade
    df["faixa_salarial"] = salario
    df["escolaridade"] = escolaridade
    df["turno"] = turno
    df["carga_horaria_semanal"] = carga
    df["canal_contratacao"] = canal
    df["experiencia_previa_varejo"] = experiencia
    df["distancia_casa_trabalho_km"] = distancia
    df["onboarding_concluido"] = onboarding
    df["horas_treinamento_30d"] = horas_trein
    df["avaliacao_experiencia_30d"] = aval
    df["faltas_30d"] = faltas.astype(int)
    df["atrasos_30d"] = atrasos.astype(int)
    df["horas_extras_media_semana"] = horas_extras
    df["gestor_tempo_cargo_meses"] = gestor_meses
    df["turnover_loja_12m"] = turnover_loja
    df["fragilidade"] = frag
    return df


# ---------------------------------------------------------------------------
# 4) Mecanismo de desligamento
# ---------------------------------------------------------------------------
def preditor_linear_voluntario(df: pd.DataFrame, escala: float = 1.0) -> tuple[np.ndarray, pd.DataFrame]:
    """Preditor linear (log-hazard) da saída voluntária e contribuições por tema.

    Devolve o preditor observável (sem fragilidade), já multiplicado por
    ``escala``, e um DataFrame com as contribuições agrupadas por tema, usadas
    para sortear o motivo declarado da saída.
    """
    c = COEF_VOL
    noite = (df["turno"] == "Noite").to_numpy()
    dist = np.clip(df["distancia_casa_trabalho_km"].to_numpy() - 9.0, -9.0, 36.0)
    dist_pos = np.clip(dist, 0, None)
    aval = df["avaliacao_experiencia_30d"].to_numpy()
    aval_aus = np.isnan(aval)
    aval_c = np.where(aval_aus, 0.0, aval - 3.5)
    faltas = df["faltas_30d"].to_numpy()
    he = np.clip(df["horas_extras_media_semana"].to_numpy() - 3.0, 0, None)
    sem_onb = ~df["onboarding_concluido"].to_numpy().astype(bool)
    sem_exp = ~df["experiencia_previa_varejo"].to_numpy().astype(bool)

    def cat(col):
        return df[col].map(c[col]).to_numpy(dtype=float)

    temas = pd.DataFrame(index=df.index)
    temas["Distancia/deslocamento"] = c["distancia_por_km"] * dist_pos + c["distancia_x_noite_por_km"] * dist_pos * noite
    temas["Salario/beneficios"] = np.clip(cat("faixa_salarial"), 0, None) + 0.5 * np.clip(cat("cargo"), 0, None)
    temas["Horario/escala"] = (np.clip(cat("turno"), 0, None) + c["horas_extras_por_hora"] * he
                               + c["carga_20h"] * (df["carga_horaria_semanal"].to_numpy() == 20)
                               + c["admitido_pico"] * df["admitido_periodo_pico"].to_numpy())
    temas["Relacao com lideranca"] = (c["gestor_menos_6_meses"] * (df["gestor_tempo_cargo_meses"].to_numpy() < 6)
                                      + np.clip(c["turnover_loja_por_unidade"] * (df["turnover_loja_12m"].to_numpy() - 0.40), 0, None)
                                      + np.clip(c["clima_loja_latente"] * df["clima_latente"].to_numpy(), 0, None))
    temas["Falta de adaptacao"] = (c["onboarding_nao_concluido"] * sem_onb
                                   + np.clip(c["avaliacao_por_ponto"] * aval_c, 0, None) + c["avaliacao_ausente"] * aval_aus
                                   + 0.5 * (-c["experiencia_previa"]) * sem_exp)
    temas["Estudos"] = 0.25 * (df["faixa_etaria"].to_numpy() == "18-24") * (df["escolaridade"].to_numpy() == "Superior Incompleto")
    temas["Saude/familia"] = c["faltas_por_falta"] * faltas + c["faltas_3_ou_mais_extra"] * (faltas >= 3)
    temas["Nova oportunidade"] = (0.3 * df["experiencia_previa_varejo"].to_numpy()
                                  + np.clip(cat("escolaridade"), 0, None) + 0.5 * np.clip(cat("tipo_contrato"), 0, None))
    temas["Outros"] = 0.0

    eta = (cat("tipo_contrato") + cat("cargo") + cat("faixa_salarial") + cat("turno") + cat("canal_contratacao")
           + cat("faixa_etaria") + cat("escolaridade") + cat("tipo_loja") + cat("regiao") + cat("porte")
           + c["distancia_por_km"] * dist + c["distancia_x_noite_por_km"] * dist_pos * noite
           + c["onboarding_nao_concluido"] * sem_onb
           + c["avaliacao_por_ponto"] * aval_c + c["avaliacao_ausente"] * aval_aus
           + c["faltas_por_falta"] * faltas + c["faltas_3_ou_mais_extra"] * (faltas >= 3)
           + c["atrasos_por_atraso"] * df["atrasos_30d"].to_numpy()
           + c["horas_extras_por_hora"] * he
           + c["gestor_menos_6_meses"] * (df["gestor_tempo_cargo_meses"].to_numpy() < 6)
           + c["turnover_loja_por_unidade"] * (df["turnover_loja_12m"].to_numpy() - 0.40)
           + c["clima_loja_latente"] * df["clima_latente"].to_numpy()
           + c["admitido_pico"] * df["admitido_periodo_pico"].to_numpy()
           + c["experiencia_previa"] * df["experiencia_previa_varejo"].to_numpy()
           + c["carga_20h"] * (df["carga_horaria_semanal"].to_numpy() == 20))
    return escala * eta.astype(float), temas * escala


def simular_tempo_de_saida(rng, hazard_base_diario: np.ndarray, multiplicador: np.ndarray) -> np.ndarray:
    """Tempo (em dias, >= 1) até o evento num modelo de hazards proporcionais.

    ``hazard_base_diario[t-1]`` é o hazard do dia ``t``; o evento ocorre no primeiro
    dia em que o hazard acumulado x multiplicador supera um sorteio Exp(1).
    Devolve ``len(hazard)+1`` quando o evento não ocorre dentro do horizonte.
    """
    acumulado = np.cumsum(hazard_base_diario)
    e = rng.exponential(1.0, len(multiplicador))
    return np.searchsorted(acumulado, e / multiplicador, side="left") + 1


def hazard_base_voluntario(t: np.ndarray, prm: dict) -> np.ndarray:
    """Hazard diário de base: sobe nas primeiras semanas, máximo entre 30 e 90 dias, decresce depois."""
    return prm["hazard_vol_c"] + prm["hazard_vol_a"] * np.exp(-t / prm["hazard_vol_tau"]) * (1.0 - np.exp(-t / prm["hazard_vol_tau0"]))


def simular_desligamentos(rng: np.random.Generator, df: pd.DataFrame, prm: dict) -> pd.DataFrame:
    """Aplica os riscos competitivos (voluntário, involuntário, fim de contrato, censura)."""
    n = len(df)
    horizonte = int((DATA_REFERENCIA - DATA_INICIO).days) + 2
    t = np.arange(1, horizonte + 1, dtype=float)

    # saída voluntária
    eta_obs, temas = preditor_linear_voluntario(df, prm["escala_efeitos"])
    eta = eta_obs + df["fragilidade"].to_numpy()
    lim = prm["limite_log_hazard"]
    mult_vol = np.exp(np.clip(eta, -lim, lim))
    mult_vol = mult_vol / mult_vol.mean()      # hazard de base = média da população
    t_vol = simular_tempo_de_saida(rng, hazard_base_voluntario(t, prm), mult_vol)

    # saída involuntária (desempenho / redução de quadro)
    aval = df["avaliacao_experiencia_30d"].to_numpy()
    aval_c = np.where(np.isnan(aval), 0.0, aval - 3.5)
    eta_inv = (0.30 * df["faltas_30d"].to_numpy() + 0.20 * (df["atrasos_30d"].to_numpy() >= 3) - 0.40 * aval_c
               + 0.30 * (~df["onboarding_concluido"].to_numpy().astype(bool))
               - 0.50 * df["cargo"].isin(["Lider de Loja", "Gerente de Loja"]).to_numpy()
               + rng.normal(0, 0.3, n))
    mult_inv = np.exp(eta_inv)
    mult_inv = mult_inv / mult_inv.mean()
    h_inv = np.full(horizonte, prm["hazard_inv_c"])
    h_inv[43:45] += prm["hazard_inv_pico_45"]
    h_inv[88:90] += prm["hazard_inv_pico_90"]
    t_inv = simular_tempo_de_saida(rng, h_inv, mult_inv)

    # fim de contrato (temporários ~90-120 dias, salvo efetivados; aprendizes 12-24 meses)
    t_fim = np.full(n, horizonte + 1)
    m_temp = (df["tipo_contrato"] == "Temporario Sazonal").to_numpy()
    m_apr = (df["tipo_contrato"] == "Jovem Aprendiz").to_numpy()
    efetivado = rng.random(n) < prm["p_efetivacao_temporario"]
    m_temp_fim = m_temp & ~efetivado
    t_fim[m_temp_fim] = rng.integers(88, 123, size=int(m_temp_fim.sum()))
    t_fim[m_apr] = rng.integers(365, 731, size=int(m_apr.sum()))

    dias_ate_ref = (DATA_REFERENCIA - df["data_admissao"]).dt.days.to_numpy()
    t_evento = np.minimum.reduce([t_vol, t_inv, t_fim])
    saiu = t_evento <= dias_ate_ref
    tipo = np.where(saiu & (t_evento == t_vol), "Voluntario", np.where(saiu, "Involuntario", None)).astype(object)

    # motivo involuntário
    motivo = np.full(n, None, dtype=object)
    m_inv = saiu & (tipo == "Involuntario")
    fim_contrato = m_inv & (t_evento == t_fim) & (t_fim < t_inv)
    desempenho_exp = m_inv & ~fim_contrato & np.isin(t_evento, [44, 45, 89, 90])
    motivo[fim_contrato] = np.where(df["tipo_contrato"].to_numpy() == "Jovem Aprendiz", "Fim de contrato de aprendizagem", "Fim de contrato temporario")[fim_contrato]
    motivo[desempenho_exp] = "Desempenho"
    resto = m_inv & ~fim_contrato & ~desempenho_exp
    mes_saida = (df["data_admissao"] + pd.to_timedelta(t_evento, unit="D")).dt.month.to_numpy()
    p_reducao = np.where(np.isin(mes_saida, [1, 2]), 0.65, 0.35)
    motivo[resto] = np.where(rng.random(n) < p_reducao, "Reducao de quadro", "Desempenho")[resto]

    # motivo voluntário condicionado ao tema dominante da pessoa
    m_vol = saiu & (tipo == "Voluntario")
    pesos = PESO_BASE_MOTIVO[None, :] + 2.5 * np.clip(temas[MOTIVOS_VOL].to_numpy(), 0, None)
    dominante = np.argmax(temas[MOTIVOS_VOL].to_numpy(), axis=1)
    pesos[np.arange(n), dominante] *= 1.8
    pesos = pesos / pesos.sum(axis=1, keepdims=True)
    acumulado = np.cumsum(pesos, axis=1)
    u = rng.random(n)
    escolha = (u[:, None] < acumulado).argmax(axis=1)
    motivo[m_vol] = np.array(MOTIVOS_VOL, dtype=object)[escolha][m_vol]

    dias_de_casa = np.where(saiu, t_evento, dias_ate_ref).astype(int)
    df = df.copy()
    df["dias_de_casa"] = dias_de_casa
    df["status"] = np.where(saiu, "Desligado", "Ativo")
    df["tipo_desligamento"] = tipo
    df["motivo_desligamento"] = motivo
    df["data_desligamento"] = pd.Series(df["data_admissao"] + pd.to_timedelta(dias_de_casa, unit="D")).where(saiu, pd.NaT)
    df["eta_observavel"] = eta_obs
    return df


def aplicar_checkpoint(df: pd.DataFrame) -> pd.DataFrame:
    """Sinais dos primeiros 30 dias só existem para quem atingiu o dia 30 de casa."""
    df = df.copy()
    sem_checkpoint = (df["dias_de_casa"] < 30).to_numpy()
    df["onboarding_concluido"] = df["onboarding_concluido"].astype(object).where(~sem_checkpoint, None)
    for col in ["horas_treinamento_30d", "avaliacao_experiencia_30d", "horas_extras_media_semana"]:
        df[col] = df[col].astype(float).where(~sem_checkpoint, np.nan)
    for col in ["faltas_30d", "atrasos_30d"]:
        df[col] = df[col].astype("Int64").where(~sem_checkpoint, pd.NA)
    return df


def turnover_realizado_por_loja(df: pd.DataFrame, lojas: pd.DataFrame) -> pd.Series:
    """Turnover voluntário realizado por loja nos 12 meses anteriores à referência.

    saídas voluntárias no período / headcount médio diário da loja no período.
    """
    inicio = DATA_REFERENCIA - dias(365)
    grade = pd.date_range(inicio + dias(1), DATA_REFERENCIA, freq="D").to_numpy()
    resultado = {}
    for loja_id, g in df.groupby("loja_id"):
        adm = g["data_admissao"].to_numpy()
        fim = g["data_desligamento"].fillna(pd.Timestamp("2100-01-01")).to_numpy()
        ativos = ((adm[None, :] <= grade[:, None]) & (fim[None, :] > grade[:, None])).sum(axis=1)
        headcount_medio = max(float(ativos.mean()), 1.0)
        saidas = int(((g["tipo_desligamento"] == "Voluntario") & (g["data_desligamento"] > inicio)).sum())
        resultado[loja_id] = round(saidas / headcount_medio, 4)
    return lojas["loja_id"].map(resultado)


def gerar_base(prm: dict | None = None, semente: int = SEMENTE) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Executa toda a geração e devolve (lojas, colaboradores) com colunas auxiliares."""
    prm = {**PARAMETROS, **(prm or {})}
    rng = np.random.default_rng(semente)
    lojas = gerar_lojas(rng, prm)
    trocas = gerar_trocas_de_gestor(rng, lojas)
    adm = gerar_admissoes(rng, lojas, prm)
    df = gerar_atributos(rng, adm, lojas, trocas, prm)
    df = simular_desligamentos(rng, df, prm)
    df = aplicar_checkpoint(df)
    lojas["turnover_vol_12m"] = turnover_realizado_por_loja(df, lojas)
    return lojas, df


# ---------------------------------------------------------------------------
# 5) Resumo e verificação das metas
# ---------------------------------------------------------------------------
def indicadores(df: pd.DataFrame) -> dict:
    """Indicadores de calibração usados nas metas e no ajuste de parâmetros."""
    from sklearn.metrics import roc_auc_score

    ativos = df[df["status"] == "Ativo"]
    janela = ativos[(ativos["dias_de_casa"] >= 30) & (ativos["dias_de_casa"] <= 180)]
    pos30 = df[df["dias_de_casa"] >= 30]
    c90 = pos30[pos30["data_admissao"] <= DATA_REFERENCIA - dias(90)]
    c180 = pos30[pos30["data_admissao"] <= DATA_REFERENCIA - dias(180)]
    y90 = ((c90["tipo_desligamento"] == "Voluntario") & (c90["dias_de_casa"] <= 90)).astype(int)
    y180 = ((c180["tipo_desligamento"] == "Voluntario") & (c180["dias_de_casa"] <= 180)).astype(int)
    return {
        "n_colaboradores": len(df), "headcount_ativo": len(ativos), "ativos_janela_30_180": len(janela),
        "ativos_sem_checkpoint": int((ativos["dias_de_casa"] < 30).sum()),
        "n_c90": len(c90), "n_c180": len(c180), "taxa_y90": float(y90.mean()), "taxa_y180": float(y180.mean()),
        "taxa_inv90": float(((c90["tipo_desligamento"] == "Involuntario") & (c90["dias_de_casa"] <= 90)).mean()),
        "taxa_inv180": float(((c180["tipo_desligamento"] == "Involuntario") & (c180["dias_de_casa"] <= 180)).mean()),
        "saidas_antes_30": float((df["dias_de_casa"] < 30).mean()),
        "auc_oraculo_90d": float(roc_auc_score(y90, c90["eta_observavel"])),
        "auc_oraculo_180d": float(roc_auc_score(y180, c180["eta_observavel"])),
        "sd_eta_observavel": float(c90["eta_observavel"].std()),
        "n_voluntario": int((df["tipo_desligamento"] == "Voluntario").sum()),
        "n_involuntario": int((df["tipo_desligamento"] == "Involuntario").sum()),
        "n_fim_contrato": int((df["motivo_desligamento"] == "Fim de contrato temporario").sum()),
        "c90": c90, "y90": y90,
    }


def resumo_e_verificacao(df: pd.DataFrame, lojas: pd.DataFrame) -> bool:
    """Imprime o resumo de calibração e devolve True se todas as metas foram atingidas."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score

    ind = indicadores(df)
    print("\n=== Resumo da base sintética ===")
    print(f"Lojas: {len(lojas)} | Colaboradores: {ind['n_colaboradores']}")
    print(f"Admissões por ano: {df['data_admissao'].dt.year.value_counts().sort_index().to_dict()}")
    print(f"Status: {df['status'].value_counts().to_dict()}")
    print(f"Tipo de desligamento: {df['tipo_desligamento'].value_counts(dropna=False).to_dict()}")
    print(f"Headcount ativo: {ind['headcount_ativo']} | ativos em janela 30-180 dias: {ind['ativos_janela_30_180']} "
          f"| ativos < 30 dias: {ind['ativos_sem_checkpoint']}")
    print(f"Saída voluntária até 90d (passou do dia 30): {ind['taxa_y90']:.3f} (n={ind['n_c90']}) | involuntária: {ind['taxa_inv90']:.3f}")
    print(f"Saída voluntária até 180d (passou do dia 30): {ind['taxa_y180']:.3f} (n={ind['n_c180']}) | involuntária: {ind['taxa_inv180']:.3f}")
    print(f"Saídas antes do dia 30: {ind['saidas_antes_30']:.3f} do total")
    print(f"AUC do preditor observável (oráculo): 90d={ind['auc_oraculo_90d']:.3f} | 180d={ind['auc_oraculo_180d']:.3f} "
          f"| desvio do preditor observável: {ind['sd_eta_observavel']:.3f}")

    # verificação rápida com regressão logística nas variáveis observadas (em amostra)
    c90, y90 = ind["c90"], ind["y90"]
    cols = ["distancia_casa_trabalho_km", "horas_treinamento_30d", "faltas_30d", "atrasos_30d",
            "horas_extras_media_semana", "gestor_tempo_cargo_meses", "turnover_loja_12m", "carga_horaria_semanal"]
    X = pd.get_dummies(c90[["cargo", "tipo_contrato", "faixa_salarial", "turno", "canal_contratacao", "escolaridade",
                            "regiao", "tipo_loja", "porte", "bandeira"]].astype(str), dtype=float)
    X[cols] = c90[cols].astype(float).to_numpy()
    X["onboarding"] = c90["onboarding_concluido"].astype(float).to_numpy()
    X["experiencia"] = c90["experiencia_previa_varejo"].astype(float).to_numpy()
    X["pico"] = c90["admitido_periodo_pico"].astype(float).to_numpy()
    X["aval"] = c90["avaliacao_experiencia_30d"].fillna(c90["avaliacao_experiencia_30d"].mean()).to_numpy()
    X["aval_ausente"] = c90["avaliacao_experiencia_30d"].isna().astype(float).to_numpy()
    X = (X - X.mean()) / X.std().replace(0, 1)
    rl = LogisticRegression(max_iter=2000).fit(X, y90)
    print(f"AUC (regressão logística rápida, em amostra, 90d): {roc_auc_score(y90, rl.predict_proba(X)[:, 1]):.3f}")

    print("\nDistribuições principais:")
    for col in ["tipo_contrato", "cargo", "faixa_etaria", "faixa_salarial", "canal_contratacao", "turno", "regiao"]:
        print(f"  {col}: {(df[col].value_counts(normalize=True).round(3)).to_dict()}")
    pos30 = df[df["dias_de_casa"] >= 30]
    print(f"  integração concluída (>=30 dias): {pos30['onboarding_concluido'].astype(float).mean():.3f}")
    print(f"  avaliação ausente (>=30 dias): {pos30['avaliacao_experiencia_30d'].isna().mean():.3f}")
    print(f"  distância mediana: {df['distancia_casa_trabalho_km'].median():.1f} km | máx {df['distancia_casa_trabalho_km'].max():.1f} km")
    vol = df[df["tipo_desligamento"] == "Voluntario"]
    print(f"  motivos voluntários: {vol['motivo_desligamento'].value_counts(normalize=True).round(3).to_dict()}")
    inv = df[df["tipo_desligamento"] == "Involuntario"]
    print(f"  motivos involuntários: {inv['motivo_desligamento'].value_counts(normalize=True).round(3).to_dict()}")
    print(f"  turnover realizado por loja (12m): média {lojas['turnover_vol_12m'].mean():.3f}, "
          f"mín {lojas['turnover_vol_12m'].min():.3f}, máx {lojas['turnover_vol_12m'].max():.3f}")
    print(f"  bandeiras: {lojas['bandeira'].value_counts().to_dict()} | regiões: {lojas['regiao'].value_counts().to_dict()}")

    print("\n=== Verificação das metas ===")
    ok = True
    for chave, (lo, hi) in METAS.items():
        v = ind[chave]
        dentro = lo <= v <= hi
        ok &= dentro
        print(f"  {'OK ' if dentro else 'FORA'} {chave}: {v:.3f} (meta {lo} a {hi})")
    return ok


# ---------------------------------------------------------------------------
# Execução
# ---------------------------------------------------------------------------
def main() -> int:
    configurar_saida_utf8()
    lojas, df = gerar_base()
    ok = resumo_e_verificacao(df, lojas)

    DIR_RAW.mkdir(parents=True, exist_ok=True)
    escrever_csv_tabela(lojas[COLUNAS_LOJAS], "lojas", DIR_RAW / "lojas.csv")
    escrever_csv_tabela(df[COLUNAS_COLABORADORES], "colaboradores", DIR_RAW / "colaboradores.csv")
    print(f"\nArquivos gravados em {DIR_RAW}: lojas.csv ({len(lojas)} linhas), colaboradores.csv ({len(df)} linhas)")
    if not ok:
        print("ERRO: metas de calibração não atingidas; ajuste os parâmetros do script.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
