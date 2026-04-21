import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
  ?? 'https://dfxdrtmioocerybkacfq.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmeGRydG1pb29jZXJ5YmthY2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMTgwMDksImV4cCI6MjA5MTU5NDAwOX0.JPokec85pCy4Bf6dcg7iatj-6sHWMi2OWppCVwgi_kk'

export const supabase = createClient(url, key)
