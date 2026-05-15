package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
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

// DB付きテスト用ルーター
func setupTestRouterWithDB(t *testing.T) *gin.Engine {
	t.Helper()
	tmpFile, err := os.CreateTemp("", "test-*.db")
	if err != nil {
		t.Fatal(err)
	}
	tmpFile.Close()
	t.Cleanup(func() { os.Remove(tmpFile.Name()) })

	if err := initDB(tmpFile.Name()); err != nil {
		t.Fatal(err)
	}

	r := gin.Default()
	r.POST("/api/texts", handleSaveText)
	r.GET("/api/texts", handleListTexts)
	r.GET("/api/texts/:id", handleGetText)
	r.DELETE("/api/texts/:id", handleDeleteText)
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

// === テキスト永続化 API テスト ===

func TestSaveText(t *testing.T) {
	router := setupTestRouterWithDB(t)

	body := `{"title":"Test Article","source_url":"https://example.com","paragraphs":["Hello world.","Second sentence."]}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/texts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != 201 {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["id"] == nil {
		t.Error("expected id in response")
	}
}

func TestSaveText_EmptyParagraphs(t *testing.T) {
	router := setupTestRouterWithDB(t)

	body := `{"title":"Empty","paragraphs":[]}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/texts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	if w.Code != 400 {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestListTexts_Empty(t *testing.T) {
	router := setupTestRouterWithDB(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/texts", nil)
	router.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp struct {
		Texts []interface{} `json:"texts"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Texts) != 0 {
		t.Errorf("expected empty list, got %d items", len(resp.Texts))
	}
}

func TestSaveAndListTexts(t *testing.T) {
	router := setupTestRouterWithDB(t)

	// 2件保存
	for _, title := range []string{"First", "Second"} {
		body := fmt.Sprintf(`{"title":"%s","paragraphs":["text"]}`, title)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/texts", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(w, req)
	}

	// 一覧取得
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/texts", nil)
	router.ServeHTTP(w, req)

	var resp struct {
		Texts []struct {
			ID    int64  `json:"id"`
			Title string `json:"title"`
		} `json:"texts"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)

	if len(resp.Texts) != 2 {
		t.Fatalf("expected 2 texts, got %d", len(resp.Texts))
	}

	// 最新が先頭（DESC順）
	if resp.Texts[0].Title != "Second" {
		t.Errorf("expected newest first, got '%s'", resp.Texts[0].Title)
	}
}

func TestGetText(t *testing.T) {
	router := setupTestRouterWithDB(t)

	// 保存
	body := `{"title":"My Text","source_url":"https://example.com/page","paragraphs":["Sentence one.","Sentence two."]}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/texts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	var saveResp struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(w.Body.Bytes(), &saveResp)

	// 取得
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", fmt.Sprintf("/api/texts/%d", saveResp.ID), nil)
	router.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var getResp struct {
		Title      string   `json:"title"`
		SourceURL  string   `json:"source_url"`
		Paragraphs []string `json:"paragraphs"`
	}
	json.Unmarshal(w.Body.Bytes(), &getResp)

	if getResp.Title != "My Text" {
		t.Errorf("expected title 'My Text', got '%s'", getResp.Title)
	}
	if getResp.SourceURL != "https://example.com/page" {
		t.Errorf("expected source_url, got '%s'", getResp.SourceURL)
	}
	if len(getResp.Paragraphs) != 2 {
		t.Errorf("expected 2 paragraphs, got %d", len(getResp.Paragraphs))
	}
}

func TestGetText_NotFound(t *testing.T) {
	router := setupTestRouterWithDB(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/texts/999", nil)
	router.ServeHTTP(w, req)

	if w.Code != 404 {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestDeleteText(t *testing.T) {
	router := setupTestRouterWithDB(t)

	// 保存
	body := `{"title":"To Delete","paragraphs":["text"]}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/texts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	var saveResp struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(w.Body.Bytes(), &saveResp)

	// 削除
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("DELETE", fmt.Sprintf("/api/texts/%d", saveResp.ID), nil)
	router.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}

	// 削除後に取得すると404
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", fmt.Sprintf("/api/texts/%d", saveResp.ID), nil)
	router.ServeHTTP(w, req)

	if w.Code != 404 {
		t.Errorf("expected 404 after delete, got %d", w.Code)
	}
}

func TestDeleteText_NotFound(t *testing.T) {
	router := setupTestRouterWithDB(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/texts/999", nil)
	router.ServeHTTP(w, req)

	if w.Code != 404 {
		t.Errorf("expected 404, got %d", w.Code)
	}
}
