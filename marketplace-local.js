/**
 * Gahonsh Freelancing Marketplace — Local Marketplace Engine
 *
 * A self-contained, browser-only implementation of the marketplace data layer.
 * It mirrors the exact API shapes of `GahonshDB` (supabase-client.js) so the
 * whole client -> post -> freelancer -> apply -> hire flow keeps working even
 * when no live Supabase project is reachable (e.g. before the owner provisions
 * a backend, or while the configured project is offline).
 *
 * Data is stored in localStorage under the `gahonsh_mkt_v1_` prefix and is
 * seeded with the same demo jobs/talent the pages already advertise, so the
 * marketplace is never an empty dead end.
 *
 * SECURITY NOTE: this is a DEMO / offline fallback, not production auth.
 * Credentials never leave the browser and passwords are stored as salted
 * SHA-256 hashes, but localStorage is not a trust boundary — anyone with
 * device access can read or edit it. When real Supabase credentials are
 * reachable, supabase-client.js uses Supabase instead and this engine is
 * bypassed entirely.
 */

(function () {
    'use strict';

    const PREFIX = 'gahonsh_mkt_v1_';
    const SESSION_KEY = PREFIX + 'session';

    // ------------------------------------------------------------------
    // Storage helpers
    // ------------------------------------------------------------------
    function readTable(name) {
        try {
            const raw = localStorage.getItem(PREFIX + name);
            const parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('[GahonshLocal] unreadable table', name, e);
            return [];
        }
    }

    function writeTable(name, rows) {
        try {
            localStorage.setItem(PREFIX + name, JSON.stringify(rows));
        } catch (e) {
            console.warn('[GahonshLocal] could not persist table', name, e);
        }
    }

    function readSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeSession(session) {
        try {
            if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            else localStorage.removeItem(SESSION_KEY);
        } catch (e) { /* ignore */ }
    }

    function newId(prefix) {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return prefix + '-' + window.crypto.randomUUID();
        }
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    // Reduce any user-supplied name to a single safe path segment.
    function safeFileName(name) {
        const base = String(name || 'file').split(/[\\/]/).pop().trim();
        return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
    }

    // Resumes are PDF-only. The cap mirrors the Supabase bucket policy so the
    // offline engine rejects the same files the live backend would reject.
    const MAX_RESUME_BYTES = 5 * 1024 * 1024;

    function validateResumeFile(file) {
        if (!file) throw new Error('No file was selected.');
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
        if (!isPdf) throw new Error('Please upload a PDF file.');
        if (file.size && file.size > MAX_RESUME_BYTES) {
            throw new Error('Resume must be 5 MB or smaller.');
        }
    }

    // ------------------------------------------------------------------
    // IndexedDB blob store — localStorage holds text only, so uploaded file
    // bytes live here while their metadata lives in the `file_transfers`
    // table. This keeps offline uploads and downloads working end to end.
    // ------------------------------------------------------------------
    const IDB_NAME = 'gahonsh_file_blobs_v1';
    const IDB_STORE = 'blobs';

    function idbOpen() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('IndexedDB is unavailable in this browser.'));
            const request = window.indexedDB.open(IDB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Could not open the file store.'));
        });
    }

    async function idbRun(mode, action) {
        const db = await idbOpen();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(IDB_STORE, mode);
                const store = tx.objectStore(IDB_STORE);
                const req = action(store);
                tx.oncomplete = () => resolve(req && req.result);
                tx.onerror = () => reject(tx.error || new Error('File store transaction failed.'));
                tx.onabort = () => reject(tx.error || new Error('File store transaction aborted.'));
            });
        } finally {
            db.close();
        }
    }

    function idbPut(key, blob) { return idbRun('readwrite', (store) => store.put(blob, key)); }
    function idbGet(key) { return idbRun('readonly', (store) => store.get(key)); }
    function idbDelete(key) { return idbRun('readwrite', (store) => store.delete(key)); }

    function delay(ms) {
        // Small async gap so callers behave like they do against a network API.
        return new Promise((resolve) => setTimeout(resolve, ms || 0));
    }

    // ------------------------------------------------------------------
    // Password hashing (demo-grade: salted SHA-256, browser-side only)
    // ------------------------------------------------------------------
    async function hashPassword(password, salt) {
        const material = salt + '::' + password;
        if (window.crypto && window.crypto.subtle && window.TextEncoder) {
            try {
                const bytes = new TextEncoder().encode(material);
                const digest = await window.crypto.subtle.digest('SHA-256', bytes);
                return Array.from(new Uint8Array(digest))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('');
            } catch (e) { /* fall through to non-crypto hash */ }
        }
        // Deterministic fallback for non-secure contexts (never used for real secrets).
        let h = 5381;
        for (let i = 0; i < material.length; i++) {
            h = ((h << 5) + h + material.charCodeAt(i)) | 0;
        }
        return 'fnv-' + (h >>> 0).toString(16);
    }

    // ------------------------------------------------------------------
    // Seed data — mirrors the demo content already used by the pages
    // ------------------------------------------------------------------
    const DEMO_PASSWORD = 'demo1234';

    function seedProfiles() {
        return [
            {
                id: 'client-apex', _email: 'apex@client.demo', full_name: 'Apex Global Logistics', role: 'client',
                location: 'United Kingdom', is_verified: true, avatar_url: null,
                title: 'Enterprise Client', bio: 'Global logistics operator hiring automation specialists.',
                hourly_rate: null, skills: [], created_at: nowIso(), updated_at: nowIso()
            },
            {
                id: 'client-strata', _email: 'strata@client.demo', full_name: 'Strata Tech Ventures', role: 'client',
                location: 'United States', is_verified: true, avatar_url: null,
                title: 'Venture Studio', bio: 'Building customer-facing products with a distributed team.',
                hourly_rate: null, skills: [], created_at: nowIso(), updated_at: nowIso()
            },
            {
                id: 'client-nordic', _email: 'nordic@client.demo', full_name: 'Nordic Retail Group', role: 'client',
                location: 'Germany', is_verified: true, avatar_url: null,
                title: 'Retail Group', bio: 'Multi-market retail brand refreshing its catalogue assets.',
                hourly_rate: null, skills: [], created_at: nowIso(), updated_at: nowIso()
            },
            {
                id: 'talent-1', _email: 'aditya@freelancer.demo', full_name: 'Aditya Sharma', role: 'freelancer',
                location: 'India', is_verified: true, avatar_url: null,
                title: 'Senior Excel Automation & VBA Architect', hourly_rate: 45,
                availability: 'available', availability_note: 'Taking new work this week',
                bio: '10+ years specializing in automated macro dashboards, multi-sheet consolidation, dynamic forecasting models, and high-security Excel architectures.',
                skills: ['Excel VBA', 'Financial Modeling', 'Pivot Tables', 'Macro Security', 'Power Query'],
                created_at: nowIso(), updated_at: nowIso()
            },
            {
                id: 'talent-2', _email: 'elena@freelancer.demo', full_name: 'Elena Rostova', role: 'freelancer',
                location: 'Estonia', is_verified: true, avatar_url: null,
                title: 'Full-Stack JavaScript & PostgreSQL Engineer', hourly_rate: 65,
                availability: 'busy', availability_note: 'Two projects in flight, free next month',
                bio: 'Passionate about building fast, responsive web portals with secure authentication, cloud APIs, and responsive mobile interfaces.',
                skills: ['React', 'Node.js', 'PostgreSQL', 'Tailwind CSS', 'Supabase'],
                created_at: nowIso(), updated_at: nowIso()
            },
            {
                id: 'talent-3', _email: 'marcus@freelancer.demo', full_name: 'Marcus Vance', role: 'freelancer',
                location: 'United States', is_verified: true, avatar_url: null,
                title: 'PDF Layout & Typography Specialist', hourly_rate: 40,
                availability: 'available', availability_note: null,
                bio: 'Delivering pixel-perfect vector PDF documents, interactive fillable forms, corporate pitch decks, and brand identity manuals.',
                skills: ['PDF Design', 'Interactive Forms', 'Typography', 'Brand Identity', 'InDesign'],
                created_at: nowIso(), updated_at: nowIso()
            }
        ];
    }

    function seedJobs() {
        const hour = 3600000;
        return [
            {
                id: 'demo-job-1',
                client_id: 'client-apex',
                title: 'Corporate Excel VBA Automated Financial Reporting Dashboard',
                category: 'Excel Automation',
                job_type: 'fixed',
                budget_min: 450,
                budget_max: null,
                hourly_rate_min: null,
                hourly_rate_max: null,
                experience_level: 'intermediate',
                estimated_duration: 'Less than 1 month',
                description: 'We need an advanced Excel and VBA developer to build an automated macro dashboard that aggregates monthly sales data across 12 regional branches into standardized visual charts and P&L summaries.',
                required_skills: ['Excel VBA', 'Financial Modeling', 'Pivot Tables', 'Dashboard Design'],
                status: 'open',
                created_at: new Date(Date.now() - hour * 2).toISOString()
            },
            {
                id: 'demo-job-2',
                client_id: 'client-strata',
                title: 'Full-Stack Customer Portal with Auth and Invoice Download',
                category: 'Web Engineering',
                job_type: 'fixed',
                budget_min: 1200,
                budget_max: null,
                hourly_rate_min: null,
                hourly_rate_max: null,
                experience_level: 'expert',
                estimated_duration: '1 to 3 months',
                description: 'Looking for an experienced web engineer to build a high-performance customer dashboard with secure authentication, invoice management, and automated PDF export capabilities.',
                required_skills: ['JavaScript', 'HTML5/CSS3', 'Node.js', 'PostgreSQL', 'PDF Export'],
                status: 'open',
                created_at: new Date(Date.now() - hour * 5).toISOString()
            },
            {
                id: 'demo-job-3',
                client_id: 'client-nordic',
                title: 'Vector PDF Catalog & Brand Asset Redesign',
                category: 'PDF & Design',
                job_type: 'hourly',
                budget_min: 0,
                budget_max: null,
                hourly_rate_min: 35,
                hourly_rate_max: 50,
                experience_level: 'intermediate',
                estimated_duration: 'Less than 1 month',
                description: 'Need a meticulous designer to redesign our 24-page product catalog into high-resolution, print-ready and web-optimized interactive PDF formats with fillable forms.',
                required_skills: ['PDF Design', 'Interactive Forms', 'Typography', 'Branding'],
                status: 'open',
                created_at: new Date(Date.now() - hour * 24).toISOString()
            }
        ];
    }

    // Three demo catalog packages, one per seeded freelancer, so the Project
    // Catalog has something real to render before anyone publishes their own.
    function seedPackages() {
        return [
            {
                id: 'package-1',
                freelancer_id: 'talent-1',
                title: 'Excel Reporting Dashboard (Basic to Premium)',
                description: 'An automated Excel workbook that consolidates your monthly files into one dashboard with live charts, validation and a printable summary sheet.',
                category: 'Excel Automation',
                tier: 'standard',
                price: 320,
                delivery_days: 7,
                revisions: 2,
                skills: ['Excel VBA', 'Power Query', 'Dashboards'],
                is_active: true,
                created_at: nowIso(),
                updated_at: nowIso()
            },
            {
                id: 'package-2',
                freelancer_id: 'talent-2',
                title: 'Five-Page Business Website Build',
                description: 'A responsive five-page marketing site with a contact form, basic SEO metadata and deployment to your host of choice.',
                category: 'Web Development',
                tier: 'premium',
                price: 850,
                delivery_days: 14,
                revisions: 3,
                skills: ['JavaScript', 'HTML5/CSS3', 'SEO'],
                is_active: true,
                created_at: nowIso(),
                updated_at: nowIso()
            },
            {
                id: 'package-3',
                freelancer_id: 'talent-3',
                title: 'Print-Ready PDF Brochure Design',
                description: 'A print-ready brochure or company profile laid out in vector PDF, with bleed, crop marks and an editable source file handed over.',
                category: 'PDF & Design',
                tier: 'basic',
                price: 180,
                delivery_days: 5,
                revisions: 1,
                skills: ['PDF Design', 'Typography', 'Branding'],
                is_active: true,
                created_at: nowIso(),
                updated_at: nowIso()
            }
        ];
    }

    async function seedIfEmpty() {
        const jobs = readTable('jobs');
        const profiles = readTable('profiles');

        if (profiles.length === 0) {
            const seeded = seedProfiles();
            // Give every seeded account the documented demo password so the
            // marketplace is usable out of the box.
            for (const p of seeded) {
                const salt = newId('salt');
                p._salt = salt;
                p._hash = await hashPassword(DEMO_PASSWORD, salt);
            }
            writeTable('profiles', seeded);
        }

        if (jobs.length === 0) {
            writeTable('jobs', seedJobs());
        }
        if (readTable('proposals').length === 0) writeTable('proposals', []);
        if (readTable('contracts').length === 0) writeTable('contracts', []);
        if (readTable('file_transfers').length === 0) writeTable('file_transfers', []);
        if (readTable('contract_milestones').length === 0) writeTable('contract_milestones', []);
        if (readTable('reviews').length === 0) writeTable('reviews', []);
        if (readTable('saved_jobs').length === 0) writeTable('saved_jobs', []);
        if (readTable('saved_talent').length === 0) writeTable('saved_talent', []);
        if (readTable('invitations').length === 0) writeTable('invitations', []);
        if (readTable('notifications').length === 0) writeTable('notifications', []);
        if (readTable('service_packages').length === 0) writeTable('service_packages', seedPackages());
    }

    // ------------------------------------------------------------------
    // Query helpers
    // ------------------------------------------------------------------
    function findProfile(id) {
        return readTable('profiles').find((p) => p.id === id) || null;
    }

    // Mirrors the `public_profiles` view: an allow-list, never a black-list, so
    // a new private column cannot leak by default. Email, phone number, the
    // password salt/hash and `_email` never leave the engine.
    function publicProfile(profile) {
        if (!profile) return null;
        return {
            id: profile.id,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url || null,
            role: profile.role,
            location: profile.location || null,
            bio: profile.bio || null,
            title: profile.title || null,
            hourly_rate: profile.hourly_rate ?? null,
            skills: Array.isArray(profile.skills) ? profile.skills.slice() : [],
            is_verified: !!profile.is_verified,
            created_at: profile.created_at || null,
            resume_name: profile.resume_name || null,
            resume_size_bytes: profile.resume_size_bytes ?? null,
            resume_updated_at: profile.resume_updated_at || null,
            has_resume: !!profile.resume_name,
            availability: profile.availability || 'available',
            availability_note: profile.availability_note || null
        };
    }

    // Only these fields may be changed through updateMyProfile(). The
    // immutable identity and privilege columns (id, email, role, is_verified,
    // _salt, _hash, _email, created_at) are not in the list, so a crafted
    // payload can never promote the caller or touch another profile.
    const PROFILE_EDITABLE_FIELDS = [
        'full_name', 'avatar_url', 'location', 'bio', 'title',
        'hourly_rate', 'skills', 'phone_number', 'availability', 'availability_note'
    ];

    const AVAILABILITY_VALUES = ['available', 'busy', 'unavailable'];

    function sanitizeProfileUpdates(updates) {
        const source = updates && typeof updates === 'object' ? updates : {};
        const safe = {};
        for (const key of PROFILE_EDITABLE_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(source, key)) safe[key] = source[key];
        }
        if ('full_name' in safe) {
            const name = String(safe.full_name || '').trim();
            if (name.length < 2) throw new Error('Full name must be at least 2 characters.');
            safe.full_name = name.slice(0, 80);
        }
        if ('title' in safe) safe.title = String(safe.title || '').trim().slice(0, 120);
        if ('location' in safe) safe.location = String(safe.location || '').trim().slice(0, 120);
        if ('bio' in safe) safe.bio = String(safe.bio || '').trim().slice(0, 2000);
        if ('avatar_url' in safe) {
            const url = String(safe.avatar_url || '').trim();
            if (url && !/^https?:\/\//i.test(url)) {
                throw new Error('Avatar URL must start with http:// or https://.');
            }
            safe.avatar_url = url ? url.slice(0, 500) : null;
        }
        if ('phone_number' in safe) {
            const phone = String(safe.phone_number || '').trim();
            if (phone && !/^[+0-9()\-\s]{6,24}$/.test(phone)) {
                throw new Error('Please enter a valid phone number.');
            }
            safe.phone_number = phone || null;
        }
        if ('hourly_rate' in safe) {
            const rate = Number(safe.hourly_rate);
            if (!Number.isFinite(rate) || rate < 0 || rate > 100000) {
                throw new Error('Hourly rate must be between 0 and 100000.');
            }
            safe.hourly_rate = rate;
        }
        if ('skills' in safe) {
            if (!Array.isArray(safe.skills)) throw new Error('Skills must be a list.');
            safe.skills = safe.skills
                .map((s) => String(s || '').trim().slice(0, 40))
                .filter(Boolean)
                .slice(0, 30);
        }
        if ('availability' in safe) {
            const value = String(safe.availability || 'available').trim().toLowerCase();
            if (!AVAILABILITY_VALUES.includes(value)) {
                throw new Error('Availability must be available, busy or unavailable.');
            }
            safe.availability = value;
        }
        if ('availability_note' in safe) {
            safe.availability_note = String(safe.availability_note || '').trim().slice(0, 120) || null;
        }
        return safe;
    }

    // ------------------------------------------------------------------
    // Notifications (offline mirror of the database triggers)
    // ------------------------------------------------------------------
    // The live schema writes these from SECURITY DEFINER triggers, so a
    // browser can never post one. The engine keeps the same rule by only
    // calling this from the service that performed the action.
    function pushNotification(userId, type, title, body, link) {
        if (!userId) return null;
        const rows = readTable('notifications');
        const row = {
            id: newId('notification'),
            user_id: userId,
            type: type || 'info',
            title: String(title || 'Marketplace update').slice(0, 140),
            body: body ? String(body).slice(0, 1000) : null,
            link: link || null,
            is_read: false,
            created_at: nowIso()
        };
        rows.push(row);
        writeTable('notifications', rows);
        return row;
    }

    function clientSnippet(profile) {
        return {
            id: profile?.id || null,
            full_name: profile?.full_name || 'Verified Client',
            avatar_url: profile?.avatar_url || null,
            location: profile?.location || 'Remote',
            is_verified: profile?.is_verified !== false
        };
    }

    function freelancerSnippet(profile) {
        return {
            id: profile?.id || null,
            full_name: profile?.full_name || 'Freelancer',
            avatar_url: profile?.avatar_url || null,
            title: profile?.title || 'Freelance Specialist',
            hourly_rate: profile?.hourly_rate ?? null,
            skills: profile?.skills || [],
            is_verified: profile?.is_verified !== false,
            resume_name: profile?.resume_name || null,
            has_resume: !!profile?.resume_name
        };
    }

    function proposalsFor(jobId) {
        return readTable('proposals').filter((p) => p.job_id === jobId);
    }

    function decorateJob(job) {
        const out = clone(job);
        out.client = clientSnippet(findProfile(job.client_id));
        out.proposals_count = proposalsFor(job.id).length;
        return out;
    }

    function decorateProposal(proposal, opts) {
        const out = clone(proposal);
        const job = readTable('jobs').find((j) => j.id === proposal.job_id) || null;
        if (opts && opts.withJob && job) {
            out.job = {
                id: job.id, title: job.title, category: job.category,
                budget_min: job.budget_min, budget_max: job.budget_max,
                status: job.status, client_id: job.client_id
            };
        }
        if (opts && opts.withFreelancer) {
            out.freelancer = freelancerSnippet(findProfile(proposal.freelancer_id));
        }
        return out;
    }

    // Amounts arrive from form fields as strings. PostgREST would answer a
    // non-numeric value with a cast error, so refuse it here rather than let
    // parseFloat quietly store 0 for a typo.
    function coerceAmount(value, label) {
        if (value === null || value === undefined || String(value).trim() === '') return null;
        const amount = Number(value);
        if (!Number.isFinite(amount)) throw new Error(label + ' must be a number.');
        return amount;
    }

    // Mirrors the CHECK constraints on public.jobs so a job the offline engine
    // accepts is a job the database would also accept.
    function validateJobRow(job) {
        if (job.title.length < 5 || job.title.length > 150) {
            throw new Error('Job title must be 5-150 characters.');
        }
        if (job.description.length < 20) {
            throw new Error('Job description must be at least 20 characters.');
        }
        if (!job.category) throw new Error('Job category is required.');
        if (job.job_type !== 'fixed' && job.job_type !== 'hourly') {
            throw new Error('Invalid job type.');
        }
        if (!['entry', 'intermediate', 'expert'].includes(job.experience_level)) {
            throw new Error('Invalid experience level.');
        }
        if (job.budget_min === null || !(job.budget_min >= 0)) {
            throw new Error('A minimum budget of zero or more is required.');
        }
        if (job.budget_max !== null && job.budget_max < job.budget_min) {
            throw new Error('Maximum budget must be at least the minimum.');
        }
        if (job.hourly_rate_min !== null && job.hourly_rate_min < 0) {
            throw new Error('Hourly rate cannot be negative.');
        }
        if (job.hourly_rate_min !== null && job.hourly_rate_max !== null &&
            job.hourly_rate_max < job.hourly_rate_min) {
            throw new Error('Maximum hourly rate must be at least the minimum.');
        }
    }

    // Mirrors the CHECK constraints on public.proposals.
    function validateProposalRow(proposal) {
        if (proposal.cover_letter.length < 20) {
            throw new Error('Your proposal needs at least 20 characters.');
        }
        if (!(proposal.bid_amount > 0)) {
            throw new Error('Your bid must be greater than zero.');
        }
        if (!Number.isInteger(proposal.delivery_time_days) || proposal.delivery_time_days < 1) {
            throw new Error('Delivery time must be a whole number of days, at least one.');
        }
    }

    function currentUserRecord() {
        const session = readSession();
        if (!session || !session.userId) return null;
        const profile = findProfile(session.userId);
        if (!profile) return null;
        return profile;
    }

    function requireUser(message) {
        const profile = currentUserRecord();
        if (!profile) throw new Error(message || 'Please sign in first.');
        return profile;
    }

    function authUser(profile) {
        return {
            id: profile.id,
            email: profile._email || (profile.id + '@local.marketplace'),
            user_metadata: { full_name: profile.full_name, role: profile.role },
            profile: publicProfile(profile)
        };
    }

    // ------------------------------------------------------------------
    // Auth service (mirrors GahonshDB.Auth)
    // ------------------------------------------------------------------
    const listeners = [];

    function emit(event, user) {
        listeners.forEach((cb) => {
            try { cb(event, user ? { user } : null, user); } catch (e) { /* ignore */ }
        });
    }

    const Auth = {
        async getSession() {
            const profile = currentUserRecord();
            return profile ? { user: authUser(profile) } : null;
        },

        async getCurrentUser() {
            const profile = currentUserRecord();
            return profile ? authUser(profile) : null;
        },

        async signUp(email, password, fullName, role = 'freelancer') {
            await delay(120);
            const normalized = String(email || '').trim().toLowerCase();
            if (!normalized || !password) throw new Error('Email and password are required.');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
                throw new Error('Enter a valid email address.');
            }
            // Supabase Auth rejects short passwords before the account exists, so
            // the offline engine has to refuse them too — otherwise a demo
            // account works here and fails the moment a live project is wired up.
            if (String(password).length < 6) {
                throw new Error('Password must be at least 6 characters.');
            }

            const profiles = readTable('profiles');
            if (profiles.some((p) => (p._email || '').toLowerCase() === normalized)) {
                throw new Error('An account with this email already exists.');
            }

            const salt = newId('salt');
            const profile = {
                id: newId('user'),
                _email: normalized,
                _salt: salt,
                _hash: await hashPassword(password, salt),
                full_name: (fullName || 'Member').trim(),
                role: role === 'client' ? 'client' : 'freelancer',
                location: '',
                is_verified: false,
                avatar_url: null,
                title: role === 'client' ? 'Client' : 'Freelance Specialist',
                bio: '',
                hourly_rate: null,
                skills: [],
                created_at: nowIso(),
                updated_at: nowIso()
            };

            profiles.push(profile);
            writeTable('profiles', profiles);
            writeSession({ userId: profile.id, at: nowIso() });
            emit('SIGNED_IN', authUser(profile));
            return authUser(profile);
        },

        async signIn(email, password) {
            await delay(120);
            const normalized = String(email || '').trim().toLowerCase();
            const profiles = readTable('profiles');
            const profile = profiles.find((p) => (p._email || '').toLowerCase() === normalized);
            if (!profile) throw new Error('No account found with that email. Please create one.');

            const hash = await hashPassword(password, profile._salt);
            if (hash !== profile._hash) throw new Error('Incorrect password. Please try again.');

            writeSession({ userId: profile.id, at: nowIso() });
            emit('SIGNED_IN', authUser(profile));
            return authUser(profile);
        },

        async signOut() {
            writeSession(null);
            emit('SIGNED_OUT', null);
        },

        async onAuthStateChange(callback) {
            listeners.push(callback);
            return {
                unsubscribe: () => {
                    const i = listeners.indexOf(callback);
                    if (i >= 0) listeners.splice(i, 1);
                }
            };
        }
    };

    // ------------------------------------------------------------------
    // Profiles service
    // ------------------------------------------------------------------
    const Profiles = {
        async getMyProfile() {
            const profile = currentUserRecord();
            return profile ? publicProfile(profile) : null;
        },

        async updateMyProfile(updates) {
            const profile = requireUser('Unauthorized: Please sign in first.');
            const safe = sanitizeProfileUpdates(updates);
            const profiles = readTable('profiles');
            const index = profiles.findIndex((p) => p.id === profile.id);
            profiles[index] = Object.assign({}, profiles[index], safe, { updated_at: nowIso() });
            writeTable('profiles', profiles);
            return publicProfile(profiles[index]);
        },

        async getPublicFreelancers(filters = {}) {
            let rows = readTable('profiles').filter((p) => p.role === 'freelancer');
            const search = String(filters.search || '').trim().toLowerCase();
            if (search) {
                rows = rows.filter((p) =>
                    (p.full_name || '').toLowerCase().includes(search) ||
                    (p.title || '').toLowerCase().includes(search) ||
                    (p.bio || '').toLowerCase().includes(search) ||
                    (p.skills || []).some((s) => String(s).toLowerCase().includes(search))
                );
            }
            if (filters.skill) {
                rows = rows.filter((p) => (p.skills || []).includes(filters.skill));
            }
            if (filters.availability && filters.availability !== 'all') {
                rows = rows.filter((p) => (p.availability || 'available') === filters.availability);
            }
            if (filters.verifiedOnly) {
                rows = rows.filter((p) => !!p.is_verified);
            }

            const talentSort = {
                rate_low: (a, b) => Number(a.hourly_rate || 0) - Number(b.hourly_rate || 0),
                rate_high: (a, b) => Number(b.hourly_rate || 0) - Number(a.hourly_rate || 0),
                newest: (a, b) => new Date(b.created_at) - new Date(a.created_at)
            }[filters.sort] || ((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return rows.sort(talentSort).map(publicProfile);
        },

        async getPublicProfile(userId) {
            return publicProfile(findProfile(userId));
        },

        // --- Resume (PDF) -------------------------------------------------
        // Bytes live in IndexedDB under `resume:<user id>`; only metadata is
        // stored on the profile, so talent listings stay small. Viewing needs
        // a signed-in user, matching the authenticated-only Supabase bucket.
        async uploadResume(file) {
            const profile = requireUser('Please sign in to upload your resume.');
            if (profile.role !== 'freelancer') {
                throw new Error('Only freelancer profiles can upload a resume.');
            }
            validateResumeFile(file);

            await idbPut('resume:' + profile.id, file);
            const profiles = readTable('profiles');
            const index = profiles.findIndex((p) => p.id === profile.id);
            profiles[index] = Object.assign({}, profiles[index], {
                resume_name: safeFileName(file.name),
                resume_size_bytes: file.size || 0,
                resume_updated_at: nowIso(),
                updated_at: nowIso()
            });
            writeTable('profiles', profiles);
            return publicProfile(profiles[index]);
        },

        async getResume(userId) {
            requireUser('Please sign in to view resumes.');
            const profile = findProfile(userId);
            if (!profile || !profile.resume_name) return null;

            const blob = await idbGet('resume:' + userId);
            if (!blob) throw new Error('This resume is no longer available in this browser.');
            const url = URL.createObjectURL(blob);
            return {
                url,
                name: profile.resume_name,
                revoke: () => URL.revokeObjectURL(url)
            };
        },

        async removeResume() {
            const profile = requireUser('Please sign in to remove your resume.');
            try { await idbDelete('resume:' + profile.id); } catch (e) { /* orphan blob is harmless */ }

            const profiles = readTable('profiles');
            const index = profiles.findIndex((p) => p.id === profile.id);
            profiles[index] = Object.assign({}, profiles[index], {
                resume_name: null,
                resume_size_bytes: null,
                resume_updated_at: null,
                updated_at: nowIso()
            });
            writeTable('profiles', profiles);
            return publicProfile(profiles[index]);
        }
    };

    // ------------------------------------------------------------------
    // Jobs service
    // ------------------------------------------------------------------
    const Jobs = {
        async getOpenJobs(filters = {}) {
            let rows = readTable('jobs').filter((j) => j.status === 'open');

            if (filters.category && filters.category !== 'all') {
                rows = rows.filter((j) => j.category === filters.category);
            }
            if (filters.job_type && filters.job_type !== 'all') {
                rows = rows.filter((j) => j.job_type === filters.job_type);
            }
            if (filters.experience_level && filters.experience_level !== 'all') {
                rows = rows.filter((j) => j.experience_level === filters.experience_level);
            }
            if (filters.minBudget) {
                rows = rows.filter((j) => Number(j.budget_min || 0) >= parseFloat(filters.minBudget));
            }
            if (filters.maxBudget) {
                rows = rows.filter((j) => Number(j.budget_min || 0) <= parseFloat(filters.maxBudget));
            }
            if (filters.skill) {
                rows = rows.filter((j) => (j.required_skills || []).includes(filters.skill));
            }
            const search = String(filters.search || '').trim().toLowerCase();
            if (search) {
                rows = rows.filter((j) =>
                    (j.title || '').toLowerCase().includes(search) ||
                    (j.description || '').toLowerCase().includes(search) ||
                    (j.required_skills || []).some((s) => String(s).toLowerCase().includes(search))
                );
            }

            const jobSort = {
                newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
                budget_high: (a, b) => Number(b.budget_min || 0) - Number(a.budget_min || 0),
                budget_low: (a, b) => Number(a.budget_min || 0) - Number(b.budget_min || 0),
                proposals_few: (a, b) => Number(a.proposals_count || 0) - Number(b.proposals_count || 0)
            }[filters.sort] || ((a, b) => new Date(b.created_at) - new Date(a.created_at));

            rows.sort(jobSort);
            return rows.map(decorateJob);
        },

        async getJobById(jobId) {
            const job = readTable('jobs').find((j) => j.id === jobId);
            if (!job) return null;
            const out = decorateJob(job);
            out.attachments = [];
            return out;
        },

        async createJob(jobData) {
            const profile = requireUser('You must be logged in as a Client to post a job.');
            if (profile.role !== 'client' && profile.role !== 'admin') {
                throw new Error('Only Client accounts can post jobs.');
            }

            const job = {
                id: newId('job'),
                client_id: profile.id,
                title: String(jobData.title || '').trim(),
                description: String(jobData.description || '').trim(),
                category: jobData.category,
                required_skills: Array.isArray(jobData.required_skills) ? jobData.required_skills : [],
                job_type: jobData.job_type || 'fixed',
                budget_min: coerceAmount(jobData.budget_min, 'Minimum budget') || 0,
                budget_max: coerceAmount(jobData.budget_max, 'Maximum budget'),
                hourly_rate_min: coerceAmount(jobData.hourly_rate_min, 'Minimum hourly rate'),
                hourly_rate_max: coerceAmount(jobData.hourly_rate_max, 'Maximum hourly rate'),
                experience_level: jobData.experience_level || 'intermediate',
                estimated_duration: jobData.estimated_duration || '1 to 3 months',
                status: 'open',
                created_at: nowIso()
            };
            validateJobRow(job);

            const rows = readTable('jobs');
            rows.push(job);
            writeTable('jobs', rows);
            return decorateJob(job);
        },

        async getMyJobs() {
            const profile = currentUserRecord();
            if (!profile) return [];
            const rows = readTable('jobs')
                .filter((j) => j.client_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return rows.map((j) => {
                const out = decorateJob(j);
                out.proposals = proposalsFor(j.id).map((p) => ({
                    id: p.id, status: p.status, bid_amount: p.bid_amount
                }));
                return out;
            });
        },

        async updateJob(jobId, updates) {
            updates = updates || {};
            const profile = requireUser('Please sign in to edit this project.');
            const rows = readTable('jobs');
            const index = rows.findIndex((j) => j.id === jobId);
            if (index < 0) throw new Error('Job not found.');
            const job = rows[index];
            // Mirror the UPDATE policy: only the project owner or an admin.
            if (job.client_id !== profile.id && profile.role !== 'admin') {
                throw new Error('Only the project owner can edit this job.');
            }
            if (job.status === 'completed' || job.status === 'cancelled') {
                throw new Error('Closed jobs cannot be edited.');
            }

            const next = Object.assign({}, job);
            ['title', 'description', 'category', 'estimated_duration', 'experience_level'].forEach((key) => {
                if (updates[key] !== undefined) next[key] = String(updates[key]).trim();
            });
            if (updates.required_skills !== undefined) {
                next.required_skills = Array.isArray(updates.required_skills)
                    ? updates.required_skills.map((s) => String(s).trim()).filter(Boolean)
                    : [];
            }
            if (updates.job_type !== undefined) next.job_type = updates.job_type;
            ['budget_min', 'budget_max', 'hourly_rate_min', 'hourly_rate_max'].forEach((key) => {
                if (updates[key] !== undefined) {
                    next[key] = coerceAmount(updates[key], key.replace(/_/g, ' '));
                }
            });

            validateJobRow(next);

            next.updated_at = nowIso();
            rows[index] = next;
            writeTable('jobs', rows);
            return decorateJob(next);
        },

        async updateJobStatus(jobId, newStatus) {
            const profile = requireUser('Please sign in to update this project.');
            const rows = readTable('jobs');
            const index = rows.findIndex((j) => j.id === jobId);
            if (index < 0) throw new Error('Job not found.');
            const job = rows[index];
            // Mirror the UPDATE policy: only the project owner or an admin.
            if (job.client_id !== profile.id && profile.role !== 'admin') {
                throw new Error('Only the project owner can change its status.');
            }
            // Mirror validate_job_mutation(): the same state machine the trigger
            // enforces, so the local engine cannot move a job to a state the
            // database would reject.
            const allowed = {
                draft: ['open', 'cancelled'],
                open: ['in_progress', 'cancelled'],
                in_progress: ['completed', 'cancelled'],
                completed: [],
                cancelled: []
            };
            if (newStatus !== job.status) {
                const next = allowed[job.status] || [];
                if (!next.includes(newStatus)) {
                    throw new Error('This project cannot move from ' + job.status + ' to ' + newStatus + '.');
                }
            }
            rows[index] = Object.assign({}, job, { status: newStatus });
            writeTable('jobs', rows);
            return decorateJob(rows[index]);
        }
    };

    // ------------------------------------------------------------------
    // Proposals service
    // ------------------------------------------------------------------
    const Proposals = {
        async submitProposal(jobId, coverLetter, bidAmount, deliveryDays, attachmentUrls = []) {
            const profile = requireUser('Please sign in as a Freelancer to submit a proposal.');
            if (profile.role === 'client') {
                throw new Error('Clients cannot submit proposals.');
            }

            const job = readTable('jobs').find((j) => j.id === jobId);
            if (!job) throw new Error('This project could not be found.');
            if (job.status !== 'open') throw new Error('This project is no longer accepting proposals.');

            const rows = readTable('proposals');
            if (rows.some((p) => p.job_id === jobId && p.freelancer_id === profile.id && p.status !== 'withdrawn')) {
                throw new Error('You have already submitted a proposal for this project.');
            }

            const proposal = {
                id: newId('proposal'),
                job_id: jobId,
                freelancer_id: profile.id,
                cover_letter: String(coverLetter || '').trim(),
                bid_amount: coerceAmount(bidAmount, 'Your bid'),
                delivery_time_days: coerceAmount(deliveryDays, 'Delivery time'),
                attachment_urls: attachmentUrls,
                status: 'submitted',
                created_at: nowIso()
            };
            validateProposalRow(proposal);
            rows.push(proposal);
            writeTable('proposals', rows);
            pushNotification(
                job.client_id,
                'proposal',
                'New proposal on "' + job.title + '"',
                'A freelancer submitted a bid. Review it in your portal.',
                'marketplace-dashboard.html#primary'
            );
            return decorateProposal(proposal, { withFreelancer: true, withJob: true });
        },

        async getMyProposals() {
            const profile = currentUserRecord();
            if (!profile) return [];
            return readTable('proposals')
                .filter((p) => p.freelancer_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((p) => decorateProposal(p, { withJob: true }));
        },

        async getProposalsForJob(jobId) {
            const profile = currentUserRecord();
            if (!profile) return [];
            const job = readTable('jobs').find((j) => j.id === jobId);
            // Mirror the SELECT policy: the job owner and admins see every
            // proposal; everyone else sees only their own, so one bidder can
            // never read a competitor's cover letter or bid.
            const seesAll = profile.role === 'admin' || (job && job.client_id === profile.id);
            return proposalsFor(jobId)
                .filter((p) => seesAll || p.freelancer_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((p) => decorateProposal(p, { withFreelancer: true }));
        },

        async withdrawProposal(proposalId) {
            const profile = requireUser('Please sign in as a Freelancer to withdraw a proposal.');
            const rows = readTable('proposals');
            const index = rows.findIndex((p) => p.id === proposalId);
            if (index < 0) throw new Error('Proposal not found.');
            // Mirror the UPDATE policy: only the submitter (or an admin) may
            // withdraw, and only while the proposal is still live.
            if (rows[index].freelancer_id !== profile.id && profile.role !== 'admin') {
                throw new Error('You can only withdraw your own proposal.');
            }
            if (!['submitted', 'shortlisted'].includes(rows[index].status)) {
                throw new Error('This proposal can no longer be withdrawn.');
            }
            rows[index] = Object.assign({}, rows[index], { status: 'withdrawn' });
            writeTable('proposals', rows);
            return decorateProposal(rows[index]);
        },

        /**
         * Mirrors set_proposal_status(): only the job owner (or an admin) may
         * shortlist, restore or decline a bid, only while the job is open, and
         * never once the bid has been accepted or withdrawn. Hiring itself is
         * Contracts.acceptProposalAndHire().
         */
        async setStatus(proposalId, status) {
            const profile = requireUser('Please sign in to review proposals.');
            if (!['submitted', 'shortlisted', 'rejected'].includes(status)) {
                throw new Error('A proposal can only be shortlisted, restored or declined here.');
            }

            const rows = readTable('proposals');
            const index = rows.findIndex((p) => p.id === proposalId);
            if (index < 0) throw new Error('Proposal not found.');

            const job = readTable('jobs').find((j) => j.id === rows[index].job_id);
            if (!job) throw new Error('Job not found.');
            if (job.client_id !== profile.id && profile.role !== 'admin') {
                throw new Error('Only the client who posted the job can review proposals.');
            }
            if (job.status !== 'open') {
                throw new Error('Proposals can only be reviewed while the job is open.');
            }
            if (['accepted', 'withdrawn'].includes(rows[index].status)) {
                throw new Error('This proposal can no longer be changed (' + rows[index].status + ').');
            }

            rows[index] = Object.assign({}, rows[index], { status, updated_at: nowIso() });
            writeTable('proposals', rows);
            pushNotification(
                rows[index].freelancer_id,
                'proposal-status',
                'Your proposal is now ' + status,
                'The client updated your bid on "' + job.title + '".',
                'marketplace-dashboard.html#primary'
            );
            return decorateProposal(rows[index]);
        },

        async getMyProposalForJob(jobId) {
            const profile = currentUserRecord();
            if (!profile) return null;
            const found = readTable('proposals')
                .find((p) => p.job_id === jobId && p.freelancer_id === profile.id);
            return found ? decorateProposal(found) : null;
        }
    };

    // ------------------------------------------------------------------
    // Contracts service
    // ------------------------------------------------------------------
    const Contracts = {
        async acceptProposalAndHire(proposalId) {
            const profile = requireUser('Please sign in to hire a freelancer.');

            const proposals = readTable('proposals');
            const index = proposals.findIndex((p) => p.id === proposalId);
            if (index < 0) throw new Error('Proposal not found.');

            const proposal = proposals[index];
            const jobs = readTable('jobs');
            const jobIndex = jobs.findIndex((j) => j.id === proposal.job_id);
            if (jobIndex < 0) throw new Error('Job not found.');

            const job = jobs[jobIndex];
            if (job.client_id !== profile.id) {
                throw new Error('Only the project owner can hire a freelancer.');
            }
            if (job.status !== 'open') {
                throw new Error('This project is no longer open for hiring.');
            }
            // Mirror the RPC: a withdrawn, rejected or already-accepted
            // proposal can never be hired.
            if (['withdrawn', 'rejected', 'accepted'].includes(proposal.status)) {
                throw new Error('This proposal can no longer be accepted.');
            }

            // One contract per job: reject if one already exists.
            const contracts = readTable('contracts');
            if (contracts.some((c) => c.job_id === job.id)) {
                throw new Error('A contract already exists for this project.');
            }

            const contract = {
                id: newId('contract'),
                job_id: job.id,
                client_id: job.client_id,
                freelancer_id: proposal.freelancer_id,
                proposal_id: proposal.id,
                agreed_amount: proposal.bid_amount,
                status: 'active',
                created_at: nowIso()
            };
            contracts.push(contract);
            writeTable('contracts', contracts);

            // Accept the winning proposal, reject the rest, close the job.
            proposals.forEach((p, i) => {
                if (p.job_id !== job.id) return;
                if (p.id === proposal.id) proposals[i] = Object.assign({}, p, { status: 'accepted' });
                else if (p.status === 'submitted' || p.status === 'shortlisted') {
                    proposals[i] = Object.assign({}, p, { status: 'rejected' });
                }
            });
            writeTable('proposals', proposals);

            jobs[jobIndex] = Object.assign({}, job, { status: 'in_progress' });
            writeTable('jobs', jobs);

            return contract.id;
        },

        async getContractForJob(jobId) {
            const profile = currentUserRecord();
            if (!profile) return null;
            const contract = readTable('contracts').find((c) => c.job_id === jobId);
            if (!contract) return null;
            // Mirror the SELECT policy: only the two parties or an admin may
            // read a contract, so the agreed amount never leaks to a stranger.
            if (contract.client_id !== profile.id && contract.freelancer_id !== profile.id
                && profile.role !== 'admin') {
                return null;
            }
            return decorateContract(contract);
        },

        async getMyContracts() {
            const profile = currentUserRecord();
            if (!profile) return [];
            return readTable('contracts')
                .filter((c) => c.client_id === profile.id || c.freelancer_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map(decorateContract);
        },

        async completeContract(contractId) {
            const profile = requireUser('Please sign in to complete this contract.');
            const contracts = readTable('contracts');
            const index = contracts.findIndex((c) => c.id === contractId);
            if (index < 0) throw new Error('Contract not found.');
            const contract = contracts[index];
            // Mirrors complete_contract(): only the client (or an admin) signs off.
            if (contract.client_id !== profile.id && profile.role !== 'admin') {
                throw new Error('Only the client can complete this contract.');
            }
            if (contract.status !== 'active') {
                throw new Error('Only active contracts can be completed.');
            }
            const jobs = readTable('jobs');
            const jobIndex = jobs.findIndex((j) => j.id === contract.job_id);
            if (jobIndex < 0) throw new Error('Job not found.');
            if (jobs[jobIndex].status !== 'in_progress') {
                throw new Error('Job is not in progress.');
            }

            const now = nowIso();
            contracts[index] = Object.assign({}, contract, { status: 'completed', updated_at: now });
            jobs[jobIndex] = Object.assign({}, jobs[jobIndex], { status: 'completed', updated_at: now });
            writeTable('contracts', contracts);
            writeTable('jobs', jobs);
            return decorateContract(contracts[index]);
        },

        async cancelContract(contractId) {
            const profile = requireUser('Please sign in to cancel this contract.');
            const contracts = readTable('contracts');
            const index = contracts.findIndex((c) => c.id === contractId);
            if (index < 0) throw new Error('Contract not found.');
            const contract = contracts[index];
            // Mirrors cancel_contract(): either party may stop it, nobody else.
            if (contract.client_id !== profile.id && contract.freelancer_id !== profile.id
                && profile.role !== 'admin') {
                throw new Error('Only the client or the freelancer can cancel this contract.');
            }
            if (contract.status !== 'active') {
                throw new Error('Only active contracts can be cancelled.');
            }

            const now = nowIso();
            contracts[index] = Object.assign({}, contract, { status: 'cancelled', updated_at: now });
            writeTable('contracts', contracts);

            const jobs = readTable('jobs');
            const jobIndex = jobs.findIndex((j) => j.id === contract.job_id);
            if (jobIndex >= 0 && jobs[jobIndex].status === 'in_progress') {
                jobs[jobIndex] = Object.assign({}, jobs[jobIndex], { status: 'cancelled', updated_at: now });
                writeTable('jobs', jobs);
            }

            return decorateContract(contracts[index]);
        },

        async raiseDispute(contractId) {
            const profile = requireUser('Please sign in to raise a dispute.');
            const contracts = readTable('contracts');
            const index = contracts.findIndex((c) => c.id === contractId);
            if (index < 0) throw new Error('Contract not found.');
            const contract = contracts[index];
            // Mirrors raise_contract_dispute(): the two parties, or an admin.
            if (contract.client_id !== profile.id && contract.freelancer_id !== profile.id
                && profile.role !== 'admin') {
                throw new Error('Only the client or the freelancer can dispute this contract.');
            }
            if (contract.status !== 'active') {
                throw new Error('Only active contracts can be disputed.');
            }

            const now = nowIso();
            // The job stays in_progress: the engagement is under review, not over.
            contracts[index] = Object.assign({}, contract, { status: 'disputed', updated_at: now });
            writeTable('contracts', contracts);
            return decorateContract(contracts[index]);
        }
    };

    // ------------------------------------------------------------------
    // Contract milestones (mirrors contract_milestones + the trigger
    // validate_milestone_mutation). A manual checklist: no money moves.
    // ------------------------------------------------------------------
    function milestoneContract(contractId) {
        return readTable('contracts').find((c) => c.id === contractId) || null;
    }

    function isContractParty(contract, profile) {
        return !!contract && !!profile &&
            (contract.client_id === profile.id || contract.freelancer_id === profile.id);
    }

    function sortMilestones(rows) {
        return rows.slice().sort((a, b) => {
            const pos = (Number(a.position) || 0) - (Number(b.position) || 0);
            return pos !== 0 ? pos : new Date(a.created_at) - new Date(b.created_at);
        });
    }

    const Milestones = {
        async list(contractId) {
            const profile = currentUserRecord();
            if (!profile) return [];
            const contract = milestoneContract(contractId);
            // Mirrors the SELECT policy: only the two parties (or an admin).
            if (!isContractParty(contract, profile) && profile.role !== 'admin') return [];
            return sortMilestones(
                readTable('contract_milestones').filter((m) => m.contract_id === contractId)
            ).map(clone);
        },

        async add({ contractId, title, amount = null, dueDate = null } = {}) {
            const profile = requireUser('Please sign in to add a milestone.');
            const contract = milestoneContract(contractId);
            if (!contract) throw new Error('This contract could not be found.');
            if (!isContractParty(contract, profile) && profile.role !== 'admin') {
                throw new Error('Only the client or the freelancer can add milestones.');
            }
            if (contract.status !== 'active' && profile.role !== 'admin') {
                throw new Error('Milestones can only change while the contract is active.');
            }

            const clean = String(title || '').trim();
            if (clean.length < 3) throw new Error('Give the milestone a title of at least 3 characters.');
            if (clean.length > 140) throw new Error('Keep the milestone title under 140 characters.');

            let value = null;
            if (amount !== null && amount !== undefined && String(amount).trim() !== '') {
                value = Number(amount);
                if (!Number.isFinite(value) || value < 0) {
                    throw new Error('A milestone amount must be zero or more.');
                }
            }

            const rows = readTable('contract_milestones');
            const milestone = {
                id: newId('milestone'),
                contract_id: contractId,
                title: clean,
                amount: value,
                due_date: dueDate || null,
                position: rows.filter((m) => m.contract_id === contractId).length,
                status: 'pending',
                created_by: profile.id,
                delivered_at: null,
                accepted_at: null,
                created_at: nowIso(),
                updated_at: nowIso()
            };
            rows.push(milestone);
            writeTable('contract_milestones', rows);
            return clone(milestone);
        },

        /**
         * Mirrors the trigger: the freelancer marks work delivered, the client
         * accepts it, an accepted milestone is final, and nothing moves on a
         * contract that is no longer active.
         */
        async setStatus(milestoneId, status) {
            const profile = requireUser('Please sign in to update a milestone.');
            if (!['pending', 'delivered', 'accepted'].includes(status)) {
                throw new Error('Unknown milestone status.');
            }

            const rows = readTable('contract_milestones');
            const index = rows.findIndex((m) => m.id === milestoneId);
            if (index < 0) throw new Error('Milestone not found.');

            const current = rows[index];
            const contract = milestoneContract(current.contract_id);
            if (!contract) throw new Error('This contract could not be found.');
            if (!isContractParty(contract, profile) && profile.role !== 'admin') {
                throw new Error('Only the client or the freelancer can update milestones.');
            }
            if (contract.status !== 'active' && profile.role !== 'admin') {
                throw new Error('Milestones can only change while the contract is active.');
            }

            const isAdmin = profile.role === 'admin';
            const next = Object.assign({}, current, { status, updated_at: nowIso() });

            if (status !== current.status) {
                if (status === 'delivered') {
                    if (!isAdmin && profile.id !== contract.freelancer_id) {
                        throw new Error('Only the freelancer can mark a milestone delivered.');
                    }
                    if (current.status === 'accepted') {
                        throw new Error('An accepted milestone cannot be delivered again.');
                    }
                    next.delivered_at = nowIso();
                } else if (status === 'accepted') {
                    if (!isAdmin && profile.id !== contract.client_id) {
                        throw new Error('Only the client can accept a milestone.');
                    }
                    if (current.status !== 'delivered') {
                        throw new Error('A milestone must be delivered before it can be accepted.');
                    }
                    next.accepted_at = nowIso();
                } else {
                    if (current.status === 'accepted' && !isAdmin) {
                        throw new Error('An accepted milestone can no longer be reopened.');
                    }
                    next.delivered_at = null;
                    next.accepted_at = null;
                }
            }

            rows[index] = next;
            writeTable('contract_milestones', rows);
            return clone(next);
        },

        async remove(milestoneId) {
            const profile = requireUser('Please sign in to remove a milestone.');
            const rows = readTable('contract_milestones');
            const index = rows.findIndex((m) => m.id === milestoneId);
            if (index < 0) throw new Error('Milestone not found.');

            const contract = milestoneContract(rows[index].contract_id);
            if (!contract) throw new Error('This contract could not be found.');
            if (!isContractParty(contract, profile) && profile.role !== 'admin') {
                throw new Error('Only the client or the freelancer can remove milestones.');
            }
            if (contract.status !== 'active' && profile.role !== 'admin') {
                throw new Error('Milestones can only change while the contract is active.');
            }
            // An accepted milestone is the client's record of signed-off work.
            if (rows[index].status === 'accepted' && profile.role !== 'admin'
                && contract.client_id !== profile.id) {
                throw new Error('Only the client can remove an accepted milestone.');
            }

            rows.splice(index, 1);
            writeTable('contract_milestones', rows);
            return true;
        }
    };

    // ------------------------------------------------------------------
    // Discovery: saved jobs, saved talent, invitations
    // ------------------------------------------------------------------
    const SavedJobs = {
        async ids() {
            const profile = currentUserRecord();
            if (!profile) return [];
            return readTable('saved_jobs')
                .filter((row) => row.freelancer_id === profile.id)
                .map((row) => row.job_id);
        },

        async list() {
            const profile = currentUserRecord();
            if (!profile) return [];
            const jobs = readTable('jobs');
            return readTable('saved_jobs')
                .filter((row) => row.freelancer_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((row) => {
                    const job = jobs.find((j) => j.id === row.job_id);
                    return job ? Object.assign(decorateJob(job), { saved_at: row.created_at }) : null;
                })
                .filter(Boolean);
        },

        async save(jobId) {
            const profile = requireUser('Please sign in to save a job.');
            if (!readTable('jobs').some((j) => j.id === jobId)) {
                throw new Error('This project could not be found.');
            }
            const rows = readTable('saved_jobs');
            if (!rows.some((row) => row.freelancer_id === profile.id && row.job_id === jobId)) {
                rows.push({ freelancer_id: profile.id, job_id: jobId, created_at: nowIso() });
                writeTable('saved_jobs', rows);
            }
            return true;
        },

        async remove(jobId) {
            const profile = requireUser('Please sign in to change your saved jobs.');
            writeTable('saved_jobs', readTable('saved_jobs')
                .filter((row) => !(row.freelancer_id === profile.id && row.job_id === jobId)));
            return false;
        },

        async toggle(jobId) {
            const ids = await SavedJobs.ids();
            return ids.includes(jobId) ? SavedJobs.remove(jobId) : SavedJobs.save(jobId);
        }
    };

    const SavedTalent = {
        async ids() {
            const profile = currentUserRecord();
            if (!profile) return [];
            return readTable('saved_talent')
                .filter((row) => row.client_id === profile.id)
                .map((row) => row.freelancer_id);
        },

        async list() {
            const profile = currentUserRecord();
            if (!profile) return [];
            const profiles = readTable('profiles');
            return readTable('saved_talent')
                .filter((row) => row.client_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((row) => publicProfile(profiles.find((p) => p.id === row.freelancer_id)))
                .filter(Boolean);
        },

        async save(freelancerId) {
            const profile = requireUser('Please sign in to save talent.');
            if (profile.id === freelancerId) throw new Error('You cannot save your own profile.');
            const target = findProfile(freelancerId);
            if (!target) throw new Error('This freelancer could not be found.');
            const rows = readTable('saved_talent');
            if (!rows.some((row) => row.client_id === profile.id && row.freelancer_id === freelancerId)) {
                rows.push({ client_id: profile.id, freelancer_id: freelancerId, created_at: nowIso() });
                writeTable('saved_talent', rows);
            }
            return true;
        },

        async remove(freelancerId) {
            const profile = requireUser('Please sign in to change your saved talent.');
            writeTable('saved_talent', readTable('saved_talent')
                .filter((row) => !(row.client_id === profile.id && row.freelancer_id === freelancerId)));
            return false;
        },

        async toggle(freelancerId) {
            const ids = await SavedTalent.ids();
            return ids.includes(freelancerId) ? SavedTalent.remove(freelancerId) : SavedTalent.save(freelancerId);
        }
    };

    function decorateInvitation(row, { withJob = false, withFreelancer = false, withClient = false } = {}) {
        const out = clone(row);
        if (withJob) out.job = readTable('jobs').find((j) => j.id === row.job_id) || null;
        if (withFreelancer) out.freelancer = publicProfile(findProfile(row.freelancer_id));
        if (withClient) out.client = clientSnippet(findProfile(row.client_id));
        return out;
    }

    const Invitations = {
        async send(jobId, freelancerId, message = '') {
            const profile = requireUser('Please sign in as a client to invite a freelancer.');
            const job = readTable('jobs').find((j) => j.id === jobId);
            if (!job) throw new Error('This project could not be found.');
            if (job.client_id !== profile.id && profile.role !== 'admin') {
                throw new Error('Only the client who owns this project can send an invitation.');
            }
            if (job.status !== 'open') throw new Error('Invitations can only be sent for an open project.');
            if (profile.id === freelancerId) throw new Error('You cannot invite yourself.');

            const target = findProfile(freelancerId);
            if (!target) throw new Error('Freelancer not found.');
            if (target.role !== 'freelancer' && target.role !== 'admin') {
                throw new Error('Invitations can only be sent to a freelancer.');
            }

            const rows = readTable('invitations');
            if (rows.some((row) => row.job_id === jobId && row.freelancer_id === freelancerId)) {
                throw new Error('You have already invited this freelancer to that project.');
            }

            const invitation = {
                id: newId('invitation'),
                job_id: jobId,
                client_id: job.client_id,
                freelancer_id: freelancerId,
                message: String(message || '').trim().slice(0, 1000) || null,
                status: 'invited',
                responded_at: null,
                created_at: nowIso()
            };
            rows.push(invitation);
            writeTable('invitations', rows);

            pushNotification(
                freelancerId,
                'invitation',
                'You were invited to "' + job.title + '"',
                'A client would like you to look at their project and send a proposal.',
                'marketplace-dashboard.html#invitations'
            );
            return decorateInvitation(invitation, { withJob: true, withClient: true });
        },

        async listReceived() {
            const profile = currentUserRecord();
            if (!profile) return [];
            return readTable('invitations')
                .filter((row) => row.freelancer_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((row) => decorateInvitation(row, { withJob: true, withClient: true }));
        },

        async listSent() {
            const profile = currentUserRecord();
            if (!profile) return [];
            return readTable('invitations')
                .filter((row) => row.client_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((row) => decorateInvitation(row, { withJob: true, withFreelancer: true }));
        },

        async listForJob(jobId) {
            const profile = currentUserRecord();
            if (!profile) return [];
            const job = readTable('jobs').find((j) => j.id === jobId);
            if (!job) return [];
            if (job.client_id !== profile.id && profile.role !== 'admin') return [];
            return readTable('invitations')
                .filter((row) => row.job_id === jobId)
                .map((row) => decorateInvitation(row, { withFreelancer: true }));
        },

        async respond(invitationId, status) {
            const profile = requireUser('Please sign in to answer an invitation.');
            if (!['accepted', 'declined'].includes(status)) {
                throw new Error('An invitation can only be accepted or declined.');
            }
            const rows = readTable('invitations');
            const index = rows.findIndex((row) => row.id === invitationId);
            if (index < 0) throw new Error('Invitation not found.');
            if (rows[index].freelancer_id !== profile.id && profile.role !== 'admin') {
                throw new Error('Only the invited freelancer can answer this invitation.');
            }
            if (rows[index].status !== 'invited') {
                throw new Error('This invitation has already been answered.');
            }

            rows[index] = Object.assign({}, rows[index], { status, responded_at: nowIso() });
            writeTable('invitations', rows);

            const job = readTable('jobs').find((j) => j.id === rows[index].job_id);
            pushNotification(
                rows[index].client_id,
                'invitation-reply',
                'Invitation ' + status,
                'A freelancer ' + status + ' your invitation for "' + (job ? job.title : 'a project') + '".',
                'marketplace-dashboard.html#invitations'
            );
            return decorateInvitation(rows[index], { withJob: true });
        },

        async withdraw(invitationId) {
            const profile = requireUser('Please sign in to withdraw an invitation.');
            const rows = readTable('invitations');
            const index = rows.findIndex((row) => row.id === invitationId);
            if (index < 0) throw new Error('Invitation not found.');
            if (rows[index].client_id !== profile.id && profile.role !== 'admin') {
                throw new Error('Only the client can withdraw this invitation.');
            }
            if (rows[index].status !== 'invited') {
                throw new Error('This invitation has already been answered.');
            }
            rows[index] = Object.assign({}, rows[index], { status: 'withdrawn', responded_at: nowIso() });
            writeTable('invitations', rows);
            return decorateInvitation(rows[index], { withJob: true });
        }
    };

    // ------------------------------------------------------------------
    // Project Catalog
    // ------------------------------------------------------------------
    const CATALOG_TIERS = ['basic', 'standard', 'premium'];

    function sanitizePackage(pkg) {
        const source = pkg && typeof pkg === 'object' ? pkg : {};
        const title = String(source.title || '').trim();
        const description = String(source.description || '').trim();
        const category = String(source.category || '').trim();
        const tier = String(source.tier || 'basic').trim().toLowerCase();
        const price = Number(source.price);
        const deliveryDays = Number(source.delivery_days);
        const revisions = source.revisions === undefined || source.revisions === '' ? 1 : Number(source.revisions);

        if (title.length < 5 || title.length > 120) {
            throw new Error('Give the package a title of 5 to 120 characters.');
        }
        if (description.length < 20) {
            throw new Error('Describe the package in at least 20 characters.');
        }
        if (!category) throw new Error('Choose a category for the package.');
        if (!CATALOG_TIERS.includes(tier)) {
            throw new Error('Tier must be basic, standard or premium.');
        }
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error('Price must be greater than zero.');
        }
        if (!Number.isFinite(deliveryDays) || deliveryDays < 1 || deliveryDays > 180) {
            throw new Error('Delivery time must be between 1 and 180 days.');
        }
        if (!Number.isFinite(revisions) || revisions < 0 || revisions > 50) {
            throw new Error('Revisions must be between 0 and 50.');
        }

        return {
            title: title.slice(0, 120),
            description: description.slice(0, 4000),
            category: category.slice(0, 60),
            tier,
            price: Math.round(price * 100) / 100,
            delivery_days: Math.round(deliveryDays),
            revisions: Math.round(revisions),
            skills: Array.isArray(source.skills)
                ? source.skills.map((s) => String(s || '').trim().slice(0, 40)).filter(Boolean).slice(0, 20)
                : []
        };
    }

    function decoratePackage(row) {
        return Object.assign(clone(row), { freelancer: publicProfile(findProfile(row.freelancer_id)) });
    }

    const Catalog = {
        async list(filters = {}) {
            let rows = readTable('service_packages').filter((p) => p.is_active !== false);

            if (filters.category && filters.category !== 'all') {
                rows = rows.filter((p) => p.category === filters.category);
            }
            if (filters.tier && filters.tier !== 'all') {
                rows = rows.filter((p) => p.tier === filters.tier);
            }
            if (filters.maxPrice) {
                rows = rows.filter((p) => Number(p.price) <= Number(filters.maxPrice));
            }
            const search = String(filters.search || '').trim().toLowerCase();
            if (search) {
                rows = rows.filter((p) =>
                    (p.title || '').toLowerCase().includes(search) ||
                    (p.description || '').toLowerCase().includes(search) ||
                    (p.skills || []).some((s) => String(s).toLowerCase().includes(search))
                );
            }

            const catalogSort = {
                price_low: (a, b) => Number(a.price) - Number(b.price),
                price_high: (a, b) => Number(b.price) - Number(a.price),
                newest: (a, b) => new Date(b.created_at) - new Date(a.created_at)
            }[filters.sort] || ((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return rows.sort(catalogSort).map(decoratePackage);
        },

        async getById(packageId) {
            const row = readTable('service_packages').find((p) => p.id === packageId);
            return row ? decoratePackage(row) : null;
        },

        async listMine() {
            const profile = currentUserRecord();
            if (!profile) return [];
            return readTable('service_packages')
                .filter((p) => p.freelancer_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map(clone);
        },

        async create(pkg) {
            const profile = requireUser('Please sign in to publish a package.');
            if (profile.role !== 'freelancer' && profile.role !== 'admin') {
                throw new Error('Only a freelancer can publish a catalog package.');
            }
            const row = Object.assign(
                { id: newId('package'), freelancer_id: profile.id, is_active: true, created_at: nowIso(), updated_at: nowIso() },
                sanitizePackage(pkg)
            );
            const rows = readTable('service_packages');
            rows.push(row);
            writeTable('service_packages', rows);
            return clone(row);
        },

        async update(packageId, patch) {
            const profile = requireUser('Please sign in to edit a package.');
            const rows = readTable('service_packages');
            const index = rows.findIndex((p) => p.id === packageId);
            if (index < 0) throw new Error('Package not found.');
            if (rows[index].freelancer_id !== profile.id && profile.role !== 'admin') {
                throw new Error('You can only edit your own packages.');
            }

            const payload = {};
            if (patch && typeof patch === 'object') {
                if ('is_active' in patch) payload.is_active = !!patch.is_active;
                const editable = ['title', 'description', 'category', 'tier', 'price', 'delivery_days', 'revisions', 'skills'];
                if (editable.some((key) => key in patch)) {
                    const merged = sanitizePackage(Object.assign({}, rows[index], patch));
                    for (const key of editable) payload[key] = merged[key];
                }
            }
            if (!Object.keys(payload).length) throw new Error('Nothing to update.');

            rows[index] = Object.assign({}, rows[index], payload, { updated_at: nowIso() });
            writeTable('service_packages', rows);
            return clone(rows[index]);
        },

        async remove(packageId) {
            const profile = requireUser('Please sign in to remove a package.');
            const rows = readTable('service_packages');
            const target = rows.find((p) => p.id === packageId);
            if (!target) throw new Error('Package not found.');
            if (target.freelancer_id !== profile.id && profile.role !== 'admin') {
                throw new Error('You can only remove your own packages.');
            }
            writeTable('service_packages', rows.filter((p) => p.id !== packageId));
            return true;
        }
    };

    // ------------------------------------------------------------------
    // Notifications (read / mark / dismiss your own)
    // ------------------------------------------------------------------
    const Notifications = {
        async list(limit = 40) {
            const profile = currentUserRecord();
            if (!profile) return [];
            const max = Math.max(1, Math.min(200, Number(limit) || 40));
            return readTable('notifications')
                .filter((row) => row.user_id === profile.id)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, max)
                .map(clone);
        },

        async unreadCount() {
            const profile = currentUserRecord();
            if (!profile) return 0;
            return readTable('notifications')
                .filter((row) => row.user_id === profile.id && !row.is_read).length;
        },

        async markRead(notificationId) {
            const profile = requireUser('Please sign in.');
            const rows = readTable('notifications');
            const index = rows.findIndex((row) => row.id === notificationId);
            if (index < 0) throw new Error('Notification not found.');
            if (rows[index].user_id !== profile.id) {
                throw new Error('You can only change your own notifications.');
            }
            rows[index] = Object.assign({}, rows[index], { is_read: true });
            writeTable('notifications', rows);
            return true;
        },

        async markAllRead() {
            const profile = requireUser('Please sign in.');
            writeTable('notifications', readTable('notifications').map((row) =>
                row.user_id === profile.id ? Object.assign({}, row, { is_read: true }) : row));
            return true;
        },

        async remove(notificationId) {
            const profile = requireUser('Please sign in.');
            const rows = readTable('notifications');
            const target = rows.find((row) => row.id === notificationId);
            if (!target) throw new Error('Notification not found.');
            if (target.user_id !== profile.id) {
                throw new Error('You can only change your own notifications.');
            }
            writeTable('notifications', rows.filter((row) => row.id !== notificationId));
            return true;
        },

        async clear() {
            const profile = requireUser('Please sign in.');
            writeTable('notifications', readTable('notifications').filter((row) => row.user_id !== profile.id));
            return true;
        }
    };

    // ------------------------------------------------------------------
    // Contract messages (mirrors public.messages + its RLS policies): only
    // the client and the freelancer on a contract can read or post.
    // ------------------------------------------------------------------
    const Messages = {
        async list(contractId) {
            const profile = currentUserRecord();
            if (!profile || !contractId) return [];
            const contract = milestoneContract(contractId);
            if (!isContractParty(contract, profile) && profile.role !== 'admin') return [];
            return readTable('messages')
                .filter((m) => m.contract_id === contractId &&
                    (m.sender_id === profile.id || m.recipient_id === profile.id || profile.role === 'admin'))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .map(clone);
        },

        async send(contractId, body) {
            const profile = requireUser('Please sign in to send a message.');
            const contract = milestoneContract(contractId);
            if (!contract) throw new Error('This contract could not be found.');
            if (!isContractParty(contract, profile)) {
                throw new Error('Only the client or the freelancer can message on this contract.');
            }
            const text = String(body || '').trim();
            if (!text) throw new Error('Write a message first.');
            if (text.length > 2000) throw new Error('Keep the message under 2000 characters.');

            const recipient = contract.client_id === profile.id ? contract.freelancer_id : contract.client_id;
            const rows = readTable('messages');
            const message = {
                id: newId('message'),
                contract_id: contractId,
                sender_id: profile.id,
                recipient_id: recipient,
                body: text,
                created_at: nowIso()
            };
            rows.push(message);
            writeTable('messages', rows);
            return clone(message);
        }
    };

    const Reviews = {
        async getForContract(contractId) {
            if (!contractId) return [];
            return readTable('reviews')
                .filter((r) => r.contract_id === contractId)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map(clone);
        },

        async create({ contractId, rating, comment = '' } = {}) {
            const profile = requireUser('Please sign in to leave a review.');
            if (!contractId) throw new Error('A completed contract is required.');

            const value = Number(rating);
            if (!Number.isInteger(value) || value < 1 || value > 5) {
                throw new Error('Choose a star rating from 1 to 5.');
            }

            const contract = milestoneContract(contractId);
            if (!contract) throw new Error('This contract could not be found.');
            if (contract.status !== 'completed') {
                throw new Error('You can review a contract once the client marks it complete.');
            }

            let revieweeId = null;
            if (contract.client_id === profile.id) revieweeId = contract.freelancer_id;
            else if (contract.freelancer_id === profile.id) revieweeId = contract.client_id;
            if (!revieweeId) throw new Error('Only the two parties of this contract can review it.');

            const rows = readTable('reviews');
            if (rows.some((r) => r.contract_id === contractId && r.reviewer_id === profile.id)) {
                throw new Error('You have already reviewed this contract.');
            }

            const review = {
                id: newId('review'),
                contract_id: contractId,
                job_id: contract.job_id,
                reviewer_id: profile.id,
                reviewee_id: revieweeId,
                rating: value,
                comment: String(comment || '').trim().slice(0, 1000) || null,
                created_at: nowIso()
            };
            rows.push(review);
            writeTable('reviews', rows);
            return clone(review);
        }
    };

    // ------------------------------------------------------------------
    // Records service (mirrors get_worker_record, get_client_record and
    // get_my_record). Public records never expose money, email, phone or the
    // other party's identity; only getMyRecord() returns the caller's own
    // earnings and hire history.
    // ------------------------------------------------------------------
    function recordProfile(profile, includeRole) {
        if (!profile) return null;
        const safe = publicProfile(profile);
        if (!safe) return null;
        const out = {
            id: safe.id,
            full_name: safe.full_name,
            avatar_url: safe.avatar_url,
            title: safe.title,
            skills: safe.skills,
            is_verified: safe.is_verified,
            member_since: safe.created_at
        };
        if (includeRole) out.role = safe.role;
        return out;
    }

    function completedWorkerContracts(workerId) {
        return readTable('contracts')
            .filter((c) => c.freelancer_id === workerId)
            .map((c) => {
                const job = readTable('jobs').find((j) => j.id === c.job_id) || null;
                return { contract: c, job, done: c.status === 'completed' || job?.status === 'completed' };
            });
    }

    function workerRecord(workerId) {
        const profile = findProfile(workerId);
        if (!profile) return null;
        const rows = completedWorkerContracts(workerId);
        const completed = rows.filter((r) => r.done);
        const active = rows.filter((r) => r.contract.status === 'active' && r.job?.status === 'in_progress');
        const reviews = readTable('reviews').filter((r) => r.reviewee_id === workerId);
        const ratings = reviews.map((r) => Number(r.rating)).filter((n) => Number.isFinite(n));
        const completedAt = (r) => r.contract.updated_at || r.job?.updated_at || r.contract.created_at;
        const sorted = completed.slice().sort((a, b) => new Date(completedAt(b)) - new Date(completedAt(a)));
        return {
            profile: recordProfile(profile),
            summary: {
                completed_jobs: completed.length,
                active_jobs: active.length,
                clients_served: new Set(completed.map((r) => r.contract.client_id)).size,
                avg_rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : 0,
                review_count: ratings.length,
                first_completed_at: sorted.length ? completedAt(sorted[sorted.length - 1]) : null,
                last_completed_at: sorted.length ? completedAt(sorted[0]) : null
            },
            recent: sorted.slice(0, 10).map((r) => ({
                job_id: r.job?.id || r.contract.job_id,
                title: r.job?.title || 'Project',
                category: r.job?.category || 'General',
                completed_at: completedAt(r)
            }))
        };
    }

    function clientPublicRecord(clientId) {
        const profile = findProfile(clientId);
        if (!profile) return null;
        const jobs = readTable('jobs').filter((j) => j.client_id === clientId);
        const contracts = readTable('contracts').filter((c) => c.client_id === clientId);
        return {
            profile: recordProfile(profile),
            summary: {
                jobs_posted: jobs.filter((j) => j.status !== 'draft').length,
                open_jobs: jobs.filter((j) => j.status === 'open').length,
                in_progress_jobs: jobs.filter((j) => j.status === 'in_progress').length,
                completed_jobs: jobs.filter((j) => j.status === 'completed').length,
                cancelled_jobs: jobs.filter((j) => j.status === 'cancelled').length,
                hires: contracts.length
            }
        };
    }

    function clientPrivateRecord(clientId) {
        const publicRecord = clientPublicRecord(clientId);
        if (!publicRecord) return null;
        const jobs = readTable('jobs')
            .filter((j) => j.client_id === clientId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const contracts = readTable('contracts').filter((c) => c.client_id === clientId);
        const completed = contracts.filter((c) => c.status === 'completed');
        return {
            summary: Object.assign({}, publicRecord.summary, {
                total_spent: completed.reduce((sum, c) => sum + (Number(c.agreed_amount) || 0), 0),
                active_contracts: contracts.filter((c) => c.status === 'active').length
            }),
            recent_jobs: jobs.slice(0, 20).map((j) => {
                const contract = contracts.find((c) => c.job_id === j.id) || null;
                const freelancer = contract ? findProfile(contract.freelancer_id) : null;
                return {
                    job_id: j.id,
                    title: j.title,
                    status: j.status,
                    created_at: j.created_at,
                    budget_min: j.budget_min ?? null,
                    budget_max: j.budget_max ?? null,
                    contract_status: contract?.status || null,
                    contract_amount: contract?.agreed_amount ?? null,
                    hired_freelancer: freelancer ? { id: freelancer.id, full_name: freelancer.full_name } : null
                };
            })
        };
    }

    const Records = {
        async getWorkerRecord(workerId) {
            return workerRecord(workerId);
        },

        async getClientRecord(clientId) {
            return clientPublicRecord(clientId);
        },

        async getMyRecord() {
            const profile = requireUser('Please sign in to view your record.');
            const publicWorker = workerRecord(profile.id);
            const rows = completedWorkerContracts(profile.id).filter((r) => r.done);
            const completedAt = (r) => r.contract.updated_at || r.job?.updated_at || r.contract.created_at;
            const worker = publicWorker ? Object.assign({}, publicWorker, {
                earnings: rows.reduce((sum, r) => sum + (Number(r.contract.agreed_amount) || 0), 0),
                recent: rows
                    .slice()
                    .sort((a, b) => new Date(completedAt(b)) - new Date(completedAt(a)))
                    .slice(0, 10)
                    .map((r) => ({
                        job_id: r.job?.id || r.contract.job_id,
                        title: r.job?.title || 'Project',
                        category: r.job?.category || 'General',
                        amount: Number(r.contract.agreed_amount) || 0,
                        completed_at: completedAt(r)
                    }))
            }) : null;
            return {
                profile: recordProfile(profile, true),
                worker,
                client: clientPrivateRecord(profile.id)
            };
        }
    };

    function decorateContract(contract) {
        const out = clone(contract);
        const job = readTable('jobs').find((j) => j.id === contract.job_id);
        out.job = job ? { id: job.id, title: job.title, category: job.category, status: job.status } : null;
        out.client = clientSnippet(findProfile(contract.client_id));
        out.freelancer = freelancerSnippet(findProfile(contract.freelancer_id));
        return out;
    }

    // ------------------------------------------------------------------
    // Files service (mirrors GahonshDB.Files)
    // ------------------------------------------------------------------
    // Metadata lives in the `file_transfers` table (localStorage) while the
    // bytes live in IndexedDB. Both a job owner and the freelancer who
    // uploaded a file can list and download it, which is what makes the
    // send/receive flow work entirely inside the website.
    const Files = {
        async upload({ jobId, proposalId = null, scope = 'job', file }) {
            const profile = requireUser('Please sign in to upload files.');
            if (!jobId) throw new Error('A project is required before a file can be attached.');
            if (!file) throw new Error('No file was selected.');

            const job = readTable('jobs').find((j) => j.id === jobId);
            if (!job) throw new Error('This project could not be found.');
            if (!canUploadTransfer(job, profile)) {
                throw new Error('You do not have permission to add files to this project.');
            }

            const id = newId('file');
            const name = safeFileName(file.name);
            const record = {
                id,
                job_id: jobId,
                proposal_id: proposalId,
                uploaded_by: profile.id,
                file_name: name,
                storage_path: 'local:' + id,
                file_type: file.type || 'application/octet-stream',
                file_size_bytes: file.size || 0,
                scope: scope === 'proposal' ? 'proposal' : 'job',
                created_at: nowIso()
            };

            await idbPut(id, file);
            const rows = readTable('file_transfers');
            rows.push(record);
            writeTable('file_transfers', rows);
            return clone(record);
        },

        async listForJob(jobId) {
            const profile = currentUserRecord();
            if (!profile) return [];
            // Mirror the Supabase RLS SELECT policy locally: a member only sees
            // a file they uploaded or one on a project they participate in.
            const rows = readTable('file_transfers')
                .filter((f) => f.job_id === jobId && f.scope === 'job')
                .filter((f) => f.uploaded_by === profile.id || canAccessTransfer(f, profile))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            return rows.map((r) => decorateTransfer(r, profile));
        },

        async listForProposal(proposalId) {
            const profile = currentUserRecord();
            if (!profile) return [];
            const rows = readTable('file_transfers')
                .filter((f) => f.proposal_id === proposalId)
                .filter((f) => f.uploaded_by === profile.id || canAccessTransfer(f, profile))
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            return rows.map((r) => decorateTransfer(r, profile));
        },

        async getDownload(id) {
            const profile = requireUser('Please sign in to download files.');
            const record = readTable('file_transfers').find((f) => f.id === id);
            if (!record) throw new Error('This file is no longer available.');
            if (!canAccessTransfer(record, profile)) {
                throw new Error('You do not have permission to download this file.');
            }
            const blob = await idbGet(id);
            if (!blob) throw new Error('The file contents could not be found in this browser.');
            return { blob, fileName: record.file_name, mimeType: record.file_type };
        },

        async remove(id) {
            const profile = requireUser('Please sign in to remove files.');
            const rows = readTable('file_transfers');
            const index = rows.findIndex((f) => f.id === id);
            if (index < 0) throw new Error('This file is no longer available.');
            if (!canRemoveTransfer(rows[index], profile)) {
                throw new Error('You do not have permission to remove this file.');
            }
            rows.splice(index, 1);
            writeTable('file_transfers', rows);
            try { await idbDelete(id); } catch (e) { /* metadata is gone; orphan blob is harmless */ }
            return true;
        }
    };

    // Mirrors can_access_job_files() in the SQL schema: the project owner, the
    // freelancer on an active or completed contract for that job, and admins.
    // A freelancer who has only *proposed* is deliberately excluded, matching
    // the SELECT policy, so a bidder cannot read the client's files before
    // being hired. Completed work stays readable as a project record.
    function isProjectParticipant(job, profile) {
        if (!job || !profile) return false;
        if (profile.role === 'admin') return true;
        if (job.client_id === profile.id) return true;
        return readTable('contracts').some(
            (c) => c.job_id === job.id && c.freelancer_id === profile.id &&
                ['active', 'completed'].includes(c.status)
        );
    }

    // A file is visible to its uploader and to project participants, including
    // a freelancer whose contract has completed, so the project record stays
    // downloadable after delivery.
    function canAccessTransfer(record, profile) {
        if (!record || !profile) return false;
        if (record.uploaded_by === profile.id) return true;
        const job = readTable('jobs').find((j) => j.id === record.job_id);
        return isProjectParticipant(job, profile);
    }

    // Mirrors can_upload_job_files() in the SQL schema: the project owner, an
    // admin, the freelancer on an active contract, or a freelancer with a live
    // proposal. A completed contract is read-only.
    function canUploadTransfer(job, profile) {
        if (!job || !profile) return false;
        if (profile.role === 'admin') return true;
        if (job.client_id === profile.id) return true;
        if (readTable('contracts').some(
            (c) => c.job_id === job.id && c.freelancer_id === profile.id && c.status === 'active'
        )) return true;
        return readTable('proposals').some(
            (p) => p.job_id === job.id && p.freelancer_id === profile.id &&
                ['submitted', 'shortlisted'].includes(p.status)
        );
    }

    // Mirrors the SQL DELETE policy: only the uploader or an admin may remove a
    // file, so one participant can never delete another participant's work.
    function canRemoveTransfer(record, profile) {
        if (!record || !profile) return false;
        return record.uploaded_by === profile.id || profile.role === 'admin';
    }

    function decorateTransfer(record, profile) {
        const out = clone(record);
        const uploader = findProfile(record.uploaded_by);
        out.uploader = uploader ? { id: uploader.id, full_name: uploader.full_name, role: uploader.role } : null;
        out.can_remove = canRemoveTransfer(record, profile);
        return out;
    }

    // ------------------------------------------------------------------
    // Boot: seed once, then expose the engine
    // ------------------------------------------------------------------
    let _ready = seedIfEmpty();

    /**
     * Every public method awaits the one-time seed, otherwise a call issued
     * immediately on page load could read an empty table before the seed
     * promise has written it.
     */
    function readyAware(service) {
        const wrapped = {};
        Object.keys(service).forEach(function (name) {
            wrapped[name] = async function () {
                await _ready;
                return service[name].apply(service, arguments);
            };
        });
        return wrapped;
    }

    window.GahonshLocal = {
        Auth: readyAware(Auth),
        Profiles: readyAware(Profiles),
        Jobs: readyAware(Jobs),
        Proposals: readyAware(Proposals),
        Contracts: readyAware(Contracts),
        Records: readyAware(Records),
        Files: readyAware(Files),
        Milestones: readyAware(Milestones),
        Messages: readyAware(Messages),
        Reviews: readyAware(Reviews),
        SavedJobs: readyAware(SavedJobs),
        SavedTalent: readyAware(SavedTalent),
        Invitations: readyAware(Invitations),
        Catalog: readyAware(Catalog),
        Notifications: readyAware(Notifications),
        ready: () => _ready,
        // Test/demo helpers
        _demoPassword: DEMO_PASSWORD,
        _reset: function () {
            ['profiles', 'jobs', 'proposals', 'contracts', 'file_transfers',
                'contract_milestones', 'reviews', 'saved_jobs', 'saved_talent',
                'invitations', 'service_packages', 'notifications', 'messages'].forEach((t) => {
                try { localStorage.removeItem(PREFIX + t); } catch (e) { /* ignore */ }
            });
            writeSession(null);
            _ready = seedIfEmpty();
            return _ready;
        }
    };

    window.isMarketplaceReady = function () {
        return !!(window.GahonshLocal && window.GahonshLocal.Auth);
    };
})();
