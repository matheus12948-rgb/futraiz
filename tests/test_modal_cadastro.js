/**
 * TESTES DO MODAL DE CADASTRO DE NOVO FUTEBOL
 * Valida o comportamento de UX e regras de fechamento/permanência do modal:
 * 1. Criação com sucesso -> Modal fecha automaticamente, form reseta, navega para dashboard
 * 2. Erro de RLS -> Modal permanece aberto, loading para, usuário pode corrigir
 * 3. Erro de Rate Limit -> Modal permanece aberto, loading para, mensagem amigável
 * 4. Erro de validação -> Modal permanece aberto, loading para
 * 5. Cliques repetidos / múltiplos -> Apenas uma criação é executada
 * 6. Limpeza completa: sem overlay residual, sem bloqueio de scroll, sem loading preso
 */

import { Storage } from '../js/storage.js';
import { Utils } from '../js/utils.js';
import { App } from '../js/app.js';

// Setup Mock do DOM
const elements = new Map();
const bodyClasses = new Set();

function makeMockElem(id, tagName = 'div') {
  const classes = new Set();
  const attrs = {};
  const listeners = {};
  const dataset = {};

  const elem = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    dataset,
    style: {},
    reset: function() {
      this.value = '';
    },
    setAttribute: (k, v) => { attrs[k] = v; },
    getAttribute: (k) => attrs[k] || null,
    removeAttribute: (k) => { delete attrs[k]; },
    classList: {
      add: (cls) => classes.add(cls),
      remove: (cls) => classes.delete(cls),
      contains: (cls) => classes.has(cls),
      toggle: (cls, force) => {
        if (force !== undefined) {
          if (force) classes.add(cls);
          else classes.delete(cls);
        } else {
          if (classes.has(cls)) classes.delete(cls);
          else classes.add(cls);
        }
      }
    },
    addEventListener: (evt, handler) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(handler);
    },
    dispatchEvent: async (event) => {
      const handlers = listeners[event.type] || [];
      for (const h of handlers) {
        await h(event);
      }
    }
  };

  elements.set(id, elem);
  return elem;
}

// Mock elements needed
const modalCreate = makeMockElem('modal-create-futebol', 'div');
const formCreate = makeMockElem('form-create-futebol', 'form');
const inputNome = makeMockElem('create-fut-name', 'input');
const inputAdmin = makeMockElem('create-fut-admin-name', 'input');
const inputEmail = makeMockElem('create-fut-email', 'input');
const inputPass = makeMockElem('create-fut-password', 'input');
const btnSubmit = makeMockElem('btn-submit-create-fut', 'button');
const btnOpenCreate = makeMockElem('btn-open-create-futebol', 'button');

// Screen and header elements
makeMockElem('screen-dashboard', 'div');
makeMockElem('screen-landing', 'div');
makeMockElem('header-futebol-info', 'div');
makeMockElem('header-futebol-code', 'div');
makeMockElem('header-active-fut-name', 'div');
makeMockElem('header-role-badge', 'div');
makeMockElem('desktop-nav', 'div');
makeMockElem('bottom-nav', 'div');

global.document = {
  getElementById: (id) => elements.get(id) || null,
  querySelector: (sel) => {
    if (sel.includes('.modal.active')) {
      for (const el of elements.values()) {
        if (el.classList.contains('modal') && el.classList.contains('active')) return el;
      }
      return null;
    }
    return null;
  },
  querySelectorAll: (sel) => {
    const res = [];
    if (sel === '.modal [data-close]' || sel === '.modal .modal-backdrop' || sel === '.app-screen' || sel === '[data-screen]') {
      return [];
    }
    return res;
  },
  body: {
    classList: {
      add: (cls) => bodyClasses.add(cls),
      remove: (cls) => bodyClasses.delete(cls),
      contains: (cls) => bodyClasses.has(cls),
      toggle: (cls, force) => {
        if (force !== undefined) {
          if (force) bodyClasses.add(cls);
          else bodyClasses.delete(cls);
        } else {
          if (bodyClasses.has(cls)) bodyClasses.delete(cls);
          else bodyClasses.add(cls);
        }
      }
    }
  }
};

global.window = {
  location: { hash: '#/' },
  scrollTo: () => {}
};

modalCreate.classList.add('modal');

let passed = 0;
let failed = 0;

function assert(cond, testNum, desc) {
  if (cond) {
    console.log(`  ✅ [Teste ${testNum}] PASS: ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [Teste ${testNum}] FAIL: ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('TESTES DE UX: MODAL DE CRIAÇÃO DE FUTEBOL E FLUXO DE SUBMISSÃO');
  console.log('================================================================\n');

  // Inicializa os bindings
  App.bindPlatformModals();

  // ----------------------------------------------------------------------------
  // TESTE 1: Abertura correta do Modal
  // ----------------------------------------------------------------------------
  console.log('--- ETAPA 1: Abertura do Modal de Cadastro ---');
  await btnOpenCreate.dispatchEvent({ type: 'click' });
  assert(modalCreate.classList.contains('active'), 1.1, 'Modal fica com a classe "active" ao clicar em Criar meu futebol');
  assert(document.body.classList.contains('modal-open'), 1.2, 'Document body recebe a classe "modal-open" para controlar scroll');

  // ----------------------------------------------------------------------------
  // TESTE 2: Erro de Validação -> Modal permanece ABERTO e loading para
  // ----------------------------------------------------------------------------
  console.log('\n--- ETAPA 2: Erro de Validação de Dados ---');
  // Força mock de erro de validação no Storage
  const originalCreate = Storage.createFutebol;
  Storage.createFutebol = async () => ({
    success: false,
    error: 'Nome do futebol é obrigatório.'
  });

  inputNome.value = '';
  inputAdmin.value = 'Carlos';
  inputEmail.value = 'carlos@teste.com';
  inputPass.value = '123456';

  await formCreate.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert(modalCreate.classList.contains('active'), 2.1, 'Modal CONTINUA ABERTO em erro de validação');
  assert(document.body.classList.contains('modal-open'), 2.2, 'Body mantém modal-open durante permanência do modal');
  assert(btnSubmit.disabled === false, 2.3, 'Botão de submit NÃO fica em loading permanente (disabled = false)');
  assert(formCreate.dataset.submitting === 'false', 2.4, 'Flag de submissão restaurada para permitir nova tentativa');

  // ----------------------------------------------------------------------------
  // TESTE 3: Erro de RLS -> Modal permanece ABERTO e loading para
  // ----------------------------------------------------------------------------
  console.log('\n--- ETAPA 3: Erro de RLS no Supabase ---');
  Storage.createFutebol = async () => ({
    success: false,
    error: 'RLS Error: New row violates row-level security policy for table "futebois".'
  });

  await formCreate.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert(modalCreate.classList.contains('active'), 3.1, 'Modal CONTINUA ABERTO em erro de política RLS');
  assert(btnSubmit.disabled === false, 3.2, 'Botão liberado do loading após erro de RLS');
  assert(formCreate.dataset.submitting === 'false', 3.3, 'Formulário pronto para edição após erro de RLS');

  // ----------------------------------------------------------------------------
  // TESTE 4: Erro de Rate Limit de E-mail -> Modal permanece ABERTO e loading para
  // ----------------------------------------------------------------------------
  console.log('\n--- ETAPA 4: Erro de Rate Limit de E-mail ---');
  Storage.createFutebol = async () => ({
    success: false,
    error: 'Limite temporário de envio de e-mails atingido. Aguarde alguns minutos e tente novamente.'
  });

  await formCreate.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert(modalCreate.classList.contains('active'), 4.1, 'Modal CONTINUA ABERTO em erro de rate limit');
  assert(btnSubmit.disabled === false, 4.2, 'Botão submit liberado após erro de rate limit');
  assert(formCreate.dataset.submitting === 'false', 4.3, 'Submissão destravada após rate limit');

  // ----------------------------------------------------------------------------
  // TESTE 5: Tentativas Múltiplas / Cliques Repetidos -> Apenas 1 execução
  // ----------------------------------------------------------------------------
  console.log('\n--- ETAPA 5: Prevenção de Duplo Clique e Cliques Repetidos ---');
  let executionCount = 0;
  let resolveCreation;
  const slowCreationPromise = new Promise(resolve => { resolveCreation = resolve; });

  Storage.createFutebol = async () => {
    executionCount++;
    await slowCreationPromise;
    return {
      success: true,
      futebol: { id: 'fut-uuid-123', nome: 'Futebol Teste', codigo_publico: 'FDT-TEST' }
    };
  };

  // Dispara a primeira submissão (inicia loading)
  const p1 = formCreate.dispatchEvent({ type: 'submit', preventDefault: () => {} });
  // Dispara segunda e terceira submissões simultâneas enquanto a primeira está pendente
  const p2 = formCreate.dispatchEvent({ type: 'submit', preventDefault: () => {} });
  const p3 = formCreate.dispatchEvent({ type: 'submit', preventDefault: () => {} });

  assert(btnSubmit.disabled === true, 5.1, 'Botão entra em estado disabled imediatamente ao iniciar submissão');
  assert(formCreate.dataset.submitting === 'true', 5.2, 'dataset.submitting está marcado como "true" durante o processamento');

  // Conclui a criação pendente
  resolveCreation();
  await Promise.all([p1, p2, p3]);

  assert(executionCount === 1, 5.3, `Apenas 1 chamada a Storage.createFutebol foi efetuada (obtido: ${executionCount})`);

  // ----------------------------------------------------------------------------
  // TESTE 6: Criação com Sucesso -> Modal FECHA automaticamente e limpa tudo
  // ----------------------------------------------------------------------------
  console.log('\n--- ETAPA 6: Fechamento Automático em Caso de Sucesso ---');
  assert(!modalCreate.classList.contains('active'), 6.1, 'Modal fecha automaticamente (classe "active" removida) SOMENTE após confirmação de sucesso');
  assert(!document.body.classList.contains('modal-open'), 6.2, 'Classe "modal-open" removida do body -> Scroll 100% liberado sem bloqueio');
  assert(modalCreate.getAttribute('aria-hidden') === 'true', 6.3, 'Aria-hidden definido como true no modal fechado');
  assert(btnSubmit.disabled === false, 6.4, 'Botão de submit restaurado');
  assert(formCreate.dataset.submitting === 'false', 6.5, 'Flag submitting restaurada');

  // Restaura Storage original
  Storage.createFutebol = originalCreate;

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES DO MODAL: ${passed} PASSOU / ${failed} FALHOU`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
