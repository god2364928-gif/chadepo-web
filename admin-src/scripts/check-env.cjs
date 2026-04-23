#!/usr/bin/env node
/**
 * 빌드 사전 체크
 *
 * Vite 빌드는 환경변수가 비어 있어도 그대로 통과해 버리기 때문에,
 * 그 결과물이 운영에 올라가면 어드민 사이트가 백지로 표시되는 사고가 난다.
 * (실제 사례: 2026-04-23 PR-3A 배포)
 *
 * 이 스크립트는 빌드 시작 직전에 필수 환경변수 존재 여부를 검사하고,
 * 하나라도 비어 있으면 즉시 빌드를 실패시켜 깨진 결과물이 만들어지는 것을 막는다.
 *
 * 로컬 개발자: admin-src/.env 파일에 값 채워야 함
 * Railway 배포: Service Variables 에 등록되어 있어야 함 (빌드 컨테이너에 ENV 로 주입됨)
 */

const fs = require('fs')
const path = require('path')

const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

function loadDotEnvIntoProcess() {
  const envPath = path.resolve(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = val
  }
}

loadDotEnvIntoProcess()

const missing = REQUIRED.filter((k) => {
  const v = process.env[k]
  return v === undefined || v === null || String(v).trim() === ''
})

if (missing.length > 0) {
  console.error('\n❌ 빌드 중단: 필수 환경변수가 비어 있습니다.')
  console.error('   누락된 변수: ' + missing.join(', '))
  console.error('')
  console.error('   📌 로컬에서 빌드하는 경우:')
  console.error('      admin-src/.env 파일을 만들고 값을 채우세요.')
  console.error('      참고: admin-src/.env.example')
  console.error('')
  console.error('   📌 Railway 에서 빌드하는 경우:')
  console.error('      Project → Service Variables 화면에 등록되어 있는지 확인하세요.')
  console.error('')
  process.exit(1)
}

console.log('✅ 환경변수 사전 체크 통과 (' + REQUIRED.join(', ') + ')')
