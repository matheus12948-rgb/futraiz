/**
 * Módulo Tabela do Dia - Familia do Fut
 * Classificação oficial e em tempo real baseada exclusivamente nas equipes da rodada atual.
 * 
 * Regras:
 * 1. Pontuação: Vitória = 3 pts, Empate = 1 pt, Derrota = 0 pts.
 * 2. Critérios de Desempate: 1. Pontos, 2. Saldo de Gols (SG), 3. Gols Pró (GP), 4. Menor Gols Contra (GC).
 * 3. A tabela NUNCA fica vazia se houver rodada/times: sempre exibe os 4 times.
 * 4. Prévia em tempo real: durante a partida ao vivo, GP, GC e SG refletem os gols em andamento;
 *    os pontos (PTS, V, E, D) só são consolidados ao FINALIZAR a partida (sem duplicidade).
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';

export const Tabela = {
  init() {
    this.render();
    Storage.onChange((type) => {
      if (['currentRound', 'teams', 'teamNameUpdated', 'matches', 'liveMatchUpdate', 'reset', 'newRound'].includes(type)) {
        this.render();
      }
    });
  },

  /**
   * Função oficial de cálculo da tabela da rodada.
   * Busca os 4 times, inicializa com zero, processa as partidas e retorna os 4 times ordenados.
   */
  calcularTabelaRodada(rodadaId = null) {
    const currentRound = Storage.getCurrentRound();
    let round = null;
    if (rodadaId) {
      round = Storage.getRounds().find(r => r.id === rodadaId) || (currentRound && currentRound.id === rodadaId ? currentRound : null);
    } else {
      round = currentRound;
    }

    // 1. Se a rodada já foi finalizada e possui snapshot salvo, retorna o snapshot congelado da classificação final!
    if (round && round.status === 'FINISHED') {
      const snapshot = round.standingsSnapshot || Storage.getRoundStandingsSnapshot(round.id);
      if (Array.isArray(snapshot) && snapshot.length > 0) {
        return snapshot;
      }
    }

    // 2. Filtra partidas ESTRITAMENTE desta rodada para impedir contaminação
    const allMatches = Storage.getMatches() || [];
    let roundMatches = [];
    if (round) {
      roundMatches = allMatches.filter(m => m.roundId === round.id);
      // Fallback estrito apenas se existirem partidas legadas sem roundId na mesma data e rodada não finalizada
      if (roundMatches.length === 0 && round.status !== 'FINISHED') {
        const legacyMatches = allMatches.filter(m => !m.roundId && m.dateKey === round.dateKey);
        if (legacyMatches.length > 0) roundMatches = legacyMatches;
      }
    }

    const liveMatch = Storage.getLiveMatch();
    const liveForThisRound = (liveMatch && (!round || liveMatch.roundId === round.id || !liveMatch.roundId)) ? liveMatch : null;
    return this.calcularTabela(roundMatches, liveForThisRound, round);
  },

  /**
   * Cálculo padronizado e robusto da tabela.
   * @param {Array} matchesList - Lista de partidas finalizadas
   * @param {Object|null} liveMatch - Partida em andamento para prévia em tempo real
   * @param {Object|null} currentRound - Rodada de referência
   */
  calcularTabela(matchesList = [], liveMatch = null, currentRound = null) {
    const round = currentRound || Storage.getCurrentRound();
    const storedTeams = Storage.getTeams() || (round && round.teams ? round.teams : null) || {};
    const colors = Storage.getTeamColors();

    const teamKeys = ['time_1', 'time_2', 'time_3', 'time_4'];
    const stats = {};

    // 1. Inicializa SEMPRE os 4 times da rodada com zero
    teamKeys.forEach((key, idx) => {
      const teamObj = storedTeams[key] || storedTeams[`team_${idx + 1}`] || storedTeams[`team${idx + 1}`];
      const defaultName = `Time ${idx + 1}`;
      stats[key] = {
        id: key,
        name: teamObj && teamObj.name ? teamObj.name : defaultName,
        j: 0,
        v: 0,
        e: 0,
        d: 0,
        gp: 0,
        gc: 0,
        sg: 0,
        pts: 0,
        color: (teamObj && teamObj.color) || colors[key] || '#3b82f6'
      };
    });

    const resolveKey = (id) => {
      if (!id) return null;
      if (stats[id]) return id;
      const lower = String(id).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lower === 'time1' || lower === 'team1') return 'time_1';
      if (lower === 'time2' || lower === 'team2') return 'time_2';
      if (lower === 'time3' || lower === 'team3') return 'time_3';
      if (lower === 'time4' || lower === 'team4') return 'time_4';
      return null;
    };

    // Conjunto para evitar que a mesma partida finalizada seja computada mais de uma vez
    const processedMatchIds = new Set();

    // 2. Processa todas as partidas FINALIZADAS
    (matchesList || []).forEach(m => {
      if (m.id) {
        if (processedMatchIds.has(m.id)) return;
        processedMatchIds.add(m.id);
      }

      const homeKey = resolveKey(m.homeTeamId);
      const awayKey = resolveKey(m.awayTeamId);

      if (!homeKey || !awayKey) return;

      const home = stats[homeKey];
      const away = stats[awayKey];

      const homeScore = Number(m.homeScore) || 0;
      const awayScore = Number(m.awayScore) || 0;

      home.j += 1;
      away.j += 1;

      home.gp += homeScore;
      home.gc += awayScore;

      away.gp += awayScore;
      away.gc += homeScore;

      if (homeScore > awayScore) {
        home.v += 1;
        home.pts += 3;
        away.d += 1;
      } else if (awayScore > homeScore) {
        away.v += 1;
        away.pts += 3;
        home.d += 1;
      } else {
        home.e += 1;
        home.pts += 1;
        away.e += 1;
        away.pts += 1;
      }
    });

    // 3. Prévia em Tempo Real dos gols da partida ao vivo (sem dar pontos antecipados)
    if (liveMatch && (liveMatch.status === 'running' || liveMatch.status === 'paused' || liveMatch.isActive)) {
      const isAlreadyFinalized = liveMatch.id && processedMatchIds.has(liveMatch.id);
      if (!isAlreadyFinalized) {
        const homeKey = resolveKey(liveMatch.homeTeamId);
        const awayKey = resolveKey(liveMatch.awayTeamId);
        if (homeKey && awayKey && stats[homeKey] && stats[awayKey]) {
          const liveHomeScore = Number(liveMatch.homeScore) || 0;
          const liveAwayScore = Number(liveMatch.awayScore) || 0;
          stats[homeKey].gp += liveHomeScore;
          stats[homeKey].gc += liveAwayScore;
          stats[awayKey].gp += liveAwayScore;
          stats[awayKey].gc += liveHomeScore;
        }
      }
    }

    // 4. Calcula Saldo de Gols de cada time
    teamKeys.forEach(k => {
      stats[k].sg = stats[k].gp - stats[k].gc;
    });

    // 5. Ordenação Oficial: 1. PTS, 2. SG, 3. GP, 4. Menor GC, 5. Ordem inicial
    const rows = Object.values(stats);
    rows.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.sg !== a.sg) return b.sg - a.sg;
      if (b.gp !== a.gp) return b.gp - a.gp;
      if (a.gc !== b.gc) return a.gc - b.gc;
      return a.id.localeCompare(b.id);
    });

    return rows;
  },

  // Detecta se existe empate na 1ª colocação após todos os critérios
  detectTieAtTop(standings) {
    if (!standings || standings.length < 2) return null;
    const first = standings[0];
    const second = standings[1];

    if (first.j > 0 && second.j > 0 && first.pts === second.pts && first.sg === second.sg && first.gp === second.gp) {
      return standings.filter(s => s.pts === first.pts && s.sg === first.sg && s.gp === first.gp);
    }
    return null;
  },

  render() {
    const container = document.getElementById('tabela-container');
    const headerDateEl = document.getElementById('tabela-date-header');
    if (!container) return;

    const round = Storage.getCurrentRound();
    const roundDateFormatted = round ? (round.dateFormatted || round.date || Utils.formatDate(new Date())) : Utils.formatDate(new Date());

    let statusLabel = 'Aguardando Início';
    if (round) {
      if (round.status === 'FINISHED') {
        statusLabel = `Noite Encerrada · Campeão: ${round.campeaoTimeNome || 'Definido'}`;
      } else if (round.status === 'ACTIVE') {
        statusLabel = 'Noite em Andamento';
      } else if (round.status === 'READY') {
        statusLabel = 'Programação Pronta';
      }
    } else {
      statusLabel = 'Nenhuma Rodada Ativa';
    }

    if (headerDateEl) {
      headerDateEl.textContent = `Rodada: ${roundDateFormatted} · ${statusLabel}`;
    }

    // Partidas da rodada atual
    const allMatches = Storage.getMatches() || [];
    let roundMatches = [];
    if (round) {
      roundMatches = allMatches.filter(m => m.roundId === round.id);
      if (roundMatches.length === 0 && round.status !== 'FINISHED') {
        const legacyMatches = allMatches.filter(m => !m.roundId && m.dateKey === round.dateKey);
        if (legacyMatches.length > 0) roundMatches = legacyMatches;
      }
    }

    const standings = this.calcularTabelaRodada();
    const tiedAtTop = this.detectTieAtTop(standings);
    const colors = Storage.getTeamColors();
    const storedTeams = Storage.getTeams() || (round && round.teams ? round.teams : {}) || {};

    const tieAlertHtml = tiedAtTop ? `
      <div class="alert alert-warning" style="margin-bottom: 1rem; padding: 0.75rem 1rem; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; color: #f59e0b; display: flex; align-items: flex-start; gap: 0.5rem;">
        <svg class="i i-sm" aria-hidden="true" style="margin-top: 2px;"><use href="#i-flag"/></svg>
        <div>
          <strong>EMPATE NA LIDERANÇA:</strong> Os times ${tiedAtTop.map(t => `<strong>${t.name}</strong>`).join(' e ')} estão empatados com ${tiedAtTop[0].pts} pts, SG ${tiedAtTop[0].sg} e ${tiedAtTop[0].gp} GP. O desempate deve ser definido pelo administrador no encerramento da noite.
        </div>
      </div>
    ` : '';

    // Histórico de rodadas/noites finalizadas
    const allRounds = Storage.getRounds() || [];
    const finishedRounds = allRounds.filter(r => r.status === 'FINISHED' && (!round || r.id !== round.id));
    if (round && round.status === 'FINISHED' && !finishedRounds.some(r => r.id === round.id)) {
      finishedRounds.unshift(round);
    }

    container.innerHTML = `
      ${tieAlertHtml}
      
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <span class="eyebrow" style="color: var(--text-dim);">Classificação Oficial</span>
            <h3 class="card-title" style="margin: 0.2rem 0;">TABELA ATUAL</h3>
            <span style="font-size: 0.85rem; color: var(--text-dim);">Rodada: ${roundDateFormatted}</span>
          </div>
          ${round && round.status === 'FINISHED' ? `
            <span class="badge" style="background: rgba(234, 179, 8, 0.15); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.3); font-weight: 700;">
              CAMPEÃO: ${round.campeaoTimeNome || 'Definido'}
            </span>
          ` : ''}
        </div>

        <div class="sports-table-wrapper" style="margin-top: 0.75rem;">
          <table class="sports-table">
            <thead>
              <tr>
                <th class="col-pos">POS</th>
                <th class="col-team">TIME</th>
                <th class="col-num" title="Jogos">J</th>
                <th class="col-num" title="Vitórias">V</th>
                <th class="col-num" title="Empates">E</th>
                <th class="col-num" title="Derrotas">D</th>
                <th class="col-num" title="Gols Pró">GP</th>
                <th class="col-num" title="Gols Contra">GC</th>
                <th class="col-num" title="Saldo de Gols">SG</th>
                <th class="col-pts" title="Pontos">PTS</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map((row, idx) => {
                const teamColor = row.color || colors[row.id] || '#3b82f6';
                const posFormatted = String(idx + 1).padStart(2, '0');
                const sgFormatted = row.sg > 0 ? `+${row.sg}` : String(row.sg);
                const isLeader = idx === 0 && row.j > 0;

                return `
                  <tr style="${isLeader ? 'background: rgba(0, 179, 122, 0.05);' : ''}">
                    <td class="col-pos" style="${isLeader ? 'color: var(--primary); font-weight: 800;' : ''}">${posFormatted}</td>
                    <td class="col-team">
                      <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${teamColor};"></span>
                        <strong>${row.name}</strong>
                        ${isLeader ? '<span style="font-size: 0.65rem; font-weight: 800; background: rgba(0, 179, 122, 0.15); color: var(--primary); padding: 1px 6px; border-radius: 10px; margin-left: 2px;">1º</span>' : ''}
                      </div>
                    </td>
                    <td class="col-num">${row.j}</td>
                    <td class="col-num">${row.v}</td>
                    <td class="col-num">${row.e}</td>
                    <td class="col-num">${row.d}</td>
                    <td class="col-num">${row.gp}</td>
                    <td class="col-num">${row.gc}</td>
                    <td class="col-num">${sgFormatted}</td>
                    <td class="col-pts">${row.pts}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="today-matches-section" style="margin-bottom: 2rem;">
        <h4 class="section-title">Partidas da Rodada Atual (${roundMatches.length})</h4>
        ${roundMatches.length === 0 ? `
          <div class="empty-state-card">
            <span>Nenhuma partida finalizada nesta rodada ainda.</span>
          </div>
        ` : `
          <div class="matches-compact-grid">
            ${roundMatches.map(m => {
              const homeColor = m.homeTeamColor || colors[m.homeTeamId] || '#3b82f6';
              const awayColor = m.awayTeamColor || colors[m.awayTeamId] || '#ef4444';
              const matchTime = m.time || (m.createdAt ? Utils.formatTime(new Date(m.createdAt)) : '');
              const homeName = (storedTeams && storedTeams[m.homeTeamId]?.name) || m.homeTeamName || 'Time 1';
              const awayName = (storedTeams && storedTeams[m.awayTeamId]?.name) || m.awayTeamName || 'Time 2';
              return `
                <div class="match-mini-card">
                  <div class="match-mini-header">
                    <span class="match-time">${matchTime}</span>
                    <span class="match-badge">${m.resultText || (m.isTie ? 'Empate' : '')}</span>
                  </div>
                  <div class="match-mini-score">
                    <div class="mini-team">
                      <span class="dot" style="background-color: ${homeColor};"></span>
                      <span>${homeName}</span>
                    </div>
                    <span class="mini-result"><strong>${m.homeScore}</strong> × <strong>${m.awayScore}</strong></span>
                    <div class="mini-team">
                      <span class="dot" style="background-color: ${awayColor};"></span>
                      <span>${awayName}</span>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>

      <!-- HISTÓRICO DE RODADAS / NOITES (Requisito 4 & 9) -->
      <div class="history-standings-section card" style="margin-top: 1.5rem;">
        <div class="card-head" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <span class="eyebrow" style="color: var(--text-dim);">Noites Anteriores</span>
            <h3 class="card-title" style="margin: 0.2rem 0; display: flex; align-items: center; gap: 0.5rem;">
              <svg class="i i-sm" aria-hidden="true"><use href="#i-history"/></svg>
              HISTÓRICO
            </h3>
          </div>
        </div>

        ${finishedRounds.length === 0 ? `
          <div class="empty-state text-center" style="padding: 1.5rem 1rem;">
            <p class="text-muted" style="margin: 0;">Nenhuma rodada anterior finalizada no histórico.</p>
          </div>
        ` : `
          <div class="history-rounds-list" style="display: flex; flex-direction: column; gap: 1.25rem;">
            ${finishedRounds.map((r, rIdx) => {
              const rStandings = this.calcularTabelaRodada(r.id);
              const rMatches = allMatches.filter(m => m.roundId === r.id);
              const champColor = colors[r.campeaoTimeId] || '#eab308';
              const rDate = r.date || (r.dateKey ? Utils.formatDate(new Date(r.dateKey + 'T12:00:00')) : `Rodada ${rIdx + 1}`);

              return `
                <div class="history-round-item" style="border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: 8px; padding: 1rem; background: var(--surface-2, rgba(255,255,255,0.02)); border-left: 4px solid ${champColor};">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
                    <div>
                      <strong style="font-size: 1.05rem; display: block;">${rDate}</strong>
                      <span class="badge" style="background: rgba(234, 179, 8, 0.15); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.3); font-weight: 700; margin-top: 0.3rem;">
                        <svg class="i i-sm" aria-hidden="true" style="margin-right: 3px;"><use href="#i-crown"/></svg>
                        Campeão: ${r.campeaoTimeNome || 'Definido'}
                      </span>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                      <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-dim);">
                        ${rMatches.length} partidas
                      </span>
                      <button type="button" class="btn btn-secondary btn-sm btn-open-round-details" data-round-id="${r.id}" style="font-size: 0.75rem; padding: 4px 8px;">
                        Ver Detalhes
                      </button>
                    </div>
                  </div>

                  <div class="sports-table-wrapper" style="overflow-x: auto;">
                    <table class="sports-table" style="font-size: 0.82rem;">
                      <thead>
                        <tr>
                          <th class="col-pos">POS</th>
                          <th class="col-team">TIME</th>
                          <th class="col-num" title="Jogos">J</th>
                          <th class="col-num" title="Vitórias">V</th>
                          <th class="col-num" title="Empates">E</th>
                          <th class="col-num" title="Derrotas">D</th>
                          <th class="col-num" title="Gols Pró">GP</th>
                          <th class="col-num" title="Gols Contra">GC</th>
                          <th class="col-num" title="Saldo de Gols">SG</th>
                          <th class="col-pts" title="Pontos">PTS</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${rStandings.map((row, idx) => {
                          const teamColor = row.color || colors[row.id] || '#3b82f6';
                          const isChamp = row.id === r.campeaoTimeId;
                          const sgFormatted = row.sg > 0 ? `+${row.sg}` : String(row.sg);
                          return `
                            <tr style="${isChamp ? 'background: rgba(234, 179, 8, 0.06);' : ''}">
                              <td class="col-pos" style="${isChamp ? 'color: #eab308; font-weight: 800;' : ''}">${String(idx + 1).padStart(2, '0')}</td>
                              <td class="col-team">
                                <div style="display: flex; align-items: center; gap: 0.4rem;">
                                  <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background-color: ${teamColor};"></span>
                                  <strong>${row.name}</strong>
                                  ${isChamp ? '<span style="font-size: 0.6rem; font-weight: 800; background: rgba(234, 179, 8, 0.2); color: #eab308; padding: 1px 4px; border-radius: 4px;">🏆</span>' : ''}
                                </div>
                              </td>
                              <td class="col-num">${row.j}</td>
                              <td class="col-num">${row.v}</td>
                              <td class="col-num">${row.e}</td>
                              <td class="col-num">${row.d}</td>
                              <td class="col-num">${row.gp}</td>
                              <td class="col-num">${row.gc}</td>
                              <td class="col-num">${sgFormatted}</td>
                              <td class="col-pts" style="${isChamp ? 'color: #eab308; font-weight: 800;' : ''}">${row.pts}</td>
                            </tr>
                          `;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    // Conecta botões "Ver Detalhes"
    container.querySelectorAll('.btn-open-round-details').forEach(btn => {
      btn.onclick = () => {
        const rId = btn.dataset.roundId;
        if (window.Historico) {
          window.Historico.abrirDetalhesRodada(rId);
        }
      };
    });
  }
};
