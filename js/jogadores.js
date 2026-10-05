/**
 * Módulo de Jogadores - Familia do Fut
 * Gerenciamento de cadastro, edição, exclusão e avaliação por estrelas (1 a 5).
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';

export const Jogadores = {
  editingId: null,

  init() {
    this.bindEvents();
    this.render();

    // Reatividade: re-renderiza quando jogadores forem alterados ou sincronizados do Supabase
    Storage.onChange((type) => {
      if (type === 'players') {
        this.render();
      }
    });
  },

  bindEvents() {
    const form = document.getElementById('player-form') || document.getElementById('form-jogador');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSave(e));
    }

    const btnCancel = document.getElementById('player-cancel-edit');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => this.cancelEdit());
    }

    const starPicker = document.getElementById('star-picker') || document.getElementById('star-rating-select');
    if (starPicker) {
      starPicker.addEventListener('click', (e) => {
        const starBtn = e.target.closest('.star-btn');
        if (starBtn) {
          const val = parseInt(starBtn.dataset.value, 10);
          this.setSelectedStars(val);
        }
      });
    }

    const searchInput = document.getElementById('players-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.render());
    }

    const filterStars = document.getElementById('players-filter-stars');
    if (filterStars) {
      filterStars.addEventListener('change', () => this.render());
    }
  },

  setSelectedStars(rating) {
    const starInput = document.getElementById('player-stars-input') || document.getElementById('player-stars');
    if (starInput) starInput.value = rating;

    const starBtns = document.querySelectorAll('#star-picker .star-btn, #star-rating-select .star-btn');
    starBtns.forEach(btn => {
      const val = parseInt(btn.dataset.value, 10);
      btn.classList.toggle('active', val <= rating);
    });

    const label = document.getElementById('star-picker-label');
    if (label) {
      const labels = ['', '1 Estrela (Iniciante)', '2 Estrelas (Básico)', '3 Estrelas (Intermediário)', '4 Estrelas (Avançado)', '5 Estrelas (Craque)'];
      label.textContent = labels[rating] || `${rating} Estrelas`;
    }
  },

  getSelectedStars() {
    const starInput = document.getElementById('player-stars-input') || document.getElementById('player-stars');
    return starInput ? Math.min(5, Math.max(1, parseInt(starInput.value, 10) || 3)) : 3;
  },

  async handleSave(e) {
    e.preventDefault();
    Storage.assertAdmin('Cadastrar ou editar jogador');
    const nameInput = document.getElementById('player-name') || document.getElementById('player-name-input');
    const name = nameInput ? nameInput.value.trim() : '';

    if (!name) {
      Utils.toast('Por favor, informe o nome do jogador.', 'warning');
      if (nameInput) nameInput.focus();
      return;
    }

    const submitBtn = document.getElementById('player-submit-btn');
    const originalText = submitBtn ? submitBtn.innerHTML : 'Cadastrar';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Salvando...</span>';
    }

    try {
      const stars = this.getSelectedStars();

      if (this.editingId) {
        // Edição
        await Storage.updatePlayer({ id: this.editingId, name, stars });
        Utils.toast(`Jogador "${name}" atualizado com sucesso!`, 'success');
        this.cancelEdit();
      } else {
        // Adição
        await Storage.addPlayer({ name, stars });
        Utils.toast(`Jogador "${name}" adicionado com sucesso!`, 'success');
        if (nameInput) nameInput.value = '';
        this.setSelectedStars(3);
      }

      this.render();
    } catch (err) {
      Utils.toast(`Erro ao salvar jogador: ${err.message}`, 'error', 4500);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    }
  },

  startEdit(id) {
    const players = Storage.getPlayers();
    const player = players.find(p => p.id === id);
    if (!player) return;

    this.editingId = id;
    const nameInput = document.getElementById('player-name') || document.getElementById('player-name-input');
    const titleEl = document.getElementById('player-form-title');
    const submitBtn = document.getElementById('player-submit-btn');
    const cancelBtn = document.getElementById('player-cancel-edit');

    if (nameInput) {
      nameInput.value = player.name;
      nameInput.focus();
    }
    this.setSelectedStars(player.stars);

    if (titleEl) titleEl.textContent = 'Editar Jogador';
    if (submitBtn) submitBtn.innerHTML = '<span>Salvar Alterações</span>';
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    // Scroll até o formulário
    const formCard = document.getElementById('player-form-card');
    if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  cancelEdit() {
    this.editingId = null;
    const nameInput = document.getElementById('player-name') || document.getElementById('player-name-input');
    const titleEl = document.getElementById('player-form-title');
    const submitBtn = document.getElementById('player-submit-btn');
    const cancelBtn = document.getElementById('player-cancel-edit');

    if (nameInput) nameInput.value = '';
    this.setSelectedStars(3);

    if (titleEl) titleEl.textContent = 'Novo Jogador';
    if (submitBtn) submitBtn.innerHTML = '<span>Cadastrar</span>';
    if (cancelBtn) cancelBtn.style.display = 'none';
  },

  async deletePlayer(id) {
    Storage.assertAdmin('Excluir jogador');
    const players = Storage.getPlayers();
    const player = players.find(p => p.id === id);
    if (!player) return;

    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm(`Deseja realmente remover o jogador "${player.name}"?`)) {
        return;
      }
    }

    try {
      await Storage.deletePlayer(id);
      Utils.toast(`Jogador "${player.name}" removido.`, 'info');
      if (this.editingId === id) this.cancelEdit();
      this.render();
    } catch (err) {
      Utils.toast(`Erro ao remover jogador: ${err.message}`, 'error');
    }
  },

  setPlayerStars(id, stars) {
    Storage.assertAdmin('Alterar estrelas do jogador');
    const newStars = Math.min(5, Math.max(1, parseInt(stars, 10) || 1));
    const players = Storage.getPlayers();
    const player = players.find(p => p.id === id);
    if (!player) return;

    if (newStars !== player.stars) {
      player.stars = newStars;
      Storage.savePlayers(players);
      if (Storage.updatePlayerStars) {
        Storage.updatePlayerStars(id, newStars).catch(() => {});
      }
      this.render();
      Utils.toast(`${player.name}: agora ${newStars} estrelas`, 'info', 1500);
    }
  },

  quickUpdateStars(id, delta) {
    Storage.assertAdmin('Alterar estrelas do jogador');
    const players = Storage.getPlayers();
    const player = players.find(p => p.id === id);
    if (!player) return;

    const newStars = Math.min(5, Math.max(1, player.stars + delta));
    if (newStars !== player.stars) {
      this.setPlayerStars(id, newStars);
    }
  },

  loadDemoPlayers() {
    Storage.assertAdmin('Carregar jogadores de exemplo');
    const demoList = [
      // 5 estrelas (6)
      { name: 'Neymar Silva', stars: 5 },
      { name: 'Vinícius Rocha', stars: 5 },
      { name: 'Rodrygo Santos', stars: 5 },
      { name: 'Raphinha Costa', stars: 5 },
      { name: 'Endrick Felipe', stars: 5 },
      { name: 'Estêvão Willian', stars: 5 },

      // 4 estrelas (6)
      { name: 'Casemiro Lima', stars: 4 },
      { name: 'Lucas Paquetá', stars: 4 },
      { name: 'Bruno Guimarães', stars: 4 },
      { name: 'Alisson Becker', stars: 4 },
      { name: 'Douglas Luiz', stars: 4 },
      { name: 'Joelinton Cássio', stars: 4 },

      // 3 estrelas (6)
      { name: 'Danilo Alves', stars: 3 },
      { name: 'Marquinhos Jr.', stars: 3 },
      { name: 'Éder Militão', stars: 3 },
      { name: 'Gabriel Magalhães', stars: 3 },
      { name: 'Bremer Silva', stars: 3 },
      { name: 'Beraldo Lucas', stars: 3 },

      // 2 estrelas (6)
      { name: 'Richarlison Souza', stars: 2 },
      { name: 'Antony Dias', stars: 2 },
      { name: 'Fred Carvalho', stars: 2 },
      { name: 'Alex Telles', stars: 2 },
      { name: 'Pepê Eduardo', stars: 2 },
      { name: 'Evanilson Lima', stars: 2 },

      // 1 estrela (6)
      { name: 'Weverton Pereira', stars: 1 },
      { name: 'Renan Lodi', stars: 1 },
      { name: 'Arthur Melo', stars: 1 },
      { name: 'Gabriel Jesus', stars: 1 },
      { name: 'Yan Couto', stars: 1 },
      { name: 'Bento Krepski', stars: 1 }
    ];

    const currentPlayers = Storage.getPlayers();
    if (currentPlayers.length > 0) {
      if (typeof window !== 'undefined' && window.confirm) {
        if (!confirm(`Substituir a lista atual por 30 jogadores de exemplo balanceados?`)) {
          return;
        }
      }
    }

    const formatted = demoList.map((p, idx) => ({
      id: Utils.generateId(`ply_${idx}`),
      name: p.name,
      stars: p.stars,
      gols_historicos_iniciais: 0,
      capas_historicas_iniciais: 0,
      createdAt: new Date().toISOString()
    }));

    Storage.savePlayers(formatted);
    Utils.toast('30 jogadores de exemplo carregados no cadastro geral!', 'success');
    this.render();
  },

  render() {
    const listEl = document.getElementById('players-list');
    const countEl = document.getElementById('players-total-count');
    const badgeStatusEl = document.getElementById('players-status-badge');
    const searchInput = document.getElementById('players-search');
    const filterStars = document.getElementById('players-filter-stars');

    if (!listEl) return;

    const allPlayers = Storage.getPlayers();
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const starFilter = filterStars ? parseInt(filterStars.value, 10) : 0;

    let filtered = allPlayers.filter(p => {
      const matchName = !query || p.name.toLowerCase().includes(query);
      const matchStar = !starFilter || p.stars === starFilter;
      return matchName && matchStar;
    });

    // Ordenar por estrelas decrescente, depois por nome
    filtered.sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));

    // Atualiza contadores
    if (countEl) countEl.textContent = String(allPlayers.length);
    if (badgeStatusEl) {
      if (allPlayers.length >= 20) {
        badgeStatusEl.className = 'status-badge status-success';
        badgeStatusEl.textContent = `${allPlayers.length} Cadastrados (Apto para Rodada)`;
      } else {
        badgeStatusEl.className = 'status-badge status-warning';
        badgeStatusEl.textContent = `${allPlayers.length}/20 (Faltam ${20 - allPlayers.length})`;
      }
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state text-center" style="padding: 2.5rem 1rem;">
          <div class="empty-icon" style="color: var(--text-dim); margin-bottom: 0.75rem;">${Utils.icon('users', 32)}</div>
          <h4>Nenhum jogador encontrado</h4>
          <p class="text-muted">${allPlayers.length === 0 ? 'Cadastre os jogadores da pelada para começar.' : 'Nenhum jogador corresponde ao filtro atual.'}</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(player => `
      <div class="player-list-item" data-id="${player.id}">
        <div class="player-item-info">
          <div class="player-item-name">${player.name}</div>
          <div class="player-item-meta">
            ${Utils.renderStars(player.stars)}
          </div>
        </div>

        ${Storage.isPublicViewer() ? '' : `
          <div class="player-item-actions">
            <select class="form-control select-compact player-stars-select" data-action="select-stars" data-id="${player.id}" title="Alterar estrelas" aria-label="Estrelas de ${player.name}">
              <option value="1" ${player.stars === 1 ? 'selected' : ''}>1 estrela</option>
              <option value="2" ${player.stars === 2 ? 'selected' : ''}>2 estrelas</option>
              <option value="3" ${player.stars === 3 ? 'selected' : ''}>3 estrelas</option>
              <option value="4" ${player.stars === 4 ? 'selected' : ''}>4 estrelas</option>
              <option value="5" ${player.stars === 5 ? 'selected' : ''}>5 estrelas</option>
            </select>
            <button type="button" class="btn-icon btn-sm" title="Diminuir estrela" aria-label="Diminuir estrela de ${player.name}" data-action="dec-star" data-id="${player.id}" ${player.stars <= 1 ? 'disabled' : ''}>-</button>
            <button type="button" class="btn-icon btn-sm" title="Aumentar estrela" aria-label="Aumentar estrela de ${player.name}" data-action="inc-star" data-id="${player.id}" ${player.stars >= 5 ? 'disabled' : ''}>+</button>
            <button type="button" class="btn-icon btn-sm btn-edit" title="Editar jogador" aria-label="Editar ${player.name}" data-action="edit" data-id="${player.id}">${Utils.icon('edit', 14)}</button>
            <button type="button" class="btn-icon btn-sm btn-delete text-danger" title="Excluir jogador" aria-label="Excluir ${player.name}" data-action="delete" data-id="${player.id}">${Utils.icon('trash', 14)}</button>
          </div>
        `}
      </div>
    `).join('');

    // Event delegation para dropdown de estrelas
    listEl.onchange = (e) => {
      const select = e.target.closest('select[data-action="select-stars"]');
      if (!select) return;
      const id = select.dataset.id;
      const val = parseInt(select.value, 10);
      this.setPlayerStars(id, val);
    };

    // Event delegation para ações nos cards
    listEl.onclick = (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === 'edit') this.startEdit(id);
      if (action === 'delete') this.deletePlayer(id);
      if (action === 'inc-star') this.quickUpdateStars(id, 1);
      if (action === 'dec-star') this.quickUpdateStars(id, -1);
    };
  }
};
