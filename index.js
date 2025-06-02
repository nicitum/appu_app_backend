const express = require('express');
const cors = require('cors');
const session = require('express-session');
const bodyParser = require('body-parser');
const userRouter = require('./routes/user');
const orderRouter = require('./routes/order');
const adminRouter = require('./routes/admin');
const generalRouter = require('./routes/generalRoutes');
const worldline = require('./routes/worldline');
const adminAssignRoutes = require('./routes/adminassign');
const action = require('./routes/action');
const path = require('path');

const app = express();
app.use('/images/salesman', express.static(path.join(__dirname, 'uploads/salesman')));
// Session middleware
app.use(
  session({
    secret: 'APPU123', // Replace with a strong, secure secret in production
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true }, // Set secure: true in production with HTTPS
  })
);


// CORS configuration
const corsOptions = {
  origin: [
    'http://147.93.110.150',
    'http://147.93.110.150:8091', // Frontend origin (adjust port if needed, e.g., :3000)
    'http://localhost:5173',
    'http://localhost:5174', // For local development
    'http://127.0.0.1:5173', // For local development
    'http://147.93.110.150:3001', // Additional frontend origin if applicable
    'http://localhost:8081',
    'http://localhost:8082',
    //  // Additional local origin
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 204,
};

// Apply CORS middleware
app.use(cors(corsOptions));


// Body-parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Remove custom CORS middleware to avoid conflicts
// If you need custom logic, integrate it into corsOptions

// Routes
app.get('/', (req, res) => {
  res.send('Homepage');
});

app.use('/', userRouter);
app.use('/', orderRouter);
app.use('/', adminRouter);
app.use('/', generalRouter);
app.use('/', adminAssignRoutes);
app.use('/', action);
app.use('/', worldline);



app.get('/s', (req, res) => {
  res.send('Secured page.');
});

// Start server
const PORT = process.env.PORT || 8091;
app.listen(PORT, async () => {
  try {
    console.log('Connected to database');
  } catch (err) {
    console.log('Database connection error:', err.message);
  }
  console.log(`Server is running on http://localhost:${PORT}`);
});