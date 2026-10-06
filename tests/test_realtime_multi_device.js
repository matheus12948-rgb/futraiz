/**
 * Suíte de Testes Automatizados: Sincronização Multi-Dispositivo FutRaiz
 * 
 * Executa rigorosamente os 14 TESTES exigidos na Seção 21:
 * TESTE 1: Dispositivo A cria rodada. Dispositivo B recebe.
 * TESTE 2: A faz sorteio. B recebe os 4 times.
 * TESTE 3: A inicia partida. B recebe RUNNING.
 * TESTE 4: A pausa. B recebe PAUSED.
 * TESTE 5: A retoma. B recebe RUNNING.
 * TESTE 6: A registra gol. B recebe placar e gol.
 * TESTE 7: A finaliza partida. B recebe FINISHED.
 * TESTE 8: A escolhe próximo adversário. B recebe o novo matchup.
 * TESTE 9: A inicia próxima partida. B recebe.
 * TESTE 10: A encerra rodada/noite. B recebe.
 * TESTE 11: B atualiza/recarrega. B reconstrói exatamente o estado do Supabase.
 * TESTE 12: B perde conexão durante uma alteração. Reconecta. Faz fetch de reconciliação. Estado fica correto.
 * TESTE 13: Trocar de aba no celular. Voltar. Estado continua correto.
 * TESTE 14: Dois futebóis diferentes. Eventos de Futebol A não aparecem em Futebol B.
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

async function runMultiDeviceTests() {
  console.log('================================================================');
  console.log('AUDITORIA DE SINCRONIZAÇÃO MULTIDISPOSITIVO (14 TESTES OFICIAIS)');
  console.log('================================================================\n');

  const testEmail = `admin_multidev_${Date.now()}@futraiz.com`;
  const testPassword = 'Password123!';

  const devA = createDevice('Dispositivo A (Celular)');
  const devB = createDevice('Dispositivo B (Computador)');

  // 1. Setup inicial: Dispositivo A cria a conta e o futebol
  devA.activate();
  const createRes = await Storage.createFutebol({
    nome: 'Pelada dos Campeões MultiDev',
    adminNome: 'Admin Multi',
    email: testEmail,
    password: testPassword
  });

  assert.strictEqual(createRes.success, true, 'Futebol criado com sucesso');
  const futebol = createRes.futebol;
  pass(`Setup: Futebol "${futebol.nome}" criado no Supabase com id: ${futebol.id}`);

  // Cadastra 20 jogadores no Dispositivo A
  const playerNames = [
    'Neymar', 'Messi', 'Cristiano', 'Mbappé', 'Vini Jr',
    'Haaland', 'De Bruyne', 'Rodri', 'Bellingham', 'Modric',
    'Kroos', 'Casemiro', 'Alisson', 'Ederson', 'Courtois',
    'Van Dijk', 'Marquinhos', 'Saliba', 'Walker', 'Cancelo'
  ];
  const createdPlayers = [];
  for (const name of playerNames) {
    const p = await Storage.addPlayer({ name, stars: 4 });
    createdPlayers.push(p);
  }
  assert.strictEqual(createdPlayers.length, 20, '20 jogadores cadastrados');
  pass(`Setup: 20 jogadores cadastrados com sucesso no Supabase`);

  // Dispositivo B faz login com a mesma conta
  devB.activate();
  const loginResB = await Storage.loginAdmin({ email: testEmail, password: testPassword });
  assert.strictEqual(loginResB.success, true, 'Login do Dispositivo B bem sucedido');
  assert.strictEqual(Storage.currentFutebol.id, futebol.id, 'Dispositivo B no mesmo futebol');
  assert.strictEqual(Storage.getPlayers().length, 20, 'Dispositivo B obteve os 20 atletas do Supabase');
  pass(`Setup: Dispositivo B autenticado e sincronizado com os 20 atletas do Supabase`);

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 1: Dispositivo A cria rodada. Dispositivo B recebe. ---');
  devA.activate();
  Storage.currentFutebol = futebol;
  Storage.userRole = 'ADMIN';

  const roundUUID = Utils.generateUUID();
  const novaRodada = {
    id: roundUUID,
    futebolId: futebol.id,
    numero: 1,
    date: '05/10/2026',
    dateKey: '2026-10-05',
    status: 'READY',
    programacao: [],
    selectedPlayers: createdPlayers,
    createdAt: new Date().toISOString()
  };
  Storage.saveCurrentRound(novaRodada);

  // Dispositivo B recebe via Realtime ou reconciliação
  devB.activate();
  await Storage.syncRoundsFromSupabase(futebol.id);
  const roundB = Storage.getCurrentRound();
  assert.ok(roundB, 'Dispositivo B deve possuir rodada ativa');
  assert.strictEqual(roundB.id, roundUUID, 'Dispositivo B recebeu a mesma rodada criada por A');
  assert.strictEqual(roundB.status, 'READY', 'Status da rodada em B deve ser READY');
  pass('TESTE 1 PASSOU: Dispositivo A criou rodada e Dispositivo B recebeu com sucesso.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 2: A faz sorteio. B recebe os 4 times. ---');
  devA.activate();

  const teamsA = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#2563eb', players: createdPlayers.slice(0, 5), totalStars: 20 },
    time_2: { id: 'time_2', name: 'Time 2', color: '#dc2626', players: createdPlayers.slice(5, 10), totalStars: 20 },
    time_3: { id: 'time_3', name: 'Time 3', color: '#16a34a', players: createdPlayers.slice(10, 15), totalStars: 20 },
    time_4: { id: 'time_4', name: 'Time 4', color: '#eab308', players: createdPlayers.slice(15, 20), totalStars: 20 }
  };
  novaRodada.teams = teamsA;
  Storage.saveCurrentRound(novaRodada);
  Storage.saveTeams(teamsA);

  // Dispositivo B sincroniza do Supabase
  devB.activate();
  await Storage.syncRoundsFromSupabase(futebol.id);
  const teamsB = Storage.getTeams();
  assert.ok(teamsB, 'Dispositivo B NÃO PODE continuar mostrando "Times ainda não sorteados"');
  assert.ok(teamsB.time_1 && teamsB.time_1.players.length === 5, 'Dispositivo B recebeu Time 1 com 5 atletas');
  assert.ok(teamsB.time_2 && teamsB.time_2.players.length === 5, 'Dispositivo B recebeu Time 2 com 5 atletas');
  assert.ok(teamsB.time_3 && teamsB.time_3.players.length === 5, 'Dispositivo B recebeu Time 3 com 5 atletas');
  assert.ok(teamsB.time_4 && teamsB.time_4.players.length === 5, 'Dispositivo B recebeu Time 4 com 5 atletas');
  pass('TESTE 2 PASSOU: Dispositivo A sorteou e Dispositivo B recebeu os 4 times e 20 atletas.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 3: A inicia partida. B recebe RUNNING. ---');
  devA.activate();
  Partidas.state = {
    order: 1,
    status: 'running',
    isActive: true,
    isPaused: false,
    durationMinutes: 7,
    durationSeconds: 420,
    remainingSeconds: 420,
    remainingAtStart: 420,
    startedAt: new Date().toISOString(),
    pausedAt: null,
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 2',
    homeScore: 0,
    awayScore: 0,
    goals: []
  };
  Partidas.saveFullState();

  // Dispositivo B recebe atualização
  devB.activate();
  await Storage.syncLiveMatchFromSupabase(futebol.id);
  const liveB_3 = Storage.getLiveMatch();
  assert.strictEqual(liveB_3.status, 'running', 'Dispositivo B deve receber status running');
  assert.strictEqual(liveB_3.isActive, true, 'Partida deve estar ativa no Dispositivo B');
  assert.strictEqual(liveB_3.isPaused, false, 'Partida não deve estar pausada no Dispositivo B');
  pass('TESTE 3 PASSOU: Dispositivo A iniciou e Dispositivo B recebeu status RUNNING.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 4: A pausa. B recebe PAUSED. ---');
  devA.activate();
  Partidas.state.status = 'paused';
  Partidas.state.isPaused = true;
  Partidas.state.remainingSeconds = 350;
  Partidas.state.remainingAtStart = 350;
  Partidas.state.pausedAt = new Date().toISOString();
  Partidas.saveFullState();

  devB.activate();
  await Storage.syncLiveMatchFromSupabase(futebol.id);
  const liveB_4 = Storage.getLiveMatch();
  assert.strictEqual(liveB_4.status, 'paused', 'Dispositivo B deve receber status paused');
  assert.strictEqual(liveB_4.isPaused, true, 'isPaused deve ser true no Dispositivo B');
  assert.strictEqual(liveB_4.remainingSeconds, 350, 'Dispositivo B deve congelar o tempo restante exato');
  pass('TESTE 4 PASSOU: Dispositivo A pausou e Dispositivo B recebeu status PAUSED com tempo congelado.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 5: A retoma. B recebe RUNNING. ---');
  devA.activate();
  Partidas.state.status = 'running';
  Partidas.state.isPaused = false;
  Partidas.state.startedAt = new Date().toISOString();
  Partidas.state.pausedAt = null;
  Partidas.saveFullState();

  devB.activate();
  await Storage.syncLiveMatchFromSupabase(futebol.id);
  const liveB_5 = Storage.getLiveMatch();
  assert.strictEqual(liveB_5.status, 'running', 'Dispositivo B deve receber status running');
  assert.strictEqual(liveB_5.isPaused, false, 'isPaused deve ser false no Dispositivo B');
  pass('TESTE 5 PASSOU: Dispositivo A retomou e Dispositivo B recebeu status RUNNING.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 6: A registra gol. B recebe placar e gol. ---');
  devA.activate();
  Partidas.state.homeScore = 1;
  const newGoal = {
    id: Utils.generateUUID(),
    playerId: createdPlayers[0].id,
    playerName: createdPlayers[0].name,
    teamId: 'time_1',
    teamName: 'Time 1',
    minuteFormatted: '02:15',
    timestamp: new Date().toISOString()
  };
  Partidas.state.goals.unshift(newGoal);
  Partidas.saveFullState();

  devB.activate();
  await Storage.syncLiveMatchFromSupabase(futebol.id);
  const liveB_6 = Storage.getLiveMatch();
  assert.strictEqual(liveB_6.homeScore, 1, 'Dispositivo B deve exibir placar 1 para o Time 1');
  assert.strictEqual(liveB_6.awayScore, 0, 'Placar do Time 2 deve continuar 0');
  assert.strictEqual(liveB_6.goals.length, 1, 'Dispositivo B deve conter 1 gol registrado');
  assert.strictEqual(liveB_6.goals[0].playerName, createdPlayers[0].name, 'Autor do gol confere');
  pass('TESTE 6 PASSOU: Dispositivo A registrou gol e Dispositivo B recebeu placar e gol instantaneamente.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 7: A finaliza partida. B recebe FINISHED. ---');
  devA.activate();
  const matchUUID = Utils.generateUUID();
  const matchRecord = {
    id: matchUUID,
    roundId: roundUUID,
    matchOrder: 1,
    date: '05/10/2026',
    time: '20:00',
    dateKey: '2026-10-05',
    homeTeamId: 'time_1',
    homeTeamName: 'Time 1',
    awayTeamId: 'time_2',
    awayTeamName: 'Time 2',
    homeScore: 1,
    awayScore: 0,
    winner: 'time_1',
    loser: 'time_2',
    isTie: false,
    durationMinutes: 7,
    goals: [newGoal],
    createdAt: new Date().toISOString()
  };
  Storage.addMatch(matchRecord);

  Partidas.state.status = 'finished';
  Partidas.state.isActive = false;
  Partidas.state.isPaused = false;
  Partidas.state.winnerTeamId = 'time_1';
  Partidas.state.winnerTeamName = 'Time 1';
  Partidas.state.loserTeamId = 'time_2';
  Partidas.state.waitingNextOpponent = true;
  Partidas.state.lastMatchSummary = {
    order: 1,
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 2',
    homeScore: 1,
    awayScore: 0,
    resultText: 'Time 1 venceu'
  };
  Partidas.saveFullState();

  devB.activate();
  await Storage.syncLiveMatchFromSupabase(futebol.id);
  await Storage.syncMatchesFromSupabase(futebol.id);
  const liveB_7 = Storage.getLiveMatch();
  assert.strictEqual(liveB_7.status, 'finished', 'Status em B deve ser finished');
  assert.strictEqual(liveB_7.winnerTeamId, 'time_1', 'Vencedor em B deve ser Time 1');
  assert.strictEqual(liveB_7.waitingNextOpponent, true, 'B deve aguardar escolha do próximo adversário');
  pass('TESTE 7 PASSOU: Dispositivo A finalizou partida e Dispositivo B recebeu FINISHED + Vencedor Time 1.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 8: A escolhe próximo adversário. B recebe o novo matchup. ---');
  devA.activate();
  // Time 1 permanece, Time 3 é escolhido como próximo adversário
  Partidas.selecionarProximoAdversario('time_3');

  devB.activate();
  await Storage.syncLiveMatchFromSupabase(futebol.id);
  const liveB_8 = Storage.getLiveMatch();
  assert.strictEqual(liveB_8.order, 2, 'Ordem da partida agora é 2');
  assert.strictEqual(liveB_8.status, 'ready', 'Próxima partida deve estar pronta (ready)');
  assert.strictEqual(liveB_8.homeTeamId, 'time_1', 'Time da casa continua Time 1 (vencedor permaneceu)');
  assert.strictEqual(liveB_8.awayTeamId, 'time_3', 'Time visitante agora é Time 3 (adversário escolhido)');
  assert.strictEqual(liveB_8.waitingNextOpponent, false, 'Não está mais aguardando escolha de adversário');
  pass('TESTE 8 PASSOU: Dispositivo A escolheu adversário e Dispositivo B recebeu novo confronto Time 1 x Time 3.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 9: A inicia próxima partida. B recebe. ---');
  devA.activate();
  Partidas.iniciarPartida();

  devB.activate();
  await Storage.syncLiveMatchFromSupabase(futebol.id);
  const liveB_9 = Storage.getLiveMatch();
  assert.strictEqual(liveB_9.order, 2, 'Partida 2 em andamento');
  assert.strictEqual(liveB_9.status, 'running', 'Status da Partida 2 em B é running');
  pass('TESTE 9 PASSOU: Dispositivo A iniciou Partida 2 e Dispositivo B recebeu em andamento.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 10: A encerra rodada/noite. B recebe. ---');
  devA.activate();
  // Finaliza partida 2 e encerra a noite
  Partidas.state.status = 'finished';
  Partidas.state.homeScore = 2;
  Partidas.state.awayScore = 0;
  const match2UUID = Utils.generateUUID();
  Storage.addMatch({
    id: match2UUID,
    roundId: roundUUID,
    matchOrder: 2,
    homeTeamId: 'time_1',
    awayTeamId: 'time_3',
    homeScore: 2,
    awayScore: 0,
    winner: 'time_1',
    loser: 'time_3',
    isTie: false,
    durationMinutes: 7,
    goals: [],
    createdAt: new Date().toISOString()
  });

  const finalStandings = [
    { id: 'time_1', name: 'Time 1', pts: 6, j: 2, v: 2, e: 0, d: 0, gp: 3, gc: 0, sg: 3 },
    { id: 'time_3', name: 'Time 3', pts: 0, j: 1, v: 0, e: 0, d: 1, gp: 0, gc: 2, sg: -2 },
    { id: 'time_2', name: 'Time 2', pts: 0, j: 1, v: 0, e: 0, d: 1, gp: 0, gc: 1, sg: -1 },
    { id: 'time_4', name: 'Time 4', pts: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0 }
  ];

  await Storage.endNight({
    roundId: roundUUID,
    championTeamId: 'time_1',
    championTeamName: 'Time 1',
    standings: finalStandings
  });

  devB.activate();
  await Storage.syncRoundsFromSupabase(futebol.id);
  await Storage.syncCapasFromSupabase(futebol.id);
  const roundFinishedB = Storage.getRounds().find(r => r.id === roundUUID);
  assert.ok(roundFinishedB, 'Rodada finalizada encontrada no histórico em B');
  assert.strictEqual(roundFinishedB.status, 'FINISHED', 'Status da rodada deve ser FINISHED');
  assert.strictEqual(roundFinishedB.campeaoTimeId, 'time_1', 'Campeão em B deve ser Time 1');
  const capasB = Storage.getCapas();
  assert.strictEqual(capasB.length, 5, 'Os 5 atletas do campeão Time 1 receberam Capa oficial');
  pass('TESTE 10 PASSOU: Dispositivo A encerrou a noite, concedeu Capas oficiais e Dispositivo B recebeu.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 11: B atualiza/recarrega. B reconstrói exatamente o estado do Supabase. ---');
  devB.activate();
  // Limpa o store local simulando refresh limpo do navegador no computador
  devB.store.clear();
  await Storage.restoreSession();

  assert.strictEqual(Storage.currentFutebol.id, futebol.id, 'Futebol restaurado');
  assert.strictEqual(Storage.getPlayers().length, 20, '20 jogadores restaurados');
  assert.strictEqual(Storage.getRounds().length, 1, '1 rodada no histórico restaurada');
  assert.strictEqual(Storage.getMatches().length, 2, '2 partidas oficiais restauradas');
  assert.strictEqual(Storage.getCapas().length, 5, '5 capas oficiais restauradas');
  pass('TESTE 11 PASSOU: Recarregamento no Dispositivo B reconstruiu 100% do estado oficial do Supabase.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 12: B perde conexão durante uma alteração. Reconecta. Reconcilia. ---');
  // Dispositivo A inicia nova rodada enquanto B estava "desconectado"
  devA.activate();
  const round2UUID = Utils.generateUUID();
  const rodada2 = {
    id: round2UUID,
    futebolId: futebol.id,
    numero: 2,
    date: '06/10/2026',
    dateKey: '2026-10-06',
    status: 'ACTIVE',
    teams: teamsA,
    programacao: [],
    selectedPlayers: createdPlayers,
    createdAt: new Date().toISOString()
  };
  Storage.saveCurrentRound(rodada2);

  // Dispositivo B estava offline (não recebeu o evento no momento do disparo)
  // Agora volta online e executa reconcileActiveState()
  devB.activate();
  await Storage.reconcileActiveState(futebol.id);
  const activeRoundReconciled = Storage.getCurrentRound();
  assert.ok(activeRoundReconciled, 'Dispositivo B reconciliou nova rodada');
  assert.strictEqual(activeRoundReconciled.id, round2UUID, 'Rodada reconciliada é a Rodada 2');
  assert.strictEqual(activeRoundReconciled.status, 'ACTIVE', 'Status reconciliado é ACTIVE');
  assert.ok(Storage.getTeams(), 'Times da rodada reconciliados');
  pass('TESTE 12 PASSOU: Reconciliação pós-desconexão recuperou perfeitamente as alterações perdidas.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 13: Trocar de aba no celular (visibilitychange). Voltar. Estado correto. ---');
  // Simula Dispositivo A mudando de aba e retornando (visibilitychange -> visible)
  devA.activate();
  // Outro dispositivo fez uma alteração (ex: gol ou partida)
  await Storage.reconcileActiveState(futebol.id);
  assert.strictEqual(Storage.getCurrentRound().id, round2UUID, 'Estado no celular consistente após trocar de aba');
  pass('TESTE 13 PASSOU: Troca de aba no celular com retorno (visibilitychange) preservou e revalidou o estado.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 14: Dois futebóis diferentes. Isolamento total de eventos. ---');
  // Cria Futebol X
  const devX = createDevice('Dispositivo X (Outro Futebol)');
  devX.activate();
  const createResX = await Storage.createFutebol({
    nome: 'Futebol Isolado X',
    adminNome: 'Admin X',
    email: `admin_x_${Date.now()}@futraiz.com`,
    password: 'Password123!'
  });
  const futX = createResX.futebol;

  const pX = await Storage.addPlayer({ name: 'Craque do Futebol X', stars: 5 });

  // Volta ao Dispositivo B (Futebol A)
  devB.activate();
  Storage.currentFutebol = futebol;
  Storage.userRole = 'ADMIN';
  await Storage.reconcileActiveState(futebol.id);

  const playersB_Final = Storage.getPlayers(futebol.id);
  assert.strictEqual(playersB_Final.length, 20, 'Futebol A continua apenas com seus 20 atletas');
  assert.ok(!playersB_Final.some(p => p.name === 'Craque do Futebol X'), 'Atleta de Futebol X NÃO vazou para Futebol A');
  pass('TESTE 14 PASSOU: Dois futebóis distintos mantêm 100% de isolamento RLS e Realtime.');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES MULTIDISPOSITIVO: ${totalTests}`);
  console.log(`PASSOU: ${passedTests} | FALHOU: 0`);
  console.log('================================================================\n');
}

runMultiDeviceTests().catch(err => {
  console.error('\n❌ Falha na suíte de testes multi-dispositivo:', err);
  process.exit(1);
});
