import { dryrun, createDataItemSigner } from "https://unpkg.com/@permaweb/aoconnect@0.0.69/dist/browser.js";
import { ArweaveWebWallet } from 'https://cdn.skypack.dev/arweave-wallet-connector';

// Constants
const AO_PROCESS_ID = "0syT13r0s0tgPmIed95bJnuSqaD29HQNN8D3ElLSrsc";
const GATEWAY_URL = "https://su201.ao-testnet.xyz";

// Variables
let arweaveAddress = null;
let walletConnected = false;

// Initialize elements
const connectButton = document.getElementById('connectButton');
const messageElement = document.getElementById('message');
const balanceValue = document.getElementById('balanceValue');
const transferForm = document.getElementById('transferForm');
const recipientInput = document.getElementById('recipientInput');
const amountInput = document.getElementById('amountInput');
const sendTransferButton = document.getElementById('sendTransferButton');
const copyProcessButton = document.getElementById('copyProcess');
const retryBalance = document.getElementById('retryBalance');

// Initialize ArweaveWebWallet
const wallet = new ArweaveWebWallet({
    name: 'AO Transfers',
    logo: 'https://arweave.net/AzM59q2tcYzkySUUZUN1HCwfKGVHi--71UdoIk5gPUE'
});

wallet.setUrl('https://arweave.app');

// Connect wallet function
async function connectWallet() {
    try {
        await wallet.connect();
        // Need to use window.arweaveWallet after connection is established
        if (window.arweaveWallet) {
            arweaveAddress = await window.arweaveWallet.getActiveAddress();
            walletConnected = true;
            updateUIForConnectedWallet();
        } else {
            throw new Error("ArweaveWallet not available after connection");
        }
    } catch (error) {
        console.error("Error connecting wallet:", error);
        showToast("Failed to connect wallet. Please try again.", "error");
    }
}

// Update UI for connected wallet
function updateUIForConnectedWallet() {
    if (arweaveAddress) {
        // Update connect button
        connectButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                <line x1="2" x2="22" y1="10" y2="10"></line>
            </svg>
            ${arweaveAddress.slice(0, 4)}...${arweaveAddress.slice(-4)}
        `;
        connectButton.classList.add('connected-btn');
        
        // Enable send transfer button
        sendTransferButton.disabled = false;
        
        showToast("Wallet connected successfully", "success");
        
        // Check balance automatically
        checkBalance();
    }
}

// Check balance function
async function checkBalance() {
    if (!arweaveAddress) {
        showToast('Please connect your wallet first', "error");
        return;
    }
    
    try {
        balanceValue.textContent = "...";
        retryBalance.style.display = 'none';
        
        // Create data item signer with window.arweaveWallet
        const signer = createDataItemSigner(window.arweaveWallet);
        
        // Use dryrun with Balance action
        const response = await dryrun({
            process: AO_PROCESS_ID,
            tags: [
                { name: "Action", value: "Balance" },
                { name: "Target", value: AO_PROCESS_ID },
                { name: "Recipient", value: arweaveAddress }
            ],
            signer: signer
        });
        
        console.log("Balance response:", response);
        
        // Parse the response for balance
        if (response && response.Messages && response.Messages.length > 0) {
            for (const message of response.Messages) {
                if (message.Tags) {
                    for (const tag of message.Tags) {
                        if (tag.name === "Balance") {
                            // Convert from atomic units (12 decimals)
                            const atomicBalance = parseInt(tag.value);
                            const balance = atomicBalance / 1e12;
                            balanceValue.textContent = balance.toFixed(6);
                            
                            // Display response
                            messageElement.textContent = JSON.stringify(response, null, 2);
                            return;
                        }
                    }
                }
            }
            
            // If we get here, check if balance is in Data field
            if (response.Messages[0].Data) {
                const atomicBalance = parseInt(response.Messages[0].Data);
                if (!isNaN(atomicBalance)) {
                    const balance = atomicBalance / 1e12;
                    balanceValue.textContent = balance.toFixed(6);
                    messageElement.textContent = JSON.stringify(response, null, 2);
                    return;
                }
            }
        }
        
        // If we reach here, no balance was found
        balanceValue.textContent = "0.000000";
        
        // Display the full response in the message area for debugging
        messageElement.textContent = JSON.stringify(response, null, 2);
        
    } catch (error) {
        balanceValue.textContent = "Error";
        messageElement.textContent = 'Error: ' + error.message;
        showToast('Error checking balance: ' + error.message, "error");
        console.error('Error checking balance:', error);
        
        // Show retry button
        retryBalance.style.display = 'inline-flex';
    }
}

// Send transfer function
async function sendAO(e) {
    e.preventDefault();
    
    const recipient = recipientInput.value.trim();
    const amount = amountInput.value.trim();
    
    if (!recipient || !amount) {
        showToast('Please fill in all fields', "error");
        return;
    }
    
    try {
        // Convert amount to atomic units (12 decimals)
        const atomicAmount = (parseFloat(amount) * 1e12).toFixed(0);
        
        // Create a DataItem using the original wallet.signDataItem method
        const signedDataItem = await wallet.signDataItem({
            target: AO_PROCESS_ID,
            tags: [
                { name: "Action", value: "Transfer" },
                { name: "Recipient", value: recipient },
                { name: "Quantity", value: atomicAmount },
                { name: "Data-Protocol", value: "ao" },
                { name: "Variant", value: "ao.TN.1" },
                { name: "Type", value: "Message" },
                { name: "SDK", value: "aoconnect" }
            ],
            data: ""  // Empty data field
        });
        
        console.log("Signed DataItem:", signedDataItem);
        
        // Send DataItem to AO
        const response = await fetch(GATEWAY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: new Blob([signedDataItem])
        });
        
        const result = await response.json();
        showToast(`Transfer successful! TX ID: ${result.id.slice(0, 8)}...`, "success");
        
        // Reset form
        recipientInput.value = "";
        amountInput.value = "";
        
        // Update message element
        messageElement.textContent = JSON.stringify(result, null, 2);
        
        // Check balance after transfer
        setTimeout(checkBalance, 2000);
        
    } catch (error) {
        console.error("Error sending AO:", error);
        showToast("Transfer failed. Check console for details.", "error");
    }
}

// Toast notification function
function showToast(message, type = "") {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast';
    
    if (type) {
        toast.classList.add(type);
    }
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Copy process ID function
function copyProcessId() {
    navigator.clipboard.writeText(AO_PROCESS_ID)
        .then(() => {
            showToast("Process ID copied to clipboard", "success");
        })
        .catch(err => {
            console.error('Failed to copy: ', err);
            showToast("Failed to copy Process ID", "error");
        });
}

// Add event listeners
connectButton.addEventListener('click', connectWallet);
transferForm.addEventListener('submit', sendAO);
copyProcessButton.addEventListener('click', copyProcessId);
retryBalance.addEventListener('click', checkBalance);

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
    // Check if wallet can be connected
    try {
        if (window.arweaveWallet) {
            const address = await window.arweaveWallet.getActiveAddress();
            if (address) {
                arweaveAddress = address;
                updateUIForConnectedWallet();
            }
        }
    } catch (error) {
        console.log("No wallet connected yet");
    }
});