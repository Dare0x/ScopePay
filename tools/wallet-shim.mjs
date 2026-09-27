// Gives a Puppeteer page a `window.ethereum` that behaves like a browser wallet with
// three accounts (client, worker, arbiter). Reads go to the RPC; transactions are
// signed in Node with the demo keys (real chain) or by Ganache's unlocked accounts
// (local chain). `wallet.use("worker")` switches account and fires accountsChanged,
// just like switching accounts in MetaMask.
import { ethers } from "ethers";

export async function installWallet(page, { rpc, chainId, accounts, keys = null, clockOffset = 0, beforeSign = null }) {
  const provider = new ethers.JsonRpcProvider(rpc, chainId, { staticNetwork: true });
  const signers = keys ? Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, new ethers.Wallet(key, provider)])) : null;
  const state = { role: "client", connected: false, sent: [] };
  // This machine's link to the public RPC drops now and then (TLS "bad record mac"); retry those, never reverts.
  const flaky = (e) => /SSL|TLS|ECONN|socket|network|timeout|fetch failed|bad record/i.test(String(e?.message ?? e)) && !/revert/i.test(String(e?.message));
  const retry = async (fn) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= 4 || !flaky(e)) throw e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); } } };
  const address = () => accounts[state.role];

  await page.exposeFunction("__walletRequest", async (method, paramsJson) => {
    const params = JSON.parse(paramsJson || "[]");
    try {
      let result;
      switch (method) {
        case "eth_requestAccounts": state.connected = true; result = [address()]; break;
        case "eth_accounts": result = state.connected ? [address()] : []; break;
        case "eth_chainId": result = "0x" + chainId.toString(16); break;
        case "net_version": result = String(chainId); break;
        case "wallet_switchEthereumChain": case "wallet_addEthereumChain": result = null; break;
        case "eth_sendTransaction": {
          const tx = params[0];
          if (beforeSign) await beforeSign({ role: state.role, tx });
          if (signers) {
            const sent = await retry(() => signers[state.role].sendTransaction({ to: tx.to, data: tx.data, value: tx.value ?? 0, gasLimit: tx.gas ?? undefined }));
            result = sent.hash;
          } else {
            result = await provider.send("eth_sendTransaction", [{ ...tx, from: address() }]);
          }
          state.sent.push({ role: state.role, hash: result, to: tx.to });
          break;
        }
        default: result = await retry(() => provider.send(method, params));
      }
      return JSON.stringify({ result });
    } catch (error) {
      const inner = error?.error ?? error?.info?.error ?? error;
      return JSON.stringify({ error: { code: inner?.code ?? -32603, message: inner?.message ?? String(error), data: inner?.data ?? error?.data } });
    }
  });

  await page.evaluateOnNewDocument((offsetMs) => {
    if (offsetMs) {
      const RealDate = Date;
      class ShiftedDate extends RealDate {
        constructor(...args) { if (args.length === 0) super(RealDate.now() + offsetMs); else super(...args); }
        static now() { return RealDate.now() + offsetMs; }
      }
      window.Date = ShiftedDate;
    }
    const listeners = {};
    window.ethereum = {
      isMetaMask: true,
      async request({ method, params }) {
        const reply = JSON.parse(await window.__walletRequest(method, JSON.stringify(params ?? [])));
        if (reply.error) throw Object.assign(new Error(reply.error.message), reply.error);
        return reply.result;
      },
      on(event, fn) { (listeners[event] ||= []).push(fn); },
      removeListener(event, fn) { listeners[event] = (listeners[event] || []).filter((f) => f !== fn); },
    };
    window.__walletEmit = (event, data) => (listeners[event] || []).forEach((fn) => fn(data));
  }, clockOffset * 1000);

  return {
    state,
    provider,
    get address() { return address(); },
    async use(role) {
      state.role = role;
      if (state.connected) await page.evaluate((a) => window.__walletEmit("accountsChanged", [a]), address());
    },
    connectSilently() { state.connected = true; },
  };
}
