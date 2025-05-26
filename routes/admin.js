const express = require("express");
const {
  addUserController,
  getAllOrdersController,
  setAmOrderController,
  getAllUsersController,
  addProductController,
  updateUserController,
  updateProductController,
  approveDefectReportController,
} = require("../controllers/adminController");
const { authenticate, authorizeAdmin } = require("../middleware/authenticate");
const bcrypt = require("bcryptjs");
const { executeQuery } = require("../dbUtils/db");
const { updateAdminRoutes } = require("../dbUtils/db"); // Import the update function

const adminRouter = express.Router();

adminRouter.post("/addUser", authenticate, authorizeAdmin, addUserController);

adminRouter.get(
  "/allOrders",
  authenticate,
  authorizeAdmin,
  getAllOrdersController
);

adminRouter.post(
  "/setAmOrder",
  authenticate,
  authorizeAdmin,
  setAmOrderController
);

adminRouter.get(
  "/allUsers",
  authenticate,
  authorizeAdmin,
  getAllUsersController
);

adminRouter.post(
  "/newItem",
  authenticate,
  authorizeAdmin,
  addProductController
);

adminRouter.post("/update", authenticate, authorizeAdmin, updateUserController);

adminRouter.post(
  "/editProd",
  updateProductController
);

adminRouter.post(
  "/approveDefect",
  authenticate,
  authorizeAdmin,
  approveDefectReportController
);







adminRouter.post("/batch", async (req, res) => {
  const users = req.body;

  if (!users || users.length === 0) {
    return res.status(400).send("No users provided");
  }

  try {
    const values = await Promise.all(
      users.map(async (user) => {
        const { customer_id, username, name, password, route } = user;

        // Ensure all required fields are present
        if (!customer_id || !username || !name || !password || !route) {
          throw new Error("Missing required fields");
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        return [customer_id, username, name, hashedPassword, route];
      })
    );

    // Create the query string with placeholders for parameterized values
    const query = `
      INSERT INTO users (customer_id, username, name, password, route) 
      VALUES ?;
    `;

    // Execute the query with the values array
    executeQuery(query, [values], (err, result) => {
      if (err) {
        console.error("Error inserting users:", err);
        return res.status(500).send("Error inserting users");
      }
      res.status(200).send("Users inserted successfully");
    });
  } catch (err) {
    console.error("Error processing request:", err);
    res.status(500).send("Error processing request");
  }
});

module.exports = adminRouter;
