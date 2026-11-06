# Radar de Retenção – dashboard web

Dashboard do MVP "Radar de Retenção" (Enterprise Challenge Ri Happy × FIAP, turma 2TSCOR):
previsão do risco de desligamento voluntário nos primeiros 90 e 180 dias de colaboradores
operacionais de loja, com fatores explicados, simulador *what-if* e playbook de retenção.

Stack: Vite 6 + React 18 + TypeScript (strict), `@supabase/supabase-js` v2, Recharts, CSS próprio.

## Instalar e rodar

```bash
cd dashboard
npm install
npm run dev          # servidor de desenvolvimento (http://localhost:5173)
```

## Build e verificação

```bash
npm run typecheck    # tsc --noEmit
npm run build        # tsc --noEmit && vite build  -> dist/
npm run preview -- --port 4173   # serve a pasta dist/
```

## Link público e fontes de dados

O link público (https://bielleon.github.io/radar-retencao/) usa a cópia JSON dos resultados em
`public/demo/`. Ele não acessa banco e não publica credenciais: o workflow de publicação não recebe
variáveis do Supabase, e elas não devem ser criadas no repositório.

## Variáveis de ambiente (modo Supabase opcional, só local)

Para ler um projeto Supabase na sua máquina, copie `.env.example` para `.env` e preencha:

| Variável | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | chave pública (anon); as migrações aplicam RLS com leitura pública nas tabelas `rr_*` |
| `VITE_BASE_PATH` | (opcional) caminho base para publicação em subdiretório, ex.: `/radar-retencao/`. No Git Bash, use `MSYS_NO_PATHCONV=1` no comando, senão o caminho vira um caminho do Windows e o build fica quebrado |

Com as duas variáveis do Supabase definidas, o dashboard lê as views/tabelas via PostgREST
(`select('*')` paginado em blocos de 1000 linhas). Se a leitura falhar, demorar mais de 5 segundos ou
voltar vazia, o conjunto afetado cai para a cópia JSON e uma faixa de aviso aparece no cabeçalho.

## Cópia JSON dos resultados

Sem `.env` (ou com as variáveis vazias), o dashboard lê os arquivos `public/demo/<chave>.json`,
que seguem as colunas das views/tabelas (seção 6 de `docs/especificacao-mvp.md`). O pipeline Python
(`pipeline/03_exportar_artefatos.py`) gera esses arquivos.

## Estrutura

```
src/
  lib/        tipos.ts (contrato), data.ts (Supabase/demo + cache), rotulos.ts (acentos),
              formato.ts (Intl pt-BR), niveis.ts (cores dos níveis), simulador.ts (cálculo what-if), rota.ts (abas por hash)
  components/ cabeçalho, navegação, cartões, chips, gráficos, painel de detalhe, paginação
  pages/      VisaoGeral, MapaDeRisco, Colaboradores, FatoresEModelo, Simulador, RecomendacoesEEtica
```

As abas são acessadas por hash: `#/visao-geral`, `#/mapa-de-risco`, `#/colaboradores`,
`#/fatores-e-modelo`, `#/simulador`, `#/recomendacoes-e-etica`.
