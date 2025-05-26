const express = require('express');

const crypto = require('crypto');
const router = express.Router();
// Enable CORS for all routes (for development - configure more restrictively in production)

// **IMPORTANT - TEST SALT (REPLACE WITH YOUR ACTUAL TEST SALT):**
const TEST_SALT_KEY = "7685617431RBIUGE"; // REPLACE THIS WITH YOUR ACTUAL TEST SALT!
// **IN PRODUCTION, NEVER HARDCODE SALT. USE ENVIRONMENT VARIABLES OR SECURE CONFIGURATION.**

// **IMPORTANT - MERCHANT ID (REPLACE WITH YOUR TEST MERCHANT ID):**
const MERCHANT_ID = "T1071800"; // REPLACE THIS WITH YOUR ACTUAL TEST MERCHANT ID!

function generateWorldlineToken(transactionData, saltKey) {
    const dataForHashing = [
        transactionData.merchantId,
        transactionData.txnId,
        transactionData.totalamount,
        transactionData.accountNo || "",
        transactionData.consumerId || "",
        transactionData.consumerMobileNo || "",
        transactionData.consumerEmailId || "",
        transactionData.debitStartDate || "",
        transactionData.debitEndDate || "",
        transactionData.maxAmount || "",
        transactionData.amountType || "",
        transactionData.frequency || "",
        transactionData.cardNumber || "",
        transactionData.expMonth || "",
        transactionData.expYear || "",
        transactionData.cvvCode || "",
        saltKey
    ].join('|');

    const hash = crypto.createHash('sha512');
    hash.update(dataForHashing);
    console.log('dataForHashing',dataForHashing);
    const generatedToken = hash.digest('hex');
    return generatedToken;
}

router.post('/generate-payment-token', (req, res) => {
    const transactionDetails = {
        merchantId: MERCHANT_ID, // Use the Merchant ID defined above
        txnId: generateUniqueTxnId(),
        totalamount: req.body.amount, // Get amount from request body
        accountNo: "",
        consumerId: "",
        consumerMobileNo: "",
        consumerEmailId: "",
        debitStartDate: "",
        debitEndDate: "",
        maxAmount: "",
        amountType: "",
        frequency: "",
        cardNumber: "",
        expMonth: "",
        expYear: "",
        cvvCode: "",
    };

    if (!TEST_SALT_KEY) { // Check if SALT_KEY is available (even for test)
        console.error("Error: Worldline TEST_SALT_KEY is not configured on the server!");
        return res.status(500).json({ error: "Server configuration error: SALT key missing." });
    }

    try {
        const token = generateWorldlineToken(transactionDetails, TEST_SALT_KEY);
        console.log('generatedwordlinetoken',token);
        res.json({ token: token, merchantId: MERCHANT_ID, txnId: transactionDetails.txnId }); // Send token, merchantId, and txnId
    } catch (error) {
        console.error("Error generating token:", error);
        res.status(500).json({ error: "Failed to generate payment token." });
    }
});

function generateUniqueTxnId() {
    const timestamp = Date.now().toString(36).substring(2, 10).toUpperCase(); // Base36 timestamp (alphanumeric)
    const randomString = Math.random().toString(36).substring(2, 10).toUpperCase(); // Alphanumeric random string
    const txnId = `${timestamp}${randomString}`.substring(0, 40); // Combine and truncate to 40 chars
    return txnId;
}
module.exports = router;