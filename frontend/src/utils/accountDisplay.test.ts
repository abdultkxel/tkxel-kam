import { describe, expect, it } from 'vitest'
import { formatAccountDisplayId } from '@/utils/accountDisplay'

describe('formatAccountDisplayId', () => {
  it('uses the numeric account number before any fallback label', () => {
    expect(formatAccountDisplayId({ accountNumber: 100001, displayId: undefined, recordType: 'account' })).toBe('Account #100001')
  })

  it('labels draft accounts without showing UUIDs', () => {
    expect(formatAccountDisplayId({ accountNumber: null, displayId: undefined, recordType: 'onboarding_draft' })).toBe('Draft account')
  })

  it('does not expose a fallback UUID when no numeric display ID exists', () => {
    expect(formatAccountDisplayId({ accountNumber: null, displayId: undefined, recordType: 'account' })).toBeNull()
  })
})
