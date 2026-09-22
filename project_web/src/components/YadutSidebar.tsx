import styles from '../app/page.module.css'

export type ScreenName = 'home' | 'chat' | 'todos' | 'memory'

import { type Conversation, groupConversations } from '../utils/conversations'

type YadutSidebarProps = {
  busy: boolean
  open: boolean
  activeScreen: ScreenName
  historyOpen: boolean
  onClose: () => void
  onHistoryToggle: () => void
  onNavigate: (screen: ScreenName) => void
  onNewChat: () => void
  onSelectConversation: (conversation: Conversation) => void
  conversations: Conversation[]
  loading: boolean
  error: string | null
  onRetry: () => void
}

export default function YadutSidebar({
  open,
  activeScreen,
  historyOpen,
  onClose,
  onHistoryToggle,
  onNavigate,
  onNewChat,
  onSelectConversation,
  conversations, loading, error, onRetry, busy,
}: YadutSidebarProps) {
  return (
    <>
      <button
        aria-label="메뉴 닫기"
        className={`${styles.scrim} ${open ? styles.scrimOpen : ''}`}
        onClick={onClose}
        type="button"
      />
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`} aria-label="야두트 메뉴">
        <div className={styles.sidebarHeader}>
          <span className={styles.brand}>Yadut</span>
          <button aria-label="메뉴 닫기" className={styles.closeButton} onClick={onClose} type="button">×</button>
        </div>

        <button className={styles.newChatButton} disabled={busy} onClick={onNewChat} type="button">
          <span>＋</span><span>새 대화</span>
        </button>

        <nav className={styles.navigation} aria-label="주요 기능">
          <div className={styles.chatNavigationBlock}>
            <div className={`${styles.chatNavigationRow} ${activeScreen === 'chat' ? styles.navigationRowActive : ''}`}>
              <button aria-label="대화" className={styles.navigationButton} onClick={() => onNavigate('chat')} type="button">
                <span className={styles.navigationIcon}>◌</span><span>대화</span>
              </button>
              <button
                aria-expanded={historyOpen}
                aria-label={historyOpen ? '이전 대화 접기' : '이전 대화 펼치기'}
                className={styles.historyToggle}
                onClick={onHistoryToggle}
                type="button"
              >
                이전 대화 <span className={historyOpen ? styles.chevronOpen : ''}>⌄</span>
              </button>
            </div>

            {historyOpen && (
              <div className={styles.historyList}>
                {loading && <p role="status">대화 기록을 불러오는 중입니다.</p>}
                {error && <p role="alert">{error} <button onClick={onRetry} type="button">다시 시도</button></p>}
                {!loading && !error && conversations.length === 0 && <p>저장된 대화가 없습니다.</p>}
                {groupConversations(conversations).map((group) => (
                  <div key={group.label}>
                    <p className={styles.historyGroup}>{group.label}</p>
                    {group.conversations.map((conversation) => (
                      <button
                        className={styles.historyButton}
                        disabled={busy}
                        key={conversation.id}
                        onClick={() => onSelectConversation(conversation)}
                        type="button"
                      >
                        {conversation.title}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button aria-label="투두리스트" className={`${styles.navigationButton} ${activeScreen === 'todos' ? styles.navigationButtonActive : ''}`} onClick={() => onNavigate('todos')} type="button">
            <span className={styles.navigationIcon}>✓</span><span>투두리스트</span>
          </button>
          <button aria-label="기억 설정" className={`${styles.navigationButton} ${activeScreen === 'memory' ? styles.navigationButtonActive : ''}`} onClick={() => onNavigate('memory')} type="button">
            <span className={styles.navigationIcon}>⌘</span><span>기억 설정</span>
          </button>
        </nav>
      </aside>
    </>
  )
}
