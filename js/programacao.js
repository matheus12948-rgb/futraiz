/**
 * Módulo de Programação da Noite - Familia do Fut
 * 
 * Regras:
 * 1. O administrador define TODOS os confrontos da noite antes do início da primeira partida.
 * 2. Sem chave automática (sem vencedor joga com vencedor / perdedor com perdedor).
 * 3. Partida 01 é OBRIGATORIAMENTE Time 1 x Time 2 (fixa e imutável).
 * 4. Demais partidas (02, 03...): administrador define livremente, sem quantidade fixa (3, 5, 6, 8, etc.).
 * 5. Não permitir Time X x Time X (mandante != visitante).
 * 6. Permitir repetição de confrontos entre partidas diferentes.
 * 7. Quando a primeira partida começar, a programação e a composição dos times são BLOQUEADAS.
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';

export const Programacao = {
  fixtures: [],

  init() {
    this.loadSchedule();
    this.bindEvents();

    Storage.onChange((type) => {
      if (['schedule', 'currentRound', 'teams', 'teamNameUpdated', 'newRound', 'nightStarted', 'nightFinalized'].includes(type)) {
        this.loadSchedule();
        this.render();
      }
    });
  },

  loadSchedule() {
    const saved = Storage.getSchedule();
    if (Array.isArray(saved) && saved.length > 0) {
      this.fixtures = saved.map((f, idx) => ({
        id: f.id || `fix_${idx + 1}`,
        order: idx + 1,
        homeTeamId: idx === 0 ? 'time_1' : (f.homeTeamId || 'time_1'),
        awayTeamId: idx === 0 ? 'time_2' : (f.awayTeamId || 'time_3'),
        homeTeamName: this.getTeamName(idx === 0 ? 'time_1' : f.homeTeamId),
        awayTeamName: this.getTeamName(idx === 0 ? 'time_2' : f.awayTeamId)
      }));
    } else {
      // Padrão com 6 partidas balanceadas inicializando sugestão de confrontos
      this.fixtures = [
        { id: 'fix_1', order: 1, homeTeamId: 'time_1', awayTeamId: 'time_2' },
        { id: 'fix_2', order: 2, homeTeamId: 'time_3', awayTeamId: 'time_4' },
        { id: 'fix_3', order: 3, homeTeamId: 'time_1', awayTeamId: 'time_3' },
        { id: 'fix_4', order: 4, homeTeamId: 'time_2', awayTeamId: 'time_4' },
        { id: 'fix_5', order: 5, homeTeamId: 'time_1', awayTeamId: 'time_4' },
        { id: 'fix_6', order: 6, homeTeamId: 'time_2', awayTeamId: 'time_3' }
      ].map(f => ({
        ...f,
        homeTeamName: this.getTeamName(f.homeTeamId),
        awayTeamName: this.getTeamName(f.awayTeamId)
      }));
    }
  },

  getTeamName(teamId) {
    const teams = Storage.getTeams();
    if (teams && teams[teamId]) return teams[teamId].name;
    const names = {
      time_1: 'Time 1',
      time_2: 'Time 2',
      time_3: 'Time 3',
      time_4: 'Time 4'
    };
    return names[teamId] || 'Time';
  },

  bindEvents() {
    // Event delegation nos botões de programação
    document.addEventListener('click', (e) => {
      // Adicionar partida
      if (e.target.closest('#btn-add-fixture')) {
        e.preventDefault();
        this.adicionarPartida();
        return;
      }

      // Remover partida
      const btnRemove = e.target.closest('.btn-remove-fixture');
      if (btnRemove) {
        e.preventDefault();
        const idx = parseInt(btnRemove.dataset.index, 10);
        this.removerPartida(idx);
        return;
      }

      // Salvar programação
      if (e.target.closest('#btn-salvar-programacao')) {
        e.preventDefault();
        this.salvarProgramacao();
        return;
      }

      // Iniciar noite
      if (e.target.closest('#btn-iniciar-noite')) {
        e.preventDefault();
        this.iniciarNoite();
        return;
      }
    });

    // Alteração de times nos selects
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('select-fixture-team')) {
        const idx = parseInt(e.target.dataset.index, 10);
        const side = e.target.dataset.side; // 'home' ou 'away'
        this.atualizarConfronto(idx, side, e.target.value);
      }
    });
  },

  adicionarPartida() {
    Storage.assertAdmin('Adicionar partida na programação');
    if (Storage.isScheduleLocked()) {
      Utils.toast('A programação está bloqueada após o início da noite.', 'warning');
      return;
    }

    const nextOrder = this.fixtures.length + 1;
    // Sugestão de times para a nova partida
    let home = 'time_1';
    let away = 'time_3';

    if (this.fixtures.length > 0) {
      const last = this.fixtures[this.fixtures.length - 1];
      if (last.homeTeamId === 'time_1' && last.awayTeamId === 'time_3') {
        home = 'time_2';
        away = 'time_4';
      } else if (last.homeTeamId === 'time_2' && last.awayTeamId === 'time_4') {
        home = 'time_1';
        away = 'time_4';
      }
    }

    this.fixtures.push({
      id: Utils.generateId('fix'),
      order: nextOrder,
      homeTeamId: home,
      awayTeamId: away,
      homeTeamName: this.getTeamName(home),
      awayTeamName: this.getTeamName(away)
    });

    this.render();
    Utils.toast(`Partida ${String(nextOrder).padStart(2, '0')} adicionada à programação.`, 'info', 1500);
  },

  removerPartida(index) {
    Storage.assertAdmin('Remover partida da programação');
    if (Storage.isScheduleLocked()) {
      Utils.toast('A programação está bloqueada após o início da noite.', 'warning');
      return;
    }

    if (index === 0) {
      Utils.toast('A Partida 01 é fixa (Time 1 x Time 2) e não pode ser removida.', 'warning', 3500);
      return;
    }

    if (index < 0 || index >= this.fixtures.length) return;

    this.fixtures.splice(index, 1);
    // Renumera a ordem
    this.fixtures.forEach((f, idx) => {
      f.order = idx + 1;
    });

    this.render();
    Utils.toast('Partida removida da programação.', 'info', 1500);
  },

  atualizarConfronto(index, side, teamId) {
    Storage.assertAdmin('Alterar confronto da programação');
    if (Storage.isScheduleLocked()) {
      Utils.toast('A programação está bloqueada após o início da noite.', 'warning');
      return;
    }

    if (index === 0) {
      Utils.toast('A Partida 01 é obrigatoriamente Time 1 x Time 2.', 'warning');
      this.render();
      return;
    }

    const fixture = this.fixtures[index];
    if (!fixture) return;

    if (side === 'home') {
      fixture.homeTeamId = teamId;
      fixture.homeTeamName = this.getTeamName(teamId);
    } else {
      fixture.awayTeamId = teamId;
      fixture.awayTeamName = this.getTeamName(teamId);
    }

    this.render();
  },

  validarProgramacao() {
    if (!this.fixtures || this.fixtures.length === 0) {
      return { valid: false, error: 'A programação deve conter pelo menos a Partida 01.' };
    }

    const first = this.fixtures[0];
    if (first.homeTeamId !== 'time_1' || first.awayTeamId !== 'time_2') {
      return { valid: false, error: 'A primeira partida é obrigatoriamente Time 1 x Time 2.' };
    }

    for (let i = 0; i < this.fixtures.length; i++) {
      const f = this.fixtures[i];
      if (f.homeTeamId === f.awayTeamId) {
        return {
          valid: false,
          error: `Partida ${String(i + 1).padStart(2, '0')} inválida: ${this.getTeamName(f.homeTeamId)} não pode jogar contra si mesmo.`
        };
      }
    }

    return { valid: true };
  },

  salvarProgramacao() {
    Storage.assertAdmin('Salvar programação');
    if (Storage.isScheduleLocked()) {
      Utils.toast('A programação está bloqueada após o início da noite.', 'warning');
      return false;
    }

    const check = this.validarProgramacao();
    if (!check.valid) {
      Utils.toast(check.error, 'warning', 4500);
      return false;
    }

    try {
      Storage.saveSchedule(this.fixtures);
      Utils.sound.playGoal();
      Utils.toast('Programação da noite salva com sucesso!', 'success', 3500);
      this.render();
      return true;
    } catch (err) {
      Utils.toast(err.message, 'error', 4000);
      return false;
    }
  },

  iniciarNoite() {
    Storage.assertAdmin('Iniciar noite');
    const round = Storage.getCurrentRound();
    if (round && round.status === 'FINISHED') {
      Utils.toast('Esta noite já foi encerrada. Não é possível iniciar uma nova partida.', 'warning');
      return;
    }

    const teams = Storage.getTeams();
    if (!teams) {
      Utils.toast('Realize o sorteio dos 4 times antes de iniciar a noite.', 'warning');
      return;
    }

    const check = this.validarProgramacao();
    if (!check.valid) {
      Utils.toast(check.error, 'warning', 4000);
      return;
    }

    // Salva programação antes de iniciar
    Storage.saveSchedule(this.fixtures);

    // Inicia a noite e bloqueia composição de times e programação
    Storage.startNight();
    Utils.sound.playWhistle();
    Utils.toast('Noite iniciada! Times e programação bloqueados.', 'success', 4000);

    // Navega para a Partida 01
    if (window.App) {
      window.App.navigateTo('partida');
    }
  },

  render(containerId = 'programacao-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const teams = Storage.getTeams();
    const colors = Storage.getTeamColors();
    const isLocked = Storage.isScheduleLocked();
    const isPublic = Storage.isPublicViewer();
    const round = Storage.getCurrentRound();

    if (!teams) {
      container.innerHTML = `
        <div class="empty-state text-center" style="padding: 2rem;">
          <div class="empty-icon" style="color: var(--text-dim); margin-bottom: 0.5rem;">
            <svg class="i" style="width:32px;height:32px;" aria-hidden="true"><use href="#i-shuffle"/></svg>
          </div>
          <h3>Times ainda não sorteados</h3>
          <p class="text-muted">Selecione 20 atletas e realize o sorteio dos 4 times para liberar a programação da noite.</p>
        </div>
      `;
      return;
    }

    const teamOptions = [
      { id: 'time_1', name: 'Time 1', color: colors.time_1 },
      { id: 'time_2', name: 'Time 2', color: colors.time_2 },
      { id: 'time_3', name: 'Time 3', color: colors.time_3 },
      { id: 'time_4', name: 'Time 4', color: colors.time_4 }
    ];

    const hasInvalidMatch = this.fixtures.some(f => f.homeTeamId === f.awayTeamId);

    container.innerHTML = `
      <div class="card programacao-card">
        <div class="card-head" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <h3 class="card-title" style="display: flex; align-items: center; gap: 0.5rem;">
              <svg class="i" style="width:18px;height:18px;" aria-hidden="true"><use href="#i-calendar"/></svg>
              <span>PROGRAMAÇÃO DA NOITE</span>
            </h3>
            <p class="text-muted" style="font-size: 0.82rem; margin-top: 0.2rem;">
              ${isLocked 
                ? 'Confrontos definidos e bloqueados após o início da primeira partida.' 
                : 'O administrador define todos os confrontos da noite antes do início.'}
            </p>
          </div>
          <div>
            ${isLocked ? `
              <span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">
                <svg class="i i-sm" aria-hidden="true" style="margin-right: 4px;"><use href="#i-lock"/></svg>
                PROGRAMAÇÃO BLOQUEADA
              </span>
            ` : `
              <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">
                ${round && round.status === 'READY' ? 'PROGRAMAÇÃO PRONTA' : 'MODO EDIÇÃO'}
              </span>
            `}
          </div>
        </div>

        <div class="programacao-list" style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;">
          ${this.fixtures.map((f, idx) => {
            const isFirst = idx === 0;
            const isInvalid = f.homeTeamId === f.awayTeamId;
            const homeColor = colors[f.homeTeamId] || '#3b82f6';
            const awayColor = colors[f.awayTeamId] || '#ef4444';
            const orderStr = String(idx + 1).padStart(2, '0');

            return `
              <div class="fixture-item-row ${isInvalid ? 'fixture-has-error' : ''}" style="
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.75rem 1rem;
                background: var(--surface-2, rgba(255,255,255,0.03));
                border: 1px solid ${isInvalid ? 'var(--danger, #ef4444)' : 'var(--border, rgba(255,255,255,0.08))'};
                border-radius: 8px;
              ">
                <div style="min-width: 80px; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 1.1rem; color: var(--text-dim, #94a3b8);">
                  PARTIDA ${orderStr}
                </div>

                <div style="display: flex; align-items: center; flex: 1; gap: 0.75rem; flex-wrap: wrap;">
                  ${isFirst || isLocked || isPublic ? `
                    <div class="fixture-fixed-team" style="display: flex; align-items: center; gap: 0.4rem; flex: 1; min-width: 110px;">
                      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${homeColor};"></span>
                      <strong style="color: ${homeColor}; font-size: 0.95rem;">${f.homeTeamName}</strong>
                    </div>
                  ` : `
                    <div style="flex: 1; min-width: 120px;">
                      <select class="form-control select-compact select-fixture-team" data-index="${idx}" data-side="home" style="width: 100%; border-left: 3px solid ${homeColor};">
                        ${teamOptions.map(opt => `
                          <option value="${opt.id}" ${opt.id === f.homeTeamId ? 'selected' : ''}>
                            ${opt.name}
                          </option>
                        `).join('')}
                      </select>
                    </div>
                  `}

                  <div style="font-weight: 800; font-size: 0.9rem; color: var(--text-dim, #64748b); padding: 0 0.25rem;">
                    ✕
                  </div>

                  ${isFirst || isLocked || isPublic ? `
                    <div class="fixture-fixed-team" style="display: flex; align-items: center; gap: 0.4rem; flex: 1; min-width: 110px;">
                      <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${awayColor};"></span>
                      <strong style="color: ${awayColor}; font-size: 0.95rem;">${f.awayTeamName}</strong>
                    </div>
                  ` : `
                    <div style="flex: 1; min-width: 120px;">
                      <select class="form-control select-compact select-fixture-team" data-index="${idx}" data-side="away" style="width: 100%; border-left: 3px solid ${awayColor};">
                        ${teamOptions.map(opt => `
                          <option value="${opt.id}" ${opt.id === f.awayTeamId ? 'selected' : ''}>
                            ${opt.name}
                          </option>
                        `).join('')}
                      </select>
                    </div>
                  `}
                </div>

                <div style="min-width: 38px; display: flex; justify-content: flex-end;">
                  ${isFirst ? `
                    <span class="badge" style="font-size: 0.72rem; padding: 0.2rem 0.4rem;" title="Partida inicial obrigatória">FIXA</span>
                  ` : (!isLocked && !isPublic ? `
                    <button type="button" class="btn btn-ghost btn-sm btn-remove-fixture" data-index="${idx}" title="Excluir partida da programação" style="color: var(--danger, #ef4444); padding: 6px 8px;">
                      <svg class="i i-sm" aria-hidden="true"><use href="#i-trash"/></svg>
                    </button>
                  ` : '')}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${hasInvalidMatch ? `
          <div class="alert alert-danger" style="margin-top: 1rem; padding: 0.75rem 1rem; font-size: 0.88rem; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; color: #ef4444;">
            Confronto inválido: um time não pode jogar contra si mesmo (ex: Time 1 x Time 1). Altere os seletores acima.
          </div>
        ` : ''}

        ${!isLocked && !isPublic ? `
          <div class="programacao-actions" style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.25rem;">
            <button type="button" id="btn-add-fixture" class="btn btn-secondary">
              <svg class="i" aria-hidden="true"><use href="#i-plus"/></svg>
              <span>+ ADICIONAR PARTIDA</span>
            </button>

            <button type="button" id="btn-salvar-programacao" class="btn btn-primary" ${hasInvalidMatch ? 'disabled' : ''}>
              <svg class="i" aria-hidden="true"><use href="#i-copy"/></svg>
              <span>SALVAR PROGRAMAÇÃO</span>
            </button>

            ${(round && round.status === 'READY') ? `
              <button type="button" id="btn-iniciar-noite" class="btn btn-primary btn-ready-pulse" style="margin-left: auto;">
                <svg class="i" aria-hidden="true"><use href="#i-play"/></svg>
                <span>INICIAR NOITE (PARTIDA 01)</span>
              </button>
            ` : ''}
          </div>
        ` : (isLocked ? `
          <div style="margin-top: 1.25rem; display: flex; justify-content: flex-end;">
            <button type="button" class="btn btn-primary" onclick="if(window.App) window.App.navigateTo('partida');">
              <svg class="i" aria-hidden="true"><use href="#i-whistle"/></svg>
              <span>Ir para a Partida ao Vivo</span>
            </button>
          </div>
        ` : '')}
      </div>
    `;
  }
};
