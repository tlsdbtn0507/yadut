// @vitest-environment node

import { describe, expect, it } from 'vitest'

import NativeLoginBridge from '../NativeLoginBridge'
import NativeLoginPage from '../page'

describe('/native-login page', () => {
  it('renders the native login client bridge without consuming search params on the server', () => {
    const element = NativeLoginPage()

    expect(element.type).toBe(NativeLoginBridge)
  })
})
