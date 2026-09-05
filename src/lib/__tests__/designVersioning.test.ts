import { describe, it, expect } from 'vitest'
import { nextVersionNumber, versionLineage, projectKeyFor } from '@/lib/designVersioning'
import type { DesignState, DesignVersion } from '@/types'

const DUMMY_DESIGN = { ways: 2, bands: [] } as unknown as DesignState

function v(version: number, parentVersion: number | null): DesignVersion {
  return {
    id: `id-${version}`,
    projectKey: 'p',
    version,
    parentVersion,
    note: '',
    design: DUMMY_DESIGN,
    createdAt: version,
  }
}

describe('nextVersionNumber', () => {
  it('starts at 1 for an empty history', () => {
    expect(nextVersionNumber([])).toBe(1)
  })

  it('is max existing + 1, even with gaps', () => {
    expect(nextVersionNumber([{ version: 1 }, { version: 3 }])).toBe(4)
  })
})

describe('versionLineage', () => {
  it('walks the parent chain newest-first', () => {
    const versions = [v(1, null), v(2, 1), v(3, 2)]
    const chain = versionLineage(versions, 3)
    expect(chain.map((c) => c.version)).toEqual([3, 2, 1])
  })

  it('stops at a missing parent', () => {
    const versions = [v(3, 2)]
    const chain = versionLineage(versions, 3)
    expect(chain.map((c) => c.version)).toEqual([3])
  })

  it('guards against cycles', () => {
    const versions = [v(2, 3), v(3, 2)]
    const chain = versionLineage(versions, 3)
    expect(chain.map((c) => c.version)).toEqual([3, 2])
  })

  it('supports branches — lineage follows the explicit parent', () => {
    // v3 branches from v1, not v2
    const versions = [v(1, null), v(2, 1), v(3, 1)]
    const chain = versionLineage(versions, 3)
    expect(chain.map((c) => c.version)).toEqual([3, 1])
  })
})

describe('projectKeyFor', () => {
  it('prefers the saved project id', () => {
    expect(projectKeyFor('proj-1', 'Mit design')).toBe('proj-1')
  })

  it('falls back to the project name', () => {
    expect(projectKeyFor(null, 'Mit design')).toBe('Mit design')
  })

  it('uses a stable key for unnamed designs', () => {
    expect(projectKeyFor(null, '   ')).toBe('unavngivet')
  })
})
