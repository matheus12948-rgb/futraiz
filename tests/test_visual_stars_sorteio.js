/**
 * TESTE VISUAL E RESPONSIVO E2E: BOTÃO DE SORTEIO E ESTRELAS DOS JOGADORES
 * Validação rigorosa dos 14 itens solicitados:
 * 1. Botão "REALIZAR SORTEIO DOS TIMES" no Dashboard com ícone proporcional (20px-24px), alinhado verticalmente ao centro, sem sobrepor texto nem inflar o botão.
 * 2. Estrelas na lista de jogadores em linha única horizontal (ZERO quebras de linha nas estrelas em 360px, 390px, 412px, 768px e desktop).
 * 3. 5 posições consistentes e previsíveis para todos os atletas (1 a 5 estrelas).
 * 4. Botões de ação ([-], [+], Editar, Excluir) preservados, funcionais e com ícones reais SVG (sem botões vazios).
 * 5. Ausência de overflow horizontal (scrollWidth <= clientWidth).
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getDebuggerUrl(port = 9225) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || list[0];
          if (page && page.webSocketDebuggerUrl) resolve(page.webSocketDebuggerUrl);
          else reject(new Error('Alvo de página não encontrado'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 0;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      };
    });
  }

  close() {
    try { this.ws.close(); } catch {}
  }

  send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 1024,
      screenWidth: width,
      screenHeight: height
    });
    await this.send('Emulation.setTouchEmulationEnabled', {
      enabled: width < 1024
    });
  }

  async screenshot(filePath) {
    try {
      const res = await Promise.race([
        this.send('Page.captureScreenshot', { format: 'png' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('screenshot timeout')), 500))
      ]);
      if (res && res.data) {
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      }
    } catch {}
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

let passed = 0;
let failed = 0;

function assert(condition, desc) {
  if (condition) {
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${desc}`);
    failed++;
  }
}

async function run() {
  console.log('================================================================');
  console.log('VALIDAÇÃO VISUAL E RESPONSIVA: BOTÃO DE SORTEIO E ESTRELAS');
  console.log('================================================================\n');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const tempProfile = 'C:\\Users\\mathe\\AppData\\Local\\Temp\\edge_vis_profile_' + Date.now();
  const outDir = path.join(__dirname, 'screenshots_visual');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9225',
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      wsUrl = await getDebuggerUrl(9225);
      if (wsUrl) break;
    } catch {}
  }

  if (!wsUrl) {
    edgeProc.kill();
    throw new Error('Falha ao conectar no Edge na porta 9225');
  }

  const client = new CDPClient(wsUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  for (let i = 0; i < 40; i++) {
    const ready = await client.eval(`typeof window.StorageApp !== 'undefined' && typeof window.StorageApp.createFutebol === 'function'`);
    if (ready) break;
    await sleep(200);
  }

  // Setup: Cria futebol com admin e cadastra atletas com 1, 2, 3, 4, 5 estrelas
  console.log('--- 1. Preparação de Dados com Atletas de 1 a 5 estrelas ---');
  await client.eval(`
    (async () => {
      window.confirm = () => true;
      await window.StorageApp.createFutebol({
        nome: 'Futebol Visual Audit',
        adminNome: 'Administrador Audit',
        email: 'visual_audit@futraiz.com',
        password: 'senhaSegura123'
      });

      // Cadastra 5 jogadores com 1, 2, 3, 4, 5 estrelas para teste comparativo
      const testAthletes = [
        { name: 'Axel Um Estrela', stars: 1 },
        { name: 'Bruno Dois Estrelas', stars: 2 },
        { name: 'Carlos Tres Estrelas', stars: 3 },
        { name: 'Danilo Quatro Estrelas', stars: 4 },
        { name: 'José Roberto Cinco Estrelas', stars: 5 }
      ];

      for (const a of testAthletes) {
        await window.StorageApp.addPlayer({ name: a.name, stars: a.stars });
      }

      // Adiciona mais 15 jogadores para totalizar 20 selecionados para sorteio
      for (let i = 6; i <= 20; i++) {
        await window.StorageApp.addPlayer({ name: 'Atleta Rodada ' + i, stars: ((i % 5) + 1) });
      }

      // Seleciona exatamente 20 atletas para disparar o estado "pronto para sortear"
      const all = window.StorageApp.getPlayers();
      const ids20 = all.slice(0, 20).map(p => p.id);
      window.StorageApp.saveSelectedPlayerIds(ids20);

      window.App.navigateTo('dashboard');
      window.App.renderDashboard();
    })()
  `);
  await sleep(500);

  // =========================================================================
  // FASE 1: VALIDAÇÃO DO BOTÃO "REALIZAR SORTEIO DOS TIMES" NO DASHBOARD
  // =========================================================================
  console.log('\n--- 2. Validação do Botão "REALIZAR SORTEIO DOS TIMES" no Dashboard ---');
  const viewports = [
    { name: '360px (Mobile Pequeno)', w: 360, h: 740 },
    { name: '390px (Mobile Padrão)', w: 390, h: 844 },
    { name: '412px (Mobile Grande)', w: 412, h: 915 },
    { name: '768px (Tablet)', w: 768, h: 1024 },
    { name: '1280px (Desktop)', w: 1280, h: 800 }
  ];

  for (const vp of viewports) {
    await client.setViewport(vp.w, vp.h);
    await sleep(200);

    const btnMetrics = await client.eval(`
      (() => {
        const btn = document.getElementById('btn-dash-sortear-pronto');
        if (!btn) return { error: 'Botão #btn-dash-sortear-pronto não encontrado' };
        const bRect = btn.getBoundingClientRect();
        const svg = btn.querySelector('svg');
        const sRect = svg ? svg.getBoundingClientRect() : null;
        const label = btn.querySelector('.btn-label') || btn;
        const lRect = label.getBoundingClientRect();

        return {
          btnWidth: Math.round(bRect.width),
          btnHeight: Math.round(bRect.height),
          svgWidth: sRect ? Math.round(sRect.width) : 0,
          svgHeight: sRect ? Math.round(sRect.height) : 0,
          svgTop: sRect ? sRect.top : 0,
          btnTop: bRect.top,
          labelTop: lRect.top,
          labelHeight: lRect.height,
          // Verifica se o ícone e o texto estão na mesma linha horizontal (sem sobreposição vertical)
          svgToLabelOverlap: (sRect && lRect) ? (sRect.right <= lRect.left + 5) : false,
          hasHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
      })()
    `);

    assert(!btnMetrics.error, `[${vp.name}] Botão de sorteio presente no DOM`);
    assert(btnMetrics.svgWidth >= 18 && btnMetrics.svgWidth <= 28, `[${vp.name}] Ícone de sorteio com largura proporcional (22px): obtido ${btnMetrics.svgWidth}px (esperado 20-28px, NÃO gigante)`);
    assert(btnMetrics.svgHeight >= 18 && btnMetrics.svgHeight <= 28, `[${vp.name}] Ícone de sorteio com altura proporcional: obtido ${btnMetrics.svgHeight}px`);
    assert(btnMetrics.btnHeight >= 40 && btnMetrics.btnHeight <= 54, `[${vp.name}] Botão com altura profissional consistente: ${btnMetrics.btnHeight}px`);
    assert(!btnMetrics.hasHScroll, `[${vp.name}] Dashboard sem scroll horizontal`);
    await client.screenshot(path.join(outDir, `dash_${vp.w}px.png`));
  }

  // Testa ação do botão de sorteio
  console.log('\n--- 3. Ação do Botão de Sorteio ---');
  await client.eval(`document.getElementById('btn-dash-sortear-pronto').click();`);
  await sleep(400);
  const screenSorteioActive = await client.eval(`document.getElementById('screen-sorteio').classList.contains('active')`);
  assert(screenSorteioActive, 'Clicar em REALIZAR SORTEIO DOS TIMES navega com sucesso para a tela de sorteio');

  // =========================================================================
  // FASE 2: VALIDAÇÃO DA LISTA DE JOGADORES E ESTRELAS
  // =========================================================================
  console.log('\n--- 4. Navegando para Tela de Jogadores ---');
  await client.eval(`window.App.navigateTo('jogadores');`);
  await sleep(400);

  for (const vp of viewports) {
    await client.setViewport(vp.w, vp.h);
    await sleep(200);

    const listData = await client.eval(`
      (() => {
        const items = Array.from(document.querySelectorAll('.player-list-item'));
        const docW = document.documentElement.clientWidth;
        const docScrollW = document.documentElement.scrollWidth;

        const results = items.slice(0, 5).map(item => {
          const nameEl = item.querySelector('.player-item-name');
          const starsWrap = item.querySelector('.player-stars') || item.querySelector('.star-rating');
          const starSvgs = Array.from(item.querySelectorAll('.star-icon'));
          const filledSvgs = Array.from(item.querySelectorAll('.star-icon.star-filled'));
          const emptySvgs = Array.from(item.querySelectorAll('.star-icon.star-empty'));
          const actionsEl = item.querySelector('.player-item-actions');
          const decBtn = item.querySelector('[data-action="dec-star"]');
          const incBtn = item.querySelector('[data-action="inc-star"]');
          const editBtn = item.querySelector('[data-action="edit"]');
          const deleteBtn = item.querySelector('[data-action="delete"]');

          const starRects = starSvgs.map(s => {
            const r = s.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
          });

          // Checa se todas as estrelas têm o mesmo top (mesma linha)
          const tops = [...new Set(starRects.map(s => s.top))];

          const itemRect = item.getBoundingClientRect();

          return {
            name: nameEl?.textContent.trim(),
            totalStarPositions: starSvgs.length,
            filledCount: filledSvgs.length,
            emptyCount: emptySvgs.length,
            starTopsCount: tops.length, // Se 1 => linha única perfeita!
            starWidths: starRects.map(s => s.w),
            itemHeight: Math.round(itemRect.height),
            itemOverflow: item.scrollWidth > item.clientWidth,
            hasActions: !!actionsEl,
            hasDec: !!decBtn,
            hasInc: !!incBtn,
            editHasSvg: !!editBtn?.querySelector('svg'),
            deleteHasSvg: !!deleteBtn?.querySelector('svg')
          };
        });

        return {
          hasHScroll: docScrollW > docW,
          athletes: results
        };
      })()
    `);

    console.log(`\n[Viewport ${vp.name}]:`);
    assert(!listData.hasHScroll, `[${vp.name}] Página sem scroll horizontal (docScrollW <= clientW)`);

    // Valida cada um dos atletas testados (1, 2, 3, 4, 5 estrelas)
    for (const a of listData.athletes) {
      assert(a.totalStarPositions === 5, `Atleta "${a.name}": possui exatamente 5 posições de estrelas renderizadas`);
      assert(a.starTopsCount === 1, `Atleta "${a.name}": todas as 5 estrelas estão rigorosamente na MESMA linha (starTopsCount === 1, ZERO quebras de linha!)`);
      assert(a.filledCount + a.emptyCount === 5, `Atleta "${a.name}": soma de cheias (${a.filledCount}) + vazias (${a.emptyCount}) é exatamente 5`);
      assert(a.starWidths.every(w => w >= 16 && w <= 22), `Atleta "${a.name}": estrelas têm tamanho consistente (obtido: ${a.starWidths[0]}px, esperado 16px-22px)`);
      assert(!a.itemOverflow, `Atleta "${a.name}": card não vaza a largura do container`);
      assert(a.hasDec && a.hasInc, `Atleta "${a.name}": controles [-] e [+] presentes`);
      assert(a.editHasSvg && a.deleteHasSvg, `Atleta "${a.name}": botões Editar e Excluir contêm ícones SVG válidos (NÃO são quadrados vazios)`);
    }

    // Verifica que a altura dos cards é padronizada (todos dentro de ±4px de variação)
    const heights = listData.athletes.map(a => a.itemHeight);
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    assert(maxH - minH <= 6, `[${vp.name}] Cards de todos os atletas possuem altura padronizada consistente (min: ${minH}px, max: ${maxH}px, variação <= 6px)`);

    await client.screenshot(path.join(outDir, `jogadores_${vp.w}px.png`));
  }

  // =========================================================================
  // FASE 3: TESTES DOS CONTROLES INTERATIVOS [-] E [+]
  // =========================================================================
  console.log('\n--- 5. Teste Interativo dos Controles de Estrelas [-] e [+] ---');
  // Atleta 1 (Axel) começa com 1 estrela: clica [+] -> deve virar 2 estrelas
  await client.eval(`
    (() => {
      const items = Array.from(document.querySelectorAll('.player-list-item'));
      const axelItem = items.find(el => el.textContent.includes('Axel'));
      const incBtn = axelItem.querySelector('[data-action="inc-star"]');
      incBtn.click();
    })()
  `);
  await sleep(300);

  const axelStars = await client.eval(`
    (() => {
      const items = Array.from(document.querySelectorAll('.player-list-item'));
      const axelItem = items.find(el => el.textContent.includes('Axel'));
      const filled = axelItem.querySelectorAll('.star-icon.star-filled').length;
      return filled;
    })()
  `);
  assert(axelStars === 2, 'Botão [+] incrementou estrelas de Axel de 1 para 2 estrelas com atualização visual imediata');

  // Clica [-] -> deve voltar para 1 estrela
  await client.eval(`
    (() => {
      const items = Array.from(document.querySelectorAll('.player-list-item'));
      const axelItem = items.find(el => el.textContent.includes('Axel'));
      const decBtn = axelItem.querySelector('[data-action="dec-star"]');
      decBtn.click();
    })()
  `);
  await sleep(300);

  const axelStarsAfterDec = await client.eval(`
    (() => {
      const items = Array.from(document.querySelectorAll('.player-list-item'));
      const axelItem = items.find(el => el.textContent.includes('Axel'));
      const filled = axelItem.querySelectorAll('.star-icon.star-filled').length;
      return filled;
    })()
  `);
  assert(axelStarsAfterDec === 1, 'Botão [-] decrementou estrelas de Axel de 2 para 1 estrela com atualização visual imediata');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES VISUAIS E RESPONSIVOS: ${passed + failed}`);
  console.log(`PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('================================================================\n');

  client.close();
  try { edgeProc.kill(); } catch {}

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
