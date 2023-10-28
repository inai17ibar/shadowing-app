package main

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// リリースモードにセット
	gin.SetMode(gin.ReleaseMode)

	r := gin.Default()

	// CORS設定
	r.Use(cors.Default())

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

		body, err := ioutil.ReadAll(resp.Body)
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

		// 必要な情報を抽出してフロントエンドに渡す
		// 必要な情報を抽出してフロントエンドに渡す
		videos := []map[string]string{}
		for _, item := range youtubeResponse.Items {
			video := map[string]string{
				"id":        item.Id.VideoId,
				"title":     item.Snippet.Title,
				"thumbnail": item.Snippet.Thumbnails.Default.URL,
			}
			//log.Print(item.Id.VideoId)
			videos = append(videos, video)
		}

		c.JSON(200, gin.H{"results": videos})
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
