/* public/app.js - TRADE DESK client portal (ready for Vercel serverless backend)
 *
 * Edit these three values before deploying:
 *  - PROXY_URL (usually /api/proxy)
 *  - PROXY_API_KEY
 *  - APPS_SCRIPT_EXEC_URL (your Apps Script /exec URL)
 *  - GOOGLE_CLIENT_ID
 */

const PROXY_URL = '/api/proxy';
const PROXY_API_KEY = 'REPLACE_WITH_YOUR_PROXY_API_KEY';
const APPS_SCRIPT_EXEC_URL = https://script.google.com/macros/s/AKfycbwfs9DgMak8AdGGQC-JWy2Px591owTybI-QcaMeYz19fOc5wt2EgSIiL1VkO8xaBOpOIQ/exec;
const GOOGLE_CLIENT_ID = 'REPLACE_WITH_GOOGLE_CLIENT_ID';

// DOM refs
const btnSendCode = document.getElementById('btnSendCode');
const btnUseSaved = document.getElementById('btnUseSaved');
const otpArea = document.getElementById('otpArea');
const btnVerify = document.getElementById('btnVerify');
const btnResend = document.getElementById('btnResend');
const otpMsg = document.getElementById('otpMsg');
const emailInput = document.getElementById('email');
const jobsList = document.getElementById('jobsList');
const jobsContainer = document.getElementById('jobsContainer');
const filtersPanel = document.getElementById('filtersPanel');
const statusFilter = document.getElementById('statusFilter');
const searchBox = document.getElementById('searchBox');
const btnApplyFilters = document.getElementById('btnApplyFilters');
const btnClearFilters = document.getElementById('btnClearFilters');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const modalContent = document.getElementById('modalContent');
const userArea = document.getElementById('userArea');

let jobsCache = [];
let currentEmail = '';
let sessionExpiryTimer = null;

/* ---------- Utility: postJson to proxy ---------- */
async function postJson(payload) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': PROXY_API_KEY },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Network error: ' + res.status);
  return res.json();
}

/* ---------- JSONP fallback if needed ---------- */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    window[cb] = (data) => { resolve(data); try { delete window[cb]; } catch(e){ window[cb]=null; } script.remove(); };
    const script = document.createElement('script');
    script.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'callback=' + cb;
    script.onerror = () => { try { delete window[cb]; } catch(e){} script.remove(); reject(new Error('Network or JSONP load error')); };
    document.body.appendChild(script);
  });
}

/* ---------- Init: restore session if any ---------- */
(function init() {
  const savedEmail = localStorage.getItem('mtd_email');
  const savedToken = localStorage.getItem('mtd_token');
  if (savedToken && savedEmail) {
    showLoggedInUI(savedEmail);
    fetchJobs(savedEmail);
    startSessionTimer();
  } else {
    const pending = localStorage.getItem('mtd_email_pending') || localStorage.getItem('mtd_email');
    if (pending) emailInput.value = pending;
  }
  initGoogleSignIn();
})();

/* ---------- Auth: OTP ---------- */
btnSendCode.addEventListener('click', async () => {
  const email = (emailInput.value || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Please enter a valid email'); return; }
  otpMsg.textContent = 'Sending code…';
  try {
    // prefer proxy POST
    const r = await postJson({ action:'sendOtp', email: email });
    if (!r || !r.ok) { otpMsg.textContent = 'Error: ' + (r && r.error || 'Unknown'); return; }
    otpMsg.textContent = 'Code sent — check your email.';
    otpArea.style.display = 'block';
    localStorage.setItem('mtd_email_pending', email);
  } catch (err) { otpMsg.textContent = 'Network error: ' + err; }
});

btnResend.addEventListener('click', () => {
  const email = localStorage.getItem('mtd_email_pending') || emailInput.value;
  if (!email) { alert('Enter email first'); return; }
  emailInput.value = email;
  btnSendCode.click();
});

btnVerify.addEventListener('click', async () => {
  const email = (localStorage.getItem('mtd_email_pending') || emailInput.value).trim().toLowerCase();
  const otp = (document.getElementById('otpInput').value || '').trim();
  if (!email || !otp) { otpMsg.textContent = 'Enter email and code.'; return; }
  otpMsg.textContent = 'Verifying…';
  try {
    const r = await postJson({ action:'verifyOtp', email: email, otp: otp });
    if (!r || !r.ok) { otpMsg.textContent = 'Error: ' + (r && r.error || 'Invalid'); return; }
    localStorage.setItem('mtd_token', r.token);
    localStorage.setItem('mtd_token_ts', Math.floor(Date.now()/1000));
    localStorage.setItem('mtd_token_ttl', String(r.expires_in || 21600));
    localStorage.setItem('mtd_email', email);
    localStorage.removeItem('mtd_email_pending');
    otpMsg.textContent = 'Signed in.';
    otpArea.style.display = 'none';
    showLoggedInUI(email);
    fetchJobs(email);
    startSessionTimer();
  } catch (err) { otpMsg.textContent = 'Network error: ' + err; }
});

btnUseSaved.addEventListener('click', () => {
  const token = localStorage.getItem('mtd_token');
  const email = localStorage.getItem('mtd_email');
  if (!token || !email) { alert('No saved session. Please sign in.'); return; }
  showLoggedInUI(email);
  fetchJobs(email);
  startSessionTimer();
});

/* ---------- Google Sign-In ---------- */
function initGoogleSignIn() {
  if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.indexOf('REPLACE') === 0) return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse
  });
  google.accounts.id.renderButton(
    document.getElementById('gsiButton'),
    { theme: 'outline', size: 'large' }
  );
}
async function handleCredentialResponse(response) {
  try {
    const res = await postJson({ action: 'googleSignIn', idToken: response.credential });
    if (!res || !res.ok) { alert('Google sign-in failed: ' + (res && res.error || 'Unknown')); return; }
    localStorage.setItem('mtd_token', res.token);
    localStorage.setItem('mtd_token_ts', Math.floor(Date.now()/1000));
    localStorage.setItem('mtd_token_ttl', String(res.expires_in || 21600));
    localStorage.setItem('mtd_email', res.email);
    showLoggedInUI(res.email);
    fetchJobs(res.email);
    startSessionTimer();
  } catch (err) { alert('Network error during Google sign-in: ' + err); }
}

/* ---------- Session UI ---------- */
function showLoggedInUI(email) {
  currentEmail = email;
  userArea.innerHTML = `<div>Signed in as <strong>${escapeHtml(email)}</strong> • <a href="#" id="signOut">Sign out</a></div>`;
  document.getElementById('signOut').addEventListener('click', (ev) => { ev.preventDefault(); doSignOut(); });
  filtersPanel.style.display = 'block';
  jobsList.innerHTML = '<p>Loading your requests…</p>';
}
function doSignOut() {
  localStorage.removeItem('mtd_token'); localStorage.removeItem('mtd_email'); localStorage.removeItem('mtd_token_ts'); localStorage.removeItem('mtd_token_ttl');
  currentEmail = ''; userArea.innerHTML = ''; filtersPanel.style.display = 'none'; jobsList.innerHTML = 'Please sign in to view your requests.'; stopSessionTimer();
}
function getTokenExpirySeconds() {
  const storedTS = Number(localStorage.getItem('mtd_token_ts') || 0); const ttl = Number(localStorage.getItem('mtd_token_ttl') || 21600);
  return (storedTS && (storedTS + ttl - Math.floor(Date.now()/1000))) || 0;
}
function startSessionTimer(){ if(!localStorage.getItem('mtd_token_ts')) localStorage.setItem('mtd_token_ts', Math.floor(Date.now()/1000)); if(!localStorage.getItem('mtd_token_ttl')) localStorage.setItem('mtd_token_ttl', String(6*60*60)); updateSessionInfo(); if(sessionExpiryTimer) clearInterval(sessionExpiryTimer); sessionExpiryTimer=setInterval(updateSessionInfo,1000); }
function stopSessionTimer(){ if(sessionExpiryTimer) clearInterval(sessionExpiryTimer); sessionExpiryTimer=null; const el=document.getElementById('sessionInfo'); if(el) el.textContent=''; }
function updateSessionInfo(){ const el=document.getElementById('sessionInfo'); const secs=getTokenExpirySeconds(); if(!el) return; if(secs<=0){ el.textContent='Session expired'; doSignOut(); return; } const h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60; el.textContent=`expires in ${h}h ${m}m ${s}s`; }

/* ---------- Jobs: fetch & render ---------- */
async function fetchJobs(email) {
  try {
    const token = localStorage.getItem('mtd_token') || '';
    const payload = { action: 'getJobs' };
    if (token) payload.token = token; else payload.email = email;
    const res = await postJson(payload);
    if (!res || !res.ok) { jobsList.innerHTML = '<div class="hint">Error loading jobs: ' + escapeHtml(res && res.error || 'Unknown') + '</div>'; jobsCache = []; return; }
    jobsCache = res.jobs || [];
    renderJobs(jobsCache);
  } catch (err) {
    jobsList.innerHTML = '<div class="hint">Network error: ' + escapeHtml(String(err)) + '</div>'; jobsCache = [];
  }
}
function renderJobs(list) {
  if (!list.length) { jobsList.innerHTML = `<div class="hint">No requests found for <strong>${escapeHtml(currentEmail)}</strong>.</div>`; return; }
  const rows = list.map(job => {
    const statusLower = (job.Ops_Status || '').toLowerCase();
    const badgeClass = statusLower.includes('delivered') ? 'delivered' : statusLower.includes('closed') ? 'closed' : 'new';
    const resultLink = job.Result_PDF_URL ? `<a class="linky" href="#" data-id="${escapeHtml(job.Request_ID)}" onclick="return false;">Open result</a>` : 'Result not ready';
    return `<div class="job-card">
      <h3>${escapeHtml(job.Request_ID)} <span class="job-meta">— ${escapeHtml(job.Service || '')}</span></h3>
      <div class="job-meta">Status: <span class="badge ${badgeClass}">${escapeHtml(job.Ops_Status || '')}</span></div>
      <div class="job-meta">Invoice: ${escapeHtml(job.Invoice_Number || '—')}</div>
      <div class="job-actions">
        <button data-id="${escapeHtml(job.Request_ID)}" class="btnView">View details</button>
        ${resultLink}
      </div>
    </div>`;
  }).join('');
  jobsList.innerHTML = `<div class="jobs-grid">${rows}</div>`;
  Array.from(document.querySelectorAll('.btnView')).forEach(btn => btn.addEventListener('click', (ev) => openJobModal(ev.target.getAttribute('data-id'))));
  Array.from(document.querySelectorAll('.linky')).forEach(a => a.addEventListener('click', (ev) => openResultFromList(ev)));
}
btnApplyFilters.addEventListener('click', () => {
  const q = (searchBox.value || '').trim().toLowerCase();
  const status = (statusFilter.value || '').trim();
  const filtered = jobsCache.filter(j => {
    const matchesQ = !q || (j.Request_ID || '').toLowerCase().includes(q) || (j.Service || '').toLowerCase().includes(q);
    const matchesStatus = !status || (j.Ops_Status || '') === status;
    return matchesQ && matchesStatus;
  });
  renderJobs(filtered);
});
btnClearFilters.addEventListener('click', () => { searchBox.value=''; statusFilter.value=''; renderJobs(jobsCache); });

/* ---------- Modal + Job detail + Payment ---------- */
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

async function openJobModal(requestId) {
  modalContent.innerHTML = '<p>Loading …</p>';
  modalOverlay.classList.remove('hidden');
  modalOverlay.setAttribute('aria-hidden', 'false');
  try {
    // prefer postJson
    let jobRes, logsRes;
    try {
      const token = localStorage.getItem('mtd_token');
      const payloadJob = { action:'getJob', requestId };
      const payloadLogs = { action:'getJobLogs', requestId, limit:50 };
      if (token) { payloadJob.token = token; payloadLogs.token = token; } else { payloadJob.email = localStorage.getItem('mtd_email'); payloadLogs.email = localStorage.getItem('mtd_email'); }
      [jobRes, logsRes] = await Promise.all([ postJson(payloadJob), postJson(payloadLogs) ]);
    } catch (err) {
      // fallback to JSONP
      jobRes = await jsonp(APPS_SCRIPT_EXEC_URL + '?action=getJob&requestId=' + encodeURIComponent(requestId));
      logsRes = await jsonp(APPS_SCRIPT_EXEC_URL + '?action=getJobLogs&requestId=' + encodeURIComponent(requestId) + '&limit=50');
    }

    if (!jobRes || !jobRes.ok) { modalContent.innerHTML = '<div class="hint">Error: ' + escapeHtml(jobRes && jobRes.error || 'Request not found') + '</div>'; return; }

    const job = jobRes.job || {};
    const logs = (logsRes && logsRes.ok) ? (logsRes.logs || []) : [];

    const invoiceNumber = job.Invoice_Number || '';
    const balanceRaw = job.Balance_Due || job.Total_Client_Charge || job.Quote_Amount || 0;
    const balance = (typeof balanceRaw === 'number') ? balanceRaw : (parseFloat(String(balanceRaw).replace(/[^0-9.-]+/g,''))||0);
    const pdfButton = job.Result_PDF_URL ? `<button id="btnDownloadPdf" data-id="${escapeHtml(requestId)}">Download result PDF</button>` : 'Result not ready';
    const invoiceStatus = job.Invoice_Status || '';
    const paymentStatus = job.Payment_Status || '';

    const detailsHtml = `
      <h2>${escapeHtml(job.Request_ID || 'Request')}</h2>
      <div><strong>Service:</strong> ${escapeHtml(job.Service || '')}</div>
      <div><strong>Client:</strong> ${escapeHtml(job.Client_Name || '')} ${job.Company ? ' • '+escapeHtml(job.Company):''}</div>
      <div><strong>Contact:</strong> ${escapeHtml(job.Email || '')} ${job.Phone ? ' • '+escapeHtml(job.Phone):''}</div>
      <div style="margin-top:8px"><strong>Product:</strong> ${escapeHtml(job.Product_Description || '')}</div>
      <div style="margin-top:8px"><strong>HS Code:</strong> ${escapeHtml(job.Known_HS_Code || '')}</div>

      <hr/>
      <div><strong>Ops status:</strong> ${escapeHtml(job.Ops_Status || '')}</div>
      <div><strong>Invoice:</strong> ${escapeHtml(invoiceNumber || '—')} (${escapeHtml(invoiceStatus || '—')})</div>
      <div><strong>Payment status:</strong> ${escapeHtml(paymentStatus || '—')}</div>
      <div style="margin-top:8px">${pdfButton}</div>

      <hr/>
      <h3>Invoice & payment</h3>
      <div><strong>Balance due:</strong> ${escapeHtml(String(balance))}</div>

      <div id="mpesaPayBlock" style="margin-top:12px;border-top:1px solid #eee;padding-top:12px;">
        <div id="mpesaStatus" style="margin-bottom:8px;color:#333;">${invoiceNumber ? ('Invoice: ' + escapeHtml(invoiceNumber) + ' • Amount: ' + escapeHtml(String(balance))) : 'No invoice available'}</div>
        <label for="mpesaPhone">Phone (M-PESA):</label>
        <input id="mpesaPhone" type="text" placeholder="e.g. 0710xxxxxx" style="width:100%;padding:8px;margin-top:6px;border-radius:4px;border:1px solid #ddd" />
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button id="btnPayMpesa" class="btn"${(!invoiceNumber || String(paymentStatus || '').toLowerCase()==='paid') ? ' disabled' : ''}>Pay with M-PESA</button>
        </div>
        <div style="margin-top:8px;color:#666;font-size:12px;">Payments are processed securely via M-PESA.</div>
      </div>

      <hr/>
      <h3>Notes</h3>
      <div>${escapeHtml(job.Notes || '').replace(/\n/g,'<br/>')}</div>

      <h3 style="margin-top:12px">Status log</h3>
      <div class="log-list">${logs.length ? logs.map(l => {
        const t = l.Timestamp ? formatDate(l.Timestamp) : '';
        return `<div class="log-item"><div><strong>${escapeHtml(l.Event || '')}</strong> ${l.New_Status ? '→ ' + escapeHtml(l.New_Status) : ''}</div><time>${escapeHtml(String(t))} • ${escapeHtml(l.Updated_By || '')}</time><div style="margin-top:6px">${escapeHtml(l.Notes || '')}</div></div>`;
      }).join('') : '<div class="hint">No logs yet.</div>'}</div>

      <div style="margin-top:12px;display:flex;gap:8px"><button id="btnCloseModal" class="muted">Close</button></div>
    `;
    modalContent.innerHTML = detailsHtml;

    // wire close/download
    const closeBtn = document.getElementById('btnCloseModal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    const dl = document.getElementById('btnDownloadPdf');
    if (dl) dl.addEventListener('click', async (ev)=> { await downloadResultPdf(ev.target.getAttribute('data-id')); });

    // payment UI wiring
    const mpesaStatusEl = document.getElementById('mpesaStatus');
    const mpesaPhoneEl = document.getElementById('mpesaPhone');
    const btnPay = document.getElementById('btnPayMpesa');
    if (job.Phone) mpesaPhoneEl.value = job.Phone;
    const savedPhone = localStorage.getItem('mtd_phone') || '';
    if (!mpesaPhoneEl.value && savedPhone) mpesaPhoneEl.value = savedPhone;

    if (!invoiceNumber) {
      mpesaStatusEl.textContent = 'No invoice to pay for this job.';
      btnPay.disabled = true;
    } else if (String(paymentStatus||'').toLowerCase() === 'paid') {
      mpesaStatusEl.textContent = 'Invoice already paid.';
      btnPay.disabled = true;
    } else {
      btnPay.disabled = false;
      btnPay.onclick = async function() {
        const phoneRaw = (mpesaPhoneEl.value || '').trim();
        if (!phoneRaw) { alert('Please enter your M-PESA phone number'); return; }
        localStorage.setItem('mtd_phone', phoneRaw);
        mpesaStatusEl.textContent = 'Initiating payment...';
        try {
          const ok = await initiateMpesaPayment(invoiceNumber, balance, phoneRaw);
          if (ok) mpesaStatusEl.textContent = 'Payment confirmed. Thank you.';
          else mpesaStatusEl.textContent = 'Payment not confirmed yet. Check again shortly.';
        } catch(e) {
          console.error(e);
          mpesaStatusEl.textContent = 'Error: ' + String(e);
        }
      };
    }

  } catch (err) {
    modalContent.innerHTML = '<div class="hint">Network or server error: ' + escapeHtml(String(err)) + '</div>';
  }
}

function closeModal() { modalOverlay.classList.add('hidden'); modalOverlay.setAttribute('aria-hidden','true'); modalContent.innerHTML=''; }

async function initiateMpesaPayment(invoiceNumber, amount, phone) {
  try {
    let phoneClean = phone.replace(/\D/g,'');
    if (phoneClean.length === 10 && phoneClean.startsWith('0')) phoneClean = '254' + phoneClean.substring(1);
    const res = await fetch('/api/mpesa_stkpush', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'X-API-KEY': PROXY_API_KEY },
      body: JSON.stringify({ phone: phoneClean, amount: amount, invoice: invoiceNumber })
    });
    const data = await res.json();
    const code = (data.ResponseCode!==undefined)?data.ResponseCode:(data.responseCode!==undefined?data.responseCode:null);
    if (code === '0' || code === 0) {
      alert('STK Push sent — please authorize payment on your phone.');
      await pollPaymentStatus(invoiceNumber, 180);
      return true;
    } else {
      alert('STK push response: ' + JSON.stringify(data));
      return false;
    }
  } catch (err) {
    alert('Error initiating payment: ' + err);
    return false;
  }
}

async function pollPaymentStatus(invoiceNumber, seconds) {
  const intervalMs = 5000; const tries = Math.ceil(seconds*1000/intervalMs);
  for (let i=0;i<tries;i++) {
    await new Promise(r=>setTimeout(r, intervalMs));
    try {
      const token = localStorage.getItem('mtd_token') || '';
      const payload = { action:'getJobs' };
      if (token) payload.token = token; else payload.email = localStorage.getItem('mtd_email');
      const r = await postJson(payload);
      if (r && r.ok) {
        const found = (r.jobs||[]).find(j=>j.Invoice_Number===invoiceNumber);
        if (found && String(found.Payment_Status||'').toLowerCase()==='paid') {
          fetchJobs(localStorage.getItem('mtd_email'));
          return true;
        }
      }
    } catch(e) {}
  }
  return false;
}

/* ---------- Utilities ---------- */
function formatDate(d) { if(!d) return ''; const dd=new Date(d); if(isNaN(dd.getTime())) return d; return dd.toLocaleString(); }
function escapeHtml(s){ if(!s && s!==0) return ''; return String(s).replace(/[&<>"'`]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',"`":'&#96;'})[m]); }
