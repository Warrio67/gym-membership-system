const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const store = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'gym-membership-local-demo-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));

/* ---------------- ROLE / PERMISSION ENGINE ---------------- */

const ROLE_PERMISSIONS = {
  Owner: {
    dashboard: { view: true },
    members: { view: true, add: true, edit: true, delete: true },
    plans: { view: true, add: true, edit: true, delete: true },
    subscriptions: { view: true, add: true, edit: true, delete: true },
    payments: { view: true, add: true, edit: true, delete: true },
    checkin: { view: true, add: true, edit: true, delete: true },
    logs: { view: true, add: false, edit: false, delete: false }
  },
  Staff: {
    dashboard: { view: true },
    members: { view: true, add: true, edit: true, delete: false },
    plans: { view: true, add: false, edit: false, delete: false },
    subscriptions: { view: true, add: true, edit: true, delete: false },
    payments: { view: true, add: true, edit: false, delete: false },
    checkin: { view: true, add: true, edit: true, delete: false },
    logs: { view: false, add: false, edit: false, delete: false }
  },
  Member: {
    dashboard: { view: false },
    members: { view: false, add: false, edit: false, delete: false },
    plans: { view: false, add: false, edit: false, delete: false },
    subscriptions: { view: true, add: false, edit: false, delete: false },
    payments: { view: true, add: false, edit: false, delete: false },
    checkin: { view: true, add: true, edit: false, delete: false },
    logs: { view: false, add: false, edit: false, delete: false }
  }
};

function currentUser(req) {
  if (!req.session.userId) return null;
  return store.db.users.find(u => u.id === req.session.userId) || null;
}

// Every protected route: re-derive the caller's role from the DB by session
// user id (never trust a role the client might claim) and gate before doing anything.
function gate(page, action) {
  return (req, res, next) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (user.status !== 'Active') return res.status(403).json({ error: 'Account is not active.' });
    const perms = ROLE_PERMISSIONS[user.role];
    if (!perms || !perms[page] || !perms[page][action]) {
      return res.status(403).json({ error: `You do not have permission to ${action} ${page}.` });
    }
    req.user = user;
    next();
  };
}

function round2(n) { return Math.round((parseFloat(n) + Number.EPSILON) * 100) / 100; }

function log(username, action, entity, entityId, details) {
  store.db.logs.push({
    id: store.nextId('logId'), timestamp: new Date().toISOString(),
    user: username, action, entity, entityId, details: details || ''
  });
}

/* ---------------- SEED ---------------- */

(function seed() {
  if (!store.db.users.some(u => u.role === 'Owner')) {
    const hash = bcrypt.hashSync('admin123', 8);
    store.db.users.push({
      id: store.nextId('userId'), username: 'admin', email: 'admin@example.com',
      password: hash, role: 'Owner', status: 'Active', memberId: null, createdAt: new Date().toISOString()
    });
    store.save();
    console.log('Seeded default login -> username: admin / password: admin123');
  }
})();

/* ---------------- AUTH ---------------- */

app.post('/api/signup', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Username, email and password are required.' });
  if (store.db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'That username is already taken.' });
  }
  if (store.db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'That email is already registered.' });
  }
  const user = {
    id: store.nextId('userId'), username, email, password: bcrypt.hashSync(password, 8),
    role: 'Member', status: 'Active', memberId: null, createdAt: new Date().toISOString()
  };
  store.db.users.push(user);
  log(username, 'CREATE', 'Users', user.id, 'Self sign-up');
  store.save();
  res.json({ ok: true, message: 'Account created. You can sign in now.' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = store.db.users.find(u => u.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  if (user.status !== 'Active') return res.status(403).json({ error: 'This account is not active.' });
  req.session.userId = user.id;
  res.json({
    username: user.username, email: user.email, role: user.role,
    memberId: user.memberId || '', permissions: ROLE_PERMISSIONS[user.role] || {}
  });
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  res.json({
    username: user.username, email: user.email, role: user.role,
    memberId: user.memberId || '', permissions: ROLE_PERMISSIONS[user.role] || {}
  });
});

/* ---------------- MEMBERS ---------------- */

app.get('/api/members', gate('members', 'view'), (req, res) => {
  res.json(store.db.members);
});

app.post('/api/members', gate('members', 'add'), (req, res) => {
  const data = req.body;
  const phone = String(data.phone || '').trim();
  const cnic = String(data.cnic || '').trim();
  if (!data.fullName || !phone) return res.status(400).json({ error: 'Full name and phone are required.' });

  const dupPhone = store.db.members.find(m => m.phone === phone);
  if (dupPhone) return res.status(400).json({ error: `Phone already belongs to member ${dupPhone.memberCode}.` });
  if (cnic) {
    const dupCnic = store.db.members.find(m => (m.cnic || '') === cnic);
    if (dupCnic) return res.status(400).json({ error: `CNIC already belongs to member ${dupCnic.memberCode}.` });
  }

  const id = store.nextId('memberId');
  const code = store.nextMemberCode();
  const member = {
    id, memberCode: code, fullName: data.fullName, phone, email: data.email || '',
    gender: data.gender || '', dob: data.dob || '', address: data.address || '',
    joinDate: data.joinDate || new Date().toISOString().slice(0, 10), status: 'Active',
    createdAt: new Date().toISOString()
  };
  store.db.members.push(member);

  let credentials = null;
  if (!data.skipLogin) {
    const loginUsername = data.loginUsername || code;
    const loginPassword = data.loginPassword || phone;
    const loginEmail = data.loginEmail || data.email || '';
    if (!store.db.users.some(u => u.username.toLowerCase() === loginUsername.toLowerCase())) {
      const uid = store.nextId('userId');
      store.db.users.push({
        id: uid, username: loginUsername, email: loginEmail, password: bcrypt.hashSync(loginPassword, 8),
        role: 'Member', status: 'Active', memberId: id, createdAt: new Date().toISOString()
      });
      credentials = { username: loginUsername, password: loginPassword };
    }
  }

  log(req.user.username, 'CREATE', 'Members', id, 'Added member ' + code);
  store.save();
  res.json({ ok: true, memberCode: code, memberId: id, credentials });
});

app.put('/api/members/:id', gate('members', 'edit'), (req, res) => {
  const member = store.db.members.find(m => m.id === parseInt(req.params.id, 10));
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  const editable = ['fullName', 'phone', 'email', 'gender', 'dob', 'address', 'status'];
  editable.forEach(f => { if (req.body[f] !== undefined) member[f] = req.body[f]; });
  log(req.user.username, 'UPDATE', 'Members', member.id, 'Updated member details');
  store.save();
  res.json({ ok: true });
});

app.delete('/api/members/:id', gate('members', 'delete'), (req, res) => {
  const member = store.db.members.find(m => m.id === parseInt(req.params.id, 10));
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  member.status = 'Inactive';
  log(req.user.username, 'DELETE', 'Members', member.id, 'Soft-deleted member (set Inactive)');
  store.save();
  res.json({ ok: true });
});

/* ---------------- PLANS ---------------- */

app.get('/api/plans', gate('plans', 'view'), (req, res) => { res.json(store.db.plans); });

app.post('/api/plans', gate('plans', 'add'), (req, res) => {
  const data = req.body;
  if (!data.name || !data.durationDays || data.price === undefined) {
    return res.status(400).json({ error: 'Name, duration and price are required.' });
  }
  const id = store.nextId('planId');
  const code = 'PL-' + String(id).padStart(3, '0');
  const plan = {
    id, planCode: code, name: data.name, description: data.description || '',
    durationDays: parseInt(data.durationDays, 10), price: round2(data.price),
    status: 'Active', createdAt: new Date().toISOString()
  };
  store.db.plans.push(plan);
  log(req.user.username, 'CREATE', 'Plans', id, 'Added plan ' + data.name);
  store.save();
  res.json({ ok: true, planId: id, planCode: code });
});

app.put('/api/plans/:id', gate('plans', 'edit'), (req, res) => {
  const plan = store.db.plans.find(p => p.id === parseInt(req.params.id, 10));
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });
  const editable = ['name', 'description', 'durationDays', 'price', 'status'];
  editable.forEach(f => { if (req.body[f] !== undefined) plan[f] = f === 'price' ? round2(req.body[f]) : req.body[f]; });
  log(req.user.username, 'UPDATE', 'Plans', plan.id, 'Updated plan');
  store.save();
  res.json({ ok: true });
});

app.delete('/api/plans/:id', gate('plans', 'delete'), (req, res) => {
  const plan = store.db.plans.find(p => p.id === parseInt(req.params.id, 10));
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });
  plan.status = 'Inactive';
  log(req.user.username, 'DELETE', 'Plans', plan.id, 'Soft-deleted plan (set Inactive)');
  store.save();
  res.json({ ok: true });
});

/* ---------------- SUBSCRIPTIONS + EXPIRY SWEEP ---------------- */

function refreshExpiries() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  store.db.subscriptions.forEach(s => {
    if (s.status === 'Active' && new Date(s.endDate) < today) s.status = 'Expired';
  });
}

function enrichSubscription(s) {
  const m = store.db.members.find(mm => mm.id === s.memberId);
  return Object.assign({}, s, {
    memberCode: m ? m.memberCode : '',
    memberName: m ? m.fullName : 'Unknown',
    outstanding: computeOutstanding(s.id)
  });
}

app.get('/api/subscriptions', gate('subscriptions', 'view'), (req, res) => {
  refreshExpiries(); store.save();
  let rows = store.db.subscriptions;
  if (req.user.role === 'Member') rows = rows.filter(s => s.memberId === req.user.memberId);
  res.json(rows.map(enrichSubscription));
});

app.post('/api/subscriptions', gate('subscriptions', 'add'), (req, res) => {
  const data = req.body;
  const member = store.db.members.find(m => m.id === parseInt(data.memberId, 10));
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  const plan = store.db.plans.find(p => p.id === parseInt(data.planId, 10));
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });

  let price = round2(plan.price);
  if (data.discount) {
    if (req.user.role !== 'Owner' && req.user.role !== 'Manager') {
      return res.status(403).json({ error: 'Only Owner or Manager may apply a discount.' });
    }
    price = round2(Math.max(0, price - parseFloat(data.discount)));
  }

  const startDate = new Date(data.startDate || new Date());
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + parseInt(plan.durationDays, 10) - 1);

  const advance = data.advance ? round2(data.advance) : 0;
  if (advance < 0 || advance > price) return res.status(400).json({ error: 'Advance payment must be between 0 and the plan price.' });

  const id = store.nextId('subId');
  const sub = {
    id, memberId: member.id, planId: plan.id, planName: plan.name, price,
    durationDays: plan.durationDays, startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10), status: 'Active',
    createdAt: new Date().toISOString(), createdBy: req.user.username
  };
  store.db.subscriptions.push(sub);
  log(req.user.username, 'CREATE', 'Subscriptions', id, 'Sold ' + plan.name + ' to ' + member.memberCode);

  let payment = null;
  if (advance > 0) payment = recordPayment(req.user.username, id, member.id, advance, 'Paid', data.method || 'Cash');
  store.save();
  res.json({ ok: true, subscriptionId: id, endDate: sub.endDate, payment });
});

app.post('/api/subscriptions/:id/cancel', gate('subscriptions', 'edit'), (req, res) => {
  const sub = store.db.subscriptions.find(s => s.id === parseInt(req.params.id, 10));
  if (!sub) return res.status(404).json({ error: 'Subscription not found.' });
  sub.status = 'Cancelled';
  log(req.user.username, 'UPDATE', 'Subscriptions', sub.id, 'Cancelled subscription');
  store.save();
  res.json({ ok: true });
});

/* ---------------- PAYMENTS ---------------- */

function recordPayment(username, subscriptionId, memberId, amount, type, method) {
  const invoiceNo = store.nextInvoiceNo();
  const id = store.nextId('paymentId');
  store.db.payments.push({
    id, invoiceNo, subscriptionId, memberId, amount: round2(amount), type,
    method: method || 'Cash', date: new Date().toISOString(), createdBy: username
  });
  log(username, 'CREATE', 'Payments', id, `${type} ${amount} against subscription ${subscriptionId}`);
  return { id, invoiceNo };
}

app.get('/api/payments', gate('payments', 'view'), (req, res) => {
  let rows = store.db.payments;
  if (req.user.role === 'Member') rows = rows.filter(p => p.memberId === req.user.memberId);
  res.json(rows.map(p => {
    const m = store.db.members.find(mm => mm.id === p.memberId);
    const sub = store.db.subscriptions.find(s => s.id === p.subscriptionId);
    return Object.assign({}, p, {
      memberCode: m ? m.memberCode : '',
      memberName: m ? m.fullName : 'Unknown',
      planName: sub ? sub.planName : ''
    });
  }));
});

// Every subscription that still has money owed on it, soonest end date (i.e.
// soonest "pay by" point, since that's when access lapses) first.
app.get('/api/dues', gate('payments', 'view'), (req, res) => {
  refreshExpiries(); store.save();
  const rows = store.db.subscriptions
    .filter(s => s.status !== 'Cancelled')
    .map(enrichSubscription)
    .filter(s => s.outstanding > 0)
    .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
  res.json(rows);
});

app.post('/api/payments', gate('payments', 'add'), (req, res) => {
  const data = req.body;
  if (!data.subscriptionId || !data.amount) return res.status(400).json({ error: 'Subscription and amount are required.' });
  const sub = store.db.subscriptions.find(s => s.id === parseInt(data.subscriptionId, 10));
  if (!sub) return res.status(404).json({ error: 'Subscription not found.' });
  const type = data.type === 'Refunded' ? 'Refunded' : 'Paid';
  const result = recordPayment(req.user.username, sub.id, sub.memberId, data.amount, type, data.method);
  store.save();
  res.json({ ok: true, invoiceNo: result.invoiceNo });
});

function computeOutstanding(subscriptionId) {
  const sub = store.db.subscriptions.find(s => s.id === subscriptionId);
  if (!sub) return 0;
  const payments = store.db.payments.filter(p => p.subscriptionId === subscriptionId);
  const paid = payments.filter(p => p.type === 'Paid').reduce((s, p) => s + p.amount, 0);
  const refunded = payments.filter(p => p.type === 'Refunded').reduce((s, p) => s + p.amount, 0);
  return round2(sub.price - (paid - refunded));
}

/* ---------------- CHECK-IN DESK ---------------- */

app.get('/api/checkins/active', gate('checkin', 'view'), (req, res) => {
  const visits = store.db.checkins.filter(v => !v.checkOutTime);
  res.json(visits.map(v => {
    const m = store.db.members.find(mm => mm.id === v.memberId);
    return { id: v.id, memberId: v.memberId, memberCode: m ? m.memberCode : '', memberName: m ? m.fullName : 'Unknown', checkInTime: v.checkInTime, method: v.method };
  }));
});

app.get('/api/checkins/history', gate('checkin', 'view'), (req, res) => {
  let visits = store.db.checkins;
  if (req.user.role === 'Member') visits = visits.filter(v => v.memberId === req.user.memberId);
  const rows = visits.map(v => {
    const m = store.db.members.find(mm => mm.id === v.memberId);
    return Object.assign({}, v, { memberCode: m ? m.memberCode : '', memberName: m ? m.fullName : 'Unknown' });
  });
  res.json(rows.slice().reverse());
});

app.post('/api/checkins', gate('checkin', 'add'), (req, res) => {
  refreshExpiries();
  const codeOrPhone = String(req.body.codeOrPhone || '');
  const method = req.body.method || (req.user.role === 'Member' ? 'Self' : 'Desk');
  const member = store.db.members.find(m => m.memberCode === codeOrPhone || m.phone === codeOrPhone);
  if (!member) return res.status(404).json({ error: 'No member found with that code or phone.' });
  if (member.status !== 'Active') return res.status(403).json({ error: 'This member account is not active.' });

  const activeSub = store.db.subscriptions.find(s => s.memberId === member.id && s.status === 'Active');
  if (!activeSub) {
    const frozen = store.db.subscriptions.find(s => s.memberId === member.id && s.status === 'Frozen');
    if (frozen) return res.status(403).json({ error: `Membership is frozen.` });
    return res.status(403).json({ error: 'No active subscription for this member.' });
  }

  const open = store.db.checkins.find(v => v.memberId === member.id && !v.checkOutTime);
  if (open) return res.status(400).json({ error: `${member.fullName} already has an open visit.` });

  const id = store.nextId('checkinId');
  store.db.checkins.push({ id, memberId: member.id, checkInTime: new Date().toISOString(), checkOutTime: null, method });
  log(req.user.username, 'CREATE', 'CheckIns', id, 'Checked in ' + member.memberCode);
  store.save();
  res.json({ ok: true, memberName: member.fullName, memberCode: member.memberCode });
});

app.post('/api/checkins/:id/checkout', gate('checkin', 'edit'), (req, res) => {
  const visit = store.db.checkins.find(v => v.id === parseInt(req.params.id, 10));
  if (!visit) return res.status(404).json({ error: 'Visit not found.' });
  visit.checkOutTime = new Date().toISOString();
  log(req.user.username, 'UPDATE', 'CheckIns', visit.id, 'Checked out');
  store.save();
  res.json({ ok: true });
});

/* ---------------- DASHBOARD ---------------- */

app.get('/api/dashboard', gate('dashboard', 'view'), (req, res) => {
  refreshExpiries(); store.save();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(); monthStart.setDate(1);

  const revenueThisMonth = store.db.payments
    .filter(p => new Date(p.date) >= monthStart)
    .reduce((s, p) => s + (p.type === 'Paid' ? p.amount : -p.amount), 0);

  const expiringSoon = store.db.subscriptions.filter(s => {
    if (s.status !== 'Active') return false;
    const days = (new Date(s.endDate) - new Date()) / 86400000;
    return days >= 0 && days <= 7;
  }).length;

  const sparkline = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    sparkline.push(store.db.checkins.filter(v => String(v.checkInTime).slice(0, 10) === dayStr).length);
  }

  res.json({
    totalMembers: store.db.members.filter(m => m.status === 'Active').length,
    activeSubscriptions: store.db.subscriptions.filter(s => s.status === 'Active').length,
    checkInsToday: store.db.checkins.filter(v => String(v.checkInTime).slice(0, 10) === today).length,
    inGymNow: store.db.checkins.filter(v => !v.checkOutTime).length,
    revenueThisMonth: round2(revenueThisMonth),
    expiringSoon,
    footfallSparkline: sparkline
  });
});

/* ---------------- LOGS ---------------- */

app.get('/api/logs', gate('logs', 'view'), (req, res) => {
  res.json(store.db.logs.slice().reverse().slice(0, 200));
});

/* ---------------- START ---------------- */

app.listen(PORT, () => {
  console.log(`Gym Membership System running at http://localhost:${PORT}`);
});
