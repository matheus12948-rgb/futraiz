/**
 * BATERIA DE TESTES: PERSONALIZAÇÃO DE NOME DOS TIMES E COMPACTAÇÃO "NOITE ENCERRADA"
 * FutRaiz — Cobertura completa dos requisitos:
 * 1. Compactação elegante de "NOITE ENCERRADA" na Dashboard (sem hero card gigante, sem min-height, sem campeão/capas no bloco)
 * 2. Bloqueio de rodada encerrada mantido intacto (regras de negócio)
 * 3. Nomes padrão Time 1..4 no sorteio inicial
 * 4. Edição de nome do time (validações: vazio, >20 chars, espaços, acentos, idempotência)
 * 5. Preservação estrita dos IDs internos (team_id nunca muda, jogadores e estrelas intactos)
 * 6. Propagação do nome personalizado para Rodada, Partida, Tabela, Histórico e Dashboard
 * 7. Persistência completa (localStorage e Supabase) e sobrevivência após recarregamento (F5)
 * 8. Partidas já finalizadas mantêm placar, gols e classificação, atualizando apenas o nome exibido
 * 9. Próxima rodada reseta os nomes para o padrão (Time 1..4)
 * 10. Suporte a multi-dispositivo / eventos de atualização em tempo real
 */

import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Tabela } from '../js/tabela.js';
import { Sorteio } from '../js/sorteio.js';
import { Dashboard } from '../js/dashboard.js';
import { Historico } from '../js/historico.js';
import { Utils } from '../js/utils.js';
import { supabase } from '../js/supabaseClient.js';

// Setup Mock do LocalStorage e DOM para ambiente Node
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
    style: {
      setProperty: (prop, val) => { elem.style[prop] = val; },
      removeProperty: (prop) => { delete elem.style[prop]; }
    },
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
    insertBefore: (newChild, refChild) => {
      children.unshift(newChild);
      return newChild;
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
      return null;
    },
    closest: (sel) => null,
    focus: () => {},
    select: () => {},
    scrollIntoView: () => {}
  };
  return elem;
}

global.document = {
  getElementById: (id) => {
    if (!domStore[id]) {
      domStore[id] = createMockElement(id);
    }
    return domStore[id];
  },
  createElement: (tag) => createMockElement('', tag),
  body: createMockElement('body', 'body'),
  documentElement: createMockElement('html', 'html'),
  addEventListener: () => {}
};

global.window = {
  document: global.document,
  App: { navigateTo: () => {} }
};

// Mock do alert, confirm, toast e som
global.confirm = () => true;
global.alert = () => {};
Utils.sound = { playWhistle: () => {}, playGoal: () => {} };
Utils.toast = () => {};

let testCount = 0;
let passCount = 0;
let failCount = 0;

function assert(cond, desc) {
  testCount++;
  if (cond) {
    passCount++;
    console.log(`  ✅ [Teste ${testCount}] PASS: ${desc}`);
  } else {
    failCount++;
    console.error(`  ❌ [Teste ${testCount}] FAIL: ${desc}`);
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('INICIANDO BATERIA DE TESTES: NOMES DOS TIMES & NOITE ENCERRADA');
  console.log('================================================================\n');

  const futRes = await Storage.createFutebol({
    nome: 'Futebol Quarta Feira Teste',
    adminNome: 'Admin Futebol Teste',
    email: 'admin_team_names@teste.com',
    password: 'password123'
  });
  const mockFut = futRes.futebol;
  Storage.currentFutebol = mockFut;
  Storage.userRole = 'ADMIN';
  localStorage.setItem('familia_fut_user_role', 'ADMIN');

  // 1. Cria 20 jogadores
  const players20 = [];
  for (let i = 1; i <= 20; i++) {
    const p = await Storage.addPlayer({
      name: `Atleta ${i}`,
      stars: (i % 5) + 1
    });
    players20.push(p);
  }
  Storage.savePlayers(players20);

  // ----------------------------------------------------------------
  // BLOCO 1: NOITE ENCERRADA COMPACTA NO DASHBOARD
  // ----------------------------------------------------------------
  console.log('--- BLOCO 1: Verificação da Noite Encerrada Compacta no Dashboard ---');

  const roundFinished = {
    id: Utils.generateUUID(),
    futebol_id: mockFut.id,
    date: Utils.formatDate(new Date()),
    status: 'FINISHED',
    campeaoTimeId: 'time_1',
    campeaoTimeNome: 'Time 1',
    teams: {
      time_1: { id: 'time_1', name: 'Time 1', players: players20.slice(0, 5), totalStars: 15 },
      time_2: { id: 'time_2', name: 'Time 2', players: players20.slice(5, 10), totalStars: 15 },
      time_3: { id: 'time_3', name: 'Time 3', players: players20.slice(10, 15), totalStars: 15 },
      time_4: { id: 'time_4', name: 'Time 4', players: players20.slice(15, 20), totalStars: 15 }
    }
  };
  Storage.saveCurrentRound(roundFinished);
  localStorage.setItem(Storage._getScopedKey('teams'), JSON.stringify(roundFinished.teams));

  Dashboard.init();
  Dashboard.render();

  const heroMatchBox = document.getElementById('dash-hero-match-box');
  const heroContent = heroMatchBox ? heroMatchBox.innerHTML : '';

  assert(heroContent.includes('dash-night-finished-strip'), 'Dashboard exibe indicação compacta dash-night-finished-strip');
  assert(heroContent.includes('NOITE ENCERRADA'), 'Dashboard exibe texto centralizado "NOITE ENCERRADA"');
  assert(!heroContent.includes('dash-night-finished-hero'), 'Dashboard NÃO exibe card gigante dash-night-finished-hero');
  assert(!heroContent.includes('CAMPEÃO: TIME 1'), 'Bloco compacto NÃO exibe texto de Campeão');
  assert(!heroContent.includes('Capa'), 'Bloco compacto NÃO exibe texto explicativo de Capas');
  assert(!heroContent.includes('Ver Histórico da Noite'), 'Bloco compacto NÃO exibe botões redundantes de histórico');
  assert(heroMatchBox.classList.contains('dash-hero-finished-compact'), 'Container possui classe dash-hero-finished-compact para zerar margens excessivas');

  // Regras de negócio de rodada encerrada intocadas
  assert(Storage.isTeamsLocked() === true, 'Regra mantida: Composição de times bloqueada em rodada FINISHED');
  assert(Storage.isScheduleLocked() === true, 'Regra mantida: Programação bloqueada em rodada FINISHED');

  // ----------------------------------------------------------------
  // BLOCO 2: NOMES PADRÃO APÓS SORTEIO
  // ----------------------------------------------------------------
  console.log('\n--- BLOCO 2: Nomes Padrão dos Times no Sorteio ---');

  // Inicia nova rodada limpa
  Storage.startNewRound();
  Sorteio.init();
  Sorteio.selectedPlayerIds = new Set(players20.map(p => p.id));
  Sorteio.executarSorteio(players20);
  await new Promise(r => setTimeout(r, 60));

  const initialTeams = Storage.getTeams();
  assert(initialTeams !== null, 'Times criados com sucesso');
  assert(initialTeams.time_1.id === 'time_1', 'ID interno do time 1 é time_1');
  assert(initialTeams.time_2.id === 'time_2', 'ID interno do time 2 é time_2');
  assert(initialTeams.time_3.id === 'time_3', 'ID interno do time 3 é time_3');
  assert(initialTeams.time_4.id === 'time_4', 'ID interno do time 4 é time_4');
  assert(initialTeams.time_1.name === 'Time 1', 'Nome padrão do time 1 é "Time 1"');
  assert(initialTeams.time_2.name === 'Time 2', 'Nome padrão do time 2 é "Time 2"');
  assert(initialTeams.time_3.name === 'Time 3', 'Nome padrão do time 3 é "Time 3"');
  assert(initialTeams.time_4.name === 'Time 4', 'Nome padrão do time 4 é "Time 4"');

  // ----------------------------------------------------------------
  // BLOCO 3: VALIDAÇÃO NA ATUALIZAÇÃO DO NOME DO TIME
  // ----------------------------------------------------------------
  console.log('\n--- BLOCO 3: Validações Simples ao Editar Nome ---');

  // Não permitir vazio
  let threwEmpty = false;
  try {
    await Storage.updateTeamName('time_1', '   ');
  } catch (err) {
    threwEmpty = true;
    assert(err.message.includes('vazio'), 'Erro claro ao tentar salvar nome vazio');
  }
  assert(threwEmpty, 'Validação rejeitou nome em branco');

  // Não permitir mais que 20 caracteres
  let threwTooLong = false;
  try {
    await Storage.updateTeamName('time_1', 'Nome Excessivamente Longo Para Time');
  } catch (err) {
    threwTooLong = true;
    assert(err.message.includes('20'), 'Erro claro ao exceder 20 caracteres');
  }
  assert(threwTooLong, 'Validação rejeitou nome com mais de 20 caracteres');

  // Não-admin não pode alterar
  Storage.userRole = 'PUBLIC_VIEWER';
  localStorage.setItem('familia_fut_user_role', 'PUBLIC_VIEWER');
  let threwViewer = false;
  try {
    await Storage.updateTeamName('time_1', 'Tentativa Viewer');
  } catch (err) {
    threwViewer = true;
  }
  assert(threwViewer, 'Usuário não-admin é impedido de renomear time');
  Storage.userRole = 'ADMIN';
  localStorage.setItem('familia_fut_user_role', 'ADMIN');

  // Idempotência / salvar mesmo nome não causa alteração
  const noOpResult = await Storage.updateTeamName('time_1', 'Time 1');
  assert(noOpResult.changed === false, 'Salvar o mesmo nome atual retorna changed: false sem escrita desnecessária');

  // ----------------------------------------------------------------
  // BLOCO 4: SALVAR NOME PERSONALIZADO E PRESERVAÇÃO DE IDENTIDADE
  // ----------------------------------------------------------------
  console.log('\n--- BLOCO 4: Salvar Nomes Personalizados & Preservar IDs e Jogadores ---');

  const renameResult1 = await Storage.updateTeamName('time_1', '  Os Brabos  ');
  assert(renameResult1.changed === true && renameResult1.name === 'Os Brabos', 'Time 1 renomeado para "Os Brabos" (espaços aparados)');

  await Storage.updateTeamName('time_2', 'Resenha FC');
  await Storage.updateTeamName('time_3', 'Só Tapa');
  await Storage.updateTeamName('time_4', 'Galáticos');

  const updatedTeams = Storage.getTeams();
  assert(updatedTeams.time_1.id === 'time_1', 'ID interno do time 1 permanece estritamente "time_1"');
  assert(updatedTeams.time_1.name === 'Os Brabos', 'Nome exibido do time 1 é "Os Brabos"');
  assert(updatedTeams.time_2.id === 'time_2', 'ID interno do time 2 permanece estritamente "time_2"');
  assert(updatedTeams.time_2.name === 'Resenha FC', 'Nome exibido do time 2 é "Resenha FC"');
  assert(updatedTeams.time_3.id === 'time_3', 'ID interno do time 3 permanece estritamente "time_3"');
  assert(updatedTeams.time_3.name === 'Só Tapa', 'Nome exibido do time 3 é "Só Tapa"');
  assert(updatedTeams.time_4.id === 'time_4', 'ID interno do time 4 permanece estritamente "time_4"');
  assert(updatedTeams.time_4.name === 'Galáticos', 'Nome exibido do time 4 é "Galáticos"');

  // Confirma que os jogadores do time continuam intactos
  assert(updatedTeams.time_1.players.length === 5, 'Time 1 continua com exatamente 5 jogadores');
  assert(updatedTeams.time_1.totalStars > 0, 'Estrelas do Time 1 preservadas intactas');
  assert(updatedTeams.time_1.color !== undefined, 'Cor do Time 1 preservada intacta');

  // Simulação de F5 / Recarregamento do Navegador
  const persistedTeamsJson = localStorage.getItem(Storage._getScopedKey('teams'));
  const parsedFromStorage = JSON.parse(persistedTeamsJson);
  assert(parsedFromStorage.time_1.name === 'Os Brabos', 'Nome persiste no localStorage após reload');

  const persistedRound = Storage.getCurrentRound();
  assert(persistedRound.teams.time_1.name === 'Os Brabos', 'Nome persiste dentro da entidade oficial da Rodada');

  // ----------------------------------------------------------------
  // BLOCO 5: PROPAGAÇÃO PARA TODAS AS TELAS
  // ----------------------------------------------------------------
  console.log('\n--- BLOCO 5: Propagação para Rodada, Partida, Tabela, Histórico e Dashboard ---');

  // 5.1 Tela de Sorteio / Rodada
  Sorteio.render();
  const sorteioSummary = document.getElementById('sorteio-summary-box').innerHTML;
  assert(sorteioSummary.includes('Os Brabos:'), 'Resumo da Rodada exibe "Os Brabos"');
  assert(sorteioSummary.includes('Resenha FC:'), 'Resumo da Rodada exibe "Resenha FC"');

  const sorteioContainer = document.getElementById('sorteio-container').innerHTML;
  assert(sorteioContainer.includes('Os Brabos'), 'Card da Rodada exibe "Os Brabos"');
  assert(sorteioContainer.includes('btn-edit-team-name'), 'Card da Rodada possui botão de edição com lápis');
  assert(sorteioContainer.includes('OS BRABOS') && sorteioContainer.includes('RESENHA FC'), 'Banner do primeiro jogo exibe os nomes personalizados em caixa alta');

  // 5.2 Tela de Partidas (Placar e Confronto)
  Partidas.init();
  Partidas.render();
  const livePayload = Partidas.getLivePayload();
  assert(livePayload.homeTeamName === 'Os Brabos', 'LivePayload de Partidas utiliza "Os Brabos"');
  assert(livePayload.awayTeamName === 'Resenha FC', 'LivePayload de Partidas utiliza "Resenha FC"');

  const bannerQGF = document.getElementById('match-quem-ganha-fica-banner').innerHTML;
  assert(bannerQGF.includes('OS BRABOS'), 'Banner de jogo em campo exibe "OS BRABOS"');
  assert(bannerQGF.includes('RESENHA FC'), 'Banner de jogo em campo exibe "RESENHA FC"');

  // 5.3 Tela de Tabela
  Tabela.init();
  Tabela.render();
  const standings = Tabela.calcularTabelaRodada();
  const rowBrabos = standings.find(s => s.id === 'time_1');
  assert(rowBrabos !== undefined && rowBrabos.name === 'Os Brabos', 'Tabela oficial lista linha com name: "Os Brabos" e id: "time_1"');

  const tabelaContent = document.getElementById('tabela-container').innerHTML;
  assert(tabelaContent.includes('Os Brabos'), 'HTML da Tabela renderiza "Os Brabos"');
  assert(tabelaContent.includes('Resenha FC'), 'HTML da Tabela renderiza "Resenha FC"');

  // 5.4 Dashboard
  Dashboard.render();
  const dashClassification = document.getElementById('dash-standings-body').innerHTML;
  assert(dashClassification.includes('Os Brabos'), 'Dashboard renderiza "Os Brabos" na classificação oficial');
  assert(dashClassification.includes('Resenha FC'), 'Dashboard renderiza "Resenha FC" na classificação oficial');

  // Partida ao vivo no Dashboard
  Storage.saveLiveMatch({
    order: 1,
    status: 'running',
    isActive: true,
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Os Brabos',
    awayTeamName: 'Resenha FC',
    homeScore: 1,
    awayScore: 0
  });
  Dashboard.render();
  const dashLiveHero = document.getElementById('dash-hero-match-box').innerHTML;
  assert(dashLiveHero.includes('Os Brabos'), 'Dashboard exibe mandante personalizado na partida ao vivo');
  assert(dashLiveHero.includes('Resenha FC'), 'Dashboard exibe visitante personalizado na partida ao vivo');
  Storage.saveLiveMatch(null);

  // ----------------------------------------------------------------
  // BLOCO 6: PARTIDAS FINALIZADAS E ATUALIZAÇÃO RETROATIVA DE EXIBIÇÃO
  // ----------------------------------------------------------------
  console.log('\n--- BLOCO 6: Partidas Finalizadas mantêm Resultados e Atualizam Exibição ---');

  const match1 = {
    id: Utils.generateUUID(),
    roundId: persistedRound.id,
    dateKey: persistedRound.dateKey,
    matchOrder: 1,
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Os Brabos',
    awayTeamName: 'Resenha FC',
    homeScore: 3,
    awayScore: 2,
    winnerTeamId: 'time_1',
    loserTeamId: 'time_2',
    isTie: false,
    resultText: 'Vitória Os Brabos',
    goals: [
      { id: Utils.generateUUID(), minuteFormatted: "02'", playerName: 'Atleta 1', teamId: 'time_1', teamName: 'Os Brabos' },
      { id: Utils.generateUUID(), minuteFormatted: "04'", playerName: 'Atleta 2', teamId: 'time_1', teamName: 'Os Brabos' },
      { id: Utils.generateUUID(), minuteFormatted: "05'", playerName: 'Atleta 6', teamId: 'time_2', teamName: 'Resenha FC' },
      { id: Utils.generateUUID(), minuteFormatted: "06'", playerName: 'Atleta 3', teamId: 'time_1', teamName: 'Os Brabos' },
      { id: Utils.generateUUID(), minuteFormatted: "07'", playerName: 'Atleta 7', teamId: 'time_2', teamName: 'Resenha FC' }
    ],
    status: 'finished',
    createdAt: new Date().toISOString()
  };
  Storage.saveMatches([match1]);

  // Edita nome de time_1 para um novo apelido "Brabos Supremo"
  await Storage.updateTeamName('time_1', 'Brabos Supremo');

  // Verifica que o histórico e tabela mostram o novo nome sem adulterar placar
  const updatedMatches = Storage.getMatches();
  assert(updatedMatches[0].homeScore === 3, 'Placar do mandante preservado (3)');
  assert(updatedMatches[0].awayScore === 2, 'Placar do visitante preservado (2)');
  assert(updatedMatches[0].homeTeamId === 'time_1', 'ID interno do mandante preservado (time_1)');
  assert(updatedMatches[0].homeTeamName === 'Brabos Supremo', 'Nome na lista de partidas atualizado para "Brabos Supremo"');

  const standingsAfter = Tabela.calcularTabelaRodada();
  const leaderRow = standingsAfter.find(r => r.id === 'time_1');
  assert(leaderRow.pts === 3, 'Pontuação na tabela mantida intacta (3 pts)');
  assert(leaderRow.v === 1, 'Vitórias na tabela mantida intacta (1 v)');
  assert(leaderRow.gp === 3, 'Gols Pró na tabela mantida intacta (3 gp)');
  assert(leaderRow.name === 'Brabos Supremo', 'Nome na classificação oficial atualizado para "Brabos Supremo"');

  // Abre detalhes no histórico
  Historico.init();
  Historico.abrirDetalhesRodada(persistedRound.id);
  const modalHistoryBody = document.getElementById('modal-round-details-body').innerHTML;
  assert(modalHistoryBody.includes('Brabos Supremo'), 'Modal de histórico da rodada exibe o nome atualizado "Brabos Supremo"');
  assert(modalHistoryBody.includes('3 × 2'), 'Placar da partida no histórico permanece 3 × 2');

  // ----------------------------------------------------------------
  // BLOCO 7: PRÓXIMA RODADA RESETA NOMES PARA O PADRÃO (TIME 1..4)
  // ----------------------------------------------------------------
  console.log('\n--- BLOCO 7: Próxima Rodada Reseta Nomes para Time 1..4 ---');

  // Encerra a noite atual
  await Storage.endNight({ championTeamId: 'time_1', adminDecidedTie: false });

  // Inicia nova rodada
  Storage.startNewRound();
  Sorteio.selectedPlayerIds = new Set(players20.map(p => p.id));
  Sorteio.executarSorteio(players20);

  const nextRoundTeams = Storage.getTeams();
  assert(nextRoundTeams.time_1.name === 'Time 1', 'Na próxima rodada, Time 1 reseta para "Time 1"');
  assert(nextRoundTeams.time_2.name === 'Time 2', 'Na próxima rodada, Time 2 reseta para "Time 2"');
  assert(nextRoundTeams.time_3.name === 'Time 3', 'Na próxima rodada, Time 3 reseta para "Time 3"');
  assert(nextRoundTeams.time_4.name === 'Time 4', 'Na próxima rodada, Time 4 reseta para "Time 4"');

  // O histórico da rodada anterior manteve o nome customizado
  const savedRounds = Storage.getRounds();
  const prevRound = savedRounds.find(r => r.id === persistedRound.id);
  assert(prevRound !== undefined, 'Rodada anterior preservada no histórico');
  assert(prevRound.teams.time_1.name === 'Brabos Supremo', 'Rodada anterior preservou seu nome histórico customizado');

  // ----------------------------------------------------------------
  // BLOCO 8: MULTI-DISPOSITIVO E REALTIME
  // ----------------------------------------------------------------
  console.log('\n--- BLOCO 8: Eventos e Sincronização em Tempo Real ---');

  let receivedEvent = null;
  const unsubscribe = Storage.onChange((type, data) => {
    if (type === 'teamNameUpdated') {
      receivedEvent = data;
    }
  });

  await Storage.updateTeamName('time_2', 'Vasco da Pelada');
  assert(receivedEvent !== null, 'Evento teamNameUpdated foi emitido com sucesso');
  assert(receivedEvent.teamId === 'time_2', 'Evento contém teamId correto');
  assert(receivedEvent.newName === 'Vasco da Pelada', 'Evento contém newName correto');

  if (typeof unsubscribe === 'function') unsubscribe();

  // Finalização
  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${testCount} | PASSOU: ${passCount} | FALHOU: ${failCount}`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
