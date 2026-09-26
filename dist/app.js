// ScopePay web app. Every figure on the page is read from the ScopePay contract on
// Arbitrum through a public RPC; a connected wallet is only used to sign.
const {ethers} = window;
const $ = selector => document.querySelector(selector);
const ARBITER_WINDOW = 14 * 86400;
const STATUS = ['Pending', 'Submitted', 'Released', 'Refunded'];
const ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
];

const app = {
  config: null, registry: {}, read: null, contract: null, address: '', startBlock: 0,
  deals: [], events: new Map(), blockTimes: new Map(), selected: null, importedProof: null,
  wallet: {provider: null, signer: null, address: null},
  recordWorker: null, busy: false, loading: false, lastRender: 0, mineOnly: false,
};

// ---------- small helpers ----------

const short = value => (value ? `${value.slice(0, 6)}…${value.slice(-4)}` : '—');
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const nowSec = () => Math.floor(Date.now() / 1000);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[c]));
const store = {
  get(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: proof links still work */ } },
};
const tokenOf = address => app.config.tokens.find(token => same(token.address, address)) ?? {symbol: 'tokens', decimals: 6, address};
const explorer = path => `${app.config.network.explorer}/${path}`;

function amount(value, token) {
  const [whole, fraction = ''] = ethers.formatUnits(value ?? 0n, token.decimals).split('.');
  const trimmed = fraction.replace(/0+$/, '');
  const digits = trimmed.length <= 2 ? fraction.padEnd(2, '0').slice(0, 2) : trimmed;
  return `${Number(whole).toLocaleString('en-US')}.${digits}`;
}
const money = (value, token) => `${amount(value, token)} ${token.symbol}`;

function duration(seconds) {
  seconds = Number(seconds);
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`;
  return `${Math.round(seconds / 60)} minutes`;
}
function countdown(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const two = n => String(n).padStart(2, '0');
  return d ? `${d}d ${two(h)}h ${two(m)}m` : `${two(h)}:${two(m)}:${two(r)}`;
}
const relTime = new Intl.RelativeTimeFormat('en', {numeric: 'auto'});
function relative(ts) {
  const diff = Number(ts) - nowSec();
  const abs = Math.abs(diff);
  if (abs < 60) return diff >= 0 ? 'in under a minute' : 'just now';
  if (abs < 3600) return relTime.format(Math.round(diff / 60), 'minute');
  if (abs < 172800) return relTime.format(Math.round(diff / 3600), 'hour');
  return relTime.format(Math.round(diff / 86400), 'day');
}
const when = ts => new Date(Number(ts) * 1000).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
const day = ts => new Date(Number(ts) * 1000).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});

let toastTimer;
function toast(message, bad = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), bad ? 5200 : 3200);
}
function notice(html, bad = false) {
  const el = $('#notice');
  el.classList.toggle('hidden', !html);
  el.classList.toggle('bad', bad);
  el.innerHTML = html || '';
}

const ERROR_TEXT = {
  Unauthorized: "This wallet isn't allowed to do that on this deal.",
  InvalidState: 'The deal changed before your transaction landed. The page has been refreshed.',
  TooEarly: "Too early: that clock hasn't run out yet.",
  WrongAmount: "That amount isn't allowed here.",
  UnsupportedToken: "This contract doesn't accept that token.",
  InvalidParty: 'Client, freelancer and arbiter must be three different wallets.',
  InvalidWindow: 'Pick a review window between 1 hour and 30 days.',
  InvalidMilestones: 'Each milestone needs an amount above zero and a due date later than the one before it.',
  SafeERC20FailedOperation: 'The token transfer failed. Check the balance and approval.',
  ReentrancyGuardReentrantCall: 'The contract refused a nested call.',
};
function friendly(error) {
  const code = error?.code ?? error?.info?.error?.code ?? error?.error?.code;
  if (code === 'ACTION_REJECTED' || code === 4001) return 'You cancelled it in your wallet. Nothing was sent.';
  let name = error?.revert?.name;
  const data = error?.data ?? error?.info?.error?.data ?? error?.error?.data;
  if (!name && typeof data === 'string' && data.length >= 10 && app.contract) {
    try { name = app.contract.interface.parseError(data)?.name; } catch { /* not ours */ }
  }
  if (name && ERROR_TEXT[name]) return ERROR_TEXT[name];
  const text = [error?.shortMessage, error?.info?.error?.message, error?.message].filter(Boolean).join(' ');
  if (/insufficient funds|gas required exceeds/i.test(text)) return 'This wallet needs a little Arbitrum Sepolia ETH to pay for gas.';
  if (/network|timeout|failed to fetch|ECONN|503|502/i.test(text)) return "Couldn't reach Arbitrum. Check your connection and try again.";
  return error?.shortMessage || error?.message || 'Something went wrong.';
}

// ---------- terms and evidence (off-chain, verified by hash) ----------

const termsKey = id => `scopepay:v2:terms:${app.address.toLowerCase()}:${id}`;
const evidenceKey = id => `scopepay:v2:evidence:${app.address.toLowerCase()}:${id}`;
const hashText = text => ethers.id(text);
const termsHash = terms => ethers.id(JSON.stringify(terms));

function validTerms(terms) {
  return !!terms && typeof terms.title === 'string' && terms.title.length <= 120 && Array.isArray(terms.milestones) &&
    terms.milestones.length <= 12 && terms.milestones.every(item => typeof item?.name === 'string' && item.name.length <= 120);
}
function knownTerms(deal) {
  const candidates = [app.importedProof?.deal === String(deal.id) ? app.importedProof.terms : null,
    app.registry[String(deal.id)]?.terms, store.get(termsKey(deal.id), null)];
  return candidates.find(terms => validTerms(terms) && same(termsHash(terms), deal.termsCommitment)) ?? null;
}
function knownEvidence(deal, milestones) {
  const found = new Map();
  const lists = [app.importedProof?.deal === String(deal.id) ? app.importedProof.evidence : [],
    app.registry[String(deal.id)]?.evidence, store.get(evidenceKey(deal.id), [])];
  for (const list of lists) {
    for (const item of Array.isArray(list) ? list : []) {
      const index = Number(item?.milestone);
      const text = typeof item?.text === 'string' ? item.text : '';
      const onChain = milestones[index]?.evidenceCommitment;
      if (text && text.length <= 2000 && onChain && same(hashText(text), onChain)) found.set(index, text);
    }
  }
  return found;
}
function encodeProof(pack) {
  const bytes = new TextEncoder().encode(JSON.stringify(pack));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function decodeProof(value) {
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4));
    const pack = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
    return pack?.v === 2 ? pack : null;
  } catch { return null; }
}

// ---------- reading the chain ----------

async function useContract(address) {
  const code = await app.read.getCode(address);
  if (code === '0x') throw new Error('No contract lives at that address on Arbitrum Sepolia.');
  const contract = new ethers.Contract(address, app.config.abi, app.read);
  await contract.supportedTokens(); // throws if this isn't ScopePay v2
  app.contract = contract;
  app.address = address;
  const deployment = app.config.deployment;
  app.startBlock = same(address, deployment?.address) ? deployment.deployBlock : Math.max(0, (await app.read.getBlockNumber()) - 5_000_000);
  $('#footContract').href = explorer(`address/${address}`);
  $('#footSource').href = `https://repo.sourcify.dev/${app.config.network.chainId}/${address}`;
}

async function loadAll() {
  if (!app.contract || app.loading) return;
  app.loading = true;
  try {
    const [count, logs] = await Promise.all([
      app.contract.nextDealId(),
      app.read.getLogs({address: app.address, fromBlock: app.startBlock, toBlock: 'latest'}),
    ]);
    const ids = Array.from({length: Number(count)}, (_, i) => i);
    const rows = await Promise.all(ids.map(id => Promise.all([app.contract.getDeal(id), app.contract.getMilestones(id)])));
    app.deals = rows.map(([deal, milestones], id) => ({
      id,
      client: deal.client, worker: deal.worker, arbiter: deal.arbiter, token: deal.token,
      termsCommitment: deal.termsCommitment, total: deal.totalDeposited, remaining: deal.remaining,
      current: Number(deal.currentMilestone), count: Number(deal.milestoneCount), reviewWindow: Number(deal.reviewWindow),
      activeSince: Number(deal.activeSince), disputedAt: Number(deal.disputedAt), closed: deal.closed,
      milestones: milestones.map(m => ({amount: m.amount, dueAt: Number(m.dueAt), submittedAt: Number(m.submittedAt), status: STATUS[Number(m.status)], evidenceCommitment: m.evidenceCommitment})),
    }));
    app.events = new Map(app.deals.map(deal => [deal.id, []]));
    for (const log of logs) {
      let parsed;
      try { parsed = app.contract.interface.parseLog(log); } catch { continue; }
      if (!parsed) continue;
      const id = Number(parsed.args.dealId);
      app.events.get(id)?.push({name: parsed.name, args: parsed.args, block: log.blockNumber, tx: log.transactionHash, index: log.index});
    }
    for (const list of app.events.values()) list.sort((a, b) => a.block - b.block || a.index - b.index);
    $('#netBadge').classList.remove('down');
    if ($('#notice').dataset.kind === 'offline') notice('');
  } catch (error) {
    $('#netBadge').classList.add('down');
    const el = $('#notice');
    el.dataset.kind = 'offline';
    notice(`Couldn't reach Arbitrum Sepolia just now (${esc(friendly(error))}). Retrying automatically.`, true);
    throw error;
  } finally {
    app.loading = false;
  }
}

async function blockTimes(events) {
  const missing = [...new Set(events.map(e => e.block))].filter(block => !app.blockTimes.has(block));
  const blocks = await Promise.all(missing.map(block => app.read.getBlock(block)));
  blocks.forEach((block, i) => block && app.blockTimes.set(missing[i], block.timestamp));
}

// ---------- what state a deal is in, and who has to act ----------

function flow(deal) {
  let paid = 0n, returned = 0n;
  const split = new Map();
  for (const e of app.events.get(deal.id) ?? []) {
    if (e.name === 'MilestoneReleased') paid += e.args.amount;
    if (e.name === 'DisputeResolved') {
      paid += e.args.workerAmount; returned += e.args.clientAmount;
      split.set(Number(e.args.milestone), {worker: e.args.workerAmount, timedOut: e.args.arbiterTimedOut});
    }
    if (e.name === 'DealCancelled') returned += e.args.refundedAmount;
  }
  return {paid, returned, split};
}

function missedDeadlineAt(deal) {
  const m = deal.milestones[deal.current];
  return Math.max(m?.dueAt ?? 0, deal.activeSince + deal.reviewWindow);
}

function describe(deal) {
  const token = tokenOf(deal.token);
  const events = app.events.get(deal.id) ?? [];
  const n = deal.current + 1;
  if (deal.closed) {
    const resolved = events.find(e => e.name === 'DisputeResolved');
    const cancelled = events.find(e => e.name === 'DealCancelled');
    if (resolved) {
      const words = `${money(resolved.args.workerAmount, token)} to the freelancer, ${money(resolved.args.clientAmount, token)} back to the client`;
      return resolved.args.arbiterTimedOut
        ? {tag: 'Settled', tone: 'returned', title: 'Settled after the arbiter window', sentence: `The arbiter didn't decide in 14 days, so the contract settled it: ${words}.`}
        : {tag: 'Arbiter decided', tone: 'returned', title: 'Settled by the arbiter', sentence: `The arbiter split milestone ${Number(resolved.args.milestone) + 1}: ${words}.`};
    }
    if (cancelled?.args.deadlineMissed) return {tag: 'Deadline missed', tone: 'returned', title: 'Ended: a due date was missed', sentence: `Milestone ${Number(cancelled.args.milestone) + 1} wasn't delivered on time, so ${money(cancelled.args.refundedAmount, token)} went back to the client.`};
    if (cancelled) return {tag: 'Cancelled', tone: 'returned', title: 'Cancelled before work started', sentence: `${money(cancelled.args.refundedAmount, token)} went back to the client.`};
    return {tag: 'Completed', tone: 'paid', title: 'Completed', sentence: `All ${deal.count} milestone${deal.count === 1 ? '' : 's'} approved and paid: ${money(deal.total, token)} to the freelancer.`};
  }
  const m = deal.milestones[deal.current];
  if (deal.disputedAt) {
    const opened = [...events].reverse().find(e => e.name === 'DisputeOpened');
    const by = opened ? (same(opened.args.openedBy, deal.client) ? 'the client' : 'the freelancer') : 'a party';
    return {tag: 'Frozen', tone: 'frozen', waiting: 'arbiter', title: 'Frozen: waiting for the arbiter', by,
      sentence: `Frozen by ${by} on milestone ${n}. Waiting for the arbiter.`,
      clock: {label: 'Arbiter must decide within', at: deal.disputedAt + ARBITER_WINDOW, over: 'Arbiter window closed'}};
  }
  if (m.status === 'Submitted') {
    const closes = m.submittedAt + deal.reviewWindow;
    const open = nowSec() < closes;
    return {tag: open ? 'In review' : 'Claimable', tone: 'wait', waiting: open ? 'client' : 'worker', title: 'Waiting for the client\'s review',
      sentence: open ? `Milestone ${n} delivered. Client review closes ${relative(closes)}.` : `Milestone ${n} delivered and the review window has closed. The freelancer can claim it.`,
      clock: {label: 'Client review closes in', at: closes, over: 'Review window closed'}};
  }
  const deadline = missedDeadlineAt(deal);
  const overdue = nowSec() > deadline;
  return {tag: overdue ? 'Overdue' : 'In progress', tone: overdue ? 'frozen' : 'wait', waiting: overdue ? 'client' : 'worker', title: 'Waiting for delivery',
    sentence: overdue ? `Milestone ${n} is past due. The client can take back ${money(deal.remaining, token)}.` : `Waiting for milestone ${n}, due ${day(deadline)}.`,
    clock: {label: 'Delivery due in', at: deadline, over: 'Past due'}};
}

function roleIn(deal, address = app.wallet.address) {
  if (!address || !deal) return 'guest';
  if (same(address, deal.client)) return 'client';
  if (same(address, deal.worker)) return 'worker';
  if (same(address, deal.arbiter)) return 'arbiter';
  return 'viewer';
}
const ROLE_NAME = {client: 'Client', worker: 'Freelancer', arbiter: 'Arbiter', viewer: 'Not a party', guest: 'Guest'};

function nextMove(deal) {
  const token = tokenOf(deal.token);
  const state = describe(deal);
  const role = roleIn(deal);
  const n = deal.current + 1;
  const m = deal.milestones[deal.current];
  const name = milestoneName(deal, deal.current);
  const you = role in {client: 1, worker: 1, arbiter: 1} ? `Your move · ${ROLE_NAME[role]}` : 'Next step';
  const guestFine = role === 'guest'
    ? 'Connect the client, freelancer or arbiter wallet to act. Anyone can read this deal.'
    : role === 'viewer' ? "Your wallet isn't a party to this deal, so you can only watch it." : '';
  const move = {eyebrow: 'Next step', tone: state.tone === 'frozen' ? 'frozen' : 'wait', title: state.title, text: state.sentence, clock: state.clock, actions: [], fine: guestFine};

  if (deal.closed) return {...move, eyebrow: 'Outcome', tone: 'done', clock: null, fine: 'Nothing left to do. This outcome is permanent and part of the freelancer\'s record.'};

  if (deal.disputedAt) {
    const until = deal.disputedAt + ARBITER_WINDOW;
    const delivered = m.status === 'Submitted';
    if (role === 'arbiter') return {...move, eyebrow: you, title: `Decide milestone ${n}`, text: `Read both sides, then decide how much of ${name} the freelancer earned. Everything after it goes back to the client.`, actions: [{id: 'resolve', label: 'Settle the dispute', kind: 'primary'}], fine: ''};
    if ((role === 'client' || role === 'worker') && nowSec() >= until) {
      return {...move, eyebrow: you, title: 'The arbiter ran out of time',
        text: delivered ? `No decision in 14 days. Either side can settle now: ${money(m.amount / 2n, token)} to the freelancer for the delivered work, the rest back to the client.` : 'No decision in 14 days and nothing was delivered, so settling returns everything to the client.',
        actions: [{id: 'settle', label: 'Settle now', kind: 'warn'}], fine: ''};
    }
    return {...move, text: `${state.sentence} If there's no decision by ${when(until)}, either side can settle: ${delivered ? 'the delivered milestone splits 50/50' : 'undelivered work goes back to the client'}.`, fine: role === 'client' || role === 'worker' ? "You can't approve or deliver while the deal is frozen." : guestFine};
  }

  if (m.status === 'Submitted') {
    const closes = m.submittedAt + deal.reviewWindow;
    const open = nowSec() < closes;
    if (role === 'client') return {...move, eyebrow: you, title: `Review ${name}`, text: open ? `Approve to pay ${money(m.amount, token)}, or freeze the deal if it doesn't match what you agreed. If you do nothing, the freelancer can claim it when the window closes.` : 'Your review window has closed, so the freelancer can claim this payment at any moment. You can still approve it or open a dispute first.',
      actions: [{id: 'approve', label: `Approve and pay ${money(m.amount, token)}`, kind: 'primary'}, {id: 'dispute', label: 'Open a dispute', kind: 'ghost'}], fine: ''};
    if (role === 'worker') {
      if (!open) return {...move, eyebrow: you, title: `Claim ${money(m.amount, token)}`, text: "The client didn't approve or dispute within the review window, so this payment is yours to claim.", actions: [{id: 'claim', label: `Claim ${money(m.amount, token)}`, kind: 'primary'}], fine: ''};
      return {...move, eyebrow: you, title: 'Waiting for the client\'s review', text: `If the client doesn't respond by ${when(closes)}, you can claim ${money(m.amount, token)} yourself.`, actions: [{id: 'dispute', label: 'Open a dispute', kind: 'ghost'}], fine: ''};
    }
    return move;
  }

  const deadline = missedDeadlineAt(deal);
  const overdue = nowSec() > deadline;
  if (role === 'worker') return {...move, eyebrow: you, title: `Deliver ${name}`, text: overdue ? 'This milestone is past due. You can still deliver until the client decides to take the money back.' : `Due ${when(deadline)}. Submit a link or note; only its hash goes on-chain.`,
    actions: [{id: 'submit', label: 'Submit delivery', kind: 'primary'}, {id: 'dispute', label: 'Open a dispute', kind: 'ghost'}], fine: ''};
  if (role === 'client') {
    if (overdue) return {...move, eyebrow: you, title: `Take back ${money(deal.remaining, token)}`, text: `Milestone ${n} wasn't delivered by its due date. You can end the deal and recover everything still in escrow.`,
      actions: [{id: 'reclaim', label: `Reclaim ${money(deal.remaining, token)}`, kind: 'warn'}, {id: 'dispute', label: 'Open a dispute instead', kind: 'ghost'}], fine: ''};
    const actions = [];
    if (deal.current === 0) actions.push({id: 'cancel', label: 'Cancel and refund', kind: 'ghost'});
    actions.push({id: 'dispute', label: 'Open a dispute', kind: 'ghost'});
    return {...move, eyebrow: you, title: 'Waiting for delivery', text: `${name} is due ${when(deadline)}. If it doesn't arrive, you can take back everything still in escrow.`, actions, fine: deal.current === 0 ? 'You can cancel for a full refund until the freelancer submits the first milestone.' : ''};
  }
  return move;
}

function milestoneName(deal, index) {
  const terms = knownTerms(deal);
  return terms?.milestones?.[index]?.name || `milestone ${index + 1}`;
}

// ---------- rendering ----------

function render() {
  renderList();
  const deal = app.deals.find(d => d.id === app.selected);
  if (deal) renderDeal(deal);
  renderWallet();
  app.lastRender = Date.now();
}

function renderWallet() {
  const button = $('#walletButton');
  if (!app.wallet.address) { button.textContent = 'Connect wallet'; return; }
  const deal = app.deals.find(d => d.id === app.selected);
  const role = roleIn(deal);
  const label = role === 'guest' || role === 'viewer' ? 'viewer' : role;
  button.innerHTML = `<span class="addr">${short(app.wallet.address)}</span>${deal ? `<span class="role ${label === 'viewer' ? 'viewer' : ''}">${esc(ROLE_NAME[role === 'guest' ? 'viewer' : role])}</span>` : ''}`;
}

function renderList() {
  const body = $('#dealRows');
  $('#mineToggleWrap').classList.toggle('hidden', !app.wallet.address);
  let deals = [...app.deals].reverse();
  if (app.mineOnly && app.wallet.address) deals = deals.filter(d => roleIn(d) !== 'viewer');
  if (!deals.length) {
    body.innerHTML = `<tr><td colspan="4" class="stand">${app.deals.length ? 'None of these deals include your wallet yet.' : 'No deals on this contract yet. Start the first one.'}</td></tr>`;
    return;
  }
  body.innerHTML = deals.map(deal => {
    const token = tokenOf(deal.token);
    const state = describe(deal);
    const terms = knownTerms(deal);
    const role = roleIn(deal);
    const you = role in {client: 1, worker: 1, arbiter: 1} ? `<span class="you">You: ${ROLE_NAME[role]}</span>` : '';
    return `<tr data-deal="${deal.id}" class="${deal.id === app.selected ? 'selected' : ''}" tabindex="0">
      <td class="id">#${deal.id}</td>
      <td><span class="name">${esc(terms?.title ?? `Deal #${deal.id}`)}</span>${you}<span class="sub">${deal.count} milestone${deal.count === 1 ? '' : 's'} · ${short(deal.client)} → ${short(deal.worker)}</span></td>
      <td class="num">${money(deal.total, token)}</td>
      <td class="stand"><span class="state ${state.tone}">${esc(state.tag)}</span>${esc(state.sentence)}</td>
    </tr>`;
  }).join('');
}

function renderDeal(deal) {
  const token = tokenOf(deal.token);
  const terms = knownTerms(deal);
  const evidence = knownEvidence(deal, deal.milestones);
  const {paid, returned, split} = flow(deal);
  const state = describe(deal);
  const role = roleIn(deal);

  $('#dealEyebrow').textContent = `Deal #${deal.id} · ${token.symbol} · ${state.tag}`;
  $('#dealTitle').textContent = terms?.title ?? `Deal #${deal.id}`;
  $('#dealParties').innerHTML = `<b>Client</b> <span class="addr">${short(deal.client)}</span> pays <b>freelancer</b> <span class="addr">${short(deal.worker)}</span>. <b>Arbiter</b> <span class="addr">${short(deal.arbiter)}</span> decides disputes.`;
  $('#dealExplorer').href = explorer(`address/${app.address}`);

  $('#mFunded').innerHTML = `${amount(deal.total, token)}<small>${token.symbol}</small>`;
  $('#mPaid').innerHTML = `${amount(paid, token)}<small>${token.symbol}</small>`;
  $('#mReturned').innerHTML = `${amount(returned, token)}<small>${token.symbol}</small>`;
  $('#mEscrow').innerHTML = `${amount(deal.remaining, token)}<small>${token.symbol}</small>`;
  const pct = value => (deal.total ? Number((value * 10000n) / deal.total) / 100 : 0);
  $('#barPaid').style.width = `${pct(paid)}%`;
  $('#barReturned').style.width = `${pct(returned)}%`;
  $('#barEscrow').style.width = `${pct(deal.remaining)}%`;

  const paidCount = deal.milestones.filter(m => m.status === 'Released').length;
  $('#milestoneSummary').textContent = `${paidCount} of ${deal.count} paid · review window ${duration(deal.reviewWindow)}`;
  $('#milestones').innerHTML = deal.milestones.map((m, i) => {
    const current = !deal.closed && i === deal.current;
    const name = terms?.milestones?.[i]?.name ?? `Milestone ${i + 1}`;
    let tag, tone = '';
    const s = split.get(i);
    if (m.status === 'Released' && s) { tag = `Split · ${amount(s.worker, token)} paid · ${amount(m.amount - s.worker, token)} returned`; tone = 'returned'; }
    else if (m.status === 'Released') {
      const release = (app.events.get(deal.id) ?? []).find(e => e.name === 'MilestoneReleased' && Number(e.args.milestone) === i);
      tag = release?.args.afterReviewWindow ? 'Paid · claimed after review window' : 'Paid on approval'; tone = 'paid';
    }
    else if (m.status === 'Refunded' || (deal.closed && m.status === 'Pending')) { tag = s ? 'Returned to client' : 'Returned to client'; tone = 'returned'; }
    else if (current && deal.disputedAt) { tag = 'Frozen'; tone = 'frozen'; }
    else if (m.status === 'Submitted') { tag = nowSec() < m.submittedAt + deal.reviewWindow ? 'In review' : 'Claimable'; tone = 'wait'; }
    else if (current) { tag = nowSec() > missedDeadlineAt(deal) ? 'Overdue' : 'In progress'; tone = nowSec() > missedDeadlineAt(deal) ? 'frozen' : 'wait'; }
    else tag = 'Not started';

    let proof = '';
    if (evidence.has(i)) {
      const text = evidence.get(i);
      let shown = esc(text.slice(0, 200));
      try { const url = new URL(text); if (/^https?:$/.test(url.protocol)) shown = `<a href="${esc(url.href)}" target="_blank" rel="noreferrer">${esc(url.host + url.pathname).slice(0, 90)} ↗</a>`; } catch { /* plain note */ }
      proof = `<p class="evidence"><b>✓ Matches on-chain hash</b>${shown}</p>`;
    } else if (m.evidenceCommitment && m.evidenceCommitment !== ethers.ZeroHash) {
      proof = `<p class="evidence hidden-text"><b>Delivery hash</b><span class="addr">${short(m.evidenceCommitment)}</span> · the freelancer can reveal it with a proof link</p>`;
    }
    const dueLine = m.status === 'Submitted' || m.status === 'Released'
      ? `Due ${day(m.dueAt)}${m.submittedAt ? ` · delivered ${when(m.submittedAt)}${m.submittedAt > m.dueAt ? ' (late)' : ''}` : ''}`
      : `Due ${day(m.dueAt)}`;
    return `<li class="milestone ${m.status.toLowerCase()} ${current ? 'current' : ''} ${current && deal.disputedAt ? 'frozen' : ''}">
      <span class="n">${String(i + 1).padStart(2, '0')}</span>
      <div><h4>${esc(name)}</h4><p class="due">${dueLine}</p>${proof}</div>
      <div class="amount">${amount(m.amount, token)}<small>${token.symbol}</small><span class="state ${tone}">${esc(tag)}</span></div>
    </li>`;
  }).join('');

  renderHistory(deal, token, evidence);
  renderMove(deal);

  $('#tClient').innerHTML = `<a class="addr" href="${explorer(`address/${deal.client}`)}" target="_blank" rel="noreferrer">${short(deal.client)}</a>`;
  $('#tWorker').innerHTML = `<a class="addr" href="${explorer(`address/${deal.worker}`)}" target="_blank" rel="noreferrer">${short(deal.worker)}</a>`;
  $('#tArbiter').innerHTML = `<a class="addr" href="${explorer(`address/${deal.arbiter}`)}" target="_blank" rel="noreferrer">${short(deal.arbiter)}</a>`;
  $('#tToken').innerHTML = `<a href="${explorer(`token/${token.address}`)}" target="_blank" rel="noreferrer">${esc(token.symbol)}</a>`;
  $('#tWindow').textContent = duration(deal.reviewWindow);
  $('#tRole').textContent = ROLE_NAME[role];
  $('#tHash').textContent = short(deal.termsCommitment);
  $('#termsTag').textContent = terms ? 'Verified' : 'Hash only';
  $('#termsTag').classList.toggle('ok', !!terms);
  $('#termsNote').textContent = terms
    ? 'The readable terms above match the hash the client locked on-chain.'
    : 'Only the hash of the terms is public. Whoever holds the terms can prove them with a share link.';
}

function renderHistory(deal, token, evidence) {
  const events = app.events.get(deal.id) ?? [];
  const who = address => (same(address, deal.client) ? 'Client' : same(address, deal.worker) ? 'Freelancer' : 'Someone');
  const items = events.map(e => {
    const i = e.args.milestone !== undefined ? Number(e.args.milestone) + 1 : 0;
    let what = '', tone = '';
    switch (e.name) {
      case 'DealCreated': what = `Client locked ${money(e.args.value, token)} for ${deal.count} milestone${deal.count === 1 ? '' : 's'}`; break;
      case 'MilestoneSubmitted': what = `Freelancer delivered milestone ${i}${evidence.has(i - 1) ? '' : ' (hash committed)'}`; break;
      case 'MilestoneReleased': tone = 'paid'; what = e.args.afterReviewWindow ? `Freelancer claimed ${money(e.args.amount, token)} for milestone ${i} after the review window closed` : `Client approved milestone ${i}: ${money(e.args.amount, token)} paid`; break;
      case 'DisputeOpened': tone = 'frozen'; what = `${who(e.args.openedBy)} froze the deal on milestone ${i}`; break;
      case 'DisputeResolved': tone = 'returned'; what = `${e.args.arbiterTimedOut ? 'Arbiter window closed; contract settled' : 'Arbiter settled'} milestone ${i}: ${money(e.args.workerAmount, token)} to the freelancer, ${money(e.args.clientAmount, token)} back to the client`; break;
      case 'DealCancelled': tone = 'returned'; what = e.args.deadlineMissed ? `Client reclaimed ${money(e.args.refundedAmount, token)} after milestone ${i} missed its due date` : `Client cancelled before any delivery: ${money(e.args.refundedAmount, token)} returned`; break;
      default: what = e.name;
    }
    const ts = app.blockTimes.get(e.block);
    return `<li class="${tone}"><span class="what">${esc(what)}</span><span class="meta">${ts ? when(ts) : `Block ${e.block}`} · <a href="${explorer(`tx/${e.tx}`)}" target="_blank" rel="noreferrer">${short(e.tx)} ↗</a></span></li>`;
  });
  $('#history').innerHTML = items.length ? items.reverse().join('') : '<li><span class="meta">No events yet.</span></li>';
  const missing = events.filter(e => !app.blockTimes.has(e.block));
  if (missing.length) blockTimes(missing).then(() => { if (app.selected === deal.id) renderHistory(deal, token, evidence); }).catch(() => {});
}

function renderMove(deal) {
  const move = nextMove(deal);
  const card = $('#moveCard');
  card.classList.toggle('done', move.tone === 'done');
  card.classList.toggle('frozen', move.tone === 'frozen');
  $('#moveEyebrow').textContent = move.eyebrow;
  $('#moveTitle').textContent = move.title;
  $('#moveText').textContent = move.text;
  $('#moveFine').textContent = move.fine;
  const clock = $('#moveClock');
  clock.classList.toggle('hidden', !move.clock);
  clock.dataset.at = move.clock?.at ?? '';
  clock.dataset.label = move.clock?.label ?? '';
  clock.dataset.over = move.clock?.over ?? '';
  tickClock();
  const actions = $('#moveActions');
  actions.innerHTML = move.actions.map(a => `<button class="btn ${a.kind} wide" type="button" data-action="${a.id}" ${app.busy ? 'disabled' : ''}>${esc(a.label)}</button>`).join('');
}

function tickClock() {
  const clock = $('#moveClock');
  const at = Number(clock.dataset.at);
  if (!at) return;
  const left = at - nowSec();
  clock.classList.toggle('over', left <= 0);
  $('#clockLabel').textContent = left > 0 ? clock.dataset.label : clock.dataset.over;
  $('#clockValue').textContent = left > 0 ? countdown(left) : `since ${when(at)}`;
  // When a clock runs out the available actions change, so redraw once.
  if (left <= 0 && left > -2 && Date.now() - app.lastRender > 1500) render();
}

// ---------- work record ----------

async function openRecord(worker, scroll = true) {
  if (!ethers.isAddress(worker || '')) return toast('Open a deal first to see its freelancer.', true);
  app.recordWorker = ethers.getAddress(worker);
  const section = $('#record');
  section.classList.remove('hidden');
  $('#recordAddress').textContent = app.recordWorker;
  $('#recordList').innerHTML = '<li><span class="how">Reading the contract…</span></li>';
  setUrl({worker: app.recordWorker});
  if (scroll) section.scrollIntoView({behavior: 'smooth', block: 'start'});
  renderRecord();
}

function renderRecord() {
  if (!app.recordWorker) return;
  const deals = app.deals.filter(d => same(d.worker, app.recordWorker)).reverse();
  const paidByToken = new Map();
  let milestonesPaid = 0, disputes = 0;
  const rows = deals.map(deal => {
    const token = tokenOf(deal.token);
    const events = app.events.get(deal.id) ?? [];
    const {paid} = flow(deal);
    paidByToken.set(token.symbol, (paidByToken.get(token.symbol) ?? 0n) + paid);
    const released = events.filter(e => e.name === 'MilestoneReleased');
    const awarded = events.filter(e => e.name === 'DisputeResolved' && e.args.workerAmount > 0n);
    milestonesPaid += released.length + awarded.length;
    if (events.some(e => e.name === 'DisputeOpened')) disputes += 1;
    const claimed = released.filter(e => e.args.afterReviewWindow).length;
    const last = [...events].reverse().find(e => ['MilestoneReleased', 'DisputeResolved', 'DealCancelled'].includes(e.name)) ?? events[0];
    const state = describe(deal);
    const terms = knownTerms(deal);
    const how = [`${released.length + awarded.length} of ${deal.count} milestones paid`, claimed ? `${claimed} claimed after the client went quiet` : '', state.tag].filter(Boolean).join(' · ');
    return `<li><div><span class="what">${esc(terms?.title ?? `Deal #${deal.id}`)} <span class="addr" style="color:var(--faint)">#${deal.id}</span></span>
      <div class="how">Client ${short(deal.client)} · ${esc(how)}</div>
      <div class="links"><a href="?deal=${deal.id}" data-open-deal="${deal.id}">Open deal</a>${last ? `<a href="${explorer(`tx/${last.tx}`)}" target="_blank" rel="noreferrer">Latest settlement ↗</a>` : ''}</div></div>
      <div class="amt">${amount(paid, token)}<small>${token.symbol} paid</small></div></li>`;
  });
  const totals = [...paidByToken].filter(([, v]) => v > 0n).map(([symbol, v]) => `${amount(v, tokenOf(app.config.tokens.find(t => t.symbol === symbol)?.address))} ${symbol}`);
  $('#rPaid').textContent = totals.length ? totals.join(' + ') : '0.00';
  $('#rMilestones').textContent = milestonesPaid;
  $('#rDeals').textContent = deals.length;
  $('#rDisputes').textContent = disputes;
  $('#recordList').innerHTML = rows.length ? rows.join('') : '<li><span class="how">No ScopePay deals for this wallet on this contract yet.</span></li>';
}

// ---------- selecting deals and URLs ----------

function setUrl(params) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  history.replaceState(null, '', url);
}

function selectDeal(id, {scroll = false} = {}) {
  const deal = app.deals.find(d => d.id === Number(id));
  if (!deal) return false;
  app.selected = deal.id;
  setUrl({deal: deal.id, proof: app.importedProof?.deal === String(deal.id) ? new URL(location.href).searchParams.get('proof') : null});
  render();
  if (scroll) $('#deal').scrollIntoView({behavior: 'smooth', block: 'start'});
  return true;
}

// ---------- wallet ----------

async function ensureNetwork() {
  const target = app.config.network.chainHex.toLowerCase();
  const current = String(await window.ethereum.request({method: 'eth_chainId'})).toLowerCase();
  if (current === target) return;
  try {
    await window.ethereum.request({method: 'wallet_switchEthereumChain', params: [{chainId: target}]});
  } catch (error) {
    const code = Number(error?.code ?? error?.data?.originalError?.code);
    const unknown = code === 4902 || /unrecognized|unknown chain|not added|add.+chain/i.test(String(error?.message));
    if (!unknown) throw error;
    await window.ethereum.request({method: 'wallet_addEthereumChain', params: [{chainId: target, chainName: 'Arbitrum Sepolia', nativeCurrency: {name: 'Sepolia Ether', symbol: 'ETH', decimals: 18}, rpcUrls: [app.config.network.rpc], blockExplorerUrls: [app.config.network.explorer]}]});
  }
  const confirmed = String(await window.ethereum.request({method: 'eth_chainId'})).toLowerCase();
  if (confirmed !== target) throw new Error('Switch your wallet to Arbitrum Sepolia, then try again.');
}

async function connectWallet() {
  if (!window.ethereum) { toast('No wallet found. Install MetaMask or Rabby, or keep browsing read-only.', true); return false; }
  try {
    const accounts = await window.ethereum.request({method: 'eth_requestAccounts'});
    await ensureNetwork();
    await useAccount(accounts[0]);
    toast(`Connected as ${ROLE_NAME[roleIn(app.deals.find(d => d.id === app.selected))].toLowerCase()}`);
    return true;
  } catch (error) {
    toast(friendly(error), true);
    return false;
  }
}

async function useAccount(address) {
  if (!address) {
    app.wallet = {provider: null, signer: null, address: null};
  } else {
    const provider = new ethers.BrowserProvider(window.ethereum);
    app.wallet = {provider, signer: await provider.getSigner(address), address: ethers.getAddress(address)};
  }
  render();
}

function watchWallet() {
  if (!window.ethereum?.on) return;
  window.ethereum.on('accountsChanged', accounts => {
    if (!app.wallet.address && !accounts?.length) return;
    useAccount(accounts?.[0]).then(() => {
      const deal = app.deals.find(d => d.id === app.selected);
      toast(accounts?.length ? `Switched to ${short(accounts[0])} · ${ROLE_NAME[roleIn(deal)]}` : 'Wallet disconnected. Browsing read-only.');
    });
  });
  window.ethereum.on('chainChanged', chainId => {
    if (String(chainId).toLowerCase() !== app.config.network.chainHex.toLowerCase() && app.wallet.address) {
      app.wallet = {provider: null, signer: null, address: null};
      render();
      toast('Your wallet left Arbitrum Sepolia. Reconnect to sign.', true);
    }
  });
}

async function requireWallet(expectedRole, deal) {
  if (!app.wallet.signer && !(await connectWallet())) return false;
  await ensureNetwork();
  if (expectedRole && deal && roleIn(deal) !== expectedRole) {
    toast(`Switch to the ${ROLE_NAME[expectedRole].toLowerCase()} wallet (${short(deal[expectedRole === 'worker' ? 'worker' : expectedRole])}) to do this.`, true);
    return false;
  }
  return true;
}

// ---------- transactions ----------

function txSteps(steps) {
  const el = $('#txStatus');
  el.classList.remove('hidden');
  el.innerHTML = `<ol>${steps.map(s => `<li class="${s.state}">${s.html}</li>`).join('')}</ol>`;
}

async function runTx(label, sends) {
  if (app.busy) return false;
  app.busy = true;
  document.querySelectorAll('[data-action], .sheet .btn.primary, .sheet .btn.danger').forEach(b => { b.disabled = true; });
  const steps = [];
  const show = () => txSteps(steps);
  try {
    for (const [i, send] of sends.entries()) {
      const step = {state: 'now', html: `${esc(send.label)}: confirm in your wallet`};
      steps.push(step); show();
      const tx = await send.run();
      step.html = `${esc(send.label)}: confirming on Arbitrum <a href="${explorer(`tx/${tx.hash}`)}" target="_blank" rel="noreferrer">${short(tx.hash)} ↗</a>`; show();
      const receipt = await tx.wait();
      step.state = 'ok';
      step.html = `${esc(send.label)} <a href="${explorer(`tx/${tx.hash}`)}" target="_blank" rel="noreferrer">${short(tx.hash)} ↗</a>`; show();
      send.receipt = receipt;
      if (i === sends.length - 1) steps.push({state: 'now', html: 'Reading the new state from the contract…'}), show();
    }
    await loadAll();
    steps.at(-1).state = 'ok';
    steps.at(-1).html = `${esc(label)}: done`;
    show();
    toast(`${label}: confirmed on Arbitrum`);
    return sends.at(-1).receipt;
  } catch (error) {
    const message = friendly(error);
    steps.push({state: 'bad', html: esc(message)}); show();
    toast(message, true);
    if (/changed before/.test(message)) await loadAll().catch(() => {});
    return false;
  } finally {
    app.busy = false;
    render();
    document.querySelectorAll('.sheet .btn').forEach(b => { b.disabled = false; });
    setTimeout(() => { if (!app.busy) $('#txStatus').classList.add('hidden'); }, 9000);
  }
}

const signed = () => app.contract.connect(app.wallet.signer);

async function handleAction(id) {
  const deal = app.deals.find(d => d.id === app.selected);
  if (!deal) return;
  const token = tokenOf(deal.token);
  const m = deal.milestones[deal.current];
  const name = milestoneName(deal, deal.current);
  if (id === 'approve') {
    if (!(await requireWallet('client', deal))) return;
    $('#adAmount').textContent = money(m.amount, token);
    $('#adName').textContent = name;
    $('#approveDialog').showModal();
  } else if (id === 'submit') {
    if (!(await requireWallet('worker', deal))) return;
    $('#sdName').textContent = name;
    $('#submitDialog').showModal();
  } else if (id === 'dispute') {
    const role = roleIn(deal);
    if (!(await requireWallet(role === 'worker' ? 'worker' : 'client', deal))) return;
    $('#disputeDialog').showModal();
  } else if (id === 'resolve') {
    if (!(await requireWallet('arbiter', deal))) return;
    $('#rdIndex').textContent = deal.current + 1;
    $('#rdMax').textContent = money(m.amount, token);
    $('#rdAmount').value = '0';
    updateSplit();
    $('#resolveDialog').showModal();
  } else if (id === 'claim') {
    if (!(await requireWallet('worker', deal))) return;
    await runTx('Payment claimed', [{label: `Claim ${money(m.amount, token)}`, run: () => signed().claimAfterReviewWindow(deal.id)}]);
  } else if (id === 'reclaim') {
    if (!(await requireWallet('client', deal))) return;
    await runTx('Funds reclaimed', [{label: `Reclaim ${money(deal.remaining, token)}`, run: () => signed().reclaimAfterMissedDeadline(deal.id)}]);
  } else if (id === 'cancel') {
    if (!(await requireWallet('client', deal))) return;
    await runTx('Deal cancelled', [{label: `Cancel and refund ${money(deal.remaining, token)}`, run: () => signed().cancelUnstarted(deal.id)}]);
  } else if (id === 'settle') {
    const role = roleIn(deal);
    if (!(await requireWallet(role === 'worker' ? 'worker' : 'client', deal))) return;
    await runTx('Dispute settled', [{label: 'Settle after the arbiter window', run: () => signed().settleAfterArbiterWindow(deal.id)}]);
  }
}

async function confirmApprove() {
  const deal = app.deals.find(d => d.id === app.selected);
  const m = deal.milestones[deal.current];
  $('#approveDialog').close();
  await runTx('Payment released', [{label: `Release ${money(m.amount, tokenOf(deal.token))}`, run: () => signed().approveMilestone(deal.id, deal.current)}]);
}

async function confirmSubmit() {
  const deal = app.deals.find(d => d.id === app.selected);
  const text = $('#sdText').value.trim();
  if (text.length < 8) return toast('Add a link or a short note about what you delivered.', true);
  const index = deal.current;
  $('#submitDialog').close();
  const ok = await runTx('Delivery submitted', [{label: `Commit delivery for milestone ${index + 1}`, run: () => signed().submitMilestone(deal.id, index, hashText(text))}]);
  if (ok) {
    const list = store.get(evidenceKey(deal.id), []).filter(item => Number(item.milestone) !== index);
    store.set(evidenceKey(deal.id), [...list, {milestone: index, text}]);
    $('#sdText').value = '';
    render();
  }
}

async function confirmDispute() {
  const deal = app.deals.find(d => d.id === app.selected);
  const text = $('#ddText').value.trim();
  if (text.length < 8) return toast('Say what doesn\'t match the agreement, in a sentence or two.', true);
  $('#disputeDialog').close();
  const ok = await runTx('Deal frozen', [{label: 'Open the dispute', run: () => signed().openDispute(deal.id, hashText(text))}]);
  if (ok) $('#ddText').value = '';
}

function updateSplit() {
  const deal = app.deals.find(d => d.id === app.selected);
  if (!deal) return;
  const token = tokenOf(deal.token);
  const max = deal.milestones[deal.current].amount;
  let award;
  try { award = ethers.parseUnits($('#rdAmount').value.trim() || '0', token.decimals); } catch { award = -1n; }
  $('#rdSplit').textContent = award < 0n || award > max
    ? `Enter an amount between 0 and ${amount(max, token)}.`
    : `Freelancer gets ${money(award, token)} · client gets ${money(deal.remaining - award, token)} back`;
}

async function confirmResolve() {
  const deal = app.deals.find(d => d.id === app.selected);
  const token = tokenOf(deal.token);
  let award;
  try { award = ethers.parseUnits($('#rdAmount').value.trim() || '0', token.decimals); } catch { return toast('Enter a number, like 5 or 12.50.', true); }
  if (award < 0n || award > deal.milestones[deal.current].amount) return toast(`The award must be between 0 and ${money(deal.milestones[deal.current].amount, token)}.`, true);
  $('#resolveDialog').close();
  await runTx('Dispute settled', [{label: `Award ${money(award, token)} to the freelancer`, run: () => signed().resolveDispute(deal.id, award)}]);
}

// ---------- new deal ----------

const DEFAULT_MILESTONES = [['Design direction', '10', 3], ['Working build', '25', 7], ['Launch and handoff', '15', 10]];

function milestoneRow([name, value, days]) {
  const row = document.createElement('div');
  row.className = 'ms-row';
  row.innerHTML = `<label>Milestone<input class="ms-name" maxlength="120" value="${esc(name)}"></label>
    <label>Amount<input class="ms-amount" inputmode="decimal" value="${esc(value)}"></label>
    <label class="due-in">Due in (days)<input class="ms-days" inputmode="numeric" value="${esc(days)}"></label>
    <button class="remove" type="button" title="Remove milestone" aria-label="Remove milestone">×</button>`;
  row.querySelector('.remove').onclick = () => { if ($('#ndMilestones').children.length > 1) { row.remove(); updateSum(); } };
  row.querySelectorAll('input').forEach(input => { input.oninput = updateSum; });
  return row;
}

function updateSum() {
  const token = tokenOf($('#ndToken').value);
  let total = 0n, ok = true;
  for (const input of document.querySelectorAll('.ms-amount')) {
    try { const v = ethers.parseUnits(input.value.trim() || '0', token.decimals); if (v <= 0n) ok = false; total += v; } catch { ok = false; }
  }
  const balance = app.newDealBalances?.[token.address.toLowerCase()];
  $('#ndSum').textContent = ok
    ? `Locks ${money(total, token)} now${balance !== undefined ? ` · your wallet has ${money(balance, token)}` : ''}`
    : 'Each milestone needs an amount above zero.';
}

async function openNewDeal() {
  if (!app.contract) return toast('The contract is still loading.', true);
  if (!(await connectWallet())) return;
  const select = $('#ndToken');
  const previous = select.value;
  select.innerHTML = app.config.tokens.map(t => `<option value="${t.address}">${t.symbol} · ${esc(t.name)}</option>`).join('');
  if (previous) select.value = previous;
  const rows = $('#ndMilestones');
  if (!rows.children.length) DEFAULT_MILESTONES.forEach(item => rows.append(milestoneRow(item)));
  $('#newDealDialog').showModal();
  app.newDealBalances = {};
  updateSum();
  await Promise.all(app.config.tokens.map(async t => {
    try { app.newDealBalances[t.address.toLowerCase()] = await new ethers.Contract(t.address, ERC20, app.read).balanceOf(app.wallet.address); } catch { /* shown without balance */ }
  }));
  const withFunds = app.config.tokens.find(t => (app.newDealBalances[t.address.toLowerCase()] ?? 0n) > 0n);
  if (!previous && withFunds) select.value = withFunds.address;
  updateSum();
}

async function createDeal() {
  const token = tokenOf($('#ndToken').value);
  const worker = $('#ndWorker').value.trim(), arbiter = $('#ndArbiter').value.trim(), title = $('#ndTitle').value.trim();
  if (!title) return toast('Give the work a short title.', true);
  if (!ethers.isAddress(worker) || !ethers.isAddress(arbiter)) return toast('Paste valid wallet addresses for the freelancer and the arbiter.', true);
  const rows = [...document.querySelectorAll('.ms-row')];
  const now = nowSec();
  const milestones = [], amounts = [], dueDates = [];
  for (const row of rows) {
    const name = row.querySelector('.ms-name').value.trim();
    let value;
    try { value = ethers.parseUnits(row.querySelector('.ms-amount').value.trim(), token.decimals); } catch { return toast('Amounts must be numbers, like 10 or 12.50.', true); }
    const days = Number(row.querySelector('.ms-days').value);
    if (!name || value <= 0n || !(days > 0)) return toast('Every milestone needs a name, an amount and a due date in days.', true);
    milestones.push({name, amount: ethers.formatUnits(value, token.decimals)});
    amounts.push(value);
    dueDates.push(now + Math.round(days * 86400));
  }
  if (dueDates.some((due, i) => i && due <= dueDates[i - 1])) return toast('Each due date must be later than the one before it.', true);
  const total = amounts.reduce((a, b) => a + b, 0n);
  const terms = {v: 2, title, token: token.symbol, milestones};
  const erc20 = new ethers.Contract(token.address, ERC20, app.wallet.signer);
  const balance = await erc20.balanceOf(app.wallet.address).catch(() => 0n);
  if (balance < total) return toast(`You need ${money(total, token)} but this wallet has ${money(balance, token)}. Get test ${token.symbol} from ${token.faucet.replace('https://', '')}.`, true);
  const allowance = await erc20.allowance(app.wallet.address, app.address).catch(() => 0n);
  $('#newDealDialog').close();
  const sends = [];
  if (allowance < total) sends.push({label: `Allow ScopePay to lock ${money(total, token)}`, run: () => erc20.approve(app.address, total)});
  sends.push({label: `Lock ${money(total, token)} in escrow`, run: () => signed().createDeal(token.address, worker, arbiter, amounts, dueDates, Number($('#ndWindow').value), termsHash(terms))});
  const receipt = await runTx('Deal funded', sends);
  if (!receipt) return;
  const created = receipt.logs.map(log => { try { return app.contract.interface.parseLog(log); } catch { return null; } }).find(log => log?.name === 'DealCreated');
  if (created) {
    const id = Number(created.args.dealId);
    store.set(termsKey(id), terms);
    selectDeal(id, {scroll: true});
  }
}

// ---------- sharing ----------

function share(title, text, link) {
  $('#shTitle').textContent = title;
  $('#shText').textContent = text;
  $('#shLink').value = link;
  $('#shareDialog').showModal();
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const area = Object.assign(document.createElement('textarea'), {value: text});
    area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.append(area); area.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* manual copy */ }
    area.remove(); return ok;
  }
}
function baseUrl() {
  const url = new URL(location.origin + location.pathname);
  const override = new URL(location.href).searchParams.get('contract');
  if (override) url.searchParams.set('contract', override);
  return url;
}

// ---------- agent tools (WebMCP, where supported) ----------

function registerAgentTools() {
  if (!document.modelContext?.registerTool) return;
  const summary = deal => {
    const token = tokenOf(deal.token), state = describe(deal);
    return {deal: deal.id, token: token.symbol, locked: amount(deal.total, token), inEscrow: amount(deal.remaining, token), status: state.tag, summary: state.sentence, waitingOn: state.waiting ?? null, client: deal.client, freelancer: deal.worker, arbiter: deal.arbiter};
  };
  const tools = [
    {name: 'list_scopepay_deals', title: 'List ScopePay deals', description: 'Every deal on the ScopePay contract with its status, read from Arbitrum.', inputSchema: {type: 'object', properties: {}, additionalProperties: false}, annotations: {readOnlyHint: true}, execute: async () => app.deals.map(summary)},
    {name: 'read_scopepay_deal', title: 'Read a ScopePay deal', description: 'Status, amounts and who must act next for one deal.', inputSchema: {type: 'object', properties: {deal: {type: 'number'}}, required: ['deal'], additionalProperties: false}, annotations: {readOnlyHint: true}, execute: async ({deal}) => { const d = app.deals.find(x => x.id === Number(deal)); return d ? summary(d) : {error: 'No such deal'}; }},
  ];
  for (const tool of tools) Promise.resolve(document.modelContext.registerTool(tool)).catch(() => {});
}

// ---------- start ----------

function wire() {
  $('#walletButton').onclick = () => (app.wallet.address ? toast(`Connected as ${short(app.wallet.address)}. Switch accounts in your wallet to change role.`) : connectWallet());
  $('#newDealButton').onclick = openNewDeal;
  $('#ndAdd').onclick = () => { if ($('#ndMilestones').children.length < 12) { const n = $('#ndMilestones').children.length; $('#ndMilestones').append(milestoneRow([`Milestone ${n + 1}`, '10', 3 * (n + 1) + 1])); updateSum(); } };
  $('#ndToken').onchange = updateSum;
  $('#ndSubmit').onclick = createDeal;
  $('#adSubmit').onclick = confirmApprove;
  $('#sdSubmit').onclick = confirmSubmit;
  $('#ddSubmit').onclick = confirmDispute;
  $('#rdSubmit').onclick = confirmResolve;
  $('#rdAmount').oninput = updateSplit;
  $('#rdQuick').onclick = event => {
    const share = event.target.dataset?.share; if (share === undefined) return;
    const deal = app.deals.find(d => d.id === app.selected); const token = tokenOf(deal.token);
    $('#rdAmount').value = ethers.formatUnits((deal.milestones[deal.current].amount * BigInt(share)) / 100n, token.decimals);
    updateSplit();
  };
  $('#moveActions').onclick = event => { const id = event.target.closest('[data-action]')?.dataset.action; if (id) handleAction(id); };
  $('#dealRows').onclick = event => { const row = event.target.closest('[data-deal]'); if (row) selectDeal(row.dataset.deal, {scroll: true}); };
  $('#dealRows').onkeydown = event => { const row = event.target.closest('[data-deal]'); if (row && event.key === 'Enter') selectDeal(row.dataset.deal, {scroll: true}); };
  $('#mineToggle').onchange = event => { app.mineOnly = event.target.checked; renderList(); };
  $('#loadDealButton').onclick = () => $('#openDialog').showModal();
  $('#odSubmit').onclick = () => {
    const id = $('#odId').value.trim();
    if (!/^\d+$/.test(id) || !selectDeal(id, {scroll: true})) return toast(`There's no deal #${id} on this contract. The newest is #${app.deals.length - 1}.`, true);
    $('#openDialog').close();
  };
  $('#openWorkerRecord').onclick = () => openRecord(app.deals.find(d => d.id === app.selected)?.worker);
  $('#recordList').onclick = event => { const link = event.target.closest('[data-open-deal]'); if (link) { event.preventDefault(); selectDeal(link.dataset.openDeal, {scroll: true}); } };
  $('#copyRecordLink').onclick = async () => {
    const url = baseUrl(); url.searchParams.set('worker', app.recordWorker);
    share('Share this work record', 'Anyone can open this and check every payment against the contract on Arbitrum.', url.toString());
    if (await copy(url.toString())) toast('Record link copied');
  };
  $('#copyDealLink').onclick = async () => {
    const url = baseUrl(); url.searchParams.set('deal', app.selected);
    share('Share this deal', 'Anyone with this link sees the live state of the deal, read straight from the contract.', url.toString());
    if (await copy(url.toString())) toast('Deal link copied');
  };
  $('#copyProofLink').onclick = async () => {
    const deal = app.deals.find(d => d.id === app.selected);
    const terms = knownTerms(deal);
    if (!terms) return toast("This browser doesn't hold the readable terms for this deal, so there's nothing to prove yet.", true);
    const evidence = [...knownEvidence(deal, deal.milestones)].map(([milestone, text]) => ({milestone, text}));
    const url = baseUrl(); url.searchParams.set('deal', deal.id);
    url.searchParams.set('proof', encodeProof({v: 2, contract: app.address, deal: String(deal.id), terms, evidence}));
    share('Share proof of the terms', 'This link carries the readable terms and any delivery notes you hold. The app checks them against the hashes on Arbitrum before showing them as verified.', url.toString());
    if (await copy(url.toString())) toast('Proof link copied');
  };
  $('#shCopy').onclick = async () => { if (await copy($('#shLink').value)) toast('Copied'); else { $('#shLink').select(); toast('Select the link and copy it yourself.', true); } };
  $('#otherContract').onclick = () => $('#contractDialog').showModal();
  $('#cdSubmit').onclick = () => {
    const value = $('#cdAddress').value.trim();
    if (!ethers.isAddress(value)) return toast('That isn\'t a valid address.', true);
    location.href = `${location.pathname}?contract=${value}`;
  };
  document.querySelectorAll('.tabs a').forEach(a => a.addEventListener('click', () => {
    if (a.dataset.nav === 'record' && !app.recordWorker) openRecord(app.deals.find(d => d.id === app.selected)?.worker, false);
  }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  const sections = ['deal', 'deals', 'record'].map(id => document.getElementById(id));
  const spy = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.nav === entry.target.id));
  }, {rootMargin: '-45% 0px -50% 0px'});
  sections.forEach(section => spy.observe(section));
}

async function refresh() {
  if (document.hidden || app.busy) return;
  try { await loadAll(); render(); renderRecord(); } catch { /* notice already shown */ }
}

async function boot() {
  wire();
  watchWallet();
  const [config, registry] = await Promise.all([
    fetch('/contract.json', {cache: 'no-store'}).then(r => r.json()),
    fetch('/registry.json', {cache: 'no-store'}).then(r => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  app.config = config;
  app.read = new ethers.JsonRpcProvider(config.network.rpc, config.network.chainId, {staticNetwork: true});
  const params = new URL(location.href).searchParams;
  const override = params.get('contract');
  const address = override && ethers.isAddress(override) ? override : config.deployment?.address;
  if (!address) { notice('ScopePay v2 has not been deployed yet.', true); return; }
  try {
    await useContract(address);
  } catch (error) {
    if (override && config.deployment?.address) {
      notice(`<b>${esc(short(override))}</b> isn't a ScopePay v2 contract (${esc(friendly(error))}). Showing the official deployment instead.`, true);
      setUrl({contract: null});
      await useContract(config.deployment.address);
    } else { notice(esc(friendly(error)), true); return; }
  }
  app.registry = registry[app.address.toLowerCase()] ?? {};
  app.importedProof = decodeProof(params.get('proof') || '');
  if (app.importedProof && !same(app.importedProof.contract, app.address)) app.importedProof = null;

  // Keep retrying the first read so a flaky RPC doesn't leave an empty page.
  for (let attempt = 0; ; attempt += 1) {
    try { await loadAll(); break; } catch { await new Promise(r => setTimeout(r, Math.min(10000, 1500 * (attempt + 1)))); }
  }
  const wanted = params.get('deal');
  const fallback = config.featuredDealId !== undefined && app.deals.some(d => d.id === Number(config.featuredDealId)) ? Number(config.featuredDealId) : app.deals.at(-1)?.id;
  if (wanted !== null && !app.deals.some(d => d.id === Number(wanted))) {
    notice(`There's no deal #${esc(wanted)} on this contract${app.deals.length ? `, so you're seeing deal #${fallback} instead` : ''}.`);
  }
  if (app.importedProof) {
    const deal = app.deals.find(d => d.id === Number(app.importedProof.deal));
    if (deal && !knownTerms(deal)) notice("This proof link's terms don't match the hash on-chain, so they aren't shown as verified.", true);
  }
  if (fallback === undefined) {
    $('#deal').classList.add('hidden');
    renderList();
  } else selectDeal(wanted !== null && app.deals.some(d => d.id === Number(wanted)) ? Number(wanted) : fallback);
  if (params.get('worker') && ethers.isAddress(params.get('worker'))) openRecord(params.get('worker'), true);

  // Reconnect silently if this site was already allowed in the wallet.
  if (window.ethereum) {
    try {
      const [account] = await window.ethereum.request({method: 'eth_accounts'});
      const chain = String(await window.ethereum.request({method: 'eth_chainId'})).toLowerCase();
      if (account && chain === config.network.chainHex.toLowerCase()) await useAccount(account);
    } catch { /* stay read-only */ }
  }
  setInterval(refresh, 12000);
  setInterval(tickClock, 1000);
  registerAgentTools();
}

boot().catch(error => notice(`ScopePay couldn't start: ${esc(friendly(error))}`, true));
