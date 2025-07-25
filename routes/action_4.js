const express = require("express");
const router = express.Router();
const { executeQuery } = require("../dbUtils/db");
const bcrypt = require('bcrypt');

// API to show all tables from oms1 database
router.get("/show-tables", async (req, res) => {
    try {
        const query = "SHOW TABLES FROM oms1";
        const tables = await executeQuery(query);
        
        return res.status(200).json({
            success: true,
            message: "Tables fetched successfully",
            data: tables
        });
    } catch (error) {
        console.error("Error fetching tables:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// API to empty tables in oms1 database (either selected tables or all tables)
router.post("/empty-tables", async (req, res) => {
    try {
        const { tables } = req.body;
        let tablesToEmpty = [];

        // If tables array is provided, use those tables
        if (tables && Array.isArray(tables) && tables.length > 0) {
            // Get all existing tables to validate
            const existingTables = await executeQuery("SHOW TABLES FROM oms1");
            const existingTableNames = existingTables.map(table => Object.values(table)[0]);

            // Validate that all requested tables exist
            const invalidTables = tables.filter(table => !existingTableNames.includes(table));
            if (invalidTables.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Some tables do not exist",
                    invalidTables: invalidTables
                });
            }
            tablesToEmpty = tables;
        } else {
            // If no tables specified, get all tables
            const allTables = await executeQuery("SHOW TABLES FROM oms1");
            tablesToEmpty = allTables.map(table => Object.values(table)[0]);
        }
        
        // Disable foreign key checks temporarily
        await executeQuery("SET FOREIGN_KEY_CHECKS = 0");
        
        // Empty each table
        for (const tableName of tablesToEmpty) {
            if (tableName === 'users') {
                // For users table, only delete non-superadmin users
                await executeQuery(`DELETE FROM oms1.users WHERE role != 'superadmin'`);
            } else {
                // For all other tables, use TRUNCATE
                await executeQuery(`TRUNCATE TABLE oms1.${tableName}`);
            }
        }
        
        // Re-enable foreign key checks
        await executeQuery("SET FOREIGN_KEY_CHECKS = 1");
        
        return res.status(200).json({
            success: true,
            message: tables ? "Selected tables have been emptied successfully" : "All tables have been emptied successfully",
            emptiedTables: tablesToEmpty,
            note: "Superadmin users were preserved in the users table"
        });
    } catch (error) {
        console.error("Error emptying tables:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// API to get price_mode for a user by customer_id
router.get('/user_price_mode', async (req, res) => {
    try {
        const { customer_id } = req.query;
        if (!customer_id) {
            return res.status(400).json({
                success: false,
                message: 'customer_id is required as a query parameter'
            });
        }
        const query = 'SELECT price_mode FROM users WHERE customer_id = ?';
        const result = await executeQuery(query, [customer_id]);
        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found for the given customer_id'
            });
        }
        return res.status(200).json({
            success: true,
            customer_id,
            price_mode: result[0].price_mode
        });
    } catch (error) {
        console.error('Error fetching user price_mode:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// API to update price for a product in order_products table
router.post('/product_edit_user', async (req, res) => {
    try {
        const { order_id, product_id, price } = req.body;
        if (!order_id || !product_id || price === undefined) {
            return res.status(400).json({
                success: false,
                message: 'order_id, product_id, and price are required in the request body'
            });
        }
        const updateQuery = 'UPDATE order_products SET price = ? WHERE order_id = ? AND product_id = ?';
        const result = await executeQuery(updateQuery, [price, order_id, product_id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'No matching order product found to update'
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Product price updated successfully',
            order_id,
            product_id,
            price
        });
    } catch (error) {
        console.error('Error updating product price in order_products:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// API to get allow_product_edit for a user by customer_id
router.get('/get-allow-product-edit', async (req, res) => {
    try {
        const { customer_id } = req.query;
        if (!customer_id) {
            return res.status(400).json({
                success: false,
                message: 'customer_id is required as a query parameter'
            });
        }
        const query = 'SELECT allow_product_edit FROM users WHERE customer_id = ?';
        const result = await executeQuery(query, [customer_id]);
        if (result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found for the given customer_id'
            });
        }
        return res.status(200).json({
            success: true,
            customer_id,
            allow_product_edit: result[0].allow_product_edit
        });
    } catch (error) {
        console.error('Error fetching allow_product_edit:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// API to delete a customer by customer_id, only if no orders exist for that customer
router.delete('/delete_customer', async (req, res) => {
    try {
        const { customer_id } = req.body;
        if (!customer_id) {
            return res.status(400).json({
                success: false,
                message: 'customer_id is required in the request body'
            });
        }
        // Check if any orders exist for this customer_id
        const orderCheck = await executeQuery('SELECT 1 FROM orders WHERE customer_id = ? LIMIT 1', [customer_id]);
        if (orderCheck.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete customer: orders exist for this customer_id'
            });
        }
        // Delete the user
        const deleteResult = await executeQuery('DELETE FROM users WHERE customer_id = ?', [customer_id]);
        if (deleteResult.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'No user found with the given customer_id'
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Customer deleted successfully',
            customer_id
        });
    } catch (error) {
        console.error('Error deleting customer:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});



// API to delete a customer by customer_id, only if no orders exist for that customer
router.delete('/delete_user', async (req, res) => {
    try {
        const { customer_id } = req.body;
        if (!customer_id) {
            return res.status(400).json({
                success: false,
                message: 'customer_id is required in the request body'
            });
        }
        // Check if any orders exist for this customer_id
        const orderCheck = await executeQuery('SELECT 1 FROM orders WHERE customer_id = ? LIMIT 1', [customer_id]);
        if (orderCheck.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete customer: orders exist for this customer_id'
            });
        }
        // Delete the user
        const deleteResult = await executeQuery('DELETE FROM users WHERE customer_id = ?', [customer_id]);
        if (deleteResult.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'No user found with the given customer_id'
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Customer deleted successfully',
            customer_id
        });
    } catch (error) {
        console.error('Error deleting customer:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// API to change password on behalf of a user
router.post('/on_behalf_pwd_change', async (req, res) => {
    try {
        const { customer_id, password } = req.body;
        if (!customer_id || !password) {
            return res.status(400).json({
                success: false,
                message: 'customer_id and password are required in the request body'
            });
        }
        // Hash the password with salt 10
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        // Update the user's password
        const updateQuery = 'UPDATE users SET password = ?, updated_at = UNIX_TIMESTAMP() WHERE customer_id = ?';
        const result = await executeQuery(updateQuery, [hashedPassword, customer_id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'No user found with the given customer_id'
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Password updated successfully',
            customer_id
        });
    } catch (error) {
        console.error('Error updating password:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});


// In your products controller (Node.js/Express example)
router.get('/products/check-unique', async (req, res) => {
    const { field, value, id } = req.query;
    if (!['alias', 'name', 'part_number'].includes(field) || !value) {
      return res.status(400).json({ isDuplicate: false, error: 'Invalid parameters' });
    }
    try {
      let query, params;
      if (field === 'name') {
        query = 'SELECT 1 FROM products WHERE LOWER(name) = LOWER(?)';
        params = [value];
      } else {
        query = `SELECT 1 FROM products WHERE ${field} = ?`;
        params = [value];
      }
      if (id) {
        query += ' AND id != ?';
        params.push(id);
      }
      const result = await executeQuery(query, params);
      res.json({ isDuplicate: result.length > 0 });
    } catch (err) {
      res.status(500).json({ isDuplicate: false, error: 'Server error' });
    }
  });

  
module.exports = router; 