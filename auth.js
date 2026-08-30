/**
 * Gahonsh Freelancing Marketplace - Universal Authentication UI Module
 * Handles Login/Signup Modal, Role Selection, Mobile Sync, Profile Modal & Session State.
 */

(function() {
    window.GahonshAuthUI = window.GahonshAuthUI || {};

    let _currentUser = null;

    // ========================================================================
    // 1. INJECT MODAL DOM AND STYLES
    // ========================================================================
    function injectStylesAndDOM() {
        if (document.getElementById('gahonsh-auth-styles')) return;

        const style = document.createElement('style');
        style.id = 'gahonsh-auth-styles';
        style.innerHTML = `
            /* MODAL BACKDROP */
            .gahonsh-modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(3, 7, 18, 0.85);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                padding: 15px;
                box-sizing: border-box;
            }
            .gahonsh-modal-backdrop.active {
                display: flex;
            }

            /* AUTH MODAL BOX */
            .gahonsh-auth-box {
                background: #0b1329;
                border: 1px solid rgba(0, 255, 204, 0.2);
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 255, 204, 0.1);
                border-radius: 16px;
                width: 100%;
                max-width: 460px;
                padding: 30px;
                position: relative;
                color: #ffffff;
                box-sizing: border-box;
                max-height: 90vh;
                overflow-y: auto;
            }

            .gahonsh-close-btn {
                position: absolute;
                top: 18px;
                right: 18px;
                background: transparent;
                border: none;
                color: #8a99ad;
                font-size: 1.4rem;
                cursor: pointer;
                line-height: 1;
                transition: color 0.2s;
            }
            .gahonsh-close-btn:hover {
                color: #00ffcc;
            }

            /* TABS */
            .gahonsh-tabs {
                display: flex;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                margin-bottom: 24px;
            }
            .gahonsh-tab-btn {
                flex: 1;
                background: transparent;
                border: none;
                color: #8a99ad;
                font-size: 1rem;
                font-weight: 600;
                padding: 10px;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                transition: all 0.2s;
            }
            .gahonsh-tab-btn.active {
                color: #00ffcc;
                border-bottom-color: #00ffcc;
            }

            /* ROLE SELECTOR */
            .gahonsh-role-picker {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-bottom: 20px;
            }
            .gahonsh-role-card {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 14px 10px;
                text-align: center;
                cursor: pointer;
                transition: all 0.25s;
            }
            .gahonsh-role-card:hover {
                border-color: rgba(0, 255, 204, 0.4);
                background: rgba(0, 255, 204, 0.05);
            }
            .gahonsh-role-card.selected {
                border-color: #00ffcc;
                background: rgba(0, 255, 204, 0.1);
            }
            .gahonsh-role-card i {
                font-size: 1.4rem;
                color: #00ffcc;
                margin-bottom: 6px;
                display: block;
            }
            .gahonsh-role-card h4 {
                font-size: 0.9rem;
                margin-bottom: 2px;
                color: #fff;
            }
            .gahonsh-role-card p {
                font-size: 0.72rem;
                color: #8a99ad;
                margin: 0;
            }

            /* INPUTS & BUTTONS */
            .gahonsh-input-group {
                margin-bottom: 16px;
            }
            .gahonsh-input-group label {
                display: block;
                font-size: 0.85rem;
                color: #8a99ad;
                margin-bottom: 6px;
                font-weight: 500;
            }
            .gahonsh-input-group input,
            .gahonsh-input-group select,
            .gahonsh-input-group textarea {
                width: 100%;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.15);
                padding: 12px 14px;
                border-radius: 8px;
                color: #ffffff;
                font-size: 0.95rem;
                box-sizing: border-box;
                transition: border-color 0.2s;
                font-family: inherit;
            }
            .gahonsh-input-group input:focus,
            .gahonsh-input-group select:focus,
            .gahonsh-input-group textarea:focus {
                outline: none;
                border-color: #00ffcc;
                background: rgba(255, 255, 255, 0.08);
            }

            .gahonsh-submit-btn {
                width: 100%;
                background: linear-gradient(135deg, #00ffcc 0%, #0077ff 100%);
                color: #070c19;
                border: none;
                padding: 13px;
                border-radius: 8px;
                font-weight: 700;
                font-size: 0.95rem;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
                margin-top: 10px;
            }
            .gahonsh-submit-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0, 255, 204, 0.35);
            }

            /* TOAST NOTIFICATION */
            .gahonsh-toast {
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: #0b1329;
                color: #ffffff;
                border: 1px solid rgba(0, 255, 204, 0.3);
                padding: 14px 20px;
                border-radius: 10px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
                z-index: 100000;
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 0.9rem;
                animation: slideUpToast 0.3s ease-out;
                max-width: calc(100vw - 48px);
            }
            @keyframes slideUpToast {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }

            /* USER BADGE IN NAV */
            .user-auth-badge {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                background: rgba(0, 255, 204, 0.1);
                border: 1px solid rgba(0, 255, 204, 0.3);
                padding: 6px 14px;
                border-radius: 50px;
                font-size: 0.85rem;
                color: #00ffcc !important;
                font-weight: 600;
                text-decoration: none;
                transition: all 0.2s;
            }
            .user-auth-badge:hover {
                background: rgba(0, 255, 204, 0.2);
                border-color: #00ffcc;
            }

            /* SUPABASE CONFIG BANNER */
            .config-banner-notice {
                background: linear-gradient(90deg, #111d38, #0b1329);
                border-bottom: 1px solid rgba(0, 255, 204, 0.3);
                padding: 10px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 0.85rem;
                color: #e2e8f0;
                z-index: 1000;
                position: relative;
                flex-wrap: wrap;
                gap: 10px;
            }
            .config-banner-btn {
                background: #00ffcc;
                color: #070c19;
                border: none;
                padding: 5px 14px;
                border-radius: 4px;
                font-size: 0.8rem;
                font-weight: 700;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);

        // Inject Auth & Config & Profile Edit Modal Container
        const modalContainer = document.createElement('div');
        modalContainer.id = 'gahonsh-auth-modal-root';
        modalContainer.innerHTML = `
            <!-- AUTHENTICATION MODAL -->
            <div class="gahonsh-modal-backdrop" id="authModalBackdrop">
                <div class="gahonsh-auth-box">
                    <button class="gahonsh-close-btn" id="authModalClose" aria-label="Close modal">&times;</button>
                    <div class="gahonsh-tabs">
                        <button class="gahonsh-tab-btn active" id="tabSignIn">Sign In</button>
                        <button class="gahonsh-tab-btn" id="tabSignUp">Join Gahonsh</button>
                    </div>

                    <!-- SIGN IN FORM -->
                    <form id="signInForm">
                        <div class="gahonsh-input-group">
                            <label>Email Address</label>
                            <input type="email" id="signInEmail" placeholder="yourname@domain.com" required autocomplete="email">
                        </div>
                        <div class="gahonsh-input-group">
                            <label>Password</label>
                            <input type="password" id="signInPassword" placeholder="••••••••" required autocomplete="current-password">
                        </div>
                        <button type="submit" class="gahonsh-submit-btn" id="btnSubmitSignIn">Sign In</button>
                    </form>

                    <!-- SIGN UP FORM -->
                    <form id="signUpForm" style="display:none;">
                        <label style="display:block; font-size:0.85rem; color:#8a99ad; margin-bottom:8px; font-weight:600;">Choose Your Account Type</label>
                        <div class="gahonsh-role-picker">
                            <div class="gahonsh-role-card selected" id="roleCardClient" data-role="client">
                                <i class="fa-solid fa-briefcase"></i>
                                <h4>I want to Hire</h4>
                                <p>Post jobs & hire top talent</p>
                            </div>
                            <div class="gahonsh-role-card" id="roleCardFreelancer" data-role="freelancer">
                                <i class="fa-solid fa-laptop-code"></i>
                                <h4>I want to Work</h4>
                                <p>Bid & find freelance work</p>
                            </div>
                        </div>

                        <div class="gahonsh-input-group">
                            <label>Full Name / Company Name</label>
                            <input type="text" id="signUpFullName" placeholder="John Doe or Acme Inc." required minlength="2">
                        </div>
                        <div class="gahonsh-input-group">
                            <label>Email Address</label>
                            <input type="email" id="signUpEmail" placeholder="yourname@domain.com" required autocomplete="email">
                        </div>
                        <div class="gahonsh-input-group">
                            <label>Create Password (min. 6 characters)</label>
                            <input type="password" id="signUpPassword" placeholder="••••••••" required minlength="6" autocomplete="new-password">
                        </div>
                        <button type="submit" class="gahonsh-submit-btn" id="btnSubmitSignUp">Create Account</button>
                    </form>
                </div>
            </div>

            <!-- SUPABASE CONFIGURATION MODAL -->
            <div class="gahonsh-modal-backdrop" id="configModalBackdrop">
                <div class="gahonsh-auth-box" style="max-width: 520px;">
                    <button class="gahonsh-close-btn" id="configModalClose" aria-label="Close modal">&times;</button>
                    <h3 style="margin-top:0; color:#00ffcc; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-database"></i> Connect Supabase Database
                    </h3>
                    <p style="font-size:0.88rem; color:#8a99ad; line-height:1.5;">
                        To activate live Auth, Jobs, Bidding, and Contracts, enter your Supabase Project credentials. You can get these free at <a href="https://supabase.com" target="_blank" style="color:#00ffcc;">supabase.com</a>.
                    </p>
                    <form id="supabaseConfigForm">
                        <div class="gahonsh-input-group">
                            <label>Supabase Project URL</label>
                            <input type="url" id="cfgUrl" placeholder="https://xyzproject.supabase.co" required>
                        </div>
                        <div class="gahonsh-input-group">
                            <label>Supabase Anon (Public) Key</label>
                            <input type="text" id="cfgAnonKey" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..." required>
                        </div>
                        <p style="font-size:0.75rem; color:#8a99ad; margin: 4px 0 14px;">
                            💡 <em>Note: Run the SQL in <code>docs/marketplace-schema.sql</code> once in your Supabase SQL Editor to initialize all tables and security policies.</em>
                        </p>
                        <button type="submit" class="gahonsh-submit-btn">Save & Connect</button>
                    </form>
                </div>
            </div>

            <!-- PROFILE EDIT MODAL -->
            <div class="gahonsh-modal-backdrop" id="profileEditModalBackdrop">
                <div class="gahonsh-auth-box" style="max-width: 520px;">
                    <button class="gahonsh-close-btn" id="profileEditModalClose" aria-label="Close modal">&times;</button>
                    <h3 style="margin-top:0; color:#00ffcc; display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-user-pen"></i> Edit Profile Information
                    </h3>
                    <form id="profileEditForm">
                        <div class="gahonsh-input-group">
                            <label>Professional Title</label>
                            <input type="text" id="editProfileTitle" placeholder="e.g. Senior Full-Stack Engineer / Excel Automation Expert">
                        </div>
                        <div class="gahonsh-input-group">
                            <label>Location</label>
                            <input type="text" id="editProfileLocation" placeholder="e.g. San Francisco, USA or Remote">
                        </div>
                        <div class="gahonsh-input-group">
                            <label>Hourly Rate ($/hr)</label>
                            <input type="number" id="editProfileRate" min="0" step="1" placeholder="e.g. 50">
                        </div>
                        <div class="gahonsh-input-group">
                            <label>Skills (Comma-separated)</label>
                            <input type="text" id="editProfileSkills" placeholder="e.g. React, Node.js, Excel VBA, PostgreSQL">
                        </div>
                        <div class="gahonsh-input-group">
                            <label>Professional Bio / About</label>
                            <textarea id="editProfileBio" rows="4" placeholder="Describe your experience, technical expertise, and delivered solutions..."></textarea>
                        </div>
                        <button type="submit" class="gahonsh-submit-btn" id="btnSaveProfile">Save Profile Changes</button>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modalContainer);

        attachModalEvents();
    }

    // ========================================================================
    // 2. MODAL EVENT LISTENERS
    // ========================================================================
    let _selectedRole = 'client';

    function attachModalEvents() {
        const authBackdrop = document.getElementById('authModalBackdrop');
        const authClose = document.getElementById('authModalClose');
        const tabSignIn = document.getElementById('tabSignIn');
        const tabSignUp = document.getElementById('tabSignUp');
        const signInForm = document.getElementById('signInForm');
        const signUpForm = document.getElementById('signUpForm');

        const roleCardClient = document.getElementById('roleCardClient');
        const roleCardFreelancer = document.getElementById('roleCardFreelancer');

        const configBackdrop = document.getElementById('configModalBackdrop');
        const configClose = document.getElementById('configModalClose');

        const profileBackdrop = document.getElementById('profileEditModalBackdrop');
        const profileClose = document.getElementById('profileEditModalClose');
        const profileEditForm = document.getElementById('profileEditForm');

        // Tab Switching
        if (tabSignIn && tabSignUp) {
            tabSignIn.onclick = () => {
                tabSignIn.classList.add('active');
                tabSignUp.classList.remove('active');
                signInForm.style.display = 'block';
                signUpForm.style.display = 'none';
            };

            tabSignUp.onclick = () => {
                tabSignUp.classList.add('active');
                tabSignIn.classList.remove('active');
                signInForm.style.display = 'none';
                signUpForm.style.display = 'block';
            };
        }

        // Role Picking
        if (roleCardClient && roleCardFreelancer) {
            roleCardClient.onclick = () => {
                _selectedRole = 'client';
                roleCardClient.classList.add('selected');
                roleCardFreelancer.classList.remove('selected');
            };

            roleCardFreelancer.onclick = () => {
                _selectedRole = 'freelancer';
                roleCardFreelancer.classList.add('selected');
                roleCardClient.classList.remove('selected');
            };
        }

        // Modal Close Buttons
        if (authClose) {
            authClose.onclick = () => authBackdrop.classList.remove('active');
        }
        if (authBackdrop) {
            authBackdrop.onclick = (e) => {
                if (e.target === authBackdrop) authBackdrop.classList.remove('active');
            };
        }

        if (configClose) {
            configClose.onclick = () => configBackdrop.classList.remove('active');
        }
        if (configBackdrop) {
            configBackdrop.onclick = (e) => {
                if (e.target === configBackdrop) configBackdrop.classList.remove('active');
            };
        }

        if (profileClose) {
            profileClose.onclick = () => profileBackdrop.classList.remove('active');
        }
        if (profileBackdrop) {
            profileBackdrop.onclick = (e) => {
                if (e.target === profileBackdrop) profileBackdrop.classList.remove('active');
            };
        }

        // Close on Escape Key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (authBackdrop) authBackdrop.classList.remove('active');
                if (configBackdrop) configBackdrop.classList.remove('active');
                if (profileBackdrop) profileBackdrop.classList.remove('active');
            }
        });

        // Sign In Handler
        if (signInForm) {
            signInForm.onsubmit = async (e) => {
                e.preventDefault();
                const email = document.getElementById('signInEmail').value.trim();
                const password = document.getElementById('signInPassword').value;
                const btn = document.getElementById('btnSubmitSignIn');

                try {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

                    await window.GahonshDB.Auth.signIn(email, password);
                    showToast('✅ Signed in successfully!');
                    authBackdrop.classList.remove('active');
                    signInForm.reset();
                    await refreshUserState();
                    
                    // Reload if on dashboard to refresh contents
                    if (window.location.pathname.includes('marketplace-dashboard')) {
                        window.location.reload();
                    }
                } catch (err) {
                    showToast(`❌ Error: ${err.message || 'Failed to sign in'}`);
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Sign In';
                }
            };
        }

        // Sign Up Handler
        if (signUpForm) {
            signUpForm.onsubmit = async (e) => {
                e.preventDefault();
                const fullName = document.getElementById('signUpFullName').value.trim();
                const email = document.getElementById('signUpEmail').value.trim();
                const password = document.getElementById('signUpPassword').value;
                const btn = document.getElementById('btnSubmitSignUp');

                try {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...';

                    await window.GahonshDB.Auth.signUp(email, password, fullName, _selectedRole);
                    showToast('🎉 Account created! Please check your email or sign in.');
                    authBackdrop.classList.remove('active');
                    signUpForm.reset();
                    await refreshUserState();
                } catch (err) {
                    showToast(`❌ Error: ${err.message || 'Failed to create account'}`);
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Create Account';
                }
            };
        }

        // Profile Edit Handler
        if (profileEditForm) {
            profileEditForm.onsubmit = async (e) => {
                e.preventDefault();
                const title = document.getElementById('editProfileTitle').value.trim();
                const location = document.getElementById('editProfileLocation').value.trim();
                const rate = parseFloat(document.getElementById('editProfileRate').value) || 0;
                const skillsRaw = document.getElementById('editProfileSkills').value;
                const bio = document.getElementById('editProfileBio').value.trim();
                const btn = document.getElementById('btnSaveProfile');

                const skills = skillsRaw
                    .split(',')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);

                try {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

                    await window.GahonshDB.Profiles.updateMyProfile({
                        title,
                        location,
                        hourly_rate: rate,
                        skills,
                        bio
                    });

                    showToast('✅ Profile updated successfully!');
                    profileBackdrop.classList.remove('active');
                    await refreshUserState();
                    
                    if (window.initDashboard) {
                        window.initDashboard();
                    }
                } catch (err) {
                    showToast(`❌ Error: ${err.message || 'Failed to update profile'}`);
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Save Profile Changes';
                }
            };
        }

        // Supabase Config Form Handler
        const cfgForm = document.getElementById('supabaseConfigForm');
        if (cfgForm) {
            cfgForm.onsubmit = (e) => {
                e.preventDefault();
                const url = document.getElementById('cfgUrl').value.trim();
                const key = document.getElementById('cfgAnonKey').value.trim();
                if (window.saveSupabaseConfig(url, key)) {
                    showToast('✅ Supabase configured successfully! Reloading...');
                }
            };
        }
    }

    // ========================================================================
    // 3. UI HELPERS & STATE MANAGEMENT
    // ========================================================================
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'gahonsh-toast';
        toast.innerHTML = `<i class="fa-solid fa-circle-info" style="color:#00ffcc;"></i> <span>${message}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.4s';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    function openAuthModal(defaultTab = 'signin') {
        const backdrop = document.getElementById('authModalBackdrop');
        if (!backdrop) return;
        if (defaultTab === 'signup') {
            document.getElementById('tabSignUp')?.click();
        } else {
            document.getElementById('tabSignIn')?.click();
        }
        backdrop.classList.add('active');
    }

    function openConfigModal() {
        const backdrop = document.getElementById('configModalBackdrop');
        if (!backdrop) return;
        document.getElementById('cfgUrl').value = window.GAHONSH_CONFIG?.SUPABASE_URL || '';
        document.getElementById('cfgAnonKey').value = window.GAHONSH_CONFIG?.SUPABASE_ANON_KEY || '';
        backdrop.classList.add('active');
    }

    async function openProfileModal() {
        const backdrop = document.getElementById('profileEditModalBackdrop');
        if (!backdrop) return;

        try {
            const profile = await window.GahonshDB.Profiles.getMyProfile();
            if (profile) {
                document.getElementById('editProfileTitle').value = profile.title || '';
                document.getElementById('editProfileLocation').value = profile.location || '';
                document.getElementById('editProfileRate').value = profile.hourly_rate || 0;
                document.getElementById('editProfileSkills').value = Array.isArray(profile.skills) ? profile.skills.join(', ') : '';
                document.getElementById('editProfileBio').value = profile.bio || '';
            }
        } catch (err) {
            console.warn('[openProfileModal]', err);
        }

        backdrop.classList.add('active');
    }

    async function refreshUserState() {
        try {
            _currentUser = await window.GahonshDB.Auth.getCurrentUser();
        } catch (err) {
            console.warn('[refreshUserState]', err);
            _currentUser = null;
        }

        updateHeaderNav(_currentUser);
    }

    function updateHeaderNav(user) {
        // 1. Update Desktop Navigation
        const nav = document.querySelector('header nav');
        if (nav) {
            const existingAuth = document.getElementById('nav-auth-container');
            if (existingAuth) existingAuth.remove();

            const authWrapper = document.createElement('div');
            authWrapper.id = 'nav-auth-container';
            authWrapper.style.display = 'inline-flex';
            authWrapper.style.alignItems = 'center';
            authWrapper.style.gap = '12px';
            authWrapper.style.marginLeft = '15px';

            if (user) {
                const role = user.profile?.role || 'freelancer';
                const name = user.profile?.full_name || 'Member';
                const roleIcon = role === 'client' ? 'fa-briefcase' : (role === 'admin' ? 'fa-shield-halved' : 'fa-laptop-code');

                authWrapper.innerHTML = `
                    <a href="marketplace-dashboard.html" class="user-auth-badge" title="Go to Marketplace Portal">
                        <i class="fa-solid ${roleIcon}"></i> ${name} (${role.toUpperCase()})
                    </a>
                    <button id="btnNavSignOut" style="background:none; border:1px solid rgba(255,255,255,0.2); color:#8a99ad; padding:6px 12px; border-radius:6px; font-size:0.8rem; cursor:pointer;" title="Sign Out">
                        <i class="fa-solid fa-arrow-right-from-bracket"></i>
                    </button>
                `;

                nav.appendChild(authWrapper);

                const btnSignOut = document.getElementById('btnNavSignOut');
                if (btnSignOut) {
                    btnSignOut.onclick = async () => {
                        await window.GahonshDB.Auth.signOut();
                        showToast('Signed out successfully.');
                        refreshUserState();
                    };
                }
            } else {
                authWrapper.innerHTML = `
                    <button id="btnNavSignIn" style="background:linear-gradient(135deg, #00ffcc 0%, #0077ff 100%); color:#070c19; border:none; padding:7px 16px; border-radius:8px; font-size:0.85rem; font-weight:700; cursor:pointer;">
                        <i class="fa-solid fa-user"></i> Sign In / Join
                    </button>
                `;
                nav.appendChild(authWrapper);

                document.getElementById('btnNavSignIn').onclick = () => openAuthModal('signin');
            }
        }

        // 2. Update Mobile Menu Drawer if present
        const mobileMenu = document.getElementById('mobile-menu-container') || document.querySelector('.mobile-nav-menu');
        if (mobileMenu) {
            const existingMobileAuth = document.getElementById('mobile-auth-container');
            if (existingMobileAuth) existingMobileAuth.remove();

            const mobileAuthWrapper = document.createElement('div');
            mobileAuthWrapper.id = 'mobile-auth-container';
            mobileAuthWrapper.style.marginTop = '15px';
            mobileAuthWrapper.style.paddingTop = '15px';
            mobileAuthWrapper.style.borderTop = '1px solid rgba(255,255,255,0.1)';

            if (user) {
                const role = user.profile?.role || 'freelancer';
                const name = user.profile?.full_name || 'Member';
                mobileAuthWrapper.innerHTML = `
                    <div style="font-size:0.85rem; color:#00ffcc; margin-bottom:10px; font-weight:600;">
                        <i class="fa-solid fa-user-check"></i> ${name} (${role.toUpperCase()})
                    </div>
                    <button id="btnMobileSignOut" style="width:100%; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; padding:8px; border-radius:6px; font-size:0.85rem; cursor:pointer; font-weight:600;">
                        <i class="fa-solid fa-arrow-right-from-bracket"></i> Sign Out
                    </button>
                `;
                mobileMenu.appendChild(mobileAuthWrapper);

                const btnMobSignOut = document.getElementById('btnMobileSignOut');
                if (btnMobSignOut) {
                    btnMobSignOut.onclick = async () => {
                        await window.GahonshDB.Auth.signOut();
                        showToast('Signed out successfully.');
                        refreshUserState();
                    };
                }
            } else {
                mobileAuthWrapper.innerHTML = `
                    <button id="btnMobileSignIn" style="width:100%; background:linear-gradient(135deg, #00ffcc 0%, #0077ff 100%); color:#070c19; border:none; padding:10px; border-radius:8px; font-size:0.9rem; font-weight:700; cursor:pointer;">
                        <i class="fa-solid fa-user"></i> Sign In / Join Gahonsh
                    </button>
                `;
                mobileMenu.appendChild(mobileAuthWrapper);

                const btnMobSignIn = document.getElementById('btnMobileSignIn');
                if (btnMobSignIn) {
                    btnMobSignIn.onclick = () => openAuthModal('signin');
                }
            }
        }
    }

    function checkConfigBanner() {
        if (!window.isSupabaseConfigured() && !document.getElementById('cfgNoticeBanner')) {
            const banner = document.createElement('div');
            banner.id = 'cfgNoticeBanner';
            banner.className = 'config-banner-notice';
            banner.innerHTML = `
                <span><i class="fa-solid fa-triangle-exclamation" style="color:#00ffcc;"></i> <strong>Supabase Setup Needed:</strong> Connect your Supabase project to activate live Auth, Job Posting & Bidding.</span>
                <button class="config-banner-btn" id="btnOpenConfigNotice">Connect Database</button>
            `;
            document.body.prepend(banner);

            document.getElementById('btnOpenConfigNotice').onclick = openConfigModal;
        }
    }

    // Initialize on DOM Ready
    function init() {
        injectStylesAndDOM();
        checkConfigBanner();
        refreshUserState();

        // Listen to auth events
        window.GahonshDB.Auth.onAuthStateChange((event, session, user) => {
            _currentUser = user;
            updateHeaderNav(user);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.GahonshAuthUI = {
        openAuthModal,
        openConfigModal,
        openProfileModal,
        showToast,
        refreshUserState,
        getCurrentUser: () => _currentUser
    };
})();
