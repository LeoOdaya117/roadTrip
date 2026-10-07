import { useState } from 'react';
import { useRideStore } from '../store/rideStore';

const TOPICS = [
  { id: 'fuel', label: 'Fuel Stop' },
  { id: 'help', label: 'Help' },
  { id: 'eta', label: 'ETA' }
];

export default function TopicChat() {
  const currentUser = useRideStore((s) => s.currentUser);
  const currentTopic = useRideStore((s) => s.currentTopic);
  const setCurrentTopic = useRideStore((s) => s.setCurrentTopic);
  const addMessage = useRideStore((s) => s.addMessage);
  const setRiderTopic = useRideStore((s) => s.setRiderTopic);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const toggleTopic = (topicId: string) => {
    const next = currentTopic === topicId ? null : topicId;
    setCurrentTopic(next);
  };

  const send = () => {
    if (!currentUser || !currentTopic || !text.trim()) return;
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      topic: currentTopic,
      text: text.trim(),
      senderId: currentUser.id,
      timestamp: new Date().toISOString()
    };
    addMessage(msg);
    // mark current user's active topic so their marker shows
    setRiderTopic(currentUser.id, currentTopic, true);
    setText('');
    setOpen(false);
  };

  return (
    <div style={{ position: 'absolute', right: 12, bottom: 88, zIndex: 1200 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {TOPICS.map((t) => (
          <button
            key={t.id}
            onClick={() => { toggleTopic(t.id); setOpen(true); }}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              background: currentTopic === t.id ? 'var(--rt-primary)' : 'var(--rt-surface)',
              color: currentTopic === t.id ? '#fffdf5' : 'var(--rt-text)',
              border: '1px solid var(--rt-line)',
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {open && (
        <div style={{ width: 300, background: 'var(--rt-paper)', padding: 12, borderRadius: 16, border: '1px solid var(--rt-line)', boxShadow: 'var(--rt-shadow)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <strong style={{ color: 'var(--rt-text)', flex: 1 }}>{currentTopic ? TOPICS.find(t=>t.id===currentTopic)?.label : 'New message'}</strong>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--rt-muted)' }}>Close</button>
          </div>
          <textarea value={text} onChange={(e)=>setText(e.target.value)} rows={3} style={{ width: '100%', borderRadius: 10, padding: 9, border: '1px solid var(--rt-line)', background: 'var(--rt-surface)', color: 'var(--rt-text)' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={send} style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--rt-primary)', color: '#fffdf5', border: 'none' }}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
