/**
 * TESTE ESPECÍFICO: CORREÇÃO DO BUG NA ESCOLHA DO PRÓXIMO ADVERSÁRIO APÓS FINALIZAR PARTIDA
 * 
 * Validação rigorosa dos 12 itens solicitados:
 * 1. Time 1 vence Time 2.
 * 2. Partida é finalizada.
 * 3. winner_team_id é persistido (Supabase e Storage).
 * 4. Tela mostra Time 1 como vencedor.
 * 5. Clicar Time 3 funciona.
 * 6. Clicar Time 4 funciona.
 * 7. Próxima partida é preparada corretamente.
 * 8. Recarregar a página mantém o vencedor.
 * 9. Estado recebido via Realtime mantém o vencedor.
 * 10. Outro dispositivo consegue escolher o adversário.
 * 11. Empate continua funcionando exatamente como antes.
 * 12. Não deve aparecer a mensagem "Defina o vencedor..." quando o vencedor já estiver definido.
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

function fail(desc, err) {
  totalTests++;
  console.error(`  ❌ FAIL: ${desc}`, err);
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
  body: createMockElement('body'),
  addEventListener: () => {}
};

global.window = {
  confirm: () => true,
  alert: () => {}
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Monitor de Toasts para capturar avisos e erros
const toastsShown = [];
const origToast = Utils.toast;
Utils.toast = (msg, type = 'info', duration = 3000) => {
  toastsShown.push({ msg, type });
  return origToast ? origToast(msg, type, duration) : null;
};

async function runTests() {
  console.log('================================================================');
  console.log('BATERIA DE TESTES: ESCOLHA DO PRÓXIMO ADVERSÁRIO (QUEM GANHA FICA)');
  console.log('================================================================\n');

  const testEmail = `admin_test_opp_${Date.now()}@futraiz.com`;
  const testPassword = 'Password123!';

  const devA = createDevice('Dispositivo A');
  const devB = createDevice('Dispositivo B');

  // Setup: Criação do futebol
  devA.activate();
  const createRes = await Storage.createFutebol({
    nome: 'Pelada Quem Ganha Fica Test',
    adminNome: 'Admin Test',
    email: testEmail,
    password: testPassword
  });
  assert.strictEqual(createRes.success, true);
  const futebol = createRes.futebol;
  pass('Setup: Futebol criado no Supabase');

  // Cadastra 20 jogadores
  const playerNames = [
    'Atleta 1', 'Atleta 2', 'Atleta 3', 'Atleta 4', 'Atleta 5',
    'Atleta 6', 'Atleta 7', 'Atleta 8', 'Atleta 9', 'Atleta 10',
    'Atleta 11', 'Atleta 12', 'Atleta 13', 'Atleta 14', 'Atleta 15',
    'Atleta 16', 'Atleta 17', 'Atleta 18', 'Atleta 19', 'Atleta 20'
  ];
  for (const name of playerNames) {
    await Storage.addPlayer({ name, stars: 4 });
  }

  // Cria rodada e sorteia times
  const roundUUID = Utils.generateUUID();
  const novaRodada = {
    id: roundUUID,
    date: Utils.formatDate(new Date()),
    dateKey: Utils.getDateKey(new Date()),
    status: 'READY'
  };
  Storage.saveCurrentRound(novaRodada);

  const teamsObj = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#3b82f6', players: [] },
    time_2: { id: 'time_2', name: 'Time 2', color: '#ef4444', players: [] },
    time_3: { id: 'time_3', name: 'Time 3', color: '#10b981', players: [] },
    time_4: { id: 'time_4', name: 'Time 4', color: '#f59e0b', players: [] }
  };
  await Storage.saveTeams(teamsObj);
  pass('Setup: 4 times configurados com sucesso');

  // Inicializa Partidas no Dispositivo A
  Partidas.state.homeTeamId = 'time_1';
  Partidas.state.awayTeamId = 'time_2';
  Partidas.state.homeScore = 0;
  Partidas.state.awayScore = 0;
  Partidas.state.status = 'running';
  Partidas.state.isActive = true;
  Partidas.state.isPaused = false;
  Partidas.state.order = 1;
  await Partidas.saveFullState();

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 1: Time 1 vence Time 2 (Placar: 3 x 1) ---');
  Partidas.state.homeScore = 3;
  Partidas.state.awayScore = 1;
  assert.strictEqual(Partidas.state.homeScore > Partidas.state.awayScore, true);
  pass('Item 1: Time 1 tem mais gols que Time 2 (3 x 1).');

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 2 & 3: Partida é finalizada e winner_team_id é persistido ---');
  toastsShown.length = 0;
  Partidas.finalizarPartida();

  assert.strictEqual(Partidas.state.status, 'finished', 'Partida deve estar com status finished');
  assert.strictEqual(Partidas.state.winnerTeamId, 'time_1', 'Partidas.state.winnerTeamId deve ser time_1');
  assert.strictEqual(Partidas.state.winner_team_id, 'time_1', 'Partidas.state.winner_team_id deve ser time_1');
  assert.strictEqual(Partidas.state.waitingNextOpponent, true, 'Deve estar aguardando próximo adversário');

  const liveA = Storage.getLiveMatch();
  assert.strictEqual(liveA.winnerTeamId, 'time_1', 'Storage.getLiveMatch().winnerTeamId deve ser time_1');
  assert.strictEqual(liveA.winner_team_id, 'time_1', 'Storage.getLiveMatch().winner_team_id deve ser time_1');
  assert.strictEqual(liveA.waitingNextOpponent, true, 'Storage.getLiveMatch().waitingNextOpponent deve ser true');

  // Verifica persistência no Supabase
  const { data: dbLive } = await supabase.from('partida_ao_vivo').select('*').eq('futebol_id', futebol.id);
  const liveRow = Array.isArray(dbLive) ? dbLive[0] : dbLive;
  assert.strictEqual(liveRow.winner_team_id, 'time_1', 'winner_team_id persistido no Supabase na tabela partida_ao_vivo');
  assert.strictEqual(liveRow.waiting_next_opponent, true, 'waiting_next_opponent persistido no Supabase');
  pass('Item 2 e 3: Partida finalizada com sucesso e winner_team_id persistido localmente e no Supabase.');

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 4: Tela mostra Time 1 como vencedor ---');
  Partidas.renderQuemGanhaFicaBanner();
  const bannerEl = domStore['match-quem-ganha-fica-banner'];
  assert(bannerEl && bannerEl.innerHTML.includes('VENCEDOR:'), 'Banner deve exibir texto VENCEDOR:');
  assert(bannerEl && bannerEl.innerHTML.includes('TIME 1'), 'Banner deve destacar TIME 1');
  assert(bannerEl && bannerEl.innerHTML.includes('PERMANECE EM CAMPO'), 'Banner deve destacar permanência em campo');
  assert(bannerEl && bannerEl.innerHTML.includes('TIME 3'), 'Banner deve ter opção para TIME 3');
  assert(bannerEl && bannerEl.innerHTML.includes('TIME 4'), 'Banner deve ter opção para TIME 4');
  pass('Item 4: Interface renderiza banner oficial com Vencedor: Time 1 e botões Time 3 e Time 4.');

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 12: Não deve aparecer "Defina o vencedor..." ao escolher adversário ---');
  toastsShown.length = 0;
  Partidas.selecionarProximoAdversario('time_3');
  const errorToast = toastsShown.find(t => t.msg.includes('Defina o vencedor antes de escolher o adversário'));
  assert.strictEqual(errorToast, undefined, 'NÃO pode exibir a mensagem "Defina o vencedor antes de escolher o adversário."');
  pass('Item 12: Mensagem "Defina o vencedor..." NÃO foi exibida porque o vencedor já está definido.');

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 5 & 7: Clicar Time 3 funciona e prepara Time 1 x Time 3 ---');
  assert.strictEqual(Partidas.state.order, 2, 'Ordem da nova partida deve ser 2');
  assert.strictEqual(Partidas.state.status, 'ready', 'Status da nova partida deve ser ready');
  assert.strictEqual(Partidas.state.homeTeamId, 'time_1', 'Time da casa deve ser o vencedor: Time 1');
  assert.strictEqual(Partidas.state.awayTeamId, 'time_3', 'Time visitante deve ser Time 3');
  assert.strictEqual(Partidas.state.homeScore, 0, 'Placar reiniciado em 0');
  assert.strictEqual(Partidas.state.awayScore, 0, 'Placar reiniciado em 0');
  assert.strictEqual(Partidas.state.waitingNextOpponent, false, 'waitingNextOpponent deve ser false');
  pass('Item 5 e 7: Clicar Time 3 funcionou perfeitamente e preparou Partida 02: Time 1 × Time 3.');

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 6: Clicar Time 4 também funciona se escolhido Time 4 ---');
  // Re-simula final da partida 1 para testar Time 4
  Partidas.state.winnerTeamId = 'time_1';
  Partidas.state.winner_team_id = 'time_1';
  Partidas.state.waitingNextOpponent = true;
  Partidas.state.order = 1;
  toastsShown.length = 0;
  Partidas.selecionarProximoAdversario('time_4');
  assert.strictEqual(Partidas.state.homeTeamId, 'time_1');
  assert.strictEqual(Partidas.state.awayTeamId, 'time_4');
  assert.strictEqual(Partidas.state.order, 2);
  pass('Item 6: Clicar Time 4 funcionou com sucesso e preparou Partida 02: Time 1 × Time 4.');

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 8: Recarregar a página mantém o vencedor ---');
  // Deixa no estado pós-finalização da Partida 1 com Time 1 vencedor
  Partidas.state.order = 1;
  Partidas.state.status = 'finished';
  Partidas.state.winnerTeamId = 'time_1';
  Partidas.state.winner_team_id = 'time_1';
  Partidas.state.waitingNextOpponent = true;
  await Partidas.saveFullState();

  // Simula reload (reinicia objeto de estado e chama restoreOrInitMatch)
  Partidas.state = {
    order: 1,
    status: 'ready',
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    winnerTeamId: null,
    winner_team_id: null,
    waitingNextOpponent: false
  };
  Partidas.restoreOrInitMatch();

  assert.strictEqual(Partidas.state.winnerTeamId, 'time_1', 'Após reload, winnerTeamId deve ser mantido como time_1');
  assert.strictEqual(Partidas.state.winner_team_id, 'time_1', 'Após reload, winner_team_id deve ser mantido como time_1');
  assert.strictEqual(Partidas.state.waitingNextOpponent, true, 'Após reload, waitingNextOpponent deve ser true');

  toastsShown.length = 0;
  Partidas.selecionarProximoAdversario('time_3');
  const errorAfterReload = toastsShown.find(t => t.msg.includes('Defina o vencedor'));
  assert.strictEqual(errorAfterReload, undefined, 'Após reload não deve exibir erro ao escolher adversário');
  assert.strictEqual(Partidas.state.homeTeamId, 'time_1');
  assert.strictEqual(Partidas.state.awayTeamId, 'time_3');
  pass('Item 8: Recarregar a página manteve o vencedor e permitiu escolher o adversário.');

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 9: Estado recebido via Realtime mantém o vencedor ---');
  // Restaura estado pós-finalização
  Partidas.state.status = 'finished';
  Partidas.state.winnerTeamId = 'time_1';
  Partidas.state.winner_team_id = 'time_1';
  Partidas.state.waitingNextOpponent = true;
  await Partidas.saveFullState();

  // Simula evento Realtime chegando do Supabase com payload em snake_case
  Partidas.handleLiveUpdate({
    futebol_id: futebol.id,
    status: 'finished',
    winner_team_id: 'time_1',
    waiting_next_opponent: true,
    is_tie: false,
    order_num: 1
  });

  assert.strictEqual(Partidas.state.winnerTeamId, 'time_1', 'handleLiveUpdate deve manter winnerTeamId');
  assert.strictEqual(Partidas.state.winner_team_id, 'time_1', 'handleLiveUpdate deve manter winner_team_id');
  assert.strictEqual(Partidas.state.waitingNextOpponent, true, 'handleLiveUpdate deve manter waitingNextOpponent');

  toastsShown.length = 0;
  Partidas.selecionarProximoAdversario('time_4');
  const errorRealtime = toastsShown.find(t => t.msg.includes('Defina o vencedor'));
  assert.strictEqual(errorRealtime, undefined);
  pass('Item 9: Atualização Realtime preservou winner_team_id e permitiu escolher adversário sem erro.');

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 10: Outro dispositivo (Dispositivo B) consegue escolher o adversário ---');
  // Dispositivo A finaliza e salva no Supabase
  devA.activate();
  Partidas.state.order = 1;
  Partidas.state.status = 'finished';
  Partidas.state.winnerTeamId = 'time_1';
  Partidas.state.winner_team_id = 'time_1';
  Partidas.state.waitingNextOpponent = true;
  await Partidas.saveFullState();

  // Dispositivo B conecta, faz login e sincroniza
  devB.activate();
  await Storage.loginAdmin({ email: testEmail, password: testPassword });
  await Storage.syncLiveMatchFromSupabase(futebol.id);
  await Storage.syncMatchesFromSupabase(futebol.id);

  Partidas.restoreOrInitMatch();
  assert.strictEqual(Partidas.state.winnerTeamId, 'time_1', 'Dispositivo B deve receber Time 1 como vencedor');
  assert.strictEqual(Partidas.state.waitingNextOpponent, true, 'Dispositivo B deve estar em waitingNextOpponent');

  toastsShown.length = 0;
  Partidas.selecionarProximoAdversario('time_3');
  const errorDevB = toastsShown.find(t => t.msg.includes('Defina o vencedor'));
  assert.strictEqual(errorDevB, undefined, 'Dispositivo B NÃO pode ver a mensagem de erro');
  assert.strictEqual(Partidas.state.homeTeamId, 'time_1', 'Dispositivo B preparou Time 1');
  assert.strictEqual(Partidas.state.awayTeamId, 'time_3', 'Dispositivo B preparou Time 3');
  pass('Item 10: Dispositivo B recebeu o vencedor do Supabase e escolheu Time 3 com sucesso sem erro.');

  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 11: Empate continua funcionando exatamente como antes ---');
  devA.activate();
  // Partida empatada 2 x 2 entre Time 1 e Time 3
  Partidas.state.order = 2;
  Partidas.state.homeTeamId = 'time_1';
  Partidas.state.awayTeamId = 'time_3';
  Partidas.state.homeScore = 2;
  Partidas.state.awayScore = 2;
  Partidas.state.status = 'running';
  Partidas.state.isActive = true;

  toastsShown.length = 0;
  Partidas.finalizarPartida();

  assert.strictEqual(Partidas.state.status, 'finished', 'Partida empatada finalizada');
  assert.strictEqual(Partidas.state.isTie, true, 'isTie deve ser true');
  assert.strictEqual(Partidas.state.winnerTeamId, null, 'Em empate winnerTeamId deve ser null');
  assert.strictEqual(Partidas.state.waitingTieNextMatch, true, 'Deve entrar no estado waitingTieNextMatch');
  assert.strictEqual(Partidas.state.waitingNextOpponent, false, 'Não deve haver escolha manual em empate');

  // Os 2 times de fora (time_2 e time_4) devem entrar automaticamente
  assert.strictEqual(Partidas.state.tieNextMatch.homeTeamId, 'time_2');
  assert.strictEqual(Partidas.state.tieNextMatch.awayTeamId, 'time_4');

  // Iniciar próxima partida após empate
  Partidas.iniciarProximaPartidaAposEmpate();
  assert.strictEqual(Partidas.state.order, 3);
  assert.strictEqual(Partidas.state.homeTeamId, 'time_2');
  assert.strictEqual(Partidas.state.awayTeamId, 'time_4');
  pass('Item 11: Regra de empate intacta: ambos saem, os 2 de fora entram (Time 2 x Time 4), sem escolha manual.');

  console.log('\n================================================================');
  console.log(`BATERIA FINALIZADA: ${totalTests} TESTES EXECUTADOS | ${passedTests} PASSARAM | 0 FALHARAM`);
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('ERRO FATAL NA EXECUÇÃO DOS TESTES:', err);
  process.exit(1);
});
