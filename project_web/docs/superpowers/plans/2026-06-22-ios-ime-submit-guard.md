# iOS IME 강제 전송 방지 구현 계획

> **에이전트 작업 필수 지침:** 이 계획을 단계별로 실행할 때 `superpowers:test-driven-development`와 `superpowers:verification-before-completion`을 사용한다.

**목표:** iOS Chrome/WebKit에서 한글 조합 확정 이벤트가 Enter `keydown`으로 노출되더라도 채팅 메시지가 전송되지 않게 한다.

**구조:** 기존 순수 함수 `shouldSubmitChatKey`에 명시적 composition 세션 상태를 입력하고, 페이지 컴포넌트는 `compositionstart`부터 `compositionend` 직후 다음 이벤트 루프까지 해당 상태를 유지한다. 기존 `isComposing` 및 `keyCode === 229` 검사는 호환 방어로 유지한다.

**기술 스택:** Next.js 16, React 19, TypeScript, Vitest

---

### 작업 1: 회귀 테스트

**파일:**
- 수정: `src/utils/__tests__/chatKeyboard.test.ts`

- [ ] 브라우저가 `isComposing=false`, `keyCode=13`을 보고해도 명시적 composition 세션이 활성 상태이면 전송하지 않는 테스트를 추가한다.
- [ ] `npm run test:run -- src/utils/__tests__/chatKeyboard.test.ts`를 실행해 새 테스트가 예상대로 실패하는지 확인한다.

### 작업 2: 입력 가드 구현

**파일:**
- 수정: `src/utils/chatKeyboard.ts`
- 수정: `src/app/page.tsx`

- [ ] `ChatKeyEvent`에 `compositionSessionActive`를 추가하고 전송 조건에 반영한다.
- [ ] `page.tsx`에서 composition 상태와 해제 타이머를 ref로 관리한다.
- [ ] `onCompositionStart`, `onCompositionEnd`, `onKeyDown`을 연결하고 언마운트 시 타이머를 정리한다.
- [ ] 단위 테스트를 다시 실행해 통과를 확인한다.

### 작업 3: 전체 검증

**파일:**
- 검증: `project_web`

- [ ] `npm run test:run`으로 전체 테스트를 실행한다.
- [ ] `npm run lint`로 정적 검사를 실행한다.
- [ ] `npm run build`로 프로덕션 빌드와 타입 검사를 실행한다.
- [ ] diff를 검토해 승인된 범위 밖의 변경이 없는지 확인한다.
