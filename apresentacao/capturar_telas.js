/**
 * Captura recortes legíveis das telas do dashboard para docs/img, usados nos slides de protótipo.
 *
 * Uso: com o dashboard servido (ex.: `npm run preview -- --port 4173` em ../dashboard),
 *      node capturar_telas.js [URL_BASE]
 * Padrão: http://localhost:4173/
 *
 * Usa o Google Chrome ou o Microsoft Edge já instalados (puppeteer-core), sem baixar navegador.
 * Para outro executável, defina a variável de ambiente NAVEGADOR.
 */
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const URL_BASE = process.argv[2] || process.env.URL_DASHBOARD || "http://localhost:4173/";
const PASTA_SAIDA = path.resolve(__dirname, "..", "docs", "img");

const CANDIDATOS_NAVEGADOR = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

// Aba, arquivo, seletores que delimitam o recorte, altura máxima do recorte e ação antes da captura.
const LARGURA = 1000;
const ALTURA = 1000;
const TELAS = [
  { hash: "visao-geral", nome: "tela_kpis", recorte: ["#kpis"] },
  { hash: "visao-geral", nome: "tela_tendencia", recorte: ["#tendencia"] },
  { hash: "mapa-de-risco", nome: "tela_mapa_risco", recorte: ["#lojas"], alturaMaxima: 600 },
  { hash: "colaboradores", nome: "tela_colaboradores_lista", recorte: ["#lista-colaboradores"], alturaMaxima: 540 },
  { hash: "colaboradores", nome: "tela_colaboradores", recorte: [".painel"], abrirPrimeiraLinha: true, alturaMaxima: 600 },
  { hash: "fatores-e-modelo", nome: "tela_fatores_modelo", recorte: ["#vies"], alturaMaxima: 600 },
  { hash: "simulador", nome: "tela_simulador", recorte: [".simulador"], alturaMaxima: 600 },
  { hash: "recomendacoes-e-etica", nome: "tela_recomendacoes_etica", recorte: ["#playbook"], alturaMaxima: 600 },
];

function localizarNavegador() {
  if (process.env.NAVEGADOR) return process.env.NAVEGADOR;
  const encontrado = CANDIDATOS_NAVEGADOR.find((c) => fs.existsSync(c));
  if (!encontrado) throw new Error("Nenhum navegador Chromium encontrado. Defina NAVEGADOR=<caminho do executável>.");
  return encontrado;
}

async function caixaDoRecorte(page, seletores) {
  return page.evaluate((lista) => {
    const caixas = lista.map((s) => {
      const el = document.querySelector(s);
      if (!el) throw new Error(`Seletor não encontrado: ${s}`);
      return el.getBoundingClientRect();
    });
    const x = Math.min(...caixas.map((c) => c.left)) + window.scrollX;
    const y = Math.min(...caixas.map((c) => c.top)) + window.scrollY;
    const direita = Math.max(...caixas.map((c) => c.right)) + window.scrollX;
    const base = Math.max(...caixas.map((c) => c.bottom)) + window.scrollY;
    return { x, y, width: direita - x, height: base - y };
  }, seletores);
}

(async () => {
  fs.mkdirSync(PASTA_SAIDA, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: localizarNavegador(),
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
  });
  try {
    for (const tela of TELAS) {
      const page = await browser.newPage();
      await page.setViewport({ width: LARGURA, height: ALTURA, deviceScaleFactor: 2 });
      await page.goto(`${URL_BASE}#/${tela.hash}`, { waitUntil: "networkidle0", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1500));
      // Janela da altura da página: o recorte fica visível e os gráficos terminam de desenhar antes da captura.
      const alturaPagina = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewport({ width: LARGURA, height: Math.max(ALTURA, alturaPagina), deviceScaleFactor: 2 });
      await new Promise((r) => setTimeout(r, 2500));
      if (tela.abrirPrimeiraLinha) {
        await page.click(".linha-clicavel");
        await new Promise((r) => setTimeout(r, 800));
      }
      const caixa = await caixaDoRecorte(page, tela.recorte);
      if (tela.alturaMaxima) caixa.height = Math.min(caixa.height, tela.alturaMaxima);
      await page.screenshot({ path: path.join(PASTA_SAIDA, `${tela.nome}.png`), clip: caixa, captureBeyondViewport: false });
      console.log(`capturada: ${tela.nome} (${Math.round(caixa.width)} x ${Math.round(caixa.height)})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
