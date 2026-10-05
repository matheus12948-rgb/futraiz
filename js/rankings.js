/**
 * Módulo de Rankings - Familia do Fut
 * 
 * Regras:
 * 1. Ranking de Capas: Acumulado de noites em que o jogador pertenceu ao time campeão (+1 Capa por noite encerrada).
 *    A Capa NUNCA é atribuída por partida individual.
 * 2. Ranking de Artilheiros: Total de gols marcados em todo o histórico.
 * 3. Ranking Geral de Jogadores: Tabela completa com Nome, Estrelas, Gols e Capas.
 * 4. Ícones SVG minimalistas (sem emojis na interface).
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';

export const Rankings = {
  currentTab: 'geral', // 'geral' | 'capa' | 'artilharia'

  init() {
    this.bindEvents();
    this.render();

    Storage.onChange((type) => {
      if (['capas', 'matches', 'players', 'nightFinalized', 'reset', 'historicalDataUpdated', 'historicalLoadFinalized'].includes(type)) {
        this.render();
      }
    });
  },

  bindEvents() {
    const tabGeral = document.getElementById('tab-rank-geral');
    const tabCapa = document.getElementById('tab-rank-capa');
    const tabArtilharia = document.getElementById('tab-rank-artilharia');

    if (tabGeral) {
      tabGeral.addEventListener('click', () => {
        this.currentTab = 'geral';
        this.updateTabButtons();
        this.render();
      });
    }

    if (tabCapa) {
      tabCapa.addEventListener('click', () => {
        this.currentTab = 'capa';
        this.updateTabButtons();
        this.render();
      });
    }

    if (tabArtilharia) {
      tabArtilharia.addEventListener('click', () => {
        this.currentTab = 'artilharia';
        this.updateTabButtons();
        this.render();
      });
    }
  },

  updateTabButtons() {
    const tabGeral = document.getElementById('tab-rank-geral');
    const tabCapa = document.getElementById('tab-rank-capa');
    const tabArtilharia = document.getElementById('tab-rank-artilharia');

    if (tabGeral) tabGeral.classList.toggle('active', this.currentTab === 'geral');
    if (tabCapa) tabCapa.classList.toggle('active', this.currentTab === 'capa');
    if (tabArtilharia) tabArtilharia.classList.toggle('active', this.currentTab === 'artilharia');
  },

  // Ranking de Artilharia: Agregação de saldo histórico inicial + gols das partidas
  getArtilhariaData() {
    const allMatches = Storage.getMatches();
    const allPlayers = Storage.getPlayers();

    const playerMap = {};
    allPlayers.forEach(p => {
      const histGoals = parseInt(p.gols_historicos_iniciais, 10) || 0;
      playerMap[p.id] = {
        id: p.id,
        name: p.name,
        stars: p.stars,
        historicalGoals: histGoals,
        matchGoals: 0,
        goals: histGoals
      };
    });

    allMatches.forEach(match => {
      if (Array.isArray(match.goals)) {
        match.goals.forEach(goal => {
          if (!playerMap[goal.playerId]) {
            playerMap[goal.playerId] = {
              id: goal.playerId,
              name: goal.playerName,
              stars: 3,
              historicalGoals: 0,
              matchGoals: 0,
              goals: 0
            };
          }
          playerMap[goal.playerId].matchGoals += 1;
          playerMap[goal.playerId].goals += 1;
        });
      }
    });

    const list = Object.values(playerMap).filter(p => p.goals > 0);
    list.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
    return list;
  },

  // Ranking de Capa: Saldo histórico inicial + Capas conquistadas no FutRoda
  // Conquistada exclusivamente ao término da noite pelo time campeão (+1 Capa por noite)
  getCapaData() {
    const allPlayers = Storage.getPlayers();
    const allCapas = Storage.getCapas();

    const capaCountMap = {};
    const playerCapaDetails = {};

    allCapas.forEach(c => {
      const pid = c.jogador_id;
      capaCountMap[pid] = (capaCountMap[pid] || 0) + 1;
      if (!playerCapaDetails[pid]) playerCapaDetails[pid] = [];
      playerCapaDetails[pid].push(c);
    });

    const playerMap = {};
    allPlayers.forEach(p => {
      const histCapas = parseInt(p.capas_historicas_iniciais, 10) || 0;
      const futCapas = capaCountMap[p.id] || 0;
      const totalCapas = histCapas + futCapas;
      playerMap[p.id] = {
        id: p.id,
        name: p.name,
        stars: p.stars,
        historicalCapas: histCapas,
        futCapas: futCapas,
        capas: totalCapas,
        capasCount: totalCapas,
        capaPoints: totalCapas,
        history: playerCapaDetails[p.id] || []
      };
    });

    // Inclui atletas que possuem Capa mesmo se não estiverem no cadastro recente
    allCapas.forEach(c => {
      if (!playerMap[c.jogador_id]) {
        playerMap[c.jogador_id] = {
          id: c.jogador_id,
          name: c.playerName || 'Jogador',
          stars: 3,
          historicalCapas: 0,
          futCapas: capaCountMap[c.jogador_id] || 1,
          capas: capaCountMap[c.jogador_id] || 1,
          capasCount: capaCountMap[c.jogador_id] || 1,
          capaPoints: capaCountMap[c.jogador_id] || 1,
          history: playerCapaDetails[c.jogador_id] || []
        };
      }
    });

    const list = Object.values(playerMap).filter(p => p.capas > 0);
    list.sort((a, b) => b.capas - a.capas || a.name.localeCompare(b.name));
    return list;
  },

  // Ranking Geral: Tabela consolidada com Nome, Estrelas, Gols Totais e Capas Totais
  getGeneralData() {
    const allPlayers = Storage.getPlayers();
    const artilhariaList = this.getArtilhariaData();
    const capasList = this.getCapaData();

    const goalsMap = {};
    artilhariaList.forEach(p => { goalsMap[p.id] = p.goals; });

    const capasMap = {};
    capasList.forEach(p => { capasMap[p.id] = p.capas; });

    const list = allPlayers.map(p => {
      const histGoals = parseInt(p.gols_historicos_iniciais, 10) || 0;
      const histCapas = parseInt(p.capas_historicas_iniciais, 10) || 0;
      return {
        id: p.id,
        name: p.name,
        stars: p.stars,
        goals: goalsMap[p.id] !== undefined ? goalsMap[p.id] : histGoals,
        capas: capasMap[p.id] !== undefined ? capasMap[p.id] : histCapas
      };
    });

    list.sort((a, b) => {
      if (b.capas !== a.capas) return b.capas - a.capas;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.stars !== a.stars) return b.stars - a.stars;
      return a.name.localeCompare(b.name);
    });

    return list;
  },

  render() {
    const container = document.getElementById('rankings-container');
    if (!container) return;

    if (this.currentTab === 'geral') {
      this.renderGeral(container);
    } else if (this.currentTab === 'capa') {
      this.renderCapa(container);
    } else {
      this.renderArtilharia(container);
    }
  },

  renderGeral(container) {
    const list = this.getGeneralData();

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
          <div class="empty-icon" style="color: var(--text-dim); margin-bottom: 0.75rem;">
            <svg class="i" style="width:36px;height:36px;" aria-hidden="true"><use href="#i-users"/></svg>
          </div>
          <h3>Nenhum jogador cadastrado</h3>
          <p class="text-muted">Cadastre jogadores para acompanhar o ranking geral consolidado.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="sports-table-wrapper">
        <table class="sports-table">
          <thead>
            <tr>
              <th class="col-pos">POS</th>
              <th class="col-team">JOGADOR</th>
              <th class="col-num" title="Avaliação Técnica">ESTRELAS</th>
              <th class="col-num" title="Total de Gols">
                <span style="display: inline-flex; align-items: center; gap: 4px;">
                  <svg class="i i-sm" aria-hidden="true"><use href="#i-ball"/></svg>
                  <span>GOLS</span>
                </span>
              </th>
              <th class="col-pts" title="Capas Conquistadas">
                <span style="display: inline-flex; align-items: center; gap: 4px;">
                  <svg class="i i-sm" aria-hidden="true"><use href="#i-crown"/></svg>
                  <span>CAPAS</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            ${list.map((item, idx) => {
              const posFormatted = String(idx + 1).padStart(2, '0');
              const isTop = idx === 0;

              return `
                <tr class="${isTop ? 'row-leader' : ''}">
                  <td class="col-pos">${posFormatted}</td>
                  <td class="col-team">
                    <strong style="color: var(--text-main); font-size: 0.95rem;">${item.name}</strong>
                  </td>
                  <td class="col-num">
                    ${Utils.renderStars(item.stars)}
                  </td>
                  <td class="col-num" style="font-weight: 700; color: var(--text-main);">
                    ${item.goals}
                  </td>
                  <td class="col-pts" style="font-weight: 800; color: #eab308;">
                    ${item.capas}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderCapa(container) {
    const list = this.getCapaData();

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
          <div class="empty-icon" style="color: var(--text-dim); margin-bottom: 0.75rem;">
            <svg class="i" style="width:36px;height:36px;" aria-hidden="true"><use href="#i-crown"/></svg>
          </div>
          <h3>Nenhuma Capa atribuída ainda</h3>
          <p class="text-muted">A Capa é conquistada exclusivamente pelos 5 jogadores do time campeão ao final da noite de futebol.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="ranking-list-wrap">
        ${list.map((item, idx) => {
          const pos = String(idx + 1).padStart(2, '0');
          let posClass = 'rank-regular';
          if (idx === 0) posClass = 'rank-gold';
          else if (idx === 1) posClass = 'rank-silver';
          else if (idx === 2) posClass = 'rank-bronze';

          const capasLabel = item.capas === 1 ? 'CAPA' : 'CAPAS';

          return `
            <div class="ranking-item-row ${posClass}">
              <div class="ranking-left">
                <span class="rank-pos-num">${pos}</span>
                <div class="rank-player-details">
                  <div class="rank-player-name">${item.name}</div>
                  <div class="rank-player-stars">${Utils.renderStars(item.stars)}</div>
                  <span class="text-muted" style="font-size: 0.75rem;">
                    ${item.history.length > 0 
                      ? `Última conquista: ${item.history[item.history.length - 1].date}` 
                      : 'Campeão da Noite'}
                  </span>
                </div>
              </div>
              <div class="rank-right text-right">
                <span class="rank-metric-value" style="color: #eab308;">${item.capas}</span>
                <span class="text-muted" style="font-size: 0.75rem; display: block; text-transform: uppercase;">${capasLabel}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  renderArtilharia(container) {
    const list = this.getArtilhariaData();

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
          <div class="empty-icon" style="color: var(--text-dim); margin-bottom: 0.75rem;">
            <svg class="i" style="width:36px;height:36px;" aria-hidden="true"><use href="#i-ball"/></svg>
          </div>
          <h3>Nenhum gol registrado ainda</h3>
          <p class="text-muted">Finalize partidas com gols para visualizar o ranking acumulado de artilheiros.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="ranking-list-wrap">
        ${list.map((item, idx) => {
          const pos = String(idx + 1).padStart(2, '0');
          let posClass = 'rank-regular';
          if (idx === 0) posClass = 'rank-gold';
          else if (idx === 1) posClass = 'rank-silver';
          else if (idx === 2) posClass = 'rank-bronze';

          const golLabel = item.goals === 1 ? 'GOL' : 'GOLS';

          return `
            <div class="ranking-item-row ${posClass}">
              <div class="ranking-left">
                <span class="rank-pos-num">${pos}</span>
                <div class="rank-player-details">
                  <div class="rank-player-name">${item.name}</div>
                  <div class="rank-player-stars">${Utils.renderStars(item.stars)}</div>
                </div>
              </div>
              <div class="rank-right text-right">
                <span class="rank-metric-value">${item.goals}</span>
                <span class="text-muted" style="font-size: 0.75rem; display: block; text-transform: uppercase;">${golLabel}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
};
