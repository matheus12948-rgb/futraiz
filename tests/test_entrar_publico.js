/**
 * BATERIA DE TESTES: ENTRAR EM UM FUTEBOL PELO CÓDIGO PÚBLICO
 * Validação rigorosa dos 8 itens exigidos:
 * 1. Código público válido encontra o futebol.
 * 2. Código público em letras minúsculas encontra o futebol.
 * 3. Código com espaços encontra o futebol.
 * 4. Código inexistente retorna "Futebol não encontrado".
 * 5. UUID interno continua sendo utilizado internamente.
 * 6. Dois futebol diferentes continuam isolados.
 * 7. Usuário público consegue consultar o futebol sem autenticação, respeitando RLS.
 * 8. Nenhum INSERT/UPDATE/DELETE público foi liberado.
 */

// Mock de localStorage e DOM para execução no ambiente Node.js
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
global.document = {
  documentElement: { style: { setProperty: () => {} } },
  getElementById: () => null,
  querySelectorAll: () => [],
  body: { classList: { add: () => {}, remove: () => {} } }
};

import { Storage } from '../js/storage.js';
import { supabase } from '../js/supabaseClient.js';

let passed = 0;
let failed = 0;

function assert(condition, testNum, description) {
  if (condition) {
    console.log(`  ✅ [Teste ${testNum}] PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ [Teste ${testNum}] FAIL: ${description}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('TESTES DE ENTRADA EM FUTEBOL PELO ID/CÓDIGO PÚBLICO');
  console.log('================================================================\n');

  localStorage.clear();

  // 1. Criar futebol 1 para o teste
  const res1 = await Storage.createFutebol({
    nome: 'Futebol Quarta-Feira Real',
    adminNome: 'Organizador Quarta',
    email: 'quarta@futebol.com',
    password: 'senhaSegura123'
  });
  const fut1 = res1.futebol;
  console.log(`Futebol 1 criado: Nome="${fut1.nome}", CodigoPublico="${fut1.codigo_publico}", UUID="${fut1.id}"`);

  // Salvar jogadores para o Futebol 1 usando o UUID interno
  await Storage.savePlayers([
    { id: 'p1_1', name: 'Atleta Quarta 1', stars: 5 },
    { id: 'p1_2', name: 'Atleta Quarta 2', stars: 4 }
  ]);

  // 2. Criar futebol 2 para validar isolamento
  const res2 = await Storage.createFutebol({
    nome: 'Pelada de Sábado Independente',
    adminNome: 'Organizador Sábado',
    email: 'sabado@futebol.com',
    password: 'senhaSegura123'
  });
  const fut2 = res2.futebol;
  console.log(`Futebol 2 criado: Nome="${fut2.nome}", CodigoPublico="${fut2.codigo_publico}", UUID="${fut2.id}"`);

  await Storage.savePlayers([
    { id: 'p2_1', name: 'Atleta Sabado 1', stars: 3 }
  ]);

  console.log('\n--- ITEM 1: Código público válido encontra o futebol ---');
  const resValid = await Storage.loadPublicFutebol(fut1.codigo_publico);
  assert(
    resValid.success === true &&
    resValid.futebol.id === fut1.id &&
    resValid.futebol.codigo_publico === fut1.codigo_publico &&
    Storage.isPublicViewer() === true,
    1,
    `Código oficial "${fut1.codigo_publico}" localizou perfeitamente o Futebol 1`
  );

  console.log('\n--- ITEM 2: Código público em letras minúsculas encontra o futebol ---');
  const lowerCode = fut1.codigo_publico.toLowerCase();
  const resLower = await Storage.loadPublicFutebol(lowerCode);
  assert(
    resLower.success === true &&
    resLower.futebol.id === fut1.id &&
    resLower.futebol.codigo_publico === fut1.codigo_publico,
    2,
    `Código minúsculo "${lowerCode}" normalizou e localizou o Futebol 1`
  );

  console.log('\n--- ITEM 3: Código com espaços antes/depois ou formatação encontra o futebol ---');
  const spacedCode = `   ${fut1.codigo_publico}   `;
  const resSpaced = await Storage.loadPublicFutebol(spacedCode);
  assert(
    resSpaced.success === true &&
    resSpaced.futebol.id === fut1.id,
    3.1,
    `Código com espaços nas bordas "${spacedCode}" normalizou e localizou o Futebol 1`
  );

  const mixedCode = `  ${fut1.codigo_publico.toLowerCase()}  `;
  const resMixed = await Storage.loadPublicFutebol(mixedCode);
  assert(
    resMixed.success === true &&
    resMixed.futebol.id === fut1.id,
    3.2,
    `Código com espaços e minúsculas "${mixedCode}" localizou o Futebol 1`
  );

  // Variação sem hífen ou com espaço interno ex: "FDT 7K29" ou sufixo "7k29"
  const suffixOnly = fut1.codigo_publico.replace('FDT-', '').toLowerCase();
  const resSuffix = await Storage.loadPublicFutebol(suffixOnly);
  assert(
    resSuffix.success === true &&
    resSuffix.futebol.id === fut1.id,
    3.3,
    `Sufixo isolado "${suffixOnly}" normalizou para "${fut1.codigo_publico}" e localizou o Futebol 1`
  );

  console.log('\n--- ITEM 4: Código inexistente retorna "Futebol não encontrado" ---');
  const resNonExistent = await Storage.loadPublicFutebol('FDT-XXXX');
  assert(
    resNonExistent.success === false &&
    resNonExistent.error === 'Futebol não encontrado. Verifique o código e tente novamente.',
    4.1,
    `Código inexistente FDT-XXXX retornou erro amigável esperado`
  );

  const resBlank = await Storage.loadPublicFutebol('    ');
  assert(
    resBlank.success === false &&
    resBlank.error === 'Futebol não encontrado. Verifique o código e tente novamente.',
    4.2,
    `Código vazio/espaços retornou erro amigável esperado`
  );

  console.log('\n--- ITEM 5: UUID interno continua sendo utilizado internamente ---');
  assert(
    Storage.currentFutebol.id === fut1.id,
    5.1,
    `Storage.currentFutebol.id preserva o UUID original (${fut1.id})`
  );
  const playersFut1 = Storage.getPlayers();
  assert(
    playersFut1.length === 2 && playersFut1[0].name === 'Atleta Quarta 1',
    5.2,
    `Jogadores vinculados via UUID interno (futebol_id = ${fut1.id}) foram carregados corretamente`
  );

  console.log('\n--- ITEM 6: Dois futebol diferentes continuam 100% isolados ---');
  const resPub2 = await Storage.loadPublicFutebol(fut2.codigo_publico);
  assert(
    resPub2.success === true &&
    resPub2.futebol.id === fut2.id &&
    Storage.currentFutebol.id === fut2.id,
    6.1,
    `Entrada no Futebol 2 via código "${fut2.codigo_publico}" bem-sucedida`
  );
  const playersFut2 = Storage.getPlayers();
  assert(
    playersFut2.length === 1 && playersFut2[0].name === 'Atleta Sabado 1',
    6.2,
    `Futebol 2 exibe exclusivamente seus próprios atletas (sem vazamento de Futebol 1)`
  );

  console.log('\n--- ITEM 7: Usuário público consulta futebol sem autenticação (respeitando RLS) ---');
  const isAnonymous = Storage.isPublicViewer();
  const isAdmin = Storage.isAdmin();
  assert(
    isAnonymous === true && !isAdmin && Storage.userRole === 'PUBLIC_VIEWER',
    7.1,
    `Sessão pública opera sem privilégios administrativos (modo PUBLIC_VIEWER)`
  );
  const { data: pubDbData, error: pubDbError } = await supabase
    .from('futebois')
    .select('id, nome, codigo_publico')
    .eq('codigo_publico', fut1.codigo_publico)
    .single();
  assert(
    !pubDbError && pubDbData && pubDbData.id === fut1.id,
    7.2,
    `SELECT público anônimo funciona perfeitamente via RLS no Supabase`
  );

  console.log('\n--- ITEM 8: Nenhum INSERT/UPDATE/DELETE público foi liberado ---');
  let insertBlocked = false;
  try {
    Storage.savePlayers([{ id: 'hacker_1', name: 'Atleta Invasor', stars: 5 }]);
  } catch (err) {
    insertBlocked = true;
  }
  assert(
    insertBlocked === true,
    8.1,
    `Storage bloqueia qualquer mutação de atletas por usuário público (assertAdmin)`
  );

  // Verificação direta no Supabase Mock com RLS
  const { error: rlsInsertError } = await supabase
    .from('jogadores')
    .insert([{ id: 'hacker_db', futebol_id: fut1.id, nome: 'Invasor' }]);
  assert(
    rlsInsertError !== null,
    8.2,
    `Supabase RLS bloqueia estritamente INSERT direto de anônimo`
  );

  const { error: rlsUpdateError } = await supabase
    .from('futebois')
    .update({ nome: 'Futebol Hackeado' })
    .eq('id', fut1.id);
  assert(
    rlsUpdateError !== null,
    8.3,
    `Supabase RLS bloqueia estritamente UPDATE de anônimo na tabela futebois`
  );

  const { error: rlsDeleteError } = await supabase
    .from('futebois')
    .delete()
    .eq('id', fut1.id);
  assert(
    rlsDeleteError !== null,
    8.4,
    `Supabase RLS bloqueia estritamente DELETE de anônimo na tabela futebois`
  );

  console.log('================================================================');
  console.log(`RESULTADO FINAL: ${passed} PASSADOS / ${failed} FALHADOS`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
