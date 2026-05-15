import { useNavigate } from 'react-router-dom'

function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="home-page">
      <div className="home-hero">
        <h1>シャドーイング練習</h1>
        <p className="home-subtitle">練習モードを選んでシャドーイングを始めよう</p>
      </div>

      <div className="mode-cards">
        <div className="mode-card" onClick={() => navigate('/youtube')}>
          <div className="mode-icon">▶</div>
          <h2 className="mode-title">YouTube動画</h2>
          <p className="mode-description">
            YouTubeの動画を検索して、聞きながら声に出して練習します。
            再生速度の変更や区間リピートが使えます。
          </p>
          <span className="mode-action">動画を検索する →</span>
        </div>

        <div className="mode-card" onClick={() => navigate('/text')}>
          <div className="mode-icon">📖</div>
          <h2 className="mode-title">Webページ読み上げ</h2>
          <p className="mode-description">
            WebページのURLを入力するか、テキストを直接貼り付けて読み上げます。
            一文ずつ再生・リピートできます。
          </p>
          <span className="mode-action">テキストで練習する →</span>
        </div>
      </div>
    </div>
  )
}

export default HomePage
