const { getDailyTransactions, getMonthlyTotals } = require("./dbUtility");

const getTransactionsForMonth = async (userId, month, year) => {
  try {
    // Call the DB utility functions
    const dailyTransactions = await getDailyTransactions(userId, month, year);
    const monthlyTotals = await getMonthlyTotals(userId, month, year);

    // Process and format the data
    const orders = dailyTransactions.map((order) => ({
      order_date: order.order_date,
      order_amount: order.total_order_amount,
      amount_paid: order.total_amount_paid,
    }));

    // Return the formatted result
    return {
      orders,
      total_order_amount: monthlyTotals.total_order_amount,
      total_amount_paid: monthlyTotals.total_amount_paid,
    };
  } catch (error) {
    console.error("Error in getTransactionsForMonth service:", error.message);
    throw new Error("Unable to fetch transactions for the month.");
  }
};

module.exports = { getTransactionsForMonth };
