import { Routes, Route } from 'react-router-dom'
import SearchPage from './pages/SearchPage.jsx'
import PlayerPage from './pages/PlayerPage.jsx'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="app-title">Shadowing Practice</a>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/play/:videoId" element={<PlayerPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
