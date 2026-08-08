import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FormError } from './FormError.tsx'
import { SkipLink } from './SkipLink.tsx'

describe('FormError component', () => {
  it('renders assertive alert', () => {
    const html = renderToStaticMarkup(createElement(FormError, { id: 'e1', children: 'Boom' }))
    assert.match(html, /role="alert"/)
    assert.match(html, /Boom/)
    assert.match(html, /id="e1"/)
  })

  it('renders nothing for empty message', () => {
    const html = renderToStaticMarkup(createElement(FormError, { children: '' }))
    assert.equal(html, '')
  })
})

describe('SkipLink component', () => {
  it('points at main landmark by default', () => {
    const html = renderToStaticMarkup(createElement(SkipLink))
    assert.match(html, /href="#fixnow-main"/)
    assert.match(html, /Skip to main content/)
    assert.match(html, /fixnow-skip-link/)
  })
})
