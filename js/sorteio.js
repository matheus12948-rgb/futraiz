/**
 * Módulo de Sorteio da Rodada - Familia do Fut
 * 1. Seleção manual e independente de exatamente 20 jogadores para a rodada.
 * 2. Otimização combinatória e equilíbrio de estrelas SOMENTE entre os 20 selecionados.
 * 3. Criação e persistência do conceito de Rodada (Round).
 * 4. Suporte a "Nova Rodada" preservando 100% do histórico e rankings.
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { Programacao } from './programacao.js';

export const Sorteio = {
  selectedPlayerIds: new Set(),
  searchQuery: '',
  starFilter: 0,

  init() {
    this.restoreSelection();
    this.bindEvents();
    this.applyTeamColorsToDOM();
    this.render();

    Storage.onChange((type) => {
      if (['currentRound', 'teams', 'selectedPlayers', 'newRound', 'players'].includes(type)) {
        this.restoreSelection();
        this.render();
      }
    });
  },

  restoreSelection() {
    const savedIds = Storage.getSelectedPlayerIds();
    if (Array.isArray(savedIds)) {
      this.selectedPlayerIds = new Set(savedIds);
    }
  },

  saveSelection() {
    Storage.saveSelectedPlayerIds(Array.from(this.selectedPlayerIds));
  },

  bindEvents() {
    // Botão Sortear Times
    const btnSortear = document.getElementById('btn-realizar-sorteio');
    if (btnSortear) {
      btnSortear.addEventListener('click', (e) => {
        e.preventDefault();
        this.solicitarSorteio();
      });
    }

    // Botão Nova Rodada (cria novo domingo / limpa seleção da rodada mantendo histórico)
    const btnNovaRodada = document.getElementById('btn-nova-rodada');
    if (btnNovaRodada) {
      btnNovaRodada.addEventListener('click', (e) => {
        e.preventDefault();
        this.solicitarNovaRodada();
      });
    }

    // Botão Alterar Seleção
    const btnAlterar = document.getElementById('btn-alterar-selecao');
    if (btnAlterar) {
      btnAlterar.addEventListener('click', (e) => {
        e.preventDefault();
        this.mostrarPainelSelecao();
      });
    }

    // Campo de busca da seleção
    const searchInput = document.getElementById('round-player-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderSelectionGrid();
      });
    }

    // Filtros por estrelas
    const chipsContainer = document.getElementById('round-star-chips');
    if (chipsContainer) {
      chipsContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip-filter');
        if (chip) {
          chipsContainer.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.starFilter = parseInt(chip.dataset.star, 10) || 0;
          this.renderSelectionGrid();
        }
      });
    }

    // Ações Rápidas: Selecionar 20 Primeiros
    const btnTop20 = document.getElementById('btn-select-top20');
    if (btnTop20) {
      btnTop20.addEventListener('click', (e) => {
        e.preventDefault();
        this.selecionarPrimeiros20();
      });
    }

    // Ações Rápidas: Limpar Seleção
    const btnClear = document.getElementById('btn-clear-selection');
    if (btnClear) {
      btnClear.addEventListener('click', (e) => {
        e.preventDefault();
        this.limparSelecao();
      });
    }

    // Color pickers para os 4 times
    ['time_1', 'time_2', 'time_3', 'time_4'].forEach(teamId => {
      const picker = document.getElementById(`color-picker-${teamId}`);
      if (picker) {
        picker.addEventListener('input', (e) => {
          this.handleColorChange(teamId, e.target.value);
        });
      }
    });

    // Event delegation nos cards de seleção de jogadores
    const gridEl = document.getElementById('round-selection-grid');
    if (gridEl) {
      gridEl.addEventListener('click', (e) => {
        const card = e.target.closest('.player-select-card');
        if (!card) return;
        const playerId = card.dataset.playerId;
        if (playerId) {
          this.togglePlayerSelection(playerId);
        }
      });
    }
  },

  handleColorChange(teamId, colorHex) {
    Storage.assertAdmin('Alterar cor da equipe');
    const colors = Storage.getTeamColors();
    colors[teamId] = colorHex;
    Storage.saveTeamColors(colors);
    this.applyTeamColorsToDOM();
    this.renderTeams();
    Utils.toast(`Cor do ${this.getTeamDisplayName(teamId)} atualizada!`, 'info', 1500);
  },

  applyTeamColorsToDOM() {
    const colors = Storage.getTeamColors();
    const root = document.documentElement;
    root.style.setProperty('--color-team-1', colors.time_1);
    root.style.setProperty('--color-team-2', colors.time_2);
    root.style.setProperty('--color-team-3', colors.time_3);
    root.style.setProperty('--color-team-4', colors.time_4);

    ['time_1', 'time_2', 'time_3', 'time_4'].forEach(id => {
      const picker = document.getElementById(`color-picker-${id}`);
      if (picker && colors[id]) {
        picker.value = colors[id];
      }
    });
  },

  getTeamDisplayName(teamId) {
    const names = {
      time_1: 'Time 1',
      time_2: 'Time 2',
      time_3: 'Time 3',
      time_4: 'Time 4'
    };
    return names[teamId] || teamId;
  },

  // Alterna a seleção de um atleta com regra estrita de no máximo 20
  togglePlayerSelection(playerId) {
    Storage.assertAdmin('Selecionar atleta para a rodada');
    if (Storage.isTeamsLocked()) {
      Utils.toast('A composição dos times está bloqueada após o início da noite.', 'warning');
      return;
    }
    if (this.selectedPlayerIds.has(playerId)) {
      this.selectedPlayerIds.delete(playerId);
      this.saveSelection();
      this.updateSelectionCounters();
      this.updateCardDOM(playerId, false);
    } else {
      if (this.selectedPlayerIds.size >= 20) {
        Utils.toast('Já existem 20 jogadores selecionados para esta rodada.', 'warning', 3500);
        return;
      }
      this.selectedPlayerIds.add(playerId);
      this.saveSelection();
      this.updateSelectionCounters();
      this.updateCardDOM(playerId, true);

      if (this.selectedPlayerIds.size === 20) {
        Utils.toast('20 jogadores selecionados. Pronto para sortear!', 'success', 2500);
      }
    }
  },

  updateCardDOM(playerId, isSelected) {
    const card = document.querySelector(`.player-select-card[data-player-id="${playerId}"]`);
    if (card) {
      if (isSelected) {
        card.classList.add('selected');
        const chk = card.querySelector('.custom-chk');
        if (chk) chk.textContent = '☑';
      } else {
        card.classList.remove('selected');
        const chk = card.querySelector('.custom-chk');
        if (chk) chk.textContent = '☐';
      }
    }
  },

  selecionarPrimeiros20() {
    Storage.assertAdmin('Selecionar 20 primeiros atletas');
    if (Storage.isTeamsLocked()) {
      Utils.toast('A composição dos times está bloqueada após o início da noite.', 'warning');
      return;
    }
    const allPlayers = Storage.getPlayers();
    if (allPlayers.length < 20) {
      Utils.toast(`Há apenas ${allPlayers.length} atletas cadastrados. São necessários pelo menos 20.`, 'warning');
      return;
    }

    this.selectedPlayerIds.clear();
    allPlayers.slice(0, 20).forEach(p => this.selectedPlayerIds.add(p.id));
    this.saveSelection();
    this.updateSelectionCounters();
    this.renderSelectionGrid();
    Utils.toast('20 primeiros jogadores selecionados.', 'info', 2000);
  },

  limparSelecao() {
    Storage.assertAdmin('Limpar seleção da rodada');
    if (Storage.isTeamsLocked()) {
      Utils.toast('A composição dos times está bloqueada após o início da noite.', 'warning');
      return;
    }
    this.selectedPlayerIds.clear();
    this.saveSelection();
    this.updateSelectionCounters();
    this.renderSelectionGrid();
    Utils.toast('Seleção da rodada limpa.', 'info', 1500);
  },

  updateSelectionCounters() {
    const count = this.selectedPlayerIds.size;
    const countEl = document.getElementById('selected-players-count');
    const badgeEl = document.getElementById('selection-status-badge');
    const btnSortear = document.getElementById('btn-realizar-sorteio');

    if (countEl) countEl.textContent = count;

    const isLocked = Storage.isTeamsLocked();

    if (badgeEl) {
      if (isLocked) {
        badgeEl.className = 'status-badge status-danger';
        badgeEl.textContent = 'Composição dos times bloqueada após o início da noite.';
      } else if (count === 20) {
        badgeEl.className = 'status-badge status-success';
        badgeEl.textContent = '20 jogadores selecionados. Pronto para sortear.';
      } else if (count < 20) {
        const missing = 20 - count;
        badgeEl.className = 'status-badge status-warning';
        badgeEl.textContent = `Selecione 20 jogadores para realizar o sorteio (faltam ${missing})`;
      } else {
        badgeEl.className = 'status-badge status-danger';
        badgeEl.textContent = 'Mais de 20 selecionados. Desmarque até atingir 20.';
      }
    }

    if (btnSortear) {
      btnSortear.disabled = (count !== 20 || isLocked);
      if (count === 20 && !isLocked) {
        btnSortear.classList.add('btn-ready-pulse');
      } else {
        btnSortear.classList.remove('btn-ready-pulse');
      }
    }
  },

  solicitarSorteio() {
    Storage.assertAdmin('Realizar sorteio');
    if (Storage.isTeamsLocked()) {
      Utils.toast('A composição dos times está bloqueada após o início da noite.', 'warning');
      return;
    }
    const count = this.selectedPlayerIds.size;
    if (count !== 20) {
      Utils.toast('Selecione exatamente 20 jogadores para realizar o sorteio.', 'warning', 4000);
      return;
    }

    const allPlayers = Storage.getPlayers();
    // Filtra ESTRITAMENTE os 20 selecionados
    const selectedPlayers = allPlayers.filter(p => this.selectedPlayerIds.has(p.id));

    if (selectedPlayers.length !== 20) {
      Utils.toast('Erro ao carregar dados dos 20 atletas selecionados.', 'error');
      return;
    }

    this.executarSorteio(selectedPlayers);
  },

  solicitarNovaRodada() {
    Storage.assertAdmin('Iniciar nova rodada');
    const currentRound = Storage.getCurrentRound();
    const msg = 'Deseja iniciar uma NOVA RODADA?\n\n' +
      '• O histórico de partidas, tabela e rankings ANTERIORES serão preservados.\n' +
      '• A seleção de atletas desta rodada será limpa para você escolher 20 participantes para o próximo futebol.';

    if (confirm(msg)) {
      Storage.startNewRound();
      this.selectedPlayerIds.clear();
      Utils.toast('Nova rodada iniciada! Selecione os 20 atletas participantes.', 'info', 4000);
      this.mostrarPainelSelecao();
      this.render();
    }
  },

  mostrarPainelSelecao() {
    const selPanel = document.getElementById('round-selection-panel');
    const teamsPanel = document.getElementById('round-teams-panel');
    const btnAlterar = document.getElementById('btn-alterar-selecao');

    if (selPanel) selPanel.style.display = 'block';
    if (teamsPanel) teamsPanel.style.display = 'block'; // mantém ambos visíveis para consulta
    if (btnAlterar) btnAlterar.style.display = 'none';

    this.renderSelectionGrid();
    if (selPanel) selPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  /**
   * Executa o sorteio equilibrado exclusivamente entre os 20 selecionados
   */
  executarSorteio(selected20) {
    const bestDistribution = this.otimizarEquipes(selected20);
    const teamColors = Storage.getTeamColors();

    const teams = {
      time_1: {
        id: 'time_1',
        name: 'Time 1',
        color: teamColors.time_1,
        players: bestDistribution[0],
        totalStars: bestDistribution[0].reduce((acc, p) => acc + p.stars, 0)
      },
      time_2: {
        id: 'time_2',
        name: 'Time 2',
        color: teamColors.time_2,
        players: bestDistribution[1],
        totalStars: bestDistribution[1].reduce((acc, p) => acc + p.stars, 0)
      },
      time_3: {
        id: 'time_3',
        name: 'Time 3',
        color: teamColors.time_3,
        players: bestDistribution[2],
        totalStars: bestDistribution[2].reduce((acc, p) => acc + p.stars, 0)
      },
      time_4: {
        id: 'time_4',
        name: 'Time 4',
        color: teamColors.time_4,
        players: bestDistribution[3],
        totalStars: bestDistribution[3].reduce((acc, p) => acc + p.stars, 0)
      }
    };

    const starSums = [teams.time_1.totalStars, teams.time_2.totalStars, teams.time_3.totalStars, teams.time_4.totalStars];
    const maxStars = Math.max(...starSums);
    const minStars = Math.min(...starSums);
    const diff = maxStars - minStars;

    const drawInfo = {
      date: Utils.formatDate(new Date()),
      teamsSummary: [
        { name: 'Time 1', stars: teams.time_1.totalStars },
        { name: 'Time 2', stars: teams.time_2.totalStars },
        { name: 'Time 3', stars: teams.time_3.totalStars },
        { name: 'Time 4', stars: teams.time_4.totalStars }
      ],
      difference: diff,
      isPerfect: diff === 0
    };

    const roundId = Utils.generateUUID();
    const roundRecord = {
      id: roundId,
      date: Utils.formatDate(new Date()),
      dateKey: Utils.getDateKey(new Date()),
      status: 'READY',
      selectedPlayerIds: Array.from(this.selectedPlayerIds),
      selectedPlayers: selected20.map(p => ({ id: p.id, name: p.name, stars: p.stars })),
      teams: teams,
      drawInfo: drawInfo,
      programacao: [
        { id: 'fix_1', order: 1, homeTeamId: 'time_1', awayTeamId: 'time_2', homeTeamName: 'Time 1', awayTeamName: 'Time 2' }
      ],
      createdAt: new Date().toISOString()
    };

    Storage.saveCurrentRound(roundRecord);
    Storage.saveTeams(teams);
    Storage.saveDrawInfo(drawInfo);

    Utils.sound.playWhistle();
    Utils.toast(`Rodada sorteada com sucesso! Diferença: ${diff} estrela(s).`, 'success', 4000);

    this.render();

    // Rola suavemente até os times
    const teamsPanel = document.getElementById('round-teams-panel');
    if (teamsPanel) {
      setTimeout(() => {
        teamsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }
  },

  /**
   * Algoritmo de Otimização Combinatória (Hill-Climbing com reinícios múltiplos)
   */
  otimizarEquipes(players20) {
    const count5Stars = players20.filter(p => p.stars === 5).length;
    const max5PerTeam = Math.ceil(count5Stars / 4);

    const countLowStars = players20.filter(p => p.stars <= 2).length;
    const maxLowPerTeam = Math.ceil(countLowStars / 4);

    const evaluate = (teams) => {
      const sums = teams.map(t => t.reduce((s, p) => s + p.stars, 0));
      const maxS = Math.max(...sums);
      const minS = Math.min(...sums);
      const diff = maxS - minS;

      const avg = (sums[0] + sums[1] + sums[2] + sums[3]) / 4;
      const variance = sums.reduce((v, s) => v + Math.pow(s - avg, 2), 0);

      let concentrationPenalty = 0;
      teams.forEach(team => {
        const star5Count = team.filter(p => p.stars === 5).length;
        if (star5Count > max5PerTeam) {
          concentrationPenalty += (star5Count - max5PerTeam) * 60;
        }

        const lowCount = team.filter(p => p.stars <= 2).length;
        if (lowCount > maxLowPerTeam + 1) {
          concentrationPenalty += (lowCount - maxLowPerTeam) * 30;
        }
      });

      return (diff * 1000) + (variance * 40) + concentrationPenalty;
    };

    let bestTeams = null;
    let bestScore = Infinity;

    for (let restart = 0; restart < 100; restart++) {
      const shuffled = [...players20].sort(() => Math.random() - 0.5);
      const currentTeams = [
        shuffled.slice(0, 5),
        shuffled.slice(5, 10),
        shuffled.slice(10, 15),
        shuffled.slice(15, 20)
      ];

      let currentScore = evaluate(currentTeams);

      for (let step = 0; step < 300; step++) {
        const t1 = Math.floor(Math.random() * 4);
        let t2 = Math.floor(Math.random() * 4);
        while (t2 === t1) t2 = Math.floor(Math.random() * 4);

        const p1 = Math.floor(Math.random() * 5);
        const p2 = Math.floor(Math.random() * 5);

        const temp = currentTeams[t1][p1];
        currentTeams[t1][p1] = currentTeams[t2][p2];
        currentTeams[t2][p2] = temp;

        const newScore = evaluate(currentTeams);

        if (newScore < currentScore) {
          currentScore = newScore;
        } else {
          const rollback = currentTeams[t1][p1];
          currentTeams[t1][p1] = currentTeams[t2][p2];
          currentTeams[t2][p2] = rollback;
        }
      }

      if (currentScore < bestScore) {
        bestScore = currentScore;
        bestTeams = currentTeams.map(team => [...team].sort((a, b) => b.stars - a.stars));
      }

      if (bestScore === 0) break;
    }

    return bestTeams;
  },

  render() {
    this.updateSelectionCounters();
    this.renderSelectionGrid();
    this.renderTeams();
  },

  renderSelectionGrid() {
    const gridEl = document.getElementById('round-selection-grid');
    if (!gridEl) return;

    const allPlayers = Storage.getPlayers();

    if (allPlayers.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-state text-center" style="grid-column: 1 / -1; padding: 2.5rem 1rem;">
          <div class="empty-icon" style="color: var(--text-dim); margin-bottom: 0.75rem;">${Utils.icon('users', 32)}</div>
          <h3>Nenhum jogador no cadastro geral</h3>
          <p class="text-muted">Para selecionar os 20 atletas da rodada, cadastre jogadores na aba <strong>Jogadores</strong>.</p>
          <button type="button" class="btn btn-primary" id="btn-empty-go-jogadores" style="margin-top: 0.75rem;">
            Ir para Cadastro de Jogadores
          </button>
        </div>
      `;
      const btnGo = document.getElementById('btn-empty-go-jogadores');
      if (btnGo) {
        btnGo.onclick = () => {
          if (window.App) window.App.navigateTo('jogadores');
        };
      }
      return;
    }

    // Filtra lista por busca e estrelas
    let filtered = allPlayers.filter(p => {
      const matchSearch = !this.searchQuery || p.name.toLowerCase().includes(this.searchQuery);
      const matchStar = !this.starFilter || p.stars === this.starFilter;
      return matchSearch && matchStar;
    });

    // Mantém ordenação estável por estrelas decrescente e nome
    filtered.sort((a, b) => {
      return b.stars - a.stars || a.name.localeCompare(b.name);
    });

    if (filtered.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-state text-center" style="grid-column: 1 / -1; padding: 2rem;">
          <p class="text-muted">Nenhum atleta corresponde aos filtros atuais.</p>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = filtered.map(p => {
      const isSelected = this.selectedPlayerIds.has(p.id);

      return `
        <div class="player-select-card player-check-card ${isSelected ? 'selected is-selected' : ''}" data-player-id="${p.id}">
          <div class="player-item-name">${p.name}</div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            ${Utils.renderStars(p.stars)}
            <span class="custom-chk">${isSelected ? '✓' : ''}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  renderTeams() {
    const teams = Storage.getTeams();
    const round = Storage.getCurrentRound();
    const drawInfo = Storage.getDrawInfo();
    const colors = Storage.getTeamColors();

    const teamsPanel = document.getElementById('round-teams-panel');
    const container = document.getElementById('sorteio-container');
    const summaryBox = document.getElementById('sorteio-summary-box');
    const btnNova = document.getElementById('btn-nova-rodada');
    const btnAlterar = document.getElementById('btn-alterar-selecao');
    const selectionPanel = document.getElementById('round-selection-panel');

    if (!teams) {
      if (teamsPanel) teamsPanel.style.display = 'none';
      if (btnNova) btnNova.style.display = 'none';
      if (btnAlterar) btnAlterar.style.display = 'none';
      if (selectionPanel) selectionPanel.style.display = 'block';
      return;
    }

    // Se já existem times sorteados para a rodada atual
    if (teamsPanel) teamsPanel.style.display = 'block';
    if (btnNova) btnNova.style.display = 'inline-flex';
    if (btnAlterar) btnAlterar.style.display = 'inline-flex';

    if (summaryBox && drawInfo) {
      const roundDate = round ? round.date : Utils.formatDate(new Date());
      summaryBox.innerHTML = `
        <div class="card" style="margin-bottom: 1rem; border-left: 4px solid var(--primary);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
            <div>
              <h4 style="font-size: 1.15rem; margin-bottom: 0.2rem;">Times da Rodada (${roundDate})</h4>
              <span class="text-muted" style="font-size: 0.8rem;">20 Atletas Selecionados</span>
            </div>
            <span class="badge-status" style="font-size: 0.85rem;">Diferença máx: ${drawInfo.difference} ★</span>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <span class="badge-status" style="border-left: 3px solid ${colors.time_1};">Time 1: <strong>${teams.time_1.totalStars} ★</strong></span>
            <span class="badge-status" style="border-left: 3px solid ${colors.time_2};">Time 2: <strong>${teams.time_2.totalStars} ★</strong></span>
            <span class="badge-status" style="border-left: 3px solid ${colors.time_3};">Time 3: <strong>${teams.time_3.totalStars} ★</strong></span>
            <span class="badge-status" style="border-left: 3px solid ${colors.time_4};">Time 4: <strong>${teams.time_4.totalStars} ★</strong></span>
          </div>
        </div>
      `;
    }

    if (container) {
      const teamList = [teams.time_1, teams.time_2, teams.time_3, teams.time_4];

      container.innerHTML = `
        <div class="drawn-teams-grid">
          ${teamList.map((team, idx) => {
            const teamId = `time_${idx + 1}`;
            const teamColor = colors[teamId] || '#3b82f6';

            return `
              <div class="team-drawn-card">
                <div class="team-card-banner" style="border-left: 4px solid ${teamColor};">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${teamColor};"></span>
                    <h3 class="team-card-title">${team.name}</h3>
                  </div>

                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="team-stars-badge" title="Total de estrelas do time">
                      ${team.totalStars} ★
                    </span>
                    ${Storage.isPublicViewer() ? '' : `
                      <label style="cursor: pointer; display: inline-flex; align-items: center;" title="Alterar cor do time">
                        <span style="display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: ${teamColor}; border: 1px solid var(--border);"></span>
                        <input type="color" class="color-picker-input" data-team="${teamId}" value="${teamColor}" style="display: none;">
                      </label>
                    `}
                  </div>
                </div>

                <div class="team-players-list">
                  ${team.players.map((p, pIdx) => `
                    <div class="team-player-row">
                      <span class="text-muted" style="font-size: 0.8rem; min-width: 18px;">${pIdx + 1}</span>
                      <span class="player-name flex-1">${p.name}</span>
                      <span class="player-stars">${Utils.renderStars(p.stars)}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="card" style="margin-top: 1.5rem; border: 1px solid var(--border-color); background: var(--card-bg);">
          <div class="card-head" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="card-title" style="display: flex; align-items: center; gap: 0.5rem; font-size: 1.05rem;">
              <svg class="i" style="width: 1.25rem; height: 1.25rem; fill: var(--primary);"><use href="#i-flag"/></svg>
              <span>PRIMEIRA PARTIDA DA NOITE</span>
            </h3>
            <span class="status-tag status-scheduled" style="font-weight: 700;">QUEM GANHA FICA</span>
          </div>
          <div style="padding: 1.25rem; text-align: center;">
            <div style="font-size: 1.4rem; font-weight: 800; font-family: 'Barlow Condensed', sans-serif; letter-spacing: 0.5px;">
              <span style="color: var(--color-team-1, #2563eb);">TIME 1</span>
              <span style="margin: 0 1rem; color: var(--text-muted);">×</span>
              <span style="color: var(--color-team-2, #dc2626);">TIME 2</span>
            </div>
            <p style="margin: 0.75rem auto 1.25rem; font-size: 0.85rem; color: var(--text-muted); max-width: 480px;">
              A primeira partida é obrigatoriamente Time 1 x Time 2. O time vencedor permanecerá em campo e o administrador escolherá o próximo adversário.
            </p>
            <button type="button" class="btn btn-primary" id="btn-ir-primeira-partida" style="width: 100%; max-width: 280px; margin: 0 auto; display: inline-flex; justify-content: center; align-items: center; gap: 0.5rem;">
              <span>IR PARA A PARTIDA 01</span>
              <svg class="i" aria-hidden="true"><use href="#i-arrow-right"/></svg>
            </button>
          </div>
        </div>
      `;

      container.querySelectorAll('.color-picker-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const teamId = e.target.dataset.team;
          this.handleColorChange(teamId, e.target.value);
        });
      });

      const btnIr = container.querySelector('#btn-ir-primeira-partida');
      if (btnIr) {
        btnIr.onclick = () => {
          if (window.App) window.App.navigateTo('partida');
        };
      }
    }
  }
};
