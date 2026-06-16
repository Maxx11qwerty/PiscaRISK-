import React, { useContext, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Toaster as SileoToaster } from 'sileo';
import 'sileo/styles.css';
import './SileoToast.css';
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
import CustomToastContainer from './components/ToastContainer';
import LandingPage from './components/landing/LandingPage';
import '../src/utils/sanitize';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { currentUser, isLoggingOutRef } = useContext(Auth.AuthContext);
  const booting = !!auth.currentUser && !currentUser && !(isLoggingOutRef && isLoggingOutRef.current);
  if (booting) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:16,color:'#2C517D'}}>
        Loading session…
      </div>
    );
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
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

  const isFullyAuthed = !!currentUser && String(currentUser.status || '').toLowerCase() === 'active' && currentUser.emailVerified === true && currentUser.phoneVerified === true;
  const canNavigate = !!currentUser && String(currentUser.status || '').toLowerCase() === 'active' && currentUser.phoneVerified === true;
  
  const pathname = window.location.pathname;
  const isPublicAuthPage = pathname === '/' || pathname === '/login';
  const booting = !!auth.currentUser && !currentUser && !isPublicAuthPage && !(isLoggingOutRef && isLoggingOutRef.current);

  if (booting) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:16,color:'#2C517D'}}>
        Loading session…
      </div>
    );
  }

  return (
    <Routes>
      {/* Landing Page - Only show to non-authenticated users */}
      <Route 
        path="/" 
        element={!currentUser ? <LandingPage /> : <Navigate to="/Homepage" replace />} 
      />
      
      {/* Login Page - Redirect to homepage if already authenticated */}
      <Route 
        path="/login" 
        element={isFullyAuthed ? <Navigate to="/Homepage" replace /> : <Login />} 
      />
      
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/ProfileSettings" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
      <Route path="/Homepage" element={canNavigate ? <Homepage /> : <Navigate to="/login" replace />} />
      <Route path="/AccountManagement" element={<ProtectedRoute><AccountManagement /></ProtectedRoute>} />
      <Route path="/Feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
      <Route path="/logs" element={<ProtectedRoute><Logs /></ProtectedRoute>} />
      <Route path="/pond-conditions" element={<ProtectedRoute><PondConditionDashboard /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" replace />} /> {/* Changed from "/" to "/login" */}
    </Routes>
  );
};

function App() {
  useEffect(() => {
    const testProxyConnection = async () => {
      if (process.env.NODE_ENV !== 'development') return;
      if (window.location.hostname !== 'localhost') return;
      try {
        const response = await fetch('/api/debug', { signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
        await response.json();
      } catch (error) {
        try {
          const directResponse = await fetch('http://localhost:3001/api/debug', { signal: AbortSignal.timeout(3000) });
          if (!directResponse.ok) throw new Error(`Direct connection error: ${directResponse.status}`);
          await directResponse.json();
        } catch (_) {
          // Silent
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
            <SileoToaster position="top-right" />
          </NotificationProvider>
        </Auth.AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;