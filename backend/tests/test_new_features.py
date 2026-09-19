"""Tests for iteration 2 features:
- STT /api/transcriptions
- Bike photo upload /api/motorcycle/photo + /api/files/{path}
- Emergency contacts CRUD /api/emergency/contacts
- Service reminders /api/reminders + odometer patch
- Data.py refactor regression (guides, diagnostics, chat)
"""

import io
import os
import wave
import struct
import math
import uuid
import pytest
import requests


# ---------------- Helpers ----------------
def _make_wav_bytes(seconds: float = 1.0, freq: int = 440, rate: int = 16000) -> bytes:
    """Generate a small mono PCM WAV file in memory."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        n = int(seconds * rate)
        for i in range(n):
            v = int(32767 * 0.2 * math.sin(2 * math.pi * freq * i / rate))
            w.writeframes(struct.pack("<h", v))
    return buf.getvalue()


def _make_png_bytes() -> bytes:
    """Minimal 1x1 transparent PNG."""
    return bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c6300010000000500010d0a2db40000000049454e44"
        "ae426082"
    )


# ---------------- STT / Transcriptions ----------------
class TestTranscriptions:
    def test_requires_auth(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/transcriptions",
                            files={"file": ("t.wav", b"RIFF", "audio/wav")})
        assert r.status_code == 401

    def test_empty_file(self, base_url, auth_token):
        r = requests.post(
            f"{base_url}/api/transcriptions",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("empty.wav", b"", "audio/wav")},
            timeout=60,
        )
        assert r.status_code == 400, r.text

    def test_transcribe_wav_tone(self, base_url, auth_token):
        wav = _make_wav_bytes(1.0)
        r = requests.post(
            f"{base_url}/api/transcriptions",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("tone.wav", wav, "audio/wav")},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "text" in d and isinstance(d["text"], str)


# ---------------- Bike photo upload ----------------
class TestBikePhoto:
    uploaded_path = None

    def test_requires_auth(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/motorcycle/photo",
                            files={"file": ("x.png", _make_png_bytes(), "image/png")})
        assert r.status_code == 401

    def test_unsupported_type(self, base_url, auth_token):
        r = requests.post(
            f"{base_url}/api/motorcycle/photo",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("hi.txt", b"hello", "text/plain")},
            timeout=30,
        )
        assert r.status_code == 415, r.text

    def test_upload_png(self, base_url, auth_token):
        r = requests.post(
            f"{base_url}/api/motorcycle/photo",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("bike.png", _make_png_bytes(), "image/png")},
            timeout=60,
        )
        if r.status_code == 402:
            pytest.skip("Storage credits exhausted")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["bike_photo"] and d["bike_photo"].startswith("motoresq/uploads/")
        assert d["bike_photo"].endswith(".png")
        TestBikePhoto.uploaded_path = d["bike_photo"]

    def test_fetch_file_with_token_query(self, base_url, auth_token):
        if not TestBikePhoto.uploaded_path:
            pytest.skip("No uploaded file")
        r = requests.get(
            f"{base_url}/api/files/{TestBikePhoto.uploaded_path}",
            params={"token": auth_token},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 0

    def test_fetch_unknown_path_404(self, base_url, auth_token):
        r = requests.get(
            f"{base_url}/api/files/motoresq/uploads/nonexistent/{uuid.uuid4().hex}.png",
            params={"token": auth_token},
            timeout=30,
        )
        assert r.status_code == 404

    def test_fetch_file_requires_token(self, base_url):
        r = requests.get(
            f"{base_url}/api/files/motoresq/uploads/x/y.png",
            timeout=30,
        )
        assert r.status_code == 401


# ---------------- Emergency contacts ----------------
class TestEmergencyContacts:
    created_id = None

    def test_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/emergency/contacts")
        assert r.status_code == 401

    def test_create(self, api_client, base_url, auth_headers):
        r = api_client.post(f"{base_url}/api/emergency/contacts",
                            json={"name": "TEST_Tow Co", "phone": "+15551234567",
                                  "kind": "tow"}, headers=auth_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_Tow Co" and d["kind"] == "tow"
        assert d["id"]
        TestEmergencyContacts.created_id = d["id"]

    def test_list_contains(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/emergency/contacts", headers=auth_headers)
        assert r.status_code == 200
        arr = r.json()
        assert any(c["id"] == TestEmergencyContacts.created_id for c in arr)

    def test_invalid_kind(self, api_client, base_url, auth_headers):
        r = api_client.post(f"{base_url}/api/emergency/contacts",
                            json={"name": "TEST_x", "phone": "12345", "kind": "invalid"},
                            headers=auth_headers)
        assert r.status_code == 400

    def test_empty_name(self, api_client, base_url, auth_headers):
        r = api_client.post(f"{base_url}/api/emergency/contacts",
                            json={"name": "   ", "phone": "12345", "kind": "personal"},
                            headers=auth_headers)
        assert r.status_code == 400

    def test_delete(self, api_client, base_url, auth_headers):
        assert TestEmergencyContacts.created_id
        r = api_client.delete(
            f"{base_url}/api/emergency/contacts/{TestEmergencyContacts.created_id}",
            headers=auth_headers)
        assert r.status_code == 200
        # verify absence
        r2 = api_client.get(f"{base_url}/api/emergency/contacts", headers=auth_headers)
        assert not any(c["id"] == TestEmergencyContacts.created_id for c in r2.json())

    def test_delete_unknown(self, api_client, base_url, auth_headers):
        r = api_client.delete(
            f"{base_url}/api/emergency/contacts/{uuid.uuid4()}", headers=auth_headers)
        assert r.status_code == 404


# ---------------- Service reminders ----------------
class TestReminders:
    """Tests reminder computation. Sets known motorcycle odometer=15000 and
    adds two maintenance logs, then verifies status buckets."""

    created_ids = []

    @pytest.fixture(scope="class", autouse=True)
    def _setup(self, api_client, base_url, auth_headers):
        # Ensure motorcycle exists with odometer 15000
        api_client.put(f"{base_url}/api/motorcycle", json={
            "make": "Yamaha", "model": "MT-07", "year": 2022,
            "odometer": 15000, "nickname": "Blackie"
        }, headers=auth_headers)
        # Clean previously matching test maintenance to keep test deterministic
        existing = api_client.get(f"{base_url}/api/maintenance", headers=auth_headers).json()
        for m in existing:
            st = (m.get("service_type") or "").lower()
            if "TEST_R_" in m.get("service_type", ""):
                api_client.delete(f"{base_url}/api/maintenance/{m['id']}", headers=auth_headers)
        # Add oil change at 9000
        r1 = api_client.post(f"{base_url}/api/maintenance", json={
            "service_type": "TEST_R_Oil change", "date": "2025-06-01",
            "odometer": 9000, "cost": 0
        }, headers=auth_headers)
        assert r1.status_code == 200, r1.text
        TestReminders.created_ids.append(r1.json()["id"])
        # Add chain lube at 14500
        r2 = api_client.post(f"{base_url}/api/maintenance", json={
            "service_type": "TEST_R_Chain lube", "date": "2025-12-15",
            "odometer": 14500, "cost": 0
        }, headers=auth_headers)
        assert r2.status_code == 200, r2.text
        TestReminders.created_ids.append(r2.json()["id"])
        yield
        # Cleanup
        for mid in TestReminders.created_ids:
            api_client.delete(f"{base_url}/api/maintenance/{mid}", headers=auth_headers)

    def test_requires_auth(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/reminders")
        assert r.status_code == 401

    def test_shape(self, api_client, base_url, auth_headers):
        r = api_client.get(f"{base_url}/api/reminders", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["has_motorcycle"] is True
        assert d["odometer"] == 15000
        assert "summary" in d and {"overdue", "due_soon", "tracked"} <= set(d["summary"].keys())
        assert isinstance(d["items"], list) and len(d["items"]) == 8

    def test_oil_overdue(self, api_client, base_url, auth_headers):
        d = api_client.get(f"{base_url}/api/reminders", headers=auth_headers).json()
        oil = next(i for i in d["items"] if i["id"] == "oil")
        assert oil["status"] == "overdue", oil
        assert oil["last_odometer"] == 9000
        assert oil["due_at_km"] == 14000
        assert oil["remaining_km"] == -1000

    def test_chain_lube_ok(self, api_client, base_url, auth_headers):
        d = api_client.get(f"{base_url}/api/reminders", headers=auth_headers).json()
        cl = next(i for i in d["items"] if i["id"] == "chain_lube")
        # last_odo=14500, interval=800 => due_at=15300, remaining=300, threshold=max(120,100)=120
        assert cl["last_odometer"] == 14500
        assert cl["due_at_km"] == 15300
        assert cl["remaining_km"] == 300
        assert cl["status"] == "ok"

    def test_unknown_items(self, api_client, base_url, auth_headers):
        d = api_client.get(f"{base_url}/api/reminders", headers=auth_headers).json()
        # brake/spark etc without logs should be 'unknown'
        unknown_ids = {i["id"] for i in d["items"] if i["status"] == "unknown"}
        assert "brake" in unknown_ids
        assert "spark" in unknown_ids

    def test_patch_odometer(self, api_client, base_url, auth_headers):
        r = api_client.patch(f"{base_url}/api/motorcycle/odometer",
                             json={"odometer": 15200}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["motorcycle"]["odometer"] == 15200
        # reminders reflect
        d = api_client.get(f"{base_url}/api/reminders", headers=auth_headers).json()
        assert d["odometer"] == 15200
        # restore
        api_client.patch(f"{base_url}/api/motorcycle/odometer",
                         json={"odometer": 15000}, headers=auth_headers)

    def test_patch_odometer_negative(self, api_client, base_url, auth_headers):
        r = api_client.patch(f"{base_url}/api/motorcycle/odometer",
                             json={"odometer": -1}, headers=auth_headers)
        assert r.status_code == 400


# ---------------- Regression after data.py refactor ----------------
class TestRegression:
    def test_guides_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/guides")
        assert r.status_code == 200 and len(r.json()) == 12

    def test_diag_categories(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/diagnostic/categories")
        assert r.status_code == 200 and len(r.json()) == 6

    def test_chat_still_works(self, api_client, base_url, auth_headers):
        r = api_client.post(
            f"{base_url}/api/chat",
            json={"session_id": f"regress-{uuid.uuid4().hex[:6]}",
                  "message": "Reply with just: OK"},
            headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200
        assert isinstance(r.json()["reply"], str) and len(r.json()["reply"]) > 0
