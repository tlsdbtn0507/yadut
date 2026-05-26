// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { getAuthFailure } from '../routeProtection'

describe('auth route protection response mapping', () => {
  it('returns no failure for an allowed user', () => {
    expect(getAuthFailure({ ok: true, email: 'me@gmail.com' })).toBeNull()
  })

  it('maps missing sessions to unauthorized responses', () => {
    expect(
      getAuthFailure({
        ok: false,
        status: 401,
        code: 'unauthorized',
      }),
    ).toEqual({
      status: 401,
      body: {
        success: false,
        error: 'Unauthorized',
      },
    })
  })

  it('maps unallowlisted users to forbidden responses', () => {
    expect(
      getAuthFailure({
        ok: false,
        status: 403,
        code: 'forbidden',
      }),
    ).toEqual({
      status: 403,
      body: {
        success: false,
        error: 'Forbidden',
      },
    })
  })
})
