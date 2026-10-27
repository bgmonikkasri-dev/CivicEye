# Reloading
import base64
import os
import sqlite3
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Request
# pyrefly: ignore [missing-import]
from fastapi.concurrency import run_in_threadpool
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.staticfiles import StaticFiles
# pyrefly: ignore [missing-import]
from inference_sdk import InferenceHTTPClient, InferenceConfiguration

# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
MEDIA = ROOT / "media"
MEDIA.mkdir(exist_ok=True)
DB = ROOT / "complaints.db"

app = FastAPI(title="Civic Infrastructure Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=str(MEDIA)), name="media")

def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    with connect() as db:
        
        db.execute("""
        CREATE TABLE IF NOT EXISTS complaints (
            id TEXT PRIMARY KEY,
            issue_type TEXT NOT NULL,
            confidence REAL,
            severity TEXT,
            severity_basis TEXT,
            priority TEXT,
            department TEXT,
            location TEXT,
            reported_at TEXT,
            status TEXT,
            detection_count INTEGER,
            image_url TEXT,
            latitude REAL,
            longitude REAL,
            is_duplicate INTEGER DEFAULT 0,
            duplicate_of TEXT,
            repair_image_url TEXT
        )
        """)
        cursor = db.execute("PRAGMA table_info(complaints)")
        cols = {row["name"] for row in cursor.fetchall()}
        if "latitude" not in cols:
            db.execute("ALTER TABLE complaints ADD COLUMN latitude REAL")
        if "longitude" not in cols:
            db.execute("ALTER TABLE complaints ADD COLUMN longitude REAL")
        if "is_duplicate" not in cols:
            db.execute("ALTER TABLE complaints ADD COLUMN is_duplicate INTEGER DEFAULT 0")
        if "duplicate_of" not in cols:
            db.execute("ALTER TABLE complaints ADD COLUMN duplicate_of TEXT")
        if "repair_image_url" not in cols:
            db.execute("ALTER TABLE complaints ADD COLUMN repair_image_url TEXT")
        db.commit()

init_db()

import re
from typing import Optional

LANDMARK_COORDS = {
    "crosscut": (11.0185, 76.9634),
    "gandhipuram": (11.0175, 76.9673),
    "ukkadam": (10.9898, 76.9558),
    "peelamedu": (11.0287, 77.0016),
    "rs puram": (11.0089, 76.9489),
    "town hall": (10.9972, 76.9608),
    "main street": (11.0168, 76.9558),
    "irugur": (11.0083, 77.0658),
    "hope college": (11.0264, 77.0125),
    "saravanampatti": (11.0805, 76.9945),
    "singanallur": (11.0034, 77.0276),
}

def parse_lat_lng(location_str: str, lat_val: Optional[str] = None, lng_val: Optional[str] = None):
    if lat_val and lng_val:
        try:
            return float(lat_val), float(lng_val)
        except (ValueError, TypeError):
            pass
    if location_str:
        match = re.search(r"(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)", location_str)
        if match:
            try:
                return float(match.group(1)), float(match.group(2))
            except (ValueError, TypeError):
                pass
        loc_lower = location_str.lower()
        for name, coords in LANDMARK_COORDS.items():
            if name in loc_lower:
                return coords
    return None, None

def check_duplicate(db, issue_type: str, location: str, lat: Optional[float] = None, lng: Optional[float] = None):
    rows = db.execute(
        "SELECT id, issue_type, location, latitude, longitude FROM complaints WHERE LOWER(issue_type) = LOWER(?) AND status != 'resolved'",
        (issue_type,)
    ).fetchall()
    
    loc_clean = location.lower().strip()
    for r in rows:
        r_loc = (r["location"] or "").lower().strip()
        if loc_clean and r_loc and (loc_clean in r_loc or r_loc in loc_clean):
            return 1, r["id"]
        if lat is not None and lng is not None and r["latitude"] is not None and r["longitude"] is not None:
            dist = ((lat - r["latitude"])**2 + (lng - r["longitude"])**2)**0.5
            if dist < 0.005:
                return 1, r["id"]
    return 0, None

def run_workflow(image_path: str, location: str, timestamp: str):
    key = os.getenv("ROBOFLOW_API_KEY")
    if not key:
        raise RuntimeError("ROBOFLOW_API_KEY is not set on the backend")

    client = InferenceHTTPClient(
        api_url="https://serverless.roboflow.com",
        api_key=key,
    ).configure(InferenceConfiguration(api_key_transport="header"))

    for attempt in range(3):
        try:
            return client.run_workflow(
                workspace_name="aashini-yathra-vijaykumar",
                workflow_id="civic-issue-complaint-triage-1790349198152",
                images={"image": image_path},
                parameters={"location": location, "timestamp": timestamp},
                use_cache=True,
            )
        except Exception as e:
            if attempt == 2:
                raise e
            import time
            time.sleep(2)

@app.get("/api/complaints")
def list_complaints():
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM complaints ORDER BY reported_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]

@app.post("/api/complaints/{complaint_id}/status")
@app.patch("/api/complaints/{complaint_id}/status")
@app.put("/api/complaints/{complaint_id}/status")
async def update_status(complaint_id: str, request: Request):
    status_val = None
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            data = await request.json()
            status_val = data.get("status")
        except Exception:
            pass
    if not status_val:
        try:
            form = await request.form()
            status_val = form.get("status")
        except Exception:
            pass
    if not status_val:
        status_val = request.query_params.get("status")
    if not status_val:
        raise HTTPException(400, "status is required")
        
    with connect() as db:
        cursor = db.execute("UPDATE complaints SET status = ? WHERE id = ?", (status_val, complaint_id))
        if cursor.rowcount == 0:
            raise HTTPException(404, "Complaint not found")
        db.commit()
    return {"status": "ok", "new_status": status_val}

@app.post("/api/analyze")
async def analyze(
    image: UploadFile = File(...),
    location: str = Form(...),
    latitude: Optional[str] = Form(None),
    longitude: Optional[str] = Form(None),
):
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(400, "Upload a JPEG, PNG, or WebP image.")

    location = location.strip()
    if not location:
        raise HTTPException(400, "Enter a location.")

    lat, lng = parse_lat_lng(location, latitude, longitude)

    suffix = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }[image.content_type]

    data = await image.read()
    if not data or len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image must be between 1 byte and 10 MB.")

    reported_at = datetime.now(timezone.utc).isoformat()
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            tmp.write(data)

        result = await run_in_threadpool(
            run_workflow, temp_path, location, reported_at
        )

        if not result or not isinstance(result[0], dict):
            raise RuntimeError("Workflow returned no result")
        
        output = result[0]

        visualization = output.get("output_image")
        image_url = None
        if visualization:
            if isinstance(visualization, dict):
                visualization = visualization.get("value")
            if isinstance(visualization, str) and visualization.strip():
                encoded = visualization.split(",", 1)[-1]
                filename = f"{uuid.uuid4().hex}.jpg"
                (MEDIA / filename).write_bytes(base64.b64decode(encoded))
                image_url = f"/media/{filename}"

        if not image_url:
            filename = f"{uuid.uuid4().hex}{suffix}"
            (MEDIA / filename).write_bytes(data)
            image_url = f"/media/{filename}"

        complaints_list = output.get("complaints", [])
        if not complaints_list:
            preds = output.get("predictions", {})
            preds_list = preds.get("predictions", []) if isinstance(preds, dict) else (preds if isinstance(preds, list) else [])
            for p in preds_list:
                cls_name = p.get("class", "civic_issue")
                conf = float(p.get("confidence", 0.85))
                complaints_list.append({
                    "issue_type": cls_name,
                    "confidence": conf,
                    "severity": "high" if "pothole" in cls_name.lower() else "medium",
                    "severity_basis": "model_prediction",
                    "priority": "high" if "pothole" in cls_name.lower() else "medium",
                    "department": "roads" if any(k in cls_name.lower() for k in ["pothole", "road", "crack"]) else "sanitation",
                })

        if not complaints_list:
            complaints_list.append({
                "issue_type": "pothole",
                "confidence": 0.80,
                "severity": "medium",
                "severity_basis": "citizen_report_fallback",
                "priority": "medium",
                "department": "roads",
            })

        saved = []
        with connect() as db:
            for complaint in complaints_list:
                issue_type = complaint.get("issue_type", "unknown")
                is_dup, dup_of = check_duplicate(db, issue_type, location, lat, lng)
                
                row = {
                    "id": str(uuid.uuid4()),
                    "issue_type": issue_type,
                    "confidence": complaint.get("confidence"),
                    "severity": complaint.get("severity"),
                    "severity_basis": complaint.get("severity_basis"),
                    "priority": complaint.get("priority"),
                    "department": complaint.get("department"),
                    "location": complaint.get("location", location),
                    "reported_at": complaint.get("timestamp", reported_at),
                    "status": complaint.get("status", "new"),
                    "detection_count": complaint.get("detection_count", 1),
                    "image_url": image_url,
                    "latitude": lat,
                    "longitude": lng,
                    "is_duplicate": is_dup,
                    "duplicate_of": dup_of,
                    "repair_image_url": None,
                }
                db.execute("""
                    INSERT INTO complaints
                    (id, issue_type, confidence, severity, severity_basis,
                     priority, department, location, reported_at, status,
                     detection_count, image_url, latitude, longitude,
                     is_duplicate, duplicate_of, repair_image_url)
                    VALUES
                    (:id, :issue_type, :confidence, :severity, :severity_basis,
                     :priority, :department, :location, :reported_at, :status,
                     :detection_count, :image_url, :latitude, :longitude,
                     :is_duplicate, :duplicate_of, :repair_image_url)
                """, row)
                saved.append(row)
        
        has_duplicate = any(bool(r.get("is_duplicate")) for r in saved)
        return {
            "complaints": saved,
            "complaint_count": len(saved),
            "has_duplicate": has_duplicate,
            "duplicate_warning": "Potential duplicate detected: a similar open issue was previously reported for this location." if has_duplicate else None
        }

    except Exception as exc:
        raise HTTPException(502, f"Analysis failed: {exc}") from exc
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)

@app.post("/api/complaints/manual")
async def create_manual_complaint(
    issue_type: str = Form(...),
    location: str = Form(...),
    department: str = Form("roads"),
    priority: str = Form("medium"),
    severity: str = Form("medium"),
    latitude: Optional[str] = Form(None),
    longitude: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
):
    location = location.strip()
    if not location:
        raise HTTPException(400, "Enter a location.")

    lat, lng = parse_lat_lng(location, latitude, longitude)
    reported_at = datetime.now(timezone.utc).isoformat()
    image_url = None

    if image and image.filename:
        if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise HTTPException(400, "Upload a JPEG, PNG, or WebP image.")
        suffix = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
        }[image.content_type]
        data = await image.read()
        if data and len(data) <= 10 * 1024 * 1024:
            filename = f"{uuid.uuid4().hex}{suffix}"
            (MEDIA / filename).write_bytes(data)
            image_url = f"/media/{filename}"

    with connect() as db:
        is_dup, dup_of = check_duplicate(db, issue_type, location, lat, lng)
        row = {
            "id": str(uuid.uuid4()),
            "issue_type": issue_type,
            "confidence": 1.0,
            "severity": severity,
            "severity_basis": "citizen_report",
            "priority": priority,
            "department": department,
            "location": location,
            "reported_at": reported_at,
            "status": "new",
            "detection_count": 1 if image_url else 0,
            "image_url": image_url,
            "latitude": lat,
            "longitude": lng,
            "is_duplicate": is_dup,
            "duplicate_of": dup_of,
            "repair_image_url": None,
        }
        db.execute("""
            INSERT INTO complaints
            (id, issue_type, confidence, severity, severity_basis,
             priority, department, location, reported_at, status,
             detection_count, image_url, latitude, longitude,
             is_duplicate, duplicate_of, repair_image_url)
            VALUES
            (:id, :issue_type, :confidence, :severity, :severity_basis,
             :priority, :department, :location, :reported_at, :status,
             :detection_count, :image_url, :latitude, :longitude,
             :is_duplicate, :duplicate_of, :repair_image_url)
        """, row)
        db.commit()

    return {
        "status": "ok",
        "complaint": row,
        "is_duplicate": is_dup,
        "has_duplicate": bool(is_dup),
        "duplicate_warning": "Potential duplicate detected: a similar open issue was previously reported for this location." if is_dup else None
    }

@app.post("/api/complaints/{complaint_id}/repair-photo")
async def upload_repair_photo(complaint_id: str, image: UploadFile = File(...)):
    if image.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(400, "Upload a JPEG, PNG, or WebP image.")
    suffix = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }[image.content_type]
    data = await image.read()
    if not data or len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Image must be between 1 byte and 10 MB.")
    filename = f"repair_{uuid.uuid4().hex}{suffix}"
    (MEDIA / filename).write_bytes(data)
    repair_url = f"/media/{filename}"
    with connect() as db:
        cursor = db.execute(
            "UPDATE complaints SET repair_image_url = ? WHERE id = ?",
            (repair_url, complaint_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(404, "Complaint not found")
        db.commit()
    return {"status": "ok", "repair_image_url": repair_url}

@app.delete("/api/complaints/{complaint_id}")
def delete_complaint(complaint_id: str):
    with connect() as db:
        row = db.execute("SELECT image_url, repair_image_url FROM complaints WHERE id = ?", (complaint_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Complaint not found")
        for col in ["image_url", "repair_image_url"]:
            val = row[col]
            if val and isinstance(val, str) and val.startswith("/media/"):
                filepath = MEDIA / val.replace("/media/", "")
                try:
                    filepath.unlink(missing_ok=True)
                except Exception:
                    pass
        cursor = db.execute("DELETE FROM complaints WHERE id = ?", (complaint_id,))
        if cursor.rowcount == 0:
            raise HTTPException(404, "Complaint not found")
        db.commit()
    return {"status": "ok", "deleted": complaint_id}

if __name__ == "__main__":
    import uvicorn
    import sys
    backend_dir = str(Path(__file__).parent.resolve())
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    print("=" * 60)
    print(" Starting CivicEye Backend Server")
    print(" Endpoint: http://127.0.0.1:8000")
    print(" API Documentation: http://127.0.0.1:8000/docs")
    print("=" * 60)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, app_dir=backend_dir)

