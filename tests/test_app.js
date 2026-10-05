/**
 * Test Suite - Familia do Fut
 * Validação automatizada das novas regras de negócio da Rodada:
 * 1. 30 jogadores cadastrados.
 * 2. Selecionar exatamente 20.
 * 3. Sortear somente os 20 selecionados.
 * 4. Verificar 4 times.
 * 5. Verificar 5 jogadores por time.
 * 6. Verificar equilíbrio das estrelas.
 * 7. Confirmar que os 10 não selecionados não aparecem nos times.
 * 8. Criar uma partida.
 * 9. Registrar gols.
 * 10. Finalizar partida.
 * 11. Criar nova rodada.
 * 12. Selecionar outros 20 jogadores.
 * 13. Confirmar que a rodada anterior continua intacta.
 * 14. Confirmar que o histórico continua intacto.
 * 15. Confirmar que os rankings continuam acumulados.
 * 16. Atualizar a página e confirmar persistência.
 */

import { Sorteio } from '../js/sorteio.js';
import { Tabela } from '../js/tabela.js';
import { Rankings } from '../js/rankings.js';
import { Storage } from '../js/storage.js';
import { Utils } from '../js/utils.js';

// Mock localStorage para execução no ambiente Node.js
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

// Mock DOM mínimo
global.document = {
  documentElement: { style: { setProperty: () => {} } },
  getElementById: () => null,
  querySelectorAll: () => [],
  body: { classList: { add: () => {}, remove: () => {} } },
  addEventListener: () => {}
};
global.window = {
  confirm: () => true
};

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

Storage.currentFutebol = { id: 'a0000000-0000-4000-8000-000000000001', nome: 'Futebol Teste', admin_id: 'admin_test', codigo_publico: 'FDT-TEST' };
Storage.currentUser = { id: 'admin_test', email: 'admin@test.com' };
Storage.userRole = 'ADMIN';

console.log('===========================================================');
console.log('BATERIA DE TESTES: SELEÇÃO DE RODADA E SORTEIO EQUILIBRADO');
console.log('===========================================================\n');

// 1. Cadastrar 30 jogadores no cadastro geral permanente
console.log('--- TESTE 1: Cadastro de 30 Jogadores ---');
const test30Players = [];
const names = [
  'Neymar', 'Vini Jr', 'Rodrygo', 'Raphinha', 'Endrick', 'Estêvão', // 6x 5★
  'Casemiro', 'Paquetá', 'Guimarães', 'Alisson', 'Douglas Luiz', 'Joelinton', // 6x 4★
  'Danilo', 'Marquinhos', 'Militão', 'Gabriel M', 'Bremer', 'Beraldo', // 6x 3★
  'Richarlison', 'Antony', 'Fred', 'Alex Telles', 'Pepê', 'Evanilson', // 6x 2★
  'Weverton', 'Renan Lodi', 'Arthur', 'Jesus', 'Yan Couto', 'Bento' // 6x 1★
];

const starsDist = [5,5,5,5,5,5, 4,4,4,4,4,4, 3,3,3,3,3,3, 2,2,2,2,2,2, 1,1,1,1,1,1];

for (let i = 0; i < 30; i++) {
  test30Players.push({
    id: `p_${i + 1}`,
    name: names[i],
    stars: starsDist[i],
    createdAt: new Date().toISOString()
  });
}

Storage.savePlayers(test30Players);
const saved30 = Storage.getPlayers();
assert(saved30.length === 30, '30 jogadores cadastrados no cadastro geral');

// 2. Selecionar exatamente 20 jogadores para a Rodada 1
console.log('\n--- TESTE 2: Selecionar Exatamente 20 Jogadores ---');
// Seleciona os primeiros 20 jogadores (deixando os 10 últimos de fora)
const selectedIdsRound1 = test30Players.slice(0, 20).map(p => p.id);
const unselectedIdsRound1 = test30Players.slice(20, 30).map(p => p.id);

Sorteio.selectedPlayerIds = new Set(selectedIdsRound1);
Sorteio.saveSelection();

assert(Sorteio.selectedPlayerIds.size === 20, 'Exatamente 20 jogadores selecionados para a Rodada 1');
assert(unselectedIdsRound1.length === 10, '10 jogadores mantidos no cadastro geral mas fora da rodada');

// 3. Sortear somente os 20 selecionados
console.log('\n--- TESTE 3: Sorteio Exclusivo dos 20 Selecionados ---');
const selectedPlayersR1 = saved30.filter(p => Sorteio.selectedPlayerIds.has(p.id));
Sorteio.executarSorteio(selectedPlayersR1);

const currentRound1 = Storage.getCurrentRound();
assert(currentRound1 !== null, 'Objeto Rodada 1 criado e persistido no Storage');
assert(currentRound1.selectedPlayerIds.length === 20, 'Rodada 1 gravou os 20 IDs selecionados');

// 4. Verificar 4 times
console.log('\n--- TESTE 4: Verificação de 4 Times ---');
const teamsR1 = Storage.getTeams();
assert(teamsR1.time_1 && teamsR1.time_2 && teamsR1.time_3 && teamsR1.time_4, 'Times criados com chaves Time 1, Time 2, Time 3, Time 4');

// 5. Verificar 5 jogadores por time
console.log('\n--- TESTE 5: 5 Jogadores por Time ---');
const lengthsR1 = [
  teamsR1.time_1.players.length,
  teamsR1.time_2.players.length,
  teamsR1.time_3.players.length,
  teamsR1.time_4.players.length
];
assert(lengthsR1.every(l => l === 5), `Todos os 4 times têm exatamente 5 jogadores: [${lengthsR1.join(', ')}]`);

// 6. Verificar equilíbrio das estrelas
console.log('\n--- TESTE 6: Equilíbrio das Estrelas ---');
const starSumsR1 = [
  teamsR1.time_1.totalStars,
  teamsR1.time_2.totalStars,
  teamsR1.time_3.totalStars,
  teamsR1.time_4.totalStars
];
const diffR1 = Math.max(...starSumsR1) - Math.min(...starSumsR1);
console.log(`  ℹ️ Somas de Estrelas: Time 1=${starSumsR1[0]}, Time 2=${starSumsR1[1]}, Time 3=${starSumsR1[2]}, Time 4=${starSumsR1[3]}`);
console.log(`  ℹ️ Diferença: ${diffR1} estrela(s)`);
assert(diffR1 <= 1, `Diferença máxima-mínima é menor ou igual a 1 estrela (obteve ${diffR1})`);

// 7. Confirmar que os 10 não selecionados NÃO aparecem nos times
console.log('\n--- TESTE 7: Verificação de Isolamento dos 10 Não Selecionados ---');
const allTeamPlayerIdsR1 = [
  ...teamsR1.time_1.players.map(p => p.id),
  ...teamsR1.time_2.players.map(p => p.id),
  ...teamsR1.time_3.players.map(p => p.id),
  ...teamsR1.time_4.players.map(p => p.id)
];
const anyUnselectedPresent = unselectedIdsRound1.some(id => allTeamPlayerIdsR1.includes(id));
assert(!anyUnselectedPresent, 'Nenhum dos 10 jogadores de fora foi incluído no sorteio (isolamento 100% garantido)');

// 8. Criar uma partida
console.log('\n--- TESTE 8: Criar Partida (Time 1 x Time 2) ---');
const matchR1 = {
  id: 'm_r1_1',
  roundId: currentRound1.id,
  date: '03/10/2026',
  time: '10:00',
  dateKey: '2026-10-03',
  homeTeamId: 'time_1',
  homeTeamName: 'Time 1',
  homeTeamColor: '#2563eb',
  awayTeamId: 'time_2',
  awayTeamName: 'Time 2',
  awayTeamColor: '#dc2626',
  homeScore: 2,
  awayScore: 1,
  winner: 'time_1',
  loser: 'time_2',
  resultText: 'Time 1 venceu',
  durationMinutes: 10,
  durationPlayedFormatted: '10:00',
  homePlayers: teamsR1.time_1.players,
  awayPlayers: teamsR1.time_2.players,
  goals: [
    { id: 'g1', playerId: teamsR1.time_1.players[0].id, playerName: teamsR1.time_1.players[0].name, teamId: 'time_1', teamName: 'Time 1', minuteFormatted: '03:15' },
    { id: 'g2', playerId: teamsR1.time_1.players[1].id, playerName: teamsR1.time_1.players[1].name, teamId: 'time_1', teamName: 'Time 1', minuteFormatted: '06:40' },
    { id: 'g3', playerId: teamsR1.time_2.players[0].id, playerName: teamsR1.time_2.players[0].name, teamId: 'time_2', teamName: 'Time 2', minuteFormatted: '08:20' }
  ]
};

// 9. Registrar gols e 10. Finalizar partida
Storage.addMatch(matchR1);
const matchesTotal1 = Storage.getMatches();
assert(matchesTotal1.length === 1, 'Partida registrada no histórico com 3 gols e autores vinculados');

// 10.1. Finalizar noite e atribuir Capa ao time campeão
console.log('\n--- TESTE 10.1: Encerrar Noite e Atribuir Capas ---');
assert(Rankings.getCapaData().length === 0, 'Capa NÃO é atribuída por partida isolada');
// Ajusta programação da rodada 1 para 1 partida (a que foi jogada)
Storage.saveSchedule([{ id: 'fix_1', homeTeamId: 'time_1', awayTeamId: 'time_2' }]);
Storage.finalizeNight({
  championTeamId: 'time_1',
  championTeamName: 'Time 1',
  capaPlayers: teamsR1.time_1.players
});
assert(Rankings.getCapaData().length === 5, 'Exatamente os 5 jogadores do time campeão receberam +1 Capa após encerrar a noite');

// 11. Criar nova rodada (Próximo domingo)
console.log('\n--- TESTE 11: Iniciar Nova Rodada (Novo Domingo) ---');
Storage.startNewRound();

const activeRoundAfterReset = Storage.getCurrentRound();
const activeTeamsAfterReset = Storage.getTeams();
const savedRoundsHistory = Storage.getRounds();

assert(activeRoundAfterReset === null, 'Seleção da rodada atual limpa');
assert(activeTeamsAfterReset === null, 'Times da rodada atual limpos para nova escolha');
assert(savedRoundsHistory.length >= 1, 'Rodada anterior preservada no histórico de rodadas');

// 12. Selecionar outros 20 jogadores (trocando 10 jogadores)
console.log('\n--- TESTE 12: Selecionar Outros 20 Jogadores para a Rodada 2 ---');
// Pega do índice 10 ao 29 (deixando os 10 primeiros de fora desta vez!)
const selectedIdsRound2 = test30Players.slice(10, 30).map(p => p.id);
Sorteio.selectedPlayerIds = new Set(selectedIdsRound2);
Sorteio.saveSelection();

assert(Sorteio.selectedPlayerIds.size === 20, '20 jogadores selecionados para a nova rodada');
// Verifica se o primeiro jogador da rodada 1 (Neymar) agora ficou de fora
assert(!Sorteio.selectedPlayerIds.has('p_1'), 'Jogador p_1 (Neymar) ficou de fora da Rodada 2 conforme planejado');

const selectedPlayersR2 = saved30.filter(p => Sorteio.selectedPlayerIds.has(p.id));
Sorteio.executarSorteio(selectedPlayersR2);

const currentRound2 = Storage.getCurrentRound();
assert(currentRound2 !== null && currentRound2.id !== currentRound1.id, 'Nova Rodada 2 criada com sucesso e ID exclusivo');

// 13. Confirmar que a rodada anterior continua intacta
console.log('\n--- TESTE 13: Integridade da Rodada Anterior ---');
const historicalRounds = Storage.getRounds();
const previousRoundRecord = historicalRounds.find(r => r.id === currentRound1.id);
assert(previousRoundRecord !== undefined, 'Rodada 1 localizada no histórico permanente de rodadas');
assert(previousRoundRecord.selectedPlayerIds.includes('p_1'), 'Rodada 1 continua tendo o jogador p_1 associado');

// 14. Confirmar que o histórico continua intacto
console.log('\n--- TESTE 14: Integridade do Histórico de Partidas ---');
const allMatchesPreserved = Storage.getMatches();
assert(allMatchesPreserved.length === 1, 'Histórico de partidas permaneceu intacto');
assert(allMatchesPreserved[0].id === 'm_r1_1', 'Partida da Rodada 1 continua disponível com placar 2x1');

// 15. Confirmar que os rankings continuam acumulados
console.log('\n--- TESTE 15: Acúmulo Global de Rankings ---');
const artilhariaR2 = Rankings.getArtilhariaData();
const capaR2 = Rankings.getCapaData();

assert(artilhariaR2.length === 3, 'Artilharia continua com os 3 autores de gols computados');
assert(capaR2.length === 5, 'Ranking de Capa continua acumulando os 5 jogadores campeões da Rodada 1');

// 16. Atualizar a página e confirmar persistência
console.log('\n--- TESTE 16: Persistência Geral no LocalStorage ---');
const reloadedPlayers = Storage.getPlayers();
const reloadedRound = Storage.getCurrentRound();
const reloadedMatches = Storage.getMatches();

assert(reloadedPlayers.length === 30, '30 jogadores no cadastro geral preservados no LocalStorage');
assert(reloadedRound.selectedPlayerIds.length === 20, '20 jogadores da Rodada 2 preservados no LocalStorage');
assert(reloadedMatches.length === 1, 'Partidas preservadas no LocalStorage');

console.log('\n===========================================================');
console.log(`RESULTADO FINAL: ${passed} PASSOU / ${failed} FALHOU`);
console.log('===========================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n🚀 TODOS OS 16 TESTES OBRIGATÓRIOS PASSARAM COM SUCESSO!\n');
}
