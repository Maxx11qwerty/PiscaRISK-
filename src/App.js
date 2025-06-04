import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
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

function App() {
  return (
    <AuthProvider>
      <div className="App">
      <Routes>
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
      </div>
    </AuthProvider>
  );
}

export default App;
