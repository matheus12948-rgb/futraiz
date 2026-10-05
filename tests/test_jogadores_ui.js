/**
 * BATERIA DE TESTES: TELA DE JOGADORES DO FUTRAIZ
 * Validação dos requisitos:
 * 1. Opção "Carregar 30 jogadores de exemplo" removida da interface de produção.
 * 2. Adicionar jogador atualiza a lista e o estado automaticamente.
 * 3. Contador de quantidade de jogadores é atualizado (JOGADORES 1 -> JOGADORES 2).
 * 4. Não há botões quadrados vazios: botões possuem ícones SVG dimensionados, títulos e aria-label.
 * 5. Ações dos botões existentes funcionam: alterar estrelas (- e +), editar e excluir com confirmação.
 * 6. Busca por nome e filtro por estrelas continuam operando perfeitamente.
 */

import fs from 'fs';
import path from 'path';

// Setup Mock do DOM e LocalStorage
const memoryStore = {};
global.localStorage = {
  getItem: (key) => memoryStore[key] || null,
  setItem: (key, val) => { memoryStore[key] = String(val); },
  removeItem: (key) => { delete memoryStore[key]; },
  clear: () => { Object.keys(memoryStore).forEach(k => delete memoryStore[k]); }
};

global.window = {
  location: { hash: '', origin: 'http://localhost:3000', pathname: '/' },
  confirm: () => true
};

function createMockElement(id = '', tag = 'div') {
  const classes = new Set();
  const children = [];
  const attrs = {};
  const dataset = {};
  const listeners = {};

  let _textContent = '';
  const elem = {
    id,
    tagName: tag.toUpperCase(),
    innerHTML: '',
    get textContent() { return _textContent; },
    set textContent(v) { _textContent = String(v); },
    value: '',
    disabled: false,
    style: {},
    dataset,
    focus: () => {},
    scrollIntoView: () => {},
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener: () => {},
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      if (listeners[type]) {
        listeners[type].forEach(fn => fn(evt));
      }
    },
    classList: {
      add: (cls) => classes.add(cls),
      remove: (cls) => classes.delete(cls),
      contains: (cls) => classes.has(cls),
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classes.has(cls)) classes.delete(cls); else classes.add(cls);
        } else if (force) classes.add(cls); else classes.delete(cls);
      }
    },
    setAttribute: (name, val) => { attrs[name] = val; },
    getAttribute: (name) => attrs[name] || null,
    removeAttribute: (name) => { delete attrs[name]; }
  };
  return elem;
}

const domElements = {
  'form-jogador': createMockElement('form-jogador', 'form'),
  'player-name': createMockElement('player-name', 'input'),
  'player-stars': createMockElement('player-stars', 'input'),
  'player-submit-btn': createMockElement('player-submit-btn', 'button'),
  'player-cancel-edit': createMockElement('player-cancel-edit', 'button'),
  'player-form-title': createMockElement('player-form-title', 'h3'),
  'player-form-card': createMockElement('player-form-card', 'div'),
  'players-total-count': createMockElement('players-total-count', 'span'),
  'players-status-badge': createMockElement('players-status-badge', 'span'),
  'players-search': createMockElement('players-search', 'input'),
  'players-filter-stars': createMockElement('players-filter-stars', 'select'),
  'players-list': createMockElement('players-list', 'div')
};

global.document = {
  documentElement: { style: { setProperty: () => {} } },
  body: { classList: { add: () => {}, remove: () => {} } },
  getElementById: (id) => domElements[id] || null,
  querySelector: () => null,
  querySelectorAll: () => []
};

import { Storage } from '../js/storage.js';
import { Jogadores } from '../js/jogadores.js';
import { Utils } from '../js/utils.js';

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

async function runTests() {
  console.log('================================================================');
  console.log('TESTES DA TELA DE JOGADORES (FUTRAIZ)');
  console.log('================================================================\n');

  localStorage.clear();

  // Cria futebol de teste
  const resFut = await Storage.createFutebol({
    nome: 'Futebol Teste Jogadores',
    adminNome: 'Administrador Teste',
    email: 'admin@jogadores.com',
    password: 'senhaSegura123'
  });

  // ----------------------------------------------------------------------------
  // TESTE 1: Remoção de "Carregar 30 jogadores de exemplo" do HTML
  // ----------------------------------------------------------------------------
  console.log('--- TESTE 1: Remoção de "Carregar 30 jogadores de exemplo" da interface ---');
  const indexHtml = fs.readFileSync(path.resolve('./index.html'), 'utf-8');
  assert(
    !indexHtml.includes('btn-load-demo-players'),
    'Botão #btn-load-demo-players não existe no index.html'
  );
  assert(
    !indexHtml.includes('Carregar 30 jogadores de exemplo'),
    'Texto "Carregar 30 jogadores de exemplo" não aparece no index.html'
  );
  assert(
    typeof Jogadores.loadDemoPlayers === 'function',
    'Método interno Jogadores.loadDemoPlayers preservado para testes automatizados'
  );

  // Inicializa módulo Jogadores
  Jogadores.init();

  // ----------------------------------------------------------------------------
  // TESTE 2: Adicionar primeiro jogador e verificar atualização automática
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTE 2: Adicionar Jogador e Atualização Automática ---');
  assert(domElements['players-total-count'].textContent === '0', 'Contador inicial é 0');

  domElements['player-name'].value = 'José Roberto';
  domElements['player-stars'].value = '5';

  await Jogadores.handleSave({ preventDefault: () => {} });

  assert(
    domElements['players-total-count'].textContent === '1',
    'Contador atualizou automaticamente para 1 (JOGADORES 1)'
  );
  assert(
    domElements['players-list'].innerHTML.includes('José Roberto'),
    'José Roberto renderizado imediatamente na lista'
  );
  assert(
    domElements['player-name'].value === '',
    'Campo de nome limpo automaticamente após cadastro com sucesso'
  );

  // ----------------------------------------------------------------------------
  // TESTE 3: Adicionar segundo jogador e verificar atualização automática
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTE 3: Adicionar Segundo Jogador e Atualização do Contador ---');
  domElements['player-name'].value = 'Carlos Zagueiro';
  domElements['player-stars'].value = '4';

  await Jogadores.handleSave({ preventDefault: () => {} });

  assert(
    domElements['players-total-count'].textContent === '2',
    'Contador atualizou automaticamente para 2 (JOGADORES 2)'
  );
  assert(
    domElements['players-list'].innerHTML.includes('Carlos Zagueiro'),
    'Carlos Zagueiro renderizado imediatamente na lista sem recarregar navegador'
  );

  // ----------------------------------------------------------------------------
  // TESTE 4: Investigação e Correção dos Botões na Linha do Jogador
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTE 4: Validação dos Botões da Linha do Jogador ---');
  const renderedHtml = domElements['players-list'].innerHTML;

  assert(
    renderedHtml.includes('data-action="dec-star"'),
    'Botão de diminuir estrela [-] presente'
  );
  assert(
    renderedHtml.includes('data-action="inc-star"'),
    'Botão de aumentar estrela [+] presente'
  );
  assert(
    renderedHtml.includes('data-action="edit"') && renderedHtml.includes('btn-edit'),
    'Botão Editar presente com data-action="edit"'
  );
  assert(
    renderedHtml.includes('data-action="delete"') && renderedHtml.includes('btn-delete'),
    'Botão Excluir presente com data-action="delete"'
  );

  // Verifica que os botões não são quadrados vazios (possuem SVG com dimensões ou use icon)
  assert(
    renderedHtml.includes('title="Editar jogador"') && renderedHtml.includes('aria-label="Editar José Roberto"'),
    'Botão Editar possui title e aria-label explícitos'
  );
  assert(
    renderedHtml.includes('title="Excluir jogador"') && renderedHtml.includes('aria-label="Excluir José Roberto"'),
    'Botão Excluir possui title e aria-label explícitos'
  );
  assert(
    renderedHtml.includes('<svg') && !renderedHtml.includes('<button type="button" class="btn-icon btn-sm btn-edit"></button>'),
    'Botões contêm ícones SVG válidos (não são quadrados vazios)'
  );

  // Validação no CSS de que .btn-icon possui display flex e svg com dimensões 14px
  const styleCss = fs.readFileSync(path.resolve('./css/style.css'), 'utf-8');
  assert(
    styleCss.includes('.btn-icon') && styleCss.includes('display: inline-flex'),
    'CSS .btn-icon possui display: inline-flex e centralização'
  );
  assert(
    styleCss.includes('.btn-icon svg'),
    'CSS possui regra explícita .btn-icon svg para dimensionar ícones'
  );

  // ----------------------------------------------------------------------------
  // TESTE 5: Alteração de Estrelas via Botões e Dropdown
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTE 5: Alteração de Estrelas ---');
  const players = Storage.getPlayers();
  const carlos = players.find(p => p.name === 'Carlos Zagueiro');
  assert(carlos.stars === 4, 'Carlos inicia com 4 estrelas');

  // Aumentar para 5
  Jogadores.quickUpdateStars(carlos.id, 1);
  const carlosAfterInc = Storage.getPlayers().find(p => p.id === carlos.id);
  assert(carlosAfterInc.stars === 5, 'Carlos agora tem 5 estrelas');

  // Tentar passar de 5 (bloqueado no teto)
  Jogadores.quickUpdateStars(carlos.id, 1);
  const carlosCapped = Storage.getPlayers().find(p => p.id === carlos.id);
  assert(carlosCapped.stars === 5, 'Estrelas limitadas a no máximo 5');

  // Diminuir para 4
  Jogadores.quickUpdateStars(carlos.id, -1);
  const carlosAfterDec = Storage.getPlayers().find(p => p.id === carlos.id);
  assert(carlosAfterDec.stars === 4, 'Carlos voltou para 4 estrelas após dec-star');

  // ----------------------------------------------------------------------------
  // TESTE 6: Edição de Jogador
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTE 6: Edição de Jogador ---');
  Jogadores.startEdit(carlos.id);
  assert(Jogadores.editingId === carlos.id, 'editingId definido para o atleta');
  assert(domElements['player-name'].value === 'Carlos Zagueiro', 'Formulário preenchido com nome do atleta');

  domElements['player-name'].value = 'Carlos Silva Zagueiro';
  await Jogadores.handleSave({ preventDefault: () => {} });

  const carlosUpdated = Storage.getPlayers().find(p => p.id === carlos.id);
  assert(
    carlosUpdated.name === 'Carlos Silva Zagueiro',
    'Nome atualizado com sucesso no Storage'
  );
  assert(
    domElements['players-list'].innerHTML.includes('Carlos Silva Zagueiro'),
    'Lista exibe imediatamente o nome editado'
  );

  // ----------------------------------------------------------------------------
  // TESTE 7: Exclusão de Jogador
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTE 7: Exclusão com Confirmação e Atualização de Quantidade ---');
  await Jogadores.deletePlayer(carlos.id);

  assert(
    domElements['players-total-count'].textContent === '1',
    'Contador diminuiu automaticamente para 1 após exclusão'
  );
  assert(
    !domElements['players-list'].innerHTML.includes('Carlos Silva Zagueiro'),
    'Carlos Silva Zagueiro removido da lista'
  );

  // ----------------------------------------------------------------------------
  // TESTE 8: Busca e Filtro de Jogadores
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTE 8: Busca e Filtros ---');
  // Cadastra outro jogador para testar filtro
  await Storage.addPlayer({ name: 'Lucas Atacante', stars: 2 });
  Jogadores.render();
  assert(domElements['players-total-count'].textContent === '2', 'Total de 2 jogadores');

  // Busca por 'José'
  domElements['players-search'].value = 'josé';
  Jogadores.render();
  assert(
    domElements['players-list'].innerHTML.includes('José Roberto') &&
    !domElements['players-list'].innerHTML.includes('Lucas Atacante'),
    'Busca por nome "josé" filtra a lista mantendo apenas o jogador correspondente'
  );

  // Limpa busca e filtra por 2 estrelas
  domElements['players-search'].value = '';
  domElements['players-filter-stars'].value = '2';
  Jogadores.render();
  assert(
    domElements['players-list'].innerHTML.includes('Lucas Atacante') &&
    !domElements['players-list'].innerHTML.includes('José Roberto'),
    'Filtro por 2 estrelas exibe apenas Lucas Atacante'
  );

  // Reseta filtros
  domElements['players-filter-stars'].value = '0';
  Jogadores.render();
  assert(
    domElements['players-list'].innerHTML.includes('José Roberto') &&
    domElements['players-list'].innerHTML.includes('Lucas Atacante'),
    'Filtro zerado exibe todos os jogadores'
  );

  console.log('================================================================');
  console.log(`RESULTADO FINAL: ${passed} PASSADOS / ${failed} FALHADOS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
