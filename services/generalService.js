const { getProducts } = require("./dbUtility");

exports.getProductsService = async (filters) => {
  try {
    return await getProducts(filters);
  } catch (error) {
    console.error("Error in getProductsService:", error);
    throw new Error("Service Error: Failed to retrieve products");
  }
};
