export default function RaidMemberCard({ allocatedUserObj, jobObj, currentStatus, isVoiceActive, isPartyLeader = false, compact = false }) {
  const calOpacityClass = currentStatus === 'Confirmed' || currentStatus === 'Confirm' 
    ? 'opacity-100 text-emerald-400' 
    : currentStatus === 'Leave' || currentStatus === 'Absent' 
      ? 'opacity-100 text-rose-500' 
      : 'opacity-10 text-slate-400';
  
  const vcOpacityClass = isVoiceActive ? 'opacity-100 text-indigo-400' : 'opacity-10 text-slate-500';

  if (compact) {
    return (
      <div className="flex items-center justify-between w-full p-1 py-0.5 min-h-[36px]">
        <div className="flex items-center gap-2 min-w-0">
          <img 
            src={`/assets/icons/classes/${jobObj?.iconFile || 'default.svg'}`} 
            alt=""
            onError={(e) => { e.target.style.display = 'none'; }}
            className="w-3.5 h-3.5 object-contain shrink-0"
          />
          <div className="min-w-0">
            <div className="font-sans font-bold text-slate-100 text-[13px] leading-tight truncate max-w-[125px]" title={allocatedUserObj.displayName}>
              {allocatedUserObj.displayName}
            </div>
            <div className="text-[8px] font-sans font-extralight tracking-wider text-slate-400 uppercase truncate">
              {jobObj?.name || 'NO CLASS'}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 select-none pointer-events-none shrink-0 pr-1">
          <svg className={`w-3 h-3 fill-none stroke-current transition-all ${calOpacityClass}`} viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <svg className={`w-3 h-3 fill-none stroke-current transition-all ${vcOpacityClass}`} viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
            <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
            <line x1="12" y1="19" x2="12" y2="22"></line>
          </svg>
          {isPartyLeader && (
            <svg className="w-3 h-3 text-red-500 fill-red-500 stroke-red-600 transition-all" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" title="Party Leader">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
              <line x1="4" y1="22" x2="4" y2="15"></line>
            </svg>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 w-full">
      <div className="flex items-center gap-1.5 min-w-0">
        <img 
          src={`/assets/icons/classes/${jobObj?.iconFile || 'default.svg'}`} 
          alt=""
          onError={(e) => { e.target.style.display = 'none'; }}
          className="w-4 h-4 object-contain shrink-0"
        />
        <div className="font-sans font-bold text-slate-100 text-[16px] leading-tight truncate max-w-[100px]" title={allocatedUserObj.displayName}>
          {allocatedUserObj.displayName}
        </div>
      </div>
      
      <div className="text-[9px] font-sans font-extralight tracking-widest text-slate-400 uppercase truncate max-w-[110px]">
        {jobObj?.name || 'NO CLASS'}
      </div>

      <div className="flex items-center gap-1.5 pt-1 select-none pointer-events-none">
        <svg className={`w-3.5 h-3.5 fill-none stroke-current transition-all ${calOpacityClass}`} viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        <svg className={`w-3.5 h-3.5 fill-none stroke-current transition-all ${vcOpacityClass}`} viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
          <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
          <line x1="12" y1="19" x2="12" y2="22"></line>
        </svg>
        {isPartyLeader && (
          <svg className="w-3.5 h-3.5 text-red-500 fill-red-500 stroke-red-600 transition-all" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" title="Party Leader">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
        )}
      </div>
    </div>
  );
}