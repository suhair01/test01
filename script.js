// RubySwap Final Script: Integrated AVAX/WAVAX, Slippage, Profile, and Swap
const routerAddress = "0x06d8b6810edf37fc303f32f30ac149220c665c27";
const arenaRouterAddress = "0xF56D524D651B90E4B84dc2FffD83079698b9066E";
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

const AVALANCHE_PARAMS = {
  chainId: '0xA86A',
  chainName: 'Avalanche C-Chain',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
  blockExplorerUrls: ['https://snowtrace.io']
};

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
  if (!window.ethereum) return alert("Please install MetaMask");
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== AVALANCHE_PARAMS.chainId) {
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: AVALANCHE_PARAMS.chainId }] });
      } catch (err) {
        if (err.code === 4902) {
          await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [AVALANCHE_PARAMS] });
        } else {
          return showToast("Please switch to Avalanche", "error");
        }
      }
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    router = new ethers.Contract(routerAddress, ABI, signer);
    arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);
    userAddress = await signer.getAddress();

    document.getElementById("profileAddress").innerText = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    document.querySelector(".connect-btn").innerHTML = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)} <span onclick="copyAddress(event)">📋</span>`;
    document.getElementById("swapBtn").disabled = false;
    showToast("Wallet connected!", "success");
    updateBalances();
    updateEstimate();
  } catch (err) {
    console.error(err);
    showToast("Wallet connection failed!", "error");
  }
}

function copyAddress(e) {
  e.stopPropagation();
  navigator.clipboard.writeText(userAddress);
  const icon = e.target;
  icon.innerText = "✅";
  showToast("Address copied!", "info");
  setTimeout(() => (icon.innerText = "📋"), 1000);
}

function toggleProfile() {
  const dropdown = document.getElementById("profileDropdown");
  dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
}

async function updateBalances() {
  if (!userAddress) return;
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const tokenOut = JSON.parse(document.getElementById("tokenOutSelect").value);

  const getBal = async (t) => {
    if (t.address === "AVAX") return parseFloat(ethers.formatEther(await provider.getBalance(userAddress))).toFixed(4);
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
    const result = await arenaRouter.getAmountsOut(ethers.parseUnits(amt, decIn), path);
    const est = ethers.formatUnits(result[1], decOut);
    document.getElementById("tokenOutAmount").value = tokenOut.address === "AVAX" ? parseFloat(est).toFixed(4) : Math.floor(parseFloat(est));
  } catch {
    document.getElementById("tokenOutAmount").value = "";
  }
}

// ✅ SLIPPAGE-INTEGRATED SWAP
async function swap() {
  const amt = document.getElementById("tokenInAmount").value;
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const tokenOut = JSON.parse(document.getElementById("tokenOutSelect").value);
  const decIn = tokenDecimals[tokenIn.address] || 18;
  const decOut = tokenDecimals[tokenOut.address] || 18;
  const amountIn = ethers.parseUnits(amt, decIn);
  const to = userAddress;
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const path = [
    tokenIn.address === "AVAX" ? WAVAX : tokenIn.address,
    tokenOut.address === "AVAX" ? WAVAX : tokenOut.address
  ];

  const slippageInput = parseFloat(document.getElementById("slippage").value);
  const slippagePercent = isNaN(slippageInput) ? 1 : slippageInput;

  try {
    const expectedOut = await arenaRouter.getAmountsOut(amountIn, path);
    const rawOut = expectedOut[1];
    const minOut = rawOut - (rawOut * slippagePercent) / 100n;

    if (tokenIn.address === "AVAX") {
      await router.swapExactAVAXForTokensSupportingFeeOnTransferTokens(minOut, path, to, deadline, { value: amountIn });
    } else {
      const tokenContract = new ethers.Contract(tokenIn.address, ERC20_ABI, signer);
      const allowance = await tokenContract.allowance(to, routerAddress);
      if (allowance < amountIn) await tokenContract.approve(routerAddress, ethers.MaxUint256);
      if (tokenOut.address === "AVAX") {
        await router.swapExactTokensForAVAXSupportingFeeOnTransferTokens(amountIn, minOut, path, to, deadline);
      } else {
        await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, minOut, path, to, deadline);
      }
    }

    showToast("Swap submitted!", "success");
  } catch (err) {
    showToast("Swap failed!", "error");
  }
}

function setPercentage(pct) {
  const balText = document.getElementById("balanceIn").innerText.split(":")[1]?.trim();
  const bal = parseFloat(balText);
  if (isNaN(bal)) return;
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const val = (bal * pct / 100);
  document.getElementById("tokenInAmount").value = tokenIn.address === "AVAX" ? parseFloat(val).toFixed(4) : Math.floor(parseFloat(val));
  updateEstimate();
}

function toggleSlippage() {
  const popup = document.getElementById("slippagePopup");
  popup.style.display = popup.style.display === "block" ? "none" : "block";
}

window.addEventListener("click", function (e) {
  const profileDropdown = document.getElementById("profileDropdown");
  const profileWrapper = document.querySelector(".profile-wrapper");
  const slippagePopup = document.getElementById("slippagePopup");
  const slippageBtn = document.querySelector(".settings-btn");

  if (profileDropdown && profileWrapper && !profileWrapper.contains(e.target)) {
    profileDropdown.style.display = "none";
  }
  if (slippagePopup && slippageBtn && !slippagePopup.contains(e.target) && !slippageBtn.contains(e.target)) {
    slippagePopup.style.display = "none";
  }
});

window.addEventListener("DOMContentLoaded", populateTokens);
document.getElementById("tokenInAmount").addEventListener("input", function (e) {
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  let val = e.target.value.replace(/[^0-9.]/g, "");
  const parts = val.split(".");
  if (parts.length > 2) val = parts[0] + "." + parts[1];
  if (tokenIn.address === "AVAX") {
    if (parts[1] && parts[1].length > 4) val = parts[0] + "." + parts[1].substring(0, 4);
    e.target.value = val;
  } else {
    if (val.includes(".")) showToast(`Decimals removed: rounded down to ${parts[0]}`, "info");
    e.target.value = parts[0];
  }
  updateEstimate();
});

document.getElementById("tokenInSelect").addEventListener("change", () => { updateLogos(); updateBalances(); updateEstimate(); });
document.getElementById("tokenOutSelect").addEventListener("change", () => { updateLogos(); updateBalances(); updateEstimate(); });

window.connect = connect;
window.reverseTokens = reverseTokens;
window.swap = swap;
window.setPercentage = setPercentage;
window.toggleSlippage = toggleSlippage;
window.copyAddress = copyAddress;

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = msg;
  document.getElementById('toastContainer').appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
function viewTransactions() {
  showToast("Coming soon: View Transactions", "info");
}

function showHoldings() {
  showToast("Coming soon: Token Holdings", "info");
}

function disconnect() {
  userAddress = null;
  document.getElementById("profileAddress").innerText = "Not Connected";
  document.querySelector(".connect-btn").innerText = "Connect Wallet";
  document.getElementById("swapBtn").disabled = true;
  document.getElementById("balanceIn").innerText = "Balance: 0";
  document.getElementById("balanceOut").innerText = "Balance: 0";
  document.getElementById("tokenInAmount").value = "";
  document.getElementById("tokenOutAmount").value = "";
  showToast("Disconnected!", "info");
}
window.viewTransactions = viewTransactions;
window.showHoldings = showHoldings;
window.disconnect = disconnect;

function toggleProfileDropdown(event) {
  event.stopPropagation();
  const dropdown = document.getElementById("profileDropdown");
  dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
}
window.toggleProfileDropdown = toggleProfileDropdown;
