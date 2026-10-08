/**
 * Módulo de Partidas - Familia do Fut
 * * MODELO: "QUEM GANHA FICA" (Winner Stays On)
 * * Regras:
 * 1. A primeira partida é obrigatoriamente TIME 1 x TIME 2.
 * 2. O time vencedor permanece em campo.
 * 3. O time perdedor sai da partida atual (mas continua disponível no campeonato e pode ser escolhido novamente depois).
 * 4. O administrador escolhe qual dos outros 3 times será o próximo adversário (nunca contra si mesmo).
 * 5. EMPATE: O sistema impede o avanço até que o administrador clique em "DEFINIR VENCEDOR"
 *    e selecione qual dos dois times permanece em campo (decisão administrativa registrada).
 * 6. Após definir vencedor e escolher adversário, cria a próxima partida (SCHEDULED) para o admin iniciar.
 * 7. Não há quantidade fixa de partidas (3, 5, 8, 10, 20...). A noite só termina quando o admin decidir.
 * 8. "ENCERRAR NOITE": Disponível somente sem partida em andamento. Apresenta resumo de jogos realizados,
 *    último vencedor e classificação atual antes de confirmar.
 * 9. Ao encerrar a noite: calcula a tabela final, define o campeão e concede exatamente +1 Capa aos 5 jogadores do campeão.
 * 10. Capa NUNCA é atribuída por partida individual.
 * 11. Ícones SVG minimalistas (sem emojis na interface).
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { Tabela } from './tabela.js';

export const Partidas = {
  timerInterval: null,
  publicTickerInterval: null,
  _isTransitioning: false,

  // Estado da partida e do fluxo "Quem Ganha Fica"
  state: {
    order: 1,
    status: 'ready', // 'ready' (SCHEDULED) | 'running' | 'paused' | 'finished'
    isActive: false,
    isPaused: false,
    durationMinutes: 7,
    durationSeconds: 420,
    remainingSeconds: 420,
    startedAt: null,
    pausedAt: null,
    lastTick: null,
    homeTeamId: 'time_1',
    awayTeamId: 'time_2',
    homeTeamName: 'Time 1',
    awayTeamName: 'Time 2',
    homeScore: 0,
    awayScore: 0,
    goals: [],
    // Controle específico "Quem Ganha Fica"
    winnerTeamId: null,
    winnerTeamName: null,
    loserTeamId: null,
    isTie: false,
    tiePendingResolution: false,
    waitingNextOpponent: false,
    waitingTieNextMatch: false,
    tieNextMatch: null,
    outsideWaitingTeamIds: [],
    decisaoAdmin: false,
    lastMatchSummary: null
  },

  init() {
    const defaultMins = Storage.getDefaultMatchDurationMinutes() || 7;
    this.state.durationMinutes = defaultMins;
    this.state.durationSeconds = defaultMins * 60;
    this.state.remainingSeconds = defaultMins * 60;
    this.restoreOrInitMatch();
    this.bindEvents();
    this.render();

    // Sincronização via Supabase Realtime
    Storage.onChange((type, data) => {
      if (this._isTransitioning) {
        return;
      }
      if (type === 'liveMatchUpdate') {
        this.handleLiveUpdate(data);
      } else if (type === 'teamNameUpdated') {
        const teams = Storage.getTeams() || {};
        if (teams[this.state.homeTeamId]) this.state.homeTeamName = teams[this.state.homeTeamId].name;
        if (teams[this.state.awayTeamId]) this.state.awayTeamName = teams[this.state.awayTeamId].name;
        this.renderScoreboard();
        this.renderQuemGanhaFicaBanner();
        this.renderGoalsList();
      } else if (['currentRound', 'teams', 'newRound', 'nightFinalized', 'matches', 'reset'].includes(type)) {
        if (type !== 'nightFinalized' && type !== 'reset' && (this.state.status === 'running' || this.state.status === 'paused')) {
          const round = Storage.getCurrentRound();
          if (round && round.status !== 'FINISHED') {
            return;
          }
        }
        if (this.timerInterval) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
        }
        if (this.publicTickerInterval) {
          clearInterval(this.publicTickerInterval);
          this.publicTickerInterval = null;
        }
        this.hideNightFinishedUI();
        this.restoreOrInitMatch();
        this.render();
      }
    });
  },

  calculateCurrentRemainingSeconds(state = this.state) {
    if (!state) return 0;
    const totalSecs = state.durationSeconds || state.duration_seconds || (state.durationMinutes ? state.durationMinutes * 60 : 420);

    if (state.status === 'ready') {
      return totalSecs;
    }
    if (state.status === 'finished') {
      return 0;
    }
    if (state.status === 'paused') {
      const rem = state.remainingSeconds !== undefined ? state.remainingSeconds : state.tempo_restante;
      return rem !== undefined ? Math.max(0, rem) : totalSecs;
    }
    if (state.status === 'running') {
      const startedAtIso = state.startedAt || state.started_at;
      if (!startedAtIso) {
        state.startedAt = new Date().toISOString();
        if (state.remainingAtStart === undefined && state.remaining_at_start === undefined) {
          state.remainingAtStart = state.remainingSeconds !== undefined ? state.remainingSeconds : (state.tempo_restante !== undefined ? state.tempo_restante : totalSecs);
        }
      }
      const rawStart = state.startedAt || state.started_at;
      const startedTime = new Date(rawStart).getTime();
      if (!isNaN(startedTime)) {
        const now = Date.now();
        const elapsedSinceStart = Math.max(0, Math.floor((now - startedTime) / 1000));
        const baseRemaining = (state.remainingAtStart !== undefined ? state.remainingAtStart : state.remaining_at_start) !== undefined
          ? (state.remainingAtStart !== undefined ? state.remainingAtStart : state.remaining_at_start)
          : (state.remainingSeconds !== undefined ? state.remainingSeconds : (state.tempo_restante !== undefined ? state.tempo_restante : totalSecs));
        return Math.max(0, baseRemaining - elapsedSinceStart);
      }
      return state.remainingSeconds !== undefined ? Math.max(0, state.remainingSeconds) : totalSecs;
    }
    return totalSecs;
  },

  handleLiveUpdate(liveData) {
    if (this._isTransitioning) {
      return;
    }
    if (!liveData) {
      const round = Storage.getCurrentRound();
      if ((this.state.status === 'running' || this.state.status === 'paused') && round && round.status !== 'FINISHED') {
        return;
      }
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      if (this.publicTickerInterval) {
        clearInterval(this.publicTickerInterval);
        this.publicTickerInterval = null;
      }
      this.hideNightFinishedUI();
      this.restoreOrInitMatch();
      this.render();
      return;
    }

    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      if (this.publicTickerInterval) {
        clearInterval(this.publicTickerInterval);
        this.publicTickerInterval = null;
      }
      this.state.status = 'finished';
      this.state.isActive = false;
      this.state.isPaused = false;
      this.state.waitingNextOpponent = false;
      this.state.waiting_next_opponent = false;
      this.state.waitingTieNextMatch = false;
      this.state.waiting_tie_next_match = false;
      this.render();
      return;
    }

    const data = liveData.payload && typeof liveData.payload === 'object'
      ? { ...liveData.payload, ...liveData }
      : liveData;

    const incomingOrder = data.order_num !== undefined ? data.order_num : (data.order !== undefined ? data.order : this.state.order);

    // Proteção contra eventos Realtime atrasados ou fora de ordem:
    // Um evento de partida antiga (order menor) NUNCA pode sobrescrever a partida preparada atual
    if (incomingOrder < this.state.order) {
      return;
    }

    const newStatus = data.status || (data.is_active ? (data.is_paused ? 'paused' : 'running') : (data.isActive ? (data.isPaused ? 'paused' : 'running') : 'ready'));

    // Se o estado local já está em 'ready' (partida preparada) para este order, não aceitar reversão para 'finished' de eventos atrasados
    if (incomingOrder === this.state.order && this.state.status === 'ready' && newStatus === 'finished') {
      return;
    }

    this.state.order = incomingOrder;
    this.state.homeTeamId = data.home_team_id || data.homeTeamId || this.state.homeTeamId;
    this.state.awayTeamId = data.away_team_id || data.awayTeamId || this.state.awayTeamId;
    this.state.homeTeamName = data.time_casa_nome || data.homeTeamName || this.state.homeTeamName;
    this.state.awayTeamName = data.time_fora_nome || data.awayTeamName || this.state.awayTeamName;
    this.state.homeScore = data.placar_casa !== undefined ? data.placar_casa : (data.homeScore !== undefined ? data.homeScore : this.state.homeScore);
    this.state.awayScore = data.placar_fora !== undefined ? data.placar_fora : (data.awayScore !== undefined ? data.awayScore : this.state.awayScore);
    this.state.goals = Array.isArray(data.goals) ? data.goals : (Array.isArray(data.gols) ? data.gols : []);

    this.state.status = newStatus;
    this.state.isActive = newStatus === 'running' || newStatus === 'paused';
    this.state.isPaused = newStatus === 'paused';

    const incomingWinnerId = data.winnerTeamId || data.winner_team_id || null;
    const incomingWinnerName = data.winnerTeamName || data.winner_team_name || null;
    const incomingLoserId = data.loserTeamId || data.loser_team_id || null;
    const incomingWaitingNext = Boolean(data.waitingNextOpponent !== undefined ? data.waitingNextOpponent : data.waiting_next_opponent);
    const incomingWaitingTie = Boolean(data.waitingTieNextMatch !== undefined ? data.waitingTieNextMatch : data.waiting_tie_next_match);

    if (incomingWinnerId) {
      this.state.winnerTeamId = incomingWinnerId;
      this.state.winner_team_id = incomingWinnerId;
      this.state.winnerTeamName = incomingWinnerName;
      this.state.winner_team_name = incomingWinnerName;
      this.state.loserTeamId = incomingLoserId;
      this.state.loser_team_id = incomingLoserId;
    } else if (incomingWaitingNext && this.state.winnerTeamId) {
      // Preserva o vencedor atual para não permitir que evento limpe com null/undefined
    } else if (newStatus !== 'finished') {
      this.state.winnerTeamId = null;
      this.state.winner_team_id = null;
      this.state.winnerTeamName = null;
      this.state.winner_team_name = null;
      this.state.loserTeamId = null;
      this.state.loser_team_id = null;
    }

    this.state.isTie = Boolean(data.isTie !== undefined ? data.isTie : data.is_tie);
    this.state.tiePendingResolution = Boolean(data.tiePendingResolution);
    this.state.waitingNextOpponent = incomingWaitingNext;
    this.state.waiting_next_opponent = incomingWaitingNext;
    this.state.waitingTieNextMatch = incomingWaitingTie;
    this.state.waiting_tie_next_match = incomingWaitingTie;
    this.state.tieNextMatch = data.tieNextMatch || data.tie_next_match || null;
    this.state.decisaoAdmin = Boolean(data.decisaoAdmin);
    this.state.lastMatchSummary = data.lastMatchSummary || data.last_match_summary || null;

    if (data.duration_seconds || data.durationSeconds) {
      this.state.durationSeconds = data.durationSeconds || data.duration_seconds;
      this.state.durationMinutes = Math.floor(this.state.durationSeconds / 60);
    }
    this.state.startedAt = data.startedAt || data.started_at || null;
    this.state.pausedAt = data.pausedAt || data.paused_at || null;
    this.state.remainingAtStart = data.remainingAtStart !== undefined      ? data.remainingAtStart      : (data.remaining_at_start !== undefined ? data.remaining_at_start : (data.remainingSeconds !== undefined ? data.remainingSeconds : (data.tempo_restante !== undefined ? data.tempo_restante : this.state.durationSeconds)));

    if (newStatus === 'running') {
      this.state.remainingSeconds = this.calculateCurrentRemainingSeconds();
      this.startTimerLoop();
    } else {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      if (this.publicTickerInterval) {
        clearInterval(this.publicTickerInterval);
        this.publicTickerInterval = null;
      }
      this.state.remainingSeconds = data.remainingSeconds !== undefined        ? data.remainingSeconds        : (data.tempo_restante !== undefined ? data.tempo_restante : this.state.durationSeconds);
      this.updateTimerDisplay();
    }

    this.render();
  },

  startPublicTicker() {
    this.startTimerLoop();
  },

  restoreOrInitMatch() {
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      if (this.publicTickerInterval) {
        clearInterval(this.publicTickerInterval);
        this.publicTickerInterval = null;
      }
      const matches = Storage.getMatches().filter(m => (round && m.roundId === round.id) || m.dateKey === round.dateKey);
      const lastMatch = matches[0];
      const teams = Storage.getTeams() || {};
      const defaultMins = Storage.getDefaultMatchDurationMinutes() || 7;
      this.state = {
        order: matches.length,
        status: 'finished',
        isActive: false,
        isPaused: false,
        durationMinutes: defaultMins,
        durationSeconds: defaultMins * 60,
        remainingSeconds: 0,
        startedAt: null,
        pausedAt: null,
        lastTick: null,
        homeTeamId: lastMatch ? lastMatch.homeTeamId : 'time_1',
        awayTeamId: lastMatch ? lastMatch.awayTeamId : 'time_2',
        homeTeamName: lastMatch ? lastMatch.homeTeamName : (teams.time_1?.name || 'Time 1'),
        awayTeamName: lastMatch ? lastMatch.awayTeamName : (teams.time_2?.name || 'Time 2'),
        homeScore: lastMatch ? lastMatch.homeScore : 0,
        awayScore: lastMatch ? lastMatch.awayScore : 0,
        goals: lastMatch ? (lastMatch.goals || []) : [],
        winnerTeamId: lastMatch ? lastMatch.winner : null,
        winner_team_id: lastMatch ? lastMatch.winner : null,
        winnerTeamName: lastMatch && lastMatch.winner ? (teams[lastMatch.winner]?.name || lastMatch.winner) : null,
        winner_team_name: lastMatch && lastMatch.winner ? (teams[lastMatch.winner]?.name || lastMatch.winner) : null,
        loserTeamId: lastMatch ? lastMatch.loser : null,
        loser_team_id: lastMatch ? lastMatch.loser : null,
        isTie: lastMatch ? Boolean(lastMatch.isTie) : false,
        tiePendingResolution: false,
        waitingNextOpponent: false,
        waiting_next_opponent: false,
        waitingTieNextMatch: false,
        waiting_tie_next_match: false,
        tieNextMatch: null,
        outsideWaitingTeamIds: [],
        decisaoAdmin: false,
        lastMatchSummary: lastMatch ? {
          order: matches.length,
          homeTeamName: lastMatch.homeTeamName,
          awayTeamName: lastMatch.awayTeamName,
          homeScore: lastMatch.homeScore,
          awayScore: lastMatch.awayScore,
          resultText: lastMatch.resultText || (lastMatch.winner ? `${teams[lastMatch.winner]?.name || lastMatch.winner} venceu` : 'Empate'),
          winnerTeamId: lastMatch.winner,
          winnerTeamName: lastMatch.winner ? (teams[lastMatch.winner]?.name || lastMatch.winner) : null
        } : null
      };
      return;
    }

    const saved = Storage.getLiveMatch();
    const roundKey = round ? round.dateKey : Utils.getDateKey(new Date());
    const rawMatches = Storage.getMatches().filter(m => (round && m.roundId === round.id) || m.dateKey === roundKey);
    const matches = [...rawMatches].sort((a, b) => {
      const ordA = a.matchOrder || a.ordem || 0;
      const ordB = b.matchOrder || b.ordem || 0;
      if (ordB !== ordA) return ordB - ordA;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    if (saved && (saved.status === 'ready' || saved.status === 'running' || saved.status === 'paused' || saved.waitingNextOpponent || saved.waiting_next_opponent || saved.waitingTieNextMatch || saved.waiting_tie_next_match || (saved.goals && saved.goals.length > 0))) {
      const winnerId = saved.winnerTeamId || saved.winner_team_id || (saved.waitingNextOpponent && matches.length > 0 ? matches[0].winner : null);
      const teams = Storage.getTeams() || {};
      const winnerName = saved.winnerTeamName || saved.winner_team_name || (winnerId && teams[winnerId] ? teams[winnerId].name : null);
      const loserId = saved.loserTeamId || saved.loser_team_id || (saved.waitingNextOpponent && matches.length > 0 ? matches[0].loser : null);
      const isWaitingOpponent = Boolean(saved.waitingNextOpponent !== undefined ? saved.waitingNextOpponent : saved.waiting_next_opponent);
      const isWaitingTie = Boolean(saved.waitingTieNextMatch !== undefined ? saved.waitingTieNextMatch : saved.waiting_tie_next_match);

      const savedStatus = saved.status || (saved.isActive ? (saved.isPaused ? 'paused' : 'running') : 'ready');
      const savedOrder = saved.order_num !== undefined ? saved.order_num : (saved.order !== undefined ? saved.order : (matches.length + (savedStatus === 'finished' ? 0 : 1)));
      const homeId = saved.home_team_id || saved.homeTeamId || 'time_1';
      const awayId = saved.away_team_id || saved.awayTeamId || 'time_2';
      const homeName = saved.time_casa_nome || saved.homeTeamName || (teams[homeId]?.name || 'Time 1');
      const awayName = saved.time_fora_nome || saved.awayTeamName || (teams[awayId]?.name || 'Time 2');

      this.state = {
        ...this.state,
        ...saved,
        order: savedOrder,
        status: savedStatus,
        isActive: savedStatus === 'running' || savedStatus === 'paused',
        isPaused: savedStatus === 'paused',
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeTeamName: homeName,
        awayTeamName: awayName,
        homeScore: saved.placar_casa !== undefined ? saved.placar_casa : (saved.homeScore !== undefined ? saved.homeScore : 0),
        awayScore: saved.placar_fora !== undefined ? saved.placar_fora : (saved.awayScore !== undefined ? saved.awayScore : 0),
        winnerTeamId: winnerId,
        winner_team_id: winnerId,
        winnerTeamName: winnerName,
        winner_team_name: winnerName,
        loserTeamId: loserId,
        loser_team_id: loserId,
        waitingNextOpponent: isWaitingOpponent,
        waiting_next_opponent: isWaitingOpponent,
        waitingTieNextMatch: isWaitingTie,
        waiting_tie_next_match: isWaitingTie,
        tieNextMatch: saved.tieNextMatch || saved.tie_next_match || null,
        outsideWaitingTeamIds: saved.outsideWaitingTeamIds || Object.keys(teams).filter(id => id !== homeId && id !== awayId),
        durationMinutes: saved.durationMinutes || (Storage.getDefaultMatchDurationMinutes() || 7),
        durationSeconds: saved.durationSeconds || ((saved.durationMinutes || (Storage.getDefaultMatchDurationMinutes() || 7)) * 60),
        remainingSeconds: saved.remainingSeconds !== undefined ? saved.remainingSeconds : (saved.tempo_restante !== undefined ? saved.tempo_restante : ((saved.durationMinutes || (Storage.getDefaultMatchDurationMinutes() || 7)) * 60)),
        goals: saved.goals || saved.gols || []
      };

      // Se waitingNextOpponent estiver ativo mas winnerTeamId estiver vazio por qualquer motivo,
      // recupera o vencedor da última partida persistida no histórico
      if (this.state.waitingNextOpponent && !this.state.winnerTeamId && matches.length > 0 && matches[0].winner) {
        const lastWinner = matches[0].winner;
        this.state.winnerTeamId = lastWinner;
        this.state.winner_team_id = lastWinner;
        this.state.winnerTeamName = (teams[lastWinner] && teams[lastWinner].name) || lastWinner;
        this.state.winner_team_name = this.state.winnerTeamName;
        if (matches[0].loser) {
          this.state.loserTeamId = matches[0].loser;
          this.state.loser_team_id = matches[0].loser;
        }
      }

      // Recalcula tempo caso estivesse em andamento
      if (this.state.status === 'running' && !this.state.isPaused) {
        const currentRemaining = this.calculateCurrentRemainingSeconds();
        this.state.remainingSeconds = currentRemaining;
        if (currentRemaining > 0) {
          this.startTimerLoop();
        } else {
          this.state.remainingSeconds = 0;
          this.updateTimerDisplay();
        }
      }
    } else {
      this.determineMatchFromHistory(matches);
    }
  },

  determineMatchFromHistory(matches) {
    const teams = Storage.getTeams() || {};
    const defaultMins = this.state.durationMinutes || Storage.getDefaultMatchDurationMinutes() || 7;

    const sortedMatches = [...matches].sort((a, b) => {
      const ordA = a.matchOrder || a.ordem || 0;
      const ordB = b.matchOrder || b.ordem || 0;
      if (ordB !== ordA) return ordB - ordA;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    if (sortedMatches.length === 0) {
      // Primeira partida: Time 1 x Time 2 (obrigatória)
      this.state = {
        order: 1,
        status: 'ready',
        isActive: false,
        isPaused: false,
        durationMinutes: defaultMins,
        durationSeconds: defaultMins * 60,
        remainingSeconds: defaultMins * 60,
        startedAt: null,
        pausedAt: null,
        lastTick: null,
        homeTeamId: 'time_1',
        awayTeamId: 'time_2',
        homeTeamName: teams.time_1 ? teams.time_1.name : 'Time 1',
        awayTeamName: teams.time_2 ? teams.time_2.name : 'Time 2',
        homeScore: 0,
        awayScore: 0,
        goals: [],
        winnerTeamId: null,
        winnerTeamName: null,
        loserTeamId: null,
        isTie: false,
        tiePendingResolution: false,
        waitingNextOpponent: false,
        decisaoAdmin: false,
        lastMatchSummary: null
      };
    } else {
      const lastMatch = sortedMatches[0]; // mais recente
      if (lastMatch.winner) {
        const winnerId = lastMatch.winner;
        const winnerTeam = teams[winnerId] || { name: winnerId };
        this.state = {
          order: sortedMatches.length,
          status: 'finished',
          isActive: false,
          isPaused: false,
          durationMinutes: defaultMins,
          durationSeconds: defaultMins * 60,
          remainingSeconds: defaultMins * 60,
          startedAt: null,
          pausedAt: null,
          lastTick: null,
          homeTeamId: lastMatch.homeTeamId,
          awayTeamId: lastMatch.awayTeamId,
          homeTeamName: lastMatch.homeTeamName,
          awayTeamName: lastMatch.awayTeamName,
          homeScore: lastMatch.homeScore,
          awayScore: lastMatch.awayScore,
          goals: lastMatch.goals || [],
          winnerTeamId: winnerId,
          winner_team_id: winnerId,
          winnerTeamName: winnerTeam.name,
          winner_team_name: winnerTeam.name,
          loserTeamId: lastMatch.loser,
          loser_team_id: lastMatch.loser,
          isTie: Boolean(lastMatch.isTie),
          tiePendingResolution: false,
          waitingNextOpponent: true,
          waiting_next_opponent: true,
          outsideWaitingTeamIds: Object.keys(teams).filter(id => id !== lastMatch.homeTeamId && id !== lastMatch.awayTeamId),
          decisaoAdmin: Boolean(lastMatch.decisaoAdmin),
          lastMatchSummary: {
            order: sortedMatches.length,
            homeTeamName: lastMatch.homeTeamName,
            awayTeamName: lastMatch.awayTeamName,
            homeScore: lastMatch.homeScore,
            awayScore: lastMatch.awayScore,
            resultText: lastMatch.resultText,
            winnerTeamId: winnerId,
            winnerTeamName: winnerTeam.name
          }
        };
      } else {
        // Empate: ambos saem de campo, os 2 times que estavam fora entram na próxima partida
        const allTeamIds = Object.keys(teams).length >= 4 ? Object.keys(teams) : ['time_1', 'time_2', 'time_3', 'time_4'];
        const outsideTeamIds = allTeamIds.filter(id => id !== lastMatch.homeTeamId && id !== lastMatch.awayTeamId);
        const nextHomeId = outsideTeamIds[0] || 'time_3';
        const nextAwayId = outsideTeamIds[1] || 'time_4';
        const nextHomeTeam = teams[nextHomeId] || { name: nextHomeId.replace('time_', 'Time ') };
        const nextAwayTeam = teams[nextAwayId] || { name: nextAwayId.replace('time_', 'Time ') };

        this.state = {
          order: sortedMatches.length + 1,
          status: 'ready',
          isActive: false,
          isPaused: false,
          durationMinutes: defaultMins,
          durationSeconds: defaultMins * 60,
          remainingSeconds: defaultMins * 60,
          startedAt: null,
          pausedAt: null,
          lastTick: null,
          homeTeamId: nextHomeId,
          awayTeamId: nextAwayId,
          homeTeamName: nextHomeTeam.name,
          awayTeamName: nextAwayTeam.name,
          homeScore: 0,
          awayScore: 0,
          goals: [],
          winnerTeamId: null,
          winner_team_id: null,
          winnerTeamName: null,
          winner_team_name: null,
          loserTeamId: null,
          loser_team_id: null,
          isTie: true,
          tiePendingResolution: false,
          waitingNextOpponent: false,
          waiting_next_opponent: false,
          waitingTieNextMatch: true,
          waiting_tie_next_match: true,
          tieNextMatch: {
            homeTeamId: nextHomeId,
            awayTeamId: nextAwayId,
            homeTeamName: nextHomeTeam.name,
            awayTeamName: nextAwayTeam.name
          },
          outsideWaitingTeamIds: [lastMatch.homeTeamId, lastMatch.awayTeamId],
          decisaoAdmin: false,
          lastMatchSummary: {
            order: sortedMatches.length,
            homeTeamName: lastMatch.homeTeamName,
            awayTeamName: lastMatch.awayTeamName,
            homeScore: lastMatch.homeScore,
            awayScore: lastMatch.awayScore,
            resultText: lastMatch.resultText || 'Empate',
            winnerTeamId: null,
            winnerTeamName: null,
            isTie: true
          }
        };
      }
    }
  },

  bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    // Duração da partida
    const durationSelect = document.getElementById('match-duration-select');
    const customInput = document.getElementById('match-duration-custom');

    if (durationSelect) {
      durationSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          if (customInput) customInput.style.display = 'inline-block';
        } else {
          if (customInput) customInput.style.display = 'none';
          this.setDuration(e.target.value);
        }
      });
    }

    if (customInput) {
      customInput.addEventListener('change', (e) => {
        this.setDuration(e.target.value);
      });
    }

    // Botões do Cronômetro
    const btnStart = document.getElementById('btn-timer-start');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnFinish = document.getElementById('btn-timer-finish');
    const btnReset = document.getElementById('btn-timer-reset');

    if (btnStart) btnStart.addEventListener('click', () => this.startOrResumeMatch());
    if (btnPause) btnPause.addEventListener('click', () => this.pauseMatch());
    if (btnFinish) btnFinish.addEventListener('click', () => this.solicitarFinalizacao());
    if (btnReset) btnReset.addEventListener('click', () => this.resetTimer());

    // Botões de Gol
    const btnGoalHome = document.getElementById('btn-add-goal-home');
    const btnGoalAway = document.getElementById('btn-add-goal-away');

    if (btnGoalHome) {
      btnGoalHome.addEventListener('click', () => {
        this.abrirModalSeletorGol(this.state.homeTeamId);
      });
    }

    if (btnGoalAway) {
      btnGoalAway.addEventListener('click', () => {
        this.abrirModalSeletorGol(this.state.awayTeamId);
      });
    }

    // Botão Encerrar Noite
    document.addEventListener('click', (e) => {
      const btnEncerrar = e.target.closest('#btn-encerrar-noite');
      if (btnEncerrar) {
        this.solicitarEncerramentoNoite();
      }

      // Iniciar próxima partida após empate (os dois times de fora entram)
      const btnStartTieNext = e.target.closest('#btn-start-tie-next-match');
      if (btnStartTieNext) {
        this.iniciarProximaPartidaAposEmpate();
      }

      // Escolha do próximo adversário (Quem ganha fica)
      const btnOpponentChoice = e.target.closest('.btn-choice-next-opponent');
      if (btnOpponentChoice) {
        const opponentTeamId = btnOpponentChoice.dataset.team;
        this.selecionarProximoAdversario(opponentTeamId);
      }
    });

    // Atualização imediata do cronômetro ao retornar à aba
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.state.status === 'running') {
          this.state.remainingSeconds = this.calculateCurrentRemainingSeconds();
          this.updateTimerDisplay();
          if (!this.timerInterval && this.state.remainingSeconds > 0) {
            this.startTimerLoop();
          }
        }
      });
    }
  },

  setDuration(minutes) {
    Storage.assertAdmin('Alterar tempo de partida');
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      return;
    }
    if (this.state.status === 'running') {
      Utils.toast('Não é possível alterar o tempo com a partida em andamento.', 'warning');
      return;
    }
    const defaultMins = Storage.getDefaultMatchDurationMinutes() || 7;
    const mins = Math.max(1, Math.min(90, parseInt(minutes, 10) || defaultMins));
    this.state.durationMinutes = mins;
    this.state.durationSeconds = mins * 60;
    this.state.remainingSeconds = mins * 60;
    this.state.remainingAtStart = mins * 60;
    this.updateTimerDisplay();
    this.saveLocalStateOnly();
  },

  // --------------------------------------------------------------------------
  // CONTROLE DO CRONÔMETRO E PARTIDA
  // --------------------------------------------------------------------------
  iniciarPartida() {
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      Utils.toast('Esta noite já foi encerrada. Não é possível iniciar uma nova partida.', 'warning');
      return;
    }
    return this.startOrResumeMatch();
  },

  startOrResumeMatch() {
    Storage.assertAdmin('Iniciar partida');
    const teams = Storage.getTeams();
    if (!teams) {
      Utils.toast('Realize o sorteio dos times antes de iniciar uma partida.', 'warning');
      return;
    }

    const round = Storage.getCurrentRound();
    if (!round) {
      Utils.toast('Crie uma rodada antes de iniciar.', 'warning');
      return;
    }

    if (round.status === 'FINISHED') {
      Utils.toast('Esta noite já foi encerrada. Não é possível iniciar uma nova partida.', 'warning');
      return;
    }

    if (this.state.waitingTieNextMatch) {
      this.state.waitingTieNextMatch = false;
      this.state.waiting_tie_next_match = false;
      this.state.isTie = false;
    }

    if (this.state.waitingNextOpponent) {
      Utils.toast('Escolha o próximo adversário para criar o próximo confronto.', 'warning', 4000);
      return;
    }

    // Ao iniciar a primeira partida, a noite é marcada como ACTIVE (bloqueando times)
    if (round.status === 'PLANNING' || round.status === 'READY') {
      Storage.startNight();
      Utils.toast('Noite iniciada! Composição dos times bloqueada.', 'info', 3500);
    }

    if (this.state.status === 'finished') {
      Utils.toast('Esta partida já foi finalizada.', 'info');
      return;
    }

    if (this.state.status === 'paused') {
      this.resumeMatch();
      return;
    }

    const nowIso = new Date().toISOString();
    this.state.status = 'running';
    this.state.isActive = true;
    this.state.isPaused = false;
    this.state.startedAt = nowIso;
    this.state.pausedAt = null;
    this.state.remainingAtStart = this.state.remainingSeconds !== undefined ? this.state.remainingSeconds : this.state.durationSeconds;
    this.state.lastTick = Date.now();

    this.startTimerLoop();
    this.render();
    this.saveFullState();

    Utils.sound.playWhistle();
    Utils.toast(`Partida ${String(this.state.order).padStart(2, '0')} iniciada!`, 'success', 2000);
  },

  resumeMatch() {
    Storage.assertAdmin('Retomar partida');
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      Utils.toast('Esta noite já foi encerrada. Não é possível iniciar uma nova partida.', 'warning');
      return;
    }
    if (this.state.status !== 'paused') return;

    const nowIso = new Date().toISOString();
    this.state.status = 'running';
    this.state.isActive = true;
    this.state.isPaused = false;
    this.state.startedAt = nowIso;
    this.state.pausedAt = null;
    this.state.remainingAtStart = this.state.remainingSeconds;
    this.state.lastTick = Date.now();

    this.startTimerLoop();
    this.render();
    this.saveFullState();

    Utils.toast('Partida retomada.', 'info', 1500);
  },

  pauseMatch() {
    Storage.assertAdmin('Pausar partida');
    if (this.state.status !== 'running') return;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const currentRemaining = this.calculateCurrentRemainingSeconds();
    this.state.status = 'paused';
    this.state.isActive = true;
    this.state.isPaused = true;
    this.state.remainingSeconds = currentRemaining;
    this.state.remainingAtStart = currentRemaining;
    this.state.pausedAt = new Date().toISOString();

    this.render();
    this.saveFullState();
    Utils.toast('Partida pausada.', 'info', 1500);
  },

  resetTimer() {
    Storage.assertAdmin('Reiniciar cronômetro');
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      return;
    }
    if (this.state.status === 'finished') return;

    if (confirm('Deseja reiniciar o cronômetro para o tempo inicial?')) {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.state.remainingSeconds = this.state.durationMinutes * 60;
      this.state.remainingAtStart = this.state.durationMinutes * 60;
      this.state.status = 'ready';
      this.state.isActive = false;
      this.state.isPaused = false;
      this.state.startedAt = null;
      this.state.pausedAt = null;
      this.updateTimerDisplay();
      this.render();
      this.saveFullState();
      Utils.toast('Cronômetro reiniciado.', 'info', 1500);
    }
  },

  startTimerLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.state.lastTick = Date.now();

    this.timerInterval = setInterval(() => {
      if (this.state.status !== 'running') {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        return;
      }

      const currentRemaining = this.calculateCurrentRemainingSeconds();
      this.state.remainingSeconds = currentRemaining;
      this.state.lastTick = Date.now();
      this.updateTimerDisplay();

      if (currentRemaining <= 0) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.state.remainingSeconds = 0;
        this.updateTimerDisplay();
        Utils.sound.playWhistle();
        Utils.toast('Tempo regulamentar esgotado! Finalize a partida.', 'warning', 5000);
      }
    }, 500);
  },

  updateTimerDisplay() {
    if (typeof document === 'undefined') return;
    const timerEl = document.getElementById('scoreboard-timer');
    if (timerEl) {
      if (this.state.status === 'running') {
        this.state.remainingSeconds = this.calculateCurrentRemainingSeconds();
      }
      timerEl.textContent = Utils.formatSeconds(this.state.remainingSeconds);
    }
  },

  // --------------------------------------------------------------------------
  // GOLS
  // --------------------------------------------------------------------------
  abrirModalSeletorGol(teamId) {
    Storage.assertAdmin('Registrar gol');
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      Utils.toast('Esta noite já foi encerrada. Não é possível registrar novos gols.', 'warning');
      return;
    }
    if (this.state.status === 'finished') {
      Utils.toast('Partida finalizada. Não é possível adicionar novos gols.', 'info');
      return;
    }

    const teams = Storage.getTeams();
    const team = teams ? teams[teamId] : null;
    if (!team || !team.players || team.players.length === 0) {
      Utils.toast('Dados da equipe não encontrados.', 'error');
      return;
    }

    const colors = Storage.getTeamColors();
    const teamColor = colors[teamId] || '#3b82f6';
    const modalId = 'modal-goal-author';

    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      document.body.appendChild(modal);
    }

    // Trava de processamento para prevenir duplo clique ou requisições simultâneas
    let isProcessingGoal = false;
    let selectedPlayer = null;

    // Renderiza a estrutura padronizada e robusta com .modal-card centralizado
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h3 class="modal-title" id="modal-goal-author-title">REGISTRAR GOL</h3>
            <div style="font-size: 0.8rem; font-weight: 700; color: ${teamColor}; text-transform: uppercase; margin-top: 0.15rem; letter-spacing: 0.5px;">
              ${team.name}
            </div>
          </div>
          <button type="button" class="btn-close" data-close aria-label="Fechar">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc" style="margin-bottom: 0.9rem; font-weight: 600; color: var(--text-main); font-size: 0.95rem;">
            Quem marcou o gol?
          </p>
          <div id="modal-goal-players-list"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-cancel-goal">CANCELAR</button>
          <button type="button" class="btn btn-primary" id="btn-confirm-goal" disabled>
            CONFIRMAR GOL
          </button>
        </div>
      </div>
    `;

    const btnConfirm = modal.querySelector('#btn-confirm-goal');
    const btnCancel = modal.querySelector('#btn-cancel-goal');

    const fecharModalGol = () => {
      selectedPlayer = null;
      if (modal) {
        modal.classList.remove('active');
        if (typeof modal.setAttribute === 'function') {
          modal.setAttribute('aria-hidden', 'true');
        }
        modal.style.display = 'none';
      }
      Utils.closeModal(modalId);
    };

    // Fechamento pelo X ou clique no backdrop com proteção se estiver processando
    const closeBtns = modal.querySelectorAll('[data-close]');
    closeBtns.forEach(b => b.onclick = () => {
      if (isProcessingGoal) return;
      fecharModalGol();
    });
    const backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) backdrop.onclick = () => {
      if (isProcessingGoal) return;
      fecharModalGol();
    };

    btnConfirm.disabled = true;
    btnConfirm.textContent = 'CONFIRMAR GOL';
    btnCancel.onclick = () => {
      if (isProcessingGoal) return;
      fecharModalGol();
    };

    // Renderiza ESTRITAMENTE os jogadores da equipe informada
    const listEl = modal.querySelector('#modal-goal-players-list');
    listEl.innerHTML = `
      <div class="player-selection-list">
        ${team.players.map((p) => `
          <button type="button" class="btn-select-player" data-player-id="${p.id}" data-player-name="${p.name}">
            <div class="p-select-info">
              <span class="p-select-radio">○</span>
              <span class="p-select-avatar" style="background-color: ${teamColor};">${(p.name || 'J').charAt(0).toUpperCase()}</span>
              <span class="p-select-name">${p.name}</span>
            </div>
            <span class="p-select-stars">${Utils.renderStars(p.stars || p.estrelas || 3)}</span>
          </button>
        `).join('')}
      </div>
    `;

    const playerBtns = listEl.querySelectorAll('.btn-select-player');
    playerBtns.forEach(btn => {
      btn.onclick = () => {
        if (isProcessingGoal) return;
        playerBtns.forEach(b => {
          b.classList.remove('selected');
          const radio = b.querySelector('.p-select-radio');
          if (radio) radio.textContent = '○';
        });

        btn.classList.add('selected');
        const radio = btn.querySelector('.p-select-radio');
        if (radio) radio.textContent = '◉';

        selectedPlayer = {
          id: btn.dataset.playerId,
          name: btn.dataset.playerName
        };
        btnConfirm.disabled = false;
      };
    });

    btnConfirm.onclick = async () => {
      // 1. Validar se um jogador foi selecionado
      if (!selectedPlayer) {
        Utils.toast('Selecione o jogador autor do gol.', 'warning');
        return;
      }

      // 2. Trava contra duplo clique / confirmações simultâneas
      if (isProcessingGoal) {
        return;
      }
      isProcessingGoal = true;

      // 3. Desabilitar visualmente o botão e alterar texto temporário
      btnConfirm.disabled = true;
      btnConfirm.textContent = 'Registrando...';
      if (btnCancel) btnCancel.disabled = true;

      try {
        // 4. Executar persistência e processamento com chave de idempotência
        const goalId = Utils.generateUUID();
        await this.registrarGol(teamId, selectedPlayer.id, selectedPlayer.name, goalId);

        // 5. Somente após processamento bem-sucedido: fechar modal e limpar seleção
        fecharModalGol();
      } catch (error) {
        console.error('[Partidas] Erro ao registrar gol:', error);
        Utils.toast(error?.message || 'Erro ao registrar gol no Supabase. Tente novamente.', 'error');
        // Em caso de erro, NÃO fecha o modal
      } finally {
        isProcessingGoal = false;
        if (btnCancel) btnCancel.disabled = false;

        const isStillOpen = modal.classList.contains('active') || modal.style.display !== 'none';
        if (isStillOpen) {
          // Permite tentar novamente com o mesmo jogador selecionado
          btnConfirm.disabled = !selectedPlayer;
          btnConfirm.textContent = 'CONFIRMAR GOL';
        } else {
          // Modal fechado com sucesso: restaura botão para a próxima abertura
          btnConfirm.disabled = true;
          btnConfirm.textContent = 'CONFIRMAR GOL';
        }
      }
    };

    modal.style.display = '';
    Utils.openModal(modalId);
  },

  async registrarGol(teamId, playerId, playerName, customGoalId = null) {
    Storage.assertAdmin('Registrar gol');
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      throw new Error('Esta noite já foi encerrada. Não é possível registrar novos gols.');
    }

    const teams = Storage.getTeams();
    const team = teams ? teams[teamId] : null;
    const teamName = team ? team.name : teamId;

    if (teamId !== this.state.homeTeamId && teamId !== this.state.awayTeamId) {
      throw new Error('Somente jogadores dos dois times em campo podem marcar gols.');
    }

    const goalId = customGoalId || Utils.generateUUID();

    // Idempotência: impede registrar o mesmo gol duas vezes
    if (this.state.goals.some(g => g.id === goalId)) {
      console.warn('[Partidas] Gol já registrado anteriormente (idempotente):', goalId);
      return;
    }

    const elapsedSecs = Math.max(0, (this.state.durationMinutes * 60) - this.state.remainingSeconds);
    const minuteFormatted = Utils.formatSeconds(elapsedSecs);

    const goal = {
      id: goalId,
      playerId: playerId,
      playerName: playerName,
      teamId: teamId,
      teamName: teamName,
      minuteFormatted: minuteFormatted,
      timestamp: new Date().toISOString()
    };

    if (teamId === this.state.homeTeamId) {
      this.state.homeScore++;
    } else {
      this.state.awayScore++;
    }

    this.state.goals.unshift(goal);
    this.renderScoreboard();
    this.renderGoalsList();

    try {
      await this.saveFullState();
    } catch (saveError) {
      // Rollback local se a persistência falhar
      const idx = this.state.goals.findIndex(g => g.id === goalId);
      if (idx !== -1) {
        this.state.goals.splice(idx, 1);
      }
      if (teamId === this.state.homeTeamId) {
        this.state.homeScore = Math.max(0, this.state.homeScore - 1);
      } else {
        this.state.awayScore = Math.max(0, this.state.awayScore - 1);
      }
      this.renderScoreboard();
      this.renderGoalsList();
      throw saveError;
    }

    Utils.sound.playGoal();
    Utils.toast(`Gol de ${playerName} (${teamName})!`, 'success', 3000);
  },

  removerGol(goalId) {
    Storage.assertAdmin('Excluir gol');
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      return;
    }

    const index = this.state.goals.findIndex(g => g.id === goalId);
    if (index === -1) return;

    const goal = this.state.goals[index];
    if (confirm(`Remover gol marcado por ${goal.playerName}?`)) {
      if (goal.teamId === this.state.homeTeamId) {
        this.state.homeScore = Math.max(0, this.state.homeScore - 1);
      } else {
        this.state.awayScore = Math.max(0, this.state.awayScore - 1);
      }

      this.state.goals.splice(index, 1);
      this.renderScoreboard();
      this.renderGoalsList();
      this.saveFullState();

      Utils.toast('Gol removido com sucesso.', 'info', 2000);
    }
  },

  // --------------------------------------------------------------------------
  // FINALIZAÇÃO DE PARTIDA (QUEM GANHA FICA)
  // --------------------------------------------------------------------------
  solicitarFinalizacao(isAuto = false) {
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      return;
    }
    if (this.state.status === 'finished') {
      Utils.toast('Esta partida já foi finalizada.', 'info');
      return;
    }

    const teams = Storage.getTeams() || {};
    const homeTeam = teams[this.state.homeTeamId];
    const awayTeam = teams[this.state.awayTeamId];
    const homeName = homeTeam ? homeTeam.name : 'Time 1';
    const awayName = awayTeam ? awayTeam.name : 'Time 2';

    const msg = `Tem certeza que deseja finalizar esta partida? Depois de finalizada, o resultado não poderá ser alterado.\n\nPlacar: ${homeName} ${this.state.homeScore} × ${this.state.awayScore} ${awayName}`;

    if (isAuto || confirm(msg)) {
      this.finalizarPartida();
    }
  },

  finalizarPartida() {
    Storage.assertAdmin('Finalizar partida');
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this._isTransitioning = true;
    try {
      const teams = Storage.getTeams() || {};
      const colors = Storage.getTeamColors();
      const round = Storage.getCurrentRound();

      const homeTeam = teams[this.state.homeTeamId];
      const awayTeam = teams[this.state.awayTeamId];

      let winner = null;
      let loser = null;
      let isTie = false;
      let resultText = 'Empate';

      if (this.state.homeScore > this.state.awayScore) {
        winner = this.state.homeTeamId;
        loser = this.state.awayTeamId;
        resultText = `${homeTeam ? homeTeam.name : 'Time 1'} venceu`;
      } else if (this.state.awayScore > this.state.homeScore) {
        winner = this.state.awayTeamId;
        loser = this.state.homeTeamId;
        resultText = `${awayTeam ? awayTeam.name : 'Time 2'} venceu`;
      } else {
        isTie = true;
      }

      const elapsedSeconds = (this.state.durationMinutes * 60) - this.state.remainingSeconds;

      const matchRecord = {
        id: Utils.generateUUID(),
        roundId: round ? round.id : null,
        matchOrder: this.state.order,
        date: round ? round.date : Utils.formatDate(new Date()),
        time: Utils.formatTime(new Date()),
        dateKey: round ? round.dateKey : Utils.getDateKey(new Date()),
        homeTeamId: this.state.homeTeamId,
        homeTeamName: homeTeam ? homeTeam.name : 'Time 1',
        homeTeamColor: colors[this.state.homeTeamId] || '#3b82f6',
        awayTeamId: this.state.awayTeamId,
        awayTeamName: awayTeam ? awayTeam.name : 'Time 2',
        awayTeamColor: colors[this.state.awayTeamId] || '#ef4444',
        homeScore: this.state.homeScore,
        awayScore: this.state.awayScore,
        winner: winner,
        loser: loser,
        isTie: isTie,
        decisaoAdmin: false,
        resultText: resultText,
        durationMinutes: this.state.durationMinutes,
        durationPlayedFormatted: Utils.formatSeconds(elapsedSeconds),
        goals: [...this.state.goals],
        homePlayers: homeTeam ? homeTeam.players : [],
        awayPlayers: awayTeam ? awayTeam.players : [],
        createdAt: new Date().toISOString()
      };

      Utils.sound.playWhistle();

      if (isTie) {
        // REGRA DEFINITIVA DE EMPATE:
        // 1. Ambos os times recebem 1 ponto (já persistido no Storage e Tabela).
        // 2. Ambos os times saem de campo.
        // 3. Os dois times que estavam fora entram automaticamente.
        // 4. A próxima partida é AUTOMATICAMENTE entre os dois times que estavam fora.
        // 5. NÃO perguntar ao administrador quem permanece e NÃO escolher vencedor.
        const currentHomeId = this.state.homeTeamId;
        const currentAwayId = this.state.awayTeamId;

        const allTeamIds = Object.keys(teams).length >= 4 ? Object.keys(teams) : ['time_1', 'time_2', 'time_3', 'time_4'];
        const outsideTeamIds = allTeamIds.filter(id => id !== currentHomeId && id !== currentAwayId);

        const nextHomeId = outsideTeamIds[0] || 'time_3';
        const nextAwayId = outsideTeamIds[1] || 'time_4';
        const nextHomeTeam = teams[nextHomeId] || { name: nextHomeId.replace('time_', 'Time ') };
        const nextAwayTeam = teams[nextAwayId] || { name: nextAwayId.replace('time_', 'Time ') };

        const nextOrder = this.state.order + 1;
        const durationMins = this.state.durationMinutes || Storage.getDefaultMatchDurationMinutes() || 7;

        // 1. Prepara a próxima partida no estado oficial como SCHEDULED ('ready')
        this.state = {
          ...this.state,
          order: nextOrder,
          status: 'ready',
          isActive: false,
          isPaused: false,
          durationMinutes: durationMins,
          durationSeconds: durationMins * 60,
          remainingSeconds: durationMins * 60,
          startedAt: null,
          pausedAt: null,
          lastTick: null,
          homeTeamId: nextHomeId,
          awayTeamId: nextAwayId,
          homeTeamName: nextHomeTeam.name,
          awayTeamName: nextAwayTeam.name,
          homeScore: 0,
          awayScore: 0,
          goals: [],
          winnerTeamId: null,
          winner_team_id: null,
          winnerTeamName: null,
          winner_team_name: null,
          loserTeamId: null,
          loser_team_id: null,
          isTie: true,
          tiePendingResolution: false,
          waitingNextOpponent: false,
          waiting_next_opponent: false,
          waitingTieNextMatch: true,
          waiting_tie_next_match: true,
          tieNextMatch: {
            homeTeamId: nextHomeId,
            awayTeamId: nextAwayId,
            homeTeamName: nextHomeTeam.name,
            awayTeamName: nextAwayTeam.name
          },
          outsideWaitingTeamIds: [currentHomeId, currentAwayId],
          decisaoAdmin: false,
          lastMatchSummary: {
            order: matchRecord.matchOrder,
            homeTeamName: matchRecord.homeTeamName,
            awayTeamName: matchRecord.awayTeamName,
            homeScore: matchRecord.homeScore,
            awayScore: matchRecord.awayScore,
            resultText: resultText,
            winnerTeamId: null,
            winnerTeamName: null,
            isTie: true
          }
        };

        // 2. Persiste a próxima partida preparada no Supabase (partida_ao_vivo) e no LocalStorage
        this.saveFullState();

        // 3. Persiste a partida finalizada no histórico oficial
        Storage.addMatch(matchRecord);

        // 4. Renderiza e emite notificação
        this.render();
        Utils.toast(`Partida empatada! ${homeTeam ? homeTeam.name : 'Time 1'} e ${awayTeam ? awayTeam.name : 'Time 2'} saem. Próxima partida: ${nextHomeTeam.name} × ${nextAwayTeam.name}!`, 'info', 4500);
      } else {
        // REGRA DE VITÓRIA:
        // O vencedor permanece em campo.
        // O perdedor sai de campo.
        // O administrador escolhe o próximo adversário entre os 2 times que estão fora.
        const winnerName = winner === this.state.homeTeamId ? (homeTeam ? homeTeam.name : 'Time 1') : (awayTeam ? awayTeam.name : 'Time 2');
        this.state.status = 'finished';
        this.state.isActive = false;
        this.state.isPaused = false;
        this.state.isTie = false;
        this.state.winnerTeamId = winner;
        this.state.winner_team_id = winner;
        this.state.winnerTeamName = winnerName;
        this.state.winner_team_name = winnerName;
        this.state.loserTeamId = loser;
        this.state.loser_team_id = loser;
        this.state.tiePendingResolution = false;
        this.state.waitingTieNextMatch = false;
        this.state.waiting_tie_next_match = false;
        this.state.waitingNextOpponent = true;
        this.state.waiting_next_opponent = true;
        this.state.outsideWaitingTeamIds = Object.keys(teams).filter(id => id !== this.state.homeTeamId && id !== this.state.awayTeamId);
        this.state.lastMatchSummary = {
          order: this.state.order,
          homeTeamName: matchRecord.homeTeamName,
          awayTeamName: matchRecord.awayTeamName,
          homeScore: matchRecord.homeScore,
          awayScore: matchRecord.awayScore,
          resultText: resultText,
          winnerTeamId: winner,
          winnerTeamName: winnerName
        };

        // Persiste estado oficial finalizado no Supabase e Storage antes de emitir matches
        this.saveFullState();
        Storage.addMatch(matchRecord);
        this.render();
        Utils.toast(`Partida finalizada! ${winnerName} venceu e permanece em campo. Escolha o próximo adversário.`, 'success', 4500);
      }
    } finally {
      this._isTransitioning = false;
    }
  },

  // --------------------------------------------------------------------------
  // TRANSIÇÃO DE PARTIDA APÓS EMPATE (AUTOMÁTICA — OS DOIS DE FORA ENTRAM)
  // --------------------------------------------------------------------------
  criarProximaPartidaAposEmpate(autoStart = false) {
    Storage.assertAdmin('Criar próxima partida após empate');
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      Utils.toast('Esta noite já foi encerrada. Não é possível iniciar uma nova partida.', 'warning');
      return;
    }
    if (!this.state.tieNextMatch) {
      Utils.toast('Nenhum confronto de empate configurado.', 'warning');
      return;
    }

    // Proteção de idempotência: se a partida atual já foi preparada em status ready para o confronto
    if (this.state.status === 'ready' && this.state.tieNextMatch &&
        this.state.homeTeamId === this.state.tieNextMatch.homeTeamId &&
        this.state.awayTeamId === this.state.tieNextMatch.awayTeamId) {
      if (autoStart) {
        this.iniciarProximaPartidaAposEmpate();
      }
      return;
    }

    const { homeTeamId, awayTeamId, homeTeamName, awayTeamName } = this.state.tieNextMatch;
    const nextOrder = this.state.order + 1;
    const durationMins = this.state.durationMinutes || Storage.getDefaultMatchDurationMinutes() || 7;

    this.state = {
      ...this.state,
      order: nextOrder,
      status: 'ready',
      isActive: false,
      isPaused: false,
      durationMinutes: durationMins,
      durationSeconds: durationMins * 60,
      remainingSeconds: durationMins * 60,
      startedAt: null,
      pausedAt: null,
      lastTick: null,
      homeTeamId: homeTeamId,
      awayTeamId: awayTeamId,
      homeTeamName: homeTeamName,
      awayTeamName: awayTeamName,
      homeScore: 0,
      awayScore: 0,
      goals: [],
      winnerTeamId: null,
      winnerTeamName: null,
      loserTeamId: null,
      isTie: false,
      tiePendingResolution: false,
      waitingTieNextMatch: false,
      waitingNextOpponent: false,
      decisaoAdmin: false,
      tieNextMatch: null,
      lastMatchSummary: this.state.lastMatchSummary
    };

    this.saveFullState();
    this.render();

    if (autoStart) {
      this.startOrResumeMatch();
    } else {
      Utils.toast(`Partida ${String(nextOrder).padStart(2, '0')} agendada: ${homeTeamName} × ${awayTeamName}!`, 'info', 3000);
    }
  },

  iniciarProximaPartidaAposEmpate() {
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      Utils.toast('Esta noite já foi encerrada. Não é possível iniciar uma nova partida.', 'warning');
      return;
    }
    if (this.state.status === 'ready') {
      this.state.waitingTieNextMatch = false;
      this.state.waiting_tie_next_match = false;
      this.state.isTie = false;
      this.startOrResumeMatch();
      return;
    }
    this.criarProximaPartidaAposEmpate(true);
  },

  // --------------------------------------------------------------------------
  // COMPATIBILIDADE / PROTEÇÃO CONTRA ESCOLHA ARTIFICIAL DE VENCEDOR NO EMPATE
  // --------------------------------------------------------------------------
  resolverEmpate(chosenTeamId) {
    // DESATIVADO: Em caso de empate, ambos saem de campo e os 2 times de fora entram automaticamente.
    Utils.toast('Em caso de empate, ambos os times saem de campo. Não há escolha de permanência.', 'info', 3000);
  },

  // --------------------------------------------------------------------------
  // ESCOLHA DO PRÓXIMO ADVERSÁRIO (QUANDO HÁ VITÓRIA)
  // --------------------------------------------------------------------------
  selecionarProximoAdversario(opponentTeamId) {
    Storage.assertAdmin('Escolher próximo adversário');
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      Utils.toast('Esta noite já foi encerrada. Não é possível iniciar uma nova partida.', 'warning');
      return;
    }

    // Validação resiliente do vencedor da partida oficial:
    // 1. this.state.winnerTeamId ou this.state.winner_team_id
    // 2. Storage.getLiveMatch() (winnerTeamId / winner_team_id)
    // 3. Última partida finalizada no histórico oficial (matches[0].winner)
    let winnerId = this.state.winnerTeamId || this.state.winner_team_id;
    if (!winnerId) {
      const live = Storage.getLiveMatch();
      if (live && (live.winnerTeamId || live.winner_team_id)) {
        winnerId = live.winnerTeamId || live.winner_team_id;
      }
    }
    if (!winnerId) {
      const round = Storage.getCurrentRound();
      const roundKey = round ? round.dateKey : Utils.getDateKey(new Date());
      const matches = Storage.getMatches().filter(m => (round && m.roundId === round.id) || m.dateKey === roundKey);
      if (matches.length > 0 && matches[0].winner) {
        winnerId = matches[0].winner;
      }
    }

    if (!winnerId) {
      Utils.toast('Defina o vencedor antes de escolher o adversário.', 'warning');
      return;
    }

    this.state.winnerTeamId = winnerId;
    this.state.winner_team_id = winnerId;

    // Regra: Não permitir jogar contra si mesmo
    if (opponentTeamId === winnerId) {
      Utils.toast('O time vencedor não pode jogar contra si mesmo.', 'warning');
      return;
    }

    const teams = Storage.getTeams() || {};
    const winnerTeam = teams[winnerId];
    const opponentTeam = teams[opponentTeamId];

    if (!winnerTeam || !opponentTeam) {
      Utils.toast('Erro ao identificar equipes do confronto.', 'error');
      return;
    }

    const nextOrder = this.state.order + 1;
    const durationMins = this.state.durationMinutes || Storage.getDefaultMatchDurationMinutes() || 7;

    // Prepara a próxima partida (SCHEDULED / ready)
    this.state = {
      order: nextOrder,
      status: 'ready',
      isActive: false,
      isPaused: false,
      durationMinutes: durationMins,
      durationSeconds: durationMins * 60,
      remainingSeconds: durationMins * 60,
      startedAt: null,
      pausedAt: null,
      lastTick: null,
      homeTeamId: winnerId,
      awayTeamId: opponentTeamId,
      homeTeamName: winnerTeam.name,
      awayTeamName: opponentTeam.name,
      homeScore: 0,
      awayScore: 0,
      goals: [],
      winnerTeamId: null,
      winner_team_id: null,
      winnerTeamName: null,
      winner_team_name: null,
      loserTeamId: null,
      loser_team_id: null,
      isTie: false,
      tiePendingResolution: false,
      waitingTieNextMatch: false,
      waiting_tie_next_match: false,
      waitingNextOpponent: false,
      waiting_next_opponent: false,
      decisaoAdmin: false,
      tieNextMatch: null,
      lastMatchSummary: this.state.lastMatchSummary
    };

    this.saveFullState();
    this.render();

    Utils.toast(`Partida ${String(nextOrder).padStart(2, '0')} agendada: ${winnerTeam.name} × ${opponentTeam.name}! Clique em INICIAR para começar.`, 'success', 4500);
  },

  // --------------------------------------------------------------------------
  // ENCERRAMENTO DA NOITE E ATRIBUIÇÃO DA CAPA
  // --------------------------------------------------------------------------
  solicitarEncerramentoNoite() {
    Storage.assertAdmin('Encerrar noite');
    const round = Storage.getCurrentRound();
    if (!round) {
      Utils.toast('Nenhuma rodada ativa encontrada.', 'warning');
      return;
    }

    if (round.status === 'FINISHED') {
      Utils.toast('Esta noite já foi encerrada e o campeão já foi definido.', 'info');
      return;
    }

    const live = Storage.getLiveMatch();
    const liveStatus = (live && live.status) || this.state.status;
    const isRunning = liveStatus === 'running' || (live && live.isActive && !live.isPaused) || (this.state.status === 'running' && !this.state.isPaused);
    const isPaused = liveStatus === 'paused' || (live && live.isPaused) || this.state.status === 'paused';

    if (isRunning) {
      Utils.toast('Finalize a partida em andamento antes de encerrar a noite.', 'warning', 4500);
      return;
    }

    if (isPaused) {
      Utils.toast('Retome e finalize a partida antes de encerrar a noite.', 'warning', 4500);
      return;
    }

    let matches = Storage.getMatches().filter(m => round && m.roundId === round.id);
    if (matches.length === 0 && round) {
      matches = Storage.getMatches().filter(m => !m.roundId && m.dateKey === round.dateKey);
    }

    if (matches.length === 0) {
      Utils.toast('Realize e finalize ao menos uma partida antes de encerrar a noite.', 'warning', 4500);
      return;
    }

    this.abrirModalResumoEncerramento(round, matches);
  },

  abrirModalResumoEncerramento(round, matches) {
    const teams = Storage.getTeams() || (round && round.teams ? round.teams : {}) || {};
    const standings = Tabela.calcularTabela(matches);
    const lastMatch = matches[0];
    const lastWinnerName = lastMatch && lastMatch.winner ? (teams[lastMatch.winner]?.name || lastMatch.winner) : '—';
    const tiedAtTop = Tabela.detectTieAtTop(standings) || [];

    const modalId = 'modal-encerrar-noite-resumo';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card modal-card-large" style="max-width: 580px;">
        <div class="modal-header">
            <h3 class="modal-title" style="display: flex; align-items: center; gap: 0.5rem;">
              <svg class="i" style="width: 22px; height: 22px; fill: #eab308;"><use href="#i-crown"/></svg>
              <span>ENCERRAR NOITE?</span>
            </h3>
            <button type="button" class="btn-close" data-close>&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size: 0.95rem; color: var(--text-main); margin-bottom: 1.25rem; line-height: 1.4;">
              A noite será encerrada e a classificação final será definida. O campeão receberá as Capas correspondentes.
            </p>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.25rem;">
              <div class="card" style="padding: 0.85rem; text-align: center; background: var(--surface-2);">
                <span class="text-muted" style="font-size: 0.75rem; text-transform: uppercase;">Partidas Realizadas</span>
                <div style="font-size: 1.5rem; font-weight: 800; font-family: 'Barlow Condensed', sans-serif;">${matches.length}</div>
              </div>
              <div class="card" style="padding: 0.85rem; text-align: center; background: var(--surface-2);">
                <span class="text-muted" style="font-size: 0.75rem; text-transform: uppercase;">Último Vencedor em Campo</span>
                <div style="font-size: 1.25rem; font-weight: 800; color: #10b981;">${lastWinnerName}</div>
              </div>
            </div>

            <h4 style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; color: var(--text-dim);">
              CLASSIFICAÇÃO FINAL DA NOITE
            </h4>
            <div class="table-responsive" style="margin-bottom: 1.25rem;">
              <table class="tabela-standings" style="width: 100%; font-size: 0.85rem;">
                <thead>
                  <tr>
                    <th>POS</th>
                    <th>TIME</th>
                    <th>J</th>
                    <th>V</th>
                    <th>E</th>
                    <th>D</th>
                    <th>SG</th>
                    <th>PTS</th>
                  </tr>
                </thead>
                <tbody>
                  ${standings.map((t, idx) => `
                    <tr class="${idx === 0 ? 'top-leader-row' : ''}">
                      <td><strong>${idx + 1}º</strong></td>
                      <td><strong>${t.name}</strong></td>
                      <td>${t.j}</td>
                      <td>${t.v}</td>
                      <td>${t.e}</td>
                      <td>${t.d}</td>
                      <td>${t.sg > 0 ? `+${t.sg}` : t.sg}</td>
                      <td><strong>${t.pts}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            ${tiedAtTop.length > 1 ? `
              <div class="alert alert-warning" style="margin-bottom: 1rem; padding: 0.85rem; border-left: 4px solid #f59e0b; background: rgba(245, 158, 11, 0.1);">
                <strong>EMPATE NA LIDERANÇA!</strong>
                <p style="font-size: 0.82rem; margin: 0.25rem 0 0.5rem;">
                  Selecione qual equipe deve ser consagrada Campeã da Noite:
                </p>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                  ${tiedAtTop.map(t => `
                    <button type="button" class="btn btn-sm btn-choice-champion" data-team="${t.id}" style="font-weight: 700;">
                      ${t.name}
                    </button>
                  `).join('')}
                </div>
              </div>
            ` : `
              <div style="padding: 0.85rem; background: rgba(234, 179, 8, 0.1); border-left: 4px solid #eab308; border-radius: 4px; margin-bottom: 1rem;">
                <div style="font-size: 0.82rem; color: #eab308; font-weight: 700; text-transform: uppercase;">Campeão Definido</div>
                <div style="font-size: 1.15rem; font-weight: 800;">${standings[0]?.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                  Os 5 atletas deste time receberão +1 Capa cada um.
                </div>
              </div>
            `}

            <p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; margin: 0;">
              Após o encerramento, todos os resultados serão congelados e o ranking geral será atualizado.
            </p>
          </div>
          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.75rem;">
            <button type="button" class="btn btn-secondary" data-close>CANCELAR</button>
            <button type="button" class="btn btn-primary" id="btn-confirm-finalizar-noite" ${tiedAtTop.length > 1 ? 'disabled' : ''}>
              ENCERRAR NOITE
            </button>
          </div>
        </div>
    `;

    const closeBtn = modal.querySelector('[data-close]');
    if (closeBtn) closeBtn.onclick = () => Utils.closeModal(modalId);
    const backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) backdrop.onclick = () => Utils.closeModal(modalId);
    const btnCancel = modal.querySelector('.btn-secondary');
    if (btnCancel) btnCancel.onclick = () => Utils.closeModal(modalId);

    let chosenChampionId = standings[0]?.id;

    if (tiedAtTop.length > 1) {
      modal.querySelectorAll('.btn-choice-champion').forEach(btn => {
        btn.onclick = () => {
          modal.querySelectorAll('.btn-choice-champion').forEach(b => b.classList.remove('btn-primary'));
          btn.classList.add('btn-primary');
          chosenChampionId = btn.dataset.team;
          const btnConfirm = modal.querySelector('#btn-confirm-finalizar-noite');
          if (btnConfirm) btnConfirm.disabled = false;
        };
      });
    }

    const btnConfirm = modal.querySelector('#btn-confirm-finalizar-noite');
    if (btnConfirm) {
      btnConfirm.onclick = () => {
        const champ = teams[chosenChampionId];
        if (!champ) return;
        Utils.closeModal(modalId);
        this.executarEncerramentoNoite(chosenChampionId, champ.name, champ.players);
      };
    }

    Utils.openModal(modalId);
  },

  async executarEncerramentoNoite(championId, championName, championPlayers) {
    try {
      const round = Storage.getCurrentRound();
      if (!round) {
        Utils.toast('Nenhuma rodada ativa encontrada.', 'warning');
        return;
      }
      if (round.status === 'FINISHED') {
        Utils.toast('Esta noite já foi encerrada.', 'info');
        return;
      }

      let matches = Storage.getMatches().filter(m => round && m.roundId === round.id);
      if (matches.length === 0 && round) {
        matches = Storage.getMatches().filter(m => !m.roundId && m.dateKey === round.dateKey);
      }
      const standings = Tabela.calcularTabela(matches, null, round);

      await Storage.endNight({
        championTeamId: championId,
        championTeamName: championName,
        capaPlayers: championPlayers,
        standings: standings
      });

      this.state.status = 'finished';
      this.state.isActive = false;
      this.state.isPaused = false;
      this.state.waitingNextOpponent = false;
      this.state.waiting_next_opponent = false;
      this.state.waitingTieNextMatch = false;
      this.state.waiting_tie_next_match = false;
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      if (this.publicTickerInterval) {
        clearInterval(this.publicTickerInterval);
        this.publicTickerInterval = null;
      }

      Utils.sound.playGoal();
      Utils.toast(`Noite encerrada com sucesso! Campeão: ${championName}. 5 Capas distribuídas!`, 'success', 5000);
      this.render();
    } catch (err) {
      Utils.toast(err.message, 'error', 4000);
    }
  },

  saveLocalStateOnly() {
    Storage.saveLocalMatchOnly(this.getLivePayload());
  },

  async saveFullState() {
    return await Storage.saveLiveMatch(this.getLivePayload());
  },

  getLivePayload() {
    const teams = Storage.getTeams() || {};
    const homeTeam = teams[this.state.homeTeamId];
    const awayTeam = teams[this.state.awayTeamId];
    const winnerId = this.state.winnerTeamId || this.state.winner_team_id || null;
    const winnerName = this.state.winnerTeamName || this.state.winner_team_name || (winnerId && teams[winnerId] ? teams[winnerId].name : null);
    const loserId = this.state.loserTeamId || this.state.loser_team_id || null;
    const isWaitingNext = Boolean(this.state.waitingNextOpponent !== undefined ? this.state.waitingNextOpponent : this.state.waiting_next_opponent);
    const isWaitingTie = Boolean(this.state.waitingTieNextMatch !== undefined ? this.state.waitingTieNextMatch : this.state.waiting_tie_next_match);

    return {
      order: this.state.order,
      status: this.state.status,
      isActive: this.state.status === 'running' || this.state.status === 'paused',
      isPaused: this.state.status === 'paused',
      durationMinutes: this.state.durationMinutes,
      durationSeconds: this.state.durationSeconds || (this.state.durationMinutes * 60),
      remainingSeconds: this.state.remainingSeconds,
      remainingAtStart: this.state.remainingAtStart !== undefined ? this.state.remainingAtStart : this.state.remainingSeconds,
      startedAt: this.state.startedAt,
      pausedAt: this.state.pausedAt,
      lastTick: this.state.lastTick,
      homeTeamId: this.state.homeTeamId,
      awayTeamId: this.state.awayTeamId,
      homeTeamName: homeTeam ? homeTeam.name : this.state.homeTeamName,
      awayTeamName: awayTeam ? awayTeam.name : this.state.awayTeamName,
      homeScore: this.state.homeScore,
      awayScore: this.state.awayScore,
      goals: this.state.goals,
      winnerTeamId: winnerId,
      winner_team_id: winnerId,
      winnerTeamName: winnerName,
      winner_team_name: winnerName,
      loserTeamId: loserId,
      loser_team_id: loserId,
      isTie: this.state.isTie,
      tiePendingResolution: this.state.tiePendingResolution,
      waitingNextOpponent: isWaitingNext,
      waiting_next_opponent: isWaitingNext,
      waitingTieNextMatch: isWaitingTie,
      waiting_tie_next_match: isWaitingTie,
      tieNextMatch: this.state.tieNextMatch,
      outsideWaitingTeamIds: this.state.outsideWaitingTeamIds || [],
      decisaoAdmin: this.state.decisaoAdmin,
      lastMatchSummary: this.state.lastMatchSummary
    };
  },

  // --------------------------------------------------------------------------
  // RENDERIZAÇÃO DA INTERFACE DA PARTIDA
  // --------------------------------------------------------------------------
  render() {
    if (typeof document === 'undefined') return;
    const teams = Storage.getTeams();
    const emptyStateEl = document.getElementById('partida-empty-state');
    const activeStateEl = document.getElementById('partida-active-state');

    if (!teams) {
      if (emptyStateEl) emptyStateEl.style.display = 'block';
      if (activeStateEl) activeStateEl.style.display = 'none';

      const btnIrSorteio = document.getElementById('btn-ir-sorteio-partida');
      if (btnIrSorteio) {
        btnIrSorteio.onclick = () => {
          if (window.App) window.App.navigateTo('sorteio');
        };
      }
      return;
    }

    if (emptyStateEl) emptyStateEl.style.display = 'none';
    if (activeStateEl) activeStateEl.style.display = 'block';

    const round = Storage.getCurrentRound();
    const isRoundDone = round && round.status === 'FINISHED';

    if (isRoundDone) {
      this.renderNightFinishedUI(round);
      return;
    }

    this.hideNightFinishedUI();
    this.renderQuemGanhaFicaBanner();
    this.renderScoreboard();
    this.updateTimerDisplay();
    this.renderControls();
    this.renderGoalsList();
    this.renderNightEndSection();

    if (this.state.status === 'running' && !this.state.isPaused && !this.timerInterval) {
      if (this.calculateCurrentRemainingSeconds() > 0) {
        this.startTimerLoop();
      }
    }
  },

  renderNightFinishedUI(round) {
    const activeStateEl = document.getElementById('partida-active-state');
    if (!activeStateEl) return;

    // Oculta os blocos de partida ativa para manter a tela limpa
    const setupEl = activeStateEl.querySelector ? activeStateEl.querySelector('.match-setup') : null;
    const sbEl = activeStateEl.querySelector ? activeStateEl.querySelector('.scoreboard') : null;
    const timelineEl = activeStateEl.querySelector ? (activeStateEl.querySelector('.card:has(#match-goals-timeline)') || document.getElementById('match-goals-timeline')?.closest?.('.card')) : null;
    const bannerEl = document.getElementById('match-quem-ganha-fica-banner');
    const nightEndSecEl = document.getElementById('night-end-control-section');

    if (setupEl) setupEl.style.display = 'none';
    if (sbEl) sbEl.style.display = 'none';
    if (timelineEl) timelineEl.style.display = 'none';
    if (bannerEl) {
      bannerEl.innerHTML = '';
      bannerEl.style.display = 'none';
    }
    if (nightEndSecEl) {
      nightEndSecEl.innerHTML = '';
      nightEndSecEl.style.display = 'none';
    }

    // Identificação do campeão da noite
    const teams = Storage.getTeams() || (round && round.teams ? round.teams : {}) || {};
    const colors = Storage.getTeamColors();
    const champId = round.campeaoTimeId;
    let champName = round.campeaoTimeNome;
    if (!champName && champId && teams[champId]) {
      champName = teams[champId].name;
    }
    if (!champName) {
      champName = 'Time 1';
    }
    const champColor = (champId && colors[champId]) ? colors[champId] : '#eab308';

    let finishedContainer = document.getElementById('night-finished-container');
    if (!finishedContainer) {
      finishedContainer = document.createElement('div');
      finishedContainer.id = 'night-finished-container';
      if (activeStateEl.insertBefore && activeStateEl.firstChild) {
        activeStateEl.insertBefore(finishedContainer, activeStateEl.firstChild);
      } else if (activeStateEl.appendChild) {
        activeStateEl.appendChild(finishedContainer);
      }
    }
    finishedContainer.style.display = 'block';

    finishedContainer.innerHTML = `
      <div class="card night-finished-card" id="night-finished-summary-card" style="margin-bottom: 1.25rem; border-left: 4px solid #eab308; background: rgba(234, 179, 8, 0.06); padding: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 0.85rem;">
          <svg class="i" style="width: 32px; height: 32px; fill: #eab308; flex-shrink: 0;" aria-hidden="true">
            <use href="#i-crown" />
          </svg>
          <div>
            <div style="font-size: 0.8rem; font-weight: 800; color: #eab308; text-transform: uppercase; letter-spacing: 1px;">
              NOITE ENCERRADA
            </div>
            <div style="font-size: 1.25rem; font-weight: 800; font-family: 'Barlow Condensed', sans-serif; margin: 0.2rem 0; color: var(--text-main, #fff);">
              Campeão: <span style="color: ${champColor}; font-weight: 800;">${champName.toUpperCase()}</span>
            </div>
            <div style="font-size: 0.88rem; color: var(--text-muted);">
              Os 5 atletas receberam +1 Capa.
            </div>
          </div>
        </div>
      </div>

      <div class="card" id="night-finished-actions-card" style="padding: 1.25rem; background: var(--surface-2); border: 1px solid var(--border);">
        <div style="display: flex; flex-direction: column; gap: 0.85rem;">
          <p style="font-size: 0.88rem; color: var(--text-muted); margin: 0; line-height: 1.4;">
            Todas as partidas desta noite foram finalizadas. Consulte os detalhes e súmulas na seção <strong>Histórico</strong> ou a classificação final na <strong>Tabela</strong>.
          </p>
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-primary btn-sm" id="btn-night-finished-history" style="display: inline-flex; align-items: center; gap: 0.5rem;">
              <svg class="i i-sm" aria-hidden="true"><use href="#i-history" /></svg>
              <span>Ver Histórico de Partidas</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-night-finished-table" style="display: inline-flex; align-items: center; gap: 0.5rem;">
              <svg class="i i-sm" aria-hidden="true"><use href="#i-table" /></svg>
              <span>Ver Tabela Final</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-night-finished-rankings" style="display: inline-flex; align-items: center; gap: 0.5rem;">
              <svg class="i i-sm" aria-hidden="true"><use href="#i-trophy" /></svg>
              <span>Ver Rankings</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const btnHist = finishedContainer.querySelector ? finishedContainer.querySelector('#btn-night-finished-history') : null;
    if (btnHist) {
      btnHist.onclick = () => {
        if (window.App) window.App.navigateTo('historico');
      };
    }
    const btnTab = finishedContainer.querySelector ? finishedContainer.querySelector('#btn-night-finished-table') : null;
    if (btnTab) {
      btnTab.onclick = () => {
        if (window.App) window.App.navigateTo('tabela');
      };
    }
    const btnRank = finishedContainer.querySelector ? finishedContainer.querySelector('#btn-night-finished-rankings') : null;
    if (btnRank) {
      btnRank.onclick = () => {
        if (window.App) window.App.navigateTo('rankings');
      };
    }
  },

  hideNightFinishedUI() {
    const finishedContainer = document.getElementById('night-finished-container');
    if (finishedContainer) {
      finishedContainer.style.display = 'none';
      finishedContainer.innerHTML = '';
    }

    const activeStateEl = document.getElementById('partida-active-state');
    if (!activeStateEl) return;

    const setupEl = activeStateEl.querySelector ? activeStateEl.querySelector('.match-setup') : null;
    const sbEl = activeStateEl.querySelector ? activeStateEl.querySelector('.scoreboard') : null;
    const timelineEl = activeStateEl.querySelector ? (activeStateEl.querySelector('.card:has(#match-goals-timeline)') || document.getElementById('match-goals-timeline')?.closest?.('.card')) : null;
    const bannerEl = document.getElementById('match-quem-ganha-fica-banner');
    const nightEndSecEl = document.getElementById('night-end-control-section');

    if (setupEl) setupEl.style.display = '';
    if (sbEl) sbEl.style.display = '';
    if (timelineEl) timelineEl.style.display = '';
    if (bannerEl) bannerEl.style.display = '';
    if (nightEndSecEl) nightEndSecEl.style.display = '';
  },

  renderQuemGanhaFicaBanner() {
    let bannerEl = document.getElementById('match-quem-ganha-fica-banner');
    if (!bannerEl) {
      bannerEl = document.createElement('div');
      bannerEl.id = 'match-quem-ganha-fica-banner';
      const container = document.getElementById('partida-active-state');
      if (container) {
        container.insertBefore(bannerEl, container.firstChild);
      }
    }

    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      bannerEl.innerHTML = '';
      return;
    }

    const teams = Storage.getTeams() || {};
    const colors = Storage.getTeamColors();
    const isPublic = Storage.isPublicViewer();
    const homeTeam = teams[this.state.homeTeamId] || { name: 'Time 1' };
    const awayTeam = teams[this.state.awayTeamId] || { name: 'Time 2' };
    const homeColor = colors[this.state.homeTeamId] || '#3b82f6';
    const awayColor = colors[this.state.awayTeamId] || '#ef4444';

    // CASO 1: PARTIDA FINALIZADA EM EMPATE (REGRA DEFINITIVA)
    if (this.state.waitingTieNextMatch && this.state.tieNextMatch) {
      const summary = this.state.lastMatchSummary || {
        homeScore: 0,
        awayScore: 0,
        homeTeamName: 'Time 1',
        awayTeamName: 'Time 2'
      };
      const prevHomeId = this.state.outsideWaitingTeamIds?.[0] || 'time_1';
      const prevAwayId = this.state.outsideWaitingTeamIds?.[1] || 'time_2';
      const prevHomeColor = colors[prevHomeId] || '#3b82f6';
      const prevAwayColor = colors[prevAwayId] || '#ef4444';

      const nextHomeTeam = teams[this.state.tieNextMatch.homeTeamId] || { name: 'Time 3' };
      const nextAwayTeam = teams[this.state.tieNextMatch.awayTeamId] || { name: 'Time 4' };
      const nextHomeColor = colors[this.state.tieNextMatch.homeTeamId] || '#16a34a';
      const nextAwayColor = colors[this.state.tieNextMatch.awayTeamId] || '#eab308';

      bannerEl.innerHTML = `
        <div class="card" style="margin-bottom: 1.25rem; border: 2px solid #3b82f6; background: rgba(59, 130, 246, 0.08); padding: 1.25rem; text-align: center;">
          <div style="font-size: 0.85rem; font-weight: 800; color: #3b82f6; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem;">
            PARTIDA FINALIZADA EM EMPATE
          </div>

          <div style="font-size: 1.5rem; font-weight: 800; font-family: 'Barlow Condensed', sans-serif; display: flex; align-items: center; justify-content: center; gap: 0.75rem; margin-bottom: 0.5rem;">
            <span style="color: ${prevHomeColor};">${summary.homeTeamName.toUpperCase()}</span>
            <span style="background: var(--bg-card); padding: 2px 10px; border-radius: 6px; border: 1px solid var(--border);">${summary.homeScore} × ${summary.awayScore}</span>
            <span style="color: ${prevAwayColor};">${summary.awayTeamName.toUpperCase()}</span>
          </div>

          <div style="display: inline-block; padding: 4px 14px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; font-weight: 800; font-size: 0.8rem; letter-spacing: 0.5px; margin-bottom: 1rem;">
            +1 PONTO PARA CADA TIME
          </div>

          <div style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; font-size: 0.85rem; font-weight: 700;">
            <div style="padding: 4px 10px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; color: #ef4444;">
              <span style="color: ${prevHomeColor};">${summary.homeTeamName.toUpperCase()}</span> SAI DE CAMPO
            </div>
            <div style="padding: 4px 10px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; color: #ef4444;">
              <span style="color: ${prevAwayColor};">${summary.awayTeamName.toUpperCase()}</span> SAI DE CAMPO
            </div>
          </div>

          <div style="border-top: 1px solid var(--border); padding-top: 1rem;">
            <div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px; margin-bottom: 0.35rem;">
              OS TIMES DE FORA ENTRAM:
            </div>
            <div style="font-size: 1.35rem; font-weight: 800; font-family: 'Barlow Condensed', sans-serif; margin-bottom: 0.85rem;">
              <span style="color: ${nextHomeColor};">${nextHomeTeam.name.toUpperCase()}</span>
              <span style="color: var(--text-muted); margin: 0 0.4rem;">×</span>
              <span style="color: ${nextAwayColor};">${nextAwayTeam.name.toUpperCase()}</span>
            </div>

            <div style="font-size: 0.85rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 0.75rem;">
              PRÓXIMA PARTIDA PREPARADA (AGUARDANDO INÍCIO)
            </div>

            ${isPublic ? `
              <div style="font-size: 0.875rem; color: var(--text-muted); padding: 0.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <svg class="i i-sm" aria-hidden="true"><use href="#i-whistle"/></svg>
                <span>Aguardando início pelo administrador...</span>
              </div>
            ` : `
              <button type="button" class="btn btn-primary" id="btn-start-tie-next-match" style="min-width: 200px; padding: 0.75rem 1.5rem; font-weight: 800; font-size: 1rem; border-radius: 8px;">
                INICIAR PARTIDA
              </button>
            `}
          </div>
        </div>
      `;
      return;
    }

    // CASO 2: VENCEDOR DEFINIDO, AGUARDANDO ESCOLHA DO PRÓXIMO ADVERSÁRIO (Regras 4, 15, 16)
    const activeWinnerId = this.state.winnerTeamId || this.state.winner_team_id;
    const isWaitingOpponent = Boolean(this.state.waitingNextOpponent || this.state.waiting_next_opponent);

    if (isWaitingOpponent && activeWinnerId) {
      const winnerId = activeWinnerId;
      this.state.winnerTeamId = winnerId;
      this.state.winner_team_id = winnerId;
      const winnerTeam = teams[winnerId] || { name: winnerId };
      const winnerColor = colors[winnerId] || '#3b82f6';

      // Os 2 times que estão fora descansando (o perdedor acabou de sair de campo)
      let outsideIds = this.state.outsideWaitingTeamIds;
      if (!outsideIds || outsideIds.length === 0) {
        const playingIds = [this.state.winnerTeamId, this.state.loserTeamId].filter(Boolean);
        outsideIds = Object.keys(teams).filter(id => !playingIds.includes(id));
      }
      if (!outsideIds || outsideIds.length === 0) {
        outsideIds = Object.keys(teams).filter(id => id !== winnerId);
      }

      const availableOpponents = outsideIds.map(id => ({
        id,
        name: teams[id] ? teams[id].name : id,
        color: colors[id] || '#999'
      }));

      bannerEl.innerHTML = `
        <div class="card" style="margin-bottom: 1.25rem; border: 2px solid var(--primary); background: rgba(59, 130, 246, 0.08); padding: 1.25rem;">
          <div style="text-align: center; margin-bottom: 1rem;">
            <div style="font-size: 0.8rem; font-weight: 700; color: #10b981; text-transform: uppercase; letter-spacing: 1px;">
              PARTIDA FINALIZADA
            </div>
            <div style="font-size: 1.4rem; font-weight: 800; font-family: 'Barlow Condensed', sans-serif; margin: 0.25rem 0;">
              VENCEDOR: <span style="color: ${winnerColor};">${winnerTeam.name.toUpperCase()}</span>
            </div>
            <div style="display: inline-block; padding: 4px 12px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 20px; font-weight: 700; font-size: 0.85rem;">
              ${winnerTeam.name.toUpperCase()} PERMANECE EM CAMPO
            </div>
          </div>

          <div style="border-top: 1px solid var(--border); padding-top: 1rem;">
            <div style="text-align: center; margin-bottom: 0.75rem;">
              <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); display: block;">Quem está em campo?</span>
              <strong style="font-size: 1.1rem; color: ${winnerColor};">${winnerTeam.name.toUpperCase()}</strong>
              <small class="text-muted" style="display: block; font-size: 0.8rem;">(Vencedor da última partida)</small>
            </div>

            <div style="font-size: 0.95rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; margin-bottom: 0.75rem;">
              ${isPublic ? 'PRÓXIMO ADVERSÁRIO' : 'ESCOLHA O PRÓXIMO ADVERSÁRIO:'}
            </div>

            ${isPublic ? `
              <div style="text-align: center; font-size: 0.9rem; color: var(--text-muted); padding: 0.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <svg class="i i-sm" aria-hidden="true"><use href="#i-whistle"/></svg>
                <span>Aguardando escolha do administrador...</span>
              </div>
            ` : `
              <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
                ${availableOpponents.map(opp => `
                  <button type="button" class="btn btn-choice-next-opponent" data-team="${opp.id}" style="
                    min-width: 140px;
                    padding: 0.75rem 1.25rem;
                    font-size: 1rem;
                    font-weight: 800;
                    border: 2px solid ${opp.color};
                    background: ${opp.color}22;
                    color: #fff;
                    border-radius: 8px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    cursor: pointer;
                  ">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${opp.color};"></span>
                    <span>${opp.name.toUpperCase()}</span>
                  </button>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;
      return;
    }

    // CASO 3: PARTIDA AGENDADA OU EM ANDAMENTO
    const isOngoing = this.state.status === 'running' || this.state.status === 'paused';
    const isReady = this.state.status === 'ready';

    bannerEl.innerHTML = `
      <div class="card" style="margin-bottom: 1.25rem; border-left: 4px solid var(--primary); background: var(--surface-2); padding: 0.75rem 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); display: block;">
              ${this.state.order === 1 ? 'Primeira Partida' : 'Quem está em campo?'}
            </span>
            <div style="font-size: 1.15rem; font-weight: 800; color: ${homeColor};">
              ${homeTeam.name.toUpperCase()}
              ${this.state.order > 1 ? '<span style="font-size: 0.75rem; font-weight: 500; color: var(--text-muted); margin-left: 0.4rem;">(Permanece em campo)</span>' : ''}
            </div>
          </div>

          <div style="text-align: center;">
            <span class="status-tag ${isOngoing ? 'status-live' : 'status-scheduled'}" style="font-weight: 700;">
              PARTIDA ${String(this.state.order).padStart(2, '0')} · ${isOngoing ? (this.state.isPaused ? 'PAUSADA' : 'EM ANDAMENTO') : 'AGENDADA'}
            </span>
          </div>

          <div style="text-align: right;">
            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); display: block;">
              Adversário
            </span>
            <div style="font-size: 1.15rem; font-weight: 800; color: ${awayColor};">
              ${awayTeam.name.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderScoreboard() {
    const teams = Storage.getTeams();
    if (!teams) return;

    const colors = Storage.getTeamColors();
    const homeTeam = teams[this.state.homeTeamId] || { name: 'Time 1' };
    const awayTeam = teams[this.state.awayTeamId] || { name: 'Time 2' };

    const homeColor = colors[this.state.homeTeamId] || '#3b82f6';
    const awayColor = colors[this.state.awayTeamId] || '#ef4444';

    const nameHomeEl = document.getElementById('scoreboard-home-name');
    const nameAwayEl = document.getElementById('scoreboard-away-name');
    const scoreHomeEl = document.getElementById('scoreboard-home-score');
    const scoreAwayEl = document.getElementById('scoreboard-away-score');

    const blockHome = document.getElementById('block-team-home');
    const blockAway = document.getElementById('block-team-away');
    const badgeHome = document.getElementById('badge-team-home');
    const badgeAway = document.getElementById('badge-team-away');

    const liveBadge = document.getElementById('match-live-badge');
    if (liveBadge) {
      if (this.state.status === 'running') {
        liveBadge.textContent = `PARTIDA ${String(this.state.order).padStart(2, '0')} · EM ANDAMENTO`;
        liveBadge.className = 'live-badge is-live';
      } else if (this.state.status === 'paused') {
        liveBadge.textContent = `PARTIDA ${String(this.state.order).padStart(2, '0')} · PAUSADA`;
        liveBadge.className = 'live-badge is-paused';
      } else if (this.state.status === 'finished') {
        liveBadge.textContent = `PARTIDA ${String(this.state.order).padStart(2, '0')} · FINALIZADA`;
        liveBadge.className = 'live-badge is-finished';
      } else {
        liveBadge.textContent = `PARTIDA ${String(this.state.order).padStart(2, '0')} · AGUARDANDO INÍCIO`;
        liveBadge.className = 'live-badge';
      }
    }

    if (nameHomeEl) nameHomeEl.textContent = homeTeam.name;
    if (nameAwayEl) nameAwayEl.textContent = awayTeam.name;

    if (scoreHomeEl) {
      if (this._prevHomeScore !== undefined && this._prevHomeScore !== this.state.homeScore) {
        scoreHomeEl.classList.remove('score-pop');
        if (typeof scoreHomeEl.offsetWidth === 'number') void scoreHomeEl.offsetWidth;
        scoreHomeEl.classList.add('score-pop');
      }
      scoreHomeEl.textContent = this.state.homeScore;
    }
    if (scoreAwayEl) {
      if (this._prevAwayScore !== undefined && this._prevAwayScore !== this.state.awayScore) {
        scoreAwayEl.classList.remove('score-pop');
        if (typeof scoreAwayEl.offsetWidth === 'number') void scoreAwayEl.offsetWidth;
        scoreAwayEl.classList.add('score-pop');
      }
      scoreAwayEl.textContent = this.state.awayScore;
    }
    this._prevHomeScore = this.state.homeScore;
    this._prevAwayScore = this.state.awayScore;

    if (blockHome) blockHome.style.borderColor = homeColor;
    if (badgeHome) {
      badgeHome.style.backgroundColor = homeColor;
      badgeHome.textContent = this.state.homeTeamId.replace('time_', '');
    }

    if (blockAway) blockAway.style.borderColor = awayColor;
    if (badgeAway) {
      badgeAway.style.backgroundColor = awayColor;
      badgeAway.textContent = this.state.awayTeamId.replace('time_', '');
    }

    const btnGoalHome = document.getElementById('btn-add-goal-home');
    const btnGoalAway = document.getElementById('btn-add-goal-away');

    if (btnGoalHome) {
      btnGoalHome.innerHTML = `<svg class="i i-sm" aria-hidden="true" style="margin-right: 4px;"><use href="#i-ball"/></svg><span>+ GOL ${homeTeam.name.toUpperCase()}</span>`;
      btnGoalHome.style.borderColor = homeColor;
      btnGoalHome.disabled = this.state.status === 'finished';
    }
    if (btnGoalAway) {
      btnGoalAway.innerHTML = `<svg class="i i-sm" aria-hidden="true" style="margin-right: 4px;"><use href="#i-ball"/></svg><span>+ GOL ${awayTeam.name.toUpperCase()}</span>`;
      btnGoalAway.style.borderColor = awayColor;
      btnGoalAway.disabled = this.state.status === 'finished';
    }

    this.renderScorersSummary(homeTeam, awayTeam, homeColor, awayColor);

    const durationSelect = document.getElementById('match-duration-select');
    if (durationSelect && this.state.durationMinutes) {
      const knownValues = ['5', '7', '10', '15', '20'];
      const strVal = String(this.state.durationMinutes);
      if (knownValues.includes(strVal)) {
        durationSelect.value = strVal;
        const customInput = document.getElementById('match-duration-custom');
        if (customInput) customInput.style.display = 'none';
      } else {
        durationSelect.value = 'custom';
        const customInput = document.getElementById('match-duration-custom');
        if (customInput) {
          customInput.style.display = 'inline-block';
          customInput.value = this.state.durationMinutes;
        }
      }
    }
  },

  renderScorersSummary(homeTeam, awayTeam, homeColor, awayColor) {
    if (typeof document === 'undefined') return;
    const summaryEl = document.getElementById('scoreboard-scorers-summary');
    const homeScorersEl = document.getElementById('scoreboard-scorers-home');
    const awayScorersEl = document.getElementById('scoreboard-scorers-away');
    if (!summaryEl || !homeScorersEl || !awayScorersEl) return;

    const goals = this.state.goals || [];
    if (goals.length === 0) {
      summaryEl.style.display = 'none';
      homeScorersEl.innerHTML = '';
      awayScorersEl.innerHTML = '';
      return;
    }

    const homeGoals = goals.filter(g => g.teamId === this.state.homeTeamId);
    const awayGoals = goals.filter(g => g.teamId === this.state.awayTeamId);

    const groupGoals = (list) => {
      const counts = {};
      list.forEach(g => {
        const name = g.playerName || 'Atleta';
        counts[name] = (counts[name] || 0) + 1;
      });
      return Object.entries(counts).map(([name, count]) => ({ name, count }));
    };

    const homeList = groupGoals(homeGoals);
    const awayList = groupGoals(awayGoals);

    summaryEl.style.display = 'flex';

    homeScorersEl.innerHTML = homeList.map(item => `
      <span class="sb-scorer-badge" style="border-color: ${homeColor}40;">
        <svg class="i i-xs" aria-hidden="true" style="color: ${homeColor};"><use href="#i-ball"/></svg>
        <span class="sb-scorer-name">${item.name}</span>
        ${item.count > 1 ? `<span class="sb-scorer-count" style="background: ${homeColor}30; color: #fff;">${item.count}</span>` : ''}
      </span>
    `).join('');

    awayScorersEl.innerHTML = awayList.map(item => `
      <span class="sb-scorer-badge" style="border-color: ${awayColor}40;">
        <svg class="i i-xs" aria-hidden="true" style="color: ${awayColor};"><use href="#i-ball"/></svg>
        <span class="sb-scorer-name">${item.name}</span>
        ${item.count > 1 ? `<span class="sb-scorer-count" style="background: ${awayColor}30; color: #fff;">${item.count}</span>` : ''}
      </span>
    `).join('');
  },

  renderControls() {
    const btnStart = document.getElementById('btn-timer-start');
    const btnPause = document.getElementById('btn-timer-pause');
    const btnFinish = document.getElementById('btn-timer-finish');
    const btnReset = document.getElementById('btn-timer-reset');
    const statusTag = document.getElementById('match-status-tag');
    const isPublic = Storage.isPublicViewer();
    const round = Storage.getCurrentRound();
    const isRoundDone = round && round.status === 'FINISHED';

    if (isPublic || isRoundDone) {
      if (btnStart) btnStart.style.display = 'none';
      if (btnPause) btnPause.style.display = 'none';
      if (btnFinish) btnFinish.style.display = 'none';
      if (btnReset) btnReset.style.display = 'none';

      const btnGoalHome = document.getElementById('btn-add-goal-home');
      const btnGoalAway = document.getElementById('btn-add-goal-away');
      if (btnGoalHome) btnGoalHome.style.display = 'none';
      if (btnGoalAway) btnGoalAway.style.display = 'none';

      if (statusTag) {
        if (isRoundDone) {
          statusTag.textContent = 'NOITE ENCERRADA';
          statusTag.className = 'match-status-tag status-finished';
        } else if (this.state.status === 'running') {
          statusTag.textContent = 'Em Andamento';
          statusTag.className = 'match-status-tag status-live';
        } else if (this.state.status === 'paused') {
          statusTag.textContent = 'PAUSADA';
          statusTag.className = 'match-status-tag status-paused';
        } else if (this.state.status === 'finished') {
          statusTag.textContent = 'FINALIZADA';
          statusTag.className = 'match-status-tag status-finished';
        } else {
          statusTag.textContent = 'AGUARDANDO';
          statusTag.className = 'match-status-tag status-ready';
        }
      }
      return;
    }

    if (!btnStart || !btnPause || !btnFinish) return;

    if (this.state.status === 'running') {
      btnStart.style.display = 'none';
      btnPause.style.display = 'inline-flex';
      btnPause.innerHTML = `<svg class="i i-sm" aria-hidden="true" style="margin-right:4px;"><use href="#i-flag"/></svg><span>PAUSAR</span>`;
      btnFinish.style.display = 'inline-flex';
      if (btnReset) {
        btnReset.style.display = 'inline-flex';
        btnReset.innerHTML = `<svg class="i i-sm" aria-hidden="true"><use href="#i-rotate"/></svg><span class="btn-reset-text">REINICIAR</span>`;
      }
      if (statusTag) {
        statusTag.textContent = 'Em Andamento';
        statusTag.className = 'match-status-tag status-live';
      }
    } else if (this.state.status === 'paused') {
      btnStart.style.display = 'inline-flex';
      btnStart.innerHTML = `<svg class="i i-sm" aria-hidden="true" style="margin-right:4px;"><use href="#i-play"/></svg><span>RETOMAR</span>`;
      btnPause.style.display = 'none';
      btnFinish.style.display = 'inline-flex';
      if (btnReset) {
        btnReset.style.display = 'inline-flex';
        btnReset.innerHTML = `<svg class="i i-sm" aria-hidden="true"><use href="#i-rotate"/></svg><span class="btn-reset-text">REINICIAR</span>`;
      }
      if (statusTag) {
        statusTag.textContent = 'PAUSADA';
        statusTag.className = 'match-status-tag status-paused';
      }
    } else if (this.state.status === 'finished') {
      btnStart.style.display = 'none';
      btnPause.style.display = 'none';
      btnFinish.style.display = 'none';
      if (btnReset) btnReset.style.display = 'none';
      if (statusTag) {
        statusTag.textContent = 'FINALIZADA';
        statusTag.className = 'match-status-tag status-finished';
      }
    } else {
      btnStart.style.display = 'inline-flex';
      btnStart.innerHTML = `<svg class="i i-sm" aria-hidden="true" style="margin-right:4px;"><use href="#i-play"/></svg><span>INICIAR</span>`;
      btnPause.style.display = 'none';
      btnFinish.style.display = 'none';
      if (btnReset) btnReset.style.display = 'none';
      if (statusTag) {
        statusTag.textContent = 'AGUARDANDO';
        statusTag.className = 'match-status-tag status-ready';
      }
    }
  },

  renderGoalsList() {
    const listEl = document.getElementById('match-goals-timeline');
    if (!listEl) return;

    if (!this.state.goals || this.state.goals.length === 0) {
      listEl.innerHTML = `
        <div class="empty-timeline" style="padding: 1.5rem; text-align: center; color: var(--text-dim);">
          <span>Nenhum gol registrado nesta partida.</span>
        </div>
      `;
      return;
    }

    const colors = Storage.getTeamColors();
    const isPublic = Storage.isPublicViewer();

    listEl.innerHTML = this.state.goals.map(goal => {
      const color = colors[goal.teamId] || '#fff';
      const isHome = goal.teamId === this.state.homeTeamId;
      const removeBtn = (isPublic || this.state.status === 'finished') ? '' : `
        <button type="button" class="btn-delete-goal btn-remove-goal" data-id="${goal.id}" title="Excluir este gol">
          <svg class="i i-sm" aria-hidden="true"><use href="#i-trash"/></svg>
        </button>
      `;

      return `
        <div class="timeline-goal-entry goal-item ${isHome ? 'home-goal' : 'away-goal'}" data-id="${goal.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; margin-bottom: 0.4rem; background: var(--surface-2); border-radius: 6px;">
          <div class="goal-info-group" style="display: flex; align-items: center; gap: 0.6rem;">
            <span class="goal-time-badge" style="font-size: 0.8rem; font-weight: 700; color: var(--text-dim);">${goal.minuteFormatted}</span>
            <svg class="i i-sm" aria-hidden="true" style="color: ${color};"><use href="#i-ball"/></svg>
            <div>
              <div class="goal-player-name" style="font-weight: 600;">${goal.playerName}</div>
              <div class="goal-team-label" style="font-size: 0.75rem; color: ${color};">${goal.teamName}</div>
            </div>
          </div>
          ${removeBtn}
        </div>
      `;
    }).join('');

    if (!isPublic && this.state.status !== 'finished') {
      listEl.querySelectorAll('.btn-remove-goal').forEach(btn => {
        btn.onclick = () => this.removerGol(btn.dataset.id);
      });
    }
  },

  renderNightEndSection() {
    let sectionEl = document.getElementById('night-end-control-section');
    if (!sectionEl) {
      sectionEl = document.createElement('div');
      sectionEl.id = 'night-end-control-section';
      const container = document.getElementById('partida-active-state');
      if (container) {
        container.appendChild(sectionEl);
      }
    }

    const round = Storage.getCurrentRound();
    const roundKey = round ? round.dateKey : Utils.getDateKey(new Date());
    const matches = Storage.getMatches().filter(m => (round && m.roundId === round.id) || m.dateKey === roundKey);
    const isRoundDone = round && round.status === 'FINISHED';
    const canEndNight = matches.length > 0 && this.state.status !== 'running' && this.state.status !== 'paused';

    if (isRoundDone) {
      sectionEl.innerHTML = '';
      sectionEl.style.display = 'none';
      return;
    }

    if (Storage.isPublicViewer()) {
      sectionEl.innerHTML = '';
      return;
    }

    sectionEl.innerHTML = `
      <div class="card night-control-card" style="margin-top: 1.5rem; padding: 1.25rem; border: 1px solid var(--border);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <h4 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.25rem;">Encerramento da Noite</h4>
            <p class="text-muted" style="font-size: 0.85rem; margin: 0;">
              ${matches.length === 0                ? 'Realize a primeira partida para liberar o encerramento.'                : `${matches.length} partida(s) finalizada(s). Quando desejar, encerre a noite para definir o campeão e distribuir as Capas.`}
            </p>
          </div>

          <button type="button" id="btn-encerrar-noite" class="btn ${canEndNight ? 'btn-primary btn-ready-pulse' : 'btn-secondary'}" title="Encerrar noite e consagrar campeão">
            <svg class="i" aria-hidden="true"><use href="#i-crown"/></svg>
            <span>ENCERRAR NOITE</span>
          </button>
        </div>
      </div>
    `;
  }
};
