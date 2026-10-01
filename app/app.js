'use strict';

/*
  Data model (IndexedDB "credibletech", version 1)

  products:  { id, name, spec, category, condition, source, costPrice|null, sellPrice,
               serial, status: available|reserved|sold, notes, priceHistory:[{at,cost,sell}],
               createdAt, updatedAt }
  customers: { id, name, phone, type: prospect|buyer, wants, budget, notes, createdAt }   (screen comes next)
  sales:     { id, productId, customerId, date, soldPrice, costAtSale, productName,
               paymentStatus, invoiceNo }                                                  (screen comes next)

  A sale copies soldPrice and costAtSale at the moment of sale, so editing a product's
  price later never rewrites an old invoice or old profit.
*/

const DB_NAME = 'credibletech';
const DB_VERSION = 1;
const STORES = ['products', 'customers', 'sales'];

let db;
let products = [];
let filter = 'available';
let query = '';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const naira = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');
const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/* ---------- storage ---------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore('products', { keyPath: 'id', autoIncrement: true }).createIndex('status', 'status');
      d.createObjectStore('customers', { keyPath: 'id', autoIncrement: true }).createIndex('type', 'type');
      const sales = d.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
      sales.createIndex('productId', 'productId');
      sales.createIndex('customerId', 'customerId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const request = fn(t.objectStore(store));
    t.oncomplete = () => resolve(request.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const getAll = (s) => run(s, 'readonly', (o) => o.getAll());
const put = (s, x) => run(s, 'readwrite', (o) => o.put(x));
const remove = (s, id) => run(s, 'readwrite', (o) => o.delete(id));

/* ---------- backup ---------- */

async function exportBackup() {
  const data = { app: 'credibletech', version: DB_VERSION, exportedAt: new Date().toISOString() };
  for (const s of STORES) data[s] = await getAll(s);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `credibletech-backup-${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup file created');
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('That file is not a valid backup');
  }
  if (data.app !== 'credibletech') return toast('That file is not a CredibleTech backup');
  if (!confirm('Importing replaces everything currently in the app. Continue?')) return;
  await new Promise((resolve, reject) => {
    const t = db.transaction(STORES, 'readwrite');
    for (const s of STORES) {
      const o = t.objectStore(s);
      o.clear();
      (data[s] || []).forEach((x) => o.put(x));
    }
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  await refresh();
  toast('Backup restored');
}

/* ---------- products view ---------- */

async function refresh() {
  products = await getAll('products');
  renderStats();
  renderChips();
  renderList();
}

function renderStats() {
  const stock = products.filter((p) => p.status === 'available');
  const cost = stock.reduce((sum, p) => sum + (p.costPrice ?? 0), 0);
  const margin = stock.reduce((sum, p) => sum + (p.costPrice == null ? 0 : p.sellPrice - p.costPrice), 0);
  $('#stat-cost').textContent = naira(cost);
  $('#stat-margin').textContent = naira(margin);
}

function renderChips() {
  const counts = { available: 0, reserved: 0, sold: 0, all: products.length };
  products.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
  const defs = [['available', 'Available'], ['reserved', 'Reserved'], ['sold', 'Sold'], ['all', 'All']];
  $('#chips').innerHTML = defs
    .map(([k, label]) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${filter === k}">${label} ${counts[k] || 0}</button>`)
    .join('');
}

function matches(p) {
  if (!query) return true;
  const hay = [p.name, p.spec, p.source, p.serial, p.category].join(' ').toLowerCase();
  return hay.includes(query);
}

function renderList() {
  const list = products
    .filter((p) => (filter === 'all' || p.status === filter) && matches(p))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (!products.length) {
    $('#list').innerHTML = `<div class="empty"><strong>No products yet</strong>Add the first unit you hold or broker. Prices stay editable.</div>`;
    return;
  }
  if (!list.length) {
    $('#list').innerHTML = `<div class="empty"><strong>Nothing here</strong>Try another filter or clear the search.</div>`;
    return;
  }

  $('#list').innerHTML = list
    .map((p) => {
      const m = p.costPrice == null ? null : p.sellPrice - p.costPrice;
      const marginHtml = m == null
        ? `<span class="margin none">no cost set</span>`
        : `<span class="margin ${m >= 0 ? 'up' : 'down'}">${m >= 0 ? '+' : '−'}${naira(Math.abs(m))}</span>`;
      const sub = [p.spec, p.condition].filter(Boolean).join(' · ');
      const tag = p.status === 'available' ? '' : `<span class="tag">${p.status === 'sold' ? 'Sold' : 'Reserved'}</span>`;
      return `<button type="button" class="card ${p.status}" data-id="${p.id}">
        <div><h3>${esc(p.name)}</h3><p class="spec">${esc(sub)}</p>${tag}</div>
        <div><span class="price">${naira(p.sellPrice)}</span>${marginHtml}</div>
      </button>`;
    })
    .join('');
}

/* ---------- product form ---------- */

const form = $('#pform');
const sheet = $('#sheet');
const field = (name) => form.elements[name];

function updateCalc() {
  const cost = numOrNull(field('cost').value);
  const sell = numOrNull(field('sell').value);
  if (cost == null || sell == null) {
    $('#calc-val').textContent = '—';
    return;
  }
  const m = sell - cost;
  const pct = cost > 0 ? ` (${((m / cost) * 100).toFixed(1)}% on cost)` : '';
  $('#calc-val').textContent = `${m < 0 ? '−' : ''}${naira(Math.abs(m))}${pct}`;
}

function openForm(id) {
  const p = id ? products.find((x) => x.id === id) : null;
  form.reset();
  $('#sheet-title').textContent = p ? 'Edit product' : 'Add product';
  field('pid').value = p ? p.id : '';
  if (p) {
    field('name').value = p.name;
    field('spec').value = p.spec || '';
    field('category').value = p.category || 'Laptop';
    field('condition').value = p.condition || 'UK-used';
    field('source').value = p.source || '';
    field('cost').value = p.costPrice ?? '';
    field('sell').value = p.sellPrice ?? '';
    field('serial').value = p.serial || '';
    field('status').value = p.status;
    field('notes').value = p.notes || '';
  }
  const hist = (p?.priceHistory || []).slice(-5).reverse();
  $('#history-wrap').hidden = !hist.length;
  $('#history').innerHTML = hist
    .map((h) => `<li><span>${new Date(h.at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>sell ${naira(h.sell)}${h.cost == null ? '' : ` · cost ${naira(h.cost)}`}</span></li>`)
    .join('');
  $('#btn-delete').hidden = !p;
  updateCalc();
  sheet.showModal();
}

async function saveProduct(e) {
  e.preventDefault();
  const id = Number(field('pid').value) || null;
  const old = id ? products.find((x) => x.id === id) : null;
  const now = Date.now();
  const cost = numOrNull(field('cost').value);
  const sell = numOrNull(field('sell').value);
  if (sell == null) return toast('Enter a selling price');

  const rec = {
    ...(old || { createdAt: now, priceHistory: [] }),
    name: field('name').value.trim(),
    spec: field('spec').value.trim(),
    category: field('category').value,
    condition: field('condition').value,
    source: field('source').value.trim(),
    costPrice: cost,
    sellPrice: sell,
    serial: field('serial').value.trim(),
    status: field('status').value,
    notes: field('notes').value.trim(),
    updatedAt: now,
  };
  if (!old || old.costPrice !== cost || old.sellPrice !== sell) {
    rec.priceHistory = [...(rec.priceHistory || []), { at: now, cost, sell }];
  }
  await put('products', rec);
  sheet.close();
  await refresh();
  toast(old ? 'Changes saved' : 'Product added');
}

async function deleteProduct() {
  const id = Number(field('pid').value);
  if (!id || !confirm('Delete this product? Past sales keep their own copy of the details.')) return;
  await remove('products', id);
  sheet.close();
  await refresh();
  toast('Product deleted');
}

/* ---------- ui plumbing ---------- */

function showView(name) {
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });
  $$('.nav button').forEach((b) => {
    if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#fab').hidden = name !== 'products';
}

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2400);
}

function bind() {
  $('#fab').addEventListener('click', () => openForm(null));
  $('#list').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openForm(Number(card.dataset.id));
  });
  $('#chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    filter = chip.dataset.filter;
    renderChips();
    renderList();
  });
  $('#search').addEventListener('input', (e) => {
    query = e.target.value.trim().toLowerCase();
    renderList();
  });
  $$('.nav button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  form.addEventListener('submit', saveProduct);
  field('cost').addEventListener('input', updateCalc);
  field('sell').addEventListener('input', updateCalc);
  $('#btn-cancel').addEventListener('click', () => sheet.close());
  $('#btn-delete').addEventListener('click', deleteProduct);
  $('#btn-export').addEventListener('click', () => { $('#menu').open = false; exportBackup(); });
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    $('#menu').open = false;
    if (file) await importBackup(file);
  });
}

async function init() {
  db = await openDB();
  bind();
  await refresh();
  showView('products');
  if (navigator.storage?.persist) navigator.storage.persist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#B23A2E">Storage could not start. Open the app in a normal (not private) browser tab.</p>');
});
