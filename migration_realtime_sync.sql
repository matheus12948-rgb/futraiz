-- ==============================================================================
-- FAMÍLIA DO FUT — MIGRAÇÃO DE SINCRONIZAÇÃO MULTIDISPOSITIVO (REALTIME SYNC)
-- Arquivo: migration_realtime_sync.sql
-- ==============================================================================
-- Este script foi elaborado para ser aplicado com SEGURANÇA no SQL Editor
-- do Supabase de produção existente.
--
-- CARACTERÍSTICAS DE SEGURANÇA:
-- 1. NÃO apaga dados (ZERO comandos DROP TABLE ou DELETE).
-- 2. NÃO recria tabelas existentes.
-- 3. NÃO recria nem altera usuários do auth.
-- 4. NÃO enfraquece o Row Level Security (RLS).
-- 5. 100% IDEMPOTENTE: pode ser executado múltiplas vezes sem erros.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABELAS BASE (Garante criação apenas se alguma tabela não existir)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rodada_jogadores (
    rodada_id UUID REFERENCES public.rodadas(id) ON DELETE CASCADE NOT NULL,
    jogador_id UUID REFERENCES public.jogadores(id) ON DELETE CASCADE NOT NULL,
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (rodada_id, jogador_id)
);

CREATE TABLE IF NOT EXISTS public.times (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    rodada_id UUID REFERENCES public.rodadas(id) ON DELETE CASCADE NOT NULL,
    numero INT NOT NULL CHECK (numero BETWEEN 1 AND 4),
    nome TEXT NOT NULL,
    cor TEXT NOT NULL,
    total_estrelas INT DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.time_jogadores (
    time_id UUID REFERENCES public.times(id) ON DELETE CASCADE NOT NULL,
    jogador_id UUID REFERENCES public.jogadores(id) ON DELETE CASCADE NOT NULL,
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (time_id, jogador_id)
);

CREATE TABLE IF NOT EXISTS public.capas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    futebol_id UUID REFERENCES public.futebois(id) ON DELETE CASCADE NOT NULL,
    rodada_id UUID REFERENCES public.rodadas(id) ON DELETE CASCADE NOT NULL,
    jogador_id UUID REFERENCES public.jogadores(id) ON DELETE CASCADE NOT NULL,
    time_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT unique_capa_rodada_jogador UNIQUE (rodada_id, jogador_id)
);

-- ------------------------------------------------------------------------------
-- 2. ATUALIZAÇÃO DA TABELA: rodadas
-- Adiciona colunas para persistência do sorteio e elenco oficial no Supabase
-- ------------------------------------------------------------------------------

ALTER TABLE public.rodadas ADD COLUMN IF NOT EXISTS teams JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.rodadas ADD COLUMN IF NOT EXISTS selected_player_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.rodadas ADD COLUMN IF NOT EXISTS selected_players JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.rodadas ADD COLUMN IF NOT EXISTS draw_info JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.rodadas ADD COLUMN IF NOT EXISTS standings_snapshot JSONB DEFAULT NULL;

-- ------------------------------------------------------------------------------
-- 3. ATUALIZAÇÃO DA TABELA: partida_ao_vivo
-- Adiciona colunas para controle oficial do jogo, timer unificado e sincronização
-- ------------------------------------------------------------------------------

ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ready';
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS order_num INT DEFAULT 1;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS home_team_id TEXT DEFAULT 'time_1';
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS away_team_id TEXT DEFAULT 'time_2';
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS winner_team_id TEXT;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS winner_team_name TEXT;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS loser_team_id TEXT;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS is_tie BOOLEAN DEFAULT false;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS waiting_next_opponent BOOLEAN DEFAULT false;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS waiting_tie_next_match BOOLEAN DEFAULT false;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS tie_next_match JSONB DEFAULT NULL;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS last_match_summary JSONB DEFAULT NULL;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 420;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS elapsed_seconds INT DEFAULT 0;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS remaining_at_start INT;
ALTER TABLE public.partida_ao_vivo ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;

-- Garante constraint UNIQUE em futebol_id para upsert atômico de partida_ao_vivo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.partida_ao_vivo'::regclass
          AND (conname = 'partida_ao_vivo_futebol_id_key' OR conname = 'unique_partida_ao_vivo_futebol')
    ) THEN
        ALTER TABLE public.partida_ao_vivo
        ADD CONSTRAINT unique_partida_ao_vivo_futebol UNIQUE (futebol_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Garante constraint UNIQUE em capas (rodada_id, jogador_id) para idempotência
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.capas'::regclass
          AND conname = 'unique_capa_rodada_jogador'
    ) THEN
        ALTER TABLE public.capas
        ADD CONSTRAINT unique_capa_rodada_jogador UNIQUE (rodada_id, jogador_id);
    END IF;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 4. ÍNDICES DE PERFORMANCE
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_times_futebol ON public.times(futebol_id);
CREATE INDEX IF NOT EXISTS idx_times_rodada ON public.times(rodada_id);
CREATE INDEX IF NOT EXISTS idx_capas_futebol ON public.capas(futebol_id);
CREATE INDEX IF NOT EXISTS idx_capas_jogador ON public.capas(jogador_id);
CREATE INDEX IF NOT EXISTS idx_rodada_jogadores_futebol ON public.rodada_jogadores(futebol_id);
CREATE INDEX IF NOT EXISTS idx_time_jogadores_futebol ON public.time_jogadores(futebol_id);

-- ------------------------------------------------------------------------------
-- 5. REPLICA IDENTITY FULL (Para Realtime receber payload completo em UPDATEs)
-- ------------------------------------------------------------------------------

ALTER TABLE public.partida_ao_vivo REPLICA IDENTITY FULL;
ALTER TABLE public.rodadas REPLICA IDENTITY FULL;

-- ------------------------------------------------------------------------------
-- 6. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------

ALTER TABLE public.times ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_jogadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rodada_jogadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partida_ao_vivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rodadas ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 7. POLÍTICAS DE RLS (Preserva isolamento: público lê, apenas admin altera)
-- ------------------------------------------------------------------------------

-- times
DROP POLICY IF EXISTS "Publico le times" ON public.times;
CREATE POLICY "Publico le times" ON public.times FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia times" ON public.times;
CREATE POLICY "Admin gerencia times" ON public.times
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = times.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- time_jogadores
DROP POLICY IF EXISTS "Publico le jogadores dos times" ON public.time_jogadores;
CREATE POLICY "Publico le jogadores dos times" ON public.time_jogadores FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia jogadores dos times" ON public.time_jogadores;
CREATE POLICY "Admin gerencia jogadores dos times" ON public.time_jogadores
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = time_jogadores.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- rodada_jogadores
DROP POLICY IF EXISTS "Publico le jogadores da rodada" ON public.rodada_jogadores;
CREATE POLICY "Publico le jogadores da rodada" ON public.rodada_jogadores FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia jogadores da rodada" ON public.rodada_jogadores;
CREATE POLICY "Admin gerencia jogadores da rodada" ON public.rodada_jogadores
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = rodada_jogadores.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- capas
DROP POLICY IF EXISTS "Publico le capas" ON public.capas;
CREATE POLICY "Publico le capas" ON public.capas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin gerencia capas" ON public.capas;
CREATE POLICY "Admin gerencia capas" ON public.capas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.futebol_admins
            WHERE futebol_admins.futebol_id = capas.futebol_id
            AND futebol_admins.user_id = auth.uid()
        )
    );

-- ------------------------------------------------------------------------------
-- 8. PUBLICAÇÃO SUPABASE REALTIME (Inclusão 100% idempotente)
-- Só adiciona a tabela se ela ainda NÃO estiver na publicação supabase_realtime.
-- Se já estiver, não gera erro nem duplica.
-- ------------------------------------------------------------------------------

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'partida_ao_vivo',
        'partidas',
        'gols',
        'capas',
        'rodadas',
        'times',
        'time_jogadores',
        'rodada_jogadores',
        'jogadores',
        'futebois'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        IF EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE schemaname = 'public' AND tablename = t
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;
