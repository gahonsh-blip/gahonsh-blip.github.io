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
                bio: '10+ years specializing in automated macro dashboards, multi-sheet consolidation, dynamic forecasting models, and high-security Excel architectures.',
                skills: ['Excel VBA', 'Financial Modeling', 'Pivot Tables', 'Macro Security', 'Power Query'],
                created_at: nowIso(), updated_at: nowIso()
            },
            {
                id: 'talent-2', _email: 'elena@freelancer.demo', full_name: 'Elena Rostova', role: 'freelancer',
                location: 'Estonia', is_verified: true, avatar_url: null,
                title: 'Full-Stack JavaScript & PostgreSQL Engineer', hourly_rate: 65,
                bio: 'Passionate about building fast, responsive web portals with secure authentication, cloud APIs, and responsive mobile interfaces.',
                skills: ['React', 'Node.js', 'PostgreSQL', 'Tailwind CSS', 'Supabase'],
                created_at: nowIso(), updated_at: nowIso()
            },
            {
                id: 'talent-3', _email: 'marcus@freelancer.demo', full_name: 'Marcus Vance', role: 'freelancer',
                location: 'United States', is_verified: true, avatar_url: null,
                title: 'PDF Layout & Typography Specialist', hourly_rate: 40,
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
    }

    // ------------------------------------------------------------------
    // Query helpers
    // ------------------------------------------------------------------
    function findProfile(id) {
        return readTable('profiles').find((p) => p.id === id) || null;
    }

    function publicProfile(profile) {
        if (!profile) return null;
        const { _salt, _hash, ...safe } = profile;
        const out = clone(safe);
        // Mirrors the `has_resume` column in the public_profiles view. The
        // file bytes stay in IndexedDB and are fetched on demand.
        out.has_resume = !!profile.resume_name;
        return out;
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
            const profiles = readTable('profiles');
            const index = profiles.findIndex((p) => p.id === profile.id);
            const { id, email, role, is_verified, created_at, _salt, _hash, ...safe } = updates || {};
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
            return rows.map(publicProfile);
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
            const search = String(filters.search || '').trim().toLowerCase();
            if (search) {
                rows = rows.filter((j) =>
                    (j.title || '').toLowerCase().includes(search) ||
                    (j.description || '').toLowerCase().includes(search) ||
                    (j.required_skills || []).some((s) => String(s).toLowerCase().includes(search))
                );
            }

            rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
                budget_min: parseFloat(jobData.budget_min) || 0,
                budget_max: jobData.budget_max ? parseFloat(jobData.budget_max) : null,
                hourly_rate_min: jobData.hourly_rate_min ? parseFloat(jobData.hourly_rate_min) : null,
                hourly_rate_max: jobData.hourly_rate_max ? parseFloat(jobData.hourly_rate_max) : null,
                experience_level: jobData.experience_level || 'intermediate',
                estimated_duration: jobData.estimated_duration || '1 to 3 months',
                status: 'open',
                created_at: nowIso()
            };

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
                bid_amount: parseFloat(bidAmount),
                delivery_time_days: parseInt(deliveryDays, 10),
                attachment_urls: attachmentUrls,
                status: 'submitted',
                created_at: nowIso()
            };
            rows.push(proposal);
            writeTable('proposals', rows);
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
    // freelancer on an active contract for that job, and admins. A freelancer
    // who has only *proposed* is deliberately excluded, matching the SELECT
    // policy, so a bidder cannot read the client's files before being hired.
    function isProjectParticipant(job, profile) {
        if (!job || !profile) return false;
        if (profile.role === 'admin') return true;
        if (job.client_id === profile.id) return true;
        return readTable('contracts').some(
            (c) => c.job_id === job.id && c.freelancer_id === profile.id && c.status === 'active'
        );
    }

    // A file is visible to its uploader and to project participants.
    function canAccessTransfer(record, profile) {
        if (!record || !profile) return false;
        if (record.uploaded_by === profile.id) return true;
        const job = readTable('jobs').find((j) => j.id === record.job_id);
        return isProjectParticipant(job, profile);
    }

    // Mirrors can_upload_job_files() in the SQL schema: anyone who can read the
    // workspace, plus a freelancer with a live proposal, so samples and briefs
    // can be attached before a contract exists.
    function canUploadTransfer(job, profile) {
        if (isProjectParticipant(job, profile)) return true;
        if (!job || !profile) return false;
        return readTable('proposals').some(
            (p) => p.job_id === job.id && p.freelancer_id === profile.id &&
                ['submitted', 'shortlisted', 'accepted'].includes(p.status)
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
        Files: readyAware(Files),
        ready: () => _ready,
        // Test/demo helpers
        _demoPassword: DEMO_PASSWORD,
        _reset: function () {
            ['profiles', 'jobs', 'proposals', 'contracts', 'file_transfers'].forEach((t) => {
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
