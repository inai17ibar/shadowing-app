package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// テスト用のルーター（static middleware なし）
func setupTestRouter() *gin.Engine {
	r := gin.Default()
	r.GET("/extract", handleExtract)
	return r
}

func TestExtract_MissingURL(t *testing.T) {
	router := setupTestRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/extract", nil)
	router.ServeHTTP(w, req)

	if w.Code != 400 {
		t.Errorf("expected status 400, got %d", w.Code)
	}

	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] != "URLを指定してください" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

func TestExtract_InvalidURL(t *testing.T) {
	router := setupTestRouter()

	tests := []struct {
		name string
		url  string
	}{
		{"no scheme", "example.com"},
		{"ftp scheme", "ftp://example.com"},
		{"javascript scheme", "javascript:alert(1)"},
		{"empty scheme", "://example.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req, _ := http.NewRequest("GET", "/extract?url="+tt.url, nil)
			router.ServeHTTP(w, req)

			if w.Code != 400 {
				t.Errorf("expected status 400, got %d", w.Code)
			}
		})
	}
}

func TestExtract_HTMLParsing(t *testing.T) {
	// テスト用HTMLサーバー
	htmlServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <header><nav>Navigation</nav></header>
  <script>console.log("should be removed")</script>
  <style>.hidden{display:none}</style>
  <h1>Main Title</h1>
  <p>First paragraph content.</p>
  <p>Second paragraph content.</p>
  <footer>Footer text</footer>
</body>
</html>`)
	}))
	defer htmlServer.Close()

	router := setupTestRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/extract?url="+htmlServer.URL, nil)
	router.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected status 200, got %d, body: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Title      string   `json:"title"`
		Paragraphs []string `json:"paragraphs"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp.Title != "Test Page" {
		t.Errorf("expected title 'Test Page', got '%s'", resp.Title)
	}

	if len(resp.Paragraphs) < 2 {
		t.Fatalf("expected at least 2 paragraphs, got %d: %v", len(resp.Paragraphs), resp.Paragraphs)
	}

	// h1 + 2つのp要素
	found := map[string]bool{"Main Title": false, "First paragraph content.": false, "Second paragraph content.": false}
	for _, p := range resp.Paragraphs {
		if _, ok := found[p]; ok {
			found[p] = true
		}
	}
	for text, ok := range found {
		if !ok {
			t.Errorf("expected paragraph '%s' not found in results: %v", text, resp.Paragraphs)
		}
	}
}

func TestExtract_ScriptStyleRemoval(t *testing.T) {
	htmlServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><head><title>Test</title></head><body>
<script>var secret = "hidden";</script>
<style>.cls { color: red; }</style>
<nav><p>Nav content</p></nav>
<p>Visible content</p>
<aside><p>Sidebar</p></aside>
</body></html>`)
	}))
	defer htmlServer.Close()

	router := setupTestRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/extract?url="+htmlServer.URL, nil)
	router.ServeHTTP(w, req)

	var resp struct {
		Paragraphs []string `json:"paragraphs"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)

	for _, p := range resp.Paragraphs {
		if p == "Nav content" || p == "Sidebar" {
			t.Errorf("nav/aside content should be removed, but found: '%s'", p)
		}
		if p == `var secret = "hidden";` {
			t.Error("script content should be removed")
		}
		if p == `.cls { color: red; }` {
			t.Error("style content should be removed")
		}
	}
}

func TestExtract_FallbackBodyText(t *testing.T) {
	htmlServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<html><head><title>Simple</title></head><body>
<div>Just some text without paragraph tags</div>
</body></html>`)
	}))
	defer htmlServer.Close()

	router := setupTestRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/extract?url="+htmlServer.URL, nil)
	router.ServeHTTP(w, req)

	var resp struct {
		Title      string   `json:"title"`
		Paragraphs []string `json:"paragraphs"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.Title != "Simple" {
		t.Errorf("expected title 'Simple', got '%s'", resp.Title)
	}

	// フォールバックでbodyテキストが取得されるはず
	if len(resp.Paragraphs) == 0 {
		t.Error("expected at least one paragraph from body fallback")
	}
}

func TestExtract_ServerError(t *testing.T) {
	htmlServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
	}))
	defer htmlServer.Close()

	router := setupTestRouter()

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/extract?url="+htmlServer.URL, nil)
	router.ServeHTTP(w, req)

	if w.Code != 500 {
		t.Errorf("expected status 500, got %d", w.Code)
	}
}

func TestYoutubeResponseParsing(t *testing.T) {
	jsonData := `{
		"items": [
			{
				"id": {"videoId": "abc123"},
				"snippet": {
					"title": "Test Video",
					"thumbnails": {
						"default": {"url": "https://example.com/thumb.jpg"}
					}
				}
			}
		]
	}`

	var resp YoutubeResponse
	err := json.Unmarshal([]byte(jsonData), &resp)
	if err != nil {
		t.Fatalf("failed to parse: %v", err)
	}

	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(resp.Items))
	}

	item := resp.Items[0]
	if item.Id.VideoId != "abc123" {
		t.Errorf("expected videoId 'abc123', got '%s'", item.Id.VideoId)
	}
	if item.Snippet.Title != "Test Video" {
		t.Errorf("expected title 'Test Video', got '%s'", item.Snippet.Title)
	}
	if item.Snippet.Thumbnails.Default.URL != "https://example.com/thumb.jpg" {
		t.Errorf("expected thumbnail URL 'https://example.com/thumb.jpg', got '%s'", item.Snippet.Thumbnails.Default.URL)
	}
}
