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
              background: currentTopic === t.id ? 'linear-gradient(90deg,#FF6B35,#FF8255)' : 'rgba(0,0,0,0.6)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {open && (
        <div style={{ width: 300, background: 'rgba(8,10,18,0.9)', padding: 12, borderRadius: 12, boxShadow: '0 8px 30px rgba(2,6,23,0.5)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <strong style={{ color: '#fff', flex: 1 }}>{currentTopic ? TOPICS.find(t=>t.id===currentTopic)?.label : 'New message'}</strong>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94A3B8' }}>Close</button>
          </div>
          <textarea value={text} onChange={(e)=>setText(e.target.value)} rows={3} style={{ width: '100%', borderRadius: 8, padding: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', color: '#fff' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={send} style={{ padding: '8px 12px', borderRadius: 8, background: '#FF6B35', color: '#fff', border: 'none' }}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}
