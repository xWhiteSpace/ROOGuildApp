import { useState, useEffect } from 'react';
import { apiFetch } from '../../../services/apiClient';

const IconSearch = () => <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconChevron = ({ expanded }) => (
  <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-90 text-slate-300' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

export default function PastAuctionTab() {
  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingNight, setLoadingNight] = useState(false);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [pastAuctionsData, setPastAuctionsData] = useState([]);
  const [activeGroupKey, setActiveGroupKey] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [configItems, setConfigItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingDates(true);
        const res = await apiFetch('/api/requests/past-auctions', { method: 'GET' });
        const data = await res.json();
        if (!cancelled && data.success) setAvailableDates(data.dates || []);
      } catch (err) {
        console.error('Failed to load past auction dates:', err);
      } finally {
        if (!cancelled) setLoadingDates(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadNight = async (date) => {
    if (!date) {
      setSelectedDate('');
      setPastAuctionsData([]);
      setActiveGroupKey(null);
      return;
    }
    try {
      setLoadingNight(true);
      setSelectedDate(date);
      setActiveGroupKey(null);
      const res = await apiFetch(`/api/requests/past-auctions?date=${encodeURIComponent(date)}`, { method: 'GET' });
      const data = await res.json();
      if (data.success) {
        setPastAuctionsData(data.history || []);
        if (configItems.length === 0) {
          try {
            const configRes = await apiFetch('/api/requests/settings/get?fields=items', { method: 'GET' });
            const configData = await configRes.json();
            if (configData.success && configData.config?.items) {
              setConfigItems(configData.config.items);
            }
          } catch (err) {
            console.error('Failed to map live configuration styles:', err);
          }
        }
      }
    } catch (err) {
      console.error('Failed to extract past auction records:', err);
    } finally {
      setLoadingNight(false);
    }
  };

  const handleDownloadPastAuctionsCSV = () => {
    if (filteredAuctions.length === 0) return;

    const csvHeaders = ["Date", "Event Category", "Member Name", "Item Distributed", "Item ID", "Quantity Ordered"];
    const csvRows = filteredAuctions.map(row => [
      `"${row.date || ''}"`,
      `"${row.event || ''}"`,
      `"${row.mem || ''}"`,
      `"${row.item || ''}"`,
      `"${row.itemId || ''}"`,
      row.quantity || 0
    ]);

    const csvContent = [csvHeaders.join(","), ...csvRows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    const stamp = selectedDate.replaceAll('/', '-');
    link.setAttribute("download", `PastAuctions_${stamp || new Date().toISOString().slice(0, 10)}.csv`);

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

    if (matchedItem?.colorTheme?.startsWith('#')) {
      return {
        className: 'px-2.5 py-0.5 rounded border text-[10px] font-sans font-semibold',
        style: {
          color: matchedItem.colorTheme,
          borderColor: `${matchedItem.colorTheme}40`,
          backgroundColor: `${matchedItem.colorTheme}15`,
          boxShadow: `0 0 15px ${matchedItem.colorTheme}20`
        }
      };
    }

    let baseClass = THEME_MAP.slate;
    if (matchedItem && matchedItem.colorTheme) {
      baseClass = THEME_MAP[matchedItem.colorTheme] || THEME_MAP.slate;
    } else {
      const legacyLabel = (itemType || '').toLowerCase();
      if (legacyLabel.includes('puppet')) baseClass = THEME_MAP.purple;
      else if (legacyLabel.includes('illu')) baseClass = THEME_MAP.yellow;
      else if (legacyLabel.includes('light')) baseClass = THEME_MAP.slate;
      else if (legacyLabel.includes('time') || legacyLabel.includes('space')) baseClass = THEME_MAP.red;
      else baseClass = 'text-slate-400 border-slate-800 bg-slate-900/50';
    }

    return {
      className: `px-2.5 py-0.5 rounded border text-[10px] font-sans font-semibold ${baseClass}`,
      style: {}
    };
  };

  const filteredAuctions = pastAuctionsData.filter(row => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (row.mem || '').toLowerCase().includes(query) ||
      (row.item || '').toLowerCase().includes(query) ||
      (row.itemId || '').toLowerCase().includes(query) ||
      (row.event || '').toLowerCase().includes(query)
    );
  });

  const uniqueEventGroups = Array.from(new Set(filteredAuctions.map(row => `${row.date} - ${row.event}`)));

  return (
    <div className="space-y-4 text-slate-200 select-none font-sans max-w-6xl mx-auto p-4 sm:p-1">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-wider text-slate-200 uppercase">Past Auction Distributions</h1>
          <p className="text-[11px] font-mono text-slate-500 mt-1">SELECT A DATE TO LOAD THAT NIGHT</p>
        </div>
        <button
          type="button"
          onClick={handleDownloadPastAuctionsCSV}
          disabled={filteredAuctions.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-[10px] uppercase font-bold tracking-wider rounded-xl text-slate-400 hover:text-white transition cursor-pointer shadow-sm disabled:opacity-20 select-none shrink-0"
        >
          Export Ledger (CSV)
        </button>
      </div>

      <div className="bg-slate-900/40 border border-slate-800/60 p-4 rounded-2xl shadow-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider select-none">Date</label>
            <select
              value={selectedDate}
              onChange={(e) => loadNight(e.target.value)}
              disabled={loadingDates || availableDates.length === 0}
              className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl px-3 text-xs text-slate-200 outline-none focus:border-slate-700 transition shadow-inner font-sans"
            >
              <option value="">{loadingDates ? 'Loading dates…' : 'Select a date'}</option>
              {availableDates.map((row) => (
                <option key={row.date} value={row.date}>
                  {row.date} · {row.count} award{row.count === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1.5 select-none">
              <IconSearch /> Filter
            </label>
            <input
              type="text"
              placeholder="Search by player name, item name, or event name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={!selectedDate}
              className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl px-3 text-xs text-slate-200 placeholder-slate-650 outline-none focus:border-slate-700 transition shadow-inner font-sans disabled:opacity-40"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-6 shadow-md min-h-[300px]">
        {loadingNight ? (
          <div className="text-center py-12 text-slate-500 animate-pulse font-mono text-xs">Loading that night's awards...</div>
        ) : !selectedDate ? (
          <div className="text-slate-500 italic text-sm text-center py-12">Select a date to load that night's awards.</div>
        ) : uniqueEventGroups.length === 0 ? (
          <div className="text-slate-500 italic text-sm text-center py-12">No awards on this date.</div>
        ) : (
          <div className="space-y-2 max-w-3xl mx-auto">
            {uniqueEventGroups.map((groupKey) => {
              const isGroupExpanded = activeGroupKey === groupKey;
              const nestedGroupItems = filteredAuctions.filter(row => `${row.date} - ${row.event}` === groupKey);
              const [groupDate, groupEventName] = groupKey.split(" - ");

              return (
                <div key={groupKey} className="border border-slate-800/80 bg-slate-950/10 rounded-xl overflow-hidden shadow-sm">
                  <div
                    onClick={() => setActiveGroupKey(isGroupExpanded ? null : groupKey)}
                    className="p-3 px-4 bg-slate-950/40 hover:bg-slate-900/80 text-slate-300 font-sans flex items-center justify-between cursor-pointer transition-all duration-150 text-xs select-none"
                  >
                    <div className="flex items-center gap-2 truncate min-w-0 flex-1 pr-4">
                      <span className="text-slate-500 font-mono font-medium w-24 shrink-0">{groupDate}</span>
                      <span className="text-slate-200 font-semibold truncate uppercase tracking-wider text-[11px]">{groupEventName}</span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] text-slate-500 font-mono tracking-wide font-medium uppercase">
                        {nestedGroupItems.length} Members
                      </span>
                      <IconChevron expanded={isGroupExpanded} />
                    </div>
                  </div>

                  {isGroupExpanded && (
                    <div className="border-t border-slate-800/60 bg-[#121317] animate-fadeIn">
                      <table className="w-full text-left border-collapse table-fixed font-sans text-xs">
                        <thead>
                          <tr className="bg-slate-950/40 text-slate-500 uppercase text-[9px] tracking-wider font-bold border-b border-slate-800/40 select-none">
                            <th className="p-2.5 px-5 w-[35%]">Member Name</th>
                            <th className="p-2.5 w-[45%]">Item Distributed</th>
                            <th className="p-2.5 px-5 text-right w-[20%]">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/20 text-slate-400 font-normal">
                          {nestedGroupItems.map((itemRow) => (
                            <tr key={itemRow.id} className="group hover:bg-slate-900/20 transition-colors">
                              <td className="p-2.5 px-5 text-slate-400 group-hover:text-white transition-colors font-sans truncate">{itemRow.mem}</td>
                              <td className="p-2.5 truncate">
                                {(() => {
                                  const profile = getItemStyleProfile(itemRow.item, itemRow.itemId);
                                  return (
                                    <span className={profile.className} style={profile.style}>
                                      {itemRow.item || itemRow.itemId}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="p-2.5 px-5 text-right font-mono text-emerald-500/80 group-hover:text-emerald-400 font-medium transition-colors">{itemRow.quantity}</td>
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
