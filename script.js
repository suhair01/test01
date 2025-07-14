<script type="module">
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.7.0/+esm";

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

let selectedTokenIn = tokens[0];
let selectedTokenOut = tokens[1];
let selectingType = "in";

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

  updateUI();
}

function updateUI() {
  document.getElementById("inLogo").src = selectedTokenIn.logo;
  document.getElementById("outLogo").src = selectedTokenOut.logo;
  document.getElementById("tokenInSymbol").innerText = selectedTokenIn.symbol;
  document.getElementById("tokenOutSymbol").innerText = selectedTokenOut.symbol;
  updateBalances();
  updateEstimate();
}

function openTokenModal(type) {
  selectingType = type;
  document.getElementById("tokenModal").style.display = "flex";
  document.getElementById("tokenSearch").value = "";
  renderTokenList(tokens);
}

function closeTokenModal() {
  document.getElementById("tokenModal").style.display = "none";
}

function renderTokenList(list) {
  const container = document.getElementById("tokenList");
  container.innerHTML = "";
  list.forEach(t => {
    const item = document.createElement("div");
    item.className = "token-item";
    item.innerHTML = `
      <img src="${t.logo}" />
      <div class="token-info">
        <div class="token-symbol">${t.symbol}</div>
        <div class="token-address">${t.address.slice(0, 6)}...${t.address.slice(-4)}</div>
      </div>
      <div class="copy-btn" onclick="event.stopPropagation(); navigator.clipboard.writeText('${t.address}'); showToast('Copied')">📋</div>
    `;
    item.onclick = () => {
      if (selectingType === "in") selectedTokenIn = t;
      else selectedTokenOut = t;
      closeTokenModal();
      updateUI();
    };
    container.appendChild(item);
  });
}

function filterTokens() {
  const keyword = document.getElementById("tokenSearch").value.toLowerCase();
  const filtered = tokens.filter(t =>
    t.symbol.toLowerCase().includes(keyword) ||
    t.address.toLowerCase().includes(keyword)
  );
  renderTokenList(filtered);
}

function reverseTokens() {
  [selectedTokenIn, selectedTokenOut] = [selectedTokenOut, selectedTokenIn];
  updateUI();
}

async function connect() {
  if (!window.ethereum) return alert("Install MetaMask");

  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });

    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== AVALANCHE_PARAMS.chainId) {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: AVALANCHE_PARAMS.chainId }] });
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    router = new ethers.Contract(routerAddress, ABI, signer);
    userAddress = await signer.getAddress();

    document.querySelector(".connect-btn").innerHTML =
      `${userAddress.slice(0, 6)}...${userAddress.slice(-4)} <span onclick="copyAddress(event)">📋</span>`;

    updateBalances();
    updateEstimate();
    showToast("Wallet connected", "success");
  } catch (err) {
    console.error(err);
    showToast("Connection failed", "error");
  }
}

async function updateBalances() {
  if (!userAddress) return;
  const getBal = async (t) => {
    if (t.address === "AVAX") {
      return parseFloat(ethers.formatEther(await provider.getBalance(userAddress))).toFixed(4);
    }
    const contract = new ethers.Contract(t.address, ERC20_ABI, provider);
    const bal = await contract.balanceOf(userAddress);
    const dec = tokenDecimals[t.address] || 18;
    return parseFloat(ethers.formatUnits(bal, dec)).toFixed(4);
  };

  document.getElementById("balanceIn").innerText = "Balance: " + await getBal(selectedTokenIn);
  document.getElementById("balanceOut").innerText = "Balance: " + await getBal(selectedTokenOut);
}

async function updateEstimate() {
  const amt = document.getElementById("tokenInAmount").value;
  if (!amt || isNaN(amt)) return;
  const path = [
    selectedTokenIn.address === "AVAX" ? WAVAX : selectedTokenIn.address,
    selectedTokenOut.address === "AVAX" ? WAVAX : selectedTokenOut.address
  ];
  try {
    const result = await arenaRouter.getAmountsOut(
      ethers.parseUnits(amt, tokenDecimals[selectedTokenIn.address]),
      path
    );
    const est = ethers.formatUnits(result[1], tokenDecimals[selectedTokenOut.address]);
    document.getElementById("tokenOutAmount").value =
      selectedTokenOut.address === "AVAX"
        ? parseFloat(est).toFixed(4)
        : Math.floor(est);
  } catch {
    document.getElementById("tokenOutAmount").value = "";
  }
}

async function swap() {
  const amt = document.getElementById("tokenInAmount").value;
  const amountIn = ethers.parseUnits(amt, tokenDecimals[selectedTokenIn.address]);
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

function copyAddress(e) {
  e.stopPropagation();
  navigator.clipboard.writeText(userAddress);
  e.target.innerText = "✅";
  showToast("Copied!", "info");
  setTimeout(() => (e.target.innerText = "📋"), 1000);
}

function setPercentage(pct) {
  const bal = parseFloat(document.getElementById("balanceIn").innerText.split(":")[1]);
  const val = (bal * pct / 100).toFixed(4);
  document.getElementById("tokenInAmount").value =
    selectedTokenIn.address === "AVAX" ? val : Math.floor(val);
  updateEstimate();
}

function showToast(msg, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerText = msg;
  document.getElementById("toastContainer").appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

document.getElementById("tokenInAmount").addEventListener("input", (e) => {
  let val = e.target.value.replace(/[^0-9.]/g, "");
  const parts = val.split(".");
  if (parts.length > 2) val = parts[0] + "." + parts[1];
  if (selectedTokenIn.address === "AVAX" && parts[1] && parts[1].length > 4) {
    parts[1] = parts[1].substring(0, 4);
    val = parts.join(".");
  } else if (selectedTokenIn.address !== "AVAX") {
    val = parts[0];
    if (parts[1]) showToast("Decimals removed", "info");
  }
  e.target.value = val;
  updateEstimate();
});

window.connect = connect;
window.swap = swap;
window.reverseTokens = reverseTokens;
window.openTokenModal = openTokenModal;
window.closeTokenModal = closeTokenModal;
window.filterTokens = filterTokens;
window.setPercentage = setPercentage;

window.addEventListener("DOMContentLoaded", populateTokens);
</script>
