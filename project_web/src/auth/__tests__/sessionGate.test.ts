// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { parseAllowedEmails } from '../allowlist'
import { getSessionGateState } from '../sessionGate'

describe('session gate state', () => {
  it('requires sign-in when there is no session user email', () => {
    const allowed = parseAllowedEmails('me@gmail.com')

    expect(getSessionGateState(null, allowed)).toEqual({
      status: 'unauthenticated',
    })
  })

  it('rejects a signed-in user outside the allowlist', () => {
    const allowed = parseAllowedEmails('me@gmail.com')

    expect(getSessionGateState({ email: 'other@gmail.com' }, allowed)).toEqual({
      status: 'forbidden',
      email: 'other@gmail.com',
    })
  })

  it('authorizes an allowlisted user with a normalized email', () => {
    const allowed = parseAllowedEmails('me@gmail.com')

    expect(getSessionGateState({ email: ' ME@GMAIL.COM ' }, allowed)).toEqual({
      status: 'authorized',
      email: 'me@gmail.com',
    })
  })
})
