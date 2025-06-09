const express = require("express");
const router = express.Router();
const { executeQuery } = require("../dbUtils/db");
const fs = require('fs');
const moment = require("moment-timezone"); 




router.post('/collect_online', async (req, res) => {
    try {
        let customerId = req.query.customerId || req.body.customerId;
        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required" });
        }

        const { online } = req.body; // Changed from 'cash' to 'online'

        // Fetch current customer data
        const fetchQuery = `
            SELECT amount_due, amount_paid_online, credit_limit  -- Changed to amount_paid_online
            FROM credit_limit
            WHERE customer_id = ?`;
        const customerDataResult = await executeQuery(fetchQuery, [customerId]);

        if (customerDataResult.length === 0) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const { amount_due, amount_paid_online = 0, credit_limit = 0 } = customerDataResult[0]; // Changed to amount_paid_online
        let updatedAmountDue = amount_due;
        let newAmountPaidOnline = amount_paid_online; // Initialize for online payment

        if (online !== undefined && online !== null) { // Changed from 'cash' to 'online'
            const parsedOnline = parseFloat(online); // Changed from 'parsedCash' to 'parsedOnline'
            if (isNaN(parsedOnline) || parsedOnline < 0) { // Changed from 'parsedCash' to 'parsedOnline'
                return res.status(400).json({ message: "Invalid online amount. Must be a non-negative number." }); // Updated message
            }

            newAmountPaidOnline = amount_paid_online + parsedOnline; // Changed to amount_paid_online and parsedOnline
            updatedAmountDue = Math.max(0, amount_due - parsedOnline); // Changed from 'parsedCash' to 'parsedOnline'
            const newCreditLimit = credit_limit + parsedOnline; // Changed from 'parsedCash' to 'parsedOnline'

            // **1. Insert into payment_transactions table**
            const insertTransactionQuery = `
                INSERT INTO payment_transactions (customer_id, payment_method, payment_amount, payment_date)
                VALUES (?, ?, ?, NOW())`; // NOW() gets current datetime in MySQL
            const transactionValues = [customerId, 'online', parsedOnline]; // Changed payment_method to 'online' and parsedCash to parsedOnline
            await executeQuery(insertTransactionQuery, transactionValues);

            // **2. Update credit_limit table**
            const updateQuery = `
                UPDATE credit_limit
                SET amount_paid_online = ?, amount_due = ?, credit_limit = ?, online_paid_date = UNIX_TIMESTAMP() -- Changed to amount_paid_online and online_paid_date
                WHERE customer_id = ?`;
            const updateValues = [newAmountPaidOnline, updatedAmountDue, newCreditLimit, customerId]; // Changed to newAmountPaidOnline
            await executeQuery(updateQuery, updateValues);

            // 3. Delete payment_response.txt after success (callback-based)
            const filePath = 'payment_response.txt';
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error(`Error deleting ${filePath}:`, err);
                    // Log error but don't fail the request
                } else {
                    console.log(`Deleted ${filePath}`);
                }
            });
            

            return res.status(200).json({
                message: "Online payment collected and transaction recorded successfully", // Updated message
                updatedAmountPaidOnline: newAmountPaidOnline, // Changed to updatedAmountPaidOnline
                updatedAmountDue,
                updatedCreditLimit: newCreditLimit,
                updatedOnlineCreditLimit: newCreditLimit // Added for consistency, same value as updatedCreditLimit
            });
        }

        return res.status(200).json({ amountDue: updatedAmountDue });
    } catch (error) {
        console.error("Error processing online payment collection:", error); // Updated error message
        return res.status(500).json({ message: "Internal server error" });
    }
});


//remarks handling.

// API endpoint to update remarks in the remarks table
router.post("/remarks-update", async (req, res) => {
    try {
        const { customer_id, order_id, remarks } = req.body;

        // Validate input
        if (!customer_id || !order_id || !remarks) {
            return res.status(400).json({ message: "customer_id, order_id, and remarks are required" });
        }

        // SQL INSERT query to add a new remark
        const query = "INSERT INTO remarks (customer_id, order_id, remarks) VALUES (?, ?, ?)";
        const values = [customer_id, order_id, remarks];

        // Execute the query
        const result = await executeQuery(query, values);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: "Remarks updated successfully" }); // "Updated" is used for consistency with original example, but "added" or "saved" might be more accurate for an INSERT operation. Consider changing the message if needed for clarity.
        } else {
            return res.status(400).json({ message: "Failed to add remarks. Please check customer_id and order_id." }); // 400 status because the request itself might be valid, but the action failed due to data issue. Could also be 500 depending on error details from DB.
        }
    } catch (error) {
        console.error("Error updating remarks:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message }); // Include error.message for more detailed debugging in development. Remove or redact in production.
    }
});


//fetch remarks 



router.get("/fetch-remarks", async (req, res) => {
    try {
        // SQL SELECT query to fetch all remarks
        const query = "SELECT * FROM remarks";

        // Execute the query
        const remarks = await executeQuery(query);

        // Return the fetched remarks in the response
        return res.status(200).json({
            message: "Remarks fetched successfully",
            remarks: remarks // Sending back the fetched remarks data
        });

    } catch (error) {
        console.error("Error fetching remarks:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message }); // Include error.message for more detailed debugging in development. Remove or redact in production.
    }
});





router.get("/customer-product-price", async (req, res) => {
    const productId = req.query.product_id; // Get product_id from query parameters
    const customerId = req.query.customer_id; // Get customer_id (optional)

    if (!productId) {
        return res.status(400).json({ message: "Product ID is required" }); // Validate product_id
    }

    try {
        // 1. Fetch product from 'products' table to get default prices
        const productQuery = "SELECT price, discountPrice FROM products WHERE id = ?"; // Assuming 'id' is product ID column
        const productResults = await executeQuery(productQuery, [productId]);

        if (productResults.length === 0) {
            return res.status(404).json({ message: "Product not found" }); // Product ID not found
        }
        const product = productResults[0]; // Assuming query returns an array, take the first result

        let effectivePrice = product.discountPrice !== null ? product.discountPrice : product.price; // Default price logic

        // 2. Check for customer-specific price if customerId is provided
        if (customerId) {
            const customerPriceQuery = "SELECT customer_price FROM customer_product_prices WHERE customer_id = ? AND product_id = ?";
            const customerPriceResults = await executeQuery(customerPriceQuery, [customerId, productId]);

            if (customerPriceResults.length > 0) {
                effectivePrice = customerPriceResults[0].customer_price; // Override with customer-specific price
            }
        }

        // 3. Return the effective price
        return res.status(200).json({
            message: "Product price fetched successfully",
            effectivePrice: effectivePrice
        });

    } catch (error) {
        console.error("Error fetching customer product price:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

router.get("/fetch-payment-transactions", async (req, res) => {
    try {
        const customerId = req.query.customer_id;
        const date = req.query.date; // YYYY-MM-DD format
        const paymentMethod = req.query.payment_method; // 'cash' or 'online'

        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required" });
        }

        // Base query
        let query = "SELECT * FROM payment_transactions WHERE customer_id = ?";
        const params = [customerId];

        // Add date filter
        if (date) {
            query += " AND DATE(payment_date) = ?";
            params.push(date);
        }

        // Add payment method filter
        if (paymentMethod && ['cash', 'online'].includes(paymentMethod)) {
            query += " AND payment_method = ?";
            params.push(paymentMethod);
        }

        // Execute the query
        const transactions = await executeQuery(query, params);

        if (transactions.length === 0) {
            return res.status(404).json({ message: "No transactions found" });
        }

        return res.status(200).json({
            message: "Payment transactions fetched successfully",
            transactions: transactions
        });
    } catch (error) {
        console.error("Error fetching payment transactions:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});



router.get("/fetch-all-payment-transactions", async (req, res) => {
    try {
        const date = req.query.date; // YYYY-MM-DD format
        const paymentMethod = req.query.payment_method; // 'cash' or 'online'

        // Base query to fetch all transactions
        let query = "SELECT * FROM payment_transactions";
        const params = [];

        // Add date filter if provided
        if (date) {
            query += " WHERE DATE(payment_date) = ?";
            params.push(date);
        }

        // Add payment method filter if provided
        if (paymentMethod && ['cash', 'online'].includes(paymentMethod)) {
            query += date ? " AND payment_method = ?" : " WHERE payment_method = ?";
            params.push(paymentMethod);
        }

        // Execute the query
        const transactions = await executeQuery(query, params);

        if (transactions.length === 0) {
            return res.status(404).json({ message: "No transactions found" });
        }

        return res.status(200).json({
            message: "All payment transactions fetched successfully",
            transactions: transactions
        });
    } catch (error) {
        console.error("Error fetching all payment transactions:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});



router.get("/fetch-names", async (req, res) => {
    try {
        const customerId = req.query.customer_id; // Get customer_id from query params

        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required" });
        }

        // SQL SELECT query to fetch the name for a specific customer_id
        const query = "SELECT name FROM users WHERE customer_id = ?";
        
        // Execute the query with customer_id as a parameter to prevent SQL injection
        const results = await executeQuery(query, [customerId]);

        if (results.length === 0) {
            return res.status(404).json({ message: "No user found with this customer ID" });
        }

        // Return the fetched name (assuming 'name' is a column in the users table)
        return res.status(200).json({
            message: "User name fetched successfully",
            name: results[0].name // Assuming one result; return the name field
        });
    } catch (error) {
        console.error("Error fetching user name:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

router.get("/fetch-routes", async (req, res) => {
    try {
        const customerId = req.query.customer_id; // Get customer_id from query params

        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required" });
        }

        // SQL SELECT query to fetch the name for a specific customer_id
        const query = "SELECT route FROM users WHERE customer_id = ?";
        
        // Execute the query with customer_id as a parameter to prevent SQL injection
        const results = await executeQuery(query, [customerId]);

        if (results.length === 0) {
            return res.status(404).json({ message: "No user found with this customer ID" });
        }

        // Return the fetched name (assuming 'name' is a column in the users table)
        return res.status(200).json({
            message: "Route fetched successfully",
            route: results[0].route // Assuming one result; return the name field
        });
    } catch (error) {
        console.error("Error fetching user route:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});


router.get("/amount_due", async (req, res) => {
    try {
        // SQL SELECT query to fetch ALL columns from credit_limit table
        const query = "SELECT * FROM credit_limit"; // No WHERE clause

        // Execute the query without any parameters
        const results = await executeQuery(query);

        if (results.length === 0) {
            return res.status(404).json({ message: "No credit limit data found in the table" }); // More general message
        }

        // Return all rows from the credit_limit table
        return res.status(200).json({
            message: "All credit limit data fetched successfully", // Updated message
            creditLimitData: results // Now returning the entire array of results
        });
    } catch (error) {
        console.error("Error fetching all credit limit data:", error); // Updated error message
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

//ietms report


router.get("/item-report", async (req, res) => {
    const reportDate = req.query.date; // Get the date from query parameter, e.g., 'YYYY-MM-DD'

    try {
        let query = `
            SELECT
                u.route AS route,
                op.name AS product_name,
                SUM(op.quantity) AS total_quantity
            FROM
                orders o
            JOIN
                users u ON o.customer_id = u.customer_id
            JOIN
                order_products op ON o.id = op.order_id
        `;

        let whereClause = ''; // To build WHERE clause conditionally
        const queryParams = []; // Parameters for parameterized query

        if (reportDate) {
            whereClause = `WHERE DATE(FROM_UNIXTIME(o.placed_on)) = ?`; // Filter by placed_on date
            queryParams.push(reportDate); // Add date to query parameters
        }

        const groupByAndOrderBy = `
            GROUP BY
                u.route,
                op.name
            ORDER BY
                u.route,
                op.name;
        `;

        query = query + whereClause + groupByAndOrderBy; // Combine query parts

        // Execute the SQL query with parameters
        const results = await executeQuery(query, queryParams);

        if (results.length === 0) {
            return res.status(404).json({ message: "No item report data found for the selected date" });
        }

        return res.status(200).json({
            message: "Item report data fetched successfully",
            itemReportData: results
        });
    } catch (error) {
        console.error("Error fetching item report data with date filter:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});



//invoice push
router.post("/invoice", async (req, res) => {
    try {
        // 1. Extract inputs from the request body
        const { order_id, invoice_id, order_date, invoice_date } = req.body;

        // 2. Validate inputs (basic validation - ensure they are provided)
        if (!order_id || !invoice_id || !order_date || !invoice_date) {
            return res.status(400).json({ message: "Missing required fields: order_id, invoice_id, order_date, and invoice_date are all mandatory." });
        }

        // 3. Check if an invoice record already exists for this order_id
        const checkQuery = "SELECT * FROM invoice WHERE order_id = ?";
        const existingInvoice = await executeQuery(checkQuery, [order_id]);

        // 4. Prepare SQL query for INSERT or UPDATE based on existence
        let query;
        let message;
        if (existingInvoice && existingInvoice.length > 0) {
            // Invoice exists for this order_id, so UPDATE the existing record
            query = `
                UPDATE invoice
                SET invoice_id = ?,
                    order_date = ?,
                    invoice_date = ?
                WHERE order_id = ?
            `;
            message = "Invoice data updated successfully for order_id: " + order_id;
        } else {
            // Invoice does not exist for this order_id, so INSERT a new record
            query = `
                INSERT INTO invoice (order_id, invoice_id, order_date, invoice_date)
                VALUES (?, ?, ?, ?)
            `;
            message = "Invoice data inserted successfully for order_id: " + order_id;
        }

        // 5. Execute the query with parameters (order of values depends on INSERT or UPDATE)
        const values = existingInvoice && existingInvoice.length > 0
            ? [invoice_id, order_date, invoice_date, order_id] // For UPDATE: invoice_id, order_date, invoice_date, WHERE order_id
            : [order_id, invoice_id, order_date, invoice_date];    // For INSERT: order_id, invoice_id, order_date, invoice_date

        const results = await executeQuery(query, values);

        // 6. Handle success and errors
        if (results && results.affectedRows > 0) {
            return res.status(200).json({ // 200 OK - for both UPDATE and INSERT in this context
                message: message,
                orderId: order_id // Return order_id for clarity
            });
        } else {
            // If no rows were affected in UPDATE, it might mean data was the same, which could be considered successful in this scenario of "latest data".
            // If no rows affected in INSERT, it's an issue.  But with the existence check, INSERT should generally succeed if validation passed.
            console.warn("Invoice operation query executed, but no rows might have been affected (or data was unchanged in update). Check data or logic.");
            return res.status(200).json({ message: message + " (No changes may have been applied if data was the same).", orderId: order_id });
        }

    } catch (error) {
        console.error("Error processing invoice data:", error);
        return res.status(500).json({ message: "Internal server error while processing invoice data", error: error.message });
    }
});



router.get("/allowed-shift", async (req, res) => {
    try {
        const { shift } = req.query;

        if (!shift || !['AM', 'PM'].includes(shift)) {
            return res.status(400).json({ message: "Invalid shift parameter. Must be 'AM' or 'PM'.", allowed: false });
        }

        const now = moment.tz('Asia/Kolkata'); // Using 'Asia/Kolkata' for India // Remember to replace 'Your-Timezone'
        const currentHour = now.hour();
        let isShiftAllowed = false;

        if (shift === 'AM') {
            isShiftAllowed = (currentHour >= 6 && currentHour < 24);
        } else if (shift === 'PM') {
            isShiftAllowed = (currentHour >= 6 && currentHour < 24);
        }

        return res.status(200).json({
            message: `Shift ${shift} allowance check successful.`, // More informative message
            allowed: isShiftAllowed
        });

    } catch (error) {
        console.error("Error checking shift allowance:", error);
        return res.status(500).json({ message: "Internal server error while checking shift allowance", error: error.message, allowed: false }); // Include allowed: false in error response
    }
});



// API to get all orders
router.get("/get-all-orders", async (req, res) => {
    try {
        // Query to select all orders
        const query = "SELECT * FROM orders";
        
        // Execute the query
        const result = await executeQuery(query);

        if (result.length > 0) {
            return res.status(200).json({ 
                message: "Orders fetched successfully",
                data: result 
            });
        } else {
            return res.status(404).json({ message: "No orders found" });
        }
    } catch (error) {
        console.error("Error fetching orders:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});


// price update api - Corrected to update a specific product
// --- 2. UPDATE Order Product Price and Total Amount (Modified Endpoint) ---
router.put("/update_order_price/:orderId/product/:productId", async (req, res) => {
    try {
        const { orderId, productId } = req.params; // Extract orderId and productId from URL params
        const { newPrice } = req.body; // Extract newPrice from request body

        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }

        if (!productId) {
            return res.status(400).json({ success: false, message: "Product ID is required" });
        }

        if (newPrice === undefined || newPrice === null || isNaN(parseFloat(newPrice))) {
            return res.status(400).json({ success: false, message: "New price is required and must be a valid number" });
        }

        // --- Step 1: Update the price for a specific product in the order_products table ---
        const updateOrderPriceQuery = `
            UPDATE order_products
            SET price = ?
            WHERE order_id = ? AND product_id = ?
        `;
        const updateResult = await executeQuery(updateOrderPriceQuery, [newPrice, orderId, productId]);

        if (updateResult.affectedRows > 0) {
            console.log(`Updated price for order ID: ${orderId}, product ID: ${productId} to: ${newPrice}`);

            // --- Step 2: Fetch all products for the updated order to recalculate total amount ---
            const fetchOrderProductsQuery = `
                SELECT price, quantity
                FROM order_products
                WHERE order_id = ?
            `;
            const orderProductsResult = await executeQuery(fetchOrderProductsQuery, [orderId]);
            const orderProducts = orderProductsResult;

            // --- Step 3: Calculate the new total amount for the order ---
            let newTotalAmount = 0;
            if (orderProducts && orderProducts.length > 0) {
                newTotalAmount = orderProducts.reduce((sum, product) => sum + (product.price * product.quantity), 0);
            }

            // --- Step 4: Update the total_amount in the orders table ---
            const updateOrdersTableQuery = `
                UPDATE orders
                SET total_amount = ?
                WHERE id = ?
            `;
            const updateOrdersResult = await executeQuery(updateOrdersTableQuery, [newTotalAmount, orderId]);

            if (updateOrdersResult.affectedRows > 0) {
                console.log(`Updated total_amount for order ID: ${orderId} to: ${newTotalAmount}`);
                res.json({ success: true, message: `Price for order ID ${orderId}, product ID ${productId} updated successfully to ${newPrice}. Total amount updated to ${newTotalAmount}` });
            } else {
                // Handle the case where the order might not exist in the orders table (though it should)
                res.status(404).json({ success: false, message: `Order with ID ${orderId} found, product price updated, but failed to update total amount in orders table.` });
            }

        } else {
            res.status(404).json({ success: false, message: `Order with ID ${orderId} or product with ID ${productId} not found or no such product associated with the order to update` });
        }

    } catch (error) {
        console.error("Error updating order price and total amount:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error });
    }
});



router.post("/customer_price_update", async (req, res) => {
    try {
        const { customer_id, product_id, customer_price } = req.body;

        // Validate input
        if (!customer_id || !product_id || customer_price === undefined || customer_price === null || isNaN(parseFloat(customer_price))) {
            return res.status(400).json({ message: "customer_id, product_id, and customer_price are required and customer_price must be a valid number" });
        }

        // Check if a record exists for the given customer and product
        const checkQuery = "SELECT * FROM customer_product_prices WHERE customer_id = ? AND product_id = ?";
        const checkValues = [customer_id, product_id];
        const existingRecord = await executeQuery(checkQuery, checkValues);

        let result;
        if (existingRecord.length > 0) {
            // Update the existing record
            const updateQuery = "UPDATE customer_product_prices SET customer_price = ? WHERE customer_id = ? AND product_id = ?";
            const updateValues = [customer_price, customer_id, product_id];
            result = await executeQuery(updateQuery, updateValues);

            if (result.affectedRows > 0) {
                return res.status(200).json({ message: "Customer price updated successfully" });
            } else {
                return res.status(200).json({ message: "Customer price updated successfully (no changes made)" });
            }
        } else {
            // Insert a new record
            const insertQuery = "INSERT INTO customer_product_prices (customer_id, product_id, customer_price) VALUES (?, ?, ?)";
            const insertValues = [customer_id, product_id, customer_price];
            result = await executeQuery(insertQuery, insertValues);

            if (result.affectedRows > 0) {
                return res.status(201).json({ message: "Customer price added successfully" });
            } else {
                return res.status(500).json({ message: "Failed to add customer price" });
            }
        }
    } catch (error) {
        console.error("Error updating/adding customer price:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});


router.get("/customer_price_check", async (req, res) => {
    try {
        const { customer_id } = req.query; // Assuming customer_id is passed as a query parameter

        // Validate input
        if (!customer_id) {
            return res.status(400).json({ message: "customer_id is required" });
        }

        // Query to fetch all product IDs and prices for the given customer
        const query = "SELECT product_id, customer_price FROM customer_product_prices WHERE customer_id = ?";
        const values = [customer_id];

        const results = await executeQuery(query, values);

        if (results.length > 0) {
            return res.status(200).json(results); // Return the array of product_id and customer_price
        } else {
            return res.status(404).json({ message: "No prices found for the given customer" });
        }
    } catch (error) {
        console.error("Error fetching customer prices:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});





// API endpoint to update user's auto_am_order and auto_pm_order
router.post("/update-auto-order-preferences", async (req, res) => {
    try {
        const { auto_am_order, auto_pm_order, customer_id } = req.body; // Changed to accept customer_id

        // Validate input
        if (!customer_id) {
            return res.status(400).json({ message: "customer_id is required." });
        }
        if (auto_am_order !== 'Yes' && auto_am_order !== 'No' && auto_am_order !== null && auto_am_order !== undefined) {
            return res.status(400).json({ message: "Invalid value for auto_am_order. Must be 'Yes' or 'No'." });
        }
        if (auto_pm_order !== 'Yes' && auto_pm_order !== 'No' && auto_pm_order !== null && auto_pm_order !== undefined) {
            return res.status(400).json({ message: "Invalid value for auto_pm_order. Must be 'Yes' or 'No'." });
        }

        // Update query
        const query = "UPDATE users SET auto_am_order = ?, auto_pm_order = ? WHERE customer_id = ?"; // Assuming your users table has an 'id' column that corresponds to the customer_id

        // Values to be inserted into the query
        const values = [auto_am_order, auto_pm_order, customer_id];

        // Execute the query
        const result = await executeQuery(query, values);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: "Auto order preferences updated successfully", success: true });
        } else {
            return res.status(404).json({ message: "Customer not found or preferences not updated", success: false });
        }
    } catch (error) {
        console.error("Error updating auto order preferences:", error);
        return res.status(500).json({ message: "Internal server error", success: false, error: error.message });
    }
});


router.post("/global-price-update", async (req, res) => {
    try {
        const { product_id, new_discount_price } = req.body;

        // Validate input
        if (!product_id || !new_discount_price) {
            return res.status(400).json({ message: "product_id and new_discount_price are required" });
        }

        // Step 1: Fetch the fixed price (MRP) from the products table
        const selectQuery = "SELECT price FROM products WHERE id = ?";
        const productResult = await executeQuery(selectQuery, [product_id]);

        if (productResult.length === 0) {
            return res.status(404).json({ message: "Product not found" });
        }

        const fixedPrice = parseFloat(productResult[0].price); // Use price (MRP) as the base
        const newPrice = parseFloat(new_discount_price);
        const priceDifference = newPrice - fixedPrice; // Calculate difference from fixed price

        console.log("Fixed Price (MRP):", fixedPrice);
        console.log("New Discount Price:", newPrice);
        console.log("Price Difference:", priceDifference);

        // Step 2: Update customer_product_prices table
        const updateCustomerPricesQuery = `
            UPDATE customer_product_prices 
            SET customer_price = customer_price + ? 
            WHERE product_id = ?
        `;
        const customerUpdateResult = await executeQuery(updateCustomerPricesQuery, [priceDifference, product_id]);

        console.log("Customer rows affected:", customerUpdateResult.affectedRows);

        // Step 3: Update the products table with the new discountPrice
        const updateProductQuery = "UPDATE products SET discountPrice = ? WHERE id = ?";
        const productUpdateResult = await executeQuery(updateProductQuery, [newPrice, product_id]);

        if (productUpdateResult.affectedRows === 0) {
            return res.status(404).json({ message: "Failed to update product price" });
        }

        return res.status(200).json({
            message: "Global price update completed successfully",
            affectedCustomerRows: customerUpdateResult.affectedRows,
        });
    } catch (error) {
        console.error("Error in global price update:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});


router.get("/fetch-all-invoices", async (req, res) => {
    try {
        // Extract startDate and endDate from query parameters
        const { startDate, endDate } = req.query;

        // Validate date parameters
        if (startDate && !moment(startDate, 'YYYY-MM-DD', true).isValid()) {
            return res.status(400).json({ message: "Invalid startDate format. Use YYYY-MM-DD" });
        }
        if (endDate && !moment(endDate, 'YYYY-MM-DD', true).isValid()) {
            return res.status(400).json({ message: "Invalid endDate format. Use YYYY-MM-DD" });
        }

        // Base SQL query
        let query = `
            SELECT 
                i.invoice_id AS "Invoice No",
                i.id AS "id",
                i.invoice_date AS "Voucher Date",
                i.invoice_date AS "Invoice Date",
                u.name AS "Customer Name",
                u.phone AS "Customer Mobile",
                op.name AS "Product Description",
                p.brand AS "Stock Group", 
                op.category AS "Stock Category",
                op.price AS "Rate",
                op.quantity AS "Quantity",
                (op.price * op.quantity) AS "Amount",
                p.hsn_code AS "HSN",
                op.gst_rate AS "GST %",
                o.id AS "order_id",
                o.placed_on AS "order_date"
            FROM 
                invoice i
            JOIN 
                orders o ON i.order_id = o.id COLLATE utf8mb4_0900_ai_ci
            JOIN 
                users u ON o.customer_id = u.customer_id COLLATE utf8mb4_0900_ai_ci
            JOIN 
                order_products op ON o.id = op.order_id COLLATE utf8mb4_0900_ai_ci
            JOIN 
                products p ON op.product_id = p.id COLLATE utf8mb4_0900_ai_ci
        `;

        // Add date filtering if parameters are provided
        const queryParams = [];
        if (startDate || endDate) {
            query += ` WHERE `;
            if (startDate) {
                const startUnix = moment(startDate, 'YYYY-MM-DD').startOf('day').unix();
                query += ` i.invoice_date >= ? `;
                queryParams.push(startUnix);
            }
            if (startDate && endDate) {
                query += ` AND `;
            }
            if (endDate) {
                const endUnix = moment(endDate, 'YYYY-MM-DD').endOf('day').unix();
                query += ` i.invoice_date <= ? `;
                queryParams.push(endUnix);
            }
        }

        query += `
            ORDER BY
                i.invoice_date DESC,
                i.invoice_id COLLATE utf8mb4_0900_ai_ci, 
                op.product_id COLLATE utf8mb4_0900_ai_ci
        `;

        // Execute the query with parameters
        const results = await executeQuery(query, queryParams);

        // Group by invoice to organize the data
        const invoices = {};
        results.forEach(row => {
            if (!invoices[row['Invoice No']]) {
                invoices[row['Invoice No']] = {
                    invoice_id: row['Invoice No'],
                    id: row['id'],
                    voucher_date: row['Voucher Date'],
                    invoice_date: row['Invoice Date'],
                    customer_name: row['Customer Name'] || 'Unknown',
                    customer_mobile: row['Customer Mobile'] || '-',
                    order_id: row['order_id'] || '-',
                    order_date: row['order_date'] || null,
                    items: []
                };
            }
            invoices[row['Invoice No']].items.push({
                product_description: row['Product Description'] || '-',
                stock_group: row['Stock Group'] || '-',
                stock_category: row['Stock Category'] || '-',
                rate: row['Rate'] || 0,
                quantity: row['Quantity'] || 0,
                amount: row['Amount'] || 0,
                hsn: row['HSN'] || '-',
                gst_percentage: row['GST %'] || 0
            });
        });

        return res.status(200).json({
            message: results.length > 0 ? "Invoices fetched successfully" : "No invoices found",
            data: Object.values(invoices)
        });
    } catch (error) {
        console.error("Error fetching invoices:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});


router.get("/fetch-total-paid", async (req, res) => {
    try {
        const customerId = req.query.customer_id;
        const month = req.query.month; // YYYY-MM format

        if (!customerId || !month) {
            return res.status(400).json({ message: "Customer ID and month are required" });
        }

        // Query to calculate total paid amount for the month
        const query = `
            SELECT SUM(payment_amount) as total_paid 
            FROM payment_transactions 
            WHERE customer_id = ? 
            AND DATE_FORMAT(payment_date, '%Y-%m') = ?
        `;
        const params = [customerId, month];

        const result = await executeQuery(query, params);

        const totalPaid = result[0]?.total_paid || 0;

        return res.status(200).json({
            message: "Total paid amount fetched successfully",
            total_paid: totalPaid
        });
    } catch (error) {
        console.error("Error fetching total paid amount:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});


router.get("/fetch-total-paid-by-day", async (req, res) => {
    try {
        const customerId = req.query.customer_id;
        const date = req.query.date; // YYYY-MM-DD format

        if (!customerId || !date) {
            return res.status(400).json({ message: "Customer ID and date are required" });
        }

        // Query to calculate total paid amount for the specific day
        const query = `
            SELECT SUM(payment_amount) as total_paid 
            FROM payment_transactions 
            WHERE customer_id = ? 
            AND DATE(payment_date) = ?
        `;
        const params = [customerId, date];

        const result = await executeQuery(query, params);

        const totalPaid = result[0]?.total_paid || 0;

        return res.status(200).json({
            message: "Total paid amount for the day fetched successfully",
            total_paid: totalPaid
        });
    } catch (error) {
        console.error("Error fetching total paid by day:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

router.delete("/delete_product", async (req, res) => {
    try {
        const { id } = req.query;

        // Validate input
        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required"
            });
        }

        // First check if product exists
        const checkProductQuery = "SELECT id FROM products WHERE id = ?";
        const product = await executeQuery(checkProductQuery, [id]);

        if (product.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Check if product is being used in order_products
        const checkOrderProductsQuery = "SELECT COUNT(*) as count FROM order_products WHERE product_id = ?";
        const orderProductsCount = await executeQuery(checkOrderProductsQuery, [id]);

        if (orderProductsCount[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: "Cannot delete product as it is being used in orders"
            });
        }

        // If no orders found using this product, proceed with deletion
        const deleteQuery = "DELETE FROM products WHERE id = ?";
        await executeQuery(deleteQuery, [id]);

        return res.status(200).json({
            success: true,
            message: "Product deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting product:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});














// GET /get-user-location/:customerId
router.get("/get-user-location/:customerId", async (req, res) => {
    try {
        const { customerId } = req.params; // Extract customerId from URL params

        if (!customerId) {
            return res.status(400).json({ success: false, message: "Customer ID is required" });
        }

        const selectLocationQuery = `SELECT latitude, longitude FROM users WHERE customer_id = ?`;
        const results = await executeQuery(selectLocationQuery, [customerId]);

        if (results.length > 0) {
            const location = {
                latitude: results[0].latitude !== null ? parseFloat(results[0].latitude) : null,
                longitude: results[0].longitude !== null ? parseFloat(results[0].longitude) : null,
            };
            console.log(`Fetched location for customer ID: ${customerId}`, location);
            res.json({
                success: true,
                data: location,
                message: "User location fetched successfully",
            });
        } else {
            res.status(404).json({
                success: false,
                message: "User not found or location data unavailable",
            });
        }
    } catch (error) {
        console.error("Error fetching user location:", error);
        res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
});

// Get counts of different user roles
router.get("/user-roles-count", async (req, res) => {
    try {
        // SQL query to count users by role
        const query = `
            SELECT role, COUNT(*) as count
            FROM users
            GROUP BY role
        `;

        // Execute the query
        const results = await executeQuery(query);

        // Initialize counts object with default values
        const roleCounts = {
            admin: 0,
            user: 0,
            superadmin: 0
        };

        // Update counts from results
        results.forEach(row => {
            if (row.role && roleCounts.hasOwnProperty(row.role.toLowerCase())) {
                roleCounts[row.role.toLowerCase()] = row.count;
            }
        });

        return res.status(200).json({
            success: true,
            message: "User role counts fetched successfully",
            data: roleCounts
        });

    } catch (error) {
        console.error("Error fetching user role counts:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});


// Simple API to update product code prefix
router.post("/update-product-prefix", async (req, res) => {
    try {
        const { prefix } = req.body;

        // Basic validation for 3 capital letters
        if (!prefix || !/^[A-Z]{3}$/.test(prefix)) {
            return res.status(400).json({ 
                success: false, 
                message: "Prefix must be 3 capital letters" 
            });
        }

        // Simple update query
        const query = "UPDATE products SET product_code = ?";
        await executeQuery(query, [prefix]);

        return res.status(200).json({
            success: true,
            message: "Product prefix updated successfully"
        });

    } catch (error) {
        console.error("Error updating product prefix:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});

// Route to read local files
router.post("/read-local-file", async (req, res) => {
    try {
        const { filePath } = req.body;
        
        // Validate the file path
        if (!filePath) {
            return res.status(400).json({ 
                success: false, 
                message: "File path is required" 
            });
        }

        // Create uploads directory if it doesn't exist
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Check if source file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: "Source file not found",
                path: filePath
            });
        }

        // Generate a unique filename
        const timestamp = Date.now();
        const originalName = path.basename(filePath);
        const fileExt = path.extname(originalName);
        const newFileName = `${timestamp}-${originalName}`;
        const newFilePath = path.join(uploadDir, newFileName);

        try {
            // Copy the file to uploads directory
            await fs.promises.copyFile(filePath, newFilePath);
            console.log("File copied successfully to:", newFilePath);

            // Read the copied file
            const fileBuffer = await fs.promises.readFile(newFilePath);
            
            // Get the file type
            const contentType = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.pdf': 'application/pdf',
                '.txt': 'text/plain',
                '.json': 'application/json'
            }[fileExt.toLowerCase()] || 'application/octet-stream';

            // Send the file
            res.setHeader('Content-Type', contentType);
            res.send(fileBuffer);

        } catch (copyError) {
            console.error("Error copying/reading file:", copyError);
            return res.status(500).json({
                success: false,
                message: "Failed to copy/read file",
                error: copyError.message,
                sourcePath: filePath,
                targetPath: newFilePath
            });
        }

    } catch (error) {
        console.error("Error in read-local-file:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to process file",
            error: error.message,
            path: filePath
        });
    }
});


// Single API endpoint for all brand CRUD operations
router.post("/brand-crud", async (req, res) => {
    try {
        const { operation, id, name } = req.body;

        // Validate operation type
        if (!operation || !['create', 'read', 'update', 'delete'].includes(operation.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Valid operation (create/read/update/delete) is required"
            });
        }

        switch (operation.toLowerCase()) {
            case 'create':
                // Validate input for create
                if (!name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Valid brand name is required for creation"
                    });
                }

                // Check for duplicate brand name
                const checkQuery = "SELECT id FROM brands WHERE name = ?";
                const existingBrand = await executeQuery(checkQuery, [name]);
                
                if (existingBrand.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Brand with this name already exists"
                    });
                }

                // Insert new brand
                const insertQuery = "INSERT INTO brands (name) VALUES (?)";
                const insertResult = await executeQuery(insertQuery, [name]);

                return res.status(200).json({
                    success: true,
                    message: "Brand created successfully",
                    brandId: insertResult.insertId
                });

            case 'read':
                // Read all brands or specific brand
                let readQuery = "SELECT * FROM brands";
                let readParams = [];

                if (id) {
                    readQuery += " WHERE id = ?";
                    readParams.push(id);
                }

                readQuery += " ORDER BY name ASC";
                const brands = await executeQuery(readQuery, readParams);

                if (id && brands.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Brand not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Brand(s) fetched successfully",
                    data: brands
                });

            case 'update':
                // Validate input for update
                if (!id || !name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Both brand ID and name are required for update"
                    });
                }

                // Update brand
                const updateQuery = "UPDATE brands SET name = ? WHERE id = ?";
                const updateResult = await executeQuery(updateQuery, [name, id]);

                if (updateResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Brand not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Brand updated successfully"
                });

            case 'delete':
                // Validate input for delete
                if (!id) {
                    return res.status(400).json({
                        success: false,
                        message: "Brand ID is required for deletion"
                    });
                }

                // First get the brand name
                const getBrandQuery = "SELECT name FROM brands WHERE id = ?";
                const brand = await executeQuery(getBrandQuery, [id]);

                if (brand.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Brand not found"
                    });
                }

                // Check if brand name exists in products table
                const checkProductsQuery = "SELECT COUNT(*) as count FROM products WHERE brand = ?";
                const productCount = await executeQuery(checkProductsQuery, [brand[0].name]);

                if (productCount[0].count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot delete brand as it is being used in products table"
                    });
                }

                // If no products found using this brand, proceed with deletion
                const deleteQuery = "DELETE FROM brands WHERE id = ?";
                await executeQuery(deleteQuery, [id]);

                return res.status(200).json({
                    success: true,
                    message: "Brand deleted successfully"
                });
        }
    } catch (error) {
        console.error("Error in brand CRUD operation:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Single API endpoint for all category CRUD operations
router.post("/category-crud", async (req, res) => {
    try {
        const { operation, id, name } = req.body;

        // Validate operation type
        if (!operation || !['create', 'read', 'update', 'delete'].includes(operation.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Valid operation (create/read/update/delete) is required"
            });
        }

        switch (operation.toLowerCase()) {
            case 'create':
                // Validate input for create
                if (!name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Valid category name is required for creation"
                    });
                }

                // Check for duplicate category name
                const checkQuery = "SELECT id FROM categories WHERE name = ?";
                const existingCategory = await executeQuery(checkQuery, [name]);
                
                if (existingCategory.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Category with this name already exists"
                    });
                }

                // Insert new category
                const insertQuery = "INSERT INTO categories (name) VALUES (?)";
                const insertResult = await executeQuery(insertQuery, [name]);

                return res.status(200).json({
                    success: true,
                    message: "Category created successfully",
                    categoryId: insertResult.insertId
                });

            case 'read':
                // Read all categories or specific category
                let readQuery = "SELECT id, name FROM categories";
                let readParams = [];

                if (id) {
                    readQuery += " WHERE id = ?";
                    readParams.push(id);
                }

                readQuery += " ORDER BY name";
                const categories = await executeQuery(readQuery, readParams);

                if (id && categories.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Category not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Category(s) fetched successfully",
                    data: categories
                });

            case 'update':
                // Validate input for update
                if (!id || !name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Both category ID and name are required for update"
                    });
                }

                // Update category
                const updateQuery = "UPDATE categories SET name = ? WHERE id = ?";
                const updateResult = await executeQuery(updateQuery, [name, id]);

                if (updateResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Category not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Category updated successfully"
                });

            case 'delete':
                // Validate input for delete
                if (!id) {
                    return res.status(400).json({
                        success: false,
                        message: "Category ID is required for deletion"
                    });
                }

                // First get the category name
                const getCategoryQuery = "SELECT name FROM categories WHERE id = ?";
                const category = await executeQuery(getCategoryQuery, [id]);

                if (category.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Category not found"
                    });
                }

                // Check if category name exists in products table
                const checkProductsQuery = "SELECT COUNT(*) as count FROM products WHERE category = ?";
                const productCount = await executeQuery(checkProductsQuery, [category[0].name]);

                if (productCount[0].count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot delete category as it is being used in products table"
                    });
                }

                // If no products found using this category, proceed with deletion
                const deleteQuery = "DELETE FROM categories WHERE id = ?";
                await executeQuery(deleteQuery, [id]);

                return res.status(200).json({
                    success: true,
                    message: "Category deleted successfully"
                });
        }
    } catch (error) {
        console.error("Error in category CRUD operation:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Single API endpoint for all unit of measure CRUD operations
router.post("/uom-crud", async (req, res) => {
    try {
        const { operation, id, name } = req.body;

        // Validate operation type
        if (!operation || !['create', 'read', 'update', 'delete'].includes(operation.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Valid operation (create/read/update/delete) is required"
            });
        }

        switch (operation.toLowerCase()) {
            case 'create':
                // Validate input for create
                if (!name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Valid unit of measure name is required for creation"
                    });
                }

                // Check for duplicate unit of measure name
                const checkQuery = "SELECT id FROM units_of_measure WHERE name = ?";
                const existingUOM = await executeQuery(checkQuery, [name]);
                
                if (existingUOM.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Unit of measure with this name already exists"
                    });
                }

                // Insert new unit of measure
                const insertQuery = "INSERT INTO units_of_measure (name) VALUES (?)";
                const insertResult = await executeQuery(insertQuery, [name]);

                return res.status(200).json({
                    success: true,
                    message: "Unit of measure created successfully",
                    uomId: insertResult.insertId
                });

            case 'read':
                // Read all units of measure or specific unit
                let readQuery = "SELECT id, name FROM units_of_measure";
                let readParams = [];

                if (id) {
                    readQuery += " WHERE id = ?";
                    readParams.push(id);
                }

                readQuery += " ORDER BY name";
                const uoms = await executeQuery(readQuery, readParams);

                if (id && uoms.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Unit of measure not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Unit(s) of measure fetched successfully",
                    data: uoms
                });

            case 'update':
                // Validate input for update
                if (!id || !name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Both unit of measure ID and name are required for update"
                    });
                }

                // Update unit of measure
                const updateQuery = "UPDATE units_of_measure SET name = ? WHERE id = ?";
                const updateResult = await executeQuery(updateQuery, [name, id]);

                if (updateResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Unit of measure not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Unit of measure updated successfully"
                });

            case 'delete':
                // Validate input for delete
                if (!id) {
                    return res.status(400).json({
                        success: false,
                        message: "Unit of measure ID is required for deletion"
                    });
                }

                // First get the UOM name
                const getUOMQuery = "SELECT name FROM units_of_measure WHERE id = ?";
                const uom = await executeQuery(getUOMQuery, [id]);

                if (uom.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Unit of measure not found"
                    });
                }

                // Check if UOM name exists in products table (either in uom or auom column)
                const checkProductsQuery = `
                    SELECT COUNT(*) as count 
                    FROM products 
                    WHERE uom = ? OR auom = ?
                `;
                const productCount = await executeQuery(checkProductsQuery, [uom[0].name, uom[0].name]);

                if (productCount[0].count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot delete unit of measure as it is being used in products table"
                    });
                }

                // If no products found using this UOM, proceed with deletion
                const deleteQuery = "DELETE FROM units_of_measure WHERE id = ?";
                await executeQuery(deleteQuery, [id]);

                return res.status(200).json({
                    success: true,
                    message: "Unit of measure deleted successfully"
                });
        }
    } catch (error) {
        console.error("Error in unit of measure CRUD operation:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Single API endpoint for all route CRUD operations
router.post("/route-crud", async (req, res) => {
    try {
        const { operation, id, name } = req.body;

        // Validate operation type
        if (!operation || !['create', 'read', 'update', 'delete'].includes(operation.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Valid operation (create/read/update/delete) is required"
            });
        }

        switch (operation.toLowerCase()) {
            case 'create':
                // Validate input for create
                if (!name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Valid route name is required for creation"
                    });
                }

                // Check for duplicate route name in both routes table and users table
                const checkQuery = `
                    SELECT 1 FROM routes WHERE name = ?
                    UNION
                    SELECT 1 FROM users WHERE route = ?
                `;
                const existingRoute = await executeQuery(checkQuery, [name, name]);
                
                if (existingRoute.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Route with this name already exists in either routes table or users table"
                    });
                }

                // Insert new route
                const insertQuery = "INSERT INTO routes (name) VALUES (?)";
                const insertResult = await executeQuery(insertQuery, [name]);

                return res.status(200).json({
                    success: true,
                    message: "Route created successfully",
                    routeId: insertResult.insertId
                });

            case 'read':
                // Read all routes or specific route
                let readQuery = "SELECT id, name FROM routes";
                let readParams = [];

                if (id) {
                    readQuery += " WHERE id = ?";
                    readParams.push(id);
                }

                readQuery += " ORDER BY name ASC";
                const routes = await executeQuery(readQuery, readParams);

                if (id && routes.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Route not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Route(s) fetched successfully",
                    data: routes
                });

            case 'update':
                // Validate input for update
                if (!id || !name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Both route ID and name are required for update"
                    });
                }

                // Update route
                const updateQuery = "UPDATE routes SET name = ? WHERE id = ?";
                const updateResult = await executeQuery(updateQuery, [name, id]);

                if (updateResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Route not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Route updated successfully"
                });

            case 'delete':
                // Validate input for delete
                if (!id) {
                    return res.status(400).json({
                        success: false,
                        message: "Route ID is required for deletion"
                    });
                }

                // First get the route name
                const getRouteQuery = "SELECT name FROM routes WHERE id = ?";
                const route = await executeQuery(getRouteQuery, [id]);

                if (route.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Route not found"
                    });
                }

                // Check if route name exists in users table
                const checkUsersQuery = "SELECT COUNT(*) as count FROM users WHERE route = ?";
                const userCount = await executeQuery(checkUsersQuery, [route[0].name]);

                if (userCount[0].count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot delete route as it is being used in users table"
                    });
                }

                // If no users found using this route, proceed with deletion
                const deleteQuery = "DELETE FROM routes WHERE id = ?";
                await executeQuery(deleteQuery, [id]);

                return res.status(200).json({
                    success: true,
                    message: "Route deleted successfully"
                });
        }
    } catch (error) {
        console.error("Error in route CRUD operation:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Single API endpoint for all stock group CRUD operations
router.post("/stockgroup-crud", async (req, res) => {
    try {
        const { operation, id, name } = req.body;

        // Validate operation type
        if (!operation || !['create', 'read', 'update', 'delete'].includes(operation.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Valid operation (create/read/update/delete) is required"
            });
        }

        switch (operation.toLowerCase()) {
            case 'create':
                // Validate input for create
                if (!name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Valid stock group name is required for creation"
                    });
                }

                // Insert new stock group
                const insertQuery = "INSERT INTO stock_groups (name) VALUES (?)";
                const insertResult = await executeQuery(insertQuery, [name]);

                return res.status(200).json({
                    success: true,
                    message: "Stock group created successfully",
                    stockGroupId: insertResult.insertId
                });

            case 'read':
                // Read all stock groups or specific stock group
                let readQuery = "SELECT id, name FROM stock_groups";
                let readParams = [];

                if (id) {
                    readQuery += " WHERE id = ?";
                    readParams.push(id);
                }

                readQuery += " ORDER BY name";
                const stockGroups = await executeQuery(readQuery, readParams);

                if (id && stockGroups.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Stock group not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Stock group(s) fetched successfully",
                    data: stockGroups
                });

            case 'update':
                // Validate input for update
                if (!id || !name || typeof name !== 'string') {
                    return res.status(400).json({
                        success: false,
                        message: "Both stock group ID and name are required for update"
                    });
                }

                // Update stock group
                const updateQuery = "UPDATE stock_groups SET name = ? WHERE id = ?";
                const updateResult = await executeQuery(updateQuery, [name, id]);

                if (updateResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Stock group not found"
                    });
                }

                return res.status(200).json({
                    success: true,
                    message: "Stock group updated successfully"
                });

            case 'delete':
                // Validate input for delete
                if (!id) {
                    return res.status(400).json({
                        success: false,
                        message: "Stock group ID is required for deletion"
                    });
                }

                // First get the stock group name
                const getStockGroupQuery = "SELECT name FROM stock_groups WHERE id = ?";
                const stockGroup = await executeQuery(getStockGroupQuery, [id]);

                if (stockGroup.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Stock group not found"
                    });
                }

                // Check if stock group name exists in products table
                const checkProductsQuery = "SELECT COUNT(*) as count FROM products WHERE stock_group = ?";
                const productCount = await executeQuery(checkProductsQuery, [stockGroup[0].name]);

                if (productCount[0].count > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot delete stock group as it is being used in products table"
                    });
                }

                // If no products found using this stock group, proceed with deletion
                const deleteQuery = "DELETE FROM stock_groups WHERE id = ?";
                await executeQuery(deleteQuery, [id]);

                return res.status(200).json({
                    success: true,
                    message: "Stock group deleted successfully"
                });
        }
    } catch (error) {
        console.error("Error in stock group CRUD operation:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

module.exports = router;