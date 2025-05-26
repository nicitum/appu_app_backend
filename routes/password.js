const bcrypt = require('bcrypt');
const { executeQuery } = require("../dbUtils/db"); // Using your db utility
const moment = require("moment-timezone"); // You have this imported, so I'll include it

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
  } catch (error) {
    console.error('Error updating passwords:', error);
  }
}

updateExistingPasswords();