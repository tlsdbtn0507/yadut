export function formatScheduleMessage(schedules: unknown): string | null {
  if (!Array.isArray(schedules)) return null

  const lines = schedules.flatMap((schedule) => {
    if (
      !schedule ||
      typeof schedule !== 'object' ||
      typeof schedule.start_time !== 'string' ||
      typeof schedule.summary !== 'string'
    ) {
      return []
    }

    return `✅ ${schedule.start_time.slice(0, 10)} ${schedule.summary}`
  })

  return lines.length ? `마스터, 스케줄 등록이 완료되었습니다.\n\n${lines.join('\n')}` : null
}
