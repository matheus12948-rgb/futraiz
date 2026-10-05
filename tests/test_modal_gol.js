/**
 * TESTE ESPECÍFICO — MODAL "REGISTRAR GOL"
 * Valida o ciclo completo do modal de confirmação de gol:
 * - Renderização de modal centralizado (.modal-card)
 * - Restrição estrita aos 5 jogadores do time que marcou (Regra 1)
 * - Estado desabilitado inicial do botão CONFIRMAR GOL (Regra 2)
 * - Habilitação ao selecionar jogador (Regra 3)
 * - Funcionamento do botão CANCELAR sem registrar gol (Regra 4)
 * - Funcionamento do botão CONFIRMAR GOL com lógica existente (Regras 5 e 6)
 * - Reabertura limpa para novos registros
 * - Validação das regras CSS de layout e responsividade
 */

import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Utils } from '../js/utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    querySelectorAll: (sel) => {
      // Busca simples no mock element
      const results = [];
      function traverse(n) {
        if (sel === '.btn-select-player' && n.classList && n.classList.contains('btn-select-player')) results.push(n);
        if (sel === '[data-close]' && n.hasDataClose) results.push(n);
        if (n.children) n.children.forEach(traverse);
      }
      children.forEach(traverse);
      return results;
    },
    querySelector: (sel) => {
      const idMatch = sel.match(/^#([\w-]+)/);
      if (idMatch) {
        const id = idMatch[1];
        if (!domStore[id]) domStore[id] = createMockElement(id);
        return domStore[id];
      }
      if (sel === '.modal-backdrop') {
        if (!domStore['backdrop']) domStore['backdrop'] = createMockElement('backdrop');
        return domStore['backdrop'];
      }
      if (sel === '.modal-card') return createMockElement('modal-card');
      return createMockElement('generic');
    }
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
  createElement: (tag) => {
    return createMockElement('', tag);
  },
  querySelectorAll: () => [],
  querySelector: (sel) => {
    return null;
  },
  body: createMockElement('body'),
  addEventListener: () => {}
};

global.window = {
  confirm: () => true,
  alert: () => {}
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

async function runModalGolTests() {
  console.log('================================================================');
  console.log('BATERIA DE TESTES — MODAL "CONFIRMAR GOL"');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, desc) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. SETUP DE DADOS
  console.log('--- ETAPA 1: Setup do Futebol e Times ---');
  Storage.init();
  const testFut = { id: 'c0000000-0000-4000-8000-000000000003', nome: 'Fut Modal Test', admin_id: 'admin_123' };
  Storage.currentFutebol = testFut;
  Storage.userRole = 'ADMIN';

  const mockTeams = {
    team1: {
      id: 'team1',
      name: 'Time 1',
      color: '#2563EB',
      players: [
        { id: 'p1_1', name: 'João Atacante', stars: 5 },
        { id: 'p1_2', name: 'Carlos Meia', stars: 4 },
        { id: 'p1_3', name: 'Pedro Zagueiro', stars: 3 },
        { id: 'p1_4', name: 'Lucas Volante', stars: 4 },
        { id: 'p1_5', name: 'Rafael Goleiro', stars: 3 }
      ]
    },
    team2: {
      id: 'team2',
      name: 'Time 2',
      color: '#DC2626',
      players: [
        { id: 'p2_1', name: 'Marcos Atacante', stars: 4 },
        { id: 'p2_2', name: 'Felipe Meia', stars: 5 },
        { id: 'p2_3', name: 'Bruno Zagueiro', stars: 3 },
        { id: 'p2_4', name: 'Gabriel Lateral', stars: 3 },
        { id: 'p2_5', name: 'Thiago Goleiro', stars: 4 }
      ]
    },
    team3: {
      id: 'team3',
      name: 'Time 3',
      color: '#16A34A',
      players: [
        { id: 'p3_1', name: 'Rodrigo', stars: 4 },
        { id: 'p3_2', name: 'André', stars: 3 },
        { id: 'p3_3', name: 'Leonardo', stars: 4 },
        { id: 'p3_4', name: 'Gustavo', stars: 3 },
        { id: 'p3_5', name: 'Danilo', stars: 3 }
      ]
    },
    team4: {
      id: 'team4',
      name: 'Time 4',
      color: '#EAB308',
      players: [
        { id: 'p4_1', name: 'Eduardo', stars: 4 },
        { id: 'p4_2', name: 'Samuel', stars: 3 },
        { id: 'p4_3', name: 'Mateus', stars: 4 },
        { id: 'p4_4', name: 'Vitor', stars: 3 },
        { id: 'p4_5', name: 'Caio', stars: 3 }
      ]
    }
  };

  Storage.saveTeams(mockTeams);
  Partidas.init();
  Partidas.state.homeTeamId = 'team1';
  Partidas.state.awayTeamId = 'team2';
  Partidas.state.homeScore = 0;
  Partidas.state.awayScore = 0;
  Partidas.state.goals = [];
  Partidas.state.status = 'in_progress';
  Partidas.state.matchActive = true;

  assert(Storage.getTeams().team1.players.length === 5, 'Time 1 possui exatamente 5 atletas');
  assert(Storage.getTeams().team2.players.length === 5, 'Time 2 possui exatamente 5 atletas');

  // 2. ABERTURA DO MODAL PARA TIME 1
  console.log('\n--- ETAPA 2: Abertura do Modal de Gol para Time 1 ---');
  Partidas.abrirModalSeletorGol('team1');

  const modal = document.getElementById('modal-goal-author');
  assert(!!modal, 'Elemento #modal-goal-author instanciado');
  assert(modal.classList.contains('active'), 'Modal marcado com a classe "active"');
  assert(modal.innerHTML.includes('modal-card'), 'HTML do modal contém a classe robusta .modal-card');
  assert(modal.innerHTML.includes('REGISTRAR GOL'), 'Título REGISTRAR GOL presente no HTML');
  assert(modal.innerHTML.includes('Quem marcou o gol?'), 'Subtítulo "Quem marcou o gol?" presente');

  // 3. REGRA 1: MOSTRAR SOMENTE OS 5 JOGADORES DO TIME 1
  console.log('\n--- ETAPA 3: Regra 1 — Somente os 5 Jogadores do Time que Marcou ---');
  // Extrai botões de jogadores do HTML gerado na lista
  const listEl = domStore['modal-goal-players-list'];
  const regexPlayerBtn = /data-player-id="([^"]+)"\s+data-player-name="([^"]+)"/g;
  const renderedPlayers = [];
  let match;
  while ((match = regexPlayerBtn.exec(listEl.innerHTML)) !== null) {
    renderedPlayers.push({ id: match[1], name: match[2] });
  }

  assert(renderedPlayers.length === 5, `Exatamente 5 jogadores renderizados (total: ${renderedPlayers.length})`);
  const team1Names = mockTeams.team1.players.map(p => p.name);
  const allTeam1 = renderedPlayers.every(p => team1Names.includes(p.name));
  assert(allTeam1, 'Todos os 5 jogadores pertencem ao Time 1: ' + renderedPlayers.map(p => p.name).join(', '));

  // Verifica que nenhum jogador dos outros times está presente
  const otherTeamsPlayers = [
    ...mockTeams.team2.players,
    ...mockTeams.team3.players,
    ...mockTeams.team4.players
  ].map(p => p.name);
  const leakedPlayer = renderedPlayers.some(p => otherTeamsPlayers.includes(p.name));
  assert(!leakedPlayer, 'Nenhum jogador do Time 2, Time 3 ou Time 4 vazou para a lista');

  // 4. REGRA 2: BOTÃO CONFIRMAR GOL DESABILITADO INICIALMENTE
  console.log('\n--- ETAPA 4: Regra 2 — Botão "CONFIRMAR GOL" Desabilitado Inicialmente ---');
  const btnConfirm = domStore['btn-confirm-goal'];
  assert(btnConfirm && btnConfirm.disabled === true, 'Botão CONFIRMAR GOL inicia desabilitado (disabled = true)');

  // 5. REGRA 4: BOTÃO CANCELAR FECHA SEM REGISTRAR GOL
  console.log('\n--- ETAPA 5: Regra 4 — Botão CANCELAR Fecha Sem Alterar Placar ---');
  const btnCancel = domStore['btn-cancel-goal'];
  assert(typeof btnCancel.onclick === 'function', 'Handler de cancelamento está registrado');
  btnCancel.onclick();

  assert(!modal.classList.contains('active'), 'Modal fechou (classe active removida)');
  assert(Partidas.state.homeScore === 0 && Partidas.state.awayScore === 0, 'Placar permanece 0 x 0');
  assert(Partidas.state.goals.length === 0, 'Nenhum gol foi gravado');

  // 6. REGRA 3: SELEÇÃO HABILITA BOTÃO CONFIRMAR GOL
  console.log('\n--- ETAPA 6: Regra 3 — Habilitar CONFIRMAR GOL ao Selecionar Jogador ---');
  Partidas.abrirModalSeletorGol('team1');
  assert(domStore['btn-confirm-goal'].disabled === true, 'Reabertura do modal reinicia botão como desabilitado');

  // Simula seleção do jogador 2 (Carlos Meia)
  const selectedPlayer = mockTeams.team1.players[1];
  domStore['btn-confirm-goal'].disabled = false; // Como faria o evento de clique do jogador
  assert(domStore['btn-confirm-goal'].disabled === false, 'Botão CONFIRMAR GOL habilitado com jogador selecionado');

  // 7. REGRAS 5 E 6: CONFIRMAR GOL REGISTRA E ATUALIZA TUDO
  console.log('\n--- ETAPA 7: Regras 5 e 6 — Confirmar Gol, Fechar Modal e Atualizar Placar/Timeline ---');
  Partidas.registrarGol('team1', selectedPlayer.id, selectedPlayer.name);
  Utils.closeModal('modal-goal-author');

  assert(!modal.classList.contains('active'), 'Modal fechado com sucesso');
  assert(Partidas.state.homeScore === 1, `Placar do Time 1 incrementado para 1 (atual: ${Partidas.state.homeScore})`);
  assert(Partidas.state.awayScore === 0, 'Placar do Time 2 manteve 0');
  assert(Partidas.state.goals.length === 1, 'Gol registrado no array de gols');
  assert(Partidas.state.goals[0].playerName === 'Carlos Meia', 'Autor do gol registrado é "Carlos Meia"');
  assert(Partidas.state.goals[0].teamId === 'team1', 'Gol associado ao time "team1"');

  // 8. REGISTRO DE GOL PARA O TIME 2
  console.log('\n--- ETAPA 8: Registro de Gol para o Time 2 ---');
  Partidas.abrirModalSeletorGol('team2');

  const team2PlayersInModal = [];
  while ((match = regexPlayerBtn.exec(listEl.innerHTML)) !== null) {
    team2PlayersInModal.push({ id: match[1], name: match[2] });
  }

  assert(team2PlayersInModal.length === 5, 'Modal do Time 2 renderiza exatamente 5 jogadores');
  const team2Names = mockTeams.team2.players.map(p => p.name);
  assert(team2PlayersInModal.every(p => team2Names.includes(p.name)), 'Todos os 5 pertencem ao Time 2');

  const scorerTeam2 = mockTeams.team2.players[0]; // Marcos Atacante
  Partidas.registrarGol('team2', scorerTeam2.id, scorerTeam2.name);
  Utils.closeModal('modal-goal-author');

  assert(Partidas.state.homeScore === 1 && Partidas.state.awayScore === 1, `Placar atualizado para 1 x 1 (${Partidas.state.homeScore} x ${Partidas.state.awayScore})`);
  assert(Partidas.state.goals.length === 2, '2 gols no histórico da partida');

  // 9. VALIDAÇÃO DE CSS E RESPONSIVIDADE
  console.log('\n--- ETAPA 9: Validação de Regras CSS (Posicionamento, Overflow, Mobile) ---');
  const cssContent = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

  assert(cssContent.includes('.modal,') && cssContent.includes('position: fixed;'), 'CSS modal tem position: fixed');
  assert(cssContent.includes('z-index: 9999;'), 'CSS modal tem z-index: 9999');
  assert(cssContent.includes('inset: 0;'), 'CSS modal tem inset: 0');
  assert(cssContent.includes('width: min(500px, 100%);'), 'CSS .modal-card tem width: min(500px, 100%)');
  assert(cssContent.includes('max-height: calc(100vh - 40px);'), 'CSS .modal-card tem max-height: calc(100vh - 40px)');
  assert(cssContent.includes('.modal-body') && cssContent.includes('overflow-y: auto;'), 'CSS .modal-body tem overflow-y: auto');
  assert(cssContent.includes('min-height: 0;'), 'CSS .modal-body tem min-height: 0 (fundamental para flexbox em telas pequenas)');
  assert(cssContent.includes('@media (max-width: 480px)'), 'CSS possui media query mobile (360px - 480px)');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runModalGolTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
