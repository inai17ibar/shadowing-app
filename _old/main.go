package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/PuerkitoBio/goquery"
	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

func initDB(dbPath string) error {
	var err error
	db, err = sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS saved_texts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL DEFAULT '',
			source_url TEXT NOT NULL DEFAULT '',
			paragraphs TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	return err
}

func setupRouter() *gin.Engine {
	r := gin.Default()

	r.Use(cors.Default())

	// フロントエンドの静的ファイルを配信
	r.Use(static.Serve("/", static.LocalFile("./shadowing-app-frontend/dist", true)))

	r.GET("/search", handleSearch)
	r.GET("/extract", handleExtract)

	// 保存テキストのCRUD
	r.POST("/api/texts", handleSaveText)
	r.GET("/api/texts", handleListTexts)
	r.GET("/api/texts/:id", handleGetText)
	r.DELETE("/api/texts/:id", handleDeleteText)

	// SPAのフォールバック: 未知のルートをindex.htmlにリダイレクト
	r.NoRoute(func(c *gin.Context) {
		c.File("./shadowing-app-frontend/dist/index.html")
	})

	return r
}

func handleSearch(c *gin.Context) {
	query := c.DefaultQuery("q", "")

	apiKey := os.Getenv("YOUTUBE_DATA_API_KEY")
	endpoint := "https://www.googleapis.com/youtube/v3/search"
	fullURL := endpoint + "?part=snippet&type=video&maxResults=5&q=" + query + "&key=" + apiKey

	resp, err := http.Get(fullURL)
	if err != nil {
		log.Println("Failed to fetch data from YouTube:", err)
		c.JSON(500, gin.H{"error": "Failed to fetch data from YouTube"})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Println("Failed to read YouTube response:", err)
		c.JSON(500, gin.H{"error": "Failed to read YouTube response"})
		return
	}

	var youtubeResponse YoutubeResponse
	err = json.Unmarshal(body, &youtubeResponse)
	if err != nil {
		log.Println("Failed to parse YouTube API response:", err)
		c.JSON(500, gin.H{"error": "Failed to parse YouTube API response"})
		return
	}

	videos := []map[string]string{}
	for _, item := range youtubeResponse.Items {
		video := map[string]string{
			"id":        item.Id.VideoId,
			"title":     item.Snippet.Title,
			"thumbnail": item.Snippet.Thumbnails.Default.URL,
		}
		videos = append(videos, video)
	}

	c.JSON(200, gin.H{"results": videos})
}

func handleExtract(c *gin.Context) {
	rawURL := c.DefaultQuery("url", "")
	if rawURL == "" {
		c.JSON(400, gin.H{"error": "URLを指定してください"})
		return
	}

	parsedURL, err := url.ParseRequestURI(rawURL)
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		c.JSON(400, gin.H{"error": "有効なURLを指定してください"})
		return
	}

	resp, err := http.Get(parsedURL.String())
	if err != nil {
		log.Println("Failed to fetch URL:", err)
		c.JSON(500, gin.H{"error": "ページの取得に失敗しました"})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		c.JSON(500, gin.H{"error": "ページの取得に失敗しました (status: " + resp.Status + ")"})
		return
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		log.Println("Failed to parse HTML:", err)
		c.JSON(500, gin.H{"error": "HTMLの解析に失敗しました"})
		return
	}

	doc.Find("script, style, nav, footer, header, aside, form, noscript").Remove()

	title := strings.TrimSpace(doc.Find("title").Text())

	var paragraphs []string
	doc.Find("p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, caption, figcaption").Each(func(i int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())
		if len(text) > 0 {
			paragraphs = append(paragraphs, text)
		}
	})

	if len(paragraphs) == 0 {
		bodyText := strings.TrimSpace(doc.Find("body").Text())
		if bodyText != "" {
			paragraphs = []string{bodyText}
		}
	}

	c.JSON(200, gin.H{
		"title":      title,
		"paragraphs": paragraphs,
	})
}

// テキストを保存
func handleSaveText(c *gin.Context) {
	var req struct {
		Title      string   `json:"title"`
		SourceURL  string   `json:"source_url"`
		Paragraphs []string `json:"paragraphs"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "リクエストが不正です"})
		return
	}

	if len(req.Paragraphs) == 0 {
		c.JSON(400, gin.H{"error": "テキストが空です"})
		return
	}

	paragraphsJSON, err := json.Marshal(req.Paragraphs)
	if err != nil {
		c.JSON(500, gin.H{"error": "データの変換に失敗しました"})
		return
	}

	result, err := db.Exec(
		"INSERT INTO saved_texts (title, source_url, paragraphs) VALUES (?, ?, ?)",
		req.Title, req.SourceURL, string(paragraphsJSON),
	)
	if err != nil {
		log.Println("Failed to save text:", err)
		c.JSON(500, gin.H{"error": "保存に失敗しました"})
		return
	}

	id, _ := result.LastInsertId()
	c.JSON(201, gin.H{"id": id})
}

// 保存テキスト一覧
func handleListTexts(c *gin.Context) {
	rows, err := db.Query("SELECT id, title, source_url, created_at FROM saved_texts ORDER BY id DESC")
	if err != nil {
		log.Println("Failed to list texts:", err)
		c.JSON(500, gin.H{"error": "取得に失敗しました"})
		return
	}
	defer rows.Close()

	type TextSummary struct {
		ID        int64  `json:"id"`
		Title     string `json:"title"`
		SourceURL string `json:"source_url"`
		CreatedAt string `json:"created_at"`
	}

	var texts []TextSummary
	for rows.Next() {
		var t TextSummary
		if err := rows.Scan(&t.ID, &t.Title, &t.SourceURL, &t.CreatedAt); err != nil {
			continue
		}
		texts = append(texts, t)
	}

	if texts == nil {
		texts = []TextSummary{}
	}

	c.JSON(200, gin.H{"texts": texts})
}

// 保存テキスト取得
func handleGetText(c *gin.Context) {
	id := c.Param("id")

	var title, sourceURL, paragraphsJSON, createdAt string
	err := db.QueryRow(
		"SELECT title, source_url, paragraphs, created_at FROM saved_texts WHERE id = ?", id,
	).Scan(&title, &sourceURL, &paragraphsJSON, &createdAt)
	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "テキストが見つかりません"})
		return
	}
	if err != nil {
		log.Println("Failed to get text:", err)
		c.JSON(500, gin.H{"error": "取得に失敗しました"})
		return
	}

	var paragraphs []string
	json.Unmarshal([]byte(paragraphsJSON), &paragraphs)

	c.JSON(200, gin.H{
		"title":      title,
		"source_url": sourceURL,
		"paragraphs": paragraphs,
		"created_at": createdAt,
	})
}

// 保存テキスト削除
func handleDeleteText(c *gin.Context) {
	id := c.Param("id")

	result, err := db.Exec("DELETE FROM saved_texts WHERE id = ?", id)
	if err != nil {
		log.Println("Failed to delete text:", err)
		c.JSON(500, gin.H{"error": "削除に失敗しました"})
		return
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		c.JSON(404, gin.H{"error": "テキストが見つかりません"})
		return
	}

	c.JSON(200, gin.H{"message": "削除しました"})
}

func main() {
	gin.SetMode(gin.ReleaseMode)

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./shadowing.db"
	}

	if err := initDB(dbPath); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer db.Close()

	r := setupRouter()
	r.Run(":8080")
}

// 応答の構造体
type YoutubeResponse struct {
	Items []struct {
		Id struct {
			VideoId string `json:"videoId"`
		} `json:"id"`
		Snippet struct {
			Title      string `json:"title"`
			Thumbnails struct {
				Default struct {
					URL string `json:"url"`
				} `json:"default"`
			} `json:"thumbnails"`
		} `json:"snippet"`
	} `json:"items"`
}
