/* ===================== State & helpers ===================== */
let CURRENT_USER = null;
let CURRENT_PAGE = 'dashboard';

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function toast(message, type = 'success') {
  const box = document.createElement('div');
  box.className = `alert alert-${type === 'error' ? 'danger' : 'success'} toast-alert`;
  box.textContent = message;
  document.body.appendChild(box);
  setTimeout(() => box.classList.add('show'), 10);
  setTimeout(() => { box.classList.remove('show'); setTimeout(() => box.remove(), 300); }, 3000);
}

function money(n) { return '₹' + Number(n).toFixed(2); }

function statusBadge(status) {
  const cls = status === 'Active' ? 'badge-active' : (status === 'Expired' ? 'badge-expired' : 'badge-cancelled');
  return `<span class="badge ${cls}">${status}</span>`;
}

function exportCSV(filename, columns, rows) {
  const header = columns.map(c => c.title).join(',');
  const lines = rows.map(r => columns.map(c => {
    const v = (r[c.key] === undefined || r[c.key] === null) ? '' : String(r[c.key]).replace(/"/g, '""');
    return `"${v}"`;
  }).join(','));
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function tableHtml(columns, rows, emptyMsg) {
  if (!rows || rows.length === 0) {
    return `<div class="empty-state"><i class="fas fa-box-open"></i>${emptyMsg || 'No records yet'}</div>`;
  }
  const thead = columns.map(c => `<th>${c.title}</th>`).join('');
  const tbody = rows.map(r => `<tr>${columns.map(c => `<td>${c.render ? c.render(r) : (r[c.key] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<div style="overflow-x:auto"><table class="simple-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

/* ===================== Generic modal ===================== */
let modalInstance;
function openModal(title, bodyHtml, onConfirm) {
  document.getElementById('genericModalTitle').textContent = title;
  document.getElementById('genericModalBody').innerHTML = bodyHtml;
  const confirmBtn = document.getElementById('genericModalConfirm');
  const newBtn = confirmBtn.cloneNode(true); // strip old listeners
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
  newBtn.addEventListener('click', async () => {
    try {
      await onConfirm();
      modalInstance.hide();
    } catch (e) { toast(e.message, 'error'); }
  });
  modalInstance = bootstrap.Modal.getOrCreateInstance(document.getElementById('genericModal'));
  modalInstance.show();
}
function val(id) { return document.getElementById(id).value; }

/* ===================== Auth ===================== */
function showAlert(msg, type = 'danger') {
  const box = document.getElementById('alertBox');
  box.textContent = msg; box.className = `alert alert-${type}`;
}
function hideAlert() { document.getElementById('alertBox').classList.add('d-none'); }

document.getElementById('authTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  document.querySelectorAll('#authTabs .nav-link').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('signinForm').classList.toggle('d-none', btn.dataset.tab !== 'signin');
  document.getElementById('signupForm').classList.toggle('d-none', btn.dataset.tab !== 'signup');
  hideAlert();
});

document.getElementById('forgotLink').addEventListener('click', () => {
  showAlert('Password reset by email isn\'t wired up in this local demo. Ask your gym admin to check the data file, or create a new account.', 'info');
});

document.getElementById('signinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();
  const form = new FormData(e.target);
  try {
    const user = await api('/login', 'POST', { username: form.get('username'), password: form.get('password') });
    CURRENT_USER = user;
    showApp();
  } catch (err) { showAlert(err.message); }
});

document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();
  const form = new FormData(e.target);
  try {
    await api('/signup', 'POST', { username: form.get('username'), email: form.get('email'), password: form.get('password') });
    showAlert('Account created — sign in now.', 'success');
    document.querySelector('#authTabs button[data-tab="signin"]').click();
  } catch (err) { showAlert(err.message); }
});

/* ===================== App shell ===================== */
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
  { key: 'members', label: 'Members', icon: 'fa-users' },
  { key: 'plans', label: 'Plans', icon: 'fa-clipboard-list' },
  { key: 'subscriptions', label: 'Subscriptions', icon: 'fa-id-card' },
  { key: 'payments', label: 'Payments', icon: 'fa-money-bill-wave' },
  { key: 'checkin', label: 'Check-In', icon: 'fa-door-open' },
  { key: 'logs', label: 'Audit Log', icon: 'fa-scroll' }
];

function showApp() {
  document.getElementById('authScreen').classList.add('d-none');
  document.getElementById('appShell').classList.remove('d-none');
  document.getElementById('welcomeText').textContent = `Welcome, ${CURRENT_USER.username} (${CURRENT_USER.role})`;
  document.getElementById('avatarCircle').textContent = CURRENT_USER.username.slice(0, 2).toUpperCase();
  buildSidebar();
  const firstAllowed = NAV_ITEMS.find(n => CURRENT_USER.permissions[n.key] && CURRENT_USER.permissions[n.key].view);
  navigateTo(firstAllowed ? firstAllowed.key : 'checkin');
}

function buildSidebar() {
  const menu = document.getElementById('sideMenu');
  menu.innerHTML = NAV_ITEMS.filter(n => CURRENT_USER.permissions[n.key] && CURRENT_USER.permissions[n.key].view)
    .map(n => `<li><a data-page="${n.key}"><i class="fas ${n.icon}"></i><span class="menu-label">${n.label}</span></a></li>`)
    .join('');
  menu.querySelectorAll('a[data-page]').forEach(a => a.addEventListener('click', () => navigateTo(a.dataset.page)));
}

function navigateTo(page) {
  CURRENT_PAGE = page;
  document.querySelectorAll('#sideMenu a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  const item = NAV_ITEMS.find(n => n.key === page);
  document.getElementById('crumbText').textContent = 'Home / ' + item.label;
  document.getElementById('pageTitle').innerHTML = `<i class="fas ${item.icon}"></i> ${item.label}`;
  const renderers = {
    dashboard: renderDashboard, members: renderMembers, plans: renderPlans,
    subscriptions: renderSubscriptions, payments: renderPayments, checkin: renderCheckin, logs: renderLogs
  };
  renderers[page]();
}

document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
  localStorage.setItem('gym_sidebar_collapsed', document.getElementById('sidebar').classList.contains('collapsed') ? '1' : '0');
});
document.getElementById('darkToggle').addEventListener('click', () => {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  localStorage.setItem('gym_theme', dark ? 'light' : 'dark');
});
document.getElementById('avatarCircle').addEventListener('click', async () => {
  if (confirm('Sign out?')) { await api('/logout', 'POST'); location.reload(); }
});

/* ===================== Dashboard ===================== */
let dashChart;
async function renderDashboard() {
  const c = document.getElementById('pageContent');
  c.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i>Loading...</div>';
  const stats = await api('/dashboard');
  const cards = [
    { icon: 'fa-users', label: 'Active Members', val: stats.totalMembers, color: '#0074D9' },
    { icon: 'fa-id-card', label: 'Active Subscriptions', val: stats.activeSubscriptions, color: '#2ecc71' },
    { icon: 'fa-door-open', label: 'In Gym Now', val: stats.inGymNow, color: '#f0ad4e' },
    { icon: 'fa-calendar-check', label: "Check-ins Today", val: stats.checkInsToday, color: '#5b6fe0' },
    { icon: 'fa-rupee-sign', label: 'Revenue This Month', val: money(stats.revenueThisMonth), color: '#001f3f' },
    { icon: 'fa-hourglass-end', label: 'Expiring in 7 Days', val: stats.expiringSoon, color: '#d9534f' }
  ];
  c.innerHTML = `
    <div class="kpi-row">${cards.map(k => `
      <div class="kpi-card"><div class="icon" style="background:${k.color}"><i class="fas ${k.icon}"></i></div>
      <div><div class="val">${k.val}</div><div class="lbl">${k.label}</div></div></div>`).join('')}
    </div>
    <div class="card-block"><h5><i class="fas fa-chart-line"></i> Footfall — Last 7 Days</h5><canvas id="footfallChart" height="90"></canvas></div>`;
  if (dashChart) dashChart.destroy();
  dashChart = new Chart(document.getElementById('footfallChart'), {
    type: 'line',
    data: { labels: stats.footfallSparkline.map((_, i) => 'D-' + (6 - i)),
      datasets: [{ label: 'Check-ins', data: stats.footfallSparkline, borderColor: '#0074D9', backgroundColor: 'rgba(0,116,217,.15)', fill: true, tension: .35 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

/* ===================== Members ===================== */
async function renderMembers() {
  const c = document.getElementById('pageContent');
  const perms = CURRENT_USER.permissions.members;
  const members = await api('/members');
  const columns = [
    { key: 'memberCode', title: 'Code' }, { key: 'fullName', title: 'Name' },
    { key: 'phone', title: 'Phone' }, { key: 'email', title: 'Email' }, { key: 'joinDate', title: 'Joined' },
    { key: 'status', title: 'Status', render: r => statusBadge(r.status) },
    { key: 'actions', title: 'Actions', render: r => perms.delete && r.status === 'Active'
      ? `<button class="btn btn-sm btn-outline-danger" onclick="deactivateMember(${r.id})"><i class="fas fa-user-slash"></i></button>` : '' }
  ];
  c.innerHTML = `
    <div class="table-toolbar">
      <div></div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-secondary btn-sm" onclick='exportCSV("members.csv", ${JSON.stringify(columns.filter(c=>c.key!=="actions").map(c=>({key:c.key,title:c.title})))}, ${JSON.stringify(members)})'><i class="fas fa-file-csv"></i> CSV</button>
        ${perms.add ? `<button class="btn btn-primary btn-sm" id="addMemberBtn"><i class="fas fa-user-plus"></i> Add Member</button>` : ''}
      </div>
    </div>
    <div class="card-block">${tableHtml(columns, members)}</div>`;
  if (perms.add) document.getElementById('addMemberBtn').addEventListener('click', openAddMemberModal);
}

function openAddMemberModal() {
  openModal('Add Member', `
    <div class="mb-2"><label class="form-label">Full Name</label><input id="m_name" class="form-control"></div>
    <div class="mb-2"><label class="form-label">Phone</label><input id="m_phone" class="form-control"></div>
    <div class="mb-2"><label class="form-label">Email</label><input id="m_email" class="form-control"></div>
    <div class="mb-2"><label class="form-label">Address</label><input id="m_address" class="form-control"></div>
  `, async () => {
    const r = await api('/members', 'POST', { fullName: val('m_name'), phone: val('m_phone'), email: val('m_email'), address: val('m_address') });
    toast('Member added: ' + r.memberCode);
    if (r.credentials) alert(`Portal login created —\nUsername: ${r.credentials.username}\nPassword: ${r.credentials.password}`);
    renderMembers();
  });
}
async function deactivateMember(id) {
  if (!confirm('Deactivate this member?')) return;
  try { await api('/members/' + id, 'DELETE'); toast('Member deactivated'); renderMembers(); }
  catch (e) { toast(e.message, 'error'); }
}

/* ===================== Plans ===================== */
async function renderPlans() {
  const c = document.getElementById('pageContent');
  const perms = CURRENT_USER.permissions.plans;
  const plans = await api('/plans');
  const columns = [
    { key: 'planCode', title: 'Code' }, { key: 'name', title: 'Name' },
    { key: 'durationDays', title: 'Days' }, { key: 'price', title: 'Price', render: r => money(r.price) },
    { key: 'status', title: 'Status', render: r => statusBadge(r.status) }
  ];
  c.innerHTML = `
    <div class="table-toolbar"><div></div>
      ${perms.add ? `<button class="btn btn-primary btn-sm" id="addPlanBtn"><i class="fas fa-plus"></i> Add Plan</button>` : ''}
    </div>
    <div class="card-block">${tableHtml(columns, plans)}</div>`;
  if (perms.add) document.getElementById('addPlanBtn').addEventListener('click', openAddPlanModal);
}
function openAddPlanModal() {
  openModal('Add Plan', `
    <div class="mb-2"><label class="form-label">Plan Name</label><input id="p_name" class="form-control"></div>
    <div class="mb-2"><label class="form-label">Description</label><input id="p_desc" class="form-control"></div>
    <div class="mb-2"><label class="form-label">Duration (days)</label><input id="p_days" type="number" class="form-control"></div>
    <div class="mb-2"><label class="form-label">Price</label><input id="p_price" type="number" class="form-control"></div>
  `, async () => {
    await api('/plans', 'POST', { name: val('p_name'), description: val('p_desc'), durationDays: parseInt(val('p_days'), 10), price: parseFloat(val('p_price')) });
    toast('Plan added'); renderPlans();
  });
}

/* ===================== Subscriptions ===================== */
async function renderSubscriptions() {
  const c = document.getElementById('pageContent');
  const perms = CURRENT_USER.permissions.subscriptions;
  const subs = await api('/subscriptions');
  const columns = [
    { key: 'id', title: 'ID' },
    { key: 'member', title: 'Member', render: r => CURRENT_USER.role === 'Member' ? '' : `${r.memberCode} — ${r.memberName}` },
    { key: 'planName', title: 'Plan' }, { key: 'price', title: 'Price', render: r => money(r.price) },
    { key: 'startDate', title: 'Start' }, { key: 'endDate', title: 'End (pay by)' },
    { key: 'outstanding', title: 'Balance Due', render: r => r.outstanding > 0
      ? `<span class="text-danger fw-bold">${money(r.outstanding)}</span>` : `<span class="text-success">Paid up</span>` },
    { key: 'status', title: 'Status', render: r => statusBadge(r.status) },
    { key: 'actions', title: 'Actions', render: r => (perms.edit && r.status === 'Active')
      ? `<button class="btn btn-sm btn-outline-secondary" onclick="cancelSub(${r.id})"><i class="fas fa-ban"></i></button>` : '' }
  ];
  if (CURRENT_USER.role === 'Member') columns.splice(1, 1); // hide the Member column on a member's own view
  c.innerHTML = `
    <div class="table-toolbar"><div></div>
      ${perms.add ? `<button class="btn btn-primary btn-sm" id="sellSubBtn"><i class="fas fa-cash-register"></i> Sell Subscription</button>` : ''}
    </div>
    <div class="card-block">${tableHtml(columns, subs, CURRENT_USER.role === 'Member' ? 'No subscriptions yet' : 'No subscriptions yet')}</div>`;
  if (perms.add) document.getElementById('sellSubBtn').addEventListener('click', openSellSubModal);
}
async function openSellSubModal() {
  const [members, plans] = await Promise.all([api('/members'), api('/plans')]);
  const memberOpts = members.filter(m => m.status === 'Active').map(m => `<option value="${m.id}">${m.memberCode} — ${m.fullName}</option>`).join('');
  const planOpts = plans.filter(p => p.status === 'Active').map(p => `<option value="${p.id}">${p.name} (${p.durationDays}d, ${money(p.price)})</option>`).join('');
  openModal('Sell Subscription', `
    <div class="mb-2"><label class="form-label">Member</label><select id="s_member" class="form-select"><option value="">Select member...</option>${memberOpts}</select></div>
    <div class="mb-2"><label class="form-label">Plan</label><select id="s_plan" class="form-select"><option value="">Select plan...</option>${planOpts}</select></div>
    <div class="mb-2"><label class="form-label">Start Date</label><input id="s_start" type="date" class="form-control" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="mb-2"><label class="form-label">Advance Payment (optional)</label><input id="s_advance" type="number" class="form-control"></div>
  `, async () => {
    if (!val('s_member') || !val('s_plan')) throw new Error('Select a member and a plan.');
    const r = await api('/subscriptions', 'POST', { memberId: val('s_member'), planId: val('s_plan'), startDate: val('s_start'), advance: val('s_advance') ? parseFloat(val('s_advance')) : 0 });
    toast('Subscription sold, ends ' + r.endDate); renderSubscriptions();
  });
}
async function cancelSub(id) {
  if (!confirm('Cancel this subscription?')) return;
  try { await api(`/subscriptions/${id}/cancel`, 'POST'); toast('Cancelled'); renderSubscriptions(); }
  catch (e) { toast(e.message, 'error'); }
}

/* ===================== Payments ===================== */
async function renderPayments() {
  const c = document.getElementById('pageContent');
  const perms = CURRENT_USER.permissions.payments;
  const isStaffView = CURRENT_USER.role !== 'Member';
  const [payments, dues] = await Promise.all([
    api('/payments'),
    isStaffView ? api('/dues') : Promise.resolve([])
  ]);
  const columns = [
    { key: 'invoiceNo', title: 'Invoice' },
    { key: 'member', title: 'Member', render: r => `${r.memberCode} — ${r.memberName}` },
    { key: 'planName', title: 'Plan' },
    { key: 'amount', title: 'Amount', render: r => money(r.amount) },
    { key: 'type', title: 'Type' }, { key: 'method', title: 'Method' },
    { key: 'date', title: 'Date', render: r => new Date(r.date).toLocaleString() }
  ];
  if (!isStaffView) columns.splice(1, 1); // hide Member column on a member's own view

  const duesColumns = [
    { key: 'member', title: 'Member', render: r => `${r.memberCode} — ${r.memberName}` },
    { key: 'planName', title: 'Plan' },
    { key: 'outstanding', title: 'Balance Due', render: r => `<span class="text-danger fw-bold">${money(r.outstanding)}</span>` },
    { key: 'endDate', title: 'Pay By (membership end date)' },
    { key: 'actions', title: '', render: r => perms.add
      ? `<button class="btn btn-sm btn-primary" onclick="openAddPaymentModal(${r.id})"><i class="fas fa-money-bill-wave"></i> Collect</button>` : '' }
  ];

  c.innerHTML = `
    ${isStaffView ? `<div class="card-block"><h5><i class="fas fa-triangle-exclamation text-danger"></i> Outstanding Dues (${dues.length})</h5>
      ${tableHtml(duesColumns, dues, 'Nobody owes anything right now')}</div>` : ''}
    <div class="table-toolbar"><div></div>
      ${perms.add ? `<button class="btn btn-primary btn-sm" id="addPaymentBtn"><i class="fas fa-money-bill-wave"></i> Record Payment</button>` : ''}
    </div>
    <div class="card-block"><h5>Payment History</h5>${tableHtml(columns, payments)}</div>`;
  if (perms.add) document.getElementById('addPaymentBtn').addEventListener('click', () => openAddPaymentModal());
}
async function openAddPaymentModal(preselectSubId) {
  const subs = await api('/subscriptions');
  const active = subs.filter(s => s.status === 'Active');
  const subOpts = active.map(s => {
    const dueLabel = s.outstanding > 0 ? `Due: ${money(s.outstanding)}` : 'Fully paid';
    const selected = preselectSubId && s.id === preselectSubId ? 'selected' : '';
    return `<option value="${s.id}" ${selected}>${s.memberCode} — ${s.memberName} — ${s.planName} (${dueLabel})</option>`;
  }).join('');
  openModal('Record Payment', `
    <div class="mb-2"><label class="form-label">Member / Subscription</label><select id="pay_sub" class="form-select"><option value="">Select subscription...</option>${subOpts}</select></div>
    <div class="mb-2"><label class="form-label">Amount</label><input id="pay_amount" type="number" class="form-control"></div>
    <div class="mb-2"><label class="form-label">Method</label>
      <select id="pay_method" class="form-select"><option>Cash</option><option>Card</option><option>UPI</option><option>Bank Transfer</option></select>
    </div>
  `, async () => {
    if (!val('pay_sub') || !val('pay_amount')) throw new Error('Select a subscription and amount.');
    const r = await api('/payments', 'POST', { subscriptionId: val('pay_sub'), amount: parseFloat(val('pay_amount')), method: val('pay_method'), type: 'Paid' });
    toast('Recorded ' + r.invoiceNo); renderPayments();
  });
}

/* ===================== Check-In ===================== */
async function renderCheckin() {
  const c = document.getElementById('pageContent');
  const perms = CURRENT_USER.permissions.checkin;
  const [active, history] = await Promise.all([api('/checkins/active'), api('/checkins/history')]);
  const historyCols = [
    { key: 'memberCode', title: 'Code' }, { key: 'memberName', title: 'Name' },
    { key: 'checkInTime', title: 'In', render: r => new Date(r.checkInTime).toLocaleString() },
    { key: 'checkOutTime', title: 'Out', render: r => r.checkOutTime ? new Date(r.checkOutTime).toLocaleString() : '—' },
    { key: 'method', title: 'Method' }
  ];
  c.innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <div class="card-block">
          <h5><i class="fas fa-door-open"></i> Check In</h5>
          <label class="form-label">Member code or phone</label>
          <input id="checkinInput" class="form-control mb-2" placeholder="e.g. GM-0001">
          <button class="btn btn-primary w-100" id="checkinBtn"><i class="fas fa-sign-in-alt"></i> Check In</button>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card-block">
          <h5><i class="fas fa-users"></i> In the Gym Right Now (${active.length})</h5>
          <div id="activeVisits">${active.length === 0 ? '<div class="empty-state"><i class="fas fa-wind"></i>Nobody checked in</div>' :
            active.map(v => `<div class="visit-row"><span><b>${v.memberCode}</b> — ${v.memberName}</span>
              <span class="d-flex align-items-center gap-2"><span class="text-muted">${new Date(v.checkInTime).toLocaleTimeString()}</span>
              ${perms.edit ? `<button class="btn btn-sm btn-outline-secondary" onclick="doCheckout(${v.id})"><i class="fas fa-sign-out-alt"></i></button>` : ''}</span></div>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="card-block"><h5><i class="fas fa-scroll"></i> Visit History</h5>${tableHtml(historyCols, history)}</div>`;

  document.getElementById('checkinBtn').addEventListener('click', doCheckin);
  document.getElementById('checkinInput').addEventListener('keydown', e => { if (e.key === 'Enter') doCheckin(); });
}
async function doCheckin() {
  const input = document.getElementById('checkinInput');
  if (!input.value.trim()) return;
  try {
    const r = await api('/checkins', 'POST', { codeOrPhone: input.value.trim(), method: CURRENT_USER.role === 'Member' ? 'Self' : 'Desk' });
    toast(r.memberName + ' checked in'); input.value = ''; renderCheckin();
  } catch (e) { toast(e.message, 'error'); }
}
async function doCheckout(id) {
  try { await api(`/checkins/${id}/checkout`, 'POST'); toast('Checked out'); renderCheckin(); }
  catch (e) { toast(e.message, 'error'); }
}

/* ===================== Logs ===================== */
async function renderLogs() {
  const c = document.getElementById('pageContent');
  const logs = await api('/logs');
  const columns = [
    { key: 'timestamp', title: 'When', render: r => new Date(r.timestamp).toLocaleString() },
    { key: 'user', title: 'User' }, { key: 'action', title: 'Action' },
    { key: 'entity', title: 'Entity' }, { key: 'entityId', title: 'Entity Id' }, { key: 'details', title: 'Details' }
  ];
  c.innerHTML = `<div class="card-block">${tableHtml(columns, logs)}</div>`;
}

/* ===================== Boot ===================== */
(function boot() {
  if (localStorage.getItem('gym_theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  if (localStorage.getItem('gym_sidebar_collapsed') === '1') document.addEventListener('DOMContentLoaded', () => document.getElementById('sidebar').classList.add('collapsed'));
  api('/me').then(user => { CURRENT_USER = user; showApp(); }).catch(() => { /* stay on auth screen */ });
})();
