# CrowdSense AI – Stampede Risk Detection System

## 🚨 Problem Statement
Large public gatherings such as religious events, festivals, railway stations, and concerts are vulnerable to stampede incidents due to overcrowding and delayed emergency response. Manual CCTV monitoring is reactive and error-prone.

## 💡 Solution Overview
CrowdSense AI is an AI-powered crowd risk detection system that analyzes CCTV video footage and classifies crowd risk levels into:

- Low Risk
- Medium Risk
- High Risk

The system generates structured alerts and provides automated recommendations for authorities to take preventive action.

---

## 🧠 Why AI is Required
- Real-time monitoring of multiple CCTV feeds is not feasible manually.
- AI enables automated crowd behavior analysis.
- Risk classification allows proactive intervention before incidents occur.
- Generative AI (via Amazon Bedrock) enhances alerts by generating contextual emergency summaries.

---

## ⚙️ How It Works

1. CCTV video is uploaded via API.
2. Backend processes video frames.
3. Crowd activity metrics are calculated.
4. Risk level is classified.
5. Alert response is generated in JSON format.
6. (Planned) Amazon Bedrock generates contextual emergency recommendations.

---

## 🏗️ System Architecture

Frontend Dashboard  
⬇  
Amazon API Gateway  
⬇  
FastAPI Backend (Amazon EC2)  
⬇  
Amazon S3 (Video Storage)  
⬇  
Amazon DynamoDB (Incident Logs)  
⬇  
Amazon Bedrock (AI-generated Emergency Summaries)

---

## 🛠️ Tech Stack

- Python
- FastAPI
- OpenCV
- NumPy
- AWS EC2 (Backend Hosting)
- Amazon S3 (Video Storage)
- Amazon DynamoDB (Incident Logging)
- Amazon Bedrock (Generative AI Alerts)

---

## 🚀 Running Locally

### 1️⃣ Install Dependencies

pip install -r requirements.txt


### 2️⃣ Run the Backend

uvicorn app:app --reload


### 3️⃣ Open API Docs

http://127.0.0.1:8000/docs


Upload a video and test the crowd risk detection endpoint.

---

## 📦 Deployment Plan

- Backend deployed on Amazon EC2
- Video files stored in Amazon S3
- Incident logs stored in Amazon DynamoDB
- Amazon Bedrock used to generate contextual emergency summaries
- Secure API routing via Amazon API Gateway

---

## 📊 Output Example

```json
{
  "camera_id": "CAM_01",
  "timestamp": "2026-02-27 12:30:00",
  "people_count": 12,
  "average_risk_score": 60,
  "peak_risk_score": 60,
  "risk_level": "Medium",
  "alert": {
    "triggered": false,
    "severity": "Medium",
    "recommended_action": "Monitor situation closely"
  }
}

Future Improvements

Real-time multi-camera streaming

Advanced crowd density modeling

Predictive risk escalation

SMS/email emergency alerts

Dashboard analytics with heatmaps

Team

AI for Bharat Hackathon – Prototype Submission
CrowdSense AI – 2026
