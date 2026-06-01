// frontend/src/App.jsx
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
          console.error("Failed to parse cross-origin session credentials:", error);
        }
      }

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
    localStorage.removeItem('dynasty_raid_session');
    await logoutUser();
    setAuthUser(null);
  };

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
          {/* ✅ Passed user context prop to RequestTab for root alignment mapping */}
          <Route path="/" element={<RequestTab user={authUser} />} />
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