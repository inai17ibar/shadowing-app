import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setResults(data.results || [])
      }
    } catch {
      setError('検索に失敗しました。バックエンドが起動しているか確認してください。')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (videoId) => {
    navigate(`/play/${videoId}`)
  }

  return (
    <div className="search-page">
      <div className="search-hero">
        <h1>シャドーイング練習</h1>
        <p className="search-subtitle">YouTubeの動画を使ってシャドーイングを練習しよう</p>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="動画を検索（例：英語 リスニング、TED Talk）"
            className="search-input"
          />
          <button type="submit" disabled={loading} className="search-button">
            {loading ? '検索中...' : '検索'}
          </button>
        </form>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="search-results">
        {results.map((video) => (
          <div
            key={video.id}
            className="video-card"
            onClick={() => handleSelect(video.id)}
          >
            <img src={video.thumbnail} alt={video.title} className="video-thumbnail" />
            <div className="video-info">
              <h3 className="video-title">{video.title}</h3>
              <span className="video-action">練習する →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SearchPage
