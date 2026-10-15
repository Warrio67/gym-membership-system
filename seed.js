// Wipes data/db.json and rebuilds it with demo data covering every state:
// active / expiring-soon / expired / cancelled subscriptions, fully-paid /
// partially-paid / refunded payments, open and completed check-ins.
//
// IMPORTANT: stop the server (Ctrl+C) before running this, then start it
// again afterwards — the server keeps its own copy of the data in memory
// while it's running and would overwrite this on its next write otherwise.
//
// Run with:  node seed.js

const bcrypt = require('bcryptjs');
const store = require('./db');

function isoDate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function isoDateDaysAgo(n) { return isoDate(daysAgo(n)); }

function log(username, action, entity, entityId, details) {
  store.db.logs.push({
    id: store.nextId('logId'), timestamp: new Date().toISOString(),
    user: username, action, entity, entityId, details: details || ''
  });
}

// ---- Reset everything ----
store.db.users = [];
store.db.members = [];
store.db.plans = [];
store.db.subscriptions = [];
store.db.payments = [];
store.db.checkins = [];
store.db.logs = [];
store.db.counters = { userId: 0, memberId: 0, planId: 0, subId: 0, paymentId: 0, checkinId: 0, logId: 0, memberCodeSeq: 0, invoiceYearSeq: {} };

// ---- Admin ----
store.db.users.push({
  id: store.nextId('userId'), username: 'admin', email: 'admin@example.com',
  password: bcrypt.hashSync('admin123', 8), role: 'Owner', status: 'Active', memberId: null, createdAt: new Date().toISOString()
});

// ---- Staff account (to demo the Staff role) ----
store.db.users.push({
  id: store.nextId('userId'), username: 'staff1', email: 'staff1@example.com',
  password: bcrypt.hashSync('staff123', 8), role: 'Staff', status: 'Active', memberId: null, createdAt: new Date().toISOString()
});

// ---- Plans ----
function addPlan(name, description, durationDays, price) {
  const id = store.nextId('planId');
  const plan = { id, planCode: 'PL-' + String(id).padStart(3, '0'), name, description, durationDays, price, status: 'Active', createdAt: new Date().toISOString() };
  store.db.plans.push(plan);
  log('admin', 'CREATE', 'Plans', id, 'Added plan ' + name);
  return plan;
}
const planTrial = addPlan('Trial Week', '7-day trial pass', 7, 500);
const planMonthly = addPlan('Monthly', 'Full gym access, 1 month', 30, 1500);
const planQuarterly = addPlan('Quarterly', 'Full gym access, 3 months', 90, 4000);
const planAnnual = addPlan('Annual', 'Full gym access, 12 months', 365, 15000);

// ---- Members ----
function addMember(fullName, phone, email, joinDaysAgo, createLogin) {
  const id = store.nextId('memberId');
  const code = store.nextMemberCode();
  const member = {
    id, memberCode: code, fullName, phone, email, gender: '', dob: '', address: 'House ' + id + ', Street ' + id + ', Demo City',
    joinDate: isoDateDaysAgo(joinDaysAgo), status: 'Active', createdAt: new Date().toISOString()
  };
  store.db.members.push(member);
  log('admin', 'CREATE', 'Members', id, 'Added member ' + code);
  if (createLogin) {
    const uid = store.nextId('userId');
    store.db.users.push({
      id: uid, username: code, email, password: bcrypt.hashSync(phone, 8),
      role: 'Member', status: 'Active', memberId: id, createdAt: new Date().toISOString()
    });
  }
  return member;
}

const m1 = addMember('Member One', '9000000001', 'member1@demo.com', 180, true);   // GM-0001
const m2 = addMember('Member Two', '9000000002', 'member2@demo.com', 120, true);   // GM-0002
const m3 = addMember('Member Three', '9000000003', 'member3@demo.com', 95, false); // GM-0003
const m4 = addMember('Member Four', '9000000004', 'member4@demo.com', 60, false);  // GM-0004
const m5 = addMember('Member Five', '9000000005', 'member5@demo.com', 20, false);  // GM-0005
const m6 = addMember('Member Six', '9000000006', 'member6@demo.com', 15, false);   // GM-0006
const m7 = addMember('Member Seven', '9000000007', 'member7@demo.com', 10, false); // GM-0007
const m8 = addMember('Member Eight', '9000000008', 'member8@demo.com', 0, false);  // GM-0008

// ---- Subscriptions + Payments ----
function addSubscription(member, plan, startDaysAgo, statusOverride) {
  const id = store.nextId('subId');
  const start = daysAgo(startDaysAgo);
  const end = new Date(start); end.setDate(end.getDate() + plan.durationDays - 1);
  const sub = {
    id, memberId: member.id, planId: plan.id, planName: plan.name, price: plan.price,
    durationDays: plan.durationDays, startDate: isoDate(start), endDate: isoDate(end),
    status: statusOverride || (end < new Date() ? 'Expired' : 'Active'),
    createdAt: start.toISOString(), createdBy: 'admin'
  };
  store.db.subscriptions.push(sub);
  log('admin', 'CREATE', 'Subscriptions', id, 'Sold ' + plan.name + ' to ' + member.memberCode);
  return sub;
}
function addPayment(sub, amount, type, method, daysAgoOffset) {
  const invoiceNo = store.nextInvoiceNo();
  const id = store.nextId('paymentId');
  const date = daysAgoOffset !== undefined ? daysAgo(daysAgoOffset) : new Date();
  store.db.payments.push({
    id, invoiceNo, subscriptionId: sub.id, memberId: sub.memberId, amount, type,
    method, date: date.toISOString(), createdBy: 'admin'
  });
  log('admin', 'CREATE', 'Payments', id, `${type} ${amount} against subscription ${sub.id}`);
  return id;
}

// Member 1: old Monthly, expired, fully paid
const sub1 = addSubscription(m1, planMonthly, 180);
addPayment(sub1, 1500, 'Paid', 'Cash', 180);

// Member 2: Quarterly, expired, PARTIALLY paid (outstanding dues) + a refund example
const sub2 = addSubscription(m2, planQuarterly, 120);
addPayment(sub2, 3000, 'Paid', 'UPI', 120);
addPayment(sub2, 500, 'Paid', 'Cash', 60);
addPayment(sub2, 200, 'Refunded', 'Cash', 55); // net paid 3300, outstanding 700
// Member 2 also has an old Cancelled subscription (to demonstrate cancel)
addSubscription(m2, planMonthly, 150, 'Cancelled');

// Member 3: Annual, active, fully paid
const sub3 = addSubscription(m3, planAnnual, 95);
addPayment(sub3, 15000, 'Paid', 'Bank Transfer', 95);

// Member 4: Monthly, started 25 days ago -> expiring within the next few days, partially paid
const sub4 = addSubscription(m4, planMonthly, 25);
addPayment(sub4, 800, 'Paid', 'Card', 25); // outstanding 700

// Member 5: Monthly, active, fully paid
const sub5 = addSubscription(m5, planMonthly, 20);
addPayment(sub5, 1500, 'Paid', 'UPI', 20);

// Member 6: Quarterly, active, advance only (outstanding)
const sub6 = addSubscription(m6, planQuarterly, 15);
addPayment(sub6, 1000, 'Paid', 'Cash', 15); // outstanding 3000

// Member 7: Trial Week, expired (7-day plan, started 10 days ago), fully paid
const sub7 = addSubscription(m7, planTrial, 10);
addPayment(sub7, 500, 'Paid', 'Cash', 10);

// Member 8: Monthly, started today, UNPAID (outstanding = full price)
const sub8 = addSubscription(m8, planMonthly, 0);

// ---- Check-ins: history across the last 7 days + one currently open visit ----
function addCheckin(member, daysAgoIn, hourIn, durationMins, leaveOpen) {
  const id = store.nextId('checkinId');
  const inTime = daysAgo(daysAgoIn);
  inTime.setHours(hourIn, 0, 0, 0);
  const outTime = new Date(inTime.getTime() + durationMins * 60000);
  store.db.checkins.push({
    id, memberId: member.id, checkInTime: inTime.toISOString(),
    checkOutTime: leaveOpen ? null : outTime.toISOString(), method: 'Desk'
  });
  log('admin', 'CREATE', 'CheckIns', id, 'Checked in ' + member.memberCode);
}
addCheckin(m1, 6, 7, 60);
addCheckin(m3, 6, 18, 75);
addCheckin(m1, 5, 7, 55);
addCheckin(m5, 5, 8, 50);
addCheckin(m3, 4, 18, 80);
addCheckin(m4, 4, 19, 45);
addCheckin(m1, 3, 7, 60);
addCheckin(m6, 3, 17, 70);
addCheckin(m3, 2, 18, 65);
addCheckin(m5, 2, 8, 50);
addCheckin(m1, 1, 7, 60);
addCheckin(m4, 1, 19, 40);
addCheckin(m3, 0, 18, 60);       // completed visit today
addCheckin(m5, 0, 9, 30, true);  // OPEN visit right now -> shows in "In the Gym Right Now"

store.save();

console.log('Demo data seeded.\n');
console.log('Owner login   -> username: admin   / password: admin123');
console.log('Staff login   -> username: staff1  / password: staff123');
console.log('Member logins -> username: GM-0001 / password: 9000000001');
console.log('                 username: GM-0002 / password: 9000000002');
console.log('\nNow start the server again with: npm start');
