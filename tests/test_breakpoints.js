import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getWsUrl(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, res => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });
      if (data && Array.isArray(data)) {
        const page = data.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || data.find(t => t.webSocketDebuggerUrl);
        if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch (e) {}
    await sleep(300);
  }
  throw new Error('CDP target not found');
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      console.error('Eval error:', res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result ? res.result.value : null;
  }
  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: width < 768 ? 2 : 1,
      mobile: width < 768,
      screenWidth: width,
      screenHeight: height
    });
    if (width < 768) {
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    } else {
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
  }
  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function runBreakpointTests() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const outDir = path.join(__dirname, 'screenshots_breakpoints');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const tempDir = path.join(__dirname, '.temp_edge_bp_' + Date.now());
  const edgeProc = spawn(edgePath, [
    '--remote-debugging-port=9228',
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--user-data-dir=' + tempDir,
    'http://localhost:3000'
  ]);

  try {
    const wsUrl = await getWsUrl(9228);
    const client = new CdpClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.navigate', { url: 'http://localhost:3000' });
    await sleep(1500);

    for (let i = 0; i < 50; i++) {
      const ready = await client.eval('Boolean(window.App && (window.StorageApp || window.Storage || window.FutStorage))');
      if (ready) break;
      await sleep(200);
    }

    // Setup session and sample data
    await client.eval(`
      (async () => {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.confirm = () => true;
        window.alert = () => {};
        const st = window.StorageApp || window.Storage || window.FutStorage;
        if (st && st.createFutebol) {
          await st.createFutebol({
            nome: 'FutRoda Oficial',
            adminNome: 'Matheus Silva',
            email: 'admin_' + Date.now() + '@futroda.com',
            password: 'senhaSegura123'
          });
          Jogadores.loadDemoPlayers();
          Sorteio.selecionarPrimeiros20();
          Sorteio.solicitarSorteio();
          App.updateHeaderUI();
          App.navigateTo('dashboard');
        }
      })()
    `);
    await sleep(800);

    const breakpoints = [
      { name: 'Mobile Pequeno (iPhone SE)', width: 320, height: 568 },
      { name: 'Mobile Pequeno (Galaxy A)', width: 360, height: 740 },
      { name: 'Mobile Padrão (iPhone Mini)', width: 375, height: 812 },
      { name: 'Mobile Padrão (iPhone 12/13/14)', width: 390, height: 844 },
      { name: 'Mobile Grande (Galaxy S/Pixel)', width: 412, height: 915 },
      { name: 'Mobile Grande (iPhone Pro Max)', width: 430, height: 932 },
      { name: 'Tablet / iPad Mini Portrait', width: 768, height: 1024 },
      { name: 'Tablet / iPad Air Portrait', width: 820, height: 1180 },
      { name: 'Tablet / iPad Pro 11" Portrait', width: 834, height: 1194 },
      { name: 'Desktop / iPad Pro Landscape', width: 1024, height: 768 },
      { name: 'Desktop Wide', width: 1280, height: 800 }
    ];

    console.log('========================================================================');
    console.log('TESTES DE RESPONSIVIDADE EM TODOS OS BREAKPOINTS SOLICITADOS');
    console.log('========================================================================');

    let totalPass = 0;
    let totalFail = 0;

    for (const bp of breakpoints) {
      await client.setViewport(bp.width, bp.height);
      await sleep(350);

      const check = await client.eval(`
        (() => {
          const vw = window.innerWidth;
          const docScroll = document.documentElement.scrollWidth;
          const bodyScroll = document.body.scrollWidth;

          // Verificar overflow na página inteira
          const hasPageScroll = docScroll > vw || bodyScroll > vw;

          // Verificar botão "Ir para partida"
          const btnMatch = document.getElementById('dash-cta-match');
          const rMatch = btnMatch ? btnMatch.getBoundingClientRect() : null;
          const actionBar = document.querySelector('.action-bar');
          const hasMatchBtn = !!btnMatch && rMatch.height >= 38;

          // Verificar bottom nav
          const bottomNav = document.getElementById('bottom-nav');
          const bComp = bottomNav ? window.getComputedStyle(bottomNav) : null;
          const bRect = bottomNav ? bottomNav.getBoundingClientRect() : null;
          const isBottomVisible = bComp && bComp.display !== 'none' && bComp.visibility !== 'hidden' && bRect.height > 0;

          // Verificar header
          const header = document.querySelector('.app-header');
          const hRect = header ? header.getBoundingClientRect() : null;
          const headerFits = hRect ? (hRect.right <= vw + 1) : false;

          // Verificar cards do dashboard
          const cards = document.querySelectorAll('#screen-dashboard .card');
          let cardsOverflow = false;
          cards.forEach(c => {
            const r = c.getBoundingClientRect();
            if (r.right > vw + 1) cardsOverflow = true;
          });

          const overElements = [];
          document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.right > vw + 1) {
              overElements.push({ tag: el.tagName, id: el.id, class: el.className, right: Math.round(r.right), width: Math.round(r.width) });
            }
          });

          return {
            vw,
            docScroll,
            bodyScroll,
            hasPageScroll,
            hasMatchBtn,
            isBottomVisible,
            headerFits,
            cardsOverflow,
            overElements,
            actionBarScrollable: actionBar ? actionBar.scrollWidth >= actionBar.clientWidth : false
          };
        })()
      `);

      const isMobile = bp.width < 768;
      const isTablet = bp.width >= 768 && bp.width < 1024;
      const isDesktop = bp.width >= 1024;

      let pass = true;
      if (check.hasPageScroll) pass = false;
      if (!check.hasMatchBtn) pass = false;
      if (isMobile && !check.isBottomVisible) pass = false;
      if (!isMobile && check.isBottomVisible) pass = false;
      if (!check.headerFits) pass = false;
      if (check.cardsOverflow) pass = false;

      if (pass) {
        totalPass++;
        console.log(`✅ PASS: ${bp.width}px [${bp.name}]`);
        console.log(`   - Scroll geral: ZERO (${check.docScroll}px / ${check.vw}px) | Header: OK | Cards: OK | Botão Partida: OK | BottomNav: ${isMobile ? 'Ativo' : 'Oculto'}`);
      } else {
        totalFail++;
        console.error(`❌ FAIL: ${bp.width}px [${bp.name}]`);
        console.error(`   - PageScroll: ${check.hasPageScroll} (doc: ${check.docScroll}, body: ${check.bodyScroll}, vw: ${check.vw})`);
        console.error(`   - BottomNav: ${check.isBottomVisible} (expected: ${isMobile})`);
        console.error(`   - HeaderFits: ${check.headerFits}`);
        console.error(`   - CardsOverflow: ${check.cardsOverflow}`);
        if (check.overElements && check.overElements.length > 0) {
          console.error(`   - Overflowing elements (${check.overElements.length}):`, check.overElements.slice(0, 5));
        }
      }

      await client.screenshot(path.join(outDir, `bp_${bp.width}px.png`));
    }

    console.log('========================================================================');
    console.log(`TOTAL: ${totalPass} PASSOU / ${totalFail} FALHOU`);
    console.log('========================================================================');

    client.close();
  } finally {
    try { edgeProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

runBreakpointTests().catch(console.error);
