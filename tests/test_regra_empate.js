/**
 * TESTE DA REGRA DEFINITIVA DE EMPATE — MODELO "QUEM GANHA FICA"
 * Validação rigorosa dos 10 itens obrigatórios:
 * 1. Partida Time 1 x Time 2 termina 0 x 0 -> Time 1 = +1 ponto, Time 2 = +1 ponto.
 * 2. Confirmar que Time 1 e Time 2 saem de campo.
 * 3. Confirmar que Time 3 e Time 4 entram.
 * 4. Confirmar que a próxima partida é automaticamente Time 3 x Time 4.
 * 5. Não mostrar botões "TIME 1 PERMANECE" ou "TIME 2 PERMANECE".
 * 6. Não permitir que o administrador escolha quem permanece em caso de empate.
 * 7. Depois de Time 3 x Time 4, se Time 3 vencer: Time 3 permanece e Time 4 sai.
 * 8. Confirmar que o administrador pode escolher Time 1 ou Time 2 como próximo adversário.
 * 9. Confirmar que empate NÃO atribui Capa.
 * 10. Confirmar que Capa só é atribuída no ENCERRAR NOITE aos 5 atletas do campeão.
 */

import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Tabela } from '../js/tabela.js';
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
  alert: () => {}
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

async function runTestEmpate() {
  console.log('================================================================');
  console.log('TESTES DEFINITIVOS: REGRA DE EMPATE — QUEM GANHA FICA');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testNum, desc) {
    if (condition) {
      console.log(`  ✅ [Teste ${testNum}] PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [Teste ${testNum}] FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. SETUP DE DADOS
  Storage._store = global.localStorage;
  Storage.init();
  Storage.currentFutebol = { id: 'd0000000-0000-4000-8000-000000000004', nome: 'Fut Tie Test', admin_id: 'admin_123' };
  Storage.userRole = 'ADMIN';

  const mockTeams = {
    time_1: {
      id: 'time_1',
      name: 'Time 1',
      color: '#2563EB',
      players: [
        { id: 'p1_1', name: 'Atleta 1.1', stars: 5, capa: 0 },
        { id: 'p1_2', name: 'Atleta 1.2', stars: 4, capa: 0 },
        { id: 'p1_3', name: 'Atleta 1.3', stars: 3, capa: 0 },
        { id: 'p1_4', name: 'Atleta 1.4', stars: 4, capa: 0 },
        { id: 'p1_5', name: 'Atleta 1.5', stars: 3, capa: 0 }
      ]
    },
    time_2: {
      id: 'time_2',
      name: 'Time 2',
      color: '#DC2626',
      players: [
        { id: 'p2_1', name: 'Atleta 2.1', stars: 4, capa: 0 },
        { id: 'p2_2', name: 'Atleta 2.2', stars: 5, capa: 0 },
        { id: 'p2_3', name: 'Atleta 2.3', stars: 3, capa: 0 },
        { id: 'p2_4', name: 'Atleta 2.4', stars: 3, capa: 0 },
        { id: 'p2_5', name: 'Atleta 2.5', stars: 4, capa: 0 }
      ]
    },
    time_3: {
      id: 'time_3',
      name: 'Time 3',
      color: '#16A34A',
      players: [
        { id: 'p3_1', name: 'Atleta 3.1', stars: 4, capa: 0 },
        { id: 'p3_2', name: 'Atleta 3.2', stars: 3, capa: 0 },
        { id: 'p3_3', name: 'Atleta 3.3', stars: 4, capa: 0 },
        { id: 'p3_4', name: 'Atleta 3.4', stars: 3, capa: 0 },
        { id: 'p3_5', name: 'Atleta 3.5', stars: 3, capa: 0 }
      ]
    },
    time_4: {
      id: 'time_4',
      name: 'Time 4',
      color: '#EAB308',
      players: [
        { id: 'p4_1', name: 'Atleta 4.1', stars: 4, capa: 0 },
        { id: 'p4_2', name: 'Atleta 4.2', stars: 3, capa: 0 },
        { id: 'p4_3', name: 'Atleta 4.3', stars: 4, capa: 0 },
        { id: 'p4_4', name: 'Atleta 4.4', stars: 3, capa: 0 },
        { id: 'p4_5', name: 'Atleta 4.5', stars: 3, capa: 0 }
      ]
    }
  };

  Storage.saveTeams(mockTeams);

  // Cadastra jogadores no Storage para ranking de Capa
  const allPlayers = [
    ...mockTeams.time_1.players,
    ...mockTeams.time_2.players,
    ...mockTeams.time_3.players,
    ...mockTeams.time_4.players
  ];
  Storage.savePlayers(allPlayers);

  // Rodada
  const round = {
    id: 'round_tie_1',
    date: Utils.formatDate(new Date()),
    dateKey: Utils.getDateKey(new Date()),
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  };
  Storage.saveCurrentRound(round);

  Partidas.init();

  // --- ITEM 1: Partida Time 1 x Time 2 termina 0 x 0 (+1 ponto para cada) ---
  console.log('--- TESTE 1: Partida 01 (Time 1 x Time 2) termina 0 x 0 ---');
  Partidas.startOrResumeMatch();
  Partidas.state.homeScore = 0;
  Partidas.state.awayScore = 0;
  Partidas.finalizarPartida();

  const matchesP1 = Storage.getMatches();
  const tabelaP1 = Tabela.calcularTabela(matchesP1);
  const t1 = tabelaP1.find(t => t.id === 'time_1');
  const t2 = tabelaP1.find(t => t.id === 'time_2');

  assert(matchesP1.length === 1 && matchesP1[0].isTie === true, '1.1', 'Partida 01 gravada como empate');
  assert(t1.pts === 1 && t1.e === 1, '1.2', 'Time 1 recebeu exatamente +1 ponto na tabela (pts = 1, e = 1)');
  assert(t2.pts === 1 && t2.e === 1, '1.3', 'Time 2 recebeu exatamente +1 ponto na tabela (pts = 1, e = 1)');

  // --- ITEM 2: Confirmar que Time 1 e Time 2 saem de campo ---
  console.log('\n--- TESTE 2: Confirmar que Time 1 e Time 2 saem de campo ---');
  assert(Partidas.state.winnerTeamId === null, '2.1', 'Nenhum dos dois times foi mantido como vencedor em campo (winnerTeamId = null)');
  assert(Partidas.state.tiePendingResolution === false, '2.2', 'Não há pendência de escolha de vencedor pelo administrador (tiePendingResolution = false)');
  assert(Partidas.state.waitingTieNextMatch === true, '2.3', 'Sistema entra no estado waitingTieNextMatch');

  // --- ITEM 3 & 4: Confirmar que Time 3 e Time 4 entram e próxima partida é Time 3 x Time 4 ---
  console.log('\n--- TESTES 3 & 4: Confirmar que Time 3 e Time 4 entram automaticamente ---');
  assert(Partidas.state.tieNextMatch !== null, '3.1', 'Próximo confronto de empate foi gerado');
  assert(
    (Partidas.state.tieNextMatch.homeTeamId === 'time_3' && Partidas.state.tieNextMatch.awayTeamId === 'time_4') ||
    (Partidas.state.tieNextMatch.homeTeamId === 'time_4' && Partidas.state.tieNextMatch.awayTeamId === 'time_3'),
    '4.1',
    `Próxima partida configurada automaticamente entre os 2 de fora: ${Partidas.state.tieNextMatch.homeTeamName} × ${Partidas.state.tieNextMatch.awayTeamName}`
  );
  assert(Partidas.state.order === 2, '4.2', 'Ordem da próxima partida avançou automaticamente para 2');
  assert(Partidas.state.status === 'ready', '4.3', 'Status da próxima partida é SCHEDULED (ready)');
  assert(Partidas.state.homeScore === 0 && Partidas.state.awayScore === 0, '4.4', 'Placar da próxima partida é rigorosamente 0 × 0');
  assert(Partidas.state.startedAt === null, '4.5', 'startedAt é null (sem started_at)');
  assert(Partidas.state.isActive === false, '4.6', 'isActive é false (sem cronômetro rodando)');
  assert(Partidas.state.winnerTeamId === null && Partidas.state.loserTeamId === null, '4.7', 'Sem vencedor ou perdedor na próxima partida');
  assert(Partidas.state.waitingNextOpponent === false, '4.8', 'Sem escolha manual de adversário');

  // --- ITEM 5: Não mostrar botões "TIME 1 PERMANECE" ou "TIME 2 PERMANECE" e Avanço da Tela ---
  console.log('\n--- TESTE 5: Validação da Tela/Banner pós-empate (sem botões de permanência) ---');
  const bannerEl = domStore['match-quem-ganha-fica-banner'];
  assert(!!bannerEl, '5.1', 'Banner Quem Ganha Fica existe');
  assert(!bannerEl.innerHTML.includes('PERMANECE EM CAMPO') || !bannerEl.innerHTML.includes('DEFINIR QUEM PERMANECE'), '5.2', 'Título "DEFINIR QUEM PERMANECE EM CAMPO" foi completamente removido');
  assert(!bannerEl.innerHTML.includes('btn-choice-tie-winner'), '5.3', 'Nenhum botão de classe btn-choice-tie-winner existe');
  assert(!bannerEl.innerHTML.includes('TIME 1 PERMANECE') && !bannerEl.innerHTML.includes('TIME 2 PERMANECE'), '5.4', 'Nenhum botão "TIME 1 PERMANECE" ou "TIME 2 PERMANECE" é exibido');

  // Verifica elementos obrigatórios da tela após empate
  assert(bannerEl.innerHTML.includes('PARTIDA FINALIZADA EM EMPATE'), '5.5', 'Banner contém "PARTIDA FINALIZADA EM EMPATE"');
  assert(bannerEl.innerHTML.includes('+1 PONTO PARA CADA TIME'), '5.6', 'Banner contém "+1 PONTO PARA CADA TIME"');
  assert(bannerEl.innerHTML.includes('SAI DE CAMPO'), '5.7', 'Banner indica saída dos dois times');
  assert(bannerEl.innerHTML.includes('OS TIMES DE FORA ENTRAM:'), '5.8', 'Banner contém "OS TIMES DE FORA ENTRAM:"');
  assert(bannerEl.innerHTML.includes('btn-start-tie-next-match'), '5.9', 'Banner contém botão com id btn-start-tie-next-match ([ INICIAR PARTIDA ])');

  // Avanço da Tela do Scoreboard
  assert(domStore['scoreboard-home-name'].textContent === 'Time 3', '5.10', 'Scoreboard avançou mandante para Time 3');
  assert(domStore['scoreboard-away-name'].textContent === 'Time 4', '5.11', 'Scoreboard avançou visitante para Time 4');
  assert(String(domStore['scoreboard-home-score'].textContent) === '0' && String(domStore['scoreboard-away-score'].textContent) === '0', '5.12', 'Scoreboard exibe placar zerado (0 × 0)');
  assert(domStore['match-live-badge'].textContent.includes('PARTIDA 02'), '5.13', 'Badge superior exibe PARTIDA 02');
  assert(domStore['btn-timer-start'].style.display !== 'none', '5.14', 'Botão INICIAR está visível para o administrador');

  // Persistência em partida_ao_vivo
  const liveMatchSaved = Storage.getLiveMatch();
  assert(liveMatchSaved.homeTeamId === 'time_3' && liveMatchSaved.awayTeamId === 'time_4', '5.15', 'partida_ao_vivo salva com os times Time 3 x Time 4');
  assert(liveMatchSaved.status === 'ready' && liveMatchSaved.order === 2, '5.16', 'partida_ao_vivo salva com status ready e ordem 2');

  // Recarregar a página (F5) mantém a próxima partida preparada
  Partidas.init();
  assert(Partidas.state.order === 2 && Partidas.state.homeTeamId === 'time_3' && Partidas.state.status === 'ready', '5.17', 'Reload preserva a próxima partida preparada (Time 3 x Time 4, ready)');

  // Proteção contra duplicação de partidas
  Partidas.criarProximaPartidaAposEmpate(false);
  assert(Partidas.state.order === 2, '5.18', 'Chamada redundante não duplica próxima partida (mantém ordem 2)');

  // --- ITEM 6: Não permitir que o administrador escolha quem permanece ---
  console.log('\n--- TESTE 6: Bloqueio de escolha artificial de vencedor no empate ---');
  Partidas.resolverEmpate('time_1');
  assert(Partidas.state.winnerTeamId === null, '6.1', 'Chamada legada a resolverEmpate é neutralizada e não altera winnerTeamId (continua null)');
  assert(Partidas.state.waitingTieNextMatch === true, '6.2', 'Sistema mantém o fluxo automático de empate');

  // --- INICIAR PARTIDA 02 (Time 3 x Time 4) ---
  console.log('\n--- TRANSIÇÃO: Iniciar Partida 02 (Time 3 x Time 4) ---');
  Partidas.iniciarProximaPartidaAposEmpate();
  assert(Partidas.state.order === 2, 'T.1', 'Partida 02 criada');
  assert(
    (Partidas.state.homeTeamId === 'time_3' && Partidas.state.awayTeamId === 'time_4') ||
    (Partidas.state.homeTeamId === 'time_4' && Partidas.state.awayTeamId === 'time_3'),
    'T.2',
    `Em campo na Partida 02: ${Partidas.state.homeTeamName} × ${Partidas.state.awayTeamName}`
  );
  assert(Partidas.state.status === 'running', 'T.3', 'Partida 02 iniciada com sucesso (status = running)');

  // --- ITEM 7: Depois de Time 3 x Time 4, se Time 3 vencer: Time 3 permanece e Time 4 sai ---
  console.log('\n--- TESTE 7: Time 3 vence Time 4 (3 x 1) -> Time 3 permanece, Time 4 sai ---');
  if (Partidas.state.homeTeamId === 'time_3') {
    Partidas.state.homeScore = 3;
    Partidas.state.awayScore = 1;
  } else {
    Partidas.state.homeScore = 1;
    Partidas.state.awayScore = 3;
  }
  Partidas.finalizarPartida();

  assert(Partidas.state.winnerTeamId === 'time_3', '7.1', 'Time 3 registrado como vencedor e permanece em campo');
  assert(Partidas.state.loserTeamId === 'time_4', '7.2', 'Time 4 registrado como perdedor e sai de campo');
  assert(Partidas.state.waitingNextOpponent === true, '7.3', 'Sistema aguarda escolha do próximo adversário pelo administrador');

  // --- ITEM 8: Confirmar que o administrador pode escolher Time 1 ou Time 2 como próximo adversário ---
  console.log('\n--- TESTE 8: Times fora são Time 1 e Time 2 (Admin escolhe um deles) ---');
  // Re-renderiza banner para inspecionar opções oferecidas
  Partidas.renderQuemGanhaFicaBanner();
  const bannerVictory = domStore['match-quem-ganha-fica-banner'];
  assert(bannerVictory.innerHTML.includes('data-team="time_1"'), '8.1', 'Opção Time 1 oferecida ao administrador');
  assert(bannerVictory.innerHTML.includes('data-team="time_2"'), '8.2', 'Opção Time 2 oferecida ao administrador');
  assert(!bannerVictory.innerHTML.includes('data-team="time_4"'), '8.3', 'Time 4 (que acabou de sair) não é oferecido imediatamente como próximo adversário');

  // Administrador escolhe Time 1
  Partidas.selecionarProximoAdversario('time_1');
  assert(Partidas.state.order === 3, '8.4', 'Partida 03 criada com sucesso');
  assert(Partidas.state.homeTeamId === 'time_3' && Partidas.state.awayTeamId === 'time_1', '8.5', 'Partida 03 é Time 3 (permanece) × Time 1 (escolhido)');

  // --- ITEM 8.B: Empate em partida posterior (Partida 03: Time 3 x Time 1 termina 1 x 1) ---
  console.log('\n--- TESTE 8.B: Empate em Partida Posterior (Time 3 x Time 1 termina 1 x 1) ---');
  Partidas.startOrResumeMatch();
  Partidas.state.homeScore = 1;
  Partidas.state.awayScore = 1;
  Partidas.finalizarPartida();

  assert(Partidas.state.order === 4, '8.6', 'Partida 04 preparada automaticamente após o empate da Partida 03');
  assert(
    (Partidas.state.homeTeamId === 'time_2' && Partidas.state.awayTeamId === 'time_4') ||
    (Partidas.state.homeTeamId === 'time_4' && Partidas.state.awayTeamId === 'time_2'),
    '8.7',
    `Próxima partida configurada automaticamente entre os 2 que estavam fora (Time 2 e Time 4): ${Partidas.state.homeTeamName} × ${Partidas.state.awayTeamName}`
  );
  assert(Partidas.state.status === 'ready', '8.8', 'Partida 04 criada em status ready (SCHEDULED)');
  assert(Partidas.state.homeScore === 0 && Partidas.state.awayScore === 0, '8.9', 'Partida 04 inicia 0 × 0');
  assert(String(domStore['scoreboard-home-score'].textContent) === '0' && String(domStore['scoreboard-away-score'].textContent) === '0', '8.10', 'Scoreboard da Partida 04 exibe 0 × 0');

  // Inicia Partida 04: Time 2 vence Time 4 (1 x 0)
  Partidas.startOrResumeMatch();
  if (Partidas.state.homeTeamId === 'time_2') {
    Partidas.state.homeScore = 1;
    Partidas.state.awayScore = 0;
  } else {
    Partidas.state.homeScore = 0;
    Partidas.state.awayScore = 1;
  }
  Partidas.finalizarPartida();

  // --- ITEM 9: Confirmar que empate NÃO atribui Capa ---
  console.log('\n--- TESTE 9: Confirmar que empate não atribui Capa ---');
  const capasDuringNight = Storage.getCapas();
  assert(capasDuringNight.length === 0, '9.1', `Nenhuma Capa foi concedida durante a noite (total de Capas: ${capasDuringNight.length})`);

  // --- ITEM 10: Confirmar que Capa só é atribuída no ENCERRAR NOITE ---
  console.log('\n--- TESTE 10: Confirmar atribuição de Capa SOMENTE no ENCERRAR NOITE ---');
  // Tabela antes do encerramento
  const matchesTotal = Storage.getMatches();
  const tabelaFinal = Tabela.calcularTabela(matchesTotal);
  console.log('  ℹ️ Tabela Final da Noite:');
  tabelaFinal.forEach((t, i) => console.log(`     ${i + 1}º ${t.name}: ${t.pts} pts (${t.v}V, ${t.e}E, ${t.d}D, SG: ${t.sg})`));

  assert(tabelaFinal[0].id === 'time_3', '10.1', 'Time 3 é o campeão da noite na tabela');

  // Encerra a noite
  const champ = mockTeams.time_3;
  Partidas.executarEncerramentoNoite('time_3', champ.name, champ.players);

  const finalCapas = Storage.getCapas();
  const time3PlayerIds = mockTeams.time_3.players.map(p => p.id);
  const time3Capas = finalCapas.filter(c => time3PlayerIds.includes(c.jogador_id));
  const otherCapas = finalCapas.filter(c => !time3PlayerIds.includes(c.jogador_id));

  assert(finalCapas.length === 5, '10.2', 'Exatamente 5 Capas concedidas no encerramento da noite');
  assert(time3Capas.length === 5, '10.3', 'Todas as 5 Capas foram concedidas aos 5 atletas do Time 3 (campeão)');
  assert(otherCapas.length === 0, '10.4', 'Todos os atletas dos demais times permaneceram com 0 Capas');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestEmpate().catch(err => {
  console.error('Erro na execução dos testes de empate:', err);
  process.exit(1);
});
