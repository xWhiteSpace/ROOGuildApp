// frontend/src/pages/PastAuctionTab.jsx
import { useState, useEffect } from 'react';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

export default function PastAuctionTab() {
  const [loading, setLoading] = useState(false);
  const [pastAuctionsData, setPastAuctionsData] = useState([]);
  const [activeGroupKey, setActiveGroupKey] = useState(null);

const [configItems, setConfigItems] = useState([]);

  const fetchPastAuctionsLog = async () => {
    try {
      setLoading(true);
      const savedUserSession = localStorage.getItem('dynasty_raid_session');
      const customHeaders = { 'Content-Type': 'application/json' };
      if (savedUserSession) {
        customHeaders['x-user-profile'] = encodeURIComponent(savedUserSession);
      }
      const res = await fetch(`${backendUrl}/api/requests/past-auctions`, { 
        method: 'GET', 
        headers: customHeaders, 
        credentials: 'include' 
      });
      const data = await res.json();
        if (data.success) {
          setPastAuctionsData(data.history || []);
          try {
            const configRes = await fetch(`${backendUrl}/api/requests/settings/get`, {
              headers: customHeaders,
              credentials: 'include'
            });
            const configData = await configRes.json();
            if (configData.success && configData.config?.items) {
              setConfigItems(configData.config.items);
            }
          } catch (err) {
            console.error("Failed to map live configuration styles:", err);
          }
        }
    } catch (err) {
      console.error("Failed to extract past auction records:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPastAuctionsLog();
  }, []);

    const getItemStyleProfile = (itemType, itemId) => {
    const THEME_MAP = {
      purple: 'text-violet-400 border-violet-500/30 bg-violet-950/20 shadow-[0_0_15px_rgba(139,92,246,0.1)]',
      yellow: 'text-yellow-400 border-yellow-500/30 bg-yellow-950/10 shadow-[0_0_15px_rgba(234,179,8,0.1)]',
      slate:  'text-slate-100 border-slate-700 bg-slate-900/40 shadow-[0_0_15px_rgba(255,255,255,0.05)]',
      red:    'text-red-500 border-red-950 bg-black/60 border-l-4 border-l-red-600'
    };

    const matchedItem = configItems.find(i => 
      (itemId && i.id.toLowerCase() === itemId.toLowerCase()) || 
      (itemType && i.name.toLowerCase() === itemType.toLowerCase())
    );

    if (matchedItem && matchedItem.colorTheme) {
      return THEME_MAP[matchedItem.colorTheme] || THEME_MAP.slate;
    }

    const legacyLabel = (itemType || '').toLowerCase();
    if (legacyLabel.includes('puppet')) return THEME_MAP.purple;
    if (legacyLabel.includes('illu')) return THEME_MAP.yellow;
    if (legacyLabel.includes('light')) return THEME_MAP.slate;
    if (legacyLabel.includes('time') || legacyLabel.includes('space')) return THEME_MAP.red;

    return 'text-slate-400 border-slate-800 bg-slate-900/50';
  };

  // Pre-calculate unique date-event headers to build the accordion tabs
  const uniqueEventGroups = Array.from(new Set(pastAuctionsData.map(row => `${row.date} - ${row.event}`)));

  return (
    <div className="space-y-6 text-slate-200 select-none font-sans">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        <h2 className="text-2xl font-black tracking-tight text-white uppercase">Past Auction Distribution Records</h2>
        <p className="mt-1 text-xs text-slate-400">Review Auction History per Events</p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-lg min-h-[300px]">
        {loading ? (
          <div className="text-center py-12 text-slate-500 animate-pulse font-mono text-xs">Extracting completed award parameters...</div>
        ) : uniqueEventGroups.length === 0 ? (
          <div className="text-slate-500 italic text-sm text-center py-12">No past auction distribution ledgers tracked within the database folder files.</div>
        ) : (
          <div className="space-y-2 max-w-3xl mx-auto">
            {uniqueEventGroups.map((groupKey) => {
              const isGroupExpanded = activeGroupKey === groupKey;
              const nestedGroupItems = pastAuctionsData.filter(row => `${row.date} - ${row.event}` === groupKey);

              return (
                <div key={groupKey} className="border border-slate-800 bg-slate-950/20 rounded-xl overflow-hidden shadow-md">
                  {/* ACCORDION BAR TRIPPERS */}
                  <div 
                    onClick={() => setActiveGroupKey(isGroupExpanded ? null : groupKey)}
                    className="p-3 px-4 bg-slate-900/40 hover:bg-slate-900/80 text-slate-200 font-mono font-bold flex items-center justify-between cursor-pointer transition text-xs"
                  >
                    <span className="tracking-wide">🏆 {groupKey}</span>
                    <span className="text-[10px] text-indigo-400 bg-indigo-950/40 px-2.5 py-0.5 border border-indigo-500/20 rounded-md font-sans font-black uppercase">
                      {isGroupExpanded ? "▲ Hide Winners" : `▼ View ${nestedGroupItems.length} Winners`}
                    </span>
                  </div>

                  {/* NESTED SUB-ITEMS CONTAINER */}
                  {isGroupExpanded && (
                    <div className="border-t border-slate-800/60 bg-[#121317] animate-fadeIn">
                      <table className="w-full text-left border-collapse font-sans text-xs">
                        <thead>
                          <tr className="bg-slate-950/40 text-slate-500 uppercase text-[9px] tracking-wider font-black border-b border-slate-800/40">
                            <th className="p-2.5 px-5">Member</th>
                            <th className="p-2.5">Item</th>
                            <th className="p-2.5 px-5 text-right">Qty Distributed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/30 text-slate-300 font-semibold">
                          {nestedGroupItems.map((itemRow) => (
                            <tr key={itemRow.id} className="hover:bg-slate-900/10 transition-colors">
                              <td className="p-2.5 px-5 text-slate-200 font-bold font-sans">{itemRow.mem}</td>
                              <td className="p-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] border font-sans ${getItemStyleProfile(itemRow.item, itemRow.itemId)}`}>
                                  {itemRow.item || itemRow.itemId}
                                </span>
                              </td>
                              <td className="p-2.5 px-5 text-right font-mono font-black text-emerald-400">{itemRow.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}