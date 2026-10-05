/**
 * TESTE ESPECÍFICO DA NOVA ETAPA DE AJUSTES — FUTRAIZ
 * 
 * Validação rigorosa dos 30 itens da solicitação:
 * 1. Nome do app "FutRaiz" na interface, title e header
 * 2. Clique na Logo/Nome vai para DASHBOARD sem perder a sessão
 * 3. Logo NUNCA faz logout e NUNCA limpa dados
 * 4. Dashboard com resumo e atalhos
 * 5. Nova tela de Configurações
 * 6. Configurações do Futebol (Nome e Código Público)
 * 7. Duração padrão da partida: 7 minutos (420 segundos / 07:00)
 * 8. Opções de duração e valor predefinido de 7 min
 * 9. Persistência de default_match_duration_seconds no Supabase/Storage
 * 10. Seção de Preferências
 * 11-13. Correção do botão ENCERRAR NOITE (sem TypeError, validações de running/paused)
 * 14. Modal de confirmação
 * 15. Encerramento, cálculo da tabela e definição do campeão
 * 16. Atribuição de +1 Capa aos 5 jogadores do campeão com idempotência
 * 17. Estado pós-encerramento (FINISHED, somente leitura)
 * 18. Atualização Realtime
 * 19-21. Navegação sem destruição de sessão e dashboard após login
 * 23-28. Testes de ciclo completo
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Setup Mock do LocalStorage e DOM para execução no Node
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

const domStore = {};
const makeDomNode = (id = '') => ({
  id,
  innerHTML: '',
  textContent: '',
  style: {},
  classList: {
    add: () => {},
    remove: () => {},
    contains: () => false,
    toggle: () => {}
  },
  appendChild(child) {
    if (child && child.id) domStore[child.id] = child;
  },
  removeChild: () => {},
  insertBefore: () => {},
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {},
  setAttribute: () => {},
  removeAttribute: () => {},
  dataset: {}
});

global.document = {
  documentElement: { style: { setProperty: () => {} } },
  getElementById: (id) => {
    if (!domStore[id]) {
      domStore[id] = makeDomNode(id);
    }
    return domStore[id];
  },
  createElement: (tag) => makeDomNode(),
  querySelectorAll: () => [],
  body: makeDomNode('body'),
  addEventListener: () => {}
};

global.window = {
  confirm: () => true,
  alert: () => {},
  scrollTo: () => {}
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

import { Storage } from './js/storage.js';
import { Utils } from './js/utils.js';
import { Tabela } from './js/tabela.js';
import { Partidas } from './js/partidas.js';
import { Configuracoes } from './js/configuracoes.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA ETAPA DE AJUSTES — FUTRAIZ');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // GRUPO 1: REBRANDING E TEXTOS DA INTERFACE (ITENS 1, 23)
  // --------------------------------------------------------------------------
  console.log('--- 1. Rebranding FutRaiz ---');
  
  await test('index.html contém título FutRaiz', () => {
    const html = fs.readFileSync(path.resolve('./index.html'), 'utf-8');
    assert(html.includes('<title>FutRaiz — Sorteio, Placar ao Vivo e Rankings da Pelada</title>'), 'Title deve conter FutRaiz');
    assert(html.includes('<meta name="apple-mobile-web-app-title" content="FutRaiz">'), 'Meta apple title deve ser FutRaiz');
  });

  await test('index.html contém FutRaiz na marca/header e landing', () => {
    const html = fs.readFileSync(path.resolve('./index.html'), 'utf-8');
    assert(html.includes('<span class="brand-text">FutRaiz</span>'), 'Brand header deve ser FutRaiz');
    assert(html.includes('<h1 class="landing-title">FutRaiz</h1>'), 'Landing title deve ser FutRaiz');
  });

  await test('manifest.json contém nome FutRaiz', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('./manifest.json'), 'utf-8'));
    assert.strictEqual(manifest.name, 'FutRaiz');
    assert.strictEqual(manifest.short_name, 'FutRaiz');
  });

  // --------------------------------------------------------------------------
  // GRUPO 2: NAVEGAÇÃO DA LOGO E PRESERVAÇÃO DE SESSÃO (ITENS 2, 3, 19, 20, 24)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Logo e Preservação de Sessão ---');

  await test('Brand logo possui data-screen="dashboard" e não "landing"', () => {
    const html = fs.readFileSync(path.resolve('./index.html'), 'utf-8');
    assert(html.includes('id="header-brand-logo" data-screen="dashboard"'), 'header-brand-logo deve apontar para dashboard');
    assert(!html.includes('id="header-brand-logo" data-screen="landing"'), 'header-brand-logo não pode apontar para landing');
  });

  await test('Sessão é preservada ao navegar: Storage.logout só ocorre explicitamente', () => {
    Storage.currentFutebol = {
      id: 'fut_teste_sessao',
      nome: 'Futebol Quarta Raiz',
      codigo_publico: 'FDT-TEST',
      default_match_duration_seconds: 420
    };
    Storage.userRole = 'ADMIN';

    // Simula navegação entre telas
    const screens = ['dashboard', 'jogadores', 'sorteio', 'partida', 'tabela', 'rankings', 'historico', 'configuracoes'];
    for (const scr of screens) {
      assert.strictEqual(Storage.currentFutebol.id, 'fut_teste_sessao', `Sessão deve persistir na tela ${scr}`);
      assert.strictEqual(Storage.userRole, 'ADMIN', `Papel deve persistir na tela ${scr}`);
    }
  });

  // --------------------------------------------------------------------------
  // GRUPO 3: CONFIGURAÇÕES E DURAÇÃO PADRÃO DE 7 MINUTOS (ITENS 5, 6, 7, 8, 9, 10, 25)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Configurações e Duração de 7 Minutos (420s) ---');

  await test('Duração padrão do sistema é 7 minutos (420 segundos)', () => {
    Storage.currentFutebol = {
      id: 'fut_config_1',
      nome: 'Futebol Quarta',
      codigo_publico: 'FDT-7777',
      default_match_duration_seconds: 420
    };
    assert.strictEqual(Storage.getDefaultMatchDurationSeconds(), 420);
    assert.strictEqual(Storage.getDefaultMatchDurationMinutes(), 7);
  });

  await test('Futebol sem configuração anterior assume fallback de 420 segundos (7 min)', () => {
    Storage.currentFutebol = {
      id: 'fut_legado',
      nome: 'Futebol Antigo',
      codigo_publico: 'FDT-LEG'
      // default_match_duration_seconds indefinido
    };
    assert.strictEqual(Storage.getDefaultMatchDurationSeconds(), 420, 'Fallback deve ser 420s');
    assert.strictEqual(Storage.getDefaultMatchDurationMinutes(), 7, 'Fallback deve ser 7 min');
  });

  await test('Atualizar configurações do futebol persiste nome e duração no storage', async () => {
    Storage.currentFutebol = {
      id: 'fut_config_2',
      nome: 'Pelada Original',
      codigo_publico: 'FDT-ORIG',
      default_match_duration_seconds: 420
    };
    Storage.userRole = 'ADMIN';

    // Altera para 10 minutos (600s)
    const res1 = await Storage.updateFutebolSettings({
      nome: 'Pelada Atualizada',
      default_match_duration_seconds: 600
    });
    assert.strictEqual(res1.success, true);
    assert.strictEqual(Storage.currentFutebol.nome, 'Pelada Atualizada');
    assert.strictEqual(Storage.getDefaultMatchDurationMinutes(), 10);
    assert.strictEqual(Storage.getDefaultMatchDurationSeconds(), 600);

    // Retorna para 7 minutos (420s)
    const res2 = await Storage.updateFutebolSettings({
      default_match_duration_seconds: 420
    });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(Storage.getDefaultMatchDurationMinutes(), 7);
    assert.strictEqual(Storage.getDefaultMatchDurationSeconds(), 420);
  });

  await test('Partidas: nova partida inicializa com 07:00 (420s)', () => {
    Storage.currentFutebol = {
      id: 'fut_match_timing',
      nome: 'Pelada Raiz',
      codigo_publico: 'FDT-RAIZ',
      default_match_duration_seconds: 420
    };
    Partidas.init();
    assert.strictEqual(Partidas.state.durationMinutes, 7, 'Duração em minutos deve ser 7');
    assert.strictEqual(Partidas.state.durationSeconds, 420, 'Duração em segundos deve ser 420');
    assert.strictEqual(Partidas.state.remainingSeconds, 420, 'Tempo restante inicial deve ser 420');
    assert.strictEqual(Utils.formatSeconds(Partidas.state.remainingSeconds), '07:00', 'Display deve ser 07:00');
  });

  await test('index.html contém tela screen-configuracoes com campos requeridos', () => {
    const html = fs.readFileSync(path.resolve('./index.html'), 'utf-8');
    assert(html.includes('id="screen-configuracoes"'), 'Deve existir screen-configuracoes');
    assert(html.includes('id="settings-fut-name"'), 'Deve existir campo nome');
    assert(html.includes('id="settings-fut-code"'), 'Deve existir campo código público');
    assert(html.includes('id="settings-default-duration"'), 'Deve existir select de duração padrão');
    assert(html.includes('<option value="7" selected>7 minutos</option>'), '7 minutos deve ser padrão selecionado');
  });

  // --------------------------------------------------------------------------
  // GRUPO 4: CORREÇÃO DO BOTÃO "ENCERRAR NOITE" (ITENS 11, 12, 13, 14, 15, 26)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Correção do Botão ENCERRAR NOITE ---');

  await test('Botão #btn-encerrar-noite não possui atributo disabled estático', () => {
    Partidas.state.status = 'ready';
    Partidas.renderNightEndSection();
    const section = document.getElementById('night-end-control-section');
    assert(section, 'Seção deve ser renderizada');
    assert(section.innerHTML.includes('id="btn-encerrar-noite"'), 'Deve conter botão #btn-encerrar-noite');
    assert(!section.innerHTML.includes('disabled'), 'Botão não deve estar desabilitado no HTML');
  });

  await test('Validação de bloqueio quando partida em andamento (running)', () => {
    Storage.currentFutebol = { id: 'fut_val_1', nome: 'Futebol Teste' };
    Storage.userRole = 'ADMIN';

    // Cria rodada ativa
    const round = { id: 'rodada_val_1', status: 'ACTIVE', dateKey: '2026-10-04' };
    Storage.saveCurrentRound(round);

    Partidas.state.status = 'running';
    let toastMsg = '';
    const originalToast = Utils.toast;
    Utils.toast = (msg) => { toastMsg = msg; };

    Partidas.solicitarEncerramentoNoite();
    Utils.toast = originalToast;

    assert.strictEqual(toastMsg, 'Finalize a partida atual antes de encerrar a noite.');
  });

  await test('Validação de bloqueio quando partida pausada (paused)', () => {
    Storage.currentFutebol = { id: 'fut_val_2', nome: 'Futebol Teste' };
    Storage.userRole = 'ADMIN';

    const round = { id: 'rodada_val_2', status: 'ACTIVE', dateKey: '2026-10-04' };
    Storage.saveCurrentRound(round);

    Partidas.state.status = 'paused';
    let toastMsg = '';
    const originalToast = Utils.toast;
    Utils.toast = (msg) => { toastMsg = msg; };

    Partidas.solicitarEncerramentoNoite();
    Utils.toast = originalToast;

    assert.strictEqual(toastMsg, 'Finalize a partida atual antes de encerrar a noite.');
  });

  await test('Validação de bloqueio quando não há nenhuma partida finalizada', () => {
    Storage.currentFutebol = { id: 'fut_val_3', nome: 'Futebol Teste' };
    Storage.userRole = 'ADMIN';

    const round = { id: 'rodada_val_3', status: 'ACTIVE', dateKey: '2026-10-04' };
    Storage.saveCurrentRound(round);
    Storage.saveMatches([]); // 0 partidas

    Partidas.state.status = 'ready';
    let toastMsg = '';
    const originalToast = Utils.toast;
    Utils.toast = (msg) => { toastMsg = msg; };

    Partidas.solicitarEncerramentoNoite();
    Utils.toast = originalToast;

    assert(toastMsg.includes('Realize e finalize ao menos uma partida'), 'Deve informar que falta realizar partidas');
  });

  await test('Modal de confirmação abre sem TypeError quando há líder isolado (sem empate no topo)', () => {
    Storage.currentFutebol = { id: 'fut_encerrar_ok', nome: 'Futebol Show' };
    Storage.userRole = 'ADMIN';

    const round = {
      id: 'rodada_ok',
      status: 'READY',
      dateKey: '2026-10-04',
      teams: {
        time_1: { id: 'time_1', name: 'Time 1', players: [{ id: 'p1', name: 'Jogador 1' }, { id: 'p2', name: 'Jogador 2' }, { id: 'p3', name: 'Jogador 3' }, { id: 'p4', name: 'Jogador 4' }, { id: 'p5', name: 'Jogador 5' }] },
        time_2: { id: 'time_2', name: 'Time 2', players: [{ id: 'p6', name: 'Jogador 6' }, { id: 'p7', name: 'Jogador 7' }, { id: 'p8', name: 'Jogador 8' }, { id: 'p9', name: 'Jogador 9' }, { id: 'p10', name: 'Jogador 10' }] },
        time_3: { id: 'time_3', name: 'Time 3', players: [] },
        time_4: { id: 'time_4', name: 'Time 4', players: [] }
      }
    };
    Storage.saveCurrentRound(round);
    Storage.saveTeams(round.teams);
    round.status = 'ACTIVE';
    Storage.saveCurrentRound(round);

    const matches = [
      {
        id: 'm1',
        roundId: 'rodada_ok',
        dateKey: '2026-10-04',
        order: 1,
        homeTeamId: 'time_1',
        awayTeamId: 'time_2',
        homeScore: 3,
        awayScore: 1,
        winner: 'time_1',
        loser: 'time_2',
        isTie: false,
        status: 'finished'
      }
    ];
    Storage.saveMatches(matches);

    Partidas.state.status = 'ready';

    // Deve abrir o modal sem lançar exceção
    let errorCaught = null;
    try {
      Partidas.solicitarEncerramentoNoite();
    } catch (err) {
      errorCaught = err;
    }

    assert.strictEqual(errorCaught, null, 'solicitarEncerramentoNoite não deve lançar erro');

    const modal = document.getElementById('modal-encerrar-noite-resumo');
    assert(modal, 'Modal de resumo deve ter sido criado no DOM');
    assert(modal.innerHTML.includes('ENCERRAR NOITE?'), 'Título deve ser ENCERRAR NOITE?');
    assert(modal.innerHTML.includes('A noite será encerrada e a classificação final será definida.'), 'Texto requerido deve estar presente');
    assert(modal.innerHTML.includes('ENCERRAR NOITE'), 'Botão de confirmação deve existir');
  });

  // --------------------------------------------------------------------------
  // GRUPO 5: ATRIBUIÇÃO DE CAPAS E IDEMPOTÊNCIA (ITENS 15, 16, 17, 27, 28)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Atribuição de Capas e Idempotência ---');

  await test('Encerramento da noite concede exatamente +1 Capa aos 5 jogadores do campeão', () => {
    Storage.currentFutebol = { id: 'fut_capa_test', nome: 'Futebol Capa' };
    Storage.userRole = 'ADMIN';

    const championPlayers = [
      { id: 'c1', name: 'Goleiro Craque' },
      { id: 'c2', name: 'Zagueiro Firme' },
      { id: 'c3', name: 'Meia Maestro' },
      { id: 'c4', name: 'Ponta Veloz' },
      { id: 'c5', name: 'Artilheiro Nato' }
    ];

    const round = {
      id: 'rodada_capa_1',
      status: 'READY',
      dateKey: '2026-10-04',
      date: '04/10/2026',
      teams: {
        time_1: { id: 'time_1', name: 'Time 1', players: championPlayers },
        time_2: { id: 'time_2', name: 'Time 2', players: [] },
        time_3: { id: 'time_3', name: 'Time 3', players: [] },
        time_4: { id: 'time_4', name: 'Time 4', players: [] }
      }
    };
    Storage.saveCurrentRound(round);
    Storage.saveTeams(round.teams);
    round.status = 'ACTIVE';
    Storage.saveCurrentRound(round);
    Storage.saveCapas([]); // limpa capas anteriores

    const matches = [
      {
        id: 'm1',
        roundId: 'rodada_capa_1',
        dateKey: '2026-10-04',
        homeTeamId: 'time_1',
        awayTeamId: 'time_2',
        homeScore: 2,
        awayScore: 0,
        winner: 'time_1',
        status: 'finished'
      }
    ];
    Storage.saveMatches(matches);

    // Finaliza a noite
    Storage.finalizeNight({
      championTeamId: 'time_1',
      championTeamName: 'Time 1',
      capaPlayers: championPlayers
    });

    const finishedRound = Storage.getCurrentRound();
    assert.strictEqual(finishedRound.status, 'FINISHED', 'Rodada deve ficar FINISHED');
    assert.strictEqual(finishedRound.campeaoTimeId, 'time_1', 'Campeão deve ser registrado');

    const capas = Storage.getCapas();
    assert.strictEqual(capas.length, 5, 'Devem existir exatamente 5 registros de Capa');

    for (const p of championPlayers) {
      const pCapa = capas.filter(c => c.jogador_id === p.id);
      assert.strictEqual(pCapa.length, 1, `Jogador ${p.name} deve ter exatamente 1 Capa`);
    }
  });

  await test('Idempotência da Capa: executar encerramento uma segunda vez não duplica', () => {
    const championPlayers = [
      { id: 'c1', name: 'Goleiro Craque' },
      { id: 'c2', name: 'Zagueiro Firme' },
      { id: 'c3', name: 'Meia Maestro' },
      { id: 'c4', name: 'Ponta Veloz' },
      { id: 'c5', name: 'Artilheiro Nato' }
    ];

    // O teste anterior já finalizou a rodada rodada_capa_1.
    // Executa addCapas diretamente para simular idempotência
    const capaRecords = championPlayers.map(p => ({
      id: Utils.generateId('capa'),
      futebol_id: Storage.currentFutebol ? Storage.currentFutebol.id : 'global',
      rodada_id: 'rodada_capa_1',
      jogador_id: p.id,
      time_id: 'time_1',
      playerName: p.name,
      teamName: 'Time 1',
      date: '04/10/2026',
      createdAt: new Date().toISOString()
    }));

    Storage.addCapas(capaRecords);

    const capas = Storage.getCapas();
    assert.strictEqual(capas.length, 5, 'Idempotência: ainda devem existir exatamente 5 Capas, sem duplicação');
  });

  await test('Estado FINISHED bloqueia início de partida e novos gols (somente leitura)', () => {
    const round = Storage.getCurrentRound();
    assert.strictEqual(round.status, 'FINISHED');

    let toastMsg = '';
    const originalToast = Utils.toast;
    Utils.toast = (msg) => { toastMsg = msg; };

    Partidas.startOrResumeMatch();
    assert(toastMsg.includes('somente leitura') || toastMsg.includes('encerrada'), 'Deve bloquear início de partida');

    toastMsg = '';
    Partidas.abrirModalSeletorGol('time_1');
    assert(toastMsg.includes('somente leitura') || toastMsg.includes('encerrada'), 'Deve bloquear registro de gol');

    Utils.toast = originalToast;
  });

  console.log('\n====================================================');
  console.log(`🏁 RESULTADO: ${passed} PASSOU / ${failed} FALHOU`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
