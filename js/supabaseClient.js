/**
 * Supabase Client & Architecture Layer - Familia do Fut Multi-Tenant
 * Fornece interface padronizada com Supabase (Auth, Database, Realtime e RLS).
 * 
 * Suporta:
 * 1. Conexão real com Supabase quando URL e ANON KEY forem informados.
 * 2. Motor simulador de Supabase de alta fidelidade com RLS estrito e multi-tenancy
 *    para testes locais e execução sem dependência de internet.
 */

const CONFIG_KEY = 'familia_fut_supabase_config';
const DB_STORE_KEY = 'familia_fut_supabase_db';
const AUTH_STORE_KEY = 'familia_fut_supabase_auth';

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

export const SupabaseConfig = {
  getUrl() {
    try {
      const cfg = JSON.parse(getStorage().getItem(CONFIG_KEY) || '{}');
      return cfg.url || (typeof window !== 'undefined' ? window.__SUPABASE_URL__ : '') || '';
    } catch {
      return '';
    }
  },

  getAnonKey() {
    try {
      const cfg = JSON.parse(getStorage().getItem(CONFIG_KEY) || '{}');
      return cfg.anonKey || (typeof window !== 'undefined' ? window.__SUPABASE_ANON_KEY__ : '') || '';
    } catch {
      return '';
    }
  },

  isConfigured() {
    const url = this.getUrl();
    const key = this.getAnonKey();
    return Boolean(url && key && url.startsWith('http'));
  },

  saveConfig(url, anonKey) {
    getStorage().setItem(CONFIG_KEY, JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }));
    initSupabaseClient();
  }
};

// In-Memory / Local Storage Database para simulação de RLS e multi-tenancy com isolamento
class LocalSupabaseEngine {
  constructor() {
    this.subscribers = new Map();
    this.auth = {
      signUp: this.signUp.bind(this),
      signInWithPassword: this.signInWithPassword.bind(this),
      signOut: this.signOut.bind(this),
      getUser: this.getUser.bind(this),
      getSession: this.getSession.bind(this)
    };
    this._load();
  }

  _load() {
    const store = getStorage();
    try {
      this.tables = JSON.parse(store.getItem(DB_STORE_KEY) || '{}');
      this.authUsers = JSON.parse(store.getItem(AUTH_STORE_KEY) || '[]');
      this.currentSession = JSON.parse(store.getItem('familia_fut_current_session') || 'null');
    } catch {
      this.tables = {};
      this.authUsers = [];
      this.currentSession = null;
    }

    // Inicializa tabelas caso não existam
    const defaultTables = [
      'futebois', 'futebol_admins', 'jogadores', 'rodadas',
      'rodada_jogadores', 'times', 'time_jogadores', 'partidas',
      'partida_ao_vivo', 'gols', 'capas', 'rodada_classificacao'
    ];
    defaultTables.forEach(t => {
      if (!Array.isArray(this.tables[t])) this.tables[t] = [];
    });
  }

  _save() {
    const store = getStorage();
    try {
      store.setItem(DB_STORE_KEY, JSON.stringify(this.tables));
      store.setItem(AUTH_STORE_KEY, JSON.stringify(this.authUsers));
      store.setItem('familia_fut_current_session', JSON.stringify(this.currentSession));
    } catch (e) {
      console.warn('[SupabaseEngine] Erro ao persistir dados locais:', e);
    }
  }

  // Auth API
  async signUp({ email, password, options = {} }) {
    this._load();
    const existing = this.authUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return { data: null, error: { message: 'Usuário já cadastrado com este e-mail.' } };
    }
    const user = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7),
      email: email.toLowerCase(),
      password,
      user_metadata: options.data || {},
      created_at: new Date().toISOString()
    };
    this.authUsers.push(user);
    const session = { user, access_token: 'mock_token_' + user.id };
    this.currentSession = session;
    this._save();
    return { data: { user, session }, error: null };
  }

  async signInWithPassword({ email, password }) {
    this._load();
    const user = this.authUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) {
      return { data: { user: null, session: null }, error: { message: 'E-mail ou senha inválidos.' } };
    }
    const session = { user, access_token: 'mock_token_' + user.id };
    this.currentSession = session;
    this._save();
    return { data: { user, session }, error: null };
  }

  async signOut() {
    this.currentSession = null;
    this._save();
    return { error: null };
  }

  async getUser() {
    this._load();
    return { data: { user: this.currentSession ? this.currentSession.user : null }, error: null };
  }

  async getSession() {
    this._load();
    return { data: { session: this.currentSession }, error: null };
  }

  // Realtime Channels
  channel(channelName) {
    return {
      on: (event, filter, callback) => {
        const key = `${channelName}_${filter.table || 'all'}`;
        if (!this.subscribers.has(key)) this.subscribers.set(key, []);
        this.subscribers.get(key).push(callback);
        return {
          subscribe: () => ({ unsubscribe: () => {} })
        };
      },
      subscribe: () => ({ unsubscribe: () => {} })
    };
  }

  _broadcast(table, eventType, record) {
    this.subscribers.forEach((callbacks, key) => {
      if (key.includes(table) || key.endsWith('_all')) {
        callbacks.forEach(cb => {
          try {
            cb({ eventType, new: record, old: record });
          } catch (e) {
            console.error('Erro no callback de realtime:', e);
          }
        });
      }
    });
  }

  // Query Builder com verificação rigorosa de RLS
  from(tableName) {
    this._load();
    if (!this.tables[tableName]) this.tables[tableName] = [];

    const currentUser = this.currentSession ? this.currentSession.user : null;
    const self = this;

    return {
      _filters: [],
      _order: null,
      _single: false,
      _operation: 'SELECT',
      _updateValues: null,
      _insertRows: null,

      select(columns = '*') {
        this._operation = 'SELECT';
        return this;
      },

      eq(column, value) {
        this._filters.push({ column, value });
        return this;
      },

      order(column, { ascending = true } = {}) {
        this._order = { column, ascending };
        return this;
      },

      single() {
        this._single = true;
        return this;
      },

      delete() {
        this._operation = 'DELETE';
        return this;
      },

      update(values) {
        this._operation = 'UPDATE';
        this._updateValues = values;
        return this;
      },

      insert(rows) {
        this._operation = 'INSERT';
        this._insertRows = Array.isArray(rows) ? rows : [rows];
        return this;
      },

      catch(reject) {
        return new Promise((res, rej) => this.then(res, rej)).catch(reject);
      },

      async then(resolve, reject) {
        try {
          // --- OPERAÇÃO 1: INSERT ---
          if (this._operation === 'INSERT') {
            const rowsArr = this._insertRows || [];
            // RLS: Anônimo não pode fazer INSERT
            if (!currentUser) {
              return resolve({ data: null, error: { message: `RLS Error: New row violates row-level security policy for table "${tableName}". Operation not permitted for anonymous public users.` } });
            }

            for (const row of rowsArr) {
              if (!row.id) row.id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7);
              if (!row.created_at) row.created_at = new Date().toISOString();

              if (tableName !== 'futebois' && tableName !== 'futebol_admins') {
                const isFutebolAdmin = (self.tables.futebol_admins || []).some(
                  a => a.futebol_id === row.futebol_id && a.user_id === currentUser.id
                );
                if (!isFutebolAdmin) {
                  return resolve({ data: null, error: { message: `RLS Error: Permission denied. User is not an authorized administrator for futebol "${row.futebol_id}".` } });
                }
              }

              if (tableName === 'futebois') {
                if (row.historico_inicial_aberto === undefined) {
                  row.historico_inicial_aberto = true;
                }
              }

              const existingIdx = (self.tables[tableName] || []).findIndex(r => r.id === row.id);

              if (tableName === 'jogadores') {
                const fut = (self.tables.futebois || []).find(f => f.id === row.futebol_id);
                if (fut && fut.historico_inicial_aberto === false) {
                  if (existingIdx >= 0) {
                    // Jogador existente: não permite zerar ou alterar histórico após fechamento
                    const existingRow = self.tables[tableName][existingIdx];
                    row.gols_historicos_iniciais = existingRow.gols_historicos_iniciais || 0;
                    row.capas_historicas_iniciais = existingRow.capas_historicas_iniciais || 0;
                  } else {
                    // Novo jogador cadastrado após fechamento: entra obrigatoriamente com 0
                    row.gols_historicos_iniciais = 0;
                    row.capas_historicas_iniciais = 0;
                  }
                } else {
                  row.gols_historicos_iniciais = parseInt(row.gols_historicos_iniciais, 10) || 0;
                  row.capas_historicas_iniciais = parseInt(row.capas_historicas_iniciais, 10) || 0;
                }
              }

              // Restrição de unicidade para Capa por rodada e jogador
              if (tableName === 'capas') {
                const duplicate = (self.tables.capas || []).some(
                  c => c.rodada_id === row.rodada_id && c.jogador_id === row.jogador_id
                );
                if (duplicate) {
                  return resolve({ data: null, error: { message: `duplicate key value violates unique constraint "unique_capa_rodada_jogador"` } });
                }
              }

              if (existingIdx >= 0) {
                self.tables[tableName][existingIdx] = { ...self.tables[tableName][existingIdx], ...row };
              } else {
                self.tables[tableName].push(row);
              }
            }
            self._save();

            for (const row of rowsArr) {
              self._broadcast(tableName, 'INSERT', row);
            }
            return resolve({ data: this._single ? rowsArr[0] : rowsArr, error: null });
          }

          // --- OPERAÇÃO 2: UPDATE ---
          if (this._operation === 'UPDATE') {
            if (!currentUser) {
              return resolve({ data: null, error: { message: `RLS Error: Update violates row-level security policy for table "${tableName}". Operation not permitted for anonymous public users.` } });
            }

            const updatedRows = [];
            for (let i = 0; i < self.tables[tableName].length; i++) {
              const row = self.tables[tableName][i];
              const matches = this._filters.every(f => row[f.column] === f.value);
              if (matches) {
                if (tableName !== 'futebois') {
                  const futId = row.futebol_id || (this._updateValues && this._updateValues.futebol_id);
                  const isFutebolAdmin = (self.tables.futebol_admins || []).some(
                    a => a.futebol_id === futId && a.user_id === currentUser.id
                  );
                  if (!isFutebolAdmin) {
                    return resolve({ data: null, error: { message: `RLS Error: Permission denied. Cannot update data of another futebol.` } });
                  }
                }

                // Segurança: se a carga histórica foi fechada, impede alteração de gols e capas históricos
                if (tableName === 'jogadores') {
                  const futId = row.futebol_id;
                  const fut = (self.tables.futebois || []).find(f => f.id === futId);
                  if (fut && fut.historico_inicial_aberto === false) {
                    if (this._updateValues) {
                      const newGoals = this._updateValues.gols_historicos_iniciais;
                      const newCapas = this._updateValues.capas_historicas_iniciais;
                      if ((newGoals !== undefined && newGoals !== row.gols_historicos_iniciais) ||
                          (newCapas !== undefined && newCapas !== row.capas_historicas_iniciais)) {
                        return resolve({ data: null, error: { message: 'RLS Error: A carga histórica deste futebol já foi finalizada e os dados históricos estão bloqueados.' } });
                      }
                    }
                  }
                }

                self.tables[tableName][i] = { ...row, ...this._updateValues, updated_at: new Date().toISOString() };
                updatedRows.push(self.tables[tableName][i]);
              }
            }
            self._save();

            for (const updated of updatedRows) {
              self._broadcast(tableName, 'UPDATE', updated);
            }
            return resolve({ data: this._single ? updatedRows[0] : updatedRows, error: null });
          }

          // --- OPERAÇÃO 3: DELETE ---
          if (this._operation === 'DELETE') {
            if (!currentUser) {
              return resolve({ data: null, error: { message: `RLS Error: Delete violates row-level security policy for table "${tableName}". Operation not permitted for anonymous public users.` } });
            }

            const remaining = [];
            const deleted = [];

            for (const row of self.tables[tableName]) {
              const matches = this._filters.length === 0 || this._filters.every(f => row[f.column] === f.value);
              if (matches) {
                if (tableName !== 'futebois') {
                  const isFutebolAdmin = (self.tables.futebol_admins || []).some(
                    a => a.futebol_id === row.futebol_id && a.user_id === currentUser.id
                  );
                  if (!isFutebolAdmin) {
                    return resolve({ data: null, error: { message: `RLS Error: Permission denied. Cannot delete data of another futebol.` } });
                  }
                }
                deleted.push(row);
              } else {
                remaining.push(row);
              }
            }

            self.tables[tableName] = remaining;
            self._save();

            for (const d of deleted) {
              self._broadcast(tableName, 'DELETE', d);
            }
            return resolve({ data: deleted, error: null });
          }

          // --- OPERAÇÃO 4: SELECT ---
          let rows = [...self.tables[tableName]];
          for (const f of this._filters) {
            rows = rows.filter(r => r[f.column] === f.value);
          }

          if (this._order) {
            const { column, ascending } = this._order;
            rows.sort((a, b) => {
              if (a[column] > b[column]) return ascending ? 1 : -1;
              if (a[column] < b[column]) return ascending ? -1 : 1;
              return 0;
            });
          }

          if (this._single) {
            return resolve({ data: rows[0] || null, error: null });
          } else {
            return resolve({ data: rows, error: null });
          }
        } catch (e) {
          return resolve({ data: null, error: { message: e.message } });
        }
      }
    };
  }
}

// Instância singleton do cliente Supabase
export let supabase = null;

export function initSupabaseClient() {
  if (SupabaseConfig.isConfigured() && typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
    try {
      supabase = window.supabase.createClient(SupabaseConfig.getUrl(), SupabaseConfig.getAnonKey());
      console.log('✅ [Supabase] Conectado ao Supabase Cloud com chave anon!');
      return supabase;
    } catch (e) {
      console.warn('⚠️ [Supabase] Falha ao conectar ao Supabase Cloud, usando motor local:', e);
    }
  }

  // Motor com emulação estrita de RLS e multi-tenancy
  supabase = new LocalSupabaseEngine();
  console.log('🛡️ [Supabase] Motor Supabase Local ativo com validação de RLS e multi-tenancy.');
  return supabase;
}

// Inicializa cliente na carga do módulo
initSupabaseClient();
