const { getProductsService } = require("../services/generalService");

exports.getProductsController = async (req, res) => {
  try {
    const products = await getProductsService(req.query);
    res.status(200).json(products);
  } catch (error) {
    console.error("Error in getProductsController:", error);
    res
      .status(500)
      .json({ status: false, message: "Failed to retrieve products" });
  }
};
