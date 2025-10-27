# PiscaRISK Web Application

## Overview
PiscaRISK is a comprehensive web application for managing fish farming operations, including weather monitoring, pond conditions, user management, and reporting. Built with React.js and Firebase, it provides real-time data monitoring, risk assessment, and comprehensive user management capabilities.

This project demonstrates modern web development practices, secure authentication, role-based access control, and integration with third-party APIs for weather monitoring.

## Features

### User Management & Authentication
- **Multiple User Roles**: 
  - Tech Officer (main administrative role with full system access)
  - Farm Admin (admin assigned to a specific farm)
  - Temporary Tech Officer (limited-time admin access)
  - New Main Tech Officer (tech officer being promoted)
  - Fish Farmer (mobile-optimized for field operations)
- **Login Method**:
  - Email/Username and Password
  - Phone Number and Password
- **Email Verification**: All users must verify their email before accessing the dashboard
- **Phone Verification**: Mandatory OTP verification on first login to verify phone number
- **Account Status Management**: Active, Inactive, Suspended states
- **Session Persistence**: Enhanced cross-tab session management
- **Phone Number Support**: Philippine mobile number validation and formatting

### Password Management
- **Password Reset**: Tech Officers and Administrators can reset user passwords
- **Firebase Email Reset**: Integrated with Firebase Authentication for secure password reset
- **Secure Password Generation**: System generates secure random passwords when needed
- **Password Strength Validation**: Ensures strong password requirements
- **Forgot Password Flow**: Self-service password reset via email
- **Password Change**: Secure password updates in profile settings

#### Password Requirements
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)
- At least one special character (!@#$%^&*)

### Weather Monitoring
- Real-time weather data integration via OpenWeatherMap API
- Historical weather tracking
- Weather alerts and notifications
- Visual weather displays with icons and animations

### Pond Management & Monitoring
- Pond condition monitoring dashboard
- Water quality parameters tracking
- Fish health indicators and risk assessment
- Risk reports and analytics
- Ponds at risk stacked charts
- Farm health gauge visualization

### Reporting & Analytics
- Comprehensive data export (PDF/CSV formats)
- Interactive chart visualizations
- Historical data analysis
- Export capabilities for:
  - Account data
  - Pond conditions
  - Risk reports
  - Logs and activity
  - Health gauge data
  - Feedback data

### UI/UX Features
- Responsive design for mobile and desktop
- Sidebar navigation component
- Bilingual support (English/Tagalog)
- Night mode (coming soon)
- Toast notifications
- Animated modals and transitions
- Export data options (PDF/CSV)

## Technical Architecture

### Frontend
- **React.js 19.1.0** with modern hooks and context API
- **React Router 7.5.0** for navigation and protected routes
- **Material-UI (MUI) 7.3.4** for UI components
- **Framer Motion 12.16.0** for animations
- **i18next** for internationalization (English/Tagalog)
- **Recharts 2.15.3** for data visualizations
- **React Icons** for iconography
- Responsive design for mobile and desktop

### Backend & Services
- **Firebase 10.12.0** (Firestore database, Authentication, Cloud Functions)
- **Express 4.21.2** server for backend operations
- **Firebase Admin SDK** for server-side operations
- **Google Cloud reCAPTCHA Enterprise** for bot protection
- **OpenWeatherMap API** for weather data

### Key Components & Utilities
- **Contexts**: AuthContext, FarmsContext, LanguageContext, NotificationContext
- **Services**: accountService, riskDataService, weatherService
- **Utils**: Secure storage, routing, sanitization, logging, export utilities
- **Components**: Sidebar, WeatherBox, PondConditionDashboard, RiskReportModal, and more

### Security Features
- **Content Security Policy (CSP)**: Comprehensive CSP headers
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, HSTS, etc.
- **Email Verification**: Mandatory for all users
- **Secure Storage**: Sanitized localStorage with validation
- **Input Sanitization**: All user inputs are sanitized
- **Secure Routing**: URL parameter sanitization
- **Activity Logging**: Comprehensive audit trails
- **Role-Based Access Control**: Detailed permissions per role
- **Session Management**: Enhanced persistence with IndexedDB

## Installation and Setup

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- Firebase project with Firestore enabled
- Google Cloud Platform account for Cloud Functions

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd piska-risk
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Firebase**
   - Set up Firebase project at https://console.firebase.google.com
   - Enable Authentication (Email/Password only)
   - Create Firestore database
   - Enable Cloud Functions

4. **Set up Firebase credentials**
   - Add `serviceAccountKey.json` to project root (for Cloud Functions)
   - Update `src/firebase.js` with your Firebase config

5. **Deploy Cloud Functions** (optional, for production)
   ```bash
   cd functions
   npm install
   cd ..
   firebase deploy --only functions
   ```

6. **Configure CSP** (automatic on build)
   ```bash
   node scripts/set-csp.js
   ```

7. **Start development server**
   ```bash
   npm start
   ```

8. **Build for production**
   ```bash
   npm run build
   ```

## Usage

### For Tech Officers
- **Account Management**: Create, update, activate/deactivate user accounts
- **Password Reset**: Reset passwords for any user via Firebase email reset
- **Farm Assignment**: Assign users to farms during user creation
- **Role Management**: Change user roles and permissions
- **Monitor Activity**: View logs and activity reports
- **Export Data**: Export user accounts and activity data

### For Farm Admins
- **Account Management**: Manage users within assigned farm
- **Pond Monitoring**: Access pond condition dashboard for assigned farm
- **Risk Reports**: View and analyze risk assessments for assigned farm
- **Weather Monitoring**: Real-time weather data
- **Create Accounts**: Add Fish Farmers to assigned farm
- **Limited Access**: Cannot create other admins or tech officers

### For Fish Farmers
- **Mobile Access**: Optimized for mobile field operations
- **Pond Data Entry**: Submit pond condition data
- **Feedback**: Submit feedback and reports
- **View Dashboard**: Access farm-specific information

### Login Process
1. **Enter Credentials**: Login with email/username or phone number and password
2. **Email Verification**: Must have verified email to access dashboard
3. **OTP Verification**: On first login, complete OTP verification to verify phone number
4. **Access Dashboard**: Use sidebar to navigate features
5. **Language Selection**: Switch between English and Tagalog

### Signup Process
1. **Choose Farm**: Select the farm you are assigned to during registration
2. **Enter Details**: Provide email, username, password, and phone number
3. **Email Verification**: Verify your email address
4. **Account Activation**: Wait for Tech Officer to activate your account
5. **First Login**: Complete OTP verification for phone number verification
6. **Access Dashboard**: Start using the system

## Security Considerations

### Authentication & Authorization
- Email verification required for all users before dashboard access
- Phone number verification via mandatory OTP on first login
- Strong password requirements enforced
- Role-based access control (RBAC)
- Session management with enhanced persistence

### Data Protection
- Passwords never stored in plain text
- All user inputs sanitized
- Secure localStorage with validation
- Content Security Policy (CSP) headers
- XSS and clickjacking protection
- MIME type sniffing prevention

### Security Headers
- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security
- Referrer-Policy
- Permissions-Policy

### Audit & Logging
- All password operations logged
- Activity tracking for sensitive operations
- User action audit trails
- Error logging and monitoring

## Available Scripts

- `npm start` - Start development server with CSP configuration
- `npm run build` - Build for production
- `npm run build:strict` - Build with strict CSP for production
- `npm test` - Run tests
- `npm run server` - Start Express server
- `npm run dev` - Start both server and React (concurrently)
- `npm run deploy:security` - Build and deploy with security headers

## Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed deployment instructions for:
- Render.com (recommended)
- Custom Express Server
- Apache Server
- IIS Server
- Firebase Hosting

## Additional Documentation

- [Authentication Flow](./AUTHENTICATION_FLOW_UPDATE.md) - Authentication implementation details
- [Email Verification](./EMAIL_VERIFICATION_FLOW.md) - Email verification flow
- [User Migration](./EXISTING_USERS_MIGRATION.md) - Handling existing users
- [Security Guide](./SECURITY_GUIDE.md) - Security implementations
- [Sidebar Usage](./SIDEBAR_USAGE_GUIDE.md) - Sidebar component documentation

## Support

For technical support or questions:
- Email: security@piscarisk.onrender.com
- Security Policy: https://piscarisk.onrender.com/security-policy
- Security.txt: https://piscarisk.onrender.com/.well-known/security.txt

## License

All Rights Reserved