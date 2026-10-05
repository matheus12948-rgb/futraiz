/**
 * BATERIA DE TESTES DEFINITIVOS: TABELA POR RODADA/NOITE (FUTRODA)
 * 
 * Validação rigorosa dos requisitos:
 * 1. Tabela Atual por Rodada/Noite (inicia zerada a cada nova rodada).
 * 2. Atualização imediata durante a rodada após partidas finalizadas.
 * 3. Encerramento da noite gera snapshot congelado e atribui Capas.
 * 4. Histórico armazena a classificação FINAL de cada rodada/noite.
 * 5. Persistência e snapshot em rodada_classificacao no Supabase.
 * 6. Nova Rodada NÃO copia nem acumula pontos anteriores.
 * 7. Estatísticas de jogadores preservadas acumulativamente (gols e Capas).
 * 8. Reload / sincronização do Supabase restaura a rodada ativa e histórico.
 * 9. Isolamento total entre diferentes futebóis (multi-tenancy).
 * 10. Acesso de Usuário Admin e Usuário Público via código.
 */

import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Tabela } from '../js/tabela.js';
import { Utils } from '../js/utils.js';
import { supabase } from '../js/supabaseClient.js';

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

async function runTests() {
  console.log('================================================================');
  console.log('TESTES DEFINITIVOS: TABELA POR RODADA/NOITE (ISOLAMENTO TOTAL)');
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

  // ============================================================================
  // FASE 1: CRIAR FUTEBOL A E RODADA 01
  // ============================================================================
  console.log('--- FASE 1: Futebol A — Criação e Inicialização da Rodada 01 ---');
  const resFutA = await Storage.createFutebol({
    nome: 'Futebol das Estrelas A',
    adminNome: 'Admin A',
    email: 'adminA@fut.com',
    password: 'senhaSegura123'
  });
  assert(resFutA.success, '1.1', `Futebol A criado com código: ${resFutA.futebol.codigo_publico}`);

  // Configura 4 times para o Futebol A
  const teamsA = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#16a34a', players: [{ id: 'pa1', name: 'Atleta A1' }, { id: 'pa2', name: 'Atleta A2' }, { id: 'pa3', name: 'Atleta A3' }, { id: 'pa4', name: 'Atleta A4' }, { id: 'pa5', name: 'Atleta A5' }] },
    time_2: { id: 'time_2', name: 'Time 2', color: '#dc2626', players: [{ id: 'pa6', name: 'Atleta A6' }, { id: 'pa7', name: 'Atleta A7' }, { id: 'pa8', name: 'Atleta A8' }, { id: 'pa9', name: 'Atleta A9' }, { id: 'pa10', name: 'Atleta A10' }] },
    time_3: { id: 'time_3', name: 'Time 3', color: '#2563eb', players: [{ id: 'pa11', name: 'Atleta A11' }, { id: 'pa12', name: 'Atleta A12' }, { id: 'pa13', name: 'Atleta A13' }, { id: 'pa14', name: 'Atleta A14' }, { id: 'pa15', name: 'Atleta A15' }] },
    time_4: { id: 'time_4', name: 'Time 4', color: '#ca8a04', players: [{ id: 'pa16', name: 'Atleta A16' }, { id: 'pa17', name: 'Atleta A17' }, { id: 'pa18', name: 'Atleta A18' }, { id: 'pa19', name: 'Atleta A19' }, { id: 'pa20', name: 'Atleta A20' }] }
  };
  Storage.saveTeams(teamsA);

  const round1 = {
    id: 'rodada_A_01',
    numero: 1,
    date: '03/10/2026',
    dateKey: '2026-10-03',
    status: 'READY',
    teams: teamsA
  };
  Storage.saveCurrentRound(round1);

  // Verifica tabela inicial da Rodada 01 (tudo zerado)
  const initialStandings = Tabela.calcularTabelaRodada();
  assert(initialStandings.length === 4, '1.2', 'Rodada 01 inicializada com 4 times');
  const allZerosR1 = initialStandings.every(t => t.j === 0 && t.pts === 0 && t.gp === 0 && t.gc === 0 && t.sg === 0);
  assert(allZerosR1, '1.3', 'Todos os 4 times começam com J=0, V=0, E=0, D=0, GP=0, GC=0, SG=0, PTS=0');

  // Inicia a noite
  Storage.startNight();
  assert(Storage.getCurrentRound().status === 'ACTIVE', '1.4', 'Rodada 01 marcada como ACTIVE');

  // ============================================================================
  // FASE 2: REALIZAR PARTIDAS NA RODADA 01
  // ============================================================================
  console.log('\n--- FASE 2: Jogar Partidas na Rodada 01 ---');
  Partidas.init();

  // Partida 1: Time 1 (3) x Time 2 (1) -> Time 1 vence
  Partidas.startOrResumeMatch();
  Partidas.state.homeTeamId = 'time_1';
  Partidas.state.awayTeamId = 'time_2';
  Partidas.state.homeScore = 3;
  Partidas.state.awayScore = 1;
  Partidas.finalizarPartida();

  // Partida 2: Time 1 (2) x Time 3 (2) -> Empate
  Partidas.selecionarProximoAdversario('time_3');
  Partidas.startOrResumeMatch();
  Partidas.state.homeTeamId = 'time_1';
  Partidas.state.awayTeamId = 'time_3';
  Partidas.state.homeScore = 2;
  Partidas.state.awayScore = 2;
  Partidas.finalizarPartida();

  // Partida 3: Time 4 (1) x Time 2 (0) -> Time 4 vence
  Partidas.selecionarProximoAdversario('time_4');
  Partidas.startOrResumeMatch();
  Partidas.state.homeTeamId = 'time_4';
  Partidas.state.awayTeamId = 'time_2';
  Partidas.state.homeScore = 1;
  Partidas.state.awayScore = 0;
  Partidas.finalizarPartida();

  // Valida a classificação da Rodada 01
  const standingsR1 = Tabela.calcularTabelaRodada();
  const t1_r1 = standingsR1.find(t => t.id === 'time_1');
  const t4_r1 = standingsR1.find(t => t.id === 'time_4');
  const t3_r1 = standingsR1.find(t => t.id === 'time_3');
  const t2_r1 = standingsR1.find(t => t.id === 'time_2');

  assert(t1_r1.j === 2 && t1_r1.v === 1 && t1_r1.e === 1 && t1_r1.d === 0 && t1_r1.gp === 5 && t1_r1.gc === 3 && t1_r1.sg === 2 && t1_r1.pts === 4, '2.1', 'Time 1 líder da Rodada 01: J 2, V 1, E 1, D 0, GP 5, GC 3, SG +2, PTS 4');
  assert(t4_r1.j === 1 && t4_r1.v === 1 && t4_r1.pts === 3, '2.2', 'Time 4 vice da Rodada 01: J 1, V 1, PTS 3');
  assert(t3_r1.j === 1 && t3_r1.e === 1 && t3_r1.pts === 1, '2.3', 'Time 3: J 1, E 1, PTS 1');
  assert(t2_r1.j === 2 && t2_r1.d === 2 && t2_r1.pts === 0, '2.4', 'Time 2: J 2, D 2, PTS 0');
  assert(standingsR1[0].id === 'time_1', '2.5', 'Time 1 é isoladamente o campeão na tabela');

  // ============================================================================
  // FASE 3: ENCERRAR NOITE DA RODADA 01 (SNAPSHOT E CAPA)
  // ============================================================================
  console.log('\n--- FASE 3: Encerrar Noite da Rodada 01 e Salvar Snapshot ---');
  Partidas.solicitarEncerramentoNoite();
  Partidas.executarEncerramentoNoite('time_1', 'Time 1', teamsA.time_1.players);

  const round1Finished = Storage.getCurrentRound();
  assert(round1Finished.status === 'FINISHED', '3.1', 'Rodada 01 marcada rigorosamente como FINISHED');
  assert(round1Finished.campeaoTimeId === 'time_1', '3.2', 'Campeão Time 1 registrado');
  assert(Array.isArray(round1Finished.standingsSnapshot) && round1Finished.standingsSnapshot.length === 4, '3.3', 'Snapshot com 4 times salvo dentro da rodada');
  assert(round1Finished.standingsSnapshot[0].id === 'time_1' && round1Finished.standingsSnapshot[0].pts === 4, '3.4', 'Snapshot congelou Time 1 com 4 pontos');

  const snapshotFromStore = Storage.getRoundStandingsSnapshot('rodada_A_01');
  assert(snapshotFromStore !== null && snapshotFromStore[0].pts === 4, '3.5', 'Snapshot consultável via Storage.getRoundStandingsSnapshot');

  const capasA = Storage.getCapas();
  assert(capasA.length === 5, '3.6', 'Exatamente 5 Capas distribuídas no encerramento da Rodada 01');

  // ============================================================================
  // FASE 4: INICIAR NOVA RODADA 02 (ZERADA E INDEPENDENTE)
  // ============================================================================
  console.log('\n--- FASE 4: Iniciar Rodada 02 — Verificação de Zeros e Não-Contaminação ---');
  Storage.startNewRound();
  assert(Storage.getCurrentRound() === null, '4.1', 'startNewRound limpou rodada ativa anterior');

  const round2 = {
    id: 'rodada_A_02',
    numero: 2,
    date: '04/10/2026',
    dateKey: '2026-10-04',
    status: 'READY',
    teams: teamsA
  };
  Storage.saveCurrentRound(round2);
  Storage.startNight();

  // Verifica a Tabela Atual da Rodada 02
  const standingsR2_initial = Tabela.calcularTabelaRodada();
  assert(standingsR2_initial.length === 4, '4.2', 'Tabela Atual da Rodada 02 contém 4 times');

  const t1_r2_init = standingsR2_initial.find(t => t.id === 'time_1');
  const t2_r2_init = standingsR2_initial.find(t => t.id === 'time_2');
  const t3_r2_init = standingsR2_initial.find(t => t.id === 'time_3');
  const t4_r2_init = standingsR2_initial.find(t => t.id === 'time_4');

  assert(t1_r2_init.pts === 0 && t1_r2_init.j === 0 && t1_r2_init.v === 0 && t1_r2_init.gp === 0 && t1_r2_init.sg === 0, '4.3', 'Time 1 começa rigorosamente com 0 pontos na Rodada 02 (SEM contaminação da Rodada 01)');
  assert(t2_r2_init.pts === 0 && t2_r2_init.j === 0, '4.4', 'Time 2 começa rigorosamente com 0 pontos na Rodada 02');
  assert(t3_r2_init.pts === 0 && t3_r2_init.j === 0, '4.5', 'Time 3 começa rigorosamente com 0 pontos na Rodada 02');
  assert(t4_r2_init.pts === 0 && t4_r2_init.j === 0, '4.6', 'Time 4 começa rigorosamente com 0 pontos na Rodada 02');

  // ============================================================================
  // FASE 5: CONSULTAR HISTÓRICO DA RODADA 01
  // ============================================================================
  console.log('\n--- FASE 5: Consultar Histórico da Rodada 01 enquanto Rodada 02 está ativa ---');
  const historicoR1 = Tabela.calcularTabelaRodada('rodada_A_01');
  const t1_hist = historicoR1.find(t => t.id === 'time_1');
  const t2_hist = historicoR1.find(t => t.id === 'time_2');

  assert(t1_hist.pts === 4 && t1_hist.j === 2 && t1_hist.gp === 5, '5.1', 'Histórico da Rodada 01 continua preservando exatamente 4 pontos para o Time 1');
  assert(t2_hist.pts === 0 && t2_hist.j === 2, '5.2', 'Histórico da Rodada 01 continua preservando 0 pontos e 2 jogos para o Time 2');

  // ============================================================================
  // FASE 6: JOGAR PARTIDAS NA RODADA 02
  // ============================================================================
  console.log('\n--- FASE 6: Jogar Partida na Rodada 02 (Inversão: Time 2 vence Time 1) ---');
  Partidas.init();
  Partidas.startOrResumeMatch();
  Partidas.state.homeTeamId = 'time_2';
  Partidas.state.awayTeamId = 'time_1';
  Partidas.state.homeScore = 4;
  Partidas.state.awayScore = 0;
  Partidas.finalizarPartida();

  const standingsR2_afterMatch = Tabela.calcularTabelaRodada();
  const t2_r2_after = standingsR2_afterMatch.find(t => t.id === 'time_2');
  const t1_r2_after = standingsR2_afterMatch.find(t => t.id === 'time_1');

  assert(t2_r2_after.pts === 3 && t2_r2_after.j === 1 && t2_r2_after.sg === 4, '6.1', 'Rodada 02: Time 2 agora é líder com 3 pontos e SG +4');
  assert(t1_r2_after.pts === 0 && t1_r2_after.j === 1 && t1_r2_after.sg === -4, '6.2', 'Rodada 02: Time 1 tem 0 pontos e SG -4');

  // Verifica que a Rodada 01 no histórico permaneceu 100% inalterada
  const historicoR1_recheck = Tabela.calcularTabelaRodada('rodada_A_01');
  assert(historicoR1_recheck.find(t => t.id === 'time_1').pts === 4, '6.3', 'Histórico da Rodada 01 não foi modificado pelo jogo da Rodada 02');

  // ============================================================================
  // FASE 7: RELOAD / SINCRONIZAÇÃO A PARTIR DO SUPABASE
  // ============================================================================
  console.log('\n--- FASE 7: Simulação de Reload da Página e Sincronização Supabase ---');
  // Simula limpeza de cache de memória
  delete mockStorage[Storage._getScopedKey('rodada_classificacao')];
  await Storage.syncRoundsFromSupabase(Storage.currentFutebol.id);
  await Storage.syncMatchesFromSupabase(Storage.currentFutebol.id);
  await Storage.syncStandingsSnapshotsFromSupabase(Storage.currentFutebol.id);

  const reloadedActiveRound = Storage.getCurrentRound();
  assert(reloadedActiveRound && reloadedActiveRound.id === 'rodada_A_02', '7.1', 'Reload restaurou Rodada 02 como rodada ativa');
  const standingsReloaded = Tabela.calcularTabelaRodada();
  assert(standingsReloaded.find(t => t.id === 'time_2').pts === 3, '7.2', 'Tabela ativa após reload mantém Time 2 com 3 pontos');

  // ============================================================================
  // FASE 8: USUÁRIO PÚBLICO VIA CÓDIGO FDT-XXXX
  // ============================================================================
  console.log('\n--- FASE 8: Acesso de Usuário Público (Somente Leitura) ---');
  const publicRes = await Storage.loadPublicFutebol(resFutA.futebol.codigo_publico);
  assert(publicRes.success, '8.1', 'Usuário público acessou Futebol A com sucesso');
  assert(Storage.isPublicViewer(), '8.2', 'Papel definido como PUBLIC_VIEWER');

  const publicStandings = Tabela.calcularTabelaRodada();
  assert(publicStandings.find(t => t.id === 'time_2').pts === 3, '8.3', 'Público visualiza a tabela da rodada ativa perfeitamente');

  const publicHistR1 = Tabela.calcularTabelaRodada('rodada_A_01');
  assert(publicHistR1.find(t => t.id === 'time_1').pts === 4, '8.4', 'Público visualiza o histórico da Rodada 01 com o snapshot final');

  // Bloqueio de mutação por público
  let mutationBlocked = false;
  try {
    Storage.assertAdmin('Alterar rodada');
  } catch {
    mutationBlocked = true;
  }
  assert(mutationBlocked, '8.5', 'Público é estritamente impedido de alterar dados (assertAdmin)');

  // ============================================================================
  // FASE 9: ISOLAMENTO ENTRE DOIS FUTEBÓIS DISTINTOS (MULTI-TENANCY)
  // ============================================================================
  console.log('\n--- FASE 9: Isolamento entre Futebol A e Futebol B ---');
  const resFutB = await Storage.createFutebol({
    nome: 'Pelada de Terça B',
    adminNome: 'Admin B',
    email: 'adminB@fut.com',
    password: 'senhaSegura123'
  });
  assert(resFutB.success, '9.1', `Futebol B criado com código: ${resFutB.futebol.codigo_publico}`);

  // No Futebol B, nenhuma rodada existe ainda
  assert(Storage.getCurrentRound() === null, '9.2', 'Futebol B não possui rodada ativa (isolamento total)');
  assert(Storage.getRounds().length === 0, '9.3', 'Futebol B não enxerga o histórico da Rodada 01 ou 02 do Futebol A');
  assert(Storage.getMatches().length === 0, '9.4', 'Futebol B não enxerga as partidas do Futebol A');

  // Cria Rodada 01 no Futebol B
  Storage.saveTeams(teamsA);
  const roundB1 = {
    id: 'rodada_B_01',
    numero: 1,
    date: '04/10/2026',
    dateKey: '2026-10-04',
    status: 'READY',
    teams: teamsA
  };
  Storage.saveCurrentRound(roundB1);
  Storage.startNight();

  Partidas.init();
  Partidas.startOrResumeMatch();
  Partidas.state.homeTeamId = 'time_3';
  Partidas.state.awayTeamId = 'time_4';
  Partidas.state.homeScore = 5;
  Partidas.state.awayScore = 0;
  Partidas.finalizarPartida();

  const standingsB = Tabela.calcularTabelaRodada();
  assert(standingsB.find(t => t.id === 'time_3').pts === 3, '9.5', 'Futebol B: Time 3 venceu com 3 pontos');

  // Retorna ao Futebol A como Admin A
  console.log('\n--- FASE 10: Retorno ao Futebol A — Integridade e Não-Contaminação ---');
  await Storage.loginAdmin({ email: 'adminA@fut.com', password: 'senhaSegura123' });
  assert(Storage.currentFutebol.id === resFutA.futebol.id, '10.1', 'Admin A logado novamente no Futebol A');

  const standingsA_finalCheck = Tabela.calcularTabelaRodada();
  assert(standingsA_finalCheck.find(t => t.id === 'time_2').pts === 3, '10.2', 'Futebol A mantém Time 2 com 3 pontos (sem interferência de B)');
  assert(standingsA_finalCheck.find(t => t.id === 'time_3').pts === 0, '10.3', 'Futebol A: Time 3 tem 0 pontos (não herdou os 3 pontos do Time 3 do Futebol B!)');

  const histA_finalCheck = Tabela.calcularTabelaRodada('rodada_A_01');
  assert(histA_finalCheck.find(t => t.id === 'time_1').pts === 4, '10.4', 'Histórico da Rodada 01 do Futebol A permanece 100% intacto');

  // ============================================================================
  // FASE 11: RENDERIZAÇÃO DA TELA TABELA (UI)
  // ============================================================================
  console.log('\n--- FASE 11: Renderização da Tela Tabela (Tabela Atual + Histórico) ---');
  Tabela.render();
  const tabelaEl = document.getElementById('tabela-container');
  assert(tabelaEl.innerHTML.includes('TABELA ATUAL'), '11.1', 'UI contém o bloco TABELA ATUAL');
  assert(tabelaEl.innerHTML.includes('HISTÓRICO'), '11.2', 'UI contém o bloco HISTÓRICO');
  assert(tabelaEl.innerHTML.includes('rodada_A_01') || tabelaEl.innerHTML.includes('03/10/2026'), '11.3', 'UI exibe o histórico da noite anterior com a data');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
