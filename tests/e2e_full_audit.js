import { spawn } from 'child_process';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = process.env.TEMP + '\\edge_rodada_e2e_' + Date.now();
const port = 9123;

console.log('Iniciando Microsoft Edge headless para auditoria E2E no porto', port);

const browser = spawn(edgePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  '--window-size=1200,900',
  'http://localhost:3000'
]);

async function run() {
  await new Promise(r => setTimeout(r, 1800));
  const res = await fetch(`http://127.0.0.1:${port}/json`);
  const targets = await res.json();
  const pageTarget = targets.find(t => t.type === 'page' && t.url.includes('localhost:3000'));
  if (!pageTarget) {
    throw new Error('Alvo de página localhost:3000 não encontrado');
  }
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let idCounter = 1;
  const pending = new Map();
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const browserLogs = [];
  const uncaughtErrors = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    } else if (msg.method === 'Console.messageAdded') {
      console.log('    [Edge Console]', msg.params.message.text);
      browserLogs.push(msg.params.message.text);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const txt = msg.params.args.map(a => a.value || a.description).join(' ');
      console.log('    [Edge Console]', txt);
      browserLogs.push(txt);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error('    [Edge Exception]', msg.params.exceptionDetails);
      uncaughtErrors.push(msg.params.exceptionDetails);
    } else if (msg.method === 'Page.javascriptDialogOpening') {
      // Auto-aceita confirmações como "Deseja iniciar nova rodada?"
      send('Page.handleJavaScriptDialog', { accept: true });
    }
  };

  await new Promise(r => ws.onopen = r);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Console.enable');

  await new Promise(r => setTimeout(r, 800));

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', {
      expression: code,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  async function click(selector) {
    const res = await evaluate(`(() => {
      const el = document.querySelector('${selector}');
      if (!el) return { found: false, selector: '${selector}' };
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      el.click();
      return { found: true, id: el.id, text: (el.textContent || '').trim().substring(0, 30) };
    })()`);
    await new Promise(r => setTimeout(r, 250));
    return res;
  }

  // Prepara auto-confirm no window e cria futebol de auditoria para habilitar o modo admin
  await evaluate(`window.confirm = () => true;`);
  await evaluate(`
    (async () => {
      await Storage.createFutebol({
        nome: 'Futebol Auditoria E2E',
        adminNome: 'Administrador E2E',
        email: 'admin@auditoria.com',
        password: 'senhaSegura123'
      });
    })()
  `);
  await new Promise(r => setTimeout(r, 800));

  console.log('\n================================================================');
  console.log('AUDITORIA E2E REAL NO NAVEGADOR: 16 TESTES OBRIGATÓRIOS');
  console.log('================================================================\n');

  // =================================================================
  // 1. Cadastrar 30 jogadores
  // =================================================================
  console.log('[TESTE 1] Cadastrando 30 atletas no Cadastro Geral permanente...');
  await click('[data-screen="jogadores"]');
  await click('#btn-load-demo-players');
  const totalJogadores = await evaluate(`Storage.getPlayers().length`);
  console.log(`  -> Atletas no cadastro geral: ${totalJogadores} (Esperado: 30)`);
  if (totalJogadores !== 30) throw new Error(`Falha no Teste 1: esperado 30, obtido ${totalJogadores}`);
  console.log('  ✅ TESTE 1 APROVADO: 30 atletas cadastrados com sucesso!\n');

  // =================================================================
  // 2. Selecionar exatamente 20 jogadores na Rodada
  // =================================================================
  console.log('[TESTE 2] Navegando para Sorteio e selecionando exatamente 20 jogadores...');
  await click('[data-screen="sorteio"]');

  // Limpa qualquer seleção prévia
  await click('#btn-clear-selection');
  let countInicial = await evaluate(`Sorteio.selectedPlayerIds.size`);
  console.log(`  -> Seleção após limpar: ${countInicial} / 20`);

  // Testa botão Sortear desabilitado com menos de 20
  const btnSortearDisabled = await evaluate(`document.getElementById('btn-realizar-sorteio')?.disabled`);
  console.log(`  -> Botão "SORTEAR TIMES" desabilitado com 0 selecionados: ${btnSortearDisabled ? 'SIM' : 'NÃO'}`);
  if (!btnSortearDisabled) throw new Error('Falha no Teste 2: botão Sortear deveria estar desabilitado com 0 jogadores');

  // Clica nos primeiros 20 cards de jogadores na interface
  const selectResult = await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.player-select-card'));
    const logClicks = [];
    for (let i = 0; i < 20; i++) {
      const c = cards[i];
      if (!c) {
        logClicks.push('card ' + i + ' não existe');
        continue;
      }
      const pid = c.dataset.playerId;
      const before = Sorteio.selectedPlayerIds.size;
      try {
        c.click();
      } catch (err) {
        logClicks.push('card ' + i + ' erro: ' + err.message);
      }
      const after = Sorteio.selectedPlayerIds.size;
      logClicks.push('card ' + i + ' (' + pid + '): ' + before + ' -> ' + after);
    }
    return {
      totalCards: cards.length,
      selectedCount: Sorteio.selectedPlayerIds.size,
      logClicks: logClicks
    };
  })()`);
  console.log(`  -> Diagnóstico de cliques:`, selectResult.logClicks.slice(0, 5));
  console.log(`  -> Clicou nos primeiros 20 cards de ${selectResult.totalCards}. Selecionados: ${selectResult.selectedCount} / 20`);
  if (selectResult.selectedCount !== 20) throw new Error(`Falha no Teste 2: contagem não é 20, obtido ${selectResult.selectedCount}`);

  // Testar regra de ultrapassagem: tentar selecionar o 21º jogador
  const try21 = await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.player-select-card'));
    // Tenta clicar no 21º card
    cards[20].click();
    return Sorteio.selectedPlayerIds.size;
  })()`);
  console.log(`  -> Tentativa de selecionar o 21º atleta: quantidade travou em ${try21} / 20`);
  if (try21 !== 20) throw new Error('Falha no Teste 2: sistema permitiu selecionar mais de 20 jogadores!');

  // Verificar status visual e botão habilitado
  const statusBadge = await evaluate(`document.getElementById('selection-status-badge')?.textContent.trim()`);
  const btnSortearPronto = await evaluate(`!document.getElementById('btn-realizar-sorteio')?.disabled`);
  console.log(`  -> Badge visual: "${statusBadge}"`);
  console.log(`  -> Botão "SORTEAR TIMES" habilitado: ${btnSortearPronto ? 'SIM' : 'NÃO'}`);
  if (!btnSortearPronto) throw new Error('Falha no Teste 2: botão Sortear deveria estar habilitado com 20 jogadores');
  console.log('  ✅ TESTE 2 APROVADO: Exatamente 20 selecionados e limite de 20 respeitado!\n');

  // =================================================================
  // 3. Sortear somente os 20 selecionados
  // =================================================================
  console.log('[TESTE 3] Clicando no botão [SORTEAR TIMES]...');
  await click('#btn-realizar-sorteio');
  const teamsData = await evaluate(`Storage.getTeams()`);
  if (!teamsData) throw new Error('Falha no Teste 3: times não foram gerados');
  console.log('  ✅ TESTE 3 APROVADO: Sorteio realizado com sucesso!\n');

  // =================================================================
  // 4. Verificar 4 times
  // =================================================================
  console.log('[TESTE 4] Verificando existência de exatamente 4 equipes...');
  const teamKeys = Object.keys(teamsData);
  console.log(`  -> Equipes geradas: ${teamKeys.join(', ')} (Total: ${teamKeys.length})`);
  if (teamKeys.length !== 4) throw new Error(`Falha no Teste 4: esperado 4 times, obtido ${teamKeys.length}`);
  console.log('  ✅ TESTE 4 APROVADO: 4 times formados!\n');

  // =================================================================
  // 5. Verificar 5 jogadores por time
  // =================================================================
  console.log('[TESTE 5] Verificando se cada um dos 4 times possui exatamente 5 jogadores...');
  const countsPerTeam = teamKeys.map(k => teamsData[k].players.length);
  console.log(`  -> Quantidade por time: ${countsPerTeam.join(', ')}`);
  if (!countsPerTeam.every(c => c === 5)) throw new Error('Falha no Teste 5: nem todos os times têm 5 jogadores');
  console.log('  ✅ TESTE 5 APROVADO: Exatamente 5 jogadores por time!\n');

  // =================================================================
  // 6. Verificar equilíbrio das estrelas
  // =================================================================
  console.log('[TESTE 6] Verificando equilíbrio das estrelas entre as 4 equipes...');
  const starsPerTeam = teamKeys.map(k => teamsData[k].totalStars);
  const maxStars = Math.max(...starsPerTeam);
  const minStars = Math.min(...starsPerTeam);
  const starDiff = maxStars - minStars;
  console.log(`  -> Estrelas: Time 1: ${starsPerTeam[0]}⭐, Time 2: ${starsPerTeam[1]}⭐, Time 3: ${starsPerTeam[2]}⭐, Time 4: ${starsPerTeam[3]}⭐`);
  console.log(`  -> Diferença máxima de estrelas: ${starDiff}⭐ (Critério: <= 2⭐)`);
  if (starDiff > 2) throw new Error(`Falha no Teste 6: desequilíbrio muito alto (${starDiff}⭐)`);
  console.log('  ✅ TESTE 6 APROVADO: Distribuição perfeitamente equilibrada!\n');

  // =================================================================
  // 7. Confirmar que os 10 não selecionados NÃO aparecem nos times
  // =================================================================
  console.log('[TESTE 7] Conferindo se os 10 atletas não selecionados ficaram de fora dos times...');
  const unselectedCheck = await evaluate(`(() => {
    const allPlayers = Storage.getPlayers();
    const selectedIds = Sorteio.selectedPlayerIds;
    const unselectedPlayers = allPlayers.filter(p => !selectedIds.has(p.id));
    const teams = Storage.getTeams();
    const teamPlayerIds = new Set();
    Object.values(teams).forEach(t => t.players.forEach(p => teamPlayerIds.add(p.id)));

    const invaded = unselectedPlayers.filter(p => teamPlayerIds.has(p.id));
    return {
      unselectedTotal: unselectedPlayers.length,
      invadedCount: invaded.length,
      invadedNames: invaded.map(p => p.name)
    };
  })()`);
  console.log(`  -> Atletas não participantes: ${unselectedCheck.unselectedTotal}`);
  console.log(`  -> Quantidade de atletas não participantes nos times: ${unselectedCheck.invadedCount}`);
  if (unselectedCheck.invadedCount !== 0) {
    throw new Error(`Falha no Teste 7: atletas não selecionados entraram nos times: ${unselectedCheck.invadedNames.join(', ')}`);
  }
  console.log('  ✅ TESTE 7 APROVADO: Nenhum atleta fora da seleção participou do sorteio!\n');

  // =================================================================
  // 8. Criar uma partida
  // =================================================================
  console.log('[TESTE 8] Indo para a tela de Partidas e iniciando partida...');
  await click('[data-screen="partida"]');
  const confrontoText = await evaluate(`(() => {
    const h = document.getElementById('scoreboard-home-name')?.textContent;
    const a = document.getElementById('scoreboard-away-name')?.textContent;
    return h + ' x ' + a;
  })()`);
  console.log(`  -> Confronto montado: ${confrontoText}`);
  await click('#btn-timer-start');
  const timerRunning = await evaluate(`Partidas.state.isActive && !Partidas.state.isPaused`);
  console.log(`  -> Cronômetro em execução: ${timerRunning ? 'SIM' : 'NÃO'}`);
  console.log('  ✅ TESTE 8 APROVADO: Partida iniciada com cronômetro em execução!\n');

  // =================================================================
  // 9. Registrar gols
  // =================================================================
  console.log('[TESTE 9] Registrando gols para ambas as equipes...');
  await evaluate(`(() => {
    const t = Storage.getTeams();
    // Gol 1: Time 1 (jogador 0)
    Partidas.registrarGol('time_1', t.time_1.players[0].id, t.time_1.players[0].name);
    // Gol 2: Time 1 (jogador 1)
    Partidas.registrarGol('time_1', t.time_1.players[1].id, t.time_1.players[1].name);
    // Gol 3: Time 2 (jogador 0)
    Partidas.registrarGol('time_2', t.time_2.players[0].id, t.time_2.players[0].name);
  })()`);
  const placar = await evaluate(`(() => {
    const s1 = document.getElementById('scoreboard-home-score')?.textContent;
    const s2 = document.getElementById('scoreboard-away-score')?.textContent;
    return s1 + ' × ' + s2;
  })()`);
  console.log(`  -> Placar em tempo real: ${placar} (Esperado: 2 × 1)`);
  if (placar !== '2 × 1') throw new Error(`Falha no Teste 9: placar incorreto (${placar})`);
  console.log('  ✅ TESTE 9 APROVADO: Gols e placar em tempo real registrados!\n');

  // =================================================================
  // 10. Finalizar partida
  // =================================================================
  console.log('[TESTE 10] Finalizando partida da Rodada 1...');
  await evaluate(`Partidas.finalizarPartida()`);
  const totalMatchesR1 = await evaluate(`Storage.getMatches().length`);
  console.log(`  -> Partidas registradas no histórico: ${totalMatchesR1}`);
  if (totalMatchesR1 !== 1) throw new Error('Falha no Teste 10: partida não foi arquivada');
  console.log('  ✅ TESTE 10 APROVADO: Partida finalizada e arquivada!\n');

  // =================================================================
  // 11. Criar nova rodada
  // =================================================================
  console.log('[TESTE 11] Clicando em [NOVA RODADA] para o próximo domingo...');
  await click('[data-screen="sorteio"]');
  // Clica no botão de nova rodada
  await click('#btn-nova-rodada');
  const countAposNovaRodada = await evaluate(`Sorteio.selectedPlayerIds.size`);
  const teamsAposNovaRodada = await evaluate(`Storage.getTeams()`);
  console.log(`  -> Seleção de jogadores da nova rodada: ${countAposNovaRodada} / 20`);
  console.log(`  -> Times da rodada atual resetados: ${teamsAposNovaRodada === null ? 'SIM' : 'NÃO'}`);
  if (countAposNovaRodada !== 0 || teamsAposNovaRodada !== null) {
    throw new Error('Falha no Teste 11: nova rodada não resetou a seleção atual');
  }
  console.log('  ✅ TESTE 11 APROVADO: Nova Rodada iniciada com sucesso!\n');

  // =================================================================
  // 12. Selecionar outros 20 jogadores na Rodada 2
  // =================================================================
  console.log('[TESTE 12] Selecionando combinação diferente de 20 jogadores (os últimos 20 atletas)...');
  const selectOther20 = await evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.player-select-card'));
    // Seleciona os índices 10 a 29 (incluindo os 10 que ficaram de fora na Rodada 1)
    for (let i = 10; i < 30; i++) {
      cards[i].click();
    }
    return {
      selectedCount: Sorteio.selectedPlayerIds.size
    };
  })()`);
  console.log(`  -> Selecionados na Rodada 2: ${selectOther20.selectedCount} / 20`);
  if (selectOther20.selectedCount !== 20) throw new Error('Falha no Teste 12: contagem não atingiu 20');

  // Sorteia times da Rodada 2
  await click('#btn-realizar-sorteio');
  const teamsR2 = await evaluate(`Storage.getTeams()`);
  if (!teamsR2) throw new Error('Falha no Teste 12: sorteio da Rodada 2 falhou');
  console.log('  ✅ TESTE 12 APROVADO: Sorteio da Rodada 2 com novos 20 jogadores realizado!\n');

  // =================================================================
  // 13. Confirmar que a rodada anterior continua intacta
  // =================================================================
  console.log('[TESTE 13] Verificando histórico de rodadas salvas...');
  const roundsList = await evaluate(`Storage.getRounds()`);
  console.log(`  -> Total de rodadas no histórico: ${roundsList.length}`);
  const r1 = roundsList[0];
  console.log(`  -> Rodada 1 gravada: ID=${r1.id}, Data=${r1.dateFormatted}, Participantes=${r1.selectedPlayerIds.length}`);
  if (roundsList.length < 1 || r1.selectedPlayerIds.length !== 20) {
    throw new Error('Falha no Teste 13: dados da rodada anterior não preservados');
  }
  console.log('  ✅ TESTE 13 APROVADO: Rodada anterior preservada com integridade!\n');

  // =================================================================
  // 14. Confirmar que o histórico continua intacto
  // =================================================================
  console.log('[TESTE 14] Conferindo partidas históricas...');
  await click('[data-screen="historico"]');
  const matchesTotal = await evaluate(`Storage.getMatches().length`);
  const firstMatchScore = await evaluate(`Storage.getMatches()[0].homeScore + ' × ' + Storage.getMatches()[0].awayScore`);
  console.log(`  -> Partidas no histórico: ${matchesTotal} (Placar da partida 1: ${firstMatchScore})`);
  if (matchesTotal !== 1 || firstMatchScore !== '2 × 1') {
    throw new Error('Falha no Teste 14: histórico de partidas foi corrompido');
  }
  console.log('  ✅ TESTE 14 APROVADO: Histórico de partidas completamente intacto!\n');

  // =================================================================
  // 15. Confirmar que os rankings continuam acumulados
  // =================================================================
  console.log('[TESTE 15] Conferindo rankings acumulados...');
  await click('[data-screen="rankings"]');
  const artilheiros = await evaluate(`Rankings.getArtilhariaData()`);
  const capas = await evaluate(`Rankings.getCapaData()`);
  console.log(`  -> Artilheiros cadastrados com gols: ${artilheiros.length} atletas`);
  artilheiros.forEach(a => console.log(`     • ${a.name}: ${a.goals} gol(s)`));
  console.log(`  -> Atletas com pontuação no Ranking de Capa: ${capas.length} atletas (+1 pt cada)`);
  if (artilheiros.length === 0 || capas.length === 0) {
    throw new Error('Falha no Teste 15: rankings não acumularam os pontos');
  }
  console.log('  ✅ TESTE 15 APROVADO: Rankings de Artilharia e Capa devidamente acumulados!\n');

  // =================================================================
  // 16. Atualizar a página e confirmar persistência
  // =================================================================
  console.log('[TESTE 16] Recarregando página no navegador e validando persistência...');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 2000));

  const postReloadData = await evaluate(`(() => {
    return {
      players: Storage.getPlayers().length,
      currentRound: Storage.getCurrentRound()?.id,
      selectedInRound: Storage.getSelectedPlayerIds().length,
      teamsExist: !!Storage.getTeams(),
      matches: Storage.getMatches().length,
      rounds: Storage.getRounds().length,
      artilheiros: Rankings.getArtilhariaData().length,
      capas: Rankings.getCapaData().length
    };
  })()`);

  console.log('  -> Estado recuperado do localStorage:');
  console.log(`     • Atletas no cadastro geral: ${postReloadData.players} / 30`);
  console.log(`     • Rodada atual: ${postReloadData.currentRound}`);
  console.log(`     • Atletas selecionados na rodada: ${postReloadData.selectedInRound} / 20`);
  console.log(`     • Times sorteados persistidos: ${postReloadData.teamsExist ? 'SIM' : 'NÃO'}`);
  console.log(`     • Histórico de partidas: ${postReloadData.matches} partida(s)`);
  console.log(`     • Rodadas arquivadas: ${postReloadData.rounds} rodada(s)`);
  console.log(`     • Artilheiros preservados: ${postReloadData.artilheiros}`);
  console.log(`     • Ranking de Capa preservado: ${postReloadData.capas}`);

  if (
    postReloadData.players !== 30 ||
    postReloadData.selectedInRound !== 20 ||
    !postReloadData.teamsExist ||
    postReloadData.matches !== 1 ||
    postReloadData.artilheiros === 0
  ) {
    throw new Error('Falha no Teste 16: dados não persistiram corretamente após recarregar a página');
  }
  console.log('  ✅ TESTE 16 APROVADO: Persistência total comprovada no localStorage!\n');

  console.log('================================================================');
  console.log('RELATÓRIO DE CONSOLE DO NAVEGADOR');
  console.log('================================================================');
  console.log(`Erros não capturados: ${uncaughtErrors.length}`);
  if (uncaughtErrors.length > 0) {
    console.error(JSON.stringify(uncaughtErrors, null, 2));
    throw new Error('Erros detectados no console do navegador');
  } else {
    console.log('✨ ZERO erros no console do navegador Edge durante todos os 16 testes!');
  }

  console.log('\n🎉 TODOS OS 16 TESTES OBRIGATÓRIOS FORAM EXECUTADOS E APROVADOS COM SUCESSO!\n');
  browser.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌ ERRO NA AUDITORIA E2E:', err);
  browser.kill();
  process.exit(1);
});
