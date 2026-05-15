import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TextReaderPage from './TextReaderPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Mock Web Speech API
const mockSpeak = vi.fn()
const mockCancel = vi.fn()
const mockGetVoices = vi.fn().mockReturnValue([
  { name: 'English Voice', lang: 'en-US' },
  { name: 'Japanese Voice', lang: 'ja-JP' },
])

beforeEach(() => {
  mockNavigate.mockClear()
  mockSpeak.mockClear()
  mockCancel.mockClear()
  vi.restoreAllMocks()

  global.speechSynthesis = {
    speak: mockSpeak,
    cancel: mockCancel,
    getVoices: mockGetVoices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  global.SpeechSynthesisUtterance = vi.fn().mockImplementation((text) => ({
    text,
    rate: 1,
    voice: null,
    onstart: null,
    onend: null,
  }))
})

function renderTextReaderPage() {
  return render(
    <MemoryRouter>
      <TextReaderPage />
    </MemoryRouter>
  )
}

describe('TextReaderPage', () => {
  it('renders the initial input view', () => {
    renderTextReaderPage()
    expect(screen.getByText('Webページ読み上げシャドーイング')).toBeInTheDocument()
    expect(screen.getByText('URL入力')).toBeInTheDocument()
    expect(screen.getByText('テキスト入力')).toBeInTheDocument()
  })

  it('shows URL input by default', () => {
    renderTextReaderPage()
    expect(screen.getByPlaceholderText(/https:\/\/example.com/)).toBeInTheDocument()
    expect(screen.getByText('取得')).toBeInTheDocument()
  })

  it('switches to text input mode', async () => {
    const user = userEvent.setup()
    renderTextReaderPage()

    await user.click(screen.getByText('テキスト入力'))
    expect(screen.getByPlaceholderText(/テキストを貼り付け/)).toBeInTheDocument()
    expect(screen.getByText('読み込む')).toBeInTheDocument()
  })

  it('loads text and shows sentences', async () => {
    const user = userEvent.setup()
    renderTextReaderPage()

    await user.click(screen.getByText('テキスト入力'))
    const textarea = screen.getByPlaceholderText(/テキストを貼り付け/)
    await user.type(textarea, 'Hello world. This is a test. Another sentence.')
    await user.click(screen.getByText('読み込む'))

    await waitFor(() => {
      expect(screen.getByText('Hello world.')).toBeInTheDocument()
      expect(screen.getByText('This is a test.')).toBeInTheDocument()
      expect(screen.getByText('Another sentence.')).toBeInTheDocument()
    })

    // Controls should be visible
    expect(screen.getByTitle(/再生\/停止/)).toBeInTheDocument()
    expect(screen.getByText('読み上げ速度:')).toBeInTheDocument()
  })

  it('shows sentence count after loading text', async () => {
    const user = userEvent.setup()
    renderTextReaderPage()

    await user.click(screen.getByText('テキスト入力'))
    const textarea = screen.getByPlaceholderText(/テキストを貼り付け/)
    await user.type(textarea, 'First sentence. Second sentence.')
    await user.click(screen.getByText('読み込む'))

    await waitFor(() => {
      expect(screen.getByText(/0 \/ 2 文/)).toBeInTheDocument()
    })
  })

  it('shows speed buttons with 1x active by default', async () => {
    const user = userEvent.setup()
    renderTextReaderPage()

    await user.click(screen.getByText('テキスト入力'))
    const textarea = screen.getByPlaceholderText(/テキストを貼り付け/)
    await user.type(textarea, 'Test sentence.')
    await user.click(screen.getByText('読み込む'))

    await waitFor(() => {
      const activeButton = screen.getByText('1x')
      expect(activeButton).toHaveClass('active')
    })
  })

  it('fetches text from URL', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        title: 'Test Article',
        paragraphs: ['First paragraph.', 'Second paragraph.'],
      }),
    })

    renderTextReaderPage()
    const input = screen.getByPlaceholderText(/https:\/\/example.com/)
    await user.type(input, 'https://example.com/article')
    await user.click(screen.getByText('取得'))

    await waitFor(() => {
      expect(screen.getByText('Test Article')).toBeInTheDocument()
      expect(screen.getByText('First paragraph.')).toBeInTheDocument()
      expect(screen.getByText('Second paragraph.')).toBeInTheDocument()
    })
  })

  it('shows error when URL fetch fails', async () => {
    const user = userEvent.setup()
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    renderTextReaderPage()
    const input = screen.getByPlaceholderText(/https:\/\/example.com/)
    await user.type(input, 'https://example.com/article')
    await user.click(screen.getByText('取得'))

    await waitFor(() => {
      expect(screen.getByText(/テキストの取得に失敗しました/)).toBeInTheDocument()
    })
  })

  it('shows back button that navigates home', async () => {
    const user = userEvent.setup()
    renderTextReaderPage()

    await user.click(screen.getByText('← ホームに戻る'))
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('can reset and load new text', async () => {
    const user = userEvent.setup()
    renderTextReaderPage()

    await user.click(screen.getByText('テキスト入力'))
    const textarea = screen.getByPlaceholderText(/テキストを貼り付け/)
    await user.type(textarea, 'Test sentence.')
    await user.click(screen.getByText('読み込む'))

    await waitFor(() => {
      expect(screen.getByText('Test sentence.')).toBeInTheDocument()
    })

    await user.click(screen.getByText('別のテキストを読む'))

    await waitFor(() => {
      expect(screen.getByText('Webページ読み上げシャドーイング')).toBeInTheDocument()
    })
  })

  it('shows keyboard shortcuts info after loading text', async () => {
    const user = userEvent.setup()
    renderTextReaderPage()

    await user.click(screen.getByText('テキスト入力'))
    const textarea = screen.getByPlaceholderText(/テキストを貼り付け/)
    await user.type(textarea, 'Test sentence.')
    await user.click(screen.getByText('読み込む'))

    await waitFor(() => {
      expect(screen.getByText('キーボードショートカット')).toBeInTheDocument()
    })
  })

  it('does not load empty text', async () => {
    const user = userEvent.setup()
    renderTextReaderPage()

    await user.click(screen.getByText('テキスト入力'))
    await user.click(screen.getByText('読み込む'))

    // Should still be on input view
    expect(screen.getByText('Webページ読み上げシャドーイング')).toBeInTheDocument()
  })
})
