import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import RequestTab from './pages/RequestTab';
import LiveBiddingTab from './pages/LiveBiddingTab';
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
    await logoutUser();
    setAuthUser(null);
  };

  // Prevent UI flashing before the cookie check completes
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