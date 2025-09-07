// PhishVault Side Navigation Controller

function initializeSideNav() {
    console.log('Initializing side navigation...');
    
    // DOM Elements
    const sideNav = document.getElementById('sideNav');
    const toggleNavBtn = document.getElementById('toggleNav');
    const mainContent = document.getElementById('mainContent');
    const navItems = document.querySelectorAll('.nav-item');
    const aiChatView = document.getElementById('aiChatView');
    const historyView = document.getElementById('historyView');
    const settingsView = document.getElementById('settingsView');
    
    console.log('Side nav elements:', {
        sideNav: !!sideNav,
        toggleNavBtn: !!toggleNavBtn, 
        mainContent: !!mainContent,
        navItemsCount: navItems.length
    });
    
    // If elements are missing, try again later
    if (!sideNav || !toggleNavBtn || !mainContent) {
        console.log('Side nav elements missing, trying again in 500ms');
        setTimeout(initializeSideNav, 500);
        return;
    }
    
    // Toggle side navigation
    toggleNavBtn.addEventListener('click', function() {
        sideNav.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
        
        // Update toggle button icon
        const icon = toggleNavBtn.querySelector('i');
        if (sideNav.classList.contains('collapsed')) {
            icon.classList.remove('fa-chevron-left');
            icon.classList.add('fa-chevron-right');
        } else {
            icon.classList.remove('fa-chevron-right');
            icon.classList.add('fa-chevron-left');
        }
    });

    // Handle mobile toggle
    function handleMobileNavToggle() {
        if (window.innerWidth <= 768) {
            sideNav.classList.add('collapsed');
            mainContent.classList.add('expanded');
        }
    }

    // Initialize mobile navigation
    handleMobileNavToggle();
    window.addEventListener('resize', handleMobileNavToggle);

    // Navigation item click handler
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all items
            navItems.forEach(nav => nav.classList.remove('active'));
            
            // Add active class to clicked item
            this.classList.add('active');
            
            // Get the view to display
            const view = this.getAttribute('data-view');
            
            // Hide all views
            mainContent.style.display = 'none';
            aiChatView.style.display = 'none';
            historyView.style.display = 'none';
            settingsView.style.display = 'none';
            
            // Show the selected view
            switch (view) {
                case 'analysis':
                    mainContent.style.display = 'block';
                    break;
                case 'ai-chat':
                    aiChatView.style.display = 'block';
                    break;
                case 'history':
                    historyView.style.display = 'block';
                    break;
                case 'settings':
                    settingsView.style.display = 'block';
                    break;
            }
            
            // On mobile, close the nav after selection
            if (window.innerWidth <= 768) {
                sideNav.classList.remove('mobile-open');
            }
        });
    });

    // Ensure dark mode applies to all views
    const darkModeToggle = document.getElementById('darkModeToggle');
    const chatDarkModeToggle = document.getElementById('chatDarkModeToggle');
    
    if (darkModeToggle && chatDarkModeToggle) {
        // Sync dark mode toggles
        darkModeToggle.addEventListener('change', function() {
            chatDarkModeToggle.checked = this.checked;
            document.body.classList.toggle('dark-mode', this.checked);
        });
        
        chatDarkModeToggle.addEventListener('change', function() {
            darkModeToggle.checked = this.checked;
            document.body.classList.toggle('dark-mode', this.checked);
        });
        
        // Check for saved dark mode preference
        chrome.storage.local.get('darkMode', function(result) {
            if (result.darkMode) {
                darkModeToggle.checked = true;
                chatDarkModeToggle.checked = true;
                document.body.classList.add('dark-mode');
            }
        });
    }
};
