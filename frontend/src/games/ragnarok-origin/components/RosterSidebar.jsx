import { Search, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import RaidMemberCard from './RaidMemberCard';

export default function RosterSidebar({ 
  standbyList, 
  uncommittedList, 
  leaveList, 
  searchQuery, 
  setSearchQuery, 
  isOfficer, 
  liveVoiceUids = [],
  jobsCatalog,
  setRightPanelCollapsed
}) {
  const [openAccordion, setOpenAccordion] = useState({ standby: true, uncommitted: true, leave: false });

  const renderSection = (title, list, isOpen, toggleKey, accentClass, dotColor) => (
    <div className="border border-slate-900 bg-slate-950/30 rounded-xl overflow-hidden">
      <div 
        onClick={() => setOpenAccordion(prev => ({ ...prev, [toggleKey]: !prev[toggleKey] }))}
        className="p-2 px-3 bg-slate-900/40 flex items-center justify-between cursor-pointer select-none text-xs font-bold font-sans"
      >
        <span className={`${accentClass} flex items-center gap-1.5`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          {title} ({list.length})
        </span>
        <span className="text-slate-600 font-mono text-[10px]">{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && (
        <div className="p-1 space-y-1 max-h-60 overflow-y-auto pr-0.5 scrollbar-thin border-t border-slate-900">
          {list.length === 0 ? (
            <div className="text-center py-3 text-[10px] text-slate-600 font-mono italic">No players mapped.</div>
          ) : (
            list.map(player => (
              <div 
                key={player.uid}
                draggable={isOfficer}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", player.uid); }}
                className="p-1 px-1.5 rounded-lg border font-mono shadow-inner flex items-center justify-between transition-all bg-slate-950/50 border-slate-900 hover:border-slate-800 cursor-grab active:cursor-grabbing relative"
              >
                <RaidMemberCard 
                  allocatedUserObj={player}
                  jobObj={jobsCatalog[player.jobCode]}
                  currentStatus={player.attendanceStatus}
                  isVoiceActive={liveVoiceUids.includes(player.uid)}
                  compact={true}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col space-y-2.5 h-full">
      <div className="space-y-1.5 select-none shrink-0 border-b border-slate-900 pb-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block">Roster Registries</span>
          <button
            type="button"
            onClick={() => setRightPanelCollapsed(true)}
            className="p-0.5 rounded text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            title="Collapse Panel"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div className="relative w-full mt-0.5">
          <input 
            type="text" 
            placeholder="Search Active Roster..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1 text-[11px] text-slate-200 font-medium placeholder-slate-650 outline-none focus:border-slate-700 font-sans transition-all shadow-inner" 
          />
          <div className="absolute left-2.5 top-2 text-slate-500"><Search size={13} /></div>
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-200 font-sans text-xs cursor-pointer">✖</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-0.5 space-y-2 scrollbar-thin">
        {renderSection("Standby Pool", standbyList, openAccordion.standby, "standby", "text-emerald-400", "bg-emerald-500 shadow-sm shadow-emerald-500/50")}
        {renderSection("Uncommitted Pool", uncommittedList, openAccordion.uncommitted, "uncommitted", "text-slate-200", "bg-slate-600 shadow-sm")}
        {renderSection("Absent / On Leave", leaveList, openAccordion.leave, "leave", "text-rose-400", "bg-rose-500 shadow-sm shadow-rose-500/50")}
      </div>
    </div>
  );
}