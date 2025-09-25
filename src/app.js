
// Frontend logic with wallet support
const BACKEND_URL = "/api";

let wallet = null;

async function connectWallet(type = "phantom") {
  try {
    if (type === "phantom" && window.solana && window.solana.isPhantom) {
      wallet = window.solana;
      await wallet.connect();
      document.getElementById("wallet-status").innerText =
        "Connected Phantom: " + wallet.publicKey.toString();
    } else if (type === "solflare" && window.solflare) {
      wallet = window.solflare;
      await wallet.connect();
      document.getElementById("wallet-status").innerText =
        "Connected Solflare: " + wallet.publicKey.toString();
    } else {
      alert("Wallet not installed: " + type);
    }
  } catch (err) {
    console.error("Wallet connection error:", err);
    alert("Failed to connect wallet");
  }
}

async function fetchData() {
  try {
    const res = await fetch(`${BACKEND_URL}/status`);
    const data = await res.json();
    console.log("Backend says:", data);
  } catch (err) {
    console.error("Error connecting to backend:", err);
  }
}
fetchData();
