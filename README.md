# CivicEye ◈ Municipal Operations Platform

> **AI-Assisted Infrastructure Damage Detection, Spatial Deduplication & Visual Repair Verification System**

CivicEye is an end-to-end municipal governance prototype built for civic administrations (modeled on the Coimbatore Municipal Grid). It automates the complete lifecycle of citizen infrastructure damage complaints—from computer vision triage and GPS geotagging to spatial duplicate detection, interactive GIS mapping, and before-and-after photographic repair proofing.

---

## 🌟 Key Features

### 1. Dual-Mode Citizen Intake
- **AI-Powered Photo Triage (Roboflow CV)**: Citizens upload photos of damaged roads, potholes, water leaks, or garbage overflows. An automated computer vision workflow identifies the damage category, calculates confidence scores, predicts severity, and overlays labeled bounding boxes.
- **Manual Intake Fallback**: An intuitive manual reporting form allowing citizens or field operators to categorize issues, severity, and departments directly.

### 2. Geotagging & Geofencing
- One-click browser GPS acquisition (`navigator.geolocation`) with accuracy metrics.
- Landmark coordinate geocoding fallback with fast-selection presets.

### 3. Spatial Duplicate Detection
- Automatically inspects incoming complaints within a 500m spatial radius for matching unresolved issue types.
- Groups and flags duplicates with amber warning banners to avoid redundant field crew dispatch orders.

### 4. Interactive Geographic Map
- Powered by Leaflet and OpenStreetMap.
- Real-time mapping of all municipal incidents with color-coded severity/priority badges and direct drill-down inspection popups.

### 5. Side-by-Side Photographic Repair Verification
- **Honest Verification Standard**: Ensures no issue is closed without visual proof.
- Displays the original citizen damage photo side-by-side with post-repair field inspection photos before authorizing resolution.

### 6. Municipal Dashboard & Analytics
- Live KPI status counters: Total Complaints, High Priority, In Progress, Resolved.
- Department distribution bar charts (Recharts) aggregating volume across Roads, Sanitation, Electrical, and Water departments.
- One-click **CSV data export** for municipal reporting.
- Real-time in-app notification center.

---

## 🏗️ Architecture & Tech Stack

```
   ┌─────────────────────────────────────────────────────────┐
   │                  React 19 + Vite Frontend               │
   │  (Lucide Icons • Leaflet GIS • Recharts • Hot-Toast)   │
   └────────────────────────────┬────────────────────────────┘
                                │ HTTP / REST API (port 8000)
   ┌────────────────────────────▼────────────────────────────┐
   │                  FastAPI Backend Server                 │
   │      (Uvicorn • SQLite DB • Static Media Storage)       │
   └───────────────┬─────────────────────────┬───────────────┘
                   │                         │
       ┌───────────▼───────────┐ ┌───────────▼───────────┐
       │ Roboflow Serverless   │ │ Local SQLite Database │
       │ Inference Computer    │ │ (complaints.db)       │
       │ Vision Workflow       │ └───────────────────────┘
       └───────────────────────┘
```

- **Frontend**: React 19, Vite, React-Leaflet, OpenStreetMap, Recharts, Lucide-React, React-Hot-Toast, Tailwind CSS utilities.
- **Backend**: FastAPI, Uvicorn, Python 3.12, SQLite3, `inference-sdk` (Roboflow).

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment (optional)
python -m venv venv
# Windows: venv\Scripts\activate
# Linux/Mac: source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Open .env and add your ROBOFLOW_API_KEY

# Start backend server
python main.py
```
Backend will start on `http://127.0.0.1:8000` (API Docs at `/docs`).

### 2. Frontend Setup

```bash
cd frontend

# Install packages
npm install

# Start Vite dev server
npm run dev
```
Frontend will be available at `http://localhost:5173`.

---

## 🧪 Automated Testing

CivicEye includes automated assertion verification scripts testing all 12 core system requirements (T1–T12):

```bash
# Run backend assertions (T1, T2, T6, T7, T8, T9, T10)
python verify_backend_tests.py

# Verify Roboflow AI workflow connectivity
python test_ai_connection.py
```

---

## 🛡️ License

MIT License. Designed for civic infrastructure monitoring and municipal operations.
