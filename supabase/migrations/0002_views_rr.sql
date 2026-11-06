-- =====================================================================
-- Radar de Retencao - Migracao 0002: views de consumo do dashboard
-- As views sao a "API" lida pelo dashboard via PostgREST (supabase-js).
-- O pipeline Python gera os mesmos conjuntos em JSON (dashboard/public/demo)
-- para o modo de demonstracao sem banco.
-- =====================================================================

-- Colaboradores ativos em janela de risco (30 a 180 dias) com predicao
create or replace view public.rr_vw_colaboradores_risco with (security_invoker = on) as
select
  c.colaborador_id, c.loja_id, l.bandeira, l.regiao, l.uf, l.cidade, l.tipo_loja,
  c.cargo, c.tipo_contrato, c.faixa_salarial, c.turno, c.canal_contratacao,
  c.data_admissao, p.dias_de_casa, p.risco_90d, p.risco_180d, p.nivel_risco,
  p.fatores_top, p.acao_recomendada,
  c.onboarding_concluido, c.avaliacao_experiencia_30d, c.distancia_casa_trabalho_km,
  c.faltas_30d, c.atrasos_30d, c.horas_treinamento_30d, c.admitido_periodo_pico,
  c.gestor_tempo_cargo_meses, c.turnover_loja_12m
from public.rr_predicoes p
join public.rr_colaboradores c on c.colaborador_id = p.colaborador_id
join public.rr_lojas l on l.loja_id = c.loja_id
where c.status = 'Ativo';

-- Mapa de risco por loja ("onde agir preventivamente")
create or replace view public.rr_vw_risco_loja with (security_invoker = on) as
select
  l.loja_id, l.bandeira, l.tipo_loja, l.regiao, l.uf, l.cidade, l.porte, l.turnover_vol_12m,
  count(c.colaborador_id) filter (where c.status = 'Ativo')                       as headcount_ativo,
  count(p.colaborador_id)                                                         as ativos_em_janela,
  round(avg(p.risco_90d)::numeric, 4)                                             as risco_medio_90d,
  round(avg(p.risco_180d)::numeric, 4)                                            as risco_medio_180d,
  count(p.colaborador_id) filter (where p.nivel_risco in ('Alto','Critico'))      as n_alto_risco,
  case when count(p.colaborador_id) > 0
       then round((count(p.colaborador_id) filter (where p.nivel_risco in ('Alto','Critico')))::numeric
                  / count(p.colaborador_id), 4) end                               as pct_alto_risco
from public.rr_lojas l
left join public.rr_colaboradores c on c.loja_id = l.loja_id
left join public.rr_predicoes p on p.colaborador_id = c.colaborador_id and c.status = 'Ativo'
group by l.loja_id, l.bandeira, l.tipo_loja, l.regiao, l.uf, l.cidade, l.porte, l.turnover_vol_12m;

-- Risco por segmento (cargo, regiao, contrato, bandeira, salario, turno)
create or replace view public.rr_vw_risco_segmento with (security_invoker = on) as
with base as (
  select 'cargo'::text as dimensao, cargo as categoria, risco_90d, risco_180d, nivel_risco from public.rr_vw_colaboradores_risco
  union all select 'regiao', regiao, risco_90d, risco_180d, nivel_risco from public.rr_vw_colaboradores_risco
  union all select 'tipo_contrato', tipo_contrato, risco_90d, risco_180d, nivel_risco from public.rr_vw_colaboradores_risco
  union all select 'bandeira', bandeira, risco_90d, risco_180d, nivel_risco from public.rr_vw_colaboradores_risco
  union all select 'faixa_salarial', faixa_salarial, risco_90d, risco_180d, nivel_risco from public.rr_vw_colaboradores_risco
  union all select 'turno', turno, risco_90d, risco_180d, nivel_risco from public.rr_vw_colaboradores_risco
  union all select 'canal_contratacao', canal_contratacao, risco_90d, risco_180d, nivel_risco from public.rr_vw_colaboradores_risco
)
select
  dimensao, categoria,
  count(*)                                                                as n,
  round(avg(risco_90d)::numeric, 4)                                       as risco_medio_90d,
  round(avg(risco_180d)::numeric, 4)                                      as risco_medio_180d,
  count(*) filter (where nivel_risco in ('Alto','Critico'))               as n_alto_risco,
  round((count(*) filter (where nivel_risco in ('Alto','Critico')))::numeric / count(*), 4) as pct_alto_risco
from base
where categoria is not null
group by dimensao, categoria;

-- Indicadores executivos (uma linha)
create or replace view public.rr_vw_kpis with (security_invoker = on) as
with ref as (
  select coalesce(max(data_referencia), current_date) as data_referencia from public.rr_predicoes
),
custo as (
  select coalesce(sum(valor), 0) as custo_por_desligamento
  from public.rr_parametros_custo
  where chave in ('recrutamento_selecao','treinamento_integracao','encargos_rescisorios','produtividade_perdida','vacancia_cobertura')
),
ativos as (
  select count(*) as headcount_ativo,
         count(*) filter (where dias_de_casa < 30) as novos_sem_checkpoint,
         count(*) filter (where dias_de_casa between 30 and 180) as ativos_ate_180d
  from public.rr_colaboradores where status = 'Ativo'
),
janela as (
  select count(*) as ativos_em_janela,
         count(*) filter (where nivel_risco in ('Alto','Critico')) as n_alto_risco,
         count(*) filter (where nivel_risco = 'Critico') as n_critico,
         avg(risco_90d) as risco_medio_90d,
         avg(risco_180d) as risco_medio_180d
  from public.rr_predicoes
),
hist as (
  select
    count(*) filter (where c.data_admissao <= r.data_referencia - 90)  as coorte_90,
    count(*) filter (where c.data_admissao <= r.data_referencia - 90
                       and c.tipo_desligamento = 'Voluntario' and c.dias_de_casa <= 90)  as saidas_vol_90,
    count(*) filter (where c.data_admissao <= r.data_referencia - 180) as coorte_180,
    count(*) filter (where c.data_admissao <= r.data_referencia - 180
                       and c.tipo_desligamento = 'Voluntario' and c.dias_de_casa <= 180) as saidas_vol_180,
    count(*) filter (where c.tipo_desligamento = 'Voluntario'
                       and c.data_desligamento > r.data_referencia - 365) as deslig_vol_12m,
    count(*) filter (where c.tipo_desligamento = 'Voluntario'
                       and c.data_desligamento > r.data_referencia - 365 and c.dias_de_casa <= 180) as deslig_vol_precoces_12m,
    count(*) filter (where c.tipo_desligamento = 'Involuntario'
                       and c.data_desligamento > r.data_referencia - 365) as deslig_invol_12m
  from public.rr_colaboradores c, ref r
)
select
  r.data_referencia,
  a.headcount_ativo, a.novos_sem_checkpoint, a.ativos_ate_180d,
  j.ativos_em_janela, j.n_alto_risco, j.n_critico,
  case when j.ativos_em_janela > 0 then round(j.n_alto_risco::numeric / j.ativos_em_janela, 4) end as pct_alto_risco,
  round(j.risco_medio_90d::numeric, 4)  as risco_medio_90d,
  round(j.risco_medio_180d::numeric, 4) as risco_medio_180d,
  case when h.coorte_90  > 0 then round(h.saidas_vol_90::numeric  / h.coorte_90, 4)  end as taxa_saida_vol_90d,
  case when h.coorte_180 > 0 then round(h.saidas_vol_180::numeric / h.coorte_180, 4) end as taxa_saida_vol_180d,
  h.deslig_vol_12m, h.deslig_vol_precoces_12m, h.deslig_invol_12m,
  c.custo_por_desligamento,
  round(h.deslig_vol_precoces_12m * c.custo_por_desligamento, 2) as custo_estimado_12m
from ref r, ativos a, janela j, hist h, custo c;

-- Motivos declarados de desligamento voluntario (ultimos 12 meses, ate 180 dias de casa)
create or replace view public.rr_vw_motivos_saida with (security_invoker = on) as
with ref as (select coalesce(max(data_referencia), current_date) as data_referencia from public.rr_predicoes)
select
  c.motivo_desligamento as motivo,
  count(*) as n,
  count(*) filter (where c.dias_de_casa <= 90)  as n_ate_90d,
  count(*) filter (where c.dias_de_casa <= 180) as n_ate_180d
from public.rr_colaboradores c, ref r
where c.tipo_desligamento = 'Voluntario'
  and c.data_desligamento > r.data_referencia - 365
  and c.motivo_desligamento is not null
group by c.motivo_desligamento;
