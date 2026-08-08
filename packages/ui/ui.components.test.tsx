import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './Button.tsx'
import { Skeleton } from './Skeleton.tsx'

describe('Button component', () => {
  it('renders native button with children', () => {
    const html = renderToStaticMarkup(createElement(Button, { type: 'button', children: 'Save' }))
    assert.match(html, /<button/)
    assert.match(html, /Save/)
    assert.match(html, /type="button"/)
  })

  it('honours disabled', () => {
    const html = renderToStaticMarkup(createElement(Button, { disabled: true, children: 'Nope' }))
    assert.match(html, /disabled/)
  })
})

describe('Skeleton component', () => {
  it('is hidden from assistive tech', () => {
    const html = renderToStaticMarkup(createElement(Skeleton, { className: 'h-4' }))
    assert.match(html, /aria-hidden/)
  })
})
