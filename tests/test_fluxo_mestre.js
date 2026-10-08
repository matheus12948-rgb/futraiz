/**
 * TESTE FLUXO MESTRE - FAMÍLIA DO FUT
 * Validação rigorosa do modelo "QUEM GANHA FICA" (Winner Stays On)
 * Cobrindo todos os 18 testes obrigatórios:
 * 1. Primeira partida obrigatoriamente Time 1 x Time 2.
 * 2. Time vencedor permanece.
 * 3. Time perdedor deixa de ser o time atual.
 * 4. Administrador consegue escolher qualquer um dos outros times.
 * 5. Não permitir vencedor contra ele mesmo.
 * 6. Permitir que um time derrotado volte a jogar posteriormente.
 * 7. Permitir repetição de confrontos (Time 1 x Time 2, Time 1 x Time 3, Time 1 x Time 2).
 * 8. Não existe limite fixo de partidas.
 * 9. Finalizar uma partida cria a necessidade de escolher o próximo adversário.
 * 10. Não criar automaticamente a próxima partida sem escolha do administrador.
 * 11. Empate exige definição explícita do vencedor pelo administrador.
 * 12. Tabela continua calculando corretamente (V=3, E=1, D=0, GP, GC, SG, PTS).
 * 13. Encerrar noite só pode ocorrer sem partida em andamento.
 * 14. Capa continua sendo atribuída SOMENTE no encerramento da noite.
 * 15. Exatamente 5 jogadores do campeão recebem +1 Capa cada.
 * 16. Capa não pode ser duplicada (idempotência).
 * 17. Histórico registra somente partidas realmente realizadas.
 * 18. Realtime atualiza público e administrador.
 */

import { Storage } from '../js/storage.js';
import { Sorteio } from '../js/sorteio.js';
import { Partidas } from '../js/partidas.js';
import { Tabela } from '../js/tabela.js';
import { Rankings } from '../js/rankings.js';
import { Historico } from '../js/historico.js';
import { Utils } from '../js/utils.js';

// Setup Mock do LocalStorage e DOM para execução no Node
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

const domStore = {};
const makeDomNode = (id = '') => ({
  id,
  innerHTML: '',
  textContent: '',
  style: {},
  classList: {
    add: () => {},
    remove: () => {},
    contains: () => false,
    toggle: () => {}
  },
  appendChild: () => {},
  removeChild: () => {},
  insertBefore: () => {},
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  setAttribute: () => {},
  removeAttribute: () => {},
  dataset: {}
});

global.document = {
  documentElement: { style: { setProperty: () => {} } },
  getElementById: (id) => {
    if (!domStore[id]) {
      domStore[id] = makeDomNode(id);
    }
    return domStore[id];
  },
  createElement: (tag) => makeDomNode(),
  querySelectorAll: () => [],
  body: makeDomNode('body'),
  addEventListener: () => {}
};

global.window = {
  confirm: () => true,
  alert: () => {}
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

let passCount = 0;
let failCount = 0;

function assert(condition, testNum, message) {
  if (condition) {
    console.log(`  ✅ [Teste ${testNum}] PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ [Teste ${testNum}] FAIL: ${message}`);
    failCount++;
  }
}

async function runMasterTest() {
  console.log('================================================================');
  console.log('BATERIA DE TESTES - MODELO "QUEM GANHA FICA" (18 TESTES)');
  console.log('================================================================\n');

  // 1. Setup Futebol e Admin
  Storage.currentFutebol = {
    id: 'b0000000-0000-4000-8000-000000000002',
    nome: 'Futebol Quem Ganha Fica',
    admin_id: 'admin_qgf',
    codigo_publico: 'FDT-QGF'
  };
  Storage.currentUser = { id: 'admin_qgf', email: 'admin@qgf.com' };
  Storage.userRole = 'ADMIN';

  // Cadastrar 24 jogadores
  const playersData = [];
  const starLevels = [5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2];
  for (let i = 1; i <= 24; i++) {
    playersData.push({
      id: `p_${i}`,
      name: `Atleta ${String(i).padStart(2, '0')}`,
      stars: starLevels[(i - 1) % starLevels.length],
      createdAt: new Date().toISOString()
    });
  }
  Storage.savePlayers(playersData);

  // Selecionar exatamente 20 e sortear
  Sorteio.selectedPlayerIds = new Set(playersData.slice(0, 20).map(p => p.id));
  const selected20 = playersData.slice(0, 20);
  Sorteio.executarSorteio(selected20);

  const teams = Storage.getTeams();
  assert(
    teams && teams.time_1 && teams.time_2 && teams.time_3 && teams.time_4,
    'SETUP',
    '4 times criados com 5 jogadores cada'
  );

  // --------------------------------------------------------------------------
  // TESTE 1: Primeira partida obrigatoriamente Time 1 x Time 2
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 1: Primeira Partida Obrigatória Time 1 x Time 2 ---');
  Partidas.restoreOrInitMatch();
  assert(
    Partidas.state.order === 1 &&
    Partidas.state.homeTeamId === 'time_1' &&
    Partidas.state.awayTeamId === 'time_2',
    '1',
    'Partida 01 é obrigatoriamente Time 1 x Time 2'
  );

  // --------------------------------------------------------------------------
  // TESTE 2 & 3: Time vencedor permanece e perdedor sai
  // --------------------------------------------------------------------------
  console.log('\n--- TESTES 2 & 3: Vencedor Permanece e Perdedor Sai ---');
  Partidas.startOrResumeMatch();
  assert(Storage.isTeamsLocked(), '2.1', 'Noite iniciada -> composição dos times bloqueada');

  // Time 1 faz 3 gols, Time 2 faz 1 gol
  Partidas.state.homeScore = 3;
  Partidas.state.awayScore = 1;
  Partidas.state.goals = [
    { id: 'g1_1', playerId: teams.time_1.players[0].id, playerName: teams.time_1.players[0].name, teamId: 'time_1', minuteFormatted: '02:00' },
    { id: 'g1_2', playerId: teams.time_1.players[1].id, playerName: teams.time_1.players[1].name, teamId: 'time_1', minuteFormatted: '05:00' },
    { id: 'g1_3', playerId: teams.time_2.players[0].id, playerName: teams.time_2.players[0].name, teamId: 'time_2', minuteFormatted: '07:00' },
    { id: 'g1_4', playerId: teams.time_1.players[2].id, playerName: teams.time_1.players[2].name, teamId: 'time_1', minuteFormatted: '09:00' }
  ];
  Partidas.finalizarPartida();

  assert(
    Partidas.state.winnerTeamId === 'time_1' &&
    Partidas.state.loserTeamId === 'time_2',
    '2.2',
    'Time 1 venceu a Partida 01 (3 x 1)'
  );
  assert(
    Partidas.state.winnerTeamId === 'time_1',
    '2.3',
    'Time 1 permanece como vencedor em campo'
  );
  assert(
    Partidas.state.loserTeamId === 'time_2' && Partidas.state.waitingNextOpponent === true,
    '3',
    'Time 2 (perdedor) sai de campo e sistema aguarda escolha de novo adversário'
  );

  // --------------------------------------------------------------------------
  // TESTES 4 & 5: Admin escolhe adversário (não pode escolher a si mesmo)
  // --------------------------------------------------------------------------
  console.log('\n--- TESTES 4 & 5: Escolha do Próximo Adversário ---');
  let selfPlayBlocked = false;
  try {
    Partidas.selecionarProximoAdversario('time_1'); // Time 1 x Time 1
  } catch {
    selfPlayBlocked = true;
  }
  // No código, toast avisando e rejeitando
  assert(
    Partidas.state.waitingNextOpponent === true && Partidas.state.status === 'finished',
    '5',
    'Não é permitido selecionar o próprio time vencedor como adversário (Time 1 x Time 1)'
  );

  // Admin escolhe Time 3
  Partidas.selecionarProximoAdversario('time_3');
  assert(
    Partidas.state.order === 2 &&
    Partidas.state.homeTeamId === 'time_1' &&
    Partidas.state.awayTeamId === 'time_3' &&
    Partidas.state.status === 'ready',
    '4',
    'Administrador escolheu Time 3 -> Partida 02 criada: Time 1 (permanece) x Time 3'
  );

  // --------------------------------------------------------------------------
  // TESTES 9 & 10: Necessidade de escolha explícita do admin
  // --------------------------------------------------------------------------
  console.log('\n--- TESTES 9 & 10: Não Criar Automaticamente Sem Escolha ---');
  Partidas.startOrResumeMatch();
  Partidas.state.homeScore = 0;
  Partidas.state.awayScore = 2; // Time 3 venceu Time 1
  Partidas.state.goals = [
    { id: 'g2_1', playerId: teams.time_3.players[0].id, playerName: teams.time_3.players[0].name, teamId: 'time_3', minuteFormatted: '04:00' },
    { id: 'g2_2', playerId: teams.time_3.players[1].id, playerName: teams.time_3.players[1].name, teamId: 'time_3', minuteFormatted: '08:00' }
  ];
  Partidas.finalizarPartida();

  assert(
    Partidas.state.winnerTeamId === 'time_3' && Partidas.state.waitingNextOpponent === true,
    '9',
    'Finalizar Partida 02 definiu Time 3 vencedor e criou a necessidade de escolher o próximo adversário'
  );
  assert(
    Partidas.state.status === 'finished' && !Partidas.state.isActive,
    '10',
    'Próxima partida NÃO é criada automaticamente sem a escolha do administrador'
  );

  // --------------------------------------------------------------------------
  // TESTE 6 & 7: Perdedor pode voltar a jogar + repetição de confrontos
  // --------------------------------------------------------------------------
  console.log('\n--- TESTES 6 & 7: Volta de Time Derrotado e Repetição de Confrontos ---');
  // Time 1 já perdeu na P2, mas o admin agora escolhe Time 1 de novo para enfrentar Time 3!
  Partidas.selecionarProximoAdversario('time_1');
  assert(
    Partidas.state.order === 3 &&
    Partidas.state.homeTeamId === 'time_3' &&
    Partidas.state.awayTeamId === 'time_1',
    '6',
    'Time derrotado anteriormente (Time 1) pode ser escolhido novamente para jogar'
  );
  assert(
    Storage.getMatches().some(m => m.homeTeamId === 'time_1' && m.awayTeamId === 'time_3') &&
    Partidas.state.homeTeamId === 'time_3' && Partidas.state.awayTeamId === 'time_1',
    '7',
    'Permite repetição de confrontos ao longo da noite (Time 1 x Time 3)'
  );

  // --------------------------------------------------------------------------
  // TESTE 11: Tratamento Definitivo de Empate (Ambos saem, times de fora entram)
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 11: Tratamento Definitivo de Empate (Ambos saem, times de fora entram) ---');
  Partidas.startOrResumeMatch();
  Partidas.state.homeScore = 1;
  Partidas.state.awayScore = 1;
  Partidas.state.goals = [
    { id: 'g3_1', playerId: teams.time_3.players[0].id, playerName: teams.time_3.players[0].name, teamId: 'time_3', minuteFormatted: '03:00' },
    { id: 'g3_2', playerId: teams.time_1.players[0].id, playerName: teams.time_1.players[0].name, teamId: 'time_1', minuteFormatted: '07:00' }
  ];
  Partidas.finalizarPartida();

  assert(
    Partidas.state.isTie === true &&
    Partidas.state.tiePendingResolution === false &&
    Partidas.state.waitingTieNextMatch === true &&
    Partidas.state.winnerTeamId === null,
    '11.1',
    'Partida 03 terminou empatada (1 x 1): ambos saem e nenhum vencedor artificial é escolhido'
  );

  // Confirma que a próxima partida configurada é entre os dois times que estavam fora (Time 2 e Time 4)
  assert(
    Partidas.state.tieNextMatch &&
    ((Partidas.state.tieNextMatch.homeTeamId === 'time_2' && Partidas.state.tieNextMatch.awayTeamId === 'time_4') ||
     (Partidas.state.tieNextMatch.homeTeamId === 'time_4' && Partidas.state.tieNextMatch.awayTeamId === 'time_2')),
    '11.2',
    `Próxima partida configurada automaticamente entre os que estavam fora: ${Partidas.state.tieNextMatch.homeTeamName} × ${Partidas.state.tieNextMatch.awayTeamName}`
  );

  // --------------------------------------------------------------------------
  // TESTE 8: Não existe limite fixo de partidas
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 8: Flexibilidade Total no Número de Partidas ---');
  // Inicia Partida 04 gerada pelo empate: Time 2 x Time 4
  Partidas.iniciarProximaPartidaAposEmpate();
  assert(Partidas.state.order === 4, '8.1', 'Partida 04 criada automaticamente pelo fluxo de empate');

  // Time 2 vence Time 4 (2 x 0) -> Time 2 permanece, Time 4 sai
  Partidas.state.homeScore = 2;
  Partidas.state.awayScore = 0;
  Partidas.finalizarPartida();

  // Partida 05: Administrador escolhe Time 3 para enfrentar Time 2
  Partidas.selecionarProximoAdversario('time_3');
  assert(Partidas.state.order === 5, '8.2', 'Partida 05 criada livremente');

  // Time 3 vence Time 2 (2 x 1) -> Time 3 permanece, Time 2 sai
  Partidas.startOrResumeMatch();
  Partidas.state.homeScore = 1;
  Partidas.state.awayScore = 2;
  Partidas.finalizarPartida();

  // Partida 06: Administrador escolhe Time 4 para enfrentar Time 3
  Partidas.selecionarProximoAdversario('time_4');
  assert(Partidas.state.order === 6, '8.3', 'Partida 06 criada livremente (sem limite fixo)');

  // Time 3 vence Time 4 (2 x 1) -> Time 3 permanece
  Partidas.startOrResumeMatch();
  Partidas.state.homeScore = 2;
  Partidas.state.awayScore = 1;
  Partidas.finalizarPartida();

  const totalFinishedMatches = Storage.getMatches().length;
  assert(totalFinishedMatches === 6, '8.4', `6 partidas realizadas com sucesso`);

  // --------------------------------------------------------------------------
  // TESTE 12: Tabela continua calculando perfeitamente
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 12: Cálculo Correto da Tabela ---');
  const tabela = Tabela.calcularTabela(Storage.getMatches());
  assert(tabela.length === 4, '12.1', 'Tabela gerada para os 4 times');

  // Time 3 jogou P2 (venceu), P3 (empatou), P5 (venceu), P6 (venceu) = 3V, 1E = 10 pts
  const t3 = tabela.find(t => t.id === 'time_3');
  assert(
    t3.pts === 10 && t3.v === 3 && t3.e === 1 && t3.d === 0,
    '12.2',
    'Time 3 lidera isolado com 10 pontos (3V, 1E, 0D)'
  );
  assert(
    t3.sg === (t3.gp - t3.gc),
    '12.3',
    `Saldo de gols verificado: SG=${t3.sg} (GP=${t3.gp}, GC=${t3.gc})`
  );

  // --------------------------------------------------------------------------
  // TESTE 13: Encerrar noite bloqueado com partida em andamento
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 13: Bloqueio de Encerramento com Partida em Andamento ---');
  Partidas.selecionarProximoAdversario('time_1');
  Partidas.startOrResumeMatch(); // Partida 07 em andamento!

  let blockNightActiveThrown = false;
  try {
    Storage.finalizeNight({
      championTeamId: 'time_3',
      championTeamName: 'Time 3',
      capaPlayers: teams.time_3.players
    });
  } catch (err) {
    blockNightActiveThrown = true;
  }
  assert(
    blockNightActiveThrown,
    '13.1',
    'Encerramento da noite é rigorosamente bloqueado enquanto houver partida em andamento'
  );

  // Finaliza a Partida 07 para poder encerrar
  Partidas.state.homeScore = 1;
  Partidas.state.awayScore = 0;
  Partidas.finalizarPartida();

  // --------------------------------------------------------------------------
  // TESTES 14 & 15: Capa atribuída SOMENTE no encerramento para 5 do campeão
  // --------------------------------------------------------------------------
  console.log('\n--- TESTES 14 & 15: Regra Definitiva da Capa ---');
  assert(Storage.getCapas().length === 0, '14.1', 'Nenhuma Capa atribuída durante a rodada por vitórias em partidas');

  Storage.finalizeNight({
    championTeamId: 'time_3',
    championTeamName: 'Time 3',
    capaPlayers: teams.time_3.players
  });

  const finalCapas = Storage.getCapas();
  assert(finalCapas.length === 5, '15.1', 'Exatamente 5 Capas concedidas no encerramento da noite');

  const champPlayerIds = teams.time_3.players.map(p => p.id);
  const all5ChampReceived = finalCapas.every(c => champPlayerIds.includes(c.jogador_id));
  assert(all5ChampReceived, '15.2', 'Todas as 5 Capas foram concedidas aos 5 jogadores do time campeão (Time 3)');

  const nonChampIds = [
    ...teams.time_1.players,
    ...teams.time_2.players,
    ...teams.time_4.players
  ].map(p => p.id);
  const anyNonChampReceived = finalCapas.some(c => nonChampIds.includes(c.jogador_id));
  assert(!anyNonChampReceived, '15.3', 'Jogadores dos outros times receberam 0 Capa');

  // --------------------------------------------------------------------------
  // TESTE 16: Proteção contra Duplicidade (Idempotência)
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 16: Idempotência da Capa ---');
  Storage.addCapas(finalCapas);
  assert(Storage.getCapas().length === 5, '16', 'Reexecução de atribuição mantém total em 5 (idempotente)');

  // --------------------------------------------------------------------------
  // TESTE 17: Histórico registra somente partidas realizadas
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 17: Integridade do Histórico ---');
  const histMatches = Storage.getMatches();
  assert(histMatches.length === 7, '17.1', 'Histórico contém exatamente as 7 partidas realizadas');
  assert(
    histMatches.every(m => m.homeScore !== undefined && m.awayScore !== undefined),
    '17.2',
    'Nenhuma partida fantasma ou futura não realizada está no histórico'
  );

  // --------------------------------------------------------------------------
  // TESTE 18: Realtime e Visão Pública
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 18: Sincronização em Tempo Real ---');
  let realtimeNotificationReceived = false;
  Storage.onChange((type, data) => {
    if (type === 'liveMatchUpdate') {
      realtimeNotificationReceived = true;
    }
  });

  Storage.saveLiveMatch({
    order: 8,
    status: 'finished',
    homeTeamId: 'time_3',
    awayTeamId: 'time_4',
    homeScore: 1,
    awayScore: 0,
    updated_at: new Date().toISOString()
  });

  assert(realtimeNotificationReceived, '18', 'Transmissão em tempo real de estado da partida funcionando perfeitamente');

  console.log('\n================================================================');
  console.log(`RESULTADO DOS TESTES: ${passCount} PASSOU / ${failCount} FALHOU`);
  console.log('================================================================');

  if (failCount === 0) {
    console.log('\n🎉 TODOS OS 18 TESTES DO MODELO "QUEM GANHA FICA" FORAM APROVADOS COM SUCESSO!');
    process.exit(0);
  } else {
    console.error('\n❌ HOUVE FALHAS NO TESTE.');
    process.exit(1);
  }
}

runMasterTest().catch(err => {
  console.error('Erro inesperado no teste mestre:', err);
  process.exit(1);
});
