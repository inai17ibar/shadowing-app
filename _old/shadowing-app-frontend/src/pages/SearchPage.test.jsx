import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SearchPage from './SearchPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderSearchPage() {
  return render(
    <MemoryRouter>
      <SearchPage />
    </MemoryRouter>
  )
}

describe('SearchPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.restoreAllMocks()
  })

  it('renders search form', () => {
    renderSearchPage()
    expect(screen.getByText('YouTube動画でシャドーイング')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/動画を検索/)).toBeInTheDocument()
    expect(screen.getByText('検索')).toBeInTheDocument()
  })

  it('shows search results and navigates on click', async () => {
    const user = userEvent.setup()
    const mockResults = {
      results: [
        { id: 'vid1', title: 'Test Video 1', thumbnail: 'https://example.com/1.jpg' },
        { id: 'vid2', title: 'Test Video 2', thumbnail: 'https://example.com/2.jpg' },
      ],
    }

    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(mockResults),
    })

    renderSearchPage()

    const input = screen.getByPlaceholderText(/動画を検索/)
    await user.type(input, 'english listening')
    await user.click(screen.getByText('検索'))

    await waitFor(() => {
      expect(screen.getByText('Test Video 1')).toBeInTheDocument()
      expect(screen.getByText('Test Video 2')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Test Video 1'))
    expect(mockNavigate).toHaveBeenCalledWith('/play/vid1')
  })

  it('shows error message on API error', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'API error occurred' }),
    })

    renderSearchPage()

    const input = screen.getByPlaceholderText(/動画を検索/)
    await user.type(input, 'test')
    await user.click(screen.getByText('検索'))

    await waitFor(() => {
      expect(screen.getByText('API error occurred')).toBeInTheDocument()
    })
  })

  it('shows error message on network failure', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    renderSearchPage()

    const input = screen.getByPlaceholderText(/動画を検索/)
    await user.type(input, 'test')
    await user.click(screen.getByText('検索'))

    await waitFor(() => {
      expect(screen.getByText(/バックエンドが起動しているか確認/)).toBeInTheDocument()
    })
  })

  it('does not search with empty query', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn()

    renderSearchPage()
    await user.click(screen.getByText('検索'))

    expect(global.fetch).not.toHaveBeenCalled()
  })
})
