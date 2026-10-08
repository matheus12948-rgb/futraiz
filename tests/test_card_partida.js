/**
 * TESTE OBRIGATÓRIO — REFORMULAÇÃO VISUAL DO CARD DA PARTIDA
 * Referência estética: Apresentação de transmissão esportiva moderna (estilo UEFA Champions League)
 * - Placar muito mais forte e dominante;
 * - Times bem posicionados com escudos/badges genéricos [1], [2];
 * - Hierarquia visual clara: Badge Topo -> Times & Placar Central -> Cronômetro -> Marcadores -> Botões Gol -> Controles;
 * - Responsivo e seguro: sem emojis, sem cópia de marcas proprietárias, preservação de todos os IDs e regras de negócio.
 */

import assert from 'assert';
import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
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
    get className() { return Array.from(classes).join(' '); },
    set className(val) {
      classes.clear();
      if (val) val.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    },
    disabled: false,
    offsetWidth: 100,
    style: {},
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
    insertBefore: (child, ref) => {
      const idx = children.indexOf(ref);
      if (idx >= 0) children.splice(idx, 0, child);
      else children.unshift(child);
      elem.firstChild = children[0] || null;
      return child;
    },
    setAttribute: (name, val) => { attrs[name] = val; },
    getAttribute: (name) => attrs[name] || null,
    querySelector: (sel) => {
      if (sel === '.match-setup') return domStore['match-setup'] || (domStore['match-setup'] = createMockElement('match-setup'));
      if (sel === '.scoreboard') return domStore['scoreboard'] || (domStore['scoreboard'] = createMockElement('scoreboard'));
      if (sel.includes('match-goals-timeline') || sel.includes('.timeline')) return domStore['timeline-card'] || (domStore['timeline-card'] = createMockElement('timeline-card'));
      return null;
    },
    querySelectorAll: (sel) => []
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

let passed = 0;
let failed = 0;

function testAssert(condition, testNum, desc) {
  if (condition) {
    passed++;
    console.log(`  ✅ [Teste ${testNum}] PASS: ${desc}`);
  } else {
    failed++;
    console.error(`  ❌ [Teste ${testNum}] FAIL: ${desc}`);
  }
}

async function runMatchCardTests() {
  console.log('\n================================================================');
  console.log('BATERIA DE TESTES: REFORMULAÇÃO VISUAL DO CARD DA PARTIDA');
  console.log('================================================================');

  // Inicializa containers do DOM
  const requiredIds = [
    'partida-container', 'partida-empty-state', 'partida-active-state',
    'match-live-badge', 'block-team-home', 'block-team-away',
    'badge-team-home', 'badge-team-away',
    'scoreboard-home-name', 'scoreboard-away-name',
    'scoreboard-home-score', 'scoreboard-away-score',
    'scoreboard-timer', 'match-status-tag', 'match-result-line',
    'scoreboard-scorers-summary', 'scoreboard-scorers-home', 'scoreboard-scorers-away',
    'btn-add-goal-home', 'btn-add-goal-away',
    'btn-timer-start', 'btn-timer-pause', 'btn-timer-reset', 'btn-timer-finish',
    'match-goals-timeline', 'match-duration-select', 'match-duration-custom'
  ];

  requiredIds.forEach(id => {
    document.getElementById(id);
  });

  // -------------------------------------------------------------
  // CENÁRIO 1: Setup do Futebol e Times para Teste
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 1: Setup de Futebol e Times ---');
  const futRes = await Storage.createFutebol({
    nome: 'Futebol Champions League Style',
    adminNome: 'Organizador Master',
    email: 'champions_match@teste.com',
    password: 'password123'
  });
  const futId = futRes.futebol.id;

  const playerIds = [];
  for (let i = 1; i <= 20; i++) {
    const p = await Storage.addPlayer({
      name: `Atleta Craque ${i}`,
      stars: 4
    });
    playerIds.push(p.id);
  }

  const teams = {
    time_1: { id: 'time_1', name: 'Time 1 Real', color: '#10b981', playerIds: playerIds.slice(0, 5) },
    time_2: { id: 'time_2', name: 'Time 2 City', color: '#3b82f6', playerIds: playerIds.slice(5, 10) },
    time_3: { id: 'time_3', name: 'Time 3 Bayern', color: '#f59e0b', playerIds: playerIds.slice(10, 15) },
    time_4: { id: 'time_4', name: 'Time 4 Milan', color: '#ef4444', playerIds: playerIds.slice(15, 20) }
  };
  Storage.saveTeams(teams);

  const roundObj = {
    id: 'round_match_01',
    date: Utils.formatDate(new Date()),
    dateKey: Utils.getDateKey(new Date()),
    status: 'ACTIVE',
    teams
  };
  Storage.saveCurrentRound(roundObj);

  Partidas.init();

  testAssert(domStore['partida-active-state'].style.display === 'block', '1.1', 'Estado ativo da partida está visível');
  testAssert(domStore['partida-empty-state'].style.display === 'none', '1.2', 'Empty state está oculto');

  // -------------------------------------------------------------
  // CENÁRIO 2: Estado SCHEDULED (Pronto / Aguardando Início)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 2: Estado SCHEDULED (Aguardando Início) ---');
  Partidas.state.status = 'ready';
  Partidas.state.isActive = false;
  Partidas.state.isPaused = false;
  Partidas.render();

  const liveBadge = document.getElementById('match-live-badge');
  const homeScoreEl = document.getElementById('scoreboard-home-score');
  const awayScoreEl = document.getElementById('scoreboard-away-score');
  const statusTag = document.getElementById('match-status-tag');
  const btnStart = document.getElementById('btn-timer-start');
  const btnPause = document.getElementById('btn-timer-pause');
  const btnFinish = document.getElementById('btn-timer-finish');
  const badgeHome = document.getElementById('badge-team-home');
  const badgeAway = document.getElementById('badge-team-away');

  testAssert(liveBadge.textContent.includes('PARTIDA 01') && liveBadge.textContent.includes('AGUARDANDO INÍCIO'), '2.1', 'Badge no topo exibe "PARTIDA 01 · AGUARDANDO INÍCIO"');
  testAssert(liveBadge.classList.contains('live-badge'), '2.2', 'Badge possui classe base .live-badge');
  testAssert(badgeHome.textContent === '1', '2.3', 'Badge do mandante exibe número [1]');
  testAssert(badgeAway.textContent === '2', '2.4', 'Badge do visitante exibe número [2]');
  testAssert(homeScoreEl.textContent === 0 || homeScoreEl.textContent === '0', '2.5', 'Placar mandante inicia 0');
  testAssert(awayScoreEl.textContent === 0 || awayScoreEl.textContent === '0', '2.6', 'Placar visitante inicia 0');
  testAssert(statusTag.textContent === 'AGUARDANDO', '2.7', 'Status tag indica AGUARDANDO');
  testAssert(btnStart.style.display !== 'none', '2.8', 'Botão INICIAR visível');
  testAssert(btnPause.style.display === 'none', '2.9', 'Botão PAUSAR oculto antes de iniciar');
  testAssert(btnFinish.style.display === 'none', '2.10', 'Botão FINALIZAR oculto antes de iniciar');

  // -------------------------------------------------------------
  // CENÁRIO 3: Iniciar Partida (RUNNING)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 3: Estado RUNNING (Em Andamento) ---');
  Partidas.state.status = 'running';
  Partidas.state.isActive = true;
  Partidas.state.isPaused = false;
  Partidas.render();

  testAssert(liveBadge.textContent.includes('EM ANDAMENTO'), '3.1', 'Badge no topo exibe "EM ANDAMENTO"');
  testAssert(liveBadge.classList.contains('is-live'), '3.2', 'Badge recebe classe ativa .is-live');
  testAssert(statusTag.textContent === 'Em Andamento', '3.3', 'Status tag exibe "Em Andamento"');
  testAssert(btnStart.style.display === 'none', '3.4', 'Botão INICIAR oculto durante o jogo');
  testAssert(btnPause.style.display === 'inline-flex', '3.5', 'Botão PAUSAR visível');
  testAssert(btnFinish.style.display === 'inline-flex', '3.6', 'Botão FINALIZAR visível e pronto');

  // -------------------------------------------------------------
  // CENÁRIO 4: Pausar e Retomar Partida (PAUSED -> RUNNING)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 4: Pausar e Retomar Partida ---');
  Partidas.state.status = 'paused';
  Partidas.state.isPaused = true;
  Partidas.render();

  testAssert(liveBadge.textContent.includes('PAUSADA'), '4.1', 'Badge exibe "PAUSADA"');
  testAssert(liveBadge.classList.contains('is-paused'), '4.2', 'Badge recebe classe .is-paused');
  testAssert(statusTag.textContent === 'PAUSADA', '4.3', 'Status tag exibe "PAUSADA"');
  testAssert(btnStart.style.display === 'inline-flex', '4.4', 'Botão de retomada visível');
  testAssert(btnStart.innerHTML.includes('RETOMAR'), '4.5', 'Botão exibe texto "RETOMAR"');
  testAssert(btnPause.style.display === 'none', '4.6', 'Botão PAUSAR oculto enquanto pausado');

  // -------------------------------------------------------------
  // CENÁRIO 5: Registro de Gols e Placar Dominante (1 × 0 e 3 × 2)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 5: Placar Dominante e Marcadores ---');
  // Partida 1x0
  Partidas.state.status = 'running';
  Partidas.state.isPaused = false;
  Partidas.state.homeScore = 1;
  Partidas.state.awayScore = 0;
  Partidas.state.goals = [
    { id: 'g1', playerId: playerIds[0], playerName: 'Atleta Craque 1', teamId: 'time_1', minuteFormatted: '02:15' }
  ];
  Partidas.render();

  testAssert(homeScoreEl.textContent === 1 || homeScoreEl.textContent === '1', '5.1', 'Placar mandante atualiza para 1');
  testAssert(awayScoreEl.textContent === 0 || awayScoreEl.textContent === '0', '5.2', 'Placar visitante segue 0');
  
  const scorersSummary = document.getElementById('scoreboard-scorers-summary');
  const scorersHome = document.getElementById('scoreboard-scorers-home');
  const scorersAway = document.getElementById('scoreboard-scorers-away');

  testAssert(scorersSummary.style.display === 'flex', '5.3', 'Container de marcadores recente visível quando há gols');
  testAssert(scorersHome.innerHTML.includes('Atleta Craque 1'), '5.4', 'Marcador do gol mandante listado');

  // Partida 3x2 (Muitos gols)
  Partidas.state.homeScore = 3;
  Partidas.state.awayScore = 2;
  Partidas.state.goals = [
    { id: 'g1', playerId: playerIds[0], playerName: 'Atleta Craque 1', teamId: 'time_1', minuteFormatted: '02:15' },
    { id: 'g2', playerId: playerIds[0], playerName: 'Atleta Craque 1', teamId: 'time_1', minuteFormatted: '04:20' },
    { id: 'g3', playerId: playerIds[1], playerName: 'Atleta Craque 2', teamId: 'time_1', minuteFormatted: '05:10' },
    { id: 'g4', playerId: playerIds[5], playerName: 'Atleta Craque 6', teamId: 'time_2', minuteFormatted: '05:40' },
    { id: 'g5', playerId: playerIds[5], playerName: 'Atleta Craque 6', teamId: 'time_2', minuteFormatted: '06:15' }
  ];
  Partidas.render();

  testAssert(homeScoreEl.textContent === 3 || homeScoreEl.textContent === '3', '5.5', 'Placar mandante exibe 3');
  testAssert(awayScoreEl.textContent === 2 || awayScoreEl.textContent === '2', '5.6', 'Placar visitante exibe 2');
  testAssert(scorersHome.innerHTML.includes('Atleta Craque 1') && scorersHome.innerHTML.includes('2'), '5.7', 'Atleta Craque 1 agrupado com contador 2');
  testAssert(scorersAway.innerHTML.includes('Atleta Craque 6') && scorersAway.innerHTML.includes('2'), '5.8', 'Atleta Craque 6 visitante agrupado com contador 2');

  // -------------------------------------------------------------
  // CENÁRIO 6: Botões de Ação de Gol (+ GOL TIME)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 6: Botões de Gol com Identidade dos Times ---');
  const btnGoalHome = document.getElementById('btn-add-goal-home');
  const btnGoalAway = document.getElementById('btn-add-goal-away');

  testAssert(btnGoalHome.innerHTML.includes('+ GOL') && btnGoalHome.innerHTML.includes('TIME 1'), '6.1', 'Botão de gol do mandante exibe "+ GOL TIME 1"');
  testAssert(btnGoalAway.innerHTML.includes('+ GOL') && btnGoalAway.innerHTML.includes('TIME 2'), '6.2', 'Botão de gol do visitante exibe "+ GOL TIME 2"');
  testAssert(btnGoalHome.disabled === false, '6.3', 'Botão de gol mandante habilitado durante jogo');
  testAssert(btnGoalAway.disabled === false, '6.4', 'Botão de gol visitante habilitado durante jogo');

  // -------------------------------------------------------------
  // CENÁRIO 7: Estado FINISHED (Finalizada)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 7: Estado FINISHED (Partida Encerrada) ---');
  Partidas.state.status = 'finished';
  Partidas.state.isActive = false;
  Partidas.state.isPaused = false;
  Partidas.render();

  testAssert(liveBadge.textContent.includes('FINALIZADA'), '7.1', 'Badge exibe "FINALIZADA"');
  testAssert(liveBadge.classList.contains('is-finished'), '7.2', 'Badge recebe classe .is-finished');
  testAssert(statusTag.textContent === 'FINALIZADA', '7.3', 'Status tag exibe "FINALIZADA"');
  testAssert(btnGoalHome.disabled === true, '7.4', 'Botão de gol mandante desabilitado após finalização');
  testAssert(btnGoalAway.disabled === true, '7.5', 'Botão de gol visitante desabilitado após finalização');
  testAssert(btnStart.style.display === 'none', '7.6', 'Botão INICIAR oculto após finalização');
  testAssert(btnPause.style.display === 'none', '7.7', 'Botão PAUSAR oculto após finalização');
  testAssert(btnFinish.style.display === 'none', '7.8', 'Botão FINALIZAR oculto após finalização');

  // -------------------------------------------------------------
  // CENÁRIO 8: Nomes Grandes e Nomes Curtos de Equipes
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 8: Robustez para Nomes Grandes e Curtos ---');
  teams.time_1.name = 'Equipe dos Boleiros de Terça-Feira Super FC';
  teams.time_2.name = 'Azul';
  const currentKey = Storage._getScopedKey('teams');
  localStorage.setItem(currentKey, JSON.stringify(teams));
  Partidas.render();

  const nameHome = document.getElementById('scoreboard-home-name');
  const nameAway = document.getElementById('scoreboard-away-name');

  testAssert(nameHome.textContent === 'Equipe dos Boleiros de Terça-Feira Super FC', '8.1', 'Nome extenso preservado sem erro no DOM');
  testAssert(nameAway.textContent === 'Azul', '8.2', 'Nome curto preservado sem erro no DOM');

  // -------------------------------------------------------------
  // CENÁRIO 9: Validação de Regras de Negócio e Ausência de Quebras
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 9: Regras de Negócio Intactas ---');
  testAssert(Partidas.state.order === 1, '9.1', 'Ordem da partida intacta (1)');
  testAssert(typeof Partidas.solicitarFinalizacao === 'function', '9.2', 'Função de finalização intacta');
  testAssert(typeof Partidas.pauseMatch === 'function', '9.3', 'Função de pausa intacta');
  testAssert(typeof Partidas.abrirModalSeletorGol === 'function', '9.4', 'Modal de gol seletor dos 5 atletas preservado');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMatchCardTests().catch(err => {
  console.error('Erro nos testes do Card da Partida:', err);
  process.exit(1);
});
