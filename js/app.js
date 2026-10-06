/**
 * App Principal - Familia do Fut Multi-Tenant
 * Gerenciamento de rotas SPA, Plataforma Multi-Futebol, Autenticação Supabase,
 * Modo Somente Leitura para espectadores e Painel Administrativo.
 */

import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { Jogadores } from './jogadores.js';
import { Sorteio } from './sorteio.js';
import { Programacao } from './programacao.js';
import { Partidas } from './partidas.js';
import { Tabela } from './tabela.js';
import { Rankings } from './rankings.js';
import { Historico } from './historico.js';
import { Configuracoes } from './configuracoes.js';

export const App = {
  currentScreen: 'landing',

  async init() {
    console.log('[App] Inicializando FutRaiz Multi-Futebol...');

    if (typeof window !== 'undefined') {
      window.App = this;
      window.Jogadores = Jogadores;
      window.Sorteio = Sorteio;
      window.Programacao = Programacao;
      window.Partidas = Partidas;
      window.Tabela = Tabela;
      window.Rankings = Rankings;
      window.Historico = Historico;
      window.Configuracoes = Configuracoes;
      window.Storage = Storage;
      window.StorageApp = Storage;
      this.Storage = Storage;
      window.Utils = Utils;
    }

    this.bindNavigation();
    this.bindGlobalEvents();
    this.bindPlatformModals();

    await Storage.init();

    this.safeInit('Jogadores', () => Jogadores.init());
    this.safeInit('Sorteio', () => Sorteio.init());
    this.safeInit('Programacao', () => Programacao.init());
    this.safeInit('Partidas', () => Partidas.init());
    this.safeInit('Tabela', () => Tabela.init());
    this.safeInit('Rankings', () => Rankings.init());
    this.safeInit('Historico', () => Historico.init());
    this.safeInit('Configuracoes', () => Configuracoes.init());

    Storage.onChange((type) => {
      if (type === 'selectedPlayers') {
        this.renderDashboard();
        return;
      }
      if (type === 'logout') {
        this.updateHeaderUI();
        this.navigateTo('landing');
        return;
      }
      this.updateHeaderUI();
      this.refreshAll();
    });

    // Sincronização multi-dispositivo por eventos do ciclo de vida da janela/aba
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Storage.currentFutebol) {
          console.log('[App] Aba visível: reconciliando estado oficial com Supabase...');
          Storage.reconcileActiveState(Storage.currentFutebol.id).catch(() => {});
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (Storage.currentFutebol) {
          console.log('[App] Conexão restabelecida: reconectando Realtime e reconciliando estado...');
          Storage.setupRealtime(Storage.currentFutebol.id);
          Storage.reconcileActiveState(Storage.currentFutebol.id).catch(() => {});
        }
      });

      window.addEventListener('focus', () => {
        if (Storage.currentFutebol) {
          Storage.reconcileActiveState(Storage.currentFutebol.id).catch(() => {});
        }
      });
    }

    // Roteamento por URL / Hash
    window.addEventListener('hashchange', () => this.handleHashRoute());
    await this.handleHashRoute();

    console.log('[App] Inicialização concluída.');
  },

  safeInit(name, fn) {
    try {
      fn();
    } catch (err) {
      console.error(`[App] Erro ao inicializar módulo ${name}:`, err);
    }
  },

  // Roteamento de URLs da Plataforma (ex: #/fut/FDT-7K29, #/admin, #/)
  async handleHashRoute() {
    const hash = window.location.hash || '';
    const futMatch = hash.match(/#\/(?:fut|futebol)\/([A-Za-z0-9\-]+)/i);

    if (futMatch && futMatch[1]) {
      const code = futMatch[1];
      const normalizedCode = Storage.normalizePublicCode ? Storage.normalizePublicCode(code) : code.trim().toUpperCase();

      if (Storage.currentFutebol && Storage.currentFutebol.codigo_publico === normalizedCode && Storage.isPublicViewer()) {
        this.updateHeaderUI();
        this.navigateTo('partida');
        return;
      }

      console.log(`[App] Acessando futebol via URL pública: ${normalizedCode}`);
      const res = await Storage.loadPublicFutebol(normalizedCode);
      if (res.success) {
        this.updateHeaderUI();
        Utils.toast(`Acessando ${res.futebol.nome} (Modo Público)`, 'info', 3000);
        this.navigateTo('partida');
        return;
      } else {
        Utils.toast(`Futebol "${code}" não encontrado.`, 'warning', 4000);
        this.navigateTo('landing');
        return;
      }
    }

    if (hash === '#/admin' && Storage.isAdmin() && Storage.currentFutebol) {
      this.updateHeaderUI();
      this.navigateTo('dashboard');
      return;
    }

    // Se já houver um futebol ativo na sessão
    if (Storage.currentFutebol) {
      this.updateHeaderUI();
      if (Storage.isPublicViewer()) {
        this.navigateTo('partida');
      } else {
        this.navigateTo('dashboard');
      }
    } else {
      this.updateHeaderUI();
      this.navigateTo('landing');
    }
  },

  bindNavigation() {
    // Clique na Logo/Nome do aplicativo no header: SEMPRE navega para o Dashboard (NUNCA logout, NUNCA destrói sessão)
    const brandLogo = document.getElementById('header-brand-logo');
    if (brandLogo) {
      brandLogo.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (Storage.currentFutebol) {
          if (Storage.isPublicViewer()) {
            this.navigateTo('partida');
          } else {
            this.navigateTo('dashboard');
          }
        } else {
          this.navigateTo('landing');
        }
      });
    }

    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-screen]');
      if (trigger) {
        // Se for a brand logo, o listener específico acima já tratou ou tratará
        if (trigger.id === 'header-brand-logo') {
          e.preventDefault();
          if (Storage.currentFutebol) {
            if (Storage.isPublicViewer()) {
              this.navigateTo('partida');
            } else {
              this.navigateTo('dashboard');
            }
          } else {
            this.navigateTo('landing');
          }
          return;
        }

        e.preventDefault();
        const screen = trigger.dataset.screen;
        if (screen) {
          // Bloqueia telas administrativas para espectadores públicos
          if (Storage.isPublicViewer() && ['dashboard', 'jogadores', 'sorteio', 'configuracoes'].includes(screen)) {
            Utils.toast('Esta tela é restrita ao administrador do futebol.', 'warning');
            return;
          }
          this.navigateTo(screen);
        }
      }
    });
  },

  bindGlobalEvents() {
    // Reset Geral dos dados do futebol ativo (Apenas Admin)
    const btnReset = document.getElementById('btn-reset-data');
    if (btnReset) {
      btnReset.addEventListener('click', (e) => {
        e.preventDefault();
        Storage.assertAdmin('Resetar dados do futebol');
        Utils.showDoubleConfirm({
          title: 'Resetar Dados do Futebol',
          step1Message: `Atenção: Isso irá apagar os jogadores, rodadas, histórico e rankings deste futebol (${Storage.currentFutebol.nome}).`,
          step2Message: 'Confirmação final: Você tem certeza ABSOLUTA que deseja zerar os dados deste futebol? Esta ação não pode ser desfeita.',
          onConfirm: () => {
            Storage.resetAll();
            Utils.toast('Dados do futebol resetados.', 'info');
            this.navigateTo('dashboard');
            this.refreshAll();
          }
        });
      });
    }

    // Botão CTA Sorteio / Configurar Rodada no Dashboard
    const btnCtaDraw = document.getElementById('dash-cta-draw');
    if (btnCtaDraw) {
      btnCtaDraw.addEventListener('click', (e) => {
        e.preventDefault();
        const teams = Storage.getTeams();
        if (teams) {
          this.navigateTo('sorteio');
        } else {
          const players = Storage.getPlayers();
          if (players.length < 20) {
            const missing = 20 - players.length;
            Utils.toast(`É necessário cadastrar pelo menos 20 jogadores. Faltam ${missing}.`, 'warning', 4500);
            this.navigateTo('jogadores');
          } else {
            this.navigateTo('sorteio');
          }
        }
      });
    }

    // Botão CTA Ir para Partida no Dashboard
    const btnCtaMatch = document.getElementById('dash-cta-match');
    if (btnCtaMatch) {
      btnCtaMatch.addEventListener('click', (e) => {
        e.preventDefault();
        const teams = Storage.getTeams();
        if (!teams) {
          Utils.toast('É necessário sortear os times primeiro.', 'warning', 4000);
          this.navigateTo('sorteio');
        } else {
          this.navigateTo('partida');
        }
      });
    }

    // Botão Trocar Futebol / Sair
    const btnTrocar = document.getElementById('btn-trocar-futebol');
    if (btnTrocar) {
      btnTrocar.addEventListener('click', (e) => {
        e.preventDefault();
        Storage.logout();
        window.location.hash = '#/';
        this.navigateTo('landing');
      });
    }

    const btnPublicLeave = document.getElementById('btn-public-leave');
    if (btnPublicLeave) {
      btnPublicLeave.addEventListener('click', (e) => {
        e.preventDefault();
        Storage.logout();
        window.location.hash = '#/';
        this.navigateTo('landing');
      });
    }

    // Botão Compartilhar Link Público
    const btnShare = document.getElementById('btn-share-link');
    if (btnShare) {
      btnShare.addEventListener('click', (e) => {
        e.preventDefault();
        if (!Storage.currentFutebol) return;
        const code = Storage.currentFutebol.codigo_publico;
        const url = `${window.location.origin}${window.location.pathname}#/fut/${code}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(() => {
            Utils.toast(`Link público copiado: ${url}`, 'success', 5000);
          }).catch(() => {
            prompt('Copie o link público do futebol:', url);
          });
        } else {
          prompt('Copie o link público do futebol:', url);
        }
      });
    }

    // Botão "Mais" na barra inferior mobile
    const btnBottomMore = document.getElementById('btn-bottom-more');
    if (btnBottomMore) {
      btnBottomMore.addEventListener('click', (e) => {
        e.preventDefault();
        Utils.openModal('modal-more-menu');
      });
    }

    const btnMoreShare = document.getElementById('btn-more-share');
    if (btnMoreShare && btnShare) {
      btnMoreShare.addEventListener('click', () => btnShare.click());
    }

    const btnMoreReset = document.getElementById('btn-more-reset');
    if (btnMoreReset && btnReset) {
      btnMoreReset.addEventListener('click', () => btnReset.click());
    }

    const btnMoreTrocar = document.getElementById('btn-more-trocar');
    if (btnMoreTrocar && btnTrocar) {
      btnMoreTrocar.addEventListener('click', () => btnTrocar.click());
    }
  },

  // Eventos dos Modais da Plataforma (Criar Futebol, Entrar, Login Admin)
  bindPlatformModals() {
    // Abrir Modal Criar Futebol
    const btnOpenCreate = document.getElementById('btn-open-create-futebol');
    if (btnOpenCreate) {
      btnOpenCreate.addEventListener('click', () => {
        Utils.openModal('modal-create-futebol');
      });
    }

    // Form Criar Futebol
    const formCreate = document.getElementById('form-create-futebol');
    if (formCreate) {
      formCreate.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (formCreate.dataset.submitting === 'true') return;
        formCreate.dataset.submitting = 'true';

        const nome = document.getElementById('create-fut-name').value;
        const adminNome = document.getElementById('create-fut-admin-name').value;
        const email = document.getElementById('create-fut-email').value;
        const password = document.getElementById('create-fut-password').value;

        const btnSubmit = document.getElementById('btn-submit-create-fut');
        const originalBtnText = btnSubmit ? btnSubmit.innerHTML : 'Criar futebol';
        if (btnSubmit) {
          btnSubmit.disabled = true;
          btnSubmit.innerHTML = '<span>Criando futebol...</span>';
        }

        try {
          const res = await Storage.createFutebol({ nome, adminNome, email, password });

          if (res && res.success) {
            // FECHAR AUTOMATICAMENTE O MODAL SOMENTE QUANDO A CRIAÇÃO FOR CONCLUÍDA COM SUCESSO
            Utils.closeModal('modal-create-futebol');
            formCreate.reset();

            const futNome = res.futebol?.nome || (nome ? nome.trim() : 'Futebol');
            const futCodigo = res.futebol?.codigo_publico || '';
            Utils.toast(`Futebol "${futNome}" criado com sucesso! ID: ${futCodigo}`, 'success', 5000);

            window.location.hash = '#/admin';
            this.updateHeaderUI();
            this.navigateTo('dashboard');
          } else {
            // Em caso de erro (autenticação, confirmação pendente, RLS, rate limit, validação, etc.):
            // O modal CONTINUA ABERTO para que o usuário possa visualizar a mensagem e corrigir/tentar novamente.
            const errMsg = res?.error || 'Não foi possível criar o futebol.';
            Utils.toast(errMsg, 'error', 6000);
          }
        } catch (err) {
          // Em caso de exceção de rede/inesperada: parar loading e MANTER modal aberto
          Utils.toast(`Erro ao criar futebol: ${err.message}`, 'error', 6000);
        } finally {
          // PARAR loading e restaurar botão e formulário para nova tentativa
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalBtnText;
          }
          formCreate.dataset.submitting = 'false';
        }
      });
    }

    // Abrir Modal Entrar em um Futebol
    const btnOpenEnter = document.getElementById('btn-open-enter-futebol');
    if (btnOpenEnter) {
      btnOpenEnter.addEventListener('click', () => {
        Utils.openModal('modal-enter-futebol');
      });
    }

    // Form Entrar em um Futebol
    const formEnter = document.getElementById('form-enter-futebol');
    if (formEnter) {
      formEnter.addEventListener('submit', async (e) => {
        e.preventDefault();
        const codeInput = document.getElementById('enter-fut-code');
        const rawCode = codeInput ? codeInput.value : '';

        const btnSubmit = document.getElementById('btn-submit-enter-fut');
        const originalText = btnSubmit ? btnSubmit.innerHTML : 'Acessar';
        if (btnSubmit) {
          btnSubmit.disabled = true;
          btnSubmit.innerHTML = '<span>Acessando...</span>';
        }

        try {
          const res = await Storage.loadPublicFutebol(rawCode);
          if (res.success) {
            Utils.closeModal('modal-enter-futebol');
            formEnter.reset();
            window.location.hash = `#/fut/${res.futebol.codigo_publico}`;
            this.updateHeaderUI();
            Utils.toast(`Conectado ao futebol "${res.futebol.nome}" (Somente Leitura)`, 'success', 4000);
            this.navigateTo('partida');
          } else {
            Utils.toast(res.error || 'Futebol não encontrado. Verifique o código e tente novamente.', 'warning', 4500);
          }
        } catch (err) {
          Utils.toast('Futebol não encontrado. Verifique o código e tente novamente.', 'warning', 4500);
        } finally {
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalText;
          }
        }
      });
    }

    // Abrir Modal Login Admin
    const btnOpenLogin = document.getElementById('btn-open-login-admin');
    if (btnOpenLogin) {
      btnOpenLogin.addEventListener('click', () => {
        Utils.openModal('modal-login-admin');
      });
    }

    // Form Login Admin
    const formLogin = document.getElementById('form-login-admin');
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (formLogin.dataset.submitting === 'true') return;
        formLogin.dataset.submitting = 'true';

        const email = document.getElementById('login-admin-email').value;
        const password = document.getElementById('login-admin-password').value;

        const btnSubmit = document.getElementById('btn-submit-login-admin');
        const originalText = btnSubmit ? btnSubmit.innerHTML : 'Entrar';
        if (btnSubmit) {
          btnSubmit.disabled = true;
          btnSubmit.innerHTML = '<span>Entrando...</span>';
        }

        try {
          const res = await Storage.loginAdmin({ email, password });
          if (res.success) {
            Utils.closeModal('modal-login-admin');
            formLogin.reset();
            window.location.hash = '#/admin';
            this.updateHeaderUI();
            Utils.toast(`Bem-vindo, administrador do ${res.futebol.nome}!`, 'success', 4000);
            this.navigateTo('dashboard');
          } else {
            Utils.toast(`Erro no login: ${res.error}`, 'error', 5000);
          }
        } catch (err) {
          Utils.toast(`Erro no login: ${err.message}`, 'error', 5000);
        } finally {
          if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalText;
          }
          formLogin.dataset.submitting = 'false';
        }
      });
    }

    // Fechamento genérico de modais por [data-close]
    document.querySelectorAll('.modal [data-close]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal) Utils.closeModal(modal.id);
      });
    });
    document.querySelectorAll('.modal .modal-backdrop').forEach(bd => {
      bd.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal) Utils.closeModal(modal.id);
      });
    });
  },

  updateHeaderUI() {
    const activeFut = Storage.currentFutebol;
    const isPublic = Storage.isPublicViewer();
    const isAdmin = Storage.isAdmin();

    const futInfoEl = document.getElementById('header-futebol-info');
    const futCodeEl = document.getElementById('header-futebol-code');
    const futNameEl = document.getElementById('header-active-fut-name');
    const roleBadgeEl = document.getElementById('header-role-badge');
    const desktopNav = document.getElementById('desktop-nav');
    const bottomNav = document.getElementById('bottom-nav');
    const btnTrocar = document.getElementById('btn-trocar-futebol');
    const btnReset = document.getElementById('btn-reset-data');
    const publicBanner = document.getElementById('public-viewer-banner');
    const publicBannerName = document.getElementById('public-banner-fut-name');
    const publicBannerCode = document.getElementById('public-banner-fut-code');

    if (isPublic) {
      document.body.classList.add('role-public-viewer');
    } else {
      document.body.classList.remove('role-public-viewer');
    }

    const isLanding = this.currentScreen === 'landing';
    document.body.classList.toggle('on-landing', isLanding);

    if (activeFut) {
      if (futInfoEl) futInfoEl.style.display = 'flex';
      if (futCodeEl) futCodeEl.textContent = activeFut.codigo_publico;
      if (futNameEl) futNameEl.textContent = activeFut.nome;
      if (desktopNav) desktopNav.style.display = '';
      if (bottomNav) bottomNav.style.display = isLanding ? 'none' : '';
      if (btnTrocar) btnTrocar.style.display = 'inline-flex';

      if (roleBadgeEl) {
        if (isAdmin) {
          roleBadgeEl.className = 'role-badge is-admin';
          roleBadgeEl.textContent = 'ADMIN';
        } else {
          roleBadgeEl.className = 'role-badge is-public';
          roleBadgeEl.textContent = 'PÚBLICO';
        }
      }

      if (btnReset) {
        btnReset.style.display = isAdmin ? 'inline-flex' : 'none';
      }

      if (publicBanner) {
        if (isPublic) {
          publicBanner.style.display = 'flex';
          if (publicBannerName) publicBannerName.textContent = activeFut.nome;
          if (publicBannerCode) publicBannerCode.textContent = activeFut.codigo_publico;
        } else {
          publicBanner.style.display = 'none';
        }
      }
    } else {
      // Nenhum futebol ativo (Landing Screen)
      if (futInfoEl) futInfoEl.style.display = 'none';
      if (futNameEl) futNameEl.textContent = 'Plataforma Multi-Futebol';
      if (desktopNav) desktopNav.style.display = 'none';
      if (bottomNav) bottomNav.style.display = 'none';
      if (btnTrocar) btnTrocar.style.display = 'none';
      if (btnReset) btnReset.style.display = 'none';
      if (publicBanner) publicBanner.style.display = 'none';
    }
  },

  navigateTo(screenId) {
    if (!screenId) return;
    this.currentScreen = screenId;

    const isLanding = screenId === 'landing';
    document.body.classList.toggle('on-landing', isLanding);

    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) {
      if (isLanding) {
        bottomNav.style.display = 'none';
      } else {
        bottomNav.style.display = '';
      }
    }

    document.querySelectorAll('.app-screen').forEach(screen => {
      const isTarget = screen.id === `screen-${screenId}`;
      screen.classList.toggle('active', isTarget);
    });

    document.querySelectorAll('[data-screen]').forEach(btn => {
      const isMatch = btn.dataset.screen === screenId;
      btn.classList.toggle('active', isMatch);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      if (screenId === 'dashboard') {
        this.renderDashboard();
      } else if (screenId === 'jogadores') {
        Jogadores.render();
        if (Storage.currentFutebol) {
          Storage.syncPlayersFromSupabase(Storage.currentFutebol.id).catch(() => {});
        }
      }
      else if (screenId === 'sorteio') {
        Sorteio.render();
        if (Storage.currentFutebol) Storage.reconcileActiveState(Storage.currentFutebol.id).catch(() => {});
      }
      else if (screenId === 'partida') {
        Partidas.restoreOrInitMatch();
        Partidas.render();
        if (Storage.currentFutebol) Storage.reconcileActiveState(Storage.currentFutebol.id).catch(() => {});
      }
      else if (screenId === 'tabela') {
        Tabela.render();
        if (Storage.currentFutebol) Storage.reconcileActiveState(Storage.currentFutebol.id).catch(() => {});
      }
      else if (screenId === 'rankings') {
        Rankings.render();
        if (Storage.currentFutebol) Storage.reconcileActiveState(Storage.currentFutebol.id).catch(() => {});
      }
      else if (screenId === 'historico') {
        Historico.render();
        if (Storage.currentFutebol) Storage.reconcileActiveState(Storage.currentFutebol.id).catch(() => {});
      }
      else if (screenId === 'configuracoes') Configuracoes.render();
    } catch (err) {
      console.error(`[App] Erro ao renderizar tela ${screenId}:`, err);
    }
  },

  renderDashboard() {
    const players = Storage.getPlayers();
    const teams = Storage.getTeams();
    const currentRound = Storage.getCurrentRound();
    const matches = Storage.getMatches() || [];
    let roundMatches = [];
    if (currentRound) {
      roundMatches = matches.filter(m => m.roundId === currentRound.id);
      if (roundMatches.length === 0 && currentRound.status !== 'FINISHED') {
        const legacyMatches = matches.filter(m => !m.roundId && m.dateKey === currentRound.dateKey);
        if (legacyMatches.length > 0) roundMatches = legacyMatches;
      }
    }

    let todayGoals = 0;
    roundMatches.forEach(m => {
      todayGoals += ((Number(m.homeScore) || 0) + (Number(m.awayScore) || 0));
    });

    const standings = Tabela.calcularTabelaRodada();
    const leader = (standings.length > 0 && standings[0].j > 0) ? standings[0].name : 'Nenhum jogo';

    const artilharia = Rankings.getArtilhariaData();
    const topScorerText = artilharia.length > 0 ? `${artilharia[0].name} (${artilharia[0].goals} gols)` : 'Nenhum gol';

    const capaList = Rankings.getCapaData();
    const topCapaText = capaList.length > 0 ? `${capaList[0].name} (${capaList[0].capas} ${capaList[0].capas === 1 ? 'Capa' : 'Capas'})` : 'Nenhuma Capa';

    const pEl = document.getElementById('dash-stat-players');
    const mEl = document.getElementById('dash-stat-matches-today');
    const gEl = document.getElementById('dash-stat-goals-today');
    const lEl = document.getElementById('dash-stat-leader');
    const sEl = document.getElementById('dash-stat-top-scorer');
    const cEl = document.getElementById('dash-stat-top-capa');

    if (pEl) pEl.textContent = players.length;
    if (mEl) mEl.textContent = roundMatches.length;
    if (gEl) gEl.textContent = todayGoals;
    if (lEl) lEl.textContent = leader;
    if (sEl) sEl.textContent = topScorerText;
    if (cEl) cEl.textContent = topCapaText;

    // Partida ao vivo dominante no Dashboard
    const liveBox = document.getElementById('dash-live-match-box');
    const liveMatch = Storage.getCurrentMatch();
    if (liveBox) {
      if (liveMatch && (liveMatch.status === 'running' || liveMatch.status === 'paused' || liveMatch.isActive)) {
        const isPaused = liveMatch.status === 'paused';
        const statusText = isPaused ? 'PAUSADO' : 'EM ANDAMENTO';
        const badgeClass = isPaused ? 'status-paused' : 'status-live';
        const formattedTimer = Utils.formatSeconds(liveMatch.remainingSeconds || 0);

        liveBox.style.display = 'block';
        liveBox.innerHTML = `
          <div class="dash-live-card">
            <div class="dash-live-head">
              <div class="dash-live-tag">
                <span class="live-dot-pulse"></span>
                <span>PARTIDA AO VIVO</span>
              </div>
              <span class="badge ${badgeClass}">${statusText}</span>
            </div>
            <div class="dash-live-matchup">
              <div class="dash-live-team left">
                <span class="dash-live-name">${liveMatch.homeTeamName || 'TIME 1'}</span>
              </div>
              <div class="dash-live-score-wrap">
                <span class="dash-live-score">${liveMatch.homeScore || 0}</span>
                <span class="dash-live-sep">—</span>
                <span class="dash-live-score">${liveMatch.awayScore || 0}</span>
              </div>
              <div class="dash-live-team right">
                <span class="dash-live-name">${liveMatch.awayTeamName || 'TIME 2'}</span>
              </div>
            </div>
            <div class="dash-live-foot">
              <span class="dash-live-timer">${formattedTimer}</span>
              <button type="button" class="btn btn-primary btn-sm" id="btn-dash-control-live">
                <span>CONTROLAR PARTIDA</span>
              </button>
            </div>
          </div>
        `;
        const btnCtrl = document.getElementById('btn-dash-control-live');
        if (btnCtrl) {
          btnCtrl.onclick = () => this.navigateTo('partida');
        }
      } else {
        liveBox.style.display = 'none';
        liveBox.innerHTML = '';
      }
    }

    // Resumo da Classificação no Dashboard
    const standingsBody = document.getElementById('dash-standings-body');
    if (standingsBody) {
      if (standings && standings.length > 0) {
        standingsBody.innerHTML = `
          <div class="table-responsive" style="overflow-x: auto;">
            <table class="tabela-standings" style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); text-align: left;">
                  <th style="padding: 6px 8px;">POS</th>
                  <th style="padding: 6px 8px;">TIME</th>
                  <th style="padding: 6px 8px; text-align: center;">J</th>
                  <th style="padding: 6px 8px; text-align: center;">V</th>
                  <th style="padding: 6px 8px; text-align: center;">E</th>
                  <th style="padding: 6px 8px; text-align: center;">D</th>
                  <th style="padding: 6px 8px; text-align: center;">SG</th>
                  <th style="padding: 6px 8px; text-align: center;">PTS</th>
                </tr>
              </thead>
              <tbody>
                ${standings.map((t, idx) => `
                  <tr style="border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.04));">
                    <td style="padding: 6px 8px;"><strong>${idx + 1}º</strong></td>
                    <td style="padding: 6px 8px;"><strong>${t.name}</strong></td>
                    <td style="padding: 6px 8px; text-align: center;">${t.j}</td>
                    <td style="padding: 6px 8px; text-align: center;">${t.v}</td>
                    <td style="padding: 6px 8px; text-align: center;">${t.e}</td>
                    <td style="padding: 6px 8px; text-align: center;">${t.d}</td>
                    <td style="padding: 6px 8px; text-align: center;">${t.sg > 0 ? `+${t.sg}` : t.sg}</td>
                    <td style="padding: 6px 8px; text-align: center;"><strong>${t.pts}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        standingsBody.innerHTML = `
          <p class="text-muted" style="font-size: 0.85rem; margin: 0; padding: 0.5rem 0;">Nenhuma partida realizada hoje.</p>
        `;
      }
    }

    const roundDateTag = document.getElementById('dash-round-date-tag');
    const roundStatusLabel = document.getElementById('dash-round-status-label');
    const roundBody = document.getElementById('dash-round-body');

    if (roundDateTag) {
      roundDateTag.textContent = currentRound ? (currentRound.dateFormatted || currentRound.date) : Utils.formatDate(new Date());
    }

    const round = Storage.getCurrentRound();
    if (roundStatusLabel) {
      if (round && round.status === 'FINISHED') {
        roundStatusLabel.textContent = 'NOITE ENCERRADA';
        roundStatusLabel.className = 'badge status-finished';
      } else if (round && round.status === 'ACTIVE') {
        roundStatusLabel.textContent = 'NOITE EM ANDAMENTO';
        roundStatusLabel.className = 'badge status-live';
      } else if (round && round.status === 'READY') {
        roundStatusLabel.textContent = 'PROGRAMAÇÃO PRONTA';
        roundStatusLabel.className = 'badge status-success';
      } else if (teams) {
        roundStatusLabel.textContent = 'PROGRAMAÇÃO PENDENTE';
        roundStatusLabel.className = 'badge status-warning';
      } else {
        const selectedIds = Storage.getSelectedPlayerIds();
        if (selectedIds.length === 20) {
          roundStatusLabel.textContent = 'PRONTO PARA O SORTEIO';
          roundStatusLabel.className = 'badge status-warning';
        } else {
          roundStatusLabel.textContent = 'RODADA NÃO CONFIGURADA';
          roundStatusLabel.className = 'badge';
        }
      }
    }

    if (roundBody) {
      const selectedIds = Storage.getSelectedPlayerIds();
      const count = selectedIds.length;

      if (teams) {
        const drawInfo = Storage.getDrawInfo();
        const diff = drawInfo ? `${drawInfo.difference} estrelas` : '0 estrelas';
        roundBody.innerHTML = `
          <div class="dash-round-info-ready">
            <div class="dash-round-stat-item">
              <span class="drs-val highlight">20</span>
              <span class="drs-lbl">Atletas Selecionados</span>
            </div>
            <div class="dash-round-stat-item">
              <span class="drs-val">4</span>
              <span class="drs-lbl">Times Formados</span>
            </div>
            <div class="dash-round-stat-item">
              <span class="drs-val">${roundMatches.length}</span>
              <span class="drs-lbl">Partidas na Rodada</span>
            </div>
            <div class="dash-round-stat-item">
              <span class="drs-val">${todayGoals}</span>
              <span class="drs-lbl">Gols na Rodada</span>
            </div>
          </div>
          <div class="dash-round-actions admin-only" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-dash-ver-times">
              Ver Times da Rodada (${diff})
            </button>
          </div>
        `;

        const btnVer = document.getElementById('btn-dash-ver-times');
        if (btnVer) {
          btnVer.onclick = () => this.navigateTo('sorteio');
        }
      } else if (count === 20) {
        roundBody.innerHTML = `
          <div class="round-status-box">
            <p class="round-status-text"><strong>20 jogadores selecionados</strong> para esta rodada. Pronto para realizar o sorteio equilibrado.</p>
            <button type="button" class="btn btn-primary btn-dash-sorteio admin-only" id="btn-dash-sortear-pronto">
              <span class="btn-icon-wrap" aria-hidden="true">${Utils.icon('shuffle', 22)}</span>
              <span class="btn-label">REALIZAR SORTEIO DOS TIMES</span>
            </button>
          </div>
        `;
        const btnSort = document.getElementById('btn-dash-sortear-pronto');
        if (btnSort) {
          btnSort.onclick = () => this.navigateTo('sorteio');
        }
      } else if (count > 0) {
        roundBody.innerHTML = `
          <div class="round-status-box">
            <p class="round-status-text"><strong>${count} de 20 jogadores selecionados</strong> para a rodada.</p>
            <button type="button" class="btn btn-secondary admin-only" id="btn-dash-continuar-selecao">
              Continuar Seleção (${count}/20)
            </button>
          </div>
        `;
        const btnCont = document.getElementById('btn-dash-continuar-selecao');
        if (btnCont) {
          btnCont.onclick = () => this.navigateTo('sorteio');
        }
      } else {
        roundBody.innerHTML = `
          <div class="round-status-box">
            <p class="round-empty-text">Rodada ainda não configurada para este futebol.</p>
            <button type="button" class="btn btn-primary admin-only" id="btn-dash-selecionar-jogadores">
              SELECIONAR 20 JOGADORES
            </button>
          </div>
        `;

        const btnSel = document.getElementById('btn-dash-selecionar-jogadores');
        if (btnSel) {
          btnSel.onclick = () => {
            if (players.length < 20) {
              const missing = 20 - players.length;
              Utils.toast(`Cadastre pelo menos 20 jogadores no sistema. Faltam ${missing}.`, 'warning');
              this.navigateTo('jogadores');
            } else {
              this.navigateTo('sorteio');
            }
          };
        }
      }
    }
  },

  refreshAll() {
    this.renderDashboard();
    Jogadores.render();
    Sorteio.render();
    Programacao.render();
    Partidas.render();
    Tabela.render();
    Rankings.render();
    Historico.render();
    Configuracoes.render();
  }
};

function bootstrapApp() {
  if (typeof window !== 'undefined') {
    if (window.__app_initialized) return;
    window.__app_initialized = true;
  }
  App.init();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
  } else {
    bootstrapApp();
  }
}
