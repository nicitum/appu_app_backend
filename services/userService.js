const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const {
  findUserByUserName,
  findUserByPhone,
  getUserById,
  changePassword,
  updateUser,
  orderHistory,
  getMonthlyTotals,
  getDefectReportByCustomerId,
  insertDefaultOrder,
  resetPassword,
  getAdminAssignments
} = require("./dbUtility");
const { getProductsWithDetails } = require("../helpers/productDetailsMap");
const { getTransactionsForMonth } = require("./transactionService");

const loginUser = async (username, password) => {
  try {
    console.log("Login attempt with phone:", username);
    
    // Find user by phone number
    const user = await findUserByPhone(username);
    
    if (!user) {
      return {
        statusCode: 400,
        response: {
          status: false,
          message: "User not found.",
        },
      };
    }

    if (user.status !== "active") {
      return {
        statusCode: 400,
        response: {
          status: false,
          message: "User is blocked, contact admin.",
        },
      };
    }

    // Compare the provided password with the stored hashed password using bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return {
        statusCode: 400,
        response: {
          status: false,
          message: "Incorrect credentials.",
        },
      };
    }

    const token = jwt.sign(
      { id: user.customer_id, id1: user.id, username: user.username, role: user.role },
      "appu",
      { expiresIn: "1h" }
    );

    await updateUser(user.customer_id, {
      last_login: Math.floor(Date.now() / 1000),
    });

    return {
      statusCode: 200,
      response: {
        status: true,
        message: "Login successful",
        token,
        role: user.role
      },
    };
  } catch (err) {
    console.error("Error in loginUser:", err.message);
    throw new Error(err.message || "Internal Server Error");
  }
};

const getUserDetailsByCustomerId = async (customerId) => {
  try {
    const { user, defaultOrder, latestOrder } = await getUserById(customerId);

    let detailedDefaultOrder = defaultOrder
      ? await getProductsWithDetails(defaultOrder, customerId)
      : null;
    // const detailedLatestOrder = await getProductsWithDetails(latestOrder);
    const transactions = await getMonthlyTotals(customerId, 12, 2024);
    const pendingAmount =
      transactions.total_order_amount - transactions.total_amount_paid || 0;
    return {
      user,
      defaultOrder: detailedDefaultOrder,
      latestOrder,
      pendingAmount,
    };
  } catch (err) {
    throw new Error(err.message || "Internal Server Error");
  }
};

const changePasswordService = async (id, newPassword) => {
  try {
    // Update password without old password verification
    const result = await changePassword(id, newPassword);

    if (!result) {
      return {
        statusCode: 400,
        response: {
          status: false,
          message: "Failed to update password.",
        },
      };
    }

    return {
      statusCode: 200,
      response: {
        status: true,
        message: "Password changed successfully.",
      },
    };
  } catch (err) {
    throw new Error(err.message || "Internal Server Error");
  }
};

const orderHistoryService = async (customerId, params) => {
  try {
    const getResponse = await orderHistory(customerId, params);

    const defectOrders = await getDefectReportByCustomerId(customerId);

    return {
      statusCode: 200,
      response: {
        status: true,
        message: "Orders retrieved.",
        orders: getResponse.response,
        count: getResponse.count,
        defectOrders: defectOrders,
      },
    };
  } catch (err) {
    throw new Error(err.message || "Internal Server Error");
  }
};

const createDefaultOrderService = async (customerId, products) => {
  try {
    const created_at = Math.floor(Date.now() / 1000);
    const updated_at = Math.floor(Date.now() / 1000);

    for (const product of products) {
      const { id, quantity } = product;

      await insertDefaultOrder(
        customerId,
        id,
        quantity,
        created_at,
        updated_at
      );
    }

    return {
      message: "Default order created successfully",
    };
  } catch (error) {
    console.error("Error in createDefaultOrderService:", error);
    throw new Error("Failed to create default order");
  }
};

const resetPasswordService = async (phone, newPassword) => {
  try {
    const result = await resetPassword(phone, newPassword);
    return {
      statusCode: 200,
      response: {
        status: true,
        message: "Password reset successful"
      }
    };
  } catch (err) {
    console.error("Error in resetPasswordService:", err);
    return {
      statusCode: 400,
      response: {
        status: false,
        message: err.message || "Password reset failed"
      }
    };
  }
};

module.exports = {
  loginUser,
  getUserDetailsByCustomerId,
  changePasswordService,
  orderHistoryService,
  createDefaultOrderService,
  resetPasswordService
};
