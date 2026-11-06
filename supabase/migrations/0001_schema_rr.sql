-- =====================================================================
-- Radar de Retencao - Enterprise Challenge Ri Happy (FIAP 2TSCOR)
-- Migracao 0001: tabelas base do MVP
--
-- Convencao: todos os objetos usam o prefixo rr_ (Radar de Retencao) para
-- poderem coexistir com outros objetos dentro de um projeto Supabase
-- compartilhado. Em um projeto dedicado o prefixo e inofensivo.
--
-- IMPORTANTE: todos os dados carregados nestas tabelas sao SINTETICOS e
-- pseudonimizados (ver docs/etica-lgpd.md). Nenhum dado real da Ri Happy
-- e armazenado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cadastro de lojas
-- ---------------------------------------------------------------------
create table if not exists public.rr_lojas (
  loja_id            text primary key,          -- ex.: L001
  bandeira           text not null,             -- Ri Happy | PBKids | Divertudo | Newtoys
  tipo_loja          text not null,             -- Shopping | Rua | Outlet
  regiao             text not null,             -- Sudeste | Sul | Nordeste | Norte | Centro-Oeste
  uf                 text not null,
  cidade             text not null,
  porte              text not null,             -- Pequena | Media | Grande
  headcount_alvo     integer not null,
  turnover_vol_12m   numeric(6,4)               -- taxa de turnover voluntario da loja nos 12m anteriores a referencia
);
comment on table public.rr_lojas is 'Cadastro sintetico de lojas (bandeira, regiao, porte).';

-- ---------------------------------------------------------------------
-- Colaboradores operacionais de loja (pseudonimizados)
-- ---------------------------------------------------------------------
create table if not exists public.rr_colaboradores (
  colaborador_id               text primary key,      -- pseudonimo (ex.: C000123); sem nome, CPF ou matricula real
  loja_id                      text not null references public.rr_lojas(loja_id),
  cargo                        text not null,         -- Vendedor | Operador de Caixa | Estoquista | Lider de Loja | Gerente de Loja
  tipo_contrato                text not null,         -- CLT Efetivo | Temporario Sazonal | Jovem Aprendiz | Intermitente
  faixa_etaria                 text not null,         -- 18-24 | 25-34 | 35-44 | 45-54 | 55+  (NAO usada como preditor; apenas auditoria de vies)
  faixa_salarial               text not null,         -- Ate 1.5 SM | 1.5 a 2 SM | 2 a 3 SM | 3 a 5 SM | Acima de 5 SM
  escolaridade                 text,                  -- Fundamental | Medio | Superior Incompleto | Superior Completo
  turno                        text,                  -- Manha | Tarde | Noite | Integral
  carga_horaria_semanal        integer,               -- 20 | 30 | 36 | 44
  canal_contratacao            text,                  -- Indicacao | Site/Portal | Agencia | Programa Jovem | Recontratacao
  experiencia_previa_varejo    boolean,
  distancia_casa_trabalho_km   numeric(6,1),
  admitido_periodo_pico        boolean,               -- admissao em campanha (Dia das Criancas / Natal)
  mes_admissao                 integer,               -- 1..12 (sazonalidade)
  data_admissao                date not null,
  data_desligamento            date,
  tipo_desligamento            text,                  -- Voluntario | Involuntario | null (ativo)
  motivo_desligamento          text,                  -- motivo declarado (desligados)
  onboarding_concluido         boolean,               -- trilha de integracao concluida ate o dia 30
  horas_treinamento_30d        numeric(5,1),
  avaliacao_experiencia_30d    numeric(3,1),          -- 1.0 a 5.0 (null = nao avaliado)
  faltas_30d                   integer,
  atrasos_30d                  integer,
  horas_extras_media_semana    numeric(4,1),
  gestor_tempo_cargo_meses     integer,               -- tempo do lider direto no cargo
  turnover_loja_12m            numeric(6,4),          -- proxy sintetico do turnover da loja na admissao (base latente + ruido individual)
  dias_de_casa                 integer,               -- tenure na referencia (ativos) ou no desligamento
  status                       text,                  -- Ativo | Desligado
  constraint rr_colab_tipo_deslig_ck check (tipo_desligamento is null or tipo_desligamento in ('Voluntario','Involuntario')),
  constraint rr_colab_status_ck check (status in ('Ativo','Desligado'))
);
comment on table public.rr_colaboradores is 'Base sintetica e pseudonimizada de colaboradores operacionais de loja.';
create index if not exists rr_colab_loja_idx on public.rr_colaboradores(loja_id);
create index if not exists rr_colab_adm_idx on public.rr_colaboradores(data_admissao);
create index if not exists rr_colab_status_idx on public.rr_colaboradores(status);

-- ---------------------------------------------------------------------
-- Predicoes de risco (checkpoint de 30 dias de casa)
-- ---------------------------------------------------------------------
create table if not exists public.rr_predicoes (
  colaborador_id     text primary key references public.rr_colaboradores(colaborador_id),
  data_referencia    date not null,
  dias_de_casa       integer not null,
  risco_90d          numeric(5,4) not null,     -- probabilidade de desligamento voluntario ate o dia 90
  risco_180d         numeric(5,4) not null,     -- probabilidade de desligamento voluntario ate o dia 180
  nivel_risco        text not null,             -- Baixo | Medio | Alto | Critico (baseado no risco_90d)
  fatores_top        jsonb not null default '[]'::jsonb,  -- [{"fator","rotulo","valor","contribuicao","direcao"}]
  acao_recomendada   text,
  modelo_versao      text,
  constraint rr_pred_nivel_ck check (nivel_risco in ('Baixo','Medio','Alto','Critico'))
);
comment on table public.rr_predicoes is 'Risco individual de desligamento voluntario (90/180 dias) com fatores explicativos.';
create index if not exists rr_pred_nivel_idx on public.rr_predicoes(nivel_risco);

-- ---------------------------------------------------------------------
-- Explicabilidade global, metricas e analises complementares
-- ---------------------------------------------------------------------
create table if not exists public.rr_fatores_globais (
  horizonte    text not null,                   -- 90d | 180d
  fator        text not null,                   -- nome tecnico da variavel
  rotulo       text not null,                   -- rotulo legivel
  importancia  numeric(8,5) not null,           -- media |SHAP| (ou importancia por permutacao)
  direcao      text,                            -- aumenta | reduz | misto
  posicao      integer,
  primary key (horizonte, fator),
  constraint rr_fg_horiz_ck check (horizonte in ('90d','180d'))
);

create table if not exists public.rr_metricas_modelo (
  horizonte    text not null,
  modelo       text not null,                   -- regressao_logistica | random_forest | gradient_boosting | xgboost
  metrica      text not null,                   -- auc_roc | auc_pr | recall_top20 | precisao_top20 | brier | f1 | ...
  valor        numeric(10,5) not null,
  selecionado  boolean not null default false,
  primary key (horizonte, modelo, metrica)
);

create table if not exists public.rr_curva_sobrevivencia (
  segmento_tipo     text not null,              -- geral | tipo_contrato | cargo | regiao | admitido_periodo_pico
  segmento_valor    text not null,
  dia               integer not null,
  prob_permanencia  numeric(6,4) not null,      -- Kaplan-Meier (evento = desligamento voluntario)
  n_risco           integer,
  primary key (segmento_tipo, segmento_valor, dia)
);

create table if not exists public.rr_turnover_mensal (
  mes                          date primary key,     -- primeiro dia do mes
  admissoes                    integer not null,
  desligamentos_voluntarios    integer not null,
  desligamentos_involuntarios  integer not null,
  desligamentos_vol_precoces   integer not null,     -- voluntarios com ate 180 dias de casa
  headcount_medio              numeric(10,1) not null,
  taxa_turnover_vol            numeric(6,4),         -- desligamentos voluntarios / headcount medio
  taxa_turnover_total          numeric(6,4),
  periodo_pico                 boolean not null default false,
  campanha                     text                  -- Dia das Criancas | Natal | null
);

create table if not exists public.rr_avaliacao_vies (
  horizonte               text not null,
  grupo_tipo              text not null,        -- faixa_etaria | regiao | escolaridade
  grupo_valor             text not null,
  n                       integer not null,
  taxa_real               numeric(6,4),
  risco_medio_previsto    numeric(6,4),
  auc                     numeric(6,4),
  taxa_alto_risco         numeric(6,4),
  primary key (horizonte, grupo_tipo, grupo_valor)
);

create table if not exists public.rr_efeito_fator (
  horizonte     text not null,
  fator         text not null,
  rotulo_fator  text,
  categoria     text not null,
  ordem         integer,
  n             integer not null,
  taxa_real     numeric(6,4),
  risco_medio   numeric(6,4),
  primary key (horizonte, fator, categoria)
);

create table if not exists public.rr_parametros_custo (
  chave      text primary key,                  -- recrutamento_selecao | treinamento_integracao | encargos_rescisorios | produtividade_perdida | vacancia_cobertura
  rotulo     text not null,
  valor      numeric(12,2) not null,            -- R$ por desligamento precoce
  descricao  text,
  fonte      text
);

create table if not exists public.rr_recomendacoes (
  id              integer primary key,
  fator           text not null,                -- fator gatilho (ou 'nivel' para regras por nivel)
  rotulo_fator    text,
  nivel_minimo    text,                         -- Baixo | Medio | Alto | Critico
  acao            text not null,
  responsavel     text,
  prazo_dias      integer
);

create table if not exists public.rr_modelos (
  versao        text primary key,
  treinado_em   timestamptz not null default now(),
  descricao     text,
  card          jsonb not null                  -- model card + coeficientes para o simulador
);

-- ---------------------------------------------------------------------
-- Seguranca: RLS ativo em todas as tabelas. Leitura publica (dados
-- sinteticos, dashboard somente leitura). Escrita apenas via service_role
-- (pipeline de publicacao), que ignora RLS por definicao.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'rr_lojas','rr_colaboradores','rr_predicoes','rr_fatores_globais','rr_metricas_modelo',
    'rr_curva_sobrevivencia','rr_turnover_mensal','rr_avaliacao_vies','rr_efeito_fator',
    'rr_parametros_custo','rr_recomendacoes','rr_modelos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_leitura_publica', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_leitura_publica', t);
  end loop;
end $$;
