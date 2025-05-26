const { getTransactionsForMonth } = require("../services/transactionService");


const allTransactions = async (req, res) => {
  try {
    const customerId = req.userID;
    const { month, year } = req.query;

    if (!customerId || !month || !year) {
      return res.status(400).json({
        status: "error",
        message: "User ID, Month, and Year are required.",
      });
    }

    const transactions = await getTransactionsForMonth(customerId, month, year);

    res.status(200).json({
      status: "success",
      data: transactions,
    });
  } catch (error) {
    console.error("Error in allTransactions:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = { allTransactions };
