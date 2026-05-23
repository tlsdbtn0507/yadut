from fastapi import FastAPI, Request, UploadFile, File
import subprocess
import os
import shutil
from datetime import datetime
import uvicorn
from fastapi.responses import FileResponse
from calendar_sync import sync_image_to_calendar

app = FastAPI()



@app.middleware("http")
async def log_requests(request: Request, call_next):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now}] {request.method} {request.url.path} 요청 수신")
    response = await call_next(request)
    print(f"[{now}] {request.method} {request.url.path} 처리 완료 (상태 코드: {response.status_code})")
    return response

# 스크린샷 저장 폴더 설정
SCREENSHOT_DIR = "./screenshots"
if not os.path.exists(SCREENSHOT_DIR):
    os.makedirs(SCREENSHOT_DIR)
    
@app.get("/")
async def root():
    return {"message": "JARVIS의 눈(Mac_Eye)이 온라인입니다."}

@app.get("/capture")
async def capture_screen():
    try:
        # 파일명 생성: screenshot_20260512_1830.png
        now = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"screenshot_{now}.png"
        filepath = os.path.join(SCREENSHOT_DIR, filename)

        # macOS 전용 캡처 명령 (-x: 소리 없이)
        # 중요: 터미널/VSCode에 '화면 기록' 권한이 있어야 합니다.
        subprocess.run(["screencapture", "-x", filepath], check=True)

        return {
            "status": "success",
            "filename": filename,
            "abs_path": os.path.abspath(filepath)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/download/{filename}")
async def download_file(filename: str):
    filepath = os.path.join(SCREENSHOT_DIR, filename)
    if os.path.exists(filepath):
        return FileResponse(filepath)
    return {"status": "error", "message": "파일을 찾을 수 없습니다."}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        os.makedirs(SCREENSHOT_DIR, exist_ok=True)
        now = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"remote_{now}_{file.filename}"
        filepath = os.path.join(SCREENSHOT_DIR, filename)
        
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {
            "status": "success",
            "filename": filename,
            "message": "이미지가 성공적으로 업로드되었습니다."
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/sync_calendar/{filename}")
async def sync_calendar(filename: str):
    try:
        filepath = os.path.join(SCREENSHOT_DIR, filename)
        if not os.path.exists(filepath):
            return {"status": "error", "message": "파일을 찾을 수 없습니다."}
        
        success = sync_image_to_calendar(filepath, use_local=False)
        if success:
            return {"status": "success", "message": "캘린더 동기화가 성공적으로 완료되었습니다!"}
        else:
            return {"status": "error", "message": "스케줄 추출 및 캘린더 등록에 실패했습니다."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/create_file")
async def create_file(item: dict):
    filename = item.get("filename")
    content = item.get("content")
    
    # 웹 파일 저장용 폴더
    web_dir = "./www"
    os.makedirs(web_dir, exist_ok=True)
    
    filepath = os.path.join(web_dir, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
        
    return {"status": "success", "path": os.path.abspath(filepath)}

if __name__ == "__main__":
    # 씽크패드가 접속할 수 있도록 0.0.0.0으로 개방
    uvicorn.run(app, host="0.0.0.0", port=8000)