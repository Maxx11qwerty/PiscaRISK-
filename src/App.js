import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from 'framer-motion';
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
import { AuthProvider } from './contexts/AuthContext';
import PageTransition from './components/PageTransition';

// Create a wrapper component to use useLocation
const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={
          <PageTransition>
            <Login />
          </PageTransition>
        } />
        <Route path="/signup" element={
          <PageTransition>
            <SignupPage />
          </PageTransition>
        } />
        <Route path="/ProfileSettings" element={
          <PageTransition>
            <ProfileSettings />
          </PageTransition>
        } />
        <Route path="/Homepage" element={
          <PageTransition>
            <Homepage />
          </PageTransition>
        } />
        <Route path="/RewardManagement" element={
          <PageTransition>
            <RewardManagment />
          </PageTransition>
        } />
        <Route path="/AccountManagement" element={
          <PageTransition>
            <AccountManagement />
          </PageTransition>
        } />
        <Route path="/Feedback" element={
          <PageTransition>
            <Feedback />
          </PageTransition>
        } />
        <Route path="/logs" element={
          <PageTransition>
            <Logs />
          </PageTransition>
        } />
        <Route path="/forgot-password" element={
          <PageTransition>
            <ForgotPassword />
          </PageTransition>
        } />
        <Route path="/pond-conditions" element={
          <PageTransition>
            <PondConditionDashboard />
          </PageTransition>
        } />
      </Routes>
    </AnimatePresence>
  );
};

// Main App component
function App() {
  return (
    <AuthProvider>
      <AnimatedRoutes />
    </AuthProvider>
  );
}

export default App;
