'use strict';

/*
  CredibleTech receipt / invoice, A5 landscape (210 x 148 mm), following the printed receipt design.
  renderReceipt(doc) returns an HTML string. The title reads RECEIPT once any payment is recorded
  and INVOICE while nothing has been paid.

  doc = {
    receiptNo, date (ISO string or ms),
    customer: { name, phone, address },
    items: [{ name, spec, serial, qty, unitPrice }],      // up to MAX_ROWS (7) lines per receipt
    discount, deliveryFee, paid,
    paymentMethod: 'Cash' | 'Transfer' | 'POS' | 'Other', paymentOther,
    receivedBy
  }
*/

const BRAND = {
  name: 'CredibleTech',
  address: 'Oke Odo, Tanke, Ilorin, Kwara State, Nigeria.',
  phones: ['+234 811 506 7652', '+234 913 468 2104'],
  instagram: '@_credibletech',
};

const WARRANTY_VOID = [
  'Physical damage, water/liquid damage, burn marks or tampering.',
  'Product is opened or repaired by unauthorized person.',
  'Receipt is not presented.',
  'Serial/IMEI is tampered or removed.',
];

const TERMS = [
  'Please inspect your item before leaving our store.',
  'Keep your receipt safe. It is required for warranty claims and returns.',
  'Warranty covers hardware & functionality issues only.',
  'It does not cover accidental damage, misuse or software issues.',
  'Software installation or updates does not cover data recovery or data loss.',
  'Customers are advised to back up their data before repairs.',
  'No refund after purchase except for verified manufacturing defects.',
  'By accepting this receipt, you agree to our terms and conditions.',
];

const SERVICES = [
  ['laptop', 'Laptops & phones'],
  ['repair', 'Repairs <small>(hardware &amp; software)</small>'],
  ['swap', 'Device swapping &amp; upgrades'],
  ['software', 'Software installation &amp; licensing'],
  ['brand', 'Branding services'],
];

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _naira = (n) => '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

/* ---------- amount in words ---------- */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function _below1000(n) {
  let s = '';
  if (n >= 100) {
    s += ONES[Math.floor(n / 100)] + ' hundred';
    n %= 100;
    if (n) s += ' and ';
  }
  if (n >= 20) {
    s += TENS[Math.floor(n / 10)];
    if (n % 10) s += '-' + ONES[n % 10];
  } else if (n > 0) {
    s += ONES[n];
  }
  return s;
}

function nairaInWords(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n === 0) return 'Zero naira only';
  let rest = Math.abs(n);
  const parts = [];
  for (const [v, name] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) {
    if (rest >= v) {
      parts.push(_below1000(Math.floor(rest / v)) + ' ' + name);
      rest %= v;
    }
  }
  if (rest > 0) parts.push((parts.length && rest < 100 ? 'and ' : '') + _below1000(rest));
  const text = parts.join(' ') + ' naira only';
  return (n < 0 ? 'Minus ' : '') + text.charAt(0).toUpperCase() + text.slice(1);
}

/* ---------- totals ---------- */

function receiptTotals(doc) {
  const subtotal = (doc.items || []).reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unitPrice) || 0), 0);
  const discount = Number(doc.discount) || 0;
  const delivery = Number(doc.deliveryFee) || 0;
  const grand = subtotal - discount + delivery;
  const paid = Number(doc.paid) || 0;
  const balance = grand - paid;
  return { subtotal, discount, delivery, grand, paid, balance };
}

/* ---------- icons ---------- */

const S = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const F = (inner) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${inner}</svg>`;

const ICON = {
  pin: F('<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>'),
  phone: F('<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1z"/>'),
  insta: F('<path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17.2 5.8a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"/>'),
  laptop: S('<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/>'),
  repair: S('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'),
  swap: S('<path d="M4 9h14l-3-3M20 15H6l3 3"/>'),
  software: S('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 7v5m-2-2 2 2 2-2M8 20h8M12 16v4"/>'),
  brand: S('<path d="M4 20l1-4L16.5 4.5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
  shield: S('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
  clip: S('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h6"/>'),
  tick: S('<circle cx="12" cy="12" r="9"/><path d="M8 12.2l3 3 5-6"/>'),
  check: S('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  heart: F('<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 5 6.3 5c2 0 3.5 1.1 4.2 2.4h3C14.2 6.1 15.7 5 17.7 5 21 5 23.1 8.3 21.6 11.8 19.5 16.4 12 21 12 21z" transform="translate(0 -1)"/>'),
};

const BADGE_DAYS = `<svg viewBox="0 0 40 46" aria-hidden="true"><path d="M20 1l17 6v14c0 12-7 19-17 24C10 40 3 33 3 21V7z" fill="currentColor"/><text x="20" y="21" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="inherit">7-10</text><text x="20" y="32" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff" font-family="inherit">DAYS</text></svg>`;
const BADGE_MAKER = `<svg viewBox="0 0 40 46" aria-hidden="true"><path d="M12 28l-4 16 8-4 4 6 3-15zM28 28l4 16-8-4-4 6-3-15z" fill="currentColor" opacity=".55"/><circle cx="20" cy="18" r="15" fill="currentColor"/><circle cx="20" cy="18" r="4.2" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M20 7v4M20 25v4M9 18h4M27 18h4M12.2 10.2l2.8 2.8M25 23l2.8 2.8M27.8 10.2L25 13M15 23l-2.8 2.8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`;

/* ---------- render ---------- */

const MIN_ROWS = 7;
const MAX_ROWS = 7; // rows that fit the sheet in every case; the Sales screen enforces this

function renderReceipt(doc) {
  const t = receiptTotals(doc);
  const isReceipt = t.paid > 0;
  const date = new Date(doc.date || Date.now()).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  const items = doc.items || [];

  const rows = Array.from({ length: Math.max(items.length, MIN_ROWS) }, (_, i) => {
    const it = items[i];
    if (!it) return `<tr class="blank"><td class="sn">${i + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`;
    const qty = Number(it.qty) || 1;
    return `<tr>
      <td class="sn">${i + 1}</td>
      <td class="desc"><b>${_esc(it.name)}</b>${it.spec ? ` <span>${_esc(it.spec)}</span>` : ''}</td>
      <td>${_esc(it.serial || '')}</td>
      <td class="c">${qty}</td>
      <td class="r">${_naira(it.unitPrice)}</td>
      <td class="r">${_naira(qty * (Number(it.unitPrice) || 0))}</td>
    </tr>`;
  }).join('');

  const method = doc.paymentMethod || '';
  const box = (label) => `<span class="cb"><i>${method === label ? ICON.check : ''}</i>${label === 'Other' ? 'Other:' : label}</span>`;

  const balanceRow = t.balance > 0
    ? `<div class="rc-owing"><span>Paid <b>${_naira(t.paid)}</b></span><span>Balance due <b>${_naira(t.balance)}</b></span></div>`
    : '';

  return `<article class="rc">
    <div class="rc-corner" aria-hidden="true"><i></i><i></i></div>

    <header class="rc-head">
      <img class="rc-logo" src="logo-color.png" alt="${BRAND.name}">
      <div class="rc-contact">
        <div><span class="ic">${ICON.pin}</span><p>${_esc(BRAND.address).replace(/, Kwara/, ',<br>Kwara')}</p></div>
        <div><span class="ic">${ICON.phone}</span><p>Main: ${_esc(BRAND.phones[0])}<br>Alt: ${_esc(BRAND.phones[1])}</p></div>
        <div><span class="ic">${ICON.insta}</span><p>Instagram: ${_esc(BRAND.instagram)}</p></div>
      </div>
      <div class="rc-title">${isReceipt ? 'RECEIPT' : 'INVOICE'}</div>
    </header>

    <div class="rc-row2">
      <section class="rc-box rc-cust">
        <div class="f"><label>Customer Name:</label><b>${_esc(doc.customer?.name)}</b></div>
        <div class="f"><label>Phone Number:</label><b>${_esc(doc.customer?.phone)}</b></div>
        <div class="f"><label>Address:</label><b>${_esc(doc.customer?.address)}</b></div>
      </section>
      <section class="rc-box rc-ref">
        <div class="f"><label>${isReceipt ? 'Receipt' : 'Invoice'} No.:</label><b class="no">${_esc(doc.receiptNo)}</b></div>
        <div class="f"><label>Date:</label><b>${date}</b></div>
      </section>
    </div>

    <section class="rc-box rc-table">
      <table>
        <colgroup><col style="width:5%"><col style="width:37%"><col style="width:21%"><col style="width:7%"><col style="width:15%"><col style="width:15%"></colgroup>
        <thead><tr><th>S/N</th><th>Description of goods / services</th><th>Serial / IMEI</th><th>Qty</th><th>Unit price (₦)</th><th>Amount (₦)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>

    <div class="rc-mid${t.balance > 0 ? ' owing' : ''}">
      <section class="rc-box rc-pay">
        <div class="lbl">Payment method:</div>
        <div class="methods">${box('Cash')}${box('Transfer')}${box('POS')}${box('Other')}<u>${method === 'Other' ? _esc(doc.paymentOther) : ''}</u></div>
        <div class="lbl">Amount in words:</div>
        <div class="words">${_esc(nairaInWords(t.grand))}</div>
        ${balanceRow}
      </section>
      <section class="rc-box rc-tot">
        <div><span>Subtotal</span><b>${_naira(t.subtotal)}</b></div>
        <div><span>Discount</span><b>${t.discount ? '−' + _naira(t.discount) : '₦'}</b></div>
        <div><span>Delivery fee</span><b>${t.delivery ? _naira(t.delivery) : '₦'}</b></div>
        <div class="grand"><span>Grand total</span><b>${_naira(t.grand)}</b></div>
      </section>
    </div>

    <div class="rc-policies">
      <section class="rc-box rc-warranty">
        <h3><i>${ICON.shield}</i>Warranty policy</h3>
        <div class="w-cols">
          <div class="w-left">
            <div class="w-item"><span class="badge">${BADGE_DAYS}</span>
              <p><b>UK-used / non-brand-new products</b>Comes with 7 to 10 days limited warranty <em>(hardware &amp; functionality only).</em></p></div>
            <div class="w-item"><span class="badge">${BADGE_MAKER}</span>
              <p><b>Brand-new products</b>Come with the official <em>manufacturer warranty.</em></p></div>
          </div>
          <div class="w-right">
            <b>Warranty is void if:</b>
            <ul>${WARRANTY_VOID.map((x) => `<li>${_esc(x)}</li>`).join('')}</ul>
          </div>
        </div>
      </section>
      <section class="rc-box rc-terms">
        <h3><i>${ICON.clip}</i>Terms &amp; conditions</h3>
        <div class="t-cols">
          <ul>${TERMS.slice(0, 4).map((x) => `<li><i>${ICON.tick}</i>${_esc(x)}</li>`).join('')}</ul>
          <ul>${TERMS.slice(4).map((x) => `<li><i>${ICON.tick}</i>${_esc(x)}</li>`).join('')}</ul>
        </div>
      </section>
    </div>

    <div class="rc-sign">
      <div class="s-left"><label>Received by:</label><b>${_esc(doc.receivedBy)}</b></div>
      <div class="s-mid">
        <div class="script"><i></i><span>Thank You!</span><i></i></div>
        <p>Thank you for choosing CredibleTech. <span class="heart">${ICON.heart}</span></p>
      </div>
      <div class="s-right">
        <div class="f"><label>Customer Signature:</label><b></b></div>
        <div class="f"><label>Authorized Signature:</label><b></b></div>
      </div>
    </div>

    <footer class="rc-foot">
      ${SERVICES.map(([k, label]) => `<div><span class="ic">${ICON[k]}</span><p>${label}</p></div>`).join('')}
    </footer>
  </article>`;
}

// Scale the fixed-size sheet to fit the screen. Printing always uses full size.
function fitReceipt(host) {
  const sheet = host.querySelector('.rc');
  if (!sheet) return;
  const apply = () => {
    const s = Math.min(1, host.clientWidth / sheet.offsetWidth);
    sheet.style.transform = `scale(${s})`;
    host.style.height = `${sheet.offsetHeight * s}px`;
  };
  apply();
  window.addEventListener('resize', apply);
}
