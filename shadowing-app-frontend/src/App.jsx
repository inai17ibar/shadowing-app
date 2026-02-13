import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import PlayerPage from './pages/PlayerPage.jsx'
import TextReaderPage from './pages/TextReaderPage.jsx'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="app-title">Shadowing Practice</a>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/youtube" element={<SearchPage />} />
          <Route path="/play/:videoId" element={<PlayerPage />} />
          <Route path="/text" element={<TextReaderPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
