import { useEffect, useState } from 'react';
import { ref, query, limitToLast, onValue } from 'firebase/database';
import { database } from '../services/firebaseClient';
import { sendChatMessage } from '../services/chatService';

export default function ChatConsole({ user, draft = '', setDraft, discordMembers = [] }) {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const messagesRef = query(ref(database, 'chat/messages'), limitToLast(15));
    return onValue(messagesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const loaded = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
      setMessages(loaded);
    });
  }, []);

  const handleSend = async () => {
    const trimmed = draft?.trim() || '';
    if (!trimmed) {
      return;
    }

    let processedText = trimmed;
    const sortedMembers = [...discordMembers].sort((a, b) => {
      const nameA = a.nickname || a.displayName || a.username || '';
      const nameB = b.nickname || b.displayName || b.username || '';
      return nameB.length - nameA.length;
    });

    sortedMembers.forEach((member) => {
      const fullNick = member.nickname || member.displayName || member.username || '';
      const cleanSplitNick = fullNick.split('|')[0].trim();

      if (fullNick) {
        processedText = processedText.split(`@${fullNick}`).join(`<@${member.id}>`);
      }
      if (cleanSplitNick) {
        processedText = processedText.split(`@${cleanSplitNick}`).join(`<@${member.id}>`);
      }
    });

    try {
      setError(null);
      await sendChatMessage(processedText);
      if (setDraft) setDraft('');
    } catch (sendError) {
      setError(sendError.message);
    }
  };

  const formatMessageContent = (content) => {
    if (!content) return '';
    let formattedText = content;
    const mentionRegex = /<@!?(\d+)>/g;

    formattedText = formattedText.replace(mentionRegex, (match, userId) => {
      const matchedMember = discordMembers.find((m) => m.id === userId);
      if (matchedMember) {
        const displayName = matchedMember.nickname || matchedMember.displayName || matchedMember.username;
        return `@${displayName}`;
      }
      return match;
    });

    return formattedText;
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg flex flex-col h-full overflow-hidden justify-between">
      
      {/* Section Tag */}
      <div className="mb-1.5 shrink-0">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Live Auction Feed</h3>
      </div>

      {/* High-density Terminal Console Stream Viewport */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl bg-slate-950/80 p-2 font-mono space-y-1.5 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="text-slate-500 text-[15px] p-1">Waiting for Discord chat messages...</div>
        ) : (
          messages.map((message) => (
            <div 
              key={message.id || Math.random()} 
              // 🌟 FIXED ROW HEIGHTS: Removed hardcoded h-4 and leading-none so wrapped lines sit comfortably
              className="flex items-baseline justify-between gap-4 border-b border-slate-900/5 py-1 text-[15px] hover:bg-slate-900/20 px-1.5 rounded transition-colors min-h-0"
            >
              {/* 🌟 NATURAL WRAPPER: Removed 'truncate' so wrapped text renders safely instead of overlapping or vanishing */}
              <div className="flex items-baseline gap-1.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
                <span className="font-bold text-indigo-400 shrink-0 select-none">
                  {message.author}:
                </span>
                <span className="text-slate-200 break-all whitespace-pre-wrap leading-normal">
                  {formatMessageContent(message.content)}
                </span>
              </div>
              
              <span className="text-[9px] text-slate-600 shrink-0 font-sans select-none pl-1 align-self-end">
                {message.timestamp 
                  ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                  : ''
                }
              </span>
            </div>
          ))
        )}
      </div>

      {/* Compose Form */}
      <div className="mt-2 shrink-0">
        <div className="flex items-center gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft && setDraft(event.target.value)}
            rows={1}
            placeholder={user ? 'Send message to Discord...' : 'Sign in to send messages'}
            disabled={!user}
            className="flex-1 resize-none rounded-xl border border-slate-800 bg-slate-950/90 py-2 px-3 text-xs text-slate-100 outline-none focus:border-indigo-500 h-9 leading-normal font-sans"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!user || !draft?.trim()}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 h-9 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 shrink-0 shadow-md font-sans"
          >
            Send
          </button>
        </div>
        {error && <div className="text-[10px] text-rose-400 mt-1 pl-1 font-sans">{error}</div>}
      </div>

    </div>
  );
}