const express = require("express");
const router = express.Router();
const { executeQuery } = require("../dbUtils/db");
const moment = require("moment-timezone"); 



// API to update order approved_status
router.post("/update-order-status", async (req, res) => {
    try {
        const { id, approve_status } = req.body;

        // Validate input
        if (!id || !approve_status) {
            return res.status(400).json({ message: "id and approved_status are required" });
        }

        // Update query with conditional altered status
        const query = "UPDATE orders SET approve_status = ?, altered = CASE WHEN ? = 'Accepted' THEN 'No' ELSE altered END WHERE id = ?";
        const values = [approve_status, approve_status, id];




        // Execute the query
        const result = await executeQuery(query, values);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: "Order status updated successfully" });
        } else {
            return res.status(404).json({ message: "Order not found" });
        }
    } catch (error) {
        console.error("Error updating order status:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});




router.post("/update-delivery-status", async (req, res) => {
    try {
        // **Correctly extract order_id from req.body**
        const { customer_id, delivery_status, order_id } = req.body;

        if (!customer_id || !delivery_status || !order_id) { // **Added check for order_id**
            return res.status(400).json({ status: false, message: "Customer ID, order ID, and delivery status are required" }); // **Updated message**
        }

        if (!["pending", "delivered","out for delivery","processing",'objection'].includes(delivery_status.toLowerCase())) {
            return res.status(400).json({ status: false, message: "Invalid delivery status" });
        }

        // **Update the delivery status for the SPECIFIC order ID from the request**
        const updateQuery = "UPDATE orders SET delivery_status = ? WHERE id = ?"; // **WHERE id = ? is now correct for order_id**
        const updateValues = [delivery_status.toLowerCase(), order_id]; // **Using order_id from request!**
        const updateResult = await executeQuery(updateQuery, updateValues);

        if (updateResult.affectedRows > 0) {
            return res.json({
                status: true,
                message: "Delivery status updated successfully",
                order_id: order_id // **Returning the CORRECT order_id that was updated**
            });
        } else {
            return res.status(404).json({ status: false, message: "Order not found or failed to update", order_id: order_id }); // **Return order_id in error response too**
        }
    } catch (error) {
        console.error("Error updating delivery status:", error);
        res.status(500).json({ status: false, message: "Internal Server Error" });
    }
});


router.get("/get-orders/:customer_id", async (req, res) => {
    try {
        const { customer_id } = req.params;
        const { date } = req.query;

        if (!customer_id) {
            return res.status(400).json({ status: false, message: "Customer ID is required" });
        }

        let fetchQuery = "SELECT id, total_amount, customer_id, delivery_status, approve_status, cancelled, placed_on, loading_slip, order_type FROM orders WHERE customer_id = ? ";
        let queryParams = [customer_id];

        if (date) {
            // Validate date format (YYYY-MM-DD)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({ status: false, message: "Invalid date format. Use YYYY-MM-DD" });
            }

            // Calculate start and end of the day in Unix timestamps
            const startOfDay = moment(date).startOf('day').unix();
            const endOfDay = moment(date).endOf('day').unix();

            fetchQuery += "AND placed_on >= ? AND placed_on <= ? ";
            queryParams.push(startOfDay, endOfDay);
        }

        fetchQuery += "ORDER BY id DESC";
        const fetchResult = await executeQuery(fetchQuery, queryParams);

        return res.json({ status: true, orders: fetchResult });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ status: false, message: "Internal Server Error" });
    }
});

router.get("/get-orders-sa/", async (req, res) => {
    try {
        const { date } = req.query;

        let fetchQuery = "SELECT * FROM orders ORDER BY id DESC";
        let queryParams = [];

        if (date) {
            // Validate date format (YYYY-MM-DD)
            const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
            if (!isValidDate) {
                return res.status(400).json({ status: false, message: "Invalid date format. Use YYYY-MM-DD" });
            }

            // Convert date to Unix timestamp range for the given day
            const startOfDay = Math.floor(new Date(date).setHours(0, 0, 0, 0) / 1000); // Start of day in seconds
            const endOfDay = Math.floor(new Date(date).setHours(23, 59, 59, 999) / 1000); // End of day in seconds

            fetchQuery = "SELECT * FROM orders WHERE placed_on >= ? AND placed_on <= ? ORDER BY id DESC";
            queryParams = [startOfDay, endOfDay];
        }

        const fetchResult = await executeQuery(fetchQuery, queryParams);

        return res.json({ status: true, orders: fetchResult });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ status: false, message: "Internal Server Error" });
    }
});


router.get("/get-admin-orders/:admin_id", async (req, res) => {
    try {
        const { admin_id } = req.params;
        const { date } = req.query;

        if (!admin_id) {
            return res.status(400).json({ success: false, message: "Admin ID is required" });
        }

        // Base SQL Query to fetch orders along with total indent amount
        let query = `
            SELECT o.*, 
                   SUM(op.price * op.quantity) AS amount 
            FROM orders o
            JOIN admin_assign a ON CAST(o.customer_id AS CHAR) COLLATE utf8mb4_general_ci = CAST(a.cust_id AS CHAR) COLLATE utf8mb4_general_ci
            LEFT JOIN order_products op ON o.id = op.order_id
            WHERE a.admin_id = ?
        `;
        let queryParams = [admin_id];

        if (date) {
            // Validate date format (YYYY-MM-DD)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });
            }

            // Calculate start and end of the day in Unix timestamps
            const startOfDay = moment(date).startOf('day').unix();
            const endOfDay = moment(date).endOf('day').unix();

            query += " AND o.placed_on >= ? AND o.placed_on <= ?";
            queryParams.push(startOfDay, endOfDay);
        }

        query += " GROUP BY o.id ORDER BY o.id DESC";

        const orders = await executeQuery(query, queryParams);

        res.json({ success: true, orders });

    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});



router.get("/order-by-date-shift", async (req, res) => {
    try {
        const { customerId, orderDate, orderType } = req.query;

        // Validate input
        if (!customerId || !orderDate || !orderType) {
            return res.status(400).json({ message: "customerId, orderDate, and orderType are required" });
        }

        // **Corrected SQL Query for INTEGER timestamp - Use FROM_UNIXTIME**
        // CONVERT_TZ is added to handle potential timezone differences, converting to 'UTC' for consistency.
        const query = `
            SELECT *
            FROM orders
            WHERE customer_id = ?
              AND DATE(CONVERT_TZ(FROM_UNIXTIME(placed_on), '+00:00', '+00:00')) = STR_TO_DATE(?, '%Y-%d-%m')
              AND order_type = ?
        `;
        const values = [customerId, orderDate, orderType];

        // Execute the query using await executeQuery
        const results = await executeQuery(query, values); // AWAIT the result

        if (results && results.length > 0) {
            // Order found - return the first result
            return res.status(200).json(results[0]);
        } else {
            // No order found
            return res.status(404).json({ message: "Order not found" });
        }

    } catch (error) { // Error handling using try...catch - simplified and cleaner
        console.error("Error fetching order by date and shift:", error);
        return res.status(500).json({ message: "Internal server error", error: error });
    }
});



router.get("/order-products", async (req, res) => { // <-- GET request, path: /order-products (now expects orderId as query parameter)
    try {
        const { orderId } = req.query; // Extract orderId from query parameters

        // Validate input - check if orderId is provided
        if (!orderId) {
            return res.status(400).json({ message: "orderId is required as a query parameter" });
        }

        // SQL query - fetch product details for a specific orderId
        const queryStatement = `
            SELECT
                order_id,
                product_id,
                quantity,
                price,
                name,
                category,
                gst_rate
            FROM
                order_products
            WHERE
                order_id = ?  -- Filter by orderId
        `;
        const params = [orderId]; // Parameter array with orderId

        // Execute the query using executeQuery
        const results = await executeQuery(queryStatement, params); // AWAIT the result

        if (results && results.length > 0) {
            // Products found for the given orderId - format and return
            const productList = results.map(row => ({
                order_id: row.order_id,
                product_id: row.product_id,
                quantity: row.quantity,
                price: row.price,
                name: row.name,
                category: row.category,
                gst_rate: row.gst_rate
            }));
            return res.status(200).json(productList);
        } else {
            // No products found for the given orderId
            return res.status(404).json({ message: "No products found for orderId: " + orderId });
        }

    } catch (error) { // Error handling
        console.error("Error fetching order products for orderId:", error);
        return res.status(500).json({ message: "Internal server error", error: error });
    }
});



router.get("/most-recent-order", async (req, res) => {
    try {
        const { customerId } = req.query;

        if (!customerId) {
            return res.status(400).json({ success: false, message: "Customer ID is required" });
        }        // Query to fetch most recent order by ID
        const query = `
            SELECT *
            FROM orders
            WHERE customer_id = ?
            ORDER BY id DESC
            LIMIT 1
        `;

        const recentOrder = await executeQuery(query, [customerId]);

        if (recentOrder && recentOrder.length > 0) {
            res.json({ success: true, order: recentOrder[0] });
        } else {
            res.json({ success: true, order: null, message: "No previous orders found for this customer" });
        }
    } catch (error) {
        console.error("Error fetching most recent order:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
    }
});



// --- 1. DELETE Order Product (New Endpoint for immediate deletion) ---
router.delete("/delete_order_product/:orderProductId", async (req, res) => {
    try {
        const { orderProductId } = req.params; // Extract orderProductId from URL params

        if (!orderProductId) {
            return res.status(400).json({ success: false, message: "Order Product ID is required" });
        }

        const deleteOrderProductQuery = `DELETE FROM order_products WHERE product_id = ?`; // **Crucially: WHERE order_id = ?**
        const deleteResult = await executeQuery(deleteOrderProductQuery, [orderProductId]);

        if (deleteResult.affectedRows > 0) {
            console.log(`Deleted order_product with ID: ${orderProductId}`);
            res.json({ success: true, message: "Order product deleted successfully" });
        } else {
            res.status(404).json({ success: false, message: "Order product not found or already deleted" });
        }

    } catch (error) {
        console.error("Error deleting order product:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error });
    }
});
router.post("/order_update", async (req, res) => {
    try {
        const { orderId, products, totalAmount } = req.body;

        // Input validation
        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }
        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ success: false, message: "Products array is required" });
        }
        if (totalAmount === undefined || totalAmount === null) {
            return res.status(400).json({ success: false, message: "Total amount is required" });
        }

        // First check if any products exist for this order
        const checkProductsQuery = `
            SELECT COUNT(*) as count 
            FROM order_products 
            WHERE order_id = ?
        `;
        const [productCount] = await executeQuery(checkProductsQuery, [orderId]);
        
        // Set cancelled status based on products existence
        const cancelledStatus = (products.length === 0 || productCount.count === 0) ? 'Yes' : 'No';

        // Update order products if there are any
        if (products.length > 0) {
            for (const product of products) {
                const { order_id, quantity, price, gst_rate, is_new } = product;
                if (!order_id) {
                    return res.status(400).json({ success: false, message: "order_product_id is required for product updates" });
                }

                // Get current quantity and gst_rate for existing products
                let currentQuantity = 0;
                let currentGstRate = null;
                if (!is_new) {
                    const currentProductQuery = `SELECT quantity, gst_rate FROM order_products WHERE order_id = ? AND product_id = ?`;
                    const currentProduct = await executeQuery(currentProductQuery, [order_id, product.product_id]);
                    if (currentProduct.length > 0) {
                        currentQuantity = currentProduct[0].quantity;
                        currentGstRate = currentProduct[0].gst_rate;
                    }
                }

                if (is_new) {
                    const insertProductQuery = `
                        INSERT INTO order_products (order_id, product_id, quantity, price, name, category, gst_rate, altered)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'No')
                    `;
                    await executeQuery(insertProductQuery, [orderId, product.product_id, quantity, price, product.name, product.category, gst_rate]);
                } else {
                    // Calculate the actual quantity difference
                    const quantityDifference = quantity - currentQuantity;
                    const quantityChange = quantityDifference !== 0 ? quantityDifference.toString() : null;
                    
                    const updateProductQuery = `
                        UPDATE order_products
                        SET quantity = ?, 
                            price = ?,
                            gst_rate = ?,
                            altered = ?,
                            quantity_change = ?
                        WHERE order_id = ? AND product_id = ?
                    `;
                    
                    let alteredStatus = currentQuantity !== quantity || currentGstRate !== gst_rate ? 'Yes' : 'No';
                    await executeQuery(updateProductQuery, [
                        quantity, 
                        price, 
                        gst_rate,
                        alteredStatus,
                        quantityChange,
                        orderId, 
                        product.product_id
                    ]);
                }
            }
        }

        // Update total amount and cancelled status in orders table
        const updateOrderQuery = `
            UPDATE orders
            SET total_amount = ?,
                cancelled = ?,
                altered = 'Yes',
                approve_status = 'Altered'
            WHERE id = ?
        `;
        await executeQuery(updateOrderQuery, [totalAmount, cancelledStatus, orderId]);

        res.json({ 
            success: true, 
            message: `Order updated successfully. Status: ${cancelledStatus}`,
            cancelled: cancelledStatus
        });

    } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error });
    }
});


router.get("/latest-product-price", async (req, res) => {
    try {
        const { productId } = req.query;

        if (!productId || isNaN(productId)) {
            return res.status(400).json({ success: false, message: "Valid productId is required." });
        }

        const query = `
            SELECT price 
            FROM order_products 
            WHERE product_id = ? 
            ORDER BY id DESC 
            LIMIT 1
        `;
        const result = await executeQuery(query, [productId]);

        if (result.length === 0) {
            return res.status(404).json({ success: false, message: "No price found for this product in order_products." });
        }

        res.json({ success: true, price: result[0].price });
    } catch (error) {
        console.error("Error fetching latest product price:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error.message });
    }
});

// --- 3. CANCEL Order (Endpoint to cancel the order - Modified from DELETE) ---
router.post("/cancel_order/:orderId", async (req, res) => { // Changed to POST
    try {
        const { orderId } = req.params;

        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }

        // SQL query to DELETE from order_products table to remove product details
        const cancelOrderProductsQuery = `
            DELETE FROM order_products
            WHERE order_id = ?
        `;

        // Execute the query to cancel order products (DELETE instead of UPDATE)
        const cancelProductsResult = await executeQuery(cancelOrderProductsQuery, [orderId]);
        console.log("Order Products Cancel Result:", cancelProductsResult);

        // SQL query to update orders table to set total_amount to 0 and cancelled to 'Yes'
        const cancelOrdersTableQuery = `
            UPDATE orders
            SET total_amount = 0.0,
            cancelled = 'Yes'
            WHERE id = ?
        `;


        // Execute the query to cancel order in orders table
        const cancelOrdersResult = await executeQuery(cancelOrdersTableQuery, [orderId]);
        console.log("Order Table Cancel Result:", cancelOrdersResult);

        if (cancelOrdersResult.affectedRows > 0) { // Check if order in 'orders' table was updated
            console.log(`Cancelled order with ID: ${orderId}`);
            res.json({ success: true, message: "Order cancelled successfully for order ID: " + orderId });
        } else {
            res.status(404).json({ success: false, message: "Order not found or already cancelled" });
        }

    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error });
    }
});

router.post("/add-product-to-order", async (req, res) => {
    try {
        const { orderId, productId, quantity, price, name, category, gst_rate } = req.body;

        // --- Input Validation ---
        if (!orderId || !productId || quantity === undefined || price === undefined) {
            return res.status(400).json({ success: false, message: "Missing required fields: orderId, productId, quantity, and price are required." });
        }
        if (isNaN(orderId) || isNaN(productId) || isNaN(quantity) || isNaN(price) || quantity <= 0 || price < 0) {
            return res.status(400).json({ success: false, message: "Invalid data types: orderId and productId must be numbers, quantity must be a positive number, and price must be a non-negative number." });
        }
        if (gst_rate === undefined || isNaN(gst_rate) || gst_rate < 0) {
            return res.status(400).json({ success: false, message: "Invalid GST rate: gst_rate must be a non-negative number." });
        }

        // --- Check if Order and Product Exist ---
        const orderExistsQuery = `SELECT id FROM orders WHERE id = ?`;
        const productExistsQuery = `SELECT id, gst_rate FROM products WHERE id = ?`;

        const orderExistsResult = await executeQuery(orderExistsQuery, [orderId]);
        if (orderExistsResult.length === 0) {
            return res.status(400).json({ success: false, message: `Order with ID ${orderId} not found.` });
        }

        const productExistsResult = await executeQuery(productExistsQuery, [productId]);
        if (productExistsResult.length === 0) {
            return res.status(400).json({ success: false, message: `Product with ID ${productId} not found.` });
        }

        // Use the GST rate from the products table if not provided in the request
        const productGstRate = productExistsResult[0].gst_rate;
        const finalGstRate = gst_rate !== undefined ? gst_rate : productGstRate;

        // --- Check if the product is already in the order ---
        const productAlreadyInOrderQuery = `SELECT quantity FROM order_products WHERE order_id = ? AND product_id = ?`;
        const productInOrderResult = await executeQuery(productAlreadyInOrderQuery, [orderId, productId]);

        if (productInOrderResult.length > 0) {
            // Update quantity, price, and gst_rate if different
            if (parseInt(productInOrderResult[0].quantity) !== parseInt(quantity)) {
                const updateQuery = `
                    UPDATE order_products 
                    SET quantity = ?, price = ?, gst_rate = ?
                    WHERE order_id = ? AND product_id = ?
                `;
                await executeQuery(updateQuery, [quantity, price, finalGstRate, orderId, productId]);

                return res.json({
                    success: true,
                    message: "Product quantity and GST rate updated"
                });
            } else {
                return res.status(409).json({
                    success: false,
                    message: "Product already exists with same quantity"
                });
            }
        }

        // --- Use customer_product_prices if available ---
        let priceToUse = price;
        const customPriceResult = await executeQuery(
            'SELECT customer_price FROM customer_product_prices WHERE customer_id = ? AND product_id = ?',
            [req.body.customer_id, productId]
        );
        if (customPriceResult.length > 0) {
            priceToUse = customPriceResult[0].customer_price;
        }
        // --- Insert new order_product record ---
        const insertQuery = `
            INSERT INTO order_products (order_id, product_id, quantity, price, name, category, gst_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const insertResult = await executeQuery(insertQuery, [orderId, productId, quantity, priceToUse, name, category, finalGstRate]);

        // --- Update total_amount in orders table ---
        const updateOrderTotalQuery = `
            UPDATE orders
            SET total_amount = (
                SELECT COALESCE(SUM(quantity * price), 0)
                FROM order_products
                WHERE order_id = ?
            )
            WHERE id = ?
        `;
        await executeQuery(updateOrderTotalQuery, [orderId, orderId]);

        if (insertResult.affectedRows > 0) {
            console.log(`Product ID ${productId} added to order ID ${orderId} with GST rate ${finalGstRate}`);
            res.status(201).json({
                success: true,
                message: "Product added to order successfully",
                newOrderProductId: insertResult.insertId
            });
        } else {
            console.error("Failed to insert product into order");
            res.status(500).json({ success: false, message: "Failed to add product to order" });
        }

    } catch (error) {
        console.error("Error adding product to order:", error);
        res.status(500).json({ success: false, message: "Internal Server Error", error: error });
    }
});


router.post("/on-behalf", async (req, res) => {
    try {
        const { customer_id, order_type, reference_order_id } = req.body;

        if (!customer_id || !order_type || !reference_order_id) {
            return res.status(400).json({
                message: "customer_id, order_type, and reference_order_id are required"
            });
        }

        // Automatically determine order type based on current time
        const currentHour = new Date().getHours();
        
        if (currentHour >= 0 && currentHour < 12) {
            req.body.order_type = 'PM';
        } else {
            req.body.order_type = 'AM';
        }





        // 2. Validate reference_order_id exists and has products
        const checkReferenceOrderQuery = `
            SELECT id
            FROM orders
            WHERE id = ?
        `;
        const referenceOrderResult = await executeQuery(checkReferenceOrderQuery, [reference_order_id]);

        if (!referenceOrderResult || referenceOrderResult.length === 0) {
            return res.status(400).json({ message: `Reference order ID ${reference_order_id} does not exist.` });
        }

        const checkReferenceProductsQuery = `
            SELECT product_id, quantity, price, name, category,gst_rate
            FROM order_products
            WHERE order_id = ?
        `;
        const referenceProducts = await executeQuery(checkReferenceProductsQuery, [reference_order_id]);
        console.log(`Reference order ${reference_order_id} products for ${order_type}:`, referenceProducts);

        if (!referenceProducts || referenceProducts.length === 0) {
            return res.status(400).json({
                message: `No eligible products found in reference order ${reference_order_id} for ${order_type} order.`
            });
        }

        // 3. Place Admin Order and get new_order_id
        const insertOrderQuery = `
            INSERT INTO orders (customer_id, total_amount, order_type, placed_on, created_at, updated_at)
            VALUES (?, 0.0, ?, UNIX_TIMESTAMP(), UNIX_TIMESTAMP(), UNIX_TIMESTAMP())
        `;
        const orderValues = [customer_id, order_type];
        const insertOrderResult = await executeQuery(insertOrderQuery, orderValues);
        const newOrderId = insertOrderResult.insertId;

        if (!newOrderId) {
            return res.status(500).json({ message: "Failed to create new order." });
        }

        // 4. Insert Order Products from reference order
        const insertOrderProductsQuery = `
            INSERT INTO order_products (order_id, product_id, quantity, price, name, category,gst_rate)
            SELECT ?, product_id, quantity, price, name, category,gst_rate
            FROM order_products
            WHERE order_id = ?
        `;
        const orderProductsValues = [newOrderId, reference_order_id];
        const insertProductsResult = await executeQuery(insertOrderProductsQuery, orderProductsValues);
        console.log(`Inserted ${insertProductsResult.affectedRows} products for order ${newOrderId}`);

        // 5. Update total_amount in orders table
        const updateOrderTotalQuery = `
            UPDATE orders
            SET total_amount = (
                SELECT COALESCE(SUM(quantity * price), 0)
                FROM order_products
                WHERE order_id = ?
            )
            WHERE id = ?
        `;
        const updateTotalValues = [newOrderId, newOrderId];
        await executeQuery(updateOrderTotalQuery, updateTotalValues);

        // 6. Verify the order has products
        const verifyOrderProductsQuery = `
            SELECT COUNT(*) as product_count
            FROM order_products
            WHERE order_id = ?
        `;
        const verifyResult = await executeQuery(verifyOrderProductsQuery, [newOrderId]);
        const productCount = verifyResult[0].product_count;
        console.log(`Order ${newOrderId} has ${productCount} products`);

        if (productCount === 0) {
            // Optionally, delete the order if no products were added
            const deleteOrderQuery = `DELETE FROM orders WHERE id = ?`;
            await executeQuery(deleteOrderQuery, [newOrderId]);
            return res.status(400).json({
                message: `No products were added to ${order_type} order. Order creation cancelled.`
            });
        }

        return res.status(201).json({
            message: "Admin order placed successfully with products copied.",
            new_order_id: newOrderId,
            product_count: productCount
        });

    } catch (error) {
        console.error("Error placing admin order with products:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error.message
        });
    }
});

// Revised endpoint to update loading_slip status (following provided structure)
router.post('/update-loading-slip-status', async (req, res) => { // Changed to POST and removed :orderId from path
    try {
        const { orderId } = req.body; // Expecting orderId in request body

        // Validate input
        if (!orderId) {
            return res.status(400).json({ message: "Order ID is required in the request body" }); // More specific message
        }

        // Update query
        const query = 'UPDATE orders SET loading_slip = ? WHERE id = ?';
        const values = ['Yes', orderId];

        // Execute the query using executeQuery
        const result = await executeQuery(query, values);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: "Loading slip status updated successfully." });
        } else {
            return res.status(404).json({ message: "Order not found" });
        }
    } catch (error) {
        console.error("Error updating loading slip status:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});


router.get('/credit-limit', async (req, res) => {
    try {
        const { customerId } = req.query; // Expecting customerId as a query parameter, e.g., /credit-limit?customerId=123

        // Validate input
        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required as a query parameter" });
        }

        const query = 'SELECT credit_limit FROM credit_limit WHERE customer_id = ?'; // Assuming table name is 'credit_limit' and columns are 'customer_id' and 'credit_limit'
        const values = [customerId];

        const result = await executeQuery(query, values);

        if (result.length > 0) {
            // Assuming credit_limit is the first column selected
            const creditLimit = result[0].credit_limit;
            return res.status(200).json({ creditLimit: creditLimit });
        } else {
            return res.status(404).json({ message: "Credit limit not found for this customer ID" });
        }

    } catch (error) {
        console.error("Error fetching credit limit:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});



router.post('/credit-limit/deduct', async (req, res) => {
    try {
        // 1. Get customerId and amountChange from request body
        const { customerId, amountChange } = req.body; // Renamed from orderAmount to amountChange

        // 2. Validate input
        if (!customerId || !amountChange || isNaN(parseFloat(amountChange))) {
            return res.status(400).json({ message: "Customer ID and amountChange are required and amountChange must be a number." });
        }
        const amountToChange = parseFloat(amountChange); // Renamed variable

        // 3. Fetch current credit limit for the customer
        const getCreditLimitQuery = 'SELECT credit_limit FROM credit_limit WHERE customer_id = ?';
        const creditLimitValues = [customerId];
        const creditLimitResult = await executeQuery(getCreditLimitQuery, creditLimitValues);

        if (creditLimitResult.length === 0) {
            return res.status(404).json({ message: "Credit limit not found for this customer." });
        }
        let currentCreditLimit = parseFloat(creditLimitResult[0].credit_limit);

        // 4. **Apply the amount change to the credit limit (can be deduction or addition)**
        const newCreditLimit = currentCreditLimit - amountToChange; // It's still subtraction, but amountChange can be negative for credit addition

        // **Optionally, add a check for negative credit limit if needed**
        // if (newCreditLimit < 0) {
        //     newCreditLimit = 0; // Or handle based on your business logic
        // }

        const updateCreditLimitQuery = 'UPDATE credit_limit SET credit_limit = ? WHERE customer_id = ?';
        const updateCreditLimitValues = [newCreditLimit, customerId];
        await executeQuery(updateCreditLimitQuery, updateCreditLimitValues);

        // 5. Return success response
        return res.status(200).json({ message: "Credit limit updated successfully", newCreditLimit: newCreditLimit }); // Message updated

    } catch (error) {
        console.error("Error updating credit limit:", error); // Message updated
        return res.status(500).json({ message: "Internal server error while updating credit limit." }); // Message updated
    }
});


// Modified API endpoint to correctly update credit_limit.amount_due for new orders AND order updates
router.post('/credit-limit/update-amount-due-on-order', async (req, res) => {
    try {
        const { customerId, totalOrderAmount, originalOrderAmount } = req.body; // Expect originalOrderAmount for updates

        if (!customerId || totalOrderAmount === undefined || totalOrderAmount === null) {
            return res.status(400).json({ message: "Missing customerId or totalOrderAmount in request." });
        }

        // 1. Get current amount_due from credit_limit
        const getCreditLimitQuery = 'SELECT amount_due FROM credit_limit WHERE customer_id = ?';
        const creditLimitValues = [customerId];
        const creditLimitResult = await executeQuery(getCreditLimitQuery, creditLimitValues);

        let currentAmountDue = 0;
        if (creditLimitResult.length > 0 && creditLimitResult[0].amount_due !== null) {
            currentAmountDue = parseFloat(creditLimitResult[0].amount_due);
        }

        let updatedAmountDue;

        if (originalOrderAmount !== undefined && originalOrderAmount !== null) {
            // It's an order UPDATE

            const orderAmountDifference = parseFloat(totalOrderAmount) - parseFloat(originalOrderAmount);

            updatedAmountDue = currentAmountDue + orderAmountDifference; // Add the DIFFERENCE (can be negative)

            if (updatedAmountDue < 0) { // Ensure amount_due doesn't go below zero (optional - depending on your business logic)
                updatedAmountDue = 0;
            }


        } else {
            // It's a NEW order
            updatedAmountDue = currentAmountDue + parseFloat(totalOrderAmount); // Original logic for new orders (ADD)
        }


        // 3. Update amount_due in credit_limit table
        const updateCreditLimitQuery = 'UPDATE credit_limit SET amount_due = ? WHERE customer_id = ?';
        const updateCreditLimitValues = [updatedAmountDue, customerId];
        await executeQuery(updateCreditLimitQuery, updateCreditLimitValues);

        console.log(`Credit_limit.amount_due updated for customer ${customerId}. New amount_due: ${updatedAmountDue}`);

        res.status(200).json({ success: true, message: "Credit limit amount_due updated successfully.", updatedAmountDue: updatedAmountDue }); // Send back updatedAmountDue
    } catch (error) {
        console.error("Error updating credit_limit.amount_due in /credit-limit/update-amount-due-on-order:", error);
        res.status(500).json({ success: false, message: "Failed to update credit limit amount_due." });
    }
});

router.post('/collect_cash', async (req, res) => {
    try {
        let customerId = req.query.customerId || req.body.customerId;
        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required" });
        }

        const { cash } = req.body;

        // Fetch current customer data
        const fetchQuery = `
            SELECT amount_due, amount_paid_cash, credit_limit
            FROM credit_limit
            WHERE customer_id = ?`;
        const customerDataResult = await executeQuery(fetchQuery, [customerId]);

        if (customerDataResult.length === 0) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const { amount_due, amount_paid_cash = 0, credit_limit = 0 } = customerDataResult[0];
        let updatedAmountDue = amount_due;
        let newAmountPaidCash = amount_paid_cash; // Initialize here

        if (cash !== undefined && cash !== null) {
            const parsedCash = parseFloat(cash);
            if (isNaN(parsedCash) || parsedCash < 0) {
                return res.status(400).json({ message: "Invalid cash amount. Must be a non-negative number." });
            }

            newAmountPaidCash = amount_paid_cash + parsedCash;
            updatedAmountDue = Math.max(0, amount_due - parsedCash);
            const newCreditLimit = credit_limit + parsedCash;

            // **1. Insert into payment_transactions table**
            const insertTransactionQuery = `
                INSERT INTO payment_transactions (customer_id, payment_method, payment_amount, payment_date)
                VALUES (?, ?, ?, NOW())`; // NOW() gets current datetime in MySQL
            const transactionValues = [customerId, 'cash', parsedCash];
            await executeQuery(insertTransactionQuery, transactionValues);

            // **2. Update credit_limit table**
            const updateQuery = `
                UPDATE credit_limit
                SET amount_paid_cash = ?, amount_due = ?, credit_limit = ?, cash_paid_date = UNIX_TIMESTAMP()
                WHERE customer_id = ?`;
            const updateValues = [newAmountPaidCash, updatedAmountDue, newCreditLimit, customerId];
            await executeQuery(updateQuery, updateValues);

            return res.status(200).json({
                message: "Cash collected and transaction recorded successfully", // Updated message
                updatedAmountPaidCash: newAmountPaidCash,
                updatedAmountDue,
                updatedCreditLimit: newCreditLimit
            });
        }

        return res.status(200).json({ amountDue: updatedAmountDue });
    } catch (error) {
        console.error("Error processing cash collection:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});


// New API endpoint to get total amount due across all customers
router.get('/admin/total-amount-due', async (req, res) => {
    try {
        // 1. SQL query to sum amount_due from credit_limit table
        const getTotalAmountDueQuery = 'SELECT SUM(amount_due) AS totalAmountDue FROM credit_limit';

        // 2. Execute the query
        const totalAmountDueResult = await executeQuery(getTotalAmountDueQuery);

        // 3. Extract totalAmountDue from the result
        let totalAmountDue = 0;
        if (totalAmountDueResult.length > 0 && totalAmountDueResult[0].totalAmountDue !== null) {
            totalAmountDue = parseFloat(totalAmountDueResult[0].totalAmountDue);
        }

        // 4. Respond with the total amount due
        res.status(200).json({ success: true, totalAmountDue: totalAmountDue });

    } catch (error) {
        console.error("Error fetching total amount due in /admin/total-amount-due:", error);
        res.status(500).json({ success: false, message: "Failed to fetch total amount due." });
    }
});


router.get('/admin/total-amount-paid', async (req, res) => {
    try {
        // 1. SQL query to separately sum amount_paid_cash and amount_paid_online
        const getTotalAmountPaidQuery = `
            SELECT 
                SUM(amount_paid_cash) AS totalAmountPaidCash,
                SUM(amount_paid_online) AS totalAmountPaidOnline,
                SUM(amount_paid_cash + amount_paid_online) AS totalAmountPaid 
            FROM credit_limit`;

        // 2. Execute the query
        const totalAmountPaidResult = await executeQuery(getTotalAmountPaidQuery);

        // 3. Extract all amounts from the result
        let totalAmountPaidCash = 0;
        let totalAmountPaidOnline = 0;
        let totalAmountPaid = 0;

        if (totalAmountPaidResult.length > 0) {
            totalAmountPaidCash = parseFloat(totalAmountPaidResult[0].totalAmountPaidCash || 0);
            totalAmountPaidOnline = parseFloat(totalAmountPaidResult[0].totalAmountPaidOnline || 0);
            totalAmountPaid = parseFloat(totalAmountPaidResult[0].totalAmountPaid || 0);
        }

        // 4. Respond with all totals
        res.status(200).json({ 
            success: true, 
            totalAmountPaidCash,
            totalAmountPaidOnline,
            totalAmountPaid
        });

    } catch (error) {
        console.error("Error fetching total amounts paid in /admin/total-amount-paid:", error);
        res.status(500).json({ success: false, message: "Failed to fetch total amounts paid." });
    }
});



router.get('/fetch_credit_data', async (req, res) => {
    try {
        const query = 'SELECT * FROM credit_limit'; // Query to select all columns and rows
        const result = await executeQuery(query);

        if (result.length > 0) {
            // Data found in the credit_limit table
            return res.status(200).json({ creditData: result });
        } else {
            // No data found in the credit_limit table (table might be empty)
            return res.status(200).json({ creditData: [], message: "No credit limit data found in the table." });
            // Or, if you want to indicate "no data" as a 404 Not Found (less common for fetching all data, empty result is usually valid):
            // return res.status(404).json({ message: "No credit limit data found in the table." });
        }

    } catch (error) {
        console.error("Error fetching all credit limit data:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message }); // Include error details for debugging
    }
});


router.put('/update_credit_limit', async (req, res) => {
    try {
        const { customerId, creditLimit } = req.body; // Expecting customerId and creditLimit in the request body

        // Validate input
        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required in the request body" });
        }
        if (creditLimit === undefined || creditLimit === null || isNaN(Number(creditLimit))) {
            return res.status(400).json({ message: "Valid credit limit is required in the request body" });
        }

        const query = 'UPDATE credit_limit SET credit_limit = ? WHERE customer_id = ?';
        const values = [creditLimit, customerId];

        const result = await executeQuery(query, values);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: "Credit limit updated successfully" });
        } else {
            return res.status(404).json({ message: "Customer ID not found or credit limit update failed" });
        }

    } catch (error) {
        console.error("Error updating credit limit:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

router.post('/increase-credit-limit', async (req, res) => { // Use POST method as it's for performing an action
    try {
        const { customerId, amountToIncrease } = req.body; // Expecting customerId and amountToIncrease in request body

        // Validate input
        if (!customerId) {
            return res.status(400).json({ message: "Customer ID is required in the request body" });
        }
        if (amountToIncrease === undefined || amountToIncrease === null || isNaN(Number(amountToIncrease))) {
            return res.status(400).json({ message: "Valid amount to increase is required in the request body" });
        }
        if (Number(amountToIncrease) <= 0) { // Ensure amount to increase is positive
            return res.status(400).json({ message: "Amount to increase must be a positive value" });
        }

        // SQL query to increase the credit limit
        const query = 'UPDATE credit_limit SET credit_limit = credit_limit + ? WHERE customer_id = ?'; // Increment existing credit_limit
        const values = [amountToIncrease, customerId];

        const result = await executeQuery(query, values);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: "Credit limit increased successfully" });
        } else {
            return res.status(404).json({ message: "Customer ID not found or credit limit update failed (no customer or no credit_limit entry)" });
        }

    } catch (error) {
        console.error("Error increasing credit limit:", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});

//Financial reporting sections



router.get('/get_customer_transaction_details', async (req, res) => { // Keeping the same endpoint name, can be renamed
    try {
        const query = `
            SELECT
                cl.customer_id,
                cl.customer_name,
                cl.amount_due,
                SUM(pt.payment_amount) AS total_amount_paid_customer -- Calculate total paid
            FROM
                credit_limit AS cl
            LEFT JOIN  -- Use LEFT JOIN to include customers even if they have no transactions yet
                payment_transactions AS pt ON cl.customer_id = pt.customer_id
            GROUP BY
                cl.customer_id, cl.customer_name, cl.amount_due -- Group by customer to aggregate payments
            ORDER BY
                cl.customer_name; -- Order by customer name for readability
        `;

        const customerSummaryResult = await executeQuery(query, []); // No values needed

        // Format the results for better presentation
        const formattedCustomerSummaries = customerSummaryResult.map(customerSummary => ({
            customer_id: customerSummary.customer_id,
            customer_name: customerSummary.customer_name,
            amount_due: parseFloat(customerSummary.amount_due).toFixed(2),
            total_amount_paid: parseFloat(customerSummary.total_amount_paid_customer || 0).toFixed(2), // Format total paid, handle NULL if no payments yet
        }));

        if (formattedCustomerSummaries.length === 0) {
            return res.status(404).json({ message: "No customers found" }); // Updated message
        }

        res.status(200).json(formattedCustomerSummaries); // Send array of customer summary objects

    } catch (error) {
        console.error("Error fetching cumulative customer payment summaries:", error); // Updated error message
        res.status(500).json({ message: "Failed to fetch cumulative customer payment summaries" }); // Updated error message
    }
});



router.get('/get_customer_credit_summaries', async (req, res) => { // Renamed endpoint to be more descriptive
    try {
        const query = `
            SELECT
                customer_id,
                customer_name,
                credit_limit,
                amount_due,
                amount_paid_cash,
                amount_paid_online
            FROM
                credit_limit
            ORDER BY
                customer_name; -- Order by customer name for readability
        `;

        const customerCreditSummaryResult = await executeQuery(query, []); // No values needed

        // Format the results for better presentation
        const formattedCustomerCreditSummaries = customerCreditSummaryResult.map(customerCredit => {
            const totalAmountPaid = parseFloat(customerCredit.amount_paid_cash || 0) + parseFloat(customerCredit.amount_paid_online || 0); // Calculate total paid

            return {
                customer_id: customerCredit.customer_id,
                customer_name: customerCredit.customer_name,
                credit_limit: parseFloat(customerCredit.credit_limit).toFixed(2),
                amount_due: parseFloat(customerCredit.amount_due).toFixed(2),
                total_amount_paid: totalAmountPaid.toFixed(2), // New field: Total Paid (cash + online)
            };
        });

        if (formattedCustomerCreditSummaries.length === 0) {
            return res.status(404).json({ message: "No customers found" }); // Message updated
        }

        res.status(200).json(formattedCustomerCreditSummaries); // Send array of customer credit summary objects

    } catch (error) {
        console.error("Error fetching customer credit summaries:", error); // Error message updated
        res.status(500).json({ message: "Failed to fetch customer credit summaries" }); // Error message updated
    }
});

router.post("/on-behalf-2", async (req, res) => {
    try {
        const { customer_id, order_type, products } = req.body;

        if (!customer_id || !order_type || !Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                message: "customer_id, order_type, and products[] are required"
            });
        }

        if (order_type !== 'AM' && order_type !== 'PM') {
            return res.status(400).json({ message: "Invalid order_type. Must be 'AM' or 'PM'." });
        }

        // 1. Create the order
        const insertOrderQuery = `
            INSERT INTO orders (customer_id, total_amount, order_type, placed_on, created_at, updated_at)
            VALUES (?, 0.0, ?, UNIX_TIMESTAMP(), UNIX_TIMESTAMP(), UNIX_TIMESTAMP())
        `;
        const orderValues = [customer_id, order_type];
        const insertOrderResult = await executeQuery(insertOrderQuery, orderValues);
        const newOrderId = insertOrderResult.insertId;

        if (!newOrderId) {
            return res.status(500).json({ message: "Failed to create new order." });
        }

        // 2. Insert products
        const productValues = products.map(p => [
            newOrderId,
            p.product_id,
            p.quantity,
            p.price,
            p.name || '',
            p.category || '',
            p.gst_rate || 0
        ]);
        if (!productValues.length) {
            return res.status(400).json({ message: "No products to insert." });
        }
        console.log('Inserting products:', productValues);

        // Build placeholders for each product
        const placeholders = productValues.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
        // Flatten the productValues array
        const flattenedValues = productValues.flat();

        const insertProductQuery = `
            INSERT INTO order_products (order_id, product_id, quantity, price, name, category, gst_rate)
            VALUES ${placeholders}
        `;

        await executeQuery(insertProductQuery, flattenedValues);

        // 3. Update total_amount
        const updateOrderTotalQuery = `
            UPDATE orders
            SET total_amount = (
                SELECT COALESCE(SUM(quantity * price), 0)
                FROM order_products
                WHERE order_id = ?
            )
            WHERE id = ?
        `;
        await executeQuery(updateOrderTotalQuery, [newOrderId, newOrderId]);

        return res.status(201).json({
            message: "Admin custom order placed successfully.",
            new_order_id: newOrderId,
            product_count: products.length
        });

    } catch (error) {
        console.error("Error placing admin custom order:", error);
        return res.status(500).json({
            message: "Internal server error",
            error: error.message
        });
    }
});
module.exports = router;

