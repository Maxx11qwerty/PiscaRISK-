# PiscaRisk Deployment Guide

This guide provides comprehensive instructions for deploying the PiscaRisk application to various hosting platforms with security headers properly configured.

## 🚀 Deployment Options

### Prerequisites
- Completed application build: `npm run build`
- Firebase project configured
- Domain name (optional but recommended for production)
- SSL certificate (HTTPS required for security headers)

### **Option 1: Render.com (Recommended)**

Render.com is the recommended hosting platform as it automatically applies security headers from the `render.json` configuration.

1. **Create Render.com account** and connect your Git repository

2. **Create Static Site**:
   - Build Command: `npm run build:render`
   - Publish Directory: `build`
   - Auto-Deploy: Yes

3. **Configure Environment Variables** (if needed):
   - `REACT_APP_FIREBASE_API_KEY`
   - `REACT_APP_FIREBASE_PROJECT_ID`
   - Other Firebase config variables

4. **Use the `render.json` file** - This automatically applies security headers

5. **Deploy** - Render will handle the rest automatically

**Benefits**:
- Automatic SSL/HTTPS
- Built-in CDN
- Custom domain support
- Automatic deployments on git push

### **Option 2: Custom Express Server**

Deploy with the included Express server that handles security headers server-side.

**Local Testing**:
```bash
npm run build
npm run server
```

**Production Deployment**:

1. **Install PM2** (process manager):
   ```bash
   npm install -g pm2
   ```

2. **Build the application**:
   ```bash
   npm run build
   ```

3. **Start with PM2**:
   ```bash
   pm2 start server.js --name piscarisk
   pm2 save
   pm2 startup
   ```

4. **Configure Nginx** (as reverse proxy):
   ```nginx
   server {
       listen 80;
       server_name piscarisk.com;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl;
       server_name piscarisk.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### **Option 3: Apache Server**

1. **Upload build folder** to Apache web root (usually `/var/www/html`)

2. **Ensure mod_headers and mod_rewrite are enabled:**
   ```bash
   sudo a2enmod headers
   sudo a2enmod rewrite
   sudo systemctl restart apache2
   ```

3. **Configure SSL** (Let's Encrypt recommended):
   ```bash
   sudo apt install certbot python3-certbot-apache
   sudo certbot --apache -d piscarisk.com
   ```

4. **Copy `.htaccess`** from project root to web root (if not already present)

### **Option 4: IIS Server (Windows)**

1. **Install URL Rewrite module** for IIS

2. **Deploy build folder** to IIS wwwroot

3. **Copy `web.config`** to web root if not already present

4. **Configure SSL**:
   - Install SSL certificate in IIS Manager
   - Bind HTTPS to your site
   - Force HTTPS redirect

### **Option 5: Firebase Hosting**

1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Build and deploy**:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

**Benefits**:
- Automatic SSL
- Global CDN
- Custom domain support
- Easy rollback

## 🔍 Verifying Security Headers

### **Browser Developer Tools:**
1. Open Developer Tools (F12)
2. Go to Network tab
3. Reload the page
4. Click on the main document request
5. Check Response Headers for:
   - `Content-Security-Policy`
   - `X-Frame-Options`
   - `Referrer-Policy`
   - `Permissions-Policy`
   - `Strict-Transport-Security`

### **Online Security Headers Check:**
- Visit: https://securityheaders.com/
- Enter your domain: `https://piscarisk.onrender.com/`
- Check the security score

### **OWASP ZAP Scan:**
- Run a new scan after deployment
- Check for the specific headers mentioned in your OWASP report

## 🛠️ Troubleshooting

### **Headers Not Showing:**
1. **Clear browser cache** completely
2. **Hard refresh** (Ctrl+F5)
3. **Check server configuration** - Ensure the hosting platform supports the header method you're using
4. **Verify deployment** - Make sure the configuration files are deployed

### **CSP Blocking Resources:**
1. **Check browser console** for CSP violations
2. **Add missing domains** to the CSP policy
3. **Test with CSP report-only mode** first

### **Weather API Issues:**
- The CSP includes `https://api.openweathermap.org` in `connect-src`
- If still blocked, check for typos or caching issues
- Verify API key is correctly set in environment variables

### **Authentication Issues:**
- Verify Firebase configuration is correctly set
- Check Firebase console for proper Authentication setup
- Ensure all sign-in methods are enabled
- Verify authorized domains are configured

### **Static Assets Not Loading:**
- Check file paths (should be relative)
- Verify build output includes all assets
- Check CSP media-src and img-src directives

## 📋 Security Headers Checklist

- [ ] Content-Security-Policy ✓
- [ ] X-Frame-Options ✓
- [ ] Referrer-Policy ✓
- [ ] Permissions-Policy ✓
- [ ] Strict-Transport-Security ✓
- [ ] X-Content-Type-Options ✓
- [ ] X-XSS-Protection ✓

## 🔄 After Deployment

1. **Test the weather functionality** - Should work without CSP errors
2. **Run OWASP scan** - Should show improved security score
3. **Verify all headers** are present in response
4. **Test on different browsers** to ensure compatibility

## 📞 Support

If you encounter issues:
1. Check the browser console for errors
2. Verify the deployment method matches your hosting platform
3. Test with the security headers checker tool
4. Ensure all configuration files are properly deployed
