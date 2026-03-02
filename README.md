# StampedeSafe — Crowd Risk Intelligence v2.0

An AI-powered early warning system for crowd management and stampede prevention.

## 🚀 Overview
StampedeSafe uses **YOLOv8** for real-time person detection and **Optical Flow** for motion anomaly detection. It calculates a risk score based on:
1. **Crowd Density**: Number of people per unit area.
2. **Motion Anomaly**: Speed and chaos factor in crowd movement.
3. **Bottleneck Detection**: Crowding specifically near exit zones.

## 📁 Project Structure
```bash
StampedeAI/
├── backend/            # FastAPI Backend
│   ├── app.py          # API Endpoints
│   ├── main.py         # AI Logic & Analysis
│   ├── models/         # YOLOv8 Weights (.pt)
│   ├── requirements.txt
│   └── uploads/        # Temporary storage for analyzed videos
├── frontend/           # Web Interface
│   ├── index.html
│   ├── style.css
│   └── app.js
├── media/              # Sample test videos
├── docs/               # System documentation & designs
└── .gitignore
```

## 🛠️ Setup Instructions

### Backend (Python 3.10+)
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the API server:
   ```bash
   uvicorn app:app --reload
   ```

### Frontend
1. Open `frontend/index.html` in any modern web browser.
2. Ensure the backend URL is correctly set (default: `http://localhost:8000`).

## 🧠 Risk Formula
The system uses the following weighted formula to classify risk levels (Low, Medium, High):
`Risk Score = 0.5 × Density + 0.3 × Motion + 0.2 × Bottleneck`

## 📊 Features
- **Dynamic Heatmaps**: Visualizes crowd pressure zones.
- **Risk Timeline**: Real-time chart of risk scores over time.
- **Multi-Camera Support**: Monitor up to 8 camera feeds simultaneously.
- **Smart Alerts**: Recommended actions based on severity levels.

---
*Developed for Stampede Prevention & Crowd Management.*
