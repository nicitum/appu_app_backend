const express = require("express");
const router = express.Router();
const { executeQuery } = require("../dbUtils/db");

router.post("/save-assignment", async (req, res) => {
  const { customerId, routes } = req.body;  // Receive customerId and routes from request body
  console.log("Received customerId:", customerId);
  console.log("Received routes:", routes);

  if (!customerId || !routes || routes.length === 0) {
    return res.status(400).json({ success: false, message: "Customer ID or routes missing." });
  }

  try {
    // Step 1: Check if customerId exists in the users table
    const userCheckQuery = "SELECT * FROM users WHERE customer_id = ?";
    const user = await executeQuery(userCheckQuery, [customerId]);

    if (user.length === 0) {
      return res.status(400).json({ success: false, message: "Customer ID does not exist in users table." });
    }

    const adminId = user[0].id;  // Getting the admin ID
    const custId = user[0].customer_id;  // Get customer_id from the users table to populate cust_id in admin_assign

    // Step 2: Insert new routes for the admin
    const insertPromises = routes.map((route) => {
      const query = "INSERT INTO admin_assign (admin_id, customer_id, cust_id, route, assigned_date, status) VALUES (?, ?, ?, ?, NOW(), 'assigned')";
      return executeQuery(query, [adminId, customerId, custId, route]);  // Populate cust_id here
    });

    await Promise.all(insertPromises);

    res.status(200).json({
      success: true,
      message: "Routes and cust_id updated successfully!",
      newlyAssignedRoutes: routes,
    });
  } catch (error) {
    console.error("Error saving routes:", error);
    res.status(500).json({ success: false, message: "Error saving routes." });
  }
});



router.post("/get-all-assigned-routes", async (req, res) => {
  console.log("Fetching all assigned routes...");

  try {
    // Fetch both route, admin_id, and corresponding user details from users table
    const query = `
      SELECT aa.route, aa.admin_id, u.username, u.customer_id
      FROM admin_assign aa
      JOIN users u ON aa.admin_id = u.id
    `;
    const assignedRoutes = await executeQuery(query);

    // Map the result to include route, admin_id, username, and customer_id
    const routesWithAdminDetails = assignedRoutes.map((routeData) => ({
      route: routeData.route,
      admin_id: routeData.admin_id,
      username: routeData.username,    // Admin's name
      customer_id: routeData.customer_id,  // Admin's customer ID
    }));

    res.status(200).json({
      success: true,
      assignedRoutes: routesWithAdminDetails,  // Send all necessary details
    });
  } catch (error) {
    console.error("Error fetching assigned routes:", error);
    res.status(500).json({ success: false, message: "Error fetching assigned routes." });
  }
});






// Fetch all unique routes from users table
router.get("/get-unique-routes", async (req, res) => {
  console.log("Fetching unique routes from users table...");

  try {
    // Query to select distinct routes from the users table
    const routesQuery = "SELECT DISTINCT route FROM users";
    const routes = await executeQuery(routesQuery);

    if (routes.length === 0) {
      return res.status(404).json({ success: false, message: "No routes found." });
    }

    // Extracting route names into an array
    const uniqueRoutes = routes.map(row => row.route);

    // Sending response
    res.status(200).json({ success: true, routes: uniqueRoutes });
  } catch (error) {
    console.error("Error fetching unique routes:", error);
    res.status(500).json({ success: false, message: "Error fetching unique routes." });
  }
});



// Backend: Fix duplicate assignment check
router.post("/assign-users-to-admin", async (req, res) => {
  const { adminId, users } = req.body;
  console.log("Assigning users to admin:", adminId);
  console.log("Users to assign:", users);

  if (!adminId || !users || users.length === 0) {
    return res.status(400).json({ success: false, message: "Admin ID or users missing." });
  }

  try {
    const adminCheckQuery = "SELECT * FROM users WHERE id = ?";
    const admin = await executeQuery(adminCheckQuery, [adminId]);

    if (admin.length === 0) {
      return res.status(400).json({ success: false, message: "Admin ID does not exist." });
    }

    // Step 2: Check if users are already assigned to another admin
    const userIds = users.join(",");
    const checkExistingAssignmentsQuery = `SELECT customer_id, admin_id FROM admin_assign WHERE customer_id IN (${userIds})`;
    const existingAssignments = await executeQuery(checkExistingAssignmentsQuery);

    if (existingAssignments.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some users are already assigned to another admin.",
        existingAssignments,
      });
    }

    // Step 3: Insert records into admin_assign table
    const assignmentPromises = users.map(async (userId) => {
      const userCheckQuery = "SELECT customer_id FROM users WHERE id = ?";
      const user = await executeQuery(userCheckQuery, [userId]);

      if (user.length === 0) {
        return res.status(400).json({ success: false, message: `User ID ${userId} does not exist.` });
      }

      const custId = user[0].customer_id;
      const insertQuery = `INSERT INTO admin_assign (admin_id, customer_id, cust_id, assigned_date, status) VALUES (?, ?, ?, NOW(), 'assigned')`;
      return executeQuery(insertQuery, [adminId, userId, custId]);
    });

    await Promise.all(assignmentPromises);

    res.status(200).json({
      success: true,
      message: "Users successfully assigned to the admin.",
      assignedUsers: users,
    });
  } catch (error) {
    console.error("Error assigning users:", error);
    res.status(500).json({ success: false, message: "Error assigning users to admin." });
  }
});




// display helper api for only admins users .
// Endpoint to fetch users assigned to a specific admin
router.get("/assigned-users/:adminId", async (req, res) => {
  const { adminId } = req.params;

  if (!adminId) {
    return res.status(400).json({ success: false, message: "Admin ID is required." });
  }

  try {
    const fetchQuery = `
      SELECT DISTINCT
        u.id, 
        u.username, 
        u.phone, 
        u.customer_id AS cust_id, 
        u.name, 
        u.route, 
        u.status, 
        u.delivery_address
      FROM users u
      INNER JOIN admin_assign aa 
        ON (u.id = aa.customer_id OR u.customer_id = aa.customer_id)
      WHERE aa.admin_id = ?
    `;
    
    console.log("Fetching assigned users for adminId:", adminId);
    const assignedUsers = await executeQuery(fetchQuery, [adminId]);
    console.log("Assigned users:", assignedUsers);

    if (assignedUsers.length > 0) {
      return res.status(200).json({
        success: true,
        assignedUsers,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "No users assigned to this admin.",
      });
    }
  } catch (error) {
    console.error("Error fetching assigned users:", {
      message: error.message,
      stack: error.stack,
      adminId
    });
    return res.status(500).json({ 
      success: false, 
      message: "Error fetching assigned users.", 
      error: error.message 
    });
  }
});


module.exports = router;
