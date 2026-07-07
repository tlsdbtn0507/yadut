import { signIn } from '@/auth'

type NativeLoginPageProps = {
  searchParams?: Promise<{
    code?: string
  }>
}

export default async function NativeLoginPage({
  searchParams,
}: NativeLoginPageProps) {
  const params = await searchParams
  const code = params?.code?.trim()

  if (!code) {
    return (
      <main>
        <h1>로그인 코드 없음</h1>
        <p>iOS 앱에서 다시 Google 로그인을 시도해 주세요.</p>
      </main>
    )
  }

  await signIn('native-google', {
    code,
    redirectTo: '/',
  })

  return (
    <main>
      <h1>ARCUS 세션 연결 중</h1>
      <p>로그인이 완료되면 ARCUS 콘솔로 이동합니다.</p>
    </main>
  )
}
