import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {
  BrowserProvider,
  ContractFactory,
  ZeroAddress,
  ZeroHash,
  keccak256,
  parseUnits,
  toUtf8Bytes,
} from 'ethers';
import {compile} from '../scripts/compile.mjs';

const usdc = value => parseUnits(String(value), 6);
const hash = value => keccak256(toUtf8Bytes(value));
const expectRevert = promise => assert.rejects(async () => (await promise).wait());

async function setup(t) {
  const engine = ganache.provider({
    logging: {quiet: true},
    chain: {chainId: 1337, hardfork: 'shanghai'},
    wallet: {totalAccounts: 7},
  });
  const provider = new BrowserProvider(engine);
  t.after(async () => {
    provider.destroy();
    await engine.disconnect();
  });

  const [client, worker, arbiter, outsider, secondWorker] = await Promise.all(
    [0, 1, 2, 3, 4].map(index => provider.getSigner(index)),
  );
  const {ScopePay, MockUSDC} = compile();
  const token = await new ContractFactory(MockUSDC.abi, MockUSDC.bytecode, client).deploy();
  await token.waitForDeployment();
  const escrow = await new ContractFactory(ScopePay.abi, ScopePay.bytecode, client).deploy(
    await token.getAddress(),
  );
  await escrow.waitForDeployment();

  const timestamp = Number((await provider.getBlock('latest')).timestamp);
  const dueDates = [timestamp + 3_600, timestamp + 7_200, timestamp + 10_800];
  const amounts = [usdc(1_200), usdc(1_800), usdc(3_200)];
  const total = amounts.reduce((sum, amount) => sum + amount, 0n);

  async function fundClient(amount = total) {
    await (await token.mint(await client.getAddress(), amount)).wait();
    await (await token.approve(await escrow.getAddress(), amount)).wait();
  }

  async function createDeal(overrides = {}) {
    const selectedAmounts = overrides.amounts ?? amounts;
    const selectedDueDates = overrides.dueDates ?? dueDates;
    const value = selectedAmounts.reduce((sum, amount) => sum + amount, 0n);
    await fundClient(value);
    return (
      await escrow.createDeal(
        overrides.worker ?? (await worker.getAddress()),
        overrides.arbiter ?? (await arbiter.getAddress()),
        selectedAmounts,
        selectedDueDates,
        overrides.terms ?? hash('signed-scope-v1'),
      )
    ).wait();
  }

  return {
    provider,
    client,
    worker,
    arbiter,
    outsider,
    secondWorker,
    token,
    escrow,
    amounts,
    dueDates,
    total,
    fundClient,
    createDeal,
  };
}

test('escrows the exact milestone total and isolates sequential deals', async t => {
  const {client, worker, arbiter, secondWorker, token, escrow, amounts, dueDates, total, createDeal} =
    await setup(t);

  await createDeal();
  await createDeal({worker: await secondWorker.getAddress(), amounts: [usdc(25)], dueDates: [dueDates[0]]});

  assert.equal(await escrow.nextDealId(), 2n);
  assert.equal(await token.balanceOf(await escrow.getAddress()), total + usdc(25));
  assert.equal((await escrow.deals(0)).client, await client.getAddress());
  assert.equal((await escrow.deals(0)).worker, await worker.getAddress());
  assert.equal((await escrow.deals(0)).arbiter, await arbiter.getAddress());
  assert.equal((await escrow.deals(1)).worker, await secondWorker.getAddress());
  assert.equal((await escrow.milestones(0, 1)).amount, amounts[1]);
  assert.equal((await escrow.milestones(1, 0)).amount, usdc(25));
});

test('rejects invalid parties, milestones, terms, and unfunded creation', async t => {
  const {client, worker, arbiter, escrow, dueDates, fundClient} = await setup(t);
  const clientAddress = await client.getAddress();
  const workerAddress = await worker.getAddress();
  const arbiterAddress = await arbiter.getAddress();

  await fundClient(usdc(10));
  await expectRevert(escrow.createDeal(ZeroAddress, arbiterAddress, [usdc(1)], [dueDates[0]], hash('terms')));
  await expectRevert(escrow.createDeal(clientAddress, arbiterAddress, [usdc(1)], [dueDates[0]], hash('terms')));
  await expectRevert(escrow.createDeal(workerAddress, workerAddress, [usdc(1)], [dueDates[0]], hash('terms')));
  await expectRevert(escrow.createDeal(workerAddress, arbiterAddress, [], [], hash('terms')));
  await expectRevert(escrow.createDeal(workerAddress, arbiterAddress, [0], [dueDates[0]], hash('terms')));
  await expectRevert(
    escrow.createDeal(workerAddress, arbiterAddress, [usdc(1), usdc(1)], [dueDates[1], dueDates[0]], hash('terms')),
  );
  await expectRevert(escrow.createDeal(workerAddress, arbiterAddress, [usdc(1)], [dueDates[0]], ZeroHash));

  const fresh = await setup(t);
  await expectRevert(
    fresh.escrow.createDeal(
      await fresh.worker.getAddress(),
      await fresh.arbiter.getAddress(),
      [usdc(1)],
      [fresh.dueDates[0]],
      hash('unfunded'),
    ),
  );
});

test('enforces roles and milestone ordering through a normal release', async t => {
  const {client, worker, arbiter, outsider, token, escrow, amounts, createDeal} = await setup(t);
  await createDeal();
  const evidence = hash('milestone-evidence');

  await expectRevert(escrow.connect(outsider).submitMilestone(0, 0, evidence));
  await expectRevert(escrow.connect(worker).submitMilestone(0, 1, evidence));
  await expectRevert(escrow.connect(worker).submitMilestone(0, 0, ZeroHash));
  await expectRevert(escrow.connect(client).approveMilestone(0, 0));

  await (await escrow.connect(worker).submitMilestone(0, 0, evidence)).wait();
  await expectRevert(escrow.connect(worker).submitMilestone(0, 0, evidence));
  await expectRevert(escrow.connect(worker).approveMilestone(0, 0));
  // A fixed limit avoids Ganache reusing the earlier failed pre-submission estimate.
  await (await escrow.connect(client).approveMilestone(0, 0, {gasLimit: 500_000})).wait();

  assert.equal(await token.balanceOf(await worker.getAddress()), amounts[0]);
  assert.equal((await escrow.deals(0)).remaining, amounts[1] + amounts[2]);
  assert.equal((await escrow.deals(0)).currentMilestone, 1n);
  assert.equal((await escrow.milestones(0, 0)).status, 2n);
  await expectRevert(escrow.connect(arbiter).resolveDispute(0, 0));
});

test('closes after the final approval and conserves all deposited funds', async t => {
  const {client, worker, token, escrow, amounts, total, createDeal} = await setup(t);
  await createDeal();

  for (let index = 0; index < amounts.length; index += 1) {
    await (await escrow.connect(worker).submitMilestone(0, index, hash(`evidence-${index}`))).wait();
    await (await escrow.connect(client).approveMilestone(0, index)).wait();
  }

  const deal = await escrow.deals(0);
  assert.equal(deal.closed, true);
  assert.equal(deal.remaining, 0n);
  assert.equal(deal.currentMilestone, 3n);
  assert.equal(await token.balanceOf(await worker.getAddress()), total);
  assert.equal(await token.balanceOf(await escrow.getAddress()), 0n);
  await expectRevert(escrow.connect(worker).openDispute(0, hash('too late')));
});

test('freezes a disputed deal and allows only the named arbiter to settle it', async t => {
  const {client, worker, arbiter, outsider, token, escrow, amounts, total, createDeal} = await setup(t);
  await createDeal();

  await (await escrow.connect(worker).submitMilestone(0, 0, hash('delivered'))).wait();
  await (await escrow.connect(client).openDispute(0, hash('scope mismatch'))).wait();

  await expectRevert(escrow.connect(client).approveMilestone(0, 0));
  await expectRevert(escrow.connect(worker).submitMilestone(0, 0, hash('replacement')));
  await expectRevert(escrow.connect(outsider).resolveDispute(0, usdc(500)));
  await expectRevert(escrow.connect(arbiter).resolveDispute(0, amounts[0] + 1n));

  const award = usdc(500);
  await (await escrow.connect(arbiter).resolveDispute(0, award)).wait();
  const deal = await escrow.deals(0);

  assert.equal(deal.closed, true);
  assert.equal(deal.disputed, false);
  assert.equal(deal.remaining, 0n);
  assert.equal(await token.balanceOf(await worker.getAddress()), award);
  assert.equal(await token.balanceOf(await client.getAddress()), total - award);
  assert.equal(await token.balanceOf(await escrow.getAddress()), 0n);
});

test('permits cancellation only by the client before work starts', async t => {
  const {client, worker, outsider, token, escrow, total, createDeal} = await setup(t);
  await createDeal();

  await expectRevert(escrow.connect(outsider).cancelUnstarted(0));
  await (await escrow.connect(client).cancelUnstarted(0)).wait();

  assert.equal((await escrow.deals(0)).closed, true);
  assert.equal((await escrow.deals(0)).remaining, 0n);
  assert.equal((await escrow.milestones(0, 0)).status, 3n);
  assert.equal(await token.balanceOf(await client.getAddress()), total);
  assert.equal(await token.balanceOf(await escrow.getAddress()), 0n);
  await expectRevert(escrow.connect(worker).submitMilestone(0, 0, hash('after cancellation')));

  const second = await setup(t);
  await second.createDeal();
  await (await second.escrow.connect(second.worker).submitMilestone(0, 0, hash('started'))).wait();
  await expectRevert(second.escrow.connect(second.client).cancelUnstarted(0));
});
