"""MotoResQ backend API tests - full coverage.

Covers:
- Health
- Auth (signup, login, /me, invalid password)
- Motorcycle profile
- Maintenance CRUD
- Diagnostics (categories, questions, analyze)
- Repair guides (list, get)
- AI Chat (Claude Sonnet 4.6 via emergentintegrations - slow, timeout 60s)
- TTS (audio/mpeg)
"""

import uuid
import pytest
import requests

# ---------- Health ----------
def test_health(api_client, base_url):
    r = api_client.get(f"{base_url}/api/")
    assert r.status_code == 200
    d = r.json()
    assert d.get("ok") is True and d.get("service") == "MotoResQ"


# ---------- Auth ----------
class TestAuth:
    def test_login_existing(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"email": "rider@motoresq.app", "password": "rider1234"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "access_token" in d and d["user"]["email"] == "rider@motoresq.app"

    def test_login_wrong_password(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/login",
                            json={"email": "rider@motoresq.app", "password": "wrongpass"})
        assert r.status_code == 401

    def test_signup_new_user(self, api_client, base_url):
        email = f"TEST_{uuid.uuid4().hex[:8]}@motoresq.app"
        r = api_client.post(f"{base_url}/api/auth/signup",
                            json={"email": email, "password": "secret123", "name": "Temp"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["email"] == email.lower()
        assert d["access_token"]

    def test_signup_duplicate(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/signup",
                            json={"email": "rider@motoresq.app", "password": "rider1234",
                                  "name": "Dup"})
        assert r.status_code == 409

    def test_me(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == "rider@motoresq.app"

    def test_me_missing_token(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401


# ---------- Motorcycle ----------
class TestMotorcycle:
    def test_update_and_persist(self, api_client, base_url, auth_headers):
        payload = {"make": "Yamaha", "model": "MT-07", "year": 2022,
                   "odometer": 15000, "nickname": "Blackie"}
        r = api_client.put(f"{base_url}/api/motorcycle", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["motorcycle"]["make"] == "Yamaha"
        assert u["motorcycle"]["model"] == "MT-07"
        assert u["motorcycle"]["year"] == 2022

        # verify persistence via /me
        r2 = api_client.get(f"{base_url}/api/auth/me", headers=auth_headers)
        assert r2.json()["motorcycle"]["nickname"] == "Blackie"


# ---------- Maintenance CRUD ----------
class TestMaintenance:
    created_id = None

    def test_add(self, api_client, base_url, auth_headers):
        payload = {"service_type": "TEST_Oil Change", "date": "2026-01-15",
                   "odometer": 15100, "cost": 45.5, "notes": "TEST entry"}
        r = api_client.post(f"{base_url}/api/maintenance", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["service_type"] == "TEST_Oil Change"
        assert d["odometer"] == 15100
        assert d["id"]
        TestMaintenance.created_id = d["id"]

    def test_list_contains(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/maintenance", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()
        assert any(i["id"] == TestMaintenance.created_id for i in items)

    def test_delete(self, api_client, base_url, auth_headers):
        assert TestMaintenance.created_id
        r = api_client.delete(f"{base_url}/api/maintenance/{TestMaintenance.created_id}",
                              headers=auth_headers)
        assert r.status_code == 200
        # confirm deletion
        r2 = api_client.get(f"{base_url}/api/maintenance", headers=auth_headers)
        assert not any(i["id"] == TestMaintenance.created_id for i in r2.json())


# ---------- Diagnostics ----------
class TestDiagnostics:
    def test_categories(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/diagnostic/categories")
        assert r.status_code == 200
        cats = r.json()
        assert len(cats) == 6
        ids = {c["id"] for c in cats}
        assert {"wont_start", "overheating", "brakes",
                "flat_tire", "chain", "electrical"} <= ids

    def test_get_category(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/diagnostic/wont_start")
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "Won't Start"
        assert len(d["questions"]) >= 1
        assert len(d["rules"]) >= 1

    def test_get_category_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/diagnostic/nope")
        assert r.status_code == 404

    def test_analyze_match(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/diagnostic/analyze", json={
            "category": "wont_start",
            "answers": {"battery_lights": "no", "starter_sound": "nothing", "fuel": "yes"}
        })
        assert r.status_code == 200
        results = r.json()["results"]
        assert any("battery" in x["cause"].lower() for x in results)
        first = results[0]
        assert first["severity"] in {"low", "medium", "high"}
        assert first["guide_id"] == "battery"

    def test_analyze_no_match(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/diagnostic/analyze", json={
            "category": "brakes", "answers": {"feel": "hard", "noise": "none"}
        })
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) >= 1  # fallback


# ---------- Repair Guides ----------
class TestGuides:
    def test_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/guides")
        assert r.status_code == 200
        guides = r.json()
        assert len(guides) == 12
        for g in guides:
            assert {"id", "title", "category", "time", "difficulty"} <= set(g.keys())

    def test_detail(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/guides/battery")
        assert r.status_code == 200
        g = r.json()
        assert g["title"] == "Jump-start or Replace Battery"
        assert isinstance(g["tools"], list) and g["tools"]
        assert isinstance(g["warnings"], list) and g["warnings"]
        assert isinstance(g["steps"], list) and len(g["steps"]) >= 3

    def test_detail_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/guides/nonexistent")
        assert r.status_code == 404


# ---------- AI Chat ----------
class TestAIChat:
    def test_chat_reply(self, api_client, base_url, auth_headers):
        payload = {"session_id": f"test-{uuid.uuid4().hex[:6]}",
                   "message": "In one short sentence: what causes a spongy brake lever?"}
        r = api_client.post(f"{base_url}/api/chat", json=payload,
                            headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["reply"], str) and len(d["reply"]) > 5

    def test_chat_requires_auth(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/chat",
                            json={"session_id": "x", "message": "hi"})
        assert r.status_code == 401


# ---------- TTS ----------
class TestTTS:
    def test_tts_returns_mp3(self, api_client, base_url, auth_headers):
        r = api_client.post(f"{base_url}/api/tts",
                            json={"text": "Hello rider", "voice": "nova"},
                            headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("audio/mpeg")
        assert len(r.content) > 500  # got real audio bytes

    def test_tts_empty_text(self, api_client, base_url, auth_headers):
        r = api_client.post(f"{base_url}/api/tts", json={"text": "   "},
                            headers=auth_headers)
        assert r.status_code == 400

    def test_tts_requires_auth(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/tts", json={"text": "hi"})
        assert r.status_code == 401
