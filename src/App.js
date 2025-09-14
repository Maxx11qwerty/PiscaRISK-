import React from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import SignupPage from "./SignupPage";
import Login from "./Login";
import Homepage from "./Homepage";
import ProfileSettings from "./ProfileSettings";
import AccountManagement from "./AccountManagement";
import RewardManagment from "./RewardManagement";
import Feedback from "./Feedback";
import Logs from './Logs';
import ForgotPassword from './components/ForgotPassword';
import PondConditionDashboard from './components/PondConditionDashboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';

const AppRoutes = () => {
  const location = useLocation();
  const { isHandlingRedirect } = useAuth();

  if (isHandlingRedirect) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px',
        color: '#333',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '20px' }}>🔄</div>
          <div>Completing Google sign-in...</div>
        </div>
      </div>
    );
  }

  return (
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={<Login />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/ProfileSettings" element={<ProfileSettings />} />
      <Route path="/Homepage" element={<Homepage />} />
      <Route path="/RewardManagement" element={<RewardManagment />} />
      <Route path="/AccountManagement" element={<AccountManagement />} />
      <Route path="/Feedback" element={<Feedback />} />
      <Route path="/logs" element={<Logs />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/pond-conditions" element={<PondConditionDashboard />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <AppRoutes />
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
