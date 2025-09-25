(async()=>{
  const walletBtn = document.getElementById("walletBtn");
  const statusDiv = document.getElementById("status");
  const scanBtn = document.getElementById("scanBtn");
  const cleanupNow = document.getElementById("cleanupNow");
  const results = document.getElementById("results");

  let connected = false;
  let provider = null;
  let publicKey = null;

  // get Phantom
  function getProvider(){ if(window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) return window.phantom.solana; if(window.solana && window.solana.isPhantom) return window.solana; return null; }

  provider = getProvider();

  walletBtn.addEventListener('click', async ()=>{
    provider = getProvider();
    if(!provider){ alert('Phantom Wallet not found. Install Phantom and reload.'); return; }
    if(!connected){
      try{
        const resp = await provider.connect();
        publicKey = resp.publicKey || provider.publicKey;
        connected = true;
        walletBtn.innerHTML = `<img src="https://cryptologos.cc/logos/phantom-phantom-logo.png" class="wallet-icon"> disconnect wallet`;
        statusDiv.innerText = 'Connected: ' + publicKey.toString();
      }catch(e){ console.error(e); alert('Connect failed: '+(e.message||e)); }
    } else {
      try{
        await provider.disconnect();
      }catch(e){ console.warn('disconnect',e); }
      connected = false;
      publicKey = null;
      walletBtn.innerHTML = `<img src="https://cryptologos.cc/logos/phantom-phantom-logo.png" class="wallet-icon"> connect wallet`;
      statusDiv.innerText = 'Not connected';
      results.innerHTML = '';
    }
  });

  // fetch commission address from backend
  async function getCommissionAddress(){
    try{
      const r = await fetch('/api/commission');
      if(!r.ok) throw new Error('commission fetch failed');
      const j = await r.json();
      return j.address;
    }catch(e){
      console.error(e);
      return null;
    }
  }

  // scan token accounts
  scanBtn.addEventListener('click', async ()=>{
    if(!connected || !publicKey){ alert('Connect Phantom first'); return; }
    results.innerHTML = 'Scanning...';
    try{
      const conn = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'),'confirmed');
      const resp = await conn.getParsedTokenAccountsByOwner(publicKey, { programId: solanaWeb3.TOKEN_PROGRAM_ID });
      const accounts = resp.value.map(v=>{ const info=v.account.data.parsed.info; return {pubkey: v.pubkey.toString(), mint: info.mint, uiAmount: info.tokenAmount.uiAmount || 0}; });
      const empties = accounts.filter(a=>Number(a.uiAmount)===0);
      if(empties.length===0){ results.innerHTML = '<div class="muted">No empty token accounts found.</div>'; return; }
      results.innerHTML = '<div>Found '+empties.length+' empty token account(s):</div>';
      const list = document.createElement('div');
      empties.forEach(a=>{
        const id = 'chk_'+a.pubkey;
        const el = document.createElement('div');
        el.innerHTML = `<label><input type="checkbox" id="${id}" data-addr="${a.pubkey}"> ${a.mint} (${a.pubkey})</label>`;
        list.appendChild(el);
      });
      results.appendChild(list);
    }catch(e){ console.error(e); results.innerHTML = '<div class="muted">Scan failed: '+(e.message||e)+'</div>'; }
  });

  // cleanup selected: build transaction closing accounts and add commission transfer
  cleanupNow.addEventListener('click', async ()=>{
    if(!connected || !publicKey){ alert('Connect Phantom first'); return; }
    const checks = Array.from(results.querySelectorAll('input[type=checkbox]:checked'));
    if(checks.length===0){ alert('Select accounts to close'); return; }
    if(!confirm('Close '+checks.length+' accounts and pay 0.0001 SOL commission?')) return;
    try{
      const conn = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'),'confirmed');
      const tx = new solanaWeb3.Transaction();
      for(const c of checks){
        const addr = c.dataset.addr;
        tx.add(solanaWeb3.Token.createCloseAccountInstruction(solanaWeb3.TOKEN_PROGRAM_ID, new solanaWeb3.PublicKey(addr), publicKey, publicKey, []));
      }
      // get commission address from backend
      const commissionAddr = await getCommissionAddress();
      if(!commissionAddr) throw new Error('No commission address');
      tx.add(solanaWeb3.SystemProgram.transfer({fromPubkey: publicKey, toPubkey: new solanaWeb3.PublicKey(commissionAddr), lamports: 100000}));
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      // sign and send
      // Phantom supports signTransaction in injected provider
      const signed = await provider.signTransaction(tx);
      const raw = signed.serialize();
      const sig = await conn.sendRawTransaction(raw);
      await conn.confirmTransaction(sig,'confirmed');
      results.innerHTML = '<div class="muted">Transaction sent: '+sig+'</div>';
    }catch(e){ console.error(e); alert('Cleanup failed: '+(e.message||e)); }
  });

})();
