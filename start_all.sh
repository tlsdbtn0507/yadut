#!/bin/bash
# start_all.sh

echo -e "\033[1;33m[SYSTEM] 아르커스 통합 서비스 기동 중...\033[0m"

# 1. 맥북 로컬 서버 (Auto-Reload 모드 + 초록색 태그 지정)
echo -e "\033[1;32m[SYSTEM] 맥북 로컬 서버(mac_eye) 백그라운드 구동 시작...\033[0m"
cd /Users/sin-yusu/yadut/project_mac
.venv/bin/python -m uvicorn mac_eye:app --host 0.0.0.0 --port 8000 --reload 2>&1 | awk '{print "\033[1;32m[MACBOOK]\033[0m " $0}' &
MAC_PID=$!

# 2. 씽크패드 원격 서버 (Auto-Reload 모드 + 청록색 태그 지정)
echo -e "\033[1;36m[SYSTEM] 씽크패드 서버(main) 백그라운드 구동 시작...\033[0m"
# ※ 씽크패드의 실제 절대 경로와 계정을 설정하세요.
ssh -o StrictHostKeyChecking=no yusu@100.122.25.31 "cd /home/yusu/yadut/project_thinkpad && .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload" 2>&1 | awk '{print "\033[1;36m[THINKPAD]\033[0m " $0}' &
THINK_PID=$!

echo -e "\033[1;33m[SYSTEM] 모든 서비스가 연결되었습니다! 코드 변경 시 즉시 반영됩니다.\033[0m"
echo -e "\033[1;33m[SYSTEM] 중지하려면 Ctrl+C를 누르십시오.\033[0m\n"

# Ctrl+C 수신 시 씽크패드 프로세스와 로컬 프로세스를 모두 안전하게 킬(Kill)하고 종료하는 래퍼
cleanup() {
    echo -e "\n\033[1;31m[SYSTEM] 서비스를 안전하게 중단하는 중...\033[0m"
    kill $MAC_PID 2>/dev/null
    ssh -o StrictHostKeyChecking=no yusu@100.122.25.31 "pkill -f 'uvicorn main:app'" 2>/dev/null
    echo -e "\033[1;32m[SYSTEM] 모든 프로세스가 중지되었습니다.\033[0m"
    exit
}

trap cleanup INT TERM
wait
