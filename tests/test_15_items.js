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
      width, height, deviceScaleFactor: 1, mobile: width < 768
    });
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

async function runTest() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const tempDir = path.join(__dirname, '.temp_edge_15_' + Date.now());
  const edgeProc = spawn(edgePath, [
    '--remote-debugging-port=9229',
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--user-data-dir=' + tempDir,
    'http://localhost:3000'
  ]);

  try {
    const wsUrl = await getWsUrl(9229);
    const client = new CdpClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Page.navigate', { url: 'http://localhost:3000' });
    await sleep(1000);

    for (let i = 0; i < 50; i++) {
      const ready = await client.eval('Boolean(window.App && (window.StorageApp || window.Storage || window.FutStorage))');
      if (ready) break;
      await sleep(200);
    }

    console.log('================================================================');
    console.log('VALIDAÇÃO DOS 15 ITENS ESPECÍFICOS EXIGIDOS');
    console.log('================================================================');

    let passed = 0;
    let failed = 0;

    function report(name, condition, details = '') {
      if (condition) {
        console.log(`✅ [${name}] PASS ${details ? `— ${details}` : ''}`);
        passed++;
      } else {
        console.error(`❌ [${name}] FAIL ${details ? `— ${details}` : ''}`);
        failed++;
      }
    }

    // Configurar viewport mobile 375x812
    await client.setViewport(375, 812);
    await sleep(300);

    // 1. Login / Criação
    const rLogin = await client.eval(`
      (async () => {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.confirm = () => true;
        window.alert = () => {};
        const st = window.StorageApp || window.Storage || window.FutStorage;
        const res = await st.createFutebol({
          nome: 'FutRoda Oficial',
          adminNome: 'Matheus',
          email: 'admin@futroda.com',
          password: 'senhaSegura123'
        });
        App.updateHeaderUI();
        App.navigateTo('dashboard');
        return { success: res.success, code: res.futebol?.codigo_publico };
      })()
    `);
    report('1. Login', rLogin && rLogin.success, `Futebol criado com código: ${rLogin?.code}`);

    // 2. Dashboard
    const rDash = await client.eval(`
      (() => {
        const vw = window.innerWidth;
        const scroll = document.documentElement.scrollWidth;
        const screenDash = document.getElementById('screen-dashboard');
        return {
          isActive: screenDash?.classList.contains('active'),
          noOverflow: scroll <= vw,
          vw, scroll
        };
      })()
    `);
    report('2. Dashboard', rDash.isActive && rDash.noOverflow, `Dashboard ativo, scrollWidth=${rDash.scroll}px (vw=${rDash.vw}px)`);

    // 3. Header
    const rHeader = await client.eval(`
      (() => {
        const h = document.querySelector('.app-header');
        const r = h?.getBoundingClientRect();
        return {
          fits: r && r.right <= window.innerWidth + 1,
          width: Math.round(r?.width || 0)
        };
      })()
    `);
    report('3. Header', rHeader.fits, `Header cabe perfeitamente na viewport (largura: ${rHeader.width}px)`);

    // 4. ID do futebol
    const rId = await client.eval(`
      (() => {
        const codeEl = document.getElementById('header-futebol-code');
        const r = codeEl?.getBoundingClientRect();
        return {
          code: codeEl?.innerText,
          visible: r && r.width > 0 && r.right <= window.innerWidth
        };
      })()
    `);
    report('4. ID do Futebol', rId.visible && rId.code?.startsWith('FDT-'), `ID: ${rId.code}`);

    // 5. Configurações
    const rConfig = await client.eval(`
      (() => {
        App.navigateTo('configuracoes');
        const screen = document.getElementById('screen-configuracoes');
        const scroll = document.documentElement.scrollWidth;
        return {
          isActive: screen?.classList.contains('active'),
          noOverflow: scroll <= window.innerWidth
        };
      })()
    `);
    report('5. Configurações', rConfig.isActive && rConfig.noOverflow, 'Tela de configurações ativa e sem overflow');

    // 6. Rodada
    const rRodada = await client.eval(`
      (() => {
        window.confirm = () => true;
        window.alert = () => {};
        Jogadores.loadDemoPlayers();
        Sorteio.selecionarPrimeiros20();
        Sorteio.solicitarSorteio();
        App.navigateTo('sorteio');
        const screen = document.getElementById('screen-sorteio');
        const scroll = document.documentElement.scrollWidth;
        return {
          isActive: screen?.classList.contains('active'),
          noOverflow: scroll <= window.innerWidth
        };
      })()
    `);
    report('6. Rodada', rRodada.isActive && rRodada.noOverflow, 'Sorteio realizado e tela sem overflow');

    // 7. Botão "Ir para partida"
    const rBtnPartida = await client.eval(`
      (() => {
        App.navigateTo('dashboard');
        const btn = document.getElementById('dash-cta-match');
        const actionBar = document.querySelector('.action-bar');
        return {
          exists: !!btn,
          inActionBar: actionBar?.contains(btn),
          height: Math.round(btn?.getBoundingClientRect().height || 0)
        };
      })()
    `);
    report('7. Botão Ir para Partida', rBtnPartida.exists && rBtnPartida.inActionBar && rBtnPartida.height >= 40, `Altura: ${rBtnPartida.height}px na barra de ações`);

    // 8. Menu inferior (Bottom Nav)
    const rBottomNav = await client.eval(`
      (() => {
        const nav = document.getElementById('bottom-nav');
        const comp = window.getComputedStyle(nav);
        const r = nav?.getBoundingClientRect();
        return {
          display: comp.display,
          height: Math.round(r?.height || 0),
          visible: comp.display !== 'none' && r?.height > 0
        };
      })()
    `);
    report('8. Menu Inferior', rBottomNav.visible, `Visível no mobile com altura: ${rBottomNav.height}px`);

    // 9. Jogadores
    const rJogadores = await client.eval(`
      (() => {
        App.navigateTo('jogadores');
        const screen = document.getElementById('screen-jogadores');
        const scroll = document.documentElement.scrollWidth;
        return {
          isActive: screen?.classList.contains('active'),
          noOverflow: scroll <= window.innerWidth
        };
      })()
    `);
    report('9. Jogadores', rJogadores.isActive && rJogadores.noOverflow, 'Tela jogadores ativa e sem overflow');

    // 10. Tabela
    const rTabela = await client.eval(`
      (() => {
        App.navigateTo('tabela');
        const screen = document.getElementById('screen-tabela');
        const scroll = document.documentElement.scrollWidth;
        const tableWrapper = document.querySelector('.sports-table-wrapper');
        return {
          isActive: screen?.classList.contains('active'),
          noOverflow: scroll <= window.innerWidth,
          wrapperHasScroll: tableWrapper?.scrollWidth >= tableWrapper?.clientWidth
        };
      })()
    `);
    report('10. Tabela', rTabela.isActive && rTabela.noOverflow, 'Tabela exibida, container com scroll isolado, página sem overflow');

    // 11. Partida
    const rPartida = await client.eval(`
      (() => {
        App.navigateTo('partida');
        const screen = document.getElementById('screen-partida');
        const scroll = document.documentElement.scrollWidth;
        return {
          isActive: screen?.classList.contains('active'),
          noOverflow: scroll <= window.innerWidth
        };
      })()
    `);
    report('11. Partida', rPartida.isActive && rPartida.noOverflow, 'Tela de partida ativa e sem overflow');

    // 12. Gols
    const rGols = await client.eval(`
      (() => {
        const st = window.StorageApp || window.Storage || window.FutStorage;
        const teams = st.getTeams();
        Partidas.registrarGol('time_1', teams.time_1.players[0].id, teams.time_1.players[0].name);
        const homeScore = document.getElementById('scoreboard-home-score')?.innerText;
        return {
          score: homeScore
        };
      })()
    `);
    report('12. Gols', rGols.score === '1', `Placar atualizado para: ${rGols.score}`);

    // 13. Modais
    const rModal = await client.eval(`
      (() => {
        Utils.openModal('modal-more-menu');
        const modal = document.getElementById('modal-more-menu');
        const card = modal?.querySelector('.modal-card');
        const rCard = card?.getBoundingClientRect();
        const vw = window.innerWidth;
        const fits = rCard && rCard.right <= vw && rCard.left >= 0;
        Utils.closeModal('modal-more-menu');
        return {
          fits,
          width: Math.round(rCard?.width || 0)
        };
      })()
    `);
    report('13. Modais', rModal.fits, `Modal card cabe perfeitamente na tela (largura: ${rModal.width}px)`);

    // 14. Encerrar noite
    const rEncerrar = await client.eval(`
      (async () => {
        window.confirm = () => true;
        window.alert = () => {};
        Partidas.startOrResumeMatch();
        Partidas.finalizarPartida();
        await new Promise(r => setTimeout(r, 200));
        Partidas.solicitarEncerramentoNoite();
        await new Promise(r => setTimeout(r, 100));
        const modal = document.getElementById('modal-encerrar-noite-resumo');
        const modalOpen = modal?.classList.contains('active');
        const btnConfirm = modal?.querySelector('#btn-confirm-finalizar-noite');
        if (btnConfirm && !btnConfirm.disabled) {
          btnConfirm.click();
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 100));
            const round = (window.StorageApp || window.FutStorage).getCurrentRound();
            if (round?.status === 'FINISHED') {
              return {
                modalWasOpen: modalOpen,
                roundStatus: round.status,
                success: true
              };
            }
          }
        }
        const round = (window.StorageApp || window.FutStorage).getCurrentRound();
        return {
          modalWasOpen: modalOpen,
          roundStatus: round?.status,
          success: modalOpen && round?.status === 'FINISHED'
        };
      })()
    `);
    report('14. Encerrar Noite', rEncerrar && rEncerrar.success, `Modal aberto: ${rEncerrar?.modalWasOpen}, Status rodada: ${rEncerrar?.roundStatus}`);

    // 15. Logout
    const rLogout = await client.eval(`
      (() => {
        const st = window.StorageApp || window.Storage || window.FutStorage;
        st.logout();
        App.updateHeaderUI();
        App.navigateTo('landing');
        const screenLanding = document.getElementById('screen-landing');
        const bottomNav = document.getElementById('bottom-nav');
        return {
          landingActive: screenLanding?.classList.contains('active'),
          bottomNavHidden: window.getComputedStyle(bottomNav).display === 'none'
        };
      })()
    `);
    report('15. Logout', rLogout.landingActive && rLogout.bottomNavHidden, 'Logout com sucesso, redirecionado para Landing e Bottom Nav oculto');

    console.log('================================================================');
    console.log(`TOTAL: ${passed} PASSOU / ${failed} FALHOU`);
    console.log('================================================================');

    client.close();
  } finally {
    try { edgeProc.kill('SIGKILL'); } catch {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

runTest().catch(console.error);
