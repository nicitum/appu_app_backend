const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const { allTransactions } = require("../controllers/transactionController");

const transactionsRouter = express.Router();

transactionsRouter.get("/trans", authenticate, allTransactions)

module.exports = transactionsRouter;
