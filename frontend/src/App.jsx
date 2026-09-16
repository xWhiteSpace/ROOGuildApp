// frontend/src/App.jsx
import { useEffect, useState, createContext, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import RequestTab from './games/ragnarok-origin/pages/RequestTab';
import MimicBookTab from './games/ragnarok-origin/pages/MimicBookTab';
import RequestHistoryTab from './games/ragnarok-origin/pages/RequestHistoryTab';
import PastAuctionTab from './games/ragnarok-origin/pages/PastAuctionTab';
import LandingPage from './pages/LandingPage';
import SettingsTab from './games/ragnarok-origin/pages/SettingsTab';
import { logoutUser } from './services/authService';
import MasterListTab from './games/ragnarok-origin/pages/MasterListTab';

import RaidPartyTab from './games/ragnarok-origin/pages/RaidPartyTab';
import RaidComposeTab from './games/ragnarok-origin/pages/RaidComposeTab';
import Profile from './games/ragnarok-origin/pages/Profile';
import StatisticsTab from './games/ragnarok-origin/pages/StatisticsTab';
import LiveRaidTab from './games/ragnarok-origin/pages/LiveRaidTab';
import AttendanceHistoryTab from './games/ragnarok-origin/pages/AttendanceHistoryTab';

import Scheduler from './games/ragnarok-origin/pages/Scheduler';
import PeakHoursTab from './games/ragnarok-origin/pages/PeakHoursTab';
import SelectGuildPage from './pages/SelectGuildPage';
import OnboardGuildPage from './pages/OnboardGuildPage';
import ChooseGamePage from './pages/ChooseGamePage';
import BillingPage from './pages/BillingPage';
import WorkspaceSettingsPage from './pages/WorkspaceSettingsPage';
import RagnarokSetupPage from './games/ragnarok-origin/pages/RagnarokSetupPage';
import { apiFetch } from './services/apiClient';
import { formatGuildDate, DEFAULT_TZ } from './utils/guildTime';
import { PRODUCT_NAME, productTitle } from './brand';
import { GAMES, firstEnabledGameId, gameIdForPath, RAGNAROK_ORIGIN_ID, resolvePostLoginPath } from './games/catalog';
import HighlightsPage from './games/adventurer-guild/pages/HighlightsPage';
import GuildEventsPage from './games/adventurer-guild/pages/GuildEventsPage';

export const MimicBookContext = createContext(null);

const SESSION_KEY = 'guild_raid_session';
const LEGACY_SESSION_KEY = 'dynasty_raid_session';

function readSessionRaw() {
  const current = localStorage.getItem(SESSION_KEY);
  if (current) return current;
  const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
  if (legacy) {
    localStorage.setItem(SESSION_KEY, legacy);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    return legacy;
  }
  return null;
}

export function MimicBookProvider({ children }) {
  const [isAdminMode, setIsAdminMode] = useState(true); 
  const [activeStep, setActiveStep] = useState(1); 
  const [loadingPool, setLoadingPool] = useState(false);
  const [isLootHistoryOpen, setIsLootHistoryOpen] = useState(false);
  const [loadingLootHistory, setLoadingLootHistory] = useState(false);
  const [lootHistoryData, setLootHistoryData] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({}); 
  const [commitEvent, setCommitEvent] = useState('');
  const [availableEvents, setAvailableEvents] = useState({});
  const [commitDate, setCommitDate] = useState(() => formatGuildDate(new Date(), DEFAULT_TZ));
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
  const [autoCommitArmed, setAutoCommitArmed] = useState(false);
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
      autoCommitArmed, setAutoCommitArmed,
      lastLocalWriteTimeRef, clientVersionRef
    }}>
      {children}
    </MimicBookContext.Provider>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeGameId, setActiveGameId] = useState(() => {
    try {
      return localStorage.getItem('valhalla_active_game') || RAGNAROK_ORIGIN_ID;
    } catch {
      return RAGNAROK_ORIGIN_ID;
    }
  });

  useEffect(() => {
    const enabled = firstEnabledGameId(authUser?.enabledGames);
    if (!enabled) return;
    if (!(authUser.enabledGames || []).includes(activeGameId)) {
      setActiveGameId(enabled);
    }
  }, [authUser?.enabledGames, activeGameId, authUser]);

  useEffect(() => {
    try {
      if (activeGameId) localStorage.setItem('valhalla_active_game', activeGameId);
    } catch {
      /* ignore */
    }
  }, [activeGameId]);

  useEffect(() => {
    async function loadUser() {
      setAuthLoading(true);
      const urlParams = new URLSearchParams(window.location.search);
      const authUserRaw = urlParams.get('auth_user');

      if (authUserRaw) {
        try {
          let parsedUser;
          try {
            parsedUser = JSON.parse(decodeURIComponent(authUserRaw));
          } catch {
            parsedUser = JSON.parse(authUserRaw);
          }
          setAuthUser(parsedUser);
          localStorage.setItem(SESSION_KEY, JSON.stringify(parsedUser));
          localStorage.removeItem(LEGACY_SESSION_KEY);
          window.history.replaceState({}, document.title, window.location.pathname);
          setAuthLoading(false);
          return; 
        } catch (error) {
          console.error(error);
        }
      }

      // 🚀 CACHE PRE-LOAD: Instantly parse local storage to eliminate UI loading flicker
      const savedSession = readSessionRaw();
      let initialInMemoryUser = null;
      
      if (savedSession) {
        try {
          initialInMemoryUser = JSON.parse(savedSession);
          setAuthUser(initialInMemoryUser);
        } catch (e) {
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(LEGACY_SESSION_KEY);
        }
      }

      // 🛰️ BACKGROUND SIGNATURE VERIFICATION: Verify token integrity with backend cryptographic seals
      try {
        const response = await apiFetch('/auth/me', { method: 'GET' });
        const result = await response.json();
        
        if (result.authenticated && result.user) {
          setAuthUser(result.user);
          localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
          localStorage.removeItem(LEGACY_SESSION_KEY);
        } else {
          setAuthUser(null);
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(LEGACY_SESSION_KEY);
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

  // Browser tab: VALHALLA while logged out; "{Guild} · VALHALLA" after auth
  useEffect(() => {
    if (!authUser) {
      document.title = PRODUCT_NAME;
      return;
    }
    document.title = productTitle(authUser.tenantName);
  }, [authUser]);

  const handleLogout = async () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    await logoutUser();
    setAuthUser(null);
    window.location.assign('/landing');
  };

  const handleSessionUser = (nextUser) => {
    setAuthUser(nextUser);
    if (nextUser) localStorage.setItem(SESSION_KEY, JSON.stringify(nextUser));
  };

  // Landing is public — don't block it behind session sync
  if (authLoading && window.location.pathname !== '/landing') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-white font-mono text-xs uppercase tracking-widest animate-pulse">
        Synchronizing Security Workspace Modules...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <MimicBookProvider>
        <AppShell
          authUser={authUser}
          onLogout={handleLogout}
          onSessionUser={handleSessionUser}
          activeGameId={activeGameId}
          setActiveGameId={setActiveGameId}
        />
      </MimicBookProvider>
    </BrowserRouter>
  );
}

/** Landing is full-bleed (no nav chrome); everything else stays in MainLayout. */
function postLoginPath(user) {
  return resolvePostLoginPath(user);
}

/** Landing is full-bleed (no nav chrome); everything else stays in MainLayout. */
function AppShell({ authUser, onLogout, onSessionUser, activeGameId, setActiveGameId }) {
  const { pathname, search } = useLocation();
  const standalone = new Set([
    '/select-guild',
    '/onboard',
    '/workspace/games',
    '/workspace/billing',
    '/games/ragnarok-origin/setup',
  ]);

  const pathGameId = gameIdForPath(pathname);
  const effectiveGameId = pathGameId && (authUser?.enabledGames || []).includes(pathGameId)
    ? pathGameId
    : activeGameId;

  useEffect(() => {
    if (effectiveGameId && effectiveGameId !== activeGameId) {
      setActiveGameId(effectiveGameId);
    }
  }, [effectiveGameId, activeGameId, setActiveGameId]);

  if (pathname === '/login') {
    return <Navigate to={`/landing${search}`} replace />;
  }

  if (!authUser && (standalone.has(pathname) || pathname.startsWith('/workspace'))) {
    return <Navigate to="/landing" replace />;
  }

  if (pathname === '/select-guild' && authUser) {
    return <SelectGuildPage user={authUser} onSessionUser={onSessionUser} />;
  }
  if (pathname === '/onboard' && authUser) {
    return <OnboardGuildPage onSessionUser={onSessionUser} />;
  }
  if (
    authUser?.currentTenantId
    && authUser.subscriptionAllowed === false
    && pathname !== '/workspace/billing'
    && pathname !== '/onboard'
    && pathname !== '/select-guild'
  ) {
    return <Navigate to="/workspace/billing" replace />;
  }
  if (pathname === '/workspace/games' && authUser) {
    return <ChooseGamePage user={authUser} onSessionUser={onSessionUser} />;
  }
  if (pathname === '/workspace/billing' && authUser) {
    return <BillingPage user={authUser} onSessionUser={onSessionUser} />;
  }
  if (pathname === '/games/ragnarok-origin/setup' && authUser) {
    return <RagnarokSetupPage onSessionUser={onSessionUser} />;
  }

  if (pathname === '/landing' && authUser) {
    return <Navigate to={postLoginPath(authUser)} replace />;
  }

  if (pathname === '/landing' && !authUser) {
    return <LandingPage />;
  }
  if (pathname === '/' && !authUser) {
    return <Navigate to="/landing" replace />;
  }

  if (authUser && !authUser.currentTenantId && !standalone.has(pathname)) {
    return <Navigate to="/select-guild" replace />;
  }

  if (authUser?.currentTenantId) {
    const next = postLoginPath(authUser);
    const needsBilling = next === '/workspace/billing';
    const needsChoose = next === '/workspace/games';
    const needsSetup = GAMES.some((game) => game.setupPath && next === game.setupPath);
    if (needsBilling && pathname !== '/workspace/billing' && pathname !== '/onboard' && pathname !== '/select-guild') {
      return <Navigate to="/workspace/billing" replace />;
    }
    if (needsChoose && pathname !== '/workspace/games' && pathname !== '/onboard' && pathname !== '/select-guild' && pathname !== '/workspace/billing') {
      return <Navigate to="/workspace/games" replace />;
    }
    if (needsSetup && pathname !== next && pathname !== '/workspace/games' && pathname !== '/onboard' && pathname !== '/workspace/billing') {
      return <Navigate to={next} replace />;
    }
    if (
      pathGameId
      && !(authUser.enabledGames || []).includes(pathGameId)
      && pathname !== '/workspace'
      && pathname !== '/workspace/games'
      && pathname !== '/workspace/billing'
    ) {
      return <Navigate to={next} replace />;
    }
  }

  return (
    <MainLayout user={authUser} onLogout={onLogout} onSessionUser={onSessionUser} activeGameId={effectiveGameId} setActiveGameId={setActiveGameId}>
      <Routes>
        <Route path="/" element={<RequestTab user={authUser} />} />
        <Route path="/mimic-book" element={<MimicBookTab user={authUser} />} />
        <Route path="/request-history" element={<RequestHistoryTab user={authUser} />} />
        <Route path="/past-auction" element={<PastAuctionTab />} />
        <Route path="/submit-evidence" element={<Navigate to="/" replace />} />
        <Route path="/workspace" element={<WorkspaceSettingsPage user={authUser} onSessionUser={onSessionUser} />} />
        <Route path="/games/adventurer-guild" element={<HighlightsPage user={authUser} />} />
        <Route path="/games/adventurer-guild/highlights" element={<Navigate to="/games/adventurer-guild" replace />} />
        <Route path="/games/adventurer-guild/events" element={<GuildEventsPage user={authUser} />} />
        <Route path="/games/ragnarok-origin/settings" element={<SettingsTab user={authUser} onSessionUser={onSessionUser} />} />
        <Route path="/settings-configuration" element={<Navigate to="/games/ragnarok-origin/settings" replace />} />
        <Route path="/attendance/masterlist" element={<MasterListTab user={authUser} />} />
        <Route path="/attendance/profile" element={<Profile user={authUser} />} />
        <Route path="/attendance/profile/:uid" element={<Profile user={authUser} />} />
        <Route path="/attendance/peak-hours" element={<PeakHoursTab user={authUser} />} />
        <Route path="/attendance/raidparty" element={<RaidPartyTab user={authUser} />} />
        <Route path="/attendance/compose" element={<RaidComposeTab user={authUser} />} />
        <Route path="/attendance/liveraid" element={<LiveRaidTab user={authUser} />} />
        <Route path="/attendance/history" element={<AttendanceHistoryTab user={authUser} />} />
        <Route path="/attendance/statistics" element={<StatisticsTab user={authUser} />} />
        <Route path="/attendance/scheduler" element={<Scheduler user={authUser} />} />
      </Routes>
    </MainLayout>
  );
}