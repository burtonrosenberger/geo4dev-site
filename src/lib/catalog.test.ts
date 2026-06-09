import { describe, it, expect } from 'vitest'
import { search, catalog } from './catalog'
import type { Dataset, Filters } from './types'

const EMPTY: Filters = { q: '', categories: [], contentTypes: [] }

// Mirror of catalog.ts's internal haystack, used only to assert the AND-search
// invariant on returned items. This is intentionally derived from the same
// fields the implementation searches so tests assert observable behavior
// (which items match which terms) without hardcoding dataset contents.
function searchableText(d: Dataset): string {
  return [d.title, d.description, d.author, d.publishing_org, d.country, d.category, d.subcategory, ...d.tags]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function firstWithCategory(): Dataset {
  const d = catalog.find((x) => !!x.category)
  if (!d) throw new Error('fixture: catalog has no entry with a category')
  return d
}

function firstWithContentType(): Dataset {
  const d = catalog.find((x) => !!x.content_type)
  if (!d) throw new Error('fixture: catalog has no entry with a content_type')
  return d
}

describe('search', () => {
  it('returns the whole catalog for empty filters', () => {
    const results = search(EMPTY)
    expect(results.length).toBe(catalog.length)
    expect(results).toEqual(catalog)
  })

  it('treats a multi-term query as AND across terms', () => {
    // Sample two distinct terms from an existing entry's searchable text so the
    // query is guaranteed to match at least that entry.
    const sample = catalog.find((d) => searchableText(d).split(/\s+/).filter(Boolean).length >= 2)
    if (!sample) throw new Error('fixture: no entry with two searchable terms')
    const words = Array.from(new Set(searchableText(sample).split(/\s+/).filter((w) => w.length >= 3)))
    expect(words.length).toBeGreaterThanOrEqual(2)
    const terms = [words[0], words[1]]

    const results = search({ ...EMPTY, q: terms.join(' ') })

    expect(results.length).toBeGreaterThanOrEqual(1)
    for (const item of results) {
      const text = searchableText(item)
      for (const term of terms) {
        expect(text.includes(term)).toBe(true)
      }
    }
  })

  it('restricts results to the selected category', () => {
    const category = firstWithCategory().category as string
    const results = search({ ...EMPTY, categories: [category] })

    const expectedCount = catalog.filter((d) => d.category === category).length
    expect(results.length).toBe(expectedCount)
    for (const item of results) {
      expect(item.category).toBe(category)
    }
  })

  it('restricts results to the selected content_type', () => {
    const contentType = firstWithContentType().content_type as string
    const results = search({ ...EMPTY, contentTypes: [contentType] })

    const expectedCount = catalog.filter((d) => d.content_type === contentType).length
    expect(results.length).toBe(expectedCount)
    for (const item of results) {
      expect(item.content_type).toBe(contentType)
    }
  })

  it('narrows further when combining a category with a query (subset relationship)', () => {
    const seed = firstWithCategory()
    const category = seed.category as string
    const words = Array.from(new Set(searchableText(seed).split(/\s+/).filter((w) => w.length >= 3)))
    if (words.length === 0) throw new Error('fixture: seed entry has no searchable term')
    const term = words[0]

    const categoryOnly = search({ ...EMPTY, categories: [category] })
    const combined = search({ ...EMPTY, categories: [category], q: term })

    const categoryIds = new Set(categoryOnly.map((d) => d.id))
    expect(combined.length).toBeGreaterThanOrEqual(1)
    expect(combined.length).toBeLessThanOrEqual(categoryOnly.length)
    for (const item of combined) {
      expect(categoryIds.has(item.id)).toBe(true)
      expect(searchableText(item).includes(term)).toBe(true)
    }
  })

  it('returns an empty array for a query term that cannot exist', () => {
    const results = search({ ...EMPTY, q: 'zzqxnonexistenttokenq9f7w3k2v' })
    expect(results).toEqual([])
  })
})
