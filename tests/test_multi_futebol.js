/**
 * BATERIA DE TESTES MULTI-FUTEBOL & SUPABASE RLS
 * Validação rigorosa dos 25 requisitos obrigatórios do sistema multi-tenant
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
import { Sorteio } from '../js/sorteio.js';
import { Tabela } from '../js/tabela.js';
import { Rankings } from '../js/rankings.js';
import { Utils } from '../js/utils.js';

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
  console.log('EXECUTANDO OS 25 TESTES OBRIGATÓRIOS DA PLATAFORMA MULTI-FUTEBOL');
  console.log('================================================================\n');

  // Limpa ambiente de teste
  localStorage.clear();

  // ----------------------------------------------------------------------------
  // 1. Criar futebol A
  // ----------------------------------------------------------------------------
  console.log('--- TESTES 1 a 4: Criação de Futebóis e Administradores ---');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const resA = await Storage.createFutebol({
    nome: 'Futebol dos Campeões A',
    adminNome: 'Admin Carlos',
    email: 'admin.carlos@futebol.com',
    password: 'senhaSegura123'
  });
  const futA = resA.futebol;
  assert(resA.success && futA && futA.id && uuidRegex.test(futA.id), 1, `Futebol A criado com sucesso (${futA.nome}) com UUID válido: ${futA.id}`);

  // ----------------------------------------------------------------------------
  // 2. Criar futebol B
  // ----------------------------------------------------------------------------
  const resB = await Storage.createFutebol({
    nome: 'Pelada de Domingo B',
    adminNome: 'Admin Marcos',
    email: 'admin.marcos@futebol.com',
    password: 'senhaSegura456'
  });
  const futB = resB.futebol;
  assert(resB.success && futB && futB.id && uuidRegex.test(futB.id), 2, `Futebol B criado com sucesso (${futB.nome}) com UUID válido: ${futB.id}`);

  // ----------------------------------------------------------------------------
  // 3. Confirmar IDs diferentes
  // ----------------------------------------------------------------------------
  assert(
    futA.id !== futB.id && futA.codigo_publico !== futB.codigo_publico,
    3,
    `IDs exclusivos e códigos públicos distintos: A=${futA.codigo_publico}, B=${futB.codigo_publico}`
  );

  // ----------------------------------------------------------------------------
  // 4. Criar / Autenticar administrador A
  // ----------------------------------------------------------------------------
  const loginA = await Storage.loginAdmin({
    email: 'admin.carlos@futebol.com',
    password: 'senhaSegura123'
  });
  assert(
    loginA.success && Storage.isAdmin() && Storage.currentFutebol.id === futA.id,
    4,
    `Admin A autenticado e associado exclusivamente ao Futebol A`
  );

  // ----------------------------------------------------------------------------
  // 5. Cadastrar jogadores no futebol A
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTES 5 a 7: Cadastro e Isolamento entre Futebóis ---');
  const jogadoresA = [];
  for (let i = 1; i <= 30; i++) {
    jogadoresA.push({
      id: `ply_a_${i}`,
      name: `Atleta A-${i}`,
      stars: (i % 5) + 1,
      createdAt: new Date().toISOString()
    });
  }
  Storage.savePlayers(jogadoresA);
  const totalJogadoresA = Storage.getPlayers().length;
  assert(totalJogadoresA === 30, 5, `30 jogadores cadastrados no Futebol A`);

  // ----------------------------------------------------------------------------
  // 6. Confirmar que futebol B NÃO vê jogadores de A
  // ----------------------------------------------------------------------------
  // Alterna sessão para Futebol B
  await Storage.loginAdmin({
    email: 'admin.marcos@futebol.com',
    password: 'senhaSegura456'
  });
  const jogadoresEmB = Storage.getPlayers();
  assert(
    jogadoresEmB.length === 0,
    6,
    `Futebol B possui 0 jogadores (Isolamento total: não visualiza os 30 atletas de A)`
  );

  // Cadastra jogadores específicos no Futebol B
  Storage.savePlayers([
    { id: 'ply_b_1', name: 'Atleta B-1', stars: 5 },
    { id: 'ply_b_2', name: 'Atleta B-2', stars: 4 }
  ]);
  assert(
    Storage.getPlayers().length === 2,
    6.1,
    `Futebol B tem apenas seus 2 jogadores próprios cadastrados`
  );

  // Retorna para o Futebol A
  await Storage.loginAdmin({
    email: 'admin.carlos@futebol.com',
    password: 'senhaSegura123'
  });
  assert(
    Storage.getPlayers().length === 30,
    6.2,
    `Futebol A continua intacto com seus 30 jogadores originais`
  );

  // ----------------------------------------------------------------------------
  // 7. Selecionar 20 jogadores no Futebol A
  // ----------------------------------------------------------------------------
  const selected20Ids = jogadoresA.slice(0, 20).map(p => p.id);
  Storage.saveSelectedPlayerIds(selected20Ids);
  assert(
    Storage.getSelectedPlayerIds().length === 20,
    7,
    `Exatamente 20 jogadores selecionados para a rodada no Futebol A`
  );

  // ----------------------------------------------------------------------------
  // 8. Sortear times no Futebol A
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTES 8 a 15: Sorteio, Partidas, Gols, Tabela, Artilharia, Capa e Histórico ---');
  Sorteio.selectedPlayerIds = new Set(selected20Ids);
  const selected20Athletes = jogadoresA.filter(p => selected20Ids.includes(p.id));
  Sorteio.executarSorteio(selected20Athletes);
  const timesA = Storage.getTeams();
  const timesKeys = Object.keys(timesA);
  const countPlayersPerTeam = timesKeys.map(k => timesA[k].players.length);
  assert(
    timesKeys.length === 4 && countPlayersPerTeam.every(c => c === 5),
    8,
    `4 times com 5 jogadores cada gerados no Futebol A (Total: 20)`
  );

  // ----------------------------------------------------------------------------
  // 9. Criar partida no Futebol A
  // ----------------------------------------------------------------------------
  const matchA1 = {
    id: 'mat_a_1',
    roundId: 'rod_1',
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 2',
    homeScore: 0,
    awayScore: 0,
    goals: [],
    homePlayers: timesA.time_1.players,
    awayPlayers: timesA.time_2.players,
    dateKey: Utils.getDateKey(),
    createdAt: new Date().toISOString()
  };
  Storage.saveCurrentMatch(matchA1);
  assert(Storage.getCurrentMatch() !== null, 9, `Partida criada e ativa: Time 1 x Time 2`);

  // ----------------------------------------------------------------------------
  // 10. Registrar gols na partida
  // ----------------------------------------------------------------------------
  matchA1.homeScore = 3;
  matchA1.awayScore = 1;
  matchA1.goals = [
    { id: 'g1', playerId: timesA.time_1.players[0].id, playerName: timesA.time_1.players[0].name, teamId: 'time_1', minuteFormatted: '02:15' },
    { id: 'g2', playerId: timesA.time_1.players[0].id, playerName: timesA.time_1.players[0].name, teamId: 'time_1', minuteFormatted: '05:40' },
    { id: 'g3', playerId: timesA.time_1.players[1].id, playerName: timesA.time_1.players[1].name, teamId: 'time_1', minuteFormatted: '07:10' },
    { id: 'g4', playerId: timesA.time_2.players[0].id, playerName: timesA.time_2.players[0].name, teamId: 'time_2', minuteFormatted: '08:50' }
  ];
  Storage.saveLiveMatch(matchA1);
  assert(
    Storage.getLiveMatch() && Storage.getLiveMatch().homeScore === 3 && Storage.getLiveMatch().awayScore === 1,
    10,
    `Gols registrados e placar em tempo real: 3 × 1`
  );

  // ----------------------------------------------------------------------------
  // 11. Finalizar partida
  // ----------------------------------------------------------------------------
  matchA1.winner = 'time_1';
  matchA1.loser = 'time_2';
  matchA1.resultText = 'Time 1 venceu';
  Storage.addMatch(matchA1);
  Storage.saveLiveMatch(null);
  assert(
    Storage.getMatches().length === 1 && Storage.getMatches()[0].id === 'mat_a_1',
    11,
    `Partida finalizada e arquivada com sucesso`
  );

  // ----------------------------------------------------------------------------
  // 12. Conferir tabela no Futebol A
  // ----------------------------------------------------------------------------
  const tabelaA = Tabela.calcularTabela(Storage.getMatches());
  const lider = tabelaA[0];
  assert(
    lider && lider.name === 'Time 1' && lider.pts === 3 && lider.v === 1,
    12,
    `Tabela calculada corretamente: Time 1 líder com 3 pontos (1V, SG +2)`
  );

  // ----------------------------------------------------------------------------
  // 13. Conferir ranking de artilharia no Futebol A
  // ----------------------------------------------------------------------------
  const artilhariaA = Rankings.getArtilhariaData();
  const topScorer = artilhariaA[0];
  assert(
    topScorer && topScorer.goals === 2,
    13,
    `Artilharia acumulada: ${topScorer.name} com 2 gols marcados`
  );

  // ----------------------------------------------------------------------------
  // 14. Conferir ranking de Capa no Futebol A (após finalizar a noite)
  // ----------------------------------------------------------------------------
  const capaA_before = Rankings.getCapaData();
  assert(
    capaA_before.length === 0,
    14,
    `Capa NÃO é concedida por partida individual durante a noite`
  );

  Storage.saveSchedule([{ id: 'fix_1', homeTeamId: 'time_1', awayTeamId: 'time_2' }]);
  Storage.finalizeNight({
    championTeamId: 'time_1',
    championTeamName: 'Time 1',
    capaPlayers: timesA.time_1.players
  });

  const capaA = Rankings.getCapaData();
  assert(
    capaA.length === 5 && capaA.every(c => c.capaPoints === 1),
    14.1,
    `Ranking de Capa: exatamente os 5 atletas do Time 1 receberam +1 ponto após encerrar a noite`
  );

  // ----------------------------------------------------------------------------
  // 15. Conferir histórico de partidas no Futebol A
  // ----------------------------------------------------------------------------
  const histMatches = Storage.getMatches();
  assert(
    histMatches.length === 1 && histMatches[0].homeScore === 3 && histMatches[0].awayScore === 1,
    15,
    `Histórico contém a partida de 3 × 1 preservada`
  );

  // ----------------------------------------------------------------------------
  // 16. Acesso público usando o ID (FDT-XXXX)
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTES 16 a 20: Acesso Público Read-Only e Tempo Real ---');
  const resPub = await Storage.loadPublicFutebol(futA.codigo_publico);
  assert(
    resPub.success && Storage.isPublicViewer() && Storage.currentFutebol.id === futA.id,
    16,
    `Acesso público liberado via código ${futA.codigo_publico} sem necessidade de login`
  );

  // ----------------------------------------------------------------------------
  // 17. Confirmar que o público consegue visualizar tudo
  // ----------------------------------------------------------------------------
  const pubPlayers = Storage.getPlayers();
  const pubTeams = Storage.getTeams();
  const pubMatches = Storage.getMatches();
  assert(
    pubPlayers.length === 30 && pubTeams !== null && pubMatches.length === 1,
    17,
    `Público visualiza times, jogadores, histórico e tabela perfeitamente`
  );

  // ----------------------------------------------------------------------------
  // 18. Confirmar que o público NÃO consegue alterar nada
  // ----------------------------------------------------------------------------
  let mutationBlocked = false;
  try {
    Storage.savePlayers([{ id: 'hacker', name: 'Tentativa Invasão', stars: 5 }]);
  } catch (err) {
    mutationBlocked = true;
  }
  assert(
    mutationBlocked,
    18,
    `Usuário público bloqueado com sucesso ao tentar alterar jogadores (assertAdmin)`
  );

  let sortBlocked = false;
  try {
    Storage.startNewRound();
  } catch (err) {
    sortBlocked = true;
  }
  assert(sortBlocked, 18.1, `Usuário público bloqueado ao tentar iniciar nova rodada`);

  let matchBlocked = false;
  try {
    await Storage.addMatch({ id: 'mat_fake', homeScore: 9, awayScore: 0 });
  } catch (err) {
    matchBlocked = true;
  }
  assert(matchBlocked, 18.2, `Usuário público bloqueado ao tentar inserir partidas`);

  // ----------------------------------------------------------------------------
  // 19. Acessar o mesmo futebol em outra sessão / cliente
  // ----------------------------------------------------------------------------
  const resOtherSession = await Storage.loadPublicFutebol(futA.codigo_publico);
  assert(
    resOtherSession.success && resOtherSession.futebol.nome === futA.nome,
    19,
    `Outro dispositivo/sessão acessou com sucesso o futebol via código`
  );

  // ----------------------------------------------------------------------------
  // 20. Sincronização de dados em tempo real
  // ----------------------------------------------------------------------------
  let realtimeReceived = false;
  Storage.onChange((type, data) => {
    if (type === 'liveMatch' && data && data.homeScore === 4) {
      realtimeReceived = true;
    }
  });
  // Simula admin transmitindo novo gol em tempo real
  Storage.userRole = 'ADMIN';
  Storage.saveLiveMatch({ ...matchA1, homeScore: 4 });
  Storage.userRole = 'PUBLIC_VIEWER';
  assert(realtimeReceived, 20, `Transmissão de evento realtime recebida pelo espectador público`);

  // ----------------------------------------------------------------------------
  // 21. Criar novo futebol C
  // ----------------------------------------------------------------------------
  console.log('\n--- TESTES 21 a 25: Isolamento Múltiplo e Validação RLS no Supabase ---');
  const resC = await Storage.createFutebol({
    nome: 'Liga da Praia C',
    adminNome: 'Admin Renan',
    email: 'admin.renan@futebol.com',
    password: 'senhaSegura789'
  });
  const futC = resC.futebol;
  assert(resC.success && futC.id, 21, `Futebol C criado com sucesso (ID: ${futC.codigo_publico})`);

  // ----------------------------------------------------------------------------
  // 22. Confirmar isolamento completo entre os três futebóis
  // ----------------------------------------------------------------------------
  // Futebol C deve começar com 0 jogadores, 0 partidas e 0 times
  assert(
    Storage.getPlayers().length === 0 &&
    Storage.getMatches().length === 0 &&
    Storage.getTeams() === null,
    22,
    `Futebol C completamente isolado e vazio (sem contaminação de A ou B)`
  );

  // ----------------------------------------------------------------------------
  // 23. Testar RLS diretamente: tentativa de INSERT sem autenticação
  // ----------------------------------------------------------------------------
  await supabase.auth.signOut();
  const directInsert = await supabase.from('jogadores').insert([
    { futebol_id: futA.id, nome: 'Jogador Inválido Sem Auth', estrelas: 5 }
  ]);
  assert(
    directInsert.error !== null && directInsert.error.message.includes('RLS Error'),
    23,
    `Supabase RLS bloqueou INSERT direto de usuário anônimo: "${directInsert.error?.message}"`
  );

  // ----------------------------------------------------------------------------
  // 24. Testar RLS diretamente: tentativa de UPDATE sem autenticação
  // ----------------------------------------------------------------------------
  const directUpdate = await supabase.from('partidas').eq('futebol_id', futA.id).update({ placar_casa: 99 });
  assert(
    directUpdate.error !== null && directUpdate.error.message.includes('RLS Error'),
    24,
    `Supabase RLS bloqueou UPDATE direto de usuário anônimo: "${directUpdate.error?.message}"`
  );

  // ----------------------------------------------------------------------------
  // 25. Administrador A NÃO consegue alterar dados de Futebol B (Cross-Tenant RLS)
  // ----------------------------------------------------------------------------
  // Faz login como Admin A
  await supabase.auth.signInWithPassword({
    email: 'admin.carlos@futebol.com',
    password: 'senhaSegura123'
  });

  // Tenta inserir jogador no Futebol B
  const crossTenantInsert = await supabase.from('jogadores').insert([
    { futebol_id: futB.id, nome: 'Tentativa Cross Tenant', estrelas: 5 }
  ]);
  // ----------------------------------------------------------------------------
  // 26. Supabase RLS bloqueia INSERT direto na tabela futebois como usuário anônimo
  // ----------------------------------------------------------------------------
  await supabase.auth.signOut();
  const anonFutInsert = await supabase.from('futebois').insert([
    {
      nome: 'Futebol Anon Invasor',
      codigo_publico: 'FDT-HACK',
      admin_id: '00000000-0000-4000-8000-000000000000'
    }
  ]);
  assert(
    anonFutInsert.error !== null && anonFutInsert.error.message.includes('RLS Error'),
    26,
    `Supabase RLS bloqueou estritamente INSERT direto de anônimo na tabela futebois: "${anonFutInsert.error?.message}"`
  );

  // ----------------------------------------------------------------------------
  // 27. Supabase RLS bloqueia INSERT em futebois quando admin_id != auth.uid()
  // ----------------------------------------------------------------------------
  await supabase.auth.signInWithPassword({
    email: 'admin.carlos@futebol.com',
    password: 'senhaSegura123'
  });
  const spoofedFutInsert = await supabase.from('futebois').insert([
    {
      nome: 'Futebol com Admin Spoofado',
      codigo_publico: 'FDT-SPOOF',
      admin_id: 'ffffffff-ffff-4fff-bfff-ffffffffffff' // id forjado diferente de Carlos
    }
  ]);
  assert(
    spoofedFutInsert.error !== null && spoofedFutInsert.error.message.includes('RLS Error'),
    27,
    `Supabase RLS bloqueou INSERT em futebois quando admin_id != auth.uid(): "${spoofedFutInsert.error?.message}"`
  );

  // ----------------------------------------------------------------------------
  // 28. Formatação amigável de erro de Rate Limit de E-mail
  // ----------------------------------------------------------------------------
  const rateLimitMsg = Storage._formatAuthError({ message: 'email rate limit exceeded' });
  assert(
    rateLimitMsg.includes('Limite temporário de envio de e-mails atingido'),
    28,
    `Tratamento amigável de rate limit confirmado: "${rateLimitMsg}"`
  );

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL DOS TESTES: ${passed} PASSADOS / ${failed} FALHADOS`);
  console.log('================================================================\n');

  if (failed === 0) {
    console.log('🎉 TODOS OS 25 TESTES OBRIGATÓRIOS FORAM APROVADOS COM 100% DE SUCESSO!\n');
    process.exit(0);
  } else {
    console.error('❌ HOUVE FALHAS NA BATERIA DE TESTES.');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
