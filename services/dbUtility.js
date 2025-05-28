const { executeQuery } = require("../dbUtils/db");
const bcrypt = require("bcryptjs");

const findUserByUserName = async (userName) => {
  try {
    const query = "SELECT * FROM users WHERE username = ?";
    const user = await executeQuery(query, [userName]);

    if (!user[0]) {
      return {
        statusCode: 400,
        response: {
          status: false,
          message: "Invalid user. Please try again.",
        },
      };
    }
    return user[0];
  } catch (error) {
    console.error("Error in dbutility --> findUserByUserName:", error.message);
    throw error;
  }
};

const findUserByPhone = async (phone) => {
  try {
    const query = "SELECT * FROM users WHERE phone = ?";
    const result = await executeQuery(query, [phone]);
    return result[0] || null;
  } catch (error) {
    console.error("Error in findUserByPhone:", error.message);
    throw error;
  }
};

const getUserById = async (customerId) => {
  try {
    const userQuery =
      "SELECT customer_id, name, username, phone, delivery_address, route,auto_am_order,auto_pm_order FROM users WHERE customer_id = ?";
    const [user] = await executeQuery(userQuery, [customerId]);

    const latestOrderQuery = `SELECT 
                                  o.id, 
                                  o.customer_id, 
                                  o.total_amount, 
                                  o.order_type, 
                                  o.placed_on, 
                                  SUM(op.quantity) AS quantity
                              FROM 
                                  orders o
                              JOIN 
                                  order_products op ON o.id = op.order_id
                              WHERE 
                                  o.customer_id = ? 
                              GROUP BY
                                  o.id
                              ORDER BY 
                                  o.placed_on DESC 
                              LIMIT 1`;
    const [latestOrder] = await executeQuery(latestOrderQuery, [customerId]);

    const defaultOrderQuery = `
                              SELECT 
                                do.id,
                                do.customer_id,
                                do.product_id,
                                do.quantity,
                                do.created_at,
                                do.updated_at,
                                p.name,
                                p.category,
                                p.price
                            FROM 
                                default_orders do
                            JOIN 
                                products p
                            ON 
                                do.product_id = p.id
                            WHERE
                                do.customer_id = ?
                              `;
    const defaultOrder = await executeQuery(defaultOrderQuery, [customerId]);

    return {
      user,
      defaultOrder: defaultOrder || [],
      latestOrder: latestOrder || [],
    };
  } catch (error) {
    console.error("Error in dbutility --> getUserById:", error.message);
    throw new Error("Database query failed while fetching user.");
  }
};

const isUserExists = async (customerId) => {
  try {
    const query = "SELECT * FROM users WHERE customer_id = ?";
    const [user] = await executeQuery(query, [customerId]);
    return user ? true : false;
  } catch (error) {
    console.error("Error in dbutility --> isUserExists.");
    throw error;
  }
};

const getOrdersByCustomerId = async (customerId) => {
  try {
    const ordersQuery = `
      SELECT o.id AS orderId, o.total_amount AS totalAmount, o.order_type AS orderType, 
             o.placed_on AS placedOn, 
             p.product_id AS productId, p.quantity, p.price
      FROM orders o
      JOIN order_products p ON o.id = p.order_id
      WHERE o.customer_id = ?
    `;

    const orders = await executeQuery(ordersQuery, [customerId]);
    return orders;
  } catch (error) {
    console.error("Error in dbutility --> getOrdersByCustomerId.");
    throw error;
  }
};

const getProductss = async () => {
  try {
    let query = "SELECT * FROM products";
    const products = await executeQuery(query);
    return products;
  } catch (error) {
    console.error("Error in dbutility --> getProducts:", error);
    throw error;
  }
};

const getProducts = async (filters) => {
  try {
    let query = "SELECT * FROM products";
    const products = await executeQuery(query);
    return products;
  } catch (error) {
    console.error("Error in dbutility --> getProducts:", error);
    throw error;
  }
};

const getOrder = async (customerId, orderId) => {
  try {
    const query = "SELECT * FROM orders WHERE customer_id = ? AND id = ?";
    const order = await executeQuery(query, [customerId, orderId]);
    return order;
  } catch (error) {
    console.error("Error in dbutility --> getOrder.");
    throw error;
  }
};

const getProductById = async (productId) => {
  try {
    const query = "SELECT * FROM products WHERE id = ?";
    const product = await executeQuery(query, [productId]);
    return product;
  } catch (error) {
    console.error("Error in dbutility --> getProductById.");
    throw error;
  }
};

const lastPMOrder = async (orderId) => {
  try {
    const query = `
      SELECT * FROM orders
      WHERE customer_id = (SELECT customer_id FROM orders WHERE order_id = ?)
        AND order_type = 'PM'
      ORDER BY placed_on DESC LIMIT 1
    `;
    const [order] = await executeQuery(query, [orderId]);
    return order;
  } catch (error) {
    console.error("Error in dbutility --> lastPMOrder.");
    throw error;
  }
};

const createOrder = async (
  customerId,
  totalAmount,
  orderType,
  placedOn,
  createdAt,
  updatedAt
) => {
  try {
    const query = `
      INSERT INTO orders (customer_id, total_amount, order_type, placed_on, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `;

    const values = [
      customerId,
      totalAmount,
      orderType,
      placedOn,
      createdAt,
      updatedAt,
    ];
    const orderResult = await executeQuery(query, values);
    return orderResult.insertId;
  } catch (error) {
    console.error("Error in createOrder:", error);
    throw new Error("Failed to create the order.");
  }
};


const getCustomerProductPrice = async (customerId, productId) => {
  try {
      const query = "SELECT customer_price FROM customer_product_prices WHERE customer_id = ? AND product_id = ?";
      const results = await executeQuery(query, [customerId, productId]);

      console.log("getCustomerProductPrice - Results from executeQuery:", results); // Keep this log for verification

      // *** MODIFIED CONDITION - Check length of 'results' array directly ***
      if (results.length > 0) {
          return { customer_price: parseFloat(results[0].customer_price) }; // Access first element of the array directly
      } else {
          return null;
      }
  } catch (error) {
      console.error("Database error in getCustomerProductPrice:", error);
      throw error;
  }
};


const updateOrderTotalAmount = async (orderId, recalculatedTotalAmount) => {
  try {
      const query = `
          UPDATE orders
          SET total_amount = ?
          WHERE id = ?;
      `;
      await executeQuery(query, [recalculatedTotalAmount, orderId]);
      console.log(`updateOrderTotalAmount - Order ID ${orderId} total_amount updated to: ${recalculatedTotalAmount}`);
  } catch (error) {
      console.error("Error updating order total amount:", error);
      throw error; // Or handle error as needed
  }
};

const addOrderProducts = async (customerId, orderId, products) => {
  try {
      const availableProducts = await getProductss();

      const orderProductQueries = products.map(async (product) => {
          const productId = product.product_id || product.id;
          const { quantity, price: frontEndPrice } = product;

          if (!productId) {
              throw new Error(`Product with ID undefined received.`);
          }

          const productData = availableProducts.find((p) => p.id === Number(productId));
          if (!productData) {
              throw new Error(`Product with ID ${productId} not found in available products.`);
          }

          let effectivePrice = null;

          if (typeof frontEndPrice === 'number' && frontEndPrice > 0) {
              effectivePrice = frontEndPrice;
              console.log(`addOrderProducts - Using price from frontend for product ${productId}: ${effectivePrice}`); // Keeping this log
          } else {
              try {
                  const customerPriceData = await getCustomerProductPrice(customerId, productId);
                  if (customerPriceData && customerPriceData.customer_price !== null) {
                      effectivePrice = customerPriceData.customer_price;
                  }
              } catch (customerPriceError) {
                  console.error("addOrderProducts - Error fetching customer_price:", customerPriceError);
              }

              if (effectivePrice === null) {
                  effectivePrice = productData.discountPrice;
                  console.log(`addOrderProducts - Fallback to discountPrice: ${effectivePrice}`); // Keeping this log
              }
          }

          const query = `INSERT INTO order_products (order_id, product_id, quantity, price, name, category,gst_rate) VALUES (?, ?, ?, ?, ?, ?, ?);`;

          return {
              query: query,
              values: [
                  orderId,
                  productId,
                  quantity,
                  effectivePrice,
                  productData.name,
                  productData.category,
                  productData.gst_rate
              ],
          };
      });

      const queries = await Promise.all(orderProductQueries);
      for (const query of queries) {
          await executeQuery(query.query, query.values);
      }
      console.log("addOrderProducts - Queries executed successfully"); // Keeping this log
  } catch (error) {
      console.error("Error in addOrderProducts:", error);
      throw new Error("Failed to add products to the order.");
  }
};



const getDailyTransactions = async (userId, month, year) => {
  try {
    const getDailyTransactionsQuery = `
  SELECT 
      DATE(FROM_UNIXTIME(o.placed_on)) AS order_date, 
      SUM(o.total_amount) AS total_order_amount, 
      SUM(IFNULL(t.amount, 0)) AS total_amount_paid
  FROM 
      orders o
  LEFT JOIN 
      transactions t ON o.id = t.order_id
  WHERE 
      o.customer_id = ? AND
      MONTH(FROM_UNIXTIME(o.placed_on)) = ? AND
      YEAR(FROM_UNIXTIME(o.placed_on)) = ?
  GROUP BY 
      DATE(FROM_UNIXTIME(o.placed_on))
  ORDER BY 
      order_date;
`;
    const result = await executeQuery(getDailyTransactionsQuery, [
      userId,
      month,
      year,
    ]);
    return result;
  } catch (error) {
    console.error("Error executing daily transactions query:", error.message);
    throw new Error("Unable to fetch daily transactions.");
  }
};

const getMonthlyTotals = async (userId, month, year) => {
  try {
    const getMonthlyTotalsQuery = `
  SELECT 
      SUM(o.total_amount) AS total_order_amount, 
      SUM(IFNULL(t.amount, 0)) AS total_amount_paid
  FROM 
      orders o
  LEFT JOIN 
      transactions t ON o.id = t.order_id
  WHERE 
      o.customer_id = ? AND
      MONTH(FROM_UNIXTIME(o.placed_on)) = ? AND
      YEAR(FROM_UNIXTIME(o.placed_on)) = ?;
`;
    const result = await executeQuery(getMonthlyTotalsQuery, [
      userId,
      month,
      year,
    ]);
    return result[0] || { total_order_amount: 0, total_amount_paid: 0 };
  } catch (error) {
    console.error("Error executing monthly totals query:", error.message);
    throw new Error("Unable to fetch monthly totals.");
  }
};

const createTransactionForCOD = async (orderId, customer_id, amount) => {
  try {
    const query = `
      INSERT INTO transactions (order_id, customer_id ,amount, payment_gateway, payment_status, payment_date)
      VALUES (?, ?, ? ,'COD', 'pending', NOW())
    `;

    await executeQuery(query, [orderId, customer_id, amount]);

    console.log(`Transaction created for COD order with orderId: ${orderId}`);
  } catch (error) {
    console.error("Error creating transaction for COD order:", error.message);
    throw new Error("Error creating COD transaction.");
  }
};
const addUser = async (userDetails) => {
  try {
    // Check if user already exists
    const existingUser = await executeQuery(
      "SELECT * FROM users WHERE customer_id = ?",
      [userDetails.customer_id]
    );

    if (existingUser.length > 0) {
      throw new Error("User already exists");
    }

    // Hash the phone number as password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userDetails.phone, salt);

    // Insert new user
    const query = `
      INSERT INTO users (
        customer_id, 
        username, 
        name, 
        alias,
        password, 
        route,
        email,
        phone,
        delivery_address,
        gst_number,
        address_line1,
        address_line2,
        address_line3,
        address_line4,
        city,
        state,
        zip_code,
        role,
        status,
        created_at, 
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', UNIX_TIMESTAMP(), UNIX_TIMESTAMP())
    `;

    const values = [
      userDetails.customer_id,
      userDetails.username,
      userDetails.name,
      userDetails.alias || null,
      hashedPassword, // Using hashed phone number as password
      userDetails.route,
      userDetails.email,
      userDetails.phone,
      userDetails.delivery_address,
      userDetails.gst_number,
      userDetails.address_line1,
      userDetails.address_line2,
      userDetails.address_line3,
      userDetails.address_line4,
      userDetails.city,
      userDetails.state,
      userDetails.zip_code,
      userDetails.role || 'USER'
    ];

    const result = await executeQuery(query, values);

    // If user is not an admin, find and assign to admin based on route
    if (userDetails.role !== 'admin') {
      const findAdminQuery = `
        SELECT id FROM users 
        WHERE route = ? AND role = 'admin' 
        LIMIT 1
      `;
      const adminResult = await executeQuery(findAdminQuery, [userDetails.route]);

      if (adminResult.length > 0) {
        const adminId = adminResult[0].id;
        const insertAssignmentQuery = `
          INSERT INTO admin_assign (admin_id, customer_id, cust_id, assigned_date, status, route)
          VALUES (?, ?, ?, NOW(), 'assigned', ?)
        `;
        await executeQuery(insertAssignmentQuery, [
          adminId,
          userDetails.customer_id,
          userDetails.customer_id,
          userDetails.route
        ]);
      }
    }

    return result.insertId;
  } catch (error) {
    console.error("Error in addUser:", error);
    throw new Error("User creation failed: " + error.message);
  }
};


const getAllOrders = async (params) => {
  try {
    const {
      search = "",
      orderBy = "ASC", // Default order
      status = "ACTIVE", // Default status
      limit = 10,
      page = 1,
      category, // Category filter
      name, // Product name filter
      date, // Date filter (specific date)
    } = params;

    // Ensure limit and page are treated as numbers
    const numericLimit = Number(limit);
    const numericPage = Number(page);

    // Validate that limit and page are valid numbers
    if (isNaN(numericLimit) || numericLimit <= 0) {
      throw new Error("Invalid limit value. It must be a positive number.");
    }
    if (isNaN(numericPage) || numericPage <= 0) {
      throw new Error("Invalid page value. It must be a positive number.");
    }

    const offset = (numericPage - 1) * numericLimit;

    // Base query for orders, joining with users for customer details
    // Use GROUP_CONCAT to aggregate product details and SUM to calculate total amount from order_products
    let query = `
      SELECT o.id, o.placed_on, o.delivery_status, o.total_amount AS total_amount , o.approve_status AS approve_status, 
             u.name AS customer_name,
             GROUP_CONCAT(op.category SEPARATOR ', ') AS categories,
             GROUP_CONCAT(op.name SEPARATOR ', ') AS product_names,
             SUM(op.price * op.quantity) AS amount
      FROM orders o
      JOIN users u ON o.customer_id = u.customer_id
      JOIN order_products op ON o.id = op.order_id
      WHERE 1=1 `;

    const values = [];

    // Dynamically add search condition if `search` is provided
    if (search) {
      query += ` AND u.name LIKE ?`;
      values.push(`%${search}%`);
    }

    // Add category filter if provided
    if (category) {
      query += ` AND op.category = ?`;
      values.push(category);
    }

    // Add product name filter if provided
    if (name) {
      query += ` AND op.name LIKE ?`;
      values.push(`%${name}%`);
    }

    // Add date filter if provided
    if (date) {
      const startDate = new Date(date).setHours(0, 0, 0, 0) / 1000; // Start of the day (epoch time)
      const endDate = new Date(date).setHours(23, 59, 59, 999) / 1000; // End of the day (epoch time)
      query += ` AND o.placed_on BETWEEN ? AND ?`;
      values.push(startDate, endDate);
    }

    // Group by order id and dynamically add sorting and pagination
    query += ` GROUP BY o.id ORDER BY o.placed_on ${orderBy} LIMIT ? OFFSET ?`;
    values.push(numericLimit, offset);

    // Execute the query
    const orders = await executeQuery(query, values);
    console.log(`🪵 → orders:`, orders);

    // Count query for total orders (without any filters)
    let countQuery = `SELECT COUNT(DISTINCT o.id) AS count
                      FROM orders o
                      JOIN order_products op ON o.id = op.order_id
                      JOIN users u ON o.customer_id = u.customer_id
                      WHERE 1=1`;

    const countValues = [];

    const [countResult] = await executeQuery(countQuery, countValues);

    // Return both the filtered orders and the total count
    return { orders, count: countResult.count };
  } catch (error) {
    console.error("Error in getAllOrders dbUtility:", error);
    throw new Error("Failed to get all orders.");
  }
};

const setAmOrder = async (products) => {
  try {
    const query = `INSERT INTO am_order_products (product_id) VALUES ?`;

    const values = products.map((id) => [id]);
    const response = await executeQuery(query, [values]);
    return response;
  } catch (error) {
    console.error("Error in setAmOrder dbUtility:", error);
    throw new Error("Failed to set AM orders.");
  }
};

const getAllUsers = async (searchQuery) => {
  try {
    let query = "SELECT * FROM users";  // No role filter, fetch all users

    if (searchQuery) {
      query += ` WHERE name LIKE ?`;  // Apply search query if provided
    }

    const values = searchQuery ? [`%${searchQuery}%`] : [];
    const response = await executeQuery(query, values);
    return response;
  } catch (error) {
    console.error("Error in getAllUsers dbUtility:", error);
    throw new Error("Failed to get all users.");
  }
}


const addProduct = async (productData) => {
  try {
    const query = `
      INSERT INTO products (
        product_code,
        name, 
        brand, 
        category, 
        price, 
        discountPrice, 
        uom,
        created_at, 
        updated_at, 
        hsn_code, 
        gst_rate,
        alias,
        part_number,
        stock_group,
        type_of_supply,
        maintain_batches,
        stock_quantity,
        cost_price,
        auom,
        uom_qty,
        auom_qty
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      productData.product_code,
      productData.name,
      productData.brand,
      productData.category,
      productData.price,
      productData.discountPrice,
      productData.uom,
      productData.created_at,
      productData.updated_at,
      productData.hsn_code,
      productData.gst_rate,
      productData.alias,
      productData.part_number,
      productData.stock_group,
      productData.type_of_supply,
      productData.maintain_batches,
      productData.stock_quantity,
      productData.cost_price,
      productData.auom || null,
      productData.uom_qty || null,
      productData.auom_qty || null
    ];

    const response = await executeQuery(query, values);
   
    return response;
  } catch (error) {
    console.error("Error in addProduct dbUtility:", error);
    throw new Error("Failed to add product.");
  }
};


const changePassword = async (id, newPassword) => {
  try {
    const query = `SELECT customer_id FROM users WHERE customer_id = ?`;
    const [user] = await executeQuery(query, [id]);

    if (!user) {
      throw new Error("User not found.");
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updateQuery = `UPDATE users SET password = ?, updated_at = ? WHERE customer_id = ?`;
    await executeQuery(updateQuery, [
      hashedPassword,
      Math.floor(Date.now() / 1000),
      id,
    ]);

    return true;
  } catch (error) {
    console.error("Error in changePassword dbUtility:", error);
    throw new Error("Failed to change password.");
  }
};

const updateUser = async (customer_id, userDetails) => {
  try {
    // Check if user exists
    const existingUser = await executeQuery(
      "SELECT * FROM users WHERE customer_id = ?",
      [customer_id]
    );

    if (existingUser.length === 0) {
      throw new Error("User not found");
    }

    // Build update query dynamically based on provided fields
    let updateFields = [];
    let values = [];

    // List of fields that can be updated
    const allowedFields = [
      'username',
      'name',
      'alias',
      'route',
      'email',
      'phone',
      'delivery_address',
      'gst_number',
      'address_line1',
      'address_line2',
      'address_line3',
      'address_line4',
      'city',
      'state',
      'zip_code',
      'role'
    ];

    // Add fields to update if they are provided
    allowedFields.forEach(field => {
      if (userDetails[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        values.push(userDetails[field]);
      }
    });

    // Add updated_at timestamp
    updateFields.push('updated_at = UNIX_TIMESTAMP()');

    // Add customer_id to values array for WHERE clause
    values.push(customer_id);

    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE customer_id = ?
    `;

    const result = await executeQuery(query, values);
    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error in updateUser:", error);
    throw new Error("User update failed: " + error.message);
  }
};

const orderHistory = async (customerId, params) => {
  try {
    const { page = 1, limit = 10, orderBy = "ASC", type = null } = params;
    const offset = (page - 1) * Number(limit);

    let query = `
      SELECT o.id AS order_id, o.customer_id, o.order_type, o.placed_on, o.total_amount, o.delivery_status,
             op.product_id, op.quantity, op.price, op.name, op.category
      FROM orders o
      LEFT JOIN order_products op ON o.id = op.order_id
      WHERE o.customer_id = ?`;

    let values = [customerId];

    if (type) {
      query += ` AND o.order_type = ?`;
      values.push(type);
    }

    query += ` ORDER BY o.placed_on ${orderBy} LIMIT ? OFFSET ?`;
    values.push(Number(limit), Number(offset));

    let countQuery = `
      SELECT COUNT(DISTINCT o.id) AS count
      FROM orders o
      LEFT JOIN order_products op ON o.id = op.order_id
      WHERE o.customer_id = ?`;

    let countValues = [customerId];

    if (type) {
      countQuery += ` AND o.order_type = ?`;
      countValues.push(type);
    }

    const [response, countResponse] = await Promise.all([
      executeQuery(query, values),
      executeQuery(countQuery, countValues),
    ]);

    // Group products by order_id and format the response
    const groupedOrders = response.reduce((acc, order) => {
      const {
        order_id,
        customer_id,
        order_type,
        placed_on,
        total_amount,
        delivery_status,
        product_id,
        quantity,
        price,
        name,
        category,
      } = order;

      // Check if the order already exists in the accumulator
      let existingOrder = acc.find((o) => o.order_id === order_id);

      if (!existingOrder) {
        existingOrder = {
          order_id,
          customer_id,
          order_type,
          placed_on,
          total_amount,
          delivery_status,
          products: [],
        };
        acc.push(existingOrder);
      }

      // Add the product to the order's products array
      existingOrder.products.push({
        product_id,
        quantity,
        price,
        name,
        category,
      });

      return acc;
    }, []);

    return { response: groupedOrders, count: countResponse[0].count };
  } catch (error) {
    console.error("Error in orderHistory dbutility: ", error);
    throw new Error("Failed to get users orders.");
  }
};

const checkExistingOrder = async (customerId, orderDate, orderType) => {
  try {
    // Get the start and end of the day in UTC epoch time
    const startOfDay = new Date(orderDate);
    console.log(`🪵 → startOfDay:`, startOfDay);
    startOfDay.setHours(0, 0, 0, 0); // Start of the day (00:00:00)
    const startEpoch = Math.floor(startOfDay.getTime() / 1000); // Convert to epoch seconds

    const endOfDay = new Date(orderDate);
    console.log(`🪵 → endOfDay:`, endOfDay);
    endOfDay.setHours(23, 59, 59, 999); // End of the day (23:59:59)
    const endEpoch = Math.floor(endOfDay.getTime() / 1000); // Convert to epoch seconds

    // Query to check if an order exists for the given customerId, date range, and orderType
    const query = `
      SELECT id
      FROM orders
      WHERE customer_id = ?
        AND placed_on >= ?
        AND placed_on <= ?
        AND order_type = ?
      LIMIT 1
    `;

    // Execute the query with the appropriate parameters
    const result = await executeQuery(query, [
      customerId,
      startEpoch,
      endEpoch,
      orderType,
    ]);
    // If an order is found, return true (i.e., order already exists)
    return result.length > 0;
  } catch (error) {
    console.error("Error in checkExistingOrder:", error);
    throw new Error("Failed to check existing order.");
  }
};


const updateProduct = async (id, updateFields) => {
  try {
    // Validate id
    if (!id) {
      throw new Error("Product ID is required");
    }

    // Filter out undefined values and create clean update object
    const cleanUpdateFields = Object.entries(updateFields).reduce((acc, [key, value]) => {
      // Handle cost_price specifically - allow 0 as a valid value
      if (key === 'cost_price') {
        acc[key] = value;
      } else if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    // If no valid fields to update, return error
    if (Object.keys(cleanUpdateFields).length === 0) {
      throw new Error("No valid fields to update");
    }

    // Add updated_at timestamp
    cleanUpdateFields.updated_at = Math.floor(Date.now() / 1000);

    // Build the SET clause dynamically
    const setClause = Object.keys(cleanUpdateFields)
      .map(field => `${field} = ?`)
      .join(', ');

    const query = `
      UPDATE products 
      SET ${setClause}
      WHERE id = ?
    `;

    // Create values array with all update fields and the id
    const values = [...Object.values(cleanUpdateFields), id];

    const result = await executeQuery(query, values);

    if (result.affectedRows === 0) {
      return null;
    }

    // Return the updated fields along with the id
    return {
      id,
      ...cleanUpdateFields
    };
  } catch (error) {
    console.error("Error in productDbUtility updateProduct:", error);
    throw error;
  }
};

const toggleDeliveryStatus = async (customerId, orderId) => {
  try {
    // Update the delivery_status to 'delivered' for the given customerId and orderId
    const updateStatusQuery = `
      UPDATE orders
      SET delivery_status = 'delivered'
      WHERE customer_id = ? AND id = ?
    `;

    const result = await executeQuery(updateStatusQuery, [customerId, orderId]);

    if (result.affectedRows === 0) {
      throw new Error(
        `Order with ID ${orderId} not found for customer ${customerId}`
      );
    }

    return "Delivery status updated to 'delivered'";
  } catch (error) {
    console.error("Error in toggleDeliveryStatus:", error);
    throw new Error("Database update failed");
  }
};

const getAllDefectOrders = async () => {
  const query = `
    SELECT * FROM product_defects
  `;
  const response = await executeQuery(query, [reportId]);
  return response;
};

const getDefectReportByCustomerId = async (customer_id) => {
  const query = `
    SELECT * FROM product_defects WHERE customer_id = ?
  `;
  const defectOrders = await executeQuery(query, [customer_id]);
  return defectOrders;
};

const getDefectReportById = async (reportId) => {
  const query = `
    SELECT * FROM product_defects WHERE id = ?
  `;
  const [defectReport] = await executeQuery(query, [reportId]);
  return defectReport;
};

const updateOrderProducts = async (orderId, productId, defectiveQuantity) => {
  try {
    // Step 1: Fetch the current quantity of the product in the order
    const fetchQuantityQuery = `
      SELECT quantity
      FROM order_products
      WHERE order_id = ? AND product_id = ?
    `;
    const [result] = await executeQuery(fetchQuantityQuery, [
      orderId,
      productId,
    ]);

    if (!result) {
      return {
        success: false,
        message: `Product with ID ${productId} not found in the order ${orderId}`,
      };
    }

    const currentQuantity = result.quantity;

    // Step 2: Validate if the defective quantity is valid
    if (currentQuantity < defectiveQuantity) {
      return {
        success: false,
        message: `Reported defective quantity (${defectiveQuantity}) exceeds the available quantity (${currentQuantity}) for product ${productId}.`,
      };
    }

    // Step 3: If defective quantity is less than current quantity, update the quantity
    if (currentQuantity > defectiveQuantity) {
      const newQuantity = currentQuantity - defectiveQuantity;
      const updateQuantityQuery = `
        UPDATE order_products
        SET quantity = ? AND status = ?
        WHERE order_id = ? AND product_id = ?
      `;
      await executeQuery(updateQuantityQuery, [
        newQuantity,
        "approved",
        orderId,
        productId,
      ]);

      return {
        success: true,
        message: `Quantity for product ${productId} in order ${orderId} updated to ${newQuantity}.`,
      };
    }
    // Step 4: If the defective quantity equals the current quantity, delete the product
    else {
      const deleteProductQuery = `
        DELETE FROM order_products
        WHERE order_id = ? AND product_id = ?
      `;
      await executeQuery(deleteProductQuery, [orderId, productId]);

      return {
        success: true,
        message: `Product ${productId} removed from order ${orderId} as the defective quantity matches the total quantity.`,
      };
    }
  } catch (error) {
    console.error("Error in updateOrderProducts:", error);
    return {
      success: false,
      message: `An error occurred while updating the product in order ${orderId}: ${error.message}`,
    };
  }
};

// Function to update the total amount after defective products are processed
const updateOrderTotal = async (orderId) => {
  try {
    // Step 1: Fetch all remaining products and their prices for the order
    const fetchProductsQuery = `
      SELECT op.product_id, op.quantity, op.price
      FROM order_products op
      WHERE op.order_id = ?
    `;
    const remainingProducts = await executeQuery(fetchProductsQuery, [orderId]);

    if (!remainingProducts.length) {
      throw new Error(`No products found for order ${orderId}`);
    }

    // Step 2: Calculate the new total amount
    let newTotal = 0;
    remainingProducts.forEach((product) => {
      newTotal += product.quantity * product.price;
    });

    // Step 3: Update the total amount in the orders table
    const updateTotalQuery = `
      UPDATE orders
      SET total_amount = ?
      WHERE id = ?
    `;
    await executeQuery(updateTotalQuery, [newTotal, orderId]);

    return {
      success: true,
      message: `Order ${orderId} total updated to ${newTotal}.`,
    };
  } catch (error) {
    console.error("Error in updateOrderTotal:", error);
    return {
      success: false,
      message: `An error occurred while updating the order total: ${error.message}`,
    };
  }
};
const insertDefaultOrder = async (
  customerId,
  id,
  quantity,
  created_at,
  updated_at
) => {
  try {
    const query = `
      INSERT INTO default_orders (customer_id, product_id, quantity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?);
    `;
    const result = await executeQuery(query, [
      customerId,
      id,
      quantity,
      created_at,
      updated_at,
    ]);
    return result.insertId;
  } catch (error) {
    console.error("Error inserting default order:", error);
    throw new Error("Database insertion failed for default_orders");
  }
};

const resetPassword = async (phone, newPassword) => {
  try {
    console.log("Resetting password for phone:", phone);
    
    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    console.log("Password hashing details:");
    console.log("New password:", newPassword);
    console.log("Salt:", salt);
    console.log("Hashed password:", hashedPassword);

    // Update the password
    const query = `
      UPDATE users 
      SET password = ?,
          updated_at = UNIX_TIMESTAMP()
      WHERE phone = ?
    `;

    const result = await executeQuery(query, [hashedPassword, phone]);
    
    if (result.affectedRows === 0) {
      throw new Error("User not found");
    }

    console.log("Password reset successful");
    return true;
  } catch (error) {
    console.error("Error in resetPassword:", error);
    throw new Error("Password reset failed: " + error.message);
  }
};

const getAdminAssignments = async (customerId) => {
  try {
    const query = `
      SELECT aa.*, u.username as admin_name, u.phone as admin_phone
      FROM admin_assign aa
      JOIN users u ON aa.admin_id = u.id
      WHERE aa.customer_id = ?
    `;
    
    const assignments = await executeQuery(query, [customerId]);
    return assignments;
  } catch (error) {
    console.error("Error in getAdminAssignments:", error);
    throw new Error("Failed to get admin assignments: " + error.message);
  }
};

const addSalesman = async (salesmanDetails) => {
  try {
    // Check if salesman already exists
    const existingSalesman = await executeQuery(
      "SELECT * FROM users WHERE customer_id = ?",
      [salesmanDetails.customer_id]
    );

    if (existingSalesman.length > 0) {
      throw new Error("Salesman already exists");
    }

    // Hash the phone number as password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(salesmanDetails.phone || salesmanDetails.customer_id, salt);

    // Insert new salesman
    const query = `
      INSERT INTO users (
        customer_id, 
        username, 
        name, 
        phone,
        address_line1,
        designation,
        route,
        aadhar_number,
        pan_number,
        dl_number,
        notes,
        role,
        password,
        created_at, 
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, UNIX_TIMESTAMP(), UNIX_TIMESTAMP())
    `;

    const values = [
      salesmanDetails.customer_id,
      salesmanDetails.username,
      salesmanDetails.username, // Copy username to name field
      salesmanDetails.phone || null,
      salesmanDetails.address_line1 || null,
      salesmanDetails.designation || null,
      salesmanDetails.route || null,
      salesmanDetails.aadhar_number || null,
      salesmanDetails.pan_number || null,
      salesmanDetails.dl_number || null,
      salesmanDetails.notes || null,
      hashedPassword
    ];

    const result = await executeQuery(query, values);

    // If salesman has a route, find all users with same route and assign them
    if (salesmanDetails.route) {
      const findUsersQuery = `
        SELECT customer_id FROM users 
        WHERE route = ? AND role != 'admin'
      `;
      const usersResult = await executeQuery(findUsersQuery, [salesmanDetails.route]);

      if (usersResult.length > 0) {
        // Delete any existing assignments for these users
        const deleteExistingQuery = `
          DELETE FROM admin_assign 
          WHERE customer_id IN (?)
        `;
        await executeQuery(deleteExistingQuery, [usersResult.map(u => u.customer_id)]);

        // Insert new assignments for all users
        const insertAssignmentQuery = `
          INSERT INTO admin_assign (admin_id, customer_id, cust_id, assigned_date, status, route)
          VALUES (?, ?, ?, NOW(), 'assigned', ?)
        `;
        
        for (const user of usersResult) {
          await executeQuery(insertAssignmentQuery, [
            salesmanDetails.customer_id,
            user.customer_id,
            user.customer_id,
            salesmanDetails.route
          ]);
        }
      }
    }

    return result.insertId;
  } catch (error) {
    console.error("Error in addSalesman:", error);
    throw new Error("Salesman creation failed: " + error.message);
  }
};

const updateSalesman = async (customer_id, salesmanDetails) => {
  try {
    // Check if salesman exists
    const existingSalesman = await executeQuery(
      "SELECT * FROM users WHERE customer_id = ? AND role = 'admin'",
      [customer_id]
    );

    if (existingSalesman.length === 0) {
      throw new Error("Salesman not found");
    }

    // Build update query dynamically based on provided fields
    let updateFields = [];
    let values = [];

    // List of fields that can be updated
    const allowedFields = [
      'username',
      'name',
      'phone',
      'address_line1',
      'designation',
      'route',
      'aadhar_number',
      'pan_number',
      'dl_number',
      'notes'
    ];

    // Add fields to update if they are provided
    allowedFields.forEach(field => {
      if (salesmanDetails[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        values.push(salesmanDetails[field]);
      }
    });

    // Add updated_at timestamp
    updateFields.push('updated_at = UNIX_TIMESTAMP()');

    // Add customer_id to values array for WHERE clause
    values.push(customer_id);

    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE customer_id = ? AND role = 'admin'
    `;

    const result = await executeQuery(query, values);

    // If route is being updated, handle admin assignments
    if (salesmanDetails.route !== undefined) {
      // Find all users with the new route
      const findUsersQuery = `
        SELECT customer_id FROM users 
        WHERE route = ? AND role != 'admin'
      `;
      const usersResult = await executeQuery(findUsersQuery, [salesmanDetails.route]);

      if (usersResult.length > 0) {
        // Delete any existing assignments for these users
        const deleteExistingQuery = `
          DELETE FROM admin_assign 
          WHERE customer_id IN (?)
        `;
        await executeQuery(deleteExistingQuery, [usersResult.map(u => u.customer_id)]);

        // Insert new assignments for all users
        const insertAssignmentQuery = `
          INSERT INTO admin_assign (admin_id, customer_id, cust_id, assigned_date, status, route)
          VALUES (?, ?, ?, NOW(), 'assigned', ?)
        `;
        
        for (const user of usersResult) {
          await executeQuery(insertAssignmentQuery, [
            customer_id,
            user.customer_id,
            user.customer_id,
            salesmanDetails.route
          ]);
        }
      }
    }

    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error in updateSalesman:", error);
    throw new Error("Salesman update failed: " + error.message);
  }
};

module.exports = {
  isUserExists,
  findUserByUserName,
  findUserByPhone,
  getOrdersByCustomerId,
  getProducts,
  getUserById,
  getCustomerProductPrice,
  updateOrderTotalAmount,
  getOrder,
  getProductById,
  lastPMOrder,
  createOrder,
  addOrderProducts,
  createTransactionForCOD,
  getDailyTransactions,
  getMonthlyTotals,
  addUser,
  getAllOrders,
  setAmOrder,
  getAllUsers,
  addProduct,
  changePassword,
  updateUser,
  getProductss,
  orderHistory,
  checkExistingOrder,
  updateProduct,
  toggleDeliveryStatus,
  getDefectReportById,
  updateOrderProducts,
  updateOrderTotal,
  getAllDefectOrders,
  getDefectReportByCustomerId,
  insertDefaultOrder,
  resetPassword,
  getAdminAssignments,
  addSalesman,
  updateSalesman
};
