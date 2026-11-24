def make(client, **body):
    return client.post("/links", json=body)


def test_create_returns_201_and_a_normalised_target(client):
    response = make(client, url="Example.COM/path#frag", slug="Hello World")
    assert response.status_code == 201
    data = response.get_json()
    assert data["slug"] == "hello-world"
    assert data["target"] == "http://example.com/path"
    assert data["clicks"] == 0


def test_created_at_is_serialised_by_the_custom_encoder(client):
    data = make(client, url="example.org", slug="a1").get_json()
    assert data["created_at"][:4].isdigit() and "T" in data["created_at"]


def test_a_random_slug_is_used_when_none_is_given(client):
    data = make(client, url="https://example.org").get_json()
    assert len(data["slug"]) == 6


def test_duplicate_slug_is_409(client):
    make(client, url="example.org", slug="dup")
    assert make(client, url="example.net", slug="dup").status_code == 409


def test_bad_url_is_400(client):
    assert make(client, url="ftp://example.org").status_code == 400
    assert make(client, url="").status_code == 400


def test_following_a_link_redirects_and_counts(client):
    make(client, url="https://example.org/x", slug="go")
    first = client.get("/l/go")
    assert first.status_code == 302
    assert first.headers["Location"] == "https://example.org/x"
    client.get("/l/go")
    links = client.get("/links").get_json()["links"]
    assert [link["clicks"] for link in links] == [2]


def test_unknown_slug_is_404(client):
    assert client.get("/l/missing").status_code == 404


def test_list_has_a_summary(client):
    make(client, url="example.org", slug="s1")
    make(client, url="example.net", slug="s2")
    client.get("/l/s2")
    body = client.get("/links").get_json()
    assert body["summary"] == {"links": 2, "clicks": 1}


def test_top_orders_by_clicks(client):
    make(client, url="example.org", slug="low")
    make(client, url="example.net", slug="high")
    client.get("/l/high")
    top = client.get("/links/top").get_json()
    assert [link["slug"] for link in top] == ["high", "low"]


def test_delete(client):
    make(client, url="example.org", slug="gone")
    assert client.delete("/links/gone").status_code == 204
    assert client.delete("/links/gone").status_code == 404
