# 모바일 채팅 Composer Viewport 구현 계획

> **에이전트 작업자 필수:** `superpowers:executing-plans`로 작업 단위별 실행한다.

**목표:** iPhone 키보드가 열리면 composer가 키보드 바로 위에 붙고, 닫히면 safe area 위 화면 최하단으로 복귀하며, 첨부 미리보기와 전송 후 레이아웃도 자연스럽게 정리한다.

**아키텍처:** `window.visualViewport`의 높이와 위쪽 오프셋을 전용 훅에서 추적해 앱 셸 CSS 변수로 전달한다. 채팅 화면은 메시지 스크롤 영역과 composer를 flex 흐름으로 유지하고 첨부 미리보기는 composer 높이에 포함한다.

**기술 스택:** Next.js 16.2.6, React 19.2.4, TypeScript, CSS Modules, Vitest, Testing Library

**명세:** 2026-10-27 사용자 승인 — `visualViewport` 기반 2번 방식

## 전역 제약

- PC 레이아웃과 기존 한글 IME 전송 동작을 유지한다.
- 외부 의존성을 추가하지 않고 TypeScript `any`를 사용하지 않는다.
- Vercel 및 기존 체크아웃의 미커밋 파일은 변경하지 않는다.
- viewport 책임은 30~40줄 이내의 별도 훅에 둔다.

## 리뷰 중점

- `visualViewport` 미지원 브라우저는 `innerHeight`로 폴백한다.
- 키보드 닫힘, 화면 회전, Safari UI 변화의 resize/scroll을 반영한다.
- 첨부 미리보기는 메시지를 덮지 않고 제거·전송 후 빈 공간을 남기지 않는다.
- 한글 IME 및 메시지 자동 스크롤이 회귀하지 않는다.

---

### Task 1: Visual Viewport 높이 동기화

**Files:**
- Create: `src/hooks/useVisualViewportHeight.ts`
- Create: `src/hooks/__tests__/useVisualViewportHeight.test.tsx`

**Interfaces:**
- Produces: `useVisualViewportHeight(): React.CSSProperties`

- [ ] 실패 테스트: 초기 값, resize/scroll 갱신, API 미지원 폴백
- [ ] `npm test -- --run src/hooks/__tests__/useVisualViewportHeight.test.tsx`로 RED 확인
- [ ] 최소 훅 구현 및 이벤트 cleanup
- [ ] 같은 명령으로 GREEN 확인

### Task 2: 앱 셸과 composer 레이아웃 적용

**Files:**
- Modify: `src/components/ArcusConsole.tsx`
- Modify: `src/app/page.module.css`
- Modify: `src/components/__tests__/ArcusConsole.test.tsx`

**Interfaces:**
- Consumes: Task 1의 `useVisualViewportHeight(): React.CSSProperties`
- Produces: viewport에 맞는 앱 셸과 흐름 안에 포함된 첨부 미리보기

- [ ] 실패 테스트: 앱 셸 viewport 스타일, 첨부 표시·제거, 전송 후 정리
- [ ] 관련 컴포넌트 테스트 RED 확인
- [ ] 훅 연결, flex 높이 경계 및 첨부 행 CSS 최소 수정
- [ ] 관련 컴포넌트 테스트 GREEN 확인

### Task 3: 회귀 검증

**Files:**
- Verify: `src/app/__tests__/mobileInputZoom.test.ts`
- Verify: `src/utils/__tests__/chatKeyboard.test.ts`

- [ ] 모바일 입력·IME 테스트
- [ ] 전체 테스트
- [ ] lint
- [ ] `git diff --check`와 변경 범위 확인
