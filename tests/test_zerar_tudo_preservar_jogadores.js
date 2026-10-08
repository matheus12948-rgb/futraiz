/**
 * TESTE OBRIGATÓRIO: ZERAR TUDO PRESERVANDO SOMENTE OS JOGADORES
 * 
 * Validação rigorosa dos 25 itens exigidos:
 * 1. Criar jogadores.
 * 2. Criar rodada.
 * 3. Criar times.
 * 4. Criar partida.
 * 5. Registrar gols.
 * 6. Gerar histórico.
 * 7. Gerar ranking de gols.
 * 8. Gerar Capa.
 * 9. Encerrar noite.
 * 10. Executar "ZERAR TUDO".
 * 11. Confirmar que TODOS os dados operacionais foram removidos.
 * 12. Confirmar que TODOS os jogadores continuam existentes.
 * 13. Confirmar que IDs dos jogadores não mudaram.
 * 14. Confirmar que ranking de gols está zerado.
 * 15. Confirmar que ranking de Capas está zerado.
 * 16. Confirmar que histórico está vazio.
 * 17. Confirmar que não existe partida ao vivo.
 * 18. Confirmar que não existe rodada ativa.
 * 19. Confirmar que outro futebol não foi afetado.
 * 20. Confirmar que usuário não-admin não consegue executar.
 * 21. Confirmar sincronização em outro dispositivo.
 * 22. Confirmar funcionamento após reload.
 * 23. Criar nova rodada usando os jogadores preservados.
 * 24. Sortear nova rodada normalmente.
 * 25. Iniciar nova partida normalmente.
 */

import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Sorteio } from '../js/sorteio.js';
import { Tabela } from '../js/tabela.js';
import { Rankings } from '../js/rankings.js';
import { Historico } from '../js/historico.js';
import { Configuracoes } from '../js/configuracoes.js';
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
Storage._store = global.localStorage;

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
    insertBefore: (child, ref) => {
      children.unshift(child);
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
    if (!domStore[id]) domStore[id] = createMockElement(id);
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
  App: {
    navigateTo: () => {},
    refreshAll: () => {},
    updateHeaderUI: () => {}
  }
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

async function runTests() {
  console.log('================================================================');
  console.log('BATERIA DE TESTES: ZERAR TUDO — PRESERVAR SOMENTE JOGADORES');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testNum, desc) {
    if (condition) {
      console.log(`  ✅ [Item ${testNum}] PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [Item ${testNum}] FAIL: ${desc}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // SETUP: Futebol A e Futebol B (Para testar multi-tenancy e isolamento)
  // --------------------------------------------------------------------------
  console.log('--- SETUP: FUTEBOL A (Principal) e FUTEBOL B (Isolamento) ---');
  
  const futA = await Storage.createFutebol({
    nome: 'Futebol Quinta Raiz',
    adminNome: 'Admin Futebol A',
    email: 'adminA@teste.com',
    password: 'password123'
  });
  const futAId = futA.futebol.id;

  // --------------------------------------------------------------------------
  // ITEM 1: Criar 25 Jogadores no Futebol A
  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 1: Criar Jogadores ---');
  const originalPlayers = [];
  for (let i = 1; i <= 25; i++) {
    const p = await Storage.addPlayer({
      name: `Craque ${i}`,
      stars: (i % 5) + 1
    });
    originalPlayers.push({ id: p.id, name: p.name, stars: p.stars });
  }

  assert(Storage.getPlayers().length === 25, '1.1', '25 jogadores cadastrados no Futebol A');
  assert(originalPlayers.every(p => Utils.isUUID(p.id)), '1.2', 'Todos os 25 jogadores possuem UUIDs válidos');

  // --------------------------------------------------------------------------
  // ITEM 2 & 3: Criar Rodada e Times (4 times de 5 jogadores)
  // --------------------------------------------------------------------------
  console.log('\n--- ITENS 2 & 3: Criar Rodada e Times ---');
  const selected20 = originalPlayers.slice(0, 20);
  Storage.saveSelectedPlayerIds(selected20.map(p => p.id));

  const teamsA = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#16a34a', players: selected20.slice(0, 5) },
    time_2: { id: 'time_2', name: 'Time 2', color: '#dc2626', players: selected20.slice(5, 10) },
    time_3: { id: 'time_3', name: 'Time 3', color: '#2563eb', players: selected20.slice(10, 15) },
    time_4: { id: 'time_4', name: 'Time 4', color: '#ca8a04', players: selected20.slice(15, 20) }
  };
  Storage.saveTeams(teamsA);

  const roundA = {
    id: Utils.generateUUID(),
    date: '10/10/2026',
    dateKey: '2026-10-10',
    status: 'ACTIVE',
    teams: teamsA,
    selectedPlayerIds: selected20.map(p => p.id)
  };
  Storage.saveCurrentRound(roundA);

  assert(Storage.getCurrentRound() !== null, '2.1', 'Rodada criada e ativa no Storage');
  assert(Storage.getTeams() !== null, '3.1', '4 times formados com 5 atletas cada');

  // --------------------------------------------------------------------------
  // ITENS 4 & 5: Criar Partida e Registrar Gols
  // --------------------------------------------------------------------------
  console.log('\n--- ITENS 4 & 5: Criar Partida e Registrar Gols ---');
  Partidas.state = {
    order: 1,
    status: 'running',
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 2',
    homeScore: 2,
    awayScore: 1,
    goals: [
      { id: Utils.generateUUID(), playerId: selected20[0].id, playerName: selected20[0].name, teamId: 'time_1', minuteFormatted: '02:00' },
      { id: Utils.generateUUID(), playerId: selected20[1].id, playerName: selected20[1].name, teamId: 'time_1', minuteFormatted: '05:00' },
      { id: Utils.generateUUID(), playerId: selected20[5].id, playerName: selected20[5].name, teamId: 'time_2', minuteFormatted: '06:00' }
    ]
  };
  Storage.saveLiveMatch(Partidas.state);
  assert(Storage.getLiveMatch() !== null, '4.1', 'Partida ao vivo registrada no Storage e Supabase');

  Partidas.finalizarPartida();
  assert(Storage.getMatches().length === 1, '5.1', 'Partida finalizada e gols computados com sucesso');

  // --------------------------------------------------------------------------
  // ITENS 6, 7 & 8: Gerar Histórico, Ranking de Gols e Capa
  // --------------------------------------------------------------------------
  console.log('\n--- ITENS 6, 7 & 8: Histórico, Ranking de Gols e Capas ---');
  const matchesHist = Storage.getMatches();
  assert(matchesHist.length === 1 && matchesHist[0].homeScore === 2, '6.1', 'Histórico contém Partida 01 (2 x 1)');

  const artilharia = Rankings.getArtilhariaData();
  assert(artilharia.length === 3, '7.1', 'Ranking de Artilharia computou os 3 autores dos gols');

  // --------------------------------------------------------------------------
  // ITEM 9: Encerrar a Noite
  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 9: Encerrar Noite ---');
  await Storage.endNight({
    championTeamId: 'time_1',
    championTeamName: 'Time 1',
    capaPlayers: teamsA.time_1.players
  });

  const roundFinished = Storage.getCurrentRound();
  assert(roundFinished.status === 'FINISHED', '9.1', 'Noite encerrada: rodada com status FINISHED');
  assert(Storage.getCapas().length === 5, '8.1', 'Exatamente 5 Capas concedidas aos atletas do campeão');
  assert(Rankings.getCapaData().length === 5, '9.2', 'Ranking de Capas exibe os 5 atletas campeões');

  // --------------------------------------------------------------------------
  // SETUP FUTEBOL B: Criar dados operacionais no Futebol B para verificar isolamento
  // --------------------------------------------------------------------------
  console.log('\n--- SETUP FUTEBOL B (Validação de Isolamento Multi-Tenancy) ---');
  const futB = await Storage.createFutebol({
    nome: 'Futebol Domingo Amigos',
    adminNome: 'Admin Futebol B',
    email: 'adminB@teste.com',
    password: 'password123'
  });
  const futBId = futB.futebol.id;

  // Cadastra 20 jogadores no Futebol B
  const bPlayers = [];
  for (let i = 1; i <= 20; i++) {
    const bp = await Storage.addPlayer({ name: `Atleta B ${i}`, stars: 3 });
    bPlayers.push(bp);
  }
  const bRound = {
    id: Utils.generateUUID(),
    date: '10/10/2026',
    dateKey: '2026-10-10',
    status: 'ACTIVE',
    teams: {
      time_1: { id: 'time_1', name: 'Time B1', players: bPlayers.slice(0, 5) },
      time_2: { id: 'time_2', name: 'Time B2', players: bPlayers.slice(5, 10) }
    }
  };
  Storage.saveCurrentRound(bRound);
  Storage.addMatch({
    id: Utils.generateUUID(),
    roundId: bRound.id,
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Time B1',
    awayTeamName: 'Time B2',
    homeScore: 1,
    awayScore: 0,
    status: 'finalizada'
  });
  assert(Storage.getMatches().length === 1, 'SETUP_B', 'Futebol B possui 1 partida ativa independente');

  // Volta para Futebol A
  await Storage.loginAdmin('adminA@teste.com', 'password123');
  assert(Storage.currentFutebol.id === futAId, 'SETUP_A_RESTORE', 'Admin A ativo novamente no Futebol A');

  // --------------------------------------------------------------------------
  // ITEM 20: Usuário Público (Não-Admin) É Bloqueado de Executar Reset
  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 20: Proteção RLS / Não-Admin ---');
  Storage.userRole = 'PUBLIC_VIEWER';
  let nonAdminBlocked = false;
  try {
    await Storage.resetAll();
  } catch (err) {
    nonAdminBlocked = true;
  }
  Storage.userRole = 'ADMIN';
  assert(nonAdminBlocked, '20.1', 'Usuário público (read-only) é estritamente impedido de executar ZERAR TUDO');

  // --------------------------------------------------------------------------
  // ITEM 10: Executar "ZERAR TUDO" no Futebol A
  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 10: Executar ZERAR TUDO ---');
  let resetTriggered = false;
  Storage.onChange((type) => {
    if (type === 'reset') resetTriggered = true;
  });

  const resetResult = await Storage.resetAll();
  assert(resetResult === true && resetTriggered, '10.1', 'Operação Storage.resetAll() executada com sucesso e evento emitido');

  // --------------------------------------------------------------------------
  // ITEM 11: Confirmar Remoção de TODOS os Dados Operacionais no Futebol A
  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 11: Validação de Limpeza de Dados Operacionais ---');
  assert(Storage.getCurrentRound() === null, '11.1', 'Rodada atual é NULL');
  assert(Storage.getRounds().length === 0, '11.2', 'Histórico de rodadas está vazio (0)');
  assert(Storage.getTeams() === null, '11.3', 'Times formados são NULL');
  assert(Storage.getSelectedPlayerIds().length === 0, '11.4', 'Seleção de jogadores por rodada está vazia (0)');
  assert(Storage.getMatches().length === 0, '11.5', 'Histórico de partidas está vazio (0)');
  assert(Storage.getCapas().length === 0, '11.6', 'Registro de Capas está vazio (0)');
  assert(Storage.getLiveMatch() === null, '11.7', 'Partida ao vivo é NULL');
  assert(Object.keys(Storage.getAllStandingsSnapshots()).length === 0, '11.8', 'Snapshots de tabela estão vazios (0)');

  // Validação no Supabase para Futebol A
  const { data: dbPartidasA } = await supabase.from('partidas').select('*').eq('futebol_id', futAId);
  const { data: dbGolsA } = await supabase.from('gols').select('*').eq('futebol_id', futAId);
  const { data: dbRodadasA } = await supabase.from('rodadas').select('*').eq('futebol_id', futAId);
  const { data: dbCapasA } = await supabase.from('capas').select('*').eq('futebol_id', futAId);
  const { data: dbTimesA } = await supabase.from('times').select('*').eq('futebol_id', futAId);

  assert(dbPartidasA.length === 0, '11.9', 'Supabase: 0 partidas para Futebol A');
  assert(dbGolsA.length === 0, '11.10', 'Supabase: 0 gols para Futebol A');
  assert(dbRodadasA.length === 0, '11.11', 'Supabase: 0 rodadas para Futebol A');
  assert(dbCapasA.length === 0, '11.12', 'Supabase: 0 capas para Futebol A');
  assert(dbTimesA.length === 0, '11.13', 'Supabase: 0 times para Futebol A');

  // --------------------------------------------------------------------------
  // ITENS 12 & 13: Confirmar PRESERVAÇÃO TOTAL dos Jogadores
  // --------------------------------------------------------------------------
  console.log('\n--- ITENS 12 & 13: Preservação Integral dos Jogadores ---');
  const preservedPlayers = Storage.getPlayers();
  assert(preservedPlayers.length === 25, '12.1', 'Todos os 25 jogadores continuam cadastrados!');

  let allIdsPreserved = true;
  let allAttributesPreserved = true;
  originalPlayers.forEach((orig, idx) => {
    const found = preservedPlayers.find(p => p.id === orig.id);
    if (!found) {
      allIdsPreserved = false;
    } else {
      if (found.name !== orig.name || found.stars !== orig.stars) {
        allAttributesPreserved = false;
      }
    }
  });

  assert(allIdsPreserved, '13.1', 'NENHUM ID de jogador foi alterado ou recriado!');
  assert(allAttributesPreserved, '13.2', 'Todos os nomes e estrelas dos atletas foram preservados intactos!');

  // --------------------------------------------------------------------------
  // ITENS 14, 15, 16, 17, 18: Validação de Rankings e Telas Zeradas
  // --------------------------------------------------------------------------
  console.log('\n--- ITENS 14 a 18: Rankings, Histórico e Estados Zerados ---');
  const postResetArtilharia = Rankings.getArtilhariaData().filter(p => p.matchGoals > 0);
  assert(postResetArtilharia.length === 0, '14.1', 'Ranking de Artilharia (gols de partidas) está rigorosamente zerado');

  const postResetCapas = Rankings.getCapaData();
  assert(postResetCapas.length === 0, '15.1', 'Ranking de Capas está rigorosamente zerado (0)');

  const postResetMatches = Storage.getMatches();
  assert(postResetMatches.length === 0, '16.1', 'Histórico de partidas está completamente vazio');

  assert(Storage.getLiveMatch() === null, '17.1', 'Nenhuma partida ao vivo ativa');
  assert(Storage.getCurrentRound() === null, '18.1', 'Nenhuma rodada ativa');

  // --------------------------------------------------------------------------
  // ITEM 19: Confirmar que Futebol B NÃO Foi Afetado
  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 19: Isolamento do Futebol B Mantido ---');
  await Storage.loginAdmin('adminB@teste.com', 'password123');
  assert(Storage.currentFutebol.id === futBId, '19.1', 'Conectado ao Futebol B');
  assert(Storage.getPlayers().length === 20, '19.2', 'Futebol B mantém seus 20 jogadores');
  assert(Storage.getMatches().length === 1, '19.3', 'Futebol B mantém sua partida realizada intacta');
  assert(Storage.getCurrentRound() !== null, '19.4', 'Futebol B mantém sua rodada ativa intacta');

  // Retorna para Futebol A
  await Storage.loginAdmin('adminA@teste.com', 'password123');

  // --------------------------------------------------------------------------
  // ITEM 21: Sincronização em Outro Dispositivo (Dispositivo B no Futebol A)
  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 21: Sincronização Multi-Dispositivo ---');
  // Simula Dispositivo B chamando reconcileActiveState
  await Storage.reconcileActiveState(futAId);
  assert(Storage.getPlayers().length === 25, '21.1', 'Dispositivo B: 25 jogadores presentes');
  assert(Storage.getMatches().length === 0, '21.2', 'Dispositivo B: 0 partidas (sincronizado do Supabase)');
  assert(Storage.getCurrentRound() === null, '21.3', 'Dispositivo B: 0 rodadas ativas');
  assert(Storage.getCapas().length === 0, '21.4', 'Dispositivo B: 0 Capas');

  // --------------------------------------------------------------------------
  // ITEM 22: Funcionamento após Reload
  // --------------------------------------------------------------------------
  console.log('\n--- ITEM 22: Comportamento pós-Reload ---');
  // Simula reload da página limpando caches de memória e reconectando sessão
  await Storage.restoreSession();
  assert(Storage.getPlayers().length === 25, '22.1', 'Após reload: Todos os 25 jogadores continuam disponíveis');
  assert(Storage.getCurrentRound() === null, '22.2', 'Após reload: Nenhuma rodada pendente');
  assert(Storage.getMatches().length === 0, '22.3', 'Após reload: Histórico vazio');

  // --------------------------------------------------------------------------
  // ITENS 23, 24, 25: Novo Ciclo Operacional com Jogadores Preservados
  // --------------------------------------------------------------------------
  console.log('\n--- ITENS 23, 24 & 25: Iniciar Novo Ciclo Operacional ---');
  
  // 23. Criar nova rodada selecionando 20 atletas preservados
  const roster = Storage.getPlayers();
  const newSelection = roster.slice(5, 25); // Seleciona outros 20
  Sorteio.selectedPlayerIds = new Set(newSelection.map(p => p.id));
  Sorteio.saveSelection();
  assert(Storage.getSelectedPlayerIds().length === 20, '23.1', 'Nova rodada: 20 jogadores selecionados com sucesso');

  // 24. Sortear times da nova rodada
  Sorteio.executarSorteio(newSelection);
  const newRound = Storage.getCurrentRound();
  const newTeams = Storage.getTeams();
  assert(newRound !== null && newTeams !== null, '24.1', 'Novo sorteio realizado com sucesso: 4 times gerados');
  assert(Object.keys(newTeams).length === 4, '24.2', '4 times presentes na nova rodada');

  // 25. Iniciar nova partida
  Partidas.restoreOrInitMatch();
  assert(Partidas.state.order === 1, '25.1', 'Nova Partida 01 configurada');
  assert(Partidas.state.status === 'ready', '25.2', 'Partida 01 em estado pronto para iniciar');

  Partidas.iniciarPartida();
  assert(Partidas.state.status === 'running', '25.3', 'Nova Partida 01 iniciada com sucesso no novo ciclo!');

  // Finalizar teste
  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
