# Sidebar Component Usage Guide

The `Sidebar` component provides consistent navigation, user profile display, language toggle, and export controls across authenticated pages.

## Files

- `src/components/Sidebar.js`
- `src/components/Sidebar.css`

## Pages Using Sidebar

| Page | Route |
|------|-------|
| `Homepage.js` | `/Homepage` |
| `AccountManagement.js` | `/AccountManagement` |
| `ProfileSettings.js` | `/ProfileSettings` |
| `Feedback.js` | `/Feedback` |
| `Logs.js` | `/logs` |

## Import

```javascript
import Sidebar from './components/Sidebar';
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `sidebarOpen` | boolean | Mobile slide-in state |
| `sidebarCollapsed` | boolean | Desktop collapsed width |
| `currentUser` | object | User from `AuthContext` |
| `showDownloadOptions` | boolean | Export dropdown visibility |
| `setShowDownloadOptions` | function | Toggle export dropdown |
| `onDropdownOpen` | function | Close other dropdowns when export opens |
| `handleExport` | function | `(format: 'pdf' \| 'csv') => void` |
| `onDashboardClick` | function | Navigate to dashboard |
| `onAccountManagementClick` | function | Navigate to account management |
| `onLogsClick` | function | Navigate to logs |
| `onFeedbackClick` | function | Navigate to feedback |

## Example (Homepage pattern)

```javascript
import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';

const MyPage = () => {
  const { currentUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);

  const handleExport = (format) => {
    // Page-specific PDF/CSV export logic
    setShowDownloadOptions(false);
  };

  return (
    <div className="page-layout">
      <Sidebar
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        currentUser={currentUser}
        showDownloadOptions={showDownloadOptions}
        setShowDownloadOptions={setShowDownloadOptions}
        onDropdownOpen={() => {}}
        handleExport={handleExport}
        onDashboardClick={() => navigate('/Homepage')}
        onAccountManagementClick={() => navigate('/AccountManagement')}
        onLogsClick={() => navigate('/logs')}
        onFeedbackClick={() => navigate('/Feedback')}
      />
      <main className="main-content">
        {/* page content */}
      </main>
    </div>
  );
};
```

## Features

### User profile section

- Profile image or default icon
- Display name (username or email prefix)
- Role label (Tech Officer, Farm Admin, Fish Farmer, etc.)

### Navigation items

- **Dashboard** → `/Homepage`
- **Accounts** → `/AccountManagement` (role-gated)
- **Logs** → `/logs` (role-gated)
- **Feedback** → `/Feedback` (role-gated for some roles)

Active route is highlighted using `useLocation()`.

### Language toggle

- Switches between English (`en`) and Tagalog (`tl`)
- Uses `LanguageContext` + i18next
- Preference stored via `secureStorage`

### Export section

- PDF and CSV options (when `handleExport` provided)
- Dropdown controlled by `showDownloadOptions`

### Notifications badge

- Pending activations count from `NotificationContext` (`pendingActivations`)

## Role-Based Visibility

Sidebar hides or shows nav items based on role:

| Role | Accounts | Logs | Feedback |
|------|----------|------|----------|
| Super Admin (admin, no farm) | ✅ | ✅ | ✅ |
| Tech Officer | ✅ | ✅ | ✅ |
| Temporary Tech Officer | ✅ | ✅ | ✅ |
| Farm Admin | ✅ (scoped) | ✅ | ❌ |
| Fish Farmer | ❌ | ❌ | ❌ |

Exact logic is in `Sidebar.js` (`isSuperAdmin`, `isTechOfficer`, `canAccessFeedback`, etc.).

## Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| Desktop (>1023px) | `sidebarCollapsed` toggles width |
| Mobile/tablet (≤1023px) | `sidebarOpen` slides sidebar in/out |

CSS classes: `.sidebar-wrapper`, `.sidebar-wrapper.collapsed`, `.sidebar-wrapper.sidebarOpen`

## CSS Classes

| Class | Purpose |
|-------|---------|
| `.sidebar-wrapper` | Main container |
| `.sidebar-top` | User profile area |
| `.user-info` | Avatar + name |
| `.sidebar` | Navigation list |
| `.sidebar-nav-item` | Nav button |
| `.sidebar-export-container` | Export dropdown |

## Adding Sidebar to a New Page

1. Import `Sidebar` and required contexts
2. Add sidebar state (`sidebarOpen`, `sidebarCollapsed`, `showDownloadOptions`)
3. Pass all required props (see table above)
4. Implement `handleExport` for page-specific exports
5. Import or match layout CSS from an existing page (e.g. `Homepage.css`)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Sidebar empty | Ensure `currentUser` is passed from `AuthContext` |
| Nav click does nothing | Wire `onDashboardClick`, etc. with `navigate()` |
| Wrong active highlight | Check route path matches `Sidebar.js` path checks |
| Export not working | Implement `handleExport` on the parent page |
| Styling broken | Import `Sidebar.css`; check layout wrapper classes |

## Related

- [README.md](./README.md) — routes and roles
- `src/contexts/LanguageContext.js` — language toggle
- `src/contexts/NotificationContext.js` — activation badge
