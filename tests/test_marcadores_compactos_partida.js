/**
 * Testes Unitários e de Integração: Exibição Compacta dos Marcadores de Gols no Card da Partida
 *
 * Valida:
 * 1. 0 x 0 (nenhum marcador exibido, display: none, sem espaço em branco reservado)
 * 2. 1 x 0 (marcador do Time 1 à esquerda, direita vazia)
 * 3. 0 x 1 (marcador do Time 2 à direita, esquerda vazia)
 * 4. 1 x 1 (um jogador de cada lado)
 * 5. 3 x 2 (marcadores agrupados nos respectivos lados)
 * 6. Múltiplos gols do mesmo atleta (1 gol = 1 bola, 2 gols = 2 bolas, 3 gols = 3 bolas, nome aparece 1 vez)
 * 7. Vários jogadores do mesmo time (lista compacta sem cards individuais)
 * 8. Nomes personalizados dos times (integração intacta, associação estrita por teamId)
 * 9. Ausência total de cards, quadrados, bordas, fundos e alturas fixas
 * 10. Responsividade e regras de negócio
 */

import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';

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
    get className() { return Array.from(classes).join(' '); },
    set className(val) {
      classes.clear();
      if (val) val.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    },
    disabled: false,
    offsetWidth: 100,
    style: {
      _props: {},
      setProperty(p, v) { this[p] = v; this._props[p] = v; },
      removeProperty(p) { delete this[p]; delete this._props[p]; }
    },
    dataset,
    children,
    firstChild: null,
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
      elem.firstChild = children[0] || null;
      return child;
    },
    setAttribute: (name, val) => { attrs[name] = val; },
    getAttribute: (name) => attrs[name] || null,
    querySelector: () => null,
    querySelectorAll: () => []
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
  body: createMockElement('body'),
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.window = {
  location: { reload: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  App: { navigateTo: () => {} }
};

let testCount = 0;
let passCount = 0;
function testAssert(condition, code, desc) {
  testCount++;
  if (condition) {
    passCount++;
    console.log(`  ✅ [Teste ${code}] PASS: ${desc}`);
  } else {
    console.error(`  ❌ [Teste ${code}] FAIL: ${desc}`);
    throw new Error(`Falha no teste ${code}: ${desc}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('TESTES DE EXIBIÇÃO COMPACTA DOS MARCADORES DE GOL NO SCOREBOARD');
  console.log('================================================================');

  // Inicializa containers necessários no DOM
  [
    'partida-active-state', 'match-setup', 'scoreboard', 'match-live-badge',
    'block-team-home', 'block-team-away', 'badge-team-home', 'badge-team-away',
    'scoreboard-home-name', 'scoreboard-away-name', 'scoreboard-home-score', 'scoreboard-away-score',
    'scoreboard-timer', 'match-status-tag', 'scoreboard-scorers-summary',
    'scoreboard-scorers-home', 'scoreboard-scorers-away',
    'btn-add-goal-home', 'btn-add-goal-away',
    'btn-timer-start', 'btn-timer-pause', 'btn-timer-finish', 'btn-timer-reset',
    'match-goals-timeline', 'match-quem-ganha-fica-banner', 'night-end-control-section'
  ].forEach(id => document.getElementById(id));

  // Setup de Futebol e Rodada
  const futRes = await Storage.createFutebol({
    nome: 'Futebol Marcadores Compactos',
    adminNome: 'Admin Teste',
    email: 'compact_scorers@teste.com',
    password: 'password123'
  });
  const fId = futRes.futebol.id;

  const mockTeams = {
    time_1: { id: 'time_1', name: 'Time 1', totalStars: 15, playerIds: ['p1', 'p2', 'p3', 'p4', 'p5'] },
    time_2: { id: 'time_2', name: 'Time 2', totalStars: 15, playerIds: ['p6', 'p7', 'p8', 'p9', 'p10'] },
    time_3: { id: 'time_3', name: 'Time 3', totalStars: 15, playerIds: ['p11', 'p12', 'p13', 'p14', 'p15'] },
    time_4: { id: 'time_4', name: 'Time 4', totalStars: 15, playerIds: ['p16', 'p17', 'p18', 'p19', 'p20'] }
  };
  Storage.saveTeams(mockTeams);

  const mockRound = {
    id: 'rd_compact_1',
    futebolId: fId,
    order: 1,
    status: 'ACTIVE',
    teams: mockTeams,
    matches: []
  };
  Storage.saveCurrentRound(mockRound);

  Partidas.state.homeTeamId = 'time_1';
  Partidas.state.awayTeamId = 'time_2';
  Partidas.state.homeTeamName = 'Time 1';
  Partidas.state.awayTeamName = 'Time 2';
  Partidas.state.status = 'running';

  const summaryEl = document.getElementById('scoreboard-scorers-summary');
  const homeEl = document.getElementById('scoreboard-scorers-home');
  const awayEl = document.getElementById('scoreboard-scorers-away');

  // --------------------------------------------------------------------------
  // CENÁRIO 1: 0 x 0 (Nenhum marcador exibido)
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 1: Placar 0 × 0 (Sem marcadores) ---');
  Partidas.state.homeScore = 0;
  Partidas.state.awayScore = 0;
  Partidas.state.goals = [];
  Partidas.renderScoreboard();

  testAssert(summaryEl.style.display === 'none', '1.1', 'Container de marcadores oculto (display: none) quando placar é 0x0');
  testAssert(homeEl.innerHTML === '', '1.2', 'Lado mandante está vazio');
  testAssert(awayEl.innerHTML === '', '1.3', 'Lado visitante está vazio');

  // --------------------------------------------------------------------------
  // CENÁRIO 2: 1 x 0 (Um jogador do Time 1 à esquerda)
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 2: Placar 1 × 0 (Marcador mandante) ---');
  Partidas.state.homeScore = 1;
  Partidas.state.awayScore = 0;
  Partidas.state.goals = [
    { id: 'g1', playerId: 'p1', playerName: 'Gerly', teamId: 'time_1', minuteFormatted: '02:15' }
  ];
  Partidas.renderScoreboard();

  testAssert(summaryEl.style.display === 'flex', '2.1', 'Container de marcadores visível (display: flex) quando há 1 gol');
  testAssert(homeEl.innerHTML.includes('Gerly'), '2.2', 'Nome do atleta Gerly exibido no lado mandante (esquerda)');
  testAssert(homeEl.innerHTML.includes('sb-scorer-ball'), '2.3', 'Ícone SVG de bola presente no lado mandante');
  testAssert(awayEl.innerHTML === '', '2.4', 'Lado visitante (direita) permanece vazio');

  // --------------------------------------------------------------------------
  // CENÁRIO 3: 0 x 1 (Um jogador do Time 2 à direita)
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 3: Placar 0 × 1 (Marcador visitante) ---');
  Partidas.state.homeScore = 0;
  Partidas.state.awayScore = 1;
  Partidas.state.goals = [
    { id: 'g2', playerId: 'p6', playerName: 'Motozin', teamId: 'time_2', minuteFormatted: '03:40' }
  ];
  Partidas.renderScoreboard();

  testAssert(summaryEl.style.display === 'flex', '3.1', 'Container de marcadores visível quando visitante marca');
  testAssert(homeEl.innerHTML === '', '3.2', 'Lado mandante (esquerda) vazio');
  testAssert(awayEl.innerHTML.includes('Motozin'), '3.3', 'Nome do atleta Motozin exibido no lado visitante (direita)');
  testAssert(awayEl.innerHTML.includes('sb-scorer-ball'), '3.4', 'Ícone SVG de bola presente no lado visitante');

  // --------------------------------------------------------------------------
  // CENÁRIO 4: 1 x 1 (Um jogador de cada lado)
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 4: Placar 1 × 1 (Um marcador de cada lado) ---');
  Partidas.state.homeScore = 1;
  Partidas.state.awayScore = 1;
  Partidas.state.goals = [
    { id: 'g1', playerId: 'p1', playerName: 'Gerly', teamId: 'time_1', minuteFormatted: '02:15' },
    { id: 'g2', playerId: 'p6', playerName: 'Motozin', teamId: 'time_2', minuteFormatted: '03:40' }
  ];
  Partidas.renderScoreboard();

  testAssert(homeEl.innerHTML.includes('Gerly'), '4.1', 'Gerly à esquerda');
  testAssert(!homeEl.innerHTML.includes('Motozin'), '4.2', 'Motozin NÃO aparece à esquerda');
  testAssert(awayEl.innerHTML.includes('Motozin'), '4.3', 'Motozin à direita');
  testAssert(!awayEl.innerHTML.includes('Gerly'), '4.4', 'Gerly NÃO aparece à direita');

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Múltiplos gols do mesmo atleta (2 e 3 gols)
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 5: Múltiplos gols do mesmo atleta (2 e 3 gols) ---');
  Partidas.state.homeScore = 2;
  Partidas.state.awayScore = 3;
  Partidas.state.goals = [
    { id: 'g1', playerId: 'p1', playerName: 'Gerly', teamId: 'time_1', minuteFormatted: '01:00' },
    { id: 'g2', playerId: 'p1', playerName: 'Gerly', teamId: 'time_1', minuteFormatted: '03:00' },
    { id: 'g3', playerId: 'p6', playerName: 'Motozin', teamId: 'time_2', minuteFormatted: '02:00' },
    { id: 'g4', playerId: 'p6', playerName: 'Motozin', teamId: 'time_2', minuteFormatted: '04:00' },
    { id: 'g5', playerId: 'p6', playerName: 'Motozin', teamId: 'time_2', minuteFormatted: '05:00' }
  ];
  Partidas.renderScoreboard();

  const gerlyOccurrences = (homeEl.innerHTML.match(/class="sb-scorer-name">Gerly<\/span>/g) || []).length;
  testAssert(gerlyOccurrences === 1, '5.1', 'Nome "Gerly" aparece exatamente 1 vez na lista visível apesar dos 2 gols');
  const gerlyBalls = (homeEl.innerHTML.match(/href="#i-ball"/g) || []).length;
  testAssert(gerlyBalls === 2, '5.2', 'Gerly possui exatamente 2 ícones de bola SVG para representar os 2 gols');

  const motozinOccurrences = (awayEl.innerHTML.match(/class="sb-scorer-name">Motozin<\/span>/g) || []).length;
  testAssert(motozinOccurrences === 1, '5.3', 'Nome "Motozin" aparece exatamente 1 vez na lista visível apesar dos 3 gols');
  const motozinBalls = (awayEl.innerHTML.match(/href="#i-ball"/g) || []).length;
  testAssert(motozinBalls === 3, '5.4', 'Motozin possui exatamente 3 ícones de bola SVG para representar os 3 gols');

  // --------------------------------------------------------------------------
  // CENÁRIO 6: Partida 3 × 2 com múltiplos marcadores distintos
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 6: Partida 3 × 2 (Múltiplos atletas por time) ---');
  Partidas.state.homeScore = 3;
  Partidas.state.awayScore = 2;
  Partidas.state.goals = [
    { id: 'g1', playerId: 'p1', playerName: 'João', teamId: 'time_1', minuteFormatted: '01:00' },
    { id: 'g2', playerId: 'p1', playerName: 'João', teamId: 'time_1', minuteFormatted: '02:00' },
    { id: 'g3', playerId: 'p2', playerName: 'Pedro', teamId: 'time_1', minuteFormatted: '04:00' },
    { id: 'g4', playerId: 'p6', playerName: 'Carlos', teamId: 'time_2', minuteFormatted: '03:00' },
    { id: 'g5', playerId: 'p7', playerName: 'Lucas', teamId: 'time_2', minuteFormatted: '05:00' }
  ];
  Partidas.renderScoreboard();

  testAssert(homeEl.innerHTML.includes('João') && homeEl.innerHTML.includes('Pedro'), '6.1', 'Time 1 lista João e Pedro à esquerda');
  testAssert(awayEl.innerHTML.includes('Carlos') && awayEl.innerHTML.includes('Lucas'), '6.2', 'Time 2 lista Carlos e Lucas à direita');
  testAssert(!homeEl.innerHTML.includes('Carlos') && !homeEl.innerHTML.includes('Lucas'), '6.3', 'Marcadores visitantes não vazam para a esquerda');
  testAssert(!awayEl.innerHTML.includes('João') && !awayEl.innerHTML.includes('Pedro'), '6.4', 'Marcadores mandantes não vazam para a direita');

  // --------------------------------------------------------------------------
  // CENÁRIO 7: Ausência de Cards Grandes / Sem Caixas Individuais
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 7: Estrutura sem cards, sem caixas individuais ---');
  testAssert(!homeEl.innerHTML.includes('class="card"'), '7.1', 'Nenhum card classe .card nos marcadores mandantes');
  testAssert(!awayEl.innerHTML.includes('class="card"'), '7.2', 'Nenhum card classe .card nos marcadores visitantes');
  testAssert(!homeEl.innerHTML.includes('border-color: #'), '7.3', 'Sem bordas coloridas inline que formem caixas nos marcadores');
  testAssert(!homeEl.innerHTML.includes('background: var(--surface-2)'), '7.4', 'Sem fundo pesado que transforme marcadores em grandes blocos');

  // --------------------------------------------------------------------------
  // CENÁRIO 8: Nomes Personalizados dos Times (Integração Perfeita)
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 8: Nomes Personalizados dos Times ---');
  await Storage.updateTeamName('time_1', 'Os Brabos');
  await Storage.updateTeamName('time_2', 'Resenha FC');

  Partidas.state.homeTeamName = 'Os Brabos';
  Partidas.state.awayTeamName = 'Resenha FC';
  Partidas.renderScoreboard();

  testAssert(document.getElementById('scoreboard-home-name').textContent === 'Os Brabos', '8.1', 'Placar mandante exibe "Os Brabos"');
  testAssert(document.getElementById('scoreboard-away-name').textContent === 'Resenha FC', '8.2', 'Placar visitante exibe "Resenha FC"');
  testAssert(homeEl.innerHTML.includes('João'), '8.3', 'Gols de "Os Brabos" continuam vinculados à esquerda por time_1');
  testAssert(awayEl.innerHTML.includes('Carlos'), '8.4', 'Gols de "Resenha FC" continuam vinculados à direita por time_2');

  const btnHome = document.getElementById('btn-add-goal-home');
  const btnAway = document.getElementById('btn-add-goal-away');
  testAssert(btnHome.innerHTML.includes('OS BRABOS'), '8.5', 'Botão exibe "+ GOL OS BRABOS"');
  testAssert(btnAway.innerHTML.includes('RESENHA FC'), '8.6', 'Botão exibe "+ GOL RESENHA FC"');

  // --------------------------------------------------------------------------
  // CENÁRIO 9: Remoção de Gol Atualiza Marcadores Imediatamente
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 9: Remoção de Gol Atualiza Marcadores ---');
  // Remove 1 gol de João
  Partidas.state.goals.splice(0, 1);
  Partidas.state.homeScore = 2;
  Partidas.renderScoreboard();

  const ballsAfter = (homeEl.innerHTML.match(/href="#i-ball"/g) || []).length;
  testAssert(ballsAfter === 2, '9.1', 'Após remoção de gol, total de bolas no time mandante é recalculado corretamente');

  // --------------------------------------------------------------------------
  // CENÁRIO 10: Compatibilidade com Testes Anteriores (Counter Value acessível)
  // --------------------------------------------------------------------------
  console.log('\n--- CENÁRIO 10: Compatibilidade com suíte test_card_partida ---');
  testAssert(homeEl.innerHTML.includes('data-count="1"'), '10.1', 'Atributo data-count presente para inspeção programática');
  testAssert(awayEl.innerHTML.includes('data-count="1"'), '10.2', 'Atributo data-count presente no visitante');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${testCount} | PASSOU: ${passCount} | FALHOU: 0`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
