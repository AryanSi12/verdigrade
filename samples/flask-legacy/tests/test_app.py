def test_health_reports_ok_and_the_flask_version(client):
    body = client.get("/health").get_json()
    assert body["status"] == "ok"
    assert body["flask"]
    assert body["uptime_seconds"] >= 0


def test_every_response_carries_a_request_id(client):
    response = client.get("/health")
    assert len(response.headers["X-Request-Id"]) >= 8


def test_the_callers_request_id_is_echoed(client):
    response = client.get("/health", headers={"X-Request-Id": "abc-123"})
    assert response.headers["X-Request-Id"] == "abc-123"
