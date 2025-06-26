const express = require("express");
const router = express.Router();
const { executeQuery } = require("../dbUtils/db");
const fs = require('fs');
const bcrypt = require('bcrypt');
const path = require("path");
const multer = require('multer');
const adminService = require("../services/adminService");


// Configure Multer for product images (LEAVE THIS UNTOUCHED)
const productStorage = multer.diskStorage({
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

// Initialize Multer for product images (LEAVE THIS UNTOUCHED)
const uploadProduct = multer({
  storage: productStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// SEPARATE CONFIGURATION FOR SALESMAN IMAGES
const salesmanStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads', 'salesman');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

// Initialize Multer for salesman images
const uploadSalesman = multer({
  storage: salesmanStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// SEPARATE CONFIGURATION FOR BRAND IMAGES
const brandStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads', 'brands');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

// Initialize Multer for brand images
const uploadBrand = multer({
  storage: brandStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Configure Multer for advertisement images
const advertisementStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads', 'adv');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${extension}`);
  },
});

// Initialize Multer for advertisement images
const uploadAdvertisement = multer({
  storage: advertisementStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Product image upload endpoint (LEAVE THIS UNTOUCHED)
router.post('/upload/product-image/:productId', uploadProduct.single('image'), async (req, res) => {
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

// SEPARATE SALESMAN IMAGE ENDPOINTS
router.post('/upload/salesman-image/:customerId', uploadSalesman.single('image'), async (req, res) => {
    try {
        const { customerId } = req.params;

        // Validate input
        if (!req.file) {
            return res.status(400).json({ 
                status: false,
                message: 'Image file is required' 
            });
        }

        // First, get the old image filename if it exists
        const getOldImageQuery = 'SELECT image FROM users WHERE customer_id = ? AND role = ?';
        const oldImageResult = await executeQuery(getOldImageQuery, [customerId, 'admin']);
        
        // If there's an old image, delete it if it's different from the new one
        if (oldImageResult.length > 0 && oldImageResult[0].image && oldImageResult[0].image !== req.file.filename) {
            const oldImagePath = path.join(__dirname, '..', 'uploads', 'salesman', oldImageResult[0].image);
            try {
                if (fs.existsSync(oldImagePath)) {
                    await fs.promises.unlink(oldImagePath);
                }
            } catch (deleteError) {
                // Ignore error, continue
            }
        }

        // Get the new filename
        const filename = req.file.filename;

        // Update query to save new image filename
        const updateQuery = 'UPDATE users SET image = ? WHERE customer_id = ? AND role = ?';
        const updateValues = [filename, customerId, 'admin'];

        // Execute the query
        const result = await executeQuery(updateQuery, updateValues);

        // Check if salesman exists
        if (result.affectedRows > 0) {
            // Construct the URL for the uploaded image
            const imageUrl = `/images/salesman/${filename}`;
            return res.status(200).json({
                status: true,
                message: 'Salesman image uploaded successfully',
                data: {
                    imageUrl,
                    filename
                }
            });
        } else {
            // Delete the new uploaded file if salesman not found
            await fs.promises.unlink(req.file.path);
            return res.status(404).json({ 
                status: false,
                message: 'Salesman not found' 
            });
        }
    } catch (error) {
        console.error('Error uploading salesman image:', error);
        // Clean up uploaded file on error
        if (req.file) {
            await fs.promises.unlink(req.file.path).catch((err) => console.error('Error deleting file:', err));
        }
        return res.status(500).json({ 
            status: false,
            message: 'Internal server error',
            error: error.message 
        });
    }
});

// Get salesman image endpoint
router.get('/images/salesman/:filename', (req, res) => {
    const filename = req.params.filename;
    const imagePath = path.join(__dirname, '..', 'uploads', 'salesman', filename);

    res.sendFile(imagePath, (err) => {
        if (err) {
            console.error('Error sending image:', err);
            res.status(404).send('Image not found');
        }
    });
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

router.get('/images/brands/:filename', (req, res) => {
    const filename = req.params.filename;
    const imagePath = path.join(__dirname, '..', 'uploads', 'brands', filename);

    // Check if file exists before sending
    if (!fs.existsSync(imagePath)) {
        return res.status(404).json({
            status: false,
            message: 'Brand image not found'
        });
    }

    // Set content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    const contentType = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif'
    }[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
  res.sendFile(imagePath, (err) => {
    if (err) {
            console.error('Error sending brand image:', err);
            res.status(500).json({
                status: false,
                message: 'Error sending image file'
            });
    }
  });
});


// Salesman Management Routes
router.post("/add-salesman", async (req, res) => {
  try {
        // Convert comma-separated routes to JSON array before passing to service
        if (req.body.route) {
            const routes = req.body.route.split(',').map(r => r.trim());
            req.body.route = JSON.stringify(routes);
        }

    const result = await adminService.addSalesmanService(req.body);
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("Error in add-salesman route:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to add salesman: " + error.message
    });
  }
});



// Get all admin users (sales managers)
router.get("/salesman-fetch", async (req, res) => {
    try {
        // Query to fetch all users with role 'ADMIN'
        const query = `
            SELECT * 
            FROM users 
            WHERE role = 'ADMIN'
            ORDER BY name ASC
        `;

        const adminUsers = await executeQuery(query);

        if (adminUsers.length === 0) {
            return res.status(200).json({
                status: true,
                message: "No admin users found",
                data: []
            });
        }

        return res.status(200).json({
            status: true,
            message: "Admin users fetched successfully",
            data: adminUsers
        });

    } catch (error) {
        console.error("Error fetching admin users:", error);
        return res.status(500).json({
            status: false,
            message: "Failed to fetch admin users: " + error.message
        });
    }
});


router.get("/block-status/:customer_id", async (req, res) => {
    try {
        const { customer_id } = req.params;

        if (!customer_id) {
            return res.status(400).json({
                status: false,
                message: "Customer ID is required"
            });
        }

        // Read operation
        const readQuery = "SELECT customer_id, name, status FROM users WHERE customer_id = ?";
        const [user] = await executeQuery(readQuery, [customer_id]);

        if (!user) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            status: true,
            message: "User status retrieved successfully",
            data: {
                customer_id: user.customer_id,
                name: user.name,
                status: user.status || 'active'
            }
        });

    } catch (error) {
        console.error("Error in get user status:", error);
        return res.status(500).json({
            status: false,
            message: "Operation failed: " + error.message
        });
    }
});

// POST endpoint to update user status
router.post("/update-block-status", async (req, res) => {
    try {
        const { customer_id, status } = req.body;

        // Validate required fields
        if (!customer_id) {
            return res.status(400).json({
                status: false,
                message: "Customer ID is required"
            });
        }

        if (!status) {
            return res.status(400).json({
                status: false,
                message: "Status is required"
            });
        }

        // Validate status value
        if (status !== 'active' && status !== 'blocked') {
            return res.status(400).json({
                status: false,
                message: "Status must be either 'active' or 'blocked'"
            });
        }

        // Check if user exists
        const checkQuery = "SELECT customer_id FROM users WHERE customer_id = ?";
        const [existingUser] = await executeQuery(checkQuery, [customer_id]);

        if (!existingUser) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        // Update user status
        const updateQuery = "UPDATE users SET status = ?, updated_at = UNIX_TIMESTAMP() WHERE customer_id = ?";
        const result = await executeQuery(updateQuery, [status, customer_id]);

        if (result.affectedRows === 0) {
            return res.status(500).json({
                status: false,
                message: "Failed to update user status"
            });
        }

        return res.status(200).json({
            status: true,
            message: `User status updated successfully to ${status}`,
            data: {
                customer_id,
                status
            }
        });

    } catch (error) {
        console.error("Error in update user status:", error);
        return res.status(500).json({
            status: false,
            message: "Operation failed: " + error.message
        });
    }
});

// Create new salesman
router.post("/salesman-create", async (req, res) => {
    try {
        // Only username and customer_id are mandatory
        const requiredFields = ['customer_id', 'username', 'sub_role'];
        
        for (const field of requiredFields) {
            if (!req.body[field]) {
                return res.status(400).json({
                    success: false,
                    message: `${field} is required`
                });
            }
        }

        // Check if salesman already exists
        const existingSalesman = await executeQuery(
            "SELECT * FROM users WHERE customer_id = ?",
            [req.body.customer_id]
        );

        if (existingSalesman.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Salesman already exists"
            });
        }

        // Hash the phone number as password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.phone || req.body.customer_id, salt);

        // Store route as comma-separated string (not JSON)
        let routeString = null;
        if (req.body.route) {
            if (Array.isArray(req.body.route)) {
                routeString = req.body.route.join(",");
            } else {
                routeString = req.body.route;
            }
        }

        // Insert new salesman
        const query = `
            INSERT INTO users (
                customer_id, 
                username, 
                name, 
                phone,
                address_line1,
                designation,
                route,
                aadhar_number,
                pan_number,
                dl_number,
                notes,
                role,
                sub_role,
                password,
                created_at, 
                updated_at,
                allow_product_edit
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?, UNIX_TIMESTAMP(), UNIX_TIMESTAMP(), ?)
        `;

        const values = [
            req.body.customer_id,
            req.body.username,
            req.body.username, // Copy username to name field
            req.body.phone || null,
            req.body.address_line1 || null,
            req.body.designation || null,
            routeString,
            req.body.aadhar_number || null,
            req.body.pan_number || null,
            req.body.dl_number || null,
            req.body.notes || null,
            req.body.sub_role,
            hashedPassword,
            req.body.allow_product_edit || null
        ];

        await executeQuery(query, values);

        // Fetch the salesman's id from users table
        const salesmanRow = await executeQuery("SELECT id FROM users WHERE customer_id = ? AND role = 'admin'", [req.body.customer_id]);
        if (!salesmanRow.length) {
            return res.status(500).json({ success: false, message: "Failed to fetch salesman id after creation" });
        }
        const salesmanId = salesmanRow[0].id;

        // Assign users for each route
        if (routeString) {
            const routes = routeString.split(',').map(r => r.trim());
            for (const route of routes) {
            const findUsersQuery = `
                SELECT customer_id FROM users 
                WHERE route = ? AND role != 'admin'
            `;
                const usersResult = await executeQuery(findUsersQuery, [route]);
            if (usersResult.length > 0) {
                const insertAssignmentQuery = `
                    INSERT INTO admin_assign (admin_id, customer_id, cust_id, assigned_date, status, route)
                    VALUES (?, ?, ?, NOW(), 'assigned', ?)
                `;
                for (const user of usersResult) {
                        // Check for existing assignment
                        const checkAssignmentQuery = `
                            SELECT 1 FROM admin_assign
                            WHERE admin_id = ? AND customer_id = ? AND route = ?
                        `;
                        const exists = await executeQuery(checkAssignmentQuery, [
                            salesmanId,
                            user.customer_id,
                            route
                        ]);
                        if (exists.length === 0) {
                    await executeQuery(insertAssignmentQuery, [
                                salesmanId,
                        user.customer_id,
                        user.customer_id,
                                route
                    ]);
                        }
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: "Salesman created successfully",
            data: { id: salesmanId }
        });
    } catch (error) {
        console.error("Error creating salesman:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Update salesman data
router.post("/salesman-update", async (req, res) => {
    try {
        const { customer_id, sub_role, ...updateData } = req.body;

        if (!customer_id) {
            return res.status(400).json({
                success: false,
                message: "Customer ID is required"
            });
        }
        if (!sub_role) {
            return res.status(400).json({
                success: false,
                message: "sub_role is required"
            });
        }
        updateData.sub_role = sub_role;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No fields to update"
            });
        }

        // Store route as comma-separated string (not JSON)
        let routeString = undefined;
        if (updateData.route) {
            if (Array.isArray(updateData.route)) {
                routeString = updateData.route.join(",");
            } else {
                routeString = updateData.route;
            }
            updateData.route = routeString;
        }

        // Check if salesman exists
        const existingSalesman = await executeQuery(
            "SELECT * FROM users WHERE customer_id = ? AND role = 'admin'",
            [customer_id]
        );

        if (existingSalesman.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Salesman not found"
            });
        }

        // Build update query dynamically based on provided fields
        let updateFields = [];
        let values = [];

        // List of fields that can be updated
        const allowedFields = [
            'username',
            'name',
            'phone',
            'address_line1',
            'designation',
            'route',
            'aadhar_number',
            'pan_number',
            'dl_number',
            'notes',
            'sub_role',
            'allow_product_edit'
        ];

        // Add fields to update if they are provided
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                values.push(updateData[field]);
            }
        });

        // Add updated_at timestamp
        updateFields.push('updated_at = UNIX_TIMESTAMP()');

        // Add customer_id to values array for WHERE clause
        values.push(customer_id);

        const query = `
            UPDATE users 
            SET ${updateFields.join(', ')}
            WHERE customer_id = ? AND role = 'admin'
        `;

        if ((await executeQuery(query, values)).affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Salesman not found or no changes made"
            });
        }

        // Fetch the salesman's id from users table
        const salesmanRow = await executeQuery("SELECT id FROM users WHERE customer_id = ? AND role = 'admin'", [customer_id]);
        if (!salesmanRow.length) {
            return res.status(500).json({ success: false, message: "Failed to fetch salesman id after update" });
        }
        const salesmanId = salesmanRow[0].id;

        // Assign users for each route
        if (routeString !== undefined) {
            const routes = routeString.split(',').map(r => r.trim());

            // 1. Delete assignments for this salesman that are NOT in the new routes
            if (routes.length > 0) {
                const deleteQuery = `
                    DELETE FROM admin_assign
                    WHERE admin_id = ? AND route NOT IN (${routes.map(() => '?').join(',')})
                `;
                await executeQuery(deleteQuery, [salesmanId, ...routes]);
            } else {
                // If no routes, remove all assignments for this salesman
                await executeQuery('DELETE FROM admin_assign WHERE admin_id = ?', [salesmanId]);
            }

            // Now assign users for each route (avoiding duplicates)
            for (const route of routes) {
            const findUsersQuery = `
                SELECT customer_id FROM users 
                WHERE route = ? AND role != 'admin'
            `;
                const usersResult = await executeQuery(findUsersQuery, [route]);
            if (usersResult.length > 0) {
                const insertAssignmentQuery = `
                    INSERT INTO admin_assign (admin_id, customer_id, cust_id, assigned_date, status, route)
                    VALUES (?, ?, ?, NOW(), 'assigned', ?)
                `;
                for (const user of usersResult) {
                        // Check for existing assignment
                        const checkAssignmentQuery = `
                            SELECT 1 FROM admin_assign
                            WHERE admin_id = ? AND customer_id = ? AND route = ?
                        `;
                        const exists = await executeQuery(checkAssignmentQuery, [
                            salesmanId,
                            user.customer_id,
                            route
                        ]);
                        if (exists.length === 0) {
                    await executeQuery(insertAssignmentQuery, [
                                salesmanId,
                        user.customer_id,
                        user.customer_id,
                                route
                    ]);
                        }
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: "Salesman updated successfully"
        });
    } catch (error) {
        console.error("Error updating salesman:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// Read salesman data
router.get("/salesman-read", async (req, res) => {
    try {
        const { customer_id } = req.query;
        
        let readQuery = `
            SELECT *
            FROM users
            WHERE role = 'admin'
        `;
        let readParams = [];

        if (customer_id) {
            readQuery += " AND customer_id = ?";
            readParams.push(customer_id);
        }

        readQuery += " ORDER BY username ASC";
        const salesmen = await executeQuery(readQuery, readParams);

        if (customer_id && salesmen.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Salesman not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Salesman data fetched successfully",
            data: customer_id ? salesmen[0] : salesmen
        });
    } catch (error) {
        console.error("Error reading salesman data:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});

// POST /update-user-location
router.post("/update-user-location", async (req, res) => {
    try {
        const { customer_id, latitude, longitude } = req.body;

        // Validate required fields
        if (!customer_id) {
            return res.status(400).json({ 
                success: false, 
                message: "Customer ID is required" 
            });
        }

        if (latitude === undefined || longitude === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: "Both latitude and longitude are required" 
            });
        }

        // Validate latitude and longitude are valid numbers
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({ 
                success: false, 
                message: "Latitude and longitude must be valid numbers" 
            });
        }

        // Validate latitude range (-90 to 90)
        if (lat < -90 || lat > 90) {
            return res.status(400).json({ 
                success: false, 
                message: "Latitude must be between -90 and 90 degrees" 
            });
        }

        // Validate longitude range (-180 to 180)
        if (lng < -180 || lng > 180) {
            return res.status(400).json({ 
                success: false, 
                message: "Longitude must be between -180 and 180 degrees" 
            });
        }

        // Check if user exists
        const checkUserQuery = "SELECT customer_id FROM users WHERE customer_id = ?";
        const userExists = await executeQuery(checkUserQuery, [customer_id]);

        if (userExists.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Update location
        const updateLocationQuery = `
            UPDATE users 
            SET latitude = ?, 
                longitude = ?,
                updated_at = UNIX_TIMESTAMP()
            WHERE customer_id = ?
        `;
        
        const result = await executeQuery(updateLocationQuery, [lat, lng, customer_id]);

        if (result.affectedRows > 0) {
            console.log(`Updated location for customer ID: ${customer_id}`, { latitude: lat, longitude: lng });
            return res.json({
                success: true,
                message: "User location updated successfully",
                data: {
                    customer_id,
                    latitude: lat,
                    longitude: lng
                }
            });
        } else {
            return res.status(500).json({
                success: false,
                message: "Failed to update user location"
            });
        }
    } catch (error) {
        console.error("Error updating user location:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
});


// Get user login count
router.get("/login_counts", async (req, res) => {
    try {
        const { customer_id } = req.query;

        if (!customer_id) {
            return res.status(400).json({
                status: false,
                message: "Customer ID is required"
            });
        }

        const query = "SELECT login_count FROM users WHERE customer_id = ?";
        const result = await executeQuery(query, [customer_id]);

        if (result.length === 0) {
            return res.status(404).json({
                status: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            status: true,
            data: {
                login_count: result[0].login_count
            }
        });

    } catch (error) {
        console.error("Error fetching login count:", error);
        return res.status(500).json({
            status: false,
            message: "Internal server error"
        });
    }
});

// App User Management API
router.route("/app_user")
    // GET - Retrieve app_user status
    .get(async (req, res) => {
        try {
            const { customer_id } = req.query;
            
            if (!customer_id) {
                    return res.status(400).json({
                        success: false,
                    message: "customer_id is required"
                });
            }

            const result = await executeQuery(
                "SELECT app_user FROM users WHERE customer_id = ?",
                [customer_id]
            );

            if (result.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            return res.json({
                        success: true,
                        data: {
                    app_user: result[0].app_user
                        }
                    });
        } catch (error) {
            console.error("Error in app-user GET:", error);
                    return res.status(500).json({
                        success: false,
                message: "Operation failed: " + error.message
            });
        }
    })
    // PUT - Update app_user
    .put(async (req, res) => {
        try {
            const { customer_id, app_user } = req.body;
            
            if (!customer_id || app_user === undefined) {
                return res.status(400).json({
                    success: false,
                    message: "customer_id and app_user are required"
                });
            }

            // Check if user exists
            const userExists = await executeQuery(
                "SELECT customer_id FROM users WHERE customer_id = ?",
                [customer_id]
            );

            if (userExists.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "User not found"
                });
            }

            // Update app_user status
            await executeQuery(
                "UPDATE users SET app_user = ? WHERE customer_id = ?",
                [app_user, customer_id]
            );

            return res.json({
                    success: true,
                message: "App user status updated successfully"
            });
        } catch (error) {
            console.error("Error in app-user PUT:", error);
            return res.status(500).json({
                success: false,
                message: "Operation failed: " + error.message
            });
        }
    });

// Count App Users
router.get("/app_user_count", async (req, res) => {
    try {
        const result = await executeQuery(
            "SELECT " +
            "COUNT(*) as total_users, " +
            "SUM(CASE WHEN app_user = 'Yes' THEN 1 ELSE 0 END) as yes_count, " +
            "SUM(CASE WHEN app_user = 'No' THEN 1 ELSE 0 END) as no_count " +
            "FROM users WHERE role = 'user'"
        );

        return res.json({
            success: true,
            data: {
                total_users: result[0].total_users || 0,
                app_users_yes: result[0].yes_count || 0,
                app_users_no: result[0].no_count || 0
            }
        });
    } catch (error) {
        console.error("Error in app_user_count:", error);
        return res.status(500).json({
            success: false,
            message: "Operation failed: " + error.message
        });
    }
});

// Brand image upload endpoint
router.post('/upload/brand-image/:brandId', uploadBrand.single('image'), async (req, res) => {
    try {
    const { brandId } = req.params;

    // Validate input
    if (!req.file) {
            return res.status(400).json({
                status: false,
        message: 'Image file is required' 
      });
    }

    // First, get the old image filename if it exists
    const getOldImageQuery = 'SELECT image FROM brands WHERE id = ?';
    const oldImageResult = await executeQuery(getOldImageQuery, [brandId]);
    
    // If there's an old image and it's different from the new one, delete it
    if (oldImageResult.length > 0 && oldImageResult[0].image && oldImageResult[0].image !== req.file.filename) {
      const oldImagePath = path.join(__dirname, '..', 'uploads', 'brands', oldImageResult[0].image);
      try {
        if (fs.existsSync(oldImagePath)) {
          await fs.promises.unlink(oldImagePath);
        }
      } catch (deleteError) {
        // Ignore error, continue
      }
    }

    // Get the filename
    const filename = req.file.filename;

    // Update query to save image filename
    const query = 'UPDATE brands SET image = ? WHERE id = ?';
    const values = [filename, brandId];

    // Execute the query
    const result = await executeQuery(query, values);

    // Check if brand exists
    if (result.affectedRows > 0) {
      // Construct the URL for the uploaded image
      const imageUrl = `/images/brands/${filename}`;
        return res.status(200).json({
            status: true,
        message: 'Brand image uploaded successfully',
            data: {
          imageUrl,
          filename
        }
      });
    } else {
      // Delete the uploaded file if brand not found
      await fs.promises.unlink(req.file.path);
      return res.status(404).json({ 
        status: false,
        message: 'Brand not found' 
      });
    }
    } catch (error) {
    console.error('Error uploading brand image:', error);
    // Clean up uploaded file on error
    if (req.file) {
      await fs.promises.unlink(req.file.path).catch((err) => console.error('Error deleting file:', err));
    }
        return res.status(500).json({
            status: false,
      message: 'Internal server error',
      error: error.message 
        });
    }
});

// Advertisement image upload endpoint
router.post('/upload/advertisement-image/:adId', uploadAdvertisement.single('image'), async (req, res) => {
  try {
    const { adId } = req.params;

    // Validate input
    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: 'Image file is required'
      });
    }

    // First, get the old image filename if it exists
    const getOldImageQuery = 'SELECT image FROM advertisements WHERE id = ?';
    const oldImageResult = await executeQuery(getOldImageQuery, [adId]);
    
    // If there's an old image, delete it before uploading new one
    if (oldImageResult.length > 0 && oldImageResult[0].image) {
      const oldImagePath = path.join(__dirname, '..', 'uploads', 'adv', oldImageResult[0].image);
      try {
        if (fs.existsSync(oldImagePath)) {
          console.log(`Deleting old image: ${oldImagePath}`);
          await fs.promises.unlink(oldImagePath);
          console.log('Old image deleted successfully');
        }
      } catch (deleteError) {
        console.error('Error deleting old image:', deleteError);
      }
    }

    // Get the filename
    const filename = req.file.filename;

    // Update query to save image filename
    const query = 'UPDATE advertisements SET image = ? WHERE id = ?';
    const values = [filename, adId];

    // Execute the query
    const result = await executeQuery(query, values);

    // Check if advertisement exists
    if (result.affectedRows > 0) {
      // Construct the URL for the uploaded image
      const imageUrl = `/images/advertisements/${filename}`;
      return res.status(200).json({
        status: true,
        message: 'Advertisement image uploaded successfully',
        data: {
          imageUrl,
          filename
        }
      });
    } else {
      // Delete the uploaded file if advertisement not found
      await fs.promises.unlink(req.file.path);
      return res.status(404).json({ 
        status: false,
        message: 'Advertisement not found' 
      });
    }
  } catch (error) {
    console.error('Error uploading advertisement image:', error);
    // Clean up uploaded file on error
    if (req.file) {
      await fs.promises.unlink(req.file.path).catch((err) => console.error('Error deleting file:', err));
    }
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get advertisement image endpoint
router.get('/images/advertisements/:filename', (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(__dirname, '..', 'uploads', 'adv', filename);

  // Check if file exists before sending
  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({
      status: false,
      message: 'Advertisement image not found'
    });
  }

  // Set content type based on file extension
  const ext = path.extname(filename).toLowerCase();
  const contentType = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif'
  }[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.sendFile(imagePath, (err) => {
    if (err) {
      console.error('Error sending advertisement image:', err);
      res.status(500).json({
        status: false,
        message: 'Error sending image file'
      });
    }
  });
});
// Single API endpoint for advertisement CRUD operations
router.post("/advertisement-crud", async (req, res) => {
    try {
      const { operation, id, description, status } = req.body;
  
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
          if (!description) {
            return res.status(400).json({
              success: false,
              message: "Description is required"
            });
          }
  
          // Create new advertisement
          const createQuery = "INSERT INTO advertisements (description, status) VALUES (?, ?)";
          const createResult = await executeQuery(createQuery, [description, status || 'active']);
  
          return res.status(200).json({
            success: true,
            message: "Advertisement created successfully",
            data: {
              id: createResult.insertId,
              description,
              status: status || 'active'
            }
          });
  
        case 'update':
          // Validate input for update
          if (!id || !description) {
            return res.status(400).json({
              success: false,
              message: "ID and description are required for update"
            });
          }
  
          // Check if advertisement exists
          const checkQuery = "SELECT id FROM advertisements WHERE id = ?";
          const checkResult = await executeQuery(checkQuery, [id]);
  
          if (checkResult.length === 0) {
            return res.status(404).json({
              success: false,
              message: "Advertisement not found"
            });
          }
  
          // Update advertisement
          const updateQuery = "UPDATE advertisements SET description = ?, status = ? WHERE id = ?";
          await executeQuery(updateQuery, [description, status || 'active', id]);
  
          return res.status(200).json({
            success: true,
            message: "Advertisement updated successfully",
            data: {
              id,
              description,
              status: status || 'active'
            }
          });
  
        case 'read':
          // Read all advertisements or specific advertisement
          let readQuery = "SELECT * FROM advertisements";
          let readParams = [];
  
          if (id) {
            readQuery += " WHERE id = ?";
            readParams.push(id);
          }
  
          readQuery += " ORDER BY id DESC";
          const advertisements = await executeQuery(readQuery, readParams);
  
          if (id && advertisements.length === 0) {
            return res.status(404).json({
              success: false,
              message: "Advertisement not found"
            });
          }
  
          return res.status(200).json({
            success: true,
            message: "Advertisement(s) fetched successfully",
            data: advertisements
          });
  
        case 'delete':
          // Validate input for delete
          if (!id) {
            return res.status(400).json({
              success: false,
              message: "Advertisement ID is required for deletion"
            });
          }
  
          // First get the advertisement image
          const getAdQuery = "SELECT image FROM advertisements WHERE id = ?";
          const ad = await executeQuery(getAdQuery, [id]);
  
          if (ad.length === 0) {
            return res.status(404).json({
              success: false,
              message: "Advertisement not found"
            });
          }
  
          // Delete the image file if it exists
          if (ad[0].image) {
            const imagePath = path.join(__dirname, '..', 'uploads', 'adv', ad[0].image);
            try {
              if (fs.existsSync(imagePath)) {
                await fs.promises.unlink(imagePath);
              }
            } catch (deleteError) {
              console.error('Error deleting advertisement image file:', deleteError);
            }
          }
  
          // Delete the advertisement record
          const deleteQuery = "DELETE FROM advertisements WHERE id = ?";
          await executeQuery(deleteQuery, [id]);
  
          return res.status(200).json({
            success: true,
            message: "Advertisement deleted successfully"
          });
      }
    } catch (error) {
      console.error("Error in advertisement CRUD operation:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  });

// Single API endpoint for HSN CRUD operations
router.post("/hsn-crud", async (req, res) => {
    try {
        // Always destructure description from req.body
        const { operation, id, code, length, description } = req.body;
  
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
          if (!code) {
            return res.status(400).json({
              success: false,
              message: "Code is required"
            });
          }
  
          // Check if HSN code already exists
          const checkExistingQuery = "SELECT * FROM hsn_masters WHERE code = ?";
          const existingResult = await executeQuery(checkExistingQuery, [code]);
  
          if (existingResult.length > 0) {
            return res.status(400).json({
              success: false,
              message: "HSN code already exists"
            });
          }
  
          // Create new HSN entry
          const createQuery = "INSERT INTO hsn_masters (code, length, description) VALUES (?, ?, ?)";
          const createResult = await executeQuery(createQuery, [code, length || null, description || null]);
  
          return res.status(200).json({
            success: true,
            message: "HSN created successfully",
            data: {
              id: createResult.insertId,
              code,
              length: length || null,
              description: description || null
            }
          });
  
        case 'update':
          // Validate input for update
          if (!id || !code) {
            return res.status(400).json({
              success: false,
              message: "ID and code are required for update"
            });
          }
  
          // Check if HSN exists
          const checkQuery = "SELECT id FROM hsn_masters WHERE id = ?";
          const checkResult = await executeQuery(checkQuery, [id]);
  
          if (checkResult.length === 0) {
            return res.status(404).json({
              success: false,
              message: "HSN not found"
            });
          }
  
          // Check if new code already exists for different ID
          const checkCodeQuery = "SELECT id FROM hsn_masters WHERE code = ? AND id != ?";
          const codeExists = await executeQuery(checkCodeQuery, [code, id]);
  
          if (codeExists.length > 0) {
            return res.status(400).json({
              success: false,
              message: "HSN code already exists for another entry"
            });
          }
  
          // Update HSN
          const updateQuery = "UPDATE hsn_masters SET code = ?, length = ?, description = ? WHERE id = ?";
          await executeQuery(updateQuery, [code, length || null, description || null, id]);
  
          return res.status(200).json({
            success: true,
            message: "HSN updated successfully",
            data: {
              id,
              code,
              length: length || null,
              description: description || null
            }
          });
  
        case 'read':
          // Read all HSN entries or specific HSN entry
          let readQuery = "SELECT * FROM hsn_masters";
          let readParams = [];
  
          if (id) {
            readQuery += " WHERE id = ?";
            readParams.push(id);
          }
  
          readQuery += " ORDER BY id DESC";
          const hsnEntries = await executeQuery(readQuery, readParams);
  
          if (id && hsnEntries.length === 0) {
            return res.status(404).json({
              success: false,
              message: "HSN not found"
            });
          }
  
          return res.status(200).json({
            success: true,
            message: "HSN entry(s) fetched successfully",
            data: hsnEntries
          });
  
        case 'delete':
          // Validate input for delete
          if (!id) {
            return res.status(400).json({
              success: false,
              message: "HSN ID is required for deletion"
            });
          }
  
          // Check if HSN exists
          const getHsnQuery = "SELECT id FROM hsn_masters WHERE id = ?";
          const hsnExists = await executeQuery(getHsnQuery, [id]);
  
          if (hsnExists.length === 0) {
            return res.status(404).json({
              success: false,
              message: "HSN not found"
            });
          }
  
          // Delete the HSN record
          const deleteQuery = "DELETE FROM hsn_masters WHERE id = ?";
          await executeQuery(deleteQuery, [id]);
  
          return res.status(200).json({
            success: true,
            message: "HSN deleted successfully"
          });
      }
    } catch (error) {
      console.error("Error in HSN CRUD operation:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  });

module.exports = router;





