const moment = require("moment/moment");
const {
  isUserExists,
  getOrdersByCustomerId,
  getOrder,
  getProductById,
  getProducts,
  createOrder,
  addOrderProducts,
  createTransactionForCOD,
  getProductss,
  checkExistingOrder,
  toggleDeliveryStatus,
  getCustomerProductPrice,
  updateOrderTotalAmount
} = require("./dbUtility");
const { executeQuery } = require("../dbUtils/db");

const placeOrderService = async (
  customerId,
  { products, orderType, orderDate } // We get products, orderType, orderDate
) => {
  try {
      // 1. Check and Validate Order using checkOrderService - This ALSO CALCULATES an *initial* totalAmount
      const checkResult = await checkOrderService(customerId, orderType, products, orderDate);

      if (!checkResult || !checkResult.response.status) { // Handle errors from checkOrderService
          return checkResult || { statusCode: 500, response: { status: false, message: "Error validating order." } };
      }

      // Get the *initial* totalAmount from checkOrderService (we won't use this for createOrder)
      const initialTotalAmount = checkResult.response.data.totalAmount; // Store initial amount for logging if needed
      console.log("placeOrderService - Initial totalAmount from checkOrderService:", initialTotalAmount);

      // 2. Define placedOn, createdAt, updatedAt **BEFORE** calling createOrder
      const placedOn = orderDate;  // <--- Define placedOn HERE, BEFORE createOrder
      const currentEpoch = Math.floor(Date.now() / 1000);
      const createdAt = currentEpoch;
      const updatedAt = currentEpoch;


      // 3. Create the order entry - Using a TEMPORARY totalAmount (0) for now, will update later
      const orderId = await createOrder( // Create order first to get orderId for addOrderProducts
          customerId,
          0, // <--- Use a TEMPORARY totalAmount (like 0) here, we will UPDATE it later!
          orderType,
          placedOn,  // <--- Now 'placedOn' is defined before being used!
          createdAt,
          updatedAt
      );
      await addOrderProducts(customerId, orderId, products); // Pass customerId to addOrderProducts

      // 4. **Recalculate total amount AFTER addOrderProducts** - To get the final total based on prices in order_products table
      const recalculatedTotalAmount = await recalculateOrderTotal(orderId);
      console.log("placeOrderService - Recalculated totalAmount (after addOrderProducts):", recalculatedTotalAmount);


      // 5. **UPDATE the orders table with the RECALCULATED totalAmount**
      await updateOrderTotalAmount(orderId, recalculatedTotalAmount); // Implement this new function (see below)


      // 6. Return the result with the **RECALCULATED** totalAmount
      return {
          statusCode: 200,
          response: {
              status: true,
              message: "Order placed successfully.",
              data: {
                  orderId,
                  customerId,
                  orderType,
                  totalAmount: recalculatedTotalAmount, // <--- Return RECALCULATED totalAmount in response
                  placedOn,
                  products,
              },
          },
      };
  } catch (error) {
      console.error("Error in placeOrderService:", error);
      throw new Error("Failed to place the order.");
  }
};

const recalculateOrderTotal = async (orderId) => {
  try {
      const query = `
          SELECT SUM(price * quantity) AS orderTotal
          FROM order_products
          WHERE order_id = ?;
      `;
      const results = await executeQuery(query, [orderId]);
      if (results.length > 0 && results[0].orderTotal !== null) {
          return parseFloat(results[0].orderTotal);
      } else {
          return 0; // Or handle case where no products in order
      }
  } catch (error) {
      console.error("Error recalculating order total:", error);
      return 0; // Or handle error as needed
  }
};


const checkOrderService = async (customerId, orderType, products, orderDate) => {
  try {
      // Check if the user exists
      const isUser = await isUserExists(customerId);
      if (!isUser) {
          return {
              statusCode: 400,
              response: { status: false, message: "User doesn't exist." },
          };
      }

      

      // Validate products and calculate total amount
      let totalAmount = 0;
      const invalidProducts = [];
      const dbProducts = await getProductss();

      for (const product of products) {
          console.log(`🪵 → checkOrderService - Processing product:`, product);

          // Ensure we extract a valid product ID
          const productId = product.product_id ?? product.id; // Handles both cases
          const { quantity } = product;

          if (!productId) {
              console.warn(`🚨 checkOrderService - Missing product ID for item:`, product);
              invalidProducts.push("(Missing ID)");
              continue;
          }

          const productData = dbProducts.find((p) => p.id === Number(productId));
          if (!productData) {
              console.warn(`🚨 checkOrderService - Product not found in DB:`, productId);
              invalidProducts.push(productId);
              continue;
          }

          const parsedQuantity = parseInt(quantity, 10);
          if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
              console.warn(`🚨 checkOrderService - Invalid quantity (${quantity}) for product ID: ${productId}`);
              invalidProducts.push(productId);
              continue;
          }

          // *** Fetch effective price using customerId and productId in checkOrderService ***
          let effectivePrice = null;
          try {
              const customerPriceData = await getCustomerProductPrice(customerId, productId); // Use getCustomerProductPrice
              if (customerPriceData && customerPriceData.customer_price !== null) {
                  effectivePrice = customerPriceData.customer_price;
                  console.log(`checkOrderService - Effective price found in customer_product_price for product ID ${productId}: ${effectivePrice}`);
              }
          } catch (customerPriceError) {
              console.error("checkOrderService - Error fetching customer_price:", customerPriceError);
              // Fallback to discountPrice if customer price fetch fails
          }

          if (effectivePrice === null) {
              effectivePrice = productData.discountPrice; // Fallback to discountPrice
              console.log(`checkOrderService - Customer price not found, using discountPrice for product ID ${productId}: ${effectivePrice}`);
          }

          totalAmount += effectivePrice * parsedQuantity; // Use effectivePrice for totalAmount calculation
          console.log(`checkOrderService - Running totalAmount after adding product ${productId}:`, totalAmount);
      }

      // If there are any invalid products, return an error
      if (invalidProducts.length > 0) {
          console.error(`🚨 checkOrderService - Invalid products found: ${invalidProducts.join(", ")}`);
          return {
              statusCode: 400,
              response: { status: false, message: `Invalid products found: ${invalidProducts.join(", ")}` },
          };
      }

      console.log(`checkOrderService - Final totalAmount:`, totalAmount);

      // Return valid order data
      return {
          statusCode: 200,
          response: { status: true, message: "Valid order, can proceed further.", data: { customerId, orderType, products, totalAmount } },
      };
  } catch (error) {
      console.error("❌ Error in checkOrderService:", error);
      return {
          statusCode: 500,
          response: { status: false, message: "Internal server error." },
      };
  }
};

const orderHistoryService = async (customerId) => {
  try {
    const orders = await getOrdersByCustomerId(customerId);

    const getStartOfDayTimestamp = (date) => {
      const dateObj = new Date(date * 1000);
      dateObj.setUTCHours(0, 0, 0, 0);
      return Math.floor(dateObj.getTime() / 1000);
    };

    const groupOrdersByDateAndType = (orders) => {
      const result = {};

      orders.forEach((order) => {
        const orderDateTimestamp = getStartOfDayTimestamp(order.placedOn);
        const orderType = order.orderType;

        if (!result[orderDateTimestamp]) {
          result[orderDateTimestamp] = {};
        }

        if (!result[orderDateTimestamp][orderType]) {
          result[orderDateTimestamp][orderType] = {
            quantity: 0,
            totalAmount: 0,
            route: order.route,
            orderId: order.orderId,
          };
        }

        result[orderDateTimestamp][orderType].quantity += order.quantity;
        result[orderDateTimestamp][orderType].totalAmount = order.totalAmount;
      });

      console.log(`🪵 → result:`, result);
      return result;
    };

    const groupedOrders = groupOrdersByDateAndType(orders);

    return groupedOrders;
  } catch (error) {
    console.error("Error in orderHistoryService:", error.message);
    throw new Error("Failed to fetch order history.");
  }
};

const getOrderService = async (customerId, orderId) => {
  try {
    // Fetch the order details from the orders table
    const orderQuery = `
      SELECT * 
      FROM orders 
      WHERE customer_id = ? AND id = ?
    `;
    const [order] = await executeQuery(orderQuery, [customerId, orderId]);

    if (!order) {
      throw new Error(
        `Order with ID ${orderId} not found for customer ${customerId}`
      );
    }

    // Fetch the related products for the order from the order_products table
    const orderProductsQuery = `
      SELECT op.product_id, op.quantity, op.price, p.name, p.category 
      FROM order_products op
      JOIN products p ON op.product_id = p.id
      WHERE op.order_id = ?
    `;
    const products = await executeQuery(orderProductsQuery, [orderId]);

    return {
      order,
      products,
    };
  } catch (error) {
    console.error("Error in getOrderService:", error);
    throw error;
  }
};

const getAllOrdersService = async (customerId) => {
  try {
    // Fetch all the orders from the orders table
    const ordersQuery = `
      SELECT * 
      FROM orders where customer_id = ?
    `;
    const orders = await executeQuery(ordersQuery, [customerId]);

    if (!orders.length) {
      throw new Error("No orders found");
    }

    // For each order, fetch the related products from the order_products table
    const ordersWithProducts = await Promise.all(
      orders.map(async (order) => {
        const orderProductsQuery = `
          SELECT op.product_id, op.quantity, op.price, p.name, p.category
          FROM order_products op
          JOIN products p ON op.product_id = p.id
          WHERE op.order_id = ?
        `;
        const products = await executeQuery(orderProductsQuery, [order.id]);

        return {
          order,
          products,
        };
      })
    );

    return ordersWithProducts;
  } catch (error) {
    console.error("Error in getAllOrdersService:", error);
    throw error;
  }
};

const toggleDeliverySatusService = async (customerId, orderId) => {
  try {
    const userExists = await isUserExists(customerId);
    const orderExists = await getOrder(customerId, orderId);

    if (
      !userExists ||
      !orderExists.length ||
      orderExists[0].delivery_status == "delivered"
    ) {
      throw new Error("No order found.");
    }

    const updateResponse = await toggleDeliveryStatus(customerId, orderId);
    return updateResponse;
  } catch (error) {
    console.error("Error in toggleDeliverySatusService:", error);
    throw error;
  }
};

const reportDefectService = async (customerId, orderId, defectiveProducts) => {
  try {
    const orderExists = await getOrder(customerId, orderId);
    if (!orderExists.length || orderExists[0].delivery_status == "delivered") {
      throw new Error("No order found.");
    }
    for (let i = 0; i < defectiveProducts.length; i++) {
      const { productId, quantity, reportDescription } = defectiveProducts[i];

      const validateOrderProductQuery = `
        SELECT * 
        FROM order_products op
        JOIN orders o ON op.order_id = o.id
        WHERE op.order_id = ? AND op.product_id = ? AND o.customer_id = ?
      `;
      const [orderProduct] = await executeQuery(validateOrderProductQuery, [
        orderId,
        productId,
        customerId,
      ]);

      if (!orderProduct) {
        return {
          message: `Product with ID ${productId} not found in the given order for customer ${customerId}`,
        };
      }

      // Insert the defect report for each defective product into the product_defects table
      const insertDefectQuery = `
        INSERT INTO product_defects (order_id, product_id, customer_id, report_description, quantity)
        VALUES (?, ?, ?, ?, ?)
      `;
      await executeQuery(insertDefectQuery, [
        orderId,
        productId,
        customerId,
        reportDescription,
        quantity,
      ]);
    }

    return {
      message: "Defect(s) reported successfully",
    };
  } catch (error) {
    console.error("Error in reportDefectService:", error);
    throw error;
  }
};

module.exports = {
  placeOrderService,
  orderHistoryService,
  checkOrderService,
  getOrderService,
  getAllOrdersService,
  toggleDeliverySatusService,
  reportDefectService,
};