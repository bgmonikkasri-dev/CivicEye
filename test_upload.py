import os
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
image_path = str(ROOT / "backend" / "test_data" / "pothole.jpg")
if not os.path.exists(image_path):
    image_path = r"C:\Users\bgmon\.gemini\antigravity-ide\brain\82c760b1-c31b-4c78-8d76-e5493b4b47b5\pothole_1790351593115.jpg"
url = "http://localhost:8000/api/analyze"
data = {"location": "Main Street"}

with open(image_path, "rb") as f:
    files = {"image": ("pothole.jpg", f, "image/jpeg")}
    try:
        response = requests.post(url, data=data, files=files)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
