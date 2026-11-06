/**
 * Gera a apresentação da Sprint 1 (ideação e arquitetura) do projeto Radar de Retenção.
 *
 * Uso:  node gerar_apresentacao.js [caminho_de_saida.pptx]
 *
 * O script lê os resultados do pipeline (dashboard/public/demo/*.json e data/processed) e os
 * recortes de tela do dashboard (docs/img/tela_*.png). Quando um arquivo não existe, usa um valor de
 * reserva e avisa no console, para que a apresentação possa ser gerada em qualquer etapa.
 */
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const Icones = require("react-icons/fi");
const sharp = require("sharp");

// ---------------------------------------------------------------------------
// Caminhos e dados
// ---------------------------------------------------------------------------
const RAIZ = path.resolve(__dirname, "..");
const DEMO = path.join(RAIZ, "dashboard", "public", "demo");
const IMG = path.join(RAIZ, "docs", "img");
const SAIDA = process.argv[2] || path.join(__dirname, "EC_Sprint_1_2TSCOR_ideacaoarquitetura_RadarRetencao_GabrielLeon.pptx");

function lerJson(nome, reserva) {
  const arquivo = path.join(DEMO, `${nome}.json`);
  if (!fs.existsSync(arquivo)) {
    console.warn(`[aviso] ${arquivo} não encontrado; usando valores de reserva.`);
    return reserva;
  }
  return JSON.parse(fs.readFileSync(arquivo, "utf8"));
}

const kpis = lerJson("kpis", [{}])[0] || {};
const metricas = lerJson("metricas_modelo", []);
const fatores = lerJson("fatores_globais", []);
const turnoverMensal = lerJson("turnover_mensal", []);
const parametrosCusto = lerJson("parametros_custo", []);
const modelos = lerJson("modelos", []);
const card = (modelos[0] && modelos[0].card) || {};
const vies = lerJson("avaliacao_vies", []);
const riscoSegmento = lerJson("risco_segmento", []);
const riscoLoja = lerJson("risco_loja", []);

const fmtInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmtPct = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? "—" : `${(Number(v) * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const fmtBRL = (v) => (v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v)));
const fmtNum = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

const NOME_MODELO = {
  regressao_logistica: "Regressão logística",
  random_forest: "Random forest",
  gradient_boosting: "Gradient boosting",
  xgboost: "XGBoost",
};

function metrica(horizonte, modelo, nome) {
  const m = metricas.find((r) => r.horizonte === horizonte && r.modelo === modelo && r.metrica === nome);
  return m ? Number(m.valor) : null;
}
function modeloSelecionado(horizonte) {
  const m = metricas.find((r) => r.horizonte === horizonte && r.selecionado === true);
  return m ? m.modelo : (card.modelo_selecionado && card.modelo_selecionado[horizonte]) || null;
}

const custoPorDesligamento = kpis.custo_por_desligamento != null
  ? Number(kpis.custo_por_desligamento)
  : parametrosCusto.reduce((s, p) => s + Number(p.valor || 0), 0) || 6500;
const META_REDUCAO = 0.15; // meta inicial ilustrativa

/**
 * Taxas da população do modelo (quem passou do dia 30) e divisão das saídas precoces dos últimos 12 meses
 * em antes e depois do dia 30. Calculadas de data/processed/colaboradores.csv, que não tem acentos nem vírgulas nos campos.
 */
function taxasDaPopulacao() {
  const arquivo = path.join(RAIZ, "data", "processed", "colaboradores.csv");
  const reserva = { t90: null, t180: null, ate30d12m: 0, alcancaveis12m: Number(kpis.deslig_vol_precoces_12m || 0) };
  if (!fs.existsSync(arquivo)) return reserva;
  const [cab, ...linhas] = fs.readFileSync(arquivo, "utf8").trim().split(/\r?\n/);
  const col = Object.fromEntries(cab.split(",").map((c, i) => [c, i]));
  const ref = new Date(`${kpis.data_referencia || "2026-10-31"}T00:00:00Z`);
  const menosDias = (n) => new Date(ref.getTime() - n * 86400000);
  const r = { n90: 0, s90: 0, n180: 0, s180: 0, ate30d12m: 0, alcancaveis12m: 0 };
  for (const l of linhas) {
    const c = l.split(",");
    const admissao = new Date(`${c[col.data_admissao]}T00:00:00Z`);
    const dias = Number(c[col.dias_de_casa]);
    const voluntario = c[col.tipo_desligamento] === "Voluntario";
    if (dias >= 30 && admissao <= menosDias(90)) { r.n90++; if (voluntario && dias <= 90) r.s90++; }
    if (dias >= 30 && admissao <= menosDias(180)) { r.n180++; if (voluntario && dias <= 180) r.s180++; }
    if (voluntario && dias <= 180 && new Date(`${c[col.data_desligamento]}T00:00:00Z`) > menosDias(365)) {
      if (dias <= 30) r.ate30d12m++; else r.alcancaveis12m++;
    }
  }
  return { t90: r.s90 / r.n90, t180: r.s180 / r.n180, ate30d12m: r.ate30d12m, alcancaveis12m: r.alcancaveis12m };
}
const taxasPop = taxasDaPopulacao();

const ROTULO_DADO = { "Temporario Sazonal": "Temporário Sazonal", "Lider de Loja": "Líder de Loja", Brasilia: "Brasília", "Sao Paulo": "São Paulo", "Santo Andre": "Santo André", "Sao Jose dos Campos": "São José dos Campos", Goiania: "Goiânia", Cuiaba: "Cuiabá", Anapolis: "Anápolis", Macapa: "Macapá", Maceio: "Maceió", Niteroi: "Niterói", "Nova Iguacu": "Nova Iguaçu", "Ribeirao Preto": "Ribeirão Preto", "Joao Pessoa": "João Pessoa", "Jaboatao dos Guararapes": "Jaboatão dos Guararapes", Vitoria: "Vitória" };
const rotuloDado = (v) => ROTULO_DADO[v] || v;
function maiorSegmento(dimensao) {
  return riscoSegmento.filter((r) => r.dimensao === dimensao).sort((a, b) => Number(b.pct_alto_risco) - Number(a.pct_alto_risco))[0] || {};
}
const segContrato = maiorSegmento("tipo_contrato");
const segCargo = maiorSegmento("cargo");
const lojasAtencao = riscoLoja.filter((l) => Number(l.ativos_em_janela) >= 5 && Number(l.pct_alto_risco) >= 0.3).sort((a, b) => Number(b.pct_alto_risco) - Number(a.pct_alto_risco));

// ---------------------------------------------------------------------------
// Paleta e tipografia
// ---------------------------------------------------------------------------
const COR = {
  navy: "1B2A4A",   // fundo escuro / títulos
  tinta: "1F2937",  // texto
  branco: "FFFFFF",
  nevoa: "F3F5F9",  // fundo claro de cartões
  linha: "DCE1EA",  // bordas sutis
  ambar: "F2A93B",  // acento principal
  teal: "2A9D8F",   // positivo / baixo risco
  coral: "E8604C",  // risco
  ardosia: "4F5D7A",// texto secundário sobre fundo claro
  claro: "C9D2E3",  // texto secundário sobre fundo escuro
  azul: "5B8DEF",   // apoio
  amarelo: "FFD166",// médio risco
  laranja: "F2994A",// alto risco
};
const FONTE = "Calibri";

const PALETA_TEMA = {
  dk1: COR.tinta, lt1: COR.branco, dk2: COR.navy, lt2: COR.nevoa,
  accent1: COR.ambar, accent2: COR.teal, accent3: COR.coral, accent4: COR.ardosia,
  accent5: COR.azul, accent6: COR.amarelo, hlink: COR.azul, folHlink: COR.ardosia,
};

// ---------------------------------------------------------------------------
// Ícones (react-icons -> SVG -> PNG via sharp)
// ---------------------------------------------------------------------------
const cacheIcones = new Map();
async function icone(nome, corHex = COR.branco) {
  const chave = `${nome}-${corHex}`;
  if (cacheIcones.has(chave)) return cacheIcones.get(chave);
  const Comp = Icones[nome];
  if (!Comp) throw new Error(`Ícone não encontrado: ${nome}`);
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: `#${corHex}`, size: 256, strokeWidth: 2 }));
  const png = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  const data = "image/png;base64," + png.toString("base64");
  cacheIcones.set(chave, data);
  return data;
}

function sombra() {
  return { type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.12 };
}

// ---------------------------------------------------------------------------
// Apresentação, layouts e seções
// ---------------------------------------------------------------------------
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 pol
pres.theme = { headFontFace: FONTE, bodyFontFace: FONTE };
pres.author = "Gabriel Alves Leon Rodriguez";
pres.company = "FIAP 2TSCOR";
pres.title = "Radar de Retenção — Sprint 1 (ideação e arquitetura)";
pres.subject = "Enterprise Challenge Ri Happy x FIAP — 2TSCOR";

function notas(slide, texto) { slide.addNotes(texto); }
const RODAPE = "Radar de Retenção  ·  Enterprise Challenge Ri Happy × FIAP  ·  2TSCOR  ·  Sprint 1";

pres.defineSlideMaster({
  title: "CAPA",
  background: { color: COR.navy },
  objects: [
    { placeholder: { options: { name: "titulo", type: "title", x: 0.8, y: 2.3, w: 11.5, h: 1.4, fontFace: FONTE, fontSize: 48, bold: true, color: COR.branco, margin: 0, valign: "bottom", align: "left" }, text: "" } },
    { placeholder: { options: { name: "subtitulo", type: "body", x: 0.8, y: 3.8, w: 11.5, h: 1.0, fontFace: FONTE, fontSize: 22, color: COR.ambar, margin: 0, valign: "top", align: "left" }, text: "" } },
  ],
});

pres.defineSlideMaster({
  title: "SECAO",
  background: { color: COR.navy },
  objects: [
    { placeholder: { options: { name: "titulo", type: "title", x: 0.8, y: 2.6, w: 11.5, h: 1.3, fontFace: FONTE, fontSize: 40, bold: true, color: COR.branco, margin: 0, valign: "middle", align: "left" }, text: "" } },
    { placeholder: { options: { name: "subtitulo", type: "body", x: 0.8, y: 3.95, w: 11.5, h: 0.8, fontFace: FONTE, fontSize: 18, color: COR.ambar, margin: 0, valign: "top", align: "left" }, text: "" } },
    { text: { text: RODAPE, options: { x: 0.6, y: 7.0, w: 10, h: 0.3, fontFace: FONTE, fontSize: 9, color: COR.claro, margin: 0 } } },
  ],
  slideNumber: { x: 12.3, y: 7.0, w: 0.6, h: 0.3, fontFace: FONTE, fontSize: 10, color: COR.claro, align: "right" },
});

for (const [nome, fundo] of [["CONTEUDO", COR.branco], ["CONTEUDO_CLARO", COR.nevoa]]) {
  pres.defineSlideMaster({
    title: nome,
    background: { color: fundo },
    objects: [
      { placeholder: { options: { name: "titulo", type: "title", x: 0.6, y: 0.38, w: 12.1, h: 0.85, fontFace: FONTE, fontSize: 30, bold: true, color: COR.navy, margin: 0, valign: "middle", align: "left" }, text: "" } },
      { text: { text: RODAPE, options: { x: 0.6, y: 7.0, w: 10, h: 0.3, fontFace: FONTE, fontSize: 9, color: COR.ardosia, margin: 0 } } },
    ],
    slideNumber: { x: 12.3, y: 7.0, w: 0.6, h: 0.3, fontFace: FONTE, fontSize: 10, color: COR.ardosia, align: "right" },
  });
}

// ---------------------------------------------------------------------------
// Componentes reutilizáveis
// ---------------------------------------------------------------------------
function cartao(slide, { x, y, w, h, fundo = COR.branco, borda = COR.linha, raio = 0.12, comSombra = true }) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h, rectRadius: raio,
    fill: { color: fundo },
    line: { color: borda, width: 0.75 },
    shadow: comSombra ? sombra() : undefined,
  });
}

async function cartaoIcone(slide, { x, y, w, h, icone: nomeIcone, titulo, texto, corIcone = COR.ambar, fundo = COR.branco, tamTitulo = 15, tamTexto = 12 }) {
  cartao(slide, { x, y, w, h, fundo });
  const d = 0.55;
  slide.addShape(pres.ShapeType.ellipse, { x: x + 0.25, y: y + 0.25, w: d, h: d, fill: { color: corIcone }, line: { color: corIcone, width: 0 } });
  slide.addImage({ data: await icone(nomeIcone, COR.branco), x: x + 0.25 + d * 0.2, y: y + 0.25 + d * 0.2, w: d * 0.6, h: d * 0.6, altText: `Ícone: ${titulo}` });
  slide.addText(titulo, { x: x + 0.25 + d + 0.15, y: y + 0.22, w: w - d - 0.6, h: 0.6, fontFace: FONTE, fontSize: tamTitulo, bold: true, color: COR.navy, margin: 0, valign: "middle", isTextBox: true });
  // A caixa de descrição só existe quando há texto e espaço; alturas negativas corrompem o arquivo.
  const alturaTexto = h - 1.15;
  if (texto && alturaTexto >= 0.3) {
    slide.addText(texto, { x: x + 0.25, y: y + 0.95, w: w - 0.5, h: alturaTexto, fontFace: FONTE, fontSize: tamTexto, color: COR.tinta, margin: 0, valign: "top", isTextBox: true });
  }
}

async function cartaoLinha(slide, { x, y, w, h, icone: nomeIcone, titulo, texto, corIcone = COR.ambar }) {
  cartao(slide, { x, y, w, h });
  const d = 0.55;
  slide.addShape(pres.ShapeType.ellipse, { x: x + 0.25, y: y + (h - d) / 2, w: d, h: d, fill: { color: corIcone }, line: { color: corIcone, width: 0 } });
  slide.addImage({ data: await icone(nomeIcone, COR.branco), x: x + 0.25 + d * 0.2, y: y + (h - d) / 2 + d * 0.2, w: d * 0.6, h: d * 0.6, altText: `Ícone: ${titulo}` });
  slide.addText(titulo, { x: x + 0.25 + d + 0.2, y: y + 0.14, w: w - d - 0.7, h: 0.38, fontFace: FONTE, fontSize: 14, bold: true, color: COR.navy, margin: 0, valign: "middle", isTextBox: true });
  slide.addText(texto, { x: x + 0.25 + d + 0.2, y: y + 0.52, w: w - d - 0.7, h: Math.max(0.3, h - 0.6), fontFace: FONTE, fontSize: 12.5, color: COR.tinta, margin: 0, valign: "top", isTextBox: true });
}

function estatistica(slide, { x, y, w, h, valor, rotulo, cor = COR.navy, fundo = COR.branco, tamValor = 40 }) {
  cartao(slide, { x, y, w, h, fundo });
  slide.addText(valor, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: h * 0.55, fontFace: FONTE, fontSize: tamValor, bold: true, color: cor, margin: 0, valign: "middle", align: "left", isTextBox: true });
  slide.addText(rotulo, { x: x + 0.2, y: y + h * 0.62, w: w - 0.4, h: h * 0.33, fontFace: FONTE, fontSize: 11.5, color: COR.ardosia, margin: 0, valign: "top", align: "left", isTextBox: true });
}

function paragrafos(itens, opcoes = {}) {
  // Lista com marcadores: cada item vira um parágrafo; breakLine em todos menos o último.
  return itens.map((t, i) => ({
    text: t,
    options: { bullet: { indent: 14 }, breakLine: i < itens.length - 1, paraSpaceAfter: opcoes.espaco ?? 6, ...(opcoes.extra || {}) },
  }));
}

/** Coloca a captura dentro da caixa preservando a proporção; devolve o tamanho usado. */
async function captura(slide, nome, { x, y, w, h, alt }) {
  const arquivo = path.join(IMG, `${nome}.png`);
  if (!fs.existsSync(arquivo)) {
    console.warn(`[aviso] captura ${arquivo} não encontrada; usando quadro de reserva.`);
    slide.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: COR.nevoa }, line: { color: COR.linha, width: 0.75 } });
    slide.addText(`Captura de tela: ${alt}`, { x, y, w, h, fontFace: FONTE, fontSize: 14, color: COR.ardosia, align: "center", valign: "middle", isTextBox: true });
    return { x, y, w, h };
  }
  const { width, height } = await sharp(arquivo).metadata();
  const escala = Math.min(w / width, h / height);
  const lw = width * escala, lh = height * escala;
  slide.addShape(pres.ShapeType.rect, { x: x - 0.03, y: y - 0.03, w: lw + 0.06, h: lh + 0.06, fill: { color: COR.branco }, line: { color: COR.linha, width: 0.75 } });
  slide.addImage({ path: arquivo, x, y, w: lw, h: lh, altText: alt });
  return { x, y, w: lw, h: lh };
}

/** Coluna de texto à direita de uma captura. */
function legendaLateral(slide, caixa, titulo, itens) {
  const x = caixa.x + caixa.w + 0.3;
  const w = 12.7 - x;
  slide.addText(titulo, { x, y: caixa.y, w, h: 0.4, fontFace: FONTE, fontSize: 16, bold: true, color: COR.navy, margin: 0, isTextBox: true });
  slide.addText(paragrafos(itens, { espaco: 8 }), { x, y: caixa.y + 0.45, w, h: 4.4, fontFace: FONTE, fontSize: 14, color: COR.tinta, margin: 0, valign: "top", isTextBox: true });
}

/** Selo que marca números sintéticos e ilustrativos junto aos valores. */
function selo(slide, { x, y, w, texto }) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h: 0.36, rectRadius: 0.08, fill: { color: "FFF4DC" }, line: { color: COR.ambar, width: 0.75 } });
  slide.addText(texto, { x, y, w, h: 0.36, fontFace: FONTE, fontSize: 12, bold: true, color: "7A4E00", align: "center", valign: "middle", margin: 0, isTextBox: true });
}

function tituloComSub(slide, titulo, subtitulo) {
  slide.addText(titulo, { placeholder: "titulo" });
  if (subtitulo) {
    slide.addText(subtitulo, { x: 0.6, y: 1.2, w: 12.1, h: 0.45, fontFace: FONTE, fontSize: 14, color: COR.ardosia, margin: 0, valign: "top", isTextBox: true });
  }
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------
async function construir() {
  const precoces = Number(kpis.deslig_vol_precoces_12m || 0);
  const custo12m = Number(kpis.custo_estimado_12m || precoces * custoPorDesligamento);
  const economia = taxasPop.alcancaveis12m * custoPorDesligamento * META_REDUCAO;
  const evitadas = Math.round(taxasPop.alcancaveis12m * META_REDUCAO);
  const sel90 = modeloSelecionado("90d"), sel180 = modeloSelecionado("180d");
  const auc90 = metrica("90d", sel90, "auc_roc"), auc180 = metrica("180d", sel180, "auc_roc");
  const recall90 = metrica("90d", sel90, "recall_top20");

  // ---------------- Capa ----------------
  pres.addSection({ title: "Abertura" });
  {
    const s = pres.addSlide({ masterName: "CAPA", sectionTitle: "Abertura" });
    s.addText("Radar de Retenção", { placeholder: "titulo" });
    s.addText("Análise preditiva de turnover no varejo: risco de desligamento voluntário nos primeiros 90 e 180 dias", { placeholder: "subtitulo" });
    s.addText("Enterprise Challenge Ri Happy × FIAP  ·  Turma 2TSCOR  ·  Sprint 1: ideação e arquitetura da solução", { x: 0.8, y: 5.2, w: 11.5, h: 0.4, fontFace: FONTE, fontSize: 14, color: COR.branco, margin: 0, isTextBox: true });
    s.addText("Gabriel Alves Leon Rodriguez  ·  RM566648  ·  novembro de 2026", { x: 0.8, y: 5.6, w: 11.5, h: 0.4, fontFace: FONTE, fontSize: 14, color: COR.claro, margin: 0, isTextBox: true });
    for (const [r, op] of [[2.4, 25], [1.75, 40], [1.1, 60], [0.45, 100]]) {
      s.addShape(pres.ShapeType.ellipse, { x: 11.9 - r / 2, y: 1.75 - r / 2, w: r, h: r, fill: { color: COR.ambar, transparency: 100 - op }, line: { color: COR.ambar, width: 0 } });
    }
    notas(s, "Abertura: apresentar o projeto Radar de Retenção, resposta ao desafio da Ri Happy de antecipar o desligamento voluntário de colaboradores operacionais de loja nos primeiros 90 e 180 dias.");
  }

  // ---------------- Identificação da equipe ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Abertura" });
    tituloComSub(s, "Identificação da equipe", "Projeto desenvolvido individualmente, com todas as responsabilidades do grupo assumidas pelo autor");
    const rot = (t) => ({ text: t, options: { bold: true, color: COR.branco, fill: { color: COR.navy } } });
    const linhas = [
      [rot("Turma"), { text: "2TSCOR — Tecnologia em Data Science (FIAP)" }],
      [rot("Projeto"), { text: "Radar de Retenção — análise preditiva de turnover no varejo" }],
      [rot("Empresa parceira"), { text: "Ri Happy (bandeiras Ri Happy, PBKids, Divertudo e Newtoys)" }],
      [rot("Integrante (ordem alfabética)"), { text: "Gabriel Alves Leon Rodriguez — RM566648" }],
      [rot("Entrega"), { text: "Sprint 1 — ideação e arquitetura da solução (prazo da sprint: 03/11/2026)" }],
    ];
    s.addTable(linhas, { x: 0.6, y: 1.9, w: 7.6, colW: [2.6, 5.0], rowH: 0.9, fontFace: FONTE, fontSize: 16, color: COR.tinta, border: { type: "solid", pt: 0.75, color: COR.linha }, fill: { color: COR.branco }, valign: "middle", margin: 0.12 });
    await cartaoIcone(s, { x: 8.7, y: 1.9, w: 4.0, h: 4.5, icone: "FiUsers", titulo: "Papéis assumidos", texto: "Definição do recorte do problema, exploração e preparação dos dados, modelagem preditiva e explicabilidade, arquitetura e construção do protótipo (dashboard e banco Supabase), documentação e apresentação.", tamTexto: 16, tamTitulo: 17 });
    notas(s, "Trabalho individual: o aluno assume integralmente as responsabilidades do grupo.");
  }

  // ---------------- Resumo executivo ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Abertura" });
    tituloComSub(s, "Em resumo: prever no dia 30 para reter antes de perder", "Resumo executivo. Números do protótipo com base sintética; os dados da Ri Happy entram na Sprint 2");
    const blocos = [
      ["FiAlertTriangle", COR.coral, "Problema", `Saídas voluntárias precoces pesam: ${fmtPct(kpis.taxa_saida_vol_90d, 1)} dos admitidos saem até 90 dias e ${fmtPct(kpis.taxa_saida_vol_180d, 1)} até 180 dias, na base sintética.`],
      ["FiTarget", COR.ambar, "Solução", "No dia 30 de casa, o Radar estima o risco em 90 e 180 dias, explica três fatores por pessoa e indica uma ação do playbook, com responsável e prazo."],
      ["FiCheckCircle", COR.teal, "Evidência", `Protótipo funcional: AUC ${fmtNum(auc90, 3)} e ${fmtNum(auc180, 3)} no teste temporal; os 20% de maior risco concentram ${fmtPct(recall90)} das saídas em 90 dias.`],
      ["FiDollarSign", COR.azul, "Valor", `Com as premissas ilustrativas, reduzir 15% das ${fmtInt.format(taxasPop.alcancaveis12m)} saídas alcançáveis pelo modelo evitaria ${fmtInt.format(evitadas)} saídas e cerca de ${fmtBRL(economia)} por ano.`],
    ];
    let i = 0;
    for (const [ic, cor, t, d] of blocos) {
      const col = i % 2, lin = Math.floor(i / 2);
      await cartaoIcone(s, { x: 0.6 + col * 6.15, y: 1.85 + lin * 2.45, w: 5.95, h: 2.3, icone: ic, titulo: t, texto: d, tamTitulo: 18, tamTexto: 16, corIcone: cor });
      i++;
    }
    notas(s, "Resumo em quatro pontos: problema, solução, evidência do protótipo e valor esperado. Todos os números vêm da base sintética e de premissas ilustrativas; serão recalibrados com os dados da Ri Happy.");
  }

  // ---------------- Problema ----------------
  pres.addSection({ title: "Problema" });
  {
    const s = pres.addSlide({ masterName: "SECAO", sectionTitle: "Problema" });
    s.addText("O problema: sair cedo custa caro", { placeholder: "titulo" });
    s.addText("Contextualização do desafio, tamanho do problema e recorte", { placeholder: "subtitulo" });
  }
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Problema" });
    tituloComSub(s, "Sair cedo pressiona custo, atendimento e picos", "Contextualização do desafio. Ri Happy: maior rede de varejo de brinquedos do Brasil, com forte sazonalidade e intenso contato com o cliente");
    const cartoes = [
      ["FiUserMinus", "Desligamento voluntário precoce", "Colaboradores operacionais de loja (vendedores, caixas, estoquistas, líderes) que pedem para sair nos primeiros 90 e 180 dias, ainda em adaptação."],
      ["FiCalendar", "Operação regular e sazonal", "No dia a dia, reposição contínua de vagas e integração perdida. Nos picos de Dia das Crianças e Natal, saídas reduzem a capacidade de atendimento."],
      ["FiDollarSign", "Custos e perda de investimento", "Seleção, integração e treinamento perdidos, encargos de desligamento, reposição de vagas e produtividade abaixo do esperado."],
      ["FiTrendingDown", "Impacto no atendimento", "Lojas desfalcadas, equipes instáveis e queda na qualidade do atendimento ao cliente final."],
    ];
    let x = 0.6;
    for (const [ic, t, d] of cartoes) {
      await cartaoIcone(s, { x, y: 1.85, w: 2.95, h: 2.8, icone: ic, titulo: t, texto: d, tamTitulo: 14, tamTexto: 12.5 });
      x += 3.05;
    }
    const ultimos = turnoverMensal.slice(-24);
    if (ultimos.length) {
      const rot = ultimos.map((m) => { const [a, me] = String(m.mes).split("-"); return `${me}/${a.slice(2)}`; });
      s.addChart(pres.ChartType.bar, [
        { name: "Admissões", labels: rot, values: ultimos.map((m) => Number(m.admissoes)) },
        { name: "Saídas voluntárias com até 180 dias", labels: rot, values: ultimos.map((m) => Number(m.desligamentos_vol_precoces)) },
      ], {
        x: 0.6, y: 4.75, w: 12.1, h: 2.15, barDir: "col", barGrouping: "clustered",
        chartColors: [COR.azul, COR.coral], showLegend: true, legendPos: "r", legendFontSize: 10, legendFontFace: "+mn-lt", legendColor: COR.ardosia,
        showTitle: true, title: "Base sintética: admissões sobem de setembro a dezembro; as saídas precoces vêm em seguida, até o início do ano", titleFontSize: 11, titleColor: COR.navy, titleFontFace: "+mn-lt",
        catAxisLabelFontSize: 9, catAxisLabelColor: COR.ardosia, catAxisLabelFontFace: "+mn-lt", valAxisLabelFontSize: 9, valAxisLabelColor: COR.ardosia, valAxisLabelFontFace: "+mn-lt",
        valGridLine: { color: COR.linha, size: 0.5 }, catGridLine: { style: "none" }, showValue: false,
      });
    }
    notas(s, "A Ri Happy atua em um setor com forte sazonalidade e capilaridade. A saída precoce compromete atendimento, perde investimento em seleção e treinamento e pressiona a operação regular e os picos de Dia das Crianças e Natal.");
  }

  // ---------------- Tamanho do problema ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Problema" });
    tituloComSub(s, "Na base sintética, uma em cada cinco pessoas sai até o dia 90", "Tamanho do problema. Base sintética com valores ilustrativos, não são dados da Ri Happy");
    selo(s, { x: 9.55, y: 1.22, w: 3.15, texto: "Base sintética, valores ilustrativos" });
    estatistica(s, { x: 0.6, y: 1.85, w: 2.95, h: 1.85, valor: fmtPct(kpis.taxa_saida_vol_90d, 1), rotulo: "saem voluntariamente até 90 dias: todos os admitidos, incluindo saídas antes do dia 30", cor: COR.coral });
    estatistica(s, { x: 3.65, y: 1.85, w: 2.95, h: 1.85, valor: fmtPct(kpis.taxa_saida_vol_180d, 1), rotulo: "saem voluntariamente até 180 dias: todos os admitidos, incluindo saídas antes do dia 30", cor: COR.laranja });
    estatistica(s, { x: 6.7, y: 1.85, w: 2.95, h: 1.85, valor: fmtPct(taxasPop.t90, 1), rotulo: "até 90 dias entre quem passou do dia 30: a população do modelo", cor: COR.navy });
    estatistica(s, { x: 9.75, y: 1.85, w: 2.95, h: 1.85, valor: fmtPct(taxasPop.t180, 1), rotulo: "até 180 dias entre quem passou do dia 30: a população do modelo", cor: COR.navy });
    await cartaoLinha(s, { x: 0.6, y: 3.9, w: 5.95, h: 1.4, icone: "FiDollarSign", titulo: `${fmtBRL(custo12m)} em 12 meses`, texto: `${fmtInt.format(precoces)} saídas voluntárias precoces (até 180 dias de casa) × ${fmtBRL(custoPorDesligamento)} por saída, premissa ilustrativa a validar com a Ri Happy.`, corIcone: COR.coral });
    await cartaoLinha(s, { x: 6.75, y: 3.9, w: 5.95, h: 1.4, icone: "FiClock", titulo: `${fmtInt.format(taxasPop.ate30d12m)} dessas saídas ocorrem antes do dia 30`, texto: `O score só existe a partir do dia 30. As ${fmtInt.format(taxasPop.alcancaveis12m)} saídas entre os dias 31 e 180 são as alcançáveis pelo modelo; as demais dependem de seleção e integração.`, corIcone: COR.ambar });
    await cartaoLinha(s, { x: 0.6, y: 5.45, w: 5.95, h: 1.4, icone: "FiUserCheck", titulo: "Perfis com mais risco alto ou crítico", texto: `Por contrato, ${rotuloDado(segContrato.categoria)} (${fmtPct(segContrato.pct_alto_risco)}); por cargo, ${rotuloDado(segCargo.categoria)} (${fmtPct(segCargo.pct_alto_risco)}). Média geral: ${fmtPct(kpis.pct_alto_risco)} dos ${fmtInt.format(kpis.ativos_em_janela)} ativos em janela.`, corIcone: COR.teal });
    await cartaoLinha(s, { x: 6.75, y: 5.45, w: 5.95, h: 1.4, icone: "FiMap", titulo: `${lojasAtencao.length} lojas exigem atenção`, texto: `Lojas com ao menos 5 pessoas em janela e 30% ou mais em risco alto ou crítico; a maior concentração é ${lojasAtencao[0] ? `${lojasAtencao[0].loja_id}, em ${rotuloDado(lojasAtencao[0].cidade)}/${lojasAtencao[0].uf} (${fmtPct(lojasAtencao[0].pct_alto_risco)})` : "—"}.`, corIcone: COR.teal });
    notas(s, "Duas definições de taxa: entre todos os admitidos e entre quem passou do dia 30, que é a população do modelo. O custo é premissa ilustrativa. Perfis e lojas são resultados da base sintética e mostram o tipo de resposta que o Radar dará com os dados reais.");
  }

  // ---------------- Recorte do problema ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Problema" });
    tituloComSub(s, "O foco é quem acabou de chegar à loja", "Recorte do problema: o que o projeto prioriza dentro do desafio proposto pela Ri Happy");
    const prioridades = [
      ["FiClock", "Primeiros 90 e 180 dias", "Risco de desligamento voluntário calculado no checkpoint de 30 dias de casa, com dois horizontes de previsão."],
      ["FiUserCheck", "Perfis e pessoas com maior risco", "Lista priorizada de colaboradores e perfis com maior probabilidade de saída, com os fatores explicados."],
      ["FiMap", "Lojas, regiões e cargos que exigem atenção", "Mapa de risco para direcionar ações preventivas e preparar as equipes antes dos picos."],
      ["FiCompass", "Apoio às ações preventivas", "Playbook de retenção por fator e nível de risco, com estimativa do custo evitável do turnover precoce."],
    ];
    let y = 1.85;
    for (const [ic, t, d] of prioridades) {
      await cartaoLinha(s, { x: 0.6, y, w: 7.4, h: 1.12, icone: ic, titulo: t, texto: d });
      y += 1.25;
    }
    cartao(s, { x: 8.4, y: 1.85, w: 4.3, h: 4.85, fundo: COR.navy, borda: COR.navy });
    s.addText("População-alvo", { x: 8.7, y: 2.05, w: 3.8, h: 0.4, fontFace: FONTE, fontSize: 16, bold: true, color: COR.ambar, margin: 0, isTextBox: true });
    s.addText(paragrafos([
      "Colaboradores operacionais de loja: vendedores, operadores de caixa, estoquistas, líderes e gerentes de loja",
      "Todas as bandeiras e regiões; contratos CLT, temporário sazonal, jovem aprendiz e intermitente",
    ]), { x: 8.7, y: 2.5, w: 3.8, h: 1.9, fontFace: FONTE, fontSize: 13, color: COR.branco, margin: 0, valign: "top", isTextBox: true });
    s.addText("Fora do escopo do MVP", { x: 8.7, y: 4.45, w: 3.8, h: 0.4, fontFace: FONTE, fontSize: 16, bold: true, color: COR.ambar, margin: 0, isTextBox: true });
    s.addText(paragrafos([
      "Áreas corporativas e centros de distribuição",
      "Desligamentos involuntários como alvo (entram só como contexto)",
      "Integração em tempo real com o sistema de RH (cargas em lote)",
    ]), { x: 8.7, y: 4.9, w: 3.8, h: 1.7, fontFace: FONTE, fontSize: 13, color: COR.branco, margin: 0, valign: "top", isTextBox: true });
    notas(s, "Recorte: desligamentos voluntários nos primeiros meses, perfis e lojas de maior risco, fatores associados e apoio às ações preventivas. Fora do escopo: corporativo, CD e alvo involuntário.");
  }

  // ---------------- Usuários e partes interessadas ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Problema" });
    tituloComSub(s, "Cada área decide algo diferente com o mesmo radar", "Usuários da solução e partes interessadas: quem usa o Radar de Retenção e o que cada um ganha");
    const usuarios = [
      ["FiHeart", "Gente & Gestão (BP de RH)", "Lista priorizada, fatores por pessoa e playbook de ações; acompanhamento dos casos de risco alto e crítico."],
      ["FiHome", "Gerentes de loja e líderes", "Visão da própria equipe nos primeiros 180 dias; conversas de acolhimento orientadas pelos fatores."],
      ["FiMap", "Gerentes regionais e operações", "Mapa de risco por loja e região; preparação das equipes para Dia das Crianças e Natal."],
      ["FiCpu", "Analytics e Tecnologia", "Pipeline reprodutível, modelo documentado e auditoria de viés; monitoramento de deriva previsto para a evolução."],
      ["FiBriefcase", "Liderança executiva", "KPIs de turnover e custo do turnover precoce; acompanhamento das ações de retenção previsto para a evolução."],
      ["FiSmile", "Colaboradores (beneficiários)", "Integração melhor acompanhada, escalas e deslocamento revisados, mais chance de permanecer e crescer."],
    ];
    let i = 0;
    for (const [ic, t, d] of usuarios) {
      const col = i % 3, lin = Math.floor(i / 3);
      await cartaoIcone(s, { x: 0.6 + col * 4.1, y: 1.85 + lin * 2.55, w: 3.9, h: 2.35, icone: ic, titulo: t, texto: d, tamTitulo: 15, tamTexto: 14 });
      i++;
    }
    notas(s, "Usuários: Gente & Gestão, líderes e gerentes de loja, regionais e operações, analytics/tecnologia e liderança executiva; os colaboradores são os beneficiários finais.");
  }

  // ---------------- Solução ----------------
  pres.addSection({ title: "Solução" });
  {
    const s = pres.addSlide({ masterName: "SECAO", sectionTitle: "Solução" });
    s.addText("A solução: prever, explicar e agir", { placeholder: "titulo" });
    s.addText("Proposta, objetivos, funcionalidades, benefícios e cuidados éticos", { placeholder: "subtitulo" });
  }
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Solução" });
    tituloComSub(s, "Do dado de RH ao risco explicado e à ação de retenção", "Proposta de solução: uma plataforma de people analytics que responde às quatro questões orientadoras");
    const perguntas = [
      ["FiTarget", "O que o projeto pretende desenvolver?", "Um modelo preditivo de desligamento voluntário (90 e 180 dias) para colaboradores operacionais de loja e um dashboard web com simulador e playbook de ações, alimentado pelo banco Supabase ou por uma cópia estática dos resultados."],
      ["FiAlertTriangle", "Como ajuda a identificar riscos?", "No checkpoint de 30 dias de casa, o modelo combina atributos de admissão (contrato, cargo, distância, canal) com sinais da integração (trilha concluída, treinamento, avaliação, faltas) e classifica cada pessoa em Baixo, Médio, Alto ou Crítico."],
      ["FiBarChart2", "Quais informações disponibiliza?", "KPIs de turnover, tendência com sazonalidade, mapa de risco por loja, região e cargo, lista priorizada com 3 fatores por pessoa, curva de sobrevivência, custo do turnover e auditoria de viés."],
      ["FiCheckCircle", "Como apoia a decisão de Gente & Gestão?", "Responde onde agir, o que exige atenção imediata e por quê; cada caso recebe uma ação recomendada, com responsável e prazo definidos no playbook, e a economia esperada é simulada."],
    ];
    let i = 0;
    for (const [ic, t, d] of perguntas) {
      const col = i % 2, lin = Math.floor(i / 2);
      await cartaoIcone(s, { x: 0.6 + col * 6.15, y: 1.85 + lin * 2.55, w: 5.95, h: 2.4, icone: ic, titulo: t, texto: d, tamTitulo: 16, tamTexto: 14 });
      i++;
    }
    notas(s, "Responde às quatro questões orientadoras: o que desenvolver, como identificar riscos, quais informações disponibilizar e como apoiar a decisão.");
  }

  // ---------------- Objetivos ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Solução" });
    tituloComSub(s, "Objetivos: antecipar a saída a tempo de agir", "Objetivo geral e objetivos específicos do projeto");
    cartao(s, { x: 0.6, y: 1.85, w: 12.1, h: 1.25, fundo: COR.navy, borda: COR.navy });
    s.addText([
      { text: "Objetivo geral: ", options: { bold: true, color: COR.ambar } },
      { text: "apoiar Gente & Gestão a reduzir o desligamento voluntário de colaboradores operacionais de loja nos primeiros 90 e 180 dias, com previsões explicadas e ações preventivas.", options: { color: COR.branco } },
    ], { x: 0.9, y: 1.95, w: 11.5, h: 1.05, fontFace: FONTE, fontSize: 17, margin: 0, valign: "middle", isTextBox: true });
    const objetivos = [
      ["FiClock", "Prever", "Estimar, no dia 30 de casa, o risco de saída voluntária até 90 e até 180 dias para cada colaborador."],
      ["FiEye", "Explicar", "Mostrar os 3 fatores que mais pesam por pessoa e a importância global de cada fator, em linguagem simples."],
      ["FiCompass", "Apoiar a ação", "Converter nível e fator em ação do playbook, com responsável e prazo, e indicar lojas e perfis que exigem atenção."],
      ["FiTrendingDown", "Medir o ganho", `Meta inicial ilustrativa: reduzir 15% das saídas entre os dias 31 e 180, a validar com a Ri Happy na Sprint 2.`],
    ];
    let x = 0.6;
    for (const [ic, t, d] of objetivos) {
      await cartaoIcone(s, { x, y: 3.3, w: 2.95, h: 3.35, icone: ic, titulo: t, texto: d, tamTitulo: 16, tamTexto: 14, corIcone: COR.teal });
      x += 3.05;
    }
    notas(s, "O objetivo geral é apoiar a redução do desligamento voluntário precoce. Os específicos são prever, explicar, apoiar a ação e medir o ganho. A meta de 15% é uma premissa ilustrativa.");
  }

  // ---------------- Funcionalidades ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Solução" });
    tituloComSub(s, "Seis páginas levam do panorama à ação individual", "Principais funcionalidades: as seis páginas do protótipo funcional");
    const func = [
      ["FiActivity", "Visão geral", "Headcount, taxa de saída voluntária até 90/180 dias, desligamentos precoces, custo estimado, tendência mensal e curva de sobrevivência."],
      ["FiMap", "Mapa de risco", "Lojas, regiões, bandeiras, cargos e contratos ordenados por risco: onde agir preventivamente."],
      ["FiList", "Colaboradores em risco", "Lista priorizada com níveis Baixo, Médio, Alto e Crítico, três fatores explicados e ação recomendada. Alerta automático aos líderes fica para a Sprint 2."],
      ["FiBarChart2", "Fatores e modelo", "Importância global dos fatores, efeito por categoria, métricas dos modelos, auditoria de viés e limitações."],
      ["FiSliders", "Simulador what-if", "Altere contrato, distância, integração ou avaliação e veja o risco mudar: apoio à calibração de contratação e integração."],
      ["FiBookOpen", "Recomendações e ética", "Playbook por fator e nível, parâmetros de custo editáveis, simulação da economia e princípios de uso responsável."],
    ];
    let i = 0;
    for (const [ic, t, d] of func) {
      const col = i % 3, lin = Math.floor(i / 3);
      await cartaoIcone(s, { x: 0.6 + col * 4.1, y: 1.85 + lin * 2.55, w: 3.9, h: 2.4, icone: ic, titulo: t, texto: d, tamTitulo: 15, tamTexto: 13.5, corIcone: i % 2 ? COR.teal : COR.ambar });
      i++;
    }
    notas(s, "Funcionalidades: visão geral, mapa de risco, lista de colaboradores com classificação por nível, fatores e modelo, simulador e playbook com custo. O alerta automático é evolução da Sprint 2.");
  }

  // ---------------- Benefícios ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Solução" });
    tituloComSub(s, "Reter quem já foi treinado custa menos que recontratar", "Benefícios e impactos esperados. Números do protótipo, a recalibrar com os dados da Ri Happy");
    selo(s, { x: 9.55, y: 1.22, w: 3.15, texto: "Base sintética, valores ilustrativos" });
    estatistica(s, { x: 0.6, y: 1.85, w: 3.95, h: 1.75, valor: fmtPct(recall90), rotulo: "das saídas em 90 dias estão nos 20% de maior risco (teste temporal na base sintética)", cor: COR.teal });
    estatistica(s, { x: 4.67, y: 1.85, w: 3.95, h: 1.75, valor: fmtInt.format(evitadas), rotulo: `saídas evitadas por ano com a meta ilustrativa de 15% sobre as ${fmtInt.format(taxasPop.alcancaveis12m)} saídas entre os dias 31 e 180`, cor: COR.navy });
    estatistica(s, { x: 8.74, y: 1.85, w: 3.96, h: 1.75, valor: fmtBRL(economia), rotulo: `por ano em custos evitados, com a premissa ilustrativa de ${fmtBRL(custoPorDesligamento)} por saída`, cor: COR.navy });
    const beneficios = [
      ["FiShield", "Ações preventivas de retenção", "Casos de risco alto ou crítico recebem ação, com responsável e prazo do playbook."],
      ["FiTrendingDown", "Menos desligamentos precoces", "Atenção concentrada em quem tem maior risco, ainda nos primeiros meses de casa."],
      ["FiSmile", "Atendimento preservado", "Equipes mais estáveis e preparadas nos primeiros meses de casa."],
      ["FiCalendar", "Lojas completas nos picos", "O risco por loja e contrato orienta contratação e reforço antes do Dia das Crianças e do Natal."],
      ["FiDollarSign", "Menos custo de recontratação", "Menos vagas reabertas e menos horas de integração perdidas."],
      ["FiSun", "Ambiente de trabalho melhor", "Integração, escala e liderança viram pauta de melhoria contínua."],
    ];
    let i = 0;
    for (const [ic, t, d] of beneficios) {
      const col = i % 3, lin = Math.floor(i / 3);
      await cartaoLinha(s, { x: 0.6 + col * 4.1, y: 3.8 + lin * 1.55, w: 3.9, h: 1.42, icone: ic, titulo: t, texto: d, corIcone: COR.teal });
      i++;
    }
    notas(s, "Benefícios esperados: ações preventivas, menos desligamentos precoces, atendimento preservado, lojas completas nos picos, menos custo de recontratação e ambiente de trabalho melhor. A meta incide só sobre as saídas posteriores ao dia 30, as únicas alcançáveis pelo score.");
  }

  // ---------------- Ética ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Solução" });
    tituloComSub(s, "O score existe para reter e acolher, nunca para penalizar", "Ética, privacidade e uso responsável dos dados");
    const v = (grupo, hz) => vies.find((r) => r.horizonte === hz && r.grupo_tipo === "faixa_etaria" && r.grupo_valor === grupo) || {};
    const v55 = v("55+", "90d"), v18 = v("18-24", "90d");
    const principios = [
      ["FiHeart", "Finalidade: reter, não punir", "As previsões apoiam conversas de acolhimento, ações de retenção conduzidas por pessoas e a melhoria do ambiente de trabalho. Nenhuma decisão de desligamento, promoção ou remuneração usa o score; o aviso aparece em cada detalhe individual."],
      ["FiLock", "LGPD: o que já existe e o que falta", "No protótipo: minimização de variáveis, IDs fictícios, fatores explicados e limites declarados. Requisitos da operação real: base legal com teste de balanceamento, pseudonimização na origem, acesso por perfil e retenção limitada. O acesso aberto só é aceitável com dados sintéticos."],
      ["FiEyeOff", "Riscos de viés e discriminação", `Idade, gênero, raça e saúde não são preditores, mas contrato (Jovem Aprendiz) e canal (Programa Jovem) funcionam como proxies de idade. A auditoria achou a faixa 55+ superestimada (${fmtPct(v55.risco_medio_previsto, 1)} previsto, ${fmtPct(v55.taxa_real, 1)} real) e a 18-24 subestimada (${fmtPct(v18.risco_medio_previsto, 1)} e ${fmtPct(v18.taxa_real, 1)}), a rever na Sprint 2.`],
      ["FiDatabase", "Uso responsável dos dados da Ri Happy", "O protótipo usa somente base sintética. Os dados de RH disponibilizados pela Ri Happy serão usados apenas para fins acadêmicos, de forma pseudonimizada, sem versionamento em repositório nem publicação no dashboard aberto."],
    ];
    let i = 0;
    for (const [ic, t, d] of principios) {
      const col = i % 2, lin = Math.floor(i / 2);
      await cartaoIcone(s, { x: 0.6 + col * 6.15, y: 1.85 + lin * 2.55, w: 5.95, h: 2.42, icone: ic, titulo: t, texto: d, tamTitulo: 15, tamTexto: 12.5, corIcone: COR.coral });
      i++;
    }
    notas(s, "Ética: uso para retenção e melhoria do ambiente, LGPD separando o que existe do que é requisito da operação real, riscos de viés com o resultado da auditoria, e uso responsável dos dados da Ri Happy, que ainda não foram recebidos.");
  }

  // ---------------- Arquitetura ----------------
  pres.addSection({ title: "Arquitetura" });
  {
    const s = pres.addSlide({ masterName: "SECAO", sectionTitle: "Arquitetura" });
    s.addText("Arquitetura e fluxo dos dados", { placeholder: "titulo" });
    s.addText("Componentes, tecnologias e percurso dos dados até a recomendação", { placeholder: "subtitulo" });
  }
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Arquitetura" });
    tituloComSub(s, "Lote em Python, resultados publicados e consumo web", "Arquitetura inicial da solução, independente de provedor de nuvem");
    const IMPL = COR.teal, OPC = COR.azul, PLAN = COR.ambar;
    const w = 1.85, gap = 0.2, yTopo = 1.8, hTotal = 3.1, hMeia = 1.5;
    const xCol = (i) => 0.6 + i * (w + gap);
    const bloco = (i, y, h, titulo, texto, cor) => {
      cartao(s, { x: xCol(i), y, w, h, fundo: COR.branco });
      s.addShape(pres.ShapeType.rect, { x: xCol(i) + 0.02, y, w: w - 0.04, h: 0.09, fill: { color: cor }, line: { color: cor, width: 0 } });
      s.addText(titulo, { x: xCol(i) + 0.1, y: y + 0.13, w: w - 0.2, h: 0.5, fontFace: FONTE, fontSize: 12.5, bold: true, color: COR.navy, margin: 0, valign: "top", isTextBox: true });
      s.addText(texto, { x: xCol(i) + 0.1, y: y + 0.62, w: w - 0.2, h: h - 0.68, fontFace: FONTE, fontSize: 11, color: COR.tinta, margin: 0, valign: "top", isTextBox: true });
    };
    bloco(0, yTopo, hMeia, "Base de RH da Ri Happy", "Admissões, desligamentos, integração. Entra na Sprint 2.", PLAN);
    bloco(0, yTopo + hTotal - hMeia, hMeia, "Base sintética (CSV)", "Mesma estrutura, com IDs fictícios.", IMPL);
    bloco(1, yTopo, hTotal, "Preparação e processamento", "Python: pandas e numpy. Checkpoint de 30 dias, alvos de 90 e 180 dias. Scripts e notebook reprodutíveis.", IMPL);
    bloco(2, yTopo, hTotal, "Modelo preditivo", "scikit-learn e XGBoost: 4 modelos comparados. Contribuições no estilo SHAP e sobrevivência com lifelines.", IMPL);
    bloco(3, yTopo, hMeia, "Cópia JSON dos resultados", "Alimenta o link público, sem banco.", IMPL);
    bloco(3, yTopo + hTotal - hMeia, hMeia, "Supabase (Postgres)", "Tabelas rr_* e views rr_vw_*. Opcional, com .env local.", OPC);
    bloco(4, yTopo, hTotal, "Dashboard web", "Vite, React e Recharts. Site estático no GitHub Pages. Simulador calculado no navegador.", IMPL);
    bloco(5, yTopo, hTotal, "Usuários", "Gente & Gestão, líderes de loja, regionais, operações e liderança executiva.", IMPL);
    for (let i = 0; i < 5; i++) {
      s.addShape(pres.ShapeType.line, { x: xCol(i) + w + 0.01, y: yTopo + hTotal / 2, w: gap - 0.02, h: 0, line: { color: COR.ardosia, width: 2, endArrowType: "triangle" } });
    }
    // Faixa de governança
    cartao(s, { x: 0.6, y: 5.03, w: 12.1, h: 0.72, fundo: COR.nevoa, borda: COR.linha, comSombra: false });
    s.addImage({ data: await icone("FiShield", COR.navy), x: 0.75, y: 5.2, w: 0.38, h: 0.38, altText: "Ícone de escudo" });
    s.addText([
      { text: "Governança transversal: ", options: { bold: true, color: COR.navy } },
      { text: "IDs fictícios no protótipo e pseudonimização na operação real, RLS nas tabelas rr_*, credenciais fora do repositório e do site público, auditoria de viés publicada, nenhuma decisão automática sobre pessoas." },
    ], { x: 1.25, y: 5.06, w: 11.35, h: 0.66, fontFace: FONTE, fontSize: 12, color: COR.tinta, margin: 0, valign: "middle", isTextBox: true });
    // Legenda de estado
    const legenda = [[IMPL, "Implementado no protótipo, com dados sintéticos"], [OPC, "Implementado, uso opcional na execução local"], [PLAN, "Planejado"]];
    let xl = 0.6;
    for (const [cor, texto] of legenda) {
      s.addShape(pres.ShapeType.rect, { x: xl, y: 5.92, w: 0.22, h: 0.16, fill: { color: cor }, line: { color: cor, width: 0 } });
      const largura = texto.length * 0.078 + 0.1;
      s.addText(texto, { x: xl + 0.28, y: 5.84, w: largura, h: 0.32, fontFace: FONTE, fontSize: 11.5, color: COR.tinta, margin: 0, valign: "middle", isTextBox: true });
      xl += 0.28 + largura + 0.2;
    }
    s.addText([
      { text: "Evolução na Sprint 2: ", options: { bold: true } },
      { text: "integração direta com o sistema de RH, rescoring periódico, alertas automáticos para líderes, registro das ações de retenção, autenticação por perfil e monitoramento de deriva do modelo." },
    ], { x: 0.6, y: 6.2, w: 12.1, h: 0.62, fontFace: FONTE, fontSize: 12, color: COR.ardosia, margin: 0, valign: "top", isTextBox: true });
    notas(s, "Fontes, preparação, modelo, armazenamento, visualização e usuários. A cor indica o estado de cada componente. O link público lê a cópia JSON dos resultados; o Supabase é lido quando configurado por .env local, e assim nenhuma credencial do banco é publicada.");
  }

  // ---------------- Fluxo dos dados ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Arquitetura" });
    tituloComSub(s, "Seis passos da extração de RH à recomendação de ação", "Fluxo dos dados, da origem à apresentação das previsões e recomendações");
    const passos = [
      ["Entrada", "Um registro por colaborador: atributos de admissão, sinais dos primeiros 30 dias e, para desligados, data, tipo e motivo."],
      ["Preparação", "Checkpoint de 30 dias: só informação disponível até esse ponto vira variável. Alvos: saída voluntária até o dia 90 e até o dia 180."],
      ["Treino e avaliação", "Treino até 2025, teste em 2026 e validação cruzada. Como o teste não tem picos, uma validação retroativa em 2025 cobre esse regime."],
      ["Explicabilidade", "Contribuições no estilo SHAP geram a importância global e os três fatores de cada pessoa; o playbook converte fator e nível em ação."],
      ["Publicação", "Predições, fatores, métricas, curvas e custo gravados em CSV, carregados no Supabase por script e copiados em JSON para o site."],
      ["Consumo", "O dashboard lê as views do Supabase quando configurado. O link público usa uma cópia estática dos mesmos resultados, sem publicar credenciais do banco."],
    ];
    const w = 1.9, gap = 0.14, yTopo = 1.85;
    let x = 0.6;
    for (let i = 0; i < passos.length; i++) {
      const [t, d] = passos[i];
      s.addShape(pres.ShapeType.ellipse, { x: x + w / 2 - 0.3, y: yTopo, w: 0.6, h: 0.6, fill: { color: i % 2 ? COR.teal : COR.ambar }, line: { color: COR.branco, width: 0 } });
      s.addText(String(i + 1), { x: x + w / 2 - 0.3, y: yTopo, w: 0.6, h: 0.6, fontFace: FONTE, fontSize: 18, bold: true, color: COR.branco, align: "center", valign: "middle", margin: 0, isTextBox: true });
      if (i < passos.length - 1) {
        s.addShape(pres.ShapeType.line, { x: x + w / 2 + 0.32, y: yTopo + 0.3, w: w + gap - 0.64, h: 0, line: { color: COR.ardosia, width: 1.5, endArrowType: "triangle" } });
      }
      cartao(s, { x, y: yTopo + 0.75, w, h: 3.2, fundo: COR.branco });
      s.addText(t, { x: x + 0.12, y: yTopo + 0.83, w: w - 0.24, h: 0.42, fontFace: FONTE, fontSize: 14, bold: true, color: COR.navy, margin: 0, valign: "middle", isTextBox: true });
      s.addText(d, { x: x + 0.12, y: yTopo + 1.27, w: w - 0.24, h: 2.6, fontFace: FONTE, fontSize: 12.5, color: COR.tinta, margin: 0, valign: "top", isTextBox: true });
      x += w + gap;
    }
    cartao(s, { x: 0.6, y: 6.0, w: 12.1, h: 0.82, fundo: COR.navy, borda: COR.navy });
    s.addText([
      { text: "Dois caminhos de leitura, os mesmos resultados: ", options: { bold: true, color: COR.ambar } },
      { text: "o link público lê a cópia JSON, sem credenciais; a execução local com .env lê as views do Supabase.", options: { color: COR.branco } },
    ], { x: 0.9, y: 6.04, w: 11.5, h: 0.74, fontFace: FONTE, fontSize: 15, margin: 0, valign: "middle", isTextBox: true });
    notas(s, "Fluxo: entrada, preparação com checkpoint de 30 dias, treino e avaliação, explicabilidade, publicação e consumo. O link público roda com a cópia JSON; o banco é lido quando há .env local.");
  }

  // ---------------- Tecnologias ----------------
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Arquitetura" });
    tituloComSub(s, "Ferramentas abertas, gratuitas e portáveis", "Tecnologias e componentes previstos; as escolhas podem ser revistas na Sprint 2");
    const cab = (t) => ({ text: t, options: { bold: true, color: COR.branco, fill: { color: COR.navy } } });
    const linhas = [
      [cab("Etapa"), cab("Tecnologia / componente"), cab("Função no projeto")],
      ["Dados", "Python 3.12, pandas, numpy", "Geração da base sintética, limpeza, construção de variáveis e alvos"],
      ["Modelagem", "scikit-learn, XGBoost", "Regressão logística, random forest, gradient boosting e XGBoost; validação temporal e cruzada"],
      ["Explicabilidade", "Contribuições lineares; SHAP para árvores", "Importância global e contribuições individuais (3 fatores por colaborador)"],
      ["Análises complementares", "lifelines, pandas", "Curva de sobrevivência Kaplan-Meier, tendência mensal, custo do turnover, auditoria de viés"],
      ["Exploração", "Jupyter Notebook", "Análise exploratória e documentação das etapas com saídas gravadas"],
      ["Armazenamento e API", "Supabase (Postgres 17, PostgREST, RLS)", "Tabelas rr_* com RLS e views rr_vw_*, lidas pelo dashboard na execução local"],
      ["Dashboard", "Vite, React 18, TypeScript, Recharts, supabase-js", "Seis páginas e simulador no navegador; lê o Supabase ou a cópia JSON dos resultados"],
      ["Publicação", "GitHub (repositório) e GitHub Pages (CI)", "Código-fonte versionado e site público com a cópia JSON, sem credenciais"],
    ];
    s.addTable(linhas, { x: 0.6, y: 1.85, w: 12.1, colW: [2.3, 3.9, 5.9], rowH: 0.46, fontFace: FONTE, fontSize: 12.5, color: COR.tinta, border: { type: "solid", pt: 0.5, color: COR.linha }, fill: { color: COR.branco }, valign: "middle", margin: 0.08 });
    notas(s, "Tecnologias por etapa, com a função de cada uma. Todas abertas ou gratuitas; a arquitetura é portável para qualquer Postgres e qualquer hospedagem estática.");
  }

  // ---------------- Abordagem analítica ----------------
  pres.addSection({ title: "Protótipo" });
  {
    const s = pres.addSlide({ masterName: "SECAO", sectionTitle: "Protótipo" });
    s.addText("Protótipo funcional", { placeholder: "titulo" });
    s.addText("Abordagem analítica e telas do MVP já em funcionamento", { placeholder: "subtitulo" });
  }
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Protótipo" });
    tituloComSub(s, `Os 20% de maior risco concentram ${fmtPct(recall90)} das saídas em 90 dias`, "Abordagem analítica e resultados preliminares, na base sintética; os números serão recalibrados com os dados da Ri Happy");
    s.addText(paragrafos([
      "Checkpoint no dia 30 de casa; alvos: saída voluntária até 90 e até 180 dias",
      "Variáveis: contrato, cargo, salário, distância, canal, turno, admissão em pico, experiência prévia em varejo, integração concluída, treinamento, avaliação de 30 dias, faltas, atrasos, tempo do gestor no cargo e indicador de turnover da loja",
      "Atributos protegidos fora do modelo; faixa etária só na auditoria de viés",
      "Treino até 2025, teste em 2026 (sem admissões de pico) e validação cruzada de 5 folds; validação retroativa em 2025 cobre os picos",
      "Seleção por AUC-ROC com regra de parcimônia",
    ], { espaco: 4 }), { x: 0.6, y: 1.85, w: 5.6, h: 2.95, fontFace: FONTE, fontSize: 12.5, color: COR.tinta, margin: 0, valign: "top", isTextBox: true });
    estatistica(s, { x: 0.6, y: 4.85, w: 2.7, h: 1.3, valor: fmtNum(auc90, 3), rotulo: `AUC-ROC 90 dias (${NOME_MODELO[sel90] || "modelo selecionado"})`, cor: COR.teal, tamValor: 28 });
    estatistica(s, { x: 3.5, y: 4.85, w: 2.7, h: 1.3, valor: fmtNum(auc180, 3), rotulo: `AUC-ROC 180 dias (${NOME_MODELO[sel180] || "modelo selecionado"})`, cor: COR.teal, tamValor: 28 });
    s.addText("Fatores e AUC validam o método: os efeitos foram parametrizados na base sintética e não são achados sobre a Ri Happy.", { x: 0.6, y: 6.25, w: 5.6, h: 0.6, fontFace: FONTE, fontSize: 12, bold: true, color: COR.coral, margin: 0, valign: "top", isTextBox: true });
    const modelosOrdem = ["regressao_logistica", "random_forest", "gradient_boosting", "xgboost"].filter((m) => metrica("90d", m, "auc_roc") != null);
    if (modelosOrdem.length) {
      s.addChart(pres.ChartType.bar, [
        { name: "AUC-ROC 90 dias", labels: modelosOrdem.map((m) => NOME_MODELO[m]), values: modelosOrdem.map((m) => Number(metrica("90d", m, "auc_roc").toFixed(3))) },
        { name: "AUC-ROC 180 dias", labels: modelosOrdem.map((m) => NOME_MODELO[m]), values: modelosOrdem.map((m) => Number((metrica("180d", m, "auc_roc") || 0).toFixed(3))) },
      ], {
        x: 6.5, y: 1.85, w: 6.2, h: 2.5, barDir: "col", barGrouping: "clustered", chartColors: [COR.ambar, COR.navy],
        showTitle: true, title: "Comparação dos modelos no teste temporal (AUC-ROC)", titleFontSize: 11, titleColor: COR.navy, titleFontFace: "+mn-lt",
        showLegend: true, legendPos: "b", legendFontSize: 9, legendFontFace: "+mn-lt", legendColor: COR.ardosia,
        showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 9, dataLabelColor: COR.tinta, dataLabelFontFace: "+mn-lt", dataLabelFormatCode: "0.000",
        valAxisMinVal: 0.5, valAxisMaxVal: 1.0, valAxisLabelFontSize: 9, valAxisLabelColor: COR.ardosia, valAxisLabelFontFace: "+mn-lt", catAxisLabelFontSize: 9, catAxisLabelColor: COR.ardosia, catAxisLabelFontFace: "+mn-lt",
        valGridLine: { color: COR.linha, size: 0.5 }, catGridLine: { style: "none" },
      });
    }
    const top = fatores.filter((f) => f.horizonte === "90d").sort((a, b) => Number(a.posicao) - Number(b.posicao)).slice(0, 8);
    if (top.length) {
      const seta = { aumenta: "↑", reduz: "↓", misto: "↕" };
      s.addChart(pres.ChartType.bar, [
        { name: "Importância (média da contribuição absoluta)", labels: top.map((f) => `${f.rotulo} ${seta[f.direcao] || ""}`).reverse(), values: top.map((f) => Number(Number(f.importancia).toFixed(4))).reverse() },
      ], {
        x: 6.5, y: 4.45, w: 6.2, h: 2.45, barDir: "bar", chartColors: [COR.teal],
        showTitle: true, title: "Fatores de maior peso em 90 dias (↑ aumenta, ↓ reduz, ↕ depende da categoria)", titleFontSize: 11, titleColor: COR.navy, titleFontFace: "+mn-lt",
        showLegend: false, showValue: false,
        valAxisLabelFontSize: 8, valAxisLabelColor: COR.ardosia, valAxisLabelFontFace: "+mn-lt", catAxisLabelFontSize: 9, catAxisLabelColor: COR.tinta, catAxisLabelFontFace: "+mn-lt",
        valGridLine: { color: COR.linha, size: 0.5 }, catGridLine: { style: "none" },
      });
    }
    notas(s, "Abordagem: checkpoint de 30 dias, dois alvos, variáveis disponíveis até o checkpoint, divisão temporal e validação cruzada, seleção por AUC e explicação por contribuições. Os resultados são preliminares e validam o método sobre a base sintética.");
  }

  // ---------------- Protótipos (telas) ----------------
  const totalTelas = 6;
  const tituloTela = (n, t) => t;
  const subTela = (n) => `Protótipos iniciais: tela ${n} de ${totalTelas} do dashboard funcional (base sintética)`;

  // 1. Visão geral: dois recortes
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Protótipo" });
    tituloComSub(s, tituloTela(1, "Visão geral: indicadores e tendência em uma tela"), subTela(1));
    const a = await captura(s, "tela_kpis", { x: 0.6, y: 1.85, w: 7.0, h: 3.3, alt: "Oito cartões de indicadores: headcount, ativos em janela, risco alto ou crítico, taxas de saída, desligamentos, custo e novos sem checkpoint" });
    await captura(s, "tela_tendencia", { x: 7.85, y: 1.85, w: 4.85, h: 5.0, alt: "Gráfico de tendência mensal com admissões, saídas voluntárias e taxa de turnover, com faixas de Dia das Crianças e Natal" });
    s.addText([
      { text: "O que se vê: ", options: { bold: true, color: COR.navy } },
      { text: "oito indicadores da situação atual e dos últimos 12 meses e, à direita, admissões, saídas voluntárias e taxa de turnover nos últimos 24 meses, com os picos de Dia das Crianças e Natal por cor." },
    ], { x: 0.6, y: 1.85 + a.h + 0.2, w: 7.0, h: 1.5, fontFace: FONTE, fontSize: 14, color: COR.tinta, margin: 0, valign: "top", isTextBox: true });
    notas(s, "Visão geral com os indicadores executivos e a tendência mensal.");
  }
  // 2. Mapa de risco
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Protótipo" });
    tituloComSub(s, tituloTela(2, "Mapa de risco: onde agir preventivamente"), subTela(2));
    const a = await captura(s, "tela_mapa_risco", { x: 0.6, y: 1.85, w: 8.1, h: 5.0, alt: "Tabela de lojas ordenada por percentual de colaboradores em risco alto ou crítico, com filtros de região, bandeira e tipo de loja" });
    legendaLateral(s, a, "Como funciona", ["Lojas ordenadas por % de colaboradores em risco alto ou crítico", "A célula mostra o percentual e a contagem, como 4 de 8", "Lojas com menos de 5 pessoas em janela ficam sem cor, pois o percentual é instável", "Filtros por região, bandeira e tipo de loja"]);
    notas(s, "Mapa de risco por loja, que orienta onde agir antes dos picos.");
  }
  // 3. Colaboradores: lista e detalhe
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Protótipo" });
    tituloComSub(s, tituloTela(3, "Colaboradores em risco: o que exige atenção imediata"), subTela(3));
    const a = await captura(s, "tela_colaboradores_lista", { x: 0.6, y: 1.85, w: 7.25, h: 4.0, alt: "Lista priorizada de colaboradores com nível, risco vigente, dias de casa e riscos estimados no dia 30" });
    await captura(s, "tela_colaboradores", { x: 8.05, y: 1.85, w: 4.65, h: 4.0, alt: "Painel de detalhe de um colaborador com aviso de uso responsável, riscos, nível e fatores explicativos" });
    s.addText([
      { text: "O que se vê: ", options: { bold: true, color: COR.navy } },
      { text: "à esquerda, a lista priorizada por risco vigente, com nível e tempo de casa. À direita, o detalhe de uma pessoa, com o aviso de uso responsável, os riscos e os fatores explicativos." },
    ], { x: 0.6, y: 1.85 + Math.max(a.h, 4.0) + 0.15, w: 12.1, h: 0.85, fontFace: FONTE, fontSize: 14, color: COR.tinta, margin: 0, valign: "top", isTextBox: true });
    notas(s, "Lista priorizada e painel de detalhe. O aviso ético aparece em cada detalhe individual.");
  }
  // 4. Fatores e modelo
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Protótipo" });
    tituloComSub(s, tituloTela(4, "Fatores e modelo: a auditoria de viés fica à vista"), subTela(4));
    const a = await captura(s, "tela_fatores_modelo", { x: 0.6, y: 1.85, w: 8.1, h: 5.0, alt: "Tabela da auditoria de viés por faixa etária e região, com taxa real, risco previsto, diferença, AUC e percentual de alto risco" });
    legendaLateral(s, a, "Como funciona", ["Compara taxa real e risco previsto por faixa etária, região e escolaridade", "A coluna Diferença aponta descalibração por grupo", "A mesma página traz importância dos fatores, efeito por categoria, métricas dos modelos e limitações"]);
    notas(s, "Recorte da auditoria de viés na página Fatores e Modelo.");
  }
  // 5. Simulador
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Protótipo" });
    tituloComSub(s, tituloTela(5, "Simulador what-if: calibrar contratação e integração"), subTela(5));
    const a = await captura(s, "tela_simulador", { x: 0.6, y: 1.85, w: 8.1, h: 5.0, alt: "Simulador com campos do colaborador e resultado de risco em 90 e 180 dias com nível de risco" });
    legendaLateral(s, a, "Como funciona", ["Altere contrato, distância, integração, avaliação ou turno", "O risco de 90 e 180 dias é recalculado no navegador", "Mais abaixo, a tela lista as maiores contribuições e só sugere ações cujo gatilho é atendido"]);
    notas(s, "Simulador calculado no navegador com os coeficientes do modelo.");
  }
  // 6. Recomendações e ética
  {
    const s = pres.addSlide({ masterName: "CONTEUDO_CLARO", sectionTitle: "Protótipo" });
    tituloComSub(s, tituloTela(6, "Recomendações e ética: do dado à ação"), subTela(6));
    const a = await captura(s, "tela_recomendacoes_etica", { x: 0.6, y: 1.85, w: 8.1, h: 5.0, alt: "Playbook de retenção por nível de risco e por fator, com ação, responsável e prazo" });
    legendaLateral(s, a, "Como funciona", ["Playbook com ação, responsável e prazo por nível e por fator", "Na mesma página: custo editável, simulação da economia e princípios de LGPD e uso responsável"]);
    notas(s, "Playbook de retenção. A página também traz a simulação de economia e os princípios de uso responsável.");
  }

  // ---------------- Próximos passos ----------------
  pres.addSection({ title: "Encerramento" });
  {
    const s = pres.addSlide({ masterName: "CONTEUDO", sectionTitle: "Encerramento" });
    tituloComSub(s, "Para a Sprint 2: validar o método com os dados reais", "Próximos passos, do protótipo com base sintética ao MVP validado com os dados da Ri Happy");
    const passos = [
      ["FiDatabase", "Dados reais", "Incorporar a base de RH da Ri Happy, mapear para o dicionário de dados e refazer a exploração."],
      ["FiRefreshCw", "Recalibrar o modelo", "Re-treinar, revisar variáveis, limiares de nível e auditoria de viés; registrar limitações."],
      ["FiBell", "Alertas e ciclo fechado", "Alertas para líderes em casos altos e críticos e registro das ações realizadas para medir o efeito."],
      ["FiGlobe", "Benchmark e custo", "Comparar os indicadores com referências públicas do varejo e validar os parâmetros de custo."],
      ["FiVideo", "Vídeo pitch e entrega final", "Demonstração hands-on do MVP, apresentação atualizada, repositório e README."],
    ];
    const w = 2.3, gap = 0.15;
    let x = 0.6;
    for (let i = 0; i < passos.length; i++) {
      const [ic, t, d] = passos[i];
      await cartaoIcone(s, { x, y: 1.85, w, h: 2.75, icone: ic, titulo: `${i + 1}. ${t}`, texto: d, tamTitulo: 13, tamTexto: 12, corIcone: i % 2 ? COR.teal : COR.ambar });
      x += w + gap;
    }
    cartao(s, { x: 0.6, y: 4.75, w: 12.1, h: 1.0, fundo: COR.navy, borda: COR.navy });
    s.addText([
      { text: "Entregue nesta Sprint 1: ", options: { bold: true, color: COR.ambar } },
      { text: "proposta e arquitetura, pipeline de dados e modelo reprodutível, banco Supabase com tabelas e views, dashboard funcional com seis páginas e documentação técnica (README).", options: { color: COR.branco } },
    ], { x: 0.9, y: 4.8, w: 11.5, h: 0.9, fontFace: FONTE, fontSize: 14, margin: 0, valign: "middle", isTextBox: true });
    cartao(s, { x: 0.6, y: 5.85, w: 12.1, h: 1.0, fundo: COR.nevoa, borda: COR.linha, comSombra: false });
    s.addText([
      { text: "Pedidos à Ri Happy: ", options: { bold: true, color: COR.navy } },
      { text: "confirmar a base de RH pseudonimizada e seu dicionário, validar os parâmetros de custo e a meta de redução, e indicar quem de Gente & Gestão revisa a auditoria de viés.", options: { color: COR.tinta } },
    ], { x: 0.9, y: 5.9, w: 11.5, h: 0.9, fontFace: FONTE, fontSize: 14, margin: 0, valign: "middle", isTextBox: true });
    notas(s, "Próximos passos: dados reais, recalibração, alertas e ciclo fechado, benchmark e custo validados, vídeo pitch e entrega final da Sprint 2. O que se pede à Ri Happy para avançar.");
  }

  // ---------------- Encerramento ----------------
  {
    const s = pres.addSlide({ masterName: "CAPA", sectionTitle: "Encerramento" });
    s.addText("Obrigado", { placeholder: "titulo" });
    s.addText("O método funciona na base sintética; o próximo passo é validá-lo com os dados da Ri Happy", { placeholder: "subtitulo" });
    const { repositorio, dashboard } = lerLinks();
    const link = (rotulo, url) => [
      { text: `${rotulo}: `, options: { color: COR.branco } },
      { text: url, options: { color: COR.ambar, hyperlink: { url, tooltip: rotulo }, breakLine: true } },
    ];
    s.addText([
      { text: "Gabriel Alves Leon Rodriguez  ·  RM566648  ·  2TSCOR", options: { color: COR.branco, breakLine: true } },
      { text: "Agradecimentos: Ri Happy e FIAP pelo desafio; tutor e scrum master do Challenge pelo acompanhamento.", options: { color: COR.claro, breakLine: true } },
      ...(repositorio ? link("Repositório", repositorio) : []),
      ...(dashboard ? link("Dashboard (dados sintéticos, sem login)", dashboard) : []),
    ], { x: 0.8, y: 5.0, w: 11.8, h: 1.9, fontFace: FONTE, fontSize: 14, margin: 0, valign: "top", paraSpaceAfter: 4, isTextBox: true });
    notas(s, "Encerramento e agradecimentos. Links do repositório e do dashboard.");
  }
}

function lerLinks() {
  // links.txt (na raiz) alimenta os links do slide final, se existir
  const arquivo = path.join(RAIZ, "links.txt");
  if (!fs.existsSync(arquivo)) return {};
  const urls = fs.readFileSync(arquivo, "utf8").match(/https?:\/\/\S+/g) || [];
  return { repositorio: urls.find((u) => u.includes("github.com")), dashboard: urls.find((u) => u.includes("github.io")) };
}

async function aplicarPaleta(arquivo, paleta) {
  // Grava a paleta do projeto no tema do arquivo (ppt/theme/theme1.xml) para que as
  // "cores do tema" no PowerPoint correspondam às cores usadas nos slides.
  const JSZip = require(require.resolve("jszip", { paths: [require.resolve("pptxgenjs")] }));
  const zip = await JSZip.loadAsync(fs.readFileSync(arquivo));
  const parte = "ppt/theme/theme1.xml";
  const xml = await zip.file(parte).async("string");
  const ordem = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
  const esquema = `<a:clrScheme name="RadarRetencao">${ordem.map((k) => `<a:${k}><a:srgbClr val="${paleta[k]}"/></a:${k}>`).join("")}</a:clrScheme>`;
  zip.file(parte, xml.replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, () => esquema));
  // Regrava sem entradas de pasta, que atrapalham a abertura do arquivo em alguns serviços de nuvem.
  const limpo = new JSZip();
  for (const nome of Object.keys(zip.files)) {
    if (!zip.files[nome].dir) limpo.file(nome, await zip.files[nome].async("nodebuffer"), { createFolders: false });
  }
  fs.writeFileSync(arquivo, await limpo.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

construir()
  .then(() => pres.writeFile({ fileName: SAIDA }))
  .then(() => aplicarPaleta(SAIDA, PALETA_TEMA))
  .then(() => console.log(`Apresentação gerada: ${SAIDA}`))
  .catch((e) => { console.error(e); process.exit(1); });
