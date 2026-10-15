// Very small JSON-file "database". No native modules, no build step -
// just reads/writes a single JSON file synchronously. Good enough for a
// local demo / college project; swap for real SQL later if you want to.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function defaultShape() {
  return {
    users: [],
    members: [],
    plans: [],
    subscriptions: [],
    payments: [],
    checkins: [],
    logs: [],
    counters: { userId: 0, memberId: 0, planId: 0, subId: 0, paymentId: 0, checkinId: 0, logId: 0, memberCodeSeq: 0, invoiceYearSeq: {} }
  };
}

let db;

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    db = defaultShape();
    save();
  } else {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function nextId(counterKey) {
  db.counters[counterKey] = (db.counters[counterKey] || 0) + 1;
  return db.counters[counterKey];
}

function nextMemberCode() {
  db.counters.memberCodeSeq = (db.counters.memberCodeSeq || 0) + 1;
  return 'GM-' + String(db.counters.memberCodeSeq).padStart(4, '0');
}

function nextInvoiceNo() {
  const year = new Date().getFullYear();
  db.counters.invoiceYearSeq[year] = (db.counters.invoiceYearSeq[year] || 0) + 1;
  return 'INV-' + year + '-' + String(db.counters.invoiceYearSeq[year]).padStart(4, '0');
}

load();

module.exports = { get db() { return db; }, save, nextId, nextMemberCode, nextInvoiceNo };
