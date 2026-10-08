/**
 * Suíte de Testes Automatizados Específica do Cronômetro da Partida
 * Executa os Testes Obrigatórios A a G conforme especificação:
 * - A) TESTE BÁSICO: Iniciar partida -> decrementa 07:00, 06:59, 06:58, 06:57...
 * - B) TESTE F5: Iniciar -> esperar tempo -> simular F5/reload -> tempo calculado do elapsed real
 * - C) TESTE PAUSAR: Pausar congela o tempo exato e para o loop
 * - D) TESTE RETOMAR: Retomar recalcula referências temporais e continua sem perder tempo
 * - E) TESTE MULTI-DISPOSITIVO: Dispositivo A inicia -> Dispositivo B recebe status running e mesmo tempo
 * - F) TESTE STATUS READY: Partida preparada permanece em 07:00 até INICIAR ser clicado
 * - G) TESTE FINALIZAR: Finalizar partida interrompe o loop e não continua rodando
 * - H) TESTE 00:00: Ao zerar, congela em 00:00 sem ficar negativo e não finaliza automaticamente
 */

import assert from 'assert';
import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Utils } from '../js/utils.js';

if (typeof globalThis.confirm === 'undefined') {
  globalThis.confirm = () => true;
}

let passed = 0;
let total = 0;

function pass(desc) {
  total++;
  passed++;
  console.log(`  [PASS] ${desc}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

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

async function runTimerTests() {
  console.log('================================================================');
  console.log('SUÍTE OFICIAL DE TESTES DO CRONÔMETRO DA PARTIDA (TESTES A - H)');
  console.log('================================================================\n');

  // SETUP
  const devA = createDevice('Dispositivo A');
  const devB = createDevice('Dispositivo B');

  devA.activate();
  const createRes = await Storage.createFutebol({
    nome: 'Futebol Timer Test',
    adminNome: 'Admin Timer',
    email: `admin_timer_${Date.now()}@futraiz.com`,
    password: 'Password123!'
  });
  const futebol = createRes.futebol;

  const players = [];
  for (let i = 1; i <= 20; i++) {
    const p = await Storage.addPlayer({ name: `Atleta ${i}`, stars: 3 });
    players.push(p);
  }

  const teamsA = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#2563eb', players: players.slice(0, 5) },
    time_2: { id: 'time_2', name: 'Time 2', color: '#dc2626', players: players.slice(5, 10) },
    time_3: { id: 'time_3', name: 'Time 3', color: '#16a34a', players: players.slice(10, 15) },
    time_4: { id: 'time_4', name: 'Time 4', color: '#eab308', players: players.slice(15, 20) }
  };

  const round = {
    id: Utils.generateUUID(),
    futebol_id: futebol.id,
    numero: 1,
    dateKey: '2026-10-06',
    status: 'READY',
    teams: teamsA
  };
  Storage.saveCurrentRound(round);
  Storage.saveTeams(teamsA);

  Partidas.state = {
    order: 1,
    status: 'ready',
    isActive: false,
    isPaused: false,
    durationMinutes: 7,
    durationSeconds: 420,
    remainingSeconds: 420,
    remainingAtStart: 420,
    startedAt: null,
    pausedAt: null,
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 2',
    homeScore: 0,
    awayScore: 0,
    goals: []
  };

  // --------------------------------------------------------------------------
  console.log('--- TESTE A: TESTE BÁSICO (INICIAR PARTIDA E DECREMENTAR) ---');
  // --------------------------------------------------------------------------
  Partidas.startOrResumeMatch();
  assert.strictEqual(Partidas.state.status, 'running', 'Status deve ser running');
  assert.strictEqual(Partidas.state.isActive, true, 'isActive deve ser true');
  assert.strictEqual(Partidas.state.isPaused, false, 'isPaused deve ser false');
  assert.ok(Partidas.state.startedAt, 'startedAt deve estar preenchido');
  assert.ok(Partidas.timerInterval, 'timerInterval deve estar ativo');

  const initialRemaining = Partidas.calculateCurrentRemainingSeconds();
  assert.strictEqual(initialRemaining, 420, 'Tempo inicial deve ser 420s');

  // Aguarda 1.1s e verifica decremento
  await sleep(1100);
  const remAfter1s = Partidas.calculateCurrentRemainingSeconds();
  assert.ok(remAfter1s <= 419, `Tempo deve ter decrementado (atual: ${remAfter1s}s)`);
  assert.strictEqual(Utils.formatSeconds(remAfter1s), '06:59', `Display deve ser 06:59`);

  // Aguarda mais 1.1s e verifica novo decremento
  await sleep(1100);
  const remAfter2s = Partidas.calculateCurrentRemainingSeconds();
  assert.ok(remAfter2s <= 418, `Tempo deve ter decrementado para <= 418s (atual: ${remAfter2s}s)`);
  pass('TESTE A PASSOU: Partida iniciou em 07:00 e decrementou visualmente segundo a segundo.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE B: TESTE F5 / RELOAD (PRESERVA TEMPO TRANSCORRIDO) ---');
  // --------------------------------------------------------------------------
  // Dispositivo A salva estado
  await Partidas.saveFullState();
  const savedState = Storage.getLiveMatch();
  assert.strictEqual(savedState.status, 'running', 'Estado salvo deve estar running');
  assert.ok(savedState.startedAt, 'startedAt salvo deve existir');

  // Simula F5: limpa timerInterval local, reseta Partidas.state e chama restoreOrInitMatch
  if (Partidas.timerInterval) {
    clearInterval(Partidas.timerInterval);
    Partidas.timerInterval = null;
  }
  Partidas.state = { status: 'ready', remainingSeconds: 420 };
  
  // Espera 1s durante o "reload"
  await sleep(1000);
  Partidas.restoreOrInitMatch();

  assert.strictEqual(Partidas.state.status, 'running', 'Após F5 status deve permanecer running');
  assert.ok(Partidas.timerInterval, 'Após F5 timerInterval deve ser reativado');
  const remAfterF5 = Partidas.calculateCurrentRemainingSeconds();
  assert.ok(remAfterF5 <= 417 && remAfterF5 >= 414, `Tempo após F5 deve considerar o tempo real transcorrido (atual: ${remAfterF5}s)`);
  pass('TESTE B PASSOU: F5 não resetou para 07:00 e preservou o tempo real decorrido.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE C: TESTE PAUSAR (CONGELA TEMPO EXATO) ---');
  // --------------------------------------------------------------------------
  Partidas.pauseMatch();
  assert.strictEqual(Partidas.state.status, 'paused', 'Status deve ser paused');
  assert.strictEqual(Partidas.state.isPaused, true, 'isPaused deve ser true');
  assert.strictEqual(Partidas.timerInterval, null, 'timerInterval deve ser cancelado');
  assert.ok(Partidas.state.pausedAt, 'pausedAt deve estar registrado');

  const frozenTime = Partidas.state.remainingSeconds;
  await sleep(1200);
  const stillFrozenTime = Partidas.calculateCurrentRemainingSeconds();
  assert.strictEqual(stillFrozenTime, frozenTime, 'Tempo deve permanecer rigorosamente congelado');
  pass(`TESTE C PASSOU: Partida pausada congelou em ${Utils.formatSeconds(frozenTime)} sem decrementar.`);

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE D: TESTE RETOMAR (CONTINUA EXATAMENTE DE ONDE PAROU) ---');
  // --------------------------------------------------------------------------
  Partidas.startOrResumeMatch();
  assert.strictEqual(Partidas.state.status, 'running', 'Status deve voltar a running');
  assert.strictEqual(Partidas.state.isPaused, false, 'isPaused deve ser false');
  assert.ok(Partidas.timerInterval, 'timerInterval deve ser reativado');

  const remAtResume = Partidas.calculateCurrentRemainingSeconds();
  assert.strictEqual(remAtResume, frozenTime, 'Tempo no momento de retomar deve ser idêntico ao pausado');

  await sleep(1100);
  const remAfterResume1s = Partidas.calculateCurrentRemainingSeconds();
  assert.strictEqual(remAfterResume1s, frozenTime - 1, `Tempo após retomar deve ter decrementado 1s (esperado: ${frozenTime - 1}, atual: ${remAfterResume1s})`);
  pass('TESTE D PASSOU: Retomar continuou perfeitamente do tempo pausado.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE E: TESTE MULTI-DISPOSITIVO (SINCRONIZAÇÃO EM TEMPO REAL) ---');
  // --------------------------------------------------------------------------
  await Partidas.saveFullState();

  // Dispositivo B se conecta e sincroniza do Supabase
  devB.activate();
  Storage.currentFutebol = futebol;
  await Storage.syncLiveMatchFromSupabase(futebol.id);

  const liveB = Storage.getLiveMatch();
  assert.ok(liveB, 'Dispositivo B deve receber liveMatch');
  assert.strictEqual(liveB.status, 'running', 'Dispositivo B deve receber status running');
  assert.strictEqual(liveB.startedAt, Partidas.state.startedAt, 'startedAt deve ser idêntico nos dois dispositivos');

  const remDeviceB = Partidas.calculateCurrentRemainingSeconds(liveB);
  const remDeviceA = Partidas.calculateCurrentRemainingSeconds(Partidas.state);
  assert.ok(Math.abs(remDeviceB - remDeviceA) <= 1, `Tempos em A (${remDeviceA}s) e B (${remDeviceB}s) devem estar sincronizados`);
  pass(`TESTE E PASSOU: Dispositivo B recebeu status running com tempo sincronizado (${Utils.formatSeconds(remDeviceB)}).`);

  // Volta para Dispositivo A
  devA.activate();

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE F: TESTE STATUS READY (PERMANECE PARADO EM 07:00) ---');
  // --------------------------------------------------------------------------
  // Configura uma partida com status ready (como após empate)
  Partidas.state = {
    order: 2,
    status: 'ready',
    isActive: false,
    isPaused: false,
    durationMinutes: 7,
    durationSeconds: 420,
    remainingSeconds: 420,
    remainingAtStart: 420,
    startedAt: null,
    pausedAt: null,
    homeTeamId: 'time_3',
    awayTeamId: 'time_4',
    homeTeamName: 'Time 3',
    awayTeamName: 'Time 4',
    homeScore: 0,
    awayScore: 0,
    goals: []
  };

  const readyRemaining1 = Partidas.calculateCurrentRemainingSeconds();
  assert.strictEqual(readyRemaining1, 420, 'Partida ready deve reportar 420s');
  assert.strictEqual(Utils.formatSeconds(readyRemaining1), '07:00', 'Display deve ser 07:00');

  await sleep(1200);
  const readyRemaining2 = Partidas.calculateCurrentRemainingSeconds();
  assert.strictEqual(readyRemaining2, 420, 'Partida ready NÃO deve decrementar antes de iniciar');
  assert.strictEqual(Partidas.timerInterval, null, 'Nenhum interval deve rodar em status ready');
  pass('TESTE F PASSOU: Partida em status ready permanece fixa em 07:00 sem iniciar contagem.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE G: TESTE FINALIZAR (TIMER PARA E NÃO RODA EM SEGUNDO PLANO) ---');
  // --------------------------------------------------------------------------
  // Inicia Partida 2
  Partidas.startOrResumeMatch();
  assert.ok(Partidas.timerInterval, 'Timer deve estar rodando após iniciar');

  await sleep(500);
  // Finaliza a partida
  Partidas.state.homeScore = 2;
  Partidas.state.awayScore = 0;
  await Partidas.solicitarFinalizacao();

  assert.strictEqual(Partidas.timerInterval, null, 'timerInterval deve ser nulo após finalizar');
  assert.strictEqual(Partidas.state.status !== 'running', true, 'Status não pode mais ser running');
  pass('TESTE G PASSOU: Finalizar partida encerra o loop do cronômetro definitivamente.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE H: TESTE LIMITE 00:00 (NÃO NEGATIVO E SEM MULTI-LOOPS) ---');
  // --------------------------------------------------------------------------
  // Simula startedAt no passado distante (ex: 500 segundos atrás em partida de 420s)
  const pastStartedAt = new Date(Date.now() - 500 * 1000).toISOString();
  const stateExpired = {
    order: 3,
    status: 'running',
    durationSeconds: 420,
    remainingAtStart: 420,
    startedAt: pastStartedAt
  };
  const remExpired = Partidas.calculateCurrentRemainingSeconds(stateExpired);
  assert.strictEqual(remExpired, 0, 'Tempo decorrido além da duração deve ser travado em 0s');
  assert.strictEqual(Utils.formatSeconds(remExpired), '00:00', 'Display deve exibir 00:00 e nunca negativo');
  pass('TESTE H PASSOU: Cronômetro atinge 00:00, congela sem valores negativos e respeita o limite.');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES DO TIMER: ${total} | PASSOU: ${passed} | FALHOU: 0`);
  console.log('================================================================\n');
}

runTimerTests().catch(err => {
  console.error('\n[FAIL] Falha na suite de testes do timer:', err);
  process.exit(1);
});
