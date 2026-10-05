/**
 * Diagnostic script for Partidas module in Microsoft Edge via CDP
 */

import { spawn } from 'child_process';
import http from 'http';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getDebuggerUrl(port = 9222) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const list = JSON.parse(data);
          const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || list[0];
          if (page && page.webSocketDebuggerUrl) resolve(page.webSocketDebuggerUrl);
          else reject(new Error('No page target found'));
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
        if (msg.method === 'Runtime.consoleAPICalled') {
          console.log('[Edge Console]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          console.error('[Edge Exception]', msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
        }
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      };
    });
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
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'Eval error');
    }
    return res.result?.value;
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function run() {
  console.log('🔍 Iniciando auditoria do módulo Partidas no Edge...');
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const tempProfile = 'C:\\Users\\mathe\\AppData\\Local\\Temp\\edge_diag_profile_' + Date.now();

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      wsUrl = await getDebuggerUrl(9222);
      if (wsUrl) break;
    } catch {}
  }

  const client = new CDPClient(wsUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  await sleep(1000);
  await client.eval(`
    new Promise((resolve) => {
      const check = () => {
        if (window.App && window.Storage && window.Storage.createFutebol) resolve();
        else setTimeout(check, 100);
      };
      check();
    })
  `);

  // 1. Criar futebol e sortear times para habilitar a tela de partidas
  console.log('\n--- 1. Preparando ambiente com Futebol, 20 jogadores e Sorteio ---');
  await client.eval(`
    (async () => {
      await window.Storage.createFutebol({
        nome: 'Futebol Teste Partidas',
        adminNome: 'Admin Teste',
        email: 'teste@partidas.com',
        password: 'senha12345'
      });

      // Cadastra 20 jogadores
      const players = [];
      for (let i = 1; i <= 20; i++) {
        players.push({
          id: 'p_' + i,
          name: 'Jogador ' + i,
          stars: (i % 5) + 1
        });
      }
      window.Storage.savePlayers(players);
      window.Storage.saveSelectedPlayerIds(players.map(p => p.id));
      window.Sorteio.selectedPlayerIds = new Set(players.map(p => p.id));
      window.Sorteio.executarSorteio(players);
      window.App.navigateTo('partida');
    })()
  `);

  await sleep(1000);

  // 2. Auditar elementos da tela de partida
  console.log('\n--- 2. Verificando Elementos no DOM da Tela de Partidas ---');
  const domAudit = await client.eval(`
    (() => {
      return {
        partidaEmptyStateDisplay: document.getElementById('partida-empty-state')?.style.display,
        partidaActiveStateDisplay: document.getElementById('partida-active-state')?.style.display,
        scoreboardTimer: document.getElementById('scoreboard-timer')?.innerText,
        matchTimerDisplay: Boolean(document.getElementById('match-timer-display')),
        btnAddGoalHome: Boolean(document.getElementById('btn-add-goal-home')),
        btnGoalHome: Boolean(document.getElementById('btn-goal-home')),
        btnAddGoalAway: Boolean(document.getElementById('btn-add-goal-away')),
        btnGoalAway: Boolean(document.getElementById('btn-goal-away')),
        btnTimerStart: Boolean(document.getElementById('btn-timer-start')),
        btnTimerPause: Boolean(document.getElementById('btn-timer-pause')),
        btnTimerFinish: Boolean(document.getElementById('btn-timer-finish')),
        btnTimerReset: Boolean(document.getElementById('btn-timer-reset')),
        matchDurationSelect: document.getElementById('match-duration-select')?.value,
        matchDurationCustom: document.getElementById('match-duration-custom')?.value,
        homeScore: document.getElementById('scoreboard-home-score')?.innerText,
        awayScore: document.getElementById('scoreboard-away-score')?.innerText,
        matchStatusTag: document.getElementById('match-status-tag')?.innerText,
        timelineContent: document.getElementById('match-goals-timeline')?.innerText.trim()
      };
    })()
  `);
  console.log('Auditoria do DOM:', JSON.stringify(domAudit, null, 2));

  // 3. Teste do Botão INICIAR
  console.log('\n--- 3. Testando Clique no Botão INICIAR ---');
  await client.eval(`
    document.getElementById('btn-timer-start').click();
  `);
  await sleep(1500);

  const timerAfterStart = await client.eval(`
    (() => {
      return {
        timerScoreboard: document.getElementById('scoreboard-timer')?.innerText,
        stateRemaining: window.Partidas.state.remainingSeconds,
        stateIsActive: window.Partidas.state.isActive,
        stateIsPaused: window.Partidas.state.isPaused,
        statusTag: document.getElementById('match-status-tag')?.innerText
      };
    })()
  `);
  console.log('Estado após 1.5s de clique em INICIAR:', timerAfterStart);

  // 4. Teste do Botão + GOL Time 1
  console.log('\n--- 4. Testando Clique no Botão + GOL Time 1 ---');
  await client.eval(`
    const btn = document.getElementById('btn-add-goal-home') || document.getElementById('btn-goal-home');
    btn.click();
  `);
  await sleep(500);

  const modalGoalAudit = await client.eval(`
    (() => {
      const modal = document.getElementById('modal-select-goal-author');
      return {
        modalExists: Boolean(modal),
        modalClass: modal?.className,
        playersListCount: modal?.querySelectorAll('.btn-select-player')?.length || 0,
        title: modal?.querySelector('#modal-goal-author-title')?.innerText
      };
    })()
  `);
  console.log('Auditoria Modal de Gol:', modalGoalAudit);

  client.close();
  edgeProc.kill();
  console.log('\n✅ Diagnóstico concluído.');
}

run().catch(e => {
  console.error('Erro na auditoria:', e);
  process.exit(1);
});
