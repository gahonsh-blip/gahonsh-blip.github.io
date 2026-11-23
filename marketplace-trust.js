/* GAHONSH marketplace trust layer: star ratings, reviews and contract messaging.
   Loaded on find-talent.html, marketplace-dashboard.html and messages.html.
   Uses the existing Supabase client from supabase-client.js (window.GahonshDB). */
(function () {
  'use strict';
  var cache = null;

  function client() {
    return (window.GahonshDB && window.GahonshDB.getClient) ? window.GahonshDB.getClient() : Promise.resolve(null);
  }

  function starText(avg, count) {
    if (!count) return 'New';
    var full = Math.round(avg);
    return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full) + ' ' + avg.toFixed(1) + ' (' + count + ')';
  }

  async function loadRatings() {
    if (cache) return cache;
    var c = await client();
    cache = {};
    if (!c) return cache;
    var res = await c.from('worker_ratings').select('reviewee_id,avg_rating,review_count');
    if (!res.error && res.data) {
      res.data.forEach(function (r) { cache[r.reviewee_id] = r; });
    }
    return cache;
  }

  var painting = false;

  async function paintRatings() {
    if (window.__GAHONSH_STUDIO_PREVIEW__) return;
    // Only the dedicated placeholder is painted. The same data-rating-uid
    // attribute also sits on the parent card for styling, so selecting every
    // match would overwrite the whole card with the star text.
    var nodes = document.querySelectorAll('.mt-rating[data-rating-uid]');
    if (!nodes.length || painting) return;
    painting = true;
    try {
      var map = await loadRatings();
      nodes.forEach(function (el) {
        var uid = el.getAttribute('data-rating-uid');
        var r = map[uid];
        var text = r ? starText(Number(r.avg_rating), Number(r.review_count)) : 'New';
        var title = r ? (r.review_count + ' reviews') : 'No reviews yet';
        // Write only when the value actually changes. Assigning textContent
        // always replaces the text node, which the MutationObserver below
        // would read as a new change and re-enter this function forever.
        if (el.textContent !== text) el.textContent = text;
        if (el.title !== title) el.title = title;
        if (!el.hasAttribute('data-mt-styled')) {
          el.style.cssText = 'display:inline-block;font-size:0.78rem;letter-spacing:0.02em;color:#C9922E;margin-top:2px;';
          el.setAttribute('data-mt-styled', '');
        }
      });
    } finally {
      painting = false;
    }
  }

  function modal(html) {
    var m = document.createElement('div');
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';
    m.innerHTML = html;
    m.addEventListener('click', function (e) { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
    return m;
  }

  async function openReview(contractId, revieweeId, jobId) {
    var c = await client();
    if (!c) return;
    var sess = await c.auth.getUser();
    var uid = sess && sess.data && sess.data.user && sess.data.user.id;
    if (!uid) { alert('Please sign in to leave a review.'); return; }
    var m = modal(
      '<div style="background:#12181f;border:1px solid #26333f;border-radius:14px;max-width:420px;width:100%;padding:20px;color:#e6edf3;font-family:inherit;">' +
      '<h3 style="margin:0 0 4px;font-size:1.05rem;">Leave a review</h3>' +
      '<p style="margin:0 0 12px;font-size:0.85rem;opacity:0.75;">How did this engagement go?</p>' +
      '<div id="mt-stars" style="font-size:1.6rem;letter-spacing:0.15em;cursor:pointer;color:#C9922E;margin-bottom:12px;">☆☆☆☆☆</div>' +
      '<textarea id="mt-comment" rows="3" placeholder="What went well? (optional)" style="width:100%;background:#0b1117;color:#e6edf3;border:1px solid #26333f;border-radius:8px;padding:10px;font-family:inherit;"></textarea>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
      '<button id="mt-cancel" style="background:transparent;color:#9fb0bf;border:1px solid #26333f;border-radius:8px;padding:8px 14px;cursor:pointer;">Cancel</button>' +
      '<button id="mt-save" style="background:#12776A;color:#fff;border:0;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:700;">Submit</button>' +
      '</div></div>'
    );
    var rating = 0;
    var stars = m.querySelector('#mt-stars');
    stars.addEventListener('click', function (e) {
      var rect = stars.getBoundingClientRect();
      var idx = Math.ceil((e.clientX - rect.left) / (rect.width / 5));
      rating = Math.min(5, Math.max(1, idx));
      stars.textContent = '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
    });
    m.querySelector('#mt-cancel').onclick = function () { m.remove(); };
    m.querySelector('#mt-save').onclick = async function () {
      if (!rating) { alert('Please pick a star rating.'); return; }
      var body = {
        contract_id: contractId || null,
        job_id: jobId || null,
        reviewer_id: uid,
        reviewee_id: revieweeId,
        rating: rating,
        comment: (m.querySelector('#mt-comment').value || '').trim() || null
      };
      var res = await c.from('reviews').insert(body);
      if (res.error) { alert('Could not save the review: ' + res.error.message); return; }
      alert('Thank you, your review is live.');
      m.remove();
      cache = null;
      paintRatings();
    };
  }

  function decorateContracts() {
    document.querySelectorAll('[data-contract-id]').forEach(function (card) {
      if (card.querySelector('.mt-actions')) return;
      var cid = card.getAttribute('data-contract-id');
      var other = card.getAttribute('data-other-id') || '';
      var jobId = card.getAttribute('data-job-id-raw') || '';
      var bar = document.createElement('div');
      bar.className = 'mt-actions';
      bar.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;';
      bar.innerHTML =
        '<a href="messages.html?contract=' + encodeURIComponent(cid) + '" style="border:1px solid #26333f;border-radius:8px;padding:8px 14px;text-decoration:none;color:#7fd1c4;font-size:0.9rem;">Message</a>' +
        '<button type="button" class="mt-review" style="background:#12776A;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:0.9rem;font-weight:600;">Leave a review</button>';
      bar.querySelector('.mt-review').onclick = function () { openReview(cid, other, jobId); };
      card.appendChild(bar);
    });
  }

  function boot() {
    if (window.__GAHONSH_STUDIO_PREVIEW__) return;
    paintRatings();
    decorateContracts();
    var target = document.querySelector('#tabListingsContainer') || document.body;
    if (window.MutationObserver && target) {
      new MutationObserver(function () {
        paintRatings();
        decorateContracts();
      }).observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.GahonshTrust = { paintRatings: paintRatings, openReview: openReview };
})();
