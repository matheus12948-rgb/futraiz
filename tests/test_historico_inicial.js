/**
 * BATERIA DE TESTES: MIGRAÇÃO DE DADOS HISTÓRICOS INICIAIS AO FUTRODA
 * 
 * Validação rigorosa dos 20 requisitos definidos pelo usuário:
 * 1. Criar futebol.
 * 2. Cadastrar jogadores.
 * 3. Informar gols históricos.
 * 4. Informar Capas históricas.
 * 5. Salvar.
 * 6. Verificar ranking (artilharia, capas, geral).
 * 7. Finalizar carga histórica.
 * 8. Verificar que os campos ficaram bloqueados.
 * 9. Recarregar página.
 * 10. Verificar que continuam bloqueados.
 * 11. Registrar novo gol.
 * 12. Verificar que o gol foi somado ao histórico.
 * 13. Encerrar uma noite.
 * 14. Conceder Capa.
 * 15. Verificar que a Capa foi somada ao histórico.
 * 16. Criar novo jogador depois do fechamento.
 * 17. Confirmar que ele começa com 0 gols históricos e 0 Capas históricas.
 * 18. Confirmar que cadastrar novo jogador NÃO reabre a carga.
 * 19. Testar usuário público.
 * 20. Testar dois futebol_id diferentes.
 */

import { Storage } from './js/storage.js';
import { Partidas } from './js/partidas.js';
import { Tabela } from './js/tabela.js';
import { Rankings } from './js/rankings.js';
import { Jogadores } from './js/jogadores.js';
import { Configuracoes } from './js/configuracoes.js';
import { Utils } from './js/utils.js';
import { supabase } from './js/supabaseClient.js';

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
    value: '',
    disabled: false,
    style: {},
    dataset,
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    focus: () => {},
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
  getElementById: (id) => {
    if (!domStore[id]) domStore[id] = createMockElement(id);
    return domStore[id];
  },
  querySelector: (sel) => {
    const idMatch = sel.match(/^#([\w-]+)/);
    if (idMatch) {
      const i = idMatch[1];
      if (!domStore[i]) domStore[i] = createMockElement(i);
      return domStore[i];
    }
    return createMockElement('generic');
  },
  querySelectorAll: (sel) => [],
  addEventListener: () => {}
};

global.window = {
  location: { hash: '' },
  addEventListener: () => {},
  Tabela: Tabela,
  Rankings: Rankings,
  Storage: Storage,
  StorageApp: Storage
};
global.globalThis.Tabela = Tabela;

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [Teste ${totalTests}] PASS: ${message}`);
  } else {
    console.error(`  ❌ [Teste ${totalTests}] FAIL: ${message}`);
    throw new Error(`Falha no teste: ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('TESTES DE MIGRAÇÃO DE DADOS HISTÓRICOS INICIAIS AO FUTRODA');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  console.log('--- REQUISITO 1: Criar futebol ---');
  const resFutA = await Storage.createFutebol({
    nome: 'Futebol dos Amigos',
    adminNome: 'Carlos Admin',
    email: 'carlos@amigos.com',
    password: 'senhaSegura123'
  });
  assert(resFutA.success === true, 'Futebol A criado com sucesso');
  const futA = resFutA.futebol;
  assert(Boolean(futA.id), 'Futebol A possui ID');
  assert(futA.historico_inicial_aberto === true, 'Novo futebol começa com historico_inicial_aberto = true');
  assert(Storage.isHistoricoInicialAberto() === true, 'Storage.isHistoricoInicialAberto() retorna true');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 2: Cadastrar jogadores ---');
  const joao = { id: 'ply_joao', name: 'João Silva', stars: 4, gols_historicos_iniciais: 0, capas_historicas_iniciais: 0 };
  const pedro = { id: 'ply_pedro', name: 'Pedro Santos', stars: 3, gols_historicos_iniciais: 0, capas_historicas_iniciais: 0 };
  const carlos = { id: 'ply_carlos', name: 'Carlos Lima', stars: 5, gols_historicos_iniciais: 0, capas_historicas_iniciais: 0 };
  const lucas = { id: 'ply_lucas', name: 'Lucas Rocha', stars: 3, gols_historicos_iniciais: 0, capas_historicas_iniciais: 0 };
  const marcos = { id: 'ply_marcos', name: 'Marcos Souza', stars: 2, gols_historicos_iniciais: 0, capas_historicas_iniciais: 0 };

  await Storage.savePlayers([joao, pedro, carlos, lucas, marcos]);
  const initialPlayers = Storage.getPlayers();
  assert(initialPlayers.length === 5, '5 jogadores cadastrados com sucesso');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITOS 3, 4 e 5: Informar gols e Capas históricas e Salvar ---');
  const updates = [
    { id: 'ply_joao', gols_historicos_iniciais: 12, capas_historicas_iniciais: 3 },
    { id: 'ply_pedro', gols_historicos_iniciais: 8, capas_historicas_iniciais: 1 },
    { id: 'ply_carlos', gols_historicos_iniciais: 15, capas_historicas_iniciais: 5 },
    { id: 'ply_lucas', gols_historicos_iniciais: 0, capas_historicas_iniciais: 0 },
    { id: 'ply_marcos', gols_historicos_iniciais: 4, capas_historicas_iniciais: 0 }
  ];

  const saveRes = await Storage.saveHistoricalData(updates);
  assert(saveRes.success === true, 'Storage.saveHistoricalData executado com sucesso');

  const loadedPlayers = Storage.getPlayers();
  const pJoao = loadedPlayers.find(p => p.id === 'ply_joao');
  const pPedro = loadedPlayers.find(p => p.id === 'ply_pedro');
  const pCarlos = loadedPlayers.find(p => p.id === 'ply_carlos');

  assert(pJoao.gols_historicos_iniciais === 12, 'João possui 12 gols históricos gravados');
  assert(pJoao.capas_historicas_iniciais === 3, 'João possui 3 Capas históricas gravadas');
  assert(pPedro.gols_historicos_iniciais === 8, 'Pedro possui 8 gols históricos gravados');
  assert(pPedro.capas_historicas_iniciais === 1, 'Pedro possui 1 Capa histórica gravada');
  assert(pCarlos.gols_historicos_iniciais === 15, 'Carlos possui 15 gols históricos gravados');
  assert(pCarlos.capas_historicas_iniciais === 5, 'Carlos possui 5 Capas históricas gravadas');

  // Teste de validação: rejeitar números negativos ou não-inteiros
  let caughtNegative = false;
  try {
    await Storage.saveHistoricalData([{ id: 'ply_joao', gols_historicos_iniciais: -5, capas_historicas_iniciais: 1 }]);
  } catch (e) {
    caughtNegative = true;
  }
  assert(caughtNegative === true, 'saveHistoricalData rejeitou valor negativo para gols');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 6: Verificar rankings antes de qualquer partida ---');
  const artilhariaInitial = Rankings.getArtilhariaData();
  assert(artilhariaInitial[0].id === 'ply_carlos' && artilhariaInitial[0].goals === 15, 'Artilharia: Carlos lidera com 15 gols históricos');
  assert(artilhariaInitial[1].id === 'ply_joao' && artilhariaInitial[1].goals === 12, 'Artilharia: João em 2º com 12 gols históricos');
  assert(artilhariaInitial[2].id === 'ply_pedro' && artilhariaInitial[2].goals === 8, 'Artilharia: Pedro em 3º com 8 gols históricos');

  const capasInitial = Rankings.getCapaData();
  assert(capasInitial[0].id === 'ply_carlos' && capasInitial[0].capas === 5, 'Ranking de Capas: Carlos lidera com 5 Capas históricas');
  assert(capasInitial[1].id === 'ply_joao' && capasInitial[1].capas === 3, 'Ranking de Capas: João em 2º com 3 Capas históricas');
  assert(capasInitial[2].id === 'ply_pedro' && capasInitial[2].capas === 1, 'Ranking de Capas: Pedro em 3º com 1 Capa histórica');

  const geralInitial = Rankings.getGeneralData();
  assert(geralInitial[0].id === 'ply_carlos' && geralInitial[0].capas === 5 && geralInitial[0].goals === 15, 'Ranking Geral: Carlos é o líder (5 Capas, 15 Gols)');
  assert(geralInitial[1].id === 'ply_joao' && geralInitial[1].capas === 3 && geralInitial[1].goals === 12, 'Ranking Geral: João em 2º (3 Capas, 12 Gols)');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITOS 7 e 8: Finalizar carga histórica e Bloqueio ---');
  const finalizeRes = await Storage.finalizeHistoricalLoad();
  assert(finalizeRes.success === true, 'Storage.finalizeHistoricalLoad concluído com sucesso');
  assert(Storage.isHistoricoInicialAberto() === false, 'Storage.isHistoricoInicialAberto() agora é rigorosamente false');
  assert(Storage.currentFutebol.historico_inicial_aberto === false, 'currentFutebol.historico_inicial_aberto é false');

  // Testar bloqueio: tentativa de editar após finalizado DEVE falhar
  let caughtBlocked = false;
  try {
    await Storage.saveHistoricalData([{ id: 'ply_joao', gols_historicos_iniciais: 99, capas_historicas_iniciais: 99 }]);
  } catch (err) {
    caughtBlocked = true;
  }
  assert(caughtBlocked === true, 'saveHistoricalData bloqueado com sucesso após fechamento da carga');

  // Testar segurança direta no backend (LocalSupabaseEngine): update de histórico deve ser barrado
  const { error: dbUpdateError } = await supabase
    .from('jogadores')
    .update({ gols_historicos_iniciais: 999 })
    .eq('id', 'ply_joao');
  assert(dbUpdateError !== null, 'Supabase RLS/segurança bloqueou alteração de gols_historicos_iniciais após fechamento');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITOS 9 e 10: Recarregar página e verificar persistência do bloqueio ---');
  // Simula reload reinicializando sessão a partir do storage
  Storage.restoreSession();
  assert(Storage.isHistoricoInicialAberto() === false, 'Após reload, status continua bloqueado (false)');

  const playersAfterReload = Storage.getPlayers();
  const joaoAfterReload = playersAfterReload.find(p => p.id === 'ply_joao');
  assert(joaoAfterReload.gols_historicos_iniciais === 12, 'Após reload, João mantém intactos os 12 gols históricos');
  assert(joaoAfterReload.capas_historicas_iniciais === 3, 'Após reload, João mantém intactas as 3 Capas históricas');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITOS 11 e 12: Registrar novo gol no FutRoda e somar ao histórico ---');
  // Cria uma rodada ativa
  const round1 = {
    id: 'rd_20261004_1',
    numero: 1,
    dateKey: '2026-10-04',
    date: '04/10/2026',
    status: 'ACTIVE',
    teams: {
      time_1: { id: 'time_1', name: 'Time 1', color: '#2563eb', players: [joao] },
      time_2: { id: 'time_2', name: 'Time 2', color: '#dc2626', players: [pedro] },
      time_3: { id: 'time_3', name: 'Time 3', color: '#16a34a', players: [carlos] },
      time_4: { id: 'time_4', name: 'Time 4', color: '#eab308', players: [lucas] }
    }
  };
  Storage.saveCurrentRound(round1);

  // Partida 1: Time 1 (1) x (0) Time 2 — Gol de João!
  const match1 = {
    id: 'mat_01',
    roundId: 'rd_20261004_1',
    dateKey: '2026-10-04',
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 2',
    homeScore: 1,
    awayScore: 0,
    status: 'finalizada',
    goals: [
      { id: 'gol_01', playerId: 'ply_joao', playerName: 'João Silva', teamId: 'time_1', minute: 3 }
    ]
  };
  Storage.addMatch(match1);

  // Partida 2: Time 2 (2) x (0) Time 3 — 2 Gols de Pedro!
  const match2 = {
    id: 'mat_02',
    roundId: 'rd_20261004_1',
    dateKey: '2026-10-04',
    homeTeamId: 'time_2',
    awayTeamId: 'time_3',
    homeTeamName: 'Time 2',
    awayTeamName: 'Time 3',
    homeScore: 2,
    awayScore: 0,
    status: 'finalizada',
    goals: [
      { id: 'gol_02', playerId: 'ply_pedro', playerName: 'Pedro Santos', teamId: 'time_2', minute: 1 },
      { id: 'gol_03', playerId: 'ply_pedro', playerName: 'Pedro Santos', teamId: 'time_2', minute: 5 }
    ]
  };
  Storage.addMatch(match2);

  // Verificação da soma dos gols
  const artilhariaAfterMatches = Rankings.getArtilhariaData();
  const joaoRank = artilhariaAfterMatches.find(p => p.id === 'ply_joao');
  const pedroRank = artilhariaAfterMatches.find(p => p.id === 'ply_pedro');

  assert(joaoRank.historicalGoals === 12, 'João: histórico inicial de gols permanece 12');
  assert(joaoRank.matchGoals === 1, 'João: marcou 1 gol pelo FutRoda');
  assert(joaoRank.goals === 13, 'João: total de gols é rigorosamente 12 + 1 = 13');

  assert(pedroRank.historicalGoals === 8, 'Pedro: histórico inicial de gols permanece 8');
  assert(pedroRank.matchGoals === 2, 'Pedro: marcou 2 gols pelo FutRoda');
  assert(pedroRank.goals === 10, 'Pedro: total de gols é rigorosamente 8 + 2 = 10');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITOS 13, 14 e 15: Encerrar noite, conceder Capa e somar ao histórico ---');
  // Encerrar a noite com Time 1 campeão (onde João jogou)
  Storage.finalizeNight({
    championTeamId: 'time_1',
    championTeamName: 'Time 1',
    capaPlayers: [joao]
  });

  const capasAfterNight = Rankings.getCapaData();
  const joaoCapa = capasAfterNight.find(p => p.id === 'ply_joao');

  assert(joaoCapa.historicalCapas === 3, 'João: histórico inicial de Capas permanece 3');
  assert(joaoCapa.futCapas === 1, 'João: recebeu 1 Capa pelo título da noite no FutRoda');
  assert(joaoCapa.capas === 4, 'João: total de Capas é rigorosamente 3 + 1 = 4');

  // Ranking Geral atualizado
  const geralAfterNight = Rankings.getGeneralData();
  const joaoGeral = geralAfterNight.find(p => p.id === 'ply_joao');
  assert(joaoGeral.goals === 13, 'Ranking Geral: João tem 13 gols (12 hist + 1 novo)');
  assert(joaoGeral.capas === 4, 'Ranking Geral: João tem 4 Capas (3 hist + 1 nova)');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITOS 16, 17 e 18: Novo jogador após fechamento da carga ---');
  const roberto = {
    id: 'ply_roberto',
    name: 'Roberto Novato',
    stars: 3,
    gols_historicos_iniciais: 100, // tenta burlar passando valor alto
    capas_historicas_iniciais: 50
  };

  const currentList = Storage.getPlayers();
  // Quando a carga está fechada, novo jogador deve ser gravado com 0 histórico
  currentList.push(roberto);
  await Storage.savePlayers(currentList);

  const playersWithNovato = Storage.getPlayers();
  const savedNovato = playersWithNovato.find(p => p.id === 'ply_roberto');

  assert(savedNovato !== undefined, 'Roberto cadastrado com sucesso no sistema');
  assert(savedNovato.gols_historicos_iniciais === 0, 'Roberto recebe OBRIGATORIAMENTE 0 gols históricos iniciais');
  assert(savedNovato.capas_historicas_iniciais === 0, 'Roberto recebe OBRIGATORIAMENTE 0 Capas históricas iniciais');
  assert(Storage.isHistoricoInicialAberto() === false, 'Cadastrar novo jogador NÃO reabriu a carga histórica (continua false)');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 19: Usuário público (somente leitura) ---');
  const resPublic = await Storage.loadPublicFutebol(futA.codigo_publico);
  assert(resPublic.success === true, 'Usuário público acessou Futebol A via código');
  assert(Storage.isPublicViewer() === true, 'Papel ativo é PUBLIC_VIEWER');

  // Visualização de rankings funciona para o público
  const publicArtilharia = Rankings.getArtilhariaData();
  const joaoPublicArt = publicArtilharia.find(p => p.id === 'ply_joao');
  assert(joaoPublicArt.goals === 13, 'Público enxerga total correto de 13 gols para João');

  const publicCapas = Rankings.getCapaData();
  const joaoPublicCapa = publicCapas.find(p => p.id === 'ply_joao');
  assert(joaoPublicCapa.capas === 4, 'Público enxerga total correto de 4 Capas para João');

  // Usuário público é impedido de modificar ou finalizar
  let caughtPublicSave = false;
  try {
    await Storage.saveHistoricalData([{ id: 'ply_joao', gols_historicos_iniciais: 5, capas_historicas_iniciais: 2 }]);
  } catch {
    caughtPublicSave = true;
  }
  assert(caughtPublicSave === true, 'Público é impedido de executar saveHistoricalData (assertAdmin)');

  let caughtPublicFinalize = false;
  try {
    await Storage.finalizeHistoricalLoad();
  } catch {
    caughtPublicFinalize = true;
  }
  assert(caughtPublicFinalize === true, 'Público é impedido de executar finalizeHistoricalLoad (assertAdmin)');

  // --------------------------------------------------------------------------
  console.log('\n--- REQUISITO 20: Isolamento entre Futebol A e Futebol B ---');
  const resFutB = await Storage.createFutebol({
    nome: 'Futebol da Firma',
    adminNome: 'Bruna Admin',
    email: 'bruna@firma.com',
    password: 'senhaSegura456'
  });
  assert(resFutB.success === true, 'Futebol B criado com sucesso');
  const futB = resFutB.futebol;

  assert(Storage.isHistoricoInicialAberto() === true, 'Futebol B inicia com sua própria carga histórica aberta (true)');
  const playersB = Storage.getPlayers();
  assert(playersB.length === 0, 'Futebol B não possui jogadores de Futebol A (isolamento total)');

  // Cadastra jogador em B
  const tiago = { id: 'ply_tiago', name: 'Tiago Firma', stars: 4, gols_historicos_iniciais: 0, capas_historicas_iniciais: 0 };
  await Storage.savePlayers([tiago]);
  await Storage.saveHistoricalData([{ id: 'ply_tiago', gols_historicos_iniciais: 20, capas_historicas_iniciais: 7 }]);

  const rankB = Rankings.getArtilhariaData();
  assert(rankB.length === 1 && rankB[0].id === 'ply_tiago' && rankB[0].goals === 20, 'Futebol B possui ranking isolado: Tiago 20 gols');

  // Retorna ao Futebol A via login de admin Carlos
  await Storage.loginAdmin({ email: 'carlos@amigos.com', password: 'senhaSegura123' });
  assert(Storage.currentFutebol.id === futA.id, 'Admin logado novamente no Futebol A');
  assert(Storage.isHistoricoInicialAberto() === false, 'Futebol A continua rigorosamente com carga histórica fechada (false)');

  const playersAReturn = Storage.getPlayers();
  assert(playersAReturn.some(p => p.id === 'ply_joao'), 'Jogadores de Futebol A preservados');
  assert(!playersAReturn.some(p => p.id === 'ply_tiago'), 'Tiago de Futebol B NÃO contamina Futebol A');

  const rankAReturn = Rankings.getArtilhariaData();
  const joaoFinal = rankAReturn.find(p => p.id === 'ply_joao');
  assert(joaoFinal.goals === 13, 'João no Futebol A permanece com 13 gols (12 hist + 1 jogo)');

  // --------------------------------------------------------------------------
  console.log('\n--- VERIFICAÇÃO ADICIONAL: Tabela dos Times Permanece Estritamente por Rodada ---');
  Storage.startNewRound();
  const round2Table = Tabela.calcularTabelaRodada();
  assert(round2Table.length === 4, 'Nova Rodada possui 4 times na tabela');
  assert(round2Table.every(t => t.pts === 0 && t.gp === 0), 'Todos os times começam estritamente com 0 pts e 0 gols na nova rodada (sem interferência do histórico dos jogadores)');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${totalTests} | PASSOU: ${passedTests} | FALHOU: 0`);
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Erro durante a execução dos testes:', err);
  process.exit(1);
});
