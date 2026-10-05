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
      if (data && data[0] && data[0].webSocketDebuggerUrl) {
        return data[0].webSocketDebuggerUrl;
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
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function runDiagnosis() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const outDir = path.join(__dirname, 'screenshots_responsive');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const edgeProc = spawn(edgePath, [
    '--remote-debugging-port=9226',
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--user-data-dir=' + path.join(__dirname, '.temp_edge_audit_diag2'),
    'http://localhost:3000'
  ]);

  try {
    const wsUrl = await getWsUrl(9226);
    const client = new CdpClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await sleep(1000);

    // Inicializar dados de teste diretamente usando App.Storage ou StorageApp
    await client.eval(`
      (async () => {
        window.localStorage.clear();
        const st = window.StorageApp || window.App.Storage;
        await st.createFutebol({
          nome: 'FutRoda Oficial',
          adminNome: 'Matheus',
          email: 'admin@futroda.com',
          password: 'senhaSegura123'
        });
        Jogadores.loadDemoPlayers();
        Sorteio.selecionarPrimeiros20();
        Sorteio.solicitarSorteio();
        Partidas.selectMatchup('time_1', 'time_2');
        Partidas.startOrResumeMatch();
        const teams = st.getTeams();
        if (teams) {
          Partidas.registrarGol('time_1', teams.time_1.players[0].id, teams.time_1.players[0].name);
          Partidas.registrarGol('time_2', teams.time_2.players[0].id, teams.time_2.players[0].name);
        }
        App.updateHeaderUI();
        App.navigateTo('dashboard');
      })()
    `);
    await sleep(1000);

    const viewports = [320, 360, 375, 390, 412, 430, 768, 820, 834, 1024, 1280];

    console.log('================================================================');
    console.log('AUDITORIA DE RESPONSIVIDADE COMPLETA - DASHBOARD');
    console.log('================================================================');

    let allPassed = true;

    for (const w of viewports) {
      await client.setViewport(w, 800);
      await sleep(350);

      const metrics = await client.eval(`
        (() => {
          const vw = window.innerWidth;
          const docScroll = document.documentElement.scrollWidth;
          const bodyScroll = document.body.scrollWidth;
          const docClient = document.documentElement.clientWidth;

          // Procurar elementos que causam overflow horizontal na página
          const overflowing = [];
          document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            if (el.closest('.modal:not(.active)')) return;
            if (el.id === 'modal-more-menu') return;

            // Elementos com scroll horizontal isolado permitido (action-bar, sports-table-wrapper, chips)
            const isScrollContainer = el.classList.contains('action-bar') ||
                                      el.classList.contains('page-head-actions') ||
                                      el.classList.contains('sports-table-wrapper') ||
                                      el.classList.contains('table-responsive') ||
                                      el.classList.contains('chips') ||
                                      el.classList.contains('desktop-nav');

            if (r.right > vw + 1.5 && !isScrollContainer) {
              overflowing.push({
                tag: el.tagName,
                id: el.id,
                className: el.className,
                right: Math.round(r.right),
                width: Math.round(r.width),
                overflow: Math.round(r.right - vw)
              });
            }
          });

          // Testar botão "Ir para partida"
          const btnMatch = document.getElementById('dash-cta-match');
          const rMatch = btnMatch ? btnMatch.getBoundingClientRect() : null;
          const actionBar = document.querySelector('.action-bar');
          const isMatchInActionBar = actionBar && btnMatch && actionBar.contains(btnMatch);

          // Testar Bottom Nav
          const bottomNav = document.getElementById('bottom-nav');
          const bStyle = bottomNav ? window.getComputedStyle(bottomNav) : null;
          const bRect = bottomNav ? bottomNav.getBoundingClientRect() : null;
          const isBottomNavVisible = bStyle && bStyle.display !== 'none' && bStyle.visibility !== 'hidden' && bRect && bRect.height > 0;

          // Testar Header
          const header = document.querySelector('.app-header');
          const hRect = header ? header.getBoundingClientRect() : null;

          // Testar se último card está escondido atrás do menu
          const lastCard = document.querySelector('#screen-dashboard .card:last-child');
          const lastCardRect = lastCard ? lastCard.getBoundingClientRect() : null;
          const mainEl = document.querySelector('.app-main');
          const mainPaddingBottom = mainEl ? parseFloat(window.getComputedStyle(mainEl).paddingBottom) : 0;

          return {
            vw,
            docClient,
            docScroll,
            bodyScroll,
            hasPageHorizontalScroll: docScroll > vw + 1 || bodyScroll > vw + 1,
            overflowingElements: overflowing.slice(0, 5),
            overflowingTotal: overflowing.length,
            matchButton: {
              exists: !!btnMatch,
              inActionBar: isMatchInActionBar,
              width: rMatch ? Math.round(rMatch.width) : 0,
              height: rMatch ? Math.round(rMatch.height) : 0,
              text: btnMatch ? btnMatch.innerText.trim() : ''
            },
            bottomNav: {
              exists: !!bottomNav,
              display: bStyle ? bStyle.display : null,
              height: bRect ? Math.round(bRect.height) : 0,
              isVisible: isBottomNavVisible
            },
            header: {
              width: hRect ? Math.round(hRect.width) : 0,
              overflow: hRect ? (hRect.right > vw + 1) : false
            },
            mainPaddingBottom
          };
        })()
      `);

      const isMobile = w < 768;
      const isTablet = w >= 768 && w < 1024;
      const isDesktop = w >= 1024;

      const passedOverflow = !metrics.hasPageHorizontalScroll && metrics.overflowingTotal === 0;
      const passedBtn = metrics.matchButton.exists && metrics.matchButton.height >= 36;
      const passedBottomNav = isMobile ? metrics.bottomNav.isVisible : !metrics.bottomNav.isVisible;
      const passedHeader = !metrics.header.overflow;
      const passedPadding = isMobile ? metrics.mainPaddingBottom >= 80 : true;

      const checkPass = passedOverflow && passedBtn && passedBottomNav && passedHeader && passedPadding;
      if (!checkPass) allPassed = false;

      console.log(`\n📱 Resolução: ${w}px (${isMobile ? 'Mobile' : isTablet ? 'Tablet/iPad' : 'Desktop'})`);
      console.log(`  Largura Renderizada: ${metrics.vw}px | docScroll: ${metrics.docScroll}px | bodyScroll: ${metrics.bodyScroll}px`);
      console.log(`  Overflow Horizontal na Página: ${metrics.hasPageHorizontalScroll ? '❌ FALHOU (Há scroll)' : '✅ OK (Zero overflow)'}`);
      console.log(`  Elementos fora da tela: ${metrics.overflowingTotal === 0 ? '✅ 0 elementos' : `❌ ${metrics.overflowingTotal} elementos`}`);
      if (metrics.overflowingElements.length > 0) {
        metrics.overflowingElements.forEach(el => {
          console.log(`    ⚠️ <${el.tag} id="${el.id}" class="${el.className}"> +${el.overflow}px`);
        });
      }
      console.log(`  Botão "Ir para partida": ${passedBtn ? '✅ Presente e acessível na barra de ações' : '❌ Falhou'}`);
      console.log(`  Menu Inferior (Bottom Nav): ${isMobile ? (metrics.bottomNav.isVisible ? '✅ Visível no Mobile' : '❌ NÃO APARECE NO MOBILE') : (!metrics.bottomNav.isVisible ? '✅ Oculto no Desktop/Tablet' : '❌ Visível indevidamente no Desktop')}`);
      console.log(`  Header ajustado: ${passedHeader ? '✅ Sem estouro' : '❌ Estouro lateral'}`);
      if (isMobile) {
        console.log(`  Padding inferior para Bottom Nav: ${metrics.mainPaddingBottom}px ${passedPadding ? '✅ (>= 80px)' : '❌ Insuficiente'}`);
      }

      await client.screenshot(path.join(outDir, `audit_dashboard_${w}px.png`));
    }

    client.close();

    console.log('\n================================================================');
    console.log(`RESULTADO DA AUDITORIA: ${allPassed ? '🚀 TODOS OS BREAKPOINTS PASSARAM COM 100% SUCESSO!' : '❌ ALGUNS ITENS REQUEREM AJUSTE'}`);
    console.log('================================================================\n');

  } finally {
    try { edgeProc.kill('SIGKILL'); } catch {}
  }
}

runDiagnosis().catch(console.error);
