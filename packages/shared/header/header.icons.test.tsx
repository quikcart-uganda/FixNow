import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { HamburgerIcon } from './HamburgerIcon.tsx'
import { HeaderGlyph } from './HeaderGlyph.tsx'
import { HeaderMenuButton } from './HeaderMenuButton.tsx'

describe('header-critical icons', () => {
  it('renders the hamburger as dependency-free SVG paths', () => {
    const html = renderToStaticMarkup(createElement(HamburgerIcon))
    assert.match(html, /<svg/)
    assert.match(html, /M4 6h16/)
    assert.match(html, /M4 12h16/)
    assert.match(html, /M4 18h16/)
    assert.doesNotMatch(html, /material-symbols/)
  })

  it('renders the notification bell without an icon font', () => {
    const html = renderToStaticMarkup(createElement(HeaderGlyph, { name: 'notifications' }))
    assert.match(html, /<svg/)
    assert.match(html, /M18 8a6 6/)
    assert.doesNotMatch(html, /material-symbols/)
  })

  it('renders an accessible 44px menu trigger with the SVG fallback', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        {},
        createElement(HeaderMenuButton, {
          items: [{ id: 'home', label: 'Home', icon: 'home', to: '/technician/dashboard' }],
        }),
      ),
    )
    assert.match(html, /aria-label="Open menu"/)
    assert.match(html, /aria-haspopup="dialog"/)
    assert.match(html, /min-h-11/)
    assert.match(html, /min-w-11/)
    assert.match(html, /data-testid="header-menu-button"/)
    assert.match(html, /M4 12h16/)
  })
})
