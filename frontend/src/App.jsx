// frontend/src/App.jsx
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import RequestTab from './pages/RequestTab';
import MimicBookTab from './pages/MimicBookTab';
import RequestHistoryTab from './pages/RequestHistoryTab';
import PastAuctionTab from './pages/PastAuctionTab';
import SubmitEvidenceTab from './pages/SubmitEvidenceTab';
import LoginPage from './pages/LoginPage';
import SettingsTab from './pages/SettingsTab'; // ◄ 1. ENSURE THIS IMPORT IS UNCOMMENTED
import { fetchCurrentUser, logoutUser } from './services/authService';
import MasterListTab from './pages/MasterListTab';

import RaidPartyTab from './pages/RaidPartyTab';
import StatisticsTab from './pages/StatisticsTab';

import Scheduler from './pages/Scheduler';

const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

import { createContext, useRef } from 'react';
export const MimicBookContext = createContext(null);

export function MimicBookProvider({ children }) {
  const [isAdminMode, setIsAdminMode] = useState(true); 
  const [activeStep, setActiveStep] = useState(1); 
  const [loadingPool, setLoadingPool] = useState(false);
  const [isLootHistoryOpen, setIsLootHistoryOpen] = useState(false);
  const [loadingLootHistory, setLoadingLootHistory] = useState(false);
  const [lootHistoryData, setLootHistoryData] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({}); 
  const [commitEvent, setCommitEvent] = useState('GuildLeague');
  const [availableEvents, setAvailableEvents] = useState({});
  const [commitDate, setCommitDate] = useState(() => {
    const gmt8String = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
    const gmt8Date = new Date(gmt8String);
    return `${gmt8Date.getFullYear()}-${String(gmt8Date.getMonth() + 1).padStart(2, '0')}-${String(gmt8Date.getDate()).padStart(2, '0')}`;
  });
  const [committing, setCommittingSetting] = useState(false);
  const [syncingRoster, setSyncingRoster] = useState(false);
  const [items, setItems] = useState([]); 
  const [rankingsByItem, setRankingsByItem] = useState({});
  const [requestsByItemDetails, setRequestsByItemDetails] = useState({});
  const [masterGuildRoster, setMasterGuildRoster] = useState([]); 
  const [qtyPerPage, setQtyPerPage] = useState(4);
  const [lootRows, setLootRows] = useState([]);
  const [lootSummary, setLootSummary] = useState({});
  const [validationError, setValidationError] = useState('');
  const [liveGapsWarning, setLiveGapsWarning] = useState('');
  const [activeMatrixFilter, setActiveMatrixFilter] = useState('');
  const [categoryAllocations, setCategoryAllocations] = useState({});
  const [initialWinnersByItem, setInitialWinnersByItem] = useState({});
  const [isDiscordGateOpen, setIsDiscordGateOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('standby'); 
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [viewLens, setViewLens] = useState('MINE'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [bookCurrentPage, setBookCurrentPage] = useState(1);
  const [generatedSlots, setGeneratedSlots] = useState([]);
  const lastLocalWriteTimeRef = useRef(0);
  const clientVersionRef = useRef(0);

  return (
    <MimicBookContext.Provider value={{
      isAdminMode, setIsAdminMode, activeStep, setActiveStep, loadingPool, setLoadingPool,
      isLootHistoryOpen, setIsLootHistoryOpen, loadingLootHistory, setLoadingLootHistory,
      lootHistoryData, setLootHistoryData, expandedGroups, setExpandedGroups,
      commitEvent, setCommitEvent, availableEvents, setAvailableEvents, commitDate, setCommitDate,
      committing, setCommittingSetting, syncingRoster, setSyncingRoster, items, setItems,
      rankingsByItem, setRankingsByItem, requestsByItemDetails, setRequestsByItemDetails,
      masterGuildRoster, setMasterGuildRoster, qtyPerPage, setQtyPerPage, lootRows, setLootRows,
      lootSummary, setLootSummary, validationError, setValidationError, liveGapsWarning, setLiveGapsWarning,
      activeMatrixFilter, setActiveMatrixFilter, categoryAllocations, setCategoryAllocations,
      initialWinnersByItem, setInitialWinnersByItem, isDiscordGateOpen, setIsDiscordGateOpen,
      sidebarTab, setSidebarTab, sidebarSearch, setSidebarSearch, viewLens, setViewLens,
      searchQuery, setSearchQuery, bookCurrentPage, setBookCurrentPage, generatedSlots, setGeneratedSlots,
      lastLocalWriteTimeRef, clientVersionRef
    }}>
      {children}
    </MimicBookContext.Provider>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [macroTab, setMacroTab] = useState('auction');

  useEffect(() => {
    async function loadUser() {
      setAuthLoading(true);
      const urlParams = new URLSearchParams(window.location.search);
      const authUserRaw = urlParams.get('auth_user');

      if (authUserRaw) {
        try {
          const parsedUser = JSON.parse(decodeURIComponent(authUserRaw));
          setAuthUser(parsedUser);
          localStorage.setItem('dynasty_raid_session', JSON.stringify(parsedUser));
          window.history.replaceState({}, document.title, window.location.pathname);
          setAuthLoading(false);
          return; 
        } catch (error) {
          console.error(error);
        }
      }

      // 🚀 CACHE PRE-LOAD: Instantly parse local storage to eliminate UI loading flicker
      const savedSession = localStorage.getItem('dynasty_raid_session');
      let initialInMemoryUser = null;
      
      if (savedSession) {
        try {
          initialInMemoryUser = JSON.parse(savedSession);
          setAuthUser(initialInMemoryUser);
        } catch (e) {
          localStorage.removeItem('dynasty_raid_session');
        }
      }

      // 🛰️ BACKGROUND SIGNATURE VERIFICATION: Verify token integrity with backend cryptographic seals
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (savedSession) {
          headers['x-user-profile'] = encodeURIComponent(savedSession);
        }
        
        const response = await fetch(`${backendUrl}/auth/me`, {
          credentials: 'include',
          headers: headers
        });
        const result = await response.json();
        
        if (result.authenticated && result.user) {
          // Sync state and local storage with fresh information from the server
          setAuthUser(result.user);
          localStorage.setItem('dynasty_raid_session', JSON.stringify(result.user));
        } else {
          // Session expired or revoked: Clean workspace state fields smoothly
          setAuthUser(null);
          localStorage.removeItem('dynasty_raid_session');
        }
      } catch (err) {
        // Fallback: If your server is briefly unreachable, trust local cache to prevent offline lockouts
        if (!initialInMemoryUser) {
          setAuthUser(null);
        }
      } finally {
        setAuthLoading(false);
      }
    }
    loadUser();
  }, []);

  const handleLogout = async () => {
    localStorage.removeItem('dynasty_raid_session');
    await logoutUser();
    setAuthUser(null);
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-white font-mono text-xs uppercase tracking-widest animate-pulse">
        Synchronizing Security Workspace Modules...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <MimicBookProvider>
        <MainLayout user={authUser} onLogout={handleLogout} macroTab={macroTab} setMacroTab={setMacroTab}>
          <Routes>
            <Route path="/" element={<RequestTab user={authUser} />} />
            <Route path="/mimic-book" element={<MimicBookTab user={authUser} />} />
            <Route path="/request-history" element={<RequestHistoryTab />} />
            <Route path="/past-auction" element={<PastAuctionTab />} />
            <Route path="/submit-evidence" element={<SubmitEvidenceTab />} />
            <Route path="/login" element={<LoginPage />} />
            
            {/* ⚙️ 2. MUST BE INSIDE THIS EXACT GROUP FOR FIRST-PARTY COMPONENT LAYOUTS */}
            <Route path="/settings-configuration" element={<SettingsTab />} />
            
            {/* 🛡️ Foundational Raid Governance Routes Mapping */}
            <Route path="/attendance/masterlist" element={<MasterListTab user={authUser} />} />
            <Route path="/attendance/raidparty" element={<RaidPartyTab user={authUser} />} />
            <Route path="/attendance/statistics" element={<StatisticsTab user={authUser} />} />
            <Route path="/attendance/scheduler" element={<Scheduler user={authUser} />} />
          </Routes>
        </MainLayout>
      </MimicBookProvider>
    </BrowserRouter>
  );
}