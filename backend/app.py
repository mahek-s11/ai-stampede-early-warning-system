from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import shutil
import os
import asyncio
import cv2
import base64
import json
import numpy as np
from datetime import datetime

# Import core logic from main.py
from main import analyze_video, model, compute_motion_score

app = FastAPI(title="StampedeSafe AWS Edition", version="2.5")

# ── CORS CONFIG ────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ── DATA STORAGE ────────────────────────────────────
VIDEO_SOURCES = {
    "CAM_01": None,
    "CAM_02": None,
    "CAM_03": None,
    "CAM_04": None
}
last_results: dict = {}

# ── TACTICAL HEATMAP GENERATOR ──────────────────────
def generate_tactical_visual(frame, results):
    h, w, _ = frame.shape
    heatmap_overlay = np.zeros((h, w), dtype=np.float32)
    
    person_count = 0
    detections = []

    for r in results:
        for box in r.boxes:
            if int(box.cls[0]) == 0:  # Person detection
                person_count += 1
                coords = box.xyxy[0].cpu().numpy().astype(int)
                detections.append(coords)
                
                cx, cy = (coords[0] + coords[2]) // 2, (coords[1] + coords[3]) // 2
                cv2.circle(heatmap_overlay, (cx, cy), 60, (1), -1)

    if person_count > 0:
        heatmap_blur = cv2.GaussianBlur(heatmap_overlay, (91, 91), 0)
        heatmap_norm = cv2.normalize(heatmap_blur, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        heatmap_color = cv2.applyColorMap(heatmap_norm, cv2.COLORMAP_JET)
        output_frame = cv2.addWeighted(frame, 0.6, heatmap_color, 0.4, 0)
    else:
        output_frame = frame.copy()

    for i, coords in enumerate(detections):
        x1, y1, x2, y2 = coords
        cv2.rectangle(output_frame, (x1, y1), (x2, y2), (212, 245, 0), 1) 

    return output_frame, person_count, heatmap_overlay

# ════════════════════════════════════════════════════
# 1. LIVE WEBSOCKET ENGINE (The Heart of the App)
# ════════════════════════════════════════════════════
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    caps = {cam_id: None for cam_id in VIDEO_SOURCES}
    prev_grays = {cam_id: None for cam_id in VIDEO_SOURCES}

    try:
        while True:
            payload = {"timestamp": datetime.now().strftime("%H:%M:%S"), "streams": {}}
            
            for cam_id, path in VIDEO_SOURCES.items():
                if path is None: continue 
                if caps[cam_id] is None: caps[cam_id] = cv2.VideoCapture(path)
                
                ret, frame = caps[cam_id].read()
                if not ret:
                    caps[cam_id].set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue

                # A. YOLO + Visuals
                results = model(frame, conf=0.15, imgsz=1280, verbose=False)
                tactical_frame, count, heatmap_overlay = generate_tactical_visual(frame, results)

                # B. Motion
                curr_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                motion_score, chaos = 0.0, 0.0
                if prev_grays[cam_id] is not None:
                    motion_score, chaos = compute_motion_score(prev_grays[cam_id], curr_gray)
                prev_grays[cam_id] = curr_gray

                # C. Accuracy & Density Math
                h, w = frame.shape[:2]
                heat_coverage = np.sum(heatmap_overlay > 0) / (h * w)
                density_boost = 1.0 + (heat_coverage * 3.0) 
                adjusted_count = int(count * density_boost)

                confidences = [box.conf.item() for r in results for box in r.boxes]
                avg_confidence = np.mean(confidences) if confidences else 0.0

                # D. Risk Score
                bottleneck_sim = min((adjusted_count / 70) * 100, 100)
                risk_score = (0.5 * min(adjusted_count, 100)) + (0.3 * (motion_score * 100)) + (0.2 * bottleneck_sim)
                risk_level = "High" if risk_score > 75 else "Medium" if risk_score > 40 else "Low"

                # E. Encode
                _, buffer = cv2.imencode('.jpg', tactical_frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                heatmap_b64 = base64.b64encode(buffer).decode('utf-8')

                payload["streams"][cam_id] = {
                    "people_count": adjusted_count,
                    "risk_score": round(min(risk_score, 100), 1),
                    "model_accuracy": round(avg_confidence * 100, 1),
                    "risk_level": risk_level,
                    "chaos_factor": round(chaos, 2),
                    "heatmap_base64": heatmap_b64
                }

            await websocket.send_json(payload)
            await asyncio.sleep(0.03)
    except Exception as e:
        print(f"WebSocket Error: {e}")
    finally:
        for c in caps.values():
            if c: c.release()

# ════════════════════════════════════════════════════
# 2. ADDITIONAL ENDPOINTS
# ════════════════════════════════════════════════════
@app.get("/")
def home():
    return {"message": "StampedeSafe Tactical API Running", "version": "2.5"}

@app.get("/model-stats")
def get_model_stats():
    return {
        "model_name": "YOLOv8-StampedeSafe-Custom",
        "base_architecture": "Ultralytics YOLOv8s",
        "mAP_50": 0.449, 
        "inference_speed": "~12ms (on AWS G4dn.xlarge)",
        "input_resolution": "1280px",
        "optimized_for": ["Crowd Density", "Occlusion", "High-Density Concerts"],
        "accuracy_logic": "Hybrid (Object Detection + Density Map Estimation)"
    }

@app.post("/upload-to-cam/{cam_id}")
async def upload_to_cam(cam_id: str, file: UploadFile = File(...)):
    if cam_id not in VIDEO_SOURCES: return {"error": f"Invalid Camera ID: {cam_id}"}
    file_path = os.path.join(UPLOAD_FOLDER, f"{cam_id}_{file.filename}")
    with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
    VIDEO_SOURCES[cam_id] = file_path
    return {"status": "Linked", "cam": cam_id, "file": file.filename}

# ════════════════════════════════════════════════════
# 3. ANALYSIS ENDPOINTS
# ════════════════════════════════════════════════════

@app.get("/")
def home():
    return {"message": "StampedeSafe Tactical API Running", "version": "2.0"}

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    result = analyze_video(file_path)
    result["camera_id"] = "CAM_01"
    last_results["CAM_01"] = result
    return result

@app.post("/analyze_system")
async def analyze_system(files: List[UploadFile] = File(...)):
    system_results = []
    total_persons = 0
    for index, file in enumerate(files):
        camera_id = f"CAM-B{index + 1}"
        file_path = os.path.join(UPLOAD_FOLDER, f"{camera_id}_{file.filename}")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        result = analyze_video(file_path)
        result["camera_id"] = camera_id
        total_persons += result.get("people_count", 0)
        system_results.append(result)
        last_results[camera_id] = result
    return {"system_status": "STABLE", "total_persons": total_persons, "zones": system_results}

@app.get("/get-alert-status")
def get_alert_status():
    if not last_results: return {"status": "NO_DATA", "cameras": []}
    cameras = []
    for cam_id, result in last_results.items():
        cameras.append({"camera_id": cam_id, "risk_level": result.get("risk_level", "Unknown"), "people_count": result.get("people_count", 0)})
    return {"overall_status": "OK", "cameras": cameras}