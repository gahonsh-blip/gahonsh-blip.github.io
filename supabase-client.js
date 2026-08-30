/**
 * Gahonsh Freelancing Marketplace - Supabase Client SDK Wrapper
 * Production-ready browser integration with zero-build support.
 */

(function() {
    window.GahonshDB = window.GahonshDB || {};

    let _client = null;
    let _initPromise = null;

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

            // Fetch user profile from public.profiles
            const { data: profile } = await client
                .from('profiles')
                .select('*')
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
    const Profiles = {
        async getMyProfile() {
            const client = await getClient();
            if (!client) return null;
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) return null;

            const { data, error } = await client
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) throw error;
            return data;
        },

        async updateMyProfile(updates) {
            const client = await getClient();
            if (!client) throw new Error('Supabase not configured');
            const user = (await client.auth.getUser())?.data?.user;
            if (!user) throw new Error('Unauthorized: Please sign in first.');

            // Sanitize updates: eliminate immutable fields from client payload
            const { id, email, role, is_verified, created_at, ...safeUpdates } = updates;

            const { data, error } = await client
                .from('profiles')
                .update(safeUpdates)
                .eq('id', user.id)
                .select()
                .single();

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

            if (filters.search) {
                query = query.or(`full_name.ilike.%${filters.search}%,title.ilike.%${filters.search}%,bio.ilike.%${filters.search}%`);
            }

            if (filters.skill) {
                query = query.contains('skills', [filters.skill]);
            }

            const { data, error } = await query.order('created_at', { ascending: false });
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

            if (filters.search) {
                query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
            }

            if (filters.minBudget) {
                query = query.gte('budget_min', parseFloat(filters.minBudget));
            }

            const { data, error } = await query.order('created_at', { ascending: false });
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

            const { data, error } = await client
                .from('proposals')
                .select(`
                    *,
                    freelancer:profiles (
                        id,
                        full_name,
                        avatar_url,
                        title,
                        hourly_rate,
                        skills,
                        is_verified
                    )
                `)
                .eq('job_id', jobId)
                .order('created_at', { ascending: false });

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
        }
    };

    // Export services onto global GahonshDB namespace
    window.GahonshDB = {
        getClient,
        Auth,
        Profiles,
        Jobs,
        Proposals,
        Contracts
    };
})();
