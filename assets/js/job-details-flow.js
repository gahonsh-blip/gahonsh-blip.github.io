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
    // Budget fields are numeric in the schema but arrive as strings from
    // PostgREST; coerce them so a crafted value cannot inject markup later.
    const min = Number(job.budget_min) || 0;
    const max = Number(job.budget_max) || 0;
    if (job.job_type === 'hourly') {
        const lo = Number(job.hourly_rate_min) || 20;
        const hi = Number(job.hourly_rate_max) || 50;
        return `Hourly: $${lo} - $${hi}/hr`;
    }
    if (max > min) {
        return `Fixed Budget: $${min} - $${max}`;
    }
    return `Fixed Budget: $${min}`;
}

function statusBadge(status) {
    const map = { submitted: 'Submitted', shortlisted: 'Shortlisted', accepted: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn' };
    return map[status] || status;
}

// In-site send/receive. Mounted only for a participant on the project — the
// owner, a freelancer who has proposed, or the hired freelancer — so a visitor
// never sees an upload box they cannot use.
function mountFileTransfer(canUpload) {
    const host = document.getElementById('fileTransferSection');
    if (!host) return;
    if (!window.GahonshFileTransfer || !window.isMarketplaceReady() || !currentJob || !currentJob.id) {
        host.textContent = '';
        return;
    }
    window.GahonshFileTransfer.mount({
        containerId: 'fileTransferSection',
        jobId: currentJob.id,
        scope: 'job',
        canUpload: !!canUpload,
        title: 'Project Files',
        subtitle: canUpload
            ? 'Send briefs, drafts and final deliverables securely. Files stay inside the site and are visible only to you and the other party on this project.'
            : 'Files shared on this project. You can download anything the other party has sent you.'
    });
}

// Mirrors can_upload_job_files() in the SQL schema so the upload control is
// shown only to someone whose upload would actually be accepted: the project
// owner, an admin, the freelancer on an active contract, or a freelancer whose
// proposal is still live. A rejected bidder keeps read access to files already
// shared, but must not be offered an upload box that the policy would deny.
function userMayUploadFiles(user, proposal) {
    if (!user) return false;
    if (user.profile?.role === 'admin') return true;
    if (currentJob && currentJob.client_id === user.id) return true;
    if (proposal && ['submitted', 'shortlisted'].includes(proposal.status)) return true;
    // An accepted proposal becomes a contract. Only an in-progress job keeps
    // the freelancer's upload permission; completed work stays read-only.
    if (proposal && proposal.status === 'accepted') return currentJob?.status === 'in_progress';
    return false;
}

async function loadJobDetails() {
    const isConfigured = window.isMarketplaceReady();

    if (isConfigured && jobId) {
        try {
            currentJob = await window.GahonshDB.Jobs.getJobById(jobId);
        } catch (err) {
            console.warn('[job-details] Supabase getJobById error:', err);
        }
    }

    // Last-resort demo card only when no marketplace backend is available at all.
    // Normally the local/Supabase engine supplies the data above.
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
        // Everything else on the page is only true of a real listing: the
        // badges still read "Budget: Loading..." and the client card claimed
        // "Identity Verified" for an account that does not exist.
        const hide = (el) => { if (el) el.style.display = 'none'; };
        const hideWithHeading = (el) => {
            if (!el) return;
            const heading = el.previousElementSibling;
            if (heading && heading.classList.contains('section-header-title')) hide(heading);
            hide(el);
        };
        hide(document.querySelector('.meta-badges-row'));
        hide(document.querySelector('.side-card'));
        hideWithHeading(document.getElementById('skillsCloud'));
        return;
    }

    document.getElementById('jobTitle').innerText = currentJob.title;
    document.getElementById('jobBudgetBadge').innerHTML = `<i class="fa-solid fa-dollar-sign"></i> ${moneyText(currentJob)}`;
    document.getElementById('jobCategoryBadge').innerHTML = `<i class="fa-solid fa-layer-group"></i> ${escapeHtml(currentJob.category || 'General')}`;
    document.getElementById('jobExpBadge').innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${escapeHtml(currentJob.experience_level || 'intermediate')}`;
    document.getElementById('jobDurationBadge').innerHTML = `<i class="fa-regular fa-clock"></i> ${escapeHtml(currentJob.estimated_duration || '1 to 3 months')}`;
    const proposalCount = Number(currentJob.proposals_count) || 0;
    const proposalsBadge = document.getElementById('jobProposalsBadge');
    proposalsBadge.innerHTML = '<i class="fa-solid fa-paperclip"></i> ';
    proposalsBadge.append(document.createTextNode(`${proposalCount} Proposal${proposalCount === 1 ? '' : 's'}`));
    document.getElementById('jobDescription').innerText = currentJob.description;

    const skillsCloud = document.getElementById('skillsCloud');
    skillsCloud.innerHTML = (currentJob.required_skills || []).map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('');

    const clientName = currentJob.client?.full_name || 'Verified Client';
    document.getElementById('clientName').innerText = clientName;
    document.getElementById('clientAvatarLetter').innerText = clientName.charAt(0).toUpperCase();
    document.getElementById('clientLocation').innerText = currentJob.client?.location || 'Remote / Worldwide';
    document.getElementById('clientVerifiedTag').innerHTML = currentJob.client?.is_verified
        ? '<i class="fa-solid fa-shield-check"></i> Identity Verified'
        : '<i class="fa-regular fa-circle-question"></i> Account Holder';

    const recordBtn = document.getElementById('clientRecordBtn');
    const recordLine = document.getElementById('clientRecordLine');
    if (recordBtn) {
        if (currentJob.client_id) {
            recordBtn.dataset.recordClient = currentJob.client_id;
            recordBtn.dataset.recordClientName = clientName;
            recordBtn.style.display = '';
        } else {
            recordBtn.style.display = 'none';
        }
    }
    if (recordLine) {
        recordLine.textContent = 'Loading client record…';
        if (window.isMarketplaceReady() && currentJob.client_id && window.GahonshDB.Records) {
            try {
                const clientRecord = await window.GahonshDB.Records.getClientRecord(currentJob.client_id);
                const summary = clientRecord && clientRecord.summary;
                const count = (value, noun) => `${Number(value) || 0} ${noun}${Number(value) === 1 ? '' : 's'}`;
                recordLine.textContent = summary
                    ? `${count(summary.jobs_posted, 'project')} posted · ${count(summary.hires, 'hire')} · ${count(summary.completed_jobs, 'project')} completed`
                    : 'No client record yet';
            } catch (err) {
                console.warn('[job-details] client record', err);
                recordLine.textContent = window.GahonshDB.isBackendNotProvisioned(err)
                    ? 'Client record needs a database update'
                    : 'Client record unavailable';
            }
        } else {
            recordLine.textContent = 'Client record unavailable';
        }
    }

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
    mountFileTransfer(true);

    let contract = null;
    if (window.isMarketplaceReady()) {
        try {
            contract = await window.GahonshDB.Contracts.getContractForJob(currentJob.id);
        } catch (e) {
            console.error('[job-details] Contract load error', e);
        }
    }

    let proposals = [];
    if (window.isMarketplaceReady()) {
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
        showProposalMessage('<i class="fa-solid fa-circle-info"></i><span>This project is no longer open for hiring (current status: <strong>' + escapeHtml(currentJob.status) + '</strong>), so proposals can no longer be accepted.</span>');
    }
}

function proposalCardHtml(p) {
    const canHire = p.status === 'submitted' || p.status === 'shortlisted';
    const jobOpen = !currentJob || !currentJob.status || currentJob.status === 'open';
    // Shortlist and decline are the two decisions that come before hiring. The
    // server refuses both once the job leaves `open`, so the buttons follow.
    const reviewHtml = canHire && jobOpen
        ? `<button class="btn-shortlist" data-proposal-action="shortlisted" data-proposal-id="${escapeHtml(p.id)}"${p.status === 'shortlisted' ? ' disabled' : ''}>Shortlist</button>` +
          `<button class="btn-decline" data-proposal-action="rejected" data-proposal-id="${escapeHtml(p.id)}">Decline</button>`
        : '';
    const actionHtml = p.status === 'accepted'
        ? '<span style="color:var(--accent-green); font-weight:700;">Hired \u2713</span>'
        : (p.status === 'rejected'
            ? '<span style="color:#f87171; font-weight:600;">Rejected</span>'
            : (canHire
                ? reviewHtml + `<button class="btn-hire" data-proposal-id="${escapeHtml(p.id)}">Accept &amp; Hire</button>`
                : `<span style="color:var(--text-slate); font-weight:600;">${escapeHtml(statusBadge(p.status))}</span>`));

    const recordHtml = p.freelancer?.id
        ? `<button type="button" class="btn-record" data-record-worker="${escapeHtml(p.freelancer.id)}" data-record-name="${escapeHtml(p.freelancer.full_name || 'Freelancer')}"><i class="fa-solid fa-clipboard-list"></i> Record</button>`
        : '';

    const resumeHtml = p.freelancer?.resume_name
        ? `<button type="button" class="btn-resume" data-resume-uid="${escapeHtml(p.freelancer.id)}" aria-label="View ${escapeHtml(p.freelancer.full_name || 'freelancer')} resume"><i class="fa-solid fa-file-pdf"></i> Resume</button>`
        : '';

    return `
        <div class="proposal-card" id="prop-${escapeHtml(p.id)}">
            <div class="proposal-card-header">
                <div>
                    <strong>${escapeHtml(p.freelancer?.full_name) || 'Freelancer'}</strong>
                    <span style="color:var(--accent-cyan); margin-left:8px;">Bid: $${Number(p.bid_amount) || 0}</span> &bull; <span>${Number(p.delivery_time_days) || 0} days</span> &bull; <span>${new Date(p.created_at).toLocaleDateString()}</span>
                </div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">${recordHtml}${resumeHtml}${actionHtml}</div>
            </div>
            <p style="font-size:0.9rem; color:var(--text-slate);">${escapeHtml(p.cover_letter)}</p>
        </div>
    `;
}

window.hireFreelancer = async function (proposalId, btn) {
    /* Called via event delegation so proposal ids never enter an inline handler. */
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
        if (!window.isMarketplaceReady()) {
            throw new Error('The marketplace service is unavailable. Please try again shortly.');
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
        if (user && user.profile?.role === 'freelancer' && window.isMarketplaceReady()) {
            try {
                const myProposal = await window.GahonshDB.Proposals.getMyProposalForJob(currentJob.id);
                if (myProposal) {
                    renderMyProposalStatus(myProposal);
                    myProposalView.style.display = 'block';
                    await renderFreelancerContractIfAny(contractCard);
                    mountFileTransfer(userMayUploadFiles(user, myProposal));
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

    if (user.profile?.role === 'freelancer' && window.isMarketplaceReady()) {
        try {
            const myProposal = await window.GahonshDB.Proposals.getMyProposalForJob(currentJob.id);
            if (myProposal) {
                renderMyProposalStatus(myProposal);
                myProposalView.style.display = 'block';
                document.getElementById('proposalSectionHeading').innerText = 'Your Proposal';
                showProposalMessage('<i class="fa-solid fa-circle-check"></i><span>You have already submitted a proposal for this project. Its status is shown below. You can only submit one proposal per project.</span>', 'success');
                await renderFreelancerContractIfAny(contractCard);
                mountFileTransfer(userMayUploadFiles(user, myProposal));
                return;
            }
        } catch (e) {
            console.warn('[job-details] getMyProposalForJob', e);
        }
    }

    document.getElementById('proposalSectionHeading').innerText = 'Submit a Proposal for this Project';
    form.style.display = 'block';
    if (window.isMarketplaceReady()) {
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
    if (!window.isMarketplaceReady()) return;
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
    const canWithdraw = ['submitted', 'shortlisted'].includes(proposal.status);
    const withdrawHtml = canWithdraw
        ? `<button type="button" class="btn-withdraw" data-withdraw-proposal="${escapeHtml(proposal.id)}">Withdraw proposal</button>`
        : '';
    const hint = proposal.status === 'shortlisted'
        ? 'The client shortlisted your proposal. They have not hired yet.'
        : (proposal.status === 'rejected'
            ? 'The client declined this proposal. You can apply to other projects.'
            : (proposal.status === 'accepted'
                ? 'You were hired. The contract is in your portal.'
                : ''));
    box.innerHTML = `
        <div class="my-proposal-status-card">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <strong style="${statusStyles[proposal.status] || ''}">${escapeHtml(statusBadge(proposal.status))}</strong>
                <span style="color:var(--accent-cyan); font-weight:700;">Bid: $${Number(proposal.bid_amount) || 0}</span>
            </div>
            <p style="color:var(--text-slate); font-size:0.85rem; margin-top:6px;">Submitted on ${new Date(proposal.created_at).toLocaleDateString()} &bull; Estimated delivery: ${Number(proposal.delivery_time_days) || 0} days</p>
            ${hint ? `<p style="color:var(--text-slate); font-size:0.85rem; margin-top:4px;">${escapeHtml(hint)}</p>` : ''}
            ${withdrawHtml ? `<div style="margin-top:10px;">${withdrawHtml}</div>` : ''}
        </div>
    `;
}

// Client shortlist / decline. Delegated like hireFreelancer() so a proposal id
// never enters an inline handler.
window.reviewProposal = async function (proposalId, status, btn) {
    if (!window.isMarketplaceReady()) {
        window.GahonshAuthUI.showToast('The marketplace service is unavailable. Please try again shortly.');
        return;
    }
    if (status === 'rejected' && !confirm('Decline this proposal? The freelancer will see it as rejected.')) return;

    const buttons = btn ? Array.from(btn.parentElement.querySelectorAll('button')) : [];
    buttons.forEach((b) => { b.disabled = true; });
    try {
        await window.GahonshDB.Proposals.setStatus(proposalId, status);
        window.GahonshAuthUI.showToast(status === 'shortlisted'
            ? 'Proposal shortlisted.'
            : (status === 'rejected' ? 'Proposal declined.' : 'Proposal restored.'));
        await renderClientProposalsView();
    } catch (err) {
        console.error('[reviewProposal]', err);
        window.GahonshAuthUI.showToast('\u274C ' + (err.message || 'Could not update the proposal.'));
        buttons.forEach((b) => { b.disabled = false; });
    }
};

window.withdrawMyProposal = async function (proposalId, btn) {
    if (!window.isMarketplaceReady()) {
        window.GahonshAuthUI.showToast('The marketplace service is unavailable. Please try again shortly.');
        return;
    }
    if (!confirm('Withdraw this proposal? The client will no longer see it as active.')) return;
    if (btn) btn.disabled = true;
    try {
        await window.GahonshDB.Proposals.withdrawProposal(proposalId);
        window.GahonshAuthUI.showToast('Proposal withdrawn.');
        const user = window.GahonshAuthUI?.getCurrentUser?.();
        await renderFreelancerOrGuestView(user);
    } catch (err) {
        console.error('[withdrawMyProposal]', err);
        window.GahonshAuthUI.showToast('\u274C ' + (err.message || 'Could not withdraw the proposal.'));
        if (btn) btn.disabled = false;
    }
};

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
                    <div class="cd-value">$${Number(contract.agreed_amount) || 0}</div>
                </div>
                <div class="contract-detail-item">
                    <div class="cd-label">Contract Status</div>
                    <div class="cd-value" style="color:var(--accent-green); text-transform:capitalize;">${escapeHtml(contract.status)}</div>
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

    if (!window.isMarketplaceReady()) {
        window.GahonshAuthUI.showToast('\u274C Marketplace service unavailable. Please try again shortly.');
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
        showProposalMessage('<i class="fa-solid fa-circle-exclamation"></i><span>' + escapeHtml(message) + '</span>', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Proposal to Client';
    }
};

// Delegated hire button. The proposal id is read from a data attribute so it
// can never break out of an inline onclick attribute.
document.addEventListener('click', (e) => {
    // Shortlist / decline first: they share the data-proposal-id attribute with
    // the hire button, so they must be matched before it.
    const reviewBtn = e.target.closest && e.target.closest('[data-proposal-action]');
    if (reviewBtn) {
        window.reviewProposal(reviewBtn.dataset.proposalId, reviewBtn.dataset.proposalAction, reviewBtn);
        return;
    }
    const withdrawBtn = e.target.closest && e.target.closest('[data-withdraw-proposal]');
    if (withdrawBtn) {
        window.withdrawMyProposal(withdrawBtn.dataset.withdrawProposal, withdrawBtn);
        return;
    }
    const hireBtn = e.target.closest && e.target.closest('[data-proposal-id]');
    if (hireBtn) window.hireFreelancer(hireBtn.dataset.proposalId, hireBtn);
});

// Record buttons: public worker records on proposal cards and the client
// summary in the sidebar. Values come from data attributes, never inline JS.
document.addEventListener('click', (e) => {
    const workerBtn = e.target.closest && e.target.closest('[data-record-worker]');
    if (workerBtn && window.GahonshRecords) {
        window.GahonshRecords.openWorkerRecord(workerBtn.dataset.recordWorker, workerBtn.dataset.recordName);
        return;
    }
    const clientBtn = e.target.closest && e.target.closest('[data-record-client]');
    if (clientBtn && clientBtn.dataset.recordClient && window.GahonshRecords) {
        window.GahonshRecords.openClientRecord(clientBtn.dataset.recordClient, clientBtn.dataset.recordClientName);
    }
});

// Delegated resume button. The blank tab is opened synchronously so the async
// signed-URL fetch is not blocked as a popup, and only signed-in users get one.
async function openFreelancerResume(userId, popup) {
    const toast = (msg) => {
        if (window.GahonshAuthUI && window.GahonshAuthUI.showToast) window.GahonshAuthUI.showToast(msg);
    };
    try {
        if (!window.GahonshDB?.Profiles?.getResume) {
            throw new Error('Marketplace service is not ready. Please try again shortly.');
        }
        const resume = await window.GahonshDB.Profiles.getResume(userId);
        if (!resume || !resume.url) {
            if (popup) popup.close();
            toast('This freelancer has not uploaded a resume yet.');
            return;
        }
        if (popup) popup.location.href = resume.url;
        else window.open(resume.url, '_blank', 'noopener');
        if (typeof resume.revoke === 'function') setTimeout(resume.revoke, 60000);
    } catch (err) {
        if (popup) popup.close();
        const message = String((err && err.message) || err);
        if ((err && err.code === 'AUTH_REQUIRED') || /sign in/i.test(message)) {
            toast('Please sign in to view resumes.');
            if (window.GahonshAuthUI?.openAuthModal) window.GahonshAuthUI.openAuthModal('signin');
        } else {
            toast('Could not open the resume: ' + message);
        }
    }
}

document.addEventListener('click', (e) => {
    const resumeBtn = e.target.closest && e.target.closest('[data-resume-uid]');
    if (!resumeBtn) return;

    const user = window.GahonshAuthUI?.getCurrentUser?.();
    if (!user) {
        if (window.GahonshAuthUI?.showToast) window.GahonshAuthUI.showToast('Please sign in to view resumes.');
        if (window.GahonshAuthUI?.openAuthModal) window.GahonshAuthUI.openAuthModal('signin');
        return;
    }

    const popup = window.open('', '_blank');
    openFreelancerResume(resumeBtn.dataset.resumeUid, popup);
});

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

// Signing in or out changes who may bid, so re-render the proposal panel
// instead of leaving the previous account's proposal on screen.
document.addEventListener('DOMContentLoaded', () => {
    const auth = window.GahonshDB?.Auth;
    if (!auth || typeof auth.onAuthStateChange !== 'function') return;
    let lastUserId = (window.GahonshAuthUI?.getCurrentUser?.() || {}).id || null;
    auth.onAuthStateChange((event, session, user) => {
        const nextUserId = (user && user.id) || null;
        if (nextUserId === lastUserId) return;
        lastUserId = nextUserId;
        loadJobDetails();
    });
});
