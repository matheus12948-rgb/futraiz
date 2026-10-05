/**
 * Módulo de Configurações - FutRaiz
 * Gerenciamento de dados do futebol, preferências de partida (duração padrão de 7 minutos),
 * carga de dados históricos iniciais (saldo inicial pré-FutRoda) e manutenção.
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { Partidas } from './partidas.js';

export const Configuracoes = {
  init() {
    this.bindEvents();
    this.render();

    Storage.onChange((type) => {
      if (['futebolUpdated', 'historicalLoadFinalized', 'historicalDataUpdated', 'players', 'reset'].includes(type)) {
        this.render();
      }
    });
  },

  bindEvents() {
    // Form Configurações do Futebol
    const formFut = document.getElementById('form-settings-futebol');
    if (formFut) {
      formFut.addEventListener('submit', async (e) => {
        e.preventDefault();
        Storage.assertAdmin('Alterar dados do futebol');
        const nameInput = document.getElementById('settings-fut-name');
        const newName = nameInput ? nameInput.value.trim() : '';

        if (!newName) {
          Utils.toast('Informe o nome do futebol.', 'warning');
          return;
        }

        const btnSave = document.getElementById('btn-save-fut-info');
        if (btnSave) btnSave.disabled = true;

        const res = await Storage.updateFutebolSettings({ nome: newName });
        if (btnSave) btnSave.disabled = false;

        if (res && res.success) {
          Utils.toast('Informações do futebol atualizadas com sucesso!', 'success', 3000);
          if (window.App) window.App.updateHeaderUI();
        } else {
          Utils.toast('Erro ao atualizar informações do futebol.', 'error');
        }
      });
    }

    // Form Preferências de Partida
    const durationSelect = document.getElementById('settings-default-duration');
    const customGroup = document.getElementById('settings-custom-duration-group');
    const customInput = document.getElementById('settings-custom-duration-input');

    if (durationSelect) {
      durationSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          if (customGroup) customGroup.style.display = 'block';
        } else {
          if (customGroup) customGroup.style.display = 'none';
        }
      });
    }

    const formMatch = document.getElementById('form-settings-match');
    if (formMatch) {
      formMatch.addEventListener('submit', async (e) => {
        e.preventDefault();
        Storage.assertAdmin('Alterar preferências de partida');

        let minutes = 7;
        const selVal = durationSelect ? durationSelect.value : '7';

        if (selVal === 'custom') {
          const customVal = customInput ? parseInt(customInput.value, 10) : 7;
          minutes = Math.max(1, Math.min(90, customVal || 7));
        } else {
          minutes = parseInt(selVal, 10) || 7;
        }

        const seconds = minutes * 60;
        const btnSave = document.getElementById('btn-save-match-preferences');
        if (btnSave) btnSave.disabled = true;

        const res = await Storage.updateFutebolSettings({
          default_match_duration_seconds: seconds
        });
        if (btnSave) btnSave.disabled = false;

        if (res && res.success) {
          // Atualiza estado de partidas se não houver jogo em andamento
          if (Partidas && Partidas.state && Partidas.state.status !== 'running' && Partidas.state.status !== 'paused') {
            Partidas.state.durationMinutes = minutes;
            Partidas.state.durationSeconds = seconds;
            Partidas.state.remainingSeconds = seconds;
            Partidas.updateTimerDisplay();
            Partidas.renderControls();
          }

          Utils.toast(`Duração padrão das partidas definida para ${minutes} minutos (${Utils.formatSeconds(seconds)})!`, 'success', 4000);
        } else {
          Utils.toast('Erro ao salvar preferências de partida.', 'error');
        }
      });
    }

    // Copiar código público
    const btnCopyCode = document.getElementById('btn-settings-copy-code');
    if (btnCopyCode) {
      btnCopyCode.addEventListener('click', (e) => {
        e.preventDefault();
        const codeInput = document.getElementById('settings-fut-code');
        if (!codeInput) return;
        const code = codeInput.value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(() => {
            Utils.toast(`Código copiado: ${code}`, 'success', 3000);
          });
        } else {
          prompt('Copie o código público:', code);
        }
      });
    }

    // Compartilhar link na tela de configurações
    const btnSettingsShare = document.getElementById('btn-settings-share-link');
    if (btnSettingsShare) {
      btnSettingsShare.addEventListener('click', (e) => {
        e.preventDefault();
        const btnHeaderShare = document.getElementById('btn-share-link');
        if (btnHeaderShare) btnHeaderShare.click();
      });
    }

    // Zerar dados na tela de configurações
    const btnSettingsReset = document.getElementById('btn-settings-reset-data');
    if (btnSettingsReset) {
      btnSettingsReset.addEventListener('click', (e) => {
        e.preventDefault();
        const btnHeaderReset = document.getElementById('btn-reset-data');
        if (btnHeaderReset) btnHeaderReset.click();
      });
    }

    // Eventos de Carga Histórica Inicial
    this.bindHistoricalEvents();
  },

  bindHistoricalEvents() {
    // Validação estrita de digitação nos inputs de gols e capas (somente inteiros >= 0)
    document.addEventListener('input', (e) => {
      if (e.target.matches('.input-hist-goals') || e.target.matches('.input-hist-capas')) {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if (val.length > 1 && val.startsWith('0')) {
          val = String(parseInt(val, 10));
        }
        e.target.value = val;
      }
    });

    // Clique em botões de dados históricos
    document.addEventListener('click', async (e) => {
      // Salvar dados históricos
      const btnSave = e.target.closest('#btn-save-historical-data');
      if (btnSave) {
        e.preventDefault();
        Storage.assertAdmin('Salvar dados históricos iniciais');

        if (!Storage.isHistoricoInicialAberto()) {
          Utils.toast('A carga histórica já foi finalizada e está bloqueada.', 'warning');
          return;
        }

        const goalInputs = document.querySelectorAll('.input-hist-goals');
        const updates = [];

        for (const gInput of goalInputs) {
          const pid = gInput.dataset.playerId;
          const cInput = document.querySelector(`.input-hist-capas[data-player-id="${pid}"]`);

          const rawGoals = gInput.value.trim();
          const rawCapas = cInput ? cInput.value.trim() : '0';

          if (rawGoals === '' || isNaN(rawGoals) || parseInt(rawGoals, 10) < 0) {
            Utils.toast('Informe números inteiros válidos maiores ou iguais a 0 para gols.', 'warning');
            gInput.focus();
            return;
          }

          if (rawCapas === '' || isNaN(rawCapas) || parseInt(rawCapas, 10) < 0) {
            Utils.toast('Informe números inteiros válidos maiores ou iguais a 0 para Capas.', 'warning');
            if (cInput) cInput.focus();
            return;
          }

          updates.push({
            id: pid,
            gols_historicos_iniciais: parseInt(rawGoals, 10),
            capas_historicas_iniciais: parseInt(rawCapas, 10)
          });
        }

        btnSave.disabled = true;
        try {
          await Storage.saveHistoricalData(updates);
          Utils.toast('Dados históricos salvos com sucesso!', 'success', 3000);
          this.render();
        } catch (err) {
          Utils.toast(err.message || 'Erro ao salvar dados históricos.', 'error');
        } finally {
          btnSave.disabled = false;
        }
      }

      // Finalizar carga histórica -> abre modal
      const btnFinalize = e.target.closest('#btn-finalize-historical-data');
      if (btnFinalize) {
        e.preventDefault();
        Storage.assertAdmin('Finalizar carga histórica');

        if (!Storage.isHistoricoInicialAberto()) {
          Utils.toast('A carga histórica já foi finalizada.', 'warning');
          return;
        }

        const modal = document.getElementById('modal-confirm-finalize-historical');
        if (modal) modal.classList.add('active');
      }

      // Modal: Confirmação de Finalização
      const btnConfirmFinalize = e.target.closest('#btn-confirm-finalize-hist');
      if (btnConfirmFinalize) {
        e.preventDefault();
        Storage.assertAdmin('Finalizar carga histórica');

        btnConfirmFinalize.disabled = true;
        try {
          // Salva antes os valores atuais caso tenham sido digitados
          const goalInputs = document.querySelectorAll('.input-hist-goals');
          if (goalInputs.length > 0) {
            const updates = [];
            for (const gInput of goalInputs) {
              const pid = gInput.dataset.playerId;
              const cInput = document.querySelector(`.input-hist-capas[data-player-id="${pid}"]`);
              updates.push({
                id: pid,
                gols_historicos_iniciais: parseInt(gInput.value, 10) || 0,
                capas_historicas_iniciais: parseInt(cInput ? cInput.value : 0, 10) || 0
              });
            }
            await Storage.saveHistoricalData(updates);
          }

          await Storage.finalizeHistoricalLoad();

          const modal = document.getElementById('modal-confirm-finalize-historical');
          if (modal) modal.classList.remove('active');

          Utils.toast('Carga histórica finalizada e bloqueada com sucesso!', 'success', 4000);
          this.render();
        } catch (err) {
          Utils.toast(err.message || 'Erro ao finalizar carga histórica.', 'error');
        } finally {
          btnConfirmFinalize.disabled = false;
        }
      }
    });
  },

  renderHistoricalSection() {
    const badgeWrap = document.getElementById('status-historico-badge-wrap');
    const avisoWrap = document.getElementById('aviso-historico-wrap');
    const tabelaWrap = document.getElementById('tabela-historico-wrap');
    const actionsWrap = document.getElementById('actions-historico-wrap');

    if (!badgeWrap || !avisoWrap || !tabelaWrap || !actionsWrap) return;

    const isAberto = Storage.isHistoricoInicialAberto();
    const isAdmin = Storage.isAdmin();
    const players = Storage.getPlayers();

    // 1. Badge de Status (sem emojis, ícones SVG padrão)
    if (isAberto) {
      badgeWrap.innerHTML = `
        <span class="status-tag status-live" style="font-weight: 700; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 6px;">
          <svg class="i i-sm" aria-hidden="true"><use href="#i-edit"/></svg>
          <span>CARGA HISTÓRICA ABERTA</span>
        </span>
      `;
    } else {
      badgeWrap.innerHTML = `
        <span class="status-tag status-finished" style="font-weight: 700; font-size: 0.75rem; display: inline-flex; align-items: center; gap: 6px;">
          <svg class="i i-sm" aria-hidden="true"><use href="#i-check"/></svg>
          <span>CARGA HISTÓRICA FINALIZADA</span>
        </span>
      `;
    }

    // 2. Aviso Visual
    if (isAberto) {
      avisoWrap.innerHTML = `
        <div style="padding: 0.85rem 1rem; border-radius: var(--radius, 8px); background: rgba(59, 130, 246, 0.08); border-left: 3px solid var(--primary, #3b82f6); font-size: 0.88rem; color: var(--text-main);">
          <strong style="display: block; margin-bottom: 2px;">Saldo Inicial Acumulado</strong>
          <span class="text-muted">Os dados abaixo representam o histórico anterior ao uso do FutRoda. Essa informação pode ser preenchida apenas uma vez.</span>
        </div>
      `;
    } else {
      avisoWrap.innerHTML = `
        <div style="padding: 0.85rem 1rem; border-radius: var(--radius, 8px); background: rgba(16, 185, 129, 0.08); border-left: 3px solid #10b981; font-size: 0.88rem; color: var(--text-main);">
          <strong style="display: flex; align-items: center; gap: 6px; color: #10b981; margin-bottom: 2px;">
            <svg class="i i-sm" aria-hidden="true"><use href="#i-check"/></svg>
            <span>Carga histórica finalizada</span>
          </strong>
          <span class="text-muted">Os dados históricos foram importados e estão bloqueados. Os gols e Capas históricos não podem mais ser alterados.</span>
        </div>
      `;
    }

    // 3. Tabela de Jogadores
    if (players.length === 0) {
      tabelaWrap.innerHTML = `
        <div class="empty-state text-center" style="padding: 2rem 1rem;">
          <p class="text-muted" style="margin-bottom: 0.5rem;">Nenhum jogador cadastrado neste futebol.</p>
          <p class="text-dim" style="font-size: 0.85rem;">Cadastre jogadores primeiro na aba <strong>Jogadores</strong> para poder lançar os dados históricos iniciais.</p>
        </div>
      `;
      actionsWrap.innerHTML = '';
      return;
    }

    // Ordena por nome alfabético
    const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));

    tabelaWrap.innerHTML = `
      <table class="sports-table" style="width: 100%;">
        <thead>
          <tr>
            <th class="col-team" style="text-align: left;">JOGADOR</th>
            <th class="col-num" style="text-align: center; width: 130px;" title="Gols marcados antes do FutRoda">
              <span style="display: inline-flex; align-items: center; gap: 4px;">
                <svg class="i i-sm" aria-hidden="true"><use href="#i-ball"/></svg>
                <span>GOLS ATUAIS</span>
              </span>
            </th>
            <th class="col-pts" style="text-align: center; width: 130px;" title="Capas conquistadas antes do FutRoda">
              <span style="display: inline-flex; align-items: center; gap: 4px;">
                <svg class="i i-sm" aria-hidden="true"><use href="#i-crown"/></svg>
                <span>CAPAS ATUAIS</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          ${sortedPlayers.map(p => {
            const histGoals = p.gols_historicos_iniciais || 0;
            const histCapas = p.capas_historicas_iniciais || 0;

            return `
              <tr>
                <td class="col-team" style="vertical-align: middle;">
                  <strong style="color: var(--text-main); font-size: 0.95rem; display: block;">${p.name}</strong>
                  <div style="font-size: 0.75rem; margin-top: 2px;">${Utils.renderStars(p.stars)}</div>
                </td>
                <td class="col-num" style="text-align: center; vertical-align: middle;">
                  ${(isAberto && isAdmin) ? `
                    <input 
                      type="number" 
                      min="0" 
                      step="1" 
                      class="form-control input-hist-goals" 
                      data-player-id="${p.id}" 
                      value="${histGoals}" 
                      style="width: 82px; text-align: center; font-weight: 700; margin: 0 auto; padding: 0.35rem 0.5rem; height: 38px;"
                      aria-label="Gols históricos de ${p.name}"
                    >
                  ` : `
                    <span style="font-weight: 700; color: var(--text-main); font-size: 1rem; display: inline-block;">${histGoals}</span>
                  `}
                </td>
                <td class="col-pts" style="text-align: center; vertical-align: middle;">
                  ${(isAberto && isAdmin) ? `
                    <input 
                      type="number" 
                      min="0" 
                      step="1" 
                      class="form-control input-hist-capas" 
                      data-player-id="${p.id}" 
                      value="${histCapas}" 
                      style="width: 82px; text-align: center; font-weight: 700; margin: 0 auto; color: #eab308; padding: 0.35rem 0.5rem; height: 38px;"
                      aria-label="Capas históricas de ${p.name}"
                    >
                  ` : `
                    <span style="font-weight: 800; color: #eab308; font-size: 1rem; display: inline-block;">${histCapas}</span>
                  `}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    // 4. Ações
    if (isAberto && isAdmin) {
      actionsWrap.innerHTML = `
        <button type="button" id="btn-save-historical-data" class="btn btn-primary">
          <svg class="i" aria-hidden="true"><use href="#i-check"/></svg>
          <span>Salvar dados históricos</span>
        </button>
        <button type="button" id="btn-finalize-historical-data" class="btn btn-danger">
          <svg class="i" aria-hidden="true"><use href="#i-lock"/></svg>
          <span>Finalizar carga histórica</span>
        </button>
      `;
    } else {
      actionsWrap.innerHTML = '';
    }
  },

  render() {
    const activeFut = Storage.currentFutebol;
    if (!activeFut) return;

    // 1. Dados do futebol
    const nameInput = document.getElementById('settings-fut-name');
    const codeInput = document.getElementById('settings-fut-code');
    if (nameInput) nameInput.value = activeFut.nome || '';
    if (codeInput) codeInput.value = activeFut.codigo_publico || 'FDT-XXXX';

    // 2. Duração padrão de partida (Padrão 7 minutos = 420s)
    const durationMinutes = Storage.getDefaultMatchDurationMinutes() || 7;
    const durationSelect = document.getElementById('settings-default-duration');
    const customGroup = document.getElementById('settings-custom-duration-group');
    const customInput = document.getElementById('settings-custom-duration-input');

    if (durationSelect) {
      const knownValues = ['5', '7', '10', '15', '20'];
      const strVal = String(durationMinutes);
      if (knownValues.includes(strVal)) {
        durationSelect.value = strVal;
        if (customGroup) customGroup.style.display = 'none';
      } else {
        durationSelect.value = 'custom';
        if (customGroup) customGroup.style.display = 'block';
        if (customInput) customInput.value = durationMinutes;
      }
    }

    // 3. Seção de Dados Históricos Iniciais
    this.renderHistoricalSection();
  }
};
