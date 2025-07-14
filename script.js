
const routerAddress = "0x06d8b6810edf37fc303f32f30ac149220c665c27"; // Your fee router
const arenaRouterAddress = "0xF56D524D651B90E4B84dc2FffD83079698b9066E"; // ArenaRouter for estimation
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
  document.getElementById("inSymbol").innerText = tokenIn.symbol;

  document.getElementById("outLogo").src = tokenOut.logo;
  document.getElementById("outSymbol").innerText = tokenOut.symbol;
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
    // Request wallet connection
    await window.ethereum.request({ method: "eth_requestAccounts" });

    // Check chain ID
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });

    if (chainId !== AVALANCHE_PARAMS.chainId) {
      // Not on Avalanche → try to switch
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: AVALANCHE_PARAMS.chainId }],
        });
      } catch (err) {
        // If Avalanche not added yet
        if (err.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [AVALANCHE_PARAMS],
            });
          } catch (addErr) {
            console.error("Add Avalanche failed:", addErr);
            showToast("Failed to add Avalanche", "error");
            return;
          }
        } else {
          console.error("Switch chain failed:", err);
          showToast("Please switch to Avalanche", "error");
          return;
        }
      }
    }

    // Continue connecting wallet
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    router = new ethers.Contract(routerAddress, ABI, signer);
    arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);
    userAddress = await signer.getAddress();

    // Show address in UI
    document.querySelector(".connect-btn").innerHTML = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)} <span onclick="copyAddress(event)">📋</span>`;
    document.getElementById("swapBtn").disabled = false;
    showToast("Wallet connected!", "success");

    // Update balances and estimates
    updateBalances();
    updateEstimate();
  } catch (err) {
    console.error("Connection failed:", err);
    showToast("Wallet connection failed!", "error");
  }
}

async function switchToAvalanche() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: AVALANCHE_PARAMS.chainId }]
    });
    location.reload();
  } catch (err) {
    if (err.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [AVALANCHE_PARAMS]
        });
        location.reload();
      } catch (addError) {
        showToast("Failed to add Avalanche", "error");
        console.error(addError);
      }
    } else {
      showToast("Switch network failed!", "error");
      console.error(err);
    }
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
  const el = document.getElementById("profilePopover");
  if (!userAddress) {
    showToast("Connect wallet first", "error");
    return;
  }

  if (el.style.display === "block") {
    el.style.display = "none";
  } else {
    const shortened = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    document.getElementById("profileAddress").innerText = shortened;
    document.getElementById("snowtraceLink").href = `https://snowtrace.io/address/${userAddress}`;
    el.style.display = "block";
  }
}

function copyAddress() {
  if (!userAddress) return;
  navigator.clipboard.writeText(userAddress);
  showToast("Address copied!", "info");
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
  document.getElementById("tokenOutAmount").value =
  tokenOut.address === "AVAX"
    ? parseFloat(est).toFixed(4)
    : Math.floor(parseFloat(est));

  } catch (err) {
    console.error("Estimation failed:", err);
    document.getElementById("tokenOutAmount").value = "";
  }
}

async function swap() {
  const amt = document.getElementById("tokenInAmount").value;
  const slippage = parseFloat(document.getElementById("slippage").value);
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const tokenOut = JSON.parse(document.getElementById("tokenOutSelect").value);
  const decIn = tokenDecimals[tokenIn.address] || 18;
  const amountIn = ethers.parseUnits(amt, decIn);
  const to = userAddress;
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const path = [
    tokenIn.address === "AVAX" ? WAVAX : tokenIn.address,
    tokenOut.address === "AVAX" ? WAVAX : tokenOut.address
  ];

  try {
    if (tokenIn.address === "AVAX") {
      const tx = await router.swapExactAVAXForTokensSupportingFeeOnTransferTokens(0, path, to, deadline, { value: amountIn });
      showToast("Swap submitted!", "success");
    } else {
      const tokenContract = new ethers.Contract(tokenIn.address, ERC20_ABI, signer);
      const allowance = await tokenContract.allowance(to, routerAddress);
      if (allowance < amountIn) await tokenContract.approve(routerAddress, ethers.MaxUint256);
      const tx = tokenOut.address === "AVAX"
        ? await router.swapExactTokensForAVAXSupportingFeeOnTransferTokens(amountIn, 0, path, to, deadline)
        : await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, 0, path, to, deadline);
      showToast("Swap submitted!", "success");
    }
  } catch (err) {
    console.error(err);
    showToast("Swap failed!", "error");
  }
}

function setPercentage(pct) {
  const balText = document.getElementById("balanceIn").innerText.split(":")[1]?.trim();
  const bal = parseFloat(balText);
  if (isNaN(bal)) return;
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const val = (bal * pct / 100);

  document.getElementById("tokenInAmount").value =
    tokenIn.address === "AVAX"
      ? parseFloat(val).toFixed(4)
      : Math.floor(parseFloat(val));

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
document.getElementById("tokenInAmount").addEventListener("input", function (e) {
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  let val = e.target.value;

  // Allow only numbers and a single dot
  val = val.replace(/[^0-9.]/g, "");
  const parts = val.split(".");
  if (parts.length > 2) val = parts[0] + "." + parts[1];

  if (tokenIn.address === "AVAX") {
    // Allow up to 4 decimals
    if (parts[1] && parts[1].length > 4) {
      parts[1] = parts[1].substring(0, 4);
      val = parts.join(".");
    }
    e.target.value = val;
  } else {
    // For non-AVAX tokens: only allow integers
    const intVal = parts[0];
    if (val.includes(".") && parts[1] !== "0") {
      showToast(`Decimals removed: rounded down to ${intVal}`, "info");
    }
    e.target.value = intVal;
  }

  updateEstimate();
});

document.getElementById("tokenInSelect").addEventListener("change", () => { updateLogos(); updateBalances(); updateEstimate(); });
document.getElementById("tokenOutSelect").addEventListener("change", () => { updateLogos(); updateBalances(); updateEstimate(); });

// Clean final exports
window.connect = connect;
window.reverseTokens = reverseTokens;
window.swap = swap;
window.setPercentage = setPercentage;
window.toggleSlippage = toggleSlippage;
window.switchToAvalanche = switchToAvalanche;
window.toggleProfile = toggleProfile;

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

let selectedField = null;

function openModal(field) {
  selectedField = field; // 'in' or 'out'
  document.getElementById("tokenModal").style.display = "flex";
  renderTokenList();
}

function closeModal() {
  document.getElementById("tokenModal").style.display = "none";
  document.getElementById("tokenSearch").value = "";
}

function renderTokenList() {
  const list = document.getElementById("tokenList");
  list.innerHTML = "";
  tokens.forEach(t => {
    const item = document.createElement("div");
    item.className = "token-item";
    item.onclick = () => selectToken(t);

    item.innerHTML = `
      <div class="token-left">
        <img src="${t.logo}" class="token-logo" />
        <div>
          <div class="token-symbol">${t.symbol}</div>
          <div class="token-address">${shorten(t.address)}</div>
        </div>
      </div>
      <div class="copy-btn" onclick="event.stopPropagation(); copyToClipboard('${t.address}')">📋</div>
    `;
    list.appendChild(item);
  });
}

function selectToken(token) {
  const selectEl = selectedField === "in" ? document.getElementById("tokenInSelect") : document.getElementById("tokenOutSelect");
  [...selectEl.options].forEach((opt, i) => {
    if (JSON.parse(opt.value).address === token.address) {
      selectEl.selectedIndex = i;
    }
  });
  closeModal();
  updateLogos();
  updateBalances();
  updateEstimate();
}

function filterTokens() {
  const query = document.getElementById("tokenSearch").value.toLowerCase();
  const items = document.querySelectorAll("#tokenList .token-item");
  tokens.forEach((t, i) => {
    const visible = t.symbol.toLowerCase().includes(query) || t.address.toLowerCase().includes(query);
    items[i].style.display = visible ? "flex" : "none";
  });
}

function shorten(addr) {
  return addr === "AVAX" ? "AVAX" : addr.slice(0, 6) + "..." + addr.slice(-4);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showToast("Copied to clipboard", "info");
}

window.reloadEstimate = async function () {
  const btn = document.querySelector(".reload-btn");

  if (!btn) return;

  try {
    // Start animation (spin icon)
    btn.classList.add("active");
    btn.disabled = true;

    // Optional visual cue (change color or show toast)
    showToast("Refreshing estimate...", "info");

    // Wait for estimate to complete
    await updateEstimate();

    // Optional: Toast feedback
    showToast("Estimate updated!", "success");
  } catch (err) {
    console.error("Reload estimate failed:", err);
    showToast("Failed to update estimate!", "error");
  } finally {
    // End animation
    setTimeout(() => {
      btn.classList.remove("active");
      btn.disabled = false;
    }, 500); // match spin CSS duration
  }
};

