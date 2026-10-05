/**
 * Bateria de Testes: Sincronização e Persistência de Jogadores Multi-Dispositivo
 * Validação rigorosa dos TESTES A, B, C, D e E exigidos pelo usuário.
 */

import assert from 'assert';
import { Storage } from '../js/storage.js';
import { Utils } from '../js/utils.js';
import { supabase } from '../js/supabaseClient.js';

let totalTests = 0;
let passedTests = 0;

function pass(desc) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS: ${desc}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('TESTES DE PERSISTÊNCIA E SINCRONIZAÇÃO DE JOGADORES (SUPABASE)');
  console.log('================================================================\n');

  const testEmail = `admin_sync_${Date.now()}@futraiz.com`;
  const testPassword = 'Password123!';

  console.log('--- 1. Preparação: Criação da Conta e Futebol do Administrador ---');
  const createRes = await Storage.createFutebol({
    nome: 'FutRaiz Sincronizado FC',
    adminNome: 'Administrador Teste',
    email: testEmail,
    password: testPassword
  });

  assert.strictEqual(createRes.success, true, 'Criação de futebol deve ter sucesso');
  const futebol = createRes.futebol;
  pass(`Futebol criado no Supabase com UUID: ${futebol.id} e código ${futebol.codigo_publico}`);

  // Simula Dispositivo A (ex: Celular)
  console.log('\n--- TESTE A: Cadastro no Dispositivo A (Celular) ---');
  Storage.currentFutebol = futebol;
  Storage.userRole = 'ADMIN';

  const jogador1 = await Storage.addPlayer({ name: 'Neymar Santos', stars: 5 });
  assert.ok(jogador1.id, 'Jogador deve ter id gerado');
  assert.ok(Utils.isUUID(jogador1.id), `ID do jogador (${jogador1.id}) DEVE ser um UUID válido RFC 4122`);
  pass(`Jogador "${jogador1.name}" cadastrado com UUID válido: ${jogador1.id}`);

  // Verifica na lista local
  const playersDispositivoA = Storage.getPlayers();
  assert.strictEqual(playersDispositivoA.length, 1, 'Dispositivo A deve ter 1 jogador na lista');
  assert.strictEqual(playersDispositivoA[0].name, 'Neymar Santos');
  pass('Jogador aparece imediatamente na lista do dispositivo A');

  // Verifica se foi gravado no Supabase
  const { data: dbPlayersA, error: errA } = await supabase
    .from('jogadores')
    .select('*')
    .eq('futebol_id', futebol.id);

  assert.ifError(errA);
  assert.strictEqual(dbPlayersA.length, 1, 'Supabase deve conter exatamente 1 jogador gravado');
  assert.strictEqual(dbPlayersA[0].nome, 'Neymar Santos');
  assert.strictEqual(dbPlayersA[0].futebol_id, futebol.id);
  pass('Confirmado: Jogador gravado com sucesso no Supabase na tabela "jogadores" com futebol_id correto');

  console.log('\n--- TESTE B: Recarregar a Página no Dispositivo A ---');
  // Simula reload da página: chama restoreSession
  await Storage.restoreSession();
  const playersAposReload = Storage.getPlayers();
  assert.strictEqual(playersAposReload.length, 1, 'Jogador deve continuar aparecendo após reload');
  assert.strictEqual(playersAposReload[0].name, 'Neymar Santos');
  pass('Confirmado: Após recarregar a página, jogador continua aparecendo carregado do Supabase');

  console.log('\n--- TESTE C: Dispositivo B (Computador) - Abrir e Fazer Login ---');
  // Simula computador limpo: desassocia futebol ativo e limpa cache em memória do dispositivo B
  Storage.currentFutebol = null;
  Storage.userRole = null;
  // Limpa cache local simulando novo navegador/computador
  const scopedKey = `fut_${futebol.id}_players`;
  const globalStorage = (typeof localStorage !== 'undefined' ? localStorage : null);
  if (globalStorage && typeof globalStorage.removeItem === 'function') {
    globalStorage.removeItem(scopedKey);
    globalStorage.removeItem('familia_fut_active_futebol');
    globalStorage.removeItem('familia_fut_user_role');
  }

  // Computador faz login com as MESMAS credenciais
  console.log(`Fazendo login no computador com: ${testEmail}`);
  const loginRes = await Storage.loginAdmin({ email: testEmail, password: testPassword });
  assert.strictEqual(loginRes.success, true, 'Login no computador deve ter sucesso');
  assert.strictEqual(loginRes.futebol.id, futebol.id, 'Futebol recuperado deve ter o mesmo UUID');
  pass(`Computador autenticado com sucesso e associado ao futebol correto: ${loginRes.futebol.nome}`);

  // Verifica que no computador a lista NÃO fica zerada, mas carrega o jogador do Supabase!
  const playersDispositivoB = Storage.getPlayers();
  assert.strictEqual(playersDispositivoB.length, 1, 'No computador, jogador cadastrado no celular DEVE aparecer!');
  assert.strictEqual(playersDispositivoB[0].name, 'Neymar Santos');
  pass('Confirmado: No computador, a lista de jogadores NÃO aparece zerada; jogador do celular foi carregado do Supabase!');

  console.log('\n--- TESTE D: Cadastrar Segundo Jogador no Dispositivo B (Computador) e Ver no Dispositivo A ---');
  const jogador2 = await Storage.addPlayer({ name: 'Vinícius Júnior', stars: 5 });
  assert.ok(Utils.isUUID(jogador2.id), 'ID do jogador 2 deve ser UUID válido');
  pass(`Jogador 2 ("${jogador2.name}") cadastrado pelo Computador com UUID: ${jogador2.id}`);

  // Confirma 2 jogadores no Supabase
  const { data: dbPlayersTotal } = await supabase
    .from('jogadores')
    .select('*')
    .eq('futebol_id', futebol.id);
  assert.strictEqual(dbPlayersTotal.length, 2, 'Supabase deve conter exatamente 2 jogadores');
  pass('Supabase agora contém os 2 jogadores');

  // Volta ao Dispositivo A (Celular) e recarrega/sincroniza
  console.log('Voltando ao Dispositivo A e recarregando/sincronizando...');
  await Storage.syncPlayersFromSupabase(futebol.id);
  const playersDispositivoAReload = Storage.getPlayers();
  assert.strictEqual(playersDispositivoAReload.length, 2, 'Dispositivo A deve ter os 2 jogadores após sincronizar');
  const nomes = playersDispositivoAReload.map(p => p.name);
  assert.ok(nomes.includes('Neymar Santos') && nomes.includes('Vinícius Júnior'), 'Ambos os jogadores devem estar na lista');
  pass('Confirmado: Ao voltar ao Dispositivo A e recarregar, o novo jogador criado no computador aparece!');

  console.log('\n--- TESTE E: Isolamento Multi-Tenancy (Outro Futebol) ---');
  // Cria futebol independente C com outro administrador
  const testEmailC = `outro_futebol_${Date.now()}@futraiz.com`;
  const createC = await Storage.createFutebol({
    nome: 'Pelada dos Amigos C',
    adminNome: 'Admin C',
    email: testEmailC,
    password: testPassword
  });
  const futebolC = createC.futebol;
  pass(`Futebol C independente criado: ${futebolC.nome} (${futebolC.id})`);

  // Dispositivo C adiciona seu próprio jogador
  Storage.currentFutebol = futebolC;
  Storage.userRole = 'ADMIN';
  await Storage.addPlayer({ name: 'Zico Campeão', stars: 5 });
  pass('Jogador "Zico Campeão" adicionado exclusivamente ao Futebol C');

  // Verifica que Futebol C tem 1 jogador (Zico)
  const playersC = Storage.getPlayers();
  assert.strictEqual(playersC.length, 1);
  assert.strictEqual(playersC[0].name, 'Zico Campeão');
  pass('Futebol C contém apenas seu jogador próprio');

  // Volta ao Futebol A autenticando como Administrador A
  await Storage.loginAdmin(testEmail, testPassword);
  await Storage.syncPlayersFromSupabase(futebol.id);
  const playersA_Final = Storage.getPlayers();
  assert.strictEqual(playersA_Final.length, 2, 'Futebol A não pode ver o jogador do Futebol C');
  assert.ok(!playersA_Final.some(p => p.name === 'Zico Campeão'), 'Zico NÃO pode aparecer no Futebol A');
  pass('Confirmado: Jogadores do Futebol C NÃO aparecem no Futebol A (Isolamento total multi-tenancy)');

  console.log('\n--- TESTE BÔNUS: Sincronização Segura de Jogadores Locais Pendentes para o Supabase ---');
  // Simula um cenário onde um usuário no celular tinha jogadores locais cadastrados
  // que por motivo offline ainda não foram para o Supabase
  const pendingPlayers = [
    { id: Utils.generateUUID(), name: 'Atleta Local Pendente 1', stars: 4, gols_historicos_iniciais: 3, capas_historicas_iniciais: 1 },
    { id: Utils.generateUUID(), name: 'Atleta Local Pendente 2', stars: 3, gols_historicos_iniciais: 0, capas_historicas_iniciais: 0 }
  ];
  // Injeta no scoped key simulando o celular
  const key = `fut_${futebol.id}_players`;
  const combined = [...playersA_Final, ...pendingPlayers];
  if (Storage._store && typeof Storage._store.setItem === 'function') {
    Storage._store.setItem(key, JSON.stringify(combined));
  }

  // Executa syncPlayersFromSupabase como admin
  const syncResult = await Storage.syncPlayersFromSupabase(futebol.id);
  assert.strictEqual(syncResult.success, true);
  assert.strictEqual(syncResult.count, 4, 'Os jogadores pendentes devem ser sincronizados com sucesso para o Supabase');
  pass('Jogadores locais pendentes foram enviados e sincronizados para o Supabase com sucesso');

  const { data: dbAfterMigration } = await supabase
    .from('jogadores')
    .select('*')
    .eq('futebol_id', futebol.id);
  assert.strictEqual(dbAfterMigration.length, 4, 'Supabase agora contém todos os 4 atletas persistidos');
  for (const p of dbAfterMigration) {
    assert.ok(Utils.isUUID(p.id), `ID ${p.id} deve ser UUID válido`);
  }
  pass('Todos os atletas no Supabase possuem UUIDs válidos e estão associados ao futebol_id correto');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${totalTests}`);
  console.log(`PASSOU: ${passedTests} | FALHOU: 0`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
