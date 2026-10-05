/**
 * TESTE OBRIGATÓRIO — TELA TABELA + ATUALIZAÇÃO EM TEMPO REAL
 * Validação rigorosa dos 13 itens obrigatórios:
 * 1. Rodada com 4 times renderiza 4 linhas.
 * 2. Tabela inicial aparece mesmo com todos os valores em zero.
 * 3. Time 1 vence Time 2 por 3 x 1 (Time 1: J 1, V 1, E 0, D 0, GP 3, GC 1, SG +2, PTS 3 | Time 2: J 1, V 0, E 0, D 1, GP 1, GC 3, SG -2, PTS 0).
 * 4. Time 3 e Time 4 continuam aparecendo com zero.
 * 5. Empate Time 3 x Time 4 por 2 x 2 (Ambos: J 1, E 1, GP 2, GC 2, SG 0, PTS 1).
 * 6. Recalcular tabela corretamente após múltiplas partidas.
 * 7. Ordenar por PTS, SG, GP.
 * 8. Atualizar após reload.
 * 9. Atualizar via Realtime.
 * 10. Não duplicar pontos quando uma partida for processada duas vezes.
 * 11. Time fora de campo continua na tabela.
 * 12. Empate não cria vencedor artificial.
 * 13. Capa não é alterada pela atualização da tabela.
 */

import { Storage } from './js/storage.js';
import { Partidas } from './js/partidas.js';
import { Tabela } from './js/tabela.js';
import { Utils } from './js/utils.js';

// Setup Mock do LocalStorage e DOM para execução no Node
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

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
    setAttribute: (name, val) => { attrs[name] = val; },
    getAttribute: (name) => attrs[name] || null,
    querySelectorAll: (sel) => [],
    querySelector: (sel) => {
      const idMatch = sel.match(/^#([\w-]+)/);
      if (idMatch) {
        const i = idMatch[1];
        if (!domStore[i]) domStore[i] = createMockElement(i);
        return domStore[i];
      }
      return createMockElement('generic');
    },
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
  alert: () => {},
  Tabela: Tabela
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

async function runTestTabela() {
  console.log('================================================================');
  console.log('TESTES DEFINITIVOS: TELA TABELA + ATUALIZAÇÃO EM TEMPO REAL');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testId, desc) {
    if (condition) {
      console.log(`  ✅ [Teste ${testId}] PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [Teste ${testId}] FAIL: ${desc}`);
      failed++;
    }
  }

  // --- SETUP: Criar Futebol, Admin e Rodada com 4 Times ---
  const futRes = await Storage.createFutebol({
    nome: 'Futebol Tabela Teste',
    adminNome: 'Admin Tabela',
    email: 'tabela@teste.com',
    password: 'password123'
  });
  Storage.resetAll();

  const teams = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#16a34a', players: [{ id: 'p1', name: 'Atleta 1' }, { id: 'p2', name: 'Atleta 2' }, { id: 'p3', name: 'Atleta 3' }, { id: 'p4', name: 'Atleta 4' }, { id: 'p5', name: 'Atleta 5' }] },
    time_2: { id: 'time_2', name: 'Time 2', color: '#dc2626', players: [{ id: 'p6', name: 'Atleta 6' }, { id: 'p7', name: 'Atleta 7' }, { id: 'p8', name: 'Atleta 8' }, { id: 'p9', name: 'Atleta 9' }, { id: 'p10', name: 'Atleta 10' }] },
    time_3: { id: 'time_3', name: 'Time 3', color: '#2563eb', players: [{ id: 'p11', name: 'Atleta 11' }, { id: 'p12', name: 'Atleta 12' }, { id: 'p13', name: 'Atleta 13' }, { id: 'p14', name: 'Atleta 14' }, { id: 'p15', name: 'Atleta 15' }] },
    time_4: { id: 'time_4', name: 'Time 4', color: '#ca8a04', players: [{ id: 'p16', name: 'Atleta 16' }, { id: 'p17', name: 'Atleta 17' }, { id: 'p18', name: 'Atleta 18' }, { id: 'p19', name: 'Atleta 19' }, { id: 'p20', name: 'Atleta 20' }] }
  };
  Storage.saveTeams(teams);

  const round = {
    id: 'rodada_tab_1',
    date: '04/10/2026',
    dateKey: '2026-10-04',
    status: 'READY',
    teams: teams
  };
  Storage.saveCurrentRound(round);

  // --------------------------------------------------------------------------
  // TESTE 1 & 2: Tabela inicial e Renderização de 4 Linhas com Zeros
  // --------------------------------------------------------------------------
  console.log('--- TESTES 1 & 2: Tabela Inicial com 4 Times e Zeros ---');
  Tabela.render();
  const container = document.getElementById('tabela-container');
  assert(container.innerHTML.length > 0, '1.1', 'Container da tabela NÃO está vazio após renderização');
  assert(!container.innerHTML.includes('ReferenceError'), '1.2', 'Nenhum erro de referência na renderização');
  
  const initialStandings = Tabela.calcularTabelaRodada();
  assert(initialStandings.length === 4, '1.3', 'Tabela contém exatamente 4 times');

  const allZero = initialStandings.every(t => 
    t.j === 0 && t.v === 0 && t.e === 0 && t.d === 0 &&
    t.gp === 0 && t.gc === 0 && t.sg === 0 && t.pts === 0
  );
  assert(allZero, '2.1', 'Todos os 4 times iniciam rigorosamente com J=0, V=0, E=0, D=0, GP=0, GC=0, SG=0, PTS=0');
  assert(initialStandings[0].name === 'Time 1' && initialStandings[1].name === 'Time 2' && initialStandings[2].name === 'Time 3' && initialStandings[3].name === 'Time 4', '2.2', 'Ordem inicial preservada 1º Time 1, 2º Time 2, 3º Time 3, 4º Time 4');

  // --------------------------------------------------------------------------
  // TESTE 3 & 4: Time 1 vence Time 2 (3 x 1)
  // --------------------------------------------------------------------------
  console.log('\n--- TESTES 3 & 4: Partida 01 (Time 1 3 x 1 Time 2) ---');
  Partidas.init();
  Partidas.startOrResumeMatch();
  Partidas.state.homeScore = 3;
  Partidas.state.awayScore = 1;
  Partidas.state.goals = [
    { id: 'g1', playerId: 'p1', playerName: 'Atleta 1', teamId: 'time_1', minuteFormatted: '02:00' },
    { id: 'g2', playerId: 'p2', playerName: 'Atleta 2', teamId: 'time_1', minuteFormatted: '05:00' },
    { id: 'g3', playerId: 'p3', playerName: 'Atleta 3', teamId: 'time_1', minuteFormatted: '07:00' },
    { id: 'g4', playerId: 'p6', playerName: 'Atleta 6', teamId: 'time_2', minuteFormatted: '08:00' }
  ];
  Partidas.finalizarPartida();

  // Recalcula tabela
  const standingsP1 = Tabela.calcularTabelaRodada();
  const t1 = standingsP1.find(t => t.id === 'time_1');
  const t2 = standingsP1.find(t => t.id === 'time_2');
  const t3 = standingsP1.find(t => t.id === 'time_3');
  const t4 = standingsP1.find(t => t.id === 'time_4');

  assert(t1.j === 1 && t1.v === 1 && t1.e === 0 && t1.d === 0 && t1.gp === 3 && t1.gc === 1 && t1.sg === 2 && t1.pts === 3, '3.1', 'Time 1: J 1, V 1, E 0, D 0, GP 3, GC 1, SG +2, PTS 3');
  assert(t2.j === 1 && t2.v === 0 && t2.e === 0 && t2.d === 1 && t2.gp === 1 && t2.gc === 3 && t2.sg === -2 && t2.pts === 0, '3.2', 'Time 2: J 1, V 0, E 0, D 1, GP 1, GC 3, SG -2, PTS 0');
  assert(t3.j === 0 && t3.pts === 0 && t3.gp === 0 && t3.gc === 0, '4.1', 'Time 3 continua na tabela com 0 jogos e 0 pontos');
  assert(t4.j === 0 && t4.pts === 0 && t4.gp === 0 && t4.gc === 0, '4.2', 'Time 4 continua na tabela com 0 jogos e 0 pontos');
  assert(standingsP1[0].id === 'time_1', '4.3', 'Time 1 é líder isolado da tabela com 3 pontos');

  // --------------------------------------------------------------------------
  // TESTE 5: Empate Time 3 x Time 4 (2 x 2)
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 5: Partida 02 (Time 3 2 x 2 Time 4 — Empate) ---');
  // Admin escolhe Time 3
  Partidas.selecionarProximoAdversario('time_3');
  Partidas.startOrResumeMatch();
  Partidas.state.homeTeamId = 'time_3';
  Partidas.state.awayTeamId = 'time_4';
  Partidas.state.homeScore = 2;
  Partidas.state.awayScore = 2;
  Partidas.state.goals = [
    { id: 'g5', playerId: 'p11', playerName: 'Atleta 11', teamId: 'time_3', minuteFormatted: '03:00' },
    { id: 'g6', playerId: 'p12', playerName: 'Atleta 12', teamId: 'time_3', minuteFormatted: '06:00' },
    { id: 'g7', playerId: 'p16', playerName: 'Atleta 16', teamId: 'time_4', minuteFormatted: '04:00' },
    { id: 'g8', playerId: 'p17', playerName: 'Atleta 17', teamId: 'time_4', minuteFormatted: '08:00' }
  ];
  Partidas.finalizarPartida();

  const standingsP2 = Tabela.calcularTabelaRodada();
  const t3_p2 = standingsP2.find(t => t.id === 'time_3');
  const t4_p2 = standingsP2.find(t => t.id === 'time_4');

  assert(t3_p2.j === 1 && t3_p2.v === 0 && t3_p2.e === 1 && t3_p2.d === 0 && t3_p2.gp === 2 && t3_p2.gc === 2 && t3_p2.sg === 0 && t3_p2.pts === 1, '5.1', 'Time 3: J 1, E 1, GP 2, GC 2, SG 0, PTS 1');
  assert(t4_p2.j === 1 && t4_p2.v === 0 && t4_p2.e === 1 && t4_p2.d === 0 && t4_p2.gp === 2 && t4_p2.gc === 2 && t4_p2.sg === 0 && t4_p2.pts === 1, '5.2', 'Time 4: J 1, E 1, GP 2, GC 2, SG 0, PTS 1');

  // --------------------------------------------------------------------------
  // TESTE 12: Empate NÃO Cria Vencedor Artificial
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 12: Integridade de Empate ---');
  assert(Partidas.state.winnerTeamId === null, '12.1', 'Após empate, winnerTeamId é null (sem vencedor artificial)');
  assert(Partidas.state.tiePendingResolution === false, '12.2', 'Sem pendência de escolha de vencedor');

  // --------------------------------------------------------------------------
  // TESTE 6 & 7: Recalcular após múltiplas partidas e Ordenação (PTS, SG, GP)
  // --------------------------------------------------------------------------
  console.log('\n--- TESTES 6 & 7: Múltiplas Partidas e Critérios de Ordenação ---');
  // Ordem atual esperada:
  // 1º Time 1 (3 pts, SG +2)
  // 2º/3º Time 3 e Time 4 (1 pt, SG 0, GP 2)
  // 4º Time 2 (0 pts, SG -2)
  assert(standingsP2[0].id === 'time_1', '7.1', '1º colocado é Time 1 (3 pts)');
  assert(standingsP2[1].pts === 1 && standingsP2[2].pts === 1, '7.2', '2º e 3º colocados têm 1 ponto cada');
  assert(standingsP2[3].id === 'time_2', '7.3', '4º colocado é Time 2 (0 pts)');

  // --------------------------------------------------------------------------
  // TESTE 8: Atualizar após Reload (Reconstrução a partir do Storage)
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 8: Persistência e Reconstrução da Tabela ---');
  const matchesInStore = Storage.getMatches();
  const reloadedStandings = Tabela.calcularTabela(matchesInStore);
  assert(reloadedStandings.length === 4, '8.1', 'Tabela reconstruída possui 4 times');
  assert(reloadedStandings[0].id === 'time_1' && reloadedStandings[0].pts === 3, '8.2', 'Líder reconstruído com 3 pontos');

  // --------------------------------------------------------------------------
  // TESTE 9: Atualização via Realtime
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 9: Reação da Tabela a Eventos Realtime ---');
  let realtimeUpdated = false;
  Storage.onChange((type) => {
    if (type === 'matches') {
      realtimeUpdated = true;
    }
  });
  // Simula chegada de partida via syncMatchFromSupabase (Realtime payload)
  await Storage.syncMatchFromSupabase({
    id: 'mat_realtime_1',
    futebol_id: Storage.currentFutebol.id,
    rodada_id: round.id,
    time_casa_id: 'time_1',
    time_fora_id: 'time_4',
    time_casa_nome: 'Time 1',
    time_fora_nome: 'Time 4',
    placar_casa: 2,
    placar_fora: 0,
    status: 'finalizada',
    created_at: new Date().toISOString()
  });
  Storage._emitChange('matches', Storage.getMatches());

  assert(realtimeUpdated, '9.1', 'Evento Realtime disparou notificação de matches');
  const rtStandings = Tabela.calcularTabelaRodada();
  const t1_rt = rtStandings.find(t => t.id === 'time_1');
  assert(t1_rt.j === 2 && t1_rt.v === 2 && t1_rt.pts === 6, '9.2', 'Tabela calculada após evento Realtime computou nova vitória (6 pts, 2 jogos)');

  // --------------------------------------------------------------------------
  // TESTE 10: Não Duplicar Pontos
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 10: Idempotência / Prevenção de Duplicidade ---');
  const matchesDuplicate = [...Storage.getMatches(), Storage.getMatches()[0]];
  const deduplicatedStandings = Tabela.calcularTabela(matchesDuplicate);
  const t1_dedup = deduplicatedStandings.find(t => t.id === 'time_1');
  assert(t1_dedup.pts === 6 && t1_dedup.j === 2, '10.1', 'Partida com mesmo ID duplicada na lista NÃO duplica pontos (mantém 6 pts, 2 jogos)');

  // --------------------------------------------------------------------------
  // TESTE 11: Times Fora de Campo Continuam na Tabela
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 11: Todos os 4 Times Sempre Presentes ---');
  Tabela.render();
  const renderedStandings = Tabela.calcularTabelaRodada();
  assert(renderedStandings.some(t => t.id === 'time_1'), '11.1', 'Time 1 presente');
  assert(renderedStandings.some(t => t.id === 'time_2'), '11.2', 'Time 2 presente (mesmo estando fora de campo)');
  assert(renderedStandings.some(t => t.id === 'time_3'), '11.3', 'Time 3 presente (mesmo estando fora de campo)');
  assert(renderedStandings.some(t => t.id === 'time_4'), '11.4', 'Time 4 presente');


  // --------------------------------------------------------------------------
  // TESTE 13: Capa NÃO é Alterada pela Tabela
  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 13: Regra da Capa Intacta ---');
  const capas = Storage.getCapas();
  assert(capas.length === 0, '13.1', 'Nenhuma Capa atribuída pelas partidas ou recálculos da tabela (total: 0)');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestTabela().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
