'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'

type BridgeStatus = 'connecting' | 'missing-code' | 'failed'

export default function NativeLoginBridge() {
  const [status, setStatus] = useState<BridgeStatus>('connecting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) {
      return
    }

    hasStarted.current = true

    async function connectNativeSession() {
      const code = new URLSearchParams(window.location.search)
        .get('code')
        ?.trim()

      if (!code) {
        setStatus('missing-code')
        return
      }

      const response = await signIn('native-google', {
        code,
        redirect: false,
        redirectTo: '/',
      })

      if (!response?.ok) {
        setStatus('failed')
        setErrorMessage(response?.error ?? 'native_sign_in_failed')
        return
      }

      window.location.replace(response.url ?? '/')
    }

    connectNativeSession().catch((error: unknown) => {
      setStatus('failed')
      setErrorMessage(
        error instanceof Error ? error.message : 'native_sign_in_failed',
      )
    })
  }, [])

  if (status === 'missing-code') {
    return (
      <NativeLoginShell
        title="로그인 코드 없음"
        message="iOS 앱에서 다시 Google 로그인을 시도해 주세요."
      />
    )
  }

  if (status === 'failed') {
    return (
      <NativeLoginShell
        title="ARCUS 세션 연결 실패"
        message={errorMessage ?? 'iOS 앱에서 다시 Google 로그인을 시도해 주세요.'}
      />
    )
  }

  return (
    <NativeLoginShell
      title="ARCUS 세션 연결 중"
      message="로그인이 완료되면 ARCUS 콘솔로 이동합니다."
    />
  )
}

function NativeLoginShell({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <main
      style={{
        alignItems: 'center',
        background:
          'radial-gradient(circle at 20% 15%, #0b1d22 0, #05070b 45%, #12051e 100%)',
        color: '#f5f7fb',
        display: 'flex',
        minHeight: '100dvh',
        padding: '24px',
      }}
    >
      <section>
        <h1
          style={{
            fontSize: 'clamp(2.25rem, 9vw, 4rem)',
            lineHeight: 1.05,
            margin: '0 0 24px',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            color: 'rgba(245, 247, 251, 0.82)',
            fontSize: 'clamp(1rem, 4vw, 1.35rem)',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {message}
        </p>
      </section>
    </main>
  )
}
