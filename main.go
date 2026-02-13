package main

import (
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
)

func main() {
	gin.SetMode(gin.ReleaseMode)

	r := gin.Default()

	r.Use(cors.Default())

	// フロントエンドの静的ファイルを配信
	r.Use(static.Serve("/", static.LocalFile("./shadowing-app-frontend/dist", true)))

	r.GET("/search", func(c *gin.Context) {
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
	})

	// Webページからテキストを抽出するAPI
	r.GET("/extract", func(c *gin.Context) {
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

		// script, style, nav, footer, headerタグを除去
		doc.Find("script, style, nav, footer, header, aside, form, noscript").Remove()

		// タイトルを取得
		title := strings.TrimSpace(doc.Find("title").Text())

		// 本文テキストを抽出（段落ごとに分割）
		var paragraphs []string
		doc.Find("p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, caption, figcaption").Each(func(i int, s *goquery.Selection) {
			text := strings.TrimSpace(s.Text())
			if len(text) > 0 {
				paragraphs = append(paragraphs, text)
			}
		})

		if len(paragraphs) == 0 {
			// フォールバック: bodyのテキスト全体を取得
			bodyText := strings.TrimSpace(doc.Find("body").Text())
			if bodyText != "" {
				paragraphs = []string{bodyText}
			}
		}

		c.JSON(200, gin.H{
			"title":      title,
			"paragraphs": paragraphs,
		})
	})

	// SPAのフォールバック: 未知のルートをindex.htmlにリダイレクト
	r.NoRoute(func(c *gin.Context) {
		c.File("./shadowing-app-frontend/dist/index.html")
	})

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
