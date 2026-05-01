import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Supabase 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 설정되지 않았습니다. ' +
      'admin-src/.env 또는 배포 환경(Vercel/Railway Variables)을 확인하세요.'
  )
}

export const supabase = createClient(url, key)
