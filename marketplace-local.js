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
        return clone(safe);
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
            is_verified: profile?.is_verified !== false
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
            const rows = readTable('jobs');
            const index = rows.findIndex((j) => j.id === jobId);
            if (index < 0) throw new Error('Job not found.');
            rows[index] = Object.assign({}, rows[index], { status: newStatus });
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
            return proposalsFor(jobId)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((p) => decorateProposal(p, { withFreelancer: true }));
        },

        async withdrawProposal(proposalId) {
            const rows = readTable('proposals');
            const index = rows.findIndex((p) => p.id === proposalId);
            if (index < 0) throw new Error('Proposal not found.');
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
            const contract = readTable('contracts').find((c) => c.job_id === jobId);
            if (!contract) return null;
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
        ready: () => _ready,
        // Test/demo helpers
        _demoPassword: DEMO_PASSWORD,
        _reset: function () {
            ['profiles', 'jobs', 'proposals', 'contracts'].forEach((t) => {
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
