// Configuration
const routerAddress = "0x06d8b6810edf37fc303f32f30ac149220c665c27";
const arenaRouterAddress = "0xF56D524D651B90E4B84dc2FffD83079698b9066E";
const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
const WALLETCONNECT_PROJECT_ID = "02f48f8eb3b84b2e273baacb2b74a48f";

// Contract ABIs
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

// App State
let provider, signer, router, arenaRouter, userAddress, walletConnectProvider;
const tokenDecimals = {};
let walletType = null;

// Token List
const tokens = [
  { symbol: "AVAX", address: "AVAX", logo: "avaxlogo.png" },
  { symbol: "ARENA", address: "0xb8d7710f7d8349a506b75dd184f05777c82dad0c", logo: "arenalogo.png" },
  { symbol: "LAMBO", address: "0x6F43fF77A9C0Cf552b5b653268fBFe26A052429b", logo: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png" },
  { symbol: "WETH", address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png" },
  { symbol: "JOE", address: "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd", logo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanche/assets/0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd/logo.png" }
];

// WalletConnect Initialization
async function initializeWalletConnect() {
  if (typeof WalletConnectProvider === 'undefined') {
    throw new Error('WalletConnect provider not loaded');
  }

  walletConnectProvider = new WalletConnectProvider.default({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: [43114], // Avalanche Mainnet
    showQrModal: true,
    qrModalOptions: {
      themeVariables: {
        '--wcm-z-index': '9999',
        '--wcm-accent-color': '#ff0000',
        '--wcm-background-color': '#ffdada'
      }
    }
  });

  await walletConnectProvider.enable();
  return walletConnectProvider;
}

// Wallet Connection Management
async function connectWallet(type) {
  try {
    closeModal();
    walletType = type;

    if (type === 'metamask') {
      if (!window.ethereum) throw new Error("MetaMask not installed");
      provider = new ethers.BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });
      
      // Setup MetaMask event listeners
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
    } 
    else if (type === 'walletconnect') {
      const wcProvider = await initializeWalletConnect();
      provider = new ethers.BrowserProvider(wcProvider);
      
      // Setup WalletConnect event listeners
      wcProvider.on("accountsChanged", (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else {
          handleAccountsChanged(accounts);
        }
      });
      wcProvider.on("chainChanged", handleChainChanged);
      wcProvider.on("disconnect", (code, reason) => {
        console.log("WalletConnect disconnected:", code, reason);
        disconnectWallet();
      });
    }
    else {
      throw new Error("Unsupported wallet type");
    }

    signer = await provider.getSigner();
    router = new ethers.Contract(routerAddress, ABI, signer);
    arenaRouter = new ethers.Contract(arenaRouterAddress, ABI, provider);
    userAddress = await signer.getAddress();
    
    updateWalletUI();
    showToast(`${type === 'metamask' ? 'MetaMask' : 'WalletConnect'} connected!`, "success");
    document.getElementById("swapBtn").disabled = false;
    updateBalances();
    updateEstimate();
    
  } catch (err) {
    console.error("Wallet connection error:", err);
    showToast(`Connection failed: ${err.message}`, "error");
    disconnectWallet();
  }
}

function disconnectWallet(e) {
  if (e) e.stopPropagation();
  
  // Disconnect WalletConnect if active
  if (walletConnectProvider) {
    walletConnectProvider.disconnect();
    walletConnectProvider = null;
  }
  
  // Remove MetaMask listeners
  if (window.ethereum) {
    window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
    window.ethereum.removeListener('chainChanged', handleChainChanged);
  }
  
  // Reset state
  provider = null;
  signer = null;
  userAddress = null;
  walletType = null;
  
  // Update UI
  document.querySelector(".connect-btn").innerHTML = "Connect Wallet";
  document.getElementById("swapBtn").disabled = true;
  
  showToast("Wallet disconnected", "info");
}

// Update UI after wallet connection
function updateWalletUI() {
  const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
  const walletIcon = walletType === 'metamask' ? 
    '<img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" width="16" height="16">' :
    '<img src="https://altcoinsbox.com/wp-content/uploads/2023/03/wallet-connect-logo.png" width="16" height="16">';
  
  document.querySelector(".connect-btn").innerHTML = `
    ${walletIcon}
    <span class="wallet-address">${shortAddress}</span>
    <span class="copy-icon" onclick="copyAddress(event)">📋</span>
    <span class="disconnect-icon" onclick="disconnectWallet(event)">✕</span>
  `;
}

// Token Management
async function populateTokens() {
  // Initialize with fallback provider if no wallet connected
  provider = provider || new ethers.BrowserProvider(window.ethereum || "https://api.avax.network/ext/bc/C/rpc");
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
  updateLogos(); 
  updateBalances(); 
  updateEstimate();
}

// Balance Functions
async function updateBalances() {
  if (!userAddress || !provider) return;
  
  const tokenIn = JSON.parse(document.getElementById("tokenInSelect").value);
  const tokenOut = JSON.parse(document.getElementById("tokenOutSelect").value);

  const getBal = async (t) => {
    if (t.address === "AVAX") {
      const balance = await provider.getBalance(userAddress);
      return parseFloat(ethers.formatEther(balance)).toFixed(4);
    }
    const contract = new ethers.Contract(t.address, ERC20_ABI, provider);
    const bal = await contract.balanceOf(userAddress);
    const dec = tokenDecimals[t.address] || 18;
    return parseFloat(ethers.formatUnits(bal, dec)).toFixed(4);
  };

  document.getElementById("balanceIn").innerText = "Balance: " + await getBal(tokenIn);
  document.getElementById("balanceOut").innerText = "Balance: " + await getBal(tokenOut);
}

// Swap Estimation
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
    document.getElementById("tokenOutAmount").value =
      tokenOut.address === "AVAX"
        ? parseFloat(est).toFixed(4)
        : Math.floor(parseFloat(est));
  } catch (err) {
    console.error("Estimation failed:", err);
    document.getElementById("tokenOutAmount").value = "";
    showToast("Could not estimate swap", "error");
  }
}

// Swap Execution
async function swap() {
  if (!signer) return;
  
  const amt = document.getElementById("tokenInAmount").value;
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
    showToast("Processing swap...", "info");
    
    if (tokenIn.address === "AVAX") {
      const tx = await router.swapExactAVAXForTokensSupportingFeeOnTransferTokens(
        0, path, to, deadline, { value: amountIn }
      );
      await tx.wait();
      showToast("Swap successful!", "success");
    } else {
      const tokenContract = new ethers.Contract(tokenIn.address, ERC20_ABI, signer);
      const allowance = await tokenContract.allowance(to, routerAddress);
      
      if (allowance < amountIn) {
        showToast("Approving tokens...", "info");
        const approveTx = await tokenContract.approve(routerAddress, ethers.MaxUint256);
        await approveTx.wait();
      }
      
      let tx;
      if (tokenOut.address === "AVAX") {
        tx = await router.swapExactTokensForAVAXSupportingFeeOnTransferTokens(
          amountIn, 0, path, to, deadline
        );
      } else {
        tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          amountIn, 0, path, to, deadline
        );
      }
      
      await tx.wait();
      showToast("Swap successful!", "success");
    }
    
    updateBalances();
  } catch (err) {
    console.error("Swap error:", err);
    showToast(`Swap failed: ${err.message}`, "error");
  }
}

// Helper Functions
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

function copyAddress(e) {
  e.stopPropagation();
  navigator.clipboard.writeText(userAddress);
  const icon = e.target;
  icon.innerText = "✅";
  showToast("Address copied!", "info");
  setTimeout(() => (icon.innerText = "📋"), 1000);
}

function toggleSlippage() {
  const popup = document.getElementById("slippagePopup");
  popup.style.display = popup.style.display === "block" ? "none" : "block";
}

// Modal Functions
function openModal() {
  document.getElementById('walletModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('walletModal').style.display = 'none';
}

// Toast Notifications
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

// Event Handlers
function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    disconnectWallet();
  } else if (accounts[0] !== userAddress) {
    userAddress = accounts[0];
    updateWalletUI();
    updateBalances();
    updateEstimate();
    showToast("Account changed", "info");
  }
}

function handleChainChanged(chainId) {
  showToast("Network changed, please refresh page", "info");
  setTimeout(() => window.location.reload(), 1000);
}

// Initialize the app
window.addEventListener("DOMContentLoaded", () => {
  populateTokens();
  
  // Check for existing wallet connection
  if (localStorage.getItem('walletconnect')) {
    connectWallet('walletconnect').catch(console.error);
  } else if (window.ethereum?.selectedAddress) {
    connectWallet('metamask').catch(console.error);
  }
});

// Event Listeners
window.addEventListener("click", function (e) {
  const popup = document.getElementById("slippagePopup");
  const btn = document.querySelector(".settings-btn");
  if (popup && btn && !popup.contains(e.target) && !btn.contains(e.target)) {
    popup.style.display = "none";
  }
});

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

document.getElementById("tokenInSelect").addEventListener("change", () => { 
  updateLogos(); 
  updateBalances(); 
  updateEstimate(); 
});

document.getElementById("tokenOutSelect").addEventListener("change", () => { 
  updateLogos(); 
  updateBalances(); 
  updateEstimate(); 
});

// Global Functions
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.openModal = openModal;
window.closeModal = closeModal;
window.reverseTokens = reverseTokens;
window.swap = swap;
window.setPercentage = setPercentage;
window.toggleSlippage = toggleSlippage;
window.copyAddress = copyAddress;
