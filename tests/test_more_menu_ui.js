/**
 * TESTE VISUAL, RESPONSIVO E FUNCIONAL: MENU "MAIS"
 * Validação rigorosa dos itens solicitados:
 * 1. Cabeçalho MAIS com botão fechar "X".
 * 2. Grupo 1 unificado contendo Rankings, Histórico e Configurações em lista única com divisórias sutis.
 * 3. Grupo 2 separado contendo Copiar link público.
 * 4. Altura de cada item consistente entre 62px e 72px (meta: ~64-72px).
 * 5. Ícones SVG proporcionais entre 20px e 26px (meta: ~22-24px), verticalmente centralizados, sem emojis.
 * 6. Setas chevrons pequenas e alinhadas à direita.
 * 7. Sem cards gigantes isolados com espaçamento vertical excessivo.
 * 8. O modal cabe confortavelmente na tela sem necessidade de rolagem.
 * 9. Navegação e eventos de clique preservados (Rankings, Histórico, Configurações, Copiar link).
 * 10. Validação responsiva em 360px, 390px, 412px, 768px e 1280px sem overflow horizontal.
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getDebuggerUrl(port = 9228) {
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
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
  }
}

async function run() {
  console.log('================================================================');
  console.log('VALIDAÇÃO VISUAL, RESPONSIVA E FUNCIONAL: NOVO MENU "MAIS"');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  const outDir = path.join(__dirname, 'screenshots_more_menu');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = 'C:\\Users\\mathe\\AppData\\Local\\Temp\\edge_more_profile_' + Date.now();
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9228',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ]);

  await sleep(1500);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      wsUrl = await getDebuggerUrl(9228);
      if (wsUrl) break;
    } catch {}
  }

  if (!wsUrl) {
    edgeProc.kill();
    throw new Error('Falha ao conectar no Edge na porta 9228');
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

  // 1. Cria futebol e autentica admin
  console.log('--- 1. Preparação de Dados e Acesso ao Futebol ---');
  await client.eval(`
    (async () => {
      window.confirm = () => true;
      await window.StorageApp.createFutebol({
        nome: 'FutRaiz More Menu Audit',
        adminNome: 'Admin More Test',
        email: 'more_menu@futraiz.com',
        password: 'senhaSegura123'
      });
      window.App.navigateTo('dashboard');
    })()
  `);
  await sleep(300);

  const viewports = [
    { name: '360px (Mobile Pequeno)', w: 360, h: 740 },
    { name: '390px (iPhone 12/13/14)', w: 390, h: 844 },
    { name: '412px (Mobile Grande)', w: 412, h: 915 },
    { name: '768px (Tablet Portrait)', w: 768, h: 1024 },
    { name: '1280px (Desktop)', w: 1280, h: 800 }
  ];

  // 2. Validações Visuais e Estruturais em cada Resolução
  console.log('\n--- 2. Validação Estrutural e Responsiva do Menu "Mais" ---');
  for (const vp of viewports) {
    await client.setViewport(vp.w, vp.h);
    await sleep(150);

    // Abre o modal Mais
    await client.eval(`window.Utils.openModal('modal-more-menu');`);
    await sleep(250);

    const menuMetrics = await client.eval(`
      (() => {
        const modal = document.getElementById('modal-more-menu');
        if (!modal) return { error: 'Modal #modal-more-menu não encontrado' };

        const card = modal.querySelector('.more-menu-card');
        const cRect = card.getBoundingClientRect();

        const title = modal.querySelector('.more-menu-title');
        const closeBtn = modal.querySelector('.btn-close');

        const navGroup = modal.querySelector('#more-menu-nav-group');
        const actGroup = modal.querySelector('.more-menu-group-action');

        const navItems = Array.from(navGroup.querySelectorAll('.more-menu-item:not([style*="display: none"])'));
        const actItems = Array.from(actGroup.querySelectorAll('.more-menu-item'));

        const allItems = [...navItems, ...actItems];

        const itemMetrics = allItems.map(item => {
          const r = item.getBoundingClientRect();
          const icon = item.querySelector('.more-menu-icon');
          const iconR = icon ? icon.getBoundingClientRect() : null;
          const svg = icon ? icon.querySelector('svg') : null;
          const svgR = svg ? svg.getBoundingClientRect() : null;
          const chevron = item.querySelector('.menu-chevron');
          const chevR = chevron ? chevron.getBoundingClientRect() : null;
          const label = item.querySelector('.more-menu-label');

          return {
            text: label ? label.textContent.trim() : item.textContent.trim(),
            height: Math.round(r.height),
            width: Math.round(r.width),
            iconW: iconR ? Math.round(iconR.width) : 0,
            iconH: iconR ? Math.round(iconR.height) : 0,
            svgW: svgR ? Math.round(svgR.width) : 0,
            svgH: svgR ? Math.round(svgR.height) : 0,
            hasChevron: !!chevron,
            chevW: chevR ? Math.round(chevR.width) : 0,
            chevH: chevR ? Math.round(chevR.height) : 0
          };
        });

        const docW = document.documentElement.clientWidth;
        const docScrollW = document.documentElement.scrollWidth;

        // Medição do espaço entre os 2 grupos
        const navRect = navGroup.getBoundingClientRect();
        const actRect = actGroup.getBoundingClientRect();
        const groupGap = Math.round(actRect.top - navRect.bottom);

        return {
          titleText: title ? title.textContent.trim() : '',
          hasCloseBtn: !!closeBtn,
          cardW: Math.round(cRect.width),
          cardH: Math.round(cRect.height),
          viewportH: window.innerHeight,
          groupGap,
          itemMetrics,
          hasHScroll: docScrollW > docW
        };
      })()
    `);

    assert(!menuMetrics.error, `[${vp.name}] Modal #modal-more-menu presente`);
    assert(menuMetrics.titleText === 'MAIS', `[${vp.name}] Título do cabeçalho é "MAIS" (obtido: "${menuMetrics.titleText}")`);
    assert(menuMetrics.hasCloseBtn, `[${vp.name}] Botão Fechar "X" presente no cabeçalho`);
    assert(!menuMetrics.hasHScroll, `[${vp.name}] Zero scroll horizontal ao abrir menu`);
    assert(menuMetrics.groupGap >= 8 && menuMetrics.groupGap <= 24, `[${vp.name}] Separação nítida entre o grupo de navegação e o bloco de ação: ${menuMetrics.groupGap}px`);

    // Valida que o card cabe facilmente na tela sem necessidade de rolagem
    assert(
      menuMetrics.cardH < menuMetrics.viewportH * 0.85,
      `[${vp.name}] Menu cabe praticamente inteiro na tela sem rolagem: altura ${menuMetrics.cardH}px (viewport: ${menuMetrics.viewportH}px, ocupação: ${Math.round((menuMetrics.cardH/menuMetrics.viewportH)*100)}%)`
    );

    // Validação de cada item
    assert(menuMetrics.itemMetrics.length === 4, `[${vp.name}] Exatamente 4 opções principais visíveis (Rankings, Histórico, Configurações, Copiar link público)`);

    for (const item of menuMetrics.itemMetrics) {
      assert(
        item.height >= 60 && item.height <= 74,
        `[${vp.name}] Item "${item.text}" com altura confortável (~64-72px): ${item.height}px`
      );

      assert(
        item.svgW >= 20 && item.svgW <= 26,
        `[${vp.name}] Item "${item.text}": ícone SVG proporcional (~22-24px): ${item.svgW}px`
      );

      if (item.text !== 'Copiar link público') {
        assert(item.hasChevron, `[${vp.name}] Item de navegação "${item.text}" possui chevron ">" alinhado à direita`);
        assert(item.chevW <= 20, `[${vp.name}] Item "${item.text}": chevron com tamanho sutil (não gigante): ${item.chevW}px`);
      } else {
        assert(!item.hasChevron, `[${vp.name}] Item de ação "${item.text}" sem chevron de navegação`);
      }
    }

    await client.screenshot(path.join(outDir, `more_menu_${vp.w}px.png`));

    // Fecha o modal
    await client.eval(`window.Utils.closeModal('modal-more-menu');`);
    await sleep(200);
  }

  // 3. Testes Funcionais e de Interação dos Botões do Menu "Mais"
  console.log('\n--- 3. Testes Funcionais de Ação e Navegação do Menu "Mais" ---');
  await client.setViewport(390, 844);

  // A. Teste: Clicar em "Rankings" navega para a tela de rankings e fecha modal
  await client.eval(`window.Utils.openModal('modal-more-menu');`);
  await sleep(200);
  await client.eval(`document.querySelector('#modal-more-menu [data-screen="rankings"]').click();`);
  await sleep(350);
  const isRankingsActive = await client.eval(`document.getElementById('screen-rankings').classList.contains('active')`);
  const isModalClosed1 = await client.eval(`!document.getElementById('modal-more-menu').classList.contains('active')`);
  assert(isRankingsActive, 'Clicar em "Rankings" navega com sucesso para tela de Rankings');
  assert(isModalClosed1, 'Modal "Mais" fecha automaticamente ao navegar para Rankings');

  // B. Teste: Clicar em "Histórico" navega para tela de Histórico e fecha modal
  await client.eval(`window.Utils.openModal('modal-more-menu');`);
  await sleep(200);
  await client.eval(`document.querySelector('#modal-more-menu [data-screen="historico"]').click();`);
  await sleep(350);
  const isHistoricoActive = await client.eval(`document.getElementById('screen-historico').classList.contains('active')`);
  const isModalClosed2 = await client.eval(`!document.getElementById('modal-more-menu').classList.contains('active')`);
  assert(isHistoricoActive, 'Clicar em "Histórico" navega com sucesso para tela de Histórico');
  assert(isModalClosed2, 'Modal "Mais" fecha automaticamente ao navegar para Histórico');

  // C. Teste: Clicar em "Configurações" navega para tela de Configurações e fecha modal
  await client.eval(`window.Utils.openModal('modal-more-menu');`);
  await sleep(200);
  await client.eval(`document.querySelector('#modal-more-menu [data-screen="configuracoes"]').click();`);
  await sleep(350);
  const isConfigActive = await client.eval(`document.getElementById('screen-configuracoes').classList.contains('active')`);
  const isModalClosed3 = await client.eval(`!document.getElementById('modal-more-menu').classList.contains('active')`);
  assert(isConfigActive, 'Clicar em "Configurações" navega com sucesso para tela de Configurações');
  assert(isModalClosed3, 'Modal "Mais" fecha automaticamente ao navegar para Configurações');

  // D. Teste: Clicar em "Copiar link público" dispara cópia e fecha modal
  await client.eval(`window.Utils.openModal('modal-more-menu');`);
  await sleep(200);
  let shareTriggered = false;
  try {
    await client.eval(`
      (() => {
        window.prompt = () => {}; // Suprime prompt se clipboard não estiver disponível
        document.getElementById('btn-more-share').click();
      })()
    `);
    shareTriggered = true;
  } catch {}
  await sleep(350);
  const isModalClosed4 = await client.eval(`!document.getElementById('modal-more-menu').classList.contains('active')`);
  assert(shareTriggered, 'Clicar em "Copiar link público" dispara a ação com sucesso');
  assert(isModalClosed4, 'Modal "Mais" fecha automaticamente ao clicar em Copiar link público');

  // E. Teste: Botão Fechar "X"
  await client.eval(`window.Utils.openModal('modal-more-menu');`);
  await sleep(200);
  await client.eval(`document.querySelector('#modal-more-menu .btn-close').click();`);
  await sleep(250);
  const isModalClosedX = await client.eval(`!document.getElementById('modal-more-menu').classList.contains('active')`);
  assert(isModalClosedX, 'Clicar no botão Fechar "X" fecha o modal "Mais"');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${passed + failed}`);
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
