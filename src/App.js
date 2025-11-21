import React, { useContext, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import SignupPage from "./SignupPage";
import Login from "./Login";
import Homepage from "./Homepage";
import ProfileSettings from "./ProfileSettings";
import AccountManagement from "./AccountManagement";
import Feedback from "./Feedback";
import Logs from './Logs';
import ForgotPassword from './components/ForgotPassword';
import PondConditionDashboard from './components/PondConditionDashboard';
import * as Auth from './contexts/AuthContext';
import { auth } from './firebase';
import { LanguageProvider } from './contexts/LanguageContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ToastNotification from './components/ToastNotification';
import CustomToastContainer from './components/ToastContainer';
import '../src/utils/sanitize';


// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { currentUser, isLoggingOutRef } = useContext(Auth.AuthContext);
  // Only show "booting" if Firebase session exists but context not hydrated yet
  // During logout, if both are null, we should redirect instead of showing loading
  const booting = !!auth.currentUser && !currentUser && !(isLoggingOutRef && isLoggingOutRef.current);
  if (booting) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:16,color:'#2C517D'}}>
        Loading session…
      </div>
    );
  }
  if (!currentUser) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const AppRoutes = () => {
  const { isHandlingRedirect, currentUser, isLoggingOutRef } = useContext(Auth.AuthContext);

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

  // Allow navigation if user is active and phone verified, even if email is not verified
  // This allows users to navigate after changing email while still showing verification prompts
  const isFullyAuthed = !!currentUser && String(currentUser.status || '').toLowerCase() === 'active' && currentUser.emailVerified === true && currentUser.phoneVerified === true;
  const canNavigate = !!currentUser && String(currentUser.status || '').toLowerCase() === 'active' && currentUser.phoneVerified === true;
  
  // Only show "booting" if Firebase session exists but context not hydrated yet
  // During logout, auth.currentUser might briefly exist, but we should redirect instead
  // Check if we're on the login page - if so, don't show booting message
  const booting = !!auth.currentUser && !currentUser && window.location.pathname !== '/' && !(isLoggingOutRef && isLoggingOutRef.current);

  if (booting) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:16,color:'#2C517D'}}>
        Loading session…
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={isFullyAuthed ? <Navigate to="/Homepage" replace /> : <Login />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/ProfileSettings" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
      <Route path="/Homepage" element={canNavigate ? <Homepage /> : <Navigate to="/" replace />} />
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
      // Only attempt connectivity test in development
      if (process.env.NODE_ENV !== 'development') return;
      // Also only run when developing on localhost to avoid CSP violations
      if (window.location.hostname !== 'localhost') return;
      try {
        const response = await fetch('/api/debug', { signal: AbortSignal.timeout(3000) }); // 3s timeout
        if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
        await response.json();
      } catch (error) {
        try {
          const directResponse = await fetch('http://localhost:3001/api/debug', { signal: AbortSignal.timeout(3000) });
          if (!directResponse.ok) throw new Error(`Direct connection error: ${directResponse.status}`);
          await directResponse.json();
        } catch (_) {
          // Silent in production
        }
      }
    };
    testProxyConnection();
  }, []);
  
  return (
    <BrowserRouter>
      <LanguageProvider>
        <Auth.AuthProvider>
          <NotificationProvider>
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
            <CustomToastContainer />
          </NotificationProvider>
        </Auth.AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;
