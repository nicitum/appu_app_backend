const adminService = require("../services/adminService");
const bcrypt = require("bcryptjs");
const dbUtility = require("../services/dbUtility");

exports.addUserController = async (req, res) => {
  try {
    const { 
      customer_id, 
      username, 
      name, 
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
      role
    } = req.body;

    // Validate required fields
    if (!customer_id || !username || !name || !password || !route || !email) {
      return res.status(400).json({
        status: false,
        message: "Required fields: customer_id, username, name, password, route, and email.",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: false,
        message: "Invalid email format.",
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare user data object with all fields
    const userData = {
      customer_id,
      username,
      name,
      password: hashedPassword,
      route,
      email,
      phone: phone || null,
      delivery_address: delivery_address || null,
      gst_number: gst_number || null,
      address_line1: address_line1 || null,
      address_line2: address_line2 || null,
      address_line3: address_line3 || null,
      address_line4: address_line4 || null,
      city: city || null,
      state: state || null,
      zip_code: zip_code || null,
      role: role || 'user' // Default role to 'user' if not specified
    };

    const addResult = await adminService.addUserService(userData);

    res.status(addResult.statusCode).send(addResult.response);
  } catch (error) {
    console.error("Error in addUserController:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

exports.getAllOrdersController = async (req, res) => {
  try {
    const params = req.query;

    const result = await adminService.getAllOrdersService(params);

    res.status(result.statusCode).send(result.response);
  } catch (error) {
    console.error("Error in getAllOrdersController:", error);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

exports.setAmOrderController = async (req, res) => {
  try {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || !products.length) {
      return res.status(400).json({
        status: false,
        message: "Not valid products",
      });
    }

    const result = await adminService.setAmOrderService(products);

    res.status(result.statusCode).send(result.response);
  } catch (error) {
    console.error("Error in setAmOrderController:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to set AM Order products.",
    });
  }
};

exports.getAllUsersController = async (req, res) => {
  try {
    const searchQuery = req.query.search || "";
    const getResponse = await adminService.getAllUsersService(searchQuery);

    res.status(getResponse.statusCode).send(getResponse.response);
  } catch (error) {
    console.error("Error in getAllUsersController:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get users.",
    });
  }
};

exports.addProductController = async (req, res) => {
  try {
    const { 
      name, 
      brand, 
      category, 
      price, 
      discountPrice, 
      uom,
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
      auom_qty,
      offers
    } = req.body;

    // Validate required fields
    if (!name || !category || !price || !brand) {
      return res.status(400).json({
        status: "error",
        message: "Required fields: name, category, price, and brand.",
      });
    }

    // Generate product code (you might want to implement your own logic for this)
    const product_code = req.body.product_code;

    const productData = {
      product_code,
      name,
      brand,
      category,
      price,
      discountPrice: discountPrice || null,
      uom: uom || "pkts", // Default to pkts if not provided
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      hsn_code: hsn_code || "",
      gst_rate: gst_rate || 0,
      alias: alias || null,
      part_number: part_number || null,
      stock_group: stock_group || null,
      type_of_supply: type_of_supply || null,
      maintain_batches: maintain_batches || 0,
      stock_quantity: stock_quantity || 0,
      cost_price: cost_price || 0,
      auom: auom || null,
      uom_qty: uom_qty || null,
      auom_qty: auom_qty || null,
      offers: offers || null
    };

    const addResponse = await adminService.addProductService(productData);

    res.status(addResponse.statusCode).send(addResponse.response);
  } catch (error) {
    console.error("Error in addProductController:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to add product.",
    });
  }
};

exports.updateUserController = async (req, res) => {
  try {
    const { customer_id } = req.query;
    if (!customer_id) {
      return res
        .status(401)
        .json({ status: false, message: "Unauthorized access" });
    }
    const result = await adminService.updateUserService(customer_id, req.body);
    res.status(result.statusCode).send(result.response);
  } catch (error) {
    console.error("Error in updateUser:", error);
    res.status(500).json({ status: false, message: "Failed to update user." });
  }
};

exports.updateProductController = async (req, res) => {
  try {
    const { id } = req.query;
    const updateFields = req.body;

    // Remove id from updateFields if it exists to prevent double updates
    delete updateFields.id;

    // Validate required fields
    if (!id) {
      return res.status(400).json({ 
        status: "error",
        message: "Product ID is required." 
      });
    }

    const updatedProduct = await adminService.updateProductService(id, updateFields);

    if (!updatedProduct) {
      return res.status(404).json({
        status: "error",
        message: "Product not found or update failed."
      });
    }

    res.status(200).json({
      status: "success",
      message: "Product updated successfully",
      data: updatedProduct
    });
  } catch (error) {
    console.error("Error in updateProduct controller:", error);
    res.status(500).json({ 
      status: "error",
      message: error.message 
    });
  }
};

exports.approveDefectReportController = async (req, res) => {
  const { reportId, orderId } = req.body;

  if (!reportId || !orderId) {
    return res
      .status(400)
      .json({ message: "Missing required fields: reportId, orderId" });
  }

  try {
    const result = await adminService.updateOrderAfterDefectApprovalService(
      reportId,
      orderId
    );

    return res.status(200).json({
      message:
        "Defective products approved and removed from the order successfully.",
      result,
    });
  } catch (error) {
    console.error("Error approving defect report:", error);
    return res.status(500).json({
      message: error.message,
    });
  }
};

// Add new controller for AUOM operations
exports.auomController = async (req, res) => {
  try {
    const { operation, name } = req.body;

    switch (operation.toLowerCase()) {
      case 'create':
        if (!name) {
          return res.status(400).json({
            status: "error",
            message: "AUOM name is required for creation"
          });
        }

        const createQuery = "INSERT INTO auom (name) VALUES (?)";
        const createResult = await dbUtility.executeQuery(createQuery, [name]);

        if (createResult.affectedRows > 0) {
          return res.status(200).json({
            status: "success",
            message: "AUOM created successfully",
            data: {
              id: createResult.insertId,
              name
            }
          });
        }
        break;

      case 'read':
        const readQuery = "SELECT id, name FROM auom ORDER BY name ASC";
        const auomList = await dbUtility.executeQuery(readQuery);

        return res.status(200).json({
          status: "success",
          message: "AUOM list fetched successfully",
          data: auomList
        });

      default:
        return res.status(400).json({
          status: "error",
          message: "Invalid operation. Use 'create' or 'read'"
        });
    }
  } catch (error) {
    console.error("Error in AUOM controller:", error);
    res.status(500).json({
      status: "error",
      message: error.message
    });
  }
};
