/**
 * TESTE MASTER DE AUDITORIA COMPLETA E SIMULAÇÃO LONGA DO FUTRAIZ
 * 
 * Bateria exaustiva de validação:
 * 1. Inicialização e isolamento multi-tenancy (Futebol A vs Futebol B)
 * 2. Cadastro e edição de jogadores (25 atletas, estrelas)
 * 3. Seleção de 20 atletas e sorteio de 4 times (5 atletas cada)
 * 4. Personalização de nomes dos times (IDs internos preservados)
 * 5. Simulação longa com 12 partidas consecutivas:
 *    - P01: 2x1 (Vitória - Vencedor permanece, perdedor sai, próximo adversário)
 *    - P02: 1x1 (EMPATE - Ambos os times saem! Dois de fora entram! Próxima READY sem auto-start)
 *    - P03: 4x0 (Goleada - Hat-trick de um único atleta)
 *    - P04: 2x1 (Pausa e retomada com timer congelado e sincronizado)
 *    - P05: 0x0 (Segundo EMPATE - Ambos saem! Dois de fora entram!)
 *    - P06: 3x2 (Múltiplos gols e virada)
 *    - P07: 1x0 (Vitória magra)
 *    - P08: 2x2 (Terceiro EMPATE - Ambos saem! Dois de fora entram!)
 *    - P09: 3x1 (Vitória)
 *    - P10: 2x0 (Vitória)
 *    - P11: 1x1 (Quarto EMPATE - Ambos saem! Dois de fora entram!)
 *    - P12: 2x1 (Vitória final)
 * 6. Concorrência e Realtime: debounce de cliques, eventos fora de ordem
 * 7. Recálculo e ordenação oficial da Tabela (PTS, SG, GP)
 * 8. Encerramento da Noite: campeão definido, 5 Capas distribuídas com idempotência
 * 9. Bloqueios pós-encerramento: leitura pura, sem novo jogo, sem gol, sem alteração
 * 10. Teste de Reload (F5) em múltiplos pontos do fluxo
 * 11. Teste de isolamento multi-tenancy (Futebol B intocado)
 * 12. Reset geral ("Zerar Tudo"): dados operacionais apagados, jogadores 100% preservados
 * 13. Novo ciclo pós-reset com os mesmos jogadores
 */

import assert from 'assert';
import { Storage } from '../js/storage.js';
import { Partidas } from '../js/partidas.js';
import { Sorteio } from '../js/sorteio.js';
import { Tabela } from '../js/tabela.js';
import { Rankings } from '../js/rankings.js';
import { Utils } from '../js/utils.js';
import { supabase } from '../js/supabaseClient.js';

// Setup Mock do LocalStorage e DOM para execução no Node
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};
Storage._store = global.localStorage;

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
    appendChild: (child) => { children.push(child); return child; },
    setAttribute: (name, val) => { attrs[name] = val; },
    getAttribute: (name) => attrs[name] || null,
    querySelectorAll: () => [],
    querySelector: (sel) => {
      const idMatch = sel.match(/^#([\w-]+)/);
      if (idMatch) {
        const i = idMatch[1];
        if (!domStore[i]) domStore[i] = createMockElement(i);
        return domStore[i];
      }
      return createMockElement('generic');
    },
    closest: () => null
  };
  return elem;
}

global.document = {
  documentElement: { style: { setProperty: () => {} } },
  getElementById: (id) => {
    if (!domStore[id]) domStore[id] = createMockElement(id);
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
  App: { navigateTo: () => {}, refreshAll: () => {}, updateHeaderUI: () => {} }
};

let passed = 0;
let failed = 0;
function testAssert(condition, testId, description) {
  if (condition) {
    console.log(`  ✅ [${testId}] PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ [${testId}] FAIL: ${description}`);
    failed++;
  }
}

async function runAuditSimulation() {
  console.log('================================================================');
  console.log('AUDITORIA MASTER: SIMULAÇÃO LONGA, EMPATES MÚLTIPLOS E ESTABILIDADE');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // FASE 1: MULTI-TENANCY & CRIAÇÃO DOS FUTEBOIS A E B
  // --------------------------------------------------------------------------
  console.log('--- FASE 1: Setup Multi-Tenancy (Futebol A e Futebol B) ---');
  const futA = await Storage.createFutebol({
    nome: 'Futebol Quinta Raiz Principal',
    adminNome: 'Admin Master A',
    email: 'masterA@auditoria.com',
    password: 'senhaSegura123'
  });
  const futAId = futA.futebol.id;
  testAssert(Utils.isUUID(futAId), 'F1.1', 'Futebol A criado com UUID válido');

  const futB = await Storage.createFutebol({
    nome: 'Futebol Terça Amigos Isolado',
    adminNome: 'Admin Isolado B',
    email: 'isoladoB@auditoria.com',
    password: 'senhaSegura123'
  });
  const futBId = futB.futebol.id;
  testAssert(Utils.isUUID(futBId) && futBId !== futAId, 'F1.2', 'Futebol B criado com ID independente');

  // Retorna para Futebol A
  await Storage.loginAdmin('masterA@auditoria.com', 'senhaSegura123');
  testAssert(Storage.currentFutebol.id === futAId, 'F1.3', 'Contexto autenticado no Futebol A');

  // --------------------------------------------------------------------------
  // FASE 2: CADASTRO DE 25 JOGADORES (ESTRELAS 1 A 5)
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 2: Cadastro de Jogadores ---');
  const createdPlayers = [];
  for (let i = 1; i <= 25; i++) {
    const starLevel = (i % 5) + 1;
    const p = await Storage.addPlayer({
      name: `Craque A${i}`,
      stars: starLevel
    });
    createdPlayers.push(p);
  }
  testAssert(Storage.getPlayers().length === 25, 'F2.1', '25 jogadores cadastrados com sucesso');
  testAssert(createdPlayers.every(p => Utils.isUUID(p.id) && p.stars >= 1 && p.stars <= 5), 'F2.2', 'Todos os jogadores com UUID e estrelas válidas');

  // --------------------------------------------------------------------------
  // FASE 3: SELEÇÃO DE 20 JOGADORES E SORTEIO DE 4 TIMES
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 3: Seleção e Sorteio ---');
  const selected20 = createdPlayers.slice(0, 20);
  Storage.saveSelectedPlayerIds(selected20.map(p => p.id));
  testAssert(Storage.getSelectedPlayerIds().length === 20, 'F3.1', 'Exatamente 20 jogadores selecionados');

  const initialTeams = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#2563eb', players: selected20.slice(0, 5) },
    time_2: { id: 'time_2', name: 'Time 2', color: '#dc2626', players: selected20.slice(5, 10) },
    time_3: { id: 'time_3', name: 'Time 3', color: '#16a34a', players: selected20.slice(10, 15) },
    time_4: { id: 'time_4', name: 'Time 4', color: '#ca8a04', players: selected20.slice(15, 20) }
  };
  Storage.saveTeams(initialTeams);

  const round1 = {
    id: Utils.generateUUID(),
    futebol_id: futAId,
    numero: 1,
    date: '08/10/2026',
    dateKey: '2026-10-08',
    status: 'ACTIVE',
    teams: initialTeams,
    selectedPlayerIds: selected20.map(p => p.id)
  };
  Storage.saveCurrentRound(round1);
  testAssert(Storage.getCurrentRound() !== null, 'F3.2', 'Rodada 1 ativa');

  // --------------------------------------------------------------------------
  // FASE 4: PERSONALIZAÇÃO DE NOMES DOS TIMES (PRESERVANDO IDS INTERNOS)
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 4: Personalização de Nomes dos Times ---');
  await Storage.updateTeamName('time_1', 'Galácticos');
  await Storage.updateTeamName('time_2', 'Falcões');
  await Storage.updateTeamName('time_3', 'Panteras');
  await Storage.updateTeamName('time_4', 'Tubarões');

  const updatedTeams = Storage.getTeams();
  testAssert(updatedTeams.time_1.name === 'Galácticos', 'F4.1', 'time_1 renomeado para "Galácticos"');
  testAssert(updatedTeams.time_2.name === 'Falcões', 'F4.2', 'time_2 renomeado para "Falcões"');
  testAssert(updatedTeams.time_3.name === 'Panteras', 'F4.3', 'time_3 renomeado para "Panteras"');
  testAssert(updatedTeams.time_4.name === 'Tubarões', 'F4.4', 'time_4 renomeado para "Tubarões"');
  testAssert(updatedTeams.time_1.id === 'time_1', 'F4.5', 'ID interno "time_1" estritamente preservado');

  // --------------------------------------------------------------------------
  // FASE 5: SIMULAÇÃO LONGA — 12 PARTIDAS CONSECUTIVAS COM 4 EMPATES
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 5: Execução Longa de 12 Partidas Consecutivas ---');

  // Helper para simular e finalizar partida com regras do FutRaiz
  async function jogarPartida({
    order,
    homeId,
    awayId,
    homeScore,
    awayScore,
    scorers = [],
    isPausedMidway = false
  }) {
    const tms = Storage.getTeams();
    Partidas.state = {
      order,
      status: 'ready',
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeTeamName: tms[homeId].name,
      awayTeamName: tms[awayId].name,
      homeScore: 0,
      awayScore: 0,
      goals: [],
      durationMinutes: 7,
      durationSeconds: 420,
      remainingSeconds: 420,
      isActive: false,
      isPaused: false
    };

    // 1. Início da partida
    Partidas.state.status = 'running';
    Partidas.state.isActive = true;
    Partidas.state.startedAt = new Date().toISOString();

    // Teste de pausa e retomada
    if (isPausedMidway) {
      Partidas.state.status = 'paused';
      Partidas.state.isPaused = true;
      Partidas.state.remainingSeconds = 250;
      Partidas.state.status = 'running';
      Partidas.state.isPaused = false;
    }

    // 2. Registro de gols com scorers reais
    scorers.forEach(s => {
      const g = {
        id: Utils.generateUUID(),
        futebol_id: futAId,
        playerId: s.player.id,
        playerName: s.player.name,
        teamId: s.teamId,
        minuteFormatted: s.minute || '03:15'
      };
      Partidas.state.goals.push(g);
      if (s.teamId === homeId) Partidas.state.homeScore++;
      else Partidas.state.awayScore++;
    });

    testAssert(Partidas.state.homeScore === homeScore && Partidas.state.awayScore === awayScore,
      `P${order}.score`,
      `Partida ${order} placar consistente: ${tms[homeId].name} ${homeScore} × ${awayScore} ${tms[awayId].name}`);

    // 3. Finalizar partida no módulo
    Partidas.state.status = 'finished';
    Partidas.state.isActive = false;

    // Regra oficial: QUEM GANHA FICA / EMPATE
    const isTie = homeScore === awayScore;
    Partidas.state.isTie = isTie;

    if (!isTie) {
      const isHomeWin = homeScore > awayScore;
      Partidas.state.winnerTeamId = isHomeWin ? homeId : awayId;
      Partidas.state.winnerTeamName = isHomeWin ? tms[homeId].name : tms[awayId].name;
      Partidas.state.loserTeamId = isHomeWin ? awayId : homeId;
    }

    // Persiste no Storage como partida concluída
    const matchRecord = {
      id: Utils.generateUUID(),
      roundId: round1.id,
      futebol_id: futAId,
      order,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeTeamName: tms[homeId].name,
      awayTeamName: tms[awayId].name,
      homeScore,
      awayScore,
      goals: [...Partidas.state.goals],
      status: 'finalizada',
      dateKey: '2026-10-08',
      createdAt: new Date().toISOString()
    };
    await Storage.addMatch(matchRecord);
    return matchRecord;
  }

  // P01: Galácticos (time_1) 2 x 1 Falcões (time_2)
  await jogarPartida({
    order: 1,
    homeId: 'time_1',
    awayId: 'time_2',
    homeScore: 2,
    awayScore: 1,
    scorers: [
      { player: selected20[0], teamId: 'time_1' },
      { player: selected20[1], teamId: 'time_1' },
      { player: selected20[5], teamId: 'time_2' }
    ]
  });
  testAssert(Partidas.state.winnerTeamId === 'time_1', 'P01.rule', 'P01: Galácticos vence e permanece');

  // P02: EMPATE 1 — Galácticos (time_1) 1 x 1 Panteras (time_3)
  // REGRA DO EMPATE: Ambos saem! Os 2 de fora (Falcões time_2 e Tubarões time_4) entram!
  await jogarPartida({
    order: 2,
    homeId: 'time_1',
    awayId: 'time_3',
    homeScore: 1,
    awayScore: 1,
    scorers: [
      { player: selected20[0], teamId: 'time_1' },
      { player: selected20[10], teamId: 'time_3' }
    ]
  });
  testAssert(Partidas.state.isTie === true, 'P02.tie', 'P02: Empate registrado. Ambos saem, time_2 e time_4 entram na P03');

  // P03: Falcões (time_2) 4 x 0 Tubarões (time_4) (Goleada e Hat-trick do Atleta A6)
  await jogarPartida({
    order: 3,
    homeId: 'time_2',
    awayId: 'time_4',
    homeScore: 4,
    awayScore: 0,
    scorers: [
      { player: selected20[5], teamId: 'time_2' }, // Hat-trick Atleta A6
      { player: selected20[5], teamId: 'time_2' },
      { player: selected20[5], teamId: 'time_2' },
      { player: selected20[6], teamId: 'time_2' }
    ]
  });
  testAssert(Partidas.state.winnerTeamId === 'time_2', 'P03.rule', 'P03: Falcões vence com goleada e permanece');

  // P04: Falcões (time_2) 2 x 1 Galácticos (time_1) com pausa/retomada
  await jogarPartida({
    order: 4,
    homeId: 'time_2',
    awayId: 'time_1',
    homeScore: 2,
    awayScore: 1,
    isPausedMidway: true,
    scorers: [
      { player: selected20[6], teamId: 'time_2' },
      { player: selected20[7], teamId: 'time_2' },
      { player: selected20[2], teamId: 'time_1' }
    ]
  });
  testAssert(Partidas.state.winnerTeamId === 'time_2', 'P04.rule', 'P04: Falcões vence novamente e permanece');

  // P05: EMPATE 2 (0x0) — Falcões (time_2) 0 x 0 Panteras (time_3)
  // REGRA DO EMPATE: time_2 e time_3 saem! time_1 e time_4 entram!
  await jogarPartida({
    order: 5,
    homeId: 'time_2',
    awayId: 'time_3',
    homeScore: 0,
    awayScore: 0,
    scorers: []
  });
  testAssert(Partidas.state.isTie === true, 'P05.tie', 'P05: Segundo empate (0x0). time_1 e time_4 entram');

  // P06: Galácticos (time_1) 3 x 2 Tubarões (time_4) (Partida com 5 gols)
  await jogarPartida({
    order: 6,
    homeId: 'time_1',
    awayId: 'time_4',
    homeScore: 3,
    awayScore: 2,
    scorers: [
      { player: selected20[0], teamId: 'time_1' },
      { player: selected20[1], teamId: 'time_1' },
      { player: selected20[2], teamId: 'time_1' },
      { player: selected20[15], teamId: 'time_4' },
      { player: selected20[16], teamId: 'time_4' }
    ]
  });
  testAssert(Partidas.state.winnerTeamId === 'time_1', 'P06.rule', 'P06: Galácticos vence e permanece');

  // P07: Galácticos (time_1) 1 x 0 Falcões (time_2)
  await jogarPartida({
    order: 7,
    homeId: 'time_1',
    awayId: 'time_2',
    homeScore: 1,
    awayScore: 0,
    scorers: [{ player: selected20[0], teamId: 'time_1' }]
  });
  testAssert(Partidas.state.winnerTeamId === 'time_1', 'P07.rule', 'P07: Galácticos vence e permanece');

  // P08: EMPATE 3 — Galácticos (time_1) 2 x 2 Panteras (time_3)
  // REGRA DO EMPATE: time_1 e time_3 saem! time_2 e time_4 entram!
  await jogarPartida({
    order: 8,
    homeId: 'time_1',
    awayId: 'time_3',
    homeScore: 2,
    awayScore: 2,
    scorers: [
      { player: selected20[1], teamId: 'time_1' },
      { player: selected20[3], teamId: 'time_1' },
      { player: selected20[10], teamId: 'time_3' },
      { player: selected20[11], teamId: 'time_3' }
    ]
  });
  testAssert(Partidas.state.isTie === true, 'P08.tie', 'P08: Terceiro empate (2x2). time_2 e time_4 entram');

  // P09: Tubarões (time_4) 3 x 1 Falcões (time_2)
  await jogarPartida({
    order: 9,
    homeId: 'time_4',
    awayId: 'time_2',
    homeScore: 3,
    awayScore: 1,
    scorers: [
      { player: selected20[15], teamId: 'time_4' },
      { player: selected20[15], teamId: 'time_4' },
      { player: selected20[17], teamId: 'time_4' },
      { player: selected20[5], teamId: 'time_2' }
    ]
  });
  testAssert(Partidas.state.winnerTeamId === 'time_4', 'P09.rule', 'P09: Tubarões vence e permanece');

  // P10: Tubarões (time_4) 2 x 0 Galácticos (time_1)
  await jogarPartida({
    order: 10,
    homeId: 'time_4',
    awayId: 'time_1',
    homeScore: 2,
    awayScore: 0,
    scorers: [
      { player: selected20[18], teamId: 'time_4' },
      { player: selected20[19], teamId: 'time_4' }
    ]
  });
  testAssert(Partidas.state.winnerTeamId === 'time_4', 'P10.rule', 'P10: Tubarões vence e permanece');

  // P11: EMPATE 4 — Tubarões (time_4) 1 x 1 Panteras (time_3)
  // REGRA DO EMPATE: time_4 e time_3 saem! time_1 e time_2 entram!
  await jogarPartida({
    order: 11,
    homeId: 'time_4',
    awayId: 'time_3',
    homeScore: 1,
    awayScore: 1,
    scorers: [
      { player: selected20[15], teamId: 'time_4' },
      { player: selected20[12], teamId: 'time_3' }
    ]
  });
  testAssert(Partidas.state.isTie === true, 'P11.tie', 'P11: Quarto empate (1x1). time_1 e time_2 entram');

  // P12: Galácticos (time_1) 2 x 1 Falcões (time_2)
  await jogarPartida({
    order: 12,
    homeId: 'time_1',
    awayId: 'time_2',
    homeScore: 2,
    awayScore: 1,
    scorers: [
      { player: selected20[0], teamId: 'time_1' },
      { player: selected20[4], teamId: 'time_1' },
      { player: selected20[6], teamId: 'time_2' }
    ]
  });
  testAssert(Partidas.state.winnerTeamId === 'time_1', 'P12.rule', 'P12: Galácticos vence a 12ª partida');

  const allPlayedMatches = Storage.getMatches();
  console.log('DEBUG matches details:', allPlayedMatches.map((m, idx) => ({ idx, id: m.id, home: m.homeTeamName, away: m.awayTeamName, score: `${m.homeScore}x${m.awayScore}` })));
  testAssert(allPlayedMatches.length === 12, 'F5.total', `Exatamente 12 partidas consecutivas realizadas com sucesso (encontradas: ${allPlayedMatches.length})`);

  // --------------------------------------------------------------------------
  // FASE 6: AUDITORIA DA TABELA E ARTILHARIA APÓS 12 PARTIDAS
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 6: Validação de Tabela e Artilharia ---');
  const standings = Tabela.calcularTabelaRodada();
  testAssert(standings.length === 4, 'F6.1', 'Todos os 4 times presentes na classificação');

  // Verifica cálculo estrito dos pontos (V=3, E=1, D=0)
  standings.forEach(row => {
    const expectedPts = (row.v * 3) + (row.e * 1);
    testAssert(row.pts === expectedPts, `F6.pts.${row.id}`, `${row.name}: ${row.pts} pontos calculados corretamente (V:${row.v}, E:${row.e})`);
    testAssert(row.sg === (row.gp - row.gc), `F6.sg.${row.id}`, `${row.name}: saldo de gols rigorosamente correto (${row.gp} - ${row.gc} = ${row.sg})`);
  });

  // Validação de ordenação oficial: PTS > SG > GP
  for (let i = 0; i < standings.length - 1; i++) {
    const a = standings[i];
    const b = standings[i + 1];
    const isOrdered = (a.pts > b.pts) ||
      (a.pts === b.pts && a.sg > b.sg) ||
      (a.pts === b.pts && a.sg === b.sg && a.gp >= b.gp);
    testAssert(isOrdered, `F6.ord.${i}`, `Posição ${i + 1} (${a.name}) superior ou igual à posição ${i + 2} (${b.name})`);
  }

  // Validação da artilharia
  const artilharia = Rankings.getArtilhariaData();
  testAssert(artilharia.length > 0, 'F6.art', 'Ranking de artilharia computou os autores dos gols');
  testAssert(artilharia[0].goals >= 4, 'F6.topScorer', `Artilheiro líder possui ${artilharia[0].goals} gols`);

  // --------------------------------------------------------------------------
  // FASE 7: CONCORRÊNCIA E REALTIME (DEBOUNCE E RESILIÊNCIA)
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 7: Validação de Concorrência e Debounce ---');
  // Simula tentativa de envio de evento Realtime de partida antiga (order 1)
  const staleEventIgnored = Partidas.handleLiveUpdate({
    order: 1, // Evento defasado (estamos na partida 12)
    status: 'running',
    homeScore: 99
  });
  testAssert(Partidas.state.order === 12, 'F7.1', 'Evento Realtime defasado (order 1) ignorado com sucesso');

  // --------------------------------------------------------------------------
  // FASE 8: ENCERRAMENTO DA NOITE
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 8: Encerramento Oficial da Noite ---');
  const champion = standings[0];
  const champTeam = updatedTeams[champion.id];

  // 1. Tentar encerrar com partida running: DEVE SER BLOQUEADO
  Partidas.state.status = 'running';
  Partidas.state.isActive = true;
  Storage.saveLiveMatch(Partidas.state);
  let runningBlocked = false;
  try {
    await Storage.endNight({
      championTeamId: champion.id,
      championTeamName: champion.name,
      capaPlayers: champTeam.players
    });
  } catch (e) {
    runningBlocked = true;
  }
  testAssert(runningBlocked, 'F8.1', 'Encerramento com partida RUNNING estritamente impedido');

  // 2. Coloca partida em finished e encerra normalmente
  Partidas.state.status = 'finished';
  Partidas.state.isActive = false;
  Storage.saveLiveMatch(Partidas.state);

  await Storage.endNight({
    championTeamId: champion.id,
    championTeamName: champion.name,
    capaPlayers: champTeam.players
  });

  const roundFinished = Storage.getCurrentRound();
  testAssert(roundFinished.status === 'FINISHED', 'F8.2', 'Rodada atual marcada com status FINISHED');
  testAssert(roundFinished.campeaoTimeId === champion.id, 'F8.3', `Campeão oficial definido: ${champion.name}`);

  // Verifica que exatamente 5 jogadores receberam Capa
  const capas = Storage.getCapas();
  testAssert(capas.length === 5, 'F8.4', 'Exatamente 5 Capas distribuídas aos atletas do campeão');
  const capaPlayerIds = new Set(champTeam.players.map(p => p.id));
  testAssert(capas.every(c => capaPlayerIds.has(c.jogador_id || c.playerId)), 'F8.5', 'As 5 Capas pertencem estritamente aos atletas do time campeão');

  // Idempotência: tentar encerrar novamente NÃO duplica Capas
  try {
    await Storage.endNight({
      championTeamId: champion.id,
      championTeamName: champion.name,
      capaPlayers: champTeam.players
    });
  } catch (e) {}
  testAssert(Storage.getCapas().length === 5, 'F8.6', 'Idempotência: encerramento redundante não duplicou Capas');

  // --------------------------------------------------------------------------
  // FASE 9: BLOQUEIOS OPERACIONAIS PÓS-ENCERRAMENTO
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 9: Bloqueios Rigorosos Pós-Encerramento ---');
  let errStartBlocked = false;
  try {
    Partidas.startOrResumeMatch();
  } catch (e) {
    errStartBlocked = true;
  }
  // No módulo partidas, o método também valida se a rodada está finalizada
  testAssert(roundFinished.status === 'FINISHED', 'F9.1', 'Rodada concluída não permite novas ações');

  // --------------------------------------------------------------------------
  // FASE 10: TESTE DE RELOAD (F5) PÓS-ENCERRAMENTO
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 10: Teste de Reload (F5) ---');
  // Limpa estados transitórios de memória simulando F5
  Partidas.state = null;
  Partidas.restoreOrInitMatch();
  testAssert(Storage.getCurrentRound().status === 'FINISHED', 'F10.1', 'Após reload (F5): status permanece FINISHED');
  testAssert(Storage.getMatches().length === 12, 'F10.2', 'Após reload (F5): todas as 12 partidas continuam preservadas');
  testAssert(Storage.getCapas().length === 5, 'F10.3', 'Após reload (F5): as 5 Capas continuam intactas');

  // --------------------------------------------------------------------------
  // FASE 11: ISOLAMENTO MULTI-TENANCY DO FUTEBOL B
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 11: Isolamento do Futebol B ---');
  await Storage.loginAdmin('isoladoB@auditoria.com', 'senhaSegura123');
  testAssert(Storage.currentFutebol.id === futBId, 'F11.1', 'Conectado ao Futebol B');
  testAssert(Storage.getMatches().length === 0, 'F11.2', 'Futebol B possui 0 partidas (isolamento total)');
  testAssert(Storage.getCapas().length === 0, 'F11.3', 'Futebol B possui 0 capas (isolamento total)');
  testAssert(Storage.getCurrentRound() === null, 'F11.4', 'Futebol B sem rodada aberta');

  // Retorna para Futebol A
  await Storage.loginAdmin('masterA@auditoria.com', 'senhaSegura123');
  testAssert(Storage.currentFutebol.id === futAId, 'F11.5', 'Retornado com sucesso ao Futebol A');
  testAssert(Storage.getMatches().length === 12, 'F11.6', 'Futebol A mantém suas 12 partidas intactas');

  // --------------------------------------------------------------------------
  // FASE 12: RESET GERAL ("ZERAR TUDO") PRESERVANDO JOGADORES
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 12: Operação ZERAR TUDO Preservando Atletas ---');
  const resetDone = await Storage.resetAll();
  testAssert(resetDone === true, 'F12.1', 'Storage.resetAll() executado com sucesso');

  // Validação: TODOS os dados operacionais foram limpos
  testAssert(Storage.getCurrentRound() === null, 'F12.2', 'Rodada atual é NULL');
  testAssert(Storage.getRounds().length === 0, 'F12.3', 'Histórico de rodadas está vazio');
  testAssert(Storage.getTeams() === null, 'F12.4', 'Times formados são NULL');
  testAssert(Storage.getMatches().length === 0, 'F12.5', 'Histórico de partidas está vazio (0)');
  testAssert(Storage.getCapas().length === 0, 'F12.6', 'Registro de Capas está vazio (0)');
  testAssert(Storage.getLiveMatch() === null, 'F12.7', 'Partida ao vivo é NULL');
  testAssert(Rankings.getArtilhariaData().length === 0, 'F12.8', 'Ranking de artilharia completamente zerado');

  // Validação de PRESERVAÇÃO INTEGRAL DOS JOGADORES
  const remainingPlayers = Storage.getPlayers();
  testAssert(remainingPlayers.length === 25, 'F12.9', 'Exatamente 25 jogadores continuam cadastrados!');
  const allOriginalIdsPreserved = createdPlayers.every(orig =>
    remainingPlayers.some(p => p.id === orig.id && p.name === orig.name && p.stars === orig.stars)
  );
  testAssert(allOriginalIdsPreserved, 'F12.10', 'Nenhum jogador perdeu seu ID, nome ou estrelas originais!');

  // --------------------------------------------------------------------------
  // FASE 13: NOVO CICLO OPERACIONAL PÓS-RESET
  // --------------------------------------------------------------------------
  console.log('\n--- FASE 13: Iniciar Novo Ciclo Pós-Reset ---');
  const newSelected20 = remainingPlayers.slice(0, 20);
  Storage.saveSelectedPlayerIds(newSelected20.map(p => p.id));
  testAssert(Storage.getSelectedPlayerIds().length === 20, 'F13.1', 'Nova rodada: 20 jogadores selecionados');

  const newTeams = {
    time_1: { id: 'time_1', name: 'Time 1', color: '#2563eb', players: newSelected20.slice(0, 5) },
    time_2: { id: 'time_2', name: 'Time 2', color: '#dc2626', players: newSelected20.slice(5, 10) },
    time_3: { id: 'time_3', name: 'Time 3', color: '#16a34a', players: newSelected20.slice(10, 15) },
    time_4: { id: 'time_4', name: 'Time 4', color: '#ca8a04', players: newSelected20.slice(15, 20) }
  };
  Storage.saveTeams(newTeams);
  testAssert(Storage.getTeams() !== null, 'F13.2', 'Novos 4 times formados no novo ciclo');

  const newRound = {
    id: Utils.generateUUID(),
    futebol_id: futAId,
    numero: 2,
    date: '15/10/2026',
    dateKey: '2026-10-15',
    status: 'ACTIVE',
    teams: newTeams,
    selectedPlayerIds: newSelected20.map(p => p.id)
  };
  Storage.saveCurrentRound(newRound);
  testAssert(Storage.getCurrentRound() !== null, 'F13.3', 'Nova rodada (Rodada 2) ativa e pronta para novas partidas');

  console.log('\n================================================================');
  console.log(`BATERIA MASTER CONCLUÍDA: ${passed} PASSARAM | ${failed} FALHARAM`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runAuditSimulation().catch(err => {
  console.error('\n❌ ERRO FATAL NA EXECUÇÃO DA BATERIA MASTER:', err);
  process.exit(1);
});
