# chadepo-web — Codex 작업 규칙

## 프로젝트 컨텍스트

- chadepo 리워드앱의 **랜딩 페이지 + 어드민 웹** 모노레포
- 구조:
  - `admin-src/` — 어드민 React 앱 (Vite + Tailwind)
  - `admin/` — 어드민 빌드 산출물
  - `index.html`, `legal/`, `privacy/`, `terms/` — 공개 페이지
- 백엔드: Supabase
- 배포: Railway (`railway.json`, `serve.json`)
- 주요 어드민 페이지: 대시보드, 사용자 관리, 교환 관리, 응모·추첨, 추천 프로그램, 부정이용 감지, 게임·미션, 문의 관리, 광고 분석
- 현재 단계: 오픈 전 코드 정리

## 절대 금지 (HARD RULES)

1. **운영 로직 변경 금지**
   - 교환 승인/거절 처리
   - 당첨 처리
   - 부정이용 판정 기준
   - 포인트 조정
2. Supabase 호출 시그니처 변경 금지 (테이블명, 컬럼명, RPC명, 필터 조건)
3. 권한 체크 로직 변경 금지 (관리자 권한 검증)
4. 새 메뉴/기능 추가 금지
5. 라이브러리 버전 변경 금지 (package.json 버전 고정)
6. 환경변수 하드코딩 금지 (`.env` 사용)

## 권장 정리 작업

- 사용하지 않는 import 제거
- 주석 처리된 dead code 제거
- `console.log` / `console.warn` → logger 또는 환경별 처리로 통일
  (단, `console.error`는 유지 — Sentry 연결 가능성)
- 매직 넘버/문자열 → `src/lib/constants/` 또는 `src/utils/constants.js`로 상수화
- 중복 컴포넌트 → `src/components/` 아래 통합 검토
- 한 파일 400줄 초과 시 분리 검토
- 사용하지 않는 `useState`, `useEffect` 의존성 정리

## 유지할 것

- 비즈니스 로직 설명 주석
- 운영 절차 관련 주석 (예: "교환 승인 시 포인트 차감 후 외부 API 호출")
- 이슈 번호 명시된 TODO

## 출력 규칙

- 변경 시 "변경 전 / 변경 후" 비교 제시
- 변경 이유 한 줄로 명시
- 한 번에 한 파일씩 진행
- 권한/Supabase 호출 영향 의심 시 즉시 멈추고 "확인 필요" 표시
- 응답은 한국어로

## 코드 스타일

- Prettier 기본 설정 준수
- 함수형 컴포넌트 + Hooks
- `async/await` 우선 (`then` 체인보다)
- `const` 우선

## 실행 명령

```bash
# 어드민 개발
cd admin-src && npm install && npm run dev

# 어드민 빌드
cd admin-src && npm run build

# 로컬 서빙 (랜딩 + admin)
npm install && npx serve .
```
