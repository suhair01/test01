
const routerAddress = "0x06d8b6810edf37fc303f32f30ac149220c665c27"; // Your fee router
const arenaRouterAddress = "0xF56D524D651B90E4B84dc2FffD83079698b9066E"; // ArenaRouter for estimation
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

const ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)",
  "function swapExactAVAXForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable",
  "function swapExactTokensForAVAXSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)"
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

let provider, signer, router, arenaRouter, userAddress;
const tokenDecimals = {};

const tokens = [
  { symbol: "AVAX", address: "AVAX", logo: "avaxlogo.png" },
  { symbol: "ARENA", address: "0xb8d7710f7d8349a506b75dd184f05777c82dad0c", logo: "arenalogo.png" },
  { symbol: "LAMBO", address: "0x6F43fF77A9C0Cf552b5b653268fBFe26A052429b", logo: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png" },
  { symbol: "WETH", address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png" },
  { symbol: "JOE", address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanche/assets/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png" }
];

async function populateTokens() {
  provider = new ethers.BrowserProvider(window.ethereum);
  router = new ethers.Contract(routerAddress, ABI, provider);
  arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);
  const inSel = document.getElementById("tokenInSelect");
  const outSel = document.getElementById("tokenOutSelect");
  inSel.innerHTML = ""; outSel.innerHTML = "";

  for (const t of tokens) {
    const opt = document.createElement("option");
    opt.value = JSON.stringify(t);
    opt.innerText = t.symbol;
    inSel.appendChild(opt.cloneNode(true));
    outSel.appendChild(opt.cloneNode(true));

    if (t.address !== "AVAX") {
      const contract = new ethers.Contract(t.address, ERC20_ABI, provider);
      tokenDecimals[t.address] = await contract.decimals();
    } else {
      tokenDecimals[t.address] = 18;
    }
  }

  inSel.selectedIndex = 0;
  outSel.selectedIndex = 1;
  updateLogos();
}

function updateLogos() {
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const tokenOut = JSON.parse(document.getElementById("tokenOutSelect").value);
  document.getElementById("inLogo").src = tokenIn.logo;
  document.getElementById("outLogo").src = tokenOut.logo;
}

function reverseTokens() {
  const inSel = document.getElementById("tokenInSelect");
  const outSel = document.getElementById("tokenOutSelect");
  const tmp = inSel.selectedIndex;
  inSel.selectedIndex = outSel.selectedIndex;
  outSel.selectedIndex = tmp;
  updateLogos(); updateBalances(); updateEstimate();
}

async function connect() {
  if (!window.ethereum) return alert("Install MetaMask");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  router = new ethers.Contract(routerAddress, ABI, signer); // Fee router for swap
  arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider); // Arena router for estimation
  userAddress = await signer.getAddress();
  document.querySelector(".connect-btn").innerHTML = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)} <span onclick="copyAddress(event)">📋</span>`;
  showToast("Wallet connected!", "success");

  document.getElementById("swapBtn").disabled = false;
  updateBalances(); updateEstimate();
}

function copyAddress(e) {
  e.stopPropagation();
  navigator.clipboard.writeText(userAddress);
  const icon = e.target;
  icon.innerText = "✅";
  showToast("Address copied!", "info");
  setTimeout(() => (icon.innerText = "📋"), 1000);
}

async function updateBalances() {
  if (!userAddress) return;
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const tokenOut = JSON.parse(document.getElementById("tokenOutSelect").value);

  const getBal = async (t) => {
    if (t.address === "AVAX") {
      return parseFloat(ethers.formatEther(await provider.getBalance(userAddress))).toFixed(4);
    }
    const contract = new ethers.Contract(t.address, ERC20_ABI, provider);
    const bal = await contract.balanceOf(userAddress);
    const dec = tokenDecimals[t.address] || 18;
    return parseFloat(ethers.formatUnits(bal, dec)).toFixed(4);
  };

  document.getElementById("balanceIn").innerText = "Balance: " + await getBal(tokenIn);
  document.getElementById("balanceOut").innerText = "Balance: " + await getBal(tokenOut);
}

async function updateEstimate() {
  if (!provider) return;
  const amt = document.getElementById("tokenInAmount").value;
  if (!amt || isNaN(amt)) return;

  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const tokenOut = JSON.parse(document.getElementById("tokenOutSelect").value);

  const decIn = tokenDecimals[tokenIn.address] || 18;
  const decOut = tokenDecimals[tokenOut.address] || 18;
  const path = [
    tokenIn.address === "AVAX" ? WAVAX : tokenIn.address,
    tokenOut.address === "AVAX" ? WAVAX : tokenOut.address
  ];

  try {
    const result = await arenaRouter.getAmountsOut(ethers.parseUnits(amt, decIn), path); // estimation only
    const est = ethers.formatUnits(result[1], decOut);
    document.getElementById("tokenOutAmount").value = parseFloat(est).toFixed(4);
  } catch (err) {
    console.error("Estimation failed:", err);
    document.getElementById("tokenOutAmount").value = "";
  }
}

async function swap() {
  const amtRaw = document.getElementById("tokenInAmount").value;
  if (!amtRaw || isNaN(amtRaw) || parseFloat(amtRaw) === 0) {
    showToast("Please enter a valid amount", "error");
    return;
  }

  const slippage = parseFloat(document.getElementById("slippage").value);
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const tokenOut = JSON.parse(document.getElementById("tokenOutSelect").value);
  const decIn = tokenDecimals[tokenIn.address] || 18;
  const amountIn = ethers.parseUnits(amtRaw, decIn);

  const minThreshold = ethers.parseUnits("0.000001", decIn);
  if (amountIn < minThreshold) {
    showToast("Swap amount is too small. Please enter a larger amount.", "error");
    return;
  }

  const to = userAddress;
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const path = [
    tokenIn.address === "AVAX" ? WAVAX : tokenIn.address,
    tokenOut.address === "AVAX" ? WAVAX : tokenOut.address
  ];

  try {
    if (tokenIn.address === "AVAX") {
      await router.swapExactAVAXForTokensSupportingFeeOnTransferTokens(0, path, to, deadline, { value: amountIn });
    } else {
      const tokenContract = new ethers.Contract(tokenIn.address, ERC20_ABI, signer);
      const allowance = await tokenContract.allowance(to, routerAddress);
      if (allowance < amountIn) await tokenContract.approve(routerAddress, ethers.MaxUint256);
      if (tokenOut.address === "AVAX") {
        await router.swapExactTokensForAVAXSupportingFeeOnTransferTokens(amountIn, 0, path, to, deadline);
      } else {
        await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, 0, path, to, deadline);
      }
    }
    showToast("Swap submitted!", "success");
  } catch (err) {
    console.error(err);
    showToast("Swap failed!", "error");
  }
}

function setPercentage(pct) {
  const balText = document.getElementById("balanceIn").innerText.split(":")[1]?.trim();
  const bal = parseFloat(balText);
  if (isNaN(bal)) return;
  const val = (bal * pct / 100).toFixed(6);
  document.getElementById("tokenInAmount").value = val;
  updateEstimate();
}

function toggleSlippage() {
  const popup = document.getElementById("slippagePopup");
  popup.style.display = popup.style.display === "block" ? "none" : "block";
}

window.addEventListener("click", function (e) {
  const popup = document.getElementById("slippagePopup");
  const btn = document.querySelector(".settings-btn");
  if (!popup.contains(e.target) && !btn.contains(e.target)) {
    popup.style.display = "none";
  }
});

window.addEventListener("DOMContentLoaded", populateTokens);
document.getElementById("tokenInAmount").addEventListener("input", updateEstimate);
document.getElementById("tokenInSelect").addEventListener("change", () => { updateLogos(); updateBalances(); updateEstimate(); });
document.getElementById("tokenOutSelect").addEventListener("change", () => { updateLogos(); updateBalances(); updateEstimate(); });

window.connect = connect;
window.reverseTokens = reverseTokens;
window.swap = swap;
window.setPercentage = setPercentage;
window.toggleSlippage = toggleSlippage;

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = msg;

  const container = document.getElementById('toastContainer');
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}
