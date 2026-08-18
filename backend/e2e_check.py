import httpx

BASE = "http://localhost:8001"
c = httpx.Client(timeout=30)


def login(email):
    r = c.post(f"{BASE}/api/auth/login", json={"email": email, "password": "Password123!"})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['accessToken']}"}


t = login("teacher@school.edu.vn")
s = login("student@school.edu.vn")

r = c.post(f"{BASE}/teacher/courses", headers=t, json={"title": "E2E Course", "description": "d", "level": "beginner", "status": "published"})
r.raise_for_status()
cid = r.json()["id"]
print("1. create course:", cid)

r = c.post(f"{BASE}/teacher/courses/{cid}/modules", headers=t, json={"title": "M1"})
mid = r.json()["id"]
r = c.post(f"{BASE}/teacher/modules/{mid}/lessons", headers=t, json={"title": "L1"})
lid = r.json()["id"]
slides = []
for i in range(2):
    r = c.post(f"{BASE}/teacher/lessons/{lid}/slides", headers=t, json={"imageUrl": f"http://x/{i}.png"})
    slides.append(r.json()["id"])
print("2. content created:", lid, slides)

r = c.post(f"{BASE}/api/courses/{cid}/enroll", headers=s)
r.raise_for_status()
eid = r.json()["enrollmentId"]
print("3. enrolled:", eid)

r = c.post(f"{BASE}/api/learning-sessions", headers=s, json={"enrollmentId": eid, "lessonId": lid, "deviceFingerprint": "e2e-fp"})
r.raise_for_status()
sess = r.json()
print("4. learning session:", sess["id"])

r = c.post(f"{BASE}/api/calibrations", headers=s, json={"deviceFingerprint": "e2e-fp", "numPoints": 16, "params": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]})
r.raise_for_status()
print("5. calibration saved")

samples = [{"lessonContentId": slides[0], "x": 0.2 + i * 0.02, "y": 0.3 + i * 0.01, "ts": 1755000000000 + i * 250} for i in range(20)]
r = c.post(f"{BASE}/api/lessons/{lid}/gaze-samples", headers=s, json={"learningSessionId": sess["id"], "samples": samples})
r.raise_for_status()
print("6. gaze inserted:", r.json())

r = c.patch(f"{BASE}/api/lessons/{lid}/progress", headers=s, json={"lastSlide": 0})
r.raise_for_status()
r = c.patch(f"{BASE}/api/learning-sessions/{sess['id']}", headers=s, json={"status": "completed"})
r.raise_for_status()
print("7. progress + session end OK")

r = c.get(f"{BASE}/teacher/lessons/{lid}/heatmap", headers=t)
r.raise_for_status()
hm = r.json()
print("8. heatmap:", [(x["idx"], x["onSlide"], x["fixations"], len(x["hotspots"])) for x in hm])

r = c.post(f"{BASE}/teacher/courses/{cid}/recompute", headers=t)
r.raise_for_status()
print("9. recompute:", r.json())

r = c.get(f"{BASE}/teacher/courses/{cid}/students", headers=t)
r.raise_for_status()
print("10. students:", [(x["name"], x["progress"], x["attention"]) for x in r.json()])

r = c.delete(f"{BASE}/teacher/courses/{cid}", headers=t)
r.raise_for_status()
print("11. cleanup OK => E2E PASSED")
