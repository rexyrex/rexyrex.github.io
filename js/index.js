// Landing-page animations: scroll reveals, role rotation, custom cursor,
// magnetic buttons, particles, scroll progress, typing effect.
// Initializes exactly once per page load.

let initialized = false;

document.addEventListener('DOMContentLoaded', function() {
    if (initialized) return;
    initialized = true;

    initScrollAnimations();
    initRoleRotation();
    initCustomCursor();
    initMagneticButtons();
    initFloatingParticles();
    initScrollProgress();
    initTypingEffect();
    initProgressBars();
});

// Enhanced Scroll Animations with Intersection Observer
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');

                // Special handling for staggered animations
                if (entry.target.classList.contains('stagger-1') ||
                    entry.target.classList.contains('stagger-2') ||
                    entry.target.classList.contains('stagger-3')) {
                    handleStaggeredAnimation(entry.target);
                }

                // Trigger progress bar animations
                if (entry.target.classList.contains('skill-card')) {
                    animateProgressBar(entry.target);
                }
            }
        });
    }, observerOptions);

    // Observe all animated elements
    const animatedElements = document.querySelectorAll(
        '.fade-in-up, .fade-in-left, .fade-in-right, .scale-in, .slide-in-up'
    );

    animatedElements.forEach(el => observer.observe(el));
}

// Handle staggered animations for grouped elements
function handleStaggeredAnimation(element) {
    const parent = element.closest('.row');
    if (parent) {
        const siblings = parent.querySelectorAll('.stagger-1, .stagger-2, .stagger-3');
        siblings.forEach((sibling, index) => {
            setTimeout(() => {
                sibling.classList.add('visible');
            }, index * 150); // 150ms delay between each element
        });
    }
}

// Animate progress bars when skill cards become visible
function animateProgressBar(skillCard) {
    const progressBar = skillCard.querySelector('.progress-bar');
    if (progressBar) {
        const progress = progressBar.getAttribute('data-progress');
        setTimeout(() => {
            progressBar.style.width = progress + '%';
        }, 300);
    }
}

// Role Rotation - the highlight walks across the three spans while the
// word list cycles through all five roles.
function initRoleRotation() {
    const roles = ['Developer', 'Composer', 'Creator', 'Innovator', 'Designer'];
    const roleElements = document.querySelectorAll('.role');
    if (roleElements.length === 0) return;

    let spanIndex = 0;                            // markup starts with the first span active
    let roleIndex = roleElements.length - 1;      // spans initially show roles[0..n-1]

    setInterval(() => {
        roleElements.forEach(role => role.classList.remove('active'));

        spanIndex = (spanIndex + 1) % roleElements.length;
        roleIndex = (roleIndex + 1) % roles.length;

        const span = roleElements[spanIndex];
        span.classList.add('active');
        span.style.opacity = '0.7';
        setTimeout(() => {
            span.textContent = roles[roleIndex];
            span.style.opacity = '1';
        }, 150);
    }, 2000);
}

// Modern Custom Cursor - only on devices with a fine pointer; the CSS that
// hides the native cursor is gated on html.custom-cursor-active, so the
// native cursor survives if this never runs.
// Positions are written as --cursor-x/--cursor-y custom properties consumed
// by a translate3d() in the CSS — no left/top writes, so tracking the mouse
// never forces layout.
function initCustomCursor() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    document.documentElement.classList.add('custom-cursor-active');

    // Detect Safari for specific optimizations
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // Instant cursor that follows mouse exactly (no lag)
    const instantCursor = document.createElement('div');
    instantCursor.className = 'instant-cursor';
    document.body.appendChild(instantCursor);

    // Main cursor with smooth animation
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    document.body.appendChild(cursor);

    // Trail cursor for visual effect
    const trail = document.createElement('div');
    trail.className = 'cursor-trail';
    document.body.appendChild(trail);

    function setPos(el, x, y) {
        el.style.setProperty('--cursor-x', x + 'px');
        el.style.setProperty('--cursor-y', y + 'px');
    }

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    let mouseX = centerX;
    let mouseY = centerY;
    let cursorX = centerX;
    let cursorY = centerY;
    let trailX = centerX;
    let trailY = centerY;
    let animationId = null;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;

        // The cursors stay invisible until the mouse position is first known
        document.documentElement.classList.add('cursor-ready');

        // Instant cursor follows mouse exactly (no throttling)
        setPos(instantCursor, mouseX, mouseY);
    });

    // Optimized animation for smooth cursors
    function animateCursors() {
        const cursorDistance = Math.abs(mouseX - cursorX) + Math.abs(mouseY - cursorY);
        const trailDistance = Math.abs(cursorX - trailX) + Math.abs(cursorY - trailY);

        // Only write to the DOM while a cursor still needs to catch up
        if (cursorDistance > 0.5 || trailDistance > 0.5) {
            // Different easing for Safari vs other browsers
            const ease = isSafari ? 0.2 : 0.15;
            const trailEase = isSafari ? 0.1 : 0.08;

            // Smooth cursor animation
            cursorX += (mouseX - cursorX) * ease;
            cursorY += (mouseY - cursorY) * ease;

            // Trail follows the main cursor (not the mouse directly)
            trailX += (cursorX - trailX) * trailEase;
            trailY += (cursorY - trailY) * trailEase;

            setPos(cursor, cursorX, cursorY);
            setPos(trail, trailX, trailY);
        }

        animationId = requestAnimationFrame(animateCursors);
    }
    animateCursors();

    // Hover effects via delegation so late-injected elements (e.g. the navbar,
    // which /js/common.js fetches after DOMContentLoaded) are picked up too.
    const HOVER_SELECTOR = 'a, button, .btn, .card, .tag, .social-card, .skill-card, .project-card, .stat-card';

    function setHover(on) {
        instantCursor.classList.toggle('cursor-hover', on);
        cursor.classList.toggle('cursor-hover', on);
        trail.classList.toggle('cursor-hover', on);
    }

    document.addEventListener('mouseover', (e) => {
        setHover(!!(e.target.closest && e.target.closest(HOVER_SELECTOR)));
    });

    // Hide the cursor when the mouse leaves the window entirely
    document.documentElement.addEventListener('mouseleave', () => {
        document.documentElement.classList.remove('cursor-ready');
    });
    document.documentElement.addEventListener('mouseenter', () => {
        document.documentElement.classList.add('cursor-ready');
    });

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
    });
}

// Enhanced Magnetic Button Effects
function initMagneticButtons() {
    // Only apply magnetic effect to project link buttons, not social cards
    const magneticElements = document.querySelectorAll('.project-link-btn');

    magneticElements.forEach(el => {
        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;

            const strength = 0.3;
            el.style.transform = `translate(${x * strength}px, ${y * strength}px) scale(1.05)`;
        });

        el.addEventListener('mouseleave', () => {
            el.style.transform = 'translate(0, 0) scale(1)';
        });
    });
}

// Lightweight Floating Particles with CSS-only animation
function initFloatingParticles() {
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'floating-particles';
    document.body.appendChild(particlesContainer);

    // Create only 5 lightweight particles for minimal impact
    for (let i = 0; i < 5; i++) {
        createLightParticle(particlesContainer, i);
    }
}

function createLightParticle(container, index) {
    const particle = document.createElement('div');
    particle.className = 'light-particle';

    // Use CSS custom properties for positioning
    particle.style.setProperty('--delay', (index * 3) + 's');
    particle.style.setProperty('--x', Math.random() * 100 + '%');
    particle.style.setProperty('--y', Math.random() * 100 + '%');

    container.appendChild(particle);
}

// Enhanced Scroll Progress Bar.
// rAF-throttled and driven by transform: scaleX() on a full-width bar, so
// updating it never animates width or re-runs layout on every scroll event.
function initScrollProgress() {
    const progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    progressBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: linear-gradient(90deg, #6366f1, #8b5cf6);
        z-index: 10000;
        transform: scaleX(0);
        transform-origin: 0 50%;
        will-change: transform;
        pointer-events: none;
    `;
    document.body.appendChild(progressBar);

    let ticking = false;

    function update() {
        ticking = false;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const scrolled = max > 0 ? Math.min(1, window.scrollY / max) : 0;
        progressBar.style.transform = 'scaleX(' + scrolled + ')';
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }, { passive: true });

    update();
}

// Typing Effect for Hero Description. The full text stays available to
// assistive tech via aria-label, and typing starts quickly so the page
// never looks empty.
function initTypingEffect() {
    const description = document.querySelector('.hero-description');
    if (!description) return;

    const text = description.textContent.replace(/\s+/g, ' ').trim();
    description.setAttribute('aria-label', text);
    description.textContent = '';
    description.style.opacity = '1';

    let i = 0;
    const typeWriter = () => {
        if (i < text.length) {
            description.textContent += text.charAt(i);
            i++;
            setTimeout(typeWriter, 30);
        }
    };

    setTimeout(typeWriter, 300);
}

// Initialize Progress Bars Animation
function initProgressBars() {
    const progressBars = document.querySelectorAll('.progress-bar');

    progressBars.forEach(bar => {
        bar.style.width = '0%';
    });
}

// Minimal injected CSS for the particle layer + touch devices
const style = document.createElement('style');
style.textContent = `
    .floating-particles {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: -1;
    }

    /* Hide cursor on touch devices */
    @media (hover: none) {
        .custom-cursor, .cursor-trail {
            display: none;
        }
    }
`;
document.head.appendChild(style);
