const express = require('express')
const sql = require("mssql");
const dotenv = require("dotenv");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const { withJWT } = require('./utils');

const app = express()

app.use(express.json());
app.use(cors());

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const config = {
  user: process.env.SERVER_ADMIN_LOGIN,
  password: process.env.SERVER_ADMIN_PASSWORD,
  server: process.env.SERVER_URL,
  database: process.env.DATABASE_NAME,
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    connectTimeout: 30000,
  },
};



app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  let connection = undefined;
  try {
    connection = await sql.connect(config);

    const result = await sql.query`SELECT * FROM Users WHERE Email = ${email}`;
    if (!result.recordset[0]) {
      res.status(401).send('Invalid email or password');
      return;
    }
    const user = result.recordset[0];
    const passwordHash = user.PasswordHash;

    const isPasswordValid = await bcrypt.compare(password, passwordHash);
    if (!isPasswordValid) {
      console.log('isPasswordValid');

      res.status(401).send('Invalid email or password');
      return;
    }

    const token = jwt.sign({ email: user.Email, id: user.UserID }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });

  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error');
  } finally {
    await connection?.close();
  }
})

app.get('/test-jwt', async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json(decoded);
  } catch (err) {
    res.status(401).send('Invalid token');
  }
})

app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).send('Missing required fields');
    return;
  }

  let connection = undefined;
  try {
    connection = await sql.connect(config);
    const result = await sql.query`SELECT * FROM Users WHERE Email = '${email}'`;

    if (result.recordset[0]) {
      res.status(400).send('Username already exists');
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await sql.query`INSERT INTO Users (Username, Email, PasswordHash) VALUES (${email}, ${email}, ${hashedPassword})`;
    res.send('User registered successfully');
    return;
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal server error');
    return;
  } finally {
    await connection?.close();
  }
})

app.get('/reset-db', withJWT, async (req, res) => {

  let connection = undefined;
  try {
    connection = await sql.connect(config);
    const result = await sql.query`DELETE FROM Users`;
    res.send('Database reset successfully');
  } catch (err) {
    console.error(err);
  } finally {
    await connection?.close();
  }
})



module.exports = app;