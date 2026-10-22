// job-details-flow.js — role-aware job details page logic
// Rendered view branches:
//   1. Job owner (client)      → proposal review list + Accept & Hire
//   2. Freelancer with proposal → my proposal status
//   3. Freelancer (no proposal) → proposal submission form
//   4. Client (not owner)       → message: clients cannot submit proposals
//   5. Guest                    → sign-in prompt

const urlParams = new URLSearchParams(window.location.search);
const jobId = urlParams.get('id') || '';
let currentJob = null;

function showProposalMessage(html, type) {
    const box = document.getElementById('proposalMessage');
    box.className = 'proposal-info-box' + (type === 'error' ? ' proposal-error-box' : type === 'success' ? ' proposal-success-box' : '');
    box.style.display = 'flex';
    box.innerHTML = html;
}

function hideProposalMessage() {
    document.getElementById('proposalMessage').style.display = 'none';
}

async function ensureUser() {
    if (window.GahonshAuthUI && typeof window.GahonshAuthUI.ensureCurrentUser === 'function') {
        return await window.GahonshAuthUI.ensureCurrentUser();
    }
    return (window.GahonshAuthUI && window.GahonshAuthUI.getCurrentUser()) || null;
}

function moneyText(job) {
    if (job.job_type === 'hourly') {
        return `Hourly: $${job.hourly_rate_min || 20} - $${job.hourly_rate_max || 50}/hr`;
    }
    if (job.budget_max && Number(job.budget_max) > Number(job.budget_min || 0)) {
        return `Fixed Budget: $${job.budget_min || 0} - $${job.budget_max}`;
    }
    return `Fixed Budget: $${job.budget_min || 0}`;
}

function statusBadge(status) {
    const map = { submitted: 'Submitted', shortlisted: 'Shortlisted', accepted: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn' };
    return map[status] || status;
}

async function loadJobDetails() {
    const isConfigured = window.isSupabaseConfigured();

    if (isConfigured && jobId) {
        try {
            currentJob = await window.GahonshDB.Jobs.getJobById(jobId);
        } catch (err) {
            console.warn('[job-details] Supabase getJobById error:', err);
        }
    }

    // Demo fallback ONLY when Supabase is not configured at all.
    // When configured, the real (possibly empty) database is the source of truth.
    if (!currentJob && !isConfigured) {
        const targetId = jobId || 'demo-job-1';
        currentJob = {
            id: targetId,
            title: 'Corporate Excel VBA Automated Financial Reporting Dashboard',
            category: 'Excel Automation',
            job_type: 'fixed',
            budget_min: 450,
            experience_level: 'intermediate',
            estimated_duration: 'Less than 1 month',
            description: 'We are looking for an expert Excel and VBA automation specialist to architect an end-to-end financial dashboard.\n\nKey Requirements:\n\u2022 Automated multi-branch data aggregation via macros\n\u2022 Dynamic monthly P&L charts and variance indicators\n\u2022 Protected output formulas with clean modern styling\n\u2022 Turnaround within 7-10 days with documentation',
            required_skills: ['Excel VBA', 'Financial Modeling', 'Pivot Tables', 'Macro Security'],
            proposals_count: 3,
            client: { full_name: 'Apex Global Logistics', location: 'London, UK', is_verified: true }
        };
    }

    if (!currentJob) {
        const section = document.getElementById('proposalInteractionSection');
        if (section) section.style.display = 'none';
        document.getElementById('jobTitle').innerText = 'Project unavailable';
        document.getElementById('jobDescription').innerText = 'This project could not be found or you do not have permission to view it. It may have been removed or is no longer open.';
        showProposalMessage('<i class="fa-solid fa-circle-info"></i><span>This project could not be found or you do not have permission to view it.</span>', 'error');
        document.getElementById('clientName').innerText = 'Unknown';
        return;
    }

    document.getElementById('jobTitle').innerText = currentJob.title;
    document.getElementById('jobBudgetBadge').innerHTML = `<i class="fa-solid fa-dollar-sign"></i> ${moneyText(currentJob)}`;
    document.getElementById('jobCategoryBadge').innerHTML = `<i class="fa-solid fa-layer-group"></i> ${currentJob.category || 'General'}`;
    document.getElementById('jobExpBadge').innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${currentJob.experience_level || 'intermediate'}`;
    document.getElementById('jobDurationBadge').innerHTML = `<i class="fa-regular fa-clock"></i> ${currentJob.estimated_duration || '1 to 3 months'}`;
    document.getElementById('jobProposalsBadge').innerHTML = `<i class="fa-solid fa-paperclip"></i> ${currentJob.proposals_count || 0} Proposals`;
    document.getElementById('jobDescription').innerText = currentJob.description;

    const skillsCloud = document.getElementById('skillsCloud');
    skillsCloud.innerHTML = (currentJob.required_skills || []).map(s => `<span class="skill-tag">${s}</span>`).join('');

    const clientName = currentJob.client?.full_name || 'Verified Client';
    document.getElementById('clientName').innerText = clientName;
    document.getElementById('clientAvatarLetter').innerText = clientName.charAt(0).toUpperCase();
    document.getElementById('clientLocation').innerText = currentJob.client?.location || 'Remote / Worldwide';
    document.getElementById('clientVerifiedTag').innerHTML = currentJob.client?.is_verified
        ? '<i class="fa-solid fa-shield-check"></i> Identity Verified'
        : '<i class="fa-regular fa-circle-question"></i> Account Holder';

    const user = await ensureUser();
    const isOwner = !!(user && currentJob.client_id === user.id);
    if (isOwner) {
        await renderClientProposalsView();
    } else {
        await renderFreelancerOrGuestView(user);
    }
}

// --------------------------------------------------------------------------
// CLIENT (JOB OWNER) VIEW: PROPOSALS + ACCEPT & HIRE
// --------------------------------------------------------------------------
async function renderClientProposalsView() {
    document.getElementById('proposalSectionHeading').innerText = 'Received Proposals for Your Review';
    document.getElementById('proposalForm').style.display = 'none';
    document.getElementById('myProposalView').style.display = 'none';
    document.getElementById('contractCard').style.display = 'none';
    hideProposalMessage();
    const clientView = document.getElementById('clientProposalsView');
    clientView.style.display = 'block';

    let contract = null;
    if (window.isSupabaseConfigured()) {
        try {
            contract = await window.GahonshDB.Contracts.getContractForJob(currentJob.id);
        } catch (e) {
            console.error('[job-details] Contract load error', e);
        }
    }

    let proposals = [];
    if (window.isSupabaseConfigured()) {
        try {
            proposals = await window.GahonshDB.Proposals.getProposalsForJob(currentJob.id);
        } catch (e) {
            console.error('[job-details] Proposals load error', e);
        }
    }

    const listContainer = document.getElementById('clientProposalsList');

    if (contract) {
        renderContractCard(contract, true);
        clientView.style.display = 'block';
        listContainer.innerHTML = `
            <p style="color:var(--accent-green); font-size:0.95rem; margin-bottom:14px;">
                <i class="fa-solid fa-circle-check"></i> <strong>Hired successfully.</strong> This contract is active — the freelancer has been hired.
            </p>
            <p style="color:var(--text-slate); font-size:0.9rem;">Below is the full list of proposals received for this project.</p>
        ` + proposals.map(proposalCardHtml).join('');
        return;
    }

    if (proposals.length === 0) {
        listContainer.innerHTML = '<p style="color:var(--text-slate);">No proposals received yet for this project.</p>';
        return;
    }

    listContainer.innerHTML = proposals.map(proposalCardHtml).join('');

    if (currentJob.status !== 'open') {
        showProposalMessage('<i class="fa-solid fa-circle-info"></i><span>This project is no longer open for hiring (current status: <strong>' + currentJob.status + '</strong>), so proposals can no longer be accepted.</span>');
    }
}

function proposalCardHtml(p) {
    const canHire = p.status === 'submitted' || p.status === 'shortlisted';
    const actionHtml = p.status === 'accepted'
        ? '<span style="color:var(--accent-green); font-weight:700;">Hired \u2713</span>'
        : (p.status === 'rejected'
            ? '<span style="color:#f87171; font-weight:600;">Rejected</span>'
            : (canHire
                ? `<button class="btn-hire" onclick="hireFreelancer('${p.id}', this)">Accept &amp; Hire</button>`
                : `<span style="color:var(--text-slate); font-weight:600;">${p.status}</span>`));

    return `
        <div class="proposal-card" id="prop-${p.id}">
            <div class="proposal-card-header">
                <div>
                    <strong>${escapeHtml(p.freelancer?.full_name) || 'Freelancer'}</strong>
                    <span style="color:var(--accent-cyan); margin-left:8px;">Bid: $${p.bid_amount}</span> &bull; <span>${p.delivery_time_days} days</span> &bull; <span>${new Date(p.created_at).toLocaleDateString()}</span>
                </div>
                <div>${actionHtml}</div>
            </div>
            <p style="font-size:0.9rem; color:var(--text-slate);">${escapeHtml(p.cover_letter)}</p>
        </div>
    `;
}

window.hireFreelancer = async function (proposalId, btn) {
    if (currentJob && currentJob.status !== 'open') {
        window.GahonshAuthUI.showToast('\u274C This project is no longer open for hiring.');
        return;
    }
    if (!confirm('Accept this proposal and establish the contract?')) return;

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Accepting...';
    }

    try {
        if (!window.isSupabaseConfigured()) {
            throw new Error('Supabase is not configured yet. Please connect your database first.');
        }
        await window.GahonshDB.Contracts.acceptProposalAndHire(proposalId);
        window.GahonshAuthUI.showToast('\u{1F389} Hired successfully! Contract created.');
        setTimeout(() => window.location.reload(), 1600);
    } catch (err) {
        console.error('[hireFreelancer]', err);
        window.GahonshAuthUI.showToast('\u274C ' + (err.message || 'Hiring failed. Please try again.'));
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Accept &amp; Hire';
        }
    }
};

// --------------------------------------------------------------------------
// FREELANCER / GUEST VIEW
// --------------------------------------------------------------------------
async function renderFreelancerOrGuestView(user) {
    const form = document.getElementById('proposalForm');
    const myProposalView = document.getElementById('myProposalView');
    const clientView = document.getElementById('clientProposalsView');
    const contractCard = document.getElementById('contractCard');
    clientView.style.display = 'none';
    form.style.display = 'none';
    myProposalView.style.display = 'none';
    contractCard.style.display = 'none';
    hideProposalMessage();

    if (currentJob.status && currentJob.status !== 'open') {
        document.getElementById('proposalSectionHeading').innerText = 'Project Status';
        if (user && user.profile?.role === 'freelancer' && window.isSupabaseConfigured()) {
            try {
                const myProposal = await window.GahonshDB.Proposals.getMyProposalForJob(currentJob.id);
                if (myProposal) {
                    renderMyProposalStatus(myProposal);
                    myProposalView.style.display = 'block';
                    await renderFreelancerContractIfAny(contractCard);
                }
            } catch (e) {
                console.warn('[job-details] getMyProposalForJob', e);
            }
        }
        showProposalMessage('<i class="fa-solid fa-lock"></i><span>This project is closed for new proposals (current status: <strong>' + currentJob.status + '</strong>).</span>');
        return;
    }

    if (!user) {
        document.getElementById('proposalSectionHeading').innerText = 'Submit a Proposal for this Project';
        showProposalMessage('<i class="fa-solid fa-circle-info"></i><span>Please <a href="#" onclick="window.GahonshAuthUI.openAuthModal(\'signup\'); return false;" style="color:var(--accent-cyan);">sign in</a> as a Freelancer to submit a proposal for this project.</span>');
        return;
    }

    if (user.profile?.role === 'client') {
        document.getElementById('proposalSectionHeading').innerText = 'Proposals';
        showProposalMessage('<i class="fa-solid fa-briefcase"></i><span>You are signed in as a <strong>Client</strong>. Clients cannot submit proposals. If this is your project, open it from your <a href="marketplace-dashboard.html" style="color:var(--accent-cyan);">Marketplace Portal</a> to review proposals.</span>');
        return;
    }

    if (user.profile?.role === 'freelancer' && window.isSupabaseConfigured()) {
        try {
            const myProposal = await window.GahonshDB.Proposals.getMyProposalForJob(currentJob.id);
            if (myProposal) {
                renderMyProposalStatus(myProposal);
                myProposalView.style.display = 'block';
                document.getElementById('proposalSectionHeading').innerText = 'Your Proposal';
                showProposalMessage('<i class="fa-solid fa-circle-check"></i><span>You have already submitted a proposal for this project. Its status is shown below. You can only submit one proposal per project.</span>', 'success');
                await renderFreelancerContractIfAny(contractCard);
                return;
            }
        } catch (e) {
            console.warn('[job-details] getMyProposalForJob', e);
        }
    }

    document.getElementById('proposalSectionHeading').innerText = 'Submit a Proposal for this Project';
    form.style.display = 'block';
    if (window.isSupabaseConfigured()) {
        try {
            const contract = await window.GahonshDB.Contracts.getContractForJob(currentJob.id);
            if (contract) {
                renderContractCard(contract, false);
            }
        } catch (e) {
            console.warn('[job-details] getContractForJob', e);
        }
    }
}

async function renderFreelancerContractIfAny(contractCard) {
    if (!window.isSupabaseConfigured()) return;
    try {
        const contract = await window.GahonshDB.Contracts.getContractForJob(currentJob.id);
        if (contract) {
            renderContractCard(contract, false);
            contractCard.style.display = 'block';
        }
    } catch (e) {
        console.warn('[job-details] renderFreelancerContractIfAny', e);
    }
}

function renderMyProposalStatus(proposal) {
    const box = document.getElementById('myProposalDetails');
    const statusStyles = { submitted: 'color:var(--accent-cyan);', shortlisted: 'color:#fbbf24;', accepted: 'color:var(--accent-green);', rejected: 'color:#f87171;', withdrawn: 'color:var(--text-slate);' };
    box.innerHTML = `
        <div class="my-proposal-status-card">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <strong style="${statusStyles[proposal.status] || ''}">${statusBadge(proposal.status)}</strong>
                <span style="color:var(--accent-cyan); font-weight:700;">Bid: $${proposal.bid_amount}</span>
            </div>
            <p style="color:var(--text-slate); font-size:0.85rem; margin-top:6px;">Submitted on ${new Date(proposal.created_at).toLocaleDateString()} &bull; Estimated delivery: ${proposal.delivery_time_days} days</p>
        </div>
    `;
}

function renderContractCard(contract, isClientView) {
    const card = document.getElementById('contractCard');
    const hiredName = isClientView
        ? contract.freelancer?.full_name || 'the freelancer'
        : contract.client?.full_name || 'the client';

    card.innerHTML = `
        <div class="contract-card">
            <h4><i class="fa-solid fa-handshake"></i> Contract Active</h4>
            <p style="color:var(--text-slate); font-size:0.92rem; margin-bottom:16px;">
                <strong>Hired successfully.</strong> A fixed-price contract is now active between you and <strong>${escapeHtml(hiredName)}</strong>.
            </p>
            <div class="contract-detail-grid">
                <div class="contract-detail-item">
                    <div class="cd-label">Job</div>
                    <div class="cd-value">${escapeHtml(contract.job?.title || currentJob.title)}</div>
                </div>
                <div class="contract-detail-item">
                    <div class="cd-label">Agreed Amount</div>
                    <div class="cd-value">$${contract.agreed_amount}</div>
                </div>
                <div class="contract-detail-item">
                    <div class="cd-label">Contract Status</div>
                    <div class="cd-value" style="color:var(--accent-green); text-transform:capitalize;">${contract.status}</div>
                </div>
                <div class="contract-detail-item">
                    <div class="cd-label">Started</div>
                    <div class="cd-value">${new Date(contract.created_at).toLocaleDateString()}</div>
                </div>
            </div>
            <a href="marketplace-dashboard.html" class="btn-hire-outline" style="margin-top:16px; display:inline-flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-briefcase"></i> View in My Portal
            </a>
        </div>
    `;
    card.style.display = 'block';
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
}

document.getElementById('proposalForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitProposal');
    const user = await ensureUser();

    if (!user) {
        window.GahonshAuthUI.openAuthModal('signup');
        window.GahonshAuthUI.showToast('Please sign in as a Freelancer to bid.');
        return;
    }

    if (user.profile?.role === 'client') {
        window.GahonshAuthUI.showToast('\u274C Clients cannot submit proposals. Only freelancer accounts can bid.');
        return;
    }

    if (!window.isSupabaseConfigured()) {
        window.GahonshAuthUI.showToast('\u274C Supabase is not configured yet. Please connect your database to submit proposals.');
        return;
    }

    const bidAmount = document.getElementById('bidAmount').value;
    const deliveryDays = document.getElementById('deliveryDays').value;
    const coverLetter = document.getElementById('coverLetter').value;

    if (!bidAmount || !deliveryDays || !coverLetter) {
        window.GahonshAuthUI.showToast('Please fill out all required fields.');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

    try {
        await window.GahonshDB.Proposals.submitProposal(currentJob.id, coverLetter, bidAmount, deliveryDays);
        window.GahonshAuthUI.showToast('\u{1F389} Proposal submitted successfully!');
        document.getElementById('proposalForm').reset();
        setTimeout(() => window.location.reload(), 1400);
    } catch (err) {
        console.error('[submitProposal]', err);
        let message = err.message || 'Submission failed.';
        if (/duplicate/i.test(message) || /uq_job_freelancer/i.test(message)) {
            message = 'You have already submitted a proposal for this project.';
        } else if (/not open/i.test(message)) {
            message = 'This project is no longer accepting proposals.';
        } else if (/row-level security/i.test(message) || /permission denied/i.test(message)) {
            message = 'Your account is not allowed to submit a proposal for this project.';
        }
        showProposalMessage('<i class="fa-solid fa-circle-exclamation"></i><span>' + message + '</span>', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Proposal to Client';
    }
};

document.getElementById('mobile-menu-open-btn').onclick = () => {
    document.getElementById('menu-overlay').classList.add('active');
    document.getElementById('mobile-menu-container').classList.add('active');
};
document.getElementById('menu-close-btn').onclick = () => {
    document.getElementById('menu-overlay').classList.remove('active');
    document.getElementById('mobile-menu-container').classList.remove('active');
};
document.getElementById('menu-overlay').onclick = () => {
    document.getElementById('menu-overlay').classList.remove('active');
    document.getElementById('mobile-menu-container').classList.remove('active');
};

document.addEventListener('DOMContentLoaded', loadJobDetails);