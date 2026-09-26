import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {
  BrowserProvider,
  ContractFactory,
  Interface,
  ZeroAddress,
  ZeroHash,
  keccak256,
  parseUnits,
  toUtf8Bytes,
} from 'ethers';
import {compile} from '../scripts/compile.mjs';

const artifacts = compile();
const usdc = value => parseUnits(String(value), 6);
const hash = value => keccak256(toUtf8Bytes(value));
const HOUR = 3_600;
const DAY = 86_400;
// A fixed gas limit skips estimation, so a call that should revert is mined and fails on wait().
const TX = {gasLimit: 1_500_000};
const Status = {Pending: 0n, Submitted: 1n, Released: 2n, Refunded: 3n};

/** Asserts that a call reverts with the named custom error (checked through eth_call). */
async function reverts(method, args, errorName) {
  await assert.rejects(method.staticCall(...args), error => {
    const name = error.revert?.name ?? error.data;
    assert.equal(name, errorName, `expected ${errorName}, got ${name ?? error.shortMessage}`);
    return true;
  });
}

async function deploy(name, signer, ...args) {
  const {abi, bytecode} = artifacts[name];
  const contract = await new ContractFactory(abi, bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function setup(t, {extraTokens = []} = {}) {
  const engine = ganache.provider({
    logging: {quiet: true},
    chain: {chainId: 1337, hardfork: 'shanghai'},
    wallet: {totalAccounts: 8},
  });
  const provider = new BrowserProvider(engine);
  t.after(async () => {
    provider.destroy();
    await engine.disconnect();
  });

  const [client, worker, arbiter, outsider, secondWorker, secondClient] = await Promise.all(
    [0, 1, 2, 3, 4, 5].map(index => provider.getSigner(index)),
  );
  const usdcToken = await deploy('MockUSDC', client);
  const usdgToken = await deploy('MockUSDC', client);
  const extras = [];
  for (const name of extraTokens) extras.push(await deploy(name, client));
  const tokenAddresses = await Promise.all([usdcToken, usdgToken, ...extras].map(token => token.getAddress()));
  const escrow = await deploy('ScopePay', client, tokenAddresses);

  async function now() {
    return Number((await provider.getBlock('latest')).timestamp);
  }
  async function travel(seconds) {
    await provider.send('evm_increaseTime', [seconds]);
    await provider.send('evm_mine', []);
  }

  const start = await now();
  const dueDates = [start + 3 * DAY, start + 6 * DAY, start + 9 * DAY];
  const amounts = [usdc(1_200), usdc(1_800), usdc(3_200)];
  const total = amounts.reduce((sum, amount) => sum + amount, 0n);

  async function fund(signer, token, amount) {
    await (await token.connect(signer).mint(await signer.getAddress(), amount, TX)).wait();
    await (await token.connect(signer).approve(await escrow.getAddress(), amount, TX)).wait();
  }

  async function createDeal(overrides = {}) {
    const from = overrides.client ?? client;
    const token = overrides.token ?? usdcToken;
    const selectedAmounts = overrides.amounts ?? amounts;
    const value = selectedAmounts.reduce((sum, amount) => sum + amount, 0n);
    await fund(from, token, value);
    const id = await escrow.nextDealId();
    await (
      await escrow.connect(from).createDeal(
        await token.getAddress(),
        overrides.worker ?? (await worker.getAddress()),
        overrides.arbiter ?? (await arbiter.getAddress()),
        selectedAmounts,
        overrides.dueDates ?? dueDates,
        overrides.reviewWindow ?? 2 * DAY,
        overrides.terms ?? hash('signed-scope-v2'),
        TX,
      )
    ).wait();
    return id;
  }

  const as = signer => escrow.connect(signer);
  return {
    provider, client, worker, arbiter, outsider, secondWorker, secondClient,
    usdcToken, usdgToken, extras, escrow, amounts, dueDates, total,
    fund, createDeal, now, travel, as,
  };
}

test('accepts only a short list of real, distinct payment tokens', async t => {
  const {client, usdcToken, usdgToken, escrow} = await setup(t);
  const usdcAddress = await usdcToken.getAddress();
  const usdgAddress = await usdgToken.getAddress();
  assert.deepEqual([...(await escrow.supportedTokens())], [usdcAddress, usdgAddress]);
  assert.equal(await escrow.isSupportedToken(usdgAddress), true);

  const {abi, bytecode} = artifacts.ScopePay;
  const factory = new ContractFactory(abi, bytecode, client);
  for (const tokens of [[], [ZeroAddress], [await client.getAddress()], [usdcAddress, usdcAddress], Array(5).fill(usdcAddress)]) {
    await assert.rejects(factory.deploy(tokens, TX).then(contract => contract.waitForDeployment()));
  }
});

test('escrows the exact milestone total and keeps deals and tokens apart', async t => {
  const {client, worker, arbiter, secondWorker, usdcToken, usdgToken, escrow, amounts, dueDates, total, createDeal} =
    await setup(t);

  await createDeal();
  await createDeal({worker: await secondWorker.getAddress(), token: usdgToken, amounts: [usdc(25)], dueDates: [dueDates[0]]});

  assert.equal(await escrow.nextDealId(), 2n);
  assert.equal(await usdcToken.balanceOf(await escrow.getAddress()), total);
  assert.equal(await usdgToken.balanceOf(await escrow.getAddress()), usdc(25));
  const first = await escrow.getDeal(0);
  assert.equal(first.client, await client.getAddress());
  assert.equal(first.worker, await worker.getAddress());
  assert.equal(first.arbiter, await arbiter.getAddress());
  assert.equal(first.token, await usdcToken.getAddress());
  assert.equal(first.reviewWindow, BigInt(2 * DAY));
  const second = await escrow.getDeal(1);
  assert.equal(second.worker, await secondWorker.getAddress());
  assert.equal(second.token, await usdgToken.getAddress());
  const items = await escrow.getMilestones(0);
  assert.deepEqual(items.map(item => item.amount), amounts);
  assert.deepEqual(items.map(item => item.dueAt), dueDates.map(BigInt));
  assert.equal((await escrow.getMilestones(1))[0].amount, usdc(25));
});

test('rejects bad parties, tokens, windows, milestones, terms, and unfunded deals', async t => {
  const {client, worker, arbiter, outsider, usdcToken, escrow, dueDates, fund} = await setup(t);
  const c = await client.getAddress(), w = await worker.getAddress(), a = await arbiter.getAddress();
  const token = await usdcToken.getAddress();
  const one = [usdc(1)], due = [dueDates[0]], terms = hash('terms');
  await fund(client, usdcToken, usdc(10));

  await reverts(escrow.createDeal, [await outsider.getAddress(), w, a, one, due, DAY, terms], 'UnsupportedToken');
  await reverts(escrow.createDeal, [token, ZeroAddress, a, one, due, DAY, terms], 'InvalidParty');
  await reverts(escrow.createDeal, [token, c, a, one, due, DAY, terms], 'InvalidParty');
  await reverts(escrow.createDeal, [token, w, c, one, due, DAY, terms], 'InvalidParty');
  await reverts(escrow.createDeal, [token, w, w, one, due, DAY, terms], 'InvalidParty');
  await reverts(escrow.createDeal, [token, w, a, one, due, HOUR - 1, terms], 'InvalidWindow');
  await reverts(escrow.createDeal, [token, w, a, one, due, 30 * DAY + 1, terms], 'InvalidWindow');
  await reverts(escrow.createDeal, [token, w, a, [], [], DAY, terms], 'InvalidMilestones');
  await reverts(escrow.createDeal, [token, w, a, [0], due, DAY, terms], 'InvalidMilestones');
  await reverts(escrow.createDeal, [token, w, a, [usdc(1), usdc(1)], [dueDates[1], dueDates[0]], DAY, terms], 'InvalidMilestones');
  await reverts(escrow.createDeal, [token, w, a, one, [1], DAY, terms], 'InvalidMilestones');
  await reverts(escrow.createDeal, [token, w, a, one, [dueDates[0], dueDates[1]], DAY, terms], 'InvalidMilestones');
  await reverts(escrow.createDeal, [token, w, a, Array(13).fill(usdc(0.1)), Array.from({length: 13}, (_, i) => dueDates[0] + i), DAY, terms], 'InvalidMilestones');
  await reverts(escrow.createDeal, [token, w, a, one, due, DAY, ZeroHash], 'InvalidMilestones');
  // More than the approved allowance cannot be pulled.
  await assert.rejects(escrow.createDeal.staticCall(token, w, a, [usdc(11)], due, DAY, terms));
  assert.equal(await escrow.nextDealId(), 0n);
});

test('enforces roles and milestone order through a normal release', async t => {
  const {client, worker, arbiter, outsider, usdcToken, escrow, amounts, createDeal, as} = await setup(t);
  await createDeal();
  const evidence = hash('milestone-evidence');

  await reverts(as(outsider).submitMilestone, [0, 0, evidence], 'Unauthorized');
  await reverts(as(worker).submitMilestone, [0, 1, evidence], 'InvalidState');
  await reverts(as(worker).submitMilestone, [0, 0, ZeroHash], 'InvalidState');
  await reverts(as(client).approveMilestone, [0, 0], 'InvalidState');

  await (await as(worker).submitMilestone(0, 0, evidence, TX)).wait();
  const submitted = (await escrow.getMilestones(0))[0];
  assert.equal(submitted.status, Status.Submitted);
  assert.equal(submitted.evidenceCommitment, evidence);
  assert.ok(submitted.submittedAt > 0n);
  await reverts(as(worker).submitMilestone, [0, 0, evidence], 'InvalidState');
  await reverts(as(worker).approveMilestone, [0, 0], 'Unauthorized');
  await reverts(as(client).approveMilestone, [0, 1], 'InvalidState');

  const receipt = await (await as(client).approveMilestone(0, 0, TX)).wait();
  const released = receipt.logs.map(log => escrow.interface.parseLog(log)).find(log => log?.name === 'MilestoneReleased');
  assert.equal(released.args.afterReviewWindow, false);
  assert.equal(await usdcToken.balanceOf(await worker.getAddress()), amounts[0]);
  const deal = await escrow.getDeal(0);
  assert.equal(deal.remaining, amounts[1] + amounts[2]);
  assert.equal(deal.currentMilestone, 1n);
  assert.equal((await escrow.getMilestones(0))[0].status, Status.Released);
  await reverts(as(arbiter).resolveDispute, [0, 0], 'InvalidState');
});

test('closes after the final approval and conserves every deposited unit', async t => {
  const {client, worker, usdcToken, escrow, amounts, total, createDeal, as} = await setup(t);
  await createDeal();
  for (let index = 0; index < amounts.length; index += 1) {
    await (await as(worker).submitMilestone(0, index, hash(`evidence-${index}`), TX)).wait();
    await (await as(client).approveMilestone(0, index, TX)).wait();
  }
  const deal = await escrow.getDeal(0);
  assert.equal(deal.closed, true);
  assert.equal(deal.remaining, 0n);
  assert.equal(deal.currentMilestone, 3n);
  assert.equal(await usdcToken.balanceOf(await worker.getAddress()), total);
  assert.equal(await usdcToken.balanceOf(await escrow.getAddress()), 0n);
  await reverts(as(worker).openDispute, [0, hash('too late')], 'InvalidState');
  await reverts(as(client).reclaimAfterMissedDeadline, [0], 'InvalidState');
});

test('a dispute freezes the deal and only the named arbiter can split it', async t => {
  const {client, worker, arbiter, outsider, usdcToken, escrow, amounts, total, createDeal, as} = await setup(t);
  await createDeal();
  await (await as(worker).submitMilestone(0, 0, hash('delivered'), TX)).wait();
  await reverts(as(outsider).openDispute, [0, hash('meddling')], 'Unauthorized');
  await reverts(as(client).openDispute, [0, ZeroHash], 'InvalidState');
  await (await as(client).openDispute(0, hash('scope mismatch'), TX)).wait();
  assert.ok((await escrow.getDeal(0)).disputedAt > 0n);

  await reverts(as(worker).openDispute, [0, hash('again')], 'InvalidState');
  await reverts(as(client).approveMilestone, [0, 0], 'InvalidState');
  await reverts(as(worker).claimAfterReviewWindow, [0], 'InvalidState');
  await reverts(as(client).cancelUnstarted, [0], 'InvalidState');
  await reverts(as(outsider).resolveDispute, [0, usdc(500)], 'Unauthorized');
  await reverts(as(client).resolveDispute, [0, usdc(500)], 'Unauthorized');
  await reverts(as(arbiter).resolveDispute, [0, amounts[0] + 1n], 'WrongAmount');
  await reverts(as(worker).settleAfterArbiterWindow, [0], 'TooEarly');

  const award = usdc(500);
  await (await as(arbiter).resolveDispute(0, award, TX)).wait();
  const deal = await escrow.getDeal(0);
  assert.equal(deal.closed, true);
  assert.equal(deal.disputedAt, 0n);
  assert.equal(deal.remaining, 0n);
  assert.equal((await escrow.getMilestones(0))[0].status, Status.Released);
  assert.equal(await usdcToken.balanceOf(await worker.getAddress()), award);
  assert.equal(await usdcToken.balanceOf(await client.getAddress()), total - award);
  assert.equal(await usdcToken.balanceOf(await escrow.getAddress()), 0n);
  await reverts(as(arbiter).resolveDispute, [0, 0], 'InvalidState');
});

test('lets the client cancel only before any work is submitted', async t => {
  const {client, worker, outsider, usdcToken, escrow, total, createDeal, as} = await setup(t);
  await createDeal();
  await reverts(as(outsider).cancelUnstarted, [0], 'Unauthorized');
  await reverts(as(worker).cancelUnstarted, [0], 'Unauthorized');
  await (await as(client).cancelUnstarted(0, TX)).wait();
  assert.equal((await escrow.getDeal(0)).closed, true);
  assert.equal((await escrow.getMilestones(0))[0].status, Status.Refunded);
  assert.equal(await usdcToken.balanceOf(await client.getAddress()), total);
  await reverts(as(worker).submitMilestone, [0, 0, hash('after cancellation')], 'InvalidState');

  await createDeal();
  await (await as(worker).submitMilestone(1, 0, hash('started'), TX)).wait();
  await reverts(as(client).cancelUnstarted, [1], 'InvalidState');
});

test('a client who goes quiet after delivery cannot hold the payment', async t => {
  const {client, worker, outsider, usdcToken, escrow, amounts, createDeal, travel, as} = await setup(t);
  await createDeal({reviewWindow: 2 * DAY});
  await reverts(as(worker).claimAfterReviewWindow, [0], 'InvalidState');
  await (await as(worker).submitMilestone(0, 0, hash('delivered on time'), TX)).wait();

  await travel(2 * DAY - 60);
  await reverts(as(worker).claimAfterReviewWindow, [0], 'TooEarly');
  await travel(120);
  await reverts(as(outsider).claimAfterReviewWindow, [0], 'Unauthorized');
  await reverts(as(client).claimAfterReviewWindow, [0], 'Unauthorized');
  const receipt = await (await as(worker).claimAfterReviewWindow(0, TX)).wait();
  const released = receipt.logs.map(log => escrow.interface.parseLog(log)).find(log => log?.name === 'MilestoneReleased');
  assert.equal(released.args.afterReviewWindow, true);
  assert.equal(released.args.amount, amounts[0]);
  assert.equal(await usdcToken.balanceOf(await worker.getAddress()), amounts[0]);
  assert.equal((await escrow.getDeal(0)).currentMilestone, 1n);

  // A dispute opened inside the window stops the automatic claim.
  await (await as(worker).submitMilestone(0, 1, hash('second delivery'), TX)).wait();
  await (await as(client).openDispute(0, hash('not what we agreed'), TX)).wait();
  await travel(3 * DAY);
  await reverts(as(worker).claimAfterReviewWindow, [0], 'InvalidState');
});

test('a worker who misses a deadline lets the client take back what is left', async t => {
  const {client, worker, usdcToken, escrow, amounts, total, dueDates, createDeal, now, travel, as} = await setup(t);
  await createDeal({reviewWindow: DAY});
  await reverts(as(client).reclaimAfterMissedDeadline, [0], 'TooEarly');
  await reverts(as(worker).reclaimAfterMissedDeadline, [0], 'Unauthorized');

  await travel(dueDates[0] - (await now()) + 60);
  const balanceBefore = await usdcToken.balanceOf(await client.getAddress());
  const receipt = await (await as(client).reclaimAfterMissedDeadline(0, TX)).wait();
  const cancelled = receipt.logs.map(log => escrow.interface.parseLog(log)).find(log => log?.name === 'DealCancelled');
  assert.equal(cancelled.args.deadlineMissed, true);
  assert.equal(cancelled.args.refundedAmount, total);
  assert.equal(await usdcToken.balanceOf(await client.getAddress()), balanceBefore + total);
  assert.equal((await escrow.getMilestones(0))[0].status, Status.Refunded);
  assert.equal(await usdcToken.balanceOf(await escrow.getAddress()), 0n);

  // Late but submitted work cannot be reclaimed: the client must review or dispute it.
  await createDeal({reviewWindow: DAY, dueDates: dueDates.map(due => due + 20 * DAY)});
  const later = await escrow.getMilestones(1);
  await travel(Number(later[0].dueAt) - (await now()) + 60);
  await (await as(worker).submitMilestone(1, 0, hash('late but delivered'), TX)).wait();
  await reverts(as(client).reclaimAfterMissedDeadline, [1], 'InvalidState');

  // Approving late cannot trap the worker: the next milestone gets at least one review window.
  await travel(Number(later[1].dueAt) - (await now()) + 60);
  await (await as(client).approveMilestone(1, 0, TX)).wait();
  await reverts(as(client).reclaimAfterMissedDeadline, [1], 'TooEarly');
  assert.ok((await escrow.missedDeadlineAt(1)) > later[1].dueAt);
  await travel(DAY + 60);
  await (await as(client).reclaimAfterMissedDeadline(1, TX)).wait();
  assert.equal((await escrow.getDeal(1)).remaining, 0n);
  assert.equal(await usdcToken.balanceOf(await worker.getAddress()), amounts[0]);
});

test('an arbiter who never decides cannot freeze the money forever', async t => {
  const {client, worker, arbiter, outsider, usdcToken, escrow, amounts, total, createDeal, now, travel, as} = await setup(t);

  // Delivered work in dispute: split evenly after the arbiter window.
  await createDeal();
  await (await as(worker).submitMilestone(0, 0, hash('delivered'), TX)).wait();
  await (await as(client).openDispute(0, hash('quality'), TX)).wait();
  await travel(14 * DAY - 60);
  await reverts(as(client).settleAfterArbiterWindow, [0], 'TooEarly');
  await travel(120);
  await reverts(as(outsider).settleAfterArbiterWindow, [0], 'Unauthorized');
  await reverts(as(arbiter).settleAfterArbiterWindow, [0], 'Unauthorized');
  const receipt = await (await as(worker).settleAfterArbiterWindow(0, TX)).wait();
  const resolved = receipt.logs.map(log => escrow.interface.parseLog(log)).find(log => log?.name === 'DisputeResolved');
  assert.equal(resolved.args.arbiterTimedOut, true);
  assert.equal(resolved.args.workerAmount, amounts[0] / 2n);
  assert.equal(resolved.args.clientAmount, total - amounts[0] / 2n);
  assert.equal(await usdcToken.balanceOf(await worker.getAddress()), amounts[0] / 2n);
  await reverts(as(arbiter).resolveDispute, [0, 0], 'InvalidState');

  // Nothing delivered: the client gets everything back.
  const restart = await now();
  await createDeal({dueDates: [restart + 3 * DAY, restart + 6 * DAY, restart + 9 * DAY]});
  await (await as(worker).openDispute(1, hash('stalling'), TX)).wait();
  await travel(14 * DAY + 60);
  await (await as(client).settleAfterArbiterWindow(1, TX)).wait();
  assert.equal((await escrow.getMilestones(1))[0].status, Status.Refunded);
  assert.equal(await usdcToken.balanceOf(await worker.getAddress()), amounts[0] / 2n);
  assert.equal(await usdcToken.balanceOf(await escrow.getAddress()), 0n);
});

test('refuses a fee-on-transfer token that would underfund the deal', async t => {
  const {client, worker, arbiter, extras, escrow, dueDates, fund} = await setup(t, {extraTokens: ['MockFeeToken']});
  const [feeToken] = extras;
  await fund(client, feeToken, usdc(100));
  await reverts(
    escrow.createDeal,
    [await feeToken.getAddress(), await worker.getAddress(), await arbiter.getAddress(), [usdc(100)], [dueDates[0]], DAY, hash('fee')],
    'WrongAmount',
  );
  assert.equal(await escrow.nextDealId(), 0n);
});

test('a token that calls back during a payout cannot re-enter the escrow', async t => {
  const {client, worker, extras, escrow, amounts, total, createDeal, as} = await setup(t, {extraTokens: ['MockReentrantToken']});
  const [hookToken] = extras;
  await createDeal({token: hookToken});
  await (await as(worker).submitMilestone(0, 0, hash('delivered'), TX)).wait();

  // During the payout the token tries to release the next milestone again.
  const payload = escrow.interface.encodeFunctionData('approveMilestone', [0, 1]);
  await (await hookToken.arm(await escrow.getAddress(), payload, TX)).wait();
  await (await as(client).approveMilestone(0, 0, TX)).wait();

  assert.equal(await hookToken.attempted(), true);
  assert.equal(await hookToken.reentered(), false);
  assert.equal((await escrow.getDeal(0)).currentMilestone, 1n);
  assert.equal(await hookToken.balanceOf(await worker.getAddress()), amounts[0]);
  assert.equal(await hookToken.balanceOf(await escrow.getAddress()), total - amounts[0]);
});

test('random sequences of actions never lose or create money', async t => {
  const env = await setup(t);
  const {client, secondClient, worker, secondWorker, arbiter, usdcToken, usdgToken, escrow, createDeal, travel, now, as} = env;
  let seed = 20260927;
  const random = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
  const pick = list => list[Math.floor(random() * list.length)];
  const tokens = [usdcToken, usdgToken];
  const escrowAddress = await escrow.getAddress();

  const deals = [];
  for (let i = 0; i < 4; i += 1) {
    const start = await now();
    const count = 1 + Math.floor(random() * 3);
    const amounts = Array.from({length: count}, () => usdc(1 + Math.floor(random() * 900)));
    const dueDates = Array.from({length: count}, (_, index) => start + (index + 1) * 4 * DAY);
    const token = tokens[i % 2];
    const id = await createDeal({
      client: i < 2 ? client : secondClient,
      worker: await (i % 3 === 0 ? secondWorker : worker).getAddress(),
      token, amounts, dueDates, reviewWindow: DAY,
    });
    deals.push({id, token, client: i < 2 ? client : secondClient, worker: i % 3 === 0 ? secondWorker : worker});
  }

  async function checkConservation(step) {
    for (const token of tokens) {
      const address = await token.getAddress();
      let expected = 0n;
      for (let id = 0n; id < (await escrow.nextDealId()); id += 1n) {
        const deal = await escrow.getDeal(id);
        if (deal.token !== address) continue;
        const items = await escrow.getMilestones(id);
        const unsettled = items.filter(item => item.status === Status.Pending || item.status === Status.Submitted)
          .reduce((sum, item) => sum + item.amount, 0n);
        assert.equal(deal.remaining, deal.closed ? 0n : unsettled, `step ${step}: deal ${id} remaining`);
        expected += deal.remaining;
      }
      assert.equal(await token.balanceOf(escrowAddress), expected, `step ${step}: escrow holds exactly what is owed`);
    }
  }

  const actions = [
    async ({id, worker: w}) => as(w).submitMilestone(id, (await escrow.getDeal(id)).currentMilestone, hash(`evidence-${random()}`), TX),
    async ({id, client: c}) => as(c).approveMilestone(id, (await escrow.getDeal(id)).currentMilestone, TX),
    ({id, worker: w}) => as(w).claimAfterReviewWindow(id, TX),
    ({id, client: c, worker: w}) => as(pick([c, w])).openDispute(id, hash(`reason-${random()}`), TX),
    async ({id}) => {
      const deal = await escrow.getDeal(id);
      const items = await escrow.getMilestones(id);
      const current = items[Number(deal.currentMilestone)] ?? {amount: 0n};
      return as(arbiter).resolveDispute(id, (current.amount * BigInt(Math.floor(random() * 101))) / 100n, TX);
    },
    ({id, client: c, worker: w}) => as(pick([c, w])).settleAfterArbiterWindow(id, TX),
    ({id, client: c}) => as(c).reclaimAfterMissedDeadline(id, TX),
    ({id, client: c}) => as(c).cancelUnstarted(id, TX),
    () => travel(Math.floor(random() * 5 * DAY)),
  ];

  let succeeded = 0;
  for (let step = 0; step < 70; step += 1) {
    try {
      await (await pick(actions)(pick(deals)))?.wait?.();
      succeeded += 1;
    } catch {
      // Refused actions are expected; conservation must hold either way.
    }
    await checkConservation(step);
  }
  assert.ok(succeeded > 15, `only ${succeeded} random actions went through`);
});

test('reports each custom error by name in the ABI', () => {
  const names = new Interface(artifacts.ScopePay.abi).fragments.filter(f => f.type === 'error').map(f => f.name).sort();
  assert.deepEqual(names, [
    'InvalidMilestones', 'InvalidParty', 'InvalidState', 'InvalidToken', 'InvalidWindow',
    'ReentrancyGuardReentrantCall', 'SafeERC20FailedOperation', 'TooEarly', 'Unauthorized', 'UnsupportedToken', 'WrongAmount',
  ]);
});
