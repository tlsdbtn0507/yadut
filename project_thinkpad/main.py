import os
import re
import asyncio
import logging
import httpx
import json
import html
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from zoneinfo import ZoneInfo
import uvicorn

# 터미널 환경에 상관없이 .env 파일 자동 로드
load_dotenv()

# --- [설정 및 경로] ---
MACBOOK_URL = os.getenv("MAC_EYE_URL", "http://100.84.129.54:8000")  # 맥북 FastAPI 서버 주소
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOUL_FILE = os.path.join(os.path.dirname(BASE_DIR), "hermes_core", "soul.md")
MEMORY_FILE = os.path.join(os.path.dirname(BASE_DIR), "hermes_core", "memory.md")
DEFAULT_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
DEFAULT_ALLOWED_ORIGIN_REGEX = r"https://.*\.vercel\.app"

# 로깅 설정
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

IMAGE_INTENT_CLARIFY_MESSAGE = (
    "마스터, 이미지를 확인했습니다. 이 이미지로 무엇을 도와드릴까요? "
    "일정 등록, 내용 분석, 요약 중 원하시는 작업을 말씀해 주십시오."
)
SCHEDULE_TARGET_KEYWORDS = ("캘린더", "일정", "스케줄", "근무표", "시간표")
SCHEDULE_ACTION_KEYWORDS = ("넣어", "등록", "추가", "동기화", "반영")

class ArcusMessageRequest(BaseModel):
    text: str = ""
    attachment_type: str | None = None
    attachment_data: str | None = None
    attachment_name: str = "upload.jpg"
    message_id: str = "http"

def is_bridge_authorized(authorization: str | None) -> bool:
    expected_token = os.getenv("THINKPAD_BRIDGE_TOKEN")
    if not expected_token or not authorization:
        return False

    return authorization == f"Bearer {expected_token}"

def get_allowed_origins() -> list[str]:
    raw_origins = os.getenv("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

def is_origin_allowed(origin: str | None) -> bool:
    if not origin:
        return True

    allowed_origins = get_allowed_origins()
    if "*" in allowed_origins or origin in allowed_origins:
        return True

    allowed_regex = os.getenv("ALLOWED_ORIGIN_REGEX", DEFAULT_ALLOWED_ORIGIN_REGEX)
    return bool(allowed_regex and re.fullmatch(allowed_regex, origin))

def get_current_context(now: datetime | None = None) -> str:
    current = now or datetime.now(ZoneInfo("Asia/Seoul"))
    weekdays = ("월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일")
    return (
        f"현재 한국 시간(KST): {current.year}년 {current.month}월 {current.day}일 "
        f"{weekdays[current.weekday()]} {current.hour}시 {current.minute:02d}분"
    )

def build_brain_prompt(soul_context: str, user_text: str, now: datetime | None = None) -> str:
    return f"{soul_context}\n\n[현재 컨텍스트]\n{get_current_context(now)}\n\nUser: {user_text}\nDecision:"

def has_explicit_schedule_sync_command(user_text: str) -> bool:
    normalized = re.sub(r"\s+", " ", user_text).strip()
    if not normalized:
        return False

    has_target = any(keyword in normalized for keyword in SCHEDULE_TARGET_KEYWORDS)
    has_action = any(keyword in normalized for keyword in SCHEDULE_ACTION_KEYWORDS)
    return has_target and has_action

def clean_search_text(value: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<.*?>", "", value))).strip()

def normalize_search_result(provider: str, title: str, url: str, snippet: str) -> dict:
    return {
        "provider": provider,
        "title": clean_search_text(title),
        "url": clean_search_text(url),
        "snippet": clean_search_text(snippet),
    }

def format_search_results(results: list[dict]) -> str:
    if not results:
        return "검색 결과 없음"

    lines = []
    for index, item in enumerate(results, start=1):
        lines.append(
            "\n".join(
                [
                    f"{index}. {item.get('title', '')}",
                    f"URL: {item.get('url', '')}",
                    f"요약: {item.get('snippet', '')}",
                ]
            )
        )
    return "\n\n".join(lines)

async def search_brave(query: str) -> list[dict]:
    api_key = os.getenv("BRAVE_SEARCH_API_KEY")
    if not api_key:
        raise RuntimeError("BRAVE_SEARCH_API_KEY is not configured")

    params = {
        "q": query,
        "count": 5,
        "country": "KR",
        "search_lang": "ko",
        "ui_lang": "ko-KR",
        "safesearch": "moderate",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params=params,
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": api_key,
            },
        )
        response.raise_for_status()
        data = response.json()

    return [
        normalize_search_result(
            "BRAVE",
            item.get("title", ""),
            item.get("url", ""),
            item.get("description", ""),
        )
        for item in data.get("web", {}).get("results", [])
    ]

async def search_duckduckgo(query: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 ARCUS"}) as client:
        response = await client.get("https://html.duckduckgo.com/html/", params={"q": query, "kl": "kr-ko"})
        response.raise_for_status()
        body = response.text

    blocks = re.findall(r'<div class="result(?: results_links_deep)?".*?</div>\s*</div>', body, re.S)
    results = []
    for block in blocks[:5]:
        title_match = re.search(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', block, re.S)
        snippet_match = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', block, re.S)
        if not title_match:
            continue
        results.append(
            normalize_search_result(
                "DUCKDUCKGO_FALLBACK",
                title_match.group(2),
                title_match.group(1),
                snippet_match.group(1) if snippet_match else "",
            )
        )
    return results

async def search_web(query: str) -> list[dict]:
    if not query.strip():
        return []

    try:
        brave_results = await search_brave(query)
        if brave_results:
            return brave_results
    except Exception as error:
        logging.warning(f"Brave search failed: {error}")

    try:
        return await search_duckduckgo(query)
    except Exception as error:
        logging.warning(f"DuckDuckGo fallback failed: {error}")
        return []

async def ask_gemma_with_search_context(original_question: str, query: str, results: list[dict]) -> str:
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            with open(SOUL_FILE, "r", encoding="utf-8") as f:
                soul_context = f.read()

            prompt = (
                f"{soul_context}\n\n"
                f"[현재 컨텍스트]\n{get_current_context()}\n\n"
                "[검색 결과]\n"
                f"검색어: {query}\n"
                f"{format_search_results(results)}\n\n"
                "위 검색 결과만 근거로 마스터의 질문에 답하십시오. "
                "검색 결과가 부족하거나 서로 충돌하면 그 한계를 분명히 말하십시오. "
                "중요한 주장에는 출처 URL을 함께 언급하십시오.\n\n"
                f"User: {original_question}\nFinal:"
            )

            brain_url = os.getenv("BRAIN_URL", "http://100.84.129.54:1234/v1")
            response = await client.post(
                f"{brain_url}/chat/completions",
                json={
                    "model": os.getenv("MODEL_NAME", "gemma-4-e4b-it"),
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.4,
                    "stream": False,
                },
            )
            data = response.json()
            raw_content = data["choices"][0]["message"]["content"]
            parsed = parse_brain_response(raw_content)
            if parsed.get("message"):
                return parsed["message"]
            return raw_content.strip()
        except Exception as error:
            logging.error(f"Search summary error: {error}")
            if not results:
                return "죄송합니다, 마스터. 검색 결과를 가져오지 못했습니다."
            return f"마스터님, 검색은 완료했지만 최종 요약 중 오류가 발생했습니다.\n\n{format_search_results(results)}"

async def handle_brain_decision(decision: dict, user_text: str) -> str:
    action = decision.get("action", "NONE")
    message = decision.get("message", "")

    if action == "WEB_SEARCH":
        query = str(decision.get("query") or user_text).strip()
        results = await search_web(query)
        return await ask_gemma_with_search_context(user_text, query, results)

    if action == "CLARIFY":
        return message or "마스터님, 요청을 조금 더 구체적으로 말씀해 주시겠습니까?"

    return message

async def process_arcus_message(
    text: str = "",
    attachment_type: str | None = None,
    attachment_data: str | None = None,
    attachment_name: str = "upload.jpg",
    message_id: str = "http",
) -> str | dict[str, object]:
    if attachment_type == "image" and attachment_data:
        if not text.strip():
            return IMAGE_INTENT_CLARIFY_MESSAGE

        if has_explicit_schedule_sync_command(text):
            intent = "SCHEDULE_SYNC"
        else:
            intent = await classify_image_intent(text, attachment_data)
        logging.info(f"Image intent classified as: {intent}")

        import base64
        try:
            image_bytes = base64.b64decode(attachment_data)
            temp_filename = f"schedule_{message_id}.jpg"

            async with httpx.AsyncClient(timeout=120.0) as client:
                files = {'file': (temp_filename, image_bytes, 'image/jpeg')}
                upload_res = await client.post(f"{MACBOOK_URL}/upload", files=files)
                upload_res.raise_for_status()
                upload_data = upload_res.json()

                if upload_data.get("status") != "success":
                    return "❌ 업로드 실패: 마스터, 이미지 업로드에 실패했습니다. 다시 전송해 주시겠습니까?"

                uploaded_filename = upload_data.get("filename")

                if intent == "SCHEDULE_SYNC":
                    logging.info(f"Starting schedule sync for {uploaded_filename}...")
                    sync_res = await client.get(f"{MACBOOK_URL}/sync_calendar/{uploaded_filename}")
                    sync_res.raise_for_status()
                    sync_result = sync_res.json()

                    if sync_result.get("status") == "success":
                        schedules = sync_result.get("schedules")
                        if isinstance(schedules, list):
                            return {
                                "message": sync_result.get("message", "마스터, 요청하신 캘린더 일정이 성공적으로 동기화되었습니다. 정상적으로 반영되었으니 캘린더를 확인해 주십시오!"),
                                "schedules": schedules,
                            }
                        return sync_result.get("message", "마스터, 요청하신 캘린더 일정이 성공적으로 동기화되었습니다. 정상적으로 반영되었으니 캘린더를 확인해 주십시오!")
                    return f"❌ 동기화 실패: {sync_result.get('message')}"

                logging.info(f"Starting multimodal image chat for {uploaded_filename}...")
                chat_files = {'file': (temp_filename, image_bytes, 'image/jpeg')}
                chat_res = await client.post(
                    f"{MACBOOK_URL}/chat_with_image",
                    params={"prompt": text},
                    files=chat_files
                )
                chat_res.raise_for_status()
                chat_result = chat_res.json()

                if chat_result.get("status") == "success":
                    return chat_result.get("message")
                return f"❌ 분석 실패: {chat_result.get('message')}"
        except Exception as e:
            logging.error(f"Arcus image processing error: {e}")
            return f"❌ 시스템 에러: {str(e)}"

    decision = await ask_gemma_brain(text)
    return await handle_brain_decision(decision, text)

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
            
            prompt = build_brain_prompt(soul_context, user_text)
            
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

async def classify_image_intent(user_text: str, base64_image: str) -> str:
    """Gemma 4를 통해 수신한 이미지가 시간표(SCHEDULE_SYNC)인지 일반 대화용 사진(IMAGE_CHAT)인지 분석"""
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            with open(SOUL_FILE, "r", encoding="utf-8") as f:
                soul_context = f.read()
                
            prompt = (
                f"{soul_context}\n\n"
                "마스터가 사진과 함께 다음 메시지를 보냈습니다: '" + (user_text if user_text else "(텍스트 없음)") + "'\n\n"
                "이 사진과 메시지를 보고, 다음 둘 중 하나로만 철저하게 판단해줘:\n"
                "- SCHEDULE_SYNC: 이미지에서 주간 근무 시간표를 추출하여 캘린더 일정을 등록해야 하는 요청인 경우.\n"
                "- IMAGE_CHAT: 캘린더 등록이 아니라, 마스터가 사진을 보며 대화하거나 질문하려는 일반적인 상황인 경우.\n\n"
                "응답은 반드시 오직 'SCHEDULE_SYNC' 또는 'IMAGE_CHAT'이라는 단어로만 답변해야 해. 다른 부가 설명은 절대 하지마."
            )
            
            brain_url = os.getenv("BRAIN_URL", "http://100.84.129.54:1234/v1")
            response = await client.post(
                f"{brain_url}/chat/completions",
                json={
                    "model": os.getenv("MODEL_NAME", "gemma-4-e4b-it"),
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ],
                    "temperature": 0.0,
                    "stream": False
                }
            )
            data = response.json()
            raw_content = data["choices"][0]["message"]["content"].strip()
            
            if "SCHEDULE_SYNC" in raw_content:
                return "SCHEDULE_SYNC"
            else:
                return "IMAGE_CHAT"
                
        except Exception as e:
            logging.error(f"Gemma intent classification error: {e}")
            # 에러 발생 시 안전하게 일반 사진 대화로 진행
            return "IMAGE_CHAT"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX", DEFAULT_ALLOWED_ORIGIN_REGEX),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "running", "service": "ARCUS ThinkPad Bridge"}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/arcus/message")
async def arcus_message_endpoint(
    payload: ArcusMessageRequest,
    authorization: str | None = Header(default=None),
):
    if not is_bridge_authorized(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized")

    response = await process_arcus_message(
        text=payload.text,
        attachment_type=payload.attachment_type,
        attachment_data=payload.attachment_data,
        attachment_name=payload.attachment_name,
        message_id=payload.message_id,
    )
    if isinstance(response, dict):
        return {"success": True, **response}

    return {"success": True, "message": response}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    origin = websocket.headers.get("origin")
    if not is_origin_allowed(origin):
        logging.warning(f"WebSocket rejected due to disallowed origin: {origin}")
        await websocket.close(code=1008)
        return

    await websocket.accept()
    logging.info("WebSocket connected from client")
    
    # --- [Stage 1 Security Handshake] ---
    WS_TOKEN = os.getenv("WS_TOKEN", "SECRET_KEY")
    try:
        # Wait up to 3.0 seconds for the first auth message
        auth_data_raw = await asyncio.wait_for(websocket.receive_text(), timeout=3.0)
        auth_json = json.loads(auth_data_raw)
        
        if auth_json.get("type") == "auth" and auth_json.get("token") == WS_TOKEN:
            # Send the secure success acknowledgement packet
            await websocket.send_text(json.dumps({"type": "auth_success"}))
            logging.info("WebSocket secure authentication successful.")
        else:
            logging.warning("WebSocket authentication failed: Invalid token.")
            await websocket.close(code=4003)
            return
    except Exception as e:
        logging.warning(f"WebSocket authentication failed / timeout: {e}")
        await websocket.close(code=4003)
        return
    # -------------------------------------
    
    try:
        while True:
            # 앱이 보낸 텍스트/JSON 데이터 수신
            data = await websocket.receive_text()
            logging.info(f"Received from WS: {data}")
            
            try:
                message_json = json.loads(data)
                text = message_json.get("text", "")
                attachment_type = message_json.get("attachment_type")
                attachment_data = message_json.get("attachment_data")
                attachment_name = message_json.get("attachment_name", "upload.jpg")
                message_id = message_json.get("message_id", "ws")
            except json.JSONDecodeError:
                text = data
                attachment_type = None
                attachment_data = None
            
            response_message = await process_arcus_message(
                text=text,
                attachment_type=attachment_type,
                attachment_data=attachment_data,
                attachment_name=attachment_name,
                message_id=message_id,
            )
            
            message = response_message["message"] if isinstance(response_message, dict) else response_message
            await websocket.send_text(str(message))
            logging.info(f"Sent to WS: {message}")
            
    except WebSocketDisconnect:
        logging.info("WebSocket disconnected from iOS app")

# --- [메인 실행부] ---
if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0으로 호스트를 설정하여 외부 기기(Tailscale 등)에서 접근 가능하게 함
    uvicorn.run(app, host="0.0.0.0", port=8000)
