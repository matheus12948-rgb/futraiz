/**
 * TESTE OFICIAL COMPLETO — MODAL "CONFIRMAR GOL" & PREVENÇÃO DE DUPLICAÇÃO
 *
 * Valida o ciclo completo do modal de confirmação de gol e todos os 10 cenários obrigatórios:
 * 1. Abrir modal de gol.
 * 2. Selecionar jogador.
 * 3. Clicar uma vez em Confirmar.
 * 4. Modal fecha imediatamente após sucesso.
 * 5. Placar aumenta 1.
 * 6. Timeline recebe exatamente 1 gol.
 * 7. Clicar rapidamente várias vezes durante o processamento: apenas 1 gol registrado.
 * 8. Abrir modal novamente: botão restaurado/habilitado, seleção limpa.
 * 9. Simular erro do Supabase: modal permanece aberto, botão volta a funcionar, nenhum gol duplicado.
 * 10. Evento Realtime do gol não duplica o gol local.
 *
 * Além de validar as regras estruturais e CSS (.modal-card centralizado, mobile, etc).
 */

import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Utils } from '../js/utils.js';
import { supabase } from '../js/supabaseClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup Mock do LocalStorage e DOM para execução em Node.js
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
  let innerHtmlVal = '';
  let textContentVal = '';
  let parsedPlayerBtns = [];

  const elem = {
    id,
    tagName: tag.toUpperCase(),
    style: {},
    dataset,
    disabled: false,
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},

    get textContent() {
      return textContentVal;
    },
    set textContent(val) {
      textContentVal = String(val);
    },

    get innerHTML() {
      return innerHtmlVal;
    },
    set innerHTML(val) {
      innerHtmlVal = String(val);
      // Auto-parse .btn-select-player caso seja renderizado na lista
      if (innerHtmlVal.includes('btn-select-player')) {
        parsedPlayerBtns = [];
        const regex = /data-player-id="([^"]+)"\s+data-player-name="([^"]+)"/g;
        let m;
        while ((m = regex.exec(innerHtmlVal)) !== null) {
          const pId = m[1];
          const pName = m[2];
          const btn = createMockElement(`btn-player-${pId}`, 'button');
          btn.classList.add('btn-select-player');
          btn.dataset.playerId = pId;
          btn.dataset.playerName = pName;
          const radio = createMockElement(`radio-${pId}`, 'span');
          radio.classList.add('p-select-radio');
          radio.textContent = '○';
          btn.querySelector = (sel) => {
            if (sel === '.p-select-radio') return radio;
            return createMockElement();
          };
          parsedPlayerBtns.push(btn);
        }
      }
    },

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
    removeAttribute: (name) => { delete attrs[name]; },

    querySelectorAll: (sel) => {
      if (sel === '.btn-select-player') {
        return parsedPlayerBtns;
      }
      if (sel === '[data-close]') {
        const closeBtn = createMockElement('close-btn', 'button');
        closeBtn.hasDataClose = true;
        return [closeBtn];
      }
      if (sel === '.btn-remove-goal') {
        return [];
      }
      return [];
    },

    querySelector: (sel) => {
      const idMatch = sel.match(/^#([\w-]+)/);
      if (idMatch) {
        const targetId = idMatch[1];
        if (!domStore[targetId]) domStore[targetId] = createMockElement(targetId);
        return domStore[targetId];
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
  querySelectorAll: (sel) => {
    if (sel.includes('.modal.active')) {
      const modal = domStore['modal-goal-author'];
      return (modal && modal.classList.contains('active')) ? [modal] : [];
    }
    return [];
  },
  querySelector: (sel) => {
    if (sel.includes('.modal.active')) {
      const modal = domStore['modal-goal-author'];
      return (modal && modal.classList.contains('active')) ? modal : null;
    }
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
  console.log('BATERIA DE TESTES — MODAL "CONFIRMAR GOL" (10 CENÁRIOS)');
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

  // 1. SETUP DE DADOS COM SUPABASE AUTENTICADO
  console.log('--- ETAPA 1: Setup do Futebol, Times e Autenticação Supabase ---');
  Storage.init();
  const testFut = { id: 'c0000000-0000-4000-8000-000000000003', nome: 'Fut Modal Test', admin_id: 'admin_123' };
  Storage.currentFutebol = testFut;
  Storage.userRole = 'ADMIN';

  // Configura sessão ativa e RLS no mock do Supabase
  const mockAdminUser = { id: 'admin_123', email: 'admin@modaltest.com' };
  const mockSession = { user: mockAdminUser, access_token: 'mock_token_admin_123' };
  localStorage.setItem('familia_fut_current_session', JSON.stringify(mockSession));
  localStorage.setItem('familia_fut_supabase_db', JSON.stringify({
    futebois: [testFut],
    futebol_admins: [{ id: 'adm_link_1', futebol_id: testFut.id, user_id: mockAdminUser.id, role: 'admin' }],
    partida_ao_vivo: []
  }));

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
  Partidas.state.status = 'running';
  Partidas.state.isActive = true;

  assert(Storage.getTeams().team1.players.length === 5, 'Time 1 possui exatamente 5 atletas');
  assert(Storage.getTeams().team2.players.length === 5, 'Time 2 possui exatamente 5 atletas');

  // 2. CENÁRIO 1: ABERTURA DO MODAL DE GOL
  console.log('\n--- CENÁRIO 1: Abrir Modal de Gol para Time 1 ---');
  Partidas.abrirModalSeletorGol('team1');

  const modal = document.getElementById('modal-goal-author');
  assert(!!modal, 'Elemento #modal-goal-author instanciado');
  assert(modal.classList.contains('active'), 'Modal marcado com a classe "active"');
  assert(modal.innerHTML.includes('modal-card'), 'HTML do modal contém a classe robusta .modal-card');
  assert(modal.innerHTML.includes('REGISTRAR GOL'), 'Título REGISTRAR GOL presente no HTML');
  assert(modal.innerHTML.includes('Quem marcou o gol?'), 'Subtítulo "Quem marcou o gol?" presente');

  // 3. REGRA DOS 5 JOGADORES DO TIME 1
  console.log('\n--- CENÁRIO 2: Restrição aos 5 Jogadores do Time 1 e Seleção ---');
  const listEl = domStore['modal-goal-players-list'];
  const playerBtns = listEl.querySelectorAll('.btn-select-player');
  assert(playerBtns.length === 5, `Exatamente 5 botões de jogadores renderizados (total: ${playerBtns.length})`);

  const btnConfirm = domStore['btn-confirm-goal'];
  const btnCancel = domStore['btn-cancel-goal'];
  assert(btnConfirm.disabled === true, 'Botão CONFIRMAR GOL inicia desabilitado');
  assert(btnConfirm.textContent === 'CONFIRMAR GOL', 'Texto inicial do botão é "CONFIRMAR GOL"');

  // 4. CANCELAMENTO SEM GOL
  console.log('\n--- TESTE CANCELAR: Fecha sem registrar gol ---');
  btnCancel.onclick();
  assert(!modal.classList.contains('active'), 'Modal fechou ao cancelar');
  assert(Partidas.state.homeScore === 0, 'Placar segue 0');
  assert(Partidas.state.goals.length === 0, 'Nenhum gol gravado');

  // 5. CENÁRIOS 2, 3, 4, 5, 6: SELEÇÃO, CONFIRMAÇÃO ÚNICA, FECHAMENTO, PLACAR E TIMELINE
  console.log('\n--- CENÁRIOS 2 a 6: Seleção, Confirmação, Fechamento, Placar e Timeline ---');
  Partidas.abrirModalSeletorGol('team1');
  const team1Btns = domStore['modal-goal-players-list'].querySelectorAll('.btn-select-player');
  const player2Btn = team1Btns[1]; // Carlos Meia

  // Clica no jogador 2
  player2Btn.onclick();
  assert(btnConfirm.disabled === false, 'Botão habilitado após selecionar jogador Carlos Meia');
  assert(player2Btn.classList.contains('selected'), 'Jogador Carlos Meia está com classe "selected"');

  // Clica uma vez em Confirmar Gol
  const promiseConfirm1 = btnConfirm.onclick();
  assert(btnConfirm.disabled === true, 'Botão imediatamente desabilitado ao iniciar confirmação');
  assert(btnConfirm.textContent === 'Registrando...', 'Texto alterado temporariamente para "Registrando..."');

  await promiseConfirm1;

  assert(!modal.classList.contains('active'), 'Cenário 4: Modal fechou imediatamente após sucesso');
  assert(modal.style.display === 'none', 'Modal está com style.display = "none"');
  assert(Partidas.state.homeScore === 1, 'Cenário 5: Placar aumentou exatamente 1 (atual: 1)');
  assert(Partidas.state.awayScore === 0, 'Placar do Time 2 segue 0');
  assert(Partidas.state.goals.length === 1, 'Cenário 6: Timeline recebeu exatamente 1 gol');
  assert(Partidas.state.goals[0].playerName === 'Carlos Meia', 'Autor registrado é Carlos Meia');
  assert(Partidas.state.goals[0].teamId === 'team1', 'Gol associado ao time1');

  // 6. CENÁRIO 7: CLICAR RAPIDAMENTE VÁRIAS VEZES DURANTE O PROCESSAMENTO (DOUBLE-CLICK LOCK)
  console.log('\n--- CENÁRIO 7: Proteção contra Duplo Clique / Múltiplos Cliques Rápidos ---');
  Partidas.abrirModalSeletorGol('team1');
  const team1BtnsRound2 = domStore['modal-goal-players-list'].querySelectorAll('.btn-select-player');
  team1BtnsRound2[0].onclick(); // João Atacante

  assert(domStore['btn-confirm-goal'].disabled === false, 'Botão habilitado para João Atacante');

  // Simula múltiplos cliques rápidos em rajada
  const pClick1 = domStore['btn-confirm-goal'].onclick();
  const pClick2 = domStore['btn-confirm-goal'].onclick();
  const pClick3 = domStore['btn-confirm-goal'].onclick();
  const pClick4 = domStore['btn-confirm-goal'].onclick();

  await Promise.all([pClick1, pClick2, pClick3, pClick4]);

  assert(Partidas.state.homeScore === 2, `Cenário 7: Apenas 1 gol foi adicionado apesar de 4 cliques rápidos (placar: ${Partidas.state.homeScore})`);
  assert(Partidas.state.goals.length === 2, `Timeline contém exatamente 2 gols no total (total: ${Partidas.state.goals.length})`);
  assert(!modal.classList.contains('active'), 'Modal fechou normalmente após a confirmação');

  // 7. CENÁRIO 8: REABRIR O MODAL NOVAMENTE (ESTADO LIMPO E FUNCIONAL)
  console.log('\n--- CENÁRIO 8: Reabrir modal novamente — Botão restaurado e seleção limpa ---');
  Partidas.abrirModalSeletorGol('team2');

  const btnConfirmReopen = domStore['btn-confirm-goal'];
  assert(btnConfirmReopen.textContent === 'CONFIRMAR GOL', 'Texto do botão é "CONFIRMAR GOL"');
  assert(btnConfirmReopen.disabled === true, 'Botão inicia desabilitado para nova seleção');

  const team2Btns = domStore['modal-goal-players-list'].querySelectorAll('.btn-select-player');
  const anySelected = team2Btns.some(b => b.classList.contains('selected'));
  assert(!anySelected, 'Nenhum jogador está pré-selecionado (seleção limpa)');

  // Seleciona jogador do Time 2 e confirma que habilita
  team2Btns[0].onclick(); // Marcos Atacante
  assert(btnConfirmReopen.disabled === false, 'Botão habilitou normalmente após selecionar Marcos Atacante');

  // Cancela para manter o estado
  domStore['btn-cancel-goal'].onclick();
  assert(!modal.classList.contains('active'), 'Modal fechado pelo botão cancelar');

  // 8. CENÁRIO 9: SIMULAR ERRO DO SUPABASE (MODAL PERMANECE ABERTO, RETRY PERMITIDO, SEM DUPLICATA)
  console.log('\n--- CENÁRIO 9: Simular Erro do Supabase (Fail-Safe e Retry) ---');
  Partidas.abrirModalSeletorGol('team2');
  const team2BtnsRetry = domStore['modal-goal-players-list'].querySelectorAll('.btn-select-player');
  team2BtnsRetry[1].onclick(); // Felipe Meia

  const scoreBeforeError = Partidas.state.awayScore;
  const goalsBeforeError = Partidas.state.goals.length;

  // Intercepta e simula falha temporária no Supabase
  const originalSave = Storage.saveLiveMatch;
  Storage.saveLiveMatch = async () => {
    throw new Error('Supabase network failure (503 Service Unavailable)');
  };

  // Clica em confirmar com falha simulada
  await domStore['btn-confirm-goal'].onclick();

  assert(modal.classList.contains('active'), 'Cenário 9: Modal PERMANECE aberto após erro do Supabase');
  assert(domStore['btn-confirm-goal'].textContent === 'CONFIRMAR GOL', 'Texto do botão restaurado para "CONFIRMAR GOL"');
  assert(domStore['btn-confirm-goal'].disabled === false, 'Botão volta a ficar habilitado para permitir retry');
  assert(Partidas.state.awayScore === scoreBeforeError, `Placar NÃO foi incrementado indevidamente (score: ${Partidas.state.awayScore})`);
  assert(Partidas.state.goals.length === goalsBeforeError, `Nenhum gol duplicado/fantasma criado na timeline (goals: ${Partidas.state.goals.length})`);

  // Restaura o Supabase para normal e clica novamente no retry
  Storage.saveLiveMatch = originalSave;
  await domStore['btn-confirm-goal'].onclick();

  assert(!modal.classList.contains('active'), 'Modal fechou com sucesso após tentativa bem-sucedida');
  assert(Partidas.state.awayScore === scoreBeforeError + 1, `Placar atualizado para 1 após retry (awayScore: ${Partidas.state.awayScore})`);
  assert(Partidas.state.goals.length === goalsBeforeError + 1, `Gol do Felipe Meia registrado no retry (total: ${Partidas.state.goals.length})`);

  // 9. CENÁRIO 10: EVENTO REALTIME NÃO PODE DUPLICAR O GOL LOCAL
  console.log('\n--- CENÁRIO 10: Evento Realtime do gol não duplica gol local ---');
  const currentGoalsCount = Partidas.state.goals.length;
  const currentPayload = Partidas.getLivePayload();

  // Simula recebimento de evento Realtime vindo do Supabase com o mesmo payload
  Partidas.handleLiveUpdate(currentPayload);

  assert(Partidas.state.goals.length === currentGoalsCount, `Realtime preservou contagem exata de gols (${Partidas.state.goals.length})`);
  assert(Partidas.state.homeScore === 2 && Partidas.state.awayScore === 1, 'Placar inalterado após Realtime (2 x 1)');

  // 10. VALIDAÇÃO DE CSS E RESPONSIVIDADE
  console.log('\n--- ETAPA 11: Validação de Regras CSS (Posicionamento, Overflow, Mobile) ---');
  const cssContent = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

  assert(cssContent.includes('.modal,') && cssContent.includes('position: fixed;'), 'CSS modal tem position: fixed');
  assert(cssContent.includes('z-index: 9999;'), 'CSS modal tem z-index: 9999');
  assert(cssContent.includes('inset: 0;'), 'CSS modal tem inset: 0');
  assert(cssContent.includes('width: min(500px, 100%);'), 'CSS .modal-card tem width: min(500px, 100%)');
  assert(cssContent.includes('max-height: calc(100vh - 40px);'), 'CSS .modal-card tem max-height: calc(100vh - 40px)');
  assert(cssContent.includes('.modal-body') && cssContent.includes('overflow-y: auto;'), 'CSS .modal-body tem overflow-y: auto');
  assert(cssContent.includes('min-height: 0;'), 'CSS .modal-body tem min-height: 0');
  assert(cssContent.includes('@media (max-width: 480px)'), 'CSS possui media query mobile (360px - 480px)');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runModalGolTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
