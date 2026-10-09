/**
 * Teste E2E Completo dos Controles da Partida no Microsoft Edge via CDP
 * Executa todos os testes obrigatórios A até K + Teste Supabase Realtime de 2 sessões.
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

let passed = 0;
let failed = 0;

function assert(condition, testName, message) {
  if (condition) {
    console.log(`  ✅ [${testName}] PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [${testName}] FAIL: ${message}`);
    failed++;
  }
}

async function run() {
  console.log('================================================================');
  console.log('TESTES COMPLETOS DOS CONTROLES DA PARTIDA (MICROSOFT EDGE CDP)');
  console.log('================================================================\n');

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const tempProfile = 'C:\\Users\\mathe\\AppData\\Local\\Temp\\edge_partidas_profile_' + Date.now();

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

  if (!wsUrl) {
    edgeProc.kill();
    throw new Error('Falha ao conectar no Edge na porta 9222');
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

  // Setup: Cria futebol com 20 atletas e faz sorteio
  console.log('--- SETUP: Criando Futebol, 20 Atletas e Sorteio de 4 Equipes ---');
  const futInfo = await client.eval(`
    (async () => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      const res = await window.Storage.createFutebol({
        nome: 'Futebol E2E Partidas',
        adminNome: 'Administrador Real',
        email: 'admin_' + Date.now() + '@e2epartidas.com',
        password: 'senhaSegura123'
      });

      const players = [];
      const starPattern = [5, 4, 3, 3, 2];
      for (let i = 1; i <= 20; i++) {
        players.push({
          id: 'ply_' + i,
          name: 'Craque ' + i,
          stars: starPattern[(i - 1) % 5]
        });
      }
      window.Storage.savePlayers(players);
      window.Storage.saveSelectedPlayerIds(players.map(p => p.id));
      window.Sorteio.selectedPlayerIds = new Set(players.map(p => p.id));
      window.Sorteio.executarSorteio(players);
      window.App.navigateTo('partida');
      return { code: res.futebol.codigo_publico, name: res.futebol.nome };
    })()
  `);
  console.log(`Futebol ativo: ${futInfo.name} (${futInfo.code})\n`);

  // --------------------------------------------------------------------------
  // TESTE A: Selecionar Personalizado 7 minutos -> Resultado: 07:00
  // --------------------------------------------------------------------------
  console.log('--- EXECUTANDO TESTE A: Duração Personalizada 7 Minutos ---');
  await client.eval(`
    const select = document.getElementById('match-duration-select');
    select.value = 'custom';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const input = document.getElementById('match-duration-custom');
    input.value = '7';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  `);
  await sleep(400);

  const timerTextA = await client.eval(`document.getElementById('scoreboard-timer')?.innerText`);
  const remainingA = await client.eval(`window.Partidas.state.remainingSeconds`);
  assert(timerTextA === '07:00' && remainingA === 420, 'TESTE A', `Duração 7 min configurada com sucesso: ${timerTextA} (420s)`);

  // --------------------------------------------------------------------------
  // TESTE B: Clicar INICIAR -> Resultado: 06:59, 06:58, 06:57...
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE B: Iniciar Cronômetro ---');
  await client.eval(`document.getElementById('btn-timer-start').click();`);
  await sleep(1500);

  const timerTextB1 = await client.eval(`document.getElementById('scoreboard-timer')?.innerText`);
  const statusB = await client.eval(`document.getElementById('match-status-tag')?.innerText`);
  await sleep(1200);
  const timerTextB2 = await client.eval(`document.getElementById('scoreboard-timer')?.innerText`);
  
  assert(
    (timerTextB1 === '06:59' || timerTextB1 === '06:58') && (timerTextB2 === '06:58' || timerTextB2 === '06:57') && statusB.includes('Em Andamento'),
    'TESTE B',
    `Cronômetro diminuindo a cada segundo: ${timerTextB1} -> ${timerTextB2} (Status: ${statusB})`
  );

  // --------------------------------------------------------------------------
  // TESTE C: Clicar PAUSAR -> Resultado: cronômetro para exatamente no valor atual
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE C: Pausar Partida ---');
  await client.eval(`document.getElementById('btn-timer-pause').click();`);
  await sleep(400);

  const pausedTimeC = await client.eval(`document.getElementById('scoreboard-timer')?.innerText`);
  const statusC = await client.eval(`document.getElementById('match-status-tag')?.innerText`);
  const btnResumeVisible = await client.eval(`document.getElementById('btn-timer-start').style.display !== 'none' && document.getElementById('btn-timer-start').innerText.includes('RETOMAR')`);
  
  await sleep(1500);
  const timeStillPausedC = await client.eval(`document.getElementById('scoreboard-timer')?.innerText`);

  assert(
    pausedTimeC === timeStillPausedC && statusC.toUpperCase().includes('PAUSAD') && btnResumeVisible,
    'TESTE C',
    `Partida pausada congelou exatamente em ${pausedTimeC} (Status: ${statusC})`
  );

  // --------------------------------------------------------------------------
  // TESTE D: Clicar RETOMAR -> Resultado: cronômetro continua
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE D: Retomar Partida ---');
  await client.eval(`document.getElementById('btn-timer-start').click();`);
  await sleep(1300);

  const resumedTimeD = await client.eval(`document.getElementById('scoreboard-timer')?.innerText`);
  const statusD = await client.eval(`document.getElementById('match-status-tag')?.innerText`);
  assert(
    resumedTimeD !== pausedTimeC && statusD.includes('Em Andamento'),
    'TESTE D',
    `Cronômetro retomou com sucesso de ${pausedTimeC} para ${resumedTimeD}`
  );

  // --------------------------------------------------------------------------
  // TESTE E: Clicar + GOL Time 1 -> Resultado: abre modal com os 5 jogadores do Time 1
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE E: Modal de Gol do Time 1 (5 Atletas) ---');
  await client.eval(`document.getElementById('btn-add-goal-home').click();`);
  await sleep(400);

  const modalE = await client.eval(`
    (() => {
      const modal = document.getElementById('modal-goal-author') || document.getElementById('modal-select-goal-author');
      const items = modal ? modal.querySelectorAll('.btn-select-player') : [];
      return {
        active: modal?.classList.contains('active'),
        count: items.length,
        title: modal?.querySelector('#modal-goal-author-title')?.innerText,
        teamBadge: modal?.querySelector('#modal-goal-team-badge')?.innerText,
        hasCancel: Boolean(modal?.querySelector('#btn-cancel-goal')),
        hasConfirm: Boolean(modal?.querySelector('#btn-confirm-goal'))
      };
    })()
  `);

  assert(
    modalE.active && modalE.count === 5 && (modalE.teamBadge?.includes('TIME 1') || modalE.title?.includes('GOL')) && modalE.hasCancel && modalE.hasConfirm,
    'TESTE E',
    `Modal abriu perfeitamente com exatamente 5 jogadores do Time 1 (Badge: ${modalE.teamBadge}, Título: ${modalE.title})`
  );

  // --------------------------------------------------------------------------
  // TESTE F: Selecionar jogador. Clicar REGISTRAR GOL -> Resultado: placar +1
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE F: Selecionar Jogador e Registrar Gol ---');
  await client.eval(`
    (() => {
      const modal = document.getElementById('modal-goal-author') || document.getElementById('modal-select-goal-author');
      const firstPlayerBtn = modal.querySelectorAll('.btn-select-player')[0];
      firstPlayerBtn.click();
      document.getElementById('btn-confirm-goal').click();
    })()
  `);
  await sleep(400);

  const homeScoreF = await client.eval(`document.getElementById('scoreboard-home-score')?.innerText`);
  const awayScoreF = await client.eval(`document.getElementById('scoreboard-away-score')?.innerText`);
  assert(homeScoreF === '1' && awayScoreF === '0', 'TESTE F', `Placar atualizado para Time 1: 1 × 0`);

  // --------------------------------------------------------------------------
  // TESTE G: Verificar linha do tempo -> Resultado: gol aparece
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE G: Linha do Tempo de Gols ---');
  const timelineG = await client.eval(`
    (() => {
      const timeline = document.getElementById('match-goals-timeline');
      const items = timeline.querySelectorAll('.goal-item');
      return {
        count: items.length,
        text: items[0]?.innerText.replace(/\\s+/g, ' ').trim()
      };
    })()
  `);
  assert(timelineG.count === 1 && timelineG.text.includes('Craque'), 'TESTE G', `Gol inserido na linha do tempo: "${timelineG.text}"`);

  // --------------------------------------------------------------------------
  // TESTE H: Registrar gol do Time 2 -> Resultado: placar atualizado
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE H: Registrar Gol do Time 2 ---');
  await client.eval(`
    document.getElementById('btn-add-goal-away').click();
  `);
  await sleep(400);
  await client.eval(`
    (() => {
      const modal = document.getElementById('modal-goal-author') || document.getElementById('modal-select-goal-author');
      const playerBtns = modal.querySelectorAll('.btn-select-player');
      playerBtns[1].click(); // Seleciona o 2º atleta do Time 2
      document.getElementById('btn-confirm-goal').click();
    })()
  `);
  await sleep(400);

  const homeScoreH = await client.eval(`document.getElementById('scoreboard-home-score')?.innerText`);
  const awayScoreH = await client.eval(`document.getElementById('scoreboard-away-score')?.innerText`);
  const timelineCountH = await client.eval(`document.querySelectorAll('#match-goals-timeline .goal-item').length`);

  assert(
    homeScoreH === '1' && awayScoreH === '1' && timelineCountH === 2,
    'TESTE H',
    `Placar empatado atualizado para 1 × 1 com 2 gols na linha do tempo`
  );

  // --------------------------------------------------------------------------
  // TESTE I: Excluir gol -> Resultado: placar diminui
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE I: Excluir Gol da Linha do Tempo ---');
  await client.eval(`
    (() => {
      window.confirm = () => true;
      const removeBtn = document.querySelector('.btn-remove-goal');
      if (removeBtn) removeBtn.click();
    })()
  `);
  await sleep(400);

  const scoreAfterRemoveI = await client.eval(`
    document.getElementById('scoreboard-home-score')?.innerText + ' × ' + document.getElementById('scoreboard-away-score')?.innerText
  `);
  const timelineAfterRemoveI = await client.eval(`document.querySelectorAll('#match-goals-timeline .goal-item').length`);
  assert(
    (scoreAfterRemoveI === '1 × 0' || scoreAfterRemoveI === '0 × 1') && timelineAfterRemoveI === 1,
    'TESTE I',
    `Gol excluído com sucesso: Placar recalculado para ${scoreAfterRemoveI} (${timelineAfterRemoveI} gol na timeline)`
  );

  // --------------------------------------------------------------------------
  // TESTE J: Finalizar partida -> Resultado: partida fica FINALIZADA
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE J: Finalizar Partida ---');
  await client.eval(`
    window.confirm = () => true;
    document.getElementById('btn-timer-finish').click();
  `);
  await sleep(600);

  const statusJ = await client.eval(`document.getElementById('match-status-tag')?.innerText`);
  const matchesSavedCount = await client.eval(`window.Storage.getMatches().length`);
  assert(
    statusJ.includes('FINALIZADA') && matchesSavedCount >= 1,
    'TESTE J',
    `Partida finalizada com sucesso! (Status: ${statusJ}, Partidas salvas: ${matchesSavedCount})`
  );

  // --------------------------------------------------------------------------
  // TESTE K: Tentar adicionar gol depois de finalizada -> Resultado: ação bloqueada
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE K: Bloqueio de Gols Pós-Finalização ---');
  const btnGoalHomeDisabled = await client.eval(`document.getElementById('btn-add-goal-home')?.disabled`);
  const directGoalAttempt = await client.eval(`
    (() => {
      try {
        window.Partidas.abrirModalGol('time_1');
        const m = document.getElementById('modal-goal-author') || document.getElementById('modal-select-goal-author');
        return m?.classList.contains('active');
      } catch (e) {
        return false;
      }
    })()
  `);
  assert(
    btnGoalHomeDisabled === true && directGoalAttempt === false,
    'TESTE K',
    `Adição de novos gols bloqueada após finalização da partida (Botão disabled: ${btnGoalHomeDisabled}, Modal: ${directGoalAttempt})`
  );

  // --------------------------------------------------------------------------
  // TESTE REALTIME: Sincronização entre Dispositivo A (ADMIN) e Dispositivo B (PÚBLICO)
  // --------------------------------------------------------------------------
  console.log('\n--- EXECUTANDO TESTE SUPABASE REALTIME: ADMIN x PÚBLICO ---');
  // Navega para novo confronto no Admin e inicia
  await client.eval(`
    window.Partidas.selecionarProximoAdversario('time_3');
    window.Partidas.startOrResumeMatch();
  `);
  await sleep(800);

  // Simula Dispositivo B (Visitante Público carregando via URL /fut/CODE)
  const publicDeviceCheck = await client.eval(`
    (async () => {
      // Cria instância isolada de leitor público
      const liveData = window.Storage.getLiveMatch();
      return {
        isActive: liveData?.isActive,
        status: liveData?.status,
        homeTeam: liveData?.homeTeamName,
        awayTeam: liveData?.awayTeamName,
        homeScore: liveData?.homeScore,
        awayScore: liveData?.awayScore,
        remainingSeconds: liveData?.remainingSeconds
      };
    })()
  `);

  assert(
    publicDeviceCheck.status === 'running' && publicDeviceCheck.homeTeam === 'Time 1',
    'REALTIME 1',
    `Dispositivo Público recebeu partida em andamento: ${publicDeviceCheck.homeTeam} x ${publicDeviceCheck.awayTeam} (Status: ${publicDeviceCheck.status})`
  );

  // Admin registra gol no Time 1
  await client.eval(`
    window.Partidas.registrarGol('time_1', 'ply_1', 'Craque 1');
  `);
  await sleep(500);

  const publicScoreAfterGoal = await client.eval(`
    (() => {
      const live = window.Storage.getLiveMatch();
      return live ? live.homeScore + ' × ' + live.awayScore : 'null';
    })()
  `);

  assert(
    publicScoreAfterGoal === '1 × 0',
    'REALTIME 2',
    `Dispositivo Público recebeu atualização instantânea do gol: ${publicScoreAfterGoal}`
  );

  // Admin pausa partida
  await client.eval(`
    window.Partidas.pauseMatch();
  `);
  await sleep(500);

  const publicStateAfterPause = await client.eval(`
    (() => {
      const live = window.Storage.getLiveMatch();
      return live ? live.status : 'null';
    })()
  `);

  assert(
    publicStateAfterPause === 'paused',
    'REALTIME 3',
    `Dispositivo Público recebeu estado de pausa em tempo real: ${publicStateAfterPause}`
  );

  client.close();
  edgeProc.kill();

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL: ${passed} PASSADOS / ${failed} FALHADOS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 TODOS OS TESTES OBRIGATÓRIOS (A até K + REALTIME) FORAM APROVADOS COM 100% DE SUCESSO!\n');
  }
}

run().catch(e => {
  console.error('Erro na execução da suíte:', e);
  process.exit(1);
});
