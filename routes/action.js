const express = require("express");
const router = express.Router();
const session = require('express-session');
const { executeQuery } = require("../dbUtils/db");
const fs = require('fs');
const moment = require("moment-timezone"); 
const bcrypt = require('bcrypt');
const path = require("path");
const multer = require('multer');


// Configure Multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads', 'products');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

// File filter to allow only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  }
  cb(new Error('Only images are allowed (jpeg, jpg, png, gif)'));
};

// Initialize Multer
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Upload product image endpoint
router.post('/upload/product-image/:productId', upload.single('image'), async (req, res) => {
  try {
    const { productId } = req.params;

    // Validate input
    if (!req.file) {
      return res.status(400).json({ message: 'Image file is required' });
    }

    // Get the filename
    const filename = req.file.filename;

    // Update query to save image filename
    const query = 'UPDATE products SET image = ? WHERE id = ?';
    const values = [filename, productId];

    // Execute the query
    const result = await executeQuery(query, values);

    // Check if product exists
    if (result.affectedRows > 0) {
      // Construct the URL for the uploaded image
      const imageUrl = `/images/products/${filename}`;
      return res.status(200).json({
        message: 'Image uploaded successfully',
        imageUrl,
        filename,
      });
    } else {
      // Delete the uploaded file if product not found
      await fs.promises.unlink(req.file.path);
      return res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    console.error('Error uploading product image:', error);
    // Clean up uploaded file on error
    if (req.file) {
      await fs.promises.unlink(req.file.path).catch((err) => console.error('Error deleting file:', err));
    }
    return res.status(500).json({ message: 'Internal server error' });
  }
});



async function updateExistingPasswords() {
    try {
        const users = await executeQuery("SELECT id, customer_id FROM users");

        for (const user of users) {
            const userId = user.id;
            const customerId = user.customer_id.toString(); // Ensure it's a string

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(customerId, salt);

            await executeQuery("UPDATE users SET password = ?, updated_at = UNIX_TIMESTAMP() WHERE id = ?", [hashedPassword, userId]);

            console.log(`Updated password for user ID: ${userId}`);
        }

        console.log('Successfully updated passwords for all users.');
        return { status: true, message: 'Successfully updated passwords for all users.' };
    } catch (error) {
        console.error('Error updating passwords:', error);
        return { status: false, message: 'Error updating passwords.', error: error.message };
    }
}

// API endpoint to trigger password update
router.post("/update-all-passwords-to-customer-id", async (req, res) => {
    try {
        const result = await updateExistingPasswords();
        if (result.status) {
            return res.status(200).json({ message: result.message });
        } else {
            return res.status(500).json({ message: result.message, error: result.error });
        }
    } catch (error) {
        console.error("Error in password update endpoint:", error);
        return res.status(500).json({ message: "Internal server error during password update." });
    }
});

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

        if (!["pending", "delivered","out for delivery","processing"].includes(delivery_status.toLowerCase())) {
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

        // --- Insert new order_product record ---
        const insertQuery = `
            INSERT INTO order_products (order_id, product_id, quantity, price, name, category, gst_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const insertResult = await executeQuery(insertQuery, [orderId, productId, quantity, price, name, category, finalGstRate]);

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

        // Validate order_type is exactly 'AM' or 'PM'
        if (order_type !== 'AM' && order_type !== 'PM') {
            return res.status(400).json({ message: "Invalid order_type. Must be 'AM' or 'PM'." });
        }

        // 0. Check if an order already exists for the customer and order_type today
        const checkExistingOrderQuery = `
            SELECT id
            FROM orders
            WHERE customer_id = ?
            AND order_type = ?
            AND DATE(FROM_UNIXTIME(placed_on)) = CURDATE()
            LIMIT 1
        `;
        const existingOrderResult = await executeQuery(checkExistingOrderQuery, [customer_id, order_type]);

        if (existingOrderResult && existingOrderResult.length > 0) {
            return res.status(400).json({
                message: `Order already placed for ${order_type} today.`
            });
        }

        // 1. Check if auto order is enabled for the user and order type
        const checkAutoOrderQuery = `
            SELECT auto_am_order, auto_pm_order
            FROM users
            WHERE customer_id = ?
        `;
        const userCheckResult = await executeQuery(checkAutoOrderQuery, [customer_id]);

        if (!userCheckResult || userCheckResult.length === 0) {
            return res.status(404).json({ message: "Customer not found." });
        }

        const user = userCheckResult[0];

        if (order_type === 'AM') {
            if (user.auto_am_order && user.auto_am_order.toLowerCase() === 'yes') {
                // Proceed
            } else {
                return res.status(400).json({ message: "Automatic AM order placement is disabled for this customer." });
            }
        } else if (order_type === 'PM') {
            if (user.auto_pm_order && user.auto_pm_order.toLowerCase() === 'yes') {
                // Proceed
            } else {
                return res.status(400).json({ message: "Automatic PM order placement is disabled for this customer." });
            }
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
            AND LOWER(category) NOT LIKE '%others%'
            AND LOWER(category) NOT LIKE '%paneer%'
            AND LOWER(category) NOT LIKE '%ghee%'
            AND LOWER(category) NOT LIKE '%butter%'
            AND LOWER(category) NOT LIKE '%butter milk%'
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
            AND LOWER(category) NOT LIKE '%others%'
            AND LOWER(category) NOT LIKE '%paneer%'
            AND LOWER(category) NOT LIKE '%ghee%'
            AND LOWER(category) NOT LIKE '%butter%'
            AND LOWER(category) NOT LIKE '%butter milk%'
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



//update online payments


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
            return res.status(400).json({ message: "customer_id is required.", success: false });
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

router.get('/images/products/:filename', (req, res) => {
    const filename = req.params.filename;
    const imagePath = path.join(__dirname, '..', 'uploads', 'products', filename);
  
    res.sendFile(imagePath, (err) => {
      if (err) {
        console.error('Error sending image:', err);
        res.status(404).send('Image not found');
      }
    });
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
                let readQuery = "SELECT id, name FROM brands";
                let readParams = [];

                if (id) {
                    readQuery += " WHERE id = ?";
                    readParams.push(id);
                }

                readQuery += " ORDER BY name";
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

                // Delete brand
                const deleteQuery = "DELETE FROM brands WHERE id = ?";
                const deleteResult = await executeQuery(deleteQuery, [id]);

                if (deleteResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Brand not found"
                    });
                }

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

                // Delete category
                const deleteQuery = "DELETE FROM categories WHERE id = ?";
                const deleteResult = await executeQuery(deleteQuery, [id]);

                if (deleteResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Category not found"
                    });
                }

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

                // Delete unit of measure
                const deleteQuery = "DELETE FROM units_of_measure WHERE id = ?";
                const deleteResult = await executeQuery(deleteQuery, [id]);

                if (deleteResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Unit of measure not found"
                    });
                }

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

                readQuery += " ORDER BY name";
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

                // Check for duplicate route name in both tables (excluding current route)
                const checkUpdateQuery = `
                    SELECT 1 FROM routes WHERE name = ? AND id != ?
                    UNION
                    SELECT 1 FROM users WHERE route = ?
                `;
                const existingUpdateRoute = await executeQuery(checkUpdateQuery, [name, id, name]);
                
                if (existingUpdateRoute.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Route with this name already exists in either routes table or users table"
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

                // Check if route is being used in users table
                const checkUsageQuery = "SELECT 1 FROM users WHERE route = (SELECT name FROM routes WHERE id = ?)";
                const routeUsage = await executeQuery(checkUsageQuery, [id]);

                if (routeUsage.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot delete route as it is being used by one or more users"
                    });
                }

                // Delete route
                const deleteQuery = "DELETE FROM routes WHERE id = ?";
                const deleteResult = await executeQuery(deleteQuery, [id]);

                if (deleteResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Route not found"
                    });
                }

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

                // Check for duplicate stock group name
                const checkQuery = "SELECT DISTINCT stock_group FROM products WHERE stock_group = ?";
                const existingStockGroup = await executeQuery(checkQuery, [name]);
                
                if (existingStockGroup.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Stock group with this name already exists"
                    });
                }

                // Insert new stock group by updating a product
                const insertQuery = "INSERT INTO products (stock_group) VALUES (?)";
                const insertResult = await executeQuery(insertQuery, [name]);

                return res.status(200).json({
                    success: true,
                    message: "Stock group created successfully",
                    stockGroupId: insertResult.insertId
                });

            case 'read':
                // Read all unique stock groups
                let readQuery = "SELECT DISTINCT stock_group as name FROM products WHERE stock_group IS NOT NULL";
                let readParams = [];

                if (id) {
                    readQuery += " AND id = ?";
                    readParams.push(id);
                }

                readQuery += " ORDER BY stock_group";
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
                const updateQuery = "UPDATE products SET stock_group = ? WHERE id = ?";
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

                // Check if stock group is being used by other products
                const checkUsageQuery = "SELECT COUNT(*) as count FROM products WHERE stock_group = (SELECT stock_group FROM products WHERE id = ?)";
                const stockGroupUsage = await executeQuery(checkUsageQuery, [id]);

                if (stockGroupUsage[0].count > 1) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot delete stock group as it is being used by other products"
                    });
                }

                // Delete stock group by setting it to NULL
                const deleteQuery = "UPDATE products SET stock_group = NULL WHERE id = ?";
                const deleteResult = await executeQuery(deleteQuery, [id]);

                if (deleteResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Stock group not found"
                    });
                }

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





