/**
 * BATERIA DE TESTES: AS ESTRELAS DOS JOGADORES DEVEM ESTAR SEMPRE DISPONÍVEIS PARA EDIÇÃO PELO ADMIN
 * 
 * Validação rigorosa dos 13 passos exigidos:
 * 1. Criar jogador com 3 estrelas.
 * 2. Alterar para 4 estrelas.
 * 3. Recarregar página.
 * 4. Confirmar que permanece com 4.
 * 5. Fazer carga histórica.
 * 6. Fechar carga histórica.
 * 7. Alterar estrelas novamente.
 * 8. Confirmar que continua funcionando.
 * 9. Criar nova rodada.
 * 10. Alterar estrelas.
 * 11. Confirmar persistência.
 * 12. Entrar como usuário público.
 * 13. Confirmar que estrelas aparecem, mas não podem ser editadas.
 */

import { Storage } from './js/storage.js';
import { Partidas } from './js/partidas.js';
import { Tabela } from './js/tabela.js';
import { Rankings } from './js/rankings.js';
import { Jogadores } from './js/jogadores.js';
import { Configuracoes } from './js/configuracoes.js';
import { Utils } from './js/utils.js';
import { supabase } from './js/supabaseClient.js';

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
    value: '',
    disabled: false,
    style: {},
    dataset,
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    focus: () => {},
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
  getElementById: (id) => {
    if (!domStore[id]) domStore[id] = createMockElement(id);
    return domStore[id];
  },
  querySelector: (sel) => {
    const idMatch = sel.match(/^#([\w-]+)/);
    if (idMatch) {
      const i = idMatch[1];
      if (!domStore[i]) domStore[i] = createMockElement(i);
      return domStore[i];
    }
    return createMockElement('generic');
  },
  querySelectorAll: (sel) => [],
  addEventListener: () => {}
};

global.window = {
  location: { hash: '' },
  addEventListener: () => {},
  Tabela: Tabela,
  Rankings: Rankings,
  Storage: Storage,
  Jogadores: Jogadores
};

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [Teste ${totalTests}] PASS: ${message}`);
  } else {
    console.error(`  ❌ [Teste ${totalTests}] FAIL: ${message}`);
    throw new Error(`Falha no teste: ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('TESTES: ESTRELAS DOS JOGADORES SEMPRE EDITÁVEIS PELO ADMIN');
  console.log('================================================================\n');

  // SETUP: Criação de Futebol
  const resFut = await Storage.createFutebol({
    nome: 'Futebol das Estrelas',
    adminNome: 'Admin Master',
    email: 'admin@estrelas.com',
    password: 'senhaForte123'
  });
  assert(resFut.success === true, 'Futebol criado com sucesso');
  const fut = resFut.futebol;

  // --------------------------------------------------------------------------
  console.log('\n--- PASSO 1: Criar jogador com 3 estrelas ---');
  const joao = {
    id: 'ply_joao',
    name: 'João Silva',
    stars: 3,
    gols_historicos_iniciais: 0,
    capas_historicas_iniciais: 0
  };
  Storage.savePlayers([joao]);

  const pInitial = Storage.getPlayers().find(p => p.id === 'ply_joao');
  assert(pInitial !== undefined, 'João cadastrado com sucesso');
  assert(pInitial.stars === 3, 'João começa exatamente com 3 estrelas');

  // --------------------------------------------------------------------------
  console.log('\n--- PASSO 2: Alterar para 4 estrelas ---');
  await Storage.updatePlayerStars('ply_joao', 4);

  const pStep2 = Storage.getPlayers().find(p => p.id === 'ply_joao');
  assert(pStep2.stars === 4, 'Estrelas de João alteradas com sucesso para 4');

  // Verifica persistência no Supabase
  const { data: dbPlayerStep2 } = await supabase
    .from('jogadores')
    .select('*')
    .eq('id', 'ply_joao')
    .single();
  assert(dbPlayerStep2 && dbPlayerStep2.estrelas === 4, 'Supabase armazena estrelas = 4');

  // --------------------------------------------------------------------------
  console.log('\n--- PASSOS 3 e 4: Recarregar página e confirmar que permanece com 4 ---');
  Storage.restoreSession();
  const pAfterReload = Storage.getPlayers().find(p => p.id === 'ply_joao');
  assert(pAfterReload.stars === 4, 'Após reload, João permanece rigorosamente com 4 estrelas');

  // --------------------------------------------------------------------------
  console.log('\n--- PASSO 5: Fazer carga histórica (12 gols e 3 Capas) ---');
  assert(Storage.isHistoricoInicialAberto() === true, 'Carga histórica inicial está aberta (true)');
  await Storage.saveHistoricalData([
    { id: 'ply_joao', gols_historicos_iniciais: 12, capas_historicas_iniciais: 3 }
  ]);

  const pWithHist = Storage.getPlayers().find(p => p.id === 'ply_joao');
  assert(pWithHist.stars === 4, 'Estrelas permanecem 4 durante a carga histórica');
  assert(pWithHist.gols_historicos_iniciais === 12, 'João possui 12 gols históricos gravados');
  assert(pWithHist.capas_historicas_iniciais === 3, 'João possui 3 Capas históricas gravadas');

  // --------------------------------------------------------------------------
  console.log('\n--- PASSO 6: Fechar carga histórica ---');
  await Storage.finalizeHistoricalLoad();
  assert(Storage.isHistoricoInicialAberto() === false, 'Carga histórica agora está FINALIZADA (false)');

  // --------------------------------------------------------------------------
  console.log('\n--- PASSOS 7 e 8: Alterar estrelas novamente após fechamento ---');
  // Admin altera João de 4 para 5 estrelas
  await Storage.updatePlayerStars('ply_joao', 5);

  const pStep8 = Storage.getPlayers().find(p => p.id === 'ply_joao');
  assert(pStep8.stars === 5, 'Alteração após fechamento bem-sucedida: João agora tem 5 estrelas!');
  assert(pStep8.gols_historicos_iniciais === 12, 'Gols históricos NÃO foram alterados nem perdidos (continua 12)');
  assert(pStep8.capas_historicas_iniciais === 3, 'Capas históricas NÃO foram alteradas nem perdidas (continua 3)');

  // Também testa via Jogadores.setPlayerStars
  Jogadores.setPlayerStars('ply_joao', 4);
  const pViaModule = Storage.getPlayers().find(p => p.id === 'ply_joao');
  assert(pViaModule.stars === 4, 'Jogadores.setPlayerStars alterou com sucesso para 4 estrelas');

  // Retorna para 5 estrelas via Jogadores.quickUpdateStars (+1)
  Jogadores.quickUpdateStars('ply_joao', 1);
  const pViaQuick = Storage.getPlayers().find(p => p.id === 'ply_joao');
  assert(pViaQuick.stars === 5, 'Jogadores.quickUpdateStars(+1) alterou com sucesso para 5 estrelas');

  // --------------------------------------------------------------------------
  console.log('\n--- PASSOS 9, 10 e 11: Criar nova rodada e alterar estrelas ---');
  const round1 = {
    id: 'rd_estrelas_01',
    numero: 1,
    dateKey: '2026-10-05',
    date: '05/10/2026',
    status: 'ACTIVE',
    teams: {
      time_1: { id: 'time_1', name: 'Time 1', color: '#2563eb', players: [pViaQuick] }
    }
  };
  Storage.saveCurrentRound(round1);
  assert(Storage.getCurrentRound() !== null, 'Nova rodada criada e ativa');

  // Altera estrelas durante a rodada (ex: de 5 para 3 estrelas)
  await Storage.updatePlayerStars('ply_joao', 3);

  const pInRound = Storage.getPlayers().find(p => p.id === 'ply_joao');
  assert(pInRound.stars === 3, 'Estrelas alteradas durante rodada ativa: agora 3 estrelas');

  // Confirma sincronização no time da rodada
  const activeRoundAfterStarUpdate = Storage.getCurrentRound();
  const joaoInTeam = activeRoundAfterStarUpdate.teams.time_1.players.find(p => p.id === 'ply_joao');
  assert(joaoInTeam && joaoInTeam.stars === 3, 'Time da rodada ativa reflete imediatamente as 3 estrelas');

  // Confirma persistência após reload
  Storage.restoreSession();
  const pPersistReload = Storage.getPlayers().find(p => p.id === 'ply_joao');
  assert(pPersistReload.stars === 3, 'Persistência confirmada após reload: João continua com 3 estrelas');

  // --------------------------------------------------------------------------
  console.log('\n--- PASSOS 12 e 13: Entrar como usuário público ---');
  const resPub = await Storage.loadPublicFutebol(fut.codigo_publico);
  assert(resPub.success === true, 'Usuário público acessou o futebol');
  assert(Storage.isPublicViewer() === true, 'Papel ativo é PUBLIC_VIEWER');

  // Confirma que público visualiza as 3 estrelas
  const publicPlayers = Storage.getPlayers();
  const joaoPublic = publicPlayers.find(p => p.id === 'ply_joao');
  assert(joaoPublic && joaoPublic.stars === 3, 'Público visualiza corretamente João com 3 estrelas');

  // Renderiza estrelas em SVG (sem emojis)
  const renderedSvg = Utils.renderStars(joaoPublic.stars);
  assert(renderedSvg.includes('star-icon'), 'Estrelas renderizadas em SVG minimalista');
  assert(!renderedSvg.includes('⭐'), 'Nenhum emoji utilizado na renderização');

  // Tenta alterar estrelas como público via Storage.updatePlayerStars -> DEVE SER BLOQUEADO
  let publicEditBlocked = false;
  try {
    await Storage.updatePlayerStars('ply_joao', 5);
  } catch (err) {
    publicEditBlocked = true;
  }
  assert(publicEditBlocked === true, 'Público bloqueado ao tentar updatePlayerStars (assertAdmin)');

  // Tenta alterar estrelas como público via Storage.savePlayers -> DEVE SER BLOQUEADO
  let publicSaveBlocked = false;
  try {
    Storage.savePlayers([{ ...joaoPublic, stars: 5 }]);
  } catch (err) {
    publicSaveBlocked = true;
  }
  assert(publicSaveBlocked === true, 'Público bloqueado ao tentar savePlayers (assertAdmin)');

  // Tenta alterar estrelas diretamente no Supabase sem estar autenticado como Admin -> RLS BLOQUEIA
  const { error: rlsPublicError } = await supabase
    .from('jogadores')
    .update({ estrelas: 5 })
    .eq('id', 'ply_joao');
  assert(rlsPublicError !== null, 'Supabase RLS bloqueou UPDATE direto de estrelas por usuário anônimo');

  // Confirma que no banco continua 3
  const { data: dbFinal } = await supabase
    .from('jogadores')
    .select('*')
    .eq('id', 'ply_joao')
    .single();
  assert(dbFinal.estrelas === 3, 'No banco de dados, João permanece protegido com 3 estrelas');

  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${totalTests} | PASSOU: ${passedTests} | FALHOU: 0`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Erro durante a execução dos testes:', err);
  process.exit(1);
});
