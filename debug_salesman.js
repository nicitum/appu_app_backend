const { executeQuery } = require("./dbUtils/db");

async function debugSalesmanAssignments() {
    try {
        console.log("=== DEBUGGING SALESMAN ASSIGNMENTS ===");
        
        // 1. Check if admin_assign table exists and has data
        console.log("\n1. Checking admin_assign table structure:");
        const tableStructure = await executeQuery("DESCRIBE admin_assign");
        console.log("admin_assign table structure:", tableStructure);
        
        // 2. Check existing assignments
        console.log("\n2. Checking existing assignments:");
        const existingAssignments = await executeQuery("SELECT * FROM admin_assign LIMIT 10");
        console.log("Existing assignments:", existingAssignments);
        
        // 3. Check users with routes
        console.log("\n3. Checking users with routes:");
        const usersWithRoutes = await executeQuery(`
            SELECT customer_id, username, route, role 
            FROM users 
            WHERE route IS NOT NULL AND route != '' 
            LIMIT 10
        `);
        console.log("Users with routes:", usersWithRoutes);
        
        // 4. Check admin users
        console.log("\n4. Checking admin users:");
        const adminUsers = await executeQuery(`
            SELECT id, customer_id, username, route, role 
            FROM users 
            WHERE role = 'admin' 
            LIMIT 10
        `);
        console.log("Admin users:", adminUsers);
        
        // 5. Test the assignment query with specific routes
        console.log("\n5. Testing assignment query with specific routes:");
        if (adminUsers.length > 0) {
            const testAdminId = adminUsers[0].id;
            const testAdminRoute = adminUsers[0].route;
            
            console.log(`Admin ID: ${testAdminId}`);
            console.log(`Admin route: "${testAdminRoute}"`);
            
            // Split the admin's routes
            const adminRoutes = testAdminRoute.split(',').map(r => r.trim());
            console.log(`Admin routes after split:`, adminRoutes);
            
            // Test each route
            for (const route of adminRoutes) {
                console.log(`\nTesting route: "${route}"`);
                
                const testUsersQuery = `
                    SELECT customer_id, username, route FROM users 
                    WHERE route = ? AND role != 'admin'
                `;
                const testUsers = await executeQuery(testUsersQuery, [route]);
                console.log(`Found ${testUsers.length} users for route "${route}":`, testUsers);
                
                // Also test with LIKE for partial matches
                const testUsersLikeQuery = `
                    SELECT customer_id, username, route FROM users 
                    WHERE route LIKE ? AND role != 'admin'
                `;
                const testUsersLike = await executeQuery(testUsersLikeQuery, [`%${route}%`]);
                console.log(`Found ${testUsersLike.length} users for route LIKE "%${route}%":`, testUsersLike);
            }
        }
        
        // 6. Test the exact logic from the salesman creation
        console.log("\n6. Testing exact salesman creation logic:");
        if (adminUsers.length > 0) {
            const testAdminId = adminUsers[0].id;
            const testAdminRoute = adminUsers[0].route;
            
            console.log(`Testing with admin ID: ${testAdminId}`);
            console.log(`Admin route string: "${testAdminRoute}"`);
            
            // Simulate the route processing from salesman creation
            let routeString = testAdminRoute;
            if (routeString) {
                const routes = routeString.split(',').map(r => r.trim());
                console.log(`Routes after split and trim:`, routes);
                
                for (const route of routes) {
                    console.log(`\nProcessing route: "${route}"`);
                    const findUsersQuery = `
                        SELECT customer_id FROM users 
                        WHERE route = ? AND role != 'admin'
                    `;
                    const usersResult = await executeQuery(findUsersQuery, [route]);
                    console.log(`Found ${usersResult.length} users for route "${route}":`, usersResult);
                }
            }
        }
        
        console.log("\n=== DEBUG COMPLETE ===");
        
    } catch (error) {
        console.error("Error in debug:", error);
    }
}

// Run the debug function
debugSalesmanAssignments().then(() => {
    console.log("Debug script completed");
    process.exit(0);
}).catch(error => {
    console.error("Debug script failed:", error);
    process.exit(1);
}); 