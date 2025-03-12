// connect.js - Fixed version with one-click wallet connection
import { dryrun, message, createDataItemSigner } from "https://unpkg.com/@permaweb/aoconnect@0.0.59/dist/browser.js";
import { ArweaveWebWallet } from 'https://cdn.skypack.dev/arweave-wallet-connector';


// Constants
const AO_PROCESS_ID = "0syT13r0s0tgPmIed95bJnuSqaD29HQNN8D3ElLSrsc";
const GATEWAY_URL = "https://mu.ao-testnet.xyz/";

// Variables
let arweaveAddress = null;
let walletConnected = false;

// Initialize elements
const connectButton = document.getElementById('connectButton');
const walletStatus = document.getElementById('walletStatus');
const checkBalanceButton = document.getElementById('checkBalanceButton');
const messageElement = document.getElementById('message');
const balanceDisplay = document.getElementById('balanceDisplay');
const transferButton = document.getElementById('transferButton');
const recipientInput = document.getElementById('recipientInput');
const amountInput = document.getElementById('amountInput');
const sendTransferButton = document.getElementById('sendTransferButton');

const wallet = new ArweaveWebWallet({
    name: 'Connector Example',
    logo: 'https://jfbeats.github.io/ArweaveWalletConnector/placeholder.svg'
});

wallet.setUrl('https://arweave.app');

// One-click connection function
async function connectWallet() {
    try {
        await wallet.connect();
        arweaveAddress = await wallet.getActiveAddress();
        walletConnected = true;
        updateUIForConnectedWallet();
    } catch (error) {
        console.error("Error connecting wallet:", error);
        showToast("Failed to connect wallet. Please try again.");
    }
}

// Connect wallet directly on button click
connectButton.addEventListener('click', connectWallet);


// Manual approach for arweave.app
function handleArweaveAppConnection() {
    // Check if arweave.app wallet is already connected
    if (window.arweaveWallet) {
        checkWalletConnection();
    } else {
        showToast("Please open arweave.app in another tab and connect your wallet");
        // Open arweave.app in a new tab
        window.open("https://arweave.app", "_blank");
    }
}

// Check if wallet is connected
async function checkWalletConnection() {
    try {
        if (window.arweaveWallet) {
            // Try to get active address
            const address = await window.arweaveWallet.getActiveAddress();
            if (address) {
                arweaveAddress = address;
                updateUIForConnectedWallet();
            }
        }
    } catch (error) {
        console.error("Error checking wallet connection:", error);
        showToast("Error checking wallet connection. Make sure you've connected in arweave.app");
    }
}

// Update UI for connected wallet
function updateUIForConnectedWallet() {
    if (arweaveAddress) {
        walletStatus.textContent = `Status: Connected - ${arweaveAddress.slice(0, 6)}...${arweaveAddress.slice(-6)}`;
        walletStatus.classList.remove('disconnected');
        walletStatus.classList.add('connected');
        
        connectButton.textContent = 'Check Connection';
        checkBalanceButton.disabled = false;
        transferButton.disabled = false;
        
        showToast('Wallet connection detected!');
    }
}

// Check balance function
async function checkBalance() {
    // First ensure we have wallet access
    await checkWalletConnection();
    
    if (!arweaveAddress) {
        showToast('Please connect your wallet in arweave.app first');
        return;
    }
    
    try {
        balanceDisplay.textContent = 'Checking...';
        
        // Explicitly prompt for connection permissions if needed
        try {
            if (window.arweaveWallet.connect) {
                await window.arweaveWallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION', 'SIGNATURE']);
            }
        } catch (e) {
            console.log("Connect error or already connected:", e);
        }
        
        // Create data item signer with explicit timeout
        const signer = createDataItemSigner(window.arweaveWallet);
        
        console.log("Wallet address being used:", arweaveAddress);
        console.log("About to send balance request");
        
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
        
        // Parse the response for balance
        if (response && response.Messages && response.Messages.length > 0) {
            for (const message of response.Messages) {
                for (const tag of message.Tags || []) {
                    if (tag.name === "Balance") {
                        // Convert from atomic units (12 decimals)
                        const atomicBalance = parseInt(tag.value);
                        const balance = atomicBalance / 1e12;
                        balanceDisplay.textContent = `Balance: ${balance.toFixed(6)} AO`;
                        showToast('Balance check completed');
                        
                        // Display response
                        messageElement.textContent = JSON.stringify(response, null, 2);
                        return;
                    }
                }
            }
        }
        
        // If we reach here, no balance was found
        balanceDisplay.textContent = 'Balance: Not found';
        
        // Display the full response in the message area for debugging
        messageElement.textContent = JSON.stringify(response, null, 2);
        
    } catch (error) {
        balanceDisplay.textContent = 'Balance: Error';
        messageElement.textContent = 'Error: ' + error.message;
        showToast('Error checking balance: ' + error.message);
        console.error('Error checking balance:', error);
    }
}

// Toggle transfer form
function toggleTransferForm() {
    if (transferForm.style.display === 'none' || !transferForm.style.display) {
        transferForm.style.display = 'block';
    } else {
        transferForm.style.display = 'none';
    }
}

// Send transfer function using ArConnect and ArDataItem
// Send transfer function with fixed tags
async function sendTransfer() {
    const recipient = recipientInput.value.trim();
    const amount = amountInput.value.trim();

    if (!recipient || !amount) {
        showToast('Please fill in all fields');
        return;
    }

    // Check connection
    await checkWalletConnection();

    if (!arweaveAddress) {
        showToast('Please connect your wallet in arweave.app first');
        return;
    }

    try {
        // Explicitly prompt for connection permissions
        await window.arweaveWallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION', 'DISPATCH']);

        // Convert amount to atomic units (12 decimal places)
        const atomicAmount = Math.floor(parseFloat(amount) * 1e12).toString();
        messageElement.textContent = 'Preparing transfer...';
        
        // Create a transaction object with minimal data to make it valid
        const arweave = Arweave.init();
        const tx = await arweave.createTransaction({
            target: recipient,  // Using target to make it a valid tx
            quantity: "0",      // Zero quantity to avoid actual AR transfer
            data: ""            // Empty data
        });
        
        // Add the necessary tags
        tx.addTag("Action", "Transfer");
        tx.addTag("Target", AO_PROCESS_ID);
        tx.addTag("Recipient", recipient);
        tx.addTag("Quantity", atomicAmount);
        
        console.log("Prepared transaction:", tx);
        
        // Sign the transaction
        await window.arweaveWallet.sign(tx);
        console.log("Signed transaction:", tx);
        
        // Create simple tags manually
        const messageTags = [
            { name: "Action", value: "Transfer" },
            { name: "Recipient", value: recipient },
            { name: "Quantity", value: atomicAmount }
        ];
        
        // Create the message data with unencoded tags and empty data
        const messageData = {
            process: AO_PROCESS_ID,
            tags: messageTags,  // Use manually created tags instead of tx.tags
            anchor: Date.now().toString(),
            signature: tx.signature,
            owner: arweaveAddress,
            data: ""  // Empty string for data
        };
        
        console.log("Full message payload:", JSON.stringify(messageData, null, 2));
        
        const response = await fetch(`${GATEWAY_URL}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(messageData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Full gateway error response:', errorText);
            throw new Error(`Gateway error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log("Transfer response:", result);
        
        messageElement.textContent = "Transfer sent! Transaction ID: " + (result.id || "unknown");
        showToast("Transfer sent successfully");
        
    } catch (error) {
        messageElement.textContent = "Error: " + error.message;
        showToast("Error sending transfer: " + error.message);
        console.error("Detailed transfer error:", error);
    }
}


// Toast notification function
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Add event listeners
connectButton.addEventListener('click', async () => {
    // Always check for connection when button is clicked
    if (window.arweaveWallet) {
        await checkWalletConnection();
    } else {
        handleArweaveAppConnection();
    }
});

checkBalanceButton.addEventListener('click', checkBalance);
transferButton.addEventListener('click', toggleTransferForm);
sendTransferButton.addEventListener('click', sendTransfer);

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
    // Check if arweaveWallet is already injected
    if (window.arweaveWallet) {
        connectButton.textContent = 'Check Connection';
        await checkWalletConnection();
    } else {
        // Update button text to guide user
        connectButton.textContent = 'Connect with arweave.app';
        walletStatus.textContent = 'Status: Disconnected (Open arweave.app)';
        
        // Disable buttons until connected
        checkBalanceButton.disabled = true;
        transferButton.disabled = true;
    }
    
    // Hide transfer form initially
    transferForm.style.display = 'none';
});

// Also periodically check for wallet injection
const checkInterval = setInterval(async () => {
    if (window.arweaveWallet && !arweaveAddress) {
        console.log("arweaveWallet detected, checking connection...");
        await checkWalletConnection();
        if (arweaveAddress) {
            clearInterval(checkInterval);
        }
    }
}, 2000);