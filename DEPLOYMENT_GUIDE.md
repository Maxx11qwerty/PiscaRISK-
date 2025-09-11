# PiscaRisk Security Headers Deployment Guide

## 🚀 Deployment Options for Security Headers

### **Option 1: Render.com (Recommended)**

1. **Use the `render.json` file** - This automatically applies security headers
2. **Deploy as Static Site** - Render will use the headers from `render.json`
3. **No additional configuration needed**

### **Option 2: Custom Express Server**

1. **Install dependencies:**
   ```bash
   npm install express
   ```

2. **Build and run:**
   ```bash
   npm run build
   npm run server
   ```

3. **Deploy the entire project** including `server.js`

### **Option 3: Apache Server**

1. **Use the `.htaccess` file** - Place it in your web root
2. **Ensure mod_headers is enabled:**
   ```bash
   sudo a2enmod headers
   sudo systemctl restart apache2
   ```

### **Option 4: IIS Server**

1. **Use the `web.config` file** - Place it in your web root
2. **No additional configuration needed**

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
