const express = require("express");
const { getProductsController } = require("../controllers/generalController");

const generalRouter = express.Router();

generalRouter.get("/products", getProductsController);

module.exports = generalRouter;
