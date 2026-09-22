# ThinkPad 로컬 대화 DB 구현 계획

승인된 대화 내 계획과 docs/gpt6_thinkpad_sqlite_prompt.md가 요구사항이다.
현재 작업 트리의 B안 변경을 보존하고 codex/b-design(4799e69)을 기준으로 codex/thinkpad-conversation-db에서 진행한다. 커밋·푸시·배포하지 않는다.

- [x] SQLite 저장·마이그레이션·첨부 원본 보관 및 테스트
- [x] 원본 ID·revision·변경 로그·추출 상태 인터페이스 및 테스트
- [x] 인증 API와 SSE terminal 저장 연결 및 테스트
- [x] 인증 BFF와 기존 B안 UI 연결 및 테스트
- [x] 전체 검증, 운영·백업 문서, 최종 리뷰 (환경 의존 실패는 별도 기록)

데이터 흐름: 브라우저 → 인증 BFF → ThinkPad 첨부 저장 → 사용자 메시지 커밋 → 기존 처리 → assistant 결과 커밋 → completed.
실패는 사용자 메시지 상태로만 기록한다. 재시도는 동일 ID로 중복 저장·실행을 막는다.
DB와 첨부 기본 경로는 ~/.local/share/yadut이며 저장소 내부 경로는 거부한다.
온톨로지는 구현하지 않는다. message_changes의 증가 커서와 (message_id, revision, processing_version) 처리 상태를 제공한다.
변경·삭제 provenance는 메시지의 불변 ID와 revision을 통해 추적한다.

## 기준선 및 판단 기록
- ThinkPad: .venv/bin/python -m pytest tests -q → 30 passed.
- Web: npm run test:run → 86 passed, RealThinkPadConnection 1 failed (실제 하드웨어 연결).
- 기존 main과 codex/b-design은 같은 커밋이므로 같은 작업 트리의 새 브랜치를 사용한다.
- 사용자의 이번 승인이 구현 승인이다. 별도 스킬 문서 승인/커밋 단계는 사용자 절차로 대체한다.
- 기존 MacBook 분석 흐름은 유지한다. 새 대화 저장 계층만 ThinkPad 로컬에 저장한다.
- PDF는 원본 저장·복원만 제공한다. 분석하지 않은 PDF를 분석했다고 답하지 않는다.

- 진행 검증: ThinkPad tests + __tests__ 46 passed. Web 93 passed / 하드웨어 연결 1 failed.
- 전체 bare pytest는 vendored gemini-superpowers 샘플의 flask/bcrypt 미설치로 수집 실패. 애플리케이션 테스트와 분리 보고한다.
- 원본 수정 이력은 message_revisions에 보존하며 삭제 시 본문은 지우고 ID/revision만 유지한다.

## 최종 상태 (2026-09-22)
- ThinkPad 앱 테스트 50 passed; Web 96 passed / 기존 실제 하드웨어 연결 1 failed.
- Web lint 및 Next.js production build 통과. git diff --check 통과.
- 전체 bare pytest는 별도 샘플 테스트의 flask/bcrypt 미설치로 수집 실패하며 이번 코드 회귀가 아니다.
- 독립 리뷰 발견 2건(이미지 준비 경쟁, 수정된 assistant 재생)을 테스트로 재현 후 수정했다.
- 운영·스키마·API·온톨로지 연결 계약·백업/복구·변경 파일 목록: docs/thinkpad-conversation-db.md.
- 실제 데이터 입력, 온톨로지 추출, 커밋·푸시·배포는 하지 않았다.
