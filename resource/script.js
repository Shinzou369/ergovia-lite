/* ============================================
   ERGOVIA LITE - Marketing Page Scripts
   ============================================ */

document.addEventListener('DOMContentLoaded', function() {

    // ============================================
    // LEMON SQUEEZY CHECKOUT INTEGRATION
    // ============================================

    // Replace with your actual Lemon Squeezy product URL
    const LEMON_SQUEEZY_CHECKOUT_URL = 'https://ergovia.lemonsqueezy.com/checkout/buy/YOUR_PRODUCT_ID';

    // Checkout button handler
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function(e) {
            e.preventDefault();

            // Option 1: Redirect to Lemon Squeezy checkout
            window.open(LEMON_SQUEEZY_CHECKOUT_URL, '_blank');

            // Option 2: Use Lemon Squeezy overlay (if using their JS SDK)
            // LemonSqueezy.Url.Open(LEMON_SQUEEZY_CHECKOUT_URL);

            // Track conversion event (for analytics)
            if (typeof gtag !== 'undefined') {
                gtag('event', 'begin_checkout', {
                    currency: 'USD',
                    value: 297,
                    items: [{
                        item_name: 'Ergovia Lite Monthly',
                        price: 297
                    }]
                });
            }
        });
    }

    // All CTA buttons that lead to checkout
    document.querySelectorAll('a[href="#checkout"], a[href="#pricing"]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            // Smooth scroll to pricing/checkout section
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // ============================================
    // NAVBAR SCROLL EFFECT
    // ============================================

    const navbar = document.querySelector('.navbar');
    let lastScroll = 0;

    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;

        // Add shadow on scroll
        if (currentScroll > 50) {
            navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
            navbar.style.background = 'rgba(3, 7, 18, 0.95)';
        } else {
            navbar.style.boxShadow = 'none';
            navbar.style.background = 'rgba(3, 7, 18, 0.8)';
        }

        lastScroll = currentScroll;
    });

    // ============================================
    // SMOOTH SCROLL FOR ANCHOR LINKS
    // ============================================

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const navHeight = navbar.offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ============================================
    // INTERSECTION OBSERVER FOR ANIMATIONS
    // ============================================

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const fadeInObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                fadeInObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Add fade-in animation to elements
    const animateElements = document.querySelectorAll(
        '.problem-card, .feature-card, .step, .comparison-card, .testimonial-card, .faq-item'
    );

    animateElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        fadeInObserver.observe(el);
    });

    // Add visible class styles
    const style = document.createElement('style');
    style.textContent = `
        .visible {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);

    // ============================================
    // COVERAGE BAR ANIMATION
    // ============================================

    const coverageObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const fills = entry.target.querySelectorAll('.coverage-fill');
                fills.forEach(fill => {
                    const width = fill.style.width;
                    fill.style.width = '0';
                    setTimeout(() => {
                        fill.style.width = width;
                    }, 300);
                });
                coverageObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const comparisonSection = document.querySelector('.comparison-section');
    if (comparisonSection) {
        coverageObserver.observe(comparisonSection);
    }

    // ============================================
    // TYPING ANIMATION IN PHONE MOCKUP
    // ============================================

    const typingMessage = document.querySelector('.message.typing');
    const chatMessages = document.querySelector('.chat-messages');

    if (typingMessage && chatMessages) {
        // Simulate AI response after typing
        setTimeout(function() {
            const aiResponse = document.createElement('div');
            aiResponse.className = 'message ai';
            aiResponse.innerHTML = `
                <p>I've reserved March 15-20 for you! Here's your payment link:</p>
                <p style="background: rgba(99, 102, 241, 0.3); padding: 10px; border-radius: 8px; margin: 8px 0;">
                    pay.ergovia.ai/b/xyz123
                </p>
                <p>Once paid, you'll receive instant confirmation. Secure checkout powered by Lemon Squeezy.</p>
                <span class="time">2:35 PM ✓✓</span>
            `;

            // Replace typing indicator with actual message
            typingMessage.replaceWith(aiResponse);

            // Add entrance animation
            aiResponse.style.opacity = '0';
            aiResponse.style.transform = 'translateY(10px)';
            setTimeout(() => {
                aiResponse.style.transition = 'all 0.3s ease';
                aiResponse.style.opacity = '1';
                aiResponse.style.transform = 'translateY(0)';
            }, 50);

        }, 3000);
    }

    // ============================================
    // STATS COUNTER ANIMATION
    // ============================================

    const statsObserver = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateStats();
                statsObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    const heroStats = document.querySelector('.hero-stats');
    if (heroStats) {
        statsObserver.observe(heroStats);
    }

    function animateStats() {
        // The stats are already set, but we could animate numbers if needed
        const statNumbers = document.querySelectorAll('.stat-number');
        statNumbers.forEach(stat => {
            stat.style.opacity = '0';
            stat.style.transform = 'scale(0.5)';
            setTimeout(() => {
                stat.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
                stat.style.opacity = '1';
                stat.style.transform = 'scale(1)';
            }, 100);
        });
    }

    // ============================================
    // FLOATING CARDS PARALLAX EFFECT
    // ============================================

    const floatingCards = document.querySelectorAll('.float-card');

    if (floatingCards.length && window.innerWidth > 1024) {
        window.addEventListener('mousemove', function(e) {
            const mouseX = e.clientX / window.innerWidth - 0.5;
            const mouseY = e.clientY / window.innerHeight - 0.5;

            floatingCards.forEach((card, index) => {
                const speed = (index + 1) * 20;
                const x = mouseX * speed;
                const y = mouseY * speed;

                card.style.transform = `translate(${x}px, ${y}px)`;
            });
        });
    }

    // ============================================
    // MOBILE MENU TOGGLE (if needed)
    // ============================================

    // Could add hamburger menu for mobile here

    // ============================================
    // FORM VALIDATION (if contact form added)
    // ============================================

    // Could add email validation here

    // ============================================
    // UTM PARAMETER TRACKING
    // ============================================

    function getUTMParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            utm_source: params.get('utm_source'),
            utm_medium: params.get('utm_medium'),
            utm_campaign: params.get('utm_campaign'),
            utm_content: params.get('utm_content'),
            utm_term: params.get('utm_term')
        };
    }

    // Store UTM params in session storage for checkout
    const utmParams = getUTMParams();
    if (Object.values(utmParams).some(v => v)) {
        sessionStorage.setItem('utm_params', JSON.stringify(utmParams));
    }

    // ============================================
    // TESTIMONIAL CAROUSEL (optional enhancement)
    // ============================================

    // Auto-rotate testimonials on mobile
    if (window.innerWidth <= 768) {
        const testimonials = document.querySelectorAll('.testimonial-card');
        let currentTestimonial = 0;

        if (testimonials.length > 1) {
            testimonials.forEach((t, i) => {
                if (i > 0) t.style.display = 'none';
            });

            setInterval(() => {
                testimonials[currentTestimonial].style.display = 'none';
                currentTestimonial = (currentTestimonial + 1) % testimonials.length;
                testimonials[currentTestimonial].style.display = 'block';
                testimonials[currentTestimonial].style.animation = 'fadeIn 0.5s ease';
            }, 5000);
        }
    }

    // ============================================
    // CONSOLE EASTER EGG
    // ============================================

    console.log('%c Ergovia Lite ', 'background: linear-gradient(135deg, #6366f1, #a855f7); color: white; font-size: 24px; padding: 10px 20px; border-radius: 8px;');
    console.log('%c We\'re hiring! hello@ergovia.ai ', 'color: #6366f1; font-size: 14px;');

});

// ============================================
// LEMON SQUEEZY SDK LOADER (Optional)
// ============================================

// Uncomment this to use Lemon Squeezy's overlay checkout
/*
(function() {
    var script = document.createElement('script');
    script.src = 'https://app.lemonsqueezy.com/js/lemon.js';
    script.defer = true;
    document.head.appendChild(script);
})();
*/
