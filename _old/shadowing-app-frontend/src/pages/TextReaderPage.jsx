import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const SPEECH_RATES = [0.5, 0.75, 1, 1.25, 1.5]

function TextReaderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Input state
  const [inputMode, setInputMode] = useState('url') // 'url', 'text', or 'saved'
  const [url, setUrl] = useState('')
  const [rawText, setRawText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Content state
  const [title, setTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sentences, setSentences] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [savedId, setSavedId] = useState(null)

  // Saved texts list
  const [savedTexts, setSavedTexts] = useState([])
  const [savedLoading, setSavedLoading] = useState(false)

  // Speech state
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speechRate, setSpeechRate] = useState(1)
  const [voices, setVoices] = useState([])
  const [selectedVoice, setSelectedVoice] = useState('')
  const [autoAdvance, setAutoAdvance] = useState(true)

  const sentenceRefs = useRef([])
  const utteranceRef = useRef(null)

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const available = speechSynthesis.getVoices()
      setVoices(available)
      if (available.length > 0 && !selectedVoice) {
        const enVoice = available.find(v => v.lang.startsWith('en'))
        setSelectedVoice(enVoice ? enVoice.name : available[0].name)
      }
    }
    loadVoices()
    speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [selectedVoice])

  // Load saved text if ?id= parameter is present
  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      loadSavedText(id)
    }
  }, [searchParams])

  const splitIntoSentences = (text) => {
    return text
      .split(/(?<=[.!?。！？])\s+|(?<=[.!?。！？])(?=[A-Z「『])|\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
  }

  // Fetch text from URL
  const handleFetchURL = async (e) => {
    e.preventDefault()
    if (!url.trim()) return

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/extract?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setTitle(data.title || '')
      setSourceUrl(url)
      setSavedId(null)
      const allText = (data.paragraphs || []).join('\n')
      const sents = splitIntoSentences(allText)
      setSentences(sents)
      setCurrentIndex(-1)
    } catch {
      setError('テキストの取得に失敗しました。バックエンドが起動しているか確認してください。')
    } finally {
      setLoading(false)
    }
  }

  // Load raw text
  const handleLoadText = (e) => {
    e.preventDefault()
    if (!rawText.trim()) return
    setTitle('')
    setSourceUrl('')
    setSavedId(null)
    const sents = splitIntoSentences(rawText)
    setSentences(sents)
    setCurrentIndex(-1)
    setError('')
  }

  // Save current text to server
  const handleSave = async () => {
    if (sentences.length === 0) return
    setError('')
    try {
      const res = await fetch('/api/texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || '無題のテキスト',
          source_url: sourceUrl,
          paragraphs: sentences,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setSavedId(data.id)
    } catch {
      setError('保存に失敗しました。')
    }
  }

  // Load saved texts list
  const loadSavedTexts = async () => {
    setSavedLoading(true)
    try {
      const res = await fetch('/api/texts')
      const data = await res.json()
      setSavedTexts(data.texts || [])
    } catch {
      setError('保存済みテキストの取得に失敗しました。')
    } finally {
      setSavedLoading(false)
    }
  }

  // Load a specific saved text
  const loadSavedText = async (id) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/texts/${id}`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setTitle(data.title || '')
      setSourceUrl(data.source_url || '')
      setSavedId(parseInt(id))
      setSentences(data.paragraphs || [])
      setCurrentIndex(-1)
    } catch {
      setError('テキストの読み込みに失敗しました。')
    } finally {
      setLoading(false)
    }
  }

  // Delete a saved text
  const handleDelete = async (id) => {
    try {
      await fetch(`/api/texts/${id}`, { method: 'DELETE' })
      setSavedTexts(prev => prev.filter(t => t.id !== id))
      if (savedId === id) {
        setSavedId(null)
      }
    } catch {
      setError('削除に失敗しました。')
    }
  }

  // Switch to saved texts tab
  const handleShowSaved = () => {
    setInputMode('saved')
    loadSavedTexts()
  }

  // Scroll to current sentence
  useEffect(() => {
    if (currentIndex >= 0 && sentenceRefs.current[currentIndex]) {
      sentenceRefs.current[currentIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [currentIndex])

  // Speak a single sentence
  const speakSentence = useCallback((index) => {
    if (index < 0 || index >= sentences.length) return

    speechSynthesis.cancel()
    setCurrentIndex(index)

    const utterance = new SpeechSynthesisUtterance(sentences[index])
    utterance.rate = speechRate
    const voice = voices.find(v => v.name === selectedVoice)
    if (voice) utterance.voice = voice

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => {
      setIsSpeaking(false)
      if (autoAdvance && index + 1 < sentences.length) {
        setTimeout(() => speakSentence(index + 1), 1500)
      }
    }

    utteranceRef.current = utterance
    speechSynthesis.speak(utterance)
  }, [sentences, speechRate, voices, selectedVoice, autoAdvance])

  const togglePlay = () => {
    if (isSpeaking) {
      speechSynthesis.cancel()
      setIsSpeaking(false)
    } else {
      const idx = currentIndex >= 0 ? currentIndex : 0
      speakSentence(idx)
    }
  }

  const handleRepeat = () => {
    if (currentIndex >= 0) {
      speakSentence(currentIndex)
    }
  }

  const handlePrev = () => {
    speechSynthesis.cancel()
    const idx = Math.max(0, currentIndex - 1)
    speakSentence(idx)
  }

  const handleNext = () => {
    speechSynthesis.cancel()
    const idx = Math.min(sentences.length - 1, currentIndex + 1)
    speakSentence(idx)
  }

  const handleSentenceClick = (index) => {
    speakSentence(index)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          handlePrev()
          break
        case 'ArrowRight':
          e.preventDefault()
          handleNext()
          break
        case 'KeyR':
          e.preventDefault()
          handleRepeat()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  // Cleanup on unmount
  useEffect(() => {
    return () => speechSynthesis.cancel()
  }, [])

  const groupedVoices = voices.reduce((acc, v) => {
    const lang = v.lang
    if (!acc[lang]) acc[lang] = []
    acc[lang].push(v)
    return acc
  }, {})

  const hasContent = sentences.length > 0

  const resetToInput = () => {
    speechSynthesis.cancel()
    setIsSpeaking(false)
    setSentences([])
    setCurrentIndex(-1)
    setTitle('')
    setSourceUrl('')
    setSavedId(null)
  }

  return (
    <div className="text-reader-page">
      <button className="back-button" onClick={() => navigate('/')}>
        ← ホームに戻る
      </button>

      {!hasContent && (
        <div className="text-input-section">
          <h2>Webページ読み上げシャドーイング</h2>
          <p className="text-input-subtitle">URLを入力するか、テキストを貼り付け、または保存済みテキストから選択</p>

          <div className="input-mode-tabs">
            <button
              className={`tab-button ${inputMode === 'url' ? 'active' : ''}`}
              onClick={() => setInputMode('url')}
            >
              URL入力
            </button>
            <button
              className={`tab-button ${inputMode === 'text' ? 'active' : ''}`}
              onClick={() => setInputMode('text')}
            >
              テキスト入力
            </button>
            <button
              className={`tab-button ${inputMode === 'saved' ? 'active' : ''}`}
              onClick={handleShowSaved}
            >
              保存済み
            </button>
          </div>

          {inputMode === 'url' && (
            <form onSubmit={handleFetchURL} className="search-form">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="search-input"
              />
              <button type="submit" disabled={loading} className="search-button">
                {loading ? '取得中...' : '取得'}
              </button>
            </form>
          )}

          {inputMode === 'text' && (
            <form onSubmit={handleLoadText} className="text-form">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="シャドーイングしたいテキストを貼り付けてください..."
                className="text-textarea"
                rows={8}
              />
              <button type="submit" className="search-button">
                読み込む
              </button>
            </form>
          )}

          {inputMode === 'saved' && (
            <div className="saved-texts-list">
              {savedLoading && <p className="saved-loading">読み込み中...</p>}
              {!savedLoading && savedTexts.length === 0 && (
                <p className="saved-empty">保存済みのテキストはまだありません</p>
              )}
              {savedTexts.map((item) => (
                <div key={item.id} className="saved-text-card">
                  <div
                    className="saved-text-info"
                    onClick={() => loadSavedText(item.id)}
                  >
                    <h3 className="saved-text-title">{item.title || '無題'}</h3>
                    {item.source_url && (
                      <p className="saved-text-url">{item.source_url}</p>
                    )}
                    <p className="saved-text-date">
                      {new Date(item.created_at + 'Z').toLocaleString('ja-JP')}
                    </p>
                  </div>
                  <button
                    className="delete-button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(item.id)
                    }}
                    title="削除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="error-message">{error}</p>}
        </div>
      )}

      {hasContent && (
        <>
          <div className="reader-header">
            <div className="reader-header-left">
              {title && <h2 className="reader-title">{title}</h2>}
              {savedId && <span className="saved-badge">保存済み</span>}
            </div>
            <div className="reader-header-actions">
              {!savedId && (
                <button className="control-button save-button" onClick={handleSave}>
                  保存する
                </button>
              )}
              <button className="control-button" onClick={resetToInput}>
                別のテキストを読む
              </button>
            </div>
          </div>

          <div className="controls">
            <div className="playback-controls">
              <button onClick={handlePrev} className="control-button" title="前の文（←）">
                ⏮ 前
              </button>
              <button onClick={togglePlay} className="control-button play-button" title="再生/停止（Space）">
                {isSpeaking ? '⏸' : '▶'}
              </button>
              <button onClick={handleNext} className="control-button" title="次の文（→）">
                次 ⏭
              </button>
              <button onClick={handleRepeat} className="control-button" title="リピート（R）">
                🔁 リピート
              </button>
            </div>

            <div className="speed-controls">
              <span className="control-label">読み上げ速度:</span>
              {SPEECH_RATES.map((rate) => (
                <button
                  key={rate}
                  onClick={() => setSpeechRate(rate)}
                  className={`speed-button ${speechRate === rate ? 'active' : ''}`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            <div className="voice-controls">
              <span className="control-label">音声:</span>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="voice-select"
              >
                {Object.entries(groupedVoices).map(([lang, langVoices]) => (
                  <optgroup key={lang} label={lang}>
                    {langVoices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="auto-advance-control">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={autoAdvance}
                  onChange={(e) => setAutoAdvance(e.target.checked)}
                />
                自動的に次の文へ進む
              </label>
            </div>
          </div>

          <div className="sentence-progress">
            {currentIndex >= 0 ? currentIndex + 1 : 0} / {sentences.length} 文
          </div>

          <div className="sentences-container">
            {sentences.map((sentence, index) => (
              <div
                key={index}
                ref={(el) => (sentenceRefs.current[index] = el)}
                className={`sentence-item ${
                  index === currentIndex ? 'active' : ''
                } ${index < currentIndex ? 'done' : ''}`}
                onClick={() => handleSentenceClick(index)}
              >
                <span className="sentence-number">{index + 1}</span>
                <span className="sentence-text">{sentence}</span>
              </div>
            ))}
          </div>

          <div className="shortcuts-info">
            <h3>キーボードショートカット</h3>
            <ul>
              <li><kbd>Space</kbd> 再生 / 停止</li>
              <li><kbd>←</kbd> 前の文</li>
              <li><kbd>→</kbd> 次の文</li>
              <li><kbd>R</kbd> リピート</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

export default TextReaderPage
