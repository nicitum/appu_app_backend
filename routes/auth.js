const express = require("express");
const router = express.Router();
const { loginUser } = require("../services/userService");

router.post("/", async (req, res) => {
  try {
    const { username, password } = req.body;
    const response = await loginUser(username, password);
    res.status(response.statusCode).json(response.response);
  } catch (err) {
    res.status(500).json({
      status: false,
      message: err.message || "Internal Server Error",
    });
  }
});

module.exports = router; 