/**
 * Módulo de Dashboard (Central da Pelada) - FutRaiz
 * 
 * Regras:
 * 1. Responde rapidamente: O que está acontecendo agora? Como está a rodada? Quem se destaca?
 *    Quem é o artilheiro da rodada? Como estão os números? Últimas partidas? Ranking geral?
 * 2. Visual esportivo, boleiro, moderno, fundo escuro, verde neon, SVGs (sem emojis).
 * 3. IMPORTANTE: NÃO CRIAR RANKING HISTÓRICO DE TIMES! Time 1, Time 2, Time 3 e Time 4
 *    são temporários e exclusivos da rodada atual.
 * 4. Reutiliza funções oficiais de Tabela, Rankings e Storage.
 * 5. Responsivo com organização dedicada para Mobile (360px-412px) e Desktop (portal esportivo).
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { Tabela } from './tabela.js';
import { Rankings } from './rankings.js';

export const Dashboard = {
  init() {
    this.bindEvents();
    this.render();

    Storage.onChange((type) => {
      if ([
        'matches',
        'liveMatch',
        'liveMatchUpdate',
        'rounds',
        'currentRound',
        'selectedPlayers',
        'teams',
        'capas',
        'nightFinalized',
        'reset',
        'historicalDataUpdated'
      ].includes(type)) {
        this.render();
      }
    });
  },

  bindEvents() {
    const container = document.getElementById('screen-dashboard');
    if (!container) return;

    // Delegação de cliques para botões dinâmicos dentro do dashboard
    container.addEventListener('click', (e) => {
      // Botão Ir para Partida (Hero / Live Card)
      const btnGoMatch = e.target.closest('#dash-cta-match, #btn-dash-control-live, #btn-dash-go-match');
      if (btnGoMatch) {
        e.preventDefault();
        const teams = Storage.getTeams();
        if (!teams) {
          Utils.toast('É necessário sortear os times primeiro.', 'warning', 4000);
          if (window.App && typeof window.App.navigateTo === 'function') {
            window.App.navigateTo('sorteio');
          }
        } else {
          if (window.App && typeof window.App.navigateTo === 'function') {
            window.App.navigateTo('partida');
          }
        }
        return;
      }

      // Botão Sorteio / Rodada
      const btnCtaDraw = e.target.closest('#dash-cta-draw, #btn-dash-ver-times');
      if (btnCtaDraw) {
        e.preventDefault();
        if (window.App && typeof window.App.navigateTo === 'function') {
          window.App.navigateTo('sorteio');
        }
        return;
      }

      // Botão Sortear Pronto
      const btnSortear = e.target.closest('#btn-dash-sortear-pronto');
      if (btnSortear) {
        e.preventDefault();
        if (window.App && typeof window.App.navigateTo === 'function') {
          window.App.navigateTo('sorteio');
        }
        return;
      }

      // Botão Selecionar 20 Jogadores / Continuar Seleção
      const btnSelJogadores = e.target.closest('#btn-dash-selecionar-jogadores, #btn-dash-continuar-selecao');
      if (btnSelJogadores) {
        e.preventDefault();
        const players = Storage.getPlayers();
        if (players.length < 20) {
          const missing = 20 - players.length;
          Utils.toast(`Cadastre pelo menos 20 jogadores no sistema. Faltam ${missing}.`, 'warning');
          if (window.App && typeof window.App.navigateTo === 'function') {
            window.App.navigateTo('jogadores');
          }
        } else {
          if (window.App && typeof window.App.navigateTo === 'function') {
            window.App.navigateTo('sorteio');
          }
        }
        return;
      }

      // Links com data-screen
      const screenLink = e.target.closest('[data-screen]');
      if (screenLink && !screenLink.id?.startsWith('dash-cta-match')) {
        const targetScreen = screenLink.dataset.screen;
        if (targetScreen && window.App && typeof window.App.navigateTo === 'function') {
          e.preventDefault();
          window.App.navigateTo(targetScreen);
        }
      }
    });
  },

  // Obtém as partidas da rodada atual de forma estrita e segura
  getRoundMatches(currentRound) {
    const allMatches = Storage.getMatches() || [];
    if (!currentRound) return [];
    let roundMatches = allMatches.filter(m => m.roundId === currentRound.id);
    if (roundMatches.length === 0 && currentRound.status !== 'FINISHED') {
      const legacy = allMatches.filter(m => !m.roundId && m.dateKey === currentRound.dateKey);
      if (legacy.length > 0) roundMatches = legacy;
    }
    // Ordena partidas por ordem cronológica (order ou matchNumber ascendente)
    roundMatches.sort((a, b) => {
      const ordA = a.order || a.matchNumber || 0;
      const ordB = b.order || b.matchNumber || 0;
      return ordA - ordB;
    });
    return roundMatches;
  },

  // Calcula estatísticas consolidadas da rodada
  calcularEstatisticasRodada(currentRound, roundMatches, liveMatch) {
    const isLiveActive = liveMatch && (liveMatch.status === 'running' || liveMatch.status === 'paused' || liveMatch.isActive);
    let totalGoals = 0;
    roundMatches.forEach(m => {
      totalGoals += ((Number(m.homeScore) || 0) + (Number(m.awayScore) || 0));
    });
    if (isLiveActive) {
      totalGoals += ((Number(liveMatch.homeScore) || 0) + (Number(liveMatch.awayScore) || 0));
    }

    const matchesCount = roundMatches.length;
    const mediaGols = matchesCount > 0 ? (totalGoals / matchesCount).toFixed(1) : '0.0';

    const selectedIds = Storage.getSelectedPlayerIds() || [];
    const teams = Storage.getTeams();
    let playersCount = selectedIds.length;
    if (playersCount === 0 && teams) {
      playersCount = 20;
    }

    return {
      matchesCount,
      totalGoals,
      playersCount,
      mediaGols
    };
  },

  // Calcula os jogadores que mais fizeram gols EXCLUSIVAMENTE NA RODADA ATUAL
  calcularArtilhariaRodada(roundMatches, liveMatch) {
    const playerMap = {};
    const isLiveActive = liveMatch && (liveMatch.status === 'running' || liveMatch.status === 'paused' || liveMatch.isActive);

    const processGoal = (g) => {
      if (!g || !g.playerId) return;
      const pid = g.playerId;
      if (!playerMap[pid]) {
        playerMap[pid] = {
          id: pid,
          name: g.playerName || 'Jogador',
          teamId: g.teamId,
          goals: 0
        };
      }
      playerMap[pid].goals += 1;
    };

    roundMatches.forEach(m => {
      if (Array.isArray(m.goals)) {
        m.goals.forEach(processGoal);
      }
    });

    if (isLiveActive && Array.isArray(liveMatch.goals)) {
      liveMatch.goals.forEach(processGoal);
    }

    const list = Object.values(playerMap).filter(p => p.goals > 0);
    list.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
    return list;
  },

  // Calcula destaques automáticos da rodada atual
  calcularDestaquesRodada(roundMatches, standings, artilhariaRodada) {
    const destaques = {};

    // 1. Maior goleada (maior diferença de gols)
    let maiorDif = 0;
    let partidaGoleada = null;
    roundMatches.forEach(m => {
      const h = Number(m.homeScore) || 0;
      const a = Number(m.awayScore) || 0;
      const dif = Math.abs(h - a);
      if (dif > maiorDif && dif > 0) {
        maiorDif = dif;
        partidaGoleada = m;
      }
    });
    if (partidaGoleada) {
      destaques.maiorGoleada = {
        title: 'MAIOR GOLEADA',
        label: `${partidaGoleada.homeTeamName || 'Time 1'} ${partidaGoleada.homeScore} × ${partidaGoleada.awayScore} ${partidaGoleada.awayTeamName || 'Time 2'}`,
        detail: `Diferença de +${maiorDif} ${maiorDif === 1 ? 'gol' : 'gols'}`
      };
    }

    // 2. Partida com mais gols
    let maxGols = 0;
    let partidaMaisGols = null;
    roundMatches.forEach(m => {
      const total = (Number(m.homeScore) || 0) + (Number(m.awayScore) || 0);
      if (total > maxGols && total > 0) {
        maxGols = total;
        partidaMaisGols = m;
      }
    });
    if (partidaMaisGols) {
      destaques.partidaMaisGols = {
        title: 'PARTIDA COM MAIS GOLS',
        label: `${partidaMaisGols.homeTeamName || 'Time 1'} ${partidaMaisGols.homeScore} × ${partidaMaisGols.awayScore} ${partidaMaisGols.awayTeamName || 'Time 2'}`,
        detail: `${maxGols} ${maxGols === 1 ? 'gol marcado' : 'gols marcados'}`
      };
    }

    // 3. Artilheiro da Rodada
    if (artilhariaRodada && artilhariaRodada.length > 0 && artilhariaRodada[0].goals > 0) {
      const art = artilhariaRodada[0];
      destaques.artilheiro = {
        title: 'ARTILHEIRO DA RODADA',
        label: art.name,
        detail: `${art.goals} ${art.goals === 1 ? 'gol' : 'gols'}`
      };
    }

    // 4. Líder da Rodada
    if (standings && standings.length > 0 && standings[0].j > 0) {
      const leader = standings[0];
      destaques.lider = {
        title: 'LÍDER DA RODADA',
        label: leader.name,
        detail: `${leader.pts} ${leader.pts === 1 ? 'ponto' : 'pontos'} (${leader.sg > 0 ? '+' : ''}${leader.sg} SG)`
      };
    }

    return destaques;
  },

  // Renderiza Gráfico 1: Gols por Partida (Barras esportivas modernas)
  renderGraficoGolsPorPartida(roundMatches) {
    if (!roundMatches || roundMatches.length === 0) {
      return `
        <div class="dash-chart-empty">
          <svg class="i i-sm" aria-hidden="true" style="opacity: 0.5;"><use href="#i-ball"/></svg>
          <span>Nenhuma partida finalizada na rodada ainda.</span>
        </div>
      `;
    }

    const maxGols = Math.max(...roundMatches.map(m => (Number(m.homeScore) || 0) + (Number(m.awayScore) || 0)), 1);

    const barsHtml = roundMatches.map((m, idx) => {
      const total = (Number(m.homeScore) || 0) + (Number(m.awayScore) || 0);
      const pct = Math.max(12, Math.round((total / maxGols) * 100));
      const orderNum = m.order || m.matchNumber || (idx + 1);
      const label = `P${String(orderNum).padStart(2, '0')}`;
      const desc = `${m.homeTeamName || 'T1'} ${m.homeScore} × ${m.awayScore} ${m.awayTeamName || 'T2'} (${total} gols)`;

      return `
        <div class="dash-bar-col" title="${desc}">
          <span class="dash-bar-val">${total}</span>
          <div class="dash-bar-track">
            <div class="dash-bar-fill" style="height: ${pct}%;"></div>
          </div>
          <span class="dash-bar-label">${label}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="dash-barchart-wrap">
        <div class="dash-barchart-scroll">
          <div class="dash-barchart-bars">
            ${barsHtml}
          </div>
        </div>
      </div>
    `;
  },

  // Renderiza Gráfico 2: Evolução dos Gols (Linha vetorial SVG com gradiente neon)
  renderGraficoEvolucaoGols(roundMatches) {
    if (!roundMatches || roundMatches.length === 0) {
      return `
        <div class="dash-chart-empty">
          <svg class="i i-sm" aria-hidden="true" style="opacity: 0.5;"><use href="#i-trend"/></svg>
          <span>A evolução será traçada após o término das partidas.</span>
        </div>
      `;
    }

    const n = roundMatches.length;
    const goalsList = roundMatches.map(m => (Number(m.homeScore) || 0) + (Number(m.awayScore) || 0));
    const maxGols = Math.max(...goalsList, 1);

    const svgWidth = Math.max(340, n * 50);
    const svgHeight = 160;
    const paddingLeft = 32;
    const paddingRight = 32;
    const paddingTop = 25;
    const paddingBottom = 35;
    const chartW = svgWidth - paddingLeft - paddingRight;
    const chartH = svgHeight - paddingTop - paddingBottom;

    const points = goalsList.map((g, idx) => {
      const x = n === 1 ? (paddingLeft + chartW / 2) : (paddingLeft + (idx / (n - 1)) * chartW);
      const y = paddingTop + chartH - (g / maxGols) * chartH;
      return { x, y, goals: g, index: idx + 1 };
    });

    const linePointsStr = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPointsStr = `${paddingLeft},${svgHeight - paddingBottom} ` +
      linePointsStr +
      ` ${points[points.length - 1].x.toFixed(1)},${svgHeight - paddingBottom}`;

    const dotsAndLabels = points.map(p => `
      <g class="dash-chart-node">
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" class="dash-line-dot" />
        <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" class="dash-dot-val" text-anchor="middle">${p.goals}</text>
        <text x="${p.x.toFixed(1)}" y="${(svgHeight - 14).toFixed(1)}" class="dash-x-label" text-anchor="middle">P${String(p.index).padStart(2, '0')}</text>
      </g>
    `).join('');

    return `
      <div class="dash-linechart-wrap">
        <div class="dash-linechart-scroll">
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="dash-chart-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="dash-line-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.32" />
                <stop offset="100%" stop-color="#10b981" stop-opacity="0.00" />
              </linearGradient>
            </defs>
            <!-- Linhas de grade sutis -->
            <line x1="${paddingLeft}" y1="${paddingTop}" x2="${svgWidth - paddingRight}" y2="${paddingTop}" class="dash-grid-line" />
            <line x1="${paddingLeft}" y1="${paddingTop + chartH / 2}" x2="${svgWidth - paddingRight}" y2="${paddingTop + chartH / 2}" class="dash-grid-line" />
            <line x1="${paddingLeft}" y1="${svgHeight - paddingBottom}" x2="${svgWidth - paddingRight}" y2="${svgHeight - paddingBottom}" class="dash-grid-line" />
            
            <!-- Área preenchida -->
            <polygon points="${areaPointsStr}" fill="url(#dash-line-grad)" />
            <!-- Linha contínua -->
            <polyline points="${linePointsStr}" class="dash-chart-polyline" />
            <!-- Pontos e legendas -->
            ${dotsAndLabels}
          </svg>
        </div>
      </div>
    `;
  },

  // Renderiza a seção da Partida Atual / Estado de Jogo (Card de Destaque)
  renderHeroMatchSection(currentRound, teams, liveMatch, roundMatches) {
    const isLiveActive = liveMatch && (liveMatch.status === 'running' || liveMatch.status === 'paused' || liveMatch.isActive);
    const selectedIds = Storage.getSelectedPlayerIds() || [];

    // CASO 1: NOITE ENCERRADA (FINISHED)
    if (currentRound && currentRound.status === 'FINISHED') {
      const standings = Tabela.calcularTabelaRodada();
      const champion = standings.length > 0 ? standings[0].name : 'CAMPEÃO';
      return `
        <div class="card dash-hero-card dash-night-finished-hero">
          <div class="dash-hero-badge-row">
            <span class="badge status-finished">
              <svg class="i i-sm" aria-hidden="true"><use href="#i-crown"/></svg>
              <span>NOITE ENCERRADA</span>
            </span>
          </div>
          <div class="dash-finished-center">
            <div class="dash-finished-trophy">
              <svg class="i" style="width: 2.4rem; height: 2.4rem; color: #eab308;" aria-hidden="true"><use href="#i-crown"/></svg>
            </div>
            <div class="dash-finished-info">
              <h2 class="dash-finished-title">CAMPEÃO: ${champion}</h2>
              <p class="dash-finished-desc">Os 5 atletas campeões receberam +1 Capa no ranking permanente.</p>
            </div>
          </div>
          <div class="dash-hero-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-screen="historico">
              <svg class="i i-sm" aria-hidden="true"><use href="#i-history"/></svg>
              <span>Ver Histórico da Noite</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-screen="tabela">
              <svg class="i i-sm" aria-hidden="true"><use href="#i-table"/></svg>
              <span>Ver Tabela Final</span>
            </button>
          </div>
        </div>
      `;
    }

    // CASO 2: PARTIDA EM ANDAMENTO (RUNNING / PAUSED)
    if (isLiveActive) {
      const isPaused = liveMatch.status === 'paused';
      const statusText = isPaused ? 'PAUSADO' : 'EM ANDAMENTO';
      const badgeClass = isPaused ? 'status-paused' : 'status-live';
      const formattedTimer = Utils.formatSeconds(liveMatch.remainingSeconds || 0);
      const matchOrder = liveMatch.order || liveMatch.matchNumber || (roundMatches.length + 1);

      // Resumo de gols da partida ao vivo
      let goalsSummaryHtml = '';
      if (Array.isArray(liveMatch.goals) && liveMatch.goals.length > 0) {
        const counts = {};
        liveMatch.goals.forEach(g => {
          counts[g.playerName] = (counts[g.playerName] || 0) + 1;
        });
        const scorersText = Object.entries(counts)
          .map(([name, count]) => `${name} ${count > 1 ? `(${count})` : ''}`)
          .join(' · ');
        goalsSummaryHtml = `
          <div class="dash-live-scorers">
            <svg class="i i-sm" aria-hidden="true"><use href="#i-ball"/></svg>
            <span><strong>Gols:</strong> ${scorersText}</span>
          </div>
        `;
      }

      return `
        <div class="card dash-hero-card dash-live-standout">
          <div class="dash-live-head">
            <div class="dash-live-tag">
              <span class="live-dot-pulse"></span>
              <span>PARTIDA ${String(matchOrder).padStart(2, '0')}</span>
            </div>
            <span class="badge ${badgeClass}">${statusText}</span>
          </div>

          <div class="dash-live-matchup">
            <div class="dash-live-team left">
              <span class="dash-live-name">${liveMatch.homeTeamName || 'TIME 1'}</span>
            </div>
            <div class="dash-live-score-wrap">
              <span class="dash-live-score">${liveMatch.homeScore || 0}</span>
              <span class="dash-live-sep">×</span>
              <span class="dash-live-score">${liveMatch.awayScore || 0}</span>
            </div>
            <div class="dash-live-team right">
              <span class="dash-live-name">${liveMatch.awayTeamName || 'TIME 2'}</span>
            </div>
          </div>

          <div class="dash-live-timer-row">
            <span class="dash-live-timer">${formattedTimer}</span>
          </div>

          ${goalsSummaryHtml}

          <div class="dash-hero-actions">
            <button type="button" class="btn btn-primary btn-block" id="btn-dash-control-live">
              <svg class="i" aria-hidden="true"><use href="#i-whistle"/></svg>
              <span>IR PARA PARTIDA</span>
            </button>
          </div>
        </div>
      `;
    }

    // CASO 3: RODADA NÃO CONFIGURADA
    if (!teams && selectedIds.length < 20) {
      const count = selectedIds.length;
      return `
        <div class="card dash-hero-card dash-unconfigured-card">
          <div class="dash-unconf-icon">
            <svg class="i" style="width: 2.2rem; height: 2.2rem; color: var(--primary);" aria-hidden="true"><use href="#i-users"/></svg>
          </div>
          <div class="dash-unconf-content">
            <h3 class="dash-unconf-title">RODADA AINDA NÃO CONFIGURADA</h3>
            <p class="dash-unconf-desc">
              ${count > 0 ? `<strong>${count} de 20 jogadores selecionados</strong>. Complete a lista para sortear os times.` : 'Selecione os 20 jogadores para começar a pelada.'}
            </p>
          </div>
          <div class="dash-hero-actions admin-only">
            <button type="button" class="btn btn-primary" id="${count > 0 ? 'btn-dash-continuar-selecao' : 'btn-dash-selecionar-jogadores'}">
              <svg class="i" aria-hidden="true"><use href="#i-users"/></svg>
              <span>${count > 0 ? `CONTINUAR SELEÇÃO (${count}/20)` : 'SELECIONAR 20 JOGADORES'}</span>
            </button>
          </div>
        </div>
      `;
    }

    // CASO 4: 20 JOGADORES SELECIONADOS, AGUARDANDO SORTEIO
    if (!teams && selectedIds.length === 20) {
      return `
        <div class="card dash-hero-card dash-draw-ready-card">
          <div class="dash-unconf-icon">
            <svg class="i" style="width: 2.2rem; height: 2.2rem; color: var(--primary);" aria-hidden="true"><use href="#i-shuffle"/></svg>
          </div>
          <div class="dash-unconf-content">
            <h3 class="dash-unconf-title">AGUARDANDO SORTEIO</h3>
            <p class="dash-unconf-desc">20 jogadores selecionados para esta rodada. Pronto para realizar o sorteio equilibrado.</p>
          </div>
          <div class="dash-hero-actions admin-only">
            <button type="button" class="btn btn-primary btn-dash-sorteio" id="btn-dash-sortear-pronto">
              <span class="btn-icon-wrap" aria-hidden="true">${Utils.icon('shuffle', 22)}</span>
              <span class="btn-label">REALIZAR SORTEIO DOS TIMES</span>
            </button>
          </div>
        </div>
      `;
    }

    // CASO 5: TIMES SORTEADOS, AGUARDANDO PRÓXIMA PARTIDA
    const nextMatchNum = roundMatches.length + 1;
    return `
      <div class="card dash-hero-card dash-waiting-match-card">
        <div class="dash-unconf-icon">
          <svg class="i" style="width: 2.2rem; height: 2.2rem; color: var(--primary);" aria-hidden="true"><use href="#i-whistle"/></svg>
        </div>
        <div class="dash-unconf-content">
          <h3 class="dash-unconf-title">AGUARDANDO PRÓXIMA PARTIDA</h3>
          <p class="dash-unconf-desc">Times formados e prontos em campo para a Partida ${String(nextMatchNum).padStart(2, '0')}.</p>
        </div>
        <div class="dash-hero-actions admin-only">
          <button type="button" class="btn btn-primary" id="btn-dash-go-match">
            <svg class="i" aria-hidden="true"><use href="#i-whistle"/></svg>
            <span>IR PARA PARTIDA</span>
          </button>
        </div>
      </div>
    `;
  },

  // Renderiza a Tabela de Classificação da Rodada (Compacta Boleira)
  renderClassificacaoRodada(standings) {
    if (!standings || standings.length === 0) {
      return `
        <div class="dash-empty-box">
          <p class="text-muted" style="font-size: 0.85rem; margin: 0;">Nenhuma partida realizada hoje.</p>
        </div>
      `;
    }

    return `
      <div class="table-responsive">
        <table class="tabela-standings dash-table-compact">
          <thead>
            <tr>
              <th style="width: 36px;">POS</th>
              <th>TIME</th>
              <th class="text-center">J</th>
              <th class="text-center">V</th>
              <th class="text-center">E</th>
              <th class="text-center">D</th>
              <th class="text-center">GP</th>
              <th class="text-center">GC</th>
              <th class="text-center">SG</th>
              <th class="text-center">PTS</th>
            </tr>
          </thead>
          <tbody>
            ${standings.map((t, idx) => `
              <tr class="${idx === 0 && t.j > 0 ? 'is-leader-row' : ''}">
                <td><strong class="dash-pos-badge ${idx === 0 ? 'pos-1' : ''}">${idx + 1}º</strong></td>
                <td>
                  <span class="dash-team-pill" style="border-left: 3px solid ${t.color || 'var(--primary)'};">
                    ${t.name}
                  </span>
                </td>
                <td class="text-center">${t.j}</td>
                <td class="text-center">${t.v}</td>
                <td class="text-center">${t.e}</td>
                <td class="text-center">${t.d}</td>
                <td class="text-center">${t.gp}</td>
                <td class="text-center">${t.gc}</td>
                <td class="text-center">${t.sg > 0 ? `+${t.sg}` : t.sg}</td>
                <td class="text-center"><strong class="highlight">${t.pts}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  // Renderiza a Artilharia da Rodada Atual
  renderArtilhariaRodada(artilhariaRodada) {
    if (!artilhariaRodada || artilhariaRodada.length === 0) {
      return `
        <div class="dash-empty-box">
          <svg class="i i-sm" aria-hidden="true" style="opacity: 0.5;"><use href="#i-target"/></svg>
          <span style="font-size: 0.88rem; color: var(--text-muted);">Artilharia ainda não definida.</span>
        </div>
      `;
    }

    const top5 = artilhariaRodada.slice(0, 5);
    return `
      <ul class="dash-ranked-list">
        ${top5.map((p, idx) => `
          <li class="dash-ranked-item ${idx === 0 ? 'top-scorer' : ''}">
            <div class="dash-ranked-pos">${idx + 1}º</div>
            <div class="dash-ranked-info">
              <span class="dash-ranked-name">${p.name}</span>
            </div>
            <div class="dash-ranked-metric">
              <strong>${p.goals}</strong>
              <span>${p.goals === 1 ? 'gol' : 'gols'}</span>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  },

  // Renderiza Destaques da Pelada
  renderDestaquesPelada(destaques) {
    const keys = ['maiorGoleada', 'partidaMaisGols', 'artilheiro', 'lider'];
    const validDestaques = keys.map(k => destaques[k]).filter(Boolean);

    if (validDestaques.length === 0) {
      return `
        <div class="dash-empty-box">
          <svg class="i i-sm" aria-hidden="true" style="opacity: 0.5;"><use href="#i-trophy"/></svg>
          <span style="font-size: 0.88rem; color: var(--text-muted);">Destaques serão gerados com os confrontos da rodada.</span>
        </div>
      `;
    }

    return `
      <div class="dash-destaques-grid">
        ${validDestaques.map(d => `
          <div class="dash-destaque-card">
            <span class="dash-destaque-tag">${d.title}</span>
            <strong class="dash-destaque-label">${d.label}</strong>
            <span class="dash-destaque-detail">${d.detail}</span>
          </div>
        `).join('')}
      </div>
    `;
  },

  // Renderiza Ranking de Capas (Top 5 dos Jogadores)
  renderRankingCapas() {
    const capasList = Rankings.getCapaData();
    if (!capasList || capasList.length === 0) {
      return `
        <div class="dash-empty-box">
          <svg class="i i-sm" aria-hidden="true" style="opacity: 0.5;"><use href="#i-crown"/></svg>
          <span style="font-size: 0.88rem; color: var(--text-muted);">Nenhuma Capa atribuída ainda.</span>
        </div>
      `;
    }

    const top5 = capasList.slice(0, 5);
    return `
      <ul class="dash-ranked-list">
        ${top5.map((p, idx) => `
          <li class="dash-ranked-item ${idx === 0 ? 'top-capa' : ''}">
            <div class="dash-ranked-pos">${idx + 1}º</div>
            <div class="dash-ranked-info">
              <span class="dash-ranked-name">${p.name}</span>
            </div>
            <div class="dash-ranked-metric">
              <svg class="i i-sm" style="color: #eab308; vertical-align: -2px;" aria-hidden="true"><use href="#i-crown"/></svg>
              <strong>${p.capas}</strong>
              <span>${p.capas === 1 ? 'Capa' : 'Capas'}</span>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  },

  // Renderiza Ranking Geral dos Jogadores (Top 5)
  renderRankingGeral() {
    const list = Rankings.getGeneralData();
    if (!list || list.length === 0) {
      return `
        <div class="dash-empty-box">
          <span style="font-size: 0.88rem; color: var(--text-muted);">Nenhum atleta ranqueado.</span>
        </div>
      `;
    }

    const top5 = list.slice(0, 5);
    return `
      <ul class="dash-ranked-list">
        ${top5.map((p, idx) => `
          <li class="dash-ranked-item">
            <div class="dash-ranked-pos">${idx + 1}º</div>
            <div class="dash-ranked-info">
              <span class="dash-ranked-name">${p.name}</span>
              <span class="dash-ranked-stars">${Utils.renderStars(p.stars)}</span>
            </div>
            <div class="dash-ranked-general-badges">
              <span class="badge-capa-small" title="Capas">
                <svg class="i i-xs" aria-hidden="true"><use href="#i-crown"/></svg> ${p.capas}
              </span>
              <span class="badge-goal-small" title="Gols">
                <svg class="i i-xs" aria-hidden="true"><use href="#i-ball"/></svg> ${p.goals}
              </span>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  },

  // Renderiza as Últimas Partidas da Rodada
  renderUltimasPartidas(roundMatches) {
    if (!roundMatches || roundMatches.length === 0) {
      return `
        <div class="dash-empty-box">
          <svg class="i i-sm" aria-hidden="true" style="opacity: 0.5;"><use href="#i-history"/></svg>
          <span style="font-size: 0.88rem; color: var(--text-muted);">Nenhuma partida finalizada na rodada ainda.</span>
        </div>
      `;
    }

    // Pega as últimas 5 partidas em ordem decrescente (mais recente primeiro)
    const recent = [...roundMatches].reverse().slice(0, 5);

    return `
      <div class="dash-matches-list">
        ${recent.map((m) => {
          const matchNum = m.order || m.matchNumber || 1;
          let scorersSummary = '';
          if (Array.isArray(m.goals) && m.goals.length > 0) {
            const counts = {};
            m.goals.forEach(g => {
              counts[g.playerName] = (counts[g.playerName] || 0) + 1;
            });
            scorersSummary = Object.entries(counts)
              .map(([n, c]) => `${n} ${c > 1 ? c : ''}`)
              .join(' · ');
          }

          return `
            <div class="dash-match-item">
              <div class="dash-match-tag">PARTIDA ${String(matchNum).padStart(2, '0')}</div>
              <div class="dash-match-row">
                <span class="dash-match-team home">${m.homeTeamName || 'Time 1'}</span>
                <span class="dash-match-score">${m.homeScore || 0} × ${m.awayScore || 0}</span>
                <span class="dash-match-team away">${m.awayTeamName || 'Time 2'}</span>
              </div>
              ${scorersSummary ? `<div class="dash-match-scorers"><svg class="i i-xs" aria-hidden="true"><use href="#i-ball"/></svg> ${scorersSummary}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  // Execução principal da renderização do Dashboard
  render() {
    const container = document.getElementById('screen-dashboard');
    if (!container) return;

    const currentRound = Storage.getCurrentRound();
    const teams = Storage.getTeams();
    const liveMatch = Storage.getCurrentMatch();
    const roundMatches = this.getRoundMatches(currentRound);
    const standings = Tabela.calcularTabelaRodada();
    const artilhariaRodada = this.calcularArtilhariaRodada(roundMatches, liveMatch);
    const destaques = this.calcularDestaquesRodada(roundMatches, standings, artilhariaRodada);
    const stats = this.calcularEstatisticasRodada(currentRound, roundMatches, liveMatch);

    // 1. Atualizar Header / Meta do Dashboard
    const roundDateTag = document.getElementById('dash-round-date-tag');
    if (roundDateTag) {
      roundDateTag.textContent = currentRound ? (currentRound.dateFormatted || currentRound.date) : Utils.formatDate(new Date());
    }

    const roundStatusLabel = document.getElementById('dash-round-status-label');
    const isLiveActive = liveMatch && (liveMatch.status === 'running' || liveMatch.status === 'paused' || liveMatch.isActive);

    if (roundStatusLabel) {
      if (currentRound && currentRound.status === 'FINISHED') {
        roundStatusLabel.textContent = 'NOITE ENCERRADA';
        roundStatusLabel.className = 'badge status-finished';
      } else if (isLiveActive) {
        roundStatusLabel.textContent = 'PARTIDA EM ANDAMENTO';
        roundStatusLabel.className = 'badge status-live';
      } else if (currentRound && currentRound.status === 'ACTIVE') {
        roundStatusLabel.textContent = 'RODADA EM ANDAMENTO';
        roundStatusLabel.className = 'badge status-live';
      } else if (teams) {
        roundStatusLabel.textContent = 'RODADA EM ANDAMENTO';
        roundStatusLabel.className = 'badge status-success';
      } else {
        const selectedIds = Storage.getSelectedPlayerIds() || [];
        if (selectedIds.length === 20) {
          roundStatusLabel.textContent = 'AGUARDANDO SORTEIO';
          roundStatusLabel.className = 'badge status-warning';
        } else {
          roundStatusLabel.textContent = 'RODADA NÃO CONFIGURADA';
          roundStatusLabel.className = 'badge';
        }
      }
    }

    // 2. Atualizar Cards de Resumo da Rodada (Compatibilidade com IDs existentes)
    const pEl = document.getElementById('dash-stat-players');
    const mEl = document.getElementById('dash-stat-matches-today');
    const gEl = document.getElementById('dash-stat-goals-today');
    const avgEl = document.getElementById('dash-stat-avg-goals');

    if (pEl) pEl.textContent = String(stats.playersCount);
    if (mEl) mEl.textContent = String(stats.matchesCount);
    if (gEl) gEl.textContent = String(stats.totalGoals);
    if (avgEl) avgEl.textContent = String(stats.mediaGols);

    // 3. Renderizar Partida Atual / Estado Hero
    const heroBox = document.getElementById('dash-hero-match-box');
    if (heroBox) {
      heroBox.innerHTML = this.renderHeroMatchSection(currentRound, teams, liveMatch, roundMatches);
    }

    // 4. Renderizar Raio-X da Rodada (Gráficos)
    const chartGolsEl = document.getElementById('dash-chart-gols-body');
    if (chartGolsEl) {
      chartGolsEl.innerHTML = this.renderGraficoGolsPorPartida(roundMatches);
    }

    const chartEvolEl = document.getElementById('dash-chart-evolucao-body');
    if (chartEvolEl) {
      chartEvolEl.innerHTML = this.renderGraficoEvolucaoGols(roundMatches);
    }

    // 5. Renderizar Artilharia da Rodada
    const artilhariaBody = document.getElementById('dash-artilharia-body');
    if (artilhariaBody) {
      artilhariaBody.innerHTML = this.renderArtilhariaRodada(artilhariaRodada);
    }

    // 6. Renderizar Classificação da Rodada
    const standingsBody = document.getElementById('dash-standings-body');
    if (standingsBody) {
      standingsBody.innerHTML = this.renderClassificacaoRodada(standings);
    }

    // 7. Renderizar Destaques da Pelada
    const destaquesBody = document.getElementById('dash-destaques-body');
    if (destaquesBody) {
      destaquesBody.innerHTML = this.renderDestaquesPelada(destaques);
    }

    // 8. Renderizar Ranking de Capas
    const capasBody = document.getElementById('dash-capas-body');
    if (capasBody) {
      capasBody.innerHTML = this.renderRankingCapas();
    }

    // 9. Renderizar Ranking Geral
    const rankingGeralBody = document.getElementById('dash-ranking-geral-body');
    if (rankingGeralBody) {
      rankingGeralBody.innerHTML = this.renderRankingGeral();
    }

    // 10. Renderizar Últimas Partidas
    const ultimasBody = document.getElementById('dash-ultimas-partidas-body');
    if (ultimasBody) {
      ultimasBody.innerHTML = this.renderUltimasPartidas(roundMatches);
    }
  }
};
