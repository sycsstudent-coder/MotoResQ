"""Iteration 3: Chat sessions (list/delete) + regression."""
import uuid
import time
import pytest


class TestChatSessions:
    session_id = None

    def test_requires_auth_list(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/chat/sessions")
        assert r.status_code == 401

    def test_requires_auth_delete(self, api_client, base_url):
        r = api_client.delete(f"{base_url}/api/chat/sessions/anything")
        assert r.status_code == 401

    def test_create_session_via_chat(self, api_client, base_url, auth_headers):
        sid = f"t-{uuid.uuid4().hex[:8]}"
        r = api_client.post(
            f"{base_url}/api/chat",
            json={"session_id": sid, "message": "Reply just OK"},
            headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("reply"), str) and r.json()["reply"]
        TestChatSessions.session_id = sid

    def test_sessions_list_shape_and_contains(self, api_client, base_url, auth_headers):
        sid = TestChatSessions.session_id
        assert sid
        # small delay for aggregation consistency
        time.sleep(0.5)
        r = api_client.get(f"{base_url}/api/chat/sessions", headers=auth_headers)
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        # sorted by last_at desc
        if len(arr) >= 2:
            for a, b in zip(arr, arr[1:]):
                assert a["last_at"] >= b["last_at"]
        # find our created session
        me = next((s for s in arr if s["session_id"] == sid), None)
        assert me, f"Created session {sid} not in list"
        # shape
        assert set(me.keys()) >= {"session_id", "title", "last_at", "count"}
        assert me["count"] == 2  # user + assistant
        assert me["title"] == "Reply just OK"  # first user message

    def test_history_still_works(self, api_client, base_url, auth_headers):
        sid = TestChatSessions.session_id
        r = api_client.get(f"{base_url}/api/chat/history/{sid}", headers=auth_headers)
        assert r.status_code == 200
        docs = r.json()
        assert len(docs) == 2
        roles = [d["role"] for d in docs]
        assert roles == ["user", "assistant"]
        assert docs[0]["content"] == "Reply just OK"

    def test_delete_session(self, api_client, base_url, auth_headers):
        sid = TestChatSessions.session_id
        r = api_client.delete(f"{base_url}/api/chat/sessions/{sid}", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True

    def test_deleted_session_gone(self, api_client, base_url, auth_headers):
        sid = TestChatSessions.session_id
        r = api_client.get(f"{base_url}/api/chat/sessions", headers=auth_headers)
        assert r.status_code == 200
        assert not any(s["session_id"] == sid for s in r.json())

    def test_delete_unknown_404(self, api_client, base_url, auth_headers):
        r = api_client.delete(
            f"{base_url}/api/chat/sessions/does-not-exist-{uuid.uuid4().hex[:6]}",
            headers=auth_headers,
        )
        assert r.status_code == 404


class TestRegression:
    def test_guides_still_ok(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/guides")
        assert r.status_code == 200 and len(r.json()) >= 6

    def test_diag_categories_ok(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/diagnostic/categories")
        assert r.status_code == 200 and len(r.json()) >= 4

    def test_root_health(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200 and r.json().get("ok") is True
