import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import InvestmentOverview from "@/pages/InvestmentOverview";
import CryptoPage from "@/pages/CryptoPage";
import GoMiningPage from "@/pages/GoMiningPage";
import PhoneList from "@/pages/PhoneList";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="min-h-screen bg-background">
      <BrowserRouter>
        <Sidebar />
        <main className="pl-56 min-h-screen">
          <div className="max-w-[1400px] mx-auto px-6 py-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/investments" element={<InvestmentOverview />} />
              <Route path="/crypto" element={<CryptoPage />} />
              <Route path="/gomining" element={<GoMiningPage />} />
              <Route path="/phone-list" element={<PhoneList />} />
            </Routes>
          </div>
        </main>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;
