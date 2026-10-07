import { afterEach, describe, expect, it } from 'vitest'
import { en, type Key } from './en'
import { he } from './he'
import { setLang, t } from './index'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

afterEach(() => setLang('en'))

describe('dictionaries', () => {
  it('Hebrew keeps every placeholder English uses and has no blank strings', () => {
    for (const key of Object.keys(en) as Key[]) {
      expect(he[key].trim(), key).not.toBe('')
      expect(placeholders(he[key]), key).toEqual(placeholders(en[key]))
    }
  })
})

describe('t', () => {
  it('interpolates and leaves unknown placeholders alone', () => {
    expect(t('time.ago', { d: '14m' })).toBe('14m ago')
    expect(t('status.lastNursing', { side: 'Left' })).toBe('Left · {ago}')
  })

  it('switches language and flips the document direction', () => {
    setLang('he')
    expect(t('time.ago', { d: '14m' })).toBe('לפני 14m')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('he')

    setLang('en')
    expect(document.documentElement.dir).toBe('ltr')
    expect(t('history.today')).toBe('Today')
  })
})
