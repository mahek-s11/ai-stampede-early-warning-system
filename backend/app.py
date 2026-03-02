from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import shutil
import os
from main import analyze_video

app = FastAPI(title="StampedeSafe API", version="2.0")

# ── CORS ────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# In-memory store for last results (per camera)
# Allows /get-alert-status to return latest state without re-processing
last_results: dict = {}


# ════════════════════════════════════════════════════
# HEALTH CHECK
# ════════════════════════════════════════════════════
@app.get("/")
def home():
    return {
        "message": "StampedeSafe API Running",
        "version": "2.0",
        "endpoints": ["/analyze", "/analyze_system", "/get-heatmap/{camera_id}", "/get-alert-status"]
    }


# ════════════════════════════════════════════════════
# SINGLE CAMERA ANALYSIS
# ════════════════════════════════════════════════════
@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):

    file_path = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    result = analyze_video(file_path)
    result["camera_id"] = "CAM_01"

    # Store for later queries
    last_results["CAM_01"] = result

    return result


# ════════════════════════════════════════════════════
# MULTI-CAMERA SYSTEM
# ════════════════════════════════════════════════════
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

        # Store per-camera
        last_results[camera_id] = result

    # ── ZONE COUNTS ──
    high_risk_zones   = sum(1 for r in system_results if r.get("risk_level") == "High")
    medium_risk_zones = sum(1 for r in system_results if r.get("risk_level") == "Medium")
    low_risk_zones    = sum(1 for r in system_results if r.get("risk_level") == "Low")

    # ── SYSTEM STATUS ──
    if high_risk_zones >= 1:
        system_status = "CRITICAL"
    elif medium_risk_zones >= 1:
        system_status = "WARNING"
    else:
        system_status = "STABLE"

    # ── AGGREGATE SCORES ──
    avg_risk   = round(sum(r.get("risk_score", 0) for r in system_results) / len(system_results), 1)
    bottleneck = sum(1 for r in system_results if r.get("bottleneck_detected", False))

    return {
        "system_status":      system_status,
        "total_persons":      total_persons,
        "average_risk_score": avg_risk,
        "high_risk_zones":    high_risk_zones,
        "medium_risk_zones":  medium_risk_zones,
        "low_risk_zones":     low_risk_zones,
        "active_incidents":   high_risk_zones,
        "bottleneck_zones":   bottleneck,
        "zones":              system_results
    }


# ════════════════════════════════════════════════════
# GET HEATMAP  →  returns base64 JPEG image
# Frontend displays it as: <img src="data:image/jpeg;base64,{data}">
# ════════════════════════════════════════════════════
@app.get("/get-heatmap/{camera_id}")
def get_heatmap(camera_id: str):
    result = last_results.get(camera_id)

    if not result:
        return {
            "error": f"No analysis found for camera {camera_id}. Run /analyze first.",
            "heatmap_base64": None
        }

    return {
        "camera_id":      camera_id,
        "heatmap_base64": result.get("heatmap_base64"),
        "timestamp":      result.get("timestamp"),
        "risk_level":     result.get("risk_level")
    }


# ════════════════════════════════════════════════════
# GET ALERT STATUS  →  returns current alert state for all cameras
# ════════════════════════════════════════════════════
@app.get("/get-alert-status")
def get_alert_status():
    if not last_results:
        return {
            "status":   "NO_DATA",
            "message":  "No videos have been analyzed yet",
            "cameras":  []
        }

    cameras = []
    any_high = False

    for cam_id, result in last_results.items():
        risk = result.get("risk_level", "Unknown")
        if risk == "High":
            any_high = True

        cameras.append({
            "camera_id":           cam_id,
            "risk_level":          risk,
            "risk_score":          result.get("risk_score", 0),
            "people_count":        result.get("people_count", 0),
            "alert_triggered":     result.get("alert", {}).get("triggered", False),
            "bottleneck_detected": result.get("bottleneck_detected", False),
            "recommended_action":  result.get("alert", {}).get("recommended_action", ""),
            "timestamp":           result.get("timestamp", "")
        })

    # Overall system alert
    high_count   = sum(1 for c in cameras if c["risk_level"] == "High")
    medium_count = sum(1 for c in cameras if c["risk_level"] == "Medium")

    if high_count > 0:
        overall = "CRITICAL"
    elif medium_count > 0:
        overall = "WARNING"
    else:
        overall = "STABLE"

    return {
        "overall_status": overall,
        "alert_active":   any_high,
        "high_cameras":   high_count,
        "medium_cameras": medium_count,
        "total_cameras":  len(cameras),
        "cameras":        cameras
    }
