# Security Headers Troubleshooting Guide

## Issue: Headers Not Appearing After Deployment

### Common Causes and Solutions

#### 1. Firebase Hosting Configuration Issues

**Problem**: Headers defined in `firebase.json` are not being applied.

**Solutions**:
- Verify `firebase.json` syntax is correct
- Ensure the `hosting` section is properly configured
- Check that the `source` pattern matches your files (`**` for all files)
- Redeploy after making changes: `firebase deploy --only hosting`

**Debug Steps**:
```bash
# Check Firebase configuration
firebase hosting:channel:list

# Deploy with verbose output
firebase deploy --only hosting --debug

# Check if headers are in the deployed configuration
firebase hosting:channel:open live
```

#### 2. Caching Issues

**Problem**: Old responses are cached and new headers aren't visible.

**Solutions**:
- Clear browser cache (Ctrl+Shift+R)
- Use incognito/private browsing mode
- Wait 5-10 minutes for CDN cache to clear
- Use different browsers for testing

**Debug Steps**:
```bash
# Test with curl to bypass browser cache
curl -I https://your-site.com/

# Test with different user agents
curl -I -H "User-Agent: Mozilla/5.0" https://your-site.com/
```

#### 3. Platform-Specific Issues

##### Firebase Hosting
- Headers must be defined in `firebase.json`
- Some headers may be overridden by Firebase's own security policies
- Check Firebase Console for any security policy conflicts

##### Netlify
- Headers must be in `_headers` file in the root or `public` directory
- File must be deployed with the site
- Check Netlify dashboard for header configuration

##### Vercel
- Headers can be in `vercel.json` or `_headers` file
- Check Vercel dashboard for configuration

##### Render.com
- Headers should be in `web.config` (Windows) or server configuration
- May require custom server setup

#### 4. Configuration Format Issues

**Problem**: Incorrect header format or syntax.

**Common Mistakes**:
- Missing quotes around header values
- Incorrect JSON syntax in `firebase.json`
- Wrong file format for `_headers` file
- Missing semicolons in CSP

**Correct Formats**:

Firebase.json:
```json
{
  "hosting": {
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "Strict-Transport-Security",
            "value": "max-age=31536000; includeSubDomains; preload"
          }
        ]
      }
    ]
  }
}
```

_headers file:
```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Content-Security-Policy: default-src 'self'
```

#### 5. Testing and Verification

**Manual Testing**:
1. Open browser Developer Tools (F12)
2. Go to Network tab
3. Reload the page
4. Click on the main document request
5. Check Response Headers section

**Automated Testing**:
```bash
# Run the provided test script
node test-security-headers.js

# Test specific headers
curl -I https://your-site.com/ | grep -i "strict-transport-security"
curl -I https://your-site.com/ | grep -i "content-security-policy"
curl -I https://your-site.com/ | grep -i "x-frame-options"
```

**Online Tools**:
- [Security Headers](https://securityheaders.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [SSL Labs](https://www.ssllabs.com/ssltest/)

#### 6. Debugging Steps

1. **Check Configuration Files**:
   - Verify all configuration files exist
   - Check syntax with JSON validators
   - Ensure proper file permissions

2. **Test Locally**:
   - Run local server and test headers
   - Use `curl` or `wget` to test
   - Check server logs for errors

3. **Check Deployment**:
   - Verify deployment was successful
   - Check hosting platform logs
   - Test on different devices/networks

4. **Monitor Browser Console**:
   - Look for CSP violations
   - Check for any security warnings
   - Monitor network requests

#### 7. Platform-Specific Debugging

##### Firebase Hosting
```bash
# Check Firebase CLI version
firebase --version

# Check hosting configuration
firebase hosting:channel:list

# Deploy with debug info
firebase deploy --only hosting --debug

# Check if site is properly configured
firebase hosting:channel:open live
```

##### Netlify
```bash
# Check Netlify CLI
netlify --version

# Check site configuration
netlify status

# Deploy with debug info
netlify deploy --prod --debug
```

##### Render.com
- Check Render dashboard for deployment logs
- Verify environment variables
- Check if custom server is running

#### 8. Common Error Messages and Solutions

**"Headers not found"**:
- Check if configuration file is in correct location
- Verify file syntax
- Ensure deployment included the configuration

**"CSP violations"**:
- Check browser console for specific violations
- Adjust CSP policy to allow required resources
- Test with report-only mode first

**"Mixed content warnings"**:
- Ensure all resources use HTTPS
- Update any HTTP URLs to HTTPS
- Check for hardcoded HTTP links

#### 9. Emergency Rollback

If headers cause issues:
1. Revert to previous configuration
2. Deploy immediately
3. Test functionality
4. Fix issues in development
5. Redeploy when ready

#### 10. Getting Help

If issues persist:
1. Check hosting platform documentation
2. Review security header specifications
3. Test with minimal configuration first
4. Contact hosting platform support
5. Check community forums for similar issues

## Quick Fix Checklist

- [ ] Configuration files exist and are syntactically correct
- [ ] Headers are properly formatted
- [ ] Deployment was successful
- [ ] Browser cache is cleared
- [ ] Testing with multiple browsers
- [ ] Checking online security tools
- [ ] Monitoring browser console for errors
- [ ] Testing on different devices/networks
