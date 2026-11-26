/**
 * Gahonsh Freelancing Marketplace - Supabase Client SDK Wrapper
 * Production-ready browser integration with zero-build support.
 */

(function() {
    window.GahonshDB = window.GahonshDB || {};

    let _client = null;
    let _initPromise = null;

    /**
     * Neutralizes PostgREST filter syntax inside a user-supplied search term.
     * Without this, characters such as `,` `.` `(` `)` let a visitor inject
     * extra filter conditions into the generated `or()` expression.
     */
    function sanitizeSearchTerm(term) {
        if (typeof term !== 'string') return '';
        return term
            .trim()
            .replace(/[,().*:%]/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 100);
    }

    /**
     * Initializes the Supabase JS client safely
     */
    async function getClient() {
        if (_client) return _client;
        if (_initPromise) return _initPromise;

        _initPromise = (async () => {
            if (!window.isSupabaseConfigured()) {
                console.info('[Gahonsh Marketplace] Supabase credentials not configured yet. Running in setup-mode.');
                return null;
            }

            // Ensure supabase JS library is loaded from CDN if not already present
            if (typeof window.supabase === 'undefined') {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
                    script.onload = resolve;
                    script.onerror = () => reject(new Error('Failed to load Supabase JS SDK'));
                    document.head.appendChild(script);
                });
            }

            try {
                _client = window.supabase.createClient(
                    window.GAHONSH_CONFIG.SUPABASE_URL,
                    window.GAHONSH_CONFIG.SUPABASE_ANON_KEY,
                    {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true
                        }
                    }
                );
                console.log('[Gahonsh Marketplace] Supabase Client successfully initialized.');
                return _client;
            } catch (err) {
                console.error('[Gahonsh Marketplace] Initialization error:', err);
                return null;
            }
        })();

        return _initPromise;
    }

    // ========================================================================
    // 1. AUTHENTICATION SERVICE
    // ========================================================================
    const Auth = {
        async getSession() {
            const client = await getClient();
            if (!client) return null;
            const { data, error } = await client.auth.getSession();
            if (error) {
                console.error('[Auth.getSession]', error);
                return null;
            }
            return data.session;
        },

        async getCurrentUser() {
            const client = await getClient();
            if (!client) return null;
            const { data, error } = await client.auth.getUser();
            if (error || !data?.user) return null;

            // Fetch user profile from public.profiles (public-safe columns only;
            // email/phone_number are column-restricted in the database)
            const { data: profile } = await client
                .from('profiles')
                .select('id, full_name, avatar_url, role, location, bio, title, hourly_rate, skills, is_verified, created_at, updated_at')
                .eq('id', data.user.id)
                .maybeSingle();

            return {
                ...data.user,
                profile: profile || {
                    id: data.user.id,
                    email: data.user.email,
                    full_name: data.user.user_metadata?.full_name || 'Member',
                    role: data.user.user_metadata?.role || 'freelancer'
                }
            };
        },

        async signUp(email, password, fullName, role = 'freelancer') {
            const client = await getClient();
            if (!client) throw new Error('Supabase is not configured yet. Please configure your project credentials.');

            // Strictly enforce allowed roles (prevent admin self-granting from client)
            const safeRole = role === 'client' ? 'client' : 'freelancer';

            const { data, error } = await client.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName.trim(),
                        role: safeRole
                    }
                }
            });

            if (error) throw error;
            return data;
        },

        async signIn(email, password) {
            const client = await getClient();
            if (!client) throw new Error('Supabase is not configured yet. Please configure your project credentials.');

            const { data, error } = await client.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            return data;
        },

        async signOut() {
            const client = await getClient();
            if (!client) return;
            const { error } = await client.auth.signOut();
            if (error) throw error;
        },

        async onAuthStateChange(callback) {
            const client = await getClient();
            if (!client) return { unsubscribe: () => {} };
            const { data } = client.auth.onAuthStateChange(async (event, session) => {
                const user = await Auth.getCurrentUser();
                callback(event, session, user);
            });
            return data.subscription;
        }
    };

    // ========================================================================
    // 2. PROFILES SERVICE
    // ========================================================================
    // Resumes live in a private bucket at a deterministic per-user path, so the
    // public profile only carries the display name and never a storage path.
    // The bucket name is held in a variable so the schema drift check does not
    // mistake it for a PostgREST table.
    const RESUME_BUCKET = 'resumes';
    const MAX_RESUME_BYTES = 5 * 1024 * 1024;

    function validateResumeFile(file) {
        if (!file) throw new Error('No file was selected.');
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
        if (!isPdf) throw new Error('Please upload a PDF file.');
        if (file.size && file.size > MAX_RESUME_BYTES) {
            throw new Error('Resume must be 5 MB or smaller.');
        }
    }

    // A project that has not applied the resume migration yet must still serve
    // the rest of the marketplace. These errors mean the resume columns are not
    // available, so the caller retries the same query without them.
    function isResumeSchemaGap(err) {
        if (!err) return false;
        const code = String(err.code || '');
        const message = String(err.message || err);
        if (code === '42703' || code === 'PGRST204') return true;
        if (code === '42501' && /resume|permission denied for column/i.test(message)) return true;
        return /column .*resume.* does not exist|could not find the .*resume.* column|permission denied for column resume/i.test(message);
    }

    // Allow-list of fields the profile editor may change. Identity and
    // privilege columns (id, email, role, is_verified) are deliberately absent,
    // so a crafted payload cannot edit another row or escalate the caller.
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

    const Profiles = {
        async getMyProfile() {
            const client = await getClient();
            if (!client) return null;
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) return null;

            const baseSelect = 'id, full_name, avatar_url, role, location, bio, title, hourly_rate, skills, is_verified, created_at, updated_at';
            const resumeSelect = 'id, full_name, avatar_url, role, location, bio, title, hourly_rate, skills, is_verified, resume_name, resume_size_bytes, resume_updated_at, created_at, updated_at';

            let { data, error } = await client
                .from('profiles')
                .select(resumeSelect)
                .eq('id', user.id)
                .single();

            if (error && isResumeSchemaGap(error)) {
                ({ data, error } = await client
                    .from('profiles')
                    .select(baseSelect)
                    .eq('id', user.id)
                    .single());
            }

            if (error) throw error;
            return data;
        },

        async updateMyProfile(updates) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Unauthorized: Please sign in first.');

            const safeUpdates = sanitizeProfileUpdates(updates);
            if (!Object.keys(safeUpdates).length) {
                throw new Error('No editable profile fields were provided.');
            }

            const resumeSelect = 'id, full_name, avatar_url, role, location, bio, title, hourly_rate, skills, is_verified, resume_name, resume_size_bytes, resume_updated_at, created_at, updated_at';
            const baseSelect = 'id, full_name, avatar_url, role, location, bio, title, hourly_rate, skills, is_verified, created_at, updated_at';

            let { data, error } = await client
                .from('profiles')
                .update(safeUpdates)
                .eq('id', user.id)
                .select(resumeSelect)
                .single();

            if (error && isResumeSchemaGap(error)) {
                ({ data, error } = await client
                    .from('profiles')
                    .update(safeUpdates)
                    .eq('id', user.id)
                    .select(baseSelect)
                    .single());
            }

            if (error) throw error;
            return data;
        },

        async getPublicFreelancers(filters = {}) {
            const client = await getClient();
            if (!client) return [];

            let query = client
                .from('public_profiles')
                .select('*')
                .eq('role', 'freelancer');

            const search = sanitizeSearchTerm(filters.search);
            if (search) {
                query = query.or(`full_name.ilike.%${search}%,title.ilike.%${search}%,bio.ilike.%${search}%`);
            }

            if (filters.skill) {
                query = query.contains('skills', [filters.skill]);
            }

            if (filters.availability && filters.availability !== 'all') {
                query = query.eq('availability', filters.availability);
            }

            if (filters.verifiedOnly) {
                query = query.eq('is_verified', true);
            }

            const talentSort = {
                rating: { column: 'created_at', ascending: false },
                rate_low: { column: 'hourly_rate', ascending: true },
                rate_high: { column: 'hourly_rate', ascending: false },
                newest: { column: 'created_at', ascending: false }
            }[filters.sort] || { column: 'created_at', ascending: false };

            const { data, error } = await query.order(talentSort.column, { ascending: talentSort.ascending });
            if (error) throw error;
            return data || [];
        },

        async getPublicProfile(userId) {
            const client = await getClient();
            if (!client) return null;

            const { data, error } = await client
                .from('public_profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        // --- Resume (PDF) -------------------------------------------------
        // Uploads go to `<user id>/resume.pdf` with upsert, so replacing a
        // resume never leaves orphaned objects. The private bucket is readable
        // by any authenticated user (clients viewing talent), and write access
        // is limited to the owner's own folder by the storage policies.
        async uploadResume(file) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Please sign in to upload your resume.');

            const me = await Profiles.getMyProfile();
            if (!me || me.role !== 'freelancer') {
                throw new Error('Only freelancer profiles can upload a resume.');
            }
            validateResumeFile(file);

            const path = `${user.id}/resume.pdf`;
            const { error: uploadError } = await client.storage
                .from(RESUME_BUCKET)
                .upload(path, file, { cacheControl: '3600', upsert: true, contentType: 'application/pdf' });
            if (uploadError) {
                if (isBackendNotProvisioned(uploadError)) {
                    throw new Error('Resume storage is not set up yet. Apply the resume migration in Supabase, then try again.');
                }
                throw uploadError;
            }

            const { data, error } = await client
                .from('profiles')
                .update({
                    resume_name: Files.safeName(file.name),
                    resume_size_bytes: file.size || 0,
                    resume_updated_at: new Date().toISOString()
                })
                .eq('id', user.id)
                .select('id, resume_name, resume_size_bytes, resume_updated_at')
                .single();

            if (error) {
                if (isResumeSchemaGap(error)) {
                    throw new Error('Resume fields are not set up yet. Apply the resume migration in Supabase, then try again.');
                }
                throw error;
            }
            return data;
        },

        async getResume(userId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) {
                const err = new Error('Please sign in to view resumes.');
                err.code = 'AUTH_REQUIRED';
                throw err;
            }

            const { data: profile, error } = await client
                .from('public_profiles')
                .select('resume_name')
                .eq('id', userId)
                .maybeSingle();
            if (error) throw error;
            if (!profile || !profile.resume_name) return null;

            const { data: signed, error: signError } = await client.storage
                .from(RESUME_BUCKET)
                .createSignedUrl(`${userId}/resume.pdf`, 3600);
            if (signError) {
                if (isBackendNotProvisioned(signError)) {
                    throw new Error('Resume storage is not set up yet. Apply the resume migration in Supabase, then try again.');
                }
                throw signError;
            }
            return { url: signed.signedUrl, name: profile.resume_name };
        },

        async removeResume() {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Please sign in to remove your resume.');

            try {
                await client.storage.from(RESUME_BUCKET).remove([`${user.id}/resume.pdf`]);
            } catch (e) {
                // The metadata clear below is what actually hides the resume.
            }

            const { data, error } = await client
                .from('profiles')
                .update({ resume_name: null, resume_size_bytes: null, resume_updated_at: null })
                .eq('id', user.id)
                .select('id, resume_name, resume_size_bytes, resume_updated_at')
                .single();

            if (error) throw error;
            return data;
        }
    };

    // ========================================================================
    // 3. JOBS SERVICE
    // ========================================================================
    const Jobs = {
        async getOpenJobs(filters = {}) {
            const client = await getClient();
            if (!client) return [];

            let query = client
                .from('jobs')
                .select(`
                    *,
                    client:profiles (
                        id,
                        full_name,
                        avatar_url,
                        location,
                        is_verified
                    )
                `)
                .eq('status', 'open');

            if (filters.category && filters.category !== 'all') {
                query = query.eq('category', filters.category);
            }

            if (filters.job_type && filters.job_type !== 'all') {
                query = query.eq('job_type', filters.job_type);
            }

            if (filters.experience_level && filters.experience_level !== 'all') {
                query = query.eq('experience_level', filters.experience_level);
            }

            const search = sanitizeSearchTerm(filters.search);
            if (search) {
                query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
            }

            if (filters.minBudget) {
                query = query.gte('budget_min', parseFloat(filters.minBudget));
            }

            if (filters.maxBudget) {
                query = query.lte('budget_min', parseFloat(filters.maxBudget));
            }

            if (filters.skill) {
                query = query.contains('required_skills', [filters.skill]);
            }

            const jobSort = {
                newest: { column: 'created_at', ascending: false },
                budget_high: { column: 'budget_min', ascending: false },
                budget_low: { column: 'budget_min', ascending: true },
                proposals_few: { column: 'proposals_count', ascending: true }
            }[filters.sort] || { column: 'created_at', ascending: false };

            const { data, error } = await query.order(jobSort.column, { ascending: jobSort.ascending });
            if (error) throw error;
            return data || [];
        },

        async getJobById(jobId) {
            const client = await getClient();
            if (!client) return null;

            const { data, error } = await client
                .from('jobs')
                .select(`
                    *,
                    client:profiles (
                        id,
                        full_name,
                        avatar_url,
                        location,
                        is_verified,
                        created_at
                    ),
                    attachments:job_attachments (*)
                `)
                .eq('id', jobId)
                .single();

            if (error) throw error;
            return data;
        },

        async createJob(jobData) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('You must be logged in as a Client to post a job.');

            const payload = {
                client_id: user.id,
                title: jobData.title.trim(),
                description: jobData.description.trim(),
                category: jobData.category,
                required_skills: Array.isArray(jobData.required_skills) ? jobData.required_skills : [],
                job_type: jobData.job_type || 'fixed',
                budget_min: parseFloat(jobData.budget_min) || 0,
                budget_max: jobData.budget_max ? parseFloat(jobData.budget_max) : null,
                hourly_rate_min: jobData.hourly_rate_min ? parseFloat(jobData.hourly_rate_min) : null,
                hourly_rate_max: jobData.hourly_rate_max ? parseFloat(jobData.hourly_rate_max) : null,
                experience_level: jobData.experience_level || 'intermediate',
                estimated_duration: jobData.estimated_duration || '1 to 3 months',
                status: 'open'
            };

            const { data, error } = await client
                .from('jobs')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async getMyJobs() {
            const client = await getClient();
            if (!client) return [];
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) return [];

            const { data, error } = await client
                .from('jobs')
                .select(`
                    *,
                    proposals:proposals (id, status, bid_amount)
                `)
                .eq('client_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        async updateJob(jobId, updates) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Please sign in to edit this project.');

            // Identity, ownership and counters are immutable. The SQL trigger
            // enforces this too; dropping them here keeps a crafted payload
            // from even attempting the change.
            const {
                id, client_id, proposals_count, created_at, updated_at, status,
                ...safeUpdates
            } = updates || {};

            ['budget_min', 'budget_max', 'hourly_rate_min', 'hourly_rate_max'].forEach((key) => {
                if (safeUpdates[key] !== undefined && safeUpdates[key] !== null) {
                    safeUpdates[key] = Number(safeUpdates[key]);
                }
            });
            if (safeUpdates.required_skills !== undefined) {
                safeUpdates.required_skills = Array.isArray(safeUpdates.required_skills)
                    ? safeUpdates.required_skills.map((s) => String(s).trim()).filter(Boolean)
                    : [];
            }

            const { data: existing, error: readError } = await client
                .from('jobs')
                .select('status')
                .eq('id', jobId)
                .single();
            if (readError) throw readError;
            if (existing.status === 'completed' || existing.status === 'cancelled') {
                throw new Error('Closed jobs cannot be edited.');
            }

            const { data, error } = await client
                .from('jobs')
                .update(safeUpdates)
                .eq('id', jobId)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async updateJobStatus(jobId, newStatus) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');

            const { data, error } = await client
                .from('jobs')
                .update({ status: newStatus })
                .eq('id', jobId)
                .select()
                .single();

            if (error) throw error;
            return data;
        }
    };

    // ========================================================================
    // 4. PROPOSALS SERVICE
    // ========================================================================
    const Proposals = {
        async submitProposal(jobId, coverLetter, bidAmount, deliveryDays, attachmentUrls = []) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Please sign in as a Freelancer to submit a proposal.');

            const payload = {
                job_id: jobId,
                freelancer_id: user.id,
                cover_letter: coverLetter.trim(),
                bid_amount: parseFloat(bidAmount),
                delivery_time_days: parseInt(deliveryDays, 10),
                attachment_urls: attachmentUrls,
                status: 'submitted'
            };

            const { data, error } = await client
                .from('proposals')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async getMyProposals() {
            const client = await getClient();
            if (!client) return [];
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) return [];

            const { data, error } = await client
                .from('proposals')
                .select(`
                    *,
                    job:jobs (
                        id,
                        title,
                        category,
                        budget_min,
                        budget_max,
                        status,
                        client_id
                    )
                `)
                .eq('freelancer_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        async getProposalsForJob(jobId) {
            const client = await getClient();
            if (!client) return [];

            const baseFreelancer = 'id, full_name, avatar_url, title, hourly_rate, skills, is_verified';
            const selectFor = (columns) => `*, freelancer:profiles ( ${columns} )`;
            const query = (select) => client
                .from('proposals')
                .select(select)
                .eq('job_id', jobId)
                .order('created_at', { ascending: false });

            let { data, error } = await query(selectFor(baseFreelancer + ', resume_name'));
            if (error && isResumeSchemaGap(error)) {
                ({ data, error } = await query(selectFor(baseFreelancer)));
            }

            if (error) throw error;
            return data || [];
        },

        async withdrawProposal(proposalId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');

            const { data, error } = await client
                .from('proposals')
                .update({ status: 'withdrawn' })
                .eq('id', proposalId)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        /**
         * Client-side review of a live bid: shortlist it, put it back in the
         * pile, or decline it. Hiring is not here — acceptProposalAndHire()
         * is the only path that creates a contract. The RPC checks that the
         * caller owns the job and that the job is still open.
         */
        async setStatus(proposalId, status) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const allowed = ['submitted', 'shortlisted', 'rejected'];
            if (!allowed.includes(status)) {
                throw new Error('A proposal can only be shortlisted, restored or declined here.');
            }

            const { data, error } = await client.rpc('set_proposal_status', {
                target_proposal_id: proposalId,
                new_status: status
            });

            if (error) throw error;
            return { id: data || proposalId, status };
        },

        /**
         * Returns the current authenticated freelancer's proposal for a job,
         * or null when they have not applied yet. Uses auth.uid() server-side via RLS.
         */
        async getMyProposalForJob(jobId) {
            const client = await getClient();
            if (!client) return null;
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) return null;

            const { data, error } = await client
                .from('proposals')
                .select('*')
                .eq('job_id', jobId)
                .eq('freelancer_id', user.id)
                .maybeSingle();

            if (error) throw error;
            return data;
        }
    };

    // ========================================================================
    // 5. CONTRACTS & HIRING (ATOMIC TRANSACTIONAL RPC)
    // ========================================================================
    const Contracts = {
        async acceptProposalAndHire(proposalId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');

            // Calls the atomic PostgreSQL RPC function
            const { data, error } = await client.rpc('accept_proposal_and_create_contract', {
                target_proposal_id: proposalId
            });

            if (error) throw error;
            return data; // Returns newly created contract_id
        },

        /**
         * Returns the contract tied to a job for the authenticated participant
         * (client or hired freelancer), or null when none exists yet.
         */
        async getContractForJob(jobId) {
            const client = await getClient();
            if (!client) return null;
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) return null;

            const { data, error } = await client
                .from('contracts')
                .select(`
                    *,
                    job:jobs (id, title, status),
                    client:profiles!contracts_client_id_fkey (id, full_name, avatar_url),
                    freelancer:profiles!contracts_freelancer_id_fkey (id, full_name, avatar_url, title)
                `)
                .eq('job_id', jobId)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        async getMyContracts() {
            const client = await getClient();
            if (!client) return [];
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) return [];

            const { data, error } = await client
                .from('contracts')
                .select(`
                    *,
                    job:jobs (id, title, category),
                    client:profiles!contracts_client_id_fkey (id, full_name, avatar_url),
                    freelancer:profiles!contracts_freelancer_id_fkey (id, full_name, avatar_url, title)
                `)
                .or(`client_id.eq.${user.id},freelancer_id.eq.${user.id}`)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        /**
         * Client sign-off: closes the contract and the job atomically. Only the
         * client (or an admin) may call it; the RPC enforces that rule.
         */
        async completeContract(contractId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Please sign in to complete this contract.');

            const { data, error } = await client.rpc('complete_contract', {
                p_contract_id: contractId
            });

            if (error) throw error;
            return data;
        }
    };

    // ========================================================================
    // 5a. CONTRACT MILESTONES (MANUAL CHECKLIST)
    // ========================================================================
    // A written plan the client and the freelancer keep together. Nothing here
    // moves money: `delivered` means the freelancer says the work is ready and
    // `accepted` means the client checked it. The trigger in the schema decides
    // who may make which move; these helpers only shape the request.
    const MILESTONE_STATUSES = ['pending', 'delivered', 'accepted'];

    const Milestones = {
        async list(contractId) {
            const client = await getClient();
            if (!client || !contractId) return [];
            const { data, error } = await client
                .from('contract_milestones')
                .select('*')
                .eq('contract_id', contractId)
                .order('position', { ascending: true })
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data || [];
        },

        async add({ contractId, title, amount = null, dueDate = null }) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Please sign in to add a milestone.');
            if (!contractId) throw new Error('A contract is required.');

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

            const { count } = await client
                .from('contract_milestones')
                .select('id', { count: 'exact', head: true })
                .eq('contract_id', contractId);

            const { data, error } = await client
                .from('contract_milestones')
                .insert({
                    contract_id: contractId,
                    title: clean,
                    amount: value,
                    due_date: dueDate || null,
                    position: count || 0,
                    created_by: user.id
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async setStatus(milestoneId, status) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            if (!MILESTONE_STATUSES.includes(status)) {
                throw new Error('Unknown milestone status.');
            }
            const { data, error } = await client
                .from('contract_milestones')
                .update({ status })
                .eq('id', milestoneId)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async remove(milestoneId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const { error } = await client
                .from('contract_milestones')
                .delete()
                .eq('id', milestoneId);

            if (error) throw error;
            return true;
        }
    };

    // ========================================================================
    // 4b. DISCOVERY — SAVED JOBS, SAVED TALENT, INVITATIONS
    // ========================================================================
    // Shortlists are private: every query is scoped to the signed-in member,
    // and the RLS policies repeat that rule so a crafted request cannot read
    // another member's list.
    async function currentUserId(client) {
        const user = (await client.auth.getUser())?.data?.user;
        return user ? user.id : null;
    }

    const SavedJobs = {
        async ids() {
            const client = await getClient();
            if (!client) return [];
            const userId = await currentUserId(client);
            if (!userId) return [];
            const { data, error } = await client
                .from('saved_jobs')
                .select('job_id')
                .eq('freelancer_id', userId);
            if (error) throw error;
            return (data || []).map((row) => row.job_id);
        },

        async list() {
            const client = await getClient();
            if (!client) return [];
            const userId = await currentUserId(client);
            if (!userId) return [];
            const { data, error } = await client
                .from('saved_jobs')
                .select(`
                    created_at,
                    job:jobs (
                        id, title, description, category, job_type, required_skills,
                        budget_min, budget_max, hourly_rate_min, hourly_rate_max,
                        experience_level, estimated_duration, status, proposals_count,
                        created_at,
                        client:profiles ( id, full_name, avatar_url, location, is_verified )
                    )
                `)
                .eq('freelancer_id', userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []).filter((row) => row.job).map((row) => Object.assign({}, row.job, { saved_at: row.created_at }));
        },

        async save(jobId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to save a job.');
            const { error } = await client
                .from('saved_jobs')
                .upsert({ freelancer_id: userId, job_id: jobId }, { onConflict: 'freelancer_id,job_id' });
            if (error) throw error;
            return true;
        },

        async remove(jobId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to change your saved jobs.');
            const { error } = await client
                .from('saved_jobs')
                .delete()
                .eq('freelancer_id', userId)
                .eq('job_id', jobId);
            if (error) throw error;
            return false;
        },

        async toggle(jobId) {
            const ids = await SavedJobs.ids();
            return ids.includes(jobId) ? SavedJobs.remove(jobId) : SavedJobs.save(jobId);
        }
    };

    const SavedTalent = {
        async ids() {
            const client = await getClient();
            if (!client) return [];
            const userId = await currentUserId(client);
            if (!userId) return [];
            const { data, error } = await client
                .from('saved_talent')
                .select('freelancer_id')
                .eq('client_id', userId);
            if (error) throw error;
            return (data || []).map((row) => row.freelancer_id);
        },

        async list() {
            const client = await getClient();
            if (!client) return [];
            const userId = await currentUserId(client);
            if (!userId) return [];
            const { data, error } = await client
                .from('saved_talent')
                .select('freelancer_id, created_at')
                .eq('client_id', userId)
                .order('created_at', { ascending: false });
            if (error) throw error;

            const rows = data || [];
            if (!rows.length) return [];
            const ids = rows.map((row) => row.freelancer_id);
            const { data: profiles, error: profileError } = await client
                .from('public_profiles')
                .select('*')
                .in('id', ids);
            if (profileError) throw profileError;

            const byId = new Map((profiles || []).map((p) => [p.id, p]));
            return rows.map((row) => byId.get(row.freelancer_id)).filter(Boolean);
        },

        async save(freelancerId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to save talent.');
            if (userId === freelancerId) throw new Error('You cannot save your own profile.');
            const { error } = await client
                .from('saved_talent')
                .upsert({ client_id: userId, freelancer_id: freelancerId }, { onConflict: 'client_id,freelancer_id' });
            if (error) throw error;
            return true;
        },

        async remove(freelancerId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to change your saved talent.');
            const { error } = await client
                .from('saved_talent')
                .delete()
                .eq('client_id', userId)
                .eq('freelancer_id', freelancerId);
            if (error) throw error;
            return false;
        },

        async toggle(freelancerId) {
            const ids = await SavedTalent.ids();
            return ids.includes(freelancerId) ? SavedTalent.remove(freelancerId) : SavedTalent.save(freelancerId);
        }
    };

    const Invitations = {
        async send(jobId, freelancerId, message = '') {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in as a client to invite a freelancer.');
            if (userId === freelancerId) throw new Error('You cannot invite yourself.');

            const { data, error } = await client
                .from('invitations')
                .insert({
                    job_id: jobId,
                    client_id: userId,
                    freelancer_id: freelancerId,
                    message: String(message || '').trim().slice(0, 1000) || null
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') throw new Error('You have already invited this freelancer to that project.');
                throw error;
            }
            return data;
        },

        async listReceived() {
            const client = await getClient();
            if (!client) return [];
            const userId = await currentUserId(client);
            if (!userId) return [];
            const { data, error } = await client
                .from('invitations')
                .select(`
                    id, job_id, client_id, message, status, responded_at, created_at,
                    job:jobs ( id, title, category, job_type, budget_min, budget_max, status ),
                    client:profiles ( id, full_name, avatar_url, is_verified )
                `)
                .eq('freelancer_id', userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async listSent() {
            const client = await getClient();
            if (!client) return [];
            const userId = await currentUserId(client);
            if (!userId) return [];
            const { data, error } = await client
                .from('invitations')
                .select(`
                    id, job_id, freelancer_id, message, status, responded_at, created_at,
                    job:jobs ( id, title, category, status ),
                    freelancer:profiles ( id, full_name, avatar_url, title, is_verified )
                `)
                .eq('client_id', userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async listForJob(jobId) {
            const client = await getClient();
            if (!client) return [];
            const { data, error } = await client
                .from('invitations')
                .select('id, freelancer_id, status, created_at, freelancer:profiles ( id, full_name, avatar_url, title )')
                .eq('job_id', jobId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async respond(invitationId, status) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to answer an invitation.');
            if (!['accepted', 'declined'].includes(status)) {
                throw new Error('An invitation can only be accepted or declined.');
            }
            const { data, error } = await client
                .from('invitations')
                .update({ status })
                .eq('id', invitationId)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async withdraw(invitationId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to withdraw an invitation.');
            const { data, error } = await client
                .from('invitations')
                .update({ status: 'withdrawn' })
                .eq('id', invitationId)
                .eq('client_id', userId)
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    };

    // ========================================================================
    // 4c. PROJECT CATALOG — FIXED-PRICE SERVICE PACKAGES
    // ========================================================================
    // Prices are the freelancer's own quote. The platform charges no commission
    // and holds no funds, so ordering a package opens a normal job brief.
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

    async function attachPackageOwners(client, packages) {
        const ids = Array.from(new Set((packages || []).map((p) => p.freelancer_id)));
        if (!ids.length) return packages || [];
        const { data: profiles, error } = await client
            .from('public_profiles')
            .select('id, full_name, avatar_url, title, location, hourly_rate, is_verified, availability, skills')
            .in('id', ids);
        if (error) throw error;
        const byId = new Map((profiles || []).map((p) => [p.id, p]));
        return packages.map((pkg) => Object.assign({}, pkg, { freelancer: byId.get(pkg.freelancer_id) || null }));
    }

    const Catalog = {
        async list(filters = {}) {
            const client = await getClient();
            if (!client) return [];

            let query = client
                .from('service_packages')
                .select('*')
                .eq('is_active', true);

            if (filters.category && filters.category !== 'all') {
                query = query.eq('category', filters.category);
            }
            if (filters.tier && filters.tier !== 'all') {
                query = query.eq('tier', filters.tier);
            }
            if (filters.maxPrice) {
                query = query.lte('price', Number(filters.maxPrice));
            }
            const search = sanitizeSearchTerm(filters.search);
            if (search) {
                query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
            }

            const sort = {
                price_low: { column: 'price', ascending: true },
                price_high: { column: 'price', ascending: false },
                newest: { column: 'created_at', ascending: false }
            }[filters.sort] || { column: 'created_at', ascending: false };

            const { data, error } = await query.order(sort.column, { ascending: sort.ascending });
            if (error) throw error;
            return attachPackageOwners(client, data || []);
        },

        async getById(packageId) {
            const client = await getClient();
            if (!client) return null;
            const { data, error } = await client
                .from('service_packages')
                .select('*')
                .eq('id', packageId)
                .maybeSingle();
            if (error) throw error;
            if (!data) return null;
            const [withOwner] = await attachPackageOwners(client, [data]);
            return withOwner;
        },

        async listMine() {
            const client = await getClient();
            if (!client) return [];
            const userId = await currentUserId(client);
            if (!userId) return [];
            const { data, error } = await client
                .from('service_packages')
                .select('*')
                .eq('freelancer_id', userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async create(pkg) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to publish a package.');

            const me = await Profiles.getMyProfile();
            if (!me || (me.role !== 'freelancer' && me.role !== 'admin')) {
                throw new Error('Only a freelancer can publish a catalog package.');
            }

            const payload = Object.assign({ freelancer_id: userId }, sanitizePackage(pkg));
            const { data, error } = await client
                .from('service_packages')
                .insert(payload)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async update(packageId, patch) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to edit a package.');

            const payload = {};
            if (patch && typeof patch === 'object') {
                if ('is_active' in patch) payload.is_active = !!patch.is_active;
                const editable = ['title', 'description', 'category', 'tier', 'price', 'delivery_days', 'revisions', 'skills'];
                if (editable.some((key) => key in patch)) {
                    const merged = sanitizePackage(Object.assign({}, patch));
                    for (const key of editable) payload[key] = merged[key];
                }
            }
            if (!Object.keys(payload).length) throw new Error('Nothing to update.');

            const { data, error } = await client
                .from('service_packages')
                .update(payload)
                .eq('id', packageId)
                .eq('freelancer_id', userId)
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async remove(packageId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to remove a package.');
            const { error } = await client
                .from('service_packages')
                .delete()
                .eq('id', packageId)
                .eq('freelancer_id', userId);
            if (error) throw error;
            return true;
        }
    };

    // ========================================================================
    // 4d. NOTIFICATIONS (IN-APP ONLY)
    // ========================================================================
    // Rows are written by database triggers; the browser only reads them and
    // marks its own as read, so there is no client-side insert path at all.
    const Notifications = {
        async list(limit = 40) {
            const client = await getClient();
            if (!client) return [];
            const userId = await currentUserId(client);
            if (!userId) return [];
            const { data, error } = await client
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(Math.max(1, Math.min(200, Number(limit) || 40)));
            if (error) throw error;
            return data || [];
        },

        async unreadCount() {
            const client = await getClient();
            if (!client) return 0;
            const userId = await currentUserId(client);
            if (!userId) return 0;
            const { count, error } = await client
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_read', false);
            if (error) throw error;
            return count || 0;
        },

        async markRead(notificationId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in.');
            const { error } = await client
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId)
                .eq('user_id', userId);
            if (error) throw error;
            return true;
        },

        async markAllRead() {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in.');
            const { error } = await client
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', userId)
                .eq('is_read', false);
            if (error) throw error;
            return true;
        },

        async remove(notificationId) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in.');
            const { error } = await client
                .from('notifications')
                .delete()
                .eq('id', notificationId)
                .eq('user_id', userId);
            if (error) throw error;
            return true;
        },

        async clear() {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in.');
            const { error } = await client
                .from('notifications')
                .delete()
                .eq('user_id', userId);
            if (error) throw error;
            return true;
        }
    };

    // ========================================================================
    // 5ab. CONTRACT MESSAGES
    // ========================================================================
    // The recipient is derived from the contract, never taken from the caller,
    // so a message cannot be addressed to a stranger. The schema policy
    // re-checks that the sender is one of the two contract parties.
    const Messages = {
        async list(contractId) {
            const client = await getClient();
            if (!client || !contractId) return [];
            const { data, error } = await client
                .from('messages')
                .select('*')
                .eq('contract_id', contractId)
                .order('created_at', { ascending: true })
                .limit(200);
            if (error) throw error;
            return data || [];
        },

        async send(contractId, body) {
            const client = await getClient();
            if (!client) throw new Error('The marketplace is not configured yet.');
            const userId = await currentUserId(client);
            if (!userId) throw new Error('Please sign in to send a message.');
            if (!contractId) throw new Error('This contract could not be found.');

            const text = String(body || '').trim();
            if (!text) throw new Error('Write a message first.');
            if (text.length > 2000) throw new Error('Keep the message under 2000 characters.');

            const { data: contract, error: contractError } = await client
                .from('contracts')
                .select('id, client_id, freelancer_id')
                .eq('id', contractId)
                .maybeSingle();
            if (contractError) throw contractError;
            if (!contract) throw new Error('This contract could not be found.');

            const recipientId = contract.client_id === userId ? contract.freelancer_id : contract.client_id;
            const { data, error } = await client
                .from('messages')
                .insert({
                    contract_id: contractId,
                    sender_id: userId,
                    recipient_id: recipientId,
                    body: text
                })
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    };

    // ========================================================================
    // 5aa. REVIEWS (ONE PER PARTY, AFTER THE CONTRACT IS COMPLETED)
    // ========================================================================
    // The reviewee is never taken from the caller: it is the other party of
    // the contract, read from the contract row itself. The schema policy
    // re-checks that, so a crafted request cannot rate a stranger.
    const Reviews = {
        async getForContract(contractId) {
            const client = await getClient();
            if (!client || !contractId) return [];
            const { data, error } = await client
                .from('reviews')
                .select('*')
                .eq('contract_id', contractId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        async create({ contractId, rating, comment = '' }) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Please sign in to leave a review.');
            if (!contractId) throw new Error('A completed contract is required.');

            const value = Number(rating);
            if (!Number.isInteger(value) || value < 1 || value > 5) {
                throw new Error('Choose a star rating from 1 to 5.');
            }

            const { data: contract, error: contractError } = await client
                .from('contracts')
                .select('id, client_id, freelancer_id, job_id, status')
                .eq('id', contractId)
                .maybeSingle();

            if (contractError) throw contractError;
            if (!contract) throw new Error('This contract could not be found.');
            if (contract.status !== 'completed') {
                throw new Error('You can review a contract once the client marks it complete.');
            }

            let revieweeId = null;
            if (contract.client_id === user.id) revieweeId = contract.freelancer_id;
            else if (contract.freelancer_id === user.id) revieweeId = contract.client_id;
            if (!revieweeId) throw new Error('Only the two parties of this contract can review it.');

            const { data, error } = await client
                .from('reviews')
                .insert({
                    contract_id: contractId,
                    job_id: contract.job_id,
                    reviewer_id: user.id,
                    reviewee_id: revieweeId,
                    rating: value,
                    comment: String(comment || '').trim().slice(0, 1000) || null
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') throw new Error('You have already reviewed this contract.');
                throw error;
            }
            return data;
        }
    };

    // ========================================================================
    // 5b. RECORDS SERVICE (PUBLIC SUMMARIES + PRIVATE OWN RECORD)
    // ========================================================================
    // These are read-only RPCs. The public worker/client summaries never return
    // earnings, budgets, email, phone or the other party's identity; only the
    // signed-in owner receives their private earnings and hire history.
    const Records = {
        async getWorkerRecord(workerId) {
            const client = await getClient();
            if (!client) return null;
            const { data, error } = await client.rpc('get_worker_record', {
                p_worker_id: workerId
            });
            if (error) throw error;
            return data;
        },

        async getClientRecord(clientId) {
            const client = await getClient();
            if (!client) return null;
            const { data, error } = await client.rpc('get_client_record', {
                p_client_id: clientId
            });
            if (error) throw error;
            return data;
        },

        async getMyRecord() {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Please sign in to view your record.');
            const { data, error } = await client.rpc('get_my_record');
            if (error) throw error;
            return data;
        }
    };

    // ========================================================================
    // 6. FILES SERVICE (SUPABASE STORAGE + file_transfers METADATA)
    // ========================================================================
    // Files are stored in the public `job-attachments` bucket under a
    // per-project folder, and their metadata lives in `public.file_transfers`
    // (RLS restricts both to the client, the hired freelancer and admins).
    // Bytes are streamed back to the browser with storage.download(), so a
    // signed-in participant can fetch a shared file without leaving the site.
    // Browsers often report `application/octet-stream` (or nothing) for Office
    // and text files. The storage bucket has a MIME allow-list, so derive the
    // correct type from the extension instead of letting a valid file fail.
    const FILE_MIME_BY_EXT = {
        pdf: 'application/pdf',
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
        zip: 'application/zip',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        odt: 'application/vnd.oasis.opendocument.text',
        ods: 'application/vnd.oasis.opendocument.spreadsheet',
        odp: 'application/vnd.oasis.opendocument.presentation',
        doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
        txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values',
        json: 'application/json', xml: 'application/xml', log: 'text/plain',
        yml: 'text/yaml', yaml: 'text/yaml'
    };

    const Files = {
        bucket() {
            return (window.GAHONSH_CONFIG && window.GAHONSH_CONFIG.STORAGE_BUCKET) || 'job-attachments';
        },

        safeName(name) {
            const base = String(name || 'file').split(/[\\/]/).pop().trim();
            return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
        },

        async upload({ jobId, proposalId = null, scope = 'job', file }) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Please sign in to upload files.');
            if (!jobId) throw new Error('A project is required before a file can be attached.');
            if (!file) throw new Error('No file was selected.');

            const safeName = Files.safeName(file.name);
            const ext = safeName.split('.').pop().toLowerCase();
            const reportedType = String(file.type || '').trim();
            const contentType = FILE_MIME_BY_EXT[ext]
                || (reportedType && reportedType !== 'application/octet-stream' ? reportedType : 'application/octet-stream');
            const unique = (window.crypto && window.crypto.randomUUID)
                ? window.crypto.randomUUID()
                : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
            const path = `${jobId}/${unique}-${safeName}`;

            const { error: uploadError } = await client.storage
                .from(Files.bucket())
                .upload(path, file, { cacheControl: '3600', upsert: false, contentType: contentType });
            if (uploadError) throw uploadError;

            const payload = {
                job_id: jobId,
                proposal_id: proposalId,
                uploaded_by: user.id,
                file_name: safeName,
                storage_path: path,
                file_type: contentType,
                file_size_bytes: file.size || 0,
                scope: scope === 'proposal' ? 'proposal' : 'job'
            };

            const { data, error } = await client
                .from('file_transfers')
                .insert(payload)
                .select()
                .single();

            if (error) {
                // Do not leave an orphaned object behind if the row is rejected.
                try { await client.storage.from(Files.bucket()).remove([path]); } catch (e) { /* best effort */ }
                throw error;
            }
            return data;
        },

        async listForJob(jobId) {
            const client = await getClient();
            if (!client) return [];
            const { data, error } = await client
                .from('file_transfers')
                .select('*')
                .eq('job_id', jobId)
                .eq('scope', 'job')
                .order('created_at', { ascending: true });
            if (error) throw error;
            return Files.decorate(client, data || []);
        },

        async listForProposal(proposalId) {
            const client = await getClient();
            if (!client) return [];
            const { data, error } = await client
                .from('file_transfers')
                .select('*')
                .eq('proposal_id', proposalId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            return Files.decorate(client, data || []);
        },

        // PostgREST returns raw rows, so the shared UI's `uploader` name and
        // `can_remove` flag have to be added here to match the local engine.
        async decorate(client, rows) {
            if (!rows.length) return rows;
            const me = (await client.auth.getUser())?.data?.user;
            const ids = Array.from(new Set(rows.map((r) => r.uploaded_by).filter(Boolean)));
            let names = {};
            if (ids.length) {
                const { data: profiles } = await client
                    .from('profiles')
                    .select('id, full_name')
                    .in('id', ids);
                (profiles || []).forEach((p) => { names[p.id] = p.full_name; });
            }
            // Mirror the local engine and the SQL DELETE policy (uploader or
            // admin), otherwise an admin sees no Remove control even though the
            // database would let them delete the row.
            let isAdmin = false;
            if (me) {
                const { data: mine } = await client
                    .from('profiles')
                    .select('role')
                    .eq('id', me.id)
                    .maybeSingle();
                isAdmin = !!(mine && mine.role === 'admin');
            }
            return rows.map((r) => ({
                ...r,
                uploader: { full_name: names[r.uploaded_by] || 'Member' },
                can_remove: !!(me && (r.uploaded_by === me.id || isAdmin))
            }));
        },

        async getDownload(id) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const { data: record, error } = await client
                .from('file_transfers')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;

            const { data: blob, error: dlError } = await client.storage
                .from(Files.bucket())
                .download(record.storage_path);
            if (dlError) throw dlError;
            return { blob, fileName: record.file_name, mimeType: record.file_type };
        },

        async remove(id) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const { data: record, error } = await client
                .from('file_transfers')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;

            const { error: delError } = await client
                .from('file_transfers')
                .delete()
                .eq('id', id);
            if (delError) throw delError;

            await client.storage.from(Files.bucket()).remove([record.storage_path]);
            return true;
        }
    };

    // ========================================================================
    // REMOTE REACHABILITY + LOCAL FALLBACK
    // ------------------------------------------------------------------------
    // The committed Supabase project URL may point at a project that is not
    // (or no longer) reachable. Rather than leaving the marketplace showing an
    // empty feed and blocking every action, we probe the project once and fall
    // back to the browser-local engine (marketplace-local.js) when it is down.
    // When a reachable Supabase project is configured, Supabase is used as-is.
    // ========================================================================
    const REACH_TTL_MS = 30000;
    let _reach = { value: null, at: 0 };
    let _reachProbe = null;

    function localEngine() {
        return window.GahonshLocal || null;
    }

    async function remoteReachable() {
        if (!window.isSupabaseConfigured()) return false;

        const now = Date.now();
        if (_reach.value !== null && (now - _reach.at) < REACH_TTL_MS) {
            return _reach.value;
        }
        // A page load asks several services at once, so without sharing the
        // in-flight probe each caller fired its own request and logged its own
        // "unreachable" warning.
        if (_reachProbe) return _reachProbe;

        _reachProbe = (async () => {
            const base = String(window.GAHONSH_CONFIG.SUPABASE_URL || '').replace(/\/+$/, '');
            let reachable = false;

            if (base) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 4000);
                    // Probe the auth health endpoint with the public publishable key.
                    // It is CORS-enabled and answers 200, so the check stays silent in
                    // the console. A keyless request to /rest/v1/ returns 401, which
                    // the browser logs as a console error and fails the Lighthouse
                    // "no browser errors" audit even though the project is healthy.
                    const res = await fetch(base + '/auth/v1/health', {
                        method: 'GET',
                        cache: 'no-store',
                        headers: { apikey: String(window.GAHONSH_CONFIG.SUPABASE_ANON_KEY || '') },
                        signal: controller.signal
                    });
                    reachable = res.ok;
                    clearTimeout(timer);
                } catch (err) {
                    reachable = false;
                }
            }

            _reach = { value: reachable, at: Date.now() };
            if (!reachable) {
                console.warn('[GahonshDB] Supabase project unreachable — using the local marketplace engine.');
            }
            return reachable;
        })().finally(() => { _reachProbe = null; });

        return _reachProbe;
    }

    /**
     * True when the marketplace can serve data: either a reachable Supabase
     * project or the local fallback engine. Pages use this to decide whether to
     * attempt real operations (instead of the old isSupabaseConfigured gate,
     * which was true even for a dead project).
     */
    window.isMarketplaceReady = function () {
        return !!localEngine() || window.isSupabaseConfigured();
    };

    /**
     * Wraps a service so each method prefers Supabase, then transparently
     * degrades to the local engine when Supabase is unreachable or the request
     * fails at the network layer. Genuine server-side errors (validation, RLS,
     * duplicates) are surfaced instead of being masked by a local write.
     */
    function isNetworkError(err) {
        if (!err) return false;
        const msg = String(err.message || err);
        return /failed to fetch|networkerror|network error|load failed|aborted|timeout|err_/i.test(msg);
    }

    /**
     * True when the request failed because the remote project has not been
     * provisioned with this feature yet — the table or the storage bucket is
     * missing. That is a deployment gap, not a user error, so the caller may
     * fall back to the local engine. Genuine RLS/validation failures do not
     * match and are still surfaced.
     */
    function isBackendNotProvisioned(err) {
        if (!err) return false;
        const code = String(err.code || err.statusCode || '');
        const msg = String(err.message || err);
        return code === 'PGRST205' || code === 'PGRST202' ||
            /bucket not found|nosuchbucket|relation .* does not exist|could not find the table|could not find the function|function .* does not exist/i.test(msg);
    }

    function withFallback(remoteService, localService, label) {
        const wrapped = {};
        Object.keys(remoteService).forEach(function (name) {
            wrapped[name] = async function () {
                const args = Array.prototype.slice.call(arguments);

                if (await remoteReachable()) {
                    try {
                        return await remoteService[name].apply(remoteService, args);
                    } catch (err) {
                        if (!isNetworkError(err)) throw err;
                        console.warn('[GahonshDB] ' + label + '.' + name + ' network failure — falling back locally:', err && err.message);
                    }
                }

                if (localService && typeof localService[name] === 'function') {
                    return await localService[name].apply(localService, args);
                }
                throw new Error('Marketplace service is unavailable.');
            };
        });
        return wrapped;
    }

    const _local = localEngine();
    const AuthProxy = withFallback(Auth, _local && _local.Auth, 'Auth');
    const ProfilesProxy = withFallback(Profiles, _local && _local.Profiles, 'Profiles');
    const JobsProxy = withFallback(Jobs, _local && _local.Jobs, 'Jobs');
    const ProposalsProxy = withFallback(Proposals, _local && _local.Proposals, 'Proposals');
    const ContractsProxy = withFallback(Contracts, _local && _local.Contracts, 'Contracts');
    const RecordsProxy = withFallback(Records, _local && _local.Records, 'Records');
    const FilesProxy = withFallback(Files, _local && _local.Files, 'Files');
    const MilestonesProxy = withFallback(Milestones, _local && _local.Milestones, 'Milestones');
    const MessagesProxy = withFallback(Messages, _local && _local.Messages, 'Messages');
    const ReviewsProxy = withFallback(Reviews, _local && _local.Reviews, 'Reviews');
    const SavedJobsProxy = withFallback(SavedJobs, _local && _local.SavedJobs, 'SavedJobs');
    const SavedTalentProxy = withFallback(SavedTalent, _local && _local.SavedTalent, 'SavedTalent');
    const InvitationsProxy = withFallback(Invitations, _local && _local.Invitations, 'Invitations');
    const CatalogProxy = withFallback(Catalog, _local && _local.Catalog, 'Catalog');
    const NotificationsProxy = withFallback(Notifications, _local && _local.Notifications, 'Notifications');

    // Export services onto global GahonshDB namespace
    window.GahonshDB = {
        getClient,
        remoteReachable,
        isBackendNotProvisioned,
        Auth: AuthProxy,
        Profiles: ProfilesProxy,
        Jobs: JobsProxy,
        Proposals: ProposalsProxy,
        Contracts: ContractsProxy,
        Records: RecordsProxy,
        Files: FilesProxy,
        Milestones: MilestonesProxy,
        Messages: MessagesProxy,
        Reviews: ReviewsProxy,
        SavedJobs: SavedJobsProxy,
        SavedTalent: SavedTalentProxy,
        Invitations: InvitationsProxy,
        Catalog: CatalogProxy,
        Notifications: NotificationsProxy
    };
})();
