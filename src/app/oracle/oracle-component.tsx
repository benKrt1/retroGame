'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './oracle.module.css';

interface OracleComponentProps {
  onBack?: () => void;
}

type ChatRole = 'user' | 'assistant';
interface ChatMessage {
  role: ChatRole;
  content: string;
}

const GREETING =
  '>> ARCADE ORACLE ONLINE. Ask me for strategies, hints or trivia on PAC-MAN, SPACE INVADERS, TETRIS or SNAKE. *BEEP*';

const SUGGESTIONS = [
  'How do I beat the ghosts in Pac-Man?',
  'Tips for a high score in Tetris?',
  'Best strategy for Space Invaders?',
];

export const OracleComponent: React.FC<OracleComponentProps> = ({ onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the terminal to the latest line.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/oracle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'The Oracle is unavailable.');
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The Oracle is unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className={styles.arcadeCabinet}>
      <div className={styles.arcadeHeader}>
        <h2 className={styles.title}>ARCADE ORACLE</h2>
        <p className={styles.subtitle}>AI GAME MASTER // POWERED BY CLAUDE</p>
      </div>

      <div className={styles.screenWrapper}>
        <div className={styles.terminal} ref={logRef}>
          <div className={`${styles.line} ${styles.oracleLine}`}>{GREETING}</div>

          {messages.map((m, i) => (
            <div
              key={i}
              className={`${styles.line} ${m.role === 'user' ? styles.userLine : styles.oracleLine}`}
            >
              <span className={styles.prefix}>{m.role === 'user' ? 'YOU>' : 'ORACLE>'}</span>{' '}
              {m.content}
            </div>
          ))}

          {loading && (
            <div className={`${styles.line} ${styles.oracleLine}`}>
              <span className={styles.prefix}>ORACLE&gt;</span> <span className={styles.blink}>_</span>
            </div>
          )}

          {error && <div className={`${styles.line} ${styles.errorLine}`}>! {error}</div>}
        </div>
      </div>

      {messages.length === 0 && !loading && (
        <div className={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className={styles.suggestion} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <span className={styles.promptArrow}>&gt;</span>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ASK THE ORACLE..."
          maxLength={500}
          disabled={loading}
          autoFocus
        />
        <button type="submit" className={`${styles.btn} pixel-btn pixel-btn-yellow`} disabled={loading}>
          SEND
        </button>
      </form>

      <div className={styles.btnGroup}>
        {onBack && (
          <button className={`${styles.btn} pixel-btn`} onClick={onBack}>
            MENU
          </button>
        )}
      </div>
    </div>
  );
};

export default OracleComponent;
