/**
 * Storage Layer - Familia do Fut Multi-Tenant
 * Abstração de persistência dos dados conectada ao Supabase com controle RLS
 * e isolamento estrito entre múltiplos futebóis independentes.
 */

import { supabase } from './supabaseClient.js';
import { Utils } from './utils.js';

const _memoryStore = {
  _data: {},
  getItem(k) { return this._data[k] || null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; }
};

function getStorage() {
  if (typeof localStorage !== 'undefined') return localStorage;
  if (typeof global !== 'undefined' && global.localStorage) return global.localStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return _memoryStore;
}

const store = {
  getItem: (k) => getStorage().getItem(k),
  setItem: (k, v) => getStorage().setItem(k, v),
  removeItem: (k) => getStorage().removeItem(k),
  clear: () => getStorage().clear()
};

const STORAGE_KEYS = {
  CURRENT_FUTEBOL: 'familia_fut_active_futebol',
  USER_ROLE: 'familia_fut_user_role', // 'ADMIN' ou 'PUBLIC_VIEWER'
  LIVE_MATCH: 'partida_ao_vivo'
};

const DEFAULT_COLORS = {
  time_1: '#2563eb', // Azul
  time_2: '#dc2626', // Vermelho
  time_3: '#16a34a', // Verde
  time_4: '#eab308'  // Amarelo
};

export const Storage = {
  currentFutebol: null, // { id, codigo_publico, nome, admin_id }
  userRole: null, // 'ADMIN' | 'PUBLIC_VIEWER'
  realtimeSubscription: null,
  _store: store,

  async init() {
    await this.restoreSession();
  },

  async restoreSession() {
    try {
      // 1. Diagnóstico e verificação de usuário autenticado no Supabase
      let authUser = null;
      try {
        if (supabase && supabase.auth) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user) {
            authUser = sessionData.session.user;
          } else {
            const { data: userData } = await supabase.auth.getUser();
            authUser = userData?.user || null;
          }
        }
      } catch (authErr) {
        console.warn('[Storage] Erro ao consultar Supabase auth na restauração:', authErr);
      }

      if (authUser) {
        console.log(`[FutRaiz][AUTH] userId: ${authUser.id}`);
      }

      // 2. Restaura futebol ativo da preferência local ou busca do Supabase
      const savedFut = store.getItem(STORAGE_KEYS.CURRENT_FUTEBOL);
      if (savedFut) {
        try {
          this.currentFutebol = JSON.parse(savedFut);
        } catch {
          this.currentFutebol = null;
        }
      }
      this.userRole = store.getItem(STORAGE_KEYS.USER_ROLE) || (authUser ? 'ADMIN' : 'PUBLIC_VIEWER');

      // Se autenticado mas sem futebol salvo no localStorage (ex: primeiro acesso no computador)
      if (authUser && !this.currentFutebol) {
        try {
          const { data: adminLinks } = await supabase
            .from('futebol_admins')
            .select('*')
            .eq('user_id', authUser.id);

          if (adminLinks && adminLinks.length > 0) {
            const { data: fut } = await supabase
              .from('futebois')
              .select('*')
              .eq('id', adminLinks[0].futebol_id)
              .single();
            if (fut) {
              this.currentFutebol = fut;
              this.userRole = 'ADMIN';
              store.setItem(STORAGE_KEYS.CURRENT_FUTEBOL, JSON.stringify(fut));
              store.setItem(STORAGE_KEYS.USER_ROLE, 'ADMIN');
            }
          } else {
            const { data: futs } = await supabase
              .from('futebois')
              .select('*')
              .eq('admin_id', authUser.id)
              .order('created_at', { ascending: false })
              .limit(1);
            const foundFut = Array.isArray(futs) ? futs[0] : futs;
            if (foundFut) {
              this.currentFutebol = foundFut;
              this.userRole = 'ADMIN';
              store.setItem(STORAGE_KEYS.CURRENT_FUTEBOL, JSON.stringify(foundFut));
              store.setItem(STORAGE_KEYS.USER_ROLE, 'ADMIN');
            }
          }
        } catch (findErr) {
          console.warn('[Storage] Erro ao recuperar futebol do administrador:', findErr);
        }
      }

      // 3. Se temos futebol ativo, conecta realtime e sincroniza dados oficiais do Supabase
      if (this.currentFutebol) {
        console.log(`[FutRaiz][FUTEBOL] futebolId: ${this.currentFutebol.id}`);
        this.setupRealtime(this.currentFutebol.id);
        await this.reconcileActiveState(this.currentFutebol.id);
      }
    } catch (e) {
      console.warn('Erro ao restaurar sessão de futebol:', e);
      this.currentFutebol = null;
      this.userRole = null;
    }
  },

  // Retorna a chave de armazenamento isolada para o futebol atual (ou futebol especificado)
  _getScopedKey(suffix, targetFutId = null) {
    const futId = targetFutId || (this.currentFutebol ? this.currentFutebol.id : 'global');
    return `fut_${futId}_${suffix}`;
  },

  // Validação estrita de permissão (segurança no frontend + RLS no backend)
  assertAdmin(actionName = 'Esta operação') {
    if (this.userRole !== 'ADMIN') {
      const err = new Error(`Permissão Negada: Usuário público em modo somente leitura não pode executar: ${actionName}`);
      console.error(err.message);
      throw err;
    }
  },

  isPublicViewer() {
    return this.userRole === 'PUBLIC_VIEWER';
  },

  isAdmin() {
    return this.userRole === 'ADMIN';
  },

  _formatAuthError(error) {
    if (!error) return 'Erro desconhecido de autenticação.';
    const msg = error.message || String(error);
    const lower = msg.toLowerCase();
    if (lower.includes('rate limit') || lower.includes('over_email_send_rate_limit')) {
      return 'Limite temporário de envio de e-mails atingido. Aguarde alguns minutos e tente novamente.';
    }
    if (lower.includes('invalid login credentials')) {
      return 'E-mail ou senha incorretos.';
    }
    if (lower.includes('email not confirmed')) {
      return 'Confirmação de e-mail pendente. Verifique sua caixa de entrada e clique no link para ativar sua conta.';
    }
    if (lower.includes('user already registered') || lower.includes('already registered') || lower.includes('já cadastrado')) {
      return 'Este e-mail já está cadastrado. Faça login ou utilize outra conta.';
    }
    return msg;
  },

  // Gera código público exclusivo no padrão FDT-XXXX
  generatePublicCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `FDT-${code}`;
  },

  // Normaliza o código público informado pelo usuário
  // Suporta: "fdt-7k29", " FDT-7K29 ", "7k29", "FDT 7K29", "FDT-7K29", etc.
  normalizePublicCode(rawCode) {
    if (!rawCode || typeof rawCode !== 'string') return '';
    let code = rawCode.trim().toUpperCase();
    // Substitui múltiplos espaços ou hífens com espaços (ex: "FDT - 7K29", "FDT 7K29" -> "FDT-7K29")
    code = code.replace(/\s*-\s*/g, '-').replace(/\s+/g, '-');
    // Se digitou apenas o sufixo alfanumérico de 4 caracteres (ex: "7K29"), inclui o prefixo "FDT-"
    if (/^[A-Z0-9]{4}$/.test(code)) {
      code = `FDT-${code}`;
    }
    // Se digitou sem hífen (ex: "FDT7K29"), insere o hífen
    if (/^FDT[A-Z0-9]{4}$/.test(code)) {
      code = `FDT-${code.slice(3)}`;
    }
    return code;
  },

  // ============================================================================
  // MULTI-FUTEBOL: CRIAÇÃO, ACESSO E AUTENTICAÇÃO
  // ============================================================================

  /**
   * Cria um novo futebol independente com administrador vinculado
   */
  async createFutebol({ nome, adminNome, email, password }) {
    try {
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanPassword = password || '';
      const cleanNome = (nome || '').trim();
      const cleanAdminNome = (adminNome || '').trim();

      if (!cleanEmail || !cleanPassword) {
        return { success: false, error: 'E-mail e senha são obrigatórios.' };
      }
      if (!cleanNome) {
        return { success: false, error: 'Nome do futebol é obrigatório.' };
      }
      if (cleanPassword.length < 6) {
        return { success: false, error: 'A senha deve conter no mínimo 6 caracteres.' };
      }

      // 1. Cria usuário no Supabase Auth (uma única tentativa controlada)
      let authUser = null;
      let authSession = null;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: { name: cleanAdminNome }
        }
      });

      if (signUpError) {
        const errorMsg = (signUpError.message || '').toLowerCase();
        // Tratamento amigável para rate limit de e-mails do Supabase Auth
        if (errorMsg.includes('rate limit') || errorMsg.includes('over_email_send_rate_limit')) {
          return {
            success: false,
            error: 'Limite temporário de envio de e-mails atingido. Aguarde alguns minutos e tente novamente.'
          };
        }

        // Se o usuário já existir no Supabase Auth (ex: tentativa anterior antes do futebol ser criado),
        // tenta autenticar diretamente com as credenciais informadas para obter a sessão
        if (errorMsg.includes('already registered') || errorMsg.includes('user already exists') || errorMsg.includes('já cadastrado')) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPassword
          });

          if (signInError) {
            return {
              success: false,
              error: this._formatAuthError(signInError)
            };
          }

          authUser = signInData?.user;
          authSession = signInData?.session;
        } else {
          return {
            success: false,
            error: this._formatAuthError(signUpError)
          };
        }
      } else {
        authUser = signUpData?.user;
        authSession = signUpData?.session;
      }

      // 2. VERIFICAÇÃO RIGOROSA DO ESTADO DA SESSÃO
      // Não presuma que signUp() sempre cria uma sessão ativa.
      if (!authSession) {
        const { data: sessionData } = await supabase.auth.getSession();
        authSession = sessionData?.session;
      }

      // Se ainda não temos sessão ativa no client, tenta signInWithPassword
      if (!authSession) {
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword
        });

        if (!signInErr && signInData?.session) {
          authSession = signInData.session;
          authUser = signInData.user || authUser;
        }
      }

      // Se ainda assim não houver sessão ativa autenticada:
      // O Supabase exige confirmação de e-mail antes de autenticar.
      // NÃO tentamos fazer INSERT como anon!
      if (!authSession) {
        return {
          success: false,
          needsEmailConfirmation: true,
          error: 'Conta criada! Confirmação de e-mail necessária. Verifique sua caixa de entrada para ativar sua conta antes de criar o futebol.'
        };
      }

      // 3. Obtém o usuário e auth.uid() autenticado
      const { data: userData } = await supabase.auth.getUser();
      const currentAuthUser = userData?.user || authSession.user || authUser;
      const authUid = currentAuthUser?.id;

      if (!authUid) {
        return {
          success: false,
          error: 'Sessão autenticada inválida: identificador de usuário não encontrado.'
        };
      }

      // 4. Se o usuário já possui um futebol associado, recupera a sessão do futebol existente
      const { data: existingAdminLinks } = await supabase
        .from('futebol_admins')
        .select('*')
        .eq('user_id', authUid);

      if (existingAdminLinks && existingAdminLinks.length > 0) {
        const existingFutId = existingAdminLinks[0].futebol_id;
        const { data: existingFut } = await supabase
          .from('futebois')
          .select('*')
          .eq('id', existingFutId)
          .single();

        if (existingFut) {
          this.currentFutebol = existingFut;
          this.userRole = 'ADMIN';
          store.setItem(STORAGE_KEYS.CURRENT_FUTEBOL, JSON.stringify(existingFut));
          store.setItem(STORAGE_KEYS.USER_ROLE, 'ADMIN');
          this.setupRealtime(existingFut.id);
          this._emitChange('futebolCreated', existingFut);
          return { success: true, futebol: existingFut, alreadyExisted: true };
        }
      }

      // 5. Gera código público exclusivo (ex: FDT-7K29)
      const codigoPublico = this.generatePublicCode();

      // 6. Registra o futebol no Supabase como USUÁRIO AUTENTICADO
      // O PostgreSQL/Supabase gera o id UUID automaticamente através do DEFAULT gen_random_uuid().
      // admin_id = authUid (satisfaz a política RLS: auth.uid() = admin_id)
      const insertPayload = {
        codigo_publico: codigoPublico,
        nome: cleanNome,
        admin_id: authUid,
        default_match_duration_seconds: 420,
        historico_inicial_aberto: true,
        created_at: new Date().toISOString()
      };

      const { data: futData, error: futError } = await supabase
        .from('futebois')
        .insert([insertPayload])
        .select()
        .single();

      if (futError) throw new Error(futError.message);

      let futebolRecord = futData;
      if (!futebolRecord || !futebolRecord.id) {
        // Fallback por código público caso a inserção não tenha retornado o registro
        const { data: fetched } = await supabase
          .from('futebois')
          .select('*')
          .eq('codigo_publico', codigoPublico)
          .single();
        futebolRecord = fetched;
      }

      if (!futebolRecord || !futebolRecord.id) {
        throw new Error('Não foi possível obter o identificador UUID do futebol criado.');
      }

      if (!futebolRecord.default_match_duration_seconds) {
        futebolRecord.default_match_duration_seconds = 420;
      }

      // 7. Vincula na tabela de administradores do futebol usando o UUID retornado
      // user_id = authUid (satisfaz a política RLS: auth.uid() = user_id)
      const adminLink = {
        futebol_id: futebolRecord.id,
        user_id: authUid,
        role: 'admin',
        created_at: new Date().toISOString()
      };

      const { error: adminLinkError } = await supabase.from('futebol_admins').insert([adminLink]);
      if (adminLinkError) throw new Error(adminLinkError.message);

      // 8. Define sessão ativa como Administrador
      this.currentFutebol = futebolRecord;
      this.userRole = 'ADMIN';
      store.setItem(STORAGE_KEYS.CURRENT_FUTEBOL, JSON.stringify(futebolRecord));
      store.setItem(STORAGE_KEYS.USER_ROLE, 'ADMIN');

      this.setupRealtime(futebolRecord.id);
      this._emitChange('futebolCreated', futebolRecord);
      return { success: true, futebol: futebolRecord };
    } catch (err) {
      console.error('Erro ao criar futebol:', err);
      return { success: false, error: err.message };
    }
  },

  getDefaultMatchDurationMinutes() {
    if (this.currentFutebol && this.currentFutebol.default_match_duration_seconds) {
      return Math.floor(this.currentFutebol.default_match_duration_seconds / 60);
    }
    return 7;
  },

  getDefaultMatchDurationSeconds() {
    if (this.currentFutebol && this.currentFutebol.default_match_duration_seconds) {
      return this.currentFutebol.default_match_duration_seconds;
    }
    return 420;
  },

  async updateFutebolSettings({ nome, default_match_duration_seconds }) {
    this.assertAdmin('Atualizar configurações do futebol');
    if (!this.currentFutebol) throw new Error('Nenhum futebol ativo.');

    const updatedFut = { ...this.currentFutebol };
    if (nome && nome.trim()) updatedFut.nome = nome.trim();
    if (default_match_duration_seconds !== undefined) {
      updatedFut.default_match_duration_seconds = parseInt(default_match_duration_seconds, 10) || 420;
    }

    this.currentFutebol = updatedFut;
    store.setItem(STORAGE_KEYS.CURRENT_FUTEBOL, JSON.stringify(updatedFut));

    // Sincroniza com Supabase
    try {
      await supabase.from('futebois').update({
        nome: updatedFut.nome,
        default_match_duration_seconds: updatedFut.default_match_duration_seconds
      }).eq('id', updatedFut.id);
    } catch (e) {
      console.warn('Sync futebol settings error:', e);
    }

    this._emitChange('futebolUpdated', updatedFut);
    return { success: true, futebol: updatedFut };
  },

  /**
   * Login do Administrador
   */
  async loginAdmin(credentials, maybePassword) {
    try {
      const email = (typeof credentials === 'object' && credentials !== null) ? credentials.email : credentials;
      const password = (typeof credentials === 'object' && credentials !== null) ? credentials.password : maybePassword;
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: (email || '').trim(),
        password
      });

      if (authError) throw new Error(this._formatAuthError(authError));

      const user = authData.user;
      console.log(`[FutRaiz][AUTH] userId: ${user.id}`);

      // Busca futebóis onde o usuário é administrador
      const { data: adminLinks } = await supabase
        .from('futebol_admins')
        .select('*')
        .eq('user_id', user.id);

      let targetFutebol = null;
      if (adminLinks && adminLinks.length > 0) {
        const futId = adminLinks[0].futebol_id;
        const { data: fut } = await supabase
          .from('futebois')
          .select('*')
          .eq('id', futId)
          .single();
        targetFutebol = fut;
      }

      if (!targetFutebol) {
        // Fallback por admin_id direto (ordenando pelo mais recente)
        const { data: futs } = await supabase
          .from('futebois')
          .select('*')
          .eq('admin_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        targetFutebol = Array.isArray(futs) ? futs[0] : futs;
      }

      if (!targetFutebol) {
        throw new Error('Nenhum futebol associado a este usuário administrador.');
      }

      console.log(`[FutRaiz][FUTEBOL] futebolId: ${targetFutebol.id}`);

      // Garante que o vínculo em futebol_admins exista no Supabase para satisfazer políticas RLS
      try {
        await supabase.from('futebol_admins').upsert({
          futebol_id: targetFutebol.id,
          user_id: user.id,
          role: 'admin'
        }, { onConflict: 'futebol_id,user_id' });
      } catch (linkErr) {
        console.warn('[Storage] Aviso ao assegurar adminLink:', linkErr);
      }

      this.currentFutebol = targetFutebol;
      this.userRole = 'ADMIN';
      store.setItem(STORAGE_KEYS.CURRENT_FUTEBOL, JSON.stringify(targetFutebol));
      store.setItem(STORAGE_KEYS.USER_ROLE, 'ADMIN');

      this.setupRealtime(targetFutebol.id);
      await this.reconcileActiveState(targetFutebol.id);
      this._emitChange('authChanged', targetFutebol);
      return { success: true, futebol: targetFutebol };
    } catch (err) {
      console.error('[FutRaiz][AUTH] Erro no login:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Acesso Público (Somente Leitura) via ID/Código Público
   */
  async loadPublicFutebol(codigoPublico) {
    try {
      const cleanCode = this.normalizePublicCode(codigoPublico);
      if (!cleanCode) {
        return { success: false, error: 'Futebol não encontrado. Verifique o código e tente novamente.' };
      }

      const { data: futebol, error } = await supabase
        .from('futebois')
        .select('*')
        .eq('codigo_publico', cleanCode)
        .single();

      if (error || !futebol) {
        return { success: false, error: 'Futebol não encontrado. Verifique o código e tente novamente.' };
      }

      // Desconecta auth de admin caso estivesse em outro
      try {
        await supabase.auth.signOut();
      } catch {}

      this.currentFutebol = futebol;
      this.userRole = 'PUBLIC_VIEWER';
      store.setItem(STORAGE_KEYS.CURRENT_FUTEBOL, JSON.stringify(futebol));
      store.setItem(STORAGE_KEYS.USER_ROLE, 'PUBLIC_VIEWER');

      this.setupRealtime(futebol.id);
      await this.reconcileActiveState(futebol.id);
      this._emitChange('publicFutebolLoaded', futebol);
      return { success: true, futebol };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async logout() {
    if (this.realtimeSubscription) {
      try {
        if (supabase && typeof supabase.removeChannel === 'function') {
          supabase.removeChannel(this.realtimeSubscription);
        }
      } catch {}
      this.realtimeSubscription = null;
    }
    try {
      await supabase.auth.signOut();
    } catch {}
    this.currentFutebol = null;
    this.userRole = null;
    store.removeItem(STORAGE_KEYS.CURRENT_FUTEBOL);
    store.removeItem(STORAGE_KEYS.USER_ROLE);
    this._emitChange('logout', null);
  },

  async syncMatchFromSupabase(dbMatch) {
    if (!dbMatch) return;
    const matches = this.getMatches();
    const existingIdx = matches.findIndex(m => m.id === dbMatch.id);
    const localMatch = {
      id: dbMatch.id,
      roundId: dbMatch.rodada_id,
      homeTeamId: dbMatch.time_casa_id,
      awayTeamId: dbMatch.time_fora_id,
      homeTeamName: dbMatch.time_casa_nome,
      awayTeamName: dbMatch.time_fora_nome,
      homeScore: dbMatch.placar_casa,
      awayScore: dbMatch.placar_fora,
      status: dbMatch.status || 'finalizada',
      isTie: dbMatch.placar_casa === dbMatch.placar_fora,
      winner: dbMatch.placar_casa > dbMatch.placar_fora ? dbMatch.time_casa_id : (dbMatch.placar_fora > dbMatch.placar_casa ? dbMatch.time_fora_id : null),
      loser: dbMatch.placar_casa > dbMatch.placar_fora ? dbMatch.time_fora_id : (dbMatch.placar_fora > dbMatch.placar_casa ? dbMatch.time_casa_id : null),
      dateKey: Utils.getDateKey(new Date(dbMatch.created_at || Date.now())),
      createdAt: dbMatch.created_at || new Date().toISOString()
    };

    if (existingIdx !== -1) {
      matches[existingIdx] = { ...matches[existingIdx], ...localMatch };
    } else {
      matches.unshift(localMatch);
    }
    const key = this._getScopedKey('matches');
    store.setItem(key, JSON.stringify(matches));
  },

  async syncMatchesFromSupabase(futebolId) {
    if (!futebolId) return;
    try {
      const { data: dbMatches } = await supabase
        .from('partidas')
        .select('*')
        .eq('futebol_id', futebolId)
        .order('created_at', { ascending: false });

      if (dbMatches && Array.isArray(dbMatches)) {
        const matches = this.getMatches();
        dbMatches.forEach(dbMatch => {
          const exists = matches.some(m => m.id === dbMatch.id || (m.homeTeamId === dbMatch.time_casa_id && m.awayTeamId === dbMatch.time_fora_id && m.homeScore === dbMatch.placar_casa && m.awayScore === dbMatch.placar_fora));
          if (!exists) {
            matches.push({
              id: dbMatch.id,
              roundId: dbMatch.rodada_id,
              homeTeamId: dbMatch.time_casa_id,
              awayTeamId: dbMatch.time_fora_id,
              homeTeamName: dbMatch.time_casa_nome,
              awayTeamName: dbMatch.time_fora_nome,
              homeScore: dbMatch.placar_casa,
              awayScore: dbMatch.placar_fora,
              status: dbMatch.status || 'finalizada',
              isTie: dbMatch.placar_casa === dbMatch.placar_fora,
              winner: dbMatch.placar_casa > dbMatch.placar_fora ? dbMatch.time_casa_id : (dbMatch.placar_fora > dbMatch.placar_casa ? dbMatch.time_fora_id : null),
              loser: dbMatch.placar_casa > dbMatch.placar_fora ? dbMatch.time_fora_id : (dbMatch.placar_fora > dbMatch.placar_casa ? dbMatch.time_casa_id : null),
              dateKey: Utils.getDateKey(new Date(dbMatch.created_at || Date.now())),
              createdAt: dbMatch.created_at || new Date().toISOString()
            });
          }
        });
        const key = this._getScopedKey('matches');
        matches.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        store.setItem(key, JSON.stringify(matches));
      }
    } catch (err) {
      console.warn('Sync matches error:', err);
    }
  },

  async syncRoundsFromSupabase(futebolId) {
    if (!futebolId) return;
    try {
      const { data: dbRounds } = await supabase
        .from('rodadas')
        .select('*')
        .eq('futebol_id', futebolId)
        .order('created_at', { ascending: false });

      if (dbRounds && Array.isArray(dbRounds)) {
        const rounds = this.getRounds();
        dbRounds.forEach(dr => {
          const existingIdx = rounds.findIndex(r => r.id === dr.id);
          const roundObj = {
            id: dr.id,
            futebolId: dr.futebol_id,
            numero: dr.numero,
            date: dr.data ? Utils.formatDate(new Date(dr.data + 'T12:00:00')) : '',
            dateKey: dr.data,
            status: dr.status,
            campeaoTimeId: dr.campeao_time_id,
            campeaoTimeNome: dr.campeao_time_nome,
            programacao: dr.programacao,
            standingsSnapshot: dr.standings_snapshot || null,
            teams: dr.teams || null,
            selectedPlayerIds: dr.selected_player_ids || [],
            selectedPlayers: dr.selected_players || [],
            drawInfo: dr.draw_info || null,
            createdAt: dr.created_at
          };
          if (existingIdx >= 0) {
            rounds[existingIdx] = { ...rounds[existingIdx], ...roundObj };
          } else {
            rounds.push(roundObj);
          }
        });
        const key = this._getScopedKey('rounds');
        store.setItem(key, JSON.stringify(rounds || []));
        this._emitChange('rounds', rounds);

        // Se houver rodada ATIVA ou PRONTA, define como current_round
        const activeDbRound = dbRounds.find(r => r.status === 'ACTIVE' || r.status === 'READY');
        if (activeDbRound) {
          const fullRound = rounds.find(r => r.id === activeDbRound.id);
          if (fullRound) {
            store.setItem(this._getScopedKey('current_round'), JSON.stringify(fullRound));
            if (fullRound.teams) {
              const currentPlayers = this.getPlayers(futebolId);
              const pMap = {};
              currentPlayers.forEach(cp => { pMap[cp.id] = cp.stars; });
              Object.values(fullRound.teams).forEach(t => {
                if (t && Array.isArray(t.players)) {
                  t.players.forEach(tp => {
                    if (pMap[tp.id] !== undefined) tp.stars = pMap[tp.id];
                  });
                }
              });
              store.setItem(this._getScopedKey('teams'), JSON.stringify(fullRound.teams));
              this._emitChange('teams', fullRound.teams);
            }
            if (fullRound.drawInfo) {
              store.setItem(this._getScopedKey('draw_info'), JSON.stringify(fullRound.drawInfo));
            }
            if (fullRound.selectedPlayers && fullRound.selectedPlayers.length > 0) {
              store.setItem(this._getScopedKey('selected_players'), JSON.stringify(fullRound.selectedPlayers));
            }
            this._emitChange('currentRound', fullRound);
          }
        }
      }
    } catch (err) {
      console.warn('[Storage] Erro ao sincronizar rodadas do Supabase:', err);
    }
  },

  async syncStandingsSnapshotsFromSupabase(futebolId) {
    if (!futebolId) return;
    try {
      const { data: dbSnapshots } = await supabase
        .from('rodada_classificacao')
        .select('*')
        .eq('futebol_id', futebolId)
        .order('posicao', { ascending: true });

      if (dbSnapshots && Array.isArray(dbSnapshots) && dbSnapshots.length > 0) {
        const grouped = {};
        dbSnapshots.forEach(row => {
          if (!grouped[row.rodada_id]) grouped[row.rodada_id] = [];
          grouped[row.rodada_id].push({
            id: row.time_id,
            name: row.time_nome || (row.time_id === 'time_1' ? 'Time 1' : row.time_id === 'time_2' ? 'Time 2' : row.time_id === 'time_3' ? 'Time 3' : 'Time 4'),
            j: row.jogos || 0,
            v: row.vitorias || 0,
            e: row.empates || 0,
            d: row.derrotas || 0,
            gp: row.gols_pro || 0,
            gc: row.gols_contra || 0,
            sg: row.saldo_gols !== undefined ? row.saldo_gols : ((row.gols_pro || 0) - (row.gols_contra || 0)),
            pts: row.pontos || 0
          });
        });

        const key = this._getScopedKey('rodada_classificacao');
        let currentMap = {};
        try {
          currentMap = JSON.parse(store.getItem(key) || '{}');
        } catch { currentMap = {}; }
        Object.assign(currentMap, grouped);
        store.setItem(key, JSON.stringify(currentMap));

        // Vincula também às rodadas no histórico
        const rounds = this.getRounds();
        let changed = false;
        rounds.forEach(r => {
          if (grouped[r.id] && (!r.standingsSnapshot || r.standingsSnapshot.length === 0)) {
            r.standingsSnapshot = grouped[r.id];
            changed = true;
          }
        });
        if (changed) {
          const rKey = this._getScopedKey('rounds');
          store.setItem(rKey, JSON.stringify(rounds || []));
          this._emitChange('rounds', rounds);
        }
      }
    } catch (err) {
      console.warn('[Storage] Erro ao sincronizar snapshots de classificação:', err);
    }
  },

  async syncLiveMatchFromSupabase(futebolId) {
    if (!futebolId) return;
    try {
      let liveRow = null;
      try {
        const res = await supabase
          .from('partida_ao_vivo')
          .select('*')
          .eq('futebol_id', futebolId);
        if (res && res.data) {
          liveRow = Array.isArray(res.data) ? res.data[0] : res.data;
        }
      } catch (qErr) {
        console.warn('[Storage] Erro ao consultar partida_ao_vivo:', qErr);
      }

      if (liveRow) {
        const payloadData = (liveRow.payload && typeof liveRow.payload === 'object') ? liveRow.payload : {};
        const winnerId = liveRow.winner_team_id || payloadData.winnerTeamId || payloadData.winner_team_id || null;
        const winnerName = liveRow.winner_team_name || payloadData.winnerTeamName || payloadData.winner_team_name || null;
        const loserId = liveRow.loser_team_id || payloadData.loserTeamId || payloadData.loser_team_id || null;
        const waitingNext = Boolean(liveRow.waiting_next_opponent !== undefined ? liveRow.waiting_next_opponent : (payloadData.waitingNextOpponent !== undefined ? payloadData.waitingNextOpponent : payloadData.waiting_next_opponent));
        const waitingTie = Boolean(liveRow.waiting_tie_next_match !== undefined ? liveRow.waiting_tie_next_match : (payloadData.waitingTieNextMatch !== undefined ? payloadData.waitingTieNextMatch : payloadData.waiting_tie_next_match));

        const liveData = {
          ...payloadData,
          ...liveRow,
          winnerTeamId: winnerId,
          winner_team_id: winnerId,
          winnerTeamName: winnerName,
          winner_team_name: winnerName,
          loserTeamId: loserId,
          loser_team_id: loserId,
          waitingNextOpponent: waitingNext,
          waiting_next_opponent: waitingNext,
          waitingTieNextMatch: waitingTie,
          waiting_tie_next_match: waitingTie
        };
        this._saveLocalLiveMatch(liveData);
        this._emitChange('liveMatchUpdate', liveData);
      }
    } catch (err) {
      console.warn('[Storage] Erro ao sincronizar partida ao vivo do Supabase:', err);
    }
  },

  async reconcileActiveState(futebolId = null) {
    const futId = futebolId || (this.currentFutebol ? this.currentFutebol.id : null);
    if (!futId) return;
    try {
      await Promise.all([
        this.syncPlayersFromSupabase(futId),
        this.syncCapasFromSupabase(futId),
        this.syncMatchesFromSupabase(futId),
        this.syncRoundsFromSupabase(futId),
        this.syncStandingsSnapshotsFromSupabase(futId),
        this.syncLiveMatchFromSupabase(futId)
      ]);
    } catch (err) {
      console.warn('[Storage] Erro durante reconciliação de estado:', err);
    }
  },

  // Sincronização em tempo real via Supabase Realtime
  setupRealtime(futebolId) {
    if (!futebolId) return;
    try {
      if (this.realtimeSubscription) {
        try {
          if (supabase && typeof supabase.removeChannel === 'function') {
            supabase.removeChannel(this.realtimeSubscription);
          }
        } catch {}
        this.realtimeSubscription = null;
      }
      const channel = supabase.channel(`futebol_${futebolId}`);
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'partida_ao_vivo' }, (payload) => {
        if (payload.new && payload.new.futebol_id === futebolId) {
          const payloadData = (payload.new.payload && typeof payload.new.payload === 'object') ? payload.new.payload : {};
          const winnerId = payload.new.winner_team_id || payloadData.winnerTeamId || payloadData.winner_team_id || null;
          const winnerName = payload.new.winner_team_name || payloadData.winnerTeamName || payloadData.winner_team_name || null;
          const loserId = payload.new.loser_team_id || payloadData.loserTeamId || payloadData.loser_team_id || null;
          const waitingNext = Boolean(payload.new.waiting_next_opponent !== undefined ? payload.new.waiting_next_opponent : (payloadData.waitingNextOpponent !== undefined ? payloadData.waitingNextOpponent : payloadData.waiting_next_opponent));
          const waitingTie = Boolean(payload.new.waiting_tie_next_match !== undefined ? payload.new.waiting_tie_next_match : (payloadData.waitingTieNextMatch !== undefined ? payloadData.waitingTieNextMatch : payloadData.waiting_tie_next_match));

          const liveData = {
            ...payloadData,
            ...payload.new,
            winnerTeamId: winnerId,
            winner_team_id: winnerId,
            winnerTeamName: winnerName,
            winner_team_name: winnerName,
            loserTeamId: loserId,
            loser_team_id: loserId,
            waitingNextOpponent: waitingNext,
            waiting_next_opponent: waitingNext,
            waitingTieNextMatch: waitingTie,
            waiting_tie_next_match: waitingTie
          };
          this._saveLocalLiveMatch(liveData);
          this._emitChange('liveMatchUpdate', liveData);
        }
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'partidas' }, async (payload) => {
        if (payload?.new && payload.new.futebol_id && payload.new.futebol_id !== futebolId) return;
        if (payload && payload.new) {
          await this.syncMatchFromSupabase(payload.new);
        } else {
          await this.syncMatchesFromSupabase(futebolId);
        }
        this._emitChange('matches', this.getMatches());
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'gols' }, async (payload) => {
        if (payload?.new && payload.new.futebol_id && payload.new.futebol_id !== futebolId) return;
        await this.syncMatchesFromSupabase(futebolId);
        this._emitChange('matches', this.getMatches());
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rodadas' }, async (payload) => {
        if (payload?.new && payload.new.futebol_id && payload.new.futebol_id !== futebolId) return;
        await this.syncRoundsFromSupabase(futebolId);
        this._emitChange('rounds', this.getRounds());
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'times' }, async (payload) => {
        if (payload?.new && payload.new.futebol_id && payload.new.futebol_id !== futebolId) return;
        await this.syncRoundsFromSupabase(futebolId);
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'time_jogadores' }, async (payload) => {
        if (payload?.new && payload.new.futebol_id && payload.new.futebol_id !== futebolId) return;
        await this.syncRoundsFromSupabase(futebolId);
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'rodada_classificacao' }, async () => {
        await this.syncStandingsSnapshotsFromSupabase(futebolId);
        this._emitChange('standingsSnapshot', null);
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'jogadores' }, async (payload) => {
        if (payload?.new && payload.new.futebol_id && payload.new.futebol_id !== futebolId) return;
        await this.syncPlayersFromSupabase(futebolId);
        this._emitChange('players', this.getPlayers(futebolId));
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'capas' }, async (payload) => {
        if (payload?.new && payload.new.futebol_id && payload.new.futebol_id !== futebolId) return;
        await this.syncCapasFromSupabase(futebolId);
        this._emitChange('capas', this.getCapas());
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'futebois' }, (payload) => {
        if (payload && payload.new && payload.new.id === futebolId) {
          this.currentFutebol = { ...this.currentFutebol, ...payload.new };
          store.setItem(STORAGE_KEYS.CURRENT_FUTEBOL, JSON.stringify(this.currentFutebol));
          this._emitChange('futebolUpdated', this.currentFutebol);
        }
      });
      channel.subscribe();
      this.realtimeSubscription = channel;
    } catch (e) {
      console.warn('Realtime subscription:', e);
    }
  },

  // ============================================================================
  // CADASTRO GERAL DE JOGADORES (ISOLADO POR FUTEBOL)
  // ============================================================================
  getPlayers(futebolId = null) {
    try {
      const key = this._getScopedKey('players', futebolId);
      const data = store.getItem(key);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(p => ({
        ...p,
        gols_historicos_iniciais: parseInt(p.gols_historicos_iniciais, 10) || 0,
        capas_historicas_iniciais: parseInt(p.capas_historicas_iniciais, 10) || 0
      }));
    } catch {
      return [];
    }
  },

  savePlayers(players) {
    this.assertAdmin('Salvar ou alterar jogadores');
    try {
      const currentList = this.getPlayers();
      const existingMap = new Map(currentList.map(p => [p.id, p]));
      const isHistAberto = this.isHistoricoInicialAberto();

      const normalized = (players || []).map(p => {
        if (!p.id) {
          p.id = Utils.generateUUID();
        }
        const existing = existingMap.get(p.id);
        if (!isHistAberto) {
          if (!existing) {
            // Novo jogador cadastrado após fechamento: entra obrigatoriamente com 0
            return {
              ...p,
              gols_historicos_iniciais: 0,
              capas_historicas_iniciais: 0
            };
          } else {
            // Jogador existente mantém seus valores históricos prévios sem alteração
            return {
              ...p,
              gols_historicos_iniciais: existing.gols_historicos_iniciais || 0,
              capas_historicas_iniciais: existing.capas_historicas_iniciais || 0
            };
          }
        }
        return {
          ...p,
          gols_historicos_iniciais: parseInt(p.gols_historicos_iniciais, 10) || 0,
          capas_historicas_iniciais: parseInt(p.capas_historicas_iniciais, 10) || 0
        };
      });

      const key = this._getScopedKey('players');
      store.setItem(key, JSON.stringify(normalized));

      // Sincroniza com Supabase preservando chaves e histórico com UUID válido
      if (this.currentFutebol) {
        const futId = this.currentFutebol.id;
        const rows = normalized.map(p => {
          return {
            id: p.id,
            futebol_id: futId,
            nome: p.name,
            estrelas: p.stars,
            gols_historicos_iniciais: p.gols_historicos_iniciais || 0,
            capas_historicas_iniciais: p.capas_historicas_iniciais || 0,
            created_at: p.createdAt || new Date().toISOString()
          };
        });

        store.setItem(key, JSON.stringify(normalized));

        Promise.resolve(supabase.from('jogadores').upsert(rows, { onConflict: 'id' })).then(res => {
          if (res?.error) {
            console.error('[FutRaiz][JOGADORES] erro Supabase upsert jogadores:', res.error);
          } else {
            console.log(`[FutRaiz][JOGADORES] ${rows.length} jogadores sincronizados no Supabase.`);
          }
        }).catch(err => {
          console.warn('[FutRaiz][JOGADORES] erro Supabase upsert jogadores:', err);
        });
      }

      this._emitChange('players', normalized);
      return true;
    } catch (e) {
      console.error('Erro ao salvar jogadores:', e);
      throw e;
    }
  },

  async updatePlayerStars(playerId, newStars) {
    this.assertAdmin('Alterar estrelas do jogador');
    const stars = Math.min(5, Math.max(1, parseInt(newStars, 10) || 1));
    const players = this.getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) {
      throw new Error(`Jogador com id "${playerId}" não encontrado.`);
    }

    player.stars = stars;
    this.savePlayers(players);

    // Sincroniza estrelas no time da rodada atual caso esteja em andamento
    const currentRound = this.getCurrentRound();
    if (currentRound && currentRound.teams) {
      let teamChanged = false;
      Object.values(currentRound.teams).forEach(team => {
        if (team && Array.isArray(team.players)) {
          const tp = team.players.find(p => p.id === playerId);
          if (tp && tp.stars !== stars) {
            tp.stars = stars;
            teamChanged = true;
          }
        }
      });
      if (teamChanged) {
        store.setItem(this._getScopedKey('current_round'), JSON.stringify(currentRound));
        store.setItem(this._getScopedKey('teams'), JSON.stringify(currentRound.teams));
        if (this.currentFutebol && currentRound.id) {
          supabase.from('rodadas')
            .update({ teams: currentRound.teams, updated_at: new Date().toISOString() })
            .eq('id', currentRound.id)
            .catch(() => {});
        }
        this._emitChange('currentRound', currentRound);
        this._emitChange('teams', currentRound.teams);
      }
    }

    // Persiste atualização diretamente no Supabase
    if (this.currentFutebol) {
      const futId = this.currentFutebol.id;
      try {
        await supabase.from('jogadores').update({
          estrelas: stars
        }).eq('id', playerId).eq('futebol_id', futId);
      } catch (err) {
        console.warn('[Storage] Erro ao sincronizar estrelas no Supabase:', err);
      }
    }

    return player;
  },

  async updatePlayer(playerData) {
    this.assertAdmin('Editar jogador');
    if (!playerData || !playerData.id) {
      throw new Error('Dados inválidos do jogador.');
    }
    const players = this.getPlayers();
    const idx = players.findIndex(p => p.id === playerData.id);
    if (idx === -1) {
      throw new Error('Jogador não encontrado.');
    }

    const current = players[idx];
    const newStars = playerData.stars !== undefined ? Math.min(5, Math.max(1, parseInt(playerData.stars, 10) || 1)) : current.stars;
    const newName = playerData.name ? playerData.name.trim() : current.name;

    players[idx] = {
      ...current,
      name: newName,
      stars: newStars
    };

    this.savePlayers(players);

    // Sincroniza também no time da rodada atual se houver
    const currentRound = this.getCurrentRound();
    if (currentRound && currentRound.teams) {
      let teamChanged = false;
      Object.values(currentRound.teams).forEach(team => {
        if (team && Array.isArray(team.players)) {
          const tp = team.players.find(p => p.id === playerData.id);
          if (tp) {
            if (tp.name !== newName || tp.stars !== newStars) {
              tp.name = newName;
              tp.stars = newStars;
              teamChanged = true;
            }
          }
        }
      });
      if (teamChanged) {
        store.setItem(this._getScopedKey('current_round'), JSON.stringify(currentRound));
        this._emitChange('currentRound', currentRound);
      }
    }

    if (this.currentFutebol) {
      const futId = this.currentFutebol.id;
      try {
        await supabase.from('jogadores').update({
          nome: newName,
          estrelas: newStars
        }).eq('id', playerData.id).eq('futebol_id', futId);
      } catch (err) {
        console.warn('[Storage] Erro ao atualizar jogador no Supabase:', err);
      }
    }

    return players[idx];
  },

  async addPlayer({ name, stars }) {
    this.assertAdmin('Cadastrar jogador');
    const cleanName = (name || '').trim();
    if (!cleanName) throw new Error('Nome do jogador é obrigatório.');
    const cleanStars = Math.min(5, Math.max(1, parseInt(stars, 10) || 3));
    const newId = Utils.generateUUID();

    const newPlayer = {
      id: newId,
      name: cleanName,
      stars: cleanStars,
      gols_historicos_iniciais: 0,
      capas_historicas_iniciais: 0,
      createdAt: new Date().toISOString()
    };

    if (this.currentFutebol) {
      const futId = this.currentFutebol.id;
      const dbRow = {
        id: newId,
        futebol_id: futId,
        nome: cleanName,
        estrelas: cleanStars,
        gols_historicos_iniciais: 0,
        capas_historicas_iniciais: 0,
        created_at: newPlayer.createdAt
      };

      const { data, error } = await supabase.from('jogadores').insert([dbRow]).select();
      if (error) {
        console.error('[FutRaiz][JOGADORES] erro Supabase ao cadastrar jogador:', error);
        throw new Error(error.message || 'Erro ao cadastrar jogador no Supabase.');
      }
      console.log(`[FutRaiz][JOGADORES] Gravado com sucesso no Supabase. id: ${newId} | nome: ${cleanName}`);
    }

    const players = this.getPlayers();
    players.push(newPlayer);
    const key = this._getScopedKey('players');
    store.setItem(key, JSON.stringify(players));
    this._emitChange('players', players);
    return newPlayer;
  },

  async deletePlayer(playerId) {
    this.assertAdmin('Excluir jogador');
    const players = this.getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) return false;

    if (this.currentFutebol) {
      const futId = this.currentFutebol.id;
      const { error } = await supabase.from('jogadores').delete().eq('id', playerId).eq('futebol_id', futId);
      if (error) {
        console.error('[FutRaiz][JOGADORES] erro Supabase ao excluir jogador:', error);
        throw new Error(error.message || 'Erro ao excluir jogador no Supabase.');
      }
      console.log(`[FutRaiz][JOGADORES] Jogador ${playerId} removido com sucesso do Supabase.`);
    }

    const updated = players.filter(p => p.id !== playerId);
    const key = this._getScopedKey('players');
    store.setItem(key, JSON.stringify(updated));

    // Remove também da seleção de jogadores da rodada se estiver
    const selectedIds = this.getSelectedPlayerIds().filter(id => id !== playerId);
    this.saveSelectedPlayerIds(selectedIds);

    this._emitChange('players', updated);
    return true;
  },

  // ============================================================================
  // CARGA DE DADOS HISTÓRICOS INICIAIS (GOLS E CAPAS PRÉ-FUTRODA)
  // ============================================================================
  isHistoricoInicialAberto() {
    if (!this.currentFutebol) return false;
    return this.currentFutebol.historico_inicial_aberto !== false;
  },

  async saveHistoricalData(updatesArray) {
    this.assertAdmin('Salvar dados históricos iniciais');
    if (!this.isHistoricoInicialAberto()) {
      throw new Error('A carga histórica inicial deste futebol já foi finalizada e os dados estão bloqueados.');
    }

    if (!Array.isArray(updatesArray)) {
      throw new Error('Formato inválido de dados históricos.');
    }

    const players = this.getPlayers();
    const playerMap = new Map(players.map(p => [p.id, p]));

    for (const item of updatesArray) {
      if (!item.id || !playerMap.has(item.id)) continue;
      const p = playerMap.get(item.id);

      const rawGoals = item.gols_historicos_iniciais;
      const rawCapas = item.capas_historicas_iniciais;

      const numGoals = Number(rawGoals);
      const numCapas = Number(rawCapas);

      if (!Number.isInteger(numGoals) || numGoals < 0) {
        throw new Error(`Gols do jogador "${p.name}" deve ser um número inteiro maior ou igual a zero.`);
      }
      if (!Number.isInteger(numCapas) || numCapas < 0) {
        throw new Error(`Capas do jogador "${p.name}" deve ser um número inteiro maior ou igual a zero.`);
      }

      p.gols_historicos_iniciais = numGoals;
      p.capas_historicas_iniciais = numCapas;
    }

    const key = this._getScopedKey('players');
    store.setItem(key, JSON.stringify(players));

    // Sincroniza com Supabase
    if (this.currentFutebol) {
      const futId = this.currentFutebol.id;
      for (const item of updatesArray) {
        if (!item.id) continue;
        const res = await supabase.from('jogadores').update({
          gols_historicos_iniciais: Number(item.gols_historicos_iniciais) || 0,
          capas_historicas_iniciais: Number(item.capas_historicas_iniciais) || 0
        }).eq('id', item.id).eq('futebol_id', futId);

        if (!res.data || (Array.isArray(res.data) && res.data.length === 0)) {
          const p = playerMap.get(item.id);
          if (p) {
            await supabase.from('jogadores').insert([{
              id: p.id,
              futebol_id: futId,
              nome: p.name,
              estrelas: p.stars,
              gols_historicos_iniciais: Number(item.gols_historicos_iniciais) || 0,
              capas_historicas_iniciais: Number(item.capas_historicas_iniciais) || 0,
              created_at: p.createdAt || new Date().toISOString()
            }]);
          }
        }
      }
    }

    this._emitChange('players', players);
    this._emitChange('historicalDataUpdated', players);
    return { success: true };
  },

  async finalizeHistoricalLoad() {
    this.assertAdmin('Finalizar carga histórica');
    if (!this.isHistoricoInicialAberto()) {
      throw new Error('A carga histórica inicial já foi finalizada.');
    }

    this.currentFutebol.historico_inicial_aberto = false;
    store.setItem(STORAGE_KEYS.CURRENT_FUTEBOL, JSON.stringify(this.currentFutebol));

    if (this.currentFutebol) {
      try {
        await supabase.from('futebois').update({
          historico_inicial_aberto: false
        }).eq('id', this.currentFutebol.id);
      } catch (err) {
        console.warn('Erro ao atualizar historico_inicial_aberto no Supabase:', err);
      }
    }

    this._emitChange('historicalLoadFinalized', false);
    this._emitChange('futebolUpdated', this.currentFutebol);
    return { success: true };
  },

  async syncPlayersFromSupabase(futebolId) {
    if (!futebolId) return { success: false, reason: 'no_futebol_id' };
    try {
      console.log(`[FutRaiz][FUTEBOL] futebolId: ${futebolId}`);

      // 1. Consulta oficial dos jogadores no Supabase
      const { data: dbPlayers, error } = await supabase
        .from('jogadores')
        .select('*')
        .eq('futebol_id', futebolId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error(`[FutRaiz][JOGADORES] erro ao consultar Supabase:`, error);
        return { success: false, error: error.message };
      }

      const localPlayers = this.getPlayers(futebolId);
      console.log(`[FutRaiz][JOGADORES] quantidade no Supabase: ${dbPlayers ? dbPlayers.length : 0} | no localStorage: ${localPlayers.length}`);

      // CENÁRIO A: Supabase possui jogadores (FONTE OFICIAL)
      if (dbPlayers && Array.isArray(dbPlayers) && dbPlayers.length > 0) {
        const mapped = dbPlayers.map(dp => {
          const existing = localPlayers.find(lp => lp.id === dp.id);
          return {
            id: dp.id,
            name: dp.nome,
            stars: dp.estrelas,
            gols_historicos_iniciais: dp.gols_historicos_iniciais !== undefined ? Number(dp.gols_historicos_iniciais) : (existing ? existing.gols_historicos_iniciais : 0),
            capas_historicas_iniciais: dp.capas_historicas_iniciais !== undefined ? Number(dp.capas_historicas_iniciais) : (existing ? existing.capas_historicas_iniciais : 0),
            createdAt: dp.created_at || (existing ? existing.createdAt : new Date().toISOString())
          };
        });

        // Se este dispositivo (ex: celular do admin) contiver jogadores locais pendentes não enviados:
        if (this.isAdmin()) {
          const missingInDb = localPlayers.filter(lp =>
            !mapped.some(mp => mp.id === lp.id || (mp.name.trim().toLowerCase() === lp.name.trim().toLowerCase()))
          );
          if (missingInDb.length > 0) {
            console.log(`[FutRaiz][JOGADORES] sincronizando ${missingInDb.length} jogador(es) locais pendentes para o Supabase...`);
            const rowsToInsert = missingInDb.map(p => ({
              id: Utils.isUUID(p.id) ? p.id : Utils.generateUUID(),
              futebol_id: futebolId,
              nome: p.name.trim(),
              estrelas: p.stars || 3,
              gols_historicos_iniciais: p.gols_historicos_iniciais || 0,
              capas_historicas_iniciais: p.capas_historicas_iniciais || 0,
              created_at: p.createdAt || new Date().toISOString()
            }));

            try {
              const { data: inserted, error: insErr } = await supabase.from('jogadores').upsert(rowsToInsert, { onConflict: 'id' }).select();
              if (!insErr && inserted) {
                inserted.forEach(insp => {
                  if (!mapped.some(m => m.id === insp.id)) {
                    mapped.push({
                      id: insp.id,
                      name: insp.nome,
                      stars: insp.estrelas,
                      gols_historicos_iniciais: Number(insp.gols_historicos_iniciais) || 0,
                      capas_historicas_iniciais: Number(insp.capas_historicas_iniciais) || 0,
                      createdAt: insp.created_at
                    });
                  }
                });
              }
            } catch (errSync) {
              console.warn('[FutRaiz][JOGADORES] aviso ao enviar jogadores pendentes:', errSync);
            }
          }
        }

        const key = this._getScopedKey('players', futebolId);
        store.setItem(key, JSON.stringify(mapped));
        console.log(`[FutRaiz][JOGADORES] quantidade: ${mapped.length}`);
        console.log(`[FutRaiz][JOGADORES] origem: Supabase`);
        this._emitChange('players', mapped);
        return { success: true, count: mapped.length, players: mapped };
      }

      // CENÁRIO B: Supabase está com 0 jogadores para este futebol
      // Se este dispositivo tem jogadores no localStorage (ex: celular onde foram cadastrados antes):
      if (localPlayers.length > 0) {
        if (this.isAdmin()) {
          console.log(`[FutRaiz][JOGADORES] Supabase vazio (0). Enviando ${localPlayers.length} jogadores do localStorage para o Supabase...`);
          const rowsToInsert = localPlayers.map(p => ({
            id: Utils.isUUID(p.id) ? p.id : Utils.generateUUID(),
            futebol_id: futebolId,
            nome: p.name.trim(),
            estrelas: p.stars || 3,
            gols_historicos_iniciais: p.gols_historicos_iniciais || 0,
            capas_historicas_iniciais: p.capas_historicas_iniciais || 0,
            created_at: p.createdAt || new Date().toISOString()
          }));

          try {
            const { data: inserted, error: insErr } = await supabase.from('jogadores').upsert(rowsToInsert, { onConflict: 'id' }).select();
            if (insErr) {
              console.error(`[FutRaiz][JOGADORES] erro ao persistir jogadores no Supabase:`, insErr);
              // Proteção rigorosa: NUNCA apagar jogadores locais se a inserção no Supabase falhar!
              return { success: false, error: insErr.message, count: localPlayers.length, players: localPlayers };
            } else {
              const syncedPlayers = (inserted && inserted.length > 0) ? inserted.map(insp => ({
                id: insp.id,
                name: insp.nome,
                stars: insp.estrelas,
                gols_historicos_iniciais: Number(insp.gols_historicos_iniciais) || 0,
                capas_historicas_iniciais: Number(insp.capas_historicas_iniciais) || 0,
                createdAt: insp.created_at
              })) : rowsToInsert.map(r => ({
                id: r.id,
                name: r.nome,
                stars: r.estrelas,
                gols_historicos_iniciais: r.gols_historicos_iniciais,
                capas_historicas_iniciais: r.capas_historicas_iniciais,
                createdAt: r.created_at
              }));

              const key = this._getScopedKey('players', futebolId);
              store.setItem(key, JSON.stringify(syncedPlayers));
              console.log(`[FutRaiz][JOGADORES] quantidade: ${syncedPlayers.length}`);
              console.log(`[FutRaiz][JOGADORES] origem: Supabase (sincronizados do dispositivo)`);
              this._emitChange('players', syncedPlayers);
              return { success: true, count: syncedPlayers.length, players: syncedPlayers };
            }
          } catch (errSync) {
            console.error(`[FutRaiz][JOGADORES] erro na sincronização para o Supabase:`, errSync);
            // Proteção: preserva jogadores locais
            return { success: false, error: errSync.message, count: localPlayers.length, players: localPlayers };
          }
        } else {
          // Usuário local não autenticado como admin ou visualizador: preserva os dados locais
          return { success: true, count: localPlayers.length, players: localPlayers };
        }
      }

      // CENÁRIO C: Supabase vazio e localStorage vazio (novo futebol sem jogadores)
      const key = this._getScopedKey('players', futebolId);
      store.setItem(key, JSON.stringify([]));
      console.log(`[FutRaiz][JOGADORES] quantidade: 0`);
      console.log(`[FutRaiz][JOGADORES] origem: Supabase`);
      this._emitChange('players', []);
      return { success: true, count: 0, players: [] };
    } catch (err) {
      console.error(`[FutRaiz][JOGADORES] erro inesperado em syncPlayersFromSupabase:`, err);
      return { success: false, error: err.message };
    }
  },

  async syncCapasFromSupabase(futebolId) {
    if (!futebolId) return;
    try {
      const { data: dbCapas } = await supabase
        .from('capas')
        .select('*')
        .eq('futebol_id', futebolId);

      if (dbCapas && Array.isArray(dbCapas)) {
        const localCapas = this.getCapas();
        const merged = [...localCapas];
        dbCapas.forEach(dc => {
          if (!merged.some(mc => mc.id === dc.id || (mc.rodada_id === dc.rodada_id && mc.jogador_id === dc.jogador_id))) {
            merged.push({
              id: dc.id,
              futebol_id: dc.futebol_id,
              rodada_id: dc.rodada_id,
              jogador_id: dc.jogador_id,
              time_id: dc.time_id,
              playerName: dc.playerName || '',
              teamName: dc.teamName || '',
              date: dc.date || '',
              createdAt: dc.created_at || new Date().toISOString()
            });
          }
        });
        const key = this._getScopedKey('capas');
        store.setItem(key, JSON.stringify(merged));
        this._emitChange('capas', merged);
      }
    } catch (err) {
      console.warn('[Storage] Erro ao sincronizar capas:', err);
    }
  },

  // ============================================================================
  // SELEÇÃO DA RODADA (ISOLADA POR FUTEBOL)
  // ============================================================================
  getSelectedPlayerIds() {
    try {
      const key = this._getScopedKey('selected_players');
      const data = store.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveSelectedPlayerIds(ids) {
    this.assertAdmin('Selecionar jogadores da rodada');
    if (this.isTeamsLocked()) {
      throw new Error('A composição dos times está bloqueada após o início da noite.');
    }
    try {
      const key = this._getScopedKey('selected_players');
      store.setItem(key, JSON.stringify(ids || []));
      this._emitChange('selectedPlayers', ids);
      return true;
    } catch (e) {
      throw e;
    }
  },

  // ============================================================================
  // CORES DOS TIMES
  // ============================================================================
  getTeamColors() {
    try {
      const key = this._getScopedKey('team_colors');
      const data = store.getItem(key);
      return data ? { ...DEFAULT_COLORS, ...JSON.parse(data) } : { ...DEFAULT_COLORS };
    } catch {
      return { ...DEFAULT_COLORS };
    }
  },

  saveTeamColors(colors) {
    this.assertAdmin('Alterar cores dos times');
    try {
      const key = this._getScopedKey('team_colors');
      const current = this.getTeamColors();
      const updated = { ...current, ...colors };
      store.setItem(key, JSON.stringify(updated));
      this._emitChange('colors', updated);
      return true;
    } catch (e) {
      throw e;
    }
  },

  // ============================================================================
  // RODADAS (ROUNDS)
  // ============================================================================
  getRounds() {
    try {
      const key = this._getScopedKey('rounds');
      const data = store.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveRounds(rounds) {
    this.assertAdmin('Salvar rodadas');
    try {
      const key = this._getScopedKey('rounds');
      store.setItem(key, JSON.stringify(rounds || []));
      this._emitChange('rounds', rounds);
      return true;
    } catch (e) {
      throw e;
    }
  },

  getCurrentRound() {
    try {
      const key = this._getScopedKey('current_round');
      const data = store.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveCurrentRound(round) {
    this.assertAdmin('Salvar rodada atual');
    try {
      const key = this._getScopedKey('current_round');
      if (!round) {
        store.removeItem(key);
      } else {
        if (!round.id) {
          round.id = Utils.generateUUID();
        }

        store.setItem(key, JSON.stringify(round));
        if (round.teams && !this.isTeamsLocked()) {
          store.setItem(this._getScopedKey('teams'), JSON.stringify(round.teams));
          this._emitChange('teams', round.teams);
        }

        // Sincroniza com Supabase tabela 'rodadas'
        if (this.currentFutebol) {
          const futId = this.currentFutebol.id;
          const dbRound = {
            id: round.id,
            futebol_id: futId,
            numero: round.numero || 1,
            data: round.dateKey || new Date().toISOString().split('T')[0],
            status: round.status || 'READY',
            campeao_time_id: round.campeaoTimeId || null,
            campeao_time_nome: round.campeaoTimeNome || null,
            programacao: round.programacao || [],
            standings_snapshot: round.standingsSnapshot || null,
            teams: round.teams || null,
            selected_player_ids: round.selectedPlayerIds || (round.selectedPlayers ? round.selectedPlayers.map(p => p.id) : []),
            selected_players: round.selectedPlayers || [],
            draw_info: round.drawInfo || null,
            created_at: round.createdAt || new Date().toISOString()
          };

          supabase.from('rodadas').upsert([dbRound], { onConflict: 'id' }).then(() => {
            if (round.teams) {
              this._syncRelationalTeams(futId, round.id, round.teams).catch(() => {});
            }
          }).catch(err => {
            console.warn('[Storage] Erro ao sincronizar rodada no Supabase:', err);
          });
        }
      }
      this._emitChange('currentRound', round);
      return true;
    } catch (e) {
      throw e;
    }
  },

  startNewRound() {
    this.assertAdmin('Iniciar nova rodada');
    try {
      const currentRound = this.getCurrentRound();
      if (currentRound) {
        const rounds = this.getRounds();
        if (!rounds.some(r => r.id === currentRound.id)) {
          rounds.unshift(currentRound);
          this.saveRounds(rounds);
        }
      }

      store.removeItem(this._getScopedKey('current_round'));
      store.removeItem(this._getScopedKey('selected_players'));
      store.removeItem(this._getScopedKey('teams'));
      store.removeItem(this._getScopedKey('draw_info'));
      store.removeItem(this._getScopedKey('current_match'));
      store.removeItem(this._getScopedKey('live_match'));

      this._emitChange('newRound', null);
      return true;
    } catch (e) {
      throw e;
    }
  },

  // ============================================================================
  // TIMES E SORTEIO
  // ============================================================================
  getTeams() {
    try {
      const key = this._getScopedKey('teams');
      const data = store.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object' && (parsed.team1 || parsed.team_1)) {
          return parsed;
        }
      }
      // Fallback: se não encontrou no cache de times, busca da rodada ativa
      const currentRound = this.getCurrentRound();
      if (currentRound && currentRound.teams) {
        store.setItem(key, JSON.stringify(currentRound.teams));
        return currentRound.teams;
      }
      // Fallback 2: busca da rodada mais recente no histórico que possua times
      const rounds = this.getRounds();
      if (rounds && rounds.length > 0) {
        const latestWithTeams = rounds.find(r => r.teams && (r.teams.team1 || r.teams.team_1));
        if (latestWithTeams) {
          store.setItem(key, JSON.stringify(latestWithTeams.teams));
          return latestWithTeams.teams;
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  saveTeams(teams) {
    this.assertAdmin('Salvar times sorteados');
    if (teams !== null && this.isTeamsLocked()) {
      throw new Error('A composição dos times está bloqueada após o início da noite.');
    }
    try {
      const key = this._getScopedKey('teams');
      if (!teams) {
        store.removeItem(key);
      } else {
        store.setItem(key, JSON.stringify(teams));
      }

      // Atualiza também na rodada ativa e sincroniza com o Supabase
      const currentRound = this.getCurrentRound();
      if (currentRound) {
        currentRound.teams = teams;
        store.setItem(this._getScopedKey('current_round'), JSON.stringify(currentRound));

        if (this.currentFutebol && currentRound.id) {
          const futId = this.currentFutebol.id;
          supabase.from('rodadas')
            .update({ teams: teams, updated_at: new Date().toISOString() })
            .eq('id', currentRound.id)
            .catch(err => console.warn('[Storage] Erro ao sincronizar times na rodada:', err));

          if (teams) {
            this._syncRelationalTeams(futId, currentRound.id, teams).catch(() => {});
          }
        }
      }

      this._emitChange('teams', teams);
      return true;
    } catch (e) {
      throw e;
    }
  },

  getDrawInfo() {
    try {
      const key = this._getScopedKey('draw_info');
      const data = store.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  saveDrawInfo(info) {
    this.assertAdmin('Salvar resumo do sorteio');
    try {
      const key = this._getScopedKey('draw_info');
      if (!info) store.removeItem(key);
      else store.setItem(key, JSON.stringify(info));
      return true;
    } catch (e) {
      throw e;
    }
  },

  // ============================================================================
  // PROGRAMAÇÃO DAS PARTIDAS E CONTROLE DE ESTADOS DA RODADA
  // Estados da rodada: 'PLANNING' | 'READY' | 'ACTIVE' | 'FINISHED'
  // ============================================================================
  isTeamsLocked() {
    const round = this.getCurrentRound();
    if (!round) return false;
    return round.status === 'ACTIVE' || round.status === 'FINISHED';
  },

  isScheduleLocked() {
    const round = this.getCurrentRound();
    if (!round) return false;
    return round.status === 'ACTIVE' || round.status === 'FINISHED';
  },

  getSchedule() {
    const round = this.getCurrentRound();
    if (round && Array.isArray(round.programacao) && round.programacao.length > 0) {
      return round.programacao;
    }
    // Programação padrão inicial com Partida 01 obrigatória Time 1 x Time 2
    return [
      { id: 'fix_1', order: 1, homeTeamId: 'time_1', awayTeamId: 'time_2', homeTeamName: 'Time 1', awayTeamName: 'Time 2' }
    ];
  },

  saveSchedule(fixtures) {
    this.assertAdmin('Salvar programação da noite');
    if (this.isScheduleLocked()) {
      throw new Error('A programação está bloqueada após o início da noite e não pode ser alterada.');
    }

    const round = this.getCurrentRound();
    if (!round) {
      throw new Error('Nenhuma rodada ativa encontrada para salvar programação.');
    }

    if (!Array.isArray(fixtures) || fixtures.length === 0) {
      throw new Error('A programação deve conter pelo menos a Partida 01.');
    }

    // Regra: Primeira partida é obrigatoriamente Time 1 x Time 2
    const first = fixtures[0];
    if (first.homeTeamId !== 'time_1' || first.awayTeamId !== 'time_2') {
      throw new Error('A primeira partida é obrigatoriamente Time 1 x Time 2.');
    }

    // Regra: Time mandante e visitante devem ser diferentes
    for (let i = 0; i < fixtures.length; i++) {
      const f = fixtures[i];
      if (f.homeTeamId === f.awayTeamId) {
        throw new Error(`Partida ${i + 1} inválida: time mandante e visitante não podem ser iguais.`);
      }
    }

    round.programacao = fixtures.map((f, idx) => ({
      id: f.id || `fix_${idx + 1}`,
      order: idx + 1,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      homeTeamName: f.homeTeamName || (f.homeTeamId === 'time_1' ? 'Time 1' : f.homeTeamId === 'time_2' ? 'Time 2' : f.homeTeamId === 'time_3' ? 'Time 3' : 'Time 4'),
      awayTeamName: f.awayTeamName || (f.awayTeamId === 'time_1' ? 'Time 1' : f.awayTeamId === 'time_2' ? 'Time 2' : f.awayTeamId === 'time_3' ? 'Time 3' : 'Time 4')
    }));

    if (round.status === 'PLANNING' || !round.status) {
      round.status = 'READY';
    }

    this.saveCurrentRound(round);
    this._emitChange('schedule', round.programacao);
    return true;
  },

  startNight() {
    this.assertAdmin('Iniciar noite');
    const round = this.getCurrentRound();
    if (!round) throw new Error('Crie uma rodada antes de iniciar a noite.');
    if (!round.teams) throw new Error('Realize o sorteio dos 4 times antes de iniciar.');

    round.status = 'ACTIVE';
    this.saveCurrentRound(round);
    this._emitChange('nightStarted', round);
    return true;
  },

  _computeStandingsFallback(matchesList = [], currentRound = null) {
    const round = currentRound || this.getCurrentRound();
    const storedTeams = this.getTeams() || (round && round.teams ? round.teams : null) || {};
    const colors = this.getTeamColors();
    const teamKeys = ['time_1', 'time_2', 'time_3', 'time_4'];
    const stats = {};

    teamKeys.forEach((key, idx) => {
      const teamObj = storedTeams[key] || storedTeams[`team_${idx + 1}`];
      stats[key] = {
        id: key,
        name: teamObj && teamObj.name ? teamObj.name : `Time ${idx + 1}`,
        j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pts: 0,
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

    const processed = new Set();
    (matchesList || []).forEach(m => {
      if (m.id) {
        if (processed.has(m.id)) return;
        processed.add(m.id);
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

    teamKeys.forEach(k => {
      stats[k].sg = stats[k].gp - stats[k].gc;
    });

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

  saveRoundStandingsSnapshot(roundId, standings, championTeamId = null, championTeamName = null) {
    if (!roundId || !Array.isArray(standings)) return;
    try {
      const key = this._getScopedKey('rodada_classificacao');
      let allSnapshots = {};
      try {
        allSnapshots = JSON.parse(store.getItem(key) || '{}');
      } catch {
        allSnapshots = {};
      }
      allSnapshots[roundId] = standings;
      store.setItem(key, JSON.stringify(allSnapshots));

      // Assegura também na rodada salva
      const rounds = this.getRounds();
      const r = rounds.find(item => item.id === roundId);
      if (r) {
        r.standingsSnapshot = standings;
        if (championTeamId) r.campeaoTimeId = championTeamId;
        if (championTeamName) r.campeaoTimeNome = championTeamName;
        const rKey = this._getScopedKey('rounds');
        store.setItem(rKey, JSON.stringify(rounds || []));
      }
      const currentRound = this.getCurrentRound();
      if (currentRound && currentRound.id === roundId) {
        currentRound.standingsSnapshot = standings;
        if (championTeamId) currentRound.campeaoTimeId = championTeamId;
        if (championTeamName) currentRound.campeaoTimeNome = championTeamName;
        store.setItem(this._getScopedKey('current_round'), JSON.stringify(currentRound));
      }

      // Sincroniza com Supabase tabela 'rodada_classificacao'
      if (this.currentFutebol) {
        const futId = this.currentFutebol.id;
        const rows = standings.map((row, idx) => ({
          id: `class_${roundId}_${row.id}`,
          rodada_id: roundId,
          futebol_id: futId,
          time_id: row.id,
          time_nome: row.name,
          jogos: row.j,
          vitorias: row.v,
          empates: row.e,
          derrotas: row.d,
          gols_pro: row.gp,
          gols_contra: row.gc,
          saldo_gols: row.sg,
          pontos: row.pts,
          posicao: idx + 1,
          created_at: new Date().toISOString()
        }));

        supabase.from('rodada_classificacao').delete().eq('rodada_id', roundId).then(() => {
          Promise.resolve(supabase.from('rodada_classificacao').insert(rows)).catch(err => {
            console.warn('[Storage] Sync rodada_classificacao error:', err);
          });
        }).catch(() => {
          Promise.resolve(supabase.from('rodada_classificacao').insert(rows)).catch(() => {});
        });
      }

      this._emitChange('standingsSnapshot', { roundId, standings });
      return true;
    } catch (e) {
      console.warn('[Storage] Erro ao salvar snapshot de classificação:', e);
      return false;
    }
  },

  getRoundStandingsSnapshot(roundId) {
    if (!roundId) return null;
    const currentRound = this.getCurrentRound();
    if (currentRound && currentRound.id === roundId && currentRound.standingsSnapshot) {
      return currentRound.standingsSnapshot;
    }
    const rounds = this.getRounds();
    const r = rounds.find(item => item.id === roundId);
    if (r && r.standingsSnapshot) {
      return r.standingsSnapshot;
    }
    try {
      const key = this._getScopedKey('rodada_classificacao');
      const allSnapshots = JSON.parse(store.getItem(key) || '{}');
      return allSnapshots[roundId] || null;
    } catch {
      return null;
    }
  },

  getAllStandingsSnapshots() {
    try {
      const key = this._getScopedKey('rodada_classificacao');
      return JSON.parse(store.getItem(key) || '{}');
    } catch {
      return {};
    }
  },

  async endNight(options = {}) {
    this.assertAdmin('Encerrar noite');
    const round = this.getCurrentRound();
    if (!round) throw new Error('Nenhuma rodada ativa encontrada.');

    // Se houver partida ao vivo com status running/paused ou isActive,
    // finaliza a partida ao vivo para não bloquear o encerramento da noite
    const live = this.getLiveMatch();
    if (live && (live.isActive || live.status === 'running' || live.status === 'paused')) {
      live.isActive = false;
      live.status = 'finished';
      this.saveLiveMatch(live);
    }

    const championTeamId = options.championTeamId || round.campeaoTimeId;
    const championTeamName = options.championTeamName || round.campeaoTimeNome || (championTeamId === 'time_1' ? 'Time 1' : championTeamId === 'time_2' ? 'Time 2' : championTeamId === 'time_3' ? 'Time 3' : 'Time 4');

    let capaPlayers = options.capaPlayers;
    if (!capaPlayers || !capaPlayers.length) {
      if (round && round.teams) {
        const teamObj = Array.isArray(round.teams)
          ? round.teams.find(t => t.id === championTeamId)
          : (round.teams[championTeamId] || Object.values(round.teams).find(t => t.id === championTeamId));
        if (teamObj && teamObj.players) {
          capaPlayers = teamObj.players;
        }
      }
    }
    if (!capaPlayers || !capaPlayers.length) {
      const teams = this.getTeams();
      const teamObj = Array.isArray(teams)
        ? teams.find(t => t.id === championTeamId)
        : (teams[championTeamId] || Object.values(teams).find(t => t.id === championTeamId));
      if (teamObj && teamObj.players) {
        capaPlayers = teamObj.players;
      }
    }
    if (!capaPlayers) capaPlayers = [];

    const finalStandings = options.standings || options.standingsSnapshot || round.standingsSnapshot || null;
    this.finalizeNight({
      championTeamId,
      championTeamName,
      capaPlayers,
      standingsSnapshot: finalStandings
    });

    if (this.currentFutebol) {
      const futId = this.currentFutebol.id;
      const dbRound = {
        id: round.id,
        futebol_id: futId,
        numero: round.numero || 1,
        data: round.dateKey || new Date().toISOString().split('T')[0],
        status: 'FINISHED',
        campeao_time_id: championTeamId,
        campeao_time_nome: championTeamName,
        programacao: round.programacao || [],
        standings_snapshot: finalStandings,
        teams: round.teams || this.getTeams() || null,
        selected_player_ids: round.selectedPlayerIds || null,
        selected_players: round.selectedPlayers || null,
        draw_info: round.drawInfo || null,
        created_at: round.createdAt || new Date().toISOString()
      };
      await supabase.from('rodadas').upsert([dbRound], { onConflict: 'id' }).catch(() => {});

      if (capaPlayers.length > 0) {
        const capaRows = capaPlayers.map(p => ({
          id: (p.capaId && Utils.isUUID && Utils.isUUID(p.capaId)) ? p.capaId : (typeof Utils.generateUUID === 'function' ? Utils.generateUUID() : Utils.generateId('capa')),
          futebol_id: futId,
          rodada_id: round.id,
          jogador_id: p.id,
          time_id: championTeamId,
          created_at: new Date().toISOString()
        }));
        await supabase.from('capas').upsert(capaRows, { onConflict: 'rodada_id,jogador_id' }).catch(() => {});
      }
    }

    return true;
  },

  finalizeNight({ championTeamId, championTeamName, capaPlayers, standingsSnapshot = null }) {
    this.assertAdmin('Encerrar noite');
    const round = this.getCurrentRound();
    if (!round) throw new Error('Nenhuma rodada ativa encontrada.');

    // Regra: Bloquear se houver partida em andamento
    const live = this.getLiveMatch();
    if (live && (live.isActive || live.status === 'running' || live.status === 'paused')) {
      throw new Error('Não é possível encerrar a noite com uma partida em andamento. Finalize a partida atual.');
    }

    const allMatches = this.getMatches();
    const roundMatches = allMatches.filter(m => (round && m.roundId === round.id) || m.dateKey === round.dateKey);

    // Regra: Exige ao menos uma partida realizada
    if (roundMatches.length === 0) {
      throw new Error('Realize e finalize ao menos uma partida antes de encerrar a noite.');
    }

    // 1. Calcula a classificação final da rodada
    let finalStandings = standingsSnapshot;
    if (!finalStandings || !Array.isArray(finalStandings)) {
      if (typeof globalThis !== 'undefined' && globalThis.Tabela) {
        finalStandings = globalThis.Tabela.calcularTabela(roundMatches, null, round);
      } else if (typeof window !== 'undefined' && window.Tabela) {
        finalStandings = window.Tabela.calcularTabela(roundMatches, null, round);
      } else {
        finalStandings = this._computeStandingsFallback(roundMatches, round);
      }
    }

    // 2. Salva SNAPSHOT da tabela final antes de marcar como FINISHED
    round.standingsSnapshot = finalStandings;
    round.campeaoTimeId = championTeamId;
    round.campeaoTimeNome = championTeamName;
    round.capaPlayerIds = (capaPlayers || []).map(p => p.id);
    round.finishedAt = new Date().toISOString();

    this.saveRoundStandingsSnapshot(round.id, finalStandings, championTeamId, championTeamName);

    // 3. Atribuição de Capa: exatamente 1 Capa para cada um dos 5 atletas do time campeão
    const capaRecords = (capaPlayers || []).map(p => ({
      id: Utils.generateId('capa'),
      futebol_id: this.currentFutebol ? this.currentFutebol.id : 'global',
      rodada_id: round.id,
      jogador_id: p.id,
      time_id: championTeamId,
      playerName: p.name,
      teamName: championTeamName,
      date: round.date,
      createdAt: new Date().toISOString()
    }));

    this.addCapas(capaRecords);

    // 4. Marca status como FINISHED
    round.status = 'FINISHED';

    // Salva rodada atualizada
    this.saveCurrentRound(round);

    // Adiciona / atualiza no histórico permanente de rodadas
    const rounds = this.getRounds();
    const existingIdx = rounds.findIndex(r => r.id === round.id);
    if (existingIdx >= 0) {
      rounds[existingIdx] = round;
    } else {
      rounds.unshift(round);
    }
    this.saveRounds(rounds);

    // Sincroniza rodada com Supabase
    if (this.currentFutebol) {
      const futId = this.currentFutebol.id;
      const dbRound = {
        id: round.id,
        futebol_id: futId,
        numero: round.numero || 1,
        data: round.dateKey || new Date().toISOString().split('T')[0],
        status: 'FINISHED',
        campeao_time_id: championTeamId,
        campeao_time_nome: championTeamName,
        programacao: round.programacao,
        standings_snapshot: finalStandings,
        created_at: round.createdAt || new Date().toISOString()
      };
      supabase.from('rodadas').update(dbRound).eq('id', round.id).catch(() => {
        supabase.from('rodadas').insert([dbRound]).catch(() => {});
      });
    }

    this._emitChange('nightFinalized', round);
    return true;
  },

  // ============================================================================
  // CAPAS (HISTÓRICO INDIVIDUAL DE CAPAS CONQUISTADAS POR RODADA)
  // Regra: Capa só existe no encerramento da noite para os 5 atletas do campeão.
  // Idempotente: um jogador só pode receber 1 Capa na mesma rodada.
  // ============================================================================
  getCapas() {
    try {
      const key = this._getScopedKey('capas');
      const data = store.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveCapas(capas) {
    this.assertAdmin('Salvar capas');
    try {
      const key = this._getScopedKey('capas');
      store.setItem(key, JSON.stringify(capas || []));
      this._emitChange('capas', capas);
      return true;
    } catch (e) {
      throw e;
    }
  },

  addCapas(newCapas) {
    this.assertAdmin('Atribuir Capa');
    const existing = this.getCapas();
    const toInsert = [];

    for (const c of newCapas) {
      // Proteção contra duplicidade: mesmo jogador + mesma rodada = 1 única Capa
      const alreadyHas = existing.some(e => e.rodada_id === c.rodada_id && e.jogador_id === c.jogador_id);
      if (!alreadyHas) {
        existing.push(c);
        toInsert.push(c);
      }
    }

    if (toInsert.length > 0) {
      this.saveCapas(existing);

      if (this.currentFutebol) {
        const futId = this.currentFutebol.id;
        const rows = toInsert.map(c => ({
          id: (c.id && Utils.isUUID && Utils.isUUID(c.id)) ? c.id : (typeof Utils.generateUUID === 'function' ? Utils.generateUUID() : c.id),
          futebol_id: futId,
          rodada_id: c.rodada_id,
          jogador_id: c.jogador_id,
          time_id: c.time_id,
          created_at: c.createdAt || new Date().toISOString()
        }));
        Promise.resolve(supabase.from('capas').upsert(rows, { onConflict: 'rodada_id,jogador_id' })).catch(err => console.warn('Sync capas:', err));
      }
    }

    return { added: toInsert.length, total: existing.length };
  },

  getPlayerCapas(playerId) {
    return this.getCapas().filter(c => c.jogador_id === playerId);
  },

  // ============================================================================
  // PARTIDAS E HISTÓRICO
  // ============================================================================
  getMatches() {
    try {
      const key = this._getScopedKey('matches');
      const data = store.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveMatches(matches) {
    this.assertAdmin('Salvar partidas');
    try {
      const key = this._getScopedKey('matches');
      store.setItem(key, JSON.stringify(matches));
      this._emitChange('matches', matches);
      return true;
    } catch (e) {
      throw e;
    }
  },

  addMatch(match) {
    this.assertAdmin('Adicionar partida ao histórico');
    if (!match.id) {
      match.id = Utils.generateUUID();
    }
    const matches = this.getMatches();
    matches.unshift(match);
    this.saveMatches(matches);

    // Sincroniza com Supabase
    if (this.currentFutebol) {
      const futId = this.currentFutebol.id;
      const matchDbId = match.id || Utils.generateUUID();
      const roundId = (match.roundId && Utils.isUUID(match.roundId)) ? match.roundId : null;

      const dbMatch = {
        id: matchDbId,
        futebol_id: futId,
        rodada_id: roundId,
        time_casa_id: match.homeTeamId,
        time_fora_id: match.awayTeamId,
        time_casa_nome: match.homeTeamName,
        time_fora_nome: match.awayTeamName,
        placar_casa: match.homeScore,
        placar_fora: match.awayScore,
        status: 'finalizada',
        tempo_segundos: match.durationSeconds || 0,
        created_at: match.createdAt || new Date().toISOString()
      };

      supabase.from('partidas').upsert([dbMatch], { onConflict: 'id' }).then(() => {
        if (Array.isArray(match.goals) && match.goals.length > 0) {
          const dbGoals = match.goals.map(g => ({
            id: (g.id && Utils.isUUID(g.id)) ? g.id : Utils.generateUUID(),
            futebol_id: futId,
            partida_id: matchDbId,
            jogador_id: (g.playerId && Utils.isUUID(g.playerId)) ? g.playerId : null,
            jogador_nome: g.playerName,
            time_id: g.teamId,
            minuto: g.minute || 0,
            created_at: g.createdAt || new Date().toISOString()
          })).filter(g => g.jogador_id !== null);

          if (dbGoals.length > 0) {
            Promise.resolve(supabase.from('gols').upsert(dbGoals, { onConflict: 'id' })).catch(err => console.warn('Sync gols:', err));
          }
        }
      }).catch(err => console.warn('Sync partida:', err));
    }

    return this.saveMatches(matches);
  },

  updateMatch(updatedMatch) {
    this.assertAdmin('Atualizar partida');
    const matches = this.getMatches();
    const idx = matches.findIndex(m => m.id === updatedMatch.id);
    if (idx !== -1) {
      matches[idx] = updatedMatch;
    } else {
      matches.unshift(updatedMatch);
    }
    this.saveMatches(matches);
    return true;
  },

  // ============================================================================
  // PARTIDA AO VIVO (SINCRONIZAÇÃO EM TEMPO REAL)
  // ============================================================================
  getLiveMatch() {
    try {
      const key = this._getScopedKey('live_match');
      const data = store.getItem(key);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (!parsed) return null;

      const base = parsed.payload && typeof parsed.payload === 'object'
        ? { ...parsed.payload, ...parsed }
        : parsed;

      const winnerId = base.winnerTeamId || base.winner_team_id || null;
      const winnerName = base.winnerTeamName || base.winner_team_name || null;
      const loserId = base.loserTeamId || base.loser_team_id || null;
      const waitingNext = Boolean(base.waitingNextOpponent !== undefined ? base.waitingNextOpponent : base.waiting_next_opponent);
      const waitingTie = Boolean(base.waitingTieNextMatch !== undefined ? base.waitingTieNextMatch : base.waiting_tie_next_match);

      return {
        ...base,
        order: base.order !== undefined ? base.order : (base.order_num !== undefined ? base.order_num : 1),
        homeScore: base.homeScore !== undefined ? base.homeScore : (base.placar_casa !== undefined ? base.placar_casa : 0),
        awayScore: base.awayScore !== undefined ? base.awayScore : (base.placar_fora !== undefined ? base.placar_fora : 0),
        homeTeamId: base.homeTeamId || base.home_team_id || 'time_1',
        awayTeamId: base.awayTeamId || base.away_team_id || 'time_2',
        homeTeamName: base.homeTeamName || base.time_casa_nome || 'Time 1',
        awayTeamName: base.awayTeamName || base.time_fora_nome || 'Time 2',
        winnerTeamId: winnerId,
        winner_team_id: winnerId,
        winnerTeamName: winnerName,
        winner_team_name: winnerName,
        loserTeamId: loserId,
        loser_team_id: loserId,
        isTie: base.isTie !== undefined ? base.isTie : Boolean(base.is_tie),
        waitingNextOpponent: waitingNext,
        waiting_next_opponent: waitingNext,
        waitingTieNextMatch: waitingTie,
        waiting_tie_next_match: waitingTie,
        tieNextMatch: base.tieNextMatch || base.tie_next_match || null,
        lastMatchSummary: base.lastMatchSummary || base.last_match_summary || null,
        remainingSeconds: base.remainingSeconds !== undefined ? base.remainingSeconds : (base.tempo_restante !== undefined ? base.tempo_restante : 420),
        remainingAtStart: base.remainingAtStart !== undefined ? base.remainingAtStart : (base.remaining_at_start !== undefined ? base.remaining_at_start : (base.remainingSeconds || 420)),
        durationMinutes: base.durationMinutes || (base.duration_seconds ? Math.floor(base.duration_seconds / 60) : 7),
        durationSeconds: base.durationSeconds || (base.durationMinutes ? base.durationMinutes * 60 : (base.duration_seconds || 420)),
        isActive: base.isActive !== undefined ? base.isActive : Boolean(base.is_active),
        isPaused: base.isPaused !== undefined ? base.isPaused : Boolean(base.is_paused),
        status: base.status || (base.is_active ? (base.is_paused ? 'paused' : 'running') : (base.isActive ? (base.isPaused ? 'paused' : 'running') : 'ready')),
        startedAt: base.startedAt || base.started_at || null,
        pausedAt: base.pausedAt || base.paused_at || null,
        goals: base.goals || base.gols || []
      };
    } catch {
      return null;
    }
  },

  getCurrentMatch() {
    return this.getLiveMatch();
  },

  saveCurrentMatch(match) {
    return this.saveLiveMatch(match);
  },

  _saveLocalLiveMatch(liveData) {
    const key = this._getScopedKey('live_match');
    store.setItem(key, JSON.stringify(liveData));
  },

  saveLocalMatchOnly(liveData) {
    this._saveLocalLiveMatch(liveData);
  },

  saveLiveMatch(liveData) {
    this.assertAdmin('Atualizar partida ao vivo');
    try {
      this._saveLocalLiveMatch(liveData);
      this._emitChange('liveMatch', liveData);
      this._emitChange('liveMatchUpdate', liveData);

      if (this.currentFutebol && supabase && typeof supabase.from === 'function') {
        const futId = this.currentFutebol.id;
        let p;
        if (!liveData) {
          const resetRow = {
            futebol_id: futId,
            status: 'ready',
            is_active: false,
            is_paused: false,
            waiting_next_opponent: false,
            waiting_tie_next_match: false,
            winner_team_id: null,
            winner_team_name: null,
            loser_team_id: null,
            is_tie: false,
            payload: null,
            updated_at: new Date().toISOString()
          };
          p = supabase.from('partida_ao_vivo').upsert([resetRow], { onConflict: 'futebol_id' });
        } else {
          const remainingSecs = liveData.remainingSeconds !== undefined 
            ? liveData.remainingSeconds 
            : (liveData.tempo_restante !== undefined ? liveData.tempo_restante : (liveData.timeRemaining !== undefined ? liveData.timeRemaining : 420));

          const status = liveData.status || (liveData.isActive ? (liveData.isPaused ? 'paused' : 'running') : 'ready');
          const winnerId = liveData.winnerTeamId || liveData.winner_team_id || null;
          const winnerName = liveData.winnerTeamName || liveData.winner_team_name || null;
          const loserId = liveData.loserTeamId || liveData.loser_team_id || null;
          const waitingNext = Boolean(liveData.waitingNextOpponent !== undefined ? liveData.waitingNextOpponent : liveData.waiting_next_opponent);
          const waitingTie = Boolean(liveData.waitingTieNextMatch !== undefined ? liveData.waitingTieNextMatch : liveData.waiting_tie_next_match);

          const row = {
            futebol_id: futId,
            status: status,
            order_num: liveData.order || 1,
            home_team_id: liveData.homeTeamId || liveData.home_team_id || 'time_1',
            away_team_id: liveData.awayTeamId || liveData.away_team_id || 'time_2',
            time_casa_nome: liveData.homeTeamName || liveData.time_casa_nome || 'Time 1',
            time_fora_nome: liveData.awayTeamName || liveData.time_fora_nome || 'Time 2',
            placar_casa: liveData.homeScore !== undefined ? liveData.homeScore : 0,
            placar_fora: liveData.awayScore !== undefined ? liveData.awayScore : 0,
            tempo_restante: remainingSecs,
            is_active: Boolean(liveData.isActive !== undefined ? liveData.isActive : (status === 'running' || status === 'paused')),
            is_paused: Boolean(liveData.isPaused !== undefined ? liveData.isPaused : (status === 'paused')),
            winner_team_id: winnerId,
            winner_team_name: winnerName,
            loser_team_id: loserId,
            is_tie: Boolean(liveData.isTie !== undefined ? liveData.isTie : liveData.is_tie),
            waiting_next_opponent: waitingNext,
            waiting_tie_next_match: waitingTie,
            tie_next_match: liveData.tieNextMatch || liveData.tie_next_match || null,
            last_match_summary: liveData.lastMatchSummary || liveData.last_match_summary || null,
            started_at: liveData.startedAt || liveData.started_at || null,
            paused_at: liveData.pausedAt || liveData.paused_at || null,
            duration_seconds: liveData.durationSeconds || (liveData.durationMinutes ? liveData.durationMinutes * 60 : 420),
            remaining_at_start: liveData.remainingAtStart !== undefined ? liveData.remainingAtStart : remainingSecs,
            elapsed_seconds: liveData.elapsedSeconds || 0,
            gols: liveData.goals || liveData.gols || [],
            payload: {
              ...liveData,
              winnerTeamId: winnerId,
              winner_team_id: winnerId,
              winnerTeamName: winnerName,
              winner_team_name: winnerName,
              loserTeamId: loserId,
              loser_team_id: loserId,
              waitingNextOpponent: waitingNext,
              waiting_next_opponent: waitingNext
            },
            updated_at: new Date().toISOString()
          };
          p = supabase.from('partida_ao_vivo').upsert([row], { onConflict: 'futebol_id' });
        }

        const promise = p.then(({ error }) => {
          if (error) {
            console.warn('[Storage] Erro ao sincronizar partida ao vivo:', error);
            throw error;
          }
          return true;
        });

        // Previne unhandled rejection para chamadores síncronos
        promise.catch(() => {});

        return promise;
      }

      return Promise.resolve(true);
    } catch (e) {
      throw e;
    }
  },

  async _syncRelationalTeams(futebolId, roundId, teams) {
    if (!futebolId || !roundId || !teams || typeof teams !== 'object') return;
    try {
      const teamKeys = Object.keys(teams);
      for (let i = 0; i < teamKeys.length; i++) {
        const teamKey = teamKeys[i];
        const team = teams[teamKey];
        if (!team) continue;
        const num = i + 1;
        const teamRow = {
          id: team.id && Utils.isUUID(team.id) ? team.id : Utils.generateUUID(),
          futebol_id: futebolId,
          rodada_id: roundId,
          numero: num,
          nome: team.name || `Time ${num}`,
          cor: team.color || DEFAULT_COLORS[teamKey] || '#3b82f6',
          total_estrelas: team.totalStars || 0
        };

        await supabase.from('times').upsert([teamRow], { onConflict: 'id' }).catch(() => {});

        if (Array.isArray(team.players)) {
          for (const player of team.players) {
            if (!player || !player.id) continue;
            const pId = Utils.isUUID(player.id) ? player.id : null;
            if (pId) {
              await supabase.from('time_jogadores').upsert([{
                time_id: teamRow.id,
                jogador_id: pId,
                futebol_id: futebolId
              }], { onConflict: 'time_id,jogador_id' }).catch(() => {});

              await supabase.from('rodada_jogadores').upsert([{
                rodada_id: roundId,
                jogador_id: pId,
                futebol_id: futebolId
              }], { onConflict: 'rodada_id,jogador_id' }).catch(() => {});
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Storage] Erro ao sincronizar times relacionais:', err);
    }
  },

  // Legacy compatibilidade com currentMatch
  getCurrentMatch() {
    return this.getLiveMatch();
  },

  saveCurrentMatch(match) {
    return this.saveLiveMatch(match);
  },

  // ============================================================================
  // RESET DE DADOS DO FUTEBOL ATUAL
  // ============================================================================
  resetAll() {
    this.assertAdmin('Resetar dados do futebol');
    try {
      const keys = [
        'players', 'selected_players', 'team_colors', 'rounds',
        'current_round', 'teams', 'draw_info', 'matches', 'live_match', 'capas', 'rodada_classificacao'
      ];
      keys.forEach(k => store.removeItem(this._getScopedKey(k)));
      this._emitChange('reset', null);
      return true;
    } catch (e) {
      throw e;
    }
  },

  _listeners: [],
  onChange(callback) {
    this._listeners.push(callback);
  },
  _emitChange(type, data) {
    this._listeners.forEach(cb => {
      try {
        cb(type, data);
      } catch (err) {
        console.error('Erro no listener de storage:', err);
      }
    });
  }
};

// Auto-inicializa na carga
Storage.init();
if (typeof window !== 'undefined') {
  window.StorageApp = Storage;
  window.FutStorage = Storage;
}
