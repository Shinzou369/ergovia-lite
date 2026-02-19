/* ============================================
   ERGOVIA LITE - Marketing Page Scripts
   Connected to Backend API
   ============================================ */

document.addEventListener('DOMContentLoaded', function() {

    // ============================================
    // CONFIGURATION
    // ============================================

    const CONFIG = {
        // Backend API URL - Change this in production
        API_URL: window.location.hostname === 'localhost'
            ? 'http://localhost:3000'
            : 'https://api.ergovia.ai',

        // Lemon Squeezy Product ID
        PRODUCT_ID: 'YOUR_PRODUCT_ID',

        // Direct checkout URL (fallback)
        CHECKOUT_URL: 'https://ergovia.lemonsqueezy.com/checkout/buy/YOUR_PRODUCT_ID'
    };

    // ============================================
    // API HELPER FUNCTIONS
    // ============================================

    async function apiCall(endpoint, method = 'GET', data = null) {
        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'API request failed');
            }

            return result;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // ============================================
    // LEAD CAPTURE MODAL
    // ============================================

    function createLeadCaptureModal() {
        const modal = document.createElement('div');
        modal.id = 'lead-capture-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <button class="modal-close">&times;</button>
                <div class="modal-header">
                    <h3>Start Your Free Trial</h3>
                    <p>Enter your email to get started</p>
                </div>
                <form id="lead-capture-form">
                    <div class="form-group">
                        <label for="lead-email">Email Address *</label>
                        <input type="email" id="lead-email" name="email" required placeholder="you@example.com">
                    </div>
                    <div class="form-group">
                        <label for="lead-name">Your Name</label>
                        <input type="text" id="lead-name" name="name" placeholder="John Doe">
                    </div>
                    <div class="form-group">
                        <label for="lead-properties">How many properties do you manage?</label>
                        <select id="lead-properties" name="propertyCount">
                            <option value="1">1 property</option>
                            <option value="2-5">2-5 properties</option>
                            <option value="6-10">6-10 properties</option>
                            <option value="10+">10+ properties</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-primary btn-full" id="submit-lead-btn">
                        <span>Continue to Checkout</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                    <p class="form-note">No credit card required for trial</p>
                </form>
                <div id="form-loading" style="display: none;">
                    <div class="spinner"></div>
                    <p>Creating your checkout...</p>
                </div>
                <div id="form-error" style="display: none;">
                    <p class="error-message"></p>
                    <button class="btn btn-secondary" id="retry-btn">Try Again</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add modal styles
        const modalStyles = document.createElement('style');
        modalStyles.textContent = `
            .modal {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 10000;
                align-items: center;
                justify-content: center;
            }
            .modal.active {
                display: flex;
            }
            .modal-overlay {
                position: absolute;
                inset: 0;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(4px);
            }
            .modal-content {
                position: relative;
                background: linear-gradient(145deg, #1a1a2e 0%, #0f0f1a 100%);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 20px;
                padding: 40px;
                max-width: 440px;
                width: 90%;
                box-shadow: 0 25px 50px rgba(0,0,0,0.5);
            }
            .modal-close {
                position: absolute;
                top: 16px;
                right: 16px;
                background: none;
                border: none;
                color: #9ca3af;
                font-size: 28px;
                cursor: pointer;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s;
            }
            .modal-close:hover {
                background: rgba(255,255,255,0.1);
                color: white;
            }
            .modal-header {
                text-align: center;
                margin-bottom: 32px;
            }
            .modal-header h3 {
                font-size: 28px;
                font-weight: 700;
                color: white;
                margin-bottom: 8px;
            }
            .modal-header p {
                color: #9ca3af;
                font-size: 16px;
            }
            .form-group {
                margin-bottom: 20px;
            }
            .form-group label {
                display: block;
                font-size: 14px;
                font-weight: 500;
                color: #d1d5db;
                margin-bottom: 8px;
            }
            .form-group input,
            .form-group select {
                width: 100%;
                padding: 14px 16px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 10px;
                color: white;
                font-size: 16px;
                transition: all 0.2s;
            }
            .form-group input:focus,
            .form-group select:focus {
                outline: none;
                border-color: #6366f1;
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
            }
            .form-group input::placeholder {
                color: #6b7280;
            }
            .form-group select option {
                background: #1a1a2e;
                color: white;
            }
            .form-note {
                text-align: center;
                font-size: 13px;
                color: #6b7280;
                margin-top: 16px;
            }
            .spinner {
                width: 40px;
                height: 40px;
                border: 3px solid rgba(99, 102, 241, 0.2);
                border-top-color: #6366f1;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 16px;
            }
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            #form-loading,
            #form-error {
                text-align: center;
                padding: 20px;
            }
            .error-message {
                color: #ef4444;
                margin-bottom: 16px;
            }
        `;
        document.head.appendChild(modalStyles);

        return modal;
    }

    // Initialize modal
    const modal = createLeadCaptureModal();
    const modalOverlay = modal.querySelector('.modal-overlay');
    const modalClose = modal.querySelector('.modal-close');
    const leadForm = document.getElementById('lead-capture-form');
    const formLoading = document.getElementById('form-loading');
    const formError = document.getElementById('form-error');

    function openModal() {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        // Track modal open
        if (typeof gtag !== 'undefined') {
            gtag('event', 'modal_open', { event_category: 'engagement' });
        }
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        // Reset form state
        leadForm.style.display = 'block';
        formLoading.style.display = 'none';
        formError.style.display = 'none';
    }

    modalOverlay.addEventListener('click', closeModal);
    modalClose.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // ============================================
    // CHECKOUT FLOW
    // ============================================

    // Handle lead form submission
    leadForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = document.getElementById('lead-email').value;
        const name = document.getElementById('lead-name').value;
        const propertyCount = document.getElementById('lead-properties').value;

        // Show loading state
        leadForm.style.display = 'none';
        formLoading.style.display = 'block';

        try {
            // Call backend to create checkout session
            const result = await apiCall('/api/create-checkout', 'POST', {
                email,
                name,
                propertyCount
            });

            if (result.checkoutUrl) {
                // Track conversion
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'begin_checkout', {
                        currency: 'USD',
                        value: 297,
                        items: [{ item_name: 'Ergovia Lite Monthly', price: 297 }]
                    });
                }

                // Redirect to checkout
                window.location.href = result.checkoutUrl;
            } else {
                throw new Error('No checkout URL received');
            }

        } catch (error) {
            console.error('Checkout error:', error);
            formLoading.style.display = 'none';
            formError.style.display = 'block';
            formError.querySelector('.error-message').textContent =
                'Something went wrong. Please try again or contact support.';
        }
    });

    // Retry button
    document.getElementById('retry-btn')?.addEventListener('click', function() {
        formError.style.display = 'none';
        leadForm.style.display = 'block';
    });

    // ============================================
    // CTA BUTTON HANDLERS
    // ============================================

    // Main checkout button - opens modal
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            openModal();
        });
    }

    // All "Start Free Trial" buttons
    document.querySelectorAll('.btn-primary').forEach(btn => {
        if (btn.textContent.includes('Free Trial') || btn.textContent.includes('Get Started')) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                openModal();
            });
        }
    });

    // Scroll links to pricing section
    document.querySelectorAll('a[href="#checkout"], a[href="#pricing"]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            const target = document.querySelector('#pricing') || document.querySelector('#checkout');
            if (target) {
                e.preventDefault();
                const navHeight = document.querySelector('.navbar')?.offsetHeight || 80;
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Direct checkout fallback (skip form)
    function directCheckout() {
        window.open(CONFIG.CHECKOUT_URL, '_blank');
    }

    // ============================================
    // NAVBAR SCROLL EFFECT
    // ============================================

    const navbar = document.querySelector('.navbar');

    window.addEventListener('scroll', function() {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 50) {
            navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
            navbar.style.background = 'rgba(3, 7, 18, 0.95)';
        } else {
            navbar.style.boxShadow = 'none';
            navbar.style.background = 'rgba(3, 7, 18, 0.8)';
        }
    });

    // ============================================
    // SMOOTH SCROLL FOR ANCHOR LINKS
    // ============================================

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#' || href === '#checkout') return;

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

    const animateElements = document.querySelectorAll(
        '.problem-card, .feature-card, .step, .comparison-card, .testimonial-card, .faq-item'
    );

    animateElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        fadeInObserver.observe(el);
    });

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

            typingMessage.replaceWith(aiResponse);

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

    const utmParams = getUTMParams();
    if (Object.values(utmParams).some(v => v)) {
        sessionStorage.setItem('utm_params', JSON.stringify(utmParams));
    }

    // ============================================
    // TESTIMONIAL CAROUSEL (mobile)
    // ============================================

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
    // EXIT INTENT POPUP (optional)
    // ============================================

    let exitIntentShown = false;

    document.addEventListener('mouseout', function(e) {
        if (e.clientY < 10 && !exitIntentShown && !modal.classList.contains('active')) {
            // User is leaving - could show a discount popup
            // exitIntentShown = true;
            // openExitIntentModal();
        }
    });

    // ============================================
    // CONSOLE EASTER EGG
    // ============================================

    console.log('%c Ergovia Lite ', 'background: linear-gradient(135deg, #6366f1, #a855f7); color: white; font-size: 24px; padding: 10px 20px; border-radius: 8px;');
    console.log('%c We\'re hiring! hello@ergovia.ai ', 'color: #6366f1; font-size: 14px;');

});

// ============================================
// LEMON SQUEEZY SDK LOADER
// ============================================

(function() {
    var script = document.createElement('script');
    script.src = 'https://app.lemonsqueezy.com/js/lemon.js';
    script.defer = true;
    document.head.appendChild(script);
})();
