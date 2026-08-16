def format_schedule_sync_message(schedules: list[dict[str, str]]) -> str:
    lines = [
        f"✅ {schedule['start_time'][:10]} {schedule['summary']}"
        for schedule in schedules
        if schedule.get("start_time") and schedule.get("summary")
    ]
    return "마스터, 스케줄 등록이 완료되었습니다.\n\n" + "\n".join(lines)
