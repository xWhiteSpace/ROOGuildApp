import { useEffect, useState } from 'react';
import { ref, query, limitToLast, onValue } from 'firebase/database';
import { database } from '../services/firebaseClient';
import { sendChatMessage } from '../services/chatService';

export default function ChatConsole({ user }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const messagesRef = query(ref(database, 'chat/messages'), limitToLast(100));
    return onValue(messagesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const loaded = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
      setMessages(loaded);
    });
  }, []);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    try {
      setError(null);
      await sendChatMessage(trimmed);
      setDraft('');
    } catch (sendError) {
      setError(sendError.message);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-lg">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">Live Chat</h3>
          <p className="text-sm text-slate-400">Messages from the Discord auction channel.</p>
        </div>
      </div>

      <div className="mb-4 max-h-[420px] space-y-3 overflow-y-auto rounded-3xl bg-slate-950/80 p-4">
        {messages.length === 0 ? (
          <div className="text-slate-500">Waiting for Discord chat messages...</div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">{message.author}</div>
                <div className="text-xs text-slate-500">{new Date(message.timestamp).toLocaleTimeString()}</div>
              </div>
              <p className="mt-2 text-slate-200 whitespace-pre-wrap">{message.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder={user ? 'Send a message to Discord...' : 'Sign in to send messages'}
          disabled={!user}
          className="w-full resize-none rounded-3xl border border-slate-800 bg-slate-950/90 p-4 text-slate-100 outline-none focus:border-indigo-500"
        />
        {error && <div className="text-sm text-rose-400">{error}</div>}
        <button
          type="button"
          onClick={handleSend}
          disabled={!user || !draft.trim()}
          className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          Send
        </button>
      </div>
    </div>
  );
}
