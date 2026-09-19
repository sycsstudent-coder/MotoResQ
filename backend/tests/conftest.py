import os
import pytest
import requests
from pathlib import Path

# Load frontend/.env for EXPO_PUBLIC_BACKEND_URL
env_file = Path(__file__).resolve().parents[2] / "frontend" / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
            os.environ["EXPO_PUBLIC_BACKEND_URL"] = line.split("=", 1)[1].strip().strip('"')

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_token(api_client):
    # Try existing test user first
    r = api_client.post(f"{BASE_URL}/api/auth/login",
                        json={"email": "rider@motoresq.app", "password": "rider1234"})
    if r.status_code == 200:
        return r.json()["access_token"]
    # Otherwise sign up
    r = api_client.post(f"{BASE_URL}/api/auth/signup",
                        json={"email": "rider@motoresq.app", "password": "rider1234",
                              "name": "Test Rider"})
    assert r.status_code in (200, 409), r.text
    if r.status_code == 409:
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": "rider@motoresq.app", "password": "rider1234"})
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
