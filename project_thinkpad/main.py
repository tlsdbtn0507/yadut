import os
import re
import asyncio
import logging
from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, MessageHandler, filters
import httpx
import json
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
import uvicorn

# 터미널 환경에 상관없이 .env 파일 자동 로드
load_dotenv()

# --- [설정 및 경로] ---
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
MACBOOK_URL = os.getenv("MAC_EYE_URL", "http://100.84.129.54:8000")  # 맥북 FastAPI 서버 주소
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOUL_FILE = os.path.join(os.path.dirname(BASE_DIR), "hermes_core", "soul.md")
MEMORY_FILE = os.path.join(os.path.dirname(BASE_DIR), "hermes_core", "memory.md")

# 로깅 설정
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

# 글로벌 상태 관리 (단순화)
PENDING_ACTION = {"type": None, "content": None}

def parse_brain_response(raw_text: str) -> dict:
    """LLM 응답에서 마크다운 블록을 제거하고 안전하게 JSON 딕셔너리로 파싱합니다."""
    cleaned = raw_text.strip()
    
    # 마크다운 백틱 및 불필요한 줄바꿈 제거
    cleaned = re.sub(r"^```(?:json)?\n?", "", cleaned).strip()
    cleaned = re.sub(r"\n?```$", "", cleaned).strip()
    
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # 완전한 쓰레기 텍스트 등으로 파싱 실패 시 Fallback
        return {"message": "에러: 브레인 응답을 해석할 수 없습니다.", "action": "NONE"}

# --- [핵심 기능: 브레인 엔진 연동] ---
async def ask_gemma_brain(user_text):
    """LM Studio (OpenAI 호환 API) 의도 분석 요청 및 JSON 응답 반환"""
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            with open(SOUL_FILE, "r", encoding="utf-8") as f:
                soul_context = f.read()
            
            prompt = f"{soul_context}\n\nUser: {user_text}\nDecision:"
            
            brain_url = os.getenv("BRAIN_URL", "http://100.84.129.54:1234/v1")
            response = await client.post(
                f"{brain_url}/chat/completions",
                json={
                    "model": os.getenv("MODEL_NAME", "gemma-4-e4b-it"),
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7,
                    "stream": False
                }
            )
            # LM Studio(OpenAI) 규격에 맞게 추출 후 파싱
            data = response.json()
            raw_content = data["choices"][0]["message"]["content"]
            
            return parse_brain_response(raw_content)
            
        except Exception as e:
            return {"message": f"ERROR_COMMUNICATION: {str(e)}", "action": "NONE"}

async def execute_capture_skill(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """맥북 캡처 스킬 실행 및 텔레그램 업로드 (정상 복구본)"""
    await update.message.reply_text("📸 맥북 화면을 캡처합니다...")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # 1. 맥북에 캡처 명령 내리기 (GET /capture)
            res = await client.get(f"{MACBOOK_URL}/capture")
            res_data = res.json()
            
            if res_data.get("status") == "success":
                filename = res_data.get("filename")
                await update.message.reply_text("✅ 캡처 성공! 이미지를 가져옵니다...")
                
                # 2. 캡처된 파일 다운로드 (GET /download/{filename})
                img_res = await client.get(f"{MACBOOK_URL}/download/{filename}")
                
                # 3. 텔레그램으로 사진 바로 전송 (reply_photo 사용)
                await update.message.reply_photo(
                    photo=img_res.content,
                    write_timeout=60,
                    connect_timeout=60
                )
            else:
                await update.message.reply_text(f"❌ 캡처 실패: {res_data.get('message')}")
                
        except Exception as e:
            logging.error(f"Capture error: {e}")
            await update.message.reply_text(f"❌ 통신 에러: {str(e)}")

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """유저가 보낸 스케줄 이미지를 맥북 서버로 전달하여 캘린더 동기화"""
    await update.message.reply_text("🗓️ 스케줄 이미지를 수신했습니다. 분석 및 캘린더 등록을 시작합니다...")
    
    try:
        # 1. 이미지 다운로드 (가장 높은 해상도 선택)
        photo_file = await update.message.photo[-1].get_file()
        image_bytes = await photo_file.download_as_bytearray()
        
        # 임시 파일명 (업로드용)
        temp_filename = f"schedule_{update.message.message_id}.jpg"
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            # 2. 맥북 서버로 이미지 업로드 (Multipart form-data)
            files = {'file': (temp_filename, bytes(image_bytes), 'image/jpeg')}
            upload_res = await client.post(f"{MACBOOK_URL}/upload", files=files)
            upload_res.raise_for_status()
            
            upload_data = upload_res.json()
            
            if upload_data.get("status") == "success":
                # 서버에서 저장된 실제 파일명 추출
                uploaded_filename = upload_data.get("filename")
                await update.message.reply_text("✅ 이미지 업로드 완료. 캘린더 분석을 진행합니다...")
                
                # 3. 캘린더 동기화 실행 (수정된 규격: GET /sync_calendar/{filename})
                sync_res = await client.get(f"{MACBOOK_URL}/sync_calendar/{uploaded_filename}")
                sync_res.raise_for_status()
                sync_result = sync_res.json()
                
                if sync_result.get("status") == "success":
                    message = sync_result.get("message", "캘린더 등록이 성공적으로 완료되었습니다!")
                    await update.message.reply_text(f"🚀 {message}")
                else:
                    error_msg = sync_result.get("message", "분석 중 오류가 발생했습니다.")
                    await update.message.reply_text(f"❌ 동기화 실패: {error_msg}")
            else:
                await update.message.reply_text(f"❌ 업로드 실패: {upload_data.get('message')}")
                
    except Exception as e:
        logging.error(f"Schedule sync error: {e}")
        await update.message.reply_text(f"❌ 시스템 에러: {str(e)}")

# --- [텔레그램 핸들러] ---
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global PENDING_ACTION
    user_text = update.message.text
    
    # 1. 마스터의 승인 처리 ("그래", "해줘" 등)
    if PENDING_ACTION["type"] == "CONFIRM_SOUL" and ("그래" in user_text or "승인" in user_text):
        callback = PENDING_ACTION.get("callback")
        if callback:
            await callback(update, context, PENDING_ACTION["content"])
        else:
            # Fallback for old style (if any)
            with open(SOUL_FILE, "w", encoding="utf-8") as f:
                f.write(PENDING_ACTION["content"])
            await update.message.reply_text("⚙️ 시스템 업데이트 완료. 아르커스의 자아가 갱신되었습니다.")
        
        PENDING_ACTION = {"type": None, "content": None}
        return

    # 2. 의도 분석 시작
    await update.message.reply_chat_action("typing")
    decision = await ask_gemma_brain(user_text)

    # 3. 판단 결과에 따른 분기 실행
    if not decision or not isinstance(decision, dict):
        await update.message.reply_text("⚠️ 브레인 연결에 실패했습니다. LM Studio 상태를 확인하세요.")
        return

    action = decision.get("action", "NONE")
    message = decision.get("message", "")

    # [분기 1: 화면 캡처 스캔]
    if action == "CAPTURE":
        await execute_capture_skill(update, context)

    # [분기 2: 설정 및 취향 수정 요청]
    elif action == "UPDATE_PREFERENCE" or action == "UPDATE_SOUL":
        async def apply_preference(update, context, new_pref):
            with open(SOUL_FILE, "r", encoding="utf-8") as f:
                content = f.read()
            
            # [PREFERENCE_START]와 [PREFERENCE_END] 사이의 내용만 교체
            pattern = r"(\[PREFERENCE_START\]).*?(\[PREFERENCE_END\])"
            replacement = f"\\1\n- {new_pref}\n\\2"
            new_soul = re.sub(pattern, replacement, content, flags=re.DOTALL)
            
            with open(SOUL_FILE, "w", encoding="utf-8") as f:
                f.write(new_soul)
            await update.message.reply_text(f"⚙️ 설정 반영 완료. 아르커스가 새로운 정보를 기억했습니다.\n업데이트 내용: {new_pref}")

        PENDING_ACTION = {
            "type": "CONFIRM_SOUL", 
            "content": message,
            "callback": apply_preference
        }
        await update.message.reply_text(f"⚠️ 설정을 업데이트할까요?\n내용: {message}\n\n'그래'라고 하시면 반영하겠습니다.")

    # [분기 3: 일반 대화]
    else:
        await update.message.reply_text(message)

# --- [텔레그램 봇 및 FastAPI 통합] ---

# 텔레그램 봇 앱 생성
bot_app = ApplicationBuilder().token(TELEGRAM_TOKEN).build()
bot_app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_message))
bot_app.add_handler(MessageHandler(filters.PHOTO, handle_photo))

@asynccontextmanager
async def lifespan(api_app: FastAPI):
    # 폴더가 없으면 생성
    os.makedirs(os.path.join(os.path.dirname(BASE_DIR), "hermes_core"), exist_ok=True)
    if not os.path.exists(SOUL_FILE):
        with open(SOUL_FILE, "w") as f: f.write("I am ARCUS.")
    
    # 텔레그램 봇 초기화 및 시작 (백그라운드 실행)
    await bot_app.initialize()
    await bot_app.start()
    await bot_app.updater.start_polling()
    print("🚀 ARCUS ThinkPad Bridge (Telegram Bot) 가동 시작...")
    yield
    # 종료 시 봇 정지
    await bot_app.updater.stop()
    await bot_app.stop()
    await bot_app.shutdown()
    print("🛑 ARCUS ThinkPad Bridge 종료.")

app = FastAPI(lifespan=lifespan)

@app.get("/")
async def root():
    return {"status": "running", "service": "ARCUS ThinkPad Bridge"}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logging.info("WebSocket connected from iOS app")
    try:
        while True:
            # 앱이 보낸 텍스트 메시지 수신
            data = await websocket.receive_text()
            logging.info(f"Received from WS: {data}")
            
            # 기존 브레인 엔진(Gemma)에 의도 분석 요청
            decision = await ask_gemma_brain(data)
            
            # 분석 결과에서 message 내용을 추출하여 iOS 앱에 전송
            response_message = decision.get("message", "")
            await websocket.send_text(response_message)
            logging.info(f"Sent to WS: {response_message}")
            
    except WebSocketDisconnect:
        logging.info("WebSocket disconnected from iOS app")

# --- [메인 실행부] ---
if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0으로 호스트를 설정하여 외부 기기(Tailscale 등)에서 접근 가능하게 함
    uvicorn.run(app, host="0.0.0.0", port=8000)