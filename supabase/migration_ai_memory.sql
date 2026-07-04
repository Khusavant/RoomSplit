-- ============================================================
-- AI MEMORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  memory_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policies
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_memory_select" ON public.ai_memory FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ai_memory_insert" ON public.ai_memory FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "ai_memory_delete" ON public.ai_memory FOR DELETE USING (user_id = auth.uid());

-- Enable Realtime
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'ai_memory'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_memory;
  END IF;
END $$;
