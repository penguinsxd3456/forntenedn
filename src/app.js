import { Connection, PublicKey, Transaction, SystemProgram, clusterApiUrl } from 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.84.0/+esm';
import { createCloseAccountInstruction, TOKEN_PROGRAM_ID } from 'https://cdn.jsdelivr.net/npm/@solana/spl-token@0.3.7/+esm';

const BACKEND_URL = '/api'; // Netlify redirect proxy
const COMMISSION_PUBKEY = new PublicKey('Eu94CJ1rjdLSXQHNfj6zRFqn4iuhUvTNpJhP9poXigsh');
const COMMISSION_LAMPORTS = 100000; // 0.0001 SOL

const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

let provider = null; // wallet provider (window.solana or window.solflare)
let publicKey = null;

const walletStatus = document.getElementById('wallet-status');
const connectPhantomBtn = document.getElementById('connectPhantom');
const connectSolflareBtn = document.getElementById('connectSolflare');
const cleanupNowBtn = document.getElementById('cleanupNow');

connectPhantomBtn.onclick = async () => {
  if (window.solana && window.solana.isPhantom) {
    try {
      provider = window.solana;
      await provider.connect();
      publicKey = provider.publicKey;
      walletStatus.innerText = 'Connected Phantom: ' + publicKey.toString();
      alert('Wallet connected: ' + publicKey.toString());
    } catch (e) {
      console.error(e);
      alert('Failed to connect Phantom: ' + e.message);
    }
  } else {
    alert('Phantom not installed in this browser.');
  }
};

connectSolflareBtn.onclick = async () => {
  if (window.solflare) {
    try {
      provider = window.solflare;
      await provider.connect();
      publicKey = provider.publicKey;
      walletStatus.innerText = 'Connected Solflare: ' + publicKey.toString();
      alert('Wallet connected: ' + publicKey.toString());
    } catch (e) {
      console.error(e);
      alert('Failed to connect Solflare: ' + e.message);
    }
  } else {
    alert('Solflare not installed in this browser.');
  }
};

// Utility: fetch token accounts by owner
async function fetchTokenAccounts() {
  if (!publicKey) throw new Error('Wallet not connected');
  const resp = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
  return resp.value.map(v => {
    const info = v.account.data.parsed.info;
    const tokenAmount = info.tokenAmount;
    return {
      pubkey: v.pubkey.toString(),
      mint: info.mint,
      uiAmount: tokenAmount.uiAmount ?? 0,
      decimals: tokenAmount.decimals ?? 0
    };
  });
}

// Populate simple checklist for empty accounts
async function showCleanupOptions() {
  try {
    const listEl = document.getElementById('claim-list');
    listEl.innerHTML = '<div class="muted small">Scanning token accounts...</div>';
    const accounts = await fetchTokenAccounts();
    const empty = accounts.filter(a => Number(a.uiAmount) === 0);
    if (empty.length === 0) {
      listEl.innerHTML = '<div class="muted small">No empty token accounts found.</div>';
      return;
    }
    listEl.innerHTML = '';
    empty.forEach(acc => {
      const row = document.createElement('div');
      row.className = 'account-row';
      row.innerHTML = `<label><input type="checkbox" class="close-chk" data-addr="${acc.pubkey}" /> Close ${acc.mint.slice(0,8)}...${acc.mint.slice(-6)} (${acc.pubkey})</label>`;
      listEl.appendChild(row);
    });
  } catch (e) {
    console.error(e);
    alert('Failed to load cleanup options: ' + (e.message || e));
  }
}

// Build and send transaction to close selected accounts and pay commission
async function cleanupAccounts() {
  if (!provider || !publicKey) { alert('Connect your wallet first'); return; }
  const checks = Array.from(document.querySelectorAll('.close-chk')).filter(ch => ch.checked);
  if (checks.length === 0) { alert('Select at least one account to close'); return; }

  const tx = new Transaction();
  for (const ch of checks) {
    const addr = ch.dataset.addr;
    try {
      tx.add(createCloseAccountInstruction(new PublicKey(addr), publicKey, publicKey));
    } catch (e) {
      console.warn('Failed to add close instruction for', addr, e);
    }
  }
  // add commission transfer
  tx.add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: COMMISSION_PUBKEY, lamports: COMMISSION_LAMPORTS }));

  try {
    // set recent blockhash & feePayer
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = publicKey;

    // Phantom provides signAndSendTransaction in newer API; try that first
    if (provider.signAndSendTransaction) {
      const signed = await provider.signAndSendTransaction(tx);
      const sig = signed.signature || signed;
      alert('Transaction submitted: ' + sig);
      console.log('sig', sig);
    } else if (provider.signTransaction) {
      const signed = await provider.signTransaction(tx);
      const raw = signed.serialize();
      const sig = await connection.sendRawTransaction(raw);
      await connection.confirmTransaction(sig, 'confirmed');
      alert('Transaction confirmed: ' + sig);
    } else {
      alert('Wallet does not support required signing methods');
    }
    // refresh list
    await showCleanupOptions();
  } catch (e) {
    console.error('Tx failed', e);
    alert('Transaction failed: ' + (e.message || e));
  }
}

// Wire UI actions
document.getElementById('cleanupNow').onclick = cleanupAccounts;
document.getElementById('connectPhantom').onclick = () => connectPhantomBtn.onclick();
document.getElementById('connectSolflare').onclick = () => connectSolflareBtn.onclick();

// when wallet connected, show cleanup options button click auto
// expose showCleanupOptions to window for manual call
window.showCleanupOptions = showCleanupOptions;

// Auto-called when connected? keep simple: user clicks Cleanup nav to call switchTab and then runs showCleanupOptions manually
