import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import RequestTab from './pages/RequestTab';
import LiveBiddingTab from './pages/LiveBiddingTab';
import MimicBookTab from './pages/MimicBookTab';
import RequestHistoryTab from './pages/RequestHistoryTab';
import PastAuctionTab from './pages/PastAuctionTab';
import SubmitEvidenceTab from './pages/SubmitEvidenceTab';
import LoginPage from './pages/LoginPage';
import { fetchCurrentUser, logoutUser } from './services/authService';

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      setAuthLoading(true);

      // 1. Check if the backend passed the user profile inside the URL (Unblocks Mobile Login)
      const urlParams = new URLSearchParams(window.location.search);
      const authUserRaw = urlParams.get('auth_user');

      if (authUserRaw) {
        try {
          const parsedUser = JSON.parse(decodeURIComponent(authUserRaw));
          setAuthUser(parsedUser);
          
          // Persist the user profile so it survives a browser page refresh
          localStorage.setItem('dynasty_raid_session', JSON.stringify(parsedUser));
          
          // Instantly wipe the messy data token out of the browser address bar
          window.history.replaceState({}, document.title, window.location.pathname);
          setAuthLoading(false);
          return; 
        } catch (error) {
          console.error("Failed to parse cross-origin session credentials:", error);
        }
      }

      // 2. Fallback: If no URL parameters exist, check local storage (Unblocks Mobile Page Refresh)
      const savedSession = localStorage.getItem('dynasty_raid_session');
      if (savedSession) {
        try {
          setAuthUser(JSON.parse(savedSession));
          setAuthLoading(false);
          return;
        } catch (e) {
          localStorage.removeItem('dynasty_raid_session');
        }
      }

      // 3. Default fallback: Execute standard cookie validation check (For Desktop Monitors)
      try {
        const result = await fetchCurrentUser();
        if (result.authenticated) {
          setAuthUser(result.user);
        } else {
          setAuthUser(null);
        }
      } catch (err) {
        console.error("Failed to fetch current user:", err);
        setAuthUser(null);
      } finally {
        setAuthLoading(false);
      }
    }

    loadUser();
  }, []);

  const handleLogout = async () => {
    // Completely clear out the session token from local storage cache
    localStorage.removeItem('dynasty_raid_session');
    await logoutUser();
    setAuthUser(null);
  };

  // Prevent UI flashing before the login sequence determination finishes
  if (authLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-white font-medium">
        Loading DynastyGuild Dashboard...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <MainLayout user={authUser} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<RequestTab />} />
          <Route path="/live-bidding" element={<LiveBiddingTab user={authUser} />} />
          <Route path="/mimic-book" element={<MimicBookTab user={authUser} />} />
          <Route path="/request-history" element={<RequestHistoryTab />} />
          <Route path="/past-auction" element={<PastAuctionTab />} />
          <Route path="/submit-evidence" element={<SubmitEvidenceTab />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;