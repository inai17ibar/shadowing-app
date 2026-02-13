import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import HomePage from './HomePage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders the title and subtitle', () => {
    renderHomePage()
    expect(screen.getByText('シャドーイング練習')).toBeInTheDocument()
    expect(screen.getByText('練習モードを選んでシャドーイングを始めよう')).toBeInTheDocument()
  })

  it('renders two mode cards', () => {
    renderHomePage()
    expect(screen.getByText('YouTube動画')).toBeInTheDocument()
    expect(screen.getByText('Webページ読み上げ')).toBeInTheDocument()
  })

  it('navigates to /youtube when YouTube card is clicked', async () => {
    const user = userEvent.setup()
    renderHomePage()
    await user.click(screen.getByText('動画を検索する →'))
    expect(mockNavigate).toHaveBeenCalledWith('/youtube')
  })

  it('navigates to /text when text reader card is clicked', async () => {
    const user = userEvent.setup()
    renderHomePage()
    await user.click(screen.getByText('テキストで練習する →'))
    expect(mockNavigate).toHaveBeenCalledWith('/text')
  })
})
