import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import YouTube from 'react-youtube'

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5]
const REWIND_SECONDS = 5

function PlayerPage() {
  const { videoId } = useParams()
  const navigate = useNavigate()
  const playerRef = useRef(null)
  const intervalRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loopStart, setLoopStart] = useState(null)
  const [loopEnd, setLoopEnd] = useState(null)
  const [loopActive, setLoopActive] = useState(false)

  const getPlayer = () => playerRef.current?.getInternalPlayer()

  const startTimeTracking = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(async () => {
      const player = getPlayer()
      if (!player) return
      const time = await player.getCurrentTime()
      setCurrentTime(time)

      if (loopActive && loopStart !== null && loopEnd !== null) {
        if (time >= loopEnd) {
          player.seekTo(loopStart, true)
        }
      }
    }, 250)
  }, [loopActive, loopStart, loopEnd])

  useEffect(() => {
    if (isPlaying) {
      startTimeTracking()
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, startTimeTracking])

  const onReady = async (event) => {
    const player = event.target
    const dur = await player.getDuration()
    setDuration(dur)
  }

  const onStateChange = (event) => {
    setIsPlaying(event.data === 1)
  }

  const togglePlay = async () => {
    const player = getPlayer()
    if (!player) return
    const state = await player.getPlayerState()
    if (state === 1) {
      player.pauseVideo()
    } else {
      player.playVideo()
    }
  }

  const handleRewind = async () => {
    const player = getPlayer()
    if (!player) return
    const time = await player.getCurrentTime()
    player.seekTo(Math.max(0, time - REWIND_SECONDS), true)
  }

  const handleForward = async () => {
    const player = getPlayer()
    if (!player) return
    const time = await player.getCurrentTime()
    player.seekTo(Math.min(duration, time + REWIND_SECONDS), true)
  }

  const handleSpeedChange = (rate) => {
    const player = getPlayer()
    if (!player) return
    player.setPlaybackRate(rate)
    setPlaybackRate(rate)
  }

  const handleSetLoopStart = async () => {
    const player = getPlayer()
    if (!player) return
    const time = await player.getCurrentTime()
    setLoopStart(time)
    if (loopEnd !== null && time < loopEnd) {
      setLoopActive(true)
    }
  }

  const handleSetLoopEnd = async () => {
    const player = getPlayer()
    if (!player) return
    const time = await player.getCurrentTime()
    setLoopEnd(time)
    if (loopStart !== null && time > loopStart) {
      setLoopActive(true)
    }
  }

  const handleClearLoop = () => {
    setLoopStart(null)
    setLoopEnd(null)
    setLoopActive(false)
  }

  const handleSeek = async (e) => {
    const player = getPlayer()
    if (!player) return
    const seekTime = parseFloat(e.target.value)
    player.seekTo(seekTime, true)
    setCurrentTime(seekTime)
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          handleRewind()
          break
        case 'ArrowRight':
          e.preventDefault()
          handleForward()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  const opts = {
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 0,
      controls: 0,
      modestbranding: 1,
      rel: 0,
    },
  }

  return (
    <div className="player-page">
      <button className="back-button" onClick={() => navigate('/')}>
        ← 検索に戻る
      </button>

      <div className="player-container">
        <YouTube
          ref={playerRef}
          videoId={videoId}
          opts={opts}
          onReady={onReady}
          onStateChange={onStateChange}
          className="youtube-player"
          iframeClassName="youtube-iframe"
        />
      </div>

      <div className="controls">
        <div className="progress-section">
          <span className="time-label">{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="progress-bar"
          />
          <span className="time-label">{formatTime(duration)}</span>
        </div>

        <div className="playback-controls">
          <button onClick={handleRewind} className="control-button" title="5秒戻る（←）">
            ⏪ 5秒
          </button>
          <button onClick={togglePlay} className="control-button play-button" title="再生/一時停止（Space）">
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button onClick={handleForward} className="control-button" title="5秒進む（→）">
            5秒 ⏩
          </button>
        </div>

        <div className="speed-controls">
          <span className="control-label">再生速度:</span>
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              onClick={() => handleSpeedChange(rate)}
              className={`speed-button ${playbackRate === rate ? 'active' : ''}`}
            >
              {rate}x
            </button>
          ))}
        </div>

        <div className="loop-controls">
          <span className="control-label">区間リピート:</span>
          <button onClick={handleSetLoopStart} className="control-button loop-btn">
            開始点 {loopStart !== null ? `(${formatTime(loopStart)})` : ''}
          </button>
          <button onClick={handleSetLoopEnd} className="control-button loop-btn">
            終了点 {loopEnd !== null ? `(${formatTime(loopEnd)})` : ''}
          </button>
          {loopActive && (
            <button onClick={handleClearLoop} className="control-button clear-loop">
              ループ解除
            </button>
          )}
          {loopActive && (
            <span className="loop-indicator">🔁 ループ中</span>
          )}
        </div>
      </div>

      <div className="shortcuts-info">
        <h3>キーボードショートカット</h3>
        <ul>
          <li><kbd>Space</kbd> 再生 / 一時停止</li>
          <li><kbd>←</kbd> 5秒戻る</li>
          <li><kbd>→</kbd> 5秒進む</li>
        </ul>
      </div>
    </div>
  )
}

export default PlayerPage
