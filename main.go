package main

import (
	"net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"google.golang.org/api/googleapi/transport"
	"google.golang.org/api/youtube/v3"
)

func main() {
	// リリースモードにセット
	gin.SetMode(gin.ReleaseMode)

	r := gin.Default()

	// CORS設定
	r.Use(cors.Default())

	r.GET("/search", func(c *gin.Context) {
		query := c.Query("q")
		results, err := searchYoutube(query)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, results)
	})

	r.Run(":8080")
}

func searchYoutube(query string) ([]string, error) {
	apiKey := os.Getenv("YOUTUBE_DATA_API_KEY")

	client := &http.Client{
		Transport: &transport.APIKey{Key: apiKey},
	}

	service, err := youtube.New(client)
	if err != nil {
		return nil, err
	}

	call := service.Search.List([]string{"id", "snippet"}).Q(query).MaxResults(10)
	response, err := call.Do()
	if err != nil {
		return nil, err
	}

	var videoIDs []string
	for _, item := range response.Items {
		if item.Id.Kind == "youtube#video" {
			videoIDs = append(videoIDs, item.Id.VideoId)
		}
	}
	return videoIDs, nil
}
