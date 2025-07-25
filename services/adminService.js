const {
  addUser,
  isUserExists,
  getAllOrders,
  setAmOrder,
  getAllUsers,
  addProduct,
  updateUser,
  updateProduct,
  getProductById,
  getDefectReportById,
  updateOrderProducts,
  updateOrderTotal,
} = require("./dbUtility");

exports.addUserService = async (userDetails) => {
  try {
    // Validate required fields including price_mode
    if (!userDetails.price_mode) {
      return {
        statusCode: 400,
        response: { status: false, message: "Price mode is required." },
      };
    }

    const existingUser = await isUserExists(userDetails.customer_id);

    if (existingUser) {
      return {
        statusCode: 400,
        response: { status: false, message: "User already exists." },
      };
    }

    const insertResponse = await addUser(userDetails);
    return {
      statusCode: 201,
      response: {
        status: true,
        message: "Added user.",
      },
    };
  } catch (error) {
    console.error("Error in addUserService:", error);
    throw new Error("Failed to add user to db from admin.");
  }
};

exports.getAllOrdersService = async (params) => {
  try {
    const getResult = await getAllOrders(params);

    return {
      statusCode: 200,
      response: {
        status: true,
        data: getResult,
      },
    };
  } catch (error) {
    console.error("Error in getAllOrdersService:", error);
    throw new Error("Failed to get all orders.");
  }
};

exports.setAmOrderService = async (products) => {
  try {
    const addResponse = await setAmOrder(products);

    return {
      statusCode: 200,
      response: {
        status: true,
        data: addResponse,
      },
    };
  } catch (error) {
    console.error("Error in setAmOrderService:", error);
    throw new Error("Failed to set AM order.");
  }
};

exports.getAllUsersService = async (searchQuery) => {
  try {
    const getResponse = await getAllUsers(searchQuery);
    return {
      statusCode: 200,
      response: {
        status: true,
        data: getResponse,
      },
    };
  } catch (error) {
    console.error("Error in getAllUsersService:", error);
    throw new Error("Failed to get all users.");
  }
};

exports.addProductService = async (productData) => {
  try {
    
    const addResponse = await addProduct(productData);
  
    return {
      statusCode: 201,
      response: {
        status: true,
        message: "Product added successfully",
        productId: addResponse.insertId,
      },
    };
  } catch (error) {
    console.error("Error in addProductService:", error);
    throw new Error("Failed to add product.");
  }
};

exports.updateUserService = async (customer_id, data) => {
  try {
    const response = await updateUser(customer_id, data);
    return {
      statusCode: 201,
      response: {
        status: true,
        message: "Update user.",
      },
    };
  } catch (error) {
    console.error("Error in updateUser:", error.message);
    throw new Error("Failed to update users.");
  }
};

exports.updateProductService = async (id, updateFields) => {
  try {
    // Validate that we have an id
    if (!id) {
      return {
        statusCode: 400,
        response: {
          status: "error",
          message: "Product ID is required"
        }
      };
    }

    // Validate that we have fields to update
    if (!updateFields || Object.keys(updateFields).length === 0) {
      return {
        statusCode: 400,
        response: {
          status: "error",
          message: "No fields provided for update"
        }
      };
    }

    const updatedProduct = await updateProduct(id, updateFields);
    
    if (!updatedProduct) {
      return {
        statusCode: 404,
        response: {
          status: "error",
          message: "Product not found"
        }
      };
    }

    return {
      statusCode: 200,
      response: {
        status: "success",
        message: "Product updated successfully",
        data: updatedProduct
      }
    };
  } catch (error) {
    console.error("Error in productService updateProduct:", error);
    return {
      statusCode: 500,
      response: {
        status: "error",
        message: error.message || "Failed to update product"
      }
    };
  }
};

exports.updateOrderAfterDefectApprovalService = async (reportId, orderId) => {
  try {
    // Fetch the defect report
    const defectReport = await getDefectReportById(reportId);

    if (!defectReport) {
      throw new Error("Defect report not found.");
    }

    const { product_id, quantity } = defectReport;

    // Remove the defective products from the order (update `order_products` table)
    await updateOrderProducts(orderId, product_id, quantity);
    await updateOrderTotal(orderId);

    return { success: true };
  } catch (error) {
    console.error("Error in updateOrderAfterDefectApprovalService:", error);
    throw error;
  }
};
