from ultralytics import YOLO
import cv2
import numpy as np
from datetime import datetime

model = YOLO("models/yolov8s.pt")

# ─────────────────────────────────────────────────────────────
#  BOTTLENECK / EXIT ZONE DETECTION
#  We define the bottom-center 20% of the frame as the exit zone.
#  If crowd density there is high → bottleneck detected.
# ─────────────────────────────────────────────────────────────
def get_bottleneck_score(boxes, frame_w, frame_h):
    if not boxes:
        return 0.0, False

    # Exit zone: bottom 20% of frame, center 60% width
    exit_x1 = frame_w * 0.20
    exit_x2 = frame_w * 0.80
    exit_y1 = frame_h * 0.80
    exit_y2 = frame_h

    exit_zone_area = (exit_x2 - exit_x1) * (exit_y2 - exit_y1)
    if exit_zone_area <= 0:
        return 0.0, False

    # Count people whose center falls inside exit zone
    people_in_exit = 0
    for box in boxes:
        x1, y1, x2, y2 = box
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2
        if exit_x1 <= cx <= exit_x2 and exit_y1 <= cy <= exit_y2:
            people_in_exit += 1

    # Bottleneck score based on crowding near exit
    # Normalize: if 5+ people near exit → max score
    bottleneck_score = min(people_in_exit / 5.0, 1.0)
    bottleneck_detected = bottleneck_score > 0.4

    return bottleneck_score, bottleneck_detected


# ─────────────────────────────────────────────────────────────
#  OPTICAL FLOW — MOTION ANOMALY DETECTION
#  Farneback dense optical flow between consecutive frames
#  Measures: average speed, chaos factor (direction inconsistency)
# ─────────────────────────────────────────────────────────────
def compute_motion_score(prev_gray, curr_gray):
    if prev_gray is None or curr_gray is None:
        return 0.0, 0.0

    flow = cv2.calcOpticalFlowFarneback(
        prev_gray, curr_gray,
        None,
        pyr_scale=0.5,
        levels=3,
        winsize=15,
        iterations=3,
        poly_n=5,
        poly_sigma=1.2,
        flags=0
    )

    # Magnitude and angle of flow vectors
    mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])

    avg_magnitude = float(np.mean(mag))

    # Chaos factor: variance in flow direction → panic/stampede indicator
    # High direction variance = people moving in inconsistent directions
    ang_std = float(np.std(ang))
    chaos_factor = min(ang_std / np.pi, 1.0)  # normalize to [0,1]

    # Motion score: weighted combo of speed + chaos
    motion_score = min((0.6 * avg_magnitude / 10.0) + (0.4 * chaos_factor), 1.0)

    return motion_score, chaos_factor


# ─────────────────────────────────────────────────────────────
#  HEATMAP GENERATION
#  Creates a density heatmap from bounding box centers
# ─────────────────────────────────────────────────────────────
def generate_heatmap(all_boxes_history, frame_w, frame_h):
    heatmap = np.zeros((frame_h, frame_w), dtype=np.float32)

    for boxes in all_boxes_history:
        for box in boxes:
            x1, y1, x2, y2 = box
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)
            cx = np.clip(cx, 0, frame_w - 1)
            cy = np.clip(cy, 0, frame_h - 1)
            # Gaussian blob around each person center
            cv2.circle(heatmap, (cx, cy), radius=40, color=1.0, thickness=-1)

    # Normalize
    if heatmap.max() > 0:
        heatmap = heatmap / heatmap.max()

    # Apply colormap
    heatmap_uint8 = (heatmap * 255).astype(np.uint8)
    heatmap_colored = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)

    return heatmap_colored


# ─────────────────────────────────────────────────────────────
#  MAIN ANALYZE FUNCTION
# ─────────────────────────────────────────────────────────────
def analyze_video(video_path):

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        return {
            "camera_id": "CAM_01",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "error": "Unable to open video file",
            "risk_level": "Unknown",
            "risk_score": 0,
            "alert": {
                "triggered": False,
                "severity": "Unknown",
                "recommended_action": "Check video source"
            }
        }

    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_area = frame_w * frame_h if frame_w * frame_h > 0 else 1

    # Collection arrays
    people_counts        = []
    density_scores       = []
    motion_scores        = []
    chaos_factors        = []
    bottleneck_scores    = []
    all_boxes_history    = []
    risk_timeline        = []  # for chart on frontend

    prev_gray   = None
    frame_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        if frame_count % 5 != 0:
            continue

        curr_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # ── YOLO DETECTION ──
        results = model(frame, conf=0.3, iou=0.5, verbose=False)

        frame_boxes = []
        count = 0
        for result in results:
            for box in result.boxes:
                if int(box.cls[0]) == 0:  # class 0 = person
                    count += 1
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    frame_boxes.append((x1, y1, x2, y2))

        people_counts.append(count)
        all_boxes_history.append(frame_boxes)

        # ── DENSITY SCORE ──
        # Estimate each person occupies ~0.5% of frame area
        person_area_estimate = count * (frame_area * 0.005)
        density_ratio = min(person_area_estimate / frame_area, 1.0)

        # Density score normalized to [0,1]
        if density_ratio < 0.3:
            density_score = density_ratio / 0.3 * 0.4          # 0 → 0.4
        elif density_ratio < 0.6:
            density_score = 0.4 + (density_ratio - 0.3) / 0.3 * 0.4  # 0.4 → 0.8
        else:
            density_score = 0.8 + min((density_ratio - 0.6) / 0.4 * 0.2, 0.2)  # 0.8 → 1.0

        density_scores.append(density_score)

        # ── MOTION / OPTICAL FLOW ──
        motion_score, chaos_factor = compute_motion_score(prev_gray, curr_gray)
        motion_scores.append(motion_score)
        chaos_factors.append(chaos_factor)

        # ── BOTTLENECK ──
        b_score, _ = get_bottleneck_score(frame_boxes, frame_w, frame_h)
        bottleneck_scores.append(b_score)

        # ── FRAME-LEVEL RISK (for timeline chart) ──
        frame_risk = (
            0.5 * density_score +
            0.3 * motion_score +
            0.2 * b_score
        ) * 100
        risk_timeline.append(round(frame_risk, 1))

        prev_gray = curr_gray

    cap.release()

    if not people_counts:
        return {
            "camera_id": "CAM_01",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "risk_level": "Unknown",
            "risk_score": 0,
            "alert": {
                "triggered": False,
                "severity": "Unknown",
                "recommended_action": "No detections in video"
            }
        }

    # ── AGGREGATE METRICS ──
    avg_count        = float(np.mean(people_counts))
    max_count        = int(np.max(people_counts))
    avg_density      = float(np.mean(density_scores))
    avg_motion       = float(np.mean(motion_scores))
    avg_chaos        = float(np.mean(chaos_factors))
    avg_bottleneck   = float(np.mean(bottleneck_scores))

    # Use 75th percentile to avoid spike noise
    p75_density    = float(np.percentile(density_scores, 75))
    p75_motion     = float(np.percentile(motion_scores, 75))
    p75_bottleneck = float(np.percentile(bottleneck_scores, 75))

    # ── FINAL RISK FORMULA (from PPT) ──
    risk_score_raw = (
        0.5 * p75_density +
        0.3 * p75_motion +
        0.2 * p75_bottleneck
    )

    risk_score = round(risk_score_raw * 100, 1)

    # ── CLASSIFICATION ──
    if risk_score < 40:
        risk_level = "Low"
    elif risk_score < 70:
        risk_level = "Medium"
    else:
        risk_level = "High"

    # ── BOTTLENECK FINAL ──
    _, bottleneck_detected = get_bottleneck_score(
        all_boxes_history[-1] if all_boxes_history else [],
        frame_w, frame_h
    )

    # ── GENERATE HEATMAP ──
    # Use last 20 frames worth of boxes for heatmap
    recent_boxes = all_boxes_history[-20:]
    heatmap_img  = generate_heatmap(recent_boxes, frame_w, frame_h)

    # Encode heatmap as JPEG base64
    import base64
    _, buffer   = cv2.imencode('.jpg', heatmap_img, [cv2.IMWRITE_JPEG_QUALITY, 80])
    heatmap_b64 = base64.b64encode(buffer).decode('utf-8')

    # ── ALERT ──
    if risk_level == "High":
        action = "🚨 IMMEDIATE ACTION: Open emergency exits, deploy crowd control, activate PA system"
    elif risk_level == "Medium":
        action = "⚠️ WARNING: Monitor closely, prepare crowd management team"
    else:
        action = "✅ Normal monitoring — situation stable"

    alert = {
        "triggered":           risk_level == "High",
        "severity":            risk_level,
        "recommended_action":  action,
        "bottleneck_detected": bottleneck_detected,
        "chaos_factor":        round(avg_chaos, 3)
    }

    # Downsample timeline for frontend chart (max 50 points)
    if len(risk_timeline) > 50:
        step = len(risk_timeline) // 50
        risk_timeline = risk_timeline[::step][:50]

    return {
        "camera_id":           "CAM_01",
        "timestamp":           datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

        # People
        "people_count":        int(round(avg_count)),
        "peak_people_count":   max_count,

        # Scores (all 0–100)
        "risk_score":          risk_score,
        "density_score":       round(avg_density * 100, 1),
        "motion_score":        round(avg_motion * 100, 1),
        "bottleneck_score":    round(avg_bottleneck * 100, 1),

        # For backwards compat with old frontend
        "average_risk_score":  risk_score,
        "peak_risk_score":     float(max(risk_timeline)) if risk_timeline else risk_score,

        # Classification
        "risk_level":          risk_level,
        "risk_trend":          "Rising" if len(risk_timeline) > 5 and risk_timeline[-1] > risk_timeline[0] else "Stable",

        # Detail
        "density_ratio":       round(avg_density, 3),
        "chaos_factor":        round(avg_chaos, 3),
        "bottleneck_detected": bottleneck_detected,

        # Chart data
        "risk_timeline":       risk_timeline,

        # Heatmap
        "heatmap_base64":      heatmap_b64,

        # Alert
        "alert": alert
    }


if __name__ == "__main__":
    import json
    result = analyze_video("../media/test_video.mp4")
    # Don't print heatmap base64 in console
    result_display = {k: v for k, v in result.items() if k != "heatmap_base64"}
    print(json.dumps(result_display, indent=2))
