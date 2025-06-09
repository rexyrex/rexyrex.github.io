// Determine the correct path to navbar.html based on current page location
function getNavbarPath() {
    // Get the current path
    const path = window.location.pathname;
    
    // If we're in a subdirectory like /typing/ or /parser/, we need to go up one level
    if (path.includes('/typing/') || path.includes('/parser/') || path.includes('/deadlyBalloons/')) {
        return "../navbar.html";
    }
    
    // Root level path
    return "navbar.html";
}

// Insert navbar when document is ready
$(document).ready(function() {
    // Find navbar placeholder or create one if it doesn't exist
    let navPlaceholder = $('#nav-placeholder');
    if (navPlaceholder.length === 0) {
        $('body').prepend('<div id="nav-placeholder"></div>');
        navPlaceholder = $('#nav-placeholder');
    }
    
    // Load the navbar
    navPlaceholder.load(getNavbarPath(), function() {
        // Add loaded class to make navbar visible with smooth transition
        navPlaceholder.addClass('loaded');
        
        // Highlight the current section in navbar if needed
        const path = window.location.pathname;
        
        if (path.includes('/typing/')) {
            $('#gamesDropdown').addClass('active');
        } else if (path.includes('/deadlyBalloons/')) {
            $('#gamesDropdown').addClass('active');
        } else if (path.includes('/parser/')) {
            $('#parserDropdown').addClass('active');
        } else if (path.includes('/animation.html')) {
            $('#testDropdown').addClass('active');
        }
    });
}); 