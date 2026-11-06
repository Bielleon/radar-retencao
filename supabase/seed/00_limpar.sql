-- Radar de Retencao: limpeza das tabelas rr_ na ordem inversa das chaves estrangeiras (gerado pelo pipeline)
delete from public.rr_modelos;
delete from public.rr_recomendacoes;
delete from public.rr_parametros_custo;
delete from public.rr_efeito_fator;
delete from public.rr_avaliacao_vies;
delete from public.rr_turnover_mensal;
delete from public.rr_curva_sobrevivencia;
delete from public.rr_metricas_modelo;
delete from public.rr_fatores_globais;
delete from public.rr_predicoes;
delete from public.rr_colaboradores;
delete from public.rr_lojas;
