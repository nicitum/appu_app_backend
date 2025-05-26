const express = require("express");
const { authenticate } = require("../middleware/authenticate");
const {
  placeOrderController,
  orderHistoryController,
  checkOrderController,
  getOrderController,
  getAllOrdersController,
  toggleDeliveryStatusController,
  reportDefectController,
} = require("../controllers/orderController");
const { getProducts } = require("../services/dbUtility");

const orderRouter = express.Router();

orderRouter.get("/check", authenticate, checkOrderController);
orderRouter.post("/place", authenticate, placeOrderController);
orderRouter.get("/history", authenticate, orderHistoryController);
orderRouter.get("/order", authenticate, getOrderController);

orderRouter.get("/all", authenticate, getAllOrdersController);

orderRouter.post("/toggleStatus", authenticate, toggleDeliveryStatusController);

orderRouter.post("/report", authenticate, reportDefectController);

module.exports = orderRouter;
