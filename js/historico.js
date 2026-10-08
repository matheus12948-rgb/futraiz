/**
 * Módulo de Histórico - Familia do Fut
 * 
 * Regras:
 * 1. Histórico das Noites (Rodadas):
 *    - Data, Campeão da Noite, 5 jogadores da Capa, total de partidas.
 *    - Detalhes completos ao clicar: times, 20 jogadores, programação, resultados, gols, tabela final e artilharia.
 * 2. Histórico Individual de Capas:
 *    - Permite consultar em quais noites cada jogador ganhou Capa (data, time campeão, rodada).
 * 3. Ícones SVG minimalistas (sem emojis).
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { Tabela } from './tabela.js';

export const Historico = {
  currentTab: 'noites', // 'noites' | 'capas'
  selectedPlayerId: null,

  init() {
    this.bindEvents();
    this.render();

    Storage.onChange((type) => {
      if (['rounds', 'matches', 'capas', 'nightFinalized', 'reset'].includes(type)) {
        this.render();
      }
    });
  },

  bindEvents() {
    document.addEventListener('click', (e) => {
      // Alternância de abas
      if (e.target.closest('#tab-hist-noites')) {
        this.currentTab = 'noites';
        this.updateTabButtons();
        this.render();
        return;
      }
      if (e.target.closest('#tab-hist-capas')) {
        this.currentTab = 'capas';
        this.updateTabButtons();
        this.render();
        return;
      }

      // Abrir detalhes da rodada
      const btnDetails = e.target.closest('.btn-view-round-details');
      if (btnDetails) {
        const roundId = btnDetails.dataset.roundId;
        this.abrirDetalhesRodada(roundId);
        return;
      }

      // Ver histórico de Capas de um jogador específico
      const btnPlayerCapas = e.target.closest('.btn-view-player-capas');
      if (btnPlayerCapas) {
        this.selectedPlayerId = btnPlayerCapas.dataset.playerId;
        this.currentTab = 'capas';
        this.updateTabButtons();
        this.render();
        return;
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'select-history-player-capas') {
        this.selectedPlayerId = e.target.value;
        this.renderCapasHistory();
      }
    });
  },

  updateTabButtons() {
    const tabNoites = document.getElementById('tab-hist-noites');
    const tabCapas = document.getElementById('tab-hist-capas');
    if (tabNoites) tabNoites.classList.toggle('active', this.currentTab === 'noites');
    if (tabCapas) tabCapas.classList.toggle('active', this.currentTab === 'capas');
  },

  render() {
    const container = document.getElementById('historico-container');
    if (!container) return;

    // Renderiza tabs se não existirem no container
    let tabsHeader = document.getElementById('historico-tabs-header');
    if (!tabsHeader) {
      tabsHeader = document.createElement('div');
      tabsHeader.id = 'historico-tabs-header';
      tabsHeader.className = 'tabs';
      tabsHeader.setAttribute('role', 'tablist');
      tabsHeader.style.marginBottom = '1.25rem';
      tabsHeader.innerHTML = `
        <button type="button" class="tab-btn active" id="tab-hist-noites" role="tab">Noites de Futebol</button>
        <button type="button" class="tab-btn" id="tab-hist-capas" role="tab">Histórico de Capas</button>
      `;
      container.parentNode.insertBefore(tabsHeader, container);
    }
    this.updateTabButtons();

    if (this.currentTab === 'noites') {
      this.renderNoites(container);
    } else {
      this.renderCapasHistory(container);
    }
  },

  renderNoites(container) {
    const rounds = Storage.getRounds();
    const currentRound = Storage.getCurrentRound();
    const allMatches = Storage.getMatches();

    // Combina rodadas arquivadas e rodada atual (se finalizada)
    const displayRounds = [...rounds];
    if (currentRound && currentRound.status === 'FINISHED' && !displayRounds.some(r => r.id === currentRound.id)) {
      displayRounds.unshift(currentRound);
    }

    if (displayRounds.length === 0 && allMatches.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
          <div class="empty-icon" style="color: var(--text-dim); margin-bottom: 0.75rem;">
            <svg class="i" style="width:36px;height:36px;" aria-hidden="true"><use href="#i-history"/></svg>
          </div>
          <h3>Nenhuma noite encerrada ainda</h3>
          <p class="text-muted">Quando você encerrar noites de futebol e definir campeões, o histórico completo ficará registrado aqui.</p>
        </div>
      `;
      return;
    }

    const colors = Storage.getTeamColors();

    container.innerHTML = `
      <div class="history-rounds-list" style="display: flex; flex-direction: column; gap: 1rem;">
        ${displayRounds.map((r, idx) => {
          const roundMatches = allMatches.filter(m => m.roundId === r.id || m.dateKey === r.dateKey);
          const championColor = colors[r.campeaoTimeId] || '#eab308';
          const roundNumStr = String(r.numero || (displayRounds.length - idx)).padStart(2, '0');

          let capaPlayersNames = [];
          if (r.capaPlayerIds && r.teams && r.campeaoTimeId && r.teams[r.campeaoTimeId]) {
            capaPlayersNames = r.teams[r.campeaoTimeId].players.map(p => p.name);
          } else if (r.teams && r.campeaoTimeId && r.teams[r.campeaoTimeId]) {
            capaPlayersNames = r.teams[r.campeaoTimeId].players.map(p => p.name);
          }

          const roundStandings = Tabela.calcularTabelaRodada(r.id);

          return `
            <div class="card history-round-card" style="border-left: 4px solid ${championColor};">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem;">
                <div>
                  <span class="eyebrow" style="color: var(--text-dim);">RODADA ${roundNumStr}</span>
                  <h3 style="font-size: 1.2rem; font-weight: 700; margin: 0.2rem 0;">${r.date || 'Data da Rodada'}</h3>
                </div>

                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span class="badge" style="background: rgba(234, 179, 8, 0.15); color: #eab308; border: 1px solid rgba(234, 179, 8, 0.3); font-weight: 700;">
                    <svg class="i i-sm" aria-hidden="true" style="margin-right: 4px;"><use href="#i-crown"/></svg>
                    CAMPEÃO: ${r.campeaoTimeNome || 'Time Campeão'}
                  </span>
                  <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-dim);">
                    ${roundMatches.length} partidas
                  </span>
                </div>
              </div>

              <!-- Tabela Final da Rodada (Snapshot Congelado) -->
              <div class="sports-table-wrapper" style="overflow-x: auto; margin: 0.6rem 0;">
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
                    ${roundStandings.map((row, idx) => {
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

              ${capaPlayersNames.length > 0 ? `
                <div style="margin: 0.75rem 0; padding: 0.6rem 0.8rem; background: var(--surface-2); border-radius: 6px;">
                  <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #eab308; display: flex; align-items: center; gap: 4px; margin-bottom: 0.3rem;">
                    <svg class="i i-sm" aria-hidden="true"><use href="#i-crown"/></svg>
                    Capa Conquistada:
                  </span>
                  <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
                    ${capaPlayersNames.map(name => `
                      <span class="badge" style="font-size: 0.8rem; background: rgba(234, 179, 8, 0.1); color: var(--text-main); border: 1px solid rgba(234, 179, 8, 0.25);">
                        ${name}
                      </span>
                    `).join('')}
                  </div>
                </div>
              ` : ''}

              <div style="display: flex; justify-content: flex-end; margin-top: 0.5rem;">
                <button type="button" class="btn btn-secondary btn-sm btn-view-round-details" data-round-id="${r.id}">
                  <span>Ver Detalhes e Partidas</span>
                  <svg class="i i-sm" aria-hidden="true"><use href="#i-chevron-right"/></svg>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  renderCapasHistory(container = document.getElementById('historico-container')) {
    if (!container) return;

    const allCapas = Storage.getCapas();
    const allPlayers = Storage.getPlayers();

    if (allCapas.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
          <div class="empty-icon" style="color: var(--text-dim); margin-bottom: 0.75rem;">
            <svg class="i" style="width:36px;height:36px;" aria-hidden="true"><use href="#i-crown"/></svg>
          </div>
          <h3>Nenhuma Capa conquistada ainda</h3>
          <p class="text-muted">A Capa é atribuída individualmente a cada jogador do time campeão ao final da noite.</p>
        </div>
      `;
      return;
    }

    // Jogadores que já conquistaram pelo menos 1 Capa
    const playerIdsWithCapa = Array.from(new Set(allCapas.map(c => c.jogador_id)));
    const playersWithCapa = playerIdsWithCapa.map(pid => {
      const p = allPlayers.find(pl => pl.id === pid);
      const count = allCapas.filter(c => c.jogador_id === pid).length;
      return {
        id: pid,
        name: p ? p.name : (allCapas.find(c => c.jogador_id === pid)?.playerName || 'Jogador'),
        count: count
      };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    if (!this.selectedPlayerId && playersWithCapa.length > 0) {
      this.selectedPlayerId = playersWithCapa[0].id;
    }

    const selectedPlayerCapas = allCapas.filter(c => c.jogador_id === this.selectedPlayerId);
    const selectedPlayerInfo = playersWithCapa.find(p => p.id === this.selectedPlayerId) || playersWithCapa[0];

    container.innerHTML = `
      <div class="card history-capas-card">
        <div class="card-head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <h3 class="card-title" style="display: flex; align-items: center; gap: 0.5rem;">
              <svg class="i" style="width:20px;height:20px; color: #eab308;" aria-hidden="true"><use href="#i-crown"/></svg>
              <span>HISTÓRICO INDIVIDUAL DE CAPAS</span>
            </h3>
            <p class="text-muted" style="font-size: 0.85rem; margin-top: 0.2rem;">
              Consulte em quais noites cada atleta foi campeão e conquistou a Capa.
            </p>
          </div>

          <div style="min-width: 200px;">
            <select id="select-history-player-capas" class="form-control select-compact">
              ${playersWithCapa.map(p => `
                <option value="${p.id}" ${p.id === this.selectedPlayerId ? 'selected' : ''}>
                  ${p.name} (${p.count} ${p.count === 1 ? 'Capa' : 'Capas'})
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        ${selectedPlayerInfo ? `
          <div class="selected-player-capa-header" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface-2); border-radius: 8px; margin: 1rem 0;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #eab308; color: #07111F; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.3rem;">
              ${selectedPlayerInfo.name.charAt(0)}
            </div>
            <div>
              <h4 style="font-size: 1.15rem; font-weight: 700; margin: 0;">${selectedPlayerInfo.name}</h4>
              <span style="color: #eab308; font-weight: 700; font-size: 0.9rem;">
                ${selectedPlayerCapas.length} ${selectedPlayerCapas.length === 1 ? 'Capa conquistada' : 'Capas conquistadas'}
              </span>
            </div>
          </div>

          <div class="capas-timeline-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${selectedPlayerCapas.map((c, idx) => `
              <div class="capa-record-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.9rem; background: var(--surface-2); border-radius: 6px; border-left: 3px solid #eab308;">
                <div style="display: flex; align-items: center; gap: 0.6rem;">
                  <span style="font-family: 'Barlow Condensed'; font-weight: 700; font-size: 1rem; color: var(--text-dim); min-width: 24px;">
                    ${String(idx + 1).padStart(2, '0')}
                  </span>
                  <span style="font-weight: 600; font-size: 0.95rem;">${c.date || 'Data da Rodada'}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span class="badge" style="background: rgba(234, 179, 8, 0.15); color: #eab308; font-weight: 600;">
                    ${c.teamName || 'Time Campeão'}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  abrirDetalhesRodada(roundId) {
    const rounds = Storage.getRounds();
    const currentRound = Storage.getCurrentRound();
    let round = rounds.find(r => r.id === roundId);
    if (!round && currentRound && currentRound.id === roundId) round = currentRound;
    if (!round) return;

    const allMatches = Storage.getMatches() || [];
    let roundMatches = allMatches.filter(m => m.roundId === round.id);
    if (roundMatches.length === 0 && round.status !== 'FINISHED') {
      roundMatches = allMatches.filter(m => !m.roundId && m.dateKey === round.dateKey);
    }
    const standings = Tabela.calcularTabelaRodada(round.id);
    const colors = Storage.getTeamColors();

    const modalId = 'modal-round-details-view';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-card modal-card-large" style="max-width: 720px; max-height: 90vh; overflow-y: auto;">
          <div class="modal-header">
            <h3 id="modal-round-details-title">DETALHES DA NOITE</h3>
            <button type="button" class="btn-close" data-close>✕</button>
          </div>
          <div class="modal-body" id="modal-round-details-body"></div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('[data-close]').onclick = () => Utils.closeModal(modalId);
      modal.querySelector('.modal-backdrop').onclick = () => Utils.closeModal(modalId);
    }

    const titleEl = document.getElementById('modal-round-details-title');
    titleEl.innerHTML = `DETALHES DA NOITE — <span style="color: #eab308;">${round.date}</span>`;

    const bodyEl = document.getElementById('modal-round-details-body');
    bodyEl.innerHTML = `
      <!-- Campeão e Capa -->
      <div class="card" style="margin-bottom: 1rem; border-left: 4px solid #eab308; background: rgba(234, 179, 8, 0.05); padding: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem;">
          <svg class="i" style="width: 22px; height: 22px; color: #eab308;" aria-hidden="true"><use href="#i-crown"/></svg>
          <strong style="font-size: 1.1rem; color: #eab308;">Campeão: ${round.campeaoTimeNome || 'Time Campeão'}</strong>
        </div>
        ${round.teams && round.campeaoTimeId && round.teams[round.campeaoTimeId] ? `
          <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 0.3rem;">Atletas que receberam Capa:</div>
          <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
            ${round.teams[round.campeaoTimeId].players.map(p => `
              <span class="badge" style="background: rgba(234, 179, 8, 0.15); color: var(--text-main); border: 1px solid rgba(234, 179, 8, 0.3);">
                ${p.name}
              </span>
            `).join('')}
          </div>
        ` : ''}
      </div>

      <!-- Tabela Final -->
      <div style="margin-bottom: 1.25rem;">
        <h4 style="font-size: 0.95rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.5rem;">
          Tabela Final da Noite
        </h4>
        <div class="sports-table-wrapper">
          <table class="sports-table">
            <thead>
              <tr>
                <th class="col-pos">POS</th>
                <th class="col-team">TIME</th>
                <th class="col-num">J</th>
                <th class="col-num">V</th>
                <th class="col-num">E</th>
                <th class="col-num">D</th>
                <th class="col-num">GP</th>
                <th class="col-num">GC</th>
                <th class="col-num">SG</th>
                <th class="col-pts">PTS</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map((row, idx) => `
                <tr>
                  <td class="col-pos">${String(idx + 1).padStart(2, '0')}</td>
                  <td class="col-team">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${colors[row.id] || '#3b82f6'}; margin-right: 4px;"></span>
                    ${row.name}
                  </td>
                  <td class="col-num">${row.j}</td>
                  <td class="col-num">${row.v}</td>
                  <td class="col-num">${row.e}</td>
                  <td class="col-num">${row.d}</td>
                  <td class="col-num">${row.gp}</td>
                  <td class="col-num">${row.gc}</td>
                  <td class="col-num">${row.sg > 0 ? `+${row.sg}` : row.sg}</td>
                  <td class="col-pts">${row.pts}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Partidas Realizadas -->
      <div>
        <h4 style="font-size: 0.95rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.5rem;">
          Partidas Realizadas (${roundMatches.length})
        </h4>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${roundMatches.map((m, mIdx) => {
            const roundTeams = round.teams || {};
            const homeName = (roundTeams[m.homeTeamId] && roundTeams[m.homeTeamId].name) || m.homeTeamName || 'Time 1';
            const awayName = (roundTeams[m.awayTeamId] && roundTeams[m.awayTeamId].name) || m.awayTeamName || 'Time 2';
            return `
            <div style="padding: 0.75rem; background: var(--surface-2); border-radius: 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                <span>PARTIDA ${String(m.matchOrder || (mIdx + 1)).padStart(2, '0')}</span>
                <strong style="font-size: 1rem;">
                  ${homeName} ${m.homeScore} × ${m.awayScore} ${awayName}
                </strong>
                <span class="badge" style="font-size: 0.75rem;">${m.resultText}</span>
              </div>
              ${m.goals && m.goals.length > 0 ? `
                <div style="margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--text-dim);">
                  ${m.goals.map(g => {
                    const tName = (roundTeams[g.teamId] && roundTeams[g.teamId].name) || g.teamName;
                    return `${g.minuteFormatted} ${g.playerName} (${tName})`;
                  }).join(' · ')}
                </div>
              ` : ''}
            </div>
          `;
          }).join('')}
        </div>
      </div>
    `;

    Utils.openModal(modalId);
  }
};
