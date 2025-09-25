
// Frontend logic using Netlify redirect proxy
const BACKEND_URL = "/api";

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
