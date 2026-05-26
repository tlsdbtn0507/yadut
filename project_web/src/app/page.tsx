import ArcusConsole from '@/components/ArcusConsole'
import { getSessionGateState } from '@/auth/sessionGate'
import { parseAllowedEmails } from '@/auth/allowlist'
import { auth, signIn, signOut } from '@/auth'

import styles from './page.module.css'

type HomeProps = {
  searchParams?: Promise<{
    auth?: string
  }>
}

export default async function Home({ searchParams }: HomeProps) {
  const session = await auth()
  const gate = getSessionGateState(
    session?.user ?? null,
    parseAllowedEmails(process.env.AUTH_ALLOWED_EMAILS),
  )
  const params = await searchParams

  if (gate.status === 'authorized') {
    return <ArcusConsole />
  }

  if (gate.status === 'forbidden' || params?.auth === 'forbidden') {
    return (
      <AuthGate
        title="접근 권한 없음"
        message={
          gate.status === 'forbidden'
            ? `${gate.email} 계정은 야두트 allowlist에 포함되어 있지 않습니다.`
            : '이 Google 계정은 야두트 allowlist에 포함되어 있지 않습니다.'
        }
        actionLabel="다른 Google 계정으로 로그인"
        action={gate.status === 'forbidden' ? signOutAction : signInAction}
      />
    )
  }

  return (
    <AuthGate
      title="ARCUS 로그인"
      message="허용된 Google 계정으로 로그인하면 야두트 콘솔을 사용할 수 있습니다."
      actionLabel="Google로 계속"
      action={signInAction}
    />
  )
}

function AuthGate({
  title,
  message,
  actionLabel,
  action,
}: {
  title: string
  message: string
  actionLabel: string
  action: () => Promise<void>
}) {
  return (
    <main className={styles.authGate}>
      <section className={styles.authPanel}>
        <div className={styles.authLogoRow}>
          <div className={`${styles.pulseDot} ${styles.pulseActive}`} />
          <span className={styles.logoText}>야두트 (Yadut) // ARCUS CORE</span>
        </div>
        <h1 className={styles.authTitle}>{title}</h1>
        <p className={styles.authMessage}>{message}</p>
        <form action={action}>
          <button className={styles.authButton} type="submit">
            {actionLabel}
          </button>
        </form>
      </section>
    </main>
  )
}

async function signInAction() {
  'use server'

  await signIn('google')
}

async function signOutAction() {
  'use server'

  await signOut({
    redirectTo: '/',
  })
}
