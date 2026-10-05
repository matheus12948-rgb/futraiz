/**
 * TESTE E2E: PREVENÇÃO DE ZOOM AUTOMÁTICO EM CAMPOS DE FORMULÁRIO NO IOS SAFARI
 * Validação rigorosa dos itens solicitados:
 * 1. Meta viewport no index.html não desabilita zoom manual (não contém user-scalable=no nem maximum-scale=1).
 * 2. Todos os campos de formulário (inputs, selects, textareas, search) possuem font-size >= 16px em mobile/tablet/desktop.
 * 3. Teste de interação de foco em:
 *    - Nome do futebol
 *    - Nome do administrador
 *    - E-mail e Senha
 *    - Código público do futebol
 *    - Nome do jogador
 *    - Busca de jogador
 *    - Select de estrelas do atleta e filtro
 *    - Select de duração da partida e configurações
 *    - Modais de cadastro, login e entrada por código
 * 4. Verificação de ausência de overflow horizontal e preservação do layout.
 */

import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getDebuggerUrl(port = 9226) {
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
  console.log('VALIDAÇÃO DE PREVENÇÃO DE ZOOM AUTOMÁTICO NO IOS (FONT-SIZE >= 16PX)');
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

  // --- PARTE 1: VERIFICAÇÃO DO META VIEWPORT NO INDEX.HTML ---
  console.log('--- 1. Auditoria da Meta Tag Viewport no index.html ---');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const viewportMatch = indexHtml.match(/<meta\s+name=["']viewport["'][^>]*>/i);
  assert(viewportMatch !== null, 'Meta tag viewport está presente no <head> do index.html');

  if (viewportMatch) {
    const tagContent = viewportMatch[0];
    assert(!tagContent.includes('user-scalable=no'), 'Meta viewport NÃO utiliza "user-scalable=no" (zoom manual livre)');
    assert(!tagContent.includes('user-scalable = no'), 'Meta viewport sem variações de user-scalable');
    assert(!tagContent.includes('maximum-scale'), 'Meta viewport NÃO utiliza "maximum-scale" (permite pinch-to-zoom)');
    assert(tagContent.includes('width=device-width'), 'Meta viewport configura width=device-width corretamente');
  }

  // Prepara diretório de screenshots
  const outDir = path.join(__dirname, 'screenshots_ios_zoom');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Dispara Edge em porta dedicada 9226
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const userDataDir = 'C:\\Users\\mathe\\AppData\\Local\\Temp\\edge_ios_profile_' + Date.now();
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9226',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ]);

  await sleep(1500);

  let wsUrl;
  for (let i = 0; i < 20; i++) {
    try {
      wsUrl = await getDebuggerUrl(9226);
      if (wsUrl) break;
    } catch {
      await sleep(300);
    }
  }

  if (!wsUrl) {
    edgeProc.kill();
    throw new Error('Falha ao conectar no Edge na porta 9226');
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

  // Setup: Cria futebol com admin e cadastra atletas
  console.log('\n--- 2. Preparação de Dados para Validação de Telas ---');
  await client.eval(`
    (async () => {
      window.confirm = () => true;
      await window.StorageApp.createFutebol({
        nome: 'Futebol iOS Zoom Test',
        adminNome: 'Admin Teste iOS',
        email: 'ios_zoom@futraiz.com',
        password: 'senhaSegura123'
      });

      // Cadastra 3 atletas
      await window.StorageApp.addPlayer({ name: 'Neymar Jr', stars: 5 });
      await window.StorageApp.addPlayer({ name: 'Vini Jr', stars: 4 });
      await window.StorageApp.addPlayer({ name: 'Rodrygo Silva', stars: 3 });

      window.App.navigateTo('jogadores');
    })()
  `);
  await sleep(400);

  const viewports = [
    { name: '360px (iPhone SE / Mobile Pequeno)', w: 360, h: 740 },
    { name: '390px (iPhone 12/13/14/15)', w: 390, h: 844 },
    { name: '412px (Mobile Grande)', w: 412, h: 915 },
    { name: '768px (iPad Portrait)', w: 768, h: 1024 },
    { name: '1280px (Desktop)', w: 1280, h: 800 }
  ];

  // --- PARTE 2: AUDITORIA DE FONT-SIZE >= 16PX EM TODAS AS RESOLUÇÕES ---
  console.log('\n--- 3. Verificação de Font-Size >= 16px em todos os Campos de Formulário ---');
  for (const vp of viewports) {
    await client.setViewport(vp.w, vp.h);
    await sleep(200);

    const fontAudit = await client.eval(`
      (() => {
        const results = [];
        
        // Seletores de campos essenciais da aplicação
        const selectors = [
          { sel: '#player-name', desc: 'Input Nome do Jogador' },
          { sel: '#players-search', desc: 'Input Busca de Jogadores' },
          { sel: '#players-filter-stars', desc: 'Select Filtro de Estrelas' },
          { sel: '.player-stars-select', desc: 'Select de Estrelas na Linha do Atleta' },
          { sel: '#create-fut-name', desc: 'Input Nome do Futebol (Modal)' },
          { sel: '#create-fut-admin-name', desc: 'Input Nome do Administrador (Modal)' },
          { sel: '#create-fut-email', desc: 'Input E-mail (Modal)' },
          { sel: '#create-fut-password', desc: 'Input Senha (Modal)' },
          { sel: '#enter-fut-code', desc: 'Input Código Público (Modal)' },
          { sel: '#login-admin-email', desc: 'Input E-mail Login (Modal)' },
          { sel: '#login-admin-password', desc: 'Input Senha Login (Modal)' },
          { sel: '#match-duration-select', desc: 'Select Duração da Partida' },
          { sel: '#settings-fut-name', desc: 'Input Nome do Futebol (Config)' },
          { sel: '#settings-fut-code', desc: 'Input Código do Futebol (Config)' },
          { sel: '#settings-default-duration', desc: 'Select Duração Padrão (Config)' },
          { sel: '#round-player-search', desc: 'Input Busca Rodada' }
        ];

        selectors.forEach(item => {
          const el = document.querySelector(item.sel);
          if (el) {
            const comp = window.getComputedStyle(el);
            const fs = parseFloat(comp.fontSize);
            results.push({
              desc: item.desc,
              sel: item.sel,
              fontSize: fs,
              fontString: comp.fontSize,
              height: Math.round(el.getBoundingClientRect().height)
            });
          }
        });

        const hasHScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;

        return { results, hasHScroll };
      })()
    `);

    assert(!fontAudit.hasHScroll, `[${vp.name}] Página sem scroll horizontal (docScrollWidth <= clientWidth)`);

    for (const item of fontAudit.results) {
      assert(
        item.fontSize >= 16,
        `[${vp.name}] ${item.desc} (${item.sel}) possui font-size >= 16px: obtido ${item.fontSize}px (${item.fontString})`
      );
    }
  }

  // --- PARTE 3: TESTES DE INTERAÇÃO DE FOCO E ENTRADA DE DADOS ---
  console.log('\n--- 4. Teste de Interação: Foco, Digitação e Modais sem Zoom Automático ---');
  await client.setViewport(390, 844); // iPhone 12/13/14
  await sleep(200);

  // 1. Tocar no campo Nome do Jogador
  await client.eval(`
    (() => {
      const input = document.getElementById('player-name');
      input.focus();
      input.value = 'Vinicius Jr';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await sleep(200);
  const activeName = await client.eval(`document.activeElement.id === 'player-name'`);
  assert(activeName, 'Foco ativado com sucesso em #player-name');

  const afterFocusName = await client.eval(`
    (() => {
      return {
        hasHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        inputH: document.getElementById('player-name').getBoundingClientRect().height
      };
    })()
  `);
  assert(!afterFocusName.hasHScroll, 'Nenhum scroll horizontal provocado ao focar #player-name');
  assert(afterFocusName.inputH >= 38, `Altura do input de nome proporcional e acessível: ${afterFocusName.inputH}px`);

  // 2. Tocar no campo Buscar Jogador
  await client.eval(`
    (() => {
      const search = document.getElementById('players-search');
      search.focus();
      search.value = 'Neymar';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await sleep(200);
  const activeSearch = await client.eval(`document.activeElement.id === 'players-search'`);
  assert(activeSearch, 'Foco ativado com sucesso em #players-search');

  // Limpa busca
  await client.eval(`
    (() => {
      const search = document.getElementById('players-search');
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);

  // 3. Tocar e abrir select de estrelas do atleta
  const starsSelectProps = await client.eval(`
    (() => {
      const sel = document.querySelector('.player-stars-select');
      if (!sel) return null;
      sel.focus();
      const comp = window.getComputedStyle(sel);
      return {
        fontSize: parseFloat(comp.fontSize),
        height: Math.round(sel.getBoundingClientRect().height),
        width: Math.round(sel.getBoundingClientRect().width)
      };
    })()
  `);
  assert(starsSelectProps !== null, 'Select .player-stars-select encontrado na lista de jogadores');
  assert(starsSelectProps.fontSize >= 16, `Select .player-stars-select com font-size >= 16px: ${starsSelectProps.fontSize}px (NÃO dispara zoom no iOS)`);
  assert(starsSelectProps.height >= 32, `Select .player-stars-select com altura profissional: ${starsSelectProps.height}px`);

  // 4. Modal "Criar Futebol": Foco em Nome, Admin, E-mail, Senha
  console.log('\n--- 5. Interação com Modais (Criar Futebol, Código e Login) ---');
  await client.eval(`window.Utils.openModal('modal-create-futebol');`);
  await sleep(300);

  const modalActive = await client.eval(`document.getElementById('modal-create-futebol').classList.contains('active')`);
  assert(modalActive, 'Modal "Criar novo futebol" aberto com sucesso');

  const modalCreateAudit = await client.eval(`
    (() => {
      const modal = document.getElementById('modal-create-futebol');
      const mRect = modal.getBoundingClientRect();
      const nameInput = document.getElementById('create-fut-name');
      const emailInput = document.getElementById('create-fut-email');
      const passInput = document.getElementById('create-fut-password');

      nameInput.focus();

      const nameFs = parseFloat(window.getComputedStyle(nameInput).fontSize);
      const emailFs = parseFloat(window.getComputedStyle(emailInput).fontSize);
      const passFs = parseFloat(window.getComputedStyle(passInput).fontSize);

      return {
        nameFs,
        emailFs,
        passFs,
        modalTop: mRect.top,
        modalVisible: mRect.height > 0 && mRect.width > 0,
        hasHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()
  `);

  assert(modalCreateAudit.nameFs >= 16, `Input Nome do Futebol com font-size >= 16px: ${modalCreateAudit.nameFs}px`);
  assert(modalCreateAudit.emailFs >= 16, `Input E-mail com font-size >= 16px: ${modalCreateAudit.emailFs}px`);
  assert(modalCreateAudit.passFs >= 16, `Input Senha com font-size >= 16px: ${modalCreateAudit.passFs}px`);
  assert(!modalCreateAudit.hasHScroll, 'Modal aberto sem provocar overflow horizontal');
  assert(modalCreateAudit.modalVisible, 'Modal perfeitamente visível na área de exibição da tela');

  await client.screenshot(path.join(outDir, 'modal_criar_fut_390px.png'));

  // Fecha modal de criar futebol
  await client.eval(`window.Utils.closeModal('modal-create-futebol');`);
  await sleep(200);

  // 5. Modal "Entrar em um Futebol": Foco no campo de código
  await client.eval(`window.Utils.openModal('modal-enter-futebol');`);
  await sleep(300);

  const enterCodeAudit = await client.eval(`
    (() => {
      const input = document.getElementById('enter-fut-code');
      input.focus();
      const comp = window.getComputedStyle(input);
      return {
        fontSize: parseFloat(comp.fontSize),
        active: document.activeElement.id === 'enter-fut-code',
        hasHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()
  `);

  assert(enterCodeAudit.active, 'Foco ativado em #enter-fut-code');
  assert(enterCodeAudit.fontSize >= 16, `Input Código Público (#enter-fut-code) com font-size >= 16px: ${enterCodeAudit.fontSize}px`);
  assert(!enterCodeAudit.hasHScroll, 'Modal de código sem overflow horizontal');

  await client.screenshot(path.join(outDir, 'modal_codigo_390px.png'));

  // Fecha modal de código
  await client.eval(`window.Utils.closeModal('modal-enter-futebol');`);
  await sleep(200);

  // 6. Navega para Configurações e valida selects e inputs
  console.log('\n--- 6. Navegação para Tela de Configurações ---');
  await client.eval(`window.App.navigateTo('configuracoes');`);
  await sleep(400);

  const configAudit = await client.eval(`
    (() => {
      const futName = document.getElementById('settings-fut-name');
      const durationSel = document.getElementById('settings-default-duration');

      futName.focus();

      const nameFs = futName ? parseFloat(window.getComputedStyle(futName).fontSize) : 0;
      const durFs = durationSel ? parseFloat(window.getComputedStyle(durationSel).fontSize) : 0;

      return {
        nameFs,
        durFs,
        hasHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    })()
  `);

  assert(configAudit.nameFs >= 16, `Config: Input Nome do Futebol com font-size >= 16px: ${configAudit.nameFs}px`);
  assert(configAudit.durFs >= 16, `Config: Select Duração Padrão com font-size >= 16px: ${configAudit.durFs}px`);
  assert(!configAudit.hasHScroll, 'Tela de configurações sem scroll horizontal');

  await client.screenshot(path.join(outDir, 'config_390px.png'));

  // Retorna para jogadores
  await client.eval(`window.App.navigateTo('jogadores');`);
  await sleep(300);
  await client.screenshot(path.join(outDir, 'jogadores_final_390px.png'));

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
