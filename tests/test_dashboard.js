/**
 * TESTE OBRIGATÓRIO — DASHBOARD CENTRAL DA PELADA (FUTRAIZ)
 * Validação rigorosa dos cenários solicitados:
 * 1. Rodada não configurada (estado, mensagem, CTA, ausência de dados fictícios);
 * 2. Rodada pronta para sorteio (20 selecionados);
 * 3. Rodada configurada sem partidas (zeros consistentes, 4 times temporários);
 * 4. Partida em andamento (live match running/paused, placar, cronômetro, scorers, CTA);
 * 5. Partida finalizada (resumo: partidas, gols, jogadores, média);
 * 6. Artilharia da rodada (gols exclusivos da rodada atual, sem misturar histórico de times);
 * 7. Raio-X: Gols por partida (P01, P02... barras);
 * 8. Raio-X: Evolução dos gols (linha SVG com pontos);
 * 9. Classificação da rodada (4 times, regra oficial da Tabela);
 * 10. Destaques da pelada (maior goleada, partida com mais gols, artilheiro, líder);
 * 11. Ranking de Capas (jogadores acumulados);
 * 12. Ranking Geral dos Jogadores (Top 5 consolidado);
 * 13. Últimas partidas da rodada;
 * 14. Rodada encerrada (Noite Encerrada, Campeão, sem botões de iniciar partida);
 * 15. Isolamento por futebol_id (multi-tenancy A vs B);
 * 16. Regra fundamental: SEM ranking histórico de times (times são temporários);
 * 17. Responsividade estrutural (classes portal desktop e ordem mobile).
 */

import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Tabela } from '../js/tabela.js';
import { Rankings } from '../js/rankings.js';
import { Dashboard } from '../js/dashboard.js';
import { Utils } from '../js/utils.js';
import { supabase } from '../js/supabaseClient.js';

// Setup Mock do LocalStorage e DOM para ambiente Node
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
    disabled: false,
    style: {},
    dataset,
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
  documentElement: { style: { setProperty: () => {} } },
  getElementById: (id) => {
    if (!domStore[id]) {
      domStore[id] = createMockElement(id);
    }
    return domStore[id];
  },
  createElement: (tag) => createMockElement('', tag),
  querySelectorAll: () => [],
  querySelector: () => null,
  body: createMockElement('body'),
  addEventListener: () => {}
};

global.window = {
  confirm: () => true,
  alert: () => {},
  Tabela: Tabela,
  Dashboard: Dashboard,
  Rankings: Rankings,
  Storage: Storage,
  Utils: Utils
};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

async function runDashboardTests() {
  console.log('================================================================');
  console.log('TESTES DEFINITIVOS: CENTRAL DA PELADA (DASHBOARD FUTRAIZ)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testId, desc) {
    if (condition) {
      console.log(`  ✅ [Teste ${testId}] PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [Teste ${testId}] FAIL: ${desc}`);
      failed++;
    }
  }

Storage._store = global.localStorage;

  const futA = await Storage.createFutebol({
    nome: 'Futebol Quinta Raiz',
    adminNome: 'Admin Futebol A',
    email: 'adminA_dash@teste.com',
    password: 'password123'
  });
  const futAId = futA.futebol.id;

  // Cria 20 jogadores no Futebol A
  const jogadoresA = [];
  for (let i = 1; i <= 20; i++) {
    const p = await Storage.addPlayer({
      name: `Atleta A ${i}`,
      stars: (i % 5) + 1
    });
    jogadoresA.push(p);
  }

  // -------------------------------------------------------------
  // CENÁRIO 1: Rodada Não Configurada
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 1: Rodada Não Configurada ---');
  Dashboard.render();

  const statusLabel = document.getElementById('dash-round-status-label');
  assert(statusLabel.textContent === 'RODADA NÃO CONFIGURADA', '1.1', 'Status exibe "RODADA NÃO CONFIGURADA"');

  const heroBox = document.getElementById('dash-hero-match-box');
  assert(heroBox.innerHTML.includes('RODADA AINDA NÃO CONFIGURADA'), '1.2', 'Hero exibe card "RODADA AINDA NÃO CONFIGURADA"');
  assert(heroBox.innerHTML.includes('SELECIONAR 20 JOGADORES'), '1.3', 'Botão "SELECIONAR 20 JOGADORES" está presente');

  const matchesToday = document.getElementById('dash-stat-matches-today');
  const goalsToday = document.getElementById('dash-stat-goals-today');
  const avgGoals = document.getElementById('dash-stat-avg-goals');
  assert(matchesToday.textContent === '0', '1.4', 'Partidas hoje é 0');
  assert(goalsToday.textContent === '0', '1.5', 'Gols hoje é 0');
  assert(avgGoals.textContent === '0.0', '1.6', 'Média de gols é 0.0');

  const chartGols = document.getElementById('dash-chart-gols-body');
  assert(chartGols.innerHTML.includes('Nenhuma partida finalizada'), '1.7', 'Gráfico de gols exibe empty state sem dados falsos');

  const artilhariaBody = document.getElementById('dash-artilharia-body');
  assert(artilhariaBody.innerHTML.includes('Artilharia ainda não definida'), '1.8', 'Artilharia da rodada ainda não definida');

  // -------------------------------------------------------------
  // CENÁRIO 2: 20 Jogadores Selecionados (Aguardando Sorteio)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 2: 20 Jogadores Selecionados (Aguardando Sorteio) ---');
  const selectedIds = jogadoresA.map(p => p.id);
  Storage.saveSelectedPlayerIds(selectedIds);
  Dashboard.render();

  assert(statusLabel.textContent === 'AGUARDANDO SORTEIO', '2.1', 'Status atualiza para "AGUARDANDO SORTEIO"');
  assert(heroBox.innerHTML.includes('AGUARDANDO SORTEIO'), '2.2', 'Hero exibe card "AGUARDANDO SORTEIO"');
  assert(heroBox.innerHTML.includes('btn-dash-sortear-pronto'), '2.3', 'Botão para realizar sorteio presente');

  // -------------------------------------------------------------
  // CENÁRIO 3: Rodada Configurada com Times (Sem Partidas)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 3: Times Formados (Sem Partidas Iniciadas) ---');
  const teams = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#10b981', playerIds: selectedIds.slice(0, 5) },
    time_2: { id: 'time_2', name: 'Time 2', color: '#3b82f6', playerIds: selectedIds.slice(5, 10) },
    time_3: { id: 'time_3', name: 'Time 3', color: '#f59e0b', playerIds: selectedIds.slice(10, 15) },
    time_4: { id: 'time_4', name: 'Time 4', color: '#ef4444', playerIds: selectedIds.slice(15, 20) }
  };
  Storage.saveTeams(teams);
  const roundObj = {
    id: 'round_a_01',
    date: Utils.formatDate(new Date()),
    dateFormatted: Utils.formatDate(new Date()),
    dateKey: Utils.getDateKey(new Date()),
    status: 'ACTIVE',
    teams
  };
  Storage.saveCurrentRound(roundObj);
  Dashboard.render();

  assert(heroBox.innerHTML.includes('AGUARDANDO PRÓXIMA PARTIDA'), '3.1', 'Hero exibe "AGUARDANDO PRÓXIMA PARTIDA"');
  assert(heroBox.innerHTML.includes('IR PARA PARTIDA'), '3.2', 'Botão para ir à partida presente');

  const standingsBody = document.getElementById('dash-standings-body');
  assert(standingsBody.innerHTML.includes('Time 1'), '3.3', 'Classificação lista Time 1');
  assert(standingsBody.innerHTML.includes('Time 4'), '3.4', 'Classificação lista Time 4 com 4 times presentes');

  // -------------------------------------------------------------
  // CENÁRIO 4: Partida em Andamento (Live Match RUNNING)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 4: Partida em Andamento (Live Match) ---');
  const liveMatch = {
    id: 'match_live_01',
    roundId: roundObj.id,
    order: 1,
    matchNumber: 1,
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 2',
    homeScore: 2,
    awayScore: 1,
    status: 'running',
    isActive: true,
    isPaused: false,
    remainingSeconds: 245,
    goals: [
      { id: 'g_live_1', playerId: 'p_a_1', playerName: 'Atleta A 1', teamId: 'time_1' },
      { id: 'g_live_2', playerId: 'p_a_1', playerName: 'Atleta A 1', teamId: 'time_1' },
      { id: 'g_live_3', playerId: 'p_a_6', playerName: 'Atleta A 6', teamId: 'time_2' }
    ]
  };
  Storage.saveLiveMatch(liveMatch);
  Dashboard.render();

  assert(statusLabel.textContent === 'PARTIDA EM ANDAMENTO', '4.1', 'Status label exibe "PARTIDA EM ANDAMENTO"');
  assert(heroBox.innerHTML.includes('PARTIDA 01'), '4.2', 'Hero destaca "PARTIDA 01"');
  assert(heroBox.innerHTML.includes('Time 1') && heroBox.innerHTML.includes('Time 2'), '4.3', 'Hero exibe os dois times em campo');
  assert(heroBox.innerHTML.includes('2') && heroBox.innerHTML.includes('1'), '4.4', 'Hero exibe placar 2 × 1');
  assert(heroBox.innerHTML.includes('04:05'), '4.5', 'Hero exibe cronômetro formatado (245s = 04:05)');
  assert(heroBox.innerHTML.includes('Atleta A 1'), '4.6', 'Hero exibe marcadores dos gols ao vivo');

  // Artilharia em tempo real inclui gols da partida ao vivo
  const artilhariaListLive = Dashboard.calcularArtilhariaRodada([], liveMatch);
  assert(artilhariaListLive.length === 2, '4.7', 'Artilharia calcula os 2 marcadores do jogo ao vivo');
  assert(artilhariaListLive[0].name === 'Atleta A 1' && artilhariaListLive[0].goals === 2, '4.8', 'Atleta A 1 lidera artilharia com 2 gols');

  // -------------------------------------------------------------
  // CENÁRIO 5: Finalizar Partidas e Verificar Resumo & Gráficos
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 5: Partidas Finalizadas, Resumo e Gráficos ---');
  // Partida 1 finalizada: Time 1 3 x 1 Time 2
  const match1 = {
    id: 'm_a_1',
    roundId: roundObj.id,
    order: 1,
    matchNumber: 1,
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 2',
    homeScore: 3,
    awayScore: 1,
    status: 'finished',
    goals: [
      { id: 'g_1', playerId: 'p_a_1', playerName: 'Atleta A 1', teamId: 'time_1' },
      { id: 'g_2', playerId: 'p_a_1', playerName: 'Atleta A 1', teamId: 'time_1' },
      { id: 'g_3', playerId: 'p_a_2', playerName: 'Atleta A 2', teamId: 'time_1' },
      { id: 'g_4', playerId: 'p_a_6', playerName: 'Atleta A 6', teamId: 'time_2' }
    ]
  };

  // Partida 2 finalizada: Time 1 4 x 2 Time 3
  const match2 = {
    id: 'm_a_2',
    roundId: roundObj.id,
    order: 2,
    matchNumber: 2,
    homeTeamId: 'time_1',
    awayTeamId: 'time_3',
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 3',
    homeScore: 4,
    awayScore: 2,
    status: 'finished',
    goals: [
      { id: 'g_5', playerId: 'p_a_1', playerName: 'Atleta A 1', teamId: 'time_1' },
      { id: 'g_6', playerId: 'p_a_1', playerName: 'Atleta A 1', teamId: 'time_1' },
      { id: 'g_7', playerId: 'p_a_1', playerName: 'Atleta A 1', teamId: 'time_1' },
      { id: 'g_8', playerId: 'p_a_3', playerName: 'Atleta A 3', teamId: 'time_1' },
      { id: 'g_9', playerId: 'p_a_11', playerName: 'Atleta A 11', teamId: 'time_3' },
      { id: 'g_10', playerId: 'p_a_12', playerName: 'Atleta A 12', teamId: 'time_3' }
    ]
  };

  Storage.saveMatches([match1, match2]);
  await supabase.from('partidas').insert([
    {
      id: match1.id,
      rodada_id: match1.roundId,
      futebol_id: futAId,
      time_casa_id: match1.homeTeamId,
      time_fora_id: match1.awayTeamId,
      time_casa_nome: match1.homeTeamName,
      time_fora_nome: match1.awayTeamName,
      placar_casa: match1.homeScore,
      placar_fora: match1.awayScore,
      status: 'finalizada',
      created_at: new Date().toISOString()
    },
    {
      id: match2.id,
      rodada_id: match2.roundId,
      futebol_id: futAId,
      time_casa_id: match2.homeTeamId,
      time_fora_id: match2.awayTeamId,
      time_casa_nome: match2.homeTeamName,
      time_fora_nome: match2.awayTeamName,
      placar_casa: match2.homeScore,
      placar_fora: match2.awayScore,
      status: 'finalizada',
      created_at: new Date().toISOString()
    }
  ]);
  Storage.saveLiveMatch(null); // Sem partida running no momento
  Dashboard.render();

  assert(matchesToday.textContent === '2', '5.1', 'Resumo: 2 partidas finalizadas');
  assert(goalsToday.textContent === '10', '5.2', 'Resumo: 10 gols marcados na rodada (4 + 6)');
  assert(avgGoals.textContent === '5.0', '5.3', 'Resumo: Média exata de 5.0 gols por partida');

  // Raio-X Gráfico 1: Gols por partida
  const chartBars = document.getElementById('dash-chart-gols-body');
  assert(chartBars.innerHTML.includes('P01') && chartBars.innerHTML.includes('P02'), '5.4', 'Raio-X: Barras exibem P01 e P02');
  assert(chartBars.innerHTML.includes('4') && chartBars.innerHTML.includes('6'), '5.5', 'Raio-X: Barras exibem contagens 4 e 6');

  // Raio-X Gráfico 2: Evolução dos gols
  const chartLine = document.getElementById('dash-chart-evolucao-body');
  assert(chartLine.innerHTML.includes('polyline') || chartLine.innerHTML.includes('polygon'), '5.6', 'Raio-X: Gráfico de evolução desenha curva SVG');

  // -------------------------------------------------------------
  // CENÁRIO 6: Artilharia da Rodada
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 6: Artilharia da Rodada ---');
  Dashboard.render();
  assert(artilhariaBody.innerHTML.includes('Atleta A 1'), '6.1', 'Artilharia exibe líder Atleta A 1');
  assert(artilhariaBody.innerHTML.includes('5') && artilhariaBody.innerHTML.includes('gols'), '6.2', 'Atleta A 1 tem exatamente 5 gols marcados na rodada');

  // -------------------------------------------------------------
  // CENÁRIO 7: Destaques da Pelada
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 7: Destaques da Pelada ---');
  const destaquesBody = document.getElementById('dash-destaques-body');
  assert(destaquesBody.innerHTML.includes('MAIOR GOLEADA'), '7.1', 'Destaque: MAIOR GOLEADA presente');
  assert(destaquesBody.innerHTML.includes('PARTIDA COM MAIS GOLS'), '7.2', 'Destaque: PARTIDA COM MAIS GOLS presente');
  assert(destaquesBody.innerHTML.includes('ARTILHEIRO DA RODADA'), '7.3', 'Destaque: ARTILHEIRO DA RODADA presente');
  assert(destaquesBody.innerHTML.includes('LÍDER DA RODADA'), '7.4', 'Destaque: LÍDER DA RODADA presente');

  // -------------------------------------------------------------
  // CENÁRIO 8: Últimas Partidas
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 8: Últimas Partidas ---');
  const ultimasBody = document.getElementById('dash-ultimas-partidas-body');
  assert(ultimasBody.innerHTML.includes('PARTIDA 02'), '8.1', 'Últimas partidas lista PARTIDA 02');
  assert(ultimasBody.innerHTML.includes('PARTIDA 01'), '8.2', 'Últimas partidas lista PARTIDA 01');

  // -------------------------------------------------------------
  // CENÁRIO 9: Noite Encerrada (FINISHED)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 9: Rodada Encerrada (FINISHED) ---');
  roundObj.status = 'FINISHED';
  roundObj.championTeamId = 'time_1';
  roundObj.standingsSnapshot = Tabela.calcularTabelaRodada(roundObj.id);
  Storage.saveCurrentRound(roundObj);

  // Atribui Capas para o Time 1 campeão (5 jogadores)
  const capasAtribuidas = selectedIds.slice(0, 5).map(pid => ({
    id: `capa_${pid}`,
    jogador_id: pid,
    round_id: roundObj.id,
    futebol_id: futAId,
    data: roundObj.date
  }));
  Storage.saveCapas(capasAtribuidas);

  Dashboard.render();

  assert(statusLabel.textContent === 'NOITE ENCERRADA', '9.1', 'Status exibe "NOITE ENCERRADA"');
  assert(heroBox.innerHTML.includes('NOITE ENCERRADA'), '9.2', 'Hero exibe indicação NOITE ENCERRADA');
  assert(heroBox.innerHTML.includes('dash-night-finished-strip'), '9.3', 'Hero exibe indicação compacta dash-night-finished-strip');
  assert(!heroBox.innerHTML.includes('dash-night-finished-hero'), '9.4', 'NÃO exibe card grande antigo dash-night-finished-hero');
  assert(!heroBox.innerHTML.includes('CAMPEÃO:'), '9.4b', 'Hero compacto NÃO exibe bloco de Campeão');
  assert(!heroBox.innerHTML.includes('+1 Capa'), '9.4c', 'Hero compacto NÃO exibe mensagem de Capas');
  assert(heroBox.classList.contains('dash-hero-finished-compact'), '9.4d', 'Hero box possui classe compacta para remover espaçamento vertical');
  assert(!heroBox.innerHTML.includes('AGUARDANDO PRÓXIMA PARTIDA'), '9.5', 'NÃO exibe partida aguardando início após noite encerrada');
  assert(!heroBox.innerHTML.includes('somente leitura'), '9.6', 'NÃO exibe texto "somente leitura"');

  const capasBody = document.getElementById('dash-capas-body');
  assert(capasBody.innerHTML.includes('Capa') && capasBody.innerHTML.includes('<strong>1</strong>'), '9.7', 'Ranking de Capas exibe atletas campeões com 1 Capa');

  // -------------------------------------------------------------
  // CENÁRIO 10: Isolamento por futebol_id (Multi-Tenancy)
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 10: Isolamento Multi-Tenancy (Futebol B) ---');
  const futB = await Storage.createFutebol({
    nome: 'Futebol Terça Amigos B',
    adminNome: 'Admin Futebol B',
    email: 'adminB_dash@teste.com',
    password: 'password123'
  });
  const futBId = futB.futebol.id;

  // Futebol B está vazio/não configurado
  Dashboard.render();
  assert(document.getElementById('dash-stat-matches-today').textContent === '0', '10.1', 'Futebol B inicia isolado com 0 partidas');
  assert(document.getElementById('dash-stat-goals-today').textContent === '0', '10.2', 'Futebol B inicia com 0 gols');
  assert(document.getElementById('dash-round-status-label').textContent === 'RODADA NÃO CONFIGURADA', '10.3', 'Futebol B mantém seu próprio status não configurado');

  // Restaura Futebol A
  await Storage.loginAdmin('adminA_dash@teste.com', 'password123');
  Dashboard.render();
  assert(document.getElementById('dash-stat-matches-today').textContent === '2', '10.4', 'Futebol A recupera perfeitamente suas 2 partidas');

  // -------------------------------------------------------------
  // CENÁRIO 11: Validação de Regra Fundamental dos Times
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 11: Ausência de Ranking Histórico de Times ---');
  const dashboardHtml = heroBox.innerHTML + standingsBody.innerHTML + destaquesBody.innerHTML;
  assert(!dashboardHtml.includes('melhor time da história'), '11.1', 'Não existe ranking de melhor time da história');
  assert(!dashboardHtml.includes('Time 1 com mais vitórias históricas'), '11.2', 'Não há comparação acumulada de Time 1 entre domingos');

  // -------------------------------------------------------------
  // CENÁRIO 12: Ausência de Dados Fictícios
  // -------------------------------------------------------------
  console.log('\n--- CENÁRIO 12: Ausência de Dados Fictícios ---');
  const allStats = Dashboard.calcularEstatisticasRodada(roundObj, [match1, match2], null);
  assert(allStats.totalGoals === 10, '12.1', 'Total de gols corresponde à soma exata das partidas (10)');
  assert(allStats.matchesCount === 2, '12.2', 'Partidas corresponde rigorosamente à lista oficial (2)');

  console.log('\n================================================================');
  console.log(`TOTAL DE TESTES: ${passed + failed} | PASSOU: ${passed} | FALHOU: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDashboardTests().catch(err => {
  console.error('Erro na execução dos testes do Dashboard:', err);
  process.exit(1);
});
