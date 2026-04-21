-- ============================================================
-- 차데포 어드민 셋업 SQL
-- Supabase SQL Editor에서 한 번 실행하면 됩니다
-- ============================================================

-- 1. 어드민 계정 테이블
CREATE TABLE IF NOT EXISTS admin_users (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_own" ON admin_users
  FOR SELECT USING (auth.uid() = user_id);

-- 2. 어드민 여부 확인 함수
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;

-- 3. profiles 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_read_profiles' AND tablename = 'profiles') THEN
    EXECUTE 'CREATE POLICY "admin_read_profiles" ON profiles FOR SELECT USING (is_admin())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_update_profiles' AND tablename = 'profiles') THEN
    EXECUTE 'CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE USING (is_admin())';
  END IF;
END $$;

-- 4. energy_logs 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_read_energy_logs' AND tablename = 'energy_logs') THEN
    EXECUTE 'CREATE POLICY "admin_read_energy_logs" ON energy_logs FOR SELECT USING (is_admin())';
  END IF;
END $$;

-- 5. point_logs 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_read_point_logs' AND tablename = 'point_logs') THEN
    EXECUTE 'CREATE POLICY "admin_read_point_logs" ON point_logs FOR SELECT USING (is_admin())';
  END IF;
END $$;

-- 6. point_transactions 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_read_point_tx' AND tablename = 'point_transactions') THEN
    EXECUTE 'CREATE POLICY "admin_read_point_tx" ON point_transactions FOR SELECT USING (is_admin())';
  END IF;
END $$;

-- 7. exchange_items 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_exchange_items' AND tablename = 'exchange_items') THEN
    EXECUTE 'CREATE POLICY "admin_all_exchange_items" ON exchange_items FOR ALL USING (is_admin())';
  END IF;
END $$;

-- 8. exchange_requests 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_exchange_requests' AND tablename = 'exchange_requests') THEN
    EXECUTE 'CREATE POLICY "admin_all_exchange_requests" ON exchange_requests FOR ALL USING (is_admin())';
  END IF;
END $$;

-- 9. raffle 테이블들 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_raffle_items' AND tablename = 'raffle_items') THEN
    EXECUTE 'CREATE POLICY "admin_all_raffle_items" ON raffle_items FOR ALL USING (is_admin())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_raffle_rounds' AND tablename = 'raffle_rounds') THEN
    EXECUTE 'CREATE POLICY "admin_all_raffle_rounds" ON raffle_rounds FOR ALL USING (is_admin())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_read_raffle_entries' AND tablename = 'raffle_entries') THEN
    EXECUTE 'CREATE POLICY "admin_read_raffle_entries" ON raffle_entries FOR SELECT USING (is_admin())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_raffle_winners' AND tablename = 'raffle_winners') THEN
    EXECUTE 'CREATE POLICY "admin_all_raffle_winners" ON raffle_winners FOR ALL USING (is_admin())';
  END IF;
END $$;

-- 10. referral 테이블들 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_referral_events' AND tablename = 'referral_events') THEN
    EXECUTE 'CREATE POLICY "admin_all_referral_events" ON referral_events FOR ALL USING (is_admin())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_read_referral_bonus' AND tablename = 'referral_energy_bonus') THEN
    EXECUTE 'CREATE POLICY "admin_read_referral_bonus" ON referral_energy_bonus FOR SELECT USING (is_admin())';
  END IF;
END $$;

-- 11. game_plays 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_read_game_plays' AND tablename = 'game_plays') THEN
    EXECUTE 'CREATE POLICY "admin_read_game_plays" ON game_plays FOR SELECT USING (is_admin())';
  END IF;
END $$;

-- 12. mission_definitions 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_mission_defs' AND tablename = 'mission_definitions') THEN
    EXECUTE 'CREATE POLICY "admin_all_mission_defs" ON mission_definitions FOR ALL USING (is_admin())';
  END IF;
END $$;

-- 13. step_logs 어드민 정책
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_read_step_logs' AND tablename = 'step_logs') THEN
    EXECUTE 'CREATE POLICY "admin_read_step_logs" ON step_logs FOR SELECT USING (is_admin())';
  END IF;
END $$;

-- 14. 어드민용 포인트 수동 조정 함수
CREATE OR REPLACE FUNCTION admin_adjust_points(
  p_user_id UUID,
  p_amount   INTEGER,
  p_note     TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles
    SET points = points + p_amount,
        total_points_earned = CASE WHEN p_amount > 0 THEN total_points_earned + p_amount ELSE total_points_earned END
    WHERE id = p_user_id;
  INSERT INTO point_logs(user_id, amount, source, note)
    VALUES (p_user_id, p_amount, 'admin_adjust', p_note);
END;
$$;

-- 15. 어드민용 에너지 수동 조정 함수
CREATE OR REPLACE FUNCTION admin_adjust_energy(
  p_user_id UUID,
  p_amount   INTEGER,
  p_note     TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles
    SET energy = GREATEST(0, energy + p_amount)
    WHERE id = p_user_id;
  INSERT INTO energy_logs(user_id, amount, source, note)
    VALUES (p_user_id, p_amount, 'admin_adjust', p_note);
END;
$$;

-- 16. 어드민용 대시보드 통계 함수
CREATE OR REPLACE FUNCTION admin_get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v JSON;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT json_build_object(
    'total_users',       (SELECT COUNT(*) FROM profiles),
    'today_signups',     (SELECT COUNT(*) FROM profiles WHERE created_at::date = CURRENT_DATE),
    'flagged_users',     (SELECT COUNT(*) FROM profiles WHERE is_flagged = true),
    'pending_exchanges', (SELECT COUNT(*) FROM exchange_requests WHERE status = 'pending'),
    'today_points_issued', (SELECT COALESCE(SUM(amount),0) FROM point_logs WHERE amount > 0 AND created_at::date = CURRENT_DATE),
    'today_energy_issued', (SELECT COALESCE(SUM(amount),0) FROM energy_logs WHERE amount > 0 AND created_at::date = CURRENT_DATE),
    'active_raffle_rounds', (SELECT COUNT(*) FROM raffle_rounds WHERE status = 'open')
  ) INTO v;
  RETURN v;
END;
$$;

-- 완료 메시지
DO $$ BEGIN
  RAISE NOTICE '✅ 차데포 어드민 셋업 완료!';
END $$;
