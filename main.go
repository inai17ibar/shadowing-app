package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"

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
