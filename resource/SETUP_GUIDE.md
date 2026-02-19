# Ergovia Lite Marketing Page - Setup Guide

## Overview

This is a high-converting landing page for the Ergovia Lite AI Vacation Rental Management System.

**Price Point:** $297/month
**Key Selling Angle:** Costs less than a VA ($4/hr × 4hrs × 5 days = $320/mo) but works 24/7

---

## Files Structure

```
marketing-page/
├── index.html      # Main landing page
├── styles.css      # All styling (dark theme, premium look)
├── script.js       # Interactions & Lemon Squeezy integration
└── SETUP_GUIDE.md  # This file
```

---

## Quick Start

1. Open `index.html` in a browser to preview
2. Deploy to your hosting (Vercel, Netlify, or any static host)
3. Configure Lemon Squeezy (see below)

---

## Lemon Squeezy Integration

### Step 1: Create Your Product

1. Go to [Lemon Squeezy](https://lemonsqueezy.com) and sign in
2. Create a new **Product**:
   - Name: `Ergovia Lite Monthly`
   - Price: `$297` (recurring monthly)
   - Description: AI-powered vacation rental management
3. Note your **Product ID** or **Checkout URL**

### Step 2: Update the Checkout URL

In `script.js`, find this line and replace with your actual URL:

```javascript
const LEMON_SQUEEZY_CHECKOUT_URL = 'https://ergovia.lemonsqueezy.com/checkout/buy/YOUR_PRODUCT_ID';
```

Replace `YOUR_PRODUCT_ID` with your actual Lemon Squeezy product ID.

### Step 3: Optional - Enable Overlay Checkout

For a smoother checkout experience (popup instead of redirect), uncomment this section at the bottom of `script.js`:

```javascript
(function() {
    var script = document.createElement('script');
    script.src = 'https://app.lemonsqueezy.com/js/lemon.js';
    script.defer = true;
    document.head.appendChild(script);
})();
```

Then change the checkout button handler to:
```javascript
LemonSqueezy.Url.Open(LEMON_SQUEEZY_CHECKOUT_URL);
```

---

## Customization

### Change Pricing

1. In `index.html`, search for `297` and update all instances
2. Update the VA comparison math if needed

### Change Branding

1. Logo: Search for `Ergovia` in `index.html`
2. Colors: Edit CSS variables in `styles.css`:
   ```css
   :root {
       --primary: #6366f1;      /* Main purple */
       --primary-dark: #4f46e5;
       --primary-light: #818cf8;
   }
   ```

### Update Testimonials

Edit the testimonial cards in `index.html` under the `.testimonials-section`

### Change Contact Email

Search for `hello@ergovia.ai` and replace with your email

---

## Analytics Setup

### Google Analytics

Add this before `</head>`:

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Facebook Pixel

Add this before `</head>`:

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'YOUR_PIXEL_ID');
fbq('track', 'PageView');
</script>
```

---

## Deployment

### Vercel (Recommended)

```bash
npm i -g vercel
cd marketing-page
vercel
```

### Netlify

1. Drag and drop the `marketing-page` folder to netlify.com/drop
2. Or connect to Git for automatic deploys

### Custom Domain

After deploying, add your custom domain:
- `ergovia.ai` or `getergovia.com`

---

## Conversion Optimization Tips

### A/B Testing Ideas

1. **Headline variations:**
   - "Your 24/7 AI Concierge That Never Sleeps"
   - "Stop Losing Bookings to Slow Responses"
   - "The AI That Manages Your Rental While You Sleep"

2. **CTA button text:**
   - "Start Free Trial"
   - "Get Started Now"
   - "Try 14 Days Free"

3. **Price presentation:**
   - "$297/month" vs "Less than $10/day"
   - With/without crossed out "was $497"

### Social Proof Enhancements

- Add real customer photos
- Include video testimonials
- Show real booking numbers
- Add trust badges (SSL, Money-back guarantee)

### Urgency Tactics (Use Sparingly)

- Limited time pricing
- Spots remaining counter
- "Join 200+ property owners" with live counter

---

## Mobile Optimization

The page is fully responsive. Test on:
- iPhone SE (small)
- iPhone 14 Pro (standard)
- iPad (tablet)
- Desktop (1200px+)

---

## SEO Checklist

- [x] Meta title and description (add to `<head>`)
- [ ] Open Graph tags for social sharing
- [ ] Structured data (LocalBusiness schema)
- [ ] Alt text for all images
- [ ] Fast loading (images optimized)

Add this to `<head>`:

```html
<title>Ergovia Lite | AI-Powered Vacation Rental Management</title>
<meta name="description" content="24/7 AI concierge for vacation rentals. Handle guest inquiries, bookings, and payments automatically. Less than a VA, works 24/7. Try free for 14 days.">

<!-- Open Graph -->
<meta property="og:title" content="Ergovia Lite - AI Vacation Rental Manager">
<meta property="og:description" content="Your 24/7 AI concierge that handles guest inquiries, bookings, and payments. Start your free trial today.">
<meta property="og:image" content="https://ergovia.ai/og-image.jpg">
<meta property="og:url" content="https://ergovia.ai">
<meta property="og:type" content="website">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Ergovia Lite - AI Vacation Rental Manager">
<meta name="twitter:description" content="24/7 AI concierge for your vacation rental business.">
<meta name="twitter:image" content="https://ergovia.ai/twitter-card.jpg">
```

---

## Support

For questions about this marketing page:
- Technical issues: Check browser console for errors
- Design changes: Edit `styles.css`
- Content changes: Edit `index.html`

---

## Changelog

- **v1.0** (Feb 2026) - Initial release
  - Premium dark theme design
  - VA vs AI comparison section
  - Lemon Squeezy integration ready
  - Mobile responsive
  - Animated hero section
  - Testimonials section
  - FAQ section
