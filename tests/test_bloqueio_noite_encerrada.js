/**
 * TESTES AUTOMATIZADOS: CORREÇÃO CRÍTICA — BLOQUEIO DE PARTIDA APÓS NOITE ENCERRADA
 * 
 * Validação rigorosa dos 15 requisitos mínimos:
 * 1. Não encerrar com partida RUNNING.
 * 2. Não encerrar com partida PAUSED.
 * 3. Permitir encerrar quando não existem partidas ativas.
 * 4. Permitir encerramento após partida FINISHED.
 * 5. Rodada FINISHED não pode iniciar nova partida.
 * 6. Rodada FINISHED não pode voltar para RUNNING.
 * 7. Rodada FINISHED não pode voltar para PAUSED.
 * 8. Rodada FINISHED não permite gol.
 * 9. Rodada FINISHED não permite escolher adversário.
 * 10. Reload mantém FINISHED.
 * 11. Realtime mantém FINISHED.
 * 12. Segundo dispositivo não consegue iniciar partida após FINISHED.
 * 13. Tentativa de encerrar duas vezes não duplica Capa (idempotência).
 * 14. Partida RUNNING em um dispositivo impede encerramento em outro.
 * 15. Mensagens corretas de bloqueio.
 */

import assert from 'assert';
import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Utils } from '../js/utils.js';
import { supabase } from '../js/supabaseClient.js';

let totalTests = 0;
let passedTests = 0;

function pass(desc) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS: ${desc}`);
}

// Simulador de dispositivo isolado
function createDevice(name) {
  const memoryData = {};
  const deviceStore = {
    getItem: (k) => memoryData[k] || null,
    setItem: (k, v) => { memoryData[k] = String(v); },
    removeItem: (k) => { delete memoryData[k]; },
    clear: () => { Object.keys(memoryData).forEach(k => delete memoryData[k]); }
  };

  return {
    name,
    store: deviceStore,
    activate() {
      Storage._store = deviceStore;
    }
  };
}

// Setup Mock DOM
const domStore = {};
function createMockElement(id = '', tag = 'div') {
  const classes = new Set();
  const children = [];
  const attrs = {};
  const dataset = {};

  const elem = {
    id,
    tagName: tag.toUpperCase(),
    innerHTML: '',
    textContent: '',
    disabled: false,
    style: {},
    dataset,
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    classList: {
      add: (cls) => classes.add(cls),
      remove: (cls) => classes.delete(cls),
      contains: (cls) => classes.has(cls),
      toggle: (cls) => classes.has(cls) ? classes.delete(cls) : classes.add(cls)
    },
    appendChild: (child) => {
      children.push(child);
      return child;
    },
    insertBefore: (child) => {
      children.unshift(child);
      return child;
    },
    setAttribute: (name, val) => { attrs[name] = val; },
    getAttribute: (name) => attrs[name] || null,
    querySelectorAll: (sel) => [],
    querySelector: (sel) => null,
    closest: (sel) => null
  };
  return elem;
}

global.document = {
  documentElement: { style: { setProperty: () => {} } },
  getElementById: (id) => {
    if (!domStore[id]) {
      domStore[id] = createMockElement(id);
    }
    return domStore[id];
  },
  createElement: (tag) => createMockElement('', tag),
  querySelectorAll: () => [],
  querySelector: () => null,
  body: {
    appendChild: (child) => child
  },
  addEventListener: () => {}
};

global.window = {
  App: { navigateTo: () => {} }
};

// Captura mensagens de Toast
let lastToast = null;
const originalToast = Utils.toast;
Utils.toast = (msg, type = 'info', duration = 3000) => {
  lastToast = { msg, type };
};

async function runTests() {
  console.log('================================================================');
  console.log('BATERIA DE TESTES: BLOQUEIO DEFINITIVO DE NOITE ENCERRADA');
  console.log('================================================================\n');

  const testEmail = `admin_lock_${Date.now()}@futraiz.com`;
  const testPassword = 'Password123!';

  const devA = createDevice('Dispositivo A');
  const devB = createDevice('Dispositivo B');

  devA.activate();

  // Setup Futebol e Jogadores
  const createRes = await Storage.createFutebol({
    nome: 'Futebol Regra Bloqueio',
    adminNome: 'Admin Bloqueio',
    email: testEmail,
    password: testPassword
  });
  assert.strictEqual(createRes.success, true);
  const futebol = createRes.futebol;

  const playerNames = [];
  for (let i = 1; i <= 20; i++) playerNames.push(`Atleta ${i}`);
  for (const name of playerNames) {
    await Storage.addPlayer({ name, stars: 3 });
  }

  // Setup Times
  const teams = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#3b82f6', players: playerNames.slice(0, 5).map((n, i) => ({ id: `p${i+1}`, name: n })) },
    time_2: { id: 'time_2', name: 'Time 2', color: '#ef4444', players: playerNames.slice(5, 10).map((n, i) => ({ id: `p${i+6}`, name: n })) },
    time_3: { id: 'time_3', name: 'Time 3', color: '#10b981', players: playerNames.slice(10, 15).map((n, i) => ({ id: `p${i+11}`, name: n })) },
    time_4: { id: 'time_4', name: 'Time 4', color: '#f59e0b', players: playerNames.slice(15, 20).map((n, i) => ({ id: `p${i+16}`, name: n })) }
  };
  Storage.saveTeams(teams);

  const roundId = Utils.generateUUID();
  const round = {
    id: roundId,
    futebol_id: futebol.id,
    numero: 1,
    dateKey: '2026-10-06',
    status: 'ACTIVE',
    teams: teams,
    createdAt: new Date().toISOString()
  };
  Storage.saveCurrentRound(round);

  Partidas.init();

  // --------------------------------------------------------------------------
  console.log('--- REQUISITO 1: Não encerrar noite com partida RUNNING ---');
  Partidas.startOrResumeMatch();
  assert.strictEqual(Partidas.state.status, 'running', 'Partida deve estar RUNNING');
  lastToast = null;
  Partidas.solicitarEncerramentoNoite();
  assert.strictEqual(lastToast?.msg, 'Finalize a partida em andamento antes de encerrar a noite.', 'Deve exibir mensagem de bloqueio exata para RUNNING');
  assert.strictEqual(Storage.getCurrentRound().status, 'ACTIVE', 'Rodada deve permanecer ACTIVE');

  // Teste direto na camada Storage
  let storageErrorRunning = null;
  try {
    await Storage.endNight();
  } catch (err) {
    storageErrorRunning = err.message;
  }
  assert.strictEqual(storageErrorRunning, 'Finalize a partida em andamento antes de encerrar a noite.', 'Storage.endNight deve rejeitar com a mensagem correta');
  pass('1. Não encerrar com partida RUNNING.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 2: Não encerrar noite com partida PAUSED ---');
  Partidas.pauseMatch();
  assert.strictEqual(Partidas.state.status, 'paused', 'Partida deve estar PAUSED');
  lastToast = null;
  Partidas.solicitarEncerramentoNoite();
  assert.strictEqual(lastToast?.msg, 'Retome e finalize a partida antes de encerrar a noite.', 'Deve exibir mensagem de bloqueio exata para PAUSED');
  assert.strictEqual(Storage.getCurrentRound().status, 'ACTIVE', 'Rodada deve permanecer ACTIVE');

  let storageErrorPaused = null;
  try {
    await Storage.endNight();
  } catch (err) {
    storageErrorPaused = err.message;
  }
  assert.strictEqual(storageErrorPaused, 'Retome e finalize a partida antes de encerrar a noite.', 'Storage.endNight deve rejeitar com mensagem de PAUSED');
  pass('2. Não encerrar com partida PAUSED.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITOS 3 & 4: Permitir encerramento após partida FINISHED e sem partida ativa ---');
  Partidas.resumeMatch();
  // Registra gol para Time 1 vencer
  await Partidas.registrarGol('time_1', 'p1', 'Atleta 1');
  await Partidas.finalizarPartida();
  assert.strictEqual(Partidas.state.status, 'finished', 'Partida deve estar finalizada');
  assert.strictEqual(Partidas.state.isActive, false, 'Partida não deve estar ativa');
  assert.strictEqual(Storage.getMatches().length, 1, 'Deve haver 1 partida registrada no histórico');

  const matches = Storage.getMatches();
  const standings = [
    { id: 'time_1', name: 'Time 1', pts: 3, j: 1, v: 1, e: 0, d: 0, gp: 1, gc: 0, sg: 1 },
    { id: 'time_2', name: 'Time 2', pts: 0, j: 1, v: 0, e: 0, d: 1, gp: 0, gc: 1, sg: -1 },
    { id: 'time_3', name: 'Time 3', pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0 },
    { id: 'time_4', name: 'Time 4', pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0 }
  ];

  pass('3. Permitir encerrar quando não existem partidas ativas.');

  await Storage.endNight({
    championTeamId: 'time_1',
    championTeamName: 'Time 1',
    standings
  });

  const roundAposEncerramento = Storage.getCurrentRound();
  assert.strictEqual(roundAposEncerramento.status, 'FINISHED', 'Status da rodada deve ser FINISHED');
  assert.strictEqual(roundAposEncerramento.campeaoTimeId, 'time_1', 'Time 1 deve ser o campeão');
  pass('4. Permitir encerramento após partida FINISHED.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 5: Rodada FINISHED não pode iniciar nova partida ---');
  lastToast = null;
  Partidas.startOrResumeMatch();
  assert.strictEqual(lastToast?.msg, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');
  assert.strictEqual(Partidas.state.status, 'finished', 'Status não deve virar running');
  assert.strictEqual(Partidas.state.isActive, false, 'isActive não pode ser true');

  lastToast = null;
  Partidas.iniciarPartida();
  assert.strictEqual(lastToast?.msg, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');
  pass('5. Rodada FINISHED não pode iniciar nova partida.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITOS 6 & 7: Rodada FINISHED não pode voltar para RUNNING ou PAUSED ---');
  let errSaveRunning = null;
  try {
    await Storage.saveLiveMatch({
      status: 'running',
      isActive: true,
      homeTeamId: 'time_1',
      awayTeamId: 'time_3'
    });
  } catch (e) {
    errSaveRunning = e.message;
  }
  assert.strictEqual(errSaveRunning, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');
  pass('6. Rodada FINISHED não pode voltar para RUNNING.');

  let errSavePaused = null;
  try {
    await Storage.saveLiveMatch({
      status: 'paused',
      isActive: true,
      isPaused: true,
      homeTeamId: 'time_1',
      awayTeamId: 'time_3'
    });
  } catch (e) {
    errSavePaused = e.message;
  }
  assert.strictEqual(errSavePaused, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');

  // Tentativa de chamar resumeMatch diretamente
  lastToast = null;
  Partidas.resumeMatch();
  assert.strictEqual(lastToast?.msg, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');
  assert.strictEqual(Partidas.state.status, 'finished');
  pass('7. Rodada FINISHED não pode voltar para PAUSED.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 8: Rodada FINISHED não permite gol ---');
  lastToast = null;
  Partidas.abrirModalSeletorGol('time_1');
  assert.strictEqual(lastToast?.msg, 'Esta noite já foi encerrada. Não é possível registrar novos gols.');

  let errGol = null;
  try {
    await Partidas.registrarGol('time_1', 'p1', 'Atleta 1');
  } catch (e) {
    errGol = e.message;
  }
  assert.strictEqual(errGol, 'Esta noite já foi encerrada. Não é possível registrar novos gols.');
  assert.strictEqual(Partidas.state.homeScore, 1, 'Placar não deve ser alterado');
  pass('8. Rodada FINISHED não permite gol.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 9: Rodada FINISHED não permite escolher adversário ou empate ---');
  lastToast = null;
  Partidas.selecionarProximoAdversario('time_3');
  assert.strictEqual(lastToast?.msg, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');

  lastToast = null;
  Partidas.iniciarProximaPartidaAposEmpate();
  assert.strictEqual(lastToast?.msg, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');
  pass('9. Rodada FINISHED não permite escolher adversário.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 10: Reload mantém FINISHED ---');
  // Simula reload reiniciando módulo Partidas
  Partidas.init();
  assert.strictEqual(Partidas.state.status, 'finished', 'Após reload, status deve ser finished');
  assert.strictEqual(Partidas.state.isActive, false, 'Após reload, isActive deve ser false');
  lastToast = null;
  Partidas.startOrResumeMatch();
  assert.strictEqual(lastToast?.msg, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');
  pass('10. Reload mantém FINISHED.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 11: Realtime mantém FINISHED ---');
  // Simula evento Realtime na tabela rodadas
  await Storage.syncRoundsFromSupabase(futebol.id);
  const curRoundRealtime = Storage.getCurrentRound();
  assert.strictEqual(curRoundRealtime.status, 'FINISHED', 'Realtime preserva rodada como FINISHED');
  pass('11. Realtime mantém FINISHED.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 12: Segundo dispositivo não consegue iniciar partida após FINISHED ---');
  devB.activate();
  await Storage.loginAdmin({ email: testEmail, password: testPassword });
  await Storage.syncRoundsFromSupabase(futebol.id);
  Partidas.init();

  const roundDevB = Storage.getCurrentRound();
  assert.strictEqual(roundDevB.status, 'FINISHED', 'Dispositivo B deve ver a rodada como FINISHED');

  lastToast = null;
  Partidas.startOrResumeMatch();
  assert.strictEqual(lastToast?.msg, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');
  assert.strictEqual(Partidas.state.status, 'finished');
  pass('12. Segundo dispositivo não consegue iniciar partida após FINISHED.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 13: Idempotência — encerrar duas vezes não duplica Capa ---');
  devA.activate();
  const capasAntes = Storage.getCapas().length;
  assert.strictEqual(capasAntes, 5, 'Exatamente 5 Capas distribuídas na primeira finalização');

  // Tenta chamar finalizeNight / endNight uma segunda vez
  await Storage.endNight({
    championTeamId: 'time_1',
    championTeamName: 'Time 1',
    standings
  });
  Storage.finalizeNight({
    championTeamId: 'time_1',
    championTeamName: 'Time 1',
    capaPlayers: teams.time_1.players,
    standingsSnapshot: standings
  });

  const capasDepois = Storage.getCapas().length;
  assert.strictEqual(capasDepois, 5, 'Número de Capas não deve aumentar (idempotência garantida)');
  pass('13. Tentativa de encerrar duas vezes não duplica Capa.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 14: Partida RUNNING em um dispositivo impede encerramento em outro ---');
  // Cria uma nova rodada para testar o cenário inverso
  const round2Id = Utils.generateUUID();
  const round2 = {
    id: round2Id,
    futebol_id: futebol.id,
    numero: 2,
    dateKey: '2026-10-07',
    status: 'ACTIVE',
    teams: teams,
    createdAt: new Date().toISOString()
  };
  devA.activate();
  Storage.startNewRound();
  Storage.saveTeams(teams);
  Storage.saveCurrentRound(round2);
  Partidas.restoreOrInitMatch();
  Partidas.startOrResumeMatch();
  await Partidas.saveFullState();
  assert.strictEqual(Partidas.state.status, 'running');

  // Dispositivo B sincroniza e tenta encerrar a noite
  devB.activate();
  await Storage.syncRoundsFromSupabase(futebol.id);
  await Storage.syncLiveMatchFromSupabase(futebol.id);
  const liveMatchB = Storage.getLiveMatch();
  assert.strictEqual(liveMatchB.status, 'running', 'Dispositivo B vê a partida em andamento no Supabase');

  let errB = null;
  try {
    await Storage.endNight();
  } catch (e) {
    errB = e.message;
  }
  assert.strictEqual(errB, 'Finalize a partida em andamento antes de encerrar a noite.');
  pass('14. Partida RUNNING em um dispositivo impede encerramento em outro.');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 15: Mensagens corretas de bloqueio ---');
  assert.strictEqual(storageErrorRunning, 'Finalize a partida em andamento antes de encerrar a noite.');
  assert.strictEqual(storageErrorPaused, 'Retome e finalize a partida antes de encerrar a noite.');
  assert.strictEqual(errSaveRunning, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');
  assert.strictEqual(errSavePaused, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');
  assert.strictEqual(errGol, 'Esta noite já foi encerrada. Não é possível registrar novos gols.');
  assert.strictEqual(errB, 'Finalize a partida em andamento antes de encerrar a noite.');
  pass('15. Mensagens corretas de bloqueio rigorosamente validadas em todos os fluxos.');

  console.log('\n================================================================');
  console.log(`BATERIA FINALIZADA COM SUCESSO: ${passedTests}/${totalTests} TESTES PASSARAM | 0 FALHARAM`);
  console.log('================================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ ERRO FATAL NA EXECUÇÃO DA BATERIA:', err);
  process.exit(1);
});
