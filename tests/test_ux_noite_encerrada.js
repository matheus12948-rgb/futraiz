/**
 * TESTES AUTOMATIZADOS: AJUSTE FINAL DE UX — NOITE ENCERRADA
 * 
 * Validação dos requisitos de UX:
 * 1. Card compacto "NOITE ENCERRADA" no topo da área da partida.
 * 2. Exibição de campeão e mensagem "Os 5 atletas receberam +1 Capa."
 * 3. Não mostrar partida com estado "PARTIDA 02 · AGUARDANDO INÍCIO".
 * 4. Não mostrar "SOMENTE LEITURA" ou "PARTIDA HISTÓRICA".
 * 5. Não mostrar controles (INICIAR, PAUSAR, RETOMAR, FINALIZAR, + GOL, escolha de adversário).
 * 6. Histórico preservado e partidas consultáveis na seção Histórico.
 * 7. Regras de negócio terminais mantidas.
 * 8. Nenhum toast automático ao carregar ou renderizar rodada FINISHED.
 * 9. Remoção de toasts com texto "somente leitura".
 * 10. Tela limpa com atalhos para Histórico, Tabela e Rankings.
 */

import assert from 'assert';
import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Utils } from '../js/utils.js';

let passed = 0;
let total = 0;

function pass(name) {
  passed++;
  total++;
  console.log(`  ✅ PASS: ${name}`);
}

// Setup Mock DOM
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
      if (idx >= 0) {
        children.splice(idx, 0, child);
      } else {
        children.unshift(child);
      }
      elem.firstChild = children[0] || null;
      return child;
    },
    setAttribute: (name, val) => { attrs[name] = val; },
    getAttribute: (name) => attrs[name] || null,
    querySelector: (sel) => {
      if (sel === '.match-setup') return domStore['match-setup'] || (domStore['match-setup'] = createMockElement('match-setup'));
      if (sel === '.scoreboard') return domStore['scoreboard'] || (domStore['scoreboard'] = createMockElement('scoreboard'));
      if (sel.includes('match-goals-timeline') || sel.includes('.timeline')) return domStore['timeline-card'] || (domStore['timeline-card'] = createMockElement('timeline-card'));
      if (sel === '#btn-night-finished-history') return createMockElement('btn-night-finished-history', 'button');
      if (sel === '#btn-night-finished-table') return createMockElement('btn-night-finished-table', 'button');
      if (sel === '#btn-night-finished-rankings') return createMockElement('btn-night-finished-rankings', 'button');
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
  querySelectorAll: () => [],
  querySelector: (sel) => null,
  body: {
    appendChild: (child) => child
  },
  addEventListener: () => {}
};

global.window = {
  App: { navigateTo: () => {} }
};

// Monitoramento de Toasts
const toastsEmitted = [];
Utils.toast = (msg, type = 'info', duration = 3000) => {
  toastsEmitted.push({ msg, type });
};

async function runUXTests() {
  console.log('================================================================');
  console.log('BATERIA DE TESTES: AJUSTE FINAL DE UX — NOITE ENCERRADA');
  console.log('================================================================\n');

  // Setup Storage
  const memoryStore = {};
  Storage._store = {
    getItem: (k) => memoryStore[k] || null,
    setItem: (k, v) => { memoryStore[k] = String(v); },
    removeItem: (k) => { delete memoryStore[k]; },
    clear: () => { Object.keys(memoryStore).forEach(k => delete memoryStore[k]); }
  };

  Storage.currentFutebol = { id: 'fut_ux_1', nome: 'Futebol UX' };
  Storage.userRole = 'ADMIN';

  const teams = {
    time_1: { id: 'time_1', name: 'Time 1', players: [{ id: 'p1', name: 'Jogador 1' }, { id: 'p2', name: 'Jogador 2' }, { id: 'p3', name: 'Jogador 3' }, { id: 'p4', name: 'Jogador 4' }, { id: 'p5', name: 'Jogador 5' }] },
    time_2: { id: 'time_2', name: 'Time 2', players: [{ id: 'p6', name: 'Jogador 6' }, { id: 'p7', name: 'Jogador 7' }, { id: 'p8', name: 'Jogador 8' }, { id: 'p9', name: 'Jogador 9' }, { id: 'p10', name: 'Jogador 10' }] },
    time_3: { id: 'time_3', name: 'Time 3', players: [] },
    time_4: { id: 'time_4', name: 'Time 4', players: [] }
  };
  Storage.saveTeams(teams);

  const round = {
    id: 'rodada_ux_1',
    numero: 1,
    status: 'FINISHED',
    dateKey: '2026-10-06',
    campeaoTimeId: 'time_1',
    campeaoTimeNome: 'Time 1',
    teams
  };
  Storage.saveCurrentRound(round);

  const matches = [
    {
      id: 'm1',
      roundId: 'rodada_ux_1',
      dateKey: '2026-10-06',
      order: 1,
      homeTeamId: 'time_1',
      awayTeamId: 'time_2',
      homeScore: 2,
      awayScore: 0,
      winner: 'time_1',
      loser: 'time_2',
      status: 'finished'
    }
  ];
  Storage.saveMatches(matches);

  // --------------------------------------------------------------------------
  console.log('--- TESTE 1: Renderizar tela com rodada FINISHED sem toast automático ---');
  toastsEmitted.length = 0;
  Partidas.restoreOrInitMatch();
  Partidas.render();

  assert.strictEqual(toastsEmitted.length, 0, 'Nenhum toast deve ser emitido automaticamente');
  pass('1. Nenhum toast automático ao carregar ou renderizar rodada FINISHED.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 2: Card compacto "NOITE ENCERRADA" no topo da tela ---');
  const finishedContainer = domStore['night-finished-container'];
  assert(finishedContainer, 'Container de noite encerrada deve existir no DOM');
  assert.strictEqual(finishedContainer.style.display, 'block', 'Container deve estar visível');
  assert(finishedContainer.innerHTML.includes('NOITE ENCERRADA'), 'Deve conter o título NOITE ENCERRADA');
  assert(finishedContainer.innerHTML.includes('Campeão:'), 'Deve exibir o Campeão');
  assert(finishedContainer.innerHTML.includes('TIME 1'), 'Nome do campeão Time 1 deve estar no card');
  assert(finishedContainer.innerHTML.includes('Os 5 atletas receberam +1 Capa.'), 'Mensagem de 5 Capas deve estar presente');
  pass('2. Card compacto "NOITE ENCERRADA" exibido com Campeão e mensagem de Capas.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 3: Ocultação de elementos da partida e scoreboard ---');
  const setupEl = domStore['match-setup'];
  const sbEl = domStore['scoreboard'];
  const timelineEl = domStore['timeline-card'];
  const bannerEl = domStore['match-quem-ganha-fica-banner'];
  const nightEndSec = domStore['night-end-control-section'];

  assert.strictEqual(setupEl?.style?.display, 'none', 'Setup da partida (.match-setup) deve estar oculto');
  assert.strictEqual(sbEl?.style?.display, 'none', 'Scoreboard da partida (.scoreboard) deve estar oculto');
  assert.strictEqual(timelineEl?.style?.display, 'none', 'Linha do tempo da partida deve estar oculta');
  assert.strictEqual(bannerEl?.style?.display, 'none', 'Banner de próximo adversário deve estar oculto');
  assert.strictEqual(nightEndSec?.style?.display, 'none', 'Seção de controle de encerramento inferior deve estar oculta');
  pass('3. Placar, cronômetro, controles e banners de confronto ocultos na tela.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 4: Não exibir "PARTIDA 02 · AGUARDANDO INÍCIO" ---');
  assert(!finishedContainer.innerHTML.includes('AGUARDANDO INÍCIO'), 'Card não deve conter AGUARDANDO INÍCIO');
  assert(!finishedContainer.innerHTML.includes('PARTIDA 02'), 'Card não deve exibir PARTIDA 02');
  pass('4. Não exibe "PARTIDA 02 · AGUARDANDO INÍCIO".');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 5: Não exibir textos "SOMENTE LEITURA" ou "PARTIDA HISTÓRICA" ---');
  assert(!finishedContainer.innerHTML.includes('SOMENTE LEITURA'), 'Não deve exibir SOMENTE LEITURA');
  assert(!finishedContainer.innerHTML.includes('somente leitura'), 'Não deve exibir somente leitura');
  assert(!finishedContainer.innerHTML.includes('PARTIDA HISTÓRICA'), 'Não deve exibir PARTIDA HISTÓRICA');
  assert(!finishedContainer.innerHTML.includes('HISTÓRICO ·'), 'Não deve rotular partida como histórico dentro da tela');
  pass('5. Não exibe "SOMENTE LEITURA", "PARTIDA HISTÓRICA" ou equivalentes.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 6: Preservação de registros e consulta no Histórico ---');
  const storedMatches = Storage.getMatches();
  assert.strictEqual(storedMatches.length, 1, 'Partidas realizadas devem ser mantidas intactas');
  assert.strictEqual(storedMatches[0].winner, 'time_1', 'Vencedor mantido');
  assert(finishedContainer.innerHTML.includes('Ver Histórico de Partidas'), 'Deve conter atalho para o Histórico');
  assert(finishedContainer.innerHTML.includes('Ver Tabela Final'), 'Deve conter atalho para a Tabela');
  pass('6. Registros das partidas preservados e atalhos limpos presentes.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 7: Funções de alteração não emitem toast de "somente leitura" ---');
  toastsEmitted.length = 0;
  Partidas.setDuration(10);
  Partidas.resetTimer();
  Partidas.removerGol('g1');
  Partidas.solicitarFinalizacao();

  const hadSomenteLeitura = toastsEmitted.some(t => t.msg.includes('somente leitura'));
  assert.strictEqual(hadSomenteLeitura, false, 'Nenhuma função deve exibir toast com somente leitura');
  pass('7. Toasts com texto "somente leitura" foram completamente eliminados.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 8: Regras de negócio terminais mantidas ---');
  toastsEmitted.length = 0;
  Partidas.startOrResumeMatch();
  assert.strictEqual(toastsEmitted[0]?.msg, 'Esta noite já foi encerrada. Não é possível iniciar uma nova partida.');

  toastsEmitted.length = 0;
  Partidas.abrirModalSeletorGol('time_1');
  assert.strictEqual(toastsEmitted[0]?.msg, 'Esta noite já foi encerrada. Não é possível registrar novos gols.');
  pass('8. Regras de negócio e bloqueios terminais permanecem 100% ativos.');

  // --------------------------------------------------------------------------
  console.log('\n--- TESTE 9: Nova rodada ativa restaura tela de partida normal ---');
  const round2 = {
    id: 'rodada_ux_2',
    numero: 2,
    status: 'ACTIVE',
    dateKey: '2026-10-07',
    teams
  };
  Storage.saveCurrentRound(round2);
  Partidas.restoreOrInitMatch();
  Partidas.render();

  assert.strictEqual(finishedContainer.style.display, 'none', 'Container de noite encerrada deve ser ocultado');
  assert.strictEqual(setupEl.style.display, '', 'Setup deve voltar a ser exibido');
  assert.strictEqual(sbEl.style.display, '', 'Scoreboard deve voltar a ser exibido');
  pass('9. Tela volta ao normal para nova rodada em andamento (ACTIVE).');

  console.log('\n================================================================');
  console.log(`BATERIA UX CONCLUÍDA: ${passed}/${total} TESTES PASSARAM | 0 FALHARAM`);
  console.log('================================================================\n');
}

runUXTests().catch(e => {
  console.error('❌ Falha nos testes de UX:', e);
  process.exit(1);
});
