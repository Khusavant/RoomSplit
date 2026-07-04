-- ============================================================
-- 0. CLEAR DATABASE (As requested for a fresh start)
-- ============================================================
-- This will wipe all rooms, members, expenses, and settlements.
-- It keeps your user profiles completely intact.
TRUNCATE TABLE public.rooms CASCADE;

-- ============================================================
-- 1. PROFILES TABLE (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  upi_id TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Limit to max users (configurable, default 4)
CREATE OR REPLACE FUNCTION check_max_users()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.profiles) >= 4 THEN
    RAISE EXCEPTION 'Maximum number of users (4) reached. Registration is closed.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_max_users ON public.profiles;
CREATE TRIGGER enforce_max_users
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION check_max_users();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. CATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📦',
  color TEXT NOT NULL DEFAULT '#4ade80',
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default categories if table is empty
INSERT INTO public.categories (name, icon, color, is_default)
SELECT * FROM (VALUES 
  ('Food & Dining', '🍕', '#f97316', TRUE),
  ('Groceries', '🛒', '#22c55e', TRUE),
  ('Rent', '🏠', '#3b82f6', TRUE),
  ('Utilities', '💡', '#eab308', TRUE),
  ('Transport', '🚗', '#8b5cf6', TRUE),
  ('Entertainment', '🎬', '#ec4899', TRUE),
  ('Shopping', '🛍️', '#14b8a6', TRUE),
  ('Health', '💊', '#ef4444', TRUE),
  ('Travel', '✈️', '#06b6d4', TRUE),
  ('Subscriptions', '📱', '#a855f7', TRUE),
  ('Education', '📚', '#f59e0b', TRUE),
  ('Other', '📦', '#6b7280', TRUE)
) AS v(name, icon, color, is_default)
WHERE NOT EXISTS (SELECT 1 FROM public.categories);

-- ============================================================
-- 3. ROOMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. ROOM MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

-- Force add the status column if the table already existed before this script
ALTER TABLE public.room_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted'));

-- ============================================================
-- 5. EXPENSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL REFERENCES public.profiles(id),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_interval TEXT CHECK (recurrence_interval IN ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_end_date DATE,
  receipt_url TEXT,
  notes TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. EXPENSE SPLITS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  share_amount DECIMAL(12, 2) NOT NULL CHECK (share_amount >= 0),
  share_percentage DECIMAL(5, 2),
  is_settled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(expense_id, user_id)
);

-- ============================================================
-- 7. SETTLEMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  from_user UUID NOT NULL REFERENCES public.profiles(id),
  to_user UUID NOT NULL REFERENCES public.profiles(id),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  method TEXT DEFAULT 'cash' CHECK (method IN ('cash', 'upi', 'bank_transfer', 'other')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (from_user != to_user)
);

-- ============================================================
-- 8. NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('expense_added', 'settlement', 'room_invite', 'reminder', 'ai_insight')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. AI CHAT HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. BACKFILL SCRIPT (Fix for missing profiles)
-- ============================================================
-- Ensures any account that signed up before the tables were fully 
-- created gets a profile, preventing foreign key errors.
INSERT INTO public.profiles (id, name, email)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)), 
  email 
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 11. ROW LEVEL SECURITY POLICIES (With Anti-Recursion Fixes)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to ensure clean state
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Anti-Recursion Helper Function for Admin checks
CREATE OR REPLACE FUNCTION public.is_room_admin(check_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = check_room_id AND user_id = auth.uid() AND role = 'admin' AND status = 'accepted'
  );
$$ LANGUAGE sql SECURITY DEFINER;


-- Profiles Policies
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Categories Policies
CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_insert" ON public.categories FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "categories_update" ON public.categories FOR UPDATE USING (auth.uid() = created_by OR is_default = TRUE);

-- Rooms Policies
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT USING (
  created_by = auth.uid() OR
  EXISTS (SELECT 1 FROM public.room_members WHERE room_members.room_id = rooms.id AND room_members.user_id = auth.uid() AND room_members.status = 'accepted')
);
CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE USING (public.is_room_admin(id));
CREATE POLICY "rooms_delete" ON public.rooms FOR DELETE USING (created_by = auth.uid());

-- Room Members Policies
CREATE POLICY "room_members_select" ON public.room_members FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "room_members_insert" ON public.room_members FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "room_members_update" ON public.room_members FOR UPDATE USING (user_id = auth.uid() OR public.is_room_admin(room_id));
CREATE POLICY "room_members_delete" ON public.room_members FOR DELETE USING (
  user_id = auth.uid() OR public.is_room_admin(room_id)
);

-- Expenses Policies
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.room_members WHERE room_id = expenses.room_id AND user_id = auth.uid() AND status = 'accepted')
);
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.room_members WHERE room_id = room_id AND user_id = auth.uid() AND status = 'accepted')
);
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (
  payer_id = auth.uid() OR public.is_room_admin(room_id)
);

-- Expense Splits Policies
CREATE POLICY "expense_splits_select" ON public.expense_splits FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.expenses e
    JOIN public.room_members rm ON rm.room_id = e.room_id
    WHERE e.id = expense_id AND rm.user_id = auth.uid()
  )
);
CREATE POLICY "expense_splits_insert" ON public.expense_splits FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "expense_splits_update" ON public.expense_splits FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Settlements Policies
CREATE POLICY "settlements_select" ON public.settlements FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.room_members WHERE room_id = settlements.room_id AND user_id = auth.uid() AND status = 'accepted')
);
CREATE POLICY "settlements_insert" ON public.settlements FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.room_members WHERE room_id = room_id AND user_id = auth.uid() AND status = 'accepted')
);

-- Notifications Policies
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE USING (user_id = auth.uid());

-- AI Conversations Policies
CREATE POLICY "ai_conversations_select" ON public.ai_conversations FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ai_conversations_insert" ON public.ai_conversations FOR INSERT WITH CHECK (user_id = auth.uid());


-- ============================================================
-- 12. NOTIFICATION TRIGGERS
-- ============================================================

-- Notify when someone is added to a room
CREATE OR REPLACE FUNCTION notify_room_member_added()
RETURNS TRIGGER AS $$
DECLARE
  room_name TEXT;
BEGIN
  -- Only notify if they were added by someone else (not the room creator who is auto-added)
  IF EXISTS (SELECT 1 FROM public.rooms WHERE id = NEW.room_id AND created_by != NEW.user_id) THEN
    SELECT name INTO room_name FROM public.rooms WHERE id = NEW.room_id;
    
    INSERT INTO public.notifications (user_id, room_id, type, title, message, metadata)
    VALUES (
      NEW.user_id,
      NEW.room_id,
      'room_invite',
      'Room Invitation',
      'You were invited to join the room "' || room_name || '"',
      jsonb_build_object('room_id', NEW.room_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_room_member_added ON public.room_members;
CREATE TRIGGER on_room_member_added
  AFTER INSERT ON public.room_members
  FOR EACH ROW EXECUTE FUNCTION notify_room_member_added();

-- Notify room members when expense is added
CREATE OR REPLACE FUNCTION notify_expense_added()
RETURNS TRIGGER AS $$
DECLARE
  member RECORD;
  payer_name TEXT;
  room_name TEXT;
BEGIN
  SELECT name INTO payer_name FROM public.profiles WHERE id = NEW.payer_id;
  SELECT name INTO room_name FROM public.rooms WHERE id = NEW.room_id;
  
  FOR member IN
    SELECT user_id FROM public.room_members WHERE room_id = NEW.room_id AND user_id != NEW.payer_id
  LOOP
    INSERT INTO public.notifications (user_id, room_id, type, title, message, metadata)
    VALUES (
      member.user_id,
      NEW.room_id,
      'expense_added',
      'New Expense Added',
      payer_name || ' added "' || NEW.description || '" for ₹' || NEW.amount || ' in ' || room_name,
      jsonb_build_object('expense_id', NEW.id, 'payer_id', NEW.payer_id, 'amount', NEW.amount)
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_expense_added ON public.expenses;
CREATE TRIGGER on_expense_added
  AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION notify_expense_added();

-- Notify when settlement is made
CREATE OR REPLACE FUNCTION notify_settlement()
RETURNS TRIGGER AS $$
DECLARE
  from_name TEXT;
  room_name TEXT;
BEGIN
  SELECT name INTO from_name FROM public.profiles WHERE id = NEW.from_user;
  SELECT name INTO room_name FROM public.rooms WHERE id = NEW.room_id;
  
  INSERT INTO public.notifications (user_id, room_id, type, title, message, metadata)
  VALUES (
    NEW.to_user,
    NEW.room_id,
    'settlement',
    'Payment Received',
    from_name || ' settled ₹' || NEW.amount || ' in ' || room_name,
    jsonb_build_object('settlement_id', NEW.id, 'from_user', NEW.from_user, 'amount', NEW.amount)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_settlement_made ON public.settlements;
CREATE TRIGGER on_settlement_made
  AFTER INSERT ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION notify_settlement();

-- ============================================================
-- 13. HELPER VIEWS
-- ============================================================

-- View for room balances calculation
CREATE OR REPLACE VIEW public.room_balance_summary AS
SELECT
  rm.room_id,
  rm.user_id,
  p.name AS user_name,
  p.avatar_url,
  COALESCE((
    SELECT SUM(e.amount) FROM public.expenses e
    WHERE e.room_id = rm.room_id AND e.payer_id = rm.user_id AND e.is_deleted = FALSE
  ), 0) AS total_paid,
  COALESCE((
    SELECT SUM(es.share_amount) FROM public.expense_splits es
    JOIN public.expenses e ON e.id = es.expense_id
    WHERE e.room_id = rm.room_id AND es.user_id = rm.user_id AND e.is_deleted = FALSE
  ), 0) AS total_share,
  COALESCE((
    SELECT SUM(s.amount) FROM public.settlements s
    WHERE s.room_id = rm.room_id AND s.from_user = rm.user_id
  ), 0) AS total_settled_sent,
  COALESCE((
    SELECT SUM(s.amount) FROM public.settlements s
    WHERE s.room_id = rm.room_id AND s.to_user = rm.user_id
  ), 0) AS total_settled_received
FROM public.room_members rm
JOIN public.profiles p ON p.id = rm.user_id;

-- ============================================================
-- 14. ENABLE REALTIME
-- ============================================================
-- Safely add tables to publication (ignores if already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'expense_splits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_splits;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'settlements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.settlements;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'room_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_members;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
  END IF;
END $$;

-- ============================================================
-- 15. RELOAD SCHEMA CACHE
-- ============================================================
NOTIFY pgrst, 'reload schema';
