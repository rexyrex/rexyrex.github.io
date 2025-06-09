// Enhanced Modern JavaScript with Smooth Scroll Animations
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all animations
    initScrollAnimations();
    initRoleRotation();
    initCustomCursor();
    initMagneticButtons();
    initFloatingParticles();
    initScrollProgress();
    initTypingEffect();
    initProgressBars();
    initSparkleEffects();
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

// Enhanced Role Rotation Animation - Subtle and Clean
function initRoleRotation() {
    const roles = ['Developer', 'Composer', 'Creator', 'Innovator', 'Designer'];
    const roleElements = document.querySelectorAll('.role');
    let currentIndex = 0;

    if (roleElements.length === 0) return;

    setInterval(() => {
        // Remove active class from all roles
        roleElements.forEach(role => role.classList.remove('active'));
        
        // Add active class to current role with subtle animation
        if (roleElements[currentIndex]) {
            roleElements[currentIndex].classList.add('active');
            
            // Simple, subtle text change
            roleElements[currentIndex].style.opacity = '0.7';
            setTimeout(() => {
                roleElements[currentIndex].textContent = roles[currentIndex % roles.length];
                roleElements[currentIndex].style.opacity = '1';
            }, 150);
        }
        
        currentIndex = (currentIndex + 1) % roleElements.length;
    }, 2000); // Slower, more relaxed timing
}

// Modern Custom Cursor - Optimized for Safari
function initCustomCursor() {
    console.log('Initializing modern cursor...');
    
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

    let mouseX = 0;
    let mouseY = 0;
    let cursorX = 0;
    let cursorY = 0;
    let trailX = 0;
    let trailY = 0;
    let isMoving = false;
    let animationId = null;
    
    // Store animation ID globally for cleanup
    window.cursorAnimationId = null;

    // Initialize cursor positions to center of screen to avoid positioning issues
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    mouseX = centerX;
    mouseY = centerY;
    cursorX = centerX;
    cursorY = centerY;
    trailX = centerX;
    trailY = centerY;
    
    // Set initial positions
    instantCursor.style.left = centerX + 'px';
    instantCursor.style.top = centerY + 'px';
    cursor.style.left = centerX + 'px';
    cursor.style.top = centerY + 'px';
    trail.style.left = centerX + 'px';
    trail.style.top = centerY + 'px';

    // More aggressive throttling for Safari
    let lastUpdate = 0;
    const updateThreshold = isSafari ? 32 : 16; // 30fps for Safari, 60fps for others

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        // Instant cursor follows mouse exactly (no throttling)
        instantCursor.style.left = mouseX + 'px';
        instantCursor.style.top = mouseY + 'px';
        
        // Always set isMoving to true when mouse moves
        isMoving = true;
        
        // Throttle updates for animated cursors (but don't prevent movement detection)
        const now = Date.now();
        if (now - lastUpdate >= updateThreshold) {
            lastUpdate = now;
        }
    });

    // Optimized animation for smooth cursors
    function animateCursors() {
        // Always run animation, but check if we need to update positions
        const cursorDistance = Math.abs(mouseX - cursorX) + Math.abs(mouseY - cursorY);
        const trailDistance = Math.abs(cursorX - trailX) + Math.abs(cursorY - trailY);
        
        // Continue animating if either cursor needs to catch up
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
            
            // Update positions - ensure all use same positioning method
            cursor.style.left = cursorX + 'px';
            cursor.style.top = cursorY + 'px';
            trail.style.left = trailX + 'px';
            trail.style.top = trailY + 'px';
        }
        
        animationId = requestAnimationFrame(animateCursors);
        window.cursorAnimationId = animationId; // Store globally for cleanup
    }
    animateCursors();

    // Enhanced hover effects - improved detection for nested elements
    const hoverElements = document.querySelectorAll('a, button, .btn, .card, .tag, .social-card, .skill-card, .project-card, .stat-card');
    
    hoverElements.forEach(el => {
        // Use both mouseenter/mouseleave and mouseover/mouseout for better detection
        el.addEventListener('mouseenter', () => {
            instantCursor.classList.add('cursor-hover');
            cursor.classList.add('cursor-hover');
            trail.classList.add('cursor-hover');
        });
        
        el.addEventListener('mouseleave', () => {
            instantCursor.classList.remove('cursor-hover');
            cursor.classList.remove('cursor-hover');
            trail.classList.remove('cursor-hover');
        });
        
        // Additional detection for nested elements
        el.addEventListener('mouseover', (e) => {
            // Check if we're hovering over the element or its children
            if (el.contains(e.target)) {
                instantCursor.classList.add('cursor-hover');
                cursor.classList.add('cursor-hover');
                trail.classList.add('cursor-hover');
            }
        });
        
        el.addEventListener('mouseout', (e) => {
            // Only remove hover if we're leaving the element entirely
            if (!el.contains(e.relatedTarget)) {
                instantCursor.classList.remove('cursor-hover');
                cursor.classList.remove('cursor-hover');
                trail.classList.remove('cursor-hover');
            }
        });
    });
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        if (window.cursorAnimationId) {
            cancelAnimationFrame(window.cursorAnimationId);
            window.cursorAnimationId = null;
        }
    });
    
    console.log(`Modern cursor initialization complete! (Safari: ${isSafari})`);
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

// Remove all hover effects - use pure CSS only
function initSparkleEffects() {
    // Remove all JavaScript hover effects for better performance
    // All effects are now handled by pure CSS
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

// Enhanced Scroll Progress Bar
function initScrollProgress() {
    const progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    progressBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 0%;
        height: 3px;
        background: linear-gradient(90deg, #6366f1, #8b5cf6);
        z-index: 9999;
        transition: width 0.3s ease;
    `;
    document.body.appendChild(progressBar);

    window.addEventListener('scroll', () => {
        const scrolled = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        progressBar.style.width = scrolled + '%';
    });
}

// Enhanced Typing Effect for Hero Description
function initTypingEffect() {
    const description = document.querySelector('.hero-description');
    if (!description) return;

    const text = description.textContent;
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

    // Start typing effect after hero animation
    setTimeout(typeWriter, 2000);
}

// Initialize Progress Bars Animation
function initProgressBars() {
    const progressBars = document.querySelectorAll('.progress-bar');
    
    progressBars.forEach(bar => {
        bar.style.width = '0%';
    });
}

// Add minimal CSS for custom cursor only
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

// Initialize all components
function initializeAll() {
    console.log('Initializing all components...');
    initScrollAnimations();
    initRoleRotation();
    initCustomCursor();
    initMagneticButtons();
    initSparkleEffects();
    initFloatingParticles();
    initScrollProgress();
    initTypingEffect();
    initProgressBars();
}

// Handle page load and browser back/forward navigation
document.addEventListener('DOMContentLoaded', initializeAll);

// Handle browser back/forward button (pageshow event fires when page is restored from cache)
window.addEventListener('pageshow', function(event) {
    // If page was restored from cache, re-initialize
    if (event.persisted) {
        console.log('Page restored from cache, re-initializing...');
        // Clean up any existing cursors first
        const existingCursors = document.querySelectorAll('.instant-cursor, .custom-cursor, .cursor-trail');
        existingCursors.forEach(cursor => cursor.remove());
        
        // Re-initialize after a small delay
        setTimeout(initializeAll, 100);
    }
});

// Also handle visibility change (when user switches back to tab)
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        // Check if cursors exist, if not re-initialize
        const instantCursor = document.querySelector('.instant-cursor');
        if (!instantCursor) {
            console.log('Cursors missing, re-initializing...');
            setTimeout(initCustomCursor, 100);
        }
    }
});

// Handle window focus (when returning from external apps like email)
window.addEventListener('focus', function() {
    console.log('Window gained focus, completely re-initializing cursor...');
    // Small delay to ensure the page is fully focused
    setTimeout(function() {
        // Always do a complete cleanup and re-initialization
        console.log('Performing complete cursor cleanup and re-initialization...');
        
        // Remove any existing cursor elements
        const existingCursors = document.querySelectorAll('.instant-cursor, .custom-cursor, .cursor-trail');
        existingCursors.forEach(cursor => {
            cursor.remove();
            console.log('Removed existing cursor element:', cursor.className);
        });
        
        // Cancel any existing animation frames
        if (window.cursorAnimationId) {
            cancelAnimationFrame(window.cursorAnimationId);
            window.cursorAnimationId = null;
        }
        
        // Re-initialize the cursor system completely
        initCustomCursor();
        console.log('Cursor system completely re-initialized');
    }, 300);
});

// Handle mouse re-entry into the window (additional safety net)
document.addEventListener('mouseenter', function() {
    const instantCursor = document.querySelector('.instant-cursor');
    if (!instantCursor) {
        console.log('Mouse entered but cursors missing, re-initializing...');
        setTimeout(initCustomCursor, 50);
    }
}); 