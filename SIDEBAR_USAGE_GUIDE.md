# Sidebar Component Usage Guide

## Overview
The new `Sidebar` component combines both the `SidebarTop` (user profile section) and all sidebar navigation content into one reusable component. This makes it easy to display a consistent sidebar across all pages.

## Files Created
- `src/components/Sidebar.js` - The main sidebar component
- `src/components/Sidebar.css` - All sidebar styling

## How to Use

### 1. Import the Component
```javascript
import Sidebar from './components/Sidebar';
```

### 2. Add the Component to Your Page
```javascript
<Sidebar 
  currentUser={currentUser}
  sidebarOpen={sidebarOpen}
  onLogout={handleLogout}
  onAccountManagementClick={handleAccountManagementClick}
  onLogsClick={handleLogsClick}
  onRewardManagementClick={handleRewardManagementClick}
/>
```

### 3. Required Props
- `currentUser` - User object from AuthContext
- `sidebarOpen` - Boolean for collapsed/expanded state
- `onLogout` - Function to handle logout
- `onAccountManagementClick` - Function to navigate to Account Management
- `onLogsClick` - Function to navigate to Logs
- `onRewardManagementClick` - Function to navigate to Reward Management

## Example Implementation

### Basic Usage
```javascript
import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import Sidebar from '../components/Sidebar';

const YourPage = () => {
  const { currentUser, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleAccountManagementClick = async () => {
    navigate('/AccountManagement');
  };

  const handleLogsClick = async () => {
    navigate('/Logs');
  };

  const handleRewardManagementClick = async () => {
    navigate('/RewardManagement');
  };

  return (
    <div className="page-container">
      <Sidebar 
        currentUser={currentUser}
        sidebarOpen={false}
        onLogout={handleLogout}
        onAccountManagementClick={handleAccountManagementClick}
        onLogsClick={handleLogsClick}
        onRewardManagementClick={handleRewardManagementClick}
      />
      
      <div className="main-content">
        {/* Your page content here */}
      </div>
    </div>
  );
};

export default YourPage;
```

## Pages That Can Use This Component

### ✅ Already Updated
- `Homepage.js` - Uses the new Sidebar component
- `AccountManagement.js` - Uses the new Sidebar component

### 🔄 Ready to Update
- `ProfileSettings.js` - Can replace existing navigation with Sidebar
- `Feedback.js` - Can add Sidebar for consistent navigation
- `Logs.js` - Can add Sidebar for consistent navigation
- `RewardManagement.js` - Can add Sidebar for consistent navigation

## Features Included

### 1. User Profile Section (SidebarTop)
- Profile picture or default user icon
- Username display
- Welcome message

### 2. Navigation Menu
- Dashboard (Homepage)
- Accounts
- Logs
- Feedback
- Rewards

### 3. Bottom Options
- Logout button

### 4. Export Data Section
- PDF export option
- CSV export option

### 5. Responsive Design
- Collapsible sidebar
- Mobile-friendly layout
- Responsive typography

## CSS Classes Available

### Main Container
- `.sidebar-wrapper` - Main sidebar container
- `.sidebar-wrapper.collapsed` - Collapsed state

### User Profile
- `.sidebar-top` - Top section container
- `.user-info` - User information container
- `.profile-picture` - Profile image styling
- `.user-icon` - Default user icon
- `.welcome-text` - Welcome message container
- `.username` - Username text

### Navigation
- `.sidebar` - Navigation container
- `.sidebar-buttons` - Navigation buttons container
- `.sidebar-nav-item` - Individual navigation item
- `.sidebar-nav-icon` - Navigation icons

### Export Section
- `.sidebar-export-container` - Export options container
- `.sidebar-download-options` - Download options dropdown
- `.sidebar-download-option` - Individual download option

## Responsive Breakpoints

- **Desktop**: Full sidebar with text labels
- **Tablet**: Responsive layout adjustments
- **Mobile**: Collapsed sidebar with icon-only view

## Benefits

1. **Consistency** - Same sidebar across all pages
2. **Maintainability** - Single component to update
3. **Reusability** - Easy to add to new pages
4. **Responsive** - Works on all screen sizes
5. **Customizable** - Props allow page-specific behavior

## Troubleshooting

### Common Issues
1. **Sidebar not showing** - Check if `currentUser` is passed correctly
2. **Navigation not working** - Ensure all handler functions are implemented
3. **Styling conflicts** - Make sure `Sidebar.css` is imported

### CSS Conflicts
If you experience styling issues, check for:
- Duplicate CSS rules in your page's CSS file
- Conflicting class names
- Missing font imports

## Next Steps

To complete the sidebar integration across all pages:

1. Update `ProfileSettings.js`
2. Update `Feedback.js`
3. Update `Logs.js`
4. Update `RewardManagement.js`

Each page should follow the same pattern shown in the example implementation above.
