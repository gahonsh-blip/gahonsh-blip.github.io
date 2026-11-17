/**
 * Loan Account (A-Z) detail view for the admin portals.
 *
 * The Customer Profile answers "how is this borrower doing overall"; this view
 * answers "what exactly is going on with this one loan". It renders from
 * `GET /api/loans/:id/account` and is shared by `customers.html` (from the
 * Loans table in a profile) and `loans.html` (from the loan register), so the
 * presentation lives in one place rather than being copied per page.
 *
 * The modal is injected on first open: pages only need to include this script
 * and call `openLoanDetails(loanId)`.
 */
(function () {
    var MODAL_ID = 'loanDetailsModal';

    function el(id) { return document.getElementById(id); }

    function escape(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function money(v) {
        return '\u20B9' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }

    function date(v) {
        if (!v) return '\u2014';
        var d = new Date(v);
        return isNaN(d.getTime())
            ? escape(String(v))
            : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function field(label, value, cls) {
        return '<div class="la-field"><span class="la-field-label">' + escape(label) + '</span>' +
            '<span class="la-field-value ' + (cls || '') + '">' + value + '</span></div>';
    }

    function section(title, inner) {
        return '<div class="la-section"><h4 class="la-section-title">' + escape(title) + '</h4>' + inner + '</div>';
    }

    function statusBadge(status) {
        if (typeof window.statusBadge === 'function') return window.statusBadge(status);
        return '<span class="badge">' + escape(status) + '</span>';
    }

    function ensureModal() {
        var modal = el(MODAL_ID);
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'modal-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', MODAL_ID + 'Title');
        modal.innerHTML =
            '<div class="modal-content" onclick="event.stopPropagation()">' +
                '<div class="modal-header"><div class="modal-title-wrap">' +
                    '<h2 class="modal-title" id="' + MODAL_ID + 'Title">Loan Account</h2>' +
                '</div>' +
                '<button class="modal-close-btn" id="' + MODAL_ID + 'Close" aria-label="Close modal">\u2715</button></div>' +
                '<div class="modal-body" id="loanDetailsBody"></div>' +
                '<div class="modal-footer"><button class="btn-secondary" id="' + MODAL_ID + 'FooterClose">Close</button></div>' +
            '</div>';
        modal.addEventListener('click', function (event) {
            if (event.target && event.target.id === MODAL_ID) closeLoanDetails();
        });
        document.body.appendChild(modal);
        modal.querySelector('#' + MODAL_ID + 'Close').onclick = closeLoanDetails;
        modal.querySelector('#' + MODAL_ID + 'FooterClose').onclick = closeLoanDetails;
        if (!window.__loanAccountEscapeBound) {
            window.__loanAccountEscapeBound = true;
            document.addEventListener('keydown', function (event) {
                if (event.key !== 'Escape') return;
                var open = el(MODAL_ID);
                if (open && open.classList.contains('active')) {
                    event.stopPropagation();
                    closeLoanDetails();
                }
            }, true);
        }
        return modal;
    }

    /**
     * Closes the loan account. If the customer profile is still open underneath
     * it, re-assert the body scroll lock so the profile stays usable.
     */
    function closeLoanDetails() {
        var modal = el(MODAL_ID);
        if (modal) {
            modal.classList.remove('active');
            var profile = el('customerProfileModal');
            if (profile && profile.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }
    }

    function openLoanDetails(loanId) {
        var modal = ensureModal();
        var body = el('loanDetailsBody');
        if (!body) return;
        body.innerHTML = '<div style="padding:32px;text-align:center;color:var(--color-text-muted);">Loading loan account\u2026</div>';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // apiFetch (admin-shell.js) centralises auth + the platform error envelope.
        var request = typeof window.apiFetch === 'function'
            ? window.apiFetch('/api/loans/' + encodeURIComponent(loanId) + '/account')
            : fetch('/api/loans/' + encodeURIComponent(loanId) + '/account', {
                headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
            }).then(function (r) { return r.json(); });

        Promise.resolve(request)
            .then(function (account) { renderLoanDetails(account); })
            .catch(function (err) {
                body.innerHTML = '<div class="la-empty" style="color: var(--color-danger);">' +
                    escape(err && err.message ? err.message : 'Failed to load loan account') + '</div>';
            });
    }

    function renderLoanDetails(acc) {
        var body = el('loanDetailsBody');
        if (!body) return;
        var f = acc.financials || {};
        var t = acc.timeline || {};
        var i = acc.interest || {};
        var dates = acc.dates || {};
        var kyc = acc.kyc || {};

        var daysCls = t.isOverdue ? 'is-danger' : (t.daysRemaining !== null && t.daysRemaining <= 7 ? 'is-warn' : 'is-ok');
        var daysLabel = t.isOverdue ? 'Overdue' : 'Days Remaining';
        var daysValue = t.isOverdue
            ? (t.overdueDays + ' days')
            : (t.daysRemaining !== null && t.daysRemaining !== undefined ? (t.daysRemaining + ' days') : '\u2014');

        var headline =
            '<div class="loan-headline">' +
                '<div class="headline-card"><div class="headline-value">' + money(f.originalPrincipal) + '</div><div class="headline-label">Original Principal</div></div>' +
                '<div class="headline-card ' + (f.principalOutstanding > 0 ? 'is-warn' : 'is-ok') + '"><div class="headline-value">' + money(f.principalOutstanding) + '</div><div class="headline-label">Principal Outstanding</div></div>' +
                '<div class="headline-card ' + (f.interestOutstanding > 0 ? 'is-warn' : 'is-ok') + '"><div class="headline-value">' + money(f.interestOutstanding) + '</div><div class="headline-label">Interest Outstanding</div></div>' +
                '<div class="headline-card ' + (t.isOverdue ? 'is-danger' : '') + '"><div class="headline-value">' + money(f.totalOutstanding) + '</div><div class="headline-label">Total Outstanding</div></div>' +
                '<div class="headline-card ' + daysCls + '"><div class="headline-value">' + daysValue + '</div><div class="headline-label">' + daysLabel + '</div></div>' +
            '</div>';

        var identity =
            '<div class="la-grid-3">' +
                field('Loan Number', escape(acc.loanNumber)) +
                field('Loan ID', '<code style="font-family:monospace;">' + escape(acc.loanId) + '</code>') +
                field('Status', statusBadge(acc.status)) +
                field('Borrower', escape(acc.customer ? (acc.customer.name || '\u2014') : '\u2014')) +
                field('Mobile', escape(acc.customer && acc.customer.mobile ? acc.customer.mobile : '\u2014')) +
                field('Product', escape(acc.product ? (acc.product.name || acc.product.code || '\u2014') : '\u2014')) +
            '</div>';

        var finance =
            '<div class="la-grid-2"><div>' +
                field('Original Principal', money(f.originalPrincipal), 'is-money') +
                field('Principal Repaid', money(f.totalPrincipalRepaid), 'is-money is-ok') +
                field('Principal Outstanding', money(f.principalOutstanding), 'is-money') +
                field('Interest Accrued', money(f.interestAccrued), 'is-money') +
                field('Interest Paid', money(f.interestPaid), 'is-money is-ok') +
                field('Interest Outstanding', money(f.interestOutstanding), 'is-money') +
            '</div><div>' +
                field('Fees Charged', money(f.feesCharged), 'is-money') +
                field('Fees Paid', money(f.feesPaid), 'is-money is-ok') +
                field('Fee Outstanding', money(f.feeOutstanding), 'is-money') +
                field('Total Repaid', money(f.totalRepaid), 'is-money is-ok') +
                field('Total Outstanding', money(f.totalOutstanding), 'is-money') +
                field('Processing Fee', money(f.processingFeeCharged), 'is-money') +
            '</div></div>';

        var timeline =
            '<div class="la-grid-3">' +
                field('Start Date', date(dates.startDate)) +
                field('Total Tenure', t.totalTenureDays !== null && t.totalTenureDays !== undefined ? (t.totalTenureDays + ' days') : '\u2014') +
                field('Days Elapsed', t.daysElapsed !== null && t.daysElapsed !== undefined ? (t.daysElapsed + ' days') : '\u2014') +
                field('Due Date', date(dates.maturityDate)) +
                field('Days Remaining', t.daysRemaining !== null && t.daysRemaining !== undefined ? (t.daysRemaining + ' days') : '\u2014', t.isOverdue ? 'is-danger' : 'is-ok') +
                field('Overdue Days', t.overdueDays > 0 ? (t.overdueDays + ' days') : 'None', t.overdueDays > 0 ? 'is-danger' : 'is-ok') +
            '</div>';

        var interest =
            '<div class="la-grid-3">' +
                field('Interest Rate', i.ratePercent !== null && i.ratePercent !== undefined ? (i.ratePercent + '% p.a.') : '\u2014') +
                field('Rate Type', escape(i.rateType || '\u2014')) +
                field('Frequency', escape(i.frequency || '\u2014')) +
                field('Calculation Method', escape(i.calculationMethod || '\u2014')) +
                field('Day Count', escape(i.dayCountConvention || '\u2014')) +
                field('Grace Period', i.gracePeriodDays !== null && i.gracePeriodDays !== undefined ? (i.gracePeriodDays + ' days') : '\u2014') +
                field('Interest From', date(i.interestStartDate)) +
                field('Last Calculated', date(i.lastCalculationDate)) +
                field('Next Scheduled', date(i.nextCalculationDate)) +
            '</div>';

        var approval = (acc.approval && (acc.approval.applicationId || acc.approval.approvalDate))
            ? '<div class="la-grid-3">' +
                field('Application ID', '<code style="font-family:monospace;">' + escape(acc.approval.applicationId || '\u2014') + '</code>') +
                field('Applied On', date(acc.approval.appliedDate)) +
                field('Approval Date', date(acc.approval.approvalDate)) +
                field('Approved By', escape(acc.approval.approvedByName || acc.approval.approvedBy || '\u2014')) +
                field('Approved Amount', acc.approval.approvedAmount !== null && acc.approval.approvedAmount !== undefined ? money(acc.approval.approvedAmount) : '\u2014', 'is-money') +
                field('Approved Tenure', acc.approval.approvedTenureDays ? (acc.approval.approvedTenureDays + ' days') : '\u2014') +
            '</div>'
            : '<div class="la-empty">No approval record linked to this loan.</div>';

        var kycBlock =
            '<div class="la-grid-3">' +
                field('KYC Status', kyc.status ? statusBadge(kyc.status) : '\u2014') +
                field('Provider', escape(kyc.provider || '\u2014')) +
                field('Verified On', date(kyc.verifiedAt)) +
                field('Aadhaar', escape(kyc.aadhaarMasked || kyc.aadhaarStatus || '\u2014')) +
                field('PAN', escape(kyc.panMasked || kyc.panStatus || '\u2014')) +
            '</div>';

        var steps = (acc.statusTimeline || []).map(function (s, idx, arr) {
            var isCurrent = idx === arr.length - 1;
            return '<div class="la-step ' + (s.at ? 'is-reached' : '') + ' ' + (isCurrent ? 'is-current' : '') + '">' +
                '<div class="la-step-name">' + escape(s.status) + '</div>' +
                '<div class="la-step-date">' + date(s.at) + '</div></div>';
        }).join('');

        var repayments = (acc.repayments || []).length
            ? '<div style="overflow-x:auto;"><table class="la-table"><thead><tr>' +
                '<th>Date</th><th>Reference</th>' +
                '<th class="num">Principal</th><th class="num">Interest</th><th class="num">Fee</th>' +
                '<th class="num">Total</th><th>Mode</th><th class="num">Balance After</th>' +
                '</tr></thead><tbody>' +
                acc.repayments.map(function (r) {
                    return '<tr>' +
                        '<td>' + date(r.date) + '</td>' +
                        '<td style="font-family:monospace;">' + escape(r.reference || '\u2014') + '</td>' +
                        '<td class="num">' + money(r.principal) + '</td>' +
                        '<td class="num">' + money(r.interest) + '</td>' +
                        '<td class="num">' + money(r.fee) + '</td>' +
                        '<td class="num" style="font-weight:600;">' + money(r.total) + '</td>' +
                        '<td>' + escape(r.mode) + '</td>' +
                        '<td class="num">' + (r.balanceAfter !== null && r.balanceAfter !== undefined ? money(r.balanceAfter) : '\u2014') + '</td>' +
                    '</tr>';
                }).join('') +
                '</tbody></table></div>'
            : '<div class="la-empty">No repayments recorded against this loan yet.</div>';

        var documents = (acc.documents || []).length
            ? '<div class="la-doc-list">' + acc.documents.map(function (d) {
                return '<div class="la-doc"><span>' +
                    '<span class="la-doc-title">' + escape(d.title || d.fileName || d.type || 'Document') + '</span>' +
                    '<span style="color:var(--color-text-muted);"> \u00B7 ' + escape(d.type || '') + '</span></span>' +
                    '<span style="color:var(--color-text-muted);">' + date(d.createdAt) + '</span></div>';
            }).join('') + '</div>'
            : '<div class="la-empty">No documents attached to this loan or borrower.</div>';

        var audit = (acc.audit || []).length
            ? '<div style="overflow-x:auto;"><table class="la-table"><thead><tr><th>Action</th><th>Setting</th><th>By</th><th>Date</th></tr></thead><tbody>' +
                acc.audit.map(function (a) {
                    return '<tr><td>' + escape(a.action) + '</td><td>' + escape(a.setting) + '</td>' +
                        '<td style="font-family:monospace;">' + escape(a.userId || '\u2014') + '</td>' +
                        '<td>' + date(a.createdAt) + '</td></tr>';
                }).join('') + '</tbody></table></div>'
            : '<div class="la-empty">No audit entries reference this loan in the recent log.</div>';

        var titleEl = el(MODAL_ID + 'Title');
        if (titleEl) titleEl.textContent = 'Loan Account \u00B7 ' + acc.loanNumber;

        body.innerHTML =
            headline +
            section('Loan Identity', identity) +
            section('Financial Summary', finance) +
            section('Timeline & Onboarding', timeline) +
            section('Interest Terms', interest) +
            section('Approval', approval) +
            section('KYC', kycBlock) +
            section('Status Timeline', '<div class="la-timeline">' + steps + '</div>') +
            section('Repayment History', repayments) +
            section('Documents', documents) +
            section('Audit Trail', audit);
    }

    // Exposed for inline onclick handlers and page scripts.
    window.openLoanDetails = openLoanDetails;
    window.closeLoanDetails = closeLoanDetails;
    window.renderLoanDetails = renderLoanDetails;
})();
