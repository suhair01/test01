// FULL INLINE JS CODE (token modal view, logos, slippage, swap, estimate, AVAX logic)
// Due to length constraints, I will split it into multiple messages
// Message 1/3 ⬇️

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

let selectingType = "in";
let selectedTokenIn = tokens[0];
let selectedTokenOut = tokens[1];

// Continue in next message...
async function populateTokens() {
  provider = new ethers.BrowserProvider(window.ethereum);
  router = new ethers.Contract(routerAddress, ABI, provider);
  arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);

  for (const t of tokens) {
    if (t.address !== "AVAX") {
      const contract = new ethers.Contract(t.address, ERC20_ABI, provider);
      tokenDecimals[t.address] = await contract.decimals();
    } else {
      tokenDecimals[t.address] = 18;
    }
  }

  updateLogos();
  updateBalances();
  updateEstimate();
}

function updateLogos() {
  document.getElementById("inLogo").src = selectedTokenIn.logo;
  document.getElementById("outLogo").src = selectedTokenOut.logo;
  document.getElementById("tokenInSymbol").innerText = selectedTokenIn.symbol;
  document.getElementById("tokenOutSymbol").innerText = selectedTokenOut.symbol;
}

function reverseTokens() {
  [selectedTokenIn, selectedTokenOut] = [selectedTokenOut, selectedTokenIn];
  updateLogos();
  updateBalances();
  updateEstimate();
}

function openTokenModal(type) {
  selectingType = type;
  document.getElementById("tokenModal").style.display = "flex";
  renderTokenList();
}

function closeTokenModal() {
  document.getElementById("tokenModal").style.display = "none";
}

function renderTokenList() {
  const list = document.getElementById("tokenList");
  list.innerHTML = "";

  tokens.forEach(t => {
    const item = document.createElement("div");
    item.className = "token-item";
    item.innerHTML = `
      <img src="${t.logo}" />
      <div class="token-info">
        <div class="token-symbol">${t.symbol}</div>
        <div class="token-address">${t.address.slice(0, 6)}...${t.address.slice(-4)}</div>
      </div>
      <div class="copy-btn" onclick="event.stopPropagation(); copyText('${t.address}')">📋</div>
    `;
    item.onclick = () => {
      if (selectingType === "in") {
        selectedTokenIn = t;
      } else {
        selectedTokenOut = t;
      }
      closeTokenModal();
      updateLogos();
      updateBalances();
      updateEstimate();
    };
    list.appendChild(item);
  });
}

function filterTokens() {
  const keyword = document.getElementById("tokenSearch").value.toLowerCase();
  const filtered = tokens.filter(t =>
    t.symbol.toLowerCase().includes(keyword) ||
    t.address.toLowerCase().includes(keyword)
  );
  const list = document.getElementById("tokenList");
  list.innerHTML = "";
  filtered.forEach(t => {
    const item = document.createElement("div");
    item.className = "token-item";
    item.innerHTML = `
      <img src="${t.logo}" />
      <div class="token-info">
        <div class="token-symbol">${t.symbol}</div>
        <div class="token-address">${t.address.slice(0,6)}...${t.address.slice(-4)}</div>
      </div>
      <div class="copy-btn" onclick="event.stopPropagation(); copyText('${t.address}')">📋</div>
    `;
    item.onclick = () => {
      if (selectingType === "in") {
        selectedTokenIn = t;
      } else {
        selectedTokenOut = t;
      }
      closeTokenModal();
      updateLogos();
      updateBalances();
      updateEstimate();
    };
    list.appendChild(item);
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  showToast("Copied address", "info");
}

// Final message (3/3) will include: connect(), swap(), updateEstimate(), and DOM bindings
async function connect() {
  if (!window.ethereum) return alert("Install MetaMask");

  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const chainId = await window.ethereum.request({ method: "eth_chainId" });

    if (chainId !== AVALANCHE_PARAMS.chainId) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: AVALANCHE_PARAMS.chainId }],
        });
      } catch (err) {
        if (err.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [AVALANCHE_PARAMS],
          });
        } else {
          return showToast("Switch to Avalanche failed", "error");
        }
      }
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    router = new ethers.Contract(routerAddress, ABI, signer);
    userAddress = await signer.getAddress();

    document.querySelector(".connect-btn").innerHTML =
      `${userAddress.slice(0, 6)}...${userAddress.slice(-4)} <span onclick="copyAddress(event)">📋</span>`;
    showToast("Wallet connected!", "success");

    updateBalances();
    updateEstimate();
  } catch (err) {
    console.error(err);
    showToast("Connection failed!", "error");
  }
}

async function updateEstimate() {
  if (!provider) return;
  const amt = document.getElementById("tokenInAmount").value;
  if (!amt || isNaN(amt)) return;

  const decIn = tokenDecimals[selectedTokenIn.address] || 18;
  const decOut = tokenDecimals[selectedTokenOut.address] || 18;

  const path = [
    selectedTokenIn.address === "AVAX" ? WAVAX : selectedTokenIn.address,
    selectedTokenOut.address === "AVAX" ? WAVAX : selectedTokenOut.address
  ];

  try {
    const result = await arenaRouter.getAmountsOut(ethers.parseUnits(amt, decIn), path);
    const est = ethers.formatUnits(result[1], decOut);
    document.getElementById("tokenOutAmount").value =
      selectedTokenOut.address === "AVAX" ? parseFloat(est).toFixed(4) : Math.floor(est);
  } catch {
    document.getElementById("tokenOutAmount").value = "";
  }
}

async function swap() {
  const amt = document.getElementById("tokenInAmount").value;
  if (!amt || isNaN(amt)) return showToast("Enter amount", "error");

  const decIn = tokenDecimals[selectedTokenIn.address] || 18;
  const amountIn = ethers.parseUnits(amt, decIn);
  const to = userAddress;
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const path = [
    selectedTokenIn.address === "AVAX" ? WAVAX : selectedTokenIn.address,
    selectedTokenOut.address === "AVAX" ? WAVAX : selectedTokenOut.address
  ];

  try {
    if (selectedTokenIn.address === "AVAX") {
      await router.swapExactAVAXForTokensSupportingFeeOnTransferTokens(0, path, to, deadline, { value: amountIn });
    } else {
      const tokenContract = new ethers.Contract(selectedTokenIn.address, ERC20_ABI, signer);
      const allowance = await tokenContract.allowance(to, routerAddress);
      if (allowance < amountIn) await tokenContract.approve(routerAddress, ethers.MaxUint256);

      if (selectedTokenOut.address === "AVAX") {
        await router.swapExactTokensForAVAXSupportingFeeOnTransferTokens(amountIn, 0, path, to, deadline);
      } else {
        await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, 0, path, to, deadline);
      }
    }

    showToast("Swap submitted", "success");
  } catch (err) {
    console.error(err);
    showToast("Swap failed", "error");
  }
}

// Input handlers
document.getElementById("tokenInAmount").addEventListener("input", e => {
  let val = e.target.value.replace(/[^0-9.]/g, "");
  const parts = val.split(".");
  if (parts.length > 2) val = parts[0] + "." + parts[1];

  if (selectedTokenIn.address === "AVAX") {
    if (parts[1] && parts[1].length > 4) parts[1] = parts[1].substring(0, 4);
    val = parts.join(".");
  } else {
    val = parts[0];
    if (parts[1]) showToast(`Rounded down to ${val}`, "info");
  }

  e.target.value = val;
  updateEstimate();
});

// Expose to window
window.connect = connect;
window.swap = swap;
window.reverseTokens = reverseTokens;
window.openTokenModal = openTokenModal;
window.closeTokenModal = closeTokenModal;
window.filterTokens = filterTokens;
window.setPercentage = setPercentage;
