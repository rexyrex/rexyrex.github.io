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

// Enhanced Role Rotation Animation
function initRoleRotation() {
    const roles = ['Developer', 'Composer', 'Creator', 'Innovator', 'Designer'];
    const roleElements = document.querySelectorAll('.role');
    let currentIndex = 0;

    if (roleElements.length === 0) return;

    setInterval(() => {
        // Remove active class from all roles
        roleElements.forEach(role => role.classList.remove('active'));
        
        // Add active class to current role
        if (roleElements[currentIndex]) {
            roleElements[currentIndex].classList.add('active');
            
            // Faster, more visible text change with enhanced fade effect
            roleElements[currentIndex].style.opacity = '0';
            roleElements[currentIndex].style.transform = 'scale(0.8)';
            setTimeout(() => {
                roleElements[currentIndex].textContent = roles[currentIndex % roles.length];
                roleElements[currentIndex].style.opacity = '1';
                roleElements[currentIndex].style.transform = 'scale(1)';
                
                // Add sparkle effect to active role
                createRoleSparkle(roleElements[currentIndex]);
            }, 150);
        }
        
        currentIndex = (currentIndex + 1) % roleElements.length;
    }, 1500); // Reduced from 3000ms to 1500ms for faster rotation
}

// Create sparkle effect for role changes
function createRoleSparkle(element) {
    const sparkle = document.createElement('div');
    sparkle.className = 'role-sparkle';
    sparkle.innerHTML = '✨';
    sparkle.style.position = 'absolute';
    sparkle.style.top = '-10px';
    sparkle.style.right = '-10px';
    sparkle.style.fontSize = '16px';
    sparkle.style.animation = 'roleSparkleEffect 1s ease-out forwards';
    sparkle.style.pointerEvents = 'none';
    
    element.style.position = 'relative';
    element.appendChild(sparkle);
    
    setTimeout(() => {
        if (sparkle.parentNode) {
            sparkle.parentNode.removeChild(sparkle);
        }
    }, 1000);
}

// Enhanced Custom Cursor - Pacman Style
function initCustomCursor() {
    const cursor = document.createElement('div');
    cursor.className = 'pacman-cursor';
    cursor.innerHTML = '<div class="pacman-mouth"></div>';
    document.body.appendChild(cursor);

    const trail = document.createElement('div');
    trail.className = 'pacman-trail';
    document.body.appendChild(trail);

    let mouseX = 0, mouseY = 0;
    let trailX = 0, trailY = 0;
    let lastMouseX = 0, lastMouseY = 0;
    let angle = 0;

    document.addEventListener('mousemove', (e) => {
        lastMouseX = mouseX;
        lastMouseY = mouseY;
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        // Calculate movement direction for Pacman rotation
        const deltaX = mouseX - lastMouseX;
        const deltaY = mouseY - lastMouseY;
        
        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
            angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
        }
        
        cursor.style.left = (mouseX - 15) + 'px';
        cursor.style.top = (mouseY - 15) + 'px';
        cursor.style.transform = `rotate(${angle}deg)`;
        
        // Add eating animation when moving
        cursor.classList.add('eating');
        clearTimeout(cursor.eatTimeout);
        cursor.eatTimeout = setTimeout(() => {
            cursor.classList.remove('eating');
        }, 100);
    });

    // Smooth trail animation
    function animateTrail() {
        trailX += (mouseX - trailX) * 0.08;
        trailY += (mouseY - trailY) * 0.08;
        
        trail.style.left = (trailX - 20) + 'px';
        trail.style.top = (trailY - 20) + 'px';
        
        requestAnimationFrame(animateTrail);
    }
    animateTrail();

    // Enhanced hover effects
    const hoverElements = document.querySelectorAll('a, button, .btn, .card, .tag, .social-card');
    hoverElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursor.classList.add('cursor-hover');
            trail.classList.add('cursor-hover');
        });
        
        el.addEventListener('mouseleave', () => {
            cursor.classList.remove('cursor-hover');
            trail.classList.remove('cursor-hover');
        });
    });
}

// Enhanced Magnetic Button Effects
function initMagneticButtons() {
    const magneticElements = document.querySelectorAll('.hero-btn, .project-link-btn, .social-card');
    
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

// Sparkle and Glow Effects for Cards
function initSparkleEffects() {
    const sparkleElements = document.querySelectorAll('.skill-card, .project-card, .stat-card');
    
    sparkleElements.forEach(el => {
        // Add glow effect on hover
        el.addEventListener('mouseenter', () => {
            el.classList.add('card-glow');
            createEnhancedSparkles(el);
        });
        
        el.addEventListener('mouseleave', () => {
            el.classList.remove('card-glow');
            removeSparkles(el);
        });
    });
    
    // Add sparkle effects to hero badge
    const heroBadge = document.querySelector('.hero-badge');
    if (heroBadge) {
        setInterval(() => {
            createBadgeSparkle(heroBadge);
        }, 2000);
    }
}

// Create enhanced sparkle particles around cards
function createEnhancedSparkles(element) {
    const sparkleContainer = document.createElement('div');
    sparkleContainer.className = 'sparkle-container';
    element.appendChild(sparkleContainer);
    
    // Create more sparkles with enhanced effects
    for (let i = 0; i < 12; i++) {
        setTimeout(() => {
            createEnhancedSparkle(sparkleContainer);
        }, i * 80);
    }
}

// Create enhanced sparkle particles
function createEnhancedSparkle(container) {
    const sparkle = document.createElement('div');
    sparkle.className = 'sparkle-particle';
    
    // Random position around the container
    const rect = container.getBoundingClientRect();
    const x = Math.random() * rect.width;
    const y = Math.random() * rect.height;
    
    sparkle.style.left = x + 'px';
    sparkle.style.top = y + 'px';
    
    // Enhanced sparkle styles
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    sparkle.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;
    sparkle.style.boxShadow = `0 0 10px ${color}`;
    
    // Random animation duration and direction
    const duration = 1.5 + Math.random() * 1;
    const direction = Math.random() > 0.5 ? 1 : -1;
    sparkle.style.animationDuration = duration + 's';
    sparkle.style.transform = `rotate(${Math.random() * 360}deg)`;
    
    container.appendChild(sparkle);
    
    setTimeout(() => {
        if (sparkle.parentNode) {
            sparkle.parentNode.removeChild(sparkle);
        }
    }, duration * 1000);
}

// Create sparkle effect for hero badge
function createBadgeSparkle(badge) {
    const sparkle = document.createElement('div');
    sparkle.innerHTML = '✨';
    sparkle.style.position = 'absolute';
    sparkle.style.fontSize = '14px';
    sparkle.style.animation = 'badgeSparkleFloat 2s ease-out forwards';
    sparkle.style.pointerEvents = 'none';
    sparkle.style.zIndex = '10';
    
    // Random position around badge
    const positions = [
        { top: '-20px', left: '-20px' },
        { top: '-20px', right: '-20px' },
        { bottom: '-20px', left: '-20px' },
        { bottom: '-20px', right: '-20px' }
    ];
    const pos = positions[Math.floor(Math.random() * positions.length)];
    Object.assign(sparkle.style, pos);
    
    badge.style.position = 'relative';
    badge.appendChild(sparkle);
    
    setTimeout(() => {
        if (sparkle.parentNode) {
            sparkle.parentNode.removeChild(sparkle);
        }
    }, 2000);
}

// Enhanced Floating Particles Animation
function initFloatingParticles() {
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'floating-particles';
    document.body.appendChild(particlesContainer);

    for (let i = 0; i < 50; i++) {
        createParticle(particlesContainer);
    }
}

function createParticle(container) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    const size = Math.random() * 4 + 2;
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;
    const duration = Math.random() * 20 + 10;
    
    particle.style.cssText = `
        position: fixed;
        width: ${size}px;
        height: ${size}px;
        background: rgba(99, 102, 241, 0.3);
        border-radius: 50%;
        left: ${x}px;
        top: ${y}px;
        pointer-events: none;
        z-index: -1;
        animation: float ${duration}s infinite ease-in-out;
    `;
    
    container.appendChild(particle);
    
    // Remove and recreate particle after animation
    setTimeout(() => {
        particle.remove();
        createParticle(container);
    }, duration * 1000);
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

// Add CSS for custom cursor, particles, and sparkle effects
const style = document.createElement('style');
style.textContent = `
    .custom-cursor {
        position: fixed;
        width: 20px;
        height: 20px;
        background: rgba(99, 102, 241, 0.8);
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        transition: transform 0.1s ease;
        transform: translate(-50%, -50%);
    }

    .cursor-follower {
        position: fixed;
        width: 40px;
        height: 40px;
        border: 2px solid rgba(99, 102, 241, 0.3);
        border-radius: 50%;
        pointer-events: none;
        z-index: 9998;
        transform: translate(-50%, -50%);
        transition: all 0.3s ease;
    }

    .cursor-hover {
        transform: translate(-50%, -50%) scale(1.5);
    }

    .floating-particles {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: -1;
    }

    /* Card Glow Effect */
    .card-glow {
        box-shadow: 
            0 0 30px rgba(99, 102, 241, 0.4),
            0 0 60px rgba(99, 102, 241, 0.2),
            0 0 90px rgba(99, 102, 241, 0.1) !important;
        border-color: rgba(99, 102, 241, 0.8) !important;
        background: linear-gradient(135deg, 
            rgba(255, 255, 255, 0.1) 0%, 
            rgba(99, 102, 241, 0.05) 50%, 
            rgba(255, 255, 255, 0.1) 100%) !important;
    }

    /* Sparkle Container */
    .sparkle-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        overflow: hidden;
        border-radius: inherit;
    }

    /* Sparkle Animation */
    @keyframes sparkleAnimation {
        0% {
            opacity: 0;
            transform: scale(0) rotate(0deg);
        }
        50% {
            opacity: 1;
            transform: scale(1) rotate(180deg);
        }
        100% {
            opacity: 0;
            transform: scale(0) rotate(360deg);
        }
    }

    /* Enhanced Glow for Different Card Types */
    .skill-card.card-glow {
        box-shadow: 
            0 0 30px rgba(99, 102, 241, 0.5),
            0 0 60px rgba(99, 102, 241, 0.3),
            0 0 90px rgba(99, 102, 241, 0.1),
            inset 0 0 30px rgba(99, 102, 241, 0.1) !important;
    }

    .project-card.card-glow {
        box-shadow: 
            0 0 30px rgba(139, 92, 246, 0.5),
            0 0 60px rgba(139, 92, 246, 0.3),
            0 0 90px rgba(139, 92, 246, 0.1),
            inset 0 0 30px rgba(139, 92, 246, 0.1) !important;
    }

    .stat-card.card-glow {
        box-shadow: 
            0 0 30px rgba(236, 72, 153, 0.5),
            0 0 60px rgba(236, 72, 153, 0.3),
            0 0 90px rgba(236, 72, 153, 0.1),
            inset 0 0 30px rgba(236, 72, 153, 0.1) !important;
    }

    @keyframes float {
        0%, 100% {
            transform: translateY(0px) translateX(0px) rotate(0deg);
        }
        25% {
            transform: translateY(-20px) translateX(10px) rotate(90deg);
        }
        50% {
            transform: translateY(-40px) translateX(-10px) rotate(180deg);
        }
        75% {
            transform: translateY(-20px) translateX(-20px) rotate(270deg);
        }
    }

    /* Enhanced smooth transitions for all interactive elements */
    .skill-card, .project-card, .stat-card, .social-card, .hero-btn {
        transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        position: relative;
        overflow: hidden;
    }

    /* Smooth scroll behavior */
    html {
        scroll-behavior: smooth;
    }

    /* Hide cursor on touch devices */
    @media (hover: none) {
        .custom-cursor, .cursor-follower {
            display: none;
        }
    }
`;
document.head.appendChild(style); 