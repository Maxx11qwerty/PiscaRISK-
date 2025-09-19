import React, { useContext, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
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
import * as Auth from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { currentUser } = useContext(Auth.AuthContext);
  
  if (!currentUser) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

const AppRoutes = () => {
  const location = useLocation();
  const { isHandlingRedirect } = useContext(Auth.AuthContext);

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
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/ProfileSettings" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
      <Route path="/Homepage" element={<ProtectedRoute><Homepage /></ProtectedRoute>} />
      <Route path="/RewardManagement" element={<ProtectedRoute><RewardManagment /></ProtectedRoute>} />
      <Route path="/AccountManagement" element={<ProtectedRoute><AccountManagement /></ProtectedRoute>} />
      <Route path="/Feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
      <Route path="/logs" element={<ProtectedRoute><Logs /></ProtectedRoute>} />
      <Route path="/pond-conditions" element={<ProtectedRoute><PondConditionDashboard /></ProtectedRoute>} />
    </Routes>
  );
};

function App() {
  useEffect(() => {
    const testProxyConnection = async () => {
      try {
        console.log('Testing proxy connection to backend...');
        const response = await fetch('/api/debug', { signal: AbortSignal.timeout(3000) }); // 3s timeout
        if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
        const data = await response.json();
        console.log('✅ Proxy connection successful:', data);
      } catch (error) {
        console.warn('⚠️ Proxy connection failed:', error.message);
        console.log('Trying direct connection to port 3001...');
        try {
          const directResponse = await fetch('http://localhost:3001/api/debug', { signal: AbortSignal.timeout(3000) });
          if (!directResponse.ok) throw new Error(`Direct connection error: ${directResponse.status}`);
          const directData = await directResponse.json();
          console.log('✅ Direct connection successful:', directData);
        } catch (directError) {
          console.warn('⚠️ Direct connection also failed. Backend is probably not running.');
          // Do NOT throw here – keep app running
        }
      }
    };
    testProxyConnection();
  }, []);
  
  return (
    <BrowserRouter>
      <LanguageProvider>
        <Auth.AuthProvider>
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
        </Auth.AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
