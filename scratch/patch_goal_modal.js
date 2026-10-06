import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const storagePath = path.join(rootDir, 'js', 'storage.js');
let storageContent = fs.readFileSync(storagePath, 'utf8');

// Replace saveLiveMatch in js/storage.js
const regexSaveLive = / {2}(async )?saveLiveMatch\(liveData\) \{[\s\S]*?return true;\s*\} catch \(e\) \{\s*throw e;\s*\}\s*\},/;

const newSaveLive = `  saveLiveMatch(liveData) {
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
          const row = {
            futebol_id: futId,
            status: status,
            order_num: liveData.order || 1,
            home_team_id: liveData.homeTeamId || 'time_1',
            away_team_id: liveData.awayTeamId || 'time_2',
            time_casa_nome: liveData.homeTeamName || 'Time 1',
            time_fora_nome: liveData.awayTeamName || 'Time 2',
            placar_casa: liveData.homeScore !== undefined ? liveData.homeScore : 0,
            placar_fora: liveData.awayScore !== undefined ? liveData.awayScore : 0,
            tempo_restante: remainingSecs,
            is_active: Boolean(liveData.isActive !== undefined ? liveData.isActive : (status === 'running' || status === 'paused')),
            is_paused: Boolean(liveData.isPaused !== undefined ? liveData.isPaused : (status === 'paused')),
            winner_team_id: liveData.winnerTeamId || null,
            winner_team_name: liveData.winnerTeamName || null,
            loser_team_id: liveData.loserTeamId || null,
            is_tie: Boolean(liveData.isTie),
            waiting_next_opponent: Boolean(liveData.waitingNextOpponent),
            waiting_tie_next_match: Boolean(liveData.waitingTieNextMatch),
            tie_next_match: liveData.tieNextMatch || null,
            last_match_summary: liveData.lastMatchSummary || null,
            started_at: liveData.startedAt || liveData.started_at || null,
            paused_at: liveData.pausedAt || liveData.paused_at || null,
            duration_seconds: liveData.durationSeconds || (liveData.durationMinutes ? liveData.durationMinutes * 60 : 420),
            remaining_at_start: liveData.remainingAtStart !== undefined ? liveData.remainingAtStart : remainingSecs,
            elapsed_seconds: liveData.elapsedSeconds || 0,
            gols: liveData.goals || liveData.gols || [],
            payload: liveData,
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
  },`;

if (!regexSaveLive.test(storageContent)) {
  console.error('saveLiveMatch regex match failed!');
  process.exit(1);
}

const updatedStorageContent = storageContent.replace(regexSaveLive, newSaveLive);
const tempStorage = path.join(rootDir, 'js', 'storage_temp.js');
fs.writeFileSync(tempStorage, updatedStorageContent, 'utf8');
fs.renameSync(tempStorage, storagePath);
console.log('Successfully updated js/storage.js with safe dual-mode saveLiveMatch');
