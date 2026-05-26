// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  getAllowedUser,
  isEmailAllowed,
  parseAllowedEmails,
} from '../allowlist'

describe('auth email allowlist', () => {
  it('parses comma-separated emails into normalized lowercase entries', () => {
    const allowed = parseAllowedEmails(' Me@Gmail.com, other@gmail.com ,, USER@Example.COM ')

    expect([...allowed]).toEqual(['me@gmail.com', 'other@gmail.com', 'user@example.com'])
  })

  it('treats empty or missing allowlist input as no allowed users', () => {
    expect([...parseAllowedEmails(undefined)]).toEqual([])
    expect([...parseAllowedEmails('   ')]).toEqual([])
  })

  it('allows matching emails regardless of surrounding whitespace or case', () => {
    const allowed = parseAllowedEmails('me@gmail.com')

    expect(isEmailAllowed(' ME@GMAIL.COM ', allowed)).toBe(true)
  })

  it('rejects missing and unlisted emails', () => {
    const allowed = parseAllowedEmails('me@gmail.com')

    expect(isEmailAllowed(undefined, allowed)).toBe(false)
    expect(isEmailAllowed('', allowed)).toBe(false)
    expect(isEmailAllowed('other@gmail.com', allowed)).toBe(false)
  })

  it('returns an authorized user result only for allowlisted session emails', () => {
    const allowed = parseAllowedEmails('me@gmail.com')

    expect(getAllowedUser({ email: 'ME@GMAIL.COM' }, allowed)).toEqual({
      ok: true,
      email: 'me@gmail.com',
    })
    expect(getAllowedUser(null, allowed)).toEqual({
      ok: false,
      status: 401,
      code: 'unauthorized',
    })
    expect(getAllowedUser({ email: 'other@gmail.com' }, allowed)).toEqual({
      ok: false,
      status: 403,
      code: 'forbidden',
    })
  })
})
