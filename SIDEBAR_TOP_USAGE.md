# SidebarTop Component Usage Guide

## Overview
The `SidebarTop` component is a reusable component that displays the user profile section (profile picture, username, and welcome message) in the sidebar. It has been extracted from the Homepage to be used across all pages that need a sidebar.

## Component Location
- **Component**: `src/components/SidebarTop.js`
- **Styles**: `src/components/SidebarTop.css`

## How to Use

### 1. Import the Component
```javascript
import SidebarTop from './components/SidebarTop';
```

### 2. Use in Your Page
```javascript
const YourPage = () => {
  const { currentUser } = useContext(AuthContext);
  
  return (
    <div className="your-page-container">
      {/* Your header */}
      <header>...</header>
      
      {/* Sidebar with SidebarTop */}
      <div className="sidebar-wrapper">
        <SidebarTop currentUser={currentUser} />
        
        {/* Your sidebar navigation */}
        <aside className="sidebar">
          {/* Your sidebar content */}
        </aside>
      </div>
      
      {/* Main content */}
      <div className="main-content">
        {/* Your page content */}
      </div>
    </div>
  );
};
```

## Required Props
- `currentUser`: The current user object from AuthContext

## Example Implementation

### For Pages with Full Sidebar (like Homepage)
```javascript
import React, { useContext } from 'react';
import { AuthContext } from './contexts/AuthContext';
import SidebarTop from './components/SidebarTop';

const YourPage = () => {
  const { currentUser } = useContext(AuthContext);
  
  return (
    <div className="page-container">
      {/* Header */}
      <header className="page-header">
        {/* Your header content */}
      </header>
      
      {/* Sidebar */}
      <div className="sidebar-wrapper">
        <SidebarTop currentUser={currentUser} />
        
        <aside className="sidebar">
          <div className="sidebar-buttons">
            {/* Navigation items */}
            <div className="sidebar-nav-item">
              <FaHome className="sidebar-nav-icon" />
              <span>Dashboard</span>
            </div>
            {/* More navigation items */}
          </div>
        </aside>
      </div>
      
      {/* Main content */}
      <div className="main-content">
        {/* Your page content */}
      </div>
    </div>
  );
};
```

### For Pages with Only SidebarTop (minimal sidebar)
```javascript
import React, { useContext } from 'react';
import { AuthContext } from './contexts/AuthContext';
import SidebarTop from './components/SidebarTop';

const YourPage = () => {
  const { currentUser } = useContext(AuthContext);
  
  return (
    <div className="page-container">
      {/* Header */}
      <header className="page-header">
        {/* Your header content */}
      </header>
      
      {/* Minimal sidebar with just SidebarTop */}
      <div className="sidebar-wrapper minimal">
        <SidebarTop currentUser={currentUser} />
      </div>
      
      {/* Main content */}
      <div className="main-content">
        {/* Your page content */}
      </div>
    </div>
  );
};
```

## CSS Classes Available

The component includes these CSS classes that you can customize:
- `.sidebar-top` - Main container
- `.user-info` - User information container
- `.profile-picture` - Profile image
- `.user-icon` - Default user icon
- `.welcome-text` - Welcome text container
- `.username` - Username text

## Responsive Design

The component is already responsive and includes media queries for:
- Mobile devices (max-width: 768px)
- Small devices (max-width: 480px)

## Integration with Existing Pages

### Pages that already have sidebar structure:
- **Homepage** ✅ (Already updated)

### Pages that could benefit from SidebarTop:
- **AccountManagement** - Add sidebar with SidebarTop
- **ProfileSettings** - Add sidebar with SidebarTop
- **Feedback** - Add sidebar with SidebarTop
- **Logs** - Add sidebar with SidebarTop
- **RewardManagement** - Add sidebar with SidebarTop

## Benefits of Using SidebarTop

1. **Consistency**: All pages will have the same user profile display
2. **Maintainability**: Changes to the profile display only need to be made in one place
3. **Reusability**: Easy to add to new pages
4. **Responsive**: Already includes responsive design
5. **Clean Code**: Separates concerns and makes pages more modular

## Troubleshooting

### Common Issues:
1. **Profile not showing**: Make sure `currentUser` is passed correctly
2. **Styling conflicts**: Check if your page CSS conflicts with SidebarTop styles
3. **Responsive issues**: Ensure your page container has proper responsive CSS

### Debug Steps:
1. Check if `currentUser` is available in AuthContext
2. Verify the import path is correct
3. Check browser console for any errors
4. Ensure the component is properly nested in your page structure
