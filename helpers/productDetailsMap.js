const { executeQuery } = require("../dbUtils/db");

const getProductsWithDetails = async (defaultOrder, customer_id) => {
  try {
    const order = {
      customer_id,
      total_amount: 0,
    };

    const products = defaultOrder.map((row) => {
      order.total_amount += row.price * row.quantity;
      return {
        id: row.product_id,
        quantity: row.quantity,
        price: row.price,
        name: row.name,
        category: row.category,
      };
    });

    return {
      order,
      products,
    };
  } catch (error) {
    console.error("Error retrieving product details for default order:", error);
    throw new Error("Failed to get product details.");
  }
};

module.exports = { getProductsWithDetails };
