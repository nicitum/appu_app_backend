const {
  orderHistoryService,
  checkOrderService,
  placeOrderService,
  getOrderService,
  getAllOrdersService,
  toggleDeliverySatusService,
  reportDefectService,
} = require("../services/orderService");

const placeOrderController = async (req, res) => {
  try {
    console.log("Received request in placeOrderController");
    console.log("Request Headers:", req.headers);
    console.log("Request Body:", JSON.stringify(req.body, null, 2));
    console.log("User ID from Token:", req.userID);

    const customerId = req.userID;
    const { products, orderType, orderDate } = req.body;

    if (!customerId) {
      return res.status(400).json({ status: "error", message: "User ID is missing" });
    }

    if (!products || products.length === 0) {
      return res.status(400).json({ status: "error", message: "No products found" });
    }

    const checkResult = await checkOrderService(customerId, orderType, products, orderDate);

    if (checkResult && !checkResult.response.status) {
      throw new Error(`${checkResult.response.message}`);
    }

    const orderData = {
      products,
      orderType,
      totalAmount: checkResult.response.data.totalAmount,
      orderDate: Math.floor(new Date(orderDate).getTime() / 1000),
    };

    console.log("Processed Order Data:", JSON.stringify(orderData, null, 2));

    const result = await placeOrderService(customerId, orderData);
    console.log("Final Response from placeOrderService:", result);

    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error("Error in placeOrderController:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};


const checkOrderController = async (req, res) => {
  try {
    const customerId = req.userID;

    if (!customerId) {
      return res.status(400).json({
        status: false,
        message: "Invalid customerId provided.",
      });
    }

    const { products, orderType, orderDate } = req.body;

    // Validate orderType
    if (!orderType || !["AM", "PM"].includes(orderType)) {
      return res.status(400).json({
        status: false,
        message: "Not a valid order type.",
      });
    }

    // Validate products array
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Products list is empty.",
      });
    }

    // Convert orderDate to GMT epoch (seconds)
    const orderEpochDate = Math.floor(new Date(orderDate).getTime() / 1000);

    const checkResult = await checkOrderService(
      customerId,
      orderType,
      products,
      orderEpochDate
    );

    if (!checkResult.status) {
      return res.status(checkResult.statusCode).json(checkResult.response);
    }
    return res.status(checkResult.statusCode).json(checkResult.response);
  } catch (error) {
    console.error("Error in checkOrderController:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

const orderHistoryController = async (req, res) => {
  const customerId = req.userID;

  const getResponse = await orderHistoryService(customerId);

  res.status(200).json(getResponse);
};

const getOrderController = async (req, res) => {
  try {
    const customerId = req.userID;
    const { orderId } = req.query;

    if (!customerId || !orderId) {
      return res.status(400).json({
        status: false,
        message: "Id is not valid.",
      });
    }

    const getResponse = await getOrderService(customerId, orderId);
    return res.status(200).json(getResponse);
  } catch (error) {
    console.error("Error in getOrderController:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

const getAllOrdersController = async (req, res) => {
  try {
    const customerId = req.userID;
    const allOrders = await getAllOrdersService(customerId);

    return res.status(200).json(allOrders);
  } catch (error) {
    console.error("Error in getAllOrdersController:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

const toggleDeliveryStatusController = async (req, res) => {
  try {
    const customerId = req.userID;
    const { orderId } = req.query;

    if (!customerId || !orderId) {
      return res
        .status(400)
        .json({ message: "Customer id or orderid not found." });
    }

    const updateResponse = await toggleDeliverySatusService(
      customerId,
      orderId
    );

    return res.status(200).json(updateResponse);
  } catch (error) {
    console.error("Error in toggleDeliveryStatusController:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

const reportDefectController = async (req, res) => {
  try {
    const customerId = req.userID;
    const { orderId, defectiveProducts } = req.body;

    if (!customerId || !orderId || !defectiveProducts.length) {
      return res
        .status(400)
        .json({ message: "Customer id or orderid not found." });
    }

    const reportResponse = await reportDefectService(
      customerId,
      orderId,
      defectiveProducts
    );
    return res.status(200).json(reportResponse);
  } catch (error) {
    console.error("Error in reportDefectController:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
module.exports = {
  placeOrderController,
  orderHistoryController,
  checkOrderController,
  getOrderController,
  getAllOrdersController,
  toggleDeliveryStatusController,
  reportDefectController,
};